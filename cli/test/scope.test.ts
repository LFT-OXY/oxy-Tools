import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayWidth } from '../src/text.ts';
import {
  EMPTY_CATALOG,
  KEY,
  KEYED_MCP,
  SAMPLE_APPS,
  SAMPLE_MCPS,
  SAMPLE_THIRD_PARTY,
  SAMPLE_TOOLS,
  STYLE_CODE,
  accept,
  blank,
  catalogDir,
  choose,
  no,
  pick,
  run,
  secret,
  underWebSearch,
  writeTree,
  yes,
} from './harness.ts';
import { screenLines } from './terminal.ts';

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

// 两个宿主把 MCP 装到项目的写法，2026-10-11 对照官方文档，并在本机用 claude 2.1.295、codex 0.162.0 在临时目录里实测过
// （任务 10-10-catalog-purpose-categories 的 research/project-mcp-trial-record.md）：Claude Code 带 --scope project、
// 在项目目录下运行，配置写进那里的 .mcp.json；Codex 的命令只管用户级配置，装不到项目
const withMcps = (...mcps: unknown[]): string =>
  catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...(mcps.length > 0 ? mcps : SAMPLE_MCPS)) } });
const mcpsIntoProject = (...names: string[]) => [choose(WEB_SEARCH), choose('项目'), pick(...names), choose('开始安装'), choose('退出')];

// 两种范围的配置文件里各有哪些名字：用户级的在主目录的 .claude.json，项目的在项目目录的 .mcp.json，都是顶层的 mcpServers
const mcpServers = (...names: string[]): string =>
  JSON.stringify({ mcpServers: Object.fromEntries(names.map((name) => [name, { type: 'stdio', command: 'old', args: [] }])) });
const browseProject = [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')];
const browseGlobal = [choose(WEB_SEARCH), choose('全局'), pick(), choose('退出')];
// 「开始安装吗」之前的那一段：汇总、将执行的命令、提醒都在里面
const beforeConfirm = (output: string): string => output.slice(output.indexOf('── 将安装'), output.indexOf('? 开始安装吗'));
// 命令过长时会折行：比对整条命令之前先把折行和缩进收成一个空格；中文的句子可以在任意两字之间折，比对前把空白全去掉
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ');
const squeezed = (text: string): string => text.replace(/\s+/g, '');
// 画面上的文字行：分区的横线照例画满 80 列，不算在「不超过 79 列」里
const textLines = (output: string): string[] => output.split('\n').filter((line) => !line.includes('──'));
// 假的 claude 照真的来：带 --scope project 的添加命令把名字写进运行目录的 .mcp.json
const writesProjectConfig = (command: string, args: readonly string[], { cwd }: { cwd?: string }): undefined => {
  if (command === 'claude' && args[1] === 'add' && args[3] === 'project' && cwd !== undefined) {
    const name = args.find((arg, at) => at > 3 && !arg.startsWith('-') && args[at - 1] !== '--transport' && args[at - 1] !== '-e');
    writeTree(cwd, { '.mcp.json': mcpServers(name ?? '') });
  }
};

describe('把 MCP 装到项目：Claude Code', () => {
  it('添加命令带它自带的项目范围，并且在项目目录下运行', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: mcpsIntoProject('docs-local') });

    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'], cwd: result.project },
    ]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(result.exitCode).toBe(0);
  });

  it('远程地址的也一样', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: mcpsIntoProject('tracker-remote') });

    expect(result.commands).toEqual([
      {
        command: 'claude',
        args: ['mcp', 'add', '--scope', 'project', '--transport', 'http', 'tracker-remote', 'https://mcp.example.org/mcp'],
        cwd: result.project,
      },
    ]);
  });

  it('汇总里展示的就是那一条；选「取消」时一条都没执行', async () => {
    const result = await run({
      catalog: withMcps(),
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('docs-local'), choose('取消'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+docs-local\s+Claude Code\s+新装$/m);
    expect(unwrapped(commandsOf(result.output))).toContain('1 claude mcp add --scope project docs-local -- npx -y @example/docs-mcp@latest ');
    expect(result.commands).toEqual([]);
  });

  it('安装器自己不在主目录里留下任何东西（命令是假的：宿主写不写用户级配置由真机核对盖着）', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: mcpsIntoProject('docs-local', 'tracker-remote') });

    expect(filesUnder(result.home)).toEqual([]);
  });

  it('选全局时一个字不变：用户级范围，不指定在哪个目录下运行', async () => {
    const result = await run({
      catalog: withMcps(),
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('全局'), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([{ command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] }]);
  });

  it('和 skill 一起勾：skill 落在项目目录，MCP 的命令在项目目录下运行', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      answersScope: true,
      answers: mcpsIntoProject('alpha', 'docs-local'),
    });

    expect(existsSync(join(result.project, '.claude', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ command: 'claude', cwd: result.project });
    inOrder(result.output, ['✓  alpha', '✓  docs-local']);
  });
});

