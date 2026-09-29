# Native Frontend Runtime v3 — Implementation Record

## Task

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Baseline: **Implementation Baseline v1.0**
- Compatibility Strategy: **Hard Cut / Clean Break**
- Current Stage: **Phase 9 — Legacy Removal / Regression / Finalize**
- Status: **Implementation pushed; final regression / CI / integration in progress**
- Main Baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Task Branch HEAD: `06b8f4e5ab0d7f03eb4d42cd6b4a44df0467d1eb`

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


## Phase 4 — Conversation / Session / Prose

### Checkpoint

- Date: **2026-09-29**.
- Start HEAD: `0d6fb049940a7ad460e70ef0badc8fd2412fb439`.
- End / Tested / Pushed HEAD: `d96bb5cfcf7690a382961058873c183e965d7298`.
- Start docs HEAD: `b588ba994b34357065cd60e94e3031e1ce4648a7`.
- Main baseline unchanged: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Status: **Phase 4 complete. Phase 5 is not started.**
- Implementation Baseline v1.0 unchanged; no Gap Review, reference reads,
  compatibility/migration, main merge or branch cleanup.

### Actual start

Ran `git fetch --all --prune` before inspecting refs. The product and existing
`native-v3-docs` worktrees were clean, each one commit behind origin. Fast-forwarded
the existing task branch and docs worktree to their Phase 3 remote commits.
No task commit was reset to main and no unrelated checkout was modified. Read
AGENTS, complete Governance, live HANDOFF, frozen Plan and this same Record.

### Implementation

1. Added a closed, shared fixed Host catalogue in
   `public/shared/native-frontend-host.js`. Compiler and installed graph checks
   resolve `host.composer`, `host.conversation` and `host.session` targets against
   exact kinds/input/output schemas and existing scoped Bridge descriptors.
   There is no arbitrary service-method dispatch or raw database adapter.
2. Added SessionCore-backed fixed-service adapters in
   `src/native/frontend/host-services.js`: committed messages, exact inspection,
   branch lineage, reply alternatives, status/tail, SavePoint listing/creation,
   retry/fork/switch/restore. Replies share a predecessor across committed branch
   lineage; no mutable Swipe/Variant semantics were introduced. Collections
   reuse bounded filtering/order/pages and opaque cursors. Cursor identity now
   also fingerprints the source projection, covering SavePoint changes that do
   not publish a Session revision.
3. Browser-local fixed services require server authorization of the installed
   Component scope/schema/revision before invoking the existing Host adapter.
   Local actions use bounded Epoch/binding-scoped idempotency receipts; mapped
   input and public results retain Bridge validation. Preview remains read-only.
4. Managed Play now consumes shared Headless message/Message Block projections
   and the same Composer contract. Package-owned Full/Hybrid DOM uses normal
   Bridge reads, keyed Components and CSS without Host message DOM selectors.
   Composer get/set/append/clear/focus/submit and generation cancel/regenerate
   reuse the existing Native generation entrypoint and Task scheduler.
5. GenerationProjection is ephemeral: idle/preparing/streaming/finalizing/
   cancelling/failed, bounded provisional text and a public failure code. Managed
   streaming lives outside committed message nodes. Late chunks after completion
   or branch change are discarded. Committed messages arrive via Collection Read.
   Typed cancellation remains usable while a submit interaction is awaiting its
   generation, without generally enabling concurrent form submissions.
6. Save/retry/fork/switch/restore have exact revision guards. Full Host Save now
   propagates its revision through Product/SaveSystem into SessionCore. SavePoint
   references the guarded immutable revision. Branch/restore/reload recovery
   revokes handles and remounts presentation. `synchronizeFrontendEpoch` reloads
   the existing Managed runtime after a server-side branch change, stops obsolete
   generation and discards its Draft without persisting it on the new branch.
   Same-branch active generation is not stopped just to reload presentation.
7. Added `public/shared/native-safe-prose.js`: deterministic bounded canonical
   text-to-AST mapping with exact source ranges, paragraph/break/emphasis/strong/
   heading/quote/list/code/pre/link/semantic-mark nodes. Validation recomputes the
   exact mapping. `bind:prose` expands inert semantic DOM inside Package ownership;
   raw HTML remains literal text. Safe links pass through a shared Host external
   navigation policy with confirmation and no package-owned href/opener.
8. Message Blocks remain separate typed immutable projection entries. Compiled
   `host.conversation.blocks` targets pin each block type's closed data schema;
   SessionCore validates it at commit/load. Unknown types/extra fields fail.
   Block collections expose typed data and message/flow anchors for normal
   Package Components and separately declared guarded actions. Managed Play
   provides inert semantic cards; custom card presentation remains Package-owned.
9. Host Failure Surface includes reload plus configured stop/diagnostics/exit
   actions outside Package CSS. Failed rebind after disposing old Views retains
   an independent Host retry panel. Session status/diagnostics/recover/exit are
   fixed targets; restart is policy-denied unless the Host explicitly provides
   both confirmation and restart handlers.
10. Expanded authoring notes and added executable Conversation fixtures, boundary
    tests, Safe Prose tests, Managed/Epoch regressions and a real Edge smoke script.

### Decisions and bounds

- Fixed capabilities are declared typed targets, not a global Host object or a
  second binding interpreter. Existing Application/Task Lifecycle intent checks
  are unchanged. Only the newly authorized fixed adapter extends read sources.
- No new durable authority, Timeline store, scheduler or provider transport.
  `projectConversation`/`projectMessageBlocks` are inert downstream projections.
- Local Composer/Generation control is authorized by the installed server scope
  and then handled by the existing browser Host. Server-only invocation of those
  targets fails closed. No fabricated remote generation state is returned.
- Collection subscriptions refresh the first page on committed revision changes;
  explicit cursors navigate later pages. Local Generation/Draft and SavePoint
  observations reuse bounded polling. Packages own page-navigation presentation.
- Prose supports a deliberately bounded Markdown-like subset, not arbitrary
  Markdown/HTML: 65536 source characters, 4096 nodes and bounded inline nesting.
  It does not mutate canonical content or absorb Message Blocks.
- Message Block schemas are pinned by the exact compiled blocks binding; custom
  Component props still undergo their own declared schema checks. Block content
  does not manufacture commands. Managed fallback cards are inert.
