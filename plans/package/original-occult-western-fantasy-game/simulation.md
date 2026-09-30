# Original Occult Western Fantasy Game — World Simulation and Information Architecture

## Responsibility

Owns Round 6: authoritative world state, Truth / Belief / Memory / Exposure mapping, logical time, institutional Agendas, Case graph state, actor availability and projection boundaries.

## Dependencies

- `gameplay.md`
- `platform-and-gameplay.md`
- `institutions.md`
- `player.md`
- `metaphysics.md` only when a state design would alter supernatural rules.

> **Current discussion:** Rounds 6–6.7 are approved. Round 6 is complete; frontend information/interaction constraints continue in `platform-and-gameplay.md` as lightweight Round 7.

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

### 6.36 Approved perspective-specific context projection — Round 6.6

There is no single complete “game prompt”.

Every AI-facing task receives a purpose-specific, bounded Context Package.

All Context Packages use the same conceptual assembly order:

1. **Task Identity** — what this model invocation is responsible for;
2. **Immediate State** — current authoritative state required for the task;
3. **Relevant Graph Slice** — a bounded graph projection rooted in Scene / Matter / Actor / Task;
4. **Perspective Memory** — only Memories legitimately available to this perspective;
5. **Recent Narrative** — a small amount of recent narrative for continuity.

Structured authority has higher precedence than narrative text.

#### 6.36.1 Narrator context

The Narrator normally receives:

- current Scene;
- canonical world time;
- observable entities and environment;
- already-resolved Outcome Packet;
- player-known Evidence and Findings relevant to the scene;
- visible actor behavior;
- limited relevant relations and institutional state;
- compact recent narrative.

The Narrator must not receive by default:

- unrevealed culprit identity;
- private NPC Beliefs;
- private NPC Memories;
- undiscovered Evidence;
- secret institutional Agenda steps;
- complete Eastbank Truth;
- unrelated world Truth.

The Narrator describes what is available to narrate rather than possessing omniscience.

#### 6.36.2 Outcome Packet

Every resolved player action produces an authoritative **Outcome Packet** before narrative generation.

It may contain:

- outcome class;
- achieved objective;
- structured consequences;
- time elapsed;
- state changes;
- visible reactions;
- unresolved uncertainty.

The Narrator may dramatize this packet but may not add, remove or invert its mechanical facts.

Absence of an immediate consequence does not imply absence of future state.

#### 6.36.3 Actor context

An NPC Actor context is centered on that actor and should normally contain:

- actor Identity / Office;
- current Beliefs;
- relevant Memories;
- current observable Scene;
- real Relations relevant to the scene;
- current Obligations;
- relevant Agenda state if the actor owns one;
- public or legitimately acquired information.

It must not contain institution-wide knowledge merely because the actor belongs to that institution.

#### 6.36.4 Institution knowledge is not employee knowledge

Institutional Belief and Institutional Records do not automatically become the Belief of every member.

An actor learns institutional information only through valid mechanisms such as:

- role / Office access;
- formal notification;
- direct record access;
- meeting;
- communication;
- public report.

This prevents cross-NPC and organization-wide knowledge leakage.

#### 6.36.5 Communication is a world event

Information transfer between actors must occur through an explicit communication or publication event.

If Actor A tells Actor B a claim:

- B receives a source-attributed communication;
- B may create a Testimony-channel Belief;
- B may accept, reject or remain uncertain;
- the content does not become World Truth merely through transmission.

Information therefore travels through the world rather than copying invisibly between prompts.

#### 6.36.6 Institutional Agenda Task context

An Agenda Model Task receives only the institution's legitimate operational perspective:

- institution Identity;
- current Agenda;
- Blockers;
- institution-owned records;
- institution Beliefs;
- legally/publicly acquired information;
- relevant Matter / Entity graph slice;
- canonical time;
- allowed Action Catalog.

It should normally receive no general narrative history.

The task outputs only a bounded action proposal compatible with the allowed catalog.

