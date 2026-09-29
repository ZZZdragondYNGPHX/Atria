# Native Frontend Runtime v3 — Implementation Record

## Task

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Baseline: **Implementation Baseline v1.0**
- Compatibility Strategy: **Hard Cut / Clean Break**
- Current Stage: **Phase 3 — Host Bridge / Data Plane**
- Status: **Completed — Phase 4 ready; stopped at phase boundary**
- Main Baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Task Branch HEAD: `0d6fb049940a7ad460e70ef0badc8fd2412fb439`

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


---

## Phase 2 — Presentation Runtime / Containment

### Checkpoint

- Start HEAD: `3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8`
- End / Tested / Pushed HEAD: `91c45cc3b3a04346f2ac87baa73adb3215ebd6b1`
- Commit: `feat(frontend): implement native v3 presentation runtime and containment`
- Branch: `refactor/native-frontend-runtime-v3`; pushed to the same origin branch.
- Main remains `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Start docs HEAD: `31392d0daf7da87cf90c5a1bcd50df051a386839`.
- User's continuation after the Phase 1 checkpoint authorized Phase 2. Fetched refs and verified clean task/docs working trees before implementation. No rebase/fast-forward was needed because the branch already contained the Phase 1 task commit.
- Implementation Baseline v1.0 unchanged. No architecture review, no reference-branch reads, no Phase 3 implementation, no merge to main or branch deletion.

### Implementation completed

1. Extended the `.aui` semantic contract and compiled Component IR with typed props/emits/slots, closed state schemas, declarative expressions/interactions/lifecycle, bindings, conditions, dynamic style declarations, NodeRefs, keyed lists and virtual windows. Interaction source spans remain linked to semantic IDs.
2. Added CSS AST compilation using `css-tree`: layers, media/container queries, pseudo-elements/classes, custom properties, Grid/Flex, keyframes/transitions, transforms, filters and exact local resource URLs. Extracted local font faces, linked family names to Experience-local identities, and retained exact resource dependency validation. WOFF2/WOFF/TTF/OTF are supported asset types.
3. Added independent artifact checks for props/emits/slots, View targets/default root props, shared/View state conflicts, write paths, lifecycle route recursion, unique NodeRefs and list ownership. Rehashed compiled styles still undergo semantic resource validation.
4. Added `public/scripts/native/frontend/{resources,platform,runtime}.js`: lazy hash-checked compiled resource loading; owned blob/font cleanup; semantic DOM renderer; per-instance ShadowRoots; typed props down/events up and slots; local Component/View/UI/Draft/Prefs state; form dirty/touched/error/busy state; local routing and View history; keyed reconciliation and bounded fixed-height virtualization.
5. Every View mounts inside a Host-owned clipping/containment frame outside the Package stylesheet's ShadowRoot. Package fixed positioning and extreme z-index remain bounded by the assigned surface. Package dialog/popover/browser-top-layer entry points are absent. Overlays use local frames, background inert, initial focus, trap, restore and coordinated Escape.
6. Full Host System Layer keeps Exit, Stop, Save and Diagnostics and gains Reload Presentation. Overlay Escape is coordinated before Full exit. Rendering failures use a Host-owned local failure surface outside Package CSS. Local route and overlay revisions discard stale asynchronous loads and release stale mounts.
7. Added the bounded frame scheduler with cancellation and motion/visibility policy; declared NodeRef geometry, scroll metrics, resize/intersection observers, pointer capture/release and automatic revocation; responsive frame/viewport/pointer/motion/color environment projections and CSS variables.
8. Production v3 dispatch now enters this renderer before the old selector/command path. Its resource transport uses the existing scoped exact Runtime endpoint. Account preferences reuse `createNativeUiStateStorage`; no new persistence authority was introduced. Bridge placeholders remain unavailable and never dispatch through legacy World/command fallback.
9. Studio Preview returns only the owner-checked immutable compiled graph's files and uses the same renderer as Play. Async Preview disposal protects against late mount completion. It does not execute author source or introduce a visual editor.
10. Added authoring notes at `src/native/authoring-examples/frontend-v3/README.md`, a reusable representative fixture, unit/integration tests and a real Edge browser smoke script.

### Decisions and explicit bounds

- Compiler and runtime remain data-only; no arbitrary expressions, callbacks, script execution or raw HTML. Typed local expressions and interaction actions implement Phase 2's interaction baseline.
- CSS network-producing sinks must resolve to exact graph assets or local fragments. CSS imports, external URLs, local-font probes and unresolved/unsafe resource functions fail closed. A discovered escaped `u\72l(...)` function bypass was fixed and regression-tested. SVG escaped resource attributes and case-varied prohibited input types also fail closed.
- Global Package styles are installed into Component ShadowRoots; inline Component styles follow them. Host registers prefixed font families and removes registrations/blob URLs on Experience disposal.
- Component instances are capped at 512, rendered nodes at 20000, route history at 64 and overlays at 8. Lists use unique scalar keys; over 512 items require fixed-height virtualization, with a maximum declared array size of 10000. Existing message schema defaults remain 256; the shared schema validator receives the larger bound only for v3 presentation contracts.
- NodeRefs cannot target repeated nodes in one instance. Repeated child Components have distinct instance IDs and can own their own refs. Observer subscriptions are capped/coalesced, and no NodeRef returns DOM/Host objects.
- Lifecycle routing is rejected to avoid recursive mounts. Local user interactions own navigation. View state survives back navigation; UI/Draft state survives route changes; Component state is per instance; Prefs use existing Host account storage.
- Preview currently transports its bounded exact compiled graph as a base64 bundle. View/Component mounting and parsing remain lazy through the same runtime resource loader; production resource transport fetches exact paths on demand.
- Static CSS is parsed and classified; this is not arbitrary browser execution permission. Unrecognized/unparsed resource syntax is rejected rather than silently passed through.

### Validation actually executed

Local Windows / Node `v24.18.0`, Edge headless via repository Playwright dependency.

- Existing Phase 1 compiler tests remained passing throughout the contract extension.
- Broad Native regression: **97 suites / 1633 tests passed**, FS/SQLite included, using the existing `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1` switches.
- Adjacent game-runtime regression: **50 suites / 492 tests passed**.
- Final focused regression after the last race/contract/Preview refinements: **8 suites / 271 tests passed** (`frontend-presentation`, `frontend-v3`, `studio-service`, `runtime-http`, `studio-preview-experience`, `ui-live`, `ui-full-host`, `message-templates`).
- Real browser `node tests/frontend/native-frontend-v3.smoke.mjs`: **6 scenarios passed**, Component/Hybrid/Full at **1440px and 390px**. Verified font registration/removal, typed local state, independent component state and emits/slots, form edits/submission, Prefs adapter, overlay initial/trap/restore/Escape, View back-state retention, NodeRef resize and real pointer capture, keyed node identity across reorder, 1000-row virtualization, Host control hit testing under hostile fixed/z-index styles, recovery, Preview parity and final cleanup. No page errors or runtime diagnostics. Inspected the rendered mobile Full screenshot. Screenshots are local evidence under `.git/frontend-v3-evidence/`, not committed artifacts.
- Full root `npm run lint`: passed. Final changed-file and test ESLint: passed.
- `node docker/build-lib.js`: webpack build passed, including the final tree.
- `git diff --check`: passed. Temporary task log files removed after recording results.
- No remote CI, Android/Termux/physical-device, MySQL/PostgreSQL, non-Edge browser or production-session end-to-end claim. Production dispatcher/resource integration is additionally covered by unit/HTTP tests; browser acceptance uses deterministic compiled fixtures.

### Remaining scope / next checkpoint

Phase 2 acceptance is complete. **Stop before Phase 3.**

Phase 3 is **Host Bridge / Data Plane** per the Plan: Frontend Host Bridge v1, Experience Binding Registry, scoped Component uses, snapshot and Collection Reads/cursors, Actions/Operations, unified Receipt/Error, idempotency/revision guards, Experience Epoch/stale revocation and fixed prefs/environment projections. Existing descriptor binding placeholders are compile-time only; local route load revisions are not authority epochs.

No Headless Conversation, Session/Prose expansion, Remote Media, Localization/IME runtime, Script VM, Canvas or Studio visual editor was implemented here. Existing installed v1/v2 code remains only for the scheduled Phase 9 removal. Do not turn that temporary retention into compatibility or migration scope.

`HANDOFF.md` contains the direct-copy Phase 3 prompt and the tested checkpoint. Continue only on the next user instruction.


## Phase 3 — Host Bridge / Data Plane

### Checkpoint

- Date: **2026-09-29**.
- Start HEAD: `91c45cc3b3a04346f2ac87baa73adb3215ebd6b1`.
- End / Tested / Pushed HEAD: `0d6fb049940a7ad460e70ef0badc8fd2412fb439`.
- Start docs HEAD: `3a1f9c799159098c6c10608e14c3df46d9c3c12c`.
- Main baseline remains `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Status: **Phase 3 complete. Phase 4 is not started.**
- Implementation Baseline v1.0 unchanged; no Gap Review, reference-branch reads,
  v1/v2 migration, merge to main or task-branch deletion.

