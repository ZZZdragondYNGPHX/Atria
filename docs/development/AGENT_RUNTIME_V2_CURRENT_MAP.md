# Agent Runtime v2 — Phase 0 current map

Evidence baseline: `feat/agent-runtime-v2` at `cb68da1f4a39c9417adbd3b2ec11d8d0714681a5`.
Fetched integration baseline: `custom-release` at `cfb95953071d6459c911e3e6a3bed0144e86ba72`.
The work branch adds the plan to that integration commit. Maintenance instruction files have identical blobs on both refs.
Memory OS is merged by `cfb959530`; older feature-only handoff paragraphs are historical.
This inventory changes no executable code, presets, or user data.

## Send to result: production paths

Paths below are repository-relative. Line numbers refer to the evidence baseline.

| Boundary | Actual caller → callee | Contract / owner |
| --- | --- | --- |
| Extension boot | `public/scripts/extensions/orchestrator/index.js` → `main.js` initialization | Registers event listeners, tools and UI |
| Core send | `public/script.js:7287` `Generate()` → `GENERATION_WORLD_INFO_FINALIZED` at 7896 | Awaited event after world-info assembly; contains generation signal/context |
| Guidance entry | `orchestrator/main.js:8770` subscription → `onWorldInfoFinalized` at 1018 | Eligibility, chat identity, filtering, abort controller, snapshot freshness |
| Effective mode/preset | `main.js:776` `getEffectiveProfile` → `getExecutionMode`, `getActivePreset`, mode sanitizers | Global selected mode; explicit active character override; Agenda chat override; Single synthesized profile |
| Guidance mode dispatch | `main.js:877` `runOrchestration` → `runLoopOrchestration`, `runAgendaOrchestration`, `runSpecOrchestration` | Captures active orchestrator preset scope for skills; Single takes Spec path |
| Guidance result | `main.js:1211` run promise → `getOrchestrationOutcome` → `buildCapsule` → `storeCompletedOrchestrationSnapshot` → `injectCapsuleToPayload` → `emitOrchestratorResultEvent` | Only completed output cached; partial budget output can inject guidance; freshness checked before writes |
| Director entry | `public/script.js:8704` `GENERATE_TAKEOVER_DISPATCH` → `main.js:8816` listener → `director-runtime.js:145` `handleDirectorDispatch` | Separate body-authoring path; installs takeover handle |
| Director result | `handleDirectorDispatch` → `runMainAgentLoop` → message editor handle commit/abort/discard → core Generate finalization | Abort keeps partial output but skips successful finalize; errors settle handle; never leave core awaiting forever |
| Stop / scope change | `main.js:765` `abortActiveOrchestratorRun`; generation stopped and chat changed listeners | Stop current RunStateStore run and abort active plugin controller; guidance stop races work promise; late results guarded |

## Mode execution and handoff equivalents

All paths in this section are under `public/scripts/extensions/orchestrator/`.

| Mode | Execution / context chain | Output and migration obligations |
| --- | --- | --- |
| Single | `getEffectiveProfile` → `createSingleAgentProfile` → Spec runtime | Fixed one-stage node, API/prompt settings; no preset-library entry; smallest initial adapter candidate |
| Spec | `spec-runtime.js:1536 runSpecOrchestration` → `executeStage:1272` → `runWorkerNode:642` / `runReviewNode:1061`; review may call `replayStagesToReview:981` | Stage/node outputs and prior-output Map; review reruns, serial/parallel stage behavior and dispatch barrier already exist in legacy |
| Loop | `loop-runtime.js:856 runLoopOrchestration` → `buildInitialMessages:314` → `defaultSendLlm:173` → tool calls → next round / finalize | Capsule + runtimeTrace + status; `main.js` projects capsule into Spec-shaped stageOutputs; note context, custom tools, limits must survive |
| Agenda | `agenda-runtime.js:1095 runAgendaOrchestration` → `runAgendaPlannerStep:576` → `applyAgendaPlannerOps:511` / `normalizeAgendaDispatches:544` → `runAgendaTextAgent:705` | Planner todo/run state, selected outputs, final agent, unresolved IDs/budget reasons; legacy can dispatch concurrent work |
| Director | `director-runtime.js:370 runMainAgentLoop` → `director-tools.js:513 createSubagentDispatcher` | `dispatch_subagent`, inline dispatch, await/cancel and draft write/patch/finalize tools; subagent completion notifications; stream ownership belongs to message handle |

