# Atria Game Runtime Architecture — Implementation Handoff

## Current branch and HEAD

- Working branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Current working HEAD: `d7546b216acff61f796e4cf95fa47c1653f8eef5`
- Live `main` remains `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Formal Master Plan: `docs:refactor/game-runtime-architecture.md`
- Current status: **R0-R4 complete against their Master Plan exit criteria. R5 has begun with the LLM-safe Command tool catalog, World Observation, branch-anchored Turn Context and live World-session integration.**
- No PR has been opened and nothing has been merged to `main`; keep this branch and continue the Master Refactor.

## R3 checkpoint — Game Logic Runtime

R3 implementation is complete against the Master Plan exit contract.

Implemented under `public/scripts/extensions/game-runtime/logic/`:

- typed Command Registry with argument schemas and precondition validators;
- one Command Bus for JS-authored and declarative-authored logic;
- safe Formula AST with bounded parsing/evaluation and no JavaScript `eval`;
- deterministic namespaced RNG with trace output and committed outcome provenance;
- typed Reducer Registry with event payload schemas;
- deterministic Rules Engine with priority/id ordering, bounded evaluation, derived-event limits and Rule Trace;
- atomic command transactions through `WorldRuntime.commitEvents`;
- simulation/no-commit path using the same command/reducer/rule/RNG contracts;
- structured `GameLogicError` codes/stages/details for cross-module failure ownership;
- serialized simulation/commit execution so authoritative reads cannot overlap another transaction;
- event journal metadata for command/transaction/RNG/rule provenance;
- declarative compiler that produces the same Command/Reducer/Rule contracts instead of a second engine.

Important invariants now covered by tests:

- invalid arguments/preconditions fail before authoritative mutation;
- reducer payload/schema failure leaves World state, journal and persistence unchanged;
- simulation writes nothing;
- simulation followed by commit yields the same deterministic RNG outcome;
- replay consumes committed outcomes rather than rerolling;
- derived rule chains commit atomically;
- Rule Trace is deterministic and bounded;
- Formula execution only sees World snapshot, command args, explicit selectors and whitelisted RNG functions;
- no public generic `set_state(path,value)` or broad SillyTavern/Atria context was introduced;
- declarative reducer path assignment is compile-time authoring only and is not exposed as a UI/LLM mutation primitive.

R3 focused validation:

- Workflow: `Game Runtime Dev Checks`
- Run: `35548001015` (#88)
- HEAD: `9276e460c7534c6ad097771f462b3917f6c53080`
- Result: success
- Includes the dedicated `r3-exit-matrix.test.js` plus Command/Validator/Rules/Reducer/Formula/RNG/Simulation/World tests and focused ESLint.

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

## R4 — Card UI Runtime complete

R4 is complete against the Master Plan exit contract.

Implemented under `public/scripts/extensions/game-runtime/ui/`:

- versioned stable Surface vocabulary decoupled from inherited SillyTavern DOM selectors;
- Atria-owned Host Surface adapter for Component/Hybrid packages;
- read-only Selector Runtime with immutable World snapshots;
- declarative Selector resources compiled through the safe Formula AST;
- safe declarative HTML bindings:
  - `data-atria-bind-text`
  - `data-atria-bind-value`
  - `data-atria-bind-hidden`;
- typed UI actions:
  - `data-atria-command`
  - bounded JSON arguments
  - dispatch/simulation modes;
- no UI generic World setter and no broad Atria/CardApp context;
- resilient UI value cloning with safe fallback for older browser/WebView environments;
- native component composition for the original Atria conversation and composer nodes;
- Hybrid mode that recomposes the same native chat/generation machinery instead of duplicating it;
- responsive environment contract:
  - desktop/tablet/mobile
  - portrait/landscape
  - touch/keyboard
  - viewport geometry
  - safe-area CSS variables;
- declarative Immersive presentation bridge over the existing `Atria.immersive.registerProvider()` API;
- Immersive state sourced only from Selectors and Immersive actions routed only through typed Commands;
- Full mode with an Atria-owned recovery shell outside package DOM control;
- Full recovery actions for exit UI, emergency stop, current-session package disable and diagnostics;
- Escape recovery owned by the host;
- broken Full packages fail before completed takeover and leave the host usable;
- live package logic is now wired into production World Sessions for declarative `.json` logic entries;
- advanced package JavaScript logic remains fail-closed until the restricted advanced-JavaScript runtime is implemented.

UI takeover semantics:

- **Component** — native Atria remains primary and package UI mounts into stable surfaces.
- **Hybrid** — package shell may rearrange native conversation/composer while those original nodes remain the single source of truth.
- **Full** — package owns the main experience surface, but Atria retains an out-of-package recovery chrome and can still mount the original native conversation/composer.

R4 exit coverage:

- Component fixture: static safe HTML + Selector/typed Command vertical slice.
- Hybrid fixture: native conversation/composer recomposition and exact restoration.
- Full fixture: main-surface takeover + out-of-package recovery shell.
- Desktop browser smoke: Full takeover/recovery in real Chromium.
- Mobile browser smoke: Hybrid composition + mobile/portrait/touch responsive contract in real Chromium.
- Broken-package recovery: invalid Full native ownership aborts takeover and restores/retains the host.

Final R4 validation:

- `Game Runtime Dev Checks` #160 — run `35550867047` — HEAD `adc607bc5c1bdbe383d2647d82b1e0b323743df4` — success.
- `Game Runtime R4 Browser Checks` #2 — run `35550867046` — same HEAD — success.
- The first browser run failed only because the synthetic smoke page lacked the real Atria mobile viewport meta tag; after matching the production viewport contract, desktop and mobile Chromium smoke both passed.
- Android and Docker builds were not run because they remain opt-in and R4 changed browser runtime/UI contracts only.

Important R4 boundaries:

- UI bindings are presentation/adaptation only; reducers/Commands remain authoritative mutation.
- Hybrid/Full native composition moves original host nodes; it does not clone or reimplement generation/swipe/edit/regenerate state.
- Immersive remains a presentation layer and never owns World/Event state.
- Full recovery controls are created and owned by Atria outside package DOM.
- Host internal selectors remain implementation details behind Surface/Native Component adapters.

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

12. Added **Persistent Game Surface / Conversation Timeline separation**:
    - Game UI is not modeled as HTML living in a special “floor 0”;
    - Component/Hybrid/Full surfaces are persistent, branch-aware presentation layers independent of individual floor DOM;
    - Conversation Timeline remains the history/context/swipe/branch model and may be embedded as a Native Component;
    - Narrative Cards without `game.json` remain first-class and do not pay a Game Runtime authoring/runtime tax.

13. Added **Turn Controller / Turn Transaction semantics** for R5:
    - stable turn/attempt identity rather than relying only on mutable floor indexes;
    - Stop Generation aborts the unfinished attempt without leaving active finalized game/memory/orchestrator artifacts;
    - Undo Turn restores the prior finalized turn;
    - deleting an assistant attempt cannot leave its World effects active;
    - Rewrite Narrative preserves Command/RNG/Event facts and regenerates prose only;
    - Retry Turn creates a new full attempt and Event branch;
    - switching a full variant/swipe selects the matching World/Event/Memory/Orchestrator lineage;
    - narrative-only variants may share one Event lineage.

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

R0-R4 are complete. The Master Refactor is not complete.

Remaining phases:

- R5 — LLM Runtime & Model Roles: initial command-tool generation, command visibility, World Observation and branch-anchored Turn Context are already implemented. Remaining work includes Intent Resolver, optional Event Interpreter, Turn Controller/Turn Transaction, interruption/variant semantics, Memory/Orchestrator bridges, single Narrative Producer arbitration, Narrator, committed-fact enforcement, UI-action shortcut and Runtime Role routing/fallback.
- R6 — evolve the existing CardApp Studio into Atria Game Studio; do not create a parallel second Studio.
- R7 — Atria Game-first Shell Redesign after R5-R6 runtime/authoring contracts are stable.

Known R4 intentionally deferred boundary:

- package-loaded advanced JavaScript Game Logic remains fail-closed; only declarative JSON logic is live until a restricted advanced-JavaScript execution environment exists.
- R4 establishes runtime contracts, not final Atria 1.0 visual language; R7 owns the host design-system redesign.

## Next implementation step

Continue on the existing branch from:

`refactor/game-runtime-architecture@d7546b216acff61f796e4cf95fa47c1653f8eef5`

Begin **R5 — LLM Runtime & Model Roles** without reopening R0-R4 unless a concrete R5 integration defect proves necessary.

R5 foundation already landed:

1. LLM-safe typed Command tool catalog;
2. command visibility/exposure metadata;
3. read-only World Observation projection;
4. minimal branch-anchored Turn Context;
5. live World-session integration and focused coverage.

Continue with Intent Resolver and optional Event Interpreter, then implement the Turn Controller/Turn Transaction semantics now recorded in the Master Plan before completing Runtime Role routing, Memory/Orchestrator bridges and single Narrative Producer arbitration.

Do not:

- let an LLM directly emit arbitrary state patches or numeric deltas;
- expose generic `set_state`;
- let Memory/Orchestrator/Narrator override committed World/Event facts;
- create competing per-subsystem current-state truths;
- let Director and Narrator both write the final prose body for one turn;
- collapse Connection Profile and Runtime Role into one concept;
- start R7 shell redesign before R5-R6 contracts are stable.
