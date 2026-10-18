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

## Phase 1 — Long-Horizon Runtime Foundation

- Start Package HEAD: `79447c0b8aca028c6929ff8f9842f8835676191f`
- End/Tested Package HEAD: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- Implementation commit: `9e9c31890afe288674fa02841a715f93f7f2e8e1`; final deadline regression commit: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- Compatible tested Core HEAD: `main@4b9fd013880cfc242d330f4a2be143416be20d4f`
- Documentation baseline: `050dd046766436762c4ae138bb38d098dad5ce79`
- Status: **Complete — stopped at the Phase 1 boundary**
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

### Historical release protection

`releases/1.0.0.atria` is unchanged:

- Git blob before/after: `288eaa3a0bc32da9cebd7e3f2b0ed63ee97748b2`

The long-lived `package` branch remains at 79447c0b8; integration and a 2.0.0 release remain Phase 8 work.

### Limitations / next checkpoint

Phase 2 has **not** started. Raw history growth is unchanged. No Hot/Warm/Cold/Archive, Canonical Fact Ledger, artifact system, NPC/family lifecycle, renewable generation, enterprise/delegation, multi-region, macro/Era simulation, Chronicle or final frontend was implemented.

Next: **Phase 2 — History / Memory / Compaction Core** on the same Package branch.

## Phase 2 — History / Memory / Compaction Core

- Start Package HEAD: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- End/Tested Package HEAD: `58b29477c8ac5cb499dcee6f2b13159ff30c1e43`
- Compatible final Core: `main@f116a98de7a09c32f1789a875244c7e4b9e14e20`
- Status: **Complete — stopped at the Phase 2 boundary**
- Core implementation: `9194a5abfbb3e0d02f7ff58870f13d2632699d38`
- Core JSON/storage normalization repair: `f116a98de7a09c32f1789a875244c7e4b9e14e20`
- Core support branch: `fix/native-history-compaction`; fast-forwarded into main, then removed locally and remotely (remote cleanup by the existing merged-branch workflow)
- Development Package version: `2.0.0-phase2`; final release remains `2.0.0`

### Completed implementation

- Added Native-owned Hot/Warm/Cold/Archive history in the existing Lifecycle namespace, with age/count retention and logarithmic archive interval bins.
- Added attributed durable artifacts, copy lineage, status/provenance transitions, source-backed Historical Hooks and light-touch marked/journaled memory independent of world truth.
- Added persisted facet/ID/interval indexes, revision-bound Chronicle pagination, safe recent narrator slices and growth instrumentation.
- Reused the Package's existing opening.wait contract for optional typed history operations; retained the 64-transaction ceiling and existing command/read/effect budgets. Structured History/Stance payloads are not exposed as broken scalar UI controls.
- The latest approved reply stays readable; old raw messages, event journals and exact retired turn payloads/tombstones do not grow forever in the active snapshot.
- Preserved Native SaveSystem, immutable world/session identity, branch graph and explicit SavePoints. Local historical repository revisions are not garbage-collected; no parallel authority/storage implementation exists.
- Documented the exact contracts and caveats in Package runtime/HISTORY-MEMORY.md and updated the development entrypoint.

### Core prerequisite and repairs

The original Lifecycle compactor only evicted terminal records and did not compact raw transcript/turn history. Snapshot export followed full parent ancestry. Package-only summaries would therefore leave linear raw/save growth and fixed receipt admission ceilings.

The Core support adds optional Lifecycle history policy/transaction annotations, private candidate history preparation, safe Information queries and SessionCore checkpoint publication. Normal packages without history policy keep the original behavior. Retry after the boundary still restores pre-effect authority; an archived reply cannot advertise a replayable pre-effect state.

- synchronized direct Host Lifecycle/clock changes without counting them as player turns, copying frozen publication candidates before mutation;
- retired old turn tombstones as well as full turn payloads, closing a hidden linear-growth path;
- retained the last approved reply at checkpoints and refused checkpoints with protected Task-result dependencies;
- pinned historical summary sources when later hooks/memories/artifacts reference them;
- retained operation target/status on durable event anchors for provenance retrieval;
- added a four-entry, exact-content-addressed declarative compilation cache containing no session state, proofs or RNG.

### Scope / limitations

This is Phase 2, not full Gate A lifecycle/renewable-content coverage, Gate B/C, final Century Retrieval or final UI evidence. Ordinary NPC/family lifecycle, renewable generation, enterprises/delegation, regions and Era/macro systems remain future phases.

