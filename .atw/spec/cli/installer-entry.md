# 入口与测试

> `cli/src/installer.ts` 的入口契约、目录读取与校验的契约，以及测试怎么写。

---

## Scenario: 安装器入口

### 1. Scope / Trigger

安装器对外只有一个入口。它是命令的实现，也是测试的主接缝：凡是加命令行参数、环境变量、退出状态、出错种类，或改目录的读取与校验，都落在这份契约上。

### 2. Signatures

```ts
// cli/src/installer.ts
export async function runInstaller(options: InstallerOptions): Promise<number>; // 返回进程的退出状态

export interface InstallerOptions {
  argv: readonly string[];        // 不含 node 和脚本路径
  env: Environment;               // Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform;
  systemLocale: string;           // 如 zh-CN；环境变量里没有语言设置时用它
  stdout: TerminalOutput;         // { write(text), isTTY, rows? }
  stderr: TerminalOutput;
  stdinIsTTY: boolean;
  // 五样可替换的外部依赖
  catalogSource: CatalogSource;   // 目录来源
  homeDir: string;                // 用户主目录
  runCommand: CommandRunner;      // 外部命令执行器
  prompter: Prompter;             // 提问器
  openLink: LinkOpener;           // 链接打开器
  // 两样运行环境的事实，和 env、platform 同类，不算外部依赖
  tempDir: string;                // 放临时文件的目录（bin.ts 给 os.tmpdir()）
  interrupt: AbortSignal;         // 用户在提问之外按 Ctrl+C 时触发
}
```

入口不直接碰 `process`：参数、环境变量、平台、输出流都从 `options` 来。`cli/src/bin.ts` 负责把真实的东西接上去，除此之外不放逻辑。

`interrupt` 触发后 `bin.ts` 随即 `process.exit(130)`，**所以监听它的收尾只能是同步的**（`rmSync`，不是 `await rm`）；异步的 `finally` 等不到执行。提问进行中的 Ctrl+C 不走这个信号——终端处在原始模式，交互库自己把它变成 `PromptAborted`。

`runCommand` 和 `openLink` 目前没有流程用到，`bin.ts` 里接的是会抛错的占位；真实实现随第一个用到它们的功能落地，签名届时可以改。

### 3. Contracts

**启动参数**

| 参数 | 行为 |
|------|------|
| `--lang zh` / `--lang=en` | 强制界面语言 |
| `-h`、`--help` | 打印用法，退出状态 0，不需要终端 |
| `-v`、`--version` | 只打印版本号，退出状态 0，不需要终端 |
| 其他 | 出错「无法识别的参数」，退出状态 2 |

**环境变量**

| 变量 | 行为 |
|------|------|
| `OXY_TOOLS_CATALOG` | 非空时，目录来源改为这个本地目录（其中要有 `index.json` 和 `catalog.json`），覆盖传入的 `catalogSource`；skill 的内容也从这个目录读 |
| `GITHUB_TOKEN` | 非空时，向 GitHub 的接口查询带上它（`Authorization: Bearer`）；下载文件从不带 |
| `PATH`、`PATHEXT` | 判断宿主的命令在不在，见 [安装 skill](./skill-install.md) |
| `LC_ALL`、`LC_MESSAGES`、`LANG` | 按这个顺序取第一个非空的判断语言：以 `zh` 开头用中文，否则英文；都为空时看 `systemLocale` |
| `NO_COLOR` | 只要存在就不带任何样式，见 [终端输出](./terminal-output.md) |
| `TERM`、`WT_SESSION` 等 | 判断终端是否支持 Unicode，见 [终端输出](./terminal-output.md) |

**退出状态**

| 状态 | 情况 |
|------|------|
| 0 | 正常退出、`--help`、`--version` |
| 1 | 没有交互式终端、目录读不了、目录格式有误或版本过高、意外错误 |
| 2 | 启动参数不对 |
| 130 | 用户按了 Ctrl+C（提问中，或提问之外经 `interrupt`） |

单个条目安装失败、向 GitHub 查询失败（含被限流）都**不改变退出状态**：前者只在结果里列出，后者打出出错说明后回到主菜单。

**目录来源**

```ts
// cli/src/catalog.ts
export interface CatalogSource {
  readonly kind: 'remote' | 'local';
  locate(file: string): string;            // 给用户看的网址或路径
  readText(file: string): Promise<string>; // 读不到时抛出
  pin(options: PinOptions): Promise<PinnedSource>; // 钉住来源此刻的内容，见「安装 skill」
}
export function githubCatalogSource(): CatalogSource; // 默认：GitHub 上本仓库 main 分支的原始文件
export function localCatalogSource(dir: string): CatalogSource;
```

默认来源只走 HTTPS，`fetch` 带 `redirect: 'error'`，不跟随任何跳转；20 秒超时。

**目录文件**

