// 网页界面里装 MCP、填 key：都经主接缝，架子扮演浏览器。命令、状态、成败的判法和终端界面同一份
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, KeysView, RunView, SummaryView, ViewState } from '../src/web-protocol.ts';
import {
  EMPTY_CATALOG,
  KEYED_MCP,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  accept,
  catalogDir,
  choose,
  pick,
  run,
  secret,
  underWebSearch,
  writeTree,
  type Page,
  type RunResult,
} from './harness.ts';

// 样例的 MCP 都放进同一个用途
const WEB_SEARCH = '联网搜索与文档检索';
const withMcps = (...mcps: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...mcps) } });
const [LOCAL, REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
const BOTH_HOSTS = ['claude', 'codex'];

// 期望的命令是字面值，出处是两个宿主的官方文档（见「安装 MCP」的那张表），和终端界面的测试是同一份
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CLAUDE_REMOVE_LOCAL = { command: 'claude', args: ['mcp', 'remove', '--scope', 'user', 'docs-local'] };
const CLAUDE_ADD_REMOTE = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'tracker-remote', 'https://mcp.example.org/mcp'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_REMOVE_LOCAL = { command: 'codex', args: ['mcp', 'remove', 'docs-local'] };
const CODEX_ADD_REMOTE = { command: 'codex', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
// 用户粘贴进来的 key：它只许出现在记录到的命令里
const KEY_VALUE = 'sk-test-4f9a2c71d0';
const CLAUDE_ADD_KEYED = {
  command: 'claude',
  args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
};
const CODEX_ADD_KEYED = {
  command: 'codex',
  args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
};
const CLAUDE_ADD_NO_KEY = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '--', 'npx', '-y', '@example/search-mcp'] };
const TEAM = {
  name: 'SEARCH_TEAM_ID',
  required: false,
  description: { zh: '团队编号，按团队计费时填', en: 'Team id, for per-team billing' },
  url: 'https://example.com/search/teams',
};
// 必填的在前、可选的在后
const WITH_OPTIONAL = { ...KEYED_MCP, env: [...KEYED_MCP.env, TEAM] };
const ONLY_OPTIONAL = { ...KEYED_MCP, env: [TEAM] };
// 装到项目：带 --scope project，在项目目录下运行（cwd 到断言时才知道）
const CLAUDE_ADD_KEYED_TO_PROJECT = {
  command: 'claude',
  args: ['mcp', 'add', '--scope', 'project', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
};
// Claude Code 的用户级配置里已有这些 MCP
const claudeConfigured = (...names: string[]): Record<string, string> => ({
  '.claude.json': JSON.stringify({ mcpServers: Object.fromEntries(names.map((name) => [name, { command: 'npx' }])) }),
});

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
// 勾上（或去掉）一个 MCP，给出之后的画面状态
const tick = async (page: Page, name: string, on = true): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'mcp', name, on });
  return page.until((state) => state.selected.some((entry) => entry.name === name) === on);
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
// 填（或换）一个 key，等到画面状态里它是填过的
const fill = async (page: Page, mcp: string, variable: string, value: string): Promise<ViewState> => {
  await page.send({ type: 'key', mcp, variable, value });
  return page.until((state) => filledIn(state, mcp).includes(variable));
};
// 填 key 那一步里这个 MCP 填过的变量的名字
const filledIn = (state: ViewState, mcp: string): string[] =>
  (state.keys?.entries.find((entry) => entry.mcp === mcp)?.variables ?? []).filter((variable) => variable.filled !== undefined).map((variable) => variable.name);
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
const toProject = async (page: Page): Promise<ViewState> => {
  await page.send({ type: 'scope', scope: 'project' });
  return page.until((state) => state.target.scope === 'project');
};
const host = async (page: Page, id: string, on: boolean): Promise<ViewState> => {
  await page.send({ type: 'host', host: id, on });
  return page.until((state) => state.target.choices.some((choice) => choice.id === id && choice.on === on));
};
// dir 下每个文件的内容，连成一份
const everyFile = (dir: string): string =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 正在看的那张列表里名字是它的 MCP 的卡片
const mcpSection = (state: ViewState | undefined) => state?.listing?.sections.find((section) => section.kind === 'mcp');
const card = (state: ViewState, name: string): ComponentView | undefined => mcpSection(state)?.entries.find((entry) => entry.name === name);
// 汇总写成几行字：条目 · 类型 · 版本，下面每行宿主/操作/位置/备注
const rows = (summary: SummaryView): string[] =>
  summary.entries.flatMap((entry) => [
    [entry.name, entry.type, entry.version].filter((part) => part !== undefined).join(' · '),
    ...entry.rows.map((row) => `  ${[row.host, row.action, row.location, row.note].filter((part) => part !== undefined).join(' | ')}`),
  ]);
