// Pi 的 MCP：装到全局和项目，用的是 Pi 自己的命令（pi mcp add、pi mcp remove）。skill 和第三方 Skill 在 pi.test.ts。
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import { EMPTY_CATALOG, KEYED_MCP, SAMPLE_MCPS, STACK_FRAME, accept, blank, catalogDir, choose, pick, run, secret, tempDir, underWebSearch, writeTree } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const ONLY_PI = ['pi'];
// 样例的两个 MCP 在同一个用途下：进去是一张只有 MCP 一段的列表
const withMcps = (...mcps: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...(mcps.length > 0 ? mcps : SAMPLE_MCPS)) } });
const install = (...names: string[]) => [choose(WEB_SEARCH), pick(...names), choose('开始安装'), choose('退出')];
const intoProject = (...names: string[]) => [choose(WEB_SEARCH), choose('项目'), pick(...names), choose('开始安装'), choose('退出')];
const browseProject = [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')];
const browse = [choose(WEB_SEARCH), pick(), choose('退出')];
const LIST = '? 选择要安装的条目';
const listOf = (output: string): string => output.split(LIST)[1] ?? '';
const summaryOf = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));
const commandsOf = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
// 命令过长时会折行：比对整条命令之前先把折行和缩进收成一个空格
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ');
// 中文的句子可以在任意两字之间折行：比对整句之前把空白全部去掉
const squeezed = (text: string): string => text.replace(/\s+/g, '');
const everything = (result: { raw: string; stdout: string; stderr: string }): string => result.raw + result.stdout + result.stderr;
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const inOrder = (screen: string, texts: string[]): void => {
  const order = texts.map((text) => screen.indexOf(text));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
};
// 画面上的文字行：分区的横线照例画满 80 列，不算在「不超过 79 列」里
const textLines = (output: string): string[] => output.split('\n').filter((line) => !line.includes('──'));
const isRemove = (args: readonly string[]): boolean => args[1] === 'remove';
const ALL_HOSTS = ['claude', 'codex', 'pi'];
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
// Pi 的 MCP 配置：一个 mcp.json，顶层的 mcpServers 里一个名字一条。用户级的在配置目录下，项目的在项目目录的 .pi 下
const piConfig = (...names: string[]): string => JSON.stringify({ mcpServers: Object.fromEntries(names.map((name) => [name, { command: 'old', args: [] }])) });

// Pi 的命令写法，2026-10-12 对照本机 pi 1.1.0 随包的 docs/cli.md、docs/mcp.md 和它解析 mcp 子命令的源码（只读，没有执行）：
// pi mcp add <名字> [选项] -- <命令> <参数…>，远程地址的是 --url；环境变量一个一个 --env，在 -- 之前
const PI_ADD_LOCAL = { command: 'pi', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const PI_REMOVE_LOCAL = { command: 'pi', args: ['mcp', 'remove', 'docs-local'] };
const PI_ADD_REMOTE = { command: 'pi', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
// 用户粘贴进来的 key；它不许出现在任何终端输出里
const KEY_VALUE = 'sk-test-4f9a2c71d0';
// 装到项目：两条命令都带 -l（--local），写的是运行目录下的 .pi/mcp.json，所以要在项目目录下运行
const PI_ADD_LOCAL_IN_PROJECT = { command: 'pi', args: ['mcp', 'add', 'docs-local', '-l', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const PI_ADD_REMOTE_IN_PROJECT = { command: 'pi', args: ['mcp', 'add', 'tracker-remote', '-l', '--url', 'https://mcp.example.org/mcp'] };
const PI_REMOVE_LOCAL_IN_PROJECT = { command: 'pi', args: ['mcp', 'remove', 'docs-local', '-l'] };
const PI_ADD_KEYED = { command: 'pi', args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] };

describe('把 MCP 装进 Pi：装到全局', () => {
  it('本地进程方式的：执行的正好是 Pi 自己的那一条添加命令，不指定在哪个目录下运行', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: install('docs-local') });

    expect(result.commands).toEqual([PI_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
    expect(result.exitCode).toBe(0);
  });

  it('远程地址的：名字后面是 --url 和地址', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: install('tracker-remote') });

    expect(result.commands).toEqual([PI_ADD_REMOTE]);
  });

  it('带 key 的：环境变量用 --env 带上，跟在名字后面、-- 前面，值是用户输入的', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      answers: [choose(WEB_SEARCH), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([PI_ADD_KEYED]);
  });
});

