# 安装工具

> 目录里的工具条目（`cli/src/catalog.ts`）、状态探测（`cli/src/tool-status.ts`）、安装动作（`cli/src/install-tool.ts`）、外部命令执行器的 shell 模式（`cli/src/run-command.ts`）四段的契约，以及流程（`cli/src/flow.ts`）怎么把它们串起来。

---

## Scenario: 执行一个工具的官方安装命令并复核

### 1. Scope / Trigger

安装工具会**把目录里的一整行文字交给系统的 shell 执行**，而目录是运行时拉取的远程数据。凡是改工具条目的字段或校验、改按系统选命令的规则、改检查方式、改成功与否怎么判、动外部命令执行器的 shell 模式，或改“展示 → 确认 → 执行”的先后，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/catalog.ts
export type ToolOs = 'macos' | 'linux' | 'windows';
export type ToolCheck = { command: string } | { path: string }; // 命令在不在可执行路径上，或主目录下的相对路径存不存在
export interface Tool {
  name: string;
  description: { zh: string; en: string };
  url: string;        // 官方链接，目前不显示
  hosts?: string[];   // 支持的宿主（Host.id）；省略表示不挑宿主
  install: { default: string } & Partial<Record<ToolOs, string | null>>; // null：这个系统不支持
  check: ToolCheck;
}

// cli/src/tool-status.ts
export type ToolStatus = 'none' | 'installed';
export function toolStatus(tool: Tool, where: { env: Environment; homeDir: string }): ToolStatus;

// cli/src/install-tool.ts
export function installCommand(tool: Tool, platform: NodeJS.Platform): { command: string } | { unsupported: ToolOs };
export interface ToolResult {
  available: boolean; // 复核通过没有：成功与否只看它
  run: { kind: 'exit'; code: number } | { kind: 'not-started'; detail: string | undefined }; // 命令是怎么结束的
}
export async function installTool(command: string, runCommand: CommandRunner, check: () => boolean): Promise<ToolResult>; // 不抛错

// cli/src/installer.ts
export interface CommandOptions { shell: true }
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;

