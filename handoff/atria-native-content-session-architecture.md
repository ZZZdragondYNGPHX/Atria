# Atria Native Content & Session Architecture — implementation handoff

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current phase status: **N2 — Package / Project / World & Knowledge Composition validated**
- N0 validated HEAD: `e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`
- N1 validated HEAD: `fd6ad1b423b6cd18fcb5da184f75ed82d7117368`
- N2 validated HEAD: `bfa048dd2adc5bf6e90cfea47812be7bf7f4dcdb`
- N2 workflow: **Native Content Session Dev Checks #43**
- N2 run: `35677654858`
- Next phase: **N3 — Native Session Core**
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

## N3 target

Start **N3 — Native Session Core** only.

Implement:

- Session;
- BranchGraph;
- TimelineEntry;
- Variant;
- SessionState base;
- SessionRevision;
- SavePoint primitive;
- resolved KnowledgeBindingSet pinned to exact revisions;
- load/reload behavior;
- branching using opaque IDs, not copied chat filenames.

Checkpoint A exit:

> Pure Native tests can create Package → EntryPoint → Session → Timeline → Branch → Revision and reload it without PNG/JSONL authority, while preserving exact World/Knowledge dependencies.

## N3 boundaries

Do not:

- redesign or recreate N0 contracts;
- redo N1 storage foundation;
- redo N2 Project/Package composition;
- create another branch;
- merge to `main`;
- introduce Character/Chat/World Info persistence fallback;
- introduce dual-read or dual-write Native persistence;
- use name/path/filename/index as identity;
- start N4 runtime projection early unless required only as a compile-time interface seam;
- start N6 KnowledgeCompiler;
- start N8 production UI cutover;
- start N9 legacy retirement.

## Start N3 by reading

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`
6. current `src/native/*`
7. current `src/native/repositories/*`
8. N2 Project/Package composition tests
9. current SessionRepo / SavePointRepo / Native resource key implementation and tests

Begin from live remote branch HEAD. Preserve validated N0/N1/N2 and continue N3 only.
