# 质量约定

> 仓库里现有的校验手段和提交信息的写法。

---

## 现状

仓库级别**没有**任何自动化：没有根 `package.json`、linter、formatter、`.editorconfig`、pre-commit hook 或 CI。唯一的 workflow 文件 `skills/unlazy/.github/workflows/test.yml` 位于子目录，GitHub 不会触发它。

也没有成文的“提交前必须跑什么”的流程。下面列的是各 skill 自带、现在能跑的命令。

---

## 现有的校验命令

| 改动范围 | 命令 | 出处 |
|----------|------|------|
| `index.json`，或增删改任何 skill | [清单与版本](./manifest-versioning.md) “校验”一节的脚本 | 该文档；不是既有流程 |
| `skills/oxy-learning-hub/scripts/validate_html.py` | `python3 skills/oxy-learning-hub/scripts/validate_html.py --self-test` | 脚本自带的 `--self-test` |
| `skills/oxy-learning-hub/assets/` | [`scripts/html-assets.md`](../scripts/html-assets.md) “验证”一节 | `skills/oxy-learning-hub/SKILL.md` 要求生成的 HTML 通过校验 |
| `skills/wizard/template.sh` | `bash -n skills/wizard/template.sh`，装了 `shellcheck` 再跑一遍 | `skills/wizard/SKILL.md` 步骤 4 对生成物的要求 |
| 上游整包 | [上游整包](./vendored-skills.md) “在本仓库里能跑的检查”一表 | 各整包自带 |

只改 Markdown 正文的改动没有对应的自动校验；`SKILL.md` 里提到的本地路径是否存在，靠人工核对。

---

## 提交约定

从 `git log` 归纳：

- **格式**：Conventional Commits，`type(scope): 中文标题`。
  - `feat(skills): 新增 if5 / show-me / unlazy 三个 skill`
  - `chore(atw): 接入 ATW 工作流并初始化仓库代理配置`
- **type**：出现过 `feat`、`fix`、`docs`、`chore`。
- **scope**：改 `skills/` 和 `index.json` 用 `skills`；改 ATW 配置用 `atw`。
- **正文用中文**，讲清每一项改了什么、为什么。多项改动用列表，一项一条（`c2230a1`、`0d4c05f`）。
- **直接提交到 `main`**：仓库只有 `main` 一个分支，历史是线性的，没有合并提交。

提交 `66591ee` 的正文还多做了两件事，是目前写得最细的一次，可作参照：

- 写了跑过的校验和结果：“npm test exit=0（含 self-check 12/12、hardening 8/8）”；
- 解释了不寻常的保留：哪些文件放进来不生效、某个命名为什么与别处不同。
