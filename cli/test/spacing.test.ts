// 块与块之间的空行：提问与选项、分区标题与内容、已回答的提问与下一块、说明与按键提示之间各隔一行，
// 任何地方都没有连着两行空行。提问是交互库画的，所以这里的画面都由无头终端还原。
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, KEY, KEYED_MCP, LONG_ABOUT, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, SAMPLE_TOOLS, accept, catalogDir, choose, pick, run, secret, underWebSearch } from './harness.ts';
import { screenLines } from './terminal.ts';

// 按键提示是每个提问最后画出来的一行，等到它就说明这个提问已经在等按键了
const HINT = '⏎ 选择';
const PICK_HINT = '⏎ 确认';
const BOTH_HOSTS = ['claude', 'codex'];
// 两个用途下各有一个外部项目：主菜单上「推荐」在最前，后面是这两个用途
const fullCatalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } });
// 这些 MCP 都放进第一个用途：进去之后是一张只有 MCP 一段的列表
const withMcps = (...mcps: unknown[]): Record<string, unknown> => ({ ...EMPTY_CATALOG, mcps: underWebSearch(...mcps) });
// 没有外部项目：主菜单上是「推荐」、放着两个 MCP 的第一个用途、放着两个工具的第二个用途
const componentCatalog = (): string =>
  catalogDir({ catalog: { ...withMcps(...SAMPLE_MCPS), tools: SAMPLE_TOOLS.map((tool) => ({ ...tool, purpose: 'dev-workflow' })) } });
// 两个工具在第一个用途下，别的什么都没有
const toolCatalog = (tools: unknown[] = SAMPLE_TOOLS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: underWebSearch(...tools) } });

// 主菜单上「推荐」下面是第一个用途：fullCatalog 里它下面是 borealis，放了 MCP 的目录里是那几个 MCP
const toPurpose: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter]];
const toMcps = toPurpose;
// componentCatalog 里工具都在第二个用途下：进去之后是一张只有工具一段的列表，按名字排是 fetcher、linter
const toTools: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.down], ['▸ 开发工作流与规范', KEY.enter]];
// alpha 另外归在第一个用途下：那张列表里 skill 和外部项目都有
const mixedCatalog = (): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS, skillPurposes: { alpha: 'web-search' } } });
// 再加上 MCP：第一个用途下三种类型各有一条（alpha、docs-local、borealis）
const allKindsCatalog = (): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, apps: SAMPLE_APPS, skillPurposes: { alpha: 'web-search' } } });

// 第一个用途下两条第三方 Skill：进去之后光标停在 paper-kit 上（含三个 skill），勾上它确认就是它的清单
const thirdPartyCatalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY } });
// 清单的按键提示末尾
const SKIP_HINT = '不选则不装这一条';
const toChecklist: [string, string][] = [...toPurpose, [PICK_HINT, KEY.space], ['▸■ paper-kit', KEY.enter]];

// 最后留在画面上的每一行
const screenOf = async (options: Parameters<typeof run>[0]): Promise<string[]> => screenLines((await run(options)).raw);
// 画面上等于 line 的那一行之后的 count 行
const after = (lines: string[], line: string | RegExp, count: number): string[] => {
  const at = lines.findIndex((candidate) => (typeof line === 'string' ? candidate === line : line.test(candidate)));
  expect(at, `画面上没有「${line}」：\n${lines.join('\n')}`).toBeGreaterThan(-1);
  return lines.slice(at + 1, at + 1 + count);
};