describe('MCP 的状态按安装范围读', () => {
  it('选项目时看的是项目目录的 .mcp.json：那里有的显示已配置，只在用户级配置里有的显示未配置', async () => {
    const result = await run({
      catalog: withMcps(),
      home: { '.claude.json': mcpServers('tracker-remote') },
      project: { '.mcp.json': mcpServers('docs-local', 'something-else') },
      answersScope: true,
      answers: browseProject,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+已配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s/m);
  });

  it('选全局时看的是用户级配置，项目里的不算', async () => {
    const result = await run({
      catalog: withMcps(),
      home: { '.claude.json': mcpServers('tracker-remote') },
      project: { '.mcp.json': mcpServers('docs-local') },
      answersScope: true,
      answers: browseGlobal,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+已配置\s/m);
  });

  it('项目里还没有 .mcp.json 时都是未配置', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: browseProject });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
    expect(result.output).not.toContain('读不到');
  });

  it('项目里的配置不认 CLAUDE_CONFIG_DIR：仍看项目目录', async () => {
    const result = await run({
      catalog: withMcps(),
      env: { CLAUDE_CONFIG_DIR: '/nowhere' },
      project: { '.mcp.json': mcpServers('docs-local') },
      answersScope: true,
      answers: browseProject,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+已配置\s/m);
  });

  it('选项目时不读用户级配置：它写坏了也不提', async () => {
    const result = await run({ catalog: withMcps(), home: { '.claude.json': '{ 写坏了' }, answersScope: true, answers: browseProject });

    expect(result.output).not.toContain('读不到');
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
  });

  it('项目里的 .mcp.json 写坏了：列表上方说明读不到，状态是未知', async () => {
    const result = await run({ catalog: withMcps(), project: { '.mcp.json': '{ 写坏了' }, answersScope: true, answers: browseProject });

    expect(result.output).toMatch(/^\s+注意\s+读不到 Claude Code 的配置，无法判断哪些 MCP 已配置$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未知\s/m);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('项目里已配置的：先移除再添加，两条都带项目范围、都在项目目录下运行', async () => {
    const result = await run({
      catalog: withMcps(),
      project: { '.mcp.json': mcpServers('docs-local') },
      answersScope: true,
      answers: mcpsIntoProject('docs-local'),
    });

    expect(summaryOf(result.output)).toMatch(/^\s+docs-local\s+Claude Code\s+覆盖\s+已配置，先移除再添加$/m);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'remove', '--scope', 'project', 'docs-local'], cwd: result.project },
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'], cwd: result.project },
    ]);
  });

  it('状态未知的：先尝试移除，失败了也接着添加', async () => {
    const result = await run({
      catalog: withMcps(),
      project: { '.mcp.json': '[]' },
      commandResult: (_, args) => (args[1] === 'remove' ? { exitCode: 1 } : undefined),
      answersScope: true,
      answers: mcpsIntoProject('docs-local'),
    });

    expect(result.commands.map(({ args }) => args.slice(1, 4))).toEqual([['remove', '--scope', 'project'], ['add', '--scope', 'project']]);
    expect(result.output).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
  });

  it('添加命令非零退出：只这一项失败，写明哪一步和退出状态', async () => {
    const result = await run({ catalog: withMcps(), commandResult: () => ({ exitCode: 1 }), answersScope: true, answers: mcpsIntoProject('docs-local') });

    expect(result.output).toMatch(/^\s+✗\s+docs-local\s+Claude Code\s+失败\s+添加命令退出状态 1$/m);
    expect(result.exitCode).toBe(0);
  });

  it('装完再进同一个用途：项目范围下已配置，全局范围下仍是未配置', async () => {
    const result = await run({
      catalog: withMcps(),
      commandResult: writesProjectConfig,
      answersScope: true,
      answers: [
        choose(WEB_SEARCH), choose('项目'), pick('docs-local'), choose('开始安装'),
        choose(WEB_SEARCH), choose('项目'), pick(),
        choose(WEB_SEARCH), choose('全局'), pick(),
        choose('退出'),
      ],
    });
    const lists = result.output.split(LIST);

    expect(lists[2]).toMatch(/^ □ docs-local\s+已配置\s/m);
    expect(lists[3]).toMatch(/^ □ docs-local\s+未配置\s/m);
  });
});

