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
Discover  → oxyteam-askme / interview / askme-with-docs / map / research / prototype
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
| 需要严格追问计划或设计 | `oxyteam-askme` |
| 需要结构化收集信息 | `oxyteam-interview` |
| 需要追问并同步领域文档 | `oxyteam-askme-with-docs` |
| 存在跨会话 Fog of War | `oxyteam-map` |
| 存在外部事实未知项 | `oxyteam-research`（结果写 `<task>/research/`） |
| 需要低成本验证行为或界面 | `oxyteam-prototype` |
| 需求已经清楚 | 直接进 Specify |

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

## `.trellis/workflow.md` 转换要求

1. 官方 Plan / Execute / Finish 三阶段换成团队五阶段；
2. Skill Routing 换成实际存在的 `oxyteam-*` 名称；
3. 六个状态块按上面的配对格式写；
4. Continue 路由不再根据 `prd.md` / `design.md` / `implement.md` 是否存在作判断，改为按 `meta.flow_stage` + frontier；
5. 不调用未安装的 `workflow-guide`；
6. 不调用原始上游 Skill 名称，也不调用已删除的 `trellis-brainstorm` / `trellis-before-dev` / `trellis-check` / `trellis-break-loop`；
7. 保留 Trellis 的平台标记语法，第一版只编写 OMP 分支；
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
