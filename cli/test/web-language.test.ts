import { describe, expect, it } from 'vitest';
import type { ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, catalogDir, run, type Page, type RunOptions } from './harness.ts';
import { LANGUAGE_QUESTION } from './terminal.ts';

const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
const [PAPER_KIT] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
// 「联网搜索与文档检索」下各种说法都有：第三方 Skill 装了三个里的一个、带推荐标记的 MCP、只支持 Codex 的 MCP（不可选）、外部项目。
// 样例目录每次现建：架子在每条测试之后把临时目录都删掉
const varied = (): RunOptions => ({
  catalog: catalogDir({
    catalog: {
      ...EMPTY_CATALOG,
      mcps: [{ ...DOCS_LOCAL, recommended: true }, { ...TRACKER_REMOTE, purpose: 'web-search', hosts: ['codex'] }],
      thirdPartySkills: [PAPER_KIT],
      apps: SAMPLE_APPS,
    },
  }),
  home: { '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n' },
});
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
// 打开页面，换到左栏第二行（用途清单里的第一个用途）的列表上
const secondRow = async (page: Page): Promise<ViewState> => {
  const row = page.state().menu[1];
  if (!row) throw new Error('左栏里没有第二行');
  await page.send({ type: 'open', list: row.id });
  return page.until((state) => state.listing?.id === row.id);
};
const entry = (state: ViewState, name: string) => {
  const found = state.listing?.sections.flatMap((section) => section.entries).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`列表里没有「${name}」`);
  return found;
};
// 画面状态里会随语言变的那些说法，摘出来方便对照
const wording = (state: ViewState) => ({
  lang: state.lang,
  menu: state.menu.map((row) => row.name),
  sections: state.listing?.sections.map((section) => [section.title, section.note]),
  paperKit: entry(state, 'paper-kit').statuses,
  docsLocal: { about: entry(state, 'docs-local').about, mark: entry(state, 'docs-local').mark, statuses: entry(state, 'docs-local').statuses },
  tracker: entry(state, 'tracker-remote').unavailable,
  apps: state.listing?.apps && { title: state.listing.apps.title, note: state.listing.apps.note, about: state.listing.apps.entries[0]?.about },
  machine: state.machine,
  target: { hostsLabel: state.target.hostsLabel, scopeLabel: state.target.scopeLabel, scopes: state.target.scopes.map((scope) => scope.name) },
});

