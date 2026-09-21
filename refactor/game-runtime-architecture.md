# Atria Game Runtime Architecture Refactor

## 0. Task identity

- Task: **Atria Game Runtime Architecture Refactor**
- Development branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Document branch: `docs`
- Document path: `refactor/game-runtime-architecture.md`
- Status: architecture approved and in implementation; R0-R4 are complete, and R5 has begun on the working branch.

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

LLM has three bounded runtime roles:

1. **Intent Resolver**
   - convert user free text into one or more typed Commands;
   - choose arguments from the command schema;
   - never calculate final game-state consequences.

2. **Event Interpreter**
   - run only when deterministic code cannot safely infer the semantic meaning of an action/event;
   - classify ambiguous meaning into typed semantic output such as intent/category/severity/participants/evidence/confidence;
   - may explicitly return `no_change` when no durable game event should be produced;
   - never calculate authoritative numeric deltas;
   - never write World State or Event Journal directly.

3. **Narrator**
   - receive committed facts / observations / event results;
   - turn them into prose;
   - never redefine committed world facts.

Core principle:

> LLM resolves intent, interprets genuinely ambiguous semantics when needed, and narrates committed facts. Deterministic code owns calculation and state transitions; the Event Journal owns history.

The Event Interpreter is **not** a per-turn “state update AI”. It is an optional semantic helper invoked by Game Logic only when a rule requires language/world interpretation that deterministic code cannot provide reliably.

### 1.5 UI never owns game rules

Card UI can:

- render Selectors;
- dispatch Commands;
- invoke UI-only actions;
- open/close surfaces;
- request simulations.

Card UI cannot directly mutate authoritative World State.

UI JavaScript and Game Logic JavaScript must be separate runtimes/contracts.

### 1.6 Game Runtime is domain-agnostic

Atria Game Runtime must not define a built-in RPG world model.

Names such as:

- `hp`;
- `mp`;
- `level`;
- `affection`;
- `inventory`;
- `quest`;
- `combat`;

are examples only. They are package-authored schema conventions, not canonical engine fields.

The Runtime operates on:

- author-defined World Schema;
- typed Commands;
- typed Events;
- Reducers;
- Rules;
- Selectors;
- Observations;

without assuming what those structures mean.

A valid Game Package may model, for example:

- character RPG state;
- visual-novel routes, flags, CG unlocks and relationship dimensions;
- detective evidence and case graphs;
- management/economic simulation;
- countries, provinces, armies, markets and diplomacy;
- dynasties, laws, political factions and succession;
- social simulation;
- card/board-game state;
- arbitrary author-defined domains that do not resemble RPG statistics.

The architecture must support “the author defines what the world is” rather than “the engine supplies RPG variables and the author fills them”.

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
                +----+--------+----+
                     |        |
             deterministic    | semantic ambiguity only
                     |        v
                     |  +-------------------+
                     |  | Event Interpreter |
                     |  | typed meaning only|
                     |  +---------+---------+
                     |            |
                     +------------+
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
│   ├── interpreter.js
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


### 4.4 Narrative Card remains a first-class mode

Game Runtime is an opt-in enhancement, not a tax imposed on every character card.

A character without `game.json` remains a complete, supported **Narrative Card**.

For Narrative Cards:

- character fields / first message / prompt fields / World Info remain the normal authoring model;
- Regex remains an optional text-processing tool;
- Game Package loading, World Runtime, Game Logic Runtime and Game UI do not need to initialize;
- authors are not required to learn Schema, Commands, Rules, Selectors or Surfaces;
- the host UI should present a clean narrative/chat experience rather than exposing irrelevant game-runtime controls.

Game Studio / authoring UI must use progressive disclosure:

```text
Narrative Card
 -> optional interactive enhancement
 -> explicit Game Package upgrade
```

Creating a Game Package must be an explicit author action. Atria must not silently “upgrade” ordinary cards into game projects.


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

World Schema is intentionally author-defined. Runtime code must not special-case canonical RPG paths such as `player.hp`, `player.mp`, `inventory` or `quests`.

Examples in tests/docs may use compact RPG-like fields for readability, but those examples must never become required public contracts.

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

### 5.5 Large-world scalability and future storage evolution

