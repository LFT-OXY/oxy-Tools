# 「汇总」文档里 21 个 MCP 条目的试通记录

> 工单 03。2026-10-10 在维护者的 macOS 本机做，全部在 `mktemp -d` 的临时目录里。
> 版本：Claude Code 2.1.295、codex-cli 0.162.0、Node 24.15.0。
> 每条的连接方式取自它官方仓库 `main`（或默认分支）当天的 README；context7 另取了它官方文档的「MCP Clients」页（https://context7.com/docs/resources/all-clients ）。

## 结论

21 个条目，11 个登记为 MCP（`catalog.json` 的 `mcps`），10 个登记为外部项目（`apps`）。每个条目恰好一条。

| 文档里的名字 | 用途 | 登记为 | 目录里的名字 |
|---|---|---|---|
| cunzhi | agent-behavior | 外部项目 | `cunzhi` |
| codebase-memory-mcp | codebase-understanding | 外部项目 | `codebase-memory-mcp` |
| Graft | codebase-understanding | 外部项目 | `graft` |
| acemcp | codebase-understanding | MCP | `acemcp` |
| ace-tool | codebase-understanding | 外部项目 | `ace-tool` |
| ace-tool-rs | codebase-understanding | 外部项目 | `ace-tool-rs` |
| codegraph | codebase-understanding | 外部项目 | `codegraph` |
| code-review-graph | codebase-understanding | MCP | `code-review-graph` |
| FastCode | codebase-understanding | 外部项目 | `fastcode` |
| memorix | context-memory | MCP | `memorix` |
| context-mode | context-memory | 外部项目 | `context-mode` |
| Headroom | context-memory | 外部项目 | `headroom` |
| context7 | web-search | MCP | `context7` |
| GrokSearch-rs | web-search | 外部项目 | `grok-search-rs` |
| firecrawl-mcp-server | web-search | MCP | `firecrawl-mcp` |
| GrokSearch | web-search | MCP | `grok-search` |
| chrome-devtools-mcp | browser-automation | MCP | `chrome-devtools` |
| Playwright MCP | browser-automation | MCP | `playwright` |
| shadcn-ui-mcp-server | design-media | MCP | `shadcn-ui` |
| excel-mcp-server | documents | MCP | `excel` |
| Office-Word-MCP-Server | documents | MCP | `word-document-server` |

每条的 `url` 就是文档里的那个链接，按链接对得上。

## 怎么试的

「试通」照工单的标准：经安装器、用真实的宿主命令、在临时配置目录里装一次，两个宿主的配置里都出现这一条。做法照 CLI 层规范「发布前在本机核对」。

- 一个新的 `mktemp -d` 目录；`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 都指到它下面，`OXY_TOOLS_CATALOG` 指到本仓库根（读的就是仓库真实的 `catalog.json`），`NO_COLOR=1`。驱动脚本开头断言三个目录都落在系统临时目录里、且不在真实主目录下，不满足就退出。
- 先 `npm run build`，然后在伪终端里跑打包好的 `node dist/bin.js --lang zh`，脚本按步骤发按键：进 MCP 分组 → 两个宿主都选 → `a` 全选 11 个 MCP → 8 个环境变量逐个输入占位值 → 在「将执行 22 条命令」上确认执行 → 回到主菜单后选退出。执行的是真实的 `claude`、`codex`。
- 占位值不是真的 key：`oxy-tools-trial-not-a-real-key`，变量名以 `_URL` 结尾的填 `https://example.invalid/v1`。

结果：

- 安装器退出状态 0。汇总是「将安装 11 个 MCP」「将执行 22 条命令」（每个 MCP 两个宿主各一条添加命令），结果 22 行都是「已配置」，合计 `22 成功 · 0 失败 · 0 跳过`。
- 临时目录的 `claude/.claude.json` 的 `mcpServers` 和 `codex/config.toml` 的 `mcp_servers` 里各有 11 条；逐条比过名字、启动命令、参数、环境变量名，两个宿主写进去的都与目录里写的相同。
- 终端的原始输出里搜不到两个占位值，一个样式码都没有。
- 真实配置没有动：试之前和之后各取一次 `~/.claude.json` 里 `mcpServers` 的条数与哈希、`~/.codex/config.toml` 的哈希（只读、不打印内容），前后相同。
- 在这之前还用另一种跑法试过一遍，结果相同：不经 `dist/bin.js`，脚本直接调入口 `runInstaller`，目录来源 `localCatalogSource(<本仓库根>)`，外部命令执行器是真实的 `systemCommandRunner()`，提问器换成按预设应答的替身。评审指出这不是规范写的做法，所以又照上面的伪终端跑法重做了一遍；重做时目录里几条说明的文字已经改过（加了「没有带 key 验证过」等），连接方式没有变。
- 已发布的 0.2.0 读这份目录：在另一个临时目录里 `npm install oxy-tools@0.2.0`，三个环境变量同样指到临时目录，`OXY_TOOLS_CATALOG` 指到本仓库根，伪终端里跑 `npx --no-install oxy-tools --lang zh`。画面：`目录  12 skill · 11 MCP · 10 应用项目`，没有「条目格式有误」的提醒，主菜单是 `Skill 12`、`MCP 11`、`应用项目 10`、`退出`；进 MCP 后照常问装进哪些 AI Agent、列出 11 个 MCP，两栏都是「未配置」。只看了画面，没有安装。

