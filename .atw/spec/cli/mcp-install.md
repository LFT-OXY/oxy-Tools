# 安装 MCP

> 目录里的 MCP 条目（`cli/src/catalog.ts`）、宿主适配里关于 MCP 的三问（`cli/src/hosts.ts`）、状态探测（`cli/src/mcp-status.ts`）、安装动作（`cli/src/install-mcp.ts`）、外部命令执行器（`cli/src/run-command.ts`）五段的契约，以及两套界面共用的那几块（`availability.ts`、`plan.ts`、`run-plan.ts`）和终端界面的流程（`cli/src/flow.ts`）怎么把它们串起来。带 API key 的 MCP（条目里的 `env`）也在这里。

---

## Scenario: 把一个 MCP 写进宿主的配置（全局或项目）

### 1. Scope / Trigger

安装 MCP 会**执行外部命令**，而命令的内容（启动命令、参数、网址）来自运行时拉取的远程目录。凡是改 MCP 条目的字段或校验、改命令怎么拼、改看哪个配置文件、改状态怎么判、改已配置或状态未知时怎么装、动外部命令执行器、动 key 怎么问怎么传、动装到项目时的写法和提醒，或加一个宿主，都落在这份契约上。

安装范围（全局或项目）在进列表之前选定，见 [入口与测试](./installer-entry.md)。下面先写两种范围共有的，装到项目时不同的地方集中在「装到项目」一节。

### 2. Signatures

```ts
// cli/src/catalog.ts
export type McpServer = { command: string; args: string[] } | { url: string }; // 本地进程，或远程地址
export interface McpVariable {  // MCP 启动时要带上的一个环境变量，通常是 API key；值由用户在安装时给
  name: string;
  required: boolean;            // 必填的没填就不装这个 MCP；可选的没填就不传
  description: { zh: string; en: string };
  url: string;                  // 去哪申请
}
export interface Placement { purpose: string; recommended: boolean } // 用途（用途清单里的一个标识）、是否另外进「推荐」；MCP、工具、外部项目共有，见「入口与测试」
export interface Mcp extends Placement {
  name: string;
  description: { zh: string; en: string };
  url: string;        // 官方链接
  hosts?: string[];   // 支持的宿主（Host.id）；省略表示全部支持
  server: McpServer;
  env: McpVariable[]; // 没有就是空的；只有本地进程方式才有
}

// cli/src/hosts.ts
export interface KeyArgument { variable: string } // 命令里带着 key 的一个参数：执行时是「变量名=值」，给用户看时值的位置是占位符
export interface Command { command: string; args: (string | KeyArgument)[] } // 不经过 shell，args 的每一项原样是一个参数
// 一个宿主在某个安装范围下的 MCP 配置：去哪看已经配了哪些、用哪条命令添加和移除
export interface McpConfig {
  configuredMcps(): ReadonlySet<string> | undefined;       // 这份配置里已有的 MCP 的名字；读不了或格式不认识时 undefined
  addMcp(mcp: Mcp, variables: readonly string[]): Command; // variables 是要带上的环境变量的名字，不是值
  removeMcp(name: string): Command;
  cwd?: string;                                            // 添加和移除命令要在哪个目录下运行；没有就是在哪都一样
}
// 项目范围的那一份：写在项目目录里，只对这个项目生效
export interface ProjectMcpConfig extends McpConfig {
  file: string;      // 配置文件，相对项目目录的写法（.mcp.json、.pi/mcp.json）：带 key 的 MCP 的值会以明文写进它
  cwd: string;       // 宿主把配置写进它的运行目录，所以命令要在项目目录下运行
  approval?: string; // 有它表示写进去的 MCP 要用户在宿主里批准之后才启用；值是启动宿主的命令（claude、pi），启动时它会问
}
export interface Host {                                    // 不再继承 McpConfig：宿主可以没有 MCP 配置
  mcp?: McpConfig;                                         // 用户级（全局）的配置；没有它表示这个宿主的 MCP 安装器不装（omp）
  manualMcp?: string;                                      // 没有 mcp 的宿主才有：用户在这个宿主里自己添加 MCP 的办法（omp 是 /mcp add），列表的说明里写它
  id: string;                                              // 目录里指代它的名字：claude-code、codex、pi、omp
  // …name、detected、skillsDir 见「安装 skill」
  projectMcp?: ProjectMcpConfig;                           // 有 mcp 而没有它表示这个宿主的 MCP 只能装到全局（Codex）
  remoteMcpLogin?: Command;                                // 见「宿主添加远程地址时会当场登录」
}
// host 在 scope 下的那一份：全局是它的 mcp，项目是它的 projectMcp（没有就是 undefined）。状态探测和流程都经它取，两边看的是同一份
export function mcpConfigOf(host: Host, scope: Scope): McpConfig | undefined;

// cli/src/mcp-status.ts
// no-config：这个宿主没有 MCP 配置，它的 MCP 安装器不装，哪个安装范围都一样
// global-only：这个宿主的 MCP 只能装到全局，而这一轮选的是项目
export type McpStatus = 'none' | 'configured' | 'unknown' | 'unsupported' | 'no-config' | 'global-only';
export type InstallableMcpStatus = Exclude<McpStatus, 'unsupported' | 'no-config' | 'global-only'>;
export function mcpStatuses(mcps: readonly Mcp[], hosts: readonly Host[], scope: Scope): McpStatus[][]; // [第几个 MCP][第几个宿主]

// cli/src/availability.ts —— 列表里 MCP 的状态栏（工单 06）：ListingStatus.mcpColumns 是所选的宿主里有 MCP 配置的那些，
// 每个 MCP 的 statuses 与它一一对应；没有 MCP 配置的宿主不出栏。列表拿 mcpColumns 去调 mcpStatuses，所以列表的状态里没有 no-config
// （算计划时仍拿所选的全部宿主去调，那里它是 no-config、不出项）

// cli/src/install-mcp.ts
export interface McpStep { action: 'remove' | 'add'; command: Command; tolerated: boolean }
// config 是 mcpConfigOf(host, scope)
export function mcpSteps(mcp: Mcp, config: McpConfig, status: InstallableMcpStatus, variables: readonly string[]): McpStep[];
// keys 是「变量名 → 值」：到执行的这一刻才代入命令；cwd 是 config.cwd，给了就在那个目录下运行
export async function installMcp(steps: readonly McpStep[], keys: ReadonlyMap<string, string>, runCommand: CommandRunner, cwd?: string): Promise<void>;
export interface McpInstallProblem {
  action: 'remove' | 'add';                                                   // 失败的是哪一步
  cause: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined }; // detail 是错误码，错误没带就没有
  removed: boolean;                                                           // 添加失败时，移除命令是否已经执行成功
}
export class McpInstallError extends Error { readonly problem: McpInstallProblem }

// cli/src/run-plan.ts —— 执行要的东西；终端界面的 Session（flow.ts）在它上面加目录、呈现层和提问器
interface Runtime {
  // …
  keys: Map<string, Map<string, string>>; // 这次运行里填过的 key：MCP 的名字 → 变量名 → 值。只在内存里
}

// cli/src/plan.ts —— 算计划只收变量名
interface Selection {
  // …
  filledKeys: ReadonlyMap<string, ReadonlySet<string>>; // MCP 的名字 → 填过的变量名；值不到这里来
}

// cli/src/installer.ts
export interface CommandResult { exitCode: number }
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>; // 命令没能起来时拒绝；把 MCP 装到全局不给 options，装到项目给 { cwd }——{ shell: true } 是安装工具用的，{ env } 是安装第三方 Skill 用的

// cli/src/run-command.ts
export function systemCommandRunner(): CommandRunner;
```

`installMcp` 失败时**只**抛 `McpInstallError`——执行器当场抛出（没返回承诺）的也算在内。`mcpSteps` 在算计划时（`planInstall`）算出来、交给汇总展示，之后 `runPlan` 执行的就是这同一份——“看到的就是执行的”靠的是不重算。带 key 的命令也一样：`steps` 里 key 的位置是一个 `KeyArgument`（只有变量名），展示时写成占位符，执行时由 `installMcp` 从 `keys` 里取值代入，**值不进 `steps`，也不进呈现层**。

### 3. Contracts

**目录里的 MCP 条目**（`catalog.json` 的 `mcps`）

```json
{
  "name": "context7",
  "description": { "zh": "…", "en": "…" },
  "url": "https://github.com/upstash/context7",
  "purpose": "web-search",
  "hosts": ["claude-code", "codex"],
  "server": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
}
```

远程地址的写成 `"server": { "url": "https://mcp.example.com/mcp" }`。

`purpose` 必须写，且是 `catalog.json` 的 `purposes` 里某一项的 `id`；另可写 `"recommended": true`。没写用途、或用途不在清单里的条目会被跳过，规则见 [入口与测试](./installer-entry.md) 的校验表。

