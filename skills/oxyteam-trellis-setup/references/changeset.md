# Oxyteam Trellis Overlay 改动清单

**这是权威文件清单。** Apply、记账、`trellis update` 后的比对，全部以本文件为准；与其他参考冲突时以本文件为准。

存在的理由：曾经出现过没有任何人说得清 Overlay 到底改了哪些文件的情况——`trellis update --dry-run` 报 12 个，实际改了 13 个，多出来的 `linear_sync.py` 被三轮审计加一次外部复核全部漏掉。

## 总账

```text
A 新建自有        3    0 冲突点
B 修改官方       13    每次 trellis update 各付一次冲突
C 删除官方        6    永久，update 尊重删除
D Team Skill 与 init 模板   5    随 Skill Pack v0.3.0 发布，不在 Overlay 安装时改
E 撤销历史修改    7    仅当预检发现旧版 Overlay 痕迹
```

---

## A 组：新建自有文件（0 冲突）

官方模板里没有这些路径，不会进 `changedFiles`，永远不冲突。

| # | 路径 | 职责 |
|---|---|---|
| A1 | `.trellis/scripts/oxyteam_tickets.py` | 解析 `issues/*.md`、算 Frontier、claim/done、summary |
| A2 | `.trellis/scripts/hooks/github_sync.py` | 任务目录 → 远程 GitHub 单向同步 |
| A3 | `.trellis/.oxyteam-overlay.json` | Installer 记账：Overlay 版本 + 逐文件 hash + tombstone |

A1、A2 的命令契约见 `task-model.md`。A3 的格式见 `update-policy.md`。

---

## B 组：修改官方文件（13）

### B-核心（7）

| # | 路径 | 改什么 |
|---|---|---|
| B1 | `.trellis/workflow.md` | 换成五阶段 + 五对 `[workflow-state:*]` 块 + 路由到 `oxyteam-*`；discover 块写明研究结果存 `<task>/research/` |
| B2 | `AGENTS.md` | 声明 `prd.md` 装的是 Oxyteam Spec、`issues/` 是实施票；加一行指向 `.trellis/spec/` 作为编码规范与审查 Standards 源 |
| B3 | `.omp/extensions/trellis/index.ts` | `resolveActiveTaskStatus()` 优先读 `meta.flow_stage`；注入当前票；每个新用户输入建一次快照 |
| B4 | `.omp/commands/trellis-continue.md` | 路由改成按 `flow_stage` + frontier 判断，不再按 `prd.md`/`design.md`/`implement.md` 是否存在判断 |
| B5 | `.omp/commands/trellis-finish-work.md` | 归档门禁加「所有票 `Impl: done`」 |
| B6 | `.omp/agents/trellis-implement.md` | 加载当前票 + 读 `.trellis/spec/` 对应层 + 传 `implementation_base_sha`；改成 `oxyteam-implement` 的薄包装 |
| B7 | `.trellis/config.yaml` | `hooks:` 段取消注释，挂 `github_sync.py` 的 `create` / `archive` |

> **B2 的永久成本**：`AGENTS.md` 的 managed block 自己写着 "edits inside may be overwritten by a future `trellis update`"。每次升级后都要重改一次，必须进 Installer 的固定检查项。

### B-Channel 适配（5）

Channel 是 Trellis 独有的多 agent 运行时，Oxyteam 无等价物，保留并适配。worker 定位为**辅助路径**，票实施的正式路径是 `trellis-implement` → `oxyteam-implement`。

| # | 路径 | 改什么 |
|---|---|---|
| B8 | `.omp/skills/trellis-channel/references/workflows.md` | 命令示例里 `design.md` / `implement.md` → `issues/<当前票>.md`（实测 5 处，纯文本替换） |
| B9 | `.omp/skills/trellis-channel/references/workers.md` | 同上（实测 3 处） |
| B10 | `.omp/skills/trellis-channel/references/forum.md` | 同上（实测 1 处） |
| B11 | `.trellis/agents/implement.md` | 读取列表换成 `prd.md` + 当前票 + `implement.jsonl` + `.trellis/spec/`；**保留「Forbidden: git commit」**——它是受主会话监管的并行工人，主会话负责收口 |
| B12 | `.trellis/agents/check.md` | 读取列表同上；审查方法改成调 `oxyteam-code-review`，**去掉 self-fix** |

