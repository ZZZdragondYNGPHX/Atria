# Atria Repository Standardization Migration

Status: **Approved / frozen migration plan**  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Governance control plane: `docs`

## Source of truth

The migration is not a redesign exercise. Actual Git state is the factual baseline; the approved standard is the target state.

## Target branch model

Long-lived branches after migration:

- `main` — stable Atria product/source line.
- `docs` — independent root for Repository Governance, Plans, Records, templates and optional live `HANDOFF.md`.
- `package` — independent root for game/Package assets, one top-level directory per game.
- `plugin` — independent root for standalone tools, one top-level directory per tool.
- `skills` — independent root for repository-level AI Skill assets.
- `reference/<project>` — real external mirrors only.

Short-lived product work continues to use semantic branches such as `feat/*`, `fix/*`, `refactor/*`, and other justified temporary prefixes.

## Frozen boundaries

- Do not merge `main` into `docs`, `package`, `plugin`, or `skills`.
- `docs/package/plugin/skills` must become true independent-root/orphan branches.
- Do not rewrite reference mirrors into local orphan templates; preserve their upstream history.
- Reference read permission and update permission remain separate.
- Do not read or update reference contents unless explicitly authorized.
- Atria runtime Skills under `main:default/skills/**` remain product assets in `main`; they are not repository-agent Skills.
- Product `main:plugins/**` remains product/plugin runtime source; it is not the standalone-tool `plugin` workspace.
- Old handoff documents are not copied wholesale into the new live handoff model. Valuable facts must be retained in the relevant permanent Record before stale handoffs are removed.
- No Atria product feature expansion is part of this task.

## Migration mapping

Current -> target:

- `main` -> keep product history; main-side governance files are updated on this task branch, then integrated only at final completion.
- `docs` -> rebuild as independent `docs` root, preserving and classifying useful documentation.
- original `package/native-heavy-frontend-reference` source -> migrate only the Package asset tree into `package:native-heavy-frontend-reference/`; do not merge its branch history into `package`. Because Git cannot simultaneously host `refs/heads/package` and `refs/heads/package/...`, Phase 2 preserves the exact original source at `migration-source/native-heavy-frontend-reference` plus the Phase 1 backup ref before removing only the namespace-conflicting legacy ref.
- `vanilla` -> rename/migrate ref identity to `reference/vanilla` while preserving history.
- `luker` -> rename/migrate ref identity to `reference/luker` while preserving history.
- no current `plugin` branch -> create a clean independent `plugin` root.
- no current `skills` branch -> create a clean independent `skills` root for repository-agent Skills.

## Documentation migration policy

Target documentation structure:

```text
README.md
AGENTS.md
CLAUDE.md
WEB-PERSISTENT-PROMPT.md
plans/
records/
templates/
HANDOFF.md   # only while a live task requires it
```

Existing documentation is classified by meaning, not merely by old directory name:

- `planning/**` and approved design documents -> `plans/**`.
- completed implementation/fix/refactor/performance/chore documents -> `records/**`.
- mixed old `feat/**`, `fix/**`, and `refactor/**` trees require file-by-file semantic classification during content migration.
- old `handoff/**` documents are treated as legacy recovery material; only the current migration uses root `HANDOFF.md`.
- architecture notes are preserved and either absorbed into authoritative Governance/architecture Plans or retained as durable design context; they are not silently deleted.

## Package migration policy

The current Package asset is the content under:

`packages/native-heavy-frontend-reference/`

It will become a top-level game directory in the new `package` workspace.

A per-game `releases/` directory will be established. No tracked `.atria` release currently appears in the audited main/docs/Package trees, so migration must not invent a historical release artifact.

## Phases

### Phase 1 — Audit / Mapping / Safety

- inspect the reference implementation;
- audit existing governance/docs/Package structure;
- establish migration protection refs;
- freeze the migration mapping;
- create/update the migration Record and live HANDOFF;
- stop.

### Phase 2 — Build standardized long-lived roots

- build/rebuild `docs`, `package`, `plugin`, and `skills` as parentless roots;
- preserve migration source refs;
- do not yet delete old branches;
- update Record/HANDOFF;
- stop.

### Phase 3 — Migrate content and governance

- migrate/classify docs;
- migrate Package assets;
- add branch-local `AGENTS.md` and thin `CLAUDE.md`;
- install the Web adapter;
- update main-side governance files on the task branch;
- establish `SKILLS.md` routing;
- migrate reference names without contaminating mirrors;
- update Record/HANDOFF;
- stop.
