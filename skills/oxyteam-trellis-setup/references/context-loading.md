# Oxyteam Trellis Context Loader

## 目标

因为正文就在任务目录，官方的 `buildTaskContext()` **直接就能读到真实的 Spec**（它读 `prd.md`）——不需要绕 ref，不需要联网，不需要认证。这是本版最直接的收益，也意味着**改动面极小**。

## 四个官方时机，一个都不改造

```text
session_start        新会话开始 → 注入任务摘要
before_agent_start   每轮对话前 → 注入当前阶段的 [workflow-state:X] 块
context              被压缩之后 → 发现提示丢了就重新注入
tool_call            跑 Bash 时 → 塞 TRELLIS_CONTEXT_ID
```

Session Identity、Trusted Roots、Manifest Context、压缩后重注入这些框架**原样保留**。

## 官方 Python 一个都不改

```text
.trellis/scripts/common/session_context.py   不改
.trellis/scripts/common/task_context.py      不改
.trellis/scripts/get_context.py              不改
```

旧版改过前两个，本版从头不碰。所有 Overlay 需要的行为差异都能在 `index.ts` 这一个文件里做完——这是「改一个文件」和「改三个文件」的差别，按定价表就是每次 `trellis update` 少付两次冲突。

## `.omp/extensions/trellis/index.ts` 要改三处

### ① `resolveActiveTaskStatus()` 读 `flow_stage`

```text
现在：只返回 task.json.status（planning / in_progress / completed）
改成：优先读 task.json.meta.flow_stage
      不在合法枚举内或不存在 → 回退 status
      没有 Active Task → 返回 no_task（官方已有行为，保留）
```

合法枚举：`discover | specify | slice | implement | finish`。

`status` 返回值直接被 `TurnContextCache` 拿去匹配 `[workflow-state:X]` 块，所以枚举值必须和 `.trellis/workflow.md` 里的块名逐字对应。

### ② `buildTaskContext()` 注入当前票

`buildTaskContext()` 现在始终读 `prd.md` 和 `info.md`，再按 `agentType` 决定读哪些 jsonl。改动只是加一段：

```text
读 <taskDir>/issues/ 下 Impl: doing 的那张票，整篇注入
再附上 oxyteam_tickets.py summary 的一行汇总（frontier 有哪些）
issues/ 不存在时跳过（单会话任务的正常状态）
```

**`agentType` 的三个分支不动。** `trellis-check` / `trellis-research` 两个 Agent 定义文件被删除后，对应分支变成死代码，但留着零成本、零行为影响；去删它还要动 `AgentType` 类型声明，是白花的改动量。

`info.md` 是官方一直在读的另一个文件，本 Overlay 不产生它，也不用管。

### ③ 每个新用户输入建一次快照

当前 `TurnContextCache` 的缓存键只有 `projectRoot + contextKey`，TTL 1500ms，`context` 事件在没发生压缩时走 fast path 不重新解析。**所以任务状态在同一会话里变了（切票、切阶段），Agent 可能还拿着旧的。**

目标**不是**让同一个 Turn 里每次工具调用都跟着实时变化，而是：

```text
每个新用户输入：
  TurnContextCache.beginTurn() 先清掉旧的 key 和 timestamp
  再重新解析 Session Pointer、task.json、flow_stage、当前票、workflow 块
  —— 强制建立一次新快照

同一个输入内的 before_agent_start → context 级联：
  复用这份快照，不重复解析
```

落点已经现成了——`pi.on("input", ...)` 里已经有一句预热缓存的调用，注释写着 "Pre-warm the cache so before_agent_start and context can use it"。在它前面加一次失效即可：

```typescript
// 新增方法：把缓存键置空，强制下一次 get() 重新解析
beginTurn(): void { this.key = null; this.timestamp = 0; }
```

```typescript
pi.on("input", async (_event, ctx) => {
   ...
   const contextKey = rememberContextKey(ctx);
   turnCache.beginTurn();          // ← 新增
   turnCache.get(projectRoot, contextKey);
});
```

**不采用**「只给缓存键加 `taskJsonVersion`」：缓存命中判断发生在 Active Task 解析之前，光版本化 `task.json` 会漏掉 Session Pointer 切换、从「没任务」变「有任务」、workflow 内容变化；要做完整版本键反而更复杂。

TTL 1500ms 保留不动——它现在的职责变成「同一个输入内的级联去重」，这正是它注释里写的用途。

## Manifest 保留官方形态

```text
<task>/implement.jsonl    保留，官方能力，按需列出要自动加载的文件
<task>/check.jsonl        保留不动（无消费者，但删了没收益）
```

**不改成 `context/implement.jsonl` 这类新路径**——那要改 `task_context.py`，白付一个官方文件。

每行格式保持：

```json
{"file":"<仓库根目录相对路径>","reason":"<为什么需要读取>"}
```

`task_context.py` 接受任意仓库相对路径，所以可以往里写：

```text
CODING_STANDARDS.md
docs/adr/**
.trellis/spec/backend/error-handling.md
CONTEXT.md / CONTEXT-MAP.md
<task>/research/*.md
```

**不把即将修改的源码文件写入 Manifest**——源码由 Agent 在实施时自己检索。

所有 Manifest 路径继续经过官方的仓库根目录和可信目录校验，不得绕过。

## OMP Agent

`.omp/agents/` 下只剩一个需要改：

### `trellis-implement`（改）

```text
读取：Active Task、prd.md、当前票、implement.jsonl、.trellis/spec/ 对应层
传入：implementation_base_sha、当前 branch
职责：调完整的 oxyteam-implement，不拆它的闭环
```

它是**薄包装器**，不复述 `oxyteam-implement` 的步骤，更不能加「你别 review 别 commit」这类指令。

### `trellis-check`、`trellis-research`（删）

```text
trellis-check    → oxyteam-code-review 自己 spawn 两个干净上下文子代理，是超集
trellis-research → oxyteam-research 自己 spawn 后台 agent，本身就是 context 隔离
```

删除后必须扫全项目确认没有残留调用（`workflow.md`、`trellis-continue.md`、`trellis-session-insight`、channel 的 reference 都提过这两个名字）。

## 上下文上限

继续使用 `.trellis/config.yaml` 的 `context_injection` 限制。不存在真实超限前不新增配置值，保留官方默认值。

注意注入量在本版是变大的：`prd.md` 全文 + 当前票全文 + frontier 摘要。真跑到超限再调，不预调。
