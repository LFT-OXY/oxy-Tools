# 入口与测试

> `cli/src/installer.ts` 的入口契约、目录读取与校验的契约，以及测试怎么写。

---

## Scenario: 安装器入口

### 1. Scope / Trigger

安装器对外只有一个入口。它是命令的实现，也是测试的主接缝：凡是加命令行参数、环境变量、退出状态、出错种类，或改目录的读取与校验，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/installer.ts
export async function runInstaller(options: InstallerOptions): Promise<number>; // 返回进程的退出状态

export interface InstallerOptions {
  argv: readonly string[];        // 不含 node 和脚本路径
  env: Environment;               // Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform;
  systemLocale: string;           // 如 zh-CN；环境变量里没有语言设置时用它判断系统语言
  stdout: TerminalOutput;         // { write(text), isTTY, rows?, columns? }
  stderr: TerminalOutput;
  stdinIsTTY: boolean;
  // 五样可替换的外部依赖
  catalogSource: CatalogSource;   // 目录来源
  homeDir: string;                // 用户主目录
  runCommand: CommandRunner;      // 外部命令执行器
  prompter: Prompter;             // 提问器
  openLink: LinkOpener;           // 链接打开器
  // 五样运行环境的事实，和 env、platform 同类，不算外部依赖
  projectDir: string;             // 项目目录：运行安装器时所在的目录（bin.ts 给 process.cwd()），安装范围选「项目」时装到它下面
  tempDir: string;                // 放临时文件的目录（bin.ts 给 os.tmpdir()）
  webDir: string;                 // 网页界面的静态文件所在的目录（bin.ts 给它自己旁边的 web/，也就是构建产物 dist/web/）
  pageGraceMs: number;            // 网页界面的页面全都断开之后，等多久才当作页面关了（bin.ts 给 5000）
  interrupt: AbortSignal;         // 用户在提问之外按 Ctrl+C 时触发
}
```

入口不直接碰 `process`：参数、环境变量、平台、输出流都从 `options` 来。`cli/src/bin.ts` 负责把真实的东西接上去，除此之外不放逻辑。

`interrupt` 触发后 `bin.ts` 随即 `process.exit(130)`，**所以监听它的收尾只能是同步的**（`rmSync`，不是 `await rm`）；异步的 `finally` 等不到执行。提问进行中的 Ctrl+C 不走这个信号——终端处在原始模式，交互库自己把它变成 `PromptAborted`。执行一批安装的途中被这个信号打断时，`run-plan.ts` 抛的是它自己的 `Interrupted`（它不认识提问器）；入口把两种都当作以 130 退出。网页界面开着时被它打断也是抛 `Interrupted`：抛之前当场把本机的网页关掉（同步的），页面那边的长连接随之断开。

`runCommand` 的正式实现是 `cli/src/run-command.ts` 的 `systemCommandRunner()`。它有两种用法：不经 shell、输出不上屏的（安装 MCP 和第三方 Skill 用，约定见 [安装 MCP](./mcp-install.md)），和第三个参数给 `{ shell: true }` 时整行交给系统的 shell、输入输出直接接在终端上的（安装工具用，约定和手动核对的办法见 [安装工具](./tool-install.md)）。两种起的子进程都继承进程自己的环境，不是 `options.env`；不经 shell 的那种可以用第三个参数的 `env` 另外带上几个变量、用 `cwd` 指定在哪个目录下运行（安装第三方 Skill 用：装到项目时要在项目目录下运行，见 [安装 skill](./skill-install.md)）。

```ts
export type CommandOptions =
  | { shell: true }                                             // command 是一整行，args 是空的
  | { shell?: never; env?: Readonly<Record<string, string>>; cwd?: string };
  // 不经 shell：env 是另带的环境变量，盖在继承来的环境之上；cwd 是在哪个目录下运行，不给就是进程自己的当前目录
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
```

`openLink` 的正式实现是 `cli/src/open-link.ts` 的 `systemLinkOpener(platform)`。**它只用来打开网页界面**（任务 `10-11-installer-web-ui` 工单 03 起）：一次运行里最多调用一次，交给它的是本机那个网页的网址；它拒绝时安装器退回终端界面。外部项目的链接仍然不由安装器打开——终端界面只列出说明与链接（一次勾好几个会弹出一堆网页；任务 `10-10-catalog-purpose-categories` 工单 05 起），网页界面里由用户自己点。下面是它自己的契约：

```ts
export type LinkOpener = (url: string) => Promise<void>; // 打不开时拒绝
export function systemLinkOpener(platform: NodeJS.Platform): LinkOpener;
```

| 项 | 约定 |
|----|------|
| 用什么打开 | macOS `open <网址>`；Windows `rundll32 url.dll,FileProtocolHandler <网址>`；其余系统 `xdg-open <网址>` |
| 怎么起 | `spawn`，**不经过 shell**（网址是远程数据，里面的 `&` 之类不能有机会被当成命令）；`stdio: 'ignore'`、`detached: true`（用户随后按 Ctrl+C 时不把浏览器一起带走） |
| 什么算打不开（拒绝） | 系统上没有这个命令（`ENOENT`）；或命令在 1.5 秒内以非零状态结束（没有能打开网址的程序） |
| 什么算打开了 | 命令以 0 结束；或 1.5 秒后还没结束——有的系统上它要等浏览器关掉才结束，这时 `unref` 掉、不再等 |

> **Warning**：`systemLinkOpener` 不进自动化测试（测试里链接打开器只记录）。改了它就用一个假的 `open` 命令手动核对四种结局：正常、非零退出、迟迟不结束、命令不存在，并确认网址是作为**单个参数**原样传进去的。Windows 那一支至今没有在真机上跑过。

### 3. Contracts

**启动顺序**

解析启动参数 → 参数有误、`--help`、`--version`、没有交互式终端这四种情况各自处理并退出 → 打大标志 → **定下用哪个界面** → 终端界面没给 `--lang` 就问语言，网页界面不问 → 读取目录 → 本机信息 → 进入所选的界面（终端界面是主菜单）。

**定下用哪个界面**（任务 `10-11-installer-web-ui` 工单 13 起：缺省是网页界面）。按这个先后判断，前三种直接是终端界面：

| 先后 | 情形 | 用哪个 |
|------|------|--------|
| 1 | 给了启动参数 `--terminal` | 终端界面 |
| 2 | 环境变量里有远程连接的痕迹：`SSH_CONNECTION`、`SSH_TTY`、`SSH_CLIENT` 任一非空 | 终端界面 |
| 3 | 系统不是 macOS 也不是 Windows（`platform` 不是 `darwin`、`win32`），且 `DISPLAY` 和 `WAYLAND_DISPLAY` 都为空——没有桌面 | 终端界面 |
| 4 | 其余 | 网页界面 |

- 判断只看入口收到的启动参数、环境变量和平台，不直接碰 `process`，也不去试着打开什么。
- **前三种情形下就是加网页界面之前的终端界面**：没有调用链接打开器，没有起本机的网页，照旧问语言；终端上不为此多说一句（用户没有要过网页界面，没有什么可解释的）。
- macOS 和 Windows 上不看 `DISPLAY`：它们的桌面不靠这两个变量。
- 认不出的情形（远程桌面里的终端、WSL、经 `sudo` 丢了变量）会进网页界面：浏览器打不开时走下面「才知道用不了」的那条路，打开了却看不到时终端上留着网址和 `t`。
- 开发期间的临时开关 `OXY_TOOLS_WEB` 已经拿掉：设了它没有任何作用。

**用网页界面时**：

- 终端上不问语言：呈现层就是启动时按系统语言或 `--lang` 建的那一个，不重建。页面的语言起始也是它；之后页面上可以换语言（意图 `lang`，见 [网页界面的契约](./web-ui-contract.md) 的「页面上换语言」），换的只是页面，终端上的呈现层不跟着换、也不因此多打东西。
- 目录在打开浏览器之前读：读不了时照旧在终端上出错并以 1 退出，**没有起本机的网页，链接打开器没有被调用**。
- 本机信息照旧打在终端上，然后才进入网页界面：起本机的网页 → 把网址交给链接打开器 → 终端上打出「网页界面开着」的那个块（画法见 [界面设计](./ui-design.md) 的「网页界面开着时」），待命的提问开始等按键 → 等到网页界面这边收场：页面上点了「完成」、页面关了（都以 0 退出），终端上按了 `t`（改用终端界面，见下一条），或按了 Ctrl+C（以 130 退出）。收场时终端上各有一行说明。页面与安装器之间说什么、本机的网页守哪几道，见 [网页界面的契约](./web-ui-contract.md)。
- **网页界面开着、没有在安装时，终端上按 `t` 就改用终端界面**（工单 11）：按键经提问器的待命的提问来（[终端输出](./terminal-output.md) 的「待命的提问」），入口不另读键盘。安装器把本机的网页关掉（页面先收到「已改用终端界面」），在终端上打一行说明（`ui.webEnded('terminal')`），然后**从语言提问接着走终端界面**——和下面「才知道用不了」是同一条路：没给 `--lang` 就问语言、按选定的语言重建呈现层，接着是主菜单。目录不重读，本机信息不重打；**页面上的勾选丢弃**（宿主、安装范围、勾选都从头来），这次运行里填过的 key 还在（它们记在两套界面共用的 `Runtime.keys` 里）。
- **进入网页界面之后才知道用不了的两种情形**：本机的网页起不来（静态文件读不到、监听不了），或链接打开器拒绝。安装器把本机的网页关掉（起来了的话），在终端上打一行「注意」说明原因（经呈现层的 `webUnavailable`，画法见界面设计规范的同一节），然后**从语言提问接着走终端界面**：没给 `--lang` 就问语言、按选定的语言重建呈现层，接着是主菜单。目录不重读，本机信息不重打。

**界面语言在一次运行的中途才定下来。**（下面两段说的是终端界面。） 那四种不问就退出的情况、大标志和语言提问用按系统语言建的呈现层；语言提问回答之后入口按选定的语言重建一个（`createUi({ …, lang, continued: true })`），此后的一切输出——加载提示、本机信息、菜单、提问、出错说明、目录条目的说明——都用它。重建时带上 `continued`，见 [终端输出](./terminal-output.md) 的「块与块之间的空行」。

语言提问用提问器现有的单选（`ui.languageQuestion()`），不是新的提示种类。选择只留在这次运行的内存里：安装器不为它写任何文件，下一次启动照样问。在它上面按 Ctrl+C 和别的提问一样以 130 退出。

**主菜单与流程（终端界面）**（任务 `10-10-catalog-purpose-categories` 逐张工单搬过来的。网页界面没有主菜单，一页到底：流程见 [网页界面的契约](./web-ui-contract.md)）

| 主菜单的行 | 什么时候有 | 数量 | 选了之后 |
|------------|------------|------|----------|
| 「推荐」，第一行 | 里面至少有一行 | 本仓库的全部 skill，加上带推荐标记的第三方 Skill、MCP、工具和外部项目 | 混合列表 |
| 各个用途，按 `purposes` 的顺序 | 进去之后至少有一行 | 进去之后列表里的行数：写了这个用途的本仓库 skill，加上这个用途下的第三方 Skill、MCP、工具和外部项目（第三方 Skill 一个条目一行，不数它里面的 skill） | 混合列表 |
| 退出 | 总是有 | — | 以 0 退出 |

- **主菜单上只有这三种行**：按类型分的四个入口（0.2.0 及更早的版本里的分组）全部取消了，类型到了列表里才出现。所以主菜单上没有不可进入的行。
- **「推荐」由两部分组成**：本仓库的全部 skill（自动，不看任何标注，也去不掉），加上 `recommended` 为真的其它条目（第三方 Skill、MCP、工具、外部项目）。没有写用途的本仓库 skill 只在「推荐」里；写了用途的在「推荐」和那个用途下两处都出现。带推荐标记的其它条目同样两处都出现。
- 「推荐」和用途的行不靠宿主：一个都没检测到时照常进得去，组件（skill、第三方 Skill、MCP、工具）的行不可选并写明「需要 AI Agent」，外部项目照常可选。
- 进去之后的顺序：选宿主 → 选安装范围 → 混合列表 → 含多个 skill 的第三方 Skill 各自的清单 → 逐个 MCP 问 key → 汇总与将执行的命令 → 确认 → 覆盖前的单独询问（先本仓库的 skill，再第三方 Skill） → 安装 → 结果 → 外部项目的说明与链接 → 回主菜单。
- **选宿主只在检测到不止一个、且这张列表里有 skill、第三方 Skill 或 MCP 时问**，一轮只问一次；只检测到一个就直接用它。列表里只有工具和外部项目时不问：没有要装进宿主的东西（工具不装进宿主，它的状态和可不可选都与选了哪些宿主无关）。这一问同时管 skill 和 MCP。
- **选安装范围紧跟在选宿主之后**（任务 `10-10-catalog-purpose-categories` 工单 10 起）：单选，全局在前、项目在后，光标起始在全局，按回车就过。**这一轮有要装进的宿主才问**——一个宿主都没检测到、或列表里只有工具和外部项目时不问（工具没有安装范围）。**每次进入列表都问，不记上一次的选择**：一次运行里再进一个用途、或从列表退回宿主选择再进来，光标都回到全局。界面上不为项目的路径另设确认。
- 「项目」就是 `options.projectDir`。选了它：本仓库的 skill 和第三方 Skill 落在项目目录下各宿主项目范围的 skill 目录里（`Host.projectSkillsDir`），状态、覆盖前的另问、复核都按那个目录来，主目录下的全局 skill 目录不读也不写；汇总和另问里的位置写成相对项目目录的路径（`.claude/skills/alpha`），全局的仍以 `~` 开头。工具不受影响。**MCP 按宿主分**（工单 11 起）：有项目范围配置的宿主（Claude Code）装进项目目录里的那一份，状态也从那一份读，用户级配置不读也不写；没有的（Codex）在它那一栏写「不支持」，不产生安装项。写法、提醒和理由见 [安装 MCP](./mcp-install.md) 的「装到项目」。
- 混合列表上一个都不勾就确认是回到上一步：问过宿主就回去重问（之前勾的还在），接着重问安装范围；没问过宿主就是主菜单。汇总里的「返回修改」回混合列表，勾选还在（四种类型的都在），不重问宿主和安装范围；填过的 key 不再问。
- 列表里组件在上、外部项目在下；组件按类型分段，先 skill，再第三方 Skill，再 MCP，再工具。skill 一段和外部项目一段按名字排；第三方 Skill、MCP、工具三段带推荐的在前、其余按名字（「推荐」那张列表里每一条都是推荐的，就只按名字）。都不照目录文件里的先后。
- **汇总是一个分区「将安装 N 项」**，N 是会装的组件条目数（外部项目不算，必填的 key 没填的 MCP 不算，清单里一个都没勾的第三方 Skill 也不算）；里面按类型分成小表。这一轮有第三方 Skill、MCP 或工具要装时接着是「将执行 N 条命令」，第三方 Skill 的在前、MCP 的其次、工具的在后。确认的提问统一是「开始安装吗」：开始安装、返回修改、取消。
- **执行的先后：本仓库的 skill、第三方 Skill、MCP、工具**，一项失败不影响其余项。前三样共用一个「正在安装」分区；工具排在最后，每个一个以它名字为标题的分区——它的命令会直接接管终端的输入输出。向 GitHub 查询失败时本仓库的 skill 一个都不装、结果里也没有它们的行，出错说明之后第三方 Skill、MCP 和工具照常装（第三方 Skill 不经那次查询），再列出勾选的外部项目。
- **外部项目的说明与链接排在结果之后**。汇总上选了「取消」则这一轮什么都不做，外部项目也不列。
- 没有要确认的东西时不问：只勾了外部项目，**没有汇总，不问开始不开始**，直接列出每一个的名字、说明、完整的链接；勾上的组件全是必填的 key 没填的 MCP 时同样没有汇总，直接是「结果」分区（每个宿主一行跳过），再是勾选的外部项目；勾上的组件只有第三方 Skill、而清单里一个都没勾时，什么都不装，直接回主菜单（勾了外部项目的照常列出）。**终端界面的整个流程里不调用链接打开器。**

**启动参数**

| 参数 | 行为 |
|------|------|
| `--lang zh` / `--lang=en` | 指定界面语言，启动后不再问；值不是 `zh`、`en` 或没给值时出错，退出状态 2 |
| `--terminal` | 用终端界面，不打开浏览器；不带值。和 `--lang` 可以同给，先后不论 |
| `-h`、`--help` | 打印用法，退出状态 0，不需要终端 |
| `-v`、`--version` | 只打印版本号，退出状态 0，不需要终端 |
| 其他 | 出错「无法识别的参数」，退出状态 2 |

**环境变量**

| 变量 | 行为 |
|------|------|
| `SSH_CONNECTION`、`SSH_TTY`、`SSH_CLIENT` | 任一非空就当作远程连接，用终端界面，见上面「定下用哪个界面」。不写进帮助：它们不是给用户设的 |
| `DISPLAY`、`WAYLAND_DISPLAY` | macOS 和 Windows 以外的系统上，两个都为空就当作没有桌面，用终端界面。同样不写进帮助 |
| `OXY_TOOLS_CATALOG` | 非空时，目录来源改为这个本地目录（其中要有 `index.json` 和 `catalog.json`），覆盖传入的 `catalogSource`；skill 的内容也从这个目录读 |
| `GITHUB_TOKEN` | 非空时，向 GitHub 的接口查询带上它（`Authorization: Bearer`）；下载文件从不带 |
| `PATH`、`PATHEXT` | 判断宿主的命令在不在，见 [安装 skill](./skill-install.md) |
| `CLAUDE_CONFIG_DIR`、`CODEX_HOME` | 非空时，看 MCP 配没配过改去这里找宿主的配置文件，见 [安装 MCP](./mcp-install.md)；skill 目录不认它们 |
| `LC_ALL`、`LC_MESSAGES`、`LANG` | 按这个顺序取第一个非空的判断**系统语言**：以 `zh` 开头是中文，否则英文；都为空时看 `systemLocale`。系统语言不直接是界面语言，它有三个用途：语言提问上光标起始停在哪一项；语言提问的按键提示用哪种语言；不问语言就退出的四种情况（参数有误、`--help`、`--version`、没有交互式终端）输出用哪种语言。给了 `--lang` 时不问语言，前两处不存在；那四种情况的输出用 `--lang` 的 |
| `NO_COLOR` | 只要存在就不带任何样式，见 [终端输出](./terminal-output.md) |
| `COLORTERM` | 等于 `truecolor` 或 `24bit` 时大标志画 24 位色的渐变，否则是洋红；只管标志，别的输出不看它。见 [终端输出](./terminal-output.md) 的「上不上色」 |
| `TERM`、`WT_SESSION` 等 | 判断终端是否支持 Unicode，见 [终端输出](./terminal-output.md) |

**退出状态**

| 状态 | 情况 |
|------|------|
| 0 | 正常退出（终端界面的主菜单上选了退出、网页界面上点了「完成」、网页界面的页面关了）、`--help`、`--version` |
| 1 | 没有交互式终端、目录读不了、目录格式有误或版本过高、意外错误 |
| 2 | 启动参数不对 |
| 130 | 用户按了 Ctrl+C（提问中——网页界面开着时是待命的提问；或提问之外经 `interrupt`——读目录、下载、网页界面正在装的时候） |

单个条目安装失败（skill 装不上、宿主的 MCP 命令非零退出或起不来、工具装完复核不通过）、向 GitHub 查询失败（含被限流），都**不改变退出状态**：前一种只在结果里列出，后一种打出出错说明后回到主菜单（网页界面里出错说明在页面上这一批的结果里，可以接着挑）。

**目录来源**

```ts
// cli/src/catalog.ts
export interface CatalogSource {
  readonly kind: 'remote' | 'local';
  locate(file: string): string;            // 给用户看的网址或路径
  readText(file: string): Promise<string>; // 读不到时抛出
  pin(options: PinOptions): Promise<PinnedSource>; // 钉住来源此刻的内容，见「安装 skill」
}
export function githubCatalogSource(): CatalogSource; // 默认：GitHub 上本仓库 main 分支的原始文件
export function localCatalogSource(dir: string): CatalogSource;
```

默认来源只走 HTTPS，`fetch` 带 `redirect: 'error'`，不跟随任何跳转；20 秒超时。

**目录文件**

- `index.json`：`{ "version": 1, "skills": [...] }`，字段见 [清单与版本](../skills/manifest-versioning.md)。
- `catalog.json`：`{ "version": 1, "purposes": [], "skillPurposes": {}, "thirdPartySkills": [], "mcps": [], "tools": [], "apps": [] }`。四个数组可以缺省，缺省当作空。四类条目的内容都读、都校验：`apps` 的字段见下，`thirdPartySkills` 的见 [安装 skill](./skill-install.md) 的第二个 Scenario，`mcps` 的见 [安装 MCP](./mcp-install.md)，`tools` 的见 [安装工具](./tool-install.md)。
- `apps` 的一条（外部项目；键名没有跟着改，见 [清单与版本](../skills/manifest-versioning.md)）：

  ```json
  { "name": "dify", "description": { "zh": "…", "en": "…" }, "url": "https://github.com/langgenius/dify", "purpose": "dev-workflow" }
  ```
- `purposes`（用途清单）和 `skillPurposes`（本仓库个别 skill 的用途）也可以缺省：

  ```json
  "purposes": [{ "id": "dev-workflow", "name": { "zh": "开发工作流与规范", "en": "Development workflow & conventions" } }],
  "skillPurposes": { "archify": "documents" }
  ```

  读出来的结果在 `Catalog` 上：`purposes` 是清单里合规则的各项，顺序照文件；第三方 Skill、MCP、工具、外部项目各带 `purpose`（清单里的一个标识）和 `recommended`（没写是 `false`）；skill 的 `purpose` 只有在 `skillPurposes` 里给它写了、且那个用途在清单里时才有。**画面用到了 skill 的 `purpose`，MCP、工具和外部项目的 `purpose` 和 `recommended`**：主菜单的「推荐」和各个用途怎么数、进去之后列什么，见上面「主菜单与流程」。
- 两个文件的 `version` 都是整数的格式版本号，安装器目前认识到 1。

### 4. Validation & Error Matrix

整份读不了时抛出 `CatalogError`，入口把它交给呈现层并以 1 退出：

| 情况 | 出错 |
|------|------|
| `readText` 抛出（断网、HTTP 非 2xx、文件不存在） | 无法读取目录，原因里带简短的技术原因（错误码或 `HTTP 404`），位置单独一行 |
| 不是合法的 JSON；顶层不是对象；`version` 不是正整数 | 目录格式有误 |
| `skills` 不是数组；`thirdPartySkills`/`mcps`/`tools`/`apps` 存在但不是数组 | 目录格式有误，指出字段 |
| `version` 大于安装器认识的版本 | 目录格式版本不受支持，提示 `npx oxy-tools@latest`；**不尝试解析** |

单条 skill 条目写坏时只跳过这一条，连同原因记进 `Catalog.skipped`（哪个文件、哪个数组、第几条、哪个字段，类型见 [目录校验与 CI](./catalog-validation.md)）；主菜单上方只提示数量，逐条的原因由目录校验命令说：

| 字段 | 规则 |
|------|------|
| `name` | 小写 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `version` | 非空文字 |
| `path` | 相对路径，按 `/` 分段，每段匹配 `^[A-Za-z0-9._-]+$` 且不是 `.`、`..`；因此绝对路径、盘符、反斜杠、空段、结尾斜杠都被拒绝 |
| `description.zh`、`description.en` | 非空文字 |
| 所有文字 | 不含控制字符（`\u0000-\u001f`、`\u007f-\u009f`）——目录是远程数据，会原样打到终端上 |
| 重名 | 只留第一条，其余计入跳过 |
| 不认识的字段 | 忽略 |

外部项目条目（`catalog.json` 的 `apps`）同样逐条校验，写坏的只跳过那一条：

| 字段 | 规则 |
|------|------|
| `name` | 与 skill 的 `name` 同一条规则。**名字只在各自的数组里唯一**：外部项目可以和某个 skill 同名 |
| `description.zh`、`description.en` | 非空文字，不含控制字符 |
| `url` | `^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$`，且 `URL.canParse` 通过。只收 https；只含 RFC 3986 允许的字符，别的（汉字、空格）要先做百分号编码 |
| 重名、不认识的字段 | 同上 |

四类条目（第三方 Skill、MCP、工具、外部项目）另有两个共有的字段，在各自的字段都查完之后查，先 `purpose` 后 `recommended`：

| 字段 | 规则 | 不合规则时 |
|------|------|------------|
| `purpose` | 必须有，且是用途的标识（与 `name` 同一条正则） | 跳过这一条，原因是 `bad-field`、规则 `purpose` |
| `purpose` | 这个标识在用途清单里 | 跳过这一条，原因是 `unlisted-purpose`，带着写的那个标识 |
| `recommended` | 可以省略（当作 `false`）；写了就得是布尔 | 跳过这一条，原因是 `bad-field`、规则 `boolean` |

本仓库 skill 以外的条目**有且只有一个用途**，没有用途的不归进什么「其他」，而是跳过——和别的写坏的条目一样连同原因进 `Catalog.skipped`，主菜单上方照旧只提示数量。没有 `purposes` 的旧格式目录因此读得了、不崩：里面的 skill 照常，四个数组里的条目全部因为没有用途被跳过。

用途清单和本仓库 skill 的用途**写坏了也不让整份目录读不了**，受影响的东西各自降级：

| 哪里写坏 | 安装器怎么读 | 记进哪 |
|----------|--------------|--------|
| `purposes` 不是数组 | 当作空的清单：四个数组里的条目都因「用途不在清单里」被跳过 | `Catalog.flaws`（`purposes-not-array`），条目各自进 `skipped` |
| `purposes` 的一项不是对象；`id` 不合 `name` 的正则；`name` 不是对象；`name.zh`、`name.en` 不是非空文字或含控制字符 | 这一项不算数；用它的条目因「用途不在清单里」被跳过 | `flaws`（`purpose`，带第几项、标识、问题） |
| `purposes` 里两项的 `id` 相同 | 只留第一项 | `flaws`（`purpose`，问题是 `duplicate`） |
| `skillPurposes` 不是对象 | 当作没写：没有哪个 skill 有用途 | `flaws`（`skill-purposes-not-object`） |
| `skillPurposes` 的键不是 `index.json` 里读得出来的 skill | 这一项不起作用 | `flaws`（`unknown-skill`） |
| `skillPurposes` 的值不是用途的标识，或不在用途清单里 | **这个 skill 不跳过**：它没有用途，照常是目录里的一个 skill | `flaws`（`skill-purpose`，带 skill 的名字；写的是个标识时带上它） |

`Catalog.flaws` 里的东西安装器一句都不提（它不影响用户能装什么），只有目录校验命令报，见 [目录校验与 CI](./catalog-validation.md)。本仓库的 skill 没有用途是常态，不是问题：凡是放进仓库的 skill 都属于「推荐」，只有个别的另外归到一个用途下。

`url` 收得这么紧是因为它有两个去处：原样打到终端上让用户复制，和放进网页界面的画面状态、由页面画成在新标签页打开的链接（安装器自己从不把它交给系统的打开命令）。规则保证里面没有空白、引号、反斜杠、控制字符和不可见的字符（如改变文字方向的 `U+202E`），所以它在终端上不会被折开、看到的就是打开的。这条规则是工单 07 的实现者定的，**维护者尚未确认**；要放宽（比如收 `http`）先改这里和 `catalog.ts` 的 `HTTPS_URL`。

其他不能继续的情况：标准输入或标准输出不是终端 →「没有交互式终端」，不打印大标志，不问语言，不读目录；任何没预料到的异常 →「意外错误」，原因取消息的第一行（为空时用错误的类型名），不打印堆栈。

### 5. Good/Base/Bad Cases

- Good：`index.json` 有 11 条合法 skill，`catalog.json` 四个数组为空 → 主菜单只有「推荐」（数量 11）和退出。
- Base：`index.json` 里一条的 `path` 是 `skills/../x` → 这一条被跳过，提示「目录中有 1 个条目格式有误，已跳过」，其余照常。
- Bad：`catalog.json` 的 `version` 是 2 → 不看它的其余内容，提示升级，以 1 退出。
- Good（语言）：系统语言是英文，不带 `--lang` 启动 → 大标志之后问 `Language / 语言`，光标在 `English` 上，按键提示是英文；下移到 `中文` 回车后，加载提示起全是中文。
- Base（语言）：`--lang en --help` → 不问，帮助是英文；`--lang fr` → 不问，出错「无法识别的参数」，退出状态 2，说明用系统语言。
- Bad（语言）：选完语言后目录读不了 → 出错说明用选定的语言，它的标题与语言提问收成的那一行之间空一行；以 1 退出。
- Base（外部项目）：`apps` 里一条的 `url` 是 `http://…` → 这一条被跳过并计入提示的数量，其余外部项目照常；一个用途下的外部项目全部被跳过时，主菜单不出现这个用途。
- Good（用哪个界面）：有桌面的 macOS 上不带参数 → 没有语言提问，链接打开器被调用一次，终端上是「网页界面开着」的块。
- Base（用哪个界面）：同一台机器上经 `ssh` 连进来运行（`SSH_CONNECTION` 非空）→ 大标志之后直接是语言提问，和 `--terminal` 的画面逐字相同，链接打开器没有被调用。
- Base（用哪个界面）：Linux 上只有 `WAYLAND_DISPLAY`、没有 `DISPLAY` → 网页界面；两个都没有 → 终端界面。
- Bad（用哪个界面）：`--terminal=1` → 出错「无法识别的参数」，退出状态 2；`--help`、`--version`、参数有误、没有交互式终端这四种在有桌面的机器上也不打开浏览器。
- Good（外部项目）：进一个用途，勾两个外部项目确认 → 不问开始不开始，一个「外部项目：2 个，只给链接」分区列出各自的说明与链接，回到主菜单；`result.opened` 是空的。
- Base（用途）：`mcps` 里一条没写 `purpose`，另一条写的用途不在 `purposes` 里 → 两条都被跳过，提示「目录中有 2 个条目格式有误，已跳过」，其余 MCP 照常。
- Base（用途）：`skillPurposes` 给 `alpha` 写了一个清单里没有的用途 → 没有提示，`alpha` 照常在「推荐」里，只是不在任何用途下；目录校验命令报出来。
- Bad（用途）：`purposes` 写成了对象 → 目录照常读出来，「推荐」照常，主菜单上一个用途都没有；四个数组里的条目全部被跳过并计入提示的数量。

