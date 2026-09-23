# Atria Native Authoring Platform & Product Frontend Refactor — Handoff

## Current status

Planning/design is complete and frozen. **A0 through A9 are complete and validated; Final Integration / Merge Main is next.**

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- Branch created directly from the baseline above and remains the single implementation branch.
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- A4 validated HEAD: `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`
- A5 validated HEAD: `eefd6550d9b2af6c2777984e12d5f61de0898415`
- A6 validated HEAD: `e33704b91ecb0373902132fe8af9c80b204aa8ce`
- A7 validated HEAD: `40cb1b98ecbf2ccf76599421ea1ccf625af35071`
- A8 validated HEAD: `a5430d41c010aca297b77184271d4cf2819a5631`
- **A9 validated HEAD: `8233c0dfe34989c294d18a93eae57f38eb70030a`**
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Prior Native Content & Session Architecture N0–N10 remains complete and must not be redone.
- A9 is complete. Do not resume implementation; Final Integration / Merge Main is the only remaining phase.

## Task identity

This refactor is:

**Atria Native Authoring Platform & Product Frontend Refactor**

It is a hard-cutover product/authoring/runtime/frontend refactor, not a compatibility upgrade.

Operating rule:

> Default to removal. Legacy code may be mined for mature capabilities, but legacy authoring/runtime/product authority is not preserved merely for compatibility.

## Frozen design

### Product IA

Primary domains:

- Play
- Library
- Build
- Agents
- Runtime

Global utilities:

- Search / Command
- Diagnostics
- Plugins
- Settings
- Account

`Studio` ceases to be a primary domain. Build owns project management; Atria Studio is the project workspace.

### Experience

Four explicit Native experience modes:

- Text
- Component
- Hybrid
- Full

Text is a complete first-class game mode.

Component / Hybrid / Full share one Component Model; they differ in surface composition/stage ownership rather than using separate UI engines.

### World / Knowledge

World/Knowledge/worldbook authoring is core game-asset functionality.

Native authority remains:

- World / WorldRevision
- KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding

Do not restore old World Info filename/numeric-uid/selected-world-info/character-lore identity as Native authority.

### Library

Library is the reusable asset repository. Target reusable categories include Works, Actors, Worlds, Knowledge, UI Components, Skills, Plugins, Presets, Processors, Templates and media.

Project/Library relationships:

- Attach exact immutable revision/content hash
- Fork to project-owned derivative
- Create / Import project-owned resource
- Publish reusable project resources back to Library where supported

Release `.atria` builds resolve a self-contained immutable dependency closure.

### Resource model

Create a Resource Registry extensible by Atria Core and Plugins.

Resource Graph is **derived only**. It supports search, references, dependencies, build closure, AI retrieval and delete safety but is never writable/canonical authority.

Plugins may define authoring resource types but may not create new competing Native persistence/Session/Timeline/Package/World-state authorities.

### Authoring backend

Create a dedicated Native authoring boundary (StudioService / `/api/native/studio/*` or equivalent), backed by ProjectStore/AssetStore/World/Knowledge/package/build/preview/Git services.

No Native authoring path uses `charId` identity.

### Human + AI

Human structured editors, source editors and Project Agent share Authoring Operations → Workspace → ChangeSet → Validation → Commit.

AI has no privileged write path.

Concurrency uses explicit project revisions and optimistic conflict handling. Do not silently rebase AI changes over human edits.

Project Agent model:

Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate/Preview → Review → Commit.

AI-disabled Studio must remain fully functional.

### Plugin / Skill

- Plugin = executable/system capability and Build/Play contribution.
- Skill = AI knowledge/workflow/guidance.

New Native skill scopes include at least global/project/package; Character scope is not part of new Native authoring identity.

Host Plugin may execute under the new Atria Plugin API.

Package runtime v1 **does not execute arbitrary package JavaScript**. It is declarative/capability-defined. A truly programmable isolated package plugin runtime is deferred.

### Game Runtime hard cutover

Retain/migrate mature logic algorithms (commands, reducers, rules, formula, deterministic RNG, selectors, interpretation/simulation/turn concepts where compatible).

Retire:

- `game.json` runtime/package authority
- charId package identity
- `/api/card-app/*` runtime loading
- swipe-id-derived game branch authority
- Chat State `atri_game_world` authority
- independent Game World branch/timeline authority

Target:

Native Package → Runtime Descriptor → Game Runtime → Native Session / Branch / SessionRevision.

### CardApp / old Studio

After replacement capabilities exist, remove:

- `public/scripts/extensions/character-editor-assistant/studio/*`
- CardApp Studio/runtime product paths
- `src/endpoints/card-app.js`
- `/api/card-app/*`
- charId Studio identity
- Character-sidecar Studio/AI sessions
- old CardApp Git/history/build/import path
- old Studio AI tool names

Do not keep compatibility aliases.

### Product frontend

All official product surfaces converge on one Atria Product UI System using `--atri-*` tokens, shared primitives/patterns and consistent responsive/navigation/Inspector behavior.

Final product-facing surfaces must not rely on reparented SillyTavern DOM as their official implementation.

Targets include:

- Atria-native Play Conversation / Message Renderer / Composer / Session Header / Play Toolbar
- Library master-detail asset browser
- Build landing + full Studio
- Agents integrated into the main shell/design system
- Runtime productized around Overview/Roles/Connections/Presets/Capabilities
- new Atria Plugins UI with Legacy isolated under Advanced
- Skills primarily under Library and project attachment under Build
- Atria-native primary Settings and Account surfaces
- unified Diagnostics
- search results navigate to the authoritative domain/route rather than rendering foreign-domain content in-place
- mobile Build uses separate Project/Editor/Preview/AI/More views, not squeezed desktop panes

SmartTheme may remain only as a legacy theme input adapter; it is not the new product design contract.

## Explicitly deferred/out of scope

- migration of old CardApp/game.json/legacy Studio project data
- compatibility aliases for removed authoring APIs
- arbitrary-JS package plugins
- full online/community plugin marketplace
- real-time multi-user collaboration
- cloud IDE/Codespaces replacement
- full media editors
- arbitrary HTML ↔ visual designer round trip
- one dedicated Native repo per Library asset type
- unrelated rewrites of already-correct AI/orchestration algorithms

## Implementation phases

Use the same implementation branch for all phases:

- **A0** — Contracts & Hard-cutover Guards
- **A1** — Native Authoring Backend
- **A2** — Library & Resource Architecture
- **A3** — Native Game Runtime Cutover
- **A4** — Experience Runtime
- **A5** — Plugin & Skill Platform
- **A6** — Native Product Frontend
- **A7** — Studio Authoring UX
- **A8** — Project Agent / Vibe Coding
- **A9** — Hard Cutover & Product Finalization

After every phase: validate, commit/push, update docs/handoff, stop, and provide the next-phase takeover prompt. Do not create a new branch per phase. Do not merge `main` until the complete refactor reaches final integration.

## Current next action — Final Integration / Merge Main

A9 is complete and validated. Do not redo N0–N10 or A0–A9.

Before integration:

1. fetch `main`, `docs` and `refactor/atria-native-authoring-platform-product-frontend`;
2. confirm the implementation branch still points to A9 validated HEAD `8233c0dfe34989c294d18a93eae57f38eb70030a` unless a later explicitly documented validation commit exists;
3. re-read `main:AGENTS.md`, `main:FORK_MAINTENANCE.md`, `docs:handoff/latest-handoff.md`, the formal plan, and this handoff;
4. inspect any integration conflict against the A0–A9 authority model instead of restoring legacy compatibility.

Final Integration scope:

- create/update the PR from the implementation branch into `main`;
- run/confirm required PR CI;
- resolve ordinary integration conflicts without reopening architecture design;
- merge only when CI is green;
- verify merged `main`;
- update final docs bookkeeping if needed;
- delete `refactor/atria-native-authoring-platform-product-frontend` after successful merge.

Do not restore CardApp/`game.json`/charId/swipe/Chat State authority to satisfy stale tests or integration conflicts.

---

## A0 implementation record — complete

A0 — **Contracts & Hard-cutover Guards** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- Baseline remains: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Formal plan remains unchanged; A0 required no architecture/scope redesign.
- Do not merge `main`; continue A1 on the same implementation branch.

### Implemented

A0 added `src/native/authoring-contracts.js` and exported it through the existing Native boundary. It freezes:

