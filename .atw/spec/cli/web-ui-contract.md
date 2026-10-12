# 网页界面的契约

> 网页界面的页面与安装器之间说什么（意图、画面状态）、本机的那个网页守哪几道、它什么时候起来什么时候关。页面该长什么样见 [网页界面的设计](./web-ui-design.md)；入口怎么定下用哪个界面、测试架子怎么扮演浏览器，见 [入口与测试](./installer-entry.md)。
> 任务 `10-11-installer-web-ui` 逐张工单写成的，各段标题后面括号里是哪张工单：骨架（起得来、连得上、守得住、退得出）、逛目录（左栏的「推荐」和各个用途、当前那张列表里的条目和它们的状态、开场动画播过没有、页面上换语言），勾选本仓库的 skill、已选、汇总、确认、进度、结果、继续挑选；页面上选装进哪些宿主、装到全局还是项目；第三方 Skill 和本仓库的 skill 一起勾、一起确认、一起装（含多个 skill 的当场挑其中哪几个）；MCP 也一起勾、一起装，要 key 的在页面上填；页面关了、刷新、终端上按 `t` 改用终端界面（「生命周期」）；工具也勾得上，轮到它时命令在终端里跑（「工具」）；开场引导答过没有（工单 16，验收后加的）。**每加一种意图、画面状态里每多一块，先改这里。**

---

## Scenario: 本机的网页

### 1. Scope / Trigger

本机的这个网页能替用户执行安装命令，所以它必须拒绝别的网站和别的机器发来的请求（ADR-0004）。凡是加一条路径、一种意图、画面状态里的一个字段，或动任何一个答复头，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/web-protocol.ts —— 页面和安装器共用，两边对不上在类型检查时就报出来。
// 这个文件不引用别的模块：页面的类型检查（web/tsconfig.json）不带 Node 的类型
export type Intent =
  | { type: 'finish' }
  | { type: 'open'; list: string }   // 换一张列表看：list 是 menu 里某一行的 id
  | { type: 'intro-seen' }           // 页面开始播开场动画了（或决定不播）：这次运行里不再播
  | { type: 'guide-answered' }       // 开场引导答完了（用户点了「开始挑选」）：这次运行里不再出现
  | { type: 'lang'; lang: Lang }     // 换语言：安装器按新的语言重发画面状态；终端上的语言不变
  | { type: 'pick'; kind: PickableKind; name: string; on: boolean } // 勾上或去掉一个条目：kind、name 是画面状态里那个条目的
  | { type: 'choose'; entry: string; skill: string; on: boolean }   // 含多个 skill 的第三方 Skill：要（或不要）其中的一个 skill。entry 是勾上了的那个条目的名字，skill 是它 skills 里某一项的名字
  | { type: 'review' }               // 要汇总：已选里有要 key 的 MCP 时先到填 key，在填 key 上再发一次才是汇总
  | { type: 'key'; mcp: string; variable: string; value: string } // 填（或换）一个 key：mcp、variable 是画面状态 keys 里的；value 是值，只走这一个请求的正文
  | { type: 'overwrite'; item: string; on: boolean }  // 汇总里要逐项决定的那一项覆盖不覆盖：item 是那一行的 overwrite.id
  | { type: 'install'; summary: string }              // 确认安装：summary 是页面上那份汇总的标识
  | { type: 'revise' }               // 从汇总（或填 key）返回修改
  | { type: 'continue' }             // 装完之后继续挑选
  | { type: 'host'; host: string; on: boolean }  // 装进（或不装进）一个宿主：host 是 target.choices 里那一项的 id
  | { type: 'scope'; scope: Scope }; // 装到全局还是项目
export type PickableKind = 'skill' | 'thirdParty' | 'mcp' | 'tool';  // 勾得上的类型：四种组件
export type Lang = 'zh' | 'en';
export interface ViewState {
  lang: Lang;                       // 页面现在的语言：起初是系统语言或 --lang 的，之后是页面上换过的
  language: { label: string; options: { id: Lang; name: string }[] }; // 切换语言的控件：名字和各项是终端界面语言提问的那一份文案
  stage: 'open' | 'finished' | 'terminal'; // finished：用户点了「完成」，安装器随后退出；terminal：终端上按了 t，改用终端界面，本机的网页随后关掉
  version: string;
  introSeen: boolean;               // 开场动画这次运行里播过没有
  guideAnswered: boolean;           // 开场引导这次运行里答过没有；一个宿主都没检测到时起初就是 true
  machine: {
    hosts: { name: string; detected: boolean; status?: string }[]; // status 是没检测到时名字后面的词
    catalog: string[];              // 目录里各类条目的数量，每类一段；一个条目都没有时是那一句话
    noHosts?: string;               // 一个宿主都没检测到时的那一句提醒，和终端界面本机信息里的是同一句
    skipped?: string;               // 有条目因为格式有误被跳过时的那一句
  };
  target: {                         // 装进哪些宿主、装到哪里，连同这两样在页面上的名字（和终端界面的提问同一份文案）
    hostsLabel: string;
    choices: { id: string; name: string; on: boolean }[];         // 检测到的宿主，照本机信息里的先后；id 放进 host 意图，on 是这一轮要装进它
    hosts: string[];                                              // 要装进的宿主的名字（choices 里 on 的那些）：条目的 statuses 与它一一对应
    scopeLabel: string; scopes: { id: Scope; name: string }[]; scope: Scope; // scopes 是安装范围有哪几种，照显示的先后
    project: { note: string; dir: string };                       // 装到项目是装到哪个目录：note 是终端界面「项目」那一项后面的那句，dir 是目录（主目录里的以 ~ 开头）
  };
  menu: MenuRow[];                  // 左栏的行：「推荐」（里面有条目时）在最前，然后是有条目的各个用途
  listing?: ListingView;            // 正在看的那张列表；目录里一个条目都没有时没有
  selected: SelectedView[];         // 已选的条目，照勾选的先后
  keys?: KeysView;                  // 填 key：要了汇总、已选里有要 key 的 MCP 时先到这里。里面只有「填了没有」，没有值
  summary?: SummaryView;            // 汇总：要了汇总、还没确认安装时有
  run?: RunView;                    // 这一批的进度与结果：确认安装之后有，点了「继续挑选」之后没有
}
export interface MenuRow { id: string; name: string; count: number; recommended?: true } // recommended：这一行是「推荐」
export interface ListingView {
  id: string;                       // menu 里的哪一行
  sections: SectionView[];          // 组件按类型分开：Skill、第三方 Skill、MCP、工具；没有条目的类型不在里面
  apps?: { title: string; note: string; entries: AppView[] }; // 外部项目另成一处；没有就没有这一块
}
export interface SectionView { kind: 'skill' | 'thirdParty' | 'mcp' | 'tool'; title: string; note?: string; notices?: string[]; entries: ComponentView[] } // notices 只有 MCP 那一区有：哪个宿主的 MCP 只能装到全局、哪个宿主的配置读不了
export interface ComponentView {
  name: string;
  about: string;                    // 完整的说明，不截断
  mark?: string;                    // 「推荐」的标记，要标时是那个词；「推荐」那张列表里每一条都是，不标
  key?: string;                     // 要 key 的 MCP 才有的标记：有必填的变量是「要填 key」，只有可选的是「可选的 key」
  statuses: StatusView[];           // 每个要装进的宿主一段（与 target.hosts 一一对应）；工具只有一段，没有 host
  unavailable?: string;             // 不可选的原因；有它就勾不上
  picked?: true;                    // 已经勾上了
  skills?: SkillChoicesView;        // 含多个 skill 的第三方 Skill 才有：里面的各个 skill，页面在勾上之后画成清单让用户挑
}
export interface SkillChoicesView {
  lead: string;                     // 清单上面那一句：终端界面那一问的话（「paper-kit 里有 3 个 skill，选择要装的」）
  entries: { name: string; about: string; statuses: StatusView[]; chosen?: true }[]; // 每个 skill：名字、完整的说明、每个要装进的宿主一段状态（未装、已装、不支持）、挑了没有
}
export interface StatusView { host?: string; text: string; tone: Tone; rest?: string } // rest：词后面不上色的一段（版本、装了几个）
export type Tone = 'ready' | 'attention' | 'faint' | 'plain';
export type Scope = 'global' | 'project';
export interface AppView { name: string; about: string; url: string; mark?: string }
export interface SelectedView {
  kind: PickableKind; name: string;
  type: string;                     // 类型写出来的词（Skill、第三方 Skill、MCP、工具）
  detail?: string;                  // 含多个 skill 的第三方 Skill 挑了几个：「3 个 skill 里挑了 2 个」
  key?: { text: string; tone: Tone }; // 要 key 的 MCP：必填的还有没填的是「要填 key」（留意），填过了是「key 已填」（就绪）；只有可选的、一个都没填时没有
  unavailable?: string;             // 这一项现在不进汇总的原因：在现在所选的宿主和范围下装不了（和卡片上的是同一句），或含多个 skill 而一个都没挑（「一个 skill 都没挑，这一条不装」）
}
export interface KeysView { entries: KeyEntryView[] }  // 已选里每个会装的、要 key 的 MCP 一段，照勾选的先后
export interface KeyEntryView { mcp: string; purpose: string; variables: KeyVariableView[] } // mcp 是名字（放进 key 意图），purpose 是它所在的用途的名字
export interface KeyVariableView {
  name: string;                     // 变量名：放进 key 意图
  required: boolean;
  need: string;                     // 「必填」或「可选」
  about: string;                    // 这个变量是做什么用的
  url: string;                      // 去哪申请
  filled?: string;                  // 这次运行里填过了才有，是那个词「已填」。画面状态里没有值，也没有它的长度
  blank: string;                    // 不填会怎样：必填的是「不填就不装 <MCP>，其余照常装」，可选的是「留空则不设置这个变量」
}
export interface SummaryView {
  id: string;                       // 这份汇总的标识：确认安装时带回
  title: string;                    // 「将安装 N 项」，N 是条目数
  entries: SummaryEntryView[];      // 每个要装的条目一段，照执行的先后
  notices: string[];                // 提醒，和终端界面的汇总是同一份话
  revise: string; install: string;  // 两个按钮上的字：终端界面那一问里的「返回修改」「开始安装」
  renewed?: true;                   // 上一次确认没有照办（状态变了，或带的是旧标识）：这是新的一份，要再确认
}
export interface SummaryEntryView { name: string; type: string; version?: string; rows: SummaryRowView[] } // version 是要装的版本，第三方 Skill、MCP 和工具没有；rows 每个宿主一行，第三方 Skill 是每个要装的 skill 在每个支持它的所选宿主下一行，MCP 是每个装得了它的所选宿主一行，工具只有一行
export interface SummaryRowView {
  skill?: string;                   // 第三方 Skill 才有：这一行是条目里的哪个 skill。页面把 skill 相同的相邻几行归成一小组
  host?: string;                    // 工具的行没有：它不装进宿主
  action: string;                   // 新装、覆盖；MCP 的状态未知时是添加；工具是执行安装命令
  overwrites?: true;                // 这一行会覆盖已有的东西
  location?: string;                // 给用户看的位置；MCP 和工具的行没有（和终端界面那两张小表一样没有「位置」）
  note?: string;                    // 备注：重装 1.0.0、1.0.0 → 1.0.1、非本工具安装、已有同名目录、已配置先移除再添加、状态未知先尝试移除同名配置
  overwrite?: { id: string; agreed: boolean }; // 要逐项决定覆盖不覆盖的才有；缺省没同意
}
export interface RunView {
  title: string;                    // 装着的时候是「正在安装」，装完是「结果」
  done: boolean;
  loading?: string;                 // 正在向 GitHub 查询时的那一句
  failure?: FailureView;            // 这一批里出的错（向 GitHub 查询失败）
  rows: RunRowView[];               // 每一项一行，照执行的先后
  totals?: { label: string; succeeded: TotalView; failed: TotalView; skipped: TotalView }; // 装完才有
  next?: { label: string; lines: string[] }; // 装完之后有没装上的才有：「下一步」和它下面的话
}
export interface RunRowView {
  name: string; host?: string;      // 工具的行没有 host
  state: 'waiting' | 'running' | 'succeeded' | 'failed' | 'skipped';
  text: string;                     // 等待、正在下载（本仓库的 skill）、正在安装（第三方 Skill）、正在配置（MCP）、这一项正在终端里安装，请看终端（工具）、已安装、已配置（MCP）、已可用（工具）、失败、跳过
  rest?: string;                    // 词后面的话：版本、原因；第三方 Skill 装上了而命令没有正常结束时是命令的结局（「安装命令退出状态 1」）；MCP 装上了没有；工具是查到了什么和命令的结局
  terminal?: true;                  // 这一项正在终端里装（工具）：命令的输入输出接在终端上，页面把它和别的「正在装」画得分得开
}
export interface TotalView { count: number; word: string }
export interface FailureView {      // 出错说明，和终端界面是同一份话、同一个结构
  title: string;                    // 以「出错：」开头
  cause: { label: string; text: string };
  location?: string;                // 出问题的网址或路径
  next: { label: string; lines: string[] };
}

// cli/src/web-server.ts —— 只管 HTTP：静态文件、那几道检查、长连接、收意图
export interface WebServer { port: number; push(state: ViewState): void; close(): Promise<void>; closeNow(): void }
export function startWebServer(options: {
  webDir: string; token: string;
  state: () => ViewState;                 // 新连上的页面拿到的那一份
  intent: (raw: unknown) => boolean;      // 认不出来的意图返回 false
  pages: (count: number) => void;         // 连着的长连接的条数变了：每连上、断开一条调一次。「页面还开着」就看它
}): Promise<WebServer>;                    // 静态文件读不到、监听不了时拒绝

// cli/src/web-view.ts —— 把目录和本机的现状写成画面状态里的 menu 和 listing：用的是两套界面共用的那几块和同一份文案
export function menuOf(catalog: Catalog, lang: Lang): MenuRow[];
export function listingView(machine: Machine, catalog: Catalog, id: string, hosts: readonly Host[], scope: Scope, lang: Lang, picked: ReadonlySet<object>, chosen: ReadonlyMap<ThirdPartySkill, ReadonlySet<SourcedSkill>>): ListingView | undefined; // id 不在 menu 里时没有；条目的状态现探测

// cli/src/availability.ts、cli/src/notice-text.ts —— 列表里 MCP 那几栏的说明，两套界面共用：前一个数出是哪几个宿主，后一个写成那两句
export function mcpColumnHosts(hosts: readonly Host[], mcps: ListingStatus['mcps']): { globalOnly: Host[]; unreadable: Host[] };
export function mcpColumnNoticeTexts(t: Messages, hosts: { globalOnly: readonly { name: string }[]; unreadable: readonly { name: string }[] }): string[];

