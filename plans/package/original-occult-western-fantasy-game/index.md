# Original Occult Western Fantasy Game — Plan Index

- **Task ID:** `package/original-occult-western-fantasy-game`
- **Primary Workspace (implementation):** `package`
- **Current stage:** Package P4 complete; P5 awaiting separate authorization
- **Status:** Approved Implementation Baseline v1.0 — P0/P1/P2/P3/P4 complete; G2 Core correction integrated; P5/P8 not started
- **Plan entrypoint:** `docs:plans/package/original-occult-western-fantasy-game/index.md`

## Goal

Design an original Western-fantasy Atria game inspired by the structural strengths of *Lord of Mysteries* without reproducing its proprietary setting, terminology, progression tree, organizations, characters, plot structure, or signature expression.

This phase is deliberately pre-implementation. The goal is to research, compare, reject, and freeze the game's foundational design before Codex begins building Package assets.

### Working product definition

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

## Frozen core principles

- Original occult Western fantasy; learn structural methods from *Lord of Mysteries* without reproducing its protected setting, terminology, progression, organizations, characters, plot structure, or signature expression. Authority: `foundation.md`.
- World law precedes skill tree; knowledge, investigation, identity, cost and independent world activity are core pillars. Authority: `foundation.md`.
- The approved ontology is one C → A → B hierarchy, not parallel magic systems. Authority: `metaphysics.md`.
- Progression uses Breach / Investiture and Claim / Anchor / Price / Jurisdiction with modular, self-consistent builds and cultural professions. Authority: `metaphysics.md`.
- Society, religion and political geography must be consequences of the same Anchor / Identity / Claim rules rather than decorative lore. Authorities: `society.md`, `religion.md`, `geography.md`.
- Deterministic Native state owns authoritative facts; model context receives curated projections. Authority: `platform-and-gameplay.md`.
- Implementation Baseline v1.0 is approved. Formal Package implementation remains gated on the P0 Core prerequisite defined in `implementation-staging.md` and `plans/feat/authority-transaction.md`.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `foundation.md` | Purpose, product definition, inspiration boundary, historical research band, design pillars | — |
| `metaphysics.md` | Rounds 1–2.6: ontology, progression, Principles, coverage boundaries | `foundation.md` |
| `society.md` | Round 3: public supernatural order, institutions, modernity, economy, law, information | `metaphysics.md` |
| `religion.md` | Rounds 3.5–3.6: gods, worship, Church, saints, cults, religious ecology | `metaphysics.md`, `society.md` |
| `geography.md` | Rounds 3.7–3.8: states, borders, primary city, urban structure/history and current city mystery | `society.md`, `religion.md` |
| `institutions.md` | Round 3.9: city institutions, faction network, Eastbank evidence distribution and institutional conflicts | `society.md`, `religion.md`, `geography.md` |
| `player.md` | Rounds 4–4.6: player identity, controlled character creation, first Breach and first-Claim flow | `foundation.md`, `geography.md`, `society.md`, `institutions.md` |
| `gameplay.md` | Rounds 5–5.6: core loop, investigation, uncertainty, case structure, failure, time, downtime and economy | `player.md`, `platform-and-gameplay.md` |
| `simulation.md` | Rounds 6–6.7: authoritative state, projections, domains, scheduling and simulation budgets | `gameplay.md`, `platform-and-gameplay.md`, `institutions.md`, `player.md` |
| `content-architecture.md` | Rounds 8–8.6: content scale, Signature Case network, production templates and authored/generated boundaries | `geography.md`, `institutions.md`, `player.md`, `gameplay.md`, `simulation.md`, `metaphysics.md` |
| `technical-design.md` | Rounds 9–9.8: Atria Package mapping, runtime contracts, data resources, tasks, authority transaction gap and technical freeze | all approved system/content modules |
| `implementation-staging.md` | Round 10: implementation phases, branch/workspace routing, validation gates, integration and release handoff | `index.md`, `decisions.md`, `technical-design.md` plus phase-specific authorities |
| `platform-and-gameplay.md` | Atria fit, provisional core loop/surfaces, external design references, open questions | `foundation.md` plus relevant domain modules |
| `decisions.md` | Compact cross-module frozen-decision index; links back to detailed authorities | all authoritative modules |

