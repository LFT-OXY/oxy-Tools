import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, LONG_MCP_ABOUT, SAMPLE_MCPS, STACK_FRAME, accept, catalogDir, choose, pick, run, tempDir, writeTree } from './harness.ts';

const withMcps = (mcps: unknown[] = SAMPLE_MCPS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps } });
// Claude Code 的用户级配置：主目录下的 .claude.json，顶层的 mcpServers 里一个名字一条
const claudeConfig = (...names: string[]): string =>
  JSON.stringify({ userID: 'someone', mcpServers: Object.fromEntries(names.map((name) => [name, { type: 'stdio', command: 'old', args: [] }])) });
// Codex 的用户级配置：主目录下的 .codex/config.toml，一个名字一张 [mcp_servers.<名字>] 表
const codexConfig = (...names: string[]): string =>
  ['model = "some-model"', ...names.map((name) => `\n[mcp_servers.${name}]\ncommand = "old"\nargs = []`)].join('\n');
const browseMcps = [choose('MCP'), pick(), choose('退出')];
const install = (...names: string[]) => [choose('MCP'), pick(...names), choose('执行'), choose('退出')];

// 两个宿主各自的命令写法，2026-10-09 对照官方文档和本机的 claude 2.1.295、codex 0.162.0 核对过
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CLAUDE_ADD_REMOTE = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'tracker-remote', 'https://mcp.example.org/mcp'] };
const CLAUDE_REMOVE_LOCAL = { command: 'claude', args: ['mcp', 'remove', '--scope', 'user', 'docs-local'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_REMOTE = { command: 'codex', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
const CODEX_REMOVE_LOCAL = { command: 'codex', args: ['mcp', 'remove', 'docs-local'] };
const isRemove = (args: readonly string[]): boolean => args[1] === 'remove';
// 命令过长时会折行：比对整条命令之前先把折行和缩进收成一个空格
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ');
// 中文的句子可以在任意两字之间折行：比对整句之前把空白全部去掉
const squeezed = (text: string): string => text.replace(/\s+/g, '');

describe('MCP 分组', () => {
  it('目录里有 MCP 条目时，主菜单出现这个分组和它的数量', async () => {
    const result = await run({ catalog: withMcps(), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+MCP\s+2\s+写进 AI Agent 配置的 MCP 服务器$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 MCP$/m);
    expect(result.exitCode).toBe(0);
  });
});

describe('MCP 列表', () => {
  it('多选列表：每行是名字、宿主下的状态和一句话说明；一个都不勾回到主菜单，不执行任何命令', async () => {
    const result = await run({ catalog: withMcps(), answers: browseMcps });

    expect(result.output).toContain('选择要安装的 MCP');
    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('一行放不下的说明在列表里截断，全文显示在列表下方', async () => {
    const result = await run({ catalog: withMcps(), answers: browseMcps });

    expect(result.output).toMatch(/ docs-local\s+未配置\s+本地进程方式的样例 MCP.*…$/m);
    expect(result.output).toContain(LONG_MCP_ABOUT.zh);
  });

  it('只检测到一个宿主时不问装进哪个', async () => {
    const result = await run({ catalog: withMcps(), answers: browseMcps });

    expect(result.output).not.toContain('装进哪些 AI Agent');
  });
});

describe('MCP 的状态：Claude Code', () => {
  it('用户级配置里已有同名条目的显示已配置，其余未配置', async () => {
    const result = await run({ catalog: withMcps(), home: { '.claude.json': claudeConfig('docs-local', 'something-else') }, answers: browseMcps });

    expect(result.output).toMatch(/ docs-local\s+已配置\s/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s/m);
    expect(result.output).not.toContain('读不到');
  });

  it('配置里没有 mcpServers 时都是未配置', async () => {
    const result = await run({ catalog: withMcps(), home: { '.claude.json': '{"userID":"someone"}' }, answers: browseMcps });

    expect(result.output).toMatch(/ docs-local\s+未配置\s/m);
    expect(result.output).not.toContain('未知');
  });

  it.each([
    ['不是合法的 JSON', { '.claude.json': '{ "mcpServers": ' }],
    ['顶层不是对象', { '.claude.json': '[]' }],
    ['mcpServers 不是对象', { '.claude.json': '{"mcpServers":["docs-local"]}' }],
    ['读不了（那里是个目录）', { '.claude.json/somewhere': '' }],
  ])('配置%s时状态显示为未知，列表上方说明读不到，不报错', async (_, home) => {
    const result = await run({ catalog: withMcps(), home, answers: browseMcps });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Claude Code 的配置，无法判断哪些 MCP 已配置$/m);
    expect(result.output).toMatch(/ docs-local\s+未知\s/m);
    expect(result.output).toMatch(/ tracker-remote\s+未知\s/m);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('设置了 CLAUDE_CONFIG_DIR 时看的是那个目录里的 .claude.json', async () => {
    const elsewhere = tempDir('claude-config');
    writeTree(elsewhere, { '.claude.json': claudeConfig('tracker-remote') });
    const result = await run({
      catalog: withMcps(),
      env: { CLAUDE_CONFIG_DIR: elsewhere },
      home: { '.claude.json': claudeConfig('docs-local') },
      answers: browseMcps,
    });

    expect(result.output).toMatch(/ docs-local\s+未配置\s/m);
    expect(result.output).toMatch(/ tracker-remote\s+已配置\s/m);
  });
});

describe('MCP 的状态：Codex', () => {
  it('用户级配置里已有同名的表时显示已配置，其余未配置', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['codex'],
      home: { '.codex/config.toml': codexConfig('tracker-remote') },
      answers: browseMcps,
    });

    expect(result.output).toMatch(/^\s+名称\s+Codex\s+说明$/m);
    expect(result.output).toMatch(/ docs-local\s+未配置\s/m);
    expect(result.output).toMatch(/ tracker-remote\s+已配置\s/m);
  });

  it('同名条目写成别的 TOML 写法也认得', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['codex'],
      home: { '.codex/config.toml': 'mcp_servers = { "docs-local" = { command = "old" } }\n' },
      answers: browseMcps,
    });

    expect(result.output).toMatch(/ docs-local\s+已配置\s/m);
  });

  it.each([
    ['不是合法的 TOML', '[mcp_servers.docs-local\ncommand = '],
    ['的 mcp_servers 不是表', 'mcp_servers = "docs-local"\n'],
  ])('配置%s时状态显示为未知，列表上方说明读不到，不报错', async (_, config) => {
    const result = await run({ catalog: withMcps(), onPath: ['codex'], home: { '.codex/config.toml': config }, answers: browseMcps });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Codex 的配置，无法判断哪些 MCP 已配置$/m);
    expect(result.output).toMatch(/ docs-local\s+未知\s/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('设置了 CODEX_HOME 时看的是那个目录里的 config.toml', async () => {
    const elsewhere = tempDir('codex-home');
    writeTree(elsewhere, { 'config.toml': codexConfig('docs-local') });
    const result = await run({ catalog: withMcps(), onPath: ['codex'], env: { CODEX_HOME: elsewhere }, answers: browseMcps });

    expect(result.output).toMatch(/ docs-local\s+已配置\s/m);
  });
});

describe('安装 MCP：记录到的命令', () => {
  it.each([
    ['本地进程', 'Claude Code', 'claude', 'docs-local', CLAUDE_ADD_LOCAL],
    ['远程地址', 'Claude Code', 'claude', 'tracker-remote', CLAUDE_ADD_REMOTE],
    ['本地进程', 'Codex', 'codex', 'docs-local', CODEX_ADD_LOCAL],
    ['远程地址', 'Codex', 'codex', 'tracker-remote', CODEX_ADD_REMOTE],
  ])('%s方式装进 %s：调用它自己的添加命令，写进用户级配置', async (_, __, host, name, expected) => {
    const result = await run({ catalog: withMcps(), onPath: [host], answers: install(name) });

    expect(result.commands).toEqual([expected]);
    expect(result.exitCode).toBe(0);
  });

  it('安装器自己不往主目录里写任何东西', async () => {
    const result = await run({ catalog: withMcps(), answers: install('docs-local', 'tracker-remote') });

    expect(readdirSync(result.home)).toEqual([]);
  });

  // Claude Code 的旧文档要求原生 Windows 上给 npx 包一层 cmd /c；2.1.119 起不再需要，现行文档也已去掉这条
  it('原生 Windows 上本地进程的启动命令同样原样交给宿主，不包 cmd /c', async () => {
    const result = await run({
      catalog: withMcps(),
      platform: 'win32',
      onPath: ['claude', 'codex'],
      answers: [choose('MCP'), accept(), pick('docs-local'), choose('执行'), choose('退出')],
    });

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL]);
    expect(result.output).not.toContain('cmd /c');
  });
});

describe('安装 MCP：汇总确认', () => {
  it('列出每一项装进哪个宿主、是新装还是覆盖，并展示将要执行的完整命令', async () => {
    const result = await run({ catalog: withMcps(), answers: install('docs-local', 'tracker-remote') });

    expect(result.output).toMatch(/^── 将安装 2 个 MCP ─+$/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+新装$/m);
    expect(result.output).toMatch(/^\s+tracker-remote\s+Claude Code\s+新装$/m);
    expect(result.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+1\s+claude mcp add --scope user docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(unwrapped(result.output)).toContain(' 2 claude mcp add --scope user --transport http tracker-remote https://mcp.example.org/mcp ');
  });

  it('确认之前不执行任何命令：选了取消就什么都不执行，回到主菜单', async () => {
    const result = await run({ catalog: withMcps(), answers: [choose('MCP'), pick('docs-local'), choose('取消'), choose('退出')] });

    expect(result.output).toContain('claude mcp add --scope user docs-local');
    expect(result.output).toContain('执行这些命令吗');
    expect(result.commands).toEqual([]);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('返回修改回到列表，之前勾的还在', async () => {
    const result = await run({
      catalog: withMcps(),
      answers: [choose('MCP'), pick('docs-local'), choose('返回修改'), accept(), choose('执行'), choose('退出')],
    });

    expect(result.output.split('? 选择要安装的 MCP')).toHaveLength(3);
    expect(result.output).toMatch(/^\s*■ docs-local\s/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });

  it('网址里有 shell 会另作解释的字符时，展示的命令里给它加上引号；执行时原样是一个参数', async () => {
    const url = 'https://mcp.example.org/mcp?team=a&mode=b';
    const result = await run({ catalog: withMcps([{ ...SAMPLE_MCPS[1], server: { url } }]), answers: install('tracker-remote') });

    expect(unwrapped(result.output)).toContain(`tracker-remote '${url}' `);
    expect(result.commands[0]?.args.at(-1)).toBe(url);
  });
});

describe('安装 MCP：宿主里已有同名的', () => {
  const configured = { '.claude.json': claudeConfig('docs-local') };

  it('汇总写明覆盖；先用宿主的移除命令删掉，再添加', async () => {
    const result = await run({ catalog: withMcps(), home: configured, answers: install('docs-local') });

    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+1\s+claude mcp remove --scope user docs-local$/m);
    expect(result.output).toMatch(/^\s+2\s+claude mcp add --scope user docs-local -- /m);
    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
  });

  it('Codex 同样先移除再添加', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['codex'],
      home: { '.codex/config.toml': codexConfig('docs-local') },
      answers: install('docs-local'),
    });

    expect(result.commands).toEqual([CODEX_REMOVE_LOCAL, CODEX_ADD_LOCAL]);
  });

  it('移除失败就不添加：这一项失败并写明退出状态，安装器不退出', async () => {
    const result = await run({
      catalog: withMcps(),
      home: configured,
      commandResult: (_, args) => (isRemove(args) ? { exitCode: 3 } : undefined),
      answers: install('docs-local'),
    });

    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL]);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 移除命令退出状态 3；未执行添加$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('移除成功而添加失败时，如实说明移除已经执行', async () => {
    const result = await run({
      catalog: withMcps(),
      home: configured,
      commandResult: (_, args) => (isRemove(args) ? undefined : { exitCode: 1 }),
      answers: install('docs-local'),
    });

    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 1；此前已执行移除$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});

describe('安装 MCP：宿主的状态未知', () => {
  const unreadable = { '.claude.json': '{ 写坏了' };

  it('先尝试移除同名配置再添加，汇总里如实写出这两条命令', async () => {
    const result = await run({ catalog: withMcps(), home: unreadable, answers: install('docs-local') });

    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+添加\s+状态未知，先尝试移除同名配置$/m);
    expect(result.output).toMatch(/^\s+1\s+claude mcp remove --scope user docs-local$/m);
    expect(result.output).toMatch(/^\s+2\s+claude mcp add --scope user docs-local -- /m);
    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL]);
  });

  it('移除失败（那里本来就没有）不算失败，照常添加', async () => {
    const result = await run({
      catalog: withMcps(),
      home: unreadable,
      commandResult: (_, args) => (isRemove(args) ? { exitCode: 1 } : undefined),
      answers: install('docs-local'),
    });

    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(result.output).not.toContain('✗');
  });
});