const outcomes = (batch: RunView | undefined): string[] => (batch?.rows ?? []).map((row) => [row.name, row.host, row.text, row.rest].filter(Boolean).join(' '));
const totals = (batch: RunView | undefined): string =>
  batch?.totals ? [batch.totals.succeeded, batch.totals.failed, batch.totals.skipped].map(({ count, word }) => `${count} ${word}`).join(' · ') : '';

describe('网页界面：装 MCP', () => {
  it('本地进程的：勾上、去汇总、确认，记录到的正好是那一条添加命令，结果是「已配置」', async () => {
    let picked: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        picked = await tick(page, 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(picked?.selected).toEqual([{ kind: 'mcp', name: 'docs-local', type: 'MCP' }]);
    expect(card(picked as ViewState, 'docs-local')).toMatchObject({ picked: true });
    expect(summary?.title).toBe('将安装 1 项');
    expect(rows(summary as SummaryView)).toEqual(['docs-local · MCP', '  Claude Code | 新装']);
    expect(summary?.notices).toEqual([]);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 0 跳过');
    expect(result.exitCode).toBe(0);
  });

  it('远程地址的、两个宿主：每个宿主一行、各一条添加命令；提醒里有 Codex 可能当场打开浏览器登录的那一句', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(REMOTE),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'tracker-remote');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary as SummaryView)).toEqual(['tracker-remote · MCP', '  Claude Code | 新装', '  Codex | 新装']);
    expect(summary?.notices).toEqual([
      'Codex 添加远程地址的 MCP 时可能当场打开浏览器登录，登录完这一项才结束。浏览器打不开就按 Ctrl+C，之后执行 codex mcp login <名称>',
    ]);
    expect(result.commands).toEqual([CLAUDE_ADD_REMOTE, CODEX_ADD_REMOTE]);
    expect(outcomes(batch)).toEqual(['tracker-remote Claude Code 已配置', 'tracker-remote Codex 已配置']);
  });

  it('已配置的：卡片上写「已配置」，汇总里是覆盖和备注，先移除再添加', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      onPath: BOTH_HOSTS,
      home: claudeConfigured('docs-local'),
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(card(listed as ViewState, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: '已配置', tone: 'ready' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
    ]);
    expect(rows(summary as SummaryView)).toEqual(['docs-local · MCP', '  Claude Code | 覆盖 | 已配置，先移除再添加', '  Codex | 新装']);
    expect(summary?.entries[0]?.rows.map((row) => row.overwrites)).toEqual([true, undefined]);
    // 「整目录替换」说的是 skill，不因为 MCP 出现
    expect(summary?.notices).toEqual([]);
    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL]);
  });

  it('宿主的配置读不了：那一区上方有一句提醒，状态是「未知」；汇总里是添加和备注，先尝试移除、不管成不成都接着添加', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      onPath: BOTH_HOSTS,
      home: { '.codex/config.toml': '[mcp_servers\n写坏了' },
      commandResult: (command, args) => (command === 'codex' && args[1] === 'remove' ? { exitCode: 1 } : undefined),
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(mcpSection(listed)?.notices).toEqual(['读不到 Codex 的配置，无法判断哪些 MCP 已配置']);
    expect(card(listed as ViewState, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '未知', tone: 'plain' },
    ]);
    expect(rows(summary as SummaryView)).toEqual(['docs-local · MCP', '  Claude Code | 新装', '  Codex | 添加 | 状态未知，先尝试移除同名配置']);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_REMOVE_LOCAL, CODEX_ADD_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置', 'docs-local Codex 已配置']);
  });

  it('配置都读得了时那一区没有提醒', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(LOCAL),
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(mcpSection(listed)).not.toHaveProperty('notices');
  });
});

