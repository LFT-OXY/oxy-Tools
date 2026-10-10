# 03 — 录入「汇总」文档里的 MCP 条目

**What to build:** 「汇总」文档里标了 MCP 的 21 个条目进目录。装法实际试通过的登记为 MCP——现有用户在安装器的 MCP 分组里马上就能看到并装上；没试通的登记为外部项目，只给说明和链接。

**Blocked by:** 02
**Status:** ready-for-agent
**Impl:** done

- [x] 范围是 `research/outline-entries.md` 里标签含 `MCP` 的全部条目，包括同时标了 `工具` 的 Graft、code-review-graph、FastCode、Headroom。每个条目在目录里恰好一条。
- [x] 每条的连接方式只取它官方说明里给出的（本地进程的启动命令，或远程地址）；要向用户要的环境变量逐个写明是否必填、是什么、去哪申请。
- [x] 「试通」的标准：经安装器、用真实的宿主命令、在临时配置目录里装一次，两个宿主的配置里都出现这一条。做法照 CLI 层规范「发布前在本机核对」：主目录和两个宿主的配置目录都指到临时目录并在脚本开头断言，真实的配置不变。
- [x] 需要 key 而手头没有的：配置写得进去就算试通，说明里注明没有带 key 验证过。
- [x] 启动方式写不进现有条目格式的（参数带空格或引号、要先克隆再构建、要 docker 部署、只支持一个宿主之外的做法等），登记为外部项目，并在试通记录里写明原因。
- [x] 同时标了 MCP 和工具的四个，只登记主要用法那一种。
- [x] 每条有一个用途（它在文档里所在的大标题）、中英文各一句说明（写「它做什么」，句末不加句号）、官方链接。名字是小写 kebab-case。
- [x] 不给任何条目加推荐标记。
- [x] 试通记录写进任务目录的 `research/`：每条用了什么连接方式、在哪个宿主下试的、结果如何、没试通的原因。
- [x] 目录校验命令对仓库真实的目录数据通过。

## Comments

**2026-10-10 实现记录**

- 21 个条目：11 个登记为 MCP（`acemcp`、`code-review-graph`、`memorix`、`context7`、`firecrawl-mcp`、`grok-search`、`chrome-devtools`、`playwright`、`shadcn-ui`、`excel`、`word-document-server`），10 个登记为外部项目（`cunzhi`、`codebase-memory-mcp`、`graft`、`ace-tool`、`ace-tool-rs`、`codegraph`、`fastcode`、`context-mode`、`headroom`、`grok-search-rs`）。逐条的连接方式、出处、试通结果和没登记成 MCP 的原因在 `research/mcp-trial-record.md`。
- 同时标了 MCP 和工具的四个：`code-review-graph` 登记为 MCP；`graft`、`fastcode`、`headroom` 的主要用法是工具，工具要在虚拟机里试，先作为外部项目。
- 试通：伪终端里跑 `node dist/bin.js`，真实的 `claude` 2.1.295、`codex` 0.162.0，`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 都在 `mktemp -d` 的目录下。22 条命令都成功，两个宿主的临时配置里各 11 条，与目录逐条一致；真实配置里 MCP 那一段的哈希前后相同。**没有启动过任何一个 MCP 服务器，没有带真的 key 验证过任何一条。**
- 工单没有规定、实现时定下的：MCP 条目的名字用官方说明里的服务器名而不是仓库名（例外是 `shadcn-ui`）；用 `uvx` 启动的在说明里注「需要 uv」；环境变量只登记必填的和最常用的可选项。`playwright` 这个名字会和工单 04 要录入的开发库 playwright 同名（不同的数组，校验不拦），工单 04 录入时要留意。
- 工单写「说明里注明没有带 key 验证过」：`acemcp`、`firecrawl-mcp`、`grok-search` 三条（要有 key 或服务地址才能用）在目录的说明里注了；`context7`、`shadcn-ui` 的 key 是可选的，只在试通记录里注了。
- 环境变量的「去哪申请」：`ACEMCP_*`、`GROK_API_URL`、`GROK_API_KEY` 的官方说明没有给申请的地方，写的是它说明这个变量的 README；`TAVILY_API_KEY` 写的是 Tavily 的官网首页。
- 已发布的 0.2.0 读新目录：`目录  12 skill · 11 MCP · 10 应用项目`，主菜单 `Skill 12`、`MCP 11`、`应用项目 10`、`退出`，进 MCP 后照常列出 11 条；没有出错说明。只看了画面。
- 没有改代码。类型检查通过；全部测试 643 条在 Node 24.15 上通过（这次只改了数据，测试不读仓库真实的目录，没有在 22.13 上再跑）；`npm run validate-catalog -- ..` 输出 `目录校验通过：12 个 skill、11 个 MCP、0 个工具、10 个应用项目、10 个用途`。
- 评审之后改的：三条说明补了「没有带 key 验证过」、`excel` 的说明补了「不限定文件夹」；试通从「脚本直接调入口」改成规范写的伪终端跑法重做了一遍；规范里两处过时的条数。评审留下没改的判断题见试通记录的「这几条的界线是实现时划的」。
