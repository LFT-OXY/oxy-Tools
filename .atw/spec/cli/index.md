# CLI 层开发规范

> 适用范围：`cli/` 下的安装器 `oxy-tools`（TypeScript，发布到 npm），以及它怎么读取和校验仓库根的两个目录文件。两个文件有哪些字段、格式版本号怎么升、对 A Team Workflow 的承诺，写在 skills 层的 [清单与版本](../skills/manifest-versioning.md)。

---

## Overview

`cli/` 是一个自成一体的 npm 包：交互式安装器，从目录里挑选条目装进宿主。为什么放在本仓库、要守哪三条规矩，见 [ADR-0001](../../../docs/adr/0001-installer-lives-in-skill-repo.md)；目录为什么运行时现拉，见 [ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)。

本层写的都是已经落地的做法：启动、定下用哪个界面（缺省是网页界面：在页面上逛目录，选装进哪些宿主、装到全局还是项目，装本仓库的 skill、第三方 Skill、MCP（要 key 的在页面上填）和工具（在页面上勾选、命令在终端里跑）；页面关了自己退出，终端上按 `t` 改用终端界面。带了 `--terminal`、远程连接、没有桌面时直接用终端界面，浏览器打不开时退回它；为什么这样定见 [ADR-0004](../../../docs/adr/0004-web-ui-by-default-terminal-ui-as-fallback.md)）、问语言、读目录、按用途进入的主菜单（第一行是「推荐」）、两个宿主与宿主选择、把 skill 装进宿主、skill 的状态探测与覆盖确认、选择安装范围（全局或项目：本仓库的 skill、第三方 Skill 和 Claude Code 的 MCP 可以装到项目，Codex 的 MCP 只能装到全局）、第三方 Skill 的安装（调用 skills CLI）、MCP 的安装（含带 API key 的）、工具的安装、按用途进入后几种类型一起勾选一起装、列出外部项目的说明与链接、出错、界面设计、目录校验命令与 CI。

```
cli/
├── package.json          # 包描述文件只在这里，仓库根不放
├── README.md             # npm 页面上显示的那一份，中英各一段
├── LICENSE               # MIT，只管 cli/
├── src/
│   ├── bin.ts            # 把真实依赖接到入口上，别的什么都不做
│   ├── installer.ts      # 入口 runInstaller，也是测试的主接缝
│   ├── catalog.ts        # 目录：来源（含把 skill 的文件取下来）、读取、校验
│   ├── hosts.ts          # 宿主适配：每个宿主一份，回答在不在、skill 装到哪个目录（全局的和项目范围的各一个）、怎么拼添加和移除 MCP 的命令、去哪看 MCP 配没配过（用户级的一份，项目范围的可选的一份）
│   ├── install-skill.ts  # 安装 skill：只认“条目 + 目标目录”
│   ├── skill-status.ts   # 状态探测：一个 skill 在某个 skill 目录下的现状，只看目标目录
│   ├── install-third-party.ts  # 安装第三方 Skill：拼出 skills CLI 的那条命令，执行后看目标位置有没有 SKILL.md
│   ├── third-party-status.ts   # 状态探测：第三方 Skill 的各个 skill 在某个宿主下装没装，只看目标位置有没有东西
│   ├── install-mcp.ts    # 安装 MCP：要执行哪几条宿主的命令，依次执行
│   ├── mcp-status.ts     # 状态探测：一个 MCP 在某个宿主下的现状，只读所选安装范围下的那份配置
│   ├── install-tool.ts   # 安装工具：按系统选命令，执行后用条目声明的检查方式复核
│   ├── tool-status.ts    # 状态探测：一个工具装没装，只照检查方式看一眼
│   ├── run-command.ts    # 外部命令执行器的正式实现：不经 shell 的，和整行交给 shell 的
│   ├── listing.ts        # 两套界面共用：「推荐」和各个用途的列表里有什么、怎么排
│   ├── availability.ts   # 两套界面共用：列表里每个条目在所选宿主和安装范围下的状态、可不可选与原因；MCP 那几栏哪些宿主要另作说明
│   ├── plan.ts           # 两套界面共用：算计划——把勾选算成要装的每一项
│   ├── run-plan.ts       # 两套界面共用：执行——照计划逐项去装，把进度报给接收方
│   ├── status-text.ts    # 两套界面共用：状态和不可选的原因写成哪个词、是什么含义
│   ├── notice-text.ts    # 两套界面共用：汇总后面的提醒、列表里 MCP 那几栏的说明写成哪几句、什么先后；给用户看的一条完整命令怎么写
│   ├── flow.ts           # 终端界面的交互流程：逐步问什么、显示什么；算和装都经上面那几块
│   ├── web-ui.ts         # 网页界面这一边的流程：画面状态在这里，页面发来的意图在这里变成状态
│   ├── web-view.ts       # 把目录和本机的现状写成画面状态里的那几块：左栏的行、正在看的那张列表
│   ├── web-install.ts    # 网页界面怎么装：把共用的「算计划」「执行」接到画面状态上——计划写成汇总（带标识），进度记成一行行的结局；安装中页面关了时把结局重报给呈现层
│   ├── web-server.ts     # 本机的网页：只管 HTTP——静态文件、口令和另外几道检查、长连接、收意图
│   ├── web-protocol.ts   # 页面和安装器共用的类型：意图、画面状态。不引用别的模块
│   ├── ui.ts             # 呈现层：一切终端输出的样式
│   ├── messages.ts       # 中英文案
│   ├── prompter.ts       # 提问器的接口：单选、多选、是否题、隐藏输入、待命
│   ├── inquirer-prompter.ts  # 提问器的正式实现（@inquirer）；待命是用 @inquirer/core 的 createPrompt 写的
│   ├── open-link.ts      # 链接打开器的正式实现：把网址交给系统的默认浏览器。只用来打开网页界面
│   ├── text.ts           # 显示宽度、截断、折行
│   └── version.ts        # 版本号：从 cli/package.json 读
├── web/                  # 网页界面的页面：源码，不进 tsc 的构建，由 esbuild 打成 dist/web/ 下的静态文件
│   ├── index.html
│   ├── main.tsx          # 入口：连上安装器、收画面状态、发意图，定下画哪个画面（Preact）
│   ├── browse.tsx        # 逛目录的三栏：用途、条目、已选
│   ├── panel.tsx         # 盖在浏览上面的面板：汇总，和确认之后的进度与结果；填 key 的对话框也用它的上中下三段
│   ├── keys.tsx          # 填 key 的对话框：每个要 key 的 MCP 一段，输入框不显示内容
│   ├── intro.tsx         # 开场动画那一层
│   ├── logo.tsx          # OXY 大标志（像素图形）
│   ├── text.tsx          # 页面自己的文字，中英各一份
│   ├── style.css         # 样式：颜色的变量、共用的部件、各个画面
│   ├── favicon.svg       # 站点图标
│   └── tsconfig.json     # 页面自己的类型检查：带浏览器的类型，不带 Node 的
├── test/                 # 只经入口断言的测试，和测试架子
└── scripts/              # 仅供开发的脚本，不进 dist/，不随 npm 包发布
    ├── build-web.ts          # 把页面打成 dist/web/ 下的静态文件；npm run build、测试的 globalSetup 和两份预览都调它
    ├── preview.ts            # 界面预览页（终端界面的）
    ├── preview-web.ts        # 网页界面的预览：让本机的 Chrome 把真实的页面拍下来
    ├── preview-samples.ts    # 两份预览共用的样例：样例条目、这台机器事先的样子
    ├── chrome.ts             # 驱动本机装着的 Chrome（调试协议走管道，不加依赖）；只有网页界面的预览用
    ├── validate-catalog.ts   # 目录校验命令
    └── check-upstream.ts     # 上游核对命令：目录里的第三方 Skill 和作者仓库还对不对得上（要联网，不进 CI）
```