describe('Pi 的 MCP 状态：装到全局时看用户级配置', () => {
  it('配置目录下 mcp.json 的 mcpServers 里有同名条目的显示已配置，其余未配置', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, home: { '.pi/agent/mcp.json': piConfig('docs-local', 'something-else') }, answers: browse });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Pi\s+说明$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+已配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s/m);
    expect(result.output).not.toContain('读不到');
  });

  it('还没有 mcp.json、或里面没有 mcpServers：都是未配置', async () => {
    const absent = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: browse });
    const empty = await run({ catalog: withMcps(), onPath: ONLY_PI, home: { '.pi/agent/mcp.json': '{"autoEnableCodemode":false}' }, answers: browse });

    for (const result of [absent, empty]) {
      expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
      expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s/m);
      expect(result.output).not.toContain('读不到');
    }
  });

  it.each([
    ['不是合法的 JSON', { '.pi/agent/mcp.json': '{ "mcpServers": ' }],
    ['顶层不是对象', { '.pi/agent/mcp.json': '[]' }],
    ['mcpServers 不是对象', { '.pi/agent/mcp.json': '{"mcpServers":["docs-local"]}' }],
    ['读不了（那里是个目录）', { '.pi/agent/mcp.json/somewhere': '' }],
  ])('配置%s时状态显示为未知，列表上方说明读不到，不报错', async (_, home) => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, home, answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Pi 的配置，无法判断哪些 MCP 已配置$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未知\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未知\s/m);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('设置了 PI_CODING_AGENT_DIR：看的是那个目录里的 mcp.json，主目录下的那一份不算', async () => {
    const elsewhere = tempDir('pi-agent');
    writeTree(elsewhere, { 'mcp.json': piConfig('tracker-remote') });
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      env: { PI_CODING_AGENT_DIR: elsewhere },
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      answers: browse,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+已配置\s/m);
  });

  it('项目里的 .pi/mcp.json 不算：选全局时不读它', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, project: { '.pi/mcp.json': '{ 写坏了' }, answers: browse });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(result.output).not.toContain('读不到');
  });
});

describe('把 MCP 装进 Pi：装到项目', () => {
  it('本地进程方式的：添加命令带 -l，在项目目录下运行', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answersScope: true, answers: intoProject('docs-local') });

    expect(result.commands).toEqual([{ ...PI_ADD_LOCAL_IN_PROJECT, cwd: result.project }]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
    expect(result.exitCode).toBe(0);
  });

  it('远程地址的也带 -l、也在项目目录下运行', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answersScope: true, answers: intoProject('tracker-remote') });

    expect(result.commands).toEqual([{ ...PI_ADD_REMOTE_IN_PROJECT, cwd: result.project }]);
  });

  it('项目里已配置的：先移除再添加，两条都带 -l、都在项目目录下运行', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      project: { '.pi/mcp.json': piConfig('docs-local') },
      answersScope: true,
      answers: intoProject('docs-local'),
    });

    expect(result.output).toMatch(/^\s+docs-local\s+Pi\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.commands).toEqual([
      { ...PI_REMOVE_LOCAL_IN_PROJECT, cwd: result.project },
      { ...PI_ADD_LOCAL_IN_PROJECT, cwd: result.project },
    ]);
  });
});