Agent model/prompt resolution uses `agent-resolution.js` and `agent-preset-resolver.js` (`resolveCardFirstPresetName`).
Director has local resolver wrappers around the same card-first rule.
Node/agent instructions, recent chat, prior outputs, notes and world info are currently assembled in each mode.
`skill-resolution.js`, `capsule-injection.js`, `open-notes-injection.js`, `world-info.js`, and `lorebook-filter.js` supply shared pieces.
The new compiler must not silently drop these pieces during migration.

## Actual model boundary

1. Spec/Agenda and Loop's default sender call the shared tool-call helper.
2. `orchestrator/tool-calling.js` is a re-export of `public/scripts/lib/iter-tool-calling.js`.
3. `requestToolCallsWithRetry` (line 170) / single-call wrapper use `context.generateTask` or `context.generateTaskStream`.
4. `public/scripts/generate-task.js:942 generateTask` assembles presets/runtime world info, then `dispatchToSender:409` or `dispatchToSenderStreaming:536`.
5. OpenAI-family sender is `public/scripts/openai.js:4346 sendOpenAIRequest`; request uses `/api/backends/chat-completions/generate`.
6. `src/endpoints/backends/chat-completions.js:1162` route selects provider and invokes `src/luker-dispatch/runner.js:19 runLukerDispatch`.
7. Runner owns generation job lifecycle and dispatch context; `src/luker-dispatch/providers/` owns provider implementations.

Director receives generateTask/stream dependencies from main.js; it does not own a separate provider client.
Other generate-task API families have sender branches; preserving all sender families is a Phase 3 contract obligation.
The server runner imports Node crypto, backend jobs and request inspection: it is not browser-importable.
The frontend adapter must reuse the existing sender/API bridge, not import the server runner into the browser.

## Tools and memory

- `function-call-runtime.js` owns protocol modes, parsing, validation and tool message formatting; it is not the actual extension-tool registry.
- `orchestrator/loop-tools.js:351 executeLoopTool` resolves per-run custom registry → built-in registry → extension registry, normalizes legacy dotted names and enforces simulation handling for writes.
- Each mode handles its control tools (finalize/review/delegation etc.) and delegates ordinary tools to that executor.
- `loop-runtime.js:786 attachToolContext` provides run metadata/notes; individual calls also construct context objects.
- `memory-graph/orchestrator-tools.js:1039 registerMemoryGraphOrchestrationTools` registers Layer-2 tools.
- Its memory_recall implementation calls session `recallMemory(query, { at, signal })` then `assertCurrent()` (669–671).
- The tool's session cache comments explicitly identify per-tool-call context identity; a genuine Runtime RunContext must not use that identity as run ownership.
- Memory OS session/provenance/retrieval remain under `memory-graph/`. Provider evidence is read-only; no v2 memory schema or store is warranted.

## Data ownership

| Data | Current owner | v2 boundary |
| --- | --- | --- |
| Global/character presets | preset-library, character-overrides, persistence/editor-persist | Static definitions; read compatibly, never auto-overwrite |
| Agenda chat override | settings chatOverrides keyed by chat | Legacy input contract |
| Mode loop state | individual runtime local objects/maps | Explicit per-run state |
| UI progress | run-state/store.js singleton; run-panel subscribers | Future projection of runtime events |
| Notes | loop-runtime FloorState adapter | Existing private feature; do not relabel as new agent memory |
| Snapshot reuse | snapshot-cache + execution-mode-contract identity | Existing configuration and source guard |
| Long-term facts/provider history | Memory OS provenance ledger and session | MemoryPort references/freshness, never checkpoint copies |
| Model job/stream | backend generation jobs + dispatch runner | Existing ModelPort transport |
| Recovery checkpoint | no unified orchestration checkpoint found in inspected production loops | New execution-only store, separate from long-term memory |

