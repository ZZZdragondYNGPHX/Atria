# Original Occult Western Fantasy Game — Pre-Production Plan

**Task ID:** `package/original-occult-western-fantasy-game`  
**Primary Workspace (implementation):** `package`  
**Current stage:** Pre-production research and design discussion  
**Status:** Discussion Draft v0.1 — not approved for implementation  
**Plan path:** `docs:plans/package/original-occult-western-fantasy-game.md`

## 1. Purpose

Design an original Western-fantasy Atria game inspired by the structural strengths of *Lord of Mysteries* without reproducing its proprietary setting, terminology, progression tree, organizations, characters, plot structure, or signature expression.

This phase is deliberately pre-implementation. The goal is to research, compare, reject, and freeze the game's foundational design before Codex begins building Package assets.

## 2. Working product definition

A narrative-first occult Western-fantasy AI RPG set in a society transitioning toward modernity, where industrialization, mass communication, institutions, religion, finance, urban life, and supernatural forces interact.

The player should experience:

- ordinary life with credible economic and social texture;
- investigation and incomplete information;
- dangerous knowledge;
- identity and social-role progression;
- occult growth with meaningful cost;
- factions that continue acting without waiting for the player;
- layered revelation from local incidents toward deeper world truths;
- a world where what characters know and believe materially matters.

This is not intended to be a conventional combat-first level-grinding RPG.

## 3. Inspiration boundary

### 3.1 What may be learned from *Lord of Mysteries*

Use the design methodology rather than the concrete expression:

- derive supernatural systems from a small set of world laws;
- make advancement affect lifestyle, identity, risk, and social position;
- make knowledge a strategic resource;
- tie supernatural mechanics to institutions and history;
- preserve strong ordinary-life texture beneath cosmic or occult elements;
- reveal the setting through escalating investigation rather than encyclopedic exposition;
- make power produce tradeoffs and long-term consequences.

### 3.2 What must not be reproduced as a renamed equivalent

Do not build a one-to-one substitute for:

- the 22 Pathways;
- fixed Sequence 9 → 0 advancement;
- potions as the universal progression mechanism;
- Acting Method / digestion as a renamed equivalent;
- the Tarot Club structure;
- recognizable church/pathway mappings;
- equivalent deity, Outer Deity, Sefirot, Beyonder characteristic, ritual, or organization structures;
- renamed characters, cities, historical events, or plot arcs;
- one-to-one ability chains corresponding to known LoM pathways.

The project should be recognizable as influenced by occult mystery fiction, not as an unlicensed setting conversion.

## 4. Historical / aesthetic research direction

Current preferred research band is approximately late nineteenth to early twentieth century rather than generic early-industrial steampunk.

Useful historical motifs include:

- telegraphy and early mass communication;
- railway-driven synchronization and standard time;
- electrical infrastructure;
- newspapers and mass public opinion;
- police, courts, civil service, archives and bureaucratic states;
- banking, insurance and speculative finance;
- organized labor and urban poverty;
- spiritualism, séances, mediums and occult societies;
- conflict between empirical science, institutional religion and esotericism.

The exact historical analogue is not frozen.

## 5. Current design pillars

### 5.1 World law before skill tree

The supernatural system should begin with approximately 3–5 fundamental laws. Progression, organizations, rituals, taboos and history should be consequences of those laws.

### 5.2 Knowledge is power

Investigation should produce usable power, leverage, protection, access or new perception rather than merely lore completion.

### 5.3 Growth changes perception

Progression should unlock new ways to interpret scenes, documents, people and anomalies—not only stronger actions.

### 5.4 Power has asymmetric cost

Occult growth should provide real benefits while creating obligations, blind spots, transformations, dependencies, social consequences or new vulnerabilities.

Avoid a single monotonic “sanity meter” where higher occult exposure is simply worse.

### 5.5 The world acts independently

Organizations, institutions and major NPCs should pursue goals over time. Player inaction must have consequences.

### 5.6 Failure creates content

