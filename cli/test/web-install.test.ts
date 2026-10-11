import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource, localCatalogSource, type CatalogSource } from '../src/catalog.ts';
import type { RunView, SummaryView, ViewState } from '../src/web-protocol.ts';
import { fakeGitHub } from './github.ts';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_MCPS, catalogDir, choose, pick, run, writeTree, type Page } from './harness.ts';

const BOTH_HOSTS = ['claude', 'codex'];
const CLAUDE_SKILLS = '.claude/skills';
const CODEX_SKILLS = '.agents/skills';
// 给用户看的位置：主目录写成 ~
const shown = (...segments: string[]): string => join('~', ...segments);
// 主目录里一个本工具装的 skill：有安装标记
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# 旧的 ${name}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T08:00:00.000Z' }),
});

// 两个样例 skill 各归一个用途：alpha 在「联网搜索与文档检索」下，beta-pack 在「开发工作流与规范」下
const WEB_SEARCH = '联网搜索与文档检索';
const DEV_WORKFLOW = '开发工作流与规范';
const twoPurposes = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, skillPurposes: { alpha: 'web-search', 'beta-pack': 'dev-workflow' } } });
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
// 换到左栏上名字是它的那一行的列表
const open = async (page: Page, name: string): Promise<ViewState> => {
  const row = page.state().menu.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`左栏里没有「${name}」`);
  await page.send({ type: 'open', list: row.id });
  return page.until((state) => state.listing?.id === row.id);
};
// 勾上（或去掉）一个本仓库的 skill，给出之后的画面状态
const tick = async (page: Page, name: string, on = true): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'skill', name, on });
  return page.until((state) => state.selected.some((entry) => entry.name === name) === on);
};
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
// 要汇总，给出汇总
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
// 确认安装（带回这份汇总的标识），等到这一批装完，给出结果
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 这一批每一行的结局，写成一行字
const outcomes = (batch: RunView | undefined): string[] => (batch?.rows ?? []).map((row) => [row.name, row.host, row.text, row.rest].filter(Boolean).join(' '));
const totals = (batch: RunView | undefined): string =>
  batch?.totals ? [batch.totals.succeeded, batch.totals.failed, batch.totals.skipped].map(({ count, word }) => `${count} ${word}`).join(' · ') : '';
// 一个目录下的全部文件：相对路径 → 内容。安装标记里的安装时间每次不同，抹掉
const tree = (dir: string, prefix = ''): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(dir, prefix), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .flatMap((entry): [string, string][] => {
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) return Object.entries(tree(dir, path));
        const content = readFileSync(join(dir, path), 'utf8');
        return [[path, entry.name === '.oxy-tools.json' ? JSON.stringify({ ...(JSON.parse(content) as object), installedAt: '' }) : content]];
      }),
  );
const selected = (state: ViewState): string[] => state.selected.map((entry) => entry.name);
// 正在看的那张列表里勾上了的条目
const ticked = (state: ViewState): string[] =>
  (state.listing?.sections ?? []).flatMap((section) => section.entries.filter((entry) => entry.picked).map((entry) => entry.name));

