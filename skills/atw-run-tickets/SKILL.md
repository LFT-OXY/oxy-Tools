---
name: atw-run-tickets
description: "无人值守地跑完一个 ATW 任务的全部工单：按工单前沿逐张启动全新的无头 Claude Code 会话执行 /atw-implement，每张工单仍走完整闭链（实现 → 测试 → 两轴审查 → 回写 spec → 提交），任一门禁不过立即停下。用户说“把工单全部跑完”“无人值守跑工单”或输入 /atw-run-tickets 时使用。只在 ATW dev 模式、任务处于 implement 阶段时有意义。"
disable-model-invocation: true
---

# atw-run-tickets

把“每张工单由你新开一个会话、手敲一次 `/atw-implement`”这个人工环节交给脚本。脚本在 `scripts/atw-run-tickets.sh`（相对本文件所在目录），每一轮都是一个**全新的** `claude -p` 会话，所以每张工单都拿到干净的上下文，和你手动新开窗口完全一样；ATW 的 hook、技能和审查子代理在无头模式下照常工作。

本技能只由用户触发。用户运行它，就是 ATW 停靠点③的授权；AI 不得自行调用它，也不得在脚本运行期间手动 `claim`、`done` 或提交。

## 前提

- 项目是 ATW dev 模式，任务处于 `implement` 阶段，`issues/` 下有 `ready` 工单。
- 工作区干净（脚本开跑前会检查，不干净直接退出）。
- `claude` 命令可用。脚本默认给每个会话加 `--dangerously-skip-permissions`，否则无头会话里的 Bash、git、测试命令会被自动拒绝，闭链跑不完。**这意味着会话里的命令没有人把关**，只在有 git 保护、能回滚的仓库上用。
- 单张小工单约 2 分钟、1 美元上下；大工单按比例增加。

## 流程

### 1. 预检并向用户确认

跑脚本前先把下面几项查清，列给用户，等用户点头再跑：

```bash
python3 .atw/scripts/task.py current --source          # 当前任务；没有就让用户说任务目录
python3 .atw/scripts/tickets.py frontier --task-dir <task-dir>
python3 .atw/scripts/tickets.py summary  --task-dir <task-dir>
git status --porcelain                                  # 必须为空
```

要确认的内容：任务目录、这次会跑几张工单（全部，还是 `--max N`）、权限方式（默认跳过权限）、要不要在每张工单后独立再跑一次测试（`ATW_RUN_TEST_CMD`，如 `npm test`）。工作区不干净时先让用户处理，不要替用户提交无关改动。

### 2. 运行

在仓库根目录执行，放到后台，输出落到 `.atw/.runtime/runs/<task>/`（该目录 ATW 自带的 gitignore 已排除）：

```bash
ATW_RUN_TEST_CMD="<测试命令>" bash <skill-dir>/scripts/atw-run-tickets.sh [--task <task-dir>] [--max <n>]
```

脚本每轮做的事：取前沿第一张工单 → 生成唯一的 `ATW_CONTEXT_ID` 并在该上下文下 `task.py start`（新会话没有活动任务指针，这一步缺了 hook 会报 no_task）→ `tickets.py claim NN` → `claude -p "/atw-implement NN"`，固定 session id → 三道门禁：工单文件必须是 `done`、任务目录的状态改动补一个 chore 提交后工作区必须干净、可选再跑一次测试。前沿为空时自动退出，并把任务留在会话自己推进到的阶段（通常是 `accept`）。

也可以把这条命令给用户，让用户在自己的终端里跑，效果相同；想离开电脑时这样更稳。

### 3. 结束后向用户汇报

读脚本的控制台输出和每张工单的可读日志 `.atw/.runtime/runs/<task>/<时间>-ticket-NN.md`，汇报：

- 完成了哪几张工单、每张的提交号、轮次与费用（日志末尾的 `--- result` 行）。
- **每张工单的审查报告原文转述**，Standards 和 Spec 两段都要，“未发现问题”也要说。这是 ATW 2.3 的规则，脚本跑的会话不例外。
- 如果脚本中途停了：停在哪张、哪道门禁没过、对应的 `claude --resume <session-id>` 命令。接手处理前先看那张工单的日志，会话通常已经把原因写在最后一段。

任务进入 `accept` 后，后续验收仍按 ATW Phase 3 走，由用户在自己的会话里做。

## 参数与环境变量

| 项 | 作用 | 默认 |
| --- | --- | --- |
| `--task <dir>` | 任务目录 | `.atw/tasks` 下唯一一个 `implement` 任务 |
| `--max <n>` | 最多跑几张 | 不限，直到前沿为空 |
| `--dry-run` | 只打印每轮命令 | 关 |
| `--permission <mode>` | 传给 `claude --permission-mode` | `skip`，即 `--dangerously-skip-permissions` |
| `ATW_RUN_TEST_CMD` | 每张工单后独立再跑一次的测试命令 | 不设则跳过 |
| `ATW_RUN_MAX_TURNS` | 单次会话最大轮次 | 300 |
| `ATW_RUN_COMMIT_STATE` | 是否把 `.atw/tasks/<task>` 的状态改动单独提交 | 1 |

## 注意

- 几个窗口同时对不同任务跑脚本没问题，各在自己的 worktree 里；但 `finish-work` 写的 journal 是同一个文件，只在一个窗口做。
- 脚本不会替会话做决定：遇到 spec 矛盾、要拍板的事，会话停下写进日志，脚本因工单未 `done` 而退出。这是设计，不是故障。
- 不要改脚本来跳过审查或提交：那会把两套矛盾的指令同时放到同一个会话前面，结果不可预测。想少审查，去减少工单数量。
