# Original Occult Western Fantasy — Long-Lived World — Record

- Task ID: `refactor/original-occult-western-fantasy-long-lived-world`
- Primary Workspace: Package
- Status: Active
- Plan: `plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`

## Summary

This task expands the released bounded v1.0 occult-western campaign into a long-lived world architecture capable of supporting thousands of authoritative turns, centuries of in-world history, generational NPC change, evolving institutions/cities/eras, multi-region play and renewable history-aware content.

The v1.0 campaign remains historically complete for its original P1–P9 scope. This task is a new v2 rearchitecture.

## Design Phase — Plan freeze

- Start Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- End/Tested Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- Status: Complete
- Validation/CI: design/documentation only; no Package implementation or runtime test was performed during discussion

### Completed

- audited the released v1.0 bounded campaign and identified the real 30-day authority ceiling;
- created task branch `refactor/original-occult-western-fantasy-long-lived-world` from `package@79447c0b8aca028c6929ff8f9842f8835676191f`;
- created a separate long-lived-world Plan Bundle without rewriting v1 historical truth;
- froze one continuous supernatural-long-lived protagonist;
- froze non-terminal ordinary death/reconstruction;
- froze tiered NPC lifecycle, multi-generation family history and institutional succession;
- froze open-ended hierarchical time and multi-decade event-driven fast-forward;
- froze renewable grammar/world-state content generation;
- froze Hot/Warm/Cold/Archive history, Canonical Fact Ledger, artifacts and century retrieval;
- froze horizontal progression, persistent assets, career/public identity and optional city-scale power;
- froze Era evolution into modern/later alternate-history technology and occult modernization;
- froze Active Hub / Warm Region / Cold World multi-region scope;
- froze macro economy/governance/war/migration/disaster/social/occult history;
- froze delegation, organizational hierarchy and institutional autonomy;
- froze final **10,000 authoritative turns / 200 in-world years** hard completion gate;
- froze 8-phase implementation staging;
- froze `2.0.0` as target release;
- froze retention of `releases/1.0.0.atria` unchanged;
- froze that old v1 save compatibility is not required.

### Key decisions

See `plans/package/original-occult-western-fantasy-game-long-lived-world/decisions.md`.

### Known limitations

- no game/runtime implementation has started;
- Phase 1 runtime schemas and exact field names remain implementation details;
- no Phase 1 tests have been run yet;
- no claim has been made that current v1.0 supports long-lived play.

### Next checkpoint

Complete **Phase 1 — Long-Horizon Runtime Foundation** on the existing task branch, validate its exit criteria, commit/push, then update this Record and `HANDOFF.md` and stop.

## Phase 1 — Long-Horizon Runtime Foundation

- Start Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- End/Tested Package HEAD: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- Implementation commit: `9e9c31890afe288674fa02841a715f93f7f2e8e1`; final deadline regression commit: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- Compatible tested Core HEAD: `main@4b9fd013880cfc242d330f4a2be143416be20d4f`
- Documentation baseline: `050dd046766436762c4ae138bb38d098dad5ce79`
- Status: **Complete — stopped at the Phase 1 boundary**
- Validation date: 2026-10-02
- Development version: `2.0.0-phase1`; final release target remains `2.0.0`

### Completed

- Default compilation applies a long-horizon declaration layer after the retained opening/network/convergence compilers.
- Removed the global Day 30, daily next-tick and 2,880-minute advance limits from the default world; retained the bounded historical campaign under explicit `--v1-campaign` selection.
- Added a Gregorian calendar derived from the one Native minute clock, including ordinary/leap/century rollover, epoch-relative weeks, seasons and a non-ticking opening Era ID.
- Added chronology ordering and a constant-work interval resolver skeleton. Large spans do not execute every intervening day. Only existing monotone opening/Eastbank obligations are aggregated; unresolved cases do not globally block time.
- Added continuity/provenance primitives: Native session/world namespace, persistent protagonist and public identity, stable current actor IDs/registry, first-introduction stamps and a reserved future allocation cursor.
- Added six-domain persistent Stance schema, revision and chronology stamp. The typed opening.wait contract accepts optional complete Stances and zero-minute stance-only updates; omission preserves the current policy.
- Stored all new state in existing atri_lifecycle domains. Actual Native SaveSystem export/import preserves the complete authoritative state and permits continued multi-year advancement.
- Kept the scalar frontend operational without exposing the structured Stance object as a broken form. Final long-life UI remains Phase 7.
- Documented exact contracts and exclusions in Package `original-occult-western-fantasy-game/runtime/LONG-HORIZON.md`.

