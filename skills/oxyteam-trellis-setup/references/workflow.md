# Oxyteam Trellis 工作流 Overlay

## 四个模块

```text
① Oxyteam Skill Pack   方法：澄清、Spec、Tickets、Map、实现、TDD、审查、分诊
② Trellis Runtime      运行时：Session、Active Task、恢复、Archive、Journal、mem、Hooks
③ Runtime Adapter      转接：阶段路由、票解析、上下文分发、远程同步 —— 就是 Overlay 本体
④ Setup Installer      装/卸/升级 ③ —— 就是本 Skill
```

Overlay 只修改 `trellis init` 已生成的项目文件，不修改全局 Trellis npm 包或官方源码。

## 五个阶段

```text
Discover
  ↓
Specify
  ↓
Slice（可选，只有拆成多张票时才进）
  ↓
Implement          ← 里面自带 tdd + code-review + commit
  ↓
Finish
```

路由：

```text
Discover  → oxyteam-askme-with-docs（默认）/ askme / map / prototype
Specify   → oxyteam-spec       写 <task>/prd.md
Slice     → oxyteam-tickets    写 <task>/issues/*.md
Implement → trellis-implement 薄包装 → 完整的 oxyteam-implement
Finish    → Trellis Archive + Journal
```

Map 不单独成一种任务类型：它是 Discover 阶段的长驻模式，`[workflow-state:discover]` 在有 Map 材料时提示「继续 work the map」。

### 为什么没有独立的 Review 阶段

`oxyteam-implement` 只有 15 行，但它是完整闭环：

```text
实现 → 用 oxyteam-tdd → 跑测试 → 调 oxyteam-code-review → commit
```

想在中间插一个独立 Review 阶段，就必须把它拆开、告诉它「你别 review 别 commit」。那是**两份直接冲突的指令**：Agent 同时读到「要 review 要 commit」和「不许 review 不许 commit」，最后做什么全看模型当时怎么想。

所以：保持 `oxyteam-implement` 完整，不设独立 Review 阶段。**不要在 workflow.md 里写「Trellis 模式下 oxyteam-implement 只负责实现」这类话**——那正是被推翻的做法。

**能力不丢**：Trellis check agent 唯一值钱的地方是「在干净上下文里审查」，而 `oxyteam-code-review` 自己就 spawn 两个并行子代理（Standards 一个、Spec 一个），同样是干净上下文，还多一根轴。

`check.jsonl` 留着不动——没有消费者，但删了没收益，以后想加独立 Review 阶段随时能用。

## 各阶段的完成条件

### Discover

按真实问题选择入口：

| 情况 | Skill |
|---|---|
| 需求已经清楚 | 直接进 Specify |
| 目的地看得见，只是一个会话做不完 | 照常往下走，到 Slice 用 `oxyteam-tickets` 切票 |
| 通往目的地的路本身看不清 | `oxyteam-map` |
| 答案得跑起来才知道 | `oxyteam-prototype` |
| 以上都不是（默认） | `oxyteam-askme-with-docs`；不需要落 ADR 和术语表时用 `oxyteam-askme` |

`askme` 的 SKILL.md 正文只有一行 `Call the Skill tool with "oxyteam-interview"` —— 它就是
`interview`，不是两个入口。`askme-with-docs` 只比它多一个 `domain-modeling`（写根
`CONTEXT.md` 和 `docs/adr/`），这是两者唯一的差别。

`research` 不进这张表：`interview` 自己写了「When a frontier question needs a fact from the
environment, dispatch a sub-agent to find it — don't ask the user」，它会自己去查。只有用户
明确要一份带引用的调研文件时才走 `oxyteam-research`。

`map` 的判据是「大」**且**「路看不清」两个条件（SKILL.md：`too big for one agent session,
and wrapped in fog`），光是量大该走 Slice。它第 2 步 breadth-first 扫完若无 fog 会自己叫停
（`If this surfaces no fog... you don't need a map`），所以拿不准时让它跑，成本两轮对话。
map 的工单本身也调这些 Skill：`interview` / `research` / `prototype` / `task` 四种 label ——
它是 Discover 诸 Skill 的调度器，不跟它们竞争。