**没有做的**：

- **没有启动过任何一个 MCP 服务器。** 试通只证明「配置写得进去」，不证明服务器起得来、工具可用。那要在本机下载并运行 11 个第三方包，不在工单的标准里，也没有做。
- 没有用真的 key 验证过任何一条（手头没有）。带环境变量的 5 条见下表的备注；其中要有 key 或服务地址才能用的 3 条（`acemcp`、`firecrawl-mcp`、`grok-search`），目录的说明里也注明了没有验证过。
- 包存在与否另外只读地查过（见下表「包」一栏），没有安装它们。
- Windows、Linux 上没有试。

## 登记为 MCP 的 11 条

两个宿主都试了，结果都是配置里出现这一条，下表不再逐条重复。

| 目录里的名字 | 连接方式（本地进程） | 官方说明里的出处 | 包（2026-10-10 查到的最新版） | 环境变量 |
|---|---|---|---|---|
| `acemcp` | `uvx acemcp` | README「MCP 配置 · 基础配置」 | PyPI `acemcp` 0.2.2 | `ACEMCP_BASE_URL`、`ACEMCP_TOKEN`，都可选 |
| `code-review-graph` | `uvx code-review-graph serve` | README「Quick Start」：它自己的 `install` 在 `uvx` 可用时写的就是这一条 | PyPI `code-review-graph` 2.3.9 | 无 |
| `memorix` | `npx -y memorix serve` | README：「For an npm-based MCP client … use the complete command `npx -y memorix serve`」 | npm `memorix` 1.9.10 | 无 |
| `context7` | `npx -y @upstash/context7-mcp` | 官方文档「MCP Clients」的 Claude Code、Codex 两节（Local Server Connection） | npm `@upstash/context7-mcp` 4.3.0 | `CONTEXT7_API_KEY`，可选 |
| `firecrawl-mcp` | `npx -y firecrawl-mcp` | README「Running with npx」「Manual Installation」 | npm `firecrawl-mcp` 3.29.1 | `FIRECRAWL_API_KEY`，必填 |
| `grok-search` | `uvx --from git+https://github.com/GuDaStudio/GrokSearch@grok-with-tavily grok-search` | README「一键安装」 | 不在包仓库里，直接从 GitHub 的 `grok-with-tavily` 分支装；分支存在，`pyproject.toml` 里有 `grok-search` 这个入口 | `GROK_API_URL`、`GROK_API_KEY` 必填，`TAVILY_API_KEY` 可选 |
| `chrome-devtools` | `npx -y chrome-devtools-mcp@latest` | README「Getting started」 | npm `chrome-devtools-mcp` 1.10.1 | 无 |
| `playwright` | `npx @playwright/mcp@latest` | README 的 Claude Code、Codex 两节 | npm `@playwright/mcp` 0.0.83 | 无 |
| `shadcn-ui` | `npx @jpisnice/shadcn-ui-mcp-server` | README「Quick Start」 | npm `@jpisnice/shadcn-ui-mcp-server` 3.0.0 | `GITHUB_PERSONAL_ACCESS_TOKEN`，可选 |
| `excel` | `uvx excel-mcp-server stdio` | README「Quick start」：「Every client runs the server with `uvx excel-mcp-server stdio`」 | PyPI `excel-mcp-server` 1.1.2 | 无 |
| `word-document-server` | `uvx --from office-word-mcp-server word_mcp_server` | README「Method 2: Without Installation (Using uvx)」 | PyPI `office-word-mcp-server` 1.1.11 | 无 |

逐条的备注：

