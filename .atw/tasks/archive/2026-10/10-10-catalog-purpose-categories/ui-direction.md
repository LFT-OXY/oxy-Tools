# 界面方向：按用途进入之后的新画面

> 工单 01 的结论。维护者 2026-10-10 看一次性的对比页后选定。对比页是手工拼的终端画面，没有进仓库（当时放在 `/tmp/oxy-mixed-list-prototype.rNiUUI/`，不保证还在）；结论以本文件和 `prd.md` 为准，截图在同目录的 `screenshots/`（不提交）。
> 方向没有换：仍是「账本」——无边框、状态用词表达、栏对齐、块与块之间空一行、焦点色是洋红。这次是在它上面加画面。
> 选定的画法已经并进 `.atw/spec/cli/ui-design.md`；后面改画面的工单照那份规范实现。
> 用词：正文说「宿主」；界面文案里它显示为「AI Agent」（见 `GLOSSARY.md`）。

## 选了什么

| 问题 | 候选 | 选定 |
|------|------|------|
| 混合列表怎么排 | A 类型一栏、每个宿主一栏状态／B 类型作分段标题、每个宿主一栏状态／C 类型一栏、状态合成一栏 | **B** |
| 其余的新画面（主菜单、选择安装范围、第三方 Skill 的清单、汇总与将执行的命令、执行与结果、外部项目的说明与链接） | 各只排了一种 | 照对比页 |
| 段标题会随条目滚出屏幕，这时怎么看出类型（评审指出后补问的） | 列表下方加一行「类型」／不加、记为已知的限制／改选 A | **加一行「类型」** |
| 段标题要不要更显眼（视觉评审的建议） | 保持对比页上的样子／暗淡的横线画到行尾 | **保持** |

三种排法用的是同一批条目、同样的状态，都用能装的条目里最长的名字（`nuyoah-image-reverse-prompt`，27 列）排过两个宿主的情形，最宽的一行都是 79 列。待录入清单里最长的名字其实是一个外部项目（`opencode-dynamic-context-pruning`，32 列），评审指出后补排：B 中英文都在 79 列以内，A 和 C 的英文界面超出（89 列、80 列）。

没选的原因（实现者交给维护者时说明的，维护者选 B 时没有另外补充喜欢或不喜欢的点）：

- **A 类型一栏**：名称、类型、两栏状态占掉 76 列，最长的名字出现时说明一栏整个没有；一行同时带「第三方」和「推荐」再碰上最长的名字和两栏版本对比时要 82 列，还得另定退让的办法。
- **C 状态合成一栏**：两个宿主的状态不同时只能写「不一致」，要把光标移到那一行才在列表下方看到各自的状态——丢掉了当初选账本时看中的「两个宿主的状态并排成栏一眼可比」。

选 B 的代价，交给维护者时已说明：

- 段标题多占 3 到 5 行，列表更早开始滚动。
- 当时没有说到的一层：列表一滚动，段标题会跟着滚出屏幕，那一屏的条目就看不出类型。评审指出后向维护者补问，定下在列表下方加一行「类型」，写光标所在行的类型。
- `prd.md` 里两句验收的说法跟着改：「每一行的类型一栏有字」改成类型写在段首；「第三方 Skill 的行上看得到『第三方』」改成它们自成一段、段首写明。
- 组件的顺序由「推荐的在前、其余按名字」（`prd.md` 的推断 9）改成先按类型分段，段内推荐的在前、其余按名字。

## 混合列表：B 类型分段

四种类型都有，两个宿主：

