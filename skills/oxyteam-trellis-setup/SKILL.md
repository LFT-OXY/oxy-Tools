---
name: oxyteam-trellis-setup
description: "在官方 Trellis 0.6.15 项目（Oh My Pi / Claude Code / Codex）中安装 Oxyteam Overlay：五阶段工作流、prd.md/issues/ 任务模型、票解析脚本、远程 Issue 单向同步、Context 注入适配，并记录可追溯的应用基线。"
disable-model-invocation: true
---

# Oxyteam Trellis Setup

在官方 `trellis init -u <developer> --omp` 和团队 Skill Pack 安装完成后运行；完成 Overlay 后再运行 `oxyteam-init`。

这是项目内 Overlay，不修改全局 Trellis npm 包或官方源码。

## 设计契约来源

本 Skill 实现的是《Oxyteam-Trellis-Overlay 大白话设计说明》第三版。核心主张：

```text
Trellis 任务目录就是权威正文，不是副本也不是指针
两边能力一项不丢，重复实现合并成一个
远程 Issue 是从任务目录单向同步出去的镜像
```

改动成本定价表（决定一切取舍）：

```text
不改官方文件 > 删掉不需要的官方入口 > 新建自有文件 > 修改官方文件
                （update 尊重删除）    （0 冲突）   （每次 update 重付）
```

## 支持范围

- Overlay 版本：`v0.4.12`
- Trellis：`0.6.15`
- Agent 平台：**Oh My Pi / Claude Code / Codex**（装了哪几个就对哪几个执行平台层）
- 团队 Skill 来源：`LFT-OXY/oxy-Tools`
- 团队 Skill 前缀：`oxyteam-`
- **Team Skill Pack：`>= v0.3.0`**（D 组的 5 项改动在这个版本落地，缺了 Overlay 装完也不工作）

发现其他 Trellis 版本、其他平台、来源混装或基础团队 Skills 标签不一致时停止，不按相近结构猜测兼容性。`oxyteam-trellis-setup` 可以钉在与基础 Skill Pack 不同的标签上，不要求同版本。

## 启动例外

本 Skill 正在替换 Trellis 的任务控制面，因此本次调用不能由旧任务模型管理：

- 不询问是否创建 Trellis Task；
- 不运行 `task.py create` 或 `task.py start`；
- 当前 `[workflow-state:*]` 块中关于任务创建、`design.md`、`implement.md` 和旧 JSONL 的要求不适用于本次 Overlay 安装；
- 使用当前会话的普通执行清单完成预检、确认、应用和验证。

该例外只跳过旧任务控制面，不构成项目写入授权。任何 Overlay 文件写入仍须按第 3 步取得用户明确确认。

Overlay 完成后，后续项目工作恢复使用新的团队任务模型。

## 执行顺序

### 1. 读取规则

先读取：

1. [`references/changeset.md`](references/changeset.md)：**权威逐文件改动清单**，Apply 与记账都以它为准；
2. [`references/edits.md`](references/edits.md)：**只改几处的文件的逐字锚点替换表**，不要凭描述自己改；
3. [`references/contract-cheatsheet.md`](references/contract-cheatsheet.md)：**命令行、字段名、阶段名的逐字底座**——写任何内容前先对一遍，别自己发挥；
4. [`references/update-policy.md`](references/update-policy.md)：版本、基线记账、冲突和确认规则；
5. [`references/workflow.md`](references/workflow.md)：团队五阶段工作流与 Skill 路由；
6. [`references/task-model.md`](references/task-model.md)：任务目录、三层状态、票格式与远程同步；
7. [`references/context-loading.md`](references/context-loading.md)：注入层、Turn 快照与 Manifest。

七份参考共同构成 Overlay 契约，不选择性跳过。`changeset.md` 与其他几份冲突时以 `changeset.md` 为准。

**改动一律拿现成件，不要现写**：`scripts/` 原样拷贝，`templates/` 整篇替换（路径镜像落点），`edits.md` 逐字锚点。三者都没覆盖的条目才按描述实现，且实现完应补成现成件。

