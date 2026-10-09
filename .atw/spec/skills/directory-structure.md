# 目录结构

> 仓库布局与 skill 目录的组织方式。

---

## 仓库布局

```
/
├── index.json          # 可选 skill 清单
├── catalog.json        # 目录里 skill 以外的条目：MCP、工具、应用项目
├── README.md           # 仓库的两个用途、怎么运行安装器、许可证按目录的归属
├── cli/                # 安装器 oxy-tools，自成一体的 npm 包，见 CLI 层规范
├── .github/workflows/  # cli.yml：安装器的测试与目录校验，只管 cli/ 和两个目录文件
├── skills/
│   └── <name>/         # 一个 skill 一个目录，入口固定为 SKILL.md
├── docs/agents/        # ATW 用的 issue tracker / 分诊标签 / 域文档约定
├── AGENTS.md           # ATW 托管块 + Agent skills 段
└── .atw/ .claude/ .agents/ .pi/   # atw init 生成的工作流配置与已安装的 skill 副本
```

仓库根没有 `package.json`、构建脚本，也没有统一的许可证文件：许可证按目录分别归属（`cli/` 是 MIT，上游整包沿用各自的 `LICENSE`），根 `README.md` 里有一张表，增删带 `LICENSE` 的目录时跟着改。CI 只有 `.github/workflows/cli.yml` 一个工作流，不碰 `skills/`。每个 skill 自带它需要的一切；安装器的包描述文件、依赖和构建都关在 `cli/` 里（[CLI 层规范](../cli/index.md)）。

---

## Skill 目录的四种形态

新 skill 选能装下内容的最小形态，不预留空目录。

| 形态 | 构成 | 现有例子 |
|------|------|----------|
| 单文件 | 只有 `SKILL.md` | `skills/explanation/`、`skills/if5/`、`skills/show-me/` |
| 单文件 + 同级附件 | `SKILL.md` + 一两个同级文件，可带 `agents/openai.yaml` | `skills/retro/`（只多 `agents/`）、`skills/writing-for-agents/`（`SKILL-MECHANICS.md`）、`skills/pr/`（`CREDITS.md`）、`skills/wizard/`（`template.sh`） |
| 分目录 | `SKILL.md` + `references/` + `assets/` + `scripts/` | `skills/oxy-learning-hub/` |
| 上游整包 | 上游自己的布局，带 `LICENSE` | `skills/archify/`、`skills/onetake/`、`skills/unlazy/`，见 [上游整包](./vendored-skills.md) |

分目录形态的职责划分（`skills/oxy-learning-hub/`）：

```
skills/oxy-learning-hub/
├── SKILL.md                # 路由：定模式、摄取材料、分派到分支
├── references/
│   ├── summary-mode.md     # 一个分支一个文件，只在该分支被读取
│   ├── teaching-mode.md
│   ├── publishing.md
│   ├── workspace.md
│   └── teaching/
│       └── *-FORMAT.md     # 各状态文件的格式说明，按需读取
├── assets/                 # 被复制或填充到用户项目的模板与共享资源
└── scripts/                # skill 正文要求 agent 运行的工具
```

- `references/` 放**只有部分分支会读**的文档；每个分支都要用的内容留在 `SKILL.md`。
- `assets/` 放**会进入用户产物**的文件；`scripts/` 放**agent 运行**的工具。
- 附件只有一两个时直接放在 `SKILL.md` 同级，不为它建子目录。

---

## 命名

- **skill 目录名**：小写 kebab-case。它同时是 skill 的 `name`，三处必须一致，见 [清单与版本](./manifest-versioning.md)。
- **不加统一前缀**：通用工具直接用功能名（`if5`、`show-me`、`wizard`）。早先的 `oxyteam-*` 前缀随那批 skill 一起在提交 `c2230a1` 移除；现存带前缀的只有 `oxy-learning-hub`。
- **入口文件**：固定 `SKILL.md`。
- **同级的 Markdown 附件、格式说明**：大写 KEBAB（`SKILL-MECHANICS.md`、`CREDITS.md`、`references/teaching/MISSION-FORMAT.md`）。
- **流程分支文档**：小写 kebab-case（`references/summary-mode.md`）。
- **脚本与模板**：跟随语言习惯和所在 skill 的现有写法（`validate_html.py`、`template.sh`、`lesson-template.html`）。
- **平台元数据**：固定路径 `agents/openai.yaml`。

---

## 边界

1. **skill 内部的链接只指向自己目录里的文件。** 非上游 skill 里没有任何 `](../` 形式的跨目录链接。`index.json` 让每个 skill 可以单独安装，跨出去的链接装完就断。
2. **用到另一个 skill 时按名字引用，不按路径**（`skills/retro/SKILL.md`：`Call the Skill tool with writing-for-agents`）。对方可能没装，取舍见 [Skill 编写](./skill-authoring.md) 的“跨 skill 依赖”。
3. **运行时产物写到用户的项目目录，不写回 skill 安装目录**（`skills/oxy-learning-hub/references/workspace.md`：“不要在技能安装目录里保存用户课程”）。
