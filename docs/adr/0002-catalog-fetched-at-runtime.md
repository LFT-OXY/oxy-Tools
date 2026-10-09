# 目录运行时从本仓库拉取，不编译进 npm 包

目录的全部数据（skill 清单 `index.json` 和登记其余条目的文件）放在本仓库，安装器每次运行时从 GitHub 现拉。这样增删条目只需要提交本仓库，不用为此发一个 npm 版本；`index.json` 本来就在这里，而且 A Team Workflow 已经在读它。

**Status**: accepted

**Considered Options**: 把目录编译进 npm 包。好处是离线可用、安装器版本和目录永远匹配；被否决是因为每改一个条目都要发版，而安装本身就需要联网。

**Consequences**:

- 目录的网址和格式是对外承诺：已经发出去的每一版安装器都记着这个网址，搬地方或改格式会让旧版本失效。
- 新格式一推上 `main`，用户手里的旧版安装器立刻就会读到，所以目录必须带格式版本号，安装器遇到不认识的版本要提示升级，而不是按旧格式硬读。
- `index.json` 另有 A Team Workflow 这个读者，它依赖：`main` 分支根目录的 `index.json` 及每条的 `name`、`version`、`path`、`description` 四个字段；`path` 下有 `SKILL.md`；整个仓库可以打包下载。改动这三样之前必须先看 A Team Workflow。
