# Original Occult Western Fantasy Game — Package Technical Design

## Responsibility

Owns Round 9: translation of the approved game/content design into current Atria Package contracts, data resources, lifecycle domains, information views, tasks, content resources, continuity, and frontend integration boundaries.

## Dependencies

- `index.md`
- `decisions.md`
- `content-architecture.md`
- `simulation.md`
- `gameplay.md`
- `player.md`
- `metaphysics.md`
- `platform-and-gameplay.md`

> **Current discussion:** Rounds 9–9.8 are approved. Round 9 is technically frozen; implementation staging continues in `implementation-staging.md`.

---

### 6.46 Approved top-level Package mapping — Round 9

The approved top-level architecture is:

**Package Data = definitions**

**Lifecycle Runtime = authoritative mutable state**

**Information Runtime = perspective / projection**

**Task Runtime = bounded AI reasoning**

**authority-first Package Turn + game logic = free-text player intent resolution**

**Narrator = post-authority rendering**

**Native Frontend = player-safe projections + authorized actions**

The Package should reuse current Atria `main` capabilities wherever possible and record a Core gap only when the approved behavior cannot be represented safely through current contracts.

#### 6.46.1 Package Data owns definitions, not live session truth

Package Data should hold stable authored definitions such as:

- Institutions;
- actor cores;
- important Locations;
- Case Kits;
- Anomaly Families;
- Claim Catalog;
- Canon Fragments;
- Origin / background options;
- Artifact templates;
- terminology and narrative-support resources.

Package Data answers **what kinds of things and rules exist**.

Whether a player currently owns a Claim, an Evidence item exists in custody, or an Agenda has advanced belongs to Lifecycle state.

#### 6.46.2 Hidden Canon is not generic Narrator Knowledge

Hidden Canon must not be placed into one generally retrievable knowledge source that Narrator or unrelated tasks can accidentally retrieve.

Public / learned knowledge may use Knowledge resources.

Deep Canon should remain behind structured Package Data / authority state and explicit disclosure rules until legitimately projected.

#### 6.46.3 Lifecycle carries the approved state domains

Current Lifecycle limits are sufficient for the fourteen approved logical state domains and reasonable scope-driven physical splitting.

The logical model remains:

- entities;
- events;
- institutional records;
- evidence;
- relations;
- beliefs;
- memories;
- matters;
- settlements;
- agendas;
- conditions;
- claims;
- player life;
- progression.

Round 9.5 may split some into multiple physical Lifecycle domains where session / world scope, retention or command authority requires it.

Domain count is not currently a Core gap.

#### 6.46.4 One canonical world clock maps directly to Lifecycle

Use one authoritative game world clock.

Scene / Day / Arc remain design / presentation scales.

Lifecycle Automations and Workflows handle:

- deadlines;
- recovery;
- appointments;
- Agenda triggers;
- legal processes;
- transport;
- evidence decay;
- other due transitions.

Do not create separate subsystem clocks merely because the platform permits them.

#### 6.46.5 Authority-first is the required ordinary Turn policy

Current `main` confirms that `authority-first` supports the approved gameplay direction.

For free-text player input:

1. `role.intent_resolver` runs before Narrator;
2. Package game logic / tools perform accepted authority changes;
3. each publication advances the revision anchor;
4. bounded Turn stages may then run;
5. Narrator runs after authority resolution;
6. `finalizeTurn` rejects Narrator-authored outcomes under this policy.

Therefore ordinary gameplay should not use `narrative-outcome` as its state-authority mechanism.

#### 6.46.6 Intent Resolver uses game verbs, never raw state patching

The intent resolver must be exposed only to validated gameplay operations.

Conceptual verbs include:

- observe;
- verify;
- interview;
- access;
- test;
- act;
- invoke Claim;
- publish;
- create Hypothesis;
- create Lead;
- commit Case disposition;
- spend Downtime;
- advance time.

The resolver may decide which operation best matches player intent.

The operation implementation decides what is valid and what authoritative state changes occur.

Do not expose a generic `patchState(path,value)` capability to the model.

#### 6.46.7 Outcome Packet is a projection artifact, not a new truth store

A resolved action may change:

- Event;
- Evidence;
- Relation;
- Condition;
- Matter;
- Institutional Record;
- clock;
- other authoritative state.

The Narrator-facing Outcome Packet should be a structured projection of the just-committed authoritative changes.

Do not create a permanent duplicate Outcome domain unless a later implementation need proves necessary.

#### 6.46.8 Task Runtime remains small

Expected AI task classes are limited.

Likely categories:

- Narrator — turn-blocking presentation;
- Case Reflection — interactive advisory;
- Claim / occult Advisor — interactive advisory;
- Agenda Deliberation — background bounded proposal;
- optional bounded document / public-text rendering where useful.

Do not create one Model Task per NPC.

#### 6.46.9 Background supersession must respect current Task authority rules

Current Task Runtime forbids `queuePolicy=latest` on authority-producing Tasks.

Therefore Round 6.7 supersession maps to state/request management:

- pending decision requests may be marked superseded before authority acceptance;
- a new anchored decision may then be scheduled;
- accepted authority / committed Events are never superseded.

Do not try to configure confirmed authority-producing tasks as replaceable latest work.

#### 6.46.10 Investigation graph uses a derived index

The authoritative graph spans several logical domains.

Do not merge those authorities into one giant graph domain solely for projection convenience.

Use a derived, rebuildable graph index with stable refs such as:

- nodeId;
- nodeKind;
- display-safe / projection-safe fields;
- edge refs.

The graph index is not a source of World Truth and is not raw model-writeable.

It serves Information bounded-graph projection.

#### 6.46.11 Player / Narrator / specialist Task views fit current Information limits

The fixed global views required for:

- player display;
- Narrator;
- Case Reflection;
- Claim Advisor;
- Agenda Deliberation;
- other small specialist tasks

fit comfortably within the current 16-view Information limit.

The pressure lies specifically in per-NPC private Actor views.

#### 6.46.12 Actor-private perspective remains an unresolved technical pressure

Current Information Actor Views are statically bound to a concrete `actorId`.

The current global View limit is 16.

The approved actor content scale cannot therefore assign one static private View to every persistent Tier A / Tier B Actor.

Approved safety constraint:

