# Issue tracker: ATW task directory (local only)

本仓库用 ATW 任务系统跟踪工作。所有 issue——当前任务的规格和实现工单——都以 markdown 文件的形式存放在当前 ATW 任务目录中。没有远程镜像：任务目录是**唯一权威**，不向任何地方同步。

## Resolving the current task directory

下文所有路径都相对于当前活动任务。先解析它：

```bash
TASK=$(python3 .atw/scripts/task.py current)
```

不带参数的 `current` 输出相对仓库根的任务目录。**没有活动任务时它以非零状态退出**——遇到这种情况就停下，请用户创建或启动一个任务。不要回退到 `.scratch/`。

## Conventions

- **规格**：`$TASK/prd.md`。整份重写；`task.py create` 生成的骨架本来就是用来覆盖的。ATW 把该文件当作不透明文本，不解析其中任何内容。
- **实现工单**：每个工单一个文件，位于 `$TASK/issues/<NN>-<slug>.md`，按依赖顺序从 `01` 开始编号。
- **调研笔记**：`$TASK/research/<topic>.md`，每个主题一个文件。
- **分诊状态**：任务目录内的工单不使用——见下文关于 `Status:` 的说明。
- 评论和对话历史追加在工单文件末尾的 `## Comments` 标题下。

## Ticket file fields

在标准工单模板之上，这里的工单多一行：

```markdown
# 01 — Ticket title

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** None
**Status:** ready-for-agent
**Impl:** ready
```

| 字段 | 取值 | 由谁写入 |
|---|---|---|
| `Status:` | 分诊角色（见 `triage-labels.md`） | 固定为 `ready-for-agent`。这些工单是你自己切分的，永远不需要分诊——该字段只是为了词汇兼容而保留的占位。 |
| `Impl:` | `ready` / `doing` / `done` | `tickets.py`。这是工作流真正据以路由的字段，也是解析器唯一要求的字段。 |

`tickets.py` 写出的工单模板还带有一行空的 `**Issue:**`。在本变体中它没有意义——没有东西会填它——`tickets.py` 也从不读它。保留或删除都不会出问题。

`Status:` 和 `Impl:` 是刻意分开的。`Status:` 回答"这个工单是否足够清晰、该由谁接手"；`Impl:` 回答"它进展到哪了"。把实现进度并入 `Status:` 会让三套互不相关的词汇挤在同一个槽位里。

## When a skill says "publish to the issue tracker"

| 产物 | 目的地 |
|---|---|
| 规格 | `$TASK/prd.md` |
| 实现工单 | `$TASK/issues/<NN>-<slug>.md` |

这些文件**就是** tracker——没有同步步骤，也没有可发布的远程。

在这里发布时不要打分诊标签；这些产物不进入分诊队列。

## When a skill says "fetch the relevant ticket"

- 形如 `01` 的编号或文件名 → 读取 `$TASK/issues/<NN>-*.md`。
- 未给出引用 → 运行 `python3 .atw/scripts/tickets.py frontier`，取当前处于 `Impl: doing` 的工单；若没有已认领的，则取 frontier 上的第一个。

## Ticket operations

```bash
python3 .atw/scripts/tickets.py list        # 全部工单及 Impl 状态
python3 .atw/scripts/tickets.py frontier    # Impl: ready 且所有阻塞项已 done
python3 .atw/scripts/tickets.py claim <NN>  # → Impl: doing
python3 .atw/scripts/tickets.py done <NN>   # → Impl: done
python3 .atw/scripts/tickets.py claim <NN> --parallel  # → Impl: doing，可与其他工单并存（仅 `/atw-implement-spec`）
```

`claim` 拒绝不在 frontier 上的工单，解析器会拒绝不存在或成环的阻塞引用。`claim` 还会记录 `implementation_base_sha`，并把工单路径写入 `$TASK/check.jsonl`——评审子代理靠它得知哪个工单正在进行；`done` 会撤回这一行。

**工单默认一次只跑一个。** 已有工单处于 `Impl: doing` 时，`claim` 会硬性拒绝第二个，但该检查是先读后写——它保证的是串行执行，而不是原子的排他认领。不要手动让两个实现者同时操作同一个任务目录。