Growth claims distinguish active authority/raw retention/checkpoint exports from deliberately preserved branches, SavePoints and all immutable local repository backups. The replay fence has conservative false-positive admission behavior and is not an infinite exact idempotency store. Protected non-turn/pinned Task results prevent checkpointing until their dependencies are resolved.

 No v1 save migration or Phase 3 implementation was added.

## Phase 3 — Human Lifetime / Family / Institution Lifecycle

- Start Package HEAD: 58b29477c8ac5cb499dcee6f2b13159ff30c1e43
- End/Tested Package HEAD: ccc7b6c6ad3d460898ec4c81e875218cc29fdc84
- Compatible Core: 80376ec9f0e5cce9ef1c29422f39604bb7446cfd
- Status: **Complete — stopped at the Phase 3 boundary**
- Development version: 2.0.0-phase3; final release remains 2.0.0

### Completed implementation

- Optional Native human-lifetime policy and typed transaction annotations, declared by the Package after its existing long-horizon/history compilers. State remains in atri_lifecycle; Authority, Clock, History, CAS publication and SaveSystem remain owners.
- Tier A/B relevant actors, two-source relevance promotion, aggregate Tier C turnover and causal adult institutional intake. Introduction remains distinct from explicit pre-opening/actual birth.
- Gregorian birthdays, maturation, retirement, disappearance/return, health/career changes, death and compact inactive profiles. Important structural history is retained rather than deleting actors.
- Consensual romance/marriage/partnership, separation, estrangement/reconciliation, widowhood and new partnerships. Pairwise bonds permit nonexclusive structures; secret bonds/adoptions remain outside public history.
- Children grow up and can become parents without transferring player control.
- Causal legacy foundations: artifact custody transfers with exact provenance; favors, grudges, secrets, obligations, institutional ties and explicit supernatural liabilities; unavailable beneficiaries/assets remain disputed.
- Separate institution, office and office-holder identity; eligibility/nomination/seniority and non-overlapping tenure. Vacancies can materialize adults from aggregate intake without inventing newborn successors.
- Separate protagonist chronological/apparent/public-identity ages, two setting-native longevity routes, explicit costly consent-based sponsorship/refusal and slow family-documentary exposure.
- Non-terminal ordinary protagonist death, continued world evolution during absence, preserved single identity, costly reconstruction and persistent inheritance/Claim/exposure/scars. Returning never refunds consequences.
- Exact dynamic lifecycle sources use the existing canonical ledger, supersession/provenance and Chronicle facets.
- Existing scalar UI omits all unsupported object/array inputs; no unfinished lifetime editor or final UI was added.

### Core prerequisite and repairs

Static same-record Native jobs could not express a dynamic relevant population, relational eligibility or event-driven generational succession. A separately scoped Core support branch, fix/native-human-lifecycle, adds an optional declarative lifetime policy; it is not a Package evaluator or second authority. Normal packages remain unaffected. The Package stayed on its original task branch, and main was never merged into it.

The initial session test attempted importing into an already-existing session. Native correctly refused native_session_import_conflict; the test was repaired to use fresh stores at each import.

### Remote CI / integration

- Core support Authority Transaction workflow: [37002045148](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002045148), **success** on exact 80376ec9f. Includes the added lifetime fixture on configured Fs/SQLite/MySQL/PostgreSQL adapters.
- Main Native Frontend v3: [37002812492](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812492), **success** on 80376ec9f. Main Authority Transaction: [37002812470](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812470), **success**. Main Native Model Prompt Runtime: [37002812654](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002812654), **success**, including the remote E2E subset (16 passed / 1 skipped). All three main runs use exact 80376ec9f.
- No local MySQL/PostgreSQL service run, real browser/device/Android, hosted-model or final long-life UI evidence is claimed.

### Scope / next checkpoint

This phase supplies the bounded lifecycle foundation, not full medical fertility, estate/property law, complete Claim progression, identity rotation, renewable Matters, institution creation/merge/split/dissolution, business/delegation, multi-region or Era/macro simulation. Ordinary childcare and Tier C turnover remain authored abstractions.

 No v1 save migration. The long-lived package branch remains at 79447c0b8aca028c6929ff8f9842f8835676191f; final integration remains Phase 8.

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
resolution. Family-specific content requires actual public kinship.

Historical cases activate and resolve the original Hook with exact attributed
transitions and source/artifact identity. Unavailable artifacts do not reappear.
Ordinary compressed history retains participants, cause and local consequences;
canonical cases/geography enter the existing exact ledger and indexes.