- **acemcp**：它要一个索引服务的地址和令牌，官方给了三种给法：`~/.acemcp/settings.toml`（首次运行时自动生成）、命令行参数、`ACEMCP_` 前缀的环境变量。README 没有写出两个变量的全名；`ACEMCP_BASE_URL`、`ACEMCP_TOKEN` 是从它的源码 `src/acemcp/config.py`（`envvar_prefix="ACEMCP"`，键是 `BASE_URL`、`TOKEN`）核对出来的。两个都登记为可选：留空的可以装好后去配置文件里填。README 没说这个服务去哪申请，申请地址写的是 README 的「配置」一节。**没有带真实的地址和令牌验证过。**
- **code-review-graph**：文档里标了 `MCP` 和 `工具` 两个。登记为 MCP：AI 是经它的 MCP 工具用它的，命令行只负责安装和建图；图可以由 MCP 自己的 `build_or_update_graph_tool` 建。它官方的完整装法（`pip install` 加 `code-review-graph install`）还会装钩子和 skill，这样只装 MCP 的没有那些。
- **context7**：官方现在首推 `npx ctx7 setup`（它自己的交互式安装）和远程地址加请求头。远程地址要靠请求头带 key，不在条目格式之内；本地进程的写法在官方文档的 Claude Code、Codex 两节里都有。官方把 key 写成参数 `--api-key`，这里改用环境变量 `CONTEXT7_API_KEY`——同一页的 Pi 一节就是这样给本地进程传 key 的（`--env CONTEXT7_API_KEY=… -- npx -y @upstash/context7-mcp`）。不填 key 也能用，限额低一些。**没有带 key 验证过。**
- **firecrawl-mcp**：用云端接口时 key 必填；自己部署 Firecrawl 的用户改用 `FIRECRAWL_API_URL`，目录里没有登记这个变量。**没有带 key 验证过。**
- **grok-search**：官方说明是写给 Claude Code 的（`claude mcp add-json`），但给的是一条普通的本地进程启动命令，Codex 下配置同样写得进去。`GROK_API_URL` 是一个地址不是 key，安装器仍然按「key」的画面去问它（标题写「需要 key」、输入不回显）。README 没说 Grok 接口去哪申请，两个 Grok 变量的申请地址写的是 README；Tavily 的写的是它的官网首页。可选的 `GROK_MODEL`、`TAVILY_API_URL`、`FIRECRAWL_API_KEY` 等没有登记。**没有带 key 验证过。**
- **playwright**：官方的命令没有 `-y`，照官方的写。
- **shadcn-ui**：官方在 Claude Code 一节里给的名字是 `shadcn`、启动命令用的是 `bunx`。这里用 README 开头给的 `npx` 写法（不要求用户装 bun），名字取 `shadcn-ui`——shadcn 官方自己另有一个 MCP（https://ui.shadcn.com/docs/mcp ，是另一个程序），它装出来的名字凭记忆也是 `shadcn`（这一点没有逐字核对）；同名的话安装器会把那一个显示成「已配置」并在再装时先移除它。key 官方有参数 `--github-api-key` 和环境变量 `GITHUB_PERSONAL_ACCESS_TOKEN` 两种给法，用的是后一种。**没有带 key 验证过。**
- **excel**：官方的例子都带 `--allow-dir <文件夹>` 来限定它能碰哪些文件，那是每个用户自己的路径，写不进目录。不带这个参数时官方的说明是「any absolute path to an Excel file works」——也就是不限定文件夹；目录的说明里写明了这一点。
- **word-document-server**：上游仓库已经归档（GitHub 上 `archived: true`，最后一次推送 2025-12-31），说明里写明了。

## 登记为外部项目的 10 条