---

## 自成一体的三条规矩

`cli/` 要能原样搬到独立的仓库去（ADR-0001），所以守三条，每条都有东西卡着：

| 规矩 | 现在靠什么守住 |
|------|----------------|
| **自带包描述文件，仓库根不放** | `package.json`、`package-lock.json`、`tsconfig*.json`、`vitest.config.ts`、`.gitignore`、`README.md`、`LICENSE` 都在 `cli/` 里；仓库里除了上游整包自带的，只有 `cli/package.json` 这一个包描述文件 |
| **只通过目录来源读数据，不引用 `cli/` 以外的文件** | 目录来源缺省是 GitHub 上本仓库 `main` 分支的原始文件地址（`catalog.ts` 的 `githubCatalogSource`）。本地目录只来自运行的人给的路径：环境变量 `OXY_TOOLS_CATALOG`、目录校验命令和上游核对命令的参数（后者另有 `--repos` 给的本地仓库目录）——所以脚本和 `package.json` 里都不写死 `..`；测试用自己写到临时目录的样例，不读仓库真实的目录数据 |
| **构建和测试只扫 `cli/` 内部** | `vitest.config.ts` 的 `include` 只有 `test/**/*.test.ts`；`tsconfig.json` 的 `include` 只有 `src`、`test`、`scripts` 和 `vitest.config.ts`，页面另有 `web/tsconfig.json`（只有 `web` 和共用的类型那一个文件）；CI 只检出 `cli/` 和仓库根的文件。`skills/` 下的上游整包自带测试和 `package.json`，不能被扫进来 |

随之而来的两条：

- **npm 包只含构建产物**：`package.json` 的 `files` 只有 `dist`，另有 npm 自动带上的 `package.json`、`README.md`、`LICENSE`。不含任何 skill 内容，不含目录数据，不含 `scripts/`、`test/` 和页面的源码 `web/`。网页界面的页面是构建产物的一部分：`dist/web/` 下的 `index.html`、`app.js`、`app.css`、`favicon.svg`，运行时依赖不因它多一个（Preact 打进了 `app.js`，它和 esbuild 都是开发依赖）。在 `cli/` 下 `npm pack --dry-run` 能看到包里有什么。
- **依赖目录和构建产物不提交**：`cli/.gitignore` 挡着 `node_modules/`、`dist/`、`.preview/` 和 `npm pack` 打出来的 `*.tgz`。这同时是对 A Team Workflow 的承诺——它安装额外 skill 时下载的是整个仓库，见 [清单与版本](../skills/manifest-versioning.md)。

---

## 入口与两个测试接缝

安装器对外只有一个入口 `runInstaller(options)`，内部分七块（目录、宿主适配、安装、状态探测、两套界面共用的部分、终端界面的交互流程、网页界面的流程与本机的网页），全部经入口被测到。入口接受**五样可替换的外部依赖**，正式运行时由 `bin.ts` 接上真实的实现，测试时全部替换：

| 依赖 | `options` 里的名字 | 正式实现 | 测试里 |
|------|--------------------|----------|--------|
| 目录来源 | `catalogSource` | `githubCatalogSource()` | 写到临时目录的本地样例；要测默认来源时用假的 GitHub |
| 用户主目录 | `homeDir` | `os.homedir()` | 临时目录 |
| 外部命令执行器 | `runCommand` | `systemCommandRunner()` | 只记录不执行，可预设结果 |
| 提问器 | `prompter` | `inquirerPrompter()` | 按预设的应答回答；要核对提问实际打出的东西时换成真实的交互库加脚本按键 |
| 链接打开器 | `openLink` | `systemLinkOpener(platform)` | 只记录 |

启动参数、环境变量、操作系统、输出流、项目目录（运行安装器时所在的目录）、放临时文件的目录、网页界面的静态文件所在的目录、网页界面的页面全都断开之后等多久（`pageGraceMs`）和“提问之外按了 Ctrl+C”的信号也都从 `options` 来，入口不直接碰 `process`；它们是运行环境的事实，不算外部依赖。

测试只有两个接缝，只经由对外行为断言，不为内部模块单独写测试：

| 接缝 | 是什么 | 怎么用 |
|------|--------|--------|
| 主接缝 | 安装器入口 | `cli/test/harness.ts` 的 `run({ answers, catalog, home, project, onPath, … })`：给定一份目录、主目录和项目目录的初始状态和一串应答，断言终端上输出了什么、退出状态、记录到的命令和链接、主目录和项目目录里有什么。测网页界面时给 `page`（一段「在页面上做什么」的脚本）：架子拿着链接打开器记下的网址，经真实的本机 HTTP 扮演浏览器，不另开接缝。见 [入口与测试](./installer-entry.md) |
| 辅助接缝 | 目录校验命令、上游核对命令 | `npm run validate-catalog -- <目录>`：测试把它当子进程跑，只断言标准输出、标准错误和退出状态；维护者和 CI 用同一条命令检查仓库里真实的目录数据。`npm run check-upstream -- <目录>` 是同一种跑法，测试里让它对着本地的假仓库目录，联网的那一段手动核对。见 [目录校验与 CI](./catalog-validation.md) |

界面预览页和网页界面的预览也经主接缝驱动安装器，但它们不是测试：观感由它们加视觉评审把关，见 [界面设计](./ui-design.md) 和 [网页界面的设计](./web-ui-design.md)。

---

## 两套界面共用的部分

安装器有两套界面：网页界面（缺省）和终端界面（退路）。网页界面是任务 `10-11-installer-web-ui` 加的，下面这几块是那时从终端界面的流程里分出来的。**装什么、怎么装只写一遍**：下面几块不依赖提问器和呈现层——不提问、不往终端上打东西——两套界面都经它们走。界面自己只管在哪里挑、在哪里看。

