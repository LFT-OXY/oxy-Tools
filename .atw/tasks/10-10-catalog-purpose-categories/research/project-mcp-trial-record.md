# 工单 11 的第一步：两个宿主把 MCP 装到项目的真实写法

> 2026-10-11，macOS，claude 2.1.295、codex-cli 0.162.0。主会话亲自跑的，没有交给子代理。
> 全程在 `mktemp -d` 建的临时目录里：`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 都在脚本开头指到它并断言不含真实主目录的路径。命令是直接敲的宿主命令（这一步要定的就是命令怎么写），不经安装器。
> 官方文档对照的两页：Claude Code 的 <https://code.claude.com/docs/en/mcp>（Project scope、Project server approvals and workspace trust 两节），Codex 的 <https://developers.openai.com/codex/config-basic>（Configuration precedence 一节）。

## 结论

| 宿主 | 能不能装到项目 | 依据 |
|------|----------------|------|
| Claude Code | **能**。添加和移除命令带 `--scope project`，在项目目录下运行；配置写进运行目录的 `.mcp.json` | 实测 + 官方文档 |
| Codex | **不能**（验证不通过）。它的添加、移除命令只管用户级配置；唯一能让它写进项目的绕法（把 `CODEX_HOME` 指到项目的 `.codex`）不可靠 | 实测 + 官方文档 |

照规格事先定好的退路（`prd.md`「MCP 的项目范围」、Further Notes 第 11 条）：**项目范围下 Codex 那一栏显示不支持并写明原因，不去改用户的文件。**

## Claude Code

| 核对什么 | 命令 | 结果 |
|----------|------|------|
| 添加本地进程 | `claude mcp add --scope project probe-local -- npx -y @upstash/context7-mcp` | 退出状态 0；运行目录下出现 `.mcp.json`，顶层 `mcpServers` 里一个名字一条（`type: stdio`、`command`、`args`、`env: {}`） |
| 同名已存在时再添加 | 同上再跑一遍 | **失败**，退出状态 1（`already exists in .mcp.json`）——和用户级一样，所以「已配置的先移除再添加」照旧成立 |
| 带环境变量 | `claude mcp add --scope project probe-keyed -e 'PROBE_KEY=s3cr3t=&+/value' -- npx -y probe-pkg` | 退出状态 0；**值原样、明文**写进 `.mcp.json` 里这一条的 `env` |
| 添加远程地址 | `claude mcp add --scope project --transport http probe-remote https://mcp.example.org/mcp` | 退出状态 0；`{ "type": "http", "url": … }` |
| 移除 | `claude mcp remove --scope project probe-local` | 退出状态 0 |
| 移除一个不存在的 | 同上再跑一遍；换一个从没有过的名字 | 失败，退出状态 1（`No MCP server named … in .mcp.json`） |
| 全部移除之后 | — | `.mcp.json` 还在，内容是 `{ "mcpServers": {} }` |
| 写到哪个目录 | 在一个 git 仓库的子目录 `sub/` 里添加 | 写的是 `sub/.mcp.json`——**运行目录**，不是仓库根。所以命令要在项目目录下运行，已配置的也从项目目录的 `.mcp.json` 看 |
| 用户级配置 | 上面全部跑完后看 `<CLAUDE_CONFIG_DIR>/.claude.json` | 文件被建了出来（首次启动的那几个字段），**没有 `mcpServers`，也搜不到任何一个探针的名字**；`<HOME>` 是空的 |
| 项目目录里另外多了什么 | `find` | 只有 `.mcp.json` |
| **要不要另行批准** | `claude mcp get probe-local` | `Scope: Project config (shared via .mcp.json)`、`Status: ⏸ Pending approval (run \`claude\` to approve)`——**要**。官方文档同一个说法：交互式会话里它先问用户批不批准，才用 `.mcp.json` 里的服务器 |

## Codex

