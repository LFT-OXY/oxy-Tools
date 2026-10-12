# 虚拟机走查清单：用真实的 Pi 和 omp 各走一遍

> **只在虚拟机里做，不要在平时用的机器上做。** 下面每一步都会真的往主目录里写东西（`~/.agents/skills`、`~/.claude/skills`），第 4、5 步还会真的改 Pi 的配置（`~/.pi/agent/mcp.json`、项目目录里的 `.pi/mcp.json`）。

给维护者在发布 0.5.0 之前用。来源是 `prd.md`「Further Notes」第 7 条：那五项是读文档和源码推出来的，自动测试用的是假的 `pi`、`omp` 命令，没有哪一项在装着真实 Pi、omp 的机器上跑过。每一项是下面的一步。

这份清单是代理写的，**没有照着跑过**。里面引的界面上的话（提问、表头、提醒、结果）是照 `cli/src/messages.ts` 和界面预览页的原文抄的；Pi 的命令取自本机 pi 1.1.0 随包的 `docs/mcp.md`、`docs/skills.md`、`docs/slash-commands.md`（只读）；omp 没有随包文档，「在 omp 里怎么看」见第 2 步里的说明。

## 准备

**要几台虚拟机**

| 代号 | 装着什么 | 用在哪几步 |
|------|----------|------------|
| A | 只有 omp，**没有 Pi**（可执行路径上没有 `pi`，主目录下没有 `.pi`） | 第 1 步 |
| B | omp 和 Claude Code | 第 2 步 |
| C | Pi | 第 3、4 步 |
| D | Windows，Pi（`npm install -g` 装的） | 第 5 步 |

A 上「没有 `.pi`」要紧：skills CLI 是拿 `~/.pi/agent` 在不在判断 Pi 装没装的，第 1 步要看的正是它不在时 `--agent pi` 还灵不灵。

最省事的是每台各用一个干净的快照。**想在同一台上换着做，每换一步先把上一步留下的东西清掉**：

- `~/.agents`（共用 skill 目录）、`~/.claude/skills/pr`（第 2 步装给 Claude Code 的那一份）；
- 各步自己建的项目目录：`~/walk-1-project`、`~/walk-3-project`、`~/walk-4-project`；
- 第 4 步写进 Pi 配置的两个 MCP：`pi mcp remove memorix`、`pi mcp remove firecrawl-mcp`；
- 要变成「没有 Pi」的 A：卸掉 Pi，并删掉 `~/.pi`——**这会连 Pi 的登录和设置一起删掉**，所以只在虚拟机里这样做。`~/.omp` 不用清：安装器不碰它。

**每台上都要有**：Node.js 22.13 以上、`git`、`npx`。

**把还没发布的 0.5.0 弄进虚拟机**，两种办法任选：

```bash
# 办法一：在虚拟机里从仓库构建（提交已经推送之后）
git clone https://github.com/LFT-OXY/oxy-Tools.git && cd oxy-Tools/cli
npm ci && npm run build
node dist/bin.js --version        # 应当是 0.5.0

# 办法二：在开发机上打包，把 .tgz 拷进虚拟机
cd cli && npm run build && npm pack          # 得到 oxy-tools-0.5.0.tgz
# 虚拟机里：npm install -g ./oxy-tools-0.5.0.tgz
```

下面写 **`<启动安装器>`** 的地方，办法一是 `node <oxy-Tools 所在的目录>/cli/dist/bin.js --terminal --lang zh`，办法二是 `oxy-tools --terminal --lang zh`。`--terminal` 是用终端里的菜单（它会把将要执行的命令完整列出来，走查要核对的正是它），`--lang zh` 是直接用中文、不问语言。目录照常从 GitHub 现拉。

**在菜单里怎么走**（每一步都一样，下面只写每一问选什么）：

