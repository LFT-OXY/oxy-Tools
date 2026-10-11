# 网页界面的契约

> 网页界面的页面与安装器之间说什么（意图、画面状态）、本机的那个网页守哪几道、它什么时候起来什么时候关。页面该长什么样见 [网页界面的设计](./web-ui-design.md)；入口怎么定下用哪个界面、测试架子怎么扮演浏览器，见 [入口与测试](./installer-entry.md)。
> **逐张工单补全**（任务 `10-11-installer-web-ui`）：现在写的是工单 04 之后的样子——骨架（起得来、连得上、守得住、退得出）加上逛目录：左栏的「推荐」和各个用途、当前那张列表里的条目和它们的状态、开场动画播过没有。还不能勾选、不能装；宿主是检测到的全部，安装范围是全局。后面的工单每加一种意图、画面状态里每多一块，先改这里。

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
  | { type: 'intro-seen' };          // 页面开始播开场动画了（或决定不播）：这次运行里不再播
export interface ViewState {
  lang: 'zh' | 'en';
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
    hostsLabel: string; hosts: string[];                          // hosts 是要装进的宿主的名字
    scopeLabel: string; scopes: { id: Scope; name: string }[]; scope: Scope; // scopes 是安装范围有哪几种，照显示的先后
  };
  menu: MenuRow[];                  // 左栏的行：「推荐」（里面有条目时）在最前，然后是有条目的各个用途
  listing?: ListingView;            // 正在看的那张列表；目录里一个条目都没有时没有
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
}
export interface StatusView { host?: string; text: string; tone: Tone; rest?: string } // rest：词后面不上色的一段（版本、装了几个）
export type Tone = 'ready' | 'attention' | 'faint' | 'plain';
export type Scope = 'global' | 'project';
export interface AppView { name: string; about: string; url: string; mark?: string }

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
export function runWebUi(options: …): Promise<WebUiOutcome>; // 被 Ctrl+C 打断时抛 Interrupted
```

页面的源码在 `cli/web/`（入口 `main.tsx`，逛目录的三栏 `browse.tsx`，开场动画 `intro.tsx`，大标志 `logo.tsx`，页面自己的文字 `text.tsx`；`index.html`、`style.css`、`favicon.svg`，另有它自己的 `tsconfig.json`），由 `cli/scripts/build-web.ts` 用 esbuild 打成 `dist/web/` 下的四个静态文件：`index.html`、`app.js`、`app.css`、`favicon.svg`（`index.html` 和 `favicon.svg` 是原样拷过去的）。Preact 和 esbuild 都是开发依赖，运行时依赖一个都不加；构建产物不提交（ADR-0001）。

### 3. Contracts

**状态在安装器这边。** 页面是它的一个显示：页面连上时收到整份画面状态，之后每次变化再收到一整份；刷新，或拿着同一个网址再开一个标签页，看到的是同一份。页面不存任何东西（不用 `localStorage`、cookie）。

**算画面状态、办意图的时候不许抛。** 它们是在本机网页的请求处理函数里被调用的（`web-server.ts` 的 `state()`、`intent()`），那里没有接住的错会让整个安装器退出。现在靠的是底下的探测各自把「读不了」当成一种状态（配置读不了是「未知」，目录不在是「未装」）；后面的工单往这两条路上加会失败的事（算计划、下载、执行）时，失败要变成画面状态里的出错说明，不能往外抛。

安装器记着的只有会变的那几样（`web-ui.ts` 的 `Session`）：走到哪一步、开场动画播过没有、正在看哪张列表。**画面状态每次都从它们现算**（新连上一个页面时算一次，每个意图之后算一次再推给所有页面），不存上一份——条目的状态因此总是现探测的：页面开着的时候机器上装了什么、配了什么，刷新就看得到。

**说了什么由安装器定，怎么排由页面定。** 状态的词、数量的写法、提醒，用的是和终端界面同一份中英文案（`messages.ts`），随画面状态发给页面；页面自己的文字只有版式上固定的那些，都在 `cli/web/text.tsx` 的 `TEXT` 里，中英各一份：

| 页面自己的文字 | 为什么不随画面状态来 |
|----------------|----------------------|
| 栏名（用途、本机、目录、注意、已选） | 版式上固定的 |
| 只装进一个宿主时的那一句「装进 <宿主>」 | 终端界面里没有这句话（只检测到一个宿主时那边不问）；宿主的名字来自画面状态 |
| 条目数的写法（「21 项」） | 数来自画面状态，「项」是版式上的 |
| 按钮（去汇总、完成）、已选为空时的那一句 | 版式上固定的 |
| 还没连上时的「正在连接安装器…」 | 这时还没有画面状态 |
| 三种结束画面的标题和说明（已完成、安装器已退出、口令不对） | 后两种没有画面状态可依；「已完成」和它们是同一种画面，放在一处 |

**随画面状态来、页面不许自己写的**：用途和「推荐」的名字、分区的标题和它后面的那句话（「第三方 Skill　内容直接来自作者」「外部项目　只给链接，不安装」）、条目的名字与说明、「推荐」的标记、状态的词、不可选的原因、本机信息里的数量和提醒、「装进哪些 AI Agent」「装到哪里」和各个安装范围的名字。**终端界面的文案里已经有的话，页面一律不另写一遍**——另写的那一份迟早和原来的对不上（工单 04 的审查里就对不上过：页面写的是 Install into，终端界面是 Install into which AI Agents）。

没有画面状态时页面照浏览器的语言说（`navigator.language` 以 `zh` 开头是中文）；收到过画面状态就一直跟它的 `lang`。**经入口的测试断不到页面自己的这些字**，它们靠截图核对。

**逛目录**（工单 04；还不能勾选、不能装）

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
- `target` 是装进哪些宿主、装到哪里。**现在是定死的**：检测到的全部宿主、全局；页面上只显示，不能改（工单 08）。`hostsLabel`、`scopeLabel` 和 `scopes` 里的名字是终端界面那两个提问的文案（`pickHosts`、`pickScope`、`scopes.*.name`）。
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

**生命周期**（工单 03 的部分，工单 04 没有动；页面关掉后过几秒自己退出、`t` 改用终端界面在工单 11）

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
- Base：只检测到 Claude Code，目录里有一个只支持 Codex 的 MCP → 它在列表里，带 `unavailable: "需要别的 AI Agent"`，`statuses` 是 `[{ host: "Claude Code", text: "不支持", tone: "faint" }]`。
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
| `menu` 的 `id` 给用途加前缀 `purpose:` | 「推荐」和用途在同一个清单里，用途的 id 是目录作者写的，不能假定它不叫 `recommended` |
| 「推荐」的标记随条目来（`mark`），不是一个布尔值 | 那个词是文案里的（中文「推荐」、英文「pick」），和终端界面同一份；页面不另写一遍 |
| 状态带着 `tone`（含义），不带颜色 | 颜色是页面的事，含义是安装器的事；终端界面拿同一个 `tone` 去上样式码 |
