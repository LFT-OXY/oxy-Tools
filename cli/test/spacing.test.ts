// 块与块之间的空行：提问与选项、分区标题与内容、已回答的提问与下一块、说明与按键提示之间各隔一行，
// 任何地方都没有连着两行空行。提问是交互库画的，所以这里的画面都由无头终端还原。
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, KEY, KEYED_MCP, LONG_ABOUT, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_TOOLS, accept, catalogDir, choose, pick, run, secret } from './harness.ts';
import { screenLines } from './terminal.ts';

// 按键提示是每个提问最后画出来的一行，等到它就说明这个提问已经在等按键了
const HINT = '⏎ 选择';
const PICK_HINT = '⏎ 确认';
const BOTH_HOSTS = ['claude', 'codex'];
const fullCatalog = (): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } });

// 主菜单上把光标从 Skill 移到别的分组再回车
const toMcps: [string, string][] = [[HINT, KEY.down], ['▸ MCP', KEY.enter]];
const toTools: [string, string][] = [[HINT, KEY.down], ['▸ MCP', KEY.down], ['▸ 工具', KEY.enter]];
const toApps: [string, string][] = [[HINT, KEY.down], ['▸ MCP', KEY.down], ['▸ 工具', KEY.down], ['▸ 应用项目', KEY.enter]];

// 最后留在画面上的每一行
const screenOf = async (options: Parameters<typeof run>[0]): Promise<string[]> => screenLines((await run(options)).raw);
// 画面上等于 line 的那一行之后的 count 行
const after = (lines: string[], line: string | RegExp, count: number): string[] => {
  const at = lines.findIndex((candidate) => (typeof line === 'string' ? candidate === line : line.test(candidate)));
  expect(at, `画面上没有「${line}」：\n${lines.join('\n')}`).toBeGreaterThan(-1);
  return lines.slice(at + 1, at + 1 + count);
};

describe('提问与它下面的表或选项之间空一行', () => {
  it('主菜单：「选择分组」与表头之间', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择分组', 2)).toEqual(['', expect.stringMatching(/^\s+分组\s+数量\s+说明$/)]);
  });

  it('语言提问：与第一个选项之间', async () => {
    const lines = await screenOf({ answersLanguage: true, keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? Language / 语言', 3)).toEqual(['', '▸ 中文', '  English']);
  });

  it('选择宿主：与第一个宿主之间', async () => {
    const lines = await screenOf({ onPath: BOTH_HOSTS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '? 装进哪些 AI Agent', 2)).toEqual(['', expect.stringMatching(/^▸■ Claude Code\s/)]);
  });

  it.each([
    ['skill', [[HINT, KEY.enter]], '? 选择要安装的 skill', /^\s+名称\s+Claude Code\s+说明$/],
    ['MCP', toMcps, '? 选择要安装的 MCP', /^\s+名称\s+Claude Code\s+说明$/],
    ['工具', toTools, '? 选择要安装的工具', /^\s+名称\s+状态\s+说明$/],
  ] as [string, [string, string][], string, RegExp][])('%s 的多选列表：与表头之间', async (_label, toList, question, header) => {
    const lines = await screenOf({ catalog: fullCatalog(), keys: [...toList, [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, question, 2)).toEqual(['', expect.stringMatching(header)]);
  });

  it('应用项目列表：与表头之间；「返回」与条目之间仍只隔一行', async () => {
    const lines = await screenOf({
      catalog: fullCatalog(),
      keys: [...toApps, [HINT, KEY.ctrlC]],
    });

    expect(after(lines, '? 选择应用项目', 2)).toEqual(['', expect.stringMatching(/^\s+名称\s+说明$/)]);
    expect(after(lines, /^\s+borealis\s/, 2)).toEqual(['', expect.stringMatching(/^\s+返回$/)]);
  });

  it('汇总之后的确认：「开始安装吗」与三个选项之间', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['▸■ alpha', KEY.enter], [HINT, KEY.ctrlC]] });

    expect(after(lines, '? 开始安装吗', 4)).toEqual(['', '▸ 开始安装', '  返回修改', '  取消']);
  });

  it('目录是空的：「选择分组」与「退出」之间只隔一行', async () => {
    const lines = await screenOf({ catalog: catalogDir({ index: { version: 1, skills: [] } }), keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '? 选择分组', 2)).toEqual(['', '▸ 退出']);
  });
});