- explicit Experience modes: `text`, `component`, `hybrid`, `full`;
- one shared Component Model version for Component / Hybrid / Full;
- Resource Descriptor / Resource Registry contracts;
- Resource Graph mode as `derived-readonly`, never writable authority;
- Resource authority classification without creating a second repository/manifest authority;
- shared Authoring Operation / Workspace / ChangeSet contracts for human, agent and plugin origins;
- optimistic Project revision/conflict semantics;
- Project revisions as opaque tokens rather than a forced SHA-256 representation, allowing A1 Git/history integration without creating another Project authority;
- Native Runtime Descriptor referencing existing Package / PackageVersion / EntryPoint identities and reusing the existing Package capability vocabulary;
- Atria Plugin contract separating executable Host Plugin entrypoints from package runtime;
- package-runtime-v1 as declarative/capability-defined only, with arbitrary package JavaScript/module/worker/eval payloads rejected;
- Native Skill scopes: global / project / package; Character scope is not accepted.

A0 also added:

- `scripts/check-a0-native-authoring-hard-cutover.mjs`;
- `.github/workflows/native-authoring-platform-a0.yml`;
- `tests/native/authoring-contracts.test.js`.

The residual guard prevents the new Native authoring implementation plane from restoring:

- CardApp / `/api/card-app` authority;
- `game.json` / `GAME_MANIFEST_PATH` runtime authority;
- charId / Character identity;
- swipe-derived identity;
- Chat State / FloorState game authority.

Existing N0–N10 Package / World / Knowledge / ProjectStore / Session / Timeline / SessionRevision / Save / Context authorities were not duplicated or replaced.

### Validation

Validated on A0 HEAD `1e7d32ac74411e98a5003be72c5dc06d8d72966e`:

- Workflow: **Native Authoring Platform A0 Checks #4**
- Run: **35799024194**
- A0 + adjacent Native tests: **5 suites / 50 tests passed**
  - `native/authoring-contracts.test.js`
  - `native/contracts.test.js`
  - `native/project-composition.test.js`
  - `native/package-container.test.js`
  - `native/package-build-install.test.js`
- A0 hard-cutover residual guard: **success**
- Guard syntax check: **success**
- A0 focused ESLint: **success**
- Full root lint: **success**

### Explicitly not started

A0 did **not** implement:

- StudioService or `/api/native/studio/*`;
- project source CRUD/batch authoring backend;
- workspace persistence/transaction execution;
- Resource Graph implementation;
- Library attach/fork implementation;
- Runtime Descriptor compiler;
- new Studio/Product UI.

Those belong to A1+.

### A1 entry conditions

A1 may start only from the actual latest remote HEAD of the same branch, preserving A0.

Before A1 editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. this handoff

A1 must implement the Native Authoring Backend against the frozen A0 contracts. It must reuse ProjectStore / AssetStore / WorldRepo / KnowledgeRepo / existing package build/preview/Git seams, must not create a second Project or resource authority, and must not start A2 Library/Resource Graph product implementation early.


---

## A1 implementation record — complete

A1 — **Native Authoring Backend** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 base / prior validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- Baseline remains: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Formal plan remains unchanged; A1 implementation did not require a design/scope change.
- Do not merge `main`; continue A2 on the same implementation branch.

### Implemented

A1 added a dedicated Native authoring backend boundary:

- `src/native/authoring/studio-service.js`
- `src/endpoints/native-studio.js`
- mounted at `/api/native/studio/*`
- exported through the existing Native boundary.

`StudioService` reuses the existing Native authorities rather than creating new repositories:

- ProjectStore = canonical project source tree/manifest authority;
- AssetStore = asset/content authority;
- WorldRepo = World / WorldRevision authority;
- KnowledgeRepo = KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding authority;
- existing package composition/build path for immutable Package / PackageVersion output;
- existing StudioPreviewHost seam for non-persistent previews.

Implemented project/source operations:

- project list/get/create/delete;
- source list/read/write/move/delete;
- project manifest save through the same authoring operation pipeline;
- binary-safe source reads/writes using explicit base64 at the HTTP boundary.

Human, Project Agent and Plugin origins share the frozen A0 Authoring Operation contract. A1 built-in operation types are:

- `source.write`
- `source.move`
- `source.delete`
- `project.save`

All mutations flow through:

Authoring Operation → Workspace → ChangeSet → Validation → Commit.

There is no Agent-only write path.

### Transaction / validation behavior

A1 provides batch Workspace execution with ProjectStore snapshot/rollback semantics:

- operations are inspected before application;
- the whole source/manifest batch is restored if an operation throws;
- validator errors produce a failed ChangeSet with `resultingRevision: null` and restore the ProjectStore source;
- custom validation/diagnostic hooks can inspect the current ProjectStore plus WorldRepo / KnowledgeRepo / AssetStore authorities;
- `inspectWorkspace` exposes change fingerprints without mutating the project.

No second Workspace/ChangeSet persistence authority was introduced. ChangeSet is semantic authoring history; Git remains source history.

### Project revision and Git/history

Project revision is implemented as the full Git HEAD token of the ProjectStore directory. This remains compatible with the frozen A0 **opaque revision token** contract; A1 does not redefine revision as a new schema authority.

A1:

- initializes Git in the ProjectStore project directory when needed;
- synchronizes out-of-band ProjectStore source changes into source history before reading the current revision;
- records successful ChangeSets as Git commits;
- exposes history and per-revision diff inspection;
- uses `Atria Studio <studio@atria.local>` as the source-history identity.

Every mutating Workspace requires an explicit `baseRevision`. If it differs from the actual project revision, execution stops with:

`project_revision_conflict`

A1 does not silently overwrite, replay or automatically rebase stale Agent/human work.

### Build / preflight / preview / simulation seams

A1 exposes:

- build through the existing `buildProjectPackage` path;
- preflight/build report data from the existing package composition result;
- volatile Studio preview creation through `StudioPreviewHost`;
- preview ownership scoped to the authenticated handle;
- a simulation runner seam, returning `native_studio_simulation_unavailable` until a concrete simulator is supplied.

Studio preview/simulation do not create Session/Branch/Timeline authority.

### HTTP boundary

`/api/native/studio/*` is authenticated with the server-owned user handle and exposes:

- Projects
- Project revision
- Sources
- Workspace inspect / execute
- Validate
- History / diff
- Preflight
- Build
- Preview
- Simulation

The thin `/api/native/product/*` consumer API was not extended with StudioService or an alternate authoring write path.

### Supporting changes

- ProjectStore gained a safe project-relative `moveFile` primitive; it still refuses `.git` internals and direct manifest writes.
- Native exports include `StudioService` and A1 operation type constants.
- `src/server-startup.js` mounts `/api/native/studio`.
- `src/git/client.js` default Studio history identity is now Atria-branded.
- A1 added:
  - `tests/native/studio-service.test.js`
  - `tests/native/studio-http.test.js`
  - `scripts/check-a1-native-authoring-backend.mjs`
  - `.github/workflows/native-authoring-platform-a1.yml`

### Validation

Validated on A1 HEAD `bf09c79e07204ee39303e52e89a3da3b2f7617da`.

**Native Authoring Platform A1 Checks #2**

- Run: **35800275829**
- A1 focused + adjacent Native regressions: **7 suites / 60 tests passed**
  - `native/studio-service.test.js`
  - `native/studio-http.test.js`
  - `native/authoring-contracts.test.js`
  - `native/project-composition.test.js`
  - `native/package-build-install.test.js`
  - `native/package-container.test.js`
  - `native/world-knowledge.test.js`
- A1 authoring backend residual guard: **success**
- A1 guard syntax: **success**
- A1 focused ESLint: **success**
- Full root lint: **success**

A0 remained green on the same A1 HEAD:

**Native Authoring Platform A0 Checks #15**

- Run: **35800275737**
- A0 + adjacent Native regressions: **5 suites / 50 tests passed**
- A0 hard-cutover residual guard: **success**
- A0 guard syntax: **success**
- A0 focused ESLint: **success**
- Full root lint: **success**

### Key decisions

- ProjectStore remains the only project source/manifest authority.
- Git HEAD is an opaque revision/source-history token, not a second Project model.
- Workspace/ChangeSet execution is not a competing persistent source-history store.
- Stale base revisions always stop with `project_revision_conflict`; no silent rebase is performed.
- Human/Agent/Plugin origins share the exact same Authoring Operation path.
- A1 does not implement Resource Graph/Library attach/fork, Runtime cutover, Plugin platform or frontend/Studio UX.
- Existing World/Knowledge/Package/Session/Save authorities remain unchanged.

### Explicitly not implemented in A1

The following remain for later phases:

- Resource Registry implementation beyond the frozen A0 contract;
- derived Resource Graph;
- Library immutable snapshot/ref attach/fork/update workflow;
- World/Knowledge structured authoring operations beyond the current authority seams;
- Runtime Descriptor compiler / game-runtime cutover;
- Plugin contribution runtime;
- Build/Studio frontend UX;
- Project Agent task/repair UI and orchestration.

