# World Simulation Scheduling — Core Record

- Task ID: `feat/world-simulation-scheduling`
- Primary Workspace: `main`
- Consumer: Package P3 `package/original-occult-western-fantasy-game`
- Plan: `plans/feat/world-simulation-scheduling.md`
- Status: **implemented and merged; integrated-main/Package final checks in progress**
- Start main: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`
- Implementation / tested / pushed: `648b00aa4a09dbda274fa18ee1876756ec284f45`
- PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/99 (merged)
- Integrated main: `052c466e3c9e4b07912da0cb602b2933f4821187`

## Scope and decisions

The Package's G2 diagnosis demonstrated a missing orchestration contract, not a defect in P0 transaction atomicity or Fortune use. The user directed autonomous resolution rather than stopping at the gap. The correction was implemented on an independent short-lived product branch, with no copied product code in Package and no raised hard bounds. Package implementation history remains in its own single Record; this record owns only the Core correction.

- Added required `world-simulation@1` / `simulationRuntime`, alongside required `authority-transaction@1`. Optional metadata cannot enable it. Existing Packages without this declaration retain their prior paths.
- Reused the strict Formula AST/type inference/template/grant implementation through a shared module. Static scoped records/fields, scalar computed values, exact destination schemas and UTF-8/work accounting remain enforced.
- A bounded pure driver processes deterministic/conditional due jobs in due-time/priority/identifier order. It uses the existing Lifecycle clock/domain state and existing World Journal, not a scheduler state store. Intermediate due-time visits belong to one declared clock-advance operation; job Transactions cannot recursively advance clocks or dispatch Workflows.
- Added explicit non-player Transaction origin. Static simulation jobs own selection/input; these Transactions are absent from player resolver/frontend catalogs and rejected by the player preparation entrypoint. No fabricated user message or player anchor.
- After deterministic catch-up, admission permits at most one background decision per batch. Hot precedes Warm; Cold is deterministic by default. Job input is an explicit institution-scoped typed payload, not broad World/Timeline context.
- Reused existing Lifecycle outbox/cursors and Task sink. Before execution and acceptance, current eligibility/input is revalidated; stale queued work is cancelled without model execution. Task result, validated institutional Transaction effects and safe publication use one Session CAS. Failure creates no speculative fallback Event.
- Successful foreground Turn finalization schedules admitted work through the existing Host/Task scheduler without awaiting background completion. The callback is transient; the outbox is durable. There is no saved Promise or uncommitted player-selection journal.
- The first profile deliberately limits background admission to one, so same-tick model completion races do not exist. Deterministic same-tick jobs still use stable ordering/revalidation. Larger strategic batches are not silently promised.
- Simulation jobs own canonical deadlines in opted-in Packages; competing legacy canonical schedules/interactions/waits are rejected rather than partially ordered. Maximum profile bounds: 16 jobs/steps, one deliberation, 10080 requested ticks; existing 16 reads / 24 App Commands / 32 effects and all expanded limits may reject earlier.

## Actual validation

1. Strict legacy contract regression after expression reuse: 3 suites / 283 tests passed.
2. Existing private-candidate/bounds regression: 2 suites / 72 tests passed.
3. New simulation contract/candidate/Task/Session coverage includes typed closure negatives, source immutability, three-day Cold progress, deterministic same-tick invalidation, budget/non-progress rejection, scoped dynamic input, stale cancellation, one-CAS acceptance, committed replay and actual save-container import into a fresh store.
4. The local four-engine Authority workflow suite ran 55 suites / 1698 tests: 54 suites / 1697 tests passed; one fixed capability-vocabulary count failed. The expected capability set and its simulation fixture were updated, then that suite's 45 tests passed. This initial aggregate run is not represented as an all-green run.
5. Changed-source/helper/test ESLint and staged whitespace checks passed.
6. Remote checks for exact implementation HEAD were read from GitHub's public API after the Codex backend required unavailable ChatGPT sign-in (no source-control CLI diagnostics fallback): all eight checks succeeded, including Authority (push and PR), integration, Native v3 regression/Hard Cut, Native v3 Heavy/Studio browser, Unit Tests, Lint and Migration Guard. Authority PR run: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36721696117 ; push run: https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36721570223 .
7. Package draft integration against the same implementation passed actual local HTTP Agenda failure/retry, foreground-to-background dispatch, generated Entity acceptance, disclosure checks and save-container restoration. Its final Package HEAD/evidence belongs in the Package Record.

Local MySQL/PostgreSQL tests initially failed because services were unavailable. Dedicated test containers were started; PostgreSQL's default host port was reserved by Windows, so the existing harness environment override pointed to an allocated local port. No test was disabled or product workaround added. The final local matrix used all four engines. Test-only credentials are existing synthetic fixture credentials, not user credentials.

## Limits

No hosted model, manual browser/device, OS-kill or cross-process uncommitted-selection recovery is claimed. Remote browser CI is separate from manual UI/P8 acceptance. Pending task delivery may retry only at an explicit later opportunity; it is not an automatic provider retry cascade. A new authored occurrence is required for reconsideration after stale cancellation; committed results are not superseded.
