// 界面预览页（仅供开发）：经安装器入口按预设场景驱动安装器，提问由真实的交互库渲染，
// 把无头终端里的画面连同样式转成一个离线 HTML 页面，每个画面一格，深色和浅色终端各一份。
// 生成物在 .preview/ 下，不提交，不随 npm 包发布。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import xterm from '@xterm/headless';
import { CatalogError, githubCatalogSource, type CatalogFailure, type CatalogSource } from '../src/catalog.ts';
import { runInstaller, type CommandRunner } from '../src/installer.ts';
import { EMPTY_CATALOG } from '../test/fixtures.ts';
import { COLUMNS, KEY, keyboardPrompter } from '../test/terminal.ts';

const ROWS = 60;
const down = (times: number): string[] => Array<string>(times).fill(KEY.down);
const BOTH_HOSTS = ['claude', 'codex'];

interface Scene {
  title: string;
  note?: string;
  argv?: string[];
  env?: Record<string, string>;
  platform?: NodeJS.Platform;
  /** 标准输入和标准输出是不是终端，缺省是；标准错误一直接在终端上 */
  tty?: boolean;
  catalog?: CatalogSource;
  /** 可执行路径上有哪些命令，缺省只有 claude */
  onPath?: string[];
  /** 主目录里事先有什么：相对路径 → 文件内容 */
  home?: Record<string, string>;
  /** 主目录里事先有的符号链接：链接的相对路径 → 它指向的相对路径 */
  links?: Record<string, string>;
  /** 传 false 表示浏览器打不开：链接打开器以失败告终 */
  browser?: boolean;
  /** 假的外部命令执行器，缺省每条命令都成功；预览页从不真的执行命令 */
  commands?: CommandRunner;
  /** 依次按下的键；画面停在按完之后的样子 */
  keys?: string[];
}

// ── 样例目录 ──────────────────────────────────────────────────────────────────

const SHOWCASE_SKILLS = [
  ['archify', '2.16', '生成架构图、流程图、时序图、数据流图，输出可交互的独立 HTML', 'Generate architecture, workflow, sequence and data-flow diagrams as standalone interactive HTML'],
  ['explanation', '1.0.0', '把任何内容改写到聪明的 12 岁孩子也能看懂', 'Rewrite any content so a smart 12-year-old can follow it'],
  ['if5', '1.0.0', '像给 5 岁小孩那样解释一个话题，配极简图解', 'Explain a topic as if to a five-year-old, with very simple diagrams'],
  ['onetake', '1.0.0', '制作 10–60 秒的产品动效短片（体积约 70MB，仅限非商业使用）', 'Make 10–60 s product motion videos (about 70 MB, noncommercial use only)'],
  ['oxy-learning-hub', '1.0.0', '总结或教学链接、文档、代码和长文本，可生成互动式 HTML 课程', 'Summarize or teach links, documents, code and long text, optionally as interactive HTML lessons'],
  ['pr', '1.0.0', '撰写 PR（合并请求）描述', 'Write pull request descriptions'],
  ['wizard', '1.0.0', '生成交互式 bash 向导，带人走完只能由人完成的步骤', 'Generate an interactive bash wizard for steps only a human can perform'],
  ['writing-for-agents', '1.0.0', '编写 skill、AGENTS.md、CLAUDE.md 等给 AI 读的文档的写作规范', 'Writing guidelines for documents that agents read: skills, AGENTS.md, CLAUDE.md'],
].map(([name, version, zh, en]) => ({ name, version, path: `skills/${name}`, description: { zh, en } }));

// 假装下载：每个 skill 只有一个 SKILL.md。fails 里的 skill 以给定的原因失败，hangs 里的一直下不完
function downloads(behaviour: { fails?: Record<string, string>; hangs?: string[] } = {}): CatalogSource['pin'] {
  return async () => ({
    commit: 'c2230a119e3cf013df0f699d1f1ecedb86f4126d',
    async download(path, dest) {
      const name = path.split('/').pop() ?? '';
      if (behaviour.hangs?.includes(name)) await new Promise<never>(() => {});
      const failure = behaviour.fails?.[name];
      if (failure) throw new Error(failure);
      writeFileSync(join(dest, 'SKILL.md'), `# ${name}\n`);
    },
  });
}

// 位置照默认的目录来源来写，内容换成样例
function catalogOf(index: unknown, catalog: unknown = EMPTY_CATALOG, pin = downloads()): CatalogSource {
  const files: Record<string, unknown> = { 'index.json': index, 'catalog.json': catalog };
  return { ...githubCatalogSource(), readText: async (file) => JSON.stringify(files[file]), pin };
}