describe('Pi 的 MCP 状态：装到项目时看项目目录的 .pi/mcp.json', () => {
  it('那里有的显示已配置，只在用户级配置里有的显示未配置', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': piConfig('tracker-remote') },
      project: { '.pi/mcp.json': piConfig('docs-local', 'something-else') },
      answersScope: true,
      answers: browseProject,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+已配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s/m);
  });

  it('项目里还没有 .pi/mcp.json 时都是未配置；用户级配置写坏了也不提', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, home: { '.pi/agent/mcp.json': '{ 写坏了' }, answersScope: true, answers: browseProject });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(result.output).not.toContain('读不到');
  });

  it('不认 PI_CODING_AGENT_DIR：仍看项目目录', async () => {
    const elsewhere = tempDir('pi-agent');
    writeTree(elsewhere, { 'mcp.json': piConfig('tracker-remote') });
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      env: { PI_CODING_AGENT_DIR: elsewhere },
      project: { '.pi/mcp.json': piConfig('docs-local') },
      answersScope: true,
      answers: browseProject,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+已配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s/m);
  });

  it('项目里的 .pi/mcp.json 写坏了：列表上方说明读不到，状态是未知', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, project: { '.pi/mcp.json': '{ 写坏了' }, answersScope: true, answers: browseProject });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Pi 的配置，无法判断哪些 MCP 已配置$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未知\s/m);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});

describe('把 MCP 装进 Pi：汇总确认', () => {
  it('确认前展示的就是之后执行的那一条；选「取消」时一条都没执行', async () => {
    const shown = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: [choose(WEB_SEARCH), pick('docs-local', 'tracker-remote'), choose('取消'), choose('退出')] });

    expect(summaryOf(shown.output)).toMatch(/^\s+docs-local\s+Pi\s+新装$/m);
    expect(shown.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(shown.output).toMatch(/^\s+1\s+pi mcp add docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(shown.output).toMatch(/^\s+2\s+pi mcp add tracker-remote --url https:\/\/mcp\.example\.org\/mcp$/m);
    expect(shown.commands).toEqual([]);
  });

  it('带 key 的：命令里 key 的位置是占位符，下面说明执行时才代入', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      answers: [choose(WEB_SEARCH), pick('search-keyed'), secret(KEY_VALUE), choose('取消'), choose('退出')],
    });

    expect(unwrapped(commandsOf(result.output))).toContain(' 1 pi mcp add search-keyed --env SEARCH_API_KEY=<SEARCH_API_KEY> -- npx -y @example/search-mcp ');
    expect(result.output).toMatch(/^\s+注意\s+key 以占位符显示，执行时才代入真实的值$/m);
    expect(result.commands).toEqual([]);
  });

  it('装到项目：展示的两条都带 -l', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      project: { '.pi/mcp.json': piConfig('docs-local') },
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('docs-local'), choose('取消'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+1\s+pi mcp remove docs-local -l$/m);
    expect(result.output).toMatch(/^\s+2\s+pi mcp add docs-local -l -- npx -y @example\/docs-mcp@latest$/m);
    expect(result.commands).toEqual([]);
  });

  it('添加远程地址的 MCP 不提醒登录：Pi 的添加命令只写配置、不连接服务器', async () => {
    const onlyPi = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: install('tracker-remote') });
    const withCodex = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('tracker-remote'), choose('取消'), choose('退出')],
    });

    expect(onlyPi.output).not.toContain('打开浏览器登录');
    expect(squeezed(withCodex.output)).toContain('Codex添加远程地址的MCP时可能当场打开浏览器登录');
    expect(withCodex.output).not.toMatch(/Pi 添加远程地址/);
  });
});