### A2 entry conditions

A2 may start only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0 and A1.

Use A1 `StudioService` / Authoring Operations as the mutation boundary. Resource Graph must be derived-readonly and must observe canonical ProjectStore/AssetStore/WorldRepo/KnowledgeRepo state rather than becoming a writable manifest/repository.

A2 should implement only **Library & Resource Architecture** and stop again after validation/handoff. Do not start A3 early.


---

## A2 implementation record — complete

A2 — **Library & Resource Architecture** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A1 prior validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- Formal plan remains unchanged; A2 implemented the frozen design without a material design/scope change.
- Do not merge `main`; continue A3 on the same implementation branch.

### Implemented

A2 added the concrete descriptor-driven `ResourceRegistry`, `NativeLibraryService`, derived-only `ResourceGraph`, and `LibraryAuthoringPlanner`.

Resource discovery now covers Project / Actor / World / Knowledge / KnowledgeEntry / KnowledgeBinding / Asset / Package, with plugin descriptors allowed through the frozen A0 provider contract.

The Library layer resolves exact immutable identities:

- World = `worldId + worldRevisionId`;
- Knowledge = `knowledgeBaseId + knowledgeRevisionId`;
- Asset = `assetId + contentHash`;
- Package = `packageId + packageVersionId`.

The Resource Graph derives from the existing canonical repositories and ProjectStore. It exposes search, references, reverse references, delete-safety, dependency inspection and build-closure projection. Refresh results include a stable signature/generation plus changed node/edge keys. It has no persistence/write API.

A2 added Authoring Operation types:

- `resource.attach`
- `resource.fork`
- `resource.update`

They execute inside A1 StudioService Workspace/ChangeSet transaction/validation/history semantics.

Attach pins exact immutable identities and never follows Library latest automatically. Explicit Update requires a matching `fromRevision` and a specific `toRevision`. Fork creates Project-owned derivatives with `atriaLibraryOrigin` provenance.

Project source dependency shape now also supports exact Library Asset dependencies `{ assetId, contentHash }`. Package/build closure validates the stored asset content hash and fails closed on mismatch.

Native Studio HTTP now exposes Registry/Library/Graph discovery, reference/reverse-reference inspection, delete-safety, project resource closure, and Attach/Fork/Update helpers. These HTTP helpers delegate to StudioService and are not an alternate mutation authority.

### Validation

Validated on A2 HEAD `8510e423a3faf492340fabc32a612d4796a875e3`.

**Native Authoring Platform A2 Checks #5**

- Run: **35802642463**
- focused + adjacent Native regressions: **10 suites / 52 tests passed**
- A2 residual guard: **success**
- A2 guard syntax: **success**
- A0 hard-cutover guard: **success**
- A1 authoring backend guard + syntax: **success**
- A2 focused ESLint: **success**
- full root lint: **success**

Frozen regressions on the same HEAD:

- **A0 Checks #20**, Run **35802642446** — **5 suites / 50 tests passed**, guards/lint all success.
- **A1 Checks #7**, Run **35802642487** — **7 suites / 60 tests passed**, guards/lint all success.

### Key decisions

- Graph is derived/read-only; there is no second Resource/Library repository.
- Existing ProjectStore / AssetStore / WorldRepo / KnowledgeRepo / PackageRepo remain authoritative.
- Asset Attach is a content-hash-pinned dependency; Asset Fork is the operation that creates a project-owned file.
- World/Knowledge Attach use exact immutable revisions.
- World/Knowledge Update is explicit only; there is no silent Library-current drift.
- Project-owned World nodes retain direct Graph edges to Library-owned asset/binding dependencies for accurate Used By/delete-safety inspection.
- Human / Agent / Plugin still share the same Authoring Operation boundary.
- A1's former phase guard that prohibited A2 files was retired only because A2 now exists; all actual A1 authority/residual guards remain active.

### Explicitly not implemented in A2

- Runtime Descriptor compiler;
- game-runtime authority cutover;
- `game.json` retirement;
- charId runtime retirement;
- swipe-derived Game World branch removal;
- Chat State game-world authority removal;
- Component/Hybrid/Full runtime work;
- Plugin platform implementation;
- broad frontend/Studio UX;
- Project Agent task/repair product workflow.

### A3 entry conditions

A3 starts from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A2.

A3 is **Native Game Runtime Cutover** only. Reuse the completed Native Package / Project / World / Knowledge / Resource / Session authorities. Do not create another Runtime/World/Session persistence authority, do not redo A2, and stop again after A3 validation/handoff.


---

## A3 implementation record — complete

A3 — **Native Game Runtime Cutover** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A2 prior validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- Formal plan remains unchanged; A3 implemented the frozen authority cutover without a material design/scope change.
- Do not merge `main`; continue A4 on the same implementation branch.

### Runtime Descriptor / Package resolution

A3 added `src/native/runtime-descriptor.js`.

The compiler/resolver:

- derives Runtime Descriptor from an exact installed `PackageVersion + EntryPoint`;
- requires the explicit frozen Experience contract;
- preserves exact `packageId + packageVersionId + packageContentHash + entryPointId`;
- derives Actor / WorldRevision / KnowledgeRevision / KnowledgeBinding / Asset identities from the immutable PackageVersion;
- does not persist Runtime Descriptor or create another Package/runtime repository;
- permits only declarative package-runtime resources needed by A3 Text Runtime.

`/api/native/session/runtime/resolve` resolves the Runtime Descriptor from the active Session's exact pinned PackageVersion.

`/api/native/session/runtime/resource` reads only the exact Session-bound PackageVersion source and allows safe declarative `.json` runtime resources. It does not bridge to CardApp and does not expose arbitrary package JavaScript execution.

A newer Package current pointer never upgrades an existing Session implicitly; A3 HTTP tests pin this behavior.

### Game Runtime authority cutover

The active Text game-runtime path no longer loads by Character / charId and no longer reads `game.json` or `/api/card-app/*`.

The browser loader now resolves runtime through Native Session identity and Runtime Descriptor.

Existing mature algorithms were retained rather than rewritten:

- command registry and validation;
- declarative logic;
- formulas;
- reducers;
- rules;
- deterministic RNG;
- interpretation mapping;
- observation projection;
- LLM intent / event interpretation;
- narrative/orchestration bridge;
- memory recall/ingestion;
- turn-controller concepts.

### World / event / revision authority

Game World definition is resolved from the exact WorldRevision packaged for the Session EntryPoint.

Runtime state is committed through Native SessionRevision:

- `atri_world_state` contains the current runtime World state while preserving exact WorldRevision identity;
- `atri_game_runtime` stores the game-domain event projection inside SessionRevision state;
- World state plus domain-event projection publish through one Native runtime state commit;
- Session / Branch / SessionRevision remains the only history/branch authority;
- the game-domain event projection is not a second Session timeline or repository.

Removed from the active A3 path:

- Chat State `atri_game_world`;
- independent Game World persistence;
- swipe-id-derived branch paths;
- Game World branch switching based on chat swipes.

### Native Turn / LLM authority

Game logic transaction identity now derives from Native Branch / Revision identity.

Turn Context anchor is:

- `sessionId`
- `branchId`
- `revisionId`
- `eventSeq`
- `serial`

It no longer uses floor/swipe/branchPath identity.

Memory recall currentness is checked against Native Session/Branch identity.

Turn attempts/retries map to real Native Branches via `NativeSessionRuntime.forkRevision()` / `switchBranch()`; they do not fabricate Swipe variants as game branches.

### Text Experience end-to-end

A3 completes the Text Experience cutover first.

For an active Native Text Runtime:

1. the existing Conversation/Composer host remains a temporary internal UI/generation ABI;
2. the user message passes through the existing Native Session write barrier and becomes a committed Native Timeline revision;
3. the Text seam dispatches the committed user turn to the Game Runtime;
4. Game logic / LLM / narrative operate against Native World/Branch/Revision state;
5. resulting narrative is published back through the Native Timeline write path.

Component / Hybrid / Full runtime activation remains intentionally deferred to A4. A3 does not start the A4 UI/runtime composition work.

### Guard / CI

A3 added:

- `scripts/check-a3-native-game-runtime-cutover.mjs`
- `.github/workflows/native-authoring-platform-a3.yml`
- `tests/native/runtime-descriptor.test.js`
- `tests/native/runtime-http.test.js`

The A3 residual guard checks the active Runtime implementation for retired authority including:

- `game.json` / `GAME_MANIFEST_PATH`;
- charId / Character package identity;
- `/api/card-app/*`;
- Chat State `atri_game_world`;
- swipe-derived Game World branch identity.