## Other entrypoints / coverage

`main.js` also owns iteration studio simulations (`runDirectorSimulationLoop`, simulation dispatch and per-mode custom-tool editors around lines 4300–6200).
They reuse legacy runtime/dependency injection and have separate synthetic payload/write protections. They must remain legacy until tested adapters cover them.
Preset editor/import/export and lifecycle handlers remain in main.js and related preset modules, not runtime responsibilities.
This is a production orchestration boundary scan, not a review of every UI handler/provider implementation or proof of browser/device behavior.

## Existing behavior fixtures to retain

- Entry/modes: `tests/orchestrator/spec-agenda-loop-three-modes.test.js`, `loop-integration.test.js`, `director/integration.test.js`, `sim-entry-integration.test.js`.
- Presets/private scope: `get-effective-profile-presets.test.js`, `character-overrides-presets.test.js`, `execution-mode-contract.test.js`, `tests/orchestrator-agent-preset-resolver/unit.test.js`.
- Tools/skills: `custom-tool-runtime-{loop,spec,agenda,director}.test.js`, `per-run-custom-tools-isolation.test.js`, skill-resolution tests, `tests/orchestrator-skills/`.
- Cancellation: `abort-mid-run.test.js`, `director/abort.test.js`, dispatch-barrier tests.
- Output: `snapshot-cache-hits-invalidates.test.js`, `open-notes-cross-mode-injection.test.js`, `director/content-payload.test.js`, run-state tests.
- Memory/floors: `tests/memory-graph/`, `tests/floor-state/` (including source invalidation and provider guards).
- Browser coverage candidates: existing `tests/e2e/orchestrator/` and `tests/frontend/memory-os-source.smoke.mjs`; not executed by Phase 0 inventory.

Next: see `AGENT_RUNTIME_V2_ADR.md` for kernel location and contracts. Migration remains deferred until the headless kernel passes its tests.

## Phase 3 update — production scheduling migrated

The line-number tables above are the immutable Phase 0 scan baseline, not current line references.
Current production calls enter AgentRuntime through native Single's adapter or `runLegacyWorkflow`:
Loop, Spec worker/review, Agenda planner/text-agent, Director main and Director subagent/inline policies all
submit model/tool intents. Simulations reuse these exports. Remaining `for`/`while` statements in those files
express compatibility policy; dispatch is performed by the common kernel ports, not a mode-owned executor.
The preset/iteration authoring UI remains separate as scoped in the original inventory.

ModelPort -> existing tool-calling/stream transport -> generateTask -> assembled ContextCompiler admission ->
existing sender -> backend dispatch. `runtimeContext` never goes to the provider. Memory recall tools reuse
Memory OS through its port and retain transient source guards. Native and compatibility paths preserve the
existing registry/prototype tool context while receiving Runtime IDs and cancellation signals.
See Phase 3's report for tests, deliberate cancellation behavior changes and non-durable policy boundaries.

## Phase 4 update — typed agent transitions

Spec worker/review exports, Agenda planner/text-agent exports and Director named/inline child execution now enter
`runRoutedLegacyWorkflow` -> `runLegacyWorkflow` -> AgentRuntime `policy.advance` -> `agent.handoff` -> target policy.
Registry validation and the persisted handoff receipt precede target execution. The old stage/replay/dispatch
coordinators remain compatibility policies, while model/tool execution remains in the common ports.

Spec review replay carries a source reviewer slot through executeStage; node IDs contain stage/node positions
so old string nodes and repeated node names retain their behavior. Agenda copies only selected prior run results.
Director keeps the existing story context/digest boundary and scopes inline definitions to the current dispatch.
Handoff metadata (stable effect ID, source, target, context policy, parent run) enters the existing trace callbacks.
Single's native execution inherits the admitted graph identity; standalone Loop/Single have no inter-agent hop.
Phase 4's report describes tests and remaining Phase 5 UI / Phase 6 recovery / Phase 7 concurrency work.
