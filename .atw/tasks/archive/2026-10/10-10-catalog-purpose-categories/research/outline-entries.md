# 「汇总」文档的条目清单（快照）

> 2026-10-10 取自 Outline「AI」文档集的「汇总」文档（修订 9，https://note.chinhae.cc/doc/5rgh5oc7-h8ZTIuEuJN ）。只留了名字、链接、文档里的形态标签和所在的标题；每条的说明文字没有抄，录入时回原文档取。
> 标签是文档的写法，不是目录的类型：文档里的 `工具` 含桌面与网页应用，`工作流框架`、`开发库`、`资源` 在目录里没有对应的类型。归类规则见 `interview-decisions.md`，31 个 skill 仓库的归类见 `skill-intake-analysis.md`。
> 文档小标题在目录里不保留（用途只有一层），这里留着只为了好找。

## 1. 开发工作流与规范

规范驱动（Spec）
- `工作流框架` spec-kit — https://github.com/github/spec-kit
- `工作流框架` OpenSpec — https://github.com/Fission-AI/OpenSpec

自主循环（Ralph Loop）
- `工具` autoloop — https://github.com/armgabrielyan/autoloop
- `工具` ralph — https://github.com/snarktank/ralph
- `工具` ralphy — https://github.com/michaelshimeles/ralphy
- `工具` open-ralph-wiggum — https://github.com/Th0rgal/open-ralph-wiggum

## 2. Agent 行为约束与输出风格

- `Skill` `在用` unlazy — https://github.com/Leonxlnx/unlazy （已在仓库）
- `Skill` pua — https://github.com/tanweai/pua
- `Skill` i-have-adhd — https://github.com/ayghri/i-have-adhd
- `Skill` ponytail — https://github.com/DietrichGebert/ponytail
- `Skill` andrej-karpathy-skills — https://github.com/forrestchang/andrej-karpathy-skills （克隆来源是 multica-ai/andrej-karpathy-skills）
- `MCP` cunzhi — https://github.com/imhuso/cunzhi

## 3. 代码库索引与理解

- `MCP` `在用` codebase-memory-mcp — https://github.com/DeusData/codebase-memory-mcp
- `MCP` `工具` `在用` Graft — https://github.com/trailhq/Graft
- `MCP` acemcp — https://github.com/qy527145/acemcp
- `MCP` ace-tool — https://github.com/MistRipple/ace-tool
- `MCP` ace-tool-rs — https://github.com/missdeer/ace-tool-rs
- `MCP` codegraph — https://github.com/colbymchenry/codegraph
- `MCP` `工具` code-review-graph — https://github.com/tirth8205/code-review-graph
- `Skill` graphify — https://github.com/Graphify-Labs/graphify
- `Skill` Understand-Anything — https://github.com/Egonex-AI/Understand-Anything
- `工具` `MCP` FastCode — https://github.com/HKUDS/FastCode
- `工具` auggie — https://github.com/augmentcode/auggie
- `工具` mgrep — https://github.com/mixedbread-ai/mgrep

## 4. 上下文、记忆与 Token 优化

记忆与知识库
- `MCP` memorix — https://github.com/AVIDS2/memorix
- `工具` claude-mem — https://github.com/thedotmack/claude-mem
- `工具` sivtr — https://github.com/Ariestar/sivtr
- `工具` openrag — https://github.com/langflow-ai/openrag

上下文压缩与 Token 节省
- `Skill` caveman — https://github.com/juliusbrussee/caveman
- `MCP` context-mode — https://github.com/mksglu/context-mode
- `工具` `MCP` Headroom — https://github.com/headroomlabs-ai/headroom
- `工具` rtk — https://github.com/rtk-ai/rtk
- `工具` opencode-dynamic-context-pruning — https://github.com/Opencode-DCP/opencode-dynamic-context-pruning

## 5. 联网搜索与文档检索

- `Skill` Agent-Reach — https://github.com/Panniantong/Agent-Reach
- `Skill` web-access — https://github.com/eze-is/web-access
- `Skill` AnySearch Skill — https://github.com/anysearch-ai/anysearch-skill
- `Skill` last30days-skill — https://github.com/mvanhorn/last30days-skill
- `MCP` `在用` context7 — https://github.com/upstash/context7
- `MCP` GrokSearch-rs — https://github.com/Episkey-G/GrokSearch-rs
- `MCP` firecrawl-mcp-server — https://github.com/firecrawl/firecrawl-mcp-server
- `MCP` GrokSearch — https://github.com/GuDaStudio/GrokSearch

## 6. 浏览器自动化

- `MCP` `在用` chrome-devtools-mcp — https://github.com/ChromeDevTools/chrome-devtools-mcp
- `MCP` `在用` Playwright MCP — https://github.com/microsoft/playwright-mcp
- `工具` `在用` Playwright CLI — https://github.com/microsoft/playwright-cli
- `工具` ego lite — https://github.com/citrolabs/ego-lite
- `开发库` playwright — https://github.com/microsoft/playwright
- `开发库` Page Agent — https://github.com/alibaba/page-agent

## 7. UI 设计、图像与视频

UI 设计规范与审美
- `Skill` Taste Skill — https://github.com/Leonxlnx/taste-skill
- `Skill` ui-ux-pro-max-skill — https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- `Skill` hallmark — https://github.com/Nutlope/hallmark
- `Skill` Impeccable — https://github.com/pbakaus/impeccable
- `Skill` skills（emilkowalski）— https://github.com/emilkowalski/skills
- `Skill` analyse-design — https://www.skills.sh/sammcj/agentic-coding/analyse-design （**不进目录**：维护者 2026-10-11 决定去掉，原因见 `prd.md` 的 Further Notes 第 20 条；「汇总」文档本身没有动）
- `资源` design.md — https://github.com/google-labs-code/design.md
- `资源` awesome-design-md — https://github.com/VoltAgent/awesome-design-md

