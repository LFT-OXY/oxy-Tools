# Journal - autuhae (Part 1)

> AI development session journal
> Started: 2026-10-09

---



## Session 1: 按仓库真实形态填写项目 spec（bootstrap）
<!-- atw-session: v=2 fp=ba5c10ff64d382c1 -->

**Date**: 2026-10-09
**Task**: 按仓库真实形态填写项目 spec（bootstrap）
**Branch**: `main`

### Summary

仓库是 agent skill 分发仓库而非 fullstack 项目，将 .atw/spec 的 backend/frontend 空模板替换为 skills 与 scripts 两层，内容只记录可在仓库中查证的现状；00-bootstrap-guidelines 已归档。

### Main Changes

- 新增 .atw/spec/skills/：目录结构、Skill 编写、清单与版本（index.json 契约）、上游整包、质量约定
- 新增 .atw/spec/scripts/：随附脚本（validate_html.py、wizard/template.sh）、HTML 资产（占位符、校验器检查项、主题 token、DOM 约定）
- 移除 .atw/spec/backend/、.atw/spec/frontend/ 共 14 个不适用的空模板，prd.md 与 task.json 同步为新结构

### Git Commits

| Hash | Message |
|------|---------|
| `dda9dc5` | docs(atw): 按仓库真实形态填写项目 spec，替换 backend/frontend 模板 |

### Testing

- [OK] spec 内相对链接 0 断链、引用的仓库路径全部存在、无模板占位符残留
- [OK] 清单校验脚本原样运行 exit=0；validate_html.py --self-test 通过；bash -n skills/wizard/template.sh 通过
- [OK] Standards / Spec 两个维度评审各一轮，发现的事实错误与重复已修并重跑上述校验，未做第二轮评审

### Status

[OK] **Completed**

### Next Steps

- 约定不带版本号的 skill 升哪一段，并确认 atw update 如何比较版本，补进 skills/manifest-versioning.md
- 决定上游整包（archify / onetake / unlazy）是否允许本地补丁及升级方式，补进 skills/vendored-skills.md
- 补记其余 skill 的来源；处理 skills/pr/CREDITS.md 中关于 show-me 的过时说法
- 判断 .atw/spec/guides/ 的跨层思考指南是否需要按本仓库调整


## Session 2: oxy-tools 发布前验收、发布 0.1.0 与任务归档
<!-- atw-session: v=2 fp=6f97a6670ba383be -->

**Date**: 2026-10-10
**Task**: oxy-tools 发布前验收、发布 0.1.0 与任务归档
**Branch**: `main`

### Summary

完成工单 12（发布前验收）：把界面预览页的全部画面对照选定的视觉方向核了一遍并统一两处，在隔离环境和真实终端里走通主要流程，推送后 CI 三个系统全过；维护者发布了 oxy-tools@0.1.0，在自己的虚拟机里照 40 条清单实测通过；任务 10-09-oxy-tools-installer 已归档。

### Main Changes

- 英文界面的分组名 Skill 改成 Skills；光标停在不可选的行上时 ▸ 也加粗
- 界面预览页改读整个终端缓冲区（此前四个画面底部被截掉），补三个场景，现为 138 个画面
- .atw/spec/cli 同步上述画法，补上对照时发现的规范缺口，记下真实终端里看到的两条弱点；CLI 层总览新增「发布前在本机核对」
- 按维护者的决定，没有改动本机真实宿主的用户级 skill 目录与 MCP 配置：代理只在隔离环境里验，真机部分由维护者自验（skill 在本机，其余在虚拟机）

### Git Commits

| Hash | Message |
|------|---------|
| `62fd98c` | fix(cli): 发布前统一画面——英文分组名、不可选行上的光标、预览页截断 |
| `bde855a` | docs(task): 工单 12 的验收记录 |
| `c06b979` | docs(task): 工单 12 记下维护者的真机结论 |
| `abf4403` | docs(task): 关闭工单 12，任务转入验收 |
| `48ac524` | docs(task): 记下发布与虚拟机实测的结论 |

### Testing

- [OK] [OK] npm run typecheck；npm test 12 个文件 461 条，Node 24.15 与 22.13 各一遍
- [OK] [OK] CI 运行 37959093637：macOS、Linux、Windows 各 Node 22.13.0 与 24 的测试，加类型检查与目录校验，七个作业全部成功
- [OK] [OK] npm 包 22 个文件；无交互式终端、目录格式版本过高、断网三种出错各有说明并以状态 1 退出
- [OK] [OK] 隔离环境（临时主目录与临时宿主配置目录，真实的 claude、codex，真实的 GitHub 目录来源）走通 skill、带 key 的 MCP、工具；key 的值不出现在终端输出里
- [OK] [OK] 终端.app 的 Pro 深色、Basic 浅色、Basic 加 NO_COLOR 各走一遍，30 张窗口截图
- [OK] [OK] atw init 的额外 skill 步骤列全 11 个 skill 并装上 retro；发布后 npx oxy-tools@0.1.0 从 registry 起得来
- [OK] [OK] Standards / Spec / Visual 三个维度评审各一轮：一条硬性违规（改了光标样式而规范没同步）已修并复核，未做第二轮评审
- [OK] [--] 虚拟机里的 40 条实测是维护者口头确认，代理没有在场看

### Status

[OK] **Completed**

### Next Steps

- 定下提问末尾带不带问号（中文两句不带一句带，英文一句不带三句带）
- 决定是否处理真实终端里的两条弱点：OXY 大标志的方块行间露缝、浅色配色下绿色状态词偏淡
- 考虑给 cli/package.json 加发布前自动构建的脚本；现在 npm publish 之前要手动 npm run build
- 往 catalog.json 里加第一批真实的 MCP、工具、应用项目条目
- npm 上自动生成的占位版本 0.0.0-stage 要不要处理，由维护者决定
