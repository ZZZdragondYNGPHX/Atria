# Worldbook Performance Foundation

## Task

- Task branch: `feat/worldbook-performance-foundation`
- Implementation baseline: `main@65321bb522febd369901127cd2b4b2c9883d4658`
- Final validated task head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`
- Pull request: #8 — `feat: worldbook performance foundation`
- Squash merge / resulting main: `3ca80415386dff83017b608e23ee9475ee8e0128`
- Master plan: `docs/plans/worldbook-performance-master-plan.md`
- W-04/W-05 continuation baseline: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 final validated task head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`
- W-04/W-05 pull request: #9 — `feat: worldbook W04-W05 selection foundation`
- W-04/W-05 squash merge / resulting main: `03d97d655370b31c2a27dd1235f917deadd6246e`

## Goal

Establish a measured foundation for long-chat / World Info work without replacing the existing SillyTavern-compatible World Info engine or creating a second writable gameplay-state system.

The merged scope covers P-00/P-01 and W-00 through W-05. PR #10 continues the performance content block with P-02 through P-05 under the explicit no-storage-migration boundary described below.

## Implementation

### P-00 / W-00 verification foundation

- Added focused deterministic World Info regressions.
- Added a synthetic offline performance baseline.
- Added an isolated real-host Chromium smoke using a temporary data root and no provider credentials.
- Kept the baseline separate from external model latency and user data.

### P-01 bounded chat snapshot lifecycle

- Chat write snapshots now use a bounded working set.
- Active / queued writes retain the snapshots they need.
- Settled writes release old snapshots.
- Clone isolation and exceptional release behavior are covered by regression tests.

### W-01 identity and provenance

- World Info selection keeps occurrence identity through rendering and final prompt assembly.
- Orchestrator filtering no longer relies on body-string lookup.
- Repeated identical content and regex-rewritten content retain correct source attribution.
- Request-boundary attribution records source identities without copying private body text into diagnostic receipts.

### W-02 pure evaluation and explicit commit

- World Info scan/evaluation no longer commits timed state or emits `WORLD_INFO_ACTIVATED`.
- Accepted evaluations are committed explicitly through `commitWorldInfoEvaluation()`.
- `worldInfoEvaluationId` provides idempotency even across cloned/retried evaluation objects.
- Force-activation revisions are consumed only by the accepted evaluation.
- Stale chat scope and stale provider-state fingerprints are rejected.
- The explicit commit API is exposed through Atria context integration.

### W-03a native state conditions

- Added bounded, restricted scalar conditions with operators `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, and `contains`.
- Conditions use three-valued `true / false / unknown` logic.
- Missing providers, missing fields, provider initialization/error, malformed paths, and incompatible values fail closed as `unknown`.
- MVU / LoreState integration is read-only; World Info does not write provider state.
- Added structured author UI and character-book extension-field round-trip.

### W-03b state transition events

- Added exact scalar transition events comparing the previous committed provider baseline with the current read-only snapshot.
- No baseline, unknown previous value, or unknown current value yields `unknown`; no transition is invented.
- Evaluation does not advance the baseline.
- Accepted commit advances baseline through `atri_world_info_events` FloorState.
- Retry/regeneration on the same floor/swipe can replay the committed transition.
- Swipe and branch semantics are covered by FloorState rollback/inheritance regressions.
- Added structured author UI and character-book extension-field round-trip.

### W-03c provider-owned scene persistence

- Added optional `stateActivation` / `extensions.atria_state_activation`.
- Default is `false`, so existing keyword/constant behavior is unchanged.
- When explicitly enabled, a non-empty state-condition set that evaluates `true` may activate the entry without a repeated keyword mention.
- The provider remains the source of truth: repeated generations keep the scene entry active only while the committed provider state still matches; a false/unknown result exits immediately.
- No parallel scene database or writable World Info state source was introduced.
- Added author toggle, documentation, focused unit coverage, card export support, and real-host Chromium verification.

### W-04 incremental indexing and explicit selection

- Added `public/scripts/atri-world-info-selection.js` as a pure selection layer rather than creating a second World Info engine.
- Added a conservative incremental inverted index for static primary-key entries.
  - unchanged descriptors are reused;
  - changed/removed entries update only their affected index records;
  - regex, dynamic macro, vectorized, constant, state-activation, active sticky and otherwise unsafe shapes remain in the compatibility candidate set.
- Indexed candidates still pass through the existing `WorldInfoBuffer.matchKeys` checks. The index narrows candidates only; it never decides activation by itself.
- Index-query failure degrades to the complete candidate set with an explicit diagnostic reason.
- Added explicit required-entry dependencies supporting local UID and `Book#UID` references.
  - dependency closure is dependency-first;
  - missing, disabled, ineligible, cyclic and over-depth dependencies reject the complete bundle;
  - character filters, triggers and W-03 state/event eligibility remain enforced for dependencies.