- Missing fixed Preview projections return `bridge_projection_unavailable`;
  Preview writes return `bridge_preview_readonly`. No fake Session authority.
- Restart capability is explicitly policy-denied by default. This is the Plan's
  Host-policy boundary, not an automatic Session reset implementation.
- Local route revision remains distinct from authority Experience Epoch.

### Validation actually executed

Local Windows, **Node v24.18.0** (read from the current environment; Phase 3's
recorded version was v24.16.0), **Edge headless**. FS and SQLite included; existing
`ATRIA_DISABLE_MYSQL_TESTS=1` / `ATRIA_DISABLE_POSTGRES_TESTS=1` excluded external DBs.

- Broad Native run: **101 suites / 1671 tests passed**. This preceded the last
  Managed Epoch synchronization/cancellation refinements, which received the
  final focused verification below; do not label that earlier broad count as a
  fresh full-suite run after every last edit.
- Adjacent game-runtime + atria-shell: **105 suites / 730 tests passed**.
- Final tested-tree focused run: **8 suites / 157 tests passed**:
  `session-projection`, `frontend-conversation`, `frontend-prose`,
  `frontend-presentation`, `model-prompt-runtime-p4`, `frontend-bridge-client`,
  `frontend-bridge`, `native-play-product`.
- New fixed-service tests use real FS-backed SessionCore: committed pagination,
  schema/scope/CAS/idempotency, no-op restore Epoch revocation, retry alternatives,
  branch switch/inspect/fork, SavePoint, and block commit/load rejection. Added
  Managed synchronization regression runs against both FS and SQLite.
- `node tests/frontend/native-frontend-conversation.smoke.mjs`: **6 scenarios**,
  Component/Hybrid/Full at 1440px and 390px, passed on the final tree. Validates
  Package-owned Conversation without Host message nodes, separate streaming,
  semantic Prose/literal HTML, typed Message Blocks, exact SavePoint, cancellation
  during pending submit, rebind/recovery, injected recovery failure with usable
  Host retry surface, Preview read-only behavior and disposal. No page errors or
  unexpected diagnostics. Inspected the mobile Full screenshot.
- Existing Bridge and presentation Edge scripts: **6 + 6 scenarios passed**,
  preserving Phase 2/3 rendering, containment, controls, data-plane and Preview.
- Full root lint passed after fixing formatting findings; final changed-code/test
  lint passed. Final `node docker/build-lib.js` webpack build passed.
- Working-tree/staged `git diff --check` passed. Temporary log/JSON test outputs
  removed after recording totals; local screenshots stay under `.git/` only.
- Generation boundary tests use deterministic local HTTP fixtures/doubles; browser
  provisional generation/submit/cancel use a deterministic Host adapter. No new
  real-provider E2E, remote CI, production-user Session, physical device,
  Android/Termux, MySQL/PostgreSQL or non-Edge browser claim.

### Remaining scope / next checkpoint

**Phase 4 acceptance is complete. Stop before Phase 5.**

Phase 5 is **Media / Localization / Input / Accessibility / Boundaries**. Its Plan
section alone defines scope: Frontend Media Catalog, exact audio/video/image,
Remote/HostIssued MediaRef resolver/cache/fallback/privacy, localization/RTL,
IME Composition Lock, VisualViewport/keyboard inset, accessibility projections
and Error/Loading Boundaries. No Phase 5+ code was started. No Script VM, Canvas,
Studio visual editing or Phase 9 cleanup was pulled forward. HANDOFF contains
current refs and the direct-copy Phase 5 takeover prompt.


## Phase 5 — Media / Localization / Input / Accessibility / Boundaries

### Checkpoint

- Date: **2026-09-29**.
- Start HEAD: `d96bb5cfcf7690a382961058873c183e965d7298`.
- End / Tested / Pushed HEAD: `cfe7ee99aa96bba7d351f95fea05a8bc4264f42a`.
- Start docs HEAD: `b0d20b79f6ce1024a7858eec8ea2025bdfcb18d5`.
- Main baseline unchanged: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Status: **Phase 5 complete. Stop before Phase 6.**
- Implementation Baseline v1.0 unchanged. No Gap Review, reference reads,
  compatibility/migration, main merge, new long-lived workspace or branch cleanup.

### Actual start

Ran `git fetch --all --prune`; task/main/docs refs matched the supplied checkpoint
and their remote tracking refs. The product worktree and existing `native-v3-docs`
worktree were clean. Continued the same task branch and docs checkout, without
resetting or creating another worktree. Read local instructions, full Governance,
live HANDOFF, frozen Plan and the existing Record.

### Implementation and decisions

1. Added shared closed Media Catalog / MediaRef contracts. Compiler emits exact
   media/localization/diagnostic resources and installation revalidates the graph,
   fallback closure, MIME sinks and matching `remote-media@1` feature plus
   `remote-media` External Access Permission. Required catalog requirements must
   match required feature/permission declarations. Large portrait catalogs contain
   metadata only; no remote bytes are downloaded during build or packaging.
2. Exact assets now include image/audio/video formats. Renderer supports native
   audio/video controls, metadata preload, playsInline, visibility/hidden pause
   and disposal. No Package autoplay or remote audio/video expansion. Existing
   exact hash verification and resource byte budgets remain authoritative.
3. Added the Host-only media resolver: declared identities or opaque Host-issued
   handles, canonical HTTPS sources, no runtime URL sink, candidate fallback,
   optional SHA-256 integrity, response MIME and bounded streamed bytes. Browser
   CORS fetch uses credentials omit, no-referrer, redirect error and no-store.
   The Host enable UI discloses origins and IP/selection/timing exposure; optional
   access starts denied, required access checks consent before activation, and
   users can disable it. Denied/offline/invalid/budget/decode failures use exact
   fallback. Disabling/recovery/disposal aborts requests and revokes remote URLs.
4. Resolver caches are ephemeral and non-authoritative: shared pending/session
   entries, reference release, eviction of idle entries, and release-time revoke
   for cache none. Limits: 64 remote entries, 2 MiB each, eight concurrent requests,
   15-second candidate deadlines; catalog up to 10000 IDs within graph budgets.
   Host-issued references stay within disclosed origins and expire on recovery.
   Direct browser CORS is the implementation; no raw server proxy or new network
   authority was introduced. Loading hints remain advisory.
