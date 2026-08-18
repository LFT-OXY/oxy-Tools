# Issue tracker: Trellis task directory + GitHub

This repo runs the Oxyteam Trellis Overlay. Work is split across two places, and which one you use depends on **who raised the item**:

| What | Where | Who triages it |
|---|---|---|
| Issues and PRs other people raised | GitHub Issues (`gh` CLI) | `/oxyteam-triage` runs here |
| The spec and implementation tickets for the task you are working on now | The current Trellis task directory | Nobody — these are agent-ready by construction |

The task directory is the **authority**. Its contents are synced one-way out to GitHub as a mirror; never edit the mirror and expect it to come back.

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
- Comments and conversation history live on the mirrored GitHub issue, not in the file.

## Ticket file fields

On top of the standard ticket template, tickets here carry two extra lines:

```markdown
# 01 — Ticket title

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** None
**Status:** ready-for-agent
**Impl:** ready
**Issue:**
```

| Field | Vocabulary | Who writes it |
|---|---|---|
| `Status:` | triage roles (see `triage-labels.md`) | Fixed at `ready-for-agent`. These tickets are ones you sliced yourself, so they never need triage — the field is a placeholder kept for vocabulary compatibility. |
| `Impl:` | `ready` / `doing` / `done` | `oxyteam_tickets.py`. This is the field the workflow actually routes on. |
| `Issue:` | `#58`, or empty | Filled in by the sync step; it is also the only ticket ↔ remote-issue mapping, so there is no separate mapping table. |

`Status:` and `Impl:` are deliberately separate. `Status:` answers "is this ticket clear enough, and who should pick it up"; `Impl:` answers "how far along is it". Folding implementation progress into `Status:` puts three unrelated vocabularies in one slot.

## When a skill says "publish to the issue tracker"

| Artifact | Destination | Then |
|---|---|---|
| A spec | `$TASK/prd.md` | `TASK_JSON_PATH=$TASK/task.json python3 .trellis/scripts/hooks/github_sync.py sync-spec` |
| Implementation tickets | `$TASK/issues/<NN>-<slug>.md` | `TASK_JSON_PATH=$TASK/task.json python3 .trellis/scripts/hooks/github_sync.py sync-tickets` |

Trellis fires lifecycle hooks only on task create / start / finish / archive — **there is no event for "a file was written"**, so the sync step above is something you run, not something that happens for you.

Do not apply a triage label when publishing here; these artifacts don't enter the triage queue.

## When a skill says "fetch the relevant ticket"

- A number like `01` or a filename → read `$TASK/issues/<NN>-*.md`.
- A `#NN` GitHub reference → `gh issue view <NN>`. If it mirrors a local ticket, prefer the local file — that's the authority.
- No reference given → `python3 .trellis/scripts/oxyteam_tickets.py frontier` and take the ticket currently at `Impl: doing`, or the first frontier ticket if none is claimed.

## Ticket operations

```bash
python3 .trellis/scripts/oxyteam_tickets.py list        # all tickets + Impl state
python3 .trellis/scripts/oxyteam_tickets.py frontier    # Impl: ready with all blockers done
python3 .trellis/scripts/oxyteam_tickets.py claim <NN>  # → Impl: doing
python3 .trellis/scripts/oxyteam_tickets.py done <NN>   # → Impl: done
```

`claim` refuses tickets that aren't on the frontier, and the parser rejects blocker references that don't exist or form a cycle.

**Tickets run one at a time by default.** Nothing here provides an atomic exclusive claim — `Impl: doing` is read-then-write, and neither `gh` nor Trellis's session pointer offers compare-and-set. Serial execution is how that's handled, not a guarantee that concurrent claims are safe.

## Wayfinding operations

Used by `/oxyteam-map`. A map is a **Discover-phase** artifact and lives in the task directory alongside everything else.

- **Map**: `$TASK/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `$TASK/map-issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`interview`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `$TASK/map-issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer to Decisions-so-far in `map.md`.

Decision tickets live in `map-issues/`, **not** `issues/`. They are questions whose resolution is a decision; `issues/` holds slices of a build to execute. They use different state vocabularies (`claimed`/`resolved` vs `Impl:`), and `oxyteam_tickets.py` only reads `issues/`. Mixing them makes the frontier calculation wrong in both directions.

Map child tickets are not synced to GitHub — they are working notes for one effort's Discover phase, and they resolve fast.

## What is *not* tracked here

These stay at the repo root, unchanged by the Overlay:

```text
docs/adr/          architecture decisions          /oxyteam-domain-modeling
CONTEXT.md         domain glossary                 /oxyteam-domain-modeling
.out-of-scope/     rejected-concept records        /oxyteam-triage
.trellis/spec/     layered coding standards        Trellis's own spec skills
```

They outlive any single task, so they don't belong in a directory that gets archived.
