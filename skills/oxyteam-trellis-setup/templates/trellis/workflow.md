<!-- Oxyteam Overlay 版 workflow.md —— 由 oxyteam-trellis-setup 整篇替换官方模板。
     三个平台（OMP / Claude Code / Codex）共读这一份，不为某个平台单写分支。

     改这个文件前先读两条硬约束：

     ① 官方 Python 硬编码了两个字符串，一个字都不能动：
        `## Phase Index`  —— get_phase_index() 的起点
        `## Phase 1: Plan` —— get_phase_index() 的终点（workflow_phase.py:80 逐字比较）
        终点标题写错不会报错，只会把整篇文件当成 Phase Index 注进 SessionStart。
        步骤标题必须是 `#### N.N `，否则 get_step() 取不到。

     ② 状态块必须配对闭合，缺闭合标签整块读不到（同样不报错）。
        注意别在注释或正文里写出字面的开标签，那会多出一个没有配对的标签。
        块正文里提到 Team Skill 一律写「提示用户运行 /oxyteam-xxx」，不写祈使句——
        那些 Skill 带 disable-model-invocation，模型调不动，写成祈使句会让它绕过
        Skill 自己动手干。
-->

# Trellis 工作流（Oxyteam Overlay）

Trellis 提供运行时：Session、Active Task、跨会话恢复、Archive、Journal、mem、Hooks。
工作方法由 Oxyteam Skill Pack 提供。本文件只负责把两者接起来：**当前在哪个阶段，该提示用户走哪个 Skill。**

权威正文都在任务目录里：`prd.md` 是 Spec，`issues/NN-*.md` 是实施票。远程 Issue 是单向同步出去的镜像。
`design.md` 和 `implement.md` 不再使用。

## Phase Index

| 团队阶段 | 归属 Phase | `task.json.status` | 入口 |
|---|---|---|---|
| Discover | Phase 1 | `planning` | 默认 `/oxyteam-askme-with-docs`；`askme` / `map` / `prototype` 按需 |
| Specify | Phase 1 | `planning` | `/oxyteam-spec` → `<task>/prd.md` |
| Slice（可选） | Phase 1 | `planning` | `/oxyteam-tickets` → `<task>/issues/NN-*.md` |
| Implement | Phase 2 | `in_progress` | `trellis-implement` 子代理 → 完整的 `oxyteam-implement` |
| Finish | Phase 3 | `completed` | finish-work 入口 → Archive + Journal |

细挡位存在 `task.json.meta.flow_stage`（`discover|specify|slice|implement|finish`），
粗挡位 `status` 保持官方语义不动。写用 `task.py set-meta <task-dir> flow_stage <值>`。

**读要两步。** `task.py current --json` 拿不到 `flow_stage` —— 它的输出是白名单拼出来的
八个字段（`dir` / `id` / `title` / `status` / `parent` / `children` / `branch` / `base_branch`），
`meta` 不在里面。所以先用它拿任务目录，再直接读那个目录下的 `task.json`：

```bash
DIR=$(python3 .trellis/scripts/task.py current --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["current_task"]["dir"])')
python3 -c "import json;print(json.load(open('$DIR/task.json')).get('meta',{}).get('flow_stage','(未设置)'))"
```

**Slice 是可选的。** 一个 Agent 会话内做得完的任务从 Specify 直接进 Implement，不要创建空的 `issues/`。

票的状态分两个正交字段：`**Status:**` 是 triage 词汇（恒定 `ready-for-agent`，占位），
真正驱动路由的是 `**Impl:** ready|doing|done`。

<!-- 无 Active Task 时的每轮提示。三段结构照搬官方：先分类、再征求同意、
     拒绝后给两条出路。压缩成一句会让模型一律建任务。 -->

