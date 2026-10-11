# 网页界面的契约

> 网页界面的页面与安装器之间说什么（意图、画面状态）、本机的那个网页守哪几道、它什么时候起来什么时候关。页面该长什么样见 [网页界面的设计](./web-ui-design.md)；入口怎么定下用哪个界面、测试架子怎么扮演浏览器，见 [入口与测试](./installer-entry.md)。
> **逐张工单补全**（任务 `10-11-installer-web-ui`）：现在写的是工单 09 之后的样子——骨架（起得来、连得上、守得住、退得出）、逛目录（左栏的「推荐」和各个用途、当前那张列表里的条目和它们的状态、开场动画播过没有、页面上换语言），第一条完整的线：勾选本仓库的 skill、已选、汇总、确认、进度、结果、继续挑选；页面上选装进哪些宿主、装到全局还是项目；第三方 Skill 和本仓库的 skill 一起勾、一起确认、一起装（含多个 skill 的当场挑其中哪几个）。MCP、工具还勾不上（工单 10、12）。后面的工单每加一种意图、画面状态里每多一块，先改这里。

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
  | { type: 'lang'; lang: Lang }     // 换语言：安装器按新的语言重发画面状态；终端上的语言不变
  | { type: 'pick'; kind: PickableKind; name: string; on: boolean } // 勾上或去掉一个条目：kind、name 是画面状态里那个条目的
  | { type: 'choose'; entry: string; skill: string; on: boolean }   // 含多个 skill 的第三方 Skill：要（或不要）其中的一个 skill。entry 是勾上了的那个条目的名字，skill 是它 skills 里某一项的名字
  | { type: 'review' }               // 要汇总
  | { type: 'overwrite'; item: string; on: boolean }  // 汇总里要逐项决定的那一项覆盖不覆盖：item 是那一行的 overwrite.id
  | { type: 'install'; summary: string }              // 确认安装：summary 是页面上那份汇总的标识
  | { type: 'revise' }               // 从汇总返回修改
  | { type: 'continue' }             // 装完之后继续挑选
  | { type: 'host'; host: string; on: boolean }  // 装进（或不装进）一个宿主：host 是 target.choices 里那一项的 id
  | { type: 'scope'; scope: Scope }; // 装到全局还是项目
export type PickableKind = 'skill' | 'thirdParty';  // 现在勾得上的类型；MCP 到工单 10、工具到工单 12 往里加
export type Lang = 'zh' | 'en';
export interface ViewState {
  lang: Lang;                       // 页面现在的语言：起初是系统语言或 --lang 的，之后是页面上换过的
  language: { label: string; options: { id: Lang; name: string }[] }; // 切换语言的控件：名字和各项是终端界面语言提问的那一份文案
  stage: 'open' | 'finished';       // finished：用户点了「完成」，安装器随后退出
  version: string;
  introSeen: boolean;               // 开场动画这次运行里播过没有
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
  summary?: SummaryView;            // 汇总：要了汇总、还没确认安装时有
  run?: RunView;                    // 这一批的进度与结果：确认安装之后有，点了「继续挑选」之后没有
}
export interface MenuRow { id: string; name: string; count: number; recommended?: true } // recommended：这一行是「推荐」
export interface ListingView {
  id: string;                       // menu 里的哪一行
  sections: SectionView[];          // 组件按类型分开：Skill、第三方 Skill、MCP、工具；没有条目的类型不在里面
  apps?: { title: string; note: string; entries: AppView[] }; // 外部项目另成一处；没有就没有这一块
}
export interface SectionView { kind: 'skill' | 'thirdParty' | 'mcp' | 'tool'; title: string; note?: string; entries: ComponentView[] }
export interface ComponentView {
  name: string;
  about: string;                    // 完整的说明，不截断
  mark?: string;                    // 「推荐」的标记，要标时是那个词；「推荐」那张列表里每一条都是，不标
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
  type: string;                     // 类型写出来的词（Skill、第三方 Skill）
  detail?: string;                  // 含多个 skill 的第三方 Skill 挑了几个：「3 个 skill 里挑了 2 个」
  unavailable?: string;             // 这一项现在不进汇总的原因：在现在所选的宿主和范围下装不了（和卡片上的是同一句），或含多个 skill 而一个都没挑（「一个 skill 都没挑，这一条不装」）
}
export interface SummaryView {
  id: string;                       // 这份汇总的标识：确认安装时带回
  title: string;                    // 「将安装 N 项」，N 是条目数
  entries: SummaryEntryView[];      // 每个要装的条目一段，照执行的先后
  notices: string[];                // 提醒，和终端界面的汇总是同一份话
  revise: string; install: string;  // 两个按钮上的字：终端界面那一问里的「返回修改」「开始安装」
  renewed?: true;                   // 上一次确认没有照办（状态变了，或带的是旧标识）：这是新的一份，要再确认
}
export interface SummaryEntryView { name: string; type: string; version?: string; rows: SummaryRowView[] } // version 是要装的版本，第三方 Skill 没有（装的是作者当时的最新版）；rows 每个宿主一行，第三方 Skill 是每个要装的 skill 在每个支持它的所选宿主下一行
export interface SummaryRowView {
  skill?: string;                   // 第三方 Skill 才有：这一行是条目里的哪个 skill。页面把 skill 相同的相邻几行归成一小组
  host: string;
  action: string;                   // 新装、覆盖
  overwrites?: true;                // 这一行会覆盖已有的东西
  location: string;                 // 给用户看的位置
  note?: string;                    // 备注：重装 1.0.0、1.0.0 → 1.0.1、非本工具安装、已有同名目录
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
  name: string; host: string;
  state: 'waiting' | 'running' | 'succeeded' | 'failed' | 'skipped';
  text: string;                     // 等待、正在下载（本仓库的 skill）、正在安装（第三方 Skill）、已安装、失败、跳过
  rest?: string;                    // 词后面的话：版本、原因；第三方 Skill 装上了而命令没有正常结束时是命令的结局（「安装命令退出状态 1」）
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
}): Promise<WebServer>;                    // 静态文件读不到、监听不了时拒绝

