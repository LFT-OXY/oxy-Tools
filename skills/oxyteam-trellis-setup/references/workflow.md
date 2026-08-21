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
Implement → 提示用户敲 /oxyteam-implement（主会话内跑完整闭环）
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
主会话读齐上下文，请用户敲 /oxyteam-implement
  → oxyteam-tdd → 跑测试 → oxyteam-code-review（两个并行子代理）→ commit
  ↓
oxyteam_tickets.py done → Impl: done → 回 frontier 挑下一张（串行）
```

**单会话任务（没有 `issues/`）走同一条闭环**，只是跳过 frontier / claim / done，改为自己记一次
`set-meta <task-dir> implementation_base_sha $(git rev-parse HEAD)`。票只决定怎么分批，不决定要不要
review 和 commit——把这件事写进「有票」分支是 v0.4.6 的实测缺陷，见措辞要求 ⑦。

**每张票各敲一次 `/oxyteam-implement`。** `oxyteam-implement` 带 `disable-model-invocation: true`，
模型调不动，只能由用户显式触发；主会话不许用 Read 把它的 SKILL.md 当文档照做绕过去。代价是 N 张票
N 次交互，换来的是 `oxyteam-code-review` 的两轴一定是一级子代理，见下面一节。

读取顺序（**主会话自己读**，在请用户敲之前，好把依据交代清楚）：

1. Active Task；
2. 当前票，或单会话任务的 `prd.md`；
3. `.trellis/spec/` 对应层（编码规范）；
4. 相关 `CONTEXT.md` / `CONTEXT-MAP.md` 与 ADR；
5. Research 或 Prototype 结果；
6. 真实源码、调用者和数据流。

`implement.jsonl` 不在这个清单里：它是**专门给子代理传当前票**的通路，主会话自己知道当前票。
`claim` 仍然会往里写（脚本行为，无害），官方 `inject-subagent-context.py` 也仍然读它——
哪天要派子代理，这条通路还在。

**已知的恒定假发现（v0.4.9 实测，不修）**：`implement.jsonl` / `check.jsonl` 由官方
`task.py create` 生成，占位行自带一句 `Delete this line once real entries are added`。
单会话任务永远没有 real entries，占位行就永远删不掉，于是 `oxyteam-code-review` 的
Spec 轴每一轮都把它当成「未按其自述清理」的验收缺口报一次。**这条要人工驳回**：修它
得改官方 `task.py create` 或 `oxyteam-code-review`，两个都不在 Overlay 的改动面里，
为一条噪音去动它们不划算。

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

### 块正文的措辞要求（十一条，都是实测出来的）

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

v0.4.9 实测补一条反向的：**收轮点写成了停顿，模型却把它读成了选择题。** implement 块结尾原文是「等它 commit 落地后再 `set-meta flow_stage finish`」，模型 commit 之后停下来问用户「下一步敲 `/trellis:finish-work` 归档，还是我先切 `flow_stage=finish`？」——还把会被门禁拦下的那个选项摆在了前面。它确实停了（条 ④ 的目标达成），但停错了地方：**该自己做的动作被拿去问用户，而下一轮该问用户的事被提前预告了。**

「等……再……」这种时序连接词在模型眼里是软的，它读出了「时机」却没读出「必做」。改成「commit 一落地，你就自己跑 `set-meta flow_stage finish` —— 这是个动作不是选择题，别反过来问用户」。**判据：块里每个动词都要能回答「这件事该谁做」**，凡是主会话自己做的就写「你自己跑」，凡是要用户拍板的就写「停下来问」，两者之间没有第三档。

**⑤ Spec 落地后必须停下来让用户确认，再切挡位。**

Spec 对不对是用户的判断。v0.4.5 之前 specify 块的收尾是「一个会话内做得完就 `set-meta flow_stage implement`」，模型写完 `prd.md` 直接就进实现了，用户没有插话的机会。加一步：把 Spec 摘要报给用户 → 等确认 → 才切挡位。

（v0.4.9 起「用户手动敲 `/oxyteam-implement`」**就是**正规路径。这里原先写的是反话——理由是「子代理会装配上下文，用户直接调会绕过」，但那套装配主会话自己做同样能做，而多出来的一层引入了五个洞，见「为什么不派 `trellis-implement` 子代理」。）

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

**⑧ 派发提示词是夹心的中间层，被官方尾巴反向禁止的动作必须在块里显式压制。**

`inject-subagent-context.py` 的 `build_implement_prompt()` 把主会话写的内容夹在中间，官方的 `## Workflow` 和 `## Important Constraints` 追加在**后面**，其中一条是 `Do NOT execute git commit, only code modifications`——而 Overlay 的整个 Implement 设计以 commit 收尾。

