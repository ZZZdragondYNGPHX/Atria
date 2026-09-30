# Original Occult Western Fantasy Game — Implementation Staging

## Responsibility

Owns Round 10: Codex-ready implementation phases, dependency order, workspace routing, per-phase reading map, validation gates, integration criteria and release handoff.

## Dependencies

- index.md
- decisions.md
- technical-design.md
- approved domain modules only when a phase implements their authority.

> **Status:** Approved Implementation Staging v1.0. Pre-production and P0–P5 are complete; Package P6 awaits separate authorization. G1/G2 are closed. Exact evidence is in the Package Record and sole live HANDOFF; phase scopes below remain unchanged.

---

## 6.56 Approved implementation staging — Round 10

The implementation order is:

**P0 Core prerequisite → P1 Package Foundation → P2 Interaction Runtime → P3 World Simulation → P4 World / Content Foundation → P5 Opening Vertical Slice → P6 Signature Network A → P7 Signature Network B + Eastbank Convergence → P8 Frontend-specialized integration → P9 Integration / Regression / Release**

Do not start Package implementation before P0 is integrated into "main".

### P0 — Core prerequisite: Authority Transaction

**Task ID:** "feat/authority-transaction"

**Primary Workspace:** "main"

**Task branch:** "feat/authority-transaction"

**Plan:** "docs:plans/feat/authority-transaction.md"

P0 implements only the frozen "authority-transaction@1" Core capability required by this Package.

Required outcomes include:

- optional "authorityRuntime" tied to "authority-transaction@1";
- declarative Game Logic transaction support;
- disclosure-safe intent observation;
- statically bounded private authority reads;
- private-candidate World + Lifecycle + clock preparation;
- unified derived-publication hook;
- deterministic Fortune / retry identity;
- safe Turn-local transaction receipt;
- free-text and fixed typed transaction invocation;
- Narrator over the frozen candidate;
- one final authority + assistant-message CAS;
- provider failure with zero published mutation;
- backwards compatibility for Packages not declaring the capability.

P0 is a separate product task. It follows normal "main" short-lived branch lifecycle and receives its own Record.

#### P0 exit gate

P0 is complete only after the twelve verification gates frozen in "technical-design.md" Round 9.8 pass, appropriate targeted/regression CI succeeds, the implementation is merged into "main", integrated "main" is revalidated, and the temporary branch is removed.

Package P1 may then revalidate the new real "main" and proceed.

---

## P1 — Package Foundation

**Primary Workspace:** "package"

**Package root:** "original-occult-western-fantasy-game/"

The long-lived Package workspace is independent from "main"; do not merge "main" into "package".

Create the Package root and "releases/", then establish an installable/validatable skeleton containing:

- manifest / EntryPoint;
- approved Experience capabilities;
- modular Package Data declarations;
- Lifecycle scopes/domains;
- canonical world clock;
- Information Sources / Views / Graphs;
- four core Task classes;
- Authority Runtime / transaction bindings against the integrated P0 Core contract;
- minimal bootstrap seed;
- minimum build / validate / preview path.

Do not bulk-author the full game in P1.

#### P1 exit gate

The skeleton installs and validates against the current real Atria "main"; declared runtime contracts resolve; a minimal session starts; no temporary Core workaround exists.

---

## P2 — Interaction Runtime

Implement the foundational gameplay transaction surface:

- observe;
- verify;
- interview;
- access;
- test;
- intervene;
- create_hypothesis;
- create_lead;
- advance_time.

Implement and validate:

- Resolution Frame;
- Automatic / Impossible / Uncertain;
- qualitative Risk Tier;
- deterministic bounded Fortune, with Automatic / Impossible outcomes, effects and safe outputs invariant to unused internal draws (gameplay.md 6.28.2);
- Evidence / Belief / Memory / Relation / Matter / Condition effects;
- player-safe disclosure projections;
- derived investigation index;
- safe transaction receipt → Narrator path;
- free-text and typed invocation parity.

