# Oxyteam Trellis 工作流 Overlay

## 模块接口

Overlay 只修改 `trellis init` 已生成的项目文件。

三个模块保持分离：

- Trellis Runtime：任务状态、Session Active Task、归档和 Journal；
- Oxyteam Skill Pack：所有 `oxyteam-*` 工程能力；
- Oxyteam Workflow Overlay：把 Trellis 工作流路由到团队 Skills。

不得修改全局 Trellis npm 包或官方源码。

## 状态模型

保留 Trellis 原有的 `task.json.status` 生命周期值，避免破坏现有 Runtime：

- `planning`
- `in_progress`
- `completed`

团队工作阶段写入：

```text
task.json.meta.flow_stage
```

允许值：

```text
discover
specify
slice
implement
review
finish
```

OMP 后续读取工作流状态时：

1. 优先读取 `meta.flow_stage`；
2. 没有 `meta.flow_stage` 时回退到原始 `status`；
3. 没有 Active Task 时使用 `no_task`。

这样可以增加团队工作流，而不重写 Trellis 的 Session Active Task 机制。

## 团队工作流

```text
Discover
  ↓
Specify
  ↓
Slice（仅多会话任务）
  ↓
Implement
  ↓
Review
  ↓
Finish
```

## Discover

按真实问题选择入口：

- 需要严格追问计划或设计：`oxyteam-askme`
- 需要结构化收集信息：`oxyteam-interview`
- 需要追问并同步领域文档：`oxyteam-askme-with-docs`
- 存在跨会话 Fog of War：`oxyteam-map`
- 存在外部事实未知项：`oxyteam-research`
- 需要低成本验证行为或界面：`oxyteam-prototype`
- 需求已经清楚：直接进入 `oxyteam-spec`

完成条件：

- 问题、范围和成功标准清楚；
- 关键术语或 ADR 已按需记录；
- 技术未知项已研究或原型验证；
- 已经具备生成 Spec 的信息。

## Specify

入口：

```text
oxyteam-spec
```

完成条件：

- Spec 已生成；
- 验收条件可观察；
- 测试 Seam 已确认；
- Spec 已进入可实施状态。

## Slice

只有无法在一个 Agent 会话内完成的任务才进入 Slice。

入口：

```text
oxyteam-tickets
```

完成条件：

- Tickets 是可独立验证的垂直切片；
- Blocking Edges 已声明；
- 用户已确认拆分；
- 至少存在一个未阻塞、未认领的 Frontier Ticket。

单会话任务从 Specify 直接进入 Implement，不创建空的 `tickets/`。

## Implement

入口：

```text
oxyteam-implement
```

实施期间按需使用：

```text
oxyteam-tdd
```

读取顺序：

1. Active Task；
2. Active Ticket，或单会话任务的 Spec；
3. 相关 `CONTEXT.md` 或 `CONTEXT-MAP.md`；
4. 相关 ADR；
5. `.trellis/spec/`；
6. Research 或 Prototype 结果；
7. 真实源码、调用者和数据流。

Trellis 模式下，`oxyteam-implement` 只负责实现和直接相关验证。

Review、提交、归档和 Journal 仍由后续 Trellis 阶段负责，避免一个 Skill 跨越多个阶段。

## Review

入口：

```text
oxyteam-code-review
```

独立检查：

- Standards：是否符合项目规范；
- Spec：是否正确实现当前 Spec 或 Ticket。

发现问题时返回 Implement。Review 通过后才能完成当前 Ticket。

## Finish

Trellis Runtime 继续负责：

- 完成当前 Ticket；
- 解除下游 Ticket 的阻塞；
- 选择下一个 Frontier Ticket；
- 记录 Commit 和 PR；
- 全部 Tickets 完成后归档 Task；
- 写入 Journal。

## `.trellis/workflow.md` 转换规则

后续应用 Overlay 时：

1. 将官方 Plan、Execute、Finish 改为团队六阶段流程；
2. 将 Skill Routing 改为实际存在的 `oxyteam-*` 名称；
3. 增加以下工作流状态块：

```text
[workflow-state:no_task]
[workflow-state:discover]
[workflow-state:specify]
[workflow-state:slice]
[workflow-state:implement]
[workflow-state:review]
[workflow-state:finish]
```

4. 保留 Trellis 的平台标记语法，第一版只编写 OMP 分支；
5. Continue 路由不再根据 `prd.md`、`design.md` 或 `implement.md` 是否存在作判断；
6. 不调用未安装的 `workflow-guide`；
7. 不调用原始上游 Skill 名称；
8. 不修改 `.trellis/.template-hashes.json`。