```
✓ 选择用途 · 文档处理
✓ 装进哪些 AI Agent · Claude Code、Codex
✓ 装到哪里 · 全局

? 选择要安装的条目

   名称                   Claude Code   Codex    说明
   ── Skill
 □ archify                已装 3.0      未装     推荐 · 生成架构图、流程图、时…
   ── 第三方 Skill · 内容直接来自作者
 □ drawio-skill           未装          未装     用 draw.io 画流程图和架构图并…
 □ gorden-ppt-skill       已装          已装     套用 19 套中文模板生成和编辑…
 ■ guizang-ppt-skill      未装          未装     生成杂志风格的网页版 PPT（校…
▸■ paper-craft-skills     已装 1/3      未装     读论文并做成深度解读、漫画或…
 □ ppt-agent-skills       未装          未装     分多步生成整套 PPT，带截图自…
   ── MCP
 □ excel                  已配置        不支持   创建、读取和修改 Excel 工作簿…
 □ word-document-server   未配置        未配置   创建、读取和修改 Word 文档（…
   ── 工具
 ■ markitdown             未安装                 把 PDF、Office 文档、图片等转…
 – officecli              不支持 macOS           在命令行里读写 Word、Excel、P…
 □ pandoc                 已安装                 在 Markdown、Word、HTML、PDF…

   ── 外部项目 · 只给链接，不安装
 □ mineru                 把 PDF 解析成 Markdown 或 JSON，保留公式、表格和版面…
 □ pdf-inspector          判断 PDF 是扫描件还是文字版并提取文字的开发库
 ■ ppt-master             把文档、网页或一个主题做成可编辑的原生 PPTX（上万个…
 □ stirling-pdf           可自托管的 PDF 工具箱，合并、拆分、转换、OCR 都在网…
 □ word-formatter-pro     按公文和论文的格式要求一键排版 Word 文档

   类型  第三方 Skill
   说明  读论文并做成深度解读、漫画或幻灯片（3 个 skill，其中两个要 AI Agent 能
         生成图片）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）
```

能装的条目里最长的名字、最宽的状态（说明一栏还剩 15 列）：

```
✓ 选择用途 · UI 设计、图像与视频
✓ 装进哪些 AI Agent · Claude Code、Codex
✓ 装到哪里 · 全局

? 选择要安装的条目

   名称                          Claude Code     Codex          说明
   ── Skill
 □ onetake                       1.0.0 → 1.0.1   非本工具安装   推荐 · 制作 10…
   ── 第三方 Skill · 内容直接来自作者
 □ analyse-design                未装            未装           分析一个网站或…
 □ emilkowalski-skills           未装            未装           动效与界面细节…
 □ hallmark                      已装            未装           给界面定一套有…
 □ impeccable                    未装            未装           一套前端设计规…
▸■ nuyoah-image-reverse-prompt   未装            未装           看图反推出可用…
 ■ taste-skill                   已装 2/13       未装           一组提升界面审…
   ── MCP
 □ shadcn-ui                     未配置          未配置         让 AI 查阅 sha…

   ── 外部项目 · 只给链接，不安装
 □ ai-website-cloner-template    把一个网站克隆成 Next.js 项目的模板仓库，要整…
 □ awesome-gpt-image-2           GPT 图像模型的提示词与案例合集
 □ screenshot-to-code            把截图、设计稿转成 HTML、React 等前端代码的网…
 □ ui-ux-pro-max-skill           带检索脚本的 UI/UX 设计知识库，要用它自己的安…

   类型  第三方 Skill
   说明  看图反推出可用于生成图片的提示词（产出的提示词默认带「nuyoah」署名）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）
```

待录入清单里最长的名字（32 列，是外部项目；说明一栏还剩 15 列）：

