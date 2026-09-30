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

> **Current discussion:** Rounds 9–9.5 are approved. Round 9.6 is open: exact Information Views, Sources and Task Runtime mapping.

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

### 6.50 Round 9.6 question — exact Information and Task Runtime mapping

Round 9.6 must freeze the concrete v1 AI-facing projection/task set.

It must determine:

- the exact Information Sources and their semantics;
- the minimal fixed Information Views and which are display/context capable;
- the bounded graph views used by player investigation / Reflection;
- what Narrator receives after an authority transaction;
- what Case Reflection receives;
- what Claim Advisor receives;
- what Agenda Deliberation receives;
- whether any document-rendering Task is necessary in v1;
- Task execution classes, result policies and queue policy;
- which Tasks may propose authority and how acceptance works;
- exact Knowledge / Memory exposure policy per Task;
- Context item budgets direction;
- how v1 avoids consuming scarce static Views for ordinary NPCs;
- whether Round 9.6 reveals any further Core gap.


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
