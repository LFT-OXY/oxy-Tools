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
// 假装粘贴进来的 key：它不该出现在任何一格画面里
const PASTED_KEY = 'exa-live-7c1e09b4a2f85d36';
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
  /** 项目目录（主目录下的 work/my-app）里事先有什么：相对路径 → 文件内容 */
  project?: Record<string, string>;
  /** 假的外部命令执行器，缺省每条命令都成功；预览页从不真的执行命令 */
  commands?: CommandRunner;
  /**
   * 假装 skills CLI 装第三方 Skill 时装不上的那些，写成「skill 的名字@宿主在 skills CLI 里的名字」：它们的命令以 1 退出、
   * 什么都不写；别的都装得上（往那个宿主的 skill 目录里写出 SKILL.md）
   */
  thirdPartyFails?: string[];
  /** 假装执行工具的安装命令：它往终端上打什么、怎么结束；缺省照 installsTool */
  shell?: (command: string) => ShellRun;
  /** 依次按下的键；画面停在按完之后的样子 */
  keys?: string[];
  /** 语言提问也由 keys 来按，不给 keys 就停在它上面；缺省由假键盘替用户按回车，keys 里不用写它 */
  answersLanguage?: boolean;
  /** 安装范围的提问也由 keys 来按，不给 keys 就停在它上面；缺省由假键盘替用户按回车（全局），keys 里不用写它 */
  answersScope?: boolean;
  /** 终端只有这么多行，画面只取还在屏幕上的部分；缺省是够高的终端，连同滚上去的都取 */
  rows?: number;
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

// 外部项目的场景另带一份用途清单：照仓库里真实的那十个，主菜单才看得出按用途排开的样子
const SHOWCASE_PURPOSES = [
  ['dev-workflow', '开发工作流与规范', 'Development workflow & conventions'],
  ['agent-behavior', 'Agent 行为约束与输出风格', 'Agent behavior & output style'],
  ['codebase-understanding', '代码库索引与理解', 'Codebase indexing & understanding'],
  ['context-memory', '上下文、记忆与 Token 优化', 'Context, memory & token optimization'],
  ['web-search', '联网搜索与文档检索', 'Web search & docs retrieval'],
  ['browser-automation', '浏览器自动化', 'Browser automation'],
  ['design-media', 'UI 设计、图像与视频', 'UI design, images & video'],
  ['documents', '文档处理', 'Document processing'],
  ['prompts-writing', '提示词与写作', 'Prompts & writing'],
  ['review-security', '代码审查、评估与安全', 'Code review, evaluation & security'],
].map(([id, zh, en]) => ({ id, name: { zh, en } }));

// 外部项目的样例：分在四个用途下，其余六个用途没有条目。有一条名字很长，一条的链接比一行长，几条的说明比一行长
const SHOWCASE_APPS = [
  ['dify', 'dev-workflow', '开源的 LLM 应用开发平台，自带工作流编排与知识库，用 docker 部署', 'Open-source LLM app development platform with workflow orchestration and a knowledge base, deployed with docker', 'https://github.com/langgenius/dify'],
  ['n8n', 'dev-workflow', '可自托管的工作流自动化平台，内置 AI 节点', 'Self-hostable workflow automation platform with built-in AI nodes', 'https://github.com/n8n-io/n8n'],
  ['open-webui', 'dev-workflow', '自托管的大模型对话界面，可接 Ollama 与各家 API', 'Self-hosted chat interface for large models; works with Ollama and vendor APIs', 'https://github.com/open-webui/open-webui'],
  ['claude-mem', 'context-memory', '自动记录 AI Agent 在会话里做过的事并压缩成摘要，在以后的会话里把相关内容带回来', 'Automatically captures what your AI agent does in a session, compresses it into summaries and brings the relevant context back in later sessions', 'https://github.com/thedotmack/claude-mem'],
  ['opencode-dynamic-context-pruning', 'context-memory', 'OpenCode 的插件，自动清理和压缩对话上下文来减少 token 用量', 'OpenCode plugin that automatically prunes and compresses conversation context to cut token usage', 'https://github.com/Opencode-DCP/opencode-dynamic-context-pruning'],
  ['ragflow', 'web-search', '基于深度文档理解的开源 RAG 引擎', 'Open-source RAG engine built on deep document understanding', 'https://github.com/infiniflow/ragflow/blob/main/README_zh.md?plain=1#-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B'],
  ['word-formatter-pro', 'documents', '把格式混乱的 Word 文档自动排成符合规范的版式的桌面应用', 'Desktop app that automatically reformats messy Word documents into a standards-compliant layout', 'https://github.com/cwyalpha/Word-Formatter-Pro'],
  ['stirling-pdf', 'documents', '开源的 PDF 编辑平台，可以当桌面应用用、在浏览器里用或部署到自己的服务器，对 PDF 做编辑、签名、遮盖和转换', 'Open-source PDF editing platform that runs as a desktop app, in the browser or on your own server, for editing, signing, redacting and converting PDFs', 'https://github.com/Stirling-Tools/Stirling-PDF'],
  ['mineru', 'documents', '把 PDF、Office 文档等复杂文件转成适合大模型读的 Markdown 或 JSON', 'Converts complex documents such as PDFs and Office files into LLM-ready Markdown or JSON', 'https://github.com/opendatalab/MinerU'],
  ['pdf-inspector', 'documents', '检查、分类 PDF 并提取文本的 Rust 库，能分辨扫描版和文本版，也有 Python 包和命令行', 'Rust library for inspecting, classifying and extracting text from PDFs that tells scanned from text-based files, also available as a Python package and CLI', 'https://github.com/firecrawl/pdf-inspector'],
].map(([name, purpose, zh, en, url]) => ({ name, description: { zh, en }, url, purpose }));

