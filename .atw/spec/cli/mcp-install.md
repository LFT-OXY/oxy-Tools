# 安装 MCP

> 目录里的 MCP 条目（`cli/src/catalog.ts`）、宿主适配里关于 MCP 的三问（`cli/src/hosts.ts`）、状态探测（`cli/src/mcp-status.ts`）、安装动作（`cli/src/install-mcp.ts`）、外部命令执行器（`cli/src/run-command.ts`）五段的契约，以及流程（`cli/src/flow.ts`）怎么把它们串起来。目前只处理不需要 API key 的 MCP；带 key 的随工单 09 补进来。

---

## Scenario: 把一个 MCP 写进宿主的用户级配置

### 1. Scope / Trigger

安装 MCP 会**执行外部命令**，而命令的内容（启动命令、参数、网址）来自运行时拉取的远程目录。凡是改 MCP 条目的字段或校验、改命令怎么拼、改看哪个配置文件、改状态怎么判、改已配置或状态未知时怎么装、动外部命令执行器，或加一个宿主，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/catalog.ts
export type McpServer = { command: string; args: string[] } | { url: string }; // 本地进程，或远程地址
export interface Mcp {
  name: string;
  description: { zh: string; en: string };
  url: string;        // 官方链接
  hosts?: string[];   // 支持的宿主（Host.id）；省略表示全部支持
  server: McpServer;
}

// cli/src/hosts.ts
export interface Command { command: string; args: string[] } // 不经过 shell，args 的每一项原样是一个参数
export interface Host {
  id: string;                                              // 目录里指代它的名字：claude-code、codex
  // …name、detected、skillsDir 见「安装 skill」
  configuredMcps(): ReadonlySet<string> | undefined;       // 用户级配置里已有的 MCP 的名字；读不了或格式不认识时 undefined
  addMcp(mcp: Mcp): Command;
  removeMcp(name: string): Command;
  remoteMcpLogin?: Command;                                // 见「宿主添加远程地址时会当场登录」
}

// cli/src/mcp-status.ts
export type McpStatus = 'none' | 'configured' | 'unknown' | 'unsupported';
export function mcpStatuses(mcps: readonly Mcp[], hosts: readonly Host[]): McpStatus[][]; // [第几个 MCP][第几个宿主]

// cli/src/install-mcp.ts
export interface McpStep { action: 'remove' | 'add'; command: Command; tolerated: boolean }
export function mcpSteps(mcp: Mcp, host: Host, status: Exclude<McpStatus, 'unsupported'>): McpStep[];
export async function installMcp(steps: readonly McpStep[], runCommand: CommandRunner): Promise<void>;
export interface McpInstallProblem {
  action: 'remove' | 'add';                                                   // 失败的是哪一步
  cause: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string };
  removed: boolean;                                                           // 添加失败时，移除命令是否已经执行成功
}
export class McpInstallError extends Error { readonly problem: McpInstallProblem }

// cli/src/installer.ts
export interface CommandResult { exitCode: number }
export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>; // 命令没能起来时拒绝

