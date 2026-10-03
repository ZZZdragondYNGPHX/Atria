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

## Phase 4 continuation — portable-export repair

- Package: d57f0c0ad1d2c16a9959cff9841a9145f255eb28, same task branch.
- Core support: 6e2611a0a5bbcf743cd9fe19c6eeba457890d3f1, tests-only follow-up;
  runtime unchanged from 0fced2b79. Neither support commit is integrated into main.
- Run [37011388445](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37011388445)
  finished: full Core/four-adapter job **success**, Package candidate **failure**.
  The candidate reached 5,000 actual content turns / 50 years / 1,000 closures;
  active state 833,018 bytes, logical history 590,928 bytes. Its final export hit
  the unchanged 64 MiB save.json cap because export includes the pre-checkpoint
  revision window. Final import and semantic/late-world audits did not run.
  Therefore the run did not pass the Phase 4 gate.

The checker now requests the existing Native history.compact before each measured
export/import. Assertions preserve world clock, all Lifetime/world state except
recomputed work telemetry, facts/heads/anchors/artifacts/hooks/memory and the
meaningful-turn count. Single-branch portable exports must contain one revision.
Archive bytes, uncompressed save.json bytes, active state and model projection are
reported separately. Projection maxima now include investigation evidence, not
just opening views; early/late semantic path and family/institution summaries are
included for audit.

The fix does not change Runtime Authority, SaveSystem, periodic checkpoint/Retry
rules, save/history/lifetime limits, or delete any existing SavePoint, branch or
durable fact. Arbitrary uncheckpointed/branched exports can still hit their safety
limits; those retained-history containers are not active-growth measurements.

Verification executed:

- Expanded real Native renewal session test on Fs and SQLite: **2 passed**, MySQL
  and PostgreSQL excluded locally. Covers previous raw revision windows versus
  one-revision portable export, unchanged durable state, retained old SavePoints,
  archived Retry rejection, new Retry and institution creation/split/merge/
  dissolution followed by actual exports/imports.
- Revised actual Package smoke: **25 content turns / 50 years**, two kinship edges,
  five concluded Matters, one real import; save.json 219,941 bytes, archive 22,524
  bytes, one revision, maximum exercised projection 941 bytes. Not Gate B.
- Package checker syntax and both workspace whitespace checks passed.

Full rerun [37027895867](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37027895867)
was dispatched on exact Core 6e2611a0a and Package d57f0c0ad. The full Core job,
including the expanded configured four-adapter institutional/checkpoint restore
tests, has **passed**. The full Package long run remains in progress.
Phase 4 remains incomplete; do not enter Phase 5.

## Phase 4 complete — verified renewable world candidate

**Phase 4 is complete. Phase 5 has NOT started.**

- Tested executable Package: d57f0c0ad1d2c16a9959cff9841a9145f255eb28.
- Final Package: 7937de304d3f4eef8a9626f3b537d0d4e23996e8, same task branch.
  The final commit changes README/runtime documentation only; compiler, runtime
  declarations and checker are identical to the tested Package commit.
- Verified Core: main@6e2611a0a5bbcf743cd9fe19c6eeba457890d3f1, fast-forwarded
  from 80376ec9f after candidate verification. Temporary support branch removed
  remotely by the merged-branch cleanup workflow and locally after verification.
- Long-lived package remains 79447c0b8aca028c6929ff8f9842f8835676191f; final
  Package integration/release remains Phase 8. No main-to-Package merge occurred.

### Full candidate / semantic and historical audit

[37027895867](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37027895867)
passed BOTH the full Core/four-adapter job and the real Package long run.
The retained workflow artifact is phase4-gate-b-candidate / phase4-gate-b.log.

- **5,000 actual content-mutating turns**, 50 years, 1,000 concluded Matters in
  one continuous Native world/session across five Fs/SQLite imports.
- Two kinship edges across two descendant generations, 18 durable institution
  identities, 349 Matters bound to actual public families.