// cli/src/status-text.ts —— 状态和不可选的原因写成哪个词、是什么含义。两套界面共用：终端界面照含义上样式码，网页界面原样放进画面状态
export interface StatusText { text: string; tone: Tone; rest?: string }
export function skillStatusText(t: Messages, status: SkillStatus, listed: string, arrow: string): StatusText;
export function thirdPartyStatusText(t: Messages, status: ThirdPartyStatus): StatusText;
export function mcpStatusText(t: Messages, status: McpStatus): StatusText;
export function toolStatusText(t: Messages, status: ToolStatus): StatusText;
export function unavailableReason(t: Messages, unavailable: Unavailable): string;
export const versionChange: (installed: string, listed: string, arrow: string) => string; // 「2.0 → 2.3」的写法只此一份，终端界面的汇总和结果也用它

// cli/src/web-ui.ts —— 网页界面这一边的流程：状态在这里，意图在这里变成状态
export type WebUiOutcome = 'finished' | 'closed' | 'terminal' | { unavailable: 'server' | 'browser' };
// finished 是点了「完成」，closed 是页面关了：都以 0 退出。terminal 是终端上按了 t：调用方从语言提问接着走终端界面
export function runWebUi(options: …): Promise<WebUiOutcome>; // 被 Ctrl+C 打断时抛 Interrupted（待命的提问上按的是 PromptAborted）；options.runtime 是执行要的那些（和终端界面交给「执行」的是同一份），options.prompter 只用来问待命的提问，options.pageGraceMs 是页面全都断开之后等多久

