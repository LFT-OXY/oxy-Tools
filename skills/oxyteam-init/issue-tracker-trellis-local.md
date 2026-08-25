# Issue tracker: Trellis task directory (local only)

This repo runs the Oxyteam Trellis Overlay. All issues — the spec and the implementation tickets for the task you are working on — live as markdown files in the current Trellis task directory. There is no remote mirror: the task directory is the **sole authority**, and nothing is synced anywhere.

## Resolving the current task directory

Every path below is relative to the active task. Resolve it first:

```bash
TASK=$(python3 .trellis/scripts/task.py current)
```

Bare `current` prints the repo-relative task directory. It **exits non-zero when there is no active task** — when that happens, stop and ask the user to create or start one. Do not fall back to `.scratch/`.

## Conventions

- **Spec**: `$TASK/prd.md`. The filename is Trellis's, the contents are an Oxyteam spec — Trellis treats the file as opaque text and parses nothing inside it. Write the whole file; the default skeleton Trellis created is meant to be overwritten.
- **Implementation tickets**: one file per ticket at `$TASK/issues/<NN>-<slug>.md`, numbered from `01` in dependency order.
- **Research notes**: `$TASK/research/<topic>.md`.
- **Triage state**: not used on tickets in the task directory — see the `Status:` note below.
- Comments and conversation history append to the bottom of the ticket file under a `## Comments` heading.

## Ticket file fields

On top of the standard ticket template, tickets here carry one extra line:

```markdown
# 01 — Ticket title

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** None
**Status:** ready-for-agent
**Impl:** ready
```

| Field | Vocabulary | Who writes it |
|---|---|---|
| `Status:` | triage roles (see `triage-labels.md`) | Fixed at `ready-for-agent`. These tickets are ones you sliced yourself, so they never need triage — the field is a placeholder kept for vocabulary compatibility. |
| `Impl:` | `ready` / `doing` / `done` | `oxyteam_tickets.py`. This is the field the workflow actually routes on. |

There is no `Issue:` field — that one exists only in the GitHub-mirror variant, to hold the remote issue number. `oxyteam_tickets.py` never reads it; the only field it requires is `Impl:`.

`Status:` and `Impl:` are deliberately separate. `Status:` answers "is this ticket clear enough, and who should pick it up"; `Impl:` answers "how far along is it". Folding implementation progress into `Status:` puts three unrelated vocabularies in one slot.

## When a skill says "publish to the issue tracker"

| Artifact | Destination |
|---|---|
| A spec | `$TASK/prd.md` |
| Implementation tickets | `$TASK/issues/<NN>-<slug>.md` |

The files **are** the tracker — there is no sync step and no remote to publish to.

Do not apply a triage label when publishing here; these artifacts don't enter the triage queue.

## When a skill says "fetch the relevant ticket"

- A number like `01` or a filename → read `$TASK/issues/<NN>-*.md`.
- No reference given → `python3 .trellis/scripts/oxyteam_tickets.py frontier` and take the ticket currently at `Impl: doing`, or the first frontier ticket if none is claimed.

## Ticket operations

```bash
python3 .trellis/scripts/oxyteam_tickets.py list        # all tickets + Impl state
python3 .trellis/scripts/oxyteam_tickets.py frontier    # Impl: ready with all blockers done
python3 .trellis/scripts/oxyteam_tickets.py claim <NN>  # → Impl: doing
python3 .trellis/scripts/oxyteam_tickets.py done <NN>   # → Impl: done
```

`claim` refuses tickets that aren't on the frontier, and the parser rejects blocker references that don't exist or form a cycle.

**Tickets run one at a time by default.** Nothing here provides an atomic exclusive claim — `Impl: doing` is read-then-write, and Trellis's session pointer offers no compare-and-set. Serial execution is how that's handled, not a guarantee that concurrent claims are safe.

## Wayfinding operations

Used by `/oxyteam-map`. A map is a **Discover-phase** artifact and lives in the task directory alongside everything else.

- **Map**: `$TASK/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `$TASK/map-issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`interview`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `$TASK/map-issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer to Decisions-so-far in `map.md`.

Decision tickets live in `map-issues/`, **not** `issues/`. They are questions whose resolution is a decision; `issues/` holds slices of a build to execute. They use different state vocabularies (`claimed`/`resolved` vs `Impl:`), and `oxyteam_tickets.py` only reads `issues/`. Mixing them makes the frontier calculation wrong in both directions.

## What is *not* tracked here

These stay at the repo root, unchanged by the Overlay:

```text
docs/adr/          architecture decisions          /oxyteam-domain-modeling
CONTEXT.md         domain glossary                 /oxyteam-domain-modeling
.out-of-scope/     rejected-concept records        /oxyteam-triage
.trellis/spec/     layered coding standards        Trellis's own spec skills
```

They outlive any single task, so they don't belong in a directory that gets archived.

## Re-enabling the GitHub mirror

The mirror machinery is kept in the repo, switched off. `.trellis/scripts/hooks/github_sync.py` still works; nothing calls it. To turn the mirror back on:

1. **`.trellis/config.yaml`** — uncomment the `hooks:` block (`after_create` / `after_archive` calling `github_sync.py`). Verify with `grep -n -A 6 "hooks" .trellis/config.yaml`: every line should lose its leading `#`.
2. **`.trellis/workflow.md`** — restore the sync steps: `github_sync.py sync-spec` as a Specify completion condition and `github_sync.py sync-tickets` as a Slice completion condition. Both are explicit commands, not hooks — Trellis fires lifecycle hooks only on task create / start / finish / archive, and **there is no event for "a file was written"**.
3. **Replace this file** with the "Trellis task directory + GitHub" variant, which documents the sync steps and the `**Issue:**` ticket field the sync fills in. The seed template ships inside the `oxyteam-init` skill folder as `issue-tracker-trellis.md`; locate it with:

   ```bash
   find -L . -name "issue-tracker-trellis.md" -not -path "./.git/*"
   ```

   The `-L` matters: skill folders are often symlinked between `.claude/skills/` and `.agents/skills/`, and a bare `find` walks past symlinked directories without descending into them, so it reports only one of the two paths.

Historic tasks need no back-fill — from then on, `create` assigns each new task a fresh remote issue.

## Why this variant exists

Choosing Trellis as the tracker does not have to mean choosing GitHub. This file covers the case where the task directory is all there is: a repo with no remote, a private/solo project, or a team that keeps planning artifacts out of the issue tracker on purpose.

Nothing here is a degraded version of the mirrored variant — the task directory was already the authority in that one too. The only thing removed is the outbound copy.