Use a deliberately small synthetic test world.

#### P2 exit gate

A free-text player action can resolve to a declared verb, prepare multiple authority effects atomically, update safe projections, generate narrative only from approved outcome/context, and finalize once. Typed invocation produces equivalent authority semantics. Narration retry cannot mutate or reroll the resolved result.

---

## P3 — World Simulation

Implement autonomous world progression:

- Agenda state machines;
- Deterministic / Conditional / Deliberative Agenda steps;
- Hot / Warm / Cold relevance;
- Lifecycle Automations / Workflows;
- Condition recovery;
- deadlines and appointments;
- event-driven fast-forward;
- bounded reaction depth;
- background Agenda Task;
- Agenda Intent → later Authority Transaction;
- generated Entity promotion;
- derived-publication refresh after background authority changes.

#### P3 exit gate

A synthetic multi-day simulation demonstrates:

- deterministic changes do not call a model;
- only due Deliberative Agenda work invokes background AI;
- Cold institutions progress without invented catch-up history;
- hidden background state does not leak into player/Narrator projections;
- save/reload preserves already-resolved results;
- fast-forward processes obligations and deadlines.

---

## P4 — World / Content Foundation

Author the reusable launch-world foundation:

- six core city districts and approved surrounding footprint;
- approximately 25–35 important locations;
- approved ten major institutional/network nodes;
- approximately 12–16 Tier A actor cores;
- approximately 30–50 Tier B actor cores;
- Anomaly Families;
- Claim primitives;
- Starter Claim Seeds;
- Established Claim Archetypes;
- Eastbank Canon Fragments;
- Origin / Prior Life / Faith content;
- Artifact templates;
- public / legitimately retrievable Knowledge.

Do not script the whole campaign in this phase.

#### P4 exit gate

Stable IDs and references resolve; Package Data remains within approved soft budgets; hidden Canon is not in generic Knowledge; no required institution/actor/Claim/Canon dependency is orphaned; initial materialization remains lazy where approved.

---

## P5 — Opening Vertical Slice

Implement the playable opening from character creation through the first Signature Case.

Required content/system path:

- six-step character creation;
- Civil Verifier starting state;
- Personal Anchor creation;
- Second Death opening Matter;
- multi-path investigation;
- first Breach;
- Breach Imprints;
- Claim Seed eligibility/candidates;
- postpone option;
- first stabilization / formal Claim path where earned;
- multiple Case dispositions / Settlements;
- failure continuity.

#### P5 exit gate

A player can start a fresh campaign and complete the opening arc without a mandatory fragile clue or quest-checklist progression. Backgrounds materially affect access. Wrong theories / failed actions can continue the campaign. Narrative regeneration cannot change settled mechanics.

P8 frontend design research may begin after P5 because the player-safe projections and action surface should now be stable enough to evaluate.

---

## P6 — Signature Network A

Implement:

2. Dual Address Property;
3. Impossible Burial;
4. Dead Railway;

plus the first reusable Institutional Case Patterns.

This phase exercises:

- Boundary / property conflict;
- Church / Memory / communal Identity;
- physical investigation / Echo / Injury;
- worker information networks;
- Case merge/reopen;
- durable multi-institution Settlement.

#### P6 exit gate

Each Signature Case supports materially different investigation routes, multiple dispositions, persistent consequences, order flexibility, and correct Eastbank Revelation Predicate contributions.

---

## P7 — Signature Network B + Eastbank Convergence

Implement:

5. Self-Signing Company;
6. Claims Before the Accident;
7. Tomorrow's Headline;
8. Eastbank Hearing;

and complete launch-target Case Patterns / Claim / Anomaly coverage.

This phase also completes:

- Reality Consolidation pressure;
- four-layer Eastbank revelation;
- cross-source Revelation Predicates;
- multidimensional final Settlement.

#### P7 exit gate