`--file "$TASK/prd.md"` 和 `--jsonl "$TASK/check.jsonl"` 这两种示例**本来就是对的，不要动**。

`.omp/skills/trellis-channel/SKILL.md` 与 `references/command-reference.md`、`references/progress-debugging.md` **零过时引用，不改**。

> `.trellis/agents/implement.md` 原文就写着「读 `.trellis/spec/` 项目规范（只加载与本次 diff 相关的）」——这正是把 `trellis-before-dev` 的能力并进 implement 前置的做法，照抄即可，不用新设计。

### B-过渡（1）

| # | 路径 | 改什么 |
|---|---|---|
| B13 | `.omp/skills/trellis-meta/SKILL.md` | 顶部加声明（内容见下） |

```markdown
> ⚠ 本项目已应用 Oxyteam Overlay。
> 下面 references/ 描述的是原版 Trellis，以下内容在本项目已不成立：
>   design.md / implement.md 不再使用
>   trellis-brainstorm / before-dev / check / break-loop 已删除
> 要改 Overlay，请走 oxyteam-trellis-setup，不要直接手改这些文件。
```

**这是过渡措施，有明确的退役条件。** `trellis-meta` 的用途是「改 Trellis 自身的项目级文件」，而那批文件正是 Installer 用基线管着的——两个工具改同一批文件、谁都不知道对方改了什么，是本设计一路在消灭的「双权威」。

```text
现在（Installer 还只会 apply + 记账）
  → 只加声明，1 个冲突点。这期间仍需要一份「Trellis 项目级文件长什么样」的知识源

Installer 具备 reconcile 能力之后
  → 删掉整个 trellis-meta（24 文件），B13 一并作废
    改动面变成 12 改 / 30 删
```

**这一条要进 Installer 的验收清单**，不要留到以后忘掉。

---

## C 组：删除官方入口（6）

这六个各有 hash，删除会走 `userDeletedFiles` 分支被尊重，`trellis update` 不会装回来。**删比改 frontmatter 禁用更干净。**

| # | 路径 | 能力由谁承接 |
|---|---|---|
| C1 | `.omp/skills/trellis-brainstorm/` | `oxyteam-askme` / `interview` / `askme-with-docs` / `map` |
| C2 | `.omp/skills/trellis-before-dev/` | 并进 implement 前置（B6、B11） |
| C3 | `.omp/skills/trellis-check/` | `oxyteam-code-review` |
| C4 | `.omp/skills/trellis-break-loop/` | `oxyteam-diagnosing-bugs` |
| C5 | `.omp/agents/trellis-check.md` | `oxyteam-code-review` 自己 spawn 的两个子代理 |
| C6 | `.omp/agents/trellis-research.md` | `oxyteam-research` 自己 spawn 后台 agent |

**删的是重复实现，不是能力。** 六项能力全部有承接方，一项没少。

删除后必须扫一遍全项目，确保没有残留引用（`trellis-continue.md`、`workflow.md`、`trellis-session-insight` 都提过这些名字）。

---

## D 组：Team Skill 与 init 模板（5，已完成）

**这一组不是 Overlay 安装时改的，是 Skill Pack 里已经改好、随版本发布的。** 预检验 `skills-lock.json` 的 ref 就是在验这一组到位没有。

配置架构（决定了改法）：

```text
oxyteam-init  →  写 docs/agents/issue-tracker.md（从 4 个模板里选一个）
                     ↓ 被读
oxyteam-spec / oxyteam-tickets / oxyteam-map / oxyteam-code-review
```

所以**不手写 `docs/agents/issue-tracker.md`**——给 `oxyteam-init` 加第 4 个模板，让它按正常初始化流程生成。