describe('把 MCP 装进 Pi：已有同名的、状态未知的', () => {
  const configured = { '.pi/agent/mcp.json': piConfig('docs-local') };
  const unreadable = { '.pi/agent/mcp.json': '{ 写坏了' };

  it('已配置的：汇总写明覆盖；先用 Pi 的移除命令删掉，再添加', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, home: configured, answers: install('docs-local') });

    expect(result.output).toMatch(/^\s+docs-local\s+Pi\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.output).toMatch(/^\s+1\s+pi mcp remove docs-local$/m);
    expect(result.commands).toEqual([PI_REMOVE_LOCAL, PI_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
  });

  it('移除失败就不添加：这一项失败并写明退出状态', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: configured,
      commandResult: (_, args) => (isRemove(args) ? { exitCode: 1 } : undefined),
      answers: install('docs-local'),
    });

    expect(result.commands).toEqual([PI_REMOVE_LOCAL]);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Pi\s+失败 移除命令退出状态 1；未执行添加$/m);
    expect(result.exitCode).toBe(0);
  });

  it('状态未知的：汇总里写添加和备注；先尝试移除，失败了也接着添加', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: unreadable,
      commandResult: (_, args) => (isRemove(args) ? { exitCode: 1 } : undefined),
      answers: install('docs-local'),
    });

    expect(result.output).toMatch(/^\s+docs-local\s+Pi\s+添加\s+状态未知，先尝试移除同名配置$/m);
    expect(result.commands).toEqual([PI_REMOVE_LOCAL, PI_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
  });

  it('装完再进列表，看到的是新的状态', async () => {
    // 假的执行器不写配置：让添加命令顺手把配置写出来，就像 Pi 自己写的那样
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      commandResult: (_, __, { home }) => void writeTree(home, { '.pi/agent/mcp.json': piConfig('docs-local') }),
      answers: [choose(WEB_SEARCH), pick('docs-local'), choose('开始安装'), choose(WEB_SEARCH), pick(), choose('退出')],
    });
    const [, before, after] = result.output.split(LIST);

    expect(before).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(after).toMatch(/^ □ docs-local\s+已配置\s/m);
  });
});

describe('把 MCP 装进 Pi：没装上', () => {
  it('添加命令非零退出：只这一项失败并写明退出状态，别的项照常，安装器不退出', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      commandResult: (_, args) => (args.includes('docs-local') ? { exitCode: 1 } : undefined),
      answers: install('docs-local', 'tracker-remote'),
    });

    expect(result.commands).toEqual([PI_ADD_LOCAL, PI_ADD_REMOTE]);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Pi\s+失败 添加命令退出状态 1$/m);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Pi\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('命令没能起来：这一项失败并写明错误码，别的宿主照常', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      commandResult: (command) => (command === 'pi' ? Object.assign(new Error('spawn pi ENOENT\n    at ChildProcess'), { code: 'ENOENT' }) : undefined),
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Pi\s+失败 添加命令没能运行（ENOENT）$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Codex\s+已配置$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });

  it('不事先检查 Pi 的版本：确认之前一条命令都没执行，装的时候也只有添加那一条', async () => {
    const cancelled = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: [choose(WEB_SEARCH), pick('docs-local'), choose('取消'), choose('退出')] });
    const done = await run({ catalog: withMcps(), onPath: ONLY_PI, commandResult: () => ({ exitCode: 1 }), answers: install('docs-local') });

    expect(cancelled.commands).toEqual([]);
    expect(done.commands).toEqual([PI_ADD_LOCAL]);
  });
});

