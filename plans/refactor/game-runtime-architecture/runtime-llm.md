# Atria Game Runtime Architecture Refactor — Runtime & LLM Bridge

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