// MCP 同样是为预览编的样例：两种连接方式都有，其中一条只支持 Codex
const SHOWCASE_MCPS = [
  { name: 'chrome-devtools', zh: '让 AI Agent 操控并调试真实的 Chrome 浏览器', en: 'Let your AI Agent drive and debug a real Chrome browser', server: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] } },
  { name: 'context7', zh: '按需拉取各种库的最新文档', en: 'Pull up-to-date documentation for libraries on demand', server: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  { name: 'linear', zh: '读写 Linear 的 issue 与项目，登录交给 AI Agent 自己的流程', en: 'Read and write Linear issues and projects; signing in is left to the AI Agent', server: { url: 'https://mcp.linear.app/mcp' } },
  { name: 'openai-docs', zh: '查询 OpenAI 开发者文档', en: 'Search the OpenAI developer docs', hosts: ['codex'], server: { url: 'https://developers.openai.com/mcp' } },
].map(({ zh, en, ...mcp }) => ({ ...mcp, description: { zh, en }, url: `https://example.com/${mcp.name}`, purpose: 'web-search' }));

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
].map(({ zh, en, ...tool }) => ({ ...tool, description: { zh, en }, url: `https://example.com/${tool.name}`, purpose: 'dev-workflow' }));
// 名字和命令都长的工具：命令在汇总里折行
const LONG_COMMAND_TOOL = {
  name: 'rustup-toolchain-installer',
  description: { zh: 'Rust 工具链的安装与版本管理器', en: 'Installer and version manager for the Rust toolchain' },
  url: 'https://example.com/rustup',
  purpose: 'dev-workflow',
  install: { default: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal --no-modify-path" },
  check: { path: '.cargo/bin/rustup' },
};

const sample = catalogOf({ version: 1, skills: SHOWCASE_SKILLS });
// 条目多到 24 行的终端里一屏放不下：在那八条之外再编十二条
const MANY_SKILLS = [
  ...SHOWCASE_SKILLS,
  ...[
    ['changelog', '从提交记录整理出面向用户的更新日志', 'Turn commit history into a user-facing changelog'],
    ['code-tour', '给陌生的代码库画一条按顺序读的路线', 'Lay out a reading route through an unfamiliar codebase'],
    ['commit-message', '按约定式提交的格式写提交说明', 'Write commit messages in the Conventional Commits format'],
    ['data-story', '把一张数据表讲成有结论的短文，配合适的图表', 'Turn a data table into a short piece with a conclusion and fitting charts'],
    ['meeting-notes', '把会议录音的转写稿整理成决定、待办与未决问题', 'Organize a meeting transcript into decisions, action items and open questions'],
    ['postmortem', '按时间线、原因、改进项写事故复盘', 'Write an incident postmortem: timeline, causes, follow-ups'],
    ['readme', '给项目写一份先讲用途、再讲上手的 README', 'Write a README that states the purpose first, then how to get started'],
    ['regex', '把一句话的匹配需求写成正则，并逐段解释', 'Turn a one-line matching need into a regex, explained piece by piece'],
    ['release-notes', '汇总一个版本的变化，按受影响的人分组', 'Summarize what changed in a release, grouped by who is affected'],
    ['sql-review', '审查 SQL 的正确性、索引使用与锁的范围', 'Review SQL for correctness, index use and lock scope'],
    ['test-plan', '给一项改动列出该测什么、不测什么和原因', 'List what to test for a change, what to leave out, and why'],
    ['translate', '在中英之间翻译技术文档，术语前后一致', 'Translate technical documents between Chinese and English with consistent terms'],
  ].map(([name, zh, en]) => ({ name, version: '1.0.0', path: `skills/${name}`, description: { zh, en } })),
];
const manySkills = catalogOf({ version: 1, skills: MANY_SKILLS });
const withTools = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, tools: SHOWCASE_TOOLS });
const withLongCommandTool = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, tools: [LONG_COMMAND_TOOL, ...SHOWCASE_TOOLS] });
const withMcps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: SHOWCASE_MCPS });
// 名字长的 MCP：汇总里它的备注一行放不下
const LONG_NAME_MCP = {
  name: 'modelcontextprotocol-server-sequential-thinking',
  description: { zh: '把复杂问题拆成一步步的思考过程', en: 'Break a complex problem down into a step-by-step thinking process' },
  url: 'https://example.com/sequential-thinking',
  purpose: 'web-search',
  server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
};
const withLongNameMcp = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: [...SHOWCASE_MCPS, LONG_NAME_MCP] });
// 带 key 的 MCP：context7 的 key 可选，exa 的必填（它的说明写得长，一行放不下）
const keyed = (name: string, required: boolean, zh: string, en: string, url: string) => [{ name, required, description: { zh, en }, url }];
const SHOWCASE_KEYED_MCPS = [
  SHOWCASE_MCPS[0],
  { ...SHOWCASE_MCPS[1], env: keyed('CONTEXT7_API_KEY', false, '提高请求限额，没有也能用', 'Raises the rate limit; works without it', 'https://context7.com/dashboard') },
  {
    name: 'exa',
    description: { zh: '面向 AI 的网页搜索与正文抓取，需要 API key', en: 'Web search and page content retrieval built for AI; needs an API key' },
    url: 'https://example.com/exa',
    purpose: 'web-search',
    server: { command: 'npx', args: ['-y', 'exa-mcp-server'] },
    env: keyed('EXA_API_KEY', true, 'Exa 搜索 API 的密钥；注册后有免费额度，在控制台的 API Keys 页创建', 'Key for the Exa search API; sign-up includes a free quota, and keys are created on the API Keys page of the dashboard', 'https://dashboard.exa.ai/api-keys'),
  },
  ...SHOWCASE_MCPS.slice(2),
];
const withKeyedMcps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, mcps: SHOWCASE_KEYED_MCPS });
const withApps = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...EMPTY_CATALOG, purposes: SHOWCASE_PURPOSES, apps: SHOWCASE_APPS });
// 目录里没有本仓库的 skill，也没有带推荐标记的条目：主菜单上没有「推荐」
const withoutRecommended = catalogOf({ version: 1, skills: [] }, { ...EMPTY_CATALOG, purposes: SHOWCASE_PURPOSES, apps: SHOWCASE_APPS });
// 混合列表的样例：三个 skill 另外归在「文档处理」下、一个归在「UI 设计、图像与视频」下，mineru 带推荐标记
const MIXED_CATALOG = {
  ...EMPTY_CATALOG,
  purposes: SHOWCASE_PURPOSES,
  apps: SHOWCASE_APPS.map((app) => (app.name === 'mineru' ? { ...app, recommended: true } : app)),
  skillPurposes: { archify: 'documents', explanation: 'documents', pr: 'documents', onetake: 'design-media' },
};
const withMixed = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, MIXED_CATALOG);
// 三种类型同表的样例：在 withMixed 之上，「文档处理」下多三个 MCP——一个带推荐标记，一个只支持 Claude Code，一个的 key 必填
const DOCUMENT_MCPS = [
  { name: 'excel', zh: '创建、读取和修改 Excel 工作簿（需要 uv）', en: 'Create, read and edit Excel workbooks (needs uv)', hosts: ['claude-code'], server: { command: 'uvx', args: ['excel-mcp-server', 'stdio'] } },
  { name: 'markitdown', zh: '把 PDF、Office 文档、图片等转成 Markdown 交给 AI（需要 uv）', en: 'Convert PDFs, Office files and images to Markdown for the AI (needs uv)', recommended: true, server: { command: 'uvx', args: ['markitdown-mcp'] } },
  {
    name: 'mistral-ocr',
    zh: '识别扫描件和图片里的文字，保留表格与版面，需要 API key',
    en: 'OCR for scans and images that keeps tables and layout; needs an API key',
    server: { command: 'npx', args: ['-y', 'mistral-ocr-mcp'] },
    env: keyed('MISTRAL_API_KEY', true, 'Mistral 的 API 密钥，在控制台的 API Keys 页创建', 'Mistral API key, created on the API Keys page of the console', 'https://console.mistral.ai/api-keys'),
  },
].map(({ zh, en, ...mcp }) => ({ ...mcp, description: { zh, en }, url: `https://example.com/${mcp.name}`, purpose: 'documents' }));
const withThreeKinds = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...MIXED_CATALOG, mcps: DOCUMENT_MCPS });
// 四种类型同表的样例：再往「文档处理」下加三个工具——一个带推荐标记，一个只支持 Linux，一个场景里已经装着。
// 第一条的命令里有引号：工具的命令原样写出
const DOCUMENT_TOOLS = [
  { name: 'docling', zh: '把 PDF、Office 文档解析成结构化的 Markdown 或 JSON，在本机运行', en: 'Parse PDFs and Office files into structured Markdown or JSON, running locally', recommended: true, install: { default: "pip install 'docling[ocr]'" }, check: { command: 'docling' } },
  { name: 'officecli', zh: '在命令行里读写 Word、Excel、PPT 文件', en: 'Read and write Word, Excel and PowerPoint files from the command line', install: { default: 'npm install -g officecli', macos: null, windows: null }, check: { command: 'officecli' } },
  { name: 'pandoc', zh: '在 Markdown、Word、HTML、PDF 等几十种文档格式之间互相转换', en: 'Convert between dozens of document formats such as Markdown, Word, HTML and PDF', install: { default: 'brew install pandoc' }, check: { command: 'pandoc' } },
].map(({ zh, en, ...tool }) => ({ ...tool, description: { zh, en }, url: `https://example.com/${tool.name}`, purpose: 'documents' }));
const withFourKinds = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, { ...MIXED_CATALOG, mcps: DOCUMENT_MCPS, tools: DOCUMENT_TOOLS });
// 再加上第三方 Skill 一段：三条都在「文档处理」下，一条含三个 skill。名字和来源取自待录入的清单，说明是为预览写的
const DOCUMENT_THIRD_PARTY = [
  { name: 'drawio-skill', source: 'Agents365-ai/drawio-skill', zh: '用 draw.io 画流程图和架构图并导出图片（需要 Python 3）', en: 'Draw flowcharts and architecture diagrams with draw.io and export them as images (needs Python 3)' },
  { name: 'guizang-ppt-skill', source: 'op7418/guizang-ppt-skill', zh: '生成杂志风格的网页版 PPT（校验脚本需要 Node.js）', en: 'Generate magazine-style web slide decks (the validation script needs Node.js)' },
  {
    name: 'paper-craft-skills',
    source: 'zsyggg/paper-craft-skills',
    zh: '读论文并做成深度解读、漫画或幻灯片（3 个 skill，其中两个要 AI Agent 能生成图片）',
    en: 'Read papers and turn them into write-ups, comics or slides (3 skills; two need an AI Agent that can generate images)',
    skills: [
      { name: 'paper-analyzer', description: { zh: '把一篇论文读成深度解读文章（需要 Python）', en: 'Turn a paper into an in-depth write-up (needs Python)' } },
      { name: 'paper-comic', description: { zh: '把论文的要点画成一组漫画（要 AI Agent 能生成图片）', en: 'Draw the key points of a paper as a comic (needs an AI Agent that can generate images)' } },
      { name: 'paper-deck', description: { zh: '把论文做成一套幻灯片（要 AI Agent 能生成图片）', en: 'Turn a paper into a slide deck (needs an AI Agent that can generate images)' } },
    ],
  },
].map(({ zh, en, skills, ...entry }) => ({
  ...entry,
  description: { zh, en },
  url: `https://github.com/${entry.source}`,
  purpose: 'documents',
  // 只含一个 skill 的：那个 skill 和条目同名
  skills: skills ?? [{ name: entry.name, description: { zh, en } }],
}));
const withFiveKinds = catalogOf(
  { version: 1, skills: SHOWCASE_SKILLS },
  { ...MIXED_CATALOG, thirdPartySkills: DOCUMENT_THIRD_PARTY, mcps: DOCUMENT_MCPS, tools: DOCUMENT_TOOLS },
);
// guizang-ppt-skill 写了宿主限制，只支持 Claude Code
const withHostLimitedThirdParty = catalogOf(
  { version: 1, skills: SHOWCASE_SKILLS },
  {
    ...MIXED_CATALOG,
    thirdPartySkills: DOCUMENT_THIRD_PARTY.map((entry) => (entry.name === 'guizang-ppt-skill' ? { ...entry, hosts: ['claude-code'] } : entry)),
    mcps: DOCUMENT_MCPS,
    tools: DOCUMENT_TOOLS,
  },
);
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
// docling 的安装命令说的话；装好了
const DOCLING_OUTPUT = ['Collecting docling[ocr]', '  Downloading docling-2.55.1-py3-none-any.whl (281 kB)', 'Installing collected packages: docling', 'Successfully installed docling-2.55.1', ''].join('\n');
const installsDocling = (): ShellRun => ({ output: DOCLING_OUTPUT, installs: 'docling' });
// 打了一半，还没结束
const doclingStillRunning = (): ShellRun => ({ output: DOCLING_OUTPUT.split('\n').slice(0, 2).join('\n') + '\n', hangs: true });

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
// 主菜单的第一行是「推荐」：里面是本仓库的全部 skill
const toRecommended = [KEY.enter];
// 勾上 pr 和 wizard，光标停在 wizard 上
const pickTwo = [...toRecommended, ...down(5), KEY.space, KEY.down, KEY.space];
const toSummary = [...pickTwo, KEY.enter];
const install = [...toSummary, KEY.enter];
// 检测到两个宿主时，进了「推荐」先问装进哪些宿主：两项默认勾选，直接确认
const twoHosts = (keys: string[]): string[] => [KEY.enter, ...keys];
// 勾上 explanation、pr 和 wizard：在 MIXED 里分别是版本不同、不是本工具装的、未装
const pickThree = [...toRecommended, KEY.down, KEY.space, ...down(4), KEY.space, KEY.down, KEY.space];
const toMixedSummary = [...pickThree, KEY.enter];
// 选了「开始安装」，停在确认覆盖的提问上
const toOverwriteQuestion = [...toMixedSummary, KEY.enter];
const declineOverwrite = [...toOverwriteQuestion, KEY.enter];
const agreeOverwrite = [...toOverwriteQuestion, 'y', KEY.enter];
const pickLongName = [...toRecommended, ...down(4), KEY.space, KEY.enter];
// 勾上 if5 和 pr：名字都短，备注放得下
const pickShortNames = [...toRecommended, ...down(2), KEY.space, ...down(3), KEY.space, KEY.enter];
// withApps 的主菜单上依次是「推荐」和四个有条目的用途；光标起始在「推荐」上。「文档处理」是第四个用途
const toDocuments = [...down(4), KEY.enter];
// 「文档处理」里按名字排是 mineru、pdf-inspector、stirling-pdf、word-formatter-pro：勾上第一个和第三个，光标停在第三个上
const pickTwoApps = [...toDocuments, KEY.space, ...down(2), KEY.space];
// 只勾 stirling-pdf：它的说明比一行长
const pickOneApp = [...toDocuments, ...down(2), KEY.space];
// 「上下文、记忆与 Token 优化」是第二个用途：里面有名字最长的那一条
const toContextMemory = [...down(2), KEY.enter];
// 「联网搜索与文档检索」是第三个用途，只有 ragflow 一条：它的链接比一行长
const pickLongLink = [...down(3), KEY.enter, KEY.space, KEY.enter];
// withMixed 的主菜单上多一个「UI 设计、图像与视频」，「文档处理」是第五个用途；检测到两个宿主时进去先问装进哪些，直接确认
const toMixedDocuments = (asksHosts = false): string[] => [...down(5), KEY.enter, ...(asksHosts ? [KEY.enter] : [])];
// 「文档处理」里上面是 archify、explanation、pr 三个 skill，下面是四个外部项目：
// 勾上 explanation、pr、mineru 和 stirling-pdf，光标停在 stirling-pdf 上
const pickMixed = [KEY.down, KEY.space, KEY.down, KEY.space, KEY.down, KEY.space, ...down(2), KEY.space];
// 确认列表、开始安装；pr 在 Claude Code 下不是本工具装的，另问时直接回车（不覆盖）
const installMixed = [...pickMixed, KEY.enter, KEY.enter, KEY.enter];

