# 终端输出

> 呈现层 `cli/src/ui.ts` 的职责和它做判断的规则。画面该长什么样（颜色与符号的含义、状态的写法、各类画面的版式）见 [界面设计](./ui-design.md)。

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

文案都在 `cli/src/messages.ts`，中英各一份、同一个 `Messages` 接口；加一句话两边都要加，类型检查会拦住漏的。出错的种类是 `Failure` 这个联合类型，每种对应标题、原因、下一步；出问题的网址或路径放在 `location`，由呈现层单独打一行，不截断也不折行。单个条目装不上的原因是另外的类型（skill 是 `SkillInstallProblem`，MCP 是 `McpInstallProblem`），文案在 `installProblem`、`mcpInstallProblem`。

括号里的技术原因只放错误码和 `HTTP 503` 这类不需要翻译的东西。**别的模块里不写给用户看的句子**：要说一句话，就给联合类型加一种情况，在 `messages.ts` 里写中英两份。外部命令自己打出来的话同样不转述（理由见 [安装 MCP](./mcp-install.md) 的 Design Decision）。

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
| 光标**移得到**不可选的行上，这时行首的 `-` 换成光标符号 | 压暗时再跳过行首的光标，并单独给它加粗：不然焦点所在的行成了全屏最淡的一行；别的行上光标是随整行加粗的，这里不单独加就比它们细 |
| 在这一行上按确认：不结束提问，列表下方多一行 `theme.i18n.disabledError`，经 `theme.style.error` | 两样都由主题给：句子是 `messages.ts` 的 `unavailable`，样式和列表下方的说明全文同一个画法（缩进三格、标签后空两格），标签是黄色粗体的「注意」。不盖的话打出来的是英文，颜色按 Node 的规则上 |

原因接在说明后面，所以说明要相应少占几列（`aboutWidth - displayWidth(分隔 + 原因)`），不然这一行会超过 79 列。