| 目录里的名字 | 官方的装法 | 为什么写不进 MCP 条目 |
|---|---|---|
| `cunzhi` | `brew tap imhuso/cunzhi && brew install cunzhi`（或下载发行包），然后在 MCP 配置里写 `"command": "寸止"` | 启动命令是一个中文名的程序，条目格式的命令只收字母、数字和几个符号；而且要先把程序装到机器上 |
| `codebase-memory-mcp` | `curl … install.sh \| bash`：装上程序并自己去配各个 Agent；手动配置写的是 `"command": "/path/to/codebase-memory-mcp"` | 要先装程序（那是工具的装法，要在虚拟机里试）；手动配置要的是装好之后的绝对路径 |
| `graft` | `npm install -g @nanonets/graft` 加 `graft init`：在项目里建图、给 Claude Code 装状态栏和钩子、写各 Agent 的说明文件 | 文档里标了 `MCP` 和 `工具` 两个，主要用法是命令行那一套（工具），按工单只登记主要用法；工具要在虚拟机里试 |
| `ace-tool` | `npx ace-tool --base-url <地址> --token <令牌>` | 必填的地址和令牌只能作为命令行参数给，条目格式只会替用户问环境变量 |
| `ace-tool-rs` | `npx ace-tool-rs --base-url <地址> --token <令牌>` | 同上 |
| `codegraph` | `npx @colbymchenry/codegraph`（它自己的交互式安装器）；手动是 `npm install -g` 之后写 `"command": "codegraph", "args": ["serve", "--mcp"]` | 要先全局装程序，MCP 的启动命令才存在 |
| `fastcode` | 克隆仓库、建虚拟环境、装依赖，MCP 配置里写虚拟环境里 Python 和脚本的绝对路径 | 要先克隆再构建；文档里标了 `工具` 和 `MCP`，主要用法是它自己的网页界面和命令行 |
| `context-mode` | Claude Code 和 Codex 都是装插件（MCP 加钩子）；Claude Code 另有一条只装 MCP 的命令 `claude mcp add context-mode -- npx -y context-mode` | 主要的装法是插件，安装器不替用户装插件。只装 MCP 的那一条官方只对 Claude Code 给了，并说明那样没有自动路由、只适合试用；Codex 的手动做法要先全局安装、给服务器带上 `CONTEXT_MODE_PLATFORM=codex`、另配钩子——同一条命令在两个宿主下不是一回事 |
| `headroom` | `uv tool install "headroom-ai[all]"`，再 `headroom wrap` / `headroom proxy`；MCP 由它自己的 `headroom mcp install` 配 | 文档里标了 `工具` 和 `MCP`，主要用法是命令行和代理（工具）；MCP 也要先装程序 |
| `grok-search-rs` | 远程地址加请求头；或 `npm install -g grok-search-rs` 之后写 `"command": "grok-search-rs"` 加环境变量 | 远程的那种要靠请求头带 key，不在条目格式之内；本地的那种要先全局装程序 |

**这几条的界线是实现时划的，维护者没有确认**（评审指出它和下面两条 MCP 的处理不完全一致）：`grok-search` 的官方说明也只写了 Claude Code，仍登记为 MCP，因为它给的是一条与宿主无关的启动命令；`code-review-graph` 只装 MCP 也少了官方完整装法里的钩子，仍登记为 MCP，因为 AI 用它靠的就是 MCP 工具。`context-mode` 相反：它的主要效果（自动把大段输出引到沙箱里）靠钩子，官方把只装 MCP 说成试用，而且它在 Codex 下要另带环境变量。有异议时把 `context-mode` 改成带 `hosts: ["claude-code"]` 的 MCP 条目即可。

以后可能改成组件的（都**没有试过**，只是记下线索）：

- `codegraph`、`grok-search-rs`、`context-mode`、`graft` 都发布在 npm 上、包里有可执行入口，`npx -y <包名> …` 多半起得来；但它们的官方说明没有给出这种写法作为 MCP 的启动命令（`graft` 给了 `npx -y @nanonets/graft mcp`，可它要先由命令行在项目里建好图）。按工单「连接方式只取官方说明里给出的」，没有这样登记。
- `context-mode` 只装进 Claude Code 的话（条目加 `hosts`），那条只装 MCP 的官方命令写得进条目格式；代价是没有它的钩子，官方自己说那样「不会自动路由」。
- `codebase-memory-mcp`、`headroom`、`graft`、`cunzhi` 的官方装法是一条安装命令，属于工具；等在虚拟机里试通后可以改成工具条目。
- `ace-tool`、`ace-tool-rs` 要等条目格式能问「启动参数里的值」才写得进来。

## 实现时定下、工单没有规定的

1. **MCP 条目的名字用官方说明里那个服务器的名字**，不用仓库名（`chrome-devtools` 而不是 `chrome-devtools-mcp`，`playwright` 而不是 `playwright-mcp`）。名字会成为宿主配置里的键：用官方的名字，照官方说明装过的用户在安装器里看到的是「已配置」，AI 看到的工具名（如 `mcp__playwright__…`）也和各处文档、skill 里写的一致。例外是 `shadcn-ui`，原因见上。
   - 代价：`playwright` 这个名字和文档里的开发库 playwright（`microsoft/playwright`，工单 04 要录入为外部项目）撞了。名字只在各自的数组里唯一，校验不拦；但混合列表里会有两行都叫 playwright，一行 MCP、一行外部项目。工单 04 录入时要留意。
