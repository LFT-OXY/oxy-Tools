# Oxyteam Trellis Overlay 改动清单

**这是权威文件清单。** Apply、记账、`trellis update` 后的比对，全部以本文件为准；与其他参考冲突时以本文件为准。

存在的理由：曾经出现过没有任何人说得清 Overlay 到底改了哪些文件的情况——`trellis update --dry-run` 报 12 个，实际改了 13 个，多出来的 `linear_sync.py` 被三轮审计加一次外部复核全部漏掉。

> **2026-08-18 改版：支持范围从 Oh My Pi 一个平台扩到 OMP + Claude Code + Codex 三个。**
> 编号随之重排：原来的 B 组拆成 **B（共享层）** 和 **P（平台层）**，C 组改成按角色编号、每平台各有落点。
> 设计依据见《Oxyteam-Trellis-Overlay 大白话设计说明》第 16 节。

> **改动一律拿现成件，不要现写。** 本 Skill 目录下：
>
> ```text
> scripts/       可执行文件，原样拷进 .trellis/scripts/
> templates/     整篇替换的文件，路径镜像落点（templates/trellis/ → .trellis/）
> references/edits.md   只改几处的：逐字锚点替换表
> ```
>
> 让模型照描述现写的后果已经踩过一次：`workers.md` 那「3 处」里有一处是 worker 自己的
> 文件路径，按描述改会把 worker 定义指向不存在的路径。**已有现成件的条目，本文件只写
> 「拷哪个」，不再复述内容。** 哪些还没做成现成件，见 `edits.md` 末尾的「未完成」。

## 总账

```text
A 新建自有                  3        0 冲突点，与平台数无关
B 修改官方 · 共享层          5        改一次，所有平台都生效
P 修改官方 · 平台层     每平台 8~9    每个已装平台各改一套
C 删除官方 · 平台层     每平台 6      永久，update 尊重删除
D Team Skill 与 init 模板    5        随 Skill Pack v0.3.0 发布，不在 Overlay 安装时改
E 撤销历史修改               7        仅当预检发现旧版 Overlay 痕迹
```

按已装平台数展开：

```text
                只装 OMP   +Claude   三平台全装
A 新建               3         3          3
B 共享层改           5         5          5
P 平台层改           8        17         26      OMP 8 / Claude 9 / Codex 9
───────────────────────────────────────────
改官方合计          13        22         31
C 删                 6        12         18
```

Installer 落地 reconcile 能力后 `trellis-meta` 由声明转删除，每平台 -1 改 + 24 删：三平台全装变成 **28 改 / 90 删**。

**平台数是乘数。** 只对项目里实际装了的平台执行 P 组和 C 组，不要给没装的平台预建目录。

---

## 平台落点对照

来源是 Trellis `dist/types/ai-tools.js` 的 `AI_TOOLS` 注册表；下面的路径由 `collectPlatformTemplates()` 实跑导出，不是从文档抄的。

| | OMP | Claude Code | Codex |
|---|---|---|---|
| CLI flag | `--omp` | `--claude` | `--codex` |
| 官方装了几个文件 | 49 | 52 | 54 |
| 主目录 | `.omp/` | `.claude/` | `.codex/` |
| Skill 目录 | `.omp/skills/` | `.claude/skills/` | **`.agents/skills/`（跨工具共享层）** |
| 命令 | `.omp/commands/trellis-*.md` | `.claude/commands/trellis/*.md` | **没有命令，全部当 skill** |
| 子 Agent | `.omp/agents/trellis-*.md` | `.claude/agents/trellis-*.md` | **`.codex/agents/trellis-*.toml`（TOML）** |
| 注入机制 | `extensions/trellis/index.ts`（1 个 TS 文件） | `.claude/hooks/*.py`（3 个，`settings.json` 全注册） | `.codex/hooks/*.py`（装 3 个，`hooks.json` **只注册 2 个**） |
| 多出来的入口 | 无 | 无 | `.agents/skills/trellis-start/` |

**`.agents/skills/` 要单独留意**：Codex、Gemini CLI、Pi、Kimi Code、dsh 共读这一层。在这儿删 `trellis-brainstorm/` 是把这几个工具一起删了，不是只对 Codex 生效。预检必须列出项目里还装了哪些读这一层的平台，并在计划里写明波及面。

---

## A 组：新建自有文件（5，0 冲突）

官方模板里没有这些路径，不会进 `changedFiles`，永远不冲突。与平台数无关，装几个平台都只建一次。

| # | 路径 | 职责 |
|---|---|---|
| A1 | `.trellis/scripts/oxyteam_tickets.py` | 解析 `issues/*.md`、算 Frontier、claim/done、summary；**claim 时把当前票路径写进 `<task>/implement.jsonl`**（见 P1 说明） |

