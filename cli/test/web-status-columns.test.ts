// 网页界面里卡片底部的状态按 skill 目录归组（任务 10-12-installer-add-pi-omp-hosts 工单 06）：Skill 和第三方 Skill 一组一段，
// 共用同一个 skill 目录的几个宿主合成一段、段名把它们的名字并列起来；MCP 每个装得了 MCP 的宿主一段，没有 omp 的那一段。
// 都经主接缝，架子扮演浏览器：状态随画面状态发给页面，页面不自己归组。终端界面那一边在 status-columns.test.ts
import { describe, expect, it } from 'vitest';
import type { ComponentView, PickableKind, Scope, ViewState } from '../src/web-protocol.ts';
import { EMPTY_CATALOG, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, catalogDir, run, underWebSearch, type Page } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const WEB_SEARCH_EN = 'Web search & docs retrieval';
const ALL_HOSTS = ['claude', 'codex', 'pi', 'omp'];
const OMP_MCP_NOTICE = '安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加';

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
// 正在看的那张列表里名字是它的卡片
const card = (state: ViewState | undefined, name: string): ComponentView | undefined =>
  state?.listing?.sections.flatMap((section) => section.entries).find((entry) => entry.name === name);
const written = (segments: ComponentView['statuses'] | undefined): string[] =>
  (segments ?? []).map((one) => [one.host, one.text, one.rest].filter((part) => part !== undefined).join(' '));
// 卡片底部的状态：每一段「段名 词 后面的字」
const statuses = (state: ViewState | undefined, name: string): string[] => written(card(state, name)?.statuses);
// 含多个 skill 的条目里某个 skill 的小格
const choiceStatuses = (state: ViewState | undefined, entry: string, skill: string): string[] =>
  written(card(state, entry)?.skills?.entries.find((one) => one.name === skill)?.statuses);
// 正在看的那张列表各区上方的提醒：区的种类 → 那几句
const notices = (state: ViewState | undefined): Record<string, string[]> =>
  Object.fromEntries((state?.listing?.sections ?? []).flatMap((section) => (section.notices ? [[section.kind, section.notices]] : [])));
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});
// 打开页面看到的第一份画面状态：正在看的是「推荐」，里面是本仓库的两个 skill
const firstState = async (options: Parameters<typeof run>[0]): Promise<ViewState | undefined> => {
  let first: ViewState | undefined;
  await run({
    ...options,
    page: async (page) => {
      first = page.state();
      await done(page);
    },
  });
  return first;
};

