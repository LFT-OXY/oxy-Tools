# 契约速查

`templates/` 下所有文件、以及安装时按描述现写的内容，**里面出现的命令行、字段名、
阶段名一律从本文件逐字抄**，不要自己发挥。

这类不一致是**静默**的：`oxyteam_tickets.py --frontier` 和 `oxyteam_tickets.py frontier`
两边看着都合理，装进项目才发现前者 argparse 直接报错、而模型会把报错当成
"这个任务没有票"继续往下走。

---

## 五个阶段

```text
discover  specify  slice  implement  finish
```

存在 `task.json.meta.flow_stage`。粗挡位 `task.json.status`（`planning` / `in_progress` /
`completed`）保持官方语义不动，两者并存不互相替代。

| flow_stage | status | 归属 |
|---|---|---|
| `discover` | `planning` | Phase 1 |
| `specify` | `planning` | Phase 1 |
| `slice` | `planning` | Phase 1 |
| `implement` | `in_progress` | Phase 2 |
| `finish` | `completed` | Phase 3 |

`slice` 是可选的：一个 Agent 会话内做得完的任务从 `specify` 直接进 `implement`，
**不要创建空的 `issues/`**。

状态块标签共 6 个：`no_task` 加上面 5 个，写作 `[workflow-state:<名>]` … `[/workflow-state:<名>]`。

---

## 票脚本 `oxyteam_tickets.py`

安装到 `.trellis/scripts/oxyteam_tickets.py`。子命令**只有这 6 个**，位置参数，无长选项：

```bash
python3 .trellis/scripts/oxyteam_tickets.py list        # 全部票 + Impl 状态，frontier 的带 ←frontier
python3 .trellis/scripts/oxyteam_tickets.py frontier    # 可开工的票
python3 .trellis/scripts/oxyteam_tickets.py claim <NN>  # → Impl: doing
python3 .trellis/scripts/oxyteam_tickets.py done <NN>   # → Impl: done
python3 .trellis/scripts/oxyteam_tickets.py summary     # 汇总一行
python3 .trellis/scripts/oxyteam_tickets.py selfcheck   # 内置断言，不碰仓库
```

唯一的可选参数是 `--task-dir <仓库相对路径>`，缺省时脚本自己问 `task.py current`。

**`claim <NN>` 一次做三件事**，别在别处重复实现：

```text
① 票文件写 **Impl:** doing
② task.py set-meta <task-dir> implementation_base_sha <git rev-parse HEAD>
③ 当前票路径写进 <task>/implement.jsonl
```

`done <NN>` 写 `**Impl:** done` 并撤掉 ③ 那行。

**四条硬校验会直接失败（退出 1），不是警告**：

```text
Blocker 引用了不存在的票
Blocker 形成环
claim 一张不在 frontier 里的票
已经有别的票在 doing        ← 票默认串行，一次只推进一张
```

输出格式（写门禁判断时按这个 parse）：

```text
summary   票 3 张 | done 1 | doing 02-t02 | frontier 03
          没有票时是   票 0 张
frontier  02  02-slug          每行一张，空时是   (frontier 为空)
```

---

## 票文件

路径 `<task>/issues/NN-slug.md`，文件名必须是 `NN-slug.md`（编号是前缀，两位数）。
`label` 就是不带扩展名的文件名，例如 `02-t02`。

字段行格式逐字如下，`**` 和冒号都不能少：

```markdown
**Status:** ready-for-agent
**Impl:** ready
**Blocked by:** 01, 03
**Issue:** #58
```

| 字段 | 谁在用 | 取值 |
|---|---|---|
| `**Status:**` | triage 词汇，占位 | 恒定 `ready-for-agent` |
| `**Impl:**` | **驱动路由的就是它** | `ready` / `doing` / `done` |
| `**Blocked by:**` | frontier 计算 | 票号，`01` / `#01` / `1` 三种写法都认，逗号分隔 |
| `**Issue:**` | `github_sync.py sync-tickets` 回填 | `#58`，本地为空表示还没同步 |

`**Status:**` 和 `**Impl:**` 是**两个正交字段**，不要合并、不要拿 `Status` 判断实施进度。

---

## 远程同步 `github_sync.py`

安装到 `.trellis/scripts/hooks/github_sync.py`。**权威在任务目录，远程只是镜像，单向。**