| A2 | `.trellis/scripts/hooks/github_sync.py` | 任务目录 → 远程 GitHub 单向同步。**拷 `scripts/hooks/github_sync.py`**，票的解析复用 `oxyteam_tickets.py`，不是第二个解析器 |
| A3 | `.trellis/.oxyteam-overlay.json` | Installer 记账：Overlay 版本 + **已装平台清单** + 逐文件 hash + tombstone。**由 `scripts/write_overlay_state.py` 生成，不要手写 JSON 手算 hash**（用法见 `edits.md` 末尾） |
| A4 | `.trellis/scripts/verify_workflow.py` | 校验 B1 落盘后的 `workflow.md` 结构。**拷 `scripts/verify_workflow.py`** |
| A5 | `.trellis/scripts/write_overlay_state.py` | 生成和校验 A3。**拷 `scripts/write_overlay_state.py`** |

A4 / A5 是后加的，编号排在 A3 之后只是为了不动 A1–A3 的既有交叉引用，**不代表落盘顺序**：
两个脚本都要在 A3 之前拷进去（A3 由 A5 生成）。四个脚本一个都不能少 ——
应用计划里凑不齐 5 条就是漏了。

**A1 是拷贝，不是现写。** 源文件在本 Skill 的 `scripts/oxyteam_tickets.py`，原样复制到 `.trellis/scripts/`，**不要让模型即兴实现一个票解析器**——`task-model.md` 的三条硬校验（Blocker 不存在 / 成环 / claim 不在 frontier）和归档门禁全挂在它身上，每个项目一份不同的实现，那就不叫硬校验了。

拷完立刻验一次，它不依赖仓库状态、Active Task 或 git：

```bash
python3 .trellis/scripts/oxyteam_tickets.py selfcheck   # 输出「selfcheck 通过」
```

A2 同样是拷贝，落盘后跑 `python3 .trellis/scripts/hooks/github_sync.py selfcheck`。A3 的格式见 `update-policy.md`——**本版起 `files` 里必须带平台维度**，否则装了新平台后分不清「这个路径没改过」和「这个平台还没装」。

---

## B 组：修改官方文件 · 共享层（5）

这五个在 `.trellis/` 和仓库根，跟平台无关，**改一次所有平台都生效**。

| # | 路径 | 改什么 |
|---|---|---|
| B1 | `.trellis/workflow.md` | **拷 `templates/trellis/workflow.md`，整篇替换。** 拷完跑 `python3 .trellis/scripts/verify_workflow.py`，不通过就回滚 |
| B2 | `AGENTS.md` | 声明 `prd.md` 装的是 Oxyteam Spec、`issues/` 是实施票；加一行指向 `.trellis/spec/` 作为编码规范与审查 Standards 源。**追加在 managed block 外面，逐字改法见 `edits.md`** |
| B3 | `.trellis/config.yaml` | `hooks:` 段取消注释，挂 `github_sync.py` 的 `after_create` / `after_archive`。**逐字改法见 `edits.md`** |
| B4 | `.trellis/agents/implement.md` | **拷 `templates/trellis/agents/implement.md`，整篇替换。** channel worker，读取列表换成 `prd.md` + 当前票 + `implement.jsonl` + `.trellis/spec/`；**保留「Forbidden: git commit」**——它是受主会话监管的并行工人，主会话负责收口 |
| B5 | `.trellis/agents/check.md` | **拷 `templates/trellis/agents/check.md`，整篇替换。** 读取列表同上；审查方法改成提示用户运行 `/oxyteam-code-review`，**去掉 self-fix** |

> **B2 没有永久成本 —— 前提是写在 block 外面。** managed block 自己写着 "edits inside may be overwritten by a future `trellis update`"，但 `commands/update.js` 的 `mergeManagedBlockContent()` 只替换 `START..END` 之间，slice 保留前后，产出的「期望内容」也含 block 外的东西，hash 比对因此一致。**追加在 `<!-- TRELLIS:END -->` 之后，零冲突、零重付**；改进 block 里才是每次升级重付一次。逐字改法见 `edits.md`。

> `.trellis/agents/implement.md` 原文就写着「读 `.trellis/spec/` 项目规范（只加载与本次 diff 相关的）」——这正是把 `trellis-before-dev` 的能力并进 implement 前置的做法，照抄即可，不用新设计。

---

## P 组：修改官方文件 · 平台层（每平台 8~9）

**按角色编号，每个角色在各平台落到不同路径。** 只对已装平台执行。

**P3–P6 整篇替换，拷 `templates/` 下的镜像路径**（`.omp/commands/trellis-continue.md` ←
`templates/omp/commands/trellis-continue.md`，Codex 的 `.agents/skills/**` ←
`templates/agents/skills/**`）。**P1 P2 P7–P10 只改几处，走 `edits.md` 的逐字锚点表**，
不要整篇纳管 —— `inject-workflow-state.py` 475 行、`session-start.py` 949 行、
`index.ts` 592 行，整篇纳管等于每次 `trellis update` 都要全文 diff。

拷完跑 `python3 scripts/verify_overlay_templates.py`：抓残留旧引用、错子命令、
未渲染变量，以及**三平台正文漂移**（同一份 continue 落三个地方，改了一处忘了另两处
是静默失败）。

