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
  systemLocale: string;           // 如 zh-CN；环境变量里没有语言设置时用它判断系统语言
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

`runCommand` 的正式实现是 `cli/src/run-command.ts` 的 `systemCommandRunner()`。它有两种用法：不经 shell、输出不上屏的（安装 MCP 用，约定见 [安装 MCP](./mcp-install.md)），和第三个参数给 `{ shell: true }` 时整行交给系统的 shell、输入输出直接接在终端上的（安装工具用，约定和手动核对的办法见 [安装工具](./tool-install.md)）。两种起的子进程都继承进程自己的环境，不是 `options.env`。

```ts
export interface CommandOptions { shell: true } // command 是一整行，args 是空的
export type CommandRunner = (command: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
```

`openLink` 的正式实现是 `cli/src/open-link.ts` 的 `systemLinkOpener(platform)`，应用项目用它打开官方链接：

```ts
export type LinkOpener = (url: string) => Promise<void>; // 打不开时拒绝
export function systemLinkOpener(platform: NodeJS.Platform): LinkOpener;
```

| 项 | 约定 |
|----|------|
| 用什么打开 | macOS `open <网址>`；Windows `rundll32 url.dll,FileProtocolHandler <网址>`；其余系统 `xdg-open <网址>` |
| 怎么起 | `spawn`，**不经过 shell**（网址是远程数据，里面的 `&` 之类不能有机会被当成命令）；`stdio: 'ignore'`、`detached: true`（用户随后按 Ctrl+C 时不把浏览器一起带走） |
| 什么算打不开（拒绝） | 系统上没有这个命令（`ENOENT`）；或命令在 1.5 秒内以非零状态结束（没有能打开网址的程序） |
| 什么算打开了 | 命令以 0 结束；或 1.5 秒后还没结束——有的系统上它要等浏览器关掉才结束，这时 `unref` 掉、不再等 |

调用方（`flow.ts`）把**任何**拒绝都当作“没打开”，不当作出错：不经 `ui.failure()`，不改变退出状态。打开器看不出来的失败（远程终端里命令照常以 0 结束）靠界面上那句固定的提醒兜住，见 [终端输出](./terminal-output.md) 的「应用项目」。

> **Warning**：`systemLinkOpener` 不进自动化测试（测试里链接打开器只记录）。改了它就用一个假的 `open` 命令手动核对四种结局：正常、非零退出、迟迟不结束、命令不存在，并确认网址是作为**单个参数**原样传进去的。Windows 那一支至今没有在真机上跑过。

### 3. Contracts

**启动顺序**

解析启动参数 → 参数有误、`--help`、`--version`、没有交互式终端这四种情况各自处理并退出 → 打大标志 → 没给 `--lang` 就问语言 → 读取目录 → 本机信息 → 主菜单。

**界面语言在一次运行的中途才定下来。** 那四种不问就退出的情况、大标志和语言提问用按系统语言建的呈现层；语言提问回答之后入口按选定的语言重建一个（`createUi({ …, lang, continued: true })`），此后的一切输出——加载提示、本机信息、菜单、提问、出错说明、目录条目的说明——都用它。重建时带上 `continued`，见 [终端输出](./terminal-output.md) 的「分区标题上方的空行」。

语言提问用提问器现有的单选（`ui.languageQuestion()`），不是新的提示种类。选择只留在这次运行的内存里：安装器不为它写任何文件，下一次启动照样问。在它上面按 Ctrl+C 和别的提问一样以 130 退出。

**启动参数**

| 参数 | 行为 |
|------|------|
| `--lang zh` / `--lang=en` | 指定界面语言，启动后不再问；值不是 `zh`、`en` 或没给值时出错，退出状态 2 |
| `-h`、`--help` | 打印用法，退出状态 0，不需要终端 |
| `-v`、`--version` | 只打印版本号，退出状态 0，不需要终端 |
| 其他 | 出错「无法识别的参数」，退出状态 2 |

**环境变量**

