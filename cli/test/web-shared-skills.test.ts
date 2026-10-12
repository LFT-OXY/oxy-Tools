// 网页界面里的共用 skill 目录：都经主接缝，架子扮演浏览器。装什么、执行哪条命令，和终端界面是同一份（shared-skills.test.ts）
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComponentView, RunView, Scope, SummaryView, ViewState } from '../src/web-protocol.ts';
import {
  EMPTY_CATALOG,
  SAMPLE_APPS,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  accept,
  catalogDir,
  choose,
  pick,
  run,
  underWebSearch,
  writeTree,
  type Page,
} from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const CODEX_AND_PI = ['codex', 'pi'];
const ALL_HOSTS = ['claude', 'codex', 'pi'];
const SHARED_SKILLS = '.agents/skills';
const CLAUDE_SKILLS = '.claude/skills';
const NOTICE = 'Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到';
const NOTICE_EN = 'Codex, Pi and omp share one skill folder: install for one and the other two see it too';

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
const tick = async (page: Page, kind: 'skill' | 'thirdParty', name: string): Promise<ViewState> => {
  await page.send({ type: 'pick', kind, name, on: true });
  return page.until((state) => state.selected.some((entry) => entry.name === name));
};
const host = async (page: Page, id: string, on: boolean): Promise<ViewState> => {
  await page.send({ type: 'host', host: id, on });
  return page.until((state) => state.target.choices.some((choice) => choice.id === id && choice.on === on));
};
const scope = async (page: Page, wanted: Scope): Promise<ViewState> => {
  await page.send({ type: 'scope', scope: wanted });
  return page.until((state) => state.target.scope === wanted);
};
const review = async (page: Page): Promise<SummaryView> => {
  await page.send({ type: 'review' });
  return (await page.until((state) => state.summary !== undefined)).summary as SummaryView;
};
const install = async (page: Page, summary: SummaryView): Promise<RunView> => {
  await page.send({ type: 'install', summary: summary.id });
  return (await page.until((state) => state.run?.done === true)).run as RunView;
};
const card = (state: ViewState | undefined, name: string): ComponentView | undefined =>
  state?.listing?.sections.flatMap((section) => section.entries).find((entry) => entry.name === name);
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
// 正在看的那张列表各区上方的提醒：区的种类 → 那几句
const notices = (state: ViewState | undefined): Record<string, string[]> =>
  Object.fromEntries((state?.listing?.sections ?? []).flatMap((section) => (section.notices ? [[section.kind, section.notices]] : [])));
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
const ALPHA_FILES = ['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')];