```
✓ 选择用途 · 上下文、记忆与 Token 优化
✓ 装进哪些 AI Agent · Claude Code、Codex
✓ 装到哪里 · 全局

? 选择要安装的条目

   名称                               Claude Code   Codex       说明
   ── 第三方 Skill · 内容直接来自作者
▸■ caveman                            已装 3/12     已装 3/12   让 AI 用极简的…
   ── MCP
 □ memorix                            已配置        未配置      跨 AI Agent 共…

   ── 外部项目 · 只给链接，不安装
 □ claude-mem                         自动记下每次会话做了什么，下次开工时把相…
 □ context-mode                       把工具的大段输出放进沙箱处理，只把结果交…
 □ headroom                           在工具输出、日志、文件等内容送进大模型之…
 □ opencode-dynamic-context-pruning   给 OpenCode 用的插件，自动剪掉对话里用不…
 □ rtk                                把常用命令的输出压成对 AI 够用的精简版，…

   类型  第三方 Skill
   说明  让 AI 用极简的说法回答以节省 token 的一组 skill（12 个 skill，只收纯提
         示词的那些）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）
```

一个宿主（只是少一栏）：

```
✓ 选择用途 · 文档处理
✓ 装到哪里 · 全局

? 选择要安装的条目

   名称                   Claude Code    说明
   ── Skill
 □ archify                已装 3.0       推荐 · 生成架构图、流程图、时序图、数…
   ── 第三方 Skill · 内容直接来自作者
 □ drawio-skill           未装           用 draw.io 画流程图和架构图并导出图片…
 □ gorden-ppt-skill       已装           套用 19 套中文模板生成和编辑 PPT，只…
 ■ guizang-ppt-skill      未装           生成杂志风格的网页版 PPT（校验脚本需…
▸■ paper-craft-skills     已装 1/3       读论文并做成深度解读、漫画或幻灯片（3…
 □ ppt-agent-skills       未装           分多步生成整套 PPT，带截图自检（需要…
   ── MCP
 □ excel                  已配置         创建、读取和修改 Excel 工作簿（需要 u…
 □ word-document-server   未配置         创建、读取和修改 Word 文档（需要 uv；…
   ── 工具
 ■ markitdown             未安装         把 PDF、Office 文档、图片等转成 Markd…
 – officecli              不支持 macOS   在命令行里读写 Word、Excel、PPT 文件
 □ pandoc                 已安装         在 Markdown、Word、HTML、PDF 等几十种…

   ── 外部项目 · 只给链接，不安装
 □ mineru                 把 PDF 解析成 Markdown 或 JSON，保留公式、表格和版面…
 □ pdf-inspector          判断 PDF 是扫描件还是文字版并提取文字的开发库
 ■ ppt-master             把文档、网页或一个主题做成可编辑的原生 PPTX（上万个…
 □ stirling-pdf           可自托管的 PDF 工具箱，合并、拆分、转换、OCR 都在网…
 □ word-formatter-pro     按公文和论文的格式要求一键排版 Word 文档

   类型  第三方 Skill
   说明  读论文并做成深度解读、漫画或幻灯片（3 个 skill，其中两个要 AI Agent 能
         生成图片）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）
```

一个宿主都没检测到（组件不可选，外部项目照常）：

```
✓ 选择用途 · 文档处理

? 选择要安装的条目

   名称                   状态            说明
   ── Skill
 – archify                需要 AI Agent   推荐 · 生成架构图、流程图、时序图、…
   ── 第三方 Skill · 内容直接来自作者
 – drawio-skill           需要 AI Agent   用 draw.io 画流程图和架构图并导出图…
 – gorden-ppt-skill       需要 AI Agent   套用 19 套中文模板生成和编辑 PPT，只…
 – guizang-ppt-skill      需要 AI Agent   生成杂志风格的网页版 PPT（校验脚本需…
▸– paper-craft-skills     需要 AI Agent   读论文并做成深度解读、漫画或幻灯片（…
 – ppt-agent-skills       需要 AI Agent   分多步生成整套 PPT，带截图自检（需要…
   ── MCP
 – excel                  需要 AI Agent   创建、读取和修改 Excel 工作簿（需要…
 – word-document-server   需要 AI Agent   创建、读取和修改 Word 文档（需要 uv…
   ── 工具
 – markitdown             需要 AI Agent   把 PDF、Office 文档、图片等转成 Mark…
 – officecli              需要 AI Agent   在命令行里读写 Word、Excel、PPT 文件
 – pandoc                 需要 AI Agent   在 Markdown、Word、HTML、PDF 等几十…

   ── 外部项目 · 只给链接，不安装
 □ mineru                 把 PDF 解析成 Markdown 或 JSON，保留公式、表格和版面…
 □ pdf-inspector          判断 PDF 是扫描件还是文字版并提取文字的开发库
 ■ ppt-master             把文档、网页或一个主题做成可编辑的原生 PPTX（上万个…
 □ stirling-pdf           可自托管的 PDF 工具箱，合并、拆分、转换、OCR 都在网…
 □ word-formatter-pro     按公文和论文的格式要求一键排版 Word 文档

   类型  第三方 Skill
   说明  读论文并做成深度解读、漫画或幻灯片（3 个 skill，其中两个要 AI Agent 能
         生成图片）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则返回）
```

