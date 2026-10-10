# 目录校验与 CI

> 目录校验命令 `cli/scripts/validate-catalog.ts`（测试的辅助接缝）、上游核对命令 `cli/scripts/check-upstream.ts`（同一种接缝，但不进 CI），以及跑测试和校验的工作流 `.github/workflows/cli.yml`。

---

## Scenario: 目录校验命令

### 1. Scope / Trigger

维护者提交前、CI 在推送后，用同一条命令确认：仓库里的 `index.json` 和 `catalog.json`，安装器整份读得了，一条都不会跳过，而且用途清单和本仓库 skill 的用途没有写坏的地方。凡是给目录加一类条目、加一个字段、改一条校验规则，都落在这份契约上。

### 2. Signatures

```bash
# 在 cli/ 下运行；<目录> 里要有 index.json 和 catalog.json，校验本仓库时给 ..
npm run validate-catalog -- <目录>
```

```ts
// cli/src/catalog.ts —— 命令和安装器共用的那一份校验
export async function loadCatalog(source: CatalogSource): Promise<Catalog>;

export interface Catalog {
  skills: Skill[];
  thirdPartySkills: ThirdPartySkill[]; // 字段见「安装 skill」的第二个 Scenario
  mcps: Mcp[];             // 字段见「安装 MCP」
  tools: Tool[];           // 字段见「安装工具」
  apps: App[];             // 应用项目：{ name, description: { zh, en }, url, purpose, recommended }
  purposes: Purpose[];     // 用途清单：{ id, name: { zh, en } }，顺序照文件
  skipped: SkippedEntry[]; // 被跳过的条目：校验不通过的，以及与前面重名的
  flaws: CatalogFlaw[];    // 写坏了、但没有哪个条目因它本身被跳过的地方；只有本命令报
}
export interface SkippedEntry {
  file: string;             // 所在的目录文件
  list: string;             // 所在的数组：skills、thirdPartySkills、mcps、tools、apps
  position: number;         // 第几条，从 1 数起
  name: string | undefined; // 名字本身不合规则时没有
  problem: EntryProblem;
}
export type EntryProblem =
  | { kind: 'not-object' }
  | { kind: 'bad-field'; field: string; rule: FieldRule }
  | { kind: 'duplicate' }
  | { kind: 'unlisted-purpose'; purpose: string }; // 写的用途不在用途清单里
export type FieldRule =
  | 'name' | 'text' | 'relative-path' | 'object' | 'https-url'
  | 'host-list' | 'mcp-server' | 'command-word' | 'command-word-list'
  | 'env-list' | 'env-name' | 'boolean' | 'local-only'
  | 'shell-command' | 'os-command' | 'tool-check' | 'command-name'
  | 'purpose' | 'skill-source' | 'skill-list' | 'sourced-skill-name';
export type CatalogFlaw = { file: string } & (
  | { kind: 'purposes-not-array' }
  | { kind: 'purpose'; position: number; id: string | undefined; problem: EntryProblem }
  | { kind: 'skill-purposes-not-object' }
  | { kind: 'unknown-skill'; skill: string | undefined }               // 名字本身不合规则时没有 skill
  | { kind: 'skill-purpose'; skill: string; purpose: string | undefined } // 写的不是标识时没有 purpose
);
```

命令只做三件事：用 `localCatalogSource(<目录>)` 调 `loadCatalog`，把结果说成人话，定退出状态。**它自己不含任何校验规则**——这样“命令通过”和“安装器读到的目录一处都没写坏”永远是一回事：规则都在 `catalog.ts`，写坏的条目进 `skipped`，别的写坏之处进 `flaws`，命令只管把两样都说出来。

它和界面预览页一样是仅供开发的脚本：放在 `cli/scripts/`，用 `node --experimental-strip-types` 直接跑，不进 `dist/`，不随 npm 包发布。目录由参数给出，脚本和 `package.json` 里都不写死 `..`——`cli/` 的代码不引用 `cli/` 以外的文件（ADR-0001），路径是运行的人给的。

### 3. Contracts

| 项 | 约定 |
|----|------|
| 参数 | 恰好一个：本地目录 |
| 标准输出 | 通过信息 |
| 标准错误 | 未通过的说明、用法 |
| 语言与样式 | 只有中文，不带样式，不经呈现层（同 `scripts/preview.ts`） |
| 退出状态 | 0 通过；1 未通过；2 用法不对 |

输出的样子：

```
目录校验通过：12 个 skill、23 个第三方 Skill、11 个 MCP、0 个工具、64 个应用项目、10 个用途
```

通过信息把**校验过的每一类**都数出来，是 0 也写（第三方 Skill 数的是条目，不是它里面的 skill）：它说的是“这一类查过了”，和主菜单上方「目录」一行只数有条目的分组不是一回事。

