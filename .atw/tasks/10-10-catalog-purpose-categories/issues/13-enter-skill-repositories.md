# 13 — 录入 31 个 skill 仓库

**What to build:** 「汇总」文档里标了 Skill、还不在本仓库里的 31 个仓库进目录。逐个试装通过的登记为第三方 Skill，用户能在安装器里勾选并装上；不适合这样装的登记为外部项目，只给说明和链接。

**Blocked by:** 09, 12
**Status:** ready-for-agent
**Impl:** ready

- [ ] 归类照 `research/skill-intake-analysis.md` 的「31 个仓库的归类提议」：24 个作为第三方 Skill；Agent-Reach、ui-ux-pro-max-skill、graphify、Understand-Anything 四个先作为外部项目（它们的官方安装命令等维护者在虚拟机里试通）；ppt-master、ai-website-cloner-template、webnovel-writer 三个是外部项目。每个仓库在目录里恰好一条。
- [ ] 每个要登记为第三方 Skill 的仓库先用 skills CLI 的「只列出不安装」取它的 skill 清单，名字以它列出的为准——不凭目录名，也不凭那份分析里子代理的报告。
- [ ] 每个第三方 Skill 试装：在临时主目录里（主目录和宿主的配置目录都指到临时目录并断言）对两个宿主各静默装一次，退出状态为 0，目标位置下有 `SKILL.md`。含多个 skill 的，清单里的每一个都试到。
- [ ] 试不通的改登记为外部项目，并在试装记录里写明原因。
- [ ] 分析里留下没核对的两件事在这里核对：pua 一个仓库里有 46 份 `SKILL.md`，去重后实际装上的是哪一份、有哪些 skill；GordenPPTSkill 的模板是否完整取到。
- [ ] 来源写仓库现在的地址：改过名或转移过的（graphify、Understand-Anything、andrej-karpathy-skills、prompt-architect）用现名。
- [ ] 含多个 skill 的仓库，清单列出上游的全部 skill，不替用户筛掉。sammcj/agentic-coding 例外：文档收的只是其中的 analyse-design，清单里只有这一个。
- [ ] 清单里每个 skill 有中英文各一句说明，写「它做什么」。
- [ ] 有前提或风险的在说明里写明，至少包括：靠插件才完整的（pua、ponytail、i-have-adhd、caveman、impeccable——这样装上是基本功能，完整功能要按官方方式装插件）；caveman 里依赖付费账号、另一个程序或插件的那些；oh-story-claudecode 装后要在写作项目里运行一次它的初始化、`browser-cdp` 会结束用户正在运行的浏览器、`story-cover` 要 key 并外发内容；nuyoah-image-reverse-prompt 默认给产出的提示词加署名；需要另装 Python、Node 或别的程序才能用的；体积很大的（GordenPPTSkill 约 100MB）；首次运行会自己联网下载程序或自更新的。
- [ ] 实测只在某一个宿主下能用的，写上宿主限制。
- [ ] 每条有一个用途（它在文档里所在的大标题）、中英文各一句条目说明、官方链接。不给任何条目加推荐标记。
- [ ] 试装记录写进任务目录的 `research/`：每个仓库列出了哪些 skill、在哪个宿主下试的、结果、没试通的原因。
- [ ] 上游核对命令对仓库真实的目录数据跑过一遍并通过，输出记进任务目录。
- [ ] 目录校验命令对仓库真实的目录数据通过。
