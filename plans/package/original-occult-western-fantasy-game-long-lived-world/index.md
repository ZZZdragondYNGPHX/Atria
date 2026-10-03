# Original Occult Western Fantasy — Long-Lived World Plan

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Primary Workspace:** Package  
**Implementation branch:** `refactor/original-occult-western-fantasy-long-lived-world` (branched from `package@79447c0b8aca028c6929ff8f9842f8835676191f`)  
**Plan status:** Approved Implementation Plan v1.2 — Phase 6 focused validation

**Plan generation:** v1.2

2026-10-03 user amendment: minimize date-validation wall time. Phase 6 uses the
100-content-turn focused regional acceptance in verification.md; sparse 50-year
calendar coverage preserves decades-away and generational checks. The original
5k regional soak is optional, not a stage blocker. Phase 8/Gate C and the existing
Phase 7 UI specification remain unchanged. Live stage state is in HANDOFF.md.

## 1. Why this plan exists

The released `original-occult-western-fantasy-game` v1.0.0 is a complete bounded campaign, but it is not yet a long-lived sandbox.

Verified v1 constraints include:

- campaign time is hard-bounded to 30 days;
- Day 31 is rejected by authority;
- time design is primarily Scene / Day / Arc, with Arc measured in days to weeks;
- several procedural case families still use bounded instance slots rather than genuinely renewable matter generation;
- the city has background agenda pressure but not a complete autonomous long-horizon lifecycle;
- there is no frozen design for aging, retirement, death/succession, family generations, office succession, long-horizon institutional turnover, or decade-scale history;
- v1 validation proves a complete finite campaign, not 1k/5k/10k-turn or multi-year soak behavior.

This plan does **not** redefine v1.0 as incomplete. It defines a new expansion/rearchitecture target above that finished baseline.

## 2. Desired product outcome

The target is a single-save occult western-fantasy world that can remain coherent and generative for **thousands of player turns and many in-world years**, without depending on endless ad-hoc prose invention from the model.

The intended end state should support all of the following:

1. The existing v1 campaign remains a valid opening-era experience.
2. The world continues after the original Eastbank-era bounded campaign instead of stopping at Day 30.
3. Cases, institutions, relationships, claims, careers, and social conditions can renew or transform.
4. Long-lived entities can age, leave roles, die, disappear, retire, or be replaced where appropriate.
5. Historical state can be compacted so a decades-long save does not grow without bound.
6. Old events continue to matter through summaries, reputation, institutions, property, relationships, and claims rather than through unlimited raw-log retention.
7. The game remains deterministic/authoritative where Atria requires authority and uses model deliberation only inside explicit bounded contracts.
8. Long-horizon play is verified by dedicated simulation and soak tests rather than assumed from short campaign tests.

## 3. Non-goals at this stage

Until discussion freezes them, this plan does not assume:

- literal simulation of every city resident;
- a fully modeled macroeconomy;
- unrestricted model-created canon;
- mandatory children/family gameplay;
- a single fixed campaign length such as exactly 30 or 50 years;
- that every v1 content structure must remain backward-compatible internally.

The project has no need to preserve legacy save compatibility unless this is explicitly reintroduced during discussion.

## 4. Design modules

The plan will be split as decisions become stable:

