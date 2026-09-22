# Atria Native Content & Session Architecture — implementation handoff

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current phase status: **N5 complete and validated; N6 is next**
- N0 validated HEAD: `e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`
- N1 validated HEAD: `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`
- N2 validated HEAD: `bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`
- N3 validated HEAD: `c42ee3e98a27fbea97ded0917de081bcc8893680`
- N4 validated HEAD: `ec95a260f4a26a4c23091227f77865dba1ae2273`
- N5 validated HEAD: `70f59bf2894c77defa46d75e48c79485a4bc5d74`
- N5 workflow: **Native Content Session Dev Checks #107**
- N5 run: `35700429886`
- N5 result: **success**
- Next action: **N6 — Native Knowledge Runtime Integration**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`
- N6 prompt: `docs:handoff/atria-native-session-n6-prompt.md`
- Implementation sequence: **N0–N10**

Do not merge to `main` yet. Keep the long-lived refactor branch isolated through N10.

## Frozen design amendment — Immutable Timeline + Bounded Context

This amendment supersedes the original N4 assumption that Native must preserve SillyTavern committed Edit/Delete/Swipe semantics.

### Committed Timeline invariant

Committed Native Timeline is immutable for:

- users;
- plugins/extensions;
- Agents;
- Package Runtime;
- Atria-owned modules.

Once a message is committed into a SessionRevision, its canonical role/content/Actor/attachment references/provenance cannot be edited, deleted, replaced, swipe-switched, or variant-switched in place.

Normal changes to history use:

- append;
- Retry Reply = fork from post-user revision + new Assistant message;
- Re-enter Turn = fork from pre-user revision + prefilled Draft;
- Restart From Here = fork from historical predecessor revision;
- Load historical Save = continue from a derived Branch;
- revisioned Session State changes.

A destructive privacy/maintenance purge is a separate maintenance workflow, not a normal Play/runtime API.

### Draft boundary

SillyTavern remains a mutable generation/runtime workspace **before commit**.

ST `chat[]`, `swipes[]`, `swipe_info`, `swipe_id` may remain transient Draft/generator ABI while required.

At the commit boundary:

```text
mutable ST Draft/runtime
        ↓
Native append/commit
        ↓
immutable TimelineEntry
        ↓
