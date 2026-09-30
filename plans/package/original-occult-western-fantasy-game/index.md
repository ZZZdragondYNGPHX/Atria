# Original Occult Western Fantasy Game — Plan Index

- **Task ID:** `package/original-occult-western-fantasy-game`
- **Primary Workspace (implementation):** `package`
- **Current stage:** Pre-production research and design discussion
- **Status:** Discussion Draft v0.12 — Round 3.8 approved; Round 3.9 opened; not approved for implementation
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
| `platform-and-gameplay.md` | Atria fit, provisional core loop/surfaces, external design references, open questions | `foundation.md` plus relevant domain modules |
| `decisions.md` | Compact cross-module frozen-decision index; links back to detailed authorities | all authoritative modules |

Detailed rules have one authoritative module. Do not copy them into another module merely for convenience; link back to the owner.

## Current route — Round 3.9

Required reading:

- `index.md`
- `institutions.md`

Load only when a faction question requires its authority:

- `geography.md` — Eastbank history, district placement, territorial facts;
- `society.md` — generic State / Capital / Academy institutional mechanics;
- `religion.md` — Church hierarchy, sacred Office, saints or religious jurisdiction.

Do not reload `metaphysics.md` or `platform-and-gameplay.md` by default for Round 3.9.

## Stage routing

| Discussion stage | Required modules | Status / routing note |
| --- | --- | --- |
| Round 1–2.6 | `index.md`, `foundation.md`, `metaphysics.md` | Approved; reopen only for a material contradiction |
| Round 3 | `index.md`, `society.md`; `metaphysics.md` only as needed | Approved |
| Round 3.5–3.6 | `index.md`, `religion.md`, `society.md` | Approved |
| Round 3.7–3.8 | `index.md`, `geography.md`; `society.md` / `religion.md` only as needed | Approved |
| Round 3.9 | `index.md`, `institutions.md`; authority dependencies only as needed | Current |
| Round 4 | `index.md`, `foundation.md`, `geography.md`, `society.md` | Create a dedicated player/starting-situation module once this round begins accumulating approved detail |
| Round 5 | `index.md`, `platform-and-gameplay.md` plus the future player module | Freeze core loop/failure model; split a dedicated gameplay module if needed |
| Round 6 | `index.md`, `platform-and-gameplay.md` plus affected authority modules | Create simulation/information module when design starts |
| Round 7 | `index.md`, `platform-and-gameplay.md` plus simulation module | Create UI module when design starts |
| Round 8 | `index.md` plus gameplay/simulation/UI and relevant world modules | Create content-architecture module when design starts |
| Round 9 | `index.md`, `platform-and-gameplay.md` plus approved system/content modules | Create Package technical-design module when design starts |
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

Define the playable institutional network, Eastbank evidence distribution and mutually dependent institutional conflicts.

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
- approved layered industrial-port city history and Eastbank Settlement as the first city-scale buried contradiction.

All unapproved elements remain open to revision.

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the previous 75 KB monolithic Plan was split by authority domain. No approved game-design decision was intentionally changed. `index.md` is now the only routing entrypoint; Round 3.8 reads `geography.md` first.