1. 「选择用途」——上下键移到那一行，回车。
2. 「装进哪些 AI Agent」——**只在检测到不止一个宿主时才问**，都勾着；要去掉哪个，移到它上面按空格，再回车。
3. 「装到哪里」——「全局」或「项目」，回车。
4. 「选择要安装的条目」——移到条目上按空格勾上，回车。
5. 要 key 的 MCP 这时问 key——输入不显示，粘贴后回车。
6. 屏幕上打出「将安装 N 项」的汇总和「将执行 N 条命令」，然后问「开始安装吗」——选「开始安装」回车。
7. 装完打出「结果」和「合计」，回到「选择用途」——选最下面的「退出」。

用到的条目（都是真实目录里的）：本仓库的 skill `pr`（在「推荐」里）；第三方 Skill `hallmark`（用途「UI 设计、图像与视频」）；MCP `memorix`（用途「上下文、记忆与 Token 优化」，不要 key）、`firecrawl-mcp`（用途「联网搜索与文档检索」，必填一个 key——走查时填一个假的值 `fc-walkthrough` 就行，看的是它有没有被带上，不看 MCP 连不连得上）。

## 第 1 步　只装了 omp 的机器上，`--agent pi` 仍把第三方 Skill 装进 `.agents/skills`（虚拟机 A）

**这一步在验证什么**：装第三方 Skill 用的那个程序（skills CLI）不认识 omp，安装器替 omp 借了「pi」这个名字去装。要确认在一台根本没装 Pi 的机器上，借这个名字照样能把东西装到 omp 读得到的地方。

代理 2026-10-12 在本机的隔离环境里试过一次（假的 `omp` 命令、临时主目录里没有 `.pi`、skills CLI 1.7.2）：全局和项目两条命令都把 `hallmark` 装进了 `.agents/skills`，是真实目录，没有建出 `.pi`。虚拟机里要确认的是装着真实 omp 的机器上也是这样。

**敲什么**

先确认这台机器上确实没有 Pi（两条都应当没有输出）：

```bash
command -v pi; ls -d ~/.pi 2>/dev/null
```

装到全局——启动安装器，把 `hallmark` 装上：

```bash
<启动安装器>
```

「选择用途」选「UI 设计、图像与视频」→「装到哪里」选「全局」→「选择要安装的条目」勾 `hallmark` →「开始安装吗」选「开始安装」→ 装完选「退出」。然后看它落在哪（第一条看装没装上，第二条看有没有多出不该有的东西）：

```bash
ls -la ~/.agents/skills/hallmark/SKILL.md
ls -d ~/.pi ~/.omp/agent/skills/hallmark 2>/dev/null
```

装到项目——建一个空目录，在里面再走一遍，「装到哪里」这回选「项目」：

```bash
mkdir -p ~/walk-1-project && cd ~/walk-1-project
<启动安装器>
ls -la ~/walk-1-project/.agents/skills/hallmark/SKILL.md
```

**应当看到**

- 最上面的本机信息里是 `AI Agent  omp ✓   Claude Code、Codex、Pi – 未检测到`，下面一行「注意      没有检测到 Claude Code、Codex、Pi，已跳过；组件只装进 omp」；**没有**问「装进哪些 AI Agent」。
- 列表上方有一行「注意      Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到」。
- 「将安装 1 项」下面那一行是 `hallmark   omp   新装   ~/.agents/skills/hallmark`；「将执行 1 条命令」下面是 `npx -y skills@1 add Nutlope/hallmark --skill hallmark --agent pi --yes --global`。装到项目的那一遍命令末尾没有 `--global`，位置是 `.agents/skills/hallmark`。
- 「结果」里是 `✓  hallmark   omp   已安装`，「合计      1 成功 · 0 失败 · 0 跳过」。
- 两条看 `SKILL.md` 的 `ls` 都找得到它；它所在的 `hallmark` 是真实的文件夹，不是符号链接（`ls -la` 那一行开头不是 `l`）。
- 第二条 `ls` 没有输出：没有因此多出 `~/.pi`，omp 自己的目录里也没有被放东西。
- 项目目录里另有一个 `skills-lock.json`，是 skills CLI 自己写的，正常。

**看到别的说明什么**

