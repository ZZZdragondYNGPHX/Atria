# Atria Repository Standardization Migration — Implementation Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Phase 1 — Audit / Mapping / Safety

### Start state

Atria refs at audit start:

- `main` = `86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`
- `docs` = `37c627e2c57885d395fbd35c832eedca8b112dd1`
- `package/native-heavy-frontend-reference` = `b3b6c4f01729325a789c92a15cc6946e1a97603a`
- `vanilla` = `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`
- `luker` = `91ae97aed557be9439317a67d0ec516f7512fe2e`

No long-lived `package`, `plugin`, `skills`, or `reference/*` branches existed at Phase 1 start.

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
- No tracked `.atria` artifact was found in the audited current main/docs/Package trees.
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

### Key decisions / plan delta

The only material execution adjustment was the unavoidable Git ref namespace constraint. The Plan now records the temporary `migration-source/native-heavy-frontend-reference` alias and the removal of the old conflicting ref after double protection.

This does not change the target architecture or Package content mapping.

### Next checkpoint

**Phase 3 — Migrate Content and Governance**

Do not start Phase 4 in the same work round. Phase 3 must migrate/classify docs, migrate the Package payload, install final branch-local governance/adapters, establish repository-agent Skill routing, update main-side governance on the task branch, and migrate reference names without reading or contaminating reference contents.

## Phase 3 — Migrate Content and Governance

### Start state

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

### Package migration

The 19 Package-specific files under the protected source's `packages/native-heavy-frontend-reference/` were migrated to:

`package:native-heavy-frontend-reference/**`

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

### Plan delta

No substantive target-architecture change was required. The approved Plan remains frozen.

The only execution correction was the temporary ref-normalization workflow implementation: the first deletion mechanism needed a checkout; the corrected API-based implementation succeeded. This does not change the approved reference naming/history policy.

### Phase 3 checkpoint

**Phase 3 is complete. Stop before Phase 4.**