Eastbank convergence is unlocked by evidence predicates, not "casesCompleted". The campaign may reach convergence with some Signature content missed. Final dispositions can independently express Historical Truth, Current Stability, Justice, Political Power, Religious Authority and Institutional Accountability.

---

## P8 — Frontend-specialized integration

Detailed visual/UI/UX design is intentionally delegated to a frontend-specialized AI using the user's installed frontend Skills.

The frontend receives the frozen functional contract:

- player-safe Information display projections;
- bounded investigation graph;
- approved typed actions / transactions;
- Case Reflection;
- Claim Advisor;
- Composer / narrative flow;
- anti-leakage rules.

This Plan does not prescribe visual hierarchy, color, typography, navigation architecture, animation or component composition.

Frontend design exploration may begin after P5. Formal integration should converge after P7 to reduce content-driven rework.

### P8 required Skill set

These four Skills are vendored in Atria's long-lived `skills` workspace primarily so Web / remote Agents can load them from the repository. During P8: Web / remote loads them through `skills:SKILLS.md -> corresponding Skill directory`; Local / CLI / desktop uses the locally installed versions when available and should not detour through the `skills` branch. Only use the repository copy locally when the Skill is missing, the user explicitly asks for it, or the Plan explicitly pins the repository version. Do not copy Skill assets into `main` or the Package workspace. Upstream provenance and pinned commits remain in each Skill's `UPSTREAM.md`.

1. **frontend-design**
   - Source: `anthropics/skills`
   - Upstream path: `skills/frontend-design/SKILL.md`
   - Primary responsibility: distinctive visual direction, subject-matter-specific aesthetic identity, typography/layout character, anti-template / anti-"AI slop" critique.
   - Use when establishing or materially reshaping the visual concept.
   - It is the **visual identity lead**, not the accessibility/compliance authority.

2. **ui-ux-pro-max**
   - Source: `nextlevelbuilder/ui-ux-pro-max-skill`
   - Upstream path: `.claude/skills/ui-ux-pro-max/SKILL.md`
   - Primary responsibility: design-system generation, UX structure, responsive behavior, accessibility, touch/interaction, typography/color systems, component/system consistency and stack-aware implementation guidance.
   - Use for the project-wide design system and for component/page-level UX decisions.
   - It is the **system/UX lead**.

3. **emil-design-eng**
   - Source: `emilkowalski/skills`
   - Upstream path: `skills/emil-design-eng/SKILL.md`
   - Primary responsibility: interaction polish, micro-interactions, animation decisions, perceived responsiveness, interruptible motion, component feel and invisible design-engineering details.
   - Use after structure/usability are stable.
   - It is the **interaction/motion polish lead**, not the primary visual concept generator.

4. **web-design-guidelines**
   - Source: `vercel-labs/agent-skills`
   - Upstream path: `skills/web-design-guidelines/SKILL.md`
   - Runtime rule source: `vercel-labs/web-interface-guidelines:command.md`
   - Primary responsibility: final implementation audit for web-interface best practices such as accessibility, focus, forms, animation, typography, content handling, performance, navigation/state, touch, safe areas, dark mode, i18n and hydration.
   - Fetch/use the current upstream guidelines when performing the audit.
   - It is the **final compliance/review lead**, not a visual-direction generator.

### P8 Skill routing

Do not load all four Skills for every frontend task. Use the smallest appropriate set.

#### P8-A — Visual direction / identity

Load:

- **frontend-design** — primary;
- **ui-ux-pro-max** — secondary.

Responsibilities:

- derive a visual language from this game's occult industrial-modernity subject matter rather than from generic dashboard/game templates;
- establish typography, palette, density, composition principles and memorable visual motif;
- use `ui-ux-pro-max` to pressure-test the direction for usability, responsive behavior, accessibility and coherent design-system rules;
- reject generic SaaS-card layouts or fashionable effects that are unrelated to the game's subject matter.

Expected result:

- a reviewed frontend concept / design-system direction;
- no implementation yet if visual direction is still unstable.