| 变量 | 行为 |
|------|------|
| `OXY_TOOLS_CATALOG` | 非空时，目录来源改为这个本地目录（其中要有 `index.json` 和 `catalog.json`），覆盖传入的 `catalogSource`；skill 的内容也从这个目录读 |
| `GITHUB_TOKEN` | 非空时，向 GitHub 的接口查询带上它（`Authorization: Bearer`）；下载文件从不带 |
| `PATH`、`PATHEXT` | 判断宿主的命令在不在，见 [安装 skill](./skill-install.md) |
| `CLAUDE_CONFIG_DIR`、`CODEX_HOME` | 非空时，看 MCP 配没配过改去这里找宿主的配置文件，见 [安装 MCP](./mcp-install.md)；skill 目录不认它们 |
| `LC_ALL`、`LC_MESSAGES`、`LANG` | 按这个顺序取第一个非空的判断**系统语言**：以 `zh` 开头是中文，否则英文；都为空时看 `systemLocale`。系统语言不直接是界面语言，它有三个用途：语言提问上光标起始停在哪一项；语言提问的按键提示用哪种语言；不问语言就退出的四种情况（参数有误、`--help`、`--version`、没有交互式终端）输出用哪种语言。给了 `--lang` 时不问语言，前两处不存在；那四种情况的输出用 `--lang` 的 |
| `NO_COLOR` | 只要存在就不带任何样式，见 [终端输出](./terminal-output.md) |
| `COLORTERM` | 等于 `truecolor` 或 `24bit` 时大标志画 24 位色的渐变，否则是洋红；只管标志，别的输出不看它。见 [终端输出](./terminal-output.md) 的「上不上色」 |
| `TERM`、`WT_SESSION` 等 | 判断终端是否支持 Unicode，见 [终端输出](./terminal-output.md) |

**退出状态**

| 状态 | 情况 |
|------|------|
| 0 | 正常退出、`--help`、`--version` |
| 1 | 没有交互式终端、目录读不了、目录格式有误或版本过高、意外错误 |
| 2 | 启动参数不对 |
| 130 | 用户按了 Ctrl+C（提问中，或提问之外经 `interrupt`） |

单个条目安装失败（skill 装不上、宿主的 MCP 命令非零退出或起不来、工具装完复核不通过）、向 GitHub 查询失败（含被限流）、应用项目的链接在浏览器里打不开，都**不改变退出状态**：第一种只在结果里列出，第二种打出出错说明后回到主菜单，第三种只在详情下面提醒用户自己复制链接。

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
- `catalog.json`：`{ "version": 1, "mcps": [], "tools": [], "apps": [] }`。三个数组可以缺省，缺省当作空。三类条目的内容都读、都校验：`apps` 的字段见下，`mcps` 的见 [安装 MCP](./mcp-install.md)，`tools` 的见 [安装工具](./tool-install.md)。
- `apps` 的一条（应用项目）：

  ```json
  { "name": "dify", "description": { "zh": "…", "en": "…" }, "url": "https://github.com/langgenius/dify" }
  ```
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

应用项目条目（`catalog.json` 的 `apps`）同样逐条校验，写坏的只跳过那一条：

| 字段 | 规则 |
|------|------|
| `name` | 与 skill 的 `name` 同一条规则。**名字只在各自的数组里唯一**：应用项目可以和某个 skill 同名 |
| `description.zh`、`description.en` | 非空文字，不含控制字符 |
| `url` | `^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$`，且 `URL.canParse` 通过。只收 https；只含 RFC 3986 允许的字符，别的（汉字、空格）要先做百分号编码 |
| 重名、不认识的字段 | 同上 |

`url` 收得这么紧是因为它有两个去处：原样打到终端上让用户复制，和交给系统的打开命令。规则保证里面没有空白、引号、反斜杠、控制字符和不可见的字符（如改变文字方向的 `U+202E`），所以它在终端上不会被折开、看到的就是打开的、在任何系统的命令行上都是一个参数。这条规则是工单 07 的实现者定的，**维护者尚未确认**；要放宽（比如收 `http`）先改这里和 `catalog.ts` 的 `HTTPS_URL`。

