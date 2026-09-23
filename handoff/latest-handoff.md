# Active checkpoint: Native Authoring Platform A1 complete; ready for A2

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A1 — Native Authoring Backend.**

Prior Atria Native Content & Session Architecture N0–N10 remains complete and frozen. A0 contracts remain frozen and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A2 — Library & Resource Architecture**
- Do not create a new implementation branch and do not merge `main`.

Formal plan design did not change during A1, so the plan file was not mechanically edited.

## A0 frozen contracts remain authoritative

A0 still freezes:

- Experience: Text / Component / Hybrid / Full;
- shared Component Model version for Component / Hybrid / Full;
- Resource Descriptor / Resource Registry contract;
- Resource Graph = `derived-readonly`;
- shared Authoring Operation / Workspace / ChangeSet contract for human / agent / plugin;
- opaque Project revision token + `project_revision_conflict`;
- Native Runtime Descriptor;
- Atria Plugin contract;
- package-runtime-v1 declarative only, no arbitrary package JavaScript;
- Native Skill scopes = global / project / package.

Do not redefine these in A2.

## A1 implemented authority boundary

A1 added the dedicated Native authoring backend:

- `src/native/authoring/studio-service.js`
- `src/endpoints/native-studio.js`
- HTTP mount: `/api/native/studio/*`

It reuses the existing Native authorities:

- ProjectStore
- AssetStore
- WorldRepo
- KnowledgeRepo
- existing Package composition/build
- existing StudioPreviewHost

No second Project/Manifest/World/Knowledge/Session/Timeline/Save persistence authority was created.

### Authoring pipeline

Human, Project Agent and Plugin origins use the same frozen A0 pipeline:

Authoring Operation → Workspace → ChangeSet → Validation → Commit.

A1 built-in operation types:

- `source.write`
- `source.move`
- `source.delete`
- `project.save`

Project source supports list/read/write/move/delete. Manifest updates also pass through the same operation path.

Batch execution snapshots ProjectStore source + manifest and rolls back the entire batch on operation failure or failed validation.

### Revision / conflict / history

Project revision is the ProjectStore-directory Git HEAD exposed only as the frozen A0 opaque revision token.

- successful ChangeSets are committed to source history;
- history/diff are exposed through StudioService;
- direct/out-of-band ProjectStore changes are synchronized into source history before revision comparison;
- every mutation requires explicit `baseRevision`;
- stale work returns `project_revision_conflict`;
- no silent overwrite or automatic AI/human rebase occurs.

### Build seams

A1 exposes:

- validation/diagnostics hooks;
- preflight;
- build through existing `buildProjectPackage`;
- volatile preview through existing `StudioPreviewHost`;
- simulation runner seam;
- diff/change inspection.

Preview/simulation do not create Native Session authority.

## A1 validation

Validated at `bf09c79e07204ee39303e52e89a3da3b2f7617da`.

### Native Authoring Platform A1 Checks #2

- Run: **35800275829**
- focused + adjacent regressions: **7 suites / 60 tests passed**
- A1 authoring backend residual guard: **success**
- guard syntax: **success**
- focused ESLint: **success**
- full root lint: **success**

Focused/adjacent suites:

- `native/studio-service.test.js`
- `native/studio-http.test.js`
- `native/authoring-contracts.test.js`
- `native/project-composition.test.js`
- `native/package-build-install.test.js`
- `native/package-container.test.js`
- `native/world-knowledge.test.js`

### A0 regression on the same HEAD

Native Authoring Platform A0 Checks #15:

- Run: **35800275737**
- **5 suites / 50 tests passed**
- A0 hard-cutover residual guard: **success**
- guard syntax: **success**
- focused ESLint: **success**
- full root lint: **success**

## Not started

A1 deliberately did not implement:

- A2 Resource Graph;
- Library attach/fork/update;
- A3 Runtime cutover;
- A5 Plugin platform implementation;
- A6/A7 broad frontend or Studio UX;
- A8 Project Agent product UX.

## Next action — A2 only

Start **A2 — Library & Resource Architecture** on the same implementation branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. `src/native/authoring-contracts.js`
7. `src/native/authoring/studio-service.js`
8. `src/endpoints/native-studio.js`

Fetch the implementation branch and use its actual latest remote HEAD. Preserve all A0/A1 work and do not redo it.

A2 should implement:

- Resource Registry / descriptor-driven extension;
- incrementally derived read-only Resource Graph;
- Library immutable snapshot/reference semantics where required;
- Attach / Fork / explicit update flows;
- World/Knowledge authoring integration;
- dependency/reference/delete-safety/build-closure support.

All writes must continue through Authoring Operations / StudioService into existing canonical Native authorities. Resource Graph must never become writable authority.

Stop after A2 validation/handoff. Do not enter A3 early, do not create a new branch, and do not merge `main`.