| 模块 | 管什么 | 给它什么 | 它给出什么 |
|------|--------|----------|------------|
| `listing.ts` | 列表里有什么、怎么排 | 目录（和一个用途） | `recommendedListing`、`purposeListing`：一张列表里的条目，按类型分好、排好先后；`purposeCounts`：有条目的用途连同条目数，一行都没有的用途不在里面 |
| `availability.ts` | 每个条目的状态、可不可选与原因 | 本机的事实（`Machine`）、一张列表、所选的宿主、安装范围 | `listingStatus`：每个组件在每个所选宿主下的状态；不可选的另带原因 `Unavailable`（一个宿主都没有、需要别的宿主、只能装到全局、不支持当前系统）。原因是一个种类，写成哪句话由界面照文案定。`mcpColumnHosts`：MCP 那几栏里要另作说明的宿主——选了项目而它的 MCP 只能装到全局的、配置读不到的 |
| `plan.ts` | 算计划 | 本机的事实、所选的宿主、安装范围、勾选（含第三方 Skill 里挑了哪几个 skill）、填过的 key 的**变量名** | `planInstall`：要装的每一项——每个组件在每个宿主下一项，连同位置、状态、将执行的命令、要不要另问覆盖（`asksOverwrite`）、缺哪个必填的 key（`missingVariable`），以及汇总要提醒的事（`notices`） |
| `run-plan.ts` | 执行 | 计划、进度的接收方（`Progress`），和执行要的外部依赖（目录来源、外部命令执行器、临时目录、中断信号、填过的 key） | `runPlan`：照本仓库的 skill、第三方 Skill、MCP、工具的先后逐项去装，每一项的开始、结局、跳过都报给接收方 |
| `status-text.ts` | 状态和不可选的原因怎么说 | 一份文案（`Messages`）和一个状态，或一个不可选的原因 | `skillStatusText`、`thirdPartyStatusText`、`mcpStatusText`、`toolStatusText`：那个词（`text`）、它的含义（`tone`：就绪、留意、退后、不上色）、词后面不上色的一段（`rest`：版本、装了几个）；`unavailableReason`：原因的那句话。**终端界面照含义上样式码（`ui.ts` 的 `statusCell`），网页界面原样放进画面状态**——两套界面的词因此不会各说各的 |
| `notice-text.ts` | 汇总后面的提醒、列表里 MCP 那几栏的说明怎么说，命令怎么写成一行 | 一份文案和计划里的 `PlanNotices`（终端界面另给 `placeholders`）；或 `mcpColumnHosts` 给出的那两组宿主 | `noticeTexts`：提醒的那几句，照固定的先后（覆盖、第三方 Skill、占位符、明文 key、要批准、缺 key、要登录）；`mcpColumnNoticeTexts`：MCP 那几栏的说明，只能装到全局的在前、配置读不到的在后；`commandLine`：给用户看的一条完整命令，key 的位置是占位符 |

要守的几条：

- **这几块不引用 `prompter.ts`、`ui.ts`**，连类型也不引用。两套界面都要的类型（一项安装的目标、结局、运行环境的 `Environment`）放在这几块或它们下面的模块里，呈现层反过来引用。
- **状态都是现探测的**：`listingStatus` 和 `planInstall` 每调一次都重新看一遍目标目录和宿主的配置，不记上一次的结果。界面要新的状态就再调一次。
- **算计划时不装，执行时不问**：`planInstall` 不执行任何命令、不下载；`runPlan` 不提问。用户没同意覆盖的那些项，由界面在执行之前标成 `declined`，执行时跳过。
- **key 的值不进计划、不进进度的报告**：`planInstall` 只收变量名（哪个 MCP 填过哪几个）；值留在内存里（`Runtime.keys`），只由 `runPlan` 交给安装动作。见 [安装 MCP](./mcp-install.md) 的「带 key 的 MCP」。
- **勾了却装不了的不进计划**：所选的宿主都不支持的条目、装不到所选范围的 MCP、装不了的工具，即使在勾选里也不产生要装的项（终端界面里它们本来就勾不上；网页界面里它们会留在已选里）。
- **执行被 Ctrl+C 打断时抛 `Interrupted`**（`run-plan.ts`），入口把它和 `PromptAborted` 一样当作以 130 退出；`run-plan.ts` 因此不必认识提问器。
- **不为这几块单独写测试**：它们经入口被测到，和别的内部模块一样。

签名（只列两套界面要对上的那些；字段的说明在源码的注释里）：

```ts
// cli/src/availability.ts
export interface Machine { hosts: readonly Host[]; env: Environment; platform: NodeJS.Platform; homeDir: string; projectDir: string } // hosts 是认识的全部宿主
export type Unavailable = { kind: 'no-host' } | { kind: 'hosts' } | { kind: 'global-only' } | { kind: 'os'; os: ToolOs };
export function listingStatus(machine: Machine, listing: Pick<Listing, 'skills' | 'thirdParty' | 'mcps' | 'tools'>, hosts: readonly Host[], scope: Scope): ListingStatus;
// ListingStatus 的每一行：{ skill | entry | mcp, statuses（与 hosts 一一对应）, unavailable? }；工具是 { tool, status, unavailable? }

// cli/src/plan.ts
export interface Selection {
  hosts: readonly Host[]; scope: Scope;                                              // 这一批要装进的宿主、安装范围
  skills: readonly Skill[]; mcps: readonly Mcp[]; tools: readonly Tool[];            // 各类照给的先后装
  thirdParty: readonly { entry: ThirdPartySkill; wanted: readonly SourcedSkill[] }[]; // wanted 一个都没有就是这一条不装
  filledKeys: ReadonlyMap<string, ReadonlySet<string>>;                              // MCP 的名字 → 填过的变量名，没有值
}
export interface Plan { jobs: SkillJob[]; thirdPartyJobs: ThirdPartyJob[]; mcpJobs: McpJob[]; toolJobs: ToolJob[]; notices: PlanNotices }
export function planInstall(machine: Machine, selection: Selection): Plan;
export function homeRelative(machine: Pick<Machine, 'homeDir'>, path: string): string; // 给用户看的路径：主目录写成 ~

// cli/src/run-plan.ts
export interface Runtime extends Machine { source; tempDir; githubToken; interrupt; runCommand; pinned?; keys } // 入口交进来的外部依赖，加这次运行里记着的东西
export interface Progress { loading(what: 'skillFiles'): { done(): void }; failure(failure: Failure): void; installation(skills, thirdParty, mcps, tools): { skill, thirdParty, mcp, tool, finish } }
export async function runPlan(runtime: Runtime, plan: Plan, report: Progress): Promise<void>;
export class Interrupted extends Error {}
```