The v1 Runtime may use structured JSON World State as its first authoring/storage model, but public contracts must not require the entire world to remain one monolithic in-memory JSON object forever.

Atria must leave room for future large-simulation backends such as:

- entity collections;
- stable entity ids / references;
- indexed lookup;
- query layers;
- partial/lazy loading;
- partitioned state;
- incremental materialized projections;
- high-volume simulation/tick processing.

Possible future examples include grand-strategy or society simulations with large collections of:

- characters;
- countries;
- provinces;
- armies;
- markets;
- factions;
- treaties;
- populations.

Such evolution should preserve the semantic contracts already established:

```text
Command
 -> deterministic calculation
 -> Events
 -> Reducers / projections
 -> authoritative World
```

Do **not** add an Entity Store to the current R5 merely because future games may need one. The current requirement is architectural neutrality: today's APIs must avoid assumptions that would make such a backend impossible without replacing the whole Game Runtime.

---

## 6. Command model

### 6.1 Commands are the normal mutation API

UI, LLM, quick actions, automation and future integrations should converge on one Command Bus.

Illustrative examples:

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

These command names are not built-ins. A package may instead define domains such as `enact_law`, `move_army`, `schedule_date`, `unlock_route`, `merge_company` or anything else allowed by its own schema.

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

### 8.4 Persistent Game Surface and Conversation Timeline

Game UI is not a chat-floor payload and must not be modeled as “HTML stored in floor 0”.

The architectural split is:

```text
Conversation Timeline
= history / user messages / assistant messages / swipe / branch / context

Persistent Game Surface
= HUD / scene / map / inventory / dialogue shell / controls / game presentation
```

A Game Surface is session-persistent and branch-aware, but it does not belong to any individual conversation floor.

Conversation floors remain useful as timeline/history records and may continue to back context, swipe and branch behavior. They are not the public UI container contract.

Mode semantics:

- **Component** — persistent Game Surface components coexist around the native Conversation Timeline.
- **Hybrid** — a persistent Game Shell may embed/recompose the native Conversation Timeline and Composer as reusable host components.
- **Full** — the persistent Game Surface may hide the traditional floor presentation entirely; the Conversation Timeline still exists as history/context/branch data unless the game explicitly uses another supported projection.

This rule allows Full-mode visual novels/RPGs/phone UIs to present a game rather than a stack of chat bubbles while retaining reliable conversation history underneath.

Button/structured actions may be recorded as structured user-action timeline records with an optional textual projection. The presentation layer decides whether the player sees them as chat messages, action cards, dialogue choices or no explicit floor at all.

### 8.5 Responsive contract

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

### 8.6 Immersive integration

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

### 10.1 Runtime pipeline

For game-aware turns, the preferred flow is:

```text
User free text
 -> Intent Resolver
 -> typed Command
 -> deterministic Game Logic
 -> optional Event Interpreter only when semantic ambiguity requires it
 -> deterministic Game Logic converts interpretation into rules/events
 -> World commit
 -> Narrator
 -> prose constrained by committed facts
```

The Intent Resolver must not write final story prose as its primary output.

The Event Interpreter must not directly update World State, invent numeric deltas, or bypass Game Logic.

The Narrator must not mutate world state.

### 10.2 UI action shortcut

When a UI action already resolves to a typed Command, skip Intent Resolver.

```text
button -> Command -> Game Logic -> optional Event Interpreter -> Commit -> Narrator
```

If the command is completely deterministic, the Event Interpreter is also skipped.

This reduces latency/token use and eliminates needless LLM uncertainty.

### 10.3 Event Interpreter

The Event Interpreter exists for **semantic classification**, not state bookkeeping.

Good uses:

- whether a free-form statement counts as a threat, apology, betrayal, flirtation, deception, surrender, etc.;
- which typed narrative/game event best matches an ambiguous action;
- severity/category/participants/evidence extraction from prose;
- resolving a semantic branch explicitly requested by a game rule.

Bad uses:

- `hp = 73`;
- `favorability += 5`;
- inventory arithmetic;
- damage formulas;
- probability rolls;
- cooldowns;
- direct World State patches.

Example output:

```json
{
  "decision": "event",
  "eventType": "implicit_threat",
  "severity": "medium",
  "participants": ["guard_02"],
  "confidence": 0.88,
  "evidence": ["..."]
}
```

