# 待收录 skill 的可安装性分析

> 2026-10-10。对象是维护者整理的目录 `/Users/oxy/Downloads/oxytools收录`（20 个上游仓库的克隆，另有一个 `旧/`）。
> 方法：只读。看了每个仓库的顶层结构、`SKILL.md` 的 frontmatter 与依赖线索、README 的安装一节、插件与 hooks 文件。**没有实际安装或运行任何一个**，下面的「能用」都是从文件读出来的判断。

## 安装器这一侧的事实

- 安装 skill = 把 `index.json` 里 `path` 指向的目录整个取到宿主的 skills 目录，取下来的目录根必须有 `SKILL.md`（`cli/src/install-skill.ts`）。不执行任何安装命令，不装依赖。
- 下载方式（`.atw/spec/cli/skill-install.md`）：先用 `git/trees/<提交>?recursive=1` 列出**整个仓库**的文件树，`truncated` 为真就**不安装任何 skill**；然后逐个文件从 raw.githubusercontent.com 下，最多 6 个同时，一个失败整项失败。
- 仓库现有 1215 个文件、约 230M。
- skill 目录名、`index.json` 的 `name`、`SKILL.md` 的 `name` 三处要一致（`.atw/spec/skills/directory-structure.md`）。
- GitHub 文件树接口的截断阈值（凭记忆：10 万条或 7MB）**未重新核对**，动手前要查官方文档。

## 逐仓库结论

来源提交是克隆目录里 `git rev-parse --short HEAD` 的结果。

### 复制即可用（纯说明文字）

| 仓库 @ 提交 | skill | 备注 |
|---|---|---|
| op7418/Humanizer-zh @ f4518a8 | `humanizer-zh` | 仓库根即 skill。目录名与 name 不一致 |
| AIScientists-Dev/academic-humanizer @ 94b88b2 | `academic-humanizer` | 仓库根即 skill |
| multica-ai/andrej-karpathy-skills @ 2c60614 | `karpathy-guidelines` | 在 `skills/karpathy-guidelines/`，只有一个 `SKILL.md`。无 LICENSE 文件（frontmatter 写 MIT） |
| emilkowalski/skills @ e8a175d | 14 个：animate、animate-expo、animation-vocabulary、apple-design、ask-sonner、break-ui、emil-design-eng、find-animation-opportunities、improve-animations、mobile-native、pick-ui-library、prototype、review-animations、write-swift | 都在 `skills/<name>/`，没有跨目录引用 |
| Leonxlnx/taste-skill @ 717446e | 13 个，目录名与 name 多数不一致（如 `brutalist-skill` → `industrial-brutalist-ui`） | 各只有 `SKILL.md`（`stitch-skill` 多一个 `DESIGN.md`）。`imagegen-*` 两个和 `brandkit` 只看了名字，未细读是否需要生图能力 |
| Nutlope/hallmark @ 13ac0ec | `hallmark` | 在 `skills/hallmark/`。有 7 处链接指向 skill 目录以外（`site/css/tokens.css`、`docs/recipes.md` 等），只取 skill 目录时这些链接断 |

### 复制可用，但少了插件才有的自动触发

| 仓库 @ 提交 | skill | 少了什么 |
|---|---|---|
| ayghri/i-have-adhd @ 723af7d | `i-have-adhd` | `disable-model-invocation: true`，要用户手动调用；「常开」靠 SessionStart hook，复制不带 |
| DietrichGebert/ponytail @ 9b58c1f | 6 个：ponytail、ponytail-audit、-debt、-gain、-help、-review | 每次会话自动生效、状态栏靠 hooks；`commands/` 是插件命令 |
| tanweai/pua @ e6e6cd2 | `skills/` 下 12 个：pua、pua-en、pua-ja、pua-loop、p7、p9、p10、pro、mama、ding、shot、yes | 受挫/失败时自动触发靠 5 类 hook；`commands/`、`agents/` 是插件内容。`pua-loop` 等是否离得开 hook **未逐个核对**。无 LICENSE 文件（plugin.json 写 MIT） |

### 复制后还需要用户机器上有别的东西

