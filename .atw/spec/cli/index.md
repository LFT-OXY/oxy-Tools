# CLI 层开发规范

> 适用范围：`cli/` 下的安装器 `oxy-tools`（TypeScript，发布到 npm），以及它怎么读取和校验仓库根的两个目录文件。两个文件有哪些字段、格式版本号怎么升、对 A Team Workflow 的承诺，写在 skills 层的 [清单与版本](../skills/manifest-versioning.md)。

---

## Overview

`cli/` 是一个自成一体的 npm 包：交互式安装器，从目录里挑选条目装进宿主。为什么放在本仓库、要守哪三条规矩，见 [ADR-0001](../../../docs/adr/0001-installer-lives-in-skill-repo.md)；目录为什么运行时现拉，见 [ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)。

本层写的都是已经落地的做法：启动、读目录、主菜单、两个宿主与宿主选择、把 skill 装进宿主、skill 的状态探测与覆盖确认、MCP 的安装（含带 API key 的）、工具的安装、应用项目的浏览与打开链接、出错、界面设计、目录校验命令与 CI。

```
cli/
├── package.json          # 包描述文件只在这里，仓库根不放
├── README.md             # npm 页面上显示的那一份，中英各一段
├── LICENSE               # MIT，只管 cli/
├── src/
│   ├── bin.ts            # 把真实依赖接到入口上，别的什么都不做
│   ├── installer.ts      # 入口 runInstaller，也是测试的主接缝
│   ├── catalog.ts        # 目录：来源（含把 skill 的文件取下来）、读取、校验
│   ├── hosts.ts          # 宿主适配：每个宿主一份，回答在不在、skill 装到哪个目录、怎么拼添加和移除 MCP 的命令、去哪看 MCP 配没配过
│   ├── install-skill.ts  # 安装 skill：只认“条目 + 目标目录”
│   ├── skill-status.ts   # 状态探测：一个 skill 在某个 skill 目录下的现状，只看目标目录
│   ├── install-mcp.ts    # 安装 MCP：要执行哪几条宿主的命令，依次执行
│   ├── mcp-status.ts     # 状态探测：一个 MCP 在某个宿主下的现状，只读它的用户级配置
│   ├── install-tool.ts   # 安装工具：按系统选命令，执行后用条目声明的检查方式复核
│   ├── tool-status.ts    # 状态探测：一个工具装没装，只照检查方式看一眼
│   ├── run-command.ts    # 外部命令执行器的正式实现：不经 shell 的，和整行交给 shell 的
│   ├── flow.ts           # 交互流程：问什么、显示什么
│   ├── ui.ts             # 呈现层：一切终端输出的样式
│   ├── messages.ts       # 中英文案
│   ├── prompter.ts       # 提问器的接口
│   ├── inquirer-prompter.ts  # 提问器的正式实现（@inquirer）
│   ├── open-link.ts      # 链接打开器的正式实现：把网址交给系统的默认浏览器
│   ├── text.ts           # 显示宽度、截断、折行
│   └── version.ts        # 版本号：从 cli/package.json 读
├── test/                 # 只经入口断言的测试，和测试架子
└── scripts/              # 仅供开发的脚本，不进 dist/，不随 npm 包发布
    ├── preview.ts            # 界面预览页
    └── validate-catalog.ts   # 目录校验命令
```

---

## 自成一体的三条规矩

`cli/` 要能原样搬到独立的仓库去（ADR-0001），所以守三条，每条都有东西卡着：