- 「结果」里是 `✗  hallmark   omp   失败 …`（后面写着「安装命令已结束，但目标位置没有 SKILL.md」或「安装命令退出状态 N」），`~/.agents/skills/hallmark` 也不存在：没装 Pi 时 skills CLI 不肯用「pi」这个名字，或把它装到了别处（找一下：`find ~ -name SKILL.md -path '*hallmark*'`）。借名这条路不通，omp 的第三方 Skill 要重新定——**先不要发布**。
- 装上了，但 `hallmark` 是符号链接，或多出了 `~/.pi`：能用，但和规范写的不一样，记下来告诉代理。
- 屏幕上的命令和上面写的不一样：把屏幕上的那一条原样记下来。

## 第 2 步　omp 读得到共用 skill 目录里的 skill；Claude Code 那边有同名的时它只用一份、不报错（虚拟机 B）

**这一步在验证什么**：安装器把 omp 的 skill 装进 `~/.agents/skills`，前提是 omp 真的会去读这个文件夹。另外 omp 也读 Claude Code 的文件夹，两边都装了同名的 skill 时，要确认 omp 不出错、只当一个用。

**在 omp 里怎么看它认了哪些 skill**：代理没有查到 omp 的文档，下面两个办法里**第一个不靠任何 omp 的命令，以它为准**。

- **不靠命令的判法**：启动 `omp`，直接对它说「你现在能用哪些 skill？把名字和各自的文件路径列出来」，再说「用 pr 这个 skill，给我当前的改动写一段 PR 描述」。它列出了 `pr`、路径在 `~/.agents/skills/pr` 下，并且照着这个 skill 做了，就是读到了。
- **可能有的命令**（从本机 omp 18.8.7 的程序文件里读到的字样，**没有运行过**，虚拟机里那一版不一定有）：`/extensions`（说明写的是 Open Extension Control Center dashboard，打开一个列出各种扩展和 skill 的面板——调研时看到的「Shadowed by another source」这个标注就出在这种面板里）；`/skill:pr`（把 skill 当命令直接叫，要 omp 的设置里开着这一项才有）。命令不存在就用上一条。

**敲什么**

第一遍，只装给 omp——把 `pr` 装进共用 skill 目录：

```bash
<启动安装器>
```

「选择用途」选「推荐」→「装进哪些 AI Agent」里移到 Claude Code 上按空格去掉它、只留 omp，回车 →「装到哪里」选「全局」→ 勾 `pr` →「开始安装」→「退出」。然后看文件在不在，再到 omp 里看：

```bash
ls ~/.agents/skills/pr/SKILL.md
omp
```

第二遍，Claude Code 和 omp 都装——让两边各有一份同名的 `pr`：

```bash
<启动安装器>
```

这回「装进哪些 AI Agent」两个都留着，直接回车，其余同上。然后看两份都在，再到 omp 里看一遍：

```bash
ls ~/.claude/skills/pr/SKILL.md ~/.agents/skills/pr/SKILL.md
omp
```

**应当看到**

- 第一遍：「将安装 1 项」下面是 `pr   omp   新装   ~/.agents/skills/pr`；「结果」里 `✓  pr   omp   已安装 1.0.0`；omp 里认得 `pr`，叫得动。
- 第二遍：「将安装 1 项」下面是两行——`pr   Claude Code   新装   ~/.claude/skills/pr`，和 `omp   覆盖   ~/.agents/skills/pr`（备注「重装 1.0.0」，因为第一遍装过）；下面有一行「注意      覆盖即整目录替换，目录内的本地改动会丢失」；「结果」两行都是「已安装 1.0.0」，「合计      2 成功 · 0 失败 · 0 跳过」。
- 第二遍之后 omp 启动不报错，`pr` 仍只当一个 skill 用（另一份被它标成让位的那一个）。

**看到别的说明什么**