```
目录校验未通过：有 2 个条目会被安装器跳过
  index.json 的 skills 第 2 条（wizard）：path 要是相对路径：用 / 分段，每段只含字母、数字和 . _ -，且不是 . 或 ..
  index.json 的 skills 第 5 条：条目不是对象
  catalog.json 的 apps 第 2 条（dify）：url 要是 https:// 开头的网址，且只含字母、数字和 -._~:/?#[]@!$&'()*+,;=%（别的字符先做百分号编码）
  catalog.json 的 mcps 第 1 条（exa）：server.args 要是数组，每一项是一个词：只含字母、数字和 @ : / . _ = + , ~ -，不含空白和引号
  catalog.json 的 tools 第 3 条（uv）：install.default 要是一行命令：只含看得见的 ASCII 字符，首尾不留空格，不换行
```

```
目录校验未通过：有 2 个条目会被安装器跳过，另有 2 处写坏了
  catalog.json 的 mcps 第 1 条（exa）：purpose 要是用途清单（purposes）里一个用途的标识（由小写字母和数字组成，分成几段时用连字符连接）；除本仓库的 skill 外，每个条目都要写
  catalog.json 的 tools 第 2 条（uv）：用途 dev-workflwo 不在用途清单（purposes）里
  catalog.json 的 purposes 第 3 项（web-search）：与前面的用途标识重复，只有第一项算数
  catalog.json 的 skillPurposes 里 archify 的用途 document 不在用途清单（purposes）里
```

第一行照实数：只有被跳过的条目时是「有 N 个条目会被安装器跳过」，只有别的写坏之处时是「有 N 处写坏了」，两样都有时如上。被跳过的条目在前，别的在后。

```
目录校验未通过：目录格式有误
  catalog.json 的 tools 不是数组
  /path/to/repo/catalog.json
```

### 4. Validation & Error Matrix

| 情况 | 输出 | 退出状态 |
|------|------|----------|
| 没给目录，或多给了参数 | 用法 | 2 |
| 整份读不了（`loadCatalog` 抛出 `CatalogError`：读不到、不是 JSON、缺版本号、数组字段不是数组、格式版本过高） | 标题和原因沿用 `messages.ts` 里安装器对用户说的那一句（中文），下一行是文件的位置 | 1 |
| `skipped` 非空 | 条数，然后每条一行：哪个文件、哪个数组、第几条、名字（有的话）、问题 | 1 |
| `flaws` 非空 | 处数，然后每处一行，说法见下面「别的写坏之处」 | 1 |
| 都没有 | `目录校验通过：N 个 skill、T 个第三方 Skill、M 个 MCP、K 个工具、J 个应用项目、P 个用途` | 0 |

单条条目的问题：

| `problem.kind` | 含义 | 命令怎么说 |
|----------------|------|------------|
| `not-object` | 条目不是对象 | 条目不是对象 |
| `bad-field` | `field` 这个字段不合 `rule` | 字段名 + 这条规则该是什么样 |
| `duplicate` | 与前面的某一条重名 | 与前面的条目重名 |
| `unlisted-purpose` | `purpose` 是个合规则的标识，但用途清单里没有它（清单本身写坏时，用了坏掉那一项的条目也落在这里） | 用途 `<写的标识>` 不在用途清单（purposes）里 |

没有用途的条目是 `bad-field`（字段 `purpose`、规则 `purpose`），和「用途不在清单里」是两个原因、两句说法：前者是漏写或写的不是标识，后者多半是拼错了，所以把写的那个标识照打出来——它已经过了 `name` 的正则，打到终端上是安全的。

别的写坏之处（`Catalog.flaws`）：

| `kind` | 含义 | 命令怎么说 |
|--------|------|------------|
| `purposes-not-array` | 用途清单不是数组 | `catalog.json 的 purposes 不是数组：安装器会把它当作空的，除本仓库的 skill 外的条目都会被跳过` |
| `purpose` | 用途清单的第几项写坏了，或标识与前面的重复 | `catalog.json 的 purposes 第 N 项（标识）：` 加问题——不是对象、字段该是什么样（`id` 用规则 `name`，`name`、`name.zh`、`name.en` 用 `object`、`text`）、`与前面的用途标识重复，只有第一项算数` |
| `skill-purposes-not-object` | 本仓库 skill 的用途不是对象 | `catalog.json 的 skillPurposes 不是对象：要写成「skill 的名字: 用途的标识」` |
| `unknown-skill` | `skillPurposes` 的一个键不是 `index.json` 里读得出来的 skill（拼错了，或那个 skill 自己被跳过了） | `catalog.json 的 skillPurposes 里 <名字> 不是 index.json 里的 skill` |
| `skill-purpose` | 给这个 skill 写的用途不是标识，或不在用途清单里 | `catalog.json 的 skillPurposes 里 <名字> 的用途要是用途清单（purposes）里一个用途的标识（…）`；`… <名字> 的用途 <标识> 不在用途清单（purposes）里` |