#### P8-B — Design system / information architecture / component implementation

Load:

- **ui-ux-pro-max** — primary;
- **frontend-design** — review support when a component or page drifts into generic/template styling.

Responsibilities:

- translate the approved player-safe information/actions into concrete navigation, hierarchy, responsive patterns and reusable components;
- establish tokens, typography/color/spacing rules and component behavior;
- cover desktop and mobile/touch constraints;
- preserve semantic differences required by the Plan, especially Evidence / Testimony / Finding / Hypothesis and Claim / Seed;
- never solve layout convenience by reading hidden Lifecycle authority.

If the Skill persists a design system, keep it project-local to the Package frontend work and review it before treating it as design authority.

#### P8-C — Interaction and motion polish

Load:

- **emil-design-eng** — primary;
- **ui-ux-pro-max** — secondary for accessibility/reduced-motion/touch checks.

Responsibilities:

- decide whether an interaction should animate at all;
- polish drawers, popovers, toasts, transitions, press feedback, gestures and state changes;
- optimize perceived responsiveness and interruption behavior;
- prefer motion that explains state/spatial change over decorative motion;
- respect `prefers-reduced-motion` and touch-device behavior;
- avoid slowing high-frequency investigation/navigation actions with unnecessary animation.

Do not start P8-C before P8-B interaction structure is stable.

#### P8-D — Final frontend audit

Load:

- **web-design-guidelines** — primary;
- **ui-ux-pro-max** — secondary pre-delivery UX/accessibility checklist;
- **emil-design-eng** only for targeted motion-quality review when motion remains material.

Responsibilities:

- audit the implemented frontend against the latest Vercel Web Interface Guidelines;
- resolve accessibility/focus/form/touch/navigation/performance/content-overflow/i18n/hydration issues;
- recheck responsive breakpoints, long Evidence/Case content, graph interaction and mobile safe areas;
- perform final leakage audit: frontend reads only player-safe projection/authorized actions;
- review real screenshots / devices where implementation quality cannot be established from code alone.

### Skill conflict / priority rule

When Skill advice conflicts, use this order:

1. user instruction, Atria Repository Governance and approved Plan/technical authority;
2. player-safe information/authority boundary and functional correctness;
3. accessibility, input, responsive and performance constraints from `web-design-guidelines` / `ui-ux-pro-max`;
4. project-specific visual direction from `frontend-design`;
5. motion/polish guidance from `emil-design-eng`.

Aesthetic or motion advice may never weaken accessibility, disclosure safety, typed-action authority or mobile usability.

#### P8 exit gate

Validate desktop/mobile behavior, long investigation data, graph interaction, overflow, touch affordances, important-state reachability and absence of hidden authority leakage.

P8 cannot exit until:

- P8-A visual direction is deliberate and game-specific rather than template-derived;
- P8-B design-system/component structure is responsive and semantically faithful;
- P8-C motion/polish is purposeful, interruptible where appropriate and reduced-motion-safe;
- P8-D latest-guideline audit has no unresolved launch-critical findings;
- real UI evidence exists for presentation quality that code-level validation cannot establish.

---

## P9 — Integration / Regression / Release

No new gameplay systems.

Validate:

- full campaign smoke;
- varied Signature Case order;
- failed / costly routes;
- save / restore;
- branch retry;
- provider failure;
- background Agenda;
- fast-forward;
- Claim Prices;
- Settlement consequences;
- Revelation Predicate convergence;
- information-leak boundaries;
- Package Data size;
- install / validate / build / preview;
- appropriate regression suites.

Produce the final ".atria" release under:

"original-occult-western-fantasy-game/releases/"

Historical releases are retained and not overwritten.

#### P9 exit gate

All launch-critical functional, authority, leakage, regression and release checks pass; the Package Record contains tested HEAD / CI evidence; the release artifact is retained in the Package workspace.

---

## Phase dependency / parallelism