describe('网页界面：勾选与已选', () => {
  it('在不同用途下各勾一个：换用途时之前勾的还在，已选照勾选的先后', async () => {
    let state: ViewState | undefined;
    let back: ViewState | undefined;
    await run({
      catalog: twoPurposes(),
      page: async (page) => {
        await open(page, DEV_WORKFLOW);
        await tick(page, 'beta-pack');
        await open(page, WEB_SEARCH);
        state = await tick(page, 'alpha');
        back = await open(page, DEV_WORKFLOW);
        await done(page);
      },
    });

    expect(state?.selected).toEqual([
      { kind: 'skill', name: 'beta-pack', type: 'Skill' },
      { kind: 'skill', name: 'alpha', type: 'Skill' },
    ]);
    expect(state && ticked(state)).toEqual(['alpha']);
    expect(back && ticked(back)).toEqual(['beta-pack']);
    expect(back && selected(back)).toEqual(['beta-pack', 'alpha']);
  });

  it('一个条目同时在「推荐」和它的用途下：一处勾了，另一处也是勾上的；在已选里去掉，两处都没了', async () => {
    let inPurpose: ViewState | undefined;
    let removed: ViewState | undefined;
    let inRecommended: ViewState | undefined;
    await run({
      catalog: twoPurposes(),
      page: async (page) => {
        await tick(page, 'alpha');
        inPurpose = await open(page, WEB_SEARCH);
        removed = await tick(page, 'alpha', false);
        inRecommended = await open(page, '推荐');
        await done(page);
      },
    });

    expect(inPurpose && ticked(inPurpose)).toEqual(['alpha']);
    expect(removed && selected(removed)).toEqual([]);
    expect(removed && ticked(removed)).toEqual([]);
    expect(inRecommended && ticked(inRecommended)).toEqual([]);
  });

  it('勾不上的不照办：不可选的条目、目录里没有的名字、现在勾不上的类型；已选不变', async () => {
    const statuses: Record<string, number> = {};
    let after: ViewState | undefined;
    await run({
      // 一个宿主都没检测到：本仓库的 skill 都不可选
      onPath: [],
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS } }),
      page: async (page) => {
        statuses['不可选'] = await post(page, { type: 'pick', kind: 'skill', name: 'alpha', on: true });
        statuses['没有这个名字'] = await post(page, { type: 'pick', kind: 'skill', name: 'nowhere', on: true });
        statuses['MCP'] = await post(page, { type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        statuses['没有 on'] = await post(page, { type: 'pick', kind: 'skill', name: 'alpha' });
        after = await page.reload();
        await done(page);
      },
    });

    expect(statuses).toEqual({ 不可选: 400, 没有这个名字: 400, MCP: 400, '没有 on': 400 });
    expect(after?.selected).toEqual([]);
  });

  it('页面只发条目的名字和选项：意图里带了命令、路径之类的东西一律不认，整个不照办', async () => {
    const statuses: number[] = [];
    let after: ViewState | undefined;
    await run({
      page: async (page) => {
        for (const extra of [{ command: 'touch pwned' }, { path: '/tmp/pwned' }, { args: ['-rf'] }]) {
          statuses.push(await post(page, { type: 'pick', kind: 'skill', name: 'alpha', on: true, ...extra }));
        }
        // 别的意图也一样：多带了东西就不认
        statuses.push(await post(page, { type: 'review', command: 'touch pwned' }));
        statuses.push(await post(page, { type: 'lang', lang: 'en', path: '/tmp/pwned' }));
        after = await page.reload();
        // 不多带的照办：证明上面被拒绝的是多带的那样东西
        statuses.push(await post(page, { type: 'pick', kind: 'skill', name: 'alpha', on: true }));
        await done(page);
      },
    });

    expect(statuses).toEqual([400, 400, 400, 400, 400, 204]);
    expect(after?.selected).toEqual([]);
    expect(after?.lang).toBe('zh');
    expect(after).not.toHaveProperty('summary');
  });

  it('换语言后勾选不变', async () => {
    let english: ViewState | undefined;
    await run({
      page: async (page) => {
        await tick(page, 'beta-pack');
        await page.send({ type: 'lang', lang: 'en' });
        english = await page.until((state) => state.lang === 'en');
        await done(page);
      },
    });

    expect(english?.selected).toEqual([{ kind: 'skill', name: 'beta-pack', type: 'Skill' }]);
    expect(english && ticked(english)).toEqual(['beta-pack']);
  });
});