[workflow-state:no_task]
当前没有 Active Task。先判断本轮属于哪一类，并在创建任何 Trellis 任务之前征得用户同意。
简单对话 / 小改动：只问一句本轮要不要建 Trellis 任务。用户说不用，本会话就跳过 Trellis。
复杂任务：征得同意后建任务。标题从本轮对话里提炼，用用户自己的说法，不要自创术语；`--slug` 是对应的英文小写连字符短名，不带 `MM-DD` 前缀（目录名由 `task.py` 拼成 `MM-DD-<slug>`；`_slugify` 只吃 ASCII，中文标题不显式给 `--slug` 会直接报错退出）。标题和 slug 一起报给用户确认后再执行：
`python3 .trellis/scripts/task.py create "<标题>" --slug <name> --meta flow_stage=<挡位>`
挡位取决于本轮之前聊到哪一步：需求还没问清楚写 `discover`；本会话里已经聊清楚了（比如刚跑完 `/oxyteam-askme-with-docs`）直接写 `specify`，不要把用户塞回 Discover 再追问一遍。
用户拒绝时说明理由、澄清范围，或建议拆小再来。
[/workflow-state:no_task]

## Phase 1: Plan

#### 1.1 Discover

把问题、范围和成功标准问清楚。此阶段不写实现代码。

| 情况 | 提示用户运行 |
|---|---|
| 需求已经清楚 | 直接进 1.2 |
| 目的地看得见，只是一个会话做不完 | 照常往下走，到 1.3 用 `/oxyteam-tickets` 切票 |
| 通往目的地的路本身看不清（要先定一串决策才知道做什么） | `/oxyteam-map` |
| 答案得跑起来才知道 | `/oxyteam-prototype` |
| 以上都不是（默认） | `/oxyteam-askme-with-docs`；不需要落 ADR 和术语表时用 `/oxyteam-askme` |

`askme` 就是 `interview`（SKILL.md 正文一行转发），不是两个入口，别当成两种情况列。
`askme-with-docs` 只比它多一个 `domain-modeling`（写根 `CONTEXT.md` 和 `docs/adr/`）——这是两者唯一的差别。

`research` 不单独列：`interview` 遇到需要环境事实的问题会自己派子代理去查。只有用户明确要
一份带引用的调研文件时，才提示 `/oxyteam-research`（结果写 `<task>/research/`）。

`map` 的判据是「大」**且**「路看不清」两个条件，光是量大该走 Slice 切票。拿不准就让它跑：
它第 2 步广度优先扫一遍，扫不出 fog 会自己叫停并说明不需要 map，成本是两轮对话。

Map 不是单独的任务类型，是 Discover 的长驻模式：已有 Map 材料就继续 work the map，不要重开一轮探索。

完成条件：问题、范围、成功标准清楚；关键术语或 ADR 已按需记录；技术未知项已研究或原型验证。

<!-- flow_stage=discover 时的每轮提示 -->

[workflow-state:discover]
阶段 Discover：先把问题、范围和成功标准问清楚，不要开始写实现代码。
默认提示用户运行 `/oxyteam-askme-with-docs`（追问并顺带落 ADR 和术语表）；不需要落文档时用 `/oxyteam-askme`。两者内部是同一个 interview，别当成两个入口来回推荐。
答案得跑起来才知道，提示 `/oxyteam-prototype`。通往目的地的路本身看不清（要先定一串决策才知道做什么），提示 `/oxyteam-map` —— 只是量大而路清楚的不要用 map，往下走到 Slice 切票。
用户明确要一份带引用的调研文件时才提示 `/oxyteam-research`（结果写 `<task>/research/`）；一般的环境事实 interview 会自己派子代理查，不用提示。
已有 Map 材料就继续 work the map，不要重开一轮探索。
问清楚了执行 `task.py set-meta <task-dir> flow_stage specify` —— 改完挡位这一轮就结束，把下一步交给下一轮注入的阶段块，不要在同一轮里继续往下做。
[/workflow-state:discover]

#### 1.2 Specify

提示用户运行 `/oxyteam-spec`，把权威 Spec 写进 `<task>/prd.md`。
`oxyteam-spec` 直接整篇 Write，覆盖 Trellis 首次创建的默认骨架即可。

完成条件：

- `prd.md` 已在任务目录里（不是 `.scratch/`）；
- 验收条件可观察；
- 测试 Seam 已确认；
- 已执行远程同步。

同步写成阶段完成条件，不要指望 Hook —— Trellis 没有「`prd.md` 被写入」这个事件：

