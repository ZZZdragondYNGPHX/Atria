# Atria Game Runtime Architecture — Implementation Handoff

## Current branch and HEAD

- Working branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Current validated working HEAD: `1da96c37598223e3a2b89f9561a7722d12e58b6b`
- Live `main` remains `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Formal Master Plan: `docs:refactor/game-runtime-architecture.md`
- Current status: **R0-R5 complete against their Master Plan exit criteria. R5 is the formal midpoint handoff. Next phase: R6 — Game Studio.**
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

## R5 — LLM Runtime & Model Roles complete

**R5 is complete and is the formal midpoint checkpoint for the Master Refactor.**

Validated implementation HEAD:

`refactor/game-runtime-architecture@1da96c37598223e3a2b89f9561a7722d12e58b6b`

### R5 authoritative turn pipeline

The production path now converges on one branch-anchored Turn Context:

```text
free text
 -> Intent Resolver
 -> typed Command
 -> deterministic Game Logic
 -> committed Events / World projection
 -> Memory recall
 -> optional spec/agenda/loop guidance
 -> Narrator OR Director
 -> final prose
 -> authoritative post-turn Memory update

UI typed action
 -> typed Command
 -> deterministic Game Logic
 -> committed Events / World projection
 -> Memory recall
 -> optional orchestration
 -> Narrator OR Director
 -> final prose
 -> authoritative post-turn Memory update
```

Deterministic UI actions skip Intent Resolver and Event Interpreter.

### Command tool generation / visibility

Implemented:

- LLM-safe tool catalog generated from typed Command definitions;
- explicit `llm.expose` opt-in;
- dynamic Host-side visibility predicates;
- visibility errors fail closed;
- provider-safe transport tool-name mapping;
- reserved `game_no_change` path;
- Host re-validates every model-proposed Command against the real Command schema before execution;
- model-invented arithmetic/state fields cannot bypass the Command Bus.

### Intent Resolver

Implemented:

- receives user input + bounded authoritative Observation + branch anchor;
- can only choose currently visible typed Commands or `game_no_change`;
- cannot emit World patches, Event Journal writes, damage/HP/inventory deltas or final prose;
- provider/tool output is revalidated by Host code;
- no-change creates no Command/Event noise.

### Event Interpreter

Implemented:

- optional semantic-only LLM stage;
- closed JSON Schema with allowed event types/severities;
- confidence threshold and explicit no-change;
- low confidence defaults to no-change, with optional strict reject policy;
- no mutation tools are supplied;
- forbidden numeric/state-patch fields fail closed;
- runtime verifies World State and Event Journal are unchanged across interpretation;
- accepted semantic interpretations are recorded in Turn Context only.

Deterministic mapping:

```text
accepted typed interpretation
 -> Interpretation Mapping Registry
 -> at most one typed Command proposal
 -> Command validation
 -> Command Bus
 -> committed Events