```bash
create         # 确保有远程 Issue，号写进 meta.source_ref
sync-spec      # <task>/prd.md 整篇推到 Issue 正文
sync-tickets   # 每票一个 sub-issue + blocked_by 依赖边，回填 **Issue:**
archive        # 关闭远程 Issue
selfcheck      # 内置断言，不联网
```

**两种触发方式不能混**：

```text
create / archive          真 Hook，挂 .trellis/config.yaml 的 hooks: 段
                          失败只警告，退出 0（不能因为同步失败就阻断建任务/归档）
sync-spec / sync-tickets  显式调用，写在 workflow.md 的阶段完成条件里
                          失败退出 1
```

原因：**Trellis 只有四个 Lifecycle Hook 事件，全在任务生命周期转换时触发**，
没有任何事件在 `prd.md` 或 `issues/*.md` 被写入时触发。"写完 Spec 自动同步"
靠 `hooks:` 配置做不到，别往那边写。

显式调用要自己传 `TASK_JSON_PATH`：

```bash
TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec
```

---

## 官方 CLI（照抄，不要臆造 flag）

```bash
python3 .trellis/scripts/task.py current --json            # 当前任务，机读
python3 .trellis/scripts/task.py current                   # 打印仓库相对的任务目录路径
python3 .trellis/scripts/task.py create "<标题>" --slug <name> --meta flow_stage=discover
python3 .trellis/scripts/task.py start <task-dir>          # status → in_progress
python3 .trellis/scripts/task.py set-meta <task-dir> <key> <value>
python3 .trellis/scripts/task.py archive <task-name>
python3 .trellis/scripts/task.py validate
python3 .trellis/scripts/add_session.py --title … --commit … --summary …
python3 .trellis/scripts/get_context.py                    # 当前任务 + git 状态 + 近期提交
python3 .trellis/scripts/get_context.py --mode record      # finish-work 用
```

`task.py current` **没有 `--path` 这个 flag**，不带参数就是打印路径。
`create` 的标题是**位置参数**，没有 `--title`；且需要 `--assignee` 或已配置的 developer。

**这五个官方 Python 一个字不能改**：`task_store.py` / `task_utils.py` / `task_context.py` /
`session_context.py` / `task.py`。要新逻辑就写进 `oxyteam_tickets.py`。

---

## 当前票怎么送到子代理

**走 `<task>/implement.jsonl`**，由 `claim` 写入、`done` 撤掉。

三个平台的注入层本来就都读这个文件（OMP `index.ts:303`、Claude / Codex 的
`inject-subagent-context.py`），所以 **`inject-subagent-context.py` 一个字不改** ——
那是两个平台各 1174 行的永久冲突点，绕过去是本版最大的一笔节省。

写模板时不要另发明"把票内容贴进提示词"之类的第二条通路。

派发 `trellis-implement` 的提示词**第一行必须是**：

```text
Active task: <task.py current 输出的路径>
```

---

## 禁止出现的词

以下在本版**已删除或已不使用**，模板里出现一次就是把用户指向不存在的东西：

```text
trellis-brainstorm      → 换 /oxyteam-askme / interview / askme-with-docs / map
trellis-before-dev      → 并进 implement 前置
trellis-check（skill）  → 换 /oxyteam-code-review
trellis-break-loop      → 换 /oxyteam-diagnosing-bugs
trellis-check（agent）  → oxyteam-code-review 自己 spawn 两个子代理
trellis-research（agent）→ oxyteam-research 自己 spawn 后台 agent
design.md               → 不再产生任何任务产物用这个名
implement.md            → 同上
```

`design.md` / `implement.md` 只允许以"**已不再使用**"的说明形态出现，
不允许出现 `$TASK/design.md`、`<task>/implement.md` 这类**路径形态**。

> **例外**：`.trellis/agents/implement.md` 是 **channel worker 定义文件自己的路径**，
> 不是任务产物，不要连它一起改掉。P8 早期版本把它算成"第 3 处"就是踩了这个。

---

## Team Skill 怎么提：分主会话和子代理两种

所有 `oxyteam-*` Skill 都带 `disable-model-invocation`，主会话的模型**调不动**。

**主会话入口**（`workflow.md` 的状态块、continue、finish-work、start）——写成提示：

```text
✅  提示用户运行 `/oxyteam-spec`
❌  运行 /oxyteam-spec 写 prd.md
```

写成祈使句的结果是模型绕过 Skill 自己动手干，产出一份没走方法论的东西。

