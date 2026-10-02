# Original Occult Western Fantasy — Long-Lived World Plan

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Primary Workspace:** Package  
**Implementation branch:** `refactor/original-occult-western-fantasy-long-lived-world` (branched from `package@79447c0b8aca028c6929ff8f9842f8835676191f`)  
**Plan status:** Discussion / not approved for implementation  
**Plan generation:** v0.9

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
- `verification.md` — 1k/5k/10k-turn and multi-year simulation/restore/replay gates.
- `implementation-staging.md` — implementation phases, dependencies, validation gates and release criteria.

Only create/fill these modules when the corresponding discussion has enough frozen decisions.

## 5. Working architecture hypothesis

The current best starting hypothesis is a layered clock:

`Scene → Day → Week → Month/Season → Year → Era`

with different simulation fidelity by temporal distance and entity relevance.

Likewise, long-term persistence should probably separate:

- **hot state** — current scenes, active cases, immediate actors;
- **warm state** — current season/year institutions, recurring relationships, unresolved claims;
- **cold history** — compacted summaries and durable consequences;
- **canon facts** — facts that cannot be silently rewritten.

This is a hypothesis for discussion, not an approved implementation decision.

## 6. Success criteria to freeze before implementation

At minimum the final approved plan must define:

- what “thousands of turns” means for validation;
- what “many years” means for validation;
- whether the player character ages and can die/retire;
- whether play can continue through a successor character;
- whether family/children are simulated;
- how NPCs enter and leave the world;
- how institutions replace leaders and evolve;
- how renewable cases are generated without degenerating into template spam;
- how world history is summarized/compacted;
- how old consequences remain discoverable decades later;
- state/save size expectations;
- determinism/replay expectations;
- exact soak-test gates.

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

Status: active.

Questions to freeze:

1. Does a century-long save allow the world to progress technologically and socially, or should the setting remain in a broadly fixed occult-western era?
2. Can infrastructure such as rail, electricity, telephony, automobiles, radio and later systems appear if enough time passes?
3. Can laws, policing, medicine, finance, education, religion and public attitudes materially change across eras?
4. Should world evolution follow a mostly authored alternate-history trajectory, be primarily emergent from simulation, or use authored historical rails with emergent deviations?
5. How strongly may occult events and player actions alter technological/social development?
6. How should old skills, institutions, businesses and properties become obsolete or adapt?
7. Should Era transitions be explicit world milestones with systemic rule changes?

No implementation starts until the discussion rounds are explicitly approved.

## 8. Current checkpoint

- `main@fa0c5df4f45b91c7750ed63f87c32100df68ad32`
- `package@79447c0b8aca028c6929ff8f9842f8835676191f`
- `docs@a0c341de4835ecc1ee890ae68bf9e118993ae451`
- task branch created from current `package`;
- no game implementation changes made yet.
