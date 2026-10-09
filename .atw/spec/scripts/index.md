# Scripts 层开发规范

> 适用范围：非上游 skill 里随 skill 分发的脚本和 HTML 资产。

---

## Overview

这一层目前只覆盖两个 skill 里的 6 个文件：

| 文件 | 是什么 |
|------|--------|
| `skills/oxy-learning-hub/scripts/validate_html.py` | agent 生成 HTML 后运行的校验脚本 |
| `skills/wizard/template.sh` | 被复制出去再填写的 bash 向导模板 |
| `skills/oxy-learning-hub/assets/lesson-template.html` | 课程页模板 |
| `skills/oxy-learning-hub/assets/summary-template.html` | 总结页模板（单文件） |
| `skills/oxy-learning-hub/assets/course.css` | 课程共享样式 |
| `skills/oxy-learning-hub/assets/course.js` | 课程共享交互 |

**样本很小：Python 脚本只有一个，bash 脚本只有一个。** 这一层的文档是对这几个文件的描述，分三种，各处都标明了属于哪种：

- **被代码强制的契约**——改错了会坏（占位符正则、校验器的检查项、`course.js` 依赖的选择器、脚本的输出与退出码）；
- **文件自己写明的约定**——出自文件头注释或所属 `SKILL.md`；
- **这个文件现在的写法**——只有一个实例，新脚本可以参照，但不是经过多处验证的仓库惯例。

上游整包里的脚本不归这一层管，见 [上游整包](../skills/vendored-skills.md)。

这些文件的运行环境是**用户的机器**和**用户的浏览器**：脚本由安装了 skill 的 agent 调用，资产被复制进用户的项目。所以这里没有服务、路由、数据库、日志系统，也没有构建步骤。

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [随附脚本](./bundled-scripts.md) | 两个脚本的运行时与依赖、命令行形态、输出与退出码、失败时的行为 |
| [HTML 资产](./html-assets.md) | 模板占位符、校验器的检查项、主题 token、模板与 `course.js` 之间的 DOM 约定 |

---

## Pre-Development Checklist

- [ ] 写或改 Python / bash 脚本 → [随附脚本](./bundled-scripts.md)
- [ ] 改模板、`course.css`、`course.js`，或给模板加占位符 → [HTML 资产](./html-assets.md)
- [ ] 任何改动 → [清单与版本](../skills/manifest-versioning.md)
- [ ] 改了脚本的参数或输出 → 搜引用它的 `SKILL.md` / `references/*.md`，命令和失败处理的描述是按现有输出写的

---

## Quality Check

- [ ] `python3 skills/oxy-learning-hub/scripts/validate_html.py --self-test` 输出 `自检通过`
- [ ] `bash -n skills/wizard/template.sh` 无输出、退出码 0
- [ ] 改了 `assets/` → 做了 [HTML 资产](./html-assets.md) “验证”一节的步骤