// 应用项目是为预览编的样例：仓库的 catalog.json 目前是空的
const SHOWCASE_APPS = [
  ['dify', '开源的 LLM 应用开发平台，自带工作流编排与知识库，用 docker 部署', 'Open-source LLM app development platform with workflow orchestration and a knowledge base, deployed with docker', 'https://github.com/langgenius/dify'],
  ['n8n', '可自托管的工作流自动化平台，内置 AI 节点', 'Self-hostable workflow automation platform with built-in AI nodes', 'https://github.com/n8n-io/n8n'],
  ['open-webui', '自托管的大模型对话界面，可接 Ollama 与各家 API', 'Self-hosted chat interface for large models; works with Ollama and vendor APIs', 'https://github.com/open-webui/open-webui'],
  ['ragflow', '基于深度文档理解的开源 RAG 引擎', 'Open-source RAG engine built on deep document understanding', 'https://github.com/infiniflow/ragflow/blob/main/README_zh.md?plain=1#-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B'],
].map(([name, zh, en, url]) => ({ name, description: { zh, en }, url }));

// MCP 同样是为预览编的样例：两种连接方式都有，其中一条只支持 Codex
const SHOWCASE_MCPS = [
  { name: 'chrome-devtools', zh: '让 AI Agent 操控并调试真实的 Chrome 浏览器', en: 'Let your AI Agent drive and debug a real Chrome browser', server: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] } },
  { name: 'context7', zh: '按需拉取各种库的最新文档', en: 'Pull up-to-date documentation for libraries on demand', server: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  { name: 'linear', zh: '读写 Linear 的 issue 与项目，登录交给 AI Agent 自己的流程', en: 'Read and write Linear issues and projects; signing in is left to the AI Agent', server: { url: 'https://mcp.linear.app/mcp' } },
  { name: 'openai-docs', zh: '查询 OpenAI 开发者文档', en: 'Search the OpenAI developer docs', hosts: ['codex'], server: { url: 'https://developers.openai.com/mcp' } },
].map(({ zh, en, ...mcp }) => ({ ...mcp, description: { zh, en }, url: `https://example.com/${mcp.name}` }));

const sample = catalogOf({ version: 1, skills: SHOWCASE_SKILLS });
const withMcps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: SHOWCASE_MCPS });
// 名字长的 MCP：汇总里它的备注一行放不下
const LONG_NAME_MCP = {
  name: 'modelcontextprotocol-server-sequential-thinking',
  description: { zh: '把复杂问题拆成一步步的思考过程', en: 'Break a complex problem down into a step-by-step thinking process' },
  url: 'https://example.com/sequential-thinking',
  server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
};
const withLongNameMcp = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: [...SHOWCASE_MCPS, LONG_NAME_MCP] });
const withApps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, apps: SHOWCASE_APPS });
const withPin = (pin: CatalogSource['pin']): CatalogSource => ({ ...sample, pin });
const queryFails = (failure: CatalogFailure): CatalogSource => withPin(() => Promise.reject(new CatalogError(failure)));
const oneFails = withPin(downloads({ fails: { wizard: 'HTTP 503' } }));
const COMMITS_QUERY = 'https://api.github.com/repos/LFT-OXY/oxy-Tools/commits/main';
const withBrokenEntry = catalogOf({ version: 1, skills: [...SHOWCASE_SKILLS, { name: 'broken', path: '../elsewhere' }] });
const newerFormat = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { version: 2, components: [] });
const neverLoads: CatalogSource = { ...sample, readText: () => new Promise<string>(() => {}) };
const offline: CatalogSource = {
  ...sample,
  readText: () => Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) })),
};