```ts
// 错：靠行内收尾码让原因亮回来——收尾码 \x1b[22m 会把外层的暗淡一并关掉，后半行全亮了
disabled: `${dim('·')} \x1b[22m${reason}`,

// 对：圈出来，由主题的 disabled 跳过
disabled: `${symbols.separator} ${REASON_MARK}${reason}${REASON_MARK}`,
```

> **Warning**：`row.disabled` 里带着零宽空格。任何不经 `theme.style.disabled` 就把它打出去的路径都会把零宽空格漏到终端上；测试架子画这种行时也走主题。`prompts.test.ts` 里有带样式和不带样式两条断言输出里没有 `\u200b`。

**多选里不可选的行**（`@inquirer/checkbox` 5.x，MCP 列表里所选宿主都不支持的条目）和单选的有几处不同，都是读它的源码并实测得来的：

| 行为 | 呈现层怎么配合 |
|------|----------------|
| 这一行拼成 `<光标或空格><勾选框> <name> <disabled>`，勾选框取 `theme.icon.disabledUnchecked`（勾着的取 `disabledChecked`），整行交给 `theme.style.disabled` | 两个图标都盖成同一个不带样式的符号（`–`，没有 Unicode 时 `[-]`）：整行本来就会被压暗；这种行勾不上，「勾着」的那个用不到，但不盖的话它按 Node 的规则上绿色 |
| **没有办法指定光标的起始位置**：它停在第一项上，哪怕那一项不可选 | 不处理。条目照目录的顺序排，光标可能起始就在不可选的行上，这时列表下方没有说明全文 |
| 在这一行上按空格：勾不上，下方多一行 `theme.i18n.disabledError` | 和单选共用同一句话、同一个画法 |
| `a` 全选、`i` 反选都跳过不可选的行 | 不用配合；`prompts.test.ts` 里有一条守着 |
| 一个能选的都没有时照样画得出来，用户只能回车（什么都没勾，等于返回） | 不用另做一个“没有可选的”画面 |

不可选的行里，名字后面各栏的文字**不要自己带样式**：行内片段的收尾码会把外层的暗淡一并关掉。三种列表（skill、MCP、工具）共用 `ui.ts` 的 `entryPicker(message, columns, entries)`：名称、几栏状态（`columns` 是各栏的表头——skill 和 MCP 是宿主的名字，工具只有一栏「状态」）、说明。给一行 `unavailable`（原因）它就不可选。

原因放在哪有两种，一张表里只用一种：

| | 原因的位置 | 用在 | 怎么拼 |
|---|---|---|---|
| 缺省 | 接在说明后面，前面一个分隔符（`… · 需要别的 AI Agent`） | MCP | `name` 是整行，`disabled` 是分隔符加圈起来的原因 |
| `reasonAsStatus: true` | 顶替状态，写在状态栏的位置（`不支持 macOS`），说明照常跟在后面 | 工具（只有一栏状态） | 这时不看 `cells`。交互库把行拼成「`name` + 一个空格 + `disabled`」，所以 `name` 只是名称、少补一格，`disabled` 是圈起来的原因补齐到状态栏的宽度、再接说明 |

```ts
// 错：把圈起来的原因塞进 cells、再另给一句 disabled——行尾多出一截，零宽空格也跟着 name 走了别的路
{ name: `${cells([entry.name, mark(reason)])}${about}`, disabled: reason }

// 对：原因在 disabled 里，位置靠 name 少补的那一格对上
{ name: pad(entry.name, widths[0] - 1), disabled: `${pad(mark(reason), widths[1])}${about}` }
```

`displayWidth` 把零宽空格算作 0 列，所以圈起来的原因可以直接交给 `pad`。

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

`prompts.test.ts` 里有这三样的断言，以及 `NO_COLOR` 下整段不带样式码的断言。再加一种提示时照此办：先读它的源码，把用到的样式函数和自带的句子列全。

---

## 隐藏输入

问 API key 用 `@inquirer/password`（5.x）。画面分三段，都由呈现层出：

```
── exa 需要 key ────────────────────────────────────────────────────────────────
  变量      EXA_API_KEY（必填）
  用途      Exa 搜索 API 的密钥
  申请      https://dashboard.exa.ai/api-keys
  提示      输入不会显示在屏幕上；留空回车将跳过 exa

? EXA_API_KEY (输入不显示，粘贴后回车)
```

| 段 | 函数 | 画法 |
|----|------|------|
| 说明 | `ui.keyRequest(mcp, variable)` | 每个 key 一个分区。标题必填的是「<MCP> 需要 key」，可选的是「<MCP> 可选的 key」；四行键值：变量（后面注明必填或可选）、用途、申请、提示（留空会怎样）。**申请地址和应用项目的链接一样整条写在一行上**，带下划线，不交给折行 |
| 提问 | `ui.keyQuestion(variable)` → `PasswordQuestion { message, theme }` | 提问是变量名，后面一句暗淡的固定提示（`theme.style.maskedText`，文案是 `messages.ts` 的 `hiddenInput`） |
| 结局 | `ui.keyOutcome(mcp, variable, outcome)` | 和已回答的提问同一个画法：记号、粗体的变量名、暗淡的 `·`、一句话。填了和沿用的是绿色 `✓`，留空的是暗淡 `–`。**只收结局（`'entered' \| 'blank' \| 'reused'`），不收值，也不写长度** |

交互库对隐藏输入的做法（读它的源码并实测得来），以及怎么配合：

| 行为 | 怎么配合 |
|------|----------|
| `mask` 不给时不显示任何字符，提问后面是 `theme.style.help(theme.style.maskedText)`；库自带的 `help` 按 Node 的规则上暗淡 | `mask: false`；主题盖掉 `maskedText`（本地化的那句话）和 `help`（呈现层自己的 `dim`） |
| `toggleMask` 缺省是开的：按 Ctrl+T 把输入显示成明文，下方还多一行英文的按键提示 | `toggleMask: false`。关掉之后它用不到 `keysHelpTip` |
| 每按一个键提问都重画一遍（内容一样），光标是藏起来的 | 不用配合。用 `keys` 的测试因此可以在输完之后再等一次那句提示 |
| 回答之后收成 `✓ 变量名 ·`，后面是空的 | 提问器的正式实现给 `clearPromptOnDone: true`，**回答之后把提问整个擦掉**，结局由 `ui.keyOutcome` 另写一行——这样留空和填了能用不同的记号和说法 |

`prompts.test.ts` 里有：输入的值和它的片段不在原始输出里、没有星号、Ctrl+T 之后再输一个字符逼它重画也没有明文、回答后屏幕上只剩结局那一行（用 `screenLines` 还原画面）、`NO_COLOR` 下不带样式码、没有 Unicode 时的记号。

---

## 带备注的表

呈现层的 `table(header, rows)` 把最后一栏当备注，**整张表一个放法**：

| 情况 | 画法 |
|------|------|
| 每一格备注（连同表头）接在行尾都不超过 79 列 | 备注成一栏，表头写它 |
| 有一格放不下 | 全部另起一行，缩进到它前一栏的左缘（skill 的汇总里是「位置」，MCP 的是「操作」）；表头不写这一栏。从那里起连最长的一格都放不下时，所有备注一起往左挪到刚好放得下，不让终端来折 |
| 一格备注都没有 | 表头不写这一栏 |

表头永远只有一行。

```ts
// 错：逐行决定——同一张表里有的备注在栏里、有的折到路径下面，折下去的像是路径的续行；
// 表头自己也可能被拆成两行（「备注」独占一行），哪怕一格备注都没有
rows.flatMap((row) => (fits(row) ? [inline(row)] : [start(row), ownLine(row)]));

// 对：先看整张表放不放得下，再统一决定
const inline = [noteHeader, ...notes].every((note) => total(widths) + displayWidth(note) <= USABLE);
```

名字和路径都来自目录，长度不由我们定：真实目录里的 `writing-for-agents` 就足以让前四栏占到 78 列。**预览页的样例里要有一条长名字**，不然这种拆行在画面上看不到。工单 08 补上 MCP 的长名字样例时就查出过一处：备注另起一行后仍从「操作」一栏的左缘起，超出了 80 列。

---

## 将执行的命令

执行任何外部命令之前，`ui.commandList(commands)` 把每一条完整地列出来：一个「将执行 N 条命令」分区，每条前面是暗淡的右对齐序号（至少两位宽），之后空一行。接着是 `ui.confirmCommands()`：执行、返回修改、取消，和 skill 的「开始安装吗」是同一个单选（`decision`）。

| 情况 | 画法 |
|------|------|
| 命令比一行长 | 按词折行，续行与命令的左缘对齐；**从不截断**。一个比一行还长的参数独占一行，由终端自己折 |
| 参数里有 shell 会另作解释的字符（网址里的 `&`、`?`） | 展示时给这个参数加单引号（`commandLine`），照着敲也是同一条命令；执行时不经过 shell，参数原样传 |
| 命令里有 key（`KeyArgument`） | 写成 `变量名=<变量名>`，尖括号这一段是黄色粗体，不加引号；真实的值不到呈现层来。`commandLine(command, placeholder)` 的第二个参数给占位符上样式 |
| 要提醒的事 | 命令之后空一行，每件事一行「注意」键值，各自后面空一行。先后是：必填的 key 没填而不安装的 MCP（一个 MCP 一行）、「key 以占位符显示，执行时才代入真实的值」（命令里有占位符才有）、宿主会当场打开浏览器登录 |

```ts
// 错：命令交给会截断的栏，用户确认的就不是完整的命令
truncate(commandLine(command), width, symbols.ellipsis);

// 对：只折行
hanging('  ', `${dim(pad(String(index + 1), indexWidth, 'right'))}  `, commandLine(command));
```

---

## 工具：将执行的命令、执行分区与结论

工具的画面是另一套函数，因为每条命令前面要写工具的名字，执行时输出也不归呈现层管：

| 段 | 函数 | 画法 |
|----|------|------|
| 将执行的命令 | `ui.toolCommandList(targets)` | 和 `commandList` 同一个分区标题（「将执行 N 条命令」）。每条是暗淡的右对齐序号、工具名（按最长的名字定宽）、完整命令；过长时折行，续行与**命令**的左缘对齐，从不截断。命令是一整行 shell，**原样写出，不加引号、不改一个字** |
| 确认 | `ui.confirmCommands()` | 与 MCP 共用 |
| 一个工具的执行 | `ui.toolInstallation(targets).begin(target)` | 以工具名为标题的分区，下面一行暗淡的 `$` 加命令。之后命令自己的输出直接进终端，**不经过呈现层**：顶格、没有样式，呈现层也不知道它有几行 |
| 这个工具的结论 | `begin` 返回的函数，收 `ToolResult` | 上方空一行，然后和结果行同一个画法：`✓ <名字> 已可用<说明>`（「已可用」绿）或 `✗ <名字> 失败 <原因>`（红色粗体），过长时折行 |
| 收尾 | `finish()` | 不止一个工具时先打一个「结果」分区，把各项的结论原样再列一遍；然后通栏横线和「合计」 |

- **没有转动符号，也不回头改写标题**：命令的输出在往同一个终端上写，行首重写和光标上移都会和它撞车。所以它不用 `progress`，「结果」是另起的一个分区，不是把「正在安装」改写而成。
- 结论里的话来自 `messages.ts` 的 `toolResult(result, evidence)`：通过时它以分隔的标点开头（`，在 PATH 中找到 uv` / `: uv found on PATH`），直接接在「已可用」后面；没通过时接在「失败」和一个空格后面。
- 结论上方的空行在命令的输出不以换行结尾时只是把那半行收掉，见 [安装工具](./tool-install.md) 的「已知的限制」。

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

转动符号所在的那一行用 `\r\x1b[2K` 重写（`ui.ts` 的 `spin`：加载提示、安装进行中的那一项都用它）。「正在安装」分区各类组件共用一个 `progress(targets, doing)`：`ui.installation`（skill）和 `ui.mcpInstallation` 只负责把各自的结果说成文字，行数、改写标题都在它里面。再加一类组件时照此接上，不要另写一遍。

**结果行和合计是再下面一层的 `tally()`**，`progress` 和工具的 `toolInstallation` 共用：`succeeded(lead, text)`、`failed(lead, reason)`、`skipped(lead, reason)` 各返回一项的结果行（`lead` 给结果符号排好位置；原因过长时自己折行）并记进合计，`total()` 返回通栏横线和「合计」那一行。套不进 `progress` 的组件（工具：输出不归呈现层管）直接用它，**不要再抄一遍失败行的拼法和合计**。

「正在安装」分区结束后要把标题换成「结果」，标题在上面好几行，只能把光标挪上去再挪回来。挪之前先确认两件事，否则会写到别的行上：

```ts
// 标题还在屏幕上、且没有哪一行被终端折开
const up = lines + 1;
if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
  out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
}
```

- `lines` 是标题之后**终端上实际占的行数**：一项的失败原因折成两行就算两行；一行里有个比一行还长的词（目录给的变量名、名字很长时剩下的地方放不下）折不开，会被终端自己折开，所以每一行按 `ceil(显示宽度 / 终端列数)` 算，不是数条目，也不是数呈现层打了几行。
- 跳过的原因和失败的原因一样经 `hanging` 自己折行：原因里可以有目录给的名字，长度不由我们定。
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

`cli/scripts/preview.ts` 经 `runInstaller` 按场景表驱动安装器：提问由真实的交互库渲染，按键是脚本发的，输出喂给无头终端（`@xterm/headless`），再把字符格连同样式转成 HTML，每个画面一格，深色和浅色终端各一份。它是视觉评审对照 [界面设计](./ui-design.md) 时用的画面证据；什么时候生成、拿它核对什么，见那份文档的「界面预览页」。下面是场景怎么写。

- 加了或改了画面，就在 `scenes` 里加一个场景（标题、说明、参数、环境、目录来源、可执行路径上的命令、主目录里事先有的文件和符号链接、按键）。要画出 skill 的各种状态，用 `MIXED`（已装、版本不同、手动放的目录、符号链接都有）。场景缺省只有 `claude` 一个命令，也就是只检测到一个宿主；两个宿主的场景给 `onPath: BOTH_HOSTS`，按键前面多一次回车确认宿主（`twoHosts(keys)`）。
- 一个画面有“默认”和“按了某个键之后”两种状态时，各做一个场景；英文、不显示颜色、没有 Unicode 的变体拍默认状态。例外是「光标停在不可选的行上」：它要按了键才看得到，变体也各拍一个。出错和帮助同样要有英文的变体。
- 画面取的是无头终端的**整个缓冲区**（`readCells` 读到 `buffer.length`），不是屏幕上那 `ROWS` 行：汇总加结果再回到主菜单的场景会超过一屏，只读前 `ROWS` 行会把底下的截掉而不报任何错（工单 12 之前有四个画面就是这样少了末尾几行）。
- 要画出应用项目，场景用 `catalog: withApps`（样例应用项目是为预览编的，其中一条的链接比一行长）；`browser: false` 让链接打开器拒绝。预览页从不真的打开浏览器。
- 要画出工具，场景用 `...TOOLS`（`withTools`：五条为预览编的样例——两种检查方式都有，一条另给了 Windows 的命令，一条只支持 Linux，一条只给 Codex 用；主目录里 `bun` 已经装着）。命令是假的：场景的 `shell: (command) => ShellRun` 说它往终端上打什么（`output`）、怎么结束（`exitCode`、`cannotStart`、`hangs`）、装没装上（`installs` 往可执行路径里放一个命令，`creates` 在主目录下写出一个路径），缺省是 `installsTool`（uv 装好，别的以非零状态结束）。名字和命令都长的样例在 `withLongCommandTool`。预览页从不真的执行命令。
- 要画出带 key 的 MCP，场景用 `...KEYED`（`withKeyedMcps`：在那四条之外，`context7` 有一个可选的 key，多一条 key 必填的 `exa`）；`toExaKey` 停在必填 key 的提问上，`toTwoKeys` 停在可选的那个上，`PASTED_KEY` 是假装粘贴的值。**生成之后在 `cli/.preview/index.html` 里搜这个值，应当一处都没有。**
- 要画出 MCP，场景用 `catalog: withMcps`（四条为预览编的样例，两种连接方式都有，其中一条只支持 Codex）；`MCP_STATES` 是只有 Claude Code、其中两条已配置，`MCP_TWO_HOSTS` 是两个宿主、Codex 的配置读不了；名字长的样例在 `withLongNameMcp`。两个宿主时按键用 `mcpTwoHosts(keys)`（MCP 分组在主菜单第二行，`twoHosts` 是给 skill 用的）。外部命令是假的：缺省都成功，`commands` 给一个假的执行器让某条失败或一直跑不完。预览页从不真的执行命令。
- 场景里的下载是假的：`downloads({ fails, hangs })` 让某个 skill 失败或一直下不完，`queryFails(failure)` 让查询以某种出错失败。每个场景有自己的临时主目录，结束时一并删掉；预览页不碰真实的主目录和网络。
- 生成物不提交（`cli/.gitignore`），也不随 npm 包发布（`package.json` 的 `files` 只有 `dist`）。
- 预览页和测试架子共用 `cli/test/terminal.ts` 的假键盘。
