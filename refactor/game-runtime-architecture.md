# Atria Game Runtime Architecture Refactor

## 0. Task identity

- Task: **Atria Game Runtime Architecture Refactor**
- Development branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Document branch: `docs`
- Document path: `refactor/game-runtime-architecture.md`
- Status: architecture approved; implementation has not started.

This is a product-architecture refactor, not a narrow Regex optimization task.

The goal is to move Atria from a SillyTavern-derived chat application with increasingly overloaded Regex/CardApp state conventions into a first-class **LLM-driven character-card game runtime**.

The target mental model is:

> A character card may be a complete executable game package.  
> LLM decides intent and narration; deterministic code owns rules and calculation; Atria owns authoritative world state and event history; HTML/CSS/JS owns presentation.

---

## 1. Non-negotiable architecture decisions

### 1.1 Regex returns to text processing

Regex Core owns string transformation only:

- match;
- replace;
- strip;
- capture;
- trim;
- macro substitution;
- placement;
- depth gating;
- prompt / display / plugin lanes when the operation remains a string transformation.

Regex Core does **not** own:

- HUD/status-bar lifecycle;
- arbitrary HTML app lifecycle;
- game state;
- state persistence;
- game actions;
- MVU-style state calculation;
- DOM orchestration;
- iframe/app refresh;
- game logic;
- game UI reload semantics.

Atria must stop evolving Regex into a general-purpose UI/game framework.

### 1.2 MVU / LoreState are not target architecture constraints

The new architecture is not designed around compatibility with MVU, LoreState, or historical “double Regex + HTML status bar” conventions.

They are treated as products of the text-chat era, not foundations of the new runtime.

Do not:

- add MVU/LoreState adapters as core dependencies;
- copy their state ownership model;
- constrain the new world model to their data formats;
- add compatibility shims to the new Game Runtime merely to preserve their authoring style;
- design new APIs around legacy status-bar Regex.

Existing legacy chat behavior may continue outside the new Game Runtime, but it is not an architectural requirement for the new system.

### 1.3 Atria is the authoritative game runtime

For Game Packages, Atria owns the authoritative world model.

The normal write path is:

```text
Command
  -> Validate
  -> Calculate
  -> Deterministic RNG
  -> Emit Events
  -> Reducers
  -> Rules / derived events
  -> Commit
```

Direct arbitrary world-state mutation is not the normal runtime contract.

### 1.4 LLM never owns arithmetic or authoritative state mutation

LLM has two principal runtime roles:

1. **Intent Resolver**
   - convert user free text into one or more typed Commands;
   - choose arguments from the command schema;
   - never calculate final game-state consequences.

2. **Narrator**
   - receive committed facts / observations / event results;
   - turn them into prose;
   - never redefine committed world facts.

Core principle:

> LLM decides “what is attempted”; code decides “what actually happens”; the Event Journal decides “what happened historically”; LLM decides “how to describe it”.

### 1.5 UI never owns game rules

Card UI can:

- render Selectors;
- dispatch Commands;
- invoke UI-only actions;
- open/close surfaces;
- request simulations.

Card UI cannot directly mutate authoritative World State.

UI JavaScript and Game Logic JavaScript must be separate runtimes/contracts.

---

## 2. Existing Atria foundations to reuse

Do not discard infrastructure that already solves lower-level problems.

Reuse or evolve:

- CardApp per-character file storage;
- CardApp import/export packing of nested text and binary files;
- CardApp server endpoint/path safety;
- CardApp Studio multi-file editor;
- CardApp Studio live preview;
- AI-assisted file editing;
- diff approval;
- per-CardApp Git history;
- Atria state sidecar infrastructure;
- FloorState concepts where useful as an implementation substrate;
- current tool-calling / Function Call Runtime;
- current Orchestrator extension-tool registry concepts;
- current Immersive presentation layer;
- current diagnostics/logging infrastructure;
- existing MessageFormatter stages where appropriate.

Important distinction:

> Reuse infrastructure, not old product boundaries.

The current CardApp runtime model (“one entry JS module, hide all native chat UI, give code a broad context”) is not the target architecture.

---

## 3. Target top-level architecture