- 第一遍 omp 里没有 `pr`，而 `~/.agents/skills/pr/SKILL.md` 明明在：omp 不读这个文件夹，「Pi 和 omp 的 skill 装进共用 skill 目录」这个决定（ADR-0005）的前提不成立，整件事要重新定——**先不要发布**。先看一眼是不是这一版 omp 的设置里把这个来源关了。
- 第二遍 omp 启动报错，或它把 `pr` 当成两个 skill、两个都生效：要把「同时装给 Claude Code 和 omp」怎么处理提上来（现在写明不处理），至少在说明文档里提醒。

## 第 3 步　Pi 读得到共用 skill 目录里的 skill（虚拟机 C）

**这一步在验证什么**：安装器把 Pi 的 skill 也装进 `~/.agents/skills`（不是 Pi 自己的 `~/.pi/agent/skills`），要确认 Pi 真的会去读这个文件夹，装到项目里的那一份它也读。

**敲什么**

装到全局——把 `pr` 装上：

```bash
<启动安装器>
```

「选择用途」选「推荐」→「装到哪里」选「全局」→ 勾 `pr` →「开始安装」→「退出」。看文件落在哪、Pi 自己的文件夹里有没有被放东西，再启动 Pi 试着叫这个 skill：

```bash
ls -a ~/.agents/skills/pr
ls ~/.pi/agent/skills 2>/dev/null
pi
```

在 Pi 里输入 `/skill:pr`（Pi 的文档里把 skill 当命令叫的写法）。

装到项目——建一个空目录，在里面再走一遍，「装到哪里」选「项目」，然后就在这个目录里启动 Pi：

```bash
mkdir -p ~/walk-3-project && cd ~/walk-3-project
<启动安装器>
ls ~/walk-3-project/.agents/skills/pr/SKILL.md
pi
```

**应当看到**

- 本机信息里是 `AI Agent  Pi ✓   Claude Code、Codex、omp – 未检测到`；没有问「装进哪些 AI Agent」。
- 「将安装 1 项」下面是 `pr   Pi   新装   ~/.agents/skills/pr`（项目的那一遍位置是 `.agents/skills/pr`）；「结果」里 `✓  pr   Pi   已安装 1.0.0`。
- `~/.agents/skills/pr` 里有 `SKILL.md` 和 `.oxy-tools.json`（本工具的安装标记）。
- `~/.pi/agent/skills` 下没有 `pr`：安装器没有碰 Pi 自己的文件夹。
- Pi 启动时没有关于 `pr` 的报错，`/skill:pr` 认得、能加载。项目目录里那一遍，Pi 可能先问要不要信任这个项目——答应之后再试 `/skill:pr`。
- 再启动一次安装器进「推荐」，列表里 `pr` 那一行在「Pi」一栏写着「已装 1.0.0」。

**看到别的说明什么**

- Pi 里没有 `pr`：先输入 `/reload` 再试；仍没有，就是 Pi 不读 `~/.agents/skills`（它的文档写着支持），ADR-0005 的前提不成立——**先不要发布**。
- `~/.pi/agent/skills` 下多出了 `pr`：安装器装错了地方，把 `ls` 的输出交给代理。

## 第 4 步　`pi mcp add` 和 `pi mcp remove`：全局的、带 `-l` 的、带 `--env` 的；装到项目后启动 `pi` 时它确实问要不要信任（虚拟机 C）

**这一步在验证什么**：安装器装 Pi 的 MCP 是替你敲 Pi 自己的命令。这几条命令是照 Pi 的文档拼的，一条都没有真的执行过；要确认真实的 Pi 认它们，写进去的配置是对的。

**4a　装到全局，不要 key 的**——让安装器执行一条最简单的添加命令，再看 Pi 的配置里有没有：

```bash
<启动安装器>
cat ~/.pi/agent/mcp.json
pi mcp list
```

「选择用途」选「上下文、记忆与 Token 优化」→「装到哪里」选「全局」→ 勾 `memorix` →「开始安装」→「退出」。