`skillPurposes` 的键不合 `name` 的正则时，说法里不打这个键（`有一个名字不是 index.json 里的 skill`），理由同 `SkippedEntry.name`。说法都在 `scripts/validate-catalog.ts` 的 `describeFlaw`：加一种 `CatalogFlaw` 就要在那里加一句，类型检查会拦住漏的。

| `FieldRule` | 规则 | 现在用在 |
|-------------|------|----------|
| `name` | 小写 kebab-case | `name` |
| `text` | 非空文字，不含控制字符 | `version`、`description.zh`、`description.en` |
| `relative-path` | 相对路径，每段只含字母、数字、`.`、`_`、`-`，且不是 `.`、`..` | skill 的 `path`、工具的 `check.path` |
| `object` | 是对象 | `description` |
| `https-url` | `https://` 开头的网址，只含 RFC 3986 允许的字符 | 应用项目、MCP 和工具的 `url`、MCP 的 `server.url` |
| `host-list` | 非空数组，每一项是宿主的标识（合 `name` 的规则） | MCP 和工具的 `hosts` |
| `mcp-server` | `command` 与 `url` 恰好有一样 | MCP 的 `server` |
| `command-word` | 一个词：只含字母、数字和 `@ : / . _ = + , ~ -` | MCP 的 `server.command` |
| `command-word-list` | 数组，每一项是这样的一个词 | MCP 的 `server.args` |
| `env-list` | 数组，每一项是一个环境变量，变量名不重复 | MCP 的 `env`（不是数组，或有重名） |
| `env-name` | 环境变量的名字：字母、数字、下划线，不以数字开头 | MCP 的 `env[i].name` |
| `boolean` | `true` 或 `false` | MCP 的 `env[i].required` |
| `local-only` | 只能用于本地进程方式 | MCP 的 `env`（远程地址的条目带了非空的 `env`） |
| `shell-command` | 一行命令：只含看得见的 ASCII 字符，首尾不留空格，不换行 | 工具的 `install.default` |
| `os-command` | 同上的一行命令，或 `null`（这个系统不支持） | 工具的 `install.macos`、`install.linux`、`install.windows` |
| `tool-check` | `command` 与 `path` 恰好有一样 | 工具的 `check` |
| `command-name` | 一个命令的名字：只含字母、数字和 `. _ -`，不带目录 | 工具的 `check.command` |
| `purpose` | 用途的标识（与 `name` 同一条正则）；本仓库 skill 以外的条目都要写 | 第三方 Skill、MCP、工具、应用项目的 `purpose`（没写，或写的不是标识） |
| `skill-source` | GitHub 上的「所有者/仓库」：两段、一个斜杠，每段以字母或数字开头，只含字母、数字和 `. _ -` | 第三方 Skill 的 `source` |
| `skill-list` | 非空数组，每一项是这个仓库里的一个 skill，名字不重复 | 第三方 Skill 的 `skills`（不是数组、是空的、有重名） |
| `sourced-skill-name` | skill 自己声明的名字的小写写法：只含小写字母、数字和 `. _ -`，以小写字母或数字开头，不以 `.` 或 `-` 结尾，连字符不连着写 | 第三方 Skill 的 `skills[i].name` |

规则 `name` 现在还用在用途清单每一项的 `id` 上，`object`、`text` 用在它的 `name`、`name.zh`、`name.en` 上，`boolean` 用在四类条目的 `recommended` 上；`host-list`、`https-url` 也用在第三方 Skill 的 `hosts`、`url` 上，`object`、`text` 用在它的 `skills[i]` 和 `skills[i].description` 上。后三条规则为什么收得这么紧（会成为外部命令的参数、会成为目录名），见 [安装 skill](./skill-install.md) 的第二个 Scenario。

数组里某一项的字段写成 `env[0].name`：下标从 0 数起，和 JSON 里的位置一致（条目是“第几条”从 1 数起，那是给人数的）。嵌在里面的中英文说明仍用 `parseDescription`，第二个参数给它所在的字段（`env[0].`），报出来就是 `env[0].description.en`。

规则本身（正则）见 [入口与测试](./installer-entry.md) 的校验表。一条条目只报头一处问题：skill 按 `name`、`version`、`path`、`description` 的顺序查，应用项目按 `name`、`description`、`url` 的顺序查，第三方 Skill 的顺序见 [安装 skill](./skill-install.md)，MCP 的见 [安装 MCP](./mcp-install.md)，工具的见 [安装工具](./tool-install.md)；四类条目各自的字段都查完之后，再查 `purpose`、`recommended`（共用 `parsePlacement`）。命令里每条规则的说法是 `scripts/validate-catalog.ts` 的 `RULES`：加一种 `FieldRule` 就要在那里加一句，类型检查会拦住漏的。

