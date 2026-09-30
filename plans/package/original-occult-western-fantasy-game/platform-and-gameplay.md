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
