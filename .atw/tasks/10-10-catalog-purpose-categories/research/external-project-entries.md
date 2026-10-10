# 47 个外部项目的录入记录，和「看起来一条命令能装」的候选清单

> 工单 04。2026-10-10 做。
> 说明取自 Outline「汇总」文档（取的时候是修订 10，快照 `outline-entries.md` 记的是修订 9；范围内 47 条的名字和链接与快照一致），并对照了每个仓库当天的官方简介和默认分支的 README（`gh api repos/<所有者>/<仓库>`、`…/readme`，只读）。DSPy + GEPA 的链接不是 GitHub 仓库，对照的是链接指向的那一页。
> **没有运行过下面任何一条安装命令。** 候选清单里的命令是从官方说明里抄的，装不装得上、复核认不认得出，都要等在虚拟机里试。

## 结论

`outline-entries.md` 里标签既不含 `MCP` 也不含 `Skill` 的 47 个条目，全部登记为外部项目（`catalog.json` 的 `apps`），每个恰好一条，都没有推荐标记。`apps` 由 10 条变成 57 条。

| 用途 | 文档里的名字 → 目录里的名字 |
|---|---|
| dev-workflow（6） | spec-kit → `spec-kit`、OpenSpec → `openspec`、autoloop → `autoloop`、ralph → `ralph`、ralphy → `ralphy`、open-ralph-wiggum → `open-ralph-wiggum` |
| codebase-understanding（2） | auggie → `auggie`、mgrep → `mgrep` |
| context-memory（5） | claude-mem → `claude-mem`、sivtr → `sivtr`、openrag → `openrag`、rtk → `rtk`、opencode-dynamic-context-pruning → `opencode-dynamic-context-pruning` |
| browser-automation（4） | Playwright CLI → `playwright-cli`、ego lite → `ego-lite`、playwright → `playwright`、Page Agent → `page-agent` |
| design-media（12） | design.md → `design-md`、awesome-design-md → `awesome-design-md`、open-design → `open-design`、Penpot → `penpot`、galaxy → `galaxy`、Canvas UI → `canvas-ui`、screenshot-to-code → `screenshot-to-code`、ui-screenshot-to-prompt → `ui-screenshot-to-prompt`、Zhijuan Prompt Card → `zhijuan-prompt-card`、awesome-gpt-image-2 → `awesome-gpt-image-2`、OpenMontage → `openmontage`、supervision → `supervision` |
| documents（10） | MinerU → `mineru`、Stirling-PDF → `stirling-pdf`、pdf-inspector → `pdf-inspector`、OfficeCLI → `officecli`、sv-excel-agent → `sv-excel-agent`、Pandoc → `pandoc`、PasteMD → `pastemd`、markitdown → `markitdown`、pafcraft（PDFCraft）→ `pdfcraft`、Word-Formatter-Pro → `word-formatter-pro` |
| prompts-writing（4） | prompt-optimizer → `prompt-optimizer`、DSPy + GEPA → `dspy-gepa`、BypassAIGC → `bypassaigc`、MuMuAINovel → `mumuainovel` |
| review-security（4） | open-code-review → `open-code-review`、Plannotator → `plannotator`、shannon → `shannon`、agent-as-a-judge → `agent-as-a-judge` |

每条的 `url` 就是文档里的那个链接，按链接对得上。数组里的先后照文档的顺序，和工单 03 录入的 10 条穿插在一起。

录入时定下的几处（实现者定的，维护者没有逐条确认）：