其他不能继续的情况：标准输入或标准输出不是终端 →「没有交互式终端」，不打印大标志，不问语言，不读目录；任何没预料到的异常 →「意外错误」，原因取消息的第一行（为空时用错误的类型名），不打印堆栈。

### 5. Good/Base/Bad Cases

- Good：`index.json` 有 11 条合法 skill，`catalog.json` 三个数组为空 → 主菜单只有 Skill 一个分组和退出。
- Base：`index.json` 里一条的 `path` 是 `skills/../x` → 这一条被跳过，提示「目录中有 1 个条目格式有误，已跳过」，其余照常。
- Bad：`catalog.json` 的 `version` 是 2 → 不看它的其余内容，提示升级，以 1 退出。
- Good（语言）：系统语言是英文，不带 `--lang` 启动 → 大标志之后问 `Language / 语言`，光标在 `English` 上，按键提示是英文；下移到 `中文` 回车后，加载提示起全是中文。
- Base（语言）：`--lang en --help` → 不问，帮助是英文；`--lang fr` → 不问，出错「无法识别的参数」，退出状态 2，说明用系统语言。
- Bad（语言）：选完语言后目录读不了 → 出错说明用选定的语言，它的标题与语言提问收成的那一行之间空一行；以 1 退出。
- Base（应用项目）：`apps` 里一条的 `url` 是 `http://…` → 这一条被跳过并计入提示的数量，其余应用项目照常；全部被跳过时主菜单不出现这个分组。

### 6. Tests Required

测试只经 `runInstaller` 断言——给定目录、主目录、应答，看终端上输出了什么、退出状态是多少、记录到哪些命令和链接。不为内部模块单独写测试。唯一的另一个接缝是目录校验命令，它的测试把命令当子进程跑，见 [目录校验与 CI](./catalog-validation.md)。

**观感不靠测试把关**：栏宽、缩进、各画面的版式交给界面预览页和视觉评审，测试不卡死它们（见下面 Wrong 的例子）。例外是规格点名要卡住的几样，它们是对外的行为：

| 断言什么 | 在哪 | 怎么断言 |
|----------|------|----------|
| 上不上色 | `startup.test.ts` 的「颜色」一组、`prompts.test.ts` | 原始输出（`result.raw`）里有没有样式码；`NO_COLOR` 下画面文字不变 |
| 大标志的三档颜色 | `startup.test.ts` 的「大标志的颜色」一组 | 从原始输出里读出每个方块前面生效的前景色码，按它在字形里的列号归拢（`logoColors`）：渐变那一档卡两端、正中和两个四分点的色值，且同一列同色；洋红那一档每个方块都是 `35`、没有 `38;2;`；`NO_COLOR` 与 `COLORTERM` 同时设置时一个样式码都没有。期望的色值是照色标手算的，不从实现里取 |
| 焦点符号是洋红、输出里没有青色 | `prompts.test.ts` 的「焦点色」一组 | 用真实的交互库（`keys`）：`?`、`▸`、`■`、转动符号前面紧挨着洋红的码；四种提示连同各自出错时多出来的那一行都走一遍，原始输出里没有 `36`、`96`。那个文件强行打开了 Node 的上色，主题漏盖了哪个样式函数，交互库自带的青色就会在这里漏出来 |
| 按键提示整行在 79 列以内 | `prompts.test.ts` | 用真实的交互库断言整行 |
| 语言提问：问不问、问什么、光标起始在哪、选了之后用哪种语言 | `startup.test.ts` 的「语言提问」一组、`prompts.test.ts` 的「真实的画面：语言提问」一组 | 给 `answersLanguage: true` 自己应答。问不问看 `output` 里有没有 `Language / 语言`；光标起始在哪用 `accept()` 证明（接受之后的画面是哪种语言），真实的画面上再看 `▸` 在哪一行；收成一行、按键提示的语言用 `keys` |
| 表的栏间隔是三格 | `columns.test.ts` | 从一栏里**最长的那一格**写起，卡它后面恰好三格再是下一栏：`/beta-pack {3}Claude Code {3}新装/`。右对齐的栏（主菜单的数量）最长的一格后面不直接是下一格的字，改拿表头量这一栏从第几列开始（`startOf`）。**只卡间隔**：不写死行首缩进了几列、不卡折行点、不拿整行去比——整行相等会把缩进、勾选框和整句文案一并卡死。每张表至少一条，中文与英文各有 |
| 标题区的摆法：居中、字形、上下各空一行、标志下面没有横线、产品名粗体与版本号暗淡 | `startup.test.ts` 的「启动」一组 | 它是一块固定的字符画，摆法就是它的全部内容。居中量的是左右空白差不超过一列，**不写死补了几格**；字形是各行去掉同样多的缩进后与字形逐行相等——只量整块的边距的话，各行各自居中、字形走样了也照样通过 |

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