describe('安装 MCP：结果', () => {
  it('逐项列出，给出合计，然后回到主菜单', async () => {
    const result = await run({ catalog: withMcps(), answers: install('docs-local', 'tracker-remote') });

    expect(result.output).toMatch(/^── 结果 ─+$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('装完再进列表，看到的是新的状态', async () => {
    // 假的执行器不写配置：让添加命令顺手把配置写出来，就像宿主自己写的那样
    const config = tempDir('claude-config');
    const result = await run({
      catalog: withMcps(),
      env: { CLAUDE_CONFIG_DIR: config },
      commandResult: () => void writeTree(config, { '.claude.json': claudeConfig('docs-local') }),
      answers: [choose('MCP'), pick('docs-local'), choose('执行'), choose('MCP'), pick(), choose('退出')],
    });

    const [, before, after] = result.output.split('? 选择要安装的 MCP');
    expect(before).toMatch(/ docs-local\s+未配置\s/m);
    expect(after).toMatch(/ docs-local\s+已配置\s/m);
  });

  it('一项失败不影响其余项：失败的写明原因，退出状态不变，没有堆栈', async () => {
    const result = await run({
      catalog: withMcps(),
      commandResult: (_, args) => (args.includes('docs-local') ? { exitCode: 1 } : undefined),
      answers: install('docs-local', 'tracker-remote'),
    });

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CLAUDE_ADD_REMOTE]);
    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 1$/m);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('宿主的命令没能起来：这一项失败并写明错误码，其余项照常', async () => {
    const result = await run({
      catalog: withMcps(),
      commandResult: (_, args) =>
        args.includes('docs-local') ? Object.assign(new Error('spawn claude ENOENT\n    at ChildProcess'), { code: 'ENOENT' }) : undefined,
      answers: install('docs-local', 'tracker-remote'),
    });

    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令没能运行（ENOENT）$/m);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Claude Code\s+已配置$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });
});

describe('安装 MCP：检测到两个宿主', () => {
  const both = ['claude', 'codex'];

  it('先问装进哪些 AI Agent，默认全选；装 MCP 时名字后面不写目录', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('docs-local'), choose('执行'), choose('退出')],
    });

    expect(result.output).toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s*■ Claude Code$/m);
    expect(result.output).toMatch(/^\s*■ Codex$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL]);
  });

  it('汇总和结果里每个宿主各一行，两条完整的命令都在输出里', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('docs-local'), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^── 将安装 1 个 MCP ─+$/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+新装$/m);
    expect(result.output).toMatch(/^\s+Codex\s+新装$/m);
    expect(result.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+1\s+claude mcp add --scope user docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(result.output).toMatch(/^\s+2\s+codex mcp add docs-local -- npx -y @example\/docs-mcp@latest$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Codex\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('只勾一个宿主时只装进它，列表里也只有它那一栏状态', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      answers: [choose('MCP'), pick('Codex'), pick('tracker-remote'), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+名称\s+Codex\s+说明$/m);
    expect(result.commands).toEqual([CODEX_ADD_REMOTE]);
  });

  it('两个宿主的状态各看各的配置：一个已配置就只对它先移除', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      home: { '.claude.json': claudeConfig('docs-local') },
      answers: [choose('MCP'), accept(), pick('docs-local'), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/ docs-local\s+已配置\s+未配置\s/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.output).toMatch(/^\s+Codex\s+新装$/m);
    expect(result.commands).toEqual([CLAUDE_REMOVE_LOCAL, CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL]);
  });

  it('只有一个宿主的配置读不到时，只说它，只有它那一栏是未知', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      home: { '.codex/config.toml': '[mcp_servers' },
      answers: [choose('MCP'), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Codex 的配置，无法判断哪些 MCP 已配置$/m);
    expect(result.output).toMatch(/ docs-local\s+未配置\s+未知\s/m);
  });

  it('一个宿主那边失败时，另一个照常', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      commandResult: (command) => (command === 'claude' ? { exitCode: 2 } : undefined),
      answers: [choose('MCP'), accept(), pick('docs-local'), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败 添加命令退出状态 2$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Codex\s+已配置$/m);
    expect(result.exitCode).toBe(0);
  });

  it('列表上一个都不勾回到宿主选择，之前勾的还在；宿主选择上一个都不勾回主菜单', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: both,
      answers: [choose('MCP'), pick('Codex'), pick(), accept(), pick(), pick(), choose('退出')],
    });

    const hostPickers = result.output.split('? 装进哪些 AI Agent');
    expect(hostPickers).toHaveLength(4);
    expect(hostPickers[2]).toMatch(/^\s*□ Claude Code$/m);
    expect(hostPickers[2]).toMatch(/^\s*■ Codex$/m);
    expect(result.commands).toEqual([]);
  });
});