### Validation

Validated on A3 HEAD `ba1ba05e0cd53b0947be34bed62707a297d97ac2`.

**Native Authoring Platform A3 Checks #12**

- Run: **35805724557**
- A3 focused + adjacent Native regressions: **15 suites / 165 tests passed**
- A3 Native Game Runtime residual guard: **success**
- A3 guard syntax: **success**
- frozen A0/A1/A2 guards: **success**
- A3 focused ESLint: **success**
- full root lint: **success**

Frozen workflows on the same HEAD:

- **A0 Checks #61**, Run **35805724614** — **5 suites / 50 tests passed**, workflow success.
- **A1 Checks #48**, Run **35805724567** — **7 suites / 60 tests passed**, workflow success.
- **A2 Checks #46**, Run **35805724587** — **10 suites / 52 tests passed**, workflow success.

### Key decisions

- Runtime Descriptor is a derived compiler/resolver output, never a second Package authority.
- Existing Session / Branch / SessionRevision remains authoritative for runtime history and branching.
- WorldRevision remains immutable baseline/definition; mutable World state lives in SessionRevision state.
- `atri_game_runtime` is a SessionRevision state namespace for game-domain event projection, not a parallel timeline repository.
- Existing mature logic/LLM algorithms were migrated onto Native authority rather than rewritten.
- Existing SillyTavern Conversation/generation machinery remains only as an internal Text host ABI during this phase; it is not restored as Native persistence/package identity.
- Text is the only Experience mode activated by A3. Component / Hybrid / Full remain A4 work.
- No compatibility alias, dual-read/dual-write or old-runtime bridge was added.

### Explicitly not implemented in A3

- A4 shared Component Model;
- Component surfaces;
- Hybrid stage composition/native slots;
- Full stage ownership/recovery runtime;
- A5 Plugin platform;
- A6 Product Frontend redesign;
- A7 Studio Authoring UX;
- A8 Project Agent product workflow;
- final A9 deletion of all obsolete product-facing legacy code that is no longer needed after later phases.

### A4 entry conditions

A4 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A3.

A4 must treat the A3 Text Runtime and Native authority cutover as frozen baseline. It may extend runtime presentation/composition for Component / Hybrid / Full, but must not create alternate Package/Session/World authority or restore retired runtime identities.

---

## A4 implementation record — complete

A4 — **Experience Runtime** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A3 prior validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- A4 validated HEAD: `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`
- Formal plan remains unchanged; A4 implemented the frozen Experience Runtime without a material design/scope change.
- Do not merge `main`; continue A5 on the same implementation branch.

### Implemented

A4 activates all four explicit Native Experience modes from the A3 Runtime Descriptor:

- Text
- Component
- Hybrid
- Full

Text remains the validated A3 Conversation/Composer host ABI and is not reimplemented.

A4 added a single shared declarative Component Model for Component / Hybrid / Full. The model supports:

- `id` / `type`
- `props`
- `bindings`
- `actions`
- `visibility`
- `responsive`
- `children`
- Native slots for Conversation / Composer in Hybrid / Full.

Component / Hybrid / Full do not have separate UI engines. They share the same Component Model compiler/renderer, selector runtime, declarative action/binding layer, responsive environment and component runtime.

### Runtime Descriptor / exact package resources

Runtime Descriptor remains a derived projection of exact `PackageVersion + EntryPoint`.

For Component / Hybrid / Full, `runtime.experience` now resolves declarative Session-bound resources such as:

- Component Model JSON;
- selector JSON;
- semantic surface.

The public descriptor continues to expose only the normalized Experience contract; runtime resource paths remain derived runtime data.

All package UI resources load through:

`/api/native/session/runtime/resource`

against the Session-pinned PackageVersion. A4 does not restore charId, `/api/card-app/*`, `game.json`, HTML runtime entrypoints or executable package JavaScript.

### Component Experience

Atria Play remains the main Host.

Component Experience may mount into semantic Host surfaces:

- `app.root`
- `chat.header`
- `chat.footer`
- `composer.before`
- `composer.after`
- `sidebar.left`
- `sidebar.right`
- `drawer`
- `modal`

Selectors derive UI state from the authoritative Native World projection. Declarative actions dispatch/simulate through the existing Game Logic / Native World path rather than mutating separate UI state authority.

### Hybrid Experience

Hybrid owns the Play Stage composition while reusing the exact live Native Conversation and Composer nodes through Native slots.

Atria Play Host remains responsible for stage ownership and restoration. Hybrid does not create a second Conversation, Composer, Session or timeline.

### Full Experience

Full owns the Play Stage visual layer only.

Host recovery remains outside package visual ownership and includes:

- Exit Experience;
- Stop generation;
- Save;
- Diagnostics.

Stage ownership never upgrades into Package / Session / World authority. Disposing or failed activation restores the exact Native Play Host and Native Conversation/Composer nodes.

### Structured UI / responsive runtime

A4 retained and migrated mature UI/runtime algorithms rather than rewriting them:

- selector runtime;
- typed declarative command actions;
- selector bindings;
- structured visibility;
- responsive device/orientation projection;
- semantic surfaces;
- Native slot composition;
- stage ownership;
- Full Host recovery.

A4 replaces the active package UI HTML/charId loading seam with declarative JSON Component Model resources.

### Native Preview

`StudioPreviewHost` now derives the same Runtime Descriptor / Experience projection for Text / Component / Hybrid / Full previews.

Preview remains volatile:

- no Session identity;
- no Branch identity;
- no competing runtime persistence authority.

### Guard / CI

A4 added:

- `public/scripts/extensions/game-runtime/ui/component-model.js`
- `tests/game-runtime/ui-component-model.test.js`
- `tests/native/studio-preview-experience.test.js`
- `scripts/check-a4-experience-runtime.mjs`
- `.github/workflows/native-authoring-platform-a4.yml`

The A4 residual guard enforces:

- no `manifest.ui` / `game.json` active UI authority;
- no charId / CardApp runtime loading;
- no package HTML runtime execution surface;
- no Chat State / swipe-derived UI authority;
- no second Package/Session/World repository;
- no arbitrary package JS/module/worker/eval execution;
- one shared Component Model;
- Host-owned Hybrid/Full stage/recovery boundaries;
- Native Preview remains non-persistent.

### Validation

Validated on A4 HEAD `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`.

**Native Authoring Platform A4 Checks #8**

- Run: **35807675180**
- focused + adjacent Native regressions: **28 suites / 210 tests passed**
- A4 Experience Runtime residual guard: **success**
- A4 guard syntax: **success**
- frozen A0/A1/A2/A3 guards: **success**
- A4 focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #89**, Run **35807675140** — success.
- **A1 Checks #76**, Run **35807675151** — success.
- **A2 Checks #74**, Run **35807675161** — success.
- **A3 Checks #40**, Run **35807675147** — success.

### Key decisions

- Text / Component / Hybrid / Full now share one Native Experience dispatcher.
- Text retains the A3 host ABI; A4 does not duplicate it.
- Component / Hybrid / Full share one structured Component Model instead of separate UI engines.
- Experience resources resolve only from the exact Session-bound PackageVersion.
- Hybrid reuses Native Conversation / Composer through slots; it does not clone host state.
- Full owns only Stage visuals; recovery and Native authority remain Host-owned.
- UI state is derived from Native World/Session state and does not become persistent authority.
- Native Preview derives the same Runtime Descriptor without creating Session/Branch state.
- package-runtime v1 remains declarative and does not execute arbitrary package JavaScript.
- Formal plan did not change.

### Explicitly not implemented in A4

- A5 Plugin manifest/API and contribution registry;
- A5 Host Plugin execution boundary;
- A5 permission/dependency model;
- A5 Native Skill scope integration;
- A6 Product Frontend redesign;
- A7 Studio Authoring UX;
- A8 Project Agent / Vibe Coding;
- A9 final obsolete product-surface removal.

### A5 entry conditions

A5 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A4.

A5 must build the Plugin & Skill Platform on the existing A0 contracts and A4 Experience Runtime. Package-runtime v1 remains declarative/capability-defined; executable Host Plugins must be kept behind an explicit Host Plugin boundary and must not create competing Native authority.



---

## A5 implementation record — complete

A5 — **Plugin & Skill Platform** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A4 prior validated HEAD: `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`
- A5 validated HEAD: `eefd6550d9b2af6c2777984e12d5f61de0898415`
- Formal plan remains unchanged; A5 implemented the frozen Plugin/Skill split without a material architecture/scope change.
- Do not merge `main`; continue A6 on the same implementation branch.

### Implemented

