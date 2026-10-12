# 05 — 收尾：说明文档、版本号、整体核对、走查清单

**What to build:** 读说明文档的人看得到安装器支持四个宿主，知道 Pi 和 omp 的 skill 装进共用 skill 目录、omp 的 MCP 不装。版本号升到 0.5.0。对照 `prd.md` 的验收标准逐条核对并留下记录。维护者拿到一份在虚拟机里用真实的 Pi 和 omp 走查的清单，和发布到 npm 要执行的命令——真机走查和发布由维护者做，这一张不做。

**Blocked by:** 02, 04, 06, 07, 08
**Status:** ready-for-agent
**Impl:** done

- [x] `README.md` 和 `cli/README.md`（中英两段）：支持的宿主、需要事先装好哪一个、各宿主 skill 装到哪、MCP 能装到哪些范围（Codex 只能全局，Pi 全局和项目，omp 不装）。
- [x] `.atw/spec/cli/` 下的规范与实现一致：通读前面各张工单（01–04、06–08）改过的各节，过时的示例照界面预览页重取。
- [x] `GLOSSARY.md`、ADR-0005 与实现一致；有出入就改实现或回到 specify，不悄悄改文档去迁就。
- [x] `cli/` 的版本号是 0.5.0（包描述文件和锁文件一致）。
- [x] 全部测试在三种环境下通过：本机当前的 Node；Node 22.13（`npx -y node@22.13 …`）；`TMPDIR=/tmp`。类型检查、构建、目录校验命令通过。
- [x] 两份预览（`npm run preview`、`npm run preview:web`）各生成一遍，整体看过：四个宿主的各格与规范一致，只选 Claude Code 的各格与改动前一样。
- [x] 逐条核对 `prd.md` 的「Acceptance Criteria」，结论记在 `research/final-check-record.md`；没有核对的和没有达到的单独列出。
- [x] 写出 `research/vm-walkthrough-checklist.md`：`prd.md`「Further Notes」第 7 条的每一项各是一步，写明在虚拟机里敲什么、应当看到什么、看到别的说明什么。
- [x] 把发布要执行的命令交给维护者；不执行发布。
