# 工单 10 的手动核对：真实的 skills CLI 不带全局选项时落在哪

> 2026-10-11，macOS，Node 24.15.0，`skills@1` 当时解析到的版本（工单 09 核对时是 1.7.2）。主会话亲自跑的，没有交给子代理。
> 全程在 `mktemp -d` 建的临时目录里：`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`XDG_CONFIG_HOME`、`XDG_STATE_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`npm_config_cache` 都在起脚本的 shell 里指到它，脚本开头逐个断言。

## 要核对的

规格和工单 10 里写的是推断：「skills CLI 不带全局选项时装进当前目录，Claude Code 落在 `.claude/skills`，Codex 落在 `.agents/skills`」。访谈记录里明说这一条没有实测过。两个宿主适配的 `projectSkillsDir` 照这个推断写的，所以要拿真的跑一遍对上。

## 做了什么

1. `cd cli && npm run build`。
2. 一个小脚本（放在临时目录里，不进仓库）从 `dist/` 里取安装器自己的四样东西来用，不另抄一份：`detectHosts(env, home, project)` 给出两个宿主；`skillsCliCommand('emilkowalski/skills', 'animate', host, 'project')` 拼命令；`installThirdPartySkill(command, host, systemCommandRunner(), check, project)` 用真实的外部命令执行器执行、把运行目录指到项目目录；复核用 `hasSkillFile(host.projectSkillsDir, 'animate')`。来源和 skill 与工单 09 的核对用的是同一个。
3. `CLAUDE_CONFIG_DIR` 仍然故意指到一个不是 `<HOME>/.claude` 的目录（`<临时目录>/claude-config`）。
4. 跑了两遍。第一遍脚本就是在项目目录里起的，分不出落点跟的是进程的当前目录还是执行器收到的 `cwd`；所以**第二遍换到另一个目录起脚本**（放脚本的那个目录），项目目录另用一个新的空目录，只靠执行器的 `cwd` 把命令指过去。

## 结果

| 核对什么 | 结果 |
|----------|------|
| 执行的命令 | `npx -y skills@1 add emilkowalski/skills --skill animate --agent claude-code --yes`，以及 `--agent codex` 的那一条；都没有 `--global`，都在项目目录下运行 |
| 命令的结局 | 两条都以 0 退出，复核都通过（`{"installed":true,"run":{"kind":"exit","code":0}}`） |
| Claude Code 的落点 | `<项目目录>/.claude/skills/animate/SKILL.md` 在，是真实目录，不是符号链接——与 `projectSkillsDir` 一致 |
| Codex 的落点 | `<项目目录>/.agents/skills/animate/SKILL.md` 在，是真实目录，不是符号链接——与 `projectSkillsDir` 一致 |
| 主目录 | 是空的：`<HOME>/.claude`、`<HOME>/.agents` 都没有建 |
| `CLAUDE_CONFIG_DIR` 指的目录 | 是空的 |
| 状态目录 | `<XDG_STATE_HOME>` 是空的：装到项目时它不写全局的 `skills/.skill-lock.json` |
| **它另外写了什么** | **项目目录里多了一个 `skills-lock.json`**（在项目目录的最上层，和 `.claude`、`.agents` 并排）。这是 skills CLI 自己记装了哪些 skill 的文件；安装器不读它、不清它，汇总里也没有提到它 |
| 对照：从别的目录起脚本 | 两个 skill 目录和 `skills-lock.json` 都落在 `cwd` 指的那个项目目录里；起脚本的目录里除了脚本自己什么都没多。**落点跟的是执行器的 `cwd`**，`systemCommandRunner` 把它交到了子进程 |
| 真实的主目录 | 运行前后各取一次 `ls -la ~/.claude/skills ~/.agents/skills`，外加 `~/.agents/.skill-lock.json`、`~/.local/state/skills` 在不在，合起来的哈希前后相同（`243b7b12…`）；运行前确认过两处都没有 `animate` |

## 没有核对的

- `CLAUDE_CONFIG_DIR` 不清空时，装到项目会不会受它影响。安装器调用时一律把它清空（两种安装范围带的是同一份环境变量），所以这一条不影响安装器；用户照着汇总里的命令自己跑时会不会不同，不知道。
- Windows 和 Linux 上的表现。
- 经安装器的整条交互流程（伪终端里选「项目」再装）没有用真实的 `npx` 走；提问、汇总、结果这一段由自动化测试和界面预览页盖着，它们用的是假的执行器。
