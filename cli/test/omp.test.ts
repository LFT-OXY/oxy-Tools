// omp 这个宿主：本仓库的 skill 和第三方 Skill 装进共用 skill 目录（.agents/skills，ADR-0005），skills CLI 不认识它、
// agent 名借用 pi；它的 MCP 安装器不装。检测到没有、「AI Agent」一行和宿主选择在 hosts.test.ts；网页界面那一边在 web-omp.test.ts。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayWidth } from '../src/text.ts';
import {
  EMPTY_CATALOG,
  KEYED_MCP,
  SAMPLE_MCPS,
  SAMPLE_SKILLS,
  SAMPLE_THIRD_PARTY,
  accept,
  catalogDir,
  choose,
  pick,
  run,
  secret,
  underWebSearch,
  writeTree,
  yes,
  type RunResult,
} from './harness.ts';

const WEB_SEARCH = '联网搜索与文档检索';
const WEB_SEARCH_EN = 'Web search & docs retrieval';
const ONLY_OMP = ['omp'];
const SHARED_THREE = ['codex', 'pi', 'omp'];
const ALL_HOSTS = ['claude', 'codex', 'pi', 'omp'];
const LIST = '? 选择要安装的条目';
const listOf = (output: string, list = LIST): string => output.split(list)[1] ?? '';
// 汇总的那几张小表：到「将执行的命令」分区（没有就到确认的提问）为止
const summaryOf = (output: string): string => {
  const from = output.indexOf('── 将安装');
  const commands = output.indexOf('── 将执行', from);
  return output.slice(from, commands === -1 ? output.indexOf('? 开始安装吗', from) : commands);
};
const commandsOf = (output: string): string => output.slice(output.indexOf('── 将执行'), output.indexOf('? 开始安装吗'));
const resultsOf = (output: string): string => output.slice(output.indexOf('── 正在安装'));
// 折行会打断整条命令和英文的句子：把空白并成一个空格再比
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const filesUnder = (dir: string): string[] => (existsSync(dir) ? (readdirSync(dir, { recursive: true }) as string[]).sort() : []);
const read = (...path: string[]): string => readFileSync(join(...path), 'utf8');
// 一段画面里有内容的行数，不算分区标题、表头、合计和提醒
const rowCount = (text: string): number => text.split('\n').filter((line) => /\S/.test(line) && !/──|AI Agent|合计|注意/.test(line)).length;
const ALPHA_FILES = ['.oxy-tools.json', 'SKILL.md', 'references', join('references', 'guide.md')];
/** 本工具装过之后留在 skill 目录里的那两个文件 */
const installed = (skillsDir: string, name: string, version: string): Record<string, string> => ({
  [`${skillsDir}/${name}/SKILL.md`]: `# ${name}，装的是 ${version}\n`,
  [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T00:00:00.000Z' }),
});

/**
 * 安装器从头到尾没有碰 omp：没有一条外部命令的命令名是 omp，主目录和项目目录下都没有出现 .omp。
 * 每一条装东西的用例最后都过它一遍
 */
function expectOmpUntouched(result: RunResult): void {
  expect(result.commands.map(({ command }) => command)).not.toContain('omp');
  expect(readdirSync(result.home)).not.toContain('.omp');
  expect(readdirSync(result.project)).not.toContain('.omp');
}

// 「联网搜索与文档检索」下的两个 MCP：docs-local 是本地进程的，tracker-remote 是远程地址的
const withMcps = (extra: object = {}): string => catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS), ...extra } });
const OMP_MCP_NOTICE = '安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加';
const OMP_MCP_NOTICE_EN = 'The installer cannot install omp MCP servers: use /mcp add in omp';