### Actual local start and execution

The configured checkout directory was empty, not a Git repository. The remote
refs exactly matched the supplied Phase 2 and main HEADs. A separate old local
copy had unrelated dirty changes and a deleted-branch fetch restriction; its
files/configuration were not modified. The existing remote task branch was
cloned into the empty directory and fetched/pruned before implementation. No
existing task commit was reset or discarded. A separate worktree tracks the
existing `docs` branch; product and document histories remain isolated.

The clone lacked commit identity. Repository-local identity was set to the same
account/noreply identity already used by the Phase 1/2 commits; global Git
configuration was not changed.

### Implementation completed

- `src/native/frontend/bridge.js` compiles and revalidates the versioned Registry:
  stable IDs, public input/output schemas, target contract/schema digests,
  identity or field/constant-only input mapping, source adapter, requirements,
  receipt and idempotency policy. Required mapped arguments cannot originate
  from optional input fields. Operation output is the exact selected Task
  variant schema; a void Application command returns an actual Receipt with
  an empty public data payload, not an authority snapshot.
- `public/shared/native-frontend-bridge.js` defines shared data/schema validation,
  mapping, deterministic Collection projection, descriptor identity and unified
  Receipt/Error validation. Browser/server/Preview do not define alternate
  binding semantics or expose raw services.