// 主目录里一个本工具装的 skill：有安装标记
function installedSkill(skillsDir: string, name: string, version: string): Record<string, string> {
  return {
    [`${skillsDir}/${name}/SKILL.md`]: `# ${name}\n`,
    [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T08:00:00.000Z' }),
  };
}

// Claude Code 的用户级配置里已有这两个 MCP
const CLAUDE_CONFIGURED = { '.claude.json': JSON.stringify({ mcpServers: { 'chrome-devtools': { command: 'npx' }, linear: { type: 'http' } } }) };
// Codex 的配置写坏了，读不出里面有哪些 MCP
const CODEX_UNREADABLE = { '.codex/config.toml': '[mcp_servers.context7\n' };
const ok = { exitCode: 0 };
// 假装执行命令：Claude Code 那边 linear 的添加失败
const linearFails: CommandRunner = async (command, args) =>
  command === 'claude' && args.includes('linear') && args[1] === 'add' ? { exitCode: 1 } : ok;
// 第二个 MCP 的命令一直跑不完
const secondHangs: CommandRunner = (_, args) => (args.includes('context7') ? new Promise<never>(() => {}) : Promise.resolve(ok));

const CLAUDE_SKILLS = '.claude/skills';
const CODEX_SKILLS = '.agents/skills';
// 四种状态都有：已装、版本不同、不是本工具装的（手动放的目录、符号链接）、未装
const MIXED: Pick<Scene, 'home' | 'links'> = {
  home: {
    ...installedSkill(CLAUDE_SKILLS, 'archify', '2.16'),
    ...installedSkill(CODEX_SKILLS, 'archify', '2.16'),
    ...installedSkill(CLAUDE_SKILLS, 'explanation', '0.9.0'),
    ...installedSkill(CODEX_SKILLS, 'explanation', '1.0.0'),
    ...installedSkill(CLAUDE_SKILLS, 'if5', '1.0.0'),
    [`${CLAUDE_SKILLS}/pr/SKILL.md`]: '# 自己写的 pr\n',
    ...installedSkill(CLAUDE_SKILLS, 'writing-for-agents', '1.0.0'),
    'dotfiles/skills/writing-for-agents/SKILL.md': '# 用链接管理的 skill\n',
  },
  links: { [`${CODEX_SKILLS}/writing-for-agents`]: 'dotfiles/skills/writing-for-agents' },
};
// 名字长的条目上有备注：一行放不下，备注另起一行
const LONG_NAME_UNMANAGED = { home: { [`${CLAUDE_SKILLS}/oxy-learning-hub/SKILL.md`]: '# 自己放的\n' } };

// ── 场景 ──────────────────────────────────────────────────────────────────────

const LEGACY_CONSOLE = { platform: 'win32' as const, env: { TERM: '' } };
const toSkills = [KEY.enter];
// 勾上 pr 和 wizard，光标停在 wizard 上
const pickTwo = [...toSkills, ...down(5), KEY.space, KEY.down, KEY.space];
const toSummary = [...pickTwo, KEY.enter];
const install = [...toSummary, KEY.enter];
// 检测到两个宿主时，进了 skill 分组先问装进哪些宿主：两项默认勾选，直接确认
const twoHosts = (keys: string[]): string[] => [KEY.enter, ...keys];
// 勾上 explanation、pr 和 wizard：在 MIXED 里分别是版本不同、不是本工具装的、未装
const pickThree = [...toSkills, KEY.down, KEY.space, ...down(4), KEY.space, KEY.down, KEY.space];
const toMixedSummary = [...pickThree, KEY.enter];
// 选了「开始安装」，停在确认覆盖的提问上
const toOverwriteQuestion = [...toMixedSummary, KEY.enter];
const declineOverwrite = [...toOverwriteQuestion, KEY.enter];
const agreeOverwrite = [...toOverwriteQuestion, 'y', KEY.enter];
const pickLongName = [...toSkills, ...down(4), KEY.space, KEY.enter];
// 勾上 if5、pr 和 wizard：名字都短，备注放得下
const pickShortNames = [...toSkills, ...down(2), KEY.space, ...down(3), KEY.space, KEY.down, KEY.space, KEY.enter];
// 主菜单上从 Skill 下移到应用项目再进去；一个宿主都没有时光标本来就在应用项目上
const toApps = [KEY.down, KEY.enter];
// 选中第三个应用项目 open-webui
const openApp = [...toApps, ...down(2), KEY.enter];
// 选中最后一个 ragflow：它的链接比一行长
const openLongLink = [...toApps, ...down(3), KEY.enter];

// 主菜单上从 Skill 下移到 MCP 再进去
const toMcps = [KEY.down, KEY.enter];
// 勾上 chrome-devtools、context7 和 linear，光标停在 linear 上
const pickMcps = [...toMcps, KEY.space, KEY.down, KEY.space, KEY.down, KEY.space];
const runMcps = [...pickMcps, KEY.enter, KEY.enter];
// 只勾 context7：一个 MCP 装进两个宿主
const pickOneMcp = [...toMcps, KEY.down, KEY.space, KEY.enter];
// 检测到两个宿主时，进了 MCP 分组先问装进哪些宿主：两项默认勾选，直接确认
const mcpTwoHosts = (keys: string[]): string[] => [...toMcps, KEY.enter, ...keys.slice(toMcps.length)];
const MCP_STATES = { catalog: withMcps, home: CLAUDE_CONFIGURED };
const MCP_TWO_HOSTS = { catalog: withMcps, onPath: BOTH_HOSTS, home: { ...CLAUDE_CONFIGURED, ...CODEX_UNREADABLE } };

const scenes: Scene[] = [
  { title: '启动与加载', note: 'npx oxy-tools · 最先打出 OXY 大标志；读取目录时行首的符号转动', catalog: neverLoads },
  { title: '主菜单', note: '只检测到 Claude Code：说明 Codex 被跳过；catalog.json 三个数组为空，只有 Skill 一个分组和退出' },
  { title: '主菜单 · 有条目被跳过', note: '目录里有一条写坏的条目', catalog: withBrokenEntry },
  { title: 'skill 多选列表', note: '空格勾选；说明过长则截断，光标所在行的全文在列表下方', keys: pickTwo },
  { title: '汇总确认 · 选了两个 skill', note: '列出每个 skill 将装到的目录；可开始安装、返回修改或取消', keys: toSummary },
  { title: '汇总确认 · 返回修改', note: '回到列表，之前勾选的还在', keys: [...toSummary, KEY.down, KEY.enter] },
  { title: '正在查询', note: '确认之后先向 GitHub 查询当前提交和文件列表', catalog: withPin(() => new Promise<never>(() => {})), keys: install },
  { title: '正在安装', note: '一项已装好，另一项进行中：行首的符号转动', catalog: withPin(downloads({ hangs: ['wizard'] })), keys: install },
  { title: '结果 · 全部成功', note: '标题由「正在安装」改写成「结果」；之后回到主菜单', keys: install },
  { title: '结果 · 一项成功一项失败', note: '两项各有一行，失败的带原因', catalog: oneFails, keys: install },
  {
    title: '出错 · GitHub 限流',
    note: '查询文件列表时被限流：说明原因和两个出路，之后回到主菜单',
    catalog: queryFails({ kind: 'rate-limited', authenticated: false, minutes: 37 }),
    keys: install,
  },
  {
    title: '出错 · 无法查询 skill 的文件列表',
    note: '查询时断网',
    catalog: queryFails({ kind: 'skill-files-unlisted', problem: 'unreachable', detail: 'ENOTFOUND', where: COMMITS_QUERY, badToken: false }),
    keys: install,
  },
  { title: '主菜单 · 检测到两个宿主', note: '可执行路径上有 claude 和 codex 两个命令', onPath: BOTH_HOSTS },
  { title: '主菜单 · 只检测到 Codex', note: '另一个宿主没有检测到：说明它被跳过，组件只装进检测到的那个', onPath: ['codex'] },
  { title: '选择宿主 · 检测到两个', note: '进 skill 分组后先问装进哪些宿主：两项都默认勾选，名字后面是各自的 skill 目录', onPath: BOTH_HOSTS, keys: toSkills },
  { title: '选择宿主 · 去掉一个', note: '空格去掉 Claude Code 的勾，光标移到 Codex', onPath: BOTH_HOSTS, keys: [...toSkills, KEY.space, KEY.down] },
  { title: 'skill 多选列表 · 两个宿主', note: '上面两行是已回答的提问', onPath: BOTH_HOSTS, keys: twoHosts(pickTwo) },
  { title: '汇总确认 · 两个宿主', note: '每个 skill 在每个宿主下各一行，名字只写在第一行', onPath: BOTH_HOSTS, keys: twoHosts(toSummary) },
  { title: '结果 · 两个宿主', note: '按宿主分别列出，各有各的结果', onPath: BOTH_HOSTS, catalog: oneFails, keys: twoHosts(install) },
  { title: 'skill 多选列表 · 四种状态并存', note: '每个宿主一栏：已装带版本、版本不同写两个版本、非本工具安装（手动放的目录或符号链接）、未装', onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: 'skill 多选列表 · 一个宿主的状态', note: '只装进一个宿主时只有一栏', ...MIXED, keys: pickThree },
  { title: '汇总确认 · 含覆盖项', note: '操作一栏标出覆盖；备注写版本变化、重装或另行确认，放得下就成一栏；下面提醒本地改动会丢失', ...MIXED, keys: pickShortNames },
  { title: '汇总确认 · 含覆盖项 · 两个宿主', note: '有一条备注放不下，就都另起一行，与位置的左缘对齐，表头不写备注一栏', onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(toMixedSummary) },
  { title: '汇总确认 · 名字长的条目', note: '同样是备注另起一行', ...LONG_NAME_UNMANAGED, keys: pickLongName },
  { title: '确认覆盖 · 不是本工具装的目录', note: '选了「开始安装」之后单独再问，缺省不覆盖', onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(toOverwriteQuestion) },
  { title: '确认覆盖 · 输入了别的', note: '只认 y 和 n；输入别的不结束提问，下方说明', onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts([...toOverwriteQuestion, 'x', KEY.enter]) },
  { title: '结果 · 未同意覆盖的跳过', note: '那个目录保持原样，其余照常；覆盖了旧版本的写出两个版本', onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '结果 · 同意覆盖', note: '同意之后和别的项一样安装', onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(agreeOverwrite) },
  { title: '主菜单 · 一个宿主都没有', note: '上方说明原因；skill 分组不可进入，行尾注明原因，光标落在「退出」上', onPath: [] },
  { title: '主菜单 · 一个宿主都没有 · 在 skill 分组上按回车', note: '光标能移上去，但进不去：列表下方多一行说明', onPath: [], keys: [KEY.up, KEY.enter] },
  { title: '返回主菜单', note: '已回答的提问收成一行；大标志不重复', keys: [...toSkills, KEY.enter] },
  { title: '主菜单 · 有应用项目', note: 'catalog.json 里有应用项目时多出这个分组，「目录」一行也数上它', catalog: withApps },
  { title: '主菜单 · 一个宿主都没有 · 有应用项目', note: '说明里补一句应用项目仍可浏览；光标直接落在应用项目上', catalog: withApps, onPath: [] },
  { title: '应用项目列表', note: '单选的两栏表，末尾是「返回」；光标所在行的说明全文在列表下方', catalog: withApps, keys: toApps },
  { title: '应用项目列表 · 一个宿主都没有', note: '这个分组不靠宿主，照样进得去', catalog: withApps, onPath: [], keys: [KEY.enter] },
  { title: '应用项目详情 · 已打开浏览器', note: '说明全文和带下划线的完整链接，再说明已打开；之后回到列表，光标留在这一项上', catalog: withApps, keys: openApp },
  { title: '应用项目详情 · 浏览器打不开', note: '不算出错：链接照样完整写出，只提醒自己复制', catalog: withApps, browser: false, keys: openApp },
  { title: '应用项目详情 · 链接比一行长', note: '链接不截断也不折开，由终端自己折行', catalog: withApps, keys: openLongLink },
  { title: '应用项目 · 返回主菜单', note: '看过一个之后选「返回」', catalog: withApps, keys: [...openApp, ...down(2), KEY.enter] },
  { title: '主菜单 · 有 MCP', note: 'catalog.json 里有 MCP 条目时多出这个分组，「目录」一行也数上它', catalog: withMcps },
  { title: 'MCP 多选列表', note: '状态来自 Claude Code 的用户级配置：已配置、未配置；这个宿主不支持的条目不可选，行尾注明原因', ...MCP_STATES, keys: pickMcps },
  { title: 'MCP 多选列表 · 在不可选的条目上按空格', note: '光标能移上去，但勾不上：列表下方多一行说明', ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '选择宿主 · 装 MCP', note: '装 MCP 时名字后面不写目录', catalog: withMcps, onPath: BOTH_HOSTS, keys: toMcps },
  { title: 'MCP 多选列表 · 配置文件读不了', note: 'Codex 的配置读不出来：列表上方说明，它那一栏都是「未知」，没有报错；只有一个宿主支持的条目仍可选', ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '汇总确认 · 一个 MCP 装进两个宿主', note: '两条完整的命令都列出来，确认后才执行', catalog: withMcps, onPath: BOTH_HOSTS, keys: mcpTwoHosts(pickOneMcp) },
  { title: '汇总确认 · MCP · 覆盖与状态未知', note: '已配置的先移除再添加；状态未知的先尝试移除同名配置。将执行的每一条命令都在下面', ...MCP_TWO_HOSTS, keys: mcpTwoHosts([...pickMcps, KEY.enter]) },
  { title: '汇总确认 · MCP · 只装进支持的宿主', note: 'openai-docs 只支持 Codex：汇总和命令里没有 Claude Code 那一份；远程地址装进 Codex 时，命令下面提醒它可能当场打开浏览器登录', catalog: withMcps, onPath: BOTH_HOSTS, keys: mcpTwoHosts([...toMcps, ...down(3), KEY.space, KEY.enter]) },
  {
    title: '汇总确认 · MCP · 名字长的条目',
    note: '有一条备注放不下，就都另起一行，表头不写备注一栏；命令过长时折行，续行与命令的左缘对齐',
    catalog: withLongNameMcp,
    home: { '.claude.json': JSON.stringify({ mcpServers: { [LONG_NAME_MCP.name]: {}, linear: {} } }) },
    keys: [...toMcps, ...down(2), KEY.space, ...down(2), KEY.space, KEY.enter],
  },
  { title: '正在安装 · MCP', note: '一项已配置，另一项进行中：行首的符号转动', ...MCP_STATES, commands: secondHangs, keys: runMcps },
  { title: '结果 · MCP 全部成功', note: '标题由「正在安装」改写成「结果」；之后回到主菜单', ...MCP_STATES, keys: runMcps },
  { title: '结果 · MCP 一项失败', note: '失败的写明是哪一步和退出状态；其余照常', ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '出错 · 目录读取失败', note: '断网', catalog: offline },
  { title: '出错 · 目录格式版本不受支持', note: 'catalog.json 的格式版本高于安装器所支持的', catalog: newerFormat },
  { title: '出错 · 没有交互式终端', note: 'npx oxy-tools | cat · 不打印大标志；出错说明走标准错误，所以仍然看得到', tty: false },
  { title: '出错 · 无法识别的参数', note: 'npx oxy-tools --frobnicate', argv: ['--frobnicate'] },
  { title: '帮助', note: 'npx oxy-tools --help', argv: ['--help'] },
  { title: '英文界面 · 主菜单', note: 'npx oxy-tools --lang en', argv: ['--lang', 'en'] },
  { title: '英文界面 · skill 多选列表', argv: ['--lang', 'en'], keys: pickTwo },
  { title: '英文界面 · 汇总与结果', argv: ['--lang', 'en'], catalog: oneFails, keys: install },
  { title: '英文界面 · 选择宿主', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, keys: toSkills },
  { title: '英文界面 · 两个宿主的汇总与结果', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, catalog: oneFails, keys: twoHosts(install) },
  { title: '英文界面 · 四种状态并存', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '英文界面 · 含覆盖项的汇总、确认与结果', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '英文界面 · 一个宿主都没有', argv: ['--lang', 'en'], onPath: [] },
  { title: '英文界面 · 应用项目列表', argv: ['--lang', 'en'], catalog: withApps, keys: toApps },
  { title: '英文界面 · 应用项目详情', argv: ['--lang', 'en'], catalog: withApps, keys: openApp },
  { title: '英文界面 · 应用项目详情 · 浏览器打不开', argv: ['--lang', 'en'], catalog: withApps, browser: false, keys: openApp },
  { title: '英文界面 · 一个宿主都没有 · 有应用项目', argv: ['--lang', 'en'], catalog: withApps, onPath: [] },
  { title: '英文界面 · 一个宿主都没有 · 在 skill 分组上按回车', argv: ['--lang', 'en'], onPath: [], keys: [KEY.up, KEY.enter] },
  { title: '英文界面 · MCP 多选列表', argv: ['--lang', 'en'], ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '英文界面 · MCP 多选列表 · 不可选的条目', argv: ['--lang', 'en'], ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '英文界面 · MCP 的汇总与结果', argv: ['--lang', 'en'], ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '不显示颜色 · 主菜单', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' } },
  { title: '不显示颜色 · skill 多选列表', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, keys: pickTwo },
  { title: '不显示颜色 · 汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: oneFails, keys: install },
  { title: '不显示颜色 · 选择宿主', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, keys: toSkills },
  { title: '不显示颜色 · 四种状态并存', note: '设置了 NO_COLOR：每种状态的文字本身就不同', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '不显示颜色 · 含覆盖项的汇总、确认与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '不显示颜色 · 一个宿主都没有', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: [] },
  { title: '不显示颜色 · 应用项目详情', note: '设置了 NO_COLOR：链接没有下划线，文字照旧', env: { NO_COLOR: '1' }, catalog: withApps, keys: openApp },
  { title: '不显示颜色 · 应用项目详情 · 浏览器打不开', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: withApps, browser: false, keys: openApp },
  { title: '不显示颜色 · MCP 多选列表', note: '设置了 NO_COLOR：四种状态的文字本身就不同', env: { NO_COLOR: '1' }, ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '不显示颜色 · MCP 多选列表 · 不可选的条目', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '不显示颜色 · MCP 的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '不显示颜色 · 出错', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: offline },
  { title: '没有 Unicode · 启动与加载', note: 'Windows 旧式控制台：符号和大标志退成 ASCII', ...LEGACY_CONSOLE, catalog: neverLoads },
  { title: '没有 Unicode · 主菜单', note: '按键提示里的按键改用文字', ...LEGACY_CONSOLE, catalog: withBrokenEntry },
  { title: '没有 Unicode · skill 多选列表', ...LEGACY_CONSOLE, keys: pickTwo },
  { title: '没有 Unicode · 汇总与结果', ...LEGACY_CONSOLE, catalog: oneFails, keys: install },
  { title: '没有 Unicode · 选择宿主', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, keys: toSkills },
  { title: '没有 Unicode · 四种状态并存', note: '版本变化的箭头退成 ->', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '没有 Unicode · 含覆盖项的汇总、确认与结果', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '没有 Unicode · 一个宿主都没有', ...LEGACY_CONSOLE, onPath: [] },
  { title: '没有 Unicode · 应用项目列表', ...LEGACY_CONSOLE, catalog: withApps, keys: toApps },
  { title: '没有 Unicode · 应用项目详情', note: '打开之后的记号退成 +', ...LEGACY_CONSOLE, catalog: withApps, keys: openApp },
  { title: '没有 Unicode · MCP 多选列表', note: '不可选的勾选位退成 [-]', ...LEGACY_CONSOLE, ...MCP_STATES, keys: pickMcps },
  { title: '没有 Unicode · MCP 的汇总与结果', ...LEGACY_CONSOLE, ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '没有 Unicode · 出错', ...LEGACY_CONSOLE, catalog: offline },
];

// ── 驱动安装器，读出画面 ──────────────────────────────────────────────────────

interface Cell {
  char: string;
  wide: boolean;
  /** 终端的标准命名色编号，null 是默认色 */
  color: number | null;
  bold: boolean;
  dim: boolean;
  underline: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// 每个场景一个假的主目录、临时目录和可执行路径，全部放在这下面，结束时一并删掉
const scratch = mkdtempSync(join(tmpdir(), 'oxy-tools-preview-'));
function scratchDir(label: string): string {
  return mkdtempSync(join(scratch, `${label}-`));
}

async function play(scene: Scene): Promise<Cell[][]> {
  const terminal = new xterm.Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true, convertEol: true });
  let lastWrite = Date.now();
  const write = (text: string): void => {
    lastWrite = Date.now();
    terminal.write(text);
  };
  // 输出停下来一小会儿就算画完了；转动符号一直在写，所以另设上限
  const settle = async (): Promise<void> => {
    const deadline = Date.now() + 400;
    await sleep(30);
    while (Date.now() - lastWrite < 60 && Date.now() < deadline) await sleep(10);
  };

  const { keyboard, prompter } = keyboardPrompter(write, ROWS);
  const tty = scene.tty ?? true;
  const bin = scratchDir('bin');
  for (const command of scene.onPath ?? ['claude']) writeFileSync(join(bin, command), '', { mode: 0o755 });
  const home = scratchDir('home');
  for (const [path, content] of Object.entries(scene.home ?? {})) {
    mkdirSync(dirname(join(home, path)), { recursive: true });
    writeFileSync(join(home, path), content);
  }
  for (const [link, target] of Object.entries(scene.links ?? {})) {
    mkdirSync(dirname(join(home, link)), { recursive: true });
    symlinkSync(join(home, target), join(home, link), 'junction');
  }
  const finished = runInstaller({
    argv: scene.argv ?? [],
    env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', PATH: bin, ...scene.env },
    platform: scene.platform ?? 'darwin',
    systemLocale: 'zh-CN',
    stdout: { isTTY: tty, rows: ROWS, columns: COLUMNS, write },
    stderr: { isTTY: true, write },
    stdinIsTTY: tty,
    catalogSource: scene.catalog ?? sample,
    homeDir: home,
    tempDir: scratchDir('tmp'),
    interrupt: new AbortController().signal,
    runCommand: scene.commands ?? (async () => ok),
    prompter,
    // 预览页不真的打开浏览器
    openLink: () => (scene.browser === false ? Promise.reject(new Error('preview has no browser')) : Promise.resolve()),
  });

  await settle();
  for (const key of scene.keys ?? []) {
    keyboard.write(key);
    await settle();
  }
  await new Promise<void>((resolve) => terminal.write('', resolve));
  const cells = readCells(terminal);
  // 收掉还开着的提问；一直在加载的场景不会结束，由进程退出时一并了结
  keyboard.write(KEY.ctrlC);
  await Promise.race([finished, sleep(200)]);
  return cells;
}

function readCells(terminal: InstanceType<typeof xterm.Terminal>): Cell[][] {
  const buffer = terminal.buffer.active;
  const lines: Cell[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const line = buffer.getLine(y);
    const cells: Cell[] = [];
    for (let x = 0; line && x < COLUMNS; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      cells.push({
        char: cell.getChars() || ' ',
        wide: cell.getWidth() === 2,
        color: cell.isFgPalette() ? cell.getFgColor() : null,
        bold: cell.isBold() !== 0,
        dim: cell.isDim() !== 0,
        underline: cell.isUnderline() !== 0,
      });
    }
    while (cells.at(-1)?.char === ' ') cells.pop();
    lines.push(cells);
  }
  while (lines.at(-1)?.length === 0) lines.pop();
  return lines;
}

// ── 转成 HTML ─────────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cellClass(cell: Cell): string {
  return [cell.color === null ? '' : `c${cell.color}`, cell.bold ? 'b' : '', cell.dim ? 'd' : '', cell.underline ? 'u' : '']
    .filter(Boolean)
    .join(' ');
}

// 非 ASCII 字符各包一层定宽的盒子，浏览器里才和终端一样按格对齐；实心方块填满整格
function lineHtml(cells: Cell[]): string {
  let html = '';
  let run = { className: '', text: '' };
  const flush = (): void => {
    if (run.text) html += run.className ? `<span class="${run.className}">${run.text}</span>` : run.text;
  };
  for (const cell of cells) {
    const className = cellClass(cell);
    if (className !== run.className) {
      flush();
      run = { className, text: '' };
    }
    const code = cell.char.codePointAt(0) ?? 0;
    if (cell.char.length === 1 && code < 128) {
      run.text += escapeHtml(cell.char);
    } else {
      const shape = code === 0x2588 ? ' fill' : code >= 0x2500 && code <= 0x257f ? ' box' : '';
      run.text += `<i class="${cell.wide ? 'w2' : 'w1'}${shape}">${escapeHtml(cell.char)}</i>`;
    }
  }
  flush();
  return `<div class="l">${html || ' '}</div>`;
}

// 两套代表性配色，近似 VS Code 默认的深色与浅色终端；真实色值由用户自己的终端决定
const PALETTES = {
  dark: { label: '深色终端', background: '#181818', foreground: '#cccccc', colors: ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5'] },
  light: { label: '浅色终端', background: '#ffffff', foreground: '#3b3b3b', colors: ['#000000', '#cd3131', '#107c10', '#949800', '#0451a5', '#bc05bc', '#0598bc', '#555555'] },
};

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#e4e5e7;color:#1d1d1f;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
main{width:1280px;margin:0 auto;padding:22px 22px 60px}
h1{font-size:18px;margin:0 0 4px}
main>p{margin:0 0 22px;color:#6b6b70;font-size:13px}
.scene{margin:0 0 26px}
.scene h2{margin:0 0 8px;font-size:14px;font-weight:600;display:flex;gap:10px;align-items:baseline}
.scene h2 small{font-weight:400;color:#6b6b70;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.term{border-radius:8px;overflow:hidden;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px rgba(0,0,0,.16),0 6px 18px rgba(0,0,0,.10)}
.bar{height:26px;display:flex;align-items:center;gap:6px;padding:0 10px;font-size:11px;background:color-mix(in srgb,var(--fg) 9%,var(--bg))}
.bar i{width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--fg) 30%,var(--bg))}
.bar span{margin-left:8px;opacity:.6}
.screen{padding:10px 12px 14px;font:12px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,"Cascadia Mono","DejaVu Sans Mono",monospace;white-space:pre}
.l{height:1.2em}
.l i{font-style:normal;display:inline-block;text-align:center;vertical-align:top;height:1.2em}
.w1{width:1ch}.w2{width:2ch}
.fill{box-shadow:inset 0 0 0 1em currentColor,0 0 0 .5px currentColor}.box{transform:scaleY(1.22)}
.b{font-weight:700}.d{opacity:.5}.u{text-decoration:underline;text-underline-offset:2px}
${Object.entries(PALETTES)
  .map(([name, palette]) => `.term.${name}{--bg:${palette.background};--fg:${palette.foreground};${palette.colors.map((value, index) => `--c${index}:${value}`).join(';')}}`)
  .join('\n')}
${PALETTES.dark.colors.map((_, index) => `.c${index}{color:var(--c${index})}`).join('')}
`;

function page(frames: { scene: Scene; lines: Cell[][] }[]): string {
  const sections = frames.map(({ scene, lines }) => {
    const screen = lines.map(lineHtml).join('');
    const terminals = Object.entries(PALETTES)
      .map(([name, palette]) => `<div class="term ${name}"><div class="bar"><i></i><i></i><i></i><span>${palette.label}</span></div><div class="screen">${screen}</div></div>`)
      .join('');
    const note = scene.note ? `<small>${escapeHtml(scene.note)}</small>` : '';
    return `<section class="scene"><h2>${escapeHtml(scene.title)}${note}</h2><div class="pair">${terminals}</div></section>`;
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>oxy-tools 界面预览页</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>oxy-tools 界面预览页</h1>
<p>安装器真实的终端输出，共 ${frames.length} 个画面；每个画面左为深色终端、右为浅色终端。对照视觉方向「账本」核对。</p>
${sections.join('\n')}
</main>
</body>
</html>
`;
}

const frames = [];
for (const scene of scenes) frames.push({ scene, lines: await play(scene) });

const target = fileURLToPath(new URL('../.preview/index.html', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.preview/', import.meta.url)), { recursive: true });
writeFileSync(target, page(frames));
console.log(`${frames.length} 个画面 → ${target}`);
rmSync(scratch, { recursive: true, force: true });
// 一直在加载的场景还挂着定时器，直接结束进程
process.exit(0);
