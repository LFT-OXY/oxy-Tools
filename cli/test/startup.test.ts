import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STACK_FRAME, STYLE_CODE, accept, catalogDir, choose, interrupt, pick, run } from './harness.ts';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const LOGO = [
  ' ██████  ██   ██ ██    ██',
  '██    ██  ██ ██   ██  ██',
  '██    ██   ███     ████',
  '██    ██  ██ ██     ██',
  ' ██████  ██   ██    ██',
];
const ASCII_LOGO = [
  '  ___  __  ____   __',
  ' / _ \\ \\ \\/ /\\ \\ / /',
  '| | | | \\  /  \\ V /',
  '| |_| | /  \\   | |',
  ' \\___/ /_/\\_\\  |_|',
];
const WIDTH = 80;

// 一块文字在 80 列里左右各留多少空白：左边看缩进最少的一行，右边看最长的一行
const margins = (rows: string[]): { left: number; right: number } => ({
  left: Math.min(...rows.map((row) => row.length - row.trimStart().length)),
  right: WIDTH - Math.max(...rows.map((row) => row.length)),
});
const centered = (rows: string[]): boolean => Math.abs(margins(rows).left - margins(rows).right) <= 1;

// 画面上的标题区：标志上方的几行、标志的几行、它下面的几行。art 是标志的字形，靠它的第一行认出标志在哪
function titleArea(screen: string, art: string[]): { above: string[]; logo: string[]; below: string[] } {
  const lines = screen.split('\n');
  const top = lines.findIndex((line) => line.trimStart() === art[0]?.trimStart());
  return { above: lines.slice(0, top), logo: lines.slice(top, top + art.length), below: lines.slice(top + art.length) };
}
// 各行去掉同样多的缩进：字形没有走样的话，剩下的就是字形本身
const unindented = (rows: string[]): string[] => rows.map((row) => row.slice(margins(rows).left));

describe('启动', () => {
  it('最先打出 OXY 大标志，上方空一行，在 80 列里居中，字形不变，旁边没有别的字', async () => {
    const result = await run({ answers: [choose('退出')] });

    const { above, logo } = titleArea(result.screen, LOGO);
    expect(above).toEqual(['']);
    expect(unindented(logo)).toEqual(LOGO);
    expect(centered(logo)).toBe(true);
  });

  it('窗口比 80 列宽时，大标志和产品名仍按 80 列居中', async () => {
    const result = await run({ columns: 160, answers: [choose('退出')] });

    const { logo, below } = titleArea(result.screen, LOGO);
    expect(unindented(logo)).toEqual(LOGO);
    expect(centered(logo)).toBe(true);
    expect(centered([below[1] ?? ''])).toBe(true);
  });

  it('标志下方空一行是居中的产品名和版本号，再空一行才是别的内容', async () => {
    const result = await run({ argv: ['--lang', 'zh'], answers: [choose('退出')] });

    const [gap, name = '', gapBelow, next] = titleArea(result.screen, LOGO).below;
    expect([gap, name.trim(), gapBelow]).toEqual(['', `oxy-tools ${version}`, '']);
    expect(centered([name])).toBe(true);
    expect(next).toMatch(/^\s+AI Agent\s/);
  });

  it('产品名是粗体，版本号暗淡', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.raw).toContain(`\x1b[1moxy-tools\x1b[22m \x1b[2m${version}\x1b[22m`);
  });

  it('标志下面不画通栏横线，本机信息下方的那一条还在', async () => {
    const result = await run({ onPath: ['claude', 'codex'], answers: [choose('退出')] });

    const lines = result.screen.split('\n');
    const rules = lines.flatMap((line, index) => (line === '─'.repeat(WIDTH) ? [index] : []));
    expect(rules).toHaveLength(1);
    expect(lines[(rules[0] ?? 0) - 1]).toMatch(/^\s+目录\s/);
  });

  it.each([
    ['中文界面', ['--lang', 'zh'], '退出'],
    ['英文界面', ['--lang', 'en'], 'Exit'],
  ])('%s：终端上没有那句标语', async (_label, argv, exit) => {
    const started = await run({ argv, answers: [choose(exit)] });
    const help = await run({ argv: [...argv, '--help'] });

    for (const { output } of [started, help]) {
      expect(output).not.toContain('策展式 AI 工具链安装器');
      expect(output).not.toContain('Curated AI toolchain installer');
    }
  });

  it('带 --lang 启动后立刻出错：标题区与出错说明之间只隔一行', async () => {
    const result = await run({ argv: ['--lang', 'zh'], catalog: catalogDir({ index: null }) });

    const lines = result.screen.split('\n');
    const name = lines.findIndex((line) => line.trim() === `oxy-tools ${version}`);
    expect(lines[name + 1]).toBe('');
    expect(lines[name + 2]).toMatch(/^── 出错：/);
  });

  it('大标志一次运行只出现一次，回到主菜单时不重复', async () => {
    const result = await run({ answers: [choose('Skill'), pick(), choose('退出')] });

    expect(result.output.split(LOGO[0] ?? '')).toHaveLength(2);
  });

  it('读取目录时有进行中提示，读完后显示目录里有什么，再进入主菜单', async () => {
    const result = await run({ answers: [choose('退出')] });

    const loading = result.output.indexOf('正在读取目录');
    const summary = result.output.search(/^\s+目录\s+2 skill$/m);
    const menu = result.output.indexOf('选择分组');
    expect(loading).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(loading);
    expect(menu).toBeGreaterThan(summary);
  });
});

