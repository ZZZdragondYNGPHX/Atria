# Atria Game Runtime Architecture Refactor — Baseline & Top-level Architecture

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 0. Task identity

- Task: **Atria Game Runtime Architecture Refactor**
- Development branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Document branch: `docs`
- Document path: `refactor/game-runtime-architecture.md`
- Status: architecture approved and in implementation; **R0-R6 are complete against their phase exit criteria. R6 — Game Studio is validated at `refactor/game-runtime-architecture@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`. The next and final planned phase is R7 — Atria Game-first Shell Redesign.**

## R7 branch-strategy amendment

The original Master Plan assumed R7 would continue directly on `refactor/game-runtime-architecture`. That implementation strategy was superseded after R6 completion.

- R0-R6 are frozen at `refactor/game-runtime-architecture@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`.
- R7 is implemented independently on `refactor/atria-game-first-shell-redesign`, created from that exact validated R6 HEAD.
- The frozen R0-R6 branch is retained as the phase archive/baseline during R7 and is not merged separately into `main`.
- The R7 branch contains the full R0-R6 history and is the only branch that should ultimately be merged into `main` after complete R0-R7 validation.
- The authoritative expanded R7 product/frontend plan is `docs:refactor/atria-game-first-shell-redesign.md`.
- Any older instruction in this Master Plan that says to continue R7 on `refactor/game-runtime-architecture` is superseded by this amendment.

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