```

The Interpreter's semantic `eventType` is never written directly to the Event Journal.

Declarative Game Logic supports `interpretations` mappings using the existing safe Formula Template context.

### World Observation and Turn Context

Implemented:

- explicit Observation projectors rather than raw World dumps;
- recent authoritative Event projection;
- branch/floor/swipe anchored Turn identity;
- immutable Turn Context advancement;
- stable fact precedence:
  1. World Observation
  2. committed Events
  3. Command results
  4. active-branch chat
  5. Memory recall
  6. Orchestrator guidance
- explicit provenance ledger carrying authority rank/source identifiers.

### Memory recall bridge

Implemented:

- uses existing Memory Graph public `openSession().recallMemory()`;
- query derives from user input, resolved Commands, committed Events and bounded Observation;
- does not reconstruct current World truth from Memory prose;
- Memory packets are tagged `historical_context` / authority rank 5;
- source-current guard plus Game Runtime branch guard before/after recall;
- swipe/branch changes reject stale recall;
- Memory-unavailable path degrades without breaking the Turn;
- runtime rejects any recall path that mutates World State or Event Journal.

### Authoritative post-turn Memory ingestion

Implemented across Game Runtime + Memory Graph:

- hard game memories derive directly from committed Events, never by reparsing final prose;
- `game_event` external provenance sources;
- `authoritative` Memory fact type with confidence cap 1.0;
- narrow `applyAuthoritativeFacts` API;
- authoritative API accepts only authoritative create operations;
- top-level authoritative write avoids chat Episode capture;
- inactive branch/event sources become stale and their facts stop participating in current recall;
- Memory rebuild preserves authoritative event-derived facts;
- manual correction semantics remain unchanged;
- Narrator and Director share one post-turn Memory finalization path;
- final prose must exist before post-turn Memory finalization.

### Orchestrator bridge / Narrative Contract

Implemented:

- Game Runtime receives a read-only authoritative Turn view;
- spec / agenda / loop reuse the existing Orchestrator runtimes and return **advisory guidance only**;
- Orchestrator guidance has authority rank 6 and cannot override World/Event facts;
- Game Runtime checks World/Journal are unchanged across orchestration;
- Director uses the existing Director main-agent runtime with a buffer-only handle;
- Game Runtime Director API does not directly write a chat floor;
- Director takeover replaces Narrator as the **sole** final-body producer for that Turn;
- non-Director modes use Narrator exactly once;
- Narrative Contract separates:
  - must-remain-true World/Events/Command results;
  - historical Memory;
  - advisory Orchestrator guidance;
  - hard constraints;
  - source provenance;
- narrative mutation of World/Journal is rejected.

### Runtime Roles / Model & Runtime configuration

Implemented role layer:

- `narrator`
- `intent_resolver`
- `event_interpreter`
- `orchestrator`
- `studio`

Runtime Role is separate from Connection Profile.

Each role supports:

- primary Connection Profile;
- ordered fallback queue;
- timeout;
- retry count;
- reasoning policy metadata;
- tool/structured-output requirements.

Fallback behavior:

- provider/network/timeout/rate-limit/server failures may retry/fallback;
- invalid input/schema/validation/abort errors fail closed instead of silently switching providers.

Functional Model Runtime settings/API:

- versioned `modelRuntime.roles` settings;
- immutable read snapshots;
- per-role update API;
- Connection Profile implementation fields are not copied into Runtime Role config.

Intent Resolver, Event Interpreter and Narrator can all route through Runtime Role Router.

### Turn Controller / Turn Transaction

Implemented explicit phases:

- submitted
- resolving
- calculating
- recalling
- orchestrating
- narrating
- finalized
- aborted
- failed

Identity:

- stable `turnId` = one user intent;
- separate `attemptId` = one concrete outcome attempt.

Semantics:

- **Stop Generation**: abort unfinished attempt; no active finalized artifact is produced.
- **Undo Turn**: deactivate current attempt and restore pre-turn World projection.
- **Delete Assistant Result**: delete the assistant Turn artifact set and deactivate all outcome attempts for that Turn.
- **Rewrite Narrative**: keep Command/Event/Observation facts unchanged and generate a prose-only variant.
- **Retry Turn**: create a sibling attempt branch and rerun the full authoritative pipeline.
- **Switch Variant**: select the matching attempt World branch and native assistant swipe.

World outcome branches use sibling branch paths such as:

```text
chat branch [0]
  attempt 0 -> [0,0]
  attempt 1 -> [0,1]
  attempt 2 -> [0,2]
