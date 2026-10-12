# Pi 与 omp 作为宿主：事实与已定的决定

调研日期 2026-10-12。事实来自本机只读查看（帮助输出、随包文档、程序文件里的可读文字、本机缓存的 skills CLI 源码），没有执行任何会改宿主配置的命令。

## 安装器现状

- `cli/src/hosts.ts`：`ADAPTERS = [claudeCode, codex]`，加一个宿主就追加一份适配。
- 每份适配要给出：`id`、`name`、`detected`（命令在不在 PATH）、`skillsDir`、`projectSkillsDir`、`skillsCli`（agent 名与环境变量）、用户级的 `configuredMcps` / `addMcp` / `removeMcp`、可选的 `projectMcp`、可选的 `remoteMcpLogin`。
- `Host extends McpConfig`：现在的类型假定每个宿主都有用户级的 MCP 配置，没有「这个宿主完全不装 MCP」的表达。`mcp-status.ts` 的 `unsupported` 目前只表示「条目不支持这个宿主」。
- `plan.ts` 按「条目 × 所选宿主」各出一项；多个宿主的 skill 目录相同时，现有逻辑会对同一个目录出多项。
- 目录（`catalog.json`）里没有条目用到 `hosts` 字段。

## Pi

- 本机：`@earendil-works/pi-coding-agent` 1.1.0，命令 `pi`，仓库 `github.com/earendil-works/pi`。
- 配置目录缺省 `~/.pi/agent`，可由 `PI_CODING_AGENT_DIR` 改到别处（随包文档 `docs/environment-variables.md`）。
- Skill（`docs/skills.md`）：自己的用户级与项目级 skill 目录（本机有 `~/.pi/agent/skills`）；另外支持 `~/.agents/skills/` 和 `.agents/skills/`，项目的从工作目录向上找到仓库根。
- skills CLI 1.7.2 认识 `pi`：`skillsDir: ".agents/skills"`，`globalSkillsDir: ~/.agents/skills`，以 `~/.pi/agent` 是否存在判断装没装。
- MCP（`pi mcp --help`、`docs/mcp.md`）：
  - `pi mcp add <server> [-l] [--env KEY=VALUE]... -- <command> [args...]`
  - `pi mcp add <server> [-l] --url <url>`（streamable HTTP；不支持 SSE）
  - `pi mcp remove <server> [-l]`
  - `pi mcp login <server>`、`pi mcp logout <server>`、`pi mcp list [--json]`
  - 用户级 `~/.pi/agent/mcp.json`，项目级 `.pi/mcp.json`（`-l`）；两者都是顶层 `mcpServers`。
  - 项目级配置只在项目被信任之后才读。
  - 服务器名只能含字母、数字、`_`、`-`；只差 `-` 和 `_` 的名字算同一个。
- 待在规格阶段查清：`pi mcp add --url` 遇到要 OAuth 的服务器会不会当场开浏览器；旧版 Pi（没有 `pi mcp`）下命令的失败形态。

## omp

- 本机：omp 18.8.7，命令 `omp`，单个可执行文件（`~/.bun/bin/omp`）。
- Skill：读自己的 `~/.omp/agent/skills`；内置的发现来源还读 `.agent/skills` 与 `.agents/skills`（项目向上找 + 用户主目录）、`.claude/skills/*/SKILL.md`、`~/.codex/skills` 与 `.codex/skills/` 等。重名时界面里有「Shadowed by another source」的标注，推断只留优先级高的一份（未实际运行验证）。
- skills CLI 1.7.2 的 79 个 agent 名里没有 omp。
- MCP：没有会话外的添加命令（`omp mcp` 不是子命令）；会话内有 `/mcp add <name> [--scope project|user] [--url <url> --transport http|sse] [--token <token>] [-- <command...>]`。配置在 `~/.omp/agent/mcp.json`（顶层 `mcpServers`，带 `$schema`）；项目根的 `.mcp.json` / `mcp.json` 由 `mcp.enableProjectConfig` 控制。它还会读 Claude Code（`.claude.json`、`.claude/mcp.json`）、Codex（`config.toml` 的 `mcp_servers`）等别家的 MCP 配置。
- 未验证：会话内的 `/mcp add` 能否从会话外调用。

## 已定的决定（2026-10-12，维护者）

1. 改的是安装器：新增 Pi 和 omp 两个宿主。
2. Pi 的 skill 装到共用的 `.agents/skills`（与 Codex 同一个目录），不用 `~/.pi/agent/skills`。
3. omp 的 skill 也装到共用的 `.agents/skills`，不用 `~/.omp/agent/skills`；第三方 Skill 借这个目录装给 omp。
4. omp 不装 MCP：安装器里 omp 的 MCP 一律不支持。安装器不直接改写 omp 的配置文件。
5. 界面上显示为「Pi」和「omp」，排在 Claude Code、Codex 之后。
6. 以 `pi` / `omp` 命令是否在 PATH 判断宿主在不在；Pi 的 MCP 全局和项目都支持，走 `pi mcp add` / `pi mcp remove`。
7. 所选的宿主里有几个共用同一个 skill 目录时，同一个 skill（本仓库的和第三方的都是）只装一次，结果里合成一行，写明这几个宿主。
8. 所选的宿主里至少有一个是 Codex、Pi、omp 时，挑选的页面显示一句固定说明：这三个共用同一个 skill 文件夹，装给其中一个，另外两个也看得到。
9. omp 的 MCP 一栏显示现有的「不支持」；列表下方另加一句：安装器装不了 omp 的 MCP，请在 omp 里用 `/mcp add` 自己添加。只选了 omp 时所有 MCP 不可选，原因是同一句。
10. 写 ADR 0005（共用 skill 目录），词汇表加「共用 skill 目录」。已写。
11. 完成标准：代码、自动测试（用假的 `pi` / `omp` 命令）、`README.md` 与 `cli/README.md`、Node 22.13 上再跑一遍测试，由代理做；发布前在虚拟机里用真实的 Pi 和 omp 各走一遍、发布到 npm，由维护者做。版本号升到 0.5.0。

代理定下、维护者未反对的：

- 第三方 Skill 装给 omp 时，交给 skills CLI 的 agent 名借用 `pi`（两者落在同一个目录）。
- 不检查 Pi 的版本；没有 `pi mcp` 的旧版按这一项安装失败报告。
- 同时装给 Claude Code 和 omp 时 omp 读到两份同名 skill，不做处理。

## 补充事实（2026-10-12）

- `pi mcp add` 只写配置、不连接服务器（`docs/cli.md`），所以添加远程地址的 MCP 不会当场开浏览器；登录另用 `pi mcp login <server>`。Pi 不需要 `remoteMcpLogin` 那种提示。
- `pi mcp add` 遇到同名的是替换。`pi mcp remove` 不删已存的 OAuth 凭据。
- 目录里现有的 11 个 MCP 全是本地进程型的，名字都只含字母、数字和 `-`，符合 Pi 的命名要求。