需要 API key 的再加一个 `env`：

```json
"env": [
  { "name": "EXA_API_KEY", "required": true, "description": { "zh": "…", "en": "…" }, "url": "https://dashboard.exa.ai/api-keys" }
]
```

| 字段 | 规则 |
|------|------|
| `name`、`description`、`url` | 与外部项目同一套规则（见 [入口与测试](./installer-entry.md)）；`url` 是官方链接，目前不显示。名字只在 `mcps` 里唯一 |
| `hosts` | 可省略（全部支持）；写了就要是**非空**数组，每一项符合 `name` 的规则。**不认识的标识留着不管**：以后加了宿主，旧版安装器照样读得了这一条 |
| `server` | 对象，`command` 与 `url` **恰好有一样** |
| `server.command`、`server.args` 的每一项 | `^[A-Za-z0-9@:/._=+,~-]+$`；`args` 可省略（当作空） |
| `server.url` | 与外部项目的 `url` 同一条规则：只收 https，只含 RFC 3986 允许的字符 |
| `env` | 可省略（当作空）；写了就要是数组，里面的变量名不重复。**只适用于本地进程方式**：远程地址的条目带了非空的 `env` 整条不通过（写一个空数组不算带） |
| `env[i].name` | `^[A-Za-z_][A-Za-z0-9_]*$`：它会拼进宿主的命令（`名字=值`），也会原样打到终端上 |
| `env[i].required` | 布尔值，**必须写**，不猜缺省 |
| `env[i].description`、`env[i].url` | 说明同各类条目的 `description`；`url` 是申请地址，与外部项目的 `url` 同一条规则 |

`command` 和 `args` 收得这么紧，是因为它们有三个去处：原样打到终端上让用户确认、交给宿主的命令、被宿主记进配置之后每次启动都执行。规则保证里面没有空白、引号和任何 shell 会另作解释的字符，所以展示出来的那一行没有歧义，Windows 上经 `cmd.exe` 起 `.cmd` 时也不必转义引号。代价是带空格的参数、带查询串的网址参数、Windows 路径都写不进目录。这条规则是工单 08 的实现者定的，**维护者尚未确认**；要放宽先改这里和 `catalog.ts` 的 `COMMAND_WORD`，并重新核对 `notice-text.ts` 里展示命令时加引号的判断（`PLAIN_ARGUMENT`）。

**三个宿主的命令与配置文件**（安装器认识四个宿主，装得了 MCP 的是这三个；第四个 omp 没有 MCP 配置，见下面「宿主可以没有 MCP 配置」。Claude Code 和 Codex：2026-10-09 对照官方文档，并在本机用 claude 2.1.295、codex 0.162.0 在临时配置目录里实测。Pi：2026-10-12 对照本机 pi 1.1.0 随包的 `docs/cli.md`、`docs/mcp.md`、`docs/environment-variables.md`，并读了它解析 `mcp` 子命令的源码 `dist/extensions/mcp/cli.js`——**只读，没有执行过**，真机走查由维护者在虚拟机里做）

| | Claude Code | Codex | Pi |
|---|---|---|---|
| 添加本地进程 | `claude mcp add --scope user <名字> -- <命令> <参数…>` | `codex mcp add <名字> -- <命令> <参数…>` | `pi mcp add <名字> -- <命令> <参数…>` |
| 添加远程地址 | `claude mcp add --scope user --transport http <名字> <网址>` | `codex mcp add <名字> --url <网址>` | `pi mcp add <名字> --url <网址>` |
| 添加带环境变量的本地进程 | `claude mcp add --scope user <名字> -e <变量>=<值> -- <命令> <参数…>` | `codex mcp add <名字> --env <变量>=<值> -- <命令> <参数…>` | `pi mcp add <名字> --env <变量>=<值> -- <命令> <参数…>` |
| 移除 | `claude mcp remove --scope user <名字>` | `codex mcp remove <名字>` | `pi mcp remove <名字>` |
| 同名已存在时再添加 | **失败**，退出状态 1（`already exists in user config`） | 直接覆盖，退出状态 0 | 直接替换，退出状态 0 |
| 移除一个不存在的 | 失败，退出状态 1 | 成功，退出状态 0 | 失败，退出状态 1 |
| 用户级配置 | `<配置目录>/.claude.json` 顶层的 `mcpServers`（JSON 对象，键是名字）；配置目录缺省是主目录，`CLAUDE_CONFIG_DIR` 非空时用它 | `<CODEX_HOME>/config.toml` 的 `mcp_servers` 表；`CODEX_HOME` 缺省是 `<主目录>/.codex` | `<配置目录>/mcp.json` 顶层的 `mcpServers`（JSON 对象，键是名字）；配置目录缺省是 `<主目录>/.pi/agent`，`PI_CODING_AGENT_DIR` 非空时用它（开头的 `~` 照 Pi 的规矩展开，见下面「状态」） |

- 远程地址只有一种：可流式的 HTTP。SSE、请求头鉴权都不在范围内。
- **Pi 的选项都跟在名字后面、`--` 前面**：它的解析是名字之后遇到 `--`（或凑够两个位置参数）就把剩下的原样当作启动命令，所以 `--env`、项目范围的 `-l` 放在这之前才被它认。它的添加命令**只写配置、不连接服务器**（`docs/cli.md`：does not connect），不事先检查版本：没有 `pi mcp` 的旧版 Pi 下这条命令非零退出，照普通的失败报告。Pi 把只差 `-` 和 `_` 的名字当成同一个服务器，状态探测按名字原样比，不管这一条（目录里现有的 MCP 名字没有只差这两个字符的）。
- 环境变量一个变量一个 `-e` / `--env`，照目录里的顺序，**跟在名字后面、`--` 前面**。Claude Code 的 `-e` 能连收几个值，放在名字前面会把名字也收进去。Claude Code 和 Codex 都把值原样记进配置里这个 MCP 的 `env`（实测过带 `=`、`&`、`+`、`/` 的值），添加命令自己的输出里不回显值。Pi 也是从第一个 `=` 处切开、把后面的原样记进 `env`（读源码确认的），输出里同样不回显；但 **Pi 读配置时会展开值里的 `${名字}`，整个值以 `!` 开头时当作命令去执行**（它的 `docs/mcp.md`）——key 的值长成这样的话到了 Pi 那里就不是原样了。安装器不为此改写或拒绝值，这是已知的出入，要不要处理由维护者定。Codex 对 `--url` 加 `--env` 直接报错（`command is required`），这是“环境变量只适用于本地进程”在宿主那边的依据。
- **各系统上命令相同，原生 Windows 上也不给本地进程包 `cmd /c`**。Claude Code 的旧文档要求过（否则 `npx` 这类 `.cmd` 起不来，报 Connection closed）；它的更新日志 2.1.119 写明移除了那条“需要 cmd /c 包装”的警告（称其为误报），现行的 MCP 文档里也已经没有这条说明；Codex 的文档从未要求过。2.1.119 之前的 Claude Code 不在支持之列。这个结论来自文档和更新日志，**没有在 Windows 真机上实测**；`mcp.test.ts` 里有一条 `platform: 'win32'` 的测试守着“不包”这个决定。
- 上表是全局（用户级）的写法；装到项目的见下面「装到项目」。
- 三个环境变量（`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`PI_CODING_AGENT_DIR`）是照着“命令会写到哪，就去哪看”定的：宿主的命令继承同一份环境。**skill 目录不认 `CLAUDE_CONFIG_DIR`**（仍是 `<主目录>/.claude/skills`），同一份适配里两套口径，这是已知的不一致，要不要改由维护者定。它在第三方 Skill 上有后果：skills CLI 认这个变量，所以安装器调用它时把这个变量清空，让它也装到 `<主目录>/.claude/skills`（见 [安装 skill](./skill-install.md)）；哪天 skill 目录改成认它，那一处清空要一起拿掉。

**状态（`mcpStatuses`）**

看的是**所选安装范围下的那一份配置**：全局是宿主的用户级配置，项目是 `host.projectMcp` 指的那一份；另一份不读。每个宿主的配置**只读一次**、只读、不抛错、不执行任何命令：

| 情况 | 状态 | 列表里的写法 |
|------|------|--------------|
| 条目写了 `hosts` 且不含这个宿主的 `id` | `unsupported` | `不支持`（暗淡） |
| 这个宿主没有 MCP 配置（适配里没有 `mcp`；条目本身支持它） | `no-config` | **列表里没有它的那一栏**（工单 06；原先是一栏暗淡的「不支持」），见下面「宿主可以没有 MCP 配置」和「列表里的栏」 |
| 选了项目，而这个宿主没有 `projectMcp`（条目本身支持它） | `global-only` | `不支持`（暗淡），列表上方另有一行说明，见「装到项目」 |
| 配置文件不存在（宿主还没写过配置） | `none` | `未配置`（暗淡） |
| 读得出来，那张表里没有这个名字（包括整张表都没有） | `none` | `未配置` |
| 读得出来，有这个名字 | `configured` | `已配置`（绿） |
| 文件读不了（权限、那里是个目录）、解析不了、顶层或那张表不是对象 | `unknown` | `未知`（默认色） |

- **Pi 的配置目录照 Pi 自己的规矩从 `PI_CODING_AGENT_DIR` 读**（`hosts.ts` 的 `piAgentDir`；对照它的 `dist/config.js` 的 `getAgentDir` 和 `dist/utils/paths.js` 的 `normalizePath`，只读）：值单独是一个 `~` 就是主目录，以 `~/` 开头（Windows 上还有 `~\`）就是主目录下的那一段，别的原样用。不展开的话，写成 `~/x` 的值在安装器这边成了相对路径，读不到文件，状态全是「未配置」、汇总写「新装」而不是「覆盖」。Pi 另外还认 `file://` 开头的写法、在 Windows 上把 shell 风格的路径（`/c/Users/…`）转成盘符路径，这两样安装器**没有**照做——值写成那样时状态会看错地方。`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 原样用，没有动。
- Codex 的配置用 `smol-toml` 解析，所以 `[mcp_servers.x]`、行内表、带点的键哪种写法都认得；解析失败就是 `unknown`，不自己猜。
- 状态每次进列表都现探测，只探测这张列表里的 MCP；某个宿主那一栏出现 `unknown` 时，列表上方多一行「注意  读不到 <宿主> 的配置，无法判断哪些 MCP 已配置」。列表里没有 MCP 时没有这一行。
- **列表里的栏**（任务 `10-12-installer-add-pi-omp-hosts` 工单 06；维护者 2026-10-12 定的，见该任务规格「四个宿主时的版式」第 1 条）：MCP **每个宿主一栏、各看各的配置，不随 skill 目录归组**；**没有 MCP 配置的宿主（omp）不出栏**（`ListingStatus.mcpColumns`）。所以四个宿主都选了时是 Claude Code、Codex、Pi 三栏，选了 Claude Code 和 omp 时只有 Claude Code 一栏，只选 omp 时一栏都没有、每个 MCP 都不可选。Skill 和第三方 Skill 的栏另按 skill 目录归组（[安装 skill](./skill-install.md) 的「按 skill 目录归组」），两种栏不一样时终端界面把 MCP 的栏名写在 MCP 那一段的标题行上（[界面设计](./ui-design.md) 的「选择条目」），网页界面的卡片上各写各的段（[网页界面的设计](./web-ui-design.md) 的「条目的卡片」）。

