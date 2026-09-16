# Orchestration Engine v2: implementation map

Baseline: `custom-release@5cc185d9b9518efa5c1b06144bcb82584a52c5fd`.
Work starts from the approved plan commit `c3f8e36f0` on `feat/orchestration-engine-v2`.

## Ownership and live callers

| Entry | Execution policy | State presently outside Runtime | Output |
| --- | --- | --- | --- |
| main.runOrchestration, simulation | spec-runtime.runSpecOrchestration / executeStage / runWorkerNode / runReviewNode | previousNodeOutputs Map, stageOutputs, reviewRerunCount, approvedReviewFeedbackEntries | last-stage guidance, capsule in main |
| main.runOrchestration, simulation | loop-runtime.runLoopOrchestrationPolicy | conversation, tool rounds, notes/context, finalize result | guidance; exhausted budget is partial |
| main.runOrchestration, simulation | agenda-runtime.runAgendaOrchestration / runAgendaPlannerStep / runAgendaTextAgent | todos, runs, plannerRounds, dispatches, finalGuidance | guidance and unresolved IDs |
| GENERATE_TAKEOVER_DISPATCH, simulation | director-runtime.runMainAgentLoopPolicy / director-tools.createSubagentDispatcher | messages, draft handle, inflight Map, notifications | takeover message handle; no capsule |

Workers currently use runRoutedLegacyWorkflow -> typed handoff -> runLegacyWorkflow.
Single can then use runLegacySingleRequest. Spec/Agenda batches use runLegacyParallel ->
ParallelExecutor. Director's dynamic dispatch/await is still live, not removable code.
Iter Studio uses the same public mode functions and synthetic payload/handle protections.

## Runtime gap

state.js only starts policy.advance for legacyPolicy. Its receipt admits complete/model/tool/handoff,
tool arguments live in the adapter closure, parallel.join returns to model, and appendUserInput starts
a model step. runtime.js rejects recovery for every legacyPolicy continuation. No durable Engine
controller can be built on this contract without a small extension. Extend it with controlMode=policy,
JSON policyState, a read-only snapshot, validated intents and receipt routing. Keep legacy behavior
unchanged, including fail-closed recovery. Do not serialize generators, host handles or Memory OS data.

## Capabilities and host boundaries

Director reply tools are `get_draft`, `draft_search` (read), `write_message`,
`apply_message_patches` (write), `finalize` (submit). Collaboration tools are
`dispatch_subagent`, `dispatch_inline_subagent`, `await_subagents`, `cancel_subagent`.
Subagent schemas already exclude writes/submit; Engine must also check execution and output ownership.
Loop's finalize is a different, guidance-only control tool; classify by mode/role, not name alone.

Existing context paths preserve card-first preset resolution, skill scope, custom tool registries,
Notes/FloorState, world info and Memory OS. Model calls stay on generateTask/Stream -> existing
sender -> luker-dispatch. No new provider, memory store, checkpoint store or parallel pool is needed.

execution-mode-contract.executionConfigText currently hashes version 1, effective profile, preset ID,
API/prompt defaults, world-info inclusion, iteration/review/tool-retry limits, recent-message and
capsule settings, RPM and Agenda limits. Engine Plan semantics must enter this identity before reuse.
User preset storage, character overrides, Agenda chat overrides and old Single fields are read-only inputs.

## Change gate and evidence

Decision: staged refactor under the already approved ten-phase plan. Scope is Runtime policy contract,
new Engine modules, existing orchestrator adapters, relevant tests and development documentation.
No dependency/version changes or unrelated UI/provider/Memory OS work. Each phase is independently
committed; rollback is its standalone revert. Active compatibility code remains until equivalence,
recovery/cancel checks, caller search and browser evidence establish removal safety.

Pre-change Runtime checks: 11 suites / 110 tests passed with Jest on 2026-09-17.
Skill receipt: code-quality-workflow route, library snapshot 2026-08-18, ST-A0 opening gates explicitly
confirmed: goal = approved Engine plan; red lines = its ADRs and fork maintenance rules; acceptance =
its Definition of Done plus executed regression/browser evidence. No design catalog candidate adopted.
Android, real models and human play are coverage gaps, not approval gates.

## Final implementation audit

The table above records the pre-change baseline. Default mode execution now follows the Engine adapters;
see `ORCHESTRATION_ENGINE_V2_PHASE9.md` for the final caller audit and verification. The Director audit
corrected one baseline assumption: worker write/patch tools can be explicitly enabled in existing presets.
Phase 6 preserves those grants while enforcing default denial and owner-only finalize in code.
