import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, LONG_TOOL_ABOUT, SAMPLE_TOOLS, STACK_FRAME, accept, catalogDir, choose, pick, run, tempDir } from './harness.ts';

const [FETCHER, LINTER] = SAMPLE_TOOLS as [(typeof SAMPLE_TOOLS)[0], (typeof SAMPLE_TOOLS)[1]];
const withTools = (tools: unknown[] = SAMPLE_TOOLS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools } });
const browseTools = [choose('工具'), pick(), choose('退出')];
const install = (...names: string[]) => [choose('工具'), pick(...names), choose('执行'), choose('退出')];
// 两个样例各自的安装命令：整行交给 shell，一字不差
const FETCHER_COMMAND = { command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true };
const LINTER_COMMAND = { command: 'npm install -g @example/linter@latest', args: [], shell: true };
// linter 的检查方式是主目录下的这个路径
const LINTER_FILE = '.linter/bin/linter';
const LINTER_SHOWN = join('~', '.linter', 'bin', 'linter');
// 命令过长时会折行：比对整条命令之前先把折行和缩进收成一个空格
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ');
// 中文的句子可以在任意两字之间折行：比对整句之前把空白全部去掉
const squeezed = (text: string): string => text.replace(/\s+/g, '');

// 可执行路径：一个放得进命令的目录。里面先有 claude（检测到一个宿主），再加上 commands
function pathWith(...commands: string[]): { dir: string; add(command: string): void } {
  const dir = tempDir('path');
  const add = (command: string): void => writeFileSync(join(dir, command), '', { mode: 0o755 });
  for (const command of ['claude', ...commands]) add(command);
  return { dir, add };
}

// 假装安装成功：往主目录里写出 linter 的那个文件
const installsLinter = (_command: string, _args: readonly string[], { home }: { home: string }): undefined => {
  mkdirSync(dirname(join(home, LINTER_FILE)), { recursive: true });
  writeFileSync(join(home, LINTER_FILE), '');
};

describe('工具分组', () => {
  it('目录里有工具条目时，主菜单出现这个分组和它的数量', async () => {
    const result = await run({ catalog: withTools(), answers: [choose('退出')] });

    expect(result.output).toMatch(/^\s+工具\s+2\s+执行其官方安装命令装上的工具$/m);
    expect(result.output).toMatch(/^\s+目录\s+2 skill · 2 工具$/m);
    expect(result.exitCode).toBe(0);
  });

  it('目录里没有工具条目时，主菜单没有这个分组', async () => {
    const result = await run({ answers: [choose('退出')] });

    expect(result.output).not.toMatch(/^\s+工具\s/m);
  });
});