5. Added inert Package localization catalogs: stable keys, argument interpolation,
   plural/select, Intl number/date/time/relative/list formatting, BCP-47 parent
   fallback, default-message fallback, missing/unused diagnostics and explicit
   RTL. Locale updates lang/dir/environment in place without remounting state,
   reloading Session Authority or changing generation language. Date/time uses
   UTC. Message output is text, never HTML or an executable template.
6. Added closed typed `host.media.resolve` and `host.presentation.locale`,
   `setLocale`, `announce` targets through existing Bridge scope/schema/revision/
   idempotency authorization. Resolve returns reference/status/reasonCode, never
   network URLs or DOM capabilities. Pure presentation targets are supported in
   Preview; Session writes remain read-only. Local locale/announce interactions
   share the same presentation implementation.
7. Controlled input now holds a Composition Lock: ordinary reconciliation waits
   during composition, preserving buffers, caret and keyed ancestors; composition
   end publishes the final typed value. Added beforeinput/composition events and
   bounded data/inputType/selection/isComposing projections. Submit/key actions
   cannot accidentally submit the unfinished CJK composition.
8. Environment now includes VisualViewport geometry/scale, numeric safe areas,
   bottom occlusion, keyboard inset, input modality, contrast and Host text/UI
   scale, with CSS variables. Host content adds scroll padding and reveals the
   focused control on increased occlusion. Keyboard inset is a scale-1 viewport
   estimate, not a physical keyboard detector. Listeners/probes are disposed.
9. Compiler advisory diagnostics cover names/labels, image alt, heading/landmark,
   role/ARIA review, keyboard access, hidden focus, focus styles and reduced-motion
   fallback. Runtime adds rendered touch-target checks. Exact diagnostics appear
   in Studio Preview and existing Experience Health; a real installed Session
   test verifies they do not mutate revision or block healthy authority. Added an
   Experience-local live region. Existing Overlay FocusScope remains in use.
10. Child Components and media have local loading/error/retry boundaries. Explicit
    subtree boundaries can supply loading/error/retry text; required media decode
    can fail locally. Style/resource, lifecycle/invocation, read and local render
    failures stay scoped. Retry revokes local request completion and rebuilds only
    that subtree/read subscriptions, retaining siblings and never automatically
    replaying authority Actions/Operations. Root/View load failure retains the
    independent Host recovery surface. Error projections remove raw transport
    details. The callback seam is ready for Phase 6 controllers; no VM was added.
11. Updated the authoring entrypoint and added the executable Phase 5 fixture,
    compiler/resolver/renderer/Health tests and Edge smoke harness. The harness
    generates a small WebM at runtime, rather than committing a binary artifact.

All preceding authority invariants remain: no raw DB reads, alternate Session or
Timeline store/scheduler, unrestricted service dispatch, Operation Lifecycle
bypass, streaming-as-committed, unsafe Prose HTML or route-as-Authority-Epoch.

### Validation actually executed

Windows, **Node v24.18.0**, **Edge headless**. FS and SQLite included; existing
`ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1` exclude external DBs.

- Broad Native: **102 suites / 1693 tests passed**. This preceded the final small
  Boundary/environment/diagnostic refinements and extra test cases; it is not
  represented as a second full-suite run on the final commit.
- Adjacent game-runtime + atria-shell: **105 suites / 730 tests passed**.
- Final product-code focused: **7 suites / 123 tests passed**: frontend-platform,
  frontend-v3, frontend-presentation, frontend-bridge-client,
  frontend-conversation, studio-service, studio-health-p9.
- Then added one installed-Session Health assertion and reran its complete
  Phase 5 suite: **22 tests passed**. No product code changed after that focused
  seven-suite run. This is the final Phase 5 test file on the tested commit.
- Final Edge: **6 Phase 5 + 6 Conversation + 6 Bridge + 6 presentation scenarios**,
  Component/Hybrid/Full at 1440px and 390px. Phase 5 covers real exact image/audio/
  video resources, generated WebM decode, denied/offline fallback and privacy
  options, child resource retry, composition buffer/caret, RTL node preservation,
  live announce, input above simulated keyboard occlusion, Preview and disposal.
  Inspected the mobile Full screenshot; corrected Host panel layout so remote
  permission disclosure and Experience controls remain independently usable.
- Root lint passed; final changed JS/MJS/test lint passed. Final webpack build
  (`node docker/build-lib.js`) succeeded. Working-tree/staged diff checks passed.
- Product implementation was committed and pushed as the exact Tested HEAD above.
  No generated bundles, credentials, local paths or runtime data were committed.
  Temporary result/log files removed after recording evidence; screenshots remain
  only in ignored `.git/frontend-v3-platform-evidence/` and existing evidence dirs.

Limits: browser remote responses are deterministic fixtures, not external-server
E2E. Composition and keyboard occlusion use synthetic browser events/projections;
no physical CJK IME, device soft keyboard, Android/Termux or other-browser claim.
No real-provider E2E, production-user Session, remote CI, MySQL/PostgreSQL or
persistent privacy proxy/cache claim. Accessibility diagnostics are advisory,
not a full accessibility certification. No Script VM/Canvas was implemented.

### Remaining scope / next checkpoint

**Phase 5 acceptance is complete. Stop before Phase 6.**

Phase 6 — **Script Sandbox / Canvas** is governed by the existing Plan: Supervisor
Worker, isolated JS VM adapter, JS/TS compile/bundle and static exact module graph,
Controller ABI/scoped handles, CPU/memory/message/outstanding-work budgets,
scheduler/timer/frame/yield, crash/restart recovery, Canvas2D retained/batched
command buffers and source-mapped diagnostics. No window/document/fetch/storage
exposure, raw DOM authority, generic durable KV or new Session authority.

Use the current compiler/renderer/typed Bridge/Frame Scheduler/NodeRefs/media and
boundary seams. VM restart must preserve Authority; Canvas accepts safe Media
handles only. No implementation of Phase 6 or Phase 7+ has started. Live HANDOFF
contains the next-stage direct-copy prompt and the current exact refs.

---

## Phase 6 — Script Sandbox / Canvas

### Checkpoint and start state

