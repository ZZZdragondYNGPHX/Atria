# Runtime v2 decisions and Phase 0 contract draft

Baseline: `cb68da1f4a39c9417adbd3b2ec11d8d0714681a5`; see CURRENT_MAP for code evidence.

## Decisions

ADR-001 through ADR-008 in the approved plan are retained.
ADR-009: put the environment-neutral kernel in `public/scripts/lib/agent-runtime/`.
The active orchestration callers and Memory OS live in browser modules. The backend dispatch runner requires Node/Express/job services.
Existing precedent is `public/scripts/lib/iter-tool-calling.js`, imported by browser code and headless tests.
The kernel must have no DOM, extension globals, Node APIs, provider clients or persistence imports.
This avoids duplicating a browser bundle or exposing the entire server src tree. Node tests import the same ES modules.

ModelPort's production adapter will use generateTask/stream through existing backend dispatch.
ToolPort will wrap executeLoopTool while preserving function-call-runtime protocol helpers.
MemoryPort will wrap Memory OS session recall and freshness checks.
Phase 1 uses injected fake ports only; no production entrypoint is switched.

## Phase boundaries

Phase 1 delivers contracts, pure transitions, registry, event bus, serial effect driver and fake ports/tests.
A minimal compiler and port contracts must exist before legacy migration, as requested by the owner.
Full tokenizer/injection and production port adapters remain Phase 3.
Resume primitives can use an in-memory CAS store; durable recovery, uncertain external side-effect reconciliation and persistent storage remain Phase 6.
Do not claim restart durability from an in-memory fake.
Legacy concurrency remains untouched; new kernel fan-out/join is deferred to Phase 7.

## Contract draft

- AgentDefinition: immutable id, instructions, modelProfile, allowed tools/handoff targets, policies, metadata.
- RunState: runId, currentAgentId, status, generation, stepId, scratch, task, handoffStack, budget, checkpointVersion.
- Commands: startRun, cancelRun, appendUserInput, resumeRun. Invalid transitions reject explicitly.
- Effects carry runId/stepId/effectId; tool calls and handoffs have stable IDs derived from effect identity.
- Serial progression: command → pure transition → pending effect → port completion event → transition.
- Model decisions are structured complete/continue/tool/handoff/wait actions; adapters normalize provider output.
- Handoff requires allowed from/to agents, task/reason/payload/contextPolicy; model text alone never changes routing.
- Tool results use `{ ok, value, error, metadata }`. A failed tool result can be observed by the model; thrown infrastructure errors fail the run.
- Cancel enters cancelling then cancelled once; late async results cannot mutate terminal state or release another effect.
- IDs remain unchanged on duplicate effect delivery. Distinguish completed result from subsequent state consumption.
- Checkpoint version uses compare-and-swap. A superseded driver cannot replace newer state.
- Trace projects lifecycle metadata only, omitting prompts, arguments, results and secret-bearing configuration by default.
- Context layer order: invariants, instructions, task/handoff, recent chat, run scratch, memory recall, environment/tool context.
- Memory recall content is ephemeral. Checkpoints contain only references/query/guard identity; restoration must revalidate/re-recall.

## First implementation gate

Approved scope: new kernel directory, focused tests, phase documents and durable handoff note.
No old runtime, user preset schema, Memory OS schema, version or dependency declaration changes.
Budget: bounded Phase 1 module, split into small contract/state/driver/compiler/store files; no production adapter implementation.
Baseline: run existing orchestrator, memory-graph and floor-state suites before Phase 0 commit; record actual results separately.
Verification: headless transitions, multi-step tools, typed handoff rejection, duplicate IDs, cancellation races, stale model/tool replies, checkpoint conflicts and basic resume.
Rollback: revert the standalone Phase 1 commit; no production path imports the kernel yet.
Stop if correct production integration requires changing presets or bypassing existing dispatch/memory owners; leave that to its named later phase.

Phase 0 verification: existing orchestrator / memory-graph / floor-state Jest selection passed: 158 suites, 1950 tests (2026-09-16). No executable files changed. Browser, model and Android checks were not run for this documentation-only phase.

## ADR-010 — Phase 3 legacy policy adapters share the kernel executor

Retain each mode's completion, retry, review and streaming policies in async generators while migrating its
model/tool operations into yielded intents. AgentRuntime persists `policy.advance`, `memory.recall`, model and
tool boundaries through the same state transition/receipt mechanism as native Single. The generator never
executes a yielded operation itself; live closures and tool/model results stay outside checkpoints.
This is a compatibility adapter, not a second runtime or a durable policy format. A lost continuation rejects
resume before re-executing any effect. Phase 4 replaces graph/routing decisions with typed policies; Phase 6
must provide source-safe durable reconstruction/reconciliation before claiming restart recovery.

Final context admission belongs after the existing host's assembly, not before card/world-info/preset expansion.
A non-wire runtimeContext hook in generateTask/stream calls the shared compiler, using existing named-preset
or host context/output limits. Estimates are labeled; there is no provider-specific second client/token store.
Memory OS guards survive tool return through run-local callbacks, including final tokenization. Existing
world-info owns automatic injection until a separately tested replacement exists; duplicate recall is forbidden.

Phase 3 evidence and full-repository baseline failures are recorded in AGENT_RUNTIME_V2_PHASE3.md.