describe('工具列表', () => {
  it('多选列表：每行是名字、状态和一句话说明；一个都不勾回到主菜单，不问装进哪个宿主，不执行任何命令', async () => {
    const result = await run({ catalog: withTools(), onPath: ['claude', 'codex'], answers: browseTools });

    expect(result.output).toContain('选择要安装的工具');
    expect(result.output).toMatch(/^\s+名称\s+状态\s+说明$/m);
    expect(result.output).toMatch(/ linter\s+未安装\s+第二个样例工具$/m);
    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('一行放不下的说明在列表里截断，全文显示在列表下方', async () => {
    const result = await run({ catalog: withTools(), answers: browseTools });

    expect(result.output).toMatch(/ fetcher\s+未安装\s+第一个样例工具.*…$/m);
    expect(result.output).toContain(LONG_TOOL_ABOUT.zh);
  });
});

describe('工具的状态', () => {
  it('检查方式是命令：它在可执行路径上就是已安装', async () => {
    const result = await run({ catalog: withTools(), env: { PATH: pathWith('fetcher').dir }, answers: browseTools });

    expect(result.output).toMatch(/ fetcher\s+已安装\s/m);
    expect(result.output).toMatch(/ linter\s+未安装\s/m);
  });

  it('检查方式是路径：主目录下有它就是已安装', async () => {
    const result = await run({ catalog: withTools(), home: { [LINTER_FILE]: '' }, answers: browseTools });

    expect(result.output).toMatch(/ fetcher\s+未安装\s/m);
    expect(result.output).toMatch(/ linter\s+已安装\s/m);
  });

  it('Windows 上认带扩展名的命令（PATHEXT）', async () => {
    const result = await run({
      catalog: withTools(),
      platform: 'win32',
      env: { PATH: pathWith('claude.CMD', 'fetcher.EXE').dir, PATHEXT: '.EXE;.CMD' },
      answers: browseTools,
    });

    expect(result.output).toMatch(/ fetcher\s+已安装\s/m);
  });
});

describe('按操作系统选安装命令', () => {
  const WINDOWS_COMMAND = 'powershell -ExecutionPolicy ByPass -c "irm https://example.com/fetcher/install.ps1 | iex"';

  it('条目没有给当前系统另写命令时，用缺省的那一条', async () => {
    const result = await run({ catalog: withTools(), platform: 'darwin', answers: install('fetcher') });

    expect(result.commands).toEqual([FETCHER_COMMAND]);
  });

  it('条目给当前系统另写了命令时，展示和执行的都是那一条', async () => {
    const result = await run({ catalog: withTools(), platform: 'win32', answers: install('fetcher') });

    expect(unwrapped(result.output)).toContain(`1 fetcher ${WINDOWS_COMMAND}`);
    expect(result.output).not.toContain('install.sh');
    expect(result.commands).toEqual([{ command: WINDOWS_COMMAND, args: [], shell: true }]);
  });

  it('安装器不认识的系统用缺省的那一条', async () => {
    const result = await run({ catalog: withTools(), platform: 'freebsd', answers: install('fetcher') });

    expect(result.commands).toEqual([FETCHER_COMMAND]);
  });
});

describe('当前系统不支持的工具', () => {
  const unsupported = (os: string) => ({ ...LINTER, name: 'picky', install: { ...LINTER.install, [os]: null } });

  it.each([
    ['darwin', 'macos', 'macOS'],
    ['linux', 'linux', 'Linux'],
    ['win32', 'windows', 'Windows'],
  ] as const)('条目把 %s 标为不支持：这一行不可选，状态栏的位置写明原因；其余照常', async (platform, os, shown) => {
    const result = await run({ catalog: withTools([unsupported(os), FETCHER]), platform, answers: browseTools });

    expect(result.output).toMatch(new RegExp(`^\\s*– picky\\s+不支持 ${shown}\\s+第二个样例工具$`, 'm'));
    expect(result.output).toMatch(/^\s*□ fetcher\s+未安装\s/m);
    expect(result.exitCode).toBe(0);
  });

  it('在别的系统上同一条照常可选，用的是缺省的命令', async () => {
    const result = await run({ catalog: withTools([unsupported('macos')]), platform: 'linux', answers: install('picky') });

    expect(result.output).toMatch(/^\s*□ picky\s+未安装\s/m);
    expect(result.commands).toEqual([LINTER_COMMAND]);
  });
});

describe('工具声明了支持的宿主', () => {
  const codexOnly = { ...LINTER, name: 'codex-only', hosts: ['codex'] };

  it('这些宿主一个都没检测到：这一行不可选，并注明原因', async () => {
    const result = await run({ catalog: withTools([codexOnly, FETCHER]), answers: browseTools });

    expect(result.output).toMatch(/^\s*– codex-only\s+需要别的 AI Agent\s+第二个样例工具$/m);
    expect(result.output).toMatch(/^\s*□ fetcher\s+未安装\s/m);
  });

  it('其中有一个检测到了就可选，照常执行，不问装进哪个', async () => {
    const result = await run({ catalog: withTools([codexOnly]), onPath: ['claude', 'codex'], answers: install('codex-only') });

    expect(result.output).not.toContain('装进哪些 AI Agent');
    expect(result.commands).toEqual([LINTER_COMMAND]);
  });

  it('hosts 里有这一版安装器不认识的宿主时，这一条照常可用', async () => {
    const result = await run({
      catalog: withTools([{ ...codexOnly, hosts: ['claude-code', 'some-future-agent'] }]),
      answers: install('codex-only'),
    });

    expect(result.commands).toEqual([LINTER_COMMAND]);
    expect(result.output).not.toContain('格式有误');
  });

  it('一个宿主都没检测到时，工具分组不可进入，行尾注明原因', async () => {
    const result = await run({ catalog: withTools(), onPath: [], answers: [choose('退出')] });

    expect(result.output).toMatch(/^-\s+工具\s+2\s+执行其官方安装命令装上的工具 · 需要 AI Agent$/m);
    expect(result.commands).toEqual([]);
  });
});

describe('执行之前：展示完整的命令并确认', () => {
  it('勾了两个工具：两条完整的命令都列出来，前面是序号和工具的名字', async () => {
    const result = await run({ catalog: withTools(), answers: install('fetcher', 'linter') });

    expect(result.output).toMatch(/^── 将执行 2 条命令 ─+$/m);
    expect(result.output).toMatch(/^\s+1\s+fetcher\s+curl -LsSf https:\/\/example\.com\/fetcher\/install\.sh \| sh$/m);
    expect(result.output).toMatch(/^\s+2\s+linter\s+npm install -g @example\/linter@latest$/m);
  });

  it('选「取消」：命令已经展示过，但一条都没有执行；回到主菜单', async () => {
    const result = await run({ catalog: withTools(), answers: [choose('工具'), pick('fetcher', 'linter'), choose('取消'), choose('退出')] });

    expect(result.output).toContain(FETCHER_COMMAND.command);
    expect(result.output).toContain(LINTER_COMMAND.command);
    expect(result.output.indexOf(LINTER_COMMAND.command)).toBeLessThan(result.output.indexOf('执行这些命令吗'));
    expect(result.commands).toEqual([]);
    expect(result.output.split('选择分组')).toHaveLength(3);
  });

  it('确认的缺省是执行；展示的就是执行的那几条，一字不差', async () => {
    const result = await run({ catalog: withTools(), answers: [choose('工具'), pick('fetcher', 'linter'), accept(), choose('退出')] });

    expect(result.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
  });

  it('选「返回修改」回到列表，之前勾的还在；改完再确认', async () => {
    const result = await run({
      catalog: withTools(),
      answers: [choose('工具'), pick('fetcher'), choose('返回修改'), accept(), choose('执行'), choose('退出')],
    });

    const lists = result.output.split('? 选择要安装的工具');
    expect(lists).toHaveLength(3);
    expect(lists[2]).toMatch(/^\s*■ fetcher\s/m);
    expect(lists[2]).toMatch(/^\s*□ linter\s/m);
    expect(result.commands).toEqual([FETCHER_COMMAND]);
  });

  it('比一行长的命令折行显示，不截断', async () => {
    const long = 'curl --proto =https --tlsv1.2 -LsSf https://example.com/a-rather-long-path/to/the/installer/script.sh | sh -s -- --yes --no-modify-path';
    const result = await run({ catalog: withTools([{ ...FETCHER, install: { default: long } }]), answers: install('fetcher') });

    expect(unwrapped(result.output)).toContain(`1 fetcher ${long}`);
    expect(result.output).not.toContain('…  ');
    expect(result.commands).toEqual([{ command: long, args: [], shell: true }]);
  });
});

describe('执行与复核', () => {
  it('每个工具一个以它名字为标题的分区，先写要执行的那一行，结束后是结论和合计，再回到主菜单', async () => {
    const result = await run({ catalog: withTools(), commandResult: installsLinter, answers: install('linter') });

    const section = result.output.split(/^── linter ─+$/m)[1] ?? '';
    expect(section).toMatch(/^\s+\$ npm install -g @example\/linter@latest$/m);
    expect(section.indexOf('$ npm install')).toBeLessThan(section.indexOf('已可用'));
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(result.output.split('选择分组')).toHaveLength(3);
    expect(result.exitCode).toBe(0);
  });

  it('检查方式是路径：命令跑完后主目录下有它，就是已可用', async () => {
    const result = await run({ catalog: withTools(), commandResult: installsLinter, answers: install('linter') });

    expect(squeezed(result.output)).toContain(squeezed(`✓  linter  已可用，${LINTER_SHOWN} 已存在`));
    expect(result.commands).toEqual([LINTER_COMMAND]);
  });

  it('检查方式是命令：命令跑完后它在可执行路径上，就是已可用', async () => {
    const path = pathWith();
    const result = await run({
      catalog: withTools(),
      env: { PATH: path.dir },
      commandResult: () => void path.add('fetcher'),
      answers: install('fetcher'),
    });

    expect(result.output).toMatch(/^\s+✓\s+fetcher\s+已可用，在 PATH 中找到 fetcher$/m);
  });

  it('命令正常结束但检查不通过：算失败，并说明查了什么', async () => {
    const result = await run({ catalog: withTools(), answers: install('linter') });

    expect(squeezed(result.output)).toContain(squeezed(`✗  linter  失败 命令已正常结束，但 ${LINTER_SHOWN} 不存在`));
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 1 失败 · 0 跳过$/m);
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('检查的是命令而找不到时，提醒可能要重开终端', async () => {
    const result = await run({ catalog: withTools(), answers: install('fetcher') });

    expect(squeezed(result.output)).toContain(squeezed('✗  fetcher  失败 命令已正常结束，但在 PATH 中找不到 fetcher；可能要重开终端才找得到'));
  });

  it('命令非零退出、检查也不通过：失败，原因里有退出状态', async () => {
    const result = await run({ catalog: withTools(), commandResult: () => ({ exitCode: 3 }), answers: install('linter') });

    expect(squeezed(result.output)).toContain(squeezed(`✗  linter  失败 命令退出状态 3；${LINTER_SHOWN} 不存在`));
    expect(result.exitCode).toBe(0);
  });

  it('命令非零退出但检查通过：以复核为准，算已可用，退出状态照实写出', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: (...call) => (installsLinter(...call), { exitCode: 3 }),
      answers: install('linter'),
    });

    expect(squeezed(result.output)).toContain(squeezed(`✓  linter  已可用，${LINTER_SHOWN} 已存在；命令退出状态 3`));
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('命令没能起来：失败，原因里只有错误码', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: () => Object.assign(new Error('spawn /bin/sh ENOENT'), { code: 'ENOENT' }),
      answers: install('linter'),
    });

    expect(squeezed(result.output)).toContain(squeezed(`✗  linter  失败 命令没能运行（ENOENT）；${LINTER_SHOWN} 不存在`));
    expect(result.output).not.toContain('spawn');
    expect(result.output).not.toMatch(STACK_FRAME);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('执行器当场抛出、错误没带错误码：同样只是这一项失败，不转述错误的消息', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: () => {
        throw new Error('something exploded');
      },
      answers: install('linter'),
    });

    expect(squeezed(result.output)).toContain(squeezed(`✗  linter  失败 命令没能运行；${LINTER_SHOWN} 不存在`));
    expect(result.output).not.toContain('exploded');
    expect(result.exitCode).toBe(0);
  });

  it('一项失败不影响其余项：后面的照常执行，结果逐项列出', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: (command, ...rest) => (command.startsWith('npm') ? installsLinter(command, ...rest) : { exitCode: 1 }),
      answers: install('fetcher', 'linter'),
    });

    expect(result.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
    expect(squeezed(result.output)).toContain(squeezed('✗  fetcher  失败 命令退出状态 1；在 PATH 中找不到 fetcher'));
    expect(squeezed(result.output)).toContain(squeezed(`✓  linter   已可用，${LINTER_SHOWN} 已存在`));
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    expect(result.exitCode).toBe(0);
  });

  it('装了不止一个时，合计之前把每一项的结论集中再列一遍：输出再长，最后也看得到逐项的成败和原因', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: (command, ...rest) => (command.startsWith('npm') ? installsLinter(command, ...rest) : { exitCode: 1 }),
      answers: install('fetcher', 'linter'),
    });

    const [, afterLastTool = ''] = result.output.split(/^── linter ─+$/m);
    const [, recap] = afterLastTool.split(/^── 结果 ─+$/m);
    expect(recap).toBeDefined();
    expect(squeezed(recap ?? '')).toContain(squeezed('✗  fetcher  失败 命令退出状态 1；在 PATH 中找不到 fetcher'));
    expect(squeezed(recap ?? '')).toContain(squeezed(`✓  linter   已可用，${LINTER_SHOWN} 已存在`));
    expect(recap).toMatch(/^\s+合计\s+1 成功 · 1 失败 · 0 跳过$/m);
    // 各自的输出后面那一行还在
    expect(result.output.split('命令退出状态 1；')).toHaveLength(3);
  });

  it('只装一个时不重复：结论就在它的输出后面，没有另外的结果分区', async () => {
    const result = await run({ catalog: withTools(), commandResult: installsLinter, answers: install('linter') });

    expect(result.output).not.toMatch(/^── 结果 ─/m);
    expect(result.output.split('已可用')).toHaveLength(2);
  });

  it('装完再进列表，看到的是新状态', async () => {
    const result = await run({
      catalog: withTools(),
      commandResult: installsLinter,
      answers: [choose('工具'), pick('linter'), choose('执行'), ...browseTools],
    });

    const lists = result.output.split('? 选择要安装的工具');
    expect(lists[1]).toMatch(/ linter\s+未安装\s/m);
    expect(lists[2]).toMatch(/ linter\s+已安装\s/m);
  });

  it('已安装的工具可以再装一次', async () => {
    const result = await run({ catalog: withTools(), home: { [LINTER_FILE]: '' }, answers: install('linter') });

    expect(result.commands).toEqual([LINTER_COMMAND]);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('安装器自己不往主目录和临时目录里写任何东西', async () => {
    const result = await run({ catalog: withTools(), answers: install('fetcher', 'linter') });

    expect(readdirSync(result.home)).toEqual([]);
    expect(readdirSync(result.tmp)).toEqual([]);
  });
});

