// 两份预览共用的样例（仅供开发）：终端界面的 preview.ts 和网页界面的 preview-web.ts 都用得上的样例条目、
// 拼目录来源的办法、场景里这台机器事先的样子和把它布置进临时目录的办法。只有一份预览用的样例留在那份预览自己的脚本里。
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { githubCatalogSource, type CatalogSource } from '../src/catalog.ts';
import { EMPTY_CATALOG } from '../test/fixtures.ts';

export const BOTH_HOSTS = ['claude', 'codex'];
export const THREE_HOSTS = [...BOTH_HOSTS, 'pi'];

// ── 样例目录 ──────────────────────────────────────────────────────────────────

export const SHOWCASE_SKILLS = [
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
export function downloads(behaviour: { fails?: Record<string, string>; hangs?: string[] } = {}): CatalogSource['pin'] {
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
export function catalogOf(index: unknown, catalog: unknown = EMPTY_CATALOG, pin = downloads()): CatalogSource {
  const files: Record<string, unknown> = { 'index.json': index, 'catalog.json': catalog };
  return { ...githubCatalogSource(), readText: async (file) => JSON.stringify(files[file]), pin };
}

// 外部项目的场景另带一份用途清单：照仓库里真实的那十个，主菜单才看得出按用途排开的样子
export const SHOWCASE_PURPOSES = [
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
export const SHOWCASE_APPS = [
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

// 一个带 key 的 MCP 要的那一个环境变量
export const keyed = (name: string, required: boolean, zh: string, en: string, url: string) => [{ name, required, description: { zh, en }, url }];

// 名字长的 MCP：汇总里它的备注一行放不下
export const LONG_NAME_MCP = {
  name: 'modelcontextprotocol-server-sequential-thinking',
  description: { zh: '把复杂问题拆成一步步的思考过程', en: 'Break a complex problem down into a step-by-step thinking process' },
  url: 'https://example.com/sequential-thinking',
  purpose: 'web-search',
  server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
};

// 混合列表的样例：三个 skill 另外归在「文档处理」下、一个归在「UI 设计、图像与视频」下，mineru 带推荐标记
export const MIXED_CATALOG = {
  ...EMPTY_CATALOG,
  purposes: SHOWCASE_PURPOSES,
  apps: SHOWCASE_APPS.map((app) => (app.name === 'mineru' ? { ...app, recommended: true } : app)),
  skillPurposes: { archify: 'documents', explanation: 'documents', pr: 'documents', onetake: 'design-media' },
};

// 「文档处理」下的三个 MCP：一个带推荐标记，一个只支持 Claude Code，一个的 key 必填
export const DOCUMENT_MCPS = [
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

// 「文档处理」下的三个工具：一个带推荐标记，一个只支持 Linux，一个在场景里可以是已经装着的。
// 第一条的命令里有引号：工具的命令原样写出
export const DOCUMENT_TOOLS = [
  { name: 'docling', zh: '把 PDF、Office 文档解析成结构化的 Markdown 或 JSON，在本机运行', en: 'Parse PDFs and Office files into structured Markdown or JSON, running locally', recommended: true, install: { default: "pip install 'docling[ocr]'" }, check: { command: 'docling' } },
  { name: 'officecli', zh: '在命令行里读写 Word、Excel、PPT 文件', en: 'Read and write Word, Excel and PowerPoint files from the command line', install: { default: 'npm install -g officecli', macos: null, windows: null }, check: { command: 'officecli' } },
  { name: 'pandoc', zh: '在 Markdown、Word、HTML、PDF 等几十种文档格式之间互相转换', en: 'Convert between dozens of document formats such as Markdown, Word, HTML and PDF', install: { default: 'brew install pandoc' }, check: { command: 'pandoc' } },
].map(({ zh, en, ...tool }) => ({ ...tool, description: { zh, en }, url: `https://example.com/${tool.name}`, purpose: 'documents' }));

// 「文档处理」下的三条第三方 Skill，一条含三个 skill。名字和来源取自待录入的清单，说明是为预览写的
export const DOCUMENT_THIRD_PARTY = [
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

// ── 这台机器事先的样子 ────────────────────────────────────────────────────────

/** 场景里这台机器事先的样子 */
export interface World {
  /** 可执行路径上有哪些命令，缺省只有 claude */
  onPath?: string[];
  /** 主目录里事先有什么：相对路径 → 文件内容 */
  home?: Record<string, string>;
  /** 主目录里事先有的符号链接：链接的相对路径 → 它指向的相对路径 */
  links?: Record<string, string>;
  /** 项目目录（主目录下的 work/my-app）里事先有什么：相对路径 → 文件内容 */
  project?: Record<string, string>;
}

/** 照 world 布置出可执行路径、主目录和项目目录，都是 scratchDir 现建的临时目录：预览不碰真实的主目录。 */
export function stageWorld(world: World, scratchDir: (label: string) => string): { bin: string; home: string; project: string } {
  const bin = scratchDir('bin');
  for (const command of world.onPath ?? ['claude']) writeFileSync(join(bin, command), '', { mode: 0o755 });
  const home = scratchDir('home');
  for (const [path, content] of Object.entries(world.home ?? {})) {
    mkdirSync(dirname(join(home, path)), { recursive: true });
    writeFileSync(join(home, path), content);
  }
  for (const [link, target] of Object.entries(world.links ?? {})) {
    mkdirSync(dirname(join(home, link)), { recursive: true });
    symlinkSync(join(home, target), join(home, link), 'junction');
  }
  // 项目目录放在主目录里：画面上写成 ~/work/my-app
  const project = join(home, 'work', 'my-app');
  mkdirSync(project, { recursive: true });
  for (const [path, content] of Object.entries(world.project ?? {})) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), content);
  }
  return { bin, home, project };
}

// 主目录里一个本工具装的 skill：有安装标记
export function installedSkill(skillsDir: string, name: string, version: string): Record<string, string> {
  return {
    [`${skillsDir}/${name}/SKILL.md`]: `# ${name}\n`,
    [`${skillsDir}/${name}/.oxy-tools.json`]: JSON.stringify({ name, version, commit: null, installedAt: '2026-10-01T08:00:00.000Z' }),
  };
}

export const CLAUDE_SKILLS = '.claude/skills';
export const CODEX_SKILLS = '.agents/skills';
// 四种状态都有：已装、版本不同、不是本工具装的（手动放的目录、符号链接）、未装
export const MIXED: Pick<World, 'home' | 'links'> = {
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
// Claude Code 的用户级配置里已有 excel 这个 MCP
export const EXCEL_CONFIGURED = { '.claude.json': JSON.stringify({ mcpServers: { excel: { command: 'uvx' } } }) };
// 第三方 Skill 装过的样子：drawio-skill 两个宿主下都装过，paper-analyzer 只在 Claude Code 下装过
export const THIRD_PARTY_INSTALLED = {
  [`${CLAUDE_SKILLS}/drawio-skill/SKILL.md`]: '# drawio-skill\n',
  [`${CODEX_SKILLS}/drawio-skill/SKILL.md`]: '# drawio-skill\n',
  [`${CLAUDE_SKILLS}/paper-analyzer/SKILL.md`]: '# paper-analyzer\n',
};