英文，最宽的那个画面：

```
✓ Pick a purpose · UI design, images & video
✓ Install into which AI Agents · Claude Code, Codex
✓ Install where · Global

? Pick entries to install

   Name                          Claude Code      Codex       About
   ── Skills
 □ onetake                       1.0.0 → 1.0.1    unmanaged   pick · Make 10–6…
   ── Third-party skills · content comes straight from the author
 □ analyse-design                none             none        Analyse the desi…
 □ emilkowalski-skills           none             none        A set of skills…
 □ hallmark                      installed        none        Give an interfac…
 □ impeccable                    none             none        Front-end design…
▸■ nuyoah-image-reverse-prompt   none             none        Reverse-engineer…
 ■ taste-skill                   installed 2/13   none        A set of design-…
   ── MCP
 □ shadcn-ui                     none             none        Let the AI look…

   ── External projects · links only, nothing is installed
 □ ai-website-cloner-template    Template repo that clones a website into a Ne…
 □ awesome-gpt-image-2           A collection of prompts and examples for the…
 □ screenshot-to-code            Web app that turns screenshots and mockups in…
 □ ui-ux-pro-max-skill           UI/UX design knowledge base with search scrip…

   Type   Third-party skill
   About  Reverse-engineer an image into a generation prompt (prompts carry a
          "nuyoah" signature by default)

   ↑↓ move · space select · a all · i invert · ⏎ confirm (none = back)
```

英文、最长的名字：说明只剩 7 列，整栏不写：

```
✓ Pick a purpose · Context, memory & token optimization
✓ Install into which AI Agents · Claude Code, Codex
✓ Install where · Global

? Pick entries to install

   Name                               Claude Code      Codex
   ── Third-party skills · content comes straight from the author
▸■ caveman                            installed 3/12   installed 3/12
   ── MCP
 □ memorix                            configured       none

   ── External projects · links only, nothing is installed
 □ claude-mem                         Automatically records what each session…
 □ context-mode                       Processes large tool output in a sandbox…
 □ headroom                           Compresses tool output, logs and files b…
 □ opencode-dynamic-context-pruning   An OpenCode plugin that prunes tool outp…
 □ rtk                                A CLI proxy that condenses common comman…

   Type   Third-party skill
   About  A set of skills that make the AI answer tersely to save tokens (12
          skills, prompt-only ones)

   ↑↓ move · space select · a all · i invert · ⏎ confirm (none = back)
```

画法：

