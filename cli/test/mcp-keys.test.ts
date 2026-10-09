import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, KEYED_MCP, SAMPLE_MCPS, STACK_FRAME, accept, blank, catalogDir, choose, pick, run, secret } from './harness.ts';
import { screenLines } from './terminal.ts';

const withMcps = (...mcps: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps } });
// 用户粘贴进来的 key；它不许出现在任何终端输出里
const KEY_VALUE = 'sk-test-4f9a2c71d0';
const TEAM = {
  name: 'SEARCH_TEAM_ID',
  required: false,
  description: { zh: '团队编号，按团队计费时填', en: 'Team id, for per-team billing' },
  url: 'https://example.com/search/teams',
};
// 必填的在前、可选的在后
const WITH_OPTIONAL = { ...KEYED_MCP, env: [...KEYED_MCP.env, TEAM] };
const both = ['claude', 'codex'];
const install = (...keys: ReturnType<typeof secret>[]) => [choose('MCP'), pick('search-keyed'), ...keys, choose('执行'), choose('退出')];

// 两个宿主带环境变量的添加命令，2026-10-09 对照各自的 --help，并在本机用 claude 2.1.295、codex 0.162.0
// 在临时配置目录里实测过：值原样进了配置里这个 MCP 的 env；变量跟在名字后面，一个变量一个 -e / --env
const CLAUDE_ADD_KEYED = {
  command: 'claude',
  args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
};
const CODEX_ADD_KEYED = {
  command: 'codex',
  args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
};
const CLAUDE_ADD_TWO_KEYS = {
  command: 'claude',
  args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '-e', 'SEARCH_TEAM_ID=team-42', '--', 'npx', '-y', '@example/search-mcp'],
};
const CODEX_ADD_TWO_KEYS = {
  command: 'codex',
  args: ['mcp', 'add', 'search-keyed', '--env', `SEARCH_API_KEY=${KEY_VALUE}`, '--env', 'SEARCH_TEAM_ID=team-42', '--', 'npx', '-y', '@example/search-mcp'],
};
const CLAUDE_ADD_NO_KEY = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '--', 'npx', '-y', '@example/search-mcp'] };
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
// 命令过长时会折行：比对整条命令之前先把折行和缩进收成一个空格
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ');

describe('带 key 的 MCP：填写 key', () => {
  it('提问之前显示这个变量的说明和申请链接；记录到的命令带着用户输入的值', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answers: install(secret(KEY_VALUE)) });

    expect(result.output).toMatch(/^── search-keyed 需要 key ─+$/m);
    expect(result.output).toMatch(/^\s+变量\s+SEARCH_API_KEY（必填）$/m);
    expect(result.output).toMatch(/^\s+用途\s+样例搜索服务的密钥$/m);
    expect(result.output).toMatch(/^\s+申请\s+https:\/\/example\.com\/search\/api-keys$/m);
    expect(result.output).toMatch(/^\s+提示\s+输入不会显示在屏幕上；留空回车将跳过 search-keyed$/m);
    expect(result.output.indexOf('https://example.com/search/api-keys')).toBeLessThan(result.output.indexOf('? SEARCH_API_KEY'));
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
    expect(result.output).toMatch(/^\s+✓\s+search-keyed\s+Claude Code\s+已配置$/m);
    expect(result.exitCode).toBe(0);
  });

  it('提问是变量名，后面一句固定的提示；回答之后留下一行，只说已填写', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answers: install(secret(KEY_VALUE)) });

    expect(result.output).toMatch(/^\? SEARCH_API_KEY \(输入不显示，粘贴后回车\)$/m);
    expect(result.output).toMatch(/^✓ SEARCH_API_KEY · 已填写$/m);
  });

  it('装进 Codex 时用它自己的写法带上这个变量', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: ['codex'], answers: install(secret(KEY_VALUE)) });

    expect(result.commands).toEqual([CODEX_ADD_KEYED]);
  });

  it('两个宿主都选了时只问一次，输入的值用于两个宿主', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('执行'), choose('退出')],
    });

    expect(result.output.split('? SEARCH_API_KEY')).toHaveLength(2);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CODEX_ADD_KEYED]);
  });

  it('粘贴进来的值首尾带着空白时，传给宿主的不带', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answers: install(secret(`  ${KEY_VALUE}\t `)) });

    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
  });

  it('有几个变量就逐个问，各有各的说明，照目录里的顺序都带上', async () => {
    const result = await run({ catalog: withMcps(WITH_OPTIONAL), onPath: both, answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), secret('team-42'), choose('执行'), choose('退出')] });

    expect(result.output).toMatch(/^── search-keyed 可选的 key ─+$/m);
    expect(result.output).toMatch(/^\s+变量\s+SEARCH_TEAM_ID（可选）$/m);
    expect(result.output).toMatch(/^\s+申请\s+https:\/\/example\.com\/search\/teams$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_TWO_KEYS, CODEX_ADD_TWO_KEYS]);
  });

  it('不带环境变量的 MCP 不问', async () => {
    const result = await run({ catalog: withMcps(SAMPLE_MCPS[0], KEYED_MCP), answers: [choose('MCP'), pick('docs-local'), choose('执行'), choose('退出')] });

    expect(result.output).not.toMatch(/^── .* key ─/m);
    expect(result.output).not.toContain('占位符');
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });
});

