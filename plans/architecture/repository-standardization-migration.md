# Atria Repository Standardization Migration

Status: **Approved / frozen migration plan**  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Governance control plane: `docs`

## Source of truth

This Plan implements the user-approved **Atria / 通用项目仓库规范化与迁移施工说明 v1.0** and the verified reference structure in `ZZZdragondYNGPHX/Standardized-project`.

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
- Preserve all valuable source, documentation, Package assets, tools, Skills, and releases until the new structure is verified.
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
- completed/stale temporary branches -> retain until the migration is verified, then delete if no longer needed.
- `migration-backup/20260928/*` -> temporary safety refs only; remove in final cleanup after verification.

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

It will become a top-level game directory in the new `package` workspace. The migrated directory must preserve its Plan, platform-gap record, playtest record, project source, previews, scenarios, and phase validators.

A per-game `releases/` directory will be established. No tracked `.atria` release currently appears in the audited main/docs/Package trees, so migration must not invent a historical release artifact.

## Phases

### Phase 1 — Audit / Mapping / Safety

- verify actual remote branch/HEAD state;
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
- validate content completeness;
- update Record/HANDOFF;
- stop.

### Phase 4 — Verification / cleanup

- verify all independent roots and workspace boundaries;
- verify reference naming/history and Package content;
- verify docs lifecycle and adapters;
- integrate main-side task-branch changes;
- remove superseded branches and migration backups only after validation;
- finalize Record and delete live HANDOFF.

## Completion condition

The task is complete only when the standardized branch model is real, migrated assets are verified, independent roots are parentless, reference histories are preserved, docs lifecycle is normalized, Web/Local adapters are separated, temporary migration state is removed, and no source/data/document/Package/Skill/release is lost.
