// 网页界面里装第三方 Skill：都经主接缝，架子扮演浏览器。装法、命令、成败的判法和终端界面同一份
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import type { ComponentView, RunView, SummaryView, ViewState } from '../src/web-protocol.ts';
import { fakeGitHub } from './github.ts';
import { EMPTY_CATALOG, SAMPLE_FILES, SAMPLE_THIRD_PARTY, accept, catalogDir, choose, pick, run, writeTree, type Page } from './harness.ts';

// 「联网搜索与文档检索」下有两条第三方 Skill：paper-kit（含 paper-reader、paper-comic、paper-deck 三个 skill）
// 和 solo-notes（只含 note-taker 一个）
const WEB_SEARCH = '联网搜索与文档检索';
const DEV_WORKFLOW = '开发工作流与规范';
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (catalog: Record<string, unknown> = {}): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, ...catalog } });
const BOTH_HOSTS = ['claude', 'codex'];
const CLAUDE_SKILLS = '.claude/skills';
const CODEX_SKILLS = '.agents/skills';

// 和终端界面的测试同一份写法：一条命令一个 skill、一个宿主，带关遥测的环境变量，不经 shell
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const add = (source: string, skill: string, agent: 'claude-code' | 'codex', scope: 'global' | 'project' = 'global') => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', source, '--skill', skill, '--agent', agent, '--yes', ...(scope === 'global' ? ['--global'] : [])],
  env: agent === 'claude-code' ? { ...NO_TELEMETRY, CLAUDE_CONFIG_DIR: '' } : NO_TELEMETRY,
});
const SKILLS_DIR: Record<string, string> = { 'claude-code': CLAUDE_SKILLS, codex: CODEX_SKILLS };
// 假装 skills CLI 装上了：「执行」那条命令时往它该落的位置写出 SKILL.md（装到项目时落在 cwd 下）。except 里的 skill 装不上
const installs =
  (except: string[] = []) =>
  (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
    if (command !== 'npx') return;
    const skill = args[args.indexOf('--skill') + 1] ?? '';
    const agent = args[args.indexOf('--agent') + 1] ?? '';
    if (!except.includes(skill)) writeTree(cwd ?? home, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
  };

// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
const open = async (page: Page, name: string): Promise<ViewState> => {
  const row = page.state().menu.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`左栏里没有「${name}」`);
  await page.send({ type: 'open', list: row.id });
  return page.until((state) => state.listing?.id === row.id);
};
// 勾上（或去掉）一个第三方 Skill，给出之后的画面状态
const tick = async (page: Page, name: string, on = true): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'thirdParty', name, on });
  return page.until((state) => state.selected.some((entry) => entry.name === name) === on);
};
// 要（或不要）含多个 skill 的条目里的一个 skill
const want = async (page: Page, entry: string, skill: string, on = true): Promise<ViewState> => {
  await page.send({ type: 'choose', entry, skill, on });
  return page.until((state) => choices(state, entry).includes(skill) === on);
};
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 正在看的那张列表里名字是它的第三方 Skill 的卡片
const card = (state: ViewState, name: string): ComponentView | undefined =>
  state.listing?.sections.find((section) => section.kind === 'thirdParty')?.entries.find((entry) => entry.name === name);
// 卡片上挑了的 skill 的名字
const choices = (state: ViewState, name: string): string[] => (card(state, name)?.skills?.entries ?? []).filter((skill) => skill.chosen).map((skill) => skill.name);
// 汇总写成几行字：条目 · 类型 · 版本，下面每行 skill/宿主/操作/位置/备注
const rows = (summary: SummaryView): string[] =>
  summary.entries.flatMap((entry) => [
    [entry.name, entry.type, entry.version].filter((part) => part !== undefined).join(' · '),
    ...entry.rows.map((row) => `  ${[row.skill, row.host, row.action, row.location, row.note].filter((part) => part !== undefined).join(' | ')}`),
  ]);
