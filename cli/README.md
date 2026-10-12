# oxy-tools

策展式 AI 工具链安装器：从 [oxy-Tools](https://github.com/LFT-OXY/oxy-Tools) 的目录里挑选 skill、MCP 和工具，装进 Claude Code 或 Codex。

Curated AI toolchain installer: pick skills, MCP servers and tools from the [oxy-Tools](https://github.com/LFT-OXY/oxy-Tools) catalog and install them into Claude Code or Codex.

[中文](#中文) · [English](#english)

## 中文

### 使用

```bash
npx oxy-tools
```

它在本机起一个网页，并用默认浏览器打开：挑选、看汇总、确认、看安装进度和结果，都在这一页里（**网页界面**）。打不开浏览器的机器上，它自动改用终端里的菜单（**终端界面**）。两套界面装的东西、装的方式完全一样，见下面「两套界面」。

需要：

- Node.js 22.13 及以上的 22.x，或 23.5 及以上；
- 一个交互式终端：安装器从终端启动，工具的安装命令也在终端里跑；在脚本或管道里不运行；
- 用网页界面的话，这台机器上要有能打开的浏览器（没有就用终端界面）；
- 机器上已经装有宿主——Claude Code 或 Codex，界面里称作 AI Agent。安装器不代装宿主；一个都没检测到时只能看外部项目的说明与链接；
- 要装第三方 Skill 的话，机器上还要有 `npx`（随 Node.js 自带）和 `git`。

### 两套界面

| | 网页界面 | 终端界面 |
|---|----------|----------|
| 什么时候用 | 缺省 | 带了 `--terminal`；或安装器认出打不开浏览器——经 SSH 远程连接、Linux 上没有桌面（`DISPLAY` 和 `WAYLAND_DISPLAY` 都没设）；或浏览器打不开、本机的网页起不来（终端上会说明一句原因） |
| 怎么挑 | 一页到底：用途、条目、装进哪些 AI Agent、装到哪里同时在页面上，可以跨用途一起挑，一次确认、一次装完 | 主菜单上选一个用途进去，勾选、确认、装完，再回主菜单 |
| 条目的说明 | 完整显示；外部项目的链接可以直接点 | 一行放不下时截断，光标移到那一行看全文 |

用网页界面时：

- **这个网页只有这台机器访问得到**：它只监听本机的回环地址（`127.0.0.1`），端口随机，网址里带着这次运行才有效的口令。同一个网络里的别的机器打不开它，你浏览器里开着的别的网站也指挥不了它。页面不向互联网发任何请求。
- 终端上留着它的网址：浏览器没有弹出来时，把网址复制到这台机器的浏览器里打开。
- 网页界面开着、没有在安装的时候，在终端里按 `t` 就改用终端界面（页面上的勾选不带过去）。
- **工具的安装命令在终端里跑**（它可能要你输密码）：轮到它时页面会写明请看终端。
- 页面上点「完成」，安装器退出；直接关掉页面，它过几秒也自己退出。安装途中关掉页面，这一批照样装完，结果打在终端里。在终端按 Ctrl+C 随时退出。
- 页面先按系统语言显示，页面上可以切换中文和 English。

### 它做什么

目录每次运行时从 GitHub 上的 oxy-Tools 仓库现拉。条目**按用途找**：最前面是「推荐」（维护者放进 oxy-Tools 仓库的 skill），下面是各个用途（联网搜索与文档检索、文档处理……），各写着条目数。一个用途下的条目在同一张列表里按类型分开，可以一次勾选几种、一起装：

| 类型 | 选中之后 |
|------|----------|
| Skill | 下载到宿主的 skill 目录。列表里看得到每个 skill 装没装、装的是哪个版本 |
| 第三方 Skill | 内容留在作者自己的仓库里，**直接来自作者：装上的是作者当时的最新版，维护者没有逐版检查**。安装器在后台调用 `npx skills add`（Vercel 的 skills CLI）把它装进宿主的 skill 目录，调用时关掉它的遥测；一个仓库里有多个 skill 时先列出来让你勾选 |
| MCP | 调用宿主自己的命令（`claude mcp add …`、`codex mcp add …`）写进它的配置。需要 API key 的会给出申请地址，输入不回显 |
| 工具 | 执行它的官方安装命令，输出实时可见；结束后复核它是否真的可用 |
| 外部项目 | 安装器装不了、只给链接的条目（要自行部署的应用、开发库、资源合集）。网页界面里它们不能勾选，说明和链接直接看得到、点得开；终端界面里勾了之后在这一轮的最后列出说明和链接，不替你打开浏览器 |

Skill 和 MCP 可以选**装到哪里**，缺省是全局（网页界面里是页面顶上的一个选项，终端界面里每进一个用途问一次）：

| 装到哪里 | Skill 和第三方 Skill | MCP |
|----------|----------------------|-----|
| 全局：对这台机器上的所有项目生效 | Claude Code 是 `~/.claude/skills`，Codex 是 `~/.agents/skills` | 宿主的用户级配置 |
| 项目：只对运行安装器时所在的目录生效 | 当前目录下的 `.claude/skills`、`.agents/skills` | Claude Code 写进当前目录的 `.mcp.json`，要在这个目录下启动 `claude` 时批准才启用；Codex 的 MCP 只能装到全局 |

工具没有这个选择，装法与装到哪里无关。

几条可以放心的事：

- **开始安装之前先给你看汇总，等你确认**：要装哪些、各装进哪个 AI Agent、装到什么位置、是新装还是覆盖。终端界面另把将要执行的每一条命令完整列出来；网页界面不列命令，执行的是同一批。
- API key 只作为参数交给宿主的添加命令，最后只留在宿主自己的配置里；安装器不保存、不打印。网页界面里填 key 的输入框不显示内容，key 不进网址、不留在页面上；终端界面里输入不回显，列出的命令里显示的是占位符。
- 已装的 skill 再装一次，就是把它的文件夹整个替换成目录里当前的版本，文件夹里的本地改动会丢失；同名的文件夹不是本工具装的（包括符号链接），覆盖前要你单独同意，默认不覆盖（网页界面里是在汇总上逐项勾「覆盖它」，终端界面里是确认之后逐项再问）。
- 第三方 Skill 的目标位置已经有同名的文件夹时同样要你单独同意，默认不覆盖。
- 把带 API key 的 MCP 装到项目时，key 会以明文写进当前目录的 `.mcp.json`；确认之前会提醒，不要把这个文件提交或发给别人。
- 一次装多项时，某一项失败不影响其余，结果逐项列出。

### 选项

| 参数 | 作用 |
|------|------|
| `--lang <zh\|en>` | 界面语言。缺省时网页界面跟随系统语言（页面上可以切换），终端界面启动后询问 |
| `--terminal` | 用终端界面，不打开浏览器 |
| `-h`, `--help` | 显示帮助 |
| `-v`, `--version` | 显示版本号 |

### 环境变量

| 变量 | 作用 |
|------|------|
| `OXY_TOOLS_CATALOG` | 改从这个本地目录读取目录数据（其中要有 `index.json` 和 `catalog.json`） |
| `GITHUB_TOKEN` | 查询 skill 文件时带上的 GitHub 访问令牌，被限流时设置 |
| `NO_COLOR` | 不输出颜色 |

### 开发

源码在 oxy-Tools 仓库的 [`cli/`](https://github.com/LFT-OXY/oxy-Tools/tree/main/cli) 目录，以下命令都在该目录下运行：

```bash
npm ci
npm test                                # 全部测试
npm run typecheck                       # 类型检查
OXY_TOOLS_CATALOG=.. npm start          # 构建后启动，读仓库里本地的目录数据
npm run validate-catalog -- ..          # 校验仓库根的 index.json 和 catalog.json
npm run check-upstream -- ..            # 核对目录里的第三方 Skill 和作者仓库还对不对得上（要联网）
npm run preview                         # 生成界面预览页 .preview/index.html
npm run preview:web                     # 生成网页界面的预览 .preview/web/index.html（要本机装着 Chrome）
```

### 许可证

[MIT](./LICENSE)。它只管安装器本身；目录里的各个 skill 沿用各自的许可证，见 oxy-Tools 仓库的说明。

## English

### Usage

```bash
npx oxy-tools
```

It starts a web page on this machine and opens it in your default browser: picking, reviewing the summary, confirming, and watching progress and results all happen on that one page (the **web UI**). On a machine that cannot open a browser it falls back to menus in the terminal (the **terminal UI**) on its own. Both install the same things in the same way; see "Two interfaces" below.

Requirements:

- Node.js 22.13 or later on the 22.x line, or 23.5 or later;
- an interactive terminal: the installer is started from one, and tool install commands run in it; it will not run in a script or a pipe;
- for the web UI, a browser that can be opened on this machine (without one, the terminal UI is used);
- a host already installed: Claude Code or Codex, shown as "AI Agent" in the interface. The installer does not install hosts; with none detected, you can only read the descriptions and links of external projects;
- for third-party skills, `npx` (it ships with Node.js) and `git` on the machine as well.

### Two interfaces

| | Web UI | Terminal UI |
|---|--------|-------------|
| When it is used | By default | With `--terminal`; or when the installer can tell no browser can be opened: over an SSH connection, or on Linux without a desktop (neither `DISPLAY` nor `WAYLAND_DISPLAY` is set); or when the browser fails to open or the local page fails to start (the terminal says why in one line) |
| How you pick | One page: purposes, entries, which AI Agents to install into and where to install are all on screen; pick across purposes, confirm once, install once | Pick a purpose from the main menu, select, confirm, install, then return to the main menu |
| Entry descriptions | Shown in full; links of external projects are clickable | Cut when a line is too short; move the cursor to a row to read it in full |

With the web UI:

- **Only this machine can reach the page**: it listens on the loopback address (`127.0.0.1`) only, on a random port, and its address carries a token that is valid for this run alone. Other machines on the same network cannot open it, and other websites open in your browser cannot drive it. The page sends no requests to the internet.
- The terminal keeps showing its address: if no browser pops up, copy the address into a browser on this machine.
- While the web UI is open and nothing is being installed, press `t` in the terminal to switch to the terminal UI (selections made on the page are not carried over).
- **Tool install commands run in the terminal** (they may ask for your password): when it is a tool's turn, the page tells you to watch the terminal.
- Clicking "Done" on the page quits the installer; simply closing the page makes it quit by itself a few seconds later. If you close the page during an install, that batch still finishes and its results are printed in the terminal. Ctrl+C in the terminal quits at any time.
- The page starts in your system language and can be switched between 中文 and English on the page.

### What it does

The catalog is fetched from the oxy-Tools repository on GitHub on every run. Entries are **found by purpose**: "Recommended" comes first (the skills the maintainer keeps in the oxy-Tools repository), followed by the purposes (web search & docs retrieval, document processing, …), each with its entry count. Every entry under a purpose is in one list, sectioned by type, and you can pick several types at once and install them together:

| Type | When picked |
|------|-------------|
| Skill | Downloaded into the host's skills directory. The list shows whether each skill is installed, and which version |
| Third-party skill | Its content stays in the author's own repository and **comes straight from the author: you get the author's latest version at that moment, and the maintainer has not reviewed each version**. The installer runs `npx skills add` (Vercel's skills CLI) in the background, with its telemetry turned off, to put it into the host's skills directory; when a repository holds several skills, it lists them for you to pick first |
| MCP | Written into the host's config through the host's own command (`claude mcp add …`, `codex mcp add …`). When an API key is needed, the installer shows where to get one and hides what you type |
| Tool | Its official install command is run with live output, then the installer checks that the tool is really available |
| External project | Entries the installer cannot install and only links to (apps you deploy yourself, libraries, resource collections). In the web UI they cannot be selected; their descriptions and links are right there to read and click. In the terminal UI, the ones you select are listed with descriptions and links at the end of the round, and no browser is opened for you |

For skills and MCP servers you choose **where to install**, global by default (an option at the top of the page in the web UI; asked each time you enter a purpose in the terminal UI):

| Where | Skills and third-party skills | MCP |
|-------|-------------------------------|-----|
| Global: applies to every project on this machine | `~/.claude/skills` for Claude Code, `~/.agents/skills` for Codex | The host's user-level config |
| Project: applies only to the directory the installer was run from | `.claude/skills` and `.agents/skills` under the current directory | Claude Code saves them to `.mcp.json` in the current directory and enables them only once you approve when starting `claude` there; Codex MCP servers can only be installed globally |

Tools have no such choice; how they are installed does not depend on it.

What you can rely on:

- **Before anything is installed you get a summary and are asked to confirm**: what will be installed, into which AI Agent, at what location, and whether it is new or an overwrite. The terminal UI also lists every command it is about to run, in full; the web UI does not list commands, and runs the same ones.
- API keys are only passed as arguments to the host's add command and end up in the host's own config; the installer neither stores nor prints them. In the web UI the key field hides what you type, and keys never go into the address or stay on the page; in the terminal UI your input is hidden and the listed commands show placeholders.
- Installing a skill again replaces its whole directory with the catalog version, so local edits inside it are lost. A same-named directory that this tool did not install (symlinks included) needs your separate consent, and the default is not to overwrite (in the web UI you tick "Overwrite it" per item on the summary; in the terminal UI you are asked per item after confirming).
- A same-named directory already at a third-party skill's target needs your separate consent too, and the default is not to overwrite.
- When an MCP server with an API key is installed into a project, the key is stored in plain text in `.mcp.json` in the current directory; you are warned before confirming, so do not commit or share that file.
- When several items are installed at once, one failure does not stop the rest; results are listed item by item.

### Options

| Flag | Effect |
|------|--------|
| `--lang <zh\|en>` | Interface language. When omitted, the web UI follows the system language (switchable on the page) and the terminal UI asks at startup |
| `--terminal` | Use the terminal UI; do not open a browser |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version number |

### Environment

| Variable | Effect |
|----------|--------|
| `OXY_TOOLS_CATALOG` | Read the catalog from this local directory instead (it must hold `index.json` and `catalog.json`) |
| `GITHUB_TOKEN` | GitHub access token sent when looking up skill files; set it when rate limited |
| `NO_COLOR` | Disable colors |

### Development

The source lives in the [`cli/`](https://github.com/LFT-OXY/oxy-Tools/tree/main/cli) directory of the oxy-Tools repository. Run these from that directory:

```bash
npm ci
npm test                                # all tests
npm run typecheck                       # type check
OXY_TOOLS_CATALOG=.. npm start          # build, then start against the local catalog
npm run validate-catalog -- ..          # validate index.json and catalog.json at the repo root
npm run check-upstream -- ..            # check the catalog's third-party skills against their upstream repositories (needs network)
npm run preview                         # generate the interface preview page .preview/index.html
npm run preview:web                     # generate the web UI preview .preview/web/index.html (needs Chrome installed)
```

### License

[MIT](./LICENSE). It covers the installer only; each skill in the catalog keeps its own license, as described in the oxy-Tools repository.
