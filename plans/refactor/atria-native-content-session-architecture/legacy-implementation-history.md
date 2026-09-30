# Atria Native Content & Session Architecture Refactor — Legacy Implementation History

> Historical execution notes migrated verbatim from the old Plan. They are audit evidence only; new implementation history belongs in Records.

## N2 implementation record — validated 2026-09-22

N2 — **Package / Project / World & Knowledge Composition** is complete and validated on:

`refactor/atria-native-content-session-architecture@bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`

Validation:

- workflow: **Native Content Session Dev Checks #43**
- run: `35677654858`
- result: **success**
- N2 focused validation: **5 suites / 30 tests passed**
- N2 source ESLint: success
- N0 contracts and adjacent regressions: success
- full root ESLint: success
- N1 Native storage contract/parity job: success, including FS / SQLite / MySQL / PostgreSQL

### N2 Project source authority

Implemented a filesystem/Git-oriented `ProjectStore` rooted at:

`projects/<projectId>/`

The editable source manifest is `atria.project.json` using `atria-project-source v1`.

Native Studio source identity is exclusively opaque `projectId` / `packageId`; `characterId`, `charDir`, avatar names, filenames and paths are not identity. Project paths are authoring locations only.

Project source may contain:

- Project-owned immutable-shaped World source;
- Project-owned Knowledge source;
- Project-owned KnowledgeBindings;
- exact Library WorldRevision references;
- exact Library KnowledgeRevision references;
- exact Library KnowledgeBinding references;
- project asset source files.

### N2 dependency closure

Build resolves exact authoring dependencies and fails closed when exact immutable references are absent.

Library resolution is by:

- `worldId + worldRevisionId`;
- `knowledgeBaseId + knowledgeRevisionId`;
- `knowledgeBindingId`.

Build never follows display names or Library "latest" as a substitute for a pinned revision.

The resolver vendors:

- exact World snapshots;
- exact Knowledge snapshots and entries;
- binding closure;
- referenced immutable assets.

Project/Library KnowledgeBindings are normalized to Package-owned binding sources inside the built PackageVersion.

Knowledge `requiredEntryIds` are validated as a dependency graph. Missing relations fail composition and required-dependency cycles are rejected before packaging.

### N2 self-contained PackageVersion

`buildProjectPackage` composes the Source Project plus resolved closure into the frozen N0 `AtriaPackage v2` logical manifest and assigns a fresh opaque `packageVersionId`.

The build invariant is now executable and covered by tests:

> A built PackageVersion contains the exact World/Knowledge/asset closure required by its EntryPoints and does not need the author's live Library at runtime.

The end-to-end test builds on an author store with Library World/Knowledge, installs on a second store with no corresponding WorldRepo/KnowledgeRepo records, and successfully reopens the exact vendored World/Knowledge/assets from Package content alone.

Project-owned World/Knowledge is also covered independently and does not need to be published into Library first.

### N2 `.atria` Package Container v2

Native build/install uses a new **Package Container v2** implementation.

The final artifact is not a renamed ZIP. It uses:

- Atria binary magic/header;
- container version 2;
- bounded preflight metadata;
- compressed inner payload;
- AES-256-GCM authenticated obfuscation/envelope;
- SHA-256 payload/content integrity;
- explicit inventory;
- entry-count / file-size / total-size limits;
- path traversal / ambiguous path / case-conflict checks;
- decompression-ratio checks;
- Package manifest validation;
- exact packaged AssetRef integrity checks.

The protection layer intentionally raises casual reverse-engineering/editing cost and provides tamper detection; it is not treated as a secrecy boundary against a determined end user, consistent with this plan.

Preflight exposes only bounded Package identity/capability/permission metadata. Capabilities and permissions are independently whitelist-validated before payload decryption.

Required permissions must be explicitly granted to `PackageInstaller.install` or installation fails closed with `native_package_permission_required`.

### N2 install / AssetStore authority

Installed Package content is stored as an immutable content-addressed blob in `AssetStore` keyed by the PackageVersion `packageContentHash`.

`PackageRepo` continues to own Package / immutable PackageVersion metadata and current-version pointers only.

