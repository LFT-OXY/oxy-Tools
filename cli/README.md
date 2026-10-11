# oxy-tools

策展式 AI 工具链安装器：从 [oxy-Tools](https://github.com/LFT-OXY/oxy-Tools) 的目录里挑选 skill、MCP 和工具，装进 Claude Code 或 Codex。

Curated AI toolchain installer: pick skills, MCP servers and tools from the [oxy-Tools](https://github.com/LFT-OXY/oxy-Tools) catalog and install them into Claude Code or Codex.

[中文](#中文) · [English](#english)

## 中文

### 使用

```bash
npx oxy-tools
```

需要：

- Node.js 22.13 及以上的 22.x，或 23.5 及以上；
- 一个交互式终端（它靠菜单操作，在脚本或管道里不运行）；
- 机器上已经装有宿主——Claude Code 或 Codex，界面里称作 AI Agent。安装器不代装宿主；一个都没检测到时只能看外部项目的说明与链接；
- 要装第三方 Skill 的话，机器上还要有 `npx`（随 Node.js 自带）和 `git`。

### 它做什么

目录每次运行时从 GitHub 上的 oxy-Tools 仓库现拉。主菜单**按用途进入**：第一行是「推荐」（维护者放进 oxy-Tools 仓库的 skill），下面是各个用途（联网搜索与文档检索、文档处理……），每行写着条目数。进入之后，这个用途下的条目在同一张列表里按类型分段，可以一次勾选几种、一起装：

| 类型 | 选中之后 |
|------|----------|
| Skill | 下载到宿主的 skill 目录。列表里看得到每个 skill 装没装、装的是哪个版本 |
| 第三方 Skill | 内容留在作者自己的仓库里，**直接来自作者：装上的是作者当时的最新版，维护者没有逐版检查**。安装器在后台调用 `npx skills add`（Vercel 的 skills CLI）把它装进宿主的 skill 目录，调用时关掉它的遥测；一个仓库里有多个 skill 时先列出来让你勾选 |
| MCP | 调用宿主自己的命令（`claude mcp add …`、`codex mcp add …`）写进它的配置。需要 API key 的会给出申请地址，输入不回显 |
| 工具 | 执行它的官方安装命令，输出实时可见；结束后复核它是否真的可用 |
| 外部项目 | 安装器装不了、只给链接的条目（要自行部署的应用、开发库、资源合集）：在这一轮的最后列出说明和链接，不替你打开浏览器 |

装 Skill 和 MCP 之前会问**装到哪里**，缺省是全局：

| 装到哪里 | Skill 和第三方 Skill | MCP |
|----------|----------------------|-----|
| 全局：对这台机器上的所有项目生效 | Claude Code 是 `~/.claude/skills`，Codex 是 `~/.agents/skills` | 宿主的用户级配置 |
| 项目：只对运行安装器时所在的目录生效 | 当前目录下的 `.claude/skills`、`.agents/skills` | Claude Code 写进当前目录的 `.mcp.json`，要在这个目录下启动 `claude` 时批准才启用；Codex 的 MCP 只能装到全局 |

工具没有这个选择，装法与装到哪里无关。

几条可以放心的事：

- **任何命令执行前都完整展示出来，等你确认。**
- API key 只作为参数交给宿主的添加命令，最后只留在宿主自己的配置里；安装器不保存、不打印，汇总里显示的是占位符。
- 已装的 skill 再装一次，就是把它的文件夹整个替换成目录里当前的版本，文件夹里的本地改动会丢失；同名的文件夹不是本工具装的（包括符号链接），覆盖前会单独再问，默认不覆盖。
- 第三方 Skill 的目标位置已经有同名的文件夹时同样先问，默认不覆盖。
- 把带 API key 的 MCP 装到项目时，key 会以明文写进当前目录的 `.mcp.json`；确认之前会提醒，不要把这个文件提交或发给别人。
- 一次装多项时，某一项失败不影响其余，结果逐项列出。

### 选项

| 参数 | 作用 |
|------|------|
| `--lang <zh\|en>` | 界面语言；缺省时启动后询问 |
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

Requirements:

- Node.js 22.13 or later on the 22.x line, or 23.5 or later;
- an interactive terminal (it is menu-driven and will not run in a script or a pipe);
- a host already installed: Claude Code or Codex, shown as "AI Agent" in the interface. The installer does not install hosts; with none detected, you can only read the descriptions and links of external projects;
- for third-party skills, `npx` (it ships with Node.js) and `git` on the machine as well.

### What it does

The catalog is fetched from the oxy-Tools repository on GitHub on every run. The main menu is **entered by purpose**: the first row is "Recommended" (the skills the maintainer keeps in the oxy-Tools repository), followed by the purposes (web search & docs retrieval, document processing, …), each with its entry count. Inside, every entry under that purpose is in one list, sectioned by type, and you can pick several types at once and install them together:

| Type | When picked |
|------|-------------|
| Skill | Downloaded into the host's skills directory. The list shows whether each skill is installed, and which version |
| Third-party skill | Its content stays in the author's own repository and **comes straight from the author: you get the author's latest version at that moment, and the maintainer has not reviewed each version**. The installer runs `npx skills add` (Vercel's skills CLI) in the background, with its telemetry turned off, to put it into the host's skills directory; when a repository holds several skills, it lists them for you to pick first |
| MCP | Written into the host's config through the host's own command (`claude mcp add …`, `codex mcp add …`). When an API key is needed, the installer shows where to get one and hides what you type |
| Tool | Its official install command is run with live output, then the installer checks that the tool is really available |
| External project | Entries the installer cannot install and only links to (apps you deploy yourself, libraries, resource collections): descriptions and links are listed at the end of the round, and no browser is opened for you |

Before installing skills and MCP servers it asks **where to install**, global by default:

| Where | Skills and third-party skills | MCP |
|-------|-------------------------------|-----|
| Global: applies to every project on this machine | `~/.claude/skills` for Claude Code, `~/.agents/skills` for Codex | The host's user-level config |
| Project: applies only to the directory the installer was run from | `.claude/skills` and `.agents/skills` under the current directory | Claude Code saves them to `.mcp.json` in the current directory and enables them only once you approve when starting `claude` there; Codex MCP servers can only be installed globally |

Tools have no such choice; how they are installed does not depend on it.

What you can rely on:

- **Every command is shown in full and waits for your confirmation before it runs.**
- API keys are only passed as arguments to the host's add command and end up in the host's own config; the installer neither stores nor prints them, and summaries show placeholders.
- Installing a skill again replaces its whole directory with the catalog version, so local edits inside it are lost. A same-named directory that this tool did not install (symlinks included) is asked about separately, and the default is not to overwrite.
- A same-named directory already at a third-party skill's target is asked about too, and the default is not to overwrite.
- When an MCP server with an API key is installed into a project, the key is stored in plain text in `.mcp.json` in the current directory; you are warned before confirming, so do not commit or share that file.
- When several items are installed at once, one failure does not stop the rest; results are listed item by item.

### Options

| Flag | Effect |
|------|--------|
| `--lang <zh\|en>` | Interface language; asked at startup when omitted |
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
