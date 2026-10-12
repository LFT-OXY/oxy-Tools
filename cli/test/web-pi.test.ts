// 网页界面里的 Pi：都经主接缝，架子扮演浏览器。装到哪、执行哪条命令、MCP 怎么说，和终端界面是同一份（pi.test.ts）
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, RunView, Scope, SummaryView, ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, catalogDir, choose, pick, run, underWebSearch, writeTree, type Page } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const ONLY_PI = ['pi'];
const ALL_HOSTS = ['claude', 'codex', 'pi'];
// 共用 skill 目录：Pi 的 skill 装进 Codex 已经在用的那一个（ADR-0005）
const SHARED_SKILLS = '.agents/skills';
const CLAUDE_SKILLS = '.claude/skills';

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
const tick = async (page: Page, kind: 'skill' | 'thirdParty' | 'mcp', name: string): Promise<ViewState> => {
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
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});

describe('网页界面：检测到 Pi', () => {
  it('三个宿主都检测到：本机信息、开场引导和页面顶上的宿主依次是 Claude Code、Codex、Pi，都默认勾着；卡片上每个宿主一段状态', async () => {
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
      ],
      hosts: ['Claude Code', 'Codex', 'Pi'],
    });
    expect(statuses(first, 'alpha')).toEqual(['Claude Code 未装', 'Codex 未装', 'Pi 未装']);
  });

  it('只检测到 Pi：没有可改的宿主，另外两个写着未检测到；开场引导照样要答；没有「一个都没检测到」的那句提醒', async () => {
    let first: ViewState | undefined;
    let refused: number | undefined;
    await run({
      onPath: ONLY_PI,
      page: async (page) => {
        first = page.state();
        refused = await post(page, { type: 'host', host: 'pi', on: false });
        await done(page);
      },
    });

    expect(first?.machine.hosts).toEqual([
      { name: 'Claude Code', detected: false, status: '未检测到' },
      { name: 'Codex', detected: false, status: '未检测到' },
      { name: 'Pi', detected: true },
    ]);
    expect(first?.machine.noHosts).toBeUndefined();
    expect(first?.guideAnswered).toBe(false);
    expect(first?.target).toMatchObject({ choices: [{ id: 'pi', name: 'Pi', on: true }], hosts: ['Pi'] });
    expect(statuses(first, 'alpha')).toEqual(['Pi 未装']);
    expect(refused).toBe(400);
  });

  it('一个宿主都没检测到：那句提醒把三个名字都列出来，中英文各一句', async () => {
    let zh: ViewState | undefined;
    let en: ViewState | undefined;
    await run({
      onPath: [],
      page: async (page) => {
        zh = page.state();
        await page.send({ type: 'lang', lang: 'en' });
        en = await page.until((state) => state.lang === 'en');
        await done(page);
      },
    });

    expect(zh?.machine.noHosts).toBe('没有检测到 Claude Code、Codex 或 Pi，暂时装不了组件');
    expect(en?.machine.noHosts).toBe('Claude Code, Codex and Pi not detected; components cannot be installed');
    expect(en?.machine.hosts).toEqual([
      { name: 'Claude Code', detected: false, status: 'not detected' },
      { name: 'Codex', detected: false, status: 'not detected' },
      { name: 'Pi', detected: false, status: 'not detected' },
    ]);
  });
});