- **名字**：仓库名转成小写 kebab-case。`design.md` 的点不合名字的规则，写成 `design-md`；`DSPy + GEPA` 写成 `dspy-gepa`；文档里的「pafcraft」是笔误，按仓库名写成 `pdfcraft`。
- **`playwright` 有两条**：开发库 playwright 在 `apps` 里叫 `playwright`，和 `mcps` 里的 `playwright`（Playwright MCP）同名。名字只在各自的数组里唯一，校验通过；`prd.md` 的 Further Notes 第 14 条已经预见到这一点。
- **`opencode-dynamic-context-pruning` 的仓库换了所有者**：文档的链接 `Opencode-DCP/opencode-dynamic-context-pruning` 现在跳转到 `Tarquinen/opencode-dynamic-context-pruning`。目录里仍写文档的链接（和别的条目一样按链接对得上），跳转目前有效。它的 README 写着开发已放缓、新功能转去另一个项目 Sleev。
- **Playwright CLI 的说明两头都写了**：文档里的说明是「录制并生成 Playwright 代码、检查选择器、截图」（和仓库的官方简介一致），它的 README 现在把自己定位成给编码 Agent 用的命令行；目录里写的是「给编码 Agent 用的 Playwright 命令行，用命令操作浏览器、检查选择器、截图和生成 Playwright 代码」。
- **Page Agent 的说明比文档收得紧**：文档写「无须后端、客户端、浏览器插件」，README 里看得到的是不需要浏览器扩展、Python 和无头浏览器，并且要自备大模型；目录里照 README 写。
- **说明末尾的括号**只写了从 README 里看得到的前提：auggie、mgrep 要各自的账号，ego lite 目前只有 macOS 版，Page Agent 要自备大模型，Zhijuan Prompt Card 要自备能识图的大模型接口。别的条目没有逐个查前提（比如 open-code-review 用之前要配大模型，只记在下面的候选清单里）。
- 46 个 GitHub 仓库当天都在、都没有归档。

## 怎么核对的

- 目录校验命令：在 `cli/` 下 `npm run validate-catalog -- ..`，输出 `目录校验通过：12 个 skill、11 个 MCP、0 个工具、57 个应用项目、10 个用途`，退出状态 0。
- 「每个条目恰好一条」用下面这段脚本对照快照查（在仓库根运行，参数是仓库根）。录入前它报 47 条缺失，录入后输出 `范围内 47 条，apps 共 57 条` 和 `全部对得上`。它还查：用途等于条目所在大标题对应的那个、没有推荐标记、说明句末没有句号、没有同时出现在 `mcps` 或 `tools` 里、`apps` 里没有重名。