// cli/src/run-command.ts
export function systemCommandRunner(): CommandRunner;
```

`installMcp` 失败时**只**抛 `McpInstallError`。`mcpSteps` 先算出来、交给汇总展示，之后执行的就是这同一份——“看到的就是执行的”靠的是不重算。

### 3. Contracts

**目录里的 MCP 条目**（`catalog.json` 的 `mcps`）

```json
{
  "name": "context7",
  "description": { "zh": "…", "en": "…" },
  "url": "https://github.com/upstash/context7",
  "hosts": ["claude-code", "codex"],
  "server": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
}
```

远程地址的写成 `"server": { "url": "https://mcp.example.com/mcp" }`。

| 字段 | 规则 |
|------|------|
| `name`、`description`、`url` | 与应用项目同一套规则（见 [入口与测试](./installer-entry.md)）；`url` 是官方链接，目前不显示。名字只在 `mcps` 里唯一 |
| `hosts` | 可省略（全部支持）；写了就要是**非空**数组，每一项符合 `name` 的规则。**不认识的标识留着不管**：以后加了宿主，旧版安装器照样读得了这一条 |
| `server` | 对象，`command` 与 `url` **恰好有一样** |
| `server.command`、`server.args` 的每一项 | `^[A-Za-z0-9@:/._=+,~-]+$`；`args` 可省略（当作空） |
| `server.url` | 与应用项目的 `url` 同一条规则：只收 https，只含 RFC 3986 允许的字符 |

`command` 和 `args` 收得这么紧，是因为它们有三个去处：原样打到终端上让用户确认、交给宿主的命令、被宿主记进配置之后每次启动都执行。规则保证里面没有空白、引号和任何 shell 会另作解释的字符，所以展示出来的那一行没有歧义，Windows 上经 `cmd.exe` 起 `.cmd` 时也不必转义引号。代价是带空格的参数、带查询串的网址参数、Windows 路径都写不进目录。这条规则是工单 08 的实现者定的，**维护者尚未确认**；要放宽先改这里和 `catalog.ts` 的 `COMMAND_WORD`，并重新核对 `ui.ts` 里展示命令时加引号的判断（`PLAIN_ARGUMENT`）。

**两个宿主的命令与配置文件**（2026-10-09 对照官方文档，并在本机用 claude 2.1.295、codex 0.162.0 在临时配置目录里实测）

| | Claude Code | Codex |
|---|---|---|
| 添加本地进程 | `claude mcp add --scope user <名字> -- <命令> <参数…>` | `codex mcp add <名字> -- <命令> <参数…>` |
| 添加远程地址 | `claude mcp add --scope user --transport http <名字> <网址>` | `codex mcp add <名字> --url <网址>` |
| 移除 | `claude mcp remove --scope user <名字>` | `codex mcp remove <名字>` |
| 同名已存在时再添加 | **失败**，退出状态 1（`already exists in user config`） | 直接覆盖，退出状态 0 |
| 移除一个不存在的 | 失败，退出状态 1 | 成功，退出状态 0 |
| 用户级配置 | `<配置目录>/.claude.json` 顶层的 `mcpServers`（JSON 对象，键是名字）；配置目录缺省是主目录，`CLAUDE_CONFIG_DIR` 非空时用它 | `<CODEX_HOME>/config.toml` 的 `mcp_servers` 表；`CODEX_HOME` 缺省是 `<主目录>/.codex` |

- 远程地址只有一种：可流式的 HTTP。SSE、请求头鉴权都不在范围内。
- **各系统上命令相同，原生 Windows 上也不给本地进程包 `cmd /c`**。Claude Code 的旧文档要求过（否则 `npx` 这类 `.cmd` 起不来，报 Connection closed）；它的更新日志 2.1.119 写明移除了那条“需要 cmd /c 包装”的警告（称其为误报），现行的 MCP 文档里也已经没有这条说明；Codex 的文档从未要求过。2.1.119 之前的 Claude Code 不在支持之列。这个结论来自文档和更新日志，**没有在 Windows 真机上实测**；`mcp.test.ts` 里有一条 `platform: 'win32'` 的测试守着“不包”这个决定。
- 两个环境变量是照着“命令会写到哪，就去哪看”定的：宿主的命令继承同一份环境。**skill 目录不认 `CLAUDE_CONFIG_DIR`**（仍是 `<主目录>/.claude/skills`），同一份适配里两套口径，这是已知的不一致，要不要改由维护者定。

**状态（`mcpStatuses`）**

每个宿主的配置**只读一次**、只读、不抛错、不执行任何命令：

| 情况 | 状态 | 列表里的写法 |
|------|------|--------------|
| 条目写了 `hosts` 且不含这个宿主的 `id` | `unsupported` | `不支持`（暗淡） |
| 配置文件不存在（宿主还没写过配置） | `none` | `未配置`（暗淡） |
| 读得出来，那张表里没有这个名字（包括整张表都没有） | `none` | `未配置` |
| 读得出来，有这个名字 | `configured` | `已配置`（绿） |
| 文件读不了（权限、那里是个目录）、解析不了、顶层或那张表不是对象 | `unknown` | `未知`（默认色） |

- Codex 的配置用 `smol-toml` 解析，所以 `[mcp_servers.x]`、行内表、带点的键哪种写法都认得；解析失败就是 `unknown`，不自己猜。
- 状态每次进列表都现探测；某个宿主那一栏出现 `unknown` 时，列表上方多一行「注意  读不到 <宿主> 的配置，无法判断哪些 MCP 已配置」。

**怎么装（`mcpSteps`）**

| 状态 | 命令 | 汇总里的操作 | 备注 |
|------|------|--------------|------|
| `none` | 添加 | 新装 | 空 |
| `configured` | 移除，再添加 | 覆盖（黄色粗体） | `已配置，先移除再添加` |
| `unknown` | 移除（`tolerated`：失败了也接着做），再添加 | 添加 | `状态未知，先尝试移除同名配置` |
| `unsupported` | 不装，汇总、命令、结果里都没有它 | — | — |

- 汇总之后是「将执行 N 条命令」：每条完整命令编号列出，确认了才执行。**任何外部命令都不许在这之前跑**，状态探测因此只读文件。
- 不另问“要不要覆盖”：MCP 没有“是不是本工具装的”这个概念，再装一次就是覆盖。
- 每个 MCP 在每个**支持它的**所选宿主下各是一项，各有一行结果，互不影响；一项失败不影响其余项，退出状态不变。
- 所选宿主一个都不支持的条目在列表里不可选（多选的不可选行，见 [终端输出](./terminal-output.md)），原因写「需要别的 AI Agent」；只有一部分不支持的仍可选。

**外部命令执行器（`systemCommandRunner`）**

| 项 | 约定 |
|----|------|
| 怎么起 | `cross-spawn`，不经过 shell；Windows 上宿主的命令常是 npm 装出来的 `.cmd`，Node 不许直接起，`cross-spawn` 替我们经 `cmd.exe` 起并把参数转义好 |
| 输入输出 | `stdio: 'ignore'`：命令的输出**不上屏**（进行中的那一行在转，混进别的字会乱），它也不从终端读输入 |
| 结果 | 结束了就兑现 `{ exitCode }`（被信号结束算 1）；起不来（命令不存在）就拒绝，错误带 `code` |

> **Warning**：`systemCommandRunner` 不进自动化测试（测试里的执行器只记录）。改了它就用一个假的宿主命令手动核对：参数原样逐个传到（含带 `&`、`'`、`$` 的网址）、非零退出、命令不存在、它的输出没有漏到终端上。Windows 经 `cmd.exe` 的那一支至今没有在真机上跑过。