describe('把带 key 的 MCP 装到项目', () => {
  const KEY_VALUE = 'sk-test-4f9a2c71d0';
  const TEAM = {
    name: 'SEARCH_TEAM_ID',
    required: false,
    description: { zh: '团队编号，按团队计费时填', en: 'Team id, for per-team billing' },
    url: 'https://example.com/search/teams',
  };
  const OPTIONAL_ONLY = { ...KEYED_MCP, env: [TEAM] };
  const keyedInto = (scope: string, ...keys: ReturnType<typeof secret>[]) => [choose(WEB_SEARCH), choose(scope), pick('search-keyed'), ...keys, choose('开始安装'), choose('退出')];

  it('照样能装：命令带着输入的值，在项目目录下运行', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answersScope: true, answers: keyedInto('项目', secret(KEY_VALUE)) });

    expect(result.commands).toEqual([
      {
        command: 'claude',
        args: ['mcp', 'add', '--scope', 'project', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'],
        cwd: result.project,
      },
    ]);
    expect(result.output).toMatch(/^\s+✓\s+search-keyed\s+Claude Code\s+已配置$/m);
  });

  it('确认之前警告：key 会以明文写进 .mcp.json，不要提交或发给别人；写的是变量名，没有值', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answersScope: true, answers: keyedInto('项目', secret(KEY_VALUE)) });

    expect(squeezed(beforeConfirm(result.output))).toContain('注意SEARCH_API_KEY会以明文写进.mcp.json，不要提交，也不要发给别人');
    expect(result.raw + result.stdout + result.stderr).not.toContain(KEY_VALUE);
  });

  it('警告排在「key 以占位符显示」之后', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answersScope: true, answers: keyedInto('项目', secret(KEY_VALUE)) });

    inOrder(result.output, ['── 将执行', 'key 以占位符显示', '会以明文写进', '? 开始安装吗']);
  });

  it('两个变量都填了：警告里两个名字都有', async () => {
    const result = await run({
      catalog: withMcps({ ...KEYED_MCP, env: [...KEYED_MCP.env, TEAM] }),
      answersScope: true,
      answers: keyedInto('项目', secret(KEY_VALUE), secret('team-42')),
    });

    expect(squeezed(beforeConfirm(result.output))).toContain('SEARCH_API_KEY、SEARCH_TEAM_ID会以明文写进.mcp.json');
    expect(result.raw).not.toContain('team-42');
  });

  it('可选的 key 留空：没有东西写进去，不警告', async () => {
    const result = await run({ catalog: withMcps(OPTIONAL_ONLY), answersScope: true, answers: keyedInto('项目', blank()) });

    expect(result.output).not.toContain('明文');
    expect(result.commands).toHaveLength(1);
  });

  it('选全局时没有这一行', async () => {
    const result = await run({ catalog: withMcps(KEYED_MCP), answersScope: true, answers: keyedInto('全局', secret(KEY_VALUE)) });

    expect(result.output).not.toContain('明文');
    expect(result.output).toContain('key 以占位符显示');
  });

  it('添加命令失败时 key 的值也不出现', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      commandResult: (command, args) => new Error(`spawn ${command} ${args.join(' ')} ENOENT`),
      answersScope: true,
      answers: keyedInto('项目', secret(KEY_VALUE)),
    });

    expect(result.output).toMatch(/^\s+✗\s+search-keyed\s+Claude Code\s+失败\s+添加命令没能运行$/m);
    expect(result.raw + result.stdout + result.stderr).not.toContain(KEY_VALUE);
  });

  it('英文界面的警告', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP),
      argv: ['--lang', 'en'],
      answersScope: true,
      answers: [choose('Web search & docs retrieval'), choose('Project'), pick('search-keyed'), secret(KEY_VALUE), choose('Cancel'), choose('Exit')],
    });

    expect(unwrapped(result.output)).toContain('Notice SEARCH_API_KEY will be stored in plain text in .mcp.json; do not commit or share it');
    for (const line of textLines(result.output.slice(result.output.indexOf('Install 1 item')))) expect(displayWidth(line)).toBeLessThanOrEqual(79);
  });
});

