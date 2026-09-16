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

## ADR-011 — Phase 4 routes are admitted by Runtime, with legacy context reference policies

Compile the existing mode data into a run-local AgentRegistry in `legacy-agent-routing.js`. The legacy workflow
adapter yields a typed agent.handoff intent before entering the target policy. AgentRuntime owns validation,
receipt persistence, identity change and event publication; it is not a preflight-only validator or a second scheduler.
Spec review replay passes the reviewer identity explicitly through stage options. Stage/node slot identities
preserve reused names and string-node presets; the old ambiguous-target rejection remains authoritative.
Agenda uses a planner-to-configured-agent graph; inline Director definitions are scoped to a single dispatch.

Compatibility routes allow task_only with explicit input references resolved from copied current-run data.
They do not implicitly inherit native scratch or persist Memory OS/model/tool text in handoff receipts.
Native scratch transfer is controlled by definition policies. Runtime assigns handoff identity/time, bounds cycles,
and consumes saved handoff receipts once. Parent orchestration IDs link child attempts and trace metadata.

Mode coordinators and streaming/retry/replay bodies remain compatibility policies. Existing parallel batches stay
in those policies until Phase 7; no new fan-out/join engine was introduced. Lost generator continuations still
reject resume. UI projection and durable reconstruction remain separate Phase 5/6 gates.
See AGENT_RUNTIME_V2_PHASE4.md for tests, coverage and standalone rollback.

## ADR-012 — Phase 5 UI is a replayable event projection, not checkpoint authority

Runtime events carry stable identity/generation/checkpoint metadata and immutable observer copies. A pure
RuntimeProjection journal deduplicates events and reconstructs execution state; terminal generations reject
late state changes while still retaining stale-result diagnostics. Native restore events identify their source version.

Run-scoped adapter sinks feed the existing RunStateStore, binding once to a parent orchestration and never to
a later chat. Loop explicitly binds after opening its presentation run. Sinks remain with Runtime to observe
late results after cancellation without a global subscription. UI observers cannot change checkpoint state.

Preserve legacy rich output sections as presentation data while adding Runtime diagnostics to the current run
panel/export. Rendering/reopening consumes immutable snapshots; pending stream paints read current section text.
Stop acknowledgement is presentation state and a deduplicated command request, not a fabricated terminal state.
Raw prompt/tool/Memory OS content is excluded from the Runtime journal; existing rich export behavior is preserved.

The log is in-memory execution evidence, not long-term memory or a replacement checkpoint store. Durable page/
process recovery is a Phase 6 storage/rehydration gate. Phase 5 evidence is in AGENT_RUNTIME_V2_PHASE5.md.

## ADR-013 — Phase 6 durable execution barriers and explicit recovery policy

Reuse the host browser IndexedDB boundary for account-scoped execution checkpoints. AccountStorage and
extension settings debounce saves and cannot provide the required durable atomic version check. IndexedDB
strict-durability readwrite transactions serialize read/check/write across connections; no new unmanaged server files, provider
store, remote runner or Memory OS corpus is introduced. Terminal snapshots expire after 24 hours on store open;
interrupted executions remain inspectable until explicitly closed. Both production compatibility adapters use it.

Keep synchronous command admission/cancellation while awaiting the store's flush barrier before port execution,
receipt consumption and terminal delivery. Storage errors poison the cache and reject execution; reopen the
durable state to recover. A queued optimistic receipt must never authorize the next effect before being committed.

Resume uses existing identities with a new generation. Confirmed effects are consumed once. Unconfirmed tool
effects require a ToolPort reconciliation result: completed, explicitly retryable, or fail. Retryable means the
tool adapter guarantees safe replay with the same effect ID at the actual write boundary. The Runtime cannot
undo a write already performed by an external tool. Source guards are revalidated before restored decisions can
continue; removed/revised Memory OS references require replanning rather than reviving checkpoint content.

Do not serialize or replay an async generator to imitate recovery. Lost legacy policy continuations and missing
source-guarded transient tool results fail closed. Native execution and compatible Single requests can explicitly
resume; automatic refresh continuation of entire legacy mode coordinators is not claimed. Diagnostic event logs
remain a separate in-memory projection. See AGENT_RUNTIME_V2_PHASE6.md for tested boundaries and limitations.

## ADR-014 — Phase 7 composes child Runtimes, then consumes an explicit join

Add fanout decisions admitted through existing typed handoff capability/context validation. Static agent policy
caps model-selected concurrency (default 4); child step limits inherit the parent limit. The parent schedules
parallel.fanout and parallel.join as separate stable effects, each protected by the existing durable receipt/
consumption barriers. ParallelExecutor only schedules child invocations; it is not another agent state store.

Child run IDs derive from the parent effect ID and unique encoded branch IDs. The native branch port loads
the child's existing Runtime checkpoint before starting/resuming and requires durable storage during recovery.
Saved fan-out/join receipts bypass branch execution. Native child parentRunId references protect completed
child receipts from retention cleanup while their parent is nonterminal. Explicit payload/scratch copies feed
the existing ContextCompiler; siblings do not merge scratch or acquire another long-term memory namespace.

fail_fast cancels siblings/queued work and fails the join; settled preserves ordered partial outcomes. Branch
and parent cancellation use child signals and existing Runtime abort guards. Late results remain trace-only.
Concurrency is bounded per group, not across independent application features or devices.

Migrate fixed Spec/Agenda batches through a legacy parent tool adapter while retaining existing batch widths,
cache-first-chunk barriers, trace and output ordering. Keep live results transient. Director's active dynamic
dispatch/await policy is not rewritten as a fixed batch. Lost legacy coordinators retain Phase 6 fail-closed
recovery; new primitives are not evidence that active compatibility code can be removed. Phase 8 must inspect
actual callers. See AGENT_RUNTIME_V2_PHASE7.md for automated and browser evidence.