**宿主添加远程地址时会当场登录**

Codex 的 `mcp add --url` 写完配置之后，如果那个服务器支持 OAuth，会**当场打开浏览器登录并等到登录完成才结束**，授权网址打在它自己的标准输出上（读它的源码 `codex-rs/cli/src/mcp_cmd.rs` 确认的）。安装器不显示宿主命令的输出，所以事先说：适配里有 `remoteMcpLogin`（值是事后补登录的命令，Codex 是 `codex mcp login`）的宿主，只要这一轮有远程地址的 MCP 要装进它，「将执行的命令」下面就多一行「注意」，写明可能当场打开浏览器、浏览器打不开时按 Ctrl+C、之后执行 `<补登录的命令> <名称>`。Claude Code 的添加命令不登录，没有这个字段。

这是维护者在三个方案里选的（2026-10-09）；另两个是把宿主命令的输出透传到屏幕上、留作已知问题另开工单。远程终端里仍然看不到授权网址，这一项会一直显示进行中，直到用户按 Ctrl+C（配置这时已经写入）。

### 4. Validation & Error Matrix

目录里写坏的 MCP 条目只跳过那一条，带着原因进 `Catalog.skipped`（规则见上表，`FieldRule` 见 [目录校验与 CI](./catalog-validation.md)）。一条只报头一处问题，按 `name`、`description`、`url`、`hosts`、`server`、`server.command` / `server.url`、`server.args` 的顺序查。

单项安装失败（`installMcp` 抛 `McpInstallError`）：只这一项失败，结果里这一行写「失败」加原因，退出状态不变。