| # | 路径 | 改什么 |
|---|---|---|
| D1 | `oxyteam-init/issue-tracker-trellis.md` | **新建**。第 4 个 tracker 模板，实现模板契约的全部四段：Conventions / publish / fetch / **Wayfinding operations** |
| D2 | `oxyteam-init/SKILL.md` | Explore 加 `.trellis/` 检测；Section A 加 Trellis 选项并置顶；模板清单加一行 |
| D3 | `oxyteam-tickets/SKILL.md` | 第 5 步的 `.scratch/<feature-slug>/issues/` 是**硬编码路径**，改成查 tracker 文档；追加「tracker 定义了额外字段就加上」 |
| D4 | `oxyteam-code-review/SKILL.md` | 第 1 步换成「主流程固化 patch」（见下）；第 2 步 spec 来源加一条查 tracker 文档，并提到**前面**（原来只找 `docs/`/`specs/`/`.scratch/`，找不到任务目录）；两个子代理提示词改成消费 patch，不执行 git |
| D5 | `oxyteam-research/SKILL.md` | 原文是 "Save it where the repo already keeps such notes"，**没有任何锚点**。改成 spawn 前先定路径并写进 spawn 提示词——它 spawn 的是后台 agent，未必继承会话上下文 |

`Impl:` / `Issue:` 两个字段**只写进 D1 的 Trellis 模板**，不进 `oxyteam-tickets` 的通用票模板——非 Trellis 项目里没有 `oxyteam_tickets.py` 读它们，加了就是噪声。

### 明确不用改的

| Skill | 为什么 |
|---|---|
| `oxyteam-spec` | 已经是纯配置驱动（"publish it to the project issue tracker"），没写死路径 |
| `oxyteam-map` | 已经是配置驱动，明确写着「查 tracker 文档的 Wayfinding operations 段」。**但这意味着 D1 的模板必须有那一段，漏了 map 直接退化到 local 默认**（写进 `.scratch/`） |
| `oxyteam-prototype` | 产物是 throwaway 分支 + 票上的 context pointer，票通过 tracker 解析 |
| `oxyteam-triage` | `.out-of-scope/` 是仓库级 backlog，跟任务目录正交 |
| `oxyteam-domain-modeling` / `improve-codebase-architecture` | 写 `CONTEXT.md` / `docs/adr/`，仓库级，比任何单个任务活得久，不该进会被归档的目录 |
| `oxyteam-handoff` | 写 OS 临时目录，明确「不进 workspace」。跟 Trellis Journal 是互补不是重叠：Journal 记「这个会话发生了什么」，handoff 是「给新 agent 现在就用的一份交接」 |
| `oxyteam-diagnosing-bugs` | 只引用 `CONTEXT.md` 和一个脚本模板 |
| `askme` / `askme-with-docs` / `interview` / `codebase-design` / `tdd` / `implement` | 全文零输出路径 |

### D4 的五步契约

**这是 P0，跟 Trellis 无关，没装 Trellis 的普通项目里一样存在。**

问题：`oxyteam-implement` 的闭环是「先 code-review 再 commit」，而 `git diff A...HEAD` 三点语法两端都是「提交」，工作区完全不参与。**危险在于这不是硬失败，是静默漏审**——固定点前面已有 commit 时 diff 非空，检查照样通过，但这次写的实现一行都没进审查，还报告「审查通过」。

```bash
base=$(git merge-base "$fixed_point" HEAD)

# ① 已提交变更 + 当前 tracked 工作树的最终状态
git diff --binary "$base" --

# ② 逐个、NUL 安全地列出所有未跟踪且未忽略的文件
git ls-files --others --exclude-standard -z

# ③ 每个 untracked 文件转成 patch 拼进去
git diff --no-index --binary -- /dev/null "$path"
```

```text
1. 主流程计算 merge-base
2. 主流程生成一份完整 review patch（① + 全部 ③）
3. 检查这份 patch 非空（替代原来的「diff 非空」检查）
4. 把同一份已固化的 patch 交给 Standards 和 Spec 两个子代理
5. 子代理不再执行任何 git 命令，也不需要「记得补读 untracked」
```

> `git diff --no-index` 发现差异时**退出码是 1，这是正常结果**，不得按失败处理。

两个必须实现的边界：