**do not solve this by giving a shared AI task unrestricted access to all actors' private Beliefs / Memories.**

Round 9.5 must determine whether actor interaction can safely use Package game-logic tools to project one current target's perspective dynamically.

If not, this becomes a genuine Core gap for dynamic actor-bound Information projection.

#### 6.46.13 Continuity is not required merely because it exists

Normal campaign persistence already uses Native Session / revisions / saves.

Do not declare Player Continuity for the initial implementation unless the design explicitly requires cross-session or cross-campaign transferable state.

#### 6.46.14 Frontend technical boundary

Native Frontend receives:

- player-safe display projections;
- authorized action interfaces.

It must not read unrestricted backend Lifecycle domains for convenience.

Visual design remains outside this technical Plan.

#### 6.46.15 Current gap status

**Confirmed reusable without Core change:**

- Package Data;
- Lifecycle domain capacity;
- canonical clock;
- Automation / Workflow;
- authority-first free-text turn;
- post-authority Narrator;
- bounded background Task Runtime;
- belief / memory / open-loop information semantics;
- bounded graph support through a derived index;
- immutable revision / save / retry authority.

**Needs Round 9.5 verification / design:**

1. safe dynamic actor-private perspective for many persistent NPCs;
2. typed multi-domain gameplay transactions through the Package-facing authority seam;
3. exact derived graph-index publication strategy.

At this point no additional Core gap is assumed.

### 6.47 Round 9 decision

Approved:

- Package Data = definitions;
- Lifecycle = mutable authority;
- Information = perspective;
- Task Runtime = bounded AI reasoning;
- authority-first = ordinary free-text gameplay policy;
- Narrator remains downstream of committed state;
- restricted game-verb Action API instead of raw model patching;
- Outcome Packet as derived Turn projection;
- small shared task set rather than per-NPC Model Tasks;
- state-level supersession before authority rather than `latest` confirmed tasks;
- derived graph index instead of merging world authorities;
- no initial Player Continuity requirement;
- player-safe frontend projection boundary;
- gap policy based only on genuine platform inability.

Rejected:

- Narrative Outcome as ordinary game-state authority;
- hidden Canon in generic Narrator-retrievable Knowledge;
- raw model state patching;
- one Model Task per persistent NPC;
- one monolithic graph authority domain;
- declaring platform gaps merely because Package implementation is non-trivial.

### 6.48 Approved Lifecycle domain mapping and restricted Action API — Round 9.5

Round 9.5 maps the approved logical authorities into a concrete Package-facing runtime shape and identifies one required v1 Core bridge.

#### 6.48.1 Physical authority layout

The preferred physical authority layout is approximately:

| Physical authority | Scope | Logical responsibility |
| --- | --- | --- |
| Game World Event Journal | World | authoritative Events / action history |
| `entities` | World | persistent Entity identity/current authoritative state |
| `institutional_records` | World | civil / court / Church / company / property formal records |
| `evidence` | World | Evidence units, provenance, custody and integrity |
| `relations` | World | kinship, employment, ownership, membership, possession and other real relations |
| `beliefs` | World | actor/institution Testimony, Finding, Hypothesis and interpretation records |
| `memories` | World | durable Actor / institutional Memory |
| `world_matters` | World | institutional/world Cases, obligations and pending procedures |
| `settlements` | World | formal rulings / dispositions / Settlements |
| `agendas` | World | autonomous institution / Major Actor Agenda state |
| `conditions` | World | Injury and persistent gameplay-relevant Conditions |
| `claims` | World | formal supernatural Claim instances |
| `player_matters` | Session | player Cases, Leads, personal commitments |
| `player_life` | Session | ordinary player identity, Anchors, practice and limited finances |
| `progression` | Session | Breach Imprints, Seeds, Unsettled and Investiture progression |
| `investigation_index` | derived Session read model | Case Graph node/edge projection; not authority |

This remains comfortably below current Lifecycle domain limits.

The derived investigation index may be stored in a Lifecycle-compatible publication surface if required by Information Runtime, but it is rebuildable and must never become a source of Truth.

#### 6.48.2 Event Journal owns occurrence history

Do not duplicate all world Events into a second general `events` Lifecycle domain merely to match the logical model.

The existing Game World Event Journal is the preferred occurrence-history authority.

Other domains hold current authoritative records whose mutations reference Events where useful.

#### 6.48.3 Intent-resolver command vocabulary

The authority-first resolver receives only high-level, author-declared verbs.

Approved initial verb families:

- `observe`;
- `verify`;
- `interview`;
- `access`;
- `test`;
- `intervene`;
- `invoke_claim`;
- `publish`;
- `create_hypothesis`;
- `create_lead`;
- `settle_matter`;
- `downtime`;
- `advance_time`.

`act` is rejected as too broad; `intervene` must declare method, target and objective.

No verb maps to raw state patching.

#### 6.48.4 Verb authority categories

**Pure / bounded reads**

Examples:

- inspect player-known Evidence;
- inspect legally visible record metadata;
- inspect current Claim / Condition state.

These do not mutate authority.

**Intent / perspective writes**

Examples:

- `create_hypothesis`;
- `create_lead`.

These write only player-bound Belief / Matter state after validation.

**Authority transactions**

Examples:

- interview;
- verify;
- access;
- intervene;
- invoke Claim;
- publish;
- settle Matter;
- downtime;
- time advance.

These may cause several authoritative effects and therefore require the transaction seam defined below.

#### 6.48.5 Resolution execution

A risky verb builds an ephemeral Resolution Frame from:

- Capability;
- Position;
- Preparation;
- Opposition;
- Stakes.

It resolves:

- Automatic;
- Impossible;
- Uncertain.

Uncertain actions map to the approved qualitative Risk Tier and use deterministic-seeded bounded Fortune.

Resolution Frames are process state, not a permanent Domain.

The accepted Fortune result becomes part of the committed Event / resulting authority so narration retry cannot reroll it.

#### 6.48.6 One required Core prerequisite — Authority Transaction Bridge

Current `main` declarative Game World commands emit World Events, while Lifecycle `app.command` mutation is a separate typed seam.

The approved game requires one player action to be able to atomically change several authorities.

Therefore v1 requires a Core-supported **Authority Transaction Bridge**.

The bridge must allow an author-declared game verb to:

1. read only explicitly granted authoritative / player-safe records needed for validation;
2. validate the command against current revision and world rules;
3. produce zero or more World Events;
4. execute zero or more predeclared typed Lifecycle `app.command` effects;
5. optionally advance the declared canonical world clock;
6. update / publish derived indexes;
7. commit all accepted effects under one revision / action receipt;
8. fail closed with no partial world mutation.

The bridge must not expose arbitrary namespace patching, dynamic domain names or generic JSON Patch to the model.

#### 6.48.7 Resolver observation belongs to the same bridge

The current Host authority-first path does not inject Package-defined observation projectors into `createGameLlmRuntime`.

Therefore the Authority Transaction Bridge must also expose a bounded **intent observation** assembled from player-safe / action-relevant authority.

This observation exists so the resolver can map natural references such as:

- “Arthur”;
- “the death certificate”;
- “that Eastbank file”

to stable candidate refs without receiving hidden World Truth.

The resolver observation is not an NPC-private view and must not contain private actor Beliefs / Memories unless the selected verb is itself authorized to query them during validation after the resolver has selected a target.

This observation requirement is part of the same Core bridge, not a separate general information bypass.

#### 6.48.8 Transaction example

For an interview action such as showing an Evidence item to a target and asking a question, one accepted transaction may create:

- a Communication Event;
- a source-attributed Testimony Belief;
- a target Memory update;
- a player Finding / Matter update;
- Evidence / relation references;
- elapsed world time;
- Operational Exposure.

All accepted effects commit as one revision.

No intermediate partially updated world may be visible.

#### 6.48.9 NPC interaction in v1 does not require per-NPC Model Tasks

Routine NPC conversation / reaction uses authority state plus social-resolution rules.

Flow:

1. resolver selects `interview` or another social verb;
2. transaction validation reads only the target actor's permitted Beliefs / Memories / Relations / Constraints;
3. deterministic / bounded rules decide what can be revealed, refused or changed;
4. the transaction commits an observable actor-response Event and any legitimate perspective changes;
5. Narrator renders the approved visible response into natural dialogue.

The Narrator does not receive the target's complete private cognitive state.

This avoids the current 16-View per-actor scaling problem for v1.

#### 6.48.10 Dynamic actor projection is a future capability, not a v1 blocker

A future feature may add invocation-time dynamic actor-bound Information projection for complex autonomous Major Actor model reasoning.

It is not required for v1 because ordinary NPC interaction is resolved through bounded authority rules and observable response Events.

Do not weaken perspective isolation merely to provide every NPC with a dedicated model.

#### 6.48.11 Generated-content promotion

Tier C / incidental generated content remains non-authoritative until promotion is required.

Promotion operations create stable authority such as:

- Entity;
- Relation;
- initial permitted Belief / Memory state;
- Location or Evidence entry where applicable.

Promotion is itself a validated transaction.

Once promoted, identity may not be casually regenerated in later turns.

#### 6.48.12 Derived investigation index publication

The transaction layer knows which stable refs were changed.

After accepted authority changes, it updates or rebuilds the relevant portion of `investigation_index`.

The index may contain projection-oriented node/edge records such as:

- nodeId;
- nodeKind;
- safe label / metadata refs;
- from;
- to;
- relation kind;
- epistemic / player-known visibility where required.

The index cannot author Truth and is never directly model-writeable.

Player Hypothesis links must be marked as perspective-derived rather than Canon graph relations.

#### 6.48.13 Outcome Packet construction

After transaction commit, construct the Narrator-facing Outcome Packet from:

- accepted verb / objective;
- committed World Events;
- typed authority changes relevant to the player-visible result;
- elapsed time;
- structured consequence families;
- unresolved uncertainty.

It is a transient post-commit projection.

Do not duplicate it into permanent truth state.

#### 6.48.14 Package Data initialization

Static Package Data provides initial definitions / seed material for:

- institutions;
- actor cores;
- location cores;
- Claims and anomaly rules;
- Case Kits;
- Canon Fragments;
- starting records.

Lifecycle / World initialization materializes only the state required at campaign start.

Do not eagerly instantiate every generated population member or optional Case instance.

### 6.49 Round 9.5 decision

Approved:

- approximately fifteen physical Lifecycle authority domains plus the Game World Event Journal and derived investigation index;
- Game World Event Journal as occurrence history instead of duplicate general Event domain;
- bounded intent-resolver verbs;
- `intervene` replacing broad `act`;
- Resolution Frame / Fortune as ephemeral transaction machinery;
- one v1 Core prerequisite: Authority Transaction Bridge;
- player-safe intent observation included in that bridge;
- atomic World Event + typed Lifecycle effects + clock + derived-index commit;
- no arbitrary patch API;
- v1 NPC interaction through authority rules + observable response Events;
- dynamic per-NPC model perspective deferred rather than weakening information isolation;
- generated Tier C content promoted through validated transactions;
- derived graph index refreshed downstream of authority writes;
- Outcome Packet constructed from committed changes;
- lazy materialization from Package Data definitions.

Rejected:

- sequential best-effort multi-domain commits for one player action;
- exposing Lifecycle domains directly as arbitrary resolver tools;
- per-NPC Model Task / static View for all persistent actors;
- shared-model access to every actor's private cognition;
- using the derived graph index as a source of Truth;
- persisting Resolution Frame / Outcome Packet as duplicate shadow authority.

### 6.50 Approved Information Views and Task Runtime mapping — Round 9.6

v1 deliberately uses a small AI-facing projection surface.

The design target is approximately:

- seven disclosure-safe Information Sources;
- five fixed Information Views;
- two bounded investigation Graphs;
- four core Model Task classes;
- zero ordinary per-NPC Model Tasks.

Authority domains containing hidden data are not directly exposed to player / Narrator contexts unless the entire domain is safe for that audience.

#### 6.50.1 Disclosure-safe read models

Because Information application Sources do not provide arbitrary per-record `playerKnown` filtering, player/Narrator projections must not subscribe directly to mixed hidden/public authority domains.

The Authority Transaction Bridge maintains rebuildable, downstream read models such as:

- `scene_projection` — currently observable scene facts;
- `player_status_projection` — player Claims, Anchors, Conditions, identity/access information that is actually player-visible;
- `player_epistemic_projection` — player-known Findings, Hypotheses and Testimony;
- `investigation_nodes`;
- `investigation_edges`.

