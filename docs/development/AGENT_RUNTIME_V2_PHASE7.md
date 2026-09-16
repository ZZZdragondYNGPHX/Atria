# Phase 7 — Parallel primitives

## Base and scope

Branch: `feat/agent-runtime-v2`; phase base: `13f7fe61e0819106c122cfffb352f8e002f82a25`.
Fork integration baseline remains `custom-release@cfb95953071d6459c911e3e6a3bed0144e86ba72`.
This phase adds explicit fan-out/join on the existing Runtime, receipts, cancellation and checkpoint store.
There is no new provider dispatcher or long-term memory system. No preset/config migration is required.

## Native execution contract

`ModelPort` may return a `fanout` decision containing `branches`, `concurrency` and `failurePolicy`.
Each branch has a unique `id` and the existing typed handoff fields: target agent, task, reason, payload
and context policy. Runtime reuses handoff capability validation; unknown/forbidden targets, duplicate IDs
and invalid policies fail before execution. Model-selected concurrency cannot exceed the definition's
`policies.maxConcurrency` (default 4). Child step budgets inherit the parent's limit rather than model input.

The state machine schedules `parallel.fanout` and then a distinct `parallel.join` effect. Both have the same
receipt-before-consumption persistence barriers as existing effects. The join adds an ordered result set to
run-local scratch before the next model step. It never merges child scratch implicitly.

`ParallelExecutor` limits concurrent child invocations per fan-out group. Each child gets a stable run ID
derived from the parent effect ID plus its encoded branch ID. `createRuntimeBranchPort` creates/loads an
existing AgentRuntime for that identity; models, tools, source guards and checkpoints remain child-owned.
Payload and explicitly included scratch are copied into child state and compiled through ContextCompiler.
Task-only branches inherit no scratch. Completed branch values are copied at the completion boundary.

| Policy/command | Behavior |
| --- | --- |
| `fail_fast` | First observed failure aborts siblings, cancels queued work, and fails the join |
| `settled` | Preserve ordered completed/failed/cancelled results and allow the next model to inspect them |
| `cancelBranch(runId, branchId)` | Abort that active/queued branch; settled policy allows siblings to continue |
| Parent cancellation | Abort all queued/active branches and prevent join/following model admission |

Late completions are diagnostic events only. Event projection accepts branch identities, targets and lifecycle
metadata without prompt/result contents; observer failures cannot stall or fail the scheduler.
The parent source guard is checked again at queued branch admission and result acceptance; invalidated sources
cannot release later queued branches. Each child retains its own existing Memory OS recall/context guards.

## Recovery and retention

An unconfirmed fan-out uses the parallel port's explicit `resume` method. The native branch port requires
durable child stores, consumes completed child states without new model/tool calls, and resumes interrupted
children through Phase 6's recovery rules. A missing explicit continuation fails instead of replaying closures.
Saved fan-out and join receipts can be consumed without invoking any branch again.

Native child checkpoints record `parentRunId`. The IndexedDB cleanup transaction retains completed child
checkpoints while their parent is nonterminal. Otherwise a long-running parent could lose its completion
receipts to the ordinary 24-hour cleanup window and mistakenly recreate finished work.

The runtime factory must supply compatible definitions, scoped stores and current Memory OS guards, retaining
required checkpoints. These are browser-local capabilities, not a distributed/server execution service or a
global cross-application concurrency quota. Phase 6's uncertainty and external write/idempotency limits remain.

## Existing mode migration

Spec parallel stages and Agenda dispatch batches now call `runLegacyParallel`. Its parent work is admitted
through a Runtime tool effect; children use the same executor and stable derived identities. Live branch
results remain transient references, preserving the Memory OS boundary. Existing cache-first-chunk barriers,
batch widths, result ordering, Agenda error records and preset behavior remain intact. Spec failure now stops
its sibling branches. Single child IDs derive from the admitted handoff attempt, preventing repeated node
names/replays from colliding in durable storage.

Director's existing dynamic dispatch/await handles and cache barrier remain compatibility code. They are not
rewritten into fixed batches in this phase. Legacy generators/outer mode coordinators still cannot be rebuilt
after process loss; their recovery continues to fail closed. No automatic legacy conversation refresh-resume
or new per-branch UI controls are claimed. Existing panel Stop continues to cancel the whole active run.

## Evidence and next gate

- Expanded offline regressions: **216 suites / 2490 tests passed** (`.git/phase7-final-expanded.log`).
- Final Runtime/mode regression after policy caps and the last source-admission check:
  **120 suites / 1370 tests passed** (`.git/phase7-delivery-tests.log`).
- Unit coverage includes bounded concurrency, ordering, isolated inputs, partial failure, branch/parent cancel,
  stale results, invalid graphs/policies, stable resume identities, receipt-only join recovery and native child reuse.
- Real Edge/IndexedDB test completes one writing branch, stalls another, runs retention cleanup, destroys the
  page, then restores the parent. The completed branch stays untouched: one write, ordered results, one join.
  A production legacy batch/store smoke also verifies stable child IDs and ordered Single outputs.
- Existing recovery/core/mobile-panel browser smokes and the new parallel/retention smoke pass, all with zero
  page errors. Logs are ignored under `.git/phase7-browser-*`. No live model, user data or real-device play was used.
- Changed-code lint introduces no diagnostics relative to the phase base. Spec's pre-existing
  `no-extra-boolean-cast` diagnostic is excluded explicitly; unrelated baseline cleanup is not included.
  Full-repository inventory was not rerun; the unrelated failures recorded in Phase 3 remain a separate boundary.

No dependencies, generated delivery artifacts, push, merge or release. Next is Phase 8: inspect callers and
remove only genuinely unused legacy code. Active Director/mode compatibility policies must not be deleted merely
because a new parallel primitive exists. A standalone revert of this phase restores the previous batch paths.