```text
                         User
                          |
               +----------+----------+
               |                     |
             Card UI              Free Text
               |                     |
               |               Intent Resolver
               |                     |
               +----------+----------+
                          |
                          v
                     Command Bus
                          |
                          v
                +------------------+
                | Game Logic       |
                | Runtime          |
                |                  |
                | Validators       |
                | Formula Engine   |
                | Reducers         |
                | Rules            |
                | RNG              |
                | Simulation       |
                +---------+--------+
                          |
                          v
                        Events
                          |
                          v
                +------------------+
                | World Runtime    |
                |                  |
                | Schema           |
                | State            |
                | Event Journal    |
                | Snapshots        |
                | Branches         |
                | Replay           |
                +--------+---------+
                         |
                +--------+--------+
                |                 |
                v                 v
             Selectors        Observations
                |                 |
                v                 v
             Card UI         Narrative LLM
                                  |
                                  v
                                Prose
```

Regex Core exists beside this architecture and is not a Game Runtime dependency.

---

## 4. Game Package

### 4.1 Entry contract

A Game Package uses `game.json` as the canonical entry descriptor.

Do not treat `index.js` as the architectural entry point.

Recommended project shape:

```text
game/
├── game.json
├── world/
│   ├── schema.json
│   ├── initial.json
│   └── selectors.js
├── logic/
│   ├── commands/
│   ├── reducers/
│   ├── rules/
│   └── formulas/
├── llm/
│   ├── observations.js
│   ├── resolver.js
│   └── narrator.js
├── ui/
│   ├── game.html
│   ├── hud.html
│   ├── inventory.html
│   ├── map.html
│   └── style.css
├── scripts/
│   └── main.js
└── assets/
    ├── images/
    ├── audio/
    └── icons/
```

The exact directory names may evolve during implementation, but the separation of responsibilities must remain.

### 4.2 Manifest responsibilities

`game.json` should eventually describe:

- format/version;
- UI mode;
- world schema;
- initial state;
- command modules / declarative command sets;
- reducers;
- rules;
- selectors;
- observations;
- LLM exposure policy;
- surfaces;
- assets;
- permissions;
- minimum Atria runtime version;
- optional advanced UI module entrypoints.

The manifest must be schema validated before runtime activation.

### 4.3 Distribution

A Game Package travels with the character card.

Atria should evolve existing CardApp packing rather than invent an unrelated distribution system.

Requirements:

- nested files round-trip;
- binary assets round-trip;
- path traversal remains rejected;
- package metadata is validated;
- import extracts into per-character package storage;
- export re-embeds package content;
- ordinary character-card semantics remain usable when Game Runtime is unavailable.

Do not design the new runtime around separate user-installed “HTML zip + Regex + state plugin + worldbook” bundles.

---

## 5. World Runtime

### 5.1 World Schema

Each game defines a formal schema for authoritative state.

Schema should support enough metadata to power:

- validation;
- defaults;
- Studio form generation;
- formula autocomplete;
- selector autocomplete;
- event diff display;
- World Inspector;
- LLM observation tooling;
- migration/version diagnostics when introduced later.

State constraints should include, where applicable:

- primitive type;
- object/array shape;
- enum;
- min/max;
- defaults;
- references;
- entity identifiers;
- optional derived/readonly annotations.

Schema validation occurs before commits.

### 5.2 Event Journal is historical authority

Do not treat one mutable state JSON blob as the only truth.

Preferred model:

```text
Initial State + Event Journal + Snapshot acceleration = Current World State
```

Events are immutable historical facts once committed to a branch.

Examples:

- `GameStarted`
- `ItemGranted`
- `Travelled`
- `CombatStarted`
- `AttackResolved`
- `DamageDealt`
- `StatusApplied`
- `QuestAdvanced`
- `RelationshipChanged`

Current state is a projection of committed events.

### 5.3 Snapshots

Use snapshots for replay performance.

A snapshot is an acceleration artifact, not a replacement for causal history.

A valid architecture should allow:

```text
Snapshot N + events N+1..M -> current state
```

### 5.4 Branch / swipe model

Conversation branching and game-world branching must align.

Conceptually:

```text
floor 20
  ├── swipe A -> event branch A
  └── swipe B -> event branch B
```

Switching active swipe/branch should restore the corresponding world state by branch selection/replay, not by ad-hoc variable repair.

The exact mapping to existing FloorState / message swipe identifiers is an implementation decision, but the observable semantics must be deterministic.