| 规矩 | 现在靠什么守住 |
|------|----------------|
| **自带包描述文件，仓库根不放** | `package.json`、`package-lock.json`、`tsconfig*.json`、`vitest.config.ts`、`.gitignore`、`README.md`、`LICENSE` 都在 `cli/` 里；仓库里除了上游整包自带的，只有 `cli/package.json` 这一个包描述文件 |
| **只通过目录来源读数据，不引用 `cli/` 以外的文件** | 目录来源缺省是 GitHub 上本仓库 `main` 分支的原始文件地址（`catalog.ts` 的 `githubCatalogSource`）。本地目录只来自运行的人给的路径：环境变量 `OXY_TOOLS_CATALOG`、目录校验命令的参数——所以脚本和 `package.json` 里都不写死 `..`；测试用自己写到临时目录的样例，不读仓库真实的目录数据 |
| **构建和测试只扫 `cli/` 内部** | `vitest.config.ts` 的 `include` 只有 `test/**/*.test.ts`；`tsconfig.json` 的 `include` 只有 `src`、`test`、`scripts` 和 `vitest.config.ts`；CI 只检出 `cli/` 和仓库根的文件。`skills/` 下的上游整包自带测试和 `package.json`，不能被扫进来 |

随之而来的两条：

- **npm 包只含构建产物**：`package.json` 的 `files` 只有 `dist`，另有 npm 自动带上的 `package.json`、`README.md`、`LICENSE`。不含任何 skill 内容，不含目录数据，不含 `scripts/` 和 `test/`。在 `cli/` 下 `npm pack --dry-run` 能看到包里有什么。
- **依赖目录和构建产物不提交**：`cli/.gitignore` 挡着 `node_modules/`、`dist/`、`.preview/` 和 `npm pack` 打出来的 `*.tgz`。这同时是对 A Team Workflow 的承诺——它安装额外 skill 时下载的是整个仓库，见 [清单与版本](../skills/manifest-versioning.md)。

---

## 入口与两个测试接缝

安装器对外只有一个入口 `runInstaller(options)`，内部分五块（目录、宿主适配、安装、状态探测、交互流程），全部经入口被测到。入口接受**五样可替换的外部依赖**，正式运行时由 `bin.ts` 接上真实的实现，测试时全部替换：

| 依赖 | `options` 里的名字 | 正式实现 | 测试里 |
|------|--------------------|----------|--------|
| 目录来源 | `catalogSource` | `githubCatalogSource()` | 写到临时目录的本地样例；要测默认来源时用假的 GitHub |
| 用户主目录 | `homeDir` | `os.homedir()` | 临时目录 |
| 外部命令执行器 | `runCommand` | `systemCommandRunner()` | 只记录不执行，可预设结果 |
| 提问器 | `prompter` | `inquirerPrompter()` | 按预设的应答回答；要核对提问实际打出的东西时换成真实的交互库加脚本按键 |
| 链接打开器 | `openLink` | `systemLinkOpener(platform)` | 只记录 |

启动参数、环境变量、操作系统、输出流、放临时文件的目录和“提问之外按了 Ctrl+C”的信号也都从 `options` 来，入口不直接碰 `process`；它们是运行环境的事实，不算外部依赖。

测试只有两个接缝，只经由对外行为断言，不为内部模块单独写测试：

| 接缝 | 是什么 | 怎么用 |
|------|--------|--------|
| 主接缝 | 安装器入口 | `cli/test/harness.ts` 的 `run({ answers, catalog, home, onPath, … })`：给定一份目录、主目录的初始状态和一串应答，断言终端上输出了什么、退出状态、记录到的命令和链接、主目录里有什么。见 [入口与测试](./installer-entry.md) |
| 辅助接缝 | 目录校验命令 | `npm run validate-catalog -- <目录>`：测试把它当子进程跑，只断言标准输出、标准错误和退出状态；维护者和 CI 用同一条命令检查仓库里真实的目录数据。见 [目录校验与 CI](./catalog-validation.md) |

