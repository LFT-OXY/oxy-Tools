# oxy-Tools

维护者策展的 AI 工具链目录，以及把目录中的组件装进宿主（Claude Code、Codex）的安装器。

## 这个仓库的两个用途

**目录**——维护者策展的全部条目：

| 在哪 | 是什么 |
|------|--------|
| `skills/` | 各个 skill 的内容，一个 skill 一个目录 |
| `index.json` | skill 清单，本仓库 skill 的唯一登记处 |
| `catalog.json` | 其余条目：MCP、工具，以及安装器装不了、只给链接的应用项目 |

**安装器**——`cli/` 下发布到 npm 的 `oxy-tools`。它每次运行时从本仓库现拉目录，把选中的 skill、MCP、工具装进宿主；应用项目只展示说明并打开官方链接。目录不编译进 npm 包，所以增删条目只需要提交本仓库。

## 运行安装器

```bash
npx oxy-tools
```

需要 Node.js 22.13 及以上的 22.x 或 23.5 及以上、一个交互式终端，以及已经装好的 Claude Code 或 Codex。参数、环境变量和它具体做什么，见 [`cli/README.md`](./cli/README.md)。

## 许可证

仓库根没有统一的许可证，按目录分别归属：

| 目录 | 许可证 |
|------|--------|
| `cli/` | MIT，见 [`cli/LICENSE`](./cli/LICENSE) |
| `skills/archify/` | MIT，见该目录的 `LICENSE` |
| `skills/onetake/` | PolyForm Noncommercial 1.0.0（仅限非商业使用），见该目录的 `LICENSE` |
| `skills/shuorenhua/` | MIT，见该目录的 `LICENSE` |
| `skills/unlazy/` | MIT，见该目录的 `LICENSE` |
| 其余 skill 目录 | 没有附带许可证文件 |

## 参与维护

约定写在 `.atw/spec/`：skill 怎么写、两个目录文件的字段契约、安装器这一层怎么改。术语以 [`GLOSSARY.md`](./GLOSSARY.md) 为准。
