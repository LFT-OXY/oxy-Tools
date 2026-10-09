# Skills 层开发规范

> 适用范围：`skills/<name>/` 下的 skill 正文（`SKILL.md` 及其引用文档）、`agents/openai.yaml`，以及仓库根的 `index.json`。

---

## Overview

本仓库是一个 **agent skill 分发仓库**：产物是 `skills/` 下的各个 skill 和登记它们的 `index.json`。没有后端服务、前端应用、数据库或构建产物，所以没有 backend / frontend 层，只有两个 spec 层：

| 层 | 管什么 |
|----|--------|
| `skills/`（本层） | skill 的目录形态、`SKILL.md` 写法、`index.json` 清单与版本、上游整包、校验与提交约定 |
| [`scripts/`](../scripts/index.md) | 随 skill 分发的脚本和 HTML 资产 |

**源在 `skills/`，别处的同名目录是安装副本。** `.claude/skills/` 和 `.agents/skills/` 里除了 `atw init` 装的 `atw-*`，还有本仓库部分 skill 的副本（装了哪些记在 `.atw/.optional-skills.json`），目前与 `skills/` 下的源逐文件一致。改 skill 只改 `skills/<name>/`，不手改副本。`atw-*` skill 不是本仓库的产物，不受本层约束，也不登记进 `index.json`。

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [目录结构](./directory-structure.md) | 仓库布局、skill 目录的四种形态、命名、边界 |
| [Skill 编写](./skill-authoring.md) | `SKILL.md` frontmatter、触发方式、正文结构、`agents/openai.yaml` |
| [清单与版本](./manifest-versioning.md) | `index.json` 的字段契约、版本号规则、校验命令 |
| [上游整包](./vendored-skills.md) | 带上游许可证整包引入的 skill 怎么对待 |
| [质量约定](./quality-guidelines.md) | 现有的校验命令、提交信息约定 |

---

## Pre-Development Checklist

动手前按改动类型读对应文档：

- [ ] 新增、删除、重命名 skill，或改了某个 skill 的任何文件 → [清单与版本](./manifest-versioning.md)
- [ ] 新建 skill 目录、加附件或引用文档 → [目录结构](./directory-structure.md)
- [ ] 写或改 `SKILL.md`、引用文档、`agents/openai.yaml` → [Skill 编写](./skill-authoring.md)；写法本身以 `skills/writing-for-agents/SKILL.md` 为准
- [ ] 要动的目录里有 `LICENSE` → 先读 [上游整包](./vendored-skills.md)
- [ ] 动脚本、模板、CSS/JS → 再读 [`scripts/` 层](../scripts/index.md)

---

## Quality Check

- [ ] [清单与版本](./manifest-versioning.md) 的校验脚本通过，且该文档“版本规则”一节的要求已满足
- [ ] [目录结构](./directory-structure.md) “边界”一节的三条都没有破
- [ ] 跑了 [质量约定](./quality-guidelines.md) 表中与本次改动对应的命令