describe('网页界面：填 key', () => {
  it('带 key 的：去汇总先到填 key——变量的说明、必填、申请的网址、不填会怎样；填了之后只写「已填」，命令带着填的值', async () => {
    let picked: ViewState | undefined;
    let asked: KeysView | undefined;
    let filled: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        picked = await tick(page, 'search-keyed');
        asked = await toKeys(page);
        filled = await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(card(picked as ViewState, 'search-keyed')?.key).toBe('要填 key');
    expect(picked?.selected).toEqual([{ kind: 'mcp', name: 'search-keyed', type: 'MCP', key: { text: '要填 key', tone: 'attention' } }]);
    expect(asked).toEqual({
      entries: [
        {
          mcp: 'search-keyed',
          purpose: '联网搜索与文档检索',
          variables: [
            {
              name: 'SEARCH_API_KEY',
              required: true,
              need: '必填',
              about: '样例搜索服务的密钥',
              url: 'https://example.com/search/api-keys',
              blank: '不填就不装 search-keyed，其余照常装',
            },
          ],
        },
      ],
    });
    expect(filled?.keys?.entries[0]?.variables[0]).toMatchObject({ name: 'SEARCH_API_KEY', filled: '已填' });
    expect(filled?.selected[0]?.key).toEqual({ text: 'key 已填', tone: 'ready' });
    // 填 key 的时候还没有汇总；到了汇总就没有填 key 了
    expect(filled?.summary).toBeUndefined();
    expect(rows(summary as SummaryView)).toEqual(['search-keyed · MCP', '  Claude Code | 新装']);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
    expect(outcomes(batch)).toEqual(['search-keyed Claude Code 已配置']);
    expect(result.exitCode).toBe(0);
  });

  it('不要 key 的 MCP：去汇总直接是汇总，画面状态里没有填 key', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: withMcps(LOCAL, KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await review(page);
        state = page.state();
        await done(page);
      },
    });

    expect(state?.keys).toBeUndefined();
    expect(card(state as ViewState, 'docs-local')).not.toHaveProperty('key');
    expect(state?.selected[0]).not.toHaveProperty('key');
  });

  it('必填的没填：这个 MCP 不装——汇总里不算它、提醒写明缺哪个变量，结果里是跳过；其余照常', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL, KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await tick(page, 'search-keyed');
        await toKeys(page);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.title).toBe('将安装 1 项');
    expect(rows(summary as SummaryView)).toEqual(['docs-local · MCP', '  Claude Code | 新装']);
    expect(summary?.notices).toEqual(['search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装']);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置', 'search-keyed Claude Code 跳过 未填写必填的 SEARCH_API_KEY']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 1 跳过');
    expect(result.exitCode).toBe(0);
  });

  it('只勾了它、必填的没填：汇总是「将安装 0 项」加那条提醒，确认之后结果里是跳过，没有命令', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.title).toBe('将安装 0 项');
    expect(summary?.entries).toEqual([]);
    expect(summary?.notices).toEqual(['search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装']);
    expect(result.commands).toEqual([]);
    expect(outcomes(batch)).toEqual(['search-keyed Claude Code 跳过 未填写必填的 SEARCH_API_KEY', 'search-keyed Codex 跳过 未填写必填的 SEARCH_API_KEY']);
    expect(totals(batch)).toBe('0 成功 · 0 失败 · 2 跳过');
  });

  it('可选的没填：照常装，命令里不带那个变量；填 key 里它写着「可选」和留空会怎样', async () => {
    let asked: KeysView | undefined;
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: withMcps(WITH_OPTIONAL),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        asked = await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(asked?.entries[0]?.variables.map(({ name, required, need, blank }) => ({ name, required, need, blank }))).toEqual([
      { name: 'SEARCH_API_KEY', required: true, need: '必填', blank: '不填就不装 search-keyed，其余照常装' },
      { name: 'SEARCH_TEAM_ID', required: false, need: '可选', blank: '留空则不设置这个变量' },
    ]);
    expect(summary?.notices).toEqual([]);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
  });

  it('只有可选的 key：卡片上是「可选的 key」，已选里不写要填；一个都不填也装', async () => {
    let picked: ViewState | undefined;
    const result = await run({
      catalog: withMcps(ONLY_OPTIONAL),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        picked = await tick(page, 'search-keyed');
        await toKeys(page);
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(card(picked as ViewState, 'search-keyed')?.key).toBe('可选的 key');
    expect(picked?.selected).toEqual([{ kind: 'mcp', name: 'search-keyed', type: 'MCP' }]);
    expect(result.commands).toEqual([CLAUDE_ADD_NO_KEY]);
  });

  it('两个宿主：key 只填一次，两个宿主的命令都带着它', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', `  ${KEY_VALUE}\t `);
        await install(page, await review(page));
        await done(page);
      },
    });

    // 粘贴进来的首尾空白去掉了
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CODEX_ADD_KEYED]);
  });

  it('同一次运行里的第二批：填过的写着「已填」，不用再填就装得了', async () => {
    let again: KeysView | undefined;
    let tray: ViewState | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await install(page, await review(page));
        await page.send({ type: 'continue' });
        await page.until((state) => state.run === undefined);
        tray = await tick(page, 'search-keyed');
        again = await toKeys(page);
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(tray?.selected[0]?.key).toEqual({ text: 'key 已填', tone: 'ready' });
    expect(again?.entries[0]?.variables[0]).toMatchObject({ name: 'SEARCH_API_KEY', filled: '已填' });
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CLAUDE_ADD_KEYED]);
  });

  it('换一个：再填一次就是新的值，命令里只有新的', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', 'sk-pasted-the-wrong-one');
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
  });

  it('返回修改：从填 key、从汇总回到浏览，勾选和填过的 key 都还在', async () => {
    let backFromKeys: ViewState | undefined;
    let backFromSummary: ViewState | undefined;
    let again: KeysView | undefined;
    await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await page.send({ type: 'revise' });
        backFromKeys = await page.until((state) => state.keys === undefined);
        await toKeys(page);
        await review(page);
        await page.send({ type: 'revise' });
        backFromSummary = await page.until((state) => state.summary === undefined);
        again = await toKeys(page);
        await done(page);
      },
    });

    expect(backFromKeys?.summary).toBeUndefined();
    expect(backFromKeys?.selected).toEqual([{ kind: 'mcp', name: 'search-keyed', type: 'MCP', key: { text: 'key 已填', tone: 'ready' } }]);
    expect(backFromSummary?.keys).toBeUndefined();
    expect(backFromSummary?.selected).toEqual(backFromKeys?.selected);
    expect(again?.entries[0]?.variables[0]?.filled).toBe('已填');
  });

  it('换语言：填过的 key 还在，填 key 里的话和已选里的词换成英文', async () => {
    let state: ViewState | undefined;
    const result = await run({
      catalog: withMcps(WITH_OPTIONAL),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await page.send({ type: 'lang', lang: 'en' });
        state = await page.until((candidate) => candidate.lang === 'en');
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(state?.keys).toEqual({
      entries: [
        {
          mcp: 'search-keyed',
          purpose: 'Web search & docs retrieval',
          variables: [
            {
              name: 'SEARCH_API_KEY',
              required: true,
              need: 'required',
              about: 'Key for the sample search service',
              url: 'https://example.com/search/api-keys',
              filled: 'entered',
              blank: 'Leave it empty and search-keyed is skipped; the rest still installs',
            },
            {
              name: 'SEARCH_TEAM_ID',
              required: false,
              need: 'optional',
              about: 'Team id, for per-team billing',
              url: 'https://example.com/search/teams',
              blank: 'Leave it empty to leave this variable unset',
            },
          ],
        },
      ],
    });
    expect(state?.selected[0]).toMatchObject({ type: 'MCP', key: { text: 'key entered', tone: 'ready' } });
    expect(card(state as ViewState, 'search-keyed')?.key).toBe('needs a key');
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
  });

  it('不照办的填：浏览时、汇总时、没勾上的 MCP、不要 key 的 MCP、不是它的变量、空的值、多带了字段；填过的不变', async () => {
    const statuses: Record<string, number> = {};
    let after: ViewState | undefined;
    const key = { type: 'key', mcp: 'search-keyed', variable: 'SEARCH_API_KEY', value: KEY_VALUE };
    await run({
      catalog: withMcps(LOCAL, KEYED_MCP, { ...WITH_OPTIONAL, name: 'search-unpicked' }),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await tick(page, 'search-keyed');
        statuses['浏览时'] = await post(page, key);
        await toKeys(page);
        statuses['没勾上的'] = await post(page, { ...key, mcp: 'search-unpicked' });
        statuses['不要 key 的'] = await post(page, { ...key, mcp: 'docs-local' });
        statuses['不在目录里'] = await post(page, { ...key, mcp: 'nowhere' });
        statuses['不是它的变量'] = await post(page, { ...key, variable: 'SEARCH_TEAM_ID' });
        statuses['空的值'] = await post(page, { ...key, value: '' });
        statuses['只有空白'] = await post(page, { ...key, value: ' \t\n' });
        statuses['值不是字符串'] = await post(page, { ...key, value: 42 });
        statuses['多带了字段'] = await post(page, { ...key, command: 'rm -rf ~' });
        statuses['填 key 时勾选'] = await post(page, { type: 'pick', kind: 'mcp', name: 'search-unpicked', on: true });
        statuses['填 key 时改范围'] = await post(page, { type: 'scope', scope: 'project' });
        statuses['填 key 时确认安装'] = await post(page, { type: 'install', summary: 'anything' });
        statuses['填 key 时挑 skill'] = await post(page, { type: 'choose', entry: 'search-keyed', skill: 'anything', on: true });
        statuses['填 key 时改宿主'] = await post(page, { type: 'host', host: 'claude-code', on: true });
        statuses['填 key 时决定覆盖'] = await post(page, { type: 'overwrite', item: 'anything', on: true });
        statuses['填 key 时继续挑选'] = await post(page, { type: 'continue' });
        after = page.state();
        await review(page);
        statuses['汇总时'] = await post(page, key);
        await done(page);
      },
    });

    expect(statuses).toEqual({
      浏览时: 400,
      没勾上的: 400,
      '不要 key 的': 400,
      不在目录里: 400,
      不是它的变量: 400,
      空的值: 400,
      只有空白: 400,
      值不是字符串: 400,
      多带了字段: 400,
      '填 key 时勾选': 400,
      '填 key 时改范围': 400,
      '填 key 时确认安装': 400,
      '填 key 时挑 skill': 400,
      '填 key 时改宿主': 400,
      '填 key 时决定覆盖': 400,
      '填 key 时继续挑选': 400,
      汇总时: 400,
    });
    expect(after && filledIn(after, 'search-keyed')).toEqual([]);
    // 填 key 里只有已选里要 key 的那一个
    expect(after?.keys?.entries.map((entry) => entry.mcp)).toEqual(['search-keyed']);
  });
});

