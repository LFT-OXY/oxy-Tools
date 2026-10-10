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
  "purposes": [
    { "id": "web-search", "name": { "zh": "联网搜索与文档检索", "en": "Web search & docs retrieval" } }
  ],
  "skillPurposes": { "archify": "documents" },
  "thirdPartySkills": [],
  "mcps": [],
  "tools": [],
  "apps": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version`（顶层） | 整数 | 格式版本号，当前为 `1`，见下节。加条目时不动它 |
| `purposes` | 数组 | 用途清单，**有序**：数组里的先后就是用途的先后。可缺省，缺省当作空 |
| `purposes[].id` | 字符串 | 用途的标识，小写 kebab-case（字符集与条目的 `name` 相同），在清单里唯一。条目的 `purpose` 写的就是它 |
| `purposes[].name.zh`、`purposes[].name.en` | 字符串 | 用途的中英文名称，显示给用户看的 |
| `skillPurposes` | 对象 | 本仓库个别 skill 的用途：键是 skill 的 `name`（要在 `index.json` 里有），值是一个用途的标识。可缺省。**只写要另外出现在某个用途下的 skill**，不写的只在「推荐」里 |
| `thirdPartySkills` | 数组 | 第三方 Skill 条目：内容不在本仓库、由安装器调用 skills CLI 装的那些（[ADR-0003](../../../docs/adr/0003-third-party-skills-installed-by-skills-cli.md)）。可缺省，缺省当作空。**它们登记在这里而不是 `index.json`**：skill 清单只登记内容在本仓库的 skill，这是对 A Team Workflow 的承诺 |
| `mcps` | 数组 | MCP 条目。可缺省，缺省当作空 |
| `tools` | 数组 | 工具条目。可缺省 |
| `apps` | 数组 | 外部项目条目（键名没有跟着改叫法：改键名是不兼容的改动）。可缺省 |

`mcps` 现在有 11 条，`apps` 有 64 条（2026-10-10 录入「汇总」文档：标了 MCP 的 21 个条目里装法试通的 11 个是 MCP，其余 10 个先作为外部项目；既不是 MCP 也不是 Skill 的 47 个条目都作为外部项目；2026-10-11 又录入标了 Skill 而不适合由 skills CLI 装的 7 个），`tools` 还是空的。主菜单只列下面有条目的用途；按类型分的入口已经全部取消。

`purposes` 现在有 10 个用途，`skillPurposes` 里有 4 个 skill（`archify`、`onetake`、`unlazy`、`shuorenhua`）。增删改一个用途只要提交本仓库，不用发 npm 版本。**本仓库 skill 的用途记在这里而不是 `index.json`**：skill 清单在对 A Team Workflow 的承诺之内，给它的条目加字段会不会坏在本仓库内无从验证。本仓库的 skill 不靠任何标注就属于「推荐」，所以大多数 skill 在 `skillPurposes` 里没有、也不该有。

`thirdPartySkills` 现在有 23 条、共 100 个 skill（2026-10-11 录入「汇总」文档里标了 Skill、不在本仓库的条目：逐个试装通过的 23 个仓库；规矩见下面「往目录里加一条第三方 Skill」）。

**四类条目（第三方 Skill、MCP、工具、外部项目）共有的字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 小写 kebab-case，字符集与 skill 的 `name` 相同。**只在各自的数组里唯一**：外部项目可以和某个 skill 同名；同一个数组里重名的只留第一条 |
| `description.zh`、`description.en` | 是 | 中英文各一句说明，写法同 `index.json` |
| `url` | 是 | 官方链接。只收 `https://` 开头的网址，别的字符（汉字、空格）先做百分号编码。外部项目的会整条显示出来让用户自己打开（安装器不替他开浏览器）；MCP 和工具的目前不显示 |
| `purpose` | 是 | 这一条的用途：`purposes` 里某一项的 `id`。有且只有一个。没写、或写的标识不在 `purposes` 里，这一条都会被安装器跳过 |
| `recommended` | 否 | 布尔。`true` 表示这一条另外出现在「推荐」里；省略等于 `false` |