---

## 6. Command model

### 6.1 Commands are the normal mutation API

UI, LLM, quick actions, automation and future integrations should converge on one Command Bus.

Examples:

- `attack`
- `use_item`
- `travel`
- `rest`
- `buy`
- `sell`
- `equip`
- `accept_quest`
- `investigate`
- `talk`

Do not make generic LLM-facing `set_state(path,value)` the normal model.

### 6.2 Command pipeline

A command should conceptually support:

1. argument schema validation;
2. world precondition validation;
3. deterministic calculation;
4. RNG consumption;
5. event production;
6. reducer application;
7. rule evaluation;
8. derived event generation;
9. invariant/schema validation;
10. atomic commit;
11. result envelope generation.

### 6.3 Transaction semantics

A command either commits coherently or does not commit.

Partial mutation such as “item consumed but healing failed” must not occur unless the game rule explicitly models that partial outcome as events.

Cross-module failures must surface as structured errors.

---

## 7. Game Logic Runtime

### 7.1 Dual authoring model

Support both:

- declarative DSL / forms for common logic;
- advanced JavaScript for complex logic.

Both paths compile/execute through the same runtime contracts.

There must not be a “simple mode engine” and a separate “JS engine” with different semantics.

### 7.2 Formula Engine

Provide a safe parsed expression engine rather than JavaScript `eval`.

Baseline operations may include:

- arithmetic;
- comparison;
- boolean logic;
- `min`, `max`, `clamp`;
- `round`, `floor`, `ceil`, `abs`;
- safe world references;
- selector references where appropriate;
- RNG primitives when the command context permits them.

Expressions must compile to an AST and be inspectable/testable in Studio.

### 7.3 Deterministic RNG

Randomness belongs to Game Logic Runtime.

Provide APIs such as:

- random float;
- integer range;
- dice roll;
- weighted choice;
- deterministic stream namespaces.

Committed random outcomes become part of the event history.

Replay must not silently re-roll committed outcomes.

An explicit new command/event is required to reroll.

### 7.4 Rules Engine

Rules react to committed/provisional event/state transitions and may emit additional events.

Example causal chain:

```text
DamageDealt
 -> hp <= 0
 -> EntityDied
 -> quest kill count increments
 -> threshold reached
 -> QuestCompleted
```

Rules need:

- traceability;
- cycle/loop protection;
- deterministic ordering;
- bounded evaluation;
- Studio trace output.

### 7.5 Simulation

Every safe game command should be simulatable without persistence.

Simulation must produce:

- before state summary;
- command;
- consumed RNG trace or simulated RNG trace;
- emitted events;
- rule trace;
- after state projection;
- no committed mutation.

Simulation is for:

- Studio;
- automated tests;
- AI planning when explicitly allowed;
- debugging.

---

## 8. UI Runtime

### 8.1 Three takeover levels

#### Component

Native Atria remains primary; card UI mounts components into standard surfaces.

Typical uses:

- HUD;
- status panel;
- minimap;
- relationship meter;
- inventory shortcut;
- quest tracker.

#### Hybrid

Game package may rearrange/recompose native Atria components while retaining native chat/generation functionality.

Typical uses:

- RPG shell;
- dating-sim shell;
- detective board around native conversation;
- custom sidebars + native composer.

#### Full

Game package owns the main experience surface.

Typical uses:

- visual novel;
- CRPG;
- simulation game;
- detective game;
- card game;
- phone/social UI simulation.

Full does not mean “must reimplement all native features”; native components may still be mounted through supported host APIs.

### 8.2 Surface API

Game packages must target stable host surfaces rather than SillyTavern internal DOM selectors.

Candidate surface vocabulary:

- `app.root`
- `chat.header`
- `chat.footer`
- `composer.before`
- `composer.after`
- `sidebar.left`
- `sidebar.right`
- `drawer`
- `modal`
- `overlay`
- `immersive.hud`
- `immersive.overlay`
- `message.before`
- `message.after`

Exact first-release surface set should be kept minimal and versioned.

### 8.3 Native component composition

Atria should expose reusable native components to Hybrid/Full packages rather than force authors to duplicate chat machinery.

Examples:

- conversation view;
- composer;
- quick actions;
- swipe controls;
- generation controls;
- message actions.

