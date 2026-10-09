# 清单与版本

> 仓库根两个目录文件的契约：skill 清单 `index.json` 的字段与 skill 的版本号规则，`catalog.json` 的字段，两个文件共用的格式版本号规则，以及对 A Team Workflow 的三条承诺。`index.json` 的字段、skill 的版本号、格式版本号和三条承诺，本文是唯一出处，其他文档只指向这里。`catalog.json` 的字段在本文里是给加条目的人看的概览（有哪些字段、必不必填、什么意思）；每个字段逐字的校验规则（正则）和为什么这么定在 CLI 层，本文给出指向，**两边对不上时以 CLI 层和 `cli/src/catalog.ts` 为准**，并把本文改回一致。

---

## 何时要改 index.json

- 新增、删除、重命名 `skills/` 下的目录；
- 改了某个 skill 目录里的**任何**文件（正文、引用文档、脚本、资产、元数据）；
- 改了某个 skill 对外的一句话说明。

`index.json` 有两个读者：

- **A Team Workflow 的命令行**，代码不在本仓库。引入 `index.json` 的提交 `c2230a1` 说明了两处用途：`atw init` 的“额外 skill”多选列表，和 `atw update` 的版本检查。它怎么比较版本、怎么处理异常条目，在本仓库内无从验证；本仓库对它的承诺见下面“对 A Team Workflow 的承诺”。
- **安装器**（`cli/`），每次运行时从 `main` 分支现拉。它怎么读、怎么校验，见 [CLI 层的入口与测试](../cli/installer-entry.md)。

下面的契约来自提交 `c2230a1` 的说明、文件现状和安装器的校验。

---

## 字段契约

```json
{
  "version": 1,
  "skills": [
    {
      "name": "wizard",
      "version": "1.0.0",
      "path": "skills/wizard",
      "description": {
        "zh": "生成交互式 bash 向导，带人走完只能由人完成的步骤",
        "en": "Generate an interactive bash wizard for steps only a human can perform"
      }
    }
  ]
}
```

| 字段 | 类型 | 现状 |
|------|------|------|
| `version`（顶层） | 整数 | 清单格式版本，当前为 `1`。改 skill 时不动它 |
| `skills` | 数组 | 按 `name` 升序排列 |
| `skills[].name` | 字符串 | 等于目录名，等于 `SKILL.md` frontmatter 的 `name` |
| `skills[].version` | 字符串 | 该 skill 的版本，见下节 |
| `skills[].path` | 字符串 | `skills/<name>`，相对仓库根，不带结尾斜杠 |
| `skills[].description.zh` | 字符串 | 一句中文说明，全角标点，句末不加句号 |
| `skills[].description.en` | 字符串 | 一句英文说明，句末不加句号 |

每个条目只有这四个键，`description` 只有 `zh`、`en` 两个键。`skills/` 下的每个目录都有且只有一个条目。

说明是给安装者在列表里挑选用的，写“它做什么”，不写触发条件。`onetake` 的说明在括号里带了安装前需要知道的限制，是目前唯一这么写的条目：

```json
"zh": "制作 10–60 秒的产品动效短片（体积约 70MB，仅限非商业使用）"
```

**目录与清单条目在同一个提交里增删。** 提交 `c2230a1` 一次新增 7 个 skill、移除 20 个，并同时落下清单。新条目插在按 `name` 排序后的位置，不追加到末尾。

---

## 版本规则

**改了 skill 就升它的 `version`。** 提交 `c2230a1` 的说明：“改动某个 skill 后要同步改它的 version，atw update 才会覆盖用户已安装的那份。” 不升版本，改动到不了已经装过的用户手里。

现有取值：

| 情况 | 取值 | 例子 |
|------|------|------|
| skill 自己带版本号 | 与它自带的对外版本一致 | `archify` 的 `"2.16"` = `skills/archify/SKILL.md` 的 `metadata.version`；`unlazy` 的 `"2.1.0"` = `skills/unlazy/package.json` 的 `version` |
| skill 自己不带版本号 | `"1.0.0"` | 其余全部，包括上游整包 `onetake`（它的 `SKILL.md` 和 `README.md` 里都没有版本号） |

