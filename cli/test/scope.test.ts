import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayWidth } from '../src/text.ts';
import {
  EMPTY_CATALOG,
  KEY,
  SAMPLE_APPS,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  STYLE_CODE,
  accept,
  catalogDir,
  choose,
  no,
  pick,
  run,
  underWebSearch,
  writeTree,
  yes,
} from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const BOTH_HOSTS = ['claude', 'codex'];
const QUESTION = '? 装到哪里';
const LIST = '? 选择要安装的条目';
// 提问画出来的那几行：从它起到列表的提问之前
const questionOf = (output: string): string => output.slice(output.indexOf(QUESTION), output.indexOf(LIST));
const listOf = (output: string): string => output.split(LIST)[1] ?? '';
const summaryOf = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));
const commandsOf = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
// 一个目录下每个文件的内容：相对路径（一律用 / 分隔）→ 内容
const contentsOf = (dir: string): Record<string, string> =>
  Object.fromEntries(
    filesUnder(dir)
      .filter((path) => statSync(join(dir, path)).isFile())
      .map((path) => [path.split(sep).join('/'), read(dir, path)]),
  );
const inOrder = (screen: string, texts: string[]): void => {
  const order = texts.map((text) => screen.indexOf(text));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
};
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});
// 从「推荐」进，选项目，装上 alpha
const alphaIntoProject = [choose('推荐'), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')];

describe('选择安装范围', () => {
  it('进入列表之前问装到哪里：两项依次是全局、项目，各带一句说明', async () => {
    const result = await run({ answersScope: true, answers: [choose('推荐'), accept(), pick(), choose('退出')] });

    expect(questionOf(result.output)).toMatch(/^\? 装到哪里\n+\s*全局\s+对这台机器上的所有项目生效\n\s*项目\s+只对当前目录生效：\S+\n/);
  });

  it('光标起始在全局：什么都不动直接回车，装到的是主目录下的全局 skill 目录', async () => {
    const result = await run({
      answersScope: true,
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(existsSync(join(result.home, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.project)).toEqual([]);
  });

  it('检测到两个宿主时排在选宿主之后', async () => {
    const result = await run({ onPath: BOTH_HOSTS, answersScope: true, answers: [choose('推荐'), accept(), accept(), pick(), pick(), choose('退出')] });

    inOrder(result.output, ['? 选择用途', '? 装进哪些 AI Agent', QUESTION, LIST]);
  });

  it('每次进入列表都问，不记上一次的选择：上次选了项目，这次光标仍起始在全局', async () => {
    const result = await run({
      answersScope: true,
      answers: [...alphaIntoProject.slice(0, -1), choose('推荐'), accept(), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split(QUESTION)).toHaveLength(3);
    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.home, '.claude', 'skills', 'beta-pack', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.project, '.claude', 'skills', 'beta-pack'))).toBe(false);
  });

  it('列表里一个都不勾就确认：问过宿主就回宿主选择，之后重问安装范围', async () => {
    const result = await run({
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: [choose('推荐'), accept(), choose('项目'), pick(), accept(), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output.split('? 装进哪些 AI Agent')).toHaveLength(4);
    expect(result.output.split(QUESTION)).toHaveLength(3);
  });

  it('在汇总里选「返回修改」回到列表，不重问安装范围，仍装到项目', async () => {
    const result = await run({
      answersScope: true,
      answers: [choose('推荐'), choose('项目'), pick('alpha'), choose('返回修改'), accept(), choose('开始安装'), choose('退出')],
    });

    expect(result.output.split(QUESTION)).toHaveLength(2);
    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
  });

  it('一个宿主都没检测到时不问', async () => {
    const result = await run({ onPath: [], answersScope: true, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(result.output).not.toContain('装到哪里');
  });

  it('列表里只有工具和外部项目时不问：它们没有安装范围', async () => {
    const result = await run({
      catalog: catalogDir({ index: { version: 1, skills: [] }, catalog: { ...EMPTY_CATALOG, tools: underWebSearch(...SAMPLE_TOOLS), apps: underWebSearch(...SAMPLE_APPS) } }),
      answersScope: true,
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(result.output).not.toContain('装到哪里');
  });

  it('「项目」后面写着当前目录；一行放不下时从前面截，留住末尾', async () => {
    const result = await run({ answersScope: true, answers: [choose('推荐'), accept(), pick(), choose('退出')] });
    const row = questionOf(result.output).split('\n').find((line) => line.trimStart().startsWith('项目')) ?? '';

    // 架子给的项目目录在系统的临时目录下，路径比一行长
    expect(row).toMatch(/只对当前目录生效：…\S+$/);
    expect(row.endsWith(basename(result.project))).toBe(true);
    expect(displayWidth(row)).toBeLessThanOrEqual(79);
  });

  it('英文界面', async () => {
    const result = await run({ argv: ['--lang', 'en'], answersScope: true, answers: [choose('Recommended'), accept(), pick(), choose('Exit')] });
    const question = result.output.slice(result.output.indexOf('? Install where'), result.output.indexOf('? Pick entries to install'));

    expect(question).toMatch(/^\? Install where\n+\s*Global\s+applies to every project on this machine\n\s*Project\s+applies to the current directory only: \S+\n/);
    for (const line of question.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(79);
  });
});

describe('把本仓库的 skill 装到项目', () => {
  it('它的全部文件和安装标记落在项目目录的 .claude/skills 下', async () => {
    const result = await run({ answers: alphaIntoProject, answersScope: true });

    expect(filesUnder(join(result.project, '.claude', 'skills', 'alpha'))).toEqual(['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')]);
    expect(JSON.parse(read(result.project, '.claude', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
  });

  it('主目录下的全局 skill 目录没有任何变化', async () => {
    const before = { ...installed('.claude/skills', 'beta-pack', '2.0'), '.claude/skills/alpha/SKILL.md': '用户自己放在全局的\n' };
    const result = await run({ home: before, answers: alphaIntoProject, answersScope: true });

    // 每个文件都在、内容一字不差，也没有多出别的
    expect(contentsOf(result.home)).toEqual(before);
  });

  it('Codex 的落在项目目录的 .agents/skills 下', async () => {
    const result = await run({ onPath: ['codex'], answers: alphaIntoProject, answersScope: true });

    expect(existsSync(join(result.project, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('汇总里的位置写成相对当前目录的路径，不是主目录下的路径', async () => {
    const result = await run({
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: [choose('推荐'), accept(), choose('项目'), pick('alpha'), choose('取消'), choose('退出')],
    });
    const summary = summaryOf(result.output);

    expect(summary).toMatch(new RegExp(`^\\s+alpha\\s+Claude Code\\s+新装\\s+${join('.claude', 'skills', 'alpha').replaceAll('\\', '\\\\')}$`, 'm'));
    expect(summary).toMatch(new RegExp(`^\\s+Codex\\s+新装\\s+${join('.agents', 'skills', 'alpha').replaceAll('\\', '\\\\')}$`, 'm'));
    expect(summary).not.toContain('~');
  });

  it('状态按范围读：全局装过而项目没装过，项目范围下显示未装', async () => {
    const result = await run({
      home: installed('.claude/skills', 'alpha', '1.0.0'),
      answersScope: true,
      answers: [choose('推荐'), accept(), pick(), choose('推荐'), choose('项目'), pick(), choose('退出')],
    });
    const [, global = '', project = ''] = result.output.split(LIST);

    expect(global).toMatch(/^ □ alpha\s+已装 1\.0\.0\s/m);
    expect(project).toMatch(/^ □ alpha\s+未装\s/m);
  });

  it('反过来也一样：项目里装过而全局没装过，全局范围下显示未装；项目范围下照常比版本', async () => {
    const result = await run({
      project: installed('.claude/skills', 'beta-pack', '2.0'),
      answersScope: true,
      answers: [choose('推荐'), accept(), pick(), choose('推荐'), choose('项目'), pick('beta-pack'), choose('开始安装'), choose('退出')],
    });
    const [, global = '', project = ''] = result.output.split(LIST);

    expect(global).toMatch(/^ □ beta-pack\s+未装\s/m);
    expect(project).toMatch(/^ □ beta-pack\s+2\.0 → 2\.3\s/m);
    expect(summaryOf(result.output)).toMatch(/^\s+beta-pack\s+Claude Code\s+覆盖\s+\.claude\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+Claude Code\s+已安装 2\.0 → 2\.3$/m);
    expect(JSON.parse(read(result.project, '.claude', 'skills', 'beta-pack', '.oxy-tools.json'))).toMatchObject({ version: '2.3' });
  });

  it('项目里已有不是本工具装的同名目录：另问，问的是项目里的那个路径，缺省不覆盖', async () => {
    const result = await run({
      project: { '.claude/skills/alpha/SKILL.md': '项目里自己写的\n' },
      answersScope: true,
      answers: [choose('推荐'), choose('项目'), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ □ alpha\s+非本工具安装\s/m);
    expect(result.output).toContain(`? ${join('.claude', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？ (y/N)`);
    expect(read(result.project, '.claude', 'skills', 'alpha', 'SKILL.md')).toBe('项目里自己写的\n');
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Claude Code\s+跳过\s+未同意覆盖，保持原样$/m);
  });

  it('同意了才覆盖项目里的那个目录', async () => {
    const result = await run({
      project: { '.claude/skills/alpha/SKILL.md': '项目里自己写的\n' },
      answersScope: true,
      answers: [choose('推荐'), choose('项目'), pick('alpha'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(read(result.project, '.claude', 'skills', 'alpha', 'SKILL.md')).toBe('# alpha\n');
  });

  it('全局有不是本工具装的同名目录不碍事：装到项目时不问它', async () => {
    const result = await run({ home: { '.claude/skills/alpha/SKILL.md': '全局里自己写的\n' }, answers: alphaIntoProject, answersScope: true });

    expect(result.output).not.toContain('要覆盖它吗');
    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', '.oxy-tools.json'))).toBe(true);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const THIRD_PARTY = { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY };
const thirdParty = (catalog: Record<string, unknown> = {}): string => catalogDir({ catalog: { ...THIRD_PARTY, ...catalog } });
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
// skills CLI 不带全局选项时把 skill 装到哪：每个宿主一个目录，相对它运行时所在的目录
const SKILLS_DIR: Record<string, string> = { 'claude-code': '.claude/skills', codex: '.agents/skills' };
// 假装 skills CLI：带全局选项的装到主目录下，不带的装到它运行时所在的目录下
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const agent = args[args.indexOf('--agent') + 1] ?? '';
  const root = args.includes('--global') ? home : cwd;
  if (root !== undefined) writeTree(root, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};
const soloIntoProject = [choose(WEB_SEARCH), choose('项目'), pick('solo-notes'), choose('开始安装'), choose('退出')];

describe('把第三方 Skill 装到项目', () => {
  it('命令不带全局选项，并且在项目目录下运行；别的一个字不变', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs, answers: soloIntoProject, answersScope: true });

    expect(result.commands).toEqual([
      {
        command: 'npx',
        args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'claude-code', '--yes'],
        env: { ...NO_TELEMETRY, CLAUDE_CONFIG_DIR: '' },
        cwd: result.project,
      },
    ]);
  });

  it('汇总里展示的就是那一条：没有 --global；位置是相对当前目录的路径', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs, answers: soloIntoProject, answersScope: true });

    expect(commandsOf(result.output).replace(/\s+/g, ' ')).toContain('npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent claude-code --yes ');
    expect(commandsOf(result.output)).not.toContain('--global');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Claude Code\s+新装\s+\.claude\S+note-taker$/m);
  });

  it('复核看的是项目目录：那里有 SKILL.md 才算装上', async () => {
    const result = await run({ catalog: thirdParty(), commandResult: installs, answers: soloIntoProject, answersScope: true });

    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(existsSync(join(result.project, '.claude', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('命令把它装到了全局而项目目录里没有：判失败', async () => {
    const result = await run({
      catalog: thirdParty(),
      commandResult: (_, __, { home }) => void writeTree(home, { '.claude/skills/note-taker/SKILL.md': '# note-taker\n' }),
      answers: soloIntoProject,
      answersScope: true,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+Claude Code\s+失败\s+安装命令已结束，但目标位置没有 SKILL\.md$/m);
  });

  it('两个宿主：每个宿主各一条命令，都在项目目录下运行，各落在自己的目录', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: BOTH_HOSTS,
      commandResult: installs,
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands.map(({ args, cwd }) => [args.at(-2), args.includes('--global'), cwd])).toEqual([
      ['claude-code', false, result.project],
      ['codex', false, result.project],
    ]);
    expect(existsSync(join(result.project, '.claude', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.project, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
  });

  it('状态按范围读：全局装过的在项目范围下显示未装，项目里装过的显示已装', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: { '.claude/skills/note-taker/SKILL.md': '# note-taker\n' },
      project: { '.claude/skills/paper-comic/SKILL.md': '# paper-comic\n' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ □ paper-kit\s+已装 1\/3\s/m);
    expect(listOf(result.output)).toMatch(/^ □ solo-notes\s+未装\s/m);
  });

  it('项目里已有同名目录：另问，问的是项目里的那个路径，缺省不覆盖，命令不执行', async () => {
    const result = await run({
      catalog: thirdParty(),
      project: { '.claude/skills/note-taker/notes.txt': '项目里自己放的\n' },
      commandResult: installs,
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('solo-notes'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output).toContain(`? ${join('.claude', 'skills', 'note-taker')} 已有同名目录，要覆盖它吗？ (y/N)`);
    expect(result.commands).toEqual([]);
    expect(filesUnder(join(result.project, '.claude', 'skills', 'note-taker'))).toEqual(['notes.txt']);
  });

  it('全局已有同名目录不碍事：装到项目时不问它', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: { '.claude/skills/note-taker/SKILL.md': '# 全局的\n' },
      commandResult: installs,
      answers: soloIntoProject,
      answersScope: true,
    });

    expect(result.output).not.toContain('要覆盖它吗');
    expect(result.commands).toHaveLength(1);
  });

  it('清单里各个 skill 的状态也按项目目录来', async () => {
    const result = await run({
      catalog: thirdParty(),
      home: { '.claude/skills/paper-reader/SKILL.md': '# paper-reader\n' },
      project: { '.claude/skills/paper-deck/SKILL.md': '# paper-deck\n' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('paper-kit'), pick(), choose('退出')],
    });
    const checklist = result.output.split('? paper-kit 里有 3 个 skill，选择要装的')[1] ?? '';

    expect(checklist).toMatch(/^ □ paper-reader\s+未装\s/m);
    expect(checklist).toMatch(/^ □ paper-deck\s+已装\s/m);
  });
});

describe('工具不受安装范围影响', () => {
  const withTools = (): string => catalogDir({ catalog: { ...THIRD_PARTY, tools: underWebSearch(...SAMPLE_TOOLS) } });
  const installTool = (scope: string) => [choose(WEB_SEARCH), choose(scope), pick('fetcher'), choose('开始安装'), choose('退出')];
  const toolRows = (output: string): string[] => listOf(output).split('\n').filter((line) => /^ . (fetcher|linter)\s/.test(line));

  it('选了项目，工具的状态、汇总里的写法、执行的命令都和选全局时一样', async () => {
    const home = { '.linter/bin/linter': '' };
    const global = await run({ catalog: withTools(), home, answersScope: true, answers: installTool('全局') });
    const project = await run({ catalog: withTools(), home, answersScope: true, answers: installTool('项目') });

    expect(toolRows(project.output)).toEqual(toolRows(global.output));
    expect(toolRows(project.output)).toHaveLength(2);
    expect(toolRows(project.output).join('\n')).toMatch(/linter\s+已安装/);
    expect(summaryOf(project.output)).toBe(summaryOf(global.output));
    expect(commandsOf(project.output)).toBe(commandsOf(global.output));
    expect(project.commands).toEqual(global.commands);
    expect(project.commands).toEqual([{ command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true }]);
  });

  it('按主目录下的路径检查的工具，选了项目仍去主目录看，不去项目目录', async () => {
    const result = await run({
      catalog: withTools(),
      project: { '.linter/bin/linter': '' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')],
    });

    expect(toolRows(result.output).join('\n')).toMatch(/linter\s+未安装/);
  });
});

describe('项目范围下的 MCP（这一步还装不了）', () => {
  const withMcps = (): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS) } });

  it('MCP 的行不可选，状态的位置写明原因', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+暂时只能装到全局\s/m);
    expect(listOf(result.output)).toMatch(/^ – tracker-remote\s+暂时只能装到全局\s/m);
    expect(result.commands).toEqual([]);
  });

  it('选全局时照常可选', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: [choose(WEB_SEARCH), choose('全局'), pick(), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
  });

  it('不去读用户级配置：它写坏了也不提', async () => {
    const result = await run({
      catalog: withMcps(),
      home: { '.claude.json': '{ 写坏了' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')],
    });

    expect(result.output).not.toContain('读不到');
  });

  it('同一张列表里的 skill 照常可选、照常装到项目', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([]);
  });

  it('英文界面的原因；任何一行不超过 79 列', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: BOTH_HOSTS,
      argv: ['--lang', 'en'],
      answersScope: true,
      answers: [choose('Web search & docs retrieval'), accept(), choose('Project'), pick(), pick(), choose('Exit')],
    });

    const rows = result.output.split('\n').filter((line) => line.startsWith(' – '));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^ – docs-local\s+global only for now\s/);
    for (const row of rows) expect(displayWidth(row)).toBeLessThanOrEqual(79);
  });
});

// 交互库自带的样式看的是真实进程的环境：不强行打开的话它永远不上色，主题里漏盖了哪个样式函数也查不出来
describe('真实的画面：选择安装范围', () => {
  beforeEach(() => vi.stubEnv('FORCE_COLOR', '1'));
  afterEach(() => vi.unstubAllEnvs());
  // 按键提示是每个提问最后画出来的一行，等到它就说明这个提问已经在等按键了
  const HINT = '⏎ 选择';
  const PICK_HINT = '⏎ 确认';

  it('提问中：光标在「全局」上，下面是「项目」，下方是单选的按键提示', async () => {
    const result = await run({ answersScope: true, keys: [[HINT, KEY.enter], [HINT, KEY.ctrlC]] });
    const question = result.output.slice(result.output.lastIndexOf('装到哪里'));

    expect(question).toMatch(/^▸ 全局\s+对这台机器上的所有项目生效$/m);
    expect(question).toMatch(/^\s+项目\s+只对当前目录生效：…\S+$/m);
    expect(question).toMatch(/↑↓ 移动 · ⏎ 选择$/m);
    expect(result.exitCode).toBe(130);
  });

  it('直接回车就过：收成一行写着全局，接着是列表', async () => {
    const result = await run({ answersScope: true, keys: [[HINT, KEY.enter], [HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 装到哪里 · 全局$/m);
    expect(result.output).toContain('选择要安装的条目');
  });

  it('下移到「项目」再回车：收成一行写着项目', async () => {
    const result = await run({ answersScope: true, keys: [[HINT, KEY.enter], [HINT, KEY.down], ['▸ 项目', KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 装到哪里 · 项目$/m);
  });

  it('架子缺省替用户按回车：脚本里不用写它，画面上照样有收成的那一行', async () => {
    const result = await run({ keys: [[HINT, KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 装到哪里 · 全局$/m);
  });

  it('选了项目：在 MCP 的行上按空格勾不上，列表下方说明这一项选不了；回车就是什么都没选', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS) } }),
      answersScope: true,
      keys: [
        [HINT, KEY.down],
        ['▸ 联网搜索与文档检索', KEY.enter],
        [HINT, KEY.down],
        ['▸ 项目', KEY.enter],
        [PICK_HINT, KEY.space],
        ['这一项现在选不了', KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });

    expect(result.output).toMatch(/^▸– docs-local\s+暂时只能装到全局\s/m);
    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).not.toContain('将安装');
    expect(result.commands).toEqual([]);
  });

  it('设置了 NO_COLOR 时不带样式码', async () => {
    const result = await run({ env: { NO_COLOR: '1' }, answersScope: true, keys: [[HINT, KEY.enter], [HINT, KEY.down], ['▸ 项目', KEY.enter], [PICK_HINT, KEY.ctrlC]] });

    expect(result.output).toMatch(/✓ 装到哪里 · 项目$/m);
    expect(result.raw).not.toMatch(STYLE_CODE);
  });

  it('没有 Unicode 的终端里，光标和省略号都退成 ASCII', async () => {
    const result = await run({ platform: 'win32', env: { TERM: '' }, answersScope: true, keys: [['回车 选择', KEY.enter], ['回车 选择', KEY.ctrlC]] });
    const question = result.output.slice(result.output.lastIndexOf('装到哪里'));

    expect(question).toMatch(/^> 全局\s+对这台机器上的所有项目生效$/m);
    expect(question).toMatch(/只对当前目录生效：\.\.\.\S+$/m);
    expect(question).not.toMatch(/[▸…]/);
  });
});