Detailed rules have one authoritative module. Do not copy them into another module merely for convenience; link back to the owner.

## Current route — Package P3 complete / P4 next

The game-design Plan Bundle is frozen as **Approved Implementation Baseline v1.0**.

Completed Core prerequisite:

- Task ID: `feat/authority-transaction`
- Primary Workspace: `main`
- Plan: `docs:plans/feat/authority-transaction.md`
- Core status: **C1–C4 complete, merged and verified on main; temporary branch removed**
- Permanent evidence: `docs:records/feat/authority-transaction.md`

P0 completed C1–C4, merged into `main`, passed the frozen Core gates and integrated-main validation, and removed its temporary branch. Package P1 is now verified and complete. See `docs:records/package/original-occult-western-fantasy-game.md` for implementation/tested HEAD and limitations. P2 and P3 are complete. G2 was corrected formally by Core task feat/world-simulation-scheduling (required world-simulation@1 alongside authority-transaction@1). Current implementation/tested HEADs, two-day fixture limits and P4 routing are in the same Package Record and sole live HANDOFF.

Package implementation remains in the independent long-lived `package` workspace and must not merge `main`.

For P0, read:

- `plans/feat/authority-transaction.md`
- this `index.md` only for product routing;
- `technical-design.md` Round 9.5–9.8 when detailed design authority is needed.

Do not reopen approved game/world design unless Core implementation exposes a material contradiction.

## Stage routing

| Discussion stage | Required modules | Status / routing note |
| --- | --- | --- |
| Round 1–2.6 | `index.md`, `foundation.md`, `metaphysics.md` | Approved; reopen only for a material contradiction |
| Round 3 | `index.md`, `society.md`; `metaphysics.md` only as needed | Approved |
| Round 3.5–3.6 | `index.md`, `religion.md`, `society.md` | Approved |
| Round 3.7–3.8 | `index.md`, `geography.md`; `society.md` / `religion.md` only as needed | Approved |
| Round 3.9 | `index.md`, `institutions.md`; authority dependencies only as needed | Approved |
| Round 4–4.6 | `index.md`, `player.md`; dependencies only as needed | Approved |
| Round 5–5.6 | `index.md`, `gameplay.md`, `platform-and-gameplay.md`; dependencies only as needed | Approved |
| Round 6–6.7 | `index.md`, `simulation.md`, `platform-and-gameplay.md`; dependencies only as needed | Approved |
| Round 7 | `index.md`, `platform-and-gameplay.md`, `simulation.md` | Approved; lightweight information/interaction constraints only |
| Round 8–8.6 | `index.md`, `content-architecture.md`; affected authority modules only as needed | Approved |
| Round 9–9.8 | `index.md`, `decisions.md`, `technical-design.md`; approved authority modules only as needed | Approved / technically frozen |
| Round 10 | `index.md`, `decisions.md`, `technical-design.md`, `implementation-staging.md` | Approved; Implementation Baseline v1.0 |

Future empty modules are intentionally not pre-created. When a new round gains substantive design content, create its authoritative module and update this routing table.

## Cross-module dependencies

- `metaphysics.md` defines the world laws that downstream modules may apply but not redefine.
- `society.md` owns institutional consequences of those laws.
- `religion.md` owns divine/religious consequences and links to social institutions without redefining their generic mechanics.
- `geography.md` owns territorial, urban and historical placement, using social/religious rules as dependencies.
- `platform-and-gameplay.md` maps the approved design onto Atria-facing gameplay/architecture constraints; it does not silently change world design.

## Discussion protocol

- Each discussion round updates this same Plan Bundle, primarily the module that owns the changed design.
- Accepted ideas are promoted from candidate/provisional to approved design inside their authoritative module.
- Rejected ideas are removed rather than accumulated indefinitely.
- Materially changed decisions replace outdated assumptions.
- Unresolved alternatives may remain temporarily only while they are actively compared.
- Update `index.md` when status, routing, dependencies, current round, or frozen cross-module decisions change.
- Implementation must not begin merely because a candidate design sounds promising.
- No game Record or live HANDOFF is required during ordinary uninterrupted pre-production discussion.

