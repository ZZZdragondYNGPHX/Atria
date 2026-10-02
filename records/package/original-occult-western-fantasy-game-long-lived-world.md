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

## Phase 3 — Human Lifetime / Family / Institution Lifecycle

- Start Package HEAD: 58b29477c8ac5cb499dcee6f2b13159ff30c1e43
- End/Tested Package HEAD: ccc7b6c6ad3d460898ec4c81e875218cc29fdc84
- Compatible Core: 80376ec9f0e5cce9ef1c29422f39604bb7446cfd
- Status: **Complete — stopped at the Phase 3 boundary**
- Development version: 2.0.0-phase3; final release remains 2.0.0
- Validation date: 2026-10-02

### Completed implementation

- Optional Native human-lifetime policy and typed transaction annotations, declared by the Package after its existing long-horizon/history compilers. State remains in atri_lifecycle; Authority, Clock, History, CAS publication and SaveSystem remain owners.
- Tier A/B relevant actors, two-source relevance promotion, aggregate Tier C turnover and causal adult institutional intake. Introduction remains distinct from explicit pre-opening/actual birth.
- Gregorian birthdays, maturation, retirement, disappearance/return, health/career changes, death and compact inactive profiles. Important structural history is retained rather than deleting actors.
- Consensual romance/marriage/partnership, separation, estrangement/reconciliation, widowhood and new partnerships. Pairwise bonds permit nonexclusive structures; secret bonds/adoptions remain outside public history.
- Fixed-duration gestation, birth, adoption and chronology-checked multi-generation kinship. Children grow up and can become parents without transferring player control.
- Causal legacy foundations: artifact custody transfers with exact provenance; favors, grudges, secrets, obligations, institutional ties and explicit supernatural liabilities; unavailable beneficiaries/assets remain disputed.
- Separate institution, office and office-holder identity; eligibility/nomination/seniority and non-overlapping tenure. Vacancies can materialize adults from aggregate intake without inventing newborn successors.
- Separate protagonist chronological/apparent/public-identity ages, two setting-native longevity routes, explicit costly consent-based sponsorship/refusal and slow family-documentary exposure.
- Non-terminal ordinary protagonist death, continued world evolution during absence, preserved single identity, costly reconstruction and persistent inheritance/Claim/exposure/scars. Returning never refunds consequences.
- Exact dynamic lifecycle sources use the existing canonical ledger, supersession/provenance and Chronicle facets. Source validation now builds one bounded lookup rather than rebuilding sources for each retained fact.
- Existing scalar UI omits all unsupported object/array inputs; no unfinished lifetime editor or final UI was added.

### Core prerequisite and repairs

Static same-record Native jobs could not express a dynamic relevant population, relational eligibility or event-driven generational succession. A separately scoped Core support branch, fix/native-human-lifecycle, adds an optional declarative lifetime policy; it is not a Package evaluator or second authority. Normal packages remain unaffected. The verified support commit was fast-forwarded into main; the temporary support branch was deleted locally and remotely. The Package stayed on its original task branch, and main was never merged into it.

The initial session test attempted importing into an already-existing session. Native correctly refused native_session_import_conflict; the test was repaired to use fresh stores at each import. Additional checks cover unsafe evidence IDs, allocation-cursor reuse, dead-actor resurrection, invalid parent/office chronology, artifact custody contradictions, absent-person action refusal and JSON key-order normalization.

### Actual validation