// cli/src/ui.ts
export type ToolUnavailable = { kind: 'os'; os: ToolOs } | { kind: 'hosts' };
export interface ToolTarget { name: string; command: string; evidence: ToolEvidence } // evidence：{ command } | { path: 给用户看的路径 }
```

`installCommand` 先算出来、交给汇总展示，之后 `installTool` 执行的就是 `ToolTarget.command` 这同一个字符串——“看到的就是执行的”靠的是不重算。

### 3. Contracts

**目录里的工具条目**（`catalog.json` 的 `tools`）

```json
{
  "name": "uv",
  "description": { "zh": "…", "en": "…" },
  "url": "https://docs.astral.sh/uv/",
  "hosts": ["claude-code"],
  "install": {
    "default": "curl -LsSf https://astral.sh/uv/install.sh | sh",
    "windows": "powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\"",
    "linux": null
  },
  "check": { "command": "uv" }
}
```

| 字段 | 规则 |
|------|------|
| `name`、`description`、`url` | 与应用项目同一套规则（见 [入口与测试](./installer-entry.md)）。名字只在 `tools` 里唯一 |
| `hosts` | 与 MCP 的 `hosts` 同一条规则：可省略；写了就是非空数组；不认识的标识留着不管 |
| `install` | 对象 |
| `install.default` | **必须有**。一整行命令：`^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$`——只含看得见的 ASCII 字符，首尾不留空格。所以里面没有换行、制表符、控制码和不可见的字符（如改变文字方向的 `U+202E`） |
| `install.macos`、`install.linux`、`install.windows` | 可省略（用 `default`）；写了就是同一条规则的一行命令，或 `null`（这个系统不支持）。别的键（不认识的系统名）忽略 |
| `check` | 对象，`command` 与 `path` **恰好有一样** |
| `check.command` | 一个命令的名字：`^[A-Za-z0-9._-]+$` 且不是 `.`、`..`——要拿它去可执行路径的各个目录里找，所以不带目录 |
| `check.path` | 主目录下的相对路径，与 skill 的 `path` 同一条规则（`/` 分段，拒绝绝对路径、`..`、空段） |

**安装命令是一整行 shell，不是“命令 + 参数”**（维护者 2026-10-09 确认）。官方安装命令大多是 `curl … | sh` 这样的管道，拆成参数写不出来。它和 MCP 的 `server.command` 是两套口径：那边不经过 shell、每个词只收安全字符；这边整行交给 shell，把关靠三样——目录的审核、只收可见 ASCII 的校验、执行前整行展示并确认。**不要把这条规则套到别的字段上，也不要让别的字段的值流进这一行。**

**按系统选命令（`installCommand`）**

| `platform` | 目录里的系统名 | 结果 |
|------------|----------------|------|
| `darwin` | `macos` | 条目写了这个系统名：是字符串就用它，是 `null` 就 `{ unsupported }` |
| `linux` | `linux` | 同上 |
| `win32` | `windows` | 同上 |
| 没写这个系统名，或别的平台（`freebsd` 等） | — | 用 `default` |

**状态（`toolStatus`）**：只读、不执行任何命令，每次进列表都现探测。

| 检查方式 | 已安装的条件 |
|----------|--------------|
| `check.command` | 它在 `env.PATH` 的某个目录里且可执行（`hosts.ts` 的 `isOnPath`，和探测宿主是同一个函数；Windows 上认 `PATHEXT`） |
| `check.path` | `<主目录>/<路径>` 存在（`existsSync`，文件或目录都算） |

列表里写「已安装」（绿）、「未安装」（暗淡）。已安装的照样可选，再装一次就是再执行一遍命令。

**哪些条目不可选**

| 情况 | 原因的文字 |
|------|------------|
| `installCommand` 给出 `unsupported` | `不支持 macOS` / `不支持 Linux` / `不支持 Windows`（英文 `not for macOS`） |
| 条目写了 `hosts`，而其中没有一个是**检测到的**宿主 | `需要别的 AI Agent`（与 MCP 同一句） |

两种都写在**状态栏的位置**（画法见 [终端输出](./terminal-output.md) 的「不可选的行」）。先判系统，再判宿主。

工具不装进宿主：不问装进哪个，`hosts` 只决定可不可选。但它仍是组件——**一个宿主都没检测到时整个分组进不去**（规格：这时只有应用项目可进入）。

**流程（`flow.ts` 的 `installTools`）**

1. 多选列表；一个都不勾就确认 → 回主菜单。
2. 「将执行 N 条命令」分区：每条是序号、工具名、完整命令。**任何命令都不许在这之前跑**。
3. 单选：执行（缺省）、返回修改（回列表，勾选还在）、取消（回主菜单）。
4. 逐个执行：每个工具一个以它名字为标题的分区，第一行 `$ <命令>`，然后命令自己的输出，然后空一行、一行结论。
5. 不止一个工具时，一个「结果」分区把各项的结论再列一遍（维护者 2026-10-09 定的：前面的结论早被输出顶出屏幕了）；只装一个时不重复。
6. 通栏横线、「合计」，回主菜单。

**外部命令执行器的 shell 模式（`systemCommandRunner`，`options.shell`）**

| 项 | 约定 |
|----|------|
| 怎么起 | `spawn(command, { shell: true, stdio: 'inherit' })`：POSIX 上是 `/bin/sh -c`，Windows 上是 `cmd.exe /d /s /c`（所以 Windows 的命令要按 `cmd.exe` 的写法写，调 PowerShell 就写 `powershell -c "…"`）；`args` 是空的，不看 |
| 输入输出 | 直接接在用户的终端上：输出实时可见，**不经过呈现层**；命令要问话（`sudo` 的密码）也答得了 |
| 结果 | 结束了就兑现 `{ exitCode }`（被信号结束算 1）。命令不存在时是 shell 以 127 结束，**不是拒绝**；拒绝只在 shell 自己起不来时发生 |
| 环境 | 继承进程自己的环境，不是 `options.env`（同不经 shell 的那一支） |

> **Warning**：`systemCommandRunner` 不进自动化测试（测试里的执行器只记录）。改了 shell 这一支就手动核对两样。**执行器本身**：写个小脚本直接调它，看管道的输出上屏、`exit 3` 得到 3、不存在的命令得到 127、`$HOME` 和引号照 shell 的规矩解释；顺带确认不经 shell 的那一支输出仍不上屏。**接在提问后面**：构建后用 `expect` 在伪终端里走一遍——`HOME` 和 `OXY_TOOLS_CATALOG` 在起它的 shell 里 `export` 到 `mktemp -d` 的目录，样例工具的命令里带一个 `read`，确认输出上屏、键盘输入到得了命令、结论对、之后主菜单还能操作。工单 10 两样都做过；Windows 经 `cmd.exe` 的那一支没有在真机上跑过。

### 4. Validation & Error Matrix

目录里写坏的工具条目只跳过那一条，带着原因进 `Catalog.skipped`。一条只报头一处问题，按 `name`、`description`、`url`、`hosts`、`install`、`install.default`、`install.macos` / `linux` / `windows`、`check`、`check.path` / `check.command` 的顺序查。新增的 `FieldRule` 见 [目录校验与 CI](./catalog-validation.md)。

执行的结论（`installTool` 从不抛错，结论由 `messages.ts` 的 `toolResult` 说成话）：

| 命令怎么结束 | 复核 | 结论 | 计入 |
|--------------|------|------|------|
| 以 0 退出 | 通过 | `✓ 已可用，在 PATH 中找到 uv` / `✓ 已可用，~/.bun/bin/bun 已存在` | 成功 |
| 以 0 退出 | 不通过，查的是命令 | `✗ 失败 命令已正常结束，但在 PATH 中找不到 uv；可能要重开终端才找得到` | 失败 |
| 以 0 退出 | 不通过，查的是路径 | `✗ 失败 命令已正常结束，但 ~/.bun/bin/bun 不存在` | 失败 |
| 非零退出 | 通过 | `✓ 已可用，…；命令退出状态 1` | **成功** |
| 非零退出 | 不通过 | `✗ 失败 命令退出状态 243；在 PATH 中找不到 openspec` | 失败 |
| 没能起来（执行器拒绝或当场抛出） | 照样复核 | `命令没能运行（ENOENT）`，错误没带错误码就没有括号；通过时接在「已可用，…；」后面 | 看复核 |

- **成功与否只看复核，不看退出状态**（规格定的）。所以已装着的工具重装失败仍是「已可用」，退出状态照实写在后面。
- 失败的原因只写退出状态和查了什么，**不转述命令自己的话**——它的输出就在上面，原样可见；起不来时只取错误码，不取消息（同 [安装 MCP](./mcp-install.md)）。
- 一项失败不影响其余项；退出状态不变，不经 `ui.failure()`，标准错误上没有东西。

### 5. Good/Base/Bad Cases

- Good：勾了 `uv` 和 `openspec` → 两条完整命令编号列出，确认后各一个分区，命令的输出原样在里面，结论各一行，末尾「结果」分区重列两行，合计。
- Good：Windows 上条目写了 `install.windows` → 展示和执行的都是那一条，`default` 不出现。
- Base：条目的 `install.macos` 是 `null`，在 macOS 上 → 那一行不可选，状态栏写「不支持 macOS」；在 Linux 上照常可选，用 `default`。
- Base：条目的 `hosts` 是 `["codex"]`，只检测到 Claude Code → 不可选，状态栏写「需要别的 AI Agent」。
- Base：安装脚本把工具装进了一个不在当前 `PATH` 上的目录，条目用 `check.command` → 命令以 0 退出，结论是「失败 …；可能要重开终端才找得到」。这种工具该用 `check.path` 登记。
- Bad：`install.default` 里有换行或制表符 → 这一条被跳过，目录校验命令指出 `install.default`。
- Bad：`check.command` 写成 `bin/uv` 或 `uv --version` → 被跳过，指出 `check.command`。

### 6. Tests Required

都经 `runInstaller`，在 `cli/test/tools.test.ts`；真实的多选画面在 `prompts.test.ts`，条目校验的说法在 `validate-catalog.test.ts`。

- 记录到的命令：**期望值写成字面的字符串**，带 `shell: true`、`args: []`（`{ command: 'curl … | sh', args: [], shell: true }`）。
- 按系统选命令：没另写时用缺省的、另写了时展示和执行的都是那一条、安装器不认识的平台用缺省的。
- 系统不支持：三个系统各一条，断言勾选位、原因的文字、其余照常；在别的系统上同一条可选。
- 宿主：一个都没检测到时不可选；有一个检测到就可选且不问装进哪个；不认识的宿主标识不碍事；一个宿主都没有时分组进不去。
- 先展示后执行：选「取消」时 `result.commands` 是空的而命令已经在输出里、且在提问之前；缺省是执行；返回修改后勾选还在；长命令折行不截断。
- 结论：上表每一行各一条；外加执行器当场抛出、错误消息不出现在输出里；一项失败不影响其余项；不止一个时有「结果」分区且结论各出现两次，只一个时没有。
- 两种检查方式各有“已安装”的状态测试和“装完再进列表是新状态”的测试；Windows 上 `PATHEXT` 一条。
- 安装器自己不往主目录和临时目录里写东西。

测试架子：`commandResult: (command, args, { home }) => …` 的第三个参数给出这次运行的临时主目录——假的执行器不会真的装东西，要证明“装完复核通过”，就让它往 `home` 里写出 `check.path` 的那个文件；`check.command` 的则自己建一个目录当 `PATH`（里面放上 `claude`），让它往里加命令。

### 7. Wrong vs Correct

#### Wrong

```ts
// 以退出状态定成败：安装脚本以 0 退出而工具并不可用，是最常见的假成功
return { ok: result.exitCode === 0 };
```

```ts
// 展示一份、执行时再按系统选一遍：两处迟早对不上
ui.toolCommandList(tools.map((tool) => tool.install.default));
await runCommand(installCommand(tool, platform).command, [], { shell: true });
```

```ts
// 把命令的输出收起来再经呈现层打出去：不是实时的，问话也答不了
const { stdout } = await execFile('sh', ['-c', command]);
ui.line(stdout);
```

```ts
// 为了知道装没装去跑命令（uv --version）：汇总确认之前不许有外部命令在跑
const installed = (await runCommand(check.command, ['--version'])).exitCode === 0;
```

```ts
// 把目录里别的字段拼进安装命令：那些字段的校验不是为 shell 准备的
command: `${tool.install.default} --name ${tool.name}`,
```

#### Correct

```ts
// 先算出要执行的那一行，展示的和执行的是同一个字符串；成败看复核
const plan = installCommand(tool, session.platform);
ui.toolCommandList(jobs.map((job) => job.target));
settle(await installTool(target.command, session.runCommand, () => toolStatus(tool, session) === 'installed'));
```

---

## 已知的限制

都是规格字面允许、但用起来会碰到的，**维护者尚未逐条表态**：

- **复核看的是启动时的 `PATH`**。安装脚本改的是 shell 的启动文件，新目录在这次运行里不在 `PATH` 上，`check.command` 会判失败（结论里有“可能要重开终端”的提醒）。目录里登记这种工具时用 `check.path`。
- **`check.path` 不套 `PATHEXT`**，`check` 也不能按系统覆盖。在 Windows 上叫 `bun.exe`、别处叫 `bun` 的文件，用路径检查就得选一个各系统上都一样的路径（比如它所在的目录）。
- **命令的输出不以换行结尾时**，结论上方那一个空行只是把那半行收掉，结论会紧贴着输出。输入输出是直接接在终端上的，呈现层看不到它最后一个字符是什么。
- **执行中按 Ctrl+C**：信号同时到命令和安装器，`bin.ts` 随即以 130 退出，已经装完的那些没有合计。和下载 skill 时按 Ctrl+C 一样。
- **宿主的原因顶替了状态**：因为要的宿主没检测到而不可选的条目，看不到它是已安装还是未安装。
- **工具名很长时命令被挤窄**：命令的左缘在名字栏之后，名字栏按最长的名字定宽，命令因此折得更碎（视觉评审提过改成名字独占一行，没有改，要改先改 `ui-direction.md`）。