// cli/src/web-install.ts —— 把共用的「算计划」「执行」接到画面状态上：计划写成汇总，进度记成一行行的结局
export function decided(plan: Plan, agreed: ReadonlySet<string>): Plan; // 要逐项决定的覆盖里没同意的标成不装；agreed 是同意了的那几项的标识
export function summaryId(plan: Plan): string;                          // 一份标过决定的计划的标识：取摘要，与语言无关
export function summaryView(t: Messages, plan: Plan): SummaryView;      // 把标过决定的计划写成汇总
export interface Batch { rows: …; loading: boolean; failure?: Failure; done: boolean } // 一批的进度：画面状态从它现算
export function trackBatch(plan: Plan, changed: () => void, ui: Pick<Ui, 'toolSections'>): { batch: Batch; progress: Progress }; // progress 交给共用的「执行」，每变一次调一次 changed；轮到工具时它的分区经 ui 打在终端上
export function settleBatch(batch: Batch, failure?: Failure): void;     // 这一批结束了；failure 是执行中出的意料之外的错
export function runView(t: Messages, platform: NodeJS.Platform, batch: Batch): RunView;
export function reportBatch(batch: Batch, ui: Pick<Ui, 'failure' | 'installation'>): void; // 把装完的一批的结局照先后重报给呈现层：安装中页面关了，结果打在终端上
```

页面的源码在 `cli/web/`（入口 `main.tsx`，逛目录的三栏 `browse.tsx`，汇总与进度、结果的面板 `panel.tsx`，填 key 的对话框 `keys.tsx`，开场动画和开场引导 `intro.tsx`，大标志 `logo.tsx`，页面自己的文字 `text.tsx`；`index.html`、`style.css`、`favicon.svg`，另有它自己的 `tsconfig.json`），由 `cli/scripts/build-web.ts` 用 esbuild 打成 `dist/web/` 下的四个静态文件：`index.html`、`app.js`、`app.css`、`favicon.svg`（`index.html` 和 `favicon.svg` 是原样拷过去的）。Preact 和 esbuild 都是开发依赖，运行时依赖一个都不加；构建产物不提交（ADR-0001）。

### 3. Contracts

**状态在安装器这边。** 页面是它的一个显示：页面连上时收到整份画面状态，之后每次变化再收到一整份；刷新，或拿着同一个网址再开一个标签页，看到的是同一份。页面不存任何东西（不用 `localStorage`、cookie）。

**算画面状态、办意图的时候不许抛。** 它们是在本机网页的请求处理函数里被调用的（`web-server.ts` 的 `state()`、`intent()`），那里没有接住的错会让整个安装器退出。现在靠的是底下的探测各自把「读不了」当成一种状态（配置读不了是「未知」，目录不在是「未装」）；这两条路上会失败的事（算计划、下载、执行）不往外抛：失败变成画面状态里的出错说明（一批里意料之外的错经 `run-plan.ts` 的 `unexpected` 写成 `run.failure`）。以后再往这两条路上加会失败的事，照这一条。

安装器记着的只有会变的那几样（`web-ui.ts` 的 `Session`）：页面的语言、收场了没有、走到哪一步、开场动画播过没有、开场引导答过没有、正在看哪张列表、所选的宿主和安装范围、勾了哪些条目、第三方 Skill 里挑了哪几个 skill、汇总里同意覆盖的是哪几项、这一份汇总是不是新换的、这一批的进度；填过的 key 记在两套界面共用的 `Runtime.keys` 里。**画面状态每次都从它们现算**（新连上一个页面时算一次，每个意图之后、进度每变一次算一次再推给所有页面），不存上一份——条目的状态因此总是现探测的：页面开着的时候机器上装了什么、配了什么，刷新就看得到；**汇总也是现算的**，不存上一份。

**说了什么由安装器定，怎么排由页面定。** 状态的词、数量的写法、提醒，用的是和终端界面同一份中英文案（`messages.ts`），随画面状态发给页面；页面自己的文字只有版式上固定的那些，都在 `cli/web/text.tsx` 的 `TEXT` 里，中英各一份：

| 页面自己的文字 | 为什么不随画面状态来 |
|----------------|----------------------|
| 栏名（用途、本机、目录、注意、已选） | 版式上固定的 |
| 只装进一个宿主时的那一句「装进 <宿主>」 | 终端界面里没有这句话（只检测到一个宿主时那边不问）；宿主的名字来自画面状态 |
| 想把最后一个宿主也去掉时的那一句「至少留一个」、已选标题旁的「其中 N 项这次不会装」 | 终端界面里没有：那边一个都不勾是回主菜单，已选也没有「装不了」这回事 |
| 条目数的写法（「21 项」） | 数来自画面状态，「项」是版式上的 |
| 按钮（去汇总、完成、继续挑选）、已选为空时的那一句、已选里去掉一项的那个 × 的名字 | 版式上固定的；终端界面里没有这几样 |
| 汇总标题下面的那一句、「覆盖它」和没勾时的后果、收到新的一份汇总时的那一句 | 终端界面里覆盖是确认之后一个个问的，没有这几句 |
| 填 key 的标题和它下面的那一句、输入框里的提示、「去申请」「换一个」「好了」和关掉它的那个 × 的名字 | 版式上固定的；终端界面是一问一答，没有这个对话框 |
| 安装中底部的那一句提醒、「7 / 17」的写法 | 终端界面里没有 |
| 还没连上时的「正在连接安装器…」 | 这时还没有画面状态 |
| 开场引导的「开始挑选」、旁边那句「进去之后在页面顶上还能改」、对话框的名字（工单 16） | 终端界面里没有这一步；那两句提问和各个选项的名字照旧随画面状态来（`target`） |
| 四种结束画面的标题和说明（已完成、已改用终端界面、安装器已退出、口令不对） | 后两种没有画面状态可依；前两种和它们是同一种画面，放在一处 |

**随画面状态来、页面不许自己写的**：用途和「推荐」的名字、分区的标题和它后面的那句话（「第三方 Skill　内容直接来自作者」「外部项目　只给链接，不安装」）、条目的名字与说明、「推荐」的标记、状态的词、不可选的原因、本机信息里的数量和提醒、「装进哪些 AI Agent」「装到哪里」和各个安装范围的名字；已选里类型的词和「要填 key」「key 已填」；卡片上「要填 key」「可选的 key」的标记；MCP 那一区的提醒；填 key 里每个变量的名字、说明、网址、「必填」「可选」、「已填」和不填会怎样的那一句；汇总的标题、操作、位置、备注、提醒和「返回修改」「开始安装」；进度与结果里每一行的词和原因、「正在安装」「结果」、合计的三个词、有没装上的时候「下一步」那一段、出错说明的全部。**终端界面的文案里已经有的话，页面一律不另写一遍**——另写的那一份迟早和原来的对不上（工单 04 的审查里就对不上过：页面写的是 Install into，终端界面是 Install into which AI Agents）。

没有画面状态时页面照浏览器的语言说（`navigator.language` 以 `zh` 开头是中文）；收到过画面状态就一直跟它的 `lang`。**经入口的测试断不到页面自己的这些字**，它们靠截图核对。

**页面上换语言**（工单 06）

- 页面起始的语言是系统语言，给了 `--lang` 就是它（和终端界面定语言的办法一样，见 [入口与测试](./installer-entry.md)）。页面上有中文 / English 的切换；它是意图 `lang`，安装器记下新的语言之后**按它重发整份画面状态**：状态的词、不可选的原因、用途与「推荐」的名字、分区的标题、条目的说明、本机信息里的数量和提醒、「装进哪些 AI Agent」「装到哪里」——凡是随画面状态来的都是新的语言，用的仍是和终端界面同一份中英文案（`messages.ts`）；页面自己的那些固定文字（`TEXT`）同时跟着 `lang` 换。
- **换语言只换说法，不换状态**：正在看哪张列表（`listing.id`）、开场动画播过没有、开场引导答过没有、走到哪一步都不变；勾选、宿主、安装范围、填过的 key 也都不变（各自的测试里有一条断言）。`menu` 里各行的 `id` 不随语言变，页面上原来的那一行还是当前项。
- 语言记在安装器这边（`Session.lang`）：刷新、再开一个标签页看到的都是换过之后的语言。
- **终端上的语言不跟着变**：呈现层是启动时按系统语言或 `--lang` 建的，页面上换语言不重建它，终端上也不因此多打任何东西。
- `language` 是切换语言的控件要的字：`label` 是终端界面语言提问的那一句（`Language / 语言`，不随语言变），`options` 是它的两项（`中文`、`English`），照显示的先后。页面不另写这几个字。
- 意图 `lang`：`lang` 必须是 `zh` 或 `en`，否则不照办（400），语言不变。

**宿主与安装范围**（工单 08）

- 两样都在安装器这边（`Session.hosts`、`Session.scope`），起初是**检测到的全部宿主、全局**——和终端界面两个提问光标起始的答案一样。刷新、再开一个标签页看到的是同一份；换语言不动它们。
- `target.choices` 是检测到的宿主，照本机信息里的先后，各带 `id`、名字和这一轮要不要装进它；`target.hosts` 是其中要装进的那些的名字，条目的 `statuses` 与它一一对应。**只检测到一个宿主时**页面不画成选项，写一句「装进 <宿主>」；**一个都没检测到时** `choices` 是空的，页面上没有这两样。
- 意图 `host`：`host` 是 `choices` 里某一项的 `id`，`on` 是装进还是不装进。**至少留一个**：去掉最后一个的意图不照办（400，什么都不变）——页面上那时写一句说明；只检测到一个宿主时因此没有可改的。`id` 不是检测到的宿主的不照办。
- 意图 `scope`：`scope` 是 `global` 或 `project`；一个宿主都没检测到时不照办（没有要装进的地方，也就没有范围可言——和终端界面一样）。
- `target.project` 是装到项目是装到哪个目录：`note` 是终端界面「项目」那一项后面的那句（`scopes.project.about`，「只对当前目录生效：」），`dir` 是运行安装器时所在的目录，写成和终端界面那一行同一种样子（`homeRelative`：主目录里的以 `~` 开头，别处的是全路径）；终端界面放不下时从前面截，网页界面不截、在任意处断开。它一直在画面状态里，页面在选了项目时显示。
- **改了之后状态马上重查**：画面状态本来就是每次现算的，条目的 `statuses` 只有所选宿主的那几段，skill 的目录按新的范围看（`skillsDirOf`）；汇总、位置、覆盖的另问都跟着（装到项目时位置写成相对项目目录的路径，主目录下的全局目录不读也不写——规矩在 [安装 skill](./skill-install.md)）。
- **已选不因此被去掉**：`selected` 里每一项照旧；在现在所选的宿主和范围下**装不了的**带着 `unavailable`（原因，和卡片上的是同一句，`unavailableReason`），**不进汇总**（算计划时只给可选的那些），改回去之后它没有了 `unavailable`、照常会装。已选里一个会装的都没有时 `review` 不照办（400），和已选为空一样。落进这一条的是第三方 Skill 和 MCP 的「需要别的 AI Agent」、MCP 的「只能装到全局」（工单 09、10）；本仓库的 skill 只在一个宿主都没有时装不了，而宿主至少留一个。
- 这两种意图只在浏览的时候照办：填 key、汇总开着、正在装、结果还没收掉时都是 400——**一批里只有一组宿主、一个安装范围**，汇总和执行用的是确认那一刻的选择。

**第三方 Skill**（工单 09）

- 勾得上的类型多了 `thirdParty`：`pick` 的 `kind` 是它、`name` 是条目的名字。可不可选仍由 `availability.ts` 定：一个宿主都没选时「需要 AI Agent」，所选的宿主一个都不支持这个条目时「需要别的 AI Agent」；只支持其中一部分时可选，只装进支持的那些。卡片上的 `statuses` 每个所选的宿主一段，词和终端界面同一张表（未装、已装、已装 2/3、不支持）。
- **含多个 skill 的条目**在画面状态里带着 `skills`：`lead` 是终端界面那一问的话（`pickSourcedSkills`），`entries` 每个 skill 一项——名字、完整的说明、每个所选宿主一段状态（这个 skill 自己的：未装、已装；条目不支持那个宿主时是不支持）、挑了没有。它一直在画面状态里，页面在条目勾上之后才画成清单。只含一个的没有 `skills`，勾上就是装那一个。
- 挑是意图 `choose`：`entry` 是**勾上了的**、含多个 skill 的条目，`skill` 是它 `skills` 里的名字，`on` 是要还是不要。条目没勾上、只含一个 skill、名字对不上，都不照办（400）。**起初一个都没挑**（和终端界面那一问起始一个都不勾一样）；挑的结果记在 `Session.chosen` 里，换一张列表、返回修改、去掉再勾上都还在；装完点「继续挑选」时清空。
- 已选里第三方 Skill 一项（`type` 是「第三方 Skill」）。含多个 skill 的带 `detail`（「3 个 skill 里挑了 2 个」，文案 `chosenSkills`）；**一个都没挑的**带 `unavailable`，话是「一个 skill 都没挑，这一条不装」（文案 `noSkillChosen`）——它和「装不了」走同一条路：不进汇总，已选里一个会装的都没有时 `review` 不照办。宿主改到一个都不支持它时 `unavailable` 是「需要别的 AI Agent」，改回去就没有了（工单 08 留下的那一条机制，现在对本仓库的 skill 和第三方 Skill 都管）。
- 汇总里每个要装的第三方 Skill 条目一段（`type` 是「第三方 Skill」，**没有 `version`**），条目照名字排在本仓库的 skill 之后；段里每个要装的 skill（照条目里的先后）在每个支持它的所选宿主下一行，行带 `skill`，页面把 skill 相同的相邻几行归成一小组、写出 skill 的名字。目标位置已有东西的操作是「覆盖」，`note` 是「已有同名目录」（文案 `existingDir`，不带终端界面的「另行确认」：决定就在这一行下面），并带 `overwrite`（`id` 是 `thirdParty:<条目>:<skill>:<宿主 id>`），缺省不覆盖；没同意的那一项不执行命令，结果里是「跳过 未同意覆盖，保持原样」。`title` 的 N 数的是条目（和终端界面一样，一个都没挑的不算）。`notices` 多一条「第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查」（`thirdPartyNotice`），排在覆盖的提醒之后——和终端界面同一个先后。
- **画面状态里仍然没有命令**：汇总、已选、进度、结果都没有 `npx`、`skills@1`、`--agent` 这些。执行的命令和终端界面装同样的东西时逐条相同（每个 skill、每个宿主一条，带关遥测的环境变量，不经 shell；装到项目时不带 `--global`、在项目目录下运行）——规矩在 [安装 skill](./skill-install.md)。
- 执行在本仓库的 skill 之后（共用的「执行」定的）。`run.rows` 里第三方 Skill 的行 `name` 是 skill 的名字；进行中的词是「正在安装」（`installingOne`，终端界面进行中那一行的词）；成功与否看复核：装上了是「已安装」，命令没有正常结束时 `rest` 是命令的结局（「安装命令退出状态 1」，`thirdPartyResult` 那句去掉开头的分号）；没装上是「失败」加原因（「安装命令已结束，但目标位置没有 SKILL.md」「安装命令没能运行（ENOENT）」）。向 GitHub 查询失败时它们照常装（不经那次查询），本仓库的 skill 不在行里。
- `summary.id` 把第三方 Skill 的各项和它们的覆盖决定也算进去：机器上多出了同名目录、或改了挑的 skill 再拿旧标识确认，都不装。

**MCP 与填 key**（工单 10）

- 勾得上的类型多了 `mcp`：`pick` 的 `kind` 是它、`name` 是条目的名字。可不可选仍由 `availability.ts` 定：所选的宿主一个都不支持它是「需要别的 AI Agent」；选了项目、而所选的宿主里支持它的都只能把 MCP 装到全局是「只能装到全局」；只有一部分装不了的仍可选，只装进装得了的那些。卡片上的 `statuses` 每个所选的宿主一段，词和终端界面同一张表（未配置、已配置、未知、不支持），看的是所选安装范围下的那一份配置——规矩在 [安装 MCP](./mcp-install.md)。
- **MCP 那一区的 `notices`** 是终端界面列表上方那两行「注意」的话（`mcpGlobalOnlyNotice`、`mcpConfigUnreadable`），先后也一样，两套界面经同一处算出来（`availability.ts` 的 `mcpColumnHosts`、`notice-text.ts` 的 `mcpColumnNoticeTexts`）：选了项目而哪个宿主的 MCP 只能装到全局（这张列表里至少有一个条目本身支持它）；哪个宿主的配置读不了。都没有时没有这个字段。
- 要 key 的 MCP 卡片上带 `key`：有必填的变量是「要填 key」，只有可选的是「可选的 key」（文案 `keyTags`）。它说的是这个条目，不随填没填变。
- 已选里 MCP 一项（`type` 是「MCP」）。要 key 的带 `key`：必填的还有没填的是「要填 key」（`tone` 是 `attention`），都填了、或填了哪个可选的是「key 已填」（`ready`）；只有可选的而一个都没填时没有。装不了的（改了宿主或范围之后）带 `unavailable`、不进汇总，和别的类型走同一条路（`web-ui.ts` 的 `idleOf`）。**必填的 key 没填不算装不了**：它留在会装的那一边，才到得了填 key。
- **填 key 是汇总前面的一步**（`Session.step` 的 `keys`）：浏览时发 `review`，已选里会装的条目中有要 key 的 MCP（`env` 不是空的），就先到这一步，画面状态里多出 `keys`；一个都没有就直接是汇总。在这一步再发 `review` 才是汇总（**总是照办**：必填的没填只是那个 MCP 不装）；`revise` 回到浏览。和终端界面同一个先后：勾选、填 key、汇总。
- `keys.entries` 每个会装的、要 key 的 MCP 一段，照勾选的先后：名字、它所在的用途的名字、每个变量——变量名、必填还是可选（`required` 和写出来的词 `need`）、说明、申请的网址、不填会怎样（`blank`：必填的是「不填就不装 <MCP>，其余照常装」，可选的是「留空则不设置这个变量」），和**填了没有**（`filled`：填过了是那个词「已填」，没填没有这个字段）。
- 意图 `key`：`mcp`、`variable` 是 `keys` 里的那一段和它的变量，`value` 是值。**只在填 key 这一步照办**；`mcp` 不在 `keys` 里、`variable` 不是它的变量、`value` 去掉首尾空白之后是空的，都不照办（400，什么都不变）。照办就是把去掉首尾空白的值记进 `Runtime.keys[MCP][变量]`（和终端界面记的是同一处），已经填过的换成新的——页面上的「换一个」就是再发一次。
- **值只有这一条路进来，哪里都不出去**：它在这一个请求的正文里，答复是没有正文的 204；之后的每一份画面状态里只有 `filled`，没有值、没有长度；它不进网址、不进任何答复（400、403 的正文也是空的）、不打到终端上、不写任何文件。算计划的拿到的只有填过的变量名（`filledKeys`），值到执行那一刻才由 `runPlan` 取出来交给 `installMcp`——规矩在 [安装 MCP](./mcp-install.md) 的「带 key 的 MCP」。
- **填过的在这次运行里一直在**：返回修改、换语言、去掉条目再勾上、装完点「继续挑选」都不清空——下一批再到填 key 时写着「已填」，可以换一个，不用再填。留空的没有记，下次还是没填。
- 必填的没填：那个 MCP 不装——汇总里没有它的段，`title` 的 N 不算它，`notices` 里有「<MCP> 缺少必填的 <变量>，这次不安装」；确认之后结果里每个宿主一行「跳过 未填写必填的 <变量>」，计入合计的跳过。已选的全是这样的时汇总是「将安装 0 项」加那几条提醒，确认之后直接是结果——和终端界面那时「不显示汇总、直接进结果」是同一个结局，只多一次确认。可选的没填就不带那个变量，照常装。
- 汇总里每个要装的 MCP 一段（`type` 是「MCP」，**没有 `version`**），照名字排在第三方 Skill 之后；段里每个装得了它的所选宿主一行，**行没有 `location`**。词和终端界面汇总里 MCP 的小表是同一份：

  | 它在那个宿主下的状态 | `action` | `overwrites` | `note` |
  |----------------------|----------|--------------|--------|
  | 未配置 | 新装 | — | — |
  | 已配置 | 覆盖 | `true` | 已配置，先移除再添加 |
  | 未知 | 添加 | — | 状态未知，先尝试移除同名配置 |

  MCP 没有要逐项决定的覆盖（没有「是不是本工具装的」这回事），已配置的再装一次就是覆盖；`notices.overwrites` 那句「整目录替换」说的是 skill，不因为 MCP 出现。
- `notices` 里 MCP 的那几条和终端界面是同一份话、同一个先后，**没有「key 以占位符显示」**（它说的是命令里的占位符）：key 会以明文写进项目里的哪个文件（说变量名和文件，不说值）、哪个宿主要另行批准才启用、哪个 MCP 因为缺 key 不装、哪个宿主会当场打开浏览器登录。最后一条里有事后补登录要敲的那条命令（`codex mcp login <名称>`）：它是给用户照着敲的，不是将执行的命令。
- **画面状态里仍然没有将执行的命令**：没有 `mcp add`、`mcp remove`、`--scope`、`--env`、`--transport`，也没有 MCP 的启动命令和网址（`server`）。执行的命令和终端界面装同样的东西时逐条相同（已配置的先移除再添加、状态未知的先尝试移除、装到项目时带 `--scope project` 并在项目目录下运行）。
- 执行在第三方 Skill 之后（共用的「执行」定的）。`run.rows` 里 MCP 每个宿主一行：进行中是「正在配置」（`configuring`），成了是「已配置」（`mcpStatus.configured`，没有 `rest`），没成是「失败」加原因（`mcpInstallProblem`：「添加命令退出状态 1」「移除命令退出状态 3；未执行添加」「添加命令没能运行（ENOENT）」——原因里只有哪一步、退出状态或错误码，**没有 key 的值**），缺 key 的是「跳过 未填写必填的 <变量>」。有没配置上的 MCP 时 `run.next` 里是 `afterMcpFailures` 那一句，见「安装与结果」。
- `summary.id` 把 MCP 的各项（条目、宿主、状态、缺哪个变量）也算进去：看汇总的时候宿主的配置变了再拿旧标识确认，不装。

**工具**（工单 12）

- 勾得上的类型多了 `tool`：`pick` 的 `kind` 是它、`name` 是条目的名字。可不可选仍由 `availability.ts` 定（`toolUnavailable`），原因是那三种：一个宿主都没检测到是「需要 AI Agent」，当前系统不支持是「不支持 macOS」这一类，它要的宿主一个都没检测到是「需要别的 AI Agent」。**看的是检测到的宿主，不是这一轮所选的**：页面上改了宿主、选了项目，工具的卡片不变，已选里的工具也不会因此带上 `unavailable`。
- 卡片上的 `statuses` 只有一段、没有 `host`：已安装（`ready`）、未安装（`faint`）。已安装的照样勾得上，再装一次就是再执行一遍命令。
- 已选里工具一项（`type` 是「工具」），没有 `detail`、`key`。
- 汇总里每个工具一段（`type` 是「工具」，**没有 `version`**），照名字排在 MCP 之后；段里只有一行，**没有 `host`、`location`、`note`**，`action` 是「执行安装命令」（文案 `toolAction`，终端界面汇总里工具那张小表的同一个词）。`title` 的 N 算上它。工具没有要逐项决定的覆盖，`notices` 不因为它多出什么。
- **那一行命令不出安装器**：汇总、已选、进度、结果里都没有它，画面状态的任何地方都没有（`curl`、`| sh` 这些搜不到）。执行的是目录里的那一整行（`ToolTarget.command`），整行交给 shell——和终端界面装同一个工具时记录到的命令一字不差。规矩在 [安装工具](./tool-install.md)。
- 执行在最后（共用的「执行」定的）。轮到一个工具时：
  - `run.rows` 里它那一行（**没有 `host`**）是 `state: 'running'`、带 `terminal: true`，`text` 是「这一项正在终端里安装，请看终端」（文案 `toolInTerminal`）。页面照 `terminal` 把它和别的「正在装」画得分得开。
  - 终端上是它自己的分区，和终端界面同一个画法：标题是它的名字，`$ <命令>`，命令自己的输出，空一行，一行结论。这期间终端上没有待命的提问（一批安装开始时就收回了）。
- 命令结束后那一行换成结论，**成功与否看复核，不看命令的退出状态**。词和后面的话是 [安装工具](./tool-install.md) 结论矩阵里的那几句（`toolAvailable`、`toolResult`），分成两段：

  | 复核 | `state` | `text` | `rest` |
  |------|---------|--------|--------|
  | 通过 | `succeeded` | 已可用 | 查到了什么（「在 PATH 中找到 fetcher」「~/.linter/bin/linter 已存在」）；命令没有正常结束时接着是它的结局（「…；命令退出状态 1」「…；命令没能运行（ENOENT）」）——`toolResult` 那句去掉开头的逗号 |
  | 不通过 | `failed` | 失败 | `toolResult` 的整句（「命令退出状态 3；在 PATH 中找不到 fetcher」「命令已正常结束，但在 PATH 中找不到 fetcher；可能要重开终端才找得到」） |

- 有没装上的工具时 `run.next` 里另说一句（`afterToolFailures`）：原因看终端里那条命令自己的输出。`afterFailures` 说的「没有改动原有的东西」对工具不成立——命令跑过了，改了什么只有它自己知道。三种都有时先后是 skill 的、MCP 的、工具的。
- 一批里的工具都跑完、这一批结束后，待命的提问回到终端上（和没有工具的一批一样，见「生命周期」）。页面开着时终端上**没有「结果」分区、没有合计**。
- **安装中页面关了**而这一批里有工具：工具的分区照样打在终端上、命令照样跑完；补打的「结果」分区里工具的结论和别的行排在一起（不再打一遍它的分区），合计算上它。**这一批只有一个工具时也照样有「结果」分区**（一行加合计）。
- `summary.id` 把工具的各项（名字、那一行命令、查什么）也算进去；它本来就在里面，标识仍只在安装器这边算、页面不去解读。

**勾选与已选**（工单 07；现在四种组件都勾得上）

- 勾选是意图 `pick`，**状态在安装器这边**：`kind`、`name` 是画面状态里那个条目的类型和名字，`on` 是勾上还是去掉。勾上的记在 `Session` 里，与正在看哪张列表无关——换一张列表看，之前勾的还在；一个条目同时在「推荐」和它的用途下，两处是同一个条目，一处勾了另一处的 `picked` 也是 `true`。
- `selected` 是已选，**照勾选的先后**：每项带 `kind`、`name`（去掉它时原样放进 `pick`）和类型写出来的词（文案里的 `kinds`）。已选了几个，页面数它的长度。
- **勾不上的不照办**（400，已选不变）：名字不在它那一类的目录里；`kind` 不是勾得上的（`PickableKind`：外部项目不在里面）；这个条目现在不可选（带着 `unavailable`——哪些不可选仍由 `availability.ts` 定）。去掉一个没勾的条目照办，什么都不变。
- 换语言不动勾选。
- 这几种意图只在浏览的时候照办：填 key、汇总开着、正在装、结果还没收掉时 `pick` 都是 400，`review` 只在浏览和填 key 时照办——页面上那时盖着对话框或面板，本来也点不到。

**汇总**（工单 07）

- 意图 `review`：已选为空时不照办（400）；照办之后画面状态里多出 `summary`（已选里有要 key 的 MCP 时先是 `keys`，见「MCP 与填 key」），并且**逐项的覆盖决定清空**（每次进汇总都从「不覆盖」起）。
- `summary` 经两套界面共用的「算计划」得出（`plan.ts` 的 `planInstall`），每次算画面状态时现算。`entries` 每个要装的条目一段，照执行的先后（本仓库的 skill 按名字），带着类型的词和**要装的版本**（清单里的那个）；段里每个宿主一行：宿主、操作、位置，和备注。词和终端界面的汇总是同一份：

  | 那里现在的状态 | `action` | `overwrites` | `note` | `overwrite` |
  |----------------|----------|--------------|--------|-------------|
  | 未装 | 新装 | — | — | — |
  | 已装，版本相同 | 覆盖 | `true` | `重装 <版本>` | — |
  | 已装，版本不同 | 覆盖 | `true` | `<已装的> → <清单的>` | — |
  | 非本工具安装 | 覆盖 | `true` | `非本工具安装`（不带终端界面的「另行确认」：决定就在这一行下面） | `{ id, agreed: false }` |

- `title` 是「将安装 N 项」，N 是条目数（和终端界面同一种数法）。`notices` 是提醒，和终端界面汇总后面的「注意」是同一份话、同一个先后，**只少「key 以占位符显示」那一条**；有会覆盖的就有「覆盖即整目录替换，目录内的本地改动会丢失」。
- **汇总里没有将执行的命令**，画面状态的任何地方都没有（维护者 2026-10-11 定的）。
- **不是本工具装的目录逐项决定，缺省不覆盖**：那一行带着 `overwrite`，意图 `overwrite` 带回它的 `id` 和勾没勾。`id` 不在这份汇总里的不照办（400）。没同意的那一项不装，结果里是「跳过 未同意覆盖，保持原样」。
- 意图 `revise`：回到浏览，勾选还在。

**展示的和执行的是同一份**（工单 07）

- `summary.id` 是这份汇总的标识：从计划里的每一项（条目、宿主、位置、要装的版本、那里现在的状态）、每一项的覆盖决定和提醒算出来的摘要，**与语言无关**——换语言不换标识。页面不去解读它。
- 意图 `install` 带回页面上那份汇总的标识。安装器**当场重新探测、重算一遍计划和标识**：
  - 和带回的一样 → 照这同一份计划去装。
  - 不一样（机器上的状态变了；多了一项要逐项决定的覆盖；覆盖的决定和页面上的不是同一份；带的是早先那份的标识）→ **不装**，推一份新的画面状态，`summary` 是现算的那一份，带着 `renewed: true`；页面写明这是新的一份、要再确认。这种情形意图是照办了的（204）：没照办的只是「装」。
- `renewed` 在这份汇总被确认、或返回修改之后就没有了。
- 将执行的命令不出安装器：页面只发条目的名字和选项，命令由安装器照这同一份计划去执行。

**安装与结果**（工单 07）

- 确认之后画面状态里没有 `summary`，多出 `run`；执行经两套界面共用的「执行」（`run-plan.ts` 的 `runPlan`），网页界面是它的进度的接收方：每一项的开始、结局、跳过各推一次画面状态。
- `run.rows` 每一项一行（一个条目在一个宿主下），照执行的先后。词和终端界面的结果行是同一份：

  | `state` | `text` | `rest` |
  |---------|--------|--------|
  | `waiting` | 等待（网页界面自己的词：终端界面没有这种行） | — |
  | `running` | 正在下载（终端界面进行中那一行的词） | — |
  | `succeeded` | 已安装 | 版本；原先是别的版本时是 `<已装的> → <清单的>` |
  | `failed` | 失败 | 原因（「来源里没有 SKILL.md，目标目录未改动」这一类） |
  | `skipped` | 跳过 | 未同意覆盖，保持原样 |

- 一项失败不影响其余；单项失败不改变退出状态。装完之后**有没装上的**，`run.next` 是「下一步」和它下面的话（终端界面的结果行只有原因，没有这一段：这句话是网页界面多出来的，放在文案里——`afterFailures`——随画面状态来，经入口的测试断得到）。**没配置上的是 MCP 时另说一句**（`afterMcpFailures`，工单 10）：`afterFailures` 说的是「没装上的各项没有改动原有的东西」，这对 skill 成立，对 MCP 不成立——已配置的是先移除再添加，添加失败时原先的那份已经不在了（那一行的原因里写着「此前已执行移除」）。两种都有就两句都有，skill 的在前。
- **向 GitHub 查询**：要下载本仓库的 skill 时先查钉住的来源，查询期间 `run.loading` 是「正在查询 skill 的文件列表」。查询失败时 `run.failure` 是出错说明（标题、原因、下一步，和终端界面同一份话），**本仓库的 skill 一个都不装、不在 `rows` 里**，安装器不退出。全都没同意覆盖时不查询。
- 全部结束后 `run.done` 是 `true`、`title` 换成「结果」，多出 `totals`：合计的名字和成功、失败、跳过三个数，各带自己的词。
- 意图 `continue`（只在装完之后照办）：回到浏览，**已选清空**，`run` 没有了；状态本来就是每次现探测的，刚装上的已经是「已装」。
- 正在装的时候 `finish` 不照办（400）：这一批要装完。Ctrl+C 仍然当场以 130 退出。
- 执行中出了意料之外的错（不是单项安装的失败）：不往外抛，变成 `run.failure` 里的「意外错误」，还没有结局的行拿掉，这一批算结束。

**逛目录**（工单 04）

- `menu` 是左栏的行：「推荐」（里面有条目时，带 `recommended: true`）在最前，然后是有条目的各个用途，照目录里的先后；**没有条目的用途不在里面**。数量和终端界面的主菜单是同一种数法（`listing.ts` 的 `recommendedListing`、`purposeCounts`）。`id` 是交回给安装器的标识，页面不去解读它（现在「推荐」是 `recommended`，用途是 `purpose:<用途的 id>`——加一段前缀，免得哪个用途恰好叫 `recommended`）。
- `listing` 是正在看的那张列表。页面刚打开时是 `menu` 的第一行：有「推荐」就是它，否则是第一个有条目的用途；目录里一个条目都没有时 `menu` 是空的、没有 `listing`。
- `listing.sections` 是组件，按类型分开，先后是 Skill、第三方 Skill、MCP、工具，**没有条目的类型不在里面**；每个分区的 `title` 和 `note` 是文案里那一份（`messages.ts` 的 `sections`）。条目的先后取自 `listing.ts`：用途的列表里带推荐标记的在前、其余按名字，「推荐」里只按名字。
- 条目的 `mark` 是「推荐」的标记（文案里的 `recommendedMark`）：用途的列表里带推荐标记的条目有，本仓库的 skill 都算；「推荐」那张列表里每一条都是推荐的，都没有。
- 条目的 `statuses` 每个要装进的宿主一段，与 `target.hosts` 一一对应，各带宿主的名字；工具只有一段、没有 `host`。词和含义来自 `status-text.ts`，和终端界面是同一张表：

  | `tone` | 含义 | 哪些状态 |
  |--------|------|----------|
  | `ready` | 就绪 | 已装（`rest` 是版本；含多个 skill 的第三方 Skill 是「2/3」）、已配置、已安装 |
  | `attention` | 留意 | 版本不同（`text` 直接是「2.0 → 2.3」）、非本工具安装 |
  | `faint` | 退后 | 未装、未配置、未安装、不支持 |
  | `plain` | 不上色 | 未知（宿主的配置读不了） |

- 条目带着 `unavailable` 就是不可选，值是那句原因（需要 AI Agent、需要别的 AI Agent、只能装到全局、不支持 macOS）：哪些不可选、为什么，由 `availability.ts` 定，写成哪句话由 `status-text.ts` 的 `unavailableReason` 定。一个宿主都没检测到时 `target.hosts` 是空的，skill、第三方 Skill、MCP 的 `statuses` 也是空的，每个组件都带「需要 AI Agent」。
- `listing.apps` 是外部项目，和组件分开：只有名字、完整的说明、链接和「推荐」的标记，**没有状态、没有可不可选**——页面上它们没有勾选框。链接是目录读取时验过的 `https` 网址；页面把它画成普通的链接，在新标签页打开，带 `rel="noopener noreferrer"`。列表里没有外部项目时没有这一块。
- `target` 是装进哪些宿主、装到哪里，页面上能改，见下面「宿主与安装范围」。`hostsLabel`、`scopeLabel` 和 `scopes` 里的名字是终端界面那两个提问的文案（`pickHosts`、`pickScope`、`scopes.*.name`）。
- 一个宿主都没检测到时 `machine.noHosts` 是终端界面本机信息里的那一句（「没有检测到 Claude Code、Codex 或 Pi，暂时装不了组件；外部项目仍可浏览」，目录里没有外部项目时没有后半句）；检测到了任何一个就没有这个字段。
- 意图 `open`：`list` 必须是 `menu` 里某一行的 `id`，否则不照办（400）；照办之后把 `listing` 换成那一张，推给所有页面。

**开场动画播过没有**

- `introSeen` 在这次运行里起初是 `false`。页面收到的**第一份**画面状态里它是 `false` 时播开场动画，同时发意图 `intro-seen`；安装器记下之后的每一份画面状态里它都是 `true`——刷新、断开重连、再开一个标签页都不重播。
- 系统开了「减少动态效果」时页面不播，但照样发 `intro-seen`：「这次运行第一次打开」已经用掉了。
- 开场是页面上盖着的一层，播不播都不耽误页面连上安装器、收画面状态；它怎么演见 [网页界面的设计](./web-ui-design.md) 的「开场动画」。

**开场引导答过没有**（工单 16，验收后加的）

开场引导是开场动画之后、进入挑选的页面之前让用户选宿主和安装范围的那一步（`GLOSSARY.md` 的「界面」）。它怎么画见 [网页界面的设计](./web-ui-design.md) 的「开场引导」；这里说的是安装器记什么、页面照什么决定画不画。

- `guideAnswered` 和 `introSeen` 是**分开的两样**。动画一开始播就记成播过了；只记那一样的话，用户在开场引导上刷新一下，引导就没了，他等于没答。
- 起初的值：检测到了宿主（一个或两个）是 `false`；**一个宿主都没检测到时起初就是 `true`**——没有可选的，不出开场引导。
- 改它的只有意图 `guide-answered`：把它记成 `true`，发几次都一样，没有哪个意图把它改回去。意图里多带了东西的不照办（400），和别的意图同一条规矩。换语言、换列表、勾选、装完一批点「继续挑选」都不动它；用 `t` 改用终端界面之后终端界面照旧问它自己的那两个提问。
- **开场引导里选的就是 `target` 那两样，不另立一份**：页面在引导里发的是已有的 `host`、`scope` 两个意图，提问的话是 `target.hostsLabel`、`target.scopeLabel`，选了项目时的目录是 `target.project`。所以没答完就刷新的，改过的选项还在；答完之后顶上那一条里显示的就是刚选的。「至少留一个宿主」照旧。
- **安装器不拿它拦别的意图**：`guideAnswered` 是 `false` 时 `pick`、`review`、`open` 这些照常照办。开场引导是给人看的一步，不是一道关——页面被它盖着，正常用的人点不到底下；不设关，已有的经入口的测试和预览的场景不用为它逐个多发一个意图。
- **页面照这两样决定画什么**（收到的第一份画面状态里的 `introSeen`，和每一份里的 `guideAnswered`）：

  | 第一份里的 `introSeen` | `guideAnswered` | 页面画什么 |
  |---|---|---|
  | `false` | `false` | 播开场动画（发 `intro-seen`），播到原先该淡出的时刻不淡出，接着是开场引导 |
  | `true` | `false` | 不播动画，直接是开场引导静止的样子（没答完就刷新、再开了一个标签页） |
  | `false` | `true` | 照原先的规矩：播完淡出，底下是挑选的页面（一个宿主都没检测到时就是这一行） |
  | `true` | `true` | 页面直接出现 |

  系统开了「减少动态效果」时动画不播（照样发 `intro-seen`），其余同表：没答过就是开场引导静止的样子，答过了页面直接出现。
- 页面上开场引导开着就是「最近一份画面状态里 `guideAnswered` 是 `false`」；点了「开始挑选」只发 `guide-answered`，那一层等推来的画面状态里它成了 `true` 才淡出——另一个标签页答完了，这一页的引导也跟着收掉。页面不另存「答过没有」。
- 开场引导开着时底下的三栏不可操作、也不读给读屏软件（`inert`）；`stage` 不是 `open` 时（终端上按了 `t`、点过「完成」）页面照旧是结束画面，不管引导答过没有。

**路径**

| 路径 | 方法 | 要口令 | 答复 |
|------|------|--------|------|
| `/` | GET | 否 | `index.html`。网址里的 `?token=…` 服务这边不看：页面的脚本自己从地址栏里取 |
| `/app.js`、`/app.css`、`/favicon.svg` | GET | 否 | 页面的脚本、样式和站点图标 |
| `/api/events` | GET | 是 | 长连接（`text/event-stream`）：连上就发当前的画面状态，之后每次变化发一次，每份是一行 `data: <JSON>` 加一个空行。它同时是「页面还开着」的依据 |
| `/api/intent` | POST | 是 | 正文是一个意图的 JSON；认得就照办并答 204，没有正文 |
| 其余 | — | — | 404。认得的路径、方法不对是 405 |

静态文件不要口令：里面没有口令、没有用户的任何数据、没有画面状态，拿到了也什么都做不了——「口令不对」的画面正是靠它们画出来的。站点图标是一张只有黑白两色的 SVG，颜色写在属性上：内容安全策略不许内嵌样式。

**口令**

- 每次运行生成一个：24 个随机字节，写成 32 个字符的 base64url。带在交给链接打开器的网址里（`http://127.0.0.1:<端口>/?token=<口令>`），整条网址因此在 79 列以内，终端上写得下一行。
- 页面把它放在请求头 `X-OXY-Token` 里发回来，不放进 `/api/` 的网址。比较时不泄露时间差（两边各取 SHA-256 再 `timingSafeEqual`）。
- 口令不进静态文件、不进任何答复的正文、不进画面状态。