## Planned discussion sequence

Current proposed order:

### Round 1 — Foundational supernatural model

Compare several genuinely different metaphysical systems and choose or combine a direction.

### Round 2 — Progression and price

Approved: Breach / Investiture, Claim / Anchor / Price / Jurisdiction, modular self-consistent builds and cultural professions.

### Round 2.5 — Principle architecture

Approved: Common Eight as a human operational taxonomy, normally combined through 1–2 Principle Claims.

### Round 2.6 — Principle coverage pressure test

Approved: Common Eight retained, explicit Principle limits, hard system boundaries and institutional scaling.

### Round 3 — Society generated by the supernatural rules

Approved: public supernatural / restricted mechanism, four reality authorities, modern stabilization and old-vs-new Anchor conflict.

### Round 3.5 — Religion and the nature of gods

Approved: gods as transpersonal Identities with multiple possible origins, worship as Anchor, uncertain doctrine and non-omniscient divine action.

### Round 3.6 — Religious landscape and church organization

Approved: ecumenical tradition, layered religious ecology, saints, local cults, office-based priesthood and Church/State identity conflicts.

### Round 3.7 — Political geography and primary stage

Approved: constitutional-monarchy main state, industrial second city, focused regional scope and contrasting neighboring political systems.

### Round 3.8 — City history, structure and first major secret

Approved: layered port-city history, Eastbank Settlement, institutional stabilization over unresolved Truth and the first city-scale mystery.

### Round 3.9 — City institutions and faction network

Approved: interdependent city institutions, distributed Eastbank evidence, multi-axis relationship state and independent institutional Agendas.

### Round 4 — Player identity and starting situation

Approved: independent Civil Verifier, second-death opening case, action-caused Breach and delayed Claim choice.

### Round 4.5 — Character creation, background Anchors and controlled freedom

Approved: six-step creation, limited authoritative background Anchors, access-based background benefits and canon-safe freeform biography.

### Round 4.6 — First Claim candidate generation and stabilization

Approved: Breach Imprints, curated Claim Catalog, narrow Claim Seeds, institution-specific stabilization and strict Native authority.

### Round 5 — Core gameplay loop and failure model

Approved: Acquire → Interpret → Commit → Consequence → Continue; resilient investigation, persistent failure, time pressure, low-frequency combat and Identity-maintaining downtime.

### Round 5.5 — Deterministic checks and risk resolution

Approved: Native-authoritative Resolution Frames, qualitative risk tiers, bounded Fortune, structured consequences and non-arbitrary social/combat resolution.

### Round 5.6 — Case structure, open investigation and closure

Approved: Case as unresolved problem, world-owned Evidence, open Leads/Hypotheses, merge/split/reopen, durable Settlements and strict Truth/Settlement/Belief separation.

### Round 6 — World simulation and information architecture

Approved: Atria Lifecycle + Information authority, perspective-bounded projections, one world clock, Agenda state machines, shared investigation graph and tiered actor simulation.

### Round 6.5 — Authoritative domain decomposition

Approved: fourteen logical authority domains, derived relationship/availability summaries, no generic reputation/schedule/economy shadow state, and strict Hard/Perspective/Intent write authority.

### Round 6.6 — Perspective-specific context projection

Approved: task-specific Context Packages, bounded Narrator/Actor/Agenda/Reflection/Advisory views, explicit information-transfer events and structured authority provenance.

### Round 6.7 — World-advance scheduling and model-call budget

Approved: deterministic-first world advance, three Agenda step classes, relevance gating, bounded background deliberation, deterministic same-tick commits and event-driven fast-forward.

### Round 7 — Frontend information and interaction constraints

Approved: player-safe information access, required investigative/risk/Claim interactions and strict anti-leakage boundary; visual/UI/UX planning remains delegated.

### Round 8 — Content architecture

