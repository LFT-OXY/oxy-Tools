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
  /** 假装执行工具的安装命令：它往终端上打什么、怎么结束；缺省照 installsTool */
  shell?: (command: string) => ShellRun;
  /** 依次按下的键；画面停在按完之后的样子 */
  keys?: string[];
  /** 语言提问也由 keys 来按，不给 keys 就停在它上面；缺省由假键盘替用户按回车，keys 里不用写它 */
  answersLanguage?: boolean;
}

/** 一条假装执行的工具安装命令 */
interface ShellRun {
  /** 命令自己打到终端上的东西 */
  output: string;
  /** 缺省是 0 */
  exitCode?: number;
  /** 假装装好了：往可执行路径里放这个命令 */
  installs?: string;
  /** 假装装好了：在主目录下写出这个相对路径 */
  creates?: string;
  /** 命令没能起来：以带这个错误码的错误拒绝 */
  cannotStart?: string;
  /** 输出打完之后一直不结束 */
  hangs?: boolean;
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

// 工具也是为预览编的样例：两种检查方式都有，一条另给了 Windows 的命令，一条只支持 Linux，一条只给 Codex 用
const SHOWCASE_TOOLS = [
  {
    name: 'uv',
    zh: '极快的 Python 包与项目管理器，许多 MCP 服务器靠它的 uvx 启动',
    en: 'An extremely fast Python package and project manager; many MCP servers are launched with its uvx',
    install: { default: 'curl -LsSf https://astral.sh/uv/install.sh | sh', windows: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"' },
    check: { command: 'uv' },
  },
  { name: 'bun', zh: '一体化的 JavaScript 运行时与包管理器', en: 'All-in-one JavaScript runtime and package manager', install: { default: 'curl -fsSL https://bun.sh/install | bash' }, check: { path: '.bun/bin/bun' } },
  { name: 'openspec', zh: '规格驱动开发的命令行工具', en: 'Command-line tool for spec-driven development', install: { default: 'npm install -g @fission-ai/openspec@latest' }, check: { command: 'openspec' } },
  {
    name: 'bubblewrap',
    zh: 'Linux 上的轻量沙箱，AI Agent 执行命令时用它隔离',
    en: 'Lightweight sandbox on Linux that AI Agents use to isolate the commands they run',
    install: { default: 'sudo apt-get install -y bubblewrap', macos: null, windows: null },
    check: { command: 'bwrap' },
  },
  { name: 'codex-usage', zh: '统计 Codex 的用量与花费', en: 'Report Codex usage and cost', hosts: ['codex'], install: { default: 'npm install -g codex-usage' }, check: { command: 'codex-usage' } },
].map(({ zh, en, ...tool }) => ({ ...tool, description: { zh, en }, url: `https://example.com/${tool.name}` }));
// 名字和命令都长的工具：命令在汇总里折行
const LONG_COMMAND_TOOL = {
  name: 'rustup-toolchain-installer',
  description: { zh: 'Rust 工具链的安装与版本管理器', en: 'Installer and version manager for the Rust toolchain' },
  url: 'https://example.com/rustup',
  install: { default: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal --no-modify-path" },
  check: { path: '.cargo/bin/rustup' },
};

const sample = catalogOf({ version: 1, skills: SHOWCASE_SKILLS });
const withTools = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, tools: SHOWCASE_TOOLS });
const withLongCommandTool = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, tools: [LONG_COMMAND_TOOL, ...SHOWCASE_TOOLS] });
const withMcps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: SHOWCASE_MCPS });
// 名字长的 MCP：汇总里它的备注一行放不下
const LONG_NAME_MCP = {
  name: 'modelcontextprotocol-server-sequential-thinking',
  description: { zh: '把复杂问题拆成一步步的思考过程', en: 'Break a complex problem down into a step-by-step thinking process' },
  url: 'https://example.com/sequential-thinking',
  server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
};
const withLongNameMcp = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: [...SHOWCASE_MCPS, LONG_NAME_MCP] });
// 带 key 的 MCP：context7 的 key 可选，exa 的必填（它的用途写得长，一行放不下）
const keyed = (name: string, required: boolean, zh: string, en: string, url: string) => [{ name, required, description: { zh, en }, url }];
const SHOWCASE_KEYED_MCPS = [
  SHOWCASE_MCPS[0],
  { ...SHOWCASE_MCPS[1], env: keyed('CONTEXT7_API_KEY', false, '提高请求限额，没有也能用', 'Raises the rate limit; works without it', 'https://context7.com/dashboard') },
  {
    name: 'exa',
    description: { zh: '面向 AI 的网页搜索与正文抓取，需要 API key', en: 'Web search and page content retrieval built for AI; needs an API key' },
    url: 'https://example.com/exa',
    server: { command: 'npx', args: ['-y', 'exa-mcp-server'] },
    env: keyed('EXA_API_KEY', true, 'Exa 搜索 API 的密钥；注册后有免费额度，在控制台的 API Keys 页创建', 'Key for the Exa search API; sign-up includes a free quota, and keys are created on the API Keys page of the dashboard', 'https://dashboard.exa.ai/api-keys'),
  },
  ...SHOWCASE_MCPS.slice(2),
];
const withKeyedMcps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: SHOWCASE_KEYED_MCPS });
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