### 6. Tests Required

测试只经 `runInstaller` 断言——给定目录、主目录、应答，看终端上输出了什么、退出状态是多少、记录到哪些命令和链接。不为内部模块单独写测试。另一个接缝是两条仅供开发的命令——目录校验命令和上游核对命令，它们的测试把命令当子进程跑，见 [目录校验与 CI](./catalog-validation.md)。

**观感不靠测试把关**：栏宽、缩进、各画面的版式交给界面预览页和视觉评审，测试不卡死它们（见下面 Wrong 的例子）。例外是规格点名要卡住的几样，它们是对外的行为：

| 断言什么 | 在哪 | 怎么断言 |
|----------|------|----------|
| 安装范围：问不问、两项与顺序、光标起始、每次都问、返回时回到哪；装到项目时 skill 和第三方 Skill 落在哪、状态和另问按哪个目录、汇总里的位置、工具不受影响；MCP 装到项目（Claude Code 的命令与运行目录、状态按范围读、明文与批准的提醒、Codex 不支持） | `scope.test.ts`；栏间隔在 `columns.test.ts` 的「栏间隔：选择安装范围」 | 给 `answersScope: true` 自己应答（`choose('项目')`、`accept()`）。落在哪看 `result.project` 和 `result.home` 两个目录里有什么——「主目录没有变化」把每个文件的内容都比一遍，不只比文件清单；命令看 `result.commands` 里有没有 `--global` 和 `cwd`。假的 skills CLI 要照真的来：带全局选项的往 `home` 写，不带的往 `cwd` 写，这样「装到了全局而项目里没有」才判得出失败。提问的行只卡文字和先后，不写死缩进；真实的画面（光标在哪、收成一行、在不可选的 MCP 上按空格勾不上）在同一个文件末尾用 `keys` |
| 用哪个界面：缺省网页界面的三种机器、直接用终端界面的三种情形、`--terminal` 与 `--lang` 同给、不问就退出的四种情况不打开浏览器、帮助里的 `--terminal` | `web-default.test.ts` | 给 `web: true`（或页面的脚本），平台和环境变量由用例给。进了网页界面看 `result.opened` 有一个网址、输出里没有语言提问；直接是终端界面的看 `result.opened` 是空的、有语言提问，**并且 `result.screen` 和架子缺省带着 `--terminal` 的那一次逐字相同**——「终端上不为此多说一句」靠的是这一条 |
| 上不上色 | `startup.test.ts` 的「颜色」一组、`prompts.test.ts` | 原始输出（`result.raw`）里有没有样式码；`NO_COLOR` 下画面文字不变 |
| 大标志的三档颜色 | `startup.test.ts` 的「大标志的颜色」一组 | 从原始输出里读出每个方块前面生效的前景色码，按它在字形里的列号归拢（`logoColors`）：渐变那一档卡两端、正中和两个四分点的色值，且同一列同色；洋红那一档每个方块都是 `35`、没有 `38;2;`；`NO_COLOR` 与 `COLORTERM` 同时设置时一个样式码都没有。期望的色值是照色标手算的，不从实现里取 |
| 焦点符号是洋红、输出里没有青色 | `prompts.test.ts` 的「焦点色」一组 | 用真实的交互库（`keys`）：`?`、`▸`、`■`、转动符号前面紧挨着洋红的码；四种提示连同各自出错时多出来的那一行都走一遍，原始输出里没有 `36`、`96`。那个文件强行打开了 Node 的上色，主题漏盖了哪个样式函数，交互库自带的青色就会在这里漏出来 |
| 按键提示整行在 79 列以内 | `prompts.test.ts` | 用真实的交互库断言整行；英文界面加没有 Unicode 的多选那一行正好 79 列，另量它的宽度 |
| 多选回答后收成的那一行放不下时由呈现层折行：名字不拆开、「等 N 项」跟着最后一个名字、续行缩进两格；连第一个名字都放不下时回答整个从下一行起 | `prompts.test.ts` 的「真实的画面：外部项目」「真实的画面：第三方 Skill」 | 收成的那一行是交互库打的，所以用 `keys` 加 `screenLines`，拿收成的那两行**整行去比**，再加它后面的那一行空行。这里折在哪、续行缩进几格就是被测的行为本身（规格的「任何一行不超过 79 列」），所以卡整行；期望的两行是照规则手算的，样例的名字取自真实目录里最长的几个。中文、英文各一条，另一条是连第一个名字都放不下的 |
| 语言提问：问不问、问什么、光标起始在哪、选了之后用哪种语言 | `startup.test.ts` 的「语言提问」一组、`prompts.test.ts` 的「真实的画面：语言提问」一组 | 给 `answersLanguage: true` 自己应答。问不问看 `output` 里有没有 `Language / 语言`；光标起始在哪用 `accept()` 证明（接受之后的画面是哪种语言），真实的画面上再看 `▸` 在哪一行；收成一行、按键提示的语言用 `keys` |
| 表的栏间隔是三格 | `columns.test.ts` | 从一栏里**最长的那一格**写起，卡它后面恰好三格再是下一栏：`/beta-pack {3}Claude Code {3}新装/`。右对齐的栏（主菜单的数量）最长的一格后面不直接是下一格的字，改拿表头量这一栏从第几列开始（`startOf`）。**只卡间隔**：不写死行首缩进了几列、不卡折行点、不拿整行去比——整行相等会把缩进、勾选框和整句文案一并卡死。每张表至少一条，中文与英文各有 |
| 混合列表：说明一栏不足 12 列时整栏不写；不可选的行里原因落在状态一栏（原因比状态栏宽时各行的说明仍从同一列起）；两种类型的状态落在各自宿主那一栏；任何一行不超过 79 列 | `recommended.test.ts`、`mixed.test.ts`、`prompts.test.ts` 的「不可选的 skill 行」 | 12 列是规格定的阈值，所以卡它两侧各一条（名字长一个字母就整栏不写）；栏对不对得齐拿表头量各栏从第几列开始（`startOf`），不写死是第几列；行宽量的是整张列表里最宽的一行。量宽度用的是 `src/text.ts` 的 `displayWidth`（`columns.test.ts` 另有自己的一份 `columnsOf`，两处没有统一） |
| 光标停在不可选的行上时列表下方仍有类型和说明 | `spacing.test.ts`、`prompts.test.ts` | 只能用真实的交互库（`keys`）：预设应答的提问器不管行可不可选都把说明记进 `output`，看不出差别。断言某一行之后的几行；「注意」出现时在它们前面，再按一个键它消失而那两行还在 |
| 块与块之间的空行：四条规则、没有连着两行空行、矮终端里提问不被顶出屏幕 | `spacing.test.ts` | 提问上下的空行是交互库画的，所以用 `keys` 加 `screenLines`，断言某一行**之后的几行**是什么（`after(lines, '? 选择用途', 2)` 得到空行和表头）。**只卡空行在不在**：别的行用宽松的正则，不写死缩进。呈现层自己打的分区（汇总、出错、帮助）用预设应答的 `result.screen` 就够。「没有连着两行空行」把脚本的每一步都停下来看一眼（每一步各跑一遍、在那一步按 Ctrl+C），提问还在问和回答之后的样子都在里面。矮终端给 `rows: 24`，画面读 `screenLines(raw, 24)` 的最后 24 行 |
| 标题区的摆法：居中、字形、上下各空一行、标志下面没有横线、产品名粗体与版本号暗淡 | `startup.test.ts` 的「启动」一组 | 它是一块固定的字符画，摆法就是它的全部内容。居中量的是左右空白差不超过一列，**不写死补了几格**；字形是各行去掉同样多的缩进后与字形逐行相等——只量整块的边距的话，各行各自居中、字形走样了也照样通过 |

