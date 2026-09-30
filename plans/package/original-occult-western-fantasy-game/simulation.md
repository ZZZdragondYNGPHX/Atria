# Original Occult Western Fantasy Game — World Simulation and Information Architecture

## Responsibility

Owns Round 6: authoritative world state, Truth / Belief / Memory / Exposure mapping, logical time, institutional Agendas, Case graph state, actor availability and projection boundaries.

## Dependencies

- `gameplay.md`
- `platform-and-gameplay.md`
- `institutions.md`
- `player.md`
- `metaphysics.md` only when a state design would alter supernatural rules.

> **Current discussion:** Round 6 core is approved. Round 6.5 is open: authoritative domain decomposition and state ownership.

---

### 6.32 Approved world simulation and information architecture — Round 6

The game must use Atria Native Lifecycle + Information as the authoritative simulation foundation rather than creating a parallel ad-hoc World State engine.

The approved authority direction is:

**Package Canon → World / Lifecycle Truth → Artifacts / Events / Institutional State → Beliefs + Memories + Open Loops → Case / Relationship Graph → Perspective Views → Narrative / UI**

Narrative and model output are downstream projections.

#### 6.32.1 World Truth

Authoritative Truth records what actually exists or occurred according to game state.

Examples:

- a person entered a location at a specific time;
- a weapon caused an injury;
- an artifact is physically stored at a location;
- a historical person really existed;
- a resolved world action actually occurred.

Language-model narration may describe Truth but cannot create or modify it merely by wording.

#### 6.32.2 Institutional State

Official records and institutional recognition are authoritative facts about institutions, not automatic statements of underlying historical Truth.

Example:

- World Truth: a person was born in one year;
- Civil State: the registry records another year.

Both facts may coexist without corrupting authority boundaries.

Institutional State may include:

- civil registration;
- court rulings;
- insurance settlement;
- Church status;
- corporate records;
- professional licensing;
- property recognition.

#### 6.32.3 Artifact and Evidence authority

A document, photograph, body, map, ticket, letter or relic is a world object.

The authoritative state may establish:

- the artifact exists;
- provenance;
- custody;
- physical properties;
- what content it contains.

The content's assertion is not automatically World Truth.

A valid death certificate proves that a death certificate was issued with certain content. It does not by itself prove that the recorded death actually occurred as stated.

#### 6.32.4 Belief

Belief records what an actor or institution currently accepts as true.

Belief is perspective-bound.

It may be:

- correct;
- incomplete;
- false;
- contradictory;
- institutionally inherited.

NPC testimony, institutional interpretation and player Hypotheses must not silently promote themselves into World Truth.

#### 6.32.5 Memory

Memory is separate from Belief.

Memory records continuity of remembered experience or retained information in a carrier.

An actor may remember an event while doubting their interpretation of it.

Memory may be:

- accurate;
- incomplete;
- distorted;
- suppressed;
- contradicted by current Belief.

World history is not reconstructed from actor Memory.

#### 6.32.6 Open Loops

Open Loops represent unfinished commitments or future-relevant state such as:

- active Case;
- institutional Agenda;
- Obligation;
- promise;
- appointment;
- deadline;
- pending legal process;
- Personal Anchor commitment.

Open Loops are not all equivalent in urgency or ownership, but they share the property that future state still depends on them.

#### 6.32.7 Narrative is not mechanical Truth

Approved hard rule:

**Narrative output is never itself the source of authoritative world mutation.**

If narration says an NPC “seems dishonest,” this may describe player perception without establishing that the NPC lied.

If a fact must become authoritative, it requires a valid world action, command, lifecycle transition or other accepted state mutation.

#### 6.32.8 Resolve first, narrate second

The core execution direction is:

**Player Intent → Resolution → authoritative commit → Information Projection → Narrative generation**

Do not use the inverse pattern:

**Narrative generation → parse prose → guess state mutation**

This applies to:

- injury;
- evidence;
- time passage;
- relationship changes;
- Claim effects;
- institutional consequences;
- world events.

#### 6.32.9 Narrator perspective is bounded

The narrator does not receive universal omniscient World Truth by default.

Narrator context should contain only what is needed for the current scene and approved narrative function, such as:

- observable scene reality;
- player-known facts;
- relevant resolved outcomes;
- visible actor behavior;
- necessary environmental state.

Hidden Truth should remain absent from narrator context unless a specific narrative task truly requires it.

#### 6.32.10 Actor perspective is stricter

An NPC perspective should be composed from:

- that actor's Beliefs;
- that actor's Memories;
- current observable scene state;
- Relationship state;
- relevant Obligations and Agenda;
- public or otherwise legitimately known information.

NPCs should not rely on prompt instructions to “pretend not to know” inaccessible Truth.

The unavailable information should simply not be projected.

#### 6.32.11 Player projection does not expose backend Truth

Player-facing UI and context must derive from player-available information.

Do not expose:

- hidden culprit fields;
- hidden clue counts;
- unknown Truth labels;
- unrevealed institutional facts;
- backend completion percentages.

The player sees acquired Evidence, known Findings, known Beliefs, current relationships and visible world state.

#### 6.32.12 Exposure terminology

The project distinguishes three concepts that must not share an ambiguous implementation name:

- **Claim Exposure** — a supernatural Price family;
- **Operational Exposure** — gameplay consequence in which an actor / institution notices or records the player;
- **Information Projection Exposure** — Atria view policy controlling display/context availability.

Future technical design must use distinct field names.

#### 6.32.13 Shared investigation graph

Cases must use shared world entities and relationships rather than private nested clue copies.

The investigation graph may contain conceptual node families such as:

- Entity;
- Event;
- Artifact;
- supernatural Claim;
- Matter;
- Settlement.

Representative edges:

- person → employed_by → institution;
- artifact → asserts → event;
- actor → remembers → event;
- institution → settled → matter;
- person → owns → property.

A Case represents an investigative view over part of this graph.

#### 6.32.14 Bounded graph projection

The full world graph must never be injected into model context.

Perspective projections should include only bounded graph regions relevant to:

- current Scene;
- active Matter;
- current Actor;
- current Task;
- directly related records.

This is necessary for long-session stability.

#### 6.32.15 One canonical world clock

The game maintains one authoritative logical world time.

Scene / Day / Arc are presentation and design scales over the same timeline, not independent clocks that require reconciliation.

Resolved actions advance authoritative time.

Time advancement then allows due:

- deadlines;
- Agenda steps;
- appointments;
- schedule changes;
- evidence decay;
- institutional actions;
- recovery.

Narrative text may describe elapsed time only after authoritative time has advanced.

#### 6.32.16 Agenda is a state machine, not a progress bar

Institutional Agenda should contain meaningful state such as:

- goal;
- current phase / state;
- blockers;
- next permitted actions;
- relevant Knowledge;
- due time or trigger.

A Clock controls when an Agenda is eligible to act.

The Clock is a scheduler, not the Agenda's story progress percentage.

#### 6.32.17 Model Tasks may propose, not directly mutate

Complex institutional decision-making may use a bounded Model Task.

Correct flow:

1. project only permitted institutional information;
2. model proposes one of the allowed actions / commands;
3. Native authority validates the proposal;
4. valid command is committed;
5. later narration reflects the new state.

A model-generated statement does not directly rewrite world state.

#### 6.32.18 Actor simulation tiers

The game uses three simulation tiers.

**Tier A — Major Actors**

Persist:

- Identity;
- Beliefs;
- Memories;
- Relationship state;
- Agenda;
- availability / location abstraction;
- long-term changes.

**Tier B — Named Supporting Actors**

Persist:

- stable Identity;
- essential role / profession;
- limited Beliefs;
- relevant Relationship;
- schedule / availability abstraction;
- important Memories only.

