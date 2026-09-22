# Atria Native Content & Session Architecture — implementation handoff

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current phase status: **N1 — Native Storage Foundation validated**
- N0 validated HEAD: `e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`
- Final N1 validated HEAD: `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`
- N1 workflow: **Native Content Session Dev Checks #23**
- N1 run: `35676169036`
- Next phase: **N2 — Package / Project / World & Knowledge Composition**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`
- Implementation sequence: **N0–N9**

Do not merge to `main` yet. This long-lived refactor branch remains isolated through N9.

## N0 frozen — do not redo

N0 froze:

- Package / PackageVersion / Actor / EntryPoint;
- Project;
- Session / Branch / TimelineEntry / Variant;
- SessionRevision / SavePoint / AssetRef;
- World / WorldRevision;
- KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding;
- opaque Native IDs including `world_*`, `worldv_*`, `kb_*`, `kbv_*`, `kentry_*`, `kbind_*`;
- Package v2 logical schema;
- `.atriasave v1` logical schema;
- Native Store schema v1 resource identities;
- EntryPoint World/Knowledge references;
- SessionRevision `knowledgeHead`.

Native identity must never derive from name, filename, path, `uid`, `charDir`, characterId, message index, or swipe index.

## N1 completed

N1 established the Native storage foundation without making old SillyTavern persistence a Native authority.

### Storage resource model

- all N0-frozen `atri_*` resource kinds are first-class `StorageTransaction` resources;
- Native runtime/content records are not hidden inside `named_docs`;
- FS stores Native resource envelopes under `atria-native/resources/<kind>/` using opaque key-derived file IDs;
- SQLite / MySQL / PostgreSQL use dedicated `native_resources` storage;
- SQL storage schema advanced to version 2 through additive migrations;
- SQL Native OCC writes execute inside the engine transaction;
- FS keeps its documented no-cross-resource-rollback semantics.

The physical SQL table is shared, but logical resource identity/kind remains first-class and N0-authoritative. This avoids duplicating 17 nearly identical physical tables while preserving dedicated Native storage semantics.

### Repositories

Implemented and wired into storage bootstrap:

- `PackageRepo`
- `WorldRepo`
- `KnowledgeRepo`
- `SessionRepo` foundation
- `SavePointRepo`
- `AssetStore`

Authority boundaries:

- WorldRepo owns **Library World** records/revisions only.
- KnowledgeRepo owns **Library Knowledge** records/revisions/entries/bindings only.
- KnowledgeRepo rejects package/session/project KnowledgeBinding ownership.
- Package-contained World/Knowledge snapshots remain N2 Package content.
- Session-local Knowledge remains later Session authority.
- current Session World State is not stored in WorldRepo.

### Immutable revision / commit-last model

Implemented immutable-write primitives for:

- PackageVersion;
- WorldRevision;
- KnowledgeRevision + revision-scoped KnowledgeEntry records;
- Variant;
- SessionState heads;
- SessionRevision;
- SavePoint.

FS observable commit semantics are commit-last:

1. write immutable children/revision content;
2. publish immutable revision manifest;
3. update current/root/Session HEAD pointer last.

If the final pointer publish fails on FS, only an unreferenced immutable orphan may remain. It is not treated as committed state and can be garbage-collected.

Root create/save operations reject dangling currentVersion/currentRevision pointers.

### Reference / GC foundation

Implemented:

- PackageVersion reference checks against Package current pointer and Sessions;
- PackageVersion GC preserving current, Session-pinned, and explicitly retained versions;
- WorldRevision GC preserving current/retained revisions;
- WorldRevision validation of referenced Library KnowledgeBindings and AssetRefs;
- KnowledgeRevision GC preserving current, Library-binding-pinned, and retained revisions;
- KnowledgeEntry relation closure inside the same immutable KnowledgeRevision;
- KnowledgeBinding deletion protection while WorldRevisions reference it;
- KnowledgeBase deletion protection while Library bindings reference it;
- SessionRevision reference checks against Session HEAD and SavePoints;
- SessionRevision GC preserving HEAD, SavePoint-pinned, and retained revisions;
- AssetRef deletion protection while WorldRevisions reference it;
- content-addressed immutable Asset blobs with reference-aware blob GC.

### AssetStore

- blobs are SHA-256 content-addressed;
- large blobs stay outside SQL JSON documents;
- logical `asset_*` references remain Native resources;
- identical bytes deduplicate even when logical asset IDs/names differ;
- blob is written before logical reference publication;
- a failed logical publication can leave only an unreferenced blob, which GC can remove.

### Backup / parity

- Native SQL rows are included in MySQL/PostgreSQL dump/restore;
- delete-user parity includes Native rows;
- FS / SQLite / MySQL / PostgreSQL share the same Native resource observable contract;
- all 17 frozen Native resource kinds are covered by cross-engine round-trip tests;
- no PNG / Character JSON / JSONL / World Info fallback was introduced.

## N1 validation

Final validated HEAD:

`fd6ad1b423b6cd18fcb5da184f75ed82d7117368`

Workflow:

- **Native Content Session Dev Checks #23**
- run `35676169036`
- result: **success**

Results:

- N1 Native Storage Foundation: **9 suites / 64 tests passed**
- N0 Native contracts: **2 suites / 52 tests passed**
- adjacent `.atria` / Game Runtime / Storage regressions: **5 suites / 42 tests passed**
- N1 source ESLint: success
- full root ESLint: success
- MySQL schema v2 parity: success
- PostgreSQL schema v2 parity: success
- SQL dump/restore parity with Native resources: success
- delete-user parity with Native resources: success
- FS commit-last chaos tests for Session / World / Knowledge: success
- Android/Docker: not run; N1 did not touch Android Kotlin or Docker delivery behavior

## N2 target

Start **N2 — Package / Project / World & Knowledge Composition**.

Implement only:

- ProjectStore keyed by `projectId`;
- Studio project routing/storage away from character identity;
- Project-owned World/Knowledge source;
- exact Library WorldRevision / KnowledgeRevision authoring references;
- dependency-closure resolution;
- missing/cyclic dependency validation;
- Source Project → build flow;
- `.atria` Package Container v2;
- vendoring exact World/Knowledge snapshots into immutable PackageVersion;
- Package install into PackageRepo + AssetStore;
- PackageVersion immutability;
- package validation/security/permission preflight;
- ephemeral Studio Preview session seam.

N2 runtime invariant:

> A built/installed PackageVersion must be self-contained for its World/Knowledge dependencies. Runtime must not require the target machine's live Library to contain the authoring-time dependencies.

## N2 boundaries

Do not:

- redesign N0 identity/contracts;
- replace the N1 repository/storage model;
- create another branch;
- restore PNG/Character JSON/JSONL/World Info as Native fallback;
- add dual-read or dual-write compatibility;
- use name/filename/path/uid/character identity as Project or Package identity;
- start N3 full Session core;
- start N6 KnowledgeCompiler;
- start N8 UI cutover;
- start N9 legacy retirement.

## Start N2 by reading

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`
6. current `src/native/*`
7. current `src/native/repositories/*`
8. current `src/storage/engines/native-resource-key.js`
9. current Package/Game Runtime/Studio project/build/`.atria` implementation and tests

Preserve all history through validated N1 HEAD `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`. Continue on the same branch and begin N2 only.