测试架子在 `cli/test/harness.ts`：

```ts
const result = await run({
  answers: [choose('推荐'), pick('alpha'), choose('取消'), choose('退出')], // 按预设应答的提问器
  catalog: catalogDir({ index: { version: 1, skills: [...] } }), // 写到临时目录的本地样例
  env: { NO_COLOR: '1' },
  tty: { stdout: false },                                        // 哪个流不是终端
});
result.exitCode; result.output; result.stdout; result.stderr; result.screen; result.commands; result.opened;
result.home; result.tmp; // 临时的主目录、交给安装器放临时文件的目录
result.project;          // 临时的项目目录（options.projectDir）；初始内容用 run({ project: { 相对路径: 内容 } }) 给
```

**架子缺省走终端界面：它在启动参数最前面带上 `--terminal`**（工单 13 起；`argv` 里给的排在它后面），所以不测网页界面的用例和加网页界面之前一样写。要让安装器自己定用哪个界面，给 `web: true`：架子不带 `--terminal`，并在环境变量里放一个 `DISPLAY`（架子的平台缺省是 `linux`，这样才算有桌面）——没有别的缘故就是网页界面。给了页面的脚本就是 `web: true`。专门测「用哪个界面」的用例（`web-default.test.ts`）也给它，再自己加上该让它改用终端界面的那一样（`env: { SSH_TTY: … }`、`env: { DISPLAY: '' }`、`argv: ['--terminal']`）；`env` 里给的盖过架子放的。

