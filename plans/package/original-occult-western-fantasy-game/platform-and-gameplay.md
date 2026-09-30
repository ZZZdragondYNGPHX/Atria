# Original Occult Western Fantasy Game — Atria Fit and Gameplay Direction

## Responsibility

Owns current Atria platform-fit assumptions, provisional gameplay loop/presentation surfaces, external design-reference lessons and unresolved cross-system questions.

## Dependencies

- `foundation.md`
- Relevant world modules only when the gameplay/platform question depends on them.

---

## 7. Atria platform fit — current verified direction

Current Atria Native architecture appears unusually well suited to this project.

Relevant platform concepts include:

- Package capabilities such as narrative, game, world-simulation, orchestration, memory, knowledge, custom-ui and game-runtime;
- formal separation of Truth / Belief / Memory / Exposure in the Information Runtime;
- lifecycle and logical-time systems suitable for faction plans, deadlines and autonomous world progression;
- Model Tasks for separating narrative generation from other AI-assisted functions;
- Native Frontend v3 for Package-owned presentation;
- Host Bridge access to conversation, branches, save/restore and composer actions;
- Package memory bridge and persistent Native session state;
- Studio build / validation / preview infrastructure.

Design implication:

The game should not rely on the language model to remember or simulate all state implicitly. Deterministic Native state should own authoritative facts; model context should receive curated projections.

## 8. Candidate game structure

This section is provisional and intentionally broad.

Potential core loop:

1. encounter anomaly / social problem / mystery;
2. investigate through people, places, records and institutions;
3. acquire incomplete or conflicting information;
4. decide what to trust, test, reveal, conceal, destroy or preserve;
5. interact with a supernatural principle;
6. gain capability, access or perception at a cost;
7. alter relationships, reputation, obligations and faction state;
8. perceive previously inaccessible layers of the world;
9. uncover a larger mystery.

Possible presentation needs may include narrative, investigation/evidence access, people/relationship information, city/location navigation, public-information artifacts, and player Claim / Identity / Condition information.

These are information-access requirements rather than prescribed screens.

**Frontend planning boundary:** this Plan must not specify visual hierarchy, layout, styling, animation, component composition or detailed UX. Those decisions are intentionally deferred to a frontend-specialized AI or an AI with an installed frontend skill. Round 7 should remain limited to required information, allowed actions, visibility boundaries and anti-leakage constraints.

## 9. External design references to study

Current useful reference categories:

### Fallen London

Study:

- narrative state density;
- city as a persistent story system;
- qualities / reputations / identity progression;
- lessons around avoiding uncontrolled state-variable proliferation.

### Blades in the Dark

Study:

- progress clocks;
- faction clocks;
- off-screen faction activity;
- consequence-driven failure.

### Disco Elysium

Study:

- skills as perception filters and voices;
- information unlocked by character build;
- failure as narrative content;
- character identity expressed through mechanics.

### Sunless Sea / Sunless Skies

Study:

- atmosphere and expedition risk;
- long-term pressure systems;
- avoid turning danger into a mechanic that teaches players not to explore.

These are references, not implementation templates.

## 10. Questions still open

The following are intentionally unresolved:

1. What are the final player-legible Principles and their taxonomy?
2. How exactly do multi-Principle Claims work?
3. Which Anchor categories and Jurisdiction dimensions become formal mechanics?
4. What makes the player initially special, if anything?
6. What is the main political and religious structure?
7. How technologically advanced is the setting?
8. How open or hidden is the supernatural?
9. What is the game's default geographic scale: one city, one nation, several nations, or a wider world?
10. What is the initial player fantasy: investigator, nobody, professional, criminal, scholar, clergy, displaced outsider, etc.?
11. How deterministic should conflict resolution be?
12. Which systems belong to Native state and which belong to model interpretation?
13. What information should the player UI expose versus deliberately hide?
14. What role should combat play?
15. How long should one campaign/session be expected to persist?


## 11. Round 7 — Frontend information and interaction constraints