**怎么装（`mcpSteps`）**

| 状态 | 命令 | 汇总里的操作 | 备注 |
|------|------|--------------|------|
| `none` | 添加 | 新装 | 空 |
| `configured` | 移除，再添加 | 覆盖（黄色粗体） | `已配置，先移除再添加` |
| `unknown` | 移除（`tolerated`：失败了也接着做），再添加 | 添加 | `状态未知，先尝试移除同名配置` |
| `unsupported`、`no-config`、`global-only` | 不装，汇总、命令、结果里都没有它 | — | — |

- 汇总（「将安装 N 项」里 MCP 的那张小表）之后是「将执行 N 条命令」：每条完整命令编号列出，确认了才执行。**任何外部命令都不许在这之前跑**，状态探测因此只读文件。
- 不另问“要不要覆盖”：MCP 没有“是不是本工具装的”这个概念，再装一次就是覆盖。
- 每个 MCP 在每个**支持它的**所选宿主下各是一项，各有一行结果，互不影响；一项失败不影响其余项，退出状态不变。
- 所选宿主一个都装不了的条目在列表里不可选（多选的不可选行，见 [终端输出](./terminal-output.md)），原因写在状态的位置、占满各个状态栏：各栏里有 `global-only` 的写「只能装到全局」（换成全局就装得了），其余的（全是 `unsupported`，或一栏都没有）写「需要别的 AI Agent」——只选了 omp 时没有 MCP 的栏，每个 MCP 都落在后一种。只有一部分装不了的仍可选。一个宿主都没检测到时每个 MCP 都不可选，原因是「需要 AI Agent」。

**装到项目**（任务 `10-10-catalog-purpose-categories` 工单 11；2026-10-11 用 claude 2.1.295、codex 0.162.0 在临时目录里实测并对照官方文档，记录在该任务的 `research/project-mcp-trial-record.md`）

| | Claude Code | Codex | Pi（任务 `10-12-installer-add-pi-omp-hosts` 工单 02；出处同上面那张表，没有执行过） |
|---|---|---|---|
| 能不能 | 能 | **不能**：没有 `projectMcp`，见下面的 Design Decision | 能 |
| 添加本地进程 | `claude mcp add --scope project <名字> -- <命令> <参数…>` | — | `pi mcp add <名字> -l -- <命令> <参数…>` |
| 添加远程地址 | `claude mcp add --scope project --transport http <名字> <网址>` | — | `pi mcp add <名字> -l --url <网址>` |
| 添加带环境变量的本地进程 | `claude mcp add --scope project <名字> -e <变量>=<值> -- <命令> <参数…>` | — | `pi mcp add <名字> -l --env <变量>=<值> -- <命令> <参数…>` |
| 移除 | `claude mcp remove --scope project <名字>` | — | `pi mcp remove <名字> -l` |
| 在哪运行 | **项目目录**（`{ cwd }`）：它把配置写进运行目录的 `.mcp.json`，在 git 仓库的子目录里也是写子目录，不找仓库根 | — | **项目目录**（`{ cwd }`）：带 `-l`（`--local`）时它写的是运行目录下的 `.pi/mcp.json` |
| 同名已存在时再添加 / 移除一个不存在的 | 都失败，退出状态 1——和用户级一样 | — | 添加是替换；移除失败，退出状态 1——和用户级一样 |
| 已配置的从哪看 | `<项目目录>/.mcp.json` 顶层的 `mcpServers`；不认 `CLAUDE_CONFIG_DIR` | — | `<项目目录>/.pi/mcp.json` 顶层的 `mcpServers`；不认 `PI_CODING_AGENT_DIR` |
| 写进去之后 | **要用户批准才启用**：在这个目录下启动 `claude` 时它会问（`claude mcp get` 显示 `Pending approval`） | — | **要用户信任这个项目才读**：在这个目录下启动 `pi` 时它会问（它的添加命令自己也说 `ignored until you start pi in the project and trust it`） |

- 与全局只差上表这几处：先移除再添加、状态未知时先尝试移除、每个宿主各一项、一项失败不影响其余项、key 怎么问怎么传、失败原因的写法，都一样。全局的行为一个字不变（全局的命令仍然不给 `options`）。
- 用户级配置这时**不读也不写**：它写坏了不出「读不到配置」那一行；装完之后用户级配置里没有这一条。反过来选全局时不读项目里的 `.mcp.json`。
- **Codex 那一栏每个 MCP 都是「不支持」**，不产生安装项，汇总、命令、结果里都没有它；远程地址的 MCP 也就没有登录的提醒。**那一栏里有 `global-only` 时**（列表里至少有一个条目本身支持这个宿主），列表上方有一行写明原因的「注意  Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令」（`ui.listNotices` 的 `globalOnly`；和「安装器装不了 omp 的 MCP」「读不到配置」那两行同一个画法、挨着排，它在最前；列表里有 skill 或第三方 Skill 时，共用 skill 目录的那一句排在这几行之前，见 [安装 skill](./skill-install.md) 的「共用 skill 目录的说明」）。列表里的 MCP 本来就都不支持它时（全是 `unsupported`）没有这一行：换成全局也装不进它。所选的宿主里只有它时 MCP 的行不可选，原因「只能装到全局」。
- 汇总下方多两行提醒，都在「开始安装吗」之前，排在「key 以占位符显示」之后、「必填的 key 没填」之前：
  - **这一轮有带着 key 的 MCP 要装到项目**（命令里有占位符的那些）：「注意  `<变量名…>` 会以明文写进 `.mcp.json`，不要提交，也不要发给别人」。写的是变量名和文件名（`projectMcp.file`），**没有值**。可选的 key 留空的不带变量，不算。装进了几个宿主就把几个文件都点到，照宿主的先后用并列的写法连起来（「…会以明文写进 .mcp.json、.pi/mcp.json，…」）。
  - **这一轮有 MCP 要装进带 `approval` 的宿主**：「注意  Claude Code 的 MCP 写进当前目录的 .mcp.json，要你批准之后才启用：在这个目录下启动 claude 时它会问」。MCP 的小表没有「位置」一栏，装到项目时写进了哪个文件就靠这一行交代——不带 key 的也有它。**每个这样的宿主各一句**，照宿主的先后：Pi 的是「注意  Pi 的 MCP 写进当前目录的 .pi/mcp.json，要你批准之后才启用：在这个目录下启动 pi 时它会问」——Pi 那边叫「信任这个项目」，文案和 Claude Code 用的是同一句（`mcpApprovalNotice`），没有另写。
  - Pi 的配置文件写成 `join('.pi', 'mcp.json')`：Windows 上显示成 `.pi\mcp.json`，和汇总里 skill 的位置一样跟着系统的分隔符走。
