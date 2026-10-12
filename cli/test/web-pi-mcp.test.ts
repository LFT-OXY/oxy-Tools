// 网页界面里 Pi 的 MCP：都经主接缝，架子扮演浏览器。命令、状态、提醒和终端界面是同一份（pi-mcp.test.ts）
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, KeysView, RunView, SummaryView, ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, KEYED_MCP, SAMPLE_MCPS, accept, catalogDir, choose, pick, run, secret, tempDir, underWebSearch, writeTree, type Page, type RunResult } from './harness.ts';

// 样例的 MCP 都放进同一个用途
const WEB_SEARCH = '联网搜索与文档检索';
const withMcps = (...mcps: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...mcps) } });
const [LOCAL, REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
const ONLY_PI = ['pi'];
const ALL_HOSTS = ['claude', 'codex', 'pi'];
// Pi 项目范围的配置文件，相对项目目录
const PI_FILE = join('.pi', 'mcp.json');
// Pi 的 MCP 配置：一个 mcp.json，顶层的 mcpServers 里一个名字一条
const piConfig = (...names: string[]): string => JSON.stringify({ mcpServers: Object.fromEntries(names.map((name) => [name, { command: 'old', args: [] }])) });

// 期望的命令是字面值，出处是 Pi 随包的文档（见「安装 MCP」的那张表），和终端界面的测试是同一份
const PI_ADD_LOCAL = { command: 'pi', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const PI_REMOVE_LOCAL = { command: 'pi', args: ['mcp', 'remove', 'docs-local'] };
const PI_ADD_REMOTE = { command: 'pi', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
// 用户粘贴进来的 key：它只许出现在记录到的命令里
const KEY_VALUE = 'sk-test-4f9a2c71d0';
const PI_ADD_KEYED = { command: 'pi', args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] };
// 装到项目：带 -l，在项目目录下运行（cwd 到断言时才知道）
const PI_ADD_KEYED_TO_PROJECT = { command: 'pi', args: ['mcp', 'add', 'search-keyed', '-l', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] };

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
const tick = async (page: Page, name: string): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'mcp', name, on: true });
  return page.until((state) => state.selected.some((entry) => entry.name === name));
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
// 浏览时点「去汇总」，已选里有要 key 的 MCP：先到填 key
const toKeys = async (page: Page): Promise<KeysView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.keys !== undefined)).keys as KeysView;
};
const fill = async (page: Page, mcp: string, variable: string, value: string): Promise<ViewState> => {
  await page.send({ type: 'key', mcp, variable, value });
  return page.until((state) => state.keys?.entries.find((entry) => entry.mcp === mcp)?.variables.find((one) => one.name === variable)?.filled !== undefined);
};
const toProject = async (page: Page): Promise<ViewState> => {
  await page.send({ type: 'scope', scope: 'project' });
  return page.until((state) => state.target.scope === 'project');
};
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// dir 下每个文件的内容，连成一份
const everyFile = (dir: string): string =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
// 正在看的那张列表里 MCP 的那一区，和其中名字是它的卡片
const mcpSection = (state: ViewState | undefined) => state?.listing?.sections.find((section) => section.kind === 'mcp');
const card = (state: ViewState | undefined, name: string): ComponentView | undefined => mcpSection(state)?.entries.find((entry) => entry.name === name);
// 汇总写成几行字：条目 · 类型，下面每行宿主/操作/备注
const rows = (summary: SummaryView | undefined): string[] =>
  (summary?.entries ?? []).flatMap((entry) => [
    [entry.name, entry.type, entry.version].filter((part) => part !== undefined).join(' · '),
    ...entry.rows.map((row) => `  ${[row.host, row.action, row.location, row.note].filter((part) => part !== undefined).join(' | ')}`),
  ]);
const outcomes = (batch: RunView | undefined): string[] => (batch?.rows ?? []).map((row) => [row.name, row.host, row.text, row.rest].filter(Boolean).join(' '));
const totals = (batch: RunView | undefined): string =>
  batch?.totals ? [batch.totals.succeeded, batch.totals.failed, batch.totals.skipped].map(({ count, word }) => `${count} ${word}`).join(' · ') : '';