### 2. 只读预检（inspect）

依次检查：

1. 当前目录是 Git 仓库；
2. `.trellis/.version` 精确为 `0.6.15`；
3. `.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/scripts/` 存在；
4. **判定装了哪些平台**：`.omp/` / `.claude/` / `.codex/`。至少一个，且每个都要对齐 `changeset.md`「平台落点对照」表里的入口文件（OMP 的 `extensions/trellis/index.ts`、Claude 的 `hooks/` 三件套、Codex 的 `hooks.json` + `.agents/skills/`）；发现表外的平台（Cursor、Gemini 等）就停下来说明本版不支持，不按相近结构猜；
5. **Codex 专项**（装了才查）：`.trellis/config.yaml` 的 `codex.dispatch_mode` 是 `inline` → **硬停**。hooks 开关**按 `codex --version` 分支，一律只提示不硬停**：0.147 实测不再需要 `[features].hooks`（`trellis init` 的警告文案停在 0.129 的行为上，别照抄），这时改为提示「项目要写进 `~/.codex/config.toml` 的 `[projects]` 并 `trust_level = "trusted"`」；更老的版本才提示去开 flag 并 `/hooks` 批准。**判定以装完开一个真 Codex 会话、看 `<workflow-state>` 进没进来为准**，读配置判不准（详见 `changeset.md`「Codex 的两个前置」）；
6. **`.agents/skills/` 波及面**：列出项目里还装了哪些共读这一层的平台，C 组删除对它们同样生效，必须写进计划。**名单不要抄这里**——`trellis init` 配置 Codex 时会自己打印一份（0.6.15 打的是 Cursor / Gemini CLI / GitHub Copilot / Amp / Kimi Code），**再加上官方没算进去的 OMP 和 Pi**；以实跑输出为准。**装了 OMP 但没装 Codex 时要反向查一遍**：`.agents/skills/` 里若有别的平台写进去的 `trellis-brainstorm` / `before-dev` / `check` / `break-loop`，C 组不会碰它们（那是 Codex 那一栏），而 OMP 照样读得到——这时 C 组对 OMP 没删干净，必须在计划里点名；
7. `skills-lock.json` 存在，全部 `oxyteam-*` Skills 来自 `LFT-OXY/oxy-Tools`；
8. 没有原始上游工程 Skill 与团队版并存（名单见 `update-policy.md`）；
9. 读 `.trellis/.oxyteam-overlay.json`：不存在即首次安装；存在则按 `update-policy.md` 的基线判定逐文件分类，并比对**已装平台清单**——记账里没有、磁盘上有的平台，走增量补装（只跑该平台的 P 组和 C 组，不重跑共享层）；
10. 读 `.trellis/config.yaml` 的 `hooks:` 段，列出已启用的 Lifecycle Hook；
11. 对 `changeset.md` 里每个目标路径计算当前 hash，与官方模板 hash 比对，产出「未改 / 已是目标形态 / 存在本地漂移」三分类。官方模板不要手抄路径，用 `collectPlatformTemplates(<platformId>)` 实跑导出（`claude-code` 52 / `codex` 54 / `omp` 49，数字对不上说明版本或安装范围有出入）。

任何检查失败时停止，不尝试修复缺失的官方 Trellis 文件。

**已有 Lifecycle Hook 引用 `linear_sync.py` 时必须警告**：它会同步 `prd.md` 到 Linear，与本 Overlay 新增的 `github_sync.py` 是两套并行的远程写入，由用户决定保留哪个或都保留。

### 3. 给出应用计划

写入前列出：

- 将新建、修改、删除的确切路径（直接引用 `changeset.md` 的条目编号），**按共享层 / 每个平台分组列出**；
- 每个文件的行为变化；
- 需要**撤销**的历史修改（旧版 Overlay 改过、本版要求恢复官方原样的文件）；
- 检测到的本地漂移与旧任务冲突；
- 明确保留不变的文件；
- `changeset.md` D 组的 Skill Pack 依赖是否满足（不满足就停，不要一边装 Overlay 一边让 Skill 往 `.scratch/` 写）。