`player_matters` is already session-private and may be exposed directly where its complete contents are player-safe.

Derived projection state is not a source of Truth and must be rebuildable.

#### 6.50.2 v1 Information Sources

Preferred v1 Sources:

| Source | Semantic | Backing data |
| --- | --- | --- |
| `scene.truth` | `truth` | `scene_projection` |
| `player.status` | `truth` | `player_status_projection` |
| `player.epistemic` | `belief` | `player_epistemic_projection` |
| `player.matters` | `open_loop` | `player_matters` |
| `investigation.nodes` | `truth` | `investigation_nodes` |
| `investigation.edges` | `truth` | `investigation_edges` |
| `player.memory` | `memory` | disclosure-safe player Memory subset |

Do not directly expose full:

- actor Beliefs;
- institutional records;
- institutional Agendas;
- complete Evidence authority;
- complete Claims authority

to player/Narrator views.

#### 6.50.3 Player overview View

`player.overview`:

- audience: `player`;
- exposure: display only;
- Sources: `player.status`, `player.matters`;
- no Context exposure.

Budget direction: approximately 64 items / 16k characters.

This is an information contract, not a UI layout contract.

#### 6.50.4 Player investigation View

`player.investigation`:

- audience: `player`;
- exposure: display only;
- Sources: investigation nodes/edges, player epistemic state and player Matters;
- bounded graph: `player.case_graph`.

Budget direction: up to 128 items / 32k characters where needed.

Because player Views cannot enter model Context under current contract, this view is safe as a rich display surface.

#### 6.50.5 Narrator Context View

`narrator.context`:

- audience: `narrator`;
- exposure: context;
- Sources: `scene.truth`, `player.status`, relevant `player.epistemic`, relevant open player Matters;
- bounded recent Timeline history supplied through normal Context policy;
- no complete World state;
- no unrestricted Knowledge;
- no automatic full Memory injection.

Budget direction: approximately 64 items / 20k characters.

The Narrator additionally receives the current Authority Transaction Receipt / Outcome Packet as Host-owned Turn input.

#### 6.50.6 Case Reflection Context View

`case.reflection.context`:

- audience: `task`;
- task: Case Reflection;
- exposure: context;
- Sources: player-known investigation nodes/edges, player epistemic state and player Matters;
- bounded graph: `reflection.case_graph`;
- no hidden World Truth / private actor cognition.

Budget direction: up to 128 items / 32k characters.

Reflection can reason deeply over known evidence without receiving the answer key.

#### 6.50.7 Claim Advisor Context View

`claim.advisor.context`:

- audience: `task`;
- task: Claim Advisor;
- exposure: context;
- Sources: `player.status` plus narrowly relevant player epistemic state;
- `knowledge = true` only for player-acquired / player-legible occult Knowledge bindings;
- no automatic Memory exposure.

Budget direction: approximately 32 items / 12k characters.

Mechanical diagnosis does not authorize disclosure of hidden story causes.

#### 6.50.8 Agenda Deliberation uses bounded input, not a broad Information View

Institutional Agenda Deliberation should receive a scheduler/bridge-built input payload containing only:

- institution identity;
- current Agenda;
- blockers;
- legitimately known records / Beliefs;
- current time;
- permitted Action Catalog.

The Task does not need:

- World Context;
- Timeline history;
- generic Knowledge;
- a global Information projection.

This avoids leaking other institutions' private state and saves a static View.

#### 6.50.9 Two bounded investigation Graphs

Preferred Graph declarations:

**`player.case_graph`**

For player display and exploration of already-known investigative relations.

**`reflection.case_graph`**

For Case Reflection reasoning over the same disclosure-safe node/edge family with its own depth / edge budget.

Neither graph may contain hidden canonical nodes simply because those nodes exist in backend authority.

#### 6.50.10 Core Task set

**Narrator**

- execution: `turn_blocking`;
- result: presentation;
- Context: Host Outcome input + limited history + narrator projection;
- no authority outcome;
- FIFO / ordinary turn ordering.

**Case Reflection**

- execution: `interactive`;
- result: advisory proposal with no Apply Command;
- Context: input + projection;
- `queuePolicy=latest` is acceptable because output has no authority.

**Claim Advisor**

- execution: `interactive`;
- result: advisory proposal with no Apply Command;
- Context: input + projection + permitted Knowledge;
- `queuePolicy=latest` is acceptable.

**Agenda Deliberation**

- execution: `background`;
- result: authority-producing bounded Agenda decision;
- preferred sink: declared App Command into Agenda Intent state;
- Context: explicit bounded input payload only;
- FIFO, never `latest`.

The Agenda Task records intent, not direct world execution.

Deterministic scheduler / transaction authority later validates and performs any real-world action.

#### 6.50.11 No v1 document-rendering core Task

Artifact semantics and rendered text remain separated.

Most formal documents should use deterministic templates or bounded presentation-time wording from Semantic Payload.

Do not add a permanent document-rendering Model Task to the v1 core task set unless implementation proves a concrete need.

#### 6.50.12 Knowledge / Memory exposure defaults

Default to closed.

Preferred v1 direction:

- Narrator: `knowledge=false`, automatic Memory off;
- Reflection: `knowledge=false`, automatic Memory off;
- Claim Advisor: player-acquired occult `knowledge=true`, automatic Memory off;
- Agenda Deliberation: no broad Information Knowledge/Memory channel.

Game-owned actor Memories remain authoritative data even when model automatic-memory injection is disabled.

#### 6.50.13 NPCs consume zero static Context Views in v1

Ordinary Tier A / Tier B interaction does not allocate Information Actor Views.

Private actor state is read only inside the validated social/action transaction.

The committed transaction produces the player-observable response state consumed by Narrator.

This keeps v1 within Information View limits without weakening perspective isolation.

#### 6.50.14 Authority-to-projection boundary is mandatory

Approved hard rule:

**Authority → disclosure-safe derived projection → Information View → AI/UI**

Do not use:

**mixed hidden authority Domain → AI prompt → instruction saying what not to reveal**

Direct authority-to-View wiring is allowed only when the complete Source is safe for that audience.

#### 6.50.15 Transaction Receipt / Outcome Packet is Host-owned Turn input