**第三方 Skill 条目另有**

| 字段 | 必填 | 说明 |
|------|------|------|
| `source` | 是 | 来源：GitHub 上的「所有者/仓库」，如 `zsyggg/paper-craft-skills`。只写这两段，不写网址；每段以字母或数字开头，只含字母、数字和 `. _ -` |
| `skills` | 是 | 这个仓库里可以装的 skill，至少一个，名字不重复。只含一个时用户勾了条目就直接装它；含多个时安装器列出来让用户挑 |
| `skills[].name` | 是 | skill 自己声明的名字（它 `SKILL.md` 的 frontmatter 里的 `name`），**写成小写**：只含小写字母、数字和 `. _ -`，以小写字母或数字开头，不以 `.` 或 `-` 结尾，连字符不连着写。skills CLI 按名字选的时候不分大小写，装出来的目录名是小写的，安装器就是去看那个目录 |
| `skills[].description.zh`、`.en` | 是 | 这个 skill 的一句说明。有前提或要留意之处（要付费账号、会结束浏览器、默认加署名）写在这里，用户在清单里看得到 |
| `hosts` | 否 | 同 MCP：支持的宿主的标识，省略表示全部支持 |

```json
{
  "name": "paper-craft-skills",
  "description": { "zh": "…", "en": "…" },
  "url": "https://github.com/zsyggg/paper-craft-skills",
  "purpose": "documents",
  "source": "zsyggg/paper-craft-skills",
  "skills": [
    { "name": "paper-analyzer", "description": { "zh": "…", "en": "…" } },
    { "name": "paper-comic", "description": { "zh": "…", "en": "…" } }
  ]
}
```

