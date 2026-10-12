import { describe, expect, it } from 'vitest';
import type { ListingView, ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, SAMPLE_TOOLS, catalogDir, run, tempDir, writeTree, type Page, type RunOptions } from './harness.ts';

const BOTH_HOSTS = ['claude', 'codex'];
const withCatalog = (catalog: Record<string, unknown> = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, ...catalog } });
const withoutSkills = (catalog: Record<string, unknown>): string =>
  catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, ...catalog } });
// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
// 打开页面，看一眼刚连上时的画面状态就收场
const opening = async (options: RunOptions = {}): Promise<ViewState> => {
  let state: ViewState | undefined;
  await run({
    ...options,
    page: async (page) => {
      state = page.state();
      await done(page);
    },
  });
  if (!state) throw new Error('页面没有连上');
  return state;
};
// 打开页面，换到 name 这一行的列表，给出换过去之后的画面状态
const browsing = async (name: string, options: RunOptions = {}): Promise<ViewState> => {
  let state: ViewState | undefined;
  await run({
    ...options,
    page: async (page) => {
      const row = page.state().menu.find((candidate) => candidate.name === name);
      if (!row) throw new Error(`左栏里没有「${name}」`);
      await page.send({ type: 'open', list: row.id });
      state = await page.until((next) => next.listing?.id === row.id);
      await done(page);
    },
  });
  if (!state) throw new Error('页面没有连上');
  return state;
};
const menu = (state: ViewState): [string, number][] => state.menu.map((row) => [row.name, row.count]);
// 正在看的那一行的名字
const current = (state: ViewState): string | undefined => state.menu.find((row) => row.id === state.listing?.id)?.name;
// 各个分区的标题和里面条目的名字，照画面状态里的先后
const sections = (listing: ListingView | undefined): [string, string[]][] =>
  (listing?.sections ?? []).map((section) => [section.title, section.entries.map((entry) => entry.name)]);
const entry = (state: ViewState, name: string) => {
  const found = state.listing?.sections.flatMap((section) => section.entries).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`列表里没有「${name}」`);
  return found;
};

describe('网页界面：左栏的「推荐」和各个用途', () => {
  it('「推荐」在最前，后面是有条目的各个用途，照用途清单的先后，各带条目数；页面打开时在「推荐」上', async () => {
    const state = await opening({ catalog: withCatalog({ mcps: SAMPLE_MCPS, apps: SAMPLE_APPS }) });

    expect(menu(state)).toEqual([
      ['推荐', 2],
      ['联网搜索与文档检索', 2],
      ['开发工作流与规范', 2],
    ]);
    expect(state.menu.map((row) => row.recommended ?? false)).toEqual([true, false, false]);
    expect(current(state)).toBe('推荐');
    expect(sections(state.listing)).toEqual([['Skill', ['alpha', 'beta-pack']]]);
  });

  it('没有「推荐」时这一行不出现，页面打开在第一个有条目的用途上；没有条目的用途不出现', async () => {
    // 只有一个外部项目，归在用途清单里的第二个用途下
    const state = await opening({ catalog: withoutSkills({ apps: [SAMPLE_APPS[0]] }) });

    expect(menu(state)).toEqual([['开发工作流与规范', 1]]);
    expect(state.menu[0]).not.toHaveProperty('recommended');
    expect(current(state)).toBe('开发工作流与规范');
  });

  it('目录里一个条目都没有：左栏是空的，没有正在看的列表，本机信息里是那一句话', async () => {
    const state = await opening({ catalog: withoutSkills({}) });

    expect(state.menu).toEqual([]);
    expect(state).not.toHaveProperty('listing');
    expect(state.machine.catalog).toEqual(['没有可用的条目']);
  });

  it('换一张列表看：画面状态里正在看的换成它，左栏不变', async () => {
    const state = await browsing('开发工作流与规范', { catalog: withCatalog({ mcps: SAMPLE_MCPS, apps: SAMPLE_APPS }) });

    expect(current(state)).toBe('开发工作流与规范');
    expect(sections(state.listing)).toEqual([['MCP', ['tracker-remote']]]);
    expect(menu(state)).toEqual([
      ['推荐', 2],
      ['联网搜索与文档检索', 2],
      ['开发工作流与规范', 2],
    ]);
  });

  it('要看的列表不在左栏里：不照办，正在看的不变', async () => {
    let after: ViewState | undefined;
    await run({
      catalog: withCatalog({ mcps: [SAMPLE_MCPS[0]] }),
      page: async (page) => {
        const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
        // 最后一个：第二个样例用途在用途清单里，但这份目录里它下面没有条目，左栏里没有它
        const shown = page.state().menu[1]?.id ?? '';
        const emptyPurpose = shown.replace('web-search', 'dev-workflow');
        expect(emptyPurpose).not.toBe(shown);
        for (const list of ['nowhere', '', 42, emptyPurpose]) {
          const { status } = await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify({ type: 'open', list }) });
          expect(status, String(list)).toBe(400);
        }
        after = await page.reload();
        await done(page);
      },
    });

    expect(after && current(after)).toBe('推荐');
  });
});

