import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource, type CatalogSource } from '../src/catalog.ts';
import { EMPTY_CATALOG, SAMPLE_SKILLS, STACK_FRAME, catalogDir, choose, pick, run, tempDir } from './harness.ts';

const good = SAMPLE_SKILLS[1];
const skill = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  name: 'broken',
  version: '1.0.0',
  path: 'skills/broken',
  description: { zh: '写坏的条目', en: 'A broken entry' },
  ...overrides,
});
const browse = [choose('Skill'), pick(), choose('退出')];

describe('写坏的条目', () => {
  it.each([
    ['path 是绝对路径', skill({ path: '/etc/skills/broken' })],
    ['path 带盘符', skill({ path: 'C:\\skills\\broken' })],
    ['path 里有 ..', skill({ path: 'skills/../../broken' })],
    ['path 里有空段', skill({ path: 'skills//broken' })],
    ['path 以斜杠结尾', skill({ path: 'skills/broken/' })],
    ['path 为空', skill({ path: '' })],
    ['name 里有 ..', skill({ name: '../broken' })],
    ['name 里有路径分隔符', skill({ name: 'nested/broken' })],
    ['name 为空', skill({ name: '' })],
    ['缺 version', skill({ version: undefined })],
    ['缺英文说明', skill({ description: { zh: '写坏的条目' } })],
    ['说明不是文字', skill({ description: { zh: 42, en: 'A broken entry' } })],
    ['说明里夹着终端控制码', skill({ description: { zh: '写坏的条目\x1b[2J', en: 'A broken entry' } })],
    ['条目不是对象', 'broken'],
  ])('%s：跳过这一条并提示数量，其余条目照常', async (_label, entry) => {
    const result = await run({ catalog: catalogDir({ index: { version: 1, skills: [entry, good] } }), answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+1 skill$/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('broken');
    expect(result.exitCode).toBe(0);
  });

  it('重名的条目只留第一条', async () => {
    const again = { ...good, description: { zh: '重名的那一条', en: 'The duplicate' } };
    const result = await run({ catalog: catalogDir({ index: { version: 1, skills: [good, again] } }), answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).not.toContain('重名的那一条');
  });

  it('没有坏条目时不出现提醒', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.output).not.toContain('格式有误');
  });

  it('全部条目都被跳过时，主菜单只剩退出', async () => {
    const result = await run({
      catalog: catalogDir({ index: { version: 1, skills: [skill({ path: '/abs' })] } }),
      answers: [choose('退出')],
    });

    expect(result.output).not.toMatch(/^\s+Skill\s/m);
    expect(result.exitCode).toBe(0);
  });
});

describe('不认识的字段', () => {
  it('被忽略，条目照常可用', async () => {
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, generatedBy: 'someone', skills: [{ ...good, homepage: 'https://example.com', tags: ['x'] }] },
        catalog: { ...EMPTY_CATALOG, plugins: [{ name: 'future' }] },
      }),
      answers: browse,
    });

    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('格式有误');
    expect(result.exitCode).toBe(0);
  });
});