Location/business/district lifecycle and institution founding/merger/split/
dissolution are available. New institutions and successors reuse Native offices,
causal adult intake and succession. Old offices close and never refill after
institution dissolution. Birth remains separate from introduction. Investigation
steps explicitly switch to archived evidence when a witness exits.

 No durable
history is dropped to admit more content. Phase 5 wealth/delegation/property-law,
complete identity rotation, later regions/Era/macro and final UI remain outside scope.

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
actually pass and ordinary failures are repaired. Do not issue Phase 5 work now.

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
export/import. Single-branch portable exports must contain one revision.
Archive bytes, uncompressed save.json bytes, active state and model projection are
reported separately. Projection maxima now include investigation evidence, not
just opening views; early/late semantic path and family/institution summaries are
included for audit.

The fix does not change Runtime Authority, SaveSystem, periodic checkpoint/Retry
rules, save/history/lifetime limits, or delete any existing SavePoint, branch or
durable fact. Arbitrary uncheckpointed/branched exports can still hit their safety
limits; those retained-history containers are not active-growth measurements.

- Expanded real Native renewal session test on Fs and SQLite: **2 passed**, MySQL
  and PostgreSQL excluded locally. Covers previous raw revision windows versus
  one-revision portable export, unchanged durable state, retained old SavePoints,
  archived Retry rejection, new Retry and institution creation/split/merge/
  dissolution followed by actual exports/imports.
- Revised actual Package smoke: **25 content turns / 50 years**, two kinship edges,
  five concluded Matters, one real import; save.json 219,941 bytes, archive 22,524
  bytes, one revision, maximum exercised projection 941 bytes. Not Gate B.

Full rerun [37027895867](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37027895867)
was dispatched on exact Core 6e2611a0a and Package d57f0c0ad. The full Core job,
including the expanded configured four-adapter institutional/checkpoint restore
tests, has **passed**. The full Package long run remains in progress.
Phase 4 remains incomplete; do not enter Phase 5.

## Final state (updated after Phase 6 below)

The eight-phase project remains active and incomplete. **Phases 1–6 are complete.**
Phase 7 — Player-Facing Long-Life Experience is next and NOT started. Stop at this boundary.

## 2026-10-03 — Phase 7 UI/UX planning refinement

This is a user-requested design refinement, not execution/completion of Phase 7.
Phases 1–4 remain complete; Phase 5 is next and has not started.

- Start Package HEAD: 7937de304d3f4eef8a9626f3b537d0d4e23996e8.
- End Package HEAD: 20e739edd6495a4ae93c484c8f438d29b6eac0dc.
- Executable tested baseline remains d57f0c0ad1d2c16a9959cff9841a9145f255eb28;
  this refinement changes only Package README/frontend design document routing.
- Start docs HEAD: e2f8177ba; Plan generation now v1.1.
- Added plans/package/original-occult-western-fantasy-game-long-lived-world/player-facing-experience.md.

Applied installed frontend-design, ui-ux-pro-max and emil-design-eng. The two
visual database queries did not fit the existing Native game register and were
rejected; the specification preserves inspected marine/paper tokens and records
that decision. Focus guidance used a targeted UX search; general usability rules
use the Skill's built-in guidance.

 Phase 5/6 contracts remain prerequisites;
future implementers must use their actual schemas rather than invented fields.

 Changes are Markdown only; no runtime tests, build, UI screenshots,
physical device, hosted model or CI run was executed for this refinement. No final
release artifact changed. The specification requires actual
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

 Runtime identity authority was not weakened or duplicated.

Suspension initially left the protagonist's older career text in the actor graph;
it now reconciles with the remaining real credentials. Closed/destroyed venues
cannot participate in live settlements or new Matter selection; existing Matters
retain explicitly attributed archival inquiry/recording. Business closure carries
its actual tick, revision and cause. Regression actor counts now inspect Lifetime
people rather than an empty top-level snapshot object.

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
  four-adapter CI passed. No main-to-Package merge occurred.
- The repository's Cleanup merged task branches workflow 37078755503 removed the
  remote support branch; local feat/native-enterprise-continuity was also deleted.
  A subsequent explicit remote delete found it already absent; ls-remote confirmed.
- All three completed successfully on that same Core SHA (see final results below).
- Package remains on 68fac6f6452061fc1e522794b8c4d4bff122923d; no final integration into package,
  no release artifact and no Phase 6 implementation.

