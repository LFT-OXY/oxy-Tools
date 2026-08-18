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

## P1 / P2 —— 对官方注入层打补丁

这两项动的是官方 TypeScript 和 Python，锚点如下。**还没做成补丁文件**，见本文件末尾的「未完成」。

### P1 状态解析（三平台各一处）

| 平台 | 文件 | 锚点 |
|---|---|---|
| OMP | `.omp/extensions/trellis/index.ts` | `resolveActiveTaskStatus()` 的返回值 |
| Claude / Codex | `<平台>/hooks/inject-workflow-state.py` | `status = data.get("status", "")`（官方模板 179 行） |

改成：先读 `task.json` 的 `meta.flow_stage`，落在 `discover|specify|slice|implement|finish` 里就用它，否则回退 `status`，无任务返回 `no_task`。

Claude 和 Codex 的这个文件是**字节相同的官方模板**，同一份补丁应用两次。

### P2 会话启动（Claude 独有）

`.claude/hooks/session-start.py`，三个锚点（官方模板行号）：

```text
:482       "Next-Action: Load `trellis-brainstorm` and write `prd.md`. Stay in planning."
:488-489   ("design.md", has_design) / ("implement.md", has_implement_plan)
:513       "Implementation/check context order is jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if present`."
```

三处都要改掉：`trellis-brainstorm` 已删除，`design.md` / `implement.md` 本版不产生。

**`.codex/hooks/session-start.py` 不改** —— `.codex/hooks.json` 只注册了 `UserPromptSubmit` 和 `SubagentStart`，没有它，是死文件。

---

## 未完成

以下还是「描述」，没有做成现成件：

```text
B4 / B5   .trellis/agents/{implement,check}.md    需要整篇模板
P1 / P2   注入层补丁                              需要补丁文件或整篇模板
P3        Codex trellis-start/SKILL.md            需要整篇模板
P4 / P5   continue / finish-work                  需要整篇模板（三平台正文同、frontmatter 异）
P6        trellis-implement 子 Agent              需要整篇模板 ×2（md / toml）
A2        github_sync.py                          需要实现
A3        .oxyteam-overlay.json 生成逻辑           需要实现
```
