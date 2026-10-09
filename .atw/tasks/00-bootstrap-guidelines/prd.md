# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

The developer just ran `atw init` on this project for the first time.
`.atw/` now exists with empty spec scaffolding, and this bootstrap task
exists under `.atw/tasks/`. When they want to work on it, they should start
this task from a session that provides ATW session identity.

**Your job**: help them populate `.atw/spec/` with the team's real
coding conventions. Every future AI session — the `/atw-implement` run
and this project's `atw-review` sub-agents — reads spec files
listed in per-task jsonl manifests. Empty spec = the AI writes generic
code. Real spec = the AI matches the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

- [x] Fill skills-layer guidelines
- [x] Fill scripts-layer guidelines
- [x] Add code examples

> 2026-10-09 调整：`atw init` 按 fullstack 项目生成了 backend / frontend 两层模板，
> 但本仓库是 agent skill 分发仓库（`skills/` + `index.json`），没有后端服务、前端应用
> 或数据库。按 `atw-spec-bootstrap` 的规则（模板不是契约，不适用的删掉），spec 层改为
> `skills/` 与 `scripts/`，原 backend / frontend 模板已移除。

---

## Spec files to populate


### Skills layer

| File | What to document |
|------|------------------|
| `.atw/spec/skills/directory-structure.md` | 仓库布局、skill 目录的四种形态、命名 |
| `.atw/spec/skills/skill-authoring.md` | `SKILL.md` frontmatter、触发方式、正文结构、`agents/openai.yaml` |
| `.atw/spec/skills/manifest-versioning.md` | `index.json` 字段契约、版本号规则、校验命令 |
| `.atw/spec/skills/vendored-skills.md` | 带上游许可证整包引入的 skill 怎么对待 |
| `.atw/spec/skills/quality-guidelines.md` | 按改动类型的校验、提交约定、禁止事项 |


### Scripts layer

| File | What to document |
|------|------------------|
| `.atw/spec/scripts/bundled-scripts.md` | 随 skill 分发的脚本：运行时、命令行形态、输出与退出码、失败行为 |
| `.atw/spec/scripts/html-assets.md` | HTML 模板占位符、校验器要求、主题 token、模板与脚本的 DOM 约定 |


### Thinking guides (already populated)

`.atw/spec/guides/` contains general thinking guides pre-filled with
best practices. Customize only if something clearly doesn't fit this project.

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching `.atw/spec/` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every ticket runs through `/atw-implement` in the main session (writes
  code), which dispatches two `atw-review` sub-agents (verify quality).
  No implementation sub-agent is spawned.
- Each task has `implement.jsonl` / `check.jsonl` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's `prd.md`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: `.atw/spec/`. That's why filling it well now pays
  off forever.

---

## Completion

When the developer confirms the checklist items above are done with real
examples (not placeholders), guide them to run:

```bash
python3 ./.atw/scripts/task.py finish
python3 ./.atw/scripts/task.py archive 00-bootstrap-guidelines
```

After archive, every new developer who joins this project will get a
`00-join-<slug>` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to ATW! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"