- **763 distinct semantic structures**. Names/template IDs are excluded; runtime
  distance/cooldown and the independent final rolling-window audit both passed.
- Early 500 Matters: 435 structures; late 500: 427. Strongest late executed path:
  162/500 (32.4%), not a dominant single-template stream. Late activity remained
  genuinely stateful and did not merely accumulate sequence/prose turns.
- Genuine Historical Hook reuses: **4 early, 25 late** (29 total), with exact
  original source/artifact links and activation/resolution provenance. Includes
  opening artifact history.64 re-examined at tick 21,168,864, approximately 40 years
  after creation. The player-marked opening artifact remained retrievable.
- Early/late institution bindings span 8/14 IDs. Actual family-bound Matters are
  214/135; family binding remains real but is not claimed to increase in relative
  frequency as the institution population grows.

| Content turns | Active state bytes | History bytes | Portable save.json bytes | Archive bytes | Max projection bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 249,840 | 187,846 | 254,360 | 39,392 | 945 |
| 2,000 | 321,924 | 247,107 | 326,444 | 52,724 | 953 |
| 3,000 | 435,787 | 342,085 | 440,307 | 66,991 | 957 |
| 4,000 | 582,362 | 465,242 | 586,881 | 83,261 | 957 |
| 5,000 | 732,928 | 590,942 | 737,447 | 97,148 | 957 |

Every measured export contains exactly one revision and restores all authority
and timeline state into a fresh real Fs/SQLite store. The compaction assertions
preserve durable facts, actors, geography, Hooks/artifacts and marked memory.
Active/portable growth over 1k-to-5k is about 2.93x/2.90x for 5x content turns;
projection growth is 945 to 957 bytes. This is measured interval evidence, not a
claim that arbitrary durable-history accumulation is asymptotically bounded.
Explicit old SavePoints/branches retain their own history and are not included
in the active-growth claim. Existing safety budgets still fail atomically.

### Core integration and final verification

- Exact Core 6e2611a0a full Authority/four-adapter CI: success in 37027895867.
  Includes real institution founding/split/merge/dissolution Save/Restore,
  preservation of old SavePoints, portable checkpoints and Retry boundaries.
- Main-triggered Authority Transaction
  [37040144463](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37040144463): success.
- Main-triggered Native Frontend v3
  [37040144523](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37040144523): success.
- Main-triggered Native Model Prompt Runtime
  [37040144694](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37040144694): success.
- All three main workflows use the same verified 6e2611a0a commit; main and its
  remote ref were checked equal. No extra implementation changes were merged.
- Final Package build on actual main@6e2611a0a: **212,231 bytes**, ignored output.
  Historical 1.0.0 SHA-256 remains
  e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.
- Local targeted and prior regression evidence is preserved in the preceding
  entries; no additional hosted-model, device or final Package UI result is claimed.

### Boundary / next phase

This is the first complete **Phase 4 Gate B candidate**, not final multi-region/
wealth Gate B coverage, full Gate A from the earlier history-only test, or Gate C.
The approved 10k-turn/200-year release gate remains Phase 8. No v1 save migration
or 2.0.0 release artifact was added. Phase 5 progression/property/wealth/delegation/
organization autonomy remains unimplemented. Continue only in a new authorized
Phase 5 round, following live HANDOFF and the frozen Plan modules.

## Final state (updated after Phase 6 below)

The eight-phase project remains active and incomplete. **Phases 1–6 are complete.**
Phase 7 — Player-Facing Long-Life Experience is next and NOT started.
The same Package task branch remains active; live HANDOFF contains the current
read order, verified refs, caveats and bootstrap prompt. Stop at this boundary.

## 2026-10-03 — Phase 7 UI/UX planning refinement

This is a user-requested design refinement, not execution/completion of Phase 7.
Phases 1–4 remain complete; Phase 5 is next and has not started.