```

Their Events coexist in the Journal; replay selects only the compatible attempt branch.

### Native assistant timeline integration

The Turn Controller is bound back to Atria's native conversation model:

- first finalized attempt creates the assistant message;
- Retry appends another native assistant swipe;
- Switch Variant selects the corresponding swipe and World branch;
- Rewrite Narrative edits prose on the existing active swipe without changing authoritative outcome facts;
- deleting the assistant Turn deletes the whole message rather than reindexing attempt swipes;
- package UI typed actions are routed through the complete R5 turn pipeline instead of dispatching a bare Command only.

This preserves the Persistent Game Surface / Conversation Timeline separation while keeping native floor/swipe behavior first-class.

### Compatibility hardening

R5 LLM modules share `llm/clone.js`:

- uses native `globalThis.structuredClone` when available;
- safe fallback supports the plain JSON-like runtime values used by Turn/Observation/role contracts;
- rejects functions, symbols, circular references and unsupported objects.

This fixed jsdom/older-WebView compatibility exposed by the final UI-button integration test.

### R5 exit verification

Dedicated coverage includes:

- `r5-exit-matrix.test.js`
- `r5-ui-button.test.js`
- `llm-intent-resolver.test.js`
- `llm-event-interpreter.test.js`
- `interpretation-mapping.test.js`
- `llm-memory-bridge.test.js`
- `llm-memory-ingestion.test.js`
- `llm-orchestrator-narrative.test.js`
- `llm-roles.test.js`
- `llm-model-runtime-config.test.js`
- `llm-turn-controller.test.js`
- World sibling-attempt branch regression tests;
- Memory Graph authoritative source/write/stale/rebuild regressions.

Final validation:

- Workflow: **Game Runtime Dev Checks**
- Run: **#280 / `35556314851`**
- HEAD: **`1da96c37598223e3a2b89f9561a7722d12e58b6b`**
- Result: **success**
- Includes R0-R5 focused tests and focused ESLint.
- R4 browser regression also remained green after UI actions gained the host-dispatch path: **Game Runtime R4 Browser Checks #3**, HEAD `29fbc5f824324aadddbf550cfc6a7c18c85f1f54`.

The final R5 gate was preceded by two expected test-environment failures (#265/#266) caused by jsdom lacking native `structuredClone`. The fix was applied at the R5 runtime compatibility layer rather than papering over production code in the fixture; #280 is the validated result.

Android and Docker builds were not run because they remain opt-in and R5 changes are browser/Node runtime architecture.

### R5 boundaries preserved

- no generic public `set_state`;
- no LLM-owned arithmetic;
- no Event Interpreter direct state/event writes;
- no Memory or Orchestrator competing current-state authority;
- no Director + Narrator double final-body generation;
- no raw full-World dumping into every LLM request;
- no built-in RPG field assumptions;
- no speculative large-world Entity Store;
- no R6 `.atria` build/import/export implementation pulled forward;
- no R7 visual shell redesign pulled forward.

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

14. Added **domain-agnostic World/Game Logic requirement**:
    - HP/MP/level/affection/inventory/quest/combat are examples only, never canonical engine fields;
    - Game Packages own their complete World Schema, Command vocabulary, Event types, Rules and Selectors;
    - the same runtime must support RPG, Galgame/visual novel, detective, management, card/board, strategy and other author-defined domains;
    - tests/docs may use small RPG-like fixtures for readability, but implementation must not special-case those paths.

15. Added **large-world scalability guardrail**:
    - v1 structured JSON World State remains the current implementation model;
    - public APIs must not require the entire world to remain one monolithic JSON object forever;
    - future Entity Collections / indexes / query layers / partitioned projections may be introduced for grand-strategy-scale simulations while preserving Command -> Event -> Reducer semantics;
    - do not expand the current R5 scope to implement that future Entity Store without a concrete need.

16. Added **Atria Native Package Format**:
    - PNG/JSON/CharX remain supported compatibility/interchange formats;
    - complete Atria Game Packages should gain a native *.atria distribution artifact instead of indefinitely embedding growing multi-file/binary projects into PNG metadata or giant JSON/base64 payloads;
    - .atria is planned as a standard ZIP container with a versioned root package manifest, card data, Game Runtime project files, knowledge/skills and binary assets;
    - manifest.json (container/package contract) remains distinct from game/game.json (Game Runtime contract);
    - Game Studio edits an unpacked source project and builds/validates the distribution artifact;
    - package extraction must enforce path traversal/archive/resource/manifest validation;
    - Game Package and live Save are separate contracts; a future portable save may use a separate *.atria-save style artifact;
    - R6 Game Studio owns the native package build/import/export pipeline. Do not expand the current R5 scope to implement it early.
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

**R0-R5 are complete. The Master Refactor is not complete.**

Remaining phases:

- **R6 — Game Studio**: evolve the existing CardApp Studio into Atria Game Studio. This phase owns project-aware authoring, structured runtime editors, simulation/trace tooling and the native `.atria` package build/import/export pipeline.
- **R7 — Atria Game-first Shell Redesign**: redesign the host shell only after R6 stabilizes the final runtime + authoring contracts.

Known deferred boundaries carried into R6/R7:

- package-loaded advanced JavaScript Game Logic remains fail-closed until a restricted advanced-JavaScript execution environment is deliberately designed;
- R5 exposes functional Runtime Role configuration data/API, but the final role-oriented Model & Runtime **UI** belongs to R7;
- large-world Entity Store/query/index evolution remains measurement/use-case gated and is not part of R6 by default;
- R4/R5 establish runtime contracts, not the final Atria 1.0 host visual language.

## Next implementation step — R6 Game Studio

Continue the same long-running branch from:

`refactor/game-runtime-architecture@1da96c37598223e3a2b89f9561a7722d12e58b6b`

This is the **R5 midpoint handoff**. Start **R6 — Game Studio**.

Do not reopen R0-R5 unless a concrete R6 integration defect requires a targeted fix.

R6 must **evolve the existing CardApp Studio** rather than creating a parallel second authoring product.

R6 target:

1. inspect the current CardApp Studio architecture, CodeMirror/file tree/live preview/AI builder/diff/Git flows;
2. rename/evolve the product into Atria Game Studio while retaining useful infrastructure;
3. add project navigator and structured editors for World Schema, Initial State, Commands, Formulae, Rules, Selectors and Observations;
4. add Simulation Console, Rule Trace, Event Timeline, World State Inspector, LLM Tool Preview and Observation Preview;
5. make AI Builder project-aware so one request can propose coordinated cross-file changes with reviewable diffs;
6. establish source-project vs distribution-artifact workflow;
7. implement the native standard-ZIP `.atria` package contract, builder, validator, importer and exporter;
8. keep container-level `manifest.json` distinct from Game Runtime `game/game.json`;
9. enforce safe extraction: traversal rejection, resource/archive limits, manifest/version validation and asset integrity inventory;
10. prove lossless nested text/binary package round-trip and reimported runtime behavior;
11. retain PNG/JSON/CharX interoperability for appropriate Narrative/simple-card workflows;
12. preserve CodeMirror/Git/diff approval/history capabilities.

R6 exit criteria from the Master Plan:

- create a small playable game through Studio;
- simulate/debug it;
- build a lossless `.atria` package;
- reimport it and retain project/runtime behavior;
- nested text/binary assets round-trip;
- malformed/traversal/oversized inputs fail safely;
- PNG/JSON/CharX interoperability remains intact.

Do not start R7 host-shell redesign during this R6 task.

Do not merge/delete `refactor/game-runtime-architecture` until R0-R7 are all complete.
