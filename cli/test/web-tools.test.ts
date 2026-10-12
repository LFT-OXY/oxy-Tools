// 网页界面里装工具：在页面上勾选，命令在终端里跑。都经主接缝，架子扮演浏览器。命令、状态、成败的判法和终端界面同一份
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, RunRowView, RunView, SummaryView, ViewState } from '../src/web-protocol.ts';
import {
  EMPTY_CATALOG,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  STACK_FRAME,
  catalogDir,
  choose,
  pick,
  run,
  tempDir,
  underWebSearch,
  type Page,
} from './harness.ts';

// 样例的工具都放进同一个用途
const WEB_SEARCH = '联网搜索与文档检索';
const withTools = (...tools: unknown[]): string => catalogDir({ catalog: { ...EMPTY_CATALOG, tools: underWebSearch(...(tools.length > 0 ? tools : SAMPLE_TOOLS)) } });
const [FETCHER, LINTER] = SAMPLE_TOOLS as [(typeof SAMPLE_TOOLS)[0], (typeof SAMPLE_TOOLS)[1]];
// 两个样例各自的安装命令：整行交给 shell，一字不差。和终端界面的测试是同一份字面值
const FETCHER_COMMAND = { command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true };
const LINTER_COMMAND = { command: 'npm install -g @example/linter@latest', args: [], shell: true };
// linter 的检查方式是主目录下的这个路径
const LINTER_FILE = '.linter/bin/linter';
const LINTER_SHOWN = join('~', '.linter', 'bin', 'linter');
const BOTH_HOSTS = ['claude', 'codex'];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
// 比页面断开之后的时限（架子给的 150 毫秒）长
const PAST_GRACE = 400;
// 中文的句子可以在任意两字之间折行：比对整句之前把空白全部去掉
const squeezed = (text: string): string => text.replace(/\s+/g, '');
// 假装安装成功：往主目录里写出 linter 的那个文件
const installsLinter = (_command: string, _args: readonly string[], { home }: { home: string }): undefined => {
  mkdirSync(dirname(join(home, LINTER_FILE)), { recursive: true });
  writeFileSync(join(home, LINTER_FILE), '');
};

// 可执行路径：一个放得进命令的目录。里面先有 claude（检测到一个宿主），再加上 commands
function pathWith(...commands: string[]): { dir: string; add(command: string): void } {
  const dir = tempDir('path');
  const add = (command: string): void => writeFileSync(join(dir, command), '', { mode: 0o755 });
  for (const command of ['claude', ...commands]) add(command);
  return { dir, add };
}