每一类条目各有一个 `parseXxx(entry): Xxx | EntryProblem`，都交给 `loadCatalog` 里的 `collect(document, list, parse)`：它逐条调 `parse`，写坏的和重名的带着原因进 `skipped`。**加一类条目就是加一个 `parse` 函数、调一次 `collect`**，不要另写一遍循环。中英文说明用 `parseDescription`，各类共用。用途清单不是条目，但读法一样（逐项解析、标识重复的只留第一项），所以它和 `collect` 共用底下的 `readEntries`，只是写坏的进 `flaws` 而不是 `skipped`——`skipped` 的条数会显示给用户看，那句话说的是「条目」。

`SkippedEntry.name` 只在名字合规则时才有：它会被原样打到终端上，而写坏的名字里可能夹着控制码。

**没有“未校验”这回事了**：工单 10 之前，`catalog.json` 里安装器还不读内容的数组只查“是不是数组”，条数记进 `Catalog.unread`，命令照实说“未校验”。三类条目都有了解析之后，这套过渡（`UNREAD_ARRAYS`、`Catalog.unread`、命令的那一行）已经整个去掉。**以后再加一类条目时不要把它请回来**：先写 `parseXxx`，写坏的进 `skipped`，并在命令的通过信息里加上这一类的数量。

**命令不查的东西**：`name` 与目录名、`SKILL.md` 的 frontmatter 是否一致，`skills/` 下有没有没登记的目录，条目是否按名字升序，`path` 下有没有 `SKILL.md`。这些要读 `skills/`，而安装器读目录时不读它。它们仍由 [清单与版本](../skills/manifest-versioning.md) “校验”一节的脚本查。

### 5. Good/Base/Bad Cases

- Good：仓库的数据（2026-10-11 录入 23 个第三方 Skill 和 7 个应用项目之后）→ `目录校验通过：12 个 skill、23 个第三方 Skill、11 个 MCP、0 个工具、64 个应用项目、10 个用途`，退出 0。
- Bad：第三方 Skill 的 `source` 写成了网址，或某个 skill 的名字照上游写成了 `Humanizer-ZH` → 指出第几条、名字、`source` 或 `skills[0].name` 该是什么样，退出 1；安装器里这一条被跳过。
- Base：工具条目的 `install` 里有一个不认识的系统名（`solaris`）→ 忽略它，照常通过。
- Bad：`index.json` 某一条的 `path` 写成 `skills/../x` → 指出第几条、名字、`path` 该是什么样，退出 1。
- Bad：`skillPurposes` 里 `archify` 的用途拼错了 → 安装器一条都不跳，但命令指出是哪个 skill、写的是什么，退出 1。

### 6. Tests Required

测试在 `cli/test/validate-catalog.test.ts`，把命令当成一条命令来跑：从 `package.json` 读出登记的那条脚本，把 `node` 换成 `process.execPath` 起子进程，只断言标准输出、标准错误和退出状态。这样测到的就是维护者和 CI 用的那一条，连 `package.json` 里的接线也在内。

```ts
const result = await validate(catalogDir({ index: { version: 1, skills: [good, skill({ path: 'skills/../broken' })] } }));
expect(result.stderr).toMatch(/index\.json.*skills.*第 2 条.*broken.*path/);
expect(result.exitCode).toBe(1);
```

- 样例目录用 `harness.ts` 的 `catalogDir()`。**不拿仓库真实的目录数据做测试**——测试不读 `cli/` 以外的文件；真实数据由 CI 的 `catalog` 作业跑。
- 每加一类条目、一个字段、一种 `EntryProblem`、一种 `CatalogFlaw`：加一条“写坏时指明哪一条、哪个字段”的用例；每加一种整份读不了的情况：在“整份读不了”的表里加一行。
- 这个文件的超时放宽到 30 秒：每条用例各起一个 Node 进程，Windows 的 CI 机器上起得慢。

### 7. Wrong vs Correct

#### Wrong

```ts
// 命令里另写一份规则：和安装器的校验迟早对不上，命令通过而安装器照样跳过
if (!/^[a-z0-9-]+$/.test(entry.name)) problems.push(`${entry.name}: name`);
```

```ts
// 新加一类条目时，写坏的只计数：命令就说不出是哪一条、哪个字段
if (!app) skippedCount++;
```

```ts
// Node 22.13 上 --experimental-strip-types 会往标准错误打一段实验特性的警告
expect(result.stderr).toBe('');
```

#### Correct

```ts
// 规则只在 catalog.ts；写坏的条目带着原因进 skipped，命令和安装器看到的是同一份
const app = parseApp(entry);
if ('kind' in app) skip(nameOf(entry), app);
```

```ts
expect(result.stderr).not.toMatch(STACK_FRAME);
expect(result.stdout).toBe('');
```