Next checkpoint is a newly authorized **Phase 6 — Multi-Region / Era / Macro
History** round, reading live HANDOFF and its listed modules. Preserve the frozen
Phase 7 player-facing-experience.md specification for that later stage. Stop here.

## Phase 6 — Multi-Region / Era / Macro History (2026-10-03)

- Start Package HEAD: 68fac6f6452061fc1e522794b8c4d4bff122923d.
- Start Core: main@14c2f8f30adc980caa04ec85046548f229bcc8fd.
- Implementation Package: b20db579aab53cabe8575409863247fd476c4920.
- Implementation Core candidate: 78858e689ca39a03b807369b55ad0e4e6b1760c4
  (feat/native-regional-history, independent Core worktree; never merged into Package).
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
- main remains 14c2f8f30adc980caa04ec85046548f229bcc8fd. Continue on the same Package branch and existing Record.

Final current-Core build also passed on 50053928d21e74940c1c2d10b70609e6b83ff253 and Package 3c59ec0697a80886e740bda3f0c8bcdc6c0eaba7:
215106 bytes, ignored development output. No release file changed.

## Phase 7 emergency device handoff — 2026-10-03 (INCOMPLETE)

User explicitly requested immediate push to continue on another device. This is
an emergency WIP checkpoint, not the Phase 7 exit or approval for Phase 8.

### Pushed state

- Package `refactor/original-occult-western-fantasy-long-lived-world`:
  `6045e9982a6920f04ac2f82a4d7e075d71ca2357`.
- Independent Core support `feat/player-chronicle-bridge`:
  `1891176392f3c7d7529ab8b2188d796d509b6ecd`.
- Core main remains `56df98f50409c7b17817c681f6e3976a564fbb99`.
- Neither support branch nor Package has been integrated. No release created.
- Development version changed to `2.0.0-phase7` in Package tool only.

### Work in progress

Core registers closed `host.history.query`, `host.chronology.interval`, and
`host.world.view` reads in the existing Host catalogue/service. History wraps
existing public `queryHistory`; calendar delegates to Native civil/instant/
anniversary; world views reuse lifetime/enterprise/regional projections. No new
persistence or raw Lifecycle sandbox binding. World projection and byte/bounds
behavior still require full Phase 7 review; do not treat current code as accepted.

Package has three primary destinations, section selector, Chronicle list/detail,
memory mutation wiring, public people/region/delegation reads, calendar review,
complete stance shape, and schema-derived enterprise/family/travel action drafts.
The latest edit adds seven-visible-field paging for larger typed forms, reuses
`opening_wait` and complete nested templates. This last edit and corrected
transport enums (`coach`, `rail`, `motor`) have NOT been built/browser-tested.
Existing schema budgets were not raised (last built state 230/256 nodes, 84 bindings).

### Actual evidence and failures

- Additional main CI 37095803004 confirmed success on unchanged main, including
  integration, lint and listed Native browser cases. No regression to fix there.
- Core `native/chronicle-host.test.js`: five tests passed (public/hidden exact ID,
  bounded cursor, marks/provenance, Gregorian intervals, public person/private
  relationship exclusion and deceased age). This was after world adapter addition.
- Core existing `native/frontend-bridge.test.js`: 16 tests passed before world
  adapter addition. Targeted eslint passed on adapter/catalog/service, but final
  added test/last changes are not claimed fully linted.
- Intermediate Package build succeeded against modified Core; do not mistake its
  printed base HEAD for a clean tested commit. Latest checkpoint not rebuilt.
- Real Edge headless six-step creation passed; initial missing script bundle was
  local setup, then fixed by building Native frontend cache. A subsequent focus
  request rejection disabled controller; focus calls now tolerate stale targets.
- Focused Phase 7 browser diagnostic reaches evidence search and Chronicle reads.
  First failed due to a test locator matching seven rows; corrected to wait for
  requested fact label. Latest run failed because `history-detail` stayed hidden,
  with no controller diagnostics. This is still unresolved; no browser pass.
- Root cause investigation at handoff: repeated `historySelect` is intentionally
  NOT a NodeRef (Native rejects repeated NodeRefs). Its declarative
  `historyInspect` interaction ONLY sets `historySelected`, so the controller
  `event.node === historySelect` handler is never invoked. Existing evidence works
  because its declarative `inspect` also sets detail/open directly. Inspect
  `public/scripts/native/frontend/runtime.js` run/createBlock and fix via supported
  declarative detail/focus or supported controller communication; do not relax
  Native repeated-node constraints or claim backend helpers are bindings.
