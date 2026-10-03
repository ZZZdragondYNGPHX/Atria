# Original Occult Western Fantasy — Long-Lived World Implementation Staging

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Primary Workspace:** Package  
**Implementation branch:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Target release:** `2.0.0`  
**Legacy save compatibility:** not required  
**Status:** Approved implementation staging

## 1. Global execution rules

The full project uses one task branch for all implementation phases.

At every phase boundary:

1. implement only the current phase;
2. run the phase-specific validation actually available;
3. fix ordinary failures before stopping;
4. commit and push the task branch;
5. update the single permanent Record;
6. update the single live `docs:HANDOFF.md`;
7. provide the next-phase bootstrap prompt;
8. stop.

Do not open a new implementation branch per phase.

Do not merge `main` into Package workspaces.

Do not start the next formal phase in the same work round.

## 2. Release and compatibility policy

- `releases/1.0.0.atria` is historical evidence and must be retained unchanged.
- The old v1 P1–P9 completion record remains historically valid.
- The long-lived-world architecture may break v1 save compatibility.
- No migration layer for existing 1.0 saves is required.
- The v1 opening campaign and Eastbank path should remain usable as regression fixtures where technically practical, but internal schemas may be reworked.
- Final release target is `releases/2.0.0.atria`; do not overwrite `1.0.0.atria`.

## 3. Phase map

### Phase 1 — Long-Horizon Runtime Foundation

**Purpose:** remove the finite-campaign runtime ceiling and establish the time/identity/provenance foundations that every later phase depends on.

**Read:**

- `index.md`
- `decisions.md`
- `implementation-staging.md`
- `time-model.md`
- `verification.md`
- only directly relevant current Package runtime/schema/tests

**Implement:**

- replace the hard Day 0–30 authority assumption with an open-ended authoritative calendar;
- establish a representation capable of Scene / Day / Week / Month / Season / Year / Era without requiring every layer to be fully simulated yet;
- remove Day 31 rejection as the normal world rule;
- add stable chronology primitives and ordering;
- establish stable persistent entity/world identifiers needed for multi-decade history;
- establish provenance/identity primitives needed by later ownership, artifacts and public identities;
- introduce the long-horizon time-advance transaction/resolver skeleton;
- support multi-year requested advancement at the API/schema level without implementing later lifecycle/macros prematurely;
- establish long-term stance storage/contracts needed by later resolvers;
- preserve the v1 bounded campaign as an explicit regression scenario/fixture rather than as the global authority ceiling;
- update Save/Restore schemas for the new temporal foundation.

**Do not implement yet:**

- family generations;
- full aging/death;
- history compaction;
- renewable content;
- business/wealth expansion;
- multi-region world;
- macro history;
- final UX.

**Exit evidence:**

- Day 31 and later dates are valid in the new world model;
- year rollover is correct;
- long-span advancement does not depend on the former Day 30 limit;
- Save/Restore preserves new time/identity state;
- existing v1 opening/Eastbank regression fixtures still run to the extent their behavior is intentionally preserved;
- no claim of 1k/10y Gate A yet unless Phase 2 compaction is already present (it should not be pulled forward merely to satisfy the gate).

Stop after Phase 1.

### Phase 2 — History / Memory / Compaction Core

**Purpose:** make long-lived state sustainable before large lifecycle/content expansion.

**Read:**

- `index.md`
- `implementation-staging.md`
- `history-memory.md`
- `verification.md`

**Implement:**

- Hot / Warm / Cold / Archive retention;
- Canonical Fact Ledger;
- Historical Hook state;
- durable Artifact/provenance state;
- World Truth vs Protagonist Memory separation;
- compaction transactions and archival indexes;
- selective historical retrieval/projection;
- Chronicle backend/query contract;
- growth instrumentation.

**Exit evidence:**

- 1k authoritative turns / 10 in-world years development gate;
- repeated Save/Restore;
- early Century-Retrieval analogue;
- evidence that active projection/raw retention is not simply linear with turn count.

Stop after Phase 2.

### Phase 3 — Human Lifetime / Family / Institution Lifecycle

**Purpose:** make people and institutions genuinely live through decades.

**Read:**

- `index.md`
- `implementation-staging.md`
- `longevity-model.md`
- `world-simulation.md`
- `family-relationships.md`
- `history-memory.md`
- `verification.md`

