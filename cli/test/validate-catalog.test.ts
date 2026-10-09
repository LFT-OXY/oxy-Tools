// 辅助接缝：目录校验命令。测试把它当成一条命令来跑，只看输出和退出状态。
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_SKILLS, STACK_FRAME, catalogDir } from './harness.ts';

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

  it('安装器还不读内容的那几类条目：照常通过，但说明它们有几条没有校验', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ name: 'future' }, {}] } }));

    expect(result.stdout).toContain('目录校验通过');
    expect(result.stdout).toMatch(/未校验.*catalog\.json 的 mcps 有 2 条/);
    expect(result.stdout).not.toContain('tools');
    expect(result.exitCode).toBe(0);
  });

  it('应用项目条目也校验：没有问题时说明有几个，不算进未校验', async () => {
    const result = await validate(catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } }));

    expect(result.stdout).toContain('目录校验通过：2 个 skill、2 个应用项目');
    expect(result.stdout).not.toContain('未校验');
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

  it('每一类条目都校验过时，不出现未校验的说明', async () => {
    const result = await validate(catalogDir());

    expect(result.stdout).not.toContain('未校验');
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