- Start Package HEAD: 7937de304d3f4eef8a9626f3b537d0d4e23996e8.
- End Package HEAD: 20e739edd6495a4ae93c484c8f438d29b6eac0dc.
- Executable tested baseline remains d57f0c0ad1d2c16a9959cff9841a9145f255eb28;
  this refinement changes only Package README/frontend design document routing.
- Start docs HEAD: e2f8177ba; Plan generation now v1.1.
- Added plans/package/original-occult-western-fantasy-game-long-lived-world/player-facing-experience.md.
- Updated the existing index, Phase 7 staging, UI verification routing and live
  HANDOFF without creating another task Record or changing phase boundaries.

Applied installed frontend-design, ui-ux-pro-max and emil-design-eng. The two
visual database queries did not fit the existing Native game register and were
rejected; the specification preserves inspected marine/paper tokens and records
that decision. Focus guidance used a targeted UX search; general usability rules
use the Skill's built-in guidance.

The specification fixes three primary destinations, section defaults, wide/compact
wireframes, typography/color/spacing, bounded Chronicle/entity/artifact details,
identity/longevity, deliberate time/stance and interruption review, delegation,
regional travel, empty/loading/error/unknown-write behavior, keyboard/focus/motion,
real authority/binding gaps, ordered implementation checkpoints and an acceptance
matrix with a Phase 7 bootstrap prompt. Phase 5/6 contracts remain prerequisites;
future implementers must use their actual schemas rather than invented fields.

Validation: both staged Git whitespace checks and document routing/path/coverage
checks passed. Changes are Markdown only; no runtime tests, build, UI screenshots,
physical device, hosted model or CI run was executed for this refinement. No final
release artifact changed. Historical Phase 4 runtime/CI evidence above is retained,
not reclassified as validation of a new UI. The specification requires actual
Native browser evidence when Phase 7 is implemented and preserves Phase 8 Gate C.

Next checkpoint: execute the existing Phase 5 scope and stop rules. When Phases
5–6 actually complete, use the new Phase 7 specification directly; do not restart
open-ended UI design. No final package integration or release in this round.


## Phase 5 — Progression / Wealth / Delegation / Organization

- Recovered on 2026-10-03 from interrupted chat 01a0fecc-524c-7873-964a-164cf15920aa.
- Original Package baseline: 7937de304d3f4eef8a9626f3b537d0d4e23996e8.
- Reconciled start: 20e739edd6495a4ae93c484c8f438d29b6eac0dc; the intervening
  Phase 7 planning-only changes were fast-forwarded and preserved.
- Package implementation: 68fac6f6452061fc1e522794b8c4d4bff122923d.
- Core implementation: 14c2f8f30adc980caa04ec85046548f229bcc8fd, on feat/native-enterprise-continuity,
  based on main@6e2611a0a5bbcf743cd9fe19c6eeba457890d3f1.
- Development: 2.0.0-phase5. Final target remains 2.0.0.
- Status: **Complete — stopped at the Phase 5 boundary**.

### Implementation

- Added optional Native enterprise declarations/state inside existing Lifetime
  Authority/CAS, sparse clock resolution, History and SaveSystem.
- Early ranks mature at 3; source-distinct knowledge remains horizontal. Embodied
  progress resets on reconstruction; knowledge and costs remain.
- Evidence-backed role permissions/obligations, repeated career changes and
  institution/identity-aware suspension; obsolete actor career also clears.
- Separate persistent protagonist and ordered public/legal identities; real
  registration/forgery costs, retained liabilities and family continuity.
- Identity transitions strand titles/banking and suspend roles/contracts. Paid
  regularization preserves old records rather than silently renaming ownership.
- Real existing-world property, purchases, capital, withdrawals, maintenance,
  income, condition, debt, seizure, transfer and causal inheritance; complete
  financial reconciliation and exact ownership-event provenance.
- Adult named-agent or office-bound delegation with objectives, spend/risk/loss
  boundaries, prohibitions, reporting cadence and mandatory occult escalation.
- Seeded competence/loyalty/ambition, health, instructions, capital and environment
  affect results. Hidden corruption/audit, betrayal and failures mutate the world.