const outcomes = (batch: RunView | undefined): string[] => (batch?.rows ?? []).map((row) => [row.name, row.host, row.text, row.rest].filter(Boolean).join(' '));
const totals = (batch: RunView | undefined): string =>
  batch?.totals ? [batch.totals.succeeded, batch.totals.failed, batch.totals.skipped].map(({ count, word }) => `${count} ${word}`).join(' · ') : '';
// 画面状态的 JSON 里有没有命令的痕迹
const mentionsCommands = (state: ViewState): boolean => /npx|skills@1|--agent|--skill/.test(JSON.stringify(state));

afterEach(() => vi.restoreAllMocks());

describe('网页界面：勾选第三方 Skill、挑其中的 skill', () => {
  it('只含一个 skill 的：勾上就是装那一个，已选里的类型是「第三方 Skill」，卡片上没有可挑的清单', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        state = await tick(page, 'solo-notes');
        await done(page);
      },
    });

    expect(state?.selected).toEqual([{ kind: 'thirdParty', name: 'solo-notes', type: '第三方 Skill' }]);
    expect(card(state as ViewState, 'solo-notes')).toMatchObject({ picked: true });
    expect(card(state as ViewState, 'solo-notes')?.skills).toBeUndefined();
  });

  it('含多个 skill 的：卡片带着清单——那一句、每个 skill 的说明和状态；起初一个都没挑，已选里写明这一条不装', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      home: { [`${CLAUDE_SKILLS}/paper-comic/SKILL.md`]: '# paper-comic\n' },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        state = await tick(page, 'paper-kit');
        await done(page);
      },
    });

    expect(card(state as ViewState, 'paper-kit')?.skills).toEqual({
      lead: 'paper-kit 里有 3 个 skill，选择要装的',
      entries: [
        {
          name: 'paper-reader',
          about: '把一篇论文读成深度解读文章',
          statuses: [
            { host: 'Claude Code', text: '未装', tone: 'faint' },
            { host: 'Codex', text: '未装', tone: 'faint' },
          ],
        },
        {
          name: 'paper-comic',
          about: '把论文的要点画成一组漫画',
          statuses: [
            { host: 'Claude Code', text: '已装', tone: 'ready' },
            { host: 'Codex', text: '未装', tone: 'faint' },
          ],
        },
        {
          name: 'paper-deck',
          about: '把论文做成一套幻灯片',
          statuses: [
            { host: 'Claude Code', text: '未装', tone: 'faint' },
            { host: 'Codex', text: '未装', tone: 'faint' },
          ],
        },
      ],
    });
    expect(state?.selected).toEqual([{ kind: 'thirdParty', name: 'paper-kit', type: '第三方 Skill', unavailable: '一个 skill 都没挑，这一条不装' }]);
  });

  it('挑两个：卡片上那两个是挑了的，已选里写着挑了几个；去掉一个又回到一个', async () => {
    let two: ViewState | undefined;
    let one: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-deck');
        two = await want(page, 'paper-kit', 'paper-reader');
        one = await want(page, 'paper-kit', 'paper-deck', false);
        await done(page);
      },
    });

    expect(two && choices(two, 'paper-kit')).toEqual(['paper-reader', 'paper-deck']);
    expect(two?.selected).toEqual([{ kind: 'thirdParty', name: 'paper-kit', type: '第三方 Skill', detail: '3 个 skill 里挑了 2 个' }]);
    expect(one && choices(one, 'paper-kit')).toEqual(['paper-reader']);
    expect(one?.selected[0]?.detail).toBe('3 个 skill 里挑了 1 个');
  });

  it('挑的结果在换用途、返回修改、去掉再勾上之后还在；点「继续挑选」之后清空', async () => {
    let elsewhere: ViewState | undefined;
    let revised: ViewState | undefined;
    let repicked: ViewState | undefined;
    let continued: ViewState | undefined;
    await run({
      catalog: thirdParty({ skillPurposes: { alpha: 'dev-workflow' } }),
      commandResult: installs(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-comic');
        await open(page, DEV_WORKFLOW);
        elsewhere = await open(page, WEB_SEARCH);
        await review(page);
        await page.send({ type: 'revise' });
        revised = await page.until((state) => state.summary === undefined);
        await tick(page, 'paper-kit', false);
        repicked = await tick(page, 'paper-kit');
        await install(page, await review(page));
        await page.send({ type: 'continue' });
        continued = await page.until((state) => state.run === undefined);
        await tick(page, 'paper-kit');
        continued = page.state();
        await done(page);
      },
    });

    expect(elsewhere && choices(elsewhere, 'paper-kit')).toEqual(['paper-comic']);
    expect(revised && choices(revised, 'paper-kit')).toEqual(['paper-comic']);
    expect(repicked && choices(repicked, 'paper-kit')).toEqual(['paper-comic']);
    expect(continued && choices(continued, 'paper-kit')).toEqual([]);
  });

  it('不照办的挑：条目没勾上、只含一个 skill 的条目、名字对不上、多带了字段；挑的不变', async () => {
    const statuses: Record<string, number> = {};
    let after: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        statuses['没勾上'] = await post(page, { type: 'choose', entry: 'paper-kit', skill: 'paper-deck', on: true });
        await tick(page, 'solo-notes');
        statuses['只含一个'] = await post(page, { type: 'choose', entry: 'solo-notes', skill: 'note-taker', on: true });
        await tick(page, 'paper-kit');
        statuses['不在里面'] = await post(page, { type: 'choose', entry: 'paper-kit', skill: 'note-taker', on: true });
        statuses['不是第三方 Skill'] = await post(page, { type: 'choose', entry: 'alpha', skill: 'alpha', on: true });
        statuses['多带了字段'] = await post(page, { type: 'choose', entry: 'paper-kit', skill: 'paper-deck', on: true, command: 'rm -rf ~' });
        statuses['on 不是布尔'] = await post(page, { type: 'choose', entry: 'paper-kit', skill: 'paper-deck', on: 'yes' });
        after = page.state();
        await done(page);
      },
    });

    expect(statuses).toEqual({ 没勾上: 400, 只含一个: 400, 不在里面: 400, '不是第三方 Skill': 400, 多带了字段: 400, 'on 不是布尔': 400 });
    expect(after && choices(after, 'paper-kit')).toEqual([]);
  });

  it('一个都不挑：只勾了它时去不了汇总；和别的一起时它不进汇总，标题数的是会装的条目', async () => {
    let alone: number | undefined;
    let summary: SummaryView | undefined;
    await run({
      catalog: thirdParty(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        alone = await post(page, { type: 'review' });
        await tick(page, 'solo-notes');
        summary = await review(page);
        await done(page);
      },
    });

    expect(alone).toBe(400);
    expect(summary?.title).toBe('将安装 1 项');
    expect(summary?.entries.map((entry) => entry.name)).toEqual(['solo-notes']);
  });

  it('换语言：勾选和挑的都不变，已选里的话、卡片上那一句换成英文', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-deck');
        await tick(page, 'solo-notes');
        await page.send({ type: 'lang', lang: 'en' });
        state = await page.until((candidate) => candidate.lang === 'en');
        await done(page);
      },
    });

    expect(state?.selected).toEqual([
      { kind: 'thirdParty', name: 'paper-kit', type: 'Third-party skill', detail: '1 of 3 skills chosen' },
      { kind: 'thirdParty', name: 'solo-notes', type: 'Third-party skill' },
    ]);
    expect(state && card(state, 'paper-kit')?.skills?.lead).toBe('paper-kit has 3 skills; pick the ones to install');
    expect(state && choices(state, 'paper-kit')).toEqual(['paper-deck']);
  });
});