- **语言提问缺省由架子替用户按回车**，接受光标起始所在的那一项：`answers` 和 `keys` 里都不用写它。光标的起始位置是按系统语言定的，所以靠 `env: { LANG: … }`、`systemLocale` 决定界面语言的测试照旧成立，带 `--lang` 的也一样（那时根本不问）。专门测语言提问的用例给 `answersLanguage: true`：它就和别的提问一样，用掉 `answers` 的第一个应答，或由 `keys` 的脚本来按。用 `keys` 时架子等语言提问画出来才按回车，并且等它收成一行之后才开始认脚本要等的字——语言提问自己的按键提示不算数。

- `choose(label)` 按画面上第一栏的字选一项（单选），那一项不在、或者不可选，就失败；`pick(...labels)` 是多选，只勾这几项再确认，一个都不传就是什么都不勾直接确认；`accept()` 是什么都不动直接回车——单选选中光标起始所在的那一项（它不可选就失败），多选照提问出现时的勾选确认，用来证明“默认是什么”；是否题取它的缺省回答，用来证明“默认是什么”；`yes()`、`no()` 回答是否题；`secret(值)` 回答隐藏输入（问 key），`blank()` 是什么都不输直接回车；`interrupt()` 表示在这个提问上按 Ctrl+C。应答用错了提问的种类（单选用了 `pick`、是否题用了 `choose`、隐藏输入用了 `accept`……）会直接报错，并说该用哪个。预设的应答没用完或不够用，测试都会失败——所以“这里不该多问一次”不用另写断言，多问了自然会失败。
- 预设应答的提问器把每个提问照画面的样子记进 `output`（提问、每一行、光标所在行的说明全文；多选的每行前面带勾选框；不可选的行照交互库的拼法——单选的行首一个短横，多选的是不可选的勾选框——原因接在后面，并经过主题的 `disabled` 样式；是否题只有提问和后面的 `(y/N)` 或 `(Y/n)`；隐藏输入只有提问和后面那句固定的提示，**输入的东西不记**），所以“菜单里有什么”可以直接断言文字。它只是照着拼的：**一行到底选不选得了，要用 `keys` 在真实的交互库上证明**。
- 外部命令执行器只记录不执行：每条命令按先后进 `result.commands`（`{ command, args }`；整行交给 shell 的多一个 `shell: true`，`args` 是空的），缺省都以 0 退出。`commandResult: (command, args, { home }) => …` 预设结果：返回 `{ exitCode: 3 }` 让它非零退出，返回一个 `Error` 表示命令没能起来，它自己抛出表示执行器当场抛出（没返回承诺），什么都不返回就是成功。假的执行器不会真的改宿主的配置、也不会真的装工具——要证明“装完再看是新状态”，让 `commandResult` 顺手把配置文件写出来，或往第三个参数给的 `home`（这次运行的临时主目录）里写出工具的检查路径。
- 链接打开器只记录：要打开的网址按先后进 `result.opened`。`browser: false` 表示浏览器打不开——网址照样记下，然后打开器拒绝；用来证明“打不开时不报错、链接文本仍在”。
- 宿主的配置文件用 `home` 放：`home: { '.claude.json': JSON.stringify({ mcpServers: { x: {} } }) }`、`home: { '.codex/config.toml': '[mcp_servers.x]\n' }`。
- 运行环境的初始状态：`onPath: ['claude']`（可执行路径上有哪些命令，缺省只有 `claude`——也就是只检测到一个宿主、不问装进哪个；`['claude', 'codex']` 是两个都检测到，传 `[]` 就是一个都没有）；`home: { '.claude/skills/x/SKILL.md': '…' }`（主目录里事先有什么）；`links: { '.claude/skills/x': 'my-skills/x' }`（主目录里事先有的符号链接，链接 → 它指向哪，都是相对主目录的路径；在 Windows 上建的是不需要特权的 junction）；`catalogDir({ content: {...} })`（本地样例目录里各个 skill 的文件，缺省是 `SAMPLE_FILES`）；`interrupt: controller.signal` 和 `tmp`（要在中途触发中断并当场查看临时目录时用）；`columns: 160`（终端的列数，缺省不给，安装器按 80 列算——用来证明某样东西不随窗口的宽度变，如标题区按 80 列居中）。
- 默认来源（GitHub）的行为用 `cli/test/github.ts` 的 `fakeGitHub()`：它替换全局的 `fetch`，照真实接口的样子答复提交号、文件树和原始文件，记下每个请求（`requests`、`queries()`、`downloads()`）；`intercept` 可以抢在正常答复之前让某个请求失败。用完 `vi.unstubAllGlobals()`。
- `result.screen` 是最后留在画面上的文字（被擦掉重写的加载提示只算最后一次）；比较两次运行的文字时用它，不用 `output`。它只懂 `\r\x1b[2K`。要断言**挪过光标之后**屏幕上到底剩下什么（提问被擦掉了没有、「结果」的标题改写到了哪一行），用 `cli/test/terminal.ts` 的 `screenLines(result.raw)`：它把原始输出放进无头终端（`@xterm/headless`，80 列），读出每一行。
- 断言“某个值不出现在任何输出里”时查 `result.raw + result.stdout + result.stderr`，不只查 `output`。
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

