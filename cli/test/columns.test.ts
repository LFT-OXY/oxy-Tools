// 表的栏间隔：每一栏最长的一格后面恰好三格空白，再是下一栏；所有的表同一个间隔。
// 只卡间隔本身：断言都从一栏里最长的那一格写起，不管行首缩进了几列、后面的字怎么折行。
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_TOOLS, accept, catalogDir, choose, no, pick, run } from './harness.ts';

// 四个分组都有条目的样例目录
const fullCatalog = (): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: SAMPLE_MCPS, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } });
const BOTH_HOSTS = ['claude', 'codex'];
// 一段文字在终端里占几列：汉字和全角标点占两列
const columnsOf = (text: string): number => [...text].reduce((sum, char) => sum + (/[⺀-￯]/u.test(char) ? 2 : 1), 0);
// 画面上以 cell 起头（前面只有空白）的那一行里，text 从第几列开始
const startOf = (screen: string, cell: string, text = cell): number => {
  const line = screen.split('\n').find((candidate) => candidate.trimStart().startsWith(cell)) ?? '';
  return columnsOf(line.slice(0, line.indexOf(text)));
};

describe('栏间隔：主菜单', () => {
  it('「分组」一栏最长的一格后面三格是数量一栏；数量之后三格是说明', async () => {
    const { screen } = await run({ catalog: fullCatalog(), answers: [choose('退出')] });

    // 数量右对齐，所以拿表头量这一栏从哪开始
    expect(startOf(screen, '分组', '数量') - startOf(screen, '应用项目 ') - columnsOf('应用项目')).toBe(3);
    expect(screen).toMatch(/数量 {3}说明$/m);
    expect(screen).toMatch(/2 {3}需要自行部署/);
  });

  it('英文界面同一个间隔', async () => {
    const { screen } = await run({ catalog: fullCatalog(), argv: ['--lang', 'en'], answers: [choose('Exit')] });

    expect(startOf(screen, 'Group', 'Items') - startOf(screen, 'Skills ') - columnsOf('Skills')).toBe(3);
    expect(screen).toMatch(/Items {3}About$/m);
    expect(screen).toMatch(/2 {3}Deploy them yourself/);
  });
});

describe('栏间隔：skill', () => {
  // alpha 是用户自己放的：它在 Claude Code 那一栏的状态最长
  const home = { '.claude/skills/alpha/SKILL.md': '用户自己写的 skill' };
  const install = [choose('Skill'), accept(), pick('alpha', 'beta-pack'), accept(), no(), choose('退出')];

  it('多选列表：名称、两栏状态、说明之间各三格', async () => {
    const { screen } = await run({ onPath: BOTH_HOSTS, home, answers: install });

    expect(screen).toMatch(/beta-pack {3}未装/);
    expect(screen).toMatch(/非本工具安装 {3}未装/);
    expect(screen).toMatch(/Codex {3}说明$/m);
  });

  it('多选列表：栏变宽后，最长的说明仍被截断，整行不超出第 79 列', async () => {
    const { screen } = await run({ onPath: BOTH_HOSTS, home, answers: install });

    const truncated = screen.split('\n').find((line) => /alpha\s+非本工具安装/.test(line)) ?? '';
    expect(truncated).toMatch(/第一个样例 skill.*…$/);
    expect(columnsOf(truncated)).toBeLessThanOrEqual(79);
  });

  it('汇总：条目、AI Agent、操作、位置之间各三格', async () => {
    const { screen } = await run({ onPath: BOTH_HOSTS, home, answers: install });

    expect(screen).toMatch(/beta-pack {3}Claude Code {3}新装 {3}~\S+beta-pack$/m);
  });

  it('汇总：备注成一栏时，和「位置」之间同样三格', async () => {
    const { screen } = await run({
      home: {
        '.claude/skills/beta-pack/SKILL.md': '# beta-pack\n',
        '.claude/skills/beta-pack/.oxy-tools.json': JSON.stringify({ name: 'beta-pack', version: '2.3' }),
      },
      answers: [choose('Skill'), pick('beta-pack'), accept(), choose('退出')],
    });

    expect(screen).toMatch(/~\S+beta-pack {3}重装 2\.3$/m);
  });

  it('结果行：名字、宿主两栏之后各三格', async () => {
    const { screen } = await run({ onPath: BOTH_HOSTS, home, answers: install });

    expect(screen).toMatch(/beta-pack {3}Claude Code {3}已安装 2\.3$/m);
  });

  it('英文界面同一个间隔', async () => {
    const { screen } = await run({
      onPath: BOTH_HOSTS,
      home,
      argv: ['--lang', 'en'],
      answers: [choose('Skills'), accept(), pick('alpha', 'beta-pack'), accept(), no(), choose('Exit')],
    });

    expect(screen).toMatch(/beta-pack {3}none/);
    expect(screen).toMatch(/Claude Code {3}Codex {3}About$/m);
    expect(screen).toMatch(/beta-pack {3}Claude Code {3}new/);
    expect(screen).toMatch(/overwrite {3}~\S+alpha$/m);
    expect(screen).toMatch(/beta-pack {3}Claude Code {3}installed 2\.3$/m);
  });
});

