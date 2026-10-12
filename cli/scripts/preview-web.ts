// 网页界面的预览（仅供开发）：经安装器入口按预设场景把安装器驱动到要看的状态，让本机装着的 Chrome 打开它的网页界面，
// 把真实的页面拍下来——每个场景一格，深色和浅色各一份，连同每格页面上的文字拼成一个离线的 HTML 页面。
// 生成物在 .preview/web/ 下，不提交，不随 npm 包发布。预览不碰真实的主目录和网络，不真的执行命令。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogError, type CatalogSource } from '../src/catalog.ts';
import { runInstaller } from '../src/installer.ts';
import { PromptAborted } from '../src/prompter.ts';
import { openPage, type Page } from '../test/browser.ts';
import { buildWeb } from './build-web.ts';
import { findChrome, launchChrome, type Chrome } from './chrome.ts';
import {
  BOTH_HOSTS,
  DOCUMENT_MCPS,
  DOCUMENT_THIRD_PARTY,
  DOCUMENT_TOOLS,
  EXCEL_CONFIGURED,
  LONG_NAME_MCP,
  MIXED,
  MIXED_CATALOG,
  SHOWCASE_PURPOSES,
  SHOWCASE_SKILLS,
  THIRD_PARTY_INSTALLED,
  catalogOf,
  downloads,
  keyed,
  stageWorld,
  type World,
} from './preview-samples.ts';

interface Viewport {
  width: number;
  height: number;
}
// 主要的视口，和不能坏的那一个
const DESKTOP: Viewport = { width: 1280, height: 800 };
const NARROW: Viewport = { width: 1024, height: 768 };
const SCHEMES = [
  ['dark', '深色'],
  ['light', '浅色'],
] as const;

/** 扮演浏览器给安装器发意图，把它驱动到要看的状态 */
type Drive = (page: Page) => Promise<void>;

interface Scene extends World {
  title: string;
  note?: string;
  /** 页面的语言，缺省中文 */
  lang?: 'en';
  /** 目录，缺省是 worst */
  catalog?: CatalogSource;
  /** 打开浏览器之前把安装器驱动到要看的状态：状态在安装器这边，真实的页面一连上看到的就是它 */
  drive?: Drive;
  /**
   * 开场动画：数字是定格在第几毫秒；skipped 是播着的时候按了一下键；reduced-motion 是系统开了「减少动态效果」，不播。
   * 不给就是这次运行里已经播过了，页面直接出现
   */
  intro?: number | 'skipped' | 'reduced-motion';
  /**
   * 页面画出来之后让它走到哪种结束画面：finished 是发了「完成」，switched 是终端上按了 t 改用终端界面，
   * exited 是安装器退出、页面重连不上，denied 是拿着不对的口令打开
   */
  ending?: 'finished' | 'switched' | 'exited' | 'denied';
  /** 页面画出来之后按几下 Tab：看键盘焦点 */
  tabs?: number;
  /** 页面画出来之后把名字是它的那张卡片滚到窗口中间 */
  reveal?: string;
  /**
   * 页面画出来之后，在填 key 的对话框里焦点所在的那个输入框里打进假装的 key：看输入框不显示内容。
   * 拍完再让它失去焦点、等这一行换成「已填」，然后才查假装的 key 有没有留在页面上
   */
  typing?: true;
  /**
   * 外部命令的结局：缺省是没能运行（预览不执行命令）；succeed 是假装它们都正常结束了；tool-running 是别的都正常结束、
   * 轮到工具的那一行命令一直不结束（停在它在终端里跑的时候）——同样什么都不执行
   */
  commands?: 'succeed' | 'tool-running';
  /** 窗口多大，缺省 1280×800 */
  viewport?: Viewport;
  /** 窗口拉到列表那么高：一张比窗口高的列表从头到尾都在这一格里 */
  whole?: true;
}

// ── 样例 ──────────────────────────────────────────────────────────────────────

// 这台机器缺省的样子：两个宿主；本仓库的 skill 四种状态都有（照 MIXED）；第三方 Skill 一条两边都装过、一条只装了
// 三个里的一个；Claude Code 里配过 excel；可执行路径上有 pandoc
const LIVED_IN: World = {
  onPath: [...BOTH_HOSTS, 'pandoc'],
  ...MIXED,
  home: { ...MIXED.home, ...EXCEL_CONFIGURED, ...THIRD_PARTY_INSTALLED },
};
const ONE_HOST = { onPath: ['claude', 'pandoc'] };
const CODEX_ONLY = { onPath: ['codex', 'pandoc'] };
const NO_HOSTS = { onPath: ['pandoc'] };

