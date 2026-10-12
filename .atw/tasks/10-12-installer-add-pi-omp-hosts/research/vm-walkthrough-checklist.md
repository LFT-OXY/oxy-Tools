# 虚拟机走查清单：用真实的 Pi 和 omp 各走一遍

给维护者在发布 0.5.0 之前用。来源是 `prd.md`「Further Notes」第 7 条：那五项是读文档和源码推出来的，自动测试用的是假的 `pi`、`omp` 命令，**至今没有哪一项在真机上跑过**。每一项是下面的一步。

这份清单是代理写的，没有照着跑过。Pi 的命令和说法取自本机 pi 1.1.0 随包的 `docs/mcp.md`、`docs/skills.md`、`docs/slash-commands.md`（只读）；omp 没有随包文档，凡是「在 omp 里怎么看」的地方只写了要看到什么，具体入口以虚拟机里那一版 omp 为准。

## 准备

**要几台虚拟机**（或同一台上换着装、每换一次清一遍 `~/.agents`、`~/.pi`、`~/.omp`）：

| 代号 | 装着什么 | 用在哪几步 |
|------|----------|------------|
| A | 只有 omp，**没有 Pi**（可执行路径上没有 `pi`，主目录下没有 `.pi`） | 第 1 步 |
| B | omp 和 Claude Code | 第 2 步 |
| C | Pi | 第 3、4 步 |
| D | Windows，Pi（`npm install -g` 装的） | 第 5 步 |

A 上「没有 `.pi`」要紧：skills CLI 是拿 `~/.pi/agent` 在不在判断 Pi 装没装的，第 1 步要看的正是它不在时 `--agent pi` 还灵不灵。

**每台上都要有**：Node.js 22.13 以上、`git`、`npx`。

**把还没发布的 0.5.0 弄进虚拟机**，两种办法任选：

```bash
# 办法一：在虚拟机里从仓库构建（提交已经推送之后）
git clone https://github.com/LFT-OXY/oxy-Tools.git && cd oxy-Tools/cli
npm ci && npm run build
node dist/bin.js --version        # 应当是 0.5.0
# 之后每一步里的「启动安装器」就是：node <这个目录>/dist/bin.js --terminal

# 办法二：在开发机上打包，把 .tgz 拷进虚拟机
cd cli && npm run build && npm pack          # 得到 oxy-tools-0.5.0.tgz
# 虚拟机里：npm install -g ./oxy-tools-0.5.0.tgz，之后「启动安装器」就是 oxy-tools --terminal
```

下面都用终端界面（`--terminal`）：汇总里会把将要执行的命令完整列出来，走查要核对的正是它。目录照常从 GitHub 现拉；`main` 上的目录还没推送、或想用本地的那一份时，前面加 `OXY_TOOLS_CATALOG=<仓库根>`。

用到的条目（都是真实目录里的）：本仓库的 skill `pr`（在「推荐」里）；第三方 Skill `hallmark`（用途「UI 设计、图像与视频」，仓库里只有一个 skill）；MCP `memorix`（用途「上下文、记忆与 Token 优化」，不要 key）、`firecrawl-mcp`（用途「联网搜索与文档检索」，必填一个 key——走查时填一个假的值就行，比如 `fc-walkthrough`，看的是它有没有被带上，不看 MCP 连不连得上）。

## 第 1 步　只装了 omp 的机器上，`--agent pi` 仍把第三方 Skill 装进 `.agents/skills`（虚拟机 A）

为什么要看：skills CLI 不认识 omp，安装器借了 `pi` 这个 agent 名。

**敲什么**

```bash
command -v pi; ls -d ~/.pi 2>/dev/null      # 两条都应当没有输出
<启动安装器>
```

主菜单进「UI 设计、图像与视频」→ 装到哪里选「全局」→ 勾 `hallmark` → 确认。装完退出，再：

```bash
ls -la ~/.agents/skills/hallmark/SKILL.md
ls -d ~/.pi ~/.omp/agent/skills/hallmark 2>/dev/null
```

再在一个空的项目目录里走一遍，装到哪里选「项目」：

