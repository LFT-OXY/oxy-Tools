# Oxyteam Trellis Overlay 更新策略

## 支持矩阵

本版支持：

- Trellis `0.6.15`；
- Agent 平台：Oh My Pi / Claude Code / Codex（装了哪几个就对哪几个执行平台层）；
- 团队 Skill 来源 `LFT-OXY/oxy-Tools`；
- **Team Skill Pack `>= v0.3.0`**；
- 除 `oxyteam-trellis-setup` 外的基础团队 Skills 使用同一个 Skill Pack 标签。

本 Overlay 自身版本：**`v0.4.3`**（与 `SKILL.md` 的「支持范围」和 `write_overlay_state.py`
的 `--overlay-version` 默认值三处必须一致，改一处三处都要改）。

`oxyteam-trellis-setup` 允许钉在与基础 Skill Pack 不同的标签上——`skills-lock.json` 是逐 Skill 记 `ref` 的，仓库级标签线本来就支撑得住，**不需要单独的 Overlay 标签命名空间**。Setup 标签与基础 Skill Pack 标签不同**不是**混装；预检报告必须分别列出两个版本。

### 对 Skill Pack 版本的硬依赖

Overlay 依赖 `changeset.md` D 组的五项修改，**它们在 `v0.3.0` 随 Skill Pack 发布，不由本 Skill 应用**：

```text
oxyteam-init/issue-tracker-trellis.md   第 4 个 tracker 模板（新建）
oxyteam-init/SKILL.md                   Section A 提供 Trellis 选项
oxyteam-tickets/SKILL.md                发布路径改成查 tracker 文档
oxyteam-code-review/SKILL.md            固化 patch 契约 + spec 来源查 tracker
oxyteam-research/SKILL.md               spawn 前定路径
```

**预检必须逐项验这五处的内容，不是验版本号。**

早前这里写的是「验 `skills-lock.json` 里这 4 个 Skill 的 `ref` ≥ v0.3.0」——**实测执行不了**：
`skills` CLI 的锁文件只记 `source` / `sourceType` / `computedHash`，**没有 `ref` 字段**，
`skills add` 也没有 `--ref` 选项，装的永远是默认分支。按 ref 判版本这条路根本不存在。

改成直接验内容，证据比 ref 更强——ref 对得上也可能是标签打错了，内容对得上就是真到位：

```text
oxyteam-init/issue-tracker-trellis.md   文件存在，且含 `## Wayfinding operations` 段
oxyteam-init/SKILL.md                   Section A 的 tracker 选项里有 Trellis
oxyteam-tickets/SKILL.md                发布路径是查 tracker 文档，不是硬编码 .scratch/
oxyteam-code-review/SKILL.md            patch 契约已固化，spec 来源查 tracker
oxyteam-research/SKILL.md               spawn 子代理前先定路径
```

任意一项不命中就停止。五种失败模式全都不报错：

```text
缺 issue-tracker-trellis.md    oxyteam-init 给不出 Trellis 选项，只能落到 local
缺 Wayfinding operations 段     oxyteam-map 悄悄退回 local-markdown tracker，写进 .scratch/
缺 oxyteam-tickets 的改动       票写进 .scratch/，Trellis 完全看不到
缺 oxyteam-code-review 的改动   审查静默漏掉本次未提交的实现，还报「通过」
缺 oxyteam-research 的改动      后台 agent 把研究结果扔到它自己觉得合理的地方
```

另一条同样重要：`oxyteam-map` 自己写着「没拿到 tracker 就默认用 local-markdown tracker」。所以 `issue-tracker-trellis.md` **必须带 `## Wayfinding operations` 段**——漏了不是报错，是 map 悄悄退回 `.scratch/`。

## 应用前检查

先只读检查：

1. 当前目录是 Git 仓库；
2. `.trellis/.version` 精确为 `0.6.15`；
3. `.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/scripts/` 存在；
4. **已装平台已判定**（`.omp/` / `.claude/` / `.codex/`，至少一个），每个都对得上 `changeset.md`「平台落点对照」表的入口文件；表外的平台直接停；
5. **Codex 专项**（装了才查）：`codex.dispatch_mode` 不是 `inline`（是就硬停）；hooks 开关按 `codex --version` 分支且只提示不硬停——0.147 实测不再需要 `[features].hooks`，改提示项目要在 `~/.codex/config.toml` 的 `[projects]` 里 `trust_level = "trusted"`（详见 `changeset.md`）；
6. `skills-lock.json` 中团队 Skills 来源一致（**只验 `source`，锁文件没有 `ref` 字段**），D 组五项按上面的内容清单逐条命中；
7. 项目中没有原始上游工程 Skill 与 `oxyteam-*` 并存；
8. `changeset.md` 每个目标路径的当前状态已分类（见下），按共享层 / 每个已装平台分组；
9. `.trellis/config.yaml` 的活动 Lifecycle Hook 已列出。