A5 turns the A0 Plugin/Skill contract skeleton into an operational Native platform.

#### Atria Plugin contract and dependency/permission model

The Native Plugin contract now has explicit:

- Host Plugin permissions;
- Host Plugin capabilities;
- package-runtime-v1 capabilities;
- supported contribution types;
- exact Plugin dependencies with optional dependency support.

Dependency resolution is deterministic and dependency-first. Missing required dependencies, exact-version mismatches and cycles fail closed.

Package runtime capabilities map onto the existing Package permission model. For example:

- `runtime.ui` requires Package `custom-ui`;
- `runtime.command` requires Package `runtime-tools`;
- `runtime.rule` / `runtime.reducer` require Package `world-write`.

No second permission authority was created.

#### Contribution Registry

A5 adds `src/native/plugin-platform.js` with a Native `ContributionRegistry`.

It distinguishes Build and Play contribution surfaces and reuses the existing A2 Resource Registry for Plugin-defined authoring resource types.

A Host Plugin `authoring.resource` contribution is registered into the existing Resource Registry as:

- provider = Plugin;
- authority = `plugin-source`.

The Contribution Registry is runtime coordination/registration only; it is not a Package, Project, Session, World or Timeline persistence store.

#### Host Plugin boundary

A5 adds an explicit `HostPluginBoundary` and `src/native/host-plugin-loader.js`.

Executable Host Plugin code may run only after:

- Atria Plugin manifest validation;
- dependency checks;
- manifest permission declaration checks;
- explicit permission grants;
- Host capability checks.

The Host Plugin API deliberately exposes bounded capabilities instead of Native repositories.

Plugin authoring writes are forced to:

`Authoring Operation → Workspace → ChangeSet`

with `origin: { kind: 'plugin', id: <pluginId> }`.

A Plugin cannot obtain SessionRepo / PackageRepo / WorldRepo / Branch / Timeline persistence authority through the new API.

The existing SillyTavern-style server plugin loader remains a legacy/internal compatibility surface; it was not renamed or promoted into the Atria Plugin standard.

#### Package runtime v1

Package plugins are compiled by `compilePackageRuntimePlugins()`.

Package runtime v1 remains:

- declarative;
- capability-defined;
- exact-dependency validated;
- permission-gated;
- non-executable.

Package build rejects Host Plugin entrypoints and Host-only contributions. A package cannot smuggle executable Host Plugin code into the Package Runtime projection.

The existing A0 recursive executable-payload guard remains authoritative and continues to reject JavaScript/module/worker/eval-style package payloads.

#### Build integration

`buildProjectPackage()` now validates the exact package plugin closure before producing the immutable PackageVersion.

Host-only developer tooling is excluded from package runtime.

Package Plugin definitions travel through the existing Project → Package build path; no new package manifest/persistence authority was added.

#### Play integration

Runtime Descriptor now derives exact package plugin identities and host-validated declarative runtime contribution projections from the Session-pinned PackageVersion.

A5 adds:

`public/scripts/extensions/game-runtime/ui/plugin-contributions.js`

The A4 Experience Runtime consumes the package contribution registry without giving packages executable code authority.

The first concrete Play integration is declarative `play.selector` contribution compilation into the existing A4 selector runtime. All Experience modes can inspect their Package Runtime contributions through the same dispatcher.

A4 Text / Component / Hybrid / Full ownership rules remain unchanged.

#### Native Skill scopes

The new Native Skill identity remains strictly:

- global;
- project;
- package.

The existing Skills repository can now persist project/package scopes in addition to its legacy surfaces.

A5 adds `src/native/skill-platform.js`, which resolves only Native global/project/exact-package scopes.

Legacy Character/preset/orchestrator-preset scope support remains isolated to old chat/orchestration compatibility surfaces; Character scope is not accepted or restored as Native authoring identity.

The orchestrator now has a dedicated Native skill resolver using:

global → project → exact PackageVersion

precedence while preserving the legacy resolver separately for legacy chat surfaces.

### Key decisions

- Plugin = executable/system capability + Build/Play contribution.
- Skill = AI knowledge/workflow/guidance; a Skill does not gain Host execution authority.
- New Host Plugin and Package Runtime are different trust/execution identities inside one Plugin ecosystem.
- Package Runtime v1 does not execute arbitrary JavaScript.
- Host Plugin code runs only behind explicit permission/capability checks.
- Plugin writes use the same Authoring Operation/Workspace/ChangeSet path as Human and Agent writes.
- A2 Resource Registry remains the resource-type registry; A5 does not create a competing registry authority.
- Runtime Descriptor remains derived from exact PackageVersion + EntryPoint.
- Package/Session/Branch/Timeline/World persistence authority is unchanged.
- Native Skill scope does not include Character.
- Formal plan did not change.

### Guard / CI

A5 added:

- `scripts/check-a5-plugin-skill-platform.mjs`
- `.github/workflows/native-authoring-platform-a5.yml`
- `tests/native/plugin-platform.test.js`
- `tests/native/plugin-build-play.test.js`
- `tests/native/native-skill-platform.test.js`
- `tests/game-runtime/plugin-contributions.test.js`

The A5 residual guard enforces:

- Host Plugin authoring uses Plugin origin and the shared authoring boundary;
- Host Plugin API does not expose competing Native persistence authorities;
- package runtime rejects Host Plugin execution;
- package-runtime-v1 remains declarative and rejects executable payloads;
- Build validates package plugin closure;
- Runtime Descriptor projects exact Package Runtime plugins;
- A4 Experience Runtime consumes host-validated declarative Play contributions;
- package Play contribution code has no eval/Function/Worker/dynamic-import execution path;
- Native Skill platform is global/project/package and does not restore Character identity.

### Validation

Validated on A5 HEAD `eefd6550d9b2af6c2777984e12d5f61de0898415`.

**Native Authoring Platform A5 Checks #2**

- Run: **35809294986**
- focused + adjacent regressions: **16 suites / 145 tests passed**
- A5 Plugin & Skill Platform residual guard: **success**
- A5 guard syntax: **success**
- frozen A0/A1/A2/A3/A4 guards: **success**
- A5 focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #92**, Run **35809294999** — success.
- **A1 Checks #79**, Run **35809294967** — success.
- **A2 Checks #77**, Run **35809295009** — success.
- **A3 Checks #43**, Run **35809294982** — success.
- **A4 Checks #11**, Run **35809294981** — success.

### Explicitly not implemented in A5

- A6 Native Product Frontend redesign;
- A7 Studio Authoring UX;
- A8 Project Agent / Vibe Coding;
- A9 final obsolete product-surface removal;
- arbitrary-JavaScript package runtime;
- full online/community plugin marketplace.

### A6 entry conditions

A6 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A5.

A6 must consume the established Native Package / Resource / Authoring / Runtime Descriptor / Experience / Plugin / Skill authorities. It must not create alternate persistence or runtime authority, and it must not start A7 Studio UX or A8 Project Agent implementation early.


---

## A6 implementation record — complete

A6 — **Native Product Frontend** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A5 prior validated HEAD: `eefd6550d9b2af6c2777984e12d5f61de0898415`
- A6 validated HEAD: `e33704b91ecb0373902132fe8af9c80b204aa8ce`
- Formal plan remains unchanged; A6 implemented the frozen Native Product Frontend without creating a second Native authority.
- Do not merge `main`; continue A7 on the same implementation branch.

### Implemented

#### Product IA / Build

The Atria primary product domains are now:

- Play
- Library
- Build
- Agents
- Runtime

`Studio` is no longer a primary product route. Build owns Native project discovery/detail routing. The existing Native Studio workspace function remains an internal implementation seam for A7 rather than a product domain.

#### Atria-native Play

A6 added `public/scripts/native/play-product.js` with:

- Native Session Header;
- Atria Conversation renderer;
- Message Renderer;
- Atria Composer;
- product semantic Component surfaces.

Conversation reads the committed Native Session Timeline projection only.

Composer bridges the existing A3 generation entrypoint by writing through the existing hidden Native generation ABI; it does not create its own message/timeline store.

The legacy `#chat/#send_form` subtree remains mounted as one hidden internal generation ABI. It is not the official Atria product UI.

A4 Component / Hybrid / Full Native slots now reuse the Atria product Conversation / Composer components while retaining the same shared Component Model, Stage ownership and Host recovery semantics.

#### Library

Library uses the Atria master-detail product pattern and continues to consume existing Native Package / World / Knowledge / Skill authorities.

No second Library persistence/index authority was added.

#### Runtime

Runtime product surfaces now cover:

- Overview
- Roles
- Connections
- Model / Prompt Presets
- Capabilities

Capabilities is a read-only projection of the active exact Native package/runtime snapshot.

