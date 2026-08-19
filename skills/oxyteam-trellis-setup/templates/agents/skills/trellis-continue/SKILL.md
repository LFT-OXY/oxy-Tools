---
name: trellis-continue
description: "在当前任务上继续。读 task.json.meta.flow_stage 判断处于 discover / specify / slice / implement / finish 哪一阶段，implement 阶段再按 oxyteam_tickets.py 的票状态路由，然后用 get_context.py --mode phase 拉取该步骤的细节。回到一个进行中的任务、不确定下一步该做什么时使用。"
---

<!-- Oxyteam Overlay 版 continue —— 由 oxyteam-trellis-setup 整篇替换官方
     common/commands/continue.md 在本平台的渲染产物（不是补丁，是最终形态）。

     相对官方版改了四处：

     ① Step 3 的路由依据从「`status` + artifact 是否存在」换成
        `task.json.meta.flow_stage` + frontier。**不再看某个文件存不存在。**
     ② 步骤号对齐新的 workflow.md：1.1 / 1.2 / 1.3 / 1.4 / 2.1 / 3.1，
        官方那套 2.2 / 3.3 / 3.4 已经不存在了。
     ③ `design.md` / `implement.md` 本版不产生，相关判断分支整段删除。
     ④ `flow_stage=implement` 多一节跨会话恢复，只处理「上个会话 claim 了一张没做完」
        这一种入口状态。

     Step 3 的表格**只做 flow_stage → 阶段编号的映射，不复述各阶段该干什么**。
     v0.4.12 起这样定：复述过一版，v0.4.9 / v0.4.10 / v0.4.11 三轮改动全漏了这份文件，
     一口气漂出六处假指令。阶段细节的唯一出处是 `.trellis/workflow.md` 的块正文，
     Step 4 的 `--step <X.X>` 也是实时从它读的。**往这里加流程说明之前先想清楚：
     改 workflow.md 的人不会被提醒回来改这里。**

     Step 1 / 2 / 4 的 get_context.py 调用是官方运行时能力，原样保留。

     正文与另外两个平台的 continue 保持逐字一致，差异只有：frontmatter、
     H1（OMP 渲染时会删掉 H1，所以 OMP 那份没有）、`--platform` 的值。
     改一份就要同步改另外两份。

     正文里提到 Team Skill 一律写「提示用户运行 /oxyteam-xxx」，不写祈使句——
     那些 Skill 带 disable-model-invocation，模型调不动，写成祈使句会让它绕过
     Skill 自己动手干。
-->

# Continue Current Task

在当前任务上继续 —— 按 `.trellis/workflow.md` 里正确的阶段接着往下走。

---

## Step 1: 加载当前上下文

```bash
python3 ./.trellis/scripts/get_context.py
```

确认：当前任务、git 状态、近期提交。

## Step 2: 加载 Phase Index

```bash
python3 ./.trellis/scripts/get_context.py --mode phase
```

打印 Phase Index（Plan / Execute / Finish）与各阶段的入口。

## Step 3: 判断当前在哪一阶段

**判断依据只有 `task.json.meta.flow_stage`，不要凭任务目录里有没有某个文件来判断。**

```bash
# `current --json` 是白名单八字段，不含 meta —— 读 flow_stage 要两步
DIR=$(python3 .trellis/scripts/task.py current --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["current_task"]["dir"])')
python3 -c "import json;print(json.load(open('$DIR/task.json')).get('meta',{}).get('flow_stage','(未设置)'))"
```

| flow_stage | 接着走 |
|---|---|
| `discover` | 1.1 Discover |
| `specify` | 1.2 Specify |
| `slice` | 1.3 Slice |
| `implement` | 2.1 Implement（跨会话恢复另见下面一节） |
| `finish` | 3.1 Finish |

**本轮具体该做什么，读 `.trellis/workflow.md` 里对应的 `[workflow-state:<flow_stage>]` 块**——
那是权威，也正是每轮自动注入给你的那一份；Step 4 的 `--step <X.X>` 打印的同样是它。
这张表只负责把你送回正确的阶段。

**这里不复述各阶段的流程，是故意的。** 复述过一版，结果 v0.4.9 / v0.4.10 / v0.4.11 三轮改动
全漏了这份文件，一口气漂出六处假指令（还写着派 `trellis-implement` 子代理、票全 done 要
「提示用户确认后」才切挡位、归档判据是「工作区干净」而不是「`.trellis/tasks/` 以外干净」）。
改 `workflow.md` 的人没有任何机制会被提醒回来改这里 —— 少写一遍，就少一个会说谎的地方。

`flow_stage` 已经是 `implement` 但 `status` 还停在 `planning` 的，先补 1.4 Activate：
`python3 .trellis/scripts/task.py start <task-dir>`。

没有 Active Task 时不要直接建任务：先判断本轮属于哪一类，征得用户同意后才
`python3 .trellis/scripts/task.py create "<标题>" --slug <name> --meta flow_stage=discover`。

### flow_stage=implement 的跨会话恢复

`[workflow-state:implement]` 块是从 `frontier` 挑票起步的。跨会话恢复多一种入口状态：
**上一个会话已经 `claim` 了一张票，做了一半。** 先看清楚再动手：

```bash
python3 .trellis/scripts/oxyteam_tickets.py summary
```

输出里有 `doing <label>` → **接着推那一张**，不要回 `frontier` 挑新的。

其余情况（`doing` 为空、`票 0 张`、票全 `done`）按 implement 块走，这里不复述。

脚本本身拦得住误操作——`claim` 同一张是空操作，`claim` 另一张会直接报
`还在 doing。票默认串行，先 done 它再 claim 下一张`。先看一眼只是省一次报错，
不是防数据损坏。

### flow_stage 缺失时（Overlay 之前建的老任务）

按 `status` 粗判，并提示用户补 `flow_stage`，**不要自己挑一个值写进去**：

| status | 粗判 | 提示用户补 |
|---|---|---|
| `planning` | Phase 1 | 问清楚是 `discover` / `specify` / `slice` 里的哪一档 |
| `in_progress` | Phase 2 | `implement` |
| `completed` | Phase 3 | `finish` |

用户确认后：`python3 .trellis/scripts/task.py set-meta <task-dir> flow_stage <值>`。

`design.md` 和 `implement.md` 本版已不再使用，既不要拿它们的有无当判断依据，也不要新建。

## Step 4: 加载具体步骤

知道该从哪一步继续之后：

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.X> --platform codex
```

步骤号只有这六个：`1.1` / `1.2` / `1.3` / `1.4` / `2.1` / `3.1`。

## 规则

1. 先确定 `flow_stage`，再从该阶段的下一步继续，不要凭任务目录里有没有某个文件来判断；
2. 阶段可以回退（Implement 发现 Spec 有缺陷 → 回 Specify 修 → 再回来）；
3. Slice 是可选的，单会话任务不要创建空的 `issues/`；
4. 提到 Oxyteam Skill 一律提示用户运行 `/oxyteam-xxx`，不要自己动手替代 Skill 的职责；
5. 需求边界不清时先问，不要按猜测继续。

---

## Reference

完整工作流和阶段细节在 `.trellis/workflow.md`，那才是权威。本入口只负责把你送回正确的阶段。