等待用户明确确认。确认只覆盖已列出的路径；实际范围扩大时重新确认。

### 4. 应用 Overlay（apply）

确认后按 `changeset.md` 的分组顺序执行：

```text
A 组  新建自有文件        5 个（4 个脚本 + 记账 JSON），0 冲突，与平台数无关
B 组  修改官方 · 共享层    5 个，改一次所有平台生效
P 组  修改官方 · 平台层    每个已装平台 8~9 个（OMP 8 / Claude 9 / Codex 9）
C 组  删除官方 · 平台层    每个已装平台 6 个
D 组  Team Skill 与 init 模板  不在此执行，随 Skill Pack 发布，预检只验版本
E 组  撤销历史修改        仅当预检发现旧版 Overlay 痕迹
```

应用要求：

- 先在临时目录生成全部结果，静态校验通过后再落盘，避免半途失败留下混合状态；
- **apply 之前先跑 `write_overlay_state.py snapshot`**，清单逐条照 `changeset.md` 列全（用法见 `edits.md` 末尾）。漏掉的路径 = 记账里没有 = 以后 `verify` 管不着。**走增量补装时清单只列新平台的 P 组和 C 组**，共享层和老平台一个字不写，列了会直接报错；
- **`scripts/` 下四个文件原样拷进 `.trellis/scripts/`，不要即兴实现**；落盘后立刻各跑一次，不通过就回滚：

  ```bash
  python3 .trellis/scripts/oxyteam_tickets.py selfcheck        # 票解析 + frontier + 环检测
  python3 .trellis/scripts/verify_workflow.py                  # workflow.md 结构（失败模式全是静默的）
  python3 .trellis/scripts/hooks/github_sync.py selfcheck      # 依赖排序 + Issue 字段回填
  python3 .trellis/scripts/write_overlay_state.py selfcheck    # 记账全流程 + 三种漂移
  ```

- **落盘前先在本 Skill 的 `templates/` 上跑一次模板验收**，抓残留旧引用、错子命令和三平台正文漂移：

  ```bash
  python3 scripts/verify_overlay_templates.py
  ```

- 不保留兼容别名，不保留两套并行路由；
- **P / C 组只对已装平台执行**，不给没装的平台预建目录；
- P1 的 `inject-workflow-state.py` 补丁在 Claude 和 Codex 是同一份（官方模板字节相同），写一份应用两次；
- 重写 `.codex/agents/trellis-implement.toml` 时保留用户钉的 `model` / `model_reasoning_effort`；
- 遇到旧任务或未知用户修改时按 `update-policy.md` 停止，不静默覆盖；
- 落盘后跑 `write_overlay_state.py finalize --platforms <已装平台>` 补完记账，**不要手写这个 JSON**。

### 4.5 交给 `oxyteam-init`

Overlay 落盘后**必须提示用户运行 `oxyteam-init`**，选 **Trellis** 这个 tracker。

`docs/agents/issue-tracker.md` 是所有 Team Skill 找路径的唯一配置锚点，由 `oxyteam-init` 从模板生成——**不要在这里手写它**。没有这一步，Overlay 装完了 `oxyteam-spec` / `oxyteam-tickets` / `oxyteam-map` 照样往 `.scratch/` 写，而且不报错。

`oxyteam-init` 会往 `AGENTS.md` 追加 `## Agent skills` 段（managed block 外），所以它跑完
**`verify` 必然报一次 `AGENTS.md 被本地改动漂移了`**。这是合法追加，不是冲突：

```bash
python3 .trellis/scripts/write_overlay_state.py bless AGENTS.md
python3 .trellis/scripts/write_overlay_state.py verify
```

`trellis update --dry-run` 那边不受影响——`mergeManagedBlockContent()` 把 block 外的内容
原样带进「期望内容」，B2 照样不出现在「Modified by you」里。两次三平台实测都是这个结果。

