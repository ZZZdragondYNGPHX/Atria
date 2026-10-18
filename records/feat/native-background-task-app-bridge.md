# Platform Gap G2 — Declared Background Task → App Command Bridge

Date: 2026-09-28. Task branch: `feat/native-background-task-app-bridge`.
Baseline: `20d6b11b8e3d15a9089ffeb4da4e90d0c894b457` (fresh origin/main, G1 integrated). Local temporary branch deleted; remote cleanup request reported the ref already absent, and a fresh fetch/ls-remote confirmed its absence.

## Result

Lifecycle already owns the business decision. SessionCore publishes the App effect or scheduled intent, applied Task record, authority receipt and completed outbox item in one Revision CAS.

 The browser pump requires no new API.

## Package contract

Use `executionClass: "background"`, `queuePolicy: "fifo"` (the default), and:

```json
{ "resultClass": "declared_app_command", "sink": "app_command" }
```

Each Variant must declare exactly one `resultBinding`:

```json
{ "kind": "app.command", "domainId": "sms", "commandId": "append" }
```

Immediate `outputSchema` must exactly equal the target Command's normalized `argsSchema` (object key and required/enum order do not matter). The whole output is passed as args. Reducers may append content inside a fixed record using the existing typed mutation engine. Domain/Command/record binding is author-declared, never selected from model output.

For delayed delivery:

```json
{ "kind": "interaction.schedule", "interactionId": "sms-delivery" }
```

The referenced existing `lifecycleRuntime.interactions[]` fixes Task, scope, Domain, Command, Clock and maxDelay. This is a bounded built-in extraction, not a general formula/mapping language. Authors needing semantic-delay calculation must resolve it through their declared Runtime/Task data contract; no new arbitrary scheduling expression is introduced.

Build/install normalization rejects missing Lifecycle, unknown target, schema mismatch, missing/extra binding, bindings on ordinary proposals, non-background execution, latest/superseding queues and cross-scope workflow/automation triggers. An automation cannot declare `interaction.schedule` to consume a fresh proposal.

## Execution and safety

- Generation Host only admits this sink from its durable Lifecycle outbox drain; direct/transient Task execution fails before generation. Player provider bindings and scheduler cancellation remain Host-owned.
- Source and target scopes must match. Invalid payload, reducer output, terminal target or retention failure cannot publish partial state.
- Immediate receipt records fixed target and record identity; scheduled receipt records interaction identity. Existing publication fills committedRevisionId alongside storedRevisionId. Delivery receipt remains distinct from authority receipt.
- Exact generation retry uses existing invocation/fingerprint records or tombstones without inference or another append; changed request fingerprints conflict. Concurrent finalizers are resolved by the same Session CAS.
- Pending scheduled results use existing interactions and Lifecycle Clock/pump. Before dueTick they remain pending; pump delivers once and marks delivered. Cancelled/stale scope results do not deliver. Fork/restore restores the whole revision-backed state; an in-flight old revision result cannot commit on the new branch.
- Restart only reads durable outbox/scheduled intent. Promises, provider streams and provisional outputs are not persisted or replayed. No timer or second scheduler was added.
- No data migration. Old result policies and stored receipts remain compatible. Bundled runtime authoring reference documents the new declaration and recorded Scenario `$pending` path.

## Scope and handoff

G1 and G2 are integrated. D1 stays deferred. The reference Package branch and its frozen PLAN are not modified or merged into main. A later Package task can synchronize latest main and start its authorized phase; this task does not begin Package implementation.
