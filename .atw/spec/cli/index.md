# CLI 层开发规范

> 适用范围：`cli/` 下的安装器 `oxy-tools`（TypeScript，发布到 npm），以及它读取的仓库根 `catalog.json`。

---

## Overview

`cli/` 是一个自成一体的 npm 包：交互式安装器，从目录里挑选条目装进宿主。为什么放在本仓库、要守哪三条规矩，见 [ADR-0001](../../../docs/adr/0001-installer-lives-in-skill-repo.md)；目录为什么运行时现拉，见 [ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)。

本层目前只写了已经落地的部分（启动、读目录、主菜单、把 skill 装进 Claude Code、出错、目录校验命令与 CI）。第二个宿主、状态探测、MCP、工具、应用项目和界面设计规则的完整版随对应的功能补进来。

```
cli/
├── package.json          # 包描述文件只在这里，仓库根不放
├── src/
│   ├── bin.ts            # 把真实依赖接到入口上，别的什么都不做
│   ├── installer.ts      # 入口 runInstaller，也是测试的主接缝
│   ├── catalog.ts        # 目录：来源（含把 skill 的文件取下来）、读取、校验
│   ├── hosts.ts          # 宿主适配：在不在、skill 装到哪个目录
│   ├── install-skill.ts  # 安装 skill：只认“条目 + 目标目录”
│   ├── flow.ts           # 交互流程：问什么、显示什么
│   ├── ui.ts             # 呈现层：一切终端输出的样式
│   ├── messages.ts       # 中英文案
│   ├── prompter.ts       # 提问器的接口
│   ├── inquirer-prompter.ts  # 提问器的正式实现（@inquirer）
│   └── text.ts           # 显示宽度、截断、折行
├── test/                 # 只经入口断言的测试，和测试架子
└── scripts/              # 仅供开发的脚本，不进 dist/，不随 npm 包发布
    ├── preview.ts            # 界面预览页
    └── validate-catalog.ts   # 目录校验命令
```

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [入口与测试](./installer-entry.md) | `runInstaller` 的签名与可替换依赖、退出状态、目录读取与校验的契约、测试架子的用法 |
| [安装 skill](./skill-install.md) | 宿主探测、钉住来源与按提交下载、临时目录与整体替换、安装标记、出错矩阵 |
| [终端输出](./terminal-output.md) | 呈现层的职责、上色与 Unicode 的判断、标准输出与标准错误的分工、改写已打出的行、界面预览页 |
| [目录校验与 CI](./catalog-validation.md) | 目录校验命令的输出与退出状态、被跳过条目的原因怎么记、命令的测试怎么写、工作流的触发与检出范围 |

---

## Pre-Development Checklist

- [ ] 要加或改任何行为 → [入口与测试](./installer-entry.md)：先在 `cli/test/` 写经入口的测试
- [ ] 要往终端上打任何东西 → [终端输出](./terminal-output.md)：只能经呈现层
- [ ] 要动下载、落盘、宿主探测，或加一种装不上的原因 → [安装 skill](./skill-install.md)
- [ ] 要读 `cli/` 以外的文件、或在仓库根加包描述文件 → 不行，见 ADR-0001
- [ ] 要改 `index.json` 或 `catalog.json` 的格式 → 先读 ADR-0002 和 [清单与版本](../skills/manifest-versioning.md)
- [ ] 要给目录加一类条目、一个字段或一条校验规则，或动 CI → [目录校验与 CI](./catalog-validation.md)：写坏的条目带着原因进 `skipped`

---

## Quality Check

都在 `cli/` 下运行：

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | 类型检查（`src`、`test`、`scripts`），无输出即通过 |
| `npm test` | 全部测试（vitest），只扫 `cli/test/` |
| `npm run build` | 构建到 `dist/`（不提交） |
| `npm run preview` | 生成界面预览页 `cli/.preview/index.html`（不提交）；改了任何画面都要生成并看一遍 |
| `OXY_TOOLS_CATALOG=<仓库根> npm start` | 构建后在本机启动，读本地的目录数据 |
| `npm run validate-catalog -- ..` | 用安装器自己的校验逻辑检查仓库根的 `index.json` 和 `catalog.json`；改了这两个文件或校验规则都要跑 |

推送后 CI（`.github/workflows/cli.yml`）在 macOS、Linux、Windows 上各用 Node 22.13 和 24 跑全部测试，另跑类型检查和目录校验。

包声明支持 Node 22.13 及以上的 22.x 或 23.5 及以上。行为与 Node 版本有关的改动（样式码、流）要在 22.13 上再跑一遍测试。
