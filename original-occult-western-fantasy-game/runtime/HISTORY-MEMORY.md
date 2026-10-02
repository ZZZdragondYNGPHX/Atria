# Phase 2 — History / Memory / Compaction Core

Development package: 2.0.0-phase2. Final release remains 2.0.0.
Requires Native history support in Core f116a98de7a09c32f1789a875244c7e4b9e14e20 or a descendant.
This is the history foundation, not the completed long-lived world.

## Ownership and identity

The Package declares lifecycleRuntime.history through tools/history-compile.mjs.
Native Authority prepares all history changes in the same private candidate as
world, clock and domain changes. SessionCore publishes that candidate with the
approved narrative in one CAS. State lives in atri_lifecycle.history and uses the
existing SaveSystem. There is no Package-side evaluator, database or save format.
Local history IDs are monotonically allocated within the immutable Native
session/world namespace. Retry restores the selected branch's prior history;
IDs from another world/branch must not be treated as globally interchangeable.
Canonical fact provenance retains the Native session, branch, sequence and exact
source domain/record/path. Chronology and current domain state remain the source
of truth; the ledger is checked against them at complete transaction/load boundaries.

## Retention

- Hot: at most 8 events, or the last 7 days.
- Warm: at most 24 attributed event summaries, or the last 2 ordinary years.
- Cold: at most 32 compact summaries, or the last 20 ordinary years.
- Archive: adjacent equal-weight intervals merge into logarithmic bins. They
  retain time/turn ranges, counts and facet links, not fictional reconstructed prose.
- Calendar ages above are retention heuristics (365-day years), not calendar authority.
- Significant events referenced by facts, artifacts, hooks or deliberate memories
  have durable anchors independent of transient tiers.
- Durable entries are never silently evicted to satisfy a budget. The Package
  permits 4,096 durable entries and 2 MiB of logical history; exhaustion fails
  atomically and requires a future explicit archival policy. These are safety
  limits, not a promised lifetime or proof that every possible playstyle is sublinear.

The exact Canonical Fact Ledger is separate from narrative summaries. It preserves
current and superseded values, previous-fact links and source/event provenance.
The initial source declarations cover protagonist/public identity, the introduced
Anchor identity, Claim state and retained case dispositions. Hidden Eastbank
state is canonical but not player/model-visible. More lifecycle source declarations
belong to Phase 3; no birth, kinship or office-tenure facts are invented here.

## Portable checkpoints and Retry

Every 64 committed Authority interactions (including refused/no-op interactions),
or an explicit compact operation, Native creates a portable checkpoint. This
count is separate from meaningful history turns.

A checkpoint:

1. retains current authority, canonical history, hooks, artifacts and memories;
2. removes earlier raw timeline/event journals and applied turn/action payloads;
3. retains the latest approved assistant reply for reading;
4. expires Retry for that archived reply because its pre-effect user anchor is
   no longer portable; subsequent ordinary turns can Retry normally;
5. cuts linear revision ancestry in a new CAS-published snapshot without rewriting
   or deleting any old revision, branch or explicit SavePoint;
6. moves retired exact turn receipts/tombstones into a bounded replay fence so retired invocation IDs cannot be reapplied.

A checkpoint fails closed while pinned or non-turn Task results still require
old anchors; it does not silently discard those dependencies. Future background
work must resolve those retained results before requesting a checkpoint.

Recent unarchived retries retain exact receipts/idempotency. An archived invocation
returns an explicit expired error. The replay fence is a fixed-size Bloom filter:
false positives reject new work, never double-apply it. It is not an infinite
idempotency store. Saturation/admission behavior needs further final-soak profiling.

The last reply has no preceding raw user entry at a checkpoint; Native Retry
explains the archive boundary instead of forking post-effect authority. The final
Chronicle/Archive UI and its archive/Retry affordances are Phase 7 work.

Native snapshot export follows the new root and retained branch graph. Explicit
save-point/session exports and branches intentionally preserve their referenced
history and can be larger. Local immutable repository revisions are not garbage
collected by this phase. Growth claims concern active snapshots, transient
retention, bounded projections and portable checkpoint saves, not all backups
accumulated on disk.

## Artifacts, hooks and subjective memory

Artifacts are first-class records: photograph, letter, contract, will, newspaper,
case file, diary, property record, ritual record, heirloom or recording. Creation
records protagonist authorship, content, the original historical source, optional
copy parent and a chronology-stamped origin. A document's assertions do not become
external World Truth. Copies require a surviving, available parent. Supported
status transitions include held, archived, damaged, lost, rediscovered (held) and
destroyed; destruction is terminal. Every transition has an immutable event anchor.
Custody/ownership law, inheritance and authenticity disputes are not simulated here.