**守的几道**（每个请求照这个先后查，哪一道没过都是 403、**正文是空的**；三道都过了才看路径认不认得、方法对不对——所以不带口令的 `PUT /api/intent` 是 403，不是 405）

| # | 查什么 | 对哪些请求 |
|---|--------|------------|
| 1 | `Host` 必须是 `127.0.0.1:<端口>` 或 `localhost:<端口>` | 全部，包括静态文件——挡的是把别的域名解析到本机的做法 |
| 2 | 带着 `Origin` 的话，它必须是 `http://` 加上面两个之一 | `/api/` 下的全部。契约只要求改变状态的请求，这里对读状态的也查：页面自己的请求要么不带 `Origin`，要么带的就是自己的 |
| 3 | `X-OXY-Token` 等于这次运行的口令 | `/api/` 下的全部 |

另外：

- **只监听 `127.0.0.1`**，端口由系统挑（`listen(0, '127.0.0.1')`）。同一个网络里别的机器连不上。
- **不发任何允许跨来源访问的头**（没有 `Access-Control-*`）：别的网站的脚本即使猜到了端口，带自定义头的请求过不了浏览器的预检，不带的过不了口令。
- **每个答复都带**：`Cache-Control: no-store`；`Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`；`X-Content-Type-Options: nosniff`；`Referrer-Policy: no-referrer`；`Connection: close`（不留空闲的连接，关的时候才干净）。
- 页面的静态文件里**没有指向外面的地址**：不加载外面的字体、脚本、样式、图片，不做统计。打出来的脚本和站点图标里唯一的 `http://` 是 XML 命名空间（`http://www.w3.org/2000/svg` 这一类），它们是标识，不是要去取的地址。外部项目的网址只在画面状态里，随长连接来，不在静态文件里。
- 意图里只有选项和条目的名字，**没有命令、路径或任何会被原样执行的东西**。正文超过 64 KB 的不读完就拒绝。
- **请求行不拿去解析**：路径只取问号前面的那一段，和认得的几条逐字去对。请求行是别人写的，`new URL(request.url, …)` 遇到 `http://[` 这样的会抛错，而请求处理函数里没接住的错会让整个安装器退出。
- 连请求都解析不了时（不是 HTTP 的东西）是 Node 自己答的 400，不经请求处理函数：`clientError` 上照样带着上面那几个头答复。