条目的 `name` 是它在目录里的名字（列表里的那一行），和 `source`、和里面 skill 的名字都可以不同。**同一个 skill 名字不要出现在两个条目里，也不要和本仓库的 skill 重名**：它们会装到同一个目录，后装的盖掉先装的——目录校验命令现在不查这个。

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
  "purpose": "web-search",
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
  "purpose": "dev-workflow",
  "install": {
    "default": "curl -LsSf https://astral.sh/uv/install.sh | sh",
    "windows": "powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\""
  },
  "check": { "command": "uv" }
}
```

**外部项目条目**只有共有字段。

**这些字段的内容会被执行。** 目录是安装器运行时拉取的远程数据：第三方 Skill 的 `source` 和 skill 的名字会成为 `npx skills add` 的参数（装进来的内容由那个仓库的作者决定，维护者没有逐版检查），MCP 的 `server` 会拼进宿主的命令并记进它的配置，工具的 `install` 会整行交给 shell。安装器执行前都完整展示并取得确认，但往 `catalog.json` 加条目仍然等于往用户的机器上放命令——只放官方给出的安装方式。

### 往目录里加一条第三方 Skill

加的是「所有者/仓库」和其中每个 skill 的名字，它们会原样成为 `npx skills add` 的参数；装进用户机器的内容由那个仓库的作者定。下面是 2026-10-11 录入 23 个仓库（100 个 skill）时守的规矩，标了「未确认」的是实现者定的，维护者还没有逐条确认。字段的规则在 [CLI 层的安装 skill](../cli/skill-install.md) 的第二个 Scenario。

| 事项 | 规矩 |
|------|------|
| skill 的名字从哪来 | 只认 `npx -y skills@1 add <来源> --list` 列出来的，不凭目录名，也不凭别人的报告：目录名和声明的名字常常不同（`brutalist-skill` 声明的是 `industrial-brutalist-ui`），一个仓库里同名的 `SKILL.md` 可以有几十份 |
| 登记几个 | 上游的全部，不替用户筛：[上游核对命令](../cli/catalog-validation.md)没有「有意只登记一部分」的说法，少登记一个它就一直报。只想要一个大仓库里的一两个时，那个仓库不收（`sammcj/agentic-coding` 就是这样没收的） |
| 试通 | 每个 skill、每个宿主各装一次，执行的就是安装器会执行的那一条命令：以 0 退出、目标位置下有 `SKILL.md`，才登记；试不通的登记为外部项目并写明原因。做法见 [CLI 层](../cli/index.md) 的「发布前在本机核对」。它只证明装得上，不证明好用 |
| 来源和链接（未确认） | `source` 和 `url` 都写仓库**现在**的地址：改过名、转给别人的用现名（`gh api repos/<所有者>/<仓库> --jq .full_name` 给的那个，大小写也照它），旧名字上游核对命令会报 |
| 条目的名字（未确认） | 仓库名转成小写 kebab-case；仓库名太泛的带上所有者（`emilkowalski/skills` → `emilkowalski-skills`） |
| 同名的 skill | 录入前查一遍：不同条目之间、和本仓库的 skill 之间都不能有同名的 skill——它们会装到同一个目录，安装器和目录校验命令都不查（见 [安装 skill](../cli/skill-install.md) 第二个 Scenario 的「已知的限制」） |
| 说明写在哪一级 | **只含一个 skill 的条目，前提和风险写在条目的说明里**，那个 skill 的说明照抄同一句：安装器只对含多个 skill 的条目出清单，只含一个的，用户看得到的只有条目的说明。含多个的，条目的说明写整包的前提，各个 skill 的说明写各自的 |
| 说明的写法 | 一句「它做什么」，不写触发条件，正文里不用分号连成两句；前提、风险、怎么开关写在句末的括号里，几件事之间用分号。宿主写成 `AI Agent`。写法同外部项目的那两行 |
| 说明里要注明的 | 读**装出来的那一份** `SKILL.md`、它带的脚本和仓库的 README 来定（不运行其中任何脚本）：离了官方的插件就不完整的（自动触发、钩子、子代理）；要另装的程序和它的版本；要账号、key，会把内容发到哪；会动用户别的东西的（结束浏览器、读书签和 Cookie、往主目录里存状态）；首次运行自己联网下载程序或自更新的；体积很大的（几十 MB 以上）；有使用限制的（仅限非商业）；要点名才触发的。收不收费这类说法要有出处（官网的价目页），没有就不写 |
| 装上的是哪一份 | 仓库里同一个名字有多份 `SKILL.md` 时，把仓库浅克隆到另一个临时目录，按文件内容的哈希比出装上的是哪一份。skills CLI 按它搜目录的顺序取第一份，`.agents/skills` 排在最前：`pbakaus/impeccable` 两个宿主装上的都是给 Codex 编的那一份，这要写进说明 |
| 宿主限制 | `hosts` 只在实测出某个宿主下不能用时才写。读出来偏向某个宿主的（脚本路径用了 `${CLAUDE_SKILL_DIR}`、说明自称给 Codex 写的）写在说明里，注明没有验证过 |
| 数组里的先后 | 照来源文档的顺序；一个条目里 skill 的先后照 `--list` 的顺序。列表里实际的排法由安装器定 |
| 录完跑什么 | 目录校验命令、上游核对命令（设上 `GITHUB_TOKEN`），再拿来源清单按链接对一遍账（同外部项目的「成批录入要对账」，另查同名的 skill） |

每个仓库列出了哪些 skill、试装的结果、说明里每句前提的出处，记在任务 `10-10-catalog-purpose-categories` 的 `research/skill-trial-record.md`（任务归档后在 `.atw/tasks/archive/` 下）。

```jsonc
// 错：只含一个 skill 的条目，风险只写在 skill 的说明里——这种条目不出清单，用户看不到
{ "name": "impeccable", "description": { "zh": "给 AI 编码 Agent 用的前端设计指南" },
  "skills": [{ "name": "impeccable", "description": { "zh": "…（首次运行会自己联网下载一个程序并执行）" } }] }