describe('网页界面：汇总', () => {
  it('已选为空时去不了汇总', async () => {
    let status: number | undefined;
    let after: ViewState | undefined;
    await run({
      page: async (page) => {
        status = await post(page, { type: 'review' });
        after = await page.reload();
        await done(page);
      },
    });

    expect(status).toBe(400);
    expect(after).not.toHaveProperty('summary');
  });

  it('每个 skill 在每个宿主下一行，带位置和操作；标题数的是条目；全是新装时没有提醒', async () => {
    let summary: SummaryView | undefined;
    await run({
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await tick(page, 'beta-pack');
        await tick(page, 'alpha');
        summary = await review(page);
        await done(page);
      },
    });

    expect(summary).toEqual({
      id: expect.any(String),
      title: '将安装 2 项',
      // 照名字，不照勾选的先后：和终端界面执行的先后一样
      entries: [
        {
          name: 'alpha',
          type: 'Skill',
          version: '1.0.0',
          rows: [
            { host: 'Claude Code', action: '新装', location: shown('.claude', 'skills', 'alpha') },
            { host: 'Codex', action: '新装', location: shown('.agents', 'skills', 'alpha') },
          ],
        },
        {
          name: 'beta-pack',
          type: 'Skill',
          version: '2.3',
          rows: [
            { host: 'Claude Code', action: '新装', location: shown('.claude', 'skills', 'beta-pack') },
            { host: 'Codex', action: '新装', location: shown('.agents', 'skills', 'beta-pack') },
          ],
        },
      ],
      notices: [],
      revise: '返回修改',
      install: '开始安装',
    });
  });

  it('更新与覆盖：重装、版本不同、非本工具安装各有备注，有会覆盖的就有那句提醒；非本工具安装的要逐项决定，缺省没同意', async () => {
    let summary: SummaryView | undefined;
    await run({
      onPath: BOTH_HOSTS,
      home: {
        ...installed(CLAUDE_SKILLS, 'alpha', '1.0.0'),
        [`${CODEX_SKILLS}/alpha/SKILL.md`]: '用户自己放的',
        ...installed(CLAUDE_SKILLS, 'beta-pack', '2.0'),
      },
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        summary = await review(page);
        await done(page);
      },
    });

    expect(summary?.entries).toEqual([
      {
        name: 'alpha',
        type: 'Skill',
        version: '1.0.0',
        rows: [
          { host: 'Claude Code', action: '覆盖', overwrites: true, location: shown('.claude', 'skills', 'alpha'), note: '重装 1.0.0' },
          {
            host: 'Codex',
            action: '覆盖',
            overwrites: true,
            location: shown('.agents', 'skills', 'alpha'),
            note: '非本工具安装',
            overwrite: { id: expect.any(String), agreed: false },
          },
        ],
      },
      {
        name: 'beta-pack',
        type: 'Skill',
        version: '2.3',
        rows: [
          { host: 'Claude Code', action: '覆盖', overwrites: true, location: shown('.claude', 'skills', 'beta-pack'), note: '2.0 → 2.3' },
          { host: 'Codex', action: '新装', location: shown('.agents', 'skills', 'beta-pack') },
        ],
      },
    ]);
    expect(summary?.notices).toEqual(['覆盖即整目录替换，目录内的本地改动会丢失']);
  });

  it('返回修改：回到浏览，勾选还在；英文界面下汇总是英文', async () => {
    let summary: SummaryView | undefined;
    let back: ViewState | undefined;
    await run({
      argv: ['--lang', 'en'],
      page: async (page) => {
        await tick(page, 'alpha');
        summary = await review(page);
        await page.send({ type: 'revise' });
        back = await page.until((state) => state.summary === undefined);
        await done(page);
      },
    });

    expect(summary).toMatchObject({ title: 'Install 1 item', revise: 'Go back and change', install: 'Install' });
    expect(summary?.entries[0]?.rows).toEqual([{ host: 'Claude Code', action: 'new', location: shown('.claude', 'skills', 'alpha') }]);
    expect(back && selected(back)).toEqual(['alpha']);
    expect(back && ticked(back)).toEqual(['alpha']);
  });
});

