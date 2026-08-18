# Oxyteam Trellis 任务模型

## 设计决策

复用 Trellis 已有的 `.trellis/tasks/`、Session Active Task、父子任务、归档、Lifecycle Hooks、分支信息和 `task.json.meta`。**五个官方 Python 一个字不动**，团队逻辑放进新建的 `oxyteam_tickets.py`。

任务目录里的文件**就是权威正文**，不是副本也不是指针。远程 Issue 是从这里单向同步出去的镜像。

好消息：`update.ts` 的 `PROTECTED_PATHS` 包含 `.trellis/tasks/`，注释写着 "true user data"。任务目录怎么改，升级都不会来动它，也不产生冲突提示。

## 目录结构

```text
.trellis/tasks/<task>/
├── task.json
├── prd.md              ← oxyteam-spec 产出，内容是 Oxyteam Spec 形态
├── issues/             ← oxyteam-tickets 产出，一票一文件（唯一的新结构）
│   ├── 01-xxx.md
│   ├── 02-yyy.md
│   └── 03-zzz.md
├── implement.jsonl     ← Trellis 官方 context manifest，保留
├── check.jsonl         ← Trellis 官方，保留（留着不用，删了没收益）
├── research/           ← oxyteam-research 产出（官方本来就有这个目录）
└── sessions/
```

创建任务时 `task.py create` 只生成 `task.json` 和官方骨架 `prd.md`。其他按需产生。

## Spec 文件为什么仍然叫 `prd.md`

文件名可以随便取，那就挑最省钱的那个。官方对 `prd.md` 的四个消费点**没有一处解析内容结构**：

```python
# task_store.py    只在首次写骨架，不覆盖已有内容
if not prd_path.exists():
    prd_path.write_text(_default_prd_content(...))

# session_context.py    只判断存在
if prd_file.exists():
    lines.append("[!] This task has prd.md - read it for task details")

# linear_sync.py    整篇当文本，同步到远程 Issue
description = prd_path.read_text(encoding="utf-8").strip()
```

```typescript
// index.ts    整篇当文本注入
let prd = "";
try { prd = readFileSync(join(taskDir, "prd.md"), "utf-8"); } catch { }
if (prd.trim()) parts.push(`## PRD\n\n${prd.trim()}`);
```

**没有 schema 校验，没有必需标题检查，没有章节解析。** Trellis 把它当一坨不透明的文本。沿用这个名字白省 `task_store.py` / `session_context.py` / `linear_sync.py` / `index.ts` 四个官方文件。

里面装的是 Oxyteam Spec 的章节：

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

`oxyteam-spec` 直接 Write 整个文件，把首次创建的默认骨架覆盖掉即可——`if not prd_path.exists()` 只保护首次，不会回头覆盖内容。

`design.md` 和 `implement.md` **不再使用**：`design.md` 的内容并进 Spec 的 Implementation Decisions，重大决策进 `docs/adr/`；`implement.md`（单文件执行清单）被 `issues/` 取代——后者能算 Frontier，前者不能。不主动删这两个文件的模板逻辑（它们本来就是按需创建），只是流程里不再产生它们。

**不做 Spec 章节校验。** Spec 的质量由 `oxyteam-spec` 负责，不在 Trellis 侧再造一份校验器。旧版的 `validate_spec()` 只能保证「标题齐了」，反而制造假安全感——默认占位文本 `- [ ] 待补充。` 本身就满足「Acceptance Criteria 有列表项」这条正则。**一个概念只有一个地方校验。**

## 状态分三层，各管各的

```text
① task.json.status              planning / in_progress / completed
                                ← Trellis 官方粗挡位，一个字不动
                                  Archive、Journal、Hooks 全靠它

② task.json.meta.flow_stage     discover / specify / slice / implement / finish
                                ← 新增细挡位
                                  因为 planning 一档涵盖了 Oxyteam 的三步，不够用

③ issues/NN-xxx.md 文件内：
   **Status:** ready-for-agent  ← oxyteam-tickets 原样，恒定不变
   **Impl:** ready|doing|done   ← 新增，Trellis 路由靠它
   **Blocked by:** 01, 03       ← oxyteam-tickets 原样
   **Issue:** #58               ← 新增，记住同步到哪张远程 Issue
