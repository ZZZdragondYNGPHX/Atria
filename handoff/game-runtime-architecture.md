# Atria Game Runtime Architecture — Implementation Handoff

## Current branch and HEAD

- Working branch: `refactor/game-runtime-architecture`
- Created from: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Working branch currently contains no feature-code changes.
- Formal architecture plan: `docs:refactor/game-runtime-architecture.md`
- Plan commit on `docs`: `b696e600ef85d5a04346f290304d16cd57671453`

## Completed

- Researched current Atria Regex engine and prior Regex Engine Performance Refactor.
- Confirmed Regex already has execution-plan caching, lane semantics, runtime providers and diagnostics; the new task must not repeat that work.
- Researched current CardApp file storage, runtime, Studio, import/export packing, Git history and context API.
- Researched Immersive presentation contracts.
- Researched Atria state/FloorState, variable op-log, tool-calling and custom orchestration tools.
- Completed multi-round architecture discussion with the user.
- Architecture approved by the user.
- Created the implementation branch.
- Wrote the permanent master plan.

## Architecture decisions

1. Regex returns to basic text transformation and is not the new UI/game substrate.
2. MVU, LoreState and legacy Regex status-bar patterns are not new-architecture compatibility constraints.
3. Atria becomes the authoritative Game Runtime for Game Packages.
4. Character cards may carry complete `game.json`-rooted Game Packages.
5. Authoritative game state uses a World/Event model: Schema + Event Journal + Snapshot + Branch/Replay.
6. Normal mutation happens through typed Commands, not arbitrary state writes.
7. LLM is split into Intent Resolver and Narrator; LLM does not own authoritative arithmetic/state mutation.
8. Game Logic Runtime owns validation, formulas, deterministic RNG, reducers, rules and simulation.
9. UI supports Component / Hybrid / Full takeover modes through stable Surface APIs.
10. UI consumes Selectors, not raw mutable world state.
11. LLM consumes Observations, not raw full world state.
12. Declarative DSL/formulas serve ordinary authors; restricted JS serves advanced authors through the same runtime.
13. CardApp Studio evolves into Atria Game Studio rather than creating a second parallel authoring product.
14. Game Package travels with the character-card artifact.

## Not started

No implementation phase has started.

The implementation conversation should begin with R0/R1 foundation and must re-check live `main` before editing. If `main` advanced after this handoff, rebase/merge the working branch deliberately according to repository rules before implementation.

## Implementation phases

- R0 Regex Separation
- R1 Game Package Foundation
- R2 World/Event Runtime
- R3 Game Logic Runtime
- R4 Card UI Runtime
- R5 LLM Bridge
- R6 Game Studio

Each phase must be independently runnable/testable.

## Validation status

Planning/research only. No implementation tests have been run because feature code has not been modified.

## Next step

Read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/game-runtime-architecture.md`
5. `docs:refactor/game-runtime-architecture.md`

Then verify the live `main` and working branch HEAD, inspect current Regex/CardApp/state/tool-calling code, and begin implementation without reopening product design.