Overlay 早就意识到这个冲突：三份 agent 模板的注释 ③ 白纸黑字写着「删掉 Forbidden 里的 `git commit`——保留这条会产生两份直接冲突的指令」。**但删的只是 agent 定义文件里那份。** hook 注入的那份没删，也不打算删（`inject-subagent-context.py` 1174 行，Overlay 明确决定一个字不改）。实测那轮子代理照样 commit 了，选对了——但夹心结构里后来的指令位置更靠后，选对是运气，不是设计。

**「决定不改某个官方文件」的论证要按维度逐条检查覆盖面。** 「不改 `inject-subagent-context.py`」当初的论证只回答了「子代理怎么拿到当前票」（答案：走 `implement.jsonl`，确实不用改），却顺带把「它给每次派发追加什么约束」这一维一起豁免了。前一维成立不蕴含后一维成立，中间没人重新论证过。

修法是块里加一句显式压制，把冲突挑明交给子代理，而不是赌它怎么排序两份指令。

（v0.4.9 起 Implement 阶段不派子代理，这个具体冲突当场消失——但**这条要求本身仍然成立**：只要还有任何一处派子代理，派发提示词就还是夹心的中间层。后半段那个「按维度检查覆盖面」的教训与派不派子代理无关。）

**⑨ 让模型判断的地方，必须一并要求它把判据摊出来 —— 报告口径要和判据口径逐字对齐。**

v0.4.10 实测在 Finish 阶段一次撞出两个同源问题：

**一是报的东西不是判的东西。** `finish` 块让模型「报工作区干不干净」，可下一句的判据是「`.trellis/tasks/` **以外**还有未提交改动就先别归档」。模型照字面把 `git status` 的原始输出摊给用户——三个 `M`，全在 `.trellis/tasks/` 下，全都不算数。用户看见「脏」就打断了归档流程反问「是不是要先 commit」。判据本身写得完全正确，坏在**要求模型报的是原始事实，而做决定要用的是过滤后的事实**，中间那步过滤没人做，就落到用户头上了。

**二是放行时不留痕。** `finish-work` 的 Step 0 路由表里，只有「拦住」那条要求把 `summary` 原样报出来，两条放行分支都不要求。于是模型的汇报里只有「Step 1–2 通过」，Step 0 一个字没有——门禁到底查没查过票，用户看不出来，回头验收的人也验不出来。这一轮票确实都 `done` 了，但那是 Implement 阶段自己标的，**跟门禁读没读它是两回事**。归档门禁的第二个条件「所有票 `Impl: done`」因此连续八轮没被观测到：前七轮走 `票 0 张` 空真放行，第八轮执行了却不可见。

两条的根子是同一个：**要求模型做判断，却没要求它把判据摊开。** 判据不出现在输出里，对用户是黑箱（洞 O），对验收是不可证（洞 P）。

```text
✅ 报 `.trellis/tasks/` 以外干不干净；tasks 里的脏文件明说一句「不算数」
❌ 报工作区干不干净                    ← 报的是原始事实，判据却是过滤后的
✅ 不论放行还是拦住，都先把 summary 那一行原样报出来
❌ 只在拦住时才报 summary              ← 放行路径静默，门禁形同没跑
```

判据：**块里每处「你判断一下」，都要跟一句「判完把依据说出来」。** 只在异常分支要求留痕不够——正常分支才是绝大多数轮次走的那条，它静默了，这个检查就等于不存在。

**同一个病还有第三种形态：判据在信道上丢了（v0.4.18 实测，team-test02 的 M-2 轮）。** 上面两种是 v0.4.10 撞出来的——「报的东西不是判的东西」和「放行时不留痕」，坏在**该摊的判据没摊**，文字里补一句就修好了。第三种出在子代理审查：`/oxyteam-implement` 起了 Spec 轴和 Standards 轴两个后台子代理，主会话要判的是「review 过了没有」，判据就是两轴各自报了什么——而那份判据**根本没到达主会话**。子代理的最终文本不会自动回主会话，要显式 `SendMessage({to: "main"})` 才回得来，第一轮两轴都没回。从主会话看，「审查没发现问题」「报告没送到」「子代理没起来」三种情况的观测结果一模一样。补送回来的报告里躺着一个真 bug（前端把非法参数吞成空串、静默显示当前周），按「没消息就是好消息」放行的话，它会带着两轴全绿的记录进归档。