**测网页界面：给一段「在页面上做什么」的脚本**（任务 `10-11-installer-web-ui` 工单 03 起）。架子从只记录的链接打开器那里拿到网址，**经真实的本机 HTTP 扮演浏览器**：用网址里的口令连上长连接，收到第一份画面状态之后跑脚本。不为网页界面另开接缝。

```ts
const result = await run({
  page: async (page, { home, project, terminal }) => {  // 第二个参数是这次运行的主目录、项目目录，和用户面前的终端
    expect(page.state().machine.hosts).toEqual([...]); // 最近收到的那份画面状态
    await page.send({ type: 'finish' });               // 发一个意图，等到它的答复
  },
});
result.exitCode; result.opened; // opened[0] 就是网页界面的网址
```

| `page` 上的 | 是什么 |
|-------------|--------|
| `url`、`token` | 交给链接打开器的网址，和里面的口令 |
| `state()` | 最近收到的那份画面状态 |
| `until(predicate)` | 等到一份让 `predicate` 为真的画面状态（已经是了就当场给） |
| `send(intent)` | 像页面那样发一个意图；答复不是成功就失败 |
| `reload()` | 再开一条长连接（刷新，或再开一个标签页），给出它收到的第一份画面状态 |
| `closed` | 页面的长连接断开时兑现（安装器退出了，或用例自己 `close()` 了） |
| `close()` | 关掉这一页：收掉它开着的每一条长连接（工单 11 加的）。之后 `reload()` 就是重新打开 |
| `request(path, { method, headers, body })` | 不经页面直接发一个 HTTP 请求，头由用例给（口令和 `Origin` 都不代填；不给 `Host` 时它是网址里的那个）：用来扮演别的网站、别的机器。给出 `status`、`headers`、`body` |
| `received()` | 这一页到现在为止从安装器收到的**全部东西**连成的一份字（工单 10 加的）：每个答复的状态、头和正文，长连接上每一份画面状态的原文。用来整份去搜不该出现的字——填的 key、将执行的命令（`web-mcp.test.ts`） |