```

### 为什么加 `Impl:` 而不是改 `Status:`

`Status:` 是 **triage 词汇**（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix），跟 `docs/agents/triage-labels.md` 绑死。它表达的是「这票够不够清楚、该谁接」，不是实施进度。

旧版把实施阶段（claimed / review / done）也塞进这个字段，三套概念挤一个格子，制造了一堆状态冲突。加一个正交字段是纯增量，triage 那套词汇一个字不动。

### triage 的适用边界

```text
oxyteam-triage  只管别人提的 issue / PR（backlog）
                这些东西在远程 GitHub 上，出现在任何 Trellis 任务之前

oxyteam-tickets 产出的票  天生 ready-for-agent（模板里写死的）
                          不参与 triage —— 它们是你自己切的，不需要分诊
```

所以任务目录里那些票的 `Status:` 恒定是 `ready-for-agent`，是个占位，真正干活的是 `Impl:`。

### `task.json.meta` 字段

```json
{
  "status": "planning",
  "meta": {
    "flow_stage": "discover",
    "source_ref": "42",
    "implementation_base_sha": ""
  }
}
```

| 字段 | 含义 | 写入时机 |
|---|---|---|
| `flow_stage` | 五阶段细挡位 | 阶段转换时 |
| `source_ref` | 来源远程 Issue 号，可空 | 创建任务时 |
| `implementation_base_sha` | 本次实施起点 HEAD，供 code-review 用 | 进入 Implement 时；多票时 claim 每张票时 |

**读写方式**（不自造命令）：

```bash
# 写：官方 set-meta
python3 .trellis/scripts/task.py set-meta <task-dir> flow_stage implement

# 读：没有对应的读命令，直接读 task.json
#     index.ts 本来就是这么干的
```

> 注意：`--meta key=value` 只存在于 `task.py create`，**不是读取入口**。不要写「用 `--meta` 读 flow_stage」这类指令。

生命周期映射（`status` 保持官方语义）：

| 团队阶段 | Trellis `status` |
|---|---|
| Discover / Specify / Slice | `planning` |
| Implement | `in_progress` |
| Finish | `completed` |

`task.py start` 继续设置 Session Active Task 并把 `status` 从 `planning` 改成 `in_progress`；Overlay 同时把 `flow_stage` 设成 `implement`。

## 票

多会话任务的每张票是一个可独立验证的垂直切片：

```markdown
# 01 — Ticket 标题

**What to build:** 从用户角度描述完整行为。

**Blocked by:** None
**Status:** ready-for-agent
**Impl:** ready
**Issue:**

## Acceptance Criteria

- [ ] 验收条件一
- [ ] 验收条件二
```

Frontier 票必须同时满足：

- `Impl:` 是 `ready`；
- 所有 Blocker 的 `Impl:` 都是 `done`。

阻塞引用使用票号（`01`、`02`）。引用不存在或形成阻塞环时校验失败。

单会话任务不创建 `issues/`，Implement 直接读 `prd.md`。

### 票默认串行

一个任务同时只推进一张票。`oxyteam_tickets.py frontier` 算出可开工的票，人或 Agent 挑一张 claim。

**必须写进限制清单的一条：**

> **Trellis 和三个 Tracker，全都不提供原子的排他 Claim。**
>
> - `task.py start` 只是 session 本地指针，两个 session 可以 start 同一个 task；
> - `gh issue edit --add-assignee` / `glab issue update --assignee` 没有 compare-and-set；
> - 本地文件的 `Impl: doing` 是读了再写，存在 TOCTOU。
>
> 任何方案都绕不过。只能三选一：接受乐观并发 + 人工协调 / 新增真正的锁或 CAS 后端 / 把并行单位限制到冲突可接受。

这条**不能被表述成某个方案的优势**——谁都没解决。默认串行就是选了「限制并行单位」这条。

顺带澄清一个常见误解：Trellis 的 child task **不提供 git 隔离**。全库搜 `worktree_path`——类型声明有、初始化成 null 有、测试断言它是 null 也有，**零写入路径、零消费路径**。`branch` / `base_branch` 有 setter，但只往 json 写字符串，不建分支也不切分支。准确说法是：child task 提供独立的 planning / active-task / archive 生命周期加一个元数据容器，git 分支和合并隔离必须由 Trellis 之外的流程建立。

## `oxyteam_tickets.py` 契约

新建路径 `.trellis/scripts/oxyteam_tickets.py`，官方模板里没有，0 冲突点。

```text
list        列出所有票 + Impl 状态
frontier    算出「Impl: ready + Blocked by 全部 done」的票
claim <NN>  校验它在 frontier 里，然后标记 Impl: doing
done <NN>   标记 Impl: done
summary     汇总一行，给 workflow-state 用
```

硬校验（代码直接拒绝）：

```text
Blocker 引用不存在        → 失败
Blocker 形成环            → 失败
claim 不在 frontier 里的票 → 失败
```

**不要**把这些函数塞进官方 `task_utils.py` / `task.py`。旧版这么干白付了 4 个官方文件的永久冲突成本。

## 远程 Issue 同步

### 角色定死：单向，任务目录 → 远程

```text
GitHub Issue #42（别人报的 bug/需求）      ← 来源，triage 在这儿跑
  ↓ 你决定要做