```text
① 二进制文件：--binary 会 base64 内联（实测 2KB 随机数据 → 49 行 patch）。
   给 untracked 收集加体积上限，超限的只记路径不内联，并在 patch 里留一行说明。
② patch 总量：同一份要发给两个子代理，token 双份。大改动先看总量再决定是否分批。
```

不采用的两个变体，以及为什么：

| 变体 | 为什么不用 |
|---|---|
| `git add -N .` + `git diff $(git merge-base ...)` | 会写 `.git/index`；review 中途掐断会留下 intent-to-add 记录；并发时争 `index.lock` |
| `merge-base` diff + `git status --porcelain` 列 untracked | 依赖子代理「记得去补读」；且 `--porcelain` 对新目录只输出 `?? newdir/`（目录），子代理还得自己展开 |

固定点取值：`task.json.meta.implementation_base_sha`。进入 Implement 时记当时 HEAD；多票时在 claim 每张票时记。**不取 effort 起点**——会反复重审已审过的 commit。

### D1 模板必须覆盖的四段

`oxyteam-init` 的 tracker 模板有固定契约，四段缺一不可：

| 段 | 谁读 | 漏了会怎样 |
|---|---|---|
| `## Conventions` | 所有 Skill | 路径约定不明 |
| `## When a skill says "publish to the issue tracker"` | `oxyteam-spec`、`oxyteam-tickets` | Spec 和票不知道往哪写 |
| `## When a skill says "fetch the relevant ticket"` | `oxyteam-code-review`、`oxyteam-implement` | 取不到当前票 |
| `## Wayfinding operations` | `oxyteam-map` | **`oxyteam-map` 明说「没有就默认用 local-markdown tracker」——直接退回写 `.scratch/`** |

分治内容：

```text
别人提的 issue / PR        → GitHub Issues，oxyteam-triage 在这儿跑
当前任务的 Spec / 实施票    → 当前 Trellis 任务目录（权威）
```

任务目录解析必须写在模板里，这是每次发布都走的核心链路：

```bash
# 不带参数的 current 直接打印仓库相对的任务目录路径（没有 --path 这个 flag）
TASK=$(python3 .trellis/scripts/task.py current)
```

没有 Active Task 时 `current` 退出码非 0。模板必须写明这种情况下停下来问用户，**不要退回 `.scratch/`**。

Map 的 decision ticket 放 `$TASK/map-issues/`，跟实施票的 `$TASK/issues/` **分开**：两者状态词汇不同（`claimed`/`resolved` vs `Impl:`），`oxyteam_tickets.py` 只读 `issues/`，混在一起会让 frontier 两边都算错。

---

## E 组：撤销历史修改（7）

仅当预检发现旧版 Overlay 痕迹时执行。这不是「不改」，是「改回去」，需要拿到官方模板内容。

| # | 路径 | 动作 |
|---|---|---|
| E1–E5 | `.trellis/scripts/common/{task_store,task_utils,task_context,session_context}.py`、`.trellis/scripts/task.py` | 恢复官方原样 |
| E6 | `.trellis/scripts/hooks/linear_sync.py` | 恢复官方原样。**`trellis update --dry-run` 不报这个文件**，只能靠记账或 hash 比对发现 |
| E7 | `.omp/agents/trellis-research.md` | 旧版把它改成了包装器，本版直接删（等同 C6） |

官方模板位置：

```text
$(npm root -g)/@mindfoldhq/trellis/dist/templates/
  trellis/scripts/common/*.py
  trellis/scripts/hooks/linear_sync.py
  trellis/workflow.md
  trellis/agents/{implement,check}.md
  common/commands/{continue,finish-work}.md      → .omp/commands/trellis-*.md
  common/skills/*.md                             → .omp/skills/trellis-*/SKILL.md
  common/bundled-skills/                         → .omp/skills/
  omp/agents/trellis-*.md
  omp/extensions/trellis/index.ts.txt            ← 注意是 .txt，find -name '*.ts' 找不到
```

---

## 明确保持官方原样

