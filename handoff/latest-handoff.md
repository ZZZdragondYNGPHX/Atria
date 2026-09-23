# Active checkpoint: Native Authoring Platform A3 complete; ready for A4

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A3 — Native Game Runtime Cutover.**

Prior Native Content & Session Architecture N0–N10 remains complete and frozen. A0–A2 remain frozen and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A4 — Experience Runtime**
- Continue on the same implementation branch. Do not create a new branch and do not merge `main`.

Formal plan design did not change during A3; no mechanical plan edit was required.

## A3 implemented

### Native Runtime Descriptor

A3 added a derived Runtime Descriptor compiler/resolver backed by exact Native Package authority:

`PackageVersion + EntryPoint → Runtime Descriptor`

It preserves exact PackageVersion content identity and explicit Experience mode. Runtime Descriptor is never persisted as a competing package/runtime repository.

Native Session HTTP now exposes:

- `/api/native/session/runtime/resolve`
- `/api/native/session/runtime/resource`

Runtime resources resolve only from the exact PackageVersion pinned by the Session. The A3 runtime resource surface is declarative `.json` only and does not expose arbitrary package JavaScript execution.

### Game Runtime authority

The active A3 Text Runtime no longer depends on:

- `game.json` / `GAME_MANIFEST_PATH`;
- charId / Character package identity;
- `/api/card-app/*` runtime loading;
- swipe-derived Game World branch paths;
- Chat State `atri_game_world`;
- independent Game World branch/timeline persistence.

Mature algorithms remain reused: command registry/validation, declarative logic, formula, reducers, rules, deterministic RNG, interpretation, observation, LLM intent/event/narrative/orchestration, memory and turn-controller concepts.

### Native World / Branch / Revision

- exact packaged WorldRevision provides immutable schema/baseline;
- current World state lives in SessionRevision `atri_world_state`;
- game-domain event projection lives in SessionRevision `atri_game_runtime`;
- World state + game event projection commit atomically through the Native runtime state path;
- Session / Branch / SessionRevision remains the only history/branch authority.

Game transactions and LLM Turn Context use Native `sessionId + branchId + revisionId` identity instead of floor/swipe branch identity.

Turn attempts/retries use real Native Branches.

### Text Experience

Text Experience is now the A3 end-to-end runtime baseline.

The existing Conversation/Composer/generation machinery remains only as an internal host ABI. Normal Native Text user turns are committed through the Native Session write barrier, routed into Game Runtime, and resulting narrative is published back through Native Timeline authority.

Component / Hybrid / Full activation is deliberately deferred to A4.

## A3 validation

Validated at `ba1ba05e0cd53b0947be34bed62707a297d97ac2`.

### Native Authoring Platform A3 Checks #12

- Run: **35805724557**
- focused + adjacent Native regressions: **15 suites / 165 tests passed**
- A3 Native Game Runtime residual guard: **success**
- A3 guard syntax: **success**
- frozen A0/A1/A2 guards: **success**
- focused ESLint: **success**
- full root lint: **success**

Frozen workflows on the same HEAD:

- **A0 Checks #61**, Run **35805724614** — **5 suites / 50 tests passed**, success.
- **A1 Checks #48**, Run **35805724567** — **7 suites / 60 tests passed**, success.
- **A2 Checks #46**, Run **35805724587** — **10 suites / 52 tests passed**, success.

## Key decisions

- Runtime Descriptor is derived, not a second Package authority.
- Native Session / Branch / SessionRevision remains runtime history/state authority.
- WorldRevision is immutable definition/baseline; current World state is SessionRevision state.
- Game-domain event projection is SessionRevision state, not a parallel Session timeline.
- Existing mature algorithms are retained behind Native authority.
- A3 activates Text only.
- No compatibility alias, dual read/write, charId bridge, CardApp runtime bridge or swipe branch bridge was introduced.
- Formal plan remains unchanged.

## Explicitly not started

A3 deliberately did not implement:

- A4 shared Component Model;
- Component surfaces;
- Hybrid stage composition/native slots;
- Full stage ownership/recovery;
- A5 Plugin platform;
- A6 Product Frontend;
- A7 Studio Authoring UX;
- A8 Project Agent product workflow.

## Next action — A4 only

Start **A4 — Experience Runtime** from the actual latest remote HEAD of the same implementation branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. `src/native/authoring-contracts.js`
7. `src/native/runtime-descriptor.js`
8. `src/native/session-core.js`
9. `public/scripts/native/session-runtime.js`
10. A3 `public/scripts/extensions/game-runtime/` Text Runtime implementation
11. existing Atria Play host / surface / structured UI runtime code relevant to Component / Hybrid / Full.

A4 must preserve A3's Native authority and Text baseline while implementing the frozen Experience Runtime:

- shared Component Model;
- Component semantic surfaces;
- Hybrid stage composition/native slots;
- Full stage ownership/recovery;
- declarative/capability-defined package runtime only;
- exact PackageVersion + EntryPoint and Native Session / Branch / SessionRevision identity.

Do not restore `game.json`, charId, CardApp runtime loading, swipe-derived Game World branches or Chat State Game World authority.

Stop after A4 validation/handoff. Do not enter A5 early, do not create a new branch, and do not merge `main`.