| 情形 | 共用的部分怎么办 |
|------|------------------|
| 所选的宿主是空的 | `listingStatus`：skill、第三方 Skill、MCP 每一行都是 `no-host`（它排在别的原因前面）；`planInstall`：这三类没有任何一项 |
| 勾了的工具装不了（没有检测到宿主、系统不支持、要的宿主不在） | 不进 `toolJobs` |
| MCP 必填的 key 不在 `filledKeys` 里 | 它在每个装得了的宿主下各有一项 `steps` 为空、带 `missingVariable` 的；`notices.missingKeys` 里说一次；执行时 `skip` |
| `SkillJob` / `ThirdPartyJob` 带着 `declined` | 执行时 `skip`，不下载、不执行命令；本仓库的 skill 全都 `declined` 时不向 GitHub 查询 |
| 向 GitHub 查询失败 | `report.failure(…)` 一次；这一批本仓库的 skill 不装、也不在 `installation` 里，其余照常 |
| 一项装不上（`SkillInstallError`、`McpInstallError`，或复核没过） | 把结局交给接收方，接着装下一项；`runPlan` 不因此抛错 |
| 执行途中 `interrupt` 触发 | 抛 `Interrupted`，入口以 130 退出 |

加网页界面时逐样挪进共用部分的（一批可以跨用途之后才有的问题；以后再有两套界面都要的东西，同样挪过来，不要在页面那边另写一遍）：

- **一批跨几张列表时各类的先后**：`Selection` 照给的先后装，终端界面给的是列表里的先后（一批只来自一张列表）。网页界面的一批可以跨用途：**本仓库的 skill 按名字**（工单 07 定的，用的是 `listing.ts` 的 `byName`；终端界面的两种列表里它们也都是按名字，所以两套界面装同样的东西先后一样）；**第三方 Skill 的条目也按名字**（工单 09 定的，同样用 `byName`；条目里的各个 skill 照条目里的先后，和终端界面一样——终端界面的列表里条目是「带推荐的在前、其余按名字」，跨用途时没有现成的先后，网页界面不照推荐标记排）。**MCP 的条目也按名字**（工单 10 定的，同样用 `byName`：问 key 的先后不在这里——填 key 的对话框照勾选的先后列）。**工具也按名字**（工单 12 定的，同样用 `byName`）。
- **汇总里提醒的话**（`PlanNotices` 写成哪几句、什么先后）：**已经在共用的 `notice-text.ts` 里**（工单 09 挪的）——`noticeTexts(t, notices, placeholders)`，终端界面的 `summaryNotices` 和网页界面的 `summaryView` 都调它；给用户看的一条完整命令怎么写（`commandLine`）也在那里。**列表里 MCP 那几栏的说明**（哪个宿主的 MCP 只能装到全局、哪个宿主的配置读不了）也已经是共用的（工单 10 挪的）：数出是哪几个宿主的是 `availability.ts` 的 `mcpColumnHosts`，写成哪两句的是 `notice-text.ts` 的 `mcpColumnNoticeTexts`；终端界面打在列表上方，网页界面放进 MCP 那一区的 `notices`。
- **`notices` 里没有「key 以占位符显示」**：那一条说的是终端界面展示的命令，由 `flow.ts` 自己加（`placeholders`，`noticeTexts` 的第三个参数，网页界面不给）；网页界面的汇总不列命令，没有它。

**网页界面怎么用它们**（`web-view.ts`，工单 04 之后）：左栏的行来自 `recommendedListing` 和 `purposeCounts`；正在看的那张列表先 `listingStatus`（宿主和安装范围是页面上选的，起初是检测到的全部、全局，记在 `web-ui.ts` 的 `Session` 里——工单 08），再经 `status-text.ts` 把每个状态写成词和含义、把不可选的种类写成那句话。每算一次画面状态都重新探测一遍。

装的那一半（`web-ui.ts`、`web-install.ts`，工单 07 之后）：一个条目勾不勾得上问的是 `listingStatus`（带着不可选原因的勾不上）；汇总是 `planInstall` 的结果写成的，要逐项决定的覆盖（`asksOverwrite` 的那些）没同意的先标上 `declined`，再从这份标过的计划算出汇总的标识；确认时重算一遍，标识对得上才 `runPlan(runtime, plan, progress)`——**网页界面的进度接收方把每一项的结局记进一批的进度，每变一次推一次画面状态**。入口把执行要的东西整理成一份 `Runtime`，两套界面拿到的是同一份（钉住的来源、填过的 key 都在里面）。**网页界面填的 key 记进的就是这份 `Runtime.keys`**（工单 10）：交给 `planInstall` 的只有填过的变量名，值到 `runPlan` 执行时才取出来——和终端界面一字不差的一条路，所以「值不许去的地方」只多出网页这一边的几处（见 [安装 MCP](./mcp-install.md)）。意料之外的错写成出错说明用的是 `run-plan.ts` 的 `unexpected`，入口的收尾和网页界面的结果用的是同一个。