- 栏：名称、每个所选的宿主一栏状态、说明。没有类型一栏。说明一栏不足 12 列时整栏不写（评审之后补的规则，见下面「照着推的」）。
- 组件按类型分段，顺序固定：Skill（本仓库的）、第三方 Skill、MCP、工具；没有条目的段不出现。段内带推荐的在前，其余按名字。
- 段首一行是标题：缩进三格，暗淡的 `──`，空一格，默认色的标题。第三方 Skill 的标题后面写明「内容直接来自作者」。段与段之间不空行。
- 「第三方」不再是每行的标记，由段标题表达。「推荐」写在说明一栏的最前面，后面跟 ` · `，默认色，不截断；截断的只是它后面的说明。不可选的行里它跟着暗淡。
- 外部项目在最下面单独一段，与组件之间空一行，标题写明「只给链接，不安装」；这一段的行没有状态，说明从第一栏状态的位置起一直写到第 79 列。
- 工具只有一个状态，写在第一栏状态的位置，占满各个状态栏。
- 不可选的行：整行暗淡、勾选位是 `–`，原因保持正常亮度，写在状态的位置（`不支持 macOS`、`需要 AI Agent`）。
- 一个宿主都没检测到时，状态只有一栏，表头是「状态」，每个组件都写「需要 AI Agent」；不问装进哪些宿主，也不问安装范围。
- 第三方 Skill 的状态：`未装`（暗淡）、`已装`（绿）；条目含多个 skill 时写 `已装 1/3`（「已装」绿，数字默认色）。
- 列表下方先是一行「类型」，写光标所在行的类型，带推荐的后面跟「推荐」；再是光标所在行的说明全文；然后是按键提示。

## 主菜单

```
✓ Language / 语言 · 中文

  AI Agent  Claude Code ✓   Codex ✓
  目录      37 Skill · 11 MCP · 2 工具 · 57 外部项目
────────────────────────────────────────────────────────────────────────────────

? 选择用途

  用途                        数量
▸ 推荐                          13
  开发工作流与规范               6
  Agent 行为约束与输出风格       6
  代码库索引与理解              12
  上下文、记忆与 Token 优化      9
  联网搜索与文档检索             8
  浏览器自动化                   6
  UI 设计、图像与视频           22
  文档处理                      21
  提示词与写作                   9
  代码审查、评估与安全           7

  退出

   ↑↓ 移动 · ⏎ 选择
```

没有「推荐」、某个用途没有条目时，对应的行不出现：

```
✓ Language / 语言 · 中文

  AI Agent  Claude Code ✓   Codex ✓
  目录      37 Skill · 11 MCP · 2 工具 · 57 外部项目
────────────────────────────────────────────────────────────────────────────────

? 选择用途

  用途                        数量
▸ 开发工作流与规范               6
  Agent 行为约束与输出风格       6
  代码库索引与理解              12
  上下文、记忆与 Token 优化      9
  联网搜索与文档检索             8
  UI 设计、图像与视频           22
  文档处理                      21
  提示词与写作                   9
  代码审查、评估与安全           7

  退出

   ↑↓ 移动 · ⏎ 选择
```

英文：

```
✓ Language / 语言 · English

  AI Agent  Claude Code ✓   Codex ✓
  Catalog   37 skills · 11 MCP · 2 tools · 57 external
────────────────────────────────────────────────────────────────────────────────

? Pick a purpose

  Purpose                                Count
▸ Recommended                               13
  Development workflow & conventions         6
  Agent behavior & output style              6
  Codebase indexing & understanding         12
  Context, memory & token optimization       9
  Web search & docs retrieval                8
  Browser automation                         6
  UI design, images & video                 22
  Document processing                       21
  Prompts & writing                          9
  Code review, evaluation & security         7

  Quit

   ↑↓ move · ⏎ select
```

- 两栏的表：用途、数量（右对齐）。第一行是「推荐」，下面是各个用途，按用途清单的顺序；「退出」与它们之间空一行。
- 本机信息的「目录」一行照旧按类型数：Skill（本仓库的和第三方的合在一起）、MCP、工具、外部项目。

## 选择安装范围

```
✓ 选择用途 · 文档处理
✓ 装进哪些 AI Agent · Claude Code、Codex

? 装到哪里

▸ 全局   对这台机器上的所有项目生效
  项目   只对当前目录生效：~/work/my-app

   ↑↓ 移动 · ⏎ 选择
```