> **Current discussion:** Round 7 is approved. Detailed visual/UI/UX planning remains delegated to a frontend-specialized AI / frontend skill.

Round 7 freezes only product-facing information and interaction requirements.

### 11.1 Information the player must be able to inspect

The frontend must make player-safe access possible for:

- canonical current time and location;
- known upcoming commitments / natural deadlines;
- player-known Matters / Cases / Leads;
- acquired Evidence;
- known Testimony / Findings / Hypotheses with their semantic distinction preserved;
- known people / institutions and player-known relationship state;
- actual Access and Obligations relevant to the player;
- player Claims, Anchors, Prices and material Conditions;
- Personal Anchor relationships;
- acquired or public documents, reports, news and Settlements;
- practical player financial state when it changes available actions.

These are information requirements, not prescribed screens.

### 11.2 Required player interactions

The frontend must support or expose a path for the player to:

- inspect Evidence provenance and known relations;
- create / revise player Hypotheses and Leads;
- choose investigation directions without a quest checklist;
- invoke Case Reflection;
- inspect known qualitative risk before committing a major uncertain action;
- submit formal Case disposition / report / Settlement actions when valid;
- inspect and manage meaningful Commitments and Downtime choices;
- request time advancement / fast-forward when permitted;
- inspect formal Claim and relevant abnormal state.

Freeform narrative input remains central, but these important stateful actions must not depend solely on remembering hidden syntax.

### 11.3 Information the frontend must not expose

The player-facing frontend must never reveal merely because the backend stores it:

- hidden World Truth;
- culprit / answer-key fields;
- unrevealed Evidence;
- hidden locations / graph relations;
- private NPC Beliefs or Memories;
- secret Agenda phases / next actions;
- faction-clock or quest-progress shadow state;
- exact hidden success probabilities;
- hidden clue totals;
- Truth completion percentages;
- Cold-simulation logs.

### 11.4 Risk presentation boundary

Risk presentation may expose only player-legible information such as:

- qualitative Risk Tier;
- known favorable factors;
- known adverse factors;
- known consequence families.

Do not expose hidden random seeds or exact backend success probabilities by default.

### 11.5 Preserve epistemic semantics

The frontend must not flatten materially different information into one generic clue or fact list.

At minimum preserve the distinction between:

- Evidence;
- Testimony;
- Finding;
- Hypothesis;
- World fact versus Institutional Record;
- formal Claim versus Claim Seed / progression candidate.

Visual representation is intentionally unconstrained.

### 11.6 Narrative versus persistent UI state

Not every descriptive detail becomes persistent interface state.

Transient details without ongoing gameplay meaning should normally remain Narrative.

Examples include:

- ordinary mood description;
- weather texture when it has no mechanical consequence;
- clothing dirt;
- incidental crowd reactions.

Persistent interface state should reflect durable or actionable information, not every sentence the model generated.

### 11.7 Projection boundary

Approved hard rule:

**player-facing frontend consumes player-safe projections and authorized actions, not unrestricted backend domains.**

A later frontend implementation may freely choose cards, graphs, documents, spatial navigation, overlays or other visual metaphors, but it may not bypass Information Perspective rules for convenience.

### 11.8 Round 7 decision

Approved:

- frontend requirements limited to player-safe information access and required actions;
- known time / location / commitments available;
- player-known investigation semantics remain distinct;
- risk preview exposes qualitative known factors only;
- Claim / Anchor / Price / Condition information accessible;
- formal Case disposition, Reflection and Downtime/time-advance interactions accessible;
- player frontend cannot read hidden World Truth, private NPC cognition, secret Agenda state or hidden completion metrics;
- transient narrative detail is not automatically dashboard state;
- frontend consumes player-safe Projection rather than unrestricted backend domains;
- detailed UI / visual / UX architecture is delegated.

Rejected:

- prescribing visual layout or component architecture in this Plan;
- exposing backend debug state to improve apparent UI completeness;
- generic clue lists that collapse Evidence / Testimony / Finding / Hypothesis;
- exact hidden probability displays by default;
- turning every narrative detail into a persistent dashboard variable.