- 规格里「Codex 只对受信任的项目读这份配置」那一行随 Codex 不支持而没有做；哪天给 Codex 补上 `projectMcp`，这一行要一起补（那条事实已经实测过，在试通记录里）。

**宿主可以没有 MCP 配置**（任务 `10-12-installer-add-pi-omp-hosts` 工单 01 开的口子，工单 04 的 omp 在用）

宿主的适配里没有 `mcp`，就是这个宿主的 MCP 安装器不装。**现在是 omp**：它没有会话外的添加命令（`omp mcp` 不是子命令），只有会话里的 `/mcp add`；它的配置在 `~/.omp/agent/mcp.json`，安装器不改写宿主的配置文件（本文件 Wrong 例的第三条），所以不装。事实的出处是任务 `10-12-installer-add-pi-omp-hosts` 的 `research/pi-omp-host-facts.md`（只读地看了本机的 omp 18.8.7），决定是维护者 2026-10-12 定的。工单 01 时用这个口子的是 Pi，工单 02 给 Pi 补上了 `mcp` 和 `projectMcp`。

这样的宿主另带一句 `manualMcp`：用户在这个宿主里自己添加 MCP 的办法，是它里面的一条命令（omp 是 `/mcp add`），只给列表的那句说明用，安装器从不执行它。

| 哪里 | 怎么办 |
|------|--------|
| 状态（`mcpStatuses`） | 条目本身支持这个宿主时是 `no-config`，**全局和项目两个安装范围都一样**（不是 `global-only`：换成全局也装不进它）。条目的 `hosts` 里没有它时仍是 `unsupported`，先看这一条 |
| 列表里那一栏 | **没有这一栏**（工单 06）：它永远装不了，列表上方那句说明已经讲了原因和出路。两套界面都是——终端界面的状态栏、网页界面卡片底部的段里都没有它；只选了它时一栏都没有，MCP 的行不可选、原因写在状态的位置。工单 04 时是一栏暗淡的「不支持」，四个宿主时排不下、又只是把同一个词重复一列。内部仍和 `unsupported`、`global-only` 分得开：`global-only` 的说明是「只能装到全局」，没有 MCP 配置的是「安装器装不了…」，`unsupported` 没有 |
| 可不可选（`listingStatus`） | 所选的宿主都装不了它时不可选。原因照原来的规则：各栏里有 `global-only` 的是「只能装到全局」，否则是「需要别的 AI Agent」。只选了 omp 时一栏都没有，落在后一种（两个安装范围都是）；它和 Codex 一起选、安装范围是项目时落在前一种。行上只放得下一个短词，完整的出路在下一行说的那句说明里 |
| 列表的说明（`mcpColumnHosts` 的 `noConfig`、`mcpColumnNoticeTexts`、文案 `mcpNoConfigNotice`） | **所选的宿主里有没有 MCP 配置的，且这张列表里有 MCP 时**，MCP 那几栏的说明里多一句，每个这样的宿主各一句（各自的办法不同）：中文「安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加」，英文 `The installer cannot install omp MCP servers: use /mcp add in omp`。**宿主名和添加办法取自宿主适配（`host.name`、`host.manualMcp`），不写死在文案里**。它**不看条目支不支持这个宿主**（和 `global-only` 那一句不同：那一句要列表里至少有一个条目本身支持它）——哪个条目、哪个安装范围都装不进它，这句话都成立；只选了它、MCP 的行都不可选时也显示。没选它、或列表里没有 MCP 时不显示。适配里没带 `manualMcp` 的不说这一句（现在没有这样的宿主） |
| 那句说明排在哪 | **「只能装到全局」之后、「读不到配置」之前**。终端界面和另外几句打在同一处（混合列表上方的「注意」，`ui.listNotices`），几行挨着：共用 skill 目录、只能装到全局、安装器装不了 omp 的 MCP、读不到配置；中文、英文连行首的键都是一行放得下（中文 64 列，英文 77 列——`omp.test.ts` 守着英文的那一句不超出第 79 列，要改这句话先量）。网页界面在 MCP 那一区的 `notices` 里，同一个先后 |
| 算计划（`planInstall`） | 不为这样的宿主出 MCP 的项：汇总、将执行的命令、结果里都没有它；key 仍只问一次，用于别的宿主 |
| 汇总后面的提醒 | `notices` 里的明文 key、要批准、要登录都没有它 |
| 外部命令与配置文件 | **不执行这个宿主的任何命令，不读也不写它的配置文件**——它自己的配置写坏了也不提，不出「读不到配置」那一句 |

**在混合列表里（终端界面的提问在 `flow.ts` 的 `planEntries`；算成要装的各项在 `plan.ts` 的 `planInstall`，执行在 `run-plan.ts` 的 `runPlan`）**

MCP 没有自己的入口：它和本仓库的 skill、外部项目在同一张混合列表里勾选（任务 `10-10-catalog-purpose-categories` 工单 07 起），一起确认、一起装。上面每一条规矩原样带进来，合在一起之后多出来的只有这几条：

- 一轮的先后：混合列表 → 逐个 MCP 问 key（照它们在列表里的先后）→ 汇总与将执行的命令 → 「开始安装吗」→ skill 覆盖前的单独询问 → 执行。
- **执行时本仓库的 skill 在前，MCP 在后**，共用一个「正在安装」分区；skill 的查询或下载失败不影响 MCP。
- 汇总是按类型分的小表，MCP 一张；「将安装 N 项」的 N 把 skill 和 MCP 的条目合在一起数，必填的 key 没填的 MCP 不算。
- 确认的提问是「开始安装吗」（开始安装、返回修改、取消），不再是「执行这些命令吗」。
- 带推荐标记的 MCP 同时出现在「推荐」和它的用途下。

**带 key 的 MCP（终端界面怎么问在 `flow.ts` 的 `askKeys`；带哪些变量、缺哪个由 `plan.ts` 照填过的变量名定）**

勾选之后、汇总之前，对每个勾上的、带 `env` 的 MCP 逐个变量问（画面见 [终端输出](./terminal-output.md) 的「隐藏输入」）：

| 情况 | 结果 |
|------|------|
| 填了（去掉首尾空白后非空） | 记进 `Session.keys[MCP 的名字][变量名]`；它要装进的每个宿主的添加命令都带上这个变量 |
| 可选的留空 | 不带这个变量，照常安装；不记 |
| 必填的留空 | **这个 MCP 不装**：它后面的变量不再问；每个宿主各有一项 `steps` 为空、带 `missingVariable` 的任务，汇总和命令里没有它，命令之后一行「注意  <MCP> 缺少必填的 <变量>，这次不安装」，结果里每个宿主一行「跳过 未填写必填的 <变量>」，计入合计的跳过 |
| 这次运行里这个 MCP 的这个变量已经填过 | 不再问，留一行「✓ <变量> · 本次运行已填写，不再询问」 |
| 勾上的组件全都因此被跳过（这一轮没有 skill 要装，也没有别的 MCP 要装） | 没有要确认的东西：**不显示汇总、不问开始不开始**，直接进结果分区，然后是勾选的外部项目，再回主菜单 |

- key 按 MCP 问，不按宿主问：两个宿主都选了也只问一次。
- 值只有三个去处：`Session.keys`（内存）、`installMcp` 拼出来的参数、宿主自己的配置。**算计划的拿不到值**：流程交给 `planInstall` 的只有每个 MCP 填过的变量名（`filledKeys`），计划和进度的报告里都没有值；值到执行时才由 `runPlan` 从 `keys` 里取出来交给 `installMcp`。**安装器不把它写进任何文件，不打到终端上**——呈现层的函数只收变量名和结局（`'entered' | 'blank' | 'reused'`），从不收值。
- **网页界面里填的 key 守同一条**（工单 10）：值经一个 `key` 意图的请求正文进来，记进同一个 `Runtime.keys`，此外哪里都不去——不进交给浏览器的网址，不进任何答复（照办的是没有正文的 204，不照办的 400 正文也是空的），不进画面状态（那里只有「填了没有」，没有值、没有长度），不打到终端上，不写任何文件，也不让浏览器记住（输入框的写法见 [网页界面的契约](./web-ui-contract.md)）。网页界面的汇总不列命令，所以也没有占位符和「key 以占位符显示」那一条；别的提醒照旧。**上表里和网页界面不一样的三处**：填 key 的对话框把这一批要 key 的 MCP 的变量全列出来（照勾选的先后），必填的留空不影响后面的变量；填过的可以「换一个」；勾上的组件全都因缺 key 被跳过时照样到汇总（「将安装 0 项」加那条提醒），确认之后才是结果。见 [网页界面的契约](./web-ui-contract.md) 的「MCP 与填 key」。
- key 作为命令行参数传给宿主，命令运行的那一瞬间本机别的进程看得到（`ps`）。这是规格定的做法（「key 只作为参数传给宿主的添加命令」），不是疏漏。