```bash
TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec
```

<!-- flow_stage=specify 时的每轮提示 -->

[workflow-state:specify]
阶段 Specify：Spec 由 `/oxyteam-spec` 产出，不由你凭空写。
用户还没调起它：停下来提示用户运行 `/oxyteam-spec`，然后等。不要自己动手写 `prd.md`，不要照本段散文编一份 Spec 出来。
用户调起了 `/oxyteam-spec`（它的正文会进你的上下文）：你就是它的执行者，按 skill 正文走完流程，把 Spec 写进 `<task>/prd.md` —— 这时候写 `prd.md` 正是你该做的，上一句的禁令到此为止。
Spec 落地之后再做四件事：
① 确认 `prd.md` 在任务目录里（不是 `.scratch/`）、验收条件可观察、测试 Seam 已确认；
② 执行远程同步 `TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec` —— 报错就停下来告诉用户，不要跳过（本仓库没有 GitHub 远程时它自己会打印跳过并正常返回，那不是报错）；
③ **把 Spec 摘要报给用户，停下来等确认。用户认可之前不要切挡位，更不要开始写实现代码。** 这一步不能省：Spec 对不对是用户的判断，不是你的。
④ 用户确认后，一个会话内做得完就 `set-meta flow_stage implement`，做不完先走 Slice —— 改完挡位这一轮就结束，把下一步交给下一轮注入的阶段块，不要在同一轮里继续往下做。
[/workflow-state:specify]

#### 1.3 Slice（可选）

只有一个 Agent 会话内做不完的任务才进来。提示用户运行 `/oxyteam-tickets`，写 `<task>/issues/NN-*.md`。

完成条件：

- 票是可独立验证的垂直切片；
- Blocking Edges 已声明，且 `python3 .trellis/scripts/oxyteam_tickets.py frontier` 通过（无环、无悬空引用）；
- `frontier` 至少返回一张票；
- 用户已确认拆分；
- 已执行 `github_sync.py sync-tickets`，票文件回填 `**Issue:**`。

<!-- flow_stage=slice 时的每轮提示 -->

[workflow-state:slice]
阶段 Slice：票由 `/oxyteam-tickets` 产出，不由你凭空写。
用户还没调起它：停下来提示用户运行 `/oxyteam-tickets`，然后等。不要自己动手写 `issues/NN-*.md`。
用户调起了 `/oxyteam-tickets`（它的正文会进你的上下文）：你就是它的执行者，按 skill 正文把票写进 `<task>/issues/NN-*.md` —— 这时候写票正是你该做的，上一句的禁令到此为止。
票落地之后：校验 `python3 .trellis/scripts/oxyteam_tickets.py frontier` —— 无环、无悬空 Blocker，且至少返回一张票。
远程同步 `github_sync.py sync-tickets`，票文件回填 `**Issue:**`（本仓库没有 GitHub 远程时它自己会打印跳过并正常返回）。
用户确认拆分后 `set-meta flow_stage implement` —— 改完挡位这一轮就结束，把下一步交给下一轮注入的阶段块，不要在同一轮里继续往下做。
[/workflow-state:slice]

#### 1.4 Activate

`python3 .trellis/scripts/task.py start <task-dir>`，`status` 转 `in_progress`。

## Phase 2: Execute

#### 2.1 Implement

**票默认串行，一次只推进一张。** 没有原子排他 Claim，这是客观限制，靠限制并行单位规避。

```text
oxyteam_tickets.py frontier      → 看哪些票可开工
oxyteam_tickets.py claim <NN>    → Impl: doing
                                   + 记 meta.implementation_base_sha
                                   + 把当前票写进 <task>/implement.jsonl
  ↓
派 trellis-implement 子代理
  → 它是薄包装，内部调完整的 oxyteam-implement
    → oxyteam-tdd → 跑测试 → oxyteam-code-review → commit
  ↓
oxyteam_tickets.py done <NN>     → Impl: done，回 frontier 挑下一张
```

派发提示词第一行必须是 `Active task: <task.py current 输出的路径>`。