The Authority Transaction Bridge returns a bounded current-turn receipt containing concepts such as:

- accepted verb;
- objective;
- resolved outcome;
- committed Event refs;
- player-visible consequence summaries;
- elapsed ticks;
- known unresolved uncertainty.

The Host supplies this to the post-authority Narrator as ephemeral Turn input.

It is:

- not World Truth storage;
- not a Lifecycle shadow domain;
- not model-editable;
- not retained merely for Narrator convenience.

Long-term facts remain in Event/Lifecycle authority.

### 6.51 Round 9.6 decision

Approved:

- disclosure-safe read models between mixed authority and AI/UI;
- approximately seven v1 Information Sources;
- five fixed Views: player overview, player investigation, narrator, reflection, advisor;
- two disclosure-safe bounded investigation Graphs;
- Agenda Task using explicit bounded input rather than broad Information projection;
- four core Model Task classes;
- no permanent v1 document-rendering Task;
- Knowledge / Memory exposure closed by default;
- zero ordinary per-NPC static Views;
- mandatory Authority → safe projection → View boundary;
- Host-owned ephemeral transaction receipt as Narrator Turn input;
- no additional v1 Core gap beyond the approved Authority Transaction Bridge.

Rejected:

- subscribing Narrator/player directly to mixed hidden authority domains;
- using prompt instructions as the primary anti-leakage mechanism;
- giving Agenda Deliberation whole World/History context;
- per-NPC static Views;
- persisting `latest_outcome` merely for Narrator consumption;
- adding Model Tasks solely because a document needs natural wording.

### 6.52 Approved Package Data layout and exact Core bridge contract — Round 9.7

Round 9.7 freezes the Package Data resource strategy and the minimum Core surface required for atomic authority transactions.

#### 6.52.1 Package Data resource strategy

Use many small, structured resources rather than one giant `world.json`.

Preferred resource families include:

**World definitions**

- `defs.geography.districts`;
- `defs.geography.locations`;
- `defs.institutions`;
- `defs.actors.major`;
- `defs.actors.supporting`;
- `defs.origins`;
- `defs.artifacts.templates`;
- `defs.terminology`.

**Supernatural definitions**

- `defs.anomalies`;
- `defs.claims.primitives`;
- `defs.claims.seeds`;
- `defs.claims.archetypes`.

**Signature Cases**

- `cases.signature.second_death`;
- `cases.signature.dual_address`;
- `cases.signature.impossible_burial`;
- `cases.signature.dead_railway`;
- `cases.signature.self_signing_company`;
- `cases.signature.pre_accident_claims`;
- `cases.signature.tomorrows_headline`;
- `cases.signature.eastbank_hearing`.

**Reusable Case patterns**

- `cases.patterns.identity`;
- `cases.patterns.property`;
- `cases.patterns.insurance`;
- `cases.patterns.family`;
- `cases.patterns.industry`;
- `cases.patterns.burial`.

**Eastbank Canon**

- `canon.eastbank.index`;
- `canon.eastbank.registry`;
- `canon.eastbank.church`;
- `canon.eastbank.insurance`;
- `canon.eastbank.railway`;
- `canon.eastbank.workers`;
- `canon.eastbank.academy`;
- `canon.eastbank.settlement`;
- `canon.eastbank.deep`.

**Bootstrap**

- `seed.bootstrap`;
- `seed.opening.second_death`.

Exact names may receive minor implementation cleanup, but the modular responsibility split is approved.

#### 6.52.2 Resource size direction

Current Core permits Package Data resources up to 2 MiB and up to 256 declared resources.

The Package should stay well below those limits.

Preferred authoring targets:

- normal resource: preferably below 256 KiB;
- large Case / Canon resource: preferably below 512 KiB;
- exceed those soft limits only with concrete justification;
- keep hot Package Data total in the low-megabyte range.

Structured assertions / references are preferred over long prose.

#### 6.52.3 Package Data versus Knowledge

Use Package Data for:

- immutable definitions;
- hidden Canon;
- Case structures;
- Claim / anomaly rules;
- actor / institution cores;
- bootstrap seed definitions.

Use Knowledge for legitimately retrievable informational material such as:

- public legal / historical knowledge;
- public religious doctrine;
- player-acquired occult texts;
- other sources intentionally available to Knowledge retrieval.

Do not place hidden Canon in generally retrievable Knowledge.

#### 6.52.4 Runtime design notes remain outside Package Data

Author-only design notes, symbolism, intended reveal cadence and similar metadata must remain outside runtime resources.

They are not valid runtime Context.

#### 6.52.5 v1 does not require Content extension points

Do not declare ContentRuntime extension points / addon architecture merely because the platform supports them.

v1 should first produce one complete, validated Base Package.

Shareable Case / content packs may be designed later.

#### 6.52.6 New capability: authority-transaction@1

Do not overload or version-bump ordinary `action@2` for this purpose.

Add a separate optional Experience capability:

`authority-transaction@1`

Reason:

the new behavior composes Game World authority, Lifecycle authority, world clock, derived projections and current-turn receipt publication.

It is materially different from ordinary frontend typed Action invocation.

Existing Packages remain unaffected when the capability is absent.

#### 6.52.7 Optional authorityRuntime contract

ExperienceContract gains an optional `authorityRuntime` declaration associated with `authority-transaction@1`.

Rules:

- capability absent → `authorityRuntime` absent;
- capability required/present → `authorityRuntime` required;
- the runtime declares bounded observation / transaction policy, not game-specific story rules;
- ordinary Package game rules remain in pinned declarative game logic.

A global ExperienceContract schema-version bump is not required solely for this addition if strict optional-field/capability negotiation can preserve backwards compatibility.

#### 6.52.8 Declarative game logic schemaVersion 3

Add a backwards-compatible Game Logic schema version supporting:

- existing commands;
- reducers;
- rules;
- interpretations;
- new `transactions` declarations.

Existing schemaVersion 1 / 2 logic remains supported.

A Transaction is an author-declared game verb, not a generic script.

#### 6.52.9 Transaction declaration responsibilities

A Transaction may declare:

- stable transaction / verb ID;
- input schema;
- intent-resolver exposure metadata;
- private read grants;
- validators;
- deterministic / bounded Resolution policy;
- World Event templates;
- typed Lifecycle `app.command` effects;
- optional canonical clock advance;
- optional workflow transition;
- derived publication declarations;
- safe receipt projection.