**Implement:**

- Tier A/B/C lifecycle;
- birth, maturation, aging, retirement, disappearance and death;
- causal actor entry/promotion;
- romance/marriage/partnership/separation/widowhood/remarriage;
- biological/adoptive children and relevance-scaled multi-generation family graph;
- inheritance foundations;
- office/office-holder separation and institutional succession;
- historical compaction of dead/retired actors;
- protagonist chronological/apparent/identity ages;
- longevity-route foundation;
- ordinary death as non-terminal continuity;
- reconstruction/return with durable consequences.

**Exit evidence:**

- multi-decade deterministic fixtures with genuine generational change;
- family chronology invariants;
- leadership succession;
- Save/Restore around birth/death/succession/reconstruction.

Stop after Phase 3.

### Phase 4 — Renewable World Content

**Purpose:** replace bounded content slots with continuously renewable, history-aware world generation.

**Read:**

- `index.md`
- `implementation-staging.md`
- `content-renewal.md`
- `world-simulation.md`
- `history-memory.md`
- `verification.md`

**Implement:**

- curated grammar-driven Matter generation;
- world-state composition;
- bounded model-deliberation contracts;
- Historical Hook reuse;
- semantic-distance/cooldown anti-repetition;
- ephemeral-to-canonical promotion;
- causal NPC creation;
- location/business/institution lifecycle;
- organization creation/merge/split/dissolution;
- district/city evolution foundations;
- old-case resurfacing.

**Exit evidence:**

- first full 5k-turn / 50-year Gate B candidate;
- meaningful new content still appears late in the run;
- later content legitimately reuses accumulated history;
- semantic repetition audit shows no obvious template collapse.

Stop after Phase 4.

### Phase 5 — Progression / Wealth / Delegation / Organization

**Purpose:** let the protagonist scale from individual operator to optional city-scale actor without micromanagement or numeric runaway.

**Read:**

- `index.md`
- `implementation-staging.md`
- `progression-continuity.md`
- `delegation-agency.md`
- `family-relationships.md`
- `verification.md`

**Implement:**

- early vertical / long-term horizontal progression;
- career changes and role-based permissions/obligations;
- public/legal identity lifecycle;
- property, ownership and asset provenance;
- business/wealth lifecycle;
- agent delegation contracts;
- policy / authority / escalation;
- organizational hierarchy and aggregate lower ranks;
- corruption, betrayal, succession and hidden failure;
- player-founded organizational Agenda drift;
- optional city-scale influence.

**Exit evidence:**

- delegated multi-year operation works without constant interruption;
- agent/organization failure changes actual world state;
- identity changes interact coherently with property/roles;
- organization autonomy can diverge from founder direction.

Stop after Phase 5.

### Phase 6 — Multi-Region / Era / Macro History

**Purpose:** expand a stable long-lived city into a changing multi-region world and alternate history.

**Read:**

- `index.md`
- `implementation-staging.md`
- `world-scope.md`
- `era-evolution.md`
- `macro-history.md`
- `time-model.md`
- `verification.md`

**Implement:**

- Active Hub / Warm Region / Cold World;
- promotion/demotion with history-consistent materialization;
- real travel time and absence consequences;
- remote assets/agents;
- multi-hub operation;
- macro economy cycles;
- governance/law history;
- war;
- migration/demography;
- public health/disaster;
- religious/social movements;
- large occult macro events;
- technological/infrastructure evolution;
- occult modernization;
- condition-driven Era transitions;
- era-sensitive content generation.

**Exit evidence:**

- leave one hub for decades and return to a world that genuinely changed;
- multiple Era transitions;
- macro events propagate locally;
- historical materialization remains chronology-consistent;
- user-approved focused regional acceptance (100 content turns with sparse 50-year
  coverage), as specified in verification.md; optional 5k soak no longer blocks
  Phase 6. Preserve old saves, facts, permissions, budgets and real turn counting.

Stop after Phase 6.

### Phase 7 — Player-Facing Long-Life Experience

**Purpose:** expose the already-working long-horizon systems coherently to the player.

**Execution specification:** `player-facing-experience.md` fixes information
architecture, page defaults, register styling, responsive layouts, typed forms,
data wiring, states and acceptance scenarios. Implement that specification rather
than repeating exploratory design. This refinement does not start Phase 7 or
bypass its Phase 5–6 dependencies.