#### 6.36.7 Agenda Task does not consume ordinary Narrative by default

Narrative prose is intentionally excluded from ordinary institutional Agenda tasks unless the prose has already become an authoritative Artifact, Event or public communication.

This prevents metaphor, tone or narration errors from being mistaken for institution knowledge.

#### 6.36.8 Case Reflection context

Case Reflection is a non-oracular player assistance task.

It may receive only player-known:

- Evidence;
- Findings;
- Hypotheses;
- Leads;
- known Settlements;
- player Case notes;
- revealed graph relations.

It must not receive:

- hidden World Truth;
- unrevealed Evidence;
- private NPC Belief;
- future Agenda steps;
- hidden trigger conditions.

#### 6.36.9 Reflection functions

Permitted Reflection functions include:

- consistency checking;
- evidence relationship mapping;
- highlighting unanswered questions;
- surfacing contradictions among already known records;
- reminding the player of an acquired but overlooked relationship.

Reflection must not identify the canonical answer from hidden data or generate new Evidence.

#### 6.36.10 Supernatural / Claim Advisory context

A dedicated advisory task may inspect necessary mechanical Claim state such as:

- formal Claim structure;
- Anchor state;
- Price state;
- Conditions;
- player-known occult theory;
- permitted diagnostic output.

Mechanical visibility does not grant permission to reveal hidden story knowledge.

If the true cause of a Claim problem depends on an unrevealed Anchor event, the advisor may report a symptom class such as “Anchor interruption is consistent with this failure” without revealing the hidden cause.

#### 6.36.11 Context item provenance

AI-facing structured information should preserve epistemic metadata such as:

- semantic class;
- source;
- subject / actor where relevant;
- effective or observed time;
- status such as active / disputed / superseded.

Do not flatten all projected text into undifferentiated “facts”.

#### 6.36.12 Avoid generic confidence scores

Do not use one floating-point truth-confidence value such as `0.73` as the primary epistemic representation.

Prefer source and status distinctions such as:

- Police testimony — disputed;
- Player Finding — verified from two sources;
- Newspaper report — unverified;
- Institutional Record — active.

This reflects actual information structure rather than inventing pseudo-probabilities.

#### 6.36.13 Context precedence

When projected sources conflict, the context compiler and task contract should preserve this priority:

1. authoritative structured state;
2. resolved Outcomes / Events;
3. perspective Beliefs / Memories;
4. approved Knowledge resources;
5. recent Narrative.

Recent Narrative supports continuity but does not override authoritative structured state.

#### 6.36.14 Recent narrative is bounded

Do not provide the entire conversation history to every task.

The Narrator may receive a small recent scene window plus compact narrative rollup.

Older durable facts must re-enter context through:

- Event;
- Memory;
- Settlement;
- Finding;
- Relation;
- relevant Knowledge.

#### 6.36.15 NPCs do not receive whole chat history

An NPC appearing for the first time does not inherit the player's previous conversations.

Actor context may include only:

- scenes the actor participated in;
- information explicitly communicated to the actor;
- public or institutionally available material the actor plausibly obtained;
- retained actor Memory.

#### 6.36.16 Bounded graph radius by task

Default design tendency:

- **Narrator** — current Scene depth 1–2 plus a narrow active-Matter slice;
- **Actor** — self-centered relationship depth 1 plus current Scene / Matter additions;
- **Agenda Task** — Institution + Agenda depth 1–2;
- **Case Reflection** — player-known Matter graph depth 2–3;
- **Advisory Task** — exact Claim / Anchor / Condition references rather than broad graph traversal.

Exact depth / edge budgets are deferred to Round 9.

#### 6.36.17 Independent context budgets

Each task class should have its own item and character budget.

Default density tendency:

- ordinary Actor — smallest;
- Agenda Task — small, highly structured;
- Claim Advisor — small to medium, rule-dense;
- Narrator — medium;
- Case Reflection — largest, but strictly player-known.

