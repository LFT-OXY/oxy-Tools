# Oxyteam Trellis 工作流 Overlay

## 四个模块

```text
① Oxyteam Skill Pack   方法：澄清、Spec、Tickets、Map、实现、TDD、审查、分诊
② Trellis Runtime      运行时：Session、Active Task、恢复、Archive、Journal、mem、Hooks
③ Runtime Adapter      转接：阶段路由、票解析、上下文分发、远程同步 —— 就是 Overlay 本体
④ Setup Installer      装/卸/升级 ③ —— 就是本 Skill
```

Overlay 只修改 `trellis init` 已生成的项目文件，不修改全局 Trellis npm 包或官方源码。

## 五个阶段

```text
Discover
  ↓
Specify
  ↓
Slice（可选，只有拆成多张票时才进）
  ↓
Implement          ← 里面自带 tdd + code-review + commit
  ↓
Finish
```

路由：

```text
Discover  → oxyteam-askme-with-docs（默认）/ askme / map / prototype
Specify   → oxyteam-spec       写 <task>/prd.md
Slice     → oxyteam-tickets    写 <task>/issues/*.md
Implement → trellis-implement 薄包装 → 完整的 oxyteam-implement
Finish    → Trellis Archive + Journal
```

Map 不单独成一种任务类型：它是 Discover 阶段的长驻模式，`[workflow-state:discover]` 在有 Map 材料时提示「继续 work the map」。

### 为什么没有独立的 Review 阶段

`oxyteam-implement` 只有 15 行，但它是完整闭环：

```text
实现 → 用 oxyteam-tdd → 跑测试 → 调 oxyteam-code-review → commit
```

想在中间插一个独立 Review 阶段，就必须把它拆开、告诉它「你别 review 别 commit」。那是**两份直接冲突的指令**：Agent 同时读到「要 review 要 commit」和「不许 review 不许 commit」，最后做什么全看模型当时怎么想。

所以：保持 `oxyteam-implement` 完整，不设独立 Review 阶段。**不要在 workflow.md 里写「Trellis 模式下 oxyteam-implement 只负责实现」这类话**——那正是被推翻的做法。

**能力不丢**：Trellis check agent 唯一值钱的地方是「在干净上下文里审查」，而 `oxyteam-code-review` 自己就 spawn 两个并行子代理（Standards 一个、Spec 一个），同样是干净上下文，还多一根轴。

`check.jsonl` 留着不动——没有消费者，但删了没收益，以后想加独立 Review 阶段随时能用。

## 各阶段的完成条件

### Discover

按真实问题选择入口：

| 情况 | Skill |
|---|---|
| 需求已经清楚 | 直接进 Specify |
| 目的地看得见，只是一个会话做不完 | 照常往下走，到 Slice 用 `oxyteam-tickets` 切票 |
| 通往目的地的路本身看不清 | `oxyteam-map` |
| 答案得跑起来才知道 | `oxyteam-prototype` |
| 以上都不是（默认） | `oxyteam-askme-with-docs`；不需要落 ADR 和术语表时用 `oxyteam-askme` |

`askme` 的 SKILL.md 正文只有一行 `Call the Skill tool with "oxyteam-interview"` —— 它就是
`interview`，不是两个入口。`askme-with-docs` 只比它多一个 `domain-modeling`（写根
`CONTEXT.md` 和 `docs/adr/`），这是两者唯一的差别。

`research` 不进这张表：`interview` 自己写了「When a frontier question needs a fact from the
environment, dispatch a sub-agent to find it — don't ask the user」，它会自己去查。只有用户
明确要一份带引用的调研文件时才走 `oxyteam-research`。

`map` 的判据是「大」**且**「路看不清」两个条件（SKILL.md：`too big for one agent session,
and wrapped in fog`），光是量大该走 Slice。它第 2 步 breadth-first 扫完若无 fog 会自己叫停
（`If this surfaces no fog... you don't need a map`），所以拿不准时让它跑，成本两轮对话。
map 的工单本身也调这些 Skill：`interview` / `research` / `prototype` / `task` 四种 label ——
它是 Discover 诸 Skill 的调度器，不跟它们竞争。