**子代理和 channel worker**（`<平台>/agents/**`、`.trellis/agents/**`）——它们**没有用户可提示**，
是被派发去自动执行的。这里要写成：

```text
能列出这个 Skill 就直接调；调不动就读它的 SKILL.md 按其流程原样执行，
不要自己简化成「写代码 + 跑测试」。
```

`trellis-implement` 本来就定义成 `oxyteam-implement` 的薄包装，让它"提示用户"是死路。

## git commit 的权限两边相反，别抄串

```text
.trellis/agents/implement.md   channel worker    Forbidden: git commit  ← 保留
                               受主会话监管的并行工人，主会话负责收口

<平台>/agents/trellis-implement 子代理           允许 git commit
                               它走完整的 oxyteam-implement 闭环，
                               而那个闭环以 commit 收尾。禁掉会产生两份冲突指令
```

两个文件名字像、职责不同。官方版两边都写着 `No git commit allowed`，本版只有前者保留。

---

## 三个平台的落点与差异

```text
共享层  .trellis/**             改一次，三平台通吃
平台层  .omp/ .claude/ .codex/  同一件事各一份拷贝
```

| | OMP | Claude Code | Codex |
|---|---|---|---|
| 入口层 | `.omp/commands/` | `.claude/commands/trellis/` | `.agents/skills/`（**没有命令层**） |
| 子代理 | `.omp/agents/*.md` | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| 注入 | TS 扩展 `index.ts` | Python hooks | Python hooks |
| 命令引用前缀 | `/trellis:` | `/trellis:` | `$` |

Codex 上 continue / finish-work 是 **skill 不是 command**，frontmatter 按 skill 格式写。

`.agents/skills/` 是**跨工具共享层**，Gemini CLI / Pi / Kimi Code / dsh 都读它，
在那儿动的东西对它们同样生效。

重写 `.codex/agents/trellis-implement.toml` 时**必须保留用户钉的 `model` /
`model_reasoning_effort`** —— 官方 `applyCodexAgentModelKeys` 就是这么做的，
不照做会把用户的模型选择静默吹掉。

---

## 官方模板在哪

写模板前先读官方原文，不要凭印象改：

```text
/Users/oxy/.nvm/versions/node/v24.15.0/lib/node_modules/@mindfoldhq/trellis/dist/templates/
  common/commands/continue.md          → P4 三平台共同的源
  common/commands/finish-work.md       → P5 同上
  omp/agents/trellis-implement.md      → P6 OMP
  claude/agents/trellis-implement.md   → P6 Claude
  codex/agents/trellis-implement.toml  → P6 Codex
  trellis/agents/implement.md          → B4
  trellis/agents/check.md              → B5
```

### 三平台的 frontmatter 差异（实跑 `collectPlatformTemplates` 导出的，逐字照抄）

同一个 `common/commands/continue.md` 渲染到三个平台，**头部完全不同**：

```yaml
# OMP  .omp/commands/trellis-continue.md      —— 有 frontmatter，H1 标题被删掉
---
description: "Resume work on the current task at the correct phase."
---
# 正文直接从第一段开始，没有 `# Continue Current Task`
# finish-work 额外多一行：argument-hint: "[task-name]"
```

```markdown
<!-- Claude  .claude/commands/trellis/continue.md  —— 没有 frontmatter，保留 H1 -->
# Continue Current Task
```

```yaml
# Codex  .agents/skills/trellis-continue/SKILL.md  —— name + description，保留 H1
---
name: trellis-continue
description: "……"
---

# Continue Current Task
```

子代理 `.omp/agents/*.md` 和 `.claude/agents/*.md` 都有 `name` / `description` / `tools`，
**但 `tools` 的值大小写不同**（OMP 是 `read, write, edit, bash, find, search, ast_grep, lsp`，
Claude 是 `Read, Write, Edit, Bash, Glob, Grep`），OMP 还多一行 `model: pi/task`。
这些**原样保留，不要跨平台抄**。

### 渲染变量

模板里的 `{{PYTHON_CMD}}` / `{{CLI_FLAG}}` / `{{CMD_REF:x}}` 是渲染变量。
**我们的模板是落到磁盘的最终形态，要写成已渲染的样子**：`python3`、平台各自的
`cliFlag`（`omp` / `claude` / `codex`）、`cmdRefPrefix + x`（前两个平台 `/trellis:x`，
Codex 是 `$x`）。
