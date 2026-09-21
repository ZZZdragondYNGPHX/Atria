# Atria Game Runtime Architecture — Implementation Handoff

## Current branch and HEAD

- Working branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Current working HEAD: `9276e460c7534c6ad097771f462b3917f6c53080`
- Live `main` remains `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Formal Master Plan: `docs:refactor/game-runtime-architecture.md`
- Current status: R0 complete, R1 complete at its planned foundation scope, R2 minimum World/Event vertical slice complete, and **R3 Game Logic Runtime complete against the Master Plan exit criteria**.
- No PR has been opened and nothing has been merged to `main`; keep this branch and continue the Master Refactor.

## Midpoint completed

### R0 — Regex Separation

- Added an explicit architecture boundary to Regex Core: Regex owns string transformation only.
- Game Runtime does not depend on Regex for world state, package activation, persistence or UI lifecycle.
- Existing Regex Engine Performance Refactor remains intact; execution-plan caching, lane indexing/runtime providers and diagnostics were not reimplemented.
- Added a structural regression test that prevents Game Runtime from depending on Regex and prevents the R0/R1 foundation from silently growing DOM/world mutation responsibilities.

### R1 — Game Package Foundation

Implemented a real `game.json`-rooted package foundation under:

- `public/scripts/extensions/game-runtime/manifest.js`
- `public/scripts/extensions/game-runtime/package-loader.js`
- `public/scripts/extensions/game-runtime/index.js`
- `public/scripts/extensions/game-runtime/manifest.json`

Current manifest contract includes:

- `format: "atria-game"`
- `manifestVersion: 1`
- package id/name/version
- Game Runtime version gate
- declared capabilities
- optional Component/Hybrid/Full UI entry
- optional World schema/initial entry
- optional Logic entry
- strict unknown-field rejection
- safe package-relative path validation

Game Package discovery:

- root entry is `game.json`, not `index.js`;
- missing `game.json` means “no Game Package”, not an error;
- malformed/incompatible packages do not activate;
- declared `world/ui/logic` files are checked against the real character file inventory before activation;
- invalid packages leave the normal Atria host UI available as the recovery shell.

Transport reuse:

- Game Package deliberately reuses the existing CardApp per-character directory and character-card file transport;
- package activation is not tied to `card_app.enabled`;
- package-only characters containing `game.json` are packed on export;
- nested text and binary assets round-trip through the existing character-card artifact;
- this is transport reuse only, not reuse of CardApp's broad `ctx` runtime model.

### R2 — World / Event Runtime minimum vertical slice

Implemented:

- `world/branch.js`
  - maps live chat `swipe_id` values to a deterministic game branch path;
  - historical events are replayed only when their recorded branch path is a prefix of the active path;
  - changing an earlier swipe selects another event lineage instead of manually rolling variables backward.

- `world/schema.js`
  - deterministic JSON-schema subset for World State validation;
  - no DOM dependency and no JavaScript `eval`.

- `world/journal.js`
  - versioned Event Journal;
  - monotonic event sequence/id;
  - event branch lineage;
  - snapshot records;
  - deterministic replay through pure reducers;
  - unknown event types fail replay instead of silently losing facts;
  - reducers receive a deeply frozen clone and must return the next state.

- `world/runtime.js`
  - Initial State + Event Journal + Snapshot + Branch/Replay projection;
  - atomic persistence update path;
  - schema validation before a commit becomes durable;
  - failed state validation leaves persistence unchanged;
  - bounded snapshots.

- `world/persistence.js`
  - current authoritative chat-state namespace: `atri_game_world`;
  - Chat State provides atomic storage;
  - Event Journal, not FloorState incremental patches, is the authoritative game history.

- `world/package.js`
  - loads declared World schema and initial state from the Game Package;
  - rejects invalid JSON roots and invalid initial states.

- `world/session.js`
  - binds a validated package World to the current chat;
  - loads the current swipe branch;
  - supports branch synchronization and reload from persisted Event Journal;
  - exposes an internal event commit primitive for the upcoming Command Bus.

Runtime integration:

- `game-runtime/index.js` creates a World Session for a validated package that declares `world`;
- malformed World definitions downgrade package activation to invalid rather than taking over the host;
- structural chat events synchronize the active world branch;
- the extension API currently exposes World state/journal/branch as read-only views;
- no public generic world setter or LLM-facing `set_state` was introduced.

## R3 — Game Logic Runtime complete

R3 now provides one deterministic mutation contract shared by JavaScript-authored and declarative game logic.

Implemented runtime pieces:

- typed Command Registry with JSON-schema argument validation;
- semantic command validators that run before command execution;
- safe Formula AST parser/evaluator with bounded numeric behavior and inspectable AST;
- deterministic RNG streams with bounded integer/dice/weighted domains and recorded RNG trace;
- typed reducer registry with per-event payload schemas;
- deterministic Rules Engine with priority ordering, derived events, bounded evaluation and derived-event limits;
- Rule Trace entries for emitted/no-change/condition-false decisions;
- atomic command transactions;
- simulation using the same Command/Formula/RNG/Reducer/Rule path without durable mutation;
- structured `GameLogicError` codes/stages for argument, precondition, command execution, rule, simulation and commit failures;
- command / rule / RNG provenance carried into committed World Events;
- serialized commit/simulation access so transaction identity and deterministic RNG cannot race;
- declarative Command / Reducer / Rule compiler that feeds the exact same runtime contracts as JavaScript-authored logic.

The normal write path is now:

```text
typed Command
 -> argument schema validation
 -> command validators
 -> Formula / deterministic calculation
 -> deterministic RNG
 -> initial Event drafts
 -> typed reducer projection
 -> deterministic Rules / derived Events
 -> World schema validation
 -> atomic commit