describe('网页界面：把 MCP 装进 Pi', () => {
  it('只检测到 Pi：卡片上是「未配置」、勾得上；确认之后记录到的正好是 Pi 的那两条添加命令，结果是「已配置」；没有登录的提醒', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL, REMOTE),
      onPath: ONLY_PI,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await tick(page, 'tracker-remote');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Pi', text: '未配置', tone: 'faint' }]);
    expect(card(listed, 'docs-local')).not.toHaveProperty('unavailable');
    expect(mcpSection(listed)).not.toHaveProperty('notices');
    expect(summary?.title).toBe('将安装 2 项');
    expect(rows(summary)).toEqual(['docs-local · MCP', '  Pi | 新装', 'tracker-remote · MCP', '  Pi | 新装']);
    // Pi 的添加命令只写配置、不连接服务器：远程地址的也没有登录的提醒
    expect(summary?.notices).toEqual([]);
    expect(result.commands).toEqual([PI_ADD_LOCAL, PI_ADD_REMOTE]);
    expect(outcomes(batch)).toEqual(['docs-local Pi 已配置', 'tracker-remote Pi 已配置']);
    expect(totals(batch)).toBe('2 成功 · 0 失败 · 0 跳过');
    expect(result.exitCode).toBe(0);
  });

  it('三个宿主：卡片上每个宿主一段、各看各的配置；一个 MCP 各装一次，三行结果；Pi 那里已配置的先移除再添加', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
      { host: 'Pi', text: '已配置', tone: 'ready' },
    ]);
    expect(rows(summary)).toEqual(['docs-local · MCP', '  Claude Code | 新装', '  Codex | 新装', '  Pi | 覆盖 | 已配置，先移除再添加']);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_REMOVE_LOCAL, PI_ADD_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置', 'docs-local Codex 已配置', 'docs-local Pi 已配置']);
    expect(totals(batch)).toBe('3 成功 · 0 失败 · 0 跳过');
  });

  it('设置了 PI_CODING_AGENT_DIR：状态看的是那个目录里的 mcp.json', async () => {
    const elsewhere = tempDir('pi-agent');
    writeTree(elsewhere, { 'mcp.json': piConfig('tracker-remote') });
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(LOCAL, REMOTE),
      onPath: ONLY_PI,
      env: { PI_CODING_AGENT_DIR: elsewhere },
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Pi', text: '未配置', tone: 'faint' }]);
    expect(card(listed, 'tracker-remote')?.statuses).toEqual([{ host: 'Pi', text: '已配置', tone: 'ready' }]);
  });

  it('Pi 的配置读不了：那一区上方有一句提醒，状态是「未知」；汇总里是添加和备注，先尝试移除、不管成不成都接着添加', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': '{ 写坏了' },
      commandResult: (_, args) => (args[1] === 'remove' ? { exitCode: 1 } : undefined),
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(mcpSection(listed)?.notices).toEqual(['读不到 Pi 的配置，无法判断哪些 MCP 已配置']);
    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Pi', text: '未知', tone: 'plain' }]);
    expect(rows(summary)).toEqual(['docs-local · MCP', '  Pi | 添加 | 状态未知，先尝试移除同名配置']);
    expect(result.commands).toEqual([PI_REMOVE_LOCAL, PI_ADD_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Pi 已配置']);
  });

  it('Pi 的命令非零退出、没能起来：那一行是失败和原因，别的宿主照常，退出状态 0', async () => {
    let exited: RunView | undefined;
    let missing: RunView | undefined;
    const whenExited = await run({
      catalog: withMcps(LOCAL),
      onPath: ALL_HOSTS,
      commandResult: (command) => (command === 'pi' ? { exitCode: 1 } : undefined),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        exited = await install(page, await review(page));
        await done(page);
      },
    });
    await run({
      catalog: withMcps(LOCAL),
      onPath: ALL_HOSTS,
      commandResult: (command) => (command === 'pi' ? Object.assign(new Error('spawn pi ENOENT'), { code: 'ENOENT' }) : undefined),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        missing = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(exited)).toEqual(['docs-local Claude Code 已配置', 'docs-local Codex 已配置', 'docs-local Pi 失败 添加命令退出状态 1']);
    expect(totals(exited)).toBe('2 成功 · 1 失败 · 0 跳过');
    expect(outcomes(missing)).toEqual(['docs-local Claude Code 已配置', 'docs-local Codex 已配置', 'docs-local Pi 失败 添加命令没能运行（ENOENT）']);
    expect(whenExited.exitCode).toBe(0);
  });

  it('执行的命令和用终端界面装同样的东西时逐条相同', async () => {
    const web = await run({
      catalog: withMcps(LOCAL, REMOTE),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await tick(page, 'tracker-remote');
        await install(page, await review(page));
        await done(page);
      },
    });
    const terminal = await run({
      catalog: withMcps(LOCAL, REMOTE),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local', 'tracker-remote'), choose('开始安装'), choose('退出')],
    });

    expect(web.commands.filter(({ command }) => command === 'pi')).toEqual([PI_REMOVE_LOCAL, PI_ADD_LOCAL, PI_ADD_REMOTE]);
    expect(web.commands).toEqual(terminal.commands);
  });

  it('英文界面：状态词、汇总、提醒和结果', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(LOCAL),
      onPath: ONLY_PI,
      project: { '.pi/mcp.json': '{ broken' },
      page: async (page) => {
        await open(page, 'Web search & docs retrieval');
        listed = await toProject(page);
        await tick(page, 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(mcpSection(listed)?.notices).toEqual(['Could not read the Pi config; cannot tell which MCP servers are configured']);
    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Pi', text: 'unknown', tone: 'plain' }]);
    expect(summary?.notices).toEqual([`Pi saves MCP servers to ${PI_FILE} here and enables them only once you approve: it asks when you start pi here`]);
    expect(outcomes(batch)).toEqual(['docs-local Pi configured']);
  });
});