- Ordinary investigations use existing evidence actions or unresolved closure;
  personal/occult/Hook stakes escalate. Family logistics never preserve emotional
  closeness automatically; reconciliation resets the absence interval.
- Player-founded charters, four-level office hierarchy and aggregate workforce;
  Native succession, leadership-driven Agenda drift and founder-order refusal.
- Disclosure-safe cloned backend enterpriseView. No final UI/binding claim.
- Grouped operation verbs and balanced/nested compiler expressions preserve
  existing command/expression limits. No global safety budget was increased.

### Root-cause repairs found while continuing

The initial real Package run failed pre-Ready publication because identity
projection validation required a record that Ready had not initialized. Validation
now gates this projection on Ready, with a regression requiring the correct record
once ready. Runtime identity authority was not weakened or duplicated.

Suspension initially left the protagonist's older career text in the actor graph;
it now reconciles with the remaining real credentials. Closed/destroyed venues
cannot participate in live settlements or new Matter selection; existing Matters
retain explicitly attributed archival inquiry/recording. Business closure carries
its actual tick, revision and cause. Regression actor counts now inspect Lifetime
people rather than an empty top-level snapshot object.

### Local validation actually run

- Native enterprise tests: **17 passed** on the final implementation, including
  seed 17/71/731 split/whole interval equivalence and a broader delegated-case seed
  matrix, hidden failure/audit, ownership, succession, privacy and atomic budgets.
- Existing lifetime and renewal tests: **18 passed**.
- Enterprise Session tests: FsEngine and SqliteEngine passed. The two local SQL
  network adapters failed with ECONNREFUSED because services were absent, not
  reported as passes; hosted four-adapter validation is required below.
- Targeted ESLint for all changed/new JavaScript: passed. Git whitespace: passed.
- Real focused Package candidate passed after the initialization fix: 50 years,
  20 delegated years/four routine reports, eight alternating Fs/SQLite imports,
  identity/property regularization, institutional resistance, inheritance and
  reconstruction; marked original title artifact remained retrievable.
  This local run used the evolving worktree and is not the final commit identity
  evidence; the hosted run below uses exact committed Package/Core SHAs.
- Content assets: 40 resources / 240 assets / 482200 bytes, unchanged.
- Final committed candidate build: 214316 bytes, ignored local output only.
- Retained 1.0.0 SHA-256 remains
  e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.

### Hosted validation / integration

CI [37078163213](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37078163213)
passed against the exact Core/Package implementations above: **63 suites /
1776 tests**, all four adapters, targeted lint and the focused 50-year Package job.

### Boundaries

This is a bounded local economy/organization abstraction, not arbitrary market,
trust/share, legal-code, lending, regional or macro simulation. New enterprise
records have a finite 256-record safety ceiling; budget overflow rejects atomically,
not by dropping facts. Review cadence is sparse, not daily simulation. Unsupported
church/force/borrowing actions are not invented from policy flags. Restricted
research does not silently grant the player occult powers.

The 50-year focused scenario is **not Gate A, B or C** and is not a 5k-turn rerun.
Historical Phase 4 CI 37027895867 remains the 5k/50-year renewable-content candidate,
not final wealth/region/Era coverage. No release, v1 migration, multi-region/Era/macro
or final UI was added. The future Phase 7 UI specification remains preserved.


### Exact hosted Package metrics (37078163213)

- 50 elapsed years; 40 checker transactions, 37 history meaningful turns including
  setup, not a content-soak gate. Compaction is excluded from meaningful turns.
- 20 delegated years, four routine reports and eight successful portable imports.
- Every portable export contains exactly one revision; old saves are not deleted.
- At 20/50 years: active state 186845 / 280653 bytes; bounded enterprise projection
  823 / 827 bytes. These short-stage measures are not asymptotic growth claims.
- Final portable save.json: 285171 bytes; archive: 28685 bytes.
- Actual observed maxima: 14 reads, 11 app commands, 13 effects, seven lifetime
  events. No per-day loop or raised authority budget is used.
