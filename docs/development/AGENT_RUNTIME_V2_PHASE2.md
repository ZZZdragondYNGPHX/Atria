# Phase 2 — Single compatibility adapter

## Current completion boundary

Continuation base: `168ed1b33c2ff1fa7ca5a5783e172d0fae74df16`; integration baseline remains
`cfb95953071d6459c911e3e6a3bed0144e86ba72`. Work stays on `feat/agent-runtime-v2`.

The Phase 2 minimum gate (one complete legacy mode) is now met for Single, including inherited ordinary tools.
Single's model rounds and serial tool batches are owned by AgentRuntime's state machine. The old worker loop is
entered only for other modes or the explicit `agentRuntimeV2: false` request override. No saved preset is changed.
This is not a claim that Spec/Agenda/Loop/Director have all migrated; their existing paths remain active.

The shared prepareRequest path preserves presets, world info, skills, stable system prefix and fresh per-round notes.
The adapter maps model replies into typed serial tool batches or completion. Final output takes precedence over all
ordinary tools in the same reply, including when invalid empty final text must fail before executing tools.
Provider call IDs and missing-ID deterministic fallbacks are distinct from runtime effect IDs. Provider reasoning
blocks/details, source labels, ordered results and existing trace conversations survive the round trip.
Structured ToolError feedback stays model-visible; infrastructure errors stop the run. The last permitted round's
tool batch still executes, matching legacy behavior, but no extra model round is sent after budget exhaustion.

The run-scoped tool context retains its prototype, notes and custom/extension registries and receives the active
signal and runtime IDs. It is reused across the batch. Tool content stays in a run-local map and is discarded when
the adapter finishes; checkpoint receipts contain transient result references, not copies of Memory OS tool text.
Persistent rehydration/source revalidation is deliberately unavailable in this legacy adapter until the later ports/
recovery work. A lost transient result fails closed rather than reconstructing memory from a checkpoint copy.

Two race boundaries now guard model dispatch after asynchronous context preparation and after context observers.
The serial queue is cleared on cancel/fail; one completed tool receipt can be consumed after an interrupted checkpoint
without replaying that tool. This is an in-memory recovery test, not durable process restart acceptance.

Validation on 2026-09-16:

- Focused kernel/adapter/production-Single/notes selection: 48 tests passed.
- Full selected regression: 162 suites / 1992 tests passed (orchestrator, memory-graph, floor-state and agent-runtime).
- Real Edge headless offline smoke passed: sequential two-tool Single round, next-model history, provider IDs,
  cancellation and module loading; zero page errors.
- Kernel, adapter and protocol pass repository ESLint. Spec runtime passes with only its pre-existing
  no-extra-boolean-cast rule violation suppressed for that file; the unrelated original statement remains unchanged.
- No live Luker session, real-model or Android-device claim. Those remain later play-test gaps, not manual blockers.

Change gate: one Single execution boundary, existing dispatcher/tool/memory owners preserved; source/protocol/state/
adapter and related test/docs files only. Phase-sized budget: up to 14 files and 800 changed lines, including tests
and documentation. This supersedes the generic 5-file/200-line skill default for this authorized stage.
Rollback is a revert of this continuation commit; old loops and explicit fallback remain available.

Next: Phase 3 production ports and tokenizer/layer integration, then continued mode migration. Do not remove legacy
loops, enable parallel batches, or advertise durable memory-safe recovery based on this phase alone.

## Historical first slice (168ed1b33)

Parent: `1d745e184`. Work branch: `feat/agent-runtime-v2`.

The first production adapter is deliberately limited to Single nodes whose resolved ordinary tool flags are off.
`runSpecOrchestration` records eligibility from the existing profile source; `runWorkerNode` checks actual resolved
tool capabilities before selecting the adapter. A request payload `agentRuntimeV2: false` selects the original path.
There is no saved preset rewrite or automatic setting migration.

Code evidence corrected an initial assumption: `spec-schema.js` supplies Layer-2 defaults when `defaultTools` is
absent. Thus default Single can have ordinary tools, and cannot safely be treated as a one-request mode.
The inherited-tools path remains legacy, as do Spec/Agenda/Loop/Director and studio variants outside this slice.
This document does not declare the complete Phase 2 migration finished.

The adapter calls the existing requestToolCallsWithRetry transport helper inside one model effect, not an entire
legacy orchestration loop. Existing card-first preset resolution, world-info preparation, skills, notes, usage
callbacks, output validation, trace and capsule writeback remain at their original boundaries.
An explicit compatibility branch in ContextCompiler preserves prepared messages byte-for-byte; it measures
characters for diagnostics and does not pretend to be the host tokenizer. Full layer/token integration remains Phase 3.
No new Memory OS query is issued here because the existing world-info path already owns this injection.

Verification:

- Adapter unit contracts preserve request fields, tool schemas, messages, response envelope and errors.
- Production runSpecOrchestration comparison verifies equal stageOutputs with v2 enabled/disabled and unchanged profile.
- Inherited tool defaults retain the legacy path; existing custom-tool execution test remains passing.
- Regression selection after the initial slice: 161 suites / 1975 tests passed; a further inherited-default test was added afterward.
- Real Edge headless offline smoke passes: ES-module loading, two model steps, one tool, cancellation, unchanged legacy text; zero page errors.
- ESLint passes for kernel/adapter. Whole spec-runtime lint reports one existing no-extra-boolean-cast issue at
  `if (Boolean(options?.isFinalStage))`, also present in parent `1d745e184`; unrelated line not changed.
- Android, real model and live Luker session integration remain untested. Offline Edge is not a full live-app acceptance.

## First-slice next step (completed by the continuation above)

Continue Phase 2 with default Single's serial tool rounds. Required before widening the eligibility gate:

1. Normalize all tool calls in one model response, preserving provider tool IDs, reasoning blocks and ordered tool results.
2. Move serial batch advancement into the Runtime state machine; do not call the entire legacy worker as a model effect.
3. Preserve output-tool precedence (final guidance wins over ordinary calls in the same response), per-round open notes,
   custom/extension tool visibility and structured ToolError feedback.
4. Extend production golden tests for those cases plus cancellation between tools; only then widen the gate.

After default Single is migrated, proceed to remaining mode adapters and the Phase 3 production ports.
Persistent recovery and uncertain-write reconciliation are still Phase 6; no durable recovery claim is made for this adapter.