// cli/src/web-view.ts —— 把目录和本机的现状写成画面状态里的 menu 和 listing：用的是两套界面共用的那几块和同一份文案
export function menuOf(catalog: Catalog, lang: Lang): MenuRow[];
export function listingView(machine: Machine, catalog: Catalog, id: string, hosts: readonly Host[], scope: Scope, lang: Lang): ListingView | undefined; // id 不在 menu 里时没有；条目的状态现探测

// cli/src/status-text.ts —— 状态和不可选的原因写成哪个词、是什么含义。两套界面共用：终端界面照含义上样式码，网页界面原样放进画面状态
export interface StatusText { text: string; tone: Tone; rest?: string }
export function skillStatusText(t: Messages, status: SkillStatus, listed: string, arrow: string): StatusText;
export function thirdPartyStatusText(t: Messages, status: ThirdPartyStatus): StatusText;
export function mcpStatusText(t: Messages, status: McpStatus): StatusText;
export function toolStatusText(t: Messages, status: ToolStatus): StatusText;
export function unavailableReason(t: Messages, unavailable: Unavailable): string;
export const versionChange: (installed: string, listed: string, arrow: string) => string; // 「2.0 → 2.3」的写法只此一份，终端界面的汇总和结果也用它

// cli/src/web-ui.ts —— 网页界面这一边的流程：状态在这里，意图在这里变成状态
export type WebUiOutcome = 'finished' | { unavailable: 'server' | 'browser' };
export function runWebUi(options: …): Promise<WebUiOutcome>; // 被 Ctrl+C 打断时抛 Interrupted；options.runtime 是执行要的那些（和终端界面交给「执行」的是同一份）

