# Handoff — Native Experience Modes & Capability Deepening

Updated: 2026-09-26.
Status: **implementation authorized; no product code implemented yet**.

## Repository / branches

- Repository: `ZZZdragondYNGPHX/Atria`
- Current `main`: `4dab353ac639d42eae885c79e18245267abd6820`
- Work branch: `feat/native-experience-modes-capability-deepening`
- Work branch HEAD: `4dab353ac639d42eae885c79e18245267abd6820`
- Branch base: current `main`; ahead/behind at creation: 0/0
- Docs plan: `docs:feat/native-experience-modes-capability-deepening.md`
- Frozen implementation-plan commit: `009844b0750554a8c206910fb5c4c84840aab2cf`
- Baseline label: **Implementation Baseline v1.0**
- Capability count: **32**
- Entire implementation uses this one work branch through P0–P9. Do not create per-phase branches.

## Read before changing code

Read in this order:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:feat/native-experience-modes-capability-deepening.md` — read **§0 Implementation Baseline first**
4. `docs:handoff/native-experience-modes-capability-deepening.md`
5. current work-branch versions of:
   - `src/native/authoring-contracts.js`
   - `src/native/runtime-descriptor.js`
   - `src/native/session-core.js`
   - `public/scripts/native/session-runtime.js`
   - `public/scripts/native/experience/index.js`
   - `public/scripts/native/experience/ui/component-model.js`
   - `tests/native/authoring-contracts.test.js`
6. inspect adjacent current tests/guards before editing.

If remote work-branch HEAD has advanced, preserve it and continue from the actual remote HEAD. Never reset to the hashes in this handoff.

## Frozen product / architecture direction

Do not reopen the completed capability-benchmark discussion before P0.

Key invariants:

- Component / Hybrid / Full are layout-ownership modes, not capability tiers.
- All three share one Native Capability Layer.
- Package runtime stays declarative: no arbitrary Package JS, HTML/script injection, DOM/localStorage/IndexedDB handles, arbitrary CSS or network.
- World / Session / Player Continuity / Shared Realm authority writes remain typed Command/Event/Reducer or bounded transaction contracts.
- Narrative / Projection / Outcome / Diagnostics stay separated.
- State ownership/lifetime does not imply model/UI exposure; context is allow-by-contract.
- One shared truth may have many Perspective / Presentation projections.
- Revision/Branch remains the authority for Session-scoped facts.
- No remote executable UI dependency.
- Host/player owns Model/Connection/Secret/scheduling/backpressure/cancel hard limits.

This task is **not** a SillyTavern/MVU compatibility or migration project. The heavy cards already studied are capability benchmarks only.

## Implementation phases

- P0 — Contract Foundation & Regression Fence
- P1 — Component v2 / Form / Local State / Action / Opening Foundation
- P2 — Message Projection / Conversation / Branch Presentation
- P3 — Turn / Model Task / Auxiliary Operation Runtime
- P4 — Session Application / Temporal / Automation / Experience Workflow
- P5 — Activity / Media / Scene / Asset / Host Capability
- P6 — Data Projection / Perspective / Scoped Information / Narrative Rollup
- P7 — Add-on / Player Continuity / Cross-Authority Transfer
- P8 — Shared Session & Realm Runtime
- P9 — Studio / Health / Productization / Final Integration

Do not implement later phases during P0 except for the minimum contract placeholders required to avoid an ABI dead end.

## Current stage — P0

### Goal

Translate the frozen architecture into code-level contract foundations without yet building the large product surfaces.

P0 should establish the smallest durable vocabulary/version boundaries required by later phases and protect the existing Native runtime from regression.

### Expected work

1. Audit the current package/runtime contract and decide exactly which new top-level declarations belong in:
   - authoring/package contract;
   - runtime descriptor;
   - resource references;
   - capability vocabulary.
2. Keep existing `componentModelVersion: 1` packages valid and unchanged.
3. Add strict validation/versioning for new declarations rather than loose pass-through objects.
4. Add/extend contract fixtures and guards so later phases cannot:
   - reintroduce Legacy/CardApp/game.json authority;
   - add arbitrary executable package paths;
   - create a second Session/World persistence layer;
   - silently accept unknown capability/contract fields.
5. Prefer small forward-compatible contract seams over prematurely implementing all 32 features.
6. Update the formal plan only if P0 discovers a real architecture conflict with current `main`.

### P0 is explicitly not

- Component Model v2 rendering;
- new Form/Composer UX;
- Message Projection;
- Model Task scheduler;
- Temporal/Workflow runtime;
- Activity/Scene runtime;
- Add-on system;
- Player Continuity;
- multiplayer/Realm;
- Studio redesign.

Those belong to later phases.

## Verification policy

Use targeted validation, not quota-heavy ceremony.

For P0:

- run targeted contract/runtime unit tests;
- run changed-area ESLint/syntax;
- run the relevant existing hard-cut/runtime guard scripts;
- run adjacent integration tests only where the changed contract is consumed.

Do not run Android/Docker/paid inference.
Do not run a full repository suite merely by habit.
GitHub CI is not required for Codex Astra's phase completion unless the change specifically touches CI/workflow behavior.

If a normal code/test/workflow failure occurs, fix it yourself and continue.
Pause only for:
- required real Android/Termux logs;
- required real UI screenshot/manual visual evidence;
- permissions/Secret/account authorization only the user can provide;
- completion of the current multi-stage phase.

## P0 completion protocol

When P0 is complete:

1. commit and push the work branch;
2. update the formal plan only for substantive design changes;
3. update `docs:handoff/latest-handoff.md` and this task handoff;
4. record:
   - branch + HEAD;
   - completed / not completed;
   - key decisions;
   - exact tests/checks run and their result;
   - next phase target (P1);
5. stop development;
6. send the user a concise copyable prompt for a new conversation to take over P1.

Do not merge `main` after P0. The branch merges only after P9 is complete and the whole task is verified.

## Work that must not be repeated

- Do not re-audit the previously studied SillyTavern/MVU cards unless implementation exposes a specific unresolved question.
- Do not recreate the 32-capability inventory from scratch.
- Do not revive `feat/component-form-composer-submit`.
- Do not treat the old Round 5 “migration” text as current scope; §0 supersedes it.
- Do not sync or develop against `vanilla` / `luker` unless a specific implementation question truly requires upstream/legacy comparison.
- Do not change `main` directly.