```text
.trellis/scripts/common/task_store.py       ← 旧版改过，本版从头不碰
.trellis/scripts/common/task_utils.py
.trellis/scripts/common/task_context.py
.trellis/scripts/common/session_context.py
.trellis/scripts/task.py
.trellis/scripts/hooks/linear_sync.py       ← 留着，github_sync.py 并列新增
.trellis/scripts/common/active_task.py
.trellis/scripts/get_context.py
.trellis/spec/**                            ← 无 Oxyteam 等价物，保留
.omp/skills/trellis-spec-bootstrap/         ← 实测 0 处过时引用
.omp/skills/trellis-update-spec/            ← 实测 0 处过时引用
.omp/skills/trellis-channel/SKILL.md        ← 索引本身干净
```

### `.trellis/spec/` 为什么保留

它填的是 Oxyteam 明确不管的那块：分层编码规范的生成和组织。实测全库 grep `CODING_STANDARDS` 只有 `oxyteam-code-review` 一处引用，且是「读」，Oxyteam 没有任何生成端。**这是互补，不是重叠，删掉是净损失。**

真问题是规范源和审查源不同步：写代码时 `AGENTS.md` 指向 `.trellis/spec/`，审代码时 `oxyteam-code-review` 举的例是 `CODING_STANDARDS.md`，漏检不报错只会静默通过。修法很便宜——`code-review` 那句是 "such as"（举例不是白名单），在 `AGENTS.md` 里加一行明确指向 `.trellis/spec/` 即可，零边际成本（B2 本来就要改），不动 Team Skill。

### `trellis-session-insight` 的 3 处低危引用

```text
:33  「prd.md, design.md 已经在手边」                prd.md 对，design.md 过时，描述性
:35  「子 Agent trellis-implement / trellis-check」  trellis-check 已删，在「什么时候别用」段里
:43  「把 mem 挖出来的决策写进 <task>/prd.md」        本版是正确行为
```

全是低危，改不改都不会造成错误行为。**默认不改**（省 1 个冲突点）。如果因为别的原因要动这个文件，就一并改掉——`trellis update` 的冲突成本是按文件算的，不是按行算的。

---

## 别重走的死路

| 死路 | 怎么证伪的 |
|---|---|
| 把新逻辑塞进官方 `task_utils.py` / `task.py` | 白付 4 个官方文件的永久冲突成本，新建自有脚本 0 冲突 |
| 把 Spec 文件名改成 `spec.md` | 白改 4 个官方文件；官方对 `prd.md` 的四个消费点没有一处解析内容结构 |
| 把实施进度塞进票的 `Status:` 字段 | `Status:` 是 triage 词汇，绑死 `triage-labels.md`；三套概念挤一个格子 |
| 设独立 Review 阶段 | 要拆开 `oxyteam-implement`，产生「要 review 要 commit」和「不许 review 不许 commit」两份直接冲突的指令 |
| 改 frontmatter 禁用不需要的官方 Skill | 删更干净，`update.ts` 的 `userDeletedFiles` 分支尊重删除 |
| 拿被改写过的项目文件反推官方契约 | 项目 `workflow.md` 179 行，官方模板 709 行 |
| 假设 `.template-hashes.json` 顶层是 hash 字典 | schema 是 `{__version, hashes}` |
| 以为 `worktree_path` / `branch` 提供 git 隔离 | 全库零写入零消费 |
| 以为 `oxyteam-code-review` 能审到未提交的实现 | 实测 `git diff A...HEAD` 不含工作区，且不报错 |
| 以为改成 `merge-base` 就够了 | 实测仍漏 untracked，tracked 侧和 untracked 侧必须分别收集 |
| 以为 `git status --porcelain` 能交代清楚 untracked | 实测对新目录只输出 `?? newdir/`，`git ls-files --others -z` 才直接给文件 |
| 以为归档会让 Spec 变得难找 | `add_session.py` 每条日记记 `**Task**`，自动维护 Session History 表，归档内容进 git |
| 以为改 Oxyteam 写入路径必须改 Skill | `oxyteam-spec` 是纯配置驱动；只有 `oxyteam-tickets` 硬编码了 `.scratch/` |