// cli/src/web-install.ts —— 把共用的「算计划」「执行」接到画面状态上：计划写成汇总，进度记成一行行的结局
export function decided(plan: Plan, agreed: ReadonlySet<string>): Plan; // 要逐项决定的覆盖里没同意的标成不装；agreed 是同意了的那几项的标识
export function summaryId(plan: Plan): string;                          // 一份标过决定的计划的标识：取摘要，与语言无关
export function summaryView(t: Messages, plan: Plan): SummaryView;      // 把标过决定的计划写成汇总
export interface Batch { rows: …; loading: boolean; failure?: Failure; done: boolean } // 一批的进度：画面状态从它现算
export function trackBatch(plan: Plan, changed: () => void): { batch: Batch; progress: Progress }; // progress 交给共用的「执行」，每变一次调一次 changed
export function settleBatch(batch: Batch, failure?: Failure): void;     // 这一批结束了；failure 是执行中出的意料之外的错
export function runView(t: Messages, platform: NodeJS.Platform, batch: Batch): RunView;
```

页面的源码在 `cli/web/`（入口 `main.tsx`，逛目录的三栏 `browse.tsx`，汇总与进度、结果的面板 `panel.tsx`，开场动画 `intro.tsx`，大标志 `logo.tsx`，页面自己的文字 `text.tsx`；`index.html`、`style.css`、`favicon.svg`，另有它自己的 `tsconfig.json`），由 `cli/scripts/build-web.ts` 用 esbuild 打成 `dist/web/` 下的四个静态文件：`index.html`、`app.js`、`app.css`、`favicon.svg`（`index.html` 和 `favicon.svg` 是原样拷过去的）。Preact 和 esbuild 都是开发依赖，运行时依赖一个都不加；构建产物不提交（ADR-0001）。

### 3. Contracts

**状态在安装器这边。** 页面是它的一个显示：页面连上时收到整份画面状态，之后每次变化再收到一整份；刷新，或拿着同一个网址再开一个标签页，看到的是同一份。页面不存任何东西（不用 `localStorage`、cookie）。

**算画面状态、办意图的时候不许抛。** 它们是在本机网页的请求处理函数里被调用的（`web-server.ts` 的 `state()`、`intent()`），那里没有接住的错会让整个安装器退出。现在靠的是底下的探测各自把「读不了」当成一种状态（配置读不了是「未知」，目录不在是「未装」）；后面的工单往这两条路上加会失败的事（算计划、下载、执行）时，失败要变成画面状态里的出错说明，不能往外抛。

安装器记着的只有会变的那几样（`web-ui.ts` 的 `Session`）：走到哪一步、开场动画播过没有、正在看哪张列表、勾了哪些条目、汇总里同意覆盖的是哪几项、这一批的进度。**画面状态每次都从它们现算**（新连上一个页面时算一次，每个意图之后、进度每变一次算一次再推给所有页面），不存上一份——条目的状态因此总是现探测的：页面开着的时候机器上装了什么、配了什么，刷新就看得到；**汇总也是现算的**，不存上一份。

**说了什么由安装器定，怎么排由页面定。** 状态的词、数量的写法、提醒，用的是和终端界面同一份中英文案（`messages.ts`），随画面状态发给页面；页面自己的文字只有版式上固定的那些，都在 `cli/web/text.tsx` 的 `TEXT` 里，中英各一份：

| 页面自己的文字 | 为什么不随画面状态来 |
|----------------|----------------------|
| 栏名（用途、本机、目录、注意、已选） | 版式上固定的 |
| 只装进一个宿主时的那一句「装进 <宿主>」 | 终端界面里没有这句话（只检测到一个宿主时那边不问）；宿主的名字来自画面状态 |
| 想把最后一个宿主也去掉时的那一句「至少留一个」、已选标题旁的「其中 N 项现在装不了」 | 终端界面里没有：那边一个都不勾是回主菜单，已选也没有「装不了」这回事 |
| 条目数的写法（「21 项」） | 数来自画面状态，「项」是版式上的 |
| 按钮（去汇总、完成、继续挑选）、已选为空时的那一句、已选里去掉一项的那个 × 的名字 | 版式上固定的；终端界面里没有这几样 |
| 汇总标题下面的那一句、「覆盖它」和没勾时的后果、收到新的一份汇总时的那一句 | 终端界面里覆盖是确认之后一个个问的，没有这几句 |
| 安装中底部的那一句提醒、「7 / 17」的写法 | 终端界面里没有 |
| 还没连上时的「正在连接安装器…」 | 这时还没有画面状态 |
| 三种结束画面的标题和说明（已完成、安装器已退出、口令不对） | 后两种没有画面状态可依；「已完成」和它们是同一种画面，放在一处 |

**随画面状态来、页面不许自己写的**：用途和「推荐」的名字、分区的标题和它后面的那句话（「第三方 Skill　内容直接来自作者」「外部项目　只给链接，不安装」）、条目的名字与说明、「推荐」的标记、状态的词、不可选的原因、本机信息里的数量和提醒、「装进哪些 AI Agent」「装到哪里」和各个安装范围的名字；已选里类型的词；汇总的标题、操作、位置、备注、提醒和「返回修改」「开始安装」；进度与结果里每一行的词和原因、「正在安装」「结果」、合计的三个词、有没装上的时候「下一步」那一段、出错说明的全部。**终端界面的文案里已经有的话，页面一律不另写一遍**——另写的那一份迟早和原来的对不上（工单 04 的审查里就对不上过：页面写的是 Install into，终端界面是 Install into which AI Agents）。

没有画面状态时页面照浏览器的语言说（`navigator.language` 以 `zh` 开头是中文）；收到过画面状态就一直跟它的 `lang`。**经入口的测试断不到页面自己的这些字**，它们靠截图核对。

**页面上换语言**（工单 06）

- 页面起始的语言是系统语言，给了 `--lang` 就是它（和终端界面定语言的办法一样，见 [入口与测试](./installer-entry.md)）。页面上有中文 / English 的切换；它是意图 `lang`，安装器记下新的语言之后**按它重发整份画面状态**：状态的词、不可选的原因、用途与「推荐」的名字、分区的标题、条目的说明、本机信息里的数量和提醒、「装进哪些 AI Agent」「装到哪里」——凡是随画面状态来的都是新的语言，用的仍是和终端界面同一份中英文案（`messages.ts`）；页面自己的那些固定文字（`TEXT`）同时跟着 `lang` 换。
- **换语言只换说法，不换状态**：正在看哪张列表（`listing.id`）、开场动画播过没有、走到哪一步都不变；后面的工单加进来的勾选、宿主、安装范围、填过的 key 也都不变（各自在自己的工单里补一条断言）。`menu` 里各行的 `id` 不随语言变，页面上原来的那一行还是当前项。
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
- **已选不因此被去掉**：`selected` 里每一项照旧；在现在所选的宿主和范围下**装不了的**带着 `unavailable`（原因，和卡片上的是同一句，`unavailableReason`），**不进汇总**（算计划时只给可选的那些），改回去之后它没有了 `unavailable`、照常会装。已选里一个会装的都没有时 `review` 不照办（400），和已选为空一样。现在勾得上的只有本仓库的 skill，它只在一个宿主都没有时装不了，而宿主至少留一个——所以这一条要到第三方 Skill 和 MCP 勾得上（工单 09、10：「需要别的 AI Agent」「只能装到全局」）才有东西落进去。
- 这两种意图只在浏览的时候照办：汇总开着、正在装、结果还没收掉时都是 400——**一批里只有一组宿主、一个安装范围**，汇总和执行用的是确认那一刻的选择。

**第三方 Skill**（工单 09）

- 勾得上的类型多了 `thirdParty`：`pick` 的 `kind` 是它、`name` 是条目的名字。可不可选仍由 `availability.ts` 定：一个宿主都没选时「需要 AI Agent」，所选的宿主一个都不支持这个条目时「需要别的 AI Agent」；只支持其中一部分时可选，只装进支持的那些。卡片上的 `statuses` 每个所选的宿主一段，词和终端界面同一张表（未装、已装、已装 2/3、不支持）。
- **含多个 skill 的条目**在画面状态里带着 `skills`：`lead` 是终端界面那一问的话（`pickSourcedSkills`），`entries` 每个 skill 一项——名字、完整的说明、每个所选宿主一段状态（这个 skill 自己的：未装、已装；条目不支持那个宿主时是不支持）、挑了没有。它一直在画面状态里，页面在条目勾上之后才画成清单。只含一个的没有 `skills`，勾上就是装那一个。
- 挑是意图 `choose`：`entry` 是**勾上了的**、含多个 skill 的条目，`skill` 是它 `skills` 里的名字，`on` 是要还是不要。条目没勾上、只含一个 skill、名字对不上，都不照办（400）。**起初一个都没挑**（和终端界面那一问起始一个都不勾一样）；挑的结果记在 `Session.chosen` 里，换一张列表、返回修改、去掉再勾上都还在；装完点「继续挑选」时清空。
- 已选里第三方 Skill 一项（`type` 是「第三方 Skill」）。含多个 skill 的带 `detail`（「3 个 skill 里挑了 2 个」，文案 `chosenSkills`）；**一个都没挑的**带 `unavailable`，话是「一个 skill 都没挑，这一条不装」（文案 `noSkillChosen`）——它和「装不了」走同一条路：不进汇总，已选里一个会装的都没有时 `review` 不照办。宿主改到一个都不支持它时 `unavailable` 是「需要别的 AI Agent」，改回去就没有了（工单 08 留下的那一条机制，现在对本仓库的 skill 和第三方 Skill 都管）。
- 汇总里每个要装的第三方 Skill 条目一段（`type` 是「第三方 Skill」，**没有 `version`**），条目照名字排在本仓库的 skill 之后；段里每个要装的 skill（照条目里的先后）在每个支持它的所选宿主下一行，行带 `skill`，页面把 skill 相同的相邻几行归成一小组、写出 skill 的名字。目标位置已有东西的操作是「覆盖」，`note` 是「已有同名目录」（文案 `existingDir`，不带终端界面的「另行确认」：决定就在这一行下面），并带 `overwrite`（`id` 是 `thirdParty:<条目>:<skill>:<宿主 id>`），缺省不覆盖；没同意的那一项不执行命令，结果里是「跳过 未同意覆盖，保持原样」。`title` 的 N 数的是条目（和终端界面一样，一个都没挑的不算）。`notices` 多一条「第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查」（`thirdPartyNotice`），排在覆盖的提醒之后——和终端界面同一个先后。
- **画面状态里仍然没有命令**：汇总、已选、进度、结果都没有 `npx`、`skills@1`、`--agent` 这些。执行的命令和终端界面装同样的东西时逐条相同（每个 skill、每个宿主一条，带关遥测的环境变量，不经 shell；装到项目时不带 `--global`、在项目目录下运行）——规矩在 [安装 skill](./skill-install.md)。
- 执行在本仓库的 skill 之后（共用的「执行」定的）。`run.rows` 里第三方 Skill 的行 `name` 是 skill 的名字；进行中的词是「正在安装」（`installingOne`，终端界面进行中那一行的词）；成功与否看复核：装上了是「已安装」，命令没有正常结束时 `rest` 是命令的结局（「安装命令退出状态 1」，`thirdPartyResult` 那句去掉开头的分号）；没装上是「失败」加原因（「安装命令已结束，但目标位置没有 SKILL.md」「安装命令没能运行（ENOENT）」）。向 GitHub 查询失败时它们照常装（不经那次查询），本仓库的 skill 不在行里。
- `summary.id` 把第三方 Skill 的各项和它们的覆盖决定也算进去：机器上多出了同名目录、或改了挑的 skill 再拿旧标识确认，都不装。

**勾选与已选**（工单 07；现在本仓库的 skill 和第三方 Skill 勾得上）

- 勾选是意图 `pick`，**状态在安装器这边**：`kind`、`name` 是画面状态里那个条目的类型和名字，`on` 是勾上还是去掉。勾上的记在 `Session` 里，与正在看哪张列表无关——换一张列表看，之前勾的还在；一个条目同时在「推荐」和它的用途下，两处是同一个条目，一处勾了另一处的 `picked` 也是 `true`。
- `selected` 是已选，**照勾选的先后**：每项带 `kind`、`name`（去掉它时原样放进 `pick`）和类型写出来的词（文案里的 `kinds`）。已选了几个，页面数它的长度。
- **勾不上的不照办**（400，已选不变）：名字不在它那一类的目录里；`kind` 不是现在勾得上的（`PickableKind`）；这个条目现在不可选（带着 `unavailable`——哪些不可选仍由 `availability.ts` 定）。去掉一个没勾的条目照办，什么都不变。
- 换语言不动勾选。
- 这几种意图只在浏览的时候照办：汇总开着、正在装、结果还没收掉时 `pick` 和 `review` 都是 400——页面上那时盖着面板，本来也点不到。

**汇总**（工单 07）

- 意图 `review`：已选为空时不照办（400）；照办之后画面状态里多出 `summary`，并且**逐项的覆盖决定清空**（每次进汇总都从「不覆盖」起）。
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

- 一项失败不影响其余；单项失败不改变退出状态。装完之后**有没装上的**，`run.next` 是「下一步」和它下面的话（终端界面的结果行只有原因，没有这一段：这句话是网页界面多出来的，放在文案里——`afterFailures`——随画面状态来，经入口的测试断得到）。
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
- 一个宿主都没检测到时 `machine.noHosts` 是终端界面本机信息里的那一句（「没有检测到 Claude Code 或 Codex，暂时装不了组件；外部项目仍可浏览」，目录里没有外部项目时没有后半句）；检测到了任何一个就没有这个字段。
- 意图 `open`：`list` 必须是 `menu` 里某一行的 `id`，否则不照办（400）；照办之后把 `listing` 换成那一张，推给所有页面。

**开场动画播过没有**

- `introSeen` 在这次运行里起初是 `false`。页面收到的**第一份**画面状态里它是 `false` 时播开场动画，同时发意图 `intro-seen`；安装器记下之后的每一份画面状态里它都是 `true`——刷新、断开重连、再开一个标签页都不重播。
- 系统开了「减少动态效果」时页面不播，但照样发 `intro-seen`：「这次运行第一次打开」已经用掉了。
- 开场是页面上盖着的一层，播不播都不耽误页面连上安装器、收画面状态；它怎么演见 [网页界面的设计](./web-ui-design.md) 的「开场动画」。

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

**生命周期**（工单 03 的部分；页面关掉后过几秒自己退出、安装中关了页面这一批照样装完、`t` 改用终端界面在工单 11）

| 时刻 | 安装器 | 页面 |
|------|--------|------|
| 进入网页界面 | 读静态文件、起本机的网页、把网址交给链接打开器；打开器兑现之后终端上才打出那个块 | — |
| 页面连上 | 发当前的画面状态 | 画出来 |
| 没有页面连着 | 一直等着，不因为没人连、也不因为页面关了而退出（后一条工单 11 改） | — |
| 点了「完成」（意图 `finish`） | 把 `stage: 'finished'` 发给所有连着的页面，收掉长连接，关掉本机的网页，以 0 退出 | 显示可以关掉这一页；之后连接断开不再改口 |
| 终端上按了 Ctrl+C | 当场关掉本机的网页（同步的），以 130 退出 | 连接断了，重连几次连不上：显示安装器已退出 |
| 本机的网页起不来，或链接打开器拒绝 | 关掉本机的网页（起来了的话），退回终端界面，见 [入口与测试](./installer-entry.md) | 之后拿着那个网址的请求连不上 |

同一台机器上同时开两个安装器互不相干：各有各的端口和口令。

### 4. Validation & Error Matrix

| 请求 | 答复 |
|------|------|
| `Host` 不是这台机器的回环地址加这个端口 | 403，正文空 |
| `/api/` 下带着别的来源的 `Origin` | 403，正文空；意图没有被执行 |
| `/api/` 下不带口令、口令不对 | 403，正文空 |
| `/api/intent` 的正文不是 JSON、不是认得的意图 | 400，正文空 |
| 意图 `open` 的 `list` 不是字符串，或不在 `menu` 里（包括目录里有、但下面没有条目的用途） | 400，正文空；正在看的列表不变 |
| 意图 `pick` 的条目不在目录里、类型现在勾不上、条目不可选 | 400，已选不变 |
| 意图 `choose` 的 `entry` 不是勾上了的第三方 Skill、只含一个 skill、`skill` 不在它里面；浏览之外的 `choose` | 400，挑的不变 |
| **任何一种意图里多带了它不该有的东西**（`command`、`path`、`args` 之类）：每种意图认得的字段是定死的，多一个就整个不照办 | 400，什么都不变 |
| 意图 `review` 而已选为空，或已选里一个会装的都没有（装不了的、含多个 skill 而一个都没挑的）；`overwrite` 的 `item` 不在这份汇总里；`install` 的 `summary` 不是字符串 | 400 |
| 意图 `host` 的 `host` 不是检测到的宿主的 `id`；`on: false` 而它是最后一个要装进的；`scope` 的 `scope` 不是 `global`、`project`；一个宿主都没检测到时的 `host`、`scope` | 400，什么都不变 |
| 意图不合这一步：浏览时的 `overwrite`、`install`、`revise`、`continue`；汇总或安装中的 `pick`、`review`、`host`、`scope`；正在装时的 `finish`、`continue` | 400，什么都不变 |
| 意图 `install` 带的标识不是现在这一份的 | 204；不装，推来的 `summary` 带着 `renewed: true` |
| `/api/intent` 的正文超过 64 KB | 413，正文空；意图没有被执行 |
| 不认识的路径 | 404 |
| 认得的路径、方法不对（`PUT /api/intent`、`POST /api/events`、`DELETE /app.js`） | 405——前面三道先查，所以 `/api/` 下不带口令的仍是 403 |
| 请求行里的网址写坏了、根本不是 HTTP | 4xx，带着 `no-store`；安装器照常开着 |

页面这边：

| 情形 | 页面显示 |
|------|----------|
| `/api/events` 答 403 | 口令不对：一句说明，没有还能点的操作 |
| 长连接断了、重连不上，且最后一份画面状态不是 `finished` | 安装器已退出：一句说明，没有还能点的操作 |
| 最后一份画面状态是 `finished` | 已完成，可以关掉这一页 |

### 5. Good/Base/Bad Cases

- Good：带着 `OXY_TOOLS_WEB=1` 运行 → 终端上没有语言提问，本机信息之后是「网页界面开着」的块；页面连上收到本机信息；点「完成」→ 页面收到 `finished`，安装器以 0 退出。
- Base：拿着同一个网址再开一个标签页 → 两个标签页的画面状态相同。
- Good：页面发 `{"type":"open","list":"purpose:web-search"}` → 204，所有连着的页面收到新的画面状态，`listing.id` 是它，`menu` 不变。
- Base：页面第一次打开收到 `introSeen: false`，发 `intro-seen`；刷新后收到的是 `true`。
- Good：中文的页面正看着「文档处理」，发 `{"type":"lang","lang":"en"}` → 204，推来的画面状态 `lang` 是 `en`，`listing.id` 没变，左栏那一行叫 `Documents`，状态的词是 `installed`，原因是 `needs another AI Agent`；刷新拿到的还是英文；终端上没有多出一行。
- Bad：`{"type":"lang","lang":"fr"}` → 400，语言不变。
- Base：只检测到 Claude Code，目录里有一个只支持 Codex 的 MCP → 它在列表里，带 `unavailable: "需要别的 AI Agent"`，`statuses` 是 `[{ host: "Claude Code", text: "不支持", tone: "faint" }]`。
- Good：两个宿主都检测到，发 `{"type":"host","host":"codex","on":false}` → 204，`target.hosts` 是 `["Claude Code"]`，每张卡片只剩 Claude Code 那一段状态；勾了 `alpha` 去装，只有 `~/.claude/skills/alpha`，`~/.agents` 不存在。
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
- Base：链接打开器拒绝 → 终端上一行「注意」，接着是语言提问和主菜单；那个网址已经连不上。
- Bad：别的网站的页面向 `http://127.0.0.1:<端口>/api/intent` 发 `{"type":"finish"}`，带着它自己的 `Origin` → 403，安装器还开着。
- Bad：`curl http://127.0.0.1:<端口>/api/events`（不带口令）→ 403，正文是空的，里面没有宿主的名字。