- Browser screenshots/logs are ignored local build artifacts, NOT portable Git
  evidence. Reproduce on next device. No caches/config/secrets/builds committed.

## Continuation and final workload amendment — 2026-10-04

The user requested pulling the remote task and resuming Phase 7, then explicitly
authorized proceeding directly through Phase 8 to release after Phase 7 is complete
and pushed. They subsequently requested fewer turns because each run would take
hours. Plan v1.3 implements this as 250/500/1,000 measured real content-turn gates
with the 200-year span and all semantic, canonical, restore, seed and UI coverage
retained. The original mandatory 10k becomes optional stress; no reduced run is
represented as 10k evidence. This supersedes historical Phase 7-only stop prompts
and the original final turn count, but preserves the Phase 6 focused amendment.

## Phase 7 complete — 2026-10-04

Implemented/pushed/tested Package: 6fdfb5a2a29dff24e48626cb3e60f5900eb53212.
Clean tested Core main: c8d2d0e0c11c283ade2fa3c730740a0dc480c746.
The full `--frontend-only` run passed on these exact heads with packageDirty=false.
Portable evidence: [frontend report](original-occult-western-fantasy-game-long-lived-world/phase7-evidence/frontend.json).

Three destinations retain opening/Evidence/Cases/Composer/advice/Host Save flows.
Chronicle uses bounded public History/world/calendar adapters and independent
binding aliases. Public refusal
reasons stay closed; preparation refusal releases only its unpublished selection
pin, while uncertain provider/finalization failures retain exact retry selection.
Native navigation locks old filters until the new page is ready; Apply captures
the actual selector synchronously. Related/source browsing blocks old rows.
Checkpoint-aware Reply Retry recomputes enabled state after busy submission ends.

Actual full browser evidence (real FS/Native VM/Edge, local synthetic HTTP):
- all six creation steps, actual provider failure with zero publication and exact
  retry, original evidence/Graph/Hearing/Claim/advisory and Host Composer;
- 200-year UI request interrupted at public birth, exact requested/resolved dates
  and remaining interval; six committed zero-minute stances and invalid policies;
- marked/journaled early letter, UI Save/Restore and reload without replay;
- complete nested delegate/policy forms, readonly identifiers and actual refusal;
- autonomous organization drift/founder refusal, closed/split institution lineage,
  renamed place and decades-away real travel/changed local Era;
- two generations, deceased age frozen at death, prior office/current successor;
- century year/entity/exact-ID retrieval with dates/sources/marks, private exact ID
  returning no records; latest-eight provenance plus full count and destroyed
  carrier refusing UI copy without publication;
- stable protagonist through public identity rotation and real death/reconstruction,
  absence controls/history and UI return with durable costs;
- delayed person read cannot overwrite region choice; 375/390/768/1024/1440,
  landscape/200% text, keyboard/Back/skip focus, one aria-current, dark-preference
  paper surface and reduced motion; no hidden enterprise profiles;
- exported save-container import into fresh FS preserves all state/Timeline and
  next-day Claim/Hearing continuation. Screenshots inspected wide/compact/200%.

Measured: presentation254/256 nodes, 90 bindings, read schemas234/6/171/6;
27 provider requests; maximum observation10463 bytes; maximum work15 reads,
19 application commands,21 effects. Existing ceilings were not raised. Back
focuses the static result-list wrapper, preserving repeated-NodeRef prohibition.
Stage dates/setup spanning200years are UI fixtures, not Gate C content evidence.

Core support integrated and branches cleaned. Exact main CI: Authority
[37142892595](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37142892595),
Frontend [37142893222](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37142893222),
Model Prompt [37142892645](https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37142892645)
all passed. Support Authority37142417163:65 suites/1811 tests across four adapters,
including lifetime/renewal/regional seeds17/71/731. Main Frontend275 suites/3370
 tests; ModelPrompt330 suites/3945 tests plus16 browser tests. Suites overlap;
counts are separate executions, not a summed unique-test count.

 Earlier local MySQL/PostgreSQL attempts had unavailable services; their
failures are not local adapter passes. Hosted Authority supplied real DB coverage.
No hosted model, Android/physical-device/screen-reader or OS-crash claim.

Retained1.0.0 digest remains e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.
User authorization explicitly continues through Phase8 now; no phase7-only stop.

## Phase 8 complete, integrated and published — 2026-10-04