describe('目录格式版本高于安装器所支持的版本', () => {
  it.each([
    ['index.json', catalogDir.bind(null, { index: { version: 2, skills: 'reshaped' } })],
    ['catalog.json', catalogDir.bind(null, { catalog: { version: 2, components: {} } })],
  ])('%s：提示升级命令并以非零状态退出，不尝试解析', async (file, makeDir) => {
    const result = await run({ catalog: makeDir() });

    expect(result.output).toContain('出错：');
    expect(result.output).toContain(file);
    expect(result.output).toContain('npx oxy-tools@latest');
    expect(result.output).not.toContain('选择分组');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('目录读取失败', () => {
  const offline: CatalogSource = {
    kind: 'remote',
    locate: (file) => `https://example.invalid/catalog/${file}`,
    readText: () => Promise.reject(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND example.invalid') })),
    pin: () => Promise.reject(new Error('目录都读不到，不该走到下载这一步')),
  };

  it('断网时说明读不到什么、从哪读，给出下一步，以非零状态退出', async () => {
    const result = await run({ catalog: offline });

    expect(result.output).toContain('出错：无法读取目录');
    expect(result.output).toContain('https://example.invalid/catalog/');
    expect(result.output).toContain('ENOTFOUND');
    expect(result.output).toMatch(/^\s+下一步\s+\S/m);
    expect(result.output).not.toContain('选择分组');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });

  it('加载提示被擦掉，不留在出错说明旁边', async () => {
    const result = await run({ catalog: offline });

    expect(result.output).toContain('正在读取目录');
    expect(result.screen).not.toContain('正在读取目录');
  });

  it('出错说明写到标准错误', async () => {
    const result = await run({ catalog: offline });

    expect(result.stderr).toContain('出错：无法读取目录');
    expect(result.stdout).not.toContain('出错');
  });

  it('英文界面下说明也是英文', async () => {
    const result = await run({ catalog: offline, argv: ['--lang', 'en'] });

    expect(result.output).toContain('Error: Cannot read the catalog');
    expect(result.output).toMatch(/^\s+Next\s+\S/m);
  });

  it.each([
    ['缺 catalog.json', () => catalogDir({ catalog: null }), 'catalog.json'],
    ['index.json 不是合法的 JSON', () => catalogDir({ index: '{ "version": 1, "skills": [' }), 'index.json'],
    ['index.json 的 skills 不是数组', () => catalogDir({ index: { version: 1, skills: {} } }), 'index.json'],
    ['catalog.json 没有格式版本号', () => catalogDir({ catalog: { mcps: [], tools: [], apps: [] } }), 'catalog.json'],
    ['catalog.json 的 tools 不是数组', () => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: 'none' } }), 'catalog.json'],
  ])('%s：指出是哪个文件，以非零状态退出', async (_label, makeDir, file) => {
    const result = await run({ catalog: makeDir() });

    expect(result.output).toContain('出错：');
    expect(result.output).toContain(file);
    expect(result.output).not.toContain('选择分组');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('目录来源', () => {
  it('环境变量 OXY_TOOLS_CATALOG 把目录来源改为本地目录', async () => {
    const unreachable: CatalogSource = {
      kind: 'remote',
      locate: (file) => `https://example.invalid/${file}`,
      readText: () => Promise.reject(new Error('不该读到默认的目录来源')),
      pin: () => Promise.reject(new Error('不该读到默认的目录来源')),
    };
    const local = catalogDir({ index: { version: 1, skills: [{ ...good, name: 'from-local-dir', path: 'skills/from-local-dir' }] } });

    const result = await run({ catalog: unreachable, env: { OXY_TOOLS_CATALOG: local }, answers: browse });

    expect(result.output).toMatch(/ from-local-dir\s+未装\s+第二个样例 skill$/m);
    expect(result.exitCode).toBe(0);
  });

  it('OXY_TOOLS_CATALOG 指向的目录读不到时，下一步提到这个变量', async () => {
    // 路径里有空格和汉字：位置要原样打在一行上，不能被折开
    const missing = join(tempDir('catalog'), '我的 目录', 'not here');
    const result = await run({ env: { OXY_TOOLS_CATALOG: missing } });

    expect(result.output).toContain('出错：无法读取目录');
    expect(result.output).toContain(missing);
    expect(result.output).toContain('OXY_TOOLS_CATALOG');
    expect(result.exitCode).not.toBe(0);
  });
});

describe('默认的目录来源', () => {
  const served = (files: Record<string, unknown>) =>
    vi.fn<typeof fetch>(async (url) => {
      const name = String(url).split('/').pop() ?? '';
      return name in files ? new Response(JSON.stringify(files[name])) : new Response('Not Found', { status: 404 });
    });
  afterEach(() => vi.unstubAllGlobals());

  it('从 GitHub 上本仓库 main 分支读取 index.json 和 catalog.json，只走 HTTPS、不跟随跳转', async () => {
    const fetched = served({ 'index.json': { version: 1, skills: [good] }, 'catalog.json': EMPTY_CATALOG });
    vi.stubGlobal('fetch', fetched);

    const result = await run({ catalog: githubCatalogSource(), answers: browse });

    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(fetched.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      'https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/main/catalog.json',
      'https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/main/index.json',
    ]);
    for (const [, init] of fetched.mock.calls) expect(init?.redirect).toBe('error');
  });

  it('服务器答复不是成功时，原因里带上状态码和读的是哪个网址', async () => {
    vi.stubGlobal('fetch', served({ 'index.json': { version: 1, skills: [good] } }));

    const result = await run({ catalog: githubCatalogSource() });

    expect(result.stderr).toContain('出错：无法读取目录');
    expect(result.stderr).toContain('HTTP 404');
    expect(result.stderr).toContain('https://raw.githubusercontent.com/LFT-OXY/oxy-Tools/main/catalog.json');
    expect(result.exitCode).not.toBe(0);
  });
});
