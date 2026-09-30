# Atria Game Runtime Architecture Refactor — Implementation & Acceptance

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
- source-project vs distribution-artifact build pipeline;
- Atria native .atria package validator/builder/importer/exporter;
- package manifest/version validation and safe ZIP extraction;
- package asset inventory/integrity reporting;
- compatibility export guidance for PNG/JSON/CharX;
- preserve code editor/Git/diff flows.

Exit:

- create a small playable game through Studio;
- simulate/debug it;
- build a lossless .atria package;
- reimport that package and retain project/runtime behavior;
- verify nested text/binary assets round-trip;
- verify malformed/traversal/oversized package inputs fail safely;
- retain PNG/JSON/CharX interoperability for appropriate card classes.

Implementation result — **complete (2026-09-21)**:

- the existing CardApp Studio was evolved in place into a runtime-aware **Atria Game Studio**; no parallel authoring product was created;
- Project Navigator recognizes `game.json`, World Schema, Initial State, declarative Game Logic and its Commands/Reducers/Rules/Interpretations, UI, Selectors, Immersive, Observation resources, knowledge/skills, assets and raw source;
- World Schema / Initial State / Command / Formula / Rules / Reducer/Event / Interpretation Mapping / Selector / Observation structured editors write the same source files used by Runtime; there is no Studio-only shadow config;
- structured Game Logic changes are validated through the existing declarative compiler plus Command/Reducer/Rule/Interpretation registries;
- Selector authoring reuses the R4 safe Formula + Selector Runtime contract;
- package-declared `llm.observations` compiles into the existing R5 World Observation projector contract;
- Simulation / Diagnostics runs an isolated in-memory World Runtime through the real R3 `simulate()` path and exposes Command validation, Before/Projected World State, Event Timeline, RNG Trace, Rule Trace, LLM Tool Preview, Observation Preview, Selector Preview and a mutation guard proving no persistence/Journal/authoritative-state write;
- AI Builder is Game-project-aware while preserving the existing multi-file edits-lib diff/conflict/approval/Git workflow; complete virtual post-edit source batches are preflighted against live Game Runtime contracts before commit;
- AI Builder cannot replace the runtime with a second authoritative state engine and cannot remove/rename the canonical `game.json` contract from an existing Game Project;
- native `.atria` distribution is implemented as a standard ZIP container with root container `manifest.json` and runtime project under `game/`, where `game/game.json` remains the distinct Game Runtime manifest;
- `.atria` inventory carries per-file SHA-256 plus a canonical inventory integrity hash;
- build excludes `.git`, saves, progress and checkpoints by default;
- import/inspection rejects unsafe/ambiguous paths, traversal, case/path conflicts, malformed/unsupported manifests, missing/undeclared entries, metadata/integrity mismatch, entry/archive/total-size limit violations and suspicious decompression ratios;
- restore validates the entire archive before Source Project mutation, uses staging + rollback, preserves the project `.git` directory and creates one Studio restore commit;
- Studio exposes **Build .atria** and **Import .atria** flows; import uses validate-only preview before confirmed restore;
- focused tests prove nested UTF-8 and binary assets round-trip and prove build -> inspect -> restore preserves Simulation/Runtime behavior;
- Narrative Cards and existing PNG/JSON/CharX paths remain supported; R6 does not force ordinary cards into Game Runtime;
- no R7 global host-shell redesign was pulled into R6.

Final R6 validation:

- Workflow: **Game Runtime Dev Checks**
- Run: **#340 / `35559636615`**
- HEAD: **`26692b80aaa073e2442f5ed23b3f082ef25b3e2c`**
- Result: **success**
- Focused unit-test step: success
- Focused ESLint step: success
- Android/Docker builds were not run because they remain opt-in and R6 changes are browser/Node authoring/runtime/package code.

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
- .atria package build/import/export round-trip tests;
- ZIP traversal/archive-limit/manifest validation tests;
- PNG/JSON/CharX compatibility interchange regression tests;
- package-vs-save separation tests;
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
- prematurely implement a grand-strategy Entity Store before a concrete scale requirement justifies it;
- remove PNG/JSON/CharX support merely because Atria gains a native package;
- keep using PNG metadata or giant JSON/base64 blobs as the permanent ceiling for full Game Packages;
- invent an opaque proprietary binary container when standard ZIP semantics are sufficient;
- couple distributable Game Packages to a user's live save/progression state.

---

## 19. Current implementation rule

**R0-R5 are complete on `refactor/game-runtime-architecture`. R5 is the formal midpoint checkpoint.**

Validated R5 working HEAD:

`1da96c37598223e3a2b89f9561a7722d12e58b6b`

Final focused validation:

- Workflow: `Game Runtime Dev Checks`
- Run: `35556314851` (#280)
- Result: success
- Scope: R0-R5 focused unit/integration matrix plus focused ESLint.
- R4 real-browser smoke remains green from `Game Runtime R4 Browser Checks` #3 at `29fbc5f824324aadddbf550cfc6a7c18c85f1f54`.

R5 now includes:

- LLM-safe Command tool generation with explicit exposure/visibility;
- Intent Resolver that can only propose typed Commands;
- optional typed Event Interpreter with confidence/no-change behavior and no direct World mutation;
- deterministic interpretation mapping back through the Command Bus;
- explicit World Observation projections;
- one branch-anchored Turn Context with fact precedence and source provenance;
- Memory recall after authoritative commit and before narration;
- authoritative post-turn Memory ingestion sourced from committed Events rather than prose re-extraction;
- Orchestrator bridge where spec/agenda/loop provide advisory guidance only;
- Director takeover as the sole final prose producer for Director turns;
- Narrative Contract with committed-fact enforcement;
- Runtime Roles separated from Connection Profiles, with primary/fallback queues, timeout/retry and role capability requirements;
- functional Model & Runtime configuration data/API surface;
- Turn Controller / Turn Transaction phases;
- Stop / Undo / Delete Assistant Result / Rewrite Narrative / Retry Turn / Switch Variant semantics;
- sibling World branches for distinct retry outcomes;
- native assistant message/swipe binding for outcome variants;
- package UI typed actions routed through the complete R5 turn pipeline;
- compatibility-safe cloning for R5 runtime values in environments without native `structuredClone`.

R5 exit coverage proves:

- free text -> Command -> commit -> Memory recall -> optional orchestration -> narration -> post-turn Memory update;
- ambiguous semantic input -> Event Interpreter -> deterministic mapping -> typed Command -> committed Events;
- spec/agenda/loop guidance and Memory reach the same Narrative Contract without overriding World facts;
- Director produces the only final prose body during takeover;
- stopped attempts do not become active finalized artifacts;
- deleting the assistant result deactivates the whole Turn artifact set;
- Rewrite Narrative preserves authoritative Command/Event/Observation facts;
- Retry Turn creates a sibling attempt/event branch and Switch Variant restores its matching World projection;
- authoritative Memory facts derive from committed Events and stale with inactive event lineage;
- deterministic UI Commands skip Intent Resolver/Event Interpreter and still complete narration;
- intentionally wrong LLM arithmetic cannot alter World State;
- irrelevant Commands are omitted from the LLM tool set;
- Runtime Role provider fallback is ordered and fail-closed for schema/validation errors.

**Next phase: R6 — Game Studio.**

R6 must evolve the existing CardApp Studio into Atria Game Studio; do not create a parallel second Studio.

R6 owns:

1. project navigator over the existing source-project files;
2. World Schema / Initial State / Command / Formula / Rule structured editors;
3. Selector and Observation editors/previews;
4. deterministic Simulation Console, Rule Trace, Event Timeline and World State Inspector;
5. LLM Tool Preview;
6. AI Builder project-aware cross-file editing with reviewable diffs;
7. source-project vs distribution-artifact workflow;
8. native ZIP-based `.atria` package manifest/validator/builder/importer/exporter;
9. safe ZIP extraction, traversal/resource/archive-limit checks and asset integrity inventory;
10. lossless nested text/binary round-trip;
11. PNG/JSON/CharX interoperability for appropriate card classes;
12. preservation of existing CodeMirror/Git/diff flows.

Do not reopen R0-R5 unless a concrete R6 integration defect requires a targeted fix.

Do not begin R7 host-shell visual redesign during R6. R7 remains deliberately after Game Studio so the host UI reflects the completed runtime and authoring model.


---

## 20. Success definition

The refactor is successful when Atria can support character-card games whose domain model is defined by the package rather than by Atria. A successful runtime can represent anything from a simple visual novel to a complex simulation without introducing engine-level RPG field assumptions.

Concretely, Atria can support a character card that:

- carries a complete Game Package and can export it losslessly as an Atria native package;
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
- exports/reimports complete game projects through .atria while preserving PNG/JSON/CharX interoperability for simpler/standard cards;
- does not rely on Regex, MVU, or LoreState to function as a game;
- presents Atria 1.0 through a Game-first host shell rather than the inherited pure-text-chat UI model;
- can model non-RPG domains such as visual novels, management games and strategy/society simulations without changing the core Command/Event/Rule architecture;
- keeps authored package content separate from user save/progression state.

At that point Atria is no longer merely “SillyTavern plus richer status bars”.

It is a character-card game runtime whose default host happens to descend from SillyTavern.
