# HTML 资产

> `skills/oxy-learning-hub/assets/` 下的模板、样式和脚本之间的约定。

这些文件不在本仓库里渲染：agent 读取模板、填好占位符，把结果写进用户项目的 `atlas-*/` 目录，`course.css` 和 `course.js` 被复制到该目录的 `assets/`（`references/workspace.md`；`references/teaching-mode.md` “复用是默认策略”一段）。改这里的文件，影响的是之后生成的所有页面。

---

## 文件与职责

| 文件 | 样式和脚本从哪来 | 用于 |
|------|------------------|------|
| `lesson-template.html` | 外链 `{{ASSET_PREFIX}}course.css` 和 `course.js` | 教学模式的每节课，同一工作区的课程共用一份资产 |
| `summary-template.html` | 全部内联在 `<style>` 和 `<script>` 里 | 总结模式的 `SUMMARY.html`，单文件可独立打开 |
| `course.css` | — | 课程共享样式与主题 token |
| `course.js` | — | 课程共享交互：主题切换、完成状态、目录、阅读进度、选择题、开放题复制 |

---

## 占位符（被代码强制）

模板里待填的位置写成 `{{大写字母和下划线}}`：

| 模板 | 占位符 | 怎么填写在哪 |
|------|--------|--------------|
| `lesson-template.html` | `{{TITLE}}`、`{{ASSET_PREFIX}}`、`{{CRUMB}}`、`{{KICKER}}`、`{{SUBTITLE}}`、`{{FACTS}}`、`{{CONTENT}}`、`{{NAVIGATION}}`、`{{CONTINUE}}`、`{{ASIDE}}` | `references/teaching-mode.md` |
| `summary-template.html` | `{{TITLE}}`、`{{META}}`、`{{TOC}}`、`{{CONTENT}}` | `references/publishing.md` 的 “HTML” 一节 |

`validate_html.py` 用这条正则找没填的占位符：

```python
PLACEHOLDER = re.compile(r"\{\{[A-Z_]+\}\}")
```

- 带数字、小写字母或连字符的写法（`{{STEP_1}}`、`{{title}}`）不匹配这条正则，漏填时校验器发现不了。新占位符只用大写字母和下划线，并在上表右列的文档里写明怎么填。
- 模板注释里的占位符同样会被匹配。`lesson-template.html` 的 HTML 注释里出现了 `{{CONTENT}}`、`{{ASIDE}}`，生成课程时这些注释要一并替换或删除。
- 模板本身通不过校验，这是预期的：对 `lesson-template.html` 运行校验器会报“仍有未替换的模板占位符”和两条“本地资源不存在”。

---

## 校验器的检查项（被代码强制）

生成的每个 HTML 都要通过 `scripts/validate_html.py`。它检查的内容，也就是模板必须保证的结构：

| 检查 | 报错文字 |
|------|----------|
| 没有残留占位符 | `仍有未替换的模板占位符` |
| 同一标签内属性不重复 | `<tag> 含重复属性 <name>` |
| `<html>` 有非空 `lang` | `html 根元素缺少非空 lang 属性` |
| `<head>` 里有 `name="viewport"` 且 `content` 非空 | `head 中缺少 viewport 元数据` |
| `<head>` 里有非空 `<title>` | `head 中缺少非空 title` |
| `script[src]`、`link[href]`、`img`/`source` 的 `src`/`srcset`、`video` 的 `src`/`poster`、`audio[src]` 指向的本地文件存在 | `本地资源不存在：<值>` |
| `a[href]` 指向的本地文件存在 | `本地链接目标不存在：<值>` |
| 指向 HTML 的本地链接带锚点时，目标文件里有这个 `id` | `本地链接锚点不存在：<值>` |

**远程资源不受限制，这是有意的。** 带 URI scheme 或以 `//` 开头的引用一律不检查；自检的正例里专门放了 Google Fonts 外链、`fetch()` 和 `location.replace()`，断言它们不会被拒绝。`SKILL.md` 也写明课程“可以按教学和视觉需要使用远程字体、CSS、图片、视频、JavaScript 库或网络 API”。给校验器加“禁止外链”一类的检查会让自检失败。

---

## 主题与设计 token（文件自己写明的约定）

一套 DOM，两套 token。`course.css` 文件头：

> 除下面两个 token 块外，任何地方都不再出现主题相关的写死颜色；换配色只改 `:root` 与 `:root[data-theme="dark"]`。

- 主题由 `<html data-theme="light|dark">` 决定。
- 颜色用 `oklch()` 定义成 CSS 变量，放在 `:root, :root[data-theme="light"]` 和 `:root[data-theme="dark"]` 两个块里；派生色用 `color-mix(in oklch, ...)`。
- 其余规则引用变量。`course.css` 里没有十六进制或 `rgb()` 颜色；token 块之外唯一的写死颜色是 `@media print` 里的 `body { background: white; }`，它与主题无关。

颜色角色（两个主题都定义了同名变量）：

| 变量 | 角色 |
|------|------|
| `--bg` / `--surface` / `--raised` | 页面底、卡片面、抬起的面 |
| `--fg` / `--muted` / `--border` | 正文、次要文字、描边 |
| `--accent` / `--accent-hover` / `--on-accent` | 强调色、悬停态、强调色上的文字 |
| `--good` / `--good-bg` / `--on-good` | 正确反馈 |
| `--bad` / `--bad-bg` / `--on-bad` | 错误反馈 |
| `--code-bg` / `--code-fg` / `--code-cmt` | 代码块 |