| # | 角色 | OMP | Claude Code | Codex |
|---|---|---|---|---|
| P1 | 每轮状态注入 | `.omp/extensions/trellis/index.ts` | `.claude/hooks/inject-workflow-state.py` | `.codex/hooks/inject-workflow-state.py` |
| P2 | 会话启动注入 | *（P1 同一文件，不另计）* | `.claude/hooks/session-start.py` | — |
| P3 | 会话引导入口 | — | — | `.agents/skills/trellis-start/SKILL.md` |
| P4 | continue 路由 | `.omp/commands/trellis-continue.md` | `.claude/commands/trellis/continue.md` | `.agents/skills/trellis-continue/SKILL.md` |
| P5 | finish 门禁 | `.omp/commands/trellis-finish-work.md` | `.claude/commands/trellis/finish-work.md` | `.agents/skills/trellis-finish-work/SKILL.md` |
| P6 | implement 子 Agent | `.omp/agents/trellis-implement.md` | `.claude/agents/trellis-implement.md` | `.codex/agents/trellis-implement.toml` |
| P7 | channel workflows | `.omp/skills/trellis-channel/references/workflows.md` | `.claude/skills/…/workflows.md` | `.agents/skills/…/workflows.md` |
| P8 | channel workers | `.omp/skills/trellis-channel/references/workers.md` | `.claude/skills/…/workers.md` | `.agents/skills/…/workers.md` |
| P9 | channel forum | `.omp/skills/trellis-channel/references/forum.md` | `.claude/skills/…/forum.md` | `.agents/skills/…/forum.md` |
| P10 | trellis-meta 声明 | `.omp/skills/trellis-meta/SKILL.md` | `.claude/skills/trellis-meta/SKILL.md` | `.agents/skills/trellis-meta/SKILL.md` |
| | **合计** | **8** | **9** | **9** |

### P1 每轮状态注入

两处改动：

```text
① 解析当前状态
   现在：只返回 task.json.status（三档）
   改成：优先读 meta.flow_stage，不合法或不存在时回退 status，无任务返回 no_task

② 注入当前票
   主会话侧：读 issues/ 下 Impl: doing 的那张，连同 frontier 摘要一起注入
```

改点位置：OMP 是 `resolveActiveTaskStatus()`；Python 是 `inject-workflow-state.py:179` 的 `status = data.get("status", "")`。

**OMP 还要加一条**：每个新用户输入 `TurnContextCache.beginTurn()` 先清旧 key 再重建快照。Claude / Codex 不需要——`inject-workflow-state.py` 每次用户输入都是全新 Python 进程，读完就退出，没有缓存可以过期。

**`inject-subagent-context.py` 不改**（Claude 和 Codex 各有一份，1174 行）。子代理拿当前票走 `<task>/implement.jsonl`，由 A1 的 `claim` 负责写入和切票时换行。这条三个平台同时成立（OMP `index.ts:303`、Python hook 都读它），等于用官方 manifest 这一个已有机制统一了「子代理怎么拿到当前票」，省下两个平台各一个永久冲突点。

**`inject-workflow-state.py` 在 Claude 和 Codex 是字节相同的官方模板**——Overlay 的补丁写一份、应用两次。A3 的记账模型（每个 path 一组 `upstream_hash` / `applied_hash`）天然支持，不用改结构。

### P2 / P3 会话启动：Claude 和 Codex 各多一个必改项，但不是同一个文件

OMP 的 `index.ts` 很干净：只读 `prd.md` / `info.md` / jsonl，全文没提过 `design.md`、`implement.md` 或任何 bundled skill 名。Python 侧不是：

```text
shared-hooks/session-start.py:482       "Next-Action: Load `trellis-brainstorm` and write `prd.md`."
                             :488-489   提示复杂任务补 design.md / implement.md
                             :513       "context order is jsonl -> prd.md -> design.md -> implement.md"
                             :892-896   同一句话在 <guidelines> 段又写了一份 ← 在替换区间外
common/commands/start.md:39-40,53-56    指路四个已删 Skill + design.md / implement.md
                                        （Codex 落到 .agents/skills/trellis-start/SKILL.md）
```

**`:892-896` 是实测装完才发现的。** 前四处都落在 `_get_task_status()`（424–514）里，整函数替换一并解决；
这一处在函数外，只做整函数替换会把它漏掉，而 `edits.md` 要求的「grep 确认为 0」正是靠它兜底。
逐字改法见 `edits.md` 的 **P2-b**。

`trellis-brainstorm` 在 C 组是被删掉的。**不改这两个文件，Claude Code 和 Codex 的每个新会话都会被指向一个不存在的 Skill，并被要求创建本版明确不再使用的 `design.md` / `implement.md`。**

**`.codex/hooks/session-start.py` 不用改。** 实测 `.codex/hooks.json` 只注册两个事件——`UserPromptSubmit` → `inject-workflow-state.py`、`SubagentStart` → `inject-subagent-context.py`，全文没有 session-start，`config.toml` 里也没有。它是躺在磁盘上的死文件，里面 `:277,286,296` 那三处旧引用不产生任何行为。**留着不动，也不要花力气去修它。**