Native component composition must preserve one source of truth for generation/swipe/edit/regenerate behavior.

### 8.4 Responsive contract

Runtime provides environment contracts:

- desktop;
- tablet;
- mobile;
- landscape;
- portrait;
- touch;
- keyboard;
- safe-area variables.

Standard surfaces should adapt automatically.

Cards may provide explicit alternate layouts, but simple packages should be responsive without duplicated mobile HTML.

### 8.5 Immersive integration

Immersive remains an Atria presentation layer, not a state owner.

Relationship:

- Component: fully compatible;
- Hybrid: Runtime supplies an immersive layout/adaptation path;
- Full: Card UI remains primary; Immersive becomes host-level chrome/fullscreen/safe-area/power-presentation enhancement.

Do not let Game Runtime and Immersive compete for world/state ownership.

---

## 9. Selectors

UI does not consume raw World State as its primary contract.

Selectors expose stable derived view models.

Example:

```js
playerHud(state) => ({
  hp,
  maxHp,
  ratio,
  danger,
})
```

Selectors:

- may derive values;
- must be deterministic;
- do not mutate state;
- can be cached/incrementally invalidated;
- provide a stable boundary between internal schema and UI.

Declarative HTML binding should bind to selectors or approved read paths, not raw mutable state references.

---

## 10. LLM Bridge

### 10.1 Two-phase generation

For game-aware turns, preferred flow:

```text
User intent
 -> Resolve phase
 -> typed Command/tool call
 -> deterministic code execution
 -> world commit
 -> Narrative phase
 -> prose constrained by committed results
```

The Resolve phase must not write final story prose as its primary output.

The Narrative phase must not mutate world state.

### 10.2 UI action shortcut

When a UI action already resolves to a typed Command, skip Intent Resolver.

```text
button -> Command -> Game Logic -> Commit -> Narrator
```

This reduces latency/token use and eliminates needless LLM uncertainty.

### 10.3 Automatic command tool generation

Commands may opt into LLM exposure.

Tool schemas should be derived from command parameter schemas.

Support dynamic visibility conditions so irrelevant commands are omitted from the current tool set.

Examples:

- `attack` visible only in combat;
- `buy` visible only when a merchant is available;
- `unlock` visible only near a locked object.

### 10.4 Observations

LLM must not receive raw full World State by default.

Observation builders expose task-relevant projections.

Examples:

- scene;
- player condition;
- visible entities;
- current combat facts;
- relevant quest state;
- recent authoritative events.

Internal implementation fields such as seeds, event sequence numbers, caches, hidden flags or huge inventories should not enter prompts unless explicitly required.

### 10.5 Narrator constraints

Narrator input should include committed event/result facts and observation context.

Narrator may elaborate prose but cannot contradict authoritative facts.

Runtime should make fact provenance/debugging visible.

---

## 11. HTML authoring

### 11.1 HTML is first-class

Do not require authors to create all markup from JS strings.

Support real HTML files.

### 11.2 Declarative binding

Provide a safe binding/action layer for common UI.

Concepts may include:

- text binding;
- conditional visibility;
- lists;
- classes/styles derived from selectors;
- surface actions;
- command dispatch;
- modal/drawer toggles.

The exact syntax must be designed and tested; avoid an uncontrolled expression language in HTML.

### 11.3 UI JavaScript

Advanced UI scripts can manage interaction/presentation but cannot directly mutate World State.

UI mutation goes through:

- UI-only action API; or
- Command Bus.

---

## 12. Runtime security and capability model

Game Logic and UI Runtime require different capabilities.

### 12.1 Game Logic

Prefer a deterministic restricted context:

- world queries;
- events;
- commands;
- formula engine;
- deterministic RNG;
- clock abstraction;
- logging.

Game Logic should not normally receive:

- arbitrary DOM;
- unrestricted `window`;
- unrestricted network;
- filesystem;
- direct SillyTavern internals;
- arbitrary extension mutation.

### 12.2 UI/App capabilities

Sensitive host capabilities are manifest-declared and mediated.

Candidate permissions:

- chat read;
- chat send;
- regenerate;
- host fullscreen;
- audio;
- clipboard;
- network by explicit origin/policy if ever supported;
- advanced native component ownership.