回答后收成一行：

```
✓ 选择用途 · 文档处理
✓ 装进哪些 AI Agent · Claude Code、Codex
✓ 装到哪里 · 项目

? 选择要安装的条目

   名称 …
```

- 单选，没有表头。两项各带一句说明；「项目」后面暗淡地写出当前目录，只是告知，不另设确认。
- 光标起始在「全局」。

## 第三方 Skill 的清单

```
✓ 装到哪里 · 项目
✓ 选择要安装的条目 · archify、guizang-ppt-skill、paper-craft-skills 等 6 项

? paper-craft-skills 里有 3 个 skill，选择要装的

   名称             Claude Code   Codex   说明
 ■ paper-analyzer   已装          未装    把一篇论文读成深度解读文章（需要 Pyt…
▸■ paper-comic      未装          未装    把论文的要点画成一组漫画（要 AI Agen…
 □ paper-deck       未装          未装    把论文做成一套幻灯片（要 AI Agent 能…

   说明  把论文的要点画成一组漫画（要 AI Agent 能生成图片）

   ↑↓ 移动 · 空格 选择 · a 全选 · i 反选 · ⏎ 确认（不选则不装这一条）
```

- 混合列表确认之后，每个含多个 skill 的第三方 Skill 条目各问一次。提问里写明条目的名字和它含几个 skill。
- 栏和混合列表一样：名称、每个所选的宿主一栏状态、说明；没有分段。
- 一个都不勾就确认：这一条不装，其余勾选的照常。按键提示末尾的括号里写的是「不选则不装这一条」。
- 混合列表回答后收成的那一行，勾得多时只列前三个名字，后面写「等 N 项」（N 是勾选的总数）。

## 汇总与将执行的命令

```
✓ paper-craft-skills 里有 3 个 skill，选择要装的 · paper-analyzer、paper-comic
✓ EXA_API_KEY · 已填写

── 将安装 5 项 ─────────────────────────────────────────────────────────────────

  Skill               AI Agent      操作   位置
  archify             Claude Code   覆盖   .claude/skills/archify
                                           重装 3.0
                      Codex         新装   .agents/skills/archify

  第三方 Skill        AI Agent      操作   位置
  guizang-ppt-skill   Claude Code   新装   .claude/skills/guizang-ppt-skill
                      Codex         新装   .agents/skills/guizang-ppt-skill
  paper-analyzer      Claude Code   覆盖   .claude/skills/paper-analyzer
                                           已有同名目录，另行确认
                      Codex         新装   .agents/skills/paper-analyzer
  paper-comic         Claude Code   新装   .claude/skills/paper-comic
                      Codex         新装   .agents/skills/paper-comic

  MCP                 AI Agent      操作
  exa                 Claude Code   新装
                      Codex         新装

  工具                操作
  markitdown          执行安装命令

── 将执行 7 条命令 ─────────────────────────────────────────────────────────────

   1  npx -y skills@1 add op7418/guizang-ppt-skill --skill guizang-ppt-skill
      --agent claude-code --yes
   2  npx -y skills@1 add op7418/guizang-ppt-skill --skill guizang-ppt-skill
      --agent codex --yes
   3  npx -y skills@1 add zsyggg/paper-craft-skills --skill paper-analyzer
      --skill paper-comic --agent claude-code --yes
   4  npx -y skills@1 add zsyggg/paper-craft-skills --skill paper-analyzer
      --skill paper-comic --agent codex --yes
   5  claude mcp add --scope project exa -e EXA_API_KEY=<EXA_API_KEY> -- npx
      -y exa-mcp-server
   6  codex mcp add exa --env EXA_API_KEY=<EXA_API_KEY> -- npx -y
      exa-mcp-server
   7  pip install 'markitdown[all]'

  注意      覆盖即整目录替换，目录内的本地改动会丢失
  注意      第三方 Skill 装的是作者当时的最新版，维护者没有逐版检查
  注意      key 以占位符显示，执行时才代入真实的值
  注意      EXA_API_KEY 会以明文写进 .mcp.json 和 .codex/config.toml，不要把它
            们提交或发给别人
  注意      Codex 只对受信任的项目读 .codex/config.toml

? 开始安装吗

▸ 开始安装
  返回修改
  取消

   ↑↓ 移动 · ⏎ 选择
```

