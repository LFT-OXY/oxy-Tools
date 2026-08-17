# Oxyteam Trellis Context Loader

## 目标

主会话和 OMP 子代理只加载当前阶段需要的持久材料。源码由 Agent 在实施或审查时检索，不预先塞入 Manifest。

## Session Context

修改 `.trellis/scripts/common/session_context.py`，让 `get_context_json()` 和 `get_context_text()` 展示：

- Active Task 路径、标题和 Trellis `status`；
- `meta.flow_stage`；
- `meta.task_mode`；
- `spec_ref`；
- `active_ticket`；
- `review_status`；
- 多会话任务当前 Frontier；
- Git、Workspace 和 Packages 的现有信息。

移除只提示读取 `prd.md` 的逻辑，改为提示读取 `spec.md` 和 Active Ticket。

Session Context 只输出索引、状态和路径，不内联全部 Spec、Ticket 或 Research 正文。

## Task Context

修改 `.trellis/scripts/common/task_context.py`：

- `implement` 对应 `context/implement.jsonl`；
- `review` 对应 `context/review.jsonl`；
- `add-context` 把文件写入任务的 `context/` 目录；
- `validate` 和 `list-context` 读取新位置；
- 错误信息使用 Implement/Review 名称，不再使用 Check；
- 保留 JSONL 路径安全、归档路径重绑定、文件大小提示和源码文件卫生警告。

Manifest 每行保持：

```json
{"file":"<仓库根目录相对路径>","reason":"<为什么需要读取>"}
```

允许引用：

- `CONTEXT.md` 或 `CONTEXT-MAP.md`；
- 相关 ADR；
- `.trellis/spec/`；
- 当前任务的 `spec.md`；
- Active Ticket；
- `research/`；
- `prototypes/`；
- Wayfinder Decision。

不把即将修改的源码文件写入 Manifest。

## OMP Extension

修改 `.omp/extensions/trellis/index.ts`，保留现有 Session ID、路径信任、压缩恢复和 `TRELLIS_CONTEXT_ID` 注入。

### 工作流状态

`resolveActiveTaskStatus()` 读取 `task.json` 后：

1. 优先返回 `taskData.meta.flow_stage`；
2. 没有合法团队阶段时回退到 `taskData.status`；
3. 没有 Active Task 时返回 `no_task`。

这样 `TurnContextCache` 可以直接选择 `[workflow-state:discover]` 等团队状态块。

### Task Context 构建

`buildTaskContext()` 按角色加载：

- 主会话：`task.json` 摘要、`spec.md`、Active Ticket，以及两个 Manifest；
- `trellis-implement`：`spec.md`、Active Ticket、`context/implement.jsonl`；
- `trellis-check`：`spec.md`、Active Ticket、`context/review.jsonl`；
- `trellis-research`：`spec.md`、Active Ticket，只允许把结果写入当前任务的 `research/`。

所有 Manifest 路径继续经过 `resolveProjectFile()`，不得绕过仓库根目录和可信目录约束。

## OMP Agents

### `trellis-implement`

- 读取 Active Task、Spec、Active Ticket 和 Implement Context；
- 遵循 `oxyteam-implement` 与 `oxyteam-tdd`；
- 只实施并运行直接相关验证；
- 不执行 Review、Commit、Archive 或 Journal。

### `trellis-check`

文件名保留以兼容 Trellis 平台入口，但角色名称改为团队 Review 包装器：

- 读取 Spec、Active Ticket 和 Review Context；
- 调用 `oxyteam-code-review` 的 Standards 与 Spec 两轴审查；
- 发现问题时将流程退回 Implement；
- 不提交或归档。

### `trellis-research`

- 遵循 `oxyteam-research`；
- 每个主题写入独立的 `research/<topic>.md`；
- 不修改代码、Spec、Ticket 或平台配置。

## 上下文上限

继续使用 `.trellis/config.yaml` 的 `context_injection` 限制。不存在真实超限前不新增配置值；保留官方默认值。