Domain / command targets are statically declared by Package logic.

The model cannot choose arbitrary domain IDs or command IDs.

#### 6.52.10 Effect kinds

v1 permitted transaction effect families:

- `world.event`;
- `app.command`;
- `clock.advance`;
- optionally `workflow.transition`.

Explicitly forbidden:

- generic state patch;
- namespace write;
- JSON Patch;
- eval / arbitrary script;
- dynamically named commands / domains.

#### 6.52.11 Private read grants

Transaction validation may read only statically declared authority families / selectors.

Typical grants include:

- target Entity fields;
- target Actor Beliefs / Memories relevant to selected interaction;
- player↔target Relations;
- explicit Evidence refs supplied by args;
- current Conditions / Claims needed for validation.

Private transaction reads are not automatically disclosed to the intent resolver or Narrator.

#### 6.52.12 Safe intent observation

`authorityRuntime` declares a bounded intent observation surface built only from disclosure-safe player-facing read models such as:

- scene projection;
- player status projection;
- player epistemic projection;
- player Matters;
- player-known investigation nodes.

The intent resolver uses this to map natural language to stable refs.

It must not receive hidden World Truth or private actor cognition.

#### 6.52.13 Execution pipeline

The Core transaction path should behave conceptually as:

1. resolve selected declared verb + args;
2. capture expected revision;
3. construct declared private read set;
4. validate references / access / invariants;
5. build Resolution Frame if required;
6. resolve deterministic bounded Fortune where required;
7. build a bounded typed effect plan;
8. validate every effect against a private candidate;
9. apply all World / Lifecycle / clock effects to the private candidate;
10. update declared derived read models / indexes;
11. produce a player-safe transaction receipt;
12. publish exactly once through Session revision CAS / action receipt.

Any failure before publication rejects the whole transaction.

No partial authority mutation is visible.

#### 6.52.14 Reuse existing Core authority machinery

The bridge should reuse rather than replace:

- Game World reducers;
- Lifecycle `prepareLifecycle()` validation / mutation;
- clock validation;
- Session revision CAS;
- Action receipt / idempotency semantics;
- deterministic RNG;
- Information state validation.

The new capability is primarily an atomic composition / safe-observation seam.

#### 6.52.15 Transaction bounds

The bridge must impose hard bounds.

Initial design targets:

- up to 16 read grants;
- up to 16 World Events;
- up to 24 Lifecycle App Commands;
- up to one canonical clock advance;
- up to 32 total authority effects;
- bounded receipt size, target approximately 32 KiB;
- bounded intent observation, target approximately 64 items / 16 KiB.

Exact numeric limits may be adjusted during Core implementation if equivalent or stricter boundedness is preserved.

#### 6.52.16 Safe transaction receipt

The transaction returns a Turn-local receipt containing concepts such as:

- transaction ID;
- verb;
- anchor revision ID;
- committed revision ID;
- resolved outcome;
- elapsed ticks;
- committed Event refs;
- changed safe refs;
- player-visible consequences;
- known unresolved uncertainty.

Receipt projection is explicitly authored / validated.

Core must not summarize every changed private record for Narrator automatically.

#### 6.52.17 Receipt lifetime

The safe transaction receipt is current-turn Host state.

It is passed to post-authority Narrator generation and then discarded as a convenience object.

Durable history remains available through:

- committed Events;
- Lifecycle authority records;
- Action receipt;
- Session revision history.

Do not create a permanent Outcome domain.

#### 6.52.18 Derived publication is part of the atomic candidate

Disclosure-safe read models and investigation index updates caused by the transaction must be prepared before the single CAS publication.

Narrator / frontend must not observe a revision where authority changed but its declared safe projection is still stale.

#### 6.52.19 Authority Runtime scope

The v1 Authority Runtime has exactly three product responsibilities:

1. **safe intent observation**;
2. **atomic typed authority composition**;
3. **safe current-turn receipt publication**.

It does not own:

- NPC personality;
- Case design;
- Claim rules;
- Agenda strategy;
- UI;
- general memory;
- narrative generation.

Those remain Package responsibilities.

### 6.53 Round 9.7 decision

Approved:

- modular Package Data resource layout rather than giant JSON;
- approximately 25–35 structured Data Resources as an initial target;
- soft per-resource budgets far below the 2 MiB Core limit;
- hidden Canon in Package Data rather than generic Knowledge;
- no v1 Content extension-point requirement;
- separate `authority-transaction@1` capability instead of overloading `action@2`;
- optional `authorityRuntime` contract tied to that capability;
- declarative Game Logic schemaVersion 3 with author-declared Transactions;
- static read grants / effect targets;
- four bounded transaction effect families;
- private authority reads separated from resolver/Narrator disclosure;
- player-safe intent observation;
- private-candidate validation followed by one Session CAS publication;
- reuse of existing World/Lifecycle/clock/revision/idempotency machinery;
- hard transaction work / receipt / observation bounds;
- safe Turn-local transaction receipt;
- atomic derived projection publication;
- narrowly scoped Authority Runtime responsibilities.

Rejected:

- one giant world resource;
- placing hidden Canon in broadly retrievable Knowledge;
- designing addon/content-extension architecture before v1;
- changing `action@2` into a cross-authority general mutation system;
- arbitrary JSON/state patch effects;
- dynamic model-selected authority targets;
- exposing private transaction reads to Narrator by default;
- committing authority before safe derived projections are ready.

### 6.54 Approved Technical Freeze / Core Gap Gate — Round 9.8

