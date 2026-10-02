# Long-Lived World — World Simulation

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Status:** Partially frozen / implementation not approved

## 1. Simulation principle

The long-lived world must change around the single persistent protagonist without attempting literal per-capita simulation of the entire city.

Simulation fidelity is relevance-tiered.

## 2. Actor lifecycle tiers

### Tier A — Core actors

Maintain full long-horizon state where applicable:

- chronological age and life stage;
- health and major impairments;
- occupation, office and career trajectory;
- important relationships;
- marriage/partnership/family;
- children and important descendants;
- residence and migration;
- retirement, disappearance and death;
- inheritance/succession;
- Claim and occult involvement;
- durable memories and history.

### Tier B — Supporting actors

Maintain reduced but real lifecycle state:

- age/life stage;
- occupation and major role changes;
- important relationships and family;
- migration/retirement/death;
- major historical effects.

Sustained player or world relevance may promote Tier B to Tier A.

### Tier C — Aggregate population

Tier C is not individually advanced across decades.

Population-level processes represent background births, deaths, migration, employment, institutional intake and demographic turnover.

A person becomes a canonical actor only when relevance requires instantiation.

## 3. Causal actor creation

New actors must have a reason to enter the world.

Examples:

- birth into an existing family;
- immigration or displacement;
- graduation and professional entry;
- hiring or promotion;
- marriage or household formation;
- institutional recruitment;
- business expansion;
- religious mission;
- case involvement;
- war, disaster or economic displacement;
- player-created vacancy or institutional disruption.

Generation begins from the causal role and world constraints, then fills identity and characterization.

## 4. Generational continuity

Important NPC descendants may grow into significant adult actors.

Generational relations remain part of world truth even though the player never changes protagonist.

The system should support meaningful long-term consequences such as:

- descendants inheriting attitudes toward the protagonist;
- family reputations persisting across generations;
- children entering institutions affected by the protagonist;
- old favors, grudges and secrets resurfacing through later generations.

## 5. Institutional identity and office holders

Institutional identity persists independently from leadership.

Track separately:

- institution history and durable memory;
- offices/roles;
- current office holders;
- succession rules;
- leadership ideology/agenda modifiers;
- property, obligations, claims and reputation.

Leadership change may alter policy and agenda while preserving institutional history.

## 6. Actor exit and historical compaction

Death, retirement, disappearance and migration do not erase an actor.

Actors may leave hot simulation while retaining compact historical records including:

- identity;
- important relationships;
- major life events;
- occupation/office history;
- family and descendants;
- death/exit circumstances;
- inheritance and unresolved obligations;
- important secrets and Claims;
- institutional/world impact;
- unresolved hooks that can surface later.

## 7. Authority boundary

Model-assisted generation may propose names, prose characterization, constrained background details and other presentation-level content.

Runtime Authority must validate and canonize:

- dates and ages;
- birth/death chronology;
- kinship;
- role eligibility;
- office succession;
- whether a vacancy exists;
- historical acquaintance feasibility;
- institutional membership;
- world-state compatibility.

The model cannot silently rewrite historical truth.

## 8. Still open

- family/descendant graph depth;
- exact birth/childhood abstraction;
- mortality rates and health model;
- migration and city demographic model;
- succession algorithms;
- institution birth/merge/split/dissolution;
- historical storage tiers and compaction limits;
- exact model-deliberation contracts.