关键区别在这里：前两种加个检查点就治了，**这一种加检查点治不了**——检查点本身也在信道的这一头，它只能看见「我没收到东西」，看不见「对面发没发」。唯一的修法是让「没有产出」和「产出是空的」**长得不一样**：要求两轴哪怕没查出问题也必须回一句话（「查完了，没发现问题」），于是缺那句话就是一个可观测的失败信号，沉默一律按没跑处理。凡是块里让模型依赖别处送来的东西做判断，都要照这个办——**别把「静默」和「通过」编码成同一个观测值。**

**第四种形态：动词太弱，检查做完不落在任何产出上（v0.4.19 实测，team-test02 的复测轮）。** 前三种坏在判据没摊开或没送到，这一种坏在**压根没要求产出**。v0.4.18 治洞 AA 的措辞写的是「归档前**先看一眼** `.trellis/.runtime/sessions/` 有几个会话文件」——复测那一轮，模型报了「除当前任务外没有别的活跃任务」（那是查 `.trellis/tasks/`，对应同一段的另一句），`sessions/` 的计数一个字没提。归档会清掉会话文件，事后也查不出它数没数。

对照同一次 commit 里治洞 Z 的那句就知道差在哪：那句写的是「两轴各自报了什么，**你必须原样说出来**」，动词落在「说出来」上，做没做当场可见；这句写的是「看一眼」「数一下」，**动词只描述动作，不产生任何可观测的东西**。同一份改动里一句学会了、一句没学会——因为「让模型做检查」和「让检查结果可观察」看起来是一件事，实际是必须分开写的两件。

```text
✅ 先数一下 `sessions/` 有几个会话文件，把数出来的数字说出来，哪怕只是「只有我这一个会话」
❌ 归档前先看一眼 `sessions/` 有几个会话文件      ← 动词落在动作上，做没做长得一样
```

判据：**块里每处祈使句，问一句「照做了和没照做，输出上差在哪」——答不上来就是写错了。**「看一眼」「检查一下」「注意」「留意」「确认」这类动词全部可疑，它们要么改写成「把 X 说出来」，要么就该删掉，因为反正也验不了。

改完的效果在 v0.4.20 轮复测到了：同一个位置，模型报出「会话文件数出来是 2 个，不是我一个。另一个（f9c63fa8）正开着 08-21-occupancy-monthly-view，last_seen_at 是 07:34」——上一轮它在这里一个字没说。**只改了动词，没加任何新规则。**

**⑩ 并行会话下，本轮读到的跨会话状态全是过期的。**

v0.4.18 实测（team-test02 的 P-1 轮）：同一个目录开两个会话，各建一个任务、各改一个文件。**隔离的那部分是真的** —— `.trellis/.runtime/sessions/` 下两个会话文件各指各的 Active Task，同一个工作目录、不需要 git worktree，两边的 `flow_stage` 互不干扰。问题全出在没隔离的那四样：**git 工作区、Journal、`index.md`、git 历史，全是全局共享的**。

Journal 这一样名义上有两层保护，**两层对同目录并行都不生效**：`.gitattributes` 的 `merge=union` 只在 git merge 的时候起作用，而同目录共享的是同一个工作区，两个会话的写入根本不经过 merge；`add_session.py` 的 `warn_if_parallel_worktree()` 第一行就是 `if not is_git_worktree(): return`，同目录不是 worktree，函数直接返回。`add_session.py` 是整篇重写 Journal 的，两个会话同时走到归档，后写的会盖掉先写的。

实测一轮里读到过期状态四次，长出来的具体口子是这个：窗口 A 在归档门禁那步发现 `.trellis/tasks/` 下还有另一个 `in_progress` 任务，于是主动提议「一起归档吗」，并准备把两个 commit 都填进 `--commit`——**而那个任务当时已经自己归档完了**，真点下去同一个 commit 会记进两条 Session。这个提议在单会话下完全合理（那确实是自己遗留的任务），在并行下永远是错的，**而模型分辨不出自己在哪种场景里**：它手上只有本轮开头读到的那份 `task.json` 快照，快照不带「有没有别人正在改它」这个维度。同一个共享面还咬了门禁一口——归档门禁的判据是「`.trellis/tasks/` 以外干不干净」，对方尚未提交的业务代码正好落在那个范围里，于是两个会话互相拦路，谁都过不去。

