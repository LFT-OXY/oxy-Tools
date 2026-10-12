// 列表的状态栏按 skill 目录归组（任务 10-12-installer-add-pi-omp-hosts 工单 06）：Skill 和第三方 Skill 一组一栏，共用同一个
// skill 目录的几个宿主合成一栏、状态只写一份；MCP 仍是每个宿主一栏，MCP 安装器不装的宿主（omp）不出栏，MCP 的栏和表头不同时
// 栏名写在 MCP 那一段的标题行上。网页界面那一边在 web-status-columns.test.ts
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import { EMPTY_CATALOG, KEY, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_SKILLS, SAMPLE_THIRD_PARTY, SAMPLE_TOOLS, accept, catalogDir, choose, pick, run, underWebSearch } from './harness.ts';
import { screenLines } from './terminal.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const WEB_SEARCH_EN = 'Web search & docs retrieval';
const ALL_HOSTS = ['claude', 'codex', 'pi', 'omp'];
const LIST = '? 选择要安装的条目';
const LIST_EN = '? Pick entries to install';
const listOf = (output: string, list = LIST): string => output.split(list)[1] ?? '';
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});
// 「推荐」那张列表：只有本仓库的两个 skill。问过宿主的排两个应答（宿主、列表），没问过的只排列表的
const browse = (hosts?: string[]) => [choose('推荐'), ...(hosts ? [pick(...hosts)] : []), pick(), ...(hosts ? [pick()] : []), choose('退出')];
/** 表头那一行：列表里第一行有内容的 */
const headerOf = (list: string): string => list.split('\n').find((line) => /\S/.test(line)) ?? '';
/** 各栏从第几列起：拿栏名在这一行里的位置量 */
const startOf = (line: string, column: string): number => displayWidth(line.slice(0, line.indexOf(column)));

