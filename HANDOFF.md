# HANDOFF — Atria Repository Standardization Migration

Updated: 2026-09-28  
Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Current task branch HEAD: `1982578c51569a7f8191f4e45a11cfdbd292dfa7`  
Current stage: **Phase 3 complete — stop before Phase 4**

## Authoritative task documents

- Governance: `docs:README.md`
- Plan: `docs:plans/architecture/repository-standardization-migration.md`
- Record: `docs:records/refactor/repository-standardization-migration.md`
- Live Handoff: `docs:HANDOFF.md`
- Approved construction spec: `standardized-project-restructuring-spec-v1.0.md` v1.0

The final docs closure commit contains this HANDOFF itself. On resume, verify the actual remote `docs` HEAD directly; do not use an embedded docs SHA as a substitute for repository truth.

## Phase 1–3 completed

- audited actual refs, docs topology and Package payload;
- created and preserved migration safety refs;
- rebuilt `docs/package/plugin/skills` from parentless independent roots;
- preserved the original Package branch source at `migration-source/native-heavy-frontend-reference`;
- semantically migrated all useful legacy docs into standardized `plans/**` / `records/**`;
- installed authoritative Repository Governance, local adapters, Web adapter and templates;
- migrated all 19 Package-specific files into `package:native-heavy-frontend-reference/**` with exact blob identity;
- established the per-game `releases/` mechanism without inventing historical `.atria`;
- established `plugin` workspace governance without moving product `main:plugins/**`;
- established `skills:SKILLS.md` and workspace governance without moving Atria Runtime Skills;
- updated main-side `AGENTS.md` and added thin `CLAUDE.md` on the task branch;
- normalized bare `vanilla/luker` names to `reference/vanilla` and `reference/luker` with exact history;
- removed the temporary reference-normalization workflow after successful execution;
- completed Phase 3 content/boundary validation.

## Current factual refs

Verify these against the remote at Phase 4 start:

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch = `1982578c51569a7f8191f4e45a11cfdbd292dfa7`
- Package = `0f40217ea451b91fdc8327e5a661c813d9d12142`
- Plugin = `5bbf79fca1c68273f7e2c770ed66d80482dc341b`
- Skills = `db3410039d22967b7dc440c9b618594e363a864a`
- `reference/vanilla` = `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `reference/luker` = `91ae97aed557be9439317a67d0ec516f7512fe2e`
- Package migration source = `migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`
- stale validation branch still retained = `chore/native-heavy-frontend-phase5-validation@b09addf9a4c6eadc47b748a53433475242bbc286`

Docs semantic content checkpoint before this closure commit:

- `docs@5467b59cb3dbc889c79504cd8baffb3997b40620`

Again: the actual docs tip is the later closure commit containing this HANDOFF/Record update; verify it remotely.

## Safety refs — still required

Do not delete until Phase 4 verification succeeds:

- `migration-backup/20260928/main`
- `migration-backup/20260928/docs`
- `migration-backup/20260928/docs-phase1`
- `migration-backup/20260928/package-native-heavy-frontend-reference`
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation`
- `migration-backup/20260928/vanilla`
- `migration-backup/20260928/luker`
- `migration-source/native-heavy-frontend-reference`

All were rechecked unchanged during Phase 3.

## Phase 3 validation evidence

- legacy docs: **244 / 244** migrated non-root-README blobs matched exact source SHA;
- semantic result: **15 Plans / 229 Records** from legacy material;
- old handoffs: **35 / 35** preserved only as historical Record material;
- Package payload: **19 / 19** exact source blobs;
- Package has release mechanism, no fabricated historical `.atria`, no copied product root;
- Plugin does not contain `main:plugins/**`;
- Skills does not contain `main:default/skills/**`;
- Phase 2 roots for docs/package/plugin/skills rechecked with **0 parents**;
- reference normalization workflow run `36407675928` = **success**;
- normalized reference refs compare identical to old commit identities; bare names are gone;
- main task `AGENTS.md` no longer contains the old handoff route.

No product build/test, Android/Termux/device, Docker, provider, or real UI validation was run or claimed because Phase 3 changed repository content/governance rather than Atria product behavior.

## Phase 4 only — next target

1. fetch/verify every relevant remote ref again;
2. read `docs:README.md`, this HANDOFF, the migration Plan and cumulative Record;
3. verify final long-lived workspace trees/boundaries and independent-root ancestry end-to-end;
4. verify normalized reference names/history without using reference contents unless separately authorized;
5. verify docs lifecycle/adapters/templates and Package content/release mechanism;
6. inspect remaining superseded governance/temporary branch state and determine exact cleanup set;
7. integrate the verified main-side task branch into `main`;
8. verify integrated `main`;
9. only after all verification passes, remove confirmed obsolete task/migration refs and other superseded state;
10. finalize the same Record;
11. delete live `docs:HANDOFF.md` because the migration task is then complete.

Phase 4 cleanup must not start before its verification gate passes.

## Do not repeat

- do not redo Phase 1 audit/mapping;
- do not rebuild the parentless roots;
- do not repeat legacy-doc semantic migration;
- do not re-copy the 19 Package files;
- do not recreate the reference-normalization workflow;
- do not reimplement Package Phase 1–6 or G1–G5;
- do not move `main:plugins/**` into `plugin`;
- do not move `main:default/skills/**` into `skills`;
- do not read reference contents without explicit reference authorization;
- do not remove migration backups/source before Phase 4 verification;
- do not expand Atria product functionality.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` Task ID `refactor/repository-standardization-migration`.

Phase 1–3 are complete. Execute **Phase 4 — Verification / Cleanup only**.

Primary Workspace: `refactor/repository-standardization-migration`  
Current recorded task HEAD: `1982578c51569a7f8191f4e45a11cfdbd292dfa7`

Before doing anything, fetch/verify the real remote refs, then read:

- `docs:README.md`
- `docs:HANDOFF.md`
- `docs:plans/architecture/repository-standardization-migration.md`
- `docs:records/refactor/repository-standardization-migration.md`

Phase 3 already completed semantic docs migration, Package 19/19 migration, package/plugin/skills governance, `SKILLS.md`, main-side AGENTS/CLAUDE, and exact-history `reference/vanilla` / `reference/luker` normalization. Reference normalization workflow run `36407675928` succeeded and the temporary workflow was removed.

Do not repeat those migrations. Do not read reference contents unless separately authorized. Preserve every `migration-backup/20260928/*` and `migration-source/*` until Phase 4 verification passes. Then perform only the cleanup/integration justified by the verified state, finalize the same Record, delete live HANDOFF, and finish the migration.
