# Original Occult Western Fantasy Game — World Simulation and Information Architecture

## Responsibility

Owns Round 6: authoritative world state, Truth / Belief / Memory / Exposure mapping, logical time, institutional Agendas, Case graph state, actor availability and projection boundaries.

## Dependencies

- `gameplay.md`
- `platform-and-gameplay.md`
- `institutions.md`
- `player.md`
- `metaphysics.md` only when a state design would alter supernatural rules.

> **Current discussion:** Rounds 6–6.5 are approved. Round 6.6 is open: perspective-specific context projection and anti-leakage design.

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

### 6.34 Approved authoritative domain decomposition — Round 6.5

The simulation uses a small set of conceptually distinct authority domains.

The target is to prevent both a monolithic `gameState` and excessive fragmentation into duplicate shadow state.

The approved logical domains are:

1. `entities`
2. `events`
3. `institutional_records`
4. `evidence`
5. `relations`
6. `beliefs`
7. `memories`
8. `matters`
9. `settlements`
10. `agendas`
11. `conditions`
12. `claims`
13. `player_life`
14. `progression`

Round 9 may split one logical domain into multiple physical Atria Lifecycle domains for scope or retention reasons without changing these responsibility boundaries.

#### 6.34.1 Entities

`entities` owns stable identity for persistent:

- people;
- institutions;
- places;
- important objects.

It should not become a container for all data about an entity.

Beliefs, Memories, Conditions, relationships and institutional records belong to their own domains.

#### 6.34.2 Events

`events` owns authoritative occurrences and world history.

Examples:

- entering a location;
- a death;
- injury;
- document issuance;
- a court action;
- a completed world action.

Later Belief, Memory or reporting may disagree with the Event without rewriting it.

#### 6.34.3 Institutional records

`institutional_records` owns what formal systems currently record or recognize.

Examples:

- civil identity;
- birth / death registration;
- title;
- property;
- court status;
- Church status;
- professional license;
- insurance / corporate recognition.

An institutional record is Truth about what the institution records, not automatic Truth about history.

#### 6.34.4 Evidence

`evidence` owns investigation-grade observations or evidence units with stable identity.

Evidence may reference:

- Artifact / Entity;
- Event;
- location;
- source;
- custody;
- integrity;
- observed content.

A Case references Evidence rather than copying it.

#### 6.34.5 Relations

`relations` owns real relationships among entities such as:

- kinship;
- marriage;
- employment;
- ownership;
- membership;
- formal representation;
- custody / possession;
- religious affiliation;
- contractual Bond where appropriate.

Do not store one generic numerical reputation value here.

#### 6.34.6 Beliefs

`beliefs` owns actor- or institution-bound cognitive positions.

Testimony, Hypothesis and Finding can use one Belief model differentiated by fields such as:

- actor;
- channel;
- status;
- source;
- target proposition / reference.

Representative channels:

- testimony;
- hypothesis;
- finding;
- institutional interpretation;
- public interpretation.

This maps naturally onto Atria Information's actor/status/channel Belief semantic.

#### 6.34.7 Memories

`memories` owns retained experience and remembered information for an actor or institution.

It must remain separate from Belief.

Memory can be accurate while current Belief rejects its interpretation, or Memory can be distorted while a Belief happens to be correct.

#### 6.34.8 Matters

`matters` is the unified logical model for unfinished future-relevant work.

Matter types may include:

- Case;
- Lead;
- Commitment;
- Obligation;
- professional Project;
- personal appointment;
- pending legal or institutional process.

This maps to Open Loop semantics.

Player/session Matters and world/institution Matters may become separate physical domains because of Atria scope rules while retaining one logical Matter contract.

#### 6.34.9 Settlements

`settlements` owns durable formal dispositions such as:

- court ruling;
- insurer settlement;
- religious resolution;
- identity ruling;
- Case disposition;
- administrative recognition.

A Settlement receives a stable world identity because later institutions, Cases, Memories and Echo may reference it.

Do not reduce Settlement to `case.status = completed`.

#### 6.34.10 Agendas

`agendas` owns autonomous actor / institution intent state.

Agenda includes concepts such as:

- goal;
- current phase;
- blockers;
- permitted next actions;
- trigger / due time;
- relevant Knowledge.

Agenda remains distinct from Matter.

Matter describes what is unresolved.

Agenda describes what an autonomous subject intends to do about the world.

#### 6.34.11 Conditions

`conditions` owns persistent states that materially alter future action validity or Position.

Examples:

- gunshot wound;
- fracture;
- infection;
- significant disease;
- persistent abnormal restraint;
- relevant ongoing supernatural condition.

Do not promote routine descriptive details such as mild tiredness or wet clothing into persistent Conditions without gameplay consequence.

#### 6.34.12 Claims

`claims` owns formal supernatural Claim instances currently recognized by the world.

Player and NPC Claims belong to the same logical authority.

Claim Seeds and Breach Imprints do not belong here.

Creation or alteration of a formal Claim requires supernatural authority commands.

#### 6.34.13 Player life

`player_life` owns the protagonist's ordinary-life identity and practical persistent state, including:

- Origin;
- Prior Life;
- Faith relationship;
- current Civil Verifier profession state;
- office / practice state;
- Personal Anchor references;
- home / community Anchor;
- limited practical finances.

Formal debts should not be flattened into a player numeric field; they belong in Relation + Matter / institutional records as appropriate.