完成条件：问题、范围和成功标准清楚；关键术语或 ADR 已按需记录；技术未知项已研究或原型验证。

### Specify

入口 `oxyteam-spec`，写 `<task>/prd.md`。

完成条件：

- `prd.md` 已写入任务目录（不是 `.scratch/`）；
- 验收条件可观察；
- 测试 Seam 已确认；
- **已执行远程同步**：`TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec`

> 同步必须写成阶段完成条件，不能指望 Hook——Trellis 没有「prd.md 被写入」这个事件。

### Slice

只有无法在一个 Agent 会话内完成的任务才进入 Slice。单会话任务从 Specify 直接进 Implement，不创建空的 `issues/`。

入口 `oxyteam-tickets`，写 `<task>/issues/NN-*.md`。

完成条件：

- 票是可独立验证的垂直切片；
- Blocking Edges 已声明，`oxyteam_tickets.py` 校验通过（无环、无悬空引用）；
- 用户已确认拆分；
- `oxyteam_tickets.py frontier` 至少返回一张票；
- **已执行远程同步**：`github_sync.py sync-tickets`，票文件回填 `**Issue:**`

### Implement

```text
oxyteam_tickets.py frontier → 挑一张 → claim → Impl: doing
  ↓
记录 task.json.meta.implementation_base_sha = 当前 HEAD
  ↓
trellis-implement 薄包装器
  → 传入 Active Task、当前票、implementation_base_sha、当前 branch
  → 读 .trellis/spec/ 对应层的编码规范
  → 调完整的 oxyteam-implement
    → oxyteam-tdd → 跑测试 → oxyteam-code-review → commit
  ↓
oxyteam_tickets.py done → Impl: done → 回 frontier 挑下一张（串行）
```

读取顺序：

1. Active Task；
2. 当前票，或单会话任务的 `prd.md`；
3. `.trellis/spec/` 对应层（编码规范）；
4. 相关 `CONTEXT.md` / `CONTEXT-MAP.md` 与 ADR；
5. `implement.jsonl` 列出的材料；
6. Research 或 Prototype 结果；
7. 真实源码、调用者和数据流。

### Finish

Trellis Runtime 负责：归档 Task、写 Journal、Hook 同步 `gh issue close`。

归档门禁：`flow_stage=finish` **且所有票 `Impl: done`**。

## `[workflow-state:*]` 块

`.trellis/workflow.md` 必须包含五对状态块，加一个无任务态：

```text
[workflow-state:no_task]
[workflow-state:discover]
[workflow-state:specify]
[workflow-state:slice]
[workflow-state:implement]
[workflow-state:finish]
```

**格式要求（Extension 的正则是配对匹配的，缺闭合标签整块读不到）：**

```text
[workflow-state:discover]
块正文
[/workflow-state:discover]
```

Extension 侧的匹配规则：

```text
/\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g
```

状态名只允许字母、数字、下划线和连字符。官方原有的 `planning` / `in_progress` / `completed` / `*-inline` 块在本 Overlay 中被五阶段块替换，不保留两套并行路由。

### 块正文的措辞要求（两条，都是实测出来的）

**① 提到 Team Skill 时写「提示用户运行 `/xxx`」，不写「运行 `xxx`」。**

主干的 `oxyteam-spec` / `oxyteam-tickets` / `oxyteam-implement` / `oxyteam-map` / `oxyteam-askme` / `oxyteam-askme-with-docs` 全部带 `disable-model-invocation: true`。OMP 把它映射成 `hide: true`，再用 `filter((h) => h.hide !== true)` 把它们从**模型可见清单里整个过滤掉**——用户打 `/` 能补全，模型自己调不动。

写成祈使句「运行 `oxyteam-spec`」会怎样：**实测模型绕过 Skill 机制，照着块正文的散文自己动手干。** 产出可能碰巧对（一次实测里 `prd.md` 的章节确实和模板对上了），但跳过了 Skill 内部的接缝检查和用户确认环节，且每次结果不可复现。