- `src/native/frontend/host-bridge.js` opens an authenticated, installed-graph
  Experience Registry and validates Component `uses` on every binding call.
  `/api/native/session/frontend/{open,request,close}` returns private/no-store
  versioned receipts; user-supplied descriptors, targets, unknown bindings and
  incorrect scopes are rejected. Generation Host construction is lazy and only
  reached after the declared Operation target has been authorized.
- Snapshot and Collection sources are exact Package Data assets or the existing
  `projectApplication` service. Application items expose only `{id,value}` under
  the declared schema. Collections have bounded pages, unique ascending scalar
  ordering, declared equality filters/literal search and opaque cursor tokens
  bound to binding/query/revision/order/Epoch. No raw database query adapter.
- Actions call `SessionCore.applyLifecycleCommand` with typed Application args,
  CAS revision and a Host-generated scoped invocation identity. Concurrent same
  key requests share one result; changed input/method/revision under the same
  idempotency key fails. Authority state changes return through Read projections.
- Operations call the existing `NativeGenerationHost.executeTask`; saved Host
  Task slot bindings choose routes. Existing Task scheduler/provider/secret,
  retries, cancellation and finalization remain authoritative. Public status is
  queued/running/progress/completed/failed/cancelled, with only schema-checked
  completed Task output exposed. Lifecycle-intent-required Tasks cannot bypass
  that target's checks. No raw provider stream or snapshot becomes public data.
- `public/scripts/native/frontend/bridge.js` provides the single compiled scoped
  handle API for declarative callers and future Script transports. It validates
  opening descriptor identity and every receipt, enforces input/output schemas,
  exposes copied fixed Prefs/environment projections and revokes stale queries,
  pending requests, subscriptions and Operation observers. No Script VM added.
- Compiler inference covers bridge interactions. Runtime supports snapshot
  shorthand/subscriptions, Collection page/cursor interactions, Action/Operation
  calls and read-only `bridge.<bindingId>` result state. Typed object expressions
  construct public inputs; namespaced result paths resolve the longest declared
  binding identity. Local array rendering distinguishes no page from stale data.
- Experience Epoch is separate from local route revision. SessionCore emits
  invalidation after branch publication and on a no-op restore. Reload/disposal
  revoke the Experience; late completions and superseded opens cannot repopulate
  it. Recovery remounts Component/View state and reloads declared Prefs through
  the existing Host account adapter. Presentation-only mounts also recover
  correctly without creating a transport or legacy authority fallback.
- Studio Preview adds immutable, owner-checked read projections, sharing the
  compiled client/schema/query semantics. Package Data uses exact Preview assets;
  Application collections start empty. Writes return `bridge_preview_readonly`,
  not a parallel simulated authority. Play invokes the installed Registry.
- Authoring syntax and limits are documented in
  `src/native/authoring-examples/frontend-v3/README.md`.

### Decisions / bounded behavior

- Current adapters deliberately target existing Package Data, Application
  projections/commands and declared Model Tasks. Conversation, Session and Prose
  services are the next phase, not hidden legacy dispatch paths in this one.
- Read subscriptions and Operation observers poll formal Host projections at a
  bounded cadence. No new durable state, authority repository or event bus was
  added. Bridge receipt/cursor caches are transient, with process restarts
  invalidating tokens instead of restoring stale handles.
- Limits: 128 active Experiences per service, 30-minute token lifetime, 256 write
  receipt keys, 512 cursors and 64 Operations per Experience; 64 read
  subscriptions and 64 Operation observers per Component. Collections are at
  most 10000 source items and 256 items/page. Exhaustion fails closed; concurrent
  opens recheck the retention cap after asynchronous package loading.