describe('把 MCP 装进 Pi：和别的宿主一起选', () => {
  const three = (...names: string[]) => [choose(WEB_SEARCH), accept(), pick(...names), choose('开始安装'), choose('退出')];

  it('三个宿主都选了：列表里每个宿主一栏状态，各看各的配置', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+说明$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+已配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s+未配置\s+未配置\s/m);
  });

  it('一个 MCP 在每个宿主下各装一次：三条命令、三行结果', async () => {
    const result = await run({ catalog: withMcps(), onPath: ALL_HOSTS, answers: three('docs-local') });

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_ADD_LOCAL]);
    expect(result.output).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+docs-local\s+Claude Code\s+新装$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+Codex\s+新装$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+Pi\s+新装$/m);
    expect(result.output).toMatch(/^── 将执行 3 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+3\s+pi mcp add docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Codex\s+已配置$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+3 成功 · 0 失败 · 0 跳过$/m);
  });

  it('只有 Pi 那里已配置：只对它先移除', async () => {
    const result = await run({ catalog: withMcps(), onPath: ALL_HOSTS, home: { '.pi/agent/mcp.json': piConfig('docs-local') }, answers: three('docs-local') });

    expect(summaryOf(result.output)).toMatch(/^\s+Pi\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_REMOVE_LOCAL, PI_ADD_LOCAL]);
  });

  it('带 key 的：只问一次，三个宿主的命令都带着输入的值；值不出现在终端上，安装器也不把它写进任何文件', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split('? SEARCH_API_KEY')).toHaveLength(2);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] },
      { command: 'codex', args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] },
      PI_ADD_KEYED,
    ]);
    expect(everything(result)).not.toContain(KEY_VALUE);
    expect(filesUnder(result.home)).toEqual([]);
    expect(filesUnder(result.project)).toEqual([]);
    expect(filesUnder(result.tmp)).toEqual([]);
  });

  it('必填的 key 没填：这个 MCP 不装，每个宿主一行跳过并写明缺哪个变量；别的照常', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('search-keyed', 'docs-local'), blank(), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+注意\s+search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装$/m);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Pi\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+合计\s+3 成功 · 0 失败 · 3 跳过$/m);
  });

  it('命令失败时 key 的值也不出现：原因只说没能运行', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      commandResult: (command, args) => new Error(`spawn ${command} ${args.join(' ')} ENOENT`),
      answers: [choose(WEB_SEARCH), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✗\s+search-keyed\s+Pi\s+失败 添加命令没能运行$/m);
    expect(everything(result)).not.toContain(KEY_VALUE);
  });

  it('条目用 hosts 限定了宿主：没写 pi 的在 Pi 那一栏是不支持，只装进别的；只检测到 Pi 时不可选', async () => {
    const forClaude = withMcps({ ...SAMPLE_MCPS[0], hosts: ['claude-code'] });
    const all = await run({ catalog: forClaude, onPath: ALL_HOSTS, answers: three('docs-local') });
    const onlyPi = await run({ catalog: forClaude, onPath: ONLY_PI, answers: browse });

    expect(listOf(all.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持\s+不支持\s/m);
    expect(all.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(listOf(onlyPi.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
  });
});

describe('把 MCP 装进 Pi：和 skill 一起勾', () => {
  it('skill 落进共用 skill 目录，MCP 走 Pi 的命令；结果里 skill 的行在前', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      onPath: ONLY_PI,
      answers: install('alpha', 'docs-local'),
    });

    expect(existsSync(join(result.home, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([PI_ADD_LOCAL]);
    inOrder(result.output, ['✓  alpha', '✓  docs-local']);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    // 安装器自己不碰 Pi 的配置目录：那是 Pi 的命令写的
    expect(existsSync(join(result.home, '.pi'))).toBe(false);
  });
});

describe('把 MCP 装到项目的 Pi：提醒', () => {
  const beforeConfirm = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
  const PI_FILE = join('.pi', 'mcp.json');
  const keyedIntoProject = [choose(WEB_SEARCH), choose('项目'), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')];

  it('带 key 的照样能装：命令带 -l 和输入的值，在项目目录下运行', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: ONLY_PI, answersScope: true, answers: keyedIntoProject });

    expect(result.commands).toEqual([
      { command: 'pi', args: ['mcp', 'add', 'search-keyed', '-l', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'], cwd: result.project },
    ]);
  });

  it('带 key 的：确认之前警告 key 会以明文写进 .pi/mcp.json，写的是变量名，没有值', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: ONLY_PI, answersScope: true, answers: keyedIntoProject });

    expect(squeezed(beforeConfirm(result.output))).toContain(`注意SEARCH_API_KEY会以明文写进${PI_FILE}，不要提交，也不要发给别人`);
    expect(everything(result)).not.toContain(KEY_VALUE);
  });

  it('不带 key 的也说明：写进了当前目录的 .pi/mcp.json，要在这个目录下启动 pi 批准之后才启用', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answersScope: true, answers: intoProject('docs-local') });

    expect(squeezed(beforeConfirm(result.output))).toContain(`注意Pi的MCP写进当前目录的${PI_FILE}，要你批准之后才启用：在这个目录下启动pi时它会问`);
    expect(result.output).not.toContain('明文');
  });

  it('先后：key 以占位符显示、明文的警告、要批准；几行挨着；没有登录的提醒', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[1]),
      onPath: ONLY_PI,
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('search-keyed', 'tracker-remote'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });
    const notices = beforeConfirm(result.output).slice(beforeConfirm(result.output).indexOf('  注意'));

    inOrder(notices, ['key 以占位符显示', '会以明文写进', '批准之后才启用']);
    expect(notices.trimEnd()).not.toMatch(/\n\s*\n/);
    expect(result.output).not.toContain('打开浏览器登录');
  });

  it('选全局时两句都没有', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      answers: [choose(WEB_SEARCH), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(result.output).not.toContain('明文');
    expect(result.output).not.toContain('批准');
  });

  it('三个宿主都选了：Codex 那一栏是不支持并说明原因，装进 Claude Code 和 Pi；两个文件都点到，两个宿主各一句要批准', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: ALL_HOSTS,
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });
    const notices = squeezed(beforeConfirm(result.output));

    expect(result.output).toMatch(/^\s+注意\s+Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令$/m);
    expect(listOf(result.output)).toMatch(/^ □ search-keyed\s+未配置\s+不支持\s+未配置\s/m);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'], cwd: result.project },
      { command: 'pi', args: ['mcp', 'add', 'search-keyed', '-l', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'], cwd: result.project },
    ]);
    expect(notices).toContain(`注意SEARCH_API_KEY会以明文写进.mcp.json、${PI_FILE}，不要提交，也不要发给别人`);
    expect(notices).toContain('注意ClaudeCode的MCP写进当前目录的.mcp.json，要你批准之后才启用：在这个目录下启动claude时它会问');
    expect(notices).toContain(`注意Pi的MCP写进当前目录的${PI_FILE}，要你批准之后才启用：在这个目录下启动pi时它会问`);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(result.home)).toEqual([]);
  });
});