- Added related-entry relevance hints without force-activating related material.
- Added explicit mutual-exclusion groups.
- Added budget tiers: `critical`, `scene`, `normal`, `optional`.
- Added full/compact bundle variants. Required bundles are atomic:
  - full bundle is selected when it fits;
  - otherwise the whole bundle may downgrade to compact content;
  - if compact still does not fit, the whole bundle is rejected;
  - no required bundle is partially injected.
- Added structured author controls for required/related references, mutual exclusion, budget tier and compact content.
- Added selection diagnostics including index update statistics, compatibility classification and per-loop degradation/candidate counts.
- Added synthetic 1k/10k cold-build, incremental-update and query coverage.
- No new default online/per-entry model call was introduced. Existing vectorized semantic recall remains the opt-in semantic path; a new semantic layer was not justified by the measured W-04 cut.

### W-05 typed compatibility and default cutover

- Chose runtime capability classification instead of rewriting old user data:
  - `atria_v1`: entries using W-04 Atria selection metadata;
  - `indexed_legacy`: old entries whose static keyword shape is safe for candidate indexing;
  - `compatibility`: entries that retain the established full scan path.
- Old entries without W-04 metadata retain the established probability/budget/activation path.
- Added Atria character-book extension fields:
  - `extensions.atria_required_entries`
  - `extensions.atria_related_entries`
  - `extensions.atria_mutual_exclusion_group`
  - `extensions.atria_budget_tier`
  - `extensions.atria_compact_content`
- Character-book import/export round-trips the new fields while preserving unknown top-level and extension fields.
- No storage-format migration, automatic user-data rewrite, duplicate state owner or deletion was added.
- The isolated worldinfo browser harness now self-bootstraps on a clean CI runner when a developer-local data seed is absent; personal seed data is no longer an acceptance-test prerequisite.

## Validation

