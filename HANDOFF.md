# HANDOFF — Atria Repository Standardization Migration

Updated: 2026-09-28  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Current task branch HEAD: `054efd2167497049d0c0ef0bd415e520cb39c026`  
Current stage: **Phase 2 complete — stop before Phase 3**

## Authoritative task documents

- Plan: `docs:plans/architecture/repository-standardization-migration.md`
- Record: `docs:records/refactor/repository-standardization-migration.md`
- Live Handoff: `docs:HANDOFF.md`
- Approved construction spec: `standardized-project-restructuring-spec-v1.0.md` v1.0
- Reference implementation: `ZZZdragondYNGPHX/Standardized-project`

The live `docs` branch was rebuilt as a parentless root during Phase 2. Verify its current remote HEAD directly on resume; do not use an embedded docs SHA as a substitute for repository truth.

## Phase 1–2 completed

- audited actual Atria refs, ancestry, docs topology and Package payload;
- verified the standardized reference repository;
- created Phase 1 migration backup refs;
- created `refactor/repository-standardization-migration`;
- created the formal migration Plan and cumulative Record;
- created `migration-backup/20260928/docs-phase1` before rebuilding docs;
- created parentless `package`, `plugin`, and `skills` bootstrap commits;
- resolved the Git ref namespace conflict by preserving the Package source at `migration-source/native-heavy-frontend-reference` plus the existing backup, then deleting only the old conflicting `package/native-heavy-frontend-reference` ref;
- ref-swap workflow run `36405204457` succeeded;
- removed the temporary ref-swap workflow;
- rebuilt `docs` as a parentless migration-control root containing this Plan, Record and single HANDOFF.

## Current factual refs

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch = `054efd2167497049d0c0ef0bd415e520cb39c026`
- `package` bootstrap root = `e4950f5127f39b5be093428786f8af9410fd78bc`
- `plugin` bootstrap root = `7453144395832f3a315f4694649be9af9fe1f9b1`
- `skills` bootstrap root = `087ae0ccb5ecacd48b7490ed0b1d0faaaba44c6e`
- Package migration source = `migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`
- stale validation branch = `chore/native-heavy-frontend-phase5-validation@b09addf9a4c6eadc47b748a53433475242bbc286`
- bare `vanilla` = `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- bare `luker` = `91ae97aed557be9439317a67d0ec516f7512fe2e`

## Safety refs — do not delete yet

- `migration-backup/20260928/main`
- `migration-backup/20260928/docs`
- `migration-backup/20260928/docs-phase1`
- `migration-backup/20260928/package-native-heavy-frontend-reference`
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation`
- `migration-backup/20260928/vanilla`
- `migration-backup/20260928/luker`

Keep all until Phase 4 verification succeeds.

## Important boundaries

- Phase 3 is content/governance migration, not product feature work.
- Do not merge `main` into `docs/package/plugin/skills`.
- Do not move Atria runtime Skills under `main:default/skills/**` into the repository-agent `skills` workspace.
- Do not treat product `main:plugins/**` as standalone-tool `plugin` content.
- Do not read reference branch contents unless separately authorized; rename/migrate ref identity without contaminating history.
- Legacy docs source must be read from the protected old-docs refs and semantically classified, not blindly copied.
- Package content source is now `migration-source/native-heavy-frontend-reference`, not the removed old ref name.

## Phase 3 only — next target

1. verify current remote refs and parentless roots;
2. read this HANDOFF, Plan and cumulative Record;
3. migrate useful legacy docs into standardized `plans/**` / `records/**`;
4. install final `docs:README.md`, `AGENTS.md`, thin `CLAUDE.md`, and `WEB-PERSISTENT-PROMPT.md`;
5. migrate the 19 Package-specific files into `package:native-heavy-frontend-reference/**` and create its `releases/` mechanism without inventing a historical `.atria`;
6. install final package/plugin/skills workspace governance files;
7. establish `skills:SKILLS.md` routing only for actual repository-agent Skills;
8. update main-side `AGENTS.md` / add thin `CLAUDE.md` on the task branch, removing stale old-handoff routing;
9. migrate bare reference names to `reference/vanilla` and `reference/luker` while preserving exact commit history and without reading reference contents;
10. validate migrated content completeness;
11. update this same Record and HANDOFF;
12. stop before Phase 4.

## Do not repeat

- do not redo Phase 1 audit;
- do not recreate existing backup/source refs;
- do not reimplement Package Phase 1–6 or G1–G5;
- do not recreate the Phase 2 ref-swap workflow;
- do not start final cleanup/deletion of safety refs;
- do not begin product feature work.

## New-chat bootstrap prompt

Continue the repository-wide standardization migration for `ZZZdragondYNGPHX/Atria`.

Task ID: `refactor/repository-standardization-migration`.

Phase 1 and Phase 2 are complete. Continue **Phase 3 — Migrate Content and Governance only**. Do not redo the audits/root bootstrap and do not start Phase 4 cleanup.

Verify remote refs first, then read:
- `docs:HANDOFF.md`
- `docs:plans/architecture/repository-standardization-migration.md`
- `docs:records/refactor/repository-standardization-migration.md`
- the approved construction spec if available.

Use `migration-backup/20260928/docs-phase1` / `migration-backup/20260928/docs` as legacy docs sources and `migration-source/native-heavy-frontend-reference` as the Package source. Preserve all safety refs. Do not read reference contents unless explicitly authorized. Finish Phase 3, update Record/HANDOFF, then stop.
