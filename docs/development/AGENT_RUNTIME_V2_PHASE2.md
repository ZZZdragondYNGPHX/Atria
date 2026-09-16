# Phase 2 — first compatibility slice (remaining migration open)

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

## Next bounded change

Continue Phase 2 with default Single's serial tool rounds. Required before widening the eligibility gate:

1. Normalize all tool calls in one model response, preserving provider tool IDs, reasoning blocks and ordered tool results.
2. Move serial batch advancement into the Runtime state machine; do not call the entire legacy worker as a model effect.
3. Preserve output-tool precedence (final guidance wins over ordinary calls in the same response), per-round open notes,
   custom/extension tool visibility and structured ToolError feedback.
4. Extend production golden tests for those cases plus cancellation between tools; only then widen the gate.

After default Single is migrated, proceed to remaining mode adapters and the Phase 3 production ports.
Persistent recovery and uncertain-write reconciliation are still Phase 6; no durable recovery claim is made for this adapter.