- `longevity-model.md` — time hierarchy, campaign horizon, aging/lifecycle, generational continuity.
- `world-simulation.md` — institutions, actors, agenda renewal, city change, succession and background simulation.
- `time-model.md` — hierarchical time, fast-forward, interruption, stances and long-horizon resolution.
- `content-renewal.md` — renewable cases, claims, NPCs, locations/events, procedural constraints and anti-repetition.
- `history-memory.md` — event compaction, memory tiers, archival summaries, save-size/context control.
- `family-relationships.md` — romance, marriage, children, descendants, inheritance and social norms.
- `progression-continuity.md` — career, resources, long-term identity and non-family continuity.
- `era-evolution.md` — technology, infrastructure, law, culture and occult modernization across eras.
- `world-scope.md` — multi-region simulation, travel, hub promotion/demotion and macro-world integration.
- `macro-history.md` — economy, governance, war, migration, public health, social movements and large-scale occult history.
- `delegation-agency.md` — agents, delegation, organizational hierarchy and autonomous institutional agendas.
- `verification.md` — 1k/5k/10k-turn and multi-year simulation/restore/replay gates.
- `implementation-staging.md` — implementation phases, dependencies, validation gates and release criteria.
- `player-facing-experience.md` — Phase 7 implementation-ready UI/UX: navigation,
  visual tokens, page/flow contracts, safe data wiring, state handling and browser
  acceptance matrix; read when implementing or reviewing Phase 7.

Only create/fill these modules when the corresponding discussion has enough frozen decisions.

## 5. Frozen architecture summary

The approved architecture uses a layered clock:

`Scene → Day → Week → Month/Season → Year → Era`

with different simulation fidelity by temporal distance and entity relevance.

Likewise, long-term persistence should probably separate:

- **hot state** — current scenes, active cases, immediate actors;
- **warm state** — current season/year institutions, recurring relationships, unresolved claims;
- **cold history** — compacted summaries and durable consequences;
- **canon facts** — facts that cannot be silently rewritten.

These layers are now approved design boundaries; detailed schemas remain implementation work inside the relevant phase.

## 6. Frozen completion criteria

The project is complete only when the approved architecture is implemented and the hard release gates pass.

Key frozen criteria include:

- one continuous player protagonist across the entire save;
- setting-native supernatural longevity with non-terminal ordinary death/reconstruction;
- multi-generation NPC/family and institutional lifecycle;
- open-ended hierarchical time with multi-decade fast-forward;
- renewable history-aware content and evolving cities/institutions;
- tiered historical compaction plus Canonical Fact Ledger and durable artifacts;
- horizontal long-term progression, assets, identity continuity and delegation;
- systemic Era evolution into modern/later alternate-history technology;
- dynamically scoped multi-region world;
- macro history without full grand-strategy simulation;
- optional city/national/international player influence earned through causal leverage;
- **10,000 authoritative turns + at least 200 in-world years** as the final hard release gate;
- sublinear history/context growth and century-scale historical retrieval;
- actual Save/Restore, runtime and UI evidence where required.

Detailed rules live in the domain modules and `verification.md`.

## 7. Discussion rounds

### Round 0 — Audit baseline

Status: complete.

Findings:

- v1.0.0 is a finished bounded campaign;
- the 30-day ceiling is a real runtime authority rule, not merely documentation;
- content counts generally meet the low end of the original v1 target ranges;
- procedural/world systems are structurally promising but still bounded;
- the original plan was designed around days-to-weeks rather than decades.

### Round 1 — Campaign lifetime and player continuity

Status: complete.

Frozen:

- the entire save is always controlled through one protagonist;
- there is no heir/successor/new-investigator handoff as a core continuation model;
- the protagonist may remain playable for decades or centuries through setting-consistent occult/supernatural longevity;
- long-horizon design must therefore preserve one continuous identity while the surrounding human world changes generations around them;
- family/children may exist as world relationships, but never as a mandatory player-continuity mechanism.

### Round 2 — Protagonist longevity model

Status: complete.

Frozen:

- longevity is a setting-native long-horizon system rather than a trivial `aging=false` flag;
- normal viable routes should eventually offer at least one path to supernatural longevity;
- the protagonist keeps one continuous identity across decades or centuries;
- chronological age, apparent age, and public identity age are separate concepts;
- long life should create slow-burn consequences such as identity exposure, Claim escalation, institutional attention, social alienation, old obligations returning, or other setting-consistent costs;
- routine death does not end the save;
- major injury, bodily death, ritual failure, disappearance, reconstruction, or delayed return may impose durable costs while the world continues to advance;
- a true irreversible death may exist only as an exceptional, explicit end-state and must not be triggered casually by ordinary play.

