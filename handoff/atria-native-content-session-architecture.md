# Atria Native Content & Session Architecture — implementation handoff

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current phase status: **N3 — Native Session Core validated**
- N0 validated HEAD: `e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`
- N1 validated HEAD: `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`
- N2 validated HEAD: `bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`
- N2 workflow: **Native Content Session Dev Checks #43**
- N2 run: `35677654858`
- N3 validated HEAD: `c42ee3e98a27fbea97ded0917de081bcc8893680`
- N3 workflow: **Native Content Session Dev Checks #44**, run `35679448236`, **success**
- Next phase: **N4 — SillyTavern Runtime Projection**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`
- Implementation sequence: **N0–N9**

Do not merge to `main` yet. Keep the long-lived refactor branch isolated through N9.

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