describe('网页界面：把 MCP 装到项目', () => {
  it('两个宿主：那一区写明 Codex 的 MCP 只能装到全局，它那一栏是「不支持」；只装进 Claude Code，命令带 --scope project、在项目目录下运行', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: BOTH_HOSTS,
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
    expect(card(listed as ViewState, 'search-keyed')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '不支持', tone: 'faint' },
    ]);
    expect(card(listed as ViewState, 'search-keyed')).not.toHaveProperty('unavailable');
    expect(rows(summary as SummaryView)).toEqual(['search-keyed · MCP', '  Claude Code | 新装']);
    // 明文写进哪个文件（说变量名和文件，不说值）、哪个宿主要另行批准才启用
    expect(summary?.notices).toEqual([
      'SEARCH_API_KEY 会以明文写进 .mcp.json，不要提交，也不要发给别人',
      'Claude Code 的 MCP 写进当前目录的 .mcp.json，要你批准之后才启用：在这个目录下启动 claude 时它会问',
    ]);
    expect(result.commands).toEqual([{ ...CLAUDE_ADD_KEYED_TO_PROJECT, cwd: result.project }]);
    expect(outcomes(batch)).toEqual(['search-keyed Claude Code 已配置']);
  });

  it('项目里配过的：状态看的是项目目录的 .mcp.json，先移除再添加，都带 --scope project、都在项目目录下', async () => {
    let listed: ViewState | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      home: claudeConfigured('something-else'),
      project: { '.mcp.json': JSON.stringify({ mcpServers: { 'docs-local': { command: 'npx' } } }) },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await toProject(page);
        await tick(page, 'docs-local');
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(card(listed as ViewState, 'docs-local')?.statuses).toEqual([{ host: 'Claude Code', text: '已配置', tone: 'ready' }]);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'remove', '--scope', 'project', 'docs-local'], cwd: result.project },
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'], cwd: result.project },
    ]);
  });

  it('只有 Codex：MCP 不可选，原因是「只能装到全局」，勾不上', async () => {
    let listed: ViewState | undefined;
    let refused: number | undefined;
    await run({
      catalog: withMcps(LOCAL),
      onPath: ['codex'],
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await toProject(page);
        refused = await post(page, { type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        await done(page);
      },
    });

    expect(card(listed as ViewState, 'docs-local')).toMatchObject({ unavailable: '只能装到全局', statuses: [{ host: 'Codex', text: '不支持', tone: 'faint' }] });
    expect(refused).toBe(400);
  });

  it('勾上之后才改成项目：它留在已选里、写着「只能装到全局」，不进汇总；只剩它时去不了汇总；改回全局恢复', async () => {
    let stuck: ViewState | undefined;
    let alone: number | undefined;
    let summary: SummaryView | undefined;
    let restored: ViewState | undefined;
    await run({
      catalog: withMcps(LOCAL),
      onPath: ['codex'],
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        stuck = await toProject(page);
        alone = await post(page, { type: 'review' });
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        summary = await review(page);
        await page.send({ type: 'revise' });
        await page.send({ type: 'scope', scope: 'global' });
        restored = await page.until((state) => state.target.scope === 'global');
        await done(page);
      },
    });

    expect(stuck?.selected).toEqual([{ kind: 'mcp', name: 'docs-local', type: 'MCP', unavailable: '只能装到全局' }]);
    expect(card(stuck as ViewState, 'docs-local')).toMatchObject({ picked: true, unavailable: '只能装到全局' });
    expect(alone).toBe(400);
    expect(summary?.title).toBe('将安装 1 项');
    expect(summary?.entries.map((entry) => entry.name)).toEqual(['alpha']);
    expect(restored?.selected[0]).toEqual({ kind: 'mcp', name: 'docs-local', type: 'MCP' });
  });

  it('只支持 Codex 的 MCP，去掉了 Codex：已选里写着「需要别的 AI Agent」，不到填 key；勾回 Codex 恢复', async () => {
    let stuck: ViewState | undefined;
    let alone: number | undefined;
    let restored: ViewState | undefined;
    await run({
      catalog: withMcps({ ...KEYED_MCP, hosts: ['codex'] }),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        stuck = await host(page, 'codex', false);
        alone = await post(page, { type: 'review' });
        restored = await host(page, 'codex', true);
        await done(page);
      },
    });

    // 不进汇总时只写原因，不写要填 key
    expect(stuck?.selected).toEqual([{ kind: 'mcp', name: 'search-keyed', type: 'MCP', unavailable: '需要别的 AI Agent' }]);
    expect(alone).toBe(400);
    expect(restored?.selected).toEqual([{ kind: 'mcp', name: 'search-keyed', type: 'MCP', key: { text: '要填 key', tone: 'attention' } }]);
  });
});