describe('网页界面：装本仓库的 skill', () => {
  it('跨两个用途各勾一个，一次装上：主目录里的东西和终端界面装同样的东西装出来的一样', async () => {
    let results: RunView | undefined;
    const web = await run({
      catalog: twoPurposes(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'alpha');
        await open(page, DEV_WORKFLOW);
        await tick(page, 'beta-pack');
        results = await install(page, await review(page));
        await done(page);
      },
    });
    const terminal = await run({ catalog: twoPurposes(), answers: [choose('推荐'), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')] });

    expect(Object.keys(tree(web.home))).toEqual([
      '.claude/skills/alpha/.oxy-tools.json',
      '.claude/skills/alpha/SKILL.md',
      '.claude/skills/alpha/references/guide.md',
      '.claude/skills/beta-pack/.oxy-tools.json',
      '.claude/skills/beta-pack/SKILL.md',
    ]);
    expect(tree(web.home)).toEqual(tree(terminal.home));
    expect(readdirSync(web.tmp)).toEqual([]);
    expect(outcomes(results)).toEqual(['alpha Claude Code 已安装 1.0.0', 'beta-pack Claude Code 已安装 2.3']);
    expect(web.exitCode).toBe(0);
  });

  it('进度推给页面：起初每一项都在等待，轮到的那一项正在下载，装完是结果和合计', async () => {
    let waiting: ViewState | undefined;
    let running: ViewState | undefined;
    let results: RunView | undefined;
    await run({
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        const summary = await review(page);
        const started = page.until((state) => state.run !== undefined && state.run.rows.every((row) => row.state === 'waiting'));
        const downloading = page.until((state) => state.run?.rows.some((row) => row.state === 'running') ?? false);
        results = await install(page, summary);
        [waiting, running] = await Promise.all([started, downloading]);
        await done(page);
      },
    });

    expect(waiting).not.toHaveProperty('summary');
    expect(waiting?.run).toMatchObject({
      title: '正在安装',
      done: false,
      rows: [
        { name: 'alpha', host: 'Claude Code', state: 'waiting', text: '等待' },
        { name: 'beta-pack', host: 'Claude Code', state: 'waiting', text: '等待' },
      ],
    });
    expect(waiting?.run).not.toHaveProperty('totals');
    expect(running?.run?.rows).toEqual([
      { name: 'alpha', host: 'Claude Code', state: 'running', text: '正在下载' },
      { name: 'beta-pack', host: 'Claude Code', state: 'waiting', text: '等待' },
    ]);
    expect(results).toEqual({
      title: '结果',
      done: true,
      rows: [
        { name: 'alpha', host: 'Claude Code', state: 'succeeded', text: '已安装', rest: '1.0.0' },
        { name: 'beta-pack', host: 'Claude Code', state: 'succeeded', text: '已安装', rest: '2.3' },
      ],
      totals: { label: '合计', succeeded: { count: 2, word: '成功' }, failed: { count: 0, word: '失败' }, skipped: { count: 0, word: '跳过' } },
    });
  });

  it('继续挑选：回到浏览，已选清空，刚装上的已经是「已装」；原先是别的版本的，结果里写两个版本', async () => {
    let results: RunView | undefined;
    let after: ViewState | undefined;
    await run({
      home: installed(CLAUDE_SKILLS, 'beta-pack', '2.0'),
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        results = await install(page, await review(page));
        await page.send({ type: 'continue' });
        after = await page.until((state) => state.run === undefined);
        await done(page);
      },
    });

    expect(outcomes(results)).toEqual(['alpha Claude Code 已安装 1.0.0', 'beta-pack Claude Code 已安装 2.0 → 2.3']);
    expect(after?.selected).toEqual([]);
    expect(after && ticked(after)).toEqual([]);
    const statuses = Object.fromEntries((after?.listing?.sections ?? []).flatMap((section) => section.entries.map((entry) => [entry.name, entry.statuses])));
    expect(statuses).toEqual({
      alpha: [{ host: 'Claude Code', text: '已装', tone: 'ready', rest: '1.0.0' }],
      'beta-pack': [{ host: 'Claude Code', text: '已装', tone: 'ready', rest: '2.3' }],
    });
  });

  it('英文界面下进度和结果是英文', async () => {
    let results: RunView | undefined;
    await run({
      argv: ['--lang', 'en'],
      page: async (page) => {
        await tick(page, 'alpha');
        results = await install(page, await review(page));
        await done(page);
      },
    });

    expect(results?.title).toBe('Results');
    expect(outcomes(results)).toEqual(['alpha Claude Code installed 1.0.0']);
    expect(totals(results)).toBe('1 succeeded · 0 failed · 0 skipped');
  });
});

