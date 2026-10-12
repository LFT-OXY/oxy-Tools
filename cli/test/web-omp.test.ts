// 网页界面里的 omp：都经主接缝，架子扮演浏览器。装到哪、执行哪条命令，和终端界面是同一份（omp.test.ts）
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, PickableKind, RunView, Scope, SummaryView, ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, accept, catalogDir, choose, pick, run, underWebSearch, writeTree, type Page, type RunResult } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const ONLY_OMP = ['omp'];
const SHARED_THREE = ['codex', 'pi', 'omp'];
const ALL_HOSTS = ['claude', 'codex', 'pi', 'omp'];
// 共用 skill 目录：omp 的 skill 和 Codex、Pi 的装进同一个（ADR-0005）
const SHARED_SKILLS = '.agents/skills';
const CLAUDE_SKILLS = '.claude/skills';
const SHARED_NOTICE = 'Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到';
const OMP_MCP_NOTICE = '安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加';
const OMP_MCP_NOTICE_EN = 'The installer cannot install omp MCP servers: use /mcp add in omp';

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
// 勾上一个条目，给出之后的画面状态
const tick = async (page: Page, kind: PickableKind, name: string): Promise<ViewState> => {
  await page.send({ type: 'pick', kind, name, on: true });
  return page.until((state) => state.selected.some((entry) => entry.name === name));
};
// 装进（或不装进）一个宿主，给出之后的画面状态
const host = async (page: Page, id: string, on: boolean): Promise<ViewState> => {
  await page.send({ type: 'host', host: id, on });
  return page.until((state) => state.target.choices.some((choice) => choice.id === id && choice.on === on));
};
const scope = async (page: Page, wanted: Scope): Promise<ViewState> => {
  await page.send({ type: 'scope', scope: wanted });
  return page.until((state) => state.target.scope === wanted);
};
// 不经 page.send 直接发一个意图，给出答复的状态码：用来发那些该被拒绝的
const post = async (page: Page, intent: unknown): Promise<number> => {
  const headers = { 'X-OXY-Token': page.token, 'Content-Type': 'application/json' };
  return (await page.request('/api/intent', { method: 'POST', headers, body: JSON.stringify(intent) })).status;
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
// 正在看的那张列表里名字是它的卡片
const card = (state: ViewState | undefined, name: string): ComponentView | undefined =>
  state?.listing?.sections.flatMap((section) => section.entries).find((entry) => entry.name === name);
// 卡片上每个宿主一段「宿主 词 后面的字」
const statuses = (state: ViewState | undefined, name: string): string[] =>
  (card(state, name)?.statuses ?? []).map((one) => [one.host, one.text, one.rest].filter((part) => part !== undefined).join(' '));
// 正在看的那张列表各区上方的提醒：区的种类 → 那几句
const notices = (state: ViewState | undefined): Record<string, string[]> =>
  Object.fromEntries((state?.listing?.sections ?? []).flatMap((section) => (section.notices ? [[section.kind, section.notices]] : [])));
// 汇总写成几行字：条目 · 类型 · 版本，下面每行 skill/宿主/操作/位置/备注
const rows = (summary: SummaryView | undefined): string[] =>
  (summary?.entries ?? []).flatMap((entry) => [
    [entry.name, entry.type, entry.version].filter((part) => part !== undefined).join(' · '),
    ...entry.rows.map((row) => `  ${[row.skill, row.host, row.action, row.location, row.note].filter((part) => part !== undefined).join(' | ')}`),
  ]);
const outcomes = (batch: RunView | undefined): string[] => (batch?.rows ?? []).map((row) => [row.name, row.host, row.text, row.rest].filter(Boolean).join(' '));
const totals = (batch: RunView | undefined): string =>
  batch?.totals ? [batch.totals.succeeded, batch.totals.failed, batch.totals.skipped].map(({ count, word }) => `${count} ${word}`).join(' · ') : '';
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
const ALPHA_FILES = ['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')];