- `index.json`：`{ "version": 1, "skills": [...] }`，字段见 [清单与版本](../skills/manifest-versioning.md)。
- `catalog.json`：`{ "version": 1, "mcps": [], "tools": [], "apps": [] }`。三个数组可以缺省，缺省当作空；条目的字段由各自的功能在用到时定义，目前安装器不读它们的内容，只把非空的数组各有几条记在 `Catalog.unread` 里（给目录校验命令用）。
- 两个文件的 `version` 都是整数的格式版本号，安装器目前认识到 1。

### 4. Validation & Error Matrix

整份读不了时抛出 `CatalogError`，入口把它交给呈现层并以 1 退出：

| 情况 | 出错 |
|------|------|
| `readText` 抛出（断网、HTTP 非 2xx、文件不存在） | 无法读取目录，原因里带简短的技术原因（错误码或 `HTTP 404`），位置单独一行 |
| 不是合法的 JSON；顶层不是对象；`version` 不是正整数 | 目录格式有误 |
| `skills` 不是数组；`mcps`/`tools`/`apps` 存在但不是数组 | 目录格式有误，指出字段 |
| `version` 大于安装器认识的版本 | 目录格式版本不受支持，提示 `npx oxy-tools@latest`；**不尝试解析** |

单条 skill 条目写坏时只跳过这一条，连同原因记进 `Catalog.skipped`（哪个文件、哪个数组、第几条、哪个字段，类型见 [目录校验与 CI](./catalog-validation.md)）；主菜单上方只提示数量，逐条的原因由目录校验命令说：

| 字段 | 规则 |
|------|------|
| `name` | 小写 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `version` | 非空文字 |
| `path` | 相对路径，按 `/` 分段，每段匹配 `^[A-Za-z0-9._-]+$` 且不是 `.`、`..`；因此绝对路径、盘符、反斜杠、空段、结尾斜杠都被拒绝 |
| `description.zh`、`description.en` | 非空文字 |
| 所有文字 | 不含控制字符（`\u0000-\u001f`、`\u007f-\u009f`）——目录是远程数据，会原样打到终端上 |
| 重名 | 只留第一条，其余计入跳过 |
| 不认识的字段 | 忽略 |

其他不能继续的情况：标准输入或标准输出不是终端 →「没有交互式终端」，不打印大标志，不读目录；任何没预料到的异常 →「意外错误」，原因取消息的第一行（为空时用错误的类型名），不打印堆栈。

### 5. Good/Base/Bad Cases

- Good：`index.json` 有 11 条合法 skill，`catalog.json` 三个数组为空 → 主菜单只有 Skill 一个分组和退出。
- Base：`index.json` 里一条的 `path` 是 `skills/../x` → 这一条被跳过，提示「目录中有 1 个条目格式有误，已跳过」，其余照常。
- Bad：`catalog.json` 的 `version` 是 2 → 不看它的其余内容，提示升级，以 1 退出。

### 6. Tests Required

测试只经 `runInstaller` 断言——给定目录、主目录、应答，看终端上输出了什么、退出状态是多少、记录到哪些命令和链接。不为内部模块单独写测试，不断言颜色和版式。唯一的另一个接缝是目录校验命令，它的测试把命令当子进程跑，见 [目录校验与 CI](./catalog-validation.md)。

测试架子在 `cli/test/harness.ts`：

```ts
const result = await run({
  answers: [choose('Skill'), pick('alpha'), choose('取消'), choose('退出')], // 按预设应答的提问器
  catalog: catalogDir({ index: { version: 1, skills: [...] } }), // 写到临时目录的本地样例
  env: { NO_COLOR: '1' },
  tty: { stdout: false },                                        // 哪个流不是终端
});
result.exitCode; result.output; result.stdout; result.stderr; result.screen; result.commands; result.opened;
result.home; result.tmp; // 临时的主目录、交给安装器放临时文件的目录
```

- `choose(label)` 按画面上第一栏的字选一项（单选），那一项不在、或者不可选，就失败；`pick(...labels)` 是多选，只勾这几项再确认，一个都不传就是什么都不勾直接确认；`accept()` 是什么都不动直接回车——单选选中光标起始所在的那一项（它不可选就失败），多选照提问出现时的勾选确认，用来证明“默认是什么”；是否题取它的缺省回答，用来证明“默认是什么”；`yes()`、`no()` 回答是否题；`interrupt()` 表示在这个提问上按 Ctrl+C。应答用错了提问的种类（单选用了 `pick`、是否题用了 `choose`……）会直接报错，并说该用哪个。预设的应答没用完或不够用，测试都会失败——所以“这里不该多问一次”不用另写断言，多问了自然会失败。
- 预设应答的提问器把每个提问照画面的样子记进 `output`（提问、每一行、光标所在行的说明全文；多选的每行前面带勾选框；不可选的行照交互库的拼法，行首一个短横、原因接在后面，并经过主题的 `disabled` 样式；是否题只有提问和后面的 `(y/N)` 或 `(Y/n)`），所以“菜单里有什么”可以直接断言文字。它只是照着拼的：**一行到底选不选得了，要用 `keys` 在真实的交互库上证明**。
- 运行环境的初始状态：`onPath: ['claude']`（可执行路径上有哪些命令，缺省只有 `claude`——也就是只检测到一个宿主、不问装进哪个；`['claude', 'codex']` 是两个都检测到，传 `[]` 就是一个都没有）；`home: { '.claude/skills/x/SKILL.md': '…' }`（主目录里事先有什么）；`links: { '.claude/skills/x': 'my-skills/x' }`（主目录里事先有的符号链接，链接 → 它指向哪，都是相对主目录的路径；在 Windows 上建的是不需要特权的 junction）；`catalogDir({ content: {...} })`（本地样例目录里各个 skill 的文件，缺省是 `SAMPLE_FILES`）；`interrupt: controller.signal` 和 `tmp`（要在中途触发中断并当场查看临时目录时用）。
- 默认来源（GitHub）的行为用 `cli/test/github.ts` 的 `fakeGitHub()`：它替换全局的 `fetch`，照真实接口的样子答复提交号、文件树和原始文件，记下每个请求（`requests`、`queries()`、`downloads()`）；`intercept` 可以抢在正常答复之前让某个请求失败。用完 `vi.unstubAllGlobals()`。
- `result.screen` 是最后留在画面上的文字（被擦掉重写的加载提示只算最后一次）；比较两次运行的文字时用它，不用 `output`。
- 要核对**提问部分实际打到终端上的东西**（符号、按键提示、样式码），改用 `keys`：提问由真实的交互库渲染，脚本等画面上出现某段文字再按键。