// 假装执行工具的安装命令：uv 的装好了，别的打一段 npm 的话、以非零状态结束，什么都没装上
const UV_OUTPUT = ['downloading uv 0.9.2 aarch64-apple-darwin', 'no checksums to verify', 'installing to /Users/oxy/.local/bin', '  uv', '  uvx', "everything's installed!", ''].join('\n');
const NPM_FAILURE = ['npm error code EACCES', 'npm error syscall mkdir', 'npm error path /usr/local/lib/node_modules/@fission-ai', 'npm error errno -13', ''].join('\n');
const installsTool = (command: string): ShellRun =>
  command.includes('astral.sh/uv') ? { output: UV_OUTPUT, installs: 'uv' } : { output: NPM_FAILURE, exitCode: 243 };
// Windows 上 uv 的安装脚本说的话
const UV_OUTPUT_WINDOWS = ['Downloading uv 0.9.2 (x86_64-pc-windows-msvc)', 'Installing to C:\\Users\\oxy\\.local\\bin', '  uv.exe', '  uvx.exe', "everything's installed!", ''].join('\n');
const installsToolOnWindows = (command: string): ShellRun =>
  command.includes('astral.sh/uv') ? { output: UV_OUTPUT_WINDOWS, installs: 'uv' } : { output: NPM_FAILURE.replace('/usr/local/lib/node_modules/', 'C:\\Program Files\\nodejs\\node_modules\\'), exitCode: 243 };
// 两种检查方式各装好一个：uv 进了可执行路径，bun 写出了主目录下的那个路径
const BUN_OUTPUT = ['bun was installed successfully to ~/.bun/bin/bun', 'Run \'bun --help\' to get started', ''].join('\n');
const allInstall = (command: string): ShellRun =>
  command.includes('astral.sh/uv') ? { output: UV_OUTPUT, installs: 'uv' } : { output: BUN_OUTPUT, creates: '.bun/bin/bun' };