完成条件：问题、范围和成功标准清楚；关键术语或 ADR 已按需记录；技术未知项已研究或原型验证。

### Specify

入口 `oxyteam-spec`，写 `<task>/prd.md`。

完成条件：

- `prd.md` 已写入任务目录（不是 `.scratch/`）；
- 验收条件可观察；
- 测试 Seam 已确认；
- **已执行远程同步**：`TASK_JSON_PATH=<task>/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec`
- **用户已确认 Spec**——摘要报给用户、等到认可之后才切挡位进 Implement。

> 同步必须写成阶段完成条件，不能指望 Hook——Trellis 没有「prd.md 被写入」这个事件。
>
> 没有 GitHub 远程的仓库里 `sync-spec` / `sync-tickets` / `create` 会自己打印「跳过」并返回 0，不是报错。这是 v0.4.5 修的：在那之前无 remote → `create` 拿不到 repo → `meta.source_ref` 空 → `sync-spec` 抛 `SyncError` 退出 1，而块正文又要求「报错就停下来」，**纯本地仓库的 Specify 完成条件永远满足不了，流程直接死锁**。判据是 `is_no_remote_error()`（`no git remotes found` / `not a git repository`），权限错、`gh` 没装这些照旧抛错。

### Slice

只有无法在一个 Agent 会话内完成的任务才进入 Slice。单会话任务从 Specify 直接进 Implement，不创建空的 `issues/`。

入口 `oxyteam-tickets`，写 `<task>/issues/NN-*.md`。

完成条件：

- 票是可独立验证的垂直切片；
- Blocking Edges 已声明，`oxyteam_tickets.py` 校验通过（无环、无悬空引用）；
- 用户已确认拆分；
- `oxyteam_tickets.py frontier` 至少返回一张票；
- **已执行远程同步**：`github_sync.py sync-tickets`，票文件回填 `**Issue:**`（无 GitHub 远程时自己跳过，见 Specify 下的说明）

### Implement

```text
oxyteam_tickets.py frontier → 挑一张 → claim → Impl: doing
  ↓
记录 task.json.meta.implementation_base_sha = 当前 HEAD
  ↓
trellis-implement 薄包装器
  → 传入 Active Task、当前票、implementation_base_sha、当前 branch
  → 读 .trellis/spec/ 对应层的编码规范
  → 调完整的 oxyteam-implement
    → oxyteam-tdd → 跑测试 → oxyteam-code-review → commit
  ↓
oxyteam_tickets.py done → Impl: done → 回 frontier 挑下一张（串行）
```

**单会话任务（没有 `issues/`）走同一条闭环**，只是跳过 frontier / claim / done，改为自己记一次
`set-meta <task-dir> implementation_base_sha $(git rev-parse HEAD)`。票只决定怎么分批，不决定要不要
review 和 commit——把「派子代理」写进「有票」分支是 v0.4.6 的实测缺陷，见措辞要求 ⑦。

读取顺序：

1. Active Task；
2. 当前票，或单会话任务的 `prd.md`；
3. `.trellis/spec/` 对应层（编码规范）；
4. 相关 `CONTEXT.md` / `CONTEXT-MAP.md` 与 ADR；
5. `implement.jsonl` 列出的材料；
6. Research 或 Prototype 结果；
7. 真实源码、调用者和数据流。

### Finish

Trellis Runtime 负责：归档 Task、写 Journal、Hook 同步 `gh issue close`。

归档门禁：`flow_stage=finish` **且所有票 `Impl: done`**。

## `[workflow-state:*]` 块

`.trellis/workflow.md` 必须包含五对状态块，加一个无任务态：

