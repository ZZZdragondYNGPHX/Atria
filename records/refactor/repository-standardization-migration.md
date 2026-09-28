# Atria Repository Standardization Migration — Implementation Record

Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Status: **Phase 2 complete; Phase 3 not started**

## Phase 1 — Audit / Mapping / Safety

### Start state

Atria refs at audit start:

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- `docs` = `37c627e2c57885d395fbd35c832eedca8b112dd1`
- `package/native-heavy-frontend-reference` = `b3b6c4f01729325a789c92a15cc6946e1a97603a`
- `chore/native-heavy-frontend-phase5-validation` = `b09addf9a4c6eadc47b748a53433475242bbc286`
- `vanilla` = `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `luker` = `91ae97aed557be9439317a67d0ec516f7512fe2e`

No long-lived `package`, `plugin`, `skills`, or `reference/*` branches existed at Phase 1 start.

### Reference implementation verification

Verified `ZZZdragondYNGPHX/Standardized-project`:

- `main` = `12bda731c70a35d97f83354bef448726421fcfe2`
- `docs` = `6152d40dac0866059ae817c16d1500535879f4aa`
- `package` = `81f1f02d319870e34e9cbaca3346744fd699b648`
- `plugin` = `22d5714f684d4ad3e1d3cf645ab455897e73b548`
- `skills` = `0043e8d1dff5b0535a058c9573ab9ef49dd8641b`

The `docs`, `package`, `plugin`, and `skills` commits were verified to have zero parents. Their file trees match the expected reference layout and the documented hot-path rules were read.

### Current Atria topology findings

- `docs` is not independent: it has normal ancestry and diverges from `main`; merge base = `87de0a613dab0a6c2c2d32462780a7e19d9b0237`.
- Current Package branch is not independent: it is 89 commits ahead of current `main` with merge base exactly current `main`.
- The Package branch still contains the complete Atria product tree, including `src/`, `public/`, `android-app/`, `.github/`, `package.json`, and `server.js`.
- The actual Package-specific payload is under `packages/native-heavy-frontend-reference/` and contains 19 tracked files:
  - `PLAN.md`
  - `PLATFORM_GAPS.md`
  - `PLAYTEST.md`
  - three Preview fixtures
  - Project source (`atria.project.json`, World logic, UI)
  - four Scenario fixtures
  - `verify-phase1.mjs` through `verify-phase6.mjs`
- No tracked `.atria` artifact was found in the audited current main/docs/Package trees.
- The stale `chore/native-heavy-frontend-phase5-validation` ref is an ancestor of the current Package branch and is three commits behind it.
- Bare `vanilla` and `luker` refs still exist. Their contents were not read or modified; only branch identity/HEAD metadata was audited.

### Documentation audit

Current `docs` contains 266 tree entries and 134 Markdown documents besides the root README.

Top-level Markdown grouping:

- `architecture`: 2
- `chore`: 1
- `feat`: 22
- `features`: 8
- `fix`: 12
- `fixes`: 16
- `handoff`: 35
- `performance`: 5
- `planning`: 22
- `refactor`: 8
- `refactors`: 3

Findings:

- the old docs layout mixes intended design and executed history;
- `planning/**` is Plan-oriented;
- `features/**`, `fixes/**`, `refactors/**`, `performance/**`, and the audited `chore/**` content are executed-history/Record material;
- old `feat/**`, `fix/**`, and `refactor/**` are semantically mixed and will be classified by content during Phase 3 rather than moved blindly by directory;
- 35 legacy handoff Markdown files exist;
- `handoff/latest-handoff.md` currently reports Native Heavy-Frontend Reference Package Phase 6 complete, so there was no prior unfinished live task to preserve as the repository's current handoff;
- the migration task becomes the single live HANDOFF.

### Main-workspace governance findings

Current `main` has `AGENTS.md`, `FORK_MAINTENANCE.md`, `AI_HANDOFF.md`, `NEW_BUG_PROMPT.md`, and `NEW_FEATURE_PROMPT.md`, but no root `CLAUDE.md`.

The current hot-path rules still point agents at `docs:handoff/latest-handoff.md` and use bare `vanilla` / `luker` naming, so they must be updated during Phase 3 after the standardized docs workspace exists.

Atria runtime Skills under `default/skills/**` are product assets and remain in `main`; they are not candidates for the repository-agent `skills` branch.

### Safety refs created

Created the following temporary protection refs without moving the originals:

- `migration-backup/20260928/main` -> `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- `migration-backup/20260928/docs` -> `37c627e2c57885d395fbd35c832eedca8b112dd1`
- `migration-backup/20260928/package-native-heavy-frontend-reference` -> `b3b6c4f01729325a789c92a15cc6946e1a97603a`
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation` -> `b09addf9a4c6eadc47b748a53433475242bbc286`
- `migration-backup/20260928/vanilla` -> `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `migration-backup/20260928/luker` -> `91ae97aed557be9439317a67d0ec516f7512fe2e`

Created the multi-stage task branch:

- `refactor/repository-standardization-migration` -> `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`

No Atria product source, Package asset, reference content, or original long-lived ref was modified in Phase 1.

### Key decisions

1. Use `refactor/repository-standardization-migration` as the single Primary Workspace/task branch for main-side migration changes across all phases.
2. Rebuild `docs/package/plugin/skills` as true parentless roots; do not use merge-based isolation.
3. Move only Package-specific payload into the new `package` workspace; never carry the full current Package branch tree.
4. Preserve `vanilla` / `luker` histories and change naming only in the later migration phase; no reference content audit was performed without explicit reference permission.
5. Treat runtime Skills and product plugins in `main` as product source, not as repository-level `skills` / `plugin` assets.
6. Keep all migration backups until Phase 4 verification passes.

### Validation

Phase 1 validation was repository-state inspection only:

- branch/ref enumeration;
- commit-parent inspection;
- branch comparison/merge-base inspection;
- recursive tree inspection for `main`, `docs`, and current Package branch;
- exact Package payload inventory;
- reference implementation branch/root verification.

No source tests, build, Android/device checks, UI checks, or CI runs were required or claimed.

### Known limitations / deferred checks

- legacy docs are semantically mixed; Phase 3 must perform content-aware classification before removing old directories;
- reference branch contents remain intentionally unread;
- no historical `.atria` release is currently tracked in the audited Atria trees; Phase 3 should create the release-directory mechanism without fabricating an old artifact;
- the current `docs` branch remains non-orphan until Phase 2.

### Next checkpoint

**Phase 2 — Build Standardized Long-Lived Roots**

Do not start Phase 3 in the same work round. Phase 2 must create/rebuild parentless `docs`, `package`, `plugin`, and `skills` roots while preserving all Phase 1 safety refs and source branches.


## Phase 2 — Build Standardized Long-Lived Roots

### Start state

- Primary task branch start for Phase 2: `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- old `docs` control-plane HEAD entering the root rebuild: `9c6d57cee05818ff69512ec5941ee8812d6d7c08`
- original Package source HEAD: `b3b6c4f01729325a789c92a15cc6946e1a97603a`

Before rewriting `docs`, an additional exact protection ref was created:

- `migration-backup/20260928/docs-phase1` -> `9c6d57cee05818ff69512ec5941ee8812d6d7c08`

### Independent roots created

Created parentless bootstrap commits:

- `package` root = `e4950f5127f39b5be093428786f8af9410fd78bc`
- `plugin` root = `7453144395832f3a315f4694649be9af9fe1f9b1`
- `skills` root = `087ae0ccb5ecacd48b7490ed0b1d0faaaba44c6e`

Each bootstrap tree contains only a workspace README. Product code and unrelated assets were not copied into these roots. Content/governance population is intentionally deferred to Phase 3.

### Package ref namespace conflict

Git ref naming prevents `refs/heads/package` from coexisting with `refs/heads/package/native-heavy-frontend-reference`.

To preserve the source before freeing the namespace:

- created `migration-source/native-heavy-frontend-reference` -> `b3b6c4f01729325a789c92a15cc6946e1a97603a`;
- confirmed `migration-backup/20260928/package-native-heavy-frontend-reference` points to the same SHA;
- used one temporary GitHub Actions workflow to verify both protections and delete **only** the conflicting legacy ref;
- workflow run `36405204457` completed with `success`;
- then created the new `package` branch at the parentless root commit above.

The temporary workflow was removed immediately afterward. Final task-branch HEAD after that cleanup is:

- `refactor/repository-standardization-migration` = `054efd2167497049d0c0ef0bd415e520cb39c026`

Its net file tree remains the same product tree as the Phase 2 start; the two commits only added and then removed the temporary ref-swap workflow.

### Docs root rebuild

The live `docs` branch is rebuilt in this Phase as a parentless migration-control root containing only:

- a temporary Phase 2 bootstrap `README.md`;
- the approved migration Plan;
- this cumulative Record;
- the single root `HANDOFF.md`.

The large legacy docs tree remains recoverable from:

- `migration-backup/20260928/docs` -> `37c627e2c57885d395fbd35c832eedca8b112dd1`;
- `migration-backup/20260928/docs-phase1` -> `9c6d57cee05818ff69512ec5941ee8812d6d7c08`.

Legacy content classification and final Governance/Adapter installation remain Phase 3 work.

### Validation

Phase 2 validation:

- `package/plugin/skills` parentless bootstrap commit creation succeeded;
- Package source protection was verified before namespace swap;
- ref-swap workflow run `36405204457` = **success**;
- temporary workflow removed from the task branch;
- no product source, reference content, Package payload, or old docs content was deleted without a preserved exact ref.

No source build/test, Android/device validation, UI validation, or product CI suite was required or claimed.

### Key decisions / plan delta

The only material execution adjustment was the unavoidable Git ref namespace constraint. The Plan now records the temporary `migration-source/native-heavy-frontend-reference` alias and the removal of the old conflicting ref after double protection.

This does not change the target architecture or Package content mapping.

### Next checkpoint

**Phase 3 — Migrate Content and Governance**

Do not start Phase 4 in the same work round. Phase 3 must migrate/classify docs, migrate the Package payload, install final branch-local governance/adapters, establish repository-agent Skill routing, update main-side governance on the task branch, and migrate reference names without reading or contaminating reference contents.