```bash
mkdir -p ~/walk-project && cd ~/walk-project && <启动安装器>
ls -la ~/walk-project/.agents/skills/hallmark/SKILL.md
```

**应当看到**

- 本机信息里 `omp ✓`，另外三个合成一句「Claude Code、Codex、Pi – 未检测到」；没有问装进哪个 AI Agent。
- 列表上方有那句「Codex、Pi、omp 共用同一个 skill 文件夹：装给一个，另外两个也看得到」。
- 汇总里宿主写的是 omp，位置是 `~/.agents/skills/hallmark`，「将执行的命令」是 `npx -y skills@1 add Nutlope/hallmark --skill hallmark --agent pi --yes --global`（装到项目的那一遍没有 `--global`，位置是 `.agents/skills/hallmark`）。
- 结果行「已安装」；两条 `ls` 的第一条都找得到 `SKILL.md`，它所在的是真实目录，不是符号链接。
- 第二条 `ls` 没有输出：skills CLI 没有因此建出 `~/.pi`，也没有往 omp 自己的目录里放东西。

**看到别的说明什么**

- 结果行「失败」，而 `~/.agents/skills/hallmark` 不存在：没装 Pi 时 skills CLI 不肯用 `pi` 这个 agent 名，或把它装到了别处（找一下 `find ~ -name SKILL.md -path '*hallmark*'`）。借名这条路不通，omp 的第三方 Skill 要回到 specify 重定——不要先发布。
- 装上了但落的是符号链接、或多出了 `~/.pi`：能用，但和规范写的不一样，记下来告诉代理改规范，或再议。
- skills CLI 的主版本不再是实测过的 1.7.x、参数变了：这一条连同 Claude Code、Codex 的第三方 Skill 都受影响，见 `.atw/spec/cli/skill-install.md` 的第二个 Scenario。

## 第 2 步　omp 读得到共用 skill 目录里的 skill；Claude Code 那边有同名的时它只用一份、不报错（虚拟机 B）

为什么要看：omp 既读 `.agents/skills`，也读 Claude Code 的 `.claude/skills`；ADR-0005 的后果里写了「由 omp 自己取舍」，安装器不为此做什么。

**敲什么**

```bash
<启动安装器>
```

「装进哪些 AI Agent」先去掉 Claude Code、只留 omp → 进「推荐」→ 全局 → 勾 `pr` → 确认。退出后启动 `omp`，看它加载了哪些 skill，试着让它用一次 `pr`。

然后再启动安装器一次，这回 Claude Code 和 omp 都留着，同样装 `pr`。退出后：

```bash
ls ~/.claude/skills/pr/SKILL.md ~/.agents/skills/pr/SKILL.md     # 两份都在
omp        # 再看一遍它的 skill
```

**应当看到**

- 第一遍：汇总和结果各一行，宿主是 omp，位置 `~/.agents/skills/pr`；omp 的 skill 里有 `pr`，用得起来。
- 第二遍：汇总和结果各两行（Claude Code 一行、omp 一行），合计「2 成功」；omp 启动不报错，`pr` 仍只当一个 skill 用——另一份被它标成让位的那一个（调研时在它的程序文件里看到的说法是 `Shadowed by another source`）。

**看到别的说明什么**

- 第一遍 omp 里找不到 `pr`：omp 不读 `~/.agents/skills`，ADR-0005 的前提不成立，整件事要回到 specify。先确认是不是这一版 omp 把这个来源关了（它的设置里有没有 skill 的发现来源一项）。
- 第二遍 omp 启动报错，或同一个 skill 出现两次并且都生效：要把「同时装给 Claude Code 和 omp」这种情形的处理提上来（现在是 Out of Scope）；至少在 README 里提醒。

## 第 3 步　Pi 读得到共用 skill 目录里的 skill（虚拟机 C）

**敲什么**

```bash
<启动安装器>            # 进「推荐」→ 全局 → 勾 pr → 确认
ls ~/.agents/skills/pr/SKILL.md ~/.agents/skills/pr/.oxy-tools.json; ls ~/.pi/agent/skills 2>/dev/null
pi                      # 启动后看启动时的诊断信息，再输入 /skill:pr
```