SessionRevision
```

Committed projected messages receive a Write Barrier/fingerprint guard. Direct legacy/plugin mutation must fail closed; it is not translated into Native revise/remove/select commands and must never fall back to JSONL/chat persistence.

### N4 acceptance change

Preserve useful work already implemented through the live N4 HEAD, including:

- Native Session → ST projection;
- Native HTTP/command transport;
- generation host reuse;
- Branch/switch/reload/historical views;
- Package Regex/Knowledge compatibility;
- attachments/AssetStore;
- no legacy persistence fallback;
- real-host test infrastructure.

Change tests/commands:

- committed Edit/Delete/Swipe/Swipe-delete/Variant switch become fail-closed/non-authoritative;
- `timelineIntents` no longer maps committed projection diffs to `revise/remove/removeVariant/selectVariant`;
- Native `removeSwipe()` product behavior is retired;
- Regenerate→Variant becomes Retry Reply→Fork→new Assistant TimelineEntry;
- committed Continue appends a continuation TimelineEntry;
- direct third-party `chat[]` committed-content mutation must be rejected and leave Native authority unchanged.

### Revised later phases

- N5 — Native Runtime State & Revision Lifecycle
- N6 — Native Knowledge Runtime Integration
- N7 — Native Context Architecture
- N8 — Save System & `.atriasave`
- N9 — Product UI Cutover
- N10 — Hard Cutover & Legacy Retirement

### N7 Native Context Architecture

Canonical Timeline is permanent; model context is a bounded derived projection.

N7 will implement:

- SessionContextCompiler;
- ContextProvider/ContextItem;
- ContextPlan with included/rejected reasons and per-lane token accounting;
- token-budgeted complete TurnGroup recent history;
- source-backed Narrative Spine: Scene → Chapter → Arc → Campaign;
- Active Commitments;
- Derivation Gate / bounded Turn Distiller;
- Runtime/Orchestrator/Utility result reuse;
- Memory cheap ingest vs heavy consolidation;
- branch/revision/source provenance and coverage;
- exact raw-history drill-down;
- Economy/Balanced/Rich policies.

No canonical message may be deleted/rewritten/summarized away to satisfy context limits.

Normal turns must not incur mandatory Memory + Commitment + Summary LLM calls. Deterministic State/Event updates are preferred; semantic derived work is gated and may lag without blocking Play.

Checkpoint C after N7 proves bounded context under long Timeline growth, source retrievability, coverage-gap fallback, target isolation and ContextPlan diagnostics.


## Frozen history — do not redo

### N0

N0 froze:

- Package / PackageVersion / Actor / EntryPoint;
- Project;
- Session / Branch / TimelineEntry / Variant;
- SessionRevision / SavePoint / AssetRef;
- World / WorldRevision;
- KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding;
- opaque Native IDs;
- Package v2 logical schema;
- `.atriasave v1`;
- Native Store schema v1;
- EntryPoint World/Knowledge references;
- SessionRevision `knowledgeHead`.

### N1

N1 froze and validated:

- PackageRepo;
- WorldRepo;
- KnowledgeRepo;
- SessionRepo foundation;
- SavePointRepo;
- AssetStore;
- first-class Native storage resources;
- SQL `native_resources` schema v2;
- FS / SQLite / MySQL / PostgreSQL parity;
- immutable revisions;
- FS commit-last behavior;
- Native reference/GC foundation;
- content-addressed immutable asset blobs.

Authority boundaries remain:

- WorldRepo = Library World only;
- KnowledgeRepo = Library Knowledge only;
- Package snapshots are PackageVersion content;
- current Session state is Session authority;
- Native data is not hidden in `named_docs`;
- no old PNG/Character JSON/JSONL/World Info fallback;
- no dual-read/dual-write persistence.

## N2 completed

### ProjectStore / Native Studio project identity

Implemented:

- `src/native/project-source.js`
- `src/native/project-store.js`
- `src/native/studio-preview.js`

ProjectStore is filesystem/Git-oriented and rooted at:

`projects/<projectId>/`

Source manifest:

`atria.project.json` / `atria-project-source v1`

Project identity is opaque `projectId`, never `characterId`, `charDir`, avatar/name/path/filename.

`StudioProjectRouter` opens the Native Studio seam by `projectId`.

Production UI is intentionally not cut over in N2; that remains N8.

### Project-owned World/Knowledge source

A Project can author/package:

- World snapshots;
- Knowledge snapshots/entries;
- KnowledgeBindings;
- local asset files.

Project-owned binding sources are normalized to Package-owned sources at build.

Project-owned content does not need to be inserted into Library before build.

### Exact Library dependency closure

Implemented `src/native/dependency-closure.js`.

Exact authoring references:

- `worldId + worldRevisionId`;
- `knowledgeBaseId + knowledgeRevisionId`;
- `knowledgeBindingId`.

Build vendors the exact immutable Library snapshots and their closure.

It never follows Library latest or display-name/path matching as a substitute for the requested revision.

Validation includes:

- missing exact WorldRevision;
- missing exact KnowledgeRevision;
- incomplete Knowledge revision entries;
- missing KnowledgeBinding;
- missing referenced asset;
- missing EntryPoint World/Binding;
- missing KnowledgeEntry relations;
- cyclic `requiredEntryIds`.

### `.atria` Package Container v2

Implemented `src/native/package-container.js`.

Native Package Container v2 uses:

- Atria binary magic/header;
- bounded safe-preflight metadata;
- compressed inner payload;
- AES-256-GCM authenticated envelope/obfuscation;
- SHA-256 content/inventory integrity;
- path traversal / ambiguous-path / case-conflict checks;
- entry/file/total-size limits;
- decompression-ratio checks;
- exact Package manifest + AssetRef validation.

It is not a renamed ZIP.

The protection layer is tamper detection + casual reverse-engineering resistance, not a claim of secrecy from a determined end user.

Preflight independently validates allowed capability and permission vocabularies before decrypting payload.

Required permissions must be explicitly granted before install.

### Source Project → Build

Implemented `buildProjectPackage` in `src/native/package-composition.js`.

Build:

1. opens ProjectStore by `projectId`;
2. resolves exact Project/Library World/Knowledge closure;
3. reads Project assets;
4. creates a fresh opaque `packageVersionId`;
5. constructs the frozen N0 AtriaPackage v2 logical manifest;
6. vendors World/Knowledge/bindings/assets;
7. creates Package Container v2;
8. computes PackageVersion `packageContentHash`.

### Install / reopen

Implemented `PackageInstaller`.

Install authority:

- PackageRepo = Package/PackageVersion metadata + current pointer;
- AssetStore = immutable Package container blob + contained asset blobs.

Package content blob is keyed by PackageVersion `packageContentHash`.

AssetStore GC now treats all installed PackageVersion content hashes as strong references.

Reopen uses only PackageRepo + AssetStore. It does not query WorldRepo or KnowledgeRepo.

The N2 end-to-end test proves this using separate author and target stores: the target has no matching World/Knowledge Library records but successfully reopens the exact vendored content.

### Studio Preview seam

`StudioPreviewHost` creates ephemeral `preview_*` records.

Properties:

- `persisted: false`;
- keyed back to `projectId`;
- validates the built Package;
- writes no `atri_session` records;
- does not contaminate the normal Session list.

Full product UI routing remains deferred to N8.

### Existing `atria-distribution v1`

`src/game-package/distribution.js` remains temporarily as an adjacent Game Runtime regression surface.

It is **not** part of the Native N2 build/install path, not a Native fallback, and not dual-read authority.

Its product-facing retirement/rerouting remains scheduled for N8/N9. Do not delete it early while starting N3.

### Cross-realm validation hardening

N2 exposed same-realm prototype checks in:

- `src/native/contracts.js`;
- `src/native/world-knowledge.js`.

They now use object-brand validation for plain JSON so ordinary documents can cross Jest/plugin/worker realms while Date/Map/Set/class instances remain rejected.

## N2 validation

Final validated HEAD:

`bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`

Workflow:

- **Native Content Session Dev Checks #43**
- run `35677654858`
- result: **success**

Results:

- N2 Package Project Composition: **5 suites / 30 tests passed**
- N2 source ESLint: success
- N0 Native Contracts job: success
- N0 contracts: preserved
- adjacent Game Runtime / `.atria-distribution v1` regressions: preserved
- full root ESLint: success
- N1 Native Storage Foundation job: success
- FS / SQLite / MySQL / PostgreSQL Native storage parity: preserved

Hard-cutover audit of current `src/native/*` found no Native authority use of:

- `characterId` / `charId` / `charDir`;
- `chatFile`;
- JSONL / PNG authority;
- World Info authority;
- `named_docs`;
- `card-apps`.

## N3 implementation record — validated 2026-09-22

Working branch: `refactor/atria-native-content-session-architecture`

Validated HEAD: `c42ee3e98a27fbea97ded0917de081bcc8893680`

Status: **N3 complete and validated**. N4 is next, in a new implementation conversation.

### Session command authority

`src/native/session-core.js` exposes `SessionCore` using the existing SessionRepo, SavePointRepo and PackageInstaller, with optional KnowledgeRepo for explicit Library policy resolution.

Implemented commands:

- `create(handle, { packageId, packageVersionId, entryPointId, ... })`;
- `load(handle, sessionId, { revisionId? })`;
- `appendTimeline`, `addVariant`, `selectVariant`;
- `updateState` for base `atri_*` namespace replacement;
- `updateKnowledge` for explicit external binding-set replacement;
- `forkBranch` from a committed revision, `switchBranch`;
- `createSavePoint` and `restoreSavePoint` primitives.

Mutation commands accept an optional `expectedRevisionId`; publication always compares against the exact HEAD loaded by the command. Stale/concurrent writers receive `native_session_head_conflict`, not silent last-writer-wins.

### Immutable revision closure on the N1 resource model

No new storage engine, resource family, physical SQL schema, or Native ID family was needed. The N0 contracts remain intact.

- `atri_session_branch`: immutable branch birth/ancestry records.
- `atri_timeline_entry`: immutable message birth records (owning branch, role, actor, metadata and initial variant).
- `atri_timeline_variant`: immutable message-variant content/metadata.
- `atri_session_state`: immutable content-addressed namespace snapshots.
- `atri_session_revision`: immutable cross-state commit manifest.
- `atri_session`: mutable commit pointer, published last.

Reserved state namespaces:

1. `atri_session_core`: versioned BranchGraph membership, exact branch HEADs, exact fork revisions and parent commit revision.
2. `atri_timeline`: ordered message/owning-branch references plus the revision's variant inventory and active selections. It does not copy ancestor message text/records when branching.
3. `atri_knowledge`: resolved KnowledgeBindingSet referenced by `SessionRevision.knowledgeHead`.

`stateHeads` addresses the first two and ordinary Session state. `knowledgeHead` separately addresses the third.

The message birth record is not a current-message cache or second writable authority. Current Timeline content is materialized from the committed selection snapshot and immutable Variant records. `sequence` is reconstructed ordering, never identity.

### Base World state and exact dependencies

Session creation requires an explicit installed `packageId + packageVersionId + entryPointId`, never Package current/latest or display-name matching. Load reopens the exact installed PackageVersion and verifies version/hash against Session metadata.

Selected World snapshots always come from PackageVersion content, not WorldRepo.

`atri_world_state` is an N3 initialization/base namespace, **not the N5 Game Runtime integration**. It contains:

- `primaryWorldId`;
- `worlds[worldId] = { worldRevisionId, state }`;
- `initialState` for an EntryPoint with no World.

Each selected World's baseline initializes its state. `initialStateOverlay` shallowly replaces top-level fields of the primary World baseline (or the sole World when primary is omitted). Nonempty multi-World overlays require an explicit primary World. World-less starts retain the overlay in `initialState`. World identities/revision pins cannot change through `updateState`; only mutable state values may change.

Installing a newer PackageVersion cannot mutate an existing Session, its World revisions, or its Knowledge dependencies. Package GC continues to retain Session-referenced versions.

### Resolved KnowledgeBindingSet

`src/native/session-knowledge.js` implements N3 resolution and validation, not N6 compilation.

- Package defaults are Package bindings not scoped by any EntryPoint or World.
- The selected EntryPoint and its selected Worlds add their explicit bindings.
- Bindings scoped only to another EntryPoint/World are not silently activated.
- Library policy inputs are explicit `libraryBindingIds`; the caller selects policy applicability. N3 does not introduce a new global-policy service.
- Session-local bindings use `kind: session` and exact supplied Knowledge snapshots.
- Package bindings retain exact immutable Package content and cannot be changed by Session external-binding updates.
- Library and Session-local snapshots are copied into the immutable Session binding-set snapshot with exact revision identity and full entry closure. These are pinned Session snapshot dependencies, not dual-writable Library copies.
- Reload does not read Library current pointers, Library bindings, or the original author's Library. Explicit `updateKnowledge` creates a new SessionRevision.
- Missing exact revisions, incomplete entry sets, duplicate identities, wrong ownership, unbound snapshots and cyclic required-entry dependencies fail closed.
- `enabled`, `mode`, `target`, `visibility`, and `priority` are preserved as policy data. N3 performs no KnowledgePlan compilation, prompt selection, authority ranking, or World Info projection.

The existing N2 required-entry graph validator is reused rather than replaced.

### Branch, history and SavePoint semantics

`forkBranch` takes an exact source revision. It inherits that revision's Timeline selections, state and Knowledge while extending the current committed BranchGraph; it does not discard sibling branches or create new ancestor message IDs.

`switchBranch` publishes a new coherent commit based on that branch's exact HEAD. `restoreSavePoint` also publishes a new commit based on the saved closure; the SavePoint and historical revision remain immutable. Merely calling `load(..., { revisionId })` is read-only and does not switch Session HEAD.

A loaded historical snapshot includes the current Session descriptor plus the selected historical `revision`; consumers must use `revision.branchId` and the returned snapshot for historical views, not treat `session.activeBranchId` as the historical branch.

Session history follows explicit parent revision / branch HEAD / fork revision edges. GC retains reachable history and SavePoint roots, rejects deletion of referenced branches/revisions, and can remove failed-publication orphan revision manifests. Deliberate history pruning and full orphan fragment sweeping remain separate maintenance work; N3 does not silently prune history or pretend that revision-manifest GC sweeps every unreferenced state/message fragment.

`auto`, `quick`, and `manual` SavePoint kinds are supported as immutable local pointers. Scheduling, slot replacement, portable `.atriasave` export/import and dependency UX remain N7.

### Durability and integrity

`SessionRepo.commitSnapshot` writes immutable branches/messages/variants/state first, validates their closure, writes the revision manifest, then CAS-publishes the Session record last. Initial creation never exposes a Session record before its complete first revision.

In-process Session publication is serialized across repository/engine instances, supplementing SQL transactions and protecting FS's async read/write CAS window. The existing FS engine is still a single-server-process store: this is **not** a multi-process filesystem transaction/locking claim.

Failed writes may leave unreferenced immutable fragments but cannot expose a partially published Session. Orphan revision manifests are not loadable as committed history and cannot become SavePoint targets. Reload checks record integrity, state content hashes, exact identity ownership, graph ancestry/fork points, selected variants and Timeline HEAD consistency. Missing/corrupt resources fail closed; there is no reconstruction from runtime buffers or old stores.

Low-level N1 storage primitives remain available for their existing storage contract. Once a Session uses the N3 snapshot protocol, raw mutable HEAD/revision publication and rewriting published message/branch records are rejected. Production N4 commands must go through SessionCore, not assemble a second persistence path from the low-level N1 methods.

### N3 verification

- Local N3: **3 suites / 35 tests passed** on FS + SQLite.
- Local broader N0/N1/N2/native/adjacent regression run before the final three SavePoint-kind tests: **22 suites / 174 tests passed**, 2 suites / 12 tests skipped because MySQL/PostgreSQL services were deliberately disabled locally.
- Local full root ESLint: success.
- N3 source hard-cutover scan and `git diff --check`: success.
- SQLite binding was rebuilt locally with `npm rebuild better-sqlite3 --ignore-scripts=false`; no binary/dependency output is committed.
- CI: **Native Content Session Dev Checks #44**, run `35679448236`, **success**. N3: **3 suites / 49 tests passed** across FS / SQLite / MySQL / PostgreSQL. N1 storage/parity: **9 suites / 64 tests passed**. N0 contracts/adjacent/full root lint and N2 composition jobs also passed.
- CI reuses the existing N1 database job to run N3 across FS / SQLite / MySQL / PostgreSQL. No Android or Docker build/extra Docker validation was requested or run.

### Exit boundary / next phase

**Checkpoint A and the complete N3 exit are satisfied.** N3 local and four-engine CI validation passed on the exact recorded HEAD.

No N4 runtime projection, N5 runtime-state providers, N6 KnowledgeCompiler, N7 portable save system, N8 UI cutover, or N9 retirement has been implemented in this phase. No main merge, new branch, Legacy fallback, Native dual-read or Native dual-write was introduced.

The next phase is **N4 — SillyTavern Runtime Projection**, on the same working branch. N3 development has stopped after this validated handoff.


## N4 startup reading

Read live remote main instructions, both docs handoffs, the Master Plan, `src/native/session-core.js`, `session-snapshot.js`, `session-knowledge.js`, SessionRepo/SavePointRepo, all three N3 test suites, then relevant current runtime/projection code. N3 repo primitives are not a second runtime engine. Exact SillyTavern APIs must be checked in current source; host behavior remains a real-runtime validation gate.


### Engineering guidance receipt

`tavern-card-builder` startup route used; TavernWeave library snapshot `2026-08-18`, standing `ST-A0` read for scope/red lines/acceptance. The existing Master Plan and current Native source are the implementation authority. No design catalog candidate, card-format adapter or version-sensitive host API was adopted in N3. Host API/projection acceptance remains N4.


## N4 in-progress checkpoint — 2026-09-22

**Status: implementation checkpoint only; N4 exit NOT satisfied.** The user requested an immediate push and handoff because their usage quota was nearly exhausted. Stop at this checkpoint; the next conversation must continue N4, not start N5.

- Working branch: `refactor/atria-native-content-session-architecture`
- Pushed checkpoint HEAD: `f3ac20f80f4691eee1d3c7ccab555a39e4322d3b`
- Last completely validated phase: N3 at `c42ee3e98a27fbea97ded0917de081bcc8893680`
- main remains untouched; no new branch or main merge.
- CI: push triggers `Native Content Session Dev Checks`; current run/result not yet verified. Do not carry N3 #44 success forward as N4 evidence.

### Implemented at the checkpoint

- `SessionCore.applyTimelineCommands`: explicit append/revise/select/remove/removeVariant intents in one immutable revision and HEAD-CAS publication; reuses `_publish`/SessionRepo, no second persistence engine.
- `forkBranch` optionally accepts an exact message/variant within the selected revision. Fork validation checks the referenced immutable Timeline snapshot. Earlier full-revision forks remain covered by N3 regressions.
- `public/scripts/native/session-projection.js`: Package Actor profile and selected Session revision -> transient character/chat/swipe ABI, stable opaque message/variant mappings, changes to a known projection -> explicit commands. Not a Session importer or authoritative whole-chat save.
- `public/scripts/native/session-runtime.js`: explicit open/reload/close/fork/switch seam, serialized Timeline writes, CAS failure latch, read-only historical projection, native upload transport.
- `src/endpoints/native-session.js`: authenticated server-owned handle, create/load/allowlisted command/upload/read routes. Runtime writes require expectedRevisionId. No arbitrary repository method dispatch.
- `public/script.js`: exported `openNativeSession` seam and Native interception of append/patch/save/reload; projected characters occupy a transient array slot; DOM host itself is not replaced. Native regenerate is routed toward the existing swipe generator; browser behavior still needs proof.
- bookmarks branch routing, Package Regex provider contribution, Native pinned Knowledge candidates entering existing World Info selection without loading legacy books.
- `populateFileAttachment` routes uploads to AssetStore in Native mode; logical assetId is retained in Timeline variant metadata, download URL is derived. AssetRef deletion retains immutable Timeline variant references.
- Native character-state calls return `native_state_integration_pending`; chat state resolves no legacy target. Full state backend integration remains N5. Compatibility metadata is currently transient rather than fully persisted.
- N4 unit/HTTP tests added to the existing four-engine CI job; no Android/Docker build or extra Docker validation added.

### Executed verification

- `npm run lint`: **passed**, full root source/frontend lint.
- `npm run test:unit --prefix tests -- --runInBand native atria-shell/native-play-host.test.js`: **17 suites / 139 tests passed**.
- This Jest pattern also selected `game-runtime/ui-native-components.test.js`; this is unit/DOM coverage, NOT a live R7/browser smoke.
- Local test environment explicitly disabled MySQL/PostgreSQL with `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`. Local parameterized Native tests exercised FS and SQLite only. Four-engine N4 evidence remains CI-pending.
- Earlier focused checks: N3 + projection **4 suites / 47 tests**; Native runtime HTTP **1 suite / 4 tests**, passed.
- An initial test attempt used the wrong database-disable variable names and failed with local DB connection refusals. It was rerun successfully with the correct flags above; no DB service or Docker was started.
- `git diff --check`: passed before commit.
- No frontend build, full repository Node regression, live browser, real provider, mobile, Android or Docker validation was executed for N4.

### Required continuation — do not report N4 done

1. Fetch and read the live remote work branch and docs again; do not reset to this SHA if another session advanced it.
2. Inspect the whole checkpoint diff against N3, especially runtime write timing, identity binding across streaming/swipe/edit, early-save callbacks, switching/closing during queued operations, failure/reload behavior and remaining direct legacy endpoint calls. Unit pass is not sufficient evidence for these seams.
3. Add isolated real-host browser coverage using the actual Atria server/SPA and existing mock-LLM helpers. Prefer a fresh test-owned data root; do not copy private developer data or use their real configured provider. Existing `_lib/server.js` supports `useExistingDataRoot`; its default clone path uses Unix `cp`, so Windows needs the explicit fresh-root route. No live host was started here.
4. Verify Send, Stop, Continue, user/assistant Edit, Delete (message and swipe), Swipe, Regenerate, Branch, historical views, reload, exact dependencies, prompt assembly, Regex, World Info compatibility and file/media attachments. Capture Native writes and assert no `/api/chats/*`, Character/World Info persistence fallback or duplicate writes for Native operations.
5. Specifically prove the Native regenerate-to-swipe mapping uses the real generation lifecycle correctly; do not infer acceptance from pure adapter tests. Check native draft identity survives the runtime's message/swipe object updates.
6. Preserve R7 original node identities and uniqueness for `#sheld`, `#chat`, `#form_sheld`, `#send_form`, `#send_textarea`; existing unit tests do not establish actual browser lifecycle behavior.
7. N4 Knowledge projection is intentionally NOT N6: target/visibility-scoped and override bindings are skipped fail-closed; full authority/visibility/KnowledgePlan diagnostics remain N6. Review compatibility field mapping with real selector fixtures before claiming World Info compatibility.
8. Full N5 state integration, N7 saves, N8 UI cutover and N9 retirement remain unimplemented. Do not promote this development seam to production UI yet. Verify residual legacy paths rather than assuming this checkpoint exhaustively fences every extension route.
9. Read/fix CI at the exact work-branch HEAD, run broader relevant tests and frontend build, then perform the N4 real-runtime acceptance matrix. Obey the Master Plan long-CI/external-input stop rules.
10. Only after N4 completion and verification update the formal plan/handoffs and produce an N5 prompt. The present handoff is an N4 continuation prompt.

### Guidance receipt

`tavern-card-builder` and focused API/runtime skills read; library route `tavern-card-builder`, snapshot `2026-08-18`, ST-A0 opening gates used. Current repository source, not recalled upstream signatures, supplied API provenance. No design catalog candidate was adopted. Real-host execution remains explicitly unverified.


---

## N4 validated handoff — 2026-09-22

**Status: N4 complete and validated. Stop N4 development. N5 is next.**

- Working branch: `refactor/atria-native-content-session-architecture`
- N4 validated HEAD: `ec95a260f4a26a4c23091227f77865dba1ae2273`
- Workflow: **Native Content Session Dev Checks #87**
- Run: `35693455407`
- Result: **success**
- main remains untouched.
- No new task branch was created.
- N0–N4 are now the frozen implementation baseline for N5.

### N4 delivered

- Native committed Timeline is immutable and product/runtime writes are append-only.
- Write Barrier fingerprints committed message identity, role, actor, canonical content, attachment refs and provenance; presentation-only overlays are excluded.
- Direct committed `chat[]` mutation fails closed as `native_committed_timeline_mutation`.
- Native committed Edit/Delete/manual Swipe/Swipe Delete/Variant switching are rejected rather than converted into history rewrites.
- Send creates an exact post-user Revision before Assistant generation.
- Continue appends a new Assistant TimelineEntry with `continuationOf` provenance.
- Retry Reply forks from the exact post-user Revision, then appends a new Assistant reply; unsent Composer state is isolated from Retry.
- Stop owns Generation Draft lifecycle and correctly handles partial, empty, and no-placeholder aborts without contaminating committed Timeline.
- Package Regex executes in the real hot path.
- Native Knowledge remains a compatibility projection only; N6 still owns full KnowledgeCompiler semantics.
- Attachments use AssetStore identity and Native asset routes.
- R7 Play host nodes retain identity/uniqueness.
- Native generation disables legacy server-side chat persistence and never falls back to JSONL/`/api/chats/*`.

### N4 verification

Exact HEAD `ec95a260f4a26a4c23091227f77865dba1ae2273` passed:

- N0 Native Contracts;
- N2 Package Project Composition;
- N1 Storage + N3 Core + N4 Projection across the existing storage parity matrix;
- full root ESLint;
- N4 real-host Chromium Native Session acceptance;
- complete Node regression: **748 suites / 8705 tests passed**;
- frontend build.

The browser acceptance covers positive Send/Continue/Retry/Branch/Switch/History/reload/attachments/prompt/Regex/Knowledge compatibility and R7 host identity, plus negative committed Edit/Delete/Swipe/Swipe Delete/Variant/direct-mutation barriers, stale-write recovery and Stop/Draft handling.

### N5 next-phase boundary

N5 is **Native Runtime State & Revision Lifecycle**.

Move Atria-owned durable runtime state into coherent SessionState/SessionRevision semantics:

- Game World + Event Journal;
- Memory canonical/durable state;
- Orchestrator;
- Search;
- Variables/op-log replacement where Native applies;
- package-owned durable state.

Native lifecycle anchors are stable `messageId`, `revisionId`, and `branchId`, with lifecycle concepts such as:

- `TIMELINE_APPENDED`;
- `REVISION_COMMITTED`;
- `REVISION_RESTORED`;
- `BRANCH_ACTIVATED`;
- `SESSION_LOADED`;
- `DRAFT_ABORTED`.

For Native authority, stop treating floor/swipe IDs and `MESSAGE_EDITED` / `MESSAGE_DELETED` / `MESSAGE_SWIPED` as authoritative lifecycle events. Legacy/ST compatibility may remain for non-Native sessions.

N5 must preserve the N4 immutable Timeline and Write Barrier. Do not implement N6 KnowledgeCompiler, N7 ContextCompiler, N8 save system, N9 UI cutover, or N10 hard retirement early.

N5 exit: append/fork/restore/reload keep Timeline and all authoritative Native state coherent without committed-message mutation or swipe-based rollback semantics.


---

## N5 implementation record — validated 2026-09-22

**Status: N5 complete and validated. Stop N5 development. N6 is next.**

- Working branch: `refactor/atria-native-content-session-architecture`
- Validated HEAD: `70f59bf2894c77defa46d75e48c79485a4bc5d74`
- Workflow: **Native Content Session Dev Checks #107**
- Run: `35700429886`
- Result: **success**
- `main` remains untouched; no new development branch was created.

### SessionState / SessionRevision authority

N5 upgrades the N3/N4 Session Core so a runtime commit can publish Timeline appends and multiple Atria-owned SessionState namespaces in the same coherent SessionRevision.

Implemented:

- atomic runtime command with append-only Timeline commands plus `statePatch` / namespace deletion;
- Native ChatState/FloorState compatibility wrappers route into SessionState instead of legacy `/api/chats/*`;
- state-only commits remain normal immutable SessionRevisions;
- restore/fork/reload materialize the exact Timeline + state closure of the selected Revision;
- message-scoped Fork/Retry finds the exact Timeline-boundary Revision rather than inheriting later state-only commits.

### Native lifecycle

Standard lifecycle bus:

- `TIMELINE_APPENDED`
- `REVISION_COMMITTED`
- `REVISION_RESTORED`
- `BRANCH_ACTIVATED`
- `SESSION_LOADED`
- `DRAFT_ABORTED`

Search, Orchestrator, Memory and Game Runtime use Native lifecycle events for Native reload/branch/restore behavior. Legacy/ST structural events remain compatibility-only.

### Runtime state migration

- **Game World:** `atri_game_world` stores authoritative current World state together with Event Journal in Native Sessions. Legacy/ST keeps its prior journal shape.
- **Memory:** graph/meta/provenance are SessionState-backed. Native source identity is stable `messageId`; committed messages are not mutated with `memory_os_source_id`. Memory inspector payload retains Native message identity.
- **Orchestrator:** durable snapshots use stable `messageId` keys in Native Sessions. Loop Notes keep stable note IDs; their floor argument is Legacy compatibility metadata only.
- **Search:** durable snapshots use stable `messageId` keys in Native Sessions.
- **Variables:** Native variables persist in `atri_variables`; variable op structural rollback is Legacy-only. The old per-message var-op editor is read-only/hidden for committed Native Timeline messages.
- **Package-owned runtime state:** live Package progress belongs to SessionState. PackageRepo/PackageState remains only for installed-Package user preferences.

### Preserved N4 invariants

- committed Timeline remains immutable;
- product/runtime Timeline writes remain append-only;
- Write Barrier remains fail-closed;
- Continue remains a new TimelineEntry;
- Retry Reply remains Fork + new Assistant;
- Stop owns Draft lifecycle only;
- an empty/no-placeholder Stop does not advance HEAD or publish Draft-local runtime state;
- no Native JSONL/`/api/chats/*`/Character/World Info authority fallback;
- direct committed `chat[]` mutation remains rejected.

### Validation

Exact validated HEAD `70f59bf2894c77defa46d75e48c79485a4bc5d74`:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N5 focused state/lifecycle gate: **15 suites / 307 tests passed**;
- N5 source lint: success;
- full root ESLint: success;
- real-host Chromium Native Session acceptance: success;
- complete Node regression: **748 suites / 8734 tests passed**;
- frontend build: success.

### N5 exit

The N5 exit criterion is satisfied: append / fork / restore / reload keep Timeline and authoritative Native state coherent without committed-message mutation or swipe-based rollback authority.

### Remaining boundary

N6 owns Knowledge runtime integration. N5 deliberately does **not** implement KnowledgeCompiler/KnowledgePlan, bounded Context compilation, `.atriasave`, product UI cutover or Legacy retirement.