应当看到：列表里 `memorix` 那一行在「Pi」一栏是「未配置」；「将安装 1 项」下面是 `memorix   Pi   新装`；「将执行 1 条命令」下面是 `pi mcp add memorix -- npx -y memorix serve`；「结果」里 `✓  memorix   Pi   已配置`。`mcp.json` 的 `mcpServers` 里有 `memorix`，`command` 是 `npx`，`args` 是 `-y`、`memorix`、`serve` 三项；`pi mcp list` 列得出它。

**4b　同一个再装一次**——已经配过的，安装器会先移除再添加，这样就用到了移除命令：

```bash
<启动安装器>
cat ~/.pi/agent/mcp.json
```

选的和 4a 一样。

应当看到：列表里 `memorix` 在「Pi」一栏已经是「已配置」；「将安装 1 项」下面是 `memorix   Pi   覆盖   已配置，先移除再添加`；「将执行 2 条命令」，第 1 条 `pi mcp remove memorix`，第 2 条 `pi mcp add memorix -- npx -y memorix serve`；「结果」里「已配置」。`mcp.json` 里仍只有一个 `memorix`。

**4c　装到全局，要 key 的**——看 key 有没有被原样带进 Pi 的配置，又没有显示在屏幕上：

```bash
<启动安装器>
grep -n 'fc-walkthrough' ~/.pi/agent/mcp.json
```

「选择用途」选「联网搜索与文档检索」→「全局」→ 勾 `firecrawl-mcp` → 出现「firecrawl-mcp 需要 key」和提问 `? FIRECRAWL_API_KEY (输入不显示，粘贴后回车)` 时输入 `fc-walkthrough` 回车 →「开始安装」→「退出」。

应当看到：填完之后那一问收成一行 `✓ FIRECRAWL_API_KEY · 已填写`；「将执行 1 条命令」下面是 `pi mcp add firecrawl-mcp --env FIRECRAWL_API_KEY=<FIRECRAWL_API_KEY> -- npx -y firecrawl-mcp`（尖括号那一段是占位符，不是你填的值），再下面一行「注意      key 以占位符显示，执行时才代入真实的值」；整个屏幕上找不到 `fc-walkthrough`。`grep` 找得到它：在 `mcp.json` 里 `firecrawl-mcp` 的 `env` 下，`FIRECRAWL_API_KEY` 的值正好是 `fc-walkthrough`。

**4d　装到项目，以及信任**——换一个**从没用 Pi 打开过的新目录**（第 3 步的那个 Pi 已经信任过，不能用），看带 `-l` 的命令把配置写进这个目录，以及在这里启动 Pi 时它会不会问：

```bash
mkdir -p ~/walk-4-project && cd ~/walk-4-project
<启动安装器>
cat ~/walk-4-project/.pi/mcp.json
pi
```

「选择用途」选「上下文、记忆与 Token 优化」→「装到哪里」选「项目」→ 勾 `memorix` →「开始安装」→「退出」。

应当看到：列表里 `memorix` 在「Pi」一栏是「未配置」（装到项目时看的是这个目录里的那一份，4a 在全局配过的不算）；「将执行 1 条命令」下面是 `pi mcp add memorix -l -- npx -y memorix serve`；再下面一行「注意      Pi 的 MCP 写进当前目录的 .pi/mcp.json，要你批准之后才启用：在这个目录下启动 pi 时它会问」（一行放不下时折成两行）。`~/walk-4-project/.pi/mcp.json` 里有 `memorix`。**在这个目录里启动 `pi` 时，它问要不要信任这个项目**；答应之后在 Pi 里输入 `/mcp`，看得到 `memorix`。

在同一个目录里再做两遍：

- 再装一次 `memorix`（用到带 `-l` 的移除）：「将执行 2 条命令」是 `pi mcp remove memorix -l` 和 `pi mcp add memorix -l -- npx -y memorix serve`。
- 装 `firecrawl-mcp`（用途「联网搜索与文档检索」，「装到哪里」选「项目」，key 同样填 `fc-walkthrough`）：命令是 `pi mcp add firecrawl-mcp -l --env FIRECRAWL_API_KEY=<FIRECRAWL_API_KEY> -- npx -y firecrawl-mcp`；下面多一行「注意      FIRECRAWL_API_KEY 会以明文写进 .pi/mcp.json，不要提交，也不要发给别人」。

