---
name: trellis-start
description: "初始化一个 Trellis 管理的开发会话：读 .trellis/ 的工作流、developer 身份、git 状态、Active Task 和项目规范索引，把本轮请求分类后路由到 discover / specify / slice / implement / finish 五个阶段之一。开始新会话、恢复工作、开新任务或需要重建项目上下文时使用。"
---

<!-- Oxyteam Overlay 版 trellis-start —— 由 oxyteam-trellis-setup 整篇替换官方
     common/commands/start.md 渲染到 Codex 的产物（.agents/skills/trellis-start/SKILL.md）。

     Codex 没有 session-start hook，这个 skill 就是它唯一的会话引导入口，
     所以官方版里那几处过时指路在 Codex 上是每个新会话都会踩到的。

     相对官方版改了三处：

     ① Step 4 的路由依据从「`status` + `prd.md` 是否存在」换成
        `task.json.meta.flow_stage`，指向新的五阶段。表**只做 flow_stage → 阶段编号的
        映射，不复述各阶段该干什么**（v0.4.12 起）——阶段细节的唯一出处是
        `.trellis/workflow.md` 的块正文。
     ② 删掉对 trellis-brainstorm / trellis-before-dev / trellis-check /
        trellis-break-loop 的引用（本版已删除），换成对应的 Oxyteam Skill。
     ③ 删掉「复杂任务需要 design.md + implement.md」那条——本版不产生这两个产物。

     Step 1 / 2 / 3 的 get_context.py 调用与规范索引读法是官方运行时能力，原样保留。

     正文里提到 Team Skill 一律写「提示用户运行 /oxyteam-xxx」，不写祈使句——
     那些 Skill 带 disable-model-invocation，模型调不动，写成祈使句会让它绕过
     Skill 自己动手干。
-->

# Start Session

初始化一个 Trellis 管理的开发会话。本平台没有 session-start hook，所以按下面的步骤手动加载等价的精简上下文。

---

## Step 1: 当前状态

身份、git 状态、当前任务、活跃任务、Journal 位置。

```bash
python3 ./.trellis/scripts/get_context.py
```

如果输出里有以 `Trellis update available:` 开头的行，总结会话上下文时把整行逐字带上，不要缩写里面的操作命令。

## Step 2: 工作流概览

精简的 Phase Index、请求分类规则，以及拉取单步细节的命令。

```bash
python3 ./.trellis/scripts/get_context.py --mode phase
```

完整指南在 `.trellis/workflow.md`（按需读）。

## Step 3: 规范索引

先发现 package 与 spec 层，再读每个相关的 index 文件。

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
cat .trellis/spec/guides/index.md
cat .trellis/spec/<package>/<layer>/index.md   # 每个相关的层各读一次
```

index 文件列出真正开始写代码时该读哪些规范文档。

## Step 4: 决定下一步

Step 1 已经给出当前任务。**路由依据是 `task.json.meta.flow_stage`，不是任务目录里有没有某个文件。**

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
| `implement` | 2.1 Implement |
| `finish` | 3.1 Finish |

**本轮具体该做什么，读 `.trellis/workflow.md` 里对应的 `[workflow-state:<flow_stage>]` 块**——
那是权威，也正是每轮自动注入给你的那一份。这张表只负责把你送回正确的阶段。

**这里不复述各阶段的流程，是故意的。** 同一套流程写在两个文件里，改 `workflow.md` 的人不会被
提醒回来改这里 —— 三份 `continue` 模板就是这么漂了六处假指令，一直漂到 v0.4.11 才被发现。

拉某一步的细节：

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform codex
```

步骤号只有这六个：`1.1` / `1.2` / `1.3` / `1.4` / `2.1` / `3.1`。

`flow_stage` 缺失（Overlay 之前建的老任务）时按 `status` 粗判——`planning` 在 Phase 1、`in_progress` 在 Phase 2、`completed` 在 Phase 3——并提示用户用 `task.py set-meta <task-dir> flow_stage <值>` 补齐，**不要自己挑一个值写进去**。

**没有 Active Task**：先分类。简单对话 / 小改动只问一句本轮要不要建 Trellis 任务；复杂任务征得同意后
`python3 .trellis/scripts/task.py create "<标题>" --slug <name> --meta flow_stage=discover` 进入 Discover。用户说不用，本会话就跳过 Trellis。

`design.md` 和 `implement.md` 本版已不再使用，不要新建，也不要拿它们的有无当判断依据。

---

## Skill 路由（速查）

| 用户意图 | 怎么走 |
|---|---|
| 新功能 / 需求不清楚 | 提示用户运行 `/oxyteam-askme`、`/oxyteam-interview`、`/oxyteam-askme-with-docs` 或 `/oxyteam-map` |
| 有外部事实未知项 | 提示用户运行 `/oxyteam-research`（结果写 `<task>/research/`） |
| 需要低成本验证行为或界面 | 提示用户运行 `/oxyteam-prototype` |
| 准备开始写代码 | 走 Implement 前置：`oxyteam_tickets.py frontier` → `claim <NN>` → 派 `trellis-implement` 子代理（薄包装，内部调完整的 `oxyteam-implement`） |
| 写完了要做质量检查 | 提示用户运行 `/oxyteam-code-review`（它自己 spawn 两个干净上下文的子代理：Standards 一轴、Spec 一轴） |
| 卡住了 / 同一个 bug 反复修 | 提示用户运行 `/oxyteam-diagnosing-bugs` |
| 学到值得沉淀的东西 | `trellis-update-spec` |

派发 `trellis-implement` 的提示词第一行必须是 `Active task: <task.py current 输出的路径>`。

完整规则在 `.trellis/workflow.md`。