Connections is Native-first. Existing Connection Manager controls retain their persistence authority but are isolated under Advanced instead of acting as the primary product page.

#### Product Search

A6 added `public/scripts/atria-shell/product-search.js`.

The search index is transient and read-only. It enumerates Native:

- Works
- Worlds
- Knowledge Bases
- Projects

and registers command results that navigate only to their authoritative Library / Build route.

It does not render foreign-domain content in the caller's page and does not persist another search/index authority.

#### Plugins / Skills

Plugins is now Native-first and projects exact installed Package Runtime plugin declarations/capabilities.

SillyTavern-compatible frontend/server extensions remain available only under Advanced / Legacy.

Skills remain primarily under Library and continue to use the A5 global/project/package Native scope authority.

#### Settings / Account / Diagnostics

Settings now exposes Atria-native product cards first. The existing User Settings form is an Advanced compatibility controller that retains its original persistence authority.

Account now exposes Atria-native identity/storage/snapshot/backup overview first. The old account/profile controller is lazy-mounted only under Advanced.

Diagnostics remains one routed global product utility backed by the existing diagnostics authority.

#### Product UI / responsive behavior

A6 extends the existing Atria Product UI System and semantic `--atri-*` tokens with:

- Atria-native Play layout;
- master-detail Library layout;
- Native-first Runtime connection/capability cards;
- Native-first Plugins / Settings / Account product cards;
- compact/mobile variants using the same authoritative routes/components.

### Key decisions

- Atria product UI is presentation/interaction over existing Native authority, never a new persistence layer.
- Build is the product domain; Studio is the A7 project workspace.
- Visible Play uses Atria Conversation/Composer; SillyTavern chat DOM remains internal generation ABI only.
- Component / Hybrid / Full continue to share the same A4 Component Model and Atria Native component instances.
- Compatibility controllers may remain under Advanced when A6 is not responsible for replacing their persistence authority.
- Search results always navigate to owning domains.
- Formal plan did not change.

### Guard / CI

A6 added:

- `scripts/check-a6-native-product-frontend.mjs`
- `.github/workflows/native-authoring-platform-a6.yml`
- `tests/atria-shell/native-play-product.test.js`
- `tests/atria-shell/product-search.test.js`

and updated adjacent A4/Atria-shell regression coverage for the A6 product component contract.

The A6 residual guard enforces:

- Build as the primary authoring product domain;
- no Studio primary route;
- Native Session-backed Atria Play Conversation/Composer;
- no second Play persistence/runtime authority;
- old chat DOM isolated as internal generation ABI;
- Atria product Conversation/Composer used by Native component slots;
- Library master-detail and Runtime Capabilities;
- Native-first Runtime Connections;
- Native-first Plugins / Settings / Account;
- Product Search as route-only authority projection.

### Validation

Validated on A6 HEAD `e33704b91ecb0373902132fe8af9c80b204aa8ce`.

**Native Authoring Platform A6 Checks #6**

- Run: **35811659445**
- focused + adjacent regressions: **20 suites / 123 tests passed**
- A6 residual guard: **success**
- A6 guard syntax: **success**
- frozen A0/A1/A2/A3/A4/A5 guards: **success**
- focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #129**, Run **35811660076** — success.
- **A1 Checks #116**, Run **35811659453** — success.
- **A2 Checks #114**, Run **35811659446** — success.
- **A3 Checks #80**, Run **35811659476** — success.
- **A4 Checks #48**, Run **35811659437** — success.
- **A5 Checks #39**, Run **35811659435** — success.

### Explicitly not implemented in A6

- full A7 Studio project workspace UX;
- A7 Design / Structure / Bindings / Source editors;
- A7 Inspector / Preview / project-local asset editing flows;
- A7 mobile Project / Editor / Preview / AI / More views;
- A8 Project Agent / Vibe Coding;
- A9 final obsolete product-surface cleanup.

### A7 entry conditions

A7 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A6.

A7 must use:

- A1 StudioService / Authoring Operations / Workspace / ChangeSet;
- A2 Resource Registry / Resource Graph / Library attachment authority;
- A4 shared Component Model and Native Preview;
- A5 Plugin/Skill contribution and scope boundaries;
- A6 Build domain and Atria Product UI System.

A7 must not create a parallel project/editor persistence model and must not start A8/A9 early.


---

## A7 implementation record — complete

A7 — **Studio Authoring UX** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A6 prior validated HEAD: `e33704b91ecb0373902132fe8af9c80b204aa8ce`
- A7 validated HEAD: `40cb1b98ecbf2ccf76599421ea1ccf625af35071`
- Formal plan remains unchanged; A7 implemented the frozen Studio UX without adding a second Project/Resource/Preview/Plugin/Skill/Runtime authority.
- Do not merge `main`; continue A8 on the same implementation branch.

### Implemented

#### Full Atria Studio workspace

Opening a Build project now mounts a full Atria Studio workspace rather than the A6 project-detail/dependency form.

Desktop exposes:

- Project/Resource Explorer;
- Editor Host;
- contextual Inspector;
- Activity panel;
- Preview/Run/Build controls;
- reserved AI product position for A8.

Project resource entry points cover:

- Overview;
- Experience;
- Actors;
- EntryPoints;
- Worlds;
- Knowledge;
- Game Logic;
- UI;
- Assets;
- Memory;
- Agents / Orchestration;
- Skills;
- Plugins;
- Presets / Processors / Localization / Permissions;
- Test / Simulation;
- Preview;
- Build;
- Source.

A5 Plugin-defined `authoring.resource` descriptors are projected dynamically from the existing A2 Resource Registry into the Resource Explorer. A7 does not create another resource registry.

#### Shared authoring boundary / ChangeSet review

A7 adds a browser-side Native Studio client and authoring helpers, but all writes still terminate at the A1 Native Studio boundary.

Human editing follows:

`Authoring Operation → Workspace(baseRevision) → inspect/review → execute → Validation → Commit`

Structured project edits use `project.save`; source/UI/asset changes use A1 source operations, and multi-file/manifest changes share one Workspace.

The Studio never imports or writes ProjectStore/WorldRepo/KnowledgeRepo/AssetStore directly.

Revision conflicts surface at the Changes review boundary. A7 never silently rebases staged human edits over a newer Project revision.

Activity provides:

- Problems;
- Output;
- History/diff;
- Changes / ChangeSet review.

#### Structured UI

A7 adds an Atria Structured UI editor with the frozen first-class views:

- Design;
- Structure;
- Bindings;
- Source.

The editor consumes the existing A4 `compileExperienceComponentModel()` and `renderExperienceComponentModel()` authority.

Design/Structure/Bindings/Source edit one JSON Component Model and stage source writes through the A1 authoring boundary.

Arbitrary HTML/JS visual-designer round-tripping was not implemented. Unsupported/executable fields remain rejected by the A4 compiler.

#### World / Knowledge / Assets / Library relationships

Project-owned World and Knowledge snapshots are editable as structured Project source.

Library authoring interactions expose:

- Attach exact revision;
- Fork to project ownership;
- explicit Update from one pinned revision to another.

No `Library latest` implicit build input was introduced.

Assets support project-local import/removal as a single transactional Workspace combining source-file and manifest operations.

The Inspector consumes the derived A2 Resource Graph for:

- resource identity/ownership/authority;
- References;
- Used By.

The graph remains read-only derived authority.

#### Preview / Simulation / Build

Studio exposes existing A1/A4 seams for:

- validation;
- Native Preview;
- simulation;
- build preflight;
- `.atria` build/download.

Native Preview remains volatile and does not create Session/Branch persistence.

Build continues to resolve the exact dependency closure through the existing Native package builder.

#### Mobile Studio

Compact Studio uses separate views rather than squeezing the desktop panes:

- Project;
- Editor;
- Preview;
- AI;
- More.

Preview restores the prior editor view when returning to Editor. AI is only an A7 placeholder/product position; no A8 Project Agent planning or mutation workflow exists yet.

### Added / changed implementation surfaces

- `public/scripts/native/studio-client.js`
- `public/scripts/native/studio-authoring.js`
- `public/scripts/native/studio-ui-editor.js`
- `public/scripts/native/studio-workspace.js`
- `public/css/atria-studio.css`
- `tests/atria-shell/studio-authoring.test.js`
- `tests/atria-shell/studio-ui-editor.test.js`
- `tests/atria-shell/studio-workspace-a7.test.js`
- `tests/atria-shell/native-product-workspaces.test.js`
- `scripts/check-a7-studio-authoring-ux.mjs`
- `.github/workflows/native-authoring-platform-a7.yml`

### Key decisions