- Start HEAD: `cfe7ee99aa96bba7d351f95fea05a8bc4264f42a`.
- End / Tested / Pushed HEAD: `99018afb750fc651c0d00f4d56a5bb946b8408e7`.
- Commit: `feat(frontend): implement isolated script runtime and canvas buffers`.
- Task branch remains `refactor/native-frontend-runtime-v3`; no main merge or
  branch deletion. Main baseline remains `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Began with `git fetch --all --prune`; both task and existing docs worktrees
  were clean. Fast-forwarded the local task from `0d6fb0499` to Phase 5 and docs
  from `b588ba994` to `384fd59afd2cfa440e02ee2bfba6faec13c0fb9c`.
- Read AGENTS, full Governance, HANDOFF, frozen Plan and this Record in order.
  No reference branch was read, no Gap Review or architecture redesign occurred,
  and no Phase 7 implementation was started. Baseline v1.0 remains unchanged.

### Implementation completed

1. Added strict `.aui` Controller declarations and `script:<ComponentId>` exact
   artifacts. TypeScript transpiles author JS/TS to strict ES2020 CommonJS; a
   package-local static linker bundles explicit relative `.js`/`.ts` modules.
   Artifacts contain code, closed import links, original source digests and
   per-module source maps. Source budgets, graph cycles, dynamic imports, bare/
   remote/Node dependencies and forbidden runtime globals fail closed. Installed
   validation independently checks syntax and closure, including rehashed input.
   The existing Build/Preview/install/Runtime-resource path is reused; consumed
   author modules are removed from Runtime output and never executed by install.
2. Selected QuickJS `0.32.0` (the pinned quickjs-emscripten adapter and embedded
   browser release variant) inside a dedicated Supervisor Worker. Worker thread
   failure/termination and VM guest heap/global isolation have separate roles.
   There is no browser-realm eval of Package code. Guest dynamic function
   constructors are removed, including async/generator constructor escape paths;
   browser/network/storage/DOM/WASM APIs are not injected. Host-internal WASM
   implements the VM and does not expose the future `frontend-wasm` capability.
3. Added Controller `init/event/update` ABI with readonly snapshots, schema-checked
   component state, declared emits, Component `uses` Bridge handles, scoped fixed
   services, safe NodeRefs, opaque MediaHandles, UI clock/random, timer/frame/yield.
   All reads/actions/operations reuse the existing typed Bridge; actions retain
   target/schema/revision/idempotency checks and Tasks retain their existing
   Lifecycle/SessionCore scheduler authority. Script receives no raw DB or KV.
4. Added guest heap/stack, cooperative execution and hard Worker watchdog limits,
   aggregate Experience execution accounting, static module/message/queue limits,
   outstanding async and live-operation quotas. Operation reservations count
   before asynchronous starts complete. Main serializes Worker messages, drops
   stale generation completions, and terminates a stuck Worker independently.
5. Budget/engine failures rebuild at most twice from Host-held props/component
   state. Worker restart does not reload SessionCore, alter Authority Epoch or
   replay pending writes. Recovery init/continuations cannot invoke Actions,
   Operations or parent emits; new user events carry bounded, revocable intent
   tokens through async continuations. Existing authoritative Tasks remain under
   their original Host lifecycle. Optional failures/resource unavailability keep
   declarative fallback; ordinary required exceptions use local/root boundaries;
   repeated required engine/budget failure escalates to the Host View surface.
6. Added semantic Canvas nodes and retained/batched Drawing Command Buffers.
   Host validates the complete command batch and opaque image handles, coalesces
   frames with the existing scheduler and enforces an Experience pixel quota.
   No raw Canvas context, per-draw-call RPC, URL image sink or readback enters the
   VM. Map/relationship layout and animation use package-local pure algorithms.
   Media acquisition requires an allowed `host.media.resolve` Read and uses the
   existing exact/remote/fallback policy. Media permission changes clear handles
   and already-drawn buffers; VM revocation releases pointer capture and images.
7. Runtime exceptions map to TS/JS source file/line/column, including the first
   relevant vendor stack frame. Compile errors also carry source coordinates.
   `/atria-script.bundle.js` is a normal webpack entry with source/dependency
   fingerprint caching and prebuilt-bundle completeness checks. No generated
   engine bytes or other binaries are committed.
8. Documented authoring/ABI/budgets/recovery in the existing frontend-v3 README.
   Added compiler/VM/supervisor tests, real SessionCore Bridge and formal package
   roundtrip cases, representative fixtures, and real Edge browser scenarios.
   An unmodified installed third-party `droll` pure JS algorithm is copied into
   an in-memory package-local vendor module by the test, compiled and executed
   in QuickJS; this is not merely an authored algorithm labeled third-party.

### Decisions, bounds and deliberate limits

- Host policy: 16 simultaneous Controllers, 8 MiB guest heap + 256 KiB guest
  stack per Controller; 40ms cooperative invocation deadline, 1s hard Worker
  watchdog, 10s cold engine/module startup watchdog; 2s reported execution per
  10s Experience window. Native VM operations can outlast an interrupt checkpoint
  but remain terminable by the Worker watchdog. Guest heap bounds do not include
  browser/Worker/WASM implementation overhead.
- 64 modules / 512 KiB source and compiled-code budgets; 128 KiB messages/batches;
  64 queue entries; 32 outstanding async requests; 4 live/pending Operations per
  Controller. No new operation scheduler or durable authority was introduced.
- Canvas: 2048 commands, 2048px per dimension, 32 save levels, at most 16 active
  surfaces and 8M retained pixels per Experience. Closed finite-number commands,
  hex colors and bounded text; no arbitrary context call, gradients, pixel
  readback, WebGL or Package WASM. These bounds cover the representative map and
  relationship/animation acceptance without opening later extension scope.
- Scripts use explicit file-extension imports and a default Controller object.
  JS/TS transpilation is not full TS semantic type-checking. Unsupported modules
  fail at compile/install rather than falling back to ambient browser execution.
- Node ABI currently exposes measure and owned pointer capture/release. Frames
  return `{time, animation}` using the existing visibility/reduced-motion policy;
  authors should honor `animation: false`. Props changes trigger `update`; other
  callbacks/settlements receive current presentation snapshots.
- VM restarts preserve Host component state and Bridge scope, not guest heap.
  Automatic replay is blocked. The latest 64 user-event intents are retained per
  generation. Live Operations continue to count until terminal status is observed;
  rebuilding a VM does not silently cancel or reissue an authoritative Task.
- MediaHandles contain no URL/bytes, and requests/handles/buffers are revoked on
  VM/media changes independently of Authority Epoch. Source maps refer to source
  paths and digests without embedding original author text in Runtime maps.

### Verification actually executed

Local Windows / **Node v24.16.0** / Edge headless. This environment's Node version
differs from the earlier Phase 5 environment; no claim of v24.18.0 was carried over.

- Broad Jest pattern `native`: **116 suites / 1790 tests passed**, FS and SQLite
  included; MySQL/PostgreSQL excluded with the existing environment switches.
- Adjacent `game-runtime`, `atria-shell`, webpack cache and startup telemetry:
  **108 suites / 743 tests passed**.
- Subsequent focused compile/Script/Bridge/Media regression:
  **4 suites / 90 tests passed**. Broad runs preceded the final small media
  revocation, optional-resource fallback, diagnostic and pointer cleanup changes;
  this Record does not claim a full rerun on the final commit.
- After final budget assertions: complete Script suite **26 tests passed** on
  the final source. This includes unmodified `droll`, actual QuickJS runaway and
  heap exhaustion, constructor escapes, message/outstanding caps, hard watchdog,
  async revocation, restart/fallback, Operation reservations and Canvas quotas.
- Final Edge Script smoke: **12 scenarios passed**: six Component/Hybrid/Full at
  1440px/390px, plus entry/vendor source mapping, scoped Node/Media denial,
  optional repeated failure, optional missing resource and real image-handle
  drawing/revocation. Inspected the rendered mobile Full relationship map.
- Adjacent Edge: **6 presentation + 6 Bridge + 6 Conversation + 6 Phase 5 media**
  scenarios passed. Phase 5 initially failed because detached-canvas recording
  emitted a header-only WebM on this headless Chromium (`DEMUXER_ERROR_COULD_NOT_OPEN`).
  The test fixture now attaches the canvas, waits for MediaRecorder start, and
  paints changing frames before stop; the complete six-scenario rerun passed.
  No product video decoder behavior was changed to hide the failure.
- Root `npm run lint`, final changed-code/test ESLint, final webpack build and
  staged `git diff --check` passed. Task-only diagnostic script/logs cleaned up;
  screenshots remain local, ignored evidence. No generated binary was staged.
- No remote CI, physical IME/soft keyboard, Android/Termux/device, other browser,
  production-user Session, external media-server or real-provider E2E claim.
  Media/bridge smoke uses deterministic fixtures and real browser rendering.

### Remaining scope / next checkpoint

**Phase 6 acceptance complete. Stop before Phase 7.**

Phase 7 — **Studio / AI Authoring**: follow the unchanged Plan for native `.aui`
editing, format-preserving structured edits, Source Graph/editor surfaces,
Preview using the same Compiler/Renderer, source diagnostics, AI semantic patch
surface, permission/feature visibility and accessibility/localization/Health.
Do not edit derived IR, create a second Preview runtime, repeat architecture
review, or begin Phase 8. HANDOFF contains the direct-copy Phase 7 prompt.

---

## Phase 7 — Studio / AI Authoring

### Checkpoint and start state

- Start HEAD: `99018afb750fc651c0d00f4d56a5bb946b8408e7`.
- End / Tested / Pushed HEAD: `c401a27d40d4a1b376f377ec97450f239c129c8b`.
- Commit: `feat(studio): add native frontend source and semantic authoring`.
- Branch: `refactor/native-frontend-runtime-v3`; main baseline remains
  `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Began with `git fetch --all --prune`. Task and docs worktrees were clean and
  matched their remote refs. There was no local main branch; origin/main matched
  the declared baseline. Reused both existing worktrees without resetting or
  merging main. Read AGENTS, Governance, HANDOFF, frozen Plan and this Record.
