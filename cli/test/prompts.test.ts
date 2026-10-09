// 提问部分实际打到终端上的东西：这里用真实的交互库渲染，按脚本发按键。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CATALOG, KEY, SAMPLE_APPS, STYLE_CODE, catalogDir, run } from './harness.ts';

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
  it('主菜单：光标停在第一个分组上，下方是本地化的按键提示', async () => {
    const result = await run({ keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ Skill\s+2\s+装进 AI Agent 的能力包$/m);
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

    expect(result.output).toMatch(/✓ 选择分组 · Skill$/m);
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

    expect(result.output).toMatch(/✓ 选择要安装的 skill · 返回$/m);
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
    const result = await run({ env: { NO_COLOR: '1' }, keys: [[HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸ Skill/m);
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

    expect(result.output).toMatch(/^> Skill\s+2\s/m);
    expect(result.output).toMatch(/\+ 选择分组 - Skill$/m);
    // 提问回答之后，收成的那一行紧接着按键提示重画，所以这里不卡行尾
    expect(result.output).toMatch(/^\s+上下键 移动 - 回车 选择/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎]/);
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

    expect(result.output).toMatch(/^\s+名称\s+Claude Code\s+说明$/m);
    expect(result.output).toMatch(/^>\[ \] alpha\s+未装\s+第一个样例 skill.*\.\.\.$/m);
    expect(result.output).toMatch(/^ \[ \] beta-pack\s+未装\s+第二个样例 skill$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 空格 选择 - a 全选 - i 反选 - 回车 确认（不选则返回）$/m);
    expect(result.output).not.toMatch(/[▸✓■□·…↑↓⏎]/);
  });
});

describe('真实的画面：一个宿主都没检测到', () => {
  it('skill 分组行首是短横、行尾注明原因，光标落在「退出」上，回车就退出', async () => {
    const result = await run({ onPath: [], keys: [[HINT, KEY.enter]] });

    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 · 需要 AI Agent$/m);
    expect(result.output).toMatch(/^▸ 退出$/m);
    expect(result.output).toMatch(/✓ 选择分组 · 退出$/m);
    expect(result.exitCode).toBe(0);
  });

  it('把光标移到 skill 分组上按回车进不去：列表下方说明这一项选不了，仍停在主菜单', async () => {
    const result = await run({
      onPath: [],
      keys: [
        [HINT, KEY.up],
        ['▸ Skill', KEY.enter],
        ['这一项现在选不了', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).not.toContain('选择要安装的 skill');
    expect(result.output).not.toContain('✓ 选择分组');
    expect(result.exitCode).toBe(130);
  });

  it('设置了 NO_COLOR 时，不可进入的行和那句说明都不带样式码，圈原因用的零宽空格不打出去', async () => {
    const result = await run({
      onPath: [],
      env: { NO_COLOR: '1' },
      keys: [
        [HINT, KEY.up],
        ['▸ Skill', KEY.enter],
        ['这一项现在选不了', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 · 需要 AI Agent$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
    expect(result.raw).not.toContain('\u200b');
  });

  it('带样式时零宽空格同样不打出去', async () => {
    const result = await run({ onPath: [], keys: [[HINT, KEY.ctrlC]] });

    expect(result.raw).not.toContain('\u200b');
  });

  it('没有 Unicode 的终端里，原因前面的分隔退成 ASCII', async () => {
    const result = await run({ onPath: [], platform: 'win32', env: { TERM: '' }, keys: [['回车 选择', KEY.ctrlC]] });

    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 - 需要 AI Agent$/m);
    expect(result.output).toMatch(/^> 退出$/m);
    expect(result.output).toMatch(/^\s+上下键 移动 - 回车 选择$/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎–]/);
  });

  it('英文界面下的那句说明也是英文', async () => {
    const result = await run({
      onPath: [],
      argv: ['--lang', 'en'],
      keys: [
        ['⏎ select', KEY.up],
        ['▸ Skill', KEY.enter],
        ['cannot be selected', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^\s+Notice\s+This item cannot be selected right now$/m);
  });
});

describe('真实的画面：选择宿主', () => {
  const onPath = ['claude', 'codex'];

  it('两项都默认勾选，名字后面是各自的 skill 目录；确认后收成一行', async () => {
    const result = await run({ onPath, keys: [[HINT, KEY.enter], [PICK_HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^▸■ Claude Code\s+~\S+skills$/m);
    expect(result.output).toMatch(/^ ■ Codex\s+~\S+skills$/m);
    expect(result.output).toMatch(/✓ 装进哪些 AI Agent · Claude Code、Codex$/m);
    expect(result.output).toContain('选择要安装的 skill');
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

    expect(result.output).toMatch(/^▸■ Claude Code\s+~\S+skills$/m);
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

describe('真实的画面：应用项目', () => {
  const withApps = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, apps: SAMPLE_APPS } });
  // 主菜单上把光标从 Skill 移到应用项目再回车
  const toApps: [string, string][] = [
    [HINT, KEY.down],
    ['▸ 应用项目', KEY.enter],
  ];

  it('列表是单选的两栏表：光标停在第一项上，下方是它的说明全文和按键提示，末尾是返回', async () => {
    const result = await run({ catalog: withApps(), keys: [...toApps, [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 选择分组 · 应用项目$/m);
    expect(result.output).toMatch(/^\s+名称\s+说明$/m);
    expect(result.output).toMatch(/^▸ atlas\s+第一个样例应用项目.*…$/m);
    expect(result.output).toMatch(/^ {2}borealis\s+第二个样例应用项目$/m);
    expect(result.output).toMatch(/^ {2}返回$/m);
    expect(result.output).toMatch(/^\s+说明\s+第一个样例应用项目，它的说明同样故意写得很长/m);
    expect(result.output).toMatch(/^\s+↑↓ 移动 · ⏎ 选择$/m);
  });

  it('选中一项：提问收成一行，打出详情并打开链接，再回到列表，光标留在这一项上', async () => {
    const result = await run({
      catalog: withApps(),
      keys: [...toApps, [HINT, KEY.down], ['▸ borealis', KEY.enter], ['▸ borealis', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择应用项目 · borealis$/m);
    expect(result.output).toMatch(/^── borealis ─+$/m);
    expect(result.output).toMatch(/^\s+链接\s+https:\/\/example\.org\/borealis$/m);
    expect(result.opened).toEqual(['https://example.org/borealis']);
  });

  it('选「返回」回到主菜单', async () => {
    const result = await run({
      catalog: withApps(),
      keys: [...toApps, [HINT, KEY.down], ['▸ borealis', KEY.down], ['▸ 返回', KEY.enter], [HINT, KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ 选择应用项目 · 返回$/m);
    expect(result.output.split('✓ 选择应用项目 · 返回')[1]).toMatch(/^▸ Skill\s/m);
    expect(result.opened).toEqual([]);
  });

  it('一个宿主都没检测到时，光标直接落在应用项目上，回车就进去', async () => {
    const result = await run({ catalog: withApps(), onPath: [], keys: [[HINT, KEY.enter], [HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/^- Skill\s+2\s+装进 AI Agent 的能力包 · 需要 AI Agent$/m);
    expect(result.output).toMatch(/^▸ 应用项目\s+2\s+需要自行部署，这里只给链接$/m);
    expect(result.output).toMatch(/✓ 选择分组 · 应用项目$/m);
    expect(result.output).toMatch(/^▸ atlas\s/m);
  });

  it.each([
    ['浏览器打开了', true],
    ['浏览器打不开', false],
  ])('设置了 NO_COLOR 时，列表和详情都不带样式码（%s）', async (_label, browser) => {
    const result = await run({
      catalog: withApps(),
      env: { NO_COLOR: '1' },
      browser,
      keys: [...toApps, [HINT, KEY.enter], ['▸ atlas', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/^── atlas ─+$/m);
    expect(result.output).toContain(SAMPLE_APPS[0]?.url);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，列表的符号和打开之后的记号都退成 ASCII', async () => {
    const result = await run({
      catalog: withApps(),
      platform: 'win32',
      env: { TERM: '' },
      keys: [
        ['回车 选择', KEY.down],
        ['> 应用项目', KEY.enter],
        ['回车 选择', KEY.down],
        ['> borealis', KEY.enter],
        ['> borealis', KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^-- borealis -+$/m);
    expect(result.output).toMatch(/^\s+\+\s+已在默认浏览器打开；打不开时请复制上面的链接$/m);
    expect(result.output).not.toMatch(/[▸✓·…↑↓⏎─]/);
  });

  it('英文界面下的列表', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withApps(),
      keys: [['⏎ select', KEY.down], ['▸ Apps', KEY.enter], ['⏎ select', KEY.ctrlC]],
    });

    expect(result.output).toMatch(/✓ Pick a group · Apps$/m);
    expect(result.output).toMatch(/^\s+Name\s+About$/m);
    expect(result.output).toMatch(/^ {2}Back$/m);
    expect(result.output).toMatch(/^\s+↑↓ move · ⏎ select$/m);
  });
});