describe('网页界面：把 MCP 装到项目的 Pi', () => {
  it('只检测到 Pi、带 key：状态看项目目录的 .pi/mcp.json；命令带 -l、在项目目录下运行；两句提醒写着变量名、文件和启动命令', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP, LOCAL),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': piConfig('search-keyed') },
      project: { '.pi/mcp.json': piConfig('docs-local') },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await toProject(page);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(card(listed, 'search-keyed')?.statuses).toEqual([{ host: 'Pi', text: '未配置', tone: 'faint' }]);
    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Pi', text: '已配置', tone: 'ready' }]);
    expect(rows(summary)).toEqual(['search-keyed · MCP', '  Pi | 新装']);
    expect(summary?.notices).toEqual([
      `SEARCH_API_KEY 会以明文写进 ${PI_FILE}，不要提交，也不要发给别人`,
      `Pi 的 MCP 写进当前目录的 ${PI_FILE}，要你批准之后才启用：在这个目录下启动 pi 时它会问`,
    ]);
    expect(result.commands).toEqual([{ ...PI_ADD_KEYED_TO_PROJECT, cwd: result.project }]);
    expect(outcomes(batch)).toEqual(['search-keyed Pi 已配置']);
  });

  it('三个宿主：Codex 那一段是「不支持」并说明原因，装进 Claude Code 和 Pi；明文的提醒点到两个文件，两个宿主各一句要批准', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ALL_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await toProject(page);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(mcpSection(listed)?.notices).toEqual(['Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令']);
    expect(card(listed, 'search-keyed')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '不支持', tone: 'faint' },
      { host: 'Pi', text: '未配置', tone: 'faint' },
    ]);
    expect(rows(summary)).toEqual(['search-keyed · MCP', '  Claude Code | 新装', '  Pi | 新装']);
    expect(summary?.notices).toEqual([
      `SEARCH_API_KEY 会以明文写进 .mcp.json、${PI_FILE}，不要提交，也不要发给别人`,
      'Claude Code 的 MCP 写进当前目录的 .mcp.json，要你批准之后才启用：在这个目录下启动 claude 时它会问',
      `Pi 的 MCP 写进当前目录的 ${PI_FILE}，要你批准之后才启用：在这个目录下启动 pi 时它会问`,
    ]);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'], cwd: result.project },
      { ...PI_ADD_KEYED_TO_PROJECT, cwd: result.project },
    ]);
    expect(outcomes(batch)).toEqual(['search-keyed Claude Code 已配置', 'search-keyed Pi 已配置']);
  });
});