- Implementation Baseline v1.0 unchanged. No reference reads, architecture/Gap
  Review redo, Phase 8 work, main integration or task-branch deletion.

### Implementation completed

1. Native Studio's UI destination now opens a native@3 source editor. Experience
   selection, Source Graph browsing, raw .aui/JSON/CSS/JS/TS editing, source diffs,
   source diagnostic navigation and existing Review/ChangeSet flow are integrated.
   The Experience form now declares native@3 source/features; a new frontend gets
   a minimal index/Main.aui proposal in the same Workspace, without overwriting
   existing files. Legacy runtime removal remains Phase 9.
2. Source Graph projects View roots, Component contracts, Nodes, state scopes,
   interactions, scoped/global styles, Bridge bindings, locale messages, media,
   binary assets and static Controller modules. Multiple Experience owners are
   selectable. Binary entries are read-only. Derived Runtime IR is never the
   authoring model. State remains the established Component contract scopes;
   no alternate state document authority was introduced.
3. Added frontend.patch through existing StudioService inspection/evaluation/
   execution. AUI CST spans target stable Component/Node IDs. Strict JSON uses
   TypeScript's existing JSON CST for offsets only. Node attributes/text and
   JSON value spans preserve unrelated comments, whitespace, quotes and blocks.
   Source drafts preserve CRLF even though browser textareas normalize to LF.
   Duplicate JSON keys, mixed-content text replacement, identity rewrites,
   unknown/ambiguous IDs, prototype paths and stale source hashes fail closed.
4. Every semantic proposal retains the Workspace project revision and a source
   SHA-256. Multiple operations on one file resolve sequentially against current
   source while checking the same pinned Workspace baseline hash. Existing
   transactional validation/rollback publishes no partial invalid source. No new
   persistence, raw DB access or generic durable KV was added.
5. Added authenticated read-only frontend inspection and Workspace evaluation
   HTTP/client seams. Inspection overlays bounded drafts in memory and invokes
   the formal Compiler before Build. Draft and structured Preview use existing
   evaluateWorkspace -> Build -> StudioPreviewHost -> production Renderer and
   read-only Preview Bridge. Source/revision remain unchanged by evaluation.
   Preview selects an EntryPoint that actually uses the chosen frontend; unused
   package-level declarations cannot silently preview another override.