| 核对什么 | 做法 | 结果 |
|----------|------|------|
| 它读不读项目里的配置 | 手写 `<项目>/.codex/config.toml`（一张 `[mcp_servers.probe-read]`），在项目目录里 `codex mcp list` | 项目没受信任时列不出来；在用户级配置里写上 `[projects."<项目>"] trust_level = "trusted"` 之后列得出来。和官方文档一致：项目里的 `.codex/` 只对受信任的项目生效 |
| `codex mcp add` 写到哪 | 在同一个项目目录里 `codex mcp add probe-user -- npx -y probe-pkg` | 输出 `Added global MCP server`，写的是 `<CODEX_HOME>/config.toml`；项目里那份没有动。命令没有范围选项（`--help` 里只有 `-c`、`--env`、`--url` 等） |
| `codex mcp remove` 管不管项目里的 | `codex mcp remove probe-read`（它只在项目的配置里） | `No MCP server named 'probe-read' found`，退出状态 0，项目里那份没有动 |

唯一能让它自己的命令写进项目的绕法：执行时把 `CODEX_HOME` 指到 `<项目>/.codex`。试了，**判为不可靠**：

| 问题 | 实测 |
|------|------|
| 目录不存在就失败 | `<项目>/.codex` 不存在时退出状态 1（`CODEX_HOME points to …, but that path does not exist`）。安装器得先替用户建这个目录，这一步不在展示给用户的命令里 |
| 在项目里留下别的东西 | 每跑一次，`<项目>/.codex/` 下多一个 `tmp/arg0/` 空目录 |
| 丢掉用户文件里的注释 | 已有的 `[mcp_servers.mine] # 我自己加的` 被重写成 `[mcp_servers.mine]`，行尾的注释没了（文件开头的整行注释还在） |
| 展示的和能照着跑的不是一回事 | 汇总里那条命令用户自己照着跑，写进的是全局配置；要一致就得把环境变量也写进展示的命令，而 Windows 上那个写法不成立 |
| 没有试、但躲不开的 | 换了 `CODEX_HOME` 之后它读不到用户真正的配置和登录状态：添加远程地址时当场走的 OAuth 登录，凭据会记到哪（可能就是项目目录）没有验证；这个变量的本意是「Codex 的主目录」，拿它当范围选项用不在官方的说法之内，以后的版本往里多写什么也没有保证 |

**安装器自己往 `<项目>/.codex/config.toml` 里写一张表这条路没有试。** 它不是技术上走不通——上表第一行就是手写的那份在受信任的项目里读得到——而是两条既有的决定排除了它：`.atw/spec/cli/mcp-install.md` 的 Wrong 例「直接改宿主的配置文件：格式是它的私事，还会和它自己的写入撞车」，和规格 Further Notes 第 11 条「验证不通过时显示为不支持，而不是硬写它的配置文件」。所以这里说的「验证不通过」确切的意思是：**用宿主自己的命令**没有可靠的写法。要不要为 Codex 破这个例，是维护者的决定（评审指出过这一条判断不该由实现者悄悄做掉）。

## 这一步定下的做法

- 宿主适配里项目范围的 MCP 是可选的一组回答：Claude Code 有，Codex 没有。
- Claude Code：`claude mcp add --scope project …`、`claude mcp remove --scope project <名字>`，在项目目录下运行；已配置的从 `<项目目录>/.mcp.json` 顶层的 `mcpServers` 看。先移除再添加、状态未知时先尝试移除，都和用户级一样。
- Codex：项目范围下每个 MCP 在它那一栏都是「不支持」，不产生安装项；列表上方一行写明原因（「Codex 的 MCP 只能装到全局：没有把 MCP 写进项目的命令」）。所选的宿主里只有它时，MCP 的行不可选。
- 汇总下方多两行提醒：带 key 的 MCP 装到项目时，key 会以明文写进 `.mcp.json`；装进 Claude Code 的写进当前目录的 `.mcp.json`、要在这个目录下启动 `claude` 批准之后才启用。规格里「Codex 只对受信任的项目读这份配置」那一行随 Codex 不支持而用不上。

## 实现之后的手动核对：安装器自己拼的命令加真实的执行器

