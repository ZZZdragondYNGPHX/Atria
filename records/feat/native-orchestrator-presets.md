# Native Orchestrator Presets: Restore Safety

## Status

Implemented and merged to `main` in PR #21.

- Merge commit: `9b9801ab941f8bb0c08a3cbf52974b045a96da82`
- Affected native preset IDs:
  - `builtin-spec`
  - `builtin-loop`
  - `builtin-agenda`
  - `builtin-director`

## Incident

A compressed settings restore could reintroduce a persisted predecessor-era
`builtin-agenda` definition. The predecessor and Atria definitions both used
`AGENDA_BUILTIN_REVISION = 1`, so the Workspace host treated the restored
copy as current even though its planner prompt still requested the predecessor
planner tool while the runtime exposed only `atri_orch_planner_step`.

That mismatch caused the planner model to return no usable registered tool
call, after which Agenda recorded `effect.failed` and `run.failed`.

## Permanent behavior

Native orchestration presets are now Atria-owned fixed definitions.

- Missing native presets are restored automatically.
- Stale, edited, or restored native definitions are replaced by the shipped
  canonical definition.
- Agenda's shipped revision was advanced so the namespace-cutover definition
  cannot collide with the predecessor revision.
- Native presets cannot be saved over or deleted from the Workspace editor.
- Users customize a native preset by duplicating it first.
- The Workspace menu exposes **Add / restore native presets** for explicit
  recovery.
- Native entries are visibly marked as fixed.

## Import collision policy

Imported orchestration presets are always user copies.

- A fresh preset ID is assigned.
- Native ownership/revision metadata is stripped.
- A same-name import never overwrites a native or user preset.
- Name collisions use suffixes such as `(imported)`, `(imported 2)`, etc.

This policy makes archive restore/import safe even when an old export contains
a preset whose ID or visible name matches a shipped native preset.