**Read:**

- `index.md`
- `implementation-staging.md`
- only modules whose state must be surfaced;
- current frontend/runtime interfaces.

Also read `player-facing-experience.md` and `verification.md`.

**Skills:** apply `frontend-design`, `ui-ux-pro-max` and `emil-design-eng` during
implementation/review. Prefer installed local Skills; remote execution routes
through `skills:SKILLS.md` to those named copies. Preserve the existing
marine/paper register and the specification's decisions.

**Implement information architecture for:**

- Chronicle / Archive;
- actor/family history;
- institution history;
- location history;
- artifacts/provenance;
- timeline and Era state;
- longevity and identity exposure;
- fast-forward / interruption;
- long-term stances;
- delegation and organization policy;
- region/hub state.

**Build in this order:** contract/binding mapping → navigation and long-date
orientation → Chronicle/entity/provenance detail → dedicated long-term forms →
interaction/failure review → real Native browser validation. Use three primary
destinations: Field notes, Chronicle and Arrangements. Preserve the existing
opening, Evidence, Cases, identity, Composer, advice and Host Save/Restore flows.

Backend methods are not automatically sandbox bindings. Close safe adapter gaps
without raw Lifecycle access, new gameplay authority or a second persistence
system. Read completed Phase 5–6 schemas rather than guessing their fields.

**Exit evidence:**

- real browser/UI evidence for the above flows where available;
- long dates, eras and historical navigation remain usable;
- no claim of UI success without actual UI/runtime validation.
- execute the acceptance matrix in `player-facing-experience.md`, including
  bounded/privacy-safe century retrieval, lineage/succession, provenance,
  interrupted fast-forward, stance-only updates, identity/reconstruction,
  delegation drift, regional return, unknown-write reconciliation and actual
  Save/Restore/checkpoint Retry;
- inspect wide/compact/200%-text screenshots and record exact tested Package/Core
  HEADs; fixture UI dates spanning 200 years do not constitute Gate C;
- update existing `frontend/DESIGN.md` and `runtime/FRONTEND.md` with implemented
  bindings, actual evidence and any measured deviations.

Stop after Phase 7.

### Phase 8 — Century Integration / Stress / Release

**Purpose:** add no major new scope; normalize, stress, repair, validate and release.

**Read:**

- `index.md`
- `implementation-staging.md`
- `verification.md`
- only modules implicated by failures.

**Execute:**

- Gate A: 1k turns / 10 years;
- Gate B: 5k turns / 50 years;
- Gate C: **10k turns / 200 years**;
- deterministic fixtures;
- multi-seed matrix;
- multi-generation lifecycle;
- multi-Era evolution;
- multi-region migration;
- organization succession/drift;
- protagonist death/reconstruction;
- Save/Restore matrix;
- Century Retrieval Test;
- semantic repetition audit;
- storage growth audit;
- active-context projection audit;
- long fast-forward profiling;
- v1 regression fixtures;
- Package build/export;
- actual runtime/UI evidence as required.

**Release rule:**

If Gate C or any hard invariant in `verification.md` fails, the project remains incomplete and Phase 8 continues.

When all release gates actually pass:

- create and retain `releases/2.0.0.atria`;
- retain `releases/1.0.0.atria` unchanged;
- update the final Record;
- integrate the verified task branch into long-lived `package`;
- verify the resulting `package` HEAD;
- remove the temporary task branch;
- delete live `docs:HANDOFF.md`.

## 4. Dependency rationale

The ordering is intentional:

1. long time must exist before anything can age;
2. history compaction must exist before decades of state are generated;
3. lifecycle must exist before renewable content can use generations/history correctly;
4. renewable content must exist before 50-year play has enough material;
5. progression/delegation must exist before large player organizations are practical;
6. multi-region/macro/Era scope must build on a stable local long-lived world;
7. UX should expose validated systems rather than drive their internal architecture;
8. the 10k/200y test belongs at final integration, not as a substitute for staged correctness.

Do not reorder phases merely to chase visible features.

## 5. Phase-boundary documentation

Use one Record:

`records/package/original-occult-western-fantasy-game-long-lived-world.md`

Use one live handoff while active:

`HANDOFF.md`

Every completed phase appends/updates the same Record and refreshes the same HANDOFF.