A normal no-op is also valid:

```json
{
  "decision": "no_change",
  "confidence": 0.93
}
```

Game Logic validates the typed interpretation and decides what deterministic rules/events follow. Low-confidence or invalid interpretation may fail closed, request retry/fallback, or produce no durable state change according to game policy.

### 10.4 Automatic command tool generation

Commands may opt into LLM exposure.

Tool schemas should be derived from command parameter schemas.

Support dynamic visibility conditions so irrelevant commands are omitted from the current tool set.

Examples:

- `attack` visible only in combat;
- `buy` visible only when a merchant is available;
- `unlock` visible only near a locked object.

### 10.5 Observations

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

### 10.6 Narrator constraints

Narrator input should include committed event/result facts and observation context.

Narrator may elaborate prose but cannot contradict authoritative facts.

Runtime should make fact provenance/debugging visible.

### 10.7 Turn Coordination Contract

Game Runtime, Orchestrator, Memory and final prose must cooperate through one turn-scoped contract rather than independently assembling competing prompt/state views.

Each game-aware turn owns a stable `turnId` and a **Turn Context** that conceptually contains:

- branch/floor/swipe identity;
- user input;
- resolved Command(s);
- command result(s);
- committed World Events;
- authoritative current World Observation;
- recent chat required for narration;
- recalled long-term memories;
- active hard constraints / lore required by the package;
- orchestration guidance when enabled.

The exact serialized shape may evolve, but the ownership/precedence rules below are architectural requirements.

#### 10.7.1 Fact precedence

When sources disagree, consumers must use this authority order:

1. **Current World Runtime observation / schema-valid state**
2. **Committed Event Journal facts for the active branch**
3. **Current turn Command results**
4. **Explicit surviving chat facts on the active branch**
5. **Memory recall / compressed historical summaries**
6. **Orchestrator guidance / planning hypotheses**

Orchestrator output and Memory summaries are never allowed to override authoritative current World facts.

#### 10.7.2 One final prose producer

Exactly one component owns the final message body for a turn.

- Normal Game Runtime path: **Narrator** writes the final body.
- Orchestrator `spec / agenda / loop`: Orchestrator produces guidance/capsule only; Narrator remains the body owner.
- Orchestrator `director`: Director becomes the turn's Narrative Producer and **replaces Narrator** for that turn.

Never run Director and Narrator as independent body writers and then attempt to merge their prose.

A takeover mode changes the prose producer, not World/Event authority.

#### 10.7.3 Orchestrator integration

Orchestration runs against the same Turn Context used by narration.

For game-aware turns, orchestration must be able to consume:

- authoritative World Observation;
- committed current-turn Event/Command results;
- recent chat;
- relevant Memory recall;
- package/lore constraints.

`spec / agenda / loop` output is advisory narrative guidance. It may propose pacing, emphasis, voice, continuity handling and next-beat presentation, but it cannot invent an authoritative state transition that bypasses Game Logic.

Director mode must receive the same authoritative Turn Context. Its `finalize` commits prose only; it must not implicitly commit World State.

Game Runtime should expose narrow read-only orchestration tools/adapters for current World observation, recent committed game events and command results instead of making agents scrape UI/HTML or duplicate state.

#### 10.7.4 Memory recall timing

Memory recall happens **before narrative planning/writing**, after the runtime has enough current-turn context to formulate a useful query.

Preferred order:

```text
User input
 -> Resolve Command
 -> Game Logic / optional Event Interpreter
 -> commit authoritative Events
 -> build current World Observation
 -> Memory recall
 -> Orchestrator guidance (optional)
 -> Narrator or Director
 -> final prose
```

This ensures Memory retrieval and Orchestrator planning see the same committed world reality that the final prose must describe.

Games may support read-only pre-resolution memory lookups for intent resolution when explicitly needed, but those results remain historical context and cannot become current-state authority.

#### 10.7.5 Memory write timing and provenance

Memory updates happen **after** authoritative World Events and the final prose are fixed for the turn.

Memory must distinguish at least:

- **authoritative game memory** derived from committed World Events;
- **narrative/chat memory** derived from surviving user/assistant text;
- compressed/derived summaries with explicit provenance.