```ts
const result = await run({ keys: [['⏎ 选择', KEY.enter], ['▸ beta-pack', KEY.ctrlC]] });
```

每条新行为至少要有：正常路径一条；它引入的每种出错各一条，断言原因、下一步、没有堆栈，以及退出状态（让安装器退出的出错是非零；只让一项失败或一次查询失败的不改变退出状态）。

### 7. Wrong vs Correct

#### Wrong

```ts
// 为内部模块单独写测试：重构一动就坏，而且没验证用户看到的东西
import { wrap } from '../src/text.ts';
expect(wrap('…', 10)).toEqual([...]);
```

```ts
// 等提问画出来时用了已回答的那一行里也有的字：键发早了会丢
await run({ keys: [['选择', KEY.enter], ['选择', KEY.down]] });
```

```ts
// 断言里写死 POSIX 路径：Windows 上 path.join 得到的是反斜杠
expect(result.output).toContain('/nonexistent/catalog');
```

```ts
// 卡死表头缩进了几列：这是版式，交给界面预览页和视觉评审
expect(result.output).toMatch(/^\s{3}名称\s+说明$/m);
```

```ts
// 列表里的一行卡死行首只有空白：多选的行前面有勾选框，换成多选就全红
expect(result.output).toMatch(/^\s+beta-pack\s+第二个样例 skill$/m);
```

#### Correct

```ts
const result = await run({ catalog: catalogDir({ index: '{ 坏的 JSON' }) });
expect(result.stderr).toContain('出错：目录格式有误');
expect(result.output).not.toMatch(STACK_FRAME);
expect(result.exitCode).not.toBe(0);
```

```ts
// 等按键提示（每个提问最后画出来的一行）
await run({ keys: [['⏎ 选择', KEY.enter], ['⏎ 选择', KEY.down]] });
```

```ts
const missing = join(tempDir('catalog'), '我的 目录');
expect(result.output).toContain(missing);
```

```ts
expect(result.output).toMatch(/ beta-pack\s+第二个样例 skill$/m);
```

---

## Common Mistakes

### 交互库自带的样式在测试里永远不上色

**Symptom**：主题里漏盖了一个样式函数，`NO_COLOR` 的测试却照样通过。

**Cause**：交互库没被主题盖掉的样式按 Node 的规则上色，看的是真实进程的标准输出；测试进程的标准输出不是终端，所以它本来就不上色。

**Fix**：用 `keys` 的测试文件里先 `vi.stubEnv('FORCE_COLOR', '1')`（见 `cli/test/prompts.test.ts`），漏盖的样式才会露出来。

**Prevention**：每加一种提示（`checkbox`、`password`、`confirm`），在 `prompts.test.ts` 里加一条 `NO_COLOR` 下不带样式码的测试。

### 按键提示的整行断言卡不住行尾

**Symptom**：`/^\s+↑↓ 移动 · ⏎ 选择$/m` 在某个用 `keys` 的测试里不匹配，去掉 `$` 就过了。

**Cause**：提问回答之后，交互库把光标挪回去重画，收成的那一行在去掉控制码的文字里紧接在按键提示后面，中间没有换行。

**Fix**：整行断言放在**以 Ctrl+C 结束的那个提问**上（它的按键提示后面没有重画）；已回答的提问只卡行尾（`/✓ 选择分组 · Skill$/m`）。不要靠去掉 `$` 了事——按键提示必须在 79 列以内，整行断言是唯一查得出它超宽的地方。

### 往标准输出写了出错说明

**Symptom**：`npx oxy-tools | cat` 时终端上什么都没有，提示进了管道。

**Fix**：出错说明一律经 `ui.failure()`，它写到标准错误。测试里断言 `result.stderr`。
