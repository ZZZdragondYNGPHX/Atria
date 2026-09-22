# Active checkpoint: Native Authoring Platform A0 complete; ready for A1

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A0 — Contracts & Hard-cutover Guards.**

Prior Atria Native Content & Session Architecture N0–N10 remains complete and frozen.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A1 — Native Authoring Backend**
- Do not create a new implementation branch and do not merge `main`.

## A0 frozen contracts

A0 now freezes and tests:

- Experience: Text / Component / Hybrid / Full;
- shared Component Model version for Component / Hybrid / Full;
- Resource Descriptor / Resource Registry;
- Resource Graph = `derived-readonly`;
- shared Authoring Operation / Workspace / ChangeSet path for human / agent / plugin origins;
- optimistic Project revision/conflict contract, with revision represented as an opaque token;
- Native Runtime Descriptor using existing Package / PackageVersion / EntryPoint authority and existing Package capabilities;
- Atria Plugin contract;
- package-runtime-v1 = declarative only, no arbitrary package JavaScript execution;
- Native Skill scopes = global / project / package;
- hard-cutover guard preventing new Native authoring code from restoring CardApp, `game.json`, charId, swipe or Chat State/FloorState game authority.

No second Manifest, ProjectStore, Session, World, Timeline, Resource Graph persistence authority or Package capability vocabulary was introduced.

## A0 validation

Validated at `1e7d32ac74411e98a5003be72c5dc06d8d72966e`:

- Workflow: **Native Authoring Platform A0 Checks #4**
- Run: **35799024194**
- focused/adjacent tests: **5 suites / 50 tests passed**
- A0 hard-cutover residual guard: **success**
- guard syntax: **success**
- focused ESLint: **success**
- full root lint: **success**

Formal plan design did not change, so the plan file was not mechanically edited.

## Next action — A1 only

Start **A1 — Native Authoring Backend** on the same branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. `src/native/authoring-contracts.js`

Fetch the implementation branch and use its actual latest remote HEAD. Preserve all A0 contracts and guards.

A1 should implement the dedicated Native authoring backend boundary (StudioService / `/api/native/studio/*` or equivalent), project source CRUD, batch/transactional Authoring Operations, Workspace/ChangeSet execution, validation/diagnostic seams, optimistic revision conflict handling, and build/preview/history seams using existing Native authorities.

Do not start A2 Resource Graph/Library architecture, broad Studio UI, Product Frontend, Runtime cutover or Plugin platform implementation during A1.