| 仓库 @ 提交 | skill | 需要 |
|---|---|---|
| op7418/guizang-ppt-skill @ c91369c | `guizang-ppt-skill` | 校验脚本要 Node.js；Playwright 可选 |
| Agents365-ai/drawio-skill @ 88fd923 | `drawio-skill`（在 `skills/drawio-skill/`，1.2M） | Python 3；导出图片要 draw.io 桌面版（可选）。`disable-model-invocation: true` |
| anysearch-ai/anysearch-skill @ 9b91ee2 | `anysearch`（目录名不一致） | Python 或 Node；查询发往 api.anysearch.com；API key 可选 |
| eze-is/web-access @ 33eef84 | `web-access` | Node.js 22+，浏览器开远程调试。正文用 `${CLAUDE_SKILL_DIR}`（4 处），Codex 下是否可用未核对。无 LICENSE 文件（frontmatter 写 MIT） |
| zsyggg/paper-craft-skills @ 3be47a2 | 3 个：paper-analyzer、paper-comic、paper-deck | paper-analyzer 要 Python；另两个要宿主有生图能力或另装生图 skill。无 LICENSE 文件 |
| GordenSun/GordenPPTSkill @ 7d4a61c | `gorden-ppt-skill`（目录名不一致） | Python + python-pptx；预览要 LibreOffice、poppler。**101.8M**（templates 101M）。正文要求首次使用先跑 `scripts/apply_update.py` 从上游自更新，用户机器上的副本会被上游版本替换 |
| sunbigfly/ppt-agent-skills @ 13e3537 | `ppt-agent`（目录名不一致） | Python + Pillow、截图用的浏览器引擎（README 说 Puppeteer，安装方式未核对）、宿主支持子代理。15.2M |
| mvanhorn/last30days-skill @ 267d50f | `last30days`（在 `skills/last30days/`，17M） | Python 3 + Node；首次运行有配置向导；十余个 API key 全部可选 |
| nextlevelbuilder/ui-ux-pro-max-skill @ 50d8a7d | `.claude/skills/` 下 7 个 | Python。主 skill 正文里的脚本路径写成 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py`，只在作为 Claude Code 插件安装时成立；单独复制后路径不对 |

### 不适合按 skill 复制

| 仓库 @ 提交 | 原因 |
|---|---|
| hugohe3/ppt-master @ b4efe3dd | skill 目录 78M、**13016 个文件**（templates 12450 个）；还要 `pip install` 约 19 个库。逐文件下载不现实，且会把仓库文件树推向截断阈值 |
| Panniantong/Agent-Reach @ 94f06c1 | `SKILL.md` 只是说明，能力在 Python 程序 `agent-reach` 里，要先 `pip` 装上再跑 `agent-reach install`（它自己会把 skill 放进各宿主） |

## 其它发现

- `旧/` 里是 archify、onetake、show-me、shuorenhua、unlazy，这五个仓库里已经有。
- 「汇总」文档里标了 `Skill` 但收录目录里没有的 11 个：graphify、Understand-Anything、caveman、Impeccable、analyse-design、AI Website Cloner Template、nuyoah-image-reverse-prompt、prompt-architect、chinese-novelist-skill、oh-story-claudecode、webnovel-writer。
- 20 个仓库合计约 69 个 skill，不含 `.git` 约 350M、约 1.6 万个文件（ppt-master 占 1.3 万）。

## `npx skills add` 实测

> 2026-10-10，macOS，`skills` 1.7.2。全部在 `mktemp -d` 建的临时目录里跑，`HOME`、`XDG_*`、`CLAUDE_CONFIG_DIR` 都指到它，没有碰真实的宿主配置。Windows 和 Linux 没有测。
> 选项的含义以官方 README 为准（https://github.com/vercel-labs/skills ）：`-g` 装到用户目录，`-a` 指定 agent，`-s/--skill` 按 frontmatter 的 name 选，`-y` 跳过所有确认，`--copy` 复制而不是建符号链接，`--list` 只列不装。不带 `-g` 时装进当前目录的项目里。

| # | 做了什么 | 结果 |
|---|---------|------|
| 1 | 本地目录作来源，`-g -a claude-code -y`，标准输入接 `/dev/null`、输出全部丢弃 | 退出 0，2 秒。`~/.claude/skills/humanizer-zh/` 是真实目录。另写了 `$XDG_STATE_HOME/skills/.skill-lock.json` |
| 2 | `emilkowalski/skills --skill animate -g -a claude-code -a codex -y`，输入输出同上 | 退出 0，4 秒。`~/.agents/skills/animate/` 是真实目录，`~/.claude/skills/animate` 是指向它的符号链接 |
| 3 | `--skill` 写一个不存在的名字 | 退出 1，输出里列出该仓库实际有的 skill 名 |
| 4 | 同 2 但保留输出 | 34 行：带框线的进度、「Installation Summary」、「Done!」。已有同名目录时直接覆盖，不询问（`overwrites: Claude Code`） |
| 5 | `env -i` 只留 `PATH`、`HOME`、`XDG_*`（去掉「在 Claude Code 里运行」的环境变量），`-g -a claude-code -y`，输入输出切断 | 退出 0，4 秒。`~/.claude/skills/animate/` 是真实目录，没有建 `~/.agents`。保留输出时开头是一幅 6 行的 `SKILLS` 字符画 |

结论：

- 带齐 `--skill … -g -a … -y` 时不提问；切断输入输出后不卡住，成败看退出状态。
- 不切断输出就会把它自己的字符画和框线打到终端上。安装器现有的不经 shell 的执行方式（`cli/src/run-command.ts`，`stdio: 'ignore'`，命令与参数分开传）正好是切断的；工具用的 shell 方式（`stdio: 'inherit'`）不是。
- 试验 4 里看到「Agent detected — installing non-interactively」：在 Claude Code 里跑时它会自己切到非交互。试验 5 排除了这个因素。
- 一次只给一个 `-a` 时落下的是真实目录；同时给两个时其中一个是符号链接。
- 它覆盖已有目录不询问，安装器要在调用前自己判断并询问。
- 安装到的两个全局目录与 `cli/src/hosts.ts` 一致：Claude Code 是 `~/.claude/skills`，Codex 是 `~/.agents/skills`。

## 收录目录里没有的 11 个仓库（子代理调查）

> 2026-10-10，由 3 个子代理分头做，只读：`gh api` 看仓库信息与文件树、读 raw 文件、`npx skills add <仓库> --list`（只列不装，`skills` 1.7.2，macOS）。下面是它们的报告摘要，**主会话没有逐条复核**；标「推断」的是子代理自己标的。

### 第二组（4 个）

| 仓库 | 许可证 | skill（frontmatter name） | `--list` | 结论 |
|---|---|---|---|---|
| sammcj/agentic-coding | Apache-2.0 | `analyse-design`，在 `Skills/analyse-design/`，只有一个 4.7KB 的 `SKILL.md` | 发现 55 个 | 能直接装。无依赖、无跨目录引用。README 没有安装命令，`npx skills add … --skill analyse-design` 出自 skills.sh 页面 |
| JCodesMore/ai-website-cloner-template | MIT | `clone-website`，在 `.agents/skills/clone-website/` | 发现 1 个 | **是 GitHub 模板仓库，不是可单装的 skill**：官方用法是整个克隆下来当项目（Next.js 16 脚手架、Node 24+、根目录 `AGENTS.md` 的规则），再在项目里跑 `/clone-website <网址>`。默认分支是 `master` |
| nuyoah-ai-works/nuyoah-image-reverse-prompt | MIT | `nuyoah-image-reverse-prompt`，`SKILL.md` 在仓库根 | 发现 1 个 | 能直接装，README 写的就是 `npx skills add … -g -y`。需要模型能看图。**正文规定产出的提示词默认在末尾加一句让画面带「nuyoah」手写署名**，除非用户要求不要 |
| ckelsoe/prompt-architect | MIT | `prompt-architect`，在 `skills/prompt-architect/`，64 个文件约 500KB | 发现 1 个 | 能直接装。无依赖。由 `ckelsoe/claude-skill-prompt-architect` 改名而来，旧地址会重定向。README 没写 `npx skills add` |

这一组带出的、对全体第三方 skill 都成立的事实：

- `SKILL.md` 在仓库根时，`skills` 会把**整个仓库根**装进去，只排除 `.git` 和 `metadata.json`（子代理读 CLI 源码所得）。README、测试、图片都会跟着进用户的 skills 目录。
- `skills` 自身默认带安装遥测，设 `DISABLE_TELEMETRY` 或 `DO_NOT_TRACK` 可关（子代理读 CLI 源码所得）。
- `sammcj/agentic-coding` 的目录叫 `Skills/`（大写）。CLI 优先找小写的 `skills/`，在大小写敏感的 Linux 上可能退到全仓递归，把 `Skills_disabled/` 里的 28 个也算进来；`analyse-design` 全仓无重名，按名字选应仍唯一命中。**推断，Linux 上没有实测。**

### 第三组（3 个，中文小说 / 网文写作）

| 仓库 | 许可证 | skill（frontmatter name） | `--list` | 结论 |
|---|---|---|---|---|
| PenglongHuang/chinese-novelist-skill | MIT | `chinese-novelist`（与仓库名不同），`SKILL.md` 在仓库根，29 个文件约 909KB（其中截图约 730KB） | 发现 1 个 | 能装，README 写的就是 `npx skills add`。需要本机有 Python 且命令名是 `python`（流程里写死的，只有 `python3` 的机器上字数检查会失败——推断，未实跑）。第三阶段规定「禁止向用户确认」，一口气写 10–50 章 |
| zenstory-ai/oh-story-claudecode | MIT | 13 个，都在 `skills/<name>/`：story-setup、story、story-long-write、story-short-write、story-deslop、story-long-analyze、story-short-analyze、story-long-scan、story-short-scan、story-import、story-review、story-cover、browser-cdp。共 465 个文件约 6.3MB | 发现 13 个 | 能装，官方主推 `npx skills add … -y -g`。文件层面各自自包含；流程上要 13 个配合，且**装后必须在写作项目里跑一次 `/story-setup` 并新开会话**（它往项目里写 hooks、7 个 agent、合并 `.claude/settings.local.json`），否则全部降级为单会话。要 Node 和 Python |
| lingfengQAQ/webnovel-writer | **GPL-3.0** | 8 个，在 `webnovel-writer/skills/<name>/` | 发现 8 个 | **不能按 skill 装**：是 Claude Code 插件的组成部分。8 个都靠 `${CLAUDE_PLUGIN_ROOT}` 找插件根下的 Python 主程序、共享资料、带插件命名空间的子代理和 hooks，单装全部不可用。官方装法是 `claude plugin marketplace add` + `claude plugin install` + `pip install -r requirements.txt`，只支持 Claude Code |

oh-story-claudecode 里要单独标注的：

- `browser-cdp`：首次启动会结束用户正在运行的 Chrome（设计上先征求同意），把登录态拷到 `~/chrome-debug-profile`；另需 `npm install -g agent-browser`。
- `story-cover`：Claude Code 下要 `GPT_IMAGE_API_KEY`，提示词和可选的参考图发到 `api.openai.com` 或自定义代理。
- `story` 在用户说「检查更新」并确认后会执行 `npx skills add zenstory-ai/oh-story-claudecode -y -g`——不带 `--skill` 和 `-a`，会绕过安装器当初的选择把 13 个全量重装。
- 部署的 `session-start.sh` 每 24 小时最多一次访问 GitHub releases 接口查版本，`STORY_NO_UPDATE_CHECK=1` 可关。

这一组带出的事实：`skills` 的 `--skill` 可以一次跟多个名字（子代理读 CLI 源码所得），一条命令能装同一仓库里的一组 skill。

### 第一组（4 个）

| 仓库 | 许可证 | skill | `--list` | 结论 |
|---|---|---|---|---|
| Graphify-Labs/graphify（由 `safishamsi/graphify` 转移而来，默认分支 `v8`） | Apache-2.0 | 没有大写的 `SKILL.md`，只有 `graphify/skill.md`（小写），name `graphify` | macOS 上发现 1 个 | **不能按 skill 装**：CLI 会把整个 Python 包目录（230 个文件、5.2MB）复制进去，正文引用的 `references/` 在装好的目录里不存在；大小写敏感的 Linux 上应当连发现都发现不了（推断）。本体是 PyPI 包 `graphifyy`，官方装法 `uv tool install graphifyy` 后 `graphify install`（`--platform agents` 写到 `~/.agents/skills/`）。`graphify install` 会改 `~/.claude/CLAUDE.md` |
| Egonex-AI/Understand-Anything（由 `Lum1104/…` 转移而来） | MIT | 9 个，在 `understand-anything-plugin/skills/<name>/` | 发现 9 个 | **不能按 skill 装**：核心的 `understand` 要找到插件根目录（同时有 `package.json` 和 `pnpm-workspace.yaml`），找不到就 `exit 1`；还依赖 skill 目录外的 `packages/core` 和 10 个子代理（读源码推出，未实装）。官方装法是 Claude Code 插件两条命令，或 `curl …/install.sh \| bash`（可带平台名）。要 Node ≥ 22、pnpm ≥ 10、Python |
| JuliusBrussee/caveman | Apache-2.0 | 22 个，主副本在 `skills/<name>/` | 发现 22 个 | `caveman`、`ultracave`、`megacave`、`caveman-commit`、`caveman-review`、`caveman-help` 和 6 个工作纪律类是纯提示词，能直接装（子代理只通读了 `caveman`，其余做了关键词检索）。不带 hooks 所以不会每个会话自动开启。`caveman-stats`、`cavecrew`、`caveman-learn` 和 5 个 Caveman Cloud 类依赖 hook、子代理、`caveman` CLI 或付费账号，不适合单装。README 的 `npx skills add JuliusBrussee/caveman -g` 不带 `--skill`，会把 22 个全装上 |
| pbakaus/impeccable | Apache-2.0 | 24 个 `SKILL.md` 里 20 个是按 agent 编译出的同名副本，name 都是 `impeccable` | 发现 1 个 | 能装但打折：首次运行要联网从 GitHub releases 下载引擎二进制到 `~/.impeccable/bin/` 并执行；CLI 选中的应是 `.agents/skills/` 下 Codex 措辞的那份（推断，`--list` 不显示路径）；没有设计检测 hook 和子代理。skill 目录约 2.2MB，每次安装要浅克隆约 77MB 的仓库。官方装法是 `npx impeccable install`，README 里没有 `npx skills add` |

这一组带出的事实（子代理读 `skills` 1.7.2 源码所得）：

- CLI 靠 `stat(join(dir, "SKILL.md"))` 发现 skill，文件名大小写是否敏感取决于文件系统。
- 同一仓库里多个同名 skill 按搜索目录的顺序去重，`.agents/skills` 排第一。
- 子代理说安装是「复制到 `~/.agents/skills/<name>` 再软链到 agent 目录」。**这与主会话的试验 1、5 不一致**：只给 `-a claude-code` 时落下的是 `~/.claude/skills/<name>` 真实目录，没有建 `~/.agents`。以实测为准，源码的那条路径应是多个 agent 时的情况（试验 2）。

## 31 个仓库的归类提议

> 2026-10-11 维护者决定不收 `sammcj/agentic-coding`（下表里的「agentic-coding（只取 analyse-design）」）：实际录入的是 30 个仓库，第三方 Skill 23 个。下表是当时的提议，留着没改。

| 归类 | 仓库 |
|---|---|
| 第三方 Skill（`npx skills add`），24 个 | Humanizer-zh、academic-humanizer、andrej-karpathy-skills、emilkowalski/skills、taste-skill、hallmark、guizang-ppt-skill、drawio-skill、anysearch-skill、web-access、paper-craft-skills、GordenPPTSkill、ppt-agent-skills、last30days-skill、i-have-adhd、ponytail、pua、chinese-novelist-skill、oh-story-claudecode、agentic-coding（只取 analyse-design）、nuyoah-image-reverse-prompt、prompt-architect、caveman（只取纯提示词的）、impeccable |
| 工具（各自的官方安装程序），4 个 | Agent-Reach、ui-ux-pro-max-skill、graphify、Understand-Anything |
| 外部项目（只给链接），3 个 | ppt-master、ai-website-cloner-template、webnovel-writer |

未做的事：收录目录里的 20 个仓库没有跑过 `--list`（pua 一个仓库里有 46 个 `SKILL.md`，CLI 去重后选中哪一份未知）；GordenPPTSkill 带 `.gitattributes`，模板是否走 Git LFS、CLI 克隆时取不取得到未核对；四个「工具」的官方命令一条都没有实际执行过。
