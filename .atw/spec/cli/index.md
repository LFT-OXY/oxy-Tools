# CLI 层开发规范

> 适用范围：`cli/` 下的安装器 `oxy-tools`（TypeScript，发布到 npm），以及它读取的仓库根 `catalog.json`。

---

## Overview

`cli/` 是一个自成一体的 npm 包：交互式安装器，从目录里挑选条目装进宿主。为什么放在本仓库、要守哪三条规矩，见 [ADR-0001](../../../docs/adr/0001-installer-lives-in-skill-repo.md)；目录为什么运行时现拉，见 [ADR-0002](../../../docs/adr/0002-catalog-fetched-at-runtime.md)。

本层目前只写了已经落地的部分（启动、读目录、主菜单、浏览 skill、出错）。安装、宿主适配、界面设计规则的完整版随对应的功能补进来。

```
cli/
├── package.json          # 包描述文件只在这里，仓库根不放
├── src/
│   ├── bin.ts            # 把真实依赖接到入口上，别的什么都不做
│   ├── installer.ts      # 入口 runInstaller，也是测试的主接缝
│   ├── catalog.ts        # 目录：来源、读取、校验
│   ├── flow.ts           # 交互流程：问什么、显示什么
│   ├── ui.ts             # 呈现层：一切终端输出的样式
│   ├── messages.ts       # 中英文案
│   ├── prompter.ts       # 提问器的接口
│   ├── inquirer-prompter.ts  # 提问器的正式实现（@inquirer）
│   └── text.ts           # 显示宽度、截断、折行
├── test/                 # 只经入口断言的测试，和测试架子
└── scripts/preview.ts    # 界面预览页（仅供开发）
```

---

## Guidelines Index

| 文档 | 内容 |
|------|------|
| [入口与测试](./installer-entry.md) | `runInstaller` 的签名与可替换依赖、退出状态、目录读取与校验的契约、测试架子的用法 |
| [终端输出](./terminal-output.md) | 呈现层的职责、上色与 Unicode 的判断、标准输出与标准错误的分工、界面预览页 |

---

## Pre-Development Checklist

- [ ] 要加或改任何行为 → [入口与测试](./installer-entry.md)：先在 `cli/test/` 写经入口的测试
- [ ] 要往终端上打任何东西 → [终端输出](./terminal-output.md)：只能经呈现层
- [ ] 要读 `cli/` 以外的文件、或在仓库根加包描述文件 → 不行，见 ADR-0001
- [ ] 要改 `index.json` 或 `catalog.json` 的格式 → 先读 ADR-0002 和 [清单与版本](../skills/manifest-versioning.md)

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

包声明支持 Node 22.13 及以上的 22.x 或 23.5 及以上。行为与 Node 版本有关的改动（样式码、流）要在 22.13 上再跑一遍测试。
