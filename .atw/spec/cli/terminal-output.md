# 终端输出

> 呈现层 `cli/src/ui.ts` 的职责和它做判断的规则。画面该长什么样（颜色与符号的含义、状态的写法、各类画面的版式）见 [界面设计](./ui-design.md)。

---

## 只有呈现层往终端上写

`createUi()` 返回的对象是唯一的输出出口。其余模块只说“显示什么”：`flow.ts` 调 `ui.installSummary({ skills, mcps, tools })`、`ui.mainMenu(recommended, purposes)`，不拼样式码、不算栏宽、不决定空行。

```ts
// 错：流程里自己拼
stdout.write(`\x1b[1m${target.name}\x1b[22m  ${target.location}\n`);

// 对：交给呈现层
ui.installSummary({ skills, mcps, tools });
```

提问也一样：呈现层把提问做成 `SelectQuestion`（已排好栏的每一行、光标起始位置、主题），提问器只负责问。**主题要把交互库用到的样式函数和它自带的句子全部盖掉**（前缀、光标、提问、回答、活动行、说明、不可选的行、在不可选的行上按确认时的那句话及其样式、按键提示），原因见下一节。

文案都在 `cli/src/messages.ts`，中英各一份、同一个 `Messages` 接口；加一句话两边都要加，类型检查会拦住漏的。例外有两处：语言提问的三段字（`Language / 语言`、`中文`、`English`）不随界面语言变，是 `messages.ts` 里的常量 `LANGUAGE_QUESTION`、`LANGUAGES`（终端界面的语言提问和网页界面上切换语言的控件共用这一份）；网页界面的页面自己那几句版式上固定的字（栏名、按钮、结束画面的说明）在 `cli/web/text.tsx` 里，因为它们在页面连不上安装器时也得说得出来——哪些算、为什么，见 [网页界面的契约](./web-ui-contract.md)。出错的种类是 `Failure` 这个联合类型，每种对应标题、原因、下一步；出问题的网址或路径放在 `location`，由呈现层单独打一行，不截断也不折行。单个条目装不上的原因是另外的类型（skill 是 `SkillInstallProblem`，MCP 是 `McpInstallProblem`），文案在 `installProblem`、`mcpInstallProblem`。

括号里的技术原因只放错误码和 `HTTP 503` 这类不需要翻译的东西。**别的模块里不写给用户看的句子**：要说一句话，就给联合类型加一种情况，在 `messages.ts` 里写中英两份。外部命令自己打出来的话同样不转述（理由见 [安装 MCP](./mcp-install.md) 的 Design Decision）。

```ts
// 错：英文句子原样进了中文界面
throw new Error('unsafe path');            // → 下载中断（unsafe path）

// 对：一种有名字的情况，文案在 messages.ts
throw new UnsafePathError();               // → SkillInstallProblem { kind: 'unsafe-path' }
```

**文案有长度上限的地方要自己算**：按键提示是交互库原样打出来的一行，呈现层不替它折行，中英文都必须在 79 列以内（英文的「⏎ confirm (none = back)」就是这么来的——原先那句超了两列，被终端折成两行）。加了按键提示的文案，就在 `prompts.test.ts` 里用真实的交互库断言整行。最紧的是英文界面加没有 Unicode 的多选那一行：按键换成了 `up/down`、`enter`，整行正好 79 列，那条测试除了断言整行还量了宽度。

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

**大标志的渐变是「颜色只用 `styleText`」唯一的例外**：`styleText` 只有命名色，24 位的前景色码由呈现层自己拼。它仍受上表管——这个流不带样式时，标志同样一个样式码都没有——在此之上再看一个只管标志的条件：

| 条件 | 标志 |
|------|------|
| 带样式，且环境变量 `COLORTERM` 等于 `truecolor` 或 `24bit` | 每个方块前面一个 `ESC[38;2;<红>;<绿>;<蓝>m`，每行末尾一个 `ESC[39m` 收尾；空格不带码 |
| 带样式，`COLORTERM` 是别的值或没有 | 整行经 `styleText('magenta', …)`。不做 256 色的近似，也不看 `TERM` |
| 没有 Unicode | ASCII 字符画只加粗，上面两条都不管它 |

颜色按列算（`ui.ts` 的 `logoColor`）：`t = 列号 ÷（标志的宽 − 1）`，在三个色标 `#E255C0`、`#8B5CF6`、`#3D8FE6` 之间分段线性过渡，红、绿、蓝各自四舍五入。列号是方块在字形里的位置，不含居中补的空格。别的地方不许自己拼颜色的样式码；下面 Warning 里重申粗体的那个 `\x1b[1m` 不是上色，是另一回事。

```ts
// 错：断言「原始输出里第一个 24 位色码是粉」。字形的第一行以空格开头，第一个带码的方块在第 1 列，
// 它已经往紫那边走了一步（38;2;219;86;197）
expect(result.raw.match(/\x1b\[38;2;[0-9;]+m/)?.[0]).toBe('\x1b[38;2;226;85;192m');

// 对：按方块在字形里的列号读颜色，卡最左一列（第二到四行才有方块）
expect(new Set(logoColors(result.raw).get(0))).toEqual(new Set(['38;2;226;85;192']));
```

> **Warning**：Node 22.13 的 `styleText` 不会在行内片段收尾后重申外层样式。整行加粗、行内又有暗淡或粗体片段时，片段的收尾码 `\x1b[22m` 会把后半行的粗体一并关掉（Node 24 会自动重申）。活动行的样式因此在每个 `\x1b[22m` 之后自己补一个 `\x1b[1m`；别的地方要嵌套样式时照此处理。

---

## 用不用 Unicode

沿用交互库（`@inquirer/figures`）的判断，它没有导出，呈现层照写了一份（`ui.ts` 的 `supportsUnicode`）：Windows 上只有 Windows Terminal、VS Code 等几种终端算支持；其他系统上只有 `TERM=linux` 不算。

不支持时，`ui.ts` 里的 `ASCII` 符号表整体替换 `UNICODE`（两张表同一个类型，加符号时两边都要加；版本变化的箭头 `→` 退成 `->`），按键提示里交互库写死传进来的 `↑↓`、`⏎` 换成 `messages.ts` 的 `keyNames`。交互库传进来的是英文单词的按键（多选的 `space`），任何终端里都换成 `keyWords` 里的字。

ASCII 的符号宽度可以和 Unicode 的不同（勾选框 `■` 一列，`[x]` 三列）。**凡是按符号宽度对齐的地方都用 `displayWidth(symbols.x)` 算**，不写死列数：多选列表的表头缩进就是「勾选框的宽度 + 1」。

---

## 不可选的行

列表里某一行选不了时（一个宿主都没检测到时混合列表里的每个组件；所选宿主都不支持的 MCP；这个系统装不了、或要的宿主没检测到的工具），给那一行一个 `disabled`——它是**原因**，不是布尔值：

```ts
// cli/src/prompter.ts
export interface SelectChoice<Value> {
  // …
  disabled?: string; // 这一行不可选的原因，接在这一行的末尾；有它就选不了
}
```

**现在只有多选（混合列表）有不可选的行。** 单选里原先有一处——主菜单上一个宿主都没检测到时进不去的旧入口——工单 08 取消了最后一个旧入口之后就没有了；主题里单选和多选共用的那几样（`style.disabled`、`i18n.disabledError`、`style.error`）照样盖着。下面这张表留着备查，哪天单选里又要有不可选的行时照此配合。交互库（`@inquirer/select` 5.x）对这种行的做法，都是实测得来的：

| 行为 | 呈现层怎么配合 |
|------|----------------|
| 把这一行拼成 `- <name> <disabled>`，整行交给 `theme.style.disabled` | 整行压暗，但原因保持正常亮度（它是用户最需要读的字）：原因用一对零宽空格（`REASON_MARK`）圈起来，压暗时跳过圈着的这一段。圈在这一步被拆掉，**不会打到终端上** |
| 光标**缺省停在第一项上，哪怕它不可选** | 有不可选的行时，要用 `default` 把光标放到第一个能选的项上 |
| 光标**移得到**不可选的行上，这时行首的 `-` 换成光标符号 | 压暗时再跳过行首的光标，并单独给它加粗：不然焦点所在的行成了全屏最淡的一行；别的行上光标是随整行加粗的，这里不单独加就比它们细 |
| 在这一行上按确认：不结束提问，列表下方多一行 `theme.i18n.disabledError`，经 `theme.style.error` | 两样都由主题给：句子是 `messages.ts` 的 `unavailable`，样式和列表下方的说明全文同一个画法（缩进三格、标签后空两格），标签是黄色粗体的「注意」。不盖的话打出来的是英文，颜色按 Node 的规则上 |

单选的原因接在行尾的说明后面，所以说明要相应少占几列（`aboutWidth - displayWidth(分隔 + 原因)`），不然这一行会超过 79 列。圈原因的办法单选、多选都一样：

```ts
// 错：靠行内收尾码让原因亮回来——收尾码 \x1b[22m 会把外层的暗淡一并关掉，后半行全亮了
disabled: `${dim('·')} \x1b[22m${reason}`,

// 对：圈出来，由主题的 disabled 跳过
disabled: `${symbols.separator} ${REASON_MARK}${reason}${REASON_MARK}`,
```

> **Warning**：`row.disabled` 里带着零宽空格。任何不经 `theme.style.disabled` 就把它打出去的路径都会把零宽空格漏到终端上；测试架子画这种行时也走主题。`prompts.test.ts` 里有带样式和不带样式两条断言输出里没有 `\u200b`。

**多选里不可选的行**（`@inquirer/checkbox` 5.x，混合列表里不可选的组件）和单选的有几处不同，都是读它的源码并实测得来的：

| 行为 | 呈现层怎么配合 |
|------|----------------|
| 这一行拼成 `<光标或空格><勾选框> <name> <disabled>`，勾选框取 `theme.icon.disabledUnchecked`（勾着的取 `disabledChecked`），整行交给 `theme.style.disabled` | 两个图标都盖成同一个不带样式的符号（`–`，没有 Unicode 时 `[-]`）：整行本来就会被压暗；这种行勾不上，「勾着」的那个用不到，但不盖的话它按 Node 的规则上绿色 |
| **没有办法指定光标的起始位置**：它停在第一项上，哪怕那一项不可选 | 不处理。光标可能起始就在不可选的行上；混合列表这时照样在列表下方显示它的类型和说明（见「不可选的行下方的类型和说明」） |
| 在这一行上按空格：勾不上，下方多一行 `theme.i18n.disabledError` | 和单选共用同一句话、同一个画法 |
| `a` 全选、`i` 反选都跳过不可选的行 | 不用配合；`prompts.test.ts` 里有一条守着 |
| 一个能选的都没有时照样画得出来，用户只能回车（什么都没勾，等于返回） | 不用另做一个“没有可选的”画面 |

不可选的行里，名字后面的文字**不要自己带样式**：行内片段的收尾码会把外层的暗淡一并关掉。

**原因一律写在状态的位置**（混合列表 `mixedPicker`，现在唯一有不可选行的列表）：交互库把行拼成「`name` + 一个空格 + `disabled`」，所以 `name` 只是名称、少补一格，`disabled` 是圈起来的原因补齐到状态栏的总宽、再接说明。这种行不写各栏的状态（`cells`）：原因顶替了它们。原先 MCP 的旧列表把原因接在行尾的说明后面（`… · 需要别的 AI Agent`），混合列表里说明一栏可能只剩十几列、放不下，工单 07 起没有这种写法了。

```ts
// 错：把圈起来的原因塞进 cells、再另给一句 disabled——行尾多出一截，零宽空格也跟着 name 走了别的路
{ name: `${cells([entry.name, mark(reason)])}${about}`, disabled: reason }

// 对：原因在 disabled 里，位置靠 name 少补的那一格对上
{ name: pad(entry.name, nameWidth - 1), disabled: `${pad(mark(reason), statusWidth)}${about}` }
```

**原因可以比状态栏宽**：只选了一个宿主时状态只有一栏（`Codex` 加栏间隔 9 列），「需要别的 AI Agent」要 17 列。`mixedPicker` 先按可选的行算各栏状态的宽度，原因加栏间隔比它们合起来还宽时，把差的那几列加在最后一栏上——表头、可选的行、说明的起始位置都跟着它走。不这样做的话 `pad` 不截断，不可选的那一行的说明会比别的行靠右，整行也可能超过 79 列。

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
  说明      Exa 搜索 API 的密钥；注册后有免费额度，在控制台的 API Keys 页创建
  申请      https://dashboard.exa.ai/api-keys
  提示      输入不会显示在屏幕上；留空回车将跳过 exa

? EXA_API_KEY (输入不显示，粘贴后回车)
```

| 段 | 函数 | 画法 |
|----|------|------|
| 说明 | `ui.keyRequest(mcp, variable)` | 每个 key 一个分区。标题必填的是「<MCP> 需要 key」，可选的是「<MCP> 可选的 key」，下方空一行；四行键值：变量（后面注明必填或可选）、说明、申请、提示（留空会怎样）。第二行的键和列表下方的「说明」是同一个词（`aboutColumn`）：2026-10-11 之前它叫「用途」，和主菜单上的「用途」撞了词。**申请地址和外部项目的链接一样整条写在一行上**，带下划线，不交给折行 |
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

## 选择安装范围

`ui.scopePicker(directory)` 给出一个单选（`SelectQuestion<Scope>`）：两行依次是全局、项目，没有表头，`default` 是 `'global'`（光标起始在全局）。每行是名字补到栏宽（两个名字里长的那个加栏间隔）再接一句说明；回答后收成一行，写的是名字（`short`）。

| 项 | 约定 |
|----|------|
| 当前目录 | `directory` 是流程交进来的、给用户看的写法：项目目录在主目录里时把主目录写成 `~`（`~/work/my-app`），不在主目录里时照原样写全（`plan.ts` 的 `homeRelative`，汇总里的位置也用它）。呈现层把它暗淡地接在「项目」那句说明的后面，只是告知，不为它另设确认 |
| 放不下时 | 这一行（光标的两格、名字一栏、说明、目录）超过 79 列就**从前面截**目录，以省略号开头、留住末尾的几级——认得出是哪个目录靠的是最后几级，`truncate` 截的是末尾，这里不用它。目录以外的部分不截 |
| 不显示颜色、没有 Unicode | 只按现有的规则退：目录不再暗淡；省略号是 `symbols.ellipsis`（`...`） |

汇总和覆盖前另问里的位置不归这里管：算计划的（`plan.ts`）按安装范围把它写好，流程原样交给呈现层（`InstallTarget.location`、`ThirdPartyTarget.location`）——全局的以 `~` 开头，项目的是相对项目目录的路径。**呈现层不知道安装范围**：MCP 在项目范围下的不同都由流程折进交给它的东西里——状态里的 `global-only`（这个宿主的 MCP 只能装到全局；栏里和 `unsupported` 写同一个词「不支持」）、`mcpColumnNotices` 的 `globalOnly`（列表上方的那一行）、`summaryNotices` 的 `plaintextKeys` 和 `approvals`（汇总下方的两行）。一行 MCP 各栏全是 `unsupported` / `global-only` 时不可选：有 `global-only` 的原因是 `mcpGlobalOnly`（「只能装到全局」），否则是「需要别的 AI Agent」；一个宿主都没检测到的原因排在它们前面。**哪一行不可选、是哪一种原因，不由呈现层判断**：`availability.ts` 的 `listingStatus` 给每一行带上 `unavailable`（一个种类，`Unavailable`），呈现层只把它写成那句话。

---

## 汇总：按类型分的小表与备注

`ui.installSummary({ skills, thirdParty, mcps, tools })` 打一个分区「将安装 N 项」，里面每种类型一张小表（这一轮没有的类型没有它的小表），小表之间空一行，分区以空行收尾。小表由 `ui.ts` 的 `summaryTables(tables)` 一起排，**几张表合起来算栏宽**：

| 栏 | 宽度 |
|----|------|
| 条目（表头是类型的名字，取混合列表段标题的那个词）、AI Agent、操作 | 整个分区里这一栏最长的一格加栏间隔，各张小表对齐 |
| 位置 | 只有 skill 的小表有；按这一栏最长的一格定 |
| 备注 | 见下 |

备注**整个分区一个放法**：

| 情况 | 画法 |
|------|------|
| 每一格备注（连同表头）接在行尾都不超过 79 列。**只看有备注的行**：没有备注的行后面什么都不写，它的位置再长也不算放不下 | 备注成一栏：skill 的小表里在「位置」后面，MCP 的小表里紧跟「操作」。有备注的小表表头写它，没有的不写 |
| 有一格放不下 | 整个分区的备注全部另起一行，缩进到「位置」的左缘（MCP 的小表没有这一栏，也从同一列起）；表头都不写这一栏。从那里起连最长的一格都放不下时，所有备注一起往左挪到刚好放得下，不让终端来折 |

表头永远只有一行。同一个条目装进几个宿主就有几行，名字只写在第一行。

```ts
// 错：逐行决定——同一张表里有的备注在栏里、有的折到路径下面，折下去的像是路径的续行；
// 表头自己也可能被拆成两行（「备注」独占一行），哪怕一格备注都没有
rows.flatMap((row) => (fits(row) ? [inline(row)] : [start(row), ownLine(row)]));

// 对：先看整个分区放不放得下，再统一决定
const inline = tables.every((table) => notesOf(table).every((note) => startOf(table) + displayWidth(note) <= USABLE));
```

名字和路径都来自目录，长度不由我们定：真实目录里的 `writing-for-agents` 就足以让前四栏占到 78 列。**预览页的样例里要有一条长名字**，不然这种拆行在画面上看不到。工单 08 补上 MCP 的长名字样例时就查出过一处：备注另起一行后仍从「操作」一栏的左缘起，超出了 80 列。

---

## 将执行的命令

执行任何外部命令之前，`ui.commandList(commands)` 把每一条完整地列出来：一个「将执行 N 条命令」分区，每条前面是暗淡的右对齐序号（至少两位宽），之后空一行。它接在汇总的小表后面；这一轮只装本仓库的 skill 时没有命令，也就没有这个分区。接着是 `ui.summaryNotices(notices)` 和 `ui.confirmInstall()`：开始安装、返回修改、取消（`decision`）。

一条命令有两种：`Command`（命令加参数，第三方 Skill 和 MCP 的，不经 shell）和**一个字符串**（工具的安装命令，一整行 shell）。两种列在同一个分区里、接着编号，先后照执行的先后（第三方 Skill 在前，MCP 其次，工具在后）。第三方 Skill 的命令执行时另带的环境变量不写在里面。

| 情况 | 画法 |
|------|------|
| 命令比一行长 | 按词折行，续行与命令的左缘对齐；**从不截断**。一个比一行还长的参数独占一行，由终端自己折 |
| 参数里有 shell 会另作解释的字符（网址里的 `&`、`?`） | 展示时给这个参数加单引号（`commandLine`），照着敲也是同一条命令；执行时不经过 shell，参数原样传 |
| 工具的安装命令（字符串） | **原样写出，不加引号、不改一个字**，不经 `commandLine`：它本来就是给 shell 的一整行，展示的和交给 shell 的是同一个字符串。前面不写工具的名字 |
| 命令里有 key（`KeyArgument`） | 写成 `变量名=<变量名>`，尖括号这一段是黄色粗体，不加引号；真实的值不到呈现层来。`commandLine(command, placeholder)` 的第二个参数给占位符上样式 |
| 要提醒的事 | `ui.summaryNotices(notices)`：命令之后（没有命令时是小表之后）空一行，每件事一行「注意」键值，**几行挨着**，最后空一行；一件都没有时什么都不打。先后是：覆盖即整目录替换（有覆盖项才有）、第三方 Skill 装的是作者当时的最新版（这一轮有第三方 Skill 才有）、「key 以占位符显示，执行时才代入真实的值」（命令里有占位符才有）、装到项目的 MCP 带着的 key 会以明文写进哪个文件（`plaintextKeys`：只有变量名和文件名）、装到项目的 MCP 写进了哪个文件且要在宿主里批准才启用（`approvals`，一个宿主一行）、必填的 key 没填而不安装的 MCP（一个 MCP 一行）、宿主会当场打开浏览器登录（一个宿主一行）。流程只说有哪几件事，句子和先后由呈现层定 |

```ts
// 错：命令交给会截断的栏，用户确认的就不是完整的命令
truncate(commandLine(command), width, symbols.ellipsis);

// 对：只折行
hanging('  ', `${dim(pad(String(index + 1), indexWidth, 'right'))}  `, commandLine(command));
```

---

## 工具：执行分区与结论

工具的勾选、汇总、命令、确认都和别的类型走同一套函数；只有执行不一样，因为它的输出不归呈现层管。它是 `ui.installation(skills, mcps, tools)` 返回的 `tool.begin(target)`：

| 段 | 画法 |
|----|------|
| 一个工具的执行（`tool.begin(target)`） | 以工具名为标题的分区，标题下方空一行，然后是一行暗淡的 `$` 加命令。之后命令自己的输出直接进终端，**不经过呈现层**：顶格、没有样式，呈现层也不知道它有几行 |
| 这个工具的结论（`begin` 返回的函数，收 `ToolResult`） | 上方空一行，然后和结果行同一个画法：`✓ <名字> 已可用<说明>`（「已可用」绿）或 `✗ <名字> 失败 <原因>`（红色粗体），过长时折行。名字一栏和 skill、MCP 的结果行同宽；这一轮有 skill 或 MCP 时名字后面留着宿主一栏的位置，只有工具时没有这一栏 |
| 收尾（`finish()`） | 这一轮的结果不止一行时先打一个「结果」分区，把每一行（skill、MCP、工具）原样再列一遍；然后空一行、通栏横线和「合计」。只有一个工具、没有别的组件时不重复 |

- **没有转动符号，也不回头改写标题**：命令的输出在往同一个终端上写，行首重写和光标上移都会和它撞车。所以这一轮有工具时，前面「正在安装」的标题留着不改写，「结果」是另起的一个分区（见「改写已经打出去的行」）。
- 结论里的话来自 `messages.ts` 的 `toolResult(result, evidence)`：通过时它以分隔的标点开头（`，在 PATH 中找到 uv` / `: uv found on PATH`），直接接在「已可用」后面；没通过时接在「失败」和一个空格后面。
- 结论上方的空行在命令的输出不以换行结尾时只是把那半行收掉，见 [安装工具](./tool-install.md) 的「已知的限制」。

---

## 混合列表与外部项目

进入「推荐」或一个用途之后的那张多选列表是 `ui.mixedPicker({ hosts, skills, thirdParty, mcps, tools, apps, checked, marksRecommended })`：按类型分段、段首有标题、列表下方多一行「类型」。里面有本仓库的 skill、第三方 Skill、MCP、工具、外部项目五段。提问的值是目录里的条目本身（`Skill | ThirdPartySkill | Mcp | Tool | App`）：流程拿勾选的结果去各自的清单里认（`listing.skills.filter((skill) => picked.includes(skill))`），不另包一层带类型的对象。

`hosts` 是所选的宿主，`skills`、`thirdParty`、`mcps` 里每一条的 `statuses` 与它一一对应；**`hosts` 是空的时状态只有一栏**（表头「状态」），skill、第三方 Skill 和 MCP 都不可选——一个宿主都没检测到，或这张列表里根本没有它们（只有工具和外部项目时不问宿主）。工具不看 `hosts`。每一行的状态和不可选的原因（`unavailable`，种类是 `availability.ts` 的 `Unavailable`）都由流程从 `listingStatus` 拿来原样交进来：`ui.mixedPicker({ hosts, ...status, … })`；呈现层自己不从 `statuses` 推断哪一行不可选。`marksRecommended` 说要不要把带推荐的行标出来：用途的列表里标，「推荐」那张列表里每一行都是，不标。

**第三方 Skill 的清单**是 `ui.thirdPartyPicker({ entry, hosts, statuses, checked })`：混合列表确认之后，含多个 skill 的条目各问一次要其中哪几个，提问的值是条目里的 `SourcedSkill`。栏和混合列表一样（名称、每个所选的宿主一栏状态、说明），没有分段，也没有「类型」一行。它和别的多选只差两处，都在这个提问自己的主题里盖掉：按键提示里「确认」后面的括号——交互库传进来的动作名 `submit` 换成 `submitOrSkip` 再交给共用的 `keysHelpTip`（`messages.ts` 的 `keys` 里两个都有：「不选则返回」和「不选则不装这一条」）；一个都不勾时收成的那一行写 `t.notInstalling` 而不是「返回」。**别的多选要改括号里的话照这个做，不要另写一份按键提示**：那一行的宽度是算着写的，英文加没有 Unicode 时一列余量都没有，新写的括号不能比 `none = back` 长。

汇总里第三方 Skill 的小表和 skill 的同一种（带位置）；一行是一个 `ThirdPartyTarget`（要装的一个 skill 在一个宿主下），`entry` 是它所属条目的名字——「将安装 N 项」按它数，不按行数。结果行由 `installation(...).thirdParty` 出：成功只写「已安装」，没有版本号；复核通过而命令没有正常结束时把结果词当作 `verdict`、后面接命令的结局（和工具的结论同一个拼法）。

组件的各段在 `mixedPicker` 里先归成同一种行（`{ value, name, about, recommended, cells, unavailable? }`），再由同一段代码拼：加一种组件就是在 `sections` 里加一段，说清它的各栏状态和什么时候不可选，栏宽、推荐的标记、不可选的拼法、`belowUnavailable` 都不用再写一遍。

| 部分 | 怎么拼 |
|------|--------|
| 表头 | 分隔行，和别的多选列表一样比条目多缩进（勾选框的宽度加一格）。栏是名称、每个所选的宿主一栏状态（一个宿主都没检测到时是一栏「状态」）、说明；一个组件都没有时没有状态栏，只有「名称」「说明」 |
| 栏宽 | 名称一栏按所有条目里最长的名字定；每栏状态按这一栏最长的一格定（表头也算；不可选的行不写状态，不算），不可选的原因更宽时撑宽最后一栏（见「不可选的行」）；剩下的给说明。**组件的说明不足 `MIN_ABOUT`（12 列）时整栏不写**，表头也不写「说明」 |
| skill 的行 | 名称、各栏状态（`statusCell`，和原先 skill 列表的写法一样）、说明。一段里按名字排 |
| MCP 的行 | 名称、各栏状态（`mcpStatusCell`：未配置、已配置、未知、不支持）、说明。排在 skill 一段后面，段与段之间不空行；一段里带推荐的在前、其余按名字（流程排好了交进来） |
| 工具的行 | 名称、**一个状态**（已安装绿、未安装暗淡）、说明。状态写在第一栏状态的位置，后面补到各个状态栏合起来那么宽，说明仍和别的行从同一列起；它算进第一栏的栏宽。排在 MCP 一段后面，一段里带推荐的在前、其余按名字 |
| 不可选的组件行 | 一个宿主都没检测到时每个组件都是，原因「需要 AI Agent」；所选的宿主一个都不支持的 MCP，原因「需要别的 AI Agent」；工具另有两种——这个系统不支持（「不支持 macOS」）、它要的宿主一个都没检测到（「需要别的 AI Agent」）。原因写在状态的位置：照交互库的拼法（「名称 + 一个空格 + 原因」），名称少补一格，`disabled` 是补到状态栏总宽的原因加说明；原因用 `REASON_MARK` 圈着，整行压暗时它保持正常亮度 |
| 推荐的标记 | `marksRecommended` 时，带推荐的行（本仓库的 skill 全是，MCP、工具和外部项目看 `recommended`）在说明的最前面写 `推荐 · `（英文 `pick · `，文案是 `recommendedMark`，分隔用 `symbols.separator`）。标记不截断，截断的是它后面的说明；说明一栏连标记都放不下时整格不写 |
| 段标题 | 也是一行分隔行（不可选，光标跳过它）：同样的缩进，暗淡的两个横线符号，空一格，默认色的标题。横线用 `symbols.rule`，没有 Unicode 时跟着退成 `--` |
| 外部项目的行 | 名称补到栏宽，说明从第一栏状态的位置写起、截断到第 79 列；名字长到说明一列都不剩时不写说明。这一段与上面的组件之间有一行空的分隔行，上面没有组件时没有 |
| 列表下方 | 两行：「类型」和「说明」，各是一次 `belowList(label, format, text, labelWidth)`——第四个参数把两个标签补到一样宽，值的左缘才对齐；说明过长则折行。多出的这一行要告诉 `list(rows, below)`：第二个参数是列表下方除说明之外另外多占的行数，一屏放多少行跟着少一行（见「块与块之间的空行」） |
| 回答后收成的一行 | 勾选的名字；勾了三个以上只列前三个，后面写「等 N 项」，N 是勾选的总数（英文是 `and N more`，那里的 N 是没列出来的个数）；一个都没勾写「返回」。后面那一句是 `messages.ts` 的 `pickedMore(shown, total)`。**一行放不下时由呈现层折行**（`ui.ts` 的 `pickedNames`，混合列表和第三方 Skill 的清单共用）：按名字断，「等 N 项」跟着最后一个名字，续行缩进两格；连第一个名字都放不下时回答整个从下一行起，这时 `style.answer` 在分隔符后面不留空格。交互库把收成的那一行原样打出来，里面带换行也没有问题 |

**列表下方的两行是这样送到交互库手里的**：交互库只把光标所在行的 `description`（一段文字）交给 `theme.style.description`，没有别的口子。所以混合列表的每一行把 `description` 写成两行文字——第一行是类型（`marksRecommended` 时带推荐的后面跟暗淡的分隔和「推荐」），其余是说明全文——再由这个提问自己的 `style.description` 在第一个换行处拆开，画成两行。

```ts
// 错：拿说明全文去反查这一行是什么类型——两个条目的说明可以一字不差
description: (text) => typeLine(kindOf.get(text)) + aboutLine(text)

// 对：类型跟着这一行自己的 description 走，由同一个函数拆
description: `${t.kinds.app}\n${app.description[lang]}`
```

测试架子（预设应答的提问器）不经主题，照原样把这两行记进 `output`：断言说明全文、类型的字都可以直接写；两行画成什么样要用 `keys` 在真实的交互库上看。

### 不可选的行下方的类型和说明

**交互库不把不可选的行的 `description` 交给主题**（`@inquirer/checkbox` 5.x 的 `renderItem`：不可选的行在记下说明之前就返回了），光标停在这种行上时列表下方原本什么都没有。混合列表要它照样显示（维护者 2026-10-10 定的），是 `mixedPicker` 自己的主题补上的，靠的是交互库每画一遍调样式函数的先后：

| 先后 | 交互库调的 | `mixedPicker` 在这里做什么 |
|------|------------|----------------------------|
| 1 | `style.message` | 把「光标所在的不可选行」清掉（`underCursor = undefined`）：每画一遍从头认 |
| 2 | 每个不可选的行一次 `style.disabled(整行)` | 整行以光标符号开头的就是光标所在行：去掉光标、勾选框和一个空格，剩下的「名称 + 一个空格 + 原因」拿去 `belowUnavailable` 里找它的 `description`，记进 `underCursor` |
| 3 | `style.keysHelpTip` | `underCursor` 有值时，把类型和说明两行接在按键提示的**前面**，中间空一行——落在别的行的说明所在的位置 |
| 4 | 有出错的话 `style.error` | 「这一项现在选不了」。它在交互库的行序里排在按键提示之前，所以落在类型和说明的上面；后面跟着它们时去掉自己末尾的换行，三行才挨着 |

- `belowUnavailable` 是一张「交互库拼出来的那一行 → 它的 `description`」的表，拼不可选的行时填。键是整行（名称补齐后的字加原因加说明），不是说明全文——两个条目的说明可以一字不差。
- 组件的各段共用一段拼行的代码，不可选的行都在那里填 `belowUnavailable`（所选宿主都不支持的 MCP 就是这样带上的）。**哪天给混合列表加一种不走这段代码的不可选行，照样要往里填**，不然光标停上去下方是空的，而且不报任何错。
- 这是在配合交互库内部的顺序，不是它承诺的接口：**升级 `@inquirer/checkbox` 之后跑 `spacing.test.ts` 的「光标在不可选的行上」那几条和 `prompts.test.ts` 的「光标停在不可选的 skill 上」**，它们用真实的交互库断言这两行在、且「注意」消失后仍在。预设应答的测试架子看不出这件事：它不管行可不可选都把 `description` 记进 `output`。

```ts
// 错：想在 style.disabled 里直接把说明画出来——它的返回值是列表里的那一行，画不到列表下方
disabled: (text) => `${dimmed(text)}\n${description(found)}`

// 错：在 keysHelpTip 里判断这一遍有没有「注意」——style.error 在它之后才被调到，这时还不知道
keysHelpTip: (keys) => (noticeShown ? … : …)

// 对：画行的时候只记下，到按键提示才画；「注意」自己决定末尾要不要换行
disabled: (text) => { if (text.startsWith(cursor)) underCursor = belowUnavailable.get(…); return base.disabled(text); },
keysHelpTip: (keys) => `${underCursor === undefined ? '' : `${description(underCursor)}\n`}${base.keysHelpTip(keys)}`,
```

勾选的外部项目由 `ui.externalProjects(apps)` 列出：一个分区，标题是「外部项目：N 个，只给链接」；每个一段——缩进两格的粗体名字，「说明」「链接」两行键值——段与段之间空一行。它不以空行收尾，回主菜单时的那一行空行由 `nextRound` 给。

| 情况 | 画法 |
|------|------|
| 说明 | 经 `keyValue`：过长时折行，续行与值的左缘对齐 |
| 链接 | **整条写在一行上，不经 `keyValue` 的折行**，再长也不截断、不折开：超过 80 列时由终端自己折，续行顶格。这是“折行由呈现层做”的例外，和出错说明里的网址同一个理由——折开了就没法照着复制 |

```ts
// 错：链接交给会折行的键值行——现在不被折开，只是碰巧 wrap() 不拆单个词
...keyValue(t.linkKey, paint('underline', app.url)),

// 对：明说它独占一行
`  ${dim(pad(t.linkKey, KEY_WIDTH))}${paint('underline', app.url)}`,
```

**不打开浏览器**，画面上也没有「已在默认浏览器打开」「没能打开浏览器」这两句：链接打开器不再被调用（见 [入口与测试](./installer-entry.md)）。

---

## 标准输出与标准错误

- 出错说明（`ui.failure()`）写到标准错误，其余写到标准输出。
- 没有交互式终端时不打印大标志、不读目录。
- 加载提示用 `\r\x1b[2K` 在同一行上重写，读完后擦掉；它只在已经确认是终端之后才出现。

---

## 网页界面开着时与退回终端界面

用网页界面时终端上多出来的只有这几样，都经呈现层（画法见 [界面设计](./ui-design.md) 的「网页界面开着时」）：

| 方法 | 什么时候 | 打什么 |
|------|----------|--------|
| `ui.webOpened(url)` | 链接打开器兑现之后 | 一个键值行（`t.webUi.key`、`t.webUi.opened`）；网址单独一行，照出错说明里 `location` 的写法——缩进到值的左缘，不截断也不折行；空一行。**按键提示不在里面**：它由待命的提问画 |
| `ui.standby()` | 网页界面开着、没有在安装时一直问着 | 做成待命的提问（见下一节），交给提问器 |
| `ui.webEnded(how)` | 网页界面这边收场：点了「完成」（`finished`）、页面关了（`closed`）、页面关了而这一批的结果没有页面看到（`closedUnseen`）、按了 `t`（`terminal`） | 一个键值行（`t.webUi.key`、`t.webUi.ended[how]`）；`terminal` 的下面空一行（后面是语言提问或主菜单），其余的不空 |
| `ui.installation(…, [], true)` | 安装中页面关了，这一批装完之后（紧跟在 `webEnded('closedUnseen')` 后面） | 「结果」分区：最后一个参数是「这一批已经装完，只把结果补打出来」——标题直接是「结果」，没有转动的那一行，不回头改写标题；结果行和合计仍是 `tally()` 的那一份 |
| `ui.webUnavailable(reason)` | 本机的网页起不来（`server`），或链接打开器拒绝（`browser`） | 一行「注意」（`t.webUi.unavailable[reason]`），下面空一行 |

- 都写到**标准输出**：没有一样是出错。
- `webUnavailable`、`webEnded('terminal')` 以空行收尾，`spaced` 因此是「是」：紧接着的语言提问上方不另空，回答之后收成的那一行与上面那一行之间隔着这一行空行。带了 `--lang` 不问语言时，隔开的是它与主菜单。
- 原因和收场的情形都是一个种类（`WebUnavailable`、`WebEnding`，在 `messages.ts`），写成哪句话照文案；别的模块里不写给用户看的句子。
- 网页界面开着时终端上不重复页面上的内容：一批安装的进度不打在终端上（工具的分区除外，工单 12）。例外只有上面第四行——页面关了，结果没有别处可看。

---

## 待命的提问

网页界面开着时终端在等一个按键（`t` 改用终端界面、Ctrl+C 退出）。它是**提问器的一种提问**，不是另一条读键盘的路（任务 `10-11-installer-web-ui` 工单 11）：

```ts
// cli/src/prompter.ts
export interface StandbyQuestion<Value> {
  hint: [key: string, action: string][];      // 按键提示里的各项，照先后；交给主题的 keysHelpTip 画
  answers: Readonly<Record<string, Value>>;   // 认的按键：按了哪个就回答什么。别的键不理；Ctrl+C 不在这里
  theme: PromptTheme;
}
export interface Prompter {
  /** 待命：只画出一行按键提示，等其中一个键。withdraw 触发时收回：回答是 undefined。无论怎么结束，画出来的那一行都擦掉 */
  standby<Value>(question: StandbyQuestion<Value>, withdraw: AbortSignal): Promise<Value | undefined>;
}
```

| 项 | 约定 |
|----|------|
| 画什么 | 只有一行按键提示：`theme.style.keysHelpTip(question.hint)`——和提问下方的按键提示同一个函数、同一套本地化（动作词在 `t.keys` 里：`terminal`、`quit`）。没有提问标记、没有提问的文字。等按键的时候光标不显示 |
| 结束的三种 | 按了 `answers` 里的键：兑现成那个值；`withdraw` 触发：兑现成 `undefined`；Ctrl+C：和别的提问一样以 `PromptAborted` 拒绝 |
| 结束之后 | **那一行擦掉，不收成一行**（`clearPromptOnDone`）：光标回到它原来所在那一行的行首，后面要说什么由呈现层另打。所以它和隐藏输入一样不碰 `spaced`：它前面的 `webOpened` 以空行收尾，它擦掉之后画面回到那时的样子 |
| 可以被收回 | 网页界面这边结束（点了「完成」、页面关了）、一批安装开始时，调用方触发 `withdraw`，**等它兑现之后再往终端上打东西**——交互库的收尾（擦掉那一行、放开键盘）是在兑现的同一拍里做的，没等就打会被它擦掉 |
| 安装进行中 | 不在：工具的安装命令要接管终端的输入输出（工单 12）。装完再问一次 |
| 别的键 | 不理，也不回显：每次按键都把输入行清掉（`rl.clearLine(0)`） |
| 早先敲的键 | **待命画出来之后的头 100 毫秒里收到的键不算数**（`STALE_KEYS_MS`）。没有提问在听的时候敲的键留在终端那头，下一个提问一画出来就送到——在伪终端里实测晚 0–1 毫秒；不挡的话，一批安装进行中敲的 `t` 会在装完的那一刻把网页界面切到终端界面，页面上的结果就看不到了。人看到提示再按，快不过 100 毫秒。Ctrl+C 不受这一条管：它不经这个按键处理，交互库自己接 |

正式的实现（`inquirer-prompter.ts`）是用交互库的 `createPrompt` 写的一个小提示：`useKeypress` 里认按键，`context` 给 `{ signal: withdraw, clearPromptOnDone: true }`；被收回时交互库以 `AbortPromptError` 拒绝，这里把它变成 `undefined`。**它画的只有主题给的那一行**，没有用交互库自带的任何样式（不调 `makeTheme`、`usePrefix`），所以没有会漏出来的青色；`prompts.test.ts` 的「真实的画面：待命」照样把原始输出查一遍。

`createPrompt` 来自 `@inquirer/core`。它本来就随另外四个 `@inquirer/*` 一起装着（它们都依赖它），工单 11 把它**写进了 `package.json` 的 `dependencies`**（版本范围和那四个包要的一样，`^12.0.4`）：直接引用一个没声明的包，在按包隔离依赖的安装方式下（pnpm）会找不到。用户装下来的包一个都没多。

预设应答的替身（`cli/test/harness.ts`）：把那一行按键提示记进 `output`（行尾不换行），结束时照真实的样子擦掉（`\r\x1b[2K`），所以 `result.screen` 里它不留着；按键由页面的脚本来按（`terminal.press('t')`），见 [入口与测试](./installer-entry.md)。替身没有「头 100 毫秒不算数」这回事：它只认页面的脚本按的键。

已知的限制：

- **没有提问在听的时候敲的字会被终端自己回显**（一批安装进行中）：那时终端不在原始模式。敲的 `t` 不起作用（上表），但那个字留在按键提示重新画出来的那一行行首。和任何命令行程序在忙的时候敲键盘一样，没有处理。
- **从外面给进程发中断信号**（不是在终端上按 Ctrl+C）而这时待命正问着：`bin.ts` 随即退出，交互库来不及把它藏起来的光标放回来。在终端上按的 Ctrl+C 不走这条路——待命问着时终端在原始模式，它是交互库自己接的，收尾是完整的。

```ts
// 错：收回了待命紧接着就往终端上打。交互库擦掉那一行是在它了结的那一拍里做的，这一行会被它擦掉
standing.withdraw.abort();
ui.webEnded('finished');

// 对：等它了结
standing.withdraw.abort();
await standing.settled;
ui.webEnded('finished');
```

---

## 块与块之间的空行

空行由呈现层统一给，画面该空在哪见 [界面设计](./ui-design.md) 的「块与块之间的空行」。一条总的约束是**任何地方都不出现连着两行空行**，所以每一处“上方空一行”都先看一个状态 `spaced`——画面的最后一行是不是空行（画面还是空的也算）：

| 谁 | 对 `spaced` 做什么 |
|----|--------------------|
| `print(...lines)` | 记成“最后一行是不是空行”。两个输出流合起来算：标题区走标准输出，出错说明走标准错误 |
| 留在屏幕上的提问（单选、多选、是否题）——主题由 `asking()` 给 | 读它决定提问上方空不空，然后记成否：**提问是交互库直接写到终端上的，不经过 `print`**，做成提问就当它已经问出去、收成了一行 |
| 隐藏输入（`keyQuestion`） | 不碰：回答之后提问整个擦掉，画面回到问之前的样子。它前面的 key 说明以空行收尾，后面的结局行由 `print` 记 |
| `createUi` 的 `continued` | 起始值：缺省画面是空的（是）；`continued: true` 是接在别的输出后面（否） |

用它的三个帮手：

| 帮手 | 给什么 | 用在 |
|------|--------|------|
| `gapAbove()` | 要拼进 `print` 的行：上面不是空行时是一行空行，否则没有 | 本机信息、混合列表上方关于 MCP 那几栏的「注意」（`mcpColumnNotices`：只能装到全局、读不到配置，两行在同一次 `print` 里所以挨着） |
| `heading(title, format?)` | 一个分区的开头：`gapAbove()`、标题、一行空行 | 每一个分区。出错说明用 `errors.heading`；帮助的三个分区在同一次 `print` 里，空行是直接写的 |
| `gap()` | 上面不是空行时当场打一行空行 | 回到上一轮（`nextRound`）；转动的加载提示之前（`loading`）——那一行擦掉之后，接着打的本机信息或分区就落在它的位置上，空行得先给，不然读完的一刻画面会往下跳一行 |

`heading` 和 `gapAbove` 在拼参数时就读了状态，所以只能放在一次 `print` 的最前面；同一次 `print` 里后面的分区自己写空行。

**提问上下的两行空行都在主题里，不在列表里，也不由 `print` 打：**

| 空行 | 放在哪 | 为什么 |
|------|--------|--------|
| 提问上方（上面是已回答的提问时） | `theme.prefix.idle` 以换行开头 | 只在还在问的时候占着，回答之后连同提问一起收成一行：连着的几行已回答的提问之间才不空。先 `print('')` 的话这一行就留在两行已回答的提问中间了 |
| 提问与列表之间（单选、多选） | `theme.style.message(text, status)`：`status` 不是 `done` 时末尾接一个换行（`list()` 给的） | 它跟着提问、不属于列表，列表滚动时不随条目滚走，也不占列表的行。是否题和隐藏输入的主题不接这个换行 |
| 说明全文、「这一项现在选不了」与按键提示之间 | `theme.style.description`、`error` 末尾接一个换行（`belowList`） | 交互库把这几段用换行连起来，中间没有别的口子。是否题的 `error` 是同一个函数：它下面没有东西，多出的那一行空行看不出来 |

```ts
// 错：把空白的分隔行放在列表的第一行。它是列表的一行：光标过了半屏就和表头一起滚上去，
// 提问直接贴着条目；还白占列表一行
rows: [{ separator: ' ' }, { separator: header }, ...entries]

// 对：接在提问的末尾
message: (text, status) => `${bold(text)}${status === 'done' ? '' : '\n'}`
```

列表一屏放多少行（`pageSize(below)`）是终端的行数减 8：提问上下的两行空行、提问、列表下方的空行、两行说明、说明下方的空行、按键提示；表头算在列表里，最少 7 行。列表下方另外多占的行再减掉（`below`）：混合列表多一行「类型」，减的是 9。画面比屏幕高的话，交互库每次重画都会把顶上的一行留在回滚区里——所以宁可列表少放两行。

入口在语言提问回答之后重建呈现层（界面语言在一次运行的中途才定），新建的那个缺省会以为画面还是空的。所以重建时给 `continued: true`，说明它是接在别的输出后面的——画面上已经有标题区和语言提问收成的一行，且不是以空行收尾。

```ts
// 错：换语言时直接新建。它的 spaced 从「是」开始，选完语言后立刻出错的话，出错的标题就贴在语言那一行下面
ui = createUi({ out, err, lang, env, platform });

// 对
ui = createUi({ out, err, lang, env, platform, continued: true });
```

```ts
// 错：只看 print 打出的最后一行。提问是交互库直接写到终端上的，不经过 print：
// 汇总以空行收尾，后面是「开始安装吗」，回答之后才是「正在安装」分区——照这个判断它上方就不空了
print(...summary, '');                       // spaced = 是
await prompter.select({ ...question, theme }); // 画面上多了一行已回答的提问，spaced 却没变

// 对：留在屏幕上的提问一律经 asking() 拿主题，它把 spaced 记成否
return { message, ...list(rows) };           // 单选、多选
return { message, default: false, answers, theme: asking() }; // 是否题
```

> **Warning**：`asking()` 在**做成提问的那一刻**就记了账，所以做成的提问要当场问出去，一个提问只问一次。先做好几个提问再挨个问，后面几个的空行就都是按第一个做成时的画面算的。

`cli/test/spacing.test.ts` 守着这一节：四条规则各一组，「任何地方都没有连着两行空行」一组把每类流程的每一步画面都看一遍。`startup.test.ts` 的「带 --lang 启动后立刻出错：标题区与出错说明之间只隔一行」和 `prompts.test.ts` 的「选完语言后立刻出错：收成的那一行与出错说明之间空一行」也在守。这些都要用真实的交互库：收成的那一行、提问上下的空行是交互库写的。

---

## 改写已经打出去的行

转动符号所在的那一行用 `\r\x1b[2K` 重写（`ui.ts` 的 `spin`：加载提示、安装进行中的那一项都用它）。这一轮的执行共用一个 `progress(targets, asides)`：`targets` 是进「正在安装」分区的行（skill、MCP），照先后排；`asides` 是输出不归呈现层管、各占一个分区的那些（工具）的名字。名字一栏按两样合起来定宽，宿主一栏按 `targets` 定宽（一行都没有时没有这一栏）。`targets` 的每一项 `begin(target, doing)` 时给出进行中那一行写的字（skill 是「正在下载」，MCP 是「正在配置」）；`asides` 的每一项 `aside(name, intro)` 另起一个以名字为标题的分区，`intro` 是标题下面先打的行。对外是一个 `ui.installation(skills, mcps, tools)`，返回 `{ skill: { begin, skip }, mcp: { begin, skip }, tool: { begin }, finish }`：各类组件只负责把各自的结果说成文字，行数、改写标题、要不要再列一遍都在 `progress` 里。再加一类组件时照此接上，不要另写一遍，也不要另开一个「正在安装」分区——那样标题就要改写两处。

**结果行和合计是再下面一层的 `tally()`**：`succeeded(lead, text)`、`failed(lead, reason)`、`skipped(lead, reason)` 各返回一项的结果行（`lead` 给结果符号排好位置；原因过长时自己折行）并记进合计，`total()` 返回一行空行、通栏横线和「合计」那一行。一轮只有一份，skill、MCP、工具的行都记在它里面，**不要再抄一遍失败行的拼法和合计**。

这一轮没有工具时，「正在安装」分区结束后要把标题换成「结果」，标题在上面好几行，只能把光标挪上去再挪回来。**这一轮有工具时不改写**：工具的输出已经接着往下写了，呈现层不知道它占了几行；这时 `finish()` 另起一个「结果」分区，把记下的每一行原样再打一遍。挪之前先确认两件事，否则会写到别的行上：

```ts
// 标题还在屏幕上、且没有哪一行被终端折开
const up = lines + 1;
if (up < (out.rows ?? 24) && (out.columns ?? WIDTH) >= WIDTH) {
  out.write(`\x1b[${up}A${ERASE_LINE}${section(t.results)}\x1b[${up}B\r`);
}
```

- `lines` 是标题之后**终端上实际占的行数**，从 1 起算——标题下方的那一行空行也在里面，漏了它标题就改写到上面一行去了。一项的失败原因折成两行就算两行；一行里有个比一行还长的词（目录给的变量名、名字很长时剩下的地方放不下）折不开，会被终端自己折开，所以每一行按 `ceil(显示宽度 / 终端列数)` 算，不是数条目，也不是数呈现层打了几行。
- 跳过的原因和失败的原因一样经 `hanging` 自己折行：原因里可以有目录给的名字，长度不由我们定。
- 条件不满足时不改写，标题留作「正在安装」。
- 除了这两处，不回头改已经打出去的东西。

> **Warning**：测试架子的 `result.screen` 只懂 `\r\x1b[2K`，不懂光标上移。改写过标题的输出里，`output` 和 `screen` 都同时有「正在安装」和「结果」两个标题的文字；断言结果时匹配 `── 结果 ─`，不要断言「正在安装」不存在。真实的样子看界面预览页。这一轮有工具时两个标题是真的都在画面上：「正在安装」留着没改写，「结果」是后面另起的分区，要断言再列一遍的那几行就取最后一个 `── 结果 ─` 之后的部分（`mixed.test.ts` 的 `recap`）。

---

## 宽度

按 80 列设计，正文每行最多 79 列（通栏横线、分区标题线到第 80 列）。对齐、截断、折行都按显示宽度算（汉字和全角标点两列），用 `cli/src/text.ts` 的 `displayWidth`、`pad`、`truncate`、`wrap`，不用 `String.length` 和 `padEnd`。

```ts
// 错：汉字按一列算，栏会错位
name.padEnd(20);

// 对
pad(name, 20);
```

栏宽按内容定（这一栏最长的一格加三格间隔），不写死。间隔只有 `ui.ts` 里 `GUTTER` 这一处定义，各张表都用它，不各写各的数。画横线之类按“总宽减去内容宽”算重复次数的地方要夹住下限：目录是远程数据，名字可以长到让差值为负，`'─'.repeat(-1)` 会抛错。

---

## 界面预览页

```bash
cd cli && npm run preview   # 生成 cli/.preview/index.html
```

`cli/scripts/preview.ts` 经 `runInstaller` 按场景表驱动安装器：提问由真实的交互库渲染，按键是脚本发的，输出喂给无头终端（`@xterm/headless`），再把字符格连同样式转成 HTML，每个画面一格，深色和浅色终端各一份。它是视觉评审对照 [界面设计](./ui-design.md) 时用的画面证据；什么时候生成、拿它核对什么，见那份文档的「界面预览页」。下面是场景怎么写。

- 加了或改了画面，就在 `scenes` 里加一个场景（标题、说明、参数、环境、目录来源、可执行路径上的命令、主目录里事先有的文件和符号链接、按键）。要画出 skill 的各种状态，用 `MIXED`（已装、版本不同、手动放的目录、符号链接都有）。场景缺省只有 `claude` 一个命令，也就是只检测到一个宿主；两个宿主的场景给 `onPath: BOTH_HOSTS`，按键前面多一次回车确认宿主（`twoHosts(keys)`）。
- 一个画面有“默认”和“按了某个键之后”两种状态时，各做一个场景；英文、不显示颜色、没有 Unicode 的变体拍默认状态。例外是「光标停在不可选的行上」：它要按了键才看得到，变体也各拍一个。出错和帮助同样要有英文的变体。
- **场景缺省替用户在语言提问上按回车**（`cli/test/terminal.ts` 的假键盘做的：等语言提问画出来再按，接受光标起始所在的那一项），`keys` 里不用写它。场景的系统语言是中文，所以缺省得到中文界面，标题区下面留着 `✓ Language / 语言 · 中文`。要拍语言提问本身，给 `answersLanguage: true`，这时它由 `keys` 来按：不给 `keys` 就停在提问上。带 `--lang` 的场景不问语言。语言提问的场景有五个：系统语言是中文、不是中文（它就是英文的变体：按键提示是英文）、选了与系统语言不同的一项、不显示颜色、没有 Unicode。
- **场景的环境里缺省没有 `COLORTERM`**，大标志走的是洋红那一档；要看渐变给 `env: TRUECOLOR`。标题区的三档各有一个场景（「标题区 · 渐变」「标题区 · 洋红（没有 COLORTERM）」「标题区 · 不显示颜色」——最后一个同时给了 `COLORTERM`，画的是 `NO_COLOR` 压过它）。测试架子同样缺省没有 `COLORTERM`。
- 单元格的前景色有两种读法（`readCells`）：命名色记编号，转成类名 `c0`–`c7`，色值跟着深色、浅色两套配色变；24 位色记成 `#rrggbb` 直接写进 `style`，两边是同一个值。只认调色板色的话，渐变的标志在预览页上是默认前景色，看上去和不显示颜色一样而不报任何错。
- 画面取的是无头终端的**整个缓冲区**（`readCells` 读到 `buffer.length`），不是屏幕上那 `ROWS` 行：汇总加结果再回到主菜单的场景会超过一屏，只读前 `ROWS` 行会把底下的截掉而不报任何错（工单 12 之前有四个画面就是这样少了末尾几行）。
- 要看矮终端里屏幕上还剩什么，场景给 `rows`（如 `rows: 24`）：终端、提问器和安装器拿到的都是这个行数，画面**只取还在屏幕上的那几行**（从 `buffer.baseY` 读起）。「skill 多选列表 · 24 行的终端」用的是 `manySkills`（二十条样例）。
- 要画出外部项目，场景用 `catalog: withApps`：它另带一份用途清单 `SHOWCASE_PURPOSES`（照仓库里真实的那十个），十条样例外部项目分在其中四个用途下——主菜单才看得出按用途排开、空用途不出现的样子。样例里有一条名字最长的、一条链接比一行长的、几条说明比一行长的。主菜单上第一行是「推荐」（`toRecommended` 直接回车进去），各个用途排在它后面：进「文档处理」用 `toDocuments`。要画出 skill 和外部项目混在一张列表里，场景用 `catalog: withMixed`：在 `withApps` 之上给四个 skill 写了用途（三个在「文档处理」下）、给 `mineru` 标了推荐；进「文档处理」用 `toMixedDocuments(asksHosts)`（检测到两个宿主时传 `true`，替用户在宿主选择上回车），`pickMixed` 勾两个 skill 和两个外部项目，`installMixed` 一路装完。要 skill、MCP、外部项目三种类型同表，场景用 `...THREE_KINDS`（`withThreeKinds`：在 `withMixed` 之上「文档处理」下多三个 MCP——`markitdown` 带推荐标记、`excel` 只支持 Claude Code、`mistral-ocr` 的 key 必填；主目录里 skill 的四种状态照 `MIXED`，Claude Code 里 `excel` 已配置）：`pickSkillAndMcps` 勾一个 skill 和两个 MCP，`pickThreeKinds` 再勾一个外部项目，`toThreeKindsSummary` 填好 key 停在汇总上。要四种类型同表，场景用 `...FOUR_KINDS`（`withFourKinds`：再往「文档处理」下加三个工具——`docling` 带推荐标记、安装命令里有引号，`officecli` 只支持 Linux，`pandoc` 在场景里已经装着；检测到两个宿主，缺省的假命令把 `docling` 装上）：`pickFourKinds` 四种类型各勾一个，`toFourKindsSummary` 停在汇总上（这四个都不要 key），再回车就装完。只检测到一个宿主或一个都没有时自己给 `onPath`——要 `pandoc` 显示已安装就把它也放进去。预览页从不真的打开浏览器：走终端界面的场景里链接打开器不会被调用（网页界面的场景见下面 `web` 那一条）。
- 要画出没有「推荐」的主菜单，场景用 `catalog: withoutRecommended`（`index.json` 里没有 skill，外部项目照 `withApps`）；要画出某个宿主不支持的第三方 Skill，用 `...FIVE_KINDS, catalog: withHostLimitedThirdParty`（`guizang-ppt-skill` 写了 `hosts: ['claude-code']`，主目录和可执行路径照 `FIVE_KINDS`）。
- 要画出只有工具的列表，场景用 `...TOOLS`（`withTools`：五条为预览编的样例——两种检查方式都有，一条另给了 Windows 的命令，一条只支持 Linux，一条只给 Codex 用；主目录里 `bun` 已经装着）。它们都在「开发工作流与规范」下，主菜单上紧跟在「推荐」后面，`toTools` 下移一行进去；**段里按名字排**（bubblewrap、bun、codex-usage、openspec、uv），光标起始在不可选的 `bubblewrap` 上，按键照这个先后数：`pickTools` 勾 openspec 和 uv，`pickUv` 只勾 uv。命令是假的：场景的 `shell: (command) => ShellRun` 说它往终端上打什么（`output`）、怎么结束（`exitCode`、`cannotStart`、`hangs`）、装没装上（`installs` 往可执行路径里放一个命令，`creates` 在主目录下写出一个路径），缺省是 `installsTool`（uv 装好，别的以非零状态结束）。名字和命令都长的样例在 `withLongCommandTool`。预览页从不真的执行命令。
- 要画出带 key 的 MCP，场景用 `...KEYED`（`withKeyedMcps`：在那四条之外，`context7` 有一个可选的 key，多一条 key 必填的 `exa`）；`toExaKey` 停在必填 key 的提问上，`toTwoKeys` 停在可选的那个上，`PASTED_KEY` 是假装粘贴的值。**生成之后在 `cli/.preview/index.html` 里搜这个值，应当一处都没有。**
- 要画出 MCP，场景用 `catalog: withMcps`（四条为预览编的样例，两种连接方式都有，其中一条只支持 Codex）；`MCP_STATES` 是只有 Claude Code、其中两条已配置，`MCP_TWO_HOSTS` 是两个宿主、Codex 的配置读不了；名字长的样例在 `withLongNameMcp`。两个宿主时按键用 `mcpTwoHosts(keys)`（这四条样例都在「联网搜索与文档检索」下，主菜单上它紧跟在「推荐」后面，`toMcps` 下移一行进去；`twoHosts` 是给「推荐」用的）。外部命令是假的：缺省都成功，`commands` 给一个假的执行器让某条失败或一直跑不完。预览页从不真的执行命令。
- 场景里的下载是假的：`downloads({ fails, hangs })` 让某个 skill 失败或一直下不完，`queryFails(failure)` 让查询以某种出错失败。每个场景有自己的临时主目录，结束时一并删掉；预览页不碰真实的主目录和网络。
- 生成物不提交（`cli/.gitignore`），也不随 npm 包发布（`package.json` 的 `files` 只有 `dist`）。
- **场景缺省也替用户在安装范围的提问上按回车**（全局），`keys` 里不用写它：加这一问之前写的按键序列照旧成立。要拍这一问或装到项目的画面，给 `answersScope: true`（`...PROJECT` 带着它，另在项目目录里放了几样东西），这时它由 `keys` 来按：`toScope` 停在提问上，`intoProject` 下移到「项目」再回车进列表，`pickIntoProject`、`toProjectSummary` 接着勾选到汇总。`...PROJECT` 的项目目录里还有一份配过 `markitdown` 的 `.mcp.json`（全局配过的是 `excel`），MCP 的状态按范围读才看得出来；`toProjectMcpSummary` 勾上 `markitdown` 和带 key 的 `mistral-ocr` 停在汇总上（明文和批准的两行提醒），`intoProjectCodexOnly` 在宿主选择上去掉 Claude Code 再进项目范围的列表（MCP 不可选）。场景的项目目录是临时主目录下的 `work/my-app`（画面上是 `~/work/my-app`），事先有什么用 `project: { 相对路径: 内容 }` 给；假的 skills CLI 照真的来——带 `--global` 的装到主目录下，不带的装到它的运行目录下。
- **要画出网页界面开着时终端上的那个块、网页界面结束时的那一行，或退回终端界面的那一行原因**，场景给 `web`：`'opens'` 是浏览器打开了，画面停在那个块上（按键提示是待命的提问画的，`keys` 里给 `t` 就是改用终端界面）；`'finished'` 是页面连上之后点了「完成」，`'closed'` 是页面连上之后关了，`'closed-installing'` 是页面勾了两个 skill、确认安装之后关了——这三种由脚本拿着网址扮演页面（`cli/test/browser.ts` 的 `openPage`），安装器自己退出；`'no-browser'` 是链接打开器拒绝，`'no-server'` 是页面的静态文件读不到，这两种退回终端界面（语言提问照旧由假键盘代答，要停在它上面就给 `answersLanguage: true`）。给了 `web` 的场景自己带上临时开关 `OXY_TOOLS_WEB`；预览页开头把页面打一遍（`buildWeb()`），本机的网页是真的起来的，但**预览页从不真的打开浏览器**——链接打开器只是兑现或拒绝。网址每次运行都不同（端口是系统挑的，口令是随机的），画面上一律换成 `SAMPLE_WEB_URL`，两次生成才逐字节相同。`'opens'` 的场景收场时按 Ctrl+C（落在待命的提问上）并触发 `interrupt`（正在装的时候没有提问在问，靠它把本机的网页关掉）；`keys` 里的 `t` 要等待命画出来 100 毫秒之后才按（见「待命的提问」的「早先敲的键」），脚本自己等。扮演页面的三种里安装器是自己退出的：脚本等它退出才读画面，5 秒还没退出就报错停下；预览里页面断开之后的时限是 100 毫秒（`PAGE_GRACE_MS`）。没给 `web` 的场景不带临时开关，走的是终端界面，链接打开器不会被调用。
- **两份预览都用得上的样例在 `cli/scripts/preview-samples.ts`**（工单 `10-11-installer-web-ui` 的 05 分出去的）：样例条目（`SHOWCASE_SKILLS`、`SHOWCASE_PURPOSES`、`SHOWCASE_APPS`、`MIXED_CATALOG`，「文档处理」下的 `DOCUMENT_MCPS`、`DOCUMENT_TOOLS`、`DOCUMENT_THIRD_PARTY`，`LONG_NAME_MCP`，写一个带 key 的环境变量的 `keyed`）；拼目录来源的 `catalogOf` 与 `downloads`；这台机器事先的样子（`BOTH_HOSTS`，两个宿主的 skill 目录 `CLAUDE_SKILLS`、`CODEX_SKILLS`，`installedSkill`，四种状态都有的 `MIXED`，配过 excel 的 `EXCEL_CONFIGURED`，装过两条第三方 Skill 的 `THIRD_PARTY_INSTALLED`）；场景里「这台机器」那几个字段的类型 `World`，和照它布置出临时的可执行路径、主目录、项目目录的 `stageWorld`。只有终端界面的预览用的（`with*` 那些拼好的目录、按键序列、假的命令）留在 `preview.ts`。网页界面的预览要用哪一样，就把它搬过去，不抄一份。
- 预览页和测试架子共用 `cli/test/terminal.ts` 的假键盘，连同它替用户应答语言提问和安装范围提问的做法：假键盘等那一问最后一个选项的名字画出来才按回车。
