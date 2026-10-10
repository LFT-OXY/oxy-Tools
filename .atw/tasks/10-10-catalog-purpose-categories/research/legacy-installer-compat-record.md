# 已发布的 0.2.0 读最终的目录（工单 14）

> 2026-10-11，macOS。核对的是「旧版会忽略不认识的字段和键」这句推断：全部条目录完之后，拿 npm 上的 `oxy-tools@0.2.0`（`npm view oxy-tools version` 是 0.2.0，`latest` 也是它）实际读一遍仓库里的 `index.json` 和 `catalog.json`。只看画面，不装东西。

## 做法

照 `.atw/spec/skills/manifest-versioning.md`「改了格式就拿已发布的旧版实际读一遍」：

1. `mktemp -d` 出一个临时目录，在里面 `npm init -y`、`npm install oxy-tools@0.2.0`。
2. 伪终端（Python 的 `pty`，80 列 50 行）里起 `node node_modules/oxy-tools/dist/bin.js --lang zh`。环境里 `HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 都指到临时目录下（脚本开头断言），`OXY_TOOLS_CATALOG` 指到仓库根。
3. 按脚本发按键，每按一个键留一份原始输出，交给 `@xterm/headless` 还原成屏幕上的文字。每次跑完发 Ctrl+C 退出，没有确认过任何安装。

本机的可执行路径上有 `claude` 和 `codex`，所以它检测到两个宿主；状态读的是临时目录，所以每一条都是未装、未配置。

## 看到的

启动之后（没有按键）：

```
  AI Agent  Claude Code ✓   Codex ✓
  目录      12 skill · 11 MCP · 64 应用项目
────────────────────────────────────────────────────────────────────────────────

? 选择分组

  分组       数量   说明
▸ Skill        12   装进 AI Agent 的能力包
  MCP          11   写进 AI Agent 配置的 MCP 服务器
  应用项目     64   需要自行部署，这里只给链接

  退出

   ↑↓ 移动 · ⏎ 选择
```

- 「目录」一行的数量与 `index.json`（12 个 skill）、`catalog.json` 的 `mcps`（11）、`apps`（64）一致。
- 没有「目录中有 N 个条目格式有误，已跳过」那一行：新加的 `purpose` 字段没有让任何一条被它跳过。
- 主菜单是它原来的分组。**只有三行，不是四行**：`tools` 是空数组，0.2.0 对没有条目的分组本来就不显示（它自己的行为，和新格式无关）。
- `purposes`、`skillPurposes`、`thirdPartySkills` 三个顶层的键它不认识：23 个第三方 Skill 在 0.2.0 里看不到，也不报错。

三个分组各进去看了一遍：

| 按键 | 画面 |
|------|------|
| 回车（Skill）→ 回车（两个宿主都选） | 「选择要安装的 skill」，12 行，archify 到 writing-for-agents，两栏状态都是「未装」 |
| 下、回车（MCP）→ 回车 | 「选择要安装的 MCP」，11 行，acemcp 到 word-document-server，两栏都是「未配置」；列表下方是光标所在那一条的说明全文 |
| 下、下、回车（应用项目） | 「选择应用项目」，从 spec-kit 起逐条列出，50 行的终端里一屏放不下、照常滚动 |

三次的退出状态是 0 或 130（在提问上按 Ctrl+C），没有出错的画面。

## 结论

0.2.0 读最终的目录照常工作，显示它原来的分组，不报错。两个目录文件的格式版本号都仍是 1。

## 没有核对的

- 没有用 0.2.0 实际装任何东西（规格只要求照常显示）。
- 读的是本地目录（`OXY_TOOLS_CATALOG`）；它缺省从 GitHub 的 `main` 分支读，要等这些提交推上去之后才是同一份数据，那条路没有另外跑。
- 只在 macOS 上跑过。