Install order preserves N1 FS semantics:

1. publish immutable content blob;
2. publish contained immutable assets;
3. ensure Package root exists;
4. commit immutable PackageVersion;
5. publish current-version pointer last through PackageRepo.

A failed metadata publication may leave only unreferenced immutable blob content, which remains GC-safe.

AssetStore blob GC now treats every stored PackageVersion `packageContentHash` as a strong reference.

`PackageInstaller.open` reopens installed Package content using only PackageRepo metadata + AssetStore blob data and verifies PackageVersion identity/hash consistency. It does not consult WorldRepo or KnowledgeRepo.

### N2 Studio seams

Implemented Native Studio core seams without starting N8 production UI cutover:

- `StudioProjectRouter` opens Native Studio work by `projectId`;
- `StudioPreviewHost` creates in-memory `preview_*` previews;
- preview descriptors are explicitly `persisted: false`;
- preview creation writes no `atri_session` resource and therefore does not contaminate the normal Session list.

The existing character-bound CardApp Studio surface remains only as an adjacent pre-cutover surface to be retired/re-routed in its scheduled later phases. It is not a Native Project authority.

### N2 coexistence boundary

The existing `src/game-package/distribution.js` `atria-distribution v1` implementation is intentionally still exercised as an **adjacent Game Runtime regression surface** during this long-lived branch.

It is not used by the N2 Native Source Project → Package build/install path and is not a Native fallback or dual-read authority.

Removal/rerouting of the old product-facing distribution/character transport belongs to the scheduled UI/legacy cutover phases, especially N8/N9. N2 does not perform that retirement early.

### Cross-realm JSON validation hardening

N2 exposed a pre-existing validator edge case when Native documents crossed Jest/plugin/worker realms and were revalidated during composition.

`contracts.js` and `world-knowledge.js` now identify plain JSON objects by object brand rather than same-realm prototype identity. This preserves rejection of Date/Map/Set/class instances while allowing ordinary JSON documents to move safely across runtime realms.

### N2 exit status

N2 exit criteria are satisfied:

- ProjectStore exists and is keyed by `projectId`;
- Native Studio core routing no longer requires character identity;
- Project-owned and exact Library World/Knowledge sources compose;
- exact dependency closure is resolved and validated;
- missing/cyclic dependencies fail closed;
- Source Project builds Package v2;
- `.atria` Package Container v2 exists with authenticated envelope/security preflight;
- exact World/Knowledge/assets are vendored;
- Package install/reopen uses PackageRepo + AssetStore;
- PackageVersion content is immutable/content-addressed;
- Preview is ephemeral and outside SessionRepo.

At the historical N2 boundary, the next phase was **N3 — Session Core**; N3 is now complete as recorded below.

Do not redo N0/N1/N2 and do not begin N6/N8/N9 work as part of N3.


---

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

## N8 implementation record — validated 2026-09-22

**Status: N8 complete and validated. Stop N8 development. N9 is next.**

- Working branch: `refactor/atria-native-content-session-architecture`
- Validated HEAD: `f6f629800f8dae2da5c9870f6c0d6965920ea960`
- Workflow: **Native Content Session Dev Checks #136**
- Run: `35715208736`
- Result: **success**
- `main` remains untouched.
- N0–N8 are frozen.
- Next phase: **N9 — Product UI Cutover**.

### SavePoint authority and historical-load semantics

N8 keeps Auto / Quick / Manual SavePoints as immutable local pointers to stable authoritative `SessionRevision` records.

- Auto Save does not wait for asynchronous Narrative/Memory consolidation.
- Save creation never snapshots mutable runtime buffers independently of the Revision boundary.
- Historical Save load is non-destructive.
- Continuing from a historical Save creates and activates a derived Branch rooted at the exact saved Revision.
- The Branch that reached the former current HEAD keeps its own HEAD and history intact.
- Loading a Save already equal to the active HEAD is a no-op rather than manufacturing a redundant Branch.

### `.atriasave` logical container

Added:

- `src/native/save-container.js`
- `src/native/save-system.js`

The container is a Native logical artifact, not a renamed JSONL or a copy of FS/SQL physical storage.

It provides:

- snapshot scope for one SavePoint closure;
- full-session scope for the complete Session/Branch/Save history closure;
- authenticated binary envelope;
- authenticated inventory and per-entry SHA-256 integrity;
- default Atria portable protection;
- optional password mode using scrypt + AES-256-GCM;
- wrong password / tamper fail-closed behavior;
- preflight metadata without exposing decrypted conversation payload.

The export closure contains the exact logical resources required by the exported Revision(s):

- Session descriptor;
- Branch graph ancestry and exact Branch records;
- immutable Timeline entries and Variants;
- exact SessionRevision manifests;
- engine-independent Session state records;
- pinned resolved KnowledgeBindingSet;
- Session-local Knowledge;
- pinned Library Knowledge revision snapshots required by the Session;
- durable World / Event Journal state;
- canonical Memory and provenance;
- durable Orchestrator state;
- `atri_context_derived` Narrative Spine / Active Commitments / coverage / provenance;
- referenced Session attachment AssetRefs and bytes;
- snapshot/full-session SavePoint records as appropriate.

Rebuildable caches are not portable authority. N8 explicitly excludes namespaces for embeddings, rerank/search indexes, ContextPlan/token/render/recent/thumbnail/compiled caches.

### Exact Package dependency handling

Import requires the exact:

- `packageId`;
- `packageVersionId`;
- Package semantic version;
- Package container content hash;
- EntryPoint identity.

A matching display name, Package ID with a different content hash, or a different installed version is not accepted.

Preflight returns structured dependency states such as:

- ready;
- missing;
- mismatch;
- invalid local dependency.

Missing or mismatched dependencies fail closed before Session mutation. N8 does not silently pick a similar/latest Package.

### Commit-last import

`SessionRepo.importClosure` imports the logical closure using the same Native immutable-resource model:

1. validate logical contract;
2. write immutable Branch / Variant / Timeline / state / Revision / SavePoint resources;
3. verify every imported Revision against the imported immutable closure;
4. publish the mutable Session record last as the commit marker.

A failed FS import can leave only unreferenced immutable fragments; it cannot expose a half-imported Session.

The import path does not reconstruct authority from:

- Character files;
- JSONL chats;
- legacy World Info files;
- mutable frontend runtime buffers.

Tests assert the Character/chat/World Info fallback surfaces stay untouched during Native import.

### Knowledge portability policy

Export retains exact Knowledge identities/revisions needed by the Session.

On import:

- Package Knowledge remains Package authority through the exact installed PackageVersion.
- Session-local Knowledge remains Session-bound.
- snapshots that originated from another user's Library are converted to Session-bound embedded Knowledge by default.
- import does **not** create/update the target user's Library automatically.

`NativeSaveSystem.promoteEmbeddedKnowledge` is an explicit promotion seam for a later UI action such as **Save to my Library**. Promotion creates Library authority only when explicitly invoked and does not silently rewrite the imported Session's pinned binding policy.

### Checkpoint B validation

Exact HEAD `f6f629800f8dae2da5c9870f6c0d6965920ea960` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: **4 passed**;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Native Knowledge Runtime Integration: success;
- N7 Native Context Architecture / Checkpoint C: success;
- N8 Save System / Checkpoint B: **5 suites / 53 tests passed**;
- N8 source lint: success;
- full root lint: success;
- complete Node regression: **753 suites / 8791 tests passed**;
- frontend webpack build: success.

The complete Node regression ran with MySQL/PostgreSQL services enabled. N8 clean-store import parity uses `CONTRACT_HARNESSES`, so the final regression covered the active Native storage engines including FS / SQLite / MySQL / PostgreSQL.

Checkpoint B is satisfied for:

```text
Native Session
  → exit / recreate service layer
  → reload
  → SavePoint
  → historical load / derived Branch
  → snapshot or full-session export
  → .atriasave
  → clean-store import
  → exact dependency validation
  → coherent continue state
```

World / Knowledge / Memory / Orchestrator / Narrative / Commitment / Branch state remains coherent across the portable round trip. Durable provenance/coverage survives; rebuildable caches do not become portable authority.

### N8 boundary / N9 next

