# Native Frontend Runtime v3 — Implementation Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3` (merged; local/remote branches deleted)
- Plan: `docs:plans/refactor/native-frontend-runtime-v3/index.md`
- Baseline: **Implementation Baseline v1.0**
- Compatibility Strategy: **Hard Cut / Clean Break**
- Current Stage: **Phase 9 — Legacy Removal / Regression / Finalize**
- Main Baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Final Tested Task HEAD: `a15423efea3010e0afe0151d351c25252183d496`
- Final Main HEAD: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`
- Pull Request: #98 (merged)

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
  - `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
  - `docs@7d86e72fdc55e544cfc2b17b867f28c2af32bfdd` before preparation writes.
- Created the task branch from the exact current main baseline:
  - `refactor/native-frontend-runtime-v3@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- No product code changes were made.
- No Phase 1 implementation work was started.
- No tests/CI were run because this checkpoint only creates implementation scaffolding and documentation state.

### Phase 1 next target

**Phase 1 — Contract Reset / Compiler Skeleton**

1. `main:AGENTS.md`
2. `docs:README.md`
3. `docs:HANDOFF.md`
4. `docs:plans/refactor/native-frontend-runtime-v3.md`
5. `docs:records/refactor/native-frontend-runtime-v3.md`

Then work only on `refactor/native-frontend-runtime-v3`.

Phase 1 must not begin Phase 2 work.

### Stop condition after Phase 1

- push the Phase 1 tested HEAD;
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
3. CST preserves the original text and block offsets. Explicit `node-id` and Source Index component IDs preserve semantic identity across formatting changes. Provenance records source digests, component/node/interaction/style spans and Bridge source identity. CSS diagnostics expose a structured span.
5. Compiled Bridge Descriptor v1 links Reads to existing Package Data, Actions to existing Lifecycle commands and Operations to existing Model Tasks. No Bridge invocation runtime was added.
6. `buildProjectPackage` compiles before producing the installed manifest; Studio Preview and Studio Agent Review already call this same Build path. Source is not modified. Consumed Frontend author files are replaced in build output with compiled artifacts. EntryPoint overrides receive independent output namespaces.
7. The existing HTTP resource endpoint restricts native@3 to that exact graph plus existing declared game resources. Optional bundled author/remix files cannot be requested through this Runtime path.
9. Added a minimal executable authoring example at `src/native/authoring-examples/frontend-v3/` and curated API catalog entries for the new contracts, parser and Bridge linker. Updated two old authoring regression fixtures to the approved v3 hard cut.

### Minimal Phase 1 authoring syntax and decisions

- `frontend.json`: `format: atria-frontend-source`, `version: 3`, `primaryView`, `views[{id,root,surface}]`, `components[{id,source}]`; optional `styles`, `assets`, `bridge`. Resource source paths resolve relative to the Source Index.
- `.aui`: exactly one `<template>` with one root element; optional `<contract>` containing strict JSON `uses`, and optional `<style>`. Comments/raw source are preserved in CST. Each element has an explicit `node-id`.
- Minimal declarative links: `<component node-id="card" ref="Card" />`, `read="bindingId"`, `on:click="actionId"`, `<img node-id="portrait" asset="portrait" />`.
- The conservative parser is a skeleton, not the complete Phase 2 CSS pipeline.
- Generated paths use the Package/default or EntryPoint namespace, not the author source path as Runtime identity. Source paths remain provenance.
- The existing container's `source/` payload storage namespace is retained as physical transport; native@3 execution authority is the compiled `runtime/frontend/...` graph. No new persistence authority or separate compiler for Preview was introduced.
- Existing v1/v2 installed-runtime code remains temporarily for the explicitly scheduled Phase 9 removal. It is not an authoring compatibility path, and v3 artifacts never lower to or execute through it.

### Remaining items and Phase 2 target

 The compiler intentionally rejects syntax outside its documented subset instead of silently passing it through.

Phase 2 is **Presentation Runtime / Containment**: semantic DOM renderer, complete CSS/font pipeline, ShadowRoot + containment, props/emits/slots, View mount/lazy loading, scoped state, interactions, overlays/FocusScope, routing/forms, Frame Scheduler, NodeRef and responsive environment per Plan. There is no v3 visual renderer yet;

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
- User's continuation after the Phase 1 checkpoint authorized Phase 2. No rebase/fast-forward was needed because the branch already contained the Phase 1 task commit.
- Implementation Baseline v1.0 unchanged. No architecture review, no reference-branch reads, no Phase 3 implementation, no merge to main or branch deletion.

### Implementation completed

1. Extended the `.aui` semantic contract and compiled Component IR with typed props/emits/slots, closed state schemas, declarative expressions/interactions/lifecycle, bindings, conditions, dynamic style declarations, NodeRefs, keyed lists and virtual windows. Interaction source spans remain linked to semantic IDs.
2. Added CSS AST compilation using `css-tree`: layers, media/container queries, pseudo-elements/classes, custom properties, Grid/Flex, keyframes/transitions, transforms, filters and exact local resource URLs. WOFF2/WOFF/TTF/OTF are supported asset types.
5. Every View mounts inside a Host-owned clipping/containment frame outside the Package stylesheet's ShadowRoot. Package fixed positioning and extreme z-index remain bounded by the assigned surface. Package dialog/popover/browser-top-layer entry points are absent. Overlays use local frames, background inert, initial focus, trap, restore and coordinated Escape.
6. Full Host System Layer keeps Exit, Stop, Save and Diagnostics and gains Reload Presentation. Overlay Escape is coordinated before Full exit. Rendering failures use a Host-owned local failure surface outside Package CSS. Local route and overlay revisions discard stale asynchronous loads and release stale mounts.
7. Added the bounded frame scheduler with cancellation and motion/visibility policy; declared NodeRef geometry, scroll metrics, resize/intersection observers, pointer capture/release and automatic revocation; responsive frame/viewport/pointer/motion/color environment projections and CSS variables.
8. Production v3 dispatch now enters this renderer before the old selector/command path. Its resource transport uses the existing scoped exact Runtime endpoint. Account preferences reuse `createNativeUiStateStorage`; no new persistence authority was introduced. Bridge placeholders remain unavailable and never dispatch through legacy World/command fallback.
9. Async Preview disposal protects against late mount completion. It does not execute author source or introduce a visual editor.
10. Added authoring notes at `src/native/authoring-examples/frontend-v3/README.md`, a reusable representative fixture, unit/integration tests and a real Edge browser smoke script.

### Decisions and explicit bounds

- Compiler and runtime remain data-only; no arbitrary expressions, callbacks, script execution or raw HTML. Typed local expressions and interaction actions implement Phase 2's interaction baseline.
- CSS network-producing sinks must resolve to exact graph assets or local fragments. A discovered escaped `u\72l(...)` function bypass was fixed and regression-tested.
- Global Package styles are installed into Component ShadowRoots; inline Component styles follow them. Host registers prefixed font families and removes registrations/blob URLs on Experience disposal.
- Component instances are capped at 512, rendered nodes at 20000, route history at 64 and overlays at 8. Lists use unique scalar keys; over 512 items require fixed-height virtualization, with a maximum declared array size of 10000.
- NodeRefs cannot target repeated nodes in one instance. Repeated child Components have distinct instance IDs and can own their own refs. Observer subscriptions are capped/coalesced, and no NodeRef returns DOM/Host objects.
- Lifecycle routing is rejected to avoid recursive mounts. Local user interactions own navigation. View state survives back navigation; UI/Draft state survives route changes; Component state is per instance; Prefs use existing Host account storage.
- Preview currently transports its bounded exact compiled graph as a base64 bundle. View/Component mounting and parsing remain lazy through the same runtime resource loader; production resource transport fetches exact paths on demand.
- Static CSS is parsed and classified; this is not arbitrary browser execution permission. Unrecognized/unparsed resource syntax is rejected rather than silently passed through.

### Remaining scope / next checkpoint

 Existing descriptor binding placeholders are compile-time only; local route load revisions are not authority epochs.

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

- Required mapped arguments cannot originate
  from optional input fields. Operation output is the exact selected Task
  variant schema; a void Application command returns an actual Receipt with
  an empty public data payload, not an authority snapshot.
- Browser/server/Preview do not define alternate
  binding semantics or expose raw services.
- Generation Host construction is lazy and only
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
  retries, cancellation and finalization remain authoritative. No raw provider stream or snapshot becomes public data.
- `public/scripts/native/frontend/bridge.js` provides the single compiled scoped
  handle API for declarative callers and future Script transports. No Script VM added.
- Compiler inference covers bridge interactions. Runtime supports snapshot
  shorthand/subscriptions, Collection page/cursor interactions, Action/Operation
  calls and read-only `bridge.<bindingId>` result state. Typed object expressions
  construct public inputs; namespaced result paths resolve the longest declared
  binding identity. Local array rendering distinguishes no page from stale data.
- Experience Epoch is separate from local route revision. Reload/disposal
  revoke the Experience; late completions and superseded opens cannot repopulate
  it. Recovery remounts Component/View state and reloads declared Prefs through
  the existing Host account adapter. Presentation-only mounts also recover
  correctly without creating a transport or legacy authority fallback.
- Package Data uses exact Preview assets;
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
  added.
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

### Remaining scope / next checkpoint

Phase 4 is **Conversation / Session / Prose**, using the Plan's own section:
Managed/Headless Conversation and Composer parity, committed message collection,
GenerationProjection, reply alternative/branch controls, fixed composer /
conversation / session services, Safe Prose AST, Message Block integration,
save/reload/recovery/diagnostics and Host Failure Surface.

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
   `public/shared/native-frontend-host.js`.
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
   Component scope/schema/revision before invoking the existing Host adapter. Preview remains read-only.
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
6. Full Host Save now
   propagates its revision through Product/SaveSystem into SessionCore. SavePoint
   references the guarded immutable revision. Branch/restore/reload recovery
   revokes handles and remounts presentation. `synchronizeFrontendEpoch` reloads
   the existing Managed runtime after a server-side branch change, stops obsolete
   generation and discards its Draft without persisting it on the new branch.
   Same-branch active generation is not stopped just to reload presentation.
7. Added `public/shared/native-safe-prose.js`: deterministic bounded canonical
   text-to-AST mapping with exact source ranges, paragraph/break/emphasis/strong/
   heading/quote/list/code/pre/link/semantic-mark nodes. Safe links pass through a shared Host external
   navigation policy with confirmation and no package-owned href/opener.
8. Message Blocks remain separate typed immutable projection entries. Compiled
   `host.conversation.blocks` targets pin each block type's closed data schema; Unknown types/extra fields fail.
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
  second binding interpreter. Only the newly authorized fixed adapter extends read sources.
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
- Block content
  does not manufacture commands. Managed fallback cards are inert.
- Missing fixed Preview projections return `bridge_projection_unavailable`;
  Preview writes return `bridge_preview_readonly`. No fake Session authority.
- Restart capability is explicitly policy-denied by default. This is the Plan's
  Host-policy boundary, not an automatic Session reset implementation.
- Local route revision remains distinct from authority Experience Epoch.

### Remaining scope / next checkpoint

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

1. Added shared closed Media Catalog / MediaRef contracts. Required catalog requirements must
   match required feature/permission declarations. Large portrait catalogs contain
   metadata only; no remote bytes are downloaded during build or packaging.
2. Exact assets now include image/audio/video formats. Renderer supports native
   audio/video controls, metadata preload, playsInline, visibility/hidden pause
   and disposal. No Package autoplay or remote audio/video expansion.
3. Browser
   CORS fetch uses credentials omit, no-referrer, redirect error and no-store. Denied/offline/invalid/budget/decode failures use exact
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
   fallback. Added an
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

### Remaining scope / next checkpoint

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
   per-module source maps.
   The existing Build/Preview/install/Runtime-resource path is reused; consumed
   author modules are removed from Runtime output and never executed by install.
2. Selected QuickJS `0.32.0` (the pinned quickjs-emscripten adapter and embedded
   browser release variant) inside a dedicated Supervisor Worker. Worker thread
   failure/termination and VM guest heap/global isolation have separate roles.
   There is no browser-realm eval of Package code. Guest dynamic function
   constructors are removed, including async/generator constructor escape paths;
   browser/network/storage/DOM/WASM APIs are not injected. Host-internal WASM
   implements the VM and does not expose the future `frontend-wasm` capability.
3. Script receives no raw DB or KV.
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
   No raw Canvas context, per-draw-call RPC, URL image sink or readback enters the
   VM. Map/relationship layout and animation use package-local pure algorithms.
   Media acquisition requires an allowed `host.media.resolve` Read and uses the
   existing exact/remote/fallback policy. Media permission changes clear handles
   and already-drawn buffers; VM revocation releases pointer capture and images.
7. Runtime exceptions map to TS/JS source file/line/column, including the first
   relevant vendor stack frame. No generated
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
  readback, WebGL or Package WASM.
- Scripts use explicit file-extension imports and a default Controller object. Unsupported modules
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

### Remaining scope / next checkpoint

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
4. No new
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
   the same compiler diagnostics.
7. Feature status/reason codes, required flags, permission declarations and remote
   origins are visible. Declarations are not consent.
8. It gains no commit capability. Updated the
   existing authoring reference catalog, system guidance and frontend-v3 README.
9. Late UI results are discarded after edits/selection/disposal. Preview mounts
   and server Preview handles are released. Existing Studio tokens/styles and
   labelled controls are reused; source areas and diagnostics fit mobile widths.

### Remaining scope / next checkpoint

Use main-workspace test fixtures; do not merge main into package. No reference
branch access is implied. Do not begin Phase 9 removal or final main integration.
The live HANDOFF contains the exact Tested HEAD and direct-copy Phase 8 prompt.

---