`workflow.md` 2.1 已经写了并行的第一条边界（「票默认串行，并行的单位是任务不是票」），**缺的是第二条**：并行的两个会话不能在同一时刻走归档，且归档前必须**重新读一次**对方的 `task.json`，与本轮开头读到的不一致就以新的为准。写进块正文的形式是：归档前数一下 `.trellis/.runtime/sessions/` 有几个会话文件、**把数字说出来**（v0.4.19 补，原措辞只写「看一眼」，复测发现数没数不可观测，见 ⑨ 的第四种形态），多于一个就跟用户说一句、错开再走；别提议顺手归档别的 `in_progress` 任务；`.trellis/tasks/` 以外的脏改动别默认算成自己的遗留。

诚实标注一句：**Journal 被覆盖这件事只是理论推演，两轮实测都没撞上** —— v0.4.18 那轮两个会话恰好错开了（其中一个在写 Journal 之前停下来问了用户一句）；v0.4.20 轮两个任务都停在 `finish` 挡位、场景终于凑齐，结果是**修法自己把撞车挡掉了** —— 模型数出 2 个会话后停下来问「另一个会话你自己心里有数吗」，用户顺次归档，Journal 的 Session 11、12 都完好。这是好事，但也意味着**覆盖这条大概再也撞不上了**：要观测它得先把这段措辞拿掉。在那之前，覆盖按「机制上成立、未观测到、且已被上游挡住」记。

**⑪ 每条禁令要有出口，每道关卡要有入口 —— 这是同一个病的两面。**

v0.4.17 实测（team-test02 的 S-0 / S-1 / S-2 三轮），两个方向各撞一次：

**没有出口的禁令，会被违反。** 项目里挂着一个装 Overlay 时留下的验证任务，于是每轮注入的是 `discover` 块，而它第一句是「不要开始写实现代码」。用户这一轮要的却是「新建一个 `deskbook.py`」——跟那个陈旧任务八竿子打不着。模型无视禁令直接写了 47 行。**这是对的选择**：它当时只有两条路，要么拒绝干用户明确要求的活，要么无视注入的禁令。对比 `no_task` 块就知道差在哪——那个块预见到「本轮可能根本不需要走流程」，写了「用户说不用就直接干活，上一句的禁令到此为止」；`discover` / `specify` / `slice` 三个块都没有等价的出路（后两个有半条，只覆盖「用户调起了对应 skill」这一种情况）。**代价不是这一次违规，是禁令的权威性整体贬值**——一个学会了「这些块有时候可以不听」的会话，在真该听的时候也会掂量一下。

**没有入口的关卡，会被绕过。** 同一批实测里，模型两次建完任务直接把 `flow_stage` 设成 `specify`。第一次给的理由是「需求上一轮已经聊清楚了」，**而同一段汇报的下一句就自己拆了台**：「上一轮那个待定项还挂着：『谁订的』的人名怎么来……」。一段话里既说聊清楚了、又说有待定项，两句不可能同时为真。真实情况是它问过两个问题、用户只回了其中一个——**它把「我问过了」当成了「聊清楚了」**。被用户纠正后补跑 interview，一轮问出 6 个问题，其中「能不能取消」直接决定了下一条任务还有没有活干。第二次更糟：零说明跳到 `specify`，还主动加了一句「**或者直接说『跳过 spec 开写』**」——关卡自己在劝用户绕过去。而它当时手上的方案（先 UPDATE、无则 INSERT）跟九行之外它自己写的注释直接冲突（那条注释写着「不做先查再插——那是竞态」），是 Spec 那一格把方案纠了回来。

两个方向的根子是同一个：**`flow_stage` 是自由写入的，没有任何一处检查「你凭什么认为上一格完了」；而块正文的禁令是无条件为真的，没有任何一处说明「什么时候它不适用」。五挡位于是既是个建议、又是个绊脚石。**

```text
✅ 本轮的活跟当前 Active Task 无关时本块不适用，判据是「写不写得进这个任务的 prd.md」
❌ 阶段 Discover：不要开始写实现代码        ← 无条件为真，遇到管不着的回合只能被违反

✅ 切挡位前把「你提过而用户没回答的问题」一条条列出来，一条都没有才算问清楚
❌ 问清楚了就 set-meta flow_stage specify   ← 「问清楚了」由谁判、凭什么判，没写
```