**生命周期**（工单 03、11）

| 时刻 | 安装器 | 页面 |
|------|--------|------|
| 进入网页界面 | 读静态文件、起本机的网页、把网址交给链接打开器；打开器兑现之后终端上才打出那个块，待命的提问开始等按键 | — |
| 页面连上 | 发当前的画面状态 | 画出来 |
| 还没有页面连上过 | 一直等着（终端上有网址和按键提示），**不因为没人连而退出** | — |
| 连上过之后，所有页面都断开 | 开始数 5 秒；这期间有页面连上（刷新、再开一个标签页）就不数了，**当没断过** | 刷新后看到的是当前的状态 |
| 断开满 5 秒，没有在安装 | 终端上一行说明（页面已关闭），关掉本机的网页，以 0 退出 | — |
| 断开满 5 秒，正在安装 | **这一批照样装完**；装完时仍然没有页面连着：终端上一行说明，这一批的结果照终端界面「结果」分区的样子打在终端上，以 0 退出。装完之前有页面连回来了：当没断过，结果照常在页面上 | 连回来的页面看到的是当前的进度 |
| 点了「完成」（意图 `finish`） | 把 `stage: 'finished'` 发给所有连着的页面，收掉长连接，关掉本机的网页，终端上一行说明，以 0 退出 | 显示可以关掉这一页；之后连接断开不再改口 |
| 终端上按了 `t`（没有在安装时） | 把 `stage: 'terminal'` 发给所有连着的页面，收掉长连接，关掉本机的网页，终端上一行说明；**页面上的勾选丢弃**，终端从语言提问接着走终端界面，目录不重读，本机信息不重打，见 [入口与测试](./installer-entry.md) | 显示已改用终端界面，请回到终端；之后连接断开不再改口。拿着旧网址的请求连不上 |
| 终端上按了 Ctrl+C | 当场关掉本机的网页（同步的），以 130 退出 | 连接断了，重连几次连不上：显示安装器已退出 |
| 本机的网页起不来，或链接打开器拒绝 | 关掉本机的网页（起来了的话），退回终端界面，见 [入口与测试](./installer-entry.md) | 之后拿着那个网址的请求连不上 |

- **「页面还开着」就是有长连接连着**（`/api/events`）：本机的网页每连上、断开一条就告诉网页界面的流程现在有几条（`pages(count)`）。只发过意图、拿过静态文件而没有连过长连接的不算连上过。
- **5 秒是 `InstallerOptions.pageGraceMs`**（`bin.ts` 给 5000）：它和 `tempDir`、`webDir` 同类，是运行环境的一个数，不是可替换的行为；测试里给得很短。页面自己断线重连的间隔（`main.tsx` 的 `RETRY_MS`，400 毫秒）比它短得多，一次网络抖动不会让安装器退出。
- **「没有页面看到的结果」怎么算**（`web-ui.ts` 的 `unseen`）：一批装完的那一刻没有页面连着，就记着；之后有页面连上（它拿到的画面状态里有结果）就不记了。断开满 5 秒时还记着，结果就打在终端上——安装中关的页面、和装完前一两秒才关的页面，都落在这一条里。
- **刷新后回到刷新前的样子**不是另做的：状态本来就都在安装器这边，画面状态每次现算（所在的用途、勾选、宿主和范围、走到哪一步、汇总里的决定、一批的进度、页面的语言、开场播过没有、开场引导答过没有）。
- **待命的提问**（终端上等 `t` 和 Ctrl+C 的那一行，见 [终端输出](./terminal-output.md) 的「待命的提问」）在网页界面开着、没有在安装时一直问着；一批安装开始时收回，装完再问。在它上面按 `t` 而这时一批刚好开始了（意图先到）：不照办，这一批要装完。
- **收场之后的意图不照办**：`stage` 不是 `open` 时（点了「完成」、按了 `t`）任何意图都是 400——本机的网页那时正在关。
- 终端上的那几行说明经呈现层的 `webEnded`，画法见 [界面设计](./ui-design.md) 的「网页界面开着时」。

同一台机器上同时开两个安装器互不相干：各有各的端口和口令。

### 4. Validation & Error Matrix

| 请求 | 答复 |
|------|------|
| `Host` 不是这台机器的回环地址加这个端口 | 403，正文空 |
| `/api/` 下带着别的来源的 `Origin` | 403，正文空；意图没有被执行 |
| `/api/` 下不带口令、口令不对 | 403，正文空 |
| `/api/intent` 的正文不是 JSON、不是认得的意图 | 400，正文空 |
| 意图 `open` 的 `list` 不是字符串，或不在 `menu` 里（包括目录里有、但下面没有条目的用途） | 400，正文空；正在看的列表不变 |
| 意图 `pick` 的条目不在目录里、`kind` 不是四种组件之一（外部项目勾不上）、条目不可选 | 400，已选不变 |
| 意图 `choose` 的 `entry` 不是勾上了的第三方 Skill、只含一个 skill、`skill` 不在它里面；浏览之外的 `choose` | 400，挑的不变 |
| **任何一种意图里多带了它不该有的东西**（`command`、`path`、`args` 之类）：每种意图认得的字段是定死的，多一个就整个不照办 | 400，什么都不变 |
| 意图 `review` 而已选为空，或已选里一个会装的都没有（装不了的、含多个 skill 而一个都没挑的）；`overwrite` 的 `item` 不在这份汇总里；`install` 的 `summary` 不是字符串 | 400 |
| 意图 `key` 的 `mcp` 不在 `keys` 里（没勾上的、不要 key 的、现在装不了的）、`variable` 不是它的变量、`value` 不是字符串或去掉首尾空白之后是空的；填 key 之外的 `key` | 400，正文空，填过的不变；值不在答复里 |
| 意图 `host` 的 `host` 不是检测到的宿主的 `id`；`on: false` 而它是最后一个要装进的；`scope` 的 `scope` 不是 `global`、`project`；一个宿主都没检测到时的 `host`、`scope` | 400，什么都不变 |
| 意图不合这一步：浏览时的 `key`、`overwrite`、`install`、`revise`、`continue`；填 key 时的 `pick`、`choose`、`host`、`scope`、`overwrite`、`install`、`continue`；汇总或安装中的 `pick`、`review`、`key`、`host`、`scope`；正在装时的 `finish`、`continue` | 400，什么都不变 |
| 意图 `install` 带的标识不是现在这一份的 | 204；不装，推来的 `summary` 带着 `renewed: true` |
| `/api/intent` 的正文超过 64 KB | 413，正文空；意图没有被执行 |
| 不认识的路径 | 404 |
| 认得的路径、方法不对（`PUT /api/intent`、`POST /api/events`、`DELETE /app.js`） | 405——前面三道先查，所以 `/api/` 下不带口令的仍是 403 |
| 请求行里的网址写坏了、根本不是 HTTP | 4xx，带着 `no-store`；安装器照常开着 |

页面这边：

| 情形 | 页面显示 |
|------|----------|
| `/api/events` 答 403 | 口令不对：一句说明，没有还能点的操作 |
| 长连接断了、重连不上，且最后一份画面状态的 `stage` 是 `open` | 安装器已退出：一句说明，没有还能点的操作 |
| 最后一份画面状态是 `finished` | 已完成，可以关掉这一页 |
| 最后一份画面状态是 `terminal` | 已改用终端界面，请回到终端：一句说明，没有还能点的操作 |

### 5. Good/Base/Bad Cases

- Good：在有桌面的机器上不带参数运行 → 终端上没有语言提问，本机信息之后是「网页界面开着」的块；页面连上收到本机信息；点「完成」→ 页面收到 `finished`，安装器以 0 退出。
- Base：拿着同一个网址再开一个标签页 → 两个标签页的画面状态相同。
- Good：页面发 `{"type":"open","list":"purpose:web-search"}` → 204，所有连着的页面收到新的画面状态，`listing.id` 是它，`menu` 不变。
- Base：页面第一次打开收到 `introSeen: false`，发 `intro-seen`；刷新后收到的是 `true`。
- Good：检测到两个宿主，第一份画面状态里 `guideAnswered: false`；发 `{"type":"host","host":"codex","on":false}`、`{"type":"scope","scope":"project"}` 之后刷新 → 仍是 `false`，`target.hosts` 是 `["Claude Code"]`、`target.scope` 是 `project`；发 `{"type":"guide-answered"}` → 204，推来的和刷新拿到的都是 `true`，别的都没变；之后装的 `alpha` 落在 `<项目目录>/.claude/skills/alpha`。
- Base：一个宿主都没检测到 → 第一份画面状态里 `guideAnswered` 就是 `true`。只检测到一个宿主 → `false`。
- Base：`guideAnswered` 是 `false` 时发 `pick`、`review` → 照常 204，已选和汇总都有。
- Bad：`{"type":"guide-answered","scope":"project"}` → 400，`guideAnswered` 仍是 `false`，安装范围没变。
- Good：中文的页面正看着「文档处理」，发 `{"type":"lang","lang":"en"}` → 204，推来的画面状态 `lang` 是 `en`，`listing.id` 没变，左栏那一行叫 `Documents`，状态的词是 `installed`，原因是 `needs another AI Agent`；刷新拿到的还是英文；终端上没有多出一行。
- Bad：`{"type":"lang","lang":"fr"}` → 400，语言不变。
- Base：只检测到 Claude Code，目录里有一个只支持 Codex 的 MCP → 它在列表里，带 `unavailable: "需要别的 AI Agent"`，`statuses` 是 `[{ host: "Claude Code", text: "不支持", tone: "faint" }]`。
- Good：两个宿主都检测到，发 `{"type":"host","host":"codex","on":false}` → 204，`target.hosts` 是 `["Claude Code"]`，每张卡片只剩 Claude Code 那一段状态；勾了 `alpha` 去装，只有 `~/.claude/skills/alpha`，`~/.agents` 不存在。
- Good：三个宿主都检测到（任务 `10-12-installer-add-pi-omp-hosts` 工单 01）→ `machine.hosts`、`target.choices` 依次是 Claude Code、Codex、Pi（`id` 是 `claude-code`、`codex`、`pi`），都勾着；每张卡片三段状态。去掉前两个只留 Pi、勾了 `alpha` 去装 → 汇总和结果里 `host` 是 `"Pi"`，位置是 `~/.agents/skills/alpha`，主目录下只多出 `.agents`。画面状态的形状没有因为多一个宿主而变。
- Good：只检测到 Pi，目录里有 MCP（任务 `10-12-installer-add-pi-omp-hosts` 工单 02）→ 卡片可选，`statuses` 是 `[{ host: "Pi", text: "未配置", tone: "faint" }]`，看的是所选安装范围下 Pi 的那份配置；勾上去装，记录到的是 `pi mcp add …`，汇总和结果里 `host` 是 `"Pi"`。三个宿主都留着时卡片三段状态、一个 MCP 三行结果。画面状态的形状没有变。
- Base：三个宿主、装到项目、带 key 的 MCP → MCP 那一区的 `notices` 是 Codex 只能装到全局的那一句，卡片上 Codex 那一段「不支持」；汇总里只有 Claude Code 和 Pi 的行，`summary.notices` 依次是明文写进 `.mcp.json、.pi/mcp.json` 的一句、Claude Code 要批准的一句、Pi 要批准的一句（启动命令 `pi`）；没有登录的提醒。Pi 的配置读不了时那一区的 `notices` 是「读不到 Pi 的配置，无法判断哪些 MCP 已配置」，那一段是 `{ text: "未知", tone: "plain" }`。
- Bad：只剩 Claude Code 时再发 `{"type":"host","host":"claude-code","on":false}` → 400，`target.hosts` 不变。
- Good：发 `{"type":"scope","scope":"project"}` → 204，`target.scope` 是 `project`；全局装过的 `alpha` 这时写「未装」；汇总里位置是 `.claude/skills/alpha`；装完 `<项目目录>/.claude/skills/alpha` 里有东西，主目录里每个文件和装之前一字不差。
- Base：只检测到一个宿主，`choices` 只有一项、`on: true`；页面上写「装进 Claude Code」，没有勾选框。一个都没检测到时 `choices` 是空的，`host`、`scope` 都是 400。
- Good：在「推荐」里勾 `alpha`，换到它的用途下再勾 `beta-pack` → `selected` 是这两个，照勾选的先后；`review` → `summary.title` 是「将安装 2 项」；`install` 带回 `summary.id` → 推来的 `run.rows` 从「等待」走到「已安装 1.0.0」，最后 `done`、合计「2 成功」；主目录里的东西和终端界面装出来的一样。`continue` → `selected` 是空的，两张卡片的状态是「已装」。
- Base：`~/.claude/skills/alpha` 是用户自己放的 → 汇总里那一行带 `overwrite: { agreed: false }`；不动它就 `install` → `alpha` 那一行「跳过 未同意覆盖，保持原样」，目录原样；发了 `overwrite` 再装就整目录替换。
- Bad：看着汇总的时候另一个终端往 `~/.claude/skills/alpha` 放了东西，页面拿着原来的标识 `install` → 什么都没装，推来的是新的汇总（那一行成了「覆盖」、要逐项决定），带着 `renewed`。
- Bad：`{"type":"pick","kind":"skill","name":"alpha","on":true,"command":"rm -rf ~"}` → 400，`alpha` 没有勾上。
- Good：两个宿主，勾只含一个 skill 的 `solo-notes` → 已选里「第三方 Skill」；汇总一段、没有版本，两行（Claude Code、Codex 各一行，`skill` 是 `note-taker`），提醒里有「作者当时的最新版」那句；确认后记录到的命令正好是终端界面装它时的那两条，结果两行「已安装」。画面状态的 JSON 里从头到尾没有 `npx`。
- Base：勾含三个 skill 的 `paper-kit` → 卡片带 `skills`（三项，都没挑），已选里带「一个 skill 都没挑，这一条不装」，只勾了它时 `review` 是 400；`choose` 两个 → `detail` 是「3 个 skill 里挑了 2 个」，汇总里两小组、每组两行，四条命令。
- Base：`paper-kit` 的 `hosts` 是 `["codex"]`，两个宿主都选 → 卡片上 Claude Code「不支持」、Codex「未装」，汇总和命令只有 Codex 的；去掉 Codex → 已选里它带「需要别的 AI Agent」，不进汇总；再勾回 Codex 就恢复。只检测到 Claude Code 时它不可选，`pick` 是 400。
- Base：`~/.claude/skills/note-taker` 已经在 → 汇总里那一行「覆盖」、备注「已有同名目录」、带 `overwrite`；不动就装 → 「跳过 未同意覆盖，保持原样」，没有命令；勾了「覆盖它」再装 → 命令执行了。
- Bad：命令以 0 退出而目标位置没有 `SKILL.md` → 那一行「失败 安装命令已结束，但目标位置没有 SKILL.md」，别的照常，退出状态 0。
- Good：勾带必填 key 的 `search-keyed`，`review` → 画面状态里是 `keys`（一段、一个变量「必填」、没有 `filled`）；`key` 带着值 → 那个变量 `filled: "已填"`；再 `review` → 汇总一段 MCP、一行「新装」；确认后记录到的命令是 `claude mcp add --scope user search-keyed -e SEARCH_API_KEY=<值> -- npx -y @example/search-mcp`，结果「已配置」。从头到尾收到的每一份画面状态、每一个答复、终端上的字、交给链接打开器的网址里都搜不到那个值。
- Base：`search-keyed` 的 key 留空就 `review` → 汇总是「将安装 0 项」，提醒「search-keyed 缺少必填的 SEARCH_API_KEY，这次不安装」；和别的一起勾时别的照常，结果里它「跳过 未填写必填的 SEARCH_API_KEY」。
- Base：装完点「继续挑选」，再勾 `search-keyed`、`review` → `keys` 里那个变量已经是「已填」；直接 `review` 去汇总就装得了。再发一次 `key` 就是换一个：命令里是新的值。
- Base：两个宿主、选了项目 → MCP 那一区有一条「Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令」，卡片上 Codex「不支持」，只装进 Claude Code：命令带 `--scope project`、在项目目录下运行，提醒里有明文写入和要批准的两条。只选 Codex 时卡片不可选，原因「只能装到全局」；全局时勾上再改成项目 → 它留在已选里带着这句原因、不进汇总，改回全局恢复。
- Bad：浏览时发 `{"type":"key",…}`、给没勾上的 MCP 填、`value` 是空白 → 都是 400，正文是空的。
- Good：勾工具 `fetcher`，`review` → 汇总一段「fetcher · 工具」、一行只有「执行安装命令」；确认后记录到的命令是 `{ command: 'curl -LsSf https://example.com/fetcher/install.sh | sh', args: [], shell: true }`；命令跑着的时候那一行是 `running`、`terminal: true`、「这一项正在终端里安装，请看终端」，终端上有「── fetcher」的分区和 `$ curl …`，没有按键提示；跑完是「已可用 在 PATH 中找到 fetcher」，按键提示回来。从头到尾收到的东西里搜不到 `curl`。
- Base：命令以 3 退出而 `fetcher` 已经在可执行路径上 → 「已可用 在 PATH 中找到 fetcher；命令退出状态 3」，计入成功；命令以 0 退出而路径上没有它 → 「失败 命令已正常结束，但在 PATH 中找不到 fetcher；可能要重开终端才找得到」，「下一步」里是工具的那一句。
- Base：`linter` 的 `hosts` 是 `["codex"]`，只检测到 Claude Code → 卡片带「需要别的 AI Agent」，`pick` 是 400；检测到两个、页面上去掉 Codex → 卡片照常可选（看的是检测到的）。
- Base：链接打开器拒绝 → 终端上一行「注意」，接着是语言提问和主菜单；那个网址已经连不上。
- Good：页面连上之后关掉 → 5 秒后终端上「网页界面  页面已关闭，安装器退出」，以 0 退出；按键提示那一行不在了。
- Base：页面刷新（断开不到 5 秒又连上）→ 安装器照常开着，新连上的拿到的画面状态和刷新前一样（勾选、正在看的列表、汇总都在）。
- Base：浏览器一直没弹出来、没有页面连上过 → 过多久都不退出；用户照着终端上的网址手动打开仍然连得上。
- Good：确认安装之后关掉页面 → 这一批装完，终端上「页面已关闭；这一批照样装完了，结果如下」和「结果」分区（每一行、合计），以 0 退出；主目录里的东西和页面开着时装出来的一样。
- Good：勾了 `alpha` 之后在终端上按 `t` → 页面收到 `stage: 'terminal'`、连接随后断开；终端上「已改用终端界面」，接着是语言提问和主菜单，进「推荐」时 `alpha` 没有勾着；那个网址连不上了。
- Bad：正在装的时候终端上没有按键提示，`t` 没有人接；装完按键提示回来。
- Bad：别的网站的页面向 `http://127.0.0.1:<端口>/api/intent` 发 `{"type":"finish"}`，带着它自己的 `Origin` → 403，安装器还开着。
- Bad：`curl http://127.0.0.1:<端口>/api/events`（不带口令）→ 403，正文是空的，里面没有宿主的名字。