Primary dependency chain:

"P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9"

Only one planned overlap is approved:

- P8 frontend design research may begin after P5;
- formal frontend integration still converges after P7.

Do not parallelize Package implementation against an unfinished P0 Core contract.

---

## Minimal implementation reading map

| Phase | Required Plan context |
| --- | --- |
| P0 | "plans/feat/authority-transaction.md" + "technical-design.md" Round 9.5–9.8 |
| P1 | "index.md" + "technical-design.md" + this module |
| P2 | P1 set + "gameplay.md" + "simulation.md" |
| P3 | "simulation.md" + "institutions.md" + this module |
| P4 | "content-architecture.md"; load geography/institutions/religion/society/metaphysics only for the assets being authored |
| P5 | "player.md" + "gameplay.md" + "content-architecture.md" + this module |
| P6 | "content-architecture.md" + only corresponding world authority modules |
| P7 | P6 set + relevant "technical-design.md" revelation/authority rules |
| P8 | "platform-and-gameplay.md" + "technical-design.md" Round 9.6 + frontend Skills by adapter: Web/remote reads `skills:SKILLS.md` → required Skill; Local/CLI uses installed local Skill first; then follow P8-A/B/C/D routing above |
| P9 | "index.md" + "decisions.md" + "technical-design.md" + this module + current Record/HANDOFF |

Agents should not load the full Plan Bundle when the phase reading map is sufficient.

---

## Documentation lifecycle during implementation

### P0 Core task

Use a separate implementation Record under:

"docs:records/feat/authority-transaction.md"

If P0 spans formal stages/conversations, maintain the repository's single live "docs:HANDOFF.md".

P0 completion closes/removes its live HANDOFF after durable information is in the Record.

### Package task P1–P9

Create and continuously update one Package Record:

"docs:records/package/original-occult-western-fantasy-game.md"

P1–P9 remain one multi-stage Package implementation task.

At the end of every formal Package phase:

1. implement and validate the phase;
2. persist/push the tested Package HEAD;
3. update the same Package Record;
4. update the single live "HANDOFF.md";
5. record current/tested HEAD, CI, remaining work and next-phase target;
6. provide a copyable next-phase handoff prompt;
7. stop.

Do not automatically cross a formal phase boundary.

---

## Validation / CI stop policy

Ordinary code/test failures are handled autonomously.

Stop only when the next step genuinely depends on:

- a formal phase boundary;
- clearly long-running CI that is the sole remaining dependency;
- Android/Termux or other real-device evidence;
- real UI/screenshots that code-level validation cannot replace;
- user-only Secret / account / permission action.

Do not wait indefinitely for CI. Once CI becomes the only long-running dependency, report the run/checkpoint and stop polling.

---

## v1 explicit deferrals

Not required for v1 unless a later material contradiction reopens the relevant Plan authority:

- dynamic per-NPC model-bound Information Views;
- Player Continuity / cross-campaign transfer;
- Content extension/addon ecosystem;
- dedicated document-rendering Model Task;
- generic economy simulation;
- universal schedule system;
- reputation scalar;
- full city population simulation;
- frontend visual design specified by this Plan;
- prose-only Re-narrate feature.

---

## Round 10 decision

Approved:

- P0 Core prerequisite followed by Package P1–P9;
- P0 is a separate "main" product task and hard gate for Package implementation;
- Package remains in long-lived independent "package" workspace without merging "main";
- P1 foundation, P2 interaction runtime, P3 simulation, P4 content foundation, P5 opening vertical slice, P6/P7 Signature networks, P8 frontend handoff, P9 release;
- P8 research may overlap after P5, but formal integration converges after P7;
- phase-specific minimal reading map;
- separate P0 Record and one continuous P1–P9 Package Record;
- formal phase boundary stop / HANDOFF rules;
- v1 deferral list.

The project is ready to become **Approved Implementation Baseline v1.0** once the Plan index is promoted accordingly.