```

Simulation follows the same pipeline through projection and Rule Trace but does not persist the Journal or projected World State.

Important boundaries preserved:

- no public generic `set_state(path, value)`;
- Game Logic does not receive broad SillyTavern/Atria context;
- reducers remain the only state-transition functions;
- Rules emit Events rather than mutating World State;
- committed RNG outcomes are recorded in Event provenance and replay never re-rolls them;
- declarative logic is not a second engine: it compiles into the same Command/Reducer/Rule contracts.

R3 exit matrix is explicitly tested:

- command matrix and validation;
- deterministic replay after a committed derived-event transaction;
- deterministic RNG/provenance;
- Rule Trace and rule ordering;
- failed command leaves World State, Journal and persistence unchanged;
- simulation and immediate commit produce equivalent events/state/RNG trace/Rule Trace;
- simulation produces no persisted mutation;
- malformed declarative logic and unsafe reducer assignment paths fail before runtime activation.

Final R3 focused validation:

- Game Runtime Dev Checks run `35547976049` at `01ec11315990e9b149580a275cea79081d85e085`: success, including the formal R3 exit matrix.
- Subsequent hardening runs through #88 also passed.
- Latest validated R3 HEAD: `9276e460c7534c6ad097771f462b3917f6c53080`.

Android and Docker were not run because R3 changes are browser/Node runtime logic only and those builds remain opt-in.

## Important architecture decisions preserved

1. Regex is a text subsystem, not Game Runtime/UI/state.
2. MVU/LoreState/legacy Regex status bars are not compatibility constraints for the new runtime.
3. `game.json` is the Game Package entry.
4. Existing CardApp file storage/import/export/Git infrastructure is reused as transport/authoring infrastructure only.
5. Event Journal is the causal history source; projected World State is derived.
6. Game branch identity is based on full swipe lineage, not only the tail swipe.
7. World history does not use FloorState's incremental patch log as its authoritative event model.
8. World mutation is not exposed publicly yet. `commitEventsInternal` exists only to bridge R2 into R3.
9. The next normal mutation surface must be the typed Command Bus.
10. The Master Plan was subsequently amended after the midpoint:
    - added **Event Interpreter** as an optional semantic-analysis LLM role (not a state updater and never a direct World writer);
    - added **Connection Profile + Runtime Role** as the model-routing architecture, with primary/fallback queues and role-specific policies;
    - expanded R5 into **LLM Runtime & Model Roles**;
    - added **R7 — Atria Game-first Shell Redesign**, including a role-oriented Model & Runtime configuration UI and a host design-system/UI refactor so Atria 1.0 does not inherit the old pure-text-chat information architecture.

11. Added a formal **Turn Coordination Contract**:
    - one branch-anchored Turn Context is shared by Game Runtime, Memory, Orchestrator and the final prose producer;
    - current World Observation / committed Events outrank Memory summaries and orchestration guidance;
    - spec/agenda/loop remain guidance-only; Director replaces Narrator as the single final-body writer for takeover turns;
    - Memory recall happens after authoritative turn resolution and before orchestration/narration;
    - authoritative game memories derive from Event Journal provenance rather than re-parsing prose;
    - discarded drafts, critic output and capsules are not durable memories;
    - post-turn memory updates cannot write World State;
    - diagnostics correlate intent -> command -> events -> memory -> orchestration -> prose -> memory update under one turn id.

## Validation completed

Final focused workflow:

- Workflow: `Game Runtime Dev Checks`
- Run: `35523372735`
- HEAD: `d72058d33c9471d8514ca540d775079f97dd54a9`
- Result: success

The final run passed:

- Game Package manifest tests
- Game Package loader tests
- declared-file rejection tests
- package-only nested text/binary import-export round-trip
- CardApp transport regression tests
- Regex lane semantics
- Regex/Game Runtime architecture boundary tests
- World branch mapping tests
- World Event Journal deterministic replay tests
- snapshot replay tests
- alternate swipe branch restoration tests
- World Runtime atomic commit/reload tests
- schema-failure no-partial-write test
- World package schema/initial loading tests
- live World Session branch synchronization/reload tests
- focused ESLint for Game Runtime, World Runtime, Regex engine and CardApp endpoint

The run immediately before the final lint fix already reported 11 passing suites / 59 tests; the final run then passed both the focused unit-test step and focused ESLint.

Android and Docker were not run, per repository/user policy and because this midpoint touches browser/Node runtime architecture only.

## Current limitations / intentionally unfinished

R0-R3 are complete at their current Master Plan phase scope. Remaining work begins at R4.

Not yet implemented:

- Card UI Runtime / stable Surfaces / Selectors / declarative binding;
- Component / Hybrid / Full presentation lifecycle;
- mobile/responsive UI contract and Immersive integration;
- host escape/recovery for Game UI takeover;
- richer World Inspector / timeline UI and broader corruption diagnostics;
- LLM Runtime roles (Intent Resolver / Event Interpreter / Narrator);
- Turn Coordination Contract integrating Game Runtime, Memory, Orchestrator and final prose;
- Connection Profile + Runtime Role routing and fallback queues;
- Game Studio upgrades;
- R7 Atria Game-first Shell redesign.

The Game Runtime now has a stable typed mutation contract. R4 may dispatch Commands and request simulations, but UI code must not gain direct authoritative World mutation.

## Next implementation step

Continue on the existing branch from:

`refactor/game-runtime-architecture@9276e460c7534c6ad097771f462b3917f6c53080`

R3 is complete. Do not reopen Command/Formula/RNG/Rule architecture unless R4 exposes a concrete contract defect.

Begin **R4 — Card UI Runtime** with the smallest real vertical slice:

1. define a stable Surface API independent from SillyTavern internal selectors;
2. implement a Selector runtime that exposes read-only projections of World State;
3. implement the Component-mode mount/unmount lifecycle;
4. allow UI actions to dispatch typed Commands or request simulation only;
5. add one real Component fixture/test that reacts to selector changes;
6. preserve the host recovery/escape path when a UI package is malformed or fails to mount.

Then expand toward Hybrid/Full, declarative HTML binding/actions, responsive/mobile behavior and Immersive integration.

Do not:

- expose generic state setters to UI;
- pass broad Atria/SillyTavern context into package UI;
- bind public package contracts directly to inherited host DOM selectors;
- start R5 LLM integration before the R4 Surface/Selector contract is stable;
- start R7 host-shell redesign before R4-R6 contracts are stable.