**终端界面怎么用它们**（`flow.ts`）：主菜单的行来自 `recommendedListing` 和 `purposeCounts`；进入一张列表后，每一轮先 `listingStatus` 再画混合列表，勾完之后问第三方 Skill 里要哪几个、问 key，然后 `planInstall`，照计划画汇总、将执行的命令和提醒，确认后逐项另问覆盖（`asksOverwrite` 的那些），最后 `runPlan(session, plan, session.ui)`——**终端界面的进度接收方就是呈现层**。外部项目不在计划里：终端界面勾了它们，装完之后自己列出说明与链接。

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [入口与测试](./installer-entry.md) | `runInstaller` 的签名与可替换依赖、启动顺序与定下用哪个界面（缺省网页界面，`--terminal`、远程连接、没有桌面时用终端界面）、链接打开器的契约（只用来打开网页界面）、退出状态、主菜单与流程、目录读取与校验的契约（含外部项目条目的字段，用途清单、条目的用途与推荐标记、本仓库 skill 的用途）、测试架子的用法 |
| [安装 skill](./skill-install.md) | 宿主适配与探测、装进哪些宿主、按安装范围装到全局还是项目的哪个目录、skill 的四种状态、覆盖与单独确认、钉住来源与按提交下载、临时目录与整体替换、安装标记、出错矩阵；第二个 Scenario 是第三方 Skill：`catalog.json` 的条目与校验、skills CLI 那条命令的写法与环境变量、状态只看目录在不在、成败看复核、覆盖前另问、清单 |
| [安装 MCP](./mcp-install.md) | `catalog.json` 的 MCP 条目与校验（含环境变量）、两个宿主的命令写法与配置文件、三种状态加「不支持」、已配置与状态未知时怎么装、带 key 的 MCP 怎么问怎么传、key 的值不许去的地方、外部命令执行器的契约、Codex 添加远程地址时当场登录的提醒、出错矩阵 |
| [安装工具](./tool-install.md) | `catalog.json` 的工具条目与校验、安装命令是一整行 shell、按系统选命令、两种检查方式与两种状态、哪些条目不可选、它在混合流程里排在哪、成功与否只看复核的结论矩阵、外部命令执行器的 shell 模式与手动核对的办法、已知的限制 |
| [界面设计](./ui-design.md) | **只管终端界面。** 画面该长什么样：视觉方向「账本」、版式的总规则、颜色与符号的含义、状态的写法、标题区、各类画面的版式要点、深浅色与不显示颜色和没有 Unicode 时的要求、界面预览页的生成命令和用法、还没经维护者确认的画法 |
| [网页界面的契约](./web-ui-contract.md) | 页面与安装器之间说什么（意图、画面状态）、逛目录时画面状态里有什么（左栏的行、列表里的条目、状态的词与含义、不可选的原因、外部项目）、开场动画播过没有怎么记、本机的网页有哪几条路径、口令与另外几道检查、每个答复都带的头、生命周期、页面的源码与构建、规格没有定而实现时定下的几处 |
| [网页界面的设计](./web-ui-design.md) | **只管网页界面。** 页面该长什么样：视觉方向「利落」与维护者明确不要的几样、颜色的变量与含义、字号、间距与圆角、共用的部件、三栏的版式与各个画面的要点、不可选的画法、汇总里不列命令、开场动画、放不下时的退路、网页界面的预览（生成命令、用法、场景怎么写、用什么驱动浏览器）、结束画面、各个画面是哪张工单做的、看过而留给维护者定的、还没经维护者看过的画法 |
| [终端输出](./terminal-output.md) | 呈现层的职责、上色与 Unicode 的判断、不可选的行（原因在状态的位置）、是否题、隐藏输入、网页界面开着时终端上打什么与待命的提问（一种可以被收回的提问）、选择安装范围（当前目录的写法与截断）、带备注的表、将执行的命令与占位符、工具的执行分区与结论、混合列表与外部项目的说明与链接、标准输出与标准错误的分工、块与块之间的空行、改写已打出的行、结果行与合计共用一份、界面预览页 |
| [目录校验与 CI](./catalog-validation.md) | 目录校验命令的输出与退出状态、被跳过条目的原因怎么记、没有让条目被跳过的写坏之处（`Catalog.flaws`）怎么记怎么说、命令的测试怎么写；上游核对命令的输出与退出状态、怎么认出上游有哪些 skill、为什么不进 CI；工作流的触发与检出范围 |

---

## Pre-Development Checklist

- [ ] 要加或改任何行为 → [入口与测试](./installer-entry.md)：先在 `cli/test/` 写经入口的测试
- [ ] 要加或改任何画面的样子（颜色、符号、状态的词、间距、横线）→ [界面设计](./ui-design.md)：先改那份文档，再改实现，然后生成界面预览页对照
- [ ] 要加或改网页界面的样子（颜色、字号、间距、部件、版式、开场动画）→ [网页界面的设计](./web-ui-design.md)：先改那份文档，再改实现，然后生成网页界面的预览对照（加了状态就加场景）；彩色只有说状态的那三种，不用紫色，汇总里不列将执行的命令
- [ ] 要往终端上打任何东西 → [终端输出](./terminal-output.md)：只能经呈现层
- [ ] 要给本机的网页加一条路径、一种意图、画面状态里的一个字段，或动任何一个答复头 → [网页界面的契约](./web-ui-contract.md)：先改那份文档；口令不进静态文件和任何答复，意图里没有会被原样执行的东西，不发允许跨来源访问的头；要动填 key（意图 `key`、画面状态里的 `keys`、页面的输入框）→ 同一份文档的「MCP 与填 key」和 [安装 MCP](./mcp-install.md) 的「带 key 的 MCP」：值只走那一个请求的正文，画面状态里只有填了没有，`web-mcp.test.ts` 里「整份去搜」的那一组要跟着走一遍
- [ ] 要动列表里有什么、怎么排，条目的状态与可不可选，状态或不可选的原因写成哪个词，勾选怎么算成要装的各项，或执行的先后与一项失败之后怎么办 → 上面「两套界面共用的部分」：改在那几块里，不在 `flow.ts`、`ui.ts` 或页面里另写一遍；它们不提问、不往终端上打东西
- [ ] 要动下载、落盘、宿主探测、状态探测、覆盖前问不问、安装范围（装到全局还是项目、各落在哪个目录），加一个宿主，或加一种装不上的原因 → [安装 skill](./skill-install.md)
- [ ] 要加一种提问 → [终端输出](./terminal-output.md) 的「是否题」「隐藏输入」「待命的提问」：先读交互库的源码，主题要盖全，按键提示和出错的句子要本地化；正式的实现和预设应答的替身（`test/harness.ts`）都要有
- [ ] 要动网页界面什么时候收场（页面关了、点了「完成」、改用终端界面）、那时终端上打什么，或在网页界面开着时往终端上打任何东西 → [网页界面的契约](./web-ui-contract.md) 的「生命周期」和 [终端输出](./terminal-output.md) 的「网页界面开着时与退回终端界面」「待命的提问」：待命的提问问着的时候终端归它，要打东西先把它收回并等它了结
- [ ] 要碰用户输入的 key（问、记、传、报错）→ [安装 MCP](./mcp-install.md) 的「带 key 的 MCP」：值只进内存、命令参数和宿主的配置，不进呈现层、不进错误的原因、不进任何文件
- [ ] 要让列表里的某一行不可选 → [终端输出](./terminal-output.md) 的「不可选的行」
- [ ] 要执行任何外部命令，动 MCP 条目的字段、命令的拼法、看哪个配置文件，或给宿主加一条 MCP 的行为 → [安装 MCP](./mcp-install.md)：终端界面里命令先完整展示、确认了才执行，展示的和执行的是同一份（网页界面的汇总不列命令，见 [网页界面的设计](./web-ui-design.md)；执行的仍是同一份）
- [ ] 要动第三方 Skill 条目的字段、skills CLI 那条命令的参数或版本、带哪些环境变量、怎么判装没装上 → [安装 skill](./skill-install.md) 的第二个 Scenario：来源和 skill 的名字是外部命令的参数，只收安全的字符；成败只看复核
- [ ] 要动工具条目的字段、安装命令的校验、按系统选命令、检查方式、成败怎么判，或外部命令执行器的 shell 模式 → [安装工具](./tool-install.md)：整行 shell 只许来自 `install` 字段，成败只看复核；要动工具在网页界面下怎么展示、在哪执行 → 同一份文档的「网页界面下」和 [网页界面的契约](./web-ui-contract.md) 的「工具」：页面上只有名字和「执行安装命令」，那一行命令不出安装器，命令在终端里跑
- [ ] 要读 `cli/` 以外的文件、或在仓库根加包描述文件 → 不行，见上面「自成一体的三条规矩」和 ADR-0001
- [ ] 要改 `index.json` 或 `catalog.json` 的格式 → 先读 ADR-0002 和 [清单与版本](../skills/manifest-versioning.md)：字段契约、格式版本号的兼容规则、对 A Team Workflow 的三条承诺都在那里
- [ ] 要给目录加一类条目、一个字段或一条校验规则，或动 CI → [目录校验与 CI](./catalog-validation.md)：写坏的条目带着原因进 `skipped`
- [ ] 要动上游核对命令，或 skills CLI 换了主版本 → [目录校验与 CI](./catalog-validation.md) 的「上游核对命令」：认 skill 的规则照抄 skills CLI，读不到是「没能核对」而不是「对不上」
- [ ] 要把目录里的网址打到终端上，或放进画面状态让页面画成链接 → [入口与测试](./installer-entry.md) 的 `url` 规则；[终端输出](./terminal-output.md) 的「混合列表与外部项目」；[网页界面的设计](./web-ui-design.md) 的「外部项目」。目录里的网址从不交给系统打开：链接打开器只用来打开网页界面（契约在 [入口与测试](./installer-entry.md)）