---

## Scenario: 上游核对命令

### 1. Scope / Trigger

第三方 Skill 不收进仓库（ADR-0003），目录里只登记「所有者/仓库」和其中各个 skill 的名字。作者把仓库删了、归档了、改了名，或者增删了里面的 skill，目录就和上游对不上，而安装器要等用户装失败了才知道。维护者用这条命令把目录里登记的每个第三方 Skill 和作者仓库的现状对一遍。动它的输出、退出状态、怎么认出上游有哪些 skill，或者 skills CLI 换了主版本时，看这里。

### 2. Signatures

```bash
# 在 cli/ 下运行；<目录> 里要有 index.json 和 catalog.json，核对本仓库时给 ..
npm run check-upstream -- <目录>
# 不联网：把 <仓库目录>/<所有者>/<仓库> 当作上游的那个仓库
npm run check-upstream -- <目录> --repos <仓库目录>
```

和目录校验命令一样是仅供开发的脚本：放在 `cli/scripts/`，用 `node --experimental-strip-types` 直接跑，不进 `dist/`，不随 npm 包发布；目录的位置由运行的人给，脚本和 `package.json` 里都不写死。目录用 `loadCatalog(localCatalogSource(<目录>))` 读，所以它核对的就是安装器读得出来的那些第三方 Skill。

上游从哪看由一个内部的接口隔开，两种实现：

| 上游 | 什么时候用 | 怎么看 |
|------|------------|--------|
| GitHub | 缺省 | 每个来源两次接口查询（仓库信息、文件列表），再按需读原始的 `SKILL.md` 和插件清单 |
| 本地的仓库目录 | 给了 `--repos` | `<仓库目录>/<所有者>/<仓库>` 是目录就算仓库存在，里面的文件就是它的内容；归档和改名在本地无从表示，不报 |

**它只读**：不改目录文件，不往 `<仓库目录>` 里写，不克隆、不装任何东西。

### 3. Contracts

| 项 | 约定 |
|----|------|
| 参数 | 一个本地目录；可选的 `--repos <仓库目录>` |
| 环境变量 | `GITHUB_TOKEN`：有就带上（安装器用的是同一个），只发给 `api.github.com`，不发给放原始文件的站点。不带时 GitHub 每小时只给 60 次接口查询，一个来源要 2 次（改了名的 3 次） |
| 标准输出 | 通过信息 |
| 标准错误 | 对不上的、没能核对的、用法 |
| 语言与样式 | 只有中文，不带样式，不经呈现层 |
| 退出状态 | 0 全都对得上；1 有对不上的，或有没能核对的，或目录读不了、有写坏的第三方 Skill 条目；2 用法不对 |

```
上游核对通过：24 个第三方 Skill，共 87 个 skill
```

```
上游核对未通过：有 4 处对不上，另有 1 个条目没能核对
  paper-kit（example-labs/paper-kit）：目录里登记的 paper-deck 在上游没有
  paper-kit（example-labs/paper-kit）：上游的 paper-poster 没有登记在目录里
  solo-notes（example-labs/solo-notes）：来源仓库不存在
  old-notes（example-labs/old-notes）：来源仓库已改名为 example-labs/new-notes
  slow-kit（example-labs/slow-kit）：没能核对：被 GitHub 限流，设上 GITHUB_TOKEN 再跑
```

第一行照实数，最多三样，按这个先后，第二样起前面加「另」：「有 N 处对不上」「有 N 个条目没能核对」「有 N 个第三方 Skill 条目在目录里写坏了、没有核对（先跑 npm run validate-catalog）」。各行照目录里条目的先后，一个条目的几行挨在一起；一个条目里先是归档、改名，再是登记了而上游没有的，最后是上游有而没登记的。

对一个条目会报的：

| 情况 | 说法 | 还接着对 skill 吗 |
|------|------|--------------------|
| 来源仓库不存在（GitHub 答 404；转成私有的也是这个答复） | `来源仓库不存在` | 不 |
| 已归档 | `来源仓库已归档` | 接着对 |
| 已改名或转给了别人（查询被转到了另一个仓库，名字不分大小写地比） | `来源仓库已改名为 <新名字>` | 接着对，对的是新仓库 |
| 目录里登记的某个 skill 上游没有 | `目录里登记的 <名字> 在上游没有` | |
| 上游有某个 skill 目录里没登记 | `上游的 <名字> 没有登记在目录里` | |
| 没能核对（网络不通、被限流、别的 HTTP 状态、文件列表被截断、答复读不懂） | `没能核对：<原因>` | 不 |

目录本身的问题：整份读不了时，标题和原因沿用目录校验命令的那几句，退出 1；有第三方 Skill 条目被跳过时（`skipped` 里 `list` 是 `thirdPartySkills` 的），第一行里数出来，同样不算通过，其余条目照常核对——这条命令不重复说哪里写坏了，那是目录校验命令的事。