// 第一条命令打了一半，还没结束
const firstStillRunning = (): ShellRun => ({ output: UV_OUTPUT.split('\n').slice(0, 3).join('\n') + '\n', hangs: true });
// bun 已经装过：主目录下有它的检查路径
const BUN_INSTALLED = { '.bun/bin/bun': '' };

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
// 场景缺省没有 COLORTERM，大标志走的是洋红那一档；要看渐变得声明终端支持 24 位色
const TRUECOLOR = { COLORTERM: 'truecolor' };
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
// 带 key 的样例里 exa 是第三条：只勾它再确认，停在问 key 的提问上
const toExaKey = [...toMcps, ...down(2), KEY.space, KEY.enter];
// 勾上 context7（key 可选）和 exa（key 必填），停在第一个 key 的提问上
const toTwoKeys = [...toMcps, KEY.down, KEY.space, KEY.down, KEY.space, KEY.enter];
// 假装粘贴进来的 key：它不该出现在任何一格画面里
const PASTED_KEY = 'exa-live-7c1e09b4a2f85d36';
// 填好 exa 的 key，停在汇总确认上
const toKeyedSummary = [...toExaKey, PASTED_KEY, KEY.enter];
// 勾上 chrome-devtools 和 exa，exa 的 key 留空
const skipExa = [...toMcps, KEY.space, ...down(2), KEY.space, KEY.enter, KEY.enter];
// 主菜单上从 Skill 下移到工具再进去（样例目录里只有 skill 和工具两个分组）
const toTools = [KEY.down, KEY.enter];
// 勾上 uv 和 openspec，光标停在 openspec 上
const pickTools = [...toTools, KEY.space, ...down(2), KEY.space];
const runTools = [...pickTools, KEY.enter, KEY.enter];
// 勾上 uv 和 bun 再执行
const runUvAndBun = [...toTools, KEY.space, KEY.down, KEY.space, KEY.enter, KEY.enter];
// 只勾 bun 再执行
const runBun = [...toTools, KEY.down, KEY.space, KEY.enter, KEY.enter];
const TOOLS = { catalog: withTools, home: BUN_INSTALLED };
const KEYED = { catalog: withKeyedMcps };
const MCP_STATES = { catalog: withMcps, home: CLAUDE_CONFIGURED };
const MCP_TWO_HOSTS = { catalog: withMcps, onPath: BOTH_HOSTS, home: { ...CLAUDE_CONFIGURED, ...CODEX_UNREADABLE } };