describe('omp 的 MCP 安装器不装：列表上方的那句说明', () => {
  it('选了 omp 且列表里有 MCP：列表上方一行「注意」，写明装不了和在 omp 里怎么自己添加', async () => {
    const result = await run({ catalog: withMcps(), onPath: ['claude', 'omp'], answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')] });
    const lines = result.output.split('\n');
    const notice = lines.findIndex((line) => line.includes('安装器装不了'));

    expect(lines[notice]).toBe(`  注意      ${OMP_MCP_NOTICE}`);
    // 上下各空一行，在已回答的提问和列表之间
    expect([lines[notice - 1], lines[notice + 1]]).toEqual(['', '']);
    expect(notice).toBeLessThan(lines.findIndex((line) => line.includes(LIST)));
  });
});

describe('omp 的 MCP 那句说明：什么时候有、排在哪', () => {
  it('没选 omp 时没有：没检测到它，或在宿主选择上去掉了它', async () => {
    const undetected = await run({ catalog: withMcps(), onPath: ['claude'], answers: [choose(WEB_SEARCH), pick(), choose('退出')] });
    const unpicked = await run({ catalog: withMcps(), onPath: ALL_HOSTS, answers: [choose(WEB_SEARCH), pick('Claude Code', 'Pi'), pick(), pick(), choose('退出')] });

    expect(listOf(undetected.output)).toContain('docs-local');
    expect(undetected.output).not.toContain('安装器装不了');
    expect(unpicked.output).not.toContain('安装器装不了');
  });

  it('列表里没有 MCP 时没有', async () => {
    const result = await run({ onPath: ONLY_OMP, answers: [choose('推荐'), pick(), choose('退出')] });

    expect(listOf(result.output)).toContain('alpha');
    expect(result.output).not.toContain('安装器装不了');
  });

  it('只选了 omp 时也有：MCP 的行不可选，原因在行上，出路在这一句里', async () => {
    const result = await run({ catalog: withMcps(), onPath: ONLY_OMP, answers: [choose(WEB_SEARCH), pick(), choose('退出')] });

    expect(result.output).toMatch(new RegExp(`^\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
  });

  it('列表里的 MCP 本来就都不支持 omp 时照样有：哪个条目都装不进它', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: underWebSearch(...SAMPLE_MCPS).map((mcp) => ({ ...mcp, hosts: ['claude-code'] })) } }),
      onPath: ['claude', 'omp'],
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(result.output).toMatch(new RegExp(`^\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
  });

  it('四句都有时依次是共用 skill 目录、只能装到全局、omp 的 MCP、读不到配置，几行挨着，上下各空一行', async () => {
    const result = await run({
      catalog: withMcps({ skillPurposes: { alpha: 'web-search' } }),
      onPath: ALL_HOSTS,
      // 项目里 Claude Code 的那份配置读不了：它那一栏是未知；Codex 的 MCP 装不到项目
      project: { '.mcp.json': '这不是 JSON' },
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });
    const lines = result.output.split('\n');
    const shared = lines.findIndex((line) => line.includes('共用同一个'));

    expect(lines.slice(shared - 1, shared + 5)).toEqual([
      '',
      '  注意      Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到',
      '  注意      Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令',
      `  注意      ${OMP_MCP_NOTICE}`,
      '  注意      读不到 Claude Code 的配置，无法判断哪些 MCP 已配置',
      '',
    ]);
  });

  it('英文界面有对应的一句，连行首的键只占一行', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      answers: [choose(WEB_SEARCH_EN), accept(), pick(), pick(), choose('Exit')],
    });
    const lines = result.output.split('\n');
    const notice = lines.findIndex((line) => line.includes('The installer cannot'));

    expect(lines.slice(notice - 1, notice + 2)).toEqual(['', `  Notice    ${OMP_MCP_NOTICE_EN}`, '']);
    expect(displayWidth(lines[notice] ?? '')).toBeLessThanOrEqual(79);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

// 期望值是字面的命令，出处是各宿主的文档（见规范「安装 MCP」的那两张表）
const CLAUDE_ADD_LOCAL = { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const CODEX_ADD_LOCAL = { command: 'codex', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const PI_ADD_LOCAL = { command: 'pi', args: ['mcp', 'add', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'] };
const KEY_VALUE = 'sk-omp-test-0123456789';

describe('omp 的 MCP 安装器不装：和别的宿主一起选', () => {
  it('四个宿主都选了：列表里 omp 那一栏是「不支持」，别的三栏各是各的状态；行照常可选', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      home: { '.pi/agent/mcp.json': JSON.stringify({ mcpServers: { 'docs-local': {} } }) },
      answers: [choose(WEB_SEARCH), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+omp\b/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+已配置\s+不支持(\s|$)/m);
    expect(listOf(result.output)).toMatch(/^ □ tracker-remote\s+未配置\s+未配置\s+未配置\s+不支持(\s|$)/m);
  });

  it('MCP 照常装进别的宿主：汇总、将执行的命令、结果里都没有 omp 的行，执行的只有别的宿主的命令', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ALL_HOSTS,
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL, CODEX_ADD_LOCAL, PI_ADD_LOCAL]);
    expect(rowCount(summaryOf(result.output))).toBe(3);
    expect(summaryOf(result.output)).not.toMatch(/\bomp\b/);
    expect(commandsOf(result.output)).toMatch(/^── 将执行 3 条命令 ─+$/m);
    expect(commandsOf(result.output)).not.toMatch(/\bomp\b/);
    expect(resultsOf(result.output)).toMatch(/^\s+✓\s+docs-local\s+Claude Code\s+已配置$/m);
    expect(resultsOf(result.output)).toMatch(/^\s+✓\s+docs-local\s+Pi\s+已配置$/m);
    expect(resultsOf(result.output)).not.toMatch(/\bomp\b/);
    expect(resultsOf(result.output)).toMatch(/^\s+合计\s+3 成功 · 0 失败 · 0 跳过$/m);
    expectOmpUntouched(result);
  });

  it('带 key 的 MCP：key 只问一次，用于别的宿主；omp 没有命令，值不到它那里去', async () => {
    const result = await run({
      catalog: catalogDir({ catalog: { ...EMPTY_CATALOG, mcps: [KEYED_MCP] } }),
      onPath: ['claude', 'omp'],
      answers: [choose(WEB_SEARCH), accept(), pick('search-keyed'), secret(KEY_VALUE), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'user', 'search-keyed', '-e', `SEARCH_API_KEY=${KEY_VALUE}`, '--', 'npx', '-y', '@example/search-mcp'] },
    ]);
    expect(resultsOf(result.output)).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expectOmpUntouched(result);
  });

  it('omp 自己的配置文件不读也不写：它写坏了不提，装完原样留着', async () => {
    const before = { '.omp/agent/mcp.json': '这不是 JSON' };
    const result = await run({
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      home: before,
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(result.output).not.toContain('读不到');
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持(\s|$)/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(filesUnder(join(result.home, '.omp'))).toEqual(['agent', join('agent', 'mcp.json')]);
    expect(read(result.home, '.omp', 'agent', 'mcp.json')).toBe(before['.omp/agent/mcp.json']);
  });

  it('装到项目：omp 那一栏照样是「不支持」，MCP 装进别的宿主的项目配置；项目目录里没有 omp 的东西', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持(\s|$)/m);
    expect(result.commands).toEqual([
      { command: 'claude', args: ['mcp', 'add', '--scope', 'project', 'docs-local', '--', 'npx', '-y', '@example/docs-mcp@latest'], cwd: result.project },
    ]);
    // 要批准的提醒只有 Claude Code 的一句
    expect(result.output.split('要你批准之后才启用').length - 1).toBe(1);
    expectOmpUntouched(result);
  });

  it('英文界面：那一栏是 unsupported，汇总和结果里没有 omp', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: withMcps(),
      onPath: ['claude', 'omp'],
      answers: [choose(WEB_SEARCH_EN), accept(), pick('docs-local'), choose('Install'), choose('Exit')],
    });

    expect(listOf(result.output, '? Pick entries to install')).toMatch(/^ □ docs-local\s+none\s+unsupported(\s|$)/m);
    expect(result.commands).toEqual([CLAUDE_ADD_LOCAL]);
    expect(result.output.slice(result.output.indexOf('── Will install'))).not.toMatch(/\bomp\b/);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

describe('omp 的 MCP 安装器不装：所选的宿主都装不了时不可选', () => {
  it('只检测到 omp：MCP 的行都不可选，原因是「需要别的 AI Agent」；同一张列表里的 skill 照常可选', async () => {
    const result = await run({
      catalog: withMcps({ skillPurposes: { alpha: 'web-search' } }),
      onPath: ONLY_OMP,
      answers: [choose(WEB_SEARCH), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
    expect(listOf(result.output)).toMatch(/^ – tracker-remote\s+需要别的 AI Agent\s/m);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+未装\s/m);
    expect(result.commands).toEqual([]);
    expect(existsSync(join(result.home, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expectOmpUntouched(result);
  });

  it('只检测到 omp、装到项目：原因仍是「需要别的 AI Agent」——换成全局也装不进它', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ONLY_OMP,
      answersScope: true,
      answers: [choose(WEB_SEARCH), choose('项目'), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
    expect(result.output).not.toContain('只能装到全局');
  });

  it('四个宿主里只留 omp：同样不可选', async () => {
    const result = await run({ catalog: withMcps(), onPath: ALL_HOSTS, answers: [choose(WEB_SEARCH), pick('omp'), pick(), pick(), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+omp\s/m);
    expect(listOf(result.output)).toMatch(/^ – docs-local\s+需要别的 AI Agent\s/m);
  });

  it('选了 omp 和 Codex、装到项目：原因照现有的规则是「只能装到全局」，列表上方两句说明都在', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['codex', 'omp'],
      answersScope: true,
      answers: [choose(WEB_SEARCH), accept(), choose('项目'), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ – docs-local\s+只能装到全局\s/m);
    expect(listOf(result.output)).toMatch(/^ – tracker-remote\s+只能装到全局\s/m);
    expect(result.output).toMatch(new RegExp(`^\\s+注意\\s+Codex 的 MCP 只能装到全局：.*\\n\\s+注意\\s+${OMP_MCP_NOTICE}$`, 'm'));
  });

  it('选了 omp 和 Codex、装到全局：行可选，只装进 Codex', async () => {
    const result = await run({
      catalog: withMcps(),
      onPath: ['codex', 'omp'],
      answers: [choose(WEB_SEARCH), accept(), pick('docs-local'), choose('开始安装'), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+不支持(\s|$)/m);
    expect(result.commands).toEqual([CODEX_ADD_LOCAL]);
    expectOmpUntouched(result);
  });

  it('英文界面下只检测到 omp：原因是英文', async () => {
    const result = await run({ argv: ['--lang', 'en'], catalog: withMcps(), onPath: ONLY_OMP, answers: [choose(WEB_SEARCH_EN), pick(), choose('Exit')] });

    expect(listOf(result.output, '? Pick entries to install')).toMatch(/^ – docs-local\s+needs another AI Agent\s/m);
    expect(result.output).toMatch(new RegExp(`^\\s+Notice\\s+${OMP_MCP_NOTICE_EN}$`, 'm'));
  });
});

const browse = [choose('推荐'), pick(), choose('退出')];

describe('把本仓库的 skill 装给 omp', () => {
  it('装到全局：全部文件和安装标记落在主目录的 .agents/skills 下，主目录下只多出 .agents', async () => {
    const result = await run({ onPath: ONLY_OMP, answers: [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(JSON.parse(read(result.home, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(summaryOf(result.output)).toContain(join('~', '.agents', 'skills', 'alpha'));
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expectOmpUntouched(result);
  });

  it('装到项目：落在项目目录的 .agents/skills 下，汇总里的位置相对项目目录，主目录里什么都不多', async () => {
    const result = await run({
      onPath: ONLY_OMP,
      answersScope: true,
      answers: [choose('推荐'), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(filesUnder(join(result.project, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(JSON.parse(read(result.project, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+omp\s+新装\s+\.agents\S+alpha$/m);
    expect(result.output).toMatch(/^\s+✓\s+alpha\s+omp\s+已安装 1\.0\.0$/m);
    expect(readdirSync(result.project)).toEqual(['.agents']);
    expect(filesUnder(result.home)).toEqual([]);
    expectOmpUntouched(result);
  });

  it('列表里的四种状态看的是共用 skill 目录：未装、已装、版本不同、不是本工具装的', async () => {
    const managed = await run({
      onPath: ONLY_OMP,
      home: { ...installed('.agents/skills', 'alpha', '1.0.0'), ...installed('.agents/skills', 'beta-pack', '2.0') },
      answers: browse,
    });
    const other = await run({ onPath: ONLY_OMP, home: { '.agents/skills/beta-pack/SKILL.md': '用户自己手动放的' }, answers: browse });

    expect(managed.output).toMatch(/^\s+名称\s+omp\s+说明$/m);
    expect(managed.output).toMatch(/^\s*□ alpha\s+已装 1\.0\.0\s+第一个样例 skill/m);
    expect(managed.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s+第二个样例 skill$/m);
    expect(other.output).toMatch(/^\s*□ alpha\s+未装\s+第一个样例 skill/m);
    expect(other.output).toMatch(/^\s*□ beta-pack\s+非本工具安装\s+第二个样例 skill$/m);
  });

  it('omp 自己的 skill 目录不看也不写：那里有同名的不算已装，装完原样留着', async () => {
    const before = { '.omp/agent/skills/alpha/SKILL.md': '用户放在 omp 自己的目录里的\n' };
    const result = await run({ onPath: ONLY_OMP, home: before, answers: [choose('推荐'), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(listOf(result.output)).toMatch(/^\s*□ alpha\s+未装\s/m);
    expect(result.output).not.toContain('要覆盖它吗');
    expect(filesUnder(join(result.home, '.omp'))).toEqual(['agent', join('agent', 'skills'), join('agent', 'skills', 'alpha'), join('agent', 'skills', 'alpha', 'SKILL.md')]);
    expect(read(result.home, '.omp', 'agent', 'skills', 'alpha', 'SKILL.md')).toBe(before['.omp/agent/skills/alpha/SKILL.md']);
    expect(existsSync(join(result.home, '.agents', 'skills', 'alpha', '.oxy-tools.json'))).toBe(true);
  });

  it('不是本工具装的：另问，问的是共用 skill 目录里的那个路径，缺省不覆盖', async () => {
    const result = await run({
      onPath: ONLY_OMP,
      home: { '.agents/skills/alpha/SKILL.md': '用户自己写的\n' },
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+omp\s+覆盖\s+~\S+alpha\s+非本工具安装，另行确认$/m);
    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'alpha')} 不是本工具装的，要覆盖它吗？ (y/N)`);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(['SKILL.md']);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('用户自己写的\n');
    expect(result.output).toMatch(/^\s+–\s+alpha\s+omp\s+跳过\s+未同意覆盖，保持原样$/m);
  });

  it('同意了才覆盖：整目录替换，带上安装标记', async () => {
    const result = await run({
      onPath: ONLY_OMP,
      home: { '.agents/skills/alpha/SKILL.md': '用户自己写的\n', '.agents/skills/alpha/mine.txt': '用户的文件\n' },
      answers: [choose('推荐'), pick('alpha'), choose('开始安装'), yes(), choose('退出')],
    });

    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('# alpha\n');
  });

  it('只选了 omp 时列表上方也有共用 skill 目录的那句说明', async () => {
    const result = await run({ onPath: ONLY_OMP, answers: browse });

    expect(result.output).toMatch(/^\s+注意\s+Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到$/m);
  });

  it('英文界面：宿主的名字不变，状态词、汇总和结果是英文', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: ONLY_OMP,
      home: installed('.agents/skills', 'beta-pack', '2.0'),
      answers: [choose('Recommended'), pick('beta-pack'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Name\s+omp\s+About$/m);
    expect(result.output).toMatch(/^\s*□ beta-pack\s+2\.0 → 2\.3\s/m);
    expect(result.output).toMatch(/^\s+beta-pack\s+omp\s+overwrite\s+~\S+beta-pack\s+2\.0 → 2\.3$/m);
    expect(result.output).toMatch(/^\s+✓\s+beta-pack\s+omp\s+installed 2\.0 → 2\.3$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

describe('同时选了共用 skill 目录的几个宿主：本仓库的 skill 只装一次', () => {
  it('Codex、Pi、omp：汇总一行、进行中一行、结果一行，宿主那一格是「Codex、Pi、omp」，合计 1 成功；只写一份', async () => {
    const result = await run({ onPath: SHARED_THREE, answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(rowCount(summaryOf(result.output))).toBe(1);
    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Codex、Pi、omp\s+新装\s+~\S+alpha$/m);
    // 进行中的那一行后来被结果行擦掉重写：在没擦过的全部输出里找
    expect(resultsOf(result.output)).toMatch(/alpha\s+Codex、Pi、omp\s+正在下载/);
    expect(rowCount(resultsOf(result.screen).split('? 选择用途')[0] ?? '')).toBe(1);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Codex、Pi、omp\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expect(filesUnder(join(result.home, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(readdirSync(result.home)).toEqual(['.agents']);
    expectOmpUntouched(result);
  });

  it('Pi 和 omp：一行「Pi、omp」', async () => {
    const result = await run({ onPath: ['pi', 'omp'], answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Pi、omp\s+新装\s+~\S+alpha$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Pi、omp\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
  });

  it('四个宿主都选了：每个 skill 两行——Claude Code 一行，「Codex、Pi、omp」一行；两个目录各有内容和各自的安装标记', async () => {
    const result = await run({ onPath: ALL_HOSTS, answers: [choose('推荐'), accept(), pick('alpha', 'beta-pack'), choose('开始安装'), choose('退出')] });

    expect(rowCount(summaryOf(result.output))).toBe(4);
    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Claude Code\s+新装\s+~\S+alpha$/m);
    // 同一个条目的后续行不重复名字
    expect(summaryOf(result.output)).toMatch(/^\s+Codex、Pi、omp\s+新装\s+~\S+alpha$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+Codex、Pi、omp\s+新装\s+~\S+beta-pack$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Codex、Pi、omp\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+beta-pack\s+Codex、Pi、omp\s+已安装 2\.3$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+4 成功 · 0 失败 · 0 跳过$/m);
    for (const skillsDir of [join(result.home, '.claude', 'skills'), join(result.home, '.agents', 'skills')]) {
      expect(JSON.parse(read(skillsDir, 'alpha', '.oxy-tools.json'))).toMatchObject({ name: 'alpha', version: '1.0.0' });
    }
    expect(readdirSync(result.home).sort()).toEqual(['.agents', '.claude']);
    expectOmpUntouched(result);
  });

  it('选了 Claude Code 和 omp：它们的目录不同，仍是各一行', async () => {
    const result = await run({ onPath: ALL_HOSTS, answers: [choose('推荐'), pick('Claude Code', 'omp'), pick('alpha'), choose('开始安装'), choose('退出')] });

    expect(rowCount(summaryOf(result.output))).toBe(2);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+Claude Code\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+alpha\s+omp\s+已安装 1\.0\.0$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
  });

  it('共用 skill 目录里已有不是本工具装的同名 skill：三个宿主只问一次，缺省不覆盖', async () => {
    const result = await run({
      onPath: SHARED_THREE,
      home: { '.agents/skills/alpha/SKILL.md': '用户自己写的\n' },
      // 另问的只排了一个应答：多问一次就会因为没有预设应答而失败
      answers: [choose('推荐'), accept(), pick('alpha'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output.split('不是本工具装的，要覆盖它吗').length - 1).toBe(1);
    expect(resultsOf(result.screen)).toMatch(/^\s+–\s+alpha\s+Codex、Pi、omp\s+跳过\s+未同意覆盖，保持原样$/m);
    expect(read(result.home, '.agents', 'skills', 'alpha', 'SKILL.md')).toBe('用户自己写的\n');
  });

  it('装到项目时同样归组：项目目录的 .agents/skills 下只写一次，主目录里什么都不多', async () => {
    const result = await run({
      onPath: SHARED_THREE,
      answersScope: true,
      answers: [choose('推荐'), accept(), choose('项目'), pick('alpha'), choose('开始安装'), choose('退出')],
    });

    expect(summaryOf(result.output)).toMatch(/^\s+alpha\s+Codex、Pi、omp\s+新装\s+\.agents\S+alpha$/m);
    expect(filesUnder(join(result.project, '.agents', 'skills', 'alpha'))).toEqual(ALPHA_FILES);
    expect(filesUnder(result.home)).toEqual([]);
  });

  it('列表里的状态不合并：四个宿主四栏，Codex、Pi、omp 三栏写的一样', async () => {
    const result = await run({
      onPath: ALL_HOSTS,
      home: { ...installed('.claude/skills', 'alpha', '1.0.0'), ...installed('.agents/skills', 'beta-pack', '2.0') },
      answers: [choose('推荐'), accept(), pick(), pick(), choose('退出')],
    });

    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+omp\b/m);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+已装 1\.0\.0\s+未装\s+未装\s+未装(\s|$)/m);
    expect(listOf(result.output)).toMatch(/^ □ beta-pack\s+未装\s+2\.0 → 2\.3\s+2\.0 → 2\.3\s+2\.0 → 2\.3(\s|$)/m);
  });

  it('英文界面：宿主那一格用英文的并列写法 Codex, Pi, omp', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      onPath: ALL_HOSTS,
      answers: [choose('Recommended'), accept(), pick('alpha'), choose('Install'), choose('Exit')],
    });

    expect(result.output).toMatch(/^\s+Codex, Pi, omp\s+new\s+~\S+alpha$/m);
    expect(result.screen).toMatch(/^\s+✓\s+alpha\s+Codex, Pi, omp\s+installed 1\.0\.0$/m);
    expect(result.screen).toMatch(/^\s+Total\s+2 succeeded · 0 failed · 0 skipped$/m);
  });
});

// 「联网搜索与文档检索」下的两条第三方 Skill：paper-kit 含三个 skill，solo-notes 只含 note-taker 一个
const [KIT, SOLO] = SAMPLE_THIRD_PARTY as [(typeof SAMPLE_THIRD_PARTY)[0], (typeof SAMPLE_THIRD_PARTY)[1]];
const thirdParty = (entries: unknown[] = SAMPLE_THIRD_PARTY): string => catalogDir({ catalog: { ...EMPTY_CATALOG, thirdPartySkills: entries } });
// skills CLI 1.7.2 的 agent 名里没有 omp，有 pi：全局装到 ~/.agents/skills，不带全局选项时装到运行目录下的 .agents/skills——
// 正是 omp 读的那个共用 skill 目录，所以借 pi 这个名字（2026-10-12 读它的源码确认，记在任务
// 10-12-installer-add-pi-omp-hosts 的 research/pi-omp-host-facts.md）
const NO_TELEMETRY = { DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const soloVia = (agent: string, env: Record<string, string> = {}) => ({
  command: 'npx',
  args: ['-y', 'skills@1', 'add', 'example-labs/solo-notes', '--skill', 'note-taker', '--agent', agent, '--yes', '--global'],
  env: { ...NO_TELEMETRY, ...env },
});
const SKILLS_DIR: Record<string, string> = { 'claude-code': '.claude/skills', codex: '.agents/skills', pi: '.agents/skills' };
// 假装 skills CLI：带全局选项的装到主目录下，不带的装到它运行时所在的目录下；不认识的 agent 名什么都不装
const installs = (command: string, args: readonly string[], { home, cwd }: { home: string; cwd?: string }): undefined => {
  if (command !== 'npx') return;
  const skill = args[args.indexOf('--skill') + 1] ?? '';
  const skillsDir = SKILLS_DIR[args[args.indexOf('--agent') + 1] ?? ''];
  const root = args.includes('--global') ? home : cwd;
  if (root !== undefined && skillsDir !== undefined) writeTree(root, { [`${skillsDir}/${skill}/SKILL.md`]: `# ${skill}（作者的最新版）\n` });
};
const installSolo = [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), choose('退出')];

describe('把第三方 Skill 装给 omp', () => {
  it('装到全局：执行的正好是那一条 skills CLI 命令——agent 名借用 pi、带全局选项，除了关遥测的两个不另带环境变量', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_OMP, commandResult: installs, answers: installSolo });

    expect(result.commands).toEqual([soloVia('pi')]);
    expectOmpUntouched(result);
  });

  it('确认前展示的就是之后执行的那一条；汇总里宿主是 omp，位置在共用 skill 目录', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_OMP, commandResult: installs, answers: installSolo });

    expect(flat(commandsOf(result.output))).toContain('npx -y skills@1 add example-labs/solo-notes --skill note-taker --agent pi --yes --global ');
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+omp\s+新装\s+~\S+note-taker$/m);
    expect(summaryOf(result.output)).toContain(join('~', '.agents', 'skills', 'note-taker'));
  });

  it('装完复核通过：共用 skill 目录里有 SKILL.md，结果是「已安装」', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ONLY_OMP, commandResult: installs, answers: installSolo });

    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+omp\s+已安装$/m);
    expect(existsSync(join(result.home, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
  });

  it('命令把它装到了 omp 自己的目录而共用 skill 目录里没有：判失败', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      commandResult: (_, __, { home }) => void writeTree(home, { '.omp/agent/skills/note-taker/SKILL.md': '# note-taker\n' }),
      answers: installSolo,
    });

    expect(result.output).toMatch(/^\s+✗\s+note-taker\s+omp\s+失败\s+安装命令已结束，但目标位置没有 SKILL\.md$/m);
  });

  it('装到项目：命令不带全局选项、在项目目录下运行，agent 名仍是 pi；复核看项目目录的 .agents/skills', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
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
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+omp\s+新装\s+\.agents\S+note-taker$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+omp\s+已安装$/m);
    expect(existsSync(join(result.project, '.agents', 'skills', 'note-taker', 'SKILL.md'))).toBe(true);
    expect(filesUnder(result.home)).toEqual([]);
    expectOmpUntouched(result);
  });

  it('目标位置已有同名目录：另问，缺省不覆盖，那条命令不执行', async () => {
    const result = await run({
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      home: { '.agents/skills/note-taker/notes.txt': '用户自己放的\n' },
      commandResult: installs,
      answers: [choose(WEB_SEARCH), pick('solo-notes'), choose('开始安装'), accept(), choose('退出')],
    });

    expect(result.output).toContain(`? ${join('~', '.agents', 'skills', 'note-taker')} 已有同名目录，要覆盖它吗？ (y/N)`);
    expect(result.commands).toEqual([]);
    expect(result.output).toMatch(/^\s+–\s+note-taker\s+omp\s+跳过\s+未同意覆盖，保持原样$/m);
  });

  it('条目用 hosts 限定了宿主：写了 omp 的照常装给 omp，没写的不可选', async () => {
    const forOmp = await run({ catalog: thirdParty([KIT, { ...SOLO, hosts: ['omp'] }]), onPath: ONLY_OMP, commandResult: installs, answers: installSolo });
    const notForOmp = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['pi'] }]),
      onPath: ONLY_OMP,
      answers: [choose(WEB_SEARCH), pick(), choose('退出')],
    });

    expect(forOmp.commands).toEqual([soloVia('pi')]);
    expect(forOmp.output).toMatch(/^\s+✓\s+note-taker\s+omp\s+已安装$/m);
    expect(listOf(notForOmp.output)).toMatch(/^ – solo-notes\s+需要别的 AI Agent\s/m);
  });

  it('英文界面：汇总、命令和结果', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: thirdParty(),
      onPath: ONLY_OMP,
      commandResult: installs,
      answers: [choose(WEB_SEARCH_EN), pick('solo-notes'), choose('Install'), choose('Exit')],
    });

    expect(result.commands).toEqual([soloVia('pi')]);
    expect(result.output).toMatch(/^\s+note-taker\s+omp\s+new\s+~\S+note-taker$/m);
    expect(result.output).toMatch(/^\s+✓\s+note-taker\s+omp\s+installed$/m);
    expect(result.output).not.toMatch(/[一-鿿]/);
  });
});

describe('同时选了共用 skill 目录的几个宿主：第三方 Skill 只执行一条命令', () => {
  it('Codex、Pi、omp：展示的和执行的都只有一条，agent 名取这一组里排在最前的 Codex 的；汇总和结果各一行「Codex、Pi、omp」', async () => {
    const result = await run({ catalog: thirdParty(), onPath: SHARED_THREE, commandResult: installs, answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')] });

    expect(result.commands).toEqual([soloVia('codex')]);
    expect(commandsOf(result.output)).toMatch(/^── 将执行 1 条命令 ─+$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+Codex、Pi、omp\s+新装\s+~\S+note-taker$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+note-taker\s+Codex、Pi、omp\s+已安装$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+1 成功 · 0 失败 · 0 跳过$/m);
    expectOmpUntouched(result);
  });

  it('Pi 和 omp：一条 --agent pi，一行「Pi、omp」', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ['pi', 'omp'], commandResult: installs, answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')] });

    expect(result.commands).toEqual([soloVia('pi')]);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+note-taker\s+Pi、omp\s+已安装$/m);
  });

  it('四个宿主都选了：每个 skill 两条命令、两行——Claude Code 一条带它的环境变量，共用 skill 目录一条', async () => {
    const result = await run({ catalog: thirdParty(), onPath: ALL_HOSTS, commandResult: installs, answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')] });

    expect(result.commands).toEqual([soloVia('claude-code', { CLAUDE_CONFIG_DIR: '' }), soloVia('codex')]);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+note-taker\s+Claude Code\s+已安装$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+note-taker\s+Codex、Pi、omp\s+已安装$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+合计\s+2 成功 · 0 失败 · 0 跳过$/m);
    expectOmpUntouched(result);
  });

  it('条目只支持 omp、四个宿主都选了：共用 skill 目录那一组里只算 omp——命令的 agent 名是 pi，宿主那一格只写 omp', async () => {
    const result = await run({
      catalog: thirdParty([KIT, { ...SOLO, hosts: ['omp'] }]),
      onPath: ALL_HOSTS,
      commandResult: installs,
      answers: [choose(WEB_SEARCH), accept(), pick('solo-notes'), choose('开始安装'), choose('退出')],
    });

    expect(result.commands).toEqual([soloVia('pi')]);
    expect(summaryOf(result.output)).toMatch(/^\s+note-taker\s+omp\s+新装\s+~\S+note-taker$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+note-taker\s+omp\s+已安装$/m);
  });
});

describe('四个宿主都选了时的 80 列', () => {
  // 四种类型都有：本仓库的 skill、第三方 Skill、MCP 同在一个用途下
  const everything = (): string =>
    catalogDir({
      catalog: { ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY, mcps: underWebSearch(...SAMPLE_MCPS), skillPurposes: { alpha: 'web-search', 'beta-pack': 'web-search' } },
    });
  // 状态最宽的样子：两个 skill 目录里各有不是本工具装的、版本不同的。不是本工具装的那个（alpha）只留在列表里、不去装
  const home = {
    '.claude/skills/alpha/SKILL.md': '用户自己写的\n',
    '.agents/skills/alpha/SKILL.md': '用户自己写的\n',
    ...installed('.claude/skills', 'beta-pack', '2.0'),
    ...installed('.agents/skills', 'beta-pack', '2.0'),
  };
  // 两种行本来就超，不量：分区标题的横线照例画满 80 列；预设应答的提问器把光标所在行的说明全文记下来时不折行
  const prose = new Set([...SAMPLE_SKILLS, ...SAMPLE_THIRD_PARTY, ...SAMPLE_MCPS].flatMap((entry) => Object.values(entry.description)));
  const measured = (text: string): string[] => text.split('\n').filter((line) => !line.includes('──') && !prose.has(line));
  const widest = (text: string): number => Math.max(...measured(text).map((line) => displayWidth(line)));

  it('宿主行、宿主选择、列表（四栏状态）、清单、汇总、结果：样例里的每一行都不超出第 79 列', async () => {
    const result = await run({
      catalog: everything(),
      onPath: ALL_HOSTS,
      home,
      commandResult: installs,
      answers: [
        choose(WEB_SEARCH),
        accept(),
        pick('beta-pack', 'paper-kit', 'solo-notes', 'docs-local', 'tracker-remote'),
        pick('paper-reader', 'paper-comic'),
        choose('开始安装'),
        choose('退出'),
      ],
    });

    expect(result.output).toMatch(/^\s+AI Agent\s+Claude Code ✓\s+Codex ✓\s+Pi ✓\s+omp ✓$/m);
    expect(result.output).toMatch(/^\? 装进哪些 AI Agent\n\n ■ Claude Code\n ■ Codex\n ■ Pi\n ■ omp$/m);
    expect(listOf(result.output)).toMatch(/^\s+名称\s+Claude Code\s+Codex\s+Pi\s+omp$/m);
    expect(listOf(result.output)).toMatch(/^ □ alpha\s+非本工具安装\s+非本工具安装\s+非本工具安装\s+非本工具安装$/m);
    expect(listOf(result.output)).toMatch(/^ □ docs-local\s+未配置\s+未配置\s+未配置\s+不支持$/m);
    expect(summaryOf(result.output)).toMatch(/^\s+Codex、Pi、omp\s+覆盖\s+~\S+beta-pack$/m);
    expect(resultsOf(result.screen)).toMatch(/^\s+✓\s+beta-pack\s+Codex、Pi、omp\s+已安装 2\.0 → 2\.3$/m);
    expect(widest(result.screen)).toBeLessThanOrEqual(79);
  });

  it('英文界面：宿主行、宿主选择、列表、清单、结果的每一行都不超出第 79 列', async () => {
    const result = await run({
      argv: ['--lang', 'en'],
      catalog: everything(),
      onPath: ALL_HOSTS,
      home,
      commandResult: installs,
      answers: [
        choose(WEB_SEARCH_EN),
        accept(),
        pick('beta-pack', 'paper-kit', 'solo-notes', 'docs-local', 'tracker-remote'),
        pick('paper-reader', 'paper-comic'),
        choose('Install'),
        choose('Exit'),
      ],
    });
    // 汇总的小表不在这里量：英文下「位置」一栏的路径长了会超出一行，是加 omp 之前就记着的问题（规范「界面设计」文末），
    // 版式由维护者定
    const summary = result.screen.indexOf('── Install');
    const commands = result.screen.indexOf('── ', summary + 1);

    expect(result.output).toMatch(/^\s+Name\s+Claude Code\s+Codex\s+Pi\s+omp$/m);
    expect(result.screen).toMatch(/^\s+✓\s+beta-pack\s+Codex, Pi, omp\s+installed 2\.0 → 2\.3$/m);
    expect(widest(result.screen.slice(0, summary))).toBeLessThanOrEqual(79);
    expect(widest(result.screen.slice(commands))).toBeLessThanOrEqual(79);
  });
});