```text
✅ 提示用户运行 `/oxyteam-spec`，把权威 Spec 写入当前任务的 prd.md
❌ 运行 `oxyteam-spec`，把权威 Spec 写入当前任务的 prd.md
```

**② 官方块里的条件分支必须保留，不能压缩成祈使句。**

改写官方块时容易把「分情况判断」压成一句话，那会拿掉模型的判断锚点。`no_task` 是最典型的一个，官方原文（`templates/trellis/workflow.md:176-180`）是三句、二选一结构：

```text
No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.
Simple conversation / small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
Complex task: ask the user if you can create a Trellis task and enter the planning phase. If the user says no, explain, clarify scope, or suggest a smaller split.
```

三样东西一个都不能丢：**先分类**（简单对话 / 复杂任务）、**征求同意**、**用户拒绝后的两条出路**（本会话跳过 Trellis ／ 解释、澄清范围、建议拆小）。

实测把它压缩成「先判断本轮是否需要 Trellis Task；写入任务前取得用户同意」之后，模型少了「这轮可能根本不该建任务」这个锚点，**倾向于一律建任务**——用户只想聊两句也会被建出一个任务目录来。

Overlay 版可以换语言、可以改路由目标（`--meta flow_stage=discover`、不回退 `.scratch/`），但**结构分支照搬**。

Claude Code 和 Codex 侧解析这些块的是 `inject-workflow-state.py`（正则等价），不是 Extension。**Codex 有个额外分支**：`resolve_breadcrumb_key()` 在 `dispatch_mode: inline` 时查的是 `<status>-inline` 标签。本 Overlay 只写 5 个普通块，所以 **Codex 必须留在默认的 `auto`**——预检硬拦 `inline`（见 `changeset.md`「Codex 的两个前置」）。查不到标签不报错，只会静默降级成 "Refer to workflow.md for current step."，路由失效且无提示。

## `.trellis/workflow.md` 转换要求

1. 官方 Plan / Execute / Finish 三阶段换成团队五阶段；
2. Skill Routing 换成实际存在的 `oxyteam-*` 名称；
3. 六个状态块按上面的配对格式写；
4. Continue 路由不再根据 `prd.md` / `design.md` / `implement.md` 是否存在作判断，改为按 `meta.flow_stage` + frontier；
5. 不调用未安装的 `workflow-guide`；
6. 不调用原始上游 Skill 名称，也不调用已删除的 `trellis-brainstorm` / `trellis-before-dev` / `trellis-check` / `trellis-break-loop`；
7. 保留 Trellis 的平台标记语法；`workflow.md` 是共享层，一份供 OMP / Claude Code / Codex 三个平台读，不为某个平台单写分支；
8. 不修改 `.trellis/.template-hashes.json`。

## 硬限制与软限制

### 硬的（代码直接拒绝）

```text
claim 只能认领 frontier 里的票
Blocker 引用不存在 / 形成环 → oxyteam_tickets.py 校验失败
归档门禁：flow_stage=finish 且所有票 Impl: done
Context Manifest 路径不能逃出仓库或可信目录（官方能力）
Manifest 每行必须是合法 JSON（官方能力）
```

### 软的（靠 Prompt 和 Skill）

```text
Agent 有没有挑到最合适的 Discover Skill
Spec 内容是不是真的清楚
票是不是真的高质量垂直切片
Review 查得够不够深
Installer 有没有完全正确地应用所有修改
```

### 能不能保证百分之百只走这条路

不能：

```text
人可以手动创建 design.md
Agent 可以直接编辑 task.json 或票文件
Agent 可以不通过 oxyteam_tickets.py 操作
外部编辑器不经过 OMP Hook
没有原子排他 Claim
```

现实能做到的：正式入口默认走这条路，加上非法阶段跳转被拒绝、归档门禁拦住不合格任务、绕过流程产生的异常可以被检测出来。要绝对不可绕过就得取消 Agent 的任意写入权限，那是权限沙箱设计，不在本 Overlay 范围内。