**上游的名字是远程数据**：skill 的名字和读不到的文件的路径，打出来之前去掉终端控制码和控制字符（`U+0000–U+001F`、`U+007F–U+009F`）。仓库的新名字不是「去掉了再打」，而是要合目录里 `source` 的那条规则（`catalog.ts` 的 `SKILL_SOURCE`，同一份），不合就算「GitHub 的答复读不懂」：它接下来要拼进带着令牌的网址，维护者还会把它抄回目录。

### 4. 怎么认出上游有哪些 skill

**照抄 skills CLI 1.7.2 的 `discoverSkills`**，不是「仓库里所有的 `SKILL.md`」：安装器装的时候调的是它，它看不到的 skill 装不上，它忽略的 `SKILL.md`（样例、模板、同名的副本）也不该报成「没登记」。规则是：

1. 仓库根有 `SKILL.md` 且读得出来 → 只有这一个。
2. 否则依次在这些地方找「下一层的目录里有 `SKILL.md`」的：仓库根（只看一层）；`skills`、`skills/.curated`、`skills/.experimental`、`skills/.system` 和各个 agent 的项目级 skill 目录（`.claude/skills`、`.agents/skills` 等 30 个，最多往下三层，遇到有 `SKILL.md` 的目录就不再往里，也不进 `node_modules`、`.git`、`dist`、`build`、`__pycache__`）；`.claude-plugin/marketplace.json` 和 `.claude-plugin/plugin.json` 指到的插件目录下的 `skills`，以及它们的 `skills` 字段列出的路径所在的目录（只看一层）。
3. 上面一个都没找到 → 仓库里深度不超过 5 层的所有 `SKILL.md`。
4. 一份 `SKILL.md` 算数的条件：头部信息（frontmatter）解析得了，`name`、`description` 都是非空的文字。名字相同的只算一个。
5. 仓库根有 `skills-lock.json`（版本不低于 1）时，agent 的项目级 skill 目录下名字或目录名记在里面的不算——那是作者自己装进仓库的别人的 skill。
6. `metadata.internal: true` 的：按名字装得上，但 `--list` 不列。所以「登记的在上游有没有」把它算进去，「上游有没登记的」不算它。

7. **路径不分大小写**：`Skills/`、`skill.md` 都认。skills CLI 是拿路径去问文件系统的，macOS 和 Windows 上不分大小写；`sammcj/agentic-coding` 的 skill 就放在 `Skills/` 里，按大小写敏感比会「约定的位置里一个都没有」，把旁边 `Skills_disabled/` 里的 29 个也算上（2026-10-11 实测，84 对 55）。代价：大小写敏感的 Linux 上 skills CLI 自己认出来的可能不一样，命令照的是 macOS、Windows 上的结果。

**名字比的是 skill 声明的名字的小写写法，不是装出来的目录名**。skills CLI 按名字选 skill（`filterSkills`）时只把两边转成小写再比，不把空格换成连字符——那是装的时候给目录起名才做的（`sanitizeName`）。所以上游声明 `Paper-Reader`、目录登记 `paper-reader` 是对得上的；上游声明 `Paper Reader` 的那个，目录里怎么登记都选不中（`skills[i].name` 不收空格）：登记成 `paper-reader` 的会被报成「在上游没有」，上游的那个照 `paper reader` 报成「没有登记」。声明的名字先照它的 `sanitizeMetadata` 清理（去掉终端控制码和大部分控制字符、换行并成空格、去掉首尾空白）再比。评审指出过这一点：最初比的是化成目录名之后的样子，会把装不上的说成对得上。

头部信息用 `yaml` 这个包解析（`devDependencies`，skills CLI 用的也是它），不手写正则：`name: 123`、带引号的、折行的写法，手写的认得和它不一样，就会误报。

**skills CLI 换主版本时这一节要重新对一遍**（`npm pack skills@<版本>` 取下发布包，读 `dist/cli.mjs` 里的 `discoverSkills`、`getPluginSkillPaths`、`parseSkillMd`、`sanitizeMetadata`、`filterSkills`、`readLocalLock`、`AGENT_PROJECT_SKILL_DIRS`）。安装器钉的是 `skills@1`，小版本之间它也可能加目录；发现和 `npx skills add <来源> --list` 列的对不上时，以后者为准，改这里。

### 5. Validation & Error Matrix

| 情况 | 输出 | 退出状态 |
|------|------|----------|
| 没给目录、多给了参数、`--repos` 后面没有目录、不认识的选项 | 用法 | 2 |
| `--repos` 给的不是目录 | `--repos 给的不是一个目录：<路径>`——不这样拦，每个来源都会被报成「仓库不存在」 | 2 |
| 整份目录读不了 | `上游核对未通过：` 加安装器对用户说的那一句，下一行是文件的位置 | 1 |
| 有第三方 Skill 条目被跳过 | 第一行里数出来；其余条目照常核对 | 1 |
| 有对不上的或没能核对的 | 第一行数出来，然后每处一行 | 1 |
| 都对得上（包括目录里一个第三方 Skill 都没有） | `上游核对通过：N 个第三方 Skill，共 M 个 skill` | 0 |