- Asset enterprise.2 remains owned by descendant life.person.12 after reconstruction;
  original title artifact history.72 remains marked/retrievable. The founded
  institution renewal.2 drifts to profit with autonomy 2 and refuses founder policy.


### Core integration and stage boundary

- Core 14c2f8f30adc980caa04ec85046548f229bcc8fd was fast-forwarded into main and pushed after the full
  four-adapter CI passed. Git tree equality and matching local/remote HEAD were
  verified; main was clean. No main-to-Package merge occurred.
- The repository's Cleanup merged task branches workflow 37078755503 removed the
  remote support branch; local feat/native-enterprise-continuity was also deleted.
  A subsequent explicit remote delete found it already absent; ls-remote confirmed.
- Automatic main CI uses that same already-verified SHA: Authority Transaction
  37078755497, Native Frontend v3 37078755515, Native Model Prompt Runtime 37078755452.
  All three completed successfully on that same Core SHA (see final results below).
- Package remains on 68fac6f6452061fc1e522794b8c4d4bff122923d; no final integration into package,
  no release artifact and no Phase 6 implementation.

Next checkpoint is a newly authorized **Phase 6 — Multi-Region / Era / Macro
History** round, reading live HANDOFF and its listed modules. Preserve the frozen
Phase 7 player-facing-experience.md specification for that later stage. Stop here.


### Final main verification (2026-10-03)

All automatic integration runs completed successfully on main@14c2f8f30adc980caa04ec85046548f229bcc8fd:

- [Authority Transaction 37078755497](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37078755497).
- [Native Frontend v3 37078755515](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37078755515).
- [Native Model Prompt Runtime 37078755452](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37078755452),
  including its repository unit/lint/prebuild and Core browser regression steps.

These are Core integration checks, not the final Phase 7 Package UI acceptance.
No additional implementation was merged after the exact-commit Phase 5 candidate.
Document route/HEAD/boundary checks and staged whitespace checks passed. Phase 5
is complete; stop with the Phase 6 prompt in the live HANDOFF.


## Phase 6 — Multi-Region / Era / Macro History (2026-10-03)

- Start Package HEAD: 68fac6f6452061fc1e522794b8c4d4bff122923d.
- Start Core: main@14c2f8f30adc980caa04ec85046548f229bcc8fd.
- Implementation Package: b20db579aab53cabe8575409863247fd476c4920.
- Implementation Core candidate: 78858e689ca39a03b807369b55ad0e4e6b1760c4
  (feat/native-regional-history, independent Core worktree; never merged into Package).
- Status: implementation candidate; full regional CI validation in progress.
- Development: 2.0.0-phase6; final target remains 2.0.0.

### Implementation

- Added optional regional declarations to the existing Native Lifetime candidate,
  shared event queue, History sources and SaveSystem. Reused world.change grouping
  rather than adding a 25th declared Lifetime command or raising its budget.
- Three persistent regions with earned two-hub operation; current physical region
  is separate from remote relevance. Cold aggregate history materializes existing
  geography/scars/Era and a real civic office with causal adult intake, not births.
- Paid journeys have exact departure/arrival, route/transport/Era/disruption-based
  duration and saveable in-transit state. Personal remote case/world action is
  refused; local agents retain delegated authority. Region switches do not reset
  titles, public identities, organization autonomy, relationships or history.
- Five-year fixed-anniversary macro resolution: credit/capital cycles, governance
  and law phases, war campaign phases, paired/conserved migration, demographic
  aggregates, epidemic/disaster losses, relief geography, social/religious movement
  phases, private occult incidents and public consequences, technology/adoption.
- Macro conditions change actual enterprise maintenance/income; agents outside a
  target region escalate. Prolonged separation can estrange family bonds.
- Condition-driven opening/networked/regulated eras with preserved prerequisites,
  asynchronous regional adoption, transport speed, record-density exposure,
  business adaptation and era-gated case grammars with actual new evidence paths.
