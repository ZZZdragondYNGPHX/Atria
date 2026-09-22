# Atria Native Content & Session Architecture — implementation handoff

## Current state

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current phase status: **N0 — Native Contracts & Identity validated**
- Final N0 validated HEAD: `e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6`
- Next phase: **N1 — Native Storage Foundation**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`
- Implementation sequence: **N0–N9**

Do not merge to `main` yet. This long-lived refactor branch remains isolated through N9.

## N0 completed

N0 froze and implemented:

- opaque Native IDs for Package / PackageVersion / Actor / EntryPoint / Project / Session / Branch / TimelineEntry / Variant / SessionRevision / SavePoint / AssetRef;
- World IDs: `world_*`, `worldv_*`;
- Knowledge IDs: `kb_*`, `kbv_*`, `kentry_*`, `kbind_*`;
- Native entity and identity invariants;
- Package v2 logical manifest/schema;
- `.atriasave v1` logical manifest/schema;
- capability / permission vocabularies;
- Native Store schema v1 resource identities;
- World / immutable WorldRevision;
- KnowledgeBase / immutable KnowledgeRevision / stable KnowledgeEntry / KnowledgeBinding;
- optional Knowledge discovery / applicability / lifecycle / relations / delivery semantics;
- immutable Package World/Knowledge snapshots and reference-integrity checks;
- EntryPoint `worldIds[]`, optional `primaryWorldId`, `knowledgeBindingIds[]`;
- SessionRevision `knowledgeHead` for resolved Knowledge dependency pinning;
- first-class Native Store World/Knowledge families and resource keys;
- guards rejecting name/filename/path/index identity, World Info numeric `uid`, world/book name identity, and character/chat/global Knowledge scope as Native authority.

Important N0 boundaries:

- Package/World Knowledge is immutable authored canon, not current Session truth.
- current World state and Event Journal remain Session authority.
- Library Knowledge revisions are immutable and Sessions must pin exact revisions.
- Knowledge `augment`/`override` never grants deterministic Runtime/current-state authority.
- Project/Package/Library/Session Knowledge lifecycles remain distinct.
- mature World Info selection machinery is not replaced in N0.

## Validation

- Workflow: **Native Content Session Dev Checks #12**
- Run: `35673592841`
- Result: **success**
- Native contract suites: **2 passed / 52 tests passed**
- Adjacent `.atria` / Game Runtime package/session / Storage naming suites: **5 passed / 42 tests passed**
- `src/native/*.js` ESLint: success
- full root ESLint: success
- Android/Docker: not run; not required by N0 touched surfaces

## Do not redo

- Do not recreate N0 IDs or parallel schemas.
- Do not restore arbitrary Package `worlds` / `knowledge` JSON slots.
- Do not restore EntryPoint `world` payloads.
- Do not use World/Knowledge names, files, `uid`, character/chat scope, or array indexes as Native identity.
- Do not put Native World/Knowledge runtime authority into `named_docs`.
- Do not introduce PNG/JSONL/World Info fallback authority.

## N1 target

N1 implements the storage foundation only:

- PackageRepo;
- WorldRepo for **Library World authority only**;
- KnowledgeRepo for **Library Knowledge authority only**;
- SessionRepo skeleton/records;
- SavePointRepo;
- AssetStore;
- Native StorageTransaction resource kinds;
- FS / SQLite / MySQL / PostgreSQL parity;
- immutable revision and commit-last primitives;
- World/Knowledge revision/reference/GC primitives;
- focused contract / round-trip / chaos coverage.

WorldRepo must not own Package World snapshots or Session World state. KnowledgeRepo must not own Package Knowledge snapshots or Session-local Knowledge.

## Start N1 by reading

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`
6. current `src/native/*`
7. current `src/storage/engines/types.js`
8. current engine implementations / transaction layers / parity harnesses

Preserve `refactor/atria-native-content-session-architecture@e532d3c31f69bd8ceb04d9fa59ea3d4a18e0d2c6` as the validated N0 baseline. Continue on the same branch; do not create another task branch.