**外部命令执行器（`systemCommandRunner`）**

| 项 | 约定 |
|----|------|
| 怎么起 | `cross-spawn`，不经过 shell；Windows 上宿主的命令常是 npm 装出来的 `.cmd`，Node 不许直接起，`cross-spawn` 替我们经 `cmd.exe` 起并把参数转义好 |
| 输入输出 | `stdio: 'ignore'`：命令的输出**不上屏**（进行中的那一行在转，混进别的字会乱），它也不从终端读输入 |
| 环境 | 继承进程自己的环境。第三个参数给了 `{ env }` 时，那几个变量盖在继承来的环境之上（`{ ...process.env, ...env }`），别的不动；值是空字符串就是把那个变量清空。只有安装第三方 Skill 用它：关掉 skills CLI 的遥测、清空 `CLAUDE_CONFIG_DIR`，见 [安装 skill](./skill-install.md) |
| 运行目录 | 不指定时是进程自己的当前目录。第三个参数给了 `cwd` 时在那个目录下运行（`spawn` 的 `cwd`），`env` 可以不给。装到项目时用它：skills CLI 不带全局选项时装进它的当前目录，见 [安装 skill](./skill-install.md)；Claude Code 带 `--scope project` 时把配置写进它的当前目录的 `.mcp.json`，Pi 带 `-l` 时写进它的当前目录下的 `.pi/mcp.json`。装到全局的 MCP 命令不指定 |
| 结果 | 结束了就兑现 `{ exitCode }`（被信号结束算 1）；起不来（命令不存在）就拒绝，错误带 `code` |

> **Warning**：`systemCommandRunner` 不进自动化测试（测试里的执行器只记录）。改了它就用一个假的宿主命令手动核对：参数原样逐个传到（含带 `&`、`'`、`$` 的网址）、非零退出、命令不存在、它的输出没有漏到终端上。Windows 经 `cmd.exe` 的那一支至今没有在真机上跑过。带 `env` 的那一支 2026-10-10 用真实的 `npx skills` 在临时主目录里核对过一次（macOS）：遥测的两个变量和清空的 `CLAUDE_CONFIG_DIR` 都传到了，输出没有漏到终端上，记录在任务 `10-10-catalog-purpose-categories` 的 `research/third-party-trial-record.md`。 带 `cwd` 的那一支 2026-10-11 同样用真实的 `npx skills` 核对过一次（macOS）：从另一个目录起脚本，skill 落在 `cwd` 指的目录里，起脚本的目录没有多出东西，记录在同一个任务的 `research/project-scope-trial-record.md`。
>
> 它起子进程时继承的是**进程自己的环境**，不是传给 `runInstaller` 的 `env`（正式运行时两者是同一份）。用真实的 `claude`、`codex`、`pi` 做端到端核对时，`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 和 `PI_CODING_AGENT_DIR` 要在起脚本的 shell 里 `export` 到临时目录，脚本开头先断言它们确实指向临时目录再动手；只放进 `env` 的话，状态探测看的是临时目录，命令却写进了真实的配置（工单 09 时出过一次，当场用宿主的移除命令撤回了）。装到项目的那几条（Claude Code 的 `--scope project`、Pi 的 `-l`）写的是命令的运行目录，核对时项目目录同样要是临时目录。Pi 的这一套至今没有在真机上跑过，由维护者在虚拟机里做（见任务 `10-12-installer-add-pi-omp-hosts` 的 `prd.md`）。
>
> key 的值不做任何校验就成了一个参数（只去掉首尾空白）。它是用户自己输入的，不是远程数据；但 `cross-spawn` 对全局装的 `.cmd` 只转义一次，值里有双引号时在 Windows 上可能传错。要不要拒绝或剥掉引号，维护者还没有定。

**宿主添加远程地址时会当场登录**

Codex 的 `mcp add --url` 写完配置之后，如果那个服务器支持 OAuth，会**当场打开浏览器登录并等到登录完成才结束**，授权网址打在它自己的标准输出上（读它的源码 `codex-rs/cli/src/mcp_cmd.rs` 确认的）。安装器不显示宿主命令的输出，所以事先说：适配里有 `remoteMcpLogin`（值是事后补登录的命令，Codex 是 `codex mcp login`）的宿主，只要这一轮有远程地址的 MCP 要装进它，「将执行的命令」下面就多一行「注意」，写明可能当场打开浏览器、浏览器打不开时按 Ctrl+C、之后执行 `<补登录的命令> <名称>`。Claude Code 的添加命令不登录，没有这个字段。**Pi 也没有**：`pi mcp add` 只写配置、不连接服务器（它的 `docs/cli.md` 写明 `does not connect`，源码里添加之后只打一句「需要登录的话执行 `pi mcp login <名字>`」），远程地址的 MCP 装进 Pi 时不会当场开浏览器，所以不提醒；要 OAuth 的服务器由用户之后在 Pi 里登录，安装器不替它登录。

这是维护者在三个方案里选的（2026-10-09）；另两个是把宿主命令的输出透传到屏幕上、留作已知问题另开工单。远程终端里仍然看不到授权网址，这一项会一直显示进行中，直到用户按 Ctrl+C（配置这时已经写入）。

### 4. Validation & Error Matrix

目录里写坏的 MCP 条目只跳过那一条，带着原因进 `Catalog.skipped`（规则见上表，`FieldRule` 见 [目录校验与 CI](./catalog-validation.md)）。一条只报头一处问题，按 `name`、`description`、`url`、`hosts`、`server`、`server.command` / `server.url`、`server.args`、`env`（逐项按 `name`、`required`、`description`、`url`，再查重名）、“远程地址不许带 `env`”的顺序查；MCP 自己的字段都查完之后，最后是四类条目共有的 `purpose`、`recommended`。

单项安装失败（`installMcp` 抛 `McpInstallError`）：只这一项失败，结果里这一行写「失败」加原因，退出状态不变。

| 情况 | `McpInstallProblem` | 原因的写法 |
|------|---------------------|------------|
| 状态是已配置，移除命令非零退出 | `action: 'remove'`，`cause: exit` | `移除命令退出状态 3；未执行添加`——**不再添加** |
| 添加命令非零退出，之前没有移除成功过 | `action: 'add'`，`removed: false` | `添加命令退出状态 1` |
| 添加命令非零退出，移除已经成功 | `action: 'add'`，`removed: true` | `添加命令退出状态 1；此前已执行移除`——旧配置这时已经没了，必须说 |
| 命令没能起来 | `cause: not-started`，`detail` 是错误码 | `添加命令没能运行（ENOENT）` |
| 命令没能起来，错误没带错误码；或执行器当场抛出 | `cause: not-started`，`detail: undefined` | `添加命令没能运行`——**不取错误的消息**：消息里可能带着整条命令，而命令里有 key |
| 状态未知时的移除失败（非零退出或没能起来） | 不算失败 | 接着添加，这一步的结果不出现在任何地方 |

原因里**不带宿主命令自己的话**，也不写“配置未改动”：前者见下面的 Design Decision，后者是因为宿主的命令原不原子我们保证不了。

### 5. Good/Base/Bad Cases

- Good：只检测到 Claude Code，勾了一个本地进程的和一个远程地址的，都未配置 → 汇总两行「新装」、两条命令，记录到的正好是这两条添加命令，结果两行「已配置」，回到主菜单。
- Good：两个宿主都选了，`context7` 在 Claude Code 里已配置 → 汇总里 Claude Code 那行「覆盖」、Codex 那行「新装」，三条命令：先 `claude mcp remove`，再两条添加。
- Base：Codex 的 `config.toml` 写坏了 → 列表上方一行「注意」，Codex 那一栏都是「未知」，没有出错分区；装的时候每一项先 `codex mcp remove` 再 `codex mcp add`，移除不管成不成都接着添加。
- Base：条目的 `hosts` 是 `["codex"]`，只检测到 Claude Code → 那一行不可选，状态的位置写「需要别的 AI Agent」；两个宿主都选了时它可选，Claude Code 那一栏写「不支持」，只装进 Codex。
- Bad：`server.args` 里有一项是 `pkg; rm -rf ~` → 这一条被跳过，计入主菜单上方提示的数量，目录校验命令指出 `server.args`。
- Bad：`claude mcp add` 以 1 退出 → 这一行「失败 添加命令退出状态 1」，别的项照常，安装器不退出。
- Good（带 key）：两个宿主都选了，勾了一个有必填 key 的 → 问一次，汇总里两条命令各有一个 `<变量名>` 占位符和一行「注意  key 以占位符显示…」，记录到的两条命令带着输入的值。
- Base（带 key）：勾了两个，其中一个的必填 key 留空 → 那一个不在汇总和命令里，命令下面一行「注意」，结果里它「跳过 未填写必填的 …」，另一个照常。
- Bad（带 key）：远程地址的条目写了 `env` → 这一条被跳过，目录校验命令指出 `env`「只能用于本地进程方式」。
- Good（装到项目）：只检测到 Claude Code，选了项目，勾了一个带必填 key 的 → 一条 `claude mcp add --scope project …`，在项目目录下运行；汇总下方有明文写入和要批准的两行提醒；主目录下的用户级配置没有变化。
- Base（装到项目）：两个宿主都选了 → Codex 那一栏都是「不支持」，列表上方一行「注意」；勾上的 MCP 只装进 Claude Code，汇总、命令、结果里没有 Codex。
- Base（装到项目）：只检测到 Codex → MCP 的行都不可选，原因「只能装到全局」；同一张列表里的 skill 照常装到项目。
- Good（Pi，装到全局）：只检测到 Pi，勾了一个本地进程的和一个远程地址的 → 两条 `pi mcp add …`，不指定运行目录，没有登录的提醒，结果两行「已配置」。设了 `PI_CODING_AGENT_DIR` 时状态看的是那个目录里的 `mcp.json`。
- Good（Pi，装到项目）：只检测到 Pi，选了项目，勾了一个带必填 key 的 → 一条 `pi mcp add <名字> -l --env <变量>=<值> -- …`，在项目目录下运行；汇总下方有明文写进 `.pi/mcp.json` 和要批准（启动命令 `pi`）的两行提醒；主目录下什么都不多。
- Base（三个宿主）：都选了、装到全局 → 列表里 MCP 是 Claude Code、Codex、Pi 三栏（同一张列表里有 Skill 时表头写的是 Skill 的「Claude Code」「Codex、Pi」两栏，MCP 的三个栏名在它那一段的标题行上）；一个 MCP 各装一次，三条命令、三行结果；key 只问一次。装到项目 → Codex 那一栏「不支持」并说明原因，装进 Claude Code 和 Pi，明文的提醒点到两个文件，两个宿主各一句要批准。
- Base（Pi 的配置写坏了）：列表上方一行「注意  读不到 Pi 的配置…」，Pi 那一栏都是「未知」；装的时候先 `pi mcp remove`（失败了也接着做）再 `pi mcp add`。
- Base（四个宿主都选了）：列表里 MCP 是 Claude Code、Codex、Pi 三栏，没有 omp 的那一栏，列表上方一行「注意  安装器装不了 omp 的 MCP：请在 omp 里用 /mcp add 添加」；勾上的 MCP 装进 Claude Code、Codex、Pi，三条命令、三行结果，汇总、命令、结果里都没有 omp。装到项目时列表上方依次是共用 skill 目录、Codex 只能装到全局、omp 这三句（Claude Code 的项目配置写坏了时再加一句读不到配置）。
- Base（只检测到 omp）：MCP 一栏都没有，行都不可选，原因「需要别的 AI Agent」写在状态的位置，全局、项目都是；那句说明照样在；同一张列表里的 skill 照常装。
- Base（选了 Claude Code 和 omp）：MCP 只有 Claude Code 一栏；勾上的只装进 Claude Code。
- Base（选了 Codex 和 omp、装到项目）：MCP 的行不可选，原因「只能装到全局」；换成全局就可选，只装进 Codex。
- Bad（旧版 Pi 没有 `pi mcp`，或 `pi` 起不来）：这一行「失败 添加命令退出状态 1」/「失败 添加命令没能运行（ENOENT）」，别的宿主、别的项照常，安装器不退出。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/mcp.test.ts`；和 skill、外部项目一起勾的在 `cli/test/mixed.test.ts`；真实的多选画面在 `prompts.test.ts`，条目校验的说法在 `validate-catalog.test.ts`。MCP 没有自己的入口，用例都从用途进去：样例的两个 MCP 本来分在两个用途下，这几个文件用 `fixtures.ts` 的 `underWebSearch(...mcps)` 把它们归到同一个用途，`choose('联网搜索与文档检索')` 进去就是一张只有 MCP 一段的列表。