**升哪一段没有约定。** 登记为 `1.0.0` 的 skill 都还没有发生过第二次改动，仓库里既没有先例，也不知道 `atw update` 是按“不相等”还是按“更大”来判断。第一次遇到时向维护者确认，并把结论补进本节。

安装器这一边是按“不相等”判断的：已装的版本（记在 skill 目录里的安装标记 `.oxy-tools.json`）与清单的不一样，列表里就同时显示两个版本，更旧或更新都算；它不解析版本号，只比文字。所以对安装器来说，只要改了 `version` 的文字，已经装过的用户就看得到。

---

## catalog.json 的字段契约

`catalog.json` 登记目录里 skill 以外的条目。它是为安装器新增的文件，对 A Team Workflow 的承诺里没有它。下面两个例子里的条目是样例，不是目录里真有的。

```json
{
  "version": 1,
  "mcps": [],
  "tools": [],
  "apps": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version`（顶层） | 整数 | 格式版本号，当前为 `1`，见下节。加条目时不动它 |
| `mcps` | 数组 | MCP 条目。可缺省，缺省当作空 |
| `tools` | 数组 | 工具条目。可缺省 |
| `apps` | 数组 | 应用项目条目。可缺省 |

三个数组现在都是空的，条目由维护者自己给出。主菜单只列有条目的分组。

**三类条目共有的字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 小写 kebab-case，字符集与 skill 的 `name` 相同。**只在各自的数组里唯一**：应用项目可以和某个 skill 同名；同一个数组里重名的只留第一条 |
| `description.zh`、`description.en` | 是 | 中英文各一句说明，写法同 `index.json` |
| `url` | 是 | 官方链接。只收 `https://` 开头的网址，别的字符（汉字、空格）先做百分号编码。应用项目的会显示出来并在浏览器里打开；MCP 和工具的目前不显示 |

**MCP 条目另有**

| 字段 | 必填 | 说明 |
|------|------|------|
| `hosts` | 否 | 支持的宿主的标识：`claude-code`、`codex`。省略表示全部支持；写了就不能为空 |
| `server` | 是 | 连接方式，恰好取一种：本地进程 `{ "command": "npx", "args": ["-y", "…"] }`（`args` 可省略），或远程地址 `{ "url": "https://…" }`（只指可流式的 HTTP） |
| `env` | 否 | 启动时要带上的环境变量（通常是 API key），**只适用于本地进程方式**。每项是 `name`（变量名）、`required`（布尔，必须写）、`description`（`zh`、`en`）、`url`（去哪申请） |

```json
{
  "name": "exa",
  "description": { "zh": "…", "en": "…" },
  "url": "https://…",
  "hosts": ["claude-code", "codex"],
  "server": { "command": "npx", "args": ["-y", "exa-mcp-server"] },
  "env": [
    { "name": "EXA_API_KEY", "required": true, "description": { "zh": "…", "en": "…" }, "url": "https://dashboard.exa.ai/api-keys" }
  ]
}
```

`command` 和 `args` 的每一项只收字母、数字和 `@ : / . _ = + , ~ -`：带空格或引号的参数、带查询串的网址参数、Windows 路径写不进来。

**工具条目另有**

| 字段 | 必填 | 说明 |
|------|------|------|
| `hosts` | 否 | 同 MCP。工具不装进宿主，它只决定这一条可不可选 |
| `install.default` | 是 | 官方安装命令，**一整行，交给系统的 shell 执行**（POSIX 上 `sh`，Windows 上 `cmd.exe`）。只收看得见的 ASCII 字符，首尾不留空格 |
| `install.macos`、`install.linux`、`install.windows` | 否 | 这个系统另用的一条命令；给 `null` 表示这个系统不支持，安装器在该系统上把它显示为不可选 |
| `check` | 是 | 怎么算装好了，恰好取一种：`{ "command": "uv" }`（这个命令在可执行路径上）或 `{ "path": ".bun/bin/bun" }`（用户主目录下的这个相对路径存在） |

