# Phase 5 — Runtime events, replayable trace and UI projection

Completed on `feat/agent-runtime-v2`, based on `935935d26a7a4681471a36b1894fce5db1c9115b` (Phase 4).
Acceptance boundary: rebuilding/reopening the panel does not execute or change Runtime work; its execution
log reconstructs the key path without relying on DOM state. Browser/process restart persistence remains Phase 6.

## Ownership and implementation

AgentRuntime publishes versioned events with event/run/step/effect identity, generation, current agent/status,
compiler diagnostics and resolved preset names, tool outcomes, memory references, handoff metadata and restore version.
Effect completion retains the originating step ID even when the next transition has already advanced the state.
Execution observers receive isolated immutable copies; synchronous and asynchronous observer errors cannot fail a run.

The pure `lib/agent-runtime/projection.js` module admits an explicit metadata allowlist, deduplicates event IDs,
and projects per-run effects, contexts, handoffs, failures and stale-result observations. Older generations or
out-of-order events cannot revive terminal execution state. `replayRuntimeEvents` rebuilds the same projection
from its exported events. This journal is execution diagnostics in memory, not a new long-term memory store.

Legacy adapters attach a run-scoped observer automatically. Spec, Agenda, Director main/children and native Single
bind through the existing parent run ID. Loop binds explicitly after its legacy policy opens the panel run,
flushing the few earlier startup events. Once bound, an observer never attaches old events to a later chat/run.
The sink lives with its Runtime rather than a global subscription, so a late host result can still be recorded
after cancellation/adapter cleanup. Removing the view does not become an execution command.

RunStateStore exposes cached immutable presentation snapshots and the Runtime projection. Runtime snapshots are
reused across ordinary token updates; effect indexes and animation-frame coalescing avoid repeated full-log work
on every streamed token. The existing body/reasoning/tool-result sections retain their presentation contracts.
They are not substituted for Runtime checkpoint state or used to infer whether an effect executed.

The existing run panel now includes a collapsible execution trace and exports the complete event journal with
its existing trace export. The diagnostic display shows the latest 100 meaningful events; export keeps all events.
DOM rendering uses textContent, including agent identifiers. Reopening always rebuilds from the snapshot.
Queued stream updates paint the current section body, preventing the old duplicate-delta-after-replay problem.
Old-run events are ignored by the renderer. Aborted/error presentation rounds no longer remain marked running.

Stop is an explicit request through `requestRunStop`, preserving the existing fast-stop/abort callback preference.
Its acknowledgement is saved in presentation state, so refresh cannot re-enable the button or issue the command
twice. Runtime cancellation/completion is separately projected from actual events. No DOM-only stopping status
is treated as execution truth, and no commit/write/retry behavior is moved into the renderer.

## Trace boundaries

Runtime diagnostics omit raw tasks, prompts, tool arguments/results, headers and host objects. Known legacy
handoff reasons are retained as policy codes; arbitrary native reason text is labeled custom_handoff rather
than copied. Preset names and memory IDs/revisions are metadata. Compiler counts keep their existing method and
budgetScope labels: legacy prepared-message diagnostics are not claimed to be exact provider tokens or a new
semantic breakdown of host world-info. Low-level transport retries inside existing sender services remain there;
Runtime effect failures/retries appear as their original effect sequence. Legacy rich section export retains its
existing content behavior; the new Runtime segment is the metadata-only projection.

## Verification

- Expanded regression: 214 suites / 2457 tests passed in agent-runtime, orchestrator, memory-graph, floor-state,
  generate-task and luker-dispatch (`.git/phase5-final-selected.log`).
- Final mode/projection changes: 118 suites / 1335 tests passed (`.git/phase5-final-routing.log`).
- Final async observer isolation check: 9 suites / 75 kernel tests passed (`.git/phase5-observer-final.log`).
- Real mode fixtures assert automatic projection for Loop, Spec review replay, Agenda and Director children.
- Headless Edge at a 390 x 844 viewport uses actual panel/modules: repeated reopening preserves Runtime state,
  streamed text appears once, stop survives reopening, the following write never executes, late results are
  recorded, event replay is identical, HTML-like IDs render as text, export contains the event log, zero page errors.
  Source: `tests/frontend/agent-runtime-projection.smoke.mjs`; evidence: `.git/phase5-browser.log`.
  Screenshot and JSON export stay under .git and are not committed. The existing core browser smoke also passed.
- Changed runtime/panel modules passed ESLint. i18n has 24 existing no-dupe-keys errors reproduced from the exact
  HEAD source through ESLint's API; its two new keys pass with only that file's existing rule exception disabled.
  Unchanged run-state/helpers.js also has existing brace-style errors and is outside this patch.
- Diff whitespace and phase scope checks passed. No dependency/build artifact/user preset changes.

Full-repository tests were not rerun: Phase 3 documents its reproduced baseline failures and unavailable database
coverage. Real Android, actual providers and user play remain untested; no manual test is required to close this phase.
No full-page-reload/process-crash recovery, persisted event log or durable generator reconstruction is claimed.

## Scope and continuation

Phase-sized scope override: at most 28 files / 1300 changed lines. Revert this standalone phase commit to roll back.
No push, merge, release or version bump. Next is Phase 6: durable checkpoint/recovery/reconciliation through an
existing Luker storage boundary, retaining Memory OS freshness and preventing duplicate completed effects.