界面预览页也经主接缝驱动安装器，但它不是测试：观感由它加视觉评审把关，见 [界面设计](./ui-design.md)。

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [入口与测试](./installer-entry.md) | `runInstaller` 的签名与可替换依赖、链接打开器的契约、退出状态、目录读取与校验的契约（含应用项目条目的字段）、测试架子的用法 |
| [安装 skill](./skill-install.md) | 宿主适配与探测、装进哪些宿主、skill 的四种状态、覆盖与单独确认、钉住来源与按提交下载、临时目录与整体替换、安装标记、出错矩阵 |
| [安装 MCP](./mcp-install.md) | `catalog.json` 的 MCP 条目与校验（含环境变量）、两个宿主的命令写法与配置文件、三种状态加「不支持」、已配置与状态未知时怎么装、带 key 的 MCP 怎么问怎么传、key 的值不许去的地方、外部命令执行器的契约、Codex 添加远程地址时当场登录的提醒、出错矩阵 |
| [安装工具](./tool-install.md) | `catalog.json` 的工具条目与校验、安装命令是一整行 shell、按系统选命令、两种检查方式与两种状态、哪些条目不可选、成功与否只看复核的结论矩阵、外部命令执行器的 shell 模式与手动核对的办法、已知的限制 |
| [界面设计](./ui-design.md) | 画面该长什么样：视觉方向「账本」、版式的总规则、颜色与符号的含义、状态的写法、标题区、各类画面的版式要点、深浅色与不显示颜色和没有 Unicode 时的要求、界面预览页的生成命令和用法、还没经维护者确认的画法 |
| [终端输出](./terminal-output.md) | 呈现层的职责、上色与 Unicode 的判断、不可选的行（单选与多选，原因在行尾或在状态栏）、是否题、隐藏输入、带备注的表、将执行的命令与占位符、工具的执行分区与结论、应用项目的链接与打不开时的说法、标准输出与标准错误的分工、分区标题上方的空行、改写已打出的行、结果行与合计共用一份、界面预览页 |
| [目录校验与 CI](./catalog-validation.md) | 目录校验命令的输出与退出状态、被跳过条目的原因怎么记、命令的测试怎么写、工作流的触发与检出范围 |

---

## Pre-Development Checklist

- [ ] 要加或改任何行为 → [入口与测试](./installer-entry.md)：先在 `cli/test/` 写经入口的测试
- [ ] 要加或改任何画面的样子（颜色、符号、状态的词、间距、横线）→ [界面设计](./ui-design.md)：先改那份文档，再改实现，然后生成界面预览页对照
- [ ] 要往终端上打任何东西 → [终端输出](./terminal-output.md)：只能经呈现层
- [ ] 要动下载、落盘、宿主探测、状态探测、覆盖前问不问，加一个宿主，或加一种装不上的原因 → [安装 skill](./skill-install.md)
- [ ] 要加一种提问 → [终端输出](./terminal-output.md) 的「是否题」「隐藏输入」：先读交互库的源码，主题要盖全，按键提示和出错的句子要本地化
- [ ] 要碰用户输入的 key（问、记、传、报错）→ [安装 MCP](./mcp-install.md) 的「带 key 的 MCP」：值只进内存、命令参数和宿主的配置，不进呈现层、不进错误的原因、不进任何文件
- [ ] 要让列表里的某一行不可选 → [终端输出](./terminal-output.md) 的「不可选的行」
- [ ] 要执行任何外部命令，动 MCP 条目的字段、命令的拼法、看哪个配置文件，或给宿主加一条 MCP 的行为 → [安装 MCP](./mcp-install.md)：命令先完整展示、确认了才执行；展示的和执行的是同一份
- [ ] 要动工具条目的字段、安装命令的校验、按系统选命令、检查方式、成败怎么判，或外部命令执行器的 shell 模式 → [安装工具](./tool-install.md)：整行 shell 只许来自 `install` 字段，成败只看复核
- [ ] 要读 `cli/` 以外的文件、或在仓库根加包描述文件 → 不行，见上面「自成一体的三条规矩」和 ADR-0001
- [ ] 要改 `index.json` 或 `catalog.json` 的格式 → 先读 ADR-0002 和 [清单与版本](../skills/manifest-versioning.md)：字段契约、格式版本号的兼容规则、对 A Team Workflow 的三条承诺都在那里
- [ ] 要给目录加一类条目、一个字段或一条校验规则，或动 CI → [目录校验与 CI](./catalog-validation.md)：写坏的条目带着原因进 `skipped`
- [ ] 要把目录里的网址打到终端上或交给系统打开 → [入口与测试](./installer-entry.md) 的 `url` 规则和链接打开器的契约；[终端输出](./terminal-output.md) 的「应用项目」