Detailed authority: `longevity-model.md`.

### Round 3 — NPC lifecycle and generational social change

Status: complete.

Frozen:

- Tier A actors receive full long-horizon lifecycle treatment: age, health, occupation, relationships, family, retirement, death, succession and durable history;
- Tier B actors receive reduced but real lifecycle simulation and may promote to Tier A through sustained relevance;
- Tier C population is not individually simulated for decades; it is handled through aggregate world processes until a person becomes relevant enough to instantiate;
- important NPC children and later descendants may grow into meaningful actors while the player remains the same protagonist;
- new NPCs must enter the world for causal reasons such as birth, migration, hiring, promotion, marriage, recruitment, institutional expansion, case involvement, disaster, war or player-created vacancies;
- institutions separate durable institutional identity from changing office holders and leadership;
- institutions retain organizational memory across leadership changes;
- dead/retired/absent actors are compacted into historical records rather than deleted from world truth;
- model generation may propose constrained identities, backgrounds and characterization, but Runtime Authority owns whether historical facts, dates, relationships, succession and eligibility are valid.

Detailed authority: `world-simulation.md`.

### Round 4 — Family, descendants and century-scale relationships

Status: complete.

Frozen:

- the protagonist may form romances, marry, maintain long-term partnerships, have biological children, adopt children, separate, become widowed, and remarry;
- family members age normally unless they separately obtain a setting-consistent longevity mechanism;
- children and important descendants can grow into Tier A/B actors and continue producing later generations;
- the family graph may span multiple generations, but detailed simulation is relevance-scoped rather than exhaustive;
- ordinary childcare and uneventful years are abstracted; high-impact lifecycle milestones are simulated and recorded;
- property, reputation, secrets, grudges, favors, institutional ties and selected supernatural consequences may pass across generations;
- longevity does not automatically spread to spouses, partners or descendants;
- extending longevity to another person is an intentional, rare, costly and narratively significant act, and the other person may refuse;
- the protagonist may outlive spouses, children, grandchildren or later descendants;
- family history participates in identity exposure: later generations can discover evidence that the protagonist has not aged;
- surface society generally treats relatively traditional one-to-one partnership/marriage as the default norm;
- this social default is not a hard system restriction: affairs, secret partners, informal unions, same-sex relationships, multi-partner arrangements and other structures may exist, but their visibility and consequences depend on era, locality, class, law, religion and institution.

Detailed authority: `family-relationships.md`.

### Round 5 — Time scale, fast-forward and world resolution

Status: complete.

Frozen:

- the world timeline has no artificial campaign end date;
- authoritative time expands above Day into Week / Month / Season / Year / Era;
- Era represents historically meaningful structural periods rather than a fixed-duration tick;
- players may request long fast-forward directly, including multi-year or multi-decade spans;
- long fast-forward is event-driven and hierarchical rather than implemented as tens of thousands of full Day ticks;
- fast-forward may be interrupted automatically by high-impact events that reasonably demand player attention;
- before long fast-forward, the protagonist may define long-term stances for career, family, occult practice, social posture, wealth and investigation;
- unresolved cases do not universally block time advancement: the player may abandon them, delegate them, or allow the world to resolve/fail them independently;
- the world continues to act during protagonist inactivity or absence;
- low-information periods are compressed, while high-impact periods expand back into finer simulation;
- historical detail is progressively summarized at longer temporal distance.

Detailed authority: `time-model.md`.

### Round 6 — Renewable content and anti-repetition

Status: complete.

Frozen:

- renewable content uses finite high-quality grammars combined with current world state rather than fixed instance slots;
- matter generation composes causal triggers, involved entities, interests, hidden facts, occult factors, institutional pressure, time pressure, historical ties and possible evolution;
- model deliberation may fill bounded narrative/detail gaps, while Runtime Authority validates canon and structural legality;
- major resolved content may leave compact Historical Hooks that can resurface decades later;
- content can die as well as appear: cases close, businesses fail, institutions dissolve, locations change use, districts decline or rebuild;
- the opening map and institution list are only the initial historical state, not permanent world fixtures;
- new locations, districts, businesses, factions and institutions may emerge causally over time;
- old ones may rename, merge, split, relocate, burn, be demolished, decline, close or disappear;
- generated content must apply cooldown and semantic-distance checks to avoid structural repetition, not merely repeated labels;
- ephemeral matters are aggressively compactable, while world-changing outcomes promote into durable canonical history.

Detailed authority: `content-renewal.md`.

### Round 7 — History compaction, memory and long-term retrieval

Status: complete.

Frozen:

- historical state uses multiple retention tiers rather than keeping every turn at full fidelity forever;
- the baseline tiers are Hot State, Warm History, Cold History and Archive;
- historical compression preserves durable consequences and causal links while discarding low-value transient detail;
- a separate Canonical Fact Ledger stores precise facts that later world logic may depend on and must not be lost through narrative summarization;
- Historical Hooks remain reusable seeds for future content after their source matter is compacted;
- durable artifacts such as photographs, letters, contracts, wills, newspapers, case files, diaries, property records, ritual records and heirlooms persist independently and may reintroduce old information into current play;
- World Truth and Protagonist Memory are separate layers;
- the protagonist may naturally forget or blur ordinary old details across decades or centuries while the world retains authoritative truth;
- major events, strong relationships, intentionally recorded information and player-marked memories remain clearer for longer;
- memory loss must remain light-touch and must not routinely contradict what the player clearly remembers;
- a Chronicle / Archive interface should let the player inspect historical timelines by year, person, family, location, institution, case, Claim and Era;
- active model context should retrieve only relevant historical slices rather than replay the entire save;
- long-run save/context growth must be sublinear with turn count through compaction and archival indexing.

Detailed authority: `history-memory.md`.

### Round 8 — Progression, wealth, career and century-scale power

Status: complete.

Frozen:

- early play may contain conventional vertical skill growth, but long-horizon progression shifts primarily toward horizontal capability, access, relationships, assets, obligations and specialized occult authority;
- numeric power does not scale without bound across decades;
- wealth, businesses and property are world entities with provenance, risk, depreciation, seizure, destruction, inheritance and legal/identity dependencies rather than permanent abstract currency;
- the protagonist may change careers repeatedly across decades and may hold multiple social roles where world rules permit;
- careers primarily grant permissions, networks, duties, access and liabilities rather than flat stat bonuses;
- public/legal identities are distinct from the persistent protagonist; retiring or replacing a public identity creates real continuity problems for property, licenses, reputation, banking, marriage, criminal records and institutional standing;
- supernatural power may grow substantially but should create new exposure, Claim pressure, countermeasures, obligations and vulnerabilities;
- long-term challenge does not use universal level scaling;
- as the protagonist becomes personally stronger, challenge shifts toward family, institutions, property, law, social legitimacy, history, identity exposure, Claim and occult obligations;
- bodily death/reconstruction may damage embodied progress while preserving most deep protagonist continuity;
- the protagonist may, through actual world play, become a city-scale magnate, institutional leader, religious authority, occult power broker or comparable major figure;
- city-scale power is optional rather than mandatory: a low-profile century-long life remains a valid play style.

Detailed authority: `progression-continuity.md`.

### Round 9 — Era evolution: technology, infrastructure, law and culture

Status: complete.

Frozen:

