# Atria Native Authoring Platform & Product Frontend Refactor — Handoff

## Current status

Planning/design is complete and frozen. **A0, A1, A2 and A3 are complete and validated; A4 is next.**

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- Branch created directly from the baseline above and remains the single implementation branch.
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Prior Native Content & Session Architecture N0–N10 remains complete and must not be redone.
- Do not merge `main`; continue A4 on the same implementation branch.

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

## Current next action — A4 only

Start **A4 — Experience Runtime** from the actual latest remote HEAD of the same implementation branch.

Before A4 editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. this handoff
6. `src/native/authoring-contracts.js`
7. `src/native/runtime-descriptor.js`
8. `src/native/session-core.js`
9. `public/scripts/native/session-runtime.js`
10. the A3 `public/scripts/extensions/game-runtime/` Text Runtime implementation
11. existing Atria Play host / surface / structured UI code relevant to Component / Hybrid / Full.

A4 must implement the frozen **Experience Runtime** on top of A3's Native Package → Runtime Descriptor → Native Session authority:

- keep Text Experience working as the validated A3 baseline;
- implement the shared Component Model for Component / Hybrid / Full;
- implement Component surfaces without creating another game/session authority;
- implement Hybrid stage composition/native slots;
- implement Full stage ownership and host recovery controls;
- keep package runtime v1 declarative/capability-defined with no arbitrary package JavaScript execution;
- continue using exact PackageVersion + EntryPoint identity and Native Session / Branch / SessionRevision;
- do not reintroduce `game.json`, charId, CardApp runtime loading, swipe-derived branches or Chat State Game World authority;
- do not start A5 Plugin Platform, A6 Product Frontend or A7 Studio UX early.

Stop again after A4 validation/handoff. Do not create a new branch and do not merge `main`.

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