Do not simply configure every Atria Information View to the maximum supported item / character limits.

#### 6.36.18 Stale knowledge is perspective state

An Actor may continue to believe an outdated fact if no valid information transfer updated them.

Projection must not silently substitute the latest World Truth for an actor's last known Belief.

Knowledge changes through observation, communication, record access or another legitimate information event.

#### 6.36.19 Public information channel

Widely published law, news or announcements may use a public-information mechanism instead of individually simulating every copy of a newspaper.

Propagation may depend on:

- place;
- institution;
- communication channel;
- elapsed time.

Public information creates attributable public Belief / report state, not instantaneous universal omniscience.

#### 6.36.20 User speech is not authority

Player statements inside dialogue are speech Events, not system facts.

If the player tells an NPC “you already know the mayor is guilty,” the Actor context still contains only the NPC's actual Beliefs.

This prevents prompt-style user assertions from silently rewriting character knowledge.

#### 6.36.21 AI output authority classes

Every AI-facing task has an explicit output authority.

**Narrative Output**

May render scene prose and presentation only.

**Actor Output**

May produce actor speech, actor action intent and bounded Belief / Memory proposals.

**Agenda Output**

May produce an allowed institutional / actor Agenda action proposal.

**Reflection Output**

May organize already-known player information.

**Advisory Output**

May explain permitted mechanics under player Knowledge policy.

Any hard world mutation still requires validated Native commands.

### 6.37 Round 6.6 decision

Approved:

- no universal game prompt;
- common five-layer Context Package assembly;
- bounded Narrator without hidden omniscience;
- authoritative Outcome Packet before narration;
- actor-centered NPC context;
- institutional knowledge not automatically inherited by members;
- communication / publication as explicit information-transfer events;
- structured Agenda Task context without ordinary Narrative by default;
- non-oracular Case Reflection;
- mechanical Claim Advisory constrained by Knowledge policy;
- semantic / source / time / status provenance on context items;
- no generic confidence score;
- structured-state precedence over recent Narrative;
- bounded recent narrative;
- no whole-chat NPC context;
- task-specific graph radius and budget;
- stale knowledge preserved until valid transfer;
- public-information propagation without universal instant sync;
- user dialogue is not authority;
- explicit output-authority class for every AI task.

Rejected:

- one full-context prompt shared by all AI calls;
- giving Narrator hidden Truth and relying on instruction discipline;
- employee access to all institution knowledge;
- implicit actor-to-actor knowledge copying;
- Agenda decisions based on decorative narrative prose;
- Reflection access to answer keys;
- advisory tasks leaking unrevealed story facts;
- prompt history as the primary source of NPC knowledge;
- user claims treated as system facts.

### 6.38 Approved world-advance scheduling and model-call budget — Round 6.7

World simulation advances deterministically by default.

Background Model Tasks are an exception reserved for genuinely open-ended deliberation.

The approved post-action order is:

**Player / World Action Commit → Advance Canonical Clock → Process deterministic due events → Evaluate conditional Agenda steps → Collect deliberative Agenda candidates → Relevance / Priority / Budget gate → Run bounded background tasks → Validate proposals against anchored revision → Commit in deterministic order → Stop at bounded reaction depth → Build Perspective Projection → Foreground Narrative**

#### 6.38.1 Deterministic updates run before any model

After a committed action advances world time, Native authority first processes due deterministic changes such as:

- Condition recovery or worsening;
- appointment completion / miss;
- train departure;
- closing time;
- legal deadline;
- evidence decay;
- Personal Anchor commitment consequences;
- fixed procedural transitions.

These do not require Model Tasks.

#### 6.38.2 Three Agenda step classes

Agenda progression uses three step classes.

**Deterministic Step**

The next action is already known and valid if its conditions still hold.

It executes without a model.

**Conditional Step**

A bounded authored rule chooses among known actions based on current state.

It executes without a model.

**Deliberative Step**