6. Source diagnostics now retain file/span/line/column through AUI parsing,
   compiler failures and ChangeSet contracts. CSS, Bridge, localization, missing
   resources and JS/TS diagnostics navigate to source; existing accessibility /
   localization advice is mapped via provenance. Health continues to consume
   the same compiler diagnostics. Feature/permission closure was factored from
   installed validation and reused, rather than approximated in Studio.
7. Feature status/reason codes, required flags, permission declarations and remote
   origins are visible. Declarations are not consent. Existing Preview/Host
   permission denial/fallback, typed targets, uses scopes, Operation intent,
   revision guards, Authority Epoch revocation and Session authority remain intact.
8. Project Agent exposes atri_agent_frontend_graph and atri_agent_frontend_patch,
   with discovery hashes and semantic targets. Proposals still require a Plan,
   force agent origin, pin Task revision, dry-run through Workspace validation /
   Preview and stop at human Review. It gains no commit capability. Updated the
   existing authoring reference catalog, system guidance and frontend-v3 README.
9. Late UI results are discarded after edits/selection/disposal. Preview mounts
   and server Preview handles are released. Existing Studio tokens/styles and
   labelled controls are reused; source areas and diagnostics fit mobile widths.

### Verification actually executed

Windows / **Node v24.16.0** / Edge headless. FS and SQLite included. Existing
ATRIA_DISABLE_MYSQL_TESTS / ATRIA_DISABLE_POSTGRES_TESTS switches exclude external
DB services.

- Broad Jest `native` pattern: **117 suites / 1815 tests passed**. This run
  overlapped/followed early implementation but preceded the final Studio entry,
  source diagnostic and async/UI refinements; it is not a final-commit full rerun.
- Focused Studio/Authoring/Compiler/Script/Media/Agent regression:
  **8 suites / 160 tests passed**.
- Adjacent Studio workspace, Project Agent UI and Source editor:
  **3 suites / 12 tests passed**, before the added Experience-form test.
- Later compiler/media/source-authoring/Studio-workspace regression:
  **4 suites / 74 tests passed**.
- Final source-authoring + Studio-workspace suites: **2 suites / 25 tests passed**
  on the final source. These cover formal dry-run Preview, atomic rollback,
  multi-patch baseline hashes, stale revisions, source positions, typed feature
  closure, AI Review lock and native@3 starter proposals.
- Final real Edge at **1440px and 390px**: semantic Node edit, real authenticated
  Studio evaluation, production Renderer Preview, invalid-source rejection,
  diagnostic navigation, retained drafts/CRLF, source Review, unchanged project
  revision and disposal. Inspected mobile screenshots using production Studio
  CSS. Harness uses a temporary FS ProjectStore and real compiler/service/HTTP
  path; no provider is called. Screenshots remain only in ignored local evidence.
- Root npm lint passed; final changed-code/test ESLint, webpack build and staged
  diff checks passed. No generated bundles, runtime data or credentials committed.

Limits: source validation is explicitly requested, not on every keystroke.
Structured editors change existing semantic targets; larger structural insertion,
deletion or mixed-content changes use the existing source workflow. Full JSON
value/style replacement necessarily reformats/replaces that selected block.
Some graph-wide diagnostics locate the file/block rather than an exact token.
Accessibility advice is not certification. Browser evidence covers this editor
and formal Preview rather than a complete external-provider product session.
No remote CI, physical IME/soft keyboard, Android/Termux/device, other browser,
external media server, real-provider E2E, MySQL or PostgreSQL validation claim.

### Remaining scope / next checkpoint

**Phase 7 acceptance complete. Stop before Phase 8.**

Phase 8 — **Integration / Heavy Frontend Acceptance** follows the unchanged Plan:
representative Story/Headless Conversation, Phone/SMS/Social/Mail, Church/management,
Schedule, People/Character, Remote Portrait, Collection pagination, AI Operation,
Canvas relationships, Component/Hybrid/Full, mobile/touch/IME and offline/denied/
recovery acceptance. Keep deterministic providerCalls at zero, verify package
build/install/preflight and Session/Authority/Memory/Lifecycle adjacency.

Use main-workspace test fixtures; do not merge main into package. No reference
branch access is implied. Do not begin Phase 9 removal or final main integration.
The live HANDOFF contains the exact Tested HEAD and direct-copy Phase 8 prompt.

---

## Phase 8 — Integration / Heavy Frontend Acceptance

### Checkpoint and start state

