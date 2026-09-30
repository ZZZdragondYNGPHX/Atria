# Atria Model / Prompt / Runtime Native Refactor — Plan Index

- Task ID: `refactor/atria-model-prompt-settings`
- Primary Workspace: `main`
- Status: Complete — P0–P8 integrated through PR #85. Permanent evidence lives under `records/refactor/atria-model-prompt-settings/`.

## Goal

Move Atria Model / Prompt / Runtime authority out of legacy SillyTavern configuration while preserving host adapters as compatibility/transport seams rather than product truth.

## Frozen core principles

- No new SillyTavern authority in Atria-owned domain code.
- Six persistent top-level model/prompt/runtime objects remain the product model.
- Package carries distributable author intent, never private connection secrets.
- Prompt/Generation resources are Native versioned resources.
- Runtime Route uses stable identities/revisions.
- Native generation/context authority is host-independent; ST remains an adapter/compatibility island.
- No automatic dual-write or hidden migration fallback.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `DESIGN.md` | Final object model, authority, Prompt/Context/Generation design and hard-cut boundary | — |
| `overview.md` | Former top-level master overview and historical completion checkpoints | `DESIGN.md` |
| `legacy-pack-overview.md` | Former planning-pack README retained for provenance only | `DESIGN.md` |
| `NEXT.md` | Final integrated completion/current-next-state note | — |

Implementation evidence and phase execution are **Records**, not Plan modules:
- `records/refactor/atria-model-prompt-settings/EVIDENCE.md`
- `records/refactor/atria-model-prompt-settings/IMPLEMENTATION.md`
- `records/refactor/atria-model-prompt-settings/P*-VALIDATION.md`

## Stage routing

The task is complete. Future work reads `index.md` first, then:
- design/authority change: `DESIGN.md`;
- historical summary only: `overview.md`;
- implementation evidence: the exact Record file needed, not all validation files.

## Material routing/design changes

- **2026-09-30 — Plan Bundle normalization:** the previous sibling master file plus planning directory were normalized behind one `index.md`. Evidence/implementation material remains in Records rather than being copied into the Plan.