Approved: focused authored footprint, tiered NPC/content scale, reusable Case/anomaly/Claim structures, fragmented Eastbank Canon and explicit authored/generated boundaries.

### Round 8.5 — Signature Case roles and long-form mystery structure

Approved: eight distinct Signature Case responsibility slots, semi-open Cases 2–7, cross-source Revelation Predicates and a multidimensional Eastbank convergence.

### Round 8.6 — Minimum content production templates

Approved: Canon Core / Perspective Layer / Generation Envelope, common authority/disclosure metadata, and minimum production contracts for all major content asset classes.

### Round 9 — Package technical design

Approved: Package Data definitions, Lifecycle authority, Information perspectives, bounded Task Runtime, authority-first intent resolution, post-authority Narrator and current-gap policy.

### Round 9.5 — Lifecycle domain mapping and restricted Action API

Approved: physical authority layout, bounded game verbs, transactional Resolution/Promotion/Graph publication, v1 rule-based NPC responses and the Authority Transaction Bridge as the sole required v1 Core prerequisite.

### Round 9.6 — Information Views and Task Runtime mapping

Approved: disclosure-safe projection read models, seven Sources, five fixed Views, two investigation Graphs, four core Task classes, closed-by-default Knowledge/Memory and zero per-NPC static Views.

### Round 9.7 — Package Data layout and exact Core bridge contract

Approved: modular Package Data layout, `authority-transaction@1`, optional `authorityRuntime`, declarative transactions, bounded read/effect grants, atomic CAS publication and Turn-local safe receipts.

### Round 9.8 — Technical Freeze / Core Gap Gate

Approved: `authority-transaction@1` is the only blocking v1 Core prerequisite; authority is privately prepared before narration and atomically finalized with the assistant turn; provider failure is zero-mutation; retry/branch/Fortune semantics and the 12 Core verification gates are frozen.

### Round 10 — Implementation staging

Approved: P0 Core prerequisite followed by Package P1–P9, phase-specific reading/validation gates, frontend handoff, Record/HANDOFF lifecycle and v1 deferrals. The overall Plan is now Implementation Baseline v1.0.

The sequence may change if substantive design discoveries require it.

## Approval state

**Approved Implementation Baseline v1.0**

Pre-production design Rounds 1–10 are complete and frozen for implementation.

Implementation authorization is staged:

1. P0 `feat/authority-transaction` is complete; `docs:records/feat/authority-transaction.md` records the verified main baseline.
2. The P0 prerequisite gate is cleared and Package P1 is complete. Package P2–P9 retain their individual stage authorizations; P2 is complete and stopped at its stage boundary; P3 is complete; G2 Core support is integrated and recorded. P4 is complete; P5/P8 have not started. G1 remains resolved by the user-authorized Fortune-use clarification in gameplay.md 6.28.2 and technical-design.md 6.48.5. See the Package Record and sole live HANDOFF for evidence.
3. After P0, Package work proceeds in the independent long-lived `package` workspace under `original-occult-western-fantasy-game/`.
4. Material contradictions discovered during implementation reopen only the authoritative Plan module they affect; ordinary implementation details do not reopen design.

Frozen cross-module decisions are indexed in `decisions.md`. Exact implementation order and phase gates are authoritative in `implementation-staging.md`.

- approved P8 frontend Skill routing by adapter: Web/remote loads vendored copies from `skills`; Local/CLI/desktop uses installed local Skills first. Responsibility remains `frontend-design` → visual identity, `ui-ux-pro-max` → design-system/UX, `emil-design-eng` → interaction/motion polish, `web-design-guidelines` → final implementation audit.

## Material routing/design changes

- **2026-09-30 — Frontend-planning boundary:** Round 7 is intentionally lightweight. This Plan records only information-access, interaction and leakage constraints; visual design and detailed UX architecture are delegated to a frontend-specialized AI / frontend skill to avoid over-constraining later design quality.

- **2026-09-30 — Plan Bundle migration:** the previous 75 KB monolithic Plan was split by authority domain. No approved game-design decision was intentionally changed. `index.md` is now the only routing entrypoint; Round 3.8 reads `geography.md` first.
