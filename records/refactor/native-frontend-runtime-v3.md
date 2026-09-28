# Native Frontend Runtime v3 — Implementation Record

## Task

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Baseline: **Implementation Baseline v1.0**
- Compatibility Strategy: **Hard Cut / Clean Break**
- Current Stage: **Phase 1 — Contract Reset / Compiler Skeleton**
- Status: **Completed — Phase 2 ready; stopped at phase boundary**
- Main Baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Task Branch HEAD: `3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8`

This Record is the permanent implementation history for the multi-stage Native Frontend v3 refactor. Each completed Phase must append/update its checkpoint here; do not create a separate Record per Phase.

---

## Phase 0 — Implementation Preparation

### Start state

Architecture discussion completed through two Gap Reviews and a Baseline Gate.

Frozen Plan commit:

`a7c56158f26c4e9c0beebb0c25fb2aa68370bf5e`

The Baseline establishes:

- Package owns presentation; Host owns capabilities and authority.
- Native Frontend v3 becomes the only formal non-Text Native UI runtime.
- No v1/v2 migration or long-lived compatibility path.
- Authoring Source Graph → Compiler → Canonical Runtime Graph.
- Atria-owned `.aui` SFC-like authoring.
- Visual containment + Host System/Escape Layer.
- Typed Frontend Host Bridge v1.
- Reads / Actions / Operations Binding Registry.
- Managed + Headless Conversation / Composer.
- Safe Prose AST.
- Bounded Collection Read.
- Local/Remote MediaRef and Remote Media permission model.
- Localization / IME / Accessibility / Error Boundaries.
- Optional Script Sandbox + Canvas2D command buffer.
- Frame Scheduler and bounded NodeRef measurement/observers.

### Preparation completed

- Re-read current `main:AGENTS.md`.
- Re-read full `docs:README.md` Repository Governance.
- Re-verified real remote refs before implementation:
  - `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
  - `docs@7d86e72fdc55e544cfc2b17b867f28c2af32bfdd` before preparation writes.
- Created the task branch from the exact current main baseline:
  - `refactor/native-frontend-runtime-v3@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- No product code changes were made.
- No Phase 1 implementation work was started.
- No tests/CI were run because this checkpoint only creates implementation scaffolding and documentation state.

### Phase 1 next target

**Phase 1 — Contract Reset / Compiler Skeleton**

Authoritative scope and acceptance criteria are in the Plan.

Phase 1 should begin by re-checking real remote refs and then reading:

1. `main:AGENTS.md`
2. `docs:README.md`
3. `docs:HANDOFF.md`
4. `docs:plans/refactor/native-frontend-runtime-v3.md`
5. `docs:records/refactor/native-frontend-runtime-v3.md`

Then work only on `refactor/native-frontend-runtime-v3`.

Phase 1 must not begin Phase 2 work.

### Stop condition after Phase 1

After Phase 1 implementation + validation:

- push the Phase 1 tested HEAD;
- update this Record with Start HEAD / End/Tested HEAD / verification / decisions / known limits;
- update `docs:HANDOFF.md`;
- produce a direct Phase 2 handoff prompt;
- stop and wait for the user to continue.

---

## Phase 1 — Contract Reset / Compiler Skeleton

### Checkpoint

- Start HEAD: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- End / Tested HEAD: `3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8`
- Remote: `origin/refactor/native-frontend-runtime-v3` pushed successfully.
- Main remains `191f9f951ccb23cd11d8951e539b8ff6eb8316db`; no merge or branch deletion at this intermediate checkpoint.
- Implementation Baseline v1.0 unchanged. No new architecture review and no Phase 2 implementation.

### Actual start state

The supplied local `D:\Dev\Atria` directory was empty, so the initial fetch could not run there. Cloned the requested repository into that empty directory, then successfully ran `git fetch --all --prune`. The adjacent old docs checkout had invalid Git metadata and was left untouched. Main and the existing remote task branch both matched the recorded baseline; no fast-forward was necessary. A managed, isolated worktree was used for the existing `docs` branch.

The fresh clone lacked a Git author identity. Repository-local identity was restored from the consistent existing main/docs commit history using the maintainer's existing GitHub noreply identity; no global Git settings were changed.

### Implementation completed

1. Added `public/shared/native-frontend-contract.js` with strict native@3 Experience, Source Index, Feature declarations, paths/IDs and budgets. Authoring requires `frontend.source`; installed manifests require `frontend.entry`. Project Source rejects the legacy `componentModelVersion/component/selectors/surface` authoring shape.
2. Added the formal compiler under `src/native/frontend/`: `.aui` parser/CST/semantic AST, Component IR, View IR, styles, Bridge linker, exact resource graph and independent artifact validation.
3. CST preserves the original text and block offsets. Explicit `node-id` and Source Index component IDs preserve semantic identity across formatting changes. Provenance records source digests, component/node/interaction/style spans and Bridge source identity. CSS and Component validation errors identify their source file; CSS diagnostics expose a structured span.
4. Exact graph resources carry logical ID, kind, content hash, size, MIME type, hash-addressed path and exact dependency list. Validation checks byte integrity, IR shape, semantic references, binding kind/scope, graph cycles, budgets and closure. Rehashing malicious IR does not bypass validation.
5. Compiled Bridge Descriptor v1 links Reads to existing Package Data, Actions to existing Lifecycle commands and Operations to existing Model Tasks. It materializes target/schema digests, identity mapping, empty extension requirements, receipt/idempotency policy metadata, and validates declared Read output against the actual exact Package Data bytes. No Bridge invocation runtime was added.
6. `buildProjectPackage` compiles before producing the installed manifest; Studio Preview and Studio Agent Review already call this same Build path. Source is not modified. Consumed Frontend author files are replaced in build output with compiled artifacts. EntryPoint overrides receive independent output namespaces.
7. Package container build and inspection validate v3 graphs; install and reopen do not compile author source. Runtime resolution validates the compiled graph. The existing HTTP resource endpoint restricts native@3 to that exact graph plus existing declared game resources. Optional bundled author/remix files cannot be requested through this Runtime path.
8. Required unimplemented Frontend Features fail closed during Package validation/Runtime negotiation; optional features project `unsupported` with stable `frontend_feature_not_implemented` reason codes.
9. Added a minimal executable authoring example at `src/native/authoring-examples/frontend-v3/` and curated API catalog entries for the new contracts, parser and Bridge linker. Updated two old authoring regression fixtures to the approved v3 hard cut.