describe('网页界面：不是本工具装的目录逐项决定', () => {
  // 用户自己放的目录，没有安装标记
  const existing = { [`${CLAUDE_SKILLS}/alpha/SKILL.md`]: '装之前就有的内容', [`${CLAUDE_SKILLS}/alpha/notes.md`]: '用户自己的笔记' };

  it('缺省不覆盖：没同意的那一项不装，目录原样，结果里写明跳过；其余照常', async () => {
    let results: RunView | undefined;
    const result = await run({
      home: existing,
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        results = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(results)).toEqual(['alpha Claude Code 跳过 未同意覆盖，保持原样', 'beta-pack Claude Code 已安装 2.3']);
    expect(totals(results)).toBe('1 成功 · 0 失败 · 1 跳过');
    // 没有没装上的，就没有「下一步」那一段
    expect(results).not.toHaveProperty('next');
    expect(tree(join(result.home, CLAUDE_SKILLS, 'alpha'))).toEqual({ 'SKILL.md': '装之前就有的内容', 'notes.md': '用户自己的笔记' });
    expect(existsSync(join(result.home, CLAUDE_SKILLS, 'beta-pack', 'SKILL.md'))).toBe(true);
  });

  it('同意后覆盖：整目录替换，有了安装标记；汇总里那一项写着已同意', async () => {
    let agreed: SummaryView | undefined;
    let results: RunView | undefined;
    const result = await run({
      home: existing,
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        const item = summary.entries[0]?.rows[0]?.overwrite?.id ?? '';
        await page.send({ type: 'overwrite', item, on: true });
        agreed = (await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true)).summary;
        results = await install(page, agreed as SummaryView);
        await done(page);
      },
    });

    expect(agreed?.entries[0]?.rows[0]).toMatchObject({ note: '非本工具安装', overwrite: { agreed: true } });
    expect(outcomes(results)).toEqual(['alpha Claude Code 已安装 1.0.0']);
    expect(Object.keys(tree(join(result.home, CLAUDE_SKILLS, 'alpha')))).toEqual(['.oxy-tools.json', 'SKILL.md', 'references/guide.md']);
    expect(readFileSync(join(result.home, CLAUDE_SKILLS, 'alpha', 'SKILL.md'), 'utf8')).toBe(SAMPLE_FILES['skills/alpha/SKILL.md']);
  });

  it('每次进汇总都从不覆盖起：同意之后返回修改，再回到汇总，那一项又是没同意的', async () => {
    let again: SummaryView | undefined;
    await run({
      home: existing,
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        await page.send({ type: 'overwrite', item: summary.entries[0]?.rows[0]?.overwrite?.id ?? '', on: true });
        await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true);
        await page.send({ type: 'revise' });
        await page.until((state) => state.summary === undefined);
        again = await review(page);
        await done(page);
      },
    });

    expect(again?.entries[0]?.rows[0]?.overwrite).toMatchObject({ agreed: false });
    expect(again).not.toHaveProperty('renewed');
  });

  it('要决定的那一项不在这份汇总里：不照办', async () => {
    const statuses: number[] = [];
    await run({
      home: existing,
      page: async (page) => {
        await tick(page, 'beta-pack');
        await review(page);
        statuses.push(await post(page, { type: 'overwrite', item: 'skill:alpha:claude-code', on: true }));
        statuses.push(await post(page, { type: 'overwrite', item: 'nowhere', on: true }));
        await done(page);
      },
    });

    expect(statuses).toEqual([400, 400]);
  });
});