2. **用 `uvx` 启动的 5 条在说明末尾注了「需要 uv」**：没装 uv 的机器上配置照样写得进去，但服务器起不来，而安装器不查这个。用 `npx` 的没有注，安装器自己就是 `npx` 起的。
3. **环境变量只登记了必填的和最常用的可选项**，每个可选项都是用户要多按一次回车的一问。各条没登记的见上面的备注。
4. `mcps`、`apps` 两个数组里的顺序照文档：先按用途的先后，同一用途内按文档里的先后。

## 附：试通脚本

留在这里供工单 13、14 和以后再试时照着用。它不在仓库里，每次放进一个新的 `mktemp -d` 目录跑；按键的步骤跟着目录里有哪些分组、哪些环境变量走，换了目录要相应改。

```bash
(cd <本仓库>/cli && npm run build)
P=$(mktemp -d)
# 把下面的脚本存成 $P/drive.py
python3 -I "$P/drive.py" "$P" <本仓库>
# 结果：$P/transcript.txt（去掉控制码之后的终端输出）
#       $P/home/claude/.claude.json、$P/home/codex/config.toml（写进去的配置）
```

```python
# 伪终端里跑打包好的安装器（dist/bin.js），用真实的 claude / codex 把目录里的 MCP 装进临时配置目录
import os, pty, sys, time, select, re, fcntl, termios, struct
tmp = os.path.realpath(sys.argv[1]); repo = sys.argv[2]
real_home = os.path.expanduser('~' + os.environ.get('USER', ''))
env = dict(os.environ, HOME=tmp + '/home', CLAUDE_CONFIG_DIR=tmp + '/home/claude', CODEX_HOME=tmp + '/home/codex', OXY_TOOLS_CATALOG=repo, NO_COLOR='1')
for k in ('HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'):
    assert env[k].startswith(tmp + '/') and not env[k].startswith(real_home + '/') and '/T/' in env[k], k  # '/T/' 是 macOS 临时目录的特征
    os.makedirs(env[k], exist_ok=True)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(tmp)
    os.execvpe('node', ['node', repo + '/cli/dist/bin.js', '--lang', 'zh'], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 60, 80, 0, 0))
raw = b''
def text(): return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', raw.decode('utf-8', 'replace')).replace('\r', '')
def pump(seconds):
    global raw
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: raw += os.read(fd, 65536)
            except OSError: return False
    return True
def wait_for(needle, start, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        at = text().find(needle, start)
        if at >= 0: pump(0.6); return at
        if not pump(0.2): break
    raise SystemExit(f'没等到：{needle}\n---\n{text()[-1500:]}')
def send(keys): os.write(fd, keys); pump(0.4)
at = wait_for('选择分组', 0); send(b'\x1b[B'); send(b'\r')           # 第二行是 MCP
at = wait_for('装进哪些 AI Agent', at); send(b'\r')                  # 两个宿主缺省都勾着
at = wait_for('选择要安装的 MCP', at); send(b'a'); send(b'\r')       # a 全选
VALUE, URL = 'oxy-tools-trial-not-a-real-key', 'https://example.invalid/v1'
for name in ['ACEMCP_BASE_URL', 'ACEMCP_TOKEN', 'CONTEXT7_API_KEY', 'FIRECRAWL_API_KEY', 'GROK_API_URL', 'GROK_API_KEY', 'TAVILY_API_KEY', 'GITHUB_PERSONAL_ACCESS_TOKEN']:
    at = wait_for('变量      ' + name, at); pump(0.6)
    send((URL if name.endswith('_URL') else VALUE).encode()); send(b'\r')
at = wait_for('将执行 22 条命令', at); pump(1.5); send(b'\r')          # 光标起始在「执行」
at = wait_for('选择分组', at + 10, timeout=180)                       # 回到主菜单就是装完了
send(b'\x1b[B'); send(b'\x1b[B'); send(b'\x1b[B'); send(b'\r'); pump(2)  # 第四行是退出
_, status = os.waitpid(pid, 0)
out = text()
open(tmp + '/transcript.txt', 'w').write(out)
print('exit', os.waitstatus_to_exitcode(status), '| 占位值出现次数', out.count(VALUE) + out.count(URL), '| 样式码', len(re.findall(rb'\x1b\[[0-9;]*m', raw)))
```

用真的 key 试的时候，key 是脚本里的明文——试完不要把脚本留下或贴出去。