Overlay 安装本身是任务控制面的引导过程，不创建 Trellis Task，也不运行 `task.py create` / `task.py start`。当前工作流状态中关于旧规划 Artifact 的要求在本次安装中跳过；写入确认规则仍然有效。

官方未修改的 `00-bootstrap-guidelines` 是已知初始化 Artifact。确认它没有用户进度后，可以将删除列入应用计划，由 `oxyteam-init` 在 Overlay 完成后接管初始化；不得在确认前删除。

需要检查的原始上游名称至少包括：

```text
ask-matt                          implement                    tdd
code-review                       improve-codebase-architecture to-spec
codebase-design                   prototype                    to-tickets
diagnosing-bugs                   research                     triage
domain-modeling                   setup-matt-pocock-skills     wayfinder
grill-with-docs
```

Trellis 自带的 `trellis-*` Agent、Skill 和 Command 不是上游 Skill 残留；它们是 Overlay 的适配入口或删除对象，按 `changeset.md` 处理。

## 基线记账

### 为什么必须记

Trellis 只维护**官方模板**这一层基线。它能判断「当前文件是不是还等于官方模板」，但**分不清**「这是 Overlay 改的」还是「用户后来改的」——Overlay 一落地 hash 就对不上，用户再改还是对不上，在 Trellis 眼里是同一个状态。

而且它还会漏。实证：`trellis update --dry-run` 报 12 个修改文件，实际改了 13 个，多出来的 `linear_sync.py` 被三轮审计加一次外部复核全部漏掉。**没有记账，就没有任何人知道 Overlay 到底改了哪些文件。**

### 状态文件

`.trellis/.oxyteam-overlay.json`（新路径，官方模板没有，0 冲突，`trellis update` 不会碰）：

```json
{
  "overlay_version": "v0.4.3",
  "trellis_version": "0.6.15",
  "skill_pack_ref": "v0.3.0",
  "applied_at": "<ISO 8601>",
  "platforms": ["omp", "claude-code", "codex"],
  "files": {
    "<path>": {
      "action": "modify | delete | create",
      "layer": "shared | <platformId>",
      "upstream_hash": "<应用时官方模板的 hash>",
      "applied_hash": "<应用完成后本地文件的 hash>"
    }
  }
}
```

`action: "delete"` 的条目只有 `upstream_hash`，没有 `applied_hash`——这是 **tombstone**。它的作用是让上游以后重命名旧 Skill、或在已删目录里新增文件时，Installer 还能正确识别。

`platforms` 和 `layer` 是本版新增的，**没有它们就分不清「这个路径没改过」和「这个平台还没装」**。用户后来跑 `trellis init --claude` 会装进一整套官方文件，Installer 要能只对新平台补跑 P 组和 C 组，不重跑共享层——**平台是可以事后加的，只有一次性全量 apply 不够用。**

### 五值判定模型

```text
U_old = 上次 Overlay 所基于的官方模板 hash   ← 状态文件 upstream_hash
A_old = 上次 Overlay 应用完之后的 hash        ← 状态文件 applied_hash
C     = 当前文件的 hash                       ← 现场计算
U_new = 当前 Trellis 版本的官方模板 hash      ← 读官方模板目录
A_new = 当前 Overlay 对 U_new 生成的目标 hash ← 生成后计算
```

```text
C == A_old                → Overlay 装完没人动过，安全替换成 A_new
C == U_new                → Trellis 恢复或升级了官方文件，重新应用 Overlay
C != A_old && C != U_new  → 本地有漂移，进冲突处理，不静默覆盖
```

**hash 只能分类，不能完成三方合并。** 遇到漂移时 Installer 必须停下来报告，由用户决定，不要试图自动 merge。

### 本版能力边界

```text
✅ inspect    五值分类 + 漂移检测 + Hook 清单
✅ apply      按 changeset.md 落盘 + 写状态文件 + 撤销历史修改
✅ 增量补装   已装项目多出一个平台时只补该平台，老记账原样带过、不重算
✅ bless      重拷模板后重新盖章 —— 只换 applied_hash，必须显式点名路径
❌ reconcile  升级后的自动三方合并 —— 未实现，遇漂移一律停下来问
```

`reconcile` 落地之前，`trellis update` 之后的处理方式是：跑 inspect 拿到分类，人工决定每个漂移文件，再重跑 apply。**这是明确的能力上限，不要在报告里说成「已支持升级」。**