Historical Hooks require an available public historical source. They begin dormant
and may activate, expire, be disproven or resolve; terminal states cannot silently
reactivate. Their source survives compaction. This is reusable hook state, not
Phase 4 renewable content generation or automatic hook-driven cases.

Memory marks and journaling are subjective metadata, never fact edits. Ordinary
unmarked old events can present as faded after 20 years; explicit marks, authored
records and precise important facts remain clear. Clearing a mark does not erase
world truth. The player may still inspect the Chronicle.

## Typed mutation contract

Reuse opening.wait; the Package remains inside the existing 64-transaction and
per-transaction effect/read/command ceilings. Do not install another action authority.
The normal minutes-only action remains valid. Example:

~~~json
{
  "minutes": 0,
  "history": {
    "operation": "artifact.create",
    "artifact_create": {
      "kind": "letter",
      "title": "First Eastbank letter",
      "content": "An attributed record, not proof of external allegations.",
      "sourceId": "history.2",
      "parentId": ""
    }
  }
}
~~~

Obtain real IDs from Chronicle; the ID above is illustrative. Payload keys replace
operation dots with underscores. Operations:

- artifact.create: kind, title, content, sourceId, parentId;
- artifact.change: id, status;
- hook.create: title, sourceId;
- hook.change: id, status;
- memory.mark: id, marked, journaled;
- compact: empty object.

History actions require the retained creation eligibility. Input fields cannot
supply provenance stamps, rewrite facts, reference private facts, resurrect a
destroyed artifact or set an unknown hook transition. Failed candidates publish
nothing. Zero minutes without a stance/history action remains impossible.
The generic scalar UI does not expose a broken structured form; final UX is deferred.

## Chronicle query/projection contract

Backend APIs on the existing SessionCore:

- getHistory(handle, sessionId, query)
- getHistoryMetrics(handle, sessionId)

The shared read-only queryHistory(snapshot, query) powers these APIs and safe
information projections. Supported selectors:

- id: one exact local historical ID;
- kind: event, summary, fact, artifact or hook;
- facet/value: year, actor, family, location, institution, case, claim, era or artifact;
- limit: 1–32 (default 12);
- cursor: returned opaque revision/query-bound pagination object;
- memory: include light-touch subjective clarity.

Queries dereference persisted ID locators/facet postings. A page inspects at most
128 postings. Cross-year archive lookup reads at most 54 interval-index entries,
not every archived record. Results are limited to 12,000 characters; artifact and
hook provenance projections expose the latest eight links plus the total count.
Exact older event/fact anchors are independently queryable. A stale revision,
changed selector, unknown query field or oversize limit is rejected. Hidden facts
are excluded even by direct ID. The default view is a recent slice, not a raw dump.

Narrator Information context receives at most eight recent public history items.
Selective deeper retrieval is an explicit backend query; no broad archive is
injected into every prompt. Actor/private perspectives are not automatically widened.

## Instrumentation and validation scope

historyMetrics reports meaningful turns, tier counts, durable count, history/raw
bytes, active-state bytes, timeline retention, projection bytes, compaction count
and replay-fence count. Authority work separately reports history source count,
source record scans and logical history bytes. History source scans are capped at
4,096 and source declarations at 64. Regular Authority budgets are unchanged.

Host Lifecycle changes also synchronize the ledger but are not counted as player
turns. A meaningful player turn requires an actual declared world-domain/clock change or an
artifact/hook/memory mutation. A transaction sequence increment, impossible wait,
compaction operation or prose message alone is not counted. The development gate
uses 1,000 committed positive time advances that change the Native clock, rent and
retained obligations across more than 10 years; it is not a sequence-padding test.

Run tools/package.mjs validate --history-only --core <compatible Core checkout>.
It exercises Native publication, repeated real Fs/SQLite SaveSystem imports,
private-source refusal, exact recent retry, early artifacts/hooks, marked memory,
century-distance retrieval and checkpoint growth. Core fixtures add a three-seed
history matrix and cross-adapter checkpoint/Retry tests. See the permanent Record
for actual results, tested commits, CI and precise limitations.

Phase 2 does not claim full Gate A lifecycle/renewable-content coverage, Gate B/C,
or the final Century Retrieval Test. No NPC/family aging, generational change,
renewable matters, businesses, delegation, multi-region or Era/macro systems and
no final Chronicle UI are implemented here.