Hard game facts should preferably be ingested or referenced directly from Event Journal records rather than asking an extraction LLM to reconstruct numbers/state from prose.

Examples:

- damage amount, inventory consumption, location transition, quest state: source from committed events;
- a memorable line of dialogue, style/relationship nuance not modeled by World Schema: may be extracted from final prose/chat.

Memory extraction must never write World State.

Orchestrator scratch, capsule text, critic suggestions and discarded drafts must not become durable memory merely because they existed during generation.

#### 10.7.6 Memory vs current state

Memory is historical context, not a second live state database.

A recalled memory saying “the player had 20 HP” must never override a current World Observation saying HP is 57.

State-sensitive recall should carry provenance/time/event anchors so consumers can tell historical facts from current facts.

Where possible, Memory should reference authoritative event ids / entities rather than duplicate mutable current-state fields.

#### 10.7.7 Branch / swipe coherence

Turn Context, Orchestrator snapshots, Memory writes and final prose must share the same branch/floor/swipe anchor.

On swipe/delete/branch changes:

- World Runtime selects/replays the correct Event branch;
- stale orchestration guidance for another branch must not leak;
- Memory writes from abandoned branches must roll back, become inactive, or be excluded according to Memory's branch semantics;
- regenerated prose must be paired with the authoritative facts of its own branch.

#### 10.7.8 Narrative consistency

The prose producer receives a **Narrative Contract** containing at minimum:

- facts that must remain true;
- committed current-turn results/events;
- current World Observation;
- recalled memories with provenance;
- orchestration guidance marked as advisory;
- relevant style/lore constraints.

Narrative generation may add descriptive texture that does not contradict authoritative facts, but it must not silently create new durable game state.

If a prose-only detail later needs to become a durable game fact, a later Command/Event or explicit memory process must promote it through the appropriate subsystem.

#### 10.7.9 Diagnostics

Diagnostics should correlate the entire turn under one `turnId`:

```text
intent resolution
 -> command
 -> event interpretation (optional)
 -> game calculation
 -> committed events
 -> memory recall
 -> orchestrator guidance / director trace
 -> narrative producer
 -> final prose
 -> memory post-turn update
```

Logs should make source authority visible so support can distinguish:

- Game Logic/world-state bug;
- memory recall/extraction bug;
- orchestrator planning bug;
- narrator/director prose contradiction;
- branch anchoring bug.

### 10.8 Turn Controller and Turn Transaction

Persistent Game Surfaces must not directly coordinate generation lifecycle by listening to unrelated subsystem events.

Atria should expose one **Turn Controller** that owns the lifecycle of a user/game turn and one branch-anchored **Turn Transaction** that groups the artifacts produced by that attempt.

A turn has stable identifiers independent of mutable array indexes, conceptually including:

- `turnId`;
- `attemptId`;
- user action/message identity;
- assistant result identity when one exists;
- branch/floor/swipe anchor.

The lifecycle should be explicit enough to represent:

```text
submitted
 -> resolving
 -> calculating
 -> recalling
 -> orchestrating
 -> narrating
 -> finalized
```

plus terminal/interruption states such as `aborted` and `failed`.

The Turn Transaction groups, as applicable:

- resolved Command(s);
- provisional/attempt-scoped World Events;
- projected World state for the attempt;
- Memory candidates / recall result;
- Orchestrator snapshot/guidance;
- final prose / assistant attempt.

The observable contract is atomic from the player's perspective: an interrupted or abandoned attempt must not leave a finalized prose result pointing at one world branch while state/memory/orchestration artifacts belong to another.

Implementation may use attempt branches, transaction markers, compensating/rollback selection or another mechanism compatible with the immutable Event Journal. The user-facing semantics below are required even if internal event records remain append-only.

#### Stop Generation

Stops the current unfinished attempt:

- abort Resolver / Event Interpreter / Orchestrator / Narrator / sub-agents as applicable;
- retain the submitted user input/action by default;
- do not finalize the unfinished assistant attempt;
- any attempt-scoped World/Memory/Orchestrator artifacts must not become the active durable turn result.

#### Undo Turn

Returns to the state before the turn:

- remove/deactivate the turn's user + assistant presentation records as appropriate;
- restore the prior active World/Event branch;
- remove/deactivate the turn's Memory writes and Orchestrator snapshot;
- return presentation to the prior finalized turn.

