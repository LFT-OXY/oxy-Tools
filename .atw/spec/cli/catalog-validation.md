# 目录校验与 CI

> 目录校验命令 `cli/scripts/validate-catalog.ts`（测试的辅助接缝），以及跑测试和校验的工作流 `.github/workflows/cli.yml`。

---

## Scenario: 目录校验命令

### 1. Scope / Trigger

维护者提交前、CI 在推送后，用同一条命令确认：仓库里的 `index.json` 和 `catalog.json`，安装器整份读得了，而且一条都不会跳过。凡是给目录加一类条目、加一个字段、改一条校验规则，都落在这份契约上。

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
  skipped: SkippedEntry[]; // 被跳过的条目：校验不通过的，以及与前面重名的
  unread: { file: string; list: string; count: number }[]; // 这一版还不读内容的条目，空的数组不列
}
export interface SkippedEntry {
  file: string;             // 所在的目录文件
  list: string;             // 所在的数组，如 skills
  position: number;         // 第几条，从 1 数起
  name: string | undefined; // 名字本身不合规则时没有
  problem: EntryProblem;
}
export type EntryProblem =
  | { kind: 'not-object' }
  | { kind: 'bad-field'; field: string; rule: FieldRule }
  | { kind: 'duplicate' };
export type FieldRule = 'name' | 'text' | 'relative-path' | 'object';
```

命令只做三件事：用 `localCatalogSource(<目录>)` 调 `loadCatalog`，把结果说成人话，定退出状态。**它自己不含任何校验规则**——这样“命令通过”和“安装器一条不跳”永远是一回事。

它和界面预览页一样是仅供开发的脚本：放在 `cli/scripts/`，用 `node --experimental-strip-types` 直接跑，不进 `dist/`，不随 npm 包发布。目录由参数给出，脚本和 `package.json` 里都不写死 `..`——`cli/` 的代码不引用 `cli/` 以外的文件（ADR-0001），路径是运行的人给的。

### 3. Contracts

| 项 | 约定 |
|----|------|
| 参数 | 恰好一个：本地目录 |
| 标准输出 | 通过信息，和“未校验”的说明 |
| 标准错误 | 未通过的说明、用法 |
| 语言与样式 | 只有中文，不带样式，不经呈现层（同 `scripts/preview.ts`） |
| 退出状态 | 0 通过；1 未通过；2 用法不对 |

输出的样子：

```
目录校验通过：11 个 skill
  未校验：catalog.json 的 mcps 有 1 条，这一版安装器还不读这类条目的内容
```

```
目录校验未通过：有 2 个条目会被安装器跳过
  index.json 的 skills 第 2 条（wizard）：path 要是相对路径：用 / 分段，每段只含字母、数字和 . _ -，且不是 . 或 ..
  index.json 的 skills 第 5 条：条目不是对象
```

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
| `unread` 非空 | 照常通过，每个数组多一行“未校验” | 0 |
| 都没有 | `目录校验通过：N 个 skill` | 0 |

单条条目的问题：

| `problem.kind` | 含义 | 命令怎么说 |
|----------------|------|------------|
| `not-object` | 条目不是对象 | 条目不是对象 |
| `bad-field` | `field` 这个字段不合 `rule` | 字段名 + 这条规则该是什么样 |
| `duplicate` | 与前面的某一条重名 | 与前面的条目重名 |

| `FieldRule` | 规则 | 现在用在 |
|-------------|------|----------|
| `name` | 小写 kebab-case | `name` |
| `text` | 非空文字，不含控制字符 | `version`、`description.zh`、`description.en` |
| `relative-path` | 相对路径，每段只含字母、数字、`.`、`_`、`-`，且不是 `.`、`..` | `path` |
| `object` | 是对象 | `description` |

规则本身（正则）见 [入口与测试](./installer-entry.md) 的校验表。一条条目只报头一处问题，按 `name`、`version`、`path`、`description` 的顺序查。

`SkippedEntry.name` 只在名字合规则时才有：它会被原样打到终端上，而写坏的名字里可能夹着控制码。

**`unread` 是过渡**：`catalog.json` 的 `mcps`、`tools`、`apps` 目前只查“是不是数组”，条目的字段要等各自的功能落地才定义。在那之前，非空的数组记进 `unread`，命令照实说“未校验”而不是笼统地说通过。给某一类条目写了解析之后，把它从 `unread` 里拿掉，写坏的条目进 `skipped`。

**命令不查的东西**：`name` 与目录名、`SKILL.md` 的 frontmatter 是否一致，`skills/` 下有没有没登记的目录，条目是否按名字升序，`path` 下有没有 `SKILL.md`。这些要读 `skills/`，而安装器读目录时不读它。它们仍由 [清单与版本](../skills/manifest-versioning.md) “校验”一节的脚本查。

### 5. Good/Base/Bad Cases

- Good：仓库当前的数据 → `目录校验通过：11 个 skill`，退出 0。
- Base：`catalog.json` 的 `mcps` 里先放了一条 → 通过，多一行“未校验：catalog.json 的 mcps 有 1 条…”，退出 0。
- Bad：`index.json` 某一条的 `path` 写成 `skills/../x` → 指出第几条、名字、`path` 该是什么样，退出 1。

### 6. Tests Required

测试在 `cli/test/validate-catalog.test.ts`，把命令当成一条命令来跑：从 `package.json` 读出登记的那条脚本，把 `node` 换成 `process.execPath` 起子进程，只断言标准输出、标准错误和退出状态。这样测到的就是维护者和 CI 用的那一条，连 `package.json` 里的接线也在内。

```ts
const result = await validate(catalogDir({ index: { version: 1, skills: [good, skill({ path: 'skills/../broken' })] } }));
expect(result.stderr).toMatch(/index\.json.*skills.*第 2 条.*broken.*path/);
expect(result.exitCode).toBe(1);
```

- 样例目录用 `harness.ts` 的 `catalogDir()`。**不拿仓库真实的目录数据做测试**——测试不读 `cli/` 以外的文件；真实数据由 CI 的 `catalog` 作业跑。
- 每加一类条目、一个字段、一种 `EntryProblem`：加一条“写坏时指明哪一条、哪个字段”的用例；每加一种整份读不了的情况：在“整份读不了”的表里加一行。
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
