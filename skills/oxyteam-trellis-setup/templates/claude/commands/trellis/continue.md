# Continue Current Task

<!-- Oxyteam Overlay 版 continue —— 由 oxyteam-trellis-setup 整篇替换官方
     common/commands/continue.md 在本平台的渲染产物（不是补丁，是最终形态）。

     相对官方版改了四处：

     ① Step 3 的路由依据从「`status` + artifact 是否存在」换成
        `task.json.meta.flow_stage` + frontier。**不再看某个文件存不存在。**
     ② 步骤号对齐新的 workflow.md：1.1 / 1.2 / 1.3 / 1.4 / 2.1 / 3.1，
        官方那套 2.2 / 3.3 / 3.4 已经不存在了。
     ③ `design.md` / `implement.md` 本版不产生，相关判断分支整段删除。
     ④ `flow_stage=implement` 多一层票级路由，走 `oxyteam_tickets.py summary` / `frontier`。

     Step 1 / 2 / 4 的 get_context.py 调用是官方运行时能力，原样保留。

     正文与另外两个平台的 continue 保持逐字一致，差异只有：frontmatter、
     H1（OMP 渲染时会删掉 H1，所以 OMP 那份没有）、`--platform` 的值。
     改一份就要同步改另外两份。

     H1 必须是本文件第一行，本注释块只能排在它后面 —— Claude Code 拿首个非空行
     当命令描述，注释压在前面会让 skill 列表显示成 `<!-- Oxyteam Overlay 版…`。

     正文里提到 Team Skill 一律写「提示用户运行 /oxyteam-xxx」，不写祈使句——
     那些 Skill 带 disable-model-invocation，模型调不动，写成祈使句会让它绕过
     Skill 自己动手干。
-->

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
python3 .trellis/scripts/task.py current --json
```

| flow_stage | 接着走 | 本轮该做什么 |
|---|---|---|
| `discover` | 1.1 Discover | 问题、范围、成功标准还没清楚。按情况提示用户运行 `/oxyteam-askme`（追问计划或设计）、`/oxyteam-interview`（结构化收集）、`/oxyteam-askme-with-docs`（追问并同步领域文档）、`/oxyteam-map`（跨会话 Fog of War）、`/oxyteam-research`（外部事实未知）、`/oxyteam-prototype`（低成本验证）。清楚了 `set-meta flow_stage specify` |
| `specify` | 1.2 Specify | 提示用户运行 `/oxyteam-spec`，把权威 Spec 写进 `<task>/prd.md`。然后 `TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec`。一个会话内做得完就 `set-meta flow_stage implement`，做不完先走 Slice |
| `slice` | 1.3 Slice | 提示用户运行 `/oxyteam-tickets`，把票写进 `<task>/issues/NN-*.md`。`python3 .trellis/scripts/oxyteam_tickets.py frontier` 校验通过（无环、无悬空 Blocker、至少一张票）、`github_sync.py sync-tickets` 回填 `**Issue:**` 后 `set-meta flow_stage implement` |
| `implement` | 2.1 Implement | 先做下面的「票级路由」 |
| `finish` | 3.1 Finish | 跑 `python3 .trellis/scripts/oxyteam_tickets.py summary` 确认所有票 `Impl: done`，工作区干净后走 finish-work 入口归档并写 Journal |

`flow_stage` 已经是 `implement` 但 `status` 还停在 `planning` 的，先补 1.4 Activate：
`python3 .trellis/scripts/task.py start <task-dir>`。

没有 Active Task 时不要直接建任务：先判断本轮属于哪一类，征得用户同意后才
`python3 .trellis/scripts/task.py create "<标题>" --slug <name> --meta flow_stage=discover`。

### flow_stage=implement 的票级路由

```bash
python3 .trellis/scripts/oxyteam_tickets.py summary
```

按输出分四种情况：

- 输出里有 `doing <label>` → **接着推那一张票，不要 claim 新的**（票默认串行，一次只推进一张）；
- 有票但 `doing` 为空 → `python3 .trellis/scripts/oxyteam_tickets.py frontier` 挑下一张，
  `python3 .trellis/scripts/oxyteam_tickets.py claim <NN>`，然后派 `trellis-implement` 子代理；
- 输出是 `票 0 张` → 这是没走 Slice 的单会话任务，直接读 `<task>/prd.md` 实施；
- 票全部 `done` → 提示用户确认后 `python3 .trellis/scripts/task.py set-meta <task-dir> flow_stage finish`。

`claim <NN>` 已经一并写了 `**Impl:** doing`、`meta.implementation_base_sha` 和
`<task>/implement.jsonl`，不要在别处重复做这三件事。

派发 `trellis-implement` 的提示词第一行必须是
`Active task: <task.py current 输出的路径>`。它是薄包装，内部调完整的
`oxyteam-implement`（自带 tdd → 测试 → code-review → commit）——不要指示它跳过 review 或 commit。

一张票做完 `python3 .trellis/scripts/oxyteam_tickets.py done <NN>`，回 `frontier` 挑下一张。

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
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.X> --platform claude
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