describe('装到项目的 MCP 要在 Claude Code 里批准', () => {
  it('确认之前说明：写进了当前目录的哪个文件，要在这个目录下启动 claude 批准之后才启用', async () => {
    const result = await run({ catalog: withMcps(), answersScope: true, answers: mcpsIntoProject('docs-local') });

    expect(squeezed(beforeConfirm(result.output))).toContain('注意ClaudeCode的MCP写进当前目录的.mcp.json，要你批准之后才启用：在这个目录下启动claude时它会问');
  });

  it('选全局时没有这一行', async () => {
    const result = await run({
      catalog: withMcps(),
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('全局'), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).not.toContain('批准');
  });

  it('这一轮没有 MCP 时没有这一行', async () => {
    const result = await run({ answersScope: true, answers: alphaIntoProject });

    expect(result.output).not.toContain('批准');
  });

  it('排在明文的警告之后、「必填的 key 没填」之前；几行提醒挨着', async () => {
    const result = await run({
      catalog: withMcps(KEYED_MCP, { ...KEYED_MCP, name: 'another-keyed' }),
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick('another-keyed', 'search-keyed'), blank(), secret('sk-test-0000'), choose('开始安装'), choose('退出')],
    });
    const notices = beforeConfirm(result.output).slice(beforeConfirm(result.output).indexOf('  注意'));

    inOrder(notices, ['key 以占位符显示', '会以明文写进', '批准之后才启用', 'another-keyed 缺少必填的']);
    expect(notices.trimEnd()).not.toMatch(/\n\s*\n/);
  });

  it('英文界面的说明', async () => {
    const result = await run({
      catalog: withMcps(),
      argv: ['--lang', 'en'],
      answersScope: true,
      answers: [choose('Web search & docs retrieval'), choose('Project'), pick('docs-local'), choose('Cancel'), choose('Exit')],
    });

    expect(unwrapped(result.output)).toContain(
      'Notice Claude Code saves MCP servers to .mcp.json here and enables them only once you approve: it asks when you start claude here',
    );
    for (const line of textLines(result.output.slice(result.output.indexOf('Install 1 item')))) expect(displayWidth(line)).toBeLessThanOrEqual(79);
  });
});