- A7 is UX/application composition over A1–A6 authorities, not a new editor persistence architecture.
- Human and future Agent writes share the same Authoring Operation / Workspace / ChangeSet boundary.
- Resource Graph remains a derived read-only projection.
- Library Attach pins exact immutable identity; revision movement is explicit Update only.
- Structured UI promises lossless round-trip only for the shared Atria Component Model.
- A4 compiler/runtime remains the Component Model authority.
- Native Preview remains non-persistent.
- Plugin-defined Build resources come from the existing A2 Registry/A5 Contribution Registry.
- Mobile Studio is a current-view/drill-down product layout.
- A8 Project Agent is deliberately not started.
- Formal plan did not change.

### Validation

Validated on A7 HEAD `40cb1b98ecbf2ccf76599421ea1ccf625af35071`.

**Native Authoring Platform A7 Checks #8**

- Run: **35813893750**
- focused + adjacent regressions: **16 suites / 47 tests passed**
- A7 Studio Authoring UX residual guard: **success**
- A7 guard syntax: **success**
- frozen A0/A1/A2/A3/A4/A5/A6 guards: **success**
- A7 focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #148**, Run **35813893721** — success.
- **A1 Checks #135**, Run **35813893784** — success.
- **A2 Checks #133**, Run **35813893716** — success.
- **A3 Checks #99**, Run **35813893759** — success.
- **A4 Checks #67**, Run **35813893788** — success.
- **A5 Checks #58**, Run **35813893922** — success.
- **A6 Checks #25**, Run **35813893762** — success.

### Explicitly not implemented in A7

- A8 Project Agent Tasks / Plan / automatic operation planning;
- A8 AI operation execution/repair loop/human takeover;
- A8 semantic Task state beyond existing Project Git/ChangeSet history;
- A9 final obsolete-product hard-cutover cleanup;
- arbitrary HTML/JS ↔ visual designer conversion;
- a second Project/Resource/Preview/Plugin/Skill/Package/Runtime authority.

### A8 entry conditions

A8 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving A0–A7.

A8 must consume:

- the A1 Authoring Operation / Workspace / ChangeSet / Validation / Commit boundary;
- A2 Resource Registry / Resource Graph / exact Library relationships;
- A4 Native Preview / simulation / shared Component Model;
- A5 Native Skills and Plugin authoring contribution boundaries;
- A7 Studio Task/AI product position and Changes review UI.

A8 must not grant the Project Agent a privileged write path. Agent writes must use `origin.kind = 'agent'` and the same revision/conflict/validation semantics as human editing.

Do not start A9 final hard-cutover cleanup during A8 unless required to fix an A8 correctness defect.

---

## A8 implementation record — complete

A8 — **Project Agent / Vibe Coding** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A7 prior validated HEAD: `40cb1b98ecbf2ccf76599421ea1ccf625af35071`
- A8 validated HEAD: `a5430d41c010aca297b77184271d4cf2819a5631`
- Formal plan remains unchanged.
- Do not merge `main`; continue A9 on the same implementation branch.

### Implemented

#### Project Task / Plan / Progress authority

A8 adds `ProjectAgentService` as orchestration over the existing A1 StudioService authority.

The semantic Project Agent model is:

`Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate / Preview → Review → Commit`

Task state includes intent, pinned base revision, Plan/progress, proposed operations, Workspace, validation, preview/simulation inspection, repair rounds, Review state, ChangeSet references and semantic timeline.

Conversation remains a supportive browser UI only and is not Project truth.

#### Shared authoring authority

Agent writes are forced to `origin.kind = 'agent'`.

All writes use existing Authoring Operations and A1 Workspace/ChangeSet execution. The Agent is not given ProjectStore/WorldRepo/KnowledgeRepo/AssetStore/package/runtime write authority.

The model has no Commit tool. Commit is a separate explicit human action after Review.

Review freezes the Plan/operation set.

#### Revision/conflict behavior

Every Task starts from an explicit `baseRevision`.

Task execution rechecks the exact Project revision before proposing/evaluating/committing.

A newer human Project revision causes `project_revision_conflict` and stops the Agent at the conflict boundary. No silent rebase path was added.

#### Domain tools / Resource Graph

Project Agent tools expose existing domain capabilities for:

- structured `project.save`;
- exact Library Attach;
- explicit exact-revision Update;
- exact Library Fork;
- Resource Registry discovery;
- Resource Graph lookup;
- References / Used By;
- exact dependency closure;
- current validation;
- project/source reads.

Source write/move/delete remain low-level fallback tools.

Only domain resource operations that A1/A2 can actually execute are exposed as write tools. Plugin-defined Resource Registry descriptors remain available for discovery/planning without inventing unsupported plugin write executors.

#### Skills / Plugin contributions

A5 Native Skills are read-only know-how.

The browser Agent resolves global/project/exact-package skills using the existing Skills API and exact package identity obtained from Native Studio preflight.

A5 plugin-defined `authoring.resource` contributions reach the Agent through the same A2 Resource Registry used by A7.

#### Dry-run validation / repair / preview / simulation

A8 adds `StudioService.evaluateWorkspace()`.

It temporarily applies an existing Workspace against the pinned base revision, validates, builds a Native Preview and invokes the existing simulation seam, then restores the original Project snapshot in a `finally` path.

No Git commit occurs during evaluation.

Default automatic repair limit is 3 rounds. Exhaustion moves the Task to a blocked state.

#### Studio product integration

A7's reserved AI position is upgraded into the Project Agent UI.

Desktop gets an AI side panel. Mobile reuses the dedicated AI view in Project / Editor / Preview / AI / More.

A8 reuses A7 Activity/authoring surfaces:

- Problems ← Agent validation;
- Output ← Agent execution events;
- Changes ← dry-run Agent ChangeSet review;
- Preview ← Agent Native Preview;
- Test / Simulation ← Agent simulation;
- History ← committed A1 Git/ChangeSet history.

Human Takeover closes Agent mutation while leaving normal human Studio authoring available.

AI may be disabled/unavailable without affecting Studio authoring.

#### Semantic development history

Task timeline records intent/plan/operation/evaluation/review/conflict/takeover/commit semantics.

Committed Agent changes remain normal A1 Git source history and include both ChangeSet identity and Task ID in the commit message.

### Added / changed implementation surfaces

- `src/native/project-agent.js`
- `src/native/authoring/studio-service.js`
- `src/native/index.js`
- `src/endpoints/native-studio.js`
- `public/scripts/native/studio-client.js`
- `public/scripts/native/studio-agent.js`
- `public/scripts/native/studio-workspace.js`
- `public/css/atria-studio.css`
- `tests/native/project-agent.test.js`
- `tests/native/project-agent-http.test.js`
- `tests/atria-shell/studio-agent-a8.test.js`
- `scripts/check-a8-project-agent.mjs`
- `.github/workflows/native-authoring-platform-a8.yml`

### Key decisions

- Project Agent is an orchestration layer over StudioService, not a new persistence authority.
- Conversation is auxiliary; Task/Plan/Workspace/ChangeSet are execution state.
- Agent model tools can propose writes but cannot Commit.
- Review is mandatory for all Agent edits; high-impact changes are explicitly labeled.
- Review freezes the exact operation set.
- No silent revision rebase exists.
- Domain Authoring Operations are preferred; source operations are fallback.
- Plugin resource descriptors are visible but do not imply an executor that A1/A2 does not provide.
- Skills remain read-only AI know-how.
- Native Preview/simulation evaluation is dry-run and restores the Project snapshot.
- Project Git remains source history; Task/ChangeSet metadata is semantic development history.
- Formal plan did not change.

### Validation

Validated on A8 HEAD `a5430d41c010aca297b77184271d4cf2819a5631`.

**Native Authoring Platform A8 Checks #15**

- Run: **35816240985**
- focused + adjacent regressions: **15 suites / 42 tests passed**
- A8 Project Agent residual guard: **success**
- A8 guard syntax: **success**
- frozen A0/A1/A2/A3/A4/A5/A6/A7 guards: **success**
- focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #177**, Run **35816240997** — success.
- **A1 Checks #164**, Run **35816240974** — success.
- **A2 Checks #162**, Run **35816240957** — success.
- **A3 Checks #128**, Run **35816240984** — success.
- **A4 Checks #96**, Run **35816240972** — success.
- **A5 Checks #87**, Run **35816240990** — success.
- **A6 Checks #54**, Run **35816240965** — success.
- **A7 Checks #37**, Run **35816241039** — success.

### Explicitly not implemented in A8

- A9 retired CardApp/legacy deletion;
- a second Project/Resource/Preview/Package/Runtime authority;
- AI-owned Commit;
- silent Agent rebase;
- arbitrary-JavaScript package runtime;
- unrelated redesign of A0–A7.

