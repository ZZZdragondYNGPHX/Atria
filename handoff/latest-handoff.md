# Active checkpoint: Native Authoring Platform A4 complete; ready for A5

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A4 — Experience Runtime.**

Prior Native Content & Session Architecture N0–N10 remains complete and frozen. A0–A3 remain frozen and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- A4 validated HEAD: `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A5 — Plugin & Skill Platform**
- Continue on the same implementation branch. Do not create a new branch and do not merge `main`.

Formal plan design did not change during A4; no mechanical plan edit was required.

## A4 implemented

### Unified Native Experience Runtime

All four explicit Experience modes now activate from the A3 Native Runtime Descriptor:

- Text
- Component
- Hybrid
- Full

Text remains the validated A3 Native Conversation/Composer host ABI.

Component / Hybrid / Full share one declarative Component Model and one UI runtime rather than separate engines.

### Shared Component Model

A4 added `public/scripts/extensions/game-runtime/ui/component-model.js`.

The shared model covers:

- id / type;
- props;
- bindings;
- actions;
- visibility;
- responsive behavior;
- children;
- Native Conversation / Composer slots for Hybrid / Full.

Selectors, typed actions, responsive environment, surfaces and Native component mounting reuse the existing mature game-runtime UI algorithms.

### Native package/runtime authority

Component Model and selector resources are resolved only from the exact Session-bound PackageVersion through `/api/native/session/runtime/resource`.

A4 does not restore:

- `game.json`;
- charId / Character runtime identity;
- `/api/card-app/*`;
- HTML package runtime entrypoints;
- swipe-derived branches;
- Chat State Game World authority;
- arbitrary package JavaScript/module/worker/eval execution.

### Host modes

Component keeps Atria Play as the main Host and mounts into semantic surfaces.

Hybrid owns Stage composition but reuses the exact live Native Conversation / Composer nodes through Native slots.

Full owns Stage visuals only. Host-owned recovery remains outside the package stage and provides Exit, Stop, Save and Diagnostics.

None of these modes owns Session / Branch / SessionRevision / Package / World authority.

### Native Preview

Studio Preview derives the same Runtime Descriptor / Experience projection for all four modes while remaining volatile and non-persistent. It creates no Session or Branch authority.

## A4 validation

Validated at `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`.

### Native Authoring Platform A4 Checks #8

- Run: **35807675180**
- focused + adjacent Native regressions: **28 suites / 210 tests passed**
- A4 Experience Runtime residual guard: **success**
- A4 guard syntax: **success**
- frozen A0/A1/A2/A3 guards: **success**
- focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #89**, Run **35807675140** — success.
- **A1 Checks #76**, Run **35807675151** — success.
- **A2 Checks #74**, Run **35807675161** — success.
- **A3 Checks #40**, Run **35807675147** — success.

## Key decisions

- Runtime Descriptor remains derived from exact PackageVersion + EntryPoint.
- Native Session / Branch / SessionRevision remains runtime authority.
- Component / Hybrid / Full use one shared Component Model.
- Text is not reimplemented.
- Hybrid/Full stage composition reuses Atria Play Host ownership.
- Full visual ownership is not Host/Session authority.
- package-runtime v1 remains declarative/capability-defined.
- Native Preview remains non-persistent.
- Formal plan remains unchanged.

## Explicitly not started

A4 deliberately did not implement:

- A5 Atria Plugin manifest/API;
- A5 contribution registry / Host Plugin boundary;
- A5 permission/dependency model;
- A5 Native Skill integration;
- A6 Product Frontend;
- A7 Studio UX;
- A8 Project Agent;
- A9 final hard-cutover cleanup.

## Next action — A5 only

Start **A5 — Plugin & Skill Platform** from the actual latest remote HEAD of the same implementation branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. `src/native/authoring-contracts.js`
7. `src/native/runtime-descriptor.js`
8. A4 Experience Runtime under `public/scripts/extensions/game-runtime/ui/`
9. current Native Skill / orchestration / extension contribution code relevant to Plugin & Skill integration.

A5 must implement the frozen Plugin & Skill Platform:

- Atria Plugin manifest/API;
- contribution registry;
- Host Plugin boundary;
- declarative/capability-defined package-runtime v1;
- permission/dependency model;
- Native Skill scopes;
- Build/Play contribution integration.

Preserve A0–A4 authority. Do not introduce a competing Native persistence authority, do not permit arbitrary package JS in package-runtime v1, do not start A6/A7/A8 early, do not create a new branch, and do not merge `main`.

Stop after A5 validation/handoff.