- 记录到的命令：两种连接方式 × 两个宿主各一条，**期望值写成字面的命令**（它们的来源是宿主的官方文档，不是代码）；外加 `platform: 'win32'` 时相同、主目录里什么都不多。
- 汇总：每一项的操作与备注、命令逐条的编号与全文；选「取消」时 `result.commands` 是空的而命令已经在输出里（证明先展示后执行）；返回修改后之前勾的还在。
- 已配置：`home` 里事先放好 `.claude.json` 或 `.codex/config.toml`，断言记录到的是先移除再添加；移除失败时只有移除那一条、原因的文字；添加失败时原因里的「此前已执行移除」。
- 状态未知：配置写坏，断言汇总那一行、两条命令；移除以非零退出时照常添加、结果是成功。
- 三种状态各一条，加上：配置里没有那张表、每一种读不了各一条（断言「注意」、没有出错、`stderr` 为空、退出状态 0）、两个环境变量各一条、Codex 的另一种 TOML 写法。
- 装完再进列表看到新状态：假的执行器不写配置，让 `commandResult` 顺手把配置写进 `CLAUDE_CONFIG_DIR` 指的临时目录。
- 部分支持：两个宿主时那一栏的「不支持」、只装进支持的那些；一个都不支持时那一行的文字；`hosts` 里有不认识的标识时照常可用。
- 一项失败不影响其余项、命令没能起来：断言原因、合计、没有堆栈、`stderr` 为空、退出状态 0。
- 登录提醒：远程地址 + Codex 时有，且在命令之后、提问之前；本地进程 + Codex、远程地址 + 只有 Claude Code 时没有。
- `prompts.test.ts`：不可选的行的勾选位与原因、在它上面按空格勾不上、`a` 全选不会勾上它、`NO_COLOR` 下不带样式码且没有零宽空格、没有 Unicode 时的 `[-]`。

- 带 key 的在 `cli/test/mcp-keys.test.ts`：说明与申请链接出现在提问之前；两个宿主的命令（**字面值**，带着输入的值）；两个宿主只问一次；可选留空不带、必填留空跳过（结果里的原因、其余照常、后面的变量不再问、全被跳过时不问开始不开始）；汇总里的占位符和两行「注意」的先后；`返回修改` 和再装一次都不再问、留空的重新问、两个 MCP 同名变量各问各的；写坏的 `env` 每种一条。
- **key 的值不出现**（网页界面的那一组在 `cli/test/web-mcp.test.ts`，见 [网页界面的契约](./web-ui-contract.md)）：`result.raw + result.stdout + result.stderr` 里找不到输入的值——成功、命令非零退出、命令起不来而错误消息里带着整条命令（值还被转义过）、执行器当场抛出，各一条；外加主目录和 `result.tmp` 里什么都没多。`prompts.test.ts` 里用真实的交互库再证一遍输入不回显。

- `mixed.test.ts`：三种类型同表（段的先后、两种类型的状态落在各自宿主那一栏、原因比状态栏宽时各行的说明仍从同一列起、读不到配置的提示只在列表里有 MCP 时出现）；一次勾 skill、MCP、外部项目（汇总的小表、命令只有 MCP 的、skill 的各行排在 MCP 之前、取消什么都不做、返回修改勾选都在、三种失败互不影响、向 GitHub 查询失败时 MCP 照常装）；汇总里的提醒（先后、几行挨着、没填 key 的不算进 N、只剩 skill 时没有命令分区、全被跳过时直接是结果再是外部项目）。