- Start HEAD: `c401a27d40d4a1b376f377ec97450f239c129c8b`.
- End / Tested / Pushed HEAD: `7ac92cca563942017ab06da47800e6d0d2a5b722`.
- Commit: `test(frontend): add integrated heavy runtime acceptance`.
- Branch remains `refactor/native-frontend-runtime-v3`; main baseline remains
  `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Began with `git fetch --all --prune`. Task and existing docs worktrees were
  clean and matched remote refs. There is no local main branch; origin/main is
  the stated baseline. Reused both worktrees without resetting or merging main.
- Read local AGENTS, full Governance, HANDOFF, frozen Plan and same Record.
  Implementation Baseline v1.0 is unchanged. No reference read, Package upgrade,
  architecture/Gap Review redo, Phase 9 removal or final integration occurred.

### Implementation and acceptance completed

1. Added a representative district fixture to the main test system, composed of
   six native@3 Views: Story, Phone (SMS/Social/Mail), Church stores, Schedule,
   People and Relations. One installed Package and Session serve all panels.
   Typed Application commands seed and mutate six domain projections; 25 People
   records use opaque eight-row collection pages. Package CSS, Components,
   local routing and shared Draft state use only the formal v3 semantics.
2. The shared harness creates a Project, invokes formal Build, installs/reopens
   its archive and reads browser resources through the installed hash-checked
   Runtime resource API. Tests compare formal Preview resources/runtime with
   installed resources, reject author-source reads and missing/unsupported
   required features, and confirm three layout modes use the same semantics.
3. Integrated Headless/Managed committed projection equality, literal HTML in
   Safe Prose, separate provisional narration, cross-panel typed writes, scope
   denial, once-only receipt replay, stale revisions/cursors and SavePoint restore.
   Restore revokes old handles; local navigation does not change Authority.
   Business writes and AI summary never insert provisional Timeline messages.
4. AI Operation uses real NativeGenerationHost.executeTask, existing Task
   scheduler, typed output validation and SessionCore result finalization. Only
   model execution is replaced by a deterministic function. A fail-on-send
   provider guard remains at zero calls. The result is one durable typed Task
   artifact, not an emulated authority or an external-provider E2E claim.
5. The relationship Controller reads the same scoped People collection in
   QuickJS and draws names through retained Canvas buffers. Runaway recovery
   preserves Host component state and Session revision without replaying writes
   or changing Authority Epoch. Remote portraits use a declared origin, denied/
   offline fallback and privacy options; browser network interception rejects
   any external request. Local resource failure retries through the existing
   section boundary. Full retains the existing Host recovery controls.
6. Browser flows cover touch-emulated navigation, composed CJK input with caret/
   node retention, simulated keyboard viewport, Draft retention across routes,
   and explicit presentation recovery that clears Draft but rereads committed
   business state. Mobile Phone/People/relationship screenshots were inspected.
7. Adjacent regression exposed Phase 7 Studio localization omissions. Added 24
   keys to both zh-cn and zh-tw and translated the Runtime features accessibility
   label via the existing Shell localization function. No new localization
   mechanism or runtime authority was introduced. Documented fixture boundaries
   and execution in the frontend-v3 authoring README.

### Verification actually executed

Windows / Node **v24.16.0**, real headless Edge. FS/SQLite covered; external
MySQL/PostgreSQL excluded with existing environment switches.

- Focused Heavy integration: **1 suite / 12 tests passed**, three modes.
- Broad Jest `native`: **118 suites / 1827 tests passed**, including Session,
  Authority, Memory, Lifecycle, Studio, Health and package regressions.
- Adjacent `game-runtime|atria-shell|memory-graph`: **148 suites passed; 1 suite
  failed**, 1307 tests passed / 1 failed. The failure was missing Studio Chinese
  translations. After fixing, localization coverage **1 suite / 4 tests passed**;
  Studio workspace **1 suite / 3 tests passed**. The whole 149-suite batch was
  not rerun after the fix.
- Later focused Heavy + localization: **2 suites / 16 tests passed**. That
  invocation also included an incorrect Studio test path and reported an ENOENT
  suite failure; the correct `atria-shell/studio-workspace-a7.test.js` was then
  run separately and all 3 tests passed. No product failure was suppressed.
- Final Heavy Edge: **6 scenarios passed**, Component/Hybrid/Full at 1440px and
  touch-emulated 390px, including the final People-backed Canvas assertion;
  every scenario asserts providerCalls=0 and zero external browser requests.
- Adjacent Studio authoring Edge: **2 scenarios passed**, 1440px and 390px,
  semantic edit, formal Preview, invalid-source diagnostics, retained drafts,
  human Review, unchanged revision and disposal.
- Root npm lint passed; final changed-code/test ESLint, webpack Node API build
  and staged diff checks passed. The webpack CLI is not installed, so build used
  the existing webpack API without installing any dependency.
- Broad runs began before final fixture refinements/localization fix. Later
  focused tests, final browser and changed-file checks cover those changes;
  this is not a claim that all broad suites reran on the final commit.

### Bounds and next checkpoint

**Phase 8 deterministic Core acceptance complete. Stop before Phase 9.**

No physical IME/soft keyboard, real Android/Termux device, other browser, external
media server, live provider or remote CI run is claimed. IME events and keyboard
viewport are synthetic; remote images use a deterministic resolver. Local browser
screenshots are ignored evidence, not committed assets. This fixture is not the
independent `package` workspace's formal Heavy Frontend release.

Next is Phase 9 — Legacy Removal / Regression / Finalize, strictly following the
existing Plan: remove v1/v2 formal runtime/compiler/selector plumbing, old Studio/
Preview paths and dead assets; execute associated tests and required CI; only
then perform final main integration and task-branch cleanup. Preserve Source-only
authoring, formal compiler/renderer semantics, typed targets/revision guards,
Lifecycle intent, Epoch revocation and Host authority. The live HANDOFF contains
the new exact refs and a direct-copy Phase 9 prompt.


## Phase 9 — Legacy Removal / Regression / Finalize

### Checkpoint and start state

- Start HEAD: `7ac92cca563942017ab06da47800e6d0d2a5b722`.
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`.
- Implementation pushed: `a066fdd1303ec722160a8f975bc77ae04a345897`.
- PR: **#98**; final regression/CI still in progress at this checkpoint.
- Initial fetch/prune confirmed exact user-supplied refs and clean product/docs
  worktrees. Existing task branch and docs worktree retained; no reference reads,
  Package upgrades, main merge or task-branch deletion yet. Baseline unchanged.

### Implementation and decisions

1. Removed v1/v2 renderer/compiler, selector/runtime loaders, Message template
   interpreter, Studio structured-UI/migration helpers and Preview fallback.
   Native manifest/descriptor/browser gates now reject old selectors and only
   admit native@3 for non-Text. Removed unused manifest/EntryPoint `ui` payload.
   Text resource transport now permits only declared game resources.
2. Extracted the existing bounded JSON/schema validators into shared data-only
   modules. Session Message Block validation uses pinned v3 Bridge schemas at
   commit and reopen; existing corruption, batch atomicity, fork/save/restore and
   newer-Package pinning tests were rewritten rather than discarded.
3. Removed the pinned-v2 Opening interpreter (including its generic durable UI
   setup values), old capability/workflow node and UI-only tests. Author wizards
   through v3 Source/forms and formal typed Application/Workflow commands; no
   compatibility authority or automatic writes were introduced. Lifecycle
   intent/outbox, revision checks, task receipts and independent authorities stay.
4. Host SceneCue playback retains exact Media assets, inert captions, explicit
   speech, scope/revision safety and cleanup without invoking a Package compiler.
   Shared participation retains authenticated Host turn controls and scoped
   projection display, not owner Session Bridge privileges or private Play DOM.
   The frozen v3 Bridge has no Shared participant target; this cleanup does not
   invent one or claim Package-authored Shared presentation support.
5. Removed dead CSS/fixtures/tests; rewrote adjacent Host, transport, contract,
   Studio and shell tests. Preserved Atria runtime plugins and Skills. Updated
   bundled Native UI authoring/verification guidance and examples in place to
   Source-only v3. Existing workflow/guard entry points now target v3; a Native
   Frontend v3 CI workflow covers associated regression and Heavy/Studio browser.