// withThreeKinds 的「文档处理」里依次是 archify、explanation、pr 三个 skill，markitdown、excel、mistral-ocr 三个 MCP，再是四个外部项目：
// 勾上 explanation、markitdown 和 mistral-ocr，光标停在 mistral-ocr 上
const pickSkillAndMcps = [KEY.down, KEY.space, ...down(2), KEY.space, ...down(2), KEY.space];
// 再勾上 mineru，光标停在它上面
const pickThreeKinds = [...pickSkillAndMcps, KEY.down, KEY.space];
// 确认之后填好 mistral-ocr 的 key，停在汇总确认上；再回车就开始安装
const toThreeKindsSummary = [...pickThreeKinds, KEY.enter, PASTED_KEY, KEY.enter];
// 样例的 MCP 都在「联网搜索与文档检索」下，主菜单上它紧跟在「推荐」后面：下移一行再进去
const toMcps = [KEY.down, KEY.enter];
// 勾上 chrome-devtools、context7 和 linear，光标停在 linear 上
const pickMcps = [...toMcps, KEY.space, KEY.down, KEY.space, KEY.down, KEY.space];
const runMcps = [...pickMcps, KEY.enter, KEY.enter];
// 只勾 context7：一个 MCP 装进两个宿主
const pickOneMcp = [...toMcps, KEY.down, KEY.space, KEY.enter];
// 检测到两个宿主时，进了用途先问装进哪些宿主：两项默认勾选，直接确认
const mcpTwoHosts = (keys: string[]): string[] => [...toMcps, KEY.enter, ...keys.slice(toMcps.length)];
// 带 key 的样例里 exa 是第三条：只勾它再确认，停在问 key 的提问上
const toExaKey = [...toMcps, ...down(2), KEY.space, KEY.enter];
// 勾上 context7（key 可选）和 exa（key 必填），停在第一个 key 的提问上
const toTwoKeys = [...toMcps, KEY.down, KEY.space, KEY.down, KEY.space, KEY.enter];
// 填好 exa 的 key，停在汇总确认上
const toKeyedSummary = [...toExaKey, PASTED_KEY, KEY.enter];
// 勾上 chrome-devtools 和 exa，exa 的 key 留空
const skipExa = [...toMcps, KEY.space, ...down(2), KEY.space, KEY.enter, KEY.enter];
// 样例的工具都在「开发工作流与规范」下，主菜单上它紧跟在「推荐」后面：下移一行再进去。
// 里面只有工具一段，按名字排是 bubblewrap、bun、codex-usage、openspec、uv；光标起始在 bubblewrap 上
const toTools = [KEY.down, KEY.enter];
// 勾上 openspec 和 uv，光标停在 uv 上
const pickTools = [...toTools, ...down(3), KEY.space, KEY.down, KEY.space];
const runTools = [...pickTools, KEY.enter, KEY.enter];
// 只勾 uv
const pickUv = [...toTools, ...down(4), KEY.space];
// 勾上 bun 和 uv 再执行
const runUvAndBun = [...toTools, KEY.down, KEY.space, ...down(3), KEY.space, KEY.enter, KEY.enter];
// 只勾 bun 再执行
const runBun = [...toTools, KEY.down, KEY.space, KEY.enter, KEY.enter];
// withFourKinds 的「文档处理」里依次是 archify、explanation、pr 三个 skill，markitdown、excel、mistral-ocr 三个 MCP，
// docling、officecli、pandoc 三个工具，再是四个外部项目：勾上 explanation、markitdown、docling 和 mineru，光标停在 mineru 上
const pickFourKinds = [KEY.down, KEY.space, ...down(2), KEY.space, ...down(3), KEY.space, ...down(3), KEY.space];
// 这四个都不要 key：确认列表就到汇总，再回车开始安装
const toFourKindsSummary = [...pickFourKinds, KEY.enter];
const TOOLS = { catalog: withTools, home: BUN_INSTALLED };
const KEYED = { catalog: withKeyedMcps };
const MCP_STATES = { catalog: withMcps, home: CLAUDE_CONFIGURED };
const MCP_TWO_HOSTS = { catalog: withMcps, onPath: BOTH_HOSTS, home: { ...CLAUDE_CONFIGURED, ...CODEX_UNREADABLE } };
// 三种类型同表：skill 的四种状态照 MIXED，Claude Code 里 excel 已经配置过
const THREE_KINDS: Pick<Scene, 'catalog' | 'home' | 'links'> = {
  catalog: withThreeKinds,
  ...MIXED,
  home: { ...MIXED.home, '.claude.json': JSON.stringify({ mcpServers: { excel: { command: 'uvx' } } }) },
};
// 四种类型同表：主目录照 THREE_KINDS；检测到两个宿主，可执行路径上已经有 pandoc；docling 的安装命令缺省装得上
const FOUR_KINDS: Pick<Scene, 'catalog' | 'home' | 'links' | 'onPath' | 'shell'> = {
  ...THREE_KINDS,
  catalog: withFourKinds,
  onPath: [...BOTH_HOSTS, 'pandoc'],
  shell: installsDocling,
};
// 加上第三方 Skill 一段：主目录照 FOUR_KINDS，另外 drawio-skill 两个宿主下都装过，paper-analyzer 只在 Claude Code 下装过
const FIVE_KINDS: Pick<Scene, 'catalog' | 'home' | 'links' | 'onPath' | 'shell'> = {
  ...FOUR_KINDS,
  catalog: withFiveKinds,
  home: {
    ...FOUR_KINDS.home,
    [`${CLAUDE_SKILLS}/drawio-skill/SKILL.md`]: '# drawio-skill\n',
    [`${CODEX_SKILLS}/drawio-skill/SKILL.md`]: '# drawio-skill\n',
    [`${CLAUDE_SKILLS}/paper-analyzer/SKILL.md`]: '# paper-analyzer\n',
  },
};
// withFiveKinds 的「文档处理」里依次是 archify、explanation、pr 三个 skill，drawio-skill、guizang-ppt-skill、paper-craft-skills
// 三条第三方 Skill，markitdown、excel、mistral-ocr 三个 MCP，docling、officecli、pandoc 三个工具，再是四个外部项目：
// 勾上 guizang-ppt-skill、paper-craft-skills、markitdown 和 docling，光标停在 docling 上
const pickWithThirdParty = [...down(4), KEY.space, KEY.down, KEY.space, KEY.down, KEY.space, ...down(3), KEY.space];
// 确认列表就是 paper-craft-skills 的清单（只有它含多个 skill）：勾上 paper-analyzer 和 paper-comic，光标停在 paper-comic 上
const toChecklist = [...pickWithThirdParty, KEY.enter];
const pickFromChecklist = [...toChecklist, KEY.space, KEY.down, KEY.space];
// 这几个都不要 key：确认清单就到汇总
const toThirdPartySummary = [...pickFromChecklist, KEY.enter];
// 开始安装；paper-analyzer 在 Claude Code 下已有同名目录，另问时直接回车（不覆盖）
const installThirdParty = [...toThirdPartySummary, KEY.enter, KEY.enter];
// 装到项目：两个宿主都选之后停在安装范围的提问上（场景要给 answersScope）；下移到「项目」再回车就进了列表
const toScope = toMixedDocuments(true);
const intoProject = [...toScope, KEY.down, KEY.enter];
// 项目里 explanation 是本工具装的旧版，pr 是手动放的，paper-analyzer 在 Claude Code 下已有同名目录，.mcp.json 里配过
// markitdown；全局照 FIVE_KINDS（那里配过的是 excel）
const PROJECT: Pick<Scene, 'project' | 'answersScope'> = {
  answersScope: true,
  project: {
    ...installedSkill(CLAUDE_SKILLS, 'explanation', '0.9.0'),
    [`${CODEX_SKILLS}/pr/SKILL.md`]: '# 自己写的 pr\n',
    [`${CLAUDE_SKILLS}/paper-analyzer/SKILL.md`]: '# paper-analyzer\n',
    '.mcp.json': JSON.stringify({ mcpServers: { markitdown: { type: 'stdio', command: 'uvx', args: ['markitdown-mcp'] } } }),
  },
};
// 勾上 explanation、guizang-ppt-skill、paper-craft-skills 和 docling，光标停在 docling 上；这一轮不勾 MCP
const pickIntoProject = [...intoProject, KEY.down, KEY.space, ...down(3), KEY.space, KEY.down, KEY.space, ...down(4), KEY.space];
// 确认列表，在清单里勾上 paper-analyzer 和 paper-comic，再确认就到汇总
const toProjectSummary = [...pickIntoProject, KEY.enter, KEY.space, KEY.down, KEY.space, KEY.enter];
// 装到项目的 MCP：勾上 markitdown（项目里已配置）和 mistral-ocr（key 必填），填好 key，停在汇总确认上
const toProjectMcpSummary = [...intoProject, ...down(6), KEY.space, ...down(2), KEY.space, KEY.enter, PASTED_KEY, KEY.enter];
// 进「文档处理」后在宿主选择上去掉 Claude Code 的勾，只留 Codex，再选「项目」进列表，光标移到第一个 MCP 上
const intoProjectCodexOnly = [...down(5), KEY.enter, KEY.space, KEY.enter, KEY.down, KEY.enter, ...down(6)];
// guizang-ppt-skill 装进 Claude Code 的那条命令以 1 退出
const GUIZANG_FAILS = { thirdPartyFails: ['guizang-ppt-skill@claude-code'] };