/** 安装器从头到尾没有碰 omp：没有一条外部命令的命令名是 omp，主目录和项目目录下都没有出现 .omp */
function expectOmpUntouched(result: RunResult): void {
  expect(result.commands.map(({ command }) => command)).not.toContain('omp');
  expect(readdirSync(result.home)).not.toContain('.omp');
  expect(readdirSync(result.project)).not.toContain('.omp');
}

describe('网页界面：检测到 omp', () => {
  it('四个宿主都检测到：本机信息、开场引导和页面顶上的宿主依次是 Claude Code、Codex、Pi、omp，都默认勾着；卡片上每个宿主一段状态', async () => {
    let first: ViewState | undefined;
    await run({
      onPath: ALL_HOSTS,
      page: async (page) => {
        first = page.state();
        await done(page);
      },
    });

    expect(first?.machine.hosts).toEqual([
      { name: 'Claude Code', detected: true },
      { name: 'Codex', detected: true },
      { name: 'Pi', detected: true },
      { name: 'omp', detected: true },
    ]);
    expect(first?.machine.noHosts).toBeUndefined();
    // 开场引导和页面顶上那一条画的是同一份 target；引导起初没答过
    expect(first?.guideAnswered).toBe(false);
    expect(first?.target).toMatchObject({
      hostsLabel: '装进哪些 AI Agent',
      choices: [
        { id: 'claude-code', name: 'Claude Code', on: true },
        { id: 'codex', name: 'Codex', on: true },
        { id: 'pi', name: 'Pi', on: true },
        { id: 'omp', name: 'omp', on: true },
      ],
      hosts: ['Claude Code', 'Codex', 'Pi', 'omp'],
    });
    expect(statuses(first, 'alpha')).toEqual(['Claude Code 未装', 'Codex 未装', 'Pi 未装', 'omp 未装']);
  });

  it('只检测到 omp：没有可改的宿主，另外三个写着未检测到；开场引导照样要答；没有「一个都没检测到」的那句提醒', async () => {
    let first: ViewState | undefined;
    let refused: number | undefined;
    await run({
      onPath: ONLY_OMP,
      page: async (page) => {
        first = page.state();
        refused = await post(page, { type: 'host', host: 'omp', on: false });
        await done(page);
      },
    });

    expect(first?.machine.hosts).toEqual([
      { name: 'Claude Code', detected: false, status: '未检测到' },
      { name: 'Codex', detected: false, status: '未检测到' },
      { name: 'Pi', detected: false, status: '未检测到' },
      { name: 'omp', detected: true },
    ]);
    expect(first?.machine.noHosts).toBeUndefined();
    expect(first?.guideAnswered).toBe(false);
    expect(first?.target).toMatchObject({ choices: [{ id: 'omp', name: 'omp', on: true }], hosts: ['omp'] });
    expect(statuses(first, 'alpha')).toEqual(['omp 未装']);
    expect(refused).toBe(400);
  });
});