### 6. Tests Required

都经主接缝（`cli/test/web-ui.test.ts`），架子扮演浏览器，见 [入口与测试](./installer-entry.md)：

- 正常路径：链接打开器恰好被调用一次；页面收到本机信息（宿主、数量、被跳过的那一句）；`finish` 之后退出状态 0、页面收到 `finished`；终端上有那个块和整条网址，没有语言提问。
- 四道各一条：不带口令、口令不对（含「口令放在网址里不算数」）、`Host` 不对（含 `localhost:<端口>` 认、`localhost.evil.example` 不认）、别的来源的 `Origin`——都是 403 且正文是空的；最后一条之后安装器还开着。
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
- 不可选的原因每种一条：需要别的 AI Agent（第三方 Skill、MCP、工具各一个）、不支持当前系统、一个宿主都没有（全部组件，连同本机信息里的那一句提醒）。「只能装到全局」要等能选安装范围（工单 08）。
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

装本仓库的 skill 的在 `cli/test/web-install.test.ts`，同样经主接缝（脚本的第二个参数给出这次运行的主目录和项目目录，见 [入口与测试](./installer-entry.md)）：

- 勾选：跨两个用途各勾一个，换用途之后之前勾的还在；同一个条目在「推荐」和它的用途下一处勾了另一处也是；已选照勾选的先后、能去掉；勾不上不可选的条目（一个宿主都没有）、不在目录里的、现在勾不上的类型；意图里多带了命令、路径的整个不照办（`pick` 和别的几种各试）；换语言后勾选不变。
- 汇总：已选为空去不了；每个 skill 在每个宿主下一行，带位置、操作和备注（新装、重装、版本不同、非本工具安装各一条）；有会覆盖的就有那句提醒；画面状态里没有命令；返回修改后勾选还在。
- 一次装上：主目录里的东西与终端界面装同样的东西装出来的逐个文件相同（安装标记里的时间除外）；进度从等待、正在下载到已安装；合计；`continue` 之后已选清空、状态是新的。
- 非本工具安装：缺省不覆盖（目录原样，结果里是跳过）；同意后整目录替换。
- 展示的和执行的是同一份：旧标识的确认不装；汇总之后状态变了不装、推来新的一份带 `renewed`，拿新的标识再确认才装。
- 一项失败其余照常，退出状态 0，结果里有「下一步」那一段（全都装上时没有）；向 GitHub 查询失败：出错说明的标题、原因、下一步，一个都没装，安装器还开着、能接着挑。
- 不合这一步的意图都是 400。