describe('Skill 的状态一组一栏', () => {
  // 共用 skill 目录里 alpha 是本工具装的、版本一致；Claude Code 的目录里什么都没有
  const home = installed('.agents/skills', 'alpha', '1.0.0');

  it('选了 Codex 和 Pi：合成一栏「Codex、Pi」，状态只写一份', async () => {
    const result = await run({ onPath: ['codex', 'pi'], home, answers: browse(['Codex', 'Pi']) });

    expect(headerOf(listOf(result.output))).toMatch(/^\s+名称\s+Codex、Pi\s+说明$/);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+已装 1\.0\.0\s{3}第一个样例 skill/m);
    expect(listOf(result.output)).toMatch(/^ □ beta-pack\s+未装\s+第二个样例 skill$/m);
  });

  it('选了 Claude Code、Codex、Pi：「Claude Code」「Codex、Pi」两栏', async () => {
    const result = await run({ onPath: ['claude', 'codex', 'pi'], home, answers: browse(['Claude Code', 'Codex', 'Pi']) });

    expect(headerOf(listOf(result.output))).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi\s+说明$/);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+未装\s+已装 1\.0\.0\s{3}第一个样例 skill/m);
    expect(listOf(result.output)).toMatch(/^ □ beta-pack\s+未装\s+未装\s+第二个样例 skill$/m);
  });

  it('四个宿主都选了：「Claude Code」「Codex、Pi、omp」两栏，说明一栏仍在', async () => {
    const result = await run({ onPath: ALL_HOSTS, home, answers: browse(['Claude Code', 'Codex', 'Pi', 'omp']) });

    expect(headerOf(listOf(result.output))).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+未装\s+已装 1\.0\.0\s+第一个样例 skill/m);
  });

  it('四个宿主里只留 Pi 和 omp：一栏「Pi、omp」；只留 Claude Code 和 omp：目录不同，各一栏', async () => {
    const shared = await run({ onPath: ALL_HOSTS, home, answers: browse(['Pi', 'omp']) });
    const apart = await run({ onPath: ALL_HOSTS, home, answers: browse(['Claude Code', 'omp']) });

    expect(headerOf(listOf(shared.output))).toMatch(/^\s+名称\s+Pi、omp\s+说明$/);
    expect(headerOf(listOf(apart.output))).toMatch(/^\s+名称\s+Claude Code\s+omp\s+说明$/);
    expect(listOf(apart.output)).toMatch(/^ □ alpha\s+未装\s+已装 1\.0\.0\s+第一个样例 skill/m);
  });

  it('只选 Claude Code、选了 Claude Code 和 Codex：和原来一样是每个宿主一栏', async () => {
    const one = await run({ onPath: ['claude'], home: installed('.claude/skills', 'alpha', '1.0.0'), answers: browse() });
    const two = await run({ onPath: ['claude', 'codex'], home, answers: browse(['Claude Code', 'Codex']) });

    expect(headerOf(listOf(one.output))).toMatch(/^\s+名称\s+Claude Code\s+说明$/);
    expect(listOf(one.output)).toMatch(/^ □ alpha\s+已装 1\.0\.0\s+第一个样例 skill/m);
    expect(headerOf(listOf(two.output))).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/);
    expect(listOf(two.output)).toMatch(/^ □ alpha\s+未装\s+已装 1\.0\.0\s+第一个样例 skill/m);
  });

  it('一栏里的状态看的是那个目录：未装、已装、版本不同、不是本工具装的', async () => {
    const managed = await run({
      onPath: ALL_HOSTS,
      home: { ...installed('.agents/skills', 'alpha', '1.0.0'), ...installed('.agents/skills', 'beta-pack', '2.0') },
      answers: browse(['Claude Code', 'Codex', 'Pi', 'omp']),
    });
    const unmanaged = await run({
      onPath: ALL_HOSTS,
      home: { '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的\n', ...installed('.claude/skills', 'alpha', '0.9.0') },
      answers: browse(['Claude Code', 'Codex', 'Pi', 'omp']),
    });

    expect(listOf(managed.output)).toMatch(/^ □ alpha\s+未装\s+已装 1\.0\.0\s+第一个样例 skill/m);
    expect(listOf(managed.output)).toMatch(/^ □ beta-pack\s+未装\s+2\.0 → 2\.3\s+第二个样例 skill$/m);
    expect(listOf(unmanaged.output)).toMatch(/^ □ alpha\s+0\.9\.0 → 1\.0\.0\s+未装\s+第一个样例 skill/m);
    expect(listOf(unmanaged.output)).toMatch(/^ □ beta-pack\s+未装\s+非本工具安装\s+第二个样例 skill$/m);
  });

  it('装到项目时同样归组：看的是项目目录下的那个共用 skill 目录，全局装过的不算', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      home,
      project: installed('.agents/skills', 'beta-pack', '2.3'),
      answersScope: true,
      answers: [choose('推荐'), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });

    expect(headerOf(listOf(result.output))).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+未装\s+未装\s+第一个样例 skill/m);
    expect(listOf(result.output)).toMatch(/^ □ beta-pack\s+未装\s+已装 2\.3\s+第二个样例 skill$/m);
  });

  it('英文界面：栏名用英文的并列写法 Codex, Pi, omp', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: ALL_HOSTS,
      home,
      answers: [choose('Recommended'), accept(), pick(), pick(), choose('Exit')],
    });

    expect(headerOf(listOf(result.output, LIST_EN))).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp\s+About$/);
    expect(listOf(result.output, LIST_EN)).toMatch(/^ □ alpha\s+none\s+installed 1\.0\.0\s+The first sample skill/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

// 「联网搜索与文档检索」下的两个 MCP：docs-local 是本地进程的，tracker-remote 是远程地址的；extra 是目录里另外放的东西
const withMcps = (extra: object = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), ...extra } });
// 同一张列表里既有本仓库的 skill（alpha），又有那两个 MCP
const skillsAndMcps = (extra: object = {}): string => withMcps({ skillPurposes: { alpha: 'web-search' }, ...extra });
const linesOf = (list: string): string[] => list.split('\n');
/** MCP 那一段的标题行 */
const mcpTitleOf = (list: string): string => linesOf(list).find((line) => /^\s+── MCP/.test(line)) ?? '';
const rowOf = (list: string, name: string): string => linesOf(list).find((line) => new RegExp(`^ [□–] ${name}\\s`).test(line)) ?? '';
const OMP_MCP_NOTICE = '安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加';
const PI_CONFIGURED = { '.pi/agent/mcp.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) };

describe('MCP 每个宿主一栏，omp 不出栏', () => {
  it('四个宿主都选了、列表里有 Skill 和 MCP：表头是 Skill 的两栏，MCP 的三栏写在它那一段的标题行上，和下面的状态对齐', async () => {
    const result = await run({ catalog: skillsAndMcps(), onPath: ALL_HOSTS, home: PI_CONFIGURED, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/);
    // 这一段不写说明一栏，也没有 omp 的那一栏
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+已配置$/);
    expect(rowOf(list, 'tracker-remote')).toMatch(/^ □ tracker-remote\s+未配置\s+未配置\s+未配置$/);
    // 栏名和下面的状态从同一列起，三栏之间各三格
    expect(startOf(mcpTitleOf(list), 'Claude Code')).toBe(startOf(rowOf(list, 'docs-local'), '未配置'));
    expect(startOf(mcpTitleOf(list), 'Pi')).toBe(startOf(rowOf(list, 'docs-local'), '已配置'));
    expect(mcpTitleOf(list)).toMatch(/Claude Code {3}Codex {4}Pi$/);
    // MCP 的第一栏和表头的第一栏从同一列起
    expect(startOf(mcpTitleOf(list), 'Claude Code')).toBe(startOf(headerOf(list), 'Claude Code'));
    // Skill 的行照表头的栏排，说明一栏仍在
    expect(rowOf(list, 'alpha')).toMatch(/^ □ alpha\s+未装\s+未装\s+推荐 · 第一个样例 skill/);
  });

  it('列表里没有 Skill 和第三方 Skill：表头直接写 MCP 的三栏，标题行上不另写，说明一栏照旧', async () => {
    const result = await run({ catalog: withMcps(), onPath: ALL_HOSTS, home: PI_CONFIGURED, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+已配置\s+本地进程方式的样例 MCP/);
    expect(rowOf(list, 'tracker-remote')).toMatch(/^ □ tracker-remote\s+未配置\s+未配置\s+未配置\s+远程地址方式的样例 MCP$/);
  });

  it('选了 Claude Code 和 omp：MCP 只有 Claude Code 一栏', async () => {
    const mixed = await run({ catalog: skillsAndMcps(), onPath: ['claude', 'omp'], answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const only = await run({ catalog: withMcps(), onPath: ['claude', 'omp'], answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });

    expect(headerOf(listOf(mixed.output))).toMatch(/^\s+名称\s+Claude Code\s+omp\s+说明$/);
    expect(mcpTitleOf(listOf(mixed.output))).toMatch(/^\s+── MCP\s+Claude Code$/);
    expect(rowOf(listOf(mixed.output), 'docs-local')).toMatch(/^ □ docs-local\s+未配置$/);
    expect(headerOf(listOf(only.output))).toMatch(/^\s+名称\s+Claude Code\s+说明$/);
    expect(mcpTitleOf(listOf(only.output))).toMatch(/^\s+── MCP$/);
    expect(rowOf(listOf(only.output), 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+本地进程方式的样例 MCP/);
    // 那句说明照旧
    // MCP 的那一栏和表头的第一栏同宽
    expect(startOf(mcpTitleOf(listOf(mixed.output)), 'Claude Code')).toBe(startOf(headerOf(listOf(mixed.output)), 'Claude Code'));
    expect(mixed.output).toMatch(new RegExp(`^\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
    expect(only.output).toMatch(new RegExp(`^\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
  });

  it('选了 Codex 和 Pi：Skill 合成一栏，MCP 仍是各一栏，栏名写在标题行上', async () => {
    const result = await run({ catalog: skillsAndMcps(), onPath: ['codex', 'pi'], home: PI_CONFIGURED, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Codex、Pi\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Codex\s+Pi$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+已配置$/);
  });

  it('两者的栏相同时标题行上不另写：选了 Claude Code 和 Codex，MCP 的行照表头的栏排，说明一栏照旧', async () => {
    const result = await run({ catalog: skillsAndMcps(), onPath: ['claude', 'codex'], answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+本地进程方式的样例 MCP/);
    expect(startOf(rowOf(list, 'docs-local'), '本地进程')).toBe(startOf(headerOf(list), '说明'));
  });

  it('只选了 omp、列表里只有 MCP：一栏都没有，表头是「状态」，原因「需要别的 AI Agent」写在状态的位置', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['omp'], answers: [choose(WEB_SEARCH), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+状态\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ – docs-local\s+需要别的 AI Agent\s+本地进程方式的样例 MCP/);
    expect(startOf(rowOf(list, 'docs-local'), '需要别的')).toBe(startOf(headerOf(list), '状态'));
    expect(result.output).toMatch(new RegExp(`^\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
  });

  it('只选了 omp、列表里有 Skill 和 MCP：表头是 Skill 的那一栏，MCP 的标题行上没有可写的，原因写在状态的位置', async () => {
    const result = await run({ catalog: skillsAndMcps(), onPath: ['omp'], answers: [choose(WEB_SEARCH), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+omp\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP$/);
    expect(rowOf(list, 'alpha')).toMatch(/^ □ alpha\s+未装\s+推荐 · 第一个样例 skill/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ – docs-local\s+需要别的 AI Agent\s+本地进程方式的样例 MCP/);
    expect(startOf(rowOf(list, 'docs-local'), '需要别的')).toBe(startOf(headerOf(list), 'omp'));
    // 各行的说明仍从同一列起
    expect(startOf(rowOf(list, 'docs-local'), '本地进程')).toBe(startOf(rowOf(list, 'alpha'), '推荐 · 第一个样例'));
  });

  it('MCP 那一段自己排时，三栏都装不了的行不可选，原因从第一栏状态的位置写起', async () => {
    const result = await run({
      catalog: skillsAndMcps({ mcps: underWebSearch(SAMPLE_MCPS[0], { ...SAMPLE_MCPS[1], hosts: ['omp'] }) }),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(rowOf(list, 'tracker-remote')).toMatch(/^ – tracker-remote\s+需要别的 AI Agent$/);
    expect(startOf(rowOf(list, 'tracker-remote'), '需要别的')).toBe(startOf(mcpTitleOf(list), 'Claude Code'));
  });

  it('装到项目、四个宿主：MCP 仍是三栏，Codex 那一栏是「不支持」，看的是各自项目范围的配置', async () => {
    const result = await run({
      catalog: skillsAndMcps(),
      onPath: ALL_HOSTS,
      // 全局配过的不算；项目里 Pi 配过 docs-local
      home: { '.claude.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) },
      project: { '.pi/mcp.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) },
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+不支持\s+已配置$/);
    // 列表上方的几句说明照旧：共用 skill 目录、只能装到全局、omp 的 MCP
    const lines = result.output.split('\n');
    const shared = lines.findIndex((line) => line.includes('共用同一个'));
    expect(lines.slice(shared - 1, shared + 4)).toEqual([
      '',
      '  注意      Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到',
      '  注意      Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令',
      `  注意      ${OMP_MCP_NOTICE}`,
      '',
    ]);
  });

  it('读不到 Pi 的配置：它那一栏是「未知」，那句说明照旧', async () => {
    const result = await run({
      catalog: skillsAndMcps(),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': '这不是 JSON' },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(rowOf(listOf(result.output), 'docs-local')).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+未知$/);
    expect(result.output).toMatch(/^\s+注意\s+读不到 Pi 的配置，无法判断哪些 MCP 已配置$/m);
  });

  it('英文界面：栏名是宿主的名字，状态是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: skillsAndMcps(),
      onPath: ALL_HOSTS,
      home: PI_CONFIGURED,
      answers: [choose(WEB_SEARCH_EN), accept(), pick(), pick(), choose('Exit')],
    });
    const list = listOf(result.output, LIST_EN);

    expect(headerOf(list)).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp\s+About$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/);
    expect(rowOf(list, 'docs-local')).toMatch(/^ □ docs-local\s+none\s+none\s+configured$/);
    expect(startOf(mcpTitleOf(list), 'Pi')).toBe(startOf(rowOf(list, 'docs-local'), 'configured'));
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (entries: unknown[] = SAMPLE_THIRD_PARTY): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: entries } });
// 共用 skill 目录里已有 paper-kit 的一个 skill 和 solo-notes 的那一个；Claude Code 的目录里什么都没有
const SHARED_HAS = { '.agents/skills/paper-reader/SKILL.md': '# paper-reader\n', '.agents/skills/note-taker/SKILL.md': '# note-taker\n' };
const CHECKLIST = '? paper-kit 里有 3 个 skill，选择要装的';

describe('第三方 Skill 的状态同样一组一栏', () => {
  it('选了 Codex 和 Pi：一栏「Codex、Pi」，状态看的是共用 skill 目录', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ['codex', 'pi'], home: SHARED_HAS, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Codex、Pi\s+说明$/);
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+已装 1\/3\s+含三个 skill 的样例第三方 Skill/);
    expect(rowOf(list, 'solo-notes')).toMatch(/^ □ solo-notes\s+已装\s+只含一个 skill 的样例第三方 Skill$/);
  });

  it('四个宿主都选了：「Claude Code」「Codex、Pi、omp」两栏，各看各的目录', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ALL_HOSTS, home: SHARED_HAS, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+未装\s+已装 1\/3\s+含三个 skill/);
    expect(rowOf(list, 'solo-notes')).toMatch(/^ □ solo-notes\s+未装\s+已装\s+只含一个 skill/);
  });

  it('条目用 hosts 限定了宿主：一组里有它支持的宿主就照目录写状态，一个都不支持的那一组写「不支持」', async () => {
    const result = await run({
      catalog: thirdParty([{ ...KIT, hosts: ['claude-code'] }, { ...SOLO, hosts: ['pi'] }]),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    // paper-kit 只支持 Claude Code：共用 skill 目录那一组一个都不支持，那里有同名目录也不算
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+未装\s+不支持\s+含三个 skill/);
    // solo-notes 只支持 Pi：那一组里有 Pi，照目录写
    expect(rowOf(list, 'solo-notes')).toMatch(/^ □ solo-notes\s+不支持\s+已装\s+只含一个 skill/);
  });

  it('所选的每一组都不支持：这一行不可选，原因「需要别的 AI Agent」', async () => {
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), pick('Claude Code', 'Codex'), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+说明$/);
    expect(rowOf(list, 'solo-notes')).toMatch(/^ – solo-notes\s+需要别的 AI Agent\s+只含一个 skill/);
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+未装\s+未装\s+含三个 skill/);
  });

  it('含多个 skill 的条目的清单：栏和列表一样按组，每个 skill 各写各的状态', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(), choose('退出')],
    });
    const checklist = listOf(result.output, CHECKLIST);

    expect(headerOf(checklist)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(checklist).toMatch(/^ □ paper-reader\s+未装\s+已装\s+把一篇论文读成深度解读文章$/m);
    expect(checklist).toMatch(/^ □ paper-comic\s+未装\s+未装\s+把论文的要点画成一组漫画$/m);
  });

  it('清单里条目不支持的那一组每个 skill 都写「不支持」；选了 Codex 和 Pi 时只有一栏', async () => {
    const limited = await run({
      catalog: thirdParty([{ ...KIT, hosts: ['pi'] }, SOLO]),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(), choose('退出')],
    });
    const shared = await run({
      catalog: thirdParty(),
      onPath: ['codex', 'pi'],
      home: SHARED_HAS,
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick(), choose('退出')],
    });

    expect(listOf(limited.output, CHECKLIST)).toMatch(/^ □ paper-reader\s+不支持\s+已装\s+把一篇论文读成深度解读文章$/m);
    expect(listOf(limited.output, CHECKLIST)).toMatch(/^ □ paper-deck\s+不支持\s+未装\s+把论文做成一套幻灯片$/m);
    expect(headerOf(listOf(shared.output, CHECKLIST))).toMatch(/^\s+名称\s+Codex、Pi\s+说明$/);
    expect(listOf(shared.output, CHECKLIST)).toMatch(/^ □ paper-reader\s+已装\s+把一篇论文读成深度解读文章$/m);
  });

  it('装到项目时同样归组：看的是项目目录下的共用 skill 目录', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      project: { '.agents/skills/paper-comic/SKILL.md': '# paper-comic\n' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+未装\s+已装 1\/3\s+含三个 skill/);
    expect(rowOf(list, 'solo-notes')).toMatch(/^ □ solo-notes\s+未装\s+未装\s+只含一个 skill/);
  });

  it('英文界面：列表和清单的栏名都是 Codex, Pi, omp', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      home: SHARED_HAS,
      answers: [choose(WEB_SEARCH_EN), accept(), pick('paper-kit'), pick(), choose('Exit')],
    });
    const list = listOf(result.output, LIST_EN);

    expect(headerOf(list)).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp\s+About$/);
    expect(rowOf(list, 'paper-kit')).toMatch(/^ □ paper-kit\s+none\s+installed 1\/3\s+A sample third-party skill/);
    expect(result.output).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp\s+About\n □ paper-reader\s+none\s+installed\s+Turn a paper into an in-depth…$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

describe('工具和外部项目两段照旧', () => {
  const everything = (): string =>
    catalogDir({
      catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), tools: underWebSearch(...SAMPLE_TOOLS), apps: underWebSearch(...SAMPLE_APPS), skillPurposes: { alpha: 'web-search' } },
    });

  it('四个宿主、五段都有：工具的状态写在表头第一栏的位置，说明和 Skill 的行从同一列起；外部项目的说明从状态的位置写起', async () => {
    const result = await run({ catalog: everything(), onPath: ALL_HOSTS, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(linesOf(list).filter((line) => /^\s+── /.test(line)).map((line) => line.trim().split(/\s{2,}/)[0])).toEqual([
      '── Skill',
      '── MCP',
      '── 工具',
      '── 外部项目 · 只给链接，不安装',
    ]);
    expect(rowOf(list, 'fetcher')).toMatch(/^ □ fetcher\s+未安装\s+第一个样例工具/);
    expect(startOf(rowOf(list, 'fetcher'), '未安装')).toBe(startOf(headerOf(list), 'Claude Code'));
    expect(startOf(rowOf(list, 'fetcher'), '第一个样例工具')).toBe(startOf(headerOf(list), '说明'));
    expect(startOf(rowOf(list, 'atlas'), '第一个样例外部项目')).toBe(startOf(headerOf(list), 'Claude Code'));
  });

  it('列表里只有 MCP 和工具：表头是 MCP 的栏，工具的状态写在第一栏的位置', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), tools: underWebSearch(...SAMPLE_TOOLS) } }),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+说明$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP$/);
    expect(startOf(rowOf(list, 'fetcher'), '未安装')).toBe(startOf(headerOf(list), 'Claude Code'));
    expect(startOf(rowOf(list, 'fetcher'), '第一个样例工具')).toBe(startOf(headerOf(list), '说明'));
  });
});

describe('四个宿主都选了时列表的 80 列', () => {
  // 目录里能装的条目名字最长是 27 列，外部项目最长 32 列（它和组件共用名称一栏）
  const LONG_COMPONENT = 'a-component-name-of-27-cols';
  const LONG_APP = 'opencode-dynamic-context-pruning';
  // 状态最宽的样子：两个 skill 目录里各有版本不同的、不是本工具装的；MCP 各栏里有已配置、不支持
  const widest = (extra: object = {}): string =>
    catalogDir({
      index: { version: 1, skills: [...SAMPLE_SKILLS, { ...SAMPLE_SKILLS[0], name: 'gamma', path: 'skills/alpha' }] },
      catalog: {
        ...EMPTY_CATALOG,
        thirdPartySkills: SAMPLE_THIRD_PARTY,
        mcps: underWebSearch({ ...SAMPLE_MCPS[0], name: LONG_COMPONENT }, { ...SAMPLE_MCPS[1], hosts: ['claude-code'] }),
        tools: underWebSearch(...SAMPLE_TOOLS),
        skillPurposes: { alpha: 'web-search', 'beta-pack': 'web-search', gamma: 'web-search' },
        ...extra,
      },
    });
  const home = {
    '.claude/skills/alpha/SKILL.md': '用户自己写的\n',
    '.agents/skills/alpha/SKILL.md': '用户自己写的\n',
    ...installed('.claude/skills', 'beta-pack', '2.0'),
    ...installed('.agents/skills', 'beta-pack', '2.0'),
    ...installed('.claude/skills', 'gamma', '1.0.0'),
    ...installed('.agents/skills', 'gamma', '1.0.0'),
    '.agents/skills/paper-reader/SKILL.md': '# paper-reader\n',
    '.claude.json': JSON.stringify({ mcpServers: { [LONG_COMPONENT]: {}, 'tracker-remote': {} } }),
    '.codex/config.toml': `[mcp_servers.${LONG_COMPONENT}]\ncommand = "npx"\n`,
    '.pi/agent/mcp.json': JSON.stringify({ mcpServers: { [LONG_COMPONENT]: {} } }),
  };
  // 列表那一块：表头、段标题和各行，到光标所在行的类型（预设应答的提问器把它和说明全文原样记下来，不折行）为止
  const rowsOf = (list: string): string[] => {
    const lines = linesOf(list).slice(1);
    const end = lines.findIndex((line) => line !== '' && !line.startsWith(' '));
    return lines.slice(0, end === -1 ? lines.length : end);
  };
  const widthOf = (list: string): number => Math.max(...rowsOf(list).map((line) => displayWidth(line)));

  it('状态带版本、名字 27 列：没有一行超出第 79 列，说明一栏仍在', async () => {
    const result = await run({ catalog: widest(), onPath: ALL_HOSTS, home, answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const list = listOf(result.output);

    expect(headerOf(list)).toMatch(/^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/);
    expect(rowOf(list, 'alpha')).toMatch(/^ □ alpha\s+非本工具安装\s+非本工具安装\s+推荐 · \S/);
    expect(rowOf(list, 'beta-pack')).toMatch(/^ □ beta-pack\s+2\.0 → 2\.3\s+2\.0 → 2\.3\s+推荐 · \S/);
    expect(rowOf(list, 'gamma')).toMatch(/^ □ gamma\s+已装 1\.0\.0\s+已装 1\.0\.0\s+推荐 · \S/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/);
    expect(rowOf(list, LONG_COMPONENT)).toMatch(/\s已配置\s+已配置\s+已配置$/);
    expect(rowOf(list, 'tracker-remote')).toMatch(/\s已配置\s+不支持\s+不支持$/);
    // MCP 的第一栏和表头的第一栏是同一个宿主：跟它同宽，第二栏就和表头的第二栏从同一列起
    expect(startOf(mcpTitleOf(list), 'Codex')).toBe(startOf(headerOf(list), 'Codex、Pi、omp'));
    expect(startOf(rowOf(list, 'tracker-remote'), '不支持')).toBe(startOf(headerOf(list), 'Codex、Pi、omp'));
    expect(rowsOf(list).length).toBeGreaterThan(12);
    expect(widthOf(list)).toBeLessThanOrEqual(79);
  });

  it('英文界面，名称一栏照 32 列的外部项目定宽：MCP 三栏连名称仍不超出第 79 列', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: widest({ apps: underWebSearch({ ...SAMPLE_APPS[0], name: LONG_APP }) }),
      onPath: ALL_HOSTS,
      home,
      answers: [choose(WEB_SEARCH_EN), accept(), pick(), pick(), choose('Exit')],
    });
    const list = listOf(result.output, LIST_EN);

    expect(headerOf(list)).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp$/);
    expect(rowOf(list, 'gamma')).toMatch(/^ □ gamma\s+installed 1\.0\.0\s+installed 1\.0\.0$/);
    expect(mcpTitleOf(list)).toMatch(/^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/);
    expect(rowOf(list, LONG_COMPONENT)).toMatch(/\sconfigured\s+configured\s+configured$/);
    expect(rowOf(list, 'tracker-remote')).toMatch(/\sconfigured\s+unsupported\s+unsupported$/);
    expect(rowOf(list, LONG_APP)).toMatch(new RegExp(`^ □ ${LONG_APP}\\s{3}\\S`));
    // 第一栏跟表头同宽就超出一行：各栏照自己最长的一格定宽，栏间隔三格
    expect(mcpTitleOf(list)).toMatch(/Claude Code {3}Codex {9}Pi$/);
    expect(startOf(mcpTitleOf(list), 'Codex')).toBeLessThan(startOf(headerOf(list), 'Codex, Pi, omp'));
    expect(rowsOf(list).length).toBeGreaterThan(12);
    expect(widthOf(list)).toBeLessThanOrEqual(79);
  });

  it('英文界面、状态带版本：没有一行超出第 79 列，说明一栏仍在（名字到了 27 列时照原有的退路整栏不写）', async () => {
    const usual = { mcps: underWebSearch(...SAMPLE_MCPS) };
    const result = await run({ argv: ['--lang', 'en'], catalog: widest(usual), onPath: ALL_HOSTS, home, answers: [choose(WEB_SEARCH_EN), accept(), pick(), pick(), choose('Exit')] });
    const long = await run({ argv: ['--lang', 'en'], catalog: widest(), onPath: ALL_HOSTS, home, answers: [choose(WEB_SEARCH_EN), accept(), pick(), pick(), choose('Exit')] });
    const list = listOf(result.output, LIST_EN);

    expect(headerOf(listOf(long.output, LIST_EN))).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp$/);
    expect(widthOf(listOf(long.output, LIST_EN))).toBeLessThanOrEqual(79);

    expect(headerOf(list)).toMatch(/^\s+Name\s+Claude Code\s+Codex, Pi, omp\s+About$/);
    expect(rowOf(list, 'gamma')).toMatch(/^ □ gamma\s+installed 1\.0\.0\s+installed 1\.0\.0\s+pick · \S/);
    expect(rowsOf(list).length).toBeGreaterThan(12);
    expect(widthOf(list)).toBeLessThanOrEqual(79);
  });

  it('装到项目也是：Codex 的 MCP 那一栏都是「不支持」', async () => {
    const result = await run({
      catalog: widest(),
      onPath: ALL_HOSTS,
      project: Object.fromEntries(Object.entries(home).filter(([path]) => path.includes('/skills/'))),
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });
    const list = listOf(result.output);

    expect(rowOf(list, 'gamma')).toMatch(/^ □ gamma\s+已装 1\.0\.0\s+已装 1\.0\.0\s+推荐 · \S/);
    expect(rowOf(list, LONG_COMPONENT)).toMatch(/\s未配置\s+不支持\s+未配置$/);
    expect(rowsOf(list).length).toBeGreaterThan(12);
    expect(widthOf(list)).toBeLessThanOrEqual(79);
  });
});

describe('真实的画面：MCP 的栏名写在标题行上', () => {
  // 主菜单上「推荐」下面就是「联网搜索与文档检索」；宿主选择上四个都勾着，直接确认；安装范围由架子替用户按回车
  const toList: [string, string][] = [['⏎ 选择', KEY.down], ['▸ 联网搜索与文档检索', KEY.enter], ['⏎ 确认', KEY.enter]];

  it('四个宿主：标题行上的三个栏名和下面的状态对齐，光标跳过标题行，每一行都不超出第 79 列', async () => {
    const result = await run({
      catalog: skillsAndMcps(),
      onPath: ALL_HOSTS,
      home: PI_CONFIGURED,
      // 光标从 alpha 往下一格就是 MCP 的第一行：中间的标题行不可选
      keys: [...toList, ['▸□ alpha', KEY.down], ['▸□ docs-local', KEY.ctrlC]],
    });
    const lines = await screenLines(result.raw);
    const header = lines.find((line) => /^\s+名称\s+Claude Code\s+Codex、Pi、omp\s+说明$/.test(line)) ?? '';
    const title = lines.find((line) => /^\s+── MCP\s+Claude Code\s+Codex\s+Pi$/.test(line)) ?? '';
    const row = lines.find((line) => line.startsWith('▸□ docs-local')) ?? '';

    expect(header).not.toBe('');
    expect(title).not.toBe('');
    expect(row).toMatch(/^▸□ docs-local\s+未配置\s+未配置\s+已配置$/);
    expect(startOf(title, '── MCP')).toBe(startOf(header, '名称'));
    expect(startOf(title, 'Claude Code')).toBe(startOf(header, 'Claude Code'));
    expect(startOf(title, 'Claude Code')).toBe(startOf(row, '未配置'));
    expect(startOf(title, 'Pi')).toBe(startOf(row, '已配置'));
    // 这一段不写说明一栏，光标所在行的类型和说明全文照旧在列表下方
    expect(lines.some((line) => /^\s+类型\s+MCP · 推荐$/.test(line) || /^\s+类型\s+MCP$/.test(line))).toBe(true);
    expect(lines.some((line) => /^\s+说明\s+本地进程方式的样例 MCP/.test(line))).toBe(true);
    expect(Math.max(...lines.map((line) => displayWidth(line)))).toBeLessThanOrEqual(80);
    expect(Math.max(...lines.filter((line) => !line.includes('──') || line.includes('── MCP')).map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
  });
});
