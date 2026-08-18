# 锚点替换表

`changeset.md` 里**只改几处**的那些文件，改法在这里逐字写死。整篇替换的走 `templates/`，不在本文件。

**为什么不写成散文让模型自己改**：`workers.md` 里有一处 `.trellis/agents/implement.md`，那是 **worker 文件自己的路径**，不是任务 artifact。一句「把 `implement.md` 换成当前票」会把它一起换掉，worker 定义就指向不存在的路径了。逐字锚点没有这个风险。

匹配规则：

- 锚点必须**逐字命中**，包括前导空格和续行反斜杠；
- 命中数与「处数」不符就**停下来报告**，不要凭相近结构猜；
- 表里没列的行不要动。

---

## B3 `.trellis/config.yaml` —— 启用 github_sync Hook

官方那段整块是注释状态。把下面这段注释块**整段替换**成启用版：

找（官方原文，`config.yaml` 里紧跟在「Hook failures print a warning」那行之后）：

```yaml
# hooks:
#   after_create:
#     - "echo 'Task created'"
#   after_start:
#     - "echo 'Task started'"
#   after_finish:
#     - "echo 'Task finished'"
#   after_archive:
#     - "echo 'Task archived'"
```

换成：

```yaml
hooks:
  after_create:
    - "python3 .trellis/scripts/hooks/github_sync.py create"
  after_archive:
    - "python3 .trellis/scripts/hooks/github_sync.py archive"
```

`after_start` / `after_finish` 不挂 —— 没有对应的远程动作。

> **`sync-spec` 和 `sync-tickets` 不在这里。** Trellis 没有「`prd.md` 被写入」这个事件，
> 所以那两个同步写成 Specify / Slice 的**阶段完成条件**（在 `workflow.md` 模板里），不是 Hook。

---

## P7 channel `references/workflows.md` —— 5 处

| # | 找（逐字，注意行首两个空格和行尾反斜杠） | 换成 |
|---|---|---|
| 1 | `  --file .trellis/tasks/05-XX-storage-adapter/design.md \` | `  --file .trellis/tasks/05-XX-storage-adapter/issues/01-storage-adapter.md \` |
| 2 | `  --file "$TASK/design.md" \` | `  --file "$TASK/issues/$TICKET.md" \` |
| 3 | `  --file "$TASK/implement.md" \` | **整行删除** |
| 4–5 | `  --jsonl "$TASK/check.jsonl" --file "$TASK/prd.md" --file "$TASK/design.md" \` | `  --jsonl "$TASK/check.jsonl" --file "$TASK/prd.md" --file "$TASK/issues/$TICKET.md" \` |

第 4–5 条那行在文件里**出现两次且逐字相同**（官方 82 行和 86 行），两处都要换。

换完在该文件示例的 `TASK=` 赋值附近补一行，让 `$TICKET` 有定义：

```bash
TICKET=$(python3 .trellis/scripts/oxyteam_tickets.py summary | grep -o 'doing [^ |]*' | cut -d' ' -f2)
```

## P8 channel `references/workers.md` —— 2 处

| # | 找 | 换成 |
|---|---|---|
| 1 | `  --file "$TASK/design.md" \` | `  --file "$TASK/issues/$TICKET.md" \` |
| 2 | `  --file "$TASK/implement.md" \` | **整行删除** |

> **不要动 `- \`.trellis/agents/implement.md\` — coding worker for implementation runs.`**
> 那是 worker 定义文件自己的路径，不是任务 artifact。`changeset.md` 早期版本写的「3 处」把它算进去了，实际只有 2 处。

## P9 channel `references/forum.md` —— 1 处

| # | 找 | 换成 |
|---|---|---|
| 1 | `  --file "$PWD/.trellis/tasks/05-13-login-redesign/design.md"` | `  --file "$PWD/.trellis/tasks/05-13-login-redesign/issues/01-login-redesign.md"` |

**P7–P9 合计 8 处，不是 9 处。** 每个平台各有一份拷贝，所以三平台全装是 24 处。

`references/command-reference.md` 和 `references/progress-debugging.md` 零过时引用，**不改**。
`trellis-channel/SKILL.md` 索引本身干净，**不改**。

---

## P10 `trellis-meta/SKILL.md` —— 顶部插入声明

在 frontmatter（第二个 `---` 那行）之后、正文第一行之前，插入：