### P4 / P5 continue 与 finish

改法三平台一致，只是落点不同：

```text
P4  路由改成按 flow_stage + frontier 判断
    不再按 prd.md / design.md / implement.md 是否存在判断
P5  归档门禁加「所有票 Impl: done」
```

Codex 上这两个是 skill 不是 command（Codex 没有命令层），frontmatter 按 skill 格式写。

### P6 implement 子 Agent

加载当前票 + 读 `.trellis/spec/` 对应层 + 传 `implementation_base_sha`；改成 `oxyteam-implement` 的薄包装。

**Codex 是 TOML，且有用户配置要保留**：`configurators/codex.js` 的 `applyCodexAgentModelKeys` 会把用户在 `.codex/agents/trellis-*.toml` 里钉的 `model` / `model_reasoning_effort` 保留下来再写模板。Installer 重写这个文件时必须照做，否则用户的模型钉选被静默吹掉。

### P7–P9 channel 三个 reference

命令示例里 `design.md` / `implement.md` → `issues/<当前票>.md`。**逐字锚点见 `edits.md`，不要凭描述自己改。**

实测 workflows 5 处、workers **2** 处、forum 1 处，**合计 8 处**（每平台一份，三平台 24 处）。

> **早期版本写的「workers 3 处」是错的。** 那第 3 处是 `.trellis/agents/implement.md` —— worker 定义**文件自己的路径**，不是任务 artifact。一句「把 `implement.md` 换成当前票」会把它一起换掉，worker 就指向不存在的路径了。这正是这类改动必须用逐字锚点、不能用散文描述的原因。

`--file "$TASK/prd.md"` 和 `--jsonl "$TASK/check.jsonl"` 这两种示例**本来就是对的，不要动**。

`trellis-channel/SKILL.md` 与 `references/command-reference.md`、`references/progress-debugging.md` **零过时引用，不改**。

### P10 trellis-meta 顶部声明（过渡措施）

```markdown
> ⚠ 本项目已应用 Oxyteam Overlay。
> 下面 references/ 描述的是原版 Trellis，以下内容在本项目已不成立：
>   design.md / implement.md 不再使用
>   trellis-brainstorm / before-dev / check / break-loop 已删除
> 要改 Overlay，请走 oxyteam-trellis-setup，不要直接手改这些文件。
```

**有明确的退役条件。** `trellis-meta` 的用途是「改 Trellis 自身的项目级文件」，而那批文件正是 Installer 用基线管着的——两个工具改同一批文件、谁都不知道对方改了什么，是本设计一路在消灭的「双权威」。

```text
现在（Installer 还只会 apply + 记账）
  → 只加声明，每平台 1 个冲突点。这期间仍需要一份「Trellis 项目级文件长什么样」的知识源

Installer 具备 reconcile 能力之后
  → 删掉整个 trellis-meta（每平台 24 文件），P10 一并作废
    三平台全装的改动面变成 28 改 / 90 删
```

**这一条要进 Installer 的验收清单**，不要留到以后忘掉。

---

## Codex 的两个前置（不是文件改动能解决的）

### ① 用户级 hooks 开关 —— **随 Codex 版本变，别照抄 Trellis 的文案**

`codex/config.toml:12-18` 和 `trellis init` 的警告都写着：hooks 要在用户级
`~/.codex/config.toml` 开 `[features].hooks = true`（0.129+；旧名 `codex_hooks = true`）
并在 `/hooks` TUI 批准。**Trellis 0.6.15 的这段文案停在 0.129 的行为上。**

**codex 0.147.0 实测：`[features]` 段里没有 `hooks` 键、也没有 `codex_hooks`，
`/hooks` 一次没跑过，项目的 `.codex/hooks.json` 照样触发**，`UserPromptSubmit`
注入了完整的 `<workflow-state>` 块。事后看 `~/.codex/config.toml`，`[hooks.state]` 里
自动多了该项目 hooks.json 的两条 `trusted_hash`（`user_prompt_submit` / `subagent_start`
——顺带印证 `session-start.py` 没被注册）。

当时项目已经写进 `[projects]."<绝对路径>"` 且 `trust_level = "trusted"`。
**没测过不信任的情况**，所以只能确定「0.147 不需要那个 feature flag」，
不能断言「信任就够了」。

预检怎么写：**按版本分支，不要硬拦**。

```text
codex < 0.147   查 [features].hooks / codex_hooks，缺了就提示用户去开 + /hooks 批准
codex >= 0.147  那个 flag 已经不需要；改为提示「项目要在 ~/.codex/config.toml 的
                [projects] 里 trust_level = "trusted"，否则 .codex/config.toml
                这一层根本不合并」
两种情况都只提示，不硬停 —— 装完开一个真会话看 <workflow-state> 进没进来，
比读配置准。这条只有真跑会话能验，读文件验不出来。
```

### ② `dispatch_mode` 必须是 `auto`