// 最坏的内容：「文档处理」下二十多条，四种组件加外部项目都有；样例里名字最长的两条（一个 MCP、一个外部项目）、
// 链接最长的那一条也归到它下面。「联网搜索与文档检索」因此空了，左栏里不出现。
// 另给一张卡片写一条四五行的说明：卡片跟着变高、同一排的另一张跟着它一样高，只有这时才看得到
const CROWDED = 'documents';
const LONGEST = ['opencode-dynamic-context-pruning', 'ragflow'];
const LONG_ABOUT = {
  zh: '把 PDF、Word、PPT、Excel、HTML 和扫描的图片解析成结构化的 Markdown 或 JSON，认得出标题、表格、公式、代码块和阅读顺序，全程在本机运行，文档不离开这台机器。这条说明故意写得很长：它在卡片上要折成四五行，一个字都不截',
  en: 'Parse PDFs, Word, PowerPoint and Excel files, HTML and scanned images into structured Markdown or JSON, recognising headings, tables, formulas, code blocks and reading order, all running locally so documents never leave this machine. This description is long on purpose: on a card it wraps to four or five lines and not a word is cut',
};
const WORST_CATALOG = {
  ...MIXED_CATALOG,
  skillPurposes: { ...MIXED_CATALOG.skillPurposes, if5: CROWDED, 'oxy-learning-hub': CROWDED, wizard: CROWDED, 'writing-for-agents': CROWDED },
  thirdPartySkills: DOCUMENT_THIRD_PARTY,
  mcps: [...DOCUMENT_MCPS, { ...LONG_NAME_MCP, purpose: CROWDED }],
  tools: DOCUMENT_TOOLS.map((tool) => (tool.name === 'docling' ? { ...tool, description: LONG_ABOUT } : tool)),
  apps: MIXED_CATALOG.apps.map((app) => (LONGEST.includes(app.name ?? '') ? { ...app, purpose: CROWDED } : app)),
};
const worst = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, WORST_CATALOG);
// 同一份目录，下载的时候各有各的遭遇：onetake 一直下不完；explanation 下到一半断了；向 GitHub 的查询被限流
const worstWith = (pin: CatalogSource['pin']): CatalogSource => catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, WORST_CATALOG, pin);
const neverFinishes = worstWith(downloads({ hangs: ['onetake'] }));
const oneFails = worstWith(downloads({ fails: { explanation: 'HTTP 503' } }));
const queryLimited = worstWith(() => Promise.reject(new CatalogError({ kind: 'rate-limited', authenticated: false, minutes: 37 })));
// drawio-skill 只支持 Codex：去掉 Codex 之后它在已选里就装不了
const codexOnlyDrawio = catalogOf(
  { version: 1, skills: SHOWCASE_SKILLS },
  { ...WORST_CATALOG, thirdPartySkills: DOCUMENT_THIRD_PARTY.map((entry) => (entry.name === 'drawio-skill' ? { ...entry, hosts: ['codex'] } : entry)) },
);
// 带 key 的场景另加两个 MCP：一个要两个必填的、一个可选的 key，一个是远程地址的（Codex 添加它时可能当场登录）
const KEYED_CATALOG = {
  ...WORST_CATALOG,
  mcps: [
    ...WORST_CATALOG.mcps,
    {
      name: 'grok-search',
      description: { zh: '联网搜索、抓取网页并梳理站点，需要 API key', en: 'Web search, page fetching and site mapping; needs API keys' },
      url: 'https://example.com/grok-search',
      purpose: CROWDED,
      server: { command: 'npx', args: ['-y', 'grok-search-mcp'] },
      env: [
        ...keyed('GROK_API_URL', true, 'Grok 接口的地址，要是 OpenAI 兼容格式，如 https://你的服务地址/v1', 'Address of the Grok endpoint in OpenAI-compatible form, such as https://your-host/v1', 'https://github.com/GuDaStudio/GrokSearch#readme'),
        ...keyed('GROK_API_KEY', true, 'Grok 接口的密钥', 'Key for the Grok endpoint', 'https://github.com/GuDaStudio/GrokSearch#readme'),
        ...keyed('TAVILY_API_KEY', false, 'Tavily 的 API key；不填的话抓取网页和梳理站点这两个工具用不了', 'Tavily API key; without it the page-fetching and site-mapping tools do not work', 'https://www.tavily.com/'),
      ],
    },
    {
      name: 'notion',
      description: { zh: '读写 Notion 里的页面和数据库（远程地址，首次使用要登录）', en: 'Read and write Notion pages and databases (remote server; sign-in on first use)' },
      url: 'https://example.com/notion',
      purpose: CROWDED,
      server: { url: 'https://mcp.example.com/notion' },
    },
  ],
};
const withKeyed = catalogOf({ version: 1, skills: SHOWCASE_SKILLS }, KEYED_CATALOG);
// 假装填进去的 key。它不许出现在生成物的任何地方：每一格拍完脚本自己查一遍，最后再查整份 HTML
const FAKE_KEY = 'sk-preview-7Qm2-not-a-real-key';
const withBrokenEntry = catalogOf({ version: 1, skills: [...SHOWCASE_SKILLS, { name: 'broken', path: '../elsewhere' }] }, WORST_CATALOG);
const emptyCatalog = catalogOf({ version: 1, skills: [] });

// ── 场景 ──────────────────────────────────────────────────────────────────────

/** 换到样例用途清单里 id 是它的那个用途的列表上：照左栏上的名字去找，和用户点那一行是一回事 */
const toPurpose =
  (id: string): Drive =>
  async (page) => {
    const name = SHOWCASE_PURPOSES.find((purpose) => purpose.id === id)?.name[page.state().lang];
    const row = page.state().menu.find((candidate) => candidate.name === name);
    if (!row) throw new Error(`左栏里没有用途 ${id}`);
    await page.send({ type: 'open', list: row.id });
  };
const crowded = toPurpose(CROWDED);
const appsOnly = toPurpose('dev-workflow');
const EN = { lang: 'en' as const };
/** 一步接一步地驱动 */
const inOrder =
  (...drives: Drive[]): Drive =>
  async (page) => {
    for (const drive of drives) await drive(page);
  };
/** 勾上这几个本仓库的 skill */
const picking =
  (...names: string[]): Drive =>
  async (page) => {
    for (const name of names) await page.send({ type: 'pick', kind: 'skill', name, on: true });
    await page.until((state) => state.selected.length === names.length);
  };
/** 勾上这一类里的这几个条目 */
const pickingOf =
  (kind: 'thirdParty' | 'mcp' | 'tool') =>
  (...names: string[]): Drive =>
  async (page) => {
    for (const name of names) await page.send({ type: 'pick', kind, name, on: true });
    await page.until((state) => names.every((name) => state.selected.some((entry) => entry.name === name)));
  };
const pickingThirdParty = pickingOf('thirdParty');
const pickingMcp = pickingOf('mcp');
const pickingTool = pickingOf('tool');
/** 含多个 skill 的第三方 Skill 里挑这几个 */
const choosing =
  (entry: string, ...skills: string[]): Drive =>
  async (page) => {
    for (const skill of skills) await page.send({ type: 'choose', entry, skill, on: true });
    await page.until((state) => state.selected.some((candidate) => candidate.name === entry && candidate.detail !== undefined && candidate.detail.includes(String(skills.length))));
  };
/** 去汇总 */
const reviewing: Drive = async (page) => {
  await page.send({ type: 'review' });
  await page.until((state) => state.summary !== undefined);
};
/** 汇总里第几个要逐项决定的覆盖，勾上「覆盖它」 */
const agreeing =
  (nth: number): Drive =>
  async (page) => {
    const asked = (page.state().summary?.entries ?? []).flatMap((entry) => entry.rows.flatMap((row) => (row.overwrite ? [row.overwrite.id] : [])));
    const item = asked[nth];
    if (item === undefined) throw new Error(`汇总里没有第 ${nth + 1} 个要逐项决定的覆盖`);
    await page.send({ type: 'overwrite', item, on: true });
    await page.until((state) => state.summary?.entries.some((entry) => entry.rows.some((row) => row.overwrite?.id === item && row.overwrite.agreed)) ?? false);
  };
/** 确认安装，等到这一批走到 reached 说的那一步 */
const installing =
  (reached: (run: NonNullable<ReturnType<Page['state']>['run']>) => boolean): Drive =>
  async (page) => {
    await page.send({ type: 'install', summary: page.state().summary?.id ?? '' });
    await page.until((state) => state.run !== undefined && reached(state.run));
  };
const finished = installing((run) => run.done);
/** 拿着早先那份汇总的标识去确认：不装，推来的是新的一份 */
const outdated: Drive = async (page) => {
  await page.send({ type: 'install', summary: 'an-earlier-summary' });
  await page.until((state) => state.summary?.renewed === true);
};
/** 不装进（或装进）一个宿主 */
const choosingHost =
  (id: string, on: boolean): Drive =>
  async (page) => {
    await page.send({ type: 'host', host: id, on });
    await page.until((state) => state.target.choices.some((choice) => choice.id === id && choice.on === on));
  };