- Bounded cloned regionalView backend projection; not a sandbox binding or Phase 7
  UI. Exact hidden occult causes stay outside public Chronicle queries.

### Repairs found in actual validation

- The initial standalone regional operation exceeded the unchanged 24-command
  declaration budget. Regional verbs now use the existing world.change envelope.
- Actual Package travel exposed an intermediate-state validation bug: Native
  simulation advances its clock before Lifetime resolves arrival. Journey expiry
  now validates against Lifetime.resolvedTick during preparation; completed
  candidates still require the final clock to be fully resolved. A regression
  covers this boundary. Temporary diagnostic logging was removed before commit.

### Local validation actually executed

- Existing Lifetime/Renewal regressions: 18 passed on the implementation path.
- Final regional + enterprise regression run: 28 passed (11 regional, 17 enterprise).
  Includes three seeds, whole/split intervals, normalized JSON, conserved migration,
  actual costs, earned hubs, Era eligibility, hidden history and atomic refusal.
- Regional Session final local run: FsEngine and SqliteEngine passed; MySQL/Pg
  intentionally excluded locally and require hosted four-adapter results below.
  Scenarios exercise six real imports, old SavePoints, portable checkpoints,
  archived Retry refusal, recent exact Retry and invalid-transaction atomicity.
- 100-content-turn/50-year Package smoke passed with a roughly 30-year absence,
  three regions/Eras, six remote delegated reports, two kinship edges and seven
  actual alternating Fs/SQLite imports. All exports contain one revision. This is
  smoke evidence, NOT the 5k gate; its active bytes were 568114, save.json 572633,
  archive 57919 and max projection 1069 bytes on the then-current worktree.
- Targeted source/test lint and whitespace passed. A development Package build
  passed. Retained releases/1.0.0.atria SHA-256 remains
  e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.

### Hosted candidate

CI [37088466630](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37088466630)
was dispatched against the exact implementation SHAs above for Native/four-adapter
regressions and the real multi-region 5000-content-turn/50-year Package candidate.
Results must be appended before declaring Phase 6 complete.

### Scope and preserved boundaries

The macro world is a bounded authored abstraction, not per-person grand strategy.
Reviews and exact relevant lifetimes are event-driven, never full daily loops.
Regional alerts record relevant crises; the existing scheduler is not replaced by
an extra subsystem that interrupts every macro review. Three regional eras do not
claim an unlimited technology tree. The 256-event regional safety ceiling, prior
Lifetime/History limits, protected Task/checkpoint dependencies and all old explicit
SavePoints remain. No fact is dropped on budget exhaustion.

Phase 5 CI 37078163213 remains focused stage evidence; Phase 4 37027895867 and Phase 2
history-only evidence retain their original scope. No final UI, Gate C, 2.0.0
release, v1 save migration, or final integration into package is claimed here.
Phase 7 must implement the already-frozen player-facing-experience.md, not repeat
open-ended UI design.

### Final-candidate residence/permission correction

- Additional inspection found that a birth during player absence could inherit the
  protagonist region rather than its parent's residence. Core now uses the real
  parent region and records exact person residence through History.
- Demotion compacts only rebuildable empty hot-profile stubs, never authored notes,
  identity/kinship or lifetime facts. Re-promotion uses the same people.
- Remote-hub relevance now requires protagonist-owned property or the protagonist's
  own bonds/contracts, not unrelated people or property already transferred away.
- Final local regional suite: 13 tests passed; latest Lifetime suite: eight passed;
  targeted lint passed.
- Core candidate: 50053928d21e74940c1c2d10b70609e6b83ff253. Package HEAD: 3c59ec0697a80886e740bda3f0c8bcdc6c0eaba7.
  The Package changes after b20db579a are documentation-only.
- CI 37088466630 passed 65 suites / 1791 tests and actual four-adapter tests; its
  still-running Package job was superseded by the corrected candidate, so it is
  NOT full regional gate evidence.