- Idempotency keys are scoped to Epoch + binding. A new Epoch does not silently
  replay a revoked handle or rebase its old revision. Already accepted short
  transactions are not rolled back by presentation cancellation; late UI
  delivery is discarded and the replacement Experience rereads authority.
- No optional fixed Host service is user-registerable. Prefs retain the existing
  account persistence adapter; environment retains the Phase 2 Host projection.
- Test/build outputs, native dependencies and screenshots were not committed.

### Validation actually executed

Local Windows, **Node v24.16.0**, real **Edge headless** through the repository's
Playwright dependency. No remote CI claim.

- New Bridge boundary/client tests: **27 tests**, including real FS-backed
  SessionCore commits, schema/mapping/digest/version rejection, Component scopes,
  idempotency and CAS, Collection cursor/query/revision guards, typed Task output,
  Operation cancel/replay, non-cooperative late completion, restore/switch/reload,
  superseded opens, unsubscribe races, immutable fixed projections and Preview.
- Native regression: **all 99 distinct suites passed across resumed batches**.
  The first post-dependency-repair run completed 43 suites before a user/client
  interruption stopped the process without a Jest aggregate. Those successful
  suites were preserved as evidence; only the remaining 56 suites were run
  again (**56 suites / 499 tests passed**, JSON results recorded locally).
  The two path sets were checked for no overlap and complete 99-suite coverage.
  FS/SQLite included; existing `ATRIA_DISABLE_MYSQL_TESTS=1` and
  `ATRIA_DISABLE_POSTGRES_TESTS=1` switches excluded external DBs.
- Initial Native regression exposed a fresh-clone dependency problem, not a
  claimed pass: `.npmrc` intentionally disables dependency install scripts, so
  `better-sqlite3` had no native binding. Only that locked dependency was rebuilt
  with scripts explicitly enabled, and an in-memory `select 1` succeeded. The
  repository npm policy/configuration was not changed. Verification resumed only
  after the repair; the failing pre-repair run is not completion evidence.
- Adjacent game-runtime: **50 suites / 492 tests passed**.
- Final focused regression after the final epoch/recovery refinements:
  **11 suites / 307 tests passed** (`frontend-bridge-client`, `frontend-bridge`,
  `frontend-v3`, `frontend-presentation`, `studio-service`, `runtime-http`,
  `session-runtime-http`, `studio-preview-experience`, `ui-live`, `ui-full-host`,
  `message-templates`).
- `node tests/frontend/native-frontend-bridge.smoke.mjs`: **6 scenarios passed**,
  Component/Hybrid/Full at 1440px and 390px. Real local SessionCore-backed typed
  Action, snapshot subscription refresh, two-page Collection, recovery/rebind,
  draft reset, Preview read-only errors and cleanup; no page errors/diagnostics.
  The harness uses a deterministic local owner/service transport. Production
  authenticated router behavior is separately covered by HTTP tests.
- `node tests/frontend/native-frontend-v3.smoke.mjs`: **6 scenarios passed** at the
  same layouts/sizes, preserving Phase 2 state/components/fonts/forms/overlays,
  NodeRef/virtualization/containment/Full controls/Preview/disposal behavior.
  This caught and regression-tested a presentation-only reload revocation bug.
- Inspected the rendered mobile Full Bridge screenshot. Screenshots remain
  local under `.git/frontend-v3-bridge-evidence/` and `.git/frontend-v3-evidence/`.
- Full root `npm run lint`: passed; final changed-code/test ESLint: passed.
- Final `node docker/build-lib.js`: webpack compiled successfully.
- Staged and working-tree `git diff --check`: passed.
- New Operation boundary tests use deterministic Generation Host doubles; the
  existing Native generation/scheduler tests also remain in the regression.
  No new real-provider/secret/network end-to-end claim, production-user Session,
  remote CI, physical device, Android/Termux, MySQL/PostgreSQL or non-Edge claim.

### Remaining scope / next checkpoint

**Phase 3 acceptance is complete. Stop before Phase 4.**

Phase 4 is **Conversation / Session / Prose**, using the Plan's own section:
Managed/Headless Conversation and Composer parity, committed message collection,
GenerationProjection, reply alternative/branch controls, fixed composer /
conversation / session services, Safe Prose AST, Message Block integration,
save/reload/recovery/diagnostics and Host Failure Surface. Streaming must not
become committed Timeline; retry/fork/switch/save/restore require revision guards;
raw HTML must not enter Prose.

No Phase 4+ implementation was started. Remote Media, Localization/IME, Script
VM/Canvas and Studio visual editing remain later phases. Hard Cut remains
approved; temporary v1/v2 retention is still scheduled for Phase 9 removal, not
compatibility or migration scope. `HANDOFF.md` holds the Phase 4 takeover prompt.
