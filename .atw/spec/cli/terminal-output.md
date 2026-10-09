# 终端输出

> 呈现层 `cli/src/ui.ts` 的职责和它做判断的规则。画面该长什么样（颜色与符号的含义、各画面的版式）目前记在任务目录的 `ui-direction.md`，任务归档时整理进本层。

---

## 只有呈现层往终端上写

`createUi()` 返回的对象是唯一的输出出口。其余模块只说“显示什么”：`flow.ts` 调 `ui.installSummary(targets)`、`ui.mainMenu(groups)`，不拼样式码、不算栏宽、不决定空行。

```ts
// 错：流程里自己拼
stdout.write(`\x1b[1m${target.name}\x1b[22m  ${target.location}\n`);

// 对：交给呈现层
ui.installSummary(targets);
```

提问也一样：呈现层把提问做成 `SelectQuestion`（已排好栏的每一行、光标起始位置、主题），提问器只负责问。**主题要把交互库用到的样式函数和它自带的句子全部盖掉**（前缀、光标、提问、回答、活动行、说明、不可选的行、在不可选的行上按确认时的那句话及其样式、按键提示），原因见下一节。

文案都在 `cli/src/messages.ts`，中英各一份、同一个 `Messages` 接口；加一句话两边都要加，类型检查会拦住漏的。出错的种类是 `Failure` 这个联合类型，每种对应标题、原因、下一步；出问题的网址或路径放在 `location`，由呈现层单独打一行，不截断也不折行。单个条目装不上的原因是另一个联合类型（`SkillInstallProblem`），文案在 `installProblem`。

括号里的技术原因只放错误码和 `HTTP 503` 这类不需要翻译的东西。**别的模块里不写给用户看的句子**：要说一句话，就给联合类型加一种情况，在 `messages.ts` 里写中英两份。

```ts
// 错：英文句子原样进了中文界面
throw new Error('unsafe path');            // → 下载中断（unsafe path）

// 对：一种有名字的情况，文案在 messages.ts
throw new UnsafePathError();               // → SkillInstallProblem { kind: 'unsafe-path' }
```

**文案有长度上限的地方要自己算**：按键提示是交互库原样打出来的一行，呈现层不替它折行，中英文都必须在 79 列以内（英文的「⏎ confirm (none = back)」就是这么来的——原先那句超了两列，被终端折成两行）。加了按键提示的文案，就在 `prompts.test.ts` 里用真实的交互库断言整行。

---

## 上不上色

**呈现层自己判断，不交给 Node**，标准输出和标准错误各判各的：

| 条件 | 结果 |
|------|------|
| 这个流是终端，且环境里没有 `NO_COLOR` | 带样式 |
| 环境里有 `NO_COLOR`（哪怕为空） | 完全不带样式：颜色、粗体、暗淡都没有 |
| 这个流不是终端 | 不带样式 |
| `FORCE_COLOR` | 不理会；与 `NO_COLOR` 同时设置时以 `NO_COLOR` 为准 |

上色只用 `node:util` 的 `styleText`，并关掉它自带的检测：

```ts
color ? styleText(format, text, { validateStream: false }) : text;
```

不这么做的话，Node 会按真实进程的 `process.stdout` 和 `FORCE_COLOR` 来决定，和上表不一致。交互库内部没被主题盖掉的样式正是按 Node 那套规则上色的，所以主题必须盖全。

> **Warning**：Node 22.13 的 `styleText` 不会在行内片段收尾后重申外层样式。整行加粗、行内又有暗淡或粗体片段时，片段的收尾码 `\x1b[22m` 会把后半行的粗体一并关掉（Node 24 会自动重申）。活动行的样式因此在每个 `\x1b[22m` 之后自己补一个 `\x1b[1m`；别的地方要嵌套样式时照此处理。

---

## 用不用 Unicode

沿用交互库（`@inquirer/figures`）的判断，它没有导出，呈现层照写了一份（`ui.ts` 的 `supportsUnicode`）：Windows 上只有 Windows Terminal、VS Code 等几种终端算支持；其他系统上只有 `TERM=linux` 不算。

不支持时，`ui.ts` 里的 `ASCII` 符号表整体替换 `UNICODE`（两张表同一个类型，加符号时两边都要加；版本变化的箭头 `→` 退成 `->`），按键提示里交互库写死传进来的 `↑↓`、`⏎` 换成 `messages.ts` 的 `keyNames`。交互库传进来的是英文单词的按键（多选的 `space`），任何终端里都换成 `keyWords` 里的字。

ASCII 的符号宽度可以和 Unicode 的不同（勾选框 `■` 一列，`[x]` 三列）。**凡是按符号宽度对齐的地方都用 `displayWidth(symbols.x)` 算**，不写死列数：多选列表的表头缩进就是「勾选框的宽度 + 1」。

---

## 不可选的行

列表里某一行选不了时（一个宿主都没检测到时主菜单的组件分组），给那一行一个 `disabled`——它是**原因**，不是布尔值：

```ts
// cli/src/prompter.ts
export interface SelectChoice<Value> {
  // …
  disabled?: string; // 这一行不可选的原因，接在这一行的末尾；有它就选不了
}
```

交互库（`@inquirer/select` 5.x）对这种行的做法，都是实测得来的：

| 行为 | 呈现层怎么配合 |
|------|----------------|
| 把这一行拼成 `- <name> <disabled>`，整行交给 `theme.style.disabled` | 整行压暗，但原因保持正常亮度（它是用户最需要读的字）：原因用一对零宽空格（`REASON_MARK`）圈起来，压暗时跳过圈着的这一段。圈在这一步被拆掉，**不会打到终端上** |
| 光标**缺省停在第一项上，哪怕它不可选** | 有不可选的行时，用 `default` 把光标放到第一个能选的项上（都不能选就是「退出」） |
| 光标**移得到**不可选的行上，这时行首的 `-` 换成光标符号 | 压暗时再跳过行首的光标：不然焦点所在的行成了全屏最淡的一行 |
| 在这一行上按确认：不结束提问，列表下方多一行 `theme.i18n.disabledError`，经 `theme.style.error` | 两样都由主题给：句子是 `messages.ts` 的 `unavailable`，样式和列表下方的说明全文同一个画法（缩进三格、标签后空两格），标签是黄色粗体的「注意」。不盖的话打出来的是英文，颜色按 Node 的规则上 |

原因接在说明后面，所以说明要相应少占几列（`aboutWidth - displayWidth(分隔 + 原因)`），不然这一行会超过 79 列。

```ts
// 错：靠行内收尾码让原因亮回来——收尾码 \x1b[22m 会把外层的暗淡一并关掉，后半行全亮了
disabled: `${dim('·')} \x1b[22m${reason}`,

// 对：圈出来，由主题的 disabled 跳过
disabled: `${symbols.separator} ${REASON_MARK}${reason}${REASON_MARK}`,
```

> **Warning**：`row.disabled` 里带着零宽空格。任何不经 `theme.style.disabled` 就把它打出去的路径都会把零宽空格漏到终端上；测试架子画这种行时也走主题。`prompts.test.ts` 里有带样式和不带样式两条断言输出里没有 `\u200b`。

多选（`@inquirer/checkbox`）的不可选行另有 `icon.disabledChecked`、`icon.disabledUnchecked` 两个图标，还没有画面用到；第一个用到的功能要把它们也盖掉，并在 `prompts.test.ts` 里加 `NO_COLOR` 的断言。

---

## 是否题

覆盖一个不是本工具装的目录之前问的那一句用 `@inquirer/confirm`（6.x）。呈现层给出 `ConfirmQuestion`：

```ts
// cli/src/prompter.ts
export interface ConfirmQuestion {
  message: string;
  default: boolean;                      // 什么都不输直接回车时的回答
  answers: { yes: string; no: string };  // 回答之后显示的字（是 / 否）
  theme: PromptTheme;
}
```

交互库对是否题的做法（读它的源码并实测得来），以及主题怎么配合：

| 行为 | 呈现层怎么配合 |
|------|----------------|
| 提问后面的按键提示由 `theme.keywords.yes`、`no` 的首字母拼成，缺省那一个经 `theme.style.confirmDefault`，整段再经 `theme.style.defaultAnswer`；库自带的 `confirmDefault` 对没有大小写的字（汉字）会按 Node 的规则上青色 | `keywords` 固定是 `y`、`n`，任何语言下都一样（按的就是这两个键），`confirmDefault` 转大写，`defaultAnswer` 加括号并压暗，得到 `(y/N)`。不把「是」「否」放进 `keywords`：提示会变成 `是/否`，而用户按的仍是 y、n |
| 回答之后显示的字来自 `transformer`，缺省是 `keywords` 里的词 | 提问器的正式实现用 `question.answers` 做 `transformer`，收成的一行写「是」「否」 |
| 输入了认不出的东西再回车：不结束提问，下方多一行 `theme.keywords.error(...)`，经 `theme.style.error`；之后再按任何键这一行就消失 | 句子是 `messages.ts` 的 `answerYesOrNo`；样式沿用不可选的行那句话的画法（黄色粗体的「注意」）。不盖的话打出来的是英文 |

`prompts.test.ts` 里有这三样的断言，以及 `NO_COLOR` 下整段不带样式码的断言。再加一种提示（隐藏输入的 `password`）时照此办：先读它的源码，把用到的样式函数和自带的句子列全。

---

## 带备注的表

呈现层的 `table(header, rows)` 把最后一栏当备注，**整张表一个放法**：

| 情况 | 画法 |
|------|------|
| 每一格备注（连同表头）接在行尾都不超过 79 列 | 备注成一栏，表头写它 |
| 有一格放不下 | 全部另起一行，缩进到它前一栏（汇总里是「位置」）的左缘；表头不写这一栏 |
| 一格备注都没有 | 表头不写这一栏 |

表头永远只有一行。

```ts
// 错：逐行决定——同一张表里有的备注在栏里、有的折到路径下面，折下去的像是路径的续行；
// 表头自己也可能被拆成两行（「备注」独占一行），哪怕一格备注都没有
rows.flatMap((row) => (fits(row) ? [inline(row)] : [start(row), ownLine(row)]));

// 对：先看整张表放不放得下，再统一决定
const inline = [noteHeader, ...notes].every((note) => total(widths) + displayWidth(note) <= USABLE);
```

名字和路径都来自目录，长度不由我们定：真实目录里的 `writing-for-agents` 就足以让前四栏占到 78 列。**预览页的样例里要有一条长名字**，不然这种拆行在画面上看不到。

---

## 应用项目：链接怎么写、打不开怎么说

应用项目的详情（`ui.appDetail`）是一个以它名字为标题的分区，两行键值：说明全文、带下划线的链接；随后 `ui.linkOutcome(opened)` 接一行结局。

| 情况 | 画法 |
|------|------|
| 链接 | **整条写在一行上，不经 `keyValue` 的折行**，再长也不截断、不折开：超过 80 列时由终端自己折，续行顶格。这是“折行由呈现层做”的例外，和出错说明里的网址同一个理由——折开了就没法照着复制 |
| 打开器没有拒绝 | `  ✓  已在默认浏览器打开；打不开时请复制上面的链接`，和结果行同一个画法（绿色的 `✓`）。后半句固定都写：打开器看不出来的失败（远程终端）靠它兜住 |
| 打开器拒绝 | 一行「注意」键值（黄色粗体）：`没能打开浏览器，请复制上面的链接自行打开`。**不是出错**：不用红色，不经 `ui.failure()`，不写到标准错误 |

```ts
// 错：链接交给会折行的键值行——现在不被折开，只是碰巧 wrap() 不拆单个词
...keyValue(t.linkKey, paint('underline', app.url)),

// 对：明说它独占一行
`  ${dim(pad(t.linkKey, KEY_WIDTH))}${paint('underline', app.url)}`,
```

先打详情、再去打开：链接文本在打开器返回之前就已经在屏幕上了。

列表（`ui.appList`）是单选的两栏表（名称、说明），末尾一项「返回」，与条目之间空一行，和主菜单的「退出」同一个画法；看完一个回到列表时用 `default` 把光标留在那一项上。

---

## 标准输出与标准错误

- 出错说明（`ui.failure()`）写到标准错误，其余写到标准输出。
- 没有交互式终端时不打印大标志、不读目录。
- 加载提示用 `\r\x1b[2K` 在同一行上重写，读完后擦掉；它只在已经确认是终端之后才出现。

---

## 改写已经打出去的行

转动符号所在的那一行用 `\r\x1b[2K` 重写（`ui.ts` 的 `spin`：加载提示、安装进行中的那一项都用它）。

「正在安装」分区结束后要把标题换成「结果」，标题在上面好几行，只能把光标挪上去再挪回来。挪之前先确认两件事，否则会写到别的行上：

```ts
// 标题还在屏幕上、且没有哪一行被终端折开
const up = lines + 1;
if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
  out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
}
```

- `lines` 是标题之后实际打出的行数：一项的失败原因折成两行就算两行，所以要数呈现层自己折出来的行，不是数条目。
- 条件不满足时不改写，标题留作「正在安装」。
- 除了这两处，不回头改已经打出去的东西。

> **Warning**：测试架子的 `result.screen` 只懂 `\r\x1b[2K`，不懂光标上移。改写过标题的输出里，`output` 和 `screen` 都同时有「正在安装」和「结果」两个标题的文字；断言结果时匹配 `── 结果 ─`，不要断言「正在安装」不存在。真实的样子看界面预览页。

---

## 宽度

按 80 列设计，正文每行最多 79 列（通栏横线、分区标题线、大标志右端的产品名到第 80 列）。对齐、截断、折行都按显示宽度算（汉字和全角标点两列），用 `cli/src/text.ts` 的 `displayWidth`、`pad`、`truncate`、`wrap`，不用 `String.length` 和 `padEnd`。

```ts
// 错：汉字按一列算，栏会错位
name.padEnd(20);

// 对
pad(name, 20);
```

栏宽按内容定（这一栏最长的一格加两格间隔），不写死。画横线之类按“总宽减去内容宽”算重复次数的地方要夹住下限：目录是远程数据，名字可以长到让差值为负，`'─'.repeat(-1)` 会抛错。

---

## 界面预览页

```bash
cd cli && npm run preview   # 生成 cli/.preview/index.html
```

`cli/scripts/preview.ts` 经 `runInstaller` 按场景表驱动安装器：提问由真实的交互库渲染，按键是脚本发的，输出喂给无头终端（`@xterm/headless`），再把字符格连同样式转成 HTML，每个画面一格，深色和浅色终端各一份。它是视觉评审对照设计方向时用的画面证据。

- 加了或改了画面，就在 `scenes` 里加一个场景（标题、说明、参数、环境、目录来源、可执行路径上的命令、主目录里事先有的文件和符号链接、按键）。要画出 skill 的各种状态，用 `MIXED`（已装、版本不同、手动放的目录、符号链接都有）。场景缺省只有 `claude` 一个命令，也就是只检测到一个宿主；两个宿主的场景给 `onPath: BOTH_HOSTS`，按键前面多一次回车确认宿主（`twoHosts(keys)`）。
- 一个画面有“默认”和“按了某个键之后”两种状态时，各做一个场景；英文、不显示颜色、没有 Unicode 的变体拍默认状态。
- 要画出应用项目，场景用 `catalog: withApps`（样例应用项目是为预览编的，其中一条的链接比一行长）；`browser: false` 让链接打开器拒绝。预览页从不真的打开浏览器。
- 场景里的下载是假的：`downloads({ fails, hangs })` 让某个 skill 失败或一直下不完，`queryFails(failure)` 让查询以某种出错失败。每个场景有自己的临时主目录，结束时一并删掉；预览页不碰真实的主目录和网络。
- 生成物不提交（`cli/.gitignore`），也不随 npm 包发布（`package.json` 的 `files` 只有 `dist`）。
- 预览页和测试架子共用 `cli/test/terminal.ts` 的假键盘。