- Pi 的 MCP 在 `cli/test/pi-mcp.test.ts`，网页界面那一边在 `cli/test/web-pi-mcp.test.ts`：全局和项目的添加（两种连接方式、带 key）与移除命令是**字面值**（项目的带 `-l`、`cwd` 是 `result.project`）；汇总里展示的就是那几条、key 的位置是占位符；状态按范围读（用户级、`PI_CODING_AGENT_DIR`——含以 `~/` 开头和单独一个 `~` 的值、项目里的 `.pi/mcp.json`、每一种读不了、另一个范围的那一份写坏了不提）；已配置的先移除再添加、状态未知的先尝试移除；装完再进列表看到新状态；非零退出与没能起来（别的宿主照常）；三个宿主时三栏状态、三条命令、三行结果、key 只问一次、值不出现在终端和任何文件里、必填的没填每个宿主一行跳过；装到项目的两句提醒（文件名、启动命令、先后、选全局时没有）、三个宿主时两个文件与两句要批准；没有登录的提醒（和 Codex 一起选时只说 Codex）；中英文与 79 列。
- 没有 MCP 配置的宿主（omp）在 `cli/test/omp.test.ts`，网页界面那一边在 `cli/test/web-omp.test.ts`（工单 01 为 Pi 写的那两组随 Pi 接上 MCP 删掉了，这是工单 04 照上面那张表重写的）：
  - 栏：四个宿主都选了时没有 omp 的那一栏、别的三栏各是各的状态，行照常可选；选了 Claude Code 和 omp（装到全局、项目、英文）时只有 Claude Code 一栏；四个宿主里只留 omp 时表头是「状态」。**工单 04 时这几条断言的是 omp 一栏「不支持」，工单 06 换掉了**。
  - 只装进别的宿主：记录到的命令是**字面值**，只有别的宿主的那几条；汇总、将执行的命令、结果里搜不到 `omp` 这个词；带 key 的只问一次；装到项目时要批准的提醒只有别的宿主的那一句。
  - 那句说明：选了 omp 且列表里有 MCP 时在（整行去比，上下各空一行）；没检测到它、在宿主选择上去掉它、列表里没有 MCP 时没有；只选了它时有；列表里的 MCP 本来就都不支持它时照样有；四句同时出现时依次是共用 skill 目录、只能装到全局、它、读不到配置（**切出那几行整段去比**）；英文的那一句只占一行、不超出第 79 列。网页界面断言的是 MCP 那一区的 `notices`（去掉 omp 就没有、勾回来又有）。
  - 不可选：只检测到 omp 时全局、项目各一条，原因都是「需要别的 AI Agent」；四个宿主里只留 omp；选了 omp 和 Codex、装到项目是「只能装到全局」，装到全局可选、只装进 Codex；网页界面勾它是 400。
  - **不碰 omp**：`~/.omp/agent/mcp.json` 写坏了不出「读不到」、装完原样留着；每一条走到安装的用例都断言记录到的命令里没有命令名是 `omp` 的、主目录和项目目录下没有出现 `.omp`（`expectOmpUntouched`；主目录里事先放了 `.omp` 的那一条断言的是记录到的命令逐条相等、文件原样留着；只逛列表的用例不过它）。
  - 英文：没有 omp 的那一栏、`needs another AI Agent`、那句说明。
- 列表里 MCP 的栏（工单 06）在 `cli/test/status-columns.test.ts` 的「MCP 每个宿主一栏，omp 不出栏」，网页界面那一边在 `cli/test/web-status-columns.test.ts`：四个宿主、列表里有 Skill 和 MCP 时表头是 Skill 的两栏、MCP 的三个栏名在它那一段的标题行上（拿栏名在标题行里的位置去对下面状态的位置，`startOf`），这一段没有说明；列表里只有 MCP 时表头直接是三栏、标题行上不另写、说明照旧；选了 Claude Code 和 omp、选了 Codex 和 Pi、选了 Claude Code 和 Codex（两者的栏相同，不另写）各一条；只选 omp（只有 MCP 的列表表头是「状态」；有 Skill 的列表里原因写在 Skill 那一栏的位置、各行的说明从同一列起）；MCP 那一段自己排时三栏都装不了的行；装到项目（Codex 一栏「不支持」、那几句说明的先后不变）；读不到 Pi 的配置；英文；真实的画面里标题行和状态对齐、光标跳过标题行。网页界面断言卡片的 `statuses`：四个宿主三段、Claude Code 加 omp 一段、只选 omp 时是空的。
- 装到项目的在 `cli/test/scope.test.ts` 的「把 MCP 装到项目」几组（列表上方两行「注意」上下的空行在 `spacing.test.ts`）：Claude Code 的添加（两种连接方式、带 key）与移除命令是**字面值**且 `cwd` 是 `result.project`；汇总里展示的就是那几条；状态按范围读（项目里配过而全局没有、反过来、`.mcp.json` 写坏、用户级配置写坏不提）；装完再进列表看到新状态（`commandResult` 照真的来：往 `cwd` 的 `.mcp.json` 里写）；明文写入的提醒在「开始安装吗」之前、有变量名和文件名而没有值，可选的 key 留空时没有，选全局时没有；要批准的提醒；Codex 那一栏的「不支持」、列表上方的说明（列表里的 MCP 本来就都不支持它时没有）、只装进 Claude Code、没有登录的提醒；只有 Codex 时不可选与原因；`hosts` 只含一个宿主的条目在两种原因之间怎么选；英文界面与 79 列；真实的画面里在不可选的行上按空格勾不上。

测试架子：`commandResult: (command, args) => …` 预设外部命令的结果——返回 `{ exitCode }` 盖过缺省的 0，返回一个 `Error` 表示命令没能起来，**它自己抛出**表示执行器当场抛出、连承诺都没返回，什么都不返回就是成功；命令照样进 `result.commands`（里面是代入了值的字符串参数）。`secret(值)`、`blank()` 回答隐藏输入。

折行会打断整句的断言：命令和英文句子先 `text.replace(/\s+/g, ' ')` 再比，中文句子把空白全去掉再比（中文可以在任意两字之间折）。

### 7. Wrong vs Correct

#### Wrong

```ts
// 为了知道配没配过去跑宿主的命令：汇总确认之前不许有外部命令在跑，而且每次进列表都要等它
const listed = await runCommand('claude', ['mcp', 'list']);
```

```ts
// 展示一份、执行时再拼一份：两处迟早对不上，用户确认的就不是实际执行的
ui.commandList(jobs.map((job) => host.addMcp(job.mcp)));
await runCommand('claude', ['mcp', 'add', ...]);
```

```ts
// 直接改宿主的配置文件：格式是它的私事，还会和它自己的写入撞车
writeFileSync(join(homeDir, '.claude.json'), JSON.stringify({ ...config, mcpServers }));
```

```ts
// 把命令拼成一个字符串交给 shell：网址里的 & 就成了命令分隔
exec(`codex mcp add ${name} --url ${url}`);
```

```ts
// 测试里的期望值照着代码的拼法再拼一遍：永远和代码一致，查不出拼错
expect(result.commands).toEqual([{ command: 'claude', args: ['mcp', 'add', '--scope', 'user', name, '--', ...server.args] }]);
```

```ts
// 把 key 的值放进要展示的东西里，指望展示的时候记得遮：呈现层从此拿得到值，哪天多打一个字段就漏了
steps: mcpSteps(mcp, host, status, new Map([['EXA_API_KEY', value]]));
ui.commandList(steps.map((step) => mask(step.command)));
```

```ts
// 失败的原因取错误的消息：没有错误码时整句进了括号，里面可能是带着 key 的整条命令；
// 按原值去替换也不保险，值在消息里可能被转义或截断过
detail: technicalReason(error).replaceAll(value, '<EXA_API_KEY>'),
```

#### Correct

```ts
// 只读地看一眼配置文件；读不了就是 undefined，由状态探测说成「未知」
configuredMcps: () => namesIn(join(env['CODEX_HOME'] || join(homeDir, '.codex'), 'config.toml'), parseToml, 'mcp_servers'),
```

```ts
// 先算出要执行的每一步，展示的和执行的是同一份
const config = mcpConfigOf(host, scope); // 状态探测看的也是这一份
const steps = mcpSteps(mcp, config, status, variables);
ui.commandList(jobs.flatMap((job) => job.steps.map((step) => step.command)));
await installMcp(steps, keys, session.runCommand, config.cwd);
```

```ts
// 期望值是字面的命令，出处是宿主的文档
const CODEX_ADD_REMOTE = { command: 'codex', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
```

```ts
// 命令里只留变量名；值到执行的这一刻才由安装动作代入，呈现层只画占位符
addMcp: ({ name, server }, variables) => ({ command: 'codex', args: ['mcp', 'add', name, ...variables.flatMap((variable) => ['--env', { variable }]), '--', …] }),
await installMcp(steps, session.keys.get(mcp.name) ?? new Map(), session.runCommand);
```

```ts
// 没能起来的原因只取错误码，没有就不写括号
detail: errorCode(error), // string | undefined
```

---

## Design Decision: 状态未知时先尝试移除再添加

**Context**：规格把“宿主的状态是未知时怎么装”留给了工单 08。两条路：直接添加，或先尝试移除再添加。

**Decision**：先尝试移除，这一步失败了也接着添加。两个宿主对重名的态度不同——Claude Code 的添加命令遇到同名会失败，Codex 的会直接覆盖——直接添加的话，同一个操作在两个宿主上结局不一样，而且 Claude Code 那边会以一句用户看不到的“已存在”失败。先移除让结局不依赖我们读不读得出配置：都是目录里的这一份，和状态已知时再装一次的结局相同。