判据两条：**每写一条禁令，问一句「它什么时候不该生效，那时候出路是什么」；每写一道关卡，问一句「凭什么算过了，这个凭据看得见吗」。** 出口和入口都要落在可观测的产出上（见 ⑨ 的第四种形态）——「无关时可以跳过」和「问清楚了再走」都是不可观测的动词，必须改写成「说明一句 `<具体判据>` 然后照常干」和「把没答复的问题列出来」。

还有一条附带的：**模型不该有权提议绕过任何一格。** 用户主动要跳是用户的决定，模型主动递台阶是在拆自己的门。v0.4.21 把这句写进了 `specify` 和 `slice` 两个块。

**两条都在 v0.4.21 同版复测通过。** 出口那条：挂着 `flow_stage=discover` 的任务，用户紧接着要一件无关的活（写 `.editorconfig`），模型的第一句话是「这一轮跟 `my-bookings-page` 无关，不走它的阶段约束」，然后照常写文件 —— 对照 S-0 的原始现场，同样的处境同样的活，那次是一声不吭直接写了 47 行。**行为都是「写了文件」，性质从「禁令失效」变成「禁令按设计让路」。**

入口那条的复测比原始现场更严格 —— S-1 是模型自己决定跳挡位，复测时是**用户明确要求**「就按你说的第一条来，建任务吧，直接进 specify」。模型明说「**进 specify 的准入没过**」，把 4 条自己提过而用户没回答的问题一条条列出来，「所以我不往下走」，并给了两条出路（一次答完 / 明说这几条不用管由它拍板）。复测后 `task.json` 的 `flow_stage` 仍是 `discover`。它还额外摊开了一个隐含默认：「第 6 条你没单独说，但我按『按你说的』默认算认了，不对的话说一声」——**准入条件写成「把没答复的问题列出来」之后，连『我替你默认了什么』也跟着浮出来了**，这一层不在措辞要求里，是列清单这个动作自带的。

### 平台 agent 文件：说明注释不能压在 frontmatter 前面（v0.4.7 实测）

Overlay 版 `trellis-implement` 在文件开头加了一段 `<!-- ... -->` 说明注释，把 frontmatter 推到了第二块。Claude Code 要求 agent 文件**第一行就是 `---`**，结果整个 `.claude/agents/` 目录一个都没注册——实测报 `Agent type 'trellis-implement' not found`，可用列表里只剩用户全局的 agent。主会话只好退用 `general-purpose` 顶替，`oxyteam-implement` 闭环走不全。

官方原版（`@mindfoldhq/trellis/dist/templates/{claude,omp}/agents/trellis-implement.md`）首行就是 `---`。修法：注释挪到 frontmatter 之后。Codex 版是 TOML，`#` 注释首行合法，不受影响。

这个洞是修完 ⑦ 之后才暴露的——在那之前三平台压根没派过子代理，文件能不能加载根本走不到。**一个缺陷挡住另一个缺陷的验证，是这类适配层的常态：每修好一层，都要重跑一遍全流程。**

### `tools` 白名单要覆盖子代理**间接**用到的工具（v0.4.9 实测）

修完 v0.4.8 的 frontmatter 问题，`trellis-implement` 第一次真正派起来了，闭环也走完了——但汇报里有一行：

> Code Review（**本 agent 上下文没有 Task 工具**，两轴由我对冻结 patch 分别自审，非并行子代理）

`oxyteam-code-review/SKILL.md:11` 写的是「Both axes run as **parallel sub-agents** so they don't pollute each other's context」，`:80` 是「Spawn both sub-agents in parallel」。而三平台的 agent 模板 `tools` 全是官方那一套 `Read, Write, Edit, Bash, Glob, Grep`——官方三个 agent 一个都不带 `Task`，因为官方流程里子代理确实不需要再派子代理。Overlay 把 `oxyteam-implement` 塞进子代理之后，这个前提就不成立了，但 `tools` 没跟着改。

**自审恰好毁掉那句 "don't pollute each other's context"。** 子代理刚写完这份代码，上下文里全是它自己的实现决策，再拿同一份 patch 审两轴，报「0 处硬违规 / 10 条全覆盖」是结构使然，不是质量证明。对照组是 OMP 那轮——主会话直接跑 `/oxyteam-implement`，主会话有 Task，两轴是真并行子代理，当场抓出 `--output ""` 那个真 bug。

