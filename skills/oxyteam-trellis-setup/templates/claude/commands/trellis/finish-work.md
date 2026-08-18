# Finish Work

<!-- Oxyteam Overlay 版 finish-work —— 由 oxyteam-trellis-setup 整篇替换官方
     common/commands/finish-work.md。三个平台（OMP / Claude Code / Codex）正文一致，
     只有 frontmatter 和命令引用前缀不同。

     相对官方版改了四处：

     ① 新增 Step 0 归档门禁：`flow_stage=finish` 且所有票 `Impl: done` 才放行。
        判据取 `oxyteam_tickets.py summary` 的输出。`票 0 张` 是合法的放行情况 ——
        单会话任务不走 Slice，压根没有 `issues/`，别误判成「票没做完」。
     ② 官方文案把 commit 指向工作流里一个本版已不存在的旧步骤号。本版 commit 发生在
        Implement 阶段（`oxyteam-implement` 自带 commit），脏工作区的出路是回 Implement。
     ③ 脏路径分类里的 artifact 名对齐本版：只留 `prd.md` / `implement.jsonl` /
        `check.jsonl`。
     ④ Step 3 归档会触发 Hook 跑 `github_sync.py archive` 关远程 Issue，正文点明。

     正文提到 Oxyteam Skill 一律写「提示用户运行 /oxyteam-xxx」，不写祈使句 ——
     那些 Skill 带 disable-model-invocation，模型调不动，写成祈使句会让它绕过
     Skill 自己动手干。

     H1 必须是本文件第一行，本注释块只能排在它后面 —— Claude Code 拿首个非空行
     当命令描述，注释压在前面会让 skill 列表显示成 `<!-- Oxyteam Overlay 版…`。
-->

收尾当前会话：归档 Active Task（以及用户确认要一起清理的其他已完成任务），并记录 Session Journal。

**这里不提交代码。** commit 发生在 Implement 阶段 —— `oxyteam-implement` 自带 tdd → 测试 → code-review → commit 的完整闭环，走到 finish-work 时工作区本来就该是干净的。

## Step 0: 归档门禁

```bash
# `current --json` 是白名单八字段，不含 meta —— 读 flow_stage 要两步
DIR=$(python3 .trellis/scripts/task.py current --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["current_task"]["dir"])')
python3 -c "import json;print(json.load(open('$DIR/task.json')).get('meta',{}).get('flow_stage','(未设置)'))"
python3 .trellis/scripts/oxyteam_tickets.py summary
```

两条**同时**满足才放行：

1. `task.json.meta.flow_stage` 是 `finish`；
2. 所有票 `Impl: done`。

`summary` 输出一行，形如：

```text
票 3 张 | done 1 | doing 02-t02 | frontier 03
```

没有票时输出 `票 0 张`。

按输出路由：

- **`票 0 张`** —— 放行，继续 Step 1。单会话任务不走 Slice，压根没有 `issues/`，这是正常形态，不是「票没做完」。
- **张数和 `done` 数相等**（例如 `票 3 张 | done 3`）—— 放行，继续 Step 1。
- **还有票没 done** —— 拦住，不要归档，把 summary 原样报给用户：
  > "还有票没做完：`<summary 输出>`。回 Implement 阶段（workflow.md `#### 2.1 Implement`），用 `oxyteam_tickets.py frontier` / `claim <NN>` / `done <NN>` 把剩下的票推完，再 `python3 .trellis/scripts/task.py set-meta <task-dir> flow_stage finish`，然后重新运行 `/trellis:finish-work`。"
- **`flow_stage` 不是 `finish`** —— 同样拦住，提示用户先回到 `flow_stage` 对应的阶段走完，不要跳过阶段直接归档。

## Step 1: 摸清当前状态

```bash
python3 .trellis/scripts/get_context.py --mode record
```

会打印：

- **My active tasks** —— 看看除当前任务外，还有没有别的其实已经做完（代码已合、验收条件已满足）、该顺手归档的；
- **Git status** —— 工作区脏在哪；
- **Recent commits** —— Step 4 的 `--commit` 要用这些 hash。

如果 `--mode record` 报出了本次会话之外的已完成任务，一次性问用户："这 N 个任务看起来已经完成，本轮一起归档吗？[y/N]"。默认否；当前 Active Task 在 Step 3 无论如何都会归档。

## Step 2: 脏路径分类

```bash
git status --porcelain
```

先滤掉 `.trellis/workspace/` 和 `.trellis/tasks/` 下的路径 —— 那些由 `add_session.py` 和 `task.py archive` 的 auto-commit 管理，本来就会因为本流程自己的动作而显脏。

剩下每条脏路径，判断它属于**当前任务**还是**另一路并行工作**（比如另一个终端窗口在改同一个仓库）。判据：

- 当前任务的 `prd.md` / `implement.jsonl` / `check.jsonl` 里引用过的路径 → 当前任务；
- 落在任务声明范围内的代码区域，或你记得本会话改过的 → 当前任务；
- 完全无关、本会话没碰过的 → 另一路并行工作。

然后路由：

- **还有路径像是当前任务的活** —— 停下：
  > "工作区里还有本任务未提交的代码改动：`<列表>`。commit 属于 Implement 阶段，提示用户回到 Implement 阶段运行 `/oxyteam-implement` 把这批改动走完 review 和 commit，再重新运行 `/trellis:finish-work`。"

  这里**不要**跑 `git commit`，也不要提示用户手动 commit。
- **剩下的都是无关路径** —— 报一次然后继续 Step 3：
  > "提示：这些脏文件不在本任务范围内，留给另一个窗口：`<列表>`。"
- **实在拿不准** —— 问用户一次："`<列表>` 是本任务漏提交的，还是另一个窗口的？（提交 / 忽略）"，按回答路由。

## Step 3: 归档任务

```bash
python3 .trellis/scripts/task.py archive <task-name>
```

至少归档当前 Active Task，加上 Step 1 里用户确认的那些。每次归档都由脚本的 auto-commit 产生一个 `chore(task): archive ...` 提交。

归档会触发 Lifecycle Hook 跑 `.trellis/scripts/hooks/github_sync.py archive` 关闭远程 Issue。这个 Hook 失败只警告、退出 0，不会阻断归档；真没关掉就手动补一次 `gh issue close`。

如果没有 Active Task，用户也没确认要清理别的任务，跳过这步。

## Step 4: 记录 Session Journal

```bash
python3 .trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

`--commit` 填 Implement 阶段产生的工作提交 hash（Step 1 的 `Recent commits` 里能看到，或者 `git log --oneline`）。不要把 Step 3 的归档提交 hash 混进去。这步产生一个 `chore: record journal` 提交。

最终 git log 顺序：`<Implement 阶段的工作提交>` → `chore(task): archive ...`（一个或多个）→ `chore: record journal`。
