# Atria Game Runtime Architecture Refactor — Package & World Runtime

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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

### 4.3 Distribution and interchange formats

A Game Package travels with the character card, but Atria must distinguish **compatibility interchange formats** from the long-term native package ceiling.

Existing formats remain supported:

- **PNG** — convenient traditional character-card sharing format;
- **JSON** — human-readable character-card data interchange;
- **CharX** — standard ZIP-based character card + asset interchange.

These formats must not be removed merely because Atria gains a richer native package.

However, PNG/JSON must not become the long-term storage ceiling for complete Atria games. Large Game Packages may contain many HTML/CSS/logic files plus binary images, audio, video, fonts and other assets. Re-encoding all of those files into card JSON/base64 or PNG metadata is inefficient, fragile and difficult to author/version.

Atria should continue to reuse existing CardApp/character-card transport where appropriate during the refactor, while introducing a native package artifact for complete Atria projects.

Requirements shared by all package transports:

- nested files round-trip;
- binary assets round-trip without semantic loss;
- path traversal remains rejected;
- package metadata is validated;
- imports normalize into Atria's internal per-character/project representation;
- export format does not change Game Runtime semantics;
- ordinary character-card semantics remain usable when Game Runtime is unavailable.

Do not design the new runtime around separate user-installed “HTML zip + Regex + state plugin + worldbook” bundles.

### 4.4 Atria Native Package Format

Atria 1.0 should define a native distribution format for complete Game Packages.

Working canonical extension:

~~~text
*.atria
~~~

The native package should be a **standard ZIP container**, not a new opaque/proprietary binary filesystem.

Conceptual layout:

~~~text
example.atria
├── manifest.json
├── card/
│   └── card.json
├── game/
│   ├── game.json
│   ├── world/
│   ├── logic/
│   ├── llm/
│   └── ui/
├── worldbooks/
├── skills/
├── assets/
│   ├── images/
│   ├── audio/
│   ├── video/
│   └── fonts/
└── metadata/
~~~

Exact optional directories may evolve, but the package contract must preserve clear separation between:

- character-card metadata;
- Game Runtime project files;
- authored knowledge/skills;
- binary assets;
- package metadata.

The root manifest.json is the package/container manifest. The existing game/game.json remains the Game Runtime manifest. They serve different purposes and must not be conflated.

The native package manifest should eventually support:

- package format/version;
- package id;
- author/game version metadata;
- Atria runtime compatibility;
- declared entries/components;
- capability/permission summary;
- optional integrity hashes;
- optional dependency metadata;
- optional localization metadata.

Path normalization, archive bomb/resource limits, traversal protection and manifest validation are mandatory before extraction.

### 4.5 Source project vs distribution artifact

Game Studio authors should work against an unpacked project tree, not edit a compressed .atria archive directly.

Conceptually:

~~~text
authoring project directory
 -> validate/build
 -> distributable .atria package
~~~

The source project may contain authoring-only files such as tests, Studio metadata or development history that do not all need to enter the runtime package.

The build/export step decides which files become the distributable artifact.

### 4.6 Package is not Save

A Game Package contains the authored game/application:

- character/card definition;
- initial world/schema;
- logic;
- UI;
- knowledge;
- assets.

It does **not** normally contain the player's live progression.

Runtime progression remains separate:

- Event Journal;
- World snapshots;
- active branch/turn history;
- Memory state;
- user-specific settings.

A future portable save bundle may use a separate format such as *.atria-save, but save transport is a different contract from Game Package transport.

Exporting or sharing game.atria must not silently include the author's current playthrough.

### 4.7 Export policy

Recommended product behavior:

~~~text
Narrative Card
 -> PNG / JSON / CharX remain normal export choices

Complete Atria Game Package
 -> .atria is the recommended lossless export
~~~

A compatibility export to PNG/JSON/CharX may be offered when the package is representable within that format, but Atria must clearly report omitted/degraded Atria-only resources or capabilities rather than silently losing them.

Import should converge formats into one internal model:

~~~text
PNG    ─┐
JSON   ─┤
CharX  ─┼-> Atria internal character/project representation
.atria ─┘
~~~

The runtime must not behave differently merely because the same logical package arrived through another supported container.
### 4.8 Narrative Card remains a first-class mode

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