GitHub 那一边：

| 情况 | 结论 |
|------|------|
| 仓库信息答 404 | 来源仓库不存在 |
| 仓库信息答 301（改名、转移）| 只跟一次，且只跟到 `https://api.github.com/` 下；答复里的 `full_name` 是新名字 |
| 403 或 429 且带限流的头（判断用 `catalog.ts` 的 `rateLimit`，和安装器是同一份） | 没能核对：`被 GitHub 限流，设上 GITHUB_TOKEN 再跑`；已经带了令牌的是 `被 GitHub 限流，过一会儿再跑` |
| 别的非 2xx、网络错误、超时 | 没能核对：`HTTP <状态>` 或错误码；带着令牌答 401 的后面加 `（GITHUB_TOKEN 不对或过期了）` |
| 答复不是 JSON 对象、没有 `full_name`、文件列表不是数组、301 指到了别的站点 | 没能核对：`GitHub 的答复读不懂` |
| 文件列表的 `truncated` 是真 | 没能核对：仓库太大，GitHub 给的文件列表不全 |
| 某份 `SKILL.md`、插件清单或 `skills-lock.json` 读不到 | 没能核对：`读不到 <路径>（HTTP <状态>）`（不当作「没有这个 skill」，免得网络抖一下就报一串对不上） |

### 6. Good/Base/Bad Cases

- Good：样例目录登记 `emilkowalski/skills` 的全部 14 个 skill、`ckelsoe/prompt-architect`、`nuyoah-ai-works/nuyoah-image-reverse-prompt` → `上游核对通过：3 个第三方 Skill，共 16 个 skill`，退出 0（2026-10-11 对着真实的 GitHub）。
- Good：仓库的数据（2026-10-11 录入之后，带着 `GITHUB_TOKEN`、对着真实的 GitHub）→ `上游核对通过：23 个第三方 Skill，共 100 个 skill`，退出 0。
- Base：目录里一个第三方 Skill 都没有 → `上游核对通过：0 个第三方 Skill，共 0 个 skill`，退出 0。
- Bad：来源写的是改名之前的 `ckelsoe/claude-skill-prompt-architect` → `来源仓库已改名为 ckelsoe/prompt-architect`，退出 1；skill 接着对，对得上就只有这一行。
- Bad：只登记了一个仓库里的一部分 skill → 没登记的每个一行，退出 1。命令没有「有意只登记一部分」的说法，见下面的 Design Decision。
- Bad：`GITHUB_TOKEN` 过期了 → 每个条目一行 `没能核对：HTTP 401（GITHUB_TOKEN 不对或过期了）`，退出 1，没有一条被说成「仓库不存在」。

### Design Decision: 上游有而没登记的一律报，没有豁免

**Context**：PRD 定的是「上游有而目录里没登记的 skill」要报、有任何一项对不上就非零退出。工单 13 原本打算让 `sammcj/agentic-coding` 只登记 55 个里的 `analyse-design` 一个，又要求这条命令对真实的目录「跑过一遍并通过」——两条同时满足不了。

**Options Considered**：给条目加一个「有意只登记一部分」的标记（给 `catalog.json` 加字段，要过 [清单与版本](../skills/manifest-versioning.md) 的兼容规则）；把那个仓库的 55 个都登记上；放宽工单 13 的验收，让这一条一直报。

**Decision**：都没有选。维护者 2026-10-11 决定那个仓库不收了，所以命令照 PRD 的字面做，不加豁免：**一个第三方 Skill 条目要登记上游的全部 skill**（标了 internal 的除外，见上面第 6 条）。以后再遇到「只想要一个仓库里的一部分」，是同一个决定要重新做一次——要么不收，要么加标记，不要让命令常年报着不通过。

### 7. 为什么不进 CI

它要联网，结果随上游变：作者今天加一个 skill，和这次提交毫无关系的 CI 就红了。不带令牌时还会被限流。它是维护者想起来、或录入条目之后手动跑的；要不要定时跑另议（PRD 的 Out of Scope）。

### 8. Tests Required

测试在 `cli/test/check-upstream.test.ts`，写法同目录校验命令：从 `package.json` 读出登记的脚本，把 `node` 换成 `process.execPath` 起子进程，只断言标准输出、标准错误和退出状态。上游一律用 `--repos` 给的本地假仓库目录（`harness.ts` 的 `writeTree` 写出来的），**不联网**。