**唯一的并行路径是 `/atw-implement-spec`。** 它的编排器用 `--parallel` 认领，允许多个工单同时处于 `Impl: doing`，整次运行只记录一次 `implementation_base_sha`，并且不向 `$TASK/check.jsonl` 写入当前工单行——此时不存在单一的进行中工单。只有编排器写工单状态；每个实现者在各自的 worktree 中工作。

## Wayfinding operations

供 `atw-map` 使用。map 是 **discover 阶段**的产物，与其他内容一起存放在任务目录中。

- **Map**：`$TASK/map.md`——Notes / Decisions-so-far / Fog 正文。
- **子工单**：`$TASK/map-issues/NN-<slug>.md`，从 `01` 开始编号，正文写问题。`Type:` 行记录工单类型（`research`/`prototype`/`interview`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：靠近文件顶部的一行 `Blocked by: NN, NN`。它列出的每个文件都为 `resolved` 时，该工单即解除阻塞。
- **Frontier**：扫描 `$TASK/map-issues/`，找出未关闭、未阻塞、未认领的文件；编号最小者优先。
- **认领**：动手之前先设置 `Status: claimed` 并保存。
- **解决**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后在 `map.md` 的 Decisions-so-far 中追加一条上下文指针。

决策工单放在 `map-issues/`，**不是** `issues/`。它们是以"做出决定"为解决方式的问题；`issues/` 存放的是待执行的构建切片。两者使用不同的状态词汇（`claimed`/`resolved` 对 `Impl:`），而 `tickets.py` 只读 `issues/`。混放会让 frontier 的计算在两个方向上都出错。

## What is *not* tracked here

以下内容留在仓库根目录，保持不变：

```text
docs/adr/          architecture decisions          atw-domain-modeling
GLOSSARY.md        domain glossary                 atw-domain-modeling
.out-of-scope/     rejected-concept records        atw-triage
.atw/spec/         layered coding standards        ATW's own spec flow
```

它们的寿命长于任何单个任务，所以不该放进会被归档的目录。

## Re-enabling the GitHub mirror

镜像机制随 ATW 一起提供，但默认关闭。`.atw/scripts/github_sync.py` 可以正常工作，只是没有任何东西调用它。开启镜像需要你自己在两处接线——没有现成的注释块可以直接取消注释，所以请对照这里给出的命令检查。

1. **`.atw/config.yaml`**——添加 `hooks:` 块。该文件自带一段注释掉的示例，展示了结构，但不含同步接线：

   ```yaml
   hooks:
     after_create:
       - "python3 .atw/scripts/github_sync.py create"
     after_archive:
       - "python3 .atw/scripts/github_sync.py archive"
   ```

   在 hook 路径上 `task.py` 会替你设置 `TASK_JSON_PATH`，所以这两条不需要环境变量前缀。用 `grep -n -A 6 "^hooks:" .atw/config.yaml` 验证——应当看到你的两条配置，且行首没有 `#`。

2. **`.atw/workflow.md`**——把同步步骤加为阶段完成条件：规格写完时运行 `github_sync.py sync-spec`，工单切分完时运行 `github_sync.py sync-tickets`。两者都是显式命令而不是 hook——ATW 只在任务 create / start / finish / archive 时触发生命周期 hook，**不存在"某个文件被写入"的事件**。它们需要带 `TASK_JSON_PATH=$TASK/task.json` 前缀，因为在 hook 路径之外没有东西替你设置它。

3. **替换本文件**为 "ATW task directory + GitHub" 变体，它记录了同步步骤以及由同步填写的 `**Issue:**` 工单字段。种子模板随 `atw-init-repo` skill 目录提供，文件名为 `references/issue-tracker-atw.md`；用下面的命令定位：

   ```bash
   find -L . -name "issue-tracker-atw.md" -not -path "./.git/*"
   ```

   `-L` 很关键：skill 目录经常在 `.claude/skills/` 与 `.agents/skills/` 之间做符号链接，不带 `-L` 的 `find` 遇到符号链接目录不会深入，于是只会报告两个路径中的一个。

历史任务无需回填——从那时起，`create` 会为每个新任务分配一个新的远程 issue。

## Why this variant exists

选择 ATW 任务目录作为 tracker，并不意味着必须选择 GitHub。本文件覆盖的是"任务目录就是全部"的情形：没有远程的仓库、私有或个人项目，或是有意不把规划产物放进 issue tracker 的团队。

这里没有任何内容是镜像变体的降级版——在那个变体里，任务目录本来也是权威。唯一被拿掉的只是对外的那份副本。