describe('列表下方：说明全文与按键提示之间空一行', () => {
  const PICK_KEYS = /^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/;
  const SELECT_KEYS = /^\s+↑↓ 移动 · ⏎ 选择$/;

  it('多选列表，光标在有说明的条目上：列表、说明、按键提示之间各隔一行', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.down], ['▸□ beta-pack', KEY.ctrlC]] });

    expect(after(lines, /^▸□ beta-pack\s/, 4)).toEqual([
      '',
      expect.stringMatching(/^\s+说明\s+第二个样例 skill$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('说明折成两行时，空行在最后一行说明之后', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, /^ □ beta-pack\s/, 5)).toEqual([
      '',
      expect.stringMatching(/^\s+说明\s+第一个样例 skill/),
      expect.stringMatching(/^\s+\S/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('单选列表（应用项目）同一个画法', async () => {
    const lines = await screenOf({ catalog: fullCatalog(), keys: [...toApps, [HINT, KEY.down], ['▸ borealis', KEY.ctrlC]] });

    expect(after(lines, '  返回', 4)).toEqual([
      '',
      expect.stringMatching(/^\s+说明\s+第二个样例应用项目$/),
      '',
      expect.stringMatching(SELECT_KEYS),
    ]);
  });

  it('没有说明时，列表与按键提示之间仍只有一行空行', async () => {
    const lines = await screenOf({ keys: [[HINT, KEY.ctrlC]] });

    expect(after(lines, '  退出', 2)).toEqual(['', expect.stringMatching(SELECT_KEYS)]);
  });

  it('多选：在不可选的条目上按空格，「这一项现在选不了」与按键提示之间空一行', async () => {
    // 第一条只支持 Claude Code：只检测到 Codex 时它不可选
    const mcps = [{ ...SAMPLE_MCPS[0], name: 'claude-only', hosts: ['claude-code'] }, SAMPLE_MCPS[1]];
    const lines = await screenOf({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps } }),
      onPath: ['codex'],
      keys: [...toMcps, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]],
    });

    expect(after(lines, /^ □ tracker-remote\s/, 4)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+这一项现在选不了$/),
      '',
      expect.stringMatching(PICK_KEYS),
    ]);
  });

  it('单选：在不可进入的分组上按回车，同一个画法', async () => {
    const lines = await screenOf({ onPath: [], keys: [[HINT, KEY.up], ['▸ Skill', KEY.enter], ['这一项现在选不了', KEY.ctrlC]] });

    expect(after(lines, '  退出', 4)).toEqual([
      '',
      expect.stringMatching(/^\s+注意\s+这一项现在选不了$/),
      '',
      expect.stringMatching(SELECT_KEYS),
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

    expect(after(lines, '✓ 选择分组 · Skill', 2)).toEqual(['', '? 装进哪些 AI Agent']);
  });

  it('它回答之后，两行已回答的提问紧挨着，再隔一行才是下一个提问', async () => {
    const lines = await screenOf({ onPath: BOTH_HOSTS, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(after(lines, '✓ 选择分组 · Skill', 3)).toEqual(['✓ 装进哪些 AI Agent · Claude Code、Codex', '', '? 选择要安装的 skill']);
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

    expect(after(lines, '✓ 选择分组 · Skill', 3)).toEqual(['✓ 选择要安装的 skill · 返回', '', '? 选择分组']);
  });

  it('读不到宿主的配置：那一行「注意」上下各空一行', async () => {
    const lines = await screenOf({
      catalog: fullCatalog(),
      home: { '.claude.json': '{ 写坏了' },
      keys: [...toMcps, [PICK_HINT, KEY.ctrlC]],
    });

    expect(after(lines, '✓ 选择分组 · MCP', 4)).toEqual(['', expect.stringMatching(/^\s+注意\s+读不到 Claude Code 的配置/), '', '? 选择要安装的 MCP']);
  });

  it('沿用的 key 留下的一行和已回答的提问同一个画法：紧挨着上一行', async () => {
    const pickKeyed: [string, string][] = [...toMcps, [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter]];
    const lines = await screenOf({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } }),
      keys: [...pickKeyed, ['粘贴后回车', 'k'], ['粘贴后回车', KEY.enter], [HINT, KEY.enter], ...pickKeyed, [HINT, KEY.ctrlC]],
    });

    const second = lines.lastIndexOf('✓ 选择要安装的 MCP · search-keyed');
    expect(lines.slice(second + 1, second + 4)).toEqual([
      '✓ SEARCH_API_KEY · 本次运行已填写，不再询问',
      '',
      expect.stringMatching(/^── 将安装 1 个 MCP ─+$/),
    ]);
  });

  it('填写 key：提问擦掉后，留下的一行与上面的说明隔一行', async () => {
    const lines = await screenOf({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } }),
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
    const lines = await printed({ answers: [choose('Skill'), pick('alpha'), choose('取消'), choose('退出')] });

    expect(after(lines, /^── 将安装 1 个 skill ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+条目\s+AI Agent\s+操作\s+位置$/)]);
  });

  it('MCP 的汇总、将执行的命令、key 的说明', async () => {
    const lines = await printed({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } }),
      answers: [choose('MCP'), pick('search-keyed'), secret('k'), choose('取消'), choose('退出')],
    });

    expect(after(lines, /^── search-keyed 需要 key ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+变量\s+SEARCH_API_KEY/)]);
    expect(after(lines, /^── 将安装 1 个 MCP ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+条目\s+AI Agent\s+操作$/)]);
    expect(after(lines, /^── 将执行 1 条命令 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+1\s+claude mcp add/)]);
  });

  it('应用项目详情', async () => {
    const lines = await printed({ catalog: fullCatalog(), answers: [choose('应用项目'), choose('borealis'), choose('返回'), choose('退出')] });

    expect(after(lines, /^── borealis ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+说明\s+第二个样例应用项目$/)]);
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

  it('每个工具的执行：空行只在标题下方，接着是那一行命令；结论与收尾的通栏横线之间空一行', async () => {
    const lines = await printed({ catalog: fullCatalog(), answers: [choose('工具'), pick('linter'), accept(), choose('退出')] });

    expect(after(lines, /^── 将执行 1 条命令 ─+$/, 2)).toEqual(['', expect.stringMatching(/^\s+1\s+linter\s+npm install/)]);
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
    const lines = await printed({ catalog: fullCatalog(), answers: [choose('工具'), pick('fetcher', 'linter'), accept(), choose('退出')] });

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
  const QUESTION = '? 选择要安装的 skill';

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

  it('很矮的终端里主菜单也不滚动：四个分组、「退出」和表头都在', async () => {
    const result = await run({ catalog: fullCatalog(), rows: 12, keys: [[HINT, KEY.ctrlC]] });
    const lines = await screenLines(result.raw, 60);

    expect(after(lines, '? 选择分组', 8)).toEqual([
      '',
      expect.stringMatching(/^\s+分组\s+数量\s+说明$/),
      expect.stringMatching(/^▸ Skill\s/),
      expect.stringMatching(/^\s+MCP\s/),
      expect.stringMatching(/^\s+工具\s/),
      expect.stringMatching(/^\s+应用项目\s/),
      '',
      expect.stringMatching(/^\s+退出$/),
    ]);
  });

  it('15 个条目放得下：表头和每一条都在屏幕上，列表不滚动', async () => {
    const { visible } = await terminal(15, [[PICK_HINT, KEY.ctrlC]]);

    expect(visible).toContain(QUESTION);
    expect(visible.filter((line) => /^\s+名称\s+Claude Code\s+说明$/.test(line))).toHaveLength(1);
    expect(visible.filter((line) => /^.□ skill-\d\d\s/.test(line))).toHaveLength(15);
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
  const keyed = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP, ...SAMPLE_MCPS] } });

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
        ...toMcps,
        [PICK_HINT, KEY.space],
        ['▸■ search-keyed', KEY.enter],
        [HINT, KEY.down],
      ],
    ],
    [
      'MCP：必填的 key 留空，直接到结果',
      () => ({ catalog: keyed() }),
      [...toMcps, [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter], ['粘贴后回车', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '工具：两条命令、各自的执行分区、结果',
      () => ({ catalog: fullCatalog() }),
      [...toTools, [PICK_HINT, 'a'], [' ■ linter', KEY.enter], [HINT, KEY.enter], [HINT, KEY.down]],
    ],
    [
      '应用项目：看两个再返回',
      () => ({ catalog: fullCatalog() }),
      [...toApps, [HINT, KEY.enter], ['▸ atlas', KEY.down], ['▸ borealis', KEY.enter], ['▸ borealis', KEY.down], ['▸ 返回', KEY.enter], [HINT, KEY.down]],
    ],
    [
      '应用项目：浏览器打不开',
      () => ({ catalog: fullCatalog(), browser: false }),
      [...toApps, [HINT, KEY.enter], ['▸ atlas', KEY.down]],
    ],
    [
      '一个宿主都没检测到：在不可进入的分组上按回车',
      () => ({ catalog: fullCatalog(), onPath: [] }),
      [[HINT, KEY.up], ['▸ 工具', KEY.enter], ['这一项现在选不了', KEY.down]],
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