describe('网页界面：展示的和执行的是同一份', () => {
  it('带着旧标识的确认不装：改了覆盖的决定之后，拿改之前那份汇总的标识去确认', async () => {
    let renewed: ViewState | undefined;
    const result = await run({
      home: { [`${CLAUDE_SKILLS}/alpha/SKILL.md`]: '装之前就有的内容' },
      page: async (page) => {
        await tick(page, 'alpha');
        const stale = await review(page);
        const item = stale.entries[0]?.rows[0]?.overwrite?.id ?? '';
        await page.send({ type: 'overwrite', item, on: true });
        const current = (await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true)).summary;
        expect(current?.id).not.toBe(stale.id);
        await page.send({ type: 'install', summary: stale.id });
        renewed = await page.until((state) => state.summary?.renewed === true);
        await done(page);
      },
    });

    expect(renewed).not.toHaveProperty('run');
    expect(renewed?.summary?.entries[0]?.rows[0]?.overwrite).toMatchObject({ agreed: true });
    expect(readFileSync(join(result.home, CLAUDE_SKILLS, 'alpha', 'SKILL.md'), 'utf8')).toBe('装之前就有的内容');
  });

  it('汇总之后机器上的状态变了：不装，改发新的汇总；拿新的标识再确认才装', async () => {
    let first: SummaryView | undefined;
    let renewed: SummaryView | undefined;
    let untouched: Record<string, string> | undefined;
    let results: RunView | undefined;
    const result = await run({
      page: async (page, { home }) => {
        await tick(page, 'alpha');
        first = await review(page);
        // 看着汇总的时候，那个位置上多了一个不是本工具装的目录
        writeTree(home, { [`${CLAUDE_SKILLS}/alpha/SKILL.md`]: '别处刚放进来的' });
        await page.send({ type: 'install', summary: first.id });
        renewed = (await page.until((state) => state.summary?.renewed === true)).summary;
        untouched = tree(join(home, CLAUDE_SKILLS));
        // 新的一份里这一项要逐项决定，缺省不覆盖：照它确认，这一项跳过
        results = await install(page, renewed as SummaryView);
        await done(page);
      },
    });

    expect(first?.entries[0]?.rows).toEqual([{ host: 'Claude Code', action: '新装', location: shown('.claude', 'skills', 'alpha') }]);
    expect(renewed?.id).not.toBe(first?.id);
    expect(renewed?.entries[0]?.rows).toEqual([
      { host: 'Claude Code', action: '覆盖', overwrites: true, location: shown('.claude', 'skills', 'alpha'), note: '非本工具安装', overwrite: { id: expect.any(String), agreed: false } },
    ]);
    expect(untouched).toEqual({ 'alpha/SKILL.md': '别处刚放进来的' });
    expect(outcomes(results)).toEqual(['alpha Claude Code 跳过 未同意覆盖，保持原样']);
    expect(tree(join(result.home, CLAUDE_SKILLS))).toEqual({ 'alpha/SKILL.md': '别处刚放进来的' });
  });

  it('换语言不换标识：看着中文的汇总换成英文，拿原来的标识确认照样装', async () => {
    let english: SummaryView | undefined;
    let chinese: SummaryView | undefined;
    let results: RunView | undefined;
    await run({
      page: async (page) => {
        await tick(page, 'alpha');
        chinese = await review(page);
        await page.send({ type: 'lang', lang: 'en' });
        english = (await page.until((state) => state.lang === 'en')).summary;
        results = await install(page, chinese);
        await done(page);
      },
    });

    expect(english?.title).toBe('Install 1 item');
    expect(english?.id).toBe(chinese?.id);
    expect(outcomes(results)).toEqual(['alpha Claude Code installed 1.0.0']);
  });

  it('画面状态里没有命令、也没有主目录的绝对路径：汇总、进度、结果都一样', async () => {
    const seen: string[] = [];
    const result = await run({
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        seen.push(JSON.stringify(page.state()));
        await install(page, summary);
        seen.push(JSON.stringify(page.state()));
        await done(page);
      },
    });

    for (const state of seen) {
      expect(state).not.toMatch(/"command"|"args"|"steps"/);
      expect(state).not.toContain(result.home);
    }
  });
});

