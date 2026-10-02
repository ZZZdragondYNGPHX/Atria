# Original Occult Western Fantasy — Long-Lived World Plan

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Primary Workspace:** Package  
**Implementation branch:** `refactor/original-occult-western-fantasy-long-lived-world` (branched from `package@79447c0b8aca028c6929ff8f9842f8835676191f`)  
**Plan status:** Discussion / not approved for implementation  
**Plan generation:** v0.3

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
- `content-renewal.md` — renewable cases, claims, NPCs, locations/events, procedural constraints and anti-repetition.
- `history-memory.md` — event compaction, memory tiers, archival summaries, save-size/context control.
- `progression-continuity.md` — career, relationships, resources, retirement/continuation and possible successor play.
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

Status: active.

Questions to freeze:

1. Which NPC tiers should actually age, retire, die, marry, have children, move away, or change occupation?
2. How should new NPCs enter the world without requiring full population simulation?
3. Should important NPC children be able to grow into meaningful adults over decades?
4. How should institutions replace leaders and preserve continuity across generations?
5. What information about dead/retired NPCs remains active history versus archived history?
6. How much of this should be deterministic simulation versus bounded AI-assisted generation?

No implementation starts until the discussion rounds are explicitly approved.

## 8. Current checkpoint

- `main@fa0c5df4f45b91c7750ed63f87c32100df68ad32`
- `package@79447c0b8aca028c6929ff8f9842f8835676191f`
- `docs@a0c341de4835ecc1ee890ae68bf9e118993ae451`
- task branch created from current `package`;
- no game implementation changes made yet.