| 情况 | `McpInstallProblem` | 原因的写法 |
|------|---------------------|------------|
| 状态是已配置，移除命令非零退出 | `action: 'remove'`，`cause: exit` | `移除命令退出状态 3；未执行添加`——**不再添加** |
| 添加命令非零退出，之前没有移除成功过 | `action: 'add'`，`removed: false` | `添加命令退出状态 1` |
| 添加命令非零退出，移除已经成功 | `action: 'add'`，`removed: true` | `添加命令退出状态 1；此前已执行移除`——旧配置这时已经没了，必须说 |
| 命令没能起来 | `cause: not-started`，`detail` 是错误码 | `添加命令没能运行（ENOENT）` |
| 状态未知时的移除失败（非零退出或没能起来） | 不算失败 | 接着添加，这一步的结果不出现在任何地方 |

原因里**不带宿主命令自己的话**，也不写“配置未改动”：前者见下面的 Design Decision，后者是因为宿主的命令原不原子我们保证不了。

### 5. Good/Base/Bad Cases

- Good：只检测到 Claude Code，勾了一个本地进程的和一个远程地址的，都未配置 → 汇总两行「新装」、两条命令，记录到的正好是这两条添加命令，结果两行「已配置」，回到主菜单。
- Good：两个宿主都选了，`context7` 在 Claude Code 里已配置 → 汇总里 Claude Code 那行「覆盖」、Codex 那行「新装」，三条命令：先 `claude mcp remove`，再两条添加。
- Base：Codex 的 `config.toml` 写坏了 → 列表上方一行「注意」，Codex 那一栏都是「未知」，没有出错分区；装的时候每一项先 `codex mcp remove` 再 `codex mcp add`，移除不管成不成都接着添加。
- Base：条目的 `hosts` 是 `["codex"]`，只检测到 Claude Code → 那一行不可选，行尾「需要别的 AI Agent」；两个宿主都选了时它可选，Claude Code 那一栏写「不支持」，只装进 Codex。
- Bad：`server.args` 里有一项是 `pkg; rm -rf ~` → 这一条被跳过，计入主菜单上方提示的数量，目录校验命令指出 `server.args`。
- Bad：`claude mcp add` 以 1 退出 → 这一行「失败 添加命令退出状态 1」，别的项照常，安装器不退出。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/mcp.test.ts`；真实的多选画面在 `prompts.test.ts`，条目校验的说法在 `validate-catalog.test.ts`。

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

测试架子：`commandResult: (command, args) => …` 预设外部命令的结果——返回 `{ exitCode }` 盖过缺省的 0，返回一个 `Error` 表示命令没能起来，什么都不返回就是成功；命令照样进 `result.commands`。

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

#### Correct

```ts
// 只读地看一眼配置文件；读不了就是 undefined，由状态探测说成「未知」
configuredMcps: () => namesIn(join(env['CODEX_HOME'] || join(homeDir, '.codex'), 'config.toml'), parseToml, 'mcp_servers'),
```

```ts
// 先算出要执行的每一步，展示的和执行的是同一份
const steps = mcpSteps(mcp, host, status);
ui.commandList(jobs.flatMap((job) => job.steps.map((step) => step.command)));
await installMcp(steps, session.runCommand);
```

```ts
// 期望值是字面的命令，出处是宿主的文档
const CODEX_ADD_REMOTE = { command: 'codex', args: ['mcp', 'add', 'tracker-remote', '--url', 'https://mcp.example.org/mcp'] };
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

**代价**：用户只看到哪一步、退出状态几。完整的命令在汇总里，可以照着自己再跑一遍看原因。要改回去，先在终端输出的规范里立例外，并解决上面后两条。

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

**Fix**：不可选的行里，各栏给不带样式的文字（`ui.mcpPicker` 里 `unavailable ? t.mcpStatus[status] : mcpStatusCell(status)`）。

### 断言撞上了常驻的那几行

**Symptom**：`expect(output).not.toContain('已跳过')`、`not.toContain('失败 ')` 明明没有那回事却不通过。

**Cause**：只检测到一个宿主时主菜单上方固定有「…已跳过；组件只装进…」，合计行固定有「0 失败 ·」。

**Fix**：断言更具体的字（`格式有误`、`✗`），或者只在切出来的那一段里找。