describe('网页界面：把本仓库的 skill 装给 Pi', () => {
  it('三个宿主里只留 Pi：状态只剩它的，汇总和结果里宿主是 Pi，装的东西只进共用 skill 目录、带安装标记', async () => {
    let onlyPi: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: ALL_HOSTS,
      page: async (page) => {
        await host(page, 'claude-code', false);
        onlyPi = await host(page, 'codex', false);
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(onlyPi?.target.hosts).toEqual(['Pi']);
    expect(statuses(onlyPi, 'alpha')).toEqual(['Pi 未装']);
    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Pi | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha Pi 已安装 1.0.0']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 0 跳过');
    expect(JSON.parse(read(result.home, SHARED_SKILLS, 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expect(result.commands).toEqual([]);
  });

  it('只检测到 Pi、装到项目：位置是相对项目目录的 .agents/skills，装完落在项目里，主目录里什么都不多', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: ONLY_PI,
      page: async (page) => {
        await scope(page, 'project');
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Pi | 新装 | ${join(SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha Pi 已安装 1.0.0']);
    expect(existsSync(join(result.project, SHARED_SKILLS, 'alpha', '.oxy-tools.json'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('四种状态看的是共用 skill 目录；不是本工具装的要逐项决定，缺省不覆盖——目录原样、结果是跳过', async () => {
    let managed: ViewState | undefined;
    let other: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    await run({
      onPath: ONLY_PI,
      home: { ...installed(SHARED_SKILLS, 'alpha', '1.0.0'), ...installed(SHARED_SKILLS, 'beta-pack', '2.0') },
      page: async (page) => {
        managed = page.state();
        await done(page);
      },
    });
    const result = await run({
      onPath: ONLY_PI,
      home: { [`${SHARED_SKILLS}/beta-pack/SKILL.md`]: '用户自己手动放的\n' },
      page: async (page) => {
        other = page.state();
        await tick(page, 'skill', 'beta-pack');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(statuses(managed, 'alpha')).toEqual(['Pi 已装 1.0.0']);
    expect(statuses(managed, 'beta-pack')).toEqual(['Pi 2.0 → 2.3']);
    expect(statuses(other, 'alpha')).toEqual(['Pi 未装']);
    expect(statuses(other, 'beta-pack')).toEqual(['Pi 非本工具安装']);
    expect(summary?.entries[0]?.rows).toEqual([
      {
        host: 'Pi',
        action: '覆盖',
        overwrites: true,
        location: join('~', SHARED_SKILLS, 'beta-pack'),
        note: '非本工具安装',
        overwrite: { id: expect.any(String), agreed: false },
      },
    ]);
    expect(outcomes(batch)).toEqual(['beta-pack Pi 跳过 未同意覆盖，保持原样']);
    expect(filesUnder(join(result.home, SHARED_SKILLS, 'beta-pack'))).toEqual(['SKILL.md']);
    expect(read(result.home, SHARED_SKILLS, 'beta-pack', 'SKILL.md')).toBe('用户自己手动放的\n');
  });

  it('同意覆盖之后整目录替换', async () => {
    const result = await run({
      onPath: ONLY_PI,
      home: { [`${SHARED_SKILLS}/beta-pack/SKILL.md`]: '用户自己手动放的\n', [`${SHARED_SKILLS}/beta-pack/mine.txt`]: '用户的文件\n' },
      page: async (page) => {
        await tick(page, 'skill', 'beta-pack');
        const summary = await review(page);
        await page.send({ type: 'overwrite', item: summary.entries[0]?.rows[0]?.overwrite?.id ?? '', on: true });
        const agreed = await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true);
        await install(page, agreed.summary as SummaryView);
        await done(page);
      },
    });

    expect(filesUnder(join(result.home, SHARED_SKILLS, 'beta-pack'))).toEqual(['.oxy-tools.json', 'SKILL.md']);
    expect(read(result.home, SHARED_SKILLS, 'beta-pack', 'SKILL.md')).toBe('# beta-pack\n');
  });

  it('英文界面：宿主的名字不变，状态词、汇总和结果是英文', async () => {
    let state: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    await run({
      argv: ['--lang', 'en'],
      onPath: ONLY_PI,
      home: installed(SHARED_SKILLS, 'beta-pack', '2.0'),
      page: async (page) => {
        state = page.state();
        await tick(page, 'skill', 'beta-pack');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(state?.machine.hosts).toEqual([
      { name: 'Claude Code', detected: false, status: 'not detected' },
      { name: 'Codex', detected: false, status: 'not detected' },
      { name: 'Pi', detected: true },
    ]);
    expect(statuses(state, 'alpha')).toEqual(['Pi none']);
    expect(rows(summary)).toEqual(['beta-pack · Skill · 2.3', `  Pi | overwrite | ${join('~', SHARED_SKILLS, 'beta-pack')} | 2.0 → 2.3`]);
    expect(outcomes(batch)).toEqual(['beta-pack Pi installed 2.0 → 2.3']);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const thirdParty = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY } });
// 和终端界面的测试同一份写法：agent 名是 pi，除了关遥测的两个不另带环境变量
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const soloIntoPi = (where: Scope = 'global') => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'pi', '--yes', ...(where === 'global' ? ['--global'] : [])],
  env: NO_TELEMETRY,
});
const SKILLS_DIR: Record<string, string> = { 'claude-code': CLAUDE_SKILLS, codex: SHARED_SKILLS, pi: SHARED_SKILLS };
// 假装 skills CLI 装上了：「执行」那条命令时往它该落的位置写出 SKILL.md（装到项目时落在 cwd 下）
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const agent = args[args.indexOf('--agent') + 1] ?? '';
  writeTree(cwd ?? home, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};

describe('网页界面：把第三方 Skill 装给 Pi', () => {
  it('装到全局：汇总里宿主是 Pi、位置在共用 skill 目录；结果「已安装」；命令和终端界面装它时逐条相同', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const web = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });
    const terminal = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(rows(summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Pi | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`]);
    expect(outcomes(batch)).toEqual(['note-taker Pi 已安装']);
    expect(web.commands).toEqual([soloIntoPi()]);
    expect(web.commands).toEqual(terminal.commands);
    expect(existsSync(join(web.home, SHARED_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
  });

  it('装到项目：命令不带 --global、在项目目录下运行；复核按项目目录的 .agents/skills，主目录里什么都不多', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await scope(page, 'project');
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Pi | 新装 | ${join(SHARED_SKILLS, 'note-taker')}`]);
    expect(result.commands).toEqual([{ ...soloIntoPi('project'), cwd: result.project }]);
    expect(outcomes(batch)).toEqual(['note-taker Pi 已安装']);
    expect(existsSync(join(result.project, SHARED_SKILLS, 'note-taker', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('命令结束了但共用 skill 目录里没有 SKILL.md：判失败', async () => {
    let batch: RunView | undefined;
    await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: (_, __, { home }) => void writeTree(home, { '.pi/agent/skills/note-taker/SKILL.md': '# note-taker\n' }),
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        batch = await install(page, await review(page));
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['note-taker Pi 失败 安装命令已结束，但目标位置没有 SKILL.md']);
  });
});

// 样例的两个 MCP 在同一个用途下
const withMcps = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS) } });
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };

// Pi 的适配还没有 MCP 配置：它的 MCP 安装器不装
describe('网页界面：Pi 的 MCP 安装器不装', () => {
  it('只检测到 Pi：MCP 不可选，原因是「需要别的 AI Agent」，勾不上；选了项目也是这一句；那一区没有提醒', async () => {
    let listed: ViewState | undefined;
    let inProject: ViewState | undefined;
    let refused: number | undefined;
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        refused = await post(page, { type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        inProject = await scope(page, 'project');
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({ unavailable: '需要别的 AI Agent', statuses: [{ host: 'Pi', text: '不支持', tone: 'faint' }] });
    expect(card(inProject, 'docs-local')).toMatchObject({ unavailable: '需要别的 AI Agent', statuses: [{ host: 'Pi', text: '不支持', tone: 'faint' }] });
    expect(JSON.stringify([listed, inProject])).not.toContain('只能装到全局');
    expect(refused).toBe(400);
    expect(result.commands).toEqual([]);
  });

  it('留着 Claude Code 和 Pi：Pi 那一段是「不支持」，照常勾得上；只装进 Claude Code，汇总和结果里没有 Pi，没有一条 pi 命令', async () => {
    let listed: ViewState | undefined;
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await host(page, 'codex', false);
        await tick(page, 'mcp', 'docs-local');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(statuses(listed, 'docs-local')).toEqual(['Claude Code 未配置', 'Pi 不支持']);
    expect(card(listed, 'docs-local')?.unavailable).toBeUndefined();
    expect(rows(summary)).toEqual(['docs-local · MCP', '  Claude Code | 新装']);
    expect(outcomes(batch)).toEqual(['docs-local Claude Code 已配置']);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('英文界面：那一段和不可选的原因都是英文', async () => {
    let listed: ViewState | undefined;
    await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ONLY_PI,
      page: async (page) => {
        listed = await open(page, 'Web search & docs retrieval');
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({ unavailable: 'needs another AI Agent', statuses: [{ host: 'Pi', text: 'unsupported', tone: 'faint' }] });
  });
});