// 对：写在条目的说明里，skill 的说明是同一句
{ "name": "impeccable", "description": { "zh": "给 AI 编码 Agent 用的前端设计 skill：…（…首次运行会自己联网从 GitHub 下载一个程序到 ~/.impeccable 并执行；…）" },
  "skills": [{ "name": "impeccable", "description": { "zh": "（同上一句）" } }] }
```

### 往目录里加一条 MCP

加条目等于往用户的机器上放命令，而且一推上 `main`，已经发出去的每一版安装器立刻读到。下面是 2026-10-10 录入第一批 MCP 时守的规矩，其中标了「未确认」的是实现者定的，维护者还没有逐条确认。

| 事项 | 规矩 |
|------|------|
| 连接方式 | 只取它官方说明（README 或官方文档）里给出的启动命令，不自己拼。官方只给了「先装程序、再用程序名启动」的（`npm install -g` 之后 `"command": "codegraph"`、安装脚本、克隆再构建、插件），安装器装不出能用的东西，登记为外部项目 |
| 写不进条目格式的 | 启动命令或参数里有空格、引号、非 ASCII 字符；必填的值只能作为命令行参数给（条目格式只替用户问环境变量）；远程地址要靠请求头带 key——都登记为外部项目 |
| 名字（未确认） | 用官方说明里那个服务器的名字（`chrome-devtools`、`playwright`），不用仓库名。它会成为宿主配置里的键：照官方说明装过的用户在安装器里看到的才是「已配置」，AI 看到的工具名也和各处文档一致。官方的名字会和另一个常见的 MCP 撞上时另取，并记下原因 |
| 环境变量 | 只登记必填的和最常用的可选项——每个可选项都是用户要多按一次回车的一问。变量名要在官方说明或它的源码里核对过；`url` 写申请的地方，官方没说的写它说明这个变量的那一页 |
| 说明里要注明的 | 用 `uvx` 启动的注「需要 uv」（没装 uv 时配置照样写得进去，但服务器起不来，安装器不查这个）；要有 key 才能用、而录入时没有带真的 key 验证过的，注「没有带 key 验证过」；上游已归档的注明。写在句末的括号里，写法同 `onetake` |
| 试通 | 录入前在临时目录里经安装器用真实的宿主命令装一次，两个宿主的配置里都出现这一条，才登记为 MCP；做法见 [CLI 层](../cli/index.md) 的「发布前在本机核对」。它只证明配置写得进去，不证明服务器起得来 |
| 包在不在 | 只读地查一眼：`npm view <包名> version`，或 `https://pypi.org/pypi/<包名>/json` |

第一批每一条的出处、试通结果和没登记成 MCP 的原因，记在任务 `10-10-catalog-purpose-categories` 的 `research/mcp-trial-record.md`（任务归档后在 `.atw/tasks/archive/` 下）。

```jsonc
// 错：官方说明里没有这种启动方式，是照着「npm 包里有可执行入口」推出来的
{ "name": "codegraph", "server": { "command": "npx", "args": ["-y", "@colbymchenry/codegraph", "serve", "--mcp"] } }

// 对：官方说明原样给出的命令；名字是官方给这个服务器取的名字
{ "name": "playwright", "server": { "command": "npx", "args": ["@playwright/mcp@latest"] } }
```

### 往目录里加一条外部项目

外部项目只有共有字段，装不出东西，所以没有「试通」；要守的是名字、说明和链接。下面是 2026-10-10 录入 47 条时的做法，标了「未确认」的是实现者定的，维护者还没有逐条确认。