/** 装到项目 */
const toProject: Drive = async (page) => {
  await page.send({ type: 'scope', scope: 'project' });
  await page.until((state) => state.target.scope === 'project');
};
/** 点「去汇总」，已选里有要 key 的 MCP：先到填 key */
const toKeys: Drive = async (page) => {
  await page.send({ type: 'review' });
  await page.until((state) => state.keys !== undefined);
};
/** 在填 key 里给这个 MCP 的这几个变量填上假装的值 */
const filling =
  (mcp: string, ...variables: string[]): Drive =>
  async (page) => {
    for (const variable of variables) await page.send({ type: 'key', mcp, variable, value: FAKE_KEY });
    await page.until((state) => state.keys?.entries.find((entry) => entry.mcp === mcp)?.variables.every((variable) => !variables.includes(variable.name) || variable.filled !== undefined) ?? false);
  };
/** 从填 key（或汇总）回到浏览 */
const backToBrowse: Drive = async (page) => {
  await page.send({ type: 'revise' });
  await page.until((state) => state.keys === undefined && state.summary === undefined);
};
// 两个要 key 的 MCP：mistral-ocr 的必填 key 没填；grok-search 两个必填的填了，可选的那个没填
const KEYS_FILLED = inOrder(crowded, pickingMcp('mistral-ocr', 'grok-search'), toKeys, filling('grok-search', 'GROK_API_URL', 'GROK_API_KEY'));
// 带 key 的 MCP 装到项目：markitdown 在项目里配过，mistral-ocr 的必填 key 没填
const KEYED_TO_PROJECT = {
  catalog: withKeyed,
  project: { '.mcp.json': JSON.stringify({ mcpServers: { markitdown: { command: 'uvx' } } }) },
  drive: inOrder(crowded, toProject, picking('wizard'), pickingMcp('markitdown', 'mistral-ocr', 'grok-search'), toKeys, filling('grok-search', 'GROK_API_URL', 'GROK_API_KEY'), reviewing),
};
// 四种状态各一个，外加一个另一个用途下的（onetake 在「UI 设计、图像与视频」下，这张列表里看不到它）
const MIXED_PICKS = picking('archify', 'explanation', 'pr', 'writing-for-agents', 'onetake');
const summarized = inOrder(crowded, MIXED_PICKS, reviewing);
// 两条第三方 Skill：只含一个 skill 的 drawio-skill（两个宿主下都装过了）和含三个的 paper-craft-skills，挑其中两个
// （paper-analyzer 在 Claude Code 下装过了），外加一个本仓库的 skill
// 先勾本仓库的那一个：picking 等的是「已选里正好这几个」
const THIRD_PARTY_PICKS = inOrder(picking('wizard'), pickingThirdParty('drawio-skill', 'paper-craft-skills'), choosing('paper-craft-skills', 'paper-analyzer', 'paper-comic'));
const thirdPartySummarized = inOrder(crowded, THIRD_PARTY_PICKS, reviewing);

// 一个本仓库的 skill、一个 MCP、两个工具：docling 没装着，pandoc 已经在可执行路径上
const WITH_TOOLS = inOrder(crowded, picking('wizard'), pickingMcp('markitdown'), pickingTool('docling', 'pandoc'));
const toolRunning = inOrder(WITH_TOOLS, reviewing, installing((run) => run.rows.some((row) => row.terminal === true)));

