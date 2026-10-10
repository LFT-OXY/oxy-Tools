# 04 — 录入其余条目为外部项目

**What to build:** 「汇总」文档里既不是 MCP 也不是 Skill 的 47 个条目（文档标为工具、工作流框架、开发库、资源的）进目录，登记为外部项目：用户能在安装器里看到它们各自的说明和官方链接。

**Blocked by:** 02
**Status:** ready-for-agent
**Impl:** done

- [x] 范围是 `research/outline-entries.md` 里标签既不含 `MCP` 也不含 `Skill` 的全部条目。每个条目在目录里恰好一条。
- [x] 全部登记为外部项目。文档里标 `工具` 的也一样——工具的安装命令要在维护者的虚拟机里试，本任务不做（见 `prd.md` 的 Out of Scope）。
- [x] 每条有一个用途（它在文档里所在的大标题）、中英文各一句说明（写「它做什么」，句末不加句号）、`https://` 开头的官方链接。名字是小写 kebab-case。说明回原文档取，改写成一句话，不照抄宣传语。
- [x] 不给任何条目加推荐标记。
- [x] 在任务目录的 `research/` 里另列一张清单：其中哪些看起来一条官方命令就能装上（如 rtk、mgrep、Playwright CLI、Pandoc、markitdown），各自的官方安装命令和怎么判断装好了——供维护者以后在虚拟机里试通后改成工具。这张清单只是记录，不改变它们现在作为外部项目登记。
- [x] 目录校验命令对仓库真实的目录数据通过。

## Comments

**2026-10-10 实现记录**

- 47 个条目全部登记为外部项目（`catalog.json` 的 `apps`，10 条 → 57 条），都没有推荐标记。各自在目录里的名字和用途见 `research/external-project-entries.md`。
- 说明取自「汇总」文档（取的时候是修订 10，范围内的 47 条与修订 9 的快照一致），对照了 46 个 GitHub 仓库当天的官方简介和 README、DSPy + GEPA 链接指向的那一页。46 个仓库都在、都没有归档。
- 核对：`npm run validate-catalog -- ..` 输出 `目录校验通过：12 个 skill、11 个 MCP、0 个工具、57 个应用项目、10 个用途`；一段对账脚本拿快照和目录按链接逐条对，录入前报 47 条缺失，录入后 `范围内 47 条，apps 共 57 条`、`全部对得上`（脚本在录入记录里）。
- 候选清单：18 个看起来一条官方命令能装上的，各有官方命令、怎么算装好了、前提；其余 29 个各有没进清单的原因。**没有运行过其中任何一条安装命令。**
- 工单没有规定、实现时定下的：名字照仓库名转成小写 kebab-case、不拆词（`design.md` → `design-md`，`DSPy + GEPA` → `dspy-gepa`，文档里的笔误「pafcraft」→ `pdfcraft`）；`apps` 里的 `playwright`（开发库）与 `mcps` 里的 `playwright` 同名；`opencode-dynamic-context-pruning` 的仓库换了所有者（现在是 `Tarquinen/…`），目录里仍写文档的链接；Playwright CLI 的说明把文档的说法和 README 的定位都写了进去；Page Agent 的说明照 README 收紧（没有写「无须后端」）；数组里的先后照文档的顺序，和工单 03 的 10 条穿插。
- 没有改代码。类型检查通过；全部测试 643 条在 Node 24.15 上通过（只改了数据，测试不读仓库真实的目录，没有在 22.13 上再跑）。没有拿 0.2.0 再读一遍（没有改格式），没有在真实终端里看 57 条的列表。
- 评审之后改的：10 条说明（`awesome-design-md` 改成一句且不照抄简介；`zhijuan-prompt-card`、`sv-excel-agent`、`shannon`、`word-formatter-pro` 离上游简介远一点；`page-agent` 去掉 README 里没有的「不需要后端」；`bypassaigc` 的效果改写成目的；`plannotator` 的英文不用祈使句；「插件 / 扩展」统一成扩展；`playwright-cli` 见上）；候选清单里 `claude-mem` 的「怎么算装好了」从「待定」改成一个可试的路径；规范里过时的条数。
- 评审留下没改的判断题：`opencode-dynamic-context-pruning` 的链接写旧地址还是新地址、说明里要不要注「开发已放缓」；说明末尾的括号只注了 5 条看得到的前提，没有逐条查全；`mumuainovel`、`bypassaigc`、`galaxy` 这几个名字看不出词界（先前的 `grok-search-rs` 是拆了词的）；`spec-kit`、`openspec`、`openrag`、`ego-lite`、`openmontage`、`dspy-gepa` 的说明里用了冒号，算不算「一句」。