describe('网页界面：装不上的时候', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('一项失败不影响其余：失败的写明原因，其余照常装上；单项失败不改变退出状态', async () => {
    let results: RunView | undefined;
    const result = await run({
      // alpha 的内容里没有 SKILL.md
      catalog: catalogDir({ content: { 'skills/alpha/README.md': '少了入口文件', 'skills/beta-pack/SKILL.md': '# beta-pack\n' } }),
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        results = await install(page, await review(page));
        await done(page);
      },
    });

    expect(results?.rows).toEqual([
      { name: 'alpha', host: 'Claude Code', state: 'failed', text: '失败', rest: '来源里没有 SKILL.md，目标目录未改动' },
      { name: 'beta-pack', host: 'Claude Code', state: 'succeeded', text: '已安装', rest: '2.3' },
    ]);
    expect(totals(results)).toBe('1 成功 · 1 失败 · 0 跳过');
    expect(results?.next).toEqual({ label: '下一步', lines: ['没装上的各项没有改动原有的东西。排除原因后点「继续挑选」，重新勾选再装一次。'] });
    expect(readdirSync(join(result.home, CLAUDE_SKILLS))).toEqual(['beta-pack']);
    expect(readdirSync(result.tmp)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('向 GitHub 查询失败：页面上有出错说明，本仓库的 skill 一个都不装，安装器不退出、还能接着挑', async () => {
    fakeGitHub({
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json(
              { message: 'API rate limit exceeded' },
              { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 37 * 60) } },
            )
          : undefined,
    });
    let results: RunView | undefined;
    let after: ViewState | undefined;
    const result = await run({
      catalog: githubCatalogSource(),
      page: async (page) => {
        await tick(page, 'alpha');
        await tick(page, 'beta-pack');
        results = await install(page, await review(page));
        await page.send({ type: 'continue' });
        after = await tick(page, 'alpha');
        await done(page);
      },
    });

    expect(results).toEqual({
      title: '结果',
      done: true,
      failure: {
        title: '出错：GitHub 限流',
        cause: { label: '原因', text: '未登录的查询每小时限 60 次，约 37 分钟后恢复' },
        next: { label: '下一步', lines: ['稍后再试', '或设置访问令牌后重新运行：export GITHUB_TOKEN=<你的令牌>'] },
      },
      rows: [],
      totals: { label: '合计', succeeded: { count: 0, word: '成功' }, failed: { count: 0, word: '失败' }, skipped: { count: 0, word: '跳过' } },
    });
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(after && selected(after)).toEqual(['alpha']);
    // 出错说明不重复打到终端上
    expect(result.output).not.toContain('GitHub 限流');
    expect(result.exitCode).toBe(0);
  });

  it('查询的时候页面上写着正在查询；出错说明带着查的是哪个网址', async () => {
    fakeGitHub({
      intercept(url) {
        if (!url.includes('api.github.com')) return undefined;
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) });
      },
    });
    let querying: ViewState | undefined;
    let results: RunView | undefined;
    await run({
      catalog: githubCatalogSource(),
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        const loading = page.until((state) => state.run?.loading !== undefined);
        results = await install(page, summary);
        querying = await loading;
        await done(page);
      },
    });

    expect(querying?.run?.loading).toBe('正在查询 skill 的文件列表');
    expect(results).not.toHaveProperty('loading');
    expect(results?.failure).toMatchObject({
      title: '出错：无法查询 skill 的文件列表',
      location: 'https://api.github.com/repos/LFT-OXY/oxy-Tools/commits/main',
      cause: { label: '原因', text: '向 GitHub 查询失败（ENOTFOUND）' },
    });
  });

  it('执行中出了意料之外的错：变成这一批的出错说明，没有堆栈，安装器不退出', async () => {
    const broken: CatalogSource = { ...localCatalogSource(catalogDir()), pin: () => Promise.reject(new Error('boom\n    at somewhere (file.ts:1:1)')) };
    let results: RunView | undefined;
    const result = await run({
      catalog: broken,
      page: async (page) => {
        await tick(page, 'alpha');
        results = await install(page, await review(page));
        await done(page);
      },
    });

    expect(results?.failure).toMatchObject({ title: '出错：意外错误', cause: { text: 'boom' } });
    expect(results?.rows).toEqual([]);
    expect(JSON.stringify(results)).not.toContain('file.ts');
    expect(result.exitCode).toBe(0);
  });
});