### Necessary Core prerequisite

Core independently capped simulation advances at 10,080 ticks and instants at signed-32-bit values. Package declarations alone could not express genuine multi-year minute advancement without bypassing or duplicating Core authority.

A minimal supporting product patch was independently tested, pushed and fast-forwarded into `main@4b9fd013880cfc242d330f4a2be143416be20d4f`:

- simulation instants/advance distance use safe-integer integrity bounds;
- read-only `clock.targetTick` exposes the requested end to declared sparse interval jobs;
- simulation preparation shares that exact target and the existing instant schema;
- job, step, read, effect, command and deliberation budgets are unchanged.

The temporary **Core support** branch `fix/long-horizon-simulation-range` was deleted after integration. Package stayed on the original single task branch throughout; main was not merged into Package. This is an authority prerequisite, not a change to frozen product direction or an extra implementation phase.

### Decisions and repairs

- Civil year 1 / Jan 1 is an ordinal opening epoch, not a real-world historical date. Gregorian arithmetic uses bounded intermediate fields instead of increasing expression budgets.
- World/entity references include the immutable Native sessionId and world ID; SaveSystem already preserves that namespace, so no second UUID/persistence service was introduced.
- `chronology.sequence` is a committed transaction ordinal, not proof of meaningful authoritative-turn counts at later gates.
- The resolver reports interval/scale, but high-impact interruption providers are not implemented. NPC aging and macro consequences are intentionally absent.
- Three equivalent conditional write groups were consolidated to retain the fixed 24-command ceiling. Reusing the scheduler's existing interval-start grant repaired a 17-read Claim regression; the final campaign uses at most 16 reads.
- Preserved Pattern due-date schemas no longer stop at day 37. The slots remain finite fixtures, not renewable content.
- Development v2 has a distinct immutable PackageVersionId and model-resource origins. No v1 save migration was added.

### Actual validation

All checks below actually ran against the compatible Core content above. Early local logs printed the pre-commit Core HEAD while its tested patch was in the working tree; that exact code was subsequently committed as 4b9fd0138. The final build reports 4b9fd0138.

| Check | Result |
| --- | --- |
| `node tools/package.mjs validate --long-horizon-only --core <core>` | Passed: Day 31; month/year/leap/century rollover through year 401; single-step long intervals; stable IDs/provenance; Stances; atomic invalid/overflow/forged-input refusal; complete state/timeline SaveSystem import equivalence into fresh FsEngine and SqliteEngine; five-year continuation on both. 15 focused transactions plus creation setup; max 14 reads / 14 commands / 16 effects. |
| `node tools/package.mjs validate --opening-only --core <core>` | Passed: retained creation, independent records, both starter Seeds, Breach/Claim/Price, all opening dispositions, safe Graphs, actual save continuation, Day 31, typed Host bridge and local HTTP provider retry/idempotency. 50 local provider requests; max 14 reads / 19 commands / 21 effects. |
| `node tools/package.mjs validate --campaign-only --core <core>` | Passed: continuous Eastbank, six interleaved Signatures, manage/prepare and Claim maintain/invoke/release, Hearing, Retry Reply isolation, SaveSystem import, Day 31 and a retained Pattern due on day 38. 67 commits; max 16 reads / 22 commands / 24 effects; largest safe projection 13,489 bytes. |
| `node tools/package.mjs validate --campaign-only --v1-campaign --core <core>` | Passed: historical 30-day fixture, 57 commits, save continuation and atomic Day 31 rejection. Max 15 reads / 17 commands / 19 effects. Behavioral regression, not a repeated v1 completeness audit. |
| Core simulation contract/candidate/session/task Jest suites | Passed: 4 suites / 65 tests with local FsEngine/SqliteEngine, including 200-year and 5,000-year sparse candidates, safe-integer/target rejection and unchanged work budgets. Local MySQL/PostgreSQL services were unavailable (initial connection-refused cases); the final run explicitly disabled those adapters rather than claiming local success. |
| Targeted Core ESLint; Node syntax checks for six changed Package tools; Git whitespace checks | Passed. |
| `node tools/package.mjs build --core <core> --out build/2.0.0-phase1.atria` | Passed: 206,058-byte development container; ignored output, not a release or committed binary. |

