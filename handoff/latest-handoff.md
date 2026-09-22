# Active checkpoint: Native Authoring Platform refactor ready for A0

## Status

**Atria Native Content & Session Architecture N0–N10 is complete and remains frozen. A new hard-cutover refactor has completed design and is ready to start A0 implementation.**

New task:

**Atria Native Authoring Platform & Product Frontend Refactor**

- Baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- Branch was created directly from the baseline above.
- Implementation status: **not started**
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`

Do not redo N0–N10 and do not redesign the new task from scratch.

## Frozen direction

This is a hard cutover, not a compatibility upgrade.

Key frozen decisions:

- primary product domains become Play / Library / Build / Agents / Runtime;
- Studio becomes the project workspace inside Build;
- Experience is explicitly Text / Component / Hybrid / Full;
- Component / Hybrid / Full share one component model;
- World / Knowledge / worldbook authoring is a first-class game-asset workflow;
- Library supports reusable asset attachment/forking with exact immutable revisions;
- Resource Graph is derived only, never a second authority;
- Human editors and Project Agent share Authoring Operations / Workspace / ChangeSet;
- Plugin and Skill are separate concepts;
- package runtime v1 executes no arbitrary package JavaScript;
- `game.json`, charId game-package identity, swipe-derived game-world branches and Chat State game-world authority are retired through the new Runtime Descriptor + Native Session model;
- old CardApp Studio / `/api/card-app/*` / old Studio AI paths are migrated for useful capability and then deleted without compatibility aliases;
- official product surfaces converge on an Atria-native Product UI System;
- final Play UI must stop depending on reparented SillyTavern chat/composer DOM as the official product implementation.

## Implementation phases

Use the same branch for all phases:

- A0 — Contracts & Hard-cutover Guards
- A1 — Native Authoring Backend
- A2 — Library & Resource Architecture
- A3 — Native Game Runtime Cutover
- A4 — Experience Runtime
- A5 — Plugin & Skill Platform
- A6 — Native Product Frontend
- A7 — Studio Authoring UX
- A8 — Project Agent / Vibe Coding
- A9 — Hard Cutover & Product Finalization

After every phase: validate, commit/push, update docs/handoff, stop, and provide the next-phase takeover prompt. Do not create a new phase branch and do not merge `main` until the entire refactor reaches final integration.

## Next action

Start **A0 — Contracts & Hard-cutover Guards** only.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`

Fetch the implementation branch and use its actual latest HEAD.

A0 should freeze/test:

- Experience contract;
- Resource Descriptor / Registry contracts;
- Authoring Operation / Workspace / ChangeSet contracts;
- project revision/conflict semantics;
- Runtime Descriptor contract;
- Atria Plugin + package-runtime-v1 restrictions;
- Native Skill scope contract;
- residual guards preventing retired authorities from reappearing.

Do not start broad backend or UI implementation during A0.
