// 共用 skill 目录（.agents/skills，ADR-0005）：所选的宿主里有几个用的是同一个 skill 目录时，同一个 skill 只装一次，
// 汇总、进度、结果里各是一行，宿主那一格把这几个宿主的名字连起来；列表的说明里多一句话。网页界面那一边在 web-shared-skills.test.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import { EMPTY_CATALOG, SAMPLE_APPS, SAMPLE_MCPS, SAMPLE_THIRD_PARTY, SAMPLE_TOOLS, accept, catalogDir, choose, pick, run, underWebSearch, writeTree, yes } from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const CODEX_AND_PI = ['codex', 'pi'];
const ALL_HOSTS = ['claude', 'codex', 'pi'];
const LIST = '? 选择要安装的条目';
const listOf = (output: string): string => output.split(LIST)[1] ?? '';
// 汇总的那几张小表：到「将执行的命令」分区（没有就到确认的提问）为止
const summaryOf = (output: string): string => {
  const from = output.indexOf('── 将安装');
  const commands = output.indexOf('── 将执行', from);
  return output.slice(from, commands === -1 ? output.indexOf('? 开始安装吗', from) : commands);
};
const commandsOf = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
const resultsOf = (output: string): string => output.slice(output.indexOf('── 正在安装'));
// 折行会打断整条命令：把空白并成一个空格再比
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
// 一段画面里有内容的行数，不算分区标题、表头和合计
const rowCount = (text: string): number => text.split('\n').filter((line) => /\S/.test(line) && !/──|AI Agent|合计|注意/.test(line)).length;
const ALPHA_FILES = ['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')];