| Check | Result |
| --- | --- |
| Package validate --lifetime-only | Passed: 28 committed focused transitions plus creation, 90 actual in-world years, 9 relevant people, 3 kinship/adoption edges, two descendant generations, 4 office terms, and 162 exact history facts. Nine fresh alternating Fs/SQLite SaveSystem imports preserve every authoritative namespace and timeline, followed by continued play. |
| High-risk restore boundaries | Before/after first birth; before death and leadership turnover; after bodily death/before return; after reconstruction/succession; before/after the second generation; after widowhood/new partnership; after 90-year history. |
| Protagonist continuity | Chronological age 118; apparent age under 50; initial public identity age 90. One reconstruction, one durable scar, Claim burden 6 and exposure 7. Inherited artifact custody stays with the beneficiary after return. |
| Core final local batch | Passed: 8 suites / 343 tests (lifetime, lifetime-session, history, history-session, authority-candidate, simulation-candidate, lifecycle-contract and authority-contract). Includes three deterministic lifetime seeds, actual Fs/SQLite checkpoint/import/Retry, no-op turn accounting and split-interval equivalence. |
| Adjacent local regressions | Lifecycle runtime, history-session and simulation-session also passed in an earlier 3-suite subset (120 passing tests in the surrounding run, whose two new lifetime-session tests then failed only on the import-harness conflict and were subsequently repaired/retested). Counts overlap; do not add them. |
| Retained opening | Passed: creation/Seeds/Claims/settlements, Host bridge/provider retries, actual save continuation, 50 local synthetic HTTP requests; max 14 reads / 19 commands / 21 effects. |
| v2 Eastbank campaign | Passed: continuous campaign, Hearing, Retry isolation, save import and Day 31; max 16 reads / 22 commands / 24 effects. |
| Explicit v1 campaign | Passed: retained bounded campaign/save import and atomic Day 31 refusal; max 15 reads / 17 commands / 19 effects. Not a repeated v1 completeness audit. |
| Phase 1 foundation regression | Passed: Gregorian leap/century rollover, stable identity/provenance, long intervals and complete Fs/SQLite restore/continuation. Run against the Phase 3 implementation before the later source-binding/exposure hardening; final lifetime/adjacent tests cover those repairs. |
| Syntax, lint and whitespace | Six changed Package tool syntax checks, targeted Core ESLint and Git whitespace checks passed. |
| Final development build | Passed on Core 80376ec9f: 210,015-byte container in ignored build output. No release artifact created. |

The final lifetime integration log printed the pre-commit Core HEAD f116a98de because that process started while the tested support code was uncommitted. That exact implementation was subsequently committed as 80376ec9f; the final build records 80376ec9f explicitly.

Focused lifetime transactions stay within existing ordinary Authority limits (max 14 reads / 11 app commands / 13 effects). The 90-year restore-container sizes range from 152,123 to 766,787 bytes and include explicit retained revision/save ancestry; this is **not** an active-checkpoint growth claim. Phase 2 compaction/Replay protections remain intact, but the Phase 3 fixture is not a new 1k/10-year history soak or full Gate A.

### Remote CI / integration

- Core support Authority Transaction workflow: [37002045148](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002045148), **success** on exact 80376ec9f. Includes the added lifetime fixture on configured Fs/SQLite/MySQL/PostgreSQL adapters.
- Main Native Frontend v3: [37002812492](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812492), **success** on 80376ec9f. Main Authority Transaction: [37002812470](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812470), **success**. Main Native Model Prompt Runtime: [37002812654](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812654), **success**, including the remote E2E subset (16 passed / 1 skipped). All three main runs use exact 80376ec9f.
- No local MySQL/PostgreSQL service run, real browser/device/Android, hosted-model or final long-life UI evidence is claimed.

### Scope / next checkpoint

This phase supplies the bounded lifecycle foundation, not full medical fertility, estate/property law, complete Claim progression, identity rotation, renewable Matters, institution creation/merge/split/dissolution, business/delegation, multi-region or Era/macro simulation. Ordinary childcare and Tier C turnover remain authored abstractions. Hard state/event/history budgets fail closed and need final-soak profiling.

Historical releases/1.0.0.atria is unchanged: SHA-256 e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09. No v1 save migration. The long-lived package branch remains at 79447c0b8aca028c6929ff8f9842f8835676191f; final integration remains Phase 8.

## Phase 4 — Renewable World Content: implementation candidate (2026-10-02)

**Status: IN PROGRESS. Do not advance to Phase 5.**

- Package: refactor/original-occult-western-fantasy-long-lived-world@0bfb7fe2a69051639c3a1953a05f134808afa2cc.
- Core support: feat/native-renewable-world@0fced2b7989a7e9ff6fbc33ba206232b90a3b6b9.
- Stable main remains 80376ec9f0e5cce9ef1c29422f39604bb7446cfd. Core support has NOT been integrated.
- Long-lived package remains 79447c0b8aca028c6929ff8f9842f8835676191f.
- Development version: 2.0.0-phase4; final target stays 2.0.0.

### Implemented candidate

The Package compiles curated document-fraud, industrial-harm, family-obligation,
institutional-conflict and historical-cold-case grammars. Native Lifetime owns
selection, current-world role eligibility, evidence paths, a bounded presentation
proposal, resolution, deadline escalation and ephemeral/canonical disposition.
No Package evaluator, new scheduler, authority or SaveSystem was introduced.

