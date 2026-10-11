// 网页界面的预览（仅供开发）：经安装器入口按预设场景把安装器驱动到要看的状态，让本机装着的 Chrome 打开它的网页界面，
// 把真实的页面拍下来——每个场景一格，深色和浅色各一份，连同每格页面上的文字拼成一个离线的 HTML 页面。
// 生成物在 .preview/web/ 下，不提交，不随 npm 包发布。预览不碰真实的主目录和网络，不真的执行命令。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogError, type CatalogSource } from '../src/catalog.ts';
import { runInstaller } from '../src/installer.ts';
import type { Prompter } from '../src/prompter.ts';
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
   * 页面画出来之后让它走到哪种结束画面：finished 是发了「完成」，exited 是安装器退出、页面重连不上，
   * denied 是拿着不对的口令打开
   */
  ending?: 'finished' | 'exited' | 'denied';
  /** 页面画出来之后按几下 Tab：看键盘焦点 */
  tabs?: number;
  /** 页面画出来之后把名字是它的那张卡片滚到窗口中间 */
  reveal?: string;
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
/** 勾上这几个第三方 Skill */
const pickingThirdParty =
  (...names: string[]): Drive =>
  async (page) => {
    for (const name of names) await page.send({ type: 'pick', kind: 'thirdParty', name, on: true });
    await page.until((state) => names.every((name) => state.selected.some((entry) => entry.name === name)));
  };
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
// 四种状态各一个，外加一个另一个用途下的（onetake 在「UI 设计、图像与视频」下，这张列表里看不到它）
const MIXED_PICKS = picking('archify', 'explanation', 'pr', 'writing-for-agents', 'onetake');
const summarized = inOrder(crowded, MIXED_PICKS, reviewing);
// 两条第三方 Skill：只含一个 skill 的 drawio-skill（两个宿主下都装过了）和含三个的 paper-craft-skills，挑其中两个
// （paper-analyzer 在 Claude Code 下装过了），外加一个本仓库的 skill
// 先勾本仓库的那一个：picking 等的是「已选里正好这几个」
const THIRD_PARTY_PICKS = inOrder(picking('wizard'), pickingThirdParty('drawio-skill', 'paper-craft-skills'), choosing('paper-craft-skills', 'paper-analyzer', 'paper-comic'));
const thirdPartySummarized = inOrder(crowded, THIRD_PARTY_PICKS, reviewing);

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
  { title: '英文 · 结果 · 有没装上的、有跳过的', ...EN, catalog: oneFails, drive: inOrder(summarized, finished) },
  { title: '英文 · 结果 · 向 GitHub 查询失败', ...EN, catalog: queryLimited, drive: inOrder(summarized, finished) },
  { title: '英文 · 结束 · 已完成', ...EN, ending: 'finished' },
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
const noQuestions: Prompter = { select: refuse, checkbox: refuse, confirm: refuse, password: refuse };
// 终端上的输出不要：预览只看页面
const quiet = { isTTY: true, write: (): void => {} };

/** 拍一格。prefix 是这一格两张图的文件名前缀（它在场景表里的序号）。 */
async function shoot(chrome: Chrome, scene: Scene, builtWeb: string, prefix: string): Promise<Frame> {
  const lang = scene.lang ?? 'zh';
  const { bin, home, project } = stageWorld({ ...LIVED_IN, ...scene }, scratchDir);
  const interrupt = new AbortController();
  let opened = (_url: string): void => {};
  const link = new Promise<string>((resolve) => (opened = resolve));
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
    interrupt: interrupt.signal,
    // 预览从不真的执行命令，也不真的打开浏览器：链接打开器只记下网页界面的网址
    runCommand: () => Promise.reject(new Error('网页界面的预览不执行命令')),
    prompter: noQuestions,
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
    if (scene.ending === 'exited') interrupt.abort();
    if (scene.ending) await tab.evaluate(appears('.ended'));
    for (let pressed = 0; pressed < (scene.tabs ?? 0); pressed++) await tab.press('Tab');
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
      throw new Error(`「${scene.title}」没有拍成：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  writeFileSync(join(target, 'index.html'), preview(frames, chrome.product));
  console.log(`${frames.length} 格 → ${join(target, 'index.html')}`);
} finally {
  await chrome?.close();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