describe('网页界面：第三方 Skill 的汇总、确认与结果', () => {
  it('只含一个 skill 的，两个宿主：汇总一段、没有版本、每个宿主一行，带那句提醒；结果两行「已安装」，命令和终端界面装它时逐条相同', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const states: ViewState[] = [];
    const web = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'solo-notes');
        summary = await review(page);
        states.push(page.state());
        batch = await install(page, summary);
        states.push(page.state());
        await done(page);
      },
    });
    const terminal = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(rows(summary as SummaryView)).toEqual([
      'solo-notes · 第三方 Skill',
      `  note-taker | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'note-taker')}`,
      `  note-taker | Codex | 新装 | ${join('~', CODEX_SKILLS, 'note-taker')}`,
    ]);
    expect(summary?.title).toBe('将安装 1 项');
    expect(summary?.notices).toEqual(['第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查']);
    expect(outcomes(batch)).toEqual(['note-taker Claude Code 已安装', 'note-taker Codex 已安装']);
    expect(totals(batch)).toBe('2 成功 · 0 失败 · 0 跳过');
    expect(web.commands).toEqual([add('example-labs/solo-notes', 'note-taker', 'claude-code'), add('example-labs/solo-notes', 'note-taker', 'codex')]);
    expect(web.commands).toEqual(terminal.commands);
    expect(states.some(mentionsCommands)).toBe(false);
    expect(existsSync(join(web.home, CLAUDE_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
    expect(web.exitCode).toBe(0);
  });

  it('含多个的挑两个：汇总里每个 skill 一小组、每个宿主一行，照条目里的先后；命令每个 skill、每个宿主一条', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-deck');
        await want(page, 'paper-kit', 'paper-reader');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary as SummaryView)).toEqual([
      'paper-kit · 第三方 Skill',
      `  paper-reader | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'paper-reader')}`,
      `  paper-reader | Codex | 新装 | ${join('~', CODEX_SKILLS, 'paper-reader')}`,
      `  paper-deck | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'paper-deck')}`,
      `  paper-deck | Codex | 新装 | ${join('~', CODEX_SKILLS, 'paper-deck')}`,
    ]);
    expect(result.commands).toEqual([
      add('example-labs/paper-kit', 'paper-reader', 'claude-code'),
      add('example-labs/paper-kit', 'paper-reader', 'codex'),
      add('example-labs/paper-kit', 'paper-deck', 'claude-code'),
      add('example-labs/paper-kit', 'paper-deck', 'codex'),
    ]);
    expect(outcomes(batch)).toEqual([
      'paper-reader Claude Code 已安装',
      'paper-reader Codex 已安装',
      'paper-deck Claude Code 已安装',
      'paper-deck Codex 已安装',
    ]);
  });

  it('目标位置已有同名目录：汇总里「覆盖」加备注、要逐项决定，缺省不覆盖——没有命令、目录原样、结果是跳过；同意后命令执行了', async () => {
    const mine = '用户自己放的\n';
    let summary: SummaryView | undefined;
    let skipped: RunView | undefined;
    let replaced: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      home: { [`${CLAUDE_SKILLS}/note-taker/notes.txt`]: mine },
      commandResult: installs(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'solo-notes');
        summary = await review(page);
        skipped = await install(page, summary);
        await page.send({ type: 'continue' });
        await page.until((state) => state.run === undefined);
        await tick(page, 'solo-notes');
        const again = await review(page);
        const item = again.entries[0]?.rows[0]?.overwrite?.id ?? '';
        await page.send({ type: 'overwrite', item, on: true });
        await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true);
        replaced = await install(page, page.state().summary as SummaryView);
        await done(page);
      },
    });

    expect(summary?.entries[0]?.rows[0]).toEqual({
      skill: 'note-taker',
      host: 'Claude Code',
      action: '覆盖',
      overwrites: true,
      location: join('~', CLAUDE_SKILLS, 'note-taker'),
      note: '已有同名目录',
      overwrite: { id: 'thirdParty:solo-notes:note-taker:claude-code', agreed: false },
    });
    expect(summary?.notices).toEqual(['覆盖即整目录替换，目录内的本地改动会丢失', '第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查']);
    expect(outcomes(skipped)).toEqual(['note-taker Claude Code 跳过 未同意覆盖，保持原样']);
    expect(totals(skipped)).toBe('0 成功 · 0 失败 · 1 跳过');
    expect(outcomes(replaced)).toEqual(['note-taker Claude Code 已安装']);
    expect(result.commands).toEqual([add('example-labs/solo-notes', 'note-taker', 'claude-code')]);
    expect(readFileSync(join(result.home, CLAUDE_SKILLS, 'note-taker', 'notes.txt'), 'utf8')).toBe(mine);
  });

  it('命令结束了但目标位置没有 SKILL.md 判失败；没能运行、装上了而命令非零退出，各说各的话', async () => {
    const batches: RunView[] = [];
    const script = async (page: Page): Promise<void> => {
      await open(page, WEB_SEARCH);
      await tick(page, 'solo-notes');
      batches.push(await install(page, await review(page)));
      await done(page);
    };
    const silent = await run({ catalog: thirdParty(), commandResult: installs(['note-taker']), page: script });
    const missing = await run({ catalog: thirdParty(), commandResult: () => Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' }), page: script });
    const noisy = await run({
      catalog: thirdParty(),
      commandResult: (command, args, context) => {
        installs()(command, args, context);
        return { exitCode: 1 };
      },
      page: script,
    });

    expect(outcomes(batches[0])).toEqual(['note-taker Claude Code 失败 安装命令已结束，但目标位置没有 SKILL.md']);
    expect(batches[0]?.next?.lines).toEqual(['没装上的各项没有改动原有的东西。排除原因后点「继续挑选」，重新勾选再装一次。']);
    expect(outcomes(batches[1])).toEqual(['note-taker Claude Code 失败 安装命令没能运行（ENOENT）']);
    expect(outcomes(batches[2])).toEqual(['note-taker Claude Code 已安装 安装命令退出状态 1']);
    expect(totals(batches[2])).toBe('1 成功 · 0 失败 · 0 跳过');
    expect([silent.exitCode, missing.exitCode, noisy.exitCode]).toEqual([0, 0, 0]);
  });

  it('和本仓库的 skill 混在一批里：本仓库的在前、第三方 Skill 在后，命令只有第三方 Skill 的；向 GitHub 查询失败时第三方 Skill 照常装', async () => {
    // 两次运行各自的结果：先是正常的一批，再是向 GitHub 查询失败的那一批
    const batches: RunView[] = [];
    const script = async (page: Page): Promise<void> => {
      await open(page, WEB_SEARCH);
      await tick(page, 'solo-notes');
      await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
      await page.until((state) => state.selected.length === 2);
      batches.push(await install(page, await review(page)));
      await done(page);
    };
    const result = await run({ catalog: thirdParty({ skillPurposes: { alpha: 'web-search' } }), commandResult: installs(), page: script });
    // 向 GitHub 的查询被限流；目录里有第三方 Skill
    fakeGitHub({
      content: { ...SAMPLE_FILES, 'catalog.json': JSON.stringify({ ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, skillPurposes: { alpha: 'web-search' } }) },
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json(
              { message: 'API rate limit exceeded' },
              { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 37 * 60) } },
            )
          : undefined,
    });
    await run({ catalog: githubCatalogSource(), commandResult: installs(), page: script });
    const [mixed, queryFailed] = batches;

    expect(outcomes(mixed)).toEqual(['alpha Claude Code 已安装 1.0.0', 'note-taker Claude Code 已安装']);
    expect(result.commands).toEqual([add('example-labs/solo-notes', 'note-taker', 'claude-code')]);
    expect(queryFailed?.failure?.title).toMatch(/^出错：/);
    expect(outcomes(queryFailed)).toEqual(['note-taker Claude Code 已安装']);
  });
});

