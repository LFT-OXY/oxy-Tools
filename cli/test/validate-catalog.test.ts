// 辅助接缝：目录校验命令。测试把它当成一条命令来跑，只看输出和退出状态。
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, KEYED_MCP, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_SKILLS, SAMPLE_TOOLS, STACK_FRAME, catalogDir } from './harness.ts';

const good = SAMPLE_SKILLS[1];
const skill = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  name: 'broken',
  version: '1.0.0',
  path: 'skills/broken',
  description: { zh: '写坏的条目', en: 'A broken entry' },
  ...overrides,
});

const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));
const packageInfo = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};
// 跑的就是维护者和 CI 用的那条命令，只把 node 换成正在跑测试的这一个
const [, ...COMMAND] = (packageInfo.scripts['validate-catalog'] ?? '').split(' ');

function validate(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [...COMMAND, ...args], { cwd: CLI_DIR }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

// 每条用例各起一个 Node 进程，Windows 的 CI 机器上起得慢，放宽超时
describe('目录校验命令', { timeout: 30_000 }, () => {
  it('目录数据没有问题时，说明通过和条目数量，以零状态退出', async () => {
    const result = await validate(catalogDir());

    expect(result.stdout).toContain('目录校验通过');
    expect(result.stdout).toContain('2 个 skill');
    expect(result.exitCode).toBe(0);
  });

  it('有一条写坏时，指明是哪个文件的第几条、叫什么、哪个字段，以非零状态退出', async () => {
    const result = await validate(catalogDir({ index: { version: 1, skills: [good, skill({ path: 'skills/../broken' })] } }));

    expect(result.stderr).toContain('目录校验未通过');
    expect(result.stderr).toMatch(/index\.json.*skills.*第 2 条.*broken.*path/);
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['name', skill({ name: 'Nested/Broken' }), '小写字母'],
    ['version', skill({ version: undefined }), '非空文字'],
    ['path', skill({ path: '/etc/skills/broken' }), '相对路径'],
    ['description', skill({ description: '写坏的条目' }), '对象'],
    ['description.zh', skill({ description: { zh: '写坏的条目\x1b[2J', en: 'A broken entry' } }), '控制字符'],
    ['description.en', skill({ description: { zh: '写坏的条目' } }), '非空文字'],
  ])('%s 写坏时，说出这个字段该是什么样的', async (field, entry, rule) => {
    const result = await validate(catalogDir({ index: { version: 1, skills: [entry] } }));

    expect(result.stderr).toMatch(new RegExp(`第 1 条.*：${field.replace('.', '\\.')} .*${rule}`));
    expect(result.exitCode).toBe(1);
  });

  it('名字不合规则的条目只说第几条，不把名字原样打出来', async () => {
    const result = await validate(catalogDir({ index: { version: 1, skills: [skill({ name: 'bad\x1b[2Jname' })] } }));

    expect(result.stderr).toContain('第 1 条：name');
    expect(result.stderr).not.toContain('\x1b');
  });

  it('条目不是对象、与前面的条目重名，各有说法；有几条报几条', async () => {
    const result = await validate(catalogDir({ index: { version: 1, skills: ['broken', good, { ...good, version: '9' }] } }));

    expect(result.stderr).toContain('有 2 个条目');
    expect(result.stderr).toMatch(/第 1 条：.*不是对象/);
    expect(result.stderr).toMatch(/第 3 条（beta-pack）：.*重名/);
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['缺 catalog.json', () => catalogDir({ catalog: null }), /读不到 catalog\.json/],
    ['index.json 不是合法的 JSON', () => catalogDir({ index: '{ "version": 1, "skills": [' }), /index\.json 不是合法的 JSON/],
    ['catalog.json 的 tools 不是数组', () => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: 'none' } }), /catalog\.json 的 tools 不是数组/],
    ['index.json 的格式版本过高', () => catalogDir({ index: { version: 2, skills: [] } }), /index\.json 的格式版本是 2/],
  ])('整份读不了（%s）：说明原因和文件的位置，以非零状态退出，不显示堆栈', async (_label, makeDir, cause) => {
    const dir = makeDir();
    const result = await validate(dir);

    expect(result.stderr).toContain('目录校验未通过');
    expect(result.stderr).toMatch(cause);
    expect(result.stderr).toContain(dir);
    expect(result.stderr).not.toMatch(STACK_FRAME);
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('MCP 条目也校验：没有问题时说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、2 个 MCP、0 个工具、0 个应用项目');
    expect(result.exitCode).toBe(0);
  });

  it('工具条目也校验：没有问题时说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个 MCP、2 个工具、0 个应用项目');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['name', { name: 'Fetcher Tool' }, '小写字母'],
    ['description.en', { description: { zh: '只有中文' } }, '非空文字'],
    ['url', { url: 'http://example.com/fetcher' }, 'https:// 开头的网址'],
    ['hosts', { hosts: [] }, '非空的数组'],
    ['install', { install: 'curl -LsSf https://example.com/install.sh | sh' }, '对象'],
    ['install', { install: undefined }, '对象'],
    ['install.default', { install: { macos: 'brew install fetcher' } }, '一行命令'],
    ['install.default', { install: { default: '' } }, '一行命令'],
    ['install.default', { install: { default: 'echo one\necho two' } }, '不换行'],
    ['install.default', { install: { default: ' brew install fetcher' } }, '首尾不留空格'],
    ['install.default', { install: { default: 'echo \u202egnp.exe' } }, '看得见的 ASCII'],
    ['install.default', { install: { default: ['brew', 'install', 'fetcher'] } }, '一行命令'],
    ['install.windows', { install: { default: 'brew install fetcher', windows: false } }, 'null 表示这个系统不支持'],
    ['install.linux', { install: { default: 'brew install fetcher', linux: 'apt install\tfetcher' } }, '一行命令'],
    ['check', { check: 'fetcher' }, '对象'],
    ['check', { check: undefined }, '对象'],
    ['check', { check: {} }, 'command.*path.*恰好'],
    ['check', { check: { command: 'fetcher', path: '.fetcher/bin/fetcher' } }, 'command.*path.*恰好'],
    ['check.command', { check: { command: 'bin/fetcher' } }, '不带目录'],
    ['check.command', { check: { command: '..' } }, '不带目录'],
    ['check.command', { check: { command: 'fetcher --version' } }, '不带目录'],
    ['check.path', { check: { path: '/usr/local/bin/fetcher' } }, '相对路径'],
    ['check.path', { check: { path: '../elsewhere/fetcher' } }, '相对路径'],
  ])('工具的 %s 写坏时，指明是 catalog.json 的 tools 第几条、叫什么、这个字段该是什么样的', async (field, overrides, rule) => {
    const broken = { ...SAMPLE_TOOLS[0], name: 'broken', ...overrides };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: [SAMPLE_TOOLS[1], broken] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过');
    const named = field === 'name' ? '' : '（broken）';
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 tools 第 2 条${named}：${field.replace('.', '\\.')} .*${rule}`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('工具可以把某个系统标为不支持，也可以不认识的系统名留着不管', async () => {
    const tool = { ...SAMPLE_TOOLS[0], install: { default: 'brew install fetcher', windows: null, solaris: 42 } };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: [tool] } }));

    expect(result.stdout).toContain('1 个工具');
    expect(result.exitCode).toBe(0);
  });

  it('工具重名时只留第一条，后面的报出来', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: [SAMPLE_TOOLS[0], SAMPLE_TOOLS[0]] } }));

    expect(result.stderr).toMatch(/catalog\.json 的 tools 第 2 条（fetcher）：与前面的条目重名/);
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['url', { url: 'http://example.com/docs' }, 'https:// 开头的网址'],
    ['hosts', { hosts: [] }, '非空的数组'],
    ['hosts', { hosts: 'claude-code' }, '非空的数组'],
    ['hosts', { hosts: ['Claude Code'] }, '非空的数组'],
    ['server', { server: 'npx -y pkg' }, '对象'],
    ['server', { server: {} }, 'command.*url.*恰好'],
    ['server', { server: { command: 'npx', url: 'https://mcp.example.com/mcp' } }, 'command.*url.*恰好'],
    ['server.command', { server: { command: 'npx -y' } }, '不含空白'],
    ['server.command', { server: { command: '' } }, '不含空白'],
    ['server.args', { server: { command: 'npx', args: '-y pkg' } }, '数组'],
    ['server.args', { server: { command: 'npx', args: ['-y', 'pkg && calc'] } }, '不含空白'],
    ['server.args', { server: { command: 'npx', args: ['--name="x"'] } }, '引号'],
    ['server.url', { server: { url: 'http://mcp.example.com/mcp' } }, 'https:// 开头的网址'],
    ['server.url', { server: { url: 'https://mcp.example.com/a b' } }, 'https:// 开头的网址'],
  ])('MCP 的 %s 写坏时，指明是 catalog.json 的 mcps 第几条、叫什么、这个字段该是什么样的', async (field, overrides, rule) => {
    const broken = { ...SAMPLE_MCPS[0], name: 'broken', ...overrides };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [SAMPLE_MCPS[1], broken] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 mcps 第 2 条（broken）：${field.replace('.', '\\.')} .*${rule}`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('本地进程方式的 MCP 可以不写 args', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...SAMPLE_MCPS[0], server: { command: 'some-mcp' } }] } }));

    expect(result.stdout).toContain('1 个 MCP');
    expect(result.exitCode).toBe(0);
  });

  it('带环境变量的 MCP 条目没有问题时照常通过', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [...SAMPLE_MCPS, KEYED_MCP] } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、3 个 MCP、0 个工具、0 个应用项目');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['env', { env: 'SEARCH_API_KEY' }, '数组.*环境变量'],
    ['env', { env: [KEYED_MCP.env[0], KEYED_MCP.env[0]] }, '变量名不重复'],
    ['env', { server: { url: 'https://mcp.example.com/mcp' } }, '只能用于本地进程方式'],
    ['env[0]', { env: ['SEARCH_API_KEY'] }, '对象'],
    ['env[0].name', { env: [{ ...KEYED_MCP.env[0], name: 'SEARCH-KEY' }] }, '字母、数字和下划线'],
    ['env[0].required', { env: [{ ...KEYED_MCP.env[0], required: 'yes' }] }, 'true 或 false'],
    ['env[0].description', { env: [{ ...KEYED_MCP.env[0], description: '密钥' }] }, '对象'],
    ['env[0].description.en', { env: [{ ...KEYED_MCP.env[0], description: { zh: '密钥' } }] }, '非空文字'],
    ['env[0].url', { env: [{ ...KEYED_MCP.env[0], url: 'example.com/keys' }] }, 'https:// 开头的网址'],
    ['env[1].name', { env: [KEYED_MCP.env[0], { ...KEYED_MCP.env[0], name: '' }] }, '字母、数字和下划线'],
  ])('MCP 的 %s 写坏时，指明是哪一条、哪一个环境变量的哪个字段', async (field, overrides, rule) => {
    const broken = { ...KEYED_MCP, name: 'broken', ...overrides };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [SAMPLE_MCPS[1], broken] } }));

    const where = field.replace(/[.[\]]/g, '\\$&');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 mcps 第 2 条（broken）：${where} .*${rule}`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('应用项目条目也校验：没有问题时说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个 MCP、0 个工具、2 个应用项目');
    expect(result.exitCode).toBe(0);
  });

  it('应用项目写坏时，指明是 catalog.json 的 apps 第几条、叫什么、哪个字段', async () => {
    const broken = { ...SAMPLE_APPS[0], name: 'broken', url: 'http://example.com/broken' };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [SAMPLE_APPS[1], broken] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过');
    expect(result.stderr).toMatch(/catalog\.json 的 apps 第 2 条（broken）：url .*https:\/\/ 开头的网址/);
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('skill 和应用项目各有写坏的：都报出来', async () => {
    const result = await validate(
      catalogDir({
        index: { version: 1, skills: [good, skill({ version: undefined })] },
        catalog: { ...EMPTY_CATALOG, apps: [{ ...SAMPLE_APPS[1], description: { zh: '只有中文' } }, SAMPLE_APPS[1]] },
      }),
    );

    expect(result.stderr).toContain('有 2 个条目');
    expect(result.stderr).toMatch(/index\.json 的 skills 第 2 条（broken）：version /);
    expect(result.stderr).toMatch(/catalog\.json 的 apps 第 1 条（borealis）：description\.en .*非空文字/);
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['没给目录', []],
    ['多给了参数', ['one', 'two']],
  ])('%s：给出用法，以状态 2 退出', async (_label, args) => {
    const result = await validate(...args);

    expect(result.stderr).toContain('用法：npm run validate-catalog -- <目录>');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(2);
  });
});