**只有一种情形有现成出路**：Skill Pack 更新了 `templates/`，你把新模板重拷进已装项目——
官方那一侧没变，不需要合并，跑 `write_overlay_state.py bless <路径>` 重新盖章即可（用法见
`edits.md` 末尾）。这是实测踩出来的：不补 `bless`，重拷之后 `finalize` 防重入、`snapshot`
会把 Overlay 后的内容误记成 upstream，两条路都堵死，只剩手改 JSON 或推倒重装。
**`bless` 不是 `reconcile`**，它的前提是你已经确认现场内容正确，不做任何合并。

## 写入确认

任何项目文件写入前必须向用户一次性展示：

- 将新建、修改、删除的确切路径（引用 `changeset.md` 条目编号）；
- 每个文件的行为变化；
- 需要撤销的历史修改；
- 发现的冲突、漂移或旧任务；
- 明确保留不变的文件；
- 已启用且与本 Overlay 冲突的 Lifecycle Hook。

只有用户明确确认后才能写入。确认只覆盖已列出的路径；发现新增路径时重新说明并确认。

**特别警告项**：项目已有 Hook 引用 `linear_sync.py` 时，它会把 `prd.md` 同步到 Linear，与本 Overlay 的 `github_sync.py` 构成两套并行的远程写入。Apply 前必须让用户选择保留哪个，或明确接受同步到两个系统。

## 幂等性

重复运行时：

- 已符合目标形态的文件保持不变（`C == A_new` 直接跳过）；
- 不重复添加状态块、配置行或 Hook 条目；
- 不覆盖用户后来增加的项目规则；
- 未知修改产生冲突报告，不直接覆盖；
- 新旧 Artifact 或 Skill 名称并存时停止。

Apply 必须先在临时目录生成全部结果、静态校验通过后再落盘。半途失败留下的混合状态既不是官方形态也不是目标形态，五值模型会把它判成「本地漂移」，人工恢复代价很高。

## 禁止修改

```text
全局 npm 安装目录
node_modules/@mindfoldhq/trellis*/**
.trellis/.template-hashes.json
.trellis/.runtime/**
未启用平台的配置目录
```

外加 `changeset.md`「明确保持官方原样」清单里的全部文件——尤其是五个官方 Python。

Overlay 修改官方生成文件后，被 `trellis update` 识别为用户修改是正常行为。

## 升级 Trellis

只在测试项目执行：

1. 记录当前 Trellis 版本、Overlay 版本和 Skill Pack ref；
2. 跑 `trellis update --dry-run`；
3. **拿 `.trellis/.oxyteam-overlay.json` 跟 dry-run 输出对账**——dry-run 会漏（`linear_sync.py` 就是先例），以记账为准；
4. 检查冲突和 `.new` 文件；
5. 更新 `oxyteam-trellis-setup` 与 `changeset.md`；
6. 重新跑一遍 `SKILL.md` 第 5 节的验证；
7. 验证通过后再应用到其他项目。

不在多个项目分别维护手工补丁。兼容变化集中回写到本 Skill。

## 官方模板位置

```text
$(npm root -g)/@mindfoldhq/trellis/dist/templates/
  trellis/workflow.md
  trellis/config.yaml
  trellis/scripts/**
  trellis/agents/{implement,check}.md
  shared-hooks/*.py                                  → .claude/hooks/、.codex/hooks/
  common/commands/{continue,finish-work}.md          → .omp/commands/trellis-*.md
                                                       .claude/commands/trellis/*.md
                                                       .agents/skills/trellis-*/SKILL.md（Codex）
  common/commands/start.md                           → .agents/skills/trellis-start/SKILL.md（仅 Codex）
  common/skills/*.md                                 → <平台>/skills/trellis-*/SKILL.md
  common/bundled-skills/**                           → <平台>/skills/**
  omp/agents/trellis-*.md
  omp/extensions/trellis/index.ts.txt                ← 是 .txt，find -name '*.ts' 找不到
  claude/agents/trellis-*.md、claude/settings.json
  codex/agents/trellis-*.toml、codex/hooks/session-start.py、codex/hooks.json
```

**永远从这里读官方原版，不要拿项目里被改写过的文件反推官方契约。** 项目 `workflow.md` 179 行，官方模板 709 行——差了 4 倍。

**逐平台清单不要手抄，用 `collectPlatformTemplates(<platformId>)` 实跑导出**：`omp` 49 个、`claude-code` 52 个、`codex` 54 个。数字对不上说明 Trellis 版本或安装范围有出入，停下来查清楚再动。

各平台命令层的差异（已实测）：

```text
OMP     只装 continue.md + finish-work.md 两个 command，start.md 不落地（有 Extension）
Claude  同上，落在 .claude/commands/trellis/ 下（有 hooks）
Codex   没有命令层，三个全部当 skill 落进 .agents/skills/，含 start——
        它是 Codex 的会话引导入口，因为 Codex 拿不到完整的 SessionStart 概览
```