```text
[workflow-state:no_task]
[workflow-state:discover]
[workflow-state:specify]
[workflow-state:slice]
[workflow-state:implement]
[workflow-state:finish]
```

**格式要求（Extension 的正则是配对匹配的，缺闭合标签整块读不到）：**

```text
[workflow-state:discover]
块正文
[/workflow-state:discover]
```

Extension 侧的匹配规则：

```text
/\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g
```

状态名只允许字母、数字、下划线和连字符。官方原有的 `planning` / `in_progress` / `completed` / `*-inline` 块在本 Overlay 中被五阶段块替换，不保留两套并行路由。

### 块正文的措辞要求（七条，都是实测出来的）

**① 提到 Team Skill 时写「提示用户运行 `/xxx`」，不写「运行 `xxx`」。**

主干的 `oxyteam-spec` / `oxyteam-tickets` / `oxyteam-implement` / `oxyteam-map` / `oxyteam-askme` / `oxyteam-askme-with-docs` 全部带 `disable-model-invocation: true`。OMP 把它映射成 `hide: true`，再用 `filter((h) => h.hide !== true)` 把它们从**模型可见清单里整个过滤掉**——用户打 `/` 能补全，模型自己调不动。

写成祈使句「运行 `oxyteam-spec`」会怎样：**实测模型绕过 Skill 机制，照着块正文的散文自己动手干。** 产出可能碰巧对（一次实测里 `prd.md` 的章节确实和模板对上了），但跳过了 Skill 内部的接缝检查和用户确认环节，且每次结果不可复现。

```text
✅ 提示用户运行 `/oxyteam-spec`，把权威 Spec 写入当前任务的 prd.md
❌ 运行 `oxyteam-spec`，把权威 Spec 写入当前任务的 prd.md
```

**② 官方块里的条件分支必须保留，不能压缩成祈使句。**

改写官方块时容易把「分情况判断」压成一句话，那会拿掉模型的判断锚点。`no_task` 是最典型的一个，官方原文（`templates/trellis/workflow.md:176-180`）是三句、二选一结构：

```text
No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.
Simple conversation / small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
Complex task: ask the user if you can create a Trellis task and enter the planning phase. If the user says no, explain, clarify scope, or suggest a smaller split.
```

三样东西一个都不能丢：**先分类**（简单对话 / 复杂任务）、**征求同意**、**用户拒绝后的两条出路**（本会话跳过 Trellis ／ 解释、澄清范围、建议拆小）。

实测把它压缩成「先判断本轮是否需要 Trellis Task；写入任务前取得用户同意」之后，模型少了「这轮可能根本不该建任务」这个锚点，**倾向于一律建任务**——用户只想聊两句也会被建出一个任务目录来。

Overlay 版可以换语言、可以改路由目标（`--meta flow_stage=discover`、不回退 `.scratch/`），但**结构分支照搬**。

**③ 一段块正文里不能混「该停的」和「该做的」，混了「该停」会被同化。**

条 ① 只管了措辞（写「提示用户运行 `/xxx`」而不是「运行 `xxx`」），但那句话周围如果全是给模型的祈使句，它照样失效。v0.4.3 实测（Codex 侧，记账 CLI）：`specify` 块四句里三句是模型的操作清单——

```text
阶段 Specify：提示用户运行 `/oxyteam-spec`，...        ← 唯一该停的
完成条件：验收条件可观察、测试 Seam 已确认。            ← 给模型
然后执行远程同步：`github_sync.py sync-spec`。         ← 给模型
一个会话内做得完就 `set-meta flow_stage implement`。   ← 给模型
```

整段读起来像「我这一阶段的操作清单」，第一句就被当成清单的一部分执行掉了：**模型自己编辑了 `prd.md`，从没调 `/oxyteam-spec`**，然后一路 `set-meta implement` → 派子代理写码 → `set-meta finish` → `task.py archive`，中途 `sync-spec` 报错（`meta.source_ref 是空的`）也没停。`finish` 块同理，三句全是祈使句，模型自己读了 `trellis-finish-work` 的 SKILL.md 就把任务归档了。