describe('英文界面的工具', () => {
  it('分组、列表、不可选的原因、命令和结论都是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      platform: 'darwin',
      catalog: withTools([FETCHER, LINTER, { ...LINTER, name: 'picky', install: { ...LINTER.install, macos: null } }]),
      commandResult: (command, ...rest) => (command.startsWith('npm') ? installsLinter(command, ...rest) : undefined),
      answers: [choose('Tools'), pick('fetcher', 'linter'), choose('Run'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 3 tools$/m);
    expect(result.output).toMatch(/^\s+Name\s+Status\s+About$/m);
    expect(result.output).toMatch(/^\s*– picky\s+not for macOS\s+The second sample tool$/m);
    expect(result.output).toMatch(/^── 2 commands to run ─+$/m);
    expect(unwrapped(result.output)).toContain('x fetcher failed the command finished normally, but fetcher not found on PATH; a new terminal may be needed to find it'.replace('x ', '✗ '));
    expect(unwrapped(result.output)).toContain(`✓ linter available: ${LINTER_SHOWN} exists`);
    expect(result.output).toMatch(/^\s+Total\s+1 succeeded · 1 failed · 0 skipped$/m);
  });

  it('只有一个工具时用单数', async () => {
    const result = await run({ argv: ['--lang', 'en'], catalog: withTools([LINTER]), answers: [choose('Exit')] });

    expect(result.output).toMatch(/^\s+Catalog\s+2 skills · 1 tool$/m);
  });
});

describe('写坏的工具条目', () => {
  it('只跳过那一条并提示数量，其余照常', async () => {
    const result = await run({
      catalog: withTools([{ ...FETCHER, install: { default: 'echo one\necho two' } }, LINTER]),
      answers: browseTools,
    });

    expect(result.output).toMatch(/^\s+注意\s+目录中有 1 个条目格式有误，已跳过$/m);
    expect(result.output).toMatch(/^\s+工具\s+1\s/m);
    expect(result.output).not.toMatch(/ fetcher\s/);
    expect(result.exitCode).toBe(0);
  });
});