`inject-workflow-state.py` 的 `resolve_breadcrumb_key()` 对 Codex 有特殊分支：`dispatch_mode: inline` 时查的是 `<status>-inline` 标签。官方 `workflow.md` 因此给 planning / in_progress 各备了两份块（`:205`、`:237`）。

默认值是 `auto`，查普通标签。所以：

```text
B1 只写 6 个普通 [workflow-state:*] 块（5 阶段 + no_task），不写 inline 变体
预检发现 .trellis/config.yaml 里 codex.dispatch_mode: inline → 停下来问用户
```

写 12 个块是为一个非默认模式付双倍维护费。而且查不到标签不会报错，只会静默降级成一句 "Refer to workflow.md for current step."——路由直接失效且没有任何提示，所以预检必须**硬拦**，不是警告。

---

## C 组：删除官方入口（每平台 6）

这六个各有 hash，删除会走 `userDeletedFiles` 分支被尊重，`trellis update` 不会装回来。**删比改 frontmatter 禁用更干净。**

| # | 角色 | OMP | Claude Code | Codex | 能力由谁承接 |
|---|---|---|---|---|---|
| C1 | brainstorm | `.omp/skills/trellis-brainstorm/` | `.claude/skills/trellis-brainstorm/` | `.agents/skills/trellis-brainstorm/` | `oxyteam-askme` / `interview` / `askme-with-docs` / `map` |
| C2 | before-dev | `.omp/skills/trellis-before-dev/` | `.claude/skills/trellis-before-dev/` | `.agents/skills/trellis-before-dev/` | 并进 implement 前置（P6、B4） |
| C3 | check skill | `.omp/skills/trellis-check/` | `.claude/skills/trellis-check/` | `.agents/skills/trellis-check/` | `oxyteam-code-review` |
| C4 | break-loop | `.omp/skills/trellis-break-loop/` | `.claude/skills/trellis-break-loop/` | `.agents/skills/trellis-break-loop/` | `oxyteam-diagnosing-bugs` |
| C5 | check agent | `.omp/agents/trellis-check.md` | `.claude/agents/trellis-check.md` | `.codex/agents/trellis-check.toml` | `oxyteam-code-review` 自己 spawn 的两个子代理 |
| C6 | research agent | `.omp/agents/trellis-research.md` | `.claude/agents/trellis-research.md` | `.codex/agents/trellis-research.toml` | `oxyteam-research` 自己 spawn 后台 agent |

**删的是重复实现，不是能力。** 六项能力全部有承接方，一项没少。

删除后必须扫一遍全项目，确保没有残留引用（continue、`workflow.md`、`trellis-session-insight`、Claude/Codex 的 `session-start.py` 与 `trellis-start` 都提过这些名字——后两个由 P2 / P3 负责）。

> **Codex 的 C1–C4 落在共享层 `.agents/skills/`。** 共读这一层的平台不止 Codex，这一删是全都删了。计划里要写明波及面，不要在 Codex 一栏轻描淡写。
>
> **别抄名单。** `trellis init` 配置 Codex 时自己会打印一份（0.6.15 打的是 Cursor /
> Gemini CLI / GitHub Copilot / Amp / Kimi Code），但那份**漏了 OMP 和 Pi**；
> `skills` CLI 又按自己那套算「universal」有 19 个。三处口径都不一样，以实跑输出为准。
>
> **OMP 两层都读**（自己的 `.omp/skills/` 和共享的 `.agents/skills/`），所以三平台全装时
> C1–C4 对 OMP 是双删，结果正确。**危险的是缺一半的组合**：装了 OMP 和某个往
> `.agents/skills/` 写 `trellis-*` 的平台（Gemini CLI / Pi / Kimi Code / dsh）、但**没装
> Codex** —— 这时 Codex 那一栏不执行，`.agents/skills/trellis-brainstorm/` 留在原地，
> OMP 照样看得见它，C 组对 OMP 等于没删干净。预检第 6 条列波及面时要把这个组合判出来。

---

## D 组：Team Skill 与 init 模板（5，已完成）

**这一组不是 Overlay 安装时改的，是 Skill Pack 里已经改好、随版本发布的。跟平台数无关。** 预检验 `skills-lock.json` 的 ref 就是在验这一组到位没有。

配置架构（决定了改法）：

```text
oxyteam-init  →  写 docs/agents/issue-tracker.md（从 4 个模板里选一个）
                     ↓ 被读
oxyteam-spec / oxyteam-tickets / oxyteam-map / oxyteam-code-review
```

所以**不手写 `docs/agents/issue-tracker.md`**——给 `oxyteam-init` 加第 4 个模板，让它按正常初始化流程生成。

