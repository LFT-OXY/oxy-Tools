import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubCatalogSource } from '../src/catalog.ts';
import { fakeGitHub } from './github.ts';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_SKILLS, SAMPLE_TOOLS, accept, catalogDir, choose, no, pick, run } from './harness.ts';
import { displayWidth } from '../src/text.ts';

// 样例的两个用途，照用途清单的顺序；borealis 在前一个下面，atlas 在后一个下面
const WEB_SEARCH = '联网搜索与文档检索';
const DEV_WORKFLOW = '开发工作流与规范';
const [ALPHA, BETA_PACK] = SAMPLE_SKILLS as [(typeof SAMPLE_SKILLS)[0], (typeof SAMPLE_SKILLS)[1]];
const [ATLAS, BOREALIS] = SAMPLE_APPS as [(typeof SAMPLE_APPS)[0], (typeof SAMPLE_APPS)[1]];
const [DOCS_LOCAL, TRACKER_REMOTE] = SAMPLE_MCPS as [(typeof SAMPLE_MCPS)[0], (typeof SAMPLE_MCPS)[1]];
const BOTH_HOSTS = ['claude', 'codex'];
const QUESTION = '? 选择要安装的条目';

// alpha 另外归在「联网搜索与文档检索」下，和 borealis 在同一张列表里；beta-pack 不带任何标注
const MIXED = { ...EMPTY_CATALOG, apps: SAMPLE_APPS, skillPurposes: { alpha: 'web-search' } };
const withCatalog = (catalog: Record<string, unknown> = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, ...catalog } });
const withoutSkills = (catalog: Record<string, unknown>): string =>
  catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, ...catalog } });
const mixed = (): string => catalogDir({ catalog: MIXED });
// 列表里的行（可勾选的、已勾选的、不可选的）各自的名字
const listed = (output: string): string[] =>
  output.split('\n').flatMap((line) => (/^ [□■–] /.test(line) ? [line.trim().split(/\s+/)[1] ?? ''] : []));
// 主菜单第一次出现时，表头下面到空行为止的各行
const menuRows = (output: string): string[] => {
  const lines = output.split('\n');
  const from = lines.findIndex((line) => /^\s+用途\s+数量/.test(line)) + 1;
  return lines.slice(from, lines.indexOf('', from)).map((line) => line.trim());
};