### A9 entry conditions

A9 starts only from the actual latest remote HEAD of `refactor/atria-native-authoring-platform-product-frontend`, preserving all A0–A8 work.

A9 must use the formal **A9 — Hard Cutover & Product Finalization** list as deletion authority.

Before deleting a legacy surface, verify its justified consumer is already replaced by A0–A8.

A9 should remove:

- CardApp Studio/runtime product paths;
- `/api/card-app/*`;
- `game.json` authority/loader;
- charId Game Package identity;
- swipe-path game branch authority;
- Chat State world authority;
- old Studio AI tools/sessions;
- old product-facing Play DOM;
- obsolete compatibility entrypoints without justified consumers.

A9 must finish with full residual scans, focused acceptance, broader regression/build/lint and final product validation.



---

## A9 implementation record — complete

A9 — **Hard Cutover & Product Finalization** is complete and validated.

- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A8 prior validated HEAD: `a5430d41c010aca297b77184271d4cf2819a5631`
- **A9 validated HEAD: `8233c0dfe34989c294d18a93eae57f38eb70030a`**
- Formal plan remained unchanged; A9 executed the frozen removal/finalization scope.
- Do not continue feature implementation on this branch. Final Integration / Merge Main is next.

### Removed authority

A9 physically removed or disconnected:

- `src/endpoints/card-app.js` and `/api/card-app/*`;
- `public/scripts/extensions/card-app/*`;
- CardApp packing/extraction/deletion in character import/export;
- `card-apps` user-directory, sync and Storage Inspector authority;
- `public/scripts/extensions/character-editor-assistant/studio/*`;
- old CardApp Studio AI/session/file-edit tools and product entrypoints;
- old CardApp Studio docs/tutorials/images;
- `game.json` package/runtime authority and loader;
- charId Game Package identity;
- swipe-derived Game World branch authority;
- Chat State `atri_game_world` authority;
- old Game World branch/persistence/runtime/journal;
- old immersive/CardApp product Play surface;
- old `.atria game.json` distribution layer;
- obsolete tests that existed only to verify retired authority.

Still-valid tests were rewritten against the current Native Session / Runtime Descriptor contracts rather than restoring compatibility paths.

### Current authority after A9

- Package / immutable PackageVersion;
- Native Runtime Descriptor;
- Native Session / Branch / SessionRevision;
- `atri_world_state` current world state;
- `atri_game_runtime` committed Game Runtime event state;
- Atria-native Play Conversation / Composer / Session Header;
- A7 Atria Studio;
- A8 Project Agent;
- A1 Authoring Operation / Workspace / ChangeSet / Validation / Commit;
- A2 Resource Registry / derived Resource Graph;
- A4 Component Model / Native Preview;
- A5 Plugin / Skill boundaries.

### Intentionally retained internal ABI

#### SillyTavern generation/message DOM

`public/scripts/atria-shell/native-play-host.js` retains one real `#sheld/#chat/#send_form/#send_textarea` subtree only to preserve SillyTavern generation/message state machines, delegated listeners, attachments/autocomplete and related host behavior.

The subtree is explicitly marked `atria-native-play-abi` and hidden from the product UI. Visible Play is mounted by `mountAtriaPlayProduct()`.

This is an internal ABI, not official product DOM authority.

#### Session projection into host message shape

`public/scripts/native/session-projection.js` remains a runtime ABI adapter. It projects immutable Native Timeline/Variant identity into the SillyTavern message/swipe-shaped runtime representation required by the existing generation engine.

It explicitly owns no storage, filename lookup, latest-pointer resolution or host DOM authority. Native message/variant IDs remain canonical.

#### Game Runtime extension manifest

`public/scripts/extensions/game-runtime/manifest.json` is retained because it is the SillyTavern extension descriptor that loads the current Atria Game Runtime extension.

It is not the retired `game.json` package/runtime manifest authority.

### Final residual scan

A9 adds `scripts/check-a9-hard-cutover-product-finalization.mjs`.

The validated guard confirms:

- retired CardApp endpoint/runtime paths are absent;
- Character import/export no longer bridges CardApp package storage;
- `card-apps` is absent from active storage/sync authority;
- active Game Runtime has no `GAME_MANIFEST_PATH`, `game.json`, `/api/card-app/*`, charId/characterId Game identity, `atri_game_world`, or swipe-derived branch helper authority;
- active Native Session consumers contain no `atri_game_world` fallback;
- CEA contains no retired CardApp Studio/session/tool authority;
- old World branch/persistence/runtime/journal are absent;
- old `.atria game.json` distribution authority is absent;
- hidden SillyTavern Play ABI remains explicit and Atria-native Play remains the visible product surface.

Guard result on validated HEAD:

- **A9 Hard Cutover residual guard passed — 46 active Game Runtime files scanned.**
- A0–A8 frozen residual guards also pass on the same HEAD.

### Validation

Validated on A9 HEAD `8233c0dfe34989c294d18a93eae57f38eb70030a`.

**Native Authoring Platform A9 Checks #6**

- Run: **35819590765**
- focused + adjacent acceptance: **26 suites / 175 tests passed**
- A9 residual guard: **success**
- A9 guard syntax: **success**
- frozen A0/A1/A2/A3/A4/A5/A6/A7/A8 guards: **success**
- A9 focused ESLint: **success**
- complete Node regression: **759 suites / 8104 tests passed**
- skipped: **6 suites / 88 tests**
- frontend webpack build: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- A0 Checks #183 / Run **35819590659** — success
- A1 Checks #170 / Run **35819590639** — success
- A2 Checks #168 / Run **35819590715** — success
- A3 Checks #134 / Run **35819590535** — success
- A4 Checks #102 / Run **35819590697** — success
- A5 Checks #93 / Run **35819590663** — success
- A6 Checks #60 / Run **35819590792** — success
- A7 Checks #43 / Run **35819590829** — success
- A8 Checks #21 / Run **35819590624** — success

### Completed / remaining

Completed:

- N0–N10;
- A0–A9;
- Native authoring/runtime/product replacement;
- hard cutover;
- legacy authority deletion;
- full residual scan;
- focused + complete Node regression;
- frontend build;
- lint;
- frozen phase verification.

Remaining:

- Final Integration / Merge Main only.

### Final Integration entry conditions

Final Integration must start by re-fetching `main`, `docs` and the implementation branch.

Do not repeat A0–A9 and do not reintroduce removed legacy authority.

The integration owner must:

1. confirm A9 validated HEAD;
2. create/update the PR into `main`;
3. run/confirm required PR CI;
4. resolve integration conflicts within the frozen A0–A9 authority model;
5. merge only after CI succeeds;
6. verify merged `main`;
7. perform final docs bookkeeping;
8. delete `refactor/atria-native-authoring-platform-product-frontend` after the merge is verified.


---

## Final Integration / Merge Main — complete

Final Integration was completed on 2026-09-23.

### PR and merge

- PR: **#84** — `refactor/atria-native-authoring-platform-product-frontend` → `main`
- Final implementation/integration HEAD: `b4b66aabf2f56c6f4e02ad86ee9177a660365fd3`
- Merge commit: **`2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`**
- Merge tree: `ef9d9d0f22994465f3d166a6042ab2991e6abde9`
- Pre-merge main baseline: `fd9a493c9040b32f4892bd92531030e58b066244`

The implementation branch was behind `main` by zero commits and merged without content conflicts.

### Integration-only change

The PR exposed stale Backup/Storage E2E navigation that still clicked the hidden SillyTavern User Settings drawer. Tests were moved to the current Account-owned Storage Management / Backup & Sync controllers.

This was a test-entry adaptation only. No A0–A9 product/runtime authority was changed or restored.

### Final CI

- Atria PR Checks #786 / Run 35821081970 — **success**, attempt 2
- Backup and Storage UI #93 / Run 35821081950 — **success**
- Worldbook Performance Foundation #394 / Run 35821081919 — **success**
- Immersive Experience #53 / Run 35821081921 — **success**

PR Checks attempt 1 had one transient MySQL hook timeout in `chat-repo-state.test.js` and was rerun unchanged; attempt 2 passed.

### Merged-main authority verification

The merge commit tree is byte-for-byte the same Git tree as the final CI-validated PR HEAD.

Post-merge inspection confirmed all A0–A9 guard scripts and current Native authority files remain present, while representative retired A9 paths remain absent.

Therefore Final Integration introduced no authority rollback, compatibility restoration, or merge-only code delta.

### Task state

This refactor is complete. N0–N10 and A0–A9 are no longer active implementation phases.

Future tasks should branch from the new authoritative `main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.