### Minimal Phase 1 authoring syntax and decisions

- `frontend.json`: `format: atria-frontend-source`, `version: 3`, `primaryView`, `views[{id,root,surface}]`, `components[{id,source}]`; optional `styles`, `assets`, `bridge`. Resource source paths resolve relative to the Source Index.
- `.aui`: exactly one `<template>` with one root element; optional `<contract>` containing strict JSON `uses`, and optional `<style>`. Comments/raw source are preserved in CST. Each element has an explicit `node-id`.
- Minimal declarative links: `<component node-id="card" ref="Card" />`, `read="bindingId"`, `on:click="actionId"`, `<img node-id="portrait" asset="portrait" />`. Uses are inferred and checked against the Experience registry.
- Static CSS resource references use `url("resource:assetId")`; raw URLs/imports/executable CSS, inline style strings and unsupported escapes fail closed. The conservative parser is a skeleton, not the complete Phase 2 CSS pipeline.
- Deterministic canonical JSON and SHA-256 are used for artifacts. Generated paths use the Package/default or EntryPoint namespace, not the author source path as Runtime identity. Source paths remain provenance.
- The existing container's `source/` payload storage namespace is retained as physical transport; native@3 execution authority is the compiled `runtime/frontend/...` graph. No new persistence authority or separate compiler for Preview was introduced.
- Existing v1/v2 installed-runtime code remains temporarily for the explicitly scheduled Phase 9 removal. It is not an authoring compatibility path, and v3 artifacts never lower to or execute through it.

### Validation actually executed

Environment: local Windows, Node `v24.18.0`; clean dependency installs using `npm ci --ignore-scripts --no-audit --no-fund` in root and `tests`. Rebuilt the local `better-sqlite3` binding and verified an in-memory SQLite connection.

- Initial focused regressions: 41/42 passed; fixed the new test's incorrect use of ProjectStore.save instead of create. The corrected v3 suite passed.
- Initial broad run was interrupted after absent MySQL/PostgreSQL services and the initially unbuilt SQLite binding caused environment failures. No external DB success is claimed.
- Broad Native regression with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`: **96 suites / 1602 tests passed**, including FS/SQLite, Session, lifecycle, HTTP, package, Studio, and authority-adjacent tests. Two v2 authoring fixtures found by the earlier run were updated and passed.
- After the final diagnostic/Feature validation refinements, focused final verification: **8 suites / 62 tests passed** (`frontend-v3`, `runtime-http`, `studio-service`, `bundled-authoring-skills`, `package-build-install`, `package-container`, `runtime-descriptor`, `studio-preview-experience`).
- Full `npm run lint`: passed. Final targeted ESLint across all changed JS/test files: passed.
- `node docker/build-lib.js`: webpack frontend library build passed. Generated binaries/cache were not committed.
- `git diff --check`: passed. Temporary task test logs removed.
- No remote CI, Android/Termux, browser rendering, MySQL or PostgreSQL validation was performed. Phase 1 has no new visual renderer to claim as browser-verified.

Coverage includes deterministic graph generation, CST/source spans, all three layout modes through real Build/Preview/install/reopen, source-vs-installed schema separation, typed targets and schema mismatch, forged digest/mapping, malicious rehashed IR, cycles/missing refs, script/style/source rejection, required/optional Features, immutable Preview, entry overrides, and real HTTP denial of author-source reads.

### Remaining items and Phase 2 target

Phase 1 acceptance is complete. The compiler intentionally rejects syntax outside its documented subset instead of silently passing it through.

Phase 2 is **Presentation Runtime / Containment**: semantic DOM renderer, complete CSS/font pipeline, ShadowRoot + containment, props/emits/slots, View mount/lazy loading, scoped state, interactions, overlays/FocusScope, routing/forms, Frame Scheduler, NodeRef and responsive environment per Plan. There is no v3 visual renderer yet; Build/Preview currently deliver validated compiled artifacts.

The Bridge descriptor remains a compile-time skeleton: identity-only mapping, closed empty Action/Operation response payload schema and receipt-policy metadata; executable receipts, collection reads, scoped handles, epoch/idempotency behavior and complete mapping belong to Phase 3. Controllers/TS, localization, media runtime, Canvas and the other later-phase features are not implemented. Full Studio controls/visual editor and bundled authoring skill migration remain in their scheduled phases; legacy Studio UI controls are not a supported v3 authoring path.

Use `HANDOFF.md` for the direct-copy Phase 2 prompt. Stop after this checkpoint; Phase 2 requires the next explicit user instruction.