建 Trellis 任务，task.json 记 source_ref = "42"
  ↓ oxyteam-spec 写 <task>/prd.md
同步：gh issue edit 42 --body-file <task>/prd.md
  ↓ oxyteam-tickets 写 <task>/issues/*.md
同步：每票建一个 sub-issue + 原生依赖边，票文件回填 **Issue:** #58
  ↓ 归档
同步：gh issue close 42
```

**权威始终在任务目录，远程是镜像。** 不做双向——双向要处理冲突合并，而正文是你自己写的，远程改正文的场景基本不存在。评论是另一回事，不覆盖正文。

### 触发方式：两种，不能都当 Hook

**这是实测纠正过的一处：Trellis 只有四个 Lifecycle Hook 事件**，全部在任务生命周期转换时触发：

```text
after_create   task_store.py 创建任务后
after_start    task.py start 后
after_finish   task.py finish 后
after_archive  task_store.py 归档后
```

**没有任何事件在 `prd.md` 或 `issues/*.md` 被写入时触发。** 所以「写完 Spec 自动同步」不可能靠 `hooks:` 配置实现。

官方 `linear_sync.py` 已经给了正确的分法，照抄即可：

| 动作 | 触发方式 |
|---|---|
| `create` / `archive` | 真 Hook，挂 `.trellis/config.yaml` 的 `hooks:` 段 |
| `sync-spec` / `sync-tickets` | **显式调用**，由 Specify / Slice 阶段末尾的工作流指令驱动 |

```bash
# Hook 形态（config.yaml 里配）
python3 .trellis/scripts/hooks/github_sync.py create

# 显式形态（workflow.md 的阶段完成条件里写明）
TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec
```

环境变量 `TASK_JSON_PATH` 由 `task.py` 在 Hook 场景自动设置；显式调用时自己传。这跟 `linear_sync.py` 的 `sync` 子命令是同一个模式。

### 远程表示按 `oxyteam-tickets` 已有的契约做

不自己发明。`oxyteam-tickets` 已经写了：

> **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one.

```bash
gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by \
  -F issue_id=<blocker-db-id>
```

```text
GitHub Issue #42                          ← 来源，同步后正文是 Spec
├─ sub-issue #57  ← issues/01-xxx.md
├─ sub-issue #58  ← issues/02-yyy.md      blocked_by #57
└─ sub-issue #59  ← issues/03-zzz.md      blocked_by #57
```

两个实现细节：

```text
① 本地票号 ↔ 远程 issue 号 的映射
   → 就写在票文件里那行 **Issue:** #58，不另建映射表

② 依赖边必须按顺序推
   → 先建 blocker 的 issue 才能拿到它的 database id
   → oxyteam-tickets 已经写了「in dependency order (blockers first)」，照做
```

同步是**幂等**的：本地改了 `Blocked by:`，下次 sync 重新推一遍边即可。

## 迁移

发现旧任务时不静默删除或混合加载旧 Artifact。列出冲突任务，由用户选择迁移、归档或暂时保留。

唯一的初始化例外是官方未修改的 `.trellis/tasks/00-bootstrap-guidelines/`：

- 它由 `trellis init` 自动生成；
- 后续 `oxyteam-init` 接管项目规则和领域文档初始化；
- 预检确认其文件仍与官方模板一致且没有用户进度时，可把删除该目录列入应用计划；
- 只有用户明确确认该删除项后才能执行；
- 发现任何用户修改时按普通旧任务冲突处理。