describe('带 key 的 MCP：可选项留空', () => {
  it('不传这个变量，其余照常；留下的一行写明已跳过', async () => {
    const result = await run({ catalog: withMcps(WITH_OPTIONAL), answers: install(secret(KEY_VALUE), blank()) });

    expect(result.output).toMatch(/^\s+提示\s+输入不会显示在屏幕上；留空回车则不设置这个变量$/m);
    expect(result.output).toMatch(/^– SEARCH_TEAM_ID · 可选，已跳过$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
    expect(result.output).toMatch(/^\s+✓\s+search-keyed\s+Claude Code\s+已配置$/m);
  });

  it('只有可选的变量且留空时，命令和不带 key 的 MCP 一样，汇总里没有占位符的说明', async () => {
    const result = await run({ catalog: withMcps({ ...KEYED_MCP, env: [TEAM] }), answers: install(blank()) });

    expect(result.commands).toEqual([CLAUDE_ADD_NO_KEY]);
    expect(result.output).not.toContain('占位符');
  });
});

describe('带 key 的 MCP：必填项留空', () => {
  it('跳过这个 MCP 并在结果里说明原因，其余选中的照常安装', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      answers: [choose('MCP'), pick('search-keyed', 'docs-local'), blank(), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^– SEARCH_API_KEY · 必填，未填写；将跳过 search-keyed$/m);
    expect(result.output).toMatch(/^── 将安装 1 个 MCP ─+$/m);
    expect(result.output).toMatch(/^── 将执行 1 条命令 ─+$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 1 跳过$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('汇总里提醒它这次不安装：在将执行的命令之后、确认之前', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed', 'docs-local'), blank(), choose('取消'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装$/m);
    // 按 MCP 说一次，不是每个宿主说一次
    expect(result.output.split('这次不安装')).toHaveLength(2);
    expect(result.output.indexOf('将执行 2 条命令')).toBeLessThan(result.output.indexOf('这次不安装'));
    expect(result.output.indexOf('这次不安装')).toBeLessThan(result.output.indexOf('执行这些命令吗'));
  });

  it('变量名长到一行放不下时，结果的标题照样改写成「结果」，没有写到别的行上', async () => {
    const LONG = 'SEARCH_SERVICE_PRODUCTION_ACCOUNT_PERSONAL_ACCESS_TOKEN';
    const result = await run({
      catalog: withMcps({ ...KEYED_MCP, env: [{ ...KEYED_MCP.env[0], name: LONG }] }, SAMPLE_MCPS[0]),
      answers: [choose('MCP'), pick('search-keyed', 'docs-local'), blank(), choose('执行'), choose('退出')],
    });

    const lines = await screenLines(result.raw);
    const title = lines.findIndex((line) => /^── 结果 ─+$/.test(line));
    expect(title).toBeGreaterThan(-1);
    expect(lines.some((line) => line.includes('正在安装'))).toBe(false);
    // 原因自己折了行；变量名是一个折不开的词，再被终端折成两行
    expect(lines[title + 1]).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的$/);
    expect(`${lines[title + 2]?.trim()}${lines[title + 3]?.trim()}`).toBe(LONG);
    expect(lines[title + 4]).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/);
  });

  it('这个 MCP 后面的变量不再问', async () => {
    const result = await run({
      catalog: withMcps(WITH_OPTIONAL, SAMPLE_MCPS[0]),
      answers: [choose('MCP'), pick('search-keyed', 'docs-local'), blank(), choose('执行'), choose('退出')],
    });

    expect(result.output).not.toContain('SEARCH_TEAM_ID');
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
  });

  it('要装进两个宿主时，两个宿主各有一行跳过', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed', 'docs-local'), blank(), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Codex\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 2 跳过$/m);
  });

  it('选中的都因此被跳过时没有命令要执行：不问执行不执行，直接给出结果并回到主菜单', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answers: [choose('MCP'), pick('search-keyed'), blank(), choose('退出')] });

    expect(result.output).not.toContain('执行这些命令吗');
    expect(result.output).not.toContain('将执行');
    expect(result.commands).toEqual([]);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 1 跳过$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });
});