A broken or malicious package must not be able to permanently trap the user.

Host-level escape/recovery remains available:

- exit game UI;
- emergency stop generation;
- disable package;
- diagnostics;
- permission review.

---

## 13. Game Studio

Evolve CardApp Studio into **Atria Game Studio**.

Reuse:

- fullscreen authoring workspace;
- CodeMirror;
- file tree;
- live preview;
- AI builder;
- diff approval;
- Git history.

Add first-class structured tools over time:

- World Schema Editor;
- Initial State Editor;
- Command Editor;
- Formula Editor;
- Rules Editor;
- Reducer/Event Inspector;
- Selector Editor;
- Observation Editor;
- UI/Surface Editor;
- Asset Manager;
- Simulation Console;
- Rule Trace;
- Event Timeline;
- World State Inspector;
- LLM Tool Preview;
- Observation Preview;
- raw Code Editor.

### 13.1 AI Builder

AI Builder edits the game project as an engineering artifact, not as one monolithic JS file.

A request such as:

> add poison: lasts 5 turns, deals 3% max HP each turn, antidote removes it

should result in a cross-file proposal such as:

- schema addition;
- poison tick rule;
- expiry rule;
- antidote command;
- HUD badge;
- observation update;
- narrator/event semantics.

All changes remain diff-reviewable.

### 13.2 Simulation/Trace

Studio must support deterministic command simulation and explain why rules fired/did not fire.

This is critical for both creators and support diagnostics.

---

## 14. Diagnostics

Game Runtime must integrate with Atria observability from the beginning.

Correlatable chain:

```text
UI action / LLM command
 -> command validation
 -> calculation
 -> RNG
 -> event emission
 -> reducer
 -> rule trace
 -> commit
 -> narrator generation
 -> UI selector refresh
```

Diagnostic evidence should include stable identifiers:

- package id/version;
- command id;
- transaction id;
- event ids;
- branch/floor/swipe anchor;
- rule ids;
- selector id;
- LLM phase;
- failure owner/source.

Do not log secrets or entire sensitive user payloads by default.

---

## 15. Implementation phases

This is one Master Refactor but must land in independently verifiable stages.

### R0 — Regex Separation

Goal: restore Regex to a text-transformation subsystem.

Work:

- map every Atria-added Regex/UI coupling;
- remove Game/UI responsibilities from new architecture paths;
- preserve necessary text-lane semantics;
- ensure Regex engine no longer becomes the place new UI/game behavior is added;
- document the boundary.

Exit:

- Regex focused tests green;
- no Game Runtime dependency on Regex.

### R1 — Game Package Foundation

Goal: load/validate/distribute `game.json` packages.

Work:

- manifest schema;
- package discovery;
- per-character package storage;
- asset resolver;
- import/export packing;
- capability metadata;
- runtime version gate;
- safe failure/fallback UI.

Exit:

- nested text/binary round-trip tests;
- malformed/hostile package rejection;
- package activates without World/Logic yet.

### R2 — World / Event Runtime

Goal: authoritative state, event journal, replay, branch model.

Work:

- World Schema;
- initial state;
- event envelope;
- reducer foundation;
- snapshots;
- replay;
- branch/floor/swipe association;
- deterministic persistence;
- World Inspector read API.

Exit:

- replay produces identical state;
- branch switching yields correct state;
- restart persistence test;
- corruption/failure diagnostics.

### R3 — Game Logic Runtime

Goal: commands and deterministic calculation.

Work:

- Command Bus;
- parameter validation;
- Formula AST;
- validators;
- reducers;
- rules engine;
- deterministic RNG;
- simulation;
- transaction semantics.

Exit:

- command test matrix;
- deterministic replay;
- rule trace;
- failed command leaves no partial mutation;
- simulation produces no persisted mutation.

### R4 — Card UI Runtime

Goal: reusable HTML/CSS/JS game presentation.

Work:

- Component/Hybrid/Full modes;
- Surface API;
- native component composition;
- selectors;
- safe declarative binding/actions;
- responsive contract;
- mobile behavior;
- Immersive integration;
- host escape/recovery.

Exit:

- at least one Component fixture;
- at least one Hybrid fixture;
- at least one Full fixture;
- desktop/mobile smoke;
- broken package recovery.

### R5 — LLM Bridge