设计工具与组件库
- `MCP` shadcn-ui-mcp-server — https://github.com/Jpisnice/shadcn-ui-mcp-server
- `工具` open-design — https://github.com/nexu-io/open-design
- `工具` Penpot — https://github.com/penpot/penpot
- `开发库` galaxy — https://github.com/uiverse-io/galaxy
- `开发库` Canvas UI — https://github.com/DavidHDev/canvas-ui

设计还原（网站 / 截图转代码）
- `Skill` AI Website Cloner Template — https://github.com/JCodesMore/ai-website-cloner-template
- `工具` screenshot-to-code — https://github.com/abi/screenshot-to-code
- `工具` ui-screenshot-to-prompt — https://github.com/s-smits/ui-screenshot-to-prompt

图像生成与反推提示词
- `Skill` nuyoah-image-reverse-prompt — https://github.com/nuyoah-ai-works/nuyoah-image-reverse-prompt
- `工具` Zhijuan Prompt Card — https://github.com/papperrollinggery/zhijuan-prompt-card
- `资源` awesome-gpt-image-2 — https://github.com/freestylefly/awesome-gpt-image-2

视频、动效与视觉
- `Skill` onetake — https://github.com/feitangyuan/onetake （已在仓库）
- `工作流框架` OpenMontage — https://github.com/calesthio/OpenMontage
- `开发库` supervision — https://github.com/roboflow/supervision

## 8. 文档处理

PDF
- `工具` MinerU — https://github.com/opendatalab/MinerU
- `工具` Stirling-PDF — https://github.com/Stirling-Tools/Stirling-PDF
- `开发库` pdf-inspector — https://github.com/firecrawl/pdf-inspector

PPT
- `Skill` Gorden PPT Skill — https://github.com/GordenSun/GordenPPTSkill
- `Skill` paper-craft-skills — https://github.com/zsyggg/paper-craft-skills
- `Skill` Guizang PPT Skill — https://github.com/op7418/guizang-ppt-skill
- `Skill` PPT Master — https://github.com/hugohe3/ppt-master
- `Skill` ppt-agent-skills — https://github.com/sunbigfly/ppt-agent-skills
- `工具` OfficeCLI — https://github.com/iOfficeAI/OfficeCLI

Excel
- `MCP` excel-mcp-server — https://github.com/haris-musa/excel-mcp-server
- `工具` sv-excel-agent — https://github.com/SylvianAI/sv-excel-agent

Word
- `MCP` Office-Word-MCP-Server — https://github.com/GongRzhe/Office-Word-MCP-Server

图表与可视化
- `Skill` `在用` archify — https://github.com/tt-a1i/archify （已在仓库）
- `Skill` drawio-skill — https://github.com/Agents365-ai/drawio-skill

格式转换与编辑
- `工具` Pandoc — https://github.com/jgm/pandoc
- `工具` PasteMD — https://github.com/RICHQAQ/PasteMD
- `工具` markitdown — https://github.com/microsoft/markitdown
- `工具` pafcraft（PDFCraft）— https://github.com/PDFCraftTool/pdfcraft
- `工具` Word-Formatter-Pro — https://github.com/cwyalpha/Word-Formatter-Pro

## 9. 提示词与写作

提示词优化
- `Skill` prompt-architect — https://github.com/ckelsoe/prompt-architect
- `工具` prompt-optimizer — https://github.com/linshenkx/prompt-optimizer
- `开发库` DSPy + GEPA — https://dspy.ai/api/optimizers/GEPA/overview/

去 AI 味与降重
- `Skill` `在用` shuorenhua — https://github.com/MrGeDiao/shuorenhua （已在仓库）
- `Skill` Humanizer-zh — https://github.com/op7418/Humanizer-zh
- `Skill` academic-humanizer — https://github.com/AIScientists-Dev/academic-humanizer
- `工具` BypassAIGC — https://github.com/chi111i/BypassAIGC

小说创作
- `Skill` chinese-novelist-skill — https://github.com/PenglongHuang/chinese-novelist-skill
- `Skill` oh-story-claudecode — https://github.com/zenstory-ai/oh-story-claudecode
- `Skill` webnovel-writer — https://github.com/lingfengQAQ/webnovel-writer
- `工具` MuMuAINovel — https://github.com/xiamuceer-j/MuMuAINovel

## 10. 代码审查、评估与安全

- `工具` open-code-review — https://github.com/alibaba/open-code-review
- `工具` Plannotator — https://github.com/backnotprop/plannotator
- `工具` shannon — https://github.com/KeygraphHQ/shannon
- `开发库` agent-as-a-judge — https://github.com/metauto-ai/agent-as-a-judge

## 仓库里已有、文档里没有的 skill

explanation、if5、oxy-learning-hub、show-me、pr、retro、wizard、writing-for-agents。

**它们不进任何用途，只在「推荐」里**（维护者 2026-10-10 纠正：凡是他手动放进仓库的都属于「推荐」）。上面标了「已在仓库」的 archify、onetake、unlazy、shuorenhua 同样在「推荐」里；它们同时留在文档给的用途下，两处都出现（维护者确认）。