describe('网页界面：填给 Pi 的 key 不出现在任何别处', () => {
  // 这一页收到的全部东西、终端上的全部输出、交给链接打开器的网址、三个目录里的每个文件，整份去搜
  const everywhere = (result: RunResult, received: string): string =>
    [received, result.raw, result.stdout, result.stderr, ...result.opened, everyFile(result.home), everyFile(result.project), everyFile(result.tmp)].join('\n');
  // 走完一遍：勾上、填 key、刷新、去汇总、确认、看结果、换语言、再刷新、完成。给出这一页收到的全部东西
  const journey = async (page: Page): Promise<string> => {
    await open(page, WEB_SEARCH);
    await tick(page, 'search-keyed');
    await toKeys(page);
    await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
    await page.reload();
    await install(page, await review(page));
    await page.send({ type: 'lang', lang: 'en' });
    await page.reload();
    await done(page);
    return page.received();
  };

  it('三个宿主、key 只填一次：三条命令都带着它；值只在记录到的命令里', async () => {
    let received = '';
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: ALL_HOSTS, project: { 'notes.md': '项目里原有的文件\n' }, page: async (page) => void (received = await journey(page)) });

    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] },
      { command: 'codex', args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] },
      PI_ADD_KEYED,
    ]);
    const haystack = everywhere(result, received);
    // 该在里面的都在：画面状态里的条目和变量名、结果、项目里的文件
    for (const present of ['search-keyed', 'SEARCH_API_KEY', '已填', '已配置', '项目里原有的文件']) expect(haystack).toContain(present);
    expect(haystack).not.toContain(KEY_VALUE);
  });

  it('装到项目的 Pi：提醒里有变量名和文件名，没有值', async () => {
    let received = '';
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      page: async (page) => {
        await toProject(page);
        received = await journey(page);
      },
    });

    expect(result.commands).toEqual([{ ...PI_ADD_KEYED_TO_PROJECT, cwd: result.project }]);
    const haystack = everywhere(result, received);
    expect(haystack).toContain(JSON.stringify(`SEARCH_API_KEY 会以明文写进 ${PI_FILE}，不要提交，也不要发给别人`).slice(1, -1));
    expect(haystack).not.toContain(KEY_VALUE);
  });

  it('Pi 的命令起不来而错误消息里带着整条命令：原因里没有值', async () => {
    let received = '';
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      commandResult: (command, args) => new Error(`spawn ${command} ${args.join(' ')} failed: ${JSON.stringify(args)}`),
      page: async (page) => void (received = await journey(page)),
    });

    const haystack = everywhere(result, received);
    expect(haystack).toContain('添加命令没能运行');
    expect(haystack).not.toContain(KEY_VALUE);
    expect(haystack).not.toContain('spawn pi');
  });

  it('画面状态里没有将执行的命令', async () => {
    let received = '';
    await run({
      catalog: withMcps(KEYED_MCP, LOCAL),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await tick(page, 'docs-local');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await install(page, await review(page));
        await done(page);
        received = page.received();
      },
    });

    expect(received).toContain('先移除再添加');
    expect(received).not.toMatch(/mcp add|mcp remove|--env|--url|@example\/|npx/);
  });
});