describe('语言', () => {
  it('系统语言环境不是中文时用英文界面和英文说明', async () => {
    const result = await run({
      env: { LANG: 'en_US.UTF-8' },
      answers: [choose('Skills'), pick(), choose('Exit')],
    });

    expect(result.output).toContain('Pick a group');
    expect(result.output).toMatch(/ beta-pack\s+none\s+The second sample skill$/m);
    expect(result.output).not.toContain('选择分组');
  });

  it('--lang 强制指定语言，优先于系统语言环境', async () => {
    const english = await run({ argv: ['--lang', 'en'], env: { LANG: 'zh_CN.UTF-8' }, answers: [choose('Exit')] });
    const chinese = await run({ argv: ['--lang=zh'], env: { LANG: 'en_US.UTF-8' }, answers: [choose('退出')] });

    expect(english.output).toContain('Pick a group');
    expect(chinese.output).toContain('选择分组');
  });

  it('LC_ALL 优先于 LANG', async () => {
    const result = await run({ env: { LC_ALL: 'zh_TW.UTF-8', LANG: 'en_US.UTF-8' }, answers: [choose('退出')] });

    expect(result.output).toContain('选择分组');
  });

  it('LC_MESSAGES 优先于 LANG，LC_ALL 又优先于它', async () => {
    const chinese = await run({ env: { LC_MESSAGES: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' }, answers: [choose('退出')] });
    const english = await run({
      env: { LC_ALL: 'en_US.UTF-8', LC_MESSAGES: 'zh_CN.UTF-8', LANG: 'zh_CN.UTF-8' },
      answers: [choose('Exit')],
    });

    expect(chinese.output).toContain('选择分组');
    expect(english.output).toContain('Pick a group');
  });

  it('环境变量里没有语言设置时看系统语言环境', async () => {
    const result = await run({ env: { LANG: '' }, systemLocale: 'zh-CN', answers: [choose('退出')] });

    expect(result.output).toContain('选择分组');
  });
});

describe('语言提问', () => {
  it('不带 --lang 启动：标题区之后隔一行就是它，是第一问，两项依次是「中文」「English」', async () => {
    const result = await run({ answersLanguage: true, answers: [choose('中文'), choose('退出')] });

    const lines = result.screen.split('\n');
    const name = lines.findIndex((line) => line.trim() === `oxy-tools ${version}`);
    expect(lines.slice(name + 1, name + 6)).toEqual(['', '? Language / 语言', '', '  中文', '  English']);
    expect(lines.filter((line) => line.startsWith('? '))[0]).toBe('? Language / 语言');
  });

  it.each([
    ['系统语言是中文', { LANG: 'zh_CN.UTF-8' }, '选择分组'],
    ['系统语言是英文', { LANG: 'en_US.UTF-8' }, 'Pick a group'],
    ['系统语言是别的', { LANG: 'fr_FR.UTF-8' }, 'Pick a group'],
  ])('%s：什么都不动直接回车，得到的就是光标起始那一项的界面', async (_label, env, menu) => {
    const result = await run({ env, answersLanguage: true, answers: [accept(), interrupt()] });

    expect(result.output).toContain(menu);
  });

  it('系统语言是中文、选了 English：加载提示、本机信息、菜单、条目的说明都是英文', async () => {
    const result = await run({
      env: { LANG: 'zh_CN.UTF-8' },
      answersLanguage: true,
      answers: [choose('English'), choose('Skills'), pick(), choose('Exit')],
    });

    const afterQuestion = result.output.slice(result.output.indexOf('English') + 'English'.length);
    expect(afterQuestion).toContain('Loading catalog');
    expect(afterQuestion).toMatch(/^\s+Catalog\s+2 skills?$/m);
    expect(afterQuestion).toContain('Pick a group');
    expect(afterQuestion).toMatch(/ beta-pack\s+none\s+The second sample skill$/m);
    expect(afterQuestion).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('系统语言是英文、选了「中文」：之后的画面是中文', async () => {
    const result = await run({
      env: { LANG: 'en_US.UTF-8' },
      answersLanguage: true,
      answers: [choose('中文'), choose('Skill'), pick(), choose('退出')],
    });

    expect(result.output).toContain('正在读取目录');
    expect(result.output).toContain('选择分组');
    expect(result.output).toMatch(/ beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).not.toContain('Pick a group');
  });

  it('选了与系统语言不同的一项后立刻出错：出错说明也是选定的语言', async () => {
    const result = await run({
      env: { LANG: 'zh_CN.UTF-8' },
      catalog: catalogDir({ index: null }),
      answersLanguage: true,
      answers: [choose('English')],
    });

    expect(result.stderr).toContain('Error: ');
    expect(result.stderr).not.toContain('出错：');
    expect(result.exitCode).toBe(1);
  });

  it.each([
    ['--lang zh', ['--lang', 'zh'], '退出', '选择分组'],
    ['--lang en', ['--lang', 'en'], 'Exit', 'Pick a group'],
    ['--lang=zh', ['--lang=zh'], '退出', '选择分组'],
    ['--lang=en', ['--lang=en'], 'Exit', 'Pick a group'],
  ])('带 %s 启动时不问，第一问就是主菜单', async (_label, argv, exit, menu) => {
    const result = await run({ argv, answersLanguage: true, answers: [choose(exit)] });

    expect(result.output).not.toContain('Language / 语言');
    expect(result.output.split('\n').filter((line) => line.startsWith('? '))).toEqual([`? ${menu}`]);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['--help', { argv: ['--help'] }, '用法', 'Usage'],
    ['--version', { argv: ['--version'] }, version, version],
    ['参数无法识别', { argv: ['--frobnicate'] }, '出错：', 'Error: '],
    ['没有交互式终端', { tty: false }, '出错：', 'Error: '],
  ])('%s：不问语言，输出按系统语言', async (_label, options, chinese, english) => {
    const inChinese = await run({ ...options, env: { LANG: 'zh_CN.UTF-8' }, answersLanguage: true });
    const inEnglish = await run({ ...options, env: { LANG: 'en_US.UTF-8' }, answersLanguage: true });

    expect(inChinese.output).not.toContain('Language / 语言');
    expect(inEnglish.output).not.toContain('Language / 语言');
    expect(inChinese.output).toContain(chinese);
    expect(inEnglish.output).toContain(english);
  });

  it('在它上面按 Ctrl+C：以 130 退出，没有出错说明和堆栈，也不去读目录', async () => {
    const result = await run({ answersLanguage: true, answers: [interrupt()] });

    expect(result.exitCode).toBe(130);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.output).not.toContain('正在读取目录');
  });

  it('选择不落盘：运行之后主目录和临时目录里都没有多出东西', async () => {
    const result = await run({ answersLanguage: true, answers: [choose('English'), choose('Exit')] });

    expect(readdirSync(result.home)).toEqual([]);
    expect(readdirSync(result.tmp)).toEqual([]);
  });
});

describe('启动参数', () => {
  it('--help 显示用法后以零状态退出，不需要交互式终端', async () => {
    const result = await run({ argv: ['--help'], tty: false });

    expect(result.output).toContain('npx oxy-tools');
    expect(result.output).toContain('--lang');
    expect(result.output).toContain('--version');
    expect(result.output).toContain('OXY_TOOLS_CATALOG');
    expect(result.output).toContain('GITHUB_TOKEN');
    expect(result.output).not.toContain('选择分组');
    expect(result.exitCode).toBe(0);
  });

  it('--help 的第一行只有产品名和版本号', async () => {
    const result = await run({ argv: ['--help'] });

    expect(result.output.split('\n')[0]).toBe(`oxy-tools ${version}`);
    expect(result.raw.split('\n')[0]).toBe(`\x1b[1moxy-tools\x1b[22m \x1b[2m${version}\x1b[22m`);
  });

  it.each([
    ['中文', 'zh', /^\s+--lang <zh\|en>\s+界面语言；缺省时启动后询问$/m],
    ['英文', 'en', /^\s+--lang <zh\|en>\s+Interface language; asked at startup when omitted$/m],
  ])('%s的 --help 说明 --lang 缺省时启动后询问', async (_label, lang, row) => {
    const result = await run({ argv: ['--help', '--lang', lang] });

    expect(result.output).toMatch(row);
    expect(result.output).not.toMatch(/系统语言环境|system locale/);
  });

  it.each([[['--help']], [['--version']], [['--frobnicate']]])('%s 不打印大标志', async (argv) => {
    const result = await run({ argv });

    expect(result.output).not.toContain('█');
  });

  it('--help 的输出不是终端时不带样式码，是终端时带', async () => {
    const piped = await run({ argv: ['--help'], tty: { stdout: false } });
    const onTerminal = await run({ argv: ['--help'] });

    expect(piped.raw).not.toMatch(STYLE_CODE);
    expect(onTerminal.raw).toMatch(STYLE_CODE);
    expect(piped.output).toBe(onTerminal.output);
  });

  it('--version 只打印版本号', async () => {
    const result = await run({ argv: ['--version'], tty: false });

    expect(result.stdout.trim()).toBe(version);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it.each([
    { argv: ['--frobnicate'], mentions: '--frobnicate' },
    { argv: ['--lang', 'fr'], mentions: 'fr' },
  ])('不认识的参数 $argv：说明原因和下一步，以非零状态退出', async ({ argv, mentions }) => {
    const result = await run({ argv });

    expect(result.stderr).toContain('出错：');
    expect(result.stderr).toContain(mentions);
    expect(result.stderr).toContain('--help');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('没有交互式终端', () => {
  it.each([
    ['输入和输出都不是终端', false],
    ['只有标准输出被重定向', { stdout: false }],
    ['只有标准输入被重定向', { stdin: false }],
  ])('%s：不进入菜单，说明原因和下一步，以非零状态退出', async (_label, tty) => {
    const result = await run({ tty });

    expect(result.output).toContain('出错：没有交互式终端');
    expect(result.output).toMatch(/^\s+原因\s+\S/m);
    expect(result.output).toMatch(/^\s+下一步\s+\S/m);
    expect(result.output).not.toContain('选择分组');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });

  it('不打印大标志，也不读取目录', async () => {
    const result = await run({ tty: false });

    expect(result.output).not.toContain('██');
    expect(result.output).not.toContain('正在读取目录');
  });

  it('出错说明写到标准错误：标准输出被重定向到文件或管道时，用户在终端上仍然看得到', async () => {
    const result = await run({ tty: { stdout: false } });

    expect(result.stderr).toContain('出错：没有交互式终端');
    expect(result.stdout).toBe('');
  });

  it('标准错误也不是终端时不带样式', async () => {
    const redirected = await run({ tty: false });
    const onTerminal = await run({ tty: { stdout: false } });

    expect(redirected.raw).not.toMatch(STYLE_CODE);
    expect(onTerminal.raw).toMatch(STYLE_CODE);
  });
});

describe('Ctrl+C', () => {
  it('在主菜单按下时干净退出', async () => {
    const result = await run({ answers: [interrupt()] });

    expect(result.exitCode).toBe(130);
    expect(result.output).not.toContain('出错');
    expect(result.output).not.toMatch(STACK_FRAME);
  });

  it('在 skill 列表按下时干净退出', async () => {
    const result = await run({ answers: [choose('Skill'), interrupt()] });

    expect(result.exitCode).toBe(130);
    expect(result.output).not.toContain('出错');
  });
});

describe('颜色', () => {
  it('交互式终端里默认带样式', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.raw).toMatch(STYLE_CODE);
  });

  it('设置了 NO_COLOR 时不输出任何样式码，文字不变', async () => {
    const answers = (): ReturnType<typeof choose>[] => [choose('Skill'), pick('beta-pack'), choose('开始安装'), choose('退出')];
    const styled = await run({ answers: answers() });
    const mono = await run({ env: { NO_COLOR: '1' }, answers: answers() });

    expect(mono.raw).not.toMatch(STYLE_CODE);
    expect(mono.screen).toBe(styled.screen);
  });

  it('NO_COLOR 只要存在就算数，哪怕是空的', async () => {
    const result = await run({ env: { NO_COLOR: '' }, answers: [choose('退出')] });

    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('NO_COLOR 与 FORCE_COLOR 同时设置时，以 NO_COLOR 为准', async () => {
    const result = await run({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, answers: [choose('退出')] });

    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('出错说明同样不带样式码', async () => {
    const result = await run({ env: { NO_COLOR: '1' }, argv: ['--frobnicate'] });

    expect(result.stderr).toContain('出错：');
    expect(result.raw).not.toMatch(STYLE_CODE);
  });
});

// 原始输出里大标志的每个方块带着什么前景色：键是方块在字形里的列号（不含居中补的空格），
// 值是这一列各个方块的前景色码（24 位色是 38;2;红;绿;蓝，命名色是 30–37），没有上色的记作 none
function logoColors(raw: string): Map<number, string[]> {
  const blocks: { column: number; color: string }[] = [];
  for (const line of raw.split('\n').filter((row) => row.includes('█'))) {
    let column = 0;
    let color = 'none';
    for (const [, code, char] of line.matchAll(/\x1b\[([0-9;]*)m|(.)/gu)) {
      if (char !== undefined) {
        if (char === '█') blocks.push({ column, color });
        column++;
      } else if (code !== undefined && /^(3[0-7]|38;.*)$/.test(code)) color = code;
      else if (code === '39' || code === '0' || code === '') color = 'none';
    }
  }
  const indent = Math.min(...blocks.map((block) => block.column));
  const columns = new Map<number, string[]>();
  for (const { column, color } of blocks) columns.set(column - indent, [...(columns.get(column - indent) ?? []), color]);
  return columns;
}
const TRUECOLOR = /\x1b\[38;2;/;
// 三个色标：#E255C0、#8B5CF6、#3D8FE6
const PINK = '38;2;226;85;192';
const PURPLE = '38;2;139;92;246';
const BLUE = '38;2;61;143;230';
const MAGENTA = '35';

describe('大标志的颜色', () => {
  it.each(['truecolor', '24bit'])('COLORTERM=%s：从左到右由粉到紫到蓝，同一列的方块同色', async (colorterm) => {
    const result = await run({ env: { COLORTERM: colorterm }, answers: [choose('退出')] });

    const columns = logoColors(result.raw);
    expect(new Set(columns.get(0))).toEqual(new Set([PINK]));
    expect(new Set(columns.get(12))).toEqual(new Set([PURPLE]));
    expect(new Set(columns.get(24))).toEqual(new Set([BLUE]));
    // 两个四分点正好落在相邻两个色标的正中：红、绿、蓝各取平均，逢半进一
    expect(new Set(columns.get(6))).toEqual(new Set(['38;2;183;89;219']));
    expect(new Set(columns.get(18))).toEqual(new Set(['38;2;100;118;238']));
    for (const colors of columns.values()) {
      expect(new Set(colors).size).toBe(1);
      expect(colors[0]).toMatch(/^38;2;\d+;\d+;\d+$/);
    }
  });

  it.each([
    ['没有 COLORTERM', {}],
    ['COLORTERM 是别的值', { COLORTERM: '256color' }],
  ])('%s：整个标志是洋红，没有 24 位色的样式码', async (_label, env) => {
    const result = await run({ env, answers: [choose('退出')] });

    expect(result.raw).not.toMatch(TRUECOLOR);
    expect(new Set([...logoColors(result.raw).values()].flat())).toEqual(new Set([MAGENTA]));
  });

  it.each([['NO_COLOR 有值', '1'], ['NO_COLOR 是空的', '']])(
    '%s，同时 COLORTERM=truecolor：一个样式码都没有，画面文字与带样式时一字不差',
    async (_label, noColor) => {
      const styled = await run({ env: { COLORTERM: 'truecolor' }, answers: [choose('退出')] });
      const mono = await run({ env: { COLORTERM: 'truecolor', NO_COLOR: noColor }, answers: [choose('退出')] });

      expect(mono.raw).not.toMatch(STYLE_CODE);
      expect(mono.screen).toBe(styled.screen);
    },
  );

  it.each([
    ['支持 24 位色', { COLORTERM: 'truecolor' }],
    ['不支持 24 位色', {}],
  ])('没有 Unicode、%s：ASCII 字符画只加粗，不画渐变也不用洋红', async (_label, env) => {
    const result = await run({ platform: 'win32', env: { TERM: '', ...env }, answers: [choose('退出')] });

    const art = result.raw.split('\n').filter((line) => ASCII_LOGO.some((row) => line.includes(row)));
    expect(art.map((line) => line.trimStart())).toEqual(ASCII_LOGO.map((row) => `\x1b[1m${row}\x1b[22m`));
    expect(result.raw).not.toMatch(TRUECOLOR);
  });
});

describe('没有 Unicode 的终端', () => {
  it('符号和大标志都退成 ASCII', async () => {
    // Windows 的旧式控制台：没有 Windows Terminal、VS Code 等的标记
    const result = await run({
      platform: 'win32',
      env: { TERM: '' },
      answers: [choose('Skill'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).toContain(' / _ \\ \\ \\/ /\\ \\ / /');
    expect(result.output).toMatch(/^-- 将安装 1 个 skill -+$/m);
    expect(result.output).toMatch(/^\s+\[ \] alpha\s/m);
    expect(result.output).toMatch(/^\s+\+\s+beta-pack\s+Claude Code\s+已安装 2\.3$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 - 0 失败 - 0 跳过$/m);
    expect(result.output).not.toMatch(/[█─▸✓✗■□–·…⠋⠙⠹]/);
  });

  it('ASCII 字符画同样居中，下方空一行是产品名和版本号，下面不画横线', async () => {
    const result = await run({ platform: 'win32', env: { TERM: '' }, onPath: ['claude', 'codex'], answers: [choose('退出')] });

    const { above, logo, below } = titleArea(result.screen, ASCII_LOGO);
    const [gap, name = '', gapBelow] = below;
    expect(above).toEqual(['']);
    expect(unindented(logo)).toEqual(ASCII_LOGO);
    expect(centered(logo)).toBe(true);
    expect([gap, name.trim(), gapBelow]).toEqual(['', `oxy-tools ${version}`, '']);
    expect(centered([name])).toBe(true);
    expect(result.screen.split('\n').filter((line) => line === '-'.repeat(WIDTH))).toHaveLength(1);
  });
});

describe('意外错误', () => {
  it.each([
    ['带消息', new Error('something broke\n    at internal (file.js:1:1)'), 'something broke'],
    ['消息为空', new RangeError(''), 'RangeError'],
  ])('%s：说明原因和下一步，不出现堆栈，以非零状态退出', async (_label, error, cause) => {
    const result = await run({
      answers: [
        () => {
          throw error;
        },
      ],
    });

    expect(result.stderr).toContain('出错：意外错误');
    expect(result.stderr).toMatch(new RegExp(`^\\s+原因\\s+${cause}$`, 'm'));
    expect(result.stderr).toMatch(/^\s+下一步\s+\S/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.exitCode).not.toBe(0);
  });
});