- Final exact-commit CI: [37089757760](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37089757760),
  Native/four-adapter plus full regional Package candidate. Pending result.

### Current hosted result / environment stop

- Final CI 37089757760: Native job 111107432009 passed **65 suites / 1793 tests**,
  including actual Fs/SQLite/MySQL/PostgreSQL and targeted source lint.
- Full Package job 111107432187 is still running. Phase 6 is **not complete**.
  No new 5k/50-year gate success is claimed; no Phase 7 implementation or prompt
  that assumes Phase 6 completion is issued.
- The previous comparable Phase 4 Package job took approximately 93.5 minutes.
  The remaining dependency is the long remote candidate, so this work round uses
  the Governance Environment Stop rather than inventing a successful result.
- main remains 14c2f8f30adc980caa04ec85046548f229bcc8fd. Do not integrate the Core
  candidate or delete feat/native-regional-history until the full exact-candidate
  validation passes. Continue on the same Package branch and existing Record.

Final current-Core build also passed on 50053928d21e74940c1c2d10b70609e6b83ff253 and Package 3c59ec0697a80886e740bda3f0c8bcdc6c0eaba7:
215106 bytes, ignored development output. No release file changed.


### Continuation check — 2026-10-03 10:46 Asia/Shanghai

- Local and remote main, Core candidate and Package refs match the SHAs above;
  main, Core, Package and docs worktrees were clean before this documentation update.
- CI 37089757760 is still in progress on Core 50053928d21e74940c1c2d10b70609e6b83ff253.
  Native job 111107432009 remains successful. Regional Package job 111107432187
  is still executing the full candidate step (started 10:26:31 Asia/Shanghai).
- The run has zero uploaded artifacts at this check. `gh run view --job --log`
  refuses log retrieval while the run is in progress; no final metrics were available.
- Confirmed workflow uses `validate --regional-only`, no shortened-turn override,
  pipefail, and an always-uploaded `phase6-regional-candidate` log artifact.
- No implementation changes, CI cancellation/restart, main integration or branch
  cleanup were performed. No additional test/build success is claimed.
- Remote long-run CI remains the only completion dependency: Environment Stop,
  not Phase 6 completion. Resume with the finish-Phase-6 prompt in live HANDOFF;
  issue the Phase 7 prompt only after full evidence, integration and main validation.


## Phase 6 complete — focused acceptance amendment (2026-10-03)

### User decision and workload

The user explicitly requested shorter date verification instead of waiting for
5k-turn/50-year runs, retaining local-first execution. This supersedes the earlier
Phase 6 pending-long-soak requirement above. Plan v1.2 routes the revised stage
gate through verification.md; it does not claim Gate B, high-turn growth proof,
Gate C, final UI or a 2.0.0 release.

- Default regional acceptance is 100 content-mutating turns, 98% fewer than 5000.
- Keep the sparse event-driven 50-year calendar coverage: long regional absence,
  generations and Era evolution are substantive features, not 50 years of daily
  full-fidelity simulation. No production rates, facts or budgets are changed.
- Force Hook reuse every three completed matters and world/institution changes
  every six; validate old opening evidence after 25 years, early/late semantics,
  two kinship edges, institution lineage and ten real portable imports.
- Original regional soak remains explicitly available with --regional-full.
  Arbitrary other short counts are labeled smoke; malformed counts fail closed.
- Optional hosted regional dispatch now defaults to focused acceptance with a
  20-minute cap; regional-soak opts into 5000 turns with a 180-minute cap. No new
  remote Package long run was dispatched.

### Exact implementation and retained CI

- Package: 5c8e641b06303eae9020e31cb760dde4061c1e78, on the same task branch.
  Changes are validation tooling/documentation only, not compiled game policy.
- Focused test executed on Core 50053928d21e74940c1c2d10b70609e6b83ff253 with
  the checker/profile patch committed in Package 5c8e641b0. The later CLI guard
  only rejects --regional-full without --regional-only and was separately tested.