**看到别的说明什么**（4a 到 4d 通用）

- 「结果」里是 `✗  memorix   Pi   失败 添加命令退出状态 N`：Pi 不认这条命令的写法。把屏幕上「将执行 N 条命令」里的那一条原样在终端里敲一遍（占位符那一段换成值），看 Pi 自己报什么，连同 `pi --version` 交给代理。
- 「失败 添加命令没能运行（ENOENT）」：安装器找不到 `pi` 这个命令，看 `command -v pi`。
- 4b 里是「失败 移除命令退出状态 N；未执行添加」：`pi mcp remove` 的写法或表现和文档不一样，交给代理。
- 「结果」写着「已配置」，但 `mcp.json` 里没有、或写到了另一个文件：安装器只看命令成没成功，没有再去核对文件。记下实际写到了哪——带 `-l` 的写进了 `~/.pi/agent/mcp.json`，说明 Pi 的 `-l` 不是照当前目录定的。
- 4c 里 `mcp.json` 里的值不是 `fc-walkthrough` 原样：交给代理。
- 4d 启动 `pi` 时没有问信任：安装器那句提醒说得不对，要改文案。先确认这个目录确实是新建的、之前没在里面开过 Pi。

## 第 5 步　Windows 上 `pi` 命令能不经 shell 起来（虚拟机 D）

**这一步在验证什么**：Windows 上用 npm 装的 `pi` 其实是一个叫 `pi.cmd` 的小脚本，安装器起它的办法和起一个普通程序不一样。要确认在 Windows 上安装器既认得出 Pi，也真的能替你执行它的命令。

**敲什么**（在 **PowerShell** 里，不是 cmd，也不是 WSL）

先看 Pi 的命令在哪，再启动安装器装一个 MCP，最后看 Pi 的配置：

```powershell
where.exe pi
<启动安装器>
Get-Content $HOME\.pi\agent\mcp.json
```

Windows 上办法一的 `<启动安装器>` 是 `node <oxy-Tools 所在的目录>\cli\dist\bin.js --terminal --lang zh`。菜单里选的和 4a 一样：「上下文、记忆与 Token 优化」→「全局」→ 勾 `memorix` →「开始安装」→「退出」。

然后照 4c 再装一遍 `firecrawl-mcp`（key 填 `fc-walkthrough`），再看一次配置：

```powershell
Get-Content $HOME\.pi\agent\mcp.json
```

**应当看到**

- `where.exe pi` 列出的里面有一条以 `pi.cmd` 结尾。
- 本机信息里是 `Pi ✓`。
- 两遍的「结果」都是「已配置」。`mcp.json` 里 `memorix` 的 `args` 是分开的三项 `-y`、`memorix`、`serve`，没有被拼成一个字符串，也没有多出引号；`firecrawl-mcp` 的 `FIRECRAWL_API_KEY` 正好是 `fc-walkthrough`，没有多出 `^` 或引号。

**看到别的说明什么**

- 本机信息里 Pi 写着「未检测到」，而 `where.exe pi` 找得到：安装器没有认出 `pi.cmd`，把 `$env:PATHEXT` 的输出交给代理。
- 「失败 添加命令没能运行（ENOENT）」：安装器起不来 `pi.cmd`，Windows 上 Pi 的 MCP 装不了——**发布前要修**，或在说明文档里写明。
- 装上了但 `args` 或 key 的值不对：把 `mcp.json` 里的样子交给代理。

## 走完之后

每一步记三样：虚拟机里宿主的版本（`pi --version`、`omp --version`）、看到的和上面写的是否一致、不一致时屏幕上的原样。五步都一致就可以接着发布（先后和命令在 `final-check-record.md` 的末尾）；第 1、2、3 步里标了「先不要发布」的任何一条出现了，就先停下。
