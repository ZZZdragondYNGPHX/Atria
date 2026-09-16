# Phase 6 — Durable checkpoints, recovery and cancellation

## Scope and base

Work branch: `feat/agent-runtime-v2`.
Phase base: `4d0c9d4341cb7977472aa9aac4c7a118cee215a0` (Phase 5).
Fork integration baseline remains `custom-release@cfb95953071d6459c911e3e6a3bed0144e86ba72`.
No provider client, Memory OS corpus, preset migration or parallel scheduler was added.

## Implementation

- `DurableCheckpointStore` retains the synchronous Runtime command/read surface and adds an awaited
  persistence barrier. Each queued checkpoint uses an atomic backend compare-and-set. A failed write
  poisons that store instance; recovery must reopen durable truth, not use its optimistic cache.
- `openIndexedDBCheckpoints` uses strict-durability browser IndexedDB read/write transactions to serialize version checks
  across independent connections/tabs. It requires no Web Locks or HTTPS and is visible to the existing
  browser storage inspector. Missing strict durability fails explicitly. This is browser-local, account-scoped
  execution storage, not server storage.
- The host context exposes the existing `getCurrentUserHandle`. Orchestrator configures account scope,
  and both legacy adapters open durable stores by default in the production entry point. Standalone
  headless imports retain injected/in-memory stores. Injected stores remain caller-owned.
- Runtime waits for persistence before port execution, before receipt consumption, and before returning
  terminal output. The receipt and its consumption are separate writes. A failed persistence barrier
  releases no following Runtime effect and never silently falls back to in-memory persistence.
- `resumeRun` remains the recovery entry point. Native model/memory/handoff boundaries resume using the
  same run/step/effect IDs, with a newer generation. A confirmed receipt is consumed without replay.
- An unconfirmed tool calls optional `ToolPort.reconcile(request)` with its original `toolCallId`.
  `{status:'completed', result:{ok,...}}` supplies the existing receipt; `{status:'retryable'}` permits
  retry with the same ID. The latter is an adapter guarantee of safe retry/idempotency, not an instruction
  inferred from a tool name. Missing/unknown resolution fails without executing the tool.
- Restore revalidates Memory OS through its port/guard. A fresh model request can use fresh references;
  an existing decision cannot continue from removed/revised sources. No recalled corpus enters checkpoints.
- Cancellation aborts locally immediately and queues durable terminal state. The running promise waits
  for cancellation persistence. Recovery from a saved `cancelling` state completes cancellation. Cancellation
  during persistence or reconciliation cannot release the next model/tool/agent.
- Orchestrator exposes `listRuntimeCheckpoints` (metadata only) and `cancelRuntimeCheckpoint` for closing
  interrupted executions; same-page active cancellation routes through the live Runtime. Existing active-panel
  Stop still uses its original abort callback. Terminal
  snapshots older than 24 hours are pruned on store open; interrupted snapshots are retained until closed.

## Explicit compatibility and recovery boundaries

| Boundary | Recovery behavior |
| --- | --- |
| Native model/memory/handoff | Revalidate and resume through the same Runtime entry point |
| Tool receipt saved, consumption missing | Consume once, do not invoke the tool again |
| Tool completion uncertain | Reconcile / explicitly safe retry / fail |
| Legacy Single without missing transient results | Adapter accepts explicit `resume:true` with the same run ID and host contract |
| Lost legacy generator or transient tool result | Fail explicitly; never reconstruct by replaying its earlier writes |
| Cancelled or completed run | Terminal; no subsequent effects |

The compatibility generators, their outer mode coordinators, live host handles and source-guarded transient
results are **not** serialized/reconstructed. Refresh does not automatically continue an entire old
Spec/Agenda/Loop/Director conversation. Production persistence is connected, but safe failure remains the
recovery policy for lost legacy continuations. The caller must supply the original compatible registry,
request/policy contract and current source guards to a resumable native execution. IDB does not provide a
cross-device server runner, or undo a remote write already started before cancellation. External tool adapters
must enforce effect-ID idempotency/reconciliation at their own write boundary.

The Phase 5 diagnostic event journal remains in memory. Durable checkpoint state is execution authority;
this phase does not claim that old rich panel sections or the complete event journal survive refresh.

## Verification

- Expanded regression command: `agent-runtime orchestrator memory-graph floor-state generate-task luker-dispatch`:
  **215 suites / 2473 tests passed** (`.git/phase6-verified-expanded.log`).
- Final mode regressions after active cancellation binding and the last memory admission guard:
  **119 suites / 1352 tests passed** (`.git/phase6-final-check.log`).
- New fault tests cover receipt/consumption crash windows, every persisted model/memory boundary, handoff
  boundaries, CAS conflict, failed persistence, changed/deleted memory references, uncertain tool outcomes,
  cancel during persistence/reconciliation, recovery of cancelling state, legacy loss and unsupported schema.
- Edge headless destroys the first page before restoring each model/tool-unacknowledged/tool-receipted/handoff
  case from real IndexedDB. All four complete, with zero duplicate tool calls and account isolation.
  Additional real-IDB checks exercise two competing connections (one winner), the production store factory,
  Single terminal restoration without a second send, cancellation while opening storage, and active cancellation
  through the checkpoint API. Repeated after enforcing strict durability: all pass with zero page errors.
- Existing core and mobile panel Edge smokes pass; panel stop still blocks following writes and preserves
  stale-result diagnostics. No live model, user data, Android device or manual play was used.
- Changed code introduces no ESLint diagnostics. Main's five unused-variable diagnostics reproduce at the
  Phase 5 base and are unchanged. Logs and lint comparison are ignored under `.git/phase6-*`.
- Full repository inventory was not rerun; Phase 3's documented baseline failures remain a separate boundary.

## Delivery and next gate

No build artifacts, dependency changes, APK, push, merge or release. User presets and existing parallel mode
behavior are preserved. This is the Phase 6 persistence/recovery gate, with legacy fail-closed limitations above.
Next is Phase 7: explicit fan-out/join on the established effect identity, checkpoint and cancellation semantics.
Rollback is a standalone revert of this phase commit; existing account/preset formats need no rollback migration.