N8 did **not** implement Product UI cutover and did **not** perform legacy retirement.

N9 must switch the product management surfaces to Native authorities while retaining the R7 Shell and route authority:

- Works Library;
- World / KnowledgeBase Library and revision detail;
- work detail / EntryPoint start;
- Continue / My Games;
- Save / Load / Timeline;
- Studio Projects and dependency management;
- Package install/update preflight;
- Package/Session delete semantics;
- Native Play actions: Retry Reply, Re-enter Turn, Restart From Here, Save, Quick Save, Load, Timeline;
- ContextPlan diagnostics exposure.

N9 must hide/retire Native product UI for Swipe controls and committed in-place Edit/Delete/Regenerate semantics, but must not perform N10's deeper hard-cutover/legacy code retirement early.


---

## N9 implementation record — validated 2026-09-22

**Status: N9 complete and validated. Stop N9 development. N10 is next.**

- Working branch: `refactor/atria-native-content-session-architecture`
- Validated HEAD: `503fbb4da05c90a1e6d2022e17df0c6bac79b1ee`
- Workflow: **Native Content Session Dev Checks #193**
- Run: `35723060389`
- Result: **success**
- `main` remains untouched.
- N0–N9 are frozen.
- Next phase: **N10 — Hard Cutover & Legacy Retirement**.

### Product UI cutover delivered

N9 moved the active product management surfaces onto the existing Native authorities without creating a second persistence/runtime stack.

Library now exposes the Native product model:

- Works Library backed by Package authority;
- Work detail with EntryPoint start flow;
- Continue and My Games backed by Native Session authority;
- Package install/update preflight;
- exact missing-Package dependency state for existing Sessions;
- Package deletion keeps referenced Package versions protected;
- Session deletion delegates to Native Session cleanup semantics;
- portable `.atriasave` preflight/import/export through the N8 Save System;
- World Library with create/read/rename/delete and read-only revision history;
- KnowledgeBase Library with create/read/rename/delete, Entries, Bindings/references and read-only revision history;
- explicit imported embedded Knowledge **Save to my Library** promotion seam.

Studio now uses ProjectStore as the product authority and exposes exact dependency selection for:

- WorldRevision;
- KnowledgeRevision;
- KnowledgeBinding.

Native Play now exposes:

- Retry Reply;
- Re-enter Turn;
- Restart From Here;
- Save;
- Quick Save;
- Load;
- Timeline;
- ContextPlan diagnostics.

Native product UI retires/hides the old committed mutation affordances:

- Swipe arrows/counter/picker and Swipe deletion;
- committed message Edit/Delete;
- traditional in-place Regenerate.

The underlying immutable Timeline / SessionRevision / Write Barrier remains authoritative. Direct third-party mutation of projected `chat[]` is still rejected fail-closed; N9 did not weaken the N4 barrier.

### R7 Shell and authority boundary

N9 retained the existing R7 Shell and route authority.

- Library routing now defaults to Works and routes World/Knowledge through Native workspaces.
- Studio routes to the Native Project workspace.
- Play keeps the single existing Conversation DOM host.
- The N9 real-host acceptance also exercises the compact/mobile viewport.
- N9 Shell CSS consumes `--atri-*` semantic tokens and does not bind directly to SmartTheme compatibility variables.
- Existing mature SillyTavern generation / World Info runtime machinery was not mechanically deleted.
- `#WorldInfo` may remain as a transition/editor adapter, but it is not Native Library authority.
- Native Product code has residual guards against Character / JSONL / World Info storage fallback.

### N9 save and dependency seams

N9 reuses N8 rather than inventing a second save format/API:

- Save / Quick Save / Load delegate to `NativeSaveSystem`;
- N9 portable export unwraps the N8 save container's authenticated `archive` bytes;
- historical Save continuation keeps N8 derived-Branch semantics;
- import preflight surfaces missing/mismatched exact Package dependencies;
- imported embedded Library-origin Knowledge remains Session-bound until the user explicitly promotes it.

### Product UI Cutover validation