- **终端上的事也由页面的脚本来做**（工单 11 加的）：第二个参数里的 `terminal` 是用户面前的终端。`terminal.press('t')` 在待命的提问上按一个键（`KEY.ctrlC` 就是在它上面按 Ctrl+C）——这时没有待命的提问在等就失败，按键不会悄悄丢掉；`terminal.screen()` 是这一刻留在画面上的字（和 `result.screen` 同一种算法），用来在途中看「按键提示在不在」；`terminal.raw()` 是到这一刻为止终端收到的原始输出，交给 `screenLines` 还原真实的画面。
- **用真实的交互库测待命**（给了 `keys`，哪怕是空的 `keys: []`）：`terminal.press` 把键直接写进假键盘，没有人在听也不报错，所以**先等按键提示画出来**（轮询 `terminal.raw()`），要它认的键（`t`）还得再等过 100 毫秒——待命刚画出来时收到的键不算数（[终端输出](./terminal-output.md) 的「待命的提问」）；Ctrl+C 不用等。`prompts.test.ts` 的「真实的画面：网页界面开着时的待命」里有现成的两个帮手 `drawn`、`listening`。要造「早先敲的键在待命画出来的那一刻送到」，等输出里出现按键提示的那一拍（`setImmediate` 里轮询）就按，不要提前写进假键盘——提前写的会被交互库在首帧之前丢掉，测不到。
- `heldCatalog(dir?)`（`harness.ts`）：一个会卡在向 GitHub 查询上的本地目录来源，`release()` 之后照常装——停在一批装到一半的地方用它（`web-lifecycle.test.ts`、`prompts.test.ts`）。要停在**一条外部命令跑到一半**的地方（工具的命令正在终端里跑），让 `commandResult` 返回一个还没兑现的承诺，要它结束时再兑现（`web-tools.test.ts` 的 `held()`）。**关了页面紧接着就让这一批装完的用例，中间要等过时限**（`await sleep(PAST_GRACE)`）：页面这头断开了，安装器那头要晚一拍才察觉，这一拍里装完的话它还以为页面连着，结果不会补打在终端上——`heldCatalog` 放行之后还要下载，赶不上这一拍；命令的承诺一兑现当场就装完了，赶得上。待命的提问不吃 `answers`：它什么时候被按是页面的脚本定的（先在页面上勾几样，再回终端按 `t`），排进 `answers` 的话一问出去就答了，页面还没连上。按了 `t` 之后的终端界面照常用 `answers` 应答。
- `pageGraceMs`：页面全都断开之后等多久，架子缺省给 150 毫秒（正式运行是 5 秒）；要在时限内重连的用例自己给一个长些的。
- 脚本跑完之后安装器应当已经退出（点了「完成」、页面关了满时限、按了 `t` 之后终端界面走到了退出，或脚本里触发了 `interrupt`）；两秒之内没有退出，架子替它中断并让测试失败。脚本里抛出的错（断言失败）同样先中断安装器再抛出来，不会挂住。
- 架子扮演浏览器用的是 `node:http`，不用全局的 `fetch`：有的用例拿假的 GitHub 替换了它。
- **浏览器打开了却没有页面连上**（「没连上过不退出」）：不给 `page`，给 `web: true`——链接打开器照样兑现，只是没有人去连；收场用 `interrupt`。
- `browserOpens: false`：链接打开器照样记下网址，然后拒绝——浏览器打不开。`webDir: <一个不存在的目录>`：页面的静态文件读不到——本机的网页起不来。这两种都退回终端界面，所以不给 `page`，给 `web: true`，后面的终端界面照常用 `answers` 应答（语言提问照旧由架子代答）。
- 页面的静态文件是构建产物：`vitest.config.ts` 的 `globalSetup`（`test/build-web.ts`）在全部测试之前把页面打一遍到 `dist/web/`，架子缺省把它当 `webDir`。
- 页面本身不写自动化测试（它只把画面状态画出来、把操作变成意图）；规则都在安装器这边，经这里测到。
- **页面开着的时候要改机器上的东西，用脚本的第二个参数**（工单 07 加的）：`{ home, project }` 是这次运行的主目录和项目目录，脚本里往那里写（`writeTree(home, …)`），再发意图或 `page.reload()`——「汇总之后状态变了不装」就是这样测的（`web-install.test.ts`）。工单 07 之前拿不到主目录，`web-browse.test.ts` 的「状态是现查的」因此是把宿主的配置目录用 `env` 指到用例自己建的临时目录（`CLAUDE_CONFIG_DIR`、`CODEX_HOME`）；那个办法仍然有效，但 skill 目录不认这两个变量，只能用主目录。
- **要看一批装到一半的样子**（哪一行正在下载、正在装的时候哪些意图不照办），给一个会卡住的目录来源：`{ ...localCatalogSource(dir), pin: async (options) => (await held, local.pin(options)) }`，脚本里放行。进度是一份份推来的，**要等的那一份可能在发意图的答复回来之前就推完了**：先 `const seen = page.until(…)` 挂上，再发意图，最后 `await seen`。
- 架子在每条测试之后把它建过的临时目录都删掉（`afterEach`），所以样例目录（`catalogDir()`）要在每条测试里现建，不能放在模块顶层共用：第二条用到它的测试会因为目录已经不在而「安装器没有打开网页界面」（工单 06 踩到过）。
- 逛目录的用例（`web-browse.test.ts`）按左栏上的字去换列表：从 `page.state().menu` 里找名字对得上的那一行，把它的 `id` 原样放进 `open` 意图——和页面做的是一回事，用例不去拼 `id`（专测「不在左栏里的列表不照办」的那一条除外：它要造一个不在左栏里的）。