6. Full regression exposed system Git add's same-size/restored-mtime stat-cache
   miss, relevant to Studio Source commits. Rehash tracked content using Git's
   own attributes after staging additions/deletions. The first attempt put
   renormalization before deletion staging and failed; corrected order passes
   all 8 existing builtin/system Git tests. No user repo/index reset is involved.
7. Legacy shell E2E helper assumed a local untracked config.yaml; it now falls
   back to committed default/config.yaml like unit setup. Source Graph E2E
   selection must await asynchronous options before reading their value.

### Validation history (actual, not final-completion claims)

Windows / Node v24.16.0 / FS+SQLite. Local MySQL/PostgreSQL excluded with existing
switches. No external model provider was called by deterministic acceptance.

- Initial moving-tree associated run: 231 suites passed / 27 failed; 2700 tests
  passed / 36 failed. Old imports/selectors and deleted test files caused expected
  failures (some files were removed while this diagnostic inventory was running).
- First repaired focus: 16 suites passed / 3 failed; 486 tests passed / 9 failed.
  Remaining failures were synchronous pre-build rejection assertions, retired
  capability expectations and a Scene test still calling the removed renderer.
- Corrected focus: **7 suites / 283 tests passed**.
- Additional hard-cut/HTTP/Shared focus: **3 suites / 12 tests passed**; Git's
  first attempted fix separately failed 2 tests. Corrected Git: **1 suite / 8
  tests passed**.
- Heavy Edge **6 scenarios passed**, three layouts x 1440/390; installed graph,
  typed panels, Task, synthetic touch/IME, media, boundaries, Canvas/VM recovery;
  providerCalls=0. Studio authoring Edge **2 scenarios passed**, 1440/390.
  Phone mobile, Full Canvas desktop and Studio mobile screenshots inspected.
- Root lint passed. Final changed JS lint, changed mjs syntax checks, all **20**
  Native/A0–A9 guard scripts, workflow YAML parse and staged diff check passed.
  An initial blanket mjs ESLint used a non-module parser; corrected validation
  used Node syntax/execution. A trailing EOF blank line was removed before commit.
- Webpack build via `node docker/build-lib.js` passed (webpack 5.106.1).
- First full local run and second shell E2E were interrupted by the user; neither
  is a completed full run. The former exposed the Git defect above. Initial
  shell E2E failed before tests due to config; the next hit stale old UI assertions.
- Retried Shell Edge has passed desktop/mobile layout/recovery and authenticated
  Health/Shared controls. Studio option-loading race was identified and repaired;
  remaining E2E, final full local run and remote CI are pending.

### Pending finalization

Complete final local regression and remote PR/Native v3/Model Prompt checks;
record exact evidence/heads and any limits. Only then merge and verify main,
delete remote/local task branch and live HANDOFF. No physical IME/soft keyboard,
Android/Termux device or external media/provider E2E claim. Prior Phase 8 evidence
boundaries are retained; Linux Chromium/storage evidence will be recorded only
if the associated CI actually passes.


### Final regression follow-up — 06b8f4e5

- Follow-up pushed: `06b8f4e5ab0d7f03eb4d42cd6b4a44df0467d1eb`.
  Catch both sync and rejected async v3 refresh failures outside committed
  lifecycle events; added no-replay/no-failed-commit tests. Removed dead draft
  message marker. Browser tests now inspect separate Generation Projection,
  not a provisional entry in committed Conversation. Studio tests await source
  options and expect existing sanitized errors (not raw server text).
- Final completed local full batch (before the two added refresh tests):
  **801 suites passed, 2 failed, 7 skipped; 9126 tests passed, 1 failed, 92 skipped**.
  Both failures were Termux Bash guards resolving the Windows Store bash stub;
  rerun with installed Git Bash in PATH: **2 suites / 22 tests passed**, no product
  or test modification. This is not an Android/Termux device run. The full batch
  was not repeated after PATH correction or final follow-up; affected checks ran
  separately. Native folder: 104 suites/1749 tests; adjacent game-runtime,
  atria-shell and memory-graph folders: 137 suites/1032 tests, all passed.
- Final changed-code focus: **3 suites / 20 tests passed**, covering Play product,
  refresh lifecycle and hard-cut contracts; changed JS lint and diff check passed.
  Root lint and webpack build also passed during follow-up (before removal of one
  dead marker line; its affected Play test and changed-file lint passed afterward).
- Corrected Shell Edge: desktop/mobile layout/recovery **2 passed**, Health/Shared
  **1 passed**, Studio Preview/Scenario at 1440/320 **2 passed**. Full Studio
  authoring/Review/conflict/recovery at 1440/900/320 plus Chinese/accessibility
  **4 passed** before user interruption; the remaining project-list/loading/
  retry/create test was separately rerun and **1 passed**. These are all 10 cases
  from the three rewritten Shell E2E files, but not one uninterrupted green batch.
- Native generation/Studio human takeover Edge **4 passed**, 1440/390, after the
  streaming selector fix. The earlier already-started local P4 run still loaded
  the old selector and failed; the new run passed. This uses a synthetic loopback
  provider, not an external provider/model. Stream mobile screenshot inspected;
  no provisional text was present in committed Conversation or Timeline.
- Remote evidence on `a066fdd1303ec722160a8f975bc77ae04a345897`:
  - PR Checks run **36565678359** passed: **810 suites / 10175 tests**, including
    service-backed MySQL/PostgreSQL as configured, root lint and migration guard.
  - Native v3 PR run **36565678465** and push run **36565671676** passed:
    **246 suites / 2807 tests**, guards, Linux Chromium Heavy 6 + Studio 2.
  - Model Prompt run **36565678355** passed its unit/build/lint checks but failed
    one browser case at the stale draft selector (8 passed, 3 not run). Artifact
    inspection proved the text was correctly in separate Generation Projection.
    Do not describe that run as successful. The correction is in 06b8f4e5.
- New exact-head remote runs pending: PR **36567427028**, Native v3 PR
  **36567426990** / push **36567420904**, Model Prompt **36567426994**.
  No merge or branch/HANDOFF cleanup before those gates finish.