```json
{
  "name": "uv",
  "description": { "zh": "…", "en": "…" },
  "url": "https://docs.astral.sh/uv/",
  "install": {
    "default": "curl -LsSf https://astral.sh/uv/install.sh | sh",
    "windows": "powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\""
  },
  "check": { "command": "uv" }
}
```

**应用项目条目**只有共有字段。

**这些字段的内容会被执行。** 目录是安装器运行时拉取的远程数据：MCP 的 `server` 会拼进宿主的命令并记进它的配置，工具的 `install` 会整行交给 shell。安装器执行前都完整展示并取得确认，但往 `catalog.json` 加条目仍然等于往用户的机器上放命令——只放官方给出的安装方式。

写坏的条目只有那一条被安装器跳过，其余照常；不认识的字段一律忽略。每个字段逐字的规则和为什么收得这么紧：

| 条目 | 在哪 |
|------|------|
| 共有字段、应用项目 | [CLI 层的入口与测试](../cli/installer-entry.md) 的“Validation & Error Matrix” |
| MCP | [CLI 层的安装 MCP](../cli/mcp-install.md) 的“Contracts” |
| 工具 | [CLI 层的安装工具](../cli/tool-install.md) 的“Contracts” |

---

## 格式版本号

`index.json` 和 `catalog.json` 顶层的 `version` 是各自的**格式版本号**，整数，从 `1` 开始，当前都是 `1`。它和 skill 条目里的 `version`（那个 skill 的版本）不是一回事。

新格式一推上 `main`，用户手里已经发出去的每一版安装器立刻就会读到（[ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)），所以：

| 改动 | 升不升版本号 | 旧版安装器会怎样 |
|------|--------------|------------------|
| 增删条目 | 不升 | 照常 |
| **新增可选字段** | **不升** | 忽略不认识的字段，照常 |
| 给 `hosts` 加一个新的宿主标识 | 不升 | 不认识的标识留着不管 |
| **不兼容的改动**，如改字段名、改字段的类型或含义 | **必须升** | 遇到比自己认识的更高的版本号，不尝试解析，提示 `npx oxy-tools@latest` 并以非零状态退出 |

- 安装器认识到哪个版本，记在 `cli/src/catalog.ts` 的 `SUPPORTED_FORMAT`；升格式版本号就要连着改它并发一个 npm 版本。升版本号还没有发生过，具体怎么操作（先发安装器还是先推数据、哪些改动算不兼容）没有约定，第一次遇到时向维护者确认，并把结论补进本节。
- `index.json` 在 A Team Workflow 的承诺之内，升它的格式版本号之前见下节。
- **第一版发布之前的例外**：`catalog.json` 的条目格式是按两个宿主实际接受的配置方式定的，还没有经过真实条目检验。`oxy-tools` 发布到 npm 之前（2026-10-09 时尚未发布），维护者加入第一批真实条目时发现装不进现有格式，可以直接改格式而不升版本号。发布之后这条例外作废。

---

## 对 A Team Workflow 的承诺

A Team Workflow 安装额外 skill 时读本仓库。它依赖下面三样（[ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)），**改动其中任何一样之前，必须先看 A Team Workflow 那边怎么读的**——它的代码不在本仓库，在这里看不出改了会不会坏。

| 承诺 | 具体是什么 | 哪些改动会碰到它 |
|------|------------|------------------|
| 1. `main` 分支根目录的 `index.json`，及每条的四个字段 | 文件在 `main` 分支的仓库根，名字是 `index.json`；`skills` 数组里每条都有 `name`、`version`、`path`、`description` | 挪动或改名 `index.json`、换默认分支、改这四个字段的名字或类型、改顶层的结构、升 `index.json` 的格式版本号 |
| 2. `path` 下有 `SKILL.md` | 每条的 `path` 指向仓库里一个真实存在的目录，目录里有 `SKILL.md` | 让 skill 的入口不再是 `SKILL.md`、清单里登记一个内容不在本仓库的 skill |
| 3. 仓库可整包下载，不提交依赖目录和构建产物 | 它下载的是整个仓库，不是单个 skill | 提交 `node_modules`、`cli/dist`、界面预览页等生成物 |