| # | 路径 | 改什么 |
|---|---|---|
| D1 | `oxyteam-init/issue-tracker-trellis.md` | **新建**。第 4 个 tracker 模板，实现模板契约的全部四段：Conventions / publish / fetch / **Wayfinding operations** |
| D2 | `oxyteam-init/SKILL.md` | Explore 加 `.trellis/` 检测；Section A 加 Trellis 选项并置顶；模板清单加一行；**Write 段加「`##` 标题逐字保留，不得翻译」**——实测中文会话里 8 个标题全被翻译，`oxyteam-map` 随即静默退回写 `.scratch/` |
| D3 | `oxyteam-tickets/SKILL.md` | 第 5 步的 `.scratch/<feature-slug>/issues/` 是**硬编码路径**，改成查 tracker 文档；追加「tracker 定义了额外字段就加上」 |
| D4 | `oxyteam-code-review/SKILL.md` | 第 1 步换成「主流程固化 patch」（见下）；第 2 步 spec 来源加一条查 tracker 文档，并提到**前面**（原来只找 `docs/`/`specs/`/`.scratch/`，找不到任务目录）；两个子代理提示词改成消费 patch，不执行 git |
| D5 | `oxyteam-research/SKILL.md` | 原文是 "Save it where the repo already keeps such notes"，**没有任何锚点**。改成 spawn 前先定路径并写进 spawn 提示词——它 spawn 的是后台 agent，未必继承会话上下文 |

`Impl:` / `Issue:` 两个字段**只写进 D1 的 Trellis 模板**，不进 `oxyteam-tickets` 的通用票模板——非 Trellis 项目里没有 `oxyteam_tickets.py` 读它们，加了就是噪声。

### 明确不用改的

| Skill | 为什么 |
|---|---|
| `oxyteam-spec` | 已经是纯配置驱动（"publish it to the project issue tracker"），没写死路径 |
| `oxyteam-map` | 已经是配置驱动，明确写着「查 tracker 文档的 Wayfinding operations 段」。**但这意味着 D1 的模板必须有那一段，漏了 map 直接退化到 local 默认**（写进 `.scratch/`） |
| `oxyteam-prototype` | 产物是 throwaway 分支 + 票上的 context pointer，票通过 tracker 解析 |
| `oxyteam-triage` | `.out-of-scope/` 是仓库级 backlog，跟任务目录正交 |
| `oxyteam-domain-modeling` / `improve-codebase-architecture` | 写 `CONTEXT.md` / `docs/adr/`，仓库级，比任何单个任务活得久，不该进会被归档的目录 |
| `oxyteam-handoff` | 写 OS 临时目录，明确「不进 workspace」。跟 Trellis Journal 是互补不是重叠：Journal 记「这个会话发生了什么」，handoff 是「给新 agent 现在就用的一份交接」 |
| `oxyteam-diagnosing-bugs` | 只引用 `CONTEXT.md` 和一个脚本模板 |
| `askme` / `askme-with-docs` / `interview` / `codebase-design` / `tdd` / `implement` | 全文零输出路径 |

### D4 的五步契约

**这是 P0，跟 Trellis 和平台都无关，没装 Trellis 的普通项目里一样存在。**

问题：`oxyteam-implement` 的闭环是「先 code-review 再 commit」，而 `git diff A...HEAD` 三点语法两端都是「提交」，工作区完全不参与。**危险在于这不是硬失败，是静默漏审**——固定点前面已有 commit 时 diff 非空，检查照样通过，但这次写的实现一行都没进审查，还报告「审查通过」。

```bash
base=$(git merge-base "$fixed_point" HEAD)

# ① 已提交变更 + 当前 tracked 工作树的最终状态
git diff --binary "$base" --

# ② 逐个、NUL 安全地列出所有未跟踪且未忽略的文件
git ls-files --others --exclude-standard -z

# ③ 每个 untracked 文件转成 patch 拼进去
git diff --no-index --binary -- /dev/null "$path"
```

```text
1. 主流程计算 merge-base
2. 主流程生成一份完整 review patch（① + 全部 ③）
3. 检查这份 patch 非空（替代原来的「diff 非空」检查）
4. 把同一份已固化的 patch 交给 Standards 和 Spec 两个子代理
5. 子代理不再执行任何 git 命令，也不需要「记得补读 untracked」
```

> `git diff --no-index` 发现差异时**退出码是 1，这是正常结果**，不得按失败处理。

两个必须实现的边界：

```text
① 二进制文件：--binary 会 base64 内联（实测 2KB 随机数据 → 49 行 patch）。
   给 untracked 收集加体积上限，超限的只记路径不内联，并在 patch 里留一行说明。
② patch 总量：同一份要发给两个子代理，token 双份。大改动先看总量再决定是否分批。
```

不采用的两个变体，以及为什么：

| 变体 | 为什么不用 |
|---|---|
| `git add -N .` + `git diff $(git merge-base ...)` | 会写 `.git/index`；review 中途掐断会留下 intent-to-add 记录；并发时争 `index.lock` |
| `merge-base` diff + `git status --porcelain` 列 untracked | 依赖子代理「记得去补读」；且 `--porcelain` 对新目录只输出 `?? newdir/`（目录），子代理还得自己展开 |

固定点取值：`task.json.meta.implementation_base_sha`。进入 Implement 时记当时 HEAD；多票时在 claim 每张票时记。**不取 effort 起点**——会反复重审已审过的 commit。

### D1 模板必须覆盖的四段