写法要求四样：

- **停顿写在段首**，不要埋在句子中段；
- 用「用户还没调起它：… / 用户调起了 `/xxx`：…」把两段**显式隔开**；
- **把禁止代做的动作逐个列出来**。只写「提示用户运行」不够，得写「不要自己动手写 `prd.md`」「不要跑 `task.py archive`」——模型跳过的是 Skill 调用，不是产出，光说该调什么拦不住它自己动手产出同样的东西；
- **禁令必须带解除条件，而且解除后要明说「这时候做 X 正是你该做的」。**

第四条是 v0.4.4 实测补的，代价是把流程从「不停」改成了「停死」。v0.4.4 的 specify 块写的是：

```text
这一步你不能代做 —— 不要自己编辑 `prd.md`
```

用户在 Codex 里 `$oxyteam-spec` 调起了 Skill，**正文确实进了上下文**（实测让模型复述，它念得出第一句 `This skill takes the current conversation context...`），但模型仍然拒绝执行，回答「无法实际调度 disable-model-invocation 的 Skill，因此不能代替该步骤编辑规格文件」——**它把「执行用户点名的 Skill 时写 `prd.md`」也归进了「自己编辑 `prd.md`」**。禁令没有出口，流程死在这里。

模型分不清「我凭空写」和「我作为 Skill 的执行者写」，**必须在块里替它分**：写清 Skill 正文进上下文之后它的角色变了，此时产出正是本职，前一句的禁令到此为止。`specify` 和 `slice` 两个块同构（都是「提示用户运行 X，X 往任务目录写文件」），要一起改。

`no_task` / `finish` 没有这个病：它们的解除条件是「用户同意」这种对话事件，模型判断得了，且后文明确写了确认之后该干什么。

产出可能碰巧对（那次的 `prd.md`、`CONTEXT.md`、ADR、7 个测试都合理），但 Skill 内部的接缝检查和用户确认环节整个被跳过，且不可复现。归档尤其要停：不可逆，且「这活算干完了」是用户的验收判断。

**④ 每处 `set-meta flow_stage` 后面都要写「改完挡位这一轮就结束」。**

块是**每轮 `UserPromptSubmit` 按当前 `flow_stage` 注入一次**的，但模型能在一轮里跨越多个阶段——**挡位一改，下一阶段的规则要等下一轮才注入，这一轮它读不到。**

v0.4.5 实测：Implement 干完后模型跑了

```bash
set-meta flow_stage finish && oxyteam_tickets.py summary && task.py archive
```

三条串在一个 `&&` 链里一次跑完。Finish 块里那句写死的「不要跑 `task.py archive`」**完全没起作用——它那一轮读到的是 Implement 块**，而 Implement 块的收尾正是「做完 `set-meta flow_stage finish`」。

所以这类失效**不是措辞问题，加硬禁令也拦不住**：文字得出现在模型当轮能读到的块里。修法是把「改挡位」本身变成收轮点，四处 `set-meta flow_stage`（discover→specify、specify→implement、slice→implement、implement→finish）统一加上，并在风险最高的 implement 块把下一步的禁止动作直接点名（`task.py archive`）。

同理，凡是「本阶段的最后一个动作」都要留意：模型倾向一口气做完，阶段边界必须显式写成停顿，否则它只是一个变量赋值。

**⑤ Spec 落地后必须停下来让用户确认，再切挡位。**

Spec 对不对是用户的判断。v0.4.5 之前 specify 块的收尾是「一个会话内做得完就 `set-meta flow_stage implement`」，模型写完 `prd.md` 直接就进实现了，用户没有插话的机会。加一步：把 Spec 摘要报给用户 → 等确认 → 才切挡位。

（不走「用户手动调 `/oxyteam-implement`」那条路：`oxyteam-implement` 由 `trellis-implement` 子代理调用，用户直接调会绕过它的上下文装配——当前票、`.trellis/spec/` 对应层、`implementation_base_sha`。）