---

## 加网页界面时实现者定下、维护者没有逐条确认的

任务 `10-11-installer-web-ui` 的规格和各张工单里，凡是规格没有写明、实现时定下的，归拢在这里。**每一条都已经照此落地**；维护者有异议时先改这里指到的那份规范，再改实现。细节和理由在各条后面指到的地方，这里只列是什么。

**用户看得见的行为**

| 定了什么 | 细节在哪 |
|----------|----------|
| 强制用终端界面的启动参数叫 `--terminal`，不带值 | [入口与测试](./installer-entry.md)「启动参数」 |
| 认出「打不开浏览器」只靠三样：远程连接的三个环境变量；不是 macOS、Windows 且没有 `DISPLAY` 和 `WAYLAND_DISPLAY`；打开命令拒绝。认不出的（远程桌面里的终端、WSL）靠终端上的网址和 `t` 兜底。**没有在这些环境的真机上试过** | [入口与测试](./installer-entry.md)「定下用哪个界面」 |
| 目录在打开浏览器之前读：读不了就不开浏览器，代价是浏览器晚一两秒弹出来 | 同上「用网页界面时」 |
| 页面全都断开之后等 5 秒才当作关了；安装中断开满了时限、装完之前又连回来的当没断过（后半句维护者 2026-10-12 定过） | [网页界面的契约](./web-ui-contract.md)「生命周期」 |
| 按 `t` 改用终端界面时页面上的勾选丢弃，这次运行里填过的 key 还在；终端从语言提问接着走 | 同上；[入口与测试](./installer-entry.md) |
| 页面上换语言不改变终端上的语言 | [网页界面的契约](./web-ui-contract.md)「页面上换语言」 |
| 外部项目在网页界面里不能勾选，只显示说明和链接 | [网页界面的设计](./web-ui-design.md)「外部项目」 |
| 改了宿主或安装范围之后装不了的条目留在已选里并写明原因，不自动去掉；一个 skill 都没挑的第三方 Skill 同样留着 | [网页界面的契约](./web-ui-contract.md)「第三方 Skill」和文末的表 |
| 覆盖的逐项决定在汇总里一次答完，缺省不覆盖，**每次进汇总都从不覆盖起** | 同上「汇总」 |
| 将执行的命令不只是不展示，也不发给页面；工具的那一行命令到轮到它时才打在终端上 | 同上「工具」；[安装工具](./tool-install.md)「网页界面下」 |
| 填 key 是点「去汇总」之后先出来的一步，不另设入口；填了就发，不等「好了」；必填的没填也点得了「好了」，那个 MCP 这次不装；没有「清掉一个填过的 key」 | [网页界面的契约](./web-ui-contract.md)「MCP 与填 key」 |
| 填 key 的输入框是画成圆点的普通文字框，浏览器不认那条样式时才退回密码框（为的是浏览器不来问要不要保存） | 同上 Design Decision 表 |
| 开场动画只在这次运行第一次打开时播、可以跳过、系统开了「减少动态效果」时不播（说给维护者听过，没有反对，也没有逐条确认） | [网页界面的设计](./web-ui-design.md)「开场动画」 |
| 页面开着时工具的结论也打在终端上，但终端上没有「结果」分区和合计；安装中页面关了，补打的是一个完整的「结果」分区 | [网页界面的契约](./web-ui-contract.md) 文末的表；[界面设计](./ui-design.md) 文末 |
| 网页界面收场时终端上那几行的措辞和画法；待命刚画出来的头 100 毫秒里收到的键不算数 | [界面设计](./ui-design.md) 文末；[终端输出](./terminal-output.md)「待命的提问」 |
| 帮助里 `--lang` 那一行没有动，仍是「缺省时启动后询问」——它只说对了终端界面。包的 README 里写的是两套界面各自的缺省（工单 14）。帮助那一行要不要改留给维护者定：改它要连同守着这句话的那条测试一起改 | [界面设计](./ui-design.md) 文末 |

**页面的样子**

对比页上没有画、照着推的画法，和各张工单的视觉审查看到而没有处理的，都在 [网页界面的设计](./web-ui-design.md)：文末「实现时定下、维护者还没有看过的画法」（右栏底部多的「完成」按钮、一个宿主都没检测到和目录是空的时的画面、四种结束画面的画法与那几句话、出错说明的画法、汇总里第三方 Skill 归成一段、工具在终端里装时那一行留意底色的画法……）和「看过、留给维护者定的」（勾上之后才变得装不了的卡片两种信号打架、夹在句子里的命令不是等宽字、几条品味上的意见）。另有一处已知的弱点：最淡的文字对比度不到 4.5:1（同一份的「颜色的含义」）。**维护者还没有把网页界面的预览从头到尾看过一遍。**

**页面与安装器之间**

口令走请求头、`Host` 也认 `localhost`、意图里多带了东西就整个不照办、汇总的标识是算出来的摘要、挑 skill 和选宿主都是一个一个地发……四十多条，都比规格的字面更严或与它不冲突：[网页界面的契约](./web-ui-contract.md) 的两节 Design Decision。

**开发上的**