const scenes: Scene[] = [
  { title: '启动与加载', note: 'npx oxy-tools · 最先打出 OXY 大标志；读取目录时行首的符号转动', catalog: neverLoads },
  { title: '标题区 · 渐变', note: 'COLORTERM=truecolor：标志从左到右由粉到紫到蓝，同一列的方块同色', env: TRUECOLOR },
  { title: '标题区 · 洋红（没有 COLORTERM）', note: '终端没有声明支持 24 位色：整个标志是终端自己的洋红，和焦点符号同色' },
  { title: '标题区 · 不显示颜色', note: '设置了 NO_COLOR：哪怕同时有 COLORTERM=truecolor，标志也不上色', env: { ...TRUECOLOR, NO_COLOR: '1' } },
  { title: '语言提问 · 系统语言是中文', note: '大标志之后的第一问：光标停在「中文」上，按键提示是中文；提问和两个选项不随界面语言变', answersLanguage: true },
  { title: '语言提问 · 系统语言不是中文', note: 'LANG=en_US.UTF-8：光标停在 English 上，按键提示是英文', env: { LANG: 'en_US.UTF-8' }, answersLanguage: true },
  { title: '语言提问 · 选了与系统语言不同的一项', note: '下移到 English 再回车：收成一行，之后的画面都是选定的语言', answersLanguage: true, keys: [KEY.down, KEY.enter] },
  { title: '主菜单', note: '语言提问收成一行，留在本机信息上方。只检测到 Claude Code：说明 Codex 被跳过；catalog.json 三个数组为空，只有 Skill 一个分组和退出' },
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
  { title: '填写 key · 必填项', note: '勾了 exa：先说明是哪个变量、做什么用、去哪申请、留空会怎样，再问；提问后面是一句固定的提示', ...KEYED, keys: toExaKey },
  { title: '填写 key · 粘贴之后还没回车', note: '输入不回显，也不显示长度：画面和上一格一样', ...KEYED, keys: [...toExaKey, PASTED_KEY] },
  { title: '填写 key · 可选项', note: '标题和提示都写明可选：留空就不设置这个变量', ...KEYED, keys: toTwoKeys },
  { title: '填写 key · 可选的留空之后问下一个', note: '问过的提问擦掉，留下一行结局；每个 key 一个分区', ...KEYED, keys: [...toTwoKeys, KEY.enter] },
  { title: '汇总确认 · 含 key', note: '命令里 key 的位置是占位符，下面说明执行时才代入；填过的那一行只写已填写', ...KEYED, keys: toKeyedSummary },
  {
    title: '汇总确认 · 含 key · 两个宿主',
    note: 'key 只问一次，两个宿主的命令各带一个占位符；可选的那个留空了，命令里没有它',
    ...KEYED,
    onPath: BOTH_HOSTS,
    keys: [...toMcps, KEY.enter, ...toTwoKeys.slice(toMcps.length), KEY.enter, PASTED_KEY, KEY.enter],
  },
  { title: '汇总确认 · 返回修改后再确认', note: '这次运行里填过的 key 不再问，留下一行说明', ...KEYED, keys: [...toKeyedSummary, KEY.down, KEY.enter, KEY.enter] },
  { title: '结果 · 带 key 的 MCP', note: '结果里同样没有 key 的值', ...KEYED, keys: [...toKeyedSummary, KEY.enter] },
  { title: '汇总确认 · 必填的 key 没填', note: '留下的一行说明将跳过它；汇总和命令里只有其余的', ...KEYED, keys: skipExa },
  { title: '结果 · 必填的 key 没填', note: '那一项写明跳过和原因，其余照常', ...KEYED, keys: [...skipExa, KEY.enter] },
  { title: '结果 · 选中的都没填 key', note: '没有命令要执行：不问执行不执行，直接给出结果，回到主菜单', ...KEYED, keys: [...toExaKey, KEY.enter] },
  { title: '主菜单 · 有工具', note: 'catalog.json 里有工具条目时多出这个分组，「目录」一行也数上它', ...TOOLS },
  { title: '主菜单 · 一个宿主都没有 · 有工具', note: '工具同样是组件：一个宿主都没检测到时进不去，行尾注明原因', ...TOOLS, onPath: [] },
  { title: '工具多选列表', note: '只有一栏状态：已安装、未安装，由条目声明的检查方式决定；装不了的条目不可选，状态栏的位置写原因（当前系统不支持、它要的 AI Agent 没检测到）', ...TOOLS, keys: pickTools },
  { title: '工具多选列表 · 在不可选的条目上按空格', note: '光标能移上去，但勾不上：列表下方多一行说明', ...TOOLS, keys: [...toTools, ...down(3), KEY.space] },
  { title: '汇总确认 · 两个工具', note: '两条完整的命令都列出来，前面是序号和工具的名字；确认后才执行', ...TOOLS, keys: [...pickTools, KEY.enter] },
  { title: '汇总确认 · 工具 · 命令比一行长', note: '命令折行，续行与命令的左缘对齐，从不截断', catalog: withLongCommandTool, keys: [...toTools, KEY.space, KEY.down, KEY.space, KEY.enter] },
  { title: '汇总确认 · 工具 · Windows 上的命令', note: '条目给这个系统另写了命令：展示和执行的都是那一条', ...TOOLS, platform: 'win32', env: { WT_SESSION: '1' }, keys: [...toTools, KEY.space, KEY.enter] },
  { title: '执行工具的安装命令 · 进行中', note: '每个工具一个以它名字为标题的分区，第一行是要执行的命令；命令自己的输出原样透传，顶格、不加样式', ...TOOLS, shell: firstStillRunning, keys: runTools },
  { title: '结果 · 工具 · 一项成功一项失败', note: '结论以复核为准，不看命令的退出状态，紧跟在各自的输出后面；装了不止一个时，合计之前再用「结果」分区集中列一遍', ...TOOLS, keys: runTools },
  { title: '结果 · 工具 · 全部成功', note: '两种检查方式各有各的说法：在 PATH 中找到了命令、主目录下的那个路径已存在', catalog: withTools, shell: allInstall, keys: runUvAndBun },
  { title: '结果 · 工具 · 命令非零退出但复核通过', note: '以复核为准：bun 本来就装着，算已可用；退出状态照实写在后面', ...TOOLS, shell: () => ({ output: 'error: Failed to download bun (HTTP 503)\n', exitCode: 1 }), keys: runBun },
  { title: '结果 · 工具 · 命令没能运行', note: '命令没能起来：原因只写错误码，复核照做', catalog: withTools, shell: () => ({ output: '', cannotStart: 'ENOENT' }), keys: runBun },
  { title: '结果 · 工具 · 命令正常结束但复核不通过', note: '命令以 0 退出，可执行路径上却找不到它：算失败，并提醒可能要重开终端', ...TOOLS, shell: () => ({ output: UV_OUTPUT }), keys: [...toTools, KEY.space, KEY.enter, KEY.enter] },
  { title: '出错 · 目录读取失败', note: '断网', catalog: offline },
  { title: '出错 · 目录格式版本不受支持', note: 'catalog.json 的格式版本高于安装器所支持的', catalog: newerFormat },
  { title: '出错 · 没有交互式终端', note: 'npx oxy-tools | cat · 不打印大标志；出错说明走标准错误，所以仍然看得到', tty: false },
  { title: '出错 · 无法识别的参数', note: 'npx oxy-tools --frobnicate', argv: ['--frobnicate'] },
  { title: '帮助', note: 'npx oxy-tools --help', argv: ['--help'] },
  { title: '英文界面 · 主菜单', note: 'npx oxy-tools --lang en · 给了 --lang 就不问语言', argv: ['--lang', 'en'] },
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
  { title: '英文界面 · 填写 key', argv: ['--lang', 'en'], ...KEYED, keys: toTwoKeys },
  { title: '英文界面 · 含 key 的汇总', argv: ['--lang', 'en'], ...KEYED, keys: [...toTwoKeys, KEY.enter, PASTED_KEY, KEY.enter] },
  { title: '英文界面 · 必填的 key 没填', argv: ['--lang', 'en'], ...KEYED, keys: [...skipExa, KEY.enter] },
  { title: '英文界面 · 工具多选列表', argv: ['--lang', 'en'], ...TOOLS, keys: pickTools },
  { title: '英文界面 · 工具的汇总与结果', argv: ['--lang', 'en'], ...TOOLS, keys: runTools },
  { title: '英文界面 · 出错', argv: ['--lang', 'en'], catalog: offline },
  { title: '英文界面 · 帮助', note: 'npx oxy-tools --help --lang en', argv: ['--help', '--lang', 'en'] },
  { title: '不显示颜色 · 语言提问', note: '设置了 NO_COLOR：光标靠 ▸ 认，不靠颜色', env: { NO_COLOR: '1' }, answersLanguage: true },
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
  { title: '不显示颜色 · 填写 key', note: '设置了 NO_COLOR：申请地址没有下划线，文字照旧', env: { NO_COLOR: '1' }, ...KEYED, keys: [...toTwoKeys, KEY.enter] },
  { title: '不显示颜色 · 含 key 的汇总与结果', note: '设置了 NO_COLOR：占位符靠尖括号认', env: { NO_COLOR: '1' }, ...KEYED, keys: [...skipExa.slice(0, -1), PASTED_KEY, KEY.enter, KEY.enter] },
  { title: '不显示颜色 · 工具多选列表', note: '设置了 NO_COLOR：状态和不可选的原因都是字，不靠颜色', env: { NO_COLOR: '1' }, ...TOOLS, keys: pickTools },
  { title: '不显示颜色 · 工具的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...TOOLS, keys: runTools },
  { title: '不显示颜色 · 出错', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: offline },
  { title: '没有 Unicode · 启动与加载', note: 'Windows 旧式控制台：符号和大标志退成 ASCII', ...LEGACY_CONSOLE, catalog: neverLoads },
  { title: '没有 Unicode · 语言提问', note: '光标退成 >，按键提示里的按键改用文字；三段固定的字不变', ...LEGACY_CONSOLE, answersLanguage: true },
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
  { title: '没有 Unicode · MCP 多选列表 · 不可选的条目', note: '在不可选的条目上按空格：光标照样显眼，下方多一行说明', ...LEGACY_CONSOLE, ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '没有 Unicode · MCP 的汇总与结果', ...LEGACY_CONSOLE, ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '没有 Unicode · 填写 key', note: '留下的那一行的记号退成 -', ...LEGACY_CONSOLE, ...KEYED, keys: [...toTwoKeys, KEY.enter] },
  { title: '没有 Unicode · 含 key 的汇总与结果', ...LEGACY_CONSOLE, ...KEYED, keys: [...skipExa.slice(0, -1), PASTED_KEY, KEY.enter, KEY.enter] },
  { title: '没有 Unicode · 工具多选列表', note: '不可选的勾选位退成 [-]，各栏照样对齐；这个系统是 Windows，不支持它的那条写明原因', ...LEGACY_CONSOLE, ...TOOLS, keys: pickTools },
  { title: '没有 Unicode · 工具的汇总与结果', ...LEGACY_CONSOLE, ...TOOLS, shell: installsToolOnWindows, keys: runTools },
  { title: '没有 Unicode · 出错', ...LEGACY_CONSOLE, catalog: offline },
];

// ── 驱动安装器，读出画面 ──────────────────────────────────────────────────────

interface Cell {
  char: string;
  wide: boolean;
  /** 终端的标准命名色编号；24 位色是 #rrggbb；null 是默认色 */
  color: number | string | null;
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

  const { keyboard, prompter } = keyboardPrompter(write, ROWS, scene.answersLanguage);
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
    runCommand: async (command, args, options) => {
      if (!options?.shell) return (scene.commands ?? (async () => ok))(command, args);
      // 工具的安装命令：真的执行时它的输出直接接在终端上，这里照样写到同一个终端里
      const run = (scene.shell ?? installsTool)(command);
      write(run.output);
      if (run.hangs) await new Promise<never>(() => {});
      if (run.cannotStart) throw Object.assign(new Error(`spawn ${run.cannotStart}`), { code: run.cannotStart });
      if (run.installs) writeFileSync(join(bin, run.installs), '', { mode: 0o755 });
      if (run.creates) {
        mkdirSync(dirname(join(home, run.creates)), { recursive: true });
        writeFileSync(join(home, run.creates), '');
      }
      return { exitCode: run.exitCode ?? 0 };
    },
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
  // 整个缓冲区，连同滚出屏幕的部分：画面比 ROWS 行长时，只读前 ROWS 行会把底下的截掉
  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    const cells: Cell[] = [];
    for (let x = 0; line && x < COLUMNS; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      cells.push({
        char: cell.getChars() || ' ',
        wide: cell.getWidth() === 2,
        color: cell.isFgRGB() ? `#${cell.getFgColor().toString(16).padStart(6, '0')}` : cell.isFgPalette() ? cell.getFgColor() : null,
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

// 命名色跟着深色、浅色两套配色走，用类名；24 位色两边是同一个值，直接写进 style
function cellAttributes(cell: Cell): string {
  const classes = [typeof cell.color === 'number' ? `c${cell.color}` : '', cell.bold ? 'b' : '', cell.dim ? 'd' : '', cell.underline ? 'u' : '']
    .filter(Boolean)
    .join(' ');
  return `${classes && ` class="${classes}"`}${typeof cell.color === 'string' ? ` style="color:${cell.color}"` : ''}`;
}

// 非 ASCII 字符各包一层定宽的盒子，浏览器里才和终端一样按格对齐；实心方块填满整格
function lineHtml(cells: Cell[]): string {
  let html = '';
  let run = { attributes: '', text: '' };
  const flush = (): void => {
    if (run.text) html += run.attributes ? `<span${run.attributes}>${run.text}</span>` : run.text;
  };
  for (const cell of cells) {
    const attributes = cellAttributes(cell);
    if (attributes !== run.attributes) {
      flush();
      run = { attributes, text: '' };
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