describe('Codex 的 MCP 装不到项目', () => {
  const twoHostsBrowse = [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')];
  const NOTICE = /^\s+注意\s+Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令$/m;

  it('两个宿主都选了：Codex 那一栏每个 MCP 都写不支持，Claude Code 那一栏照常；行仍可选', async () => {
    const result = await run({ catalog: withMcps(), onPath: BOTH_HOSTS, answersScope: true, answers: twoHostsBrowse });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持\s/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s+不支持\s/m);
  });

  it('列表上方写明原因', async () => {
    const result = await run({ catalog: withMcps(), onPath: BOTH_HOSTS, answersScope: true, answers: twoHostsBrowse });

    expect(result.output).toMatch(NOTICE);
    expect(result.output.search(NOTICE)).toBeLessThan(result.output.indexOf(LIST));
  });

  it('同时读不到 Claude Code 项目里的配置：两行说明挨着，它在前', async () => {
    const result = await run({ catalog: withMcps(), onPath: BOTH_HOSTS, project: { '.mcp.json': '{ 写坏了' }, answersScope: true, answers: twoHostsBrowse });

    expect(result.output).toMatch(/^\s+注意\s+Codex 的 MCP 只能装到全局：.*\n\s+注意\s+读不到 Claude Code 的配置，无法判断哪些 MCP 已配置$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未知\s+不支持\s/m);
  });

  it('列表里的 MCP 本来就都不支持 Codex：那一栏照样写不支持，但不说「只能装到全局」——换成全局也装不进它', async () => {
    const result = await run({
      catalog: withMcps({ ...SAMPLE_MCPS[0], hosts: ['claude-code'] }),
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: twoHostsBrowse,
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持\s/m);
    expect(result.output).not.toMatch(NOTICE);
  });

  it('选全局时没有这一行，Codex 那一栏照常是状态', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('全局'), pick(), pick(), choose('退出')],
    });

    expect(result.output).not.toMatch(NOTICE);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+未配置\s/m);
  });

  it('列表里没有 MCP 时没有这一行', async () => {
    const result = await run({ onPath: BOTH_HOSTS, answersScope: true, answers: [choose('推荐'), accept(), choose('项目'), pick(), pick(), choose('退出')] });

    expect(result.output).not.toMatch(NOTICE);
  });

  it('不读 Codex 的用户级配置：它写坏了也不提', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: BOTH_HOSTS,
      home: { '.codex/config.toml': '[mcp_servers' },
      answersScope: true,
      answers: twoHostsBrowse,
    });

    expect(result.output).not.toContain('读不到');
  });

  it('勾上的 MCP 只装进 Claude Code：汇总、命令、结果里都没有 Codex，也不提醒它的浏览器登录', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick('tracker-remote'), choose('开始安装'), choose('退出')],
    });

    expect(beforeConfirm(result.output)).not.toContain('Codex');
    expect(result.commands).toEqual([
      {
        command: 'claude',
        args: ['mcp', 'add', '--scope', 'project', '--transport', 'http', 'tracker-remote', 'https://mcp.example.org/mcp'],
        cwd: result.project,
      },
    ]);
    expect(result.output).toMatch(/^\s+✓\s+tracker-remote\s+Claude Code\s+已配置$/m);
    expect(result.output).not.toMatch(/tracker-remote\s+Codex/);
    expect(result.output).toContain('1 成功 · 0 失败');
  });

  it('只检测到 Codex：MCP 的行不可选，原因是只能装到全局；一条命令都不执行', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['codex'], answersScope: true, answers: browseProject });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+只能装到全局\s/m);
    expect(listOf(result.output)).toMatch(/^ – tracker-remote\s+只能装到全局\s/m);
    expect(result.output).toMatch(NOTICE);
    expect(result.commands).toEqual([]);
  });

  it('只检测到 Codex，选全局时照常可选', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['codex'], answersScope: true, answers: browseGlobal });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s/m);
  });

  it('只检测到 Codex：同一张列表里的 skill 照常装到项目', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      onPath: ['codex'],
      answersScope: true,
      answers: mcpsIntoProject('alpha'),
    });

    expect(existsSync(join(result.project, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(result.commands).toEqual([]);
  });

  it('只给 Codex 用的条目，两个宿主都选了：换成全局就装得了，原因是只能装到全局', async () => {
    const result = await run({
      catalog: withMcps({ ...SAMPLE_MCPS[0], hosts: ['codex'] }),
      onPath: BOTH_HOSTS,
      answersScope: true,
      answers: twoHostsBrowse,
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+只能装到全局\s/m);
  });

  it('只给 Claude Code 用的条目，只检测到 Codex：原因仍是需要别的 AI Agent', async () => {
    const result = await run({
      catalog: withMcps({ ...SAMPLE_MCPS[0], hosts: ['claude-code'] }),
      onPath: ['codex'],
      answersScope: true,
      answers: browseProject,
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
  });

  it('英文界面：栏里的词、原因和列表上方的说明；任何一行不超过 79 列', async () => {
    const two = await run({
      catalog: withMcps(),
      onPath: BOTH_HOSTS,
      argv: ['--lang', 'en'],
      answersScope: true,
      answers: [choose('Web search & docs retrieval'), accept(), choose('Project'), pick(), pick(), choose('Exit')],
    });
    const one = await run({
      catalog: withMcps(),
      onPath: ['codex'],
      argv: ['--lang', 'en'],
      answersScope: true,
      answers: [choose('Web search & docs retrieval'), choose('Project'), pick(), choose('Exit')],
    });

    expect(unwrapped(two.output)).toContain('Notice Codex MCP servers can only be installed globally: there is no command that writes them into a project ');
    expect(two.output).toMatch(/^ □ docs-local\s+none\s+unsupported\s/m);
    expect(one.output).toMatch(/^ – docs-local\s+global only\s/m);
    // 列表下方的说明全文在架子里不折行，只量列表上方的说明和表里的行：从安装范围的提问量到列表的最后一行
    const measured = [two.output, one.output].flatMap((output) => output.slice(output.indexOf('? Install where')).split('\n'));
    const rows = measured.filter((line) => /^ [□–] |^\s+Notice\s|^\s{12}\S/.test(line));
    expect(rows.filter((line) => /^ [□–] /.test(line))).toHaveLength(4);
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

  it('只检测到 Codex，选了项目：在 MCP 的行上按空格勾不上，列表下方说明这一项选不了；回车就是什么都没选', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS) } }),
      onPath: ['codex'],
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

    expect(result.output).toMatch(/^▸– docs-local\s+只能装到全局\s/m);
    expect(result.output).toMatch(/^\s+注意\s+这一项现在选不了$/m);
    expect(result.output).toMatch(/✓ 选择要安装的条目 · 返回$/m);
    expect(result.output).not.toContain('将安装');
    expect(result.commands).toEqual([]);
  });

  it('选了项目：在 Claude Code 下勾得上 MCP，汇总下方的两行提醒在提问的上方', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(KEYED_MCP) } }),
      answersScope: true,
      keys: [
        [HINT, KEY.down],
        ['▸ 联网搜索与文档检索', KEY.enter],
        [HINT, KEY.down],
        ['▸ 项目', KEY.enter],
        [PICK_HINT, KEY.space],
        ['■ search-keyed', KEY.enter],
        ['SEARCH_API_KEY', 'sk-test-4f9a2c71d0'],
        ['SEARCH_API_KEY', KEY.enter],
        [HINT, KEY.ctrlC],
      ],
    });
    const lines = await screenLines(result.raw);
    const at = (text: string): number => lines.findIndex((line) => line.includes(text));

    expect(at('会以明文写进 .mcp.json')).toBeGreaterThan(at('将执行 1 条命令'));
    expect(at('Claude Code 的 MCP 写进当前目录的 .mcp.json')).toBeGreaterThan(at('会以明文写进 .mcp.json'));
    expect(at('? 开始安装吗')).toBeGreaterThan(at('Claude Code 的 MCP 写进当前目录的 .mcp.json'));
    expect(lines.join('\n')).not.toContain('sk-test-4f9a2c71d0');
    for (const line of lines.filter((text) => !text.includes('──'))) expect(displayWidth(line)).toBeLessThanOrEqual(79);
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