| 事项 | 规矩 |
|------|------|
| 类型 | 装法没有实际试通过的一律是外部项目，哪怕它官方给了一条安装命令。看起来一条命令能装的另记一张候选清单（官方命令、怎么算装好了、前提），等在虚拟机里试通后再改成工具 |
| 名字（未确认） | 仓库名转成小写 kebab-case，不替它拆词（`OfficeCLI` → `officecli`、`MuMuAINovel` → `mumuainovel`）——先前录入的 `grok-search-rs` 是拆了词的，两种写法现在并存，哪一种算数等维护者定；名字规则不收的字符换成连字符（`design.md` → `design-md`）。来源里写错的名字照仓库名改 |
| 和别的数组重名 | 允许，名字只在各自的数组里唯一：`apps` 的 `playwright`（开发库）和 `mcps` 的 `playwright` 并存 |
| 说明 | 从来源文档取意思，再对照仓库的官方简介和 README 的开头改写成一句「它做什么」。来源文档和官方说法对不上时以官方的为准；只有来源文档里有、官方说明里找不到的说法不写。效果类的说法（省多少、快几倍、能降低什么）没有验证过，不当事实写 |
| 说明里要注明的 | 只注从官方说明里看得到、且不知道就用不了的前提：要账号、只支持某个系统、要自备大模型。写在句末的括号里，写法同 `onetake` |
| 链接（未确认） | 写来源文档给的那个，方便日后按链接和来源对账。仓库换了所有者、旧链接还在跳转的也先不改，在录入记录里写明新地址 |
| 数组里的先后 | 照来源文档的顺序，同一个用途的排在一起 |
| 仓库还在不在 | 只读地查一眼：`gh api repos/<所有者>/<仓库> --jq '[.full_name, .archived]'`。`full_name` 和写的不一样就是改了名或换了所有者；已归档的在说明里注明 |

**成批录入要对账。** 目录校验命令只查每一条写得对不对，查不出「漏了一条」「同一个项目录了两条」「用途标错了」。成批录入时写一段脚本拿来源清单和 `catalog.json` 按链接逐条对：每个链接恰好一条、用途对得上、没有同时出现在别的数组里。2026-10-10 用的那一段在任务 `10-10-catalog-purpose-categories` 的 `research/external-project-entries.md`，可以照着改。

```jsonc
// 错：照抄了仓库简介，一句里是两句；「降低检测率」是没验证过的效果
{ "name": "awesome-design-md", "description": { "en": "…; drop one into your project and coding agents generate matching UI" } }
{ "name": "bypassaigc", "description": { "zh": "给论文润色并降低 AI 生成内容检测率的学术写作工具" } }

// 对：改写成一句；效果写成它的目的
{ "name": "awesome-design-md", "description": { "en": "Collection of DESIGN.md files derived from popular brands' design systems, for coding agents to follow when generating UI in the same style" } }
{ "name": "bypassaigc", "description": { "zh": "给论文润色、以降低 AI 生成内容检测率为目标的学术写作工具" } }
```

写坏的条目只有那一条被安装器跳过，其余照常；不认识的字段一律忽略。`purposes` 和 `skillPurposes` 写坏了不会让整份目录读不了：`purposes` 里写坏的一项不算数（用它的条目跟着被跳过），`skillPurposes` 里写坏的一项只是不起作用（那个 skill 照常在「推荐」里）——这两样安装器都不提，由目录校验命令报出来。每个字段逐字的规则和为什么收得这么紧：

| 条目 | 在哪 |
|------|------|
| 共有字段（含 `purpose`、`recommended`）、外部项目、`purposes`、`skillPurposes` | [CLI 层的入口与测试](../cli/installer-entry.md) 的“Validation & Error Matrix” |
| 第三方 Skill | [CLI 层的安装 skill](../cli/skill-install.md) 的第二个 Scenario |
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
| 新增顶层的键（如 `purposes`、`skillPurposes`） | 不升 | 同上：不认识的键不读 |
| 给 `hosts` 加一个新的宿主标识 | 不升 | 不认识的标识留着不管 |
| **不兼容的改动**，如改字段名、改字段的类型或含义 | **必须升** | 遇到比自己认识的更高的版本号，不尝试解析，提示 `npx oxy-tools@latest` 并以非零状态退出 |