Remote Core CI on 4b9fd0138:

- [Authority Transaction](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36981548560): **success**, including the configured MySQL/PostgreSQL matrix and adjacent authority/storage checks.
- [Native Frontend v3](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36981548742): **success**.
- [Native Model Prompt Runtime](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36981548639): **success**.

No local real-browser, Android/device, hosted-model or final long-life UI validation is claimed. No Gate A/B/C, growth/compaction or Century Retrieval gate was attempted.

### Historical release protection

`releases/1.0.0.atria` is unchanged:

- SHA-256: `e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09`
- Git blob before/after: `288eaa3a0bc32da9cebd7e3f2b0ed63ee97748b2`

The long-lived `package` branch remains at 79447c0b8; integration and a 2.0.0 release remain Phase 8 work.

### Limitations / next checkpoint

Phase 2 has **not** started. Raw history growth is unchanged. No Hot/Warm/Cold/Archive, Canonical Fact Ledger, artifact system, NPC/family lifecycle, renewable generation, enterprise/delegation, multi-region, macro/Era simulation, Chronicle or final frontend was implemented.

Next: **Phase 2 — History / Memory / Compaction Core** on the same Package branch. Read live HANDOFF, Plan index and Phase 2 modules only; implement/validate Phase 2, update this Record and HANDOFF, provide the Phase 3 prompt, then stop.

## Phase 2 — History / Memory / Compaction Core

- Start Package HEAD: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- End/Tested Package HEAD: `58b29477c8ac5cb499dcee6f2b13159ff30c1e43`
- Compatible final Core: `main@f116a98de7a09c32f1789a875244c7e4b9e14e20`
- Status: **Complete — stopped at the Phase 2 boundary**
- Core implementation: `9194a5abfbb3e0d02f7ff58870f13d2632699d38`
- Core JSON/storage normalization repair: `f116a98de7a09c32f1789a875244c7e4b9e14e20`
- Core support branch: `fix/native-history-compaction`; fast-forwarded into main, then removed locally and remotely (remote cleanup by the existing merged-branch workflow)
- Development Package version: `2.0.0-phase2`; final release remains `2.0.0`
- Validation date: 2026-10-02

### Completed implementation

- Added Native-owned Hot/Warm/Cold/Archive history in the existing Lifecycle namespace, with age/count retention and logarithmic archive interval bins.
- Added exact canonical source facts, supersession links, source provenance and current-authority cross-checks; hidden sources remain outside public queries.
- Added attributed durable artifacts, copy lineage, status/provenance transitions, source-backed Historical Hooks and light-touch marked/journaled memory independent of world truth.
- Added persisted facet/ID/interval indexes, revision-bound Chronicle pagination, safe recent narrator slices and growth instrumentation.
- Reused the Package's existing opening.wait contract for optional typed history operations; retained the 64-transaction ceiling and existing command/read/effect budgets. Structured History/Stance payloads are not exposed as broken scalar UI controls.
- Added atomic portable checkpoints, recent exact replay, explicit archived Retry expiration and a bounded fail-closed replay fence. The latest approved reply stays readable; old raw messages, event journals and exact retired turn payloads/tombstones do not grow forever in the active snapshot.
- Preserved Native SaveSystem, immutable world/session identity, branch graph and explicit SavePoints. Local historical repository revisions are not garbage-collected; no parallel authority/storage implementation exists.
- Documented the exact contracts and caveats in Package runtime/HISTORY-MEMORY.md and updated the development entrypoint.

