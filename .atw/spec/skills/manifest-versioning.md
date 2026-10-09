# 清单与版本

> 仓库根 `index.json` 的字段契约和版本号规则。本文是这些规则的唯一出处，其他文档只指向这里。

---

## 何时要改 index.json

- 新增、删除、重命名 `skills/` 下的目录；
- 改了某个 skill 目录里的**任何**文件（正文、引用文档、脚本、资产、元数据）；
- 改了某个 skill 对外的一句话说明。

`index.json` 的读者是 ATW 命令行，代码不在本仓库。引入它的提交 `c2230a1` 说明了两处用途：`atw init` 的“额外 skill”多选列表，和 `atw update` 的版本检查。下面的契约来自该提交说明和文件现状；读取端怎么比较版本、怎么处理异常条目，在本仓库内无从验证。

---

## 字段契约

```json
{
  "version": 1,
  "skills": [
    {
      "name": "wizard",
      "version": "1.0.0",
      "path": "skills/wizard",
      "description": {
        "zh": "生成交互式 bash 向导，带人走完只能由人完成的步骤",
        "en": "Generate an interactive bash wizard for steps only a human can perform"
      }
    }
  ]
}
```

| 字段 | 类型 | 现状 |
|------|------|------|
| `version`（顶层） | 整数 | 清单格式版本，当前为 `1`。改 skill 时不动它 |
| `skills` | 数组 | 按 `name` 升序排列 |
| `skills[].name` | 字符串 | 等于目录名，等于 `SKILL.md` frontmatter 的 `name` |
| `skills[].version` | 字符串 | 该 skill 的版本，见下节 |
| `skills[].path` | 字符串 | `skills/<name>`，相对仓库根，不带结尾斜杠 |
| `skills[].description.zh` | 字符串 | 一句中文说明，全角标点，句末不加句号 |
| `skills[].description.en` | 字符串 | 一句英文说明，句末不加句号 |

每个条目只有这四个键，`description` 只有 `zh`、`en` 两个键。`skills/` 下的每个目录都有且只有一个条目。

说明是给安装者在列表里挑选用的，写“它做什么”，不写触发条件。`onetake` 的说明在括号里带了安装前需要知道的限制，是目前唯一这么写的条目：

```json
"zh": "制作 10–60 秒的产品动效短片（体积约 70MB，仅限非商业使用）"
```

**目录与清单条目在同一个提交里增删。** 提交 `c2230a1` 一次新增 7 个 skill、移除 20 个，并同时落下清单。新条目插在按 `name` 排序后的位置，不追加到末尾。

---

## 版本规则

**改了 skill 就升它的 `version`。** 提交 `c2230a1` 的说明：“改动某个 skill 后要同步改它的 version，atw update 才会覆盖用户已安装的那份。” 不升版本，改动到不了已经装过的用户手里。

现有取值：

| 情况 | 取值 | 例子 |
|------|------|------|
| skill 自己带版本号 | 与它自带的对外版本一致 | `archify` 的 `"2.16"` = `skills/archify/SKILL.md` 的 `metadata.version`；`unlazy` 的 `"2.1.0"` = `skills/unlazy/package.json` 的 `version` |
| skill 自己不带版本号 | `"1.0.0"` | 其余全部，包括上游整包 `onetake`（它的 `SKILL.md` 和 `README.md` 里都没有版本号） |

**升哪一段没有约定。** 登记为 `1.0.0` 的 skill 都还没有发生过第二次改动，仓库里既没有先例，也不知道 `atw update` 是按“不相等”还是按“更大”来判断。第一次遇到时向维护者确认，并把结论补进本节。

---

## 校验

清单会出的问题：

| 情况 | 后果 |
|------|------|
| `name` 与目录名或 frontmatter 不一致 | 清单指向的 skill 身份对不上 |
| `skills/` 下有目录但清单没有条目 | 该 skill 不出现在可选列表里 |
| 清单有条目但目录不存在 | 清单指向不存在的路径 |
| 改了 skill 没升 `version` | 已安装用户拿不到更新 |
| 缺 `zh` 或 `en` | 某个语言的列表里缺说明 |
| JSON 语法错误 | 整个清单读不了 |

安装器读不读得了 `index.json`、会不会跳过其中的条目（缺字段、`path` 不合规则、重名、JSON 语法错误），由目录校验命令查：在 `cli/` 下运行 `npm run validate-catalog -- ..`，CI 在推送后也跑这一条（见 [CLI 层的目录校验与 CI](../cli/catalog-validation.md)）。

清单与 `skills/` 对不对得上，那条命令不查——它不读 `skills/`。这一部分没有签入的脚本，也没有既定的流程。下面这段检查的是上表前三项、键集合和排序，在仓库根运行，对当前的 `index.json` 输出 `index.json 通过`：

```bash
python3 - <<'EOF'
import json, pathlib, re
idx = json.load(open('index.json'))
names = [s['name'] for s in idx['skills']]
dirs = {p.name for p in pathlib.Path('skills').iterdir() if p.is_dir()}
bad = []
for s in idx['skills']:
    p = pathlib.Path(s['path'])
    fm = re.search(r'^name:\s*(.+)$', (p / 'SKILL.md').read_text(encoding='utf-8'), re.M)
    if not (fm and s['name'] == p.name == fm.group(1).strip().strip('"')):
        bad.append(f"name 不一致: {s['name']}")
    if s['path'] != f"skills/{s['name']}":
        bad.append(f"path 不规范: {s['path']}")
    if sorted(s) != ['description', 'name', 'path', 'version']:
        bad.append(f"键不对: {s['name']}")
    if sorted(s['description']) != ['en', 'zh']:
        bad.append(f"说明缺语言: {s['name']}")
if dirs - set(names): bad.append(f"未登记: {sorted(dirs - set(names))}")
if set(names) - dirs: bad.append(f"目录不存在: {sorted(set(names) - dirs)}")
if names != sorted(names): bad.append("未按 name 升序")
print('\n'.join(bad) or f"index.json 通过（{len(names)} 个 skill）")
raise SystemExit(1 if bad else 0)
EOF
```

它查不出“改了 skill 没升版本”。这条用 `git diff --stat` 对照：`skills/<name>/` 下有改动的，`index.json` 的 diff 里要有那个 `name` 的 `version` 行。

```diff
# 错：只改了正文，index.json 没动
 skills/wizard/SKILL.md | 4 ++--

# 对：正文和版本一起改
 skills/wizard/SKILL.md | 4 ++--
 index.json             | 2 +-
```