Exact HEAD `503fbb4da05c90a1e6d2022e17df0c6bac79b1ee` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: **4 passed**;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Native Knowledge Runtime Integration: success;
- N7 Native Context Architecture / Checkpoint C: success;
- N8 Save System / Checkpoint B: success;
- N9 Product UI unit/integration: **6 suites / 22 tests passed**;
- N9 Native Product authority residual guard: success;
- N9 source lint / guard syntax: success;
- N9 real-host Chromium Product UI acceptance: **1 passed**;
- full root lint: success;
- complete Node regression: **757 suites / 8802 tests passed**;
- frontend webpack build: success.

The complete regression ran with MySQL/PostgreSQL services enabled. The real-host acceptance verifies Native Retry through the N9 product action, retired committed mutation controls, EntryPoint start through Library → Work detail → Play, Native Timeline/Context controls, and compact/mobile layout survival.

### N9 boundary / N10 next

N9 completed the product-surface cutover but deliberately did **not** perform N10's deeper hard retirement.

N10 must now remove residual Native product dependence on legacy identities/formats/authorities while preserving mature runtime ABI machinery that remains necessary behind adapters.

N10 scope is the frozen Master Plan section **N10 — Hard Cutover & Legacy Retirement**. Do not redesign N0–N9.

---

## N10 implementation record — validated 2026-09-22

**Status: N10 complete and validated. N0–N10 implementation is frozen; final integration is next.**

- Working branch: `refactor/atria-native-content-session-architecture`
- Validated HEAD: `031971954d907a930f0db8ed0bf1d1eefeaf43ef`
- Workflow: **Native Content Session Dev Checks #224**
- Run: `35733418199`
- Result: **success**
- `main` remained untouched through N10 implementation/validation.
- Final integration sequence is now: permanent docs → PR to `main` → required PR CI → merge → integrated-main verification → delete temporary refactor branch.

### Hard-cut authority retirement

N10 closed the remaining Active Native product paths that could still expose predecessor persistence/content/history semantics.

Committed Native Timeline authority is now append/fork/revision based:

- `SessionCore.addVariant()` and `SessionCore.selectVariant()` are retired;
- each new committed TimelineEntry keeps its single birth Variant identity;
- Native Branch transport rejects committed `variantId` / `swipeId` selection;
- runtime Branch creation cannot select a committed Swipe/Variant;
- Retry Reply continues to fork from the exact post-user Revision and appends a fresh Assistant TimelineEntry;
- Re-enter Turn / Restart From Here remain Revision/Branch operations;
- direct host/plugin mutation of committed content, swipe arrays or selected swipe fails the N4 Write Barrier before publication.

The ST conversation host may still use `swipes`, `swipe_id`, `swipe_info` and related structures as mutable generation/runtime ABI before/around projection. Those fields are not Native identity and cannot publish a second committed authority.

### Product Library and legacy content identity

The R7 Product Library no longer retains Character/Game/legacy World Info authority adapters.

Retired from Product Library / route authority:

- Character Library mount;
- legacy Game discovery from Character avatars;
- legacy World Info Library mount;
- `openLibraryCharacter()` compatibility route alias.

Current Library product authority is:

- Works → Package / PackageVersion;
- Worlds & Knowledge → WorldRepo / KnowledgeRepo immutable revisions;
- Skills → existing Skills controller.

Native identity remains opaque. Contracts continue to reject predecessor identity fields including:

- `characterId`;
- `charDir`;
- `avatar_url`;
- `swipe_id` / swipe index aliases;
- World Info numeric `uid`;
- world/book filename/name identity;
- `charaFilename`;
- `selected_world_info`.

World Info numeric `uid` may still be synthesized inside the mature selector/projection ABI, but only as adapter-local indexing. Native Knowledge authority remains `knowledgeBaseId + knowledgeRevisionId + knowledgeEntryId + knowledgeBindingId`.

### Legacy Character/chat product flows retired in Native sessions

While a Native Session is active:

- Manage Chat Files is hidden and its action fails closed;
- Checkpoint Chat create/open/query/exit/list operations fail closed;
- Character/CardApp editor cannot open against the transient projected Character object;
- Character import is blocked;
- PNG / JSON / CharX / BYAF Character export is blocked;
- related Character import/export/delete/duplicate/connection controls are hidden.

