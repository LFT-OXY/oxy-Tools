// 提问部分实际打到终端上的东西：这里用真实的交互库渲染，按脚本发按键。
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