Several valid strategic actions remain and authored deterministic rules cannot reasonably select among them.

Only this class may request a bounded Model Task proposal.

The design target is that most Agenda progression remains deterministic / conditional.

#### 6.38.3 Model deliberation is trigger-based, not turn-based

A Deliberative Agenda becomes eligible because of meaningful triggers such as:

- elapsed time;
- blocker change;
- important new information;
- direct player interference;
- external institutional action.

Ordinary unrelated conversation or low-impact actions must not cause every institution to reconsider strategy.

#### 6.38.4 Relevance tiers

Background actors / institutions use coarse simulation relevance.

**Hot**

Directly connected to the current player situation, active Matter or near-term event.

Process fully.

**Warm**

Recently or indirectly relevant.

Process deterministic state normally; Deliberative work may enter background queue when budget allows.

**Cold**

Currently remote from player-relevant state.

Continue macro deterministic / conditional progression but do not normally invoke Model Tasks.

Cold simulation is low precision, not frozen.

#### 6.38.5 Cold simulation remains authoritative

When an institution is Cold, its authored Agenda state still advances through valid deterministic transitions.

Relevance returning later must reveal accumulated authoritative state rather than asking a model to invent what “probably happened” during the gap.

#### 6.38.6 Foreground model budget principle

Normal foreground play should minimize model calls.

The usual Scene should require one primary narrative generation path.

Do not create a separate model invocation for every visible NPC when one authorized turn-generation flow can represent the scene safely.

Exact call counts remain a Round 9 implementation choice.

#### 6.38.7 Background model budget principle

The normal background cost for an ordinary player action should be zero Model Tasks.

Background calls occur only when:

- a Deliberative Step is due;
- relevance / priority permits it;
- budget permits it.

Large time advances may make several Agendas eligible, but deterministic / conditional processing still happens first.

#### 6.38.8 World-advance batching

Large time advancement first catches up deterministic events.

Only then are unresolved Deliberative requests collected.

The scheduler applies:

- priority;
- relevance;
- deduplication;
- supersession where valid.

This prevents one downtime action from causing uncontrolled bursts of background generation.

#### 6.38.9 Perspective remains isolated during batching

Multiple Agenda decisions may be scheduled together for efficiency, but their Context Packages remain isolated.

Do not ask one model prompt to role-play several unrelated institutions with shared hidden information.

Batching is scheduling optimization, not perspective merging.

#### 6.38.10 Pending decisions may be superseded

A not-yet-committed Agenda decision may become obsolete when newer authoritative state changes its decision context.

Such pending work may use latest / supersede behavior.

Example:

a queued railway response to yesterday's private investigation may be replaced by a newer request after the player publicly releases the evidence.

#### 6.38.11 Committed events are never superseded

Once an action is committed as an Event or other hard state mutation, later task supersession cannot erase it.

Approved distinction:

- **Pending Decision** — may be superseded before commit;
- **Committed Event** — permanent historical occurrence unless a later Event explicitly changes its consequences.

#### 6.38.12 Same-tick decisions use an anchored snapshot

Agenda tasks eligible at the same logical time should reason from a defined anchored revision rather than racing against network completion order.

Flow:

1. capture baseline revision;
2. produce independent proposals;
3. validate proposals;
4. commit according to deterministic world ordering.

World history must not depend on which provider response arrived first.

#### 6.38.13 Deterministic commit ordering

When same-tick actions conflict, the Package defines stable ordering rules based on the world meaning of actions.

Potential categories may include:

1. immediate physical effects already underway;
2. formal legal / institutional submissions;
3. communication / publication;
4. downstream responses.

Exact priority taxonomy is deferred to technical design.

Within equal priority, a stable deterministic identifier or equivalent rule must resolve ordering.

#### 6.38.14 Stale proposals fail validation

A proposal that was valid against its anchored revision may become invalid after an earlier same-tick commit.

It must fail closed as stale / blocked rather than being reinterpreted into a new action.

