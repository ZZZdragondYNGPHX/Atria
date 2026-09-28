# Atria Repository Standardization Migration — Implementation Record

Task ID: `refactor/repository-standardization-migration`  
Primary Workspace: `refactor/repository-standardization-migration`  
Status: **Complete — Phase 4 verification / cleanup finished**

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


## Phase 3 — Migrate Content and Governance

### Start state

Phase 3 began from the verified Phase 2 refs:

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- task branch = `054efd2167497049d0c0ef0bd415e520cb39c026`
- `docs` = `f69c3fa1345a65bbce3a1fef8405576b0422d97c`
- `package` = `e4950f5127f39b5be093428786f8af9410fd78bc`
- `plugin` = `7453144395832f3a315f4694649be9af9fe1f9b1`
- `skills` = `087ae0ccb5ecacd48b7490ed0b1d0faaaba44c6e`
- Package source = `migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`

All Phase 1/2 safety refs were rechecked before migration and retained.

### Legacy docs semantic migration

Legacy source remained protected at:

- `migration-backup/20260928/docs@37c627e2c57885d395fbd35c832eedca8b112dd1`
- `migration-backup/20260928/docs-phase1@9c6d57cee05818ff69512ec5941ee8812d6d7c08`

The older docs snapshot contains 245 tracked blobs. Its old root `README.md` was intentionally replaced by the new authoritative Governance; all other **244 / 244** legacy blobs were migrated with their exact original blob SHA.

Final semantic classification:

- **15** legacy blobs -> `plans/**`;
- **229** legacy blobs -> `records/**`;
- **35** legacy handoff documents -> historical `records/**/legacy-handoffs/**`, never live HANDOFF state.

Important mixed-tree decisions:

- old architecture notes and `product-positioning.md` remain Plan/design context;
- `planning/atria-model-prompt-settings/` was split by role: DESIGN/NEXT/router material stays in Plans, while EVIDENCE/IMPLEMENTATION/P2–P8 validation material is Record history;
- `planning/atria-product-frontend-redesign/DESIGN.md` remains the design Plan authority, while the eight completed PHASE documents plus 102 phase evidence images (**110 blobs**) moved to the corresponding Record tree;
- `feat/native-experience-modes-capability-deepening.md` and the Extensions/Skills authoring foundation remain Plans; their completed phase/runtime/UI/invocation/integration documents are Records;
- completed `fix/**`, legacy `features/**`, `fixes/**`, `refactors/**`, `performance/**`, and completed mixed refactor documents are permanent Records;
- the migration task's current Plan / cumulative Record / live HANDOFF from the Phase 1 backup continue in place rather than being duplicated as legacy material.

The docs workspace now contains:

- authoritative `README.md` Repository Governance;
- `AGENTS.md`;
- thin `CLAUDE.md`;
- `WEB-PERSISTENT-PROMPT.md`;
- `plans/**`;
- `records/**`;
- `templates/HANDOFF.md`, `templates/PLAN.md`, `templates/RECORD.md`;
- the one current root `HANDOFF.md`.

Intermediate docs content checkpoint after final semantic reclassification:

- `docs@5467b59cb3dbc889c79504cd8baffb3997b40620`

The final docs closure commit contains this Record/HANDOFF update, so resume work must verify the actual remote `docs` HEAD instead of treating the intermediate SHA above as the current tip.

### Package migration

The 19 Package-specific files under the protected source's `packages/native-heavy-frontend-reference/` were migrated to:

`package:native-heavy-frontend-reference/**`

Every one of the **19 / 19** migrated files was verified to retain the exact source blob SHA.

The workspace also received:

- root `README.md`, `AGENTS.md`, thin `CLAUDE.md`;
- `native-heavy-frontend-reference/README.md`;
- `native-heavy-frontend-reference/releases/README.md`.

No historical `.atria` artifact existed in the audited source, so none was invented. The release mechanism is present and empty of fabricated releases.

Final Phase 3 Package HEAD:

- `package@0f40217ea451b91fdc8327e5a661c813d9d12142`

The Package tree contains no `src/`, `public/`, `android-app/`, `tests/`, `default/`, or product `plugins/` root copied from `main`.

### Plugin and Skills workspaces

`plugin` received only its final workspace governance:

- `README.md`;
- `AGENTS.md`;
- thin `CLAUDE.md`.

No `main:plugins/**` product code was migrated or treated as a standalone tool.