describe('同时选了 Codex 和 Pi：本仓库的 skill 只装一次', () => {
  it('汇总一行、结果一行，宿主那一格是「Codex、Pi」，合计 1 成功；共用 skill 目录下只有一份内容和安装标记', async () => {
    const result = await run({
      onPath: CODEX_AND_PI,
      answers: [choose('推荐'), pick('Codex', 'Pi'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Codex、Pi\s+新装\s+~\S+alpha$/m);
    expect(rowCount(summaryOf(result.output))).toBe(1);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Codex、Pi\s+已安装 1\.0\.0$/m);
    expect(rowCount(resultsOf(result.screen).split('? ')[0] ?? '')).toBe(1);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(JSON.parse(read(result.home, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home)).toEqual(['.agents']);
  });

  it('执行中的那一行也是一行，宿主那一格同样是「Codex、Pi」', async () => {
    const result = await run({
      onPath: CODEX_AND_PI,
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    // 进行中的那一行被结果改写掉了：从没擦过的原始输出里找
    expect(result.output).toMatch(/\S\s+alpha\s+Codex、Pi\s+正在下载…/);
    expect(result.output).not.toMatch(/alpha\s+Pi\s+正在下载/);
  });

  it('三个宿主都选了：每个 skill 两行——Claude Code 一行，「Codex、Pi」一行；两个目录各有内容和各自的安装标记', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      answers: [choose('推荐'), accept(), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+\.claude\S+alpha\n\s+Codex、Pi\s+新装\s+~\S+\.agents\S+alpha$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+beta-pack\s+Claude Code\s+新装\s+~\S+\.claude\S+beta-pack\n\s+Codex、Pi\s+新装\s+~\S+\.agents\S+beta-pack$/m);
    expect(rowCount(summaryOf(result.output))).toBe(4);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0\n\s+✓\s+alpha\s+Codex、Pi\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+4 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(join(result.home, '.claude', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(JSON.parse(read(result.home, '.claude', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(JSON.parse(read(result.home, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(readdirSync(result.home).sort()).toEqual(['.agents', '.claude']);
  });

  it('选了 Claude Code 和 Pi：它们的目录不同，仍是各一行', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      answers: [choose('推荐'), pick('Claude Code', 'Pi'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+\S+\n\s+Pi\s+新装\s+\S+$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('装到项目时同样归组：项目目录的 .agents/skills 下只写一次，主目录里什么都不多', async () => {
    const result = await run({
      onPath: CODEX_AND_PI,
      answersScope: true,
      answers: [choose('推荐'), accept(), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Codex、Pi\s+新装\s+\.agents\S+alpha$/m);
    expect(rowCount(summaryOf(result.output))).toBe(1);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex、Pi\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(join(result.project, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('英文界面：宿主那一格用英文的并列写法 Codex, Pi', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: CODEX_AND_PI,
      answers: [choose('Recommended'), accept(), pick('alpha'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+alpha\s+Codex, Pi\s+new\s+~\S+alpha$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex, Pi\s+installed 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+Total\s+1 succeeded · 0 failed · 0 skipped$/m);
  });
});

describe('共用 skill 目录里已有不是本工具装的同名 skill', () => {
  const mine = { '.agents/skills/alpha/SKILL.md': '用户自己写的\n' };

  it('只问一次要不要覆盖，缺省不覆盖；不同意时这一行是跳过，目录原样', async () => {
    const result = await run({
      onPath: CODEX_AND_PI,
      home: mine,
      // 多问一次就会因为没有预设的应答而失败
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Codex、Pi\s+覆盖\s+~\S+alpha\s+非本工具安装，另行确认$/m);
    expect(result.output.split('不是本工具装的，要覆盖它吗？').length - 1).toBe(1);
    expect(result.output).toMatch(/^\s+–\s+alpha\s+Codex、Pi\s+跳过\s+未同意覆盖，保持原样$/m);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 1 跳过$/m);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(['SKILL.md']);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('用户自己写的\n');
  });

  it('同意了就整目录替换，结果一行', async () => {
    const result = await run({
      onPath: CODEX_AND_PI,
      home: mine,
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(result.output).toMatch(/^\s+✓\s+alpha\s+Codex、Pi\s+已安装 1\.0\.0$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
  });

  it('三个宿主、两个目录里都有：问两次，各问各的路径', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      home: { ...mine, '.claude/skills/alpha/SKILL.md': '用户自己写的\n' },
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), accept(), accept(), choose('退出')],
    });

    expect(result.output).toContain(`? ${join('~', '.claude', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？`);
    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？`);
    expect(result.output.split('不是本工具装的，要覆盖它吗？').length - 1).toBe(2);
    expect(result.output).toMatch(/^\s+合计\s+0 成功 · 0 失败 · 2 跳过$/m);
  });
});

describe('列表里的状态不合并', () => {
  it('每个所选的宿主仍各有一栏；Codex 和 Pi 两栏写的一样', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      home: {
        '.agents/skills/alpha/SKILL.md': '# alpha\n',
        '.agents/skills/alpha/.oxy-tools.json': JSON.stringify({ name: 'alpha', version: '1.0.0', commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
        '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的\n',
      },
      answers: [choose('推荐'), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+说明$/m);
    expect(listOf(result.output)).toMatch(/^\s*□ alpha\s+未装\s+已装 1\.0\.0\s+已装 1\.0\.0\s/m);
    expect(listOf(result.output)).toMatch(/^\s*□ beta-pack\s+未装\s+非本工具安装\s+非本工具安装\s/m);
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
const SKILLS_DIR: Record<string, string> = { 'claude-code': '.claude/skills', codex: '.agents/skills', pi: '.agents/skills' };
// 假装 skills CLI：带全局选项的装到主目录下，不带的装到它运行时所在的目录下
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const agent = args[args.indexOf('--agent') + 1] ?? '';
  const root = args.includes('--global') ? home : cwd;
  if (root !== undefined) writeTree(root, { [`${SKILLS_DIR[agent]}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};

describe('同时选了 Codex 和 Pi：第三方 Skill 只执行一条命令', () => {
  it('展示的和执行的都只有一条，agent 名取这一组里排在最前的 Codex 的；汇总和结果各一行「Codex、Pi」', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([soloInto('codex')]);
    expect(flat(commandsOf(result.output))).toContain('npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent codex --yes --global ');
    expect(commandsOf(result.output)).not.toContain('--agent pi');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Codex、Pi\s+新装\s+~\S+note-taker$/m);
    expect(rowCount(summaryOf(result.output))).toBe(1);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Codex、Pi\s+已安装$/m);
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('三个宿主都选了：每个 skill 两条命令——Claude Code 一条带它的环境变量，共用 skill 目录一条', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ALL_HOSTS,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([soloInto('claude-code', { CLAUDE_CONFIG_DIR: '' }), soloInto('codex')]);
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Claude Code\s+新装\s+\S+\n\s+Codex、Pi\s+新装\s+\S+$/m);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('条目只支持 Pi：这一组里只算 Pi——命令的 agent 名是 pi，宿主那一格只写 Pi', async () => {
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: CODEX_AND_PI,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([soloInto('pi')]);
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Pi\s+新装\s+~\S+note-taker$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+Pi\s+已安装$/m);
  });

  it('条目只支持 Claude Code、三个宿主都选了：共用 skill 目录那一组一个都不支持，不出那一行', async () => {
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['claude-code'] }]),
      onPath: ALL_HOSTS,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([soloInto('claude-code', { CLAUDE_CONFIG_DIR: '' })]);
    expect(rowCount(summaryOf(result.output))).toBe(1);
    expect(summaryOf(result.output)).not.toContain('Codex');
    expect(result.output).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('含多个 skill 的条目：勾几个就几条命令，每个 skill 一行', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('paper-kit'), pick('paper-reader', 'paper-comic'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands.map(({ args }) => [args[args.indexOf('--skill') + 1], args[args.indexOf('--agent') + 1]])).toEqual([
      ['paper-reader', 'codex'],
      ['paper-comic', 'codex'],
    ]);
    expect(result.output).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('共用 skill 目录里已有同名目录：只问一次，缺省不覆盖，那条命令不执行', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
      home: { '.agents/skills/note-taker/notes.txt': '用户自己放的\n' },
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output.split('已有同名目录，要覆盖它吗？').length - 1).toBe(1);
    expect(result.commands).toEqual([]);
    expect(result.output).toMatch(/^\s+–\s+note-taker\s+Codex、Pi\s+跳过\s+未同意覆盖，保持原样$/m);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'note-taker'))).toEqual(['notes.txt']);
  });

  it('装到项目时同样只有一条：不带全局选项、在项目目录下运行', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: CODEX_AND_PI,
      commandResult: installs,
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([
      {
        command: 'npx',
        args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', 'codex', '--yes'],
        env: NO_TELEMETRY,
        cwd: result.project,
      },
    ]);
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Codex、Pi\s+新装\s+\.agents\S+note-taker$/m);
    expect(existsSync(join(result.project, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
  });
});

const NOTICE = 'Codex、Pi、omp 共用同一个 skill 文件夹：装给其中一个，另外两个也看得到';
const NOTICE_EN = 'Codex, Pi and omp share one skill folder: install for one and the other two see it too';
// 那句说明比一行长，照「注意」的规矩折行：把空白都去掉再比
const squash = (text: string): string => text.replace(/\s+/g, '');
// 列表上方的那一段：列表的提问之前的十来行
const aboveList = (output: string, list = LIST): string => squash(output.slice(0, output.indexOf(list)).split('\n').slice(-12).join('\n'));

describe('共用 skill 目录的那句说明', () => {
  it('只选了 Pi、列表里有 skill：列表上方一行「注意」，三个名字是固定的', async () => {
    const result = await run({ onPath: ['pi'], answers: [choose('推荐'), pick(), choose('退出')] });

    expect(aboveList(result.output)).toContain(squash(`注意${NOTICE}`));
  });

  it('只选了 Codex 时也有，哪怕 Pi 没检测到', async () => {
    const result = await run({ onPath: ['claude', 'codex'], answers: [choose('推荐'), pick('Codex'), pick(), pick(), choose('退出')] });

    expect(aboveList(result.output)).toContain(squash(`注意${NOTICE}`));
  });

  it('三个宿主都选了：只说一次', async () => {
    const result = await run({ onPath: ALL_HOSTS, answers: [choose('推荐'), accept(), pick(), pick(), choose('退出')] });

    expect(squash(result.output).split(squash(NOTICE)).length - 1).toBe(1);
  });

  it('只选了 Claude Code 时没有', async () => {
    const only = await run({ onPath: ['claude'], answers: [choose('推荐'), pick(), choose('退出')] });
    const unpicked = await run({ onPath: ALL_HOSTS, answers: [choose('推荐'), pick('Claude Code'), pick(), pick(), choose('退出')] });

    expect(squash(only.output)).not.toContain('共用同一个');
    expect(squash(unpicked.output)).not.toContain('共用同一个');
  });

  it('列表里只有第三方 Skill 时也有', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ['pi'], answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(aboveList(result.output)).toContain(squash(`注意${NOTICE}`));
  });

  it('列表里只有 MCP、工具、外部项目时没有', async () => {
    const result = await run({
      catalog: catalogDir({
        index: { version: 1, skills: [] },
        catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), tools: underWebSearch(...SAMPLE_TOOLS), apps: SAMPLE_APPS },
      }),
      onPath: CODEX_AND_PI,
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toContain('docs-local');
    expect(squash(result.output)).not.toContain('共用同一个');
  });

  it('排在 MCP 那几栏的说明之前，几行挨着', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search' } } }),
      onPath: ALL_HOSTS,
      // Codex 的配置读不了：它那一栏是未知，列表上方有「读不到配置」那一行
      home: { '.codex/config.toml': '这不是 TOML =\n' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('全局'), pick(), pick(), choose('退出')],
    });
    const lines = result.output.split('\n');
    const shared = lines.findIndex((line) => line.includes('共用同一个'));
    const unreadable = lines.findIndex((line) => line.includes('读不到 Codex 的配置'));

    expect(shared).toBeGreaterThan(-1);
    expect(unreadable).toBeGreaterThan(shared);
    // 两句之间没有空行
    expect(lines.slice(shared, unreadable).every((line) => /\S/.test(line))).toBe(true);
  });

  it('英文界面有对应的一句', async () => {
    const result = await run({ argv: ['--lang', 'en'], onPath: ['pi'], answers: [choose('Recommended'), pick(), choose('Exit')] });

    expect(aboveList(result.output, '? Pick entries to install')).toContain(squash(`Notice${NOTICE_EN}`));
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

describe('80 列：那句说明和合成一行的行', () => {
  // 四种类型都有，名字和状态都往宽里取：本仓库的 skill、第三方 Skill、MCP 同在一个用途下
  const everything = (): string =>
    catalogDir({
      catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search', 'beta-pack': 'web-search' } },
    });
  const home = {
    '.agents/skills/beta-pack/SKILL.md': '# beta-pack\n',
    '.agents/skills/beta-pack/.oxy-tools.json': JSON.stringify({ name: 'beta-pack', version: '2.0', commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
  };
  const joined = (screen: string, cell: string): string[] => screen.split('\n').filter((line) => line.includes(cell));
  const noticeLines = (screen: string, from: string, lines: number): string[] => {
    const all = screen.split('\n');
    const at = all.findIndex((line) => line.includes(from));
    return at === -1 ? [] : all.slice(at, at + lines);
  };

  it('三个宿主：带「Codex、Pi」的每一行、那句说明折成的两行，都不超出第 79 列', async () => {
    const result = await run({
      catalog: everything(),
      onPath: ALL_HOSTS,
      home,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('alpha', 'beta-pack', 'paper-kit', 'solo-notes'), pick('paper-reader', 'paper-comic'), choose('开始安装'), choose('退出')],
    });
    const rows = joined(result.screen, 'Codex、Pi');
    const notice = noticeLines(result.screen, 'Codex、Pi、omp', 2);

    // 汇总和结果里各有：两个本仓库的 skill、三个第三方的 skill
    expect(rows.filter((line) => !line.includes('omp') && !line.includes('·')).length).toBe(10);
    expect(Math.max(...rows.map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
    // 说明照「注意」的规矩折行：续行与话的左缘对齐
    expect(notice).toEqual(['  注意      Codex、Pi、omp 共用同一个 skill 文件夹：装给其中一个，另外两个也看', '            得到']);
    expect(Math.max(...notice.map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
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
        pick('alpha', 'beta-pack', 'paper-kit', 'solo-notes'),
        pick('paper-reader', 'paper-comic'),
        choose('Install'),
        choose('Exit'),
      ],
    });
    const rows = joined(result.screen, 'Codex, Pi');
    const notice = noticeLines(result.screen, 'Codex, Pi and omp', 2);

    expect(rows.filter((line) => !line.includes('omp') && !line.includes('·')).length).toBe(10);
    expect(Math.max(...rows.map((line) => displayWidth(line)))).toBeLessThanOrEqual(79);
    expect(notice).toEqual(['  Notice    Codex, Pi and omp share one skill folder: install for one and the', '            other two see it too']);
  });
});