describe('网页界面：一张列表里的条目', () => {
  const [DOCS_LOCAL] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
  const [FETCHER, LINTER] = SAMPLE_TOOLS as [(typeof SAMPLE_TOOLS)[0], (typeof SAMPLE_TOOLS)[1]];
  const [PAPER_KIT, SOLO_NOTES] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
  const WEB_SEARCH = '联网搜索与文档检索';
  // 「联网搜索与文档检索」下每种类型都有条目，同类里名字靠后的那个带着推荐标记
  const everyKind = (): string =>
    withCatalog({
      skillPurposes: { 'beta-pack': 'web-search', alpha: 'web-search' },
      thirdPartySkills: [PAPER_KIT, { ...SOLO_NOTES, recommended: true }],
      mcps: [{ ...DOCS_LOCAL, name: 'aardvark' }, { ...DOCS_LOCAL, name: 'zebra', recommended: true }],
      tools: [FETCHER, { ...LINTER, purpose: 'web-search', recommended: true }],
      apps: SAMPLE_APPS,
    });

  it('组件按类型分开，先后是 Skill、第三方 Skill、MCP、工具；同类里带推荐标记的在前，其余按名字', async () => {
    const state = await browsing(WEB_SEARCH, { catalog: everyKind() });

    expect(sections(state.listing)).toEqual([
      ['Skill', ['alpha', 'beta-pack']],
      ['第三方 Skill', ['solo-notes', 'paper-kit']],
      ['MCP', ['zebra', 'aardvark']],
      ['工具', ['linter', 'fetcher']],
    ]);
    expect(state.listing?.sections.map((section) => section.kind)).toEqual(['skill', 'thirdParty', 'mcp', 'tool']);
  });

  it('第三方 Skill 的分区写明内容直接来自作者；别的组件分区没有这样的话', async () => {
    const state = await browsing(WEB_SEARCH, { catalog: everyKind() });

    expect(state.listing?.sections.map((section) => section.note)).toEqual([undefined, '内容直接来自作者', undefined, undefined]);
  });

  it('用途的列表里带推荐标记的条目标出来，本仓库的 skill 都算；说明是完整的那一句', async () => {
    const state = await browsing(WEB_SEARCH, { catalog: everyKind() });

    const marks = state.listing?.sections.flatMap((section) => section.entries.map((candidate) => [candidate.name, candidate.mark]));
    expect(marks).toEqual([
      ['alpha', '推荐'],
      ['beta-pack', '推荐'],
      ['solo-notes', '推荐'],
      ['paper-kit', undefined],
      ['zebra', '推荐'],
      ['aardvark', undefined],
      ['linter', '推荐'],
      ['fetcher', undefined],
    ]);
    expect(entry(state, 'alpha').about).toBe('第一个样例 skill，它的说明故意写得很长，长到在列表的一行里放不下，只能截断，全文要到列表下方去看');
  });

  it('「推荐」里每一条都是推荐的，不再逐条标；同类里只按名字', async () => {
    const state = await opening({ catalog: everyKind() });

    expect(sections(state.listing)).toEqual([
      ['Skill', ['alpha', 'beta-pack']],
      ['第三方 Skill', ['solo-notes']],
      ['MCP', ['zebra']],
      ['工具', ['linter']],
    ]);
    for (const candidate of state.listing?.sections.flatMap((section) => section.entries) ?? []) expect(candidate, candidate.name).not.toHaveProperty('mark');
  });
});

