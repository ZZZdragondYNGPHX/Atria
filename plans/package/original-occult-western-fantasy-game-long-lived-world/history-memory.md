# Long-Lived World — History and Memory

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`  
**Status:** Partially frozen / implementation not approved

## 1. Goal

A century-scale save must preserve causality and meaningful history without retaining every turn at full fidelity or loading the full lifetime into model context.

The system therefore separates:

- current simulation state;
- historical narrative;
- precise canonical facts;
- durable artifacts;
- protagonist memory;
- historical hooks.

## 2. Historical retention tiers

### Hot State

Highest-fidelity active state.

Examples:

- current scene;
- active matter;
- immediate family conflict;
- current institutional agenda;
- active Claim transition;
- recent high-impact dialogue/state changes.

### Warm History

Recent months or years retain relatively detailed event summaries and relationship changes.

Warm history should remain suitable for close causal recall without requiring raw transaction replay.

### Cold History

Older routine activity is compressed into durable event summaries.

A long case may collapse into:

- participants;
- cause;
- outcome;
- important casualties;
- major choices;
- durable consequences;
- unresolved hooks;
- artifacts created or lost.

Low-value traversal and transient intermediate state may be discarded.

### Archive

Very old information may become structured historical records such as:

- actor biography;
- family history;
- institutional history;
- location history;
- case archive;
- Era summary;
- ownership/provenance chain.

Archived information remains queryable.

## 3. Canonical Fact Ledger

Narrative summaries are not sufficient for world integrity.

Precise facts required for future validation should live in a separate ledger.

Examples:

- birth/death dates;
- kinship;
- ownership transfers;
- office tenure;
- legal identity usage;
- artifact provenance;
- institution lineage;
- historical presence;
- exact Claim state transitions where later rules depend on them.

Compaction may change presentation, not truth.

## 4. Historical Hooks

Hooks survive source compaction when they can still generate future consequences.

Examples:

- unresolved disappearance;
- missing ledger;
- inherited grievance;
- disputed inheritance;
- institutional scandal;
- unknown heir;
- dormant Claim;
- unverified testimony;
- hidden archive.

Hooks have explicit state and may later activate, expire, be disproven or become canonical events.

## 5. Durable artifacts

Certain objects/documents persist as first-class historical evidence.

Candidate artifact classes include:

- photographs;
- letters;
- contracts;
- wills;
- newspapers;
- case files;
- diaries;
- property records;
- ritual records;
- heirlooms;
- recordings where historically appropriate.

Artifacts have lifecycle and provenance.

They may be:

- copied;
- inherited;
- archived;
- damaged;
- forged;
- lost;
- destroyed;
- rediscovered.

If an artifact survives, it can bring old information back into current play even if the originating event has been heavily compacted.

## 6. World Truth vs Protagonist Memory

World Truth is authoritative.

Protagonist Memory is a subjective state.

The protagonist may naturally forget or blur ordinary events after many decades or centuries.

Memory clarity should depend on factors such as:

- emotional significance;
- relationship strength;
- repetition;
- active relevance;
- deliberate journaling/archiving;
- player marking;
- supernatural effects;
- death/reconstruction cost.

The system must not aggressively contradict what the player clearly remembers.

Memory degradation is primarily a narrative/world mechanic, not a tool for frustrating recall.

## 7. Persistent clear memory

The following should tend to remain clearer:

- major life-changing events;
- deaths of close relations;
- severe betrayal or reconciliation;
- major Claim transitions;
- personally authored records;
- explicitly player-marked memories;
- recurring relationships;
- important self-identity facts.

## 8. Chronicle / Archive

The player should be able to inspect their own world's historical record.

Expected browse dimensions include:

- year/date;
- actor;
- family;
- location;
- institution;
- case/matter;
- Claim;
- Era;
- artifact.

The Chronicle is not a raw debug dump.

It should present human-readable summaries backed by canonical references.

## 9. Retrieval model

Runtime/model context should pull only relevant slices.

A current scene may request:

- current Hot State;
- directly related Warm History;
- matched Canonical Facts;
- relevant Cold/Archive summaries;
- linked artifacts;
- active Historical Hooks.

The entire century-scale save should not be inserted into every prompt.

## 10. Growth constraint

Save and context growth must be sublinear relative to turn count.

The architecture should continuously transform:

**raw/high-fidelity state → events → summaries → yearly/era history**

while extracting durable facts, hooks, relations and artifacts.

A 10,000-turn save should therefore not require replaying or retaining 10,000 turns of equivalent prompt/state detail.

## 11. Still open

- exact compaction thresholds;
- hot/warm/cold retention budgets;
- artifact storage limits;
- canonical ledger schema;
- retrieval index strategy;
- memory-confidence representation;
- player-marked memory UX;
- archival deletion policy for truly irrelevant material;
- deterministic reconstruction guarantees.
