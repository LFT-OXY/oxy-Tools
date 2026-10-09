<!-- ATW:START -->
# ATW Instructions

These instructions are for AI assistants working in this project.

This project is managed by ATW. The working knowledge you need lives under `.atw/`:

- `.atw/workflow.md` — development phases, when to create tasks, skill routing
- `.atw/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.atw/workspace/` — per-developer journals and session traces
- `.atw/tasks/` — active and archived tasks (PRDs, research, jsonl context)

ATW commands are written by bare name throughout `.atw/` — `start`, `continue`, `finish-work`. The prefix that invokes them is your platform's, not ATW's: Claude Code uses `/atw:`, Cursor and Pi `/atw-`, Codex `$`, Copilot a plain `/`, and a few hosts expose them as skills instead. Prefer an available ATW command over manual steps; not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable ATW skills
- `.codex/agents/` — optional custom subagents

Managed by ATW. Edits outside this block are preserved; edits inside may be overwritten by a future `atw update`.

<!-- ATW:END -->

## Agent skills

### Issue tracker

Issue 存放在 ATW 任务目录（`.atw/tasks/<task>/`）中，仅本地，不同步到 GitHub。See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认的五个分诊标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

single-context：仓库根目录的 `GLOSSARY.md` + `docs/adr/`。See `docs/agents/domain.md`.