### 6. Tests Required

都经主接缝（`cli/test/web-ui.test.ts`），架子扮演浏览器，见 [入口与测试](./installer-entry.md)：

- 正常路径：链接打开器恰好被调用一次；页面收到本机信息（宿主、数量、被跳过的那一句）；`finish` 之后退出状态 0、页面收到 `finished`；终端上有那个块和整条网址，没有语言提问。
- 三道都有用例（口令的那一道分两条）：不带口令、口令不对（含「口令放在网址里不算数」）、`Host` 不对（含 `localhost:<端口>` 认、`localhost.evil.example` 不认）、别的来源的 `Origin`——都是 403 且正文是空的；最后一条之后安装器还开着。
- 出错矩阵里的每一种各一条：认不出来的意图 400、方法不对 405（不带口令的先是 403）、正文太大 413、请求行写坏了安装器不垮。
- 监听的是回环地址：网址的主机是 `127.0.0.1`；从这台机器别的网络地址连同一个端口连不上。**先拿一个刚关掉的端口探一遍，连它都「连得上」的地址不算**——代理软件的虚拟网卡（`utun`，`198.18.x.x`）连什么端口都说连上了。机器上没有别的网络地址时这一条只证明了回环地址连得上。
- 静态文件：三个文件里没有口令，除了 XML 命名空间没有 `http(s)://`；每一种答复（200 的静态文件和长连接、204、400、403、404、405、413）都带着内容安全策略和 `no-store`，没有 `Access-Control-*`。
- 再开一条长连接拿到的是同一份画面状态。
- 链接打开器拒绝、网页起不来各一条：终端上有那句原因，之后是语言提问，再是主菜单；后一条里链接打开器没有被调用。
- 目录读不了：以 1 退出，链接打开器没有被调用。
- Ctrl+C：以 130 退出，页面的长连接断了。
- 语言：`--lang en` 时终端上的块和画面状态都是英文。

逛目录的在 `cli/test/web-browse.test.ts`，同样经主接缝：

- 左栏：有「推荐」时它在最前、页面打开在它上面；没有时这一行不出现、打开在第一个有条目的用途上；没有条目的用途不出现；数量与先后；目录里一个条目都没有。
- 换一张列表看；`list` 不在左栏里的四种写法都是 400，正在看的不变。
- 一张列表：各类型的先后、同类里的排序（用途的列表与「推荐」各一条）、第三方 Skill 分区的那句话、「推荐」的标记（谁有谁没有）、说明是完整的那一句。
- 状态：两个宿主各自的状态（已装带版本、版本不同、非本工具安装、未装；已配置、未配置、不支持；装了几个里的几个）、未知、工具的两种；页面开着时配置变了，刷新看得到新状态。
- 不可选的原因每种一条：需要别的 AI Agent（第三方 Skill、MCP、工具各一个）、不支持当前系统、一个宿主都没有（全部组件，连同本机信息里的那一句提醒）。「只能装到全局」在 `web-mcp.test.ts` 的「把 MCP 装到项目」一组里。
- 宿主和安装范围的名字：中英各断一次，和终端界面的提问逐字相同。
- 被跳过的条目：本机信息里的那一句，它们不在任何一张列表里、不算进数量。
- 外部项目：和组件分开、那句「只给链接，不安装」、每个带完整的说明和链接、没有状态；用途下只有外部项目；列表里没有外部项目；「推荐」里的外部项目。
- 开场动画：第一次打开是没播过；发了 `intro-seen` 之后推来的和刷新拿到的都是播过了，别的都没变。
- 英文：左栏、分区的标题与那句话、说明、状态的词、标记、不可选的原因。
- 站点图标：不要口令就拿得到，是 SVG，里面没有口令、没有指向外面的地址；`index.html` 引用了它。

页面上换语言的在 `cli/test/web-language.test.ts`，同样经主接缝：

- 起始的语言：系统语言是中文、英文各一条（不带 `--lang`，靠 `LANG`）；`--lang` 盖过系统语言。
- 换语言之后推来的画面状态：`lang`、左栏各行的名字、分区的标题、条目的说明、状态的词、不可选的原因、本机信息、「装进哪些 AI Agent」「装到哪里」都是新的语言；`listing.id`、`menu` 各行的 `id`、`introSeen`、`stage` 都没变；换回来和起初的一样。
- 刷新之后还是换过之后的语言。
- 终端上的输出没有因为换语言多出东西，仍是起始的语言。
- `language` 里的名字和各项与终端界面的语言提问逐字相同。
- `lang` 不是 `zh`、`en` 的写法都是 400，语言不变。

开场引导答过没有的在 `cli/test/web-guide.test.ts`，同样经主接缝（工单 16）：

- 起初的值：检测到两个宿主、只检测到一个时第一份画面状态里都是没答过；一个都没检测到时起初就是答过了。
- 发了 `guide-answered` 之后推来的和刷新拿到的都是答过了，别的都没变；再发一次还是一样。
- 没答完时改的宿主和安装范围刷新后还在、仍是没答过；答完之后装的东西照它落（去掉一个宿主、选项目，装一个本仓库的 skill，看落点）。
- 换语言不动它。
- 没答过时勾选、要汇总照常照办。任务里原有的网页界面的用例一条都没有为它改，也是这一条的凭据。
- `guide-answered` 里多带了东西的不照办（400），仍是没答过。

装本仓库的 skill 的在 `cli/test/web-install.test.ts`，同样经主接缝（脚本的第二个参数给出这次运行的主目录和项目目录，见 [入口与测试](./installer-entry.md)）：

- 勾选：跨两个用途各勾一个，换用途之后之前勾的还在；同一个条目在「推荐」和它的用途下一处勾了另一处也是；已选照勾选的先后、能去掉；勾不上不可选的条目（一个宿主都没有）、不在目录里的；`kind` 不是四种组件之一的（外部项目）代码是拒的，**眼下没有用例守着**；意图里多带了命令、路径的整个不照办（`pick` 和别的几种各试）；换语言后勾选不变。
- 汇总：已选为空去不了；每个 skill 在每个宿主下一行，带位置、操作和备注（新装、重装、版本不同、非本工具安装各一条）；有会覆盖的就有那句提醒；画面状态里没有命令；返回修改后勾选还在。
- 一次装上：主目录里的东西与终端界面装同样的东西装出来的逐个文件相同（安装标记里的时间除外）；进度从等待、正在下载到已安装；合计；`continue` 之后已选清空、状态是新的。
- 非本工具安装：缺省不覆盖（目录原样，结果里是跳过）；同意后整目录替换。
- 展示的和执行的是同一份：旧标识的确认不装；汇总之后状态变了不装、推来新的一份带 `renewed`，拿新的标识再确认才装。
- 一项失败其余照常，退出状态 0，结果里有「下一步」那一段（全都装上时没有）；向 GitHub 查询失败：出错说明的标题、原因、下一步，一个都没装，安装器还开着、能接着挑。
- 不合这一步的意图都是 400。

选宿主、选安装范围的在 `cli/test/web-target.test.ts`，同样经主接缝：

- 起初是检测到的全部宿主、全局；`choices` 的 `id`、名字、先后；只检测到一个时 `choices` 只有一项；一个都没有时是空的。
- 两个宿主只选一个：`target.hosts` 和每张卡片的 `statuses` 只剩它；装的东西只进它的目录，另一个宿主的目录不存在。
- Pi（`cli/test/web-pi.test.ts`）：三个宿主时本机信息与 `target` 的先后和缺省、只检测到 Pi、一个都没检测到时那一句的中英文；只留 Pi 时装到全局和项目的位置与安装标记、四种状态、逐项决定的覆盖；第三方 Skill 的命令与终端界面逐条相同（`--agent pi`）、装到项目、复核没过；英文。
- Pi 的 MCP（`cli/test/web-pi-mcp.test.ts`）：只检测到 Pi 时卡片的状态、可选、记录到的命令（**字面值**）、没有登录的提醒；三个宿主时三段状态、三行结果、已配置的先移除再添加；`PI_CODING_AGENT_DIR`；配置读不了时那一区的提醒与「未知」；非零退出与没能起来；命令与终端界面逐条相同；装到项目（状态看 `.pi/mcp.json`、命令带 `-l` 与 `cwd`、两句提醒的原文、三个宿主时两个文件与两句要批准）；填的 key 不出现在任何别处（三个宿主只填一次、装到项目、命令起不来而错误消息里带着整条命令、画面状态里没有命令）；英文。
- 去掉最后一个宿主不照办（400），`target.hosts` 不变；不是检测到的宿主的 `id` 不照办；一个都没检测到时 `host`、`scope` 都不照办。
- 装到项目：`target.project` 的那句话和目录（架子的项目目录不在主目录里，是全路径）；全局装过的在项目里写「未装」；汇总里位置是相对项目目录的路径；装完落在项目目录下各宿主项目范围的 skill 目录里，主目录里每个文件的内容和装之前相同；改回全局之后状态是全局的。
- 换语言后这两个选择不变；刷新后还是改过的。
- 汇总开着的时候 `host`、`scope` 都是 400。
- 「变得装不了的留在已选里、不进汇总、改回去恢复」在 `web-third-party.test.ts`（去掉了它要的宿主）和 `web-mcp.test.ts`（勾上之后才改成项目、去掉了它要的宿主）里。

装第三方 Skill 的在 `cli/test/web-third-party.test.ts`，同样经主接缝：

- 只含一个 skill 的正常路径：已选里的类型、汇总的段与行（没有版本、`skill`）、提醒、结果；记录到的命令与用终端界面装同样的东西时逐条相同（同一份目录和主目录，终端界面那一跑用预设应答走到装完）；画面状态的 JSON 里没有 `npx`、`skills@1`、`--agent`。
- 含多个的：卡片的 `skills`（那一句、每个 skill 的说明和状态、挑了没有）；挑两个 → `detail`、汇总两小组、命令每个 skill 每个宿主一条；一个都不挑 → 已选里那句、只勾了它时去不了汇总、和别的一起时它不进汇总；挑的结果在换用途、返回修改、去掉再勾上之后还在，点「继续挑选」之后清空；`choose` 的几种不照办（没勾上、只含一个、名字对不上、多带了字段）。
- 宿主：条目只支持 Codex 而两个都选 → 只装进 Codex；去掉 Codex → 已选里「需要别的 AI Agent」、不进汇总、`review` 被拒；勾回恢复；只检测到 Claude Code 时不可选、`pick` 400。
- 已有同名目录：缺省不覆盖（没有命令、目录原样、结果是跳过）；同意后覆盖（命令执行）。
- 命令结束了但没装上 → 失败行的原因；没能运行（ENOENT）→ 那句；装上了而命令非零退出 → 「已安装」加「安装命令退出状态 1」。
- 混在一批里：本仓库的 skill 的行在前、第三方 Skill 的在后，只有第三方 Skill 的命令；向 GitHub 查询失败时第三方 Skill 照常装。
- 装到项目：命令不带 `--global`、`cwd` 是项目目录，位置是相对路径，复核按项目目录。
- 换语言后勾选和挑的都不变，`detail`、`unavailable`、`lead` 换成新的语言。