```markdown
> ⚠ 本项目已应用 Oxyteam Overlay。
> 下面 references/ 描述的是原版 Trellis，以下内容在本项目已不成立：
>   design.md / implement.md 不再使用
>   trellis-brainstorm / before-dev / check / break-loop 已删除
>   workflow.md 是五阶段 + 六对 [workflow-state:*] 块
> 要改 Overlay，请走 oxyteam-trellis-setup，不要直接手改这些文件。
```

正文其余部分和 24 个 `references/` **一个字不动**。这是过渡措施：Installer 具备 reconcile 能力后整个 `trellis-meta` 删除，本条一并作废（见 `changeset.md` P10）。

---

## P1 —— 每轮状态注入

**不整篇替换。** `inject-workflow-state.py` 475 行、`index.ts` 592 行，整篇纳管等于每次
`trellis update` 都要全文 diff。这里只有两个锚点，逐字改。

### P1-a 状态解析：`flow_stage` 优先（Claude / Codex）

`<平台>/hooks/inject-workflow-state.py`。**这个文件在两个平台是字节相同的官方模板，同一份改动应用两次。**

找（官方模板 178–182 行，全文**只出现一次**，`_resolve_active_task` 之后）：

```python
    task_id = data.get("id") or task_dir.name
    status = data.get("status", "")
    if not isinstance(status, str) or not status:
        return None
    return task_id, status, active.source
```

换成：

```python
    task_id = data.get("id") or task_dir.name
    status = data.get("status", "")
    if not isinstance(status, str) or not status:
        return None
    # Oxyteam Overlay：细挡位 meta.flow_stage 优先，非法或缺失时回退官方 status
    meta = data.get("meta")
    stage = meta.get("flow_stage") if isinstance(meta, dict) else None
    if isinstance(stage, str) and stage in (
        "discover", "specify", "slice", "implement", "finish"
    ):
        status = stage
    return task_id, status, active.source
```

`meta` 不是 dict 时（老任务写坏过）也要能回退，所以先 `isinstance` 再 `.get`。

### P1-b 状态解析：`flow_stage` 优先（OMP）

`.omp/extensions/trellis/index.ts`，`resolveActiveTaskStatus()` 的返回语句（官方模板 243–247 行）。

找：

```typescript
   return {
      status: typeof taskData.status === "string" ? taskData.status : "planning",
      taskDir,
      taskTitle: typeof taskData.title === "string" ? taskData.title : null,
   };
```

换成：

```typescript
   // Oxyteam Overlay：细挡位 meta.flow_stage 优先，非法或缺失时回退官方 status
   const FLOW_STAGES = ["discover", "specify", "slice", "implement", "finish"];
   const meta = taskData.meta as Record<string, unknown> | undefined;
   const stage = meta && typeof meta.flow_stage === "string" ? meta.flow_stage : null;
   const fallback = typeof taskData.status === "string" ? taskData.status : "planning";
   return {
      status: stage && FLOW_STAGES.includes(stage) ? stage : fallback,
      taskDir,
      taskTitle: typeof taskData.title === "string" ? taskData.title : null,
   };
```

### P1-c 注入当前票（三平台各一处）

`flow_stage=implement` 时，把 `oxyteam_tickets.py summary` 的输出附在状态块后面，
让主会话每轮都确切知道当前票是哪张 —— 不依赖模型记住上一轮 claim 了什么。

**复用已有脚本，不要在注入层里再写一个票解析器。** 失败一律静默：注入层挂掉比没有票摘要严重得多。

**Python 侧**（Claude / Codex，同一份改两次）。找 `main()` 里这段（官方模板 435–440 行）：

```python
        task_id, status, source = task
        status_key = resolve_breadcrumb_key(status, platform, config)
        source_for_breadcrumb = None if platform == "codex" else source
        breadcrumb = build_breadcrumb(
            task_id, status, templates, source_for_breadcrumb, breadcrumb_key=status_key
        )
```

在它下面**插入**（注意缩进是 8 空格，和上面的 `breadcrumb = ` 同级）：

```python
        # Oxyteam Overlay：实施阶段把当前票摘要附上，失败静默
        if status == "implement":
            try:
                summary = subprocess.run(
                    [sys.executable, str(root / ".trellis" / "scripts" / "oxyteam_tickets.py"),
                     "summary"],
                    capture_output=True, text=True, timeout=5, cwd=root,
                )
                if summary.returncode == 0 and summary.stdout.strip():
                    breadcrumb += f"\n\n<oxyteam-tickets>\n{summary.stdout.strip()}\n</oxyteam-tickets>"
            except Exception:
                pass
```