### 5. 验证

应用后至少验证：

1. 重复运行预检通过，且重复应用不产生额外差异；
2. `python3 .trellis/scripts/task.py create` 只生成 `task.json` 和官方骨架 `prd.md`。
   **必须真跑一次，并且看它往 stderr 打了什么**——`contract-cheatsheet.md` 的「四个运行时坑」
   全是静态检查漏掉的（中文标题需要 `--slug`、Next steps 指路 `design.md`、`start` 在会话外
   只翻 status 不落指针、`current --json` 拿不到 `meta`）。只读文件验不出任何一条；
3. `oxyteam-spec` 把 Spec 正文写进 `<task>/prd.md`（覆盖官方骨架）；
4. `oxyteam-tickets` 把票写进 `<task>/issues/NN-*.md`，且带 `Impl:` 与 `Issue:` 两个字段；
5. `python3 .trellis/scripts/oxyteam_tickets.py frontier` 能算出正确的可开工票，环引用与不存在的 Blocker 会校验失败；
6. **每个已装平台各开一个真会话验一次**：新用户输入注入 `meta.flow_stage` 对应的 `[workflow-state:*]` 块，切票后当前票随之刷新；新会话的启动提示不再指向 `trellis-brainstorm` 或 `design.md` / `implement.md`。

   **手工执行 hook 脚本、或只确认补丁命中，都不算验过这一条。** 它验的是注入有没有接通，
   不是补丁内容对不对——OMP 走 `extensions/trellis/index.ts` 的 TypeScript 路径，
   Claude / Codex 走 Python hook 且各自有独立的信任与开关机制，三条链路互不代表。
   真会话跑一句「你好」，看首轮上下文里有没有 `<workflow-state>` 块的正文即可；
7. Implement 阶段主会话**停下来提示用户敲 `/oxyteam-implement`**，不自己写实现，也不用 Read 读 SKILL.md 绕过去；跑完看 `oxyteam-code-review` 的汇报里**两轴是不是各跑了一个并行子代理**——起点一旦落进子代理，两轴就成了二级，平台不支持嵌套时会静默退化成自审，两轴照样报全绿，不专门看这一句分辨不出来。

   单会话路径 v0.4.9 已实测通过（Claude Code）：两轴各 60k+ tokens 独立跑，Spec 轴挖出
   `isinstance(day, int)` 放行 `True` 这类自审报不出的边界 bug。**日志里有两行 Agent 不等于
   两轴独立——要看它们报出来的东西**，刚写完代码的人自审是拿不到这种发现的。

   有票任务另验 `claim` → 敲 → `done` 的串行推进。v0.4.10 已实测通过（Claude Code，两张票）：
   `frontier` 给出 01，02 `Blocked by: 01`，两张票各落一个 commit 且顺序与依赖图一致。
   **要走到这条路只能在 Spec 认可后显式敲 `/oxyteam-tickets` 强制切**——测试项目里任何需求都是
   「一个会话做得完」，按 `workflow.md` 的 Slice 可选规则模型每次都会合理地跳过切票，靠加大
   需求去撞是撞不出来的；
8. 归档门禁**两个方向都要验**：故意留一张票不是 `Impl: done`，确认 finish-work Step 0 拦住；
   补完再跑一次，确认放行并触发 `after_archive` → `github_sync.py archive`（有远程时父子 Issue
   全部 CLOSED）。只验放行不验拦截等于没验门禁。退回 `done` 只能手改票文件，票脚本没有 reopen。

   **「所有票 done」这个条件截至 v0.4.10 连续八轮没被观测到**：前七轮走 `票 0 张` 的空真放行，
   第八轮票是真的做完了，可 Step 0 放行时不留痕，汇报里只有「Step 1–2 通过」——门禁查没查过票
   看不出来。票 `done` 是 Implement 阶段自己标的，**跟门禁读没读它是两回事**。v0.4.12 已要求
   放行分支也把 `summary` 原样报出来；验这一条时先看有没有那一行，没有就是没跑；