`oxyteam-init` 的 tracker 模板有固定契约，四段缺一不可：

| 段 | 谁读 | 漏了会怎样 |
|---|---|---|
| `## Conventions` | 所有 Skill | 路径约定不明 |
| `## When a skill says "publish to the issue tracker"` | `oxyteam-spec`、`oxyteam-tickets` | Spec 和票不知道往哪写 |
| `## When a skill says "fetch the relevant ticket"` | `oxyteam-code-review`、`oxyteam-implement` | 取不到当前票 |
| `## Wayfinding operations` | `oxyteam-map` | **`oxyteam-map` 明说「没有就默认用 local-markdown tracker」——直接退回写 `.scratch/`** |

分治内容：

```text
别人提的 issue / PR        → GitHub Issues，oxyteam-triage 在这儿跑
当前任务的 Spec / 实施票    → 当前 Trellis 任务目录（权威）
```

任务目录解析必须写在模板里，这是每次发布都走的核心链路：

```bash
# 不带参数的 current 直接打印仓库相对的任务目录路径（没有 --path 这个 flag）
TASK=$(python3 .trellis/scripts/task.py current)
```

没有 Active Task 时 `current` 退出码非 0。模板必须写明这种情况下停下来问用户，**不要退回 `.scratch/`**。

Map 的 decision ticket 放 `$TASK/map-issues/`，跟实施票的 `$TASK/issues/` **分开**：两者状态词汇不同（`claimed`/`resolved` vs `Impl:`），`oxyteam_tickets.py` 只读 `issues/`，混在一起会让 frontier 两边都算错。

---

## E 组：撤销历史修改（7）

仅当预检发现旧版 Overlay 痕迹时执行。这不是「不改」，是「改回去」，需要拿到官方模板内容。

| # | 路径 | 动作 |
|---|---|---|
| E1–E5 | `.trellis/scripts/common/{task_store,task_utils,task_context,session_context}.py`、`.trellis/scripts/task.py` | 恢复官方原样 |
| E6 | `.trellis/scripts/hooks/linear_sync.py` | 恢复官方原样。**`trellis update --dry-run` 不报这个文件**，只能靠记账或 hash 比对发现 |
| E7 | `.omp/agents/trellis-research.md` | 旧版把它改成了包装器，本版直接删（等同 C6 的 OMP 落点） |

E1–E6 是共享层，与平台数无关。E7 只在 OMP 上存在——旧版 Overlay 只支持 OMP，不会有 Claude / Codex 的历史痕迹。

官方模板位置：

```text
$(npm root -g)/@mindfoldhq/trellis/dist/templates/
  trellis/scripts/common/*.py
  trellis/scripts/hooks/linear_sync.py
  trellis/workflow.md
  trellis/agents/{implement,check}.md
  shared-hooks/*.py                              → .claude/hooks/、.codex/hooks/
  common/commands/{continue,finish-work}.md      → .omp/commands/trellis-*.md
                                                   .claude/commands/trellis/*.md
  common/commands/start.md                       → .agents/skills/trellis-start/SKILL.md
  common/skills/*.md                             → <平台>/skills/trellis-*/SKILL.md
  common/bundled-skills/                         → <平台>/skills/
  omp/agents/trellis-*.md
  claude/agents/trellis-*.md
  codex/agents/trellis-*.toml、codex/hooks/session-start.py
  omp/extensions/trellis/index.ts.txt            ← 注意是 .txt，find -name '*.ts' 找不到
```

比对官方原样时不要手抄路径，用 `collectPlatformTemplates(<platformId>)` 实跑导出——`claude-code` 52 个、`codex` 54 个、`omp` 49 个，数字对不上说明平台版本或安装范围有出入。

---

## 明确保持官方原样

### 共享层

```text
.trellis/scripts/common/task_store.py       ← 旧版改过，本版从头不碰
.trellis/scripts/common/task_utils.py
.trellis/scripts/common/task_context.py
.trellis/scripts/common/session_context.py
.trellis/scripts/task.py
.trellis/scripts/hooks/linear_sync.py       ← 留着，github_sync.py 并列新增
.trellis/scripts/common/active_task.py
.trellis/scripts/get_context.py
.trellis/spec/**                            ← 无 Oxyteam 等价物，保留
```

### 平台层（每个已装平台）

```text
trellis-spec-bootstrap/                     ← 实测 0 处过时引用
trellis-update-spec/                        ← 实测 0 处过时引用
trellis-channel/SKILL.md                    ← 索引本身干净，只有 3 个 reference 要改
trellis-session-insight/                    ← 3 处低危，默认不改，见下

.claude/settings.json                       ← 只注册 hook，不用动
.claude/hooks/inject-subagent-context.py    ← 当前票走 implement.jsonl，不改（P1）
.codex/hooks/inject-subagent-context.py     ← 同上
.codex/hooks/session-start.py               ← 死文件，hooks.json 没注册它（P2）
.codex/hooks.json
.codex/config.toml
未启用平台的配置目录                          ← 不预建、不预改
```