const scenes: Scene[] = [
  { title: '开场动画 · 敲命令', note: '第 0.6 秒：黑底上 $ npx oxy-tools 一个字一个字敲出来，行尾是光标。浅色下开场也是黑底白字', intro: 600 },
  { title: '开场动画 · 大标志打出来', note: '第 1.5 秒：大标志一行行打出来，单色', intro: 1500 },
  { title: '开场动画 · 版本号', note: '第 2.1 秒：五行都打完了，标志下面淡淡的一行版本号', intro: 2100 },
  { title: '开场动画 · 淡出', note: '第 2.45 秒：开场淡出到一半，底下的卡片开始一张张浮上来', intro: 2450 },
  { title: '开场动画 · 被跳过', note: '播着的时候按了一下键：盖着的那一层当场收掉，卡片不做浮上来的动作，所有东西直接到位', intro: 'skipped' },
  { title: '开场动画 · 减少动态效果', note: '系统开了「减少动态效果」：这次运行第一次打开也不播，页面直接出现', intro: 'reduced-motion' },
  {
    title: '浏览 ·「推荐」',
    note: '页面一打开的样子：左栏第一行是「推荐」，当前项是抬一档的底色。两个宿主时宿主和安装范围在标题的下一行，卡片底部每个宿主一段状态；这张列表里每一条都是推荐的，卡片上不标',
  },
  {
    title: '浏览 · 条目最多的用途',
    note: '「文档处理」二十多条：Skill、第三方 Skill、MCP、工具各一区，外部项目在最后。已装带版本、版本不同、非本工具安装、未装都有；右栏的「已选」和「去汇总」一直在屏幕上',
    drive: crowded,
  },
  {
    title: '浏览 · 条目最多的用途 · 整张列表',
    note: '窗口拉到列表那么高：每条说明都完整，没有一处省略号。样例里最长的名字（MCP 和外部项目各一个）、最长的说明（docling，卡片跟着变高，同一排的另一张和它一样高）、最长的链接都在这张列表里',
    drive: crowded,
    whole: true,
  },
  { title: '浏览 · 条目最多的用途 · 1024×768', note: '左栏、右栏收窄，卡片仍是两张一排；没有横向滚动条，「去汇总」看得见', drive: crowded, viewport: NARROW },
  {
    title: '切换语言 · 页面上换成了英文',
    note: '中文起的安装器，页面上点了 English：左栏最下面的分段控件停在 English 上；仍是「文档处理」这张列表，凡是随画面状态来的字都成了英文，页面自己的固定文字也换了；浏览器的语言仍是中文',
    drive: async (page) => {
      await crowded(page);
      await page.send({ type: 'lang', lang: 'en' });
      await page.until((state) => state.lang === 'en');
    },
  },
  {
    title: '浏览 · 有不可选的条目',
    note: 'officecli 不支持这个系统：虚线的边、虚线的勾选框，原因直接写在状态的位置，不靠鼠标悬停；名字和说明退一档，不用最淡的文字',
    drive: crowded,
    reveal: 'officecli',
  },
  {
    title: '浏览 · 勾了工具',
    note: '工具勾得上了：docling、pandoc 是选中的画法，右栏里类型写「工具」。工具只有一段状态、不写宿主的名字，已安装的照样勾得上；officecli 不支持这个系统，仍是不可选的画法',
    drive: WITH_TOOLS,
    reveal: 'officecli',
  },
  {
    title: '浏览 · 只检测到 Claude Code',
    note: '没有可勾的宿主：写一句「装进 Claude Code」，没检测到的那个写在旁边，和标题同一行；卡片底部只有状态的词，不写宿主的名字',
    ...ONE_HOST,
    drive: crowded,
  },
  { title: '浏览 · 只检测到 Codex', note: 'excel 只支持 Claude Code：不可选，原因是「需要别的 AI Agent」', ...CODEX_ONLY, drive: crowded, reveal: 'excel' },
  {
    title: '浏览 · 两个宿主只选一个',
    note: '去掉了 Codex：顶上那一条里它的勾空着，每张卡片只剩 Claude Code 的状态、不写宿主的名字',
    drive: inOrder(crowded, choosingHost('codex', false)),
  },
  {
    title: '浏览 · 装到项目',
    note: '选了「项目」：标题下面写明只对哪个目录生效（主目录里的以 ~ 开头）；全局装过的在项目里都是「未装」',
    drive: inOrder(crowded, toProject),
  },
  { title: '浏览 · 装到项目 · 1024×768', note: '宿主和安装范围两样一起折到标题的下一行，目录那一行在它们上面', drive: inOrder(crowded, toProject), viewport: NARROW },
  {
    title: '浏览 · 一个宿主都没有',
    note: '顶上那一条不写宿主、没有安装范围；组件都是不可选的画法，原因是「需要 AI Agent」；左栏的本机信息多一行「注意」',
    ...NO_HOSTS,
    drive: crowded,
  },
  { title: '浏览 · 用途下只有外部项目', note: '没有组件的分区，顶上那一条下面直接是外部项目：没有勾选框，名字是链接，整条网址写在下面', drive: appsOnly },
  { title: '浏览 · 用途下只有外部项目 · 一个宿主都没有', note: '外部项目不靠宿主，照常看得到、点得开', ...NO_HOSTS, drive: appsOnly },
  { title: '浏览 · 有条目被跳过', note: '目录里有一条写坏的条目：左栏的本机信息多一行「注意」', catalog: withBrokenEntry },
  { title: '浏览 · 目录是空的', note: '左栏没有用途，中间一栏只有那一句', catalog: emptyCatalog },
  {
    title: '浏览 · 已选了几个',
    note: '勾上的卡片是前景色的边、抬一档的底色、实心的勾；右栏列出已选的五个（照勾选的先后，每个能当场去掉）和数量，其中一个在别的用途下；「去汇总」点得了，和数量一起一直在屏幕上',
    drive: inOrder(crowded, MIXED_PICKS),
  },
  { title: '浏览 · 已选了几个 · 1024×768', note: '右栏收窄：已选的数量和「去汇总」仍在屏幕上，不用滚动去找', drive: inOrder(crowded, MIXED_PICKS), viewport: NARROW },
  {
    title: '浏览 · 有第三方 Skill · 挑其中的 skill',
    note: '「第三方 Skill」分区的小标题后面写着内容直接来自作者。paper-craft-skills 含三个 skill：勾上之后卡片占一整行，说明下面是那一句和三个 skill 的清单（名字、说明、各自在每个宿主下的状态），挑了两个；右栏里写着「3 个 skill 里挑了 2 个」。drawio-skill 只含一个，勾上就是装它',
    drive: inOrder(crowded, THIRD_PARTY_PICKS),
    reveal: 'paper-craft-skills',
  },
  {
    title: '浏览 · 有第三方 Skill · 一个 skill 都没挑',
    note: '刚勾上含多个 skill 的条目、还没挑：清单里一个都没勾，右栏里那一项名字划掉、写着「一个 skill 都没挑，这一条不装」，标题旁写着这次不会装一项',
    drive: inOrder(crowded, pickingThirdParty('paper-craft-skills')),
    reveal: 'paper-craft-skills',
  },
  {
    title: '浏览 · 已选里有现在装不了的',
    note: 'drawio-skill 只支持 Codex，勾上之后去掉了 Codex：卡片成了不可选的画法，原因是「需要别的 AI Agent」；它留在右栏里，名字划掉、下面是同一句原因；只剩它一个会装的都没有，「去汇总」点不了',
    catalog: codexOnlyDrawio,
    drive: inOrder(crowded, pickingThirdParty('drawio-skill'), choosingHost('codex', false)),
    reveal: 'drawio-skill',
  },
  {
    title: '浏览 · 有要 key 的 MCP',
    note: 'MCP 勾得上了。要 key 的卡片上有线框的标记：有必填的是「要填 key」。右栏里 mistral-ocr 写着留意色的「要填 key」，grok-search 的必填项填过了，是就绪色的「key 已填」',
    catalog: withKeyed,
    drive: inOrder(KEYS_FILLED, backToBrowse),
    reveal: 'grok-search',
  },
  {
    title: '填 key · 没填、已填、必填的没填',
    note: '点了「去汇总」：已选里有要 key 的 MCP，先到这个对话框。每个 MCP 一段、每个变量写明必填还是可选、是做什么用的、去哪申请。mistral-ocr 的必填项没填：输入框下面是留意色的后果；grok-search 填过的两个只写「已填」和「换一个」，看不出值和长度；可选的那个没填，下面是最淡的一句',
    catalog: withKeyed,
    drive: KEYS_FILLED,
  },
  { title: '填 key · 1024×768', note: '对话框收窄，网址在任意处断开，箭头不单独掉到下一行；「好了」看得见', catalog: withKeyed, drive: KEYS_FILLED, viewport: NARROW },
  {
    title: '填 key · 正在输入、可选的没填',
    note: '只勾了 grok-search：第一个必填项填过了；第二个正在输入——输入框里只有圆点，看不到打进去的字；可选的那个没填，下面是最淡的一句「留空则不设置这个变量」',
    catalog: withKeyed,
    drive: inOrder(crowded, pickingMcp('grok-search'), toKeys, filling('grok-search', 'GROK_API_URL')),
    typing: true,
  },
  {
    title: '浏览 · 装到项目 · MCP 那一区的提醒',
    note: '选了「项目」：MCP 那一区上方一行「注意」写明 Codex 的 MCP 只能装到全局，卡片上 Codex 那一段是「不支持」；仍然勾得上，只装进 Claude Code',
    catalog: withKeyed,
    drive: inOrder(crowded, toProject, pickingMcp('markitdown')),
    reveal: 'markitdown',
  },
  {
    title: '浏览 · 读不到 Codex 的配置',
    note: 'Codex 的配置写坏了：MCP 那一区上方一行「注意」，卡片上 Codex 那一段是不上色的「未知」',
    catalog: withKeyed,
    home: { ...LIVED_IN.home, '.codex/config.toml': '[mcp_servers\n写坏了' },
    drive: crowded,
    reveal: 'markitdown',
  },
  {
    title: '浏览 · 已选里有现在装不了的 · MCP',
    note: '只检测到 Codex：全局时勾上了 markitdown，再改成「项目」——Codex 的 MCP 只能装到全局。卡片成了不可选的画法，它留在右栏里，名字划掉、下面是同一句原因；只剩它，「去汇总」点不了',
    ...CODEX_ONLY,
    catalog: withKeyed,
    drive: inOrder(crowded, pickingMcp('markitdown'), toProject),
    reveal: 'markitdown',
  },
  {
    title: '汇总 · 带 key 的 MCP、装到项目',
    note: 'MCP 一段没有版本、行里没有位置：只有宿主和操作，已配置的写「覆盖」和备注。没有将执行的命令。「注意」里：key 会以明文写进 .mcp.json（说变量名和文件，不说值）、Claude Code 要批准之后才启用、mistral-ocr 缺必填的 key 这次不装',
    ...KEYED_TO_PROJECT,
  },
  {
    title: '汇总 · 各种提醒',
    note: '全局、两个宿主：有会覆盖的、有第三方 Skill、mistral-ocr 缺必填的 key、远程地址的 notion 装进 Codex 时可能当场打开浏览器登录——四条提醒，和终端界面是同一份话；excel 在 Claude Code 里配过，是「覆盖」',
    catalog: withKeyed,
    drive: inOrder(crowded, picking('archify'), pickingThirdParty('guizang-ppt-skill'), pickingMcp('excel', 'notion', 'mistral-ocr'), toKeys, reviewing),
  },
  {
    title: '结果 · 有 MCP',
    note: 'MCP 装上了是就绪色的「已配置」，后面没有话；mistral-ocr 缺必填的 key，每个宿主一行「跳过」和原因',
    catalog: withKeyed,
    commands: 'succeed',
    drive: inOrder(crowded, picking('wizard'), pickingMcp('markitdown', 'mistral-ocr', 'grok-search'), toKeys, filling('grok-search', 'GROK_API_URL', 'GROK_API_KEY'), reviewing, finished),
  },
  {
    title: '结果 · MCP 的命令没能运行',
    note: '添加命令没能起来：失败色的 ✗ 和粗体的「失败」，原因里只有哪一步，没有命令、没有 key',
    catalog: withKeyed,
    drive: inOrder(crowded, pickingMcp('markitdown', 'grok-search'), toKeys, filling('grok-search', 'GROK_API_URL', 'GROK_API_KEY'), reviewing, finished),
  },
  {
    title: '汇总 · 有要逐项决定的覆盖',
    note: '每个条目一段，段里每个宿主一行：宿主、操作（覆盖是留意色粗体）、位置和备注。pr 在 Claude Code 下、writing-for-agents 在 Codex 下不是本工具装的：那一行下面是留意底色的一条「覆盖它」，缺省没勾，写着没勾会怎样；这里勾上了第二个。没有将执行的命令',
    drive: inOrder(summarized, agreeing(1)),
  },
  { title: '汇总 · 1024×768', note: '面板给底下留 280px；位置放不下就在任意处断开，没有横向滚动条', drive: summarized, viewport: NARROW },
  { title: '汇总 · 全是新装', note: '没有要逐项决定的事，也没有提醒：只有各项和底部的两个按钮', drive: inOrder(picking('onetake', 'wizard'), reviewing) },
  {
    title: '汇总 · 装到项目',
    note: '位置写成相对项目目录的路径（.claude/skills/…、.agents/skills/…）；全局装过的这里都是新装',
    drive: inOrder(crowded, toProject, MIXED_PICKS, reviewing),
  },
  {
    title: '汇总 · 有第三方 Skill',
    note: '第三方 Skill 一段没有版本；paper-craft-skills 里每个要装的 skill 一小组、每组每个宿主一行，位置整条看得到。drawio-skill 和 paper-analyzer 的目标位置已有同名目录：操作是覆盖、备注「已有同名目录」、那一行下面有「覆盖它」。「注意」里多一条作者最新版的提醒。没有将执行的命令',
    drive: thirdPartySummarized,
  },
  { title: '汇总 · 有第三方 Skill · 1024×768', note: '位置放不下就在任意处断开，没有横向滚动条', drive: thirdPartySummarized, viewport: NARROW },
  {
    title: '汇总 · 新的一份',
    note: '确认的时候带回的标识对不上（机器上的状态变了，或覆盖的决定改过）：没有装，顶上一条写明这是新的一份、要再确认',
    drive: inOrder(summarized, outdated),
  },
  {
    title: '汇总 · 有工具',
    note: '工具一段没有版本，段里只有一行「执行安装命令」：没有宿主、没有位置，也不列那一行命令。排在 MCP 之后',
    drive: inOrder(WITH_TOOLS, reviewing),
  },
  {
    title: '安装中 · 轮到工具',
    note: '前面的都装完了，轮到 docling：它的命令在终端里跑，这一行是留意底色的一条，粗体写着「正在终端里安装，请看终端」，和别的「正在装」分得开；pandoc 还在等待。工具的行没有宿主',
    commands: 'tool-running',
    drive: toolRunning,
  },
  { title: '安装中 · 轮到工具 · 1024×768', note: '面板收窄：那一句放得下，底部的提醒和「完成」看得见', commands: 'tool-running', drive: toolRunning, viewport: NARROW },
  {
    title: '结果 · 有工具',
    note: 'pandoc 复核通过：就绪色的「已可用」，后面是查到了什么；docling 的命令正常结束了但在可执行路径上找不到它：失败，原因折成两行。「下一步」里是工具的那一句：原因看终端里那条命令自己的输出',
    commands: 'succeed',
    drive: inOrder(WITH_TOOLS, reviewing, finished),
  },
  {
    title: '安装中',
    note: '标题旁边是装完了几项、一共几项，下面一条进度条。装好了的是就绪色的 ✓；onetake 正在下载（转动的小圆环），后面的在等待，名字不加粗。底部一句提醒，「完成」点不了',
    catalog: neverFinishes,
    drive: inOrder(summarized, installing((run) => run.rows.some((row) => row.state === 'running'))),
  },
  { title: '结果 · 全部装好', note: '三格合计，下面每一项一行；原先是别的版本的写两个版本。底部「继续挑选」和「完成」', drive: inOrder(picking('archify', 'explanation', 'onetake'), reviewing, finished) },
  {
    title: '结果 · 有没装上的、有跳过的',
    note: 'explanation 下载中断：失败色的 ✗ 和粗体的「失败」，后面是原因；合计里失败的数字是失败色；最下面一段「下一步」。没同意覆盖的两项是跳过',
    catalog: oneFails,
    drive: inOrder(summarized, finished),
  },
  {
    title: '结果 · 向 GitHub 查询失败',
    note: '出错说明在合计和各行之间：失败色粗体的标题，「原因」「下一步」各一段，话和终端界面是同一份。本仓库的 skill 一个都没装，不在行里',
    catalog: queryLimited,
    drive: inOrder(summarized, finished),
  },
  { title: '键盘焦点', note: '按了三下 Tab：焦点是一圈 2px 的前景色描边，离元素 2px，深浅色下都看得见', tabs: 3 },
  { title: '结束 · 已完成', note: '点了「完成」：一个标题、一句说明，没有任何控件；彩色只落在行首的符号上', ending: 'finished' },
  { title: '结束 · 已改用终端界面', note: '终端上按了 t：页面得知之后连接才断开，不改口成「安装器已退出」；同样没有任何控件', ending: 'switched' },
  { title: '结束 · 安装器已退出', note: '终端上按了 Ctrl+C，页面重连几次连不上', ending: 'exited' },
  { title: '结束 · 口令不对', note: '拿着不对的口令打开：没有画面状态，照浏览器的语言说', ending: 'denied' },
  { title: '英文 · 浏览 ·「推荐」', ...EN },
  { title: '英文 · 浏览 · 条目最多的用途', note: '用途名长的折成两行，条目数留在第一行右边', ...EN, drive: crowded },
  { title: '英文 · 浏览 · 条目最多的用途 · 整张列表', ...EN, drive: crowded, whole: true },
  {
    title: '英文 · 浏览 · 条目最多的用途 · 1024×768',
    note: '最挤的一格：宿主和安装范围连并排一行都放不下，拆成宿主一行、安装范围一行；没有横向滚动条',
    ...EN,
    drive: crowded,
    viewport: NARROW,
  },
  { title: '英文 · 浏览 · 有不可选的条目', ...EN, drive: crowded, reveal: 'officecli' },
  { title: '英文 · 浏览 · 只检测到 Claude Code', ...EN, ...ONE_HOST, drive: crowded },
  { title: '英文 · 浏览 · 一个宿主都没有', ...EN, ...NO_HOSTS, drive: crowded },
  { title: '英文 · 浏览 · 只检测到 Codex', ...EN, ...CODEX_ONLY, drive: crowded, reveal: 'excel' },
  { title: '英文 · 浏览 · 用途下只有外部项目', ...EN, drive: appsOnly },
  { title: '英文 · 浏览 · 已选了几个 · 1024×768', ...EN, drive: inOrder(crowded, MIXED_PICKS), viewport: NARROW },
  {
    title: '英文 · 浏览 · 两个宿主只选一个 · 装到项目 · 1024×768',
    note: '最挤的一格：Install into which AI Agents 和 Install where 各占一行，目录那一行在上面',
    ...EN,
    drive: inOrder(crowded, choosingHost('claude-code', false), toProject),
    viewport: NARROW,
  },
  { title: '英文 · 汇总 · 装到项目', ...EN, drive: inOrder(crowded, toProject, MIXED_PICKS, reviewing) },
  { title: '英文 · 汇总 · 有要逐项决定的覆盖', ...EN, drive: inOrder(summarized, agreeing(1)) },
  { title: '英文 · 浏览 · 有第三方 Skill · 挑其中的 skill', ...EN, drive: inOrder(crowded, THIRD_PARTY_PICKS), reveal: 'paper-craft-skills' },
  { title: '英文 · 汇总 · 有第三方 Skill · 1024×768', ...EN, drive: thirdPartySummarized, viewport: NARROW },
  { title: '英文 · 汇总 · 新的一份 · 1024×768', ...EN, drive: inOrder(summarized, outdated), viewport: NARROW },
  { title: '英文 · 安装中', ...EN, catalog: neverFinishes, drive: inOrder(summarized, installing((run) => run.rows.some((row) => row.state === 'running'))) },
  { title: '英文 · 汇总 · 有工具', ...EN, drive: inOrder(WITH_TOOLS, reviewing) },
  { title: '英文 · 安装中 · 轮到工具 · 1024×768', note: '最挤的一格：英文的那一句长，在窄的面板里折成两行也读得通', ...EN, commands: 'tool-running', drive: toolRunning, viewport: NARROW },
  { title: '英文 · 结果 · 有工具', ...EN, commands: 'succeed', drive: inOrder(WITH_TOOLS, reviewing, finished) },
  { title: '英文 · 结果 · 有没装上的、有跳过的', ...EN, catalog: oneFails, drive: inOrder(summarized, finished) },
  { title: '英文 · 结果 · 向 GitHub 查询失败', ...EN, catalog: queryLimited, drive: inOrder(summarized, finished) },
  { title: '英文 · 填 key', note: '英文的词长：必填的后果那一句折成两行也读得通', ...EN, catalog: withKeyed, drive: KEYS_FILLED },
  { title: '英文 · 汇总 · 带 key 的 MCP、装到项目 · 1024×768', note: 'overwrite 和备注在窄的面板里放得下', ...EN, ...KEYED_TO_PROJECT, viewport: NARROW },
  { title: '英文 · 结束 · 已完成', ...EN, ending: 'finished' },
  { title: '英文 · 结束 · 已改用终端界面', ...EN, ending: 'switched' },
  { title: '英文 · 结束 · 安装器已退出', ...EN, ending: 'exited' },
  { title: '英文 · 结束 · 口令不对', ...EN, ending: 'denied' },
];