选宿主、选安装范围的在 `cli/test/web-target.test.ts`，同样经主接缝：

- 起初是检测到的全部宿主、全局；`choices` 的 `id`、名字、先后；只检测到一个时 `choices` 只有一项；一个都没有时是空的。
- 两个宿主只选一个：`target.hosts` 和每张卡片的 `statuses` 只剩它；装的东西只进它的目录，另一个宿主的目录不存在。
- 去掉最后一个宿主不照办（400），`target.hosts` 不变；不是检测到的宿主的 `id` 不照办；一个都没检测到时 `host`、`scope` 都不照办。
- 装到项目：`target.project` 的那句话和目录（架子的项目目录不在主目录里，是全路径）；全局装过的在项目里写「未装」；汇总里位置是相对项目目录的路径；装完落在项目目录下各宿主项目范围的 skill 目录里，主目录里每个文件的内容和装之前相同；改回全局之后状态是全局的。
- 换语言后这两个选择不变；刷新后还是改过的。
- 汇总开着的时候 `host`、`scope` 都是 400。
- 「变得装不了的留在已选里、不进汇总、改回去恢复」要等勾得上的类型里有会因为宿主或范围而装不了的（工单 09、10），在那两张工单里补。

装第三方 Skill 的在 `cli/test/web-third-party.test.ts`，同样经主接缝：