describe('带 key 的 MCP：汇总确认', () => {
  it('将执行的命令里 key 的位置是占位符，下面说明执行时才代入', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('执行'), choose('退出')],
    });

    const shown = unwrapped(result.output);
    expect(shown).toContain(' 1 claude mcp add --scope user search-keyed -e SEARCH_API_KEY=<SEARCH_API_KEY> -- npx -y @example/search-mcp ');
    expect(shown).toContain(' 2 codex mcp add search-keyed --env SEARCH_API_KEY=<SEARCH_API_KEY> -- npx -y @example/search-mcp ');
    expect(result.output).toMatch(/^\s+注意\s+key 以占位符显示，执行时才代入真实的值$/m);
    expect(result.output.indexOf('将执行 2 条命令')).toBeLessThan(result.output.indexOf('key 以占位符显示'));
    expect(result.output.indexOf('key 以占位符显示')).toBeLessThan(result.output.indexOf('执行这些命令吗'));
  });

  it('确认之前不执行：选了取消，带着 key 的命令也没有执行', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answers: [choose('MCP'), pick('search-keyed'), secret(KEY_VALUE), choose('取消'), choose('退出')] });

    expect(result.output).toContain('SEARCH_API_KEY=<SEARCH_API_KEY>');
    expect(result.commands).toEqual([]);
  });

  it('已配置的再装一次：移除命令里没有 key，添加命令带着', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      home: { '.claude.json': JSON.stringify({ mcpServers: { 'search-keyed': {} } }) },
      answers: install(secret(KEY_VALUE)),
    });

    expect(result.commands).toEqual([{ command: 'claude', args: ['mcp', 'remove', '--scope', 'user', 'search-keyed'] }, CLAUDE_ADD_KEYED]);
  });
});

describe('带 key 的 MCP：key 的值不出现在任何输出里', () => {
  const everything = (result: { raw: string; stdout: string; stderr: string }): string => result.raw + result.stdout + result.stderr;

  it('从提问、汇总到结果，终端上没有它', async () => {
    const result = await run({
      catalog: withMcps(WITH_OPTIONAL),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), secret('team-42'), choose('执行'), choose('退出')],
    });

    expect(result.commands).toHaveLength(2);
    expect(everything(result)).not.toContain(KEY_VALUE);
    expect(everything(result)).not.toContain('team-42');
  });

  it('宿主的命令失败时，失败的原因里没有它', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), commandResult: () => ({ exitCode: 1 }), answers: install(secret(KEY_VALUE)) });

    expect(result.output).toMatch(/^\s+✗\s+search-keyed\s+Claude Code\s+失败 添加命令退出状态 1$/m);
    expect(everything(result)).not.toContain(KEY_VALUE);
  });

  it('命令没能起来、而错误的消息里带着整条命令时：原因只说没能运行，不转述那句消息', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      // 消息里的 key 换了个样子（被转义过），按原值去找是找不到的
      commandResult: (command, args) => new Error(`spawn failed: ${command} ${args.map((arg) => JSON.stringify(arg.split('').join('^'))).join(' ')}`),
      answers: install(secret(KEY_VALUE)),
    });

    expect(result.output).toMatch(/^\s+✗\s+search-keyed\s+Claude Code\s+失败 添加命令没能运行$/m);
    expect(result.output).not.toContain('spawn failed');
    expect(everything(result)).not.toContain(KEY_VALUE);
    expect(result.exitCode).toBe(0);
  });

  it('执行器当场抛出、消息里带着整条命令时也一样：这一项失败，安装器不退出，没有意外错误', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      commandResult: (command, args) => {
        if (args.includes('search-keyed')) throw new TypeError(`The argument 'args' is invalid. Received ${command} ${args.join(' ')}`);
        return undefined;
      },
      answers: [choose('MCP'), pick('search-keyed', 'docs-local'), secret(KEY_VALUE), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✗\s+search-keyed\s+Claude Code\s+失败 添加命令没能运行$/m);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.output).not.toContain('意外错误');
    expect(everything(result)).not.toContain(KEY_VALUE);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('安装器不把它写进任何文件：主目录和临时目录里什么都没有多', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), onPath: both, answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('执行'), choose('退出')] });

    expect(result.commands).toHaveLength(2);
    expect(readdirSync(result.home)).toEqual([]);
    expect(readdirSync(result.tmp)).toEqual([]);
  });
});