### `.trellis/spec/` 为什么保留

它填的是 Oxyteam 明确不管的那块：分层编码规范的生成和组织。实测全库 grep `CODING_STANDARDS` 只有 `oxyteam-code-review` 一处引用，且是「读」，Oxyteam 没有任何生成端。**这是互补，不是重叠，删掉是净损失。**

真问题是规范源和审查源不同步：写代码时 `AGENTS.md` 指向 `.trellis/spec/`，审代码时 `oxyteam-code-review` 举的例是 `CODING_STANDARDS.md`，漏检不报错只会静默通过。修法很便宜——`code-review` 那句是 "such as"（举例不是白名单），在 `AGENTS.md` 里加一行明确指向 `.trellis/spec/` 即可，零边际成本（B2 本来就要改），不动 Team Skill。

### `trellis-session-insight` 的 3 处低危引用

```text
:33  「prd.md, design.md 已经在手边」                prd.md 对，design.md 过时，描述性
:35  「子 Agent trellis-implement / trellis-check」  trellis-check 已删，在「什么时候别用」段里
:43  「把 mem 挖出来的决策写进 <task>/prd.md」        本版是正确行为
```

全是低危，改不改都不会造成错误行为。**默认不改**（每平台省 1 个冲突点）。如果因为别的原因要动这个文件，就一并改掉——`trellis update` 的冲突成本是按文件算的，不是按行算的。

---

## 别重走的死路

| 死路 | 怎么证伪的 |
|---|---|
| 把新逻辑塞进官方 `task_utils.py` / `task.py` | 白付 4 个官方文件的永久冲突成本，新建自有脚本 0 冲突 |
| 把 Spec 文件名改成 `spec.md` | 白改 4 个官方文件；官方对 `prd.md` 的四个消费点没有一处解析内容结构 |
| 把实施进度塞进票的 `Status:` 字段 | `Status:` 是 triage 词汇，绑死 `triage-labels.md`；三套概念挤一个格子 |
| 设独立 Review 阶段 | 要拆开 `oxyteam-implement`，产生「要 review 要 commit」和「不许 review 不许 commit」两份直接冲突的指令 |
| 改 frontmatter 禁用不需要的官方 Skill | 删更干净，`update.ts` 的 `userDeletedFiles` 分支尊重删除 |
| 拿被改写过的项目文件反推官方契约 | 项目 `workflow.md` 179 行，官方模板 709 行 |
| 假设 `.template-hashes.json` 顶层是 hash 字典 | schema 是 `{__version, hashes}` |
| 以为 `worktree_path` / `branch` 提供 git 隔离 | 全库零写入零消费 |
| 以为 `oxyteam-code-review` 能审到未提交的实现 | 实测 `git diff A...HEAD` 不含工作区，且不报错 |
| 以为改成 `merge-base` 就够了 | 实测仍漏 untracked，tracked 侧和 untracked 侧必须分别收集 |
| 以为 `git status --porcelain` 能交代清楚 untracked | 实测对新目录只输出 `?? newdir/`，`git ls-files --others -z` 才直接给文件 |
| 以为归档会让 Spec 变得难找 | `add_session.py` 每条日记记 `**Task**`，自动维护 Session History 表，归档内容进 git |
| 以为改 Oxyteam 写入路径必须改 Skill | `oxyteam-spec` 是纯配置驱动；只有 `oxyteam-tickets` 硬编码了 `.scratch/` |
| **以为多支持一个平台只是「路径换个前缀」** | **Claude / Codex 的注入层是 Python Hook 拷贝，不是一个 TS 文件；`session-start.py` 和 `start.md` 还硬编码了已删的 `trellis-brainstorm` 和 `design.md` / `implement.md`，OMP 的 `index.ts` 里一处都没有** |
| **以为 `.codex/hooks/session-start.py` 装了就会跑** | **`.codex/hooks.json` 只注册 `UserPromptSubmit` 和 `SubagentStart` 两项，`config.toml` 里也没有——死文件，改它是白改** |
| **把 Trellis 的 Codex hooks 警告当成当前事实照抄** | **那段文案停在 codex 0.129 的行为上。0.147 实测不需要 `[features].hooks`、也没跑过 `/hooks`，注入照进。预检要按 `codex --version` 分支，且只提示不硬停——真会话看 `<workflow-state>` 才是判据** |
| **以为 Codex 要给五个阶段各写一份 `-inline` 块** | **`resolve_breadcrumb_key()` 只在 `dispatch_mode: inline` 时查 `-inline` 标签，默认 `auto` 查普通标签。写 10 个块是为非默认模式付双倍维护费** |
| **以为子代理拿当前票必须改 `inject-subagent-context.py`** | **它已经读 `implement.jsonl`，A1 的 `claim` 往里写一行即可。三平台同时成立，省两个 1174 行文件的永久冲突点** |
| **以为 Codex 删 `trellis-brainstorm` 只影响 Codex** | **`.agents/skills/` 是 Codex / Gemini CLI / Pi / Kimi Code / dsh 共读层，一删全删** |