- 只含一个 skill 的正常路径：已选里的类型、汇总的段与行（没有版本、`skill`）、提醒、结果；记录到的命令与用终端界面装同样的东西时逐条相同（同一份目录和主目录，终端界面那一跑用预设应答走到装完）；画面状态的 JSON 里没有 `npx`、`skills@1`、`--agent`。
- 含多个的：卡片的 `skills`（那一句、每个 skill 的说明和状态、挑了没有）；挑两个 → `detail`、汇总两小组、命令每个 skill 每个宿主一条；一个都不挑 → 已选里那句、只勾了它时去不了汇总、和别的一起时它不进汇总；挑的结果在换用途、返回修改、去掉再勾上之后还在，点「继续挑选」之后清空；`choose` 的几种不照办（没勾上、只含一个、名字对不上、多带了字段）。
- 宿主：条目只支持 Codex 而两个都选 → 只装进 Codex；去掉 Codex → 已选里「需要别的 AI Agent」、不进汇总、`review` 被拒；勾回恢复；只检测到 Claude Code 时不可选、`pick` 400。
- 已有同名目录：缺省不覆盖（没有命令、目录原样、结果是跳过）；同意后覆盖（命令执行）。
- 命令结束了但没装上 → 失败行的原因；没能运行（ENOENT）→ 那句；装上了而命令非零退出 → 「已安装」加「安装命令退出状态 1」。
- 混在一批里：本仓库的 skill 的行在前、第三方 Skill 的在后，只有第三方 Skill 的命令；向 GitHub 查询失败时第三方 Skill 照常装。
- 装到项目：命令不带 `--global`、`cwd` 是项目目录，位置是相对路径，复核按项目目录。
- 换语言后勾选和挑的都不变，`detail`、`unavailable`、`lead` 换成新的语言。

**经入口的测试断不到的**（页面只把画面状态画出来）：三栏的版式、开场动画怎么演、键盘与焦点、链接是不是在新标签页打开——这些在真实的浏览器里看：版式、开场的定格和键盘焦点在网页界面的预览里各有一格（`npm run preview:web`，见 [网页界面的设计](./web-ui-design.md) 的「网页界面的预览」），其余的手动核对。

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

// 把将执行的命令放进画面状态「反正页面不画」：页面用不上的东西不出安装器
summary: { entries, commands: plan.thirdPartyJobs.map((job) => job.command) }

// 页面自己写结果里的话：经入口的测试断不到，也不随安装器的文案走
<p>{t.afterFailures}</p>                  // TEXT 里的
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
| 第三方 Skill 装上了而命令没有正常结束时，`rest` 是 `thirdPartyResult` 那句去掉开头的分号（工单 09） | 那句话在终端界面是接在「已安装」后面的，带着分号；网页界面的词和后面的话分成两段，分号多余。文案一改这处要跟着看 |
