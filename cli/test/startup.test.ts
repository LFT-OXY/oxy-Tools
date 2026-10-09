import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STACK_FRAME, STYLE_CODE, choose, interrupt, run } from './harness.ts';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const LOGO_TOP = ' ██████  ██   ██ ██    ██';

describe('启动', () => {
  it('最先打出 OXY 大标志，带产品名、版本号和一句话说明', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.output.trimStart().startsWith(LOGO_TOP.trimStart())).toBe(true);
    expect(result.output).toContain(`oxy-tools ${version}`);
    expect(result.output).toContain('策展式 AI 工具链安装器');
  });

  it('大标志一次运行只出现一次，回到主菜单时不重复', async () => {
    const result = await run({ answers: [choose('Skill'), choose('返回'), choose('退出')] });

    expect(result.output.split(LOGO_TOP)).toHaveLength(2);
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
      answers: [choose('Skill'), choose('Back'), choose('Exit')],
    });

    expect(result.output).toContain('Pick a group');
    expect(result.output).toContain('Curated AI toolchain installer');
    expect(result.output).toMatch(/^\s+beta-pack\s+The second sample skill$/m);
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

  it('环境变量里没有语言设置时看系统语言环境', async () => {
    const result = await run({ env: { LANG: '' }, systemLocale: 'zh-CN', answers: [choose('退出')] });

    expect(result.output).toContain('选择分组');
  });
});

describe('启动参数', () => {
  it('--help 显示用法后以零状态退出，不需要交互式终端', async () => {
    const result = await run({ argv: ['--help'], tty: false });

    expect(result.output).toContain('npx oxy-tools');
    expect(result.output).toContain('--lang');
    expect(result.output).toContain('--version');
    expect(result.output).toContain('OXY_TOOLS_CATALOG');
    expect(result.output).not.toContain('选择分组');
    expect(result.exitCode).toBe(0);
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
    const answers = (): ReturnType<typeof choose>[] => [choose('Skill'), choose('beta-pack'), choose('返回'), choose('退出')];
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

describe('没有 Unicode 的终端', () => {
  it('符号和大标志都退成 ASCII', async () => {
    // Windows 的旧式控制台：没有 Windows Terminal、VS Code 等的标记
    const result = await run({
      platform: 'win32',
      env: { TERM: '' },
      answers: [choose('Skill'), choose('beta-pack'), choose('返回'), choose('退出')],
    });

    expect(result.output).toContain(' / _ \\ \\ \\/ /\\ \\ / /');
    expect(result.output).toMatch(/^-- beta-pack -+$/m);
    expect(result.output).not.toMatch(/[█─▸✓·…⠋⠙⠹]/);
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