const scenes: Scene[] = [
  { title: '启动与加载', note: 'npx oxy-tools · 最先打出 OXY 大标志；读取目录时行首的符号转动', catalog: neverLoads },
  { title: '标题区 · 渐变', note: 'COLORTERM=truecolor：标志从左到右由粉到紫到蓝，同一列的方块同色', env: TRUECOLOR },
  { title: '标题区 · 洋红（没有 COLORTERM）', note: '终端没有声明支持 24 位色：整个标志是终端自己的洋红，和焦点符号同色' },
  { title: '标题区 · 不显示颜色', note: '设置了 NO_COLOR：哪怕同时有 COLORTERM=truecolor，标志也不上色', env: { ...TRUECOLOR, NO_COLOR: '1' } },
  { title: '语言提问 · 系统语言是中文', note: '大标志之后的第一问：光标停在「中文」上，按键提示是中文；提问和两个选项不随界面语言变', answersLanguage: true },
  { title: '语言提问 · 系统语言不是中文', note: 'LANG=en_US.UTF-8：光标停在 English 上，按键提示是英文', env: { LANG: 'en_US.UTF-8' }, answersLanguage: true },
  { title: '语言提问 · 选了与系统语言不同的一项', note: '下移到 English 再回车：收成一行，之后的画面都是选定的语言', answersLanguage: true, keys: [KEY.down, KEY.enter] },
  { title: '主菜单', note: '语言提问收成一行，留在本机信息上方。只检测到 Claude Code：说明 Codex 被跳过；catalog.json 三个数组为空，只有「推荐」和退出' },
  { title: '主菜单 · 有条目被跳过', note: '目录里有一条写坏的条目', catalog: withBrokenEntry },
  { title: 'skill 多选列表', note: '空格勾选；说明过长则截断，光标所在行的全文在列表下方', keys: pickTwo },
  {
    title: 'skill 多选列表 · 24 行的终端',
    note: '二十个条目一屏放不下，由交互库滚动；画面是屏幕上的那 24 行：提问那一行还在，说明全文和按键提示都在。光标过了半屏，表头随列表滚上去了，提问下方的空行还在',
    catalog: manySkills,
    rows: 24,
    keys: [...toRecommended, ...down(10)],
  },
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
  { title: '选择宿主 · 检测到两个', note: '进「推荐」后先问装进哪些宿主：两项都默认勾选，名字后面不写目录', onPath: BOTH_HOSTS, keys: toRecommended },
  { title: '选择宿主 · 去掉一个', note: '空格去掉 Claude Code 的勾，光标移到 Codex', onPath: BOTH_HOSTS, keys: [...toRecommended, KEY.space, KEY.down] },
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
  { title: '主菜单 · 一个宿主都没有', note: '上方说明原因；「推荐」照常进得去', onPath: [] },
  { title: '「推荐」的列表 · 一个宿主都没有', note: '不问装进哪些宿主。状态只有一栏，每个 skill 都不可选：勾选位是短横，原因写在状态的位置，其余暗淡', onPath: [], keys: toRecommended },
  { title: '「推荐」的列表 · 一个宿主都没有 · 在不可选的条目上按空格', note: '勾不上：列表下方多一行说明', onPath: [], keys: [...toRecommended, KEY.space] },
  { title: '返回主菜单', note: '已回答的提问收成一行；大标志不重复', keys: [...toRecommended, KEY.enter] },
  { title: '主菜单 · 按用途进入', note: '第一行是「推荐」，下面各个用途一行一个，照用途清单的顺序，右边是条目数；十个用途里六个没有条目，不出现。没有 Skill 这个分组；「目录」一行数上外部项目', catalog: withApps },
  { title: '主菜单 · 按用途进入 · 一个宿主都没有', note: '说明里补一句外部项目仍可浏览；「推荐」和用途照常进得去', catalog: withApps, onPath: [] },
  { title: '主菜单 · 没有「推荐」', note: '目录里没有本仓库的 skill，也没有带推荐标记的条目：「推荐」那一行不出现，光标起始在第一个用途上', catalog: withoutRecommended },
  { title: '主菜单 · 有「推荐」 · skill 另有用途', note: '「推荐」数的是本仓库的全部 skill 加一个带推荐标记的外部项目；写了用途的 skill 也数进那个用途', catalog: withMixed, onPath: BOTH_HOSTS },
  { title: '「推荐」的列表 · 带推荐标记的外部项目也在', note: '上面是本仓库的全部 skill，下面是带推荐标记的外部项目；这里每一行都是推荐的，行上和「类型」里都不再写', catalog: withMixed, ...MIXED, keys: [...toRecommended, ...down(8)] },
  { title: '混合列表 · skill 加外部项目 · 两个宿主', note: '组件在上、外部项目在下，段首写着类型，两段之间空一行；skill 每个宿主一栏状态，带推荐的行说明前面写「推荐」；列表下方先是光标所在行的类型', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: toMixedDocuments(true) },
  { title: '混合列表 · 勾了两个 skill 和两个外部项目', note: '光标在外部项目上：「类型」跟着变；没带推荐标记的行不写「推荐」', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed] },
  { title: '混合列表 · 光标在带推荐标记的外部项目上', note: '「类型」一行里类型后面跟着「推荐」', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...down(3)] },
  { title: '混合列表 · 一个宿主', note: '只是少一栏状态；不问装进哪些宿主', catalog: withMixed, ...MIXED, keys: [...toMixedDocuments(), ...pickMixed] },
  { title: '混合列表 · 一个宿主都没有', note: '状态只有一栏，skill 都不可选并写明原因；外部项目照常可选', catalog: withMixed, onPath: [], keys: [...toMixedDocuments(), ...down(3), KEY.space] },
  { title: '混合列表 · 只有 skill 的用途', note: '「UI 设计、图像与视频」下只有一个 skill：没有外部项目一段', catalog: withMixed, keys: [...down(4), KEY.enter] },
  { title: '汇总确认 · 一次勾了 skill 和外部项目', note: '汇总只列要装的 skill，外部项目不在里面；列表收成的一行写着勾选的四个里的前三个', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed, KEY.enter] },
  { title: '汇总确认 · 混合列表 · 返回修改', note: '回到列表，skill 和外部项目的勾选都还在；不重问宿主', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed, KEY.enter, KEY.down, KEY.enter] },
  { title: '结果 · 一次勾了 skill 和外部项目', note: '覆盖前的单独询问、安装、结果照常；合计之后才是外部项目的说明与链接，再回到主菜单', catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...installMixed] },
  { title: '混合列表 · skill 加 MCP · 两个宿主', note: '先是 Skill 一段，再是 MCP 一段，最下面是外部项目；两种类型的状态都落在各自宿主的那一栏里。excel 只支持 Claude Code：Codex 那一栏写「不支持」，仍可选', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...down(4)] },
  { title: '混合列表 · 勾了 skill 和 MCP', note: 'MCP 一段里带推荐的在前；光标在 MCP 上时「类型」写 MCP', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...pickSkillAndMcps] },
  { title: '混合列表 · skill 加 MCP · 一个宿主', note: '只是少一栏状态。excel 在 Claude Code 里已配置', ...THREE_KINDS, keys: [...toMixedDocuments(), ...down(3)] },
  { title: '混合列表 · skill 加 MCP · 只选了不支持它的宿主', note: '去掉 Claude Code 的勾：excel 一个所选的宿主都不支持，不可选，原因写在状态的位置、占满状态栏', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...down(5), KEY.enter, KEY.space, KEY.enter, ...down(4)] },
  { title: '混合列表 · skill 加 MCP · 一个宿主都没有', note: '状态只有一栏，skill 和 MCP 都不可选并写明原因；外部项目照常可选', catalog: withThreeKinds, onPath: [], keys: [...toMixedDocuments(), ...down(3)] },
  { title: '填写 key · 混合列表之后', note: '列表确认之后、汇总之前，逐个问勾上的 MCP 要的 key', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...pickThreeKinds, KEY.enter] },
  { title: '汇总确认 · skill 加带 key 的 MCP', note: '一个分区，按类型分成小表，各张表的栏对齐；将执行的命令只有 MCP 的，key 的位置是占位符；提醒几行挨着。外部项目不在汇总里', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary] },
  { title: '汇总确认 · skill 加 MCP · 返回修改', note: '回到列表，三种类型的勾选都还在；再确认时填过的 key 不再问', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.down, KEY.enter, KEY.enter] },
  { title: '正在安装 · skill 之后是 MCP', note: 'skill 已经装完，第一个 MCP 进行中：写的是「正在配置」', onPath: BOTH_HOSTS, ...THREE_KINDS, commands: () => new Promise<never>(() => {}), keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '结果 · 一次勾了 skill、MCP 和外部项目', note: '先是 skill 的各行，再是 MCP 的；合计之后才是外部项目的说明与链接。结果里没有 key 的值', onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '结果 · skill 加 MCP · 一条命令失败', note: 'Codex 那边的添加命令非零退出：只有装进 Codex 的那两行失败，其余照常', onPath: BOTH_HOSTS, ...THREE_KINDS, commands: async (command) => (command === 'codex' ? { exitCode: 1 } : ok), keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '用途下的列表 · 只有外部项目', note: '多选。表头下面是段标题，写明只给链接；外部项目没有状态，说明紧跟在名称后面；列表下方是光标所在行的类型和说明全文', catalog: withApps, keys: toDocuments },
  { title: '用途下的列表 · 勾了两个', note: '光标所在行的说明比一行长：下方折成两行，续行与说明的左缘对齐', catalog: withApps, keys: pickTwoApps },
  { title: '用途下的列表 · 名字最长的条目', note: '名称一栏按最长的名字定宽，说明相应少占几列', catalog: withApps, keys: toContextMemory },
  { title: '用途下的列表 · 一个宿主都没有', note: '外部项目不靠宿主，照常可选', catalog: withApps, onPath: [], keys: pickTwoApps },
  { title: '用途下的列表 · 一个都不勾就返回', note: '收成的一行写「返回」，回到主菜单', catalog: withApps, keys: [...toDocuments, KEY.enter] },
  { title: '外部项目的说明与链接 · 勾了两个', note: '只勾了外部项目：没有汇总，不问开始不开始。每个一段：名字、说明全文、带下划线的完整链接；不打开浏览器。之后回到主菜单', catalog: withApps, keys: [...pickTwoApps, KEY.enter] },
  { title: '外部项目的说明与链接 · 一个', note: '说明比一行长时折行', catalog: withApps, keys: [...pickOneApp, KEY.enter] },
  { title: '外部项目的说明与链接 · 链接比一行长', note: '链接不截断也不折开，由终端自己折行', catalog: withApps, keys: pickLongLink },
  { title: '主菜单 · 有 MCP', note: '没有「MCP」这个分组：MCP 数在它的用途里，「目录」一行照旧按类型数', catalog: withMcps },
  { title: '混合列表 · 只有 MCP 的用途', note: 'MCP 自成一段。状态来自 Claude Code 的用户级配置：已配置、未配置；这个宿主不支持的条目不可选，原因写在状态的位置', ...MCP_STATES, keys: pickMcps },
  { title: '混合列表 · 在不可选的 MCP 上按空格', note: '光标能移上去，但勾不上：列表下方多一行说明，它的类型和说明照样在', ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '选择安装范围 · 提问中，光标在全局', note: '选完宿主之后问；两项各带一句说明，「项目」后面暗淡地写出当前目录，只是告知。光标起始在全局，按一下回车就过', ...FIVE_KINDS, ...PROJECT, keys: toScope },
  { title: '选择安装范围 · 只检测到一个宿主', note: '不问宿主，直接问装到哪里', ...FIVE_KINDS, onPath: ['claude', 'pandoc'], ...PROJECT, keys: toMixedDocuments() },
  { title: '选择安装范围 · 已回答，收成一行', note: '下移到「项目」再回车：收成一行，接着是列表', ...FIVE_KINDS, ...PROJECT, keys: intoProject },
  { title: '混合列表 · 装到项目 · 两个宿主', note: 'Skill 和第三方 Skill 的状态看的是项目目录下各宿主的 skill 目录，全局装过的不算；MCP 在 Claude Code 那一栏看的是项目里的 .mcp.json（全局配过的 excel 在这里是未配置），Codex 的 MCP 装不到项目：它那一栏都写不支持，列表上方说明原因；工具不受安装范围影响', ...FIVE_KINDS, ...PROJECT, keys: [...intoProject, ...down(6)] },
  { title: '混合列表 · 装到项目 · 只选了 Codex', note: '去掉 Claude Code 的勾：所选的宿主里没有能把 MCP 装到项目的，MCP 的行不可选。原因写「只能装到全局」——换成全局就装得了；excel 本来就只支持 Claude Code，原因仍是「需要别的 AI Agent」', ...FIVE_KINDS, ...PROJECT, keys: intoProjectCodexOnly },
  { title: '混合列表 · 装到项目 · 只选了 Codex · 在不可选的 MCP 上按空格', note: '勾不上：列表下方多一行说明', ...FIVE_KINDS, ...PROJECT, keys: [...intoProjectCodexOnly, KEY.space] },
  { title: '汇总确认 · 装到项目', note: '位置一栏是相对当前目录的路径，不是主目录下的路径；第三方 Skill 的命令不带 --global。工具照原样', ...FIVE_KINDS, ...PROJECT, keys: toProjectSummary },
  { title: '确认覆盖与结果 · 装到项目', note: '另问的是项目里的那个路径，直接回车就是不覆盖；装完的结果照常', ...FIVE_KINDS, ...PROJECT, keys: [...toProjectSummary, KEY.enter, KEY.enter] },
  { title: '汇总确认 · 装到项目 · 带 key 的 MCP', note: '只装进 Claude Code：命令带它自带的项目范围，汇总和命令里没有 Codex。项目里已配置的先移除再添加。提醒在提问的上方：key 会以明文写进 .mcp.json（写的是变量名和文件名，没有值）；装进去的要在这个目录下启动 claude 批准之后才启用', ...FIVE_KINDS, ...PROJECT, keys: toProjectMcpSummary },
  { title: '结果 · 装到项目的 MCP', note: '每个 MCP 只有 Claude Code 一行；结果里同样没有 key 的值', ...FIVE_KINDS, ...PROJECT, keys: [...toProjectMcpSummary, KEY.enter] },
  { title: '选择宿主 · 只有 MCP 的用途', note: '列表里有组件就问；名字后面不写目录', catalog: withMcps, onPath: BOTH_HOSTS, keys: toMcps },
  { title: '混合列表 · MCP · 配置文件读不了', note: 'Codex 的配置读不出来：列表上方说明，它那一栏都是「未知」，没有报错；只有一个宿主支持的条目仍可选', ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '汇总确认 · 一个 MCP 装进两个宿主', note: '两条完整的命令都列出来，确认后才执行', catalog: withMcps, onPath: BOTH_HOSTS, keys: mcpTwoHosts(pickOneMcp) },
  { title: '汇总确认 · MCP · 覆盖与状态未知', note: '已配置的先移除再添加；状态未知的先尝试移除同名配置。将执行的每一条命令都在下面', ...MCP_TWO_HOSTS, keys: mcpTwoHosts([...pickMcps, KEY.enter]) },
  { title: '汇总确认 · MCP · 只装进支持的宿主', note: 'openai-docs 只支持 Codex：汇总和命令里没有 Claude Code 那一份；远程地址装进 Codex 时，命令下面提醒它可能当场打开浏览器登录', catalog: withMcps, onPath: BOTH_HOSTS, keys: mcpTwoHosts([...toMcps, ...down(3), KEY.space, KEY.enter]) },
  {
    title: '汇总确认 · MCP · 名字长的条目',
    note: '有一条备注放不下，就都另起一行，表头不写备注一栏；命令过长时折行，续行与命令的左缘对齐',
    catalog: withLongNameMcp,
    home: { '.claude.json': JSON.stringify({ mcpServers: { [LONG_NAME_MCP.name]: {}, linear: {} } }) },
    keys: [...toMcps, ...down(2), KEY.space, KEY.down, KEY.space, KEY.enter],
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
  { title: '结果 · 选中的都没填 key', note: '没有要确认的东西：不问开始不开始，直接给出结果，回到主菜单', ...KEYED, keys: [...toExaKey, KEY.enter] },
  { title: '主菜单 · 有工具', note: '没有「工具」这个分组：工具数在它的用途里，「目录」一行照旧按类型数。主菜单上只有「推荐」、各个用途和退出，表头只有用途和数量', ...TOOLS },
  { title: '主菜单 · 四种类型都有', note: '「推荐」数上带推荐标记的 MCP、工具和外部项目；每个用途数的是它下面四种类型的条目', ...FOUR_KINDS },
  { title: '混合列表 · 四种类型都有 · 两个宿主', note: '依次是 Skill、MCP、工具三段，外部项目在最下面。工具只有一个状态，写在第一栏状态的位置；带推荐标记的工具行上写「推荐」，光标在它上面时「类型」写工具', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...down(6)] },
  { title: '混合列表 · 四种类型各勾了一个', note: '不同类型的条目一起勾选', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...pickFourKinds] },
  { title: '混合列表 · 光标在不可选的工具上', note: 'officecli 不支持这个系统：勾选位是短横，原因写在状态的位置、占满状态栏，其余暗淡；列表下方照样是它的类型和说明', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...down(7)] },
  { title: '混合列表 · 在不可选的工具上按空格', note: '勾不上：列表下方多一行说明，排在类型和说明的前面', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...down(7), KEY.space] },
  { title: '混合列表 · 四种类型都有 · 一个宿主', note: '只是少一栏状态', ...FOUR_KINDS, onPath: ['claude', 'pandoc'], keys: [...toMixedDocuments(), ...down(8)] },
  { title: '混合列表 · 四种类型都有 · 一个宿主都没有', note: '状态只有一栏；工具和别的组件一样不可选，原因都是「需要 AI Agent」，标了不支持这个系统的那条也是；外部项目照常可选', ...FOUR_KINDS, onPath: [], keys: [...toMixedDocuments(), ...down(7)] },
  { title: '混合列表 · 只有工具的用途', note: '工具自成一段，只有一栏状态：已安装、未安装，由条目声明的检查方式决定；装不了的条目不可选，状态的位置写原因（当前系统不支持、它要的 AI Agent 没检测到）', ...TOOLS, keys: pickTools },
  { title: '混合列表 · 只有工具的用途 · 两个宿主', note: '不问装进哪些宿主：工具不装进宿主。检测到了 Codex，只给它用的那条可选了', ...TOOLS, onPath: BOTH_HOSTS, keys: toTools },
  { title: '混合列表 · 只有工具的用途 · 在不可选的条目上按空格', note: '光标起始就在不可选的第一行上；勾不上，列表下方多一行说明', ...TOOLS, keys: [...toTools, KEY.space] },
  { title: '混合列表 · 只有工具的用途 · 一个宿主都没有', note: '用途照常进得去，每个工具都不可选并写明原因', ...TOOLS, onPath: [], keys: toTools },
  { title: '汇总确认 · 四种类型', note: '小表依次是 Skill、MCP、工具；工具的小表只有条目和操作两栏。将执行的命令先是 MCP 的、再是工具的，工具的命令原样写出。外部项目不在汇总里', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary] },
  { title: '汇总确认 · 四种类型 · 返回修改', note: '回到列表，四种类型的勾选都还在', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.down, KEY.enter] },
  { title: '汇总确认 · 两个工具', note: '只有工具一张小表；两条完整的命令都列出来，前面是序号；确认后才执行', ...TOOLS, keys: [...pickTools, KEY.enter] },
  { title: '汇总确认 · 工具 · 命令比一行长', note: '命令折行，续行与命令的左缘对齐，从不截断', catalog: withLongCommandTool, keys: [...toTools, ...down(4), KEY.space, KEY.down, KEY.space, KEY.enter] },
  { title: '汇总确认 · 工具 · Windows 上的命令', note: '条目给这个系统另写了命令：展示和执行的都是那一条', ...TOOLS, platform: 'win32', env: { WT_SESSION: '1' }, keys: [...pickUv, KEY.enter] },
  { title: '执行 · 工具排在最后 · 进行中', note: 'skill 和 MCP 已经在「正在安装」分区里装完；工具另起一个以它名字为标题的分区，第一行是要执行的命令，命令自己的输出原样透传，顶格、不加样式', ...FOUR_KINDS, shell: doclingStillRunning, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '结果 · 四种类型 · 工具排在最后', note: '「正在安装」的标题不回头改写；工具的结论紧跟在它的输出后面，名字后面留着宿主一栏的位置；最后用「结果」分区把每一行再列一遍，合计之后才是外部项目的说明与链接', ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '结果 · 四种类型 · 工具没装上', note: '命令以非零状态结束、复核也不通过：只有这一行失败，其余照常', ...FOUR_KINDS, shell: () => ({ output: 'ERROR: Could not find a version that satisfies the requirement docling[ocr]\n', exitCode: 1 }), keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '混合列表 · 有第三方 Skill 一段 · 两个宿主', note: '第三方 Skill 自成一段，排在本仓库的 skill 之后、MCP 之前，段首写明内容直接来自作者。状态只看目标位置下有没有那个目录：含多个 skill 的写已装几个、共几个；光标在它上面时「类型」写第三方 Skill', ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...down(5)] },
  { title: '混合列表 · 第三方 Skill 不支持其中一个宿主', note: 'guizang-ppt-skill 只支持 Claude Code：Codex 那一栏写不支持，照常勾得上，只装进支持的那个；excel 是同样情形的 MCP', ...FIVE_KINDS, catalog: withHostLimitedThirdParty, keys: [...toMixedDocuments(true), ...down(4)] },
  { title: '混合列表 · 有第三方 Skill 一段 · 一个宿主都没有', note: '和别的组件一样不可选，原因写在状态的位置', ...FIVE_KINDS, onPath: [], keys: [...toMixedDocuments(), ...down(5)] },
  { title: '第三方 Skill 的清单 · 含 3 个 skill，一个已装', note: '混合列表确认之后，含多个 skill 的条目各问一次要其中哪几个：每个 skill 一行，有各宿主下的状态和说明。按键提示写明一个都不勾就是不装这一条', ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...pickFromChecklist] },
  { title: '第三方 Skill 的清单 · 一个都不勾', note: '收成的那一行写「不装」；这一条不装，其余勾选的照常进汇总', ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...toChecklist, KEY.enter] },
  { title: '汇总确认 · 含第三方 Skill', note: '第三方 Skill 自成一张小表，一行是要装的一个 skill；已有同名目录的写覆盖，备注说另行确认。将执行的命令先是第三方 Skill 的（每个 skill、每个宿主一条），再是 MCP 的、工具的；下面提醒装的是作者当时的最新版', ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...toThirdPartySummary] },
  { title: '确认覆盖 · 第三方 Skill 已有同名目录', note: '选了「开始安装」之后逐项另问，缺省不覆盖', ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...toThirdPartySummary, KEY.enter] },
  { title: '正在安装 · 第三方 Skill', note: '进行中的那一行写「正在安装」；安装程序自己的输出不上屏，画面上只有这一行', ...FIVE_KINDS, commands: () => new Promise<never>(() => {}), keys: [...toMixedDocuments(true), ...installThirdParty] },
  { title: '结果 · 第三方 Skill 一项失败、一项没同意覆盖而跳过', note: '失败的那一行只说哪一步、退出状态几；没同意覆盖的跳过；其余照常。成功的写「已安装」，没有版本号。工具排在最后', ...FIVE_KINDS, ...GUIZANG_FAILS, keys: [...toMixedDocuments(true), ...installThirdParty] },
  { title: '执行工具的安装命令 · 只有工具 · 进行中', note: '这一轮只有工具时没有「正在安装」分区', ...TOOLS, shell: firstStillRunning, keys: [...pickUv, KEY.enter, KEY.enter] },
  { title: '结果 · 工具 · 一项成功一项失败', note: '结论以复核为准，不看命令的退出状态，紧跟在各自的输出后面；装了不止一个时，合计之前再用「结果」分区集中列一遍', ...TOOLS, keys: runTools },
  { title: '结果 · 工具 · 全部成功', note: '两种检查方式各有各的说法：在 PATH 中找到了命令、主目录下的那个路径已存在', catalog: withTools, shell: allInstall, keys: runUvAndBun },
  { title: '结果 · 工具 · 命令非零退出但复核通过', note: '以复核为准：bun 本来就装着，算已可用；退出状态照实写在后面。只装一个工具时不重复「结果」分区', ...TOOLS, shell: () => ({ output: 'error: Failed to download bun (HTTP 503)\n', exitCode: 1 }), keys: runBun },
  { title: '结果 · 工具 · 命令没能运行', note: '命令没能起来：原因只写错误码，复核照做', catalog: withTools, shell: () => ({ output: '', cannotStart: 'ENOENT' }), keys: runBun },
  { title: '结果 · 工具 · 命令正常结束但复核不通过', note: '命令以 0 退出，可执行路径上却找不到它：算失败，并提醒可能要重开终端', ...TOOLS, shell: () => ({ output: UV_OUTPUT }), keys: [...pickUv, KEY.enter, KEY.enter] },
  { title: '出错 · 目录读取失败', note: '断网', catalog: offline },
  { title: '出错 · 目录格式版本不受支持', note: 'catalog.json 的格式版本高于安装器所支持的', catalog: newerFormat },
  { title: '出错 · 没有交互式终端', note: 'npx oxy-tools | cat · 不打印大标志；出错说明走标准错误，所以仍然看得到', tty: false },
  { title: '出错 · 无法识别的参数', note: 'npx oxy-tools --frobnicate', argv: ['--frobnicate'] },
  { title: '帮助', note: 'npx oxy-tools --help', argv: ['--help'] },
  { title: '英文界面 · 主菜单', note: 'npx oxy-tools --lang en · 给了 --lang 就不问语言', argv: ['--lang', 'en'] },
  { title: '英文界面 · skill 多选列表', argv: ['--lang', 'en'], keys: pickTwo },
  { title: '英文界面 · 汇总与结果', argv: ['--lang', 'en'], catalog: oneFails, keys: install },
  { title: '英文界面 · 选择宿主', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, keys: toRecommended },
  { title: '英文界面 · 选择安装范围', argv: ['--lang', 'en'], ...FIVE_KINDS, ...PROJECT, keys: toScope },
  { title: '英文界面 · 装到项目的列表', argv: ['--lang', 'en'], ...FIVE_KINDS, ...PROJECT, keys: [...intoProject, ...down(6)] },
  { title: '英文界面 · 装到项目的汇总', argv: ['--lang', 'en'], ...FIVE_KINDS, ...PROJECT, keys: toProjectSummary },
  { title: '英文界面 · 装到项目 · 只选了 Codex', argv: ['--lang', 'en'], ...FIVE_KINDS, ...PROJECT, keys: intoProjectCodexOnly },
  { title: '英文界面 · 装到项目 · 带 key 的 MCP 的汇总', argv: ['--lang', 'en'], ...FIVE_KINDS, ...PROJECT, keys: toProjectMcpSummary },
  { title: '英文界面 · 两个宿主的汇总与结果', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, catalog: oneFails, keys: twoHosts(install) },
  { title: '英文界面 · 四种状态并存', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '英文界面 · 含覆盖项的汇总、确认与结果', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '英文界面 · 一个宿主都没有', argv: ['--lang', 'en'], onPath: [] },
  { title: '英文界面 · 主菜单 · 按用途进入', argv: ['--lang', 'en'], catalog: withApps },
  { title: '英文界面 · 用途下的列表', argv: ['--lang', 'en'], catalog: withApps, keys: pickTwoApps },
  { title: '英文界面 · 用途下的列表 · 名字最长的条目', argv: ['--lang', 'en'], catalog: withApps, keys: toContextMemory },
  { title: '英文界面 · 外部项目的说明与链接', argv: ['--lang', 'en'], catalog: withApps, keys: [...pickTwoApps, KEY.enter] },
  { title: '英文界面 · 主菜单 · 按用途进入 · 一个宿主都没有', argv: ['--lang', 'en'], catalog: withApps, onPath: [] },
  { title: '英文界面 · 一个宿主都没有 · 「推荐」的列表', argv: ['--lang', 'en'], onPath: [], keys: [...toRecommended, KEY.space] },
  { title: '英文界面 · 混合列表', argv: ['--lang', 'en'], catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed] },
  { title: '英文界面 · 混合的汇总与结果', argv: ['--lang', 'en'], catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...installMixed] },
  { title: '英文界面 · 混合列表 · skill 加 MCP', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...pickSkillAndMcps] },
  { title: '英文界面 · skill 加 MCP 的汇总与结果', argv: ['--lang', 'en'], onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '英文界面 · 混合列表 · 只有 MCP', argv: ['--lang', 'en'], ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '英文界面 · 混合列表 · 不可选的 MCP', argv: ['--lang', 'en'], ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '英文界面 · MCP 的汇总与结果', argv: ['--lang', 'en'], ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '英文界面 · 填写 key', argv: ['--lang', 'en'], ...KEYED, keys: toTwoKeys },
  { title: '英文界面 · 含 key 的汇总', argv: ['--lang', 'en'], ...KEYED, keys: [...toTwoKeys, KEY.enter, PASTED_KEY, KEY.enter] },
  { title: '英文界面 · 必填的 key 没填', argv: ['--lang', 'en'], ...KEYED, keys: [...skipExa, KEY.enter] },
  { title: '英文界面 · 主菜单 · 四种类型都有', argv: ['--lang', 'en'], ...FOUR_KINDS },
  { title: '英文界面 · 混合列表 · 四种类型', argv: ['--lang', 'en'], ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...pickFourKinds] },
  { title: '英文界面 · 混合列表 · 光标在不可选的工具上', argv: ['--lang', 'en'], ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...down(7)] },
  { title: '英文界面 · 第三方 Skill 的清单', argv: ['--lang', 'en'], ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...pickFromChecklist] },
  { title: '英文界面 · 含第三方 Skill 的汇总与结果', argv: ['--lang', 'en'], ...FIVE_KINDS, ...GUIZANG_FAILS, keys: [...toMixedDocuments(true), ...installThirdParty] },
  { title: '英文界面 · 四种类型的汇总与结果', argv: ['--lang', 'en'], ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '英文界面 · 混合列表 · 只有工具', argv: ['--lang', 'en'], ...TOOLS, keys: pickTools },
  { title: '英文界面 · 工具的汇总与结果', argv: ['--lang', 'en'], ...TOOLS, keys: runTools },
  { title: '英文界面 · 出错', argv: ['--lang', 'en'], catalog: offline },
  { title: '英文界面 · 帮助', note: 'npx oxy-tools --help --lang en', argv: ['--help', '--lang', 'en'] },
  { title: '不显示颜色 · 选择安装范围', note: '设置了 NO_COLOR：光标靠 ▸ 认，当前目录不再暗淡', env: { NO_COLOR: '1' }, ...FIVE_KINDS, ...PROJECT, keys: toScope },
  { title: '不显示颜色 · 装到项目 · 带 key 的 MCP 的汇总', note: '设置了 NO_COLOR：提醒靠行首的「注意」认，占位符靠尖括号认', env: { NO_COLOR: '1' }, ...FIVE_KINDS, ...PROJECT, keys: toProjectMcpSummary },
  { title: '不显示颜色 · 语言提问', note: '设置了 NO_COLOR：光标靠 ▸ 认，不靠颜色', env: { NO_COLOR: '1' }, answersLanguage: true },
  { title: '不显示颜色 · 主菜单', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' } },
  { title: '不显示颜色 · skill 多选列表', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, keys: pickTwo },
  { title: '不显示颜色 · 汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: oneFails, keys: install },
  { title: '不显示颜色 · 选择宿主', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, keys: toRecommended },
  { title: '不显示颜色 · 四种状态并存', note: '设置了 NO_COLOR：每种状态的文字本身就不同', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '不显示颜色 · 含覆盖项的汇总、确认与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '不显示颜色 · 一个宿主都没有', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, onPath: [] },
  { title: '不显示颜色 · 用途下的列表', note: '设置了 NO_COLOR：段标题、勾选和光标都靠符号认', env: { NO_COLOR: '1' }, catalog: withApps, keys: pickTwoApps },
  { title: '不显示颜色 · 混合列表', note: '设置了 NO_COLOR：类型靠段标题认，推荐靠行上的字认', env: { NO_COLOR: '1' }, catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed] },
  { title: '不显示颜色 · 混合列表 · 一个宿主都没有', note: '设置了 NO_COLOR：不可选的行靠行首的短横和行里的原因认', env: { NO_COLOR: '1' }, catalog: withMixed, onPath: [], keys: toMixedDocuments() },
  { title: '不显示颜色 · 混合列表 · skill 加 MCP', note: '设置了 NO_COLOR：两种类型的状态都是字，不靠颜色', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...pickSkillAndMcps] },
  { title: '不显示颜色 · skill 加 MCP 的汇总与结果', note: '设置了 NO_COLOR：占位符靠尖括号认', env: { NO_COLOR: '1' }, onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '不显示颜色 · 外部项目的说明与链接', note: '设置了 NO_COLOR：名字不加粗，链接没有下划线，文字照旧', env: { NO_COLOR: '1' }, catalog: withApps, keys: [...pickTwoApps, KEY.enter] },
  { title: '不显示颜色 · 混合列表 · 只有 MCP', note: '设置了 NO_COLOR：四种状态的文字本身就不同', env: { NO_COLOR: '1' }, ...MCP_TWO_HOSTS, keys: mcpTwoHosts(pickMcps) },
  { title: '不显示颜色 · 混合列表 · 不可选的 MCP', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '不显示颜色 · MCP 的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '不显示颜色 · 填写 key', note: '设置了 NO_COLOR：申请地址没有下划线，文字照旧', env: { NO_COLOR: '1' }, ...KEYED, keys: [...toTwoKeys, KEY.enter] },
  { title: '不显示颜色 · 含 key 的汇总与结果', note: '设置了 NO_COLOR：占位符靠尖括号认', env: { NO_COLOR: '1' }, ...KEYED, keys: [...skipExa.slice(0, -1), PASTED_KEY, KEY.enter, KEY.enter] },
  { title: '不显示颜色 · 混合列表 · 四种类型', note: '设置了 NO_COLOR：类型靠段标题认，状态和不可选的原因都是字', env: { NO_COLOR: '1' }, ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...pickFourKinds] },
  { title: '不显示颜色 · 第三方 Skill 的清单', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...pickFromChecklist] },
  { title: '不显示颜色 · 含第三方 Skill 的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...FIVE_KINDS, ...GUIZANG_FAILS, keys: [...toMixedDocuments(true), ...installThirdParty] },
  { title: '不显示颜色 · 四种类型的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '不显示颜色 · 混合列表 · 只有工具', note: '设置了 NO_COLOR：状态和不可选的原因都是字，不靠颜色', env: { NO_COLOR: '1' }, ...TOOLS, keys: pickTools },
  { title: '不显示颜色 · 工具的汇总与结果', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, ...TOOLS, keys: runTools },
  { title: '不显示颜色 · 出错', note: '设置了 NO_COLOR', env: { NO_COLOR: '1' }, catalog: offline },
  { title: '没有 Unicode · 启动与加载', note: 'Windows 旧式控制台：符号和大标志退成 ASCII', ...LEGACY_CONSOLE, catalog: neverLoads },
  { title: '没有 Unicode · 选择安装范围', note: '光标退成 >，按键提示里的按键改用文字', ...FIVE_KINDS, ...PROJECT, ...LEGACY_CONSOLE, keys: toScope },
  { title: '没有 Unicode · 语言提问', note: '光标退成 >，按键提示里的按键改用文字；三段固定的字不变', ...LEGACY_CONSOLE, answersLanguage: true },
  { title: '没有 Unicode · 主菜单', note: '按键提示里的按键改用文字', ...LEGACY_CONSOLE, catalog: withBrokenEntry },
  { title: '没有 Unicode · skill 多选列表', ...LEGACY_CONSOLE, keys: pickTwo },
  { title: '没有 Unicode · 汇总与结果', ...LEGACY_CONSOLE, catalog: oneFails, keys: install },
  { title: '没有 Unicode · 选择宿主', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, keys: toRecommended },
  { title: '没有 Unicode · 四种状态并存', note: '版本变化的箭头退成 ->', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...MIXED, keys: twoHosts(pickThree) },
  { title: '没有 Unicode · 含覆盖项的汇总、确认与结果', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...MIXED, catalog: oneFails, keys: twoHosts(declineOverwrite) },
  { title: '没有 Unicode · 一个宿主都没有', ...LEGACY_CONSOLE, onPath: [] },
  { title: '没有 Unicode · 主菜单 · 按用途进入', ...LEGACY_CONSOLE, catalog: withApps },
  { title: '没有 Unicode · 用途下的列表', note: '段标题前的横线退成 --，标题里的分隔退成 -', ...LEGACY_CONSOLE, catalog: withApps, keys: pickTwoApps },
  { title: '没有 Unicode · 混合列表', note: '段标题前的横线退成 --，推荐标记后的分隔退成 -', ...LEGACY_CONSOLE, catalog: withMixed, onPath: BOTH_HOSTS, ...MIXED, keys: [...toMixedDocuments(true), ...pickMixed] },
  { title: '没有 Unicode · 混合列表 · 一个宿主都没有', note: '不可选的勾选位退成 [-]，原因仍落在状态一栏', ...LEGACY_CONSOLE, catalog: withMixed, onPath: [], keys: toMixedDocuments() },
  { title: '没有 Unicode · 混合列表 · skill 加 MCP', note: '各栏照样对齐', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...pickSkillAndMcps] },
  { title: '没有 Unicode · skill 加 MCP 的汇总与结果', ...LEGACY_CONSOLE, onPath: BOTH_HOSTS, ...THREE_KINDS, keys: [...toMixedDocuments(true), ...toThreeKindsSummary, KEY.enter] },
  { title: '没有 Unicode · 外部项目的说明与链接', ...LEGACY_CONSOLE, catalog: withApps, keys: [...pickTwoApps, KEY.enter] },
  { title: '没有 Unicode · 混合列表 · 只有 MCP', note: '不可选的勾选位退成 [-]', ...LEGACY_CONSOLE, ...MCP_STATES, keys: pickMcps },
  { title: '没有 Unicode · 混合列表 · 不可选的 MCP', note: '在不可选的条目上按空格：光标照样显眼，下方多一行说明', ...LEGACY_CONSOLE, ...MCP_STATES, keys: [...toMcps, ...down(3), KEY.space] },
  { title: '没有 Unicode · MCP 的汇总与结果', ...LEGACY_CONSOLE, ...MCP_TWO_HOSTS, commands: linearFails, keys: mcpTwoHosts(runMcps) },
  { title: '没有 Unicode · 填写 key', note: '留下的那一行的记号退成 -', ...LEGACY_CONSOLE, ...KEYED, keys: [...toTwoKeys, KEY.enter] },
  { title: '没有 Unicode · 含 key 的汇总与结果', ...LEGACY_CONSOLE, ...KEYED, keys: [...skipExa.slice(0, -1), PASTED_KEY, KEY.enter, KEY.enter] },
  { title: '没有 Unicode · 混合列表 · 四种类型', note: '段标题前的横线退成 --，不可选的勾选位退成 [-]，各栏照样对齐', ...LEGACY_CONSOLE, ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...pickFourKinds] },
  { title: '没有 Unicode · 第三方 Skill 的清单', ...LEGACY_CONSOLE, ...FIVE_KINDS, keys: [...toMixedDocuments(true), ...pickFromChecklist] },
  { title: '没有 Unicode · 含第三方 Skill 的汇总与结果', ...LEGACY_CONSOLE, ...FIVE_KINDS, ...GUIZANG_FAILS, keys: [...toMixedDocuments(true), ...installThirdParty] },
  { title: '没有 Unicode · 四种类型的汇总与结果', ...LEGACY_CONSOLE, ...FOUR_KINDS, keys: [...toMixedDocuments(true), ...toFourKindsSummary, KEY.enter] },
  { title: '没有 Unicode · 混合列表 · 只有工具', note: '不可选的勾选位退成 [-]，各栏照样对齐；这个系统是 Windows，不支持它的那条写明原因', ...LEGACY_CONSOLE, ...TOOLS, keys: pickTools },
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
  const rows = scene.rows ?? ROWS;
  const terminal = new xterm.Terminal({ cols: COLUMNS, rows, allowProposedApi: true, convertEol: true });
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

  const { keyboard, prompter } = keyboardPrompter(write, rows, scene.answersLanguage, scene.answersScope);
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
  // 项目目录放在主目录里：画面上写成 ~/work/my-app
  const project = join(home, 'work', 'my-app');
  mkdirSync(project, { recursive: true });
  for (const [path, content] of Object.entries(scene.project ?? {})) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), content);
  }
  const finished = runInstaller({
    argv: scene.argv ?? [],
    env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', PATH: bin, ...scene.env },
    platform: scene.platform ?? 'darwin',
    systemLocale: 'zh-CN',
    stdout: { isTTY: tty, rows, columns: COLUMNS, write },
    stderr: { isTTY: true, write },
    stdinIsTTY: tty,
    catalogSource: scene.catalog ?? sample,
    homeDir: home,
    projectDir: project,
    tempDir: scratchDir('tmp'),
    interrupt: new AbortController().signal,
    runCommand: async (command, args, options) => {
      if (!options?.shell) {
        if (scene.commands || command !== 'npx') return (scene.commands ?? (async () => ok))(command, args);
        // skills CLI 的安装命令：假装装上了，往那个宿主的 skill 目录里写出 SKILL.md——带全局选项的在主目录下，
        // 不带的在它运行时所在的目录下
        const skill = args[args.indexOf('--skill') + 1] ?? '';
        const agent = args[args.indexOf('--agent') + 1] ?? '';
        if (scene.thirdPartyFails?.includes(`${skill}@${agent}`)) return { exitCode: 1 };
        const target = join(options?.cwd ?? home, agent === 'codex' ? CODEX_SKILLS : CLAUDE_SKILLS, skill, 'SKILL.md');
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `# ${skill}\n`);
        return ok;
      }
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
    // 安装器不该再打开浏览器：真调用了就让这一格出错，看得出来
    openLink: () => Promise.reject(new Error('the installer must not open a browser')),
  });

  await settle();
  for (const key of scene.keys ?? []) {
    keyboard.write(key);
    await settle();
  }
  await new Promise<void>((resolve) => terminal.write('', resolve));
  const cells = readCells(terminal, scene.rows !== undefined);
  // 收掉还开着的提问；一直在加载的场景不会结束，由进程退出时一并了结
  keyboard.write(KEY.ctrlC);
  await Promise.race([finished, sleep(200)]);
  return cells;
}

function readCells(terminal: InstanceType<typeof xterm.Terminal>, onScreenOnly = false): Cell[][] {
  const buffer = terminal.buffer.active;
  const lines: Cell[][] = [];
  // 整个缓冲区，连同滚出屏幕的部分：画面比 ROWS 行长时，只读前 ROWS 行会把底下的截掉。
  // 场景指定了终端的行数时相反，只要还在屏幕上的那几行
  for (let y = onScreenOnly ? buffer.baseY : 0; y < buffer.length; y++) {
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
