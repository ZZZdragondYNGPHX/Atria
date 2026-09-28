# HANDOFF — Atria Repository Standardization Migration

Updated: 2026-09-28  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Current task branch HEAD: `21133b5aa45475b78733d203d43c3dff8107706a`  
Current stage: **Phase 3 complete — stop before Phase 4**

## Authoritative task documents

- Governance: `docs:README.md`
- Plan: `docs:plans/architecture/repository-standardization-migration.md`
- Record: `docs:records/refactor/repository-standardization-migration.md`
- Live Handoff: `docs:HANDOFF.md`
- Approved construction spec: `standardized-project-restructuring-spec-v1.0.md` v1.0

Always verify actual remote refs on resume. Do not treat embedded SHAs as newer than repository truth.

## Completed through Phase 3

### Phase 1–2

- audited repository topology and migration mapping;
- created migration safety refs;
- created the multi-stage task branch;
- rebuilt `docs/package/plugin/skills` on true parentless roots;
- preserved Package source at `migration-source/native-heavy-frontend-reference`;
- resolved the old `package/native-heavy-frontend-reference` namespace conflict without losing source;
- retained all Phase 1/2 migration backups.

### Phase 3

- semantically migrated legacy docs into standardized `plans/**` and `records/**`;
- installed final `docs:README.md` Governance, `AGENTS.md`, thin `CLAUDE.md`, `WEB-PERSISTENT-PROMPT.md`, and templates;
- preserved **244 / 244** legacy non-root-`README.md` blobs at exact blob SHA;
- removed old top-level docs routing categories and old `handoff/**` live route;
- migrated **19 / 19** Native Heavy-Frontend Reference Package source files exactly into `package:native-heavy-frontend-reference/**`;
- established `releases/README.md` without inventing a historical `.atria`;
- installed package/plugin/skills workspace README + AGENTS + thin CLAUDE files;
- created `skills:SKILLS.md` with no fabricated repository-agent Skills and kept `main:default/skills/**` in product source;
- kept `plugin` empty of fabricated tools and did not move `main:plugins/**`;
- updated main-side governance/routing only on the task branch, including `AGENTS.md`, new `CLAUDE.md`, `FORK_MAINTENANCE.md`, `AI_HANDOFF.md`, task prompt files and root README;
- replaced the stale `docs:handoff/latest-handoff.md` route with `docs:HANDOFF.md`;
- normalized reference names to `reference/vanilla` and `reference/luker` at exact historical SHAs;
- successful normalization workflow run: `36407675928`;
- removed superseded bare `vanilla` / `luker` refs;
- removed the temporary normalization workflow from the task branch;
- preserved every required `migration-backup/20260928/*` and `migration-source/*` ref.

## Current factual refs

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch = `21133b5aa45475b78733d203d43c3dff8107706a`
- `package` = `0f40217ea451b91fdc8327e5a661c813d9d12142`
- `plugin` = `5bbf79fca1c68273f7e2c770ed66d80482dc341b`
- `skills` = `db3410039d22967b7dc440c9b618594e363a864a`
- `reference/vanilla` = `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `reference/luker` = `91ae97aed557be9439317a67d0ec516f7512fe2e`
- Package migration source = `migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`

Verify the live `docs` HEAD directly on resume; docs intentionally does not self-reference its own latest commit.

## Safety refs — retain until Phase 4 verification succeeds

- `migration-backup/20260928/main`
- `migration-backup/20260928/docs`
- `migration-backup/20260928/docs-phase1`
- `migration-backup/20260928/package-native-heavy-frontend-reference`
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation`
- `migration-backup/20260928/vanilla`
- `migration-backup/20260928/luker`
- `migration-source/native-heavy-frontend-reference`

Do **not** clean these before Phase 4 validation.

## Phase 3 validation

- docs legacy preservation: **244 / 244 exact non-root-README blob SHAs**;
- stale old docs top-level route count: **0**;
- stale `handoff/**` directory count: **0**;
- Package source migration: **19 / 19 exact path/blob matches**;
- Package historical `.atria` files: **0**, as expected from source audit;
- plugin tree contains only workspace governance files;
- skills tree contains only workspace governance + `SKILLS.md`;
- task branch net diff vs main is governance/routing only, no Atria product feature code;
- normalized references exactly preserve the old reference SHAs;
- reference normalization run `36407675928`: **success**;
- `docs/package/plugin/skills` remain descendants of their Phase 2 parentless roots;
- all required migration backup/source refs remain present.

No product unit/full build, Android/Termux/device, Docker, paid-provider or real-UI validation was run or claimed; Phase 3 changed governance/document/asset placement, not Atria product functionality.

## Phase 4 only — next target

Phase 4 is **Verification / Cleanup**. Do not redo Phase 1–3 content migration.

1. Re-verify live remote refs and independent-root ancestry.
2. Re-verify docs/package/plugin/skills boundaries and reference exactness.
3. Re-verify task-branch governance diff against current `main`.
4. Integrate the task branch into `main` only after verification.
5. Verify integrated `main`.
6. Only then remove superseded temporary/stale migration refs and branches that the Plan marks for cleanup.
7. Remove migration backups/source only after all replacement state has been proven.
8. Finalize this same Record.
9. Delete `docs:HANDOFF.md` because the overall migration will then be complete.
10. Delete the completed task branch after successful integration/verification.

## Read first next time

1. actual remote refs;
2. `docs:README.md`;
3. `docs:HANDOFF.md`;
4. `docs:plans/architecture/repository-standardization-migration.md`;
5. `docs:records/refactor/repository-standardization-migration.md`.

Do not load reference contents unless the user separately authorizes reference access.

## Do not repeat

- do not redo Phase 1 audit/mapping;
- do not rebuild the orphan roots again;
- do not reclassify/migrate the legacy docs again;
- do not repeat Package Phase 1–6 or G1–G5;
- do not recreate the Package source migration;
- do not recreate the reference-normalization workflow;
- do not expand Atria product functionality;
- do not delete safety refs before Phase 4 replacement-state verification.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` repository standardization migration.

Task ID: `refactor/repository-standardization-migration`.

Phase 1, Phase 2 and **Phase 3 are complete**. Execute **Phase 4 — Verification / Cleanup only**. Do not redo content migration or Package implementation.

Start by verifying actual remote refs, then read:

- `docs:README.md`
- `docs:HANDOFF.md`
- `docs:plans/architecture/repository-standardization-migration.md`
- `docs:records/refactor/repository-standardization-migration.md`

Expected Phase 3 checkpoint:

- `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch `@21133b5aa45475b78733d203d43c3dff8107706a`
- `package@0f40217ea451b91fdc8327e5a661c813d9d12142`
- `plugin@5bbf79fca1c68273f7e2c770ed66d80482dc341b`
- `skills@db3410039d22967b7dc440c9b618594e363a864a`
- `reference/vanilla@e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `reference/luker@91ae97aed557be9439317a67d0ec516f7512fe2e`

Phase 3 verification already established 244/244 legacy docs blob preservation and 19/19 exact Package source migration. Re-verify repository truth, integrate the main-side task branch, then perform final cleanup only after replacement-state verification. Preserve all migration backups/source until that verification passes. Do not read reference contents without separate user authorization.