- **语言提问缺省由架子替用户按回车**，接受光标起始所在的那一项：`answers` 和 `keys` 里都不用写它。光标的起始位置是按系统语言定的，所以靠 `env: { LANG: … }`、`systemLocale` 决定界面语言的测试照旧成立，带 `--lang` 的也一样（那时根本不问）。专门测语言提问的用例给 `answersLanguage: true`：它就和别的提问一样，用掉 `answers` 的第一个应答，或由 `keys` 的脚本来按。用 `keys` 时架子等语言提问画出来才按回车，并且等它收成一行之后才开始认脚本要等的字——语言提问自己的按键提示不算数。

- **安装范围的提问同样缺省由架子替用户按回车**（全局）：`answers` 和 `keys` 里都不用写它，所以不测安装范围的用例的应答序列和加这一问之前一样；它照样被记进 `output`。专门测它的用例给 `answersScope: true`，自己应答（`choose('项目')`、`accept()`，或由 `keys` 来按）。架子靠提问的文案认它（`test/terminal.ts` 的 `SCOPE_QUESTIONS`，中英各一句），改了文案要跟着改。

- `choose(label)` 按画面上第一栏的字选一项（单选），那一项不在、或者不可选，就失败；`pick(...labels)` 是多选，只勾这几项再确认，一个都不传就是什么都不勾直接确认；`accept()` 是什么都不动直接回车——单选选中光标起始所在的那一项（它不可选就失败），多选照提问出现时的勾选确认，用来证明“默认是什么”；是否题取它的缺省回答，用来证明“默认是什么”；`yes()`、`no()` 回答是否题；`secret(值)` 回答隐藏输入（问 key），`blank()` 是什么都不输直接回车；`interrupt()` 表示在这个提问上按 Ctrl+C。应答用错了提问的种类（单选用了 `pick`、是否题用了 `choose`、隐藏输入用了 `accept`……）会直接报错，并说该用哪个。预设的应答没用完或不够用，测试都会失败——所以“这里不该多问一次”不用另写断言，多问了自然会失败。
- 预设应答的提问器把每个提问照画面的样子记进 `output`（提问——它上下的空行在主题的提问标记和提问样式里，有就照打——、每一行、光标所在行的说明全文；多选的每行前面带勾选框；不可选的行照交互库的拼法——单选的行首一个短横，多选的是不可选的勾选框——原因接在后面，并经过主题的 `disabled` 样式；是否题只有提问和后面的 `(y/N)` 或 `(Y/n)`；隐藏输入只有提问和后面那句固定的提示，**输入的东西不记**），所以“菜单里有什么”可以直接断言文字。它只是照着拼的：**一行到底选不选得了，要用 `keys` 在真实的交互库上证明**。
- 外部命令执行器只记录不执行：每条命令按先后进 `result.commands`（`{ command, args }`；整行交给 shell 的多一个 `shell: true`，`args` 是空的；不经 shell 而另带了环境变量的多一个 `env`——第三方 Skill 的安装命令，断言「不是 shell 方式」「带着关遥测的变量」看的就是这两样），缺省都以 0 退出。不经 shell 而指定了在哪个目录下运行的再多一个 `cwd`（装到项目的第三方 Skill；装到全局的没有这个键）。`commandResult: (command, args, { home, cwd }) => …` 预设结果（`cwd` 就是那条命令的运行目录，没指定时是 `undefined`）：返回 `{ exitCode: 3 }` 让它非零退出，返回一个 `Error` 表示命令没能起来，它自己抛出表示执行器当场抛出（没返回承诺），什么都不返回就是成功；**返回一个承诺表示这条命令还在跑**，它兑现成上面那几种之一时才结束（任务 `10-11-installer-web-ui` 工单 12 加的：网页界面的用例要停在工具的命令跑到一半的地方，看页面上那一行和终端上有没有待命的提问）。假的执行器不会真的改宿主的配置、也不会真的装工具——要证明“装完再看是新状态”，让 `commandResult` 顺手把配置文件写出来，或往第三个参数给的 `home`（这次运行的临时主目录）里写出工具的检查路径。
- 链接打开器只记录：要打开的网址按先后进 `result.opened`。走终端界面的运行里安装器不调用它：`expect(result.opened).toEqual([])`；走网页界面的运行里它恰好被调用一次，记下的就是网页界面的网址。
- **样例目录带着用途清单。** `fixtures.ts` 的 `EMPTY_CATALOG` 里有 `SAMPLE_PURPOSES`（两个用途），`SAMPLE_MCPS`、`KEYED_MCP`、`SAMPLE_TOOLS`、`SAMPLE_APPS` 的每一条都写了其中一个；所以照 `{ ...EMPTY_CATALOG, mcps: [...] }` 拼目录、照 `{ ...SAMPLE_TOOLS[0], name: 'x' }` 拼条目的用例不用管用途。**从头手写一条条目时要自己带上 `purpose`**，不然它会因为没有用途被跳过——断言「没有这一条」的用例会因此假通过。要造没有用途清单的旧格式目录，自己写 `{ version: 1, mcps: [...] }`，不从 `EMPTY_CATALOG` 展开。界面预览页（`scripts/preview.ts`）的样例条目同理：它用的也是 `EMPTY_CATALOG` 带的那份用途清单（外部项目的场景另带一份 `SHOWCASE_PURPOSES`），新加的样例条目要写清单里的一个用途，不然那一格里它就不见了。
- **主菜单上第一行是「推荐」，各个用途排在它后面。** 用 `keys` 按光标走的用例，光标起始在「推荐」上（目录里一个 skill 都没有、也没有带推荐标记的条目时才落在第一个用途上）：`[HINT, KEY.enter]` 进的是「推荐」，再下移一行是第一个有条目的用途。第三方 Skill、MCP、工具和外部项目都会让它们的用途出现在主菜单上，所以要按「下移几行」走的用例得数清中间有几个用途；用预设应答的 `choose('联网搜索与文档检索')` 按字选，不受影响。
- **第三方 Skill 从用途进（带推荐标记的也在「推荐」里）。** 样例是 `fixtures.ts` 的 `SAMPLE_THIRD_PARTY`：两条都在「联网搜索与文档检索」下，`paper-kit` 含三个 skill（勾了它会多出一张清单，要多预设一个 `pick(...)`），`solo-notes` 只含一个叫 `note-taker` 的 skill（条目的名字和 skill 的名字故意不同：汇总、命令、结果里出现的是 skill 的名字）。`EMPTY_CATALOG` 里没有它们，要用时自己拼 `{ ...EMPTY_CATALOG, thirdPartySkills: SAMPLE_THIRD_PARTY }`。假的执行器不会真的装东西：让 `commandResult` 在「执行」那条命令时往 `home` 里写出 `<skill 目录>/<名字>/SKILL.md`（`third-party.test.ts` 的 `installs()`），不写就是「命令结束了但没装上」。
- **工具没有自己的入口，从用途进。** 样例的两个工具分在两个用途下（`fetcher` 在「联网搜索与文档检索」，`linter` 在「开发工作流与规范」）；要它们在同一张列表里，用 `underWebSearch(...SAMPLE_TOOLS)` 归到一个用途（`tools.test.ts` 的 `withTools` 就是这样）。目录里只有工具时这张列表没有 skill 和 MCP，所以检测到两个宿主也不问装进哪些。**样例的工具和 MCP、外部项目共用那两个用途**：往目录里加 `tools: SAMPLE_TOOLS` 会让两个用途的数量各加一、两张列表各多出工具一段，光标起始也落到工具上——要一张只有外部项目（或只有 MCP）的列表，就别带工具，或像 `spacing.test.ts` 的 `componentCatalog` 那样把工具挪到另一个用途下。
- **MCP 没有自己的入口，从用途进。** 样例的两个 MCP 分在两个用途下（`docs-local` 在「联网搜索与文档检索」，`tracker-remote` 在「开发工作流与规范」）；要它们在同一张列表里，用 `underWebSearch(...SAMPLE_MCPS)` 归到一个用途。样例的 skill 没写用途、只在「推荐」里，所以这样进去是一张只有 MCP 一段的列表；要三种类型同表，给目录加 `skillPurposes: { alpha: 'web-search' }` 和 `apps: SAMPLE_APPS`（`mixed.test.ts` 的 `MIXED`）。**一段里的先后是按名字排的，不是目录文件里的先后**：预设 key 的应答、断言命令的先后时照名字来。
- **断言用途的顺序时，别让数量恰好也是那个顺序**：排在后面的用途条目更多，才分得出「照用途清单」和「照数量」。用途的读取规则在 `cli/test/purposes.test.ts`，每种写坏的情况各一条。
- 宿主的配置文件用 `home` 放：`home: { '.claude.json': JSON.stringify({ mcpServers: { x: {} } }) }`、`home: { '.codex/config.toml': '[mcp_servers.x]\n' }`。
- 运行环境的初始状态：`onPath: ['claude']`（可执行路径上有哪些命令，缺省只有 `claude`——也就是只检测到一个宿主、不问装进哪个；`['claude', 'codex']` 是这两个都检测到，`['claude', 'codex', 'pi', 'omp']` 是四个宿主都检测到，传 `[]` 就是一个都没有；放上一个空的 `omp` 文件就算检测到 omp，安装器从不执行它）；`home: { '.claude/skills/x/SKILL.md': '…' }`（主目录里事先有什么）；`links: { '.claude/skills/x': 'my-skills/x' }`（主目录里事先有的符号链接，链接 → 它指向哪，都是相对主目录的路径；在 Windows 上建的是不需要特权的 junction）；`catalogDir({ content: {...} })`（本地样例目录里各个 skill 的文件，缺省是 `SAMPLE_FILES`）；`interrupt: controller.signal` 和 `tmp`（要在中途触发中断并当场查看临时目录时用）；`columns: 160`（终端的列数，缺省不给，安装器按 80 列算——用来证明某样东西不随窗口的宽度变，如标题区按 80 列居中）；`rows: 24`（终端的行数，缺省 40，安装器和真实的交互库拿到的都是它——用来证明矮终端里列表一屏放多少行）。
- 默认来源（GitHub）的行为用 `cli/test/github.ts` 的 `fakeGitHub()`：它替换全局的 `fetch`，照真实接口的样子答复提交号、文件树和原始文件，记下每个请求（`requests`、`queries()`、`downloads()`）；`intercept` 可以抢在正常答复之前让某个请求失败。用完 `vi.unstubAllGlobals()`。
- `result.screen` 是最后留在画面上的文字（被擦掉重写的加载提示只算最后一次）；比较两次运行的文字时用它，不用 `output`。它只懂 `\r\x1b[2K`。要断言**挪过光标之后**屏幕上到底剩下什么（提问被擦掉了没有、「结果」的标题改写到了哪一行），用 `cli/test/terminal.ts` 的 `screenLines(result.raw)`：它把原始输出放进无头终端（`@xterm/headless`，80 列），读出每一行，连同滚上去的。第二个参数是终端的行数（缺省 60）：给了 `rows` 的运行照样传它，返回的最后那么多行就是还在屏幕上的。
- 断言“某个值不出现在任何输出里”时查 `result.raw + result.stdout + result.stderr`，不只查 `output`。
- 要核对**提问部分实际打到终端上的东西**（符号、按键提示、样式码），改用 `keys`：提问由真实的交互库渲染，脚本等画面上出现某段文字再按键。

