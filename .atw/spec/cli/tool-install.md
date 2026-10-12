# 安装工具

> 目录里的工具条目（`cli/src/catalog.ts`）、状态探测（`cli/src/tool-status.ts`）、安装动作（`cli/src/install-tool.ts`）、外部命令执行器的 shell 模式（`cli/src/run-command.ts`）四段的契约，以及两套界面共用的那几块（`availability.ts`、`plan.ts`、`run-plan.ts`）和终端界面的流程（`cli/src/flow.ts`）怎么把它们串起来。

---

## Scenario: 执行一个工具的官方安装命令并复核

### 1. Scope / Trigger

安装工具会**把目录里的一整行文字交给系统的 shell 执行**，而目录是运行时拉取的远程数据。凡是改工具条目的字段或校验、改按系统选命令的规则、改检查方式、改成功与否怎么判、动外部命令执行器的 shell 模式，或改“展示 → 确认 → 执行”的先后，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/catalog.ts
export type ToolOs = 'macos' | 'linux' | 'windows';
export type ToolCheck = { command: string } | { path: string }; // 命令在不在可执行路径上，或主目录下的相对路径存不存在
export interface Tool extends Placement { // Placement：{ purpose, recommended }，见「安装 MCP」的签名
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
export type CommandOptions = { shell: true } | { shell?: never; env?: Readonly<Record<string, string>>; cwd?: string }; // 工具只用前一支
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;

// cli/src/availability.ts —— 两套界面共用，见总览的「两套界面共用的部分」
export type Unavailable = { kind: 'no-host' } | { kind: 'hosts' } | { kind: 'global-only' } | { kind: 'os'; os: ToolOs }; // 工具用得到的是 no-host、os、hosts 三种
export function toolUnavailable(machine: Machine, tool: Tool): Unavailable | undefined; // 先看有没有宿主，再看系统，再看它要的宿主

// cli/src/plan.ts
export interface ToolTarget { name: string; command: string; evidence: ToolEvidence } // evidence：{ command } | { path: 给用户看的路径 }
export interface ToolJob { tool: Tool; target: ToolTarget; status: ToolStatus }       // 计划里的一项：装不了的工具即使在勾选里也没有这一项
```

`installCommand` 在算计划时（`planInstall`）算出来、交给汇总（终端界面的汇总展示它，网页界面的不展示），之后 `runPlan` 里 `installTool` 执行的就是 `ToolTarget.command` 这同一个字符串——“看到的就是执行的”靠的是不重算。

### 3. Contracts

**目录里的工具条目**（`catalog.json` 的 `tools`）

```json
{
  "name": "uv",
  "description": { "zh": "…", "en": "…" },
  "url": "https://docs.astral.sh/uv/",
  "purpose": "dev-workflow",
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
| `name`、`description`、`url` | 与外部项目同一套规则（见 [入口与测试](./installer-entry.md)）。名字只在 `tools` 里唯一 |
| `hosts` | 与 MCP 的 `hosts` 同一条规则：可省略；写了就是非空数组；不认识的标识留着不管 |
| `install` | 对象 |
| `install.default` | **必须有**。一整行命令：`^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$`——只含看得见的 ASCII 字符，首尾不留空格。所以里面没有换行、制表符、控制码和不可见的字符（如改变文字方向的 `U+202E`） |
| `install.macos`、`install.linux`、`install.windows` | 可省略（用 `default`）；写了就是同一条规则的一行命令，或 `null`（这个系统不支持）。别的键（不认识的系统名）忽略 |
| `check` | 对象，`command` 与 `path` **恰好有一样** |
| `check.command` | 一个命令的名字：`^[A-Za-z0-9._-]+$` 且不是 `.`、`..`——要拿它去可执行路径的各个目录里找，所以不带目录 |
| `check.path` | 主目录下的相对路径，与 skill 的 `path` 同一条规则（`/` 分段，拒绝绝对路径、`..`、空段） |

**安装命令是一整行 shell，不是“命令 + 参数”**（维护者 2026-10-09 确认）。官方安装命令大多是 `curl … | sh` 这样的管道，拆成参数写不出来。它和 MCP 的 `server.command` 是两套口径：那边不经过 shell、每个词只收安全字符；这边整行交给 shell，把关靠三样——目录的审核、只收可见 ASCII 的校验、执行前整行展示并确认。**第三样只在终端界面成立**：网页界面的汇总不列那一行命令（维护者 2026-10-11 定的，见下面「网页界面下」），它到轮到这个工具时才打在终端上，那时已经确认过了。**不要把这条规则套到别的字段上，也不要让别的字段的值流进这一行。**

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
| 一个宿主都没检测到 | `需要 AI Agent`（与别的组件同一句） |
| `installCommand` 给出 `unsupported` | `不支持 macOS` / `不支持 Linux` / `不支持 Windows`（英文 `not for macOS`） |
| 条目写了 `hosts`，而其中没有一个是**检测到的**宿主 | `需要别的 AI Agent`（与 MCP 同一句） |

三种都写在**状态的位置**（画法见 [终端输出](./terminal-output.md) 的「混合列表与外部项目」）。照表里的先后判：一个宿主都没有时不再看系统和 `hosts`。

工具不装进宿主：`hosts` 只决定可不可选，看的是**检测到的**宿主，不是这一轮选的那几个；状态只有一个，与选了哪些宿主无关。但它仍是组件——一个宿主都没检测到时和别的组件一样不可选。

**流程**（终端界面的在 `flow.ts`，可不可选在 `availability.ts`，算和装在 `plan.ts`、`run-plan.ts`：工具没有自己的入口，和别的类型一起走混合列表，见 [入口与测试](./installer-entry.md) 的「主菜单与流程」）

1. 混合列表里工具自成一段，排在 MCP 之后。**这张列表里只有工具和外部项目时不问装进哪些宿主**：没有要装进宿主的东西。
2. 汇总「将安装 N 项」里工具是最后一张小表，只有条目和操作两栏，操作写「执行安装命令」。
3. 「将执行 N 条命令」分区：工具的命令和 MCP 的列在同一处、接着编号，排在最后，整行原样写出。**任何命令都不许在这之前跑**。
4. 确认只问一次，和别的类型同一问：开始安装（缺省）、返回修改（回列表，勾选还在）、取消（回主菜单）。
5. 逐个执行，**排在本仓库的 skill 和 MCP 之后**：每个工具一个以它名字为标题的分区，第一行 `$ <命令>`，然后命令自己的输出，然后空一行、一行结论。
6. 这一轮的结果不止一行时（不止一个工具，或工具之外还有别的组件），一个「结果」分区把每一行再列一遍（维护者 2026-10-09 定的：前面的结论早被输出顶出屏幕了）；只装一个工具、没有别的组件时不重复。
7. 通栏横线、「合计」；勾了外部项目的接着是它们的说明与链接，再回主菜单。

**网页界面下**（任务 `10-11-installer-web-ui` 工单 12；页面与安装器之间说什么见 [网页界面的契约](./web-ui-contract.md) 的「工具」）

工具在页面上勾选、和别的组件一起确认，**命令仍在终端里跑**——它要接管终端的输入输出（`sudo` 的密码只有终端答得了），把输出搬到页面上不做。可不可选、算计划、执行、成败怎么判，用的是上面同一套（`availability.ts`、`plan.ts`、`run-plan.ts`），和终端界面不一样的只有在哪展示：

| 哪一步 | 页面上 | 终端上 |
|--------|--------|--------|
| 列表 | 「工具」一区，卡片上一段状态（已安装、未安装），没有宿主的名字；不可选的三种原因和终端界面是同一句 | — |
| 汇总 | 每个工具一段，段里一行，只有操作「执行安装命令」。**不列那一行命令**（维护者 2026-10-11 定的），画面状态里也没有它 | 不列：终端上没有「将执行 N 条命令」 |
| 轮到它 | 它那一行写「这一项正在终端里安装，请看终端」 | 以它名字为标题的分区、`$ <命令>`、命令自己的输出、空一行、一行结论——**和终端界面的分区同一个画法**（同一段代码：呈现层的 `toolSection`，终端界面经 `ui.installation` 用它，网页界面经 `ui.toolSections` 用它）。这期间没有待命的提问 |
| 跑完 | 那一行换成结论：「已可用」加查到了什么，或「失败」加原因——结论矩阵里的那几句 | 分区最后的那一行结论 |
| 一批装完 | 结果与合计 | 待命的提问画回来。**没有「结果」分区、没有合计**：页面开着时终端上不重复页面上的内容。安装中页面关了的那一种例外——这一批的结果补打在终端上，工具的结论和别的行排在同一个「结果」分区里，不再打一遍它的分区 |

- **执行的仍是目录里的那一整行**：`planInstall` 算出的 `ToolTarget.command`，`runPlan` 原样交给 `installTool`。页面发来的只有工具的名字。
- **执行在最后**，排在本仓库的 skill、第三方 Skill、MCP 之后（共用的「执行」定的）。一批里的工具跨用途时**按名字**排（`listing.ts` 的 `byName`，和别的类型一样）。
- **工具不受所选的宿主和安装范围影响**：页面上改了宿主、选了项目，工具的状态和可不可选都不变（看的是检测到的宿主），已选里的工具不会因此变得装不了。

**外部命令执行器的 shell 模式（`systemCommandRunner`，`options.shell`）**

| 项 | 约定 |
|----|------|
| 怎么起 | `spawn(command, { shell: true, stdio: 'inherit' })`：POSIX 上是 `/bin/sh -c`，Windows 上是 `cmd.exe /d /s /c`（所以 Windows 的命令要按 `cmd.exe` 的写法写，调 PowerShell 就写 `powershell -c "…"`）；`args` 是空的，不看 |
| 输入输出 | 直接接在用户的终端上：输出实时可见，**不经过呈现层**；命令要问话（`sudo` 的密码）也答得了 |
| 结果 | 结束了就兑现 `{ exitCode }`（被信号结束算 1）。命令不存在时是 shell 以 127 结束，**不是拒绝**；拒绝只在 shell 自己起不来时发生 |
| 环境 | 继承进程自己的环境，不是 `options.env`（同不经 shell 的那一支） |

> **Warning**：`systemCommandRunner` 不进自动化测试（测试里的执行器只记录）。改了 shell 这一支就手动核对两样。**执行器本身**：写个小脚本直接调它，看管道的输出上屏、`exit 3` 得到 3、不存在的命令得到 127、`$HOME` 和引号照 shell 的规矩解释；顺带确认不经 shell 的那一支输出仍不上屏。**接在提问后面**：构建后用 `expect` 在伪终端里走一遍——`HOME` 和 `OXY_TOOLS_CATALOG` 在起它的 shell 里 `export` 到 `mktemp -d` 的目录，样例工具的命令里带一个 `read`，确认输出上屏、键盘输入到得了命令、结论对、之后主菜单还能操作。工单 10 两样都做过；Windows 经 `cmd.exe` 的那一支没有在真机上跑过。

### 4. Validation & Error Matrix

目录里写坏的工具条目只跳过那一条，带着原因进 `Catalog.skipped`。一条只报头一处问题，按 `name`、`description`、`url`、`hosts`、`install`、`install.default`、`install.macos` / `linux` / `windows`、`check`、`check.path` / `check.command` 的顺序查；工具自己的字段都查完之后，最后是四类条目共有的 `purpose`（必须写，且在用途清单里）、`recommended`，规则见 [入口与测试](./installer-entry.md) 的校验表。新增的 `FieldRule` 见 [目录校验与 CI](./catalog-validation.md)。

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
- Good：一次勾了一个 skill、一个 MCP、一个工具 → 汇总里三张小表，命令先是 MCP 的再是工具的；skill 和 MCP 在「正在安装」分区里装完，然后才是工具的分区，最后「结果」分区把三行都列一遍。
- Good：Windows 上条目写了 `install.windows` → 展示和执行的都是那一条，`default` 不出现。
- Base：条目的 `install.macos` 是 `null`，在 macOS 上 → 那一行不可选，状态栏写「不支持 macOS」；在 Linux 上照常可选，用 `default`。
- Base：条目的 `hosts` 是 `["codex"]`，只检测到 Claude Code → 不可选，状态栏写「需要别的 AI Agent」。
- Base：一个宿主都没检测到 → 每个工具都不可选，写「需要 AI Agent」，标了不支持这个系统的那条也是这一句。
- Base：安装脚本把工具装进了一个不在当前 `PATH` 上的目录，条目用 `check.command` → 命令以 0 退出，结论是「失败 …；可能要重开终端才找得到」。这种工具该用 `check.path` 登记。
- Bad：`install.default` 里有换行或制表符 → 这一条被跳过，目录校验命令指出 `install.default`。
- Bad：`check.command` 写成 `bin/uv` 或 `uv --version` → 被跳过，指出 `check.command`。

### 6. Tests Required

都经 `runInstaller`，从用途进入，在 `cli/test/tools.test.ts`；四种类型一起勾选的在 `mixed.test.ts`，真实的多选画面在 `prompts.test.ts`，条目校验的说法在 `validate-catalog.test.ts`。

- 记录到的命令：**期望值写成字面的字符串**，带 `shell: true`、`args: []`（`{ command: 'curl … | sh', args: [], shell: true }`）。
- 按系统选命令：没另写时用缺省的、另写了时展示和执行的都是那一条、安装器不认识的平台用缺省的。
- 系统不支持：三个系统各一条，断言勾选位、原因的文字、其余照常；在别的系统上同一条可选。
- 宿主：它要的宿主一个都没检测到时不可选；有一个检测到就可选且不问装进哪个；不认识的宿主标识不碍事；一个宿主都没有时每个工具都不可选、原因是「需要 AI Agent」。
- 先展示后执行：选「取消」时 `result.commands` 是空的而命令已经在输出里、且在提问之前；缺省是执行；返回修改后勾选还在；长命令折行不截断。
- 结论：上表每一行各一条；外加执行器当场抛出、错误消息不出现在输出里；一项失败不影响其余项；不止一个时有「结果」分区且结论各出现两次，只一个时没有。
- 和别的类型一起：汇总里都有、命令的先后（MCP 在前，工具在后）、工具的分区排在「正在安装」之后、结果各一行、最后是外部项目的链接。
- 两种检查方式各有“已安装”的状态测试和“装完再进列表是新状态”的测试；Windows 上 `PATHEXT` 一条。
- 安装器自己不往主目录和临时目录里写东西。
- 网页界面下的在 `cli/test/web-tools.test.ts`，同样经主接缝（架子扮演浏览器）：一个工具的正常路径（记录到的命令是字面值、页面上的进度与结论、终端上有它的分区）；结论矩阵里「非零退出但复核通过」「以 0 退出但复核不通过」「没能起来」各一条；三种不可选的原因各一条（卡片上的原因、勾不上）；和 skill、第三方 Skill、MCP 混在一批里的先后；画面状态和答复里搜不到那一行命令；安装中没有待命的提问、装完回来；安装中页面关了时终端上补打的结果。

测试架子：`commandResult: (command, args, { home }) => …` 的第三个参数给出这次运行的临时主目录——假的执行器不会真的装东西，要证明“装完复核通过”，就让它往 `home` 里写出 `check.path` 的那个文件；`check.command` 的则自己建一个目录当 `PATH`（里面放上 `claude`），让它往里加命令。

### 7. Wrong vs Correct

#### Wrong

```ts
// 以退出状态定成败：安装脚本以 0 退出而工具并不可用，是最常见的假成功
return { ok: result.exitCode === 0 };
```

```ts
// 展示一份、执行时再按系统选一遍：两处迟早对不上
ui.commandList(tools.map((tool) => tool.install.default));
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

```ts
// 拿这一轮选的宿主（hosts）判断工具可不可选：列表里只有工具和外部项目时根本不问宿主，hosts 是空的，
// 于是检测到了宿主也全成了「需要 AI Agent」；问了宿主时，只勾 Codex 又会把要 Claude Code 的工具挡掉
const unavailable = hosts.length === 0 ? { kind: 'no-host' } : tool.hosts && !hosts.some(…) ? { kind: 'hosts' } : undefined;
```

#### Correct

```ts
// availability.ts：可不可选看检测到的宿主（detected），和这一轮选了哪些无关
if (detected.length === 0) return { kind: 'no-host' };
if ('unsupported' in command) return { kind: 'os', os: command.unsupported };

// plan.ts 先算出要执行的那一行，flow.ts 展示的和 run-plan.ts 执行的是同一个字符串；成败看复核
const command = installCommand(tool, machine.platform);
ui.commandList([...commands, ...toolJobs.map((job) => job.target.command)]);
settle(await installTool(target.command, runtime.runCommand, () => toolStatus(tool, runtime) === 'installed'));
```

---

## 已知的限制

都是规格字面允许、但用起来会碰到的，**维护者尚未逐条表态**：

- **复核看的是启动时的 `PATH`**。安装脚本改的是 shell 的启动文件，新目录在这次运行里不在 `PATH` 上，`check.command` 会判失败（结论里有“可能要重开终端”的提醒）。目录里登记这种工具时用 `check.path`。
- **`check.path` 不套 `PATHEXT`**，`check` 也不能按系统覆盖。在 Windows 上叫 `bun.exe`、别处叫 `bun` 的文件，用路径检查就得选一个各系统上都一样的路径（比如它所在的目录）。
- **命令的输出不以换行结尾时**，结论上方那一个空行只是把那半行收掉，结论会紧贴着输出。输入输出是直接接在终端上的，呈现层看不到它最后一个字符是什么。
- **执行中按 Ctrl+C**：信号同时到命令和安装器，`bin.ts` 随即以 130 退出，已经装完的那些没有合计。和下载 skill 时按 Ctrl+C 一样。
- **宿主的原因顶替了状态**：因为要的宿主没检测到而不可选的条目，看不到它是已安装还是未安装。
- **将执行的命令里看不出哪一条是哪个工具的**：命令不再带工具名一栏（工单 01 定的画法），只能从命令本身和汇总里小表的先后认。
