# 工单 09 的手动核对：用真实的 `npx` 装一个第三方 Skill

> 2026-10-10，macOS，Node 24.15.0，`skills` 1.7.2（`skills@1` 当时解析到的版本）。主会话亲自跑的，没有交给子代理。
> 全程在 `mktemp -d` 建的临时目录里：`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`XDG_CONFIG_HOME`、`XDG_STATE_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`npm_config_cache`、`OXY_TOOLS_CATALOG` 都指到它，驱动脚本开头逐个断言。

## 做了什么

1. `cd cli && npm run build`，跑的是 `dist/bin.js`（真实的 `systemCommandRunner`、真实的交互库）。
2. 样例目录：`index.json` 里没有 skill；`catalog.json` 里一个用途、一条第三方 Skill——来源 `emilkowalski/skills`，其中的 skill 只登记 `animate` 一个（`research/skill-intake-analysis.md` 的试验 2 用过它）。
3. 可执行路径上有真实的 `claude` 和 `codex`，所以两个宿主都检测到；安装器只拿它们判断在不在，没有执行。
4. 伪终端里（Python 的 `pty`）起 `node dist/bin.js --lang zh`，脚本等画面上出现某段字再按键：进用途 → 两个宿主都选 → 勾上那一条 → 开始安装 → 等到「合计」→ 回到主菜单后 Ctrl+C。原始输出原样录下，在同目录的 `third-party-trial-raw-output.txt`（带着样式码）。
5. 特意把 `CLAUDE_CONFIG_DIR` 指到一个**不是** `<HOME>/.claude` 的目录（`<临时目录>/claude-config`），看安装器清空这个变量的做法起没起作用。

## 结果

| 核对什么 | 结果 |
|----------|------|
| 安装器执行的命令 | 汇总里展示的两条：`npx -y skills@1 add emilkowalski/skills --skill animate --agent claude-code --yes --global`，以及 `--agent codex` 的那一条 |
| 结果行 | `✓  animate   Claude Code   已安装`、`✓  animate   Codex   已安装`，合计「2 成功 · 0 失败 · 0 跳过」；安装器以 130 退出（最后按的 Ctrl+C） |
| 目标位置 | `<HOME>/.claude/skills/animate/SKILL.md` 和 `<HOME>/.agents/skills/animate/SKILL.md` 都在，两处都是真实目录，不是符号链接 |
| `CLAUDE_CONFIG_DIR` 指的目录 | 是空的：skill 没有落到 `<那个目录>/skills` |
| 原始输出里搜 skills CLI 的画面 | 框线（`┌┐└┘│├┤╭╮╰╯`）0 处；它的记号（`◇◆●○◒◐◓◑▲`）0 处；字符画（`╗╔╝╚║═`）0 处；它的英文进度（`Installation Summary`、`Done!`、`Cloning`、`Installing`、`Agent detected`、`telemetry` 等）0 处 |
| 有没有被它提问 | 没有：脚本没有为它按过任何键，两条命令各自结束 |
| 真实的主目录 | 运行前后各取一次 `ls -la ~/.claude/skills ~/.agents/skills`，外加 `~/.agents/.skill-lock.json`、`~/.local/state/skills` 在不在，合起来的哈希前后相同；运行前确认过两处都没有 `animate` |
| 它另外写了什么 | `<XDG_STATE_HOME>/skills/.skill-lock.json`：记着装了哪个 skill、来源和时间。真实使用时这个文件在用户自己的状态目录里，安装器不读它 |

安装阶段留在画面上的样子（从原始输出还原，转动的那一行只留最后一次）：

```
✓ 开始安装吗 · 开始安装

── 正在安装 ────────────────────────────────────────────────────────────────────

  ✓  animate   Claude Code   已安装
  ✓  animate   Codex         已安装

────────────────────────────────────────────────────────────────────────────────
  合计      2 成功 · 0 失败 · 0 跳过
```

## 两个对照（直接跑 skills CLI，不经安装器，输入输出切断）

| 做了什么 | 结果 | 说明什么 |
|----------|------|----------|
| 同一条命令（`--agent claude-code`），`CLAUDE_CONFIG_DIR` 指到 `<临时目录>/claude-config`，不清空 | 退出 0，装到了 `<临时目录>/claude-config/skills/animate`，`<HOME>/.claude` 没有建 | skills CLI 给 Claude Code 装全局 skill 时认 `CLAUDE_CONFIG_DIR`。安装器的 skill 目录不认它，所以调用时要把这个变量清空，两边才是同一个目录 |
| `--skill animate no-such-skill`（一个对得上，一个对不上），`CLAUDE_CONFIG_DIR` 清空 | 退出 0，只装了 `animate` | 一条命令里有名字对不上时，只要另有对得上的，它**不报错**。安装器一条命令只装一个 skill，这种情况下那一项靠复核判失败（没有 `SKILL.md`） |

## 读 skills 1.7.2 的源码确认的三件事

`npm pack skills@1` 取下发布包，只读不执行（`dist/cli.mjs`）：

- 遥测的开关：`return !process.env.DISABLE_TELEMETRY && !process.env.DO_NOT_TRACK;`——两个变量任意一个非空就关。安装器两个都设成 `1`。
- 装出来的目录名：`sanitizeName(name)` 把名字转成小写，把 `[a-z0-9._]` 之外的字符连成的一段换成一个 `-`，再去掉首尾的 `.` 和 `-`。按名字选 skill 时不分大小写（`filterSkills`）。所以目录里登记的 skill 名字要写成经它处理后一字不变的样子，安装器看的才是它落下的那个目录。
- 参数怎么读：`--skill`、`--agent` 会把后面不以 `-` 开头的词都收走；不以 `-` 开头、又没被它们收走的词是来源。所以来源要紧跟 `add`，来源和 skill 的名字都不能以 `-` 开头。

## 没有核对的

- Windows 和 Linux 上的表现；Windows 上经 `npx.cmd` 起它时参数的转义。
- 命令非零退出、`npx` 不在可执行路径上这两种真实情形（自动化测试里用假的执行器覆盖了结果行的写法）。
- 覆盖已有同名目录的真实情形（skills CLI 直接覆盖是 `skill-intake-analysis.md` 的试验 4 看到的；安装器在调用之前另问）。