describe('网页界面：条目的状态', () => {
  const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
  const [FETCHER, LINTER] = SAMPLE_TOOLS as [(typeof SAMPLE_TOOLS)[0], (typeof SAMPLE_TOOLS)[1]];
  const [PAPER_KIT] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
  const WEB_SEARCH = '联网搜索与文档检索';
  /** 主目录里一个本工具装的 skill */
  const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
    [`${skillsDir}/${name}/SKILL.md`]: `# ${name}\n`,
    [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
  });

  it('两个宿主各有各的状态，用的词和终端界面一样：已装带版本，版本不同写两个版本号，非本工具安装，未装', async () => {
    const state = await opening({
      onPath: BOTH_HOSTS,
      home: {
        ...installed('.claude/skills', 'alpha', '1.0.0'),
        ...installed('.claude/skills', 'beta-pack', '2.0'),
        '.agents/skills/alpha/SKILL.md': '用户自己放的\n',
      },
    });

    // 这两样在页面上的名字和终端界面的提问是同一份文案
    expect(state.target).toEqual({
      hostsLabel: '装进哪些 AI Agent',
      choices: [
        { id: 'claude-code', name: 'Claude Code', on: true },
        { id: 'codex', name: 'Codex', on: true },
      ],
      hosts: ['Claude Code', 'Codex'],
      scopeLabel: '装到哪里',
      scopes: [
        { id: 'global', name: '全局' },
        { id: 'project', name: '项目' },
      ],
      scope: 'global',
      project: { note: '只对当前目录生效：', dir: expect.any(String) },
    });
    expect(entry(state, 'alpha').statuses).toEqual([
      { host: 'Claude Code', text: '已装', tone: 'ready', rest: '1.0.0' },
      { host: 'Codex', text: '非本工具安装', tone: 'attention' },
    ]);
    expect(entry(state, 'beta-pack').statuses).toEqual([
      { host: 'Claude Code', text: '2.0 → 2.3', tone: 'attention' },
      { host: 'Codex', text: '未装', tone: 'faint' },
    ]);
  });

  it('MCP、第三方 Skill 在每个宿主下的状态：已配置、未配置、不支持、装了几个里的几个', async () => {
    const state = await browsing(WEB_SEARCH, {
      onPath: BOTH_HOSTS,
      catalog: withCatalog({ mcps: [DOCS_LOCAL, { ...TRACKER_REMOTE, purpose: 'web-search', hosts: ['codex'] }], thirdPartySkills: [PAPER_KIT] }),
      home: {
        '.claude.json': JSON.stringify({ mcpServers: { 'docs-local': { type: 'stdio', command: 'old', args: [] } } }),
        '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n',
        '.claude/skills/paper-deck/SKILL.md': '# paper-deck\n',
      },
    });

    expect(entry(state, 'docs-local').statuses).toEqual([
      { host: 'Claude Code', text: '已配置', tone: 'ready' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
    ]);
    expect(entry(state, 'tracker-remote').statuses).toEqual([
      { host: 'Claude Code', text: '不支持', tone: 'faint' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
    ]);
    expect(entry(state, 'paper-kit').statuses).toEqual([
      { host: 'Claude Code', text: '已装', tone: 'ready', rest: '2/3' },
      { host: 'Codex', text: '未装', tone: 'faint' },
    ]);
    for (const name of ['docs-local', 'tracker-remote', 'paper-kit']) expect(entry(state, name), name).not.toHaveProperty('unavailable');
  });

  it('宿主的配置读不了时 MCP 的状态是未知，不上色', async () => {
    const state = await browsing(WEB_SEARCH, { catalog: withCatalog({ mcps: [DOCS_LOCAL] }), home: { '.claude.json': '{ "mcpServers": ' } });

    expect(entry(state, 'docs-local').statuses).toEqual([{ host: 'Claude Code', text: '未知', tone: 'plain' }]);
  });

  it('工具只有一个状态，不分宿主：已安装、未安装', async () => {
    const state = await browsing(WEB_SEARCH, {
      onPath: [...BOTH_HOSTS, 'fetcher'],
      catalog: withCatalog({ tools: [FETCHER, { ...LINTER, purpose: 'web-search' }] }),
    });

    expect(entry(state, 'fetcher').statuses).toEqual([{ text: '已安装', tone: 'ready' }]);
    expect(entry(state, 'linter').statuses).toEqual([{ text: '未安装', tone: 'faint' }]);
  });

  it('状态是现查的：页面开着的时候配置上了，刷新就看得到', async () => {
    // Claude Code 的配置目录改到一个测试自己拿得到的地方
    const config = tempDir('claude-config');
    let before: ViewState | undefined;
    let after: ViewState | undefined;
    await run({
      catalog: withoutSkills({ mcps: [DOCS_LOCAL] }),
      env: { CLAUDE_CONFIG_DIR: config },
      page: async (page) => {
        before = page.state();
        writeTree(config, { '.claude.json': JSON.stringify({ mcpServers: { 'docs-local': { type: 'stdio', command: 'old', args: [] } } }) });
        after = await page.reload();
        await done(page);
      },
    });

    expect(before && entry(before, 'docs-local').statuses).toEqual([{ host: 'Claude Code', text: '未配置', tone: 'faint' }]);
    expect(after && entry(after, 'docs-local').statuses).toEqual([{ host: 'Claude Code', text: '已配置', tone: 'ready' }]);
  });
});

describe('网页界面：不可选的条目', () => {
  const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
  const [FETCHER, LINTER] = SAMPLE_TOOLS as [(typeof SAMPLE_TOOLS)[0], (typeof SAMPLE_TOOLS)[1]];
  const [PAPER_KIT] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
  const WEB_SEARCH = '联网搜索与文档检索';
  const reasons = (state: ViewState): Record<string, string | undefined> =>
    Object.fromEntries((state.listing?.sections ?? []).flatMap((section) => section.entries.map((candidate) => [candidate.name, candidate.unavailable])));

  it('所选的宿主一个都不支持它：原因是需要别的 AI Agent；支持的照常可选', async () => {
    // 只检测到 Claude Code
    const state = await browsing(WEB_SEARCH, {
      catalog: withCatalog({
        mcps: [DOCS_LOCAL, { ...TRACKER_REMOTE, purpose: 'web-search', hosts: ['codex'] }],
        thirdPartySkills: [{ ...PAPER_KIT, hosts: ['codex'] }],
        tools: [FETCHER, { ...LINTER, purpose: 'web-search', hosts: ['codex'] }],
      }),
    });

    expect(reasons(state)).toEqual({
      'paper-kit': '需要别的 AI Agent',
      'docs-local': undefined,
      'tracker-remote': '需要别的 AI Agent',
      fetcher: undefined,
      linter: '需要别的 AI Agent',
    });
  });

  it('条目把当前系统标为不支持：原因写明是哪个系统', async () => {
    const state = await browsing(WEB_SEARCH, {
      platform: 'darwin',
      catalog: withCatalog({ tools: [FETCHER, { ...LINTER, purpose: 'web-search', install: { ...LINTER.install, macos: null } }] }),
    });

    expect(reasons(state)).toEqual({ fetcher: undefined, linter: '不支持 macOS' });
  });

  it('一个宿主都没检测到：页面照常能逛，组件都写明需要 AI Agent，没有要装进的宿主', async () => {
    const state = await browsing(WEB_SEARCH, {
      onPath: [],
      catalog: withCatalog({ mcps: [DOCS_LOCAL], thirdPartySkills: [PAPER_KIT], tools: [FETCHER], skillPurposes: { alpha: 'web-search' }, apps: SAMPLE_APPS }),
    });

    expect(state.target.hosts).toEqual([]);
    // 四个名字并列成一项，「未检测到」只写一次；一个名字中间是不换行空格（\u00a0），页面不在那里折行
    expect(state.machine.hosts).toEqual([{ name: 'Claude\u00a0Code、Codex、Pi、omp', detected: false, status: '未检测到' }]);
    expect(reasons(state)).toEqual({ alpha: '需要 AI Agent', 'paper-kit': '需要 AI Agent', 'docs-local': '需要 AI Agent', fetcher: '需要 AI Agent' });
    // 本机信息里有终端界面的那一句提醒
    expect(state.machine.noHosts).toBe('没有检测到 Claude Code、Codex、Pi 或 omp，暂时装不了组件；外部项目仍可浏览');
    // 没有宿主就没有按宿主分的状态
    expect(entry(state, 'alpha').statuses).toEqual([]);
    expect(state.listing?.apps?.entries.map((app) => app.name)).toEqual(['borealis']);
  });
});

describe('网页界面：外部项目', () => {
  const WEB_SEARCH = '联网搜索与文档检索';
  const [ATLAS, BOREALIS] = SAMPLE_APPS as [(typeof SAMPLE_APPS)[0], (typeof SAMPLE_APPS)[1]];

  it('外部项目和组件分开，写明只给链接、不安装；每个带着完整的说明和链接，没有状态、没有可勾选的标记', async () => {
    const state = await browsing('开发工作流与规范', { catalog: withCatalog({ mcps: SAMPLE_MCPS, apps: SAMPLE_APPS }) });

    expect(sections(state.listing)).toEqual([['MCP', ['tracker-remote']]]);
    expect(state.listing?.apps).toEqual({
      title: '外部项目',
      note: '只给链接，不安装',
      entries: [
        {
          name: 'atlas',
          about: '第一个样例外部项目，它的说明同样故意写得很长，长到在列表的一行里放不下，只能截断，全文要到列表下方和选完之后的说明里去看',
          url: 'https://example.com/atlas?tab=readme&lang=zh#install',
        },
      ],
    });
  });

  it('用途下只有外部项目：没有组件的分区；外部项目按名字排，带推荐标记的标出来', async () => {
    const state = await browsing(WEB_SEARCH, {
      catalog: withoutSkills({ apps: [BOREALIS, { ...ATLAS, purpose: 'web-search', recommended: true }, { ...BOREALIS, name: 'cirrus' }] }),
    });

    expect(state.listing?.sections).toEqual([]);
    expect(state.listing?.apps?.entries.map((app) => [app.name, app.mark])).toEqual([
      ['atlas', '推荐'],
      ['borealis', undefined],
      ['cirrus', undefined],
    ]);
  });

  it('列表里没有外部项目：没有这一块', async () => {
    const state = await opening();

    expect(state.listing).not.toHaveProperty('apps');
  });

  it('「推荐」里带推荐标记的外部项目也在，不再逐条标', async () => {
    const state = await opening({ catalog: withCatalog({ apps: [{ ...ATLAS, recommended: true }, BOREALIS] }) });

    expect(state.listing?.apps?.entries.map((app) => app.name)).toEqual(['atlas']);
    expect(state.listing?.apps?.entries[0]).not.toHaveProperty('mark');
  });
});

describe('网页界面：目录里被跳过的条目', () => {
  it('本机信息里写明跳过了几个；它们不在任何一张列表里，也不算进数量', async () => {
    const [DOCS_LOCAL] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
    const state = await browsing('联网搜索与文档检索', {
      catalog: withCatalog({ mcps: [DOCS_LOCAL, { name: 'Bad Name' }, { ...DOCS_LOCAL, name: 'homeless', purpose: 'nowhere' }] }),
    });

    expect(state.machine.skipped).toBe('目录中有 2 个条目格式有误，已跳过');
    expect(state.machine.catalog).toEqual(['2 Skill', '1 MCP']);
    expect(menu(state)).toEqual([
      ['推荐', 2],
      ['联网搜索与文档检索', 1],
    ]);
    expect(sections(state.listing)).toEqual([['MCP', ['docs-local']]]);
    // 检测到了宿主：没有「一个都没检测到」的那一句
    expect(state.machine).not.toHaveProperty('noHosts');
  });
});

describe('网页界面：开场动画播过没有', () => {
  it('这次运行第一次打开时没播过；页面说它播了之后，刷新或再开一个标签页看到的都是播过了', async () => {
    let first: ViewState | undefined;
    let pushed: ViewState | undefined;
    let reloaded: ViewState | undefined;
    await run({
      page: async (page) => {
        first = page.state();
        await page.send({ type: 'intro-seen' });
        pushed = await page.until((state) => state.introSeen);
        reloaded = await page.reload();
        await done(page);
      },
    });

    expect(first?.introSeen).toBe(false);
    expect(reloaded?.introSeen).toBe(true);
    // 别的都没有变
    expect(pushed).toEqual({ ...first, introSeen: true });
  });
});

describe('网页界面：英文', () => {
  it('--lang en：左栏、分区的标题与说明、条目的说明、状态的词、不可选的原因都是英文', async () => {
    const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
    const [PAPER_KIT] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
    const state = await browsing('Web search & docs retrieval', {
      argv: ['--lang', 'en'],
      catalog: withCatalog({ mcps: [{ ...DOCS_LOCAL, recommended: true }, { ...TRACKER_REMOTE, purpose: 'web-search', hosts: ['codex'] }], thirdPartySkills: [PAPER_KIT], apps: SAMPLE_APPS }),
      home: { '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n' },
    });

    expect(menu(state)).toEqual([
      ['Recommended', 3],
      ['Web search & docs retrieval', 4],
      ['Development workflow & conventions', 1],
    ]);
    expect(state.listing?.sections.map((section) => [section.title, section.note])).toEqual([
      ['Third-party skills', 'content comes straight from the author'],
      ['MCP', undefined],
    ]);
    expect(entry(state, 'paper-kit').statuses).toEqual([{ host: 'Claude Code', text: 'installed', tone: 'ready', rest: '1/3' }]);
    expect(entry(state, 'docs-local').about).toBe(DOCS_LOCAL.description.en);
    expect(entry(state, 'docs-local').statuses).toEqual([{ host: 'Claude Code', text: 'none', tone: 'faint' }]);
    expect(entry(state, 'tracker-remote').unavailable).toBe('needs another AI Agent');
    expect(entry(state, 'docs-local').mark).toBe('pick');
    expect(state.target).toMatchObject({ hostsLabel: 'Install into which AI Agents', scopeLabel: 'Install where', scopes: [{ name: 'Global' }, { name: 'Project' }] });
    expect(entry(state, 'paper-kit')).not.toHaveProperty('mark');
    expect(state.listing?.apps).toMatchObject({ title: 'External projects', note: 'links only, nothing is installed', entries: [{ name: 'borealis', about: 'The second sample external project' }] });
  });
});

describe('网页界面：站点图标', () => {
  it('和别的静态文件一样不要口令就拿得到，是一张 SVG，里面没有口令、没有指向外面的地址', async () => {
    let icon: Awaited<ReturnType<Page['request']>> | undefined;
    let index = '';
    let token = '';
    await run({
      page: async (page) => {
        token = page.token;
        icon = await page.request('/favicon.svg');
        index = (await page.request('/')).body;
        await done(page);
      },
    });

    expect(icon?.status).toBe(200);
    expect(icon?.headers['content-type']).toContain('image/svg+xml');
    expect(icon?.headers['cache-control']).toBe('no-store');
    expect(icon?.body).toMatch(/^<svg /);
    expect(icon?.body).not.toContain(token);
    // XML 命名空间是标识，不是要去取的地址；除此之外一个网址都没有
    expect((icon?.body.match(/https?:\/\/[^"\s]+/g) ?? []).filter((address) => !address.startsWith('http://www.w3.org/'))).toEqual([]);
    expect(index).toContain('href="/favicon.svg"');
  });
});