#### 6.34.14 Progression

`progression` owns not-yet-formalized supernatural development such as:

- Breach Imprints;
- Unsettled state;
- Claim Seeds;
- Investiture eligibility;
- Claim-candidate state;
- Self-Investiture learning / research.

When a Seed becomes a formal Claim, a validated progression command creates an entry in `claims`.

#### 6.34.15 No general Economy domain

The game does not simulate a complete economic model.

Use existing domains instead:

- protagonist practical cash / office finances → `player_life`;
- debt → Relation + Matter;
- contract → institutional record / Relation;
- important company finance fact → institutional record / Event.

Do not build city-wide commodity, wallet or corporate cashflow simulation unless a later approved system requires it.

#### 6.34.16 No general Schedule domain

Routine schedules should be package data or deterministic templates.

Exceptional future commitments belong in Matter.

Autonomous institutional timing belongs in Agenda.

Travel / hospitalization / similar changes arise through Event, Relation/location and Condition.

Availability should be projected from those authoritative facts rather than duplicated in a parallel schedule state.

#### 6.34.17 No Reputation domain

The approved relationship model must derive player-facing standing from real state.

- **Institutional Standing** → institutional Belief;
- **Personal Relation** → Relation + Belief;
- **Access** → institutional record / Relation;
- **Obligation** → Matter + Relation;
- **Known History** → Memory + Belief.

UI may summarize these, but the backend should not introduce a shadow `reputation = 57` value.

#### 6.34.18 Investigation graph node model

Primary graph node families should include:

- Entity;
- Event;
- Evidence;
- Matter;
- Settlement;
- formal Claim;
- important Institutional Record.

Relations provide graph edges.

Belief, Memory and Condition primarily remain perspective / state records attached through stable references rather than automatically exploding the main graph into every cognitive record.

#### 6.34.19 Retention priorities

Prefer permanent or long-lived retention for:

- important Entity;
- significant Event;
- Settlement;
- formal Claim;
- referenced Evidence;
- Institutional Record that still defines rights or identity;
- important Relation;
- Personal Anchor.

Candidates for later compaction include:

- expired Lead;
- superseded low-value Hypothesis;
- finished minor Agenda step;
- expired Condition;
- redundant low-value supporting Memory.

Compaction must never rewrite historical Truth.

#### 6.34.20 Three write-authority classes

**Hard Authority**

Applies to:

- entities;
- events;
- institutional records;
- evidence;
- relations;
- settlements;
- conditions;
- claims.

The language model cannot raw-patch these domains.

Mutation requires validated commands.

**Perspective Authority**

Applies primarily to:

- beliefs;
- memories.

A model may propose actor-perspective updates only when the actor plausibly observed, learned or experienced the supporting source.

Actor identity and source provenance must be validated.

**Intent Authority**

Applies primarily to:

- matters;
- agendas.

Players may create their own Hypotheses, Leads and Commitments.

Institutional Model Tasks may propose bounded Agenda actions.

Intent records do not themselves mutate hard world state.

#### 6.34.21 Derived state principle

Avoid duplicate shadow state whenever a useful value can be projected from authoritative records.

Explicitly rejected as general-purpose stored variables:

- `reputation`;
- `quest_progress`;
- generic `schedule`;
- `truth_percentage`;
- `sanity`;
- `faction_clock_progress`.

These may appear as UI summaries only when they are derived from authoritative underlying state and do not become a second source of truth.

### 6.35 Round 6.5 decision

Approved:

- fourteen logical authority domains;
- stable separation of Entity / Event / Institutional Record / Evidence / Relation;
- Belief channels for Testimony / Hypothesis / Finding;
- Memory separate from Belief;
- unified logical Matter model across Cases, Leads, Commitments and Obligations;
- Settlement as a durable world object;
- Agenda separate from Matter;
- only gameplay-relevant persistent Conditions;
- formal Claim separate from progression state;
- ordinary player life separate from supernatural progression;
- no general Economy, Schedule or Reputation domain;
- graph identity for major world/investigation objects;
- retention priorities based on lasting authority / reference value;
- Hard / Perspective / Intent write-authority classes;
- derived state preferred over duplicate convenience variables.

Rejected:

- one monolithic nested `gameState`;
- dozens of micro-domains for presentation convenience;
- Case-private Evidence copies;
- Claim Seeds stored as real Claims;
- numeric reputation as backend truth;
- universal schedule state;
- full economy simulation by default;
- quest progress / Truth percentage / sanity / faction-clock shadow variables.

### 6.36 Round 6.6 question — perspective-specific context projection

Round 6.6 must define what each AI-facing task is actually allowed to see.

It must design separate context packages for at least:

- Narrator;
- speaking / acting NPC;
- institutional Agenda Model Task;
- Case Reflection / investigation assistance;
- Claim interpretation / supernatural advisory tasks where needed.

It must determine:

- what each context always receives;
- what is selected dynamically by current Scene / Matter / Actor / Task;
- what is explicitly forbidden from each context;
- how recent narrative is combined with structured state;
- how relevant Beliefs and Memories are selected;
- how graph depth / item / character budgets are bounded;
- how source authority and uncertainty are represented so the model does not flatten Belief into Truth;
- how actor-to-actor information sharing becomes an explicit world event rather than implicit prompt leakage;
- how task output is validated and prevented from writing outside its authority;
- how the same system avoids omniscience, cross-NPC leakage, stale context and unlimited prompt growth.