- 全对得上、目录里登记的上游没有、上游多了一个、仓库不存在，各一条。
- 上面「怎么认出上游有哪些 skill」的每条规则一条：有一条规则，就有一个「不照它做就会误报」的假仓库（两种插件清单、`skills` 下带点的三个目录、锁文件作数与不作数、名字带空格的，都在内）。
- 上游的名字里夹着控制码时，输出里没有控制字符。
- 跑完之后两个目录文件逐字没变。
- 标准错误只断言「包含」，不断言整段相等：Node 22.13 上 `--experimental-strip-types` 会往标准错误多打一段警告（同目录校验命令）。
- 「没能核对」的几种情形在本地的假仓库上造不出来，没有自动化测试；改了那一段照下一条手动核对，至少用一个无效的 `GITHUB_TOKEN` 看一遍「没能核对」的那几行。
- GitHub 那一边不进自动化测试，改了它要手动核对：写一份登记了两三个真实仓库的样例目录（其中一个故意写错一个 skill 名，一个用改名之前的旧名字），对着真实的 GitHub 跑，输出与预期一致。上一次的记录在任务 `10-10-catalog-purpose-categories` 的 `research/upstream-check-trial-record.md`。

### 9. Wrong vs Correct

#### Wrong

```ts
// 仓库里所有的 SKILL.md 都算：根上有 SKILL.md 的仓库，里面带的样例会被报成「上游有、目录里没登记」
const upstream = files.filter((path) => path.endsWith('SKILL.md'));
```

```ts
// 读不到就当没有：网络抖一下，报出一串「目录里登记的在上游没有」
const text = await read(path).catch(() => '');
```

#### Correct

```ts
// 照 skills CLI 的顺序找；读不到是「没能核对」，和「对不上」分开说
const { installable, listed } = await discoverSkills(repository);
```

```ts
// 比名字照 skills CLI 选 skill 时的比法：只转小写。化成目录名（把空格换成连字符）再比，会把装不上的说成对得上
names.add(skill.name.toLowerCase());
```

---

## Scenario: CI

### 1. Scope / Trigger

`.github/workflows/cli.yml` 是仓库里唯一会被触发的工作流（GitHub 只认仓库根的 `.github/`；`skills/unlazy/.github/` 是上游整包带进来的，不会触发）。要加检查、换 Node 版本、动触发条件时看这里。

### 2. Contracts

| 项 | 约定 |
|----|------|
| 触发 | 推送到 `main` 或拉取请求，且改动落在 `cli/**`、`index.json`、`catalog.json` 或工作流文件自身 |
| 检出 | `sparse-checkout: cli`：只取 `cli/` 和仓库根的文件（两个目录文件在其中），`skills/` 不取 |
| 工作目录 | 每一步都在 `cli/` 下（`defaults.run.working-directory`） |
| 权限 | `contents: read` |

| 作业 | 在哪跑 | 跑什么 |
|------|--------|--------|
| `test` | `ubuntu-latest`、`macos-latest`、`windows-latest` × Node `22.13.0`、`24`，互不牵连（`fail-fast: false`） | `npm ci`、`npm test` |
| `catalog` | `ubuntu-latest`，Node 24 | `npm ci`、`npm run typecheck`、`npm run validate-catalog -- ..` |

- Node `22.13.0` 是包声明支持的最低版本，`24` 是当前的长期支持版本；`engines` 改了，这里跟着改。
- 目录校验不单独按路径过滤：`cli/` 有改动时也跑，因为校验规则就在 `cli/` 里，规则一变，真实数据可能就过不去了。
- 上游核对命令不在任何作业里：它要联网，结果随上游变，见上一个 Scenario 的「为什么不进 CI」。它的测试用本地的假仓库目录，在 `test` 作业里照常跑。
- 只取 `cli/` 既是为了快（整个仓库两百多 MB），也是规矩：安装器的构建和测试不碰 `skills/`，上游整包自带的测试不归这里管。

### 3. Wrong vs Correct

#### Wrong

```yaml
# 取整个仓库，再在仓库根跑测试：会把 skills/ 下上游整包的测试和 package.json 扫进来
- uses: actions/checkout@v7
- run: npx vitest run
```

#### Correct

```yaml
defaults:
  run:
    working-directory: cli
steps:
  - uses: actions/checkout@v7
    with:
      sparse-checkout: cli
  - run: npm test
```

---

## Common Mistakes

### 在 Windows 上测试因路径或换行而失败

**Symptom**：本机全绿，CI 只有 `windows-latest` 红。

**Cause**：断言里写死了 `/` 分隔的路径；或依赖了检出文件的换行（Windows 上 git 默认把文本文件检出成 CRLF）。

**Fix**：路径用 `path.join` 拼出来再断言（见 [入口与测试](./installer-entry.md) 的 Wrong vs Correct）；测试用的文件由测试自己写出，不读检出来的文本文件去比内容。