describe('主菜单上的「推荐」', () => {
  it('第一行是「推荐」，数的是本仓库的全部 skill；没有「Skill」这个分组', async () => {
    const result = await run({ catalog: withCatalog({ apps: SAMPLE_APPS }), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+用途\s+数量\n\s+推荐\s+2\n\s+联网搜索与文档检索\s+1$/m);
    expect(result.output).not.toMatch(/^\s+Skill\s+\d/m);
    expect(result.exitCode).toBe(0);
  });

  it('里面一个条目都没有时，「推荐」这一行不出现', async () => {
    const result = await run({ catalog: withoutSkills({ apps: SAMPLE_APPS }), answers: [choose('退出')] });

    expect(menuRows(result.output)).toEqual([expect.stringMatching(/^联网搜索与文档检索\s+1$/), expect.stringMatching(/^开发工作流与规范\s+1$/)]);
    expect(result.output).not.toContain('推荐');
  });

  it('没有本仓库的 skill 时，带推荐标记的条目也撑得起「推荐」', async () => {
    const result = await run({
      catalog: withoutSkills({ apps: [{ ...ATLAS, recommended: true }, BOREALIS] }),
      answers: [choose('推荐'), pick(), choose('退出')],
    });

    expect(menuRows(result.output)[0]).toMatch(/^推荐\s+1$/);
    expect(listed(result.output)).toEqual(['atlas']);
  });

  it('「推荐」下面只有各个用途：MCP、工具、外部项目都数在各自的用途里，没有按类型分的行', async () => {
    const result = await run({ catalog: withCatalog({ mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS }), answers: [choose('退出')] });

    expect(result.output).toMatch(
      /^\s+用途\s+数量\n\s+推荐\s+2\n\s+联网搜索与文档检索\s+3\n\s+开发工作流与规范\s+3\n\s*\n\s+退出$/m,
    );
  });

  it('英文界面：第一行是 Recommended', async () => {
    const result = await run({ argv: ['--lang', 'en'], answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+Purpose\s+Count\n\s+Recommended\s+2$/m);
  });
});

describe('「推荐」和用途里各有什么', () => {
  it('「推荐」里是本仓库的全部 skill，不带任何标注的也在；它们不在任何用途下', async () => {
    const result = await run({
      catalog: withCatalog({ apps: SAMPLE_APPS }),
      answers: [choose('推荐'), pick(), choose(WEB_SEARCH), pick(), choose(DEV_WORKFLOW), pick(), choose('退出')],
    });
    const [, recommended = '', webSearch = '', devWorkflow = ''] = result.output.split(QUESTION);

    expect(listed(recommended)).toEqual(['alpha', 'beta-pack']);
    expect(listed(webSearch)).toEqual(['borealis']);
    expect(listed(devWorkflow)).toEqual(['atlas']);
  });

  it('写了用途的 skill 在「推荐」和那个用途下两处都有，那个用途的数量把它数上', async () => {
    const result = await run({ catalog: mixed(), answers: [choose('推荐'), pick(), choose(WEB_SEARCH), pick(), choose('退出')] });
    const [, recommended = '', webSearch = ''] = result.output.split(QUESTION);

    expect(menuRows(result.output)).toEqual([
      expect.stringMatching(/^推荐\s+2$/),
      expect.stringMatching(/^联网搜索与文档检索\s+2$/),
      expect.stringMatching(/^开发工作流与规范\s+1$/),
    ]);
    expect(listed(recommended)).toEqual(['alpha', 'beta-pack']);
    expect(listed(webSearch)).toEqual(['alpha', 'borealis']);
  });

  it('带推荐标记的外部项目同时出现在「推荐」和它的用途下', async () => {
    const result = await run({
      catalog: withCatalog({ apps: [{ ...ATLAS, recommended: true }, BOREALIS] }),
      answers: [choose('推荐'), pick(), choose(DEV_WORKFLOW), pick(), choose('退出')],
    });
    const [, recommended = '', devWorkflow = ''] = result.output.split(QUESTION);

    expect(menuRows(result.output)[0]).toMatch(/^推荐\s+3$/);
    expect(listed(recommended)).toEqual(['alpha', 'beta-pack', 'atlas']);
    expect(listed(devWorkflow)).toEqual(['atlas']);
  });

  it('带推荐标记的 MCP 同时出现在「推荐」和它的用途下；「推荐」里它排在 skill 之后、外部项目之前', async () => {
    const result = await run({
      catalog: withCatalog({ mcps: [{ ...DOCS_LOCAL, recommended: true }, TRACKER_REMOTE], apps: [{ ...ATLAS, recommended: true }] }),
      answers: [choose('推荐'), pick(), choose(WEB_SEARCH), pick(), choose(DEV_WORKFLOW), pick(), choose('退出')],
    });
    const [, recommended = '', webSearch = '', devWorkflow = ''] = result.output.split(QUESTION);

    expect(menuRows(result.output)[0]).toMatch(/^推荐\s+4$/);
    expect(listed(recommended)).toEqual(['alpha', 'beta-pack', 'docs-local', 'atlas']);
    expect(listed(webSearch)).toEqual(['docs-local']);
    // 没带标记的 MCP 只在它的用途下
    expect(listed(devWorkflow)).toEqual(['tracker-remote', 'atlas']);
  });

  it('MCP 一段里带推荐的在前，其余按名字，不照目录文件里的先后', async () => {
    const mcps = ['mid', 'zeta', 'early'].map((name) => ({ ...DOCS_LOCAL, name, recommended: name === 'zeta' }));
    const result = await run({ catalog: withCatalog({ mcps }), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(listed(result.output)).toEqual(['zeta', 'early', 'mid']);
  });

  it('skill 按名字排，不照 skill 清单里的先后', async () => {
    const result = await run({ catalog: catalogDir({ index: { version: 1, skills: [BETA_PACK, ALPHA] } }), answers: [choose('推荐'), pick(), choose('退出')] });

    expect(listed(result.output)).toEqual(['alpha', 'beta-pack']);
  });
});

describe('混合列表', () => {
  it('组件在上、外部项目在下，各自段首写着类型；两段之间空一行', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(
      /^\s+名称\s+Claude Code\s+说明\n\s+── Skill\n □ alpha\s+未装\s+推荐 · 第一个样例 skill.*…\n\n\s+── 外部项目 · 只给链接，不安装\n □ borealis\s+第二个样例外部项目$/m,
    );
  });

  it('列表下方先是光标所在行的类型，带推荐的后面跟着「推荐」，再是说明全文', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(/^Skill · 推荐\n第一个样例 skill，它的说明故意写得很长.*全文要到列表下方去看$/m);
  });

  it('用途的列表里带推荐标记的行看得出来，没带的不写', async () => {
    const result = await run({
      catalog: withoutSkills({ apps: [BOREALIS, { ...ATLAS, purpose: 'web-search', recommended: true }] }),
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^ □ atlas\s+推荐 · 第一个样例外部项目/m);
    expect(result.output).toMatch(/^ □ borealis\s+第二个样例外部项目$/m);
    expect(result.output).toMatch(/^外部项目 · 推荐$/m);
  });

  it('带推荐标记的 MCP：行上写着标记，列表下方「类型」一行里跟着「推荐」；没带的不写', async () => {
    const result = await run({
      catalog: withoutSkills({ mcps: [{ ...DOCS_LOCAL, recommended: true }, { ...TRACKER_REMOTE, purpose: 'web-search' }] }),
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+── MCP\n □ docs-local\s+未配置\s+推荐 · 本地进程方式的样例 MCP.*…\n □ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).toMatch(/^MCP · 推荐$/m);
  });

  it('「推荐」那张列表里每一行都是推荐的，行上和类型里都不再写', async () => {
    const result = await run({ catalog: withCatalog({ apps: [{ ...ATLAS, recommended: true }] }), answers: [choose('推荐'), pick(), choose('退出')] });
    const list = (result.output.split(QUESTION)[1] ?? '').split('? 选择用途')[0] ?? '';

    expect(list).toMatch(/^ □ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(list).toMatch(/^ □ atlas\s+第一个样例外部项目/m);
    expect(list).toMatch(/^Skill$/m);
    expect(list).not.toContain('推荐');
  });

  it('skill 每个所选宿主各有一栏状态', async () => {
    const result = await run({
      catalog: mixed(),
      onPath: BOTH_HOSTS,
      home: { '.agents/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明\n\s+── Skill\n □ alpha\s+未装\s+非本工具安装\s+推荐 · /m);
  });

  it('说明一栏不足 12 列时整栏不写，表头也不写；外部项目的说明照常', async () => {
    // 行首 3 列、名称 35 列、两栏状态各 15 列：说明只剩 11 列
    const name = 'a-skill-with-a-very-long-name-xx';
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, skills: [{ ...ALPHA, name, path: `skills/${name}` }] },
        catalog: { ...EMPTY_CATALOG, apps: [BOREALIS], skillPurposes: { [name]: 'web-search' } },
      }),
      onPath: BOTH_HOSTS,
      home: { [`.claude/skills/${name}/SKILL.md`]: '别处装的\n', [`.agents/skills/${name}/SKILL.md`]: '别处装的\n' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(new RegExp(`^\\s+名称\\s+Claude Code\\s+Codex\\n\\s+── Skill\\n □ ${name} {3}非本工具安装 {3}非本工具安装$`, 'm'));
    expect(result.output).toMatch(/^ □ borealis\s+第二个样例外部项目$/m);
  });

  it('说明一栏恰好 12 列时照常写', async () => {
    const name = 'a-skill-with-a-very-long-name-x';
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, skills: [{ ...ALPHA, name, path: `skills/${name}` }] },
        catalog: { ...EMPTY_CATALOG, skillPurposes: { [name]: 'web-search' } },
      }),
      onPath: BOTH_HOSTS,
      home: { [`.claude/skills/${name}/SKILL.md`]: '别处装的\n', [`.agents/skills/${name}/SKILL.md`]: '别处装的\n' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/m);
    expect(result.output).toMatch(new RegExp(`^ □ ${name} {3}非本工具安装 {3}非本工具安装 {3}推荐 · 第一…$`, 'm'));
  });

  it('英文界面：段标题、标记和类型的写法', async () => {
    const result = await run({ argv: ['--lang', 'en'], catalog: mixed(), answers: [choose('Web search & docs retrieval'), pick(), choose('Exit')] });

    expect(result.output).toMatch(
      /^\s+Name\s+Claude Code\s+About\n\s+── Skills\n □ alpha\s+none\s+pick · The first sample skill.*…\n\n\s+── External projects · links only, nothing is installed\n □ borealis\s+The second sample external project$/m,
    );
    expect(result.output).toMatch(/^Skill · Recommended$/m);
  });

  it.each([
    ['中文', [], WEB_SEARCH, '退出', QUESTION],
    ['英文', ['--lang', 'en'], 'Web search & docs retrieval', 'Exit', '? Pick entries to install'],
  ])('%s界面：列表里任何一行不超过 79 列', async (_label, argv, purpose, exit, question) => {
    const result = await run({ argv, catalog: mixed(), onPath: BOTH_HOSTS, answers: [choose(purpose), accept(), pick(), pick(), choose(exit)] });
    // 到下一个提问为止：段标题和条目
    const list = (result.output.split(question)[1] ?? '').split('\n? ')[0] ?? '';
    const rows = list.split('\n').filter((line) => /^ [□■–] |^\s+──/.test(line));

    expect(rows).toHaveLength(4);
    // 截断的说明写到第 79 列为止；最后一个字是汉字而只剩一列时少写一列
    expect(Math.max(...rows.map(displayWidth))).toBeGreaterThanOrEqual(78);
    expect(Math.max(...rows.map(displayWidth))).toBeLessThanOrEqual(79);
  });
});

describe('进入之后问不问宿主', () => {
  it('检测到两个宿主、列表里有组件：先问装进哪些，名字后面不写目录', async () => {
    const result = await run({ catalog: mixed(), onPath: BOTH_HOSTS, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });

    expect(result.output).toMatch(/^\? 装进哪些 AI Agent\n\n ■ Claude Code\n ■ Codex$/m);
  });

  it('检测到两个宿主、列表里只有外部项目：不问', async () => {
    const result = await run({ catalog: mixed(), onPath: BOTH_HOSTS, answers: [choose(DEV_WORKFLOW), pick('atlas'), choose('退出')] });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toContain('外部项目：1 个，只给链接');
  });

  it('只检测到一个：不问，直接用它', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
  });
});

describe('一个宿主都没检测到', () => {
  it('「推荐」和用途照常进得去；skill 的行不可选并写明原因，外部项目照常可选', async () => {
    const result = await run({ catalog: mixed(), onPath: [], answers: [choose(WEB_SEARCH), pick('borealis'), choose('推荐'), pick(), choose('退出')] });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明\n\s+── Skill\n – alpha\s+需要 AI Agent\s+推荐 · 第一个样例 skill/m);
    expect(result.output).toMatch(/^ – beta-pack\s+需要 AI Agent\s+第二个样例 skill$/m);
    expect(result.output).toContain('外部项目：1 个，只给链接');
    expect(result.exitCode).toBe(0);
  });

  it('「推荐」里只有 skill 时每一行都不可选，主目录里什么都不多', async () => {
    const result = await run({ catalog: mixed(), onPath: [], answers: [choose('推荐'), pick(), choose('退出')] });

    expect(listed(result.output)).toEqual(['alpha', 'beta-pack']);
    expect(result.output).not.toMatch(/^ [□■] /m);
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(existsSync(join(result.home, '.agents'))).toBe(false);
  });
});

describe('一次勾选 skill 和外部项目', () => {
  afterEach(() => vi.unstubAllGlobals());
  const together = [choose(WEB_SEARCH), pick('alpha', 'borealis'), choose('开始安装'), choose('退出')];

  it('汇总、确认、安装、结果照常，最后才是外部项目的说明与链接', async () => {
    const result = await run({ catalog: mixed(), answers: together });
    const order = ['将安装 1 项', '? 开始安装吗', '已安装 1.0.0', '1 成功 · 0 失败 · 0 跳过', '外部项目：1 个，只给链接', 'https://example.org/borealis'].map(
      (text) => result.screen.indexOf(text),
    );

    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(existsSync(join(result.home, '.claude/skills/alpha/SKILL.md'))).toBe(true);
    expect(result.opened).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('汇总只列组件：外部项目不在里面', async () => {
    const result = await run({ catalog: mixed(), answers: together });
    const summary = result.output.slice(result.output.indexOf('将安装 1 项'), result.output.indexOf('? 开始安装吗'));

    expect(summary).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    expect(summary).not.toContain('borealis');
  });

  it('覆盖前的单独询问照常，没同意的跳过；外部项目照样列出', async () => {
    const result = await run({
      catalog: mixed(),
      home: { '.claude/skills/alpha/SKILL.md': '别处装的\n' },
      answers: [choose(WEB_SEARCH), pick('alpha', 'borealis'), choose('开始安装'), no(), choose('退出')],
    });

    expect(result.output).toMatch(/^\? ~\S+alpha 不是本工具装的，要覆盖它吗？ \(y\/N\)$/m);
    expect(result.output).toMatch(/alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样/);
    expect(result.output.indexOf('外部项目：1 个，只给链接')).toBeGreaterThan(result.output.indexOf('合计'));
  });

  it('返回修改：skill 和外部项目的勾选都还在', async () => {
    const result = await run({
      catalog: mixed(),
      answers: [choose(WEB_SEARCH), pick('alpha', 'borealis'), choose('返回修改'), accept(), choose('取消'), choose('退出')],
    });
    const again = result.output.split(QUESTION)[2] ?? '';

    expect(again).toMatch(/^ ■ alpha\s/m);
    expect(again).toMatch(/^ ■ borealis\s/m);
  });

  it('取消：什么都不装，外部项目也不列', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick('alpha', 'borealis'), choose('取消'), choose('退出')] });

    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(result.output).not.toContain('外部项目：');
    expect(result.output).not.toContain('正在安装');
  });

  it('只勾了外部项目：没有汇总，不问开始不开始', async () => {
    const result = await run({ catalog: mixed(), answers: [choose(WEB_SEARCH), pick('borealis'), choose('退出')] });

    expect(result.output).not.toContain('将安装');
    expect(result.output).not.toContain('开始安装吗');
    expect(result.output).toContain('外部项目：1 个，只给链接');
  });

  it('向 GitHub 查询失败：skill 一个都不装，出错说明之后照常列出外部项目', async () => {
    fakeGitHub({
      intercept: (url) =>
        url.includes('api.github.com')
          ? Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
          : url.endsWith('/main/catalog.json')
            ? Response.json(MIXED)
            : undefined,
    });

    const result = await run({ catalog: githubCatalogSource(), answers: together });

    expect(result.stderr).toContain('出错：GitHub 限流');
    expect(existsSync(join(result.home, '.claude'))).toBe(false);
    expect(result.output.indexOf('外部项目：1 个，只给链接')).toBeGreaterThan(result.output.indexOf('出错：GitHub 限流'));
    expect(result.exitCode).toBe(0);
  });
});