两个主题不只是换色：浅色的标题字体是系统无衬线（`--font-display: system-ui, ...`，字重 660），深色换成等宽（`ui-monospace, ...`，字重 600）。正文字体 `--font-body` 以 `"PingFang SC"` 开头，等宽 `--font-mono` 以 `ui-monospace` 开头，两个主题共用。圆角两档：`--r: 8px`、`--r-lg: 12px`。

### 首帧主题

两份模板的 `<head>` 里都有一段内联脚本，排在样式之前：

```html
<script>
  // 必须内联且前置：先定主题再渲染，避免首帧闪白/闪黑
  (() => {
    const saved = localStorage.getItem("oxy-theme");
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = saved || sys;
  })();
</script>
```

`course.js` 是 `defer` 加载的，它执行时首帧已经画完，所以这段留在模板里；`course.js` 的文件注释写明它“只负责按钮状态与后续切换”。

### 已知的重复

`summary-template.html` 为了单文件可用，自带了一份样式和脚本，与课程那套是两份代码：

- **token**：内联了一份。和 `course.css` 同名的变量在两个主题下取值都一致；圆角的变量名不同（总结模板用 `--radius` / `--radius-lg`，`course.css` 用 `--r` / `--r-lg`）。
- **脚本**：文件末尾内联了主题切换、目录高亮和阅读进度，逻辑与 `course.js` 的对应部分相同，写法略有出入（例如不做元素是否存在的判断）。

改配色、改主题切换行为或改 `oxy-theme` 这个键时，两处都要改。这是现状；合并它们是另一件事。

---

## 模板与 course.js 的 DOM 约定（被代码强制）

`course.js` 文件头列出了它依赖的选择器。模板或课程正文里少了哪个，对应功能就不工作，且不报错：

| 选择器 | 功能 | 由谁提供 |
|--------|------|----------|
| `#theme-toggle`、`#theme-label` | 主题切换按钮 | `lesson-template.html` |
| `#lesson-status`、`#complete-lesson` | 完成状态 | `lesson-template.html` |
| `#progress-line`、`#read-fill`、`#read-label` | 阅读进度 | `lesson-template.html` |
| `#toc-list` | 目录容器 | `lesson-template.html` |
| `main section[id]` 下的 `h2`，其中 `.n` 是编号 | 目录条目的来源 | 课程正文 |
| `[data-quiz]` 内的 `.quiz-option[data-correct][data-explanation]`、`.quiz-feedback` | 选择题 | 课程正文 |
| `.copy-response[data-target]`，值为文本框的 `id` | 开放题复制 | 课程正文 |

- 目录是自动生成的：`course.js` 扫描 `main section[id]` 取其 `h2`。正文小节要写成 `<section id="s-xxx"><h2><span class="n">01</span>小标题</h2>…</section>`，否则不进目录。
- 改 id 或 class 是三处联动：模板、`course.js`、`references/teaching-mode.md` 里的示例片段。
- `localStorage` 的键是既有数据的地址：主题用 `oxy-theme`，完成状态用 `` `oxy-learning:${location.pathname}:${document.title}` ``。改键名，用户已有课程的主题选择和完成标记就读不到了。

`course.js` 现在的写法：

- 整个文件是一个 IIFE，不依赖任何库，不往全局挂东西。
- 每个功能先取元素，取不到就跳过（`if (!toggle) return;`、`if (tocList) { ... }`）。
- 主题、完成状态、阅读进度各有一个 `render*` 函数（`renderTheme`、`renderCompletion`、`renderProgress`），事件处理里改完状态调它；选择题和开放题复制是在事件处理里直接改 DOM。
- 界面文案是中文，直接写在脚本里。

---

## 代码风格（现状）

没有 formatter 配置：

- `course.css`、`course.js` 用 tab 缩进；两份 HTML 模板用 2 个空格。
- 分节注释用中文加横线：`/* ── 主题切换 ──────── */`；文件头是一个说明用途和约定的注释框。
- `lesson-template.html` 的主要区块带 `data-od-id`（`topbar`、`toc`、`lesson`、`section-nav`、`continue-chat`、`finish`、`aside-notes`）。仓库里没有代码读取这个属性，用途没有记录。
- 无障碍相关的现有做法：图标 `svg` 带 `aria-hidden="true"`，主题按钮的 `aria-label` 随状态更新，完成状态区域带 `aria-live="polite"`，`<meta name="color-scheme" content="light dark">`。

---

## 验证

`skills/oxy-learning-hub/SKILL.md` 规定的是对**生成物**的校验；对 `assets/` 本身的改动，仓库里没有既定的验证流程。能用现有工具做到的：

1. `python3 skills/oxy-learning-hub/scripts/validate_html.py --self-test`，确认校验器本身没坏。
2. 在仓库外的临时目录里按 `references/teaching-mode.md` 填一份课程（或按 `references/publishing.md` 填一份总结），把 `course.css`、`course.js` 复制到它引用的位置，对生成的文件运行校验器，要求输出 `通过`。
3. 在浏览器里打开，浅色和深色各看一遍，点一遍受改动影响的交互。校验器只查结构和本地引用，查不出样式和交互问题；这一步没有自动化手段。