// ── 在页面里算的式子 ──────────────────────────────────────────────────────────

// 页面上的东西等这么久还没出现就算场景写错了；安装器退出之后页面要重连几次才改口，所以不能太短
const APPEAR_MS = 5000;
/** 等页面上有了（present 为假时是没有了）这样的元素 */
const waits = (selector: string, present: boolean): string => `new Promise((resolve, reject) => {
  const deadline = Date.now() + ${APPEAR_MS};
  const look = () => {
    if (Boolean(document.querySelector(${JSON.stringify(selector)})) === ${present}) resolve(true);
    else if (Date.now() > deadline) reject(new Error(${JSON.stringify(`页面上的 ${selector} 一直${present ? '没有出现' : '还在'}`)}));
    else setTimeout(look, 10);
  };
  look();
})`;
const appears = (selector: string): string => waits(selector, true);
const vanishes = (selector: string): string => waits(selector, false);
// 改了窗口大小、换了深浅色紧接着就截，截到的是画了一半的：等两帧再加一百来毫秒，给出页面这时的宽高
const SETTLED = `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve([innerWidth, innerHeight]), 120))))`;
/** 把页面上所有的动画定格在第几毫秒。时间只许往前拨：往回拨过了某段动画的开头，页面会当它播完了 */
const frozenAt = (ms: number): string => `(() => {
  const animations = document.getAnimations();
  const played = Math.max(0, ...animations.map((animation) => Number(animation.currentTime)));
  if (played > ${ms}) throw new Error('开场已经播到第 ' + Math.round(played) + ' 毫秒，过了要定格的第 ${ms} 毫秒');
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = ${ms};
  }
})()`;
/**
 * 把名字是它的那张卡片滚到窗口中间。先等两帧：页面刚画出来时「换了一张列表就回到顶部」那个效果还没跑，
 * 紧接着滚会被它拨回去
 */
