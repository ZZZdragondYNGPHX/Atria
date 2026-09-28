# HANDOFF — Atria Repository Standardization Migration

Updated: 2026-09-28  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Current task branch HEAD: `21133b5aa45475b78733d203d43c3dff8107706a`  
Current stage: **Phase 4 verification passed — integration CI pending**

## Authoritative task documents

- Governance: `docs:README.md`
- Plan: `docs:plans/architecture/repository-standardization-migration.md`
- Record: `docs:records/refactor/repository-standardization-migration.md`
- Live Handoff: `docs:HANDOFF.md`
- Approved construction spec: `standardized-project-restructuring-spec-v1.0.md` v1.0

Always verify actual remote refs on resume. Do not treat embedded SHAs as newer than repository truth.

## Completed through Phase 3

Phase 1–3 are complete. Do not repeat audit/mapping, orphan-root creation, docs semantic migration, Package content migration, reference normalization, Native Heavy-Frontend Package Phase 1–6, or G1–G5.

Phase 3 checkpoint before Phase 4:

- `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch `@21133b5aa45475b78733d203d43c3dff8107706a`
- `docs@4e5844d10e817051df3620ff9842fd5e5b8e37f4`
- `package@0f40217ea451b91fdc8327e5a661c813d9d12142`
- `plugin@5bbf79fca1c68273f7e2c770ed66d80482dc341b`
- `skills@db3410039d22967b7dc440c9b618594e363a864a`
- `reference/vanilla@e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `reference/luker@91ae97aed557be9439317a67d0ec516f7512fe2e`

## Phase 4 verification completed

Fresh remote verification was performed before any cleanup.

### Replacement state / docs lifecycle

- legacy docs backup contains 245 blobs; excluding old root `README.md`, **244 / 244** legacy blobs are present in current docs at exact blob SHA;
- classification remains **15 Plans / 229 Records**;
- all **35** old handoff documents remain historical Records under `records/**/legacy-handoffs/**`;
- current docs top level is only `README.md`, `AGENTS.md`, `CLAUDE.md`, `WEB-PERSISTENT-PROMPT.md`, `HANDOFF.md`, `plans/`, `records/`, `templates/`;
- stale legacy top-level routes are absent;
- `templates/HANDOFF.md`, `templates/PLAN.md`, and `templates/RECORD.md` are present;
- old `handoff/latest-handoff.md` routing is absent from the checked adapters.

### Independent roots / boundaries

Verified parentless roots and ancestry:

- `docs` root `f69c3fa1345a65bbce3a1fef8405576b0422d97c` has zero parents; current tip descends from it;
- `package` root `e4950f5127f39b5be093428786f8af9410fd78bc` has zero parents; current tip descends from it;
- `plugin` root `7453144395832f3a315f4694649be9af9fe1f9b1` has zero parents; current tip descends from it;
- `skills` root `087ae0ccb5ecacd48b7490ed0b1d0faaaba44c6e` has zero parents; current tip descends from it.

Workspace boundary checks:

- Package top level contains only workspace governance plus `native-heavy-frontend-reference/`;
- no copied product roots such as `src/`, `public/`, `android-app/`, `tests/`, `default/`, or product `plugins/`;
- plugin contains only `README.md`, `AGENTS.md`, `CLAUDE.md`;
- skills contains only `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILLS.md`;
- product runtime `main:default/skills/**` and `main:plugins/**` remain present in main.

### Package / reference / main-side task diff

- Package source migration reverified **19 / 19 exact path + blob SHA matches**;
- Package target has only two additional workspace files: `README.md` and `releases/README.md`;
- no tracked historical `.atria` exists, consistent with the source audit;
- bare `vanilla` / `luker` refs remain absent;
- `reference/vanilla` exactly equals protected historical SHA `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`;
- `reference/luker` exactly equals protected historical SHA `91ae97aed557be9439317a67d0ec516f7512fe2e`;
- reference contents were not read;
- task branch is 12 commits ahead / 0 behind main and its net tree diff remains exactly seven governance/routing files with no Atria product feature code.

All required migration safety refs were still present and exact when verification completed. **No migration backup/source cleanup has started.**

## Integration status

Created PR **#96**: `refactor(repo): standardize repository governance routing`.

PR state at this checkpoint:

- base: `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- head: `refactor/repository-standardization-migration@21133b5aa45475b78733d203d43c3dff8107706a`
- GitHub mergeability: mergeable;
- changed files: 7 governance/routing files.

PR CI currently running:

- `Atria PR Checks` run **36410078873**
  - `Atria Migration Guard`: success
  - `Lint`: in progress
  - `Unit Tests`: in progress
- `Native Model Prompt Runtime` run **36410078927**
  - `integration`: in progress

Per repository rules, do not poll these runs for a long time. CI is now the only remaining dependency before integration.

## Safety refs — still retained

Do not delete until PR CI succeeds, PR #96 is merged, and integrated `main` is verified:

- `migration-backup/20260928/main`
- `migration-backup/20260928/docs`
- `migration-backup/20260928/docs-phase1`
- `migration-backup/20260928/package-native-heavy-frontend-reference`
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation`
- `migration-backup/20260928/vanilla`
- `migration-backup/20260928/luker`
- `migration-source/native-heavy-frontend-reference`

Also retain until final cleanup:

- `chore/native-heavy-frontend-phase5-validation`
- task branch `refactor/repository-standardization-migration`

## Next target

1. Recheck PR #96 CI once the runs have completed.
2. If required checks succeed, merge PR #96 with expected head SHA `21133b5aa45475b78733d203d43c3dff8107706a`.
3. Verify integrated `main` contains exactly the intended governance/routing replacement state and no unintended product change.
4. Only then remove all confirmed-obsolete migration backups/source and stale temporary branches.
5. Verify final branch set and replacement state after cleanup.
6. Update the same permanent Record with Phase 4 final results.
7. Delete `docs:HANDOFF.md`.
8. End the migration only after the completed task branch is gone.

## Read first next time

1. actual remote refs;
2. `docs:README.md`;
3. `docs:HANDOFF.md`;
4. `docs:plans/architecture/repository-standardization-migration.md`;
5. `docs:records/refactor/repository-standardization-migration.md`.

Do not read reference contents unless the user separately authorizes reference access.

## Do not repeat

- do not redo Phase 1–3;
- do not repeat Phase 4 replacement-state verification unless remote state changed materially;
- do not rebuild orphan roots;
- do not reclassify or remigrate docs;
- do not remigrate Package content;
- do not recreate the reference-normalization work;
- do not expand Atria product functionality;
- do not delete safety refs before PR integration and integrated-main verification.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` repository standardization migration, Task ID `refactor/repository-standardization-migration`.

Phase 1–3 are complete. Phase 4 replacement-state verification has passed. PR #96 integrates the seven main-side governance/routing files from `refactor/repository-standardization-migration@21133b5aa45475b78733d203d43c3dff8107706a` into `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`.

At the last checkpoint, PR CI runs `36410078873` and `36410078927` were still in progress; `Atria Migration Guard` had already succeeded. Start by checking the completed CI results. If they pass, merge PR #96, verify integrated main, then perform final cleanup of the retained migration backups/source and stale branches. After cleanup, update the same Record, delete `docs:HANDOFF.md`, verify the final branch set, and finish the migration.

Do not read reference contents unless separately authorized. Do not redo Phase 1–3 or Native Heavy-Frontend Package work.
