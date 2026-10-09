# Skills 层开发规范

> 适用范围：`skills/<name>/` 下的 skill 正文（`SKILL.md` 及其引用文档）、`agents/openai.yaml`，以及仓库根的两个目录文件 `index.json`、`catalog.json` 的格式。

---

## Overview

本仓库是**目录加安装器**（术语见仓库根 `GLOSSARY.md`）：

- **目录**是维护者策展的全部条目：`skills/` 下的各个 skill 和登记它们的 skill 清单 `index.json`，加上登记 MCP、工具、应用项目的 `catalog.json`。
- **安装器**是 `cli/` 下发布到 npm 的 `oxy-tools`：每次运行时从本仓库现拉目录，把组件装进宿主（Claude Code、Codex）；应用项目只给链接。

`index.json` 另有一个读者：A Team Workflow（`atw init` 的额外 skill 安装、`atw update` 的版本检查）。本仓库对它有三条承诺，见 [清单与版本](./manifest-versioning.md)。

没有后端服务、前端应用或数据库，所以没有 backend / frontend 层；spec 分三层：

| 层 | 管什么 |
|----|--------|
| `skills/`（本层） | skill 的目录形态、`SKILL.md` 写法、两个目录文件的字段契约与版本、上游整包、校验与提交约定 |
| [`scripts/`](../scripts/index.md) | 随 skill 分发的脚本和 HTML 资产 |
| [`cli/`](../cli/index.md) | 安装器：入口与测试、三类组件怎么装、终端输出与界面设计、目录校验命令与 CI |

安装器的代码与 skill 互不引用：`cli/` 自成一体，只通过目录来源读数据（[ADR-0001](../../../docs/adr/0001-installer-lives-in-skill-repo.md)）；它的构建产物和依赖目录不提交。

**源在 `skills/`，别处的同名目录是安装副本。** `.claude/skills/` 和 `.agents/skills/` 里除了 `atw init` 装的 `atw-*`，还有本仓库部分 skill 的副本（装了哪些记在 `.atw/.optional-skills.json`），目前与 `skills/` 下的源逐文件一致。改 skill 只改 `skills/<name>/`，不手改副本。`atw-*` skill 不是本仓库的产物，不受本层约束，也不登记进 `index.json`。

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [目录结构](./directory-structure.md) | 仓库布局、skill 目录的四种形态、命名、边界 |
| [Skill 编写](./skill-authoring.md) | `SKILL.md` frontmatter、触发方式、正文结构、`agents/openai.yaml` |
| [清单与版本](./manifest-versioning.md) | `index.json` 与 `catalog.json` 的字段契约、skill 的版本号规则、格式版本号的兼容规则、对 A Team Workflow 的三条承诺、校验命令 |
| [上游整包](./vendored-skills.md) | 带上游许可证整包引入的 skill 怎么对待 |
| [质量约定](./quality-guidelines.md) | 现有的校验命令、提交信息约定 |

---

## Pre-Development Checklist

动手前按改动类型读对应文档：

- [ ] 新增、删除、重命名 skill，或改了某个 skill 的任何文件 → [清单与版本](./manifest-versioning.md)
- [ ] 往 `catalog.json` 加条目，或要动两个目录文件的格式、位置、仓库的默认分支 → [清单与版本](./manifest-versioning.md) 的「`catalog.json` 的字段契约」「格式版本号」「对 A Team Workflow 的承诺」
- [ ] 新建 skill 目录、加附件或引用文档 → [目录结构](./directory-structure.md)
- [ ] 写或改 `SKILL.md`、引用文档、`agents/openai.yaml` → [Skill 编写](./skill-authoring.md)；写法本身以 `skills/writing-for-agents/SKILL.md` 为准
- [ ] 要动的目录里有 `LICENSE` → 先读 [上游整包](./vendored-skills.md)
- [ ] 动脚本、模板、CSS/JS → 再读 [`scripts/` 层](../scripts/index.md)

---

## Quality Check

- [ ] [清单与版本](./manifest-versioning.md) 的校验脚本通过，且该文档“版本规则”一节的要求已满足
- [ ] [目录结构](./directory-structure.md) “边界”一节的三条都没有破
- [ ] 跑了 [质量约定](./quality-guidelines.md) 表中与本次改动对应的命令