#### Delete Assistant Result

Deleting the current assistant result while retaining the user input must also deactivate/roll back that assistant attempt's game/memory/orchestration artifacts. It must never leave “prose deleted but damage/inventory/location change still active”.

The retained user turn can then be retried or edited.

#### Rewrite Narrative

Re-runs only the Narrative Producer over the same authoritative committed game facts.

```text
same Command result
same RNG result
same Events
same World state
 -> new prose
```

This is a presentation/narrative variant, not a new game outcome.

#### Retry Turn

Creates a new full turn attempt:

```text
same or edited user input
 -> Resolver if needed
 -> Game Logic
 -> new deterministic RNG stream/attempt
 -> new Events / branch
 -> new prose
```

A retry may therefore produce a different game outcome.

#### Switch Variant / Swipe

An assistant swipe/variant is not merely alternate text when it represents a retried game turn.

A full attempt variant owns its corresponding:

- Command result;
- RNG trace;
- Event lineage;
- World projection;
- Memory/Orchestrator artifacts;
- prose.

Switching the active full variant must switch the active World/Event branch coherently.

Narrative-only rewrites may share the same authoritative Event lineage while carrying different prose variants.

This distinction should be explicit in runtime metadata so Atria can tell **same facts, different wording** from **different game outcome**.

### 10.9 Connection Profile and Runtime Role

Atria 1.0 must separate **how a model is reached** from **what the model is used for**.

#### Connection Profile

Describes transport/provider/model connection details:

- provider/API family;
- endpoint;
- credential reference;
- model;
- headers/body overrides;
- retry/rate limit;
- prompt caching;
- transport/tool-calling capability.

#### Runtime Role

Describes the workload using a connection.

Core LLM roles:

- `narrator`;
- `intent_resolver`;
- `event_interpreter`;
- `orchestrator`;
- `studio`.

Retrieval roles remain specialized non-chat workloads:

- `embedding`;
- `rerank`.

Consumers request a role rather than hard-coding a provider/profile:

```text
runtime role
 -> primary connection profile
 -> validation/retry policy
 -> fallback profile queue
```

Each role may define:

- primary profile;
- ordered fallback profiles;
- timeout;
- retry policy;
- reasoning policy;
- structured-output/tool-calling requirements;
- validation behavior;
- role-specific defaults.

Do not extend the old profile `mode` enum indefinitely with values such as `state`. The role layer is the scalable abstraction.

### 10.10 Model & Runtime configuration UX

The existing Connection Manager UI currently presents Chat / Embedding / Rerank as peer connection modes. During this Master Refactor it must evolve toward a role-oriented **Model & Runtime** configuration surface.

The eventual information architecture should distinguish:

```text
AI
├── Narration
├── Intent Resolution
├── Event Interpretation
├── Orchestration
└── Studio

Retrieval
├── Embedding
└── Rerank
```

Role editors must reflect their actual workload rather than clone the chat UI.

Examples:

- Narration emphasizes generation quality, sampling, streaming, context/cache and fallback.
- Intent Resolution emphasizes tool/schema reliability, retries, timeout and low-variance defaults.
- Event Interpretation emphasizes strict structured output, confidence threshold, no-change handling, validation, retries and fallback.
- Embedding/Rerank keep retrieval-specific forms.

The R5 implementation establishes the role/routing model and functional configuration surface. The final visual/information-architecture redesign belongs to R7.


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
 -> optional semantic interpretation
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

### R5 — LLM Runtime & Model Roles

Goal: code/LLM collaboration with no LLM-owned authoritative arithmetic or direct state mutation, plus a role-based model routing layer.

Work:

- command tool generation;
- command visibility;
- Intent Resolver;
- optional Event Interpreter;
- typed interpretation schema / confidence / no-change behavior;
- observation projection;
- Turn Coordination Contract / Turn Context;
- Turn Controller + Turn Transaction lifecycle;
- Stop / Undo / Delete Assistant Result / Rewrite Narrative / Retry Turn / Switch Variant semantics;
- Memory recall bridge and post-turn provenance-aware memory update;
- Orchestrator bridge for authoritative World/Event/Memory context;
- single Narrative Producer arbitration (Narrator vs Director takeover);
- Narrator;
- committed-fact enforcement/debug evidence;
- UI-action shortcut;
- native and prompt-tool fallback paths;
- Connection Profile vs Runtime Role separation;
- primary + fallback profile routing;
- role-specific validation/retry/timeout policies;
- functional Model & Runtime configuration surface.