- Core/main: 56df98f50409c7b17817c681f6e3976a564fbb99. Its only change from
  50053928d is the workflow; git diff confirmed public/src/tests are identical.
- CI 37089757760 Native job 111107432009 remains successful: 65 suites / 1793
  tests, including Fs/SQLite/MySQL/PostgreSQL, plus source lint. These exact-runtime
  results are retained rather than needlessly rerunning the matrix.
- That run's Package job 111107432187 was cancelled at 2026-10-03 11:11:02
  Asia/Shanghai. It is not complete 5k evidence and is no longer a stage blocker.

### Actual focused Package evidence

Command: node tools/package.mjs validate --regional-only --core <Core checkout>.
Passed, profile regional-fast, measured checker elapsed **427252 ms (7m 7s)**.
This is local elapsed time, not a controlled same-host comparison with older CI.
Setup, history compaction, travel and narration do not count toward the 100
meaningful content turns.

- 50 years; three journeys across Eastbank / Northreach / Salt Coast. The first
  departure-to-return span is about 32.5 years; ownership survives and six remote
  delegated reviews execute.
- Three Eras (opening/networked/regulated), 54 retained regional events, two
  kinship edges and valid institution predecessor/successor lineage.
- 21 completed matters (one setup matter), 20 sampled generated structures, all
  20 semantically distinct. Early/late samples are 10/10; family-bound are 5/4;
  represented institutions are 3/5. Semantic distance assertions passed.
- Six historical Hook reuses, including original marked opening evidence decades
  later. Original evidence remains queryable and marked after compaction.
- Ten actual alternating SQLite/Fs imports: three departure/arrival pairs plus
  content checkpoints 25/50/75/100. Every export has exactly one revision; all
  authoritative state, timeline and session identity compare equal after import.
- Maximum per-action work: 14 read grants, 11 app commands, 13 effects, five
  Lifetime events; unchanged limits and atomic-rejection behavior remain.

| Content turns | Active state bytes | History bytes | Maximum projection bytes | Portable archive bytes |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 285290 | 226460 | 981 | 31119 |
| 50 | 414631 | 331876 | 1015 | 43871 |
| 75 | 527923 | 423758 | 1069 | 56124 |
| 100 | 651172 | 523036 | 1069 | 67979 |

These measurements exclude accumulated explicit backups. The short sample does
not establish 5k/10k sublinear growth or replace final stress testing.

### Other actual checks, main integration and limitations

- Four new workload-profile tests passed (default, full, diagnostic and invalid
  inputs); checker/CLI syntax and negative CLI-selector test passed.
- Workflow YAML parsed, choice/default assertions passed; changed-workspace
  whitespace checks passed. No new UI/browser/Android claim is made.
- Core was fast-forwarded into main. Main regional test invocation yielded 13
  regional unit passes plus the Fs/SQLite session passes (15 passed total).
  Its MySQL and PostgreSQL session cases failed only on ECONNREFUSED to absent
  local services, so the invocation exited 1 and is **not** reported as a full
  local four-adapter pass. Do not repeat the 15 passes to cosmetically hide the
  environment result; the unchanged-runtime hosted four-adapter evidence above
  supplies those two adapters.
- Main was pushed; the local and remote feat/native-regional-history support
  branch was deleted after integration. Its existing checkout remains detached;
  the Package task branch stays active and main was not merged into Package.
- releases/1.0.0.atria SHA-256 was rechecked unchanged:
  e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.
- Phases 1–6 are complete under the user-approved focused gate. Phase 7 is next,
  not started. Follow existing player-facing-experience.md; do not restart design,
  introduce another state authority, release 2.0.0 or enter Phase 8 early.

Automatic main-push CI at the final check: Authority Transaction 37095803039,
Native Frontend v3 37095803048 and cleanup 37095803006 passed on integrated main.
Native Model Prompt Runtime 37095803004 was still running (not reported as passed).
No Package soak was dispatched; these additional checks do not reopen the
superseded long-soak stage blocker.