describe('网页界面：意图要合这一步', () => {
  it('浏览时没有汇总可确认、可返回，也没有结果可继续；汇总开着时不能再勾选、再要汇总', async () => {
    const browsing: number[] = [];
    const reviewing: number[] = [];
    let after: ViewState | undefined;
    await run({
      page: async (page) => {
        for (const intent of [{ type: 'overwrite', item: 'x', on: true }, { type: 'install', summary: 'x' }, { type: 'revise' }, { type: 'continue' }]) {
          browsing.push(await post(page, intent));
        }
        await tick(page, 'alpha');
        await review(page);
        for (const intent of [{ type: 'pick', kind: 'skill', name: 'beta-pack', on: true }, { type: 'review' }, { type: 'continue' }, { type: 'install' }]) {
          reviewing.push(await post(page, intent));
        }
        after = await page.reload();
        await done(page);
      },
    });

    expect(browsing).toEqual([400, 400, 400, 400]);
    expect(reviewing).toEqual([400, 400, 400, 400]);
    expect(after && selected(after)).toEqual(['alpha']);
    expect(after?.summary?.title).toBe('将安装 1 项');
  });

  it('正在装的时候点不了「完成」、也不能继续挑选：这一批装完才行', async () => {
    const local = localCatalogSource(catalogDir());
    // 查询卡住，直到放行
    let release = (): void => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: CatalogSource = { ...local, pin: async (options) => (await held, local.pin(options)) };
    const installing: number[] = [];
    let results: RunView | undefined;
    const result = await run({
      catalog: slow,
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        await page.until((state) => state.run?.loading !== undefined);
        for (const intent of [{ type: 'finish' }, { type: 'continue' }, { type: 'pick', kind: 'skill', name: 'beta-pack', on: true }, { type: 'install', summary: summary.id }]) {
          installing.push(await post(page, intent));
        }
        release();
        results = (await page.until((state) => state.run?.done === true)).run;
        await done(page);
      },
    });

    expect(installing).toEqual([400, 400, 400, 400]);
    expect(outcomes(results)).toEqual(['alpha Claude Code 已安装 1.0.0']);
    expect(result.exitCode).toBe(0);
  });

  it('正在装的时候在终端上按了 Ctrl+C：以 130 退出，页面的连接断了', async () => {
    const local = localCatalogSource(catalogDir());
    // 查询一直不回来
    const stuck: CatalogSource = { ...local, pin: () => new Promise(() => {}) };
    const user = new AbortController();
    const result = await run({
      catalog: stuck,
      interrupt: user.signal,
      page: async (page) => {
        await tick(page, 'alpha');
        const summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        await page.until((state) => state.run?.loading !== undefined);
        user.abort();
        await page.closed;
      },
    });

    expect(result.exitCode).toBe(130);
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(result.output).not.toContain('出错');
  });
});