describe('栏间隔：MCP', () => {
  it('多选列表、汇总、结果行同一个间隔', async () => {
    const { screen } = await run({
      catalog: fullCatalog(),
      onPath: BOTH_HOSTS,
      answers: [choose('MCP'), accept(), pick('docs-local', 'tracker-remote'), accept(), choose('退出')],
    });

    expect(screen).toMatch(/tracker-remote {3}未配置/);
    expect(screen).toMatch(/Claude Code {3}Codex/);
    expect(screen).toMatch(/未配置 {3}远程地址方式的样例 MCP$/m);
    expect(screen).toMatch(/tracker-remote {3}Claude Code {3}新装$/m);
    expect(screen).toMatch(/tracker-remote {3}Claude Code {3}已配置$/m);
  });
});

describe('栏间隔：工具', () => {
  it('多选列表、将执行的命令（工具名与命令之间）、结论行同一个间隔', async () => {
    const { screen } = await run({
      catalog: fullCatalog(),
      answers: [choose('工具'), pick('fetcher', 'linter'), accept(), choose('退出')],
    });

    expect(screen).toMatch(/fetcher {3}未安装 {3}第一个样例工具/);
    expect(screen).toMatch(/fetcher {3}curl -LsSf/);
    expect(screen).toMatch(/fetcher {3}失败 /);
  });
});

describe('栏间隔：应用项目列表', () => {
  it('名称与说明之间三格；最长的说明仍被截断，整行不超出第 79 列', async () => {
    const { screen } = await run({ catalog: fullCatalog(), answers: [choose('应用项目'), choose('返回'), choose('退出')] });

    expect(screen).toMatch(/borealis {3}第二个样例应用项目$/m);
    const truncated = screen.split('\n').find((line) => /atlas\s+第一个样例应用项目/.test(line)) ?? '';
    expect(truncated).toMatch(/…$/);
    expect(columnsOf(truncated)).toBeLessThanOrEqual(79);
  });

  it('英文界面同一个间隔', async () => {
    const { screen } = await run({
      catalog: fullCatalog(),
      argv: ['--lang', 'en'],
      answers: [choose('Apps'), choose('Back'), choose('Exit')],
    });

    expect(screen).toMatch(/borealis {3}The second sample app$/m);
  });
});

describe('栏间隔：选择宿主', () => {
  it('名字与 skill 目录之间三格', async () => {
    const { screen } = await run({ onPath: BOTH_HOSTS, answers: [choose('Skill'), accept(), pick(), pick(), choose('退出')] });

    expect(screen).toMatch(/Claude Code {3}~\S+skills$/m);
  });
});

describe('栏间隔：帮助', () => {
  it.each([
    ['中文', 'zh', /--lang <zh\|en> {3}界面语言/, /OXY_TOOLS_CATALOG {3}改从这个本地目录/],
    ['英文', 'en', /--lang <zh\|en> {3}Interface language/, /OXY_TOOLS_CATALOG {3}Read the catalog/],
  ])('%s的两栏表：选项和环境变量各自最长的一格后面三格', async (_label, lang, option, variable) => {
    const { screen } = await run({ argv: ['--help', '--lang', lang] });

    expect(screen).toMatch(option);
    expect(screen).toMatch(variable);
  });
});