describe('网页界面：MCP 没装上、和别的类型一起装', () => {
  it('添加命令非零退出：那一行是失败和原因，别的照常，结果里有「下一步」，退出状态 0', async () => {
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL, REMOTE),
      commandResult: (_command, args) => (args.includes('docs-local') ? { exitCode: 1 } : undefined),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await tick(page, 'tracker-remote');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['docs-local Claude Code 失败 添加命令退出状态 1', 'tracker-remote Claude Code 已配置']);
    expect(batch?.rows.map((row) => row.state)).toEqual(['failed', 'succeeded']);
    expect(totals(batch)).toBe('1 成功 · 1 失败 · 0 跳过');
    expect(batch?.next?.lines).toHaveLength(1);
    expect(batch?.failure).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('命令没能运行：原因里只有错误码', async () => {
    let batch: RunView | undefined;
    await run({
      catalog: withMcps(LOCAL),
      commandResult: () => Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['docs-local Claude Code 失败 添加命令没能运行（ENOENT）']);
  });

  it('已配置的移除失败：不再添加，原因写明', async () => {
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(LOCAL),
      home: claudeConfigured('docs-local'),
      commandResult: (_command, args) => (args[1] === 'remove' ? { exitCode: 3 } : undefined),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL]);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 失败 移除命令退出状态 3；未执行添加']);
  });

  it('已配置的添加失败、移除已经成功：原因写明此前已执行移除，「下一步」不说原有的东西没动', async () => {
    let batch: RunView | undefined;
    await run({
      catalog: withMcps(LOCAL),
      home: claudeConfigured('docs-local'),
      commandResult: (_command, args) => (args[1] === 'add' ? { exitCode: 1 } : undefined),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['docs-local Claude Code 失败 添加命令退出状态 1；此前已执行移除']);
    expect(batch?.next?.lines).toEqual(['没配置上的 MCP：排除原因后点「继续挑选」，重新勾选再装一次。原因里写着「此前已执行移除」的，原先的那份配置已经不在了。']);
  });

  it('skill 和 MCP 都有没装上的：「下一步」两句都有，各说各的', async () => {
    let batch: RunView | undefined;
    await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(LOCAL) }, content: {} }),
      commandResult: () => ({ exitCode: 1 }),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'docs-local');
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(batch?.rows.map((row) => `${row.name} ${row.text}`)).toEqual(['alpha 失败', 'docs-local 失败']);
    expect(batch?.next?.lines).toEqual([
      '没装上的各项没有改动原有的东西。排除原因后点「继续挑选」，重新勾选再装一次。',
      '没配置上的 MCP：排除原因后点「继续挑选」，重新勾选再装一次。原因里写着「此前已执行移除」的，原先的那份配置已经不在了。',
    ]);
  });

  it('和本仓库的 skill、第三方 Skill 一批装：行和命令都是 skill 在前、第三方 Skill 其次、MCP 在后', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(KEYED_MCP), thirdPartySkills: SAMPLE_THIRD_PARTY } }),
      // 假装 skills CLI 装上了：往它该落的位置写出 SKILL.md
      commandResult: (command, args, { home }) => {
        if (command === 'npx') writeTree(home, { [`.claude/skills/${args[args.indexOf('--skill') + 1]}/SKILL.md`]: '# 作者的最新版\n' });
        return undefined;
      },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        // 勾的先后和执行的先后相反
        await tick(page, 'search-keyed');
        await page.send({ type: 'pick', kind: 'thirdParty', name: 'solo-notes', on: true });
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.title).toBe('将安装 3 项');
    expect(summary?.entries.map((entry) => `${entry.name} · ${entry.type}`)).toEqual(['alpha · Skill', 'solo-notes · 第三方 Skill', 'search-keyed · MCP']);
    expect(outcomes(batch)).toEqual(['alpha Claude Code 已安装 1.0.0', 'note-taker Claude Code 已安装', 'search-keyed Claude Code 已配置']);
    expect(result.commands.map(({ command, args }) => `${command} ${args[0]}`)).toEqual(['npx -y', 'claude mcp']);
    expect(result.commands[1]).toEqual(CLAUDE_ADD_KEYED);
  });

  it('执行的命令和用终端界面装同样的东西时逐条相同', async () => {
    const catalog = withMcps(LOCAL, KEYED_MCP);
    const home = claudeConfigured('docs-local');
    const viaWeb = await run({
      catalog,
      onPath: BOTH_HOSTS,
      home,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        await tick(page, 'docs-local');
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await install(page, await review(page));
        await done(page);
      },
    });
    const viaTerminal = await run({
      catalog,
      onPath: BOTH_HOSTS,
      home,
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local', 'search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(viaWeb.commands).toEqual(viaTerminal.commands);
    expect(viaWeb.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, CLAUDE_ADD_KEYED, CODEX_ADD_KEYED]);
  });
});