const revealed = (name: string): string => `new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const card = [...document.querySelectorAll('.card')].find((candidate) => candidate.querySelector('h3')?.textContent === ${JSON.stringify(name)});
  if (!card) return reject(new Error(${JSON.stringify(`列表里没有名字是 ${name} 的卡片`)}));
  card.scrollIntoView({ block: 'center' });
  resolve(true);
})))`;
// 像用户那样往有焦点的输入框里打进假装的 key：打进去的每个字都在输入框里，页面上看到的应当只有圆点
const TYPE_FAKE_KEY = `(() => {
  document.execCommand('insertText', false, ${JSON.stringify(FAKE_KEY)});
  if (document.activeElement.value !== ${JSON.stringify(FAKE_KEY)}) throw new Error('假装的 key 没有打进输入框');
})()`;
// 离开正在输入的那个输入框（浏览器这时把内容交给页面，页面发给安装器并清空），等「已填」的行多出一行
const LEAVE_AND_SETTLE = `new Promise((resolve, reject) => {
  const before = document.querySelectorAll('.dialog .filled').length;
  document.activeElement.blur();
  const deadline = Date.now() + ${APPEAR_MS};
  const look = () => {
    if (document.querySelectorAll('.dialog .filled').length > before) resolve(true);
    else if (Date.now() > deadline) reject(new Error('打进去的 key 发出去之后，这一行一直没有换成「已填」'));
    else setTimeout(look, 10);
  };
  look();
})`;
/** 假装填的 key 出现在了不该出现的地方：生成物不留 */
class KeyLeaked extends Error {
  constructor(where: string) {
    super(`假装填的 key 出现在了${where}`);
  }
}
// 页面的整份 HTML，连同每个输入框里现在的值（值不在 HTML 里）
const MARKUP_AND_VALUES = `document.documentElement.outerHTML + '\\n' + [...document.querySelectorAll('input, textarea')].map((field) => field.value).join('\\n')`;
// 中间一栏的内容有多高：窗口拉到这么高，整张列表就都在屏幕上
const LIST_HEIGHT = `document.querySelector('.list').scrollHeight`;