describe('网页界面：把本仓库的 skill 装给 omp', () => {
  it('只检测到 omp、装到全局：汇总和结果里宿主是 omp，位置在共用 skill 目录；主目录下只多出 .agents', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: ONLY_OMP,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  omp | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha omp 已安装 1.0.0']);
    expect(filesUnder(join(result.home, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
    expect(JSON.parse(read(result.home, SHARED_SKILLS, 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expectOmpUntouched(result);
  });

  it('只检测到 omp、装到项目：位置是相对项目目录的 .agents/skills，装完落在项目里，主目录里什么都不多', async () => {
    let summary: SummaryView | undefined;
    const result = await run({
      onPath: ONLY_OMP,
      page: async (page) => {
        await scope(page, 'project');
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  omp | 新装 | ${join(SHARED_SKILLS, 'alpha')}`]);
    expect(filesUnder(join(result.project, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
    expect(filesUnder(result.home)).toEqual([]);
    expectOmpUntouched(result);
  });

  it('Codex、Pi、omp 都选了：汇总一行、安装中一行、结果一行，宿主那一格是「Codex、Pi、omp」，合计 1 成功', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: SHARED_THREE,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Codex、Pi、omp | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha Codex、Pi、omp 已安装 1.0.0']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 0 跳过');
    expect(filesUnder(join(result.home, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expectOmpUntouched(result);
  });

  it('四个宿主都选了：每个 skill 两行——Claude Code 一行，「Codex、Pi、omp」一行；卡片上仍是四段状态', async () => {
    let first: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: ALL_HOSTS,
      page: async (page) => {
        first = page.state();
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(statuses(first, 'alpha')).toEqual(['Claude Code 未装', 'Codex 未装', 'Pi 未装', 'omp 未装']);
    expect(rows(summary)).toEqual([
      'alpha · Skill · 1.0.0',
      `  Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'alpha')}`,
      `  Codex、Pi、omp | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`,
    ]);
    expect(outcomes(batch)).toEqual(['alpha Claude Code 已安装 1.0.0', 'alpha Codex、Pi、omp 已安装 1.0.0']);
    expect(totals(batch)).toBe('2 成功 · 0 失败 · 0 跳过');
    expect(readdirSync(result.home).sort()).toEqual(['.agents', '.claude']);
    expectOmpUntouched(result);
  });

  it('英文界面：宿主那一格用英文的并列写法 Codex, Pi, omp', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    await run({
      argv: ['--lang', 'en'],
      onPath: ALL_HOSTS,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual([
      'alpha · Skill · 1.0.0',
      `  Claude Code | new | ${join('~', CLAUDE_SKILLS, 'alpha')}`,
      `  Codex, Pi, omp | new | ${join('~', SHARED_SKILLS, 'alpha')}`,
    ]);
    expect(outcomes(batch)).toEqual(['alpha Claude Code installed 1.0.0', 'alpha Codex, Pi, omp installed 1.0.0']);
  });

  it('只留 omp 时 Skill 那一区也有共用 skill 目录的那句说明', async () => {
    let onlyOmp: ViewState | undefined;
    await run({
      onPath: ['claude', 'omp'],
      page: async (page) => {
        onlyOmp = await host(page, 'claude-code', false);
        await done(page);
      },
    });

    expect(onlyOmp?.target.hosts).toEqual(['omp']);
    expect(notices(onlyOmp)).toEqual({ skill: [SHARED_NOTICE] });
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const thirdParty = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY } });
// 和终端界面的测试同一份写法：skills CLI 不认识 omp，agent 名借用 pi；除了关遥测的两个不另带环境变量
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const soloVia = (agent: string, env: Record<string, string> = {}, where: Scope = 'global') => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', agent, '--yes', ...(where === 'global' ? ['--global'] : [])],
  env: { ...NO_TELEMETRY, ...env },
});
const SKILLS_DIR: Record<string, string> = { 'claude-code': CLAUDE_SKILLS, codex: SHARED_SKILLS, pi: SHARED_SKILLS };
// 假装 skills CLI 装上了：「执行」那条命令时往它该落的位置写出 SKILL.md（装到项目时落在 cwd 下）；不认识的 agent 名什么都不装
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const skillsDir = SKILLS_DIR[args[args.indexOf('--agent') + 1] ?? ''];
  if (skillsDir !== undefined) writeTree(cwd ?? home, { [`${skillsDir}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};
const installSolo = async (page: Page): Promise<{ summary: SummaryView; batch: RunView }> => {
  await open(page, WEB_SEARCH);
  await tick(page, 'thirdParty', 'solo-notes');
  const summary = await review(page);
  return { summary, batch: await install(page, summary) };
};

describe('网页界面：把第三方 Skill 装给 omp', () => {
  it('只检测到 omp、装到全局：汇总里宿主是 omp、位置在共用 skill 目录；复核通过；命令是 --agent pi，和终端界面装它时逐条相同', async () => {
    let seen: { summary: SummaryView; batch: RunView } | undefined;
    const web = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      commandResult: installs,
      page: async (page) => {
        seen = await installSolo(page);
        await done(page);
      },
    });
    const terminal = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(rows(seen?.summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | omp | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`]);
    expect(outcomes(seen?.batch)).toEqual(['note-taker omp 已安装']);
    expect(web.commands).toEqual([soloVia('pi')]);
    expect(web.commands).toEqual(terminal.commands);
    expect(existsSync(join(web.home, SHARED_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
    expectOmpUntouched(web);
  });

  it('只检测到 omp、装到项目：命令不带 --global、在项目目录下运行；复核按项目目录的 .agents/skills', async () => {
    let batch: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      commandResult: installs,
      page: async (page) => {
        await scope(page, 'project');
        batch = (await installSolo(page)).batch;
        await done(page);
      },
    });

    expect(result.commands).toEqual([{ ...soloVia('pi', {}, 'project'), cwd: result.project }]);
    expect(outcomes(batch)).toEqual(['note-taker omp 已安装']);
    expect(existsSync(join(result.project, SHARED_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
    expectOmpUntouched(result);
  });

  it('四个宿主都选了：每个 skill 两行、两条命令——共用 skill 目录的那一条 agent 名取排在最前的 Codex 的', async () => {
    let seen: { summary: SummaryView; batch: RunView } | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      commandResult: installs,
      page: async (page) => {
        seen = await installSolo(page);
        await done(page);
      },
    });

    expect(rows(seen?.summary)).toEqual([
      'solo-notes · 第三方 Skill',
      `  note-taker | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'note-taker')}`,
      `  note-taker | Codex、Pi、omp | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`,
    ]);
    expect(outcomes(seen?.batch)).toEqual(['note-taker Claude Code 已安装', 'note-taker Codex、Pi、omp 已安装']);
    expect(result.commands).toEqual([soloVia('claude-code', { CLAUDE_CONFIG_DIR: '' }), soloVia('codex')]);
    expectOmpUntouched(result);
  });
});

// 「联网搜索与文档检索」下的两个 MCP：docs-local 是本地进程的，tracker-remote 是远程地址的
const withMcps = (extra: object = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), ...extra } });
// 期望值是字面的命令，出处是各宿主的文档（见规范「安装 MCP」的那两张表）
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const PI_ADD_LOCAL = { command: 'pi', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };

describe('网页界面：omp 的 MCP 安装器不装', () => {
  it('四个宿主都选了：卡片上 omp 那一段是最淡的「不支持」，MCP 那一区上方说明原因和出路；卡片照常可选', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
      { host: 'Pi', text: '未配置', tone: 'faint' },
      { host: 'omp', text: '不支持', tone: 'faint' },
    ]);
    expect(card(listed, 'docs-local')).not.toHaveProperty('unavailable');
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
  });

  it('MCP 照常装进别的宿主：汇总和结果里没有 omp 的行，执行的只有别的宿主的命令，和终端界面逐条相同', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const web = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'mcp', 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });
    const terminal = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(rows(summary)).toEqual(['docs-local · MCP', '  Claude Code | 新装', '  Codex | 新装', '  Pi | 新装']);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置', 'docs-local Codex 已配置', 'docs-local Pi 已配置']);
    expect(totals(batch)).toBe('3 成功 · 0 失败 · 0 跳过');
    expect(web.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_ADD_LOCAL]);
    expect(web.commands).toEqual(terminal.commands);
    expectOmpUntouched(web);
  });

  it('那句说明只在选了 omp 时有：去掉 omp 就没有了，勾回来又有；没检测到 omp 时没有', async () => {
    let withOmp: ViewState | undefined;
    let without: ViewState | undefined;
    let again: ViewState | undefined;
    let undetected: ViewState | undefined;
    await run({
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      page: async (page) => {
        withOmp = await open(page, WEB_SEARCH);
        without = await host(page, 'omp', false);
        again = await host(page, 'omp', true);
        await done(page);
      },
    });
    await run({
      catalog: withMcps(),
      onPath: ['claude'],
      page: async (page) => {
        undetected = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(notices(withOmp)).toEqual({ mcp: [OMP_MCP_NOTICE] });
    expect(notices(without)).toEqual({});
    expect(notices(again)).toEqual({ mcp: [OMP_MCP_NOTICE] });
    expect(JSON.stringify(undetected)).not.toContain('安装器装不了');
  });

  it('列表里没有 MCP 时没有那句说明', async () => {
    let first: ViewState | undefined;
    await run({
      onPath: ONLY_OMP,
      page: async (page) => {
        first = page.state();
        await done(page);
      },
    });

    expect(notices(first)).toEqual({ skill: [SHARED_NOTICE] });
    expect(JSON.stringify(first)).not.toContain('安装器装不了');
  });

  it('只检测到 omp：MCP 都不可选，原因是「需要别的 AI Agent」，勾不上；那句说明照样在', async () => {
    let listed: ViewState | undefined;
    let refused: number | undefined;
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_OMP,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        refused = await post(page, { type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({ unavailable: '需要别的 AI Agent', statuses: [{ host: 'omp', text: '不支持', tone: 'faint' }] });
    expect(card(listed, 'tracker-remote')).toMatchObject({ unavailable: '需要别的 AI Agent' });
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
    expect(refused).toBe(400);
    expect(result.commands).toEqual([]);
    expectOmpUntouched(result);
  });

  it('只检测到 omp、装到项目：原因仍是「需要别的 AI Agent」', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(),
      onPath: ONLY_OMP,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await scope(page, 'project');
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({ unavailable: '需要别的 AI Agent' });
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
  });

  it('选了 omp 和 Codex、装到项目：原因照现有的规则是「只能装到全局」；两句说明依次是只能装到全局、omp 的 MCP', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(),
      onPath: ['codex', 'omp'],
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await scope(page, 'project');
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({
      unavailable: '只能装到全局',
      statuses: [
        { host: 'Codex', text: '不支持', tone: 'faint' },
        { host: 'omp', text: '不支持', tone: 'faint' },
      ],
    });
    expect(notices(listed)).toEqual({ mcp: ['Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令', OMP_MCP_NOTICE] });
  });

  it('三句都有时依次是只能装到全局、omp 的 MCP、读不到配置；共用 skill 目录的那一句在 Skill 那一区', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps({ skillPurposes: { alpha: 'web-search' } }),
      onPath: ALL_HOSTS,
      // 项目里 Claude Code 的那份配置读不了：它那一段是未知；Codex 的 MCP 装不到项目
      project: { '.mcp.json': '这不是 JSON' },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await scope(page, 'project');
        await done(page);
      },
    });

    expect(notices(listed)).toEqual({
      skill: [SHARED_NOTICE],
      mcp: ['Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令', OMP_MCP_NOTICE, '读不到 Claude Code 的配置，无法判断哪些 MCP 已配置'],
    });
  });

  it('omp 自己的配置文件不读也不写：它写坏了不提，装完原样留着', async () => {
    const before = { '.omp/agent/mcp.json': '这不是 JSON' };
    let listed: ViewState | undefined;
    const result = await run({
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      home: before,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        await tick(page, 'mcp', 'docs-local');
        await install(page, await review(page));
        await done(page);
      },
    });

    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(filesUnder(join(result.home, '.omp'))).toEqual(['agent', join('agent', 'mcp.json')]);
    expect(read(result.home, '.omp', 'agent', 'mcp.json')).toBe(before['.omp/agent/mcp.json']);
  });

  it('英文界面：那一段是 unsupported，那句说明和不可选的原因都是英文', async () => {
    let both: ViewState | undefined;
    let onlyOmp: ViewState | undefined;
    await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      page: async (page) => {
        both = await open(page, 'Web search & docs retrieval');
        onlyOmp = await host(page, 'claude-code', false);
        await done(page);
      },
    });

    expect(card(both, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: 'none', tone: 'faint' },
      { host: 'omp', text: 'unsupported', tone: 'faint' },
    ]);
    expect(notices(both)).toEqual({ mcp: [OMP_MCP_NOTICE_EN] });
    expect(card(onlyOmp, 'docs-local')).toMatchObject({ unavailable: 'needs another AI Agent' });
  });
});