describe('MCP 条目只支持一部分宿主', () => {
  const claudeOnly = { ...SAMPLE_MCPS[0], name: 'claude-only', hosts: ['claude-code'] };
  const partly = (): string => withMcps([claudeOnly, SAMPLE_MCPS[1]]);
  const CLAUDE_ADD_CLAUDE_ONLY = { command: 'claude', args: CLAUDE_ADD_LOCAL.args.map((arg) => (arg === 'docs-local' ? 'claude-only' : arg)) };

  it('所选宿主里有一部分支持：仍可选，不支持的那一栏标出「不支持」', async () => {
    const result = await run({ catalog: partly(), onPath: ['claude', 'codex'], answers: [choose('MCP'), accept(), pick(), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s*□ claude-only\s+未配置\s+不支持\s+本地进程方式的样例 MCP/m);
    expect(result.output).not.toContain('需要别的 AI Agent');
  });

  it('只装进支持的那些宿主：汇总、命令和结果里都没有不支持的那个', async () => {
    const result = await run({
      catalog: partly(),
      onPath: ['claude', 'codex'],
      answers: [choose('MCP'), accept(), pick('claude-only', 'tracker-remote'), choose('执行'), choose('退出')],
    });

    expect(result.commands).toEqual([CLAUDE_ADD_CLAUDE_ONLY, CLAUDE_ADD_REMOTE, CODEX_ADD_REMOTE]);
    expect(result.output).toMatch(/^\s+claude-only\s+Claude Code\s+新装$/m);
    expect(result.output).not.toMatch(/claude-only\s+Codex/);
    expect(result.output).toMatch(/^── 将执行 3 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+合计\s+3 成功 · 0 失败 · 0 跳过$/m);
  });

  it('所选宿主一个都不支持：整条不可选，并注明原因', async () => {
    const result = await run({ catalog: partly(), onPath: ['codex'], answers: browseMcps });

    expect(result.output).toMatch(/^\s*– claude-only\s+不支持\s+本地进程方式的样例 MCP.* · 需要别的 AI Agent$/m);
    expect(result.output).toMatch(/^\s*□ tracker-remote\s+未配置\s/m);
  });

  it('两个宿主都在、但只勾了不支持的那个时同样不可选', async () => {
    const result = await run({
      catalog: partly(),
      onPath: ['claude', 'codex'],
      answers: [choose('MCP'), pick('Codex'), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s*– claude-only\s+不支持\s.* · 需要别的 AI Agent$/m);
  });

  it('hosts 里有这一版安装器不认识的宿主时，这一条照常可用', async () => {
    const result = await run({
      catalog: withMcps([{ ...claudeOnly, hosts: ['claude-code', 'some-future-agent'] }]),
      answers: install('claude-only'),
    });

    expect(result.commands).toEqual([CLAUDE_ADD_CLAUDE_ONLY]);
    expect(result.output).not.toContain('格式有误');
  });
});

describe('一个宿主都没检测到时的 MCP', () => {
  it('MCP 分组不可进入，行尾注明原因', async () => {
    const result = await run({ catalog: withMcps(), onPath: [], answers: [choose('退出')] });

    expect(result.output).toMatch(/^- MCP\s+2\s+写进 AI Agent 配置的 MCP 服务器 · 需要 AI Agent$/m);
    expect(result.commands).toEqual([]);
  });
});

describe('写坏的 MCP 条目', () => {
  const broken = { ...SAMPLE_MCPS[0], name: 'broken', server: { command: 'npx', args: ['-y', 'pkg; rm -rf ~'] } };

  it('只跳过那一条并提示数量，其余照常', async () => {
    const result = await run({ catalog: withMcps([broken, ...SAMPLE_MCPS]), answers: browseMcps });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+MCP\s+2\s/m);
    expect(result.output).not.toContain('broken');
    expect(result.output).not.toContain('rm -rf');
  });

  it('全部写坏时主菜单没有这个分组', async () => {
    const result = await run({ catalog: withMcps([broken]), answers: [choose('退出')] });

    expect(result.output).not.toMatch(/^\s+MCP\s/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill$/m);
  });

  it('MCP 可以和某个 skill 同名', async () => {
    const result = await run({ catalog: withMcps([{ ...SAMPLE_MCPS[1], name: 'alpha' }]), answers: browseMcps });

    expect(result.output).not.toContain('格式有误');
    expect(result.output).toMatch(/^\s*□ alpha\s+未配置\s/m);
  });
});

describe('英文界面的 MCP', () => {
  it('分组、列表、汇总、命令和结果都是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      home: { '.claude.json': claudeConfig('docs-local') },
      answers: [choose('MCP'), pick('docs-local', 'tracker-remote'), choose('Run'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 2 MCP$/m);
    expect(result.output).toMatch(/^\s+MCP\s+2\s+MCP servers written into your AI Agent config$/m);
    expect(result.output).toContain('Pick MCP servers to install');
    expect(result.output).toMatch(/ docs-local\s+configured\s/m);
    expect(result.output).toMatch(/ tracker-remote\s+none\s+A sample MCP reached at a remote address$/m);
    expect(result.output).toMatch(/^── Install 2 MCP servers ─+$/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+overwrite\s+configured; removed, then added$/m);
    expect(result.output).toMatch(/^\s+tracker-remote\s+Claude Code\s+new$/m);
    expect(result.output).toMatch(/^── 3 commands to run ─+$/m);
    expect(result.output).toContain('Run these commands?');
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+configured$/m);
    expect(result.output).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('读不到配置、状态未知和失败的说法', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      home: { '.claude.json': '{' },
      commandResult: (_, args) => (isRemove(args) ? undefined : { exitCode: 1 }),
      answers: [choose('MCP'), pick('docs-local'), choose('Run'), choose('Exit')],
    });

    expect(unwrapped(result.output)).toContain('Notice Could not read the Claude Code config; cannot tell which MCP servers are configured');
    expect(result.output).toMatch(/ docs-local\s+unknown\s/m);
    expect(result.output).toMatch(/^\s+docs-local\s+Claude Code\s+add\s+status unknown; removal tried first$/m);
    expect(unwrapped(result.output)).toContain('failed the add command exited with status 1; the remove command had already run');
  });
});

describe('安装 MCP：名字很长的条目', () => {
  it('汇总里另起一行的备注不超出一行的宽度，仍是完整的一句', async () => {
    const long = { ...SAMPLE_MCPS[0], name: 'modelcontextprotocol-server-sequential-thinking' };
    const result = await run({
      catalog: withMcps([long]),
      home: { '.claude.json': claudeConfig(long.name) },
      answers: [choose('MCP'), pick(long.name), choose('取消'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+已配置，先移除再添加$/m);
    // 汉字占两列：这一行连同缩进不超过 79 列
    const note = result.output.split('\n').find((line) => line.trim() === '已配置，先移除再添加') ?? '';
    expect(note.length + '已配置先移除再添加'.length + 1).toBeLessThanOrEqual(79);
  });
});

// Codex 的添加命令对远程地址的 MCP 会当场打开浏览器登录并等它完成（它支持 OAuth 时），而安装器不显示宿主命令的输出
describe('安装 MCP：宿主添加远程地址时会当场登录', () => {
  const LOGIN_NOTICE =
    '注意 Codex 添加远程地址的 MCP 时可能当场打开浏览器登录，登录完这一项才结束。浏览器打不开就按 Ctrl+C，之后执行 codex mcp login <名称>';

  it('远程地址的 MCP 要装进 Codex：将执行的命令下面提醒这件事，并给出事后补登录的命令', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['codex'], answers: install('tracker-remote') });

    expect(squeezed(result.output)).toContain(squeezed(LOGIN_NOTICE));
    expect(result.output.indexOf('将执行 1 条命令')).toBeLessThan(result.output.indexOf('可能当场打开浏览器登录'));
    expect(result.output.indexOf('可能当场打开浏览器登录')).toBeLessThan(result.output.indexOf('执行这些命令吗'));
    expect(result.commands).toEqual([CODEX_ADD_REMOTE]);
  });

  it('两个宿主都选了时只说会这样做的那个', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['claude', 'codex'],
      answers: [choose('MCP'), accept(), pick('docs-local', 'tracker-remote'), choose('取消'), choose('退出')],
    });

    expect(squeezed(result.output)).toContain(squeezed(LOGIN_NOTICE));
    expect(result.output).not.toMatch(/Claude Code 添加远程地址/);
  });

  it('本地进程方式的 MCP 装进 Codex 时不提醒', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['codex'], answers: install('docs-local') });

    expect(result.output).not.toContain('打开浏览器登录');
  });

  it('远程地址的 MCP 只装进 Claude Code 时不提醒', async () => {
    const result = await run({ catalog: withMcps(), answers: install('tracker-remote') });

    expect(result.output).not.toContain('打开浏览器登录');
  });

  it('英文界面下同样提醒', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ['codex'],
      answers: [choose('MCP'), pick('tracker-remote'), choose('Cancel'), choose('Exit')],
    });

    expect(unwrapped(result.output)).toContain(
      'Notice Codex may open a browser to sign in while adding a remote MCP server; that item only finishes once you have signed in. If no browser opens, press Ctrl+C and run codex mcp login <name> later',
    );
  });
});