| 定了什么 | 细节在哪 |
|----------|----------|
| 页面用 Preact 写、esbuild 打包，都是开发依赖（访谈里说好由写规格时定） | [网页界面的契约](./web-ui-contract.md)「Signatures」末尾讲页面的源码与构建的那一段 |
| 网页界面的预览用本机装着的 Chrome、经它自带的调试协议驱动，没有为它加依赖；只在 macOS 的 Chrome 上跑过 | [网页界面的设计](./web-ui-design.md)「用什么驱动浏览器」 |
| 预览自己查两样，不过就不出预览：假装填的 key 哪里都没有（工单 10）；每一格在两种窗口下都没有放不下的地方（工单 14） | 同上「怎么用」 |
| 测试架子缺省在启动参数最前面带 `--terminal`，要网页界面的用例给 `page` 或 `web: true`；任务开始之前就有的用例一条没改 | [入口与测试](./installer-entry.md)「Tests Required」 |
| 待命的按键由页面的脚本按（`terminal.press('t')`），不排进 `answers` | [网页界面的契约](./web-ui-contract.md) 文末的表 |
| `dependencies` 里多写了一行 `@inquirer/core`（装下来的包不变；**维护者 2026-10-12 认可**，列在这里是为了不漏） | 同上 |

**至今没有核对过的**（不是决定，是缺口）：Windows 和 Linux 上的真实浏览器；Chrome 以外的浏览器里页面的样子；真的从另一台机器经 `ssh` 连进来。见下面「发布前在本机核对」。

---

## Quality Check

都在 `cli/` 下运行：

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | 类型检查：先 `src`、`test`、`scripts`，再页面（`web/tsconfig.json`），无输出即通过 |
| `npm test` | 全部测试（vitest），只扫 `cli/test/`；开跑之前先把页面打一遍到 `dist/web/` |
| `npm run build` | 构建到 `dist/`（不提交）：`tsc` 编安装器，再把页面打成 `dist/web/` 下的静态文件 |
| `npm run build:web` | 只把页面打一遍 |
| `npm run preview` | 生成界面预览页 `cli/.preview/index.html`（不提交）；改了任何画面都要生成并看一遍。**不许改画面的重构**（搬代码、拆模块）拿它当凭据：动手之前先生成一份另存，改完再生成一份，两份应当逐字节相同——预览页经入口把每个画面都走一遍，测试没断言到的字也在里面 |
| `npm run preview:web` | 生成网页界面的预览 `cli/.preview/web/index.html`（不提交）：本机的 Chrome 把真实的页面拍下来，每个状态一格，深浅各一份；改了页面都要生成并看一遍。**它自己带两道检查**，不过就停下、不出预览：假装填的 key 哪里都不许有；每一格在拍的那种窗口和另一种标准的窗口（1280×800、1024×768）下都不许有放不下的地方（整页比窗口宽、哪一块里的内容比它宽、内容被裁掉）。开发机上要有 Chrome、Chromium 或 Edge；不进 CI。和 `npm run preview` 互不影响 |
| `OXY_TOOLS_CATALOG=<仓库根> npm start` | 构建后在本机启动，读本地的目录数据 |
| `npm run validate-catalog -- ..` | 用安装器自己的校验逻辑检查仓库根的 `index.json` 和 `catalog.json`；改了这两个文件或校验规则都要跑 |
| `npm run check-upstream -- ..` | 把目录里登记的第三方 Skill 和作者在 GitHub 上的仓库对一遍：仓库还在不在、归档或改名没有、里面的 skill 多了少了。要联网，不进 CI；录入或改动第三方 Skill 之后跑，设上 `GITHUB_TOKEN` 免得被限流 |
| `npm pack --dry-run` | 列出 npm 包里会有哪些文件，不生成文件；动了 `package.json` 的 `files`、`README.md`、`LICENSE`、页面的构建时看一眼（先 `npm run build`：`dist/web/` 下的四个文件要在里面） |

推送后 CI（`.github/workflows/cli.yml`）在 macOS、Linux、Windows 上各用 Node 22.13 和 24 跑全部测试，另跑类型检查和目录校验。

包声明支持 Node 22.13 及以上的 22.x 或 23.5 及以上。行为与 Node 版本有关的改动（样式码、流）要在 22.13 上再跑一遍测试。

### 发布前在本机核对

自动化测试不碰真实的宿主命令、真实的终端、真实的浏览器和打出来的包。发 npm 版本之前照下面走一遍（任务 `10-09-oxy-tools-installer` 工单 12 用过的做法；网页界面的几行是任务 `10-11-installer-web-ui` 工单 14 加的）；都在临时目录里做，不动真实的主目录和宿主配置。