- 一个分区「将安装 N 项」，N 是勾选的组件条目数（外部项目不算）。里面按类型分成几张小表，顺序与执行的先后一致：Skill、第三方 Skill、MCP、工具；小表之间空一行。
- 小表第一栏的表头就是类型的名字。各张小表的栏对齐：条目、AI Agent、操作三栏的宽度按整个分区里最长的一格定。
- Skill 和第三方 Skill 的小表有「位置」一栏；装到项目时写成相对当前目录的路径。第三方 Skill 一行是用户勾选的一个 skill，不是仓库条目的名字。
- 工具的小表只有条目和操作两栏，操作写「执行安装命令」。
- 备注的放法照旧：整个分区里每一条都放得下才成一栏，否则都另起一行。
- 「将执行 N 条命令」把第三方 Skill、MCP、工具的命令按执行的先后编号列在一起，不再给工具的命令另加一栏名字。
- 提醒各占一行「注意」，这一轮新增三条：第三方 Skill 装的是作者当时的最新版；装到项目时 key 会以明文写进哪些文件；Codex 只对受信任的项目读它的配置。
- 确认的提问统一是「开始安装吗」，三项是开始安装、返回修改、取消。
- 目标位置已有同名目录的第三方 Skill，确认之后逐个另问，默认否。

对比页上 Codex 装到项目的那条命令是拿全局的写法占位的：它的真实写法要等工单 11 验证。

## 执行与结果

```
✓ 开始安装吗 · 开始安装
✓ .claude/skills/paper-analyzer 已有同名目录，要覆盖它吗？ · 否

── 正在安装 ────────────────────────────────────────────────────────────────────

  ✓  archify             Claude Code   已安装 3.0
  ✓  archify             Codex         已安装 3.0
  ✗  guizang-ppt-skill   Claude Code   失败 安装命令退出状态 1
  ✓  guizang-ppt-skill   Codex         已安装
  –  paper-analyzer      Claude Code   跳过 未同意覆盖，保持原样
  ✓  paper-analyzer      Codex         已安装
  ✓  paper-comic         Claude Code   已安装
  ✓  paper-comic         Codex         已安装
  ✓  exa                 Claude Code   已配置
  ✓  exa                 Codex         已配置

── markitdown ──────────────────────────────────────────────────────────────────

  $ pip install 'markitdown[all]'
Collecting markitdown[all]
Successfully installed markitdown-0.1.3

  ✓  markitdown                        已可用，在 PATH 中找到 markitdown

── 结果 ────────────────────────────────────────────────────────────────────────

  ✓  archify             Claude Code   已安装 3.0
  ✓  archify             Codex         已安装 3.0
  ✗  guizang-ppt-skill   Claude Code   失败 安装命令退出状态 1
  ✓  guizang-ppt-skill   Codex         已安装
  –  paper-analyzer      Claude Code   跳过 未同意覆盖，保持原样
  ✓  paper-analyzer      Codex         已安装
  ✓  paper-comic         Claude Code   已安装
  ✓  paper-comic         Codex         已安装
  ✓  exa                 Claude Code   已配置
  ✓  exa                 Codex         已配置
  ✓  markitdown                        已可用，在 PATH 中找到 markitdown

────────────────────────────────────────────────────────────────────────────────
  合计      9 成功 · 1 失败 · 1 跳过
```