Final Phase 3 Plugin HEAD:

- `plugin@5bbf79fca1c68273f7e2c770ed66d80482dc341b`

`skills` received:

- `README.md`;
- `AGENTS.md`;
- thin `CLAUDE.md`;
- `SKILLS.md`.

`SKILLS.md` records that no repository-agent Skill is currently installed. Atria Runtime Skills under `main:default/skills/**` remain product assets and were not migrated.

Final Phase 3 Skills HEAD:

- `skills@db3410039d22967b7dc440c9b618594e363a864a`

### Main-side local adapter

On the Primary Workspace task branch:

- replaced the old main-side `AGENTS.md` with the standardized local/CLI hot path;
- added thin `CLAUDE.md`;
- updated `FORK_MAINTENANCE.md`, `AI_HANDOFF.md`, `NEW_BUG_PROMPT.md`, `NEW_FEATURE_PROMPT.md`, and root `README.md` to the standardized branch/document routing;
- removed the legacy `docs:handoff/latest-handoff.md` route completely;
- routed governance-sensitive work to `docs:README.md`;
- standardized reference naming to `reference/vanilla` / `reference/luker`;
- retained Atria-specific product/naming/engineering boundaries without copying full Governance into main.

A temporary ref-normalization workflow was added only to perform the Git ref operation, then removed. The final net task-branch tree diff versus unchanged `main` is limited to seven governance/routing files: `AGENTS.md`, `CLAUDE.md`, `FORK_MAINTENANCE.md`, `AI_HANDOFF.md`, `NEW_BUG_PROMPT.md`, `NEW_FEATURE_PROMPT.md`, and `README.md`.

Final Phase 3 task branch HEAD:

- `refactor/repository-standardization-migration@21133b5aa45475b78733d203d43c3dff8107706a`

`main` itself remains unchanged at `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`; Phase 4 owns final task-branch integration.

### Reference name normalization

Created exact-history refs:

- `reference/vanilla` -> `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`;
- `reference/luker` -> `91ae97aed557be9439317a67d0ec516f7512fe2e`.

Both compare `identical` to their original bare-ref commits.

The first temporary normalization workflow run `36407510616` failed because its initial `git push --delete` path required a Git working tree. No design or repository-content change was inferred from that failure. The workflow was corrected to use authenticated GitHub ref API operations directly.

Corrected run:

- `36407675928` = **success**.

After success:

- bare `vanilla` no longer exists;
- bare `luker` no longer exists;
- searches return only their protected `migration-backup/20260928/*` refs plus the new `reference/*` names;
- the temporary workflow was deleted from the task branch;
- no Atria governance files were injected into either reference mirror.

Reference migration used ref identity / exact commit history only; reference file contents were not used as design input.

### Validation

Phase 3 repository-state validation actually performed:

- **docs legacy completeness:** 244 / 244 non-root-README legacy blobs found at their semantically mapped destinations with exact blob SHA; zero mismatches;
- **docs classification:** 15 Plan blobs, 229 Record blobs, including all 35 old handoffs as historical Records;
- **Package completeness:** 19 / 19 Package-specific source blobs matched exactly; zero mismatches;
- **Package boundaries:** no copied product-root directories and no fabricated `.atria`;
- **Plugin boundaries:** only workspace governance files; no product plugin migration;
- **Skills boundaries:** only workspace governance plus `SKILLS.md`; no `default/skills/**` runtime assets;
- **independent roots:** Phase 2 bootstrap roots for `docs`, `package`, `plugin`, and `skills` were each rechecked at parent count **0**; current Phase 3 tips descend only from their respective independent roots;
- **reference history:** both normalized refs compare identical to their original commits; bare names are absent after the successful run;
- **safety refs:** every `migration-backup/20260928/*` protection ref and `migration-source/native-heavy-frontend-reference` rechecked identical to its expected protected SHA;
- **main local adapter:** the seven-file governance/routing diff is isolated from product code; `AGENTS.md` routes governance to `docs:README.md`, thin `CLAUDE.md` points to `AGENTS.md`, and the old `docs:handoff/latest-handoff.md` route is removed from the updated task-branch governance/prompt surface;
- **temporary workflow:** successful ref-normalization run recorded, then workflow removed from the task branch.

No Atria product source behavior changed in Phase 3. No product unit suite, build, Android/Termux device test, Docker test, provider inference, or visual UI validation was required or claimed.

### Plan delta