- 安装器认识到哪个版本，记在 `cli/src/catalog.ts` 的 `SUPPORTED_FORMAT`；升格式版本号就要连着改它并发一个 npm 版本。升版本号还没有发生过，具体怎么操作（先发安装器还是先推数据、哪些改动算不兼容）没有约定，第一次遇到时向维护者确认，并把结论补进本节。
- `index.json` 在 A Team Workflow 的承诺之内，升它的格式版本号之前见下节。
- **改了格式就拿已发布的旧版实际读一遍。**「旧版会忽略不认识的字段」是推断，要看到画面才算数。都在临时目录里做，只看画面、不装东西：

  ```bash
  W=$(mktemp -d) && cd "$W" && npm init -y >/dev/null && npm install oxy-tools@0.2.0
  export HOME="$W/home" CLAUDE_CONFIG_DIR="$W/home/claude" CODEX_HOME="$W/home/codex"   # 不碰真实的主目录和宿主配置
  mkdir -p "$HOME" && OXY_TOOLS_CATALOG=<本仓库根> npx --no-install oxy-tools --lang zh
  ```

  安装器要交互式终端：自己在终端里跑，或用伪终端驱动（见 [CLI 层](../cli/index.md) 的「发布前在本机核对」）。看三样：「目录」一行的数量对、没有「条目格式有误」的提醒、主菜单是它原来的分组。2026-10-10 加 `purposes`、`skillPurposes` 时用 0.2.0 这样核对过：`目录  12 skill`，主菜单 `Skill 12` 和 `退出`，进入后照常列出 skill。同一天录入第一批带 `purpose` 的条目后又核对了一遍：「目录」一行是 12 个 skill、11 个 MCP、10 个外部项目，主菜单多出 `MCP 11` 和外部项目那一组 `10`（0.2.0 的画面上这一组还是旧名字），进 MCP 后照常列出 11 条。2026-10-11 全部条目录完后（任务 `10-10-catalog-purpose-categories` 工单 14）拿最终的目录又核对了一遍：12 个 skill、11 个 MCP、64 个外部项目，三个分组都进得去、列表照常，没有「条目格式有误」的提醒；23 个第三方 Skill 它不认识、不显示，目录里没有工具所以没有工具那一组。记录在该任务的 `research/legacy-installer-compat-record.md`。
- **第一版发布之前的例外已经作废**：`oxy-tools` 发布到 npm 之前，`catalog.json` 的格式可以直接改而不升版本号。它已经发布（0.2.0），此后对格式的每一处改动都照上表办。
- **「必填」是对新版安装器说的，不是对格式版本说的。** 条目的 `purpose` 是 0.2.0 之后加的：0.2.0 不认识它、照旧显示它的四个分组；认识它的版本遇到没有 `purpose` 的条目会跳过。所以它算「新增可选字段」，格式版本号没有升。往目录里加条目时照新版的要求写全。

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

安装器读不读得了 `index.json` 和 `catalog.json`、会不会跳过其中的条目（缺字段、字段不合规则、重名、没有用途或用途不在清单里、JSON 语法错误、格式版本号不对），以及用途清单和本仓库 skill 的用途有没有写坏，由目录校验命令查：在 `cli/` 下运行 `npm run validate-catalog -- ..`，通过时输出 `目录校验通过：N 个 skill、T 个第三方 Skill、M 个 MCP、K 个工具、J 个外部项目、P 个用途`；CI 在推送后也跑这一条（见 [CLI 层的目录校验与 CI](../cli/catalog-validation.md)）。**改了这两个文件的任何一个，提交前都跑它。**

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