`subprocess` 官方已经 import 了，`sys` 也是 —— 应用前确认一遍文件头，缺了就补 import。

**OMP 侧**：`TurnContextCache.get()` 里，`this.workflowMsg = ` 那行之前插入同样逻辑，
用已经 import 的 `spawnSync`（`buildSessionContext()` 在用），超时同样 5 秒，catch 掉一切。

### 不加 `TurnContextCache.beginTurn()`

`changeset.md` P1 原本要求 OMP 每轮先清缓存再重建。**实测后建议不加**：

```text
官方 TurnContextCache 已有 TTL_MS = 1500 的时间窗（index.ts:364）
它的用途是同一轮内三个事件级联（input / before_agent_start / context）复用一份快照
跨轮次自然过期，只有「两轮用户输入间隔 < 1.5 秒且期间状态变了」才会读到旧值
而状态变更都要先跑命令（set-meta / claim），凑不出这个窗口
```

加 `beginTurn()` 要动 `TurnContextCache` 的类定义和扩展入口两处，换一个凑不出来的窗口。
**这条与 `changeset.md` P1 的原文有出入，按本文件执行，改动方要么更新 changeset 要么给出反例。**

---

## P2 —— 会话启动注入（Claude 独有）

`.claude/hooks/session-start.py` 的 `_get_task_status()`（官方模板 424–514 行）。

**整个函数替换**，不做三处碎锚点。原因：官方版 planning 分支的**判断基础是 artifact 存不存在**
（`has_prd` / `has_design` / `has_implement_plan`），本版按 `meta.flow_stage` 判断，
这套基础整个不成立了 —— 碎改会留下半新半旧的逻辑。

保留不动的部分：无任务分支、stale pointer 分支、`task.json` 读取、`_has_curated_jsonl_entry`
调用。要改的是从 `task_title = task_data.get(...)` 开始到函数结束。

替换后的行为：

```text
artifact_names   去掉 design.md / implement.md，加 issues/
completed        保留，但 "return to Phase 3.4" 改成本版的 3.1 Finish
planning 分支    改成读 meta.flow_stage 路由到 discover / specify / slice，
                 缺 flow_stage 的老任务回退到按 prd.md 有无粗判并提示补 set-meta
in_progress 分支 context order 改成「当前票（implement.jsonl）→ prd.md → .trellis/spec/」
所有 Next-Action  提到 Team Skill 一律写「提示用户运行 /oxyteam-xxx」
```

三处必须消失的字符串（改完 grep 确认为 0）：

```text
Load `trellis-brainstorm` and write `prd.md`
("design.md", has_design)
`design.md if present` -> `implement.md if present`
```

**`.codex/hooks/session-start.py` 不改** —— `.codex/hooks.json` 只注册了 `UserPromptSubmit`
和 `SubagentStart`，没有它，是死文件。改它是白改。

### 两处已知残留，明确不改

```text
inject-workflow-state.py:428   注释里提到 trellis-brainstorm —— 注释不产生行为
index.ts:388  TRELLIS_AGENTS 里留着 trellis-check / trellis-research —— agent 已按 C5/C6
              删除，Set 里的名字永远不会命中，无害
```

两处都只影响可读性，改了就多两个 `trellis update` 冲突点，按定价表不划算。

---

## 现成件覆盖情况

```text
scripts/          A1 A2 A3   拷贝即可，落盘后各跑一次 selfcheck
templates/        B1 B4 B5   共享层整篇替换
                  P3 P4 P5 P6  平台层整篇替换（路径镜像落点）
本文件的锚点表     B3 P1 P2 P7 P8 P9 P10
```

`A3` 的记账由 `scripts/write_overlay_state.py` 生成，不要手写 JSON、手算 hash：

```bash
# apply 之前 —— 清单从 changeset.md 逐条列出，三列：action layer path
python3 .trellis/scripts/write_overlay_state.py snapshot <<'EOF'
modify shared .trellis/workflow.md
delete codex  .agents/skills/trellis-brainstorm
EOF

# apply 之后
python3 .trellis/scripts/write_overlay_state.py finalize --platforms omp,claude-code

# 任何时候
python3 .trellis/scripts/write_overlay_state.py verify
```

`snapshot` 里没有的路径 = 记账里没有 = `verify` 管不着，所以清单必须**逐条照着
`changeset.md` 列全**，不要凭印象挑。