No substantive target-architecture change was required. The approved Plan remains frozen.

The only execution correction was the temporary ref-normalization workflow implementation: the first deletion mechanism needed a checkout; the corrected API-based implementation succeeded. This does not change the approved reference naming/history policy.

### Phase 3 checkpoint

**Phase 3 is complete. Stop before Phase 4.**

Phase 4 must begin from fresh remote verification and is responsible for final repository-wide verification, integrating the main-side task branch, and only then removing superseded migration/temporary refs and other confirmed obsolete state.

Do **not** clean `migration-backup/20260928/*` or `migration-source/*` before Phase 4 verification.


## Phase 4 — Verification / Cleanup

### Start state

Phase 4 resumed from the Phase 3 checkpoint and first re-verified live remote refs:

- `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`;
- task branch `refactor/repository-standardization-migration@21133b5aa45475b78733d203d43c3dff8107706a`;
- `docs@4e5844d10e817051df3620ff9842fd5e5b8e37f4` initially, then `docs@cdc4e598cbbdaf7323b0fb5ecbd63cbf1664535c` after the Phase 4 CI checkpoint handoff refresh;
- `package@0f40217ea451b91fdc8327e5a661c813d9d12142`;
- `plugin@5bbf79fca1c68273f7e2c770ed66d80482dc341b`;
- `skills@db3410039d22967b7dc440c9b618594e363a864a`;
- `reference/vanilla@e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`;
- `reference/luker@91ae97aed557be9439317a67d0ec516f7512fe2e`.

All migration safety/source refs were still present and exact before any cleanup.

### Final replacement-state verification

Verification was repeated before integration and cleanup.

Docs:

- old protected docs snapshot contains 245 tracked blobs;
- excluding the intentionally replaced old root `README.md`, **244 / 244** legacy blobs exist in current docs at exact blob SHA;
- semantic classification remains **15 Plans / 229 Records**;
- all **35** legacy handoff files remain durable historical Records under `records/**/legacy-handoffs/**`;
- no stale old top-level docs categories remain;
- authoritative Governance, branch-local `AGENTS.md`, thin `CLAUDE.md`, Web adapter, Plan/Record templates and live root HANDOFF lifecycle were all present before final HANDOFF deletion.

Independent roots:

- `docs` bootstrap root `f69c3fa1345a65bbce3a1fef8405576b0422d97c` has zero parents and the current docs history descends from it;
- `package` bootstrap root `e4950f5127f39b5be093428786f8af9410fd78bc` has zero parents and the current package history descends from it;
- `plugin` bootstrap root `7453144395832f3a315f4694649be9af9fe1f9b1` has zero parents and the current plugin history descends from it;
- `skills` bootstrap root `087ae0ccb5ecacd48b7490ed0b1d0faaaba44c6e` has zero parents and the current skills history descends from it.

Workspace boundaries:

- Package top level contains only workspace governance plus `native-heavy-frontend-reference/`;
- no copied product roots such as `src/`, `public/`, `android-app/`, `tests/`, `default/` or product `plugins/` exist in `package`;
- `plugin` contains only `README.md`, `AGENTS.md`, and thin `CLAUDE.md`;
- `skills` contains only `README.md`, `AGENTS.md`, thin `CLAUDE.md`, and `SKILLS.md`;
- Atria runtime `main:default/skills/**` and product `main:plugins/**` remain in main.

Package:

- **19 / 19** Package source files match the protected source at exact path + blob SHA;
- target-only additions are the Package workspace/game `README.md` and `releases/README.md`;
- no historical `.atria` existed in the source and none was fabricated.

References:

- bare `vanilla` and `luker` remained absent;
- `reference/vanilla` remained exactly `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`;
- `reference/luker` remained exactly `91ae97aed557be9439317a67d0ec516f7512fe2e`;
- reference contents were not read during Phase 4.

Main-side task diff:

- the task branch was 12 commits ahead / 0 behind the Phase 4 start main;
- net tree changes remained exactly seven governance/routing files:
  `AGENTS.md`, `AI_HANDOFF.md`, `CLAUDE.md`, `FORK_MAINTENANCE.md`, `NEW_BUG_PROMPT.md`, `NEW_FEATURE_PROMPT.md`, and `README.md`;
- no Atria product feature/source file was changed by the migration branch.

### Integration CI and baseline comparison

Opened PR **#96** — `refactor(repo): standardize repository governance routing`.