describe('提问与它下面的表或选项之间空一行', () => {
  it('主菜单：「选择用途」与表头之间', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择用途', 2)).toEqual(['', expect.stringMatching(/^\s+用途\s+数量$/)]);
  });

  it('语言提问：与第一个选项之间', async () => {
    const lines = await screenOf({ answersLanguage: true, keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? Language / 语言', 3)).toEqual(['', '▸ 中文', '  English']);
  });

  it('选择宿主：与第一个宿主之间', async () => {
    const lines = await screenOf({ onPath: BOTH_HOSTS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '? 装进哪些 AI Agent', 2)).toEqual(['', '▸■ Claude Code']);
  });

  it.each([
    ['「推荐」', [[HINT, KEY.enter]], '? 选择要安装的条目', /^\s+名称\s+Claude Code\s+说明$/],
    ['只有 MCP 的用途', toMcps, '? 选择要安装的条目', /^\s+名称\s+Claude Code\s+说明$/],
    ['只有工具的用途', toTools, '? 选择要安装的条目', /^\s+名称\s+状态\s+说明$/],
  ] as [string, [string, string][], string, RegExp][])('%s 的多选列表：与表头之间', async (_label, toList, question, header) => {
    const lines = await screenOf({ catalog: componentCatalog(), keys: [...toList, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, question, 2)).toEqual(['', expect.stringMatching(header)]);
  });

  it('用途下的列表：与表头之间；表头、段标题、条目之间不空', async () => {
    const lines = await screenOf({ catalog: fullCatalog(), keys: [...toPurpose, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择要安装的条目', 4)).toEqual([
      '',
      expect.stringMatching(/^\s+名称\s+说明$/),
      expect.stringMatching(/^\s+── 外部项目 · 只给链接，不安装$/),
      expect.stringMatching(/^▸□ borealis\s/),
    ]);
  });

  it('三种类型都有：组件的两段之间不空，组件与外部项目之间空一行', async () => {
    const lines = await screenOf({ catalog: allKindsCatalog(), keys: [...toPurpose, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择要安装的条目', 9)).toEqual([
      '',
      expect.stringMatching(/^\s+名称\s+Claude Code\s+说明$/),
      expect.stringMatching(/^\s+── Skill$/),
      expect.stringMatching(/^▸□ alpha\s+未装\s+推荐 · /),
      expect.stringMatching(/^\s+── MCP$/),
      expect.stringMatching(/^ □ docs-local\s+未配置\s/),
      '',
      expect.stringMatching(/^\s+── 外部项目 · 只给链接，不安装$/),
      expect.stringMatching(/^ □ borealis\s/),
    ]);
  });

  it('混合列表：段标题与条目之间不空，组件与外部项目两段之间空一行', async () => {
    const lines = await screenOf({ catalog: mixedCatalog(), keys: [...toPurpose, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择要安装的条目', 7)).toEqual([
      '',
      expect.stringMatching(/^\s+名称\s+Claude Code\s+说明$/),
      expect.stringMatching(/^\s+── Skill$/),
      expect.stringMatching(/^▸□ alpha\s+未装\s+推荐 · /),
      '',
      expect.stringMatching(/^\s+── 外部项目 · 只给链接，不安装$/),
      expect.stringMatching(/^ □ borealis\s/),
    ]);
  });

  it('第三方 Skill 的清单：与表头之间；它与上面已回答的那一行隔一行', async () => {
    const lines = await screenOf({ catalog: thirdPartyCatalog(), keys: [...toChecklist, [SKIP_HINT, KEY.ctrlC]] });
    const question = '? paper-kit 里有 3 个 skill，选择要装的';

    expect(after(lines, /✓ 选择要安装的条目 · paper-kit$/, 2)).toEqual(['', question]);
    expect(after(lines, question, 2)).toEqual(['', expect.stringMatching(/^\s+名称\s+Claude Code\s+说明$/)]);
  });

  it('清单下方：最后一个 skill、说明全文、按键提示之间各隔一行', async () => {
    const lines = await screenOf({ catalog: thirdPartyCatalog(), keys: [...toChecklist, [SKIP_HINT, KEY.ctrlC]] });

    expect(after(lines, /^ □ paper-deck\s/, 4)).toEqual([
      '',
      expect.stringMatching(/^\s+说明\s+把一篇论文读成深度解读文章$/),
      '',
      expect.stringMatching(/⏎ 确认（不选则不装这一条）$/),
    ]);
  });

  it('清单回答之后收成一行，紧挨着上面已回答的那一行', async () => {
    const lines = await screenOf({ catalog: thirdPartyCatalog(), keys: [...toChecklist, [SKIP_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(after(lines, /✓ 选择要安装的条目 · paper-kit$/, 2)).toEqual([expect.stringMatching(/✓ paper-kit 里有 3 个 skill，选择要装的 · 不装$/), '']);
  });

  it('汇总之后的确认：「开始安装吗」与三个选项之间', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['▸■ alpha', KEY.enter], [HINT, KEY.ctrlC]] });

    expect(after(lines, '? 开始安装吗', 4)).toEqual(['', '▸ 开始安装', '  返回修改', '  取消']);
  });

  it('目录是空的：「选择用途」与「退出」之间只隔一行', async () => {
    const lines = await screenOf({ catalog: catalogDir({ index: { version: 1, skills: [] } }), keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择用途', 2)).toEqual(['', '▸ 退出']);
  });
});

describe('列表下方：说明全文与按键提示之间空一行', () => {
  const PICK_KEYS = /^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/;
  const SELECT_KEYS = /^\s+↑↓ 移动 · ⏎ 选择$/;

  it('多选列表，光标在有说明的条目上：列表、说明、按键提示之间各隔一行', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.down], ['▸□ beta-pack', KEY.ctrlC]] });

    expect(after(lines, /^▸□ beta-pack\s/, 5)).toEqual([
      '',
      expect.stringMatching(/^\s+类型\s+Skill$/),
      expect.stringMatching(/^\s+说明\s+第二个样例 skill$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('说明折成两行时，空行在最后一行说明之后', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, /^ □ beta-pack\s/, 6)).toEqual([
      '',
      expect.stringMatching(/^\s+类型\s+Skill$/),
      expect.stringMatching(/^\s+说明\s+第一个样例 skill/),
      expect.stringMatching(/^\s+\S/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('带推荐的行：「类型」一行里类型后面跟着「推荐」，两个标签的值左缘对齐', async () => {
    const lines = await screenOf({ catalog: mixedCatalog(), keys: [...toPurpose, [PICK_HINT, KEY.ctrlC]] });
    const [, type = '', about = ''] = after(lines, /^ □ borealis\s/, 3);

    expect(type).toMatch(/^\s+类型\s+Skill · 推荐$/);
    expect(about.indexOf('第一个样例 skill')).toBe(type.indexOf('Skill'));
  });

  it('用途下的列表：「类型」和说明两行挨着，上下各隔一行', async () => {
    const lines = await screenOf({ catalog: fullCatalog(), keys: [...toPurpose, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, /^▸□ borealis\s/, 5)).toEqual([
      '',
      expect.stringMatching(/^\s+类型\s+外部项目$/),
      expect.stringMatching(/^\s+说明\s+第二个样例外部项目$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('没有说明时，列表与按键提示之间仍只有一行空行', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '  退出', 2)).toEqual(['', expect.stringMatching(SELECT_KEYS)]);
  });

  it('光标在不可选的行上：列表下方照样是类型和说明全文', async () => {
    const lines = await screenOf({ onPath: [], keys: [[HINT, KEY.enter], [PICK_HINT, KEY.down], ['▸– beta-pack', KEY.ctrlC]] });

    expect(after(lines, /^▸– beta-pack\s+需要 AI Agent\s/, 5)).toEqual([
      '',
      expect.stringMatching(/^\s+类型\s+Skill$/),
      expect.stringMatching(/^\s+说明\s+第二个样例 skill$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('光标从不可选的行移到可选的行上：下方只有那一行自己的类型和说明', async () => {
    const lines = await screenOf({ catalog: mixedCatalog(), onPath: [], keys: [...toPurpose, [PICK_HINT, KEY.down], ['▸□ borealis', KEY.ctrlC]] });

    expect(after(lines, /^▸□ borealis\s/, 5)).toEqual([
      '',
      expect.stringMatching(/^\s+类型\s+外部项目$/),
      expect.stringMatching(/^\s+说明\s+第二个样例外部项目$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('在不可选的行上按空格：「这一项现在选不了」紧接在列表下方，类型和说明跟在它后面', async () => {
    const lines = await screenOf({ onPath: [], keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]] });

    expect(after(lines, /^ – beta-pack\s+需要 AI Agent\s/, 7)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+这一项现在选不了$/),
      expect.stringMatching(/^\s+类型\s+Skill$/),
      expect.stringMatching(/^\s+说明\s+第一个样例 skill/),
      expect.stringMatching(/^\s+\S/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('再按别的键，「这一项现在选不了」那一行就消失', async () => {
    const lines = await screenOf({
      onPath: [],
      keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.down], ['▸– beta-pack', KEY.ctrlC]],
    });

    expect(lines.join('\n')).not.toContain('这一项现在选不了');
    expect(after(lines, /^▸– beta-pack\s/, 2)).toEqual(['', expect.stringMatching(/^\s+类型\s+Skill$/)]);
  });

  it('所选宿主都不支持的 MCP：在它上面按空格，「这一项现在选不了」后面跟着它的类型和说明', async () => {
    // 第一条只支持 Claude Code：只检测到 Codex 时它不可选
    const lines = await screenOf({
      catalog: catalogDir({ catalog: withMcps({ ...SAMPLE_MCPS[0], name: 'claude-only', hosts: ['claude-code'] }, SAMPLE_MCPS[1]) }),
      onPath: ['codex'],
      keys: [...toMcps, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]],
    });

    expect(after(lines, /^ □ tracker-remote\s/, 7)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+这一项现在选不了$/),
      expect.stringMatching(/^\s+类型\s+MCP$/),
      expect.stringMatching(/^\s+说明\s+本地进程方式的样例 MCP/),
      expect.stringMatching(/^\s+\S/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('不可选的工具：在它上面按空格，「这一项现在选不了」、类型、说明三行挨着，与按键提示之间空一行', async () => {
    // picky 把这个系统标为不支持：一段里按名字排，它在最后
    const picky = { ...SAMPLE_TOOLS[1], name: 'picky', install: { default: 'npm install -g @example/picky', linux: null } };
    const lines = await screenOf({
      catalog: toolCatalog([picky, ...SAMPLE_TOOLS]),
      keys: [...toPurpose, [PICK_HINT, KEY.down], ['▸□ linter', KEY.down], ['▸– picky', KEY.space], ['这一项现在选不了', KEY.ctrlC]],
    });

    expect(after(lines, /^▸– picky\s+不支持 Linux\s/, 6)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+这一项现在选不了$/),
      expect.stringMatching(/^\s+类型\s+工具$/),
      expect.stringMatching(/^\s+说明\s+第二个样例工具$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });
});

describe('已回答的提问与下一块之间空一行，连着的几行已回答的提问之间不空', () => {
  // alpha 是用户自己放的：覆盖它之前要另问
  const unmanaged = { '.claude/skills/alpha/SKILL.md': '用户自己写的 skill' };
  const toConfirmOverwrite: [string, string][] = [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['▸■ alpha', KEY.enter], [HINT, KEY.enter]];

  it('语言提问收成的一行与本机信息之间', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ Language / 语言 · 中文', 2)).toEqual(['', expect.stringMatching(/^\s+AI Agent\s+Claude Code ✓/)]);
  });

  it('读取目录的提示就打在本机信息将要出现的那一行上：问过语言时与它隔一行，没问时紧接标题区的收尾', async () => {
    const loadingAfter = async (argv: string[]): Promise<string[]> => {
      const lines = (await run({ argv, answers: [choose('退出')] })).output.split('\n');
      return lines.slice(0, lines.findIndex((line) => line.includes('正在读取目录'))).slice(-2);
    };

    expect(await loadingAfter([])).toEqual(['  English', '']);
    expect(await loadingAfter(['--lang', 'zh'])).toEqual([expect.stringMatching(/^\s+oxy-tools \S+$/), '']);
  });

  it('下一个提问还在问的时候与上面已回答的一行隔一行', async () => {
    const lines = await screenOf({ onPath: BOTH_HOSTS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ 选择用途 · 推荐', 2)).toEqual(['', '? 装进哪些 AI Agent']);
  });

  it('它回答之后，两行已回答的提问紧挨着，再隔一行才是下一个提问', async () => {
    const lines = await screenOf({ onPath: BOTH_HOSTS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ 选择用途 · 推荐', 4)).toEqual(['✓ 装进哪些 AI Agent · Claude Code、Codex', '✓ 装到哪里 · 全局', '', '? 选择要安装的条目']);
  });

  it('是否题：问的时候与已回答的一行隔一行', async () => {
    const lines = await screenOf({ home: unmanaged, keys: [...toConfirmOverwrite, ['(y/N)', KEY.ctrlC]] });

    expect(after(lines, '✓ 开始安装吗 · 开始安装', 2)).toEqual(['', expect.stringMatching(/^\? ~\S+alpha 不是本工具装的，要覆盖它吗？ \(y\/N\)$/)]);
  });

  it('是否题输入了别的：「请输入 y 或 n」紧接在提问下面，它下面没有别的东西', async () => {
    const lines = await screenOf({ home: unmanaged, keys: [...toConfirmOverwrite, ['(y/N)', 'x'], ['(y/N) x', KEY.enter], ['请输入 y 或 n', KEY.ctrlC]] });

    const below = after(lines, /^\? ~\S+alpha 不是本工具装的，要覆盖它吗？ \(y\/N\) x$/, lines.length);
    expect(below[0]).toMatch(/^\s+注意\s+请输入 y 或 n$/);
    expect(below.slice(1).join('')).toBe('');
  });

  it('是否题：回答之后紧挨着上一行，与下面的分区隔一行', async () => {
    const lines = await screenOf({ home: unmanaged, keys: [...toConfirmOverwrite, ['(y/N)', KEY.enter], [HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ 开始安装吗 · 开始安装', 3)).toEqual([
      expect.stringMatching(/^✓ ~\S+alpha 不是本工具装的，要覆盖它吗？ · 否$/),
      '',
      expect.stringMatching(/^── 结果 ─+$/),
    ]);
  });

  it('回到主菜单时，新一轮的提问与上一轮之间只隔一行', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ 选择用途 · 推荐', 4)).toEqual(['✓ 装到哪里 · 全局', '✓ 选择要安装的条目 · 返回', '', '? 选择用途']);
  });

  it('外部项目的说明与链接：与上面已回答的一行、与回到主菜单的提问之间各隔一行', async () => {
    const lines = await screenOf({
      catalog: fullCatalog(),
      keys: [...toPurpose, [PICK_HINT, KEY.space], ['▸■ borealis', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(after(lines, '✓ 选择用途 · 联网搜索与文档检索', 3)).toEqual([
      '✓ 选择要安装的条目 · borealis',
      '',
      expect.stringMatching(/^── 外部项目：1 个，只给链接 ─+$/),
    ]);
    expect(after(lines, /^\s+链接\s+https:\/\/example\.org\/borealis$/, 2)).toEqual(['', '? 选择用途']);
  });

  it('读不到宿主的配置：那一行「注意」上下各空一行', async () => {
    const lines = await screenOf({
      catalog: componentCatalog(),
      home: { '.claude.json': '{ 写坏了' },
      keys: [...toMcps, [PICK_HINT, KEY.ctrlC]],
    });

    expect(after(lines, '✓ 选择用途 · 联网搜索与文档检索', 5)).toEqual([
      '✓ 装到哪里 · 全局',
      '',
      expect.stringMatching(/^\s+注意\s+读不到 Claude Code 的配置/),
      '',
      '? 选择要安装的条目',
    ]);
  });

  it('装到项目：Codex 的 MCP 只能装到全局和读不到配置的两行「注意」挨着，上下各空一行', async () => {
    const lines = await screenOf({
      catalog: componentCatalog(),
      onPath: BOTH_HOSTS,
      project: { '.mcp.json': '{ 写坏了' },
      answersScope: true,
      keys: [...toMcps, [PICK_HINT, KEY.enter], [HINT, KEY.down], ['▸ 项目', KEY.enter], [PICK_HINT, KEY.ctrlC]],
    });

    expect(after(lines, '✓ 装到哪里 · 项目', 5)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+Codex 的 MCP 只能装到全局/),
      expect.stringMatching(/^\s+注意\s+读不到 Claude Code 的配置/),
      '',
      '? 选择要安装的条目',
    ]);
  });

  it('沿用的 key 留下的一行和已回答的提问同一个画法：紧挨着上一行', async () => {
    const pickKeyed: [string, string][] = [...toMcps, [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter]];
    const lines = await screenOf({
      catalog: catalogDir({ catalog: withMcps(KEYED_MCP) }),
      keys: [...pickKeyed, ['粘贴后回车', 'k'], ['粘贴后回车', KEY.enter], [HINT, KEY.enter], ...pickKeyed, [HINT, KEY.ctrlC]],
    });

    const second = lines.lastIndexOf('✓ 选择要安装的条目 · search-keyed');
    expect(lines.slice(second + 1, second + 4)).toEqual([
      '✓ SEARCH_API_KEY · 本次运行已填写，不再询问',
      '',
      expect.stringMatching(/^── 将安装 1 项 ─+$/),
    ]);
  });

  it('填写 key：提问擦掉后，留下的一行与上面的说明隔一行', async () => {
    const lines = await screenOf({
      catalog: catalogDir({ catalog: withMcps(KEYED_MCP) }),
      keys: [...toMcps, [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter], ['粘贴后回车', 'k'], ['粘贴后回车', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(after(lines, /^\s+提示\s/, 3)).toEqual(['', '✓ SEARCH_API_KEY · 已填写', '']);
  });
});

describe('分区标题下方空一行', () => {
  // 这些分区都是呈现层自己打的，不经过交互库：预设应答的提问器留下的画面就够了
  const printed = async (options: Parameters<typeof run>[0]): Promise<string[]> => (await run(options)).screen.split('\n');
  const RULE = /^─{80}$/;

  it('skill 的汇总：标题与表头之间', async () => {
    const lines = await printed({ answers: [choose('推荐'), pick('alpha'), choose('取消'), choose('退出')] });

    expect(after(lines, /^── 将安装 1 项 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+Skill\s+AI Agent\s+操作\s+位置$/)]);
  });

  it('MCP 的汇总、将执行的命令、key 的说明', async () => {
    const lines = await printed({
      catalog: catalogDir({ catalog: withMcps(KEYED_MCP) }),
      answers: [choose('联网搜索与文档检索'), pick('search-keyed'), secret('k'), choose('取消'), choose('退出')],
    });

    expect(after(lines, /^── search-keyed 需要 key ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+变量\s+SEARCH_API_KEY/)]);
    expect(after(lines, /^── 将安装 1 项 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+MCP\s+AI Agent\s+操作$/)]);
    expect(after(lines, /^── 将执行 1 条命令 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+1\s+claude mcp add/)]);
  });

  it('外部项目的说明与链接：标题下方空一行，两段之间空一行', async () => {
    const lines = await printed({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, apps: [...SAMPLE_APPS, { ...SAMPLE_APPS[1], name: 'cirrus' }] } }),
      answers: [choose('联网搜索与文档检索'), pick('borealis', 'cirrus'), choose('退出')],
    });

    expect(after(lines, /^── 外部项目：2 个，只给链接 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+borealis$/)]);
    expect(after(lines, /^\s+borealis$/, 4)).toEqual([
      expect.stringMatching(/^\s+说明\s+第二个样例外部项目$/),
      expect.stringMatching(/^\s+链接\s+https:/),
      '',
      expect.stringMatching(/^\s+cirrus$/),
    ]);
  });

  it('出错', async () => {
    const lines = await printed({ argv: ['--frobnicate'] });

    expect(after(lines, /^── 出错：/, 2)).toEqual(['', expect.stringMatching(/^\s+原因\s/)]);
  });

  it.each([
    ['中文', 'zh', ['用法', '选项', '环境变量']],
    ['英文', 'en', ['Usage', 'Options', 'Environment']],
  ])('%s的帮助：三个分区', async (_label, lang, titles) => {
    const lines = await printed({ argv: ['--help', '--lang', lang] });

    for (const title of titles) expect(after(lines, new RegExp(`^── ${title} ─+$`), 2)).toEqual(['', expect.stringMatching(/\S/)]);
  });

  it('只装工具时的汇总：标题下方空一行，工具的小表与将执行的命令之间空一行', async () => {
    const lines = await printed({ catalog: toolCatalog(), answers: [choose('联网搜索与文档检索'), pick('linter'), choose('取消'), choose('退出')] });

    expect(after(lines, /^── 将安装 1 项 ─+$/, 7)).toEqual([
      '',
      expect.stringMatching(/^\s+工具\s+操作$/),
      expect.stringMatching(/^\s+linter\s+执行安装命令$/),
      '',
      expect.stringMatching(/^── 将执行 1 条命令 ─+$/),
      '',
      expect.stringMatching(/^\s+1\s+npm install/),
    ]);
  });

  it('每个工具的执行：空行只在标题下方，接着是那一行命令；结论与收尾的通栏横线之间空一行', async () => {
    const lines = await printed({ catalog: toolCatalog(), answers: [choose('联网搜索与文档检索'), pick('linter'), accept(), choose('退出')] });

    expect(after(lines, /^── linter ─+$/, 7)).toEqual([
      '',
      expect.stringMatching(/^\s+\$ npm install -g @example\/linter@latest$/),
      '',
      expect.stringMatching(/^\s+✗\s+linter\s+失败 /),
      '',
      expect.stringMatching(RULE),
      expect.stringMatching(/^\s+合计\s/),
    ]);
  });

  it('装了不止一个工具时的「结果」分区：标题下方、最后一行结论与通栏横线之间', async () => {
    const lines = await printed({ catalog: toolCatalog(), answers: [choose('联网搜索与文档检索'), pick('fetcher', 'linter'), accept(), choose('退出')] });

    expect(after(lines, /^── 结果 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+✗\s+fetcher\s+失败 /)]);
    const results = lines.slice(lines.findIndex((line) => /^── 结果 ─+$/.test(line)));
    expect(after(results, /^\s+✗\s+linter\s+失败 /, 3)).toEqual(['', expect.stringMatching(RULE), expect.stringMatching(/^\s+合计\s/)]);
  });
});

describe('「正在安装」分区：结束后标题改写成「结果」', () => {
  const install: [string, string][] = [[HINT, KEY.enter], [PICK_HINT, 'a'], [' ■ beta-pack', KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]];

  it('「结果」落在原来那一行上，标题下方的空行还在；最后一行结果与通栏横线之间空一行', async () => {
    const lines = await screenOf({ keys: install });

    expect(lines.join('\n')).not.toContain('正在安装');
    expect(after(lines, '✓ 开始安装吗 · 开始安装', 9)).toEqual([
      '',
      expect.stringMatching(/^── 结果 ─+$/),
      '',
      expect.stringMatching(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/),
      expect.stringMatching(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.3$/),
      '',
      expect.stringMatching(/^─{80}$/),
      expect.stringMatching(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/),
      '',
    ]);
  });
});

describe('24 行的终端：列表一屏放多少行把空行算在内', () => {
  const ROWS = 24;
  // 每一条的说明都长到在列表下方折成两行
  const manySkills = (count: number): string =>
    catalogDir({
      index: {
        version: 1,
        skills: Array.from({ length: count }, (_, index) => {
          const name = `skill-${String(index + 1).padStart(2, '0')}`;
          return { name, version: '1.0.0', path: `skills/${name}`, description: LONG_ABOUT };
        }),
      },
    });
  // 还在屏幕上的那几行，和连同滚上去的全部
  const terminal = async (count: number, keys: [string, string][]): Promise<{ visible: string[]; all: string[] }> => {
    const result = await run({ catalog: manySkills(count), rows: ROWS, keys: [[HINT, KEY.enter], ...keys] });
    const all = await screenLines(result.raw, ROWS);
    return { visible: all.slice(-ROWS), all };
  };
  const QUESTION = '? 选择要安装的条目';

  it('条目多到要滚动时，提问那一行仍在屏幕上；说明全文和按键提示都在', async () => {
    const { visible } = await terminal(30, [[PICK_HINT, KEY.ctrlC]]);

    expect(visible).toContain(QUESTION);
    expect(visible.filter((line) => /^\s+说明\s/.test(line))).toHaveLength(1);
    expect(visible.at(-2)).toMatch(/^\s+↑↓ 移动 · 空格 选择/);
  });

  it('上下移动光标重画之后，提问那一行没有被顶上去留下残影', async () => {
    const { visible, all } = await terminal(30, [[PICK_HINT, KEY.down], ['▸□ skill-02', KEY.down], ['▸□ skill-03', KEY.up], ['▸□ skill-02', KEY.ctrlC]]);

    expect(all.filter((line) => line === QUESTION)).toHaveLength(1);
    expect(visible).toContain(QUESTION);
  });

  it('列表滚动之后，提问与列表之间的那一行空行还在：它不随条目滚上去', async () => {
    const downTo = (count: number): [string, string][] =>
      Array.from({ length: count }, (_, step) => [step === 0 ? PICK_HINT : `▸□ skill-${String(step + 1).padStart(2, '0')}`, KEY.down]);
    const { visible } = await terminal(30, [...downTo(12), ['▸□ skill-13', KEY.ctrlC]]);

    expect(visible.some((line) => /^.□ skill-01\s/.test(line))).toBe(false);
    expect(after(visible, QUESTION, 2)).toEqual(['', expect.stringMatching(/^.□ skill-\d\d\s/)]);
  });

  it('用途下的列表多一行「类型」：条目多到要滚动时，提问、类型、两行说明和按键提示仍都在屏幕上', async () => {
    const apps = Array.from({ length: 30 }, (_, index) => ({ ...SAMPLE_APPS[0], name: `app-${String(index + 1).padStart(2, '0')}` }));
    // 目录里没有 skill：主菜单上没有「推荐」，光标起始就在这个用途上
    const catalog = catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, apps } });
    const result = await run({ catalog, rows: ROWS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });
    const visible = (await screenLines(result.raw, ROWS)).slice(-ROWS);

    expect(visible).toContain('? 选择要安装的条目');
    expect(visible.filter((line) => /^\s+类型\s+外部项目$/.test(line))).toHaveLength(1);
    expect(after(visible, /^\s+说明\s/, 3)).toEqual([expect.stringMatching(/^\s+\S/), '', expect.stringMatching(/^\s+↑↓ 移动 · 空格 选择/)]);
    // 表头、段标题和 13 个条目
    expect(visible.filter((line) => /^.□ app-\d\d\s/.test(line))).toHaveLength(13);
  });

  it('24 行的终端里主菜单不滚动：「推荐」、十个用途、「退出」和表头都在', async () => {
    const purposes = Array.from({ length: 10 }, (_, index) => ({ id: `purpose-${index}`, name: { zh: `第 ${index} 个用途`, en: `Purpose ${index}` } }));
    const apps = purposes.map(({ id }, index) => ({ ...SAMPLE_APPS[1], name: `app-${index}`, purpose: id }));
    const catalog = catalogDir({ catalog: { ...EMPTY_CATALOG, purposes, apps } });
    const result = await run({ catalog, rows: ROWS, keys: [[HINT, KEY.ctrlC]] });
    const visible = (await screenLines(result.raw, ROWS)).slice(-ROWS);

    expect(visible).toContain('? 选择用途');
    expect(visible.filter((line) => /^▸ 推荐\s+2$/.test(line))).toHaveLength(1);
    expect(visible.filter((line) => /第 \d 个用途\s+1$/.test(line))).toHaveLength(10);
    expect(after(visible, /^\s+第 9 个用途\s/, 2)).toEqual(['', expect.stringMatching(/^\s+退出$/)]);
    expect(visible.some((line) => /^\s+用途\s+数量$/.test(line))).toBe(true);
  });

  it('很矮的终端里列表最少也有 7 行：「推荐」、三个用途、「退出」和表头都在，主菜单不滚动', async () => {
    const purposes = [...EMPTY_CATALOG.purposes, { id: 'documents', name: { zh: '文档处理', en: 'Document processing' } }];
    const apps = [SAMPLE_APPS[1], { ...SAMPLE_APPS[0], purpose: 'documents' }];
    const catalog = catalogDir({ catalog: { ...EMPTY_CATALOG, purposes, mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps } });
    const result = await run({ catalog, rows: 12, keys: [[HINT, KEY.ctrlC]] });
    const lines = await screenLines(result.raw, 60);

    expect(after(lines, '? 选择用途', 8)).toEqual([
      '',
      expect.stringMatching(/^\s+用途\s+数量$/),
      expect.stringMatching(/^▸ 推荐\s/),
      expect.stringMatching(/^\s+联网搜索与文档检索\s/),
      expect.stringMatching(/^\s+开发工作流与规范\s/),
      expect.stringMatching(/^\s+文档处理\s/),
      '',
      expect.stringMatching(/^\s+退出$/),
    ]);
  });

  it('13 个条目放得下：表头、段标题和每一条都在屏幕上，列表不滚动', async () => {
    const { visible } = await terminal(13, [[PICK_HINT, KEY.ctrlC]]);

    expect(visible).toContain(QUESTION);
    expect(visible.filter((line) => /^\s+名称\s+Claude Code\s+说明$/.test(line))).toHaveLength(1);
    expect(visible.filter((line) => /^\s+── Skill$/.test(line))).toHaveLength(1);
    expect(visible.filter((line) => /^.□ skill-\d\d\s/.test(line))).toHaveLength(13);
  });
});

describe('任何地方都没有连着两行空行', () => {
  // 脚本的每一步都停下来看一眼：等到这一步要等的字就按 Ctrl+C，得到那一刻的画面。提问还在问和回答之后的样子都在里面
  const framesOf = async (options: Parameters<typeof run>[0], keys: [string, string][]): Promise<string[][]> =>
    Promise.all(keys.map(async ([waitFor], step) => screenOf({ ...options, keys: [...keys.slice(0, step), [waitFor, KEY.ctrlC]] })));
  const doubleBlank = (lines: string[]): string | undefined => {
    const shown = lines.join('\n').trimEnd().split('\n');
    const at = shown.findIndex((line, index) => line === '' && shown[index + 1] === '');
    return at === -1 ? undefined : shown.slice(Math.max(0, at - 2), at + 4).join('\n');
  };
  const unmanaged = { '.claude/skills/alpha/SKILL.md': '用户自己写的 skill' };
  // 一段里按名字排：docs-local、search-keyed、tracker-remote
  const keyed = (): string => catalogDir({ catalog: withMcps(KEYED_MCP, ...SAMPLE_MCPS) });
  const pickKeyed: [string, string][] = [...toMcps, [PICK_HINT, KEY.down], ['▸□ search-keyed', KEY.space], ['▸■ search-keyed', KEY.enter]];

  // 样例目录建在临时目录里，每条测试结束就删：所以到用的时候才建
  it.each<[string, () => Parameters<typeof run>[0], [string, string][]]>([
    [
      'skill：两个宿主、返回修改、另问覆盖、装完回到主菜单再退出',
      () => ({ onPath: BOTH_HOSTS, home: unmanaged }),
      [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.enter],
        [PICK_HINT, 'a'],
        [' ■ beta-pack', KEY.enter],
        [HINT, KEY.down],
        ['▸ 返回修改', KEY.enter],
        [PICK_HINT, KEY.enter],
        [HINT, KEY.enter],
        ['(y/N)', 'x'],
        ['(y/N) x', KEY.enter],
        ['请输入 y 或 n', '\x7f'],
        ['(y/N)', KEY.enter],
        [HINT, KEY.enter],
        [PICK_HINT, KEY.enter],
        // 列表里一个都不勾：回到宿主选择；那里再全部去掉，才回到主菜单
        [PICK_HINT, KEY.enter],
        [PICK_HINT, 'a'],
        [' □ Codex', KEY.enter],
        [HINT, KEY.down],
      ],
    ],
    [
      'MCP：读不到配置、填 key、汇总与命令、执行、再进一次沿用 key',
      () => ({ catalog: keyed(), home: { '.claude.json': '{ 写坏了' } }),
      [
        ...toMcps,
        [PICK_HINT, 'a'],
        [' ■ tracker-remote', KEY.enter],
        ['粘贴后回车', 'k'],
        ['粘贴后回车', KEY.enter],
        [HINT, KEY.enter],
        ...pickKeyed,
        [HINT, KEY.down],
      ],
    ],
    [
      'MCP：必填的 key 留空，直接到结果',
      () => ({ catalog: keyed() }),
      [...pickKeyed, ['粘贴后回车', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '工具：两条命令、各自的执行分区、结果',
      () => ({ catalog: componentCatalog() }),
      [...toTools, [PICK_HINT, 'a'], [' ■ linter', KEY.enter], [HINT, KEY.enter], [HINT, KEY.down]],
    ],
    [
      '外部项目：勾一个看说明与链接，再进另一个用途、什么都不勾就返回',
      () => ({ catalog: fullCatalog() }),
      [
        ...toPurpose,
        [PICK_HINT, KEY.space],
        ['▸■ borealis', KEY.enter],
        [HINT, KEY.down],
        ['▸ 联网搜索与文档检索', KEY.down],
        ['▸ 开发工作流与规范', KEY.enter],
        [PICK_HINT, KEY.enter],
        [HINT, KEY.down],
      ],
    ],
    [
      '第三方 Skill：清单、汇总与命令、另问覆盖、结果，再回主菜单',
      () => ({ catalog: thirdPartyCatalog(), home: { '.claude/skills/paper-reader/SKILL.md': '用户改过的' } }),
      [...toChecklist, [SKIP_HINT, 'a'], [' ■ paper-deck', KEY.enter], [HINT, KEY.enter], ['(y/N)', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '一个宿主都没检测到：在不可选的工具上按空格',
      () => ({ catalog: componentCatalog(), onPath: [] }),
      [...toTools, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.down]],
    ],
    [
      '混合列表：一次勾 skill 和外部项目，装完列出链接再回主菜单',
      () => ({ catalog: mixedCatalog() }),
      [...toPurpose, [PICK_HINT, 'a'], [' ■ borealis', KEY.enter], [HINT, KEY.enter], [HINT, KEY.down]],
    ],
    [
      '混合列表：一次勾 skill、MCP 和外部项目，汇总、命令、装完列出链接再回主菜单',
      () => ({ catalog: allKindsCatalog(), home: unmanaged }),
      [...toPurpose, [PICK_HINT, 'a'], [' ■ borealis', KEY.enter], [HINT, KEY.enter], ['(y/N)', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '一个宿主都没检测到：进「推荐」，在不可选的 skill 上按空格，再什么都不勾返回',
      () => ({ catalog: mixedCatalog(), onPath: [] }),
      [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '自己答语言提问，选 English',
      () => ({ answersLanguage: true }),
      [[HINT, KEY.down], ['▸ English', KEY.enter], ['⏎ select', KEY.enter], ['⏎ confirm', KEY.enter], ['⏎ select', KEY.down]],
    ],
    [
      '带 --lang 的英文界面：装一个 skill',
      () => ({ argv: ['--lang', 'en'], home: unmanaged }),
      [['⏎ select', KEY.enter], ['⏎ confirm', KEY.space], ['▸■ alpha', KEY.enter], ['⏎ select', KEY.enter], ['(y/N)', 'y'], ['(y/N) y', KEY.enter], ['⏎ select', KEY.down]],
    ],
  ])('%s', async (_label, options, keys) => {
    for (const frame of await framesOf(options(), keys)) expect(doubleBlank(frame)).toBeUndefined();
  });

  it.each([
    ['帮助', () => ({ argv: ['--help'] })],
    ['参数无法识别', () => ({ argv: ['--frobnicate'] })],
    ['没有交互式终端', () => ({ tty: false })],
    ['带 --lang 启动后立刻出错', () => ({ argv: ['--lang', 'zh'], catalog: catalogDir({ index: null }) })],
    ['选完语言后立刻出错', () => ({ catalog: catalogDir({ index: null }), keys: [] })],
  ] as [string, () => Parameters<typeof run>[0]][])('%s', async (_label, options) => {
    expect(doubleBlank(await screenOf(options()))).toBeUndefined();
  });
});