9. 项目内没有原始上游工程 Skill 调用，也没有已删除的 `trellis-brainstorm` / `before-dev` / `check` / `break-loop` 引用（**含 Claude 的 `session-start.py` 和 Codex 的 `trellis-start/SKILL.md`**）；
10. `trellis update --dry-run` 报告的「Modified by you」集合等于 `changeset.md` B 组 + 全部已装平台的 P 组，**减去 B2**——不多不少。

    **B2 不该出现在这个集合里。** `AGENTS.md` 的改动落在 managed block 外面，官方
    `mergeManagedBlockContent()` 算「期望内容」时会把 block 外的内容原样带上，hash 因此一致。
    B2 一旦出现在 dry-run 里，说明有人把它写进 block 内了，回去按 `edits.md` 改。

11. `python3 .trellis/scripts/write_overlay_state.py verify` 通过 —— 记账里每个路径都对得上现场，
    tombstone 路径没有被 `trellis update` 装回来。

**第 10 条是 Overlay 是否可维护的唯一硬指标。** 曾经出现过 `dry-run` 报 12 个而实际改了 13 个的情况（`linear_sync.py` 被三轮审计漏掉），所以比对必须以 `.trellis/.oxyteam-overlay.json` 的记账为准，而不是以 `dry-run` 输出为准。

报告实际执行的命令、输出和仍未验证的行为；没有观察到的结果不得声称通过。

## 所有权

可以修改：

```text
.trellis/workflow.md
.trellis/config.yaml                  仅 hooks: 段
.trellis/agents/implement.md
.trellis/agents/check.md
.trellis/scripts/oxyteam_tickets.py       新建
.trellis/scripts/verify_workflow.py       新建
.trellis/scripts/write_overlay_state.py   新建
.trellis/scripts/hooks/github_sync.py     新建
.trellis/.oxyteam-overlay.json            新建，由 write_overlay_state.py 生成
AGENTS.md
docs/agents/issue-tracker.md

以下按已装平台展开（落点见 changeset.md 的 P 组表）：
  OMP     .omp/commands/**
          .omp/extensions/trellis/**
          .omp/agents/trellis-implement.md
          .omp/skills/trellis-{channel/references,meta}/**
  Claude  .claude/hooks/{session-start,inject-workflow-state}.py
          .claude/commands/trellis/**
          .claude/agents/trellis-implement.md
          .claude/skills/trellis-{channel/references,meta}/**
  Codex   .codex/hooks/inject-workflow-state.py
          .codex/agents/trellis-implement.toml
          .agents/skills/trellis-{start,continue,finish-work}/SKILL.md
          .agents/skills/trellis-{channel/references,meta}/**
```

可以删除：仅限 `changeset.md` C 组的 6 个角色在**已装平台**上的落点，删除前必须逐条出现在应用计划里。

**禁止修改**（改了就是在重走已证伪的死路）：

```text
全局 npm 安装目录
node_modules/@mindfoldhq/trellis*/**
.trellis/.template-hashes.json
.trellis/.runtime/**
.trellis/scripts/common/task_store.py
.trellis/scripts/common/task_utils.py
.trellis/scripts/common/task_context.py
.trellis/scripts/common/session_context.py
.trellis/scripts/task.py
.trellis/scripts/hooks/linear_sync.py
.trellis/scripts/common/active_task.py
.trellis/scripts/get_context.py
.trellis/spec/**
未启用平台的配置目录
<平台>/hooks/inject-subagent-context.py   ← 当前票走 implement.jsonl，不改
.codex/hooks/session-start.py            ← 死文件，hooks.json 没注册它，改它是白改
.codex/hooks.json / .codex/config.toml
.claude/settings.json
```

五个官方 Python 一个字不动，是本版相对旧版省下的最大一块成本。需要解析票、算 Frontier 时新建 `oxyteam_tickets.py`，不要往官方 Python 里塞函数。