// 正常收场：点「完成」，等安装器把连接收掉
const done = async (page: Page): Promise<void> => {
  await page.send({ type: 'finish' });
  await page.closed;
};
const open = async (page: Page, name: string): Promise<ViewState> => {
  const row = page.state().menu.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`左栏里没有「${name}」`);
  await page.send({ type: 'open', list: row.id });
  return page.until((state) => state.listing?.id === row.id);
};
// 勾上（或去掉）一个工具，给出之后的画面状态
const tick = async (page: Page, name: string, on = true): Promise<ViewState> => {
  await page.send({ type: 'pick', kind: 'tool', name, on });
  return page.until((state) => state.selected.some((entry) => entry.name === name) === on);
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 一路走到装完：勾上这几个工具、去汇总、确认，给出结果
const installed = async (page: Page, ...names: string[]): Promise<RunView> => {
  for (const name of names) await tick(page, name);
  return install(page, await review(page));
};
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
// 正在看的那张列表里名字是它的工具的卡片
const card = (state: ViewState | undefined, name: string): ComponentView | undefined =>
  state?.listing?.sections.find((section) => section.kind === 'tool')?.entries.find((entry) => entry.name === name);
// 一条命令跑到一半停住：end() 之后它才正常结束
function held(): { running: Promise<undefined>; end: () => void } {
  let end = (): void => {};
  const running = new Promise<undefined>((resolve) => (end = () => resolve(undefined)));
  return { running, end };
}
const rowOf = (state: ViewState, name: string): RunRowView | undefined => state.run?.rows.find((row) => row.name === name);
// 确认安装，等到这个工具的命令跑起来
const untilRunning = async (page: Page, name: string): Promise<ViewState> => {
  await tick(page, name);
  await page.send({ type: 'install', summary: (await review(page)).id });
  return page.until((state) => rowOf(state, name)?.state === 'running');
};

describe('网页界面：勾选一个工具，在终端里装', () => {
  it('卡片只有一段状态；已选里是「工具」；汇总一段、一行只有「执行安装命令」；命令是目录里的那一整行；跑着时页面写明请看终端，跑完是结论', async () => {
    const path = pathWith();
    const command = held();
    let listed: ViewState | undefined;
    let selected: ViewState | undefined;
    let summary: SummaryView | undefined;
    let running: ViewState | undefined;
    let batch: RunView | undefined;
    let after: ViewState | undefined;
    const result = await run({
      catalog: withTools(),
      env: { PATH: path.dir },
      commandResult: () => command.running,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        selected = await tick(page, 'fetcher');
        summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        running = await page.until((state) => rowOf(state, 'fetcher')?.state === 'running');
        // 假装装上了：命令结束之前可执行路径上多出 fetcher
        path.add('fetcher');
        command.end();
        batch = (await page.until((state) => state.run?.done === true)).run;
        await page.send({ type: 'continue' });
        after = await page.until((state) => state.run === undefined);
        await done(page);
      },
    });

    expect(card(listed, 'fetcher')?.statuses).toEqual([{ text: '未安装', tone: 'faint' }]);
    expect(card(listed, 'fetcher')?.unavailable).toBeUndefined();
    expect(selected?.selected).toEqual([{ kind: 'tool', name: 'fetcher', type: '工具' }]);
    expect(card(selected, 'fetcher')?.picked).toBe(true);
    expect(summary?.title).toBe('将安装 1 项');
    expect(summary?.entries).toEqual([{ name: 'fetcher', type: '工具', rows: [{ action: '执行安装命令' }] }]);
    expect(summary?.notices).toEqual([]);
    expect(result.commands).toEqual([FETCHER_COMMAND]);
    expect(running?.run).toMatchObject({ title: '正在安装', done: false });
    expect(running?.run?.rows).toEqual([{ name: 'fetcher', state: 'running', text: '这一项正在终端里安装，请看终端', terminal: true }]);
    expect(batch?.title).toBe('结果');
    expect(batch?.rows).toEqual([{ name: 'fetcher', state: 'succeeded', text: '已可用', rest: '在 PATH 中找到 fetcher' }]);
    expect(batch?.totals).toMatchObject({ succeeded: { count: 1 }, failed: { count: 0 }, skipped: { count: 0 } });
    expect(batch?.next).toBeUndefined();
    // 继续挑选之后已选清空，状态是新的
    expect(after?.selected).toEqual([]);
    expect(card(after, 'fetcher')?.statuses).toEqual([{ text: '已安装', tone: 'ready' }]);
    expect(result.exitCode).toBe(0);
  });

  it('终端上是它自己的分区：标题是它的名字，下面是那一行命令和结论；没有「正在安装」「结果」和合计', async () => {
    const path = pathWith('fetcher');
    const result = await run({
      catalog: withTools(),
      env: { PATH: path.dir },
      page: async (page) => {
        await installed(page, 'fetcher');
        await done(page);
      },
    });

    expect(result.output).toMatch(/^── fetcher ─+\n\n\s*\$ curl -LsSf https:\/\/example\.com\/fetcher\/install\.sh \| sh\n\n\s*✓\s+fetcher\s+已可用，在 PATH 中找到 fetcher\n$/m);
    // 分区在「已在浏览器打开」的块下面，隔一行
    expect(result.screen).toMatch(/\?token=\S+\n\n── fetcher ─/);
    expect(result.output).not.toMatch(/── (正在安装|结果) ─/);
    expect(result.output).not.toContain('合计');
    // 结论打在标准输出上，标准错误上没有东西
    expect(result.stderr).toBe('');
  });

  it('记录到的命令和用终端界面装同一个工具时逐条相同', async () => {
    const web = await run({
      catalog: withTools(),
      page: async (page) => {
        await installed(page, 'fetcher', 'linter');
        await done(page);
      },
    });
    const terminal = await run({ catalog: withTools(), answers: [choose(WEB_SEARCH), pick('fetcher', 'linter'), choose('开始安装'), choose('退出')] });

    expect(web.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
    expect(web.commands).toEqual(terminal.commands);
  });

  it('那一行命令不出安装器：这一页收到的全部东西里搜不到它；意图里多带了命令的不照办', async () => {
    let received = '';
    let refused: number | undefined;
    let selected: ViewState | undefined;
    const result = await run({
      catalog: withTools(),
      commandResult: installsLinter,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        refused = await post(page, { type: 'pick', kind: 'tool', name: 'fetcher', on: true, command: 'rm -rf ~' });
        selected = page.state();
        await installed(page, 'fetcher', 'linter');
        await done(page);
        received = page.received();
      },
    });

    expect(refused).toBe(400);
    expect(selected?.selected).toEqual([]);
    expect(result.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
    // 页面上有工具的名字和结论，没有命令里的任何一段
    expect(received).toContain('linter');
    for (const part of ['curl', 'install.sh', 'example.com/fetcher', '| sh', 'npm install', '@example/linter']) expect(received).not.toContain(part);
  });

  it('Windows 上另有命令的工具：执行的是那一条', async () => {
    const result = await run({
      catalog: withTools(),
      platform: 'win32',
      env: { PATH: pathWith('claude.CMD').dir, PATHEXT: '.EXE;.CMD' },
      page: async (page) => {
        await installed(page, 'fetcher');
        await done(page);
      },
    });

    expect(result.commands).toEqual([
      { command: 'powershell -ExecutionPolicy ByPass -c "irm https://example.com/fetcher/install.ps1 | iex"', args: [], shell: true },
    ]);
  });
});

describe('网页界面：工具的结论', () => {
  it('成败只看复核：命令非零退出但复核通过是「已可用」，退出状态照实写在后面，计入成功', async () => {
    let batch: RunView | undefined;
    const result = await run({
      catalog: withTools(),
      env: { PATH: pathWith('fetcher').dir },
      commandResult: () => ({ exitCode: 3 }),
      page: async (page) => {
        const listed = await open(page, WEB_SEARCH);
        // 已安装的照样勾得上
        expect(card(listed, 'fetcher')?.statuses).toEqual([{ text: '已安装', tone: 'ready' }]);
        batch = await installed(page, 'fetcher');
        await done(page);
      },
    });

    expect(batch?.rows).toEqual([{ name: 'fetcher', state: 'succeeded', text: '已可用', rest: '在 PATH 中找到 fetcher；命令退出状态 3' }]);
    expect(batch?.totals).toMatchObject({ succeeded: { count: 1 }, failed: { count: 0 } });
    expect(batch?.next).toBeUndefined();
    expect(result.output).toMatch(/✓\s+fetcher\s+已可用，在 PATH 中找到 fetcher；命令退出状态 3$/m);
    expect(result.exitCode).toBe(0);
  });

  it('命令以 0 退出而复核不通过是「失败」；「下一步」说原因看终端里那条命令的输出，不说原有的东西没动', async () => {
    let batch: RunView | undefined;
    const result = await run({
      catalog: withTools(),
      page: async (page) => {
        batch = await installed(page, 'fetcher');
        await done(page);
      },
    });

    expect(batch?.rows).toEqual([
      { name: 'fetcher', state: 'failed', text: '失败', rest: '命令已正常结束，但在 PATH 中找不到 fetcher；可能要重开终端才找得到' },
    ]);
    expect(batch?.totals).toMatchObject({ succeeded: { count: 0 }, failed: { count: 1 } });
    expect(batch?.next).toEqual({ label: '下一步', lines: ['没装上的工具：原因看终端里那条命令自己的输出。排除后点「继续挑选」，重新勾选再装一次。'] });
    expect(squeezed(result.output)).toContain('fetcher失败命令已正常结束，但在PATH中找不到fetcher；可能要重开终端才找得到');
    // 单项失败不改变退出状态
    expect(result.exitCode).toBe(0);
  });

  it('检查方式是路径的工具：装上了写明哪个路径已存在，没装上写明它不存在和命令的退出状态', async () => {
    let fine: RunView | undefined;
    let broken: RunView | undefined;
    await run({
      catalog: withTools(),
      commandResult: installsLinter,
      page: async (page) => {
        fine = await installed(page, 'linter');
        await done(page);
      },
    });
    await run({
      catalog: withTools(),
      commandResult: () => ({ exitCode: 243 }),
      page: async (page) => {
        broken = await installed(page, 'linter');
        await done(page);
      },
    });

    expect(fine?.rows).toEqual([{ name: 'linter', state: 'succeeded', text: '已可用', rest: `${LINTER_SHOWN} 已存在` }]);
    expect(broken?.rows).toEqual([{ name: 'linter', state: 'failed', text: '失败', rest: `命令退出状态 243；${LINTER_SHOWN} 不存在` }]);
  });

  it('命令没能起来：原因里只有错误码，错误的消息和堆栈哪里都不出现；其余的照常装', async () => {
    let batch: RunView | undefined;
    let received = '';
    const result = await run({
      catalog: withTools(),
      commandResult: (command, args, world) =>
        command.startsWith('curl') ? Object.assign(new Error('spawn /bin/sh ENOENT: secret detail'), { code: 'ENOENT' }) : installsLinter(command, args, world),
      page: async (page) => {
        batch = await installed(page, 'fetcher', 'linter');
        await done(page);
        received = page.received();
      },
    });

    expect(batch?.rows).toEqual([
      { name: 'fetcher', state: 'failed', text: '失败', rest: '命令没能运行（ENOENT）；在 PATH 中找不到 fetcher' },
      { name: 'linter', state: 'succeeded', text: '已可用', rest: `${LINTER_SHOWN} 已存在` },
    ]);
    expect(batch?.totals).toMatchObject({ succeeded: { count: 1 }, failed: { count: 1 } });
    expect(result.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
    for (const text of [received, result.output]) {
      expect(text).not.toContain('secret detail');
      expect(text).not.toMatch(STACK_FRAME);
    }
    expect(result.exitCode).toBe(0);
  });
});

describe('网页界面：不可选的工具', () => {
  // 卡片上的原因，和勾它的那个意图的答复
  const refusal = async (options: Parameters<typeof run>[0], name: string): Promise<{ entry: ComponentView | undefined; status: number; selected: unknown[]; commands: unknown[] }> => {
    let entry: ComponentView | undefined;
    let status = 0;
    let selected: unknown[] = [];
    const result = await run({
      ...options,
      page: async (page) => {
        entry = card(await open(page, WEB_SEARCH), name);
        status = await post(page, { type: 'pick', kind: 'tool', name, on: true });
        selected = page.state().selected;
        await done(page);
      },
    });
    return { entry, status, selected, commands: result.commands };
  };

  it('一个宿主都没检测到：每个工具都写「需要 AI Agent」，勾不上', async () => {
    const { entry, status, selected, commands } = await refusal({ catalog: withTools(), onPath: [] }, 'fetcher');

    expect(entry?.unavailable).toBe('需要 AI Agent');
    expect(status).toBe(400);
    expect(selected).toEqual([]);
    expect(commands).toEqual([]);
  });

  it('当前系统不支持：写「不支持 Linux」，勾不上；同一张列表里别的工具照常勾得上', async () => {
    const unsupported = { ...FETCHER, install: { ...FETCHER.install, linux: null } };
    let other: ViewState | undefined;
    const { entry, status, selected } = await refusal({ catalog: withTools(unsupported, LINTER) }, 'fetcher');
    await run({
      catalog: withTools(unsupported, LINTER),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        other = await tick(page, 'linter');
        await done(page);
      },
    });

    expect(entry?.unavailable).toBe('不支持 Linux');
    expect(status).toBe(400);
    expect(selected).toEqual([]);
    expect(other?.selected.map((one) => one.name)).toEqual(['linter']);
  });

  it('它要的宿主一个都没检测到：写「需要别的 AI Agent」，勾不上', async () => {
    const { entry, status, selected } = await refusal({ catalog: withTools({ ...FETCHER, hosts: ['codex'] }, LINTER) }, 'fetcher');

    expect(entry?.unavailable).toBe('需要别的 AI Agent');
    expect(status).toBe(400);
    expect(selected).toEqual([]);
  });

  it('看的是检测到的宿主，不是页面上所选的：去掉它要的宿主、选了项目，工具照常可选，状态不变，已选里不带原因，照常装', async () => {
    let changed: ViewState | undefined;
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: withTools({ ...FETCHER, hosts: ['codex'] }),
      onPath: BOTH_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await page.send({ type: 'host', host: 'codex', on: false });
        await page.send({ type: 'scope', scope: 'project' });
        await page.until((state) => state.target.scope === 'project' && state.target.hosts.length === 1);
        changed = await tick(page, 'fetcher');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(changed?.target.hosts).toEqual(['Claude Code']);
    expect(card(changed, 'fetcher')).toMatchObject({ statuses: [{ text: '未安装', tone: 'faint' }], picked: true });
    expect(card(changed, 'fetcher')?.unavailable).toBeUndefined();
    expect(changed?.selected).toEqual([{ kind: 'tool', name: 'fetcher', type: '工具' }]);
    expect(summary?.entries).toEqual([{ name: 'fetcher', type: '工具', rows: [{ action: '执行安装命令' }] }]);
    // 工具不受安装范围影响：命令还是那一整行，不带运行目录
    expect(result.commands).toEqual([FETCHER_COMMAND]);
  });
});

describe('网页界面：工具和别的组件混在一批里', () => {
  const [, SOLO] = SAMPLE_THIRD_PARTY;
  const [LOCAL] = SAMPLE_MCPS;
  const mixed = (): string =>
    catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: [SOLO], mcps: underWebSearch(LOCAL), tools: underWebSearch(...SAMPLE_TOOLS) } });

  it('工具排在最后：汇总的段、进度的行、执行的命令都是 skill、第三方 Skill、MCP、工具的先后；两个工具按名字', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: mixed(),
      commandResult: installsLinter,
      page: async (page) => {
        // 故意倒着勾：执行的先后不照勾选的先后
        await tick(page, 'linter');
        await tick(page, 'fetcher');
        await page.send({ type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        await page.send({ type: 'pick', kind: 'thirdParty', name: 'solo-notes', on: true });
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await page.until((state) => state.selected.length === 5);
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.title).toBe('将安装 5 项');
    expect(summary?.entries.map((entry) => `${entry.name} · ${entry.type}`)).toEqual(['alpha · Skill', 'solo-notes · 第三方 Skill', 'docs-local · MCP', 'fetcher · 工具', 'linter · 工具']);
    expect(batch?.rows.map((row) => [row.name, row.host])).toEqual([
      ['alpha', 'Claude Code'],
      ['note-taker', 'Claude Code'],
      ['docs-local', 'Claude Code'],
      ['fetcher', undefined],
      ['linter', undefined],
    ]);
    expect(result.commands.map((command) => command.command)).toEqual(['npx', 'claude', FETCHER_COMMAND.command, LINTER_COMMAND.command]);
    expect(batch?.rows.at(-1)).toEqual({ name: 'linter', state: 'succeeded', text: '已可用', rest: `${LINTER_SHOWN} 已存在` });
    // 终端上只有工具的两个分区，别的行不在终端上重复
    expect(result.output.match(/^── .+ ─+$/gm)?.map((line) => line.replace(/[─ ]/g, ''))).toEqual(['fetcher', 'linter']);
    expect(result.output).not.toMatch(/alpha|note-taker|docs-local/);
  });

  it('轮到工具之前它在等待；skill 和工具都有没装上的时「下一步」两句都有，skill 的在前', async () => {
    const command = held();
    let waiting: ViewState | undefined;
    let batch: RunView | undefined;
    await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, tools: underWebSearch(FETCHER) }, content: {} }),
      commandResult: () => command.running,
      page: async (page) => {
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await tick(page, 'fetcher');
        const summary = await review(page);
        // 确认之前就等着：第一份带进度的画面状态里每一项都还在等待
        const first = page.until((state) => state.run !== undefined);
        await page.send({ type: 'install', summary: summary.id });
        waiting = await first;
        await page.until((state) => rowOf(state, 'fetcher')?.state === 'running');
        command.end();
        batch = (await page.until((state) => state.run?.done === true)).run;
        await done(page);
      },
    });

    expect(waiting?.run?.rows).toEqual([
      { name: 'alpha', host: 'Claude Code', state: 'waiting', text: '等待' },
      { name: 'fetcher', state: 'waiting', text: '等待' },
    ]);
    expect(batch?.rows.map((row) => [row.name, row.state])).toEqual([
      ['alpha', 'failed'],
      ['fetcher', 'failed'],
    ]);
    expect(batch?.next?.lines).toEqual([
      '没装上的各项没有改动原有的东西。排除原因后点「继续挑选」，重新勾选再装一次。',
      '没装上的工具：原因看终端里那条命令自己的输出。排除后点「继续挑选」，重新勾选再装一次。',
    ]);
  });
});