These SillyTavern capabilities remain available for non-Native legacy chats/cards. N10 does not delete genuine upstream Character/chat functionality; it prevents Active Native product flow from treating it as authority.

### World Info / FloorState boundary

N10 retains mature World Info generation/selection ABI behind the Native adapter while making the authority boundary explicit:

- Native World Info candidates come from pinned Native Knowledge via `nativeSessionRuntime.knowledgeEntries()`;
- Native World Info event state reads from SessionRevision-backed Native state;
- accepted Native World Info event changes stage/commit through `nativeSessionRuntime.stageState()` / `updateState()`;
- FloorState is used only by the non-Native World Info branch;
- Native self-owned modules do not use FloorState/chat structural events as Session authority.

Therefore `WorldInfoRepo`, `worlds/<name>.json`, book names, numeric WI `uid`, chat-lorebook and character primary/auxiliary lorebook selection cannot silently become Native authority.

### N10 residual guard

Added:

- `scripts/check-n10-native-hard-cutover.mjs`

The gate scans Active Native authority/product surfaces and prevents reintroduction of:

- Character / JSONL / World Info persistence endpoint fallback;
- WorldInfoRepo / file-based World identity;
- Character/file/avatar identity in Native authority code;
- FloorState / structural message-event authority;
- committed Variant mutation primitives;
- Character/Games/WorldInfo Product Library authority adapters;
- Character Library route aliases;
- Native Manage Chat Files / Checkpoint Chat;
- Native Character/CardApp import/export identity;
- World Info adapter bypass of pinned Knowledge / SessionRevision state.

Final N10 run scanned **39 authority files** successfully.

### R7 Shell after hard cutover

N10 preserves the R7 Shell and route authority while updating acceptance to current Native product semantics.

The final browser gate proves:

- one `#sheld`, `#chat`, `#send_form`, and `#send_textarea` host;
- Native Works → Work detail → EntryPoint → Play;
- Native Timeline / Context controls;
- Library Worlds & Knowledge;
- Native Studio;
- Runtime;
- Plugins;
- Settings;
- return to Native Play;
- desktop → compact/mobile survival and Bottom Navigation;
- R7 final-hardening / compatibility DOM contract.

Historical R7 browser assertions that expected Character Library authority or committed Edit/Regenerate/Swipe product behavior are intentionally superseded by N9/N10 and are not current acceptance criteria.

### N10 final validation

Exact HEAD `031971954d907a930f0db8ed0bf1d1eefeaf43ef` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: success;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Native Knowledge Runtime Integration: success;
- N7 Native Context Architecture / Checkpoint C: success;
- N8 Save System / Checkpoint B: success;
- N9 Product UI Cutover: success;
- N10 focused hard-cutover regression: **5 suites / 69 tests passed**;
- N10 Native authority residual guard: **39 authority files scanned, passed**;
- N10 guard syntax and source lint: success;
- N10 R7 Shell unit regression: **13 suites / 58 tests passed**;
- N10 R7 Shell real-host Chromium regression: **4 passed**;
- complete Node regression: **757 suites / 8803 tests passed**;
- frontend webpack build: success.

The complete Node regression ran with MySQL/PostgreSQL services enabled.

### Final architecture boundary

The Active Native product path now uses these authorities end-to-end:

```text
Package / PackageVersion / EntryPoint
        ↓
WorldRevision + KnowledgeRevision + KnowledgeBinding
        ↓
Session / Branch
        ↓
immutable TimelineEntry + birth Variant
        ↓
SessionRevision
        ↓
SavePoint / .atriasave
        ↓
bounded ContextPlan + source-backed derived state
```

Character files, JSONL chats, legacy World Info files, mutable chat floors, Swipe selection and in-place committed edits are not fallback Native authorities.

Mature SillyTavern generation/Character/World Info machinery remains where required as host/runtime ABI behind adapters. N10 is a hard product-authority cutover, not a total upstream runtime rewrite.

---

## Final integration record — merged 2026-09-22

**Atria Native Content & Session Architecture Refactor N0–N10 is complete, validated, merged into `main`, and frozen.**

### Final validated code