Overlay 自己的 agent 模板第 78 行早就写明了预期（「`oxyteam-code-review` 自己会 spawn 两个干净上下文的子代理，你不需要再安排」）——**文档说对了，工具给错了**。而且同一份文件的递归护栏还有一条「需要更多并行工作……不要自己派」，本意是防 `trellis-implement` 自我递归，措辞却写成了全面禁止，把这两个审查子代理一并禁掉。

直接修法是给 `tools` 补上派发工具：Claude 版补 `Task`，OMP 版补 `task`（小写，据 `omp.sh/docs/subagents` 的「`task` spawns one or more subagents in parallel」和 `omp.sh/docs/subagent-authoring` 的字段表——后者还有一条：`spawns` 默认 none，但 `tools` 含 `task` 时默认变成 `*`，所以不用另写 `spawns`；另外 OMP frontmatter 里本来就有的 `model: pi/task` 是**模型名**，和 `task` **工具**同名但毫无关系，别当成重复删掉一个）。递归护栏三平台一起收窄成只禁再派 `trellis-implement` 自己。

这些改动都留在模板里了。但它们只是把嵌套变成可能——**真正的决定是不再走这条路**，理由见下一节。

### 为什么不派 `trellis-implement` 子代理（v0.4.9 决策）

`oxyteam-implement` 是 **skill 不是 agent**，12 行文字，加载进谁的上下文就在谁那里跑，它自己不派任何子代理。派子代理的是它末尾调的 `oxyteam-code-review`。所以那两轴落在第几层，只取决于谁是链条起点：

```text
用户敲 /oxyteam-implement          主会话派 trellis-implement
主会话                              主会话
 └─ code-review 两轴（一级）         └─ trellis-implement（一级）
                                         └─ code-review 两轴（二级，要平台支持嵌套）
```

右边那条路多出来的一层，实测账单是**五个洞，全部由它引入**：

| 洞 | 只在派子代理这条路上存在 |
|---|---|
| D 派发指令写错分支，三平台全跳过 tdd 和 review | ✅ |
| G agent 文件 frontmatter 被注释推到第二块，整个目录不注册 | ✅ |
| H `tools` 缺派发工具，review 静默退化成自审 | ✅ |
| I hook 尾部 `Do NOT execute git commit` 与派发提示词冲突 | ✅ |
| J 子代理猜 `~/.claude/skills/` 扑空，花四轮才找到 SKILL.md | ✅ |

同期修的 B / E / F / K 四个洞与这一层无关。而左边那条路——OMP 那轮用户手动敲 `/oxyteam-implement`——一个洞没出，两轴是真并行子代理，当场抓出 `--output ""` 那个真 bug。

**洞 H 尤其说明问题：这一层损坏的正是它想保护的东西。** 它的全部收益是「主会话上下文干净」（实测一次实现烧 49.5k token / 33 个工具调用，确实全留在了子代理里），代价却是把 code-review 的独立性压没了——而独立 review 恰恰是这套方法论里最贵的一环。

所以 Implement 阶段改成：主会话读齐上下文，**请用户敲 `/oxyteam-implement`**，这一轮结束。`oxyteam-implement` 带 `disable-model-invocation: true`，模型本来就调不动它，用户显式触发是它设计上的正规路径；子代理此前那套「Read SKILL.md 当文档照做」是绕过去的野路子，也正是洞 J 的来源。

代价两条，都接受：

- 实现细节进主会话上下文；
- 有票任务每张票各敲一次 `/oxyteam-implement`，N 张票 N 次交互。有票路径至今没实测过（`SKILL.md` 验证第 7 条一直空着），没数据之前不为它加复杂度。

三份 `trellis-implement` 模板**保留不删**：它们是官方文件的整篇替换版，删掉 `trellis update` 会把官方版装回来，那版还带着 `No git commit allowed`，比留着更糟。`inject-subagent-context.py` 的 implement 分支随之空转，本来也不归 Overlay 管。哪天单票大到主会话撑不住，这条路整套都还在。

**通用的一条：多加一层隔离，就多一层每个平台都要各自验一遍的接口。** 这五个洞没有一个是逻辑错误，全是「层与层之间的约定在某个平台上不成立」——frontmatter 格式、工具白名单、提示词拼接顺序、skill 安装路径。隔离的收益是线性的（省一点上下文），跨平台接口的成本是乘性的（平台数 × 接口数）。