describe('带 key 的 MCP：同一次运行里一个变量只问一次', () => {
  it('返回修改后再确认，填过的不再问，留下一行说明', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      answers: [choose('MCP'), pick('search-keyed'), secret(KEY_VALUE), choose('返回修改'), accept(), choose('执行'), choose('退出')],
    });

    expect(result.output.split('? SEARCH_API_KEY')).toHaveLength(2);
    expect(result.output).toMatch(/^✓ SEARCH_API_KEY · 本次运行已填写，不再询问$/m);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED]);
  });

  it('装完回到主菜单再装一次，同样不再问', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      answers: [choose('MCP'), pick('search-keyed'), secret(KEY_VALUE), choose('执行'), choose('MCP'), pick('search-keyed'), choose('执行'), choose('退出')],
    });

    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CLAUDE_ADD_KEYED]);
  });

  it('留空的不算填过：回头再选它时重新问', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, SAMPLE_MCPS[0]),
      answers: [choose('MCP'), pick('search-keyed', 'docs-local'), blank(), choose('返回修改'), accept(), secret(KEY_VALUE), choose('执行'), choose('退出')],
    });

    expect(result.output.split('? SEARCH_API_KEY')).toHaveLength(3);
    expect(result.commands).toEqual([CLAUDE_ADD_KEYED, CLAUDE_ADD_LOCAL]);
  });

  it('两个 MCP 用了同名的变量时各问各的，值不串', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, { ...KEYED_MCP, name: 'other-keyed' }),
      answers: [choose('MCP'), pick('search-keyed', 'other-keyed'), secret(KEY_VALUE), secret('other-value-77'), choose('执行'), choose('退出')],
    });

    expect(result.output).toMatch(/^── other-keyed 需要 key ─+$/m);
    expect(result.commands.map(({ args }) => args.filter((arg) => arg.startsWith('SEARCH_API_KEY=')))).toEqual([
      [`SEARCH_API_KEY=${KEY_VALUE}`],
      ['SEARCH_API_KEY=other-value-77'],
    ]);
  });
});

describe('带 key 的 MCP：只支持一部分宿主', () => {
  it('只为支持它的宿主带上 key，不支持的那个没有命令', async () => {
    const result = await run({
      catalog: withMcps({ ...KEYED_MCP, hosts: ['codex'] }),
      onPath: both,
      answers: [choose('MCP'), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('执行'), choose('退出')],
    });

    expect(result.commands).toEqual([CODEX_ADD_KEYED]);
  });
});