### Core prerequisite and repairs

The original Lifecycle compactor only evicted terminal records and did not compact raw transcript/turn history. Snapshot export followed full parent ancestry. Package-only summaries would therefore leave linear raw/save growth and fixed receipt admission ceilings.

The Core support adds optional Lifecycle history policy/transaction annotations, private candidate history preparation, safe Information queries and SessionCore checkpoint publication. Normal packages without history policy keep the original behavior. The repository writer retains expected-HEAD CAS and permits a severed parent only for an explicit, validated checkpoint. Retry after the boundary still restores pre-effect authority; an archived reply cannot advertise a replayable pre-effect state.

Repairs during validation:

- moved ledger consistency checking to complete transaction/publication/load boundaries rather than partially applied simulation effects;
- synchronized direct Host Lifecycle/clock changes without counting them as player turns, copying frozen publication candidates before mutation;
- retired old turn tombstones as well as full turn payloads, closing a hidden linear-growth path;
- retained the last approved reply at checkpoints and refused checkpoints with protected Task-result dependencies;
- pinned historical summary sources when later hooks/memories/artifacts reference them;
- retained operation target/status on durable event anchors for provenance retrieval;
- reused Native canonical JSON hashing and deterministically ordered archive postings after MySQL/PostgreSQL JSON normalization exposed insertion-order assumptions;
- added a four-entry, exact-content-addressed declarative compilation cache containing no session state, proofs or RNG. A local five-sample probe measured roughly 351 ms per uncached full Package compilation, making repeated compilation a material long-run validation cost.

### Actual validation

| Check | Result |
| --- | --- |
| `node tools/package.mjs validate --history-only --core <compatible Core>` | **Passed**: 1,000 separately committed positive time advances in one continuous Native world over at least 10 in-world years; the test asserts meaningful-history and real-clock increments, not sequence/prose padding. Eight actual Fs/SQLite SaveSystem imports preserve all authoritative namespaces and timeline; early letter/contract/copy/hook/marked memory survives a later 100-year jump and remains retrievable with provenance/status. Recent retry is idempotent; private/missing source operations and invalid candidates do not publish. |
| History growth / portable saves | **Passed**, checkpoints below. Whole active snapshot, raw retention, query projection and checkpoint export growth are explicitly checked. Turn tombstones are absent after compaction rather than hidden in another namespace. |
| Core local regression batch | **Passed**: 12 suites / 467 tests on local Fs/SQLite. Subsequent overlapping targeted Host/checkpoint/Save tests: 7 suites / 201 tests. Final history/JSON-order regressions: 2 suites / 12 tests, including three deterministic 1k-history seeds, mock database key normalization, and actual Fs/SQLite checkpoint/import/Retry. Counts overlap; they are not additive. |
| `validate --opening-only` | **Passed**: retained creation/Seeds/Claims/settlements, real Host bridge/provider failure/retry/idempotency, direct Host clock continuation, SaveSystem and Day 31. 50 local synthetic HTTP requests; max 14 reads / 19 commands / 21 effects. |
| `validate --campaign-only` | **Passed**: 67-commit v2 Eastbank campaign, Hearing, Retry, SaveSystem, Day 31 and late Pattern deadline; max 16 reads / 22 commands / 24 effects. |
| `validate --campaign-only --v1-campaign` | **Passed**: retained 57-commit historical fixture, actual restore and atomic Day 31 refusal; max 15 reads / 17 commands / 19 effects. This was not a new v1 completeness audit. |
| `validate --long-horizon-only` on final Core f116a98de | **Passed**: Gregorian/long-span/identity/Stance regression, complete Fs/SQLite save equivalence and continuation; max 14 reads / 14 commands / 16 effects. |
| `build --out build/2.0.0-phase2.atria` on final Core f116a98de | **Passed**: 207,277-byte development container; ignored output, not a release or committed binary. |
| Node syntax for six changed Package tools; targeted Core ESLint; Git whitespace | **Passed**. |