The Agenda may enter a blocked state and reconsider at a later eligible opportunity.

Do not immediately recurse into repeated Model Task calls until one succeeds.

#### 6.38.15 Bounded reaction depth

One world-advance batch has a bounded reaction depth.

Direct consequences may trigger one limited layer of immediate institutional response, but indefinite reaction chains are deferred to later logical windows.

This prevents:

player action → institution response → another response → another response

from simulating an unbounded political cascade in one foreground turn.

Exact depth is deferred to Round 9.

#### 6.38.16 Background state is not automatically player-visible

An institution may take a secret action without creating a player notification.

The player learns background change only through legitimate information routes such as:

- observation;
- report;
- communication;
- newspaper;
- public record;
- informant;
- visible consequence.

Do not expose Agenda phase changes or hidden simulation logs as UI meta-information.

#### 6.38.17 Event-driven fast-forward

Long recovery, travel or downtime should not iterate every hour.

Fast-forward uses meaningful due times:

1. find the next relevant scheduled Event / deadline / Agenda trigger;
2. advance the canonical clock to that point;
3. process deterministic state;
4. handle any budget-approved deliberation;
5. continue to the next meaningful point.

Fast-forward processes the world; it does not pause obligations.

#### 6.38.18 Fast-forward does not bypass commitments

Skipping time still processes:

- rent or important financial obligations;
- Personal Anchor commitments;
- Claim Obligations;
- legal deadlines;
- institutional action;
- recovery;
- scheduled travel or hearings.

The player cannot avoid world consequences merely by requesting a long time skip.

#### 6.38.19 Background Model Tasks fail closed

If a background Model Task:

- times out;
- produces invalid output;
- loses provider availability;
- violates its Action Catalog,

no hard world mutation is committed.

The Agenda remains pending / blocked or uses an explicitly authored safe fallback.

Provider failure must never invent arbitrary world consequences.

#### 6.38.20 Foreground gameplay outranks background work

A delayed or failed Warm / Cold background decision must not block normal player interaction.

Foreground resolution and narration remain higher-priority work.

Background simulation catches up when valid opportunities return.

#### 6.38.21 Save / restore preserves accepted decisions

Accepted background proposals and their committed Events are part of authoritative history.

Save / restore must not cause an already-resolved Agenda to choose a different action simply because the model is invoked again.

Pending, uncommitted work may be safely resumed or regenerated only against its preserved anchor rules.

#### 6.38.22 Persist outcomes, not hidden reasoning

Deterministic replay requires preserving:

- task invocation identity where relevant;
- anchor revision;
- accepted proposal;
- resulting commands / Events;
- necessary diagnostics.

It does not require storing or reproducing private model reasoning or token-level generation.

The requirement is world-result consistency.

### 6.39 Round 6.7 decision

Approved:

- deterministic post-action world-advance order;
- deterministic / conditional / deliberative Agenda step classes;
- background AI triggered by meaningful state, not every player turn;
- Hot / Warm / Cold relevance tiers;
- authoritative low-precision Cold progression;
- foreground-first scheduling;
- zero-background-call default for ordinary actions;
- catch-up batching with priority / relevance / deduplication;
- perspective isolation during scheduling batches;
- pending decisions may supersede, committed Events may not;
- same-tick anchored snapshots and deterministic commit ordering;
- stale proposals fail closed;
- bounded reaction depth;
- secret background changes remain hidden until legitimately observed;
- event-driven fast-forward;
- time skipping does not bypass obligations;
- background Model Task failure fails closed;
- save / restore preserves accepted world outcomes;
- persist accepted proposal / command history rather than model reasoning.

Rejected:

- running every faction AI after every player message;
- world history determined by provider response race;
- infinite same-turn institutional reaction chains;
- cold institutions being frozen or retroactively invented on re-entry;
- fast-forward as a way to suspend world simulation;
- provider failure causing speculative fallback events;
- background tasks blocking foreground play;
- save reload re-rolling already accepted institutional decisions.