describe('网页界面：第三方 Skill 的宿主与安装范围', () => {
  // paper-kit 只支持 Codex
  const codexOnlyKit = (): string => thirdParty({ thirdPartySkills: [{ ...KIT, hosts: ['codex'] }, SOLO] });

  it('条目只支持 Codex 而两个宿主都选：卡片上 Claude Code 那一段「不支持」，汇总和命令只有 Codex 的', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: codexOnlyKit(),
      onPath: BOTH_HOSTS,
      commandResult: installs(),
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-comic');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(card(listed as ViewState, 'paper-kit')?.statuses).toEqual([
      { host: 'Claude Code', text: '不支持', tone: 'faint' },
      { host: 'Codex', text: '未装', tone: 'faint' },
    ]);
    expect(card(listed as ViewState, 'paper-kit')?.skills?.entries.map((skill) => skill.statuses.map((status) => status.text))).toEqual([
      ['不支持', '未装'],
      ['不支持', '未装'],
      ['不支持', '未装'],
    ]);
    expect(rows(summary as SummaryView)).toEqual(['paper-kit · 第三方 Skill', `  paper-comic | Codex | 新装 | ${join('~', CODEX_SKILLS, 'paper-comic')}`]);
    expect(result.commands).toEqual([add('example-labs/paper-kit', 'paper-comic', 'codex')]);
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
  });

  it('只检测到 Claude Code：它不可选，原因是「需要别的 AI Agent」，勾不上', async () => {
    let status: number | undefined;
    let state: ViewState | undefined;
    await run({
      catalog: codexOnlyKit(),
      page: async (page) => {
        state = await open(page, WEB_SEARCH);
        status = await post(page, { type: 'pick', kind: 'thirdParty', name: 'paper-kit', on: true });
        await done(page);
      },
    });

    expect(card(state as ViewState, 'paper-kit')?.unavailable).toBe('需要别的 AI Agent');
    expect(status).toBe(400);
    expect(state?.selected).toEqual([]);
  });

  it('已选里现在装不了的：去掉 Codex 之后它留在已选里、写明原因、不进汇总；只剩它时去不了汇总；勾回 Codex 就恢复', async () => {
    let stuck: ViewState | undefined;
    let summary: SummaryView | undefined;
    let alone: number | undefined;
    let restored: ViewState | undefined;
    await run({
      catalog: codexOnlyKit(),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'paper-kit');
        await want(page, 'paper-kit', 'paper-comic');
        await tick(page, 'solo-notes');
        await page.send({ type: 'host', host: 'codex', on: false });
        stuck = await page.until((state) => state.target.hosts.length === 1);
        summary = await review(page);
        await page.send({ type: 'revise' });
        await page.until((state) => state.summary === undefined);
        await tick(page, 'solo-notes', false);
        alone = await post(page, { type: 'review' });
        await page.send({ type: 'host', host: 'codex', on: true });
        restored = await page.until((state) => state.target.hosts.length === 2);
        await done(page);
      },
    });

    expect(stuck?.selected).toEqual([
      { kind: 'thirdParty', name: 'paper-kit', type: '第三方 Skill', unavailable: '需要别的 AI Agent' },
      { kind: 'thirdParty', name: 'solo-notes', type: '第三方 Skill' },
    ]);
    expect(summary?.entries.map((entry) => entry.name)).toEqual(['solo-notes']);
    expect(alone).toBe(400);
    expect(restored?.selected).toEqual([{ kind: 'thirdParty', name: 'paper-kit', type: '第三方 Skill', detail: '3 个 skill 里挑了 1 个' }]);
  });

  it('装到项目：命令不带 --global、在项目目录下运行；位置是相对路径；复核按项目目录，主目录一个字节都没变', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      commandResult: installs(),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await page.send({ type: 'scope', scope: 'project' });
        await page.until((state) => state.target.scope === 'project');
        await tick(page, 'solo-notes');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary as SummaryView)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Claude Code | 新装 | ${join(CLAUDE_SKILLS, 'note-taker')}`]);
    expect(result.commands).toEqual([{ ...add('example-labs/solo-notes', 'note-taker', 'claude-code', 'project'), cwd: result.project }]);
    expect(outcomes(batch)).toEqual(['note-taker Claude Code 已安装']);
    expect(existsSync(join(result.project, CLAUDE_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
  });

  it('装到项目而命令把它装到了全局：复核只看项目目录，判失败', async () => {
    let batch: RunView | undefined;
    await run({
      catalog: thirdParty(),
      // 不管 cwd，一律往主目录写
      commandResult: (command, args, { home }) => installs()(command, args, { home }),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await page.send({ type: 'scope', scope: 'project' });
        await page.until((state) => state.target.scope === 'project');
        await tick(page, 'solo-notes');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['note-taker Claude Code 失败 安装命令已结束，但目标位置没有 SKILL.md']);
  });
});