```ts
const result = await run({ keys: [['⏎ 选择', KEY.enter], ['▸ beta-pack', KEY.ctrlC]] });
```

每条新行为至少要有：正常路径一条；它引入的每种出错各一条，断言原因、下一步、没有堆栈，以及退出状态（让安装器退出的出错是非零；只让一项失败或一次查询失败的不改变退出状态）。

### 7. Wrong vs Correct

#### Wrong

```ts
// 为内部模块单独写测试：重构一动就坏，而且没验证用户看到的东西
import { wrap } from '../src/text.ts';
expect(wrap('…', 10)).toEqual([...]);
```

```ts
// 等提问画出来时用了已回答的那一行里也有的字：键发早了会丢
await run({ keys: [['选择', KEY.enter], ['选择', KEY.down]] });
```

```ts
// 断言里写死 POSIX 路径：Windows 上 path.join 得到的是反斜杠
expect(result.output).toContain('/nonexistent/catalog');
```

```ts
// 卡死表头缩进了几列：这是版式，交给界面预览页和视觉评审
expect(result.output).toMatch(/^\s{3}名称\s+说明$/m);
```

```ts
// 列表里的一行卡死行首只有空白：多选的行前面有勾选框，换成多选就全红
expect(result.output).toMatch(/^\s+beta-pack\s+第二个样例 skill$/m);
```