---

## Quality Check

都在 `cli/` 下运行：

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | 类型检查（`src`、`test`、`scripts`），无输出即通过 |
| `npm test` | 全部测试（vitest），只扫 `cli/test/` |
| `npm run build` | 构建到 `dist/`（不提交） |
| `npm run preview` | 生成界面预览页 `cli/.preview/index.html`（不提交）；改了任何画面都要生成并看一遍 |
| `OXY_TOOLS_CATALOG=<仓库根> npm start` | 构建后在本机启动，读本地的目录数据 |
| `npm run validate-catalog -- ..` | 用安装器自己的校验逻辑检查仓库根的 `index.json` 和 `catalog.json`；改了这两个文件或校验规则都要跑 |
| `npm pack --dry-run` | 列出 npm 包里会有哪些文件，不生成文件；动了 `package.json` 的 `files`、`README.md`、`LICENSE` 时看一眼 |

推送后 CI（`.github/workflows/cli.yml`）在 macOS、Linux、Windows 上各用 Node 22.13 和 24 跑全部测试，另跑类型检查和目录校验。

包声明支持 Node 22.13 及以上的 22.x 或 23.5 及以上。行为与 Node 版本有关的改动（样式码、流）要在 22.13 上再跑一遍测试。

### 发布前在本机核对

自动化测试不碰真实的宿主命令、真实的终端和打出来的包。发 npm 版本之前照下面走一遍（工单 12 用过的做法）；都在临时目录里做，不动真实的主目录和宿主配置。

| 核对什么 | 怎么做 |
|----------|--------|
| 包里有什么、装出来能不能跑 | `npm pack --pack-destination <临时目录>`，在一个临时项目里 `npm install <那个 .tgz>`，再 `npx --no-install oxy-tools --version`、`--help` |
| 没有交互式终端 | `npx --no-install oxy-tools </dev/null \| cat`：说明在标准错误，退出状态 1 |
| 目录格式版本过高 | 伪终端里 `OXY_TOOLS_CATALOG=<version 写成 99 的样例目录> node dist/bin.js` |
| 断网 | 伪终端里 `sandbox-exec -p '(version 1)(allow default)(deny network*)' node dist/bin.js`（macOS），走的是缺省的 GitHub 目录来源 |
| skill、MCP、工具的整条流程 | 伪终端里跑 `node dist/bin.js`，事先 `export HOME=<临时目录> CLAUDE_CONFIG_DIR=<临时目录> CODEX_HOME=<临时目录> OXY_TOOLS_CATALOG=<样例目录>`，脚本开头断言这几个都指向临时目录。执行的是真实的 `claude`、`codex`，写的是临时配置；完了查临时配置里有那几条、终端的原始输出里搜不到填的 key、真实配置里没有样例的名字 |
| 不显示颜色 | 同上再加 `NO_COLOR=1`：原始输出里一个样式码（`ESC[…m`）都没有 |
| 深色与浅色的真实终端 | 在终端程序里各用一套深色、一套浅色的配色跑同一条流程，看每个画面；观感的结论记进 [界面设计](./ui-design.md) |

样例目录要自己写（一个 skill 的真实内容，加几条 MCP、工具、应用项目），名字取成不会和机器上已有的 MCP 撞车的（如 `oxy-sample-*`）——安装器遇到同名的会先移除。伪终端可以用 `expect`，或 Python 的 `pty` 写个按步骤发按键的小脚本；要把录下的原始输出还原成画面，交给 `@xterm/headless`。