| 核对什么 | 怎么做 |
|----------|--------|
| 包里有什么、装出来能不能跑 | `npm run build` 之后 `npm pack --pack-destination <临时目录>`，在一个临时项目里 `npm install <那个 .tgz>`，再 `npx --no-install oxy-tools --version`、`--help`。**页面的静态文件都在**：`node_modules/oxy-tools/dist/web/` 下 `index.html`、`app.js`、`app.css`、`favicon.svg` 四个；打不打得开由下面「网页界面的整条流程」那一行管 |
| 没有交互式终端 | `npx --no-install oxy-tools </dev/null \| cat`：说明在标准错误，退出状态 1 |
| 目录格式版本过高 | 伪终端里 `OXY_TOOLS_CATALOG=<version 写成 99 的样例目录> node dist/bin.js` |
| 断网 | 伪终端里 `sandbox-exec -p '(version 1)(allow default)(deny network*)' node dist/bin.js`（macOS），走的是缺省的 GitHub 目录来源 |
| 第三方 Skill 的整条流程 | 用真实的 `npx`，在临时主目录里：同下面「skill、MCP、工具的整条流程」那一行的做法，另把 `XDG_CONFIG_HOME`、`XDG_STATE_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`npm_config_cache` 也指到临时目录并断言（skills CLI 往状态目录里写一个 `.skill-lock.json`）；`CLAUDE_CONFIG_DIR` 故意指到不是 `<HOME>/.claude` 的目录。样例目录里登记一条真实的小仓库。完了查两个宿主的 skill 目录下各有 `SKILL.md` 且是真实目录、`CLAUDE_CONFIG_DIR` 指的目录是空的、录下的原始输出里搜不到 skills CLI 的框线和字符画、真实主目录的 skill 目录前后没变。Windows 和 Linux 上至今没有跑过。上一次的记录和驱动脚本的写法在任务 `10-10-catalog-purpose-categories` 的 `research/third-party-trial-record.md` |
| 录入第三方 Skill 之前的试装 | 环境变量同上一行，另外三样。① 用 `env -i` 只留 `PATH` 和那几个变量：在 Claude Code 之类的 AI Agent 里起脚本时，环境里带着 `CLAUDECODE`、`AI_AGENT`，skills CLI 会因此自己切到非交互，和用户在普通终端里不一样。② 驱动脚本直接引用 `cli/src` 的 `skillsCliCommand`、`installThirdPartySkill`、`systemCommandRunner`、`hasSkillFile`（`node --experimental-strip-types`），每个 skill、每个宿主各一次：执行的就是安装器会执行的那一条。③ 要同时跑几个来源时，**各用各的 `npm_config_cache`**——几个 `npx` 共用一个缓存目录会撞上，报 `Cannot find module`，看着像那个仓库的问题。完了再经真实的安装器（`OXY_TOOLS_CATALOG` 指到仓库，带 `--terminal`）勾一条走到「已安装」。真实主目录有没有被动到，看两个 skill 目录自己：`find ~/.claude/skills ~/.agents/skills -maxdepth 1 -mmin -<分钟数>` 应当是空的——不要对 `ls -la` 的输出取哈希，里面有上一级目录 `~/.claude` 的修改时间，而 Claude Code 自己一直在写它。上一次的记录在同一个任务的 `research/skill-trial-record.md` |
| 第三方 Skill 装到项目 | 环境变量同上一行。在一个临时的项目目录里装（安装范围选「项目」，或照 `research/project-scope-trial-record.md` 的做法直接用安装器拼出来的命令和真实的执行器）。完了查项目目录下 `.claude/skills/<名字>/SKILL.md`、`.agents/skills/<名字>/SKILL.md` 都在且是真实目录，临时主目录是空的，真实主目录的 skill 目录前后没变。skills CLI 另在项目目录里写一个 `skills-lock.json`，安装器不管它。从另一个目录起一遍，确认落点跟的是执行器的 `cwd`。Windows 和 Linux 上至今没有跑过 |
| MCP 装到项目 | 环境变量同下一行。照任务 `10-10-catalog-purpose-categories` 的 `research/project-mcp-trial-record.md` 末尾的做法：从 `dist/` 里取 `detectHosts`、`mcpStatuses`、`mcpSteps`、`installMcp` 和真实的执行器，**从项目目录以外的目录起脚本**，装一个本地进程的、一个带 key 的、一个远程地址的探针。完了查 `<项目目录>/.mcp.json` 里三条都在、带 key 的值逐字相同、装之后状态是已配置，临时的用户级配置和真实配置里都搜不到探针的名字，起脚本的目录和仓库里没有多出 `.mcp.json`；在项目目录里 `claude mcp get <名字>` 应当是 `Pending approval`。顺带确认 `codex mcp add --help` 里仍然没有范围选项——有了的话 Codex 不支持装到项目的结论要重做。Windows 和 Linux 上至今没有跑过 |
| skill、MCP、工具的整条流程（终端界面） | 伪终端里跑 `node dist/bin.js --terminal`（不带 `--terminal` 在有桌面的机器上是网页界面，会弹出浏览器），事先 `export HOME=<临时目录> CLAUDE_CONFIG_DIR=<临时目录> CODEX_HOME=<临时目录> OXY_TOOLS_CATALOG=<样例目录>`，脚本开头断言这几个都指向临时目录。执行的是真实的 `claude`、`codex`，写的是临时配置；完了查临时配置里有那几条、终端的原始输出里搜不到填的 key、真实配置里没有样例的名字 |
| 网页界面的整条流程 | 跑**装到临时项目里的那个包**（`node_modules/.bin/oxy-tools`），不带参数，伪终端里；环境变量同上一行，另把 `XDG_*`、`npm_config_cache` 指到临时目录（这一批里有第三方 Skill），**子进程的环境只给列出来的那几项**，不继承起脚本的会话。可执行路径最前面放一个假的 `open`（只把收到的网址记进文件），真实的页面由脚本另起的 Chrome（`cli/scripts/chrome.ts`）拿着那条网址去开，在页面上 `click()`、往输入框里打字：跨两个用途勾一个本仓库的 skill、一个第三方 Skill、一个带 key 的 MCP → 刷新一次 → 去汇总 → 填 key → 开始安装 → 等到结果 → 完成。查：`open` 只收到一个参数；终端上没有语言提问；刷新后不重播开场、勾选还在；汇总里搜不到命令；结果行都成功；skill 目录和两份临时的宿主配置里有那几样；安装器以 0 退出 |
| 填的 key 哪里都看不到 | 上一行那次运行里：填完之后、装完之后各取一次页面的网址（地址栏里的那条）、页面的整份 HTML、每个输入框的值，连同终端的原始输出，搜填的那个值——都是 0 处。它只该在临时的宿主配置里 |
| 开场、关页面、Ctrl+C | 各起一次：照页面自己的时钟量开场那一层从出现到收掉（约 2.6 秒），出现时底下的三栏已经在；关掉标签页，约 5 秒后安装器以 0 退出；终端上按 Ctrl+C，以 130 退出，页面改成「安装器已退出」 |
| 远程连接下自动用终端界面 | 同样的环境加 `SSH_CONNECTION=<随便一个非空的值>` 跑一次，带 `--terminal` 再跑一次：直接是语言提问，假的 `open` 没有被调用。真的从另一台机器经 `ssh` 连进来至今没有做成 |
| 真实的默认浏览器弹得出来 | 最后跑一次不用假的 `open` 的：从终端上读到网址，扮演一个页面去读画面状态，等到里面的 `introSeen` 为真（只有真实的页面加载、连上了才会），再按 Ctrl+C。**它会在这台机器的默认浏览器里弹出一个标签页**，先打招呼 |
| 不显示颜色 | 「skill、MCP、工具的整条流程」那一行再加 `NO_COLOR=1`：原始输出里一个样式码（`ESC[…m`）都没有 |
| 深色与浅色的真实终端 | 在终端程序里各用一套深色、一套浅色的配色跑同一条流程（同样带 `--terminal`），看每个画面；观感的结论记进 [界面设计](./ui-design.md) |

样例目录要自己写（一个 skill 的真实内容，加几条 MCP、工具、外部项目），名字取成不会和机器上已有的 MCP 撞车的（如 `oxy-sample-*`）——安装器遇到同名的会先移除。伪终端可以用 `expect`，或 Python 的 `pty` 写个按步骤发按键的小脚本；要把录下的原始输出还原成画面，交给 `@xterm/headless`。

网页界面那几行上一次的记录和三份驱动脚本在任务 `10-11-installer-web-ui` 的 `research/release-check-record.md`：**Windows 和 Linux 上的真实浏览器、Chrome 以外的浏览器里页面的样子至今没有核对过。**

拿仓库**真实的目录**试的时候（录入条目前的「试通」，`OXY_TOOLS_CATALOG=<仓库根>`），名字避不开撞车——机器上多半已经有 `context7`、`playwright`。这时全靠那三个环境变量把命令挡在临时目录里，开头的断言不能省；「真实配置里没有样例的名字」也查不成，改成试之前和之后各取一次真实配置里 MCP 那一段的哈希（只读、不打印内容——里面有 key），前后相同才算没动。一份能照着改的驱动脚本在任务 `10-10-catalog-purpose-categories` 的 `research/mcp-trial-record.md` 末尾。