右边一栏是照承诺的字面列的，不是穷举；“会不会坏”只有 A Team Workflow 那边的代码说了算。

- 给 `index.json` 的条目**新增字段**对安装器是兼容的（它忽略不认识的字段），对 A Team Workflow 是否兼容在本仓库内无从验证，同样先看。
- 第 3 条靠忽略规则守着：`cli/.gitignore` 挡着 `node_modules/`、`dist/`、`.preview/`、`*.tgz`。往仓库里加新的生成物之前先加忽略规则。
- 仓库整包现在约两百多 MB（`onetake` 在仓库里有三份：源，加上 `.claude/skills` 和 `.agents/skills` 下的两份安装副本）。安装器按 skill 单独下载，不受影响；A Team Workflow 下载的是整包。这件事另行处理，还没有做。

---

## 校验

清单会出的问题：

| 情况 | 后果 |
|------|------|
| `name` 与目录名或 frontmatter 不一致 | 清单指向的 skill 身份对不上 |
| `skills/` 下有目录但清单没有条目 | 该 skill 不出现在可选列表里 |
| 清单有条目但目录不存在 | 清单指向不存在的路径 |
| 改了 skill 没升 `version` | 已安装用户拿不到更新 |
| 缺 `zh` 或 `en` | 某个语言的列表里缺说明 |
| JSON 语法错误 | 整个清单读不了 |

安装器读不读得了 `index.json` 和 `catalog.json`、会不会跳过其中的条目（缺字段、字段不合规则、重名、JSON 语法错误、格式版本号不对），由目录校验命令查：在 `cli/` 下运行 `npm run validate-catalog -- ..`，通过时输出 `目录校验通过：N 个 skill、M 个 MCP、K 个工具、J 个应用项目`；CI 在推送后也跑这一条（见 [CLI 层的目录校验与 CI](../cli/catalog-validation.md)）。**改了这两个文件的任何一个，提交前都跑它。**

清单与 `skills/` 对不对得上，那条命令不查——它不读 `skills/`。这一部分没有签入的脚本，也没有既定的流程。下面这段检查的是上表前三项、键集合和排序，在仓库根运行，通过时输出 `index.json 通过（N 个 skill）`：

```bash
python3 - <<'EOF'
import json, pathlib, re
idx = json.load(open('index.json'))
names = [s['name'] for s in idx['skills']]
dirs = {p.name for p in pathlib.Path('skills').iterdir() if p.is_dir()}
bad = []
for s in idx['skills']:
    p = pathlib.Path(s['path'])
    fm = re.search(r'^name:\s*(.+)$', (p / 'SKILL.md').read_text(encoding='utf-8'), re.M)
    if not (fm and s['name'] == p.name == fm.group(1).strip().strip('"')):
        bad.append(f"name 不一致: {s['name']}")
    if s['path'] != f"skills/{s['name']}":
        bad.append(f"path 不规范: {s['path']}")
    if sorted(s) != ['description', 'name', 'path', 'version']:
        bad.append(f"键不对: {s['name']}")
    if sorted(s['description']) != ['en', 'zh']:
        bad.append(f"说明缺语言: {s['name']}")
if dirs - set(names): bad.append(f"未登记: {sorted(dirs - set(names))}")
if set(names) - dirs: bad.append(f"目录不存在: {sorted(set(names) - dirs)}")
if names != sorted(names): bad.append("未按 name 升序")
print('\n'.join(bad) or f"index.json 通过（{len(names)} 个 skill）")
raise SystemExit(1 if bad else 0)
EOF
```

它查不出“改了 skill 没升版本”。这条用 `git diff --stat` 对照：`skills/<name>/` 下有改动的，`index.json` 的 diff 里要有那个 `name` 的 `version` 行。

```diff
# 错：只改了正文，index.json 没动
 skills/wizard/SKILL.md | 4 ++--

# 对：正文和版本一起改
 skills/wizard/SKILL.md | 4 ++--
 index.json             | 2 +-
```
