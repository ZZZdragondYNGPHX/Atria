# Original Occult Western Fantasy Game — Plan Index

- **Task ID:** `package/original-occult-western-fantasy-game`
- **Primary Workspace (implementation):** `package`
- **Current stage:** Pre-production research and design discussion
- **Status:** Discussion Draft v0.30 — Rounds 9–9.6 approved; Round 9.7 opened; not approved for implementation
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
- Nothing is an implementation baseline until pre-production reaches explicit approval and implementation staging.

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
| `technical-design.md` | Round 9: Atria Package mapping, runtime contracts, data resources, tasks, lifecycle, information views and platform-gap audit | all approved system/content modules |
| `platform-and-gameplay.md` | Atria fit, provisional core loop/surfaces, external design references, open questions | `foundation.md` plus relevant domain modules |
| `decisions.md` | Compact cross-module frozen-decision index; links back to detailed authorities | all authoritative modules |

Detailed rules have one authoritative module. Do not copy them into another module merely for convenience; link back to the owner.

## Current route — Round 9.7

Required reading:

- `index.md`
- `decisions.md`
- `technical-design.md`

Load only when the mapping requires its authority:

- `simulation.md` — domains, clocks, projections, scheduling;
- `content-architecture.md` — Package Data content contracts;
- `gameplay.md` — resolution, Case and Outcome requirements;
- `player.md` — character creation and progression;
- `metaphysics.md` — Claim authority and invariants;
- `platform-and-gameplay.md` — verified platform-fit and frontend boundary.

Current Atria `main` contracts are implementation-fit evidence and must be revalidated before freezing mappings.

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
| Round 9 | `index.md`, `decisions.md`, `technical-design.md`; approved authority modules only as needed | Current |
| Round 10 | `index.md`, `decisions.md`, technical-design module | Freeze implementation stages and exact implementation-stage reading map |

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

Freeze modular Package Data resource IDs and define the minimum versioned Authority Transaction Bridge contract before implementation staging.

### Round 10 — Implementation staging

Freeze Codex-ready phases, validation criteria, Package branch layout and release strategy.

The sequence may change if substantive design discoveries require it.

## Approval state

Nothing in this document is yet an implementation baseline.

Currently carried forward from research:

- original occult Western fantasy rather than direct LoM conversion;
- world-law-first design;
- knowledge / investigation / identity as central systems;
- late-industrial / early-electrical-era research direction;
- independent faction/world progression;
- deliberate use of Atria Truth/Belief/Memory/Exposure architecture;
- avoidance of trivial renamed Sequence/Pathway/Potion structures;
- approved C → A → B metaphysical hierarchy;
- approved Breach / Investiture entry model;
- approved Claim / Anchor / Price / Jurisdiction progression grammar;
- approved Obligation / Exposure / Displacement Price families;
- approved modular builds constrained by self-consistency;
- approved cultural professions rather than cosmic classes;
- deterministic Native authority over supernatural mechanics;
- approved layered industrial-port city history and Eastbank Settlement as the first city-scale buried contradiction;
- approved interdependent city institution network with distributed evidence and independent Agendas;
- approved Civil Verifier starting role, second-death opening case and action-caused first Breach;
- approved controlled character creation with Personal Anchors and canon-safe background freedom;
- approved deterministic first-Claim flow using Breach Imprints, curated Claim Seeds and institution-dependent stabilization;
- approved core gameplay loop using resilient investigation, persistent consequences, time pressure, low-frequency high-risk violence and concrete downtime/Identity maintenance;
- approved Native-authoritative uncertainty resolution with bounded Fortune, risk preview and structured consequences;
- approved open Case architecture with world-owned Evidence, durable Settlement history and no quest-checklist ontology;
- approved Atria-native simulation authority with bounded perspectives, shared information graph, one world clock, Agenda state machines and tiered actor simulation;
- approved fourteen-domain simulation decomposition with derived state and Hard/Perspective/Intent write-authority separation;
- approved task-specific bounded Context Packages with explicit information-transfer events and no shared omniscient prompt;
- approved deterministic-first world scheduling with bounded background deliberation and event-driven fast-forward;
- approved lightweight frontend information/interaction constraints with detailed visual design delegated;
- approved content-scale architecture with focused authored depth, tiered NPCs, reusable Case/anomaly/Claim assets and fragmented Eastbank Canon;
- approved eight-case Signature network with distinct gameplay roles and predicate-based Eastbank convergence;
- approved structured content production templates with Canon/Perspective/Generation separation and no prose-as-authority dependency;
- approved top-level Atria Package mapping using Package Data / Lifecycle / Information / Task Runtime / authority-first Turn responsibilities;
- approved concrete runtime authority layout and restricted Action API, with one v1 Core prerequisite for atomic cross-authority transactions and safe resolver observation;
- approved disclosure-safe Information/Task mapping with seven Sources, five fixed Views, two bounded investigation Graphs and four core Task classes.

All unapproved elements remain open to revision.

## Material routing/design changes

- **2026-09-30 — Frontend-planning boundary:** Round 7 is intentionally lightweight. This Plan records only information-access, interaction and leakage constraints; visual design and detailed UX architecture are delegated to a frontend-specialized AI / frontend skill to avoid over-constraining later design quality.

- **2026-09-30 — Plan Bundle migration:** the previous 75 KB monolithic Plan was split by authority domain. No approved game-design decision was intentionally changed. `index.md` is now the only routing entrypoint; Round 3.8 reads `geography.md` first.
