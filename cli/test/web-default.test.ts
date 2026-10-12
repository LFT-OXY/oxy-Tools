import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { choose, run, tempDir, type Page } from './harness.ts';
import { LANGUAGE_QUESTION } from './terminal.ts';

// 页面连上之后点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};

describe('用哪个界面：缺省是网页界面', () => {
  it.each([
    ['有桌面的 macOS', { platform: 'darwin' as const, env: { DISPLAY: '' } }],
    ['Windows', { platform: 'win32' as const, env: { DISPLAY: '' } }],
    ['带 DISPLAY 的 Linux', { platform: 'linux' as const, env: { DISPLAY: ':1' } }],
  ])('%s上不带参数：打开了网页界面，终端上没有语言提问', async (_label, machine) => {
    const result = await run({ ...machine, page: done });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toHaveLength(1);
    expect(result.output).toContain('已在浏览器打开');
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
  });

  it('只有 WAYLAND_DISPLAY 的 Linux：也算有桌面，打开网页界面', async () => {
    const result = await run({ platform: 'linux', env: { DISPLAY: '', WAYLAND_DISPLAY: 'wayland-0' }, page: done });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toHaveLength(1);
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
  });
});

describe('用哪个界面：直接是终端界面的情形', () => {
  // 架子缺省带着 --terminal 的那一次运行：加网页界面之前的终端界面就是这个样子
  const plainTerminal = () => run({ answers: [choose('退出')] });

  it.each([
    ['SSH_CONNECTION', '203.0.113.7 50022 198.51.100.4 22'],
    ['SSH_TTY', '/dev/pts/3'],
    ['SSH_CLIENT', '203.0.113.7 50022 22'],
  ])('远程连接（%s 非空）：有桌面也是终端界面，画面和带 --terminal 的逐字相同', async (name, value) => {
    const result = await run({ web: true, env: { [name]: value }, answers: [choose('退出')] });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.output).toContain(LANGUAGE_QUESTION);
    expect(result.screen).toBe((await plainTerminal()).screen);
  });

  it('macOS 上经远程连接运行：同样是终端界面', async () => {
    const result = await run({ web: true, platform: 'darwin', env: { SSH_CONNECTION: '203.0.113.7 50022 198.51.100.4 22' }, answers: [choose('退出')] });

    expect(result.opened).toEqual([]);
    expect(result.output).toContain(LANGUAGE_QUESTION);
  });

  it('没有 DISPLAY 和 WAYLAND_DISPLAY 的 Linux：终端界面，画面和带 --terminal 的逐字相同', async () => {
    const result = await run({ web: true, platform: 'linux', env: { DISPLAY: '' }, answers: [choose('退出')] });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.output).toContain(LANGUAGE_QUESTION);
    expect(result.screen).toBe((await plainTerminal()).screen);
  });

  it('开发期间的临时开关 OXY_TOOLS_WEB 已经拿掉：设了它也不打开网页界面', async () => {
    const result = await run({ web: true, platform: 'linux', env: { DISPLAY: '', OXY_TOOLS_WEB: '1' }, answers: [choose('退出')] });

    expect(result.opened).toEqual([]);
    expect(result.output).toContain(LANGUAGE_QUESTION);
  });

  it.each([
    ['给了 --terminal', { argv: ['--terminal'] }],
    ['远程连接', { env: { SSH_CONNECTION: '203.0.113.7 50022 198.51.100.4 22' } }],
    ['没有桌面', { env: { DISPLAY: '' } }],
  ])('%s：连本机的网页都没有去起——页面的静态文件读不到也没有「起不来」那句', async (_label, situation) => {
    // 去起了的话，读不到静态文件就会在终端上说一句「本机的网页起不来，改用终端界面」
    const result = await run({ web: true, ...situation, webDir: join(tempDir('web'), 'missing'), answers: [choose('退出')] });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('本机的网页起不来');
    expect(result.screen).toBe((await plainTerminal()).screen);
  });

  it('给了 --terminal：有桌面的 macOS 上也是终端界面，照旧问语言，没有打开浏览器', async () => {
    const result = await run({ web: true, platform: 'darwin', argv: ['--terminal'], answers: [choose('退出')] });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.output).toContain(LANGUAGE_QUESTION);
    expect(result.output).toContain('选择用途');
    expect(result.output).not.toContain('网页界面');
  });

  it.each([
    ['--terminal 在前', ['--terminal', '--lang', 'en']],
    ['--lang 在前', ['--lang=en', '--terminal']],
  ])('--terminal 与 --lang 同给（%s）：终端界面，不问语言，直接是英文的主菜单', async (_label, argv) => {
    const result = await run({ web: true, platform: 'darwin', argv, answers: [choose('Exit')] });

    expect(result.exitCode).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.output).not.toContain(LANGUAGE_QUESTION);
    expect(result.output.split('\n').filter((line) => line.startsWith('? '))).toEqual(['? Pick a purpose']);
  });

  it('--terminal 不带值：写成 --terminal=1 是无法识别的参数，以 2 退出', async () => {
    const result = await run({ web: true, platform: 'darwin', argv: ['--terminal=1'] });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('出错：无法识别的参数');
    expect(result.stderr).toContain('--terminal=1');
    expect(result.opened).toEqual([]);
  });
});

describe('用哪个界面：不问就退出的四种情况不打开浏览器', () => {
  it.each([
    ['--help', { argv: ['--help'] }, 0],
    ['--version', { argv: ['--version'] }, 0],
    ['参数有误', { argv: ['--frobnicate'] }, 2],
    ['没有交互式终端', { tty: false }, 1],
  ])('%s：有桌面的 macOS 上也和以前一样', async (_label, options, exitCode) => {
    const result = await run({ web: true, platform: 'darwin', ...options });

    expect(result.exitCode).toBe(exitCode);
    expect(result.opened).toEqual([]);
    expect(result.output).not.toContain('已在浏览器打开');
    // 输出和带着 --terminal 的那一次逐字相同
    expect(result.output).toBe((await run({ platform: 'darwin', ...options })).output);
  });
});

describe('用哪个界面：帮助', () => {
  it.each([
    ['中文', 'zh', /^\s+--terminal\s+用终端界面，不打开浏览器$/m],
    ['英文', 'en', /^\s+--terminal\s+Use the terminal UI; do not open a browser$/m],
  ])('%s的 --help 里有 --terminal 和一句说明', async (_label, lang, row) => {
    const result = await run({ web: true, platform: 'darwin', argv: ['--help', '--lang', lang] });

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(row);
    expect(result.output).not.toContain('OXY_TOOLS_WEB');
  });
});
