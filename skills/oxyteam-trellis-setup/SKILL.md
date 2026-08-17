---
name: oxyteam-trellis-setup
description: "在官方 Trellis 0.6.15 + Oh My Pi 项目中检查并应用 Oxyteam 本地 Overlay：改造工作流、任务模型、Context Loader、Continue 路由和 OMP Agent 包装。"
disable-model-invocation: true
---

# Oxyteam Trellis Setup

在官方 `trellis init -u <developer> --omp` 和团队 Skill Pack 安装完成后运行；完成 Overlay 后再运行 `oxyteam-init`。

这是项目内 Overlay，不修改全局 Trellis npm 包或官方源码。

## 支持范围

- Trellis：`0.6.15`
- Agent 平台：Oh My Pi
- 团队 Skill 来源：`LFT-OXY/oxy-Tools`
- 团队 Skill 前缀：`oxyteam-`

发现其他版本、其他平台或团队 Skill 混装时停止，不按相近结构猜测兼容性。

## 启动例外

本 Skill 正在替换 Trellis 的任务控制面，因此本次调用不能由旧任务模型管理：

- 不询问是否创建 Trellis Task；
- 不运行旧版 `task.py create` 或 `task.py start`；
- 当前 `[workflow-state:no_task]` 或 `[workflow-state:planning]` 中关于任务创建、`prd.md`、`design.md`、`implement.md` 和旧 JSONL 的要求不适用于本次 Overlay 安装；
- 使用当前会话的普通执行清单完成预检、确认、应用和验证。

该例外只跳过旧任务控制面，不构成项目写入授权。任何 Overlay 文件写入仍须按第 3 步取得用户明确确认。

Overlay 完成后，后续项目工作恢复使用新的团队任务模型。


## 执行顺序

### 1. 读取规则

先读取：

1. [`references/update-policy.md`](references/update-policy.md)：版本、所有权、冲突和确认规则；
2. [`references/workflow.md`](references/workflow.md)：团队六阶段工作流与 Skill 路由；
3. [`references/task-model.md`](references/task-model.md)：Spec、Tickets、状态和任务目录；
4. [`references/context-loading.md`](references/context-loading.md)：Session Context、Manifest、OMP Extension 和 Agents。

四份参考共同构成 Overlay 契约，不选择性跳过。

### 2. 只读预检

依次检查：

1. 当前目录是 Git 仓库；
2. `.trellis/.version` 精确为 `0.6.15`；
3. `.trellis/workflow.md`、`.trellis/config.yaml`、Task Store 和 Context Loader 存在；
4. `.omp/commands/trellis-continue.md`、`.omp/extensions/trellis/index.ts` 和三个 `trellis-*` Agent 存在；
5. `skills-lock.json` 存在；
6. 全部 `oxyteam-*` Skills 来自 `LFT-OXY/oxy-Tools` 并使用同一标签；
7. 没有原始上游工程 Skill 与团队版并存；
8. 目标文件不存在无法解释的用户修改。

任何检查失败时停止，不尝试修复缺失的官方 Trellis 文件。

### 3. 给出应用计划

写入前列出：

- 将修改的确切路径；
- 每个文件的行为变化；
- 将创建、迁移或停止使用的 Artifact；
- 旧任务与未知修改冲突；
- 明确保留不变的文件。

等待用户明确确认。确认只覆盖已列出的路径；实际范围扩大时重新确认。

### 4. 应用 Overlay

确认后按参考文件完成干净切换：

1. 改造 `.trellis/workflow.md`；
2. 改造 Task Store 与 Task Validation；
3. 改造 Session Context 与 Task Context；
4. 改造 `.omp/commands/trellis-continue.md`；
5. 改造 `.omp/extensions/trellis/index.ts`；
6. 把 `trellis-implement`、`trellis-check`、`trellis-research` 改成 Oxyteam 包装器；
7. 清除已迁移调用中的旧 Artifact 和原始上游 Skill 名称。

不保留兼容别名或两套并行路由。遇到旧任务或未知用户修改时按更新策略停止，不静默覆盖。

## 所有权

可以修改：

- `.trellis/workflow.md`
- `.trellis/config.yaml`（只有真实配置需要时）
- `.trellis/scripts/**`
- `.omp/commands/**`
- `.omp/extensions/trellis/**`
- `.omp/agents/trellis-*.md`
- 项目级 Oxyteam 包装 Skills

禁止修改：

- 全局 npm 安装目录；
- `node_modules/@mindfoldhq/trellis/**`；
- `node_modules/@mindfoldhq/trellis-core/**`；
- `.trellis/.template-hashes.json`；
- `.trellis/.runtime/**`；
- 未启用平台的配置目录。

## 验证

应用后至少验证：

1. 重复预检通过且重复应用不产生额外差异；
2. 创建任务只生成 `task.json` 和 `spec.md`；
3. 单会话任务能从 Spec 进入 Implement、Review、Finish；
4. 多会话任务能识别 Blocking、Frontier、Claim 和 Active Ticket；
5. Continue 不再依赖 `prd.md`、`design.md` 或 `implement.md`；
6. OMP 每轮注入 `meta.flow_stage` 对应的工作流状态；
7. Implement、Review、Research Agent 只加载各自需要的 Context；
8. 项目内没有原始上游工程 Skill 调用；
9. `trellis update --dry-run` 明确报告 Overlay 文件为用户修改，不破坏项目文件。

报告实际执行的命令、输出和仍未验证的行为；没有观察到的结果不得声称通过。