### 替用户按的键按早了，或按到了别的提问上

**Symptom**：用 `keys` 的测试卡在语言提问上直到超时；或脚本的第一个键落在语言提问上，界面成了另一种语言、后面的键全部错位。

**Cause**：两件事。其一，交互库（`@inquirer/core` 的 `createPrompt`）对真正的可读流会把第一帧推迟一个 `setImmediate` 才画，画完这一帧才开始听按键——在那之前写进假键盘的键被直接丢掉。其二，语言提问的按键提示和主菜单的是同一句（`⏎ 选择`），脚本等的字在语言提问的画面上就已经有了。

**Fix**：都在架子里，测试不用管。假键盘（`cli/test/terminal.ts` 的 `keyboardPrompter`）盯着交互库的输出，等语言提问的最后一个选项画出来，再让出一轮（`setImmediate`）才按回车；架子（`harness.ts`）在语言提问被问出去到收成一行之间不认画面上的字，收成一行时把「认到哪了」推到那一行之后。

**Prevention**：升级交互库后先跑 `prompts.test.ts`：这段靠的是它首帧与听按键的先后，那边一改这里就会卡住或错位。再加一种启动时由架子代答的提问，照语言提问的做法接进这两处，不要在每个测试的 `keys` 前面手写一次回车。

### 往标准输出写了出错说明

**Symptom**：`npx oxy-tools | cat` 时终端上什么都没有，提示进了管道。

**Fix**：出错说明一律经 `ui.failure()`，它写到标准错误。测试里断言 `result.stderr`。