describe('网页界面：Skill 的状态一组一段', () => {
  // 共用 skill 目录里 alpha 是本工具装的、版本一致；Claude Code 的目录里什么都没有
  const home = installed('.agents/skills', 'alpha', '1.0.0');

  it('选了 Codex 和 Pi：合成一段「Codex、Pi」，状态只写一份', async () => {
    const first = await firstState({ onPath: ['codex', 'pi'], home });

    expect(first?.target.hosts).toEqual(['Codex', 'Pi']);
    expect(card(first, 'alpha')?.statuses).toEqual([{ host: 'Codex、Pi', text: '已装', tone: 'ready', rest: '1.0.0' }]);
    expect(statuses(first, 'beta-pack')).toEqual(['Codex、Pi 未装']);
  });

  it('选了 Claude Code、Codex、Pi：「Claude Code」「Codex、Pi」两段', async () => {
    const first = await firstState({ onPath: ['claude', 'codex', 'pi'], home });

    expect(statuses(first, 'alpha')).toEqual(['Claude Code 未装', 'Codex、Pi 已装 1.0.0']);
  });

  it('四个宿主都选了：「Claude Code」「Codex、Pi、omp」两段', async () => {
    const first = await firstState({ onPath: ALL_HOSTS, home });

    expect(first?.target.hosts).toEqual(['Claude Code', 'Codex', 'Pi', 'omp']);
    expect(statuses(first, 'alpha')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 已装 1.0.0']);
    expect(statuses(first, 'beta-pack')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 未装']);
  });

  it('在页面上改了宿主，段跟着重新归：去掉 Codex 剩「Pi、omp」，再去掉 Pi 剩「omp」，只留 Claude Code 和 omp 是各一段', async () => {
    const seen: (ViewState | undefined)[] = [];
    await run({
      onPath: ALL_HOSTS,
      home,
      page: async (page) => {
        seen.push(await host(page, 'codex', false));
        seen.push(await host(page, 'pi', false));
        seen.push(await host(page, 'claude-code', false));
        await done(page);
      },
    });

    expect(seen.map((state) => statuses(state, 'alpha'))).toEqual([
      ['Claude Code 未装', 'Pi、omp 已装 1.0.0'],
      ['Claude Code 未装', 'omp 已装 1.0.0'],
      ['omp 已装 1.0.0'],
    ]);
  });

  it('只检测到 Claude Code、检测到 Claude Code 和 Codex：和原来一样是每个宿主一段', async () => {
    const one = await firstState({ onPath: ['claude'], home: installed('.claude/skills', 'alpha', '1.0.0') });
    const two = await firstState({ onPath: ['claude', 'codex'], home });

    expect(card(one, 'alpha')?.statuses).toEqual([{ host: 'Claude Code', text: '已装', tone: 'ready', rest: '1.0.0' }]);
    expect(statuses(two, 'alpha')).toEqual(['Claude Code 未装', 'Codex 已装 1.0.0']);
  });

  it('一段里的状态看的是那个目录：未装、已装、版本不同、不是本工具装的', async () => {
    const managed = await firstState({ onPath: ALL_HOSTS, home: { ...home, ...installed('.agents/skills', 'beta-pack', '2.0') } });
    const unmanaged = await firstState({ onPath: ALL_HOSTS, home: { '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的\n' } });

    expect(card(managed, 'alpha')?.statuses[1]).toEqual({ host: 'Codex、Pi、omp', text: '已装', tone: 'ready', rest: '1.0.0' });
    expect(card(managed, 'beta-pack')?.statuses[1]).toEqual({ host: 'Codex、Pi、omp', text: '2.0 → 2.3', tone: 'attention' });
    expect(card(unmanaged, 'alpha')?.statuses[1]).toEqual({ host: 'Codex、Pi、omp', text: '未装', tone: 'faint' });
    expect(card(unmanaged, 'beta-pack')?.statuses[1]).toEqual({ host: 'Codex、Pi、omp', text: '非本工具安装', tone: 'attention' });
  });

  it('装到项目时同样归组：看的是项目目录下的那个共用 skill 目录，全局装过的不算', async () => {
    let listed: ViewState | undefined;
    await run({
      onPath: ALL_HOSTS,
      home,
      project: installed('.agents/skills', 'beta-pack', '2.3'),
      page: async (page) => {
        listed = await scope(page, 'project');
        await done(page);
      },
    });

    expect(statuses(listed, 'alpha')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 未装']);
    expect(statuses(listed, 'beta-pack')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 已装 2.3']);
  });

  it('英文界面：段名用英文的并列写法 Codex, Pi, omp', async () => {
    const first = await firstState({ argv: ['--lang', 'en'], onPath: ALL_HOSTS, home });

    expect(card(first, 'alpha')?.statuses).toEqual([
      { host: 'Claude Code', text: 'none', tone: 'faint' },
      { host: 'Codex, Pi, omp', text: 'installed', tone: 'ready', rest: '1.0.0' },
    ]);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (entries: unknown[] = SAMPLE_THIRD_PARTY): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: entries } });
// 共用 skill 目录里已有 paper-kit 的一个 skill 和 solo-notes 的那一个；Claude Code 的目录里什么都没有
const SHARED_HAS = { '.agents/skills/paper-reader/SKILL.md': '# paper-reader\n', '.agents/skills/note-taker/SKILL.md': '# note-taker\n' };
// 打开「联网搜索与文档检索」看到的画面状态
const listedState = async (options: Parameters<typeof run>[0], purpose = WEB_SEARCH): Promise<ViewState | undefined> => {
  let listed: ViewState | undefined;
  await run({
    ...options,
    page: async (page) => {
      listed = await open(page, purpose);
      await done(page);
    },
  });
  return listed;
};

describe('网页界面：第三方 Skill 的状态同样一组一段', () => {
  it('选了 Codex 和 Pi：一段「Codex、Pi」，状态看的是共用 skill 目录', async () => {
    const listed = await listedState({ catalog: thirdParty(), onPath: ['codex', 'pi'], home: SHARED_HAS });

    expect(card(listed, 'paper-kit')?.statuses).toEqual([{ host: 'Codex、Pi', text: '已装', tone: 'ready', rest: '1/3' }]);
    expect(statuses(listed, 'solo-notes')).toEqual(['Codex、Pi 已装']);
  });

  it('四个宿主都选了：「Claude Code」「Codex、Pi、omp」两段，各看各的目录', async () => {
    const listed = await listedState({ catalog: thirdParty(), onPath: ALL_HOSTS, home: SHARED_HAS });

    expect(statuses(listed, 'paper-kit')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 已装 1/3']);
    expect(statuses(listed, 'solo-notes')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 已装']);
  });

  it('条目用 hosts 限定了宿主：一组里有它支持的宿主就照目录写状态，一个都不支持的那一组写「不支持」', async () => {
    const listed = await listedState({ catalog: thirdParty([{ ...KIT, hosts: ['claude-code'] }, { ...SOLO, hosts: ['pi'] }]), onPath: ALL_HOSTS, home: SHARED_HAS });

    // paper-kit 只支持 Claude Code：共用 skill 目录那一组一个都不支持，那里有同名目录也不算
    expect(statuses(listed, 'paper-kit')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 不支持']);
    // solo-notes 只支持 Pi：那一组里有 Pi，照目录写
    expect(statuses(listed, 'solo-notes')).toEqual(['Claude Code 不支持', 'Codex、Pi、omp 已装']);
    expect(card(listed, 'paper-kit')).not.toHaveProperty('unavailable');
    expect(card(listed, 'solo-notes')).not.toHaveProperty('unavailable');
  });

  it('所选的每一组都不支持：卡片不可选，原因「需要别的 AI Agent」', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: ALL_HOSTS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        await host(page, 'pi', false);
        listed = await host(page, 'omp', false);
        await done(page);
      },
    });

    expect(card(listed, 'solo-notes')).toMatchObject({ unavailable: '需要别的 AI Agent' });
    expect(statuses(listed, 'solo-notes')).toEqual(['Claude Code 不支持', 'Codex 不支持']);
    expect(card(listed, 'paper-kit')).not.toHaveProperty('unavailable');
  });

  it('含多个 skill 的条目：每个 skill 的小格同样按组，各写各的状态', async () => {
    let picked: ViewState | undefined;
    await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      page: async (page) => {
        await open(page, WEB_SEARCH);
        picked = await tick(page, 'thirdParty', 'paper-kit');
        await done(page);
      },
    });

    expect(choiceStatuses(picked, 'paper-kit', 'paper-reader')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 已装']);
    expect(choiceStatuses(picked, 'paper-kit', 'paper-comic')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 未装']);
  });

  it('小格里条目不支持的那一组每个 skill 都写「不支持」；选了 Codex 和 Pi 时只有一段', async () => {
    const limited = await listedState({ catalog: thirdParty([{ ...KIT, hosts: ['pi'] }, SOLO]), onPath: ALL_HOSTS, home: SHARED_HAS });
    const shared = await listedState({ catalog: thirdParty(), onPath: ['codex', 'pi'], home: SHARED_HAS });

    expect(choiceStatuses(limited, 'paper-kit', 'paper-reader')).toEqual(['Claude Code 不支持', 'Codex、Pi、omp 已装']);
    expect(choiceStatuses(limited, 'paper-kit', 'paper-deck')).toEqual(['Claude Code 不支持', 'Codex、Pi、omp 未装']);
    expect(choiceStatuses(shared, 'paper-kit', 'paper-reader')).toEqual(['Codex、Pi 已装']);
  });

  it('英文界面：卡片和小格的段名都是 Codex, Pi, omp', async () => {
    const listed = await listedState({ argv: ['--lang', 'en'], catalog: thirdParty(), onPath: ALL_HOSTS, home: SHARED_HAS }, WEB_SEARCH_EN);

    expect(statuses(listed, 'paper-kit')).toEqual(['Claude Code none', 'Codex, Pi, omp installed 1/3']);
    expect(choiceStatuses(listed, 'paper-kit', 'paper-reader')).toEqual(['Claude Code none', 'Codex, Pi, omp installed']);
  });
});

// 「联网搜索与文档检索」下的两个 MCP：docs-local 是本地进程的，tracker-remote 是远程地址的；extra 是目录里另外放的东西
const withMcps = (extra: object = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), ...extra } });
const PI_CONFIGURED = { '.pi/agent/mcp.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) };

describe('网页界面：MCP 每个装得了 MCP 的宿主一段，没有 omp 的那一段', () => {
  it('四个宿主都选了：MCP 是 Claude Code、Codex、Pi 三段；同一张列表里 Skill 是两段', async () => {
    const listed = await listedState({ catalog: withMcps({ skillPurposes: { alpha: 'web-search' } }), onPath: ALL_HOSTS, home: PI_CONFIGURED });

    expect(card(listed, 'docs-local')?.statuses).toEqual([
      { host: 'Claude Code', text: '未配置', tone: 'faint' },
      { host: 'Codex', text: '未配置', tone: 'faint' },
      { host: 'Pi', text: '已配置', tone: 'ready' },
    ]);
    expect(statuses(listed, 'tracker-remote')).toEqual(['Claude Code 未配置', 'Codex 未配置', 'Pi 未配置']);
    expect(statuses(listed, 'alpha')).toEqual(['Claude Code 未装', 'Codex、Pi、omp 未装']);
    expect(card(listed, 'docs-local')).not.toHaveProperty('unavailable');
    // 两句说明照旧，各在各的那一区
    expect(notices(listed)).toEqual({ skill: ['Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到'], mcp: [OMP_MCP_NOTICE] });
  });

  it('选了 Claude Code 和 omp：只有 Claude Code 一段', async () => {
    const listed = await listedState({ catalog: withMcps(), onPath: ['claude', 'omp'] });

    expect(listed?.target.hosts).toEqual(['Claude Code', 'omp']);
    expect(card(listed, 'docs-local')?.statuses).toEqual([{ host: 'Claude Code', text: '未配置', tone: 'faint' }]);
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
  });

  it('只选 omp：MCP 不可选、勾不上，原因「需要别的 AI Agent」，一段状态都没有；那句说明照旧', async () => {
    let listed: ViewState | undefined;
    let refused: number | undefined;
    await run({
      catalog: withMcps(),
      onPath: ['omp'],
      page: async (page) => {
        listed = await open(page, WEB_SEARCH);
        refused = await post(page, { type: 'pick', kind: 'mcp', name: 'docs-local', on: true });
        await done(page);
      },
    });

    expect(card(listed, 'docs-local')).toMatchObject({ unavailable: '需要别的 AI Agent', statuses: [] });
    expect(card(listed, 'tracker-remote')).toMatchObject({ unavailable: '需要别的 AI Agent', statuses: [] });
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE] });
    expect(refused).toBe(400);
  });

  it('装到项目、四个宿主：仍是三段，Codex 那一段是「不支持」，看的是各自项目范围的配置', async () => {
    let listed: ViewState | undefined;
    await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      home: PI_CONFIGURED,
      project: { '.mcp.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) },
      page: async (page) => {
        await open(page, WEB_SEARCH);
        listed = await scope(page, 'project');
        await done(page);
      },
    });

    expect(statuses(listed, 'docs-local')).toEqual(['Claude Code 已配置', 'Codex 不支持', 'Pi 未配置']);
    expect(notices(listed)).toEqual({ mcp: ['Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令', OMP_MCP_NOTICE] });
  });

  it('读不到 Pi 的配置：它那一段是「未知」，那句说明照旧', async () => {
    const listed = await listedState({ catalog: withMcps(), onPath: ALL_HOSTS, home: { '.pi/agent/mcp.json': '这不是 JSON' } });

    expect(statuses(listed, 'docs-local')).toEqual(['Claude Code 未配置', 'Codex 未配置', 'Pi 未知']);
    expect(notices(listed)).toEqual({ mcp: [OMP_MCP_NOTICE, '读不到 Pi 的配置，无法判断哪些 MCP 已配置'] });
  });

  it('英文界面：三段，状态是英文', async () => {
    const listed = await listedState({ argv: ['--lang', 'en'], catalog: withMcps(), onPath: ALL_HOSTS, home: PI_CONFIGURED }, WEB_SEARCH_EN);

    expect(statuses(listed, 'docs-local')).toEqual(['Claude Code none', 'Codex none', 'Pi configured']);
  });
});