The continuous Package gate ran on Core implementation **9194a5abf**. The final Core **f116a98de** is the subsequent JSON/storage-order repair, covered by the final local history tests, final foundation/build checks and actual four-adapter Authority CI. The 1k continuous run used SQLite with real Fs/SQLite transfers; no local MySQL/PostgreSQL service or 1k run on those engines is claimed. Remote CI covers those engines' checkpoint/restore/retry path.

#### Measured growth

Bytes are serialized measurements, not universal ceilings or a claim about every possible playstyle. The 250/500/750/1000 rows count only the dedicated continuous player-action loop; initial creation/history setup is additional. Successful administrative compaction commits are not meaningful-turn padding.

| Loop turns | Hot/Warm/Cold/Archive | Raw history bytes | Total history bytes | Active state bytes | Query projection bytes | Portable save bytes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 250 | 2 / 24 / 32 / 4 | 723 | 110,526 | 135,981 | 955 | 18,158 |
| 500 | 2 / 24 / 32 / 4 | 723 | 110,582 | 136,046 | 955 | 21,791 |
| 750 | 2 / 24 / 32 / 7 | 729 | 112,383 | 137,848 | 961 | 24,822 |
| 1000 | 2 / 24 / 32 / 6 | 733 | 112,095 | 137,563 | 965 | 27,240 |

Each checkpoint retains one last approved reply and 25 durable entries. Across a 4x turn increase, active state grows about 1.2%, the query projection about 1.0%, and compressed portable saves about 50%, not 4x. The replay filter's changing bit density contributes to compressed-save growth. After the century-distance retrieval/continuation checks, final tiers are 3 / 0 / 0 / 7 with 28 durable entries. History instrumentation observed at most 8 declared fact sources / 28 source-record scans; the focused history flow stayed within 14 ordinary reads / 11 commands / 13 effects.

#### Remote CI

- [Authority Transaction on f116a98de](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36993657474): **success**, including actual Fs, SQLite, MySQL and PostgreSQL history checkpoint/import/Retry tests and adjacent authority/storage/frontend tests.
- [Native Frontend v3 on 9194a5abf](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36992157136): **success**.
- [Native Model Prompt Runtime on 9194a5abf](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36992404686): **success**.
- The initial [Authority CI on 9194a5abf](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36992151667) failed only the two new MySQL/PostgreSQL history cases (56 other suites / 1,726 other tests passed). The canonical JSON/posting-order repair above closes that failure; it was not waived.
- Main rechecks on final Core f116a98de: [Authority Transaction](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36995449817), [Native Frontend v3](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36995449822) and [Native Model Prompt Runtime](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36995449816) are all **success**.

### Scope / limitations

This is Phase 2, not full Gate A lifecycle/renewable-content coverage, Gate B/C, final Century Retrieval or final UI evidence. Ordinary NPC/family lifecycle, renewable generation, enterprises/delegation, regions and Era/macro systems remain future phases.

Growth claims distinguish active authority/raw retention/checkpoint exports from deliberately preserved branches, SavePoints and all immutable local repository backups. Durable facts/marked evidence are not silently deleted; configured durable budgets fail closed. The replay fence has conservative false-positive admission behavior and is not an infinite exact idempotency store. Protected non-turn/pinned Task results prevent checkpointing until their dependencies are resolved.

The v1 release remains unchanged: SHA-256 `e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09`. No v1 save migration or Phase 3 implementation was added.

## Final state

The eight-phase project remains active and incomplete. Phases 1 and 2 are complete. **Phase 3 — Human Lifetime / Family / Institution Lifecycle** is next and has not started.

Continue on the same Package branch. Read live HANDOFF and its full bootstrap prompt; do not merge main into Package, create a Package phase branch, add a v1 save migration or begin Phase 4 during Phase 3.