describe('网页界面：页面上换语言', () => {
  it('换成英文：推来的画面状态里凡是随它来的说法都是英文，正在看的列表和别的状态都不变', async () => {
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    await run({
      ...varied(),
      page: async (page) => {
        before = await secondRow(page);
        await page.send({ type: 'lang', lang: 'en' });
        after = await page.until((state) => state.lang === 'en');
        await done(page);
      },
    });
    if (!before || !after) throw new Error('页面没有连上');

    expect(wording(before)).toEqual({
      lang: 'zh',
      menu: ['推荐', '联网搜索与文档检索', '开发工作流与规范'],
      sections: [
        ['第三方 Skill', '内容直接来自作者'],
        ['MCP', undefined],
      ],
      paperKit: [{ host: 'Claude Code', text: '已装', tone: 'ready', rest: '1/3' }],
      docsLocal: { about: DOCS_LOCAL.description.zh, mark: '推荐', statuses: [{ host: 'Claude Code', text: '未配置', tone: 'faint' }] },
      tracker: '需要别的 AI Agent',
      apps: { title: '外部项目', note: '只给链接，不安装', about: SAMPLE_APPS[1]?.description.zh },
      machine: { hosts: [{ name: 'Claude Code', detected: true }, { name: 'Codex', detected: false, status: '未检测到' }], catalog: ['3 Skill', '2 MCP', '2 外部项目'] },
      target: { hostsLabel: '装进哪些 AI Agent', scopeLabel: '装到哪里', scopes: ['全局', '项目'] },
    });
    expect(wording(after)).toEqual({
      lang: 'en',
      menu: ['Recommended', 'Web search & docs retrieval', 'Development workflow & conventions'],
      sections: [
        ['Third-party skills', 'content comes straight from the author'],
        ['MCP', undefined],
      ],
      paperKit: [{ host: 'Claude Code', text: 'installed', tone: 'ready', rest: '1/3' }],
      docsLocal: { about: DOCS_LOCAL.description.en, mark: 'pick', statuses: [{ host: 'Claude Code', text: 'none', tone: 'faint' }] },
      tracker: 'needs another AI Agent',
      apps: { title: 'External projects', note: 'links only, nothing is installed', about: SAMPLE_APPS[1]?.description.en },
      machine: { hosts: [{ name: 'Claude Code', detected: true }, { name: 'Codex', detected: false, status: 'not detected' }], catalog: ['3 skills', '2 MCP', '2 external'] },
      target: { hostsLabel: 'Install into which AI Agents', scopeLabel: 'Install where', scopes: ['Global', 'Project'] },
    });
    // 换语言只换说法：正在看哪张列表、左栏各行的标识、开场动画播过没有、走到哪一步都不变
    expect(after.listing?.id).toBe(before.listing?.id);
    expect(after.menu.map((row) => row.id)).toEqual(before.menu.map((row) => row.id));
    expect(after.menu.map((row) => row.count)).toEqual(before.menu.map((row) => row.count));
    expect({ stage: after.stage, introSeen: after.introSeen, version: after.version }).toEqual({ stage: before.stage, introSeen: before.introSeen, version: before.version });
  });

  it('换过去再换回来，画面状态和起初的一模一样；刷新拿到的是换过之后的语言', async () => {
    let before: ViewState | undefined;
    let reloaded: ViewState | undefined;
    let back: ViewState | undefined;
    await run({
      ...varied(),
      page: async (page) => {
        before = await secondRow(page);
        await page.send({ type: 'lang', lang: 'en' });
        await page.until((state) => state.lang === 'en');
        reloaded = await page.reload();
        await page.send({ type: 'lang', lang: 'zh' });
        back = await page.until((state) => state.lang === 'zh');
        await done(page);
      },
    });

    expect(reloaded?.lang).toBe('en');
    expect(reloaded?.listing?.id).toBe(before?.listing?.id);
    expect(back).toEqual(before);
  });

  it('终端上的语言不跟着变：页面换成英文之后，终端上仍只有起始语言的那个块，没有多出一行', async () => {
    const result = await run({
      ...varied(),
      page: async (page) => {
        await page.send({ type: 'lang', lang: 'en' });
        await page.until((state) => state.lang === 'en');
        await done(page);
      },
    });

    expect(result.screen).toMatch(/^\s*网页界面\s+已在浏览器打开$/m);
    expect(result.screen).not.toContain('Web UI');
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
    // 和没换过语言的一次运行打出来的一样多
    const plain = await run({ ...varied(), page: done });
    expect(result.screen.split('\n').length).toBe(plain.screen.split('\n').length);
  });

  it('切换语言的控件的名字和两项随画面状态来，和终端界面的语言提问逐字相同', async () => {
    let state: ViewState | undefined;
    await run({
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(state?.language).toEqual({
      label: LANGUAGE_QUESTION,
      options: [
        { id: 'zh', name: '中文' },
        { id: 'en', name: 'English' },
      ],
    });
  });

  it('lang 不是 zh、en 的写法都不照办，语言不变', async () => {
    let reloaded: ViewState | undefined;
    await run({
      page: async (page) => {
        const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
        for (const body of [{ type: 'lang', lang: 'fr' }, { type: 'lang', lang: 'EN' }, { type: 'lang' }, { type: 'lang', lang: 1 }]) {
          const { status } = await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(body) });
          expect(status, JSON.stringify(body)).toBe(400);
        }
        reloaded = await page.reload();
        await done(page);
      },
    });

    expect(reloaded?.lang).toBe('zh');
  });
});

describe('网页界面：页面起始的语言', () => {
  it.each([
    ['中文', 'zh_CN.UTF-8', 'zh', '推荐'],
    ['英文', 'en_US.UTF-8', 'en', 'Recommended'],
  ])('不带 --lang：系统语言是%s时页面一打开就是它', async (_label, LANG, lang, recommended) => {
    let state: ViewState | undefined;
    await run({
      env: { LANG },
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(state?.lang).toBe(lang);
    expect(state?.menu[0]?.name).toBe(recommended);
  });

  it('--lang 盖过系统语言', async () => {
    let state: ViewState | undefined;
    await run({
      argv: ['--lang', 'zh'],
      env: { LANG: 'en_US.UTF-8' },
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(state?.lang).toBe('zh');
  });
});
