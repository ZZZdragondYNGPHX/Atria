# Long-Lived World — Verification and Release Gates

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Status:** Approved implementation; final workload amendment (2026-10-04)

## User amendment — 2026-10-04

The user authorized continuing directly through Phase 8 and release after Phase 7
is complete and pushed, and then requested fewer turns to avoid hours per run.
The implementation workload is now Gate A: 250 content turns / at least 10 years;
Gate B: 500 / at least 50 years; Gate C: 1,000 / at least 200 years. These can be
measured checkpoints of one continuous 1,000-turn / 200-year save. All coverage,
canonical invariants, real portable imports, semantic auditing, seed matrix and UI
requirements remain. Measure storage/context at 250, 500 and 1,000 turns.
The original 10k soak becomes optional stress evidence, not a release blocker;
never describe the reduced acceptance as a completed 10k soak. The Phase 6
100-turn focused amendment remains unchanged.

## 1. Release claim

The package may be described as a completed Long-Lived World only after it passes the final long-run gate defined here.

Passing the old bounded-campaign regression suite is necessary for preserved v1 behavior where applicable, but it is not sufficient.

## 2. Authoritative turn definition

An **authoritative turn** is a committed interaction that mutates authoritative world state.

Examples include:

- player action resolving into state;
- case progression;
- relationship/lifecycle mutation;
- property/business action;
- institutional action;
- time advancement;
- Claim transition;
- world-event resolution;
- region promotion/demotion;
- Era transition;
- death/reconstruction continuity event.

Pure prose/no-op chat does not count.

## 3. Development gates

### Gate A — 250 turns / at least 10 years

Purpose:

- catch obvious state leaks;
- verify removal of short campaign horizon;
- exercise early lifecycle;
- prove basic renewable content;
- prove early compaction;
- verify repeated Save/Restore.

### Gate B — 500 turns / at least 50 years

Purpose:

- verify at least one full ordinary human generation;
- verify children reaching adulthood where applicable;
- verify leadership turnover;
- verify world-entity lifecycle;
- verify Era evolution;
- verify long-running business/property state;
- verify multi-region continuity;
- stress history retrieval and compaction.

### Phase 6 focused acceptance — 100 content turns / sparse 50-year coverage

The user's 2026-10-03 instruction to shorten date verification supersedes the
Phase 6 requirement to rerun Gate B. Default regional acceptance uses 100 real
content-mutating transactions; the 50-year span is reached by the existing sparse
event-driven clock, not a daily loop. Retaining this inexpensive calendar span is
necessary for generational chronology, multiple Eras and decades-away return.

Required evidence:

- actual three-region travel, departure/arrival costs and dates, remote owned
  property/delegation, and return after at least 29 years of absence;
- three regional Eras, macro propagation and history-consistent materialization;
- at least two kinship edges and valid institution predecessor/successor lineage;
- at least three historical Hook reuses, including original opening evidence
  reused after 25 years, and at least three early and three late semantic cases;
- actual alternating Fs/SQLite imports at three departures, three arrivals and
  four content checkpoints (25/50/75/100), preserving all authoritative state;
- existing exact-runtime Native multi-seed, split/whole, rights/privacy, budget
  refusal, old SavePoint and four-adapter checkpoint/Retry evidence;
- explicit profile, actual elapsed time, content-turn count and storage/work
  measurements. Setup, compaction and prose never count as content turns.

Use local execution by default. The unchanged Native runtime need not repeat an
already-passed four-adapter suite. Arbitrary shortened diagnostic runs remain
smoke, not acceptance. --regional-full explicitly opts into the original 5k soak.
No caps, facts, chronology, authority or persistence guarantees may be weakened.

This is a focused stage gate, **not Gate B**, a 5k growth/stress claim or Gate C.
Gate A/B remain available for dedicated stress work; the Phase 8 final release
requirement below is unchanged by this Phase 6 amendment.

### Gate C — Final release: 1k turns / at least 200 years

This is the hard completion gate.

## 4. Mandatory final-soak coverage

The amended 1k/200-year soak must demonstrate:

- one continuous protagonist identity;
- multiple ordinary NPC generations;
- births, maturation, aging, retirement and deaths;
- family-graph continuity;
- institution leader succession;
- institution creation, merger/split or dissolution;
- player-founded organization autonomy/drift;
- city/location construction, reuse, decline and destruction;
- multiple Era transitions;
- technology/social/legal/occult evolution;
- economic and macro-history cycles;
- renewable case/matter generation;
- Historical Hook reuse;
- at least one multi-region relocation path;
- continued evolution of regions after player departure;
- protagonist bodily death/reconstruction at least once;
- long fast-forward across substantial spans;
- repeated Save/Restore at high-risk transition points;
- century-scale historical retrieval.

## 5. Chronology and canonical invariants

The following must remain valid:

- birth precedes ordinary aging/death;
- kinship chronology is possible;
- office holders occupy valid terms;
- dead/retired actors do not silently resume active roles;
- dissolved entities do not act as currently active unless explicitly restored/reconstituted;
- ownership transitions preserve provenance;
- artifact provenance remains coherent;
- legal/public identity histories remain ordered;
- institution lineage remains traceable;
- Canonical Fact Ledger never contradicts authoritative current state.

Supernatural exceptions must be explicit world facts rather than accidental chronology violations.

## 6. Save/Restore matrix

Save/Restore must be exercised around at least:

- long fast-forward;
- birth/major family transition;
- marriage/separation/widowhood where generated;
- institution leadership succession;
- institution split/merge/dissolution;
- Era transition;
- region promotion/demotion;
- multi-region relocation;
- protagonist death/reconstruction;
- major property/ownership transfer;
- Historical Hook activation.

Restored worlds must preserve authoritative equivalence.

## 7. Century Retrieval Test

The test suite should create or capture facts/artifacts early in history and retrieve them many decades later.

Candidate targets:

- photograph;
- letter;
- contract;
- family relationship;
- old case;
- ownership record;
- institutional decision;
- Historical Hook.

Retrieval must preserve:

- who;
- what;
- when;
- provenance;
- current status;
- relationship to later events.

## 8. Anti-repetition audit

Novelty checks should inspect semantic structure, including:

- actor-role configuration;
- victim/subject type;
- institution combinations;
- hidden truth;
- anomaly family;
- investigation path;
- stakes;
- resolution structure;
- Historical Hook source.

Repeated names with the same underlying structure are repetition.

The suite should also verify that later content increasingly makes legitimate use of the world's own accumulated history.

## 9. Compaction/growth audit

Long-lived history must not remain full-fidelity forever.

Validation should compare growth across checkpoints such as:

- 250 turns;
- 500 turns;
- 1,000 turns.

Release-blocking signs include:

- near-linear prompt projection growth;
- near-linear retention of raw transient state;
- inability to retrieve compacted history without loading broad archives;
- unbounded duplicate summaries.

Exact byte ceilings may be set during implementation after serialization/profile evidence exists.

## 10. Fast-forward performance/integrity

A multi-decade fast-forward must not simply execute every intervening day at full fidelity.

Evidence should demonstrate:

- hierarchical resolution;
- event-driven interruption;
- coarse resolution for low-event periods;
- expansion to finer resolution only when needed;
- world consequences during protagonist absence.

## 11. Seed matrix

Validation must include:

- deterministic fixtures for reproducibility;
- multiple independent simulation seeds;
- at least one long-running final soak.

The release decision cannot rely on a single favorable seed.

## 12. UI/runtime evidence

Phase 7 uses the concrete flows, state coverage, responsive matrix and evidence
requirements in `player-facing-experience.md` section 8. That UI specification
does not replace this document's authoritative-turn definition or final gates.
Late-world fixture setup and UI retrieval over 200 years are not Gate C evidence.

Before final completion, user-facing evidence should verify that:

- long dates/eras render correctly;
- Chronicle/Archive can inspect long history;
- family/institution/history views remain usable after decades;
- region switching/relocation is understandable;
- long fast-forward interruption is understandable;
- identity/longevity state is presented coherently.

Only tests actually run may be reported as passed.

## 13. Completion rule

If the amended 1,000-content-turn / 200-in-world-year gate has not passed with the required coverage and invariants, the Long-Lived World project remains incomplete.
