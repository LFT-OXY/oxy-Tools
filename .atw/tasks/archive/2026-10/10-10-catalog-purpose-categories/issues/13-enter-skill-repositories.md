# 13 — 录入 30 个 skill 仓库

**What to build:** 「汇总」文档里标了 Skill、还不在本仓库里的 31 个仓库，除去维护者 2026-10-11 决定不收的 sammcj/agentic-coding，其余 30 个进目录。逐个试装通过的登记为第三方 Skill，用户能在安装器里勾选并装上；不适合这样装的登记为外部项目，只给说明和链接。

**Blocked by:** 09, 12
**Status:** ready-for-agent
**Impl:** done

- [x] 归类照 `research/skill-intake-analysis.md` 的「31 个仓库的归类提议」，去掉 sammcj/agentic-coding：23 个作为第三方 Skill；Agent-Reach、ui-ux-pro-max-skill、graphify、Understand-Anything 四个先作为外部项目（它们的官方安装命令等维护者在虚拟机里试通）；ppt-master、ai-website-cloner-template、webnovel-writer 三个是外部项目。每个仓库在目录里恰好一条。
- [x] 每个要登记为第三方 Skill 的仓库先用 skills CLI 的「只列出不安装」取它的 skill 清单，名字以它列出的为准——不凭目录名，也不凭那份分析里子代理的报告。
- [x] 每个第三方 Skill 试装：在临时主目录里（主目录和宿主的配置目录都指到临时目录并断言）对两个宿主各静默装一次，退出状态为 0，目标位置下有 `SKILL.md`。含多个 skill 的，清单里的每一个都试到。
- [x] 试不通的改登记为外部项目，并在试装记录里写明原因。 —— 200 次试装都通过，没有改登记的。
- [x] 分析里留下没核对的两件事在这里核对：pua 一个仓库里有 46 份 `SKILL.md`，去重后实际装上的是哪一份、有哪些 skill；GordenPPTSkill 的模板是否完整取到。
- [x] 来源写仓库现在的地址：改过名或转移过的（graphify、Understand-Anything、andrej-karpathy-skills、prompt-architect）用现名。
- [x] 含多个 skill 的仓库，清单列出上游的全部 skill，不替用户筛掉，没有例外。
- [x] sammcj/agentic-coding（文档里的 analyse-design）不录入，也不作为外部项目：维护者 2026-10-11 决定去掉。它一个仓库里有 55 个 skill 而文档只要其中一个，只登记一个的话上游核对命令会一直报另外 54 个没登记。
- [x] 清单里每个 skill 有中英文各一句说明，写「它做什么」。
- [x] 有前提或风险的在说明里写明，至少包括：靠插件才完整的（pua、ponytail、i-have-adhd、caveman、impeccable——这样装上是基本功能，完整功能要按官方方式装插件）；caveman 里依赖付费账号、另一个程序或插件的那些；oh-story-claudecode 装后要在写作项目里运行一次它的初始化、`browser-cdp` 会结束用户正在运行的浏览器、`story-cover` 要 key 并外发内容；nuyoah-image-reverse-prompt 默认给产出的提示词加署名；需要另装 Python、Node 或别的程序才能用的；体积很大的（GordenPPTSkill 约 100MB）；首次运行会自己联网下载程序或自更新的。 —— 都是读装出来的文件和 README 所得，没有实际运行任何一个 skill；出处逐条记在试装记录里。
- [x] 实测只在某一个宿主下能用的，写上宿主限制。 —— **没有一条写了宿主限制**：实测的只是装不装得上，两个宿主都装得上；读出来偏向某个宿主的写在说明里（见 Comments）。
- [x] 每条有一个用途（它在文档里所在的大标题）、中英文各一句条目说明、官方链接。不给任何条目加推荐标记。
- [x] 试装记录写进任务目录的 `research/`：每个仓库列出了哪些 skill、在哪个宿主下试的、结果、没试通的原因。
- [x] 上游核对命令对仓库真实的目录数据跑过一遍并通过，输出记进任务目录。
- [x] 目录校验命令对仓库真实的目录数据通过。

## Comments

**录入的结果**：`thirdPartySkills` 23 条、共 100 个 skill；`apps` 多 7 条（64 条）。目录校验命令 `目录校验通过：12 个 skill、23 个第三方 Skill、11 个 MCP、0 个工具、64 个应用项目、10 个用途`，上游核对命令 `上游核对通过：23 个第三方 Skill，共 100 个 skill`，都以 0 退出。试装的做法、每个仓库的结果、pua 和 GordenPPTSkill 两件事的核对、说明里每句前提的出处在 `research/skill-trial-record.md`，原始结果在 `research/skill-trial-results.jsonl`。

实现时定下、维护者没有逐条确认的（同时记在 `prd.md` 的 Further Notes 第 21 条，规矩写进了 `.atw/spec/skills/manifest-versioning.md` 的「往目录里加一条第三方 Skill」）：

- **宿主限制一条都没写**。没有在任何宿主里实际用过任何一个 skill，「只在某一个宿主下能用」无从实测。`impeccable` 两个宿主装上的都是给 Codex 编的那一份（Claude Code 里命令的写法对不上），`web-access` 的脚本路径用的是 Claude Code 的变量，`image-to-code` 自称给 Codex 写的——都只写在说明里。要不要据此给它们加 `hosts`，等维护者定。
- **只含一个 skill 的条目，条目的说明和那个 skill 的说明是同一句**：这种条目不出清单，用户只看得到条目的说明（评审指出的，最初有几条风险只写在了 skill 的说明里）。
- `caveman` 登记了全部 22 个；要 Caveman Cloud 的 5 个按官网价目页写成「付费」。
- 名字：`emilkowalski-skills`、`gorden-ppt-skill`；`url` 和 `source` 都写仓库现在的地址。
- `ppt-master` 的 README 现在也给了 `npx skills add` 的装法，没有试，照工单登记为外部项目。

留给后面的：

- **汇总表在 skill 名字长的时候超过 80 列**（勾 `emilkowalski-skills` 的全部 14 个时最宽的一行 99 列，位置一栏被终端折行）。规范允许路径超出 80 列，没有改；工单 14 做整体视觉核对时看。
- 带着前提的说明比原有条目长得多（最长 188 个字），列表里会被截断，全文在列表下方。
- 维护者本机原本就装着一个 `gorden-ppt-skill`：在真实的机器上勾这一条，安装器会先问要不要覆盖。
- 这张工单没有改代码，测试没有在 Node 22.13 上另跑；Node 24 上类型检查和 961 个测试通过。
