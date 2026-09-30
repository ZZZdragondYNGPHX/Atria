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

> **Current discussion:** Round 9 core mapping is approved. Round 9.5 is open: concrete Lifecycle domain mapping and restricted intent-resolver Action API.

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

### 6.48 Round 9.5 question — Lifecycle domain mapping and restricted Action API

Round 9.5 must translate the logical authority model into concrete Package-facing runtime operations.

It must determine:

- the physical Lifecycle domains and scopes;
- which domains may be combined safely;
- domain retention / terminal policy direction;
- which Package Data resources initialize each domain;
- the exact restricted game-verb API available to the intent resolver;
- which verbs are pure reads, which create proposals and which commit authority;
- how one high-level player action can update multiple logical authorities consistently;
- how Resolution Frames / bounded Fortune are executed;
- how actor interaction obtains one target's private perspective without global leakage;
- how generated Tier C / bounded content is promoted to authoritative Entity / Actor state;
- how graph-index publication follows authoritative writes;
- how Outcome Packet projection is constructed after commit;
- whether any of these operations require Core changes on current `main`.


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