Exit:

- free text -> command -> commit -> memory recall -> optional orchestration -> narration e2e;
- ambiguous semantic input -> Event Interpreter -> deterministic Game Logic -> commit e2e;
- spec/agenda/loop guidance and Memory recall reach the same Narrative Contract without overriding World facts;
- Director takeover produces the only final prose body while still obeying committed World facts;
- stopping an unfinished attempt does not leave active finalized World/Memory/Orchestrator artifacts;
- deleting an assistant attempt cannot leave its game-state effects active;
- Rewrite Narrative preserves authoritative Command/RNG/Event facts while changing only prose;
- Retry Turn creates a distinct attempt/event branch and switching variants restores the matching World projection;
- post-turn Memory ingestion uses committed Events for authoritative game facts and does not learn discarded drafts/capsules as facts;
- deterministic commands skip Event Interpreter;
- Event Interpreter can return no-change without creating state noise;
- UI button -> command -> commit -> narration e2e;
- intentionally wrong LLM arithmetic cannot alter world state;
- invalid/low-confidence interpretation cannot directly mutate state;
- irrelevant commands omitted from tool set;
- Runtime Role fallback routing is tested.

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

### R7 — Atria Game-first Shell Redesign

Goal: redesign Atria's own host UI so the 1.0 product no longer defaults visually or structurally to the old text-chat/SillyTavern-era information architecture.

This is not a cosmetic reskin. The host shell must reflect that Atria is a Game Runtime Host.

Work:

- establish an Atria 1.0 host design system and reusable shell components;
- redesign primary navigation and main-stage hierarchy;
- make Game Package / Runtime / World / Timeline concepts first-class in host UX;
- redesign mobile navigation around the new runtime instead of inheriting desktop chat drawers;
- integrate Game Studio, diagnostics and Immersive entry points coherently;
- redesign Model & Runtime configuration around Runtime Roles rather than the old Chat/Embedding/Rerank-only mental model;
- remove/reduce UI patterns that encourage future AI-generated features to copy the old “drawer + long text + chat bubble” layout by default;
- provide explicit reusable components/tokens/documentation so AI-assisted frontend work has a modern Atria-native target;
- preserve stable Surface APIs for Game Packages while allowing host implementation details to change.

Candidate host primitives may include:

- App/Game Shell;
- Stage;
- Workspace;
- Runtime Card;
- Inspector;
- Timeline;
- Dock;
- Sheet;
- Command Bar;
- Surface Host.

Exact visual language is an implementation/design task in R7; do not freeze arbitrary aesthetics in earlier runtime phases.

Exit:

- desktop and mobile host UI reflect Game Runtime as the primary product model;
- Model & Runtime page uses role-oriented information architecture;
- Game Package/World/Timeline/Studio/Diagnostics have coherent navigation;
- old host DOM remains hidden behind stable Surface/Native Component contracts rather than serving as the public architecture;
- frontend smoke/E2E covers major host paths and Game UI coexistence.

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
- LLM resolve/interpret/narrate tool-loop tests;
- Turn Context authority/precedence tests;
- Turn Controller interruption/abort tests;
- Turn Transaction rollback/deactivation tests;
- narrative-rewrite same-facts tests;
- full-retry alternate-event-branch tests;
- assistant-delete state-coherence tests;
- Orchestrator + Game Runtime + Memory integration tests;
- Director takeover single-writer tests;
- Memory provenance and branch-alignment tests;
- Event-derived hard-memory tests that bypass prose re-extraction;
- Event Interpreter schema/confidence/no-change tests;
- Runtime Role primary/fallback routing tests;
- Model & Runtime configuration tests;
- R7 desktop/mobile host-shell frontend smoke;
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
- Event Interpreter invoked only for explicitly ambiguous semantic work, never as a mandatory per-turn state updater;
- one shared Turn Context prevents Orchestrator/Memory/Narrator from independently rebuilding duplicate world context;
- Memory recall and orchestration consume bounded projections rather than raw full World State;
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
- run a mandatory “state update AI” every turn;
- let Event Interpreter write World State or numeric deltas directly;
- let Orchestrator, Memory and Narrator maintain separate competing versions of current world truth;
- treat Memory summaries or Orchestrator capsules as higher authority than current World Runtime state;
- run Director and Narrator as two independent final-body writers in the same turn;
- equate Game UI with a special “floor 0” message or require persistent UI to live inside conversation-floor DOM;
- let stopping/deleting a generation leave its World/Event/Memory side effects active;
- treat narrative rewrite and full game retry as the same operation;
- keep extending Connection Profile `mode` with every new AI workload instead of introducing Runtime Roles;
- preserve the old Chat/Embedding/Rerank-only API-page information architecture for Atria 1.0;
- dump full World State into every LLM request;
- force every game to use the Orchestrator;
- require JavaScript for simple game logic;
- require separate package installation beside the character card;
- define HP/MP/level/affection/inventory/quest/combat as mandatory or canonical Game Runtime fields;
- constrain every game to RPG/chat semantics;
- require the v1 JSON World representation to remain the only possible large-world storage backend forever;
- prematurely implement a grand-strategy Entity Store before a concrete scale requirement justifies it.

