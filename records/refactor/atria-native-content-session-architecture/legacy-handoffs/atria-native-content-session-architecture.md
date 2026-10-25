# Atria Native Content & Session Architecture — implementation handoff

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- N7 run: `35711043211`
- N7 result: **success**
- N8 run: `35715208736`
- N8 result: **success**
- Next action: **N9 — Product UI Cutover**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`
- N9 prompt: `docs:handoff/atria-native-session-n9-prompt.md`
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
- entry/file/total-size limits;

It is not a renamed ZIP.

The protection layer is tamper detection + casual reverse-engineering resistance, not a claim of secrecy from a determined end user.

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

### Install / reopen

Implemented `PackageInstaller`.

Install authority:

- PackageRepo = Package/PackageVersion metadata + current pointer;
- AssetStore = immutable Package container blob + contained asset blobs.

Reopen uses only PackageRepo + AssetStore. It does not query WorldRepo or KnowledgeRepo.

The N2 end-to-end test proves this using separate author and target stores: the target has no matching World/Knowledge Library records but successfully reopens the exact vendored content.

### Studio Preview seam

`StudioPreviewHost` creates ephemeral `preview_*` records.

Properties:

- `persisted: false`;
- keyed back to `projectId`;
- writes no `atri_session` records;
- does not contaminate the normal Session list.

Full product UI routing remains deferred to N8.

### Existing `atria-distribution v1`

`src/game-package/distribution.js` remains temporarily as an adjacent Game Runtime regression surface.

It is **not** part of the Native N2 build/install path, not a Native fallback, and not dual-read authority.

Its product-facing retirement/rerouting remains scheduled for N8/N9. Do not delete it early while starting N3.

## N4 startup reading

Read live remote main instructions, both docs handoffs, the Master Plan, `src/native/session-core.js`, `session-snapshot.js`, `session-knowledge.js`, SessionRepo/SavePointRepo, all three N3 test suites, then relevant current runtime/projection code. N3 repo primitives are not a second runtime engine.

### Engineering guidance receipt

`tavern-card-builder` startup route used; The existing Master Plan and current Native source are the implementation authority. No design catalog candidate, card-format adapter or version-sensitive host API was adopted in N3.

## N4 in-progress checkpoint — 2026-09-22

**Status: implementation checkpoint only; N4 exit NOT satisfied.** The user requested an immediate push and handoff because their usage quota was nearly exhausted. Stop at this checkpoint; the next conversation must continue N4, not start N5.

- Working branch: `refactor/atria-native-content-session-architecture`
- Pushed checkpoint HEAD: `f3ac20f80f4691eee1d3c7ccab555a39e4322d3b`
- main remains untouched; no new branch or main merge.
- Do not carry N3 #44 success forward as N4 evidence.

### Implemented at the checkpoint

- `SessionCore.applyTimelineCommands`: explicit append/revise/select/remove/removeVariant intents in one immutable revision and HEAD-CAS publication; reuses `_publish`/SessionRepo, no second persistence engine.
- `forkBranch` optionally accepts an exact message/variant within the selected revision. Earlier full-revision forks remain covered by N3 regressions.
- `public/scripts/native/session-projection.js`: Package Actor profile and selected Session revision -> transient character/chat/swipe ABI, stable opaque message/variant mappings, changes to a known projection -> explicit commands. Not a Session importer or authoritative whole-chat save.
- `public/scripts/native/session-runtime.js`: explicit open/reload/close/fork/switch seam, serialized Timeline writes, CAS failure latch, read-only historical projection, native upload transport.
- `src/endpoints/native-session.js`: authenticated server-owned handle, create/load/allowlisted command/upload/read routes. Runtime writes require expectedRevisionId. No arbitrary repository method dispatch.
- `public/script.js`: exported `openNativeSession` seam and Native interception of append/patch/save/reload; projected characters occupy a transient array slot; DOM host itself is not replaced. Native regenerate is routed toward the existing swipe generator; browser behavior still needs proof.
- bookmarks branch routing, Package Regex provider contribution, Native pinned Knowledge candidates entering existing World Info selection without loading legacy books.
- `populateFileAttachment` routes uploads to AssetStore in Native mode; logical assetId is retained in Timeline variant metadata, download URL is derived. AssetRef deletion retains immutable Timeline variant references.
- Native character-state calls return `native_state_integration_pending`; chat state resolves no legacy target. Full state backend integration remains N5. Compatibility metadata is currently transient rather than fully persisted.

### Required continuation — do not report N4 done

1. Fetch and read the live remote work branch and docs again; do not reset to this SHA if another session advanced it.
2. Inspect the whole checkpoint diff against N3, especially runtime write timing, identity binding across streaming/swipe/edit, early-save callbacks, switching/closing during queued operations, failure/reload behavior and remaining direct legacy endpoint calls. Unit pass is not sufficient evidence for these seams.
3. Add isolated real-host browser coverage using the actual Atria server/SPA and existing mock-LLM helpers. Prefer a fresh test-owned data root; do not copy private developer data or use their real configured provider. Existing `_lib/server.js` supports `useExistingDataRoot`; its default clone path uses Unix `cp`, so Windows needs the explicit fresh-root route. No live host was started here.
6. Preserve R7 original node identities and uniqueness for `#sheld`, `#chat`, `#form_sheld`, `#send_form`, `#send_textarea`; existing unit tests do not establish actual browser lifecycle behavior.
7. Review compatibility field mapping with real selector fixtures before claiming World Info compatibility.
8. Full N5 state integration, N7 saves, N8 UI cutover and N9 retirement remain unimplemented. Do not promote this development seam to production UI yet.
9. Obey the Master Plan long-CI/external-input stop rules.
10. The present handoff is an N4 continuation prompt.

### Guidance receipt

`tavern-card-builder` and focused API/runtime skills read; library route `tavern-card-builder`, snapshot `2026-08-18`, ST-A0 opening gates used. Current repository source, not recalled upstream signatures, supplied API provenance. No design catalog candidate was adopted.

---

## Final integration record — merged 2026-09-22

### World Info mobile / compatibility hardening

The final integration hardening therefore:

- keeps modern Atria product routing pointed at Native Worlds & Knowledge;
- keeps the normal-shell real-host World Info adapter smoke;
- gives embedded `#WorldInfo` an explicit root → `#wi-holder` → `#world_popup` → `#wi_workspace_shell` flex/height/visibility contract independent of legacy drawer rules;
- makes `mountWorldInfoWorkspace()` explicitly preserve/restore `hidden` and `aria-hidden`;
- adds an embedded layout contract regression;

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
