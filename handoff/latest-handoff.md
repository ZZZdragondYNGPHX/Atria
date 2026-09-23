# Active checkpoint: Native Authoring Platform A2 complete; ready for A3

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A2 — Library & Resource Architecture.**

Prior Native Content & Session Architecture N0–N10 remains complete and frozen. A0/A1 remain frozen and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A3 — Native Game Runtime Cutover**
- Continue on the same implementation branch. Do not create a new branch and do not merge `main`.

Formal plan design did not change during A2; no mechanical plan edit was required.

## A2 implemented

A2 established the Library/Resource architecture on top of the existing Native authorities.

### Registry / Library

- descriptor-driven `ResourceRegistry` backed by the frozen A0 Resource Descriptor contract;
- core descriptors for Project, Actor, World, Knowledge, KnowledgeEntry, KnowledgeBinding, Asset and Package;
- plugin-provided descriptors can register without creating a new Native persistence authority;
- `NativeLibraryService` lists Library resources and resolves exact immutable WorldRevision / KnowledgeRevision / Asset content hash / PackageVersion identities.

### Derived Resource Graph

`ResourceGraph` is **derived-readonly** and never owns business data.

It derives relationships from:

- ProjectStore;
- AssetStore;
- WorldRepo;
- KnowledgeRepo;
- PackageRepo when available.

It provides:

- resource discovery/search;
- forward references;
- reverse references / Used By;
- delete-safety inspection;
- dependency inspection;
- build-closure projection;
- generation/signature plus changed node/edge keys as the incremental refresh foundation.

Graph nodes preserve Project-owned vs Library-owned relationships, including direct Project-owned World references to exact Library asset/binding dependencies.

### Attach / Fork / explicit Update

All mutations continue through the A1 Authoring Operation → Workspace → ChangeSet → Validation → Commit path in `StudioService`.

Added operations:

- `resource.attach`
- `resource.fork`
- `resource.update`

Semantics:

- World Attach pins exact `worldId + worldRevisionId`;
- Knowledge Attach pins exact `knowledgeBaseId + knowledgeRevisionId`;
- Asset Attach pins exact `assetId + contentHash`;
- Attach never silently follows Library latest;
- explicit Update changes a pinned World/Knowledge revision only when the declared `fromRevision` still matches;
- Fork creates a Project-owned derivative and records exact Library origin provenance;
- Knowledge Fork allocates new base/revision/entry IDs and rewrites intra-Knowledge entry relations;
- Asset Fork creates a new project-owned asset/file rather than mutating the attached Library asset.

Project source dependencies now support exact Asset content identities, and package dependency closure fails closed if the stored content hash does not match the Library asset.

### Studio / Project Agent read surface

`StudioService` and `/api/native/studio/*` now expose read-only Resource discovery surfaces for later Studio UI and Project Agent work:

- Registry;
- Library listing;
- derived Graph;
- resource query;
- reference / reverse-reference lookup;
- delete-safety inspection;
- project build-resource closure.

The HTTP mutation helpers for Attach/Fork/Update route back into the same A1 Workspace/ChangeSet authority; no alternate write path was introduced.

## A2 validation

Validated at `8510e423a3faf492340fabc32a612d4796a875e3`.

### Native Authoring Platform A2 Checks #5

- Run: **35802642463**
- focused + adjacent Native regressions: **10 suites / 52 tests passed**
- A2 Library/Resource residual guard: **success**
- A2 guard syntax: **success**
- A0 hard-cutover guard: **success**
- A1 authoring backend guard: **success**
- A1 guard syntax: **success**
- focused ESLint: **success**
- full root lint: **success**

Focused/adjacent suites include:

- `native/resource-registry.test.js`
- `native/library-resource.test.js`
- `native/resource-graph.test.js`
- `native/library-authoring.test.js`
- `native/library-build-closure.test.js`
- `native/studio-resource-http.test.js`
- `native/studio-service.test.js`
- `native/project-composition.test.js`
- `native/package-build-install.test.js`
- `native/world-knowledge.test.js`

### Frozen-regression workflows on the same HEAD

**Native Authoring Platform A0 Checks #20** — Run **35802642446**

- **5 suites / 50 tests passed**
- A0 hard-cutover guard + syntax: success
- focused ESLint: success
- full root lint: success

**Native Authoring Platform A1 Checks #7** — Run **35802642487**

- **7 suites / 60 tests passed**
- A1 authoring backend guard + syntax: success
- focused ESLint: success
- full root lint: success

## Key decisions

- Resource Graph remains a projection/cache only; it cannot mutate canonical repositories.
- No LibraryRepo/ResourceRepo/ResourceGraphRepo was introduced.
- ProjectStore/AssetStore/WorldRepo/KnowledgeRepo/PackageRepo remain canonical.
- Library attachment identity is exact and immutable; there is no automatic latest tracking.
- Fork is an explicit ownership transition to a Project-owned derivative.
- Asset Attach is an exact dependency reference; copying bytes into the Project is reserved for Fork.
- World/Knowledge/Asset closure continues to reuse the existing Native package composition path.
- The A1 guard was updated only to remove its obsolete “A2 must not exist yet” phase gate; all A1 authority guards remain active.

## Not started

A2 deliberately did not implement:

- A3 Runtime Descriptor compiler / game-runtime authority cutover;
- `game.json` runtime replacement;
- charId runtime loading replacement;
- swipe-derived Game World branch removal;
- Chat State `atri_game_world` removal;
- A4 Component/Hybrid/Full runtime;
- A5 Plugin platform;
- A6/A7 frontend/Studio UX;
- A8 Project Agent product workflow.

## Next action — A3 only

Start **A3 — Native Game Runtime Cutover** from the actual latest remote HEAD of the same implementation branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. `src/native/authoring-contracts.js`
7. `src/native/authoring/studio-service.js`
8. `src/native/authoring/resource-graph.js`
9. `src/native/project-source.js`
10. `src/native/package-composition.js`
11. the existing Native Session / Branch / SessionRevision runtime implementation before touching game runtime authority.

A3 must reuse A0–A2 and the frozen N0–N10 Native authorities. Do not redo Library/Resource work.

Stop after A3 validation/handoff. Do not enter A4 early, do not create a new branch, and do not merge `main`.