describe('目录里写坏的环境变量', () => {
  const variable = KEYED_MCP.env[0];
  const browse = [choose('MCP'), pick(), choose('退出')];

  it.each([
    ['远程地址方式的条目带了环境变量', { ...KEYED_MCP, server: { url: 'https://mcp.example.org/mcp' } }],
    ['env 不是数组', { ...KEYED_MCP, env: { SEARCH_API_KEY: 'required' } }],
    ['其中一项不是对象', { ...KEYED_MCP, env: ['SEARCH_API_KEY'] }],
    ['变量名里有等号', { ...KEYED_MCP, env: [{ ...variable, name: 'SEARCH=KEY' }] }],
    ['变量名以数字开头', { ...KEYED_MCP, env: [{ ...variable, name: '1KEY' }] }],
    ['没写是否必填', { ...KEYED_MCP, env: [{ ...variable, required: undefined }] }],
    ['是否必填写成了文字', { ...KEYED_MCP, env: [{ ...variable, required: 'true' }] }],
    ['缺英文说明', { ...KEYED_MCP, env: [{ ...variable, description: { zh: '样例搜索服务的密钥' } }] }],
    ['说明里夹着终端控制码', { ...KEYED_MCP, env: [{ ...variable, description: { zh: '密钥\x1b[2J', en: 'Key' } }] }],
    ['申请链接不是 https', { ...KEYED_MCP, env: [{ ...variable, url: 'http://example.com/keys' }] }],
    ['没写申请链接', { ...KEYED_MCP, env: [{ ...variable, url: undefined }] }],
    ['同一个变量写了两次', { ...KEYED_MCP, env: [variable, variable] }],
  ])('%s：跳过这一条并提示数量，其余条目照常', async (_label, entry) => {
    const result = await run({ catalog: withMcps(entry, SAMPLE_MCPS[0]), answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+MCP\s+1\s/m);
    expect(result.output).not.toContain('search-keyed');
    expect(result.exitCode).toBe(0);
  });

  it('远程地址方式的条目写了空的 env 不算带环境变量', async () => {
    const result = await run({ catalog: withMcps({ ...SAMPLE_MCPS[1], env: [] }), answers: browse });

    expect(result.output).not.toContain('格式有误');
    expect(result.output).toMatch(/^\s*□ tracker-remote\s+未配置\s/m);
  });
});

describe('英文界面的带 key 的 MCP', () => {
  it('说明、提问、留下的一行、占位符的说明和跳过的原因都是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(WITH_OPTIONAL, { ...KEYED_MCP, name: 'other-keyed' }),
      answers: [choose('MCP'), pick('search-keyed', 'other-keyed'), secret(KEY_VALUE), blank(), blank(), choose('Run'), choose('Exit')],
    });

    expect(result.output).toMatch(/^── search-keyed needs a key ─+$/m);
    expect(result.output).toMatch(/^\s+Variable\s+SEARCH_API_KEY \(required\)$/m);
    expect(result.output).toMatch(/^\s+Purpose\s+Key for the sample search service$/m);
    expect(result.output).toMatch(/^\s+Get one\s+https:\/\/example\.com\/search\/api-keys$/m);
    expect(unwrapped(result.output)).toContain('Tip Your input is not shown on screen; press enter on an empty line to skip search-keyed');
    expect(result.output).toMatch(/^\? SEARCH_API_KEY \(input hidden; paste, then press enter\)$/m);
    expect(result.output).toMatch(/^✓ SEARCH_API_KEY · entered$/m);
    expect(result.output).toMatch(/^── search-keyed: optional key ─+$/m);
    expect(result.output).toMatch(/^\s+Variable\s+SEARCH_TEAM_ID \(optional\)$/m);
    expect(unwrapped(result.output)).toContain('press enter on an empty line to leave this variable unset');
    expect(result.output).toMatch(/^– SEARCH_TEAM_ID · optional, skipped$/m);
    expect(result.output).toMatch(/^– SEARCH_API_KEY · required but left empty; other-keyed will be skipped$/m);
    expect(unwrapped(result.output)).toContain('Notice Keys are shown as placeholders; the real values are only filled in when the commands run');
    expect(result.output).toMatch(/^\s+–\s+other-keyed\s+Claude Code\s+skipped no value for SEARCH_API_KEY$/m);
    expect(unwrapped(result.output)).toContain('Notice other-keyed is missing the required SEARCH_API_KEY and will not be installed this time');
    expect(result.output).not.toMatch(/[一-鿿]/);
    expect(result.output).not.toContain(KEY_VALUE);
  });

  it('这次运行里填过的不再问，说法也是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(KEYED_MCP),
      answers: [choose('MCP'), pick('search-keyed'), secret(KEY_VALUE), choose('Go back and change'), accept(), choose('Cancel'), choose('Exit')],
    });

    expect(result.output).toMatch(/^✓ SEARCH_API_KEY · already entered in this run; not asked again$/m);
  });
});