**不要告诉 `oxyteam-implement`「别 review 别 commit」。** 它是完整闭环，拆开会产生两份直接冲突的指令。
不设独立 Review 阶段：`oxyteam-code-review` 自己 spawn 两个干净上下文的子代理（Standards 一轴、Spec 一轴）。

读取顺序：

1. Active Task；
2. 当前票（单会话任务读 `prd.md`）；
3. `.trellis/spec/` 对应层的编码规范；
4. 相关 `CONTEXT.md` / `CONTEXT-MAP.md` 与 `docs/adr/`；
5. `implement.jsonl` 列出的材料；
6. Research 或 Prototype 结果；
7. 真实源码、调用者和数据流。

<!-- flow_stage=implement 时的每轮提示。status 从 task.py start 一直到 archive
     都是 in_progress，所以这一块要覆盖从实施到 commit 的全部必需步骤。 -->

[workflow-state:implement]
阶段 Implement：先看有没有票 —— `ls <task>/issues/`。
没有 `issues/` 目录：这是单会话任务，直接照 `prd.md` 干，不要跑 frontier / claim / done，做完 `set-meta flow_stage finish`（改完挡位这一轮就结束，归档的事交给下一轮注入的 Finish 块，**不要在同一轮里接着跑 `task.py archive`**）。
有票：票默认串行，一次只推进一张。
挑票 `python3 .trellis/scripts/oxyteam_tickets.py frontier` → `claim <NN>`（自动写 `Impl: doing`、`implementation_base_sha`，并把当前票写进 `implement.jsonl`）。`frontier` 打印 `(frontier 为空)` 有两种含义：还有票没做完但全被 blocked，或全部 done —— 用 `summary` 区分，不要猜。
派 `trellis-implement` 子代理干活，派发提示词第一行写 `Active task: <task.py current 的路径>`。它是薄包装，内部调完整的 `oxyteam-implement`（自带 tdd → 测试 → code-review → commit）——不要指示它跳过 review 或 commit。
读取顺序：当前票（单会话任务读 `prd.md`）→ `.trellis/spec/` 对应层 → `CONTEXT.md` / ADR → `implement.jsonl` → 真实源码。
做完一张 `oxyteam_tickets.py done <NN>`，回 frontier 挑下一张。全部 done 后 `set-meta flow_stage finish` —— 改完挡位这一轮就结束，归档的事交给下一轮注入的 Finish 块，**不要在同一轮里接着跑 `task.py archive`**。
[/workflow-state:implement]

## Phase 3: Finish

#### 3.1 Finish

归档门禁：`flow_stage=finish` **且所有票 `Impl: done`**。先用 `oxyteam_tickets.py summary` 确认。

归档由 Trellis Runtime 负责：Archive Task、写 Journal、Hook 同步 `gh issue close`。

入口按平台：

```text
OMP / Claude Code   /trellis:finish-work
Codex               trellis-finish-work skill
```

<!-- flow_stage=finish 时的每轮提示 -->

[workflow-state:finish]
阶段 Finish：归档不可逆，且「这活算干完了」是用户的验收判断，不是你的。
你只做只读的事：跑 `python3 .trellis/scripts/oxyteam_tickets.py summary` 报门禁状态（`flow_stage=finish` 且所有票 `Impl: done`），报工作区干不干净，然后停下来问用户能不能归档。
用户明确说可以之前：不要走 finish-work，不要跑 `task.py archive`，不要跑 `add_session.py`。
用户确认后走 finish-work 入口（OMP / Claude Code 是 `/trellis:finish-work`，Codex 读 `trellis-finish-work` skill），归档任务并写 Journal。
归档会触发 Hook 关闭远程 Issue。
[/workflow-state:finish]

## Rules

1. 先确定当前 `flow_stage`，再从该阶段的下一步继续，不要凭任务目录里有没有某个文件来判断；
2. 阶段可以回退（Implement 发现 Spec 有缺陷 → 回 Specify 修 → 再回来）；
3. Slice 是可选的，单会话任务不要创建空的 `issues/`；
4. 提到 Oxyteam Skill 一律提示用户运行 `/oxyteam-xxx`，不要自己动手替代 Skill 的职责；
5. 需求边界不清时先问，不要按猜测继续。