#### Correct

```ts
const result = await run({ catalog: catalogDir({ index: '{ 坏的 JSON' }) });
expect(result.stderr).toContain('出错：目录格式有误');
expect(result.output).not.toMatch(STACK_FRAME);
expect(result.exitCode).not.toBe(0);
```

```ts
// 等按键提示（每个提问最后画出来的一行）
await run({ keys: [['⏎ 选择', KEY.enter], ['⏎ 选择', KEY.down]] });
```

```ts
const missing = join(tempDir('catalog'), '我的 目录');
expect(result.output).toContain(missing);
```

```ts
expect(result.output).toMatch(/ beta-pack\s+第二个样例 skill$/m);
```

---

## Common Mistakes

### 交互库自带的样式在测试里永远不上色

**Symptom**：主题里漏盖了一个样式函数，`NO_COLOR` 的测试却照样通过。

**Cause**：交互库没被主题盖掉的样式按 Node 的规则上色，看的是真实进程的标准输出；测试进程的标准输出不是终端，所以它本来就不上色。

**Fix**：用 `keys` 的测试文件里先 `vi.stubEnv('FORCE_COLOR', '1')`（见 `cli/test/prompts.test.ts`），漏盖的样式才会露出来。

**Prevention**：每加一种提示（`checkbox`、`password`、`confirm`），在 `prompts.test.ts` 里加一条 `NO_COLOR` 下不带样式码的测试。

### 按键提示的整行断言卡不住行尾

**Symptom**：`/^\s+↑↓ 移动 · ⏎ 选择$/m` 在某个用 `keys` 的测试里不匹配，去掉 `$` 就过了。

**Cause**：提问回答之后，交互库把光标挪回去重画，收成的那一行在去掉控制码的文字里紧接在按键提示后面，中间没有换行。

**Fix**：整行断言放在**以 Ctrl+C 结束的那个提问**上（它的按键提示后面没有重画）；已回答的提问只卡行尾（`/✓ 选择用途 · Skill$/m`）。不要靠去掉 `$` 了事——按键提示必须在 79 列以内，整行断言是查它超宽的地方；各种组合里最长的那一行（英文界面加没有 Unicode）另量了宽度，见上面例外表的「按键提示」一行。

### 两次运行的画面逐字相等，却因为项目目录不相等

**Symptom**：比较两次 `run()` 的 `screen`（如「设置了 NO_COLOR 时文字不变」）失败，差的只是安装范围提问里「项目」那一行末尾的几个字符。

**Cause**：那一行写着当前目录。架子给每次运行各建一个临时的项目目录（`oxy-tools-project-XXXXXX`），名字末尾是随机的；它不在临时主目录里，所以写的是全路径（放不下时从前面截，留下的正是末尾随机的那一段）。

**Fix**：比之前把那一段抹平（`screen.replace(/oxy-tools-project-\w+/, 'oxy-tools-project')`），或让流程不经过这一问。**不要**为此把项目目录挪进临时主目录：断言「主目录里只多出装好的 skill」的用例会多看到一个目录。

### 「任何一行不超过 79 列」量了整份输出

**Symptom**：`for (const line of result.output.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(79)` 不通过，量出来的是 80 或一百多。

**Cause**：两种行本来就超：分区标题的横线照例画满 80 列；预设应答的提问器把光标所在行的说明全文记进 `output` 时**不折行**（真实的交互库会折），说明长的样例一行就是一百多列。

**Fix**：只量要卡的那几行——表里的行（`/^ [□–] /`）、某一行「注意」和它的续行、汇总到提问之间去掉横线的行（工单 11 的写法在 `scope.test.ts` 的 `textLines` 和「Codex 的 MCP 装不到项目」的英文用例）；要量整屏就用 `keys` 加 `screenLines`，再把含 `──` 的行去掉。

### 按标题切出一段再断言「里面没有」，标题却找不到

**Symptom**：`const fromSummary = output.slice(output.indexOf('── Will install')); expect(fromSummary).not.toMatch(/\bomp\b/)` 永远通过——把被测的功能改坏了它也通过（工单 04：英文汇总的标题是 `Install N items`，没有 `Will install`）。

**Cause**：标题找不到时 `indexOf` 是 -1，`slice(-1)` 只剩最后一个字符；「里面没有 X」对一段几乎是空的字自然成立。中文标题改对了、英文照着猜一个，最容易出这种事。

**Fix**：切完先断言**切到了该有的东西**，再断言没有的——`expect(fromSummary).toMatch(/^\s+docs-local\s+Claude Code\s+new$/m)` 在前，`not.toMatch` 在后。标题的原文到 `messages.ts` 里看，不凭印象写。

**Prevention**：只含 `not.` 断言的一段都照这个查一遍：把被测的功能在心里删掉，用例还通过，就是空转。

### 替用户按的键按早了，或按到了别的提问上

**Symptom**：用 `keys` 的测试卡在语言提问上直到超时；或脚本的第一个键落在语言提问上，界面成了另一种语言、后面的键全部错位。

**Cause**：两件事。其一，交互库（`@inquirer/core` 的 `createPrompt`）对真正的可读流会把第一帧推迟一个 `setImmediate` 才画，画完这一帧才开始听按键——在那之前写进假键盘的键被直接丢掉。其二，语言提问的按键提示和主菜单的是同一句（`⏎ 选择`），脚本等的字在语言提问的画面上就已经有了。

**Fix**：都在架子里，测试不用管。假键盘（`cli/test/terminal.ts` 的 `keyboardPrompter`）盯着交互库的输出，等语言提问的最后一个选项画出来，再让出一轮（`setImmediate`）才按回车；架子（`harness.ts`）在语言提问被问出去到收成一行之间不认画面上的字，收成一行时把「认到哪了」推到那一行之后。

**Prevention**：升级交互库后先跑 `prompts.test.ts`：这段靠的是它首帧与听按键的先后，那边一改这里就会卡住或错位。再加一种启动时由架子代答的提问，照语言提问的做法接进这两处，不要在每个测试的 `keys` 前面手写一次回车。

### 直接调入口的用例或脚本挂住不退出

**Symptom**：一条测试 5 秒超时，却没有「没有为提问预设应答」那样的失败；或一个新写的脚本（预览、手动核对）调了 `runInstaller` 之后一直不结束。

**Cause**：缺省是网页界面（工单 13 起）。在有桌面的平台上不带 `--terminal` 调入口，安装器就起本机的网页、调链接打开器，然后等页面来连——没有页面来连它就一直等着（「没连上过不退出」是定好的行为）。测试架子替用例挡住了这件事（缺省带上 `--terminal`），所以只在两种地方出现：给了 `web: true` 却没给 `page`、也没有让它改用终端界面的那一样；绕过架子直接调入口的脚本（`scripts/preview.ts` 的平台缺省是 macOS）。

**Fix**：要终端界面就把 `--terminal` 放在启动参数最前面（放最后的话，`--lang` 缺值时它会被当成 `--lang` 的值）；要网页界面就得有人收场——页面的脚本点「完成」、`interrupt`，或 `browserOpens: false`。

### 往标准输出写了出错说明

**Symptom**：`npx oxy-tools | cat` 时终端上什么都没有，提示进了管道。

**Fix**：出错说明一律经 `ui.failure()`，它写到标准错误。测试里断言 `result.stderr`。