describe('网页界面：填的 key 不出现在任何别处', () => {
  // 这一页收到的全部东西、终端上的全部输出、交给链接打开器的网址、三个目录里的每个文件，整份去搜
  const everywhere = (result: RunResult, received: string): string =>
    [received, result.raw, result.stdout, result.stderr, ...result.opened, everyFile(result.home), everyFile(result.project), everyFile(result.tmp)].join('\n');
  // 走完一遍：勾上、填 key、去汇总、确认、看结果、换语言、刷新、完成。给出这一页收到的全部东西
  const journey = async (page: Page): Promise<string> => {
    await open(page, WEB_SEARCH);
    await tick(page, 'search-keyed');
    await toKeys(page);
    await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
    await page.reload();
    await install(page, await review(page));
    await page.send({ type: 'lang', lang: 'en' });
    await page.reload();
    await page.send({ type: 'continue' });
    await tick(page, 'search-keyed');
    await toKeys(page);
    await done(page);
    return page.received();
  };

  it('装上了：值只在记录到的命令里，画面状态、答复、终端、网址、文件里都没有', async () => {
    let received = '';
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: BOTH_HOSTS, project: { 'notes.md': '项目里原有的文件\n' }, page: async (page) => void (received = await journey(page)) });

    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CODEX_ADD_KEYED]);
    const haystack = everywhere(result, received);
    // 该在里面的都在：画面状态里的条目和变量名、终端上的网址、项目里的文件
    for (const present of ['search-keyed', 'SEARCH_API_KEY', '已填', 'entered', '已配置', result.opened[0] ?? '?', '项目里原有的文件']) expect(haystack).toContain(present);
    expect(haystack).not.toContain(KEY_VALUE);
  });

  it('装到项目：提醒里有变量名和文件名，没有值', async () => {
    let received = '';
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        await toProject(page);
        received = await journey(page);
      },
    });

    expect(result.commands).toEqual([{ ...CLAUDE_ADD_KEYED_TO_PROJECT, cwd: result.project }]);
    const haystack = everywhere(result, received);
    expect(haystack).toContain('SEARCH_API_KEY 会以明文写进 .mcp.json');
    expect(haystack).not.toContain(KEY_VALUE);
  });

  it('命令非零退出：失败的原因里没有值', async () => {
    let received = '';
    const result = await run({ catalog: withMcps(KEYED_MCP), commandResult: () => ({ exitCode: 1 }), page: async (page) => void (received = await journey(page)) });

    const haystack = everywhere(result, received);
    expect(haystack).toContain('添加命令退出状态 1');
    expect(haystack).not.toContain(KEY_VALUE);
  });

  it('命令起不来而错误消息里带着整条命令、执行器当场抛出：原因里都没有值', async () => {
    const leaky = (args: readonly string[]): Error => new Error(`spawn claude ${args.join(' ')} failed: ${JSON.stringify(args)}`);
    let rejected = '';
    let thrown = '';
    const whenRejected = await run({ catalog: withMcps(KEYED_MCP), commandResult: (_command, args) => leaky(args), page: async (page) => void (rejected = await journey(page)) });
    const whenThrown = await run({
      catalog: withMcps(KEYED_MCP),
      commandResult: (_command, args) => {
        throw leaky(args);
      },
      page: async (page) => void (thrown = await journey(page)),
    });

    for (const [result, received] of [
      [whenRejected, rejected],
      [whenThrown, thrown],
    ] as const) {
      const haystack = everywhere(result, received);
      expect(haystack).toContain('添加命令没能运行');
      expect(haystack).not.toContain(KEY_VALUE);
      expect(haystack).not.toContain('spawn claude');
    }
  });

  it('填的时候被拒绝：答复的正文是空的，值没有被回显，也没有记下', async () => {
    const bodies: string[] = [];
    let received = '';
    let after: ViewState | undefined;
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      page: async (page) => {
        const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
        const key = { type: 'key', mcp: 'search-keyed', variable: 'SEARCH_API_KEY', value: KEY_VALUE };
        const answer = async (intent: unknown, extra: Record<string, string> = {}): Promise<void> => {
          const response = await page.request('/api/intent', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(intent) });
          bodies.push(`${response.status}:${response.body}`);
        };
        await open(page, WEB_SEARCH);
        await tick(page, 'search-keyed');
        // 还在浏览、多带了字段、不带口令、别的来源、写坏的正文
        await answer(key);
        await toKeys(page);
        await answer({ ...key, path: '/tmp/x' });
        await answer(key, { 'X-OXY-Token': 'not-the-token' });
        await answer(key, { Origin: 'https://evil.example' });
        bodies.push(`${(await page.request('/api/intent', { method: 'POST', headers, body: `{"type":"key","value":"${KEY_VALUE}"` })).status}:`);
        after = page.state();
        await install(page, await review(page));
        await done(page);
        received = page.received();
      },
    });

    expect(bodies).toEqual(['400:', '400:', '403:', '403:', '400:']);
    expect(after && filledIn(after, 'search-keyed')).toEqual([]);
    // 一次都没有照办：没有记下，这个 MCP 因为缺 key 没有装
    expect(result.commands).toEqual([]);
    expect(everywhere(result, received)).not.toContain(KEY_VALUE);
  });

  it('画面状态里没有将执行的命令，也没有条目的启动命令和网址', async () => {
    let received = '';
    await run({
      catalog: withMcps(KEYED_MCP, LOCAL, REMOTE),
      onPath: BOTH_HOSTS,
      home: claudeConfigured('docs-local'),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        for (const name of ['search-keyed', 'docs-local', 'tracker-remote']) await tick(page, name);
        await toKeys(page);
        await fill(page, 'search-keyed', 'SEARCH_API_KEY', KEY_VALUE);
        await install(page, await review(page));
        await done(page);
        received = page.received();
      },
    });

    expect(received).toContain('先移除再添加');
    expect(received).not.toMatch(/mcp add|mcp remove|--scope|--env|--transport|@example\/|mcp\.example\.org|npx/);
  });
});