再在项目目录里装到「项目」走一遍，然后在那个目录下启动 `pi`：

```bash
cd ~/walk-project && <启动安装器>      # 装到哪里选「项目」
ls ~/walk-project/.agents/skills/pr/SKILL.md
pi
```

**应当看到**

- 汇总里宿主是 Pi，位置 `~/.agents/skills/pr`（项目的是 `.agents/skills/pr`）；结果「已安装 1.0.0」；目录里有 `SKILL.md` 和安装标记 `.oxy-tools.json`。
- Pi 启动时的诊断里没有关于 `pr` 的报错，`/skill:pr` 认得、能加载。
- `~/.pi/agent/skills` 下没有 `pr`：安装器没有碰 Pi 自己的目录。
- 再启动一次安装器，列表里 `pr` 在 Pi 那一栏是「已装 1.0.0」。

**看到别的说明什么**

- Pi 里没有 `pr`：先 `/reload` 再看；仍没有的话是 Pi 不读 `.agents/skills`（它的 `docs/skills.md` 写着支持），ADR-0005 的前提不成立。
- 项目目录里那一遍，Pi 要先信任这个项目才读项目里的 skill——它问的话照答，答完再看。

## 第 4 步　`pi mcp add` 和 `pi mcp remove`：全局的、带 `-l` 的、带 `--env` 的；装到项目后启动 `pi` 时它确实问要不要信任（虚拟机 C）

为什么要看：这几条命令是照 Pi 的文档和它解析 `mcp` 子命令的源码拼的，一条都没有执行过。

**4a 全局，不带 key**

```bash
<启动安装器>            # 进「上下文、记忆与 Token 优化」→ 全局 → 勾 memorix → 确认
cat ~/.pi/agent/mcp.json
pi mcp list
```

应当看到：「将执行的命令」是 `pi mcp add memorix -- npx -y memorix serve`；结果「已配置」；`mcp.json` 顶层的 `mcpServers` 里有 `memorix`，`command` 是 `npx`、`args` 是 `["-y","memorix","serve"]`；`pi mcp list` 列得出它。

**4b 全局，再装一次（这一步走到 `pi mcp remove`）**

```bash
<启动安装器>            # 同一个用途，memorix 这一行在 Pi 那一栏应当是「已配置」；再勾它 → 确认
```

应当看到：汇总里这一行的操作是「覆盖」、备注「已配置，先移除再添加」，「将执行 2 条命令」，先 `pi mcp remove memorix`，再 `pi mcp add memorix -- npx -y memorix serve`；结果「已配置」；`mcp.json` 里仍只有一个 `memorix`。

**4c 全局，带 key（`--env`）**

```bash
<启动安装器>            # 进「联网搜索与文档检索」→ 全局 → 勾 firecrawl-mcp → 问 key 时填 fc-walkthrough → 确认
grep -n 'fc-walkthrough' ~/.pi/agent/mcp.json
```

应当看到：「将执行的命令」里是 `pi mcp add firecrawl-mcp --env FIRECRAWL_API_KEY=<FIRECRAWL_API_KEY> -- npx -y firecrawl-mcp`（尖括号那一段是占位符，不是真实的值），下面有一句「注意  key 以占位符显示，执行时才代入真实的值」；终端上从头到尾搜不到 `fc-walkthrough`；`mcp.json` 里 `firecrawl-mcp` 的 `env.FIRECRAWL_API_KEY` 正好是 `fc-walkthrough`。

**4d 项目（`-l`），以及信任**

```bash
cd ~/walk-project && <启动安装器>      # 「上下文、记忆与 Token 优化」→ 装到哪里选「项目」→ 勾 memorix → 确认
cat ~/walk-project/.pi/mcp.json
pi                                     # 就在这个目录下启动
```

应当看到：列表里 `memorix` 在 Pi 那一栏是「未配置」（看的是项目的那一份，全局配过的不算）；「将执行的命令」是 `pi mcp add memorix -l -- npx -y memorix serve`；汇总下面有一句「注意  Pi 的 MCP 写进当前目录的 .pi/mcp.json，要你批准之后才启用：在这个目录下启动 pi 时它会问」；`~/walk-project/.pi/mcp.json` 里有 `memorix`，`~/.pi/agent/mcp.json` 没有因此多东西；**启动 `pi` 时它问要不要信任这个项目**，答应之后 `/mcp` 里看得到项目的这一个。