Round 9 is technically frozen against `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.

The only blocking v1 Core prerequisite is the previously approved `authority-transaction@1` capability.

No second v1 Core gap is required for NPC perspectives, Agenda deliberation, Package Data scale, bounded investigation graphs, frontend consumption, save/branch authority or deterministic Fortune.

#### 6.54.1 Prepare authority before narration, publish only after narration succeeds

The final authority-first flow is refined as:

1. resolve player intent to a declared Transaction;
2. prepare the complete authority result inside a private candidate;
3. resolve deterministic Fortune and all typed effects;
4. prepare disclosure-safe derived projections;
5. create an immutable safe transaction receipt / Outcome Packet;
6. invoke Narrator against the frozen candidate + safe receipt;
7. if Narrator succeeds, publish authority changes + action receipt + assistant message in one final Session CAS;
8. if Narrator fails, publish nothing.

Approved principle:

**resolve first does not mean publish first.**

Narrator remains downstream of a mechanically frozen result while provider failure cannot leave a half-committed world with no completed assistant turn.

#### 6.54.2 Narrator failure is zero mutation

If Narrator generation, route fallback or final provider delivery fails before finalization:

- no World Event is committed;
- no Lifecycle authority mutation is committed;
- no clock advance is committed;
- no derived projection is committed;
- no final Action receipt is committed.

A retry may re-run the Turn from the same authoritative revision.

#### 6.54.3 Fortune seed must survive provider retry

Bounded Fortune must not depend on Narrator provider response, model retry timing or regenerated prose.

The transaction RNG identity should be derived from stable authority inputs such as:

- Package / Package version;
- source player-turn identity / anchored revision;
- stable transaction ordinal / verb identity.

Equivalent stable identities are acceptable.

The requirement is that a provider retry of the same unresolved Turn cannot silently reroll mechanical reality.

#### 6.54.4 Branch Retry and Re-narrate are distinct

Native Retry Reply currently forks from the preceding coherent user-message boundary.

Therefore it is treated as:

**Branch Retry — alternate world branch / new Turn execution.**

It may legitimately produce different future state.

A future **Re-narrate / Restyle** capability, if provided, must:

- reuse already committed authoritative outcome;
- never rerun Intent Resolver;
- never rerun Resolution;
- never rerun Fortune;
- never change committed Events.

v1 does not require Re-narrate.

Do not wire a prose-only “regenerate” affordance to a full world retry while presenting it as merely stylistic.

#### 6.54.5 Typed UI invokes the same Authority Transaction

Current ordinary Native Frontend `action.invoke` targets one fixed Lifecycle App Command.

Complex gameplay actions such as:

- Case Settlement;
- Downtime;
- Claim invocation;
- multi-effect investigation action

must use the same declared Authority Transaction as free-text intent.

The new capability therefore supports both:

- intent-resolver transaction selection;
- fixed typed frontend transaction binding.

Frontend bindings select a statically declared Transaction and provide only its validated input args.

They cannot select arbitrary dynamic transaction IDs.

#### 6.54.6 Derived Publication Hook applies beyond player transactions

Disclosure-safe projections can become stale because of:

- player Transactions;
- Condition recovery;
- Agenda action;
- deadline / Automation;
- Workflow transition;
- other Lifecycle authority changes.

Therefore `authorityRuntime` must provide a unified **Derived Publication Hook** for any authority publication that affects declared safe projections.

This hook:

- recomputes or incrementally updates declared derived read models;
- runs before final Session publication;
- remains deterministic / bounded;
- is not a new source of Truth.

Background Lifecycle changes do not need to be artificially wrapped as player Transactions merely to refresh projections.

#### 6.54.7 Agenda Deliberation requires no additional Core gap

The approved flow remains:

Lifecycle due event
→ bounded background Agenda Task
→ declared App Command writes Agenda Intent
→ deterministic scheduler validates current state
→ real-world action, when required, uses Authority Transaction.

The AI records bounded intent; it does not directly create external institutional facts.

Existing Task / Lifecycle machinery is sufficient.

#### 6.54.8 NPC interaction requires no v1 dynamic Actor View

v1 retains:

- zero ordinary per-NPC Model Tasks;
- zero required per-NPC Information Views.

Private Belief / Memory / Relation reads occur only inside declared transaction validation.

The committed observable response is what Narrator receives.

Dynamic actor-bound model perspectives remain a future enhancement, not a v1 blocker.

#### 6.54.9 Package Data remains within current limits

The approved 25–35-resource target is far below current:

- 256 Package Data resource limit;
- 2 MiB single-resource hard limit.

The project keeps its stricter authoring soft budgets.

No Package Data Core change is required.

#### 6.54.10 Frontend requires no second Core gap

The frontend needs only:

- player-safe projections;
- ordinary fixed Lifecycle typed actions where sufficient;
- fixed Authority Transaction invocation for cross-authority gameplay actions;
- interactive advisory Tasks;
- Composer / narrative turn flow.

Visual design remains delegated.

No direct backend-domain frontend access is approved.

#### 6.54.11 Core implementation order

`authority-transaction@1` must be implemented, tested and merged into `main` before formal Package implementation begins.

Do not build Package workarounds against the missing seam.

Once Core is integrated, Package implementation rebases / syncs to the verified new `main` baseline.

#### 6.54.12 Blocking Core verification gates

The Core prerequisite is complete only when tests verify at minimum:

1. one Transaction may prepare World + multiple Lifecycle-domain effects + canonical clock change;
2. any invalid effect causes zero published mutation;
3. intent observation contains only declared player-safe information;
4. private transaction reads never leak into the safe Narrator receipt;
5. declared derived projections publish atomically with authority;
6. Narrator/provider final failure publishes no authority;
7. Narrator success publishes prepared authority + Action receipt + assistant Turn atomically;
8. fixed typed UI invocation and free-text intent use the same declared Transaction authority path;
9. stale revision and idempotency checks fail closed;
10. deterministic Fortune is stable across provider retry / save restore of the same authority anchor;
11. Retry/branch semantics preserve coherent authority and never mutate an already committed branch in place;
12. Packages that do not declare `authority-transaction@1` retain current behavior and compatibility.

Equivalent stronger tests are acceptable.

#### 6.54.13 Final v1 Core-gap result

**Blocking Core prerequisite: exactly one**

- `authority-transaction@1`, including:
  - safe intent observation;
  - bounded private authority reads;
  - atomic private-candidate World / Lifecycle / clock preparation;
  - unified derived-publication hook;
  - safe Turn-local receipt;
  - atomic authority + Narrator finalization;
  - free-text and fixed typed invocation;
  - stable retry / Fortune semantics.

**Not blocking for v1**

- dynamic per-NPC Actor projection;
- Player Continuity;
- Content extension points;
- document-rendering Task;
- additional graph engine;
- general economy/schedule/reputation system;
- frontend visual architecture.

### 6.55 Round 9.8 decision

Approved:

- Round 9 technical architecture is frozen;
- `authority-transaction@1` is the only blocking v1 Core prerequisite;
- authority is prepared in a private candidate before Narrator but published only after successful Narrator completion;
- Narrator failure causes zero authority mutation;
- deterministic Fortune must survive provider retry on the same authority anchor;
- Branch Retry is distinct from future prose-only Re-narrate;
- typed frontend and free-text use the same declared Transaction path;
- one unified derived-publication hook covers player and background authority changes;
- Agenda Deliberation, NPC interaction, Package Data and frontend require no additional v1 Core gap;
- Core prerequisite must enter `main` before formal Package implementation;
- twelve minimum Core verification gates are frozen.

Rejected:

- publishing mechanical authority before Narrator finalization and tolerating provider-failure half-turns;
- rerolling Fortune because prose generation was retried;
- treating a full branch retry as a cosmetic rephrase;
- inventing separate frontend transaction authority;
- requiring every background Lifecycle update to masquerade as a player Transaction;
- starting Package development with temporary Core-gap workarounds.


## Current Atria main audit baseline

- **Verified main:** `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- **ExperienceContract v1** currently supports the relevant declared capabilities, including `package-data`, `data-projection`, `action@2`, `declarative-mutation`, `message-projection`, `turn-contract`, `turn-envelope`, `narrative-outcome`, `runtime-automation`, `perspective`, `model-task`, `session-application`, `temporal`, `player-continuity` and `workflow`.
- **Lifecycle Runtime v1** supports up to 32 scopes, 32 domains, 32 logical clocks, 64 clock advances, 32 workflows and 128 interactions. Domain retention preserves pinned / referenced records and supports up to 4096 records per domain.
- **Information Runtime v1** supports up to 32 sources, 16 views, 16 bounded graphs, depth up to 4 and 256 graph edges per graph projection. Supported semantics include `truth`, `belief`, `thread`, `open_loop`, `memory` and Timeline `narrative`.
- Belief projection already validates explicit epistemic statuses and channels, including known / believed / suspected / disputed and witnessed / direct_message / told_by / public_broadcast / surveillance / rumor / inference.
- **Task Runtime v1** supports `turn_blocking`, `interactive`, `background` and `maintenance` execution classes; result authority distinguishes advisory proposals, turn context, presentation, world-outcome proposals and declared app commands.
- Package Turn supports `authority-first` and `narrative-outcome` policies. In authority-first mode narration cannot write semantic outcomes.
- TurnEnvelope and MessageProjection already separate canonical narrative text, inert bounded presentation blocks, diagnostics and semantic outcome proposals.
- Current Task rules intentionally forbid `queuePolicy=latest` for authority-producing Tasks. Any Round 6.7 supersession design must therefore supersede pending decision requests before authority-producing task acceptance rather than superseding confirmed authority work.
- Native Session publication is immutable-revision based; retries fork from committed history rather than mutating accepted outcomes.
- Current low-level Session Core can atomically publish multiple state namespaces in one revision, but Round 9 must still verify whether the Package-facing typed action seam can express every required multi-domain gameplay transaction without Core changes.