describe('网页界面：同时选了 Codex 和 Pi，本仓库的 skill 只装一次', () => {
  it('汇总一行、安装中一行、结果一行，宿主那一格是「Codex、Pi」，合计 1 成功；共用 skill 目录下只写一次', async () => {
    let summary: SummaryView | undefined;
    let installing: RunView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: CODEX_AND_PI,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        await page.send({ type: 'install', summary: summary.id });
        installing = (await page.until((state) => state.run !== undefined)).run;
        batch = (await page.until((state) => state.run?.done === true)).run;
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Codex、Pi | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`]);
    expect(installing?.rows.map((row) => [row.name, row.host])).toEqual([['alpha', 'Codex、Pi']]);
    expect(outcomes(batch)).toEqual(['alpha Codex、Pi 已安装 1.0.0']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 0 跳过');
    expect(filesUnder(join(result.home, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
    expect(readdirSync(result.home)).toEqual(['.agents']);
  });

  it('三个宿主都选了：每个 skill 两行——Claude Code 一行，「Codex、Pi」一行；两个目录各有内容和各自的安装标记', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
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
      `  Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'alpha')}`,
      `  Codex、Pi | 新装 | ${join('~', SHARED_SKILLS, 'alpha')}`,
    ]);
    expect(outcomes(batch)).toEqual(['alpha Claude Code 已安装 1.0.0', 'alpha Codex、Pi 已安装 1.0.0']);
    expect(totals(batch)).toBe('2 成功 · 0 失败 · 0 跳过');
    expect(JSON.parse(read(result.home, CLAUDE_SKILLS, 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(JSON.parse(read(result.home, SHARED_SKILLS, 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
  });

  it('装到项目时同样归组：位置是相对项目目录的 .agents/skills，主目录里什么都不多', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: CODEX_AND_PI,
      page: async (page) => {
        await scope(page, 'project');
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Codex、Pi | 新装 | ${join(SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha Codex、Pi 已安装 1.0.0']);
    expect(filesUnder(join(result.project, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('卡片上每个所选的宿主仍各有一段状态；Codex 和 Pi 两段写的一样', async () => {
    let first: ViewState | undefined;
    await run({
      onPath: ALL_HOSTS,
      home: { [`${SHARED_SKILLS}/beta-pack/SKILL.md`]: '用户自己手动放的\n' },
      page: async (page) => {
        first = page.state();
        await done(page);
      },
    });

    expect(statuses(first, 'beta-pack')).toEqual(['Claude Code 未装', 'Codex 非本工具安装', 'Pi 非本工具安装']);
  });

  it('英文界面：宿主那一格用英文的并列写法 Codex, Pi', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    await run({
      argv: ['--lang', 'en'],
      onPath: CODEX_AND_PI,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['alpha · Skill · 1.0.0', `  Codex, Pi | new | ${join('~', SHARED_SKILLS, 'alpha')}`]);
    expect(outcomes(batch)).toEqual(['alpha Codex, Pi installed 1.0.0']);
    expect(totals(batch)).toBe('1 succeeded · 0 failed · 0 skipped');
  });
});

describe('网页界面：共用 skill 目录里已有不是本工具装的同名 skill', () => {
  const mine = { [`${SHARED_SKILLS}/alpha/SKILL.md`]: '用户自己写的\n' };

  it('汇总里只有一处要决定覆盖不覆盖，缺省不覆盖；不同意时这一行是跳过，目录原样', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      onPath: CODEX_AND_PI,
      home: mine,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.entries.flatMap((entry) => entry.rows)).toEqual([
      {
        host: 'Codex、Pi',
        action: '覆盖',
        overwrites: true,
        location: join('~', SHARED_SKILLS, 'alpha'),
        note: '非本工具安装',
        overwrite: { id: expect.any(String), agreed: false },
      },
    ]);
    expect(outcomes(batch)).toEqual(['alpha Codex、Pi 跳过 未同意覆盖，保持原样']);
    expect(totals(batch)).toBe('0 成功 · 0 失败 · 1 跳过');
    expect(read(result.home, SHARED_SKILLS, 'alpha', 'SKILL.md')).toBe('用户自己写的\n');
  });

  it('同意那一处之后整目录替换，结果一行', async () => {
    let batch: RunView | undefined;
    const result = await run({
      onPath: CODEX_AND_PI,
      home: mine,
      page: async (page) => {
        await tick(page, 'skill', 'alpha');
        const summary = await review(page);
        await page.send({ type: 'overwrite', item: summary.entries[0]?.rows[0]?.overwrite?.id ?? '', on: true });
        const agreed = await page.until((state) => state.summary?.entries[0]?.rows[0]?.overwrite?.agreed === true);
        batch = await install(page, agreed.summary as SummaryView);
        await done(page);
      },
    });

    expect(outcomes(batch)).toEqual(['alpha Codex、Pi 已安装 1.0.0']);
    expect(filesUnder(join(result.home, SHARED_SKILLS, 'alpha'))).toEqual(ALPHA_FILES);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (entries: unknown[] = SAMPLE_THIRD_PARTY): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: entries } });
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const soloInto = (agent: string, env: Record<string, string> = {}) => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', agent, '--yes', '--global'],
  env: { ...NO_TELEMETRY, ...env },
});
const SKILLS_DIR: Record<string, string> = { 'claude-code': CLAUDE_SKILLS, codex: SHARED_SKILLS, pi: SHARED_SKILLS };
// 假装 skills CLI 装上了：「执行」那条命令时往它该落的位置写出 SKILL.md（装到项目时落在 cwd 下）
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const agent = args[args.indexOf('--agent') + 1] ?? '';
  writeTree(cwd ?? home, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};

describe('网页界面：同时选了 Codex 和 Pi，第三方 Skill 只执行一条命令', () => {
  it('汇总和结果各一行「Codex、Pi」；执行的那一条 agent 名是 codex，和终端界面装它时逐条相同', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const web = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
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
      onPath: CODEX_AND_PI,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(rows(summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Codex、Pi | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`]);
    expect(outcomes(batch)).toEqual(['note-taker Codex、Pi 已安装']);
    expect(totals(batch)).toBe('1 成功 · 0 失败 · 0 跳过');
    expect(web.commands).toEqual([soloInto('codex')]);
    expect(web.commands).toEqual(terminal.commands);
  });

  it('三个宿主都选了：每个 skill 两行、两条命令', async () => {
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual([
      'solo-notes · 第三方 Skill',
      `  note-taker | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'note-taker')}`,
      `  note-taker | Codex、Pi | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`,
    ]);
    expect(result.commands).toEqual([soloInto('claude-code', { CLAUDE_CONFIG_DIR: '' }), soloInto('codex')]);
  });

  it('条目只支持 Pi：这一组里只算 Pi——宿主那一格只写 Pi，命令的 agent 名是 pi', async () => {
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: CODEX_AND_PI,
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Pi | 新装 | ${join('~', SHARED_SKILLS, 'note-taker')}`]);
    expect(result.commands).toEqual([soloInto('pi')]);
  });

  it('条目只支持 Claude Code、三个宿主都选了：没有共用 skill 目录的那一行', async () => {
    let summary: SummaryView | undefined;
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['claude-code'] }]),
      onPath: ALL_HOSTS,
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        await install(page, summary);
        await done(page);
      },
    });

    expect(rows(summary)).toEqual(['solo-notes · 第三方 Skill', `  note-taker | Claude Code | 新装 | ${join('~', CLAUDE_SKILLS, 'note-taker')}`]);
    expect(result.commands).toEqual([soloInto('claude-code', { CLAUDE_CONFIG_DIR: '' })]);
  });

  it('共用 skill 目录里已有同名目录：汇总里只有一处要决定，缺省不覆盖，那条命令不执行', async () => {
    let summary: SummaryView | undefined;
    let batch: RunView | undefined;
    const result = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
      home: { [`${SHARED_SKILLS}/note-taker/notes.txt`]: '用户自己放的\n' },
      commandResult: installs,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await tick(page, 'thirdParty', 'solo-notes');
        summary = await review(page);
        batch = await install(page, summary);
        await done(page);
      },
    });

    expect(summary?.entries.flatMap((entry) => entry.rows.filter((row) => row.overwrite !== undefined))).toHaveLength(1);
    expect(outcomes(batch)).toEqual(['note-taker Codex、Pi 跳过 未同意覆盖，保持原样']);
    expect(result.commands).toEqual([]);
  });
});

describe('网页界面：共用 skill 目录的那句说明', () => {
  it('选了 Codex、Pi 之一且列表里有 skill：在 Skill 那一区的提醒里；只留 Claude Code 就没有了', async () => {
    let all: ViewState | undefined;
    let onlyPi: ViewState | undefined;
    let onlyClaude: ViewState | undefined;
    await run({
      onPath: ALL_HOSTS,
      page: async (page) => {
        all = page.state();
        await host(page, 'claude-code', false);
        onlyPi = await host(page, 'codex', false);
        await host(page, 'claude-code', true);
        onlyClaude = await host(page, 'pi', false);
        await done(page);
      },
    });

    expect(notices(all)).toEqual({ skill: [NOTICE] });
    expect(notices(onlyPi)).toEqual({ skill: [NOTICE] });
    expect(onlyClaude?.target.hosts).toEqual(['Claude Code']);
    expect(notices(onlyClaude)).toEqual({});
  });

  it('只检测到 Claude Code 时没有', async () => {
    let first: ViewState | undefined;
    await run({
      onPath: ['claude'],
      page: async (page) => {
        first = page.state();
        await done(page);
      },
    });

    expect(notices(first)).toEqual({});
    expect(JSON.stringify(first)).not.toContain('共用同一个');
  });

  it('列表里既有 skill 又有第三方 Skill：只在排在前面的 Skill 那一区说一次；只有第三方 Skill 时在它那一区', async () => {
    let both: ViewState | undefined;
    let only: ViewState | undefined;
    await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, skillPurposes: { alpha: 'web-search' } } }),
      onPath: ['pi'],
      page: async (page) => {
        both = await open(page, WEB_SEARCH);
        await done(page);
      },
    });
    await run({
      catalog: thirdParty(),
      onPath: ['pi'],
      page: async (page) => {
        only = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(both?.listing?.sections.map((section) => section.kind)).toEqual(['skill', 'thirdParty']);
    expect(notices(both)).toEqual({ skill: [NOTICE] });
    expect(notices(only)).toEqual({ thirdParty: [NOTICE] });
  });

  it('列表里只有 MCP、工具、外部项目时没有', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: catalogDir({
        index: { version: 1, skills: [] },
        catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), tools: underWebSearch(...SAMPLE_TOOLS), apps: SAMPLE_APPS },
      }),
      onPath: CODEX_AND_PI,
      page: async (page) => {
        state = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(state?.listing?.sections.map((section) => section.kind)).toEqual(['mcp', 'tool']);
    expect(JSON.stringify(state)).not.toContain('共用同一个');
  });

  it('MCP 那一区的提醒照旧在它自己那一区，不和这一句混在一起', async () => {
    let state: ViewState | undefined;
    await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      onPath: ALL_HOSTS,
      home: { '.codex/config.toml': '这不是 TOML =\n' },
      page: async (page) => {
        state = await open(page, WEB_SEARCH);
        await done(page);
      },
    });

    expect(notices(state)).toEqual({ skill: [NOTICE], mcp: ['读不到 Codex 的配置，无法判断哪些 MCP 已配置'] });
  });

  it('英文界面有对应的一句', async () => {
    let state: ViewState | undefined;
    await run({
      argv: ['--lang', 'en'],
      onPath: ['pi'],
      page: async (page) => {
        state = page.state();
        await done(page);
      },
    });

    expect(notices(state)).toEqual({ skill: [NOTICE_EN] });
  });
});
