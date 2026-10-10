import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_PURPOSES, SAMPLE_TOOLS, STACK_FRAME, catalogDir, choose, pick, run } from './harness.ts';

const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
const without = <Entry extends { purpose: string }>({ purpose: _purpose, ...entry }: Entry): Omit<Entry, 'purpose'> => entry;
const [WEB_SEARCH, DEV_WORKFLOW] = SAMPLE_PURPOSES as [(typeof SAMPLE_PURPOSES)[0], (typeof SAMPLE_PURPOSES)[1]];
const browseMcps = [choose('MCP'), pick(), choose('退出')];

describe('条目的用途', () => {
  it('没有用途的条目被跳过并提示数量，其余条目照常', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [without(DOCS_LOCAL), TRACKER_REMOTE] } }),
      answers: browseMcps,
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 1 MCP$/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).not.toContain('docs-local');
    expect(result.exitCode).toBe(0);
  });

  it('用途不在用途清单里的条目被跳过，其余条目照常', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...DOCS_LOCAL, purpose: 'nowhere' }, TRACKER_REMOTE] } }),
      answers: browseMcps,
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 1 MCP$/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).not.toContain('docs-local');
    expect(result.exitCode).toBe(0);
  });
});

describe('推荐标记', () => {
  it.each([
    ['标了推荐', true],
    ['标了不推荐', false],
  ])('%s的条目照常可用', async (_label, recommended) => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...DOCS_LOCAL, recommended }, TRACKER_REMOTE] } }),
      answers: [choose('退出')],
    });

    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 MCP$/m);
    expect(result.output).not.toContain('格式有误');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['文字', 'true'],
    ['数字', 1],
    ['null', null],
  ])('推荐标记写成%s的条目被跳过，其余条目照常', async (_label, recommended) => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [{ ...DOCS_LOCAL, recommended }, TRACKER_REMOTE] } }),
      answers: browseMcps,
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).not.toContain('docs-local');
    expect(result.exitCode).toBe(0);
  });
});

describe('写坏的用途清单', () => {
  // docs-local 的用途是 web-search，tracker-remote 的是 dev-workflow：下面每种情况坏掉的都只是 web-search
  it.each([
    ['一项不是对象', ['web-search', DEV_WORKFLOW]],
    ['一项的标识不合规则', [{ ...WEB_SEARCH, id: 'Web Search' }, DEV_WORKFLOW]],
    ['一项缺名称', [{ id: 'web-search' }, DEV_WORKFLOW]],
    ['一项缺英文名称', [{ id: 'web-search', name: { zh: '联网搜索与文档检索' } }, DEV_WORKFLOW]],
    ['一项的名称里夹着终端控制码', [{ id: 'web-search', name: { zh: '联网搜索\x1b[2J', en: 'Web search' } }, DEV_WORKFLOW]],
    ['清单里没有这个用途', [DEV_WORKFLOW]],
  ])('%s：用到它的条目按「用途不在清单里」跳过，其余照常', async (_label, purposes) => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, purposes, mcps: SAMPLE_MCPS } }),
      answers: browseMcps,
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).not.toContain('docs-local');
    expect(result.exitCode).toBe(0);
  });

  it('标识重复的只留第一项：用它的条目照常，不因此多跳过什么', async () => {
    const again = { id: 'web-search', name: { zh: '重复的那一项', en: 'The duplicate' } };
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, purposes: [...SAMPLE_PURPOSES, again], mcps: SAMPLE_MCPS } }),
      answers: [choose('退出')],
    });

    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 MCP$/m);
    expect(result.output).not.toContain('格式有误');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['是对象', { 'web-search': WEB_SEARCH }],
    ['是文字', 'web-search'],
    ['是 null', null],
  ])('清单不是数组（%s）：整份目录仍读得了，skill 照常，其余条目全部跳过', async (_label, purposes) => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, purposes, mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } }),
      answers: [choose('推荐'), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 6 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill$/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });
});

describe('本仓库 skill 的用途', () => {
  const withSkillPurposes = (skillPurposes: unknown): string => catalogDir({ catalog: { ...EMPTY_CATALOG, skillPurposes } });

  it.each([
    ['没有写用途', undefined],
    ['写了清单里的用途', { alpha: 'web-search' }],
    ['写的用途不在清单里', { alpha: 'nowhere' }],
    ['写的用途不是标识', { alpha: 42 }],
    ['给目录里没有的 skill 写了用途', { 'no-such-skill': 'web-search' }],
    ['整个不是对象', ['alpha']],
  ])('%s：skill 都不跳过，也不提示', async (_label, skillPurposes) => {
    const result = await run({ catalog: withSkillPurposes(skillPurposes), answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\s+目录\s+2 skill$/m);
    expect(result.output).toMatch(/ alpha\s+未装\s/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('格式有误');
    expect(result.output).not.toContain('出错');
    expect(result.exitCode).toBe(0);
  });
});

describe('没有用途清单的旧格式目录', () => {
  it('只有三个数组、都是空的：照常读出来', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { version: 1, mcps: [], tools: [], apps: [] } }),
      answers: [choose('推荐'), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+目录\s+2 skill$/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('格式有误');
    expect(result.exitCode).toBe(0);
  });

  it('里面有不带用途的条目：不崩，skill 照常，这些条目被跳过', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { version: 1, mcps: [without(DOCS_LOCAL)], tools: [without(SAMPLE_TOOLS[0]!)], apps: [without(SAMPLE_APPS[0]!)] } }),
      answers: [choose('推荐'), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 3 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill$/m);
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).toBe(0);
  });
});