页面的生命周期在 `cli/test/web-lifecycle.test.ts`，同样经主接缝（页面的脚本用 `page.close()` 关页面、用第二个参数里的 `terminal` 做终端上的事，时限由架子给得很短，见 [入口与测试](./installer-entry.md)）：

- 页面关了：连上过之后断开满时限——以 0 退出、终端上那一行、按键提示不留着、旧网址连不上；没连上过——过了时限也不退出（靠 `interrupt` 收场，退出状态是 130 而不是 0）；时限内重连——照常开着，新连上的拿到的画面状态和断开前相等。
- 刷新后状态还在：换了列表、勾了两个、去掉一个宿主、选了项目、换了语言、到了汇总之后，再开一条长连接拿到的那一份与之前逐字段相等；安装中刷新拿到的是当前的进度。
- 安装中页面关了：这一批装完（主目录里有东西）、终端上那句说明在「结果」标题前面、结果行和合计与用终端界面装同样的东西时一字不差、没有「正在安装」、以 0 退出；装完前连回来——结果在页面上、终端上不打、安装器不退出；不满时限就装完而页面没回来——结果同样打在终端上；结果在页面上看过了再关——终端上只有那一行。
- 待命：页面开着时画面上有按键提示、点了「完成」它不留着；英文；按 Ctrl+C 以 130 退出、没有收场的那一行；安装进行中画面上没有按键提示、`terminal.press` 没有人接、装完回来，页面开着时这一批的进度不打在终端上。
- 按 `t`：页面收到 `stage: 'terminal'`；终端上那一行在语言提问前面、主菜单在它后面；目录不重读；页面上勾的没有跟过来（列表里它没勾着），照常用终端界面装上一个 skill；旧网址连不上；带 `--lang` 不问语言；之后发来的意图不照办。
- 用真实的交互库再测的那一组在 `cli/test/prompts.test.ts` 的「真实的画面：网页界面开着时的待命」：按键提示实际打出来的整行（中英文、没有 Unicode）、`NO_COLOR` 下不带样式码、79 列以内、没有青色、不认的键不回显、按 `t` 之后画面上依次是什么、被收回时那一行擦掉、一批安装开始时收掉装完画回来、**一批安装进行中敲的 `t` 不算数**。

装 MCP、填 key 的在 `cli/test/web-mcp.test.ts`，同样经主接缝：

- 本地进程的、远程地址的、带 key 的各一条正常路径：已选里的类型、汇总的段与行（没有版本、没有位置）、结果「已配置」；记录到的命令是**字面值**；带 key 的再和终端界面装同样的东西时记录到的命令逐条比一遍。
- 状态：每个所选宿主一段（未配置、已配置、未知、不支持）；配置读不了时 MCP 那一区的提醒；已配置的先移除再添加、汇总里是「覆盖」和备注；状态未知的先尝试移除、汇总里是「添加」和备注。
- 填 key：`review` 先到 `keys`（每个变量的说明、必填还是可选、申请的网址、不填会怎样）；不要 key 的直接是汇总；填了之后只有「已填」；必填的没填（汇总不算它、提醒、结果里是跳过、其余照常）；可选的没填（照常装、命令里不带那个变量）；装完继续挑选的第二批不用再填；换一个（命令里是新的值）；`key` 的几种不照办。
- 装到项目：Codex 那一栏「不支持」和那一区的提醒、只装进 Claude Code、命令带 `--scope project` 且 `cwd` 是项目目录；只有 Codex 时不可选与原因；勾上之后才变得装不了的留在已选里、不进汇总、`review` 被拒、改回去恢复。
- 提醒每种一条：明文写入（有变量名和文件名）、要批准、缺 key、当场登录。
- 命令非零退出、没能运行：失败行的原因；别的照常，退出状态 0。添加失败而移除已经成功：原因里的「此前已执行移除」，「下一步」是 MCP 的那一句、不说原有的东西没动；skill 和 MCP 都有没装上的时两句都有。
- 执行在第三方 Skill 之后。
- **填的值不出现**：架子记下这一页收到的全部东西（每一份画面状态的原文、每个答复的头和正文——`page.received()`），连同终端上的全部输出、交给链接打开器的网址、主目录、项目目录和临时目录里的每个文件，整份去搜，一处都没有——成功、命令非零退出、命令起不来而错误消息里带着整条命令、填的时候被拒绝（400）各一条。
- 换语言后填过的 key 还在，`keys` 里的话换成新的语言。
- 画面状态的 JSON 里没有 `mcp add`、`--scope`、`--env`、`--transport`，也没有条目的启动命令。

装工具的在 `cli/test/web-tools.test.ts`，同样经主接缝（要停在命令跑到一半的地方，`commandResult` 返回一个还没兑现的承诺，见 [入口与测试](./installer-entry.md)）：

- 一个工具的正常路径：卡片的状态（一段、没有宿主）、已选里的类型、汇总的段与行（没有版本、宿主、位置）、记录到的命令是**字面值**（整行、`shell: true`、`args: []`）、命令跑着时那一行的 `terminal` 和那句话、结论；终端上有它的分区、`$` 和那一行命令、结论，没有「结果」分区和合计；和终端界面装同一个工具时记录到的命令逐条比一遍。
- 结论：非零退出但复核通过（成功，带退出状态）；以 0 退出但复核不通过（失败、「下一步」是工具的那一句）；没能起来（`ENOENT`，错误消息不出现在任何地方）；检查方式是路径的那一种。
- 不可选的三种原因各一条：卡片上的原因、`pick` 是 400；页面上去掉了它要的宿主、选了项目，工具照常可选、已选里不带原因。
- 和本仓库的 skill、第三方 Skill、MCP 混在一批里：行的先后和命令的先后都是工具在最后；两个工具按名字。
- **那一行命令不出安装器**：这一页收到的全部东西（`page.received()`）里搜不到命令里的词；意图里多带了 `command` 的不照办。
- 待命：命令跑着时画面上没有按键提示、`terminal.press` 没有人接；跑完回来。
- 安装中页面关了：这一批装完，终端上补打的「结果」分区里有工具的那一行，合计算上它，它的分区只打了一遍；这一批只有一个工具时照样有「结果」分区。
- 换语言后勾着的工具还在，类型、状态、汇总里的操作、进度里的那句话都是新的语言。

**经入口的测试断不到的**（页面只把画面状态画出来）：三栏的版式、开场动画怎么演、开场引导怎么演（它出没出现、焦点在不在里面、跳过动画的那一下有没有落到它的控件上）、键盘与焦点、链接是不是在新标签页打开——这些在真实的浏览器里看：版式、开场的定格、开场引导的几种样子和键盘焦点在网页界面的预览里各有一格（`npm run preview:web`，见 [网页界面的设计](./web-ui-design.md) 的「网页界面的预览」），其余的手动核对。

### 7. Wrong vs Correct

#### Wrong

```ts
// 把口令拼进页面的静态文件：静态文件不要口令就拿得到
index.replace('__TOKEN__', token);

// 为了方便调试放开跨来源：别的网站的脚本就读得到状态、发得了意图
res.setHeader('Access-Control-Allow-Origin', '*');

// 监听所有地址：同一个网络里的机器都连得上
server.listen(0);

// 拿请求行去解析：写坏的请求行让它抛错，安装器跟着退出
const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');

// 页面里另写一份终端界面已经有的话：两份迟早对不上，经入口的测试也断不到页面里的这一份
const TEXT = { en: { installInto: 'Install into' } };   // messages.ts 里是 Install into which AI Agents

// 页面去解读左栏那一行的 id，或自己拼一个
send({ type: 'open', list: `purpose:${purposeId}` });

// 读状态的时候顺手改状态：第一条长连接一连上就算开场播过了——再开一个标签页拿到的就不是同一份
state: () => ({ ...view(), introSeen: seen++ > 0 }),

// 站点图标里内嵌样式，或写成内嵌的数据网址：内容安全策略两样都不许
<svg><style>rect { fill: #111 }</style>…</svg>

// 把汇总时算的那份计划存起来，确认时照它装：看汇总的那一会儿机器上变了，装的就不是现在该装的
session.plan = planInstall(…);            // review 的时候
runPlan(runtime, session.plan, progress); // install 的时候

// 丢掉意图里多带的东西、照办剩下的：规格说的是带了命令、路径一律不认
const { type, kind, name, on } = raw;     // command、path 悄悄没了，意图照办

// 工具的那一行命令也一样：汇总里写了「执行安装命令」就想把命令带上，或让页面把名字发回来时顺手带着命令
entries.push({ name: target.name, type: t.kinds.tool, rows: [{ action: t.toolAction, command: target.command }] });

// 把工具的命令的输出收起来发给页面：它要接管终端的输入输出（sudo 的密码只有终端答得了），规格明说不搬
runCommand(target.command, [], { shell: true, capture: (chunk) => push(chunk) });

// 页面开着时把这一批的「结果」和合计也打在终端上：页面上已经有了，终端上只该有工具的分区
const terminal = ui.installation(skills, thirdParty, mcps, tools);   // 该是 ui.toolSections(tools)

// 把将执行的命令放进画面状态「反正页面不画」：页面用不上的东西不出安装器
summary: { entries, commands: plan.thirdPartyJobs.map((job) => job.command) }

// 页面自己写结果里的话：经入口的测试断不到，也不随安装器的文案走
<p>{t.afterFailures}</p>                  // TEXT 里的

// 把 key 的「样子」放进画面状态：圆点的个数就是值的长度
variables: [{ name, masked: '•'.repeat(value.length) }]

// 把 key 放进网址或答复：网址会进浏览器的历史，答复会被别的标签页看到
fetch(`/api/key?variable=${name}&value=${value}`, { headers: withToken });
answer(response, 400, {}, Buffer.from(`unknown variable for ${value}`));

// 用密码框收 key：浏览器把它当登录密码，填完会问要不要保存，存进去的可能同步到账号
<input type="password" autocomplete="off" />

// 意图同时发：填 key 的那一个可能落在「去汇总」后面，那时已经不在填 key 这一步，值被拒收
void fetch('/api/intent', { method: 'POST', body: JSON.stringify(intent) });

// 页面断开就当场退出：刷新、网络抖一下都会让安装器没了
response.on('close', () => exit());

// 数「页面关了」的时限不放手：本机的网页关掉时长连接也是这样断开的，这个时限会拖着进程多活 5 秒才退出
grace = setTimeout(leave, pageGraceMs);

// 安装中页面关了就不管这一批了，或装完了什么都不说就退出：结果没有任何地方看得到
if (deserted) return end('closed');   // 之后只打「页面已关闭，安装器退出」
```

#### Correct

```ts
// 口令只在网址里交给浏览器，页面的脚本自己取、放进请求头
new URLSearchParams(location.search).get('token');

server.listen(0, '127.0.0.1');

// 只取问号前面的一段，和认得的路径逐字去对
const [pathname = ''] = (request.url ?? '').split('?');

// 终端界面已经有的话随画面状态来；页面只画
target: { hostsLabel: t.pickHosts, scopeLabel: t.pickScope, … }   // web-ui.ts
<span class="label">{state.target.hostsLabel}</span>              // browse.tsx

// 左栏那一行的 id 原样交回
send({ type: 'open', list: row.id });

// 状态只在意图里变；画面状态每次从它现算
case 'intro-seen': session.introSeen = true; break;
case 'guide-answered': session.guideAnswered = true; break;

// 站点图标是一个静态文件，颜色写在属性上
<rect width="12" height="12" rx="2.5" fill="#111111"/>

// 汇总不存：确认时重算一遍计划和标识，和页面带回的一样才装
const plan = planOf(runtime, session);
session.renewed = summaryId(plan) !== intent.summary;
if (!session.renewed) void install(plan);

// 每种意图认得的字段是定死的，多一个就整个不认
const only = (...fields: string[]) => Object.keys(raw).every((field) => field === 'type' || fields.includes(field));
if (type === 'pick' && … && only('kind', 'name', 'on')) return { type, kind, name, on };

// 结果里的话随画面状态来；页面只画
{run.next && run.next.lines.map((line) => <p key={line}>{line}</p>)}

// key 只有填了没有：值记进 Runtime.keys，画面状态里是那个词
known.set(intent.variable, value);                                                    // web-ui.ts，意图 key
...(runtime.keys.get(mcp.name)?.has(variable.name) ? { filled: t.keyFilled } : {}),   // 算画面状态

// 值只在请求的正文里；照办答没有正文的 204，不照办的 400 正文也是空的
send({ type: 'key', mcp, variable: variable.name, value });

// 画成圆点的文字框，发出去就清空；浏览器不认那条样式时才用密码框
<input class="secret" {...FIELD} autocomplete="off" spellcheck={false} onChange={…} />  // keys.tsx

// 意图一个接一个地发，上一个答复回来才发下一个
sending = sending.then(() => fetch('/api/intent', { … })).catch(() => undefined);      // main.tsx

// 全都断开之后数满时限才算页面关了，时限内连上就不数了；时限不拖着进程
grace = setTimeout(() => { deserted = true; if (session.step !== 'installing') end('closed'); }, options.pageGraceMs);
grace.unref();

// 工具：页面上只有名字和要做什么；轮到它时终端上是它的分区，页面上那一行说去哪看，跑完两边各有结论
for (const { target } of plan.toolJobs) entries.push({ name: target.name, type: t.kinds.tool, rows: [{ action: t.toolAction }] });   // summaryView
const conclude = terminal.begin(target);          // trackBatch：terminal 是 ui.toolSections(tools)
setTool(target, { state: 'running' });            // 画面状态里这一行带 terminal: true
return (result) => { conclude(result); setTool(target, { state: result.available ? 'succeeded' : 'failed', tool: result }); };

// 这一批的结果没有页面看到，就打在终端上，再说退出
if (how === 'closed' && unseen && session.batch) {
  options.ui.webEnded('closedUnseen');
  reportBatch(session.batch, options.ui);
} else options.ui.webEnded(how);
```

---

## Design Decision: 页面的静态文件所在的目录由入口给

**Context**：本机的网页要发页面的静态文件，它们是构建产物（`dist/web/`）。从构建产物运行时它们在 `dist/` 里，测试却是直接跑 `src/` 的；规格又要一条「本机的网页起不来」的测试，而端口是系统挑的，监听几乎不会失败。

**Options Considered**：