// ── 驱动安装器，拍下页面 ──────────────────────────────────────────────────────

interface Frame {
  scene: Scene;
  /** 两张图的文件名前缀，也是这一格的序号 */
  prefix: string;
  viewport: Viewport;
  /** 深色、浅色各一张图的文件名，照 SCHEMES 的先后 */
  files: string[];
  /** 页面上的文字 */
  text: string;
}

// 每个场景一个假的主目录、临时目录和可执行路径，连同 Chrome 的用户数据目录，全部放在 scratch 下面，结束时一并删掉
let scratch = '';
const scratchDir = (label: string): string => mkdtempSync(join(scratch, `${label}-`));
const target = fileURLToPath(new URL('../.preview/web/', import.meta.url));

// 网页界面不在终端上提问；问了就是退回了终端界面，场景写错了
const refuse = (): Promise<never> => Promise.reject(new Error('网页界面的预览里安装器不该在终端上提问'));
// 终端上的输出不要：预览只看页面
const quiet = { isTTY: true, write: (): void => {} };

/** 拍一格。prefix 是这一格两张图的文件名前缀（它在场景表里的序号）。 */
async function shoot(chrome: Chrome, scene: Scene, builtWeb: string, prefix: string): Promise<Frame> {
  const lang = scene.lang ?? 'zh';
  const { bin, home, project } = stageWorld({ ...LIVED_IN, ...scene }, scratchDir);
  const interrupt = new AbortController();
  let opened = (_url: string): void => {};
  const link = new Promise<string>((resolve) => (opened = resolve));
  let pressT = (): void => {};
  let switched = false;
  const exited = runInstaller({
    argv: ['--lang', lang],
    env: { LANG: 'zh_CN.UTF-8', TERM: 'xterm-256color', PATH: bin, OXY_TOOLS_WEB: '1' },
    platform: 'darwin',
    systemLocale: 'zh-CN',
    stdout: quiet,
    stderr: quiet,
    stdinIsTTY: true,
    catalogSource: scene.catalog ?? worst,
    homeDir: home,
    projectDir: project,
    tempDir: scratchDir('tmp'),
    webDir: builtWeb,
    // 预览里安装器的页面（扮演的那一个）一直连着，用不上这个时限
    pageGraceMs: 5000,
    interrupt: interrupt.signal,
    // 预览从不真的执行命令，也不真的打开浏览器：链接打开器只记下网页界面的网址
    runCommand: (_command, _args, how) =>
      scene.commands === undefined
        ? Promise.reject(new Error('网页界面的预览不执行命令'))
        : scene.commands === 'tool-running' && how?.shell
          ? new Promise(() => {})
          : Promise.resolve({ exitCode: 0 }),
    prompter: {
      // 改用了终端界面之后的第一问（主菜单）上按 Ctrl+C：页面已经得知了，安装器到此为止
      select: () => (switched ? Promise.reject(new PromptAborted()) : refuse()),
      checkbox: refuse,
      confirm: refuse,
      password: refuse,
      // 终端上待命的那一行：收回就了结；场景要「已改用终端界面」时由 pressT 按下 t
      standby: (question, withdraw) =>
        new Promise((resolve) => {
          withdraw.addEventListener('abort', () => resolve(undefined));
          pressT = (): void => {
            switched = true;
            resolve(question.answers['t']);
          };
        }),
    },
    openLink: async (url) => opened(url),
  });
  // 这一格开了什么，收场时照相反的先后收掉；哪一样收不掉都不耽误后面的
  const cleanups: (() => unknown)[] = [() => exited, () => interrupt.abort()];
  try {
    const url = await Promise.race([link, exited]);
    if (typeof url === 'number') throw new Error(`安装器没有打开网页界面就退出了，退出状态 ${url}`);
    const page = await openPage(url);
    cleanups.push(() => page.dispose());
    const tab = await chrome.newTab();
    cleanups.push(() => tab.close());

    // 这次运行里开场已经播过了：页面直接出现
    if (scene.intro === undefined) await page.send({ type: 'intro-seen' });
    await scene.drive?.(page);

    let { width, height } = scene.viewport ?? DESKTOP;
    const reducedMotion = scene.intro === 'reduced-motion';
    await tab.language(lang === 'zh' ? 'zh-CN' : 'en-US');
    await tab.viewport(width, height);
    await tab.system(SCHEMES[0][0], reducedMotion);
    await tab.open(scene.ending === 'denied' ? url.replace(/token=.*/, 'token=not-the-token') : url);
    await tab.evaluate(appears(scene.ending === 'denied' ? '.ended' : '.shell'));
    if (typeof scene.intro === 'number') {
      await tab.evaluate(appears('.intro'));
      await tab.evaluate(frozenAt(scene.intro));
    }
    if (scene.intro === 'skipped') {
      await tab.evaluate(appears('.intro'));
      await tab.press('Escape');
      await tab.evaluate(vanishes('.intro'));
    }
    if (scene.ending === 'finished') await page.send({ type: 'finish' });
    if (scene.ending === 'switched') pressT();
    if (scene.ending === 'exited') interrupt.abort();
    if (scene.ending) await tab.evaluate(appears('.ended'));
    for (let pressed = 0; pressed < (scene.tabs ?? 0); pressed++) await tab.press('Tab');
    if (scene.typing) {
      await tab.evaluate(appears('.dialog input:focus'));
      await tab.evaluate(TYPE_FAKE_KEY);
    }
    if (scene.whole) {
      height = await tab.evaluate<number>(LIST_HEIGHT);
      await tab.viewport(width, height);
    }
    if (scene.reveal !== undefined) await tab.evaluate(revealed(scene.reveal));

    const files: string[] = [];
    for (const [scheme] of SCHEMES) {
      await tab.system(scheme, reducedMotion);
      const [settledWidth, settledHeight] = await tab.evaluate<[number, number]>(SETTLED);
      if (settledWidth !== width || settledHeight !== height) {
        throw new Error(`页面是 ${settledWidth}×${settledHeight}，要的窗口是 ${width}×${height}`);
      }
      const file = `${prefix}-${scheme}.png`;
      writeFileSync(join(target, file), await tab.screenshot());
      files.push(file);
    }
    // 打进输入框的那个值发出去：离开输入框，等这一行换成「已填」
    if (scene.typing) await tab.evaluate(LEAVE_AND_SETTLE);
    // 假装填的 key 一处都不许有：页面的 HTML、每个输入框里的值、这一路从安装器收到的全部东西
    const everything = [await tab.evaluate<string>(MARKUP_AND_VALUES), page.received()].join('\n');
    if (everything.includes(FAKE_KEY)) throw new KeyLeaked('页面或安装器的答复里');
    return { scene, prefix, viewport: { width, height }, files, text: await tab.evaluate<string>('document.body.innerText') };
  } finally {
    for (const cleanup of cleanups.reverse()) await Promise.resolve().then(cleanup).catch(() => undefined);
  }
}

