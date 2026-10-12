// Pi 这个宿主：本仓库的 skill 和第三方 Skill 装进共用 skill 目录（.agents/skills，ADR-0005），MCP 安装器还不装。
// 检测到没有、「AI Agent」一行和宿主选择在 hosts.test.ts。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import {
  EMPTY_CATALOG,
  SAMPLE_MCPS,
  SAMPLE_SKILLS,
  SAMPLE_THIRD_PARTY,
  accept,
  catalogDir,
  choose,
  pick,
  run,
  underWebSearch,
  writeTree,
  yes,
} from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const ONLY_PI = ['pi'];
const ALL_HOSTS = ['claude', 'codex', 'pi'];
const LIST = '? 选择要安装的条目';
const listOf = (output: string): string => output.split(LIST)[1] ?? '';
const summaryOf = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));
const commandsOf = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
// 折行会打断整条命令：把空白并成一个空格再比
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});
const browse = [choose('推荐'), pick(), choose('退出')];

describe('把本仓库的 skill 装给 Pi', () => {
  it('装到项目：全部文件和安装标记落在项目目录的 .agents/skills 下，主目录里什么都不多', async () => {
    const result = await run({
      onPath: ONLY_PI,
      answersScope: true,
      answers: [choose('推荐'), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(filesUnder(join(result.project, '.agents', 'skills', 'alpha'))).toEqual(['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')]);
    expect(JSON.parse(read(result.project, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Pi\s+新装\s+\.agents\S+alpha$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Pi\s+已安装 1\.0\.0$/m);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('列表里的四种状态看的是共用 skill 目录：未装、已装、版本不同、不是本工具装的', async () => {
    const managed = await run({
      onPath: ONLY_PI,
      home: { ...installed('.agents/skills', 'alpha', '1.0.0'), ...installed('.agents/skills', 'beta-pack', '2.0') },
      answers: browse,
    });
    const other = await run({ onPath: ONLY_PI, home: { '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的' }, answers: browse });

    expect(managed.output).toMatch(/^\s+名称\s+Pi\s+说明$/m);
    expect(managed.output).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s+第一个样例 skill/m);
    expect(managed.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s+第二个样例 skill$/m);
    expect(other.output).toMatch(/^\s*□ alpha\s+未装\s+第一个样例 skill/m);
    expect(other.output).toMatch(/^\s*□ beta-pack\s+非本工具安装\s+第二个样例 skill$/m);
  });

  it('Pi 自己的 skill 目录不看也不写：那里有同名的不算已装', async () => {
    const before = { '.pi/agent/skills/alpha/SKILL.md': '用户放在 Pi 自己的目录里的\n' };
    const result = await run({ onPath: ONLY_PI, home: before, answers: [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^\s*□ alpha\s+未装\s/m);
    expect(result.output).not.toContain('要覆盖它吗');
    expect(filesUnder(join(result.home, '.pi'))).toEqual(['agent', join('agent', 'skills'), join('agent', 'skills', 'alpha'), join('agent', 'skills', 'alpha', 'SKILL.md')]);
    expect(read(result.home, '.pi', 'agent', 'skills', 'alpha', 'SKILL.md')).toBe(before['.pi/agent/skills/alpha/SKILL.md']);
    expect(existsSync(join(result.home, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toBe(true);
  });

  it('版本不同的直接覆盖，不另问：装完是清单里的版本', async () => {
    const result = await run({
      onPath: ONLY_PI,
      home: installed('.agents/skills', 'beta-pack', '2.0'),
      answers: [choose('推荐'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+beta-pack\s+Pi\s+覆盖\s+~\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Pi\s+已安装 2\.0 → 2\.3$/m);
    expect(JSON.parse(read(result.home, '.agents', 'skills', 'beta-pack', '.oxy-tools.json'))).toMatchObject({ version: '2.3' });
  });

  it('不是本工具装的：另问，问的是共用 skill 目录里的那个路径，缺省不覆盖', async () => {
    const result = await run({
      onPath: ONLY_PI,
      home: { '.agents/skills/alpha/SKILL.md': '用户自己写的\n' },
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Pi\s+覆盖\s+~\S+alpha\s+非本工具安装，另行确认$/m);
    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？ (y/N)`);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(['SKILL.md']);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('用户自己写的\n');
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Pi\s+跳过\s+未同意覆盖，保持原样$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 1 跳过$/m);
  });

  it('同意了才覆盖：整目录替换，带上安装标记', async () => {
    const result = await run({
      onPath: ONLY_PI,
      home: { '.agents/skills/alpha/SKILL.md': '用户自己写的\n', '.agents/skills/alpha/mine.txt': '用户的文件\n' },
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')]);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('# alpha\n');
  });

  it('三个宿主都选了：列表里每个宿主一栏状态，依次是 Claude Code、Codex、Pi', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      home: installed('.claude/skills', 'alpha', '1.0.0'),
      answers: [choose('推荐'), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+说明$/m);
    expect(listOf(result.output)).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s+未装\s+未装\s+第一个样例 skill/m);
  });

  it('英文界面：状态词、汇总和结果里的宿主都是英文界面的写法', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: ONLY_PI,
      home: { ...installed('.agents/skills', 'beta-pack', '2.0'), '.agents/skills/alpha/SKILL.md': 'placed by hand\n' },
      answers: [choose('Recommended'), pick('alpha', 'beta-pack'), choose('Install'), accept(), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Name\s+Pi\s+About$/m);
    expect(result.output).toMatch(/^\s*□ alpha\s+unmanaged\s/m);
    expect(result.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s/m);
    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'alpha')} is unmanaged. Overwrite it? (y/N)`);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Pi\s+skipped\s/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Pi\s+installed 2\.0 → 2\.3$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (entries: unknown[] = SAMPLE_THIRD_PARTY): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: entries } });
// skills CLI 1.7.2 认识 pi 这个 agent 名：全局装到 ~/.agents/skills，不带全局选项时装到运行目录下的 .agents/skills
// （2026-10-12 读它的源码确认，记在任务 10-12-installer-add-pi-omp-hosts 的 research/pi-omp-host-facts.md）
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const SOLO_INTO_PI = {
  command: 'npx',
  args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'pi', '--yes', '--global'],
  env: NO_TELEMETRY,
};
const SKILLS_DIR: Record<string, string> = { 'claude-code': '.claude/skills', codex: '.agents/skills', pi: '.agents/skills' };
// 假装 skills CLI：带全局选项的装到主目录下，不带的装到它运行时所在的目录下
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const agent = args[args.indexOf('--agent') + 1] ?? '';
  const root = args.includes('--global') ? home : cwd;
  if (root !== undefined) writeTree(root, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};
const installSolo = [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')];

describe('把第三方 Skill 装给 Pi', () => {
  it('装到全局：执行的正好是那一条 skills CLI 命令——agent 名是 pi、带全局选项，除了关遥测的两个不另带环境变量', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_PI, commandResult: installs, answers: installSolo });

    expect(result.commands).toEqual([SOLO_INTO_PI]);
  });

  it('确认前展示的就是之后执行的那一条；汇总里宿主是 Pi，位置在共用 skill 目录', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_PI, commandResult: installs, answers: installSolo });

    expect(flat(commandsOf(result.output))).toContain('npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent pi --yes --global ');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Pi\s+新装\s+~\S+note-taker$/m);
    expect(summaryOf(result.output)).toContain(join('~', '.agents', 'skills', 'note-taker'));
  });

  it('复核看的是共用 skill 目录：那里有 SKILL.md 才算装上', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_PI, commandResult: installs, answers: installSolo });

    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Pi\s+已安装$/m);
    expect(existsSync(join(result.home, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
  });

  it('命令把它装到了 Pi 自己的目录而共用 skill 目录里没有：判失败', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: (_, __, { home }) => void writeTree(home, { '.pi/agent/skills/note-taker/SKILL.md': '# note-taker\n' }),
      answers: installSolo,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Pi\s+失败\s+安装命令已结束，但目标位置没有 SKILL\.md$/m);
  });

  it('装到项目：命令不带全局选项、在项目目录下运行，别的一个字不变；复核看项目目录的 .agents/skills', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: installs,
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([
      {
        command: 'npx',
        args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'pi', '--yes'],
        env: NO_TELEMETRY,
        cwd: result.project,
      },
    ]);
    expect(commandsOf(result.output)).not.toContain('--global');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Pi\s+新装\s+\.agents\S+note-taker$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Pi\s+已安装$/m);
    expect(existsSync(join(result.project, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('状态只看共用 skill 目录下有没有那个目录；清单里各个 skill 各写各的', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      home: { '.agents/skills/paper-comic/notes.txt': '用户自己放的\n', '.agents/skills/note-taker/SKILL.md': '# note-taker\n' },
      answers: [choose(WEB_SEARCH), pick('paper-kit'), pick(), choose('退出')],
    });
    const checklist = result.output.split('? paper-kit 里有 3 个 skill，选择要装的')[1] ?? '';

    expect(listOf(result.output)).toMatch(/^ □ paper-kit\s+已装 1\/3\s/m);
    expect(listOf(result.output)).toMatch(/^ □ solo-notes\s+已装\s{2,}只含一个 skill/m);
    expect(checklist).toMatch(/^\s+名称\s+Pi\s/m);
    expect(checklist).toMatch(/^ □ paper-reader\s+未装\s/m);
    expect(checklist).toMatch(/^ □ paper-comic\s+已装\s/m);
  });

  it('目标位置已有同名目录：另问，缺省不覆盖，那条命令不执行', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_PI,
      home: { '.agents/skills/note-taker/notes.txt': '用户自己放的\n' },
      commandResult: installs,
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'note-taker')} 已有同名目录，要覆盖它吗？ (y/N)`);
    expect(result.commands).toEqual([]);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'note-taker'))).toEqual(['notes.txt']);
    expect(result.output).toMatch(/^\s+–\s+note-taker\s+Pi\s+跳过\s+未同意覆盖，保持原样$/m);
  });

  it('条目用 hosts 限定了宿主：写了 pi 的照常装给 Pi，没写的不可选', async () => {
    const forPi = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: ONLY_PI,
      commandResult: installs,
      answers: installSolo,
    });
    const notForPi = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['claude-code'] }]),
      onPath: ONLY_PI,
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(forPi.commands).toEqual([SOLO_INTO_PI]);
    expect(listOf(notForPi.output)).toMatch(/^ – solo-notes\s+需要别的 AI Agent\s/m);
  });

  it('选了 Claude Code 和 Pi：每个宿主一条命令，各带各的 agent 名和环境变量，各落在自己的目录', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), pick('Claude Code', 'Pi'), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([
      {
        command: 'npx',
        args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'claude-code', '--yes', '--global'],
        env: { ...NO_TELEMETRY, CLAUDE_CONFIG_DIR: '' },
      },
      SOLO_INTO_PI,
    ]);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Pi\s+已安装$/m);
  });

  it('英文界面：汇总、命令和结果', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: thirdParty(),
      onPath: ONLY_PI,
      commandResult: installs,
      answers: [choose('Web search & docs retrieval'), pick('solo-notes'), choose('Install'), choose('Exit')],
    });

    expect(result.commands).toEqual([SOLO_INTO_PI]);
    expect(result.output).toMatch(/^\s+note-taker\s+Pi\s+new\s+~\S+note-taker$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Pi\s+installed$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

// 样例的两个 MCP 在同一个用途下
const withMcps = (mcps: unknown[] = SAMPLE_MCPS): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...mcps) } });
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };

// Pi 的适配还没有 MCP 配置：它的 MCP 安装器不装
describe('Pi 的 MCP 安装器不装', () => {
  it('只检测到 Pi：MCP 的行不可选，原因是需要别的 AI Agent；一条命令都不执行', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
    expect(listOf(result.output)).toMatch(/^ – tracker-remote\s+需要别的 AI Agent\s/m);
    expect(result.output).not.toContain('只能装到全局');
    expect(result.commands).toEqual([]);
  });

  it('只检测到 Pi、选了项目：原因仍是需要别的 AI Agent——换成全局也装不进它；列表上方没有说明', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
    expect(result.output).not.toContain('只能装到全局');
    expect(result.output).not.toContain('读不到');
  });

  it('同一张列表里的 skill 照常装给 Pi，MCP 仍不可选', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      onPath: ONLY_PI,
      answers: [choose(WEB_SEARCH), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
    expect(existsSync(join(result.home, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([]);
  });

  it('选了 Claude Code 和 Pi：Pi 那一栏每个 MCP 都写不支持，Claude Code 那一栏照常；行仍可选', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), pick('Claude Code', 'Pi'), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Pi\s+说明$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s+不支持\s/m);
    expect(result.output).not.toContain('只能装到全局');
  });

  it('勾上的 MCP 只装进 Claude Code：汇总、命令、结果里都没有 Pi，没有一条 pi 命令', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), pick('Claude Code', 'Pi'), pick('docs-local'), choose('开始安装'), choose('退出')],
    });
    const fromSummary = result.output.slice(result.output.indexOf('── 将安装'));

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(fromSummary).toMatch(/^\s+docs-local\s+Claude Code\s+新装$/m);
    expect(fromSummary).toMatch(/^── 将执行 1 条命令 ─+$/m);
    expect(fromSummary).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(fromSummary).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(fromSummary).not.toMatch(/\bPi\b/);
  });

  it('Pi 的配置文件不读也不写：里面写坏了也不提，装完没有多出 .pi', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_PI,
      home: { '.pi/agent/mcp.json': '{ 写坏了' },
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });
    const clean = await run({ catalog: withMcps(), onPath: ONLY_PI, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).not.toContain('读不到');
    expect(read(result.home, '.pi', 'agent', 'mcp.json')).toBe('{ 写坏了');
    expect(filesUnder(clean.home)).toEqual([]);
    expect(filesUnder(clean.project)).toEqual([]);
  });

  it('英文界面：那一栏和不可选的原因都是英文', async () => {
    const en = { argv: ['--lang', 'en'], catalog: withMcps() };
    const both = await run({ ...en, onPath: ALL_HOSTS, answers: [choose('Web search & docs retrieval'), pick('Claude Code', 'Pi'), pick(), pick(), choose('Exit')] });
    const onlyPi = await run({ ...en, onPath: ONLY_PI, answers: [choose('Web search & docs retrieval'), pick(), choose('Exit')] });

    expect(both.output).toMatch(/^ □ docs-local\s+none\s+unsupported\s/m);
    expect(onlyPi.output).toMatch(/^ – docs-local\s+needs another AI Agent\s/m);
  });
});

describe('三个宿主都选了时的 80 列', () => {
  // 四种类型都有：本仓库的 skill、第三方 Skill、MCP 同在一个用途下
  const everything = (): string =>
    catalogDir({
      catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search', 'beta-pack': 'web-search' } },
    });
  // 状态最宽的样子：三个宿主下各有不是本工具装的、版本不同的
  const home = {
    '.claude/skills/alpha/SKILL.md': '用户自己写的\n',
    '.agents/skills/alpha/SKILL.md': '用户自己写的\n',
    ...installed('.claude/skills', 'beta-pack', '2.0'),
    ...installed('.agents/skills', 'beta-pack', '2.0'),
  };
  // 两种行本来就超，不量：分区标题的横线照例画满 80 列；预设应答的提问器把光标所在行的说明全文记下来时不折行
  const prose = new Set([...SAMPLE_SKILLS, ...SAMPLE_THIRD_PARTY, ...SAMPLE_MCPS].flatMap((entry) => Object.values(entry.description)));
  const widest = (output: string): number =>
    Math.max(...output.split('\n').filter((line) => !line.includes('──') && !prose.has(line)).map((line) => displayWidth(line)));

  it('宿主行、宿主选择、列表、清单、汇总、结果：每一行都不超出第 79 列', async () => {
    const result = await run({
      catalog: everything(),
      onPath: ALL_HOSTS,
      home,
      commandResult: installs,
      answers: [
        choose(WEB_SEARCH),
        accept(),
        pick('alpha', 'beta-pack', 'paper-kit', 'solo-notes', 'docs-local', 'tracker-remote'),
        pick('paper-reader', 'paper-comic'),
        choose('开始安装'),
        yes(),
        yes(),
        yes(),
        choose('退出'),
      ],
    });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓\s+Pi ✓$/m);
    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\b/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Pi\s+已安装 1\.0\.0$/m);
    expect(widest(result.screen)).toBeLessThanOrEqual(79);
  });

  it('英文界面也是', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: everything(),
      onPath: ALL_HOSTS,
      home,
      commandResult: installs,
      answers: [
        choose('Web search & docs retrieval'),
        accept(),
        pick('alpha', 'beta-pack', 'paper-kit', 'solo-notes', 'docs-local', 'tracker-remote'),
        pick('paper-reader', 'paper-comic'),
        choose('Install'),
        yes(),
        yes(),
        yes(),
        choose('Exit'),
      ],
    });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Pi\s+installed 1\.0\.0$/m);
    expect(widest(result.screen)).toBeLessThanOrEqual(79);
  });
});