describe('英文界面的 Pi 的 MCP', () => {
  const WEB_SEARCH_EN = 'Web search & docs retrieval';

  it('列表、汇总、命令和结果都是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': piConfig('docs-local') },
      answers: [choose(WEB_SEARCH_EN), pick('docs-local', 'tracker-remote'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^ □ docs-local\s+configured\s/m);
    expect(result.output).toMatch(/^ □ tracker-remote\s+none\s/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Pi\s+overwrite\s/m);
    expect(result.output).toMatch(/^\s+tracker-remote\s+Pi\s+new$/m);
    expect(result.output).toMatch(/^\s+1\s+pi mcp remove docs-local$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Pi\s+configured$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });

  it('读不到配置的说法', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': '{ broken' },
      answers: [choose(WEB_SEARCH_EN), pick(), choose('Exit')],
    });

    expect(unwrapped(result.output)).toContain('Notice Could not read the Pi config; cannot tell which MCP servers are configured ');
    expect(result.output).toMatch(/^ □ docs-local\s+unknown\s/m);
  });

  it('装到项目的两句提醒；汇总起每一行都不超过 79 列', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(KEYED_MCP),
      onPath: ONLY_PI,
      answersScope: true,
      answers: [choose(WEB_SEARCH_EN), choose('Project'), pick('search-keyed'), secret(KEY_VALUE), choose('Cancel'), choose('Exit')],
    });
    const file = join('.pi', 'mcp.json');

    expect(unwrapped(result.output)).toContain(`Notice SEARCH_API_KEY will be stored in plain text in ${file}; do not commit or share it`);
    expect(unwrapped(result.output)).toContain(`Notice Pi saves MCP servers to ${file} here and enables them only once you approve: it asks when you start pi here`);
    expect(result.output).not.toContain('open a browser');
    for (const line of textLines(result.output.slice(result.output.indexOf('Install 1 item')))) expect(displayWidth(line)).toBeLessThanOrEqual(79);
  });
});