Failed investigation, risky occult use and social mistakes should usually generate consequences, complications, misinformation or new story branches rather than simple hard failure.

### 5.7 State discipline

Avoid excessive micro-variables that change by tiny amounts every turn. Prefer a smaller number of stateful systems with clear gameplay meaning.

## 6. Candidate foundational premise — provisional

One current candidate premise is that **record, recognition and reality are physically related**.

Illustrative—not yet approved—world laws:

1. Facts that are reliably recorded may become more stable than facts that are not.
2. Shared recognition may exert limited pressure on reality.
3. Contradictory realities with sufficient witnesses cannot coexist indefinitely.

Possible consequences:

- archives become strategic infrastructure;
- churches and governments care about documentary authority for supernatural as well as political reasons;
- newspapers, telegraph networks and public rumor can become dangerous;
- falsified histories may have real effects;
- erased names and suppressed records may alter what can persist;
- ruins can preserve truths modern society no longer accepts;
- witnesses, testimony and memory become supernatural assets.

This premise is a candidate only. It must compete against other foundational systems before approval.

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

Possible presentation surfaces:

- main narrative view;
- character / relationship dossier;
- investigation notebook;
- evidence and document viewer;
- newspaper / public-information view;
- organization network;
- city / district interface;
- occult research notes;
- player identity / condition view.

No UI layout is frozen yet.

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

1. What are the actual fundamental supernatural laws?
2. What is the metaphysical source of supernatural phenomena?
3. What replaces conventional class / pathway / level structures?
4. What exactly is gained and lost through progression?
5. What makes the player initially special, if anything?
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

## 11. Discussion protocol

Until the design is approved:

- each discussion round modifies this same Plan;
- accepted ideas are promoted from candidate/provisional to approved design;
- rejected ideas are removed rather than accumulating indefinitely;
- materially changed decisions replace outdated assumptions;
- unresolved alternatives may remain temporarily only when they are actively being compared;
- implementation must not begin merely because a candidate design sounds promising.

No Record or live HANDOFF is required during ordinary uninterrupted pre-production discussion.

## 12. Planned discussion sequence

Current proposed order:

### Round 1 — Foundational supernatural model

Compare several genuinely different metaphysical systems and choose or combine a direction.

### Round 2 — Progression and price

Define how people gain power, what advancement means, what it costs, and how it avoids one-to-one resemblance to LoM's Sequence/Potion/Acting structure.

### Round 3 — Society generated by the supernatural rules

Design religion, government, professions, law enforcement, academia, industry and secret organizations as consequences of the chosen rules.

### Round 4 — Player identity and starting situation

Choose the initial player fantasy, starting class/social position, first mystery and entry point into the hidden world.

### Round 5 — Core gameplay loop and failure model

Freeze investigation, social play, occult use, conflict, downtime, travel and consequence handling.

### Round 6 — World simulation and information architecture

Map Truth / Belief / Memory / Exposure, faction clocks, logical time and persistent world state onto Atria.

### Round 7 — Native UI and interaction model

Define player-facing surfaces and which information remains intentionally uncertain.

### Round 8 — Content architecture

Define cities, factions, NPC archetypes, mysteries, progression content and replay structure.

### Round 9 — Package technical design

Translate the approved game design into Atria Package contracts, resources, tasks, state domains, Native Frontend and Studio workflow.

### Round 10 — Implementation staging

Freeze Codex-ready phases, validation criteria, Package branch layout and release strategy.

The sequence may change if substantive design discoveries require it.

## 13. Approval state

Nothing in this document is yet an implementation baseline.

Currently carried forward from research:

- original occult Western fantasy rather than direct LoM conversion;
- world-law-first design;
- knowledge / investigation / identity as central systems;
- late-industrial / early-electrical-era research direction;
- independent faction/world progression;
- deliberate use of Atria Truth/Belief/Memory/Exposure architecture;
- avoidance of trivial renamed Sequence/Pathway/Potion structures.

All other elements remain open to revision.