**⑥ 「问用户一句」必须写成「问完停下来等回答」，否则模型会先做完再补问。**

v0.4.6 实测（Claude Code，同一句需求跑两次都复现）：`no_task` 块的「简单对话 / 小改动：只问一句本轮要不要建 Trellis 任务」被逐字执行了——模型**先把功能实现完**（约 60 行、3 个文件、17 条测试），然后在末尾补一句「另外没建 Trellis 任务——这轮改动小，要走 Trellis 流程的话说一声」。

它没违反任何一条规则：没建任务，也问了。块从头到尾只约束了「建任务**之前**要同意」，**没有一个字说过「动代码之前要先问」**。同一份块正文，Codex 和 OMP 把需求判成「复杂任务」走了第三行，那行的「征得同意后建任务」天然要求先停，所以它们表现正常——**分支判断的差异会把措辞漏洞放大成完全不同的行为**。

写法：把停顿绑在「问」这个动作上（「问完停下来等用户回答」），而不是绑在「建任务」上；同时按条 ③ 给禁令配解除条件（「用户说不用就直接干活，上一句的禁令到此为止」），否则用户拒绝 Trellis 之后模型会不敢动代码。

**⑦ 块必须自足：该阶段的必需动作只有写在块里才会发生，共同步骤不能塞进条件分支下面。**

每轮注入的**只有块**，块外的散文正文模型根本读不到。两个实测：

- `task.py start` 只写在 `#### 1.4 Activate` 的正文里，不在任何块里。结果三个任务连续三次全部漏跑，`status` 一路停在 `planning`（`flow_stage` 照常推进，因为注入脚本用 `meta.flow_stage` 覆盖了 `status`，所以症状被完全掩盖）。修法是把这条命令并进 `no_task` 块的 `create` 后面——`cmd_start` 是幂等的（`if status == "planning"` 才翻转），重复执行无害。
- 「派 `trellis-implement` 子代理」原先写在 `implement` 块的**「有票」分支下面**，而「不跑 frontier / claim / done」写在「没有 `issues/`」分支里。票管理和实现闭环是两件不相干的事，被并进了同一个分支。结果三平台的单会话任务**全部没走 `oxyteam-tdd` 和 `oxyteam-code-review`**，模型自己写代码自己写测试，代码也没 commit。子代理自己是支持单会话任务的（`trellis-implement.md` 读取顺序第 2 条专门写了「单会话任务读 `<task>/prd.md`」），漏的只是主会话这一侧的派发指令。

修法是把共同步骤提到分支之外先说，分支只留真正不同的部分。这个缺陷有安全网兜住（`trellis-finish-work` 的门禁拦住未提交代码，三平台一致），所以没造成实际损失，但每次都要多绕一轮 `/oxyteam-implement`——而且 OMP 那轮的 `oxyteam-code-review` 当场抓出一个真 bug（`--output ""` 被误判成未传参），说明前两轮跳过 review 的任务里很可能留着同类问题。

单会话任务派子代理还要补一步基线：`implementation_base_sha` 平时由 `claim` 写，没票时没人写，`oxyteam-code-review` 会没有 diff 起点（实测它会停下来问用户要基线，不会崩，但多一轮交互）。

### 平台 agent 文件：说明注释不能压在 frontmatter 前面（v0.4.7 实测）

Overlay 版 `trellis-implement` 在文件开头加了一段 `<!-- ... -->` 说明注释，把 frontmatter 推到了第二块。Claude Code 要求 agent 文件**第一行就是 `---`**，结果整个 `.claude/agents/` 目录一个都没注册——实测报 `Agent type 'trellis-implement' not found`，可用列表里只剩用户全局的 agent。主会话只好退用 `general-purpose` 顶替，`oxyteam-implement` 闭环走不全。