- Final refactor HEAD: `7391fd7fb7868d7c5a2816ac922dea2142175a92`
- Native workflow: **Native Content Session Dev Checks #245**
- Native run: `35749007807`
- Result: **success**
- Final PR: **#83 — refactor: complete native content and session architecture**
- Merge commit / integrated `main`: `fd9a493c9040b32f4892bd92531030e58b066244`
- Integrated-main verification: `main` points exactly to the merge commit; final refactor HEAD is its direct ancestor.

The earlier N10 phase-validation HEAD `031971954d907a930f0db8ed0bf1d1eefeaf43ef` remains a valid N10 checkpoint. The commits between that checkpoint and the final refactor HEAD are integration/acceptance hardening for the retained SillyTavern / World Info adapter ABI and R7 mobile embedded workspace. They do **not** restore Character, JSONL, legacy World Info file, Swipe/Variant-switch, FloorState, or other retired Native authorities.

### Final Native validation

Exact final HEAD `7391fd7fb7868d7c5a2816ac922dea2142175a92` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: success;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Native Knowledge Runtime Integration: success;
- N7 Native Context Architecture / Checkpoint C: success;
- N8 Save System / Checkpoint B: success;
- N9 Product UI Cutover: success;
- N10 focused hard-cutover regression: **5 suites / 69 tests passed**;
- N10 Native hard-cutover residual guard: **39 authority files scanned, passed**;
- N10 R7 Shell unit regression: **13 suites / 58 tests passed**;
- N10 R7 Shell real-host Chromium regression: **4 passed**;
- complete Node regression: **758 suites / 8805 tests passed**;
- frontend webpack build: success.

The complete Node regression ran with MySQL/PostgreSQL services enabled.

### Final PR validation

PR #83 required integration checks all passed on final HEAD:

- **Atria PR Checks #782** — success;
- **Workspace UI #202** — success;
- **Immersive Experience #49** — success;
- **Worldbook Performance Foundation #390** — success.

Worldbook #390 specifically passed:

- focused regression: **22 suites / 255 tests**;
- isolated real-host Chromium smoke: success;
- legacy World Info runtime ABI acceptance: **20 passed**;
- modern World Info workspace acceptance: **3 passed**;
- mobile World Info startup/layout stress: **3/3 passed**.

### World Info mobile / compatibility hardening

Final PR validation exposed an old acceptance mismatch after the N9/N10 product cutover: historical World Info/Character E2E helpers still entered retired product routes, and the retained World Info editor adapter had an implicit mobile embedded-layout contract.

The final integration hardening therefore:

- runs legacy Character / World Info behavior ABI acceptance in the explicit R7 legacy recovery host;
- keeps modern Atria product routing pointed at Native Worlds & Knowledge;
- keeps the normal-shell real-host World Info adapter smoke;
- gives embedded `#WorldInfo` an explicit root → `#wi-holder` → `#world_popup` → `#wi_workspace_shell` flex/height/visibility contract independent of legacy drawer rules;
- makes `mountWorldInfoWorkspace()` explicitly preserve/restore `hidden` and `aria-hidden`;
- adds an embedded layout contract regression;
- stress-runs the mobile workspace startup/layout acceptance three times.

The final mobile failure was diagnosed from real Chromium computed layout: the E2E compatibility host itself was `390 × 0`, collapsing all children. The host is now pinned to the actual Playwright viewport and fail-closes if it does not fill that viewport before the editor is mounted.

This hardening preserves the frozen N10 boundary: mature SillyTavern World Info machinery remains adapter/runtime ABI only, while Native Worlds & Knowledge remains product and persistence authority.

### Integrated architecture

The merged Active Native product authority remains:

```text
Package / PackageVersion / EntryPoint
        ↓
WorldRevision + KnowledgeRevision + KnowledgeBinding
        ↓
Session / Branch
        ↓
immutable TimelineEntry + birth Variant
        ↓
SessionRevision
        ↓
SavePoint / .atriasave
        ↓
bounded ContextPlan + source-backed derived state
```

No hidden Character/JSONL/WorldInfo-file/Swipe/FloorState fallback authority was restored during final integration hardening.
