// 辅助接缝：目录校验命令。测试把它当成一条命令来跑，只看输出和退出状态。
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  KEYED_MCP,
  SAMPLE_APPS,
  SAMPLE_MCPS,
  SAMPLE_PURPOSES,
  SAMPLE_SKILLS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  STACK_FRAME,
  catalogDir,
} from './harness.ts';

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

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、2 个 MCP、0 个工具、0 个应用项目');
    expect(result.exitCode).toBe(0);
  });

  it('工具条目也校验：没有问题时说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、0 个 MCP、2 个工具、0 个应用项目');
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

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、3 个 MCP、0 个工具、0 个应用项目');
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

  it('第三方 Skill 条目也校验：没有问题时通过的那一行里说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、2 个第三方 Skill、0 个 MCP、0 个工具、0 个应用项目、2 个用途');
    expect(result.exitCode).toBe(0);
  });

  it('第三方 Skill 可以写宿主限制；来源的两段和 skill 的名字里可以有点、下划线和连字符', async () => {
    const skills = ['a', 'v1.2_final', 'snake__case_', 'dotted..name', 'kebab-case-9'].map((name) => ({ ...SAMPLE_THIRD_PARTY[1]?.skills[0], name }));
    const entry = { ...SAMPLE_THIRD_PARTY[1], hosts: ['claude-code'], source: 'Some_Org.x/repo-name.v2', skills };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: [entry] } }));

    expect(result.stdout).toContain('1 个第三方 Skill');
    expect(result.exitCode).toBe(0);
  });

  const [KIT] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0]];
  const [READER] = KIT.skills as [(typeof KIT.skills)[0]];
  it.each([
    ['source', { source: undefined }, '所有者/仓库'],
    ['source', { source: 'paper-kit' }, '所有者/仓库'],
    ['source', { source: 'https://github.com/example-labs/paper-kit' }, '所有者/仓库'],
    ['source', { source: 'example-labs/paper-kit/skills' }, '所有者/仓库'],
    ['source', { source: 'example labs/paper-kit' }, '所有者/仓库'],
    // 会被 skills CLI 当成本地路径、当成选项的写法
    ['source', { source: '../paper-kit' }, '每段以字母或数字开头'],
    ['source', { source: '--all/paper-kit' }, '每段以字母或数字开头'],
    ['source', { source: 'example-labs/-g' }, '每段以字母或数字开头'],
    ['skills', { skills: undefined }, '非空的数组'],
    ['skills', { skills: [] }, '非空的数组'],
    ['skills', { skills: 'paper-reader' }, '非空的数组'],
    ['skills', { skills: [READER, READER] }, '名字不重复'],
    ['skills[0]', { skills: ['paper-reader'] }, '对象'],
    ['skills[0].name', { skills: [{ ...READER, name: undefined }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: '--yes' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: 'paper reader' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: '../escape' }] }, '小写写法'],
    // skills CLI 装出来的目录名是小写的，首尾的点和连字符会被去掉，连着的连字符会并成一个
    ['skills[0].name', { skills: [{ ...READER, name: 'Paper-Reader' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: 'paper-reader-' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: 'paper--reader' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: 'paper-reader.' }] }, '小写写法'],
    ['skills[0].name', { skills: [{ ...READER, name: '_paper-reader' }] }, '小写写法'],
    ['skills[1].name', { skills: [READER, { ...READER, name: '' }] }, '小写写法'],
    ['skills[0].description', { skills: [{ ...READER, description: '读论文' }] }, '对象'],
    ['skills[0].description.en', { skills: [{ ...READER, description: { zh: '读论文' } }] }, '非空文字'],
    ['hosts', { hosts: [] }, '非空的数组'],
    ['url', { url: 'http://github.com/example-labs/paper-kit' }, 'https:// 开头的网址'],
    ['purpose', { purpose: undefined }, '用途清单'],
  ])('第三方 Skill 的 %s 写坏时，指明是 thirdPartySkills 第几条、叫什么、哪个字段', async (field, overrides, rule) => {
    const broken = { ...KIT, name: 'broken', ...overrides };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: [SAMPLE_THIRD_PARTY[1], broken] } }));

    const where = field.replace(/[.[\]]/g, '\\$&');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 thirdPartySkills 第 2 条（broken）：${where} .*${rule}`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('第三方 Skill 的用途不在用途清单里、与前面的条目重名、不是对象，各有各的说法', async () => {
    const result = await validate(
      catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: [KIT, { ...KIT, purpose: 'nowhere', name: 'lost' }, KIT, 'paper-kit'] } }),
    );

    expect(result.stderr).toContain('有 3 个条目会被安装器跳过');
    expect(result.stderr).toMatch(/thirdPartySkills 第 2 条（lost）：用途 nowhere 不在用途清单/);
    expect(result.stderr).toMatch(/thirdPartySkills 第 3 条（paper-kit）：与前面的条目重名/);
    expect(result.stderr).toMatch(/thirdPartySkills 第 4 条：条目不是对象/);
    expect(result.exitCode).toBe(1);
  });

  it('thirdPartySkills 不是数组时整份读不了，指出这个字段', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: {} } }));

    expect(result.stderr).toContain('目录校验未通过：目录格式有误');
    expect(result.stderr).toContain('thirdPartySkills 不是数组');
    expect(result.exitCode).toBe(1);
  });

  it('应用项目条目也校验：没有问题时说明有几个', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、0 个 MCP、0 个工具、2 个应用项目');
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

  it('用途清单也校验：没有问题时说明有几个用途', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, skillPurposes: { alpha: 'web-search' } } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、2 个 MCP、0 个工具、0 个应用项目、2 个用途');
    expect(result.exitCode).toBe(0);
  });

  it('没有用途清单的旧格式目录，里面没有条目时照常通过', async () => {
    const result = await validate(catalogDir({ catalog: { version: 1, mcps: [], tools: [], apps: [] } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、0 个第三方 Skill、0 个 MCP、0 个工具、0 个应用项目、0 个用途');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['mcps', SAMPLE_MCPS],
    ['tools', SAMPLE_TOOLS],
    ['apps', SAMPLE_APPS],
  ])('%s 的条目没有用途时，说出每个条目都要写用途', async (list, [first, second]) => {
    const { purpose: _purpose, ...broken } = { ...first!, name: 'broken' };
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, [list]: [second, broken] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 ${list} 第 2 条（broken）：purpose .*用途清单.*标识.*每个条目都要写`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['不是文字', 42],
    ['不是标识', 'Web Search'],
    ['夹着终端控制码', 'web\x1b[2Jsearch'],
  ])('条目的用途%s时，和没有用途是同一句说法，不把写的东西原样打出来', async (_label, purpose) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...SAMPLE_MCPS[0], purpose }] } }));

    expect(result.stderr).toMatch(/catalog\.json 的 mcps 第 1 条（docs-local）：purpose .*用途清单.*标识/);
    expect(result.stderr).not.toContain('\x1b');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['mcps', SAMPLE_MCPS],
    ['tools', SAMPLE_TOOLS],
    ['apps', SAMPLE_APPS],
  ])('%s 的条目的用途不在用途清单里时，说出写的是哪个用途', async (list, [first, second]) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, [list]: [second, { ...first, name: 'broken', purpose: 'web-serach' }] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 ${list} 第 2 条（broken）：用途 web-serach 不在用途清单（purposes）里`));
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('条目的推荐标记不是布尔时，说出这个字段该是什么样的', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, tools: [{ ...SAMPLE_TOOLS[0], recommended: 'yes' }] } }));

    expect(result.stderr).toMatch(/catalog\.json 的 tools 第 1 条（fetcher）：recommended .*true 或 false/);
    expect(result.exitCode).toBe(1);
  });

  it('条目自己的字段和用途都写坏时，只报头一处：自己的字段', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...SAMPLE_MCPS[0], server: {}, purpose: 'nowhere' }] } }));

    expect(result.stderr).toMatch(/catalog\.json 的 mcps 第 1 条（docs-local）：server /);
    expect(result.stderr).not.toContain('nowhere');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['是对象', { 'web-search': SAMPLE_PURPOSES[0] }],
    ['是文字', 'web-search'],
    ['是 null', null],
  ])('用途清单不是数组（%s）时，说明它会被当作空的；没有条目也不算通过', async (_label, purposes) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, purposes } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 处写坏了');
    expect(result.stderr).toMatch(/catalog\.json 的 purposes 不是数组/);
    expect(result.stderr).not.toMatch(STACK_FRAME);
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('用途清单不是数组时，被连带跳过的条目和清单本身都报出来', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, purposes: {}, mcps: SAMPLE_MCPS } }));

    expect(result.stderr).toContain('目录校验未通过：有 2 个条目会被安装器跳过，另有 1 处写坏了');
    expect(result.stderr).toMatch(/catalog\.json 的 mcps 第 1 条（docs-local）：用途 web-search 不在用途清单（purposes）里/);
    expect(result.stderr).toMatch(/catalog\.json 的 mcps 第 2 条（tracker-remote）：用途 dev-workflow 不在用途清单（purposes）里/);
    expect(result.stderr).toMatch(/catalog\.json 的 purposes 不是数组/);
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['不是对象', 'web-search', '', '不是对象'],
    ['标识不合规则', { ...SAMPLE_PURPOSES[0], id: 'Web Search' }, '', 'id .*小写字母'],
    ['没有标识', { name: SAMPLE_PURPOSES[0]!.name }, '', 'id .*小写字母'],
    ['缺名称', { id: 'web-search' }, '（web-search）', 'name .*对象'],
    ['缺中文名称', { id: 'web-search', name: { en: 'Web search' } }, '（web-search）', 'name\\.zh .*非空文字'],
    ['缺英文名称', { id: 'web-search', name: { zh: '联网搜索' } }, '（web-search）', 'name\\.en .*非空文字'],
    ['名称里夹着终端控制码', { id: 'web-search', name: { zh: '联网搜索\x1b[2J', en: 'Web search' } }, '（web-search）', 'name\\.zh .*控制字符'],
    ['标识与前面的重复', SAMPLE_PURPOSES[1], '（dev-workflow）', '与前面的用途标识重复'],
  ])('用途清单的一项%s时，指明是第几项、哪个字段；没有条目用到它也不算通过', async (_label, broken, named, problem) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, purposes: [SAMPLE_PURPOSES[1], broken] } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 处写坏了');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 purposes 第 2 项${named}：${problem}`));
    expect(result.stderr).not.toContain('\x1b');
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['用途不在清单里', { alpha: 'web-serach' }, ' alpha 的用途 web-serach 不在用途清单（purposes）里'],
    ['用途不是标识', { alpha: 42 }, ' alpha 的用途要是.*标识'],
    ['目录里没有这个 skill', { 'no-such-skill': 'web-search' }, ' no-such-skill 不是 index\\.json 里的 skill'],
    ['skill 的名字不合规则', { 'bad\x1b[2Jname': 'web-search' }, '有一个名字不是 index\\.json 里的 skill'],
  ])('给本仓库 skill 写的用途有问题（%s）：安装器不跳过它，但命令报出来', async (_label, skillPurposes, problem) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, skillPurposes } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 处写坏了');
    expect(result.stderr).toMatch(new RegExp(`catalog\\.json 的 skillPurposes 里${problem}`));
    expect(result.stderr).not.toContain('\x1b');
    expect(result.stdout).not.toContain('通过');
    expect(result.exitCode).toBe(1);
  });

  it('被跳过的 skill 不算目录里的 skill：给它写用途同样报出来', async () => {
    const result = await validate(
      catalogDir({
        index: { version: 1, skills: [good, skill({ version: undefined })] },
        catalog: { ...EMPTY_CATALOG, skillPurposes: { broken: 'web-search' } },
      }),
    );

    expect(result.stderr).toContain('目录校验未通过：有 1 个条目会被安装器跳过，另有 1 处写坏了');
    expect(result.stderr).toMatch(/catalog\.json 的 skillPurposes 里 broken 不是 index\.json 里的 skill/);
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['是数组', ['alpha']],
    ['是文字', 'alpha'],
    ['是 null', null],
  ])('本仓库 skill 的用途不是对象（%s）时，说明该怎么写', async (_label, skillPurposes) => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, skillPurposes } }));

    expect(result.stderr).toContain('目录校验未通过：有 1 处写坏了');
    expect(result.stderr).toMatch(/catalog\.json 的 skillPurposes 不是对象/);
    expect(result.stdout).not.toContain('通过');
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