// ── 拼成 HTML ─────────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#e4e5e7;color:#1d1d1f;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
main{margin:0 auto;padding:22px 22px 60px}
h1{font-size:18px;margin:0 0 4px}
main>p{margin:0 0 22px;color:#6b6b70;font-size:13px}
.scene{margin:0 0 30px}
.scene h2{margin:0 0 8px;font-size:14px;font-weight:600;display:flex;gap:10px;align-items:baseline}
.scene h2 small{font-weight:400;color:#6b6b70;font-size:13px}
.scene h2 .size{flex:none;font-weight:400;font-size:12px;color:#6b6b70;border:1px solid #c4c5c9;border-radius:4px;padding:0 5px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.pair figure{margin:0;justify-self:start}
.pair a{display:block;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.16),0 6px 18px rgba(0,0,0,.10)}
.pair img{display:block;max-width:100%;height:auto}
.pair figcaption{margin-top:6px;font-size:12px;color:#6b6b70}
details{margin:8px 0 0;font-size:12px;color:#6b6b70}
summary{cursor:pointer}
pre{max-height:360px;overflow:auto;margin:6px 0 0;padding:10px 12px;border-radius:8px;background:#f4f4f5;color:#1d1d1f;white-space:pre-wrap;word-break:break-all;font:12px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace}
`;

function preview(frames: Frame[], browser: string): string {
  const sections = frames.map(({ scene, prefix, viewport, files, text }) => {
    const shots = files
      .map((file, index) => {
        const scheme = SCHEMES[index]?.[1] ?? '';
        const label = escapeHtml(`${scene.title} · ${scheme}`);
        return `<figure><a href="${file}" title="${label}"><img src="${file}" width="${viewport.width}" height="${viewport.height}" alt="${label}" loading="lazy"></a><figcaption>${scheme} · ${file}</figcaption></figure>`;
      })
      .join('');
    const note = scene.note ? `<small>${escapeHtml(scene.note)}</small>` : '';
    const size = `<span class="size">${viewport.width}×${viewport.height}</span>`;
    return `<section class="scene" id="${prefix}"><h2>${prefix} · ${escapeHtml(scene.title)}${size}${note}</h2><div class="pair">${shots}</div><details><summary>这一格页面上的文字</summary><pre>${escapeHtml(text)}</pre></details></section>`;
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>oxy-tools 网页界面的预览</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>oxy-tools 网页界面的预览</h1>
<p>真实的页面在真实的浏览器（${escapeHtml(browser)}）里渲染出来的画面，共 ${frames.length} 格；每格左为深色、右为浅色，点开是原图。对照视觉方向「利落」核对。</p>
${sections.join('\n')}
</main>
</body>
</html>
`;
}

// ── 生成 ──────────────────────────────────────────────────────────────────────

const executable = findChrome();
if (!executable) {
  console.error(
    process.env['OXY_TOOLS_CHROME']
      ? `环境变量 OXY_TOOLS_CHROME 给的路径上没有东西：${process.env['OXY_TOOLS_CHROME']}`
      : '没有找到 Chrome、Chromium 或 Edge：网页界面的预览要用本机装着的浏览器来拍。装在别处的话，用环境变量 OXY_TOOLS_CHROME 给出可执行文件的路径。',
  );
  process.exit(1);
}
scratch = mkdtempSync(join(tmpdir(), 'oxy-tools-preview-web-'));
let chrome: Chrome | undefined;
try {
  const builtWeb = await buildWeb();
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  chrome = await launchChrome(executable, scratchDir('chrome'));
  const frames: Frame[] = [];
  for (const [index, scene] of scenes.entries()) {
    try {
      frames.push(await shoot(chrome, scene, builtWeb, String(index + 1).padStart(2, '0')));
    } catch (error) {
      // 假装的 key 漏了：已经拍下的图一张都不留
      if (error instanceof KeyLeaked) rmSync(target, { recursive: true, force: true });
      throw new Error(`「${scene.title}」没有拍成：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  const html = preview(frames, chrome.product);
  if (html.includes(FAKE_KEY)) throw new KeyLeaked('生成的预览页里');
  writeFileSync(join(target, 'index.html'), html);
  console.log(`${frames.length} 格 → ${join(target, 'index.html')}`);
} finally {
  await chrome?.close();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
