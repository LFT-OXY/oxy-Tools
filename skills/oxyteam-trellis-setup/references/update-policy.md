# Oxyteam Trellis Overlay 更新策略

## 支持矩阵

第一版只支持：

- Trellis `0.6.15`；
- Oh My Pi；
- 团队 Skill 来源 `LFT-OXY/oxy-Tools`；
- 同一项目中的全部 `oxyteam-*` Skills 使用同一个 Git 标签。

发现其他版本、其他平台或混装标签时停止，不按相近版本猜测兼容性。

## 应用前检查

先只读检查：

1. 当前目录是 Git 仓库；
2. `.trellis/.version` 精确为 `0.6.15`；
3. `.trellis/workflow.md`、Task Store、Context Loader 和 OMP 入口存在；
4. `skills-lock.json` 中团队 Skills 来源一致；
5. `oxyteam-trellis-setup` 已安装；
6. 目标文件不存在未识别的用户改动；
7. 项目中没有原始上游工程 Skill 与 `oxyteam-*` 并存。

需要检查的原始上游名称至少包括：

```text
ask-matt
code-review
codebase-design
diagnosing-bugs
domain-modeling
grill-with-docs
implement
improve-codebase-architecture
prototype
research
setup-matt-pocock-skills
tdd
to-spec
to-tickets
triage
wayfinder
```

Trellis 自带的 `trellis-*` Agent、Skill 和 Command 不是 Matt Skill 残留；它们是 Overlay 的适配入口。

## 写入确认

任何项目文件写入前必须向用户一次性展示：

- 将修改的确切路径；
- 每个文件的行为变化；
- 将创建和删除的 Artifact；
- 发现的冲突或旧任务；
- 明确保留不变的文件。

只有用户明确确认后才能写入。确认只覆盖已列出的路径；发现新增路径时重新说明并确认。

## 幂等性

重复运行时：

- 已符合目标格式的文件保持不变；
- 不重复添加状态块、配置或 Skill；
- 不覆盖用户后来增加的项目规则；
- 未知修改产生冲突报告，不直接覆盖；
- 新旧 Artifact 或 Skill 名称并存时停止。

第一版不创建 `scripts/apply.py`。文件形态和冲突规则稳定后，再把确定性的检测与转换固化为脚本。

## 禁止修改

- 全局 npm 安装目录；
- `node_modules/@mindfoldhq/trellis/**`；
- `node_modules/@mindfoldhq/trellis-core/**`；
- `.trellis/.template-hashes.json`；
- `.trellis/.runtime/**`；
- 未启用平台的配置目录。

Overlay 修改官方生成文件后，被 `trellis update` 识别为用户修改是正常行为。

## 升级

升级 Trellis 时只在测试项目执行：

1. 记录当前 Trellis 与 Overlay 版本；
2. 运行 `trellis update --dry-run`；
3. 检查冲突和 `.new` 文件；
4. 更新 `oxyteam-trellis-setup`；
5. 重新执行本地行为验证；
6. 验证通过后再应用到其他项目。

不在多个项目分别维护手工补丁。兼容变化集中回写到 Overlay Skill。