一条通用的：**当你把一个「会自己派子代理」的 skill 塞进子代理时，`tools` 白名单必须覆盖它间接需要的工具。** 缺了不会报错，只会静默降级成一个看起来跑完了的假闭环。

### 阶段流程只能有一个出处：`continue` 不复述（v0.4.12 决策）

三份 `continue` 模板曾经把每个 `flow_stage` 该做什么完整复述了一遍。v0.4.11 发现它整体停在
v0.4.4 时代，**六处与现行流程正面冲突**：

| `continue` 里的写法 | 与之冲突的版本 |
|---|---|
| `claim` 后派 `trellis-implement` 子代理 | v0.4.9 改成提示用户敲 `/oxyteam-implement` |
| 整段「派发提示词第一行必须是 `Active task:`」 | v0.4.9 起不派了，整段作废 |
| `票 0 张` → 主会话「直接读 `prd.md` 实施」 | v0.4.9 单会话任务同样要用户敲 |
| 票全 `done` → 「提示用户确认后」切 `finish` | v0.4.10 洞 N：自己跑，不问用户 |
| `finish` 行「工作区干净后」 | v0.4.11 洞 O：判据是 `.trellis/tasks/` **以外**干净 |
| `discover` 把 `askme` / `interview` / `askme-with-docs` 并列，`research` 进表 | 本文 Discover 节：`askme` 就是 `interview`，`research` 不进表 |

**根因不是手滑，是结构。** 同一套流程写在两个文件里，改 `workflow.md` 的人没有任何机制会被
提醒回来改 `continue`。八轮实测一次都没炸，只是因为没人敲过 `/trellis:continue` —— 它不像
阶段块那样每轮自动注入，得用户主动敲才加载。**没被触发不等于没坏**，这类缺陷会一直攒到
第一个真敲它的人头上，而那时它已经错了三个版本。

修法是删复述：`Step 3` 的表只做 `flow_stage` → 阶段编号的映射，具体做什么一律指向
`.trellis/workflow.md` 的块正文。删得掉的前提是细节本来就不缺 —— `Step 4` 的
`get_context.py --mode phase --step <X.X>` 是**实时从 `workflow.md` 读**的，v0.4.12 实跑
`--step 2.1` 打印出来的正是含「不派 `trellis-implement` 子代理」的最新正文。复述从第一天
起就是纯冗余，只不过它冗余的时候是对的，所以没人看得出来。

`continue` 保留的唯一流程性内容是跨会话恢复独有的那一条：**上个会话 `claim` 了一张票没做完，
接着推那张，不要回 `frontier` 挑新的**。`implement` 块是从 `frontier` 起步的，覆盖不到这个
入口状态。（`oxyteam_tickets.py` 本身拦得住误操作——重复 `claim` 同一张是空操作，`claim`
另一张直接报错——所以这条是省一次报错，不是防数据损坏，措辞别写过头。）

**一般化的判据：往 `.trellis/workflow.md` 以外的任何文件里写阶段流程之前，先问一句「改
`workflow.md` 的人会被提醒回来改这里吗」。** 答案是否，就别写，改成指过去。这条对
`contract-cheatsheet.md`、平台 agent 文件、以及将来任何新增的入口文件同样成立。

修完 `continue` 顺手拿这条判据反查了一遍全部模板，`trellis-start/SKILL.md`（Codex 的新会话
入口）也有同一张表，同样过时——`specify` 行缺了「Spec 落地后停下来等用户确认」（v0.4.4），
`implement` 行说到 `claim` 就断了、没有「请用户敲 `/oxyteam-implement`」（v0.4.9），
`finish` 行的判据只有「所有票 done」、没有工作区那一条。**一并改成映射表。** 判据写下来
如果不立刻拿它扫一遍现状，它就只是一句正确的废话——洞 Q 本身就是这么攒出来的。

**这条判据本身已经写进 `verify_overlay_templates.py`，不靠人记得。** 检查是：以
`| flow_stage |` 开头的表头超过两列就报错（第三列历来就是「本轮该做什么」那一列）。
把它做成脚本而不是文档里的一句提醒，正是因为洞 Q 的根因就是「文档里写着、但改的人不会
回来看」—— 判据留在文档里，下一个漏改的人同样不会读到它。

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