All amended gates passed on one continuous packaged seed1703 save: 250/50years,
500/100years and1,000/200years. Actual elapsed1444723ms (24.08minutes), including
setup/portable imports and the additional50-year probe. Exactly1,000 case-state
mutating turns exclude setup, compaction, imports, clock-only work and prose.
Gate200-year tick105189120; subsequent sparse probe ends at250-year tick131486400.
The original10k is optional and was not claimed as executed. The preceding running
entry is historical; the project is now complete.

Final evidence: [continuous century report](original-occult-western-fantasy-game-long-lived-world/phase8-evidence/century.json),
[runtime](original-occult-western-fantasy-game-long-lived-world/phase8-evidence/runtime.json),
[seed matrix](original-occult-western-fantasy-game-long-lived-world/phase8-evidence/seed-matrix.json),
[final integrated installer/source correspondence](original-occult-western-fantasy-game-long-lived-world/phase8-evidence/integrated-release.json),
[publication and downloaded digest](original-occult-western-fantasy-game-long-lived-world/phase8-evidence/publication.json).

Generated200 Matters with181 semantic structures (25early/175late Matters,
25/160 distinct structures); all past64 comparisons remain nonzero and recent
90-day comparisons satisfy the minimum distance.
Actual33 Historical Hook reuses include the opening letter after100years,
with its original creator/date/content, Canon source and marked/journaled memory
preserved. Exact lookup and year/actor/family/location/institution/case/Era/artifact
queries remain bounded; measured facet scans3–13. Safe final Information Views
are8465/9301/11168/9304/8471bytes.

Multiple generations:11 biological kinship edges,78 office terms,18 institutions.
The same protagonist survives explicit bodily death/reconstruction with durable
costs; inherited foundry/title/letter preserve provenance. Public marriage,
separation and widowhood, ordinary aging/retirement/deaths, institutional autonomy/
founder refusal, split/dissolved predecessor lineage, site construction/reuse/
decline/demolition/rebuild, three actual regional journeys, decades-away return,
remote evolution and three Eras are covered.

48 actual alternating Fs/SQLite imports preserve all authoritative states and
Timeline, including birth, family, organization/property, absence/return, journeys,
succession, content checkpoints and late Historical Hook activation. Each
checkpoint export retains exactly one revision; no full turn-tombstone list remains.
All existing caps remain unchanged.

| Content turns | Years | Durable records | Raw hot bytes | Chronicle context bytes | State bytes | Portable bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 250 | 50 | 553 | 523 | 755 | 660941 | 71539 |
| 500 | 100 | 975 | 541 | 773 | 1063940 | 112001 |
| 1000 | 200 | 1998 | 545 | 777 | 1994710 | 205161 |

Raw hot growth1.042x and Chronicle context1.029x across a4x content increase.
Whole-state/portable growth includes legitimate new Canon, family, institutional,
property, artifact and macro records; it is reported rather than misrepresented
as flat storage. Event tiers stay1hot/10warm/32cold/4–6archive, Timeline1.
The extra50-year advance took1790ms with one interval,74 lifecycle events and91
actors; this is coarse event resolution, not a daily loop. Maximum actual work
14reads/11commands/13effects/74lifetime events.

Final runtime regression:59 provider requests, maximum16reads/22commands/24effects.
Independent Native seeds17/71/731 use the already-green exact Core main CI;
this is one packaged soak plus the fixture matrix, not three packaged soaks.

Integration correction: initial checkout normalized the authored AUI and a
controller newline. Native compiled source offsets/fingerprints then differed;
Node deepEqual attempted a huge Buffer diff and exhausted array-buffer memory.
Two repeat installer attempts failed in this diagnostic path, not accepted passes.
No rebuilt/changed payload was substituted and no repeated century soak was needed.

Core:c8d2d0e0c11c283ade2fa3c730740a0dc480c746. Final Package/tag target:
48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e.
Original1.0.0 SHA remains unchanged. Source/task commits are integrated by
fast-forward into the existing long-lived package branch; main was not merged
into Package/docs. Local and remote task branches were deleted.

Published [Eastbank Field Register2.0.0](https://github.com/ZZZdragondYNGPHX/Atria/releases/tag/original-occult-western-fantasy-v2.0.0)
as a non-draft, non-prerelease game release, without replacing the Atria app
Latest release. Tag original-occult-western-fantasy-v2.0.0 targets the exact final
Package HEAD. Requires Corec8d2d0e0 or
a descendant; Host configures generation. Live HANDOFF is removed at completion.
