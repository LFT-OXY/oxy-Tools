# Oxyteam Trellis 任务模型

## 设计决策

复用 Trellis 已有的 `.trellis/tasks/`、Session Active Task、父子任务、归档、Lifecycle Hooks、分支信息和 `task.json.meta`。只替换团队确实需要改变的 Artifact 与状态转换。

不同时维护以下官方 Artifact：

- `prd.md`
- `design.md`
- `implement.md`
- 任务根目录下的 `implement.jsonl`
- 任务根目录下的 `check.jsonl`

团队 Artifact：

- `spec.md`
- `tickets/*.md`
- `wayfinder/`
- `research/`
- `prototypes/`
- `context/implement.jsonl`
- `context/review.jsonl`
- `sessions/`

## 目录结构

创建任务时只生成：

```text
.trellis/tasks/<task>/
├── task.json
└── spec.md
```

其他目录按需创建：

```text
.trellis/tasks/<task>/
├── task.json
├── spec.md
├── tickets/
│   ├── 01-first-slice.md
│   └── 02-second-slice.md
├── wayfinder/
│   ├── map.md
│   └── decisions/
├── research/
├── prototypes/
├── context/
│   ├── implement.jsonl
│   └── review.jsonl
└── sessions/
```

规则：

- 单会话任务不创建 `tickets/`；
- 没有对应材料时不创建 `wayfinder/`、`research/` 或 `prototypes/`；
- Context Manifest 只在进入 Implement 或 Review 前创建。

## `task.json`

保留官方顶层字段。团队字段统一写入 `meta`：

```json
{
  "status": "planning",
  "meta": {
    "flow_stage": "discover",
    "task_mode": "single",
    "spec_backend": "local",
    "spec_ref": ".trellis/tasks/<task>/spec.md",
    "ticket_backend": "local",
    "active_ticket": "",
    "wayfinder_ref": "",
    "review_status": ""
  }
}
```

字段规则：

- `flow_stage`：`discover | specify | slice | implement | review | finish`；
- `task_mode`：`single | multi`；
- 第一版只验证本地 Spec 和 Ticket 后端；
- 所有路径使用仓库根目录相对路径；
- `review_status`：空值、`pending`、`passed` 或 `failed`。

不提前实现 GitHub、GitLab、Linear 等远程 Task Store Adapter。本地模型通过端到端验证后再增加真实变化点。

## 生命周期映射

保留 Trellis Runtime 的 `status`：

| 团队阶段 | Trellis `status` |
|---|---|
| Discover | `planning` |
| Specify | `planning` |
| Slice | `planning` |
| Implement | `in_progress` |
| Review | `in_progress` |
| Finish | `completed` |

`task.py start` 继续设置 Session Active Task，并将 `status` 从 `planning` 改为 `in_progress`；Overlay 同时把 `meta.flow_stage` 设置为 `implement`。

## `spec.md`

`spec.md` 是当前任务唯一的规格正文：

```markdown
# 任务标题

## Problem Statement

## Solution

## User Stories

## Implementation Decisions

## Testing Decisions

## Acceptance Criteria

## Out of Scope

## Further Notes
```

进入 Implement 前必须满足：

- `spec.md` 存在；
- 必需章节不是空内容；
- Acceptance Criteria 可观察；
- Testing Decisions 已声明测试 Seam。

不再以 `design.md` 或 `implement.md` 是否存在作为 Ready Gate。

## Tickets

多会话任务的每个 Ticket 是一个可独立验证的垂直切片：

```markdown
# 01 — Ticket 标题

**What to build:** 从用户角度描述完整行为。

**Blocked by:** None
**Status:** ready-for-agent

## Acceptance Criteria

- [ ] 验收条件一
- [ ] 验收条件二
```

允许的 Ticket 状态：

```text
ready-for-agent
claimed
review
done
```

Frontier Ticket 必须同时满足：

- 状态为 `ready-for-agent`；
- 所有 Blocker 已为 `done`；
- 没有被其他 Session 认领。

阻塞引用使用 Ticket 文件名。引用不存在或形成阻塞环时验证失败。

认领 Ticket 时，将其改为 `claimed`，写入 `meta.active_ticket`，并进入 Implement。实现完成后改为 `review`。Review 通过后改为 `done`、清空 Active Ticket 并计算新 Frontier；Review 失败时返回 `claimed`。

## 单会话任务

单会话任务不创建 Tickets。Implement 和 Review 直接读取 `spec.md`；Review 通过后进入 Finish。

## 项目脚本改造

### `common/task_store.py`

- 创建 `spec.md`，不创建 `prd.md`；
- 初始化团队 `meta`；
- 不在创建任务时生成可选目录；
- 不生成根目录 `implement.jsonl` 和 `check.jsonl`；
- 更新创建后的提示。

### `task.py`

保留现有任务、Session、归档和元数据命令。只增加实际需要的 Stage 与 Ticket 转换入口，不为每个字段新增单独命令。

### `common/task_utils.py`

保留路径安全、任务解析、归档和 Lifecycle Hooks。只有 Ticket 操作需要共享路径检查时才扩展。

### `common/active_task.py`

保持 Session Active Task 机制不变。不得退化成项目级全局 Active Task。

## 迁移

发现旧任务时不静默删除或混合加载旧 Artifact。列出冲突任务，由用户选择迁移、归档或暂时保留旧工作流。

唯一的初始化例外是官方未修改的 `.trellis/tasks/00-bootstrap-guidelines/`：

- 它由 `trellis init` 自动生成；
- 后续 `oxyteam-init` 接管项目规则和领域文档初始化；
- 预检确认其文件仍与官方模板一致且没有用户进度时，可把删除该目录列入 Overlay 应用计划；
- 只有用户明确确认该删除项后才能执行；
- 发现任何用户修改时按普通旧任务冲突处理。