1. 本机的网页自己按「我在 `src/` 还是 `dist/`」去找——正式代码里多一个只为测试存在的分支，「起不来」仍然测不了。
2. 让测试替换掉 HTTP 模块——那是为内部模块开接缝，规格明说不开。
3. 入口多一样运行环境的事实 `webDir`，`bin.ts` 给它自己旁边的 `web/`。

**Decision**：选 3。它和 `tempDir`、`projectDir` 同类，是一个路径，不是可替换的行为，所以不算「新的可替换依赖」；测试给一个不存在的目录就是「本机的网页起不来」。静态文件在起本机的网页时一次读进内存：缺了哪个当场就知道，之后不再碰磁盘。**这一条是实现者定的，维护者没有逐条确认。**

## Design Decision: 规格没有定、实现时定下的几处

都比规格的字面更严或与它不冲突，维护者没有逐条确认；要改先改这里。

| 定了什么 | 理由 |
|----------|------|
| 口令走请求头 `X-OXY-Token`，放在 `/api/` 的网址里不算数 | 口令因此只在交给浏览器的那一个网址里出现一次；带自定义头的跨来源请求要先过浏览器的预检，而这边不发允许跨来源的头 |
| 静态文件不要口令 | 里面什么都没有；「口令不对」的画面要靠它们画出来 |
| `Host` 也认 `localhost:<端口>` | 用户照着终端手敲网址时可能写成它；它同样只能是这台机器，别的网站伪造不了 |
| 读状态的请求也查 `Origin` | 规格只要求改变状态的请求；页面自己的请求要么不带，要么带的就是自己的，多查一道没有代价 |
| 另带 `nosniff`、`Referrer-Policy: no-referrer`、`Connection: close`，意图的正文限 64 KB | 前两样是规格「不带来源信息」「只许加载自己的来源」的延伸；不留空闲连接是为了关的时候干净 |
| 站点图标是一个静态文件 `/favicon.svg`（工单 04 加的） | 内容安全策略只许加载页面自己的来源，图标不能写成内嵌的数据网址；它和别的静态文件一样不要口令 |
| 开场动画播过没有，由页面发意图 `intro-seen` 来记 | 规格只说「记在安装器这边」。没有选「第一条长连接一连上就算播过」：那样读状态的请求有了副作用，「再开一个标签页看到的是同一份」也不成立了 |
| 开场引导答过没有，由页面发意图 `guide-answered` 来记，和 `intro-seen` 分开（工单 16） | 规格定的是「另记一样、多一个意图」，名字是实现者起的。它不带任何选项：选的东西早就经 `host`、`scope` 到了安装器这边，「答完了」只是一个记号 |
| `guide-answered` 不看走到哪一步（汇总开着、安装中发它也照办） | 规格说它「只是把它记成答过」「安装器不拿它拦别的意图」，反过来也没有理由拿别的拦它；正常的页面只在浏览时发得出它 |
| 画面状态每次现算，不存上一份 | 规格要状态现查。探测只读几个目录和宿主的配置文件，不执行命令，一张列表几十次文件系统调用 |
| 切换语言的控件的名字和两项随画面状态来（`language`），不是页面自己写的 | 它们是终端界面语言提问的那一份（`Language / 语言`、`中文`、`English`），从呈现层搬到了文案里让两套界面共用；页面不另写一遍 |
| `menu` 的 `id` 给用途加前缀 `purpose:` | 「推荐」和用途在同一个清单里，用途的 id 是目录作者写的，不能假定它不叫 `recommended` |
| 汇总的标识是从计划和逐项的决定算出来的摘要，不是随机数（工单 07） | 汇总不存上一份，每次现算；标识跟着内容走，「和汇总时不一样就不装」「旧标识不装」就成了同一条判断：重算出来的标识和带回的不一样。两个标签页一个改了覆盖的决定、另一个拿着改之前的画面去确认，也在这一条里 |
| 逐项的覆盖决定每次进汇总都清空（工单 07） | 规格只说缺省不覆盖。留着上一次的决定的话，返回修改再回来时有一项已经是「覆盖」而用户未必记得；多勾一次的代价小于悄悄覆盖 |
| 意图里多带了东西就整个不照办（工单 07），不是丢掉多的照办剩下的 | 规格说的是「带了命令、路径之类的东西一律不认」。页面和安装器是一起发布的，页面从不多带；多带了说明发意图的不是这一版的页面 |
| 标识对不上时意图答 204、推新的汇总，不答 400 | 意图本身没有错，没照办的只是「装」；页面不看答复，只看推来的画面状态 |
| 进行中那一行的词照终端界面（本仓库的 skill 是「正在下载」），不是设计规范表里笼统的「正在安装」 | 说了什么由安装器定，两套界面一个说法；「等待」是网页界面多出来的词，放在文案里（`waiting`） |
| 已选照勾选的先后，汇总和执行照名字 | 已选是用户自己的清单，新勾的落在最后才找得到；执行的先后要和终端界面一样 |
| 「推荐」的标记随条目来（`mark`），不是一个布尔值 | 那个词是文案里的（中文「推荐」、英文「pick」），和终端界面同一份；页面不另写一遍 |
| 选宿主是一个一个地勾（意图 `host` 带一个 `id` 和 `on`），不是一次发整组（工单 08） | 和 `pick` 同一个样子：页面上是勾选框，一次点一个；两个标签页各改一个也不会互相覆盖。「至少留一个」因此是「去掉最后一个不照办」 |
| 意图里宿主用 `id`（`claude-code`、`codex`），不用显示的名字 | 名字是给人看的，以后可能改；`id` 是目录里指代宿主的那个词，两套界面都认 |
| 变得装不了的已选不进汇总，由算画面状态时按现在的宿主和范围过滤（工单 08） | 规格要它留在已选里但不算进将安装的项；算计划的只收会装的，汇总的标识因此也跟着宿主和范围走——改了再确认旧的那份就对不上，不装 |
| 装到项目时的目录一直在画面状态里（`target.project`），页面只在选了项目时显示 | 页面不另算目录；终端界面那一行的写法（`homeRelative`）两边同一份 |
| 状态带着 `tone`（含义），不带颜色 | 颜色是页面的事，含义是安装器的事；终端界面拿同一个 `tone` 去上样式码 |
| 挑第三方 Skill 里的 skill 是一个一个地挑（意图 `choose` 带一个 skill 的名字和 `on`），不是一次发整组（工单 09） | 和 `pick`、`host` 同一个样子：页面上是勾选框，一次点一个 |
| 挑的结果记在条目上，去掉条目也留着，再勾上时还在；装完点「继续挑选」才清空（工单 09） | 终端界面「返回修改」再问时上次勾的也还在；清空的时机和已选一致 |
| 一个 skill 都没挑的第三方 Skill 走「不进汇总」那条路（已选里带 `unavailable`，话是「一个 skill 都没挑，这一条不装」）（工单 09） | 规格只说「一个都不挑就是不装它，页面上看得出」。和装不了的用同一个机制，页面上同一种画法，「去汇总」的可点与否也同一条判断 |
| 第三方 Skill 的条目跨用途时按名字排（工单 09） | 和本仓库的 skill 一样；终端界面的列表里「带推荐的在前」只在一张列表内有意义 |
| 填 key 是 `review` 路上的一步，不另设入口（工单 10） | 规格只说「勾了要 key 的 MCP 之后在页面上填」「填 key 是盖在页面上的对话框」，没有说它什么时候出来。照终端界面的先后（勾选、填 key、汇总）：每一批去汇总时只要有要 key 的 MCP 就先经过它，填过的写着「已填」、点一下就过去。代价是都填过了也多点一下；好处是只有一条路，「换一个」也在这条路上 |
| 一个 `key` 意图填一个变量，页面在输入框的内容变了（失去焦点、按回车）时就发（工单 10） | 和 `pick`、`choose`、`host` 同一个样子；填了没有因此总是照画面状态画。页面的意图是一个接一个发的（上一个答复回来才发下一个，`main.tsx` 的 `send`），填完紧接着点「好了」不会抢到前面去。代价：哪一个请求一直不回，后面的意图都等着——本机的网页对每个意图都是当场答复，安装器不在了请求当场失败，所以没有另设期限 |
| 空的值不照办，没有「清掉一个填过的 key」的意图（工单 10） | 规格只说填过的可以换一个。终端界面里填过的在这次运行结束前也改不了；要清掉就退出重来 |
| 必填的 key 没填不算「装不了」，全是这样的时汇总是「将安装 0 项」（工单 10） | 它得留在会装的那一边才到得了填 key；填 key 之后去汇总总是照办，页面不用自己判断点得点不得。结局和终端界面一样：结果里是跳过 |
| MCP 的行没有位置（工单 10） | 终端界面 MCP 的小表也没有「位置」一栏；宿主的适配里只有项目范围的那份配置有文件名，装到项目时写进了哪个文件由「要批准」那条提醒交代 |
| 卡片上「要填 key」的标记不随填没填变，已选里的才变（工单 10） | 卡片说的是条目，已选说的是这一批；设计规范里卡片只有这两种标记 |
| 输入框是普通的文字框（`type="text"`），输入的内容靠样式画成圆点（`-webkit-text-security: disc`）；浏览器不认这条样式时（页面用 `CSS.supports` 问）退回真正的密码框。`autocomplete="off"`、`autocapitalize="off"`、`autocorrect="off"`、`spellcheck="false"`，不放在 `<form>` 里、没有 `name`，另带三家密码管理器的「别管这个框」标记（`data-1p-ignore`、`data-lpignore`、`data-bwignore`）（工单 10，审查之后改的） | 规格要两样：不显示内容，不让浏览器记住。第一版是密码框，审查指出它只做到一半——浏览器把密码框的内容当登录密码，填完会问要不要保存，点了保存 key 就进了浏览器的密码库（还可能同步到账号）。普通的文字框浏览器不当它是密码，不问；关掉自动填、拼写检查，是因为文字框缺省有这些，而拼写检查可能把内容发出去。值在发给安装器的那一刻就从输入框里清掉。**代价**：读屏软件会把打进去的字念出来（密码框不会）；圆点靠的是一条带前缀的样式，Chrome、Edge、Safari 和 Firefox 111 以上都认，实测只在 Chrome 上做过。维护者没有就这个取舍表过态 |
| 页面全都断开之后的时限是入口的一个数 `pageGraceMs`（工单 11），不是环境变量 | 规格要「时限在测试里可以调短」又不许加可替换的依赖。它和 `webDir` 同类；环境变量是给用户的口子，这个数不该让用户调 |
| 安装中断开满了时限、装完之前又连回来：当没断过，不退出（工单 11） | 规格的字面是「安装中则把这一批装完，结果打在终端上，再以 0 退出」。照字面做的话，用户中途把页面重新打开，看着进度走完的那一刻页面变成「安装器已退出」。**维护者 2026-10-12 认可了这个做法**（见任务的 `prd.md`） |
| 一批装完时没有页面连着、之后页面也没回来：结果同样打在终端上（工单 11） | 规格只说了「安装中断开满 5 秒」。装完前一两秒才关页面的也看不到结果，同一个理由 |
| 待命的按键由页面的脚本按（`terminal.press('t')`），不排进 `answers`（工单 11） | 规格写的是「预设应答里多一种『按 t』」。待命在浏览器打开的那一刻就问出去了，排进 `answers` 的话页面还没连上它就答了；什么时候按得由页面的脚本定。仍然只经提问器这一个可替换依赖 |
| `@inquirer/core` 写进了 `dependencies`（工单 11） | 待命是拿它的 `createPrompt` 写的；它本来就随四个提示子包装着，不声明就直接引用在按包隔离依赖的安装方式下会找不到。用户装下来的包一个都没多。**维护者 2026-10-12 认可**，任务的验收标准改成了「装下来的包和改之前一样」 |
| 待命画出来的头 100 毫秒里收到的键不算数（工单 11，审查之后加的） | 审查指出、在伪终端里实测证实：安装进行中敲的 `t` 会在装完的那一刻被重新画出来的待命读走。见 [终端输出](./terminal-output.md) 的「待命的提问」 |
| 收场之后任何意图都不照办（400）（工单 11） | 本机的网页那时正在关；点了「完成」和按 `t` 同时到时只认先到的那一个 |
| 按 `t` 之后这次运行里填过的 key 还在（工单 11） | 规格说「页面上的勾选丢弃」。key 记在两套界面共用的 `Runtime.keys` 里，「同一次运行里填过的不用再填」对换了界面同样成立 |
| 工具正在终端里装的那一行是 `state: 'running'` 加一个 `terminal: true`，不另立一种 `state`（工单 12） | 规格只说页面要写明「这一项正在终端里安装，请看终端」。它仍是「正在装」（进度条不算它装完、行不被当成结局），多出来的只是「去哪看」；另立一种状态的话，页面和测试里凡是数「还没有结局」的地方都要多认一种 |
| 工具的结论分成词（「已可用」「失败」）和后面的话，后面的话是 `toolResult` 那句去掉开头的逗号（英文是冒号）（工单 12） | 和第三方 Skill 的那一条同一个道理：那句话在终端界面是接在「已可用」后面的。文案一改这处要跟着看 |
| 有没装上的工具时「下一步」另说一句（`afterToolFailures`），话是实现者写的（工单 12） | 规格只说「失败的写明原因和下一步」。`afterFailures` 说没装上的没有改动原有的东西，对工具不成立；工具的原因只有退出状态和查了什么，真正的原因在终端里那条命令自己的输出里 |
| 页面开着时，工具的结论也打在终端上（它的分区的最后一行），但没有「结果」分区和合计（工单 12） | 规格说「工具的分区照现在的样子打在终端上」「除此之外终端上不重复页面上的内容」。分区照现在的样子就带着那一行结论——用户那一刻正看着终端；再列一遍和合计是「重复页面上的内容」 |
| 安装中页面关了、这一批只有一个工具：补打的仍是一个完整的「结果」分区（工单 12） | 规格说「这一批的结果照终端界面「结果」分区的样子打在终端上」。终端界面里只装一个工具时不重复「结果」分区（结论就在它的输出下面，接着是合计）；这里没有照搬：那一句说明写的是「结果如下」，下面就得有结果，别的类型的一批也都是这个样子。代价是这一行结论在终端上出现两次（分区里一次，「结果」里一次）。**维护者没有就这一条表过态** |
| 页面上改了宿主、选了项目，工具不受影响（工单 12） | 规格的「不分宿主、不受安装范围影响」。可不可选看的是检测到的宿主，和终端界面一样 |
| 一批里的工具跨用途时按名字排（工单 12） | 和别的三种一样；终端界面的列表里是「带推荐的在前、其余按名字」，跨用途时没有现成的先后 |
| 第三方 Skill 装上了而命令没有正常结束时，`rest` 是 `thirdPartyResult` 那句去掉开头的分号（工单 09） | 那句话在终端界面是接在「已安装」后面的，带着分号；网页界面的词和后面的话分成两段，分号多余。文案一改这处要跟着看 |