Goal: code/LLM collaboration with no LLM-owned authoritative arithmetic.

Work:

- command tool generation;
- command visibility;
- intent resolve phase;
- observation projection;
- narrator phase;
- committed-fact enforcement/debug evidence;
- UI-action shortcut;
- native and prompt-tool fallback paths.

Exit:

- free text -> command -> commit -> narration e2e;
- UI button -> command -> commit -> narration e2e;
- intentionally wrong LLM arithmetic cannot alter world state;
- irrelevant commands omitted from tool set.

### R6 — Game Studio

Goal: evolve CardApp Studio into a first-class game-authoring environment.

Work:

- project navigator;
- structured schema/command/rule editors;
- simulation console;
- trace inspectors;
- world timeline;
- LLM tool/observation preview;
- AI Builder project-aware editing;
- preserve code editor/Git/diff flows.

Exit:

- create a small playable game through Studio;
- simulate/debug it;
- export/reimport it;
- retain project files and runtime behavior.

---

## 16. Testing strategy

Do not wait until R6 for integration testing.

Each phase needs focused tests plus appropriate broader checks.

Expected areas:

- manifest/schema validation unit tests;
- package packing/extraction round-trip;
- path traversal / malformed package tests;
- event replay tests;
- snapshot equivalence;
- branch/swipe state tests;
- command transaction tests;
- Formula AST tests;
- RNG deterministic replay tests;
- rule ordering/cycle guard tests;
- simulation no-commit tests;
- selectors;
- UI binding;
- Surface host tests;
- mobile/desktop frontend smoke;
- Game Runtime error recovery;
- LLM resolve/narrate tool-loop tests;
- export/import e2e;
- ESLint;
- complete Node unit suite;
- frontend build.

Per repository policy, Android/Docker builds are not default requirements unless the task later explicitly touches those surfaces or the user requests them.

---

## 17. Performance constraints

The new architecture must avoid recreating the current “re-render/re-run everything” Regex problem.

Design expectations:

- selector-level dependency/invalidation where practical;
- no full chat reload for normal state changes;
- no full World replay on every UI render;
- bounded snapshot/replay strategy;
- command/rule compilation cached;
- formula AST cached;
- LLM tool list generated from active command visibility;
- observations narrow by design;
- assets lazy-loadable;
- surfaces mount/unmount with explicit lifecycle;
- runtime diagnostics expose hot paths.

---

## 18. Explicit non-goals

This refactor does not aim to:

- make MVU the new state backend;
- make LoreState the new state backend;
- auto-convert every historical status-bar Regex into a Game Package;
- preserve historical CardApp “broad ctx can do anything” as the preferred programming model;
- keep Regex as the UI renderer for new games;
- expose arbitrary `set_state` to LLM as the primary state API;
- dump full World State into every LLM request;
- force every game to use the Orchestrator;
- require JavaScript for simple game logic;
- require separate package installation beside the character card.

---

## 19. First implementation rule

Do not start by building the most visible UI.

The first implementation conversation should:

1. re-read current `main:AGENTS.md`;
2. re-read current `main:FORK_MAINTENANCE.md`;
3. re-read `docs:handoff/latest-handoff.md`;
4. read this document from `docs:refactor/game-runtime-architecture.md`;
5. verify live branch HEAD and main HEAD;
6. inspect current Regex/CardApp/State/Function Call code;
7. begin with R0/R1 foundation in the smallest coherent vertical slice.

Avoid speculative massive rewrites before contracts/tests exist.

---

## 20. Success definition

The refactor is successful when Atria can support a character card that:

- carries a complete Game Package;
- declares a formal world schema;
- initializes authoritative state;
- exposes typed commands;
- computes combat/items/resources in code;
- uses deterministic RNG;
- records immutable causal events;
- replays and branches correctly with conversation history;
- presents itself through Component/Hybrid/Full HTML UI;
- uses selectors rather than raw mutable state for UI;
- converts free-text intent into commands;
- narrates committed results without LLM-owned state arithmetic;
- can be simulated and debugged in Game Studio;
- exports and reimports as one character-card artifact;
- does not rely on Regex, MVU, or LoreState to function as a game.

At that point Atria is no longer merely “SillyTavern plus richer status bars”.

It is a character-card game runtime whose default host happens to descend from SillyTavern.