### Confirmed design-pressure point

Information `actor` Views are statically bound to concrete `actorId` values and the whole Information Runtime allows at most 16 Views.

The approved content target contains more persistent actors than can each receive a dedicated static private Context View once Narrator / player / task views are also counted.

Round 9 must therefore resolve actor-private model context through one of:

- a smaller explicitly modeled actor-AI subset;
- a Package-safe architecture that does not require one static View per persistent NPC;
- or a genuine Core extension for dynamically actor-bound perspective projection.

Do not fall back to giving a shared task all actors' private Beliefs / Memories.

### Current gap policy

A requirement is a **Core gap** only when the approved design cannot be represented safely through current Package Data, Lifecycle, Information, Task, Continuity, Message / Turn or Native Frontend contracts.

Complexity or inconvenience alone is not a platform gap.

### Authority-first Turn verification

Current `main` `executeTurn / prepareTurn` confirms that `authority-first` directly supports the approved player-action direction:

1. load the anchored Session revision;
2. if free-text `userInput` is present and the Package declares game logic, run `role.intent_resolver`;
3. the intent resolver operates through the Package game LLM runtime / tools and may publish authoritative state changes before narration;
4. every accepted state publication advances the revision anchor;
5. only after intent resolution completes do bounded Turn stages and the Narrator execute;
6. `finalizeTurn` rejects Narrator outcomes under `authority-first`.

Therefore the approved design **Player Intent → authority resolution / commit → projection → Narrator** maps directly to the current Package Turn policy.

`narrative-outcome` should not be used for ordinary gameplay authority because it intentionally interprets narrative after generation.

The remaining Round 9 work is to define the Package game-logic tool/action surface so the intent resolver can perform only validated world operations.


### Round 9.5 verified runtime constraints

The following constraints are now verified against `main@c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`:

- Declarative Game World commands accept `id / description / argsSchema / validators / events / llm` and emit World Events. They do **not** directly declare Lifecycle `app.command` mutations.
- Declarative interpretation mappings can produce a World command plus one Lifecycle `app.command`, but that bridge belongs to semantic outcome / task-authority handling rather than the ordinary `authority-first` intent-resolver command catalog.
- Lifecycle action kinds are individually typed as `app.command`, `world.command`, `workflow.transition` or `task`; one workflow / automation action node contains one action, not an arbitrary atomic multi-action transaction.
- `authority-first` free-text resolution exposes Game World commands through `createCommandToolCatalog(worldSession.getCommands())`.
- The Host-created Game LLM runtime does not currently inject Package-defined `observationProjectors` or dynamic actor Information views into that intent-resolver path. The default observation projector contains only declared projector outputs (none in this Host path) plus recent sanitized World Events.
- Information Actor views are statically bound to one `actorId`; there is no current invocation-time actor binding in the Information contract.

These constraints mean two requirements need explicit Round 9.5 resolution rather than assumed Package wiring:

1. **authority-first cross-authority transaction seam** — a free-text game verb may need to validate against and atomically update World/Lifecycle authority together;
2. **dynamic actor-private perspective seam** — many persistent actors cannot each consume a dedicated static Information View.

These are verified platform pressures. Whether they become Core implementation prerequisites depends on the accepted Round 9.5 architecture.
