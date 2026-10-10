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
- 机器上已经装有宿主——Claude Code 或 Codex，界面里称作 AI Agent。安装器不代装宿主；一个都没检测到时只能浏览应用项目。

### 它做什么

目录每次运行时从 GitHub 上的 oxy-Tools 仓库现拉，按四个分组列出：

| 分组 | 选中之后 |
|------|----------|
| Skill | 下载到宿主的用户级 skill 目录：Claude Code 是 `~/.claude/skills`，Codex 是 `~/.agents/skills`。列表里看得到每个 skill 装没装、装的是哪个版本 |
| MCP | 调用宿主自己的命令（`claude mcp add --scope user …`、`codex mcp add …`）写进它的用户级配置。需要 API key 的会给出申请地址，输入不回显 |
| 工具 | 执行它的官方安装命令，输出实时可见；结束后复核它是否真的可用 |
| 应用项目 | 安装器装不了、只给链接的条目（比如要用 docker 部署的框架）：显示说明，并在默认浏览器里打开官方链接 |

几条可以放心的事：

- **任何命令执行前都完整展示出来，等你确认。**
- API key 只作为参数交给宿主的添加命令，最后只留在宿主自己的配置里；安装器不保存、不打印，汇总里显示的是占位符。
- 已装的 skill 再装一次，就是把它的文件夹整个替换成目录里当前的版本，文件夹里的本地改动会丢失；同名的文件夹不是本工具装的（包括符号链接），覆盖前会单独再问，默认不覆盖。
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
npm run preview                         # 生成界面预览页 .preview/index.html
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
- a host already installed: Claude Code or Codex, shown as "AI Agent" in the interface. The installer does not install hosts; with none detected, only apps can be browsed.

### What it does

The catalog is fetched from the oxy-Tools repository on GitHub on every run and listed in four groups:

| Group | When picked |
|-------|-------------|
| Skill | Downloaded into the host's user-level skills directory: `~/.claude/skills` for Claude Code, `~/.agents/skills` for Codex. The list shows whether each skill is installed, and which version |
| MCP | Written into the host's user-level config through the host's own command (`claude mcp add --scope user …`, `codex mcp add …`). When an API key is needed, the installer shows where to get one and hides what you type |
| Tools | Its official install command is run with live output, then the installer checks that the tool is really available |
| Apps | Entries the installer cannot install and only links to (a framework deployed with docker, say): it shows the description and opens the official link in your default browser |

What you can rely on:

- **Every command is shown in full and waits for your confirmation before it runs.**
- API keys are only passed as arguments to the host's add command and end up in the host's own config; the installer neither stores nor prints them, and summaries show placeholders.
- Installing a skill again replaces its whole directory with the catalog version, so local edits inside it are lost. A same-named directory that this tool did not install (symlinks included) is asked about separately, and the default is not to overwrite.
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
npm run preview                         # generate the interface preview page .preview/index.html
```

### License

[MIT](./LICENSE). It covers the installer only; each skill in the catalog keeps its own license, as described in the oxy-Tools repository.