---

## 19. Current implementation rule

R0-R4 are complete on the working branch. R5 has begun with the initial LLM contract foundation.

Already implemented at the start of R5:

- LLM-safe typed Command tool catalog;
- command exposure/visibility metadata;
- explicit read-only World Observation projection;
- branch-anchored Turn Context;
- live World-session integration and focused tests.

Continue from the live handoff; do not restart R0-R4 or the already-landed R5 foundation.

The next implementation work should extend R5 into:

1. Intent Resolver;
2. optional Event Interpreter;
3. Turn Controller / Turn Transaction and interruption/variant semantics;
4. Runtime Role routing/fallback;
5. Memory bridge;
6. Orchestrator bridge;
7. single Narrative Producer arbitration;
8. Narrator and end-to-end game-aware turn flow.

Do not jump to R7 visual redesign before R5-R6 runtime/authoring contracts are stable. R7 is deliberately late so the host UI reflects the final product model rather than freezing premature runtime assumptions.


---

## 20. Success definition

The refactor is successful when Atria can support character-card games whose domain model is defined by the package rather than by Atria. A successful runtime can represent anything from a simple visual novel to a complex simulation without introducing engine-level RPG field assumptions.

Concretely, Atria can support a character card that:

- carries a complete Game Package;
- declares a fully author-defined formal world schema;
- initializes authoritative state without requiring canonical HP/MP/RPG fields;
- exposes typed commands;
- computes combat/items/resources in code;
- uses deterministic RNG;
- records immutable causal events;
- replays and branches correctly with conversation history;
- presents itself through Component/Hybrid/Full HTML UI using Persistent Game Surfaces independent of individual chat-floor DOM;
- preserves Narrative Cards as first-class non-Game-Package experiences;
- uses selectors rather than raw mutable state for UI;
- converts free-text intent into commands;
- optionally uses Event Interpreter for ambiguous semantics without giving it direct state authority;
- coordinates Game Runtime, Memory, Orchestrator and the final prose through one branch-anchored Turn Context;
- uses committed World Events as the source for hard game memories while keeping narrative memories provenance-aware;
- supports spec/agenda/loop guidance and Director takeover without creating competing final-body/state authorities;
- provides coherent Stop/Undo/Delete/Rewrite/Retry/Variant behavior so conversation history, World Events, Memory and orchestration remain on the same attempt branch;
- routes Narrator / Intent Resolver / Event Interpreter / other model workloads through explicit Runtime Roles with fallback policies;
- narrates committed results without LLM-owned state arithmetic;
- can be simulated and debugged in Game Studio;
- exports and reimports as one character-card artifact;
- does not rely on Regex, MVU, or LoreState to function as a game;
- presents Atria 1.0 through a Game-first host shell rather than the inherited pure-text-chat UI model;
- can model non-RPG domains such as visual novels, management games and strategy/society simulations without changing the core Command/Event/Rule architecture.

At that point Atria is no longer merely “SillyTavern plus richer status bars”.

It is a character-card game runtime whose default host happens to descend from SillyTavern.
