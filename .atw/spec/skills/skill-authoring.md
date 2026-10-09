# Skill 编写

> `SKILL.md`、引用文档和 `agents/openai.yaml` 在本仓库里的实际写法。

怎么把给 agent 读的文档写好（上下文指针、信息层级、完成标准、引导词、裁剪），以 `skills/writing-for-agents/SKILL.md` 和同目录的 `SKILL-MECHANICS.md` 为唯一出处，这里不复述。本文只记录它没写、但仓库里实际存在的做法。上游整包不在本文范围内。

---

## Frontmatter

`SKILL.md` 以 YAML frontmatter 开头。`name` 和 `description` 每个 skill 都有，其余字段按需出现：

| 字段 | 何时用 | 现有例子 |
|------|--------|----------|
| `name` | 必填，等于目录名 | 全部 |
| `description` | 必填，单行 | 全部 |
| `disable-model-invocation: true` | skill 只由用户手动触发 | `skills/explanation/SKILL.md`、`skills/retro/SKILL.md` |
| `argument-hint` | skill 接收一段参数，给用户看的输入提示 | `skills/oxy-learning-hub/SKILL.md` |
| `metadata.credits` | 正文内容搬自别处，记录出处 | `skills/pr/SKILL.md` |
| `license`、`metadata.version`、`metadata.author` 等 | 只出现在上游整包里，随上游保留 | `skills/archify/SKILL.md`、`skills/onetake/SKILL.md` |

非上游 skill 的 frontmatter 里都没有版本号，版本只登记在 `index.json`。

### description 跟着触发方式走

规则出自 `skills/writing-for-agents/SKILL-MECHANICS.md` 的 “Invocation”，仓库里两种都有：

```yaml
# 用户触发：一句给人看的摘要，不带触发条件
name: retro
description: "Conduct a retrospective on a coding session."
disable-model-invocation: true
```

```yaml
# 模型触发：先说是什么，再列触发分支，最后写不该触发的边界
name: oxy-learning-hub
description: 总结或教学用户提供的链接、文档、代码和长文本。用户想……时使用；一句话摘要、纯翻译和没有具体对象的泛泛问答不使用。
```

`skills/wizard/SKILL.md` 是同一结构的英文版（`Use when ...` + `Don't invoke this for ...`）。

### 语言

仓库没有统一语言：`explanation`、`oxy-learning-hub` 全中文；`pr`、`retro`、`wizard`、`writing-for-agents` 全英文；`if5`、`show-me` 是中文 description 配英文正文。改现有 skill 时保持它现在的语言。`index.json` 里的说明另有双语要求，见 [清单与版本](./manifest-versioning.md)。

---

## 正文

### 完成标准

带流程的 skill 里，部分步骤以可检查的完成条件收尾。两种语言的写法：

```markdown
**完成标准**：正文或源码、来源信息和材料缺口均已确认，足以支持所选模式。
```

```markdown
**Done when:** every stage traces to concrete instructions a stranger could follow.
```

出处：`skills/oxy-learning-hub/SKILL.md`（第一步、第二步）及其 `references/summary-mode.md`；`skills/wizard/SKILL.md`（步骤 1、2）。引用文档整体的完成条件用 `## 完成标准` 小节（`references/publishing.md`、`references/workspace.md`）。

并非每一步都有：`skills/wizard/SKILL.md` 的步骤 3、4 和 `skills/retro/SKILL.md` 的步骤没有写。`writing-for-agents` 的 “Steps and completion criteria” 主张每步都写；给现有 skill 补写不属于顺手改动的范围。

### 分支内容放进 references，用相对链接指过去

`skills/oxy-learning-hub/SKILL.md` 只留每个分支都要走的步骤；某个分支才需要的内容拆到 `references/`，在分支入口处用相对 Markdown 链接指向它，并写明动作：

```markdown
### 总结模式

读取并执行 [`references/summary-mode.md`](references/summary-mode.md)。
```

链接目标必须真实存在。非上游 skill 没有自动检查，靠提交前人工核对；上游的 archify 和 unlazy 各自把这条做成了测试（`skills/archify/test/skill-metadata.test.mjs`、`skills/unlazy/tests/self-check.mjs`）。

### 脚本路径相对 skill 目录

正文里的命令写相对 skill 目录的路径，并说明宿主不提供目录变量时怎么办（`skills/oxy-learning-hub/SKILL.md` “输出与验证”）：

```markdown
python3 scripts/validate_html.py <html-file> [<html-file> ...]

从技能目录执行脚本；若宿主未提供技能目录变量，使用本技能的实际绝对路径。
```

### 宿主能力的叫法

skill 会被装到多个 agent 宿主上（`.atw/.optional-skills.json` 的 `roots` 同时列了 `.agents/skills` 和 `.claude/skills`）。`skills/oxy-learning-hub/SKILL.md` 按能力描述、不点名工具：“使用当前宿主的单选问询工具”“遵守当前宿主的联网访问策略”“当前宿主的打开文件能力”。

现状并不统一：`skills/explanation/SKILL.md` 直接写了 `WebFetch` / `Read` / `WebSearch`，`skills/retro/SKILL.md` 写了 `Call the Skill tool`。

---

## 跨 skill 依赖

另一个 skill 在用户那里可能没装。仓库里有两种处理：

| 做法 | 例子 | 代价 |
|------|------|------|
| 按名字调用另一个 skill | `skills/retro/SKILL.md` 调 `writing-for-agents` | 对方没装时这一步落空 |
| 把需要的内容抄进来，记下出处 | `skills/pr/`：`CREDITS.md` + frontmatter 的 `metadata.credits` | 内容有两份，要各自维护 |

`skills/pr/CREDITS.md` 写了选第二种的理由：“a hard dependency would break standalone installs”。

注意 `CREDITS.md` 指的出处是 humanlayer 仓库里的 `show-me`，并写着 “it isn't part of this repo”；本仓库现在有一个同名的 `skills/show-me/`，这句话与现状不符，属于待处理的旧说法。

---

## agents/openai.yaml

可选的平台元数据。带它的有 `pr`、`retro`、`unlazy`、`wizard`、`writing-for-agents`；`explanation`、`if5`、`show-me`、`oxy-learning-hub` 没有。

```yaml
interface:
  display_name: "Retro"
  short_description: "Conduct a retrospective on a coding session."
policy:
  allow_implicit_invocation: false
```

| 键 | 说明 | 出现位置 |
|----|------|----------|
| `interface.display_name` | 展示名，Title Case | 全部 5 个 |
| `interface.short_description` | 一句话说明，给人看；不带触发条件 | 全部 5 个 |
| `interface.default_prompt` | 默认提示词，用 `$<name>` 指代 skill | `skills/unlazy/agents/openai.yaml` |
| `policy.allow_implicit_invocation` | 是否允许模型自行触发 | `retro`（`false`）、`unlazy`（`true`） |

`short_description` 与 frontmatter 的 `description` 是两段独立的文字：`retro` 两处逐字相同，`wizard` 的是一句更短的概括，`pr` 的比 description 还长。

文件存在时，它和 `SKILL.md` 必须讲同一件事：

- `skills/retro/` 里，`policy.allow_implicit_invocation: false` 与 frontmatter 的 `disable-model-invocation: true` 成对出现。改其中一个时改另一个。
- 改了 skill 做的事，两处说明一起改。
