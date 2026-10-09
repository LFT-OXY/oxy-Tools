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
