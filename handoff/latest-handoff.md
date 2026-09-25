# Latest handoff — Native Prompt Controls

Updated: 2026-09-25 (Asia/Shanghai).

## Current task

Repository: `ZZZdragondYNGPHX/Atria`

Task: Atria Native Prompt Controls / runtime-selectable Prompt Program options.

Implementation branch:
`feat/native-prompt-controls`

Branch base and current HEAD:
`d29c2b3170798b136eb41249eaad902a23aab5bd`

Current remote `main` at task creation:
`d29c2b3170798b136eb41249eaad902a23aab5bd`

Formal plan:
`docs:feat/native-prompt-controls.md`

The plan is intentionally a living backlog. NPC-001 is the only confirmed gap so far.
If the user adds more gaps, append NPC-002/NPC-003/etc. before or during implementation.
Do not invent adjacent scope.

## Confirmed gap

NPC-001: Native Prompt Programs already have typed parameters and module conditions,
but the player-facing runtime has no product-quality controls for selecting them.

The required product behavior includes:

- boolean on/off controls;
- mutually exclusive single-choice groups;
- human-readable labels/options rather than raw enum text entry;
- effective selections flowing through validated Native `prompt.parameters`;
- runtime choices must not create immutable Prompt Program revisions;
- preview and execute must agree;
- safe stale/invalid-value handling;
- desktop/mobile usability;
- Native persistence/authority only.

TGbreak is only a motivating example. Core code must remain generic.

## Architecture boundaries

Preserve the current Native Model / Prompt / Runtime authority and exact resource
revision model. Do not restore SillyTavern preset authority, Tavern Helper DOM
control, Regex state, `setvar/getvar/random`, MVU state, localStorage authority,
or default legacy preset migration.

Authoring owns definitions/defaults. Runtime owns the player's effective selection.
Reuse the current Native Prompt compiler condition path rather than creating a
second prompt-condition engine.

## Start by reading

1. Local workspace `AGENTS.md`
2. Local workspace `FORK_MAINTENANCE.md`
3. `docs:feat/native-prompt-controls.md`
4. `main:src/native/model-prompt-runtime/README.md`
5. `main:src/native/model-prompt-runtime/contracts.js`
6. `main:src/native/model-prompt-runtime/prompt-compiler.js`
7. `main:src/native/model-prompt-runtime/prompt-values.js`
8. `main:public/scripts/native/prompt-authoring.js`
9. `main:public/scripts/native/prompt-semantics.js`
10. Relevant current Runtime/Play request UI and generation-host paths discovered from the code.

Use the actual remote `feat/native-prompt-controls` HEAD if another session has
advanced it. Preserve existing commits; never reset back to this creation HEAD.

## Completed / validation

Task setup only:

- `feat/native-prompt-controls` created from current `main`.
- Formal plan created on `docs`.
- No product implementation has been made on the feature branch.
- No implementation tests/CI are claimed.

The previous Native Product UX audit is complete and integrated. Do not restart its
Groups 1–9 or reopen its 44-item backlog as part of this task.

## Next

When implementation begins, first reconcile the plan against the current code and
record any substantive architecture decision in the formal plan. Then implement
NPC-001 generically, test it offline, and continue according to the user's current
Astra workflow. If the user has added more NPC items by then, include them in the
same task branch rather than creating a branch per gap.

Do not merge `main` until the full Native Prompt Controls task/backlog is complete
and validated.