官方原版（`@mindfoldhq/trellis/dist/templates/{claude,omp}/agents/trellis-implement.md`）首行就是 `---`。修法：注释挪到 frontmatter 之后。Codex 版是 TOML，`#` 注释首行合法，不受影响。

这个洞是修完 ⑦ 之后才暴露的——在那之前三平台压根没派过子代理，文件能不能加载根本走不到。**一个缺陷挡住另一个缺陷的验证，是这类适配层的常态：每修好一层，都要重跑一遍全流程。**

### Codex 侧实测到的三件事（v0.4.4 轮）

1. **`$skill-name` 会把 SKILL.md 正文注入上下文**，机制正常。Codex 的显式调用就是 `$` 前缀，或打 `$` 触发选择器后选。
2. `disable-model-invocation: true` 被 skills CLI 转译成 skill 目录下 `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false`（不带这个字段的 skill 只有 `interface` 段）。它**只挡隐式调用（模型按 description 自动匹配），不挡用户的显式 `$`** ——语义与 Claude Code 一致，不是跨平台差异。
3. **Codex 侧 `<workflow-state>` 注入正常**，块正文一字不差地进 `UserPromptSubmit` 的 `additionalContext`（`inject-workflow-state.py` 用的是追加，不替换 prompt）。

Claude Code 和 Codex 侧解析这些块的是 `inject-workflow-state.py`（正则等价），不是 Extension。**Codex 有个额外分支**：`resolve_breadcrumb_key()` 在 `dispatch_mode: inline` 时查的是 `<status>-inline` 标签。本 Overlay 只写 5 个普通块，所以 **Codex 必须留在默认的 `auto`**——预检硬拦 `inline`（见 `changeset.md`「Codex 的两个前置」）。查不到标签不报错，只会静默降级成 "Refer to workflow.md for current step."，路由失效且无提示。

## `.trellis/workflow.md` 转换要求

1. 官方 Plan / Execute / Finish 三阶段换成团队五阶段；
2. Skill Routing 换成实际存在的 `oxyteam-*` 名称；
3. 六个状态块按上面的配对格式写；
4. Continue 路由不再根据 `prd.md` / `design.md` / `implement.md` 是否存在作判断，改为按 `meta.flow_stage` + frontier；
5. 不调用未安装的 `workflow-guide`；
6. 不调用原始上游 Skill 名称，也不调用已删除的 `trellis-brainstorm` / `trellis-before-dev` / `trellis-check` / `trellis-break-loop`；
7. 保留 Trellis 的平台标记语法；`workflow.md` 是共享层，一份供 OMP / Claude Code / Codex 三个平台读，不为某个平台单写分支；
8. 不修改 `.trellis/.template-hashes.json`。

## 硬限制与软限制

### 硬的（代码直接拒绝）

```text
claim 只能认领 frontier 里的票
Blocker 引用不存在 / 形成环 → oxyteam_tickets.py 校验失败
归档门禁：flow_stage=finish 且所有票 Impl: done
Context Manifest 路径不能逃出仓库或可信目录（官方能力）
Manifest 每行必须是合法 JSON（官方能力）
```

### 软的（靠 Prompt 和 Skill）

```text
Agent 有没有挑到最合适的 Discover Skill
Spec 内容是不是真的清楚
票是不是真的高质量垂直切片
Review 查得够不够深
Installer 有没有完全正确地应用所有修改
```

### 能不能保证百分之百只走这条路

不能：

```text
人可以手动创建 design.md
Agent 可以直接编辑 task.json 或票文件
Agent 可以不通过 oxyteam_tickets.py 操作
外部编辑器不经过 OMP Hook
没有原子排他 Claim
```

现实能做到的：正式入口默认走这条路，加上非法阶段跳转被拒绝、归档门禁拦住不合格任务、绕过流程产生的异常可以被检测出来。要绝对不可绕过就得取消 Agent 的任意写入权限，那是权限沙箱设计，不在本 Overlay 范围内。
