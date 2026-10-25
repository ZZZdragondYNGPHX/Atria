# Atria Game Runtime Architecture — Implementation Handoff

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../../README.md#122-minimal-validation-and-runtime-checks)。

## Current branches and HEADs

- R0-R6 frozen branch: `refactor/game-runtime-architecture`
- R7 implementation branch: `refactor/atria-game-first-shell-redesign`
- R7 preparation/current HEAD: `26692b80aaa073e2442f5ed23b3f082ef25b3e2c`
- Baseline/live `main`: `63da3141a3895d3386ed1bebc30876c9766315ba`
- Formal Master Plan: `docs:refactor/game-runtime-architecture.md`
- Authoritative expanded R7 plan: `docs:refactor/atria-game-first-shell-redesign.md`
- Current status: **R0-R6 are complete and frozen. R7 — Atria Game-first Shell Redesign is prepared on its own branch; functional implementation has not started in the planning/preparation conversation.**
- The old assumption that R7 would continue directly on `refactor/game-runtime-architecture` is superseded.
- Do not merge either long-running branch into `main` during R7 development.

## R3 checkpoint — Game Logic Runtime

R3 implementation is complete against the Master Plan exit contract.

Implemented under `public/scripts/extensions/game-runtime/logic/`:

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

- Run: `35548001015` (#88)
- HEAD: `9276e460c7534c6ad097771f462b3917f6c53080`
- Result: success

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

Game Package discovery:

- root entry is `game.json`, not `index.js`;
- missing `game.json` means “no Game Package”, not an error;
- malformed/incompatible packages do not activate;
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
  - bounded snapshots.

- `world/persistence.js`
  - current authoritative chat-state namespace: `atri_game_world`;
  - Chat State provides atomic storage;
  - Event Journal, not FloorState incremental patches, is the authoritative game history.

- `world/package.js`
  - loads declared World schema and initial state from the Game Package;
  - rejects invalid JSON roots and invalid initial states.

- `world/session.js`
  - loads the current swipe branch;
  - supports branch synchronization and reload from persisted Event Journal;
  - exposes an internal event commit primitive for the upcoming Command Bus.

Runtime integration:

- malformed World definitions downgrade package activation to invalid rather than taking over the host;
- structural chat events synchronize the active world branch;
- the extension API currently exposes World state/journal/branch as read-only views;
- no public generic world setter or LLM-facing `set_state` was introduced.

## R3 — Game Logic Runtime complete

R3 now provides one deterministic mutation contract shared by JavaScript-authored and declarative game logic.

Implemented runtime pieces:

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

Simulation follows the same pipeline through projection and Rule Trace but does not persist the Journal or projected World State.

Important boundaries preserved:

- no public generic `set_state(path, value)`;
- Game Logic does not receive broad SillyTavern/Atria context;
- reducers remain the only state-transition functions;
- Rules emit Events rather than mutating World State;
- committed RNG outcomes are recorded in Event provenance and replay never re-rolls them;
- declarative logic is not a second engine: it compiles into the same Command/Reducer/Rule contracts.

R3 exit matrix is explicitly tested:

- deterministic replay after a committed derived-event transaction;
- deterministic RNG/provenance;
- Rule Trace and rule ordering;
- failed command leaves World State, Journal and persistence unchanged;
- simulation and immediate commit produce equivalent events/state/RNG trace/Rule Trace;
- simulation produces no persisted mutation;
- malformed declarative logic and unsafe reducer assignment paths fail before runtime activation.

- Subsequent hardening runs through #88 also passed.

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
- provider-safe transport tool-name mapping;
- reserved `game_no_change` path;
- model-invented arithmetic/state fields cannot bypass the Command Bus.

### Intent Resolver

Implemented:

- receives user input + bounded authoritative Observation + branch anchor;
- can only choose currently visible typed Commands or `game_no_change`;
- cannot emit World patches, Event Journal writes, damage/HP/inventory deltas or final prose;
- no-change creates no Command/Event noise.

### Event Interpreter

Implemented:

- optional semantic-only LLM stage;
- closed JSON Schema with allowed event types/severities;
- confidence threshold and explicit no-change;
- low confidence defaults to no-change, with optional strict reject policy;
- no mutation tools are supplied;
- accepted semantic interpretations are recorded in Turn Context only.

Deterministic mapping:

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

## R6 — Game Studio complete

**R6 is complete against the Master Plan exit contract.**

`refactor/game-runtime-architecture@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`

### R6 authoring architecture

The existing CardApp Studio was evolved in place rather than replaced by a parallel product.

Implemented:

- runtime-aware Project Navigator with Game/Narrative project detection;
- grouped Game Project sources for package metadata, World Schema/Initial State, Game Logic, UI/Selectors/Immersive, Observations, knowledge/skills, assets and raw source;
- CodeMirror raw editing, Git history, rollback and diff approval preserved;
- structured editors write the same authoritative source documents used by Runtime; no duplicate Studio persistence format was introduced.

Structured authoring now includes:

- World Schema Editor;
- Initial State Editor;
- Command Editor;
- Formula Editor;
- Rules Editor;
- Reducer / Event Inspector;
- Interpretation Mapping Editor;
- Selector Editor;
- Observation Editor.

- R3 declarative compiler;
- Command Registry;
- Reducer Registry;
- Rules Engine;
- Interpretation Mapping Registry;
- safe Formula AST;
- R4 selector compiler/runtime;
- R5 Observation projector.

### Selector / Observation authoring

R4 selector files remain declarative `[{ id, formula }]` resources.

R6 additionally made package-authored Observation projectors first-class:

`game.json -> llm.observations`

The observation resource is declarative `[{ id, formula }]` and compiles into the existing R5 World Observation projector. It does not create an alternate LLM/world projection pipeline.

Selector/Observation previews use the Source Project Initial State and never mutate a player Save.

### Simulation / Diagnostics

Game Studio now exposes **Simulation / Diagnostics**.

The Studio simulation harness:

- constructs an isolated, memory-backed World Runtime from Source Project files;
- calls the real R3 `logic.simulate()` path;
- exposes Before / Projected World State;
- exposes Event Timeline;
- exposes deterministic RNG Trace;
- exposes Rule Trace;
- exposes the actual R5 Command Tool catalog for a selected Runtime Role;
- exposes Observation Preview;
- exposes Selector Preview;

- persistence writes = 0;
- authoritative in-memory World State unchanged;
- Journal unchanged;
- result `committed === false`.

A violation fails closed.

### Game-aware AI Builder

The existing Studio AI multi-file flow was retained:

`tool calls -> edits-lib batch -> conflict handling -> reviewable cross-file diff -> approval -> commit`

R6 added:

- automatic Game Project inspection;
- `game_project_inspect` tool;
- runtime-aware source map/system prompt appendix;
- explicit R2-R6 architectural guardrails;
- virtual post-edit project preflight before approval/commit.

- `game.json`;
- declared-file inventory;
- World Schema / Initial State compatibility;
- declarative Logic + runtime registries;
- Selectors;
- Observations.

The AI Builder is told and enforced not to invent an alternate authoritative state engine. Existing Game Projects cannot silently delete/rename the canonical `game.json` contract through the AI batch path.

### Native .atria distribution

R6 implements the native Atria package artifact as a **standard ZIP container**.

Current container layout:

```text
example.atria
├── manifest.json          # container-level manifest
└── game/
    ├── game.json          # Game Runtime manifest
    └── ...                # complete authored Source Project
```

The two manifests are intentionally distinct.

The root container manifest records:

- `format: atria-distribution`;
- container manifest version;
- package id/name/version/runtime metadata;
- optional source card id metadata;
- fixed Game Project root/entry;
- full file inventory;

Default build exclusion:

- `.git`;
- save/saves;
- progress;
- checkpoints;
- Atria save namespaces.

Player progression is therefore not silently distributed with the authored package.

### .atria safety and restore semantics

Import/inspection fails closed for:

- malformed ZIP/container manifest;
- unsupported container version;
- traversal / dot segments;
- absolute paths;
- backslash ambiguity;
- duplicate or case-conflicting paths;
- file-vs-child path conflicts;
- entries outside the declared `game/` root;
- undeclared/missing files;
- malformed inventory;
- container/game metadata mismatch;
- compressed archive limit;
- entry count limit;
- per-file size limit;
- total uncompressed-size limit;
- suspicious decompression ratio;
- corrupt or size-mismatched entry data.

Restore semantics:

4. move existing Source Project content, excluding `.git`, to rollback backup;
5. install staged project;
6. restore backup on failure;
7. preserve the existing project Git repository;
8. record one Studio restore commit on successful API import.

Invalid imports are rejected before Git/source mutation.

Studio now exposes:

- **Build .atria**
- **Import .atria**

### R6 boundaries preserved

- Narrative Cards without `game.json` remain first-class.
- PNG/JSON/CharX compatibility/interchange paths remain supported.
- no Studio shadow state engine;
- no LLM-owned World mutation;
- no UI-owned authoritative game rules;
- no speculative Entity Store;
- no R7 global host-shell redesign was pulled forward.

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
    - Game Package and live Save are separate contracts; a future portable save may use a separate *.atria-save style artifact;
    - R6 Game Studio owns the native package build/import/export pipeline. Do not expand the current R5 scope to implement it early.
## Current limitations / intentionally unfinished

**R0-R6 are complete. The Master Refactor is not complete.**

Remaining phase:

- **R7 — Atria Game-first Shell Redesign**.

Known deferred boundaries carried into R7/future work:

- large-world Entity Store/query/index evolution remains measurement/use-case gated;
- R5 Runtime Role configuration is functionally available, but final role-oriented **Model & Runtime UI/IA** belongs to R7;
- R6 Studio-specific UI changes are complete, but the product-wide host shell/design system/navigation are intentionally still old-era until R7.

## Next implementation step — R7 Atria Game-first Shell Redesign

R7 now uses the independent implementation branch:

`refactor/atria-game-first-shell-redesign@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`

The R0-R6 branch remains frozen at:

`refactor/game-runtime-architecture@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`

Do not continue R7 feature development on the frozen branch. Do not merge or delete either branch before R7 completion.

The authoritative R7 architecture/product plan is:

`docs:refactor/atria-game-first-shell-redesign.md`

R7 must preserve R0-R6 contracts unless a concrete shell-integration defect requires a targeted fix.

Approved R7 implementation phases:

1. **R7A — Design System & Shell Foundation**
2. **R7B — Play / Native Conversation Host**
3. **R7C — Game Surface Integration**
4. **R7D — Desktop / Mobile Navigation**
5. **R7E — First-class Workspaces**
6. **R7F — Library & Runtime**
7. **R7G — Plugins & Settings Reclassification**
8. **R7H — Legacy Shell Retirement & Final Hardening**

Key approved decisions:

- Atria 1.0 is an **Interactive Runtime Host**: Game-first, not Game-only.
- Primary domains: Play / Library / Studio / Agents / Runtime.
- Global utilities: Command/Search / Diagnostics / Plugins / Settings / Account.
- Conversation Timeline remains a first-class native/runtime component but no longer must permanently occupy the center of the application.
- Component / Hybrid / Full remain the only Game Runtime UI modes.
- Full Game UI owns **Stage**, never the Atria Host.
- Desktop uses Navigation Rail + Global Bar + Focus Area + Context Dock.
- Compact/mobile uses Bottom Navigation + Stage-first + Context Sheets + Command Sheet.
- Focus / Immersive / Full are separate contracts.
- Agent Orchestration and Memory become first-class Agents product capabilities and leave the Extensions product hierarchy.
- Skills become Library assets with contextual Agent links.
- Runtime Roles/Connections gain a first-class Runtime Workspace.
- user-facing Extensions becomes Plugins and returns to third-party plugin management.
- Design System = tokens + primitives + patterns + AI development rules.
- SmartTheme remains a compatibility/theme input; new Atria components consume `--atri-*` semantic tokens.
- Preserve stateful native DOM anchors and **reparent, don't duplicate**.
- R4 Surface/Native Component contracts remain stable while the Host adapter becomes semantic.
- legacy CardApp becomes a recoverable Legacy Full Stage Surface.
- the new Atria Shell does not participate in legacy MovingUI geometry.
- R7 is a staged migration, not a big-bang rewrite.

Final integration policy:

Do **not** separately merge `refactor/game-runtime-architecture` into `main`, because the R7 branch already contains the complete R0-R6 history.