**代价**：那里本来没有时，多跑一条注定失败的命令（约半秒）；汇总里因此如实写两条命令，操作一栏说不出是新装还是覆盖，写「添加」。

**没有经维护者确认**，记在任务的 `prd.md` 修订记录里。

---

## Design Decision: 失败原因里不转述宿主命令的话

**Context**：宿主的命令失败时会在标准错误上说原因（`MCP server x already exists in user config`）。把最后一行接在「退出状态 1」后面，用户不用自己重跑就知道为什么。

**Decision**：不转述，执行器干脆不收命令的输出。三个理由：英文句子原样进了中文界面，违反 [终端输出](./terminal-output.md) 的“括号里的技术原因只放错误码”；那一行的长度不由我们定，一个放不下的长词会被终端折开，结果分区改写标题时就数错了行；工单 09 之后命令的参数里有 key，宿主把它回显出来就成了泄漏的通道。

工单 09 把同一条规矩收紧到“命令没能起来”上：原先错误没带错误码时退而取它的消息（`technicalReason`），现在只取错误码，没有就只说「没能运行」。Node 起不了子进程时的消息会带上整条命令（如参数里有空字符时的 `ERR_INVALID_ARG_VALUE`）。

**代价**：用户只看到哪一步、退出状态几。终端界面里完整的命令在汇总里，可以照着自己再跑一遍看原因；网页界面的汇总不列命令，没有这条出路。要改回去，先在终端输出的规范里立例外，并解决上面后两条。

---

## Design Decision: 「只问一次」按 MCP 加变量名记

**Context**：规格写的是「同一次运行里同一个变量只问一次，用于所有选中的宿主」。记住填过的值有两种记法：只按变量名，或按「MCP + 变量名」。

**Decision**：按「MCP + 变量名」记。两个 MCP 可以用同一个变量名而要的是不同的东西（`API_KEY` 这类泛名字）：只按变量名记，第二个 MCP 会不声不响地拿到第一个服务的 key，等于把凭据交给了别家的进程。问两遍只是多粘贴一次。规格那句话的后半句「用于所有选中的宿主」和用户故事 27 说的都是同一个 MCP 的两个宿主，这一点照做了。

留空的不算填过：必填的留空之后回头再选它，要是不重新问，这次运行里就再也装不上它；可选的同理。代价是可选项每次返回修改都会再问一遍（按一下回车）。

终端界面里记住的值在这次运行结束前改不了：粘贴错了要退出重来。网页界面里填 key 的对话框有「换一个」，再填一次就是新的值。

**没有经维护者确认**，记在任务的 `prd.md` 修订记录里。

---

## Design Decision: 和别的类型合在一起之后的三处取舍

**Context**：工单 07 把 MCP 搬进混合列表。规格定了先后（skill 在前、MCP 在后）和「原有的规矩原样带进来」，有三处它没有说。

**Decision**：

1. **「将安装 N 项」不数必填的 key 没填的 MCP。** 它不在小表里，标题数的是小表里的条目；原先「将安装 N 个 MCP」也是这样数的。它另有一行「注意」，结果里有它的「跳过」。界面设计里那句「N 是勾选的组件条目的个数」没有说到这种情况。
2. **向 GitHub 查询失败时 MCP 照常装。** 查询失败只关本仓库的 skill：出错说明之后 skill 一个都不装、结果里没有它们的行，MCP 仍在「正在安装」分区里逐项执行。依据是「一项失败不影响其余项」；另一条路是整轮作罢，那样用户填过的 key、确认过的命令都白费了。
3. **MCP 一段按「带推荐的在前、其余按名字」排**，不照目录文件——规格对组件各段的要求。连带着问 key 的先后、命令的编号、结果的行序都变了（原先照目录文件）。

**没有经维护者确认**，同时记在界面设计的「实现时定下、维护者还没有看过的画法」里。

---

## Design Decision: Codex 的 MCP 不能装到项目

**Context**：规格要两个宿主的 MCP 都能装到项目，并把 Codex 的写法留给工单 11 的第一步去验证：它的添加命令没有范围选项，官方只说项目目录里可以放一份 `.codex/config.toml`、只对受信任的项目生效。规格同时定了退路：验证不通过就显示不支持，不拿没验证过的写法去改用户的文件。

**Decision**：验证不通过，走退路——Codex 没有 `projectMcp`，项目范围下它那一栏是「不支持」。实测（2026-10-11，codex 0.162.0）：`codex mcp add` / `remove` 只管用户级配置，移除不了项目里的条目。唯一能让它自己的命令写进项目的绕法是执行时把 `CODEX_HOME` 指到 `<项目>/.codex`，试下来有四处不可靠：目录不存在时命令失败，要安装器先替用户建目录；每跑一次在那里留下一个 `tmp/arg0/` 空目录；重写文件时丢掉已有表头行尾的注释；汇总里展示的命令用户照着跑写进的是全局配置。还有一处没有试但躲不开：换了主目录之后添加远程地址时的 OAuth 凭据可能记到项目目录里。

**安装器自己往 `<项目>/.codex/config.toml` 里写一张表这条路没有试**：它不是技术上走不通（手写的那份 Codex 在受信任的项目里读得到，实测过），而是两条既有的决定排除了它——本文件 Wrong 例「直接改宿主的配置文件：格式是它的私事，还会和它自己的写入撞车」，和规格 Further Notes 第 11 条「验证不通过时显示为不支持，而不是硬写它的配置文件」。所以「验证不通过」的确切意思是：**用宿主自己的命令**没有可靠的写法。要不要为 Codex 破这个例，是维护者的决定。

**代价**：用户故事「Codex 的用户把 MCP 装到项目」没有做到；Codex 用户要项目级的 MCP 得自己写 `.codex/config.toml`。画面上如实写了不支持和原因。

**要改回去**：`codex mcp add` 有了范围选项，或维护者接受上面那个绕法时，给 `hosts.ts` 的 Codex 适配补一个 `projectMcp`，并补上「Codex 只对受信任的项目读这份配置」的提醒。其余的（状态、命令、提醒的位置）已经按「每个宿主一份项目配置」写好，不用动。

**没有经维护者确认**：走退路是规格事先定的，但「那个绕法算不算可靠」是实现者判断的。记在任务的 `prd.md` Further Notes 和 `research/project-mcp-trial-record.md`。

---

## Design Decision: 用现成的库解析 TOML、起子进程

**Context**：看 Codex 配没配过要读 `config.toml`；Windows 上起 `claude.cmd`、`codex.cmd` 要经 `cmd.exe` 并转义参数。两样都可以自己写。

**Decision**：各用一个现成的库——`smol-toml`（零依赖）和 `cross-spawn`（连依赖共 6 个小包）。自己扫 TOML 的行分不清多行字符串里长得像表头的行，也说不出“格式不认识”；`cmd.exe` 的转义是出过安全公告的那一类问题，而这条路我们在本机测不了。

**代价**：两个运行时依赖。`cross-spawn` 只对 `node_modules/.bin` 下的 `.cmd` 做双重转义，全局装的那种只转义一次——参数里有双引号时不安全，这正是 `COMMAND_WORD` 和网址的规则都不收双引号的原因之一。

---

## Common Mistakes

### 多选列表里不可选的行，状态词自己带了样式

**Symptom**：不可选的那一行，状态词后面的半行亮回来了。

**Cause**：整行由主题的 `disabled` 压暗；行内的状态词如果自己又包了一层暗淡，它的收尾码会把外层的暗淡一并关掉（同 [终端输出](./terminal-output.md) 里活动行的那个问题）。

**Fix**：不可选的行不写各栏的状态，状态的位置只写圈起来的原因（`ui.mixedPicker` 里 `row.unavailable !== undefined` 的那一支不看 `row.cells`）。

### MCP 的先后不是目录文件里的先后

**Symptom**：照 `catalog.json` 里的顺序预设 key 的应答，值填到了别的 MCP 上；或断言「第一条是 X」不通过。

**Cause**：混合列表里 MCP 一段带推荐的在前、其余按名字（`listing.ts` 的 `recommendedFirst`），问 key、汇总、命令、结果都照这个先后。旧入口照的是目录文件。

**Fix**：按名字排好再写应答；断言命令属于哪个 MCP 时带上它的名字，不靠位置。

### 断言撞上了常驻的那几行

**Symptom**：`expect(output).not.toContain('已跳过')`、`not.toContain('失败 ')` 明明没有那回事却不通过。

**Cause**：只检测到一个宿主时主菜单上方固定有「…已跳过；组件只装进…」，合计行固定有「0 失败 ·」。

**Fix**：断言更具体的字（`格式有误`、`✗`），或者只在切出来的那一段里找。