Latest validated task head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`.
Latest resulting main: `03d97d655370b31c2a27dd1235f917deadd6246e`.

Passed:

- Worldbook Performance Foundation #83
  - focused Jest regressions
  - synthetic offline benchmark capture
  - isolated real-host Chromium smoke
- Workspace UI #144
- Atria PR Checks #330
  - Atria Migration Guard
  - ESLint
  - complete Node unit suite

W-04/W-05 continuation passed:

- Worldbook Performance Foundation #105
  - focused Jest regressions including dependency/mutex/degradation/atomic-budget coverage
  - synthetic 1k/10k candidate-index benchmark
  - isolated real-host Chromium smoke
  - worldinfo #25 real mock-model request acceptance proving a required dependency reaches the actual completion request
  - worldinfo #29 export/delete/re-import round-trip proving W-04 and unknown fields survive
- Atria PR Checks #352
  - Atria Migration Guard
  - ESLint
  - complete Node unit suite

The W-03c Chromium smoke specifically verified:

1. a state-only scene entry activates at `scene.place = clocktower` without a keyword;
2. repeated generation at the same committed state keeps it active;
3. changing the provider state to `castle` removes the scene entry.

Android JVM tests and Android / Docker builds were intentionally not run for this task, matching the task constraints and current repository validation policy.

## Compatibility and data impact

- No user-data deletion.
- No storage-format migration.
- No default external model call was added.
- Existing entries keep their prior activation behavior because `stateActivation` defaults to `false`.
- New Atria fields are additive:
  - `extensions.atria_state_conditions`
  - `extensions.atria_state_condition_logic`
  - `extensions.atria_state_activation`
  - `extensions.atria_state_events`
  - `extensions.atria_state_event_logic`
  - `extensions.atria_required_entries`
  - `extensions.atria_related_entries`
  - `extensions.atria_mutual_exclusion_group`
  - `extensions.atria_budget_tier`
  - `extensions.atria_compact_content`
- W-05 performs no automatic migration rewrite; compatibility is selected at runtime and unknown fields are preserved.
- MVU / LoreState remain state owners; World Info reads snapshots only.

## P-02–P-05 continuation · PR #10

- Continuation baseline: `main@03d97d655370b31c2a27dd1235f917deadd6246e`
- Temporary branch: `feat/worldbook-performance-foundation`
- Pull request: #10 — `perf: continue worldbook performance P02-P05`
- P-02–P-05 final validated task head: `f752e0e1f532d2796b5b476acc2c57149973ef5a`
- P-02–P-05 squash merge / resulting main: `ff804b53adb514919cc3bfb6ac82334df5fe7cf2`
- Android and Docker remain opt-in and are intentionally not part of the default validation.

### P-02 diagnostics on demand

Prompt diagnostics no longer require loading and rewriting one complete per-chat diagnostic array on ordinary access.

- Added a lightweight per-chat diagnostic index plus independent per-message records.
- Opening a chat loads the index only; opening one diagnostic fetches that record on demand.
- Prompt-diff UI reads only the selected record plus the nearest prior record with a raw prompt.
- New diagnostic writes update one record and the lightweight index rather than rewriting the complete diagnostic history.
- Legacy `SillyTavern_Prompts` arrays migrate lazily on first access.
- The legacy array is retained as a rollback copy; an explicit rollback helper can rematerialize it from current records.
- Checkpoint copy, message reorder and message deletion keep diagnostics aligned with chat message IDs.
- Focused coverage includes a 10,000-entry index load proving that current-layout chat open does not fetch diagnostic bodies.

### P-03 rendering hot path: bounded depth scan

The previously measured message-depth cost was removed from the streaming/latest-message hot path without changing formatting semantics.

- Added `getMessageDepthFromTail()`.
- Message regex depth no longer allocates a mapped/filtered copy of the full chat on every format pass.
- The latest non-system message is constant-time; an older visible message scans only its suffix.
- Regression tests compare the new helper against the previous whole-chat algorithm across mixed system/non-system histories.

Synthetic CI evidence from Worldbook Performance #183 (`Intel Xeon 6973P`, Node `24.20.0`, seven measured samples after warmup):

- 10,000-message latest-message depth: 1,000 calls median `0.013 ms`.
- 10,000-message recent 100-message window depth pass: median `0.023 ms`.

These numbers are synthetic process-level evidence, not a browser/device SLA.

A completed-message HTML cache and partial Markdown/HTML stream renderer are deliberately **not** enabled in this continuation. The current renderer permits dynamic Regex providers, macros, arbitrary synchronous `MessageFormatter` hooks, rebuildable Showdown configuration and DOMPurify hooks. A cache without a unified formatting revision would risk stale or incorrect output and would violate the P-03 correctness exit condition.

### P-04 message-granular storage foundation

P-04 now has real repository/engine capabilities instead of HTTP endpoints that still unconditionally materialize the complete chat.

#### Common storage contract

The storage transaction surface now supports optional chat-specific capabilities:

- `getChatRange`
- `getChatInfo`
- `appendChatMessages`
- `patchChatMessages`

`ChatRepo` uses these capabilities when available and preserves the established full-resource fallback for unsupported engine/file/operation shapes.

#### Range reads and chat summaries

- Character and group `/get-delta` route through `ChatRepo.getRange()`.
- List/recent-chat metadata can use `ChatRepo.getInfo()` rather than pulling the whole body into Node.
- FS uses a bounded process-local JSONL byte-offset index. Cold index construction validates all JSONL lines; warm reads parse only the requested message spans.
- SQLite uses JSON1.
- MySQL uses native JSON/JSON_TABLE.
- PostgreSQL uses JSONB array operations.

The FS performance regression demonstrates that a warm one-message read from a 5,000-message chat reads less than one percent of the original chat bytes.

#### Native append

- FS appends only new JSONL rows and rotates a same-length header integrity value in place with fsync; generation-ID dedup is retained in the lightweight range index.
- Old/incompatible FS headers return `unsupported` and automatically fall back to the established full rewrite.
- SQLite, MySQL and PostgreSQL update their JSON document inside the database and preserve OCC/integrity checks plus generation-ID dedup.
- Character/group append and generation-persistence paths use the common Repo append capability.
- Backup payload creation is lazy: a throttled backup materializes the complete chat only when the throttle actually executes, instead of serializing a complete chat for calls that the throttle discards.

#### Native whole-message patch

SQLite, MySQL and PostgreSQL support the high-frequency whole-message JSON Patch subset:

- `test /N`
- `replace /N`
- `remove /N`

Nested paths and other operation shapes return `unsupported` before mutation and fall back to the established path. Character and group patch endpoints prefer the native path and retain the existing integrity/test conflict behavior.

FS variable-length replace/remove intentionally remains on the atomic full-rewrite fallback. A crash-safe truly local replace/remove for canonical JSONL requires a journal, physical record layer or another storage-format migration. The master plan explicitly treats that expansion as a separate approval boundary, so this continuation does not introduce a hidden storage migration.

### P-05 measured Memory hot paths

World Info W-04/W-05 semantics remain unchanged. P-05 removes repeated Memory OS preparation work that was measurable in the existing synthetic fixture:

- Memory corpus construction reuses the already-projected fact/support view instead of projecting the same facts again inside Temporal Graph.
- Relation-derived fact status and provider authoritative slots are indexed once.
- Ranking builds document lookup maps and relation adjacency once; graph expansion no longer filters the complete corpus at each BFS depth.
- Stable relation-lane ordering is explicitly regression-tested.
- No default provider/model call was added.

Synthetic CI evidence from Worldbook Performance #183:

| Fixture | Corpus docs | Corpus median | Ranking median |
| ---: | ---: | ---: | ---: |
| 500 relations | 1,500 | 8.686 ms | 4.507 ms |
| 1,500 relations | 4,500 | 24.908 ms | 11.612 ms |
| 3,000 relations | 9,000 | 57.367 ms | 23.755 ms |

The expected top result remained `relation:r42` for every measured fixture. These values describe the CI synthetic fixture only and do not include embedding, rerank network calls or model generation.

### Continuation validation

The continuation validation matrix is intentionally split:

- **Worldbook Performance Foundation:** P-02/P-03/P-04/P-05 focused regressions, synthetic benchmark artifact, isolated real-host Chromium smoke, and W-04/W-05 real-request/import-export E2E.
- **Atria PR Checks:** ESLint, Atria Migration Guard and the complete Node unit suite with real MySQL 8.4 and PostgreSQL 16 service containers.

Final validation for PR #10 passed on `f752e0e1f532d2796b5b476acc2c57149973ef5a`:

- Worldbook Performance Foundation #185 — success:
  - focused P-02/P-03/P-04/P-05 regressions;
  - synthetic benchmark artifact;
  - isolated real-host Chromium smoke;
  - W-04/W-05 real-request and import/export E2E.
- Atria PR Checks #432 — success:
  - ESLint;
  - Atria Migration Guard;
  - complete Node unit suite using MySQL 8.4 and PostgreSQL 16.
- The same code tree before the documentation-only master-plan status commit also passed Atria PR Checks #431 with **590 test suites / 7,920 tests**.

PR #10 was squash-merged to `main@ff804b53adb514919cc3bfb6ac82334df5fe7cf2`. The merged main tree `848d4d8d88717737baec6e1d58abb90379fdf6e9` exactly matches the final task-head tree.


## Follow-up

W-04/W-05 are complete in PR #9 and merged to `main@03d97d655370b31c2a27dd1235f917deadd6246e`.

PR #10 implements the no-migration P-02–P-05 continuation described above. Remaining deeper work is limited to boundaries that require a new contract or explicit architectural approval, notably exact formatter-cache invalidation / partial Markdown streaming and crash-safe FS local replace/remove storage representation.

W-04/W-05 should not be reopened as a compatibility migration unless a new measured requirement justifies it.


## P-04 FS local whole-message patch continuation · PR #11

- Baseline: `main@ff804b53adb514919cc3bfb6ac82334df5fe7cf2`
- Temporary branch: `feat/p04-fs-message-storage`
- Pull request: #11 — `feat: deepen P04 filesystem chat patch storage`
- Validated implementation tree before the master-plan-only status commit: `a11bf58d94ef7351676d6af3b901b4db999412b0`
- Final validated task head: `0c8e18964acf8b1c85ee41feea4b8c1232994204`
- Squash merge / resulting main: `32227e997c136228477bb4571e828f3852fe8eb1`
- Final merged tree: `7e6dd92fc4cc6943ecded805667c8b3512c6725c`, identical to the final task-head tree.
- Master plan: `docs/plans/worldbook-performance-master-plan.md`

### Goal

Cross the explicitly deferred P-04 FS crash-safety boundary without replacing Atria's canonical SillyTavern-compatible chat JSONL format. High-frequency whole-message `test/replace/remove` should no longer require an atomic rewrite of the complete chat when the current FS file can be mutated safely.

### Implementation

- FS now implements the same native whole-message `test /N`, `replace /N`, and `remove /N` capability already available in the SQL engines.
- The existing disposable byte-offset JSONL index is reused to locate the earliest affected message.
- Variable-length edits rewrite only the suffix beginning at that message. The canonical `.jsonl` remains the single chat-body source of truth.
- A transient sibling `<chat>.jsonl.atria-patch-journal` protects the in-place mutation:
  1. store the original fixed-width header plus original affected suffix;
  2. fsync the journal;
  3. rewrite/truncate the affected target suffix and rotate the fixed-width integrity header;
  4. fsync the target;
  5. write and fsync the committed marker;
  6. remove the journal.
- A pending journal is rolled back on startup / first FS storage access. A durably committed journal is cleanup-only and never rolls back the accepted chat mutation.
- Commit-marker fsync failure is treated conservatively: the original header/suffix are restored even when the one-byte marker write reached page cache before fsync failed.
- Server startup recovers journals before raw chat-file migrations/cache readers run; the FS engine also performs a once-per-handle recovery sweep as defense in depth.
- LAN Sync treats journal and journal-temp files as machine-local transaction artifacts:
  - snapshot does not publish them;
  - remote reconcile does not import them;
  - reconcile does not delete an in-flight local journal.
- Unsupported operation shapes, legacy/incompatible headers, and metadata updates that change serialized header byte length return `unsupported` before mutation and continue through the established atomic full-resource fallback.

### Performance and correctness evidence

The focused FS performance regression uses a 5,000-message chat and a warm range index. Replacing the final message with a different-length payload must:

- keep the canonical JSONL inode unchanged, proving the operation did not use the full-file atomic rename path;
- read less than 1% of the original chat bytes;
- write less than 2% of the original chat bytes;
- persist the replacement and rotate integrity.

Focused coverage also exercises variable-length replace, sequential remove/replace shifting, fixed-width metadata merge, safe header-growth fallback, exact pending-journal rollback, committed-journal cleanup, process-restart recovery, and uncertain commit-marker fsync rollback.

LAN Sync regressions pin both directions of the portability boundary.

### Validation recorded before merge

The implementation code tree `a11bf58d94ef7351676d6af3b901b4db999412b0` passed:

- Worldbook Performance Foundation #198;
- Atria PR Checks #445:
  - ESLint;
  - Atria Migration Guard;
  - complete Node unit suite: **591 suites / 7,930 tests**;
  - MySQL 8.4 and PostgreSQL 16 service-backed storage coverage;
  - the new `sync/shadow-snapshot.test.js` and `sync/shadow-reconcile.test.js` cases.

The immediately preceding safety head `d7e02c77f1c23f61951b732a3eda2c3a546a1730` also passed Worldbook Performance Foundation #195 and Atria PR Checks #442. #195 explicitly passed the P-04 focused suites, synthetic benchmark, isolated real-host Chromium smoke, and W-04/W-05 E2E.

The final task head adds only the master-plan status update on top of the validated implementation tree. It passed Worldbook Performance Foundation #199 and Atria PR Checks #446, then was squash-merged as `main@32227e997c136228477bb4571e828f3852fe8eb1`.

Android JVM tests and Android/Docker builds were intentionally not run because they remain opt-in and this task did not touch Android delivery code.

### Compatibility and remaining boundary

- Existing chat JSONL requires no batch migration.
- Import/export and ordinary direct JSONL consumers continue to see the canonical file.
- The journal is transient recovery state and is not portable user content.
- Integrity/OCC, existing reliable full-rewrite fallback, backup materialization and SQL-engine behavior remain intact.
- An edit near the front or middle of a JSONL chat still rewrites and journals the affected suffix. Cost therefore scales with that suffix, not strictly with one message.
- If measured workloads later require near-single-message cost for arbitrary old-message edits, that should be a separate physical-record / segmented-storage migration with its own compatibility and recovery contract.
