// 提问部分实际打到终端上的东西：这里用真实的交互库渲染，按脚本发按键。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY, STYLE_CODE, run } from './harness.ts';

// 交互库自带的样式按 Node 的规则上色，看的是真实进程的环境和标准输出；测试进程的标准输出不是终端，
// 不强行打开的话它永远不上色，主题里漏盖了哪个样式函数也就查不出来。
beforeEach(() => vi.stubEnv('FORCE_COLOR', '1'));
afterEach(() => vi.unstubAllEnvs());

// 交互库重画时先挪光标再写，所以已回答的那一行在去掉控制码的文字里不从行首开始，断言只卡行尾。
// 按键提示是每个提问最后画出来的一行，等到它就说明这个提问已经在等按键了
const HINT = '⏎ 选择';

describe('真实的提问画面', () => {
  it('主菜单：光标停在第一个分组上，下方是本地化的按键提示', async () => {
    const result = await run({ keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ Skill\s+2\s+装进 AI Agent 的能力包$/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · ⏎ 选择$/m);
  });

  it('回答之后提问收成一行；下移光标后列表下方换成那一项的说明全文', async () => {
    const result = await run({
      onPath: [],
      keys: [
        [HINT, KEY.enter],
        [HINT, KEY.down],
        ['▸ beta-pack', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/✓ 选择分组 · Skill$/m);
    expect(result.output).toMatch(/^▸ alpha\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^▸ beta-pack\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+说明\s+第二个样例 skill$/m);
  });

  it('从 skill 列表返回，再从主菜单退出', async () => {
    const result = await run({
      onPath: [],
      keys: [
        [HINT, KEY.enter],
        [HINT, KEY.down],
        ['▸ beta-pack', KEY.down],
        ['▸ 返回', KEY.enter],
        [HINT, KEY.down],
        ['▸ 退出', KEY.enter],
      ],
    });

    expect(result.output).toMatch(/✓ 浏览 skill · 返回$/m);
    expect(result.output).toMatch(/✓ 选择分组 · 退出$/m);
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
    const result = await run({
      onPath: [],
      env: { NO_COLOR: '1' },
      keys: [
        [HINT, KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^▸ alpha/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，提问的符号和按键提示都退成 ASCII', async () => {
    const result = await run({
      onPath: [],
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.enter],
        ['回车 选择', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/\+ 选择分组 - Skill$/m);
    expect(result.output).toMatch(/^> alpha\s+第一个样例 skill.*\.\.\.$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 回车 选择$/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎]/);
  });
});

// 多选的按键提示同样是最后画出来的一行
const PICK_HINT = '⏎ 确认';

describe('真实的多选画面', () => {
  it('skill 列表是多选：每行前面有勾选框，下方是说明全文和本地化的按键提示', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^\s+名称\s+说明$/m);
    expect(result.output).toMatch(/^▸□ alpha\s+第一个样例 skill.*…$/m);
    expect(result.output).toMatch(/^ □ beta-pack\s+第二个样例 skill$/m);
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

    expect(result.output).toMatch(/✓ 选择要安装的 skill · alpha、beta-pack$/m);
    expect(result.output).toMatch(/^── 将安装 2 个 skill ─+$/m);
    expect(result.output).toMatch(/^▸ 开始安装$/m);
  });

  it('一个都不勾就回车：收成「返回」，回到主菜单', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择要安装的 skill · 返回$/m);
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

    expect(result.output).toMatch(/^\s+名称\s+说明$/m);
    expect(result.output).toMatch(/^>\[ \] alpha\s+第一个样例 skill.*\.\.\.$/m);
    expect(result.output).toMatch(/^ \[ \] beta-pack\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 空格 选择 - a 全选 - i 反选 - 回车 确认（不选则返回）$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎]/);
  });
});