- 本仓库的 skill、第三方 Skill、MCP 共用「正在安装」分区，每个 skill 在每个宿主下各一行。
- 工具排在最后，每个工具照旧是一个以它名字为标题的分区，命令自己的输出原样透传。
- 这一轮有工具时，最后用「结果」分区把每一行原样再列一遍（工具的那一行没有宿主），再是合计。前面「正在安装」的标题这时不回头改写：工具的输出已经接着往下写了。
- 第三方 Skill 成功写「已安装」，没有版本号；失败只写哪一步、退出状态几。

## 外部项目的说明与链接

接在结果后面：

```
────────────────────────────────────────────────────────────────────────────────
  合计      9 成功 · 1 失败 · 1 跳过

── 外部项目：2 个，只给链接 ────────────────────────────────────────────────────

  ppt-master
  说明      把文档、网页或一个主题做成可编辑的原生 PPTX（上万个文件，要按它官方
            的方式安装）
  链接      https://github.com/hugohe3/ppt-master

  mineru
  说明      把 PDF 解析成 Markdown 或 JSON，保留公式、表格和版面结构
  链接      https://github.com/opendatalab/MinerU

? 选择用途
```

只勾了外部项目时，没有汇总，不问是否执行：

```
✓ 选择用途 · 文档处理
✓ 选择要安装的条目 · ppt-master

── 外部项目：1 个，只给链接 ────────────────────────────────────────────────────

  ppt-master
  说明      把文档、网页或一个主题做成可编辑的原生 PPTX（上万个文件，要按它官方
            的方式安装）
  链接      https://github.com/hugohe3/ppt-master

? 选择用途
```

- 一个分区，标题写明个数和「只给链接」。每个外部项目一段：粗体的名字，下面是「说明」「链接」两行键值，段与段之间空一行。链接带下划线，整条写在一行上。
- 不打开浏览器，也没有「已在默认浏览器打开」那一行。

## 对比页上没有画、照着推的

维护者看过的只有上面这些格子（第一轮），加上评审之后补问的两件。并进规范时照着推的那些，完整的清单只记一处：`.atw/spec/cli/ui-design.md` 的「实现时定下、维护者还没有看过的画法」一节里「按用途进入的新画面」那一段。上面各节里属于推断的有：

- 混合列表回答后收成的一行「等 N 项」的规则——对比页上只出现过「等 6 项」这一种。
- 确认的提问统一成「开始安装吗」——对比页上画的就是它，但它取代了原先只有 MCP 或工具时的「执行这些命令吗」这一点没有单独问过。
- 说明一栏不足 12 列时整栏不写；英文里推荐的标记由对比页第一轮上的 `recommended · ` 换成 `pick · `。这两条是评审指出英文界面写不下之后实现者定的。
- 汇总里工具的小表只有两栏、操作紧跟在条目后面——对比页上就是这样画的；视觉评审认为它和上面几张小表错位。

## 做不到、没做的

- 段标题和表头一样是列表里的一行，列表滚动时会随条目滚上去。
- 说明一栏在两个宿主、最长的名字、两栏版本对比同时出现时只剩十几列，英文界面里会整栏不写；类型、标记和说明全文在光标移到那一行时显示在列表下方。
- 对比页是手工拼的，不是安装器的真实输出：交互库重画时的细节（空行、按键提示、收成一行）要等各张工单实现后在界面预览页上再核对。

## 验收时看什么

- 混合列表里每一段的段首看得出类型，列表下方的「类型」一行跟着光标变；第三方 Skill 自成一段；外部项目都在组件下面，两段之间空一行，标题写明只给链接。
- 主菜单第一行是「推荐」，下面是各个用途，每行右边有数量；看不到按类型分的行。
- 任何一行不超过 79 列，中英文都是；任何地方没有连着两行空行。
- 深色、浅色两种背景上，暗淡的段标题横线、不可选的行、洋红的焦点符号都看得清。
