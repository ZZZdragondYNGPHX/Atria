# Platform Gap G2 — Declared Background Task → App Command Bridge

Date: 2026-09-28. Task branch: `feat/native-background-task-app-bridge`.
Baseline: `20d6b11b8e3d15a9089ffeb4da4e90d0c894b457` (fresh origin/main, G1 integrated).
Implementation and verified local/remote main HEAD: `35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`. Main fast-forwarded and pushed; feature ancestry and remote HEAD equality verified. Local temporary branch deleted; remote cleanup request reported the ref already absent, and a fresh fetch/ls-remote confirmed its absence.

## Result

Lifecycle already owns the business decision. A declared background Task now supplies validated content to its fixed typed App Command or scheduled interaction. SessionCore publishes the App effect or scheduled intent, applied Task record, authority receipt and completed outbox item in one Revision CAS. No intermediate proposal acceptance, raw Session patch, second store or scheduler.

Audit covered Task sinks/records, Lifecycle interaction acceptance, workflow/automation outbox, generation Host and scheduler cancellation, SessionCore CAS/receipts, and browser lifecycle pump. Existing ordinary advisory/proposal acceptance remains unchanged. The browser pump requires no new API.

## Package contract

Use `executionClass: "background"`, `queuePolicy: "fifo"` (the default), and:

```json
{ "resultClass": "declared_app_command", "sink": "app_command" }
```

Each Variant must declare exactly one `resultBinding`:

```json
{ "kind": "app.command", "domainId": "sms", "commandId": "append" }
```

Immediate `outputSchema` must exactly equal the target Command's normalized `argsSchema` (object key and required/enum order do not matter). The whole output is passed as args. An optional literal `recordId` selects a fixed record such as a Thread; otherwise Host derives `task-<48 hex characters>` from the invocation hash, creating one stable record per occurrence. Reducers may append content inside a fixed record using the existing typed mutation engine. Domain/Command/record binding is author-declared, never selected from model output.

For delayed delivery:

```json
{ "kind": "interaction.schedule", "interactionId": "sms-delivery" }
```

The referenced existing `lifecycleRuntime.interactions[]` fixes Task, scope, Domain, Command, Clock and maxDelay. Only Variants explicitly bound to that interaction are checked against it, allowing several channel Variants under one Task. Output uses the existing closed `{ recordId, dueTick, args }` envelope: args schema exactly equals Command args; identity and nonnegative safe tick are validated; current Clock <= dueTick <= current Clock + maxDelay. This is a bounded built-in extraction, not a general formula/mapping language. Authors needing semantic-delay calculation must resolve it through their declared Runtime/Task data contract; no new arbitrary scheduling expression is introduced.

Build/install normalization rejects missing Lifecycle, unknown target, schema mismatch, missing/extra binding, bindings on ordinary proposals, non-background execution, latest/superseding queues and cross-scope workflow/automation triggers. Existing advisory interactions still validate all Task Variants and require explicit Host acceptance. An automation cannot declare `interaction.schedule` to consume a fresh proposal.

## Execution and safety

- Generation Host only admits this sink from its durable Lifecycle outbox drain; direct/transient Task execution fails before generation. It checks ready state, pending intent, Task/Variant/input identity, active scope and scope epoch. Player provider bindings and scheduler cancellation remain Host-owned.
- SessionCore independently requires the matching pending intent and fresh revision, then prepares the declared result privately using existing Lifecycle typed validation. Source and target scopes must match. Invalid payload, reducer output, terminal target or retention failure cannot publish partial state.
- Immediate receipt records fixed target and record identity; scheduled receipt records interaction identity. Existing publication fills committedRevisionId alongside storedRevisionId. Delivery receipt remains distinct from authority receipt.
- Exact generation retry uses existing invocation/fingerprint records or tombstones without inference or another append; changed request fingerprints conflict. Concurrent finalizers are resolved by the same Session CAS. Core direct duplicate finalization remains fail-closed rather than introducing a new replay API.
- Pending scheduled results use existing interactions and Lifecycle Clock/pump. Before dueTick they remain pending; pump delivers once and marks delivered. Cancelled/stale scope results do not deliver. Fork/restore restores the whole revision-backed state; an in-flight old revision result cannot commit on the new branch.
- Restart only reads durable outbox/scheduled intent. Promises, provider streams and provisional outputs are not persisted or replayed. No timer or second scheduler was added.
- No data migration. Old result policies and stored receipts remain compatible. Bundled runtime authoring reference documents the new declaration and recorded Scenario `$pending` path.

## Validation actually executed

FS and SQLite only; MySQL/PostgreSQL excluded explicitly using `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`.

From repository root:

```powershell
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/native/background-task-app-bridge-g2.test.js tests/native/task-runtime-p3.test.js tests/native/lifecycle-contract-p4.test.js tests/native/lifecycle-runtime-p4.test.js tests/native/lifecycle-scheduler-p4.test.js tests/native/turn-app-outcome-g1.test.js tests/game-runtime/lifecycle-client-p4.test.js --silent --verbose=false
```

7 suites / 485 tests passed. Then added four production Scenario cases and a direct-Core admission assertion; final G2-only rerun passed 56 tests. Total distinct passing tests: 489, not one final 489-test run. Production code did not change between those runs.

G2 covers ready and workflow-triggered content, fixed/generated record identity, exact replay, changed fingerprint conflict, retention/tombstone replay, concurrent finalizers, invalid output/target injection, typed reducer failure rollback, stale revision, branch change, suspended/cancelled scope, AbortSignal, ordinary explicit proposal acceptance, scheduled dueTick delivery once, delayed cancellation/maxDelay, Host restart/pump and direct execution rejection. Production recorded Scenarios for immediate and scheduled paths report `providerCalls: 0`, exercise real Package installation and SessionCore, and restore without future effects. Host generation tests use recorded outputs, no real inference.

Changed-file ESLint and `git diff --check` passed. No unrelated full-repository tests, Android, Docker, external DB or real-provider runs.

Post-merge on main: G2 suite passed again, 56 tests. Local/remote main equality, feature ancestry, clean working tree and whitespace verified. This rerun is not added to the distinct-test total.

Initial verification setup used the wrong Jest location before correcting to `tests/node_modules`; no tests ran in that failed setup. ESLint found only test assertion style issues, corrected before the passing run. Git lacked configured identity, so commit used the repository's existing `Codex <codex@openai.com>` identity via per-command options, without changing global configuration.

## Scope and handoff

G1 and G2 are integrated. D1 stays deferred. The reference Package branch and its frozen PLAN are not modified or merged into main. A later Package task can synchronize latest main and start its authorized phase; this task does not begin Package implementation.
