# 终端输出

> 呈现层 `cli/src/ui.ts` 的职责和它做判断的规则。画面该长什么样（颜色与符号的含义、各画面的版式）目前记在任务目录的 `ui-direction.md`，任务归档时整理进本层。

---

## 只有呈现层往终端上写

`createUi()` 返回的对象是唯一的输出出口。其余模块只说“显示什么”：`flow.ts` 调 `ui.skillDetail(skill)`、`ui.mainMenu(groups)`，不拼样式码、不算栏宽、不决定空行。

```ts
// 错：流程里自己拼
stdout.write(`\x1b[1m${skill.name}\x1b[22m\n`);

// 对：交给呈现层
ui.skillDetail(skill);
```

提问也一样：呈现层把提问做成 `SelectQuestion`（已排好栏的每一行、光标起始位置、主题），提问器只负责问。**主题要把交互库用到的样式函数全部盖掉**（前缀、光标、提问、回答、活动行、说明、按键提示），原因见下一节。

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

不支持时，`ui.ts` 里的 `ASCII` 符号表整体替换 `UNICODE`（两张表同一个类型，加符号时两边都要加），按键提示里交互库写死传进来的 `↑↓`、`⏎` 换成 `messages.ts` 的 `keyNames`。交互库传进来的是英文单词的按键（多选的 `space`），任何终端里都换成 `keyWords` 里的字。

ASCII 的符号宽度可以和 Unicode 的不同（勾选框 `■` 一列，`[x]` 三列）。**凡是按符号宽度对齐的地方都用 `displayWidth(symbols.x)` 算**，不写死列数：多选列表的表头缩进就是「勾选框的宽度 + 1」。

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

- 加了或改了画面，就在 `scenes` 里加一个场景（标题、说明、参数、环境、目录来源、可执行路径上的命令、按键）。
- 场景里的下载是假的：`downloads({ fails, hangs })` 让某个 skill 失败或一直下不完，`queryFails(failure)` 让查询以某种出错失败。每个场景有自己的临时主目录，结束时一并删掉；预览页不碰真实的主目录和网络。
- 生成物不提交（`cli/.gitignore`），也不随 npm 包发布（`package.json` 的 `files` 只有 `dist`）。
- 预览页和测试架子共用 `cli/test/terminal.ts` 的假键盘。