再装一次（走到带 `-l` 的移除）：汇总里是「覆盖」，两条命令是 `pi mcp remove memorix -l` 和 `pi mcp add memorix -l -- npx -y memorix serve`。

带 key 的也在项目里装一遍（`firecrawl-mcp`）：汇总下面另有一句「注意  FIRECRAWL_API_KEY 会以明文写进 .pi/mcp.json，不要提交，也不要发给别人」；命令是 `pi mcp add firecrawl-mcp -l --env FIRECRAWL_API_KEY=<FIRECRAWL_API_KEY> -- npx -y firecrawl-mcp`。

**看到别的说明什么**（这一步各小节通用）

- 结果行「失败 添加命令退出状态 N」：Pi 不认这条命令的写法。在终端里把那一条原样敲一遍（占位符那一段换成值），看 Pi 自己报什么——多半是选项的位置（`-l`、`--env` 要在名字后面、`--` 前面）或这一版 Pi 改了参数。把 Pi 的版本和它的报错交给代理，改 `cli/src/hosts.ts` 的 `piMcpCommands`。
- 结果「已配置」但 `mcp.json` 里没有、或写到了另一个文件：安装器只看命令的退出状态，没有复核；记下实际写到了哪。带 `-l` 的写到了全局那一份，说明 Pi 的 `-l` 不是照运行目录定的。
- 4b「移除」那一条失败、这一项标成失败：`pi mcp remove` 的写法或退出状态和文档不一样；`pi mcp add` 遇到同名的本来就是替换，可以考虑对 Pi 不先移除——交给代理。
- 4c 里 `mcp.json` 的值不是原样：Pi 读配置时会展开值里的 `${名字}`、把以 `!` 开头的值当命令执行（`.atw/spec/cli/mcp-install.md` 记为已知的出入），但写进文件的应当是原样。
- 4d 启动 `pi` 时没有问信任：安装器那句提醒说得不对，要改文案；先确认这个项目是不是之前已经信任过（换一个新目录再试）。

## 第 5 步　Windows 上 `pi` 命令能不经 shell 起来（虚拟机 D）

为什么要看：安装器起宿主的命令不经过 shell；npm 装出来的 `pi` 在 Windows 上是 `pi.cmd`，靠 `cross-spawn` 去找它、替它转义参数。Claude Code 和 Codex 走的是同一条路，Pi 没有试过。

**敲什么**（PowerShell 或 cmd，不是 WSL）

```powershell
where.exe pi                 # 应当列出 pi.cmd
<启动安装器>                 # 「上下文、记忆与 Token 优化」→ 全局 → 勾 memorix → 确认
type $HOME\.pi\agent\mcp.json
```

**应当看到**

- 本机信息里 `Pi ✓`（检测靠的是 `PATHEXT` 里的扩展名，认得 `pi.cmd`）。
- 结果「已配置」，`mcp.json` 里有 `memorix`，`args` 是分开的三项，没有被拼成一个字符串，也没有多出引号。
- 顺带装一遍 4c（带 key 的）：值里没有多出转义用的 `^` 或引号。

**看到别的说明什么**

- 本机信息里 Pi「未检测到」而 `where.exe pi` 找得到：检测没有认出它的扩展名，看 `echo $env:PATHEXT`。
- 结果行「失败 添加命令没能运行（ENOENT）」：不经 shell 起不来 `pi.cmd`，Windows 上 Pi 的 MCP 装不了——发布前要修，或在 README 里写明。
- 装上了但 `args` 不对：参数转义出了问题，把 `mcp.json` 里的样子交给代理。

## 走完之后

每一步记三样：虚拟机里宿主的版本（`pi --version`、`omp --version`）、看到的和上面写的是否一致、不一致时的原样输出。五步都一致就可以发布（命令在 `final-check-record.md` 的末尾）；第 1、2、3 步有不一致的，先不要发布。
