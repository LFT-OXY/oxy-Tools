// 提问部分实际打到终端上的东西：这里用真实的交互库渲染，按脚本发按键。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CATALOG, KEY, KEYED_MCP, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, SAMPLE_TOOLS, STYLE_CODE, catalogDir, run, underWebSearch } from './harness.ts';
import { displayWidth } from '../src/text.ts';
import { screenLines } from './terminal.ts';

// 交互库自带的样式按 Node 的规则上色，看的是真实进程的环境和标准输出；测试进程的标准输出不是终端，
// 不强行打开的话它永远不上色，主题里漏盖了哪个样式函数也就查不出来。
beforeEach(() => vi.stubEnv('FORCE_COLOR', '1'));
afterEach(() => vi.unstubAllEnvs());

// 交互库重画时先挪光标再写，所以已回答的那一行在去掉控制码的文字里不从行首开始，断言只卡行尾。
// 按键提示是每个提问最后画出来的一行，等到它就说明这个提问已经在等按键了
const HINT = '⏎ 选择';
// 多选的按键提示同样是最后画出来的一行
const PICK_HINT = '⏎ 确认';

describe('真实的提问画面', () => {
  it('主菜单：光标停在第一行「推荐」上，下方是本地化的按键提示', async () => {
    const result = await run({ keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ 推荐\s+2$/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · ⏎ 选择$/m);
  });

  it('回答之后提问收成一行；下移光标后列表下方换成那一项的说明全文', async () => {
    const result = await run({
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.down],
        ['▸□ beta-pack', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/✓ 选择用途 · 推荐$/m);
    expect(result.output).toMatch(/^▸□ alpha\s+未装\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^▸□ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+说明\s+第二个样例 skill$/m);
  });

  it('从 skill 列表返回，再从主菜单退出', async () => {
    const result = await run({
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.enter],
        [HINT, KEY.down],
        ['▸ 退出', KEY.enter],
      ],
    });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).toMatch(/✓ 选择用途 · 退出$/m);
    expect(result.exitCode).toBe(0);
  });

  it('按 Ctrl+C 干净退出', async () => {
    const result = await run({ keys: [[HINT, KEY.ctrlC]] });

    expect(result.exitCode).toBe(130);
    expect(result.output).not.toContain('出错');
  });

  it('英文界面的按键提示也是英文', async () => {
    const result = await run({ argv: ['--lang', 'en'], keys: [['⏎ select', KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+↑↓ move · ⏎ select$/m);
  });

  it('设置了 NO_COLOR 时，提问部分同样不带样式码', async () => {
    const result = await run({ env: { NO_COLOR: '1' }, keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ 推荐/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，提问的符号和按键提示都退成 ASCII', async () => {
    const result = await run({
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.enter],
        ['回车 确认', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^> 推荐\s+2$/m);
    expect(result.output).toMatch(/\+ 选择用途 - 推荐$/m);
    // 提问回答之后，收成的那一行紧接着按键提示重画，所以这里不卡行尾
    expect(result.output).toMatch(/^\s+上下键 移动 - 回车 选择/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎]/);
  });
});

describe('真实的画面：语言提问', () => {
  it('系统语言是中文：光标停在「中文」上，下面是 English，按键提示是中文', async () => {
    const result = await run({ answersLanguage: true, keys: [[HINT, KEY.ctrlC]] });

    const lines = await screenLines(result.raw);
    const question = lines.indexOf('? Language / 语言');
    expect(lines.slice(question - 2, question)).toEqual([expect.stringMatching(/^\s+oxy-tools \S+$/), '']);
    expect(lines.slice(question + 1, question + 4)).toEqual(['', '▸ 中文', '  English']);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · ⏎ 选择$/m);
    expect(result.exitCode).toBe(130);
  });

  it.each([
    ['环境变量说是英文', { LANG: 'en_US.UTF-8' }, 'en-US'],
    ['环境变量里没有语言设置，系统语言环境不是中文', { LANG: '' }, 'de-DE'],
  ])('%s：光标停在 English 上，按键提示是英文', async (_label, env, systemLocale) => {
    const result = await run({ env, systemLocale, answersLanguage: true, keys: [['⏎ select', KEY.ctrlC]] });

    const lines = await screenLines(result.raw);
    const question = lines.indexOf('? Language / 语言');
    expect(lines.slice(question + 1, question + 4)).toEqual(['', '  中文', '▸ English']);
    expect(result.output).toMatch(/^\s+↑↓ move · ⏎ select$/m);
  });

  it('回答后收成一行留在标题区下面，选项和按键提示不再占着画面', async () => {
    const result = await run({ answersLanguage: true, keys: [[HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    const lines = await screenLines(result.raw);
    const answered = lines.indexOf('✓ Language / 语言 · 中文');
    expect(lines.slice(answered - 2, answered)).toEqual([expect.stringMatching(/^\s+oxy-tools \S+$/), '']);
    expect(lines).not.toContain('? Language / 语言');
    expect(lines).not.toContain('  English');
    expect(lines.slice(answered + 1).join('\n')).toMatch(/^\s+AI Agent\s+Claude Code ✓/);
  });

  it('下移到 English 再回车：收成的一行写着 English，主菜单和它的按键提示是英文', async () => {
    const result = await run({
      answersLanguage: true,
      keys: [
        [HINT, KEY.down],
        ['▸ English', KEY.enter],
        ['⏎ select', KEY.ctrlC],
      ],
    });

    const lines = await screenLines(result.raw);
    expect(lines).toContain('✓ Language / 语言 · English');
    expect(lines).toContain('? Pick a purpose');
    expect(result.output).toMatch(/^\s+↑↓ move · ⏎ select$/m);
    expect(lines.join('\n')).not.toContain('选择用途');
  });

  it('选完语言后立刻出错：收成的那一行与出错说明之间空一行', async () => {
    const result = await run({ catalog: catalogDir({ index: null }), keys: [] });

    const lines = await screenLines(result.raw);
    const answered = lines.indexOf('✓ Language / 语言 · 中文');
    expect(answered).toBeGreaterThan(-1);
    expect(lines.slice(answered + 1, answered + 3)).toEqual(['', expect.stringMatching(/^── 出错：/)]);
  });

  it('不显示颜色、没有 Unicode 时，语言提问同样不带样式码、符号退成 ASCII，三段字不变', async () => {
    const result = await run({
      platform: 'win32',
      env: { TERM: '', NO_COLOR: '1' },
      answersLanguage: true,
      keys: [['回车 选择', KEY.enter], ['回车 选择', KEY.ctrlC]],
    });

    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.output).toMatch(/^> 中文$/m);
    expect(result.output).toMatch(/^  English$/m);
    expect(result.output).toMatch(/\+ Language \/ 语言 - 中文$/m);
  });
});

describe('真实的多选画面', () => {
  it('skill 列表是多选：每行前面有勾选框，下方是说明全文和本地化的按键提示', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^▸□ alpha\s+未装\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^ □ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+说明\s+第一个样例 skill，它的说明故意写得很长/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/m);
  });

  it('按空格勾选，回车确认后提问收成一行，列出勾选的名字', async () => {
    const result = await run({
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.space],
        ['▸■ alpha', KEY.down],
        ['▸□ beta-pack', KEY.space],
        ['▸■ beta-pack', KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · alpha、beta-pack$/m);
    expect(result.output).toMatch(/^── 将安装 2 项 ─+$/m);
    expect(result.output).toMatch(/^▸ 开始安装$/m);
  });

  it('一个都不勾就回车：收成「返回」，回到主菜单', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).not.toContain('将安装');
  });

  it('从勾选到装好走一遍：确认后逐项显示结果，再回到主菜单', async () => {
    const result = await run({
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.space],
        ['▸■ alpha', KEY.enter],
        [HINT, KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/✓ 开始安装吗 · 开始安装$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(existsSync(join(result.home, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
  });

  it('英文界面的多选按键提示也是英文，一行放得下', async () => {
    const result = await run({ argv: ['--lang', 'en'], keys: [['⏎ select', KEY.enter], ['⏎ confirm', KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+↑↓ move · space select · a all · i invert · ⏎ confirm \(none = back\)$/m);
  });

  it('设置了 NO_COLOR 时，多选、汇总和结果都不带样式码', async () => {
    const result = await run({
      env: { NO_COLOR: '1' },
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.space],
        ['▸■ alpha', KEY.enter],
        [HINT, KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/已安装 1\.0\.0$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，勾选框和按键提示都退成 ASCII', async () => {
    const result = await run({
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.enter],
        ['回车 确认', KEY.space],
        ['>[x] alpha', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^>\[ \] alpha\s+未装\s+第一个样例 skill.*\.\.\.$/m);
    expect(result.output).toMatch(/^ \[ \] beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 空格 选择 - a 全选 - i 反选 - 回车 确认（不选则返回）$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎]/);
  });

  it('英文界面加没有 Unicode：最长的那一行按键提示仍在 79 列以内', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      platform: 'win32',
      env: { TERM: '' },
      keys: [['enter select', KEY.enter], ['enter confirm', KEY.ctrlC]],
    });

    // 按键换成了英文单词，这是各种组合里最长的一行：再长一列就被终端折成两行
    const hint = result.output.split('\n').find((line) => line.includes('enter confirm')) ?? '';
    expect(hint).toMatch(/^\s+up\/down move - space select - a all - i invert - enter confirm \(none = back\)$/);
    expect(hint.length).toBeLessThanOrEqual(79);
  });
});

describe('真实的画面：一个宿主都没检测到', () => {
  // 样例的两个工具分在两个用途下：主菜单上是「推荐」和这两个用途
  const withTools = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } });
  const WEB_SEARCH = '▸ 联网搜索与文档检索';
  // 进「联网搜索与文档检索」：里面只有 fetcher 一个工具，光标就停在它上面
  const toTool: [string, string][] = [[HINT, KEY.down], [WEB_SEARCH, KEY.enter]];
  const UNAVAILABLE_TOOL = /^▸– fetcher\s+需要 AI Agent\s+第一个样例工具.*…$/m;

  it('主菜单上没有进不去的行：光标起始在「推荐」上，工具所在的用途照常列出', async () => {
    const result = await run({ catalog: withTools(), onPath: [], keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ 推荐\s+2$/m);
    expect(result.output).toMatch(/^  联网搜索与文档检索\s+1$/m);
    // 单选里不可选的行以短横开头
    expect(result.output).not.toMatch(/^- /m);
  });

  // 目录里没有 skill：主菜单的第一行是工具所在的用途
  const onlyTools = (): string => catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } });

  it('目录里只有工具时光标落在第一个用途上，回车进得去；里面的工具不可选，原因写在状态的位置', async () => {
    const result = await run({ catalog: onlyTools(), onPath: [], keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ 联网搜索与文档检索\s+1$/m);
    expect(result.output).toMatch(/✓ 选择用途 · 联网搜索与文档检索$/m);
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明$/m);
    expect(result.output).toMatch(/^\s+── 工具$/m);
    expect(result.output).toMatch(UNAVAILABLE_TOOL);
    expect(result.exitCode).toBe(130);
  });

  it('没有 Unicode 的终端里光标同样落在第一个用途上', async () => {
    const result = await run({ catalog: onlyTools(), onPath: [], platform: 'win32', env: { TERM: '' }, keys: [['回车 选择', KEY.ctrlC]] });

    expect(result.output).toMatch(/^> 联网搜索与文档检索\s+1$/m);
  });

  it('在不可选的工具上按空格勾不上：列表下方说明这一项选不了，它的类型和说明照样在', async () => {
    const result = await run({
      catalog: withTools(),
      onPath: [],
      keys: [...toTool, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]],
    });

    expect(result.output).toMatch(UNAVAILABLE_TOOL);
    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了\n\s+类型\s+工具\n\s+说明\s+第一个样例工具/m);
    expect(result.output).not.toContain('✓ 选择要安装的条目');
    expect(result.exitCode).toBe(130);
  });

  it('设置了 NO_COLOR 时，不可选的工具和那句说明都不带样式码，圈原因用的零宽空格不打出去', async () => {
    const result = await run({
      catalog: withTools(),
      onPath: [],
      env: { NO_COLOR: '1' },
      keys: [...toTool, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]],
    });

    expect(result.output).toMatch(UNAVAILABLE_TOOL);
    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('带样式时零宽空格同样不打出去', async () => {
    const result = await run({ catalog: withTools(), onPath: [], keys: [...toTool, [PICK_HINT, KEY.ctrlC]] });

    expect(result.raw).toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('没有 Unicode 的终端里，主菜单和不可选的工具的符号都退成 ASCII', async () => {
    const result = await run({
      catalog: withTools(),
      onPath: [],
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^> 推荐\s+2$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 空格 选择 - a 全选 - i 反选 - 回车 确认（不选则返回）$/m);
    expect(result.output).toMatch(/^\s+-- 工具$/m);
    expect(result.output).toMatch(/^>\[-\] fetcher\s+需要 AI Agent\s+第一个样例工具.*\.\.\.$/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎–─]/);
  });

  it('英文界面下的那句说明也是英文', async () => {
    const result = await run({
      catalog: withTools(),
      onPath: [],
      argv: ['--lang', 'en'],
      keys: [
        ['⏎ select', KEY.down],
        ['▸ Web search & docs retrieval', KEY.enter],
        ['⏎ confirm', KEY.space],
        ['cannot be selected', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^▸– fetcher\s+needs an AI Agent\s/m);
    expect(result.output).toMatch(/^\s+Notice\s+This item cannot be selected right now$/m);
    expect(result.output).toMatch(/^\s+Type\s+Tool$/m);
  });

  it('「推荐」照常进得去：skill 的勾选位是短横，原因写在状态的位置；按空格勾不上', async () => {
    const result = await run({
      onPath: [],
      keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择用途 · 推荐$/m);
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明$/m);
    expect(result.output).toMatch(/^\s+── Skill$/m);
    expect(result.output).toMatch(/^▸– alpha\s+需要 AI Agent\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^ – beta-pack\s+需要 AI Agent\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).not.toContain('装进哪些 AI Agent');
  });

  it('光标停在不可选的 skill 上：列表下方照样有它的类型和说明全文', async () => {
    const result = await run({ onPath: [], keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸– alpha\s+需要 AI Agent\s/m);
    expect(result.output).toMatch(/^\s+类型\s+Skill$/m);
    expect(result.output).toMatch(/^\s+说明\s+第一个样例 skill，它的说明故意写得很长/m);
  });

  it('没有 Unicode 的终端里同样有', async () => {
    const result = await run({
      onPath: [],
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.enter], ['回车 确认', KEY.down], ['>[-] beta-pack', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+类型\s+Skill$/m);
    expect(result.output).toMatch(/^\s+说明\s+第二个样例 skill$/m);
  });

  it('不可选的 skill 行：三栏对得齐；设置了 NO_COLOR 时不带样式码，零宽空格不打出去', async () => {
    const result = await run({ onPath: [], env: { NO_COLOR: '1' }, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });
    const lines = await screenLines(result.raw);
    const header = lines.find((line) => /^\s+名称\s+状态\s+说明$/.test(line)) ?? '';
    const row = lines.find((line) => line.startsWith(' – beta-pack')) ?? '';

    // 各栏从第几列开始，按显示宽度算
    const startOf = (line: string, text: string): number => displayWidth(line.slice(0, line.indexOf(text)));

    expect(startOf(row, 'beta-pack')).toBe(startOf(header, '名称'));
    expect(startOf(row, '需要 AI Agent')).toBe(startOf(header, '状态'));
    expect(startOf(row, '第二个样例 skill')).toBe(startOf(header, '说明'));
    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });
});

describe('真实的画面：选择宿主', () => {
  const onPath = ['claude', 'codex'];

  it('两项都默认勾选，名字后面不写目录；确认后收成一行', async () => {
    const result = await run({ onPath, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸■ Claude Code$/m);
    expect(result.output).toMatch(/^ ■ Codex$/m);
    expect(result.output).not.toMatch(/~\S+skills/);
    expect(result.output).toMatch(/✓ 装进哪些 AI Agent · Claude Code、Codex$/m);
    expect(result.output).toContain('选择要安装的条目');
  });

  it('去掉一个勾再确认：只列出留下的那个', async () => {
    const result = await run({
      onPath,
      keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['▸□ Claude Code', KEY.enter], [PICK_HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 装进哪些 AI Agent · Codex$/m);
  });

  it('设置了 NO_COLOR 时不带样式码', async () => {
    const result = await run({ onPath, env: { NO_COLOR: '1' }, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸■ Claude Code$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });
});

describe('真实的画面：skill 的状态与确认覆盖', () => {
  const marker = (name: string, version: string): string => JSON.stringify({ name, version });
  // alpha 是用户自己放的，beta-pack 是本工具装的旧版本
  const home = {
    '.claude/skills/alpha/SKILL.md': '用户自己写的 skill',
    '.claude/skills/beta-pack/SKILL.md': '# beta-pack\n',
    '.claude/skills/beta-pack/.oxy-tools.json': marker('beta-pack', '2.0'),
  };
  const toConfirm: [string, string][] = [
    [HINT, KEY.enter],
    [PICK_HINT, KEY.space],
    ['▸■ alpha', KEY.enter],
    [HINT, KEY.enter],
  ];
  const overwritten = (result: { home: string }): boolean => existsSync(join(result.home, '.claude', 'skills', 'alpha', '.oxy-tools.json'));

  it('列表里每个宿主一栏状态', async () => {
    const result = await run({ home, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^▸□ alpha\s+非本工具安装\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^ □ beta-pack\s+2\.0 → 2\.3\s+第二个样例 skill$/m);
  });

  it('确认覆盖的提问后面是 (y/N)；直接回车就是不覆盖，收成一行写「否」', async () => {
    const result = await run({ home, keys: [...toConfirm, ['(y/N)', KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/\? ~\S+alpha 不是本工具装的，要覆盖它吗？ \(y\/N\)/);
    expect(result.output).toMatch(/✓ ~\S+alpha 不是本工具装的，要覆盖它吗？ · 否$/m);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样$/m);
    expect(overwritten(result)).toBe(false);
  });

  it('按 y 再回车就覆盖，收成一行写「是」', async () => {
    const result = await run({ home, keys: [...toConfirm, ['(y/N)', 'y'], ['(y/N) y', KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ ~\S+alpha 不是本工具装的，要覆盖它吗？ · 是$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(overwritten(result)).toBe(true);
  });

  it('输入了 y、n 之外的东西：提问不结束，下方说明该输入什么', async () => {
    const result = await run({
      home,
      keys: [...toConfirm, ['(y/N)', 'x'], ['(y/N) x', KEY.enter], ['请输入 y 或 n', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+注意\s+请输入 y 或 n$/m);
    expect(result.output).not.toContain('正在安装');
    expect(overwritten(result)).toBe(false);
    expect(result.exitCode).toBe(130);
  });

  it('英文界面下的确认：回答之后和输入不对时都是英文', async () => {
    const toConfirmInEnglish: [string, string][] = [
      ['⏎ select', KEY.enter],
      ['⏎ confirm', KEY.space],
      ['▸■ alpha', KEY.enter],
      ['⏎ select', KEY.enter],
    ];
    const declined = await run({
      argv: ['--lang', 'en'],
      home,
      keys: [...toConfirmInEnglish, ['(y/N)', KEY.enter], ['⏎ select', KEY.ctrlC]],
    });
    const mistyped = await run({
      argv: ['--lang', 'en'],
      home,
      keys: [...toConfirmInEnglish, ['(y/N)', 'x'], ['(y/N) x', KEY.enter], ['Please answer y or n', KEY.ctrlC]],
    });

    expect(declined.output).toMatch(/✓ ~\S+alpha is unmanaged\. Overwrite it\? · no$/m);
    expect(mistyped.output).toMatch(/^\s+Notice\s+Please answer y or n$/m);
  });

  it('设置了 NO_COLOR 时，状态栏、含覆盖项的汇总和确认覆盖的提问都不带样式码', async () => {
    const result = await run({
      home,
      env: { NO_COLOR: '1' },
      keys: [
        [HINT, KEY.enter],
        [PICK_HINT, KEY.space],
        ['▸■ alpha', KEY.down],
        ['▸□ beta-pack', KEY.space],
        ['▸■ beta-pack', KEY.enter],
        [HINT, KEY.enter],
        ['(y/N)', 'x'],
        ['(y/N) x', KEY.enter],
        ['请输入 y 或 n', '\x7f'],
        ['(y/N)', KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^\s+beta-pack\s+Claude Code\s+覆盖\s+~\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/· 否$/m);
    expect(result.output).toMatch(/已安装 2\.0 → 2\.3$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，版本变化的箭头和跳过的记号都退成 ASCII', async () => {
    const result = await run({
      home,
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.enter],
        ['回车 确认', KEY.space],
        ['>[x] alpha', KEY.enter],
        ['回车 选择', KEY.enter],
        ['(y/N)', KEY.enter],
        ['回车 选择', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^ \[ \] beta-pack\s+2\.0 -> 2\.3\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/\+ ~\S+alpha 不是本工具装的，要覆盖它吗？ - 否$/m);
    expect(result.output).toMatch(/^\s+-\s+alpha\s+Claude Code\s+跳过 未同意覆盖，保持原样$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎–→]/);
  });
});

describe('真实的画面：外部项目', () => {
  const withApps = (apps: unknown[] = SAMPLE_APPS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, apps } });
  const [ATLAS, BOREALIS] = SAMPLE_APPS as [(typeof SAMPLE_APPS)[0], (typeof SAMPLE_APPS)[1]];
  // 和 borealis 在同一个用途下的另外几个
  const more = (...names: string[]): unknown[] => [BOREALIS, ...names.map((name) => ({ ...BOREALIS, name }))];
  // 主菜单上光标起始在「推荐」上，下面依次是联网搜索与文档检索（它下面是 borealis）、开发工作流与规范（atlas）
  const toFirstPurpose: [string, string][] = [
    [HINT, KEY.down],
    ['▸ 联网搜索与文档检索', KEY.enter],
  ];
  const toSecondPurpose: [string, string][] = [
    [HINT, KEY.down],
    ['▸ 联网搜索与文档检索', KEY.down],
    ['▸ 开发工作流与规范', KEY.enter],
  ];

  it('主菜单：「推荐」在最前，各个用途跟在后面，只有名称和数量；光标停在「推荐」上', async () => {
    const result = await run({ catalog: withApps(), keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+用途\s+数量$/m);
    expect(result.output).toMatch(/^▸ 推荐\s+2$/m);
    expect(result.output).toMatch(/^\s+联网搜索与文档检索\s+1$/m);
    expect(result.output).toMatch(/^\s+开发工作流与规范\s+1$/m);
    expect(result.output).not.toMatch(/^\s+Skill\s+\d/m);
  });

  it('列表是多选的：表头、段标题、条目；下方是光标所在行的类型、说明全文和按键提示', async () => {
    const result = await run({ catalog: withApps(), keys: [...toSecondPurpose, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择用途 · 开发工作流与规范$/m);
    expect(result.output).toMatch(/^\s+名称\s+说明$/m);
    expect(result.output).toMatch(/^\s+── 外部项目 · 只给链接，不安装$/m);
    expect(result.output).toMatch(/^▸□ atlas\s+第一个样例外部项目.*…$/m);
    expect(result.output).toMatch(/^\s+类型\s+外部项目$/m);
    expect(result.output).toMatch(/^\s+说明\s+第一个样例外部项目，它的说明同样故意写得很长/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/m);
  });

  it('勾一个再确认：提问收成一行，直接是说明与链接，不问开始不开始，不打开浏览器，再回到主菜单', async () => {
    const result = await run({
      catalog: withApps(),
      keys: [...toFirstPurpose, [PICK_HINT, KEY.space], ['▸■ borealis', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · borealis$/m);
    expect(result.output).toMatch(/^── 外部项目：1 个，只给链接 ─+$/m);
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.output.split('只给链接 ─')[1]).toMatch(/^▸ 推荐\s/m);
    expect(result.output).not.toContain('开始安装吗');
    expect(result.opened).toEqual([]);
  });

  it('一个都不勾就确认：收成的一行写「返回」，回到主菜单', async () => {
    const result = await run({ catalog: withApps(), keys: [...toFirstPurpose, [PICK_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output.split('✓ 选择要安装的条目 · 返回')[1]).toMatch(/^▸ 推荐\s/m);
    expect(result.output).not.toContain('外部项目：');
  });

  it.each([
    ['正好三个：全都列出', more('cirrus', 'dune'), /✓ 选择要安装的条目 · borealis、cirrus、dune$/m],
    ['不止三个：只列前三个，后面写总数', more('cirrus', 'dune', 'ember'), /✓ 选择要安装的条目 · borealis、cirrus、dune 等 4 项$/m],
  ])('全选之后收成的一行，%s', async (_label, apps, answered) => {
    const last = (apps.at(-1) as { name: string }).name;
    const result = await run({
      catalog: withApps(apps),
      keys: [...toFirstPurpose, [PICK_HINT, 'a'], [` ■ ${last}`, KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(answered);
    expect(result.output).toMatch(new RegExp(`^── 外部项目：${apps.length} 个，只给链接 ─+$`, 'm'));
  });

  it('一个宿主都没检测到时，用途照常进得去，外部项目照常勾得上', async () => {
    const result = await run({
      catalog: withApps(),
      onPath: [],
      keys: [...toFirstPurpose, [PICK_HINT, KEY.space], ['▸■ borealis', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^▸ 推荐\s+2$/m);
    expect(result.output).toMatch(/✓ 选择用途 · 联网搜索与文档检索$/m);
    expect(result.output).toMatch(/^▸■ borealis\s/m);
  });

  it('设置了 NO_COLOR 时，列表和说明与链接都不带样式码', async () => {
    const result = await run({
      catalog: withApps(),
      env: { NO_COLOR: '1' },
      keys: [...toSecondPurpose, [PICK_HINT, KEY.space], ['▸■ atlas', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^── 外部项目：1 个，只给链接 ─+$/m);
    expect(result.output).toContain(ATLAS.url);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，段标题的横线、分隔和列表的符号都退成 ASCII', async () => {
    const result = await run({
      catalog: withApps(),
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.down],
        ['> 联网搜索与文档检索', KEY.enter],
        ['回车 确认', KEY.space],
        ['>[x] borealis', KEY.enter],
        ['回车 选择', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^\s+-- 外部项目 - 只给链接，不安装$/m);
    expect(result.output).toMatch(/^\s+名称\s+说明$/m);
    expect(result.output).toMatch(/^-- 外部项目：1 个，只给链接 -+$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎─]/);
  });

  it('英文界面下的列表', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withApps(),
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ Pick a purpose · Web search & docs retrieval$/m);
    expect(result.output).toMatch(/^\s+Name\s+About$/m);
    expect(result.output).toMatch(/^\s+── External projects · links only, nothing is installed$/m);
    expect(result.output).toMatch(/^\s+Type\s+External project$/m);
    expect(result.output).toMatch(/^\s+About\s+The second sample external project$/m);
    expect(result.output).toMatch(/^\s+↑↓ move · space select · a all · i invert · ⏎ confirm \(none = back\)$/m);
  });

  it('英文界面下勾了不止三个：只列前三个，后面写还有几个', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withApps(more('cirrus', 'dune', 'ember', 'fjord')),
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', 'a'], [' ■ fjord', KEY.enter], ['⏎ select', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ Pick entries to install · borealis, cirrus, dune and 2 more$/m);
  });

  // 名字长到收成的那一行放不下：borealis 之外的三个取自真实目录里最长的几个名字
  const longNames = more('ai-website-cloner-template', 'awesome-design-md', 'nuyoah-image-reverse-prompt');

  it('英文界面下收成的那一行放不下时由安装器折行：名字不拆开，续行缩进两格', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withApps(longNames),
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', 'a'], [' ■ nuyoah-image-reverse-prompt', KEY.enter], ['⏎ select', KEY.ctrlC]],
    });

    const lines = await screenLines(result.raw);
    const at = lines.findIndex((line) => line.startsWith('✓ Pick entries to install'));
    expect(lines.slice(at, at + 3)).toEqual([
      '✓ Pick entries to install · ai-website-cloner-template, awesome-design-md,',
      '  borealis and 1 more',
      '',
    ]);
  });

  it('中文界面下同样折行：「等 N 项」跟着最后一个名字，不单独落到下一行', async () => {
    const result = await run({
      catalog: withApps(longNames),
      keys: [...toFirstPurpose, [PICK_HINT, 'a'], [' ■ nuyoah-image-reverse-prompt', KEY.enter], [HINT, KEY.ctrlC]],
    });

    const lines = await screenLines(result.raw);
    const at = lines.findIndex((line) => line.startsWith('✓ 选择要安装的条目'));
    expect(lines.slice(at, at + 3)).toEqual([
      '✓ 选择要安装的条目 · ai-website-cloner-template、awesome-design-md、',
      '  borealis 等 4 项',
      '',
    ]);
  });
});

describe('真实的画面：MCP', () => {
  // 第一条只支持 Claude Code：只检测到 Codex 时它不可选
  const mcps = [{ ...SAMPLE_MCPS[0], name: 'claude-only', hosts: ['claude-code'] }, { ...SAMPLE_MCPS[1], purpose: 'web-search' }];
  const catalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps } });
  // 两条都在第一个用途下：主菜单上「推荐」下面就是它
  const toMcps: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter]];

  it('MCP 一段在混合列表里：段首是类型，每行前面有勾选框，之后是状态和说明，下方是按键提示', async () => {
    const result = await run({ catalog: catalog(), keys: [...toMcps, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择用途 · 联网搜索与文档检索$/m);
    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明\n\s+── MCP$/m);
    expect(result.output).toMatch(/^\s+类型\s+MCP$/m);
    expect(result.output).toMatch(/^▸□ claude-only\s+未配置\s+本地进程方式的样例 MCP.*…$/m);
    expect(result.output).toMatch(/^ □ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/m);
  });

  it('所选宿主都不支持的条目：勾选位是短横，原因写在状态的位置；列表下方照样是它的类型和说明', async () => {
    const result = await run({ catalog: catalog(), onPath: ['codex'], keys: [...toMcps, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸– claude-only\s+需要别的 AI Agent\s+本地进程方式的样例 MCP.*…$/m);
    expect(result.output).toMatch(/^\s+类型\s+MCP\n\s+说明\s+本地进程方式的样例 MCP/m);
    expect(result.output).toMatch(/^ □ tracker-remote\s+未配置\s+远程地址方式的样例 MCP$/m);
  });

  it('在不可选的条目上按空格勾不上：列表下方说明这一项选不了；回车就是什么都没选', async () => {
    const result = await run({
      catalog: catalog(),
      onPath: ['codex'],
      keys: [...toMcps, [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).not.toContain('将安装');
    expect(result.commands).toEqual([]);
  });

  it('全选不会勾上不可选的条目', async () => {
    const result = await run({
      catalog: catalog(),
      onPath: ['codex'],
      keys: [...toMcps, [PICK_HINT, 'a'], [' ■ tracker-remote', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · tracker-remote$/m);
    expect(result.output).toMatch(/^── 将安装 1 项 ─+$/m);
    expect(result.output).not.toMatch(/^\s+claude-only\s+Codex/m);
  });

  it('从勾选到执行走一遍：确认后逐项显示结果，再回到主菜单', async () => {
    const result = await run({
      catalog: catalog(),
      keys: [...toMcps, [PICK_HINT, KEY.space], ['▸■ claude-only', KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^▸ 开始安装$/m);
    expect(result.output).toMatch(/✓ 开始安装吗 · 开始安装$/m);
    expect(result.output).toMatch(/^\s+✓\s+claude-only\s+Claude Code\s+已配置$/m);
    expect(result.commands).toHaveLength(1);
  });

  it('检测到两个宿主时先选宿主：名字后面不写目录', async () => {
    const result = await run({ catalog: catalog(), onPath: ['claude', 'codex'], keys: [...toMcps, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸■ Claude Code$/m);
    expect(result.output).toMatch(/^ ■ Codex$/m);
  });

  it('设置了 NO_COLOR 时，列表、不可选的行、汇总、命令和结果都不带样式码，零宽空格不打出去', async () => {
    const result = await run({
      catalog: catalog(),
      onPath: ['codex'],
      env: { NO_COLOR: '1' },
      home: { '.codex/config.toml': '[mcp_servers.tracker-remote]\nurl = "https://old.example.org/mcp"\n' },
      keys: [
        ...toMcps,
        [PICK_HINT, KEY.space],
        ['这一项现在选不了', KEY.down],
        ['▸□ tracker-remote', KEY.space],
        ['▸■ tracker-remote', KEY.enter],
        [HINT, KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^ – claude-only\s+需要别的 AI Agent\s/m);
    expect(result.output).toMatch(/^\s+tracker-remote\s+Codex\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Codex\s+已配置$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('带样式时零宽空格同样不打出去', async () => {
    const result = await run({ catalog: catalog(), onPath: ['codex'], keys: [...toMcps, [PICK_HINT, KEY.ctrlC]] });

    expect(result.raw).toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('没有 Unicode 的终端里，不可选的勾选位和各处的符号都退成 ASCII', async () => {
    const result = await run({
      catalog: catalog(),
      onPath: ['codex'],
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.down], ['>[ ] tracker-remote', KEY.space], ['>[x] tracker-remote', KEY.enter], ['回车 选择', KEY.enter], ['回车 选择', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^>\[-\] claude-only\s+需要别的 AI Agent\s.*\.\.\.$/m);
    expect(result.output).toMatch(/^\s+\+\s+tracker-remote\s+Codex\s+已配置$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎–─]/);
  });

  it('英文界面下不可选的原因也是英文，一行放得下', async () => {
    const result = await run({
      catalog: catalog(),
      onPath: ['codex'],
      argv: ['--lang', 'en'],
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', KEY.ctrlC]],
    });

    const row = result.output.split('\n').find((line) => line.startsWith('▸– claude-only')) ?? '';
    expect(row).toMatch(/^▸– claude-only\s+needs another AI Agent\s+A sample MCP/);
    expect(displayWidth(row)).toBeLessThanOrEqual(79);
  });
});

describe('真实的画面：第三方 Skill', () => {
  const catalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY } });
  // 两条都在第一个用途下：主菜单上「推荐」下面就是它。进去之后光标停在 paper-kit 上（含三个 skill）
  const toList: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter]];
  // 清单的按键提示末尾：等到它就说明清单已经在等按键了
  const SKIP_HINT = '不选则不装这一条';
  const toChecklist: [string, string][] = [...toList, [PICK_HINT, KEY.space], ['▸■ paper-kit', KEY.enter]];

  it('混合列表里自成一段：段首写明内容直接来自作者，下方的类型是第三方 Skill', async () => {
    const result = await run({ catalog: catalog(), keys: [...toList, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明\n\s+── 第三方 Skill · 内容直接来自作者$/m);
    expect(result.output).toMatch(/^▸□ paper-kit\s+未装\s+含三个 skill 的样例第三方 Skill.*…$/m);
    expect(result.output).toMatch(/^ □ solo-notes\s+未装\s+只含一个 skill 的样例第三方 Skill$/m);
    expect(result.output).toMatch(/^\s+类型\s+第三方 Skill$/m);
  });

  it('清单：提问写明名字和个数，每个 skill 一行有状态和说明，下方是说明全文；按键提示写明不选则不装这一条', async () => {
    const result = await run({
      catalog: catalog(),
      home: { '.claude/skills/paper-comic/SKILL.md': '# paper-comic\n' },
      keys: [...toChecklist, [SKIP_HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择要安装的条目 · paper-kit$/m);
    expect(result.output).toMatch(/^\? paper-kit 里有 3 个 skill，选择要装的$/m);
    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^▸□ paper-reader\s+未装\s+把一篇论文读成深度解读文章$/m);
    expect(result.output).toMatch(/^ □ paper-comic\s+已装\s+把论文的要点画成一组漫画$/m);
    expect(result.output).toMatch(/^\s+说明\s+把一篇论文读成深度解读文章$/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则不装这一条）$/m);
  });

  it('勾两个再确认：提问收成一行，列出勾选的名字，汇总里一行是一个 skill', async () => {
    const result = await run({
      catalog: catalog(),
      keys: [...toChecklist, [SKIP_HINT, KEY.space], ['▸■ paper-reader', KEY.down], ['▸□ paper-comic', KEY.space], ['▸■ paper-comic', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ paper-kit 里有 3 个 skill，选择要装的 · paper-reader、paper-comic$/m);
    expect(result.output).toMatch(/^\s+第三方 Skill\s+AI Agent\s+操作\s+位置\n\s+paper-reader\s+Claude Code\s+新装\s.*\n\s+paper-comic\s+Claude Code\s+新装\s/m);
    expect(result.commands).toEqual([]);
  });

  it('英文界面下条目的名字很长，收成的那一行连第一个名字都放不下：回答整个从下一行起', async () => {
    const [kit] = SAMPLE_THIRD_PARTY;
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: [{ ...kit, name: 'opencode-dynamic-context-pruning' }] } }),
      keys: [
        ['⏎ select', KEY.down],
        ['▸ Web search & docs retrieval', KEY.enter],
        ['⏎ confirm', KEY.space],
        ['▸■ opencode-dynamic-context-pruning', KEY.enter],
        ['none = skip', KEY.space],
        ['▸■ paper-reader', KEY.down],
        ['▸□ paper-comic', KEY.space],
        ['▸■ paper-comic', KEY.enter],
        ['⏎ select', KEY.ctrlC],
      ],
    });

    const lines = await screenLines(result.raw);
    const at = lines.findIndex((line) => line.startsWith('✓ opencode-dynamic-context-pruning has 3 skills'));
    expect(lines.slice(at, at + 3)).toEqual([
      '✓ opencode-dynamic-context-pruning has 3 skills; pick the ones to install ·',
      '  paper-reader, paper-comic',
      '',
    ]);
  });

  it('一个都不勾就回车：收成「不装」，没有要装的，回到主菜单', async () => {
    const result = await run({ catalog: catalog(), keys: [...toChecklist, [SKIP_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ paper-kit 里有 3 个 skill，选择要装的 · 不装$/m);
    expect(result.output).not.toContain('将安装');
  });

  it('从勾选到装好走一遍：已有同名目录的另问，结果里一行是一个 skill', async () => {
    const result = await run({
      catalog: catalog(),
      home: { '.claude/skills/paper-reader/SKILL.md': '# 用户改过的\n' },
      keys: [...toChecklist, [SKIP_HINT, 'a'], [' ■ paper-deck', KEY.enter], [HINT, KEY.enter], ['(y/N)', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ paper-kit 里有 3 个 skill，选择要装的 · paper-reader、paper-comic、paper-deck$/m);
    expect(result.output).toMatch(/^\? ~\S+paper-reader 已有同名目录，要覆盖它吗？ \(y\/N\)/m);
    expect(result.output).toMatch(/已有同名目录，要覆盖它吗？ · 否$/m);
    expect(result.output).toMatch(/^\s+–\s+paper-reader\s+Claude Code\s+跳过 未同意覆盖，保持原样$/m);
    // 假的执行器什么都不装：另外两个复核不通过
    expect(result.output).toMatch(/^\s+✗\s+paper-comic\s+Claude Code\s+失败 安装命令已结束，但目标位置没有 SKILL\.md$/m);
    expect(result.commands).toHaveLength(2);
  });

  it('设置了 NO_COLOR 时，列表、清单、汇总、命令和结果都不带样式码', async () => {
    const result = await run({
      catalog: catalog(),
      env: { NO_COLOR: '1' },
      home: { '.claude/skills/paper-reader/SKILL.md': '# 用户改过的\n' },
      keys: [...toChecklist, [SKIP_HINT, 'a'], [' ■ paper-deck', KEY.enter], [HINT, KEY.enter], ['(y/N)', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^▸■ paper-reader\s+已装\s/m);
    expect(result.output).toMatch(/^\s+paper-reader\s+Claude Code\s+覆盖\s/m);
    expect(result.output).toMatch(/^\s+✗\s+paper-comic\s+Claude Code\s+失败 /m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，清单的勾选框和按键提示都退成 ASCII，一行放得下', async () => {
    const result = await run({
      catalog: catalog(),
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.space], ['>[x] paper-kit', KEY.enter], [SKIP_HINT, KEY.ctrlC]],
    });

    const hint = result.output.split('\n').find((line) => line.includes(SKIP_HINT)) ?? '';
    expect(result.output).toMatch(/^\s+-- 第三方 Skill - 内容直接来自作者$/m);
    expect(result.output).toMatch(/^>\[ \] paper-reader\s+未装\s+把一篇论文读成深度解读文章$/m);
    expect(hint).toMatch(/^\s+上下键 移动 - 空格 选择 - a 全选 - i 反选 - 回车 确认（不选则不装这一条）$/);
    expect(displayWidth(hint)).toBeLessThanOrEqual(79);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎–─]/);
  });

  it('英文界面加没有 Unicode：清单的按键提示仍在 79 列以内；一个都不勾收成 skip', async () => {
    const result = await run({
      catalog: catalog(),
      argv: ['--lang', 'en'],
      platform: 'win32',
      env: { TERM: '' },
      keys: [['enter select', KEY.down], ['> Web search & docs retrieval', KEY.enter], ['enter confirm', KEY.space], ['>[x] paper-kit', KEY.enter], ['none = skip', KEY.enter], ['enter select', KEY.ctrlC]],
    });

    const hint = result.output.split('\n').find((line) => line.includes('none = skip')) ?? '';
    expect(hint).toMatch(/^\s+up\/down move - space select - a all - i invert - enter confirm \(none = skip\)/);
    expect(hint.indexOf('(none = skip)') + '(none = skip)'.length).toBeLessThanOrEqual(79);
    expect(result.output).toMatch(/paper-kit has 3 skills; pick the ones to install - skip$/m);
  });
});

describe('真实的画面：工具', () => {
  // 三个工具在同一个用途下，段里按名字排：fetcher、linter、picky。picky 把 macOS 标为不支持，用 darwin 跑时它不可选
  const tools = underWebSearch({ ...SAMPLE_TOOLS[1], name: 'picky', install: { default: 'npm install -g @example/picky', macos: null } }, ...SAMPLE_TOOLS);
  const catalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools } });
  const toTools: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter]];
  const toPicky: [string, string][] = [...toTools, [PICK_HINT, KEY.down], ['▸□ linter', KEY.down]];
  // 光标起始在 fetcher 上：勾上它、确认、开始安装，回到主菜单
  const installFetcher: [string, string][] = [...toTools, [PICK_HINT, KEY.space], ['▸■ fetcher', KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]];
  const mac = { platform: 'darwin' as const };

  it('工具在混合列表里自成一段：每行前面有勾选框，之后是一栏状态和说明，下方是类型、说明和按键提示', async () => {
    const result = await run({ catalog: catalog(), keys: [...toTools, [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择用途 · 联网搜索与文档检索$/m);
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明$/m);
    expect(result.output).toMatch(/^\s+── 工具$/m);
    expect(result.output).toMatch(/^▸□ fetcher\s+未安装\s+第一个样例工具.*…$/m);
    expect(result.output).toMatch(/^ □ picky\s+未安装\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^\s+类型\s+工具$/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）$/m);
  });

  it('当前系统不支持的条目：勾选位是短横，状态的位置写原因；光标停上去时下方照样有它的类型和说明', async () => {
    const result = await run({ catalog: catalog(), ...mac, keys: [...toPicky, ['▸– picky', KEY.ctrlC]] });

    expect(result.output).toMatch(/^ – picky\s+不支持 macOS\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^▸– picky\s+不支持 macOS\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^ □ linter\s+未安装\s+第二个样例工具$/m);
    const below = result.output.slice(result.output.lastIndexOf('▸– picky'));
    expect(below).toMatch(/^\s+类型\s+工具\n\s+说明\s+第二个样例工具$/m);
  });

  it('在不可选的条目上按空格勾不上：列表下方说明这一项选不了；全选也不会勾上它', async () => {
    const result = await run({
      catalog: catalog(),
      ...mac,
      keys: [...toPicky, ['▸– picky', KEY.space], ['这一项现在选不了', 'a'], [' ■ linter', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).toMatch(/✓ 选择要安装的条目 · fetcher、linter$/m);
    expect(result.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.output).not.toContain('@example/picky');
  });

  it('从勾选到执行走一遍：确认后每个工具一个分区，结论之后回到主菜单', async () => {
    const result = await run({ catalog: catalog(), keys: installFetcher });

    expect(result.output).toMatch(/^▸ 开始安装$/m);
    expect(result.output).toMatch(/✓ 开始安装吗 · 开始安装$/m);
    expect(result.output).toMatch(/^── fetcher ─+$/m);
    expect(result.output).toMatch(/^\s+\$ curl -LsSf https:\/\/example\.com\/fetcher\/install\.sh \| sh$/m);
    expect(result.output).toMatch(/^\s+✗\s+fetcher\s+失败 命令已正常结束，但在 PATH 中找不到 fetcher/m);
    expect(result.commands).toHaveLength(1);
  });

  it('设置了 NO_COLOR 时，列表、不可选的行、汇总、命令和结论都不带样式码，零宽空格不打出去', async () => {
    const result = await run({ catalog: catalog(), ...mac, env: { NO_COLOR: '1' }, keys: installFetcher });

    expect(result.output).toMatch(/^ – picky\s+不支持 macOS\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^\s+fetcher\s+执行安装命令$/m);
    expect(result.output).toMatch(/^\s+1\s+curl /m);
    expect(result.output).toMatch(/^\s+✗\s+fetcher\s+失败 /m);
    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('带样式时零宽空格同样不打出去', async () => {
    const result = await run({ catalog: catalog(), ...mac, keys: [...toTools, [PICK_HINT, KEY.ctrlC]] });

    expect(result.raw).toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('没有 Unicode 的终端里，各处的符号都退成 ASCII', async () => {
    const result = await run({
      catalog: catalog(),
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.space], ['>[x] fetcher', KEY.enter], ['回车 选择', KEY.enter], ['回车 选择', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+-- 工具$/m);
    expect(result.output).toMatch(/^\s+\d\s+powershell -ExecutionPolicy ByPass /m);
    expect(result.output).toMatch(/^\s+x\s+fetcher\s+失败 /m);
    expect(result.output).not.toMatch(/[▸✓✗■□·…↑↓⏎–─]/);
  });

  it('没有 Unicode 的终端里不可选的行', async () => {
    const windowsless = underWebSearch({ ...SAMPLE_TOOLS[1], name: 'picky', install: { default: 'npm install -g @example/picky', windows: null } }, SAMPLE_TOOLS[1]);
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, tools: windowsless } }),
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^>\[ \] linter\s+未安装\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^ \[-\] picky\s+不支持 Windows\s+第二个样例工具$/m);
  });

  it('英文界面下的列表、不可选的原因和按键提示', async () => {
    const result = await run({
      catalog: catalog(),
      ...mac,
      argv: ['--lang', 'en'],
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ Pick a purpose · Web search & docs retrieval$/m);
    expect(result.output).toMatch(/^\s+Name\s+Status\s+About$/m);
    expect(result.output).toMatch(/^\s+── Tools$/m);
    expect(result.output).toMatch(/^ – picky\s+not for macOS\s+The second sample tool$/m);
    expect(result.output).toMatch(/^\s+Type\s+Tool$/m);
    expect(result.output).toMatch(/^\s+↑↓ move · space select · a all · i invert · ⏎ confirm \(none = back\)$/m);
  });
});

describe('真实的画面：填写 key', () => {
  const catalog = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } });
  const KEY_VALUE = 'sk-test-4f9a2c71d0';
  // 隐藏输入的提问后面那句固定的提示；每按一个键提问都会重画一遍，所以输完之后还等得到它
  const KEY_HINT = '粘贴后回车';
  const toKey: [string, string][] = [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter]];
  const keyed = (result: { commands: { args: readonly string[] }[] }): string[] =>
    result.commands.flatMap(({ args }) => args.filter((arg) => arg.startsWith('SEARCH_API_KEY=')));

  it('提问是变量名和一句固定的提示；输入的字符不显示，回车后留下一行只说已填写', async () => {
    const result = await run({
      catalog: catalog(),
      keys: [...toKey, [KEY_HINT, KEY_VALUE], [KEY_HINT, KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\? SEARCH_API_KEY \(输入不显示，粘贴后回车\)/m);
    expect(result.output).toMatch(/✓ SEARCH_API_KEY · 已填写$/m);
    expect(result.output).toMatch(/SEARCH_API_KEY=<SEARCH_API_KEY>/);
    expect(keyed(result)).toEqual([`SEARCH_API_KEY=${KEY_VALUE}`]);
    expect(result.raw).not.toContain(KEY_VALUE);
    // 也不用星号之类的记号暴露它有多长
    expect(result.output).not.toMatch(/\*{2,}/);
    // 逐个字符也没有回显：这段值里的每个片段都不在提问之后的输出里
    expect(result.raw.split('SEARCH_API_KEY').slice(2).join('')).not.toMatch(/sk-|4f9a/);
  });

  it('回答之后提问从屏幕上擦掉，只留下那一行结局', async () => {
    const result = await run({ catalog: catalog(), keys: [...toKey, [KEY_HINT, KEY_VALUE], [KEY_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    const lines = await screenLines(result.raw);
    expect(lines.filter((line) => line.includes('SEARCH_API_KEY') && !line.includes('变量') && !line.includes('<'))).toEqual(['✓ SEARCH_API_KEY · 已填写']);
  });

  it('按 Ctrl+T 不会把输入显示出来', async () => {
    const result = await run({
      catalog: catalog(),
      // Ctrl+T 之后再输一个字符，逼提问重画一遍：要是它切到了明文，这一遍里就有前面输入的东西
      keys: [...toKey, [KEY_HINT, KEY_VALUE], [KEY_HINT, '\x14x'], [KEY_HINT, KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.raw).not.toContain(KEY_VALUE);
    expect(result.output).not.toMatch(/ctrl\+t|toggle/i);
  });

  it('必填的直接回车：留下一行说明将跳过，没有命令要执行，回到主菜单', async () => {
    const result = await run({ catalog: catalog(), keys: [...toKey, [KEY_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/– SEARCH_API_KEY · 必填，未填写；将跳过 search-keyed$/m);
    expect(result.output).toMatch(/^\s+–\s+search-keyed\s+Claude Code\s+跳过 未填写必填的 SEARCH_API_KEY$/m);
    expect(result.output).not.toContain('开始安装吗');
    expect(result.commands).toEqual([]);
  });

  it('在这个提问上按 Ctrl+C 干净退出，什么都没执行', async () => {
    const result = await run({ catalog: catalog(), keys: [...toKey, [KEY_HINT, KEY_VALUE], [KEY_HINT, KEY.ctrlC]] });

    expect(result.exitCode).toBe(130);
    expect(result.commands).toEqual([]);
    expect(result.output).not.toContain('出错');
    expect(result.raw).not.toContain(KEY_VALUE);
  });

  it('设置了 NO_COLOR 时，key 的说明、提问、留下的一行和带占位符的命令都不带样式码', async () => {
    const result = await run({
      catalog: catalog(),
      env: { NO_COLOR: '1' },
      keys: [...toKey, [KEY_HINT, KEY_VALUE], [KEY_HINT, KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\s+申请\s+https:\/\/example\.com\/search\/api-keys$/m);
    expect(result.output).toMatch(/✓ SEARCH_API_KEY · 已填写$/m);
    expect(result.output).toMatch(/SEARCH_API_KEY=<SEARCH_API_KEY>/);
    expect(result.output).toMatch(/^\s+✓\s+search-keyed\s+Claude Code\s+已配置$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，分区的横线和留下的那一行的记号都退成 ASCII', async () => {
    const result = await run({
      catalog: catalog(),
      platform: 'win32',
      env: { TERM: '' },
      keys: [['回车 选择', KEY.down], ['> 联网搜索与文档检索', KEY.enter], ['回车 确认', KEY.space], ['>[x] search-keyed', KEY.enter], [KEY_HINT, KEY.enter], ['回车 选择', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^-- search-keyed 需要 key -+$/m);
    expect(result.output).toMatch(/- SEARCH_API_KEY - 必填，未填写；将跳过 search-keyed$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎–─]/);
  });

  it('英文界面下提问后面的提示也是英文，一行放得下', async () => {
    const result = await run({
      catalog: catalog(),
      argv: ['--lang', 'en'],
      keys: [['⏎ select', KEY.down], ['▸ Web search & docs retrieval', KEY.enter], ['⏎ confirm', KEY.space], ['▸■ search-keyed', KEY.enter], ['then press enter', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^\? SEARCH_API_KEY \(input hidden; paste, then press enter\)$/m);
  });
});

describe('真实的画面：焦点色', () => {
  // 洋红的前景色码紧挨在这个符号前面；提问标记同时是粗体，中间隔着一个粗体的码
  const inMagenta = (symbol: string): RegExp => new RegExp(`\\x1b\\[35m(?:\\x1b\\[1m)?[${symbol}]`);
  const CYAN = /\x1b\[(?:36|96)m/;
  const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

  it('提问标记、光标和读取目录时的转动符号是洋红', async () => {
    const result = await run({ keys: [[HINT, KEY.ctrlC]] });

    expect(result.raw).toMatch(inMagenta('?'));
    expect(result.raw).toMatch(inMagenta('▸'));
    expect(result.raw).toMatch(inMagenta(SPINNER));
  });

  it('已勾选的框是洋红，没勾的不上色', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['▸■ alpha', KEY.ctrlC]] });

    expect(result.raw).toMatch(inMagenta('■'));
    expect(result.raw).not.toMatch(/\x1b\[3[0-7]m□/);
  });

  it('光标停在不可选的行上时也是洋红', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } }),
      onPath: [],
      keys: [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], [PICK_HINT, KEY.ctrlC]],
    });

    // 只认不可选的那一行上的光标：它后面紧跟着不可选的勾选位
    expect(result.raw).toMatch(/\x1b\[35m▸(?:\x1b\[[0-9;]*m)*–/);
  });

  const skillHome = { '.claude/skills/alpha/SKILL.md': '用户自己写的 skill' };
  const keyedMcp = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } });
  const everything = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS, apps: SAMPLE_APPS } });
  // 四种提示、它们各自出错时多出来的那一行、两处转动符号都走到：交互库自带的样式有哪个没被主题盖住，就会在这里漏出来
  it.each<[string, () => Parameters<typeof run>[0]]>([
    [
      '单选、多选、是否题输错再改、安装',
      () => ({
        home: skillHome,
        keys: [
          [HINT, KEY.enter],
          [PICK_HINT, KEY.space],
          ['▸■ alpha', KEY.enter],
          [HINT, KEY.enter],
          ['(y/N)', 'x'],
          ['(y/N) x', KEY.enter],
          ['请输入 y 或 n', '\x7f'],
          ['(y/N)', 'y'],
          ['(y/N) y', KEY.enter],
          [HINT, KEY.ctrlC],
        ],
      }),
    ],
    [
      '在不可选的工具上按空格',
      () => ({
        catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, tools: SAMPLE_TOOLS } }),
        onPath: [],
        keys: [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]],
      }),
    ],
    ['一个宿主都没检测到的混合列表，在不可选的 skill 上按空格', () => ({ onPath: [], keys: [[HINT, KEY.enter], [PICK_HINT, KEY.space], ['这一项现在选不了', KEY.ctrlC]] })],
    [
      '隐藏输入、执行命令',
      () => ({
        catalog: keyedMcp(),
        keys: [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], [PICK_HINT, KEY.space], ['▸■ search-keyed', KEY.enter], ['粘贴后回车', 'k'], ['粘贴后回车', KEY.enter], [HINT, KEY.enter], [HINT, KEY.ctrlC]],
      }),
    ],
    [
      '用途下的列表、外部项目的说明与链接',
      () => ({
        catalog: everything(),
        // 这个用途下 fetcher（工具）在上、borealis 在下：只勾外部项目
        keys: [[HINT, KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], [PICK_HINT, KEY.down], ['▸□ borealis', KEY.space], ['▸■ borealis', KEY.enter], [HINT, KEY.ctrlC]],
      }),
    ],
  ])('%s：输出里没有青色的样式码', async (_label, options) => {
    const result = await run(options());

    expect(result.raw).toMatch(inMagenta('?'));
    expect(result.raw).not.toMatch(CYAN);
  });
});