PR validation:

- `Atria Migration Guard`: **success**;
- `Lint`: **success**;
- Unit Tests: **1 failed / 10,278 total**;
- Native Model Prompt Runtime integration: **failure**.

The two failures were explicitly compared against the already-current `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b` workflow history before integration.

They were exact baseline failures already present on main:

- PR Unit Tests run `36410078873` failed `native/model-prompt-runtime-p4.test.js` with `Native Package Turn Memory recall requires a Session snapshot`;
- baseline main run `36387441026` failed the same test with the same error and the same 1 failed / 10,277 passed result;
- PR Native Model Prompt Runtime run `36410078927` failed the P2 generation-core guard on `src/native/adapters/generation-host.js`;
- baseline main run `36387417708` failed the same guard on the same file and rule.

Because the migration branch changes none of the implicated product/test files and reproduces no new CI failure relative to the exact main baseline, these were recorded as **pre-existing main failures, not migration regressions**. No unrelated Native product fix was added to this repository-governance migration.

### Main integration

PR #96 was merged with expected head:

- task head: `21133b5aa45475b78733d203d43c3dff8107706a`;
- merge commit / final integrated main: `c697532c6a4d54530de023cd65e4c1721efe97b2`.

Post-merge verification:

- old main `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b` -> integrated main changes exactly the same seven governance/routing files;
- integrated main is one merge commit ahead of the task branch with **zero file differences**;
- no product source change was introduced by the merge.

GitHub automatically deleted the merged task branch `refactor/repository-standardization-migration`.

### Final cleanup

After integrated-main verification passed, an isolated temporary cleanup branch was created from the verified main solely to execute exact-ref cleanup without adding a temporary workflow commit to main:

- temporary branch: `chore/repository-standardization-final-cleanup`;
- cleanup workflow commit: `cf2281e25e007a611b502b932f09bb5829026c37`;
- workflow run: **36413628107 — success**.

The workflow first verified the exact replacement-state SHAs for `main`, `docs`, `package`, `plugin`, `skills`, `reference/vanilla`, and `reference/luker`, and verified the obsolete bare reference names and completed task branch were absent.

Only then it deleted:

- `migration-backup/20260928/main`;
- `migration-backup/20260928/docs`;
- `migration-backup/20260928/docs-phase1`;
- `migration-backup/20260928/package-native-heavy-frontend-reference`;
- `migration-backup/20260928/chore-native-heavy-frontend-phase5-validation`;
- `migration-backup/20260928/vanilla`;
- `migration-backup/20260928/luker`;
- `migration-source/native-heavy-frontend-reference`;
- stale `chore/native-heavy-frontend-phase5-validation`.

The temporary cleanup branch then deleted itself.

### Final branch model

After cleanup the remote branch list contains exactly the intended seven long-lived branches:

- `main@c697532c6a4d54530de023cd65e4c1721efe97b2`;
- `docs` — independent documentation/governance root;
- `package@0f40217ea451b91fdc8327e5a661c813d9d12142`;
- `plugin@5bbf79fca1c68273f7e2c770ed66d80482dc341b`;
- `skills@db3410039d22967b7dc440c9b618594e363a864a`;
- `reference/vanilla@e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`;
- `reference/luker@91ae97aed557be9439317a67d0ec516f7512fe2e`.

No `migration-backup/20260928/*`, `migration-source/*`, stale Native validation branch, completed migration task branch, or cleanup branch remains.

### Final validation / limitations

The repository-standardization migration completion criteria are satisfied:

- standardized long-lived branch model is real;
- docs/package/plugin/skills remain independent roots;
- docs lifecycle and Web/Local adapter separation are normalized;
- migrated documentation and Package source were losslessly verified;
- reference histories/names are preserved exactly;
- all temporary migration protection/source state is removed after replacement-state proof;
- no reference content was read without authorization;
- no Atria product functionality was expanded.

No new product build, Android/Termux/device, provider inference, or visual UI validation is claimed for Phase 4. The two product CI failures observed during PR integration were verified as exact pre-existing failures on the Phase 4 main baseline and are outside this migration's product scope.

### Plan delta

No substantive Plan change occurred in Phase 4. The approved migration architecture remained frozen.

### Completion

**Task `refactor/repository-standardization-migration` is complete.**

The live `docs:HANDOFF.md` is deleted as the final documentation-lifecycle cleanup step; permanent recovery history is this Record.