They do not require full autonomous Agenda simulation.

**Tier C — Population**

Ordinary crowd members, workers, customers and passersby are generated from district / institutional state when needed.

They are not individually persisted unless promoted by play.

Promotion to Tier B or A creates a stable Actor identity rather than regenerating them freely.

#### 6.32.19 Lazy location materialization

Actors do not require minute-by-minute path simulation.

Authoritative state may track:

- normal schedule;
- current exceptional appointment;
- district / institution availability;
- explicit travel when materially relevant.

Exact scene position may be materialized when the actor enters an observed or relevant scene.

This avoids unnecessary simulation while preserving coherent availability.

#### 6.32.20 Long-term Memory discipline

Actor Memory should retain information that is likely to affect future behavior, including:

- promise;
- betrayal;
- major relationship change;
- significant revelation;
- major shared experience;
- Identity change;
- unresolved conflict;
- durable judgment of another actor.

Routine scene detail can remain in narrative history without becoming permanent Actor Memory.

#### 6.32.21 History is not Memory

Authoritative historical Event state and actor Memory are distinct.

A historical event can remain true even when nobody remembers it.

An actor can remember something incorrectly.

Do not use Memory rollups as the canonical world-history source.

#### 6.32.22 Hot / cold information lifecycle

Active state remains detailed.

Older completed state may be compacted into:

- Settlement Record;
- key Event summary;
- important Memory;
- durable relationship change;
- references to critical Evidence.

Referenced, pinned or still-relevant source records must be retained.

The target policy is:

**hot state detailed → cold history compact → referenced evidence preserved.**

This supports long-running campaigns without erasing meaningful history.

### 6.33 Round 6 decision

Approved:

- use Atria Native Lifecycle + Information as the simulation foundation;
- no independent all-purpose World State engine;
- separate World Truth, Institutional State, Artifact assertions, Belief, Memory, Open Loops and Narrative;
- artifact content does not automatically equal Truth;
- resolve / commit before narrative generation;
- narrator and NPC perspective projection instead of hidden omniscience;
- player projection excludes unrevealed backend Truth;
- distinct terminology for Claim / Operational / Information Exposure;
- shared Case / Evidence graph;
- bounded graph projection;
- one canonical world clock;
- Agenda as state machine with Clock as scheduler;
- Model Tasks propose only validated commands;
- Major / Supporting / Population simulation tiers;
- lazy location materialization;
- selective long-term Actor Memory;
- authoritative history separate from Memory;
- hot / cold information compaction with referenced content retained.

Rejected:

- prose-parsing as the primary state update mechanism;
- giving narrator / NPC contexts complete world Truth and relying on “do not reveal” prompts;
- one giant nested gameState object as the whole simulation architecture;
- one separate clock per subsystem;
- faction progress bars as the only Agenda model;
- full autonomous simulation for every named or incidental NPC;
- retaining every conversation detail as permanent Memory.

### 6.34 Round 6.5 question — authoritative domain decomposition

Round 6.5 must determine the concrete conceptual state domains and ownership boundaries before technical schemas are written.

Candidate responsibilities include:

- actors;
- actor Beliefs;
- actor Memories;
- relationships;
- player ordinary Identity / Anchors;
- supernatural Claims;
- world Events;
- Artifacts / Evidence;
- Cases / Matters / Leads / Hypotheses;
- Settlements;
- institutional State / Standing / Access;
- Agendas;
- schedules / availability;
- injuries / Conditions;
- economy / obligations;
- Breach Imprints and progression state.

The round must decide:

- which responsibilities belong in separate domains;
- which should be joined to avoid needless fragmentation;
- which entities need graph identity;
- which data must be world-scoped versus session-scoped;
- which state should be actor-owned versus institution-owned;
- which records should be retained permanently;
- which data should be derivable projection instead of stored duplication;
- where strict write authority should live.