- the setting does not remain permanently locked to the opening occult-western technological/social era;
- sufficiently long play may progress into modern and potentially later technological eras;
- technology, infrastructure, industry, law, finance, medicine, education, religion, media and social norms may materially evolve;
- occult knowledge also evolves: anomaly classification, Claim theory, ritual safety, countermeasures, occult medicine, regulation and industrialization can develop over time;
- world development follows an authored baseline/inertia combined with world-state-driven divergence rather than a fixed real-world historical script;
- player actions and major occult events may accelerate, delay, redirect or suppress developments when they have credible causal leverage;
- old businesses, skills, institutions and properties may become obsolete, adapt, merge, decline or disappear as eras change;
- Era transitions are systemic rule changes, not merely labels or calendar milestones;
- Era changes may alter available careers, industries, infrastructure, artifacts, laws, institution powers, content grammars, transport, communication and city-growth rules;
- Era transitions are condition-driven rather than automatically firing on fixed year numbers;
- content generation should evolve with the era so century-later cases and conflicts are structurally different from opening-era ones.

Detailed authority: `era-evolution.md`.

### Round 10 — Scope of the world beyond the starting city

Status: complete.

Frozen:

- the opening city is the first fully realized Active Hub, not the permanent boundary of play;
- the protagonist may permanently relocate, live abroad for decades, own assets across regions and maintain multiple long-term hubs;
- regional simulation uses fidelity tiers: Active Hub, Warm Region and Cold World;
- regions continue to advance when the protagonist leaves; leaving a city never freezes its clock;
- a low-fidelity region can promote into an Active Hub when sustained player relevance requires detailed instantiation;
- promoted regions must materialize consistently from already-existing macro history rather than being generated as if they began to exist at first visit;
- old hubs may demote to Warm Region while preserving durable relationships, assets, institutions, family, hooks and history;
- travel consumes real world time according to era-appropriate transport and creates absence consequences;
- a Macro World Layer tracks coarse national/international developments such as wars, migration, crises, technological diffusion, religious movements, major institutions and large occult events;
- macro events may materially affect local hubs without requiring literal per-person world simulation;
- the protagonist may eventually operate across multiple cities or internationally through actual accumulated assets, agents, institutions and networks;
- multi-region scale is earned through play and does not automatically grant global power.

Detailed authority: `world-scope.md`.

### Round 11 — Macro history: politics, war, economy and social shocks

Status: complete.

Frozen:

- the macro layer explicitly represents economic cycles, governance/law, war, migration/demography, public health/disaster, religious/social movements and large occult events;
- macro history uses curated event grammars plus state-driven resolution rather than a full grand-strategy simulation;
- economic conditions produce real downstream effects on employment, rent, property, business viability, credit, migration, crime and institutional pressure;
- wars resolve as macro campaigns/phases unless a relevant region is promoted into detailed simulation, and may affect conscription, casualties, refugees, production, prices, technology and occult activity;
- law and governance are modeled through offices, institutions, factions, public pressure and durable legal history rather than isolated booleans;
- population is represented structurally at macro scale and instantiated into individual actors only when relevance requires it;
- religious and social movements may rise, split, institutionalize, decline or disappear;
- macro events normally enter detailed play only when they intersect with the protagonist's people, assets, institutions, Claims, location or explicit interests;
- player influence is leverage-based and may expand from personal/local to city/regional/national/international scale through actual accumulated capital, organizations, relationships and occult power;
- national/international influence is an optional extreme-late-game path, never an automatic reward for surviving long enough;
- macro history must remain subordinate to the personal/occult game rather than becoming a standalone strategy simulation.

Detailed authority: `macro-history.md`.

### Round 12 — Delegation, agents and long-term operation

Status: complete.

Frozen:

- delegation is a first-class long-horizon system for cases, businesses, property, institutions, research, logistics and other scalable work;
- named agents are real actors with competence, loyalty, ambition, relationships, secrets, Claims, values and lifecycle rather than abstract efficiency numbers;
- delegation is defined by policy, authority boundaries and escalation rules rather than constant micromanagement;
- organizations may develop internal hierarchy so large-scale play can be managed through leaders, departments and regional branches rather than direct control of every member;
- delegated outcomes depend on competence, information, resources, loyalty, environment and instruction quality;
- delegation may fail, drift, conceal problems, create corruption, trigger betrayal or produce unexpected success;
- only matters outside delegated authority or above configured significance thresholds should routinely interrupt the protagonist;
- family logistics may be delegated, but delegation cannot substitute for emotional presence or preserve relationships automatically;
- ordinary investigations may be delegated and automatically escalate back to the protagonist if they become important;
- late-game institutions may accept long-term organizational goals rather than only specific tasks;
- player-founded organizations may accumulate culture, leadership interests and institutional memory that diverge from the founder's personal agenda;
- in extreme cases, an organization founded or controlled by the protagonist may resist, constrain or oppose the protagonist if its evolved interests conflict with them.

Detailed authority: `delegation-agency.md`.

### Round 13 — Long-run verification and release gates

Status: complete.

Frozen:

- the final Long-Lived World release gate requires at least **10,000 authoritative turns** in one continuous save/world;
- the final release gate requires at least **200 in-world years** of continuous world history;
- an authoritative turn means a committed interaction that mutates authoritative world state, not merely a model response or no-op chat turn;
- development may use lower gates such as 1k-turn/10-year and 5k-turn/50-year tests, but neither substitutes for the final gate;
- the final soak must exercise multiple NPC generations, institution leadership turnover, organization creation/dissolution, changing geography, multiple Era transitions, macro-history events and renewable content;
- the final soak must include at least one multi-region migration path and verify that departed regions continue evolving;
- the final soak must include protagonist death/reconstruction events and verify non-terminal continuity with durable consequences;
- Save/Restore must be exercised around lifecycle, Era, region, institutional and death/reconstruction transitions;
- century-scale retrieval must recover correct old facts/artifacts/hooks after many decades of compaction;
- chronology, kinship, ownership, office tenure, institution lineage, artifact provenance and canonical facts must remain internally consistent;
- anti-repetition auditing must detect structural/semantic repetition rather than only repeated names or pattern IDs;
- later generated matters should demonstrably reuse authentic prior history, family, artifacts, institutions and Historical Hooks;
- save/history storage and active model projection must show sublinear growth relative to turn count through compaction and retrieval;
- long fast-forward must prove hierarchical/event-driven resolution rather than secretly executing every intervening day at full fidelity;
- deterministic fixtures plus a seed matrix plus long-running soak tests are required; a single favorable seed is insufficient;
- failure to meet these gates blocks declaring the Long-Lived World project complete.

Detailed authority: `verification.md`.

### Round 14 — Implementation staging and Astra handoff

Status: complete.

Frozen:

- implementation uses 8 phases in the dependency order defined by `implementation-staging.md`;
- the whole project stays on `refactor/original-occult-western-fantasy-long-lived-world` until final integration;
- each phase implements, validates, commits/pushes, updates the same Record and HANDOFF, then stops;
- the v1 `releases/1.0.0.atria` artifact remains unchanged;
- the long-lived-world release target is `2.0.0`;
- compatibility with old v1 save files is not required;
- the old 30-day campaign is retained as a regression scenario/fixture where practical, not as the global world authority limit;
- Phase 1 removes the global Day 30 ceiling and establishes the long-horizon runtime foundation;
- the full 10k-turn / 200-year hard gate runs in Phase 8.

Detailed authority: `implementation-staging.md`.

## 8. Implementation checkpoint

- task branch: `refactor/original-occult-western-fantasy-long-lived-world`
- branch start before Phase 1: `79447c0b8aca028c6929ff8f9842f8835676191f`
- source workspace: `package`
- target release: `2.0.0`
- implementation checkpoint at this refinement: **Phases 1–6 complete; Phase 7 next, not started**
- the 2026-10-03 Phase 7 UX refinement changes planning and Package document
  routing only; it does not implement Phase 7 or authorize skipping Phases 5–6
- live continuation state is maintained in `docs:HANDOFF.md`
- permanent implementation history is maintained in `records/package/original-occult-western-fantasy-game-long-lived-world.md`