The semantic window excludes names/template IDs and uses actual actor classes,
executed paths, institutional/historical roles, truth, anomaly, stakes and
resolution. Family-specific content requires actual public kinship. The bounded
backend renewalView omits hidden truth, copies mutable evidence, and treats model
presentation as unverified testimony, not structural canon.

Historical cases activate and resolve the original Hook with exact attributed
transitions and source/artifact identity. Unavailable artifacts do not reappear.
Ordinary compressed history retains participants, cause and local consequences;
canonical cases/geography enter the existing exact ledger and indexes.

Location/business/district lifecycle and institution founding/merger/split/
dissolution are available. New institutions and successors reuse Native offices,
causal adult intake and succession. Old offices close and never refill after
institution dissolution. Birth remains separate from introduction. Investigation
steps explicitly switch to archived evidence when a witness exits.

Existing history/lifetime/state limits remain fail-closed, with one active Matter,
a bounded novelty window and geography/institution admission limits. No durable
history is dropped to admit more content. Phase 5 wealth/delegation/property-law,
complete identity rotation, later regions/Era/macro and final UI remain outside scope.

### Validation actually executed

- Final focused Native renewal suite: **10 passed**, including three seeds,
  semantic structure, chronology/deadlines, real public family eligibility,
  model overreach rejection, Hook/artifact/marked-memory reuse, JSON order,
  failure atomicity, institution lineage/offices, business/district creation.
- Native history suite: **10 passed** after the ordinary-case summary/refs repair;
  its three 1k seeds remain history-core regression evidence, not full Gate A/B.
- Earlier local related batch: **4 suites, 19 passed / 4 skipped** for renewal,
  lifetime and actual Fs/SQLite session publication/import/Retry. Another batch
  including history: **3 suites, 20 passed / 2 skipped**. These were executed during
  implementation, before the last family/summary hardening; the exact final full
  adapter matrix is delegated to the current CI run, not assumed passed locally.
- MySQL/PostgreSQL attempts locally failed to connect at 127.0.0.1:53306/55432.
  They were subsequently excluded from local runs, not reported as local passes.
- Retained Package opening regression passed on the preceding b90b85851 candidate:
  50 local mock-provider requests; Day 31, typed/free-text transactions, failure
  atomicity, Retry and Save/Restore remained valid. No hosted-model/UI claim.
- An earlier Package smoke completed **100 content-mutating turns / 50 years**,
  20 concluded Matters and one real import. This ran before final deadline,
  semantic/history-reuse and projection-audit hardening. It is **not Gate B** and
  does not validate the final candidate. Its empty end-of-case projection sample
  was replaced with maximum nonempty renewalView sampling in the final fixture.
- The initial local 5k attempts were stopped after relevant implementation changes;
  neither completed and neither is a passing gate.
- Four modified/new Package tool syntax checks, targeted Core lint and whitespace
  checks passed. Final ignored build on exact Core 0fced2b79: **212,231 bytes**.
- releases/1.0.0.atria SHA-256 remains
  e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.

### CI / outstanding gate

The Authority workflow now accepts an optional exact package_revision for a
separate real 5,000-content-turn / 50-year Package candidate job, preserving its
existing four-adapter contract job. Gate logs are retained as a workflow artifact.
The fixture additionally mutates family/institution history, reuses real settled
case files and Hooks more frequently late in the world, retrieves an opening
artifact decades later, measures semantic structure/nonempty projection and
performs repeated actual Fs/SQLite imports. Extra setup, clock waits and world
operations do not inflate its counted content turns.

- Prior run [37010021756](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37010021756):
  the full authority-contracts-candidates-and-turns job succeeded on b90b85851,
  including configured four-adapter renewal tests. Its long Package job was
  superseded by the later exact candidate; do not treat it as a passed gate.
- Current run [37011388445](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37011388445):
  Core 0fced2b7989a7e9ff6fbc33ba206232b90a3b6b9 and Package
  0bfb7fe2a69051639c3a1953a05f134808afa2cc. Dispatched; **results pending**.

Phase 4 is not complete until the final current CI, full candidate and audits
actually pass and ordinary failures are repaired. Then integrate verified Core
support into main without merging main into Package, update this same Record and
live HANDOFF, prepare the Phase 5 prompt and stop. Do not issue Phase 5 work now.

## Final state

The eight-phase project remains active and incomplete. Phases 1–3 are complete;
Phase 4 is an implementation candidate under verification. The full 5k/50-year
candidate has NOT passed. Continue Phase 4 on the same Package task branch.
Phase 5 has not started.