```python
import json, re, sys
root = sys.argv[1]
entries, section = [], None
for line in open(f'{root}/.atw/tasks/10-10-catalog-purpose-categories/research/outline-entries.md', encoding='utf-8'):
    h = re.match(r'^## (\d+)\. ', line)
    if h:
        section = int(h.group(1)); continue
    if line.startswith('## '):
        section = None; continue
    m = re.match(r'^- ((?:`[^`]+` )+)(.+?) ?— (https://\S+)', line)
    if not m or section is None:
        continue
    tags = re.findall(r'`([^`]+)`', m.group(1))
    if 'MCP' in tags or 'Skill' in tags:
        continue
    entries.append((section, m.group(2), m.group(3)))
cat = json.load(open(f'{root}/catalog.json', encoding='utf-8'))
purposes = [p['id'] for p in cat['purposes']]
apps = cat['apps']
bad = []
for section, name, url in entries:
    hits = [a for a in apps if a['url'] == url]
    if len(hits) != 1:
        bad.append(f'{name}: apps 里有 {len(hits)} 条（{url}）'); continue
    a = hits[0]
    if a.get('purpose') != purposes[section - 1]:
        bad.append(f"{name}: 用途 {a.get('purpose')} 应为 {purposes[section - 1]}")
    if 'recommended' in a:
        bad.append(f'{name}: 带了推荐标记')
    for lang in ('zh', 'en'):
        if a['description'][lang].rstrip()[-1] in '。.':
            bad.append(f'{name}: {lang} 说明句末有句号')
    for other in ('mcps', 'tools'):
        if any(x['url'] == url for x in cat[other]):
            bad.append(f'{name}: 同时在 {other} 里')
names = [a['name'] for a in apps]
dup = sorted({n for n in names if names.count(n) > 1})
if dup: bad.append(f'apps 里重名: {dup}')
print(f'范围内 {len(entries)} 条，apps 共 {len(apps)} 条')
print('\n'.join(bad) or '全部对得上')
sys.exit(1 if bad else 0)
```

**没有做的**：

- 没有拿已发布的 0.2.0 再读一遍这份目录。这次只加条目、没有改格式；工单 03 录入第一批带 `purpose` 的条目时核对过一次。
- 没有在真实终端里看 57 条的列表。最长的名字 `opencode-dynamic-context-pruning`（32 列）在工单 01 排版时已经算进去（界面设计规范「待录入清单里最长的名字」）。
- 说明只对照了 README 的开头和安装一节，没有通读，也没有装上试用。

## 候选清单：看起来一条官方命令就能装上的

供维护者以后在虚拟机里试通后改成工具。**这张清单只是记录**，它们现在都登记为外部项目。

「怎么算装好了」一栏对应工具条目的 `check`：`command` 是这个命令在可执行路径上，`path` 是用户主目录下的这个相对路径存在。命令名取自 README 里装好之后的用法示例，没有实际装过。

| 目录里的名字 | 官方安装命令（README 原文） | 怎么算装好了 | 前提与要留意的 |
|---|---|---|---|
| `spec-kit` | `uv tool install specify-cli` | `command`: `specify` | 要 uv 和 Python 3.11+。装的是命令行；进项目后还要 `specify init` |
| `openspec` | `npm install -g @fission-ai/openspec@latest`；或 `brew install openspec` | `command`: `openspec` | Node 20.19.0 以上 |
| `autoloop` | macOS/Linux：`curl -sSf https://raw.githubusercontent.com/armgabrielyan/autoloop/main/install.sh \| sh`；`brew install armgabrielyan/tap/autoloop`；`npm install -g @armengabrielyan/autoloop`；`cargo install autoloop` | `command`: `autoloop` | README 的 curl 那条只写了 macOS/Linux；Windows 可试 npm 那条 |
| `ralphy` | `npm install -g ralphy-cli` | `command`: `ralphy` | |
| `open-ralph-wiggum` | `npm install -g @th0rgal/ralph-wiggum`；或 `bun add -g @th0rgal/ralph-wiggum` | `command`: `ralph` | 命令名是 `ralph`，不是包名 |
| `auggie` | `npm install -g @augmentcode/auggie@latest` | `command`: `auggie` | Node 22+。装好后要 `auggie login` |
| `mgrep` | `npm install -g @mixedbread/mgrep` | `command`: `mgrep` | 装好后要 `mgrep login`，或设 `MXBAI_API_KEY` |
| `sivtr` | Linux/macOS/WSL：`curl -fsSL https://raw.githubusercontent.com/Ariestar/sivtr/main/install.sh \| sh`；Windows：`irm https://raw.githubusercontent.com/Ariestar/sivtr/main/install.ps1 \| iex`；`cargo install sivtr` | `command`: `sivtr` | 装好后还要 `sivtr setup` 才开始采集，它会改宿主的 MCP 配置并装一个 skill |
| `rtk` | `brew install rtk`（README 推荐）；Windows：`winget install rtk-ai.rtk`；Linux/macOS：`curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh \| sh` | `command`: `rtk`；curl 那条装到 `~/.local/bin`，不一定在可执行路径上，可改用 `path`: `.local/bin/rtk` | README 提醒 crates.io 上有同名的另一个项目，用 `rtk gain` 能跑来确认装对了——光看命令在不在分不出来 |
| `playwright-cli` | `npm install -g @playwright/cli@latest` | `command`: `playwright-cli` | Node 18+。给宿主装它的 skill 是另一步：`playwright-cli install --skills` |
| `mineru` | `uv tool install --python 3.12 "mineru>=4.0,<5"` | `command`: `mineru` | 要 uv。命令里有引号和 `<`、`>`，要原样交给 shell。下载量没有查 |
| `pdf-inspector` | `cargo install pdf-inspector` | `command`: `pdf2md` | 要 Rust 工具链。文档里标的是开发库，装上的是它附带的命令行 |
| `officecli` | macOS/Linux：`curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh \| bash`；Windows：`irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 \| iex`；`brew install officecli`；`scoop install officecli`；`npm install -g @officecli/officecli` | `command`: `officecli` | |
| `pandoc` | macOS：`brew install pandoc`；Windows：`winget install --source winget --exact --id JohnMacFarlane.Pandoc` 或 `choco install pandoc` | `command`: `pandoc` | 出处是仓库的 `INSTALL.md`。Linux 没有一条通用的命令：官方给的是 deb 包、压缩包，或各发行版的包管理器 |
| `markitdown` | `pip install 'markitdown[all]'` | `command`: `markitdown` | Python 3.10–3.14。README 建议装在虚拟环境里——那样命令只在那个环境里有，复核会找不到；用哪种装法要先定 |
| `open-code-review` | `npm install -g @alibaba-group/open-code-review` | `command`: `ocr` | Git 2.41 以上。用之前要配大模型（`ocr config provider`） |
| `plannotator` | macOS/Linux/WSL：`curl -fsSL https://plannotator.ai/install.sh \| bash`；Windows：`irm https://plannotator.ai/install.ps1 \| iex` | `command`: `plannotator`；或 `path`: `.local/bin/plannotator` | 完整安装会探测机器上已装的各种 AI 编码工具（包括本安装器的两个宿主），并改它们的钩子、skill 和斜杠命令。只要程序本身的话加 `--minimal`：`curl -fsSL https://plannotator.ai/install.sh \| bash -s -- --minimal` |
| `claude-mem` | `npx claude-mem install` | 没有落在可执行路径上的命令（它装的是宿主的插件和后台服务），README 也没有专门说怎么确认。从它「模式」一节用到的路径看，装进 Claude Code 后在 `~/.claude/plugins/marketplaces/thedotmack`，可试 `path`: `.claude/plugins/marketplaces/thedotmack`——只对 Claude Code 成立，Codex 下落在哪要在虚拟机里看 | 安装时会让你在浏览器里登录；加 `--provider`、设 `CLAUDE_MEM_ONLINE_OPTIN=false` 或在非交互环境里可以跳过。README 明说不要用 `npm install -g claude-mem`（那只装了库） |

### 没进候选清单的 29 个，和原因

| 原因 | 条目 |
|---|---|
| 不是一条命令装上的：照 README 要把脚本拷进项目，或在宿主里用插件市场的斜杠命令 | `ralph` |
| README 没给安装命令，只指向它的文档（Python 包，或 Docker/Podman 部署）；文档没有读 | `openrag` |
| 有一条命令（`opencode plugin add @tarquinen/opencode-dcp@latest`），但它是 OpenCode 的插件，安装器不支持这个宿主 | `opencode-dynamic-context-pruning` |
| 本体是要下载安装包的桌面应用；`npx skills add citrolabs/ego-lite` 装的只是它的 skill——要收的话是第三方 Skill，不是工具 | `ego-lite` |
| 是 `npx @keygraph/shannon@latest` 直接运行，不是装上一个程序 | `shannon` |
| 开发库：装进你自己的项目，不是装到这台机器上 | `playwright`、`page-agent`、`galaxy`、`canvas-ui`、`supervision`、`dspy-gepa`、`agent-as-a-judge` |
| 资源：规范或合集，没有要装的东西。`awesome-gpt-image-2` 的 README 另给了 `npx skills add` 装配套 skill 的命令，要收的话同样是第三方 Skill | `design-md`、`awesome-design-md`、`awesome-gpt-image-2` |
| 桌面应用、网页应用或浏览器扩展：README 给的是下载安装包、克隆后自己搭，或用 Docker 部署 | `open-design`、`penpot`、`screenshot-to-code`、`ui-screenshot-to-prompt`、`zhijuan-prompt-card`、`openmontage`、`stirling-pdf`、`sv-excel-agent`、`pastemd`、`pdfcraft`、`word-formatter-pro`、`prompt-optimizer`、`bypassaigc`、`mumuainovel` |