> 同一天，同一台机器，另一个 `mktemp -d` 的临时目录；`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 在起脚本的 shell 里指到它，驱动脚本开头逐个断言。

做法照工单 10 的那一次：`cd cli && npm run build`，一个放在临时目录里的小脚本（不进仓库）从 `dist/` 里取安装器自己的东西来用，不另抄一份——`detectHosts(env, home, project)` 给出两个宿主，`mcpStatuses(mcps, hosts, 'project')` 看状态，`mcpSteps(mcp, host.projectMcp, status, variables)` 拼命令，`installMcp(steps, keys, systemCommandRunner(), host.projectMcp.cwd)` 用真实的外部命令执行器执行。**脚本从放脚本的目录起，不是项目目录**：命令落在哪只靠执行器收到的 `cwd`。装了三个探针：本地进程的、带一个 key 的（值是 `s3cr3t=&+/value`）、远程地址的；本地进程的那个又按「已配置」重装了一遍。

| 核对什么 | 结果 |
|----------|------|
| 装之前的状态 | Claude Code 那一栏三个都是 `none`，Codex 那一栏三个都是 `global-only`（它没有 `projectMcp`） |
| 执行的命令 | `claude mcp add --scope project oxy-probe-project-local -- npx -y @upstash/context7-mcp`、`claude mcp add --scope project oxy-probe-project-keyed -e PROBE_KEY=… -- npx -y probe-pkg`、`claude mcp add --scope project --transport http oxy-probe-project-remote https://mcp.example.org/mcp`，都成功 |
| 配置落在哪 | `<项目目录>/.mcp.json` 里三条都在；带 key 的那条 `env.PROBE_KEY` 与输入的值逐字相同 |
| 装之后的状态 | Claude Code 那一栏三个都是 `configured`——状态探测读的和命令写的是同一个文件 |
| 已配置的重装 | 先 `claude mcp remove --scope project oxy-probe-project-local`，再添加，成功；`.mcp.json` 里仍是三条 |
| 落点跟的是执行器的 `cwd` | 项目目录里只多了 `.mcp.json`；放脚本的目录里除了两个脚本什么都没多；仓库里没有多出 `.mcp.json` |
| 用户级配置 | 临时的 `<CLAUDE_CONFIG_DIR>/.claude.json` 里探针的名字出现 0 次；临时主目录是空的；临时的 `<CODEX_HOME>` 是空的 |
| Claude Code 自己怎么看 | 在项目目录里 `claude mcp get oxy-probe-project-local`：`Scope: Project config (shared via .mcp.json)`，`Status: ⏸ Pending approval (run \`claude\` to approve)` |
| 真实的配置 | 运行前后各数一次 `~/.claude.json`、`~/.codex/config.toml` 里探针名字出现的次数，都是 0 |

**评审之后补的一次**（评审指出上面只数了探针的名字，而那份临时的 `.claude.json` 是 claude 自己建出来的，说明不了「用户级配置没有变化」；自动化测试里的执行器只记录，同样说明不了）：再开一个临时目录，**事先**在 `<CLAUDE_CONFIG_DIR>/.claude.json` 的 `mcpServers` 里放一条 `oxy-probe-existing`，在 `<CODEX_HOME>/config.toml` 里放同名的一张表，然后用同样的做法往项目里装两个——一个带 key 的新名字，一个就叫 `oxy-probe-existing`。

| 核对什么 | 结果 |
|----------|------|
| 装之前的状态 | 全局范围下 `oxy-probe-existing` 两个宿主都是 `configured`；项目范围下 Claude Code 是 `none`、Codex 是 `global-only`——**状态按范围读，两份配置互不相干** |
| 用户级配置的 `mcpServers` | 装之后与装之前**逐字相同**（整段序列化后比较）；`projects` 一段没有被写出来 |
| Codex 的用户级配置 | 整个文件与之前逐字相同 |
| 装之后的状态 | 全局范围下不变；项目范围下 Claude Code 那一栏两个都是 `configured` |
| 项目目录 | 只有 `.mcp.json`，里面是那两个名字；临时主目录是空的 |
| 真实的配置 | 运行前后探针名字出现的次数都是 0 |

经安装器整条交互流程（伪终端里选「项目」再装）的真实安装没有走；提问、汇总、提醒、结果这一段由自动化测试和界面预览页盖着，它们用的是假的执行器。

## 没有核对的

- Windows 和 Linux 上的表现。
- 更早或更新版本的 claude、codex。`codex mcp add` 以后要是有了范围选项，这个结论要重做。