describe('网页界面：工具的命令跑着的时候', () => {
  const HINT = /^\s+t 改用终端界面 · Ctrl\+C 退出$/m;

  it('终端上已经有它的分区和那一行命令，没有待命的提问；一批里的工具都跑完后按键提示回来，和上面的结论隔一行', async () => {
    const command = held();
    await run({
      catalog: withTools(),
      commandResult: () => command.running,
      page: async (page, { terminal }) => {
        expect(terminal.screen()).toMatch(HINT);
        await untilRunning(page, 'fetcher');
        expect(terminal.screen()).toMatch(/^── fetcher ─+\n\n\s*\$ curl -LsSf https:\/\/example\.com\/fetcher\/install\.sh \| sh\n$/m);
        // 结论还没有：命令还在跑
        expect(terminal.screen()).not.toMatch(/失败|已可用/);
        expect(terminal.screen()).not.toMatch(/Ctrl\+C/);
        expect(() => terminal.press('t')).toThrow(/没有待命的提问/);
        command.end();
        await page.until((state) => state.run?.done === true);
        expect(terminal.screen()).toMatch(/才找得到\n\n[^\S\n]*t 改用终端界面 · Ctrl\+C 退出$/);
        await done(page);
      },
    });
  });

  it('点了「完成」之后那一行说明落在按键提示原来的位置上，和分区的结论隔一行', async () => {
    const result = await run({
      catalog: withTools(),
      env: { PATH: pathWith('fetcher').dir },
      page: async (page) => {
        await installed(page, 'fetcher');
        await done(page);
      },
    });

    expect(result.screen).toMatch(/已可用，在 PATH 中找到 fetcher\n\n[^\S\n]*网页界面\s+页面上点了「完成」，安装器退出\n$/);
  });

  it('安装中页面关了：命令照样跑完；终端上补打的「结果」分区里有工具的那一行，合计算上它，它的分区只打了一遍', async () => {
    const command = held();
    const result = await run({
      catalog: withTools(),
      commandResult: (text, args, world) => (text.startsWith('curl') ? command.running : installsLinter(text, args, world)),
      page: async (page) => {
        await page.send({ type: 'pick', kind: 'skill', name: 'alpha', on: true });
        await tick(page, 'linter');
        await untilRunning(page, 'fetcher');
        page.close();
        await sleep(PAST_GRACE);
        command.end();
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.commands).toEqual([FETCHER_COMMAND, LINTER_COMMAND]);
    const [live = '', recap = ''] = result.screen.split('页面已关闭；这一批照样装完了，结果如下');
    expect(live.match(/^── .+ ─+$/gm)?.map((line) => line.replace(/[─ ]/g, ''))).toEqual(['fetcher', 'linter']);
    // 补打的是一个「结果」分区：工具的结论和别的行排在一起，没有再打一遍它的分区
    expect(squeezed(recap).replace(/─+/g, '─')).toBe(
      `─结果─✓alphaClaudeCode已安装1.0.0✗fetcher失败命令已正常结束，但在PATH中找不到fetcher；可能要重开终端才找得到✓linter已可用，${LINTER_SHOWN}已存在─合计2成功·1失败·0跳过`,
    );
  });
});

describe('网页界面：只有一个工具的一批，安装中页面关了', () => {
  it('那一句说明下面照样是「结果」分区：工具的那一行和合计', async () => {
    const command = held();
    const result = await run({
      catalog: withTools(),
      commandResult: () => command.running,
      page: async (page) => {
        await untilRunning(page, 'fetcher');
        page.close();
        await sleep(PAST_GRACE);
        command.end();
      },
    });

    expect(result.exitCode).toBe(0);
    const [live = '', recap = ''] = result.screen.split('页面已关闭；这一批照样装完了，结果如下');
    expect(live.match(/^── .+ ─+$/gm)?.map((line) => line.replace(/[─ ]/g, ''))).toEqual(['fetcher']);
    expect(squeezed(recap).replace(/─+/g, '─')).toBe('─结果─✗fetcher失败命令已正常结束，但在PATH中找不到fetcher；可能要重开终端才找得到─合计0成功·1失败·0跳过');
  });
});

describe('网页界面：工具的英文', () => {
  it('换成英文后勾着的工具还在；类型、状态、汇总里的操作、进度里的那句话、结论都是英文', async () => {
    const command = held();
    const path = pathWith();
    let english: ViewState | undefined;
    let summary: SummaryView | undefined;
    let running: ViewState | undefined;
    let batch: RunView | undefined;
    await run({
      catalog: withTools(),
      env: { PATH: path.dir },
      commandResult: () => command.running,
      page: async (page) => {
        await tick(page, 'fetcher');
        await page.send({ type: 'lang', lang: 'en' });
        english = await page.until((state) => state.lang === 'en');
        const row = english.menu.find((candidate) => candidate.name === 'Web search & docs retrieval');
        await page.send({ type: 'open', list: row?.id ?? '' });
        english = await page.until((state) => state.listing?.id === row?.id);
        summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        running = await page.until((state) => rowOf(state, 'fetcher')?.state === 'running');
        path.add('fetcher');
        command.end();
        batch = (await page.until((state) => state.run?.done === true)).run;
        await done(page);
      },
    });

    expect(english?.selected).toEqual([{ kind: 'tool', name: 'fetcher', type: 'Tool' }]);
    expect(card(english, 'fetcher')).toMatchObject({ statuses: [{ text: 'none', tone: 'faint' }], picked: true });
    expect(summary?.entries).toEqual([{ name: 'fetcher', type: 'Tool', rows: [{ action: 'run install command' }] }]);
    expect(rowOf(running as ViewState, 'fetcher')).toEqual({ name: 'fetcher', state: 'running', text: 'this item is installing in your terminal; watch it there', terminal: true });
    expect(batch?.rows).toEqual([{ name: 'fetcher', state: 'succeeded', text: 'available', rest: 'fetcher found on PATH' }]);
  });
});
