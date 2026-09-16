# Phase 4 — Typed handoff and agent routing

Completed on `feat/agent-runtime-v2`, based on `23b93d36bf758961de30e0ba97f583cdd8b7b755` (Phase 3).
The phase implements graph admission and context transfer for existing production agent transitions.
It does not claim Phase 5 UI projection, Phase 6 durable orchestration recovery, or Phase 7 parallel primitives.

## Runtime boundary

`legacy-agent-routing.js` compiles run-local AgentRegistry definitions from the existing mode/preset data.
`runRoutedLegacyWorkflow` first yields a typed handoff; the same AgentRuntime that executes the target policy
validates its destination, allowed edge and context policy, persists the effect receipt, changes currentAgentId,
and only then enters the target generator. Presets supply definitions and compatibility policies, never a second executor.
The legacy mode coordinators still select stage order, review replay and existing parallel batches as policies.
Their controller identities bridge that legacy coordination; this phase does not reconstruct parent generators after restart.

| Production transition | Routing policy and preserved input |
| --- | --- |
| Spec/Single stage -> worker or reviewer | Registered stage/node slot; copies prior output maps; string-node presets remain supported |
| Spec review -> replay prefix | Reviewer identity propagated explicitly; only earlier slots allowed; existing target ambiguity/budget checks remain |
| Agenda -> planner | Registered planner; all current run references available to planning |
| Agenda planner -> worker/finalizer | Registered configured agent; only selected inputRunIds copied into worker state |
| Director main -> configured child | Registered snapshot of named subagents; existing story context and rendered main-round digest |
| Director main -> inline child | One exact run-local inline definition after existing budget/prompt validation; never saved to presets |
| Loop / Single direct start | No inter-agent transition; existing Runtime execution remains; Single launched from Spec uses the admitted graph identity |

Spec identity includes stage index, node index and node name. Duplicate names in separate stages are legal in the
old code and remain legal; model-requested ambiguous review targets still fail at the old resolver.
Director inline IDs include the existing dispatch handle. Child runtime IDs link to the parent orchestration run;
run/step/effect IDs remain fixed once allocated. handoffId is the existing effectId, not a parallel ID allocator.
Handoff cycles are bounded by the run's existing maxSteps limit. Native unconsumed handoff receipts resume once
with their original ID; legacy continuations remain non-durable and fail closed as in Phase 3.

## Context and preset protection

Legacy routes allow task_only plus explicit payload input references, not implicit raw scratch transfer.
The adapter resolves those references to copied current-run inputs for the existing prompt/compiler path.
Shared story/world-info/notes still enter through existing host services and guarded Memory OS ports.
Handoff receipts do not duplicate chat, model/tool results or Memory OS content. Native include_scratch remains
available only when the source definition's context policy allows it. Unknown policies/targets/edges reject.
Forged handoffId/fromAgentId/createdAt fields are discarded; Runtime assigns those fields.

Agenda worker state contains only the selected run results. Spec copies its prior output maps before dispatch.
Preset snapshots also prevent skill/default normalization from adding fields to the caller's saved configuration;
an integration fixture reproduced that mutation and now verifies the source remains identical.
Runtime event callbacks stay in execution options, not serializable Agenda state.
Handoff completion metadata is projected into existing traces without prompt/task/payload bodies. UI state ownership
is unchanged pending Phase 5. Existing private tools, provider IDs, notes, skills, streaming and old parallel barriers remain.

## Automated evidence

- Expanded regression: 213 suites / 2447 tests passed across agent-runtime, orchestrator, memory-graph, floor-state,
  generate-task and luker-dispatch (`.git/phase4-final-selected.log`).
- After final Single/Director identity plumbing: 117 suites / 1327 tests passed in agent-runtime + orchestrator
  (`.git/phase4-final-routing.log`). Includes Single graph identity and Director duplicate-ID lookup compatibility.
- Headless Edge imports actual production ES modules: typed handoff receipt `browser-route/effect/2` precedes the
  child model call; existing native tools, full Single, cancellation and assembled-context rejection still pass;
  zero page errors (`.git/phase4-browser.log`).
- ESLint passed for all changed runtime modules. Spec is checked with only its inherited no-extra-boolean-cast
  exception disabled, already established on the Phase 3 baseline; no new lint exception was introduced.
- Regression cases cover illegal targets/edges, context-policy denial, input filtering, preset immutability,
  cancel at both handoff start and completion, cyclic handoff budgets, receipt resume, real review replay,
  Agenda planner/worker/finalizer and Director named/inline routes, repeated Spec node names and string nodes.

Reproduction: from tests/, use the established Jest VM-modules command with the named suites above; from the
repository root, run `node tests/frontend/agent-runtime.smoke.mjs`. No paid model calls or live user chats were used.
Full repository tests were not rerun in this phase: Phase 3 documents 18 pre-existing failures reproduced on its
baseline and unavailable MySQL/PostgreSQL integration coverage. No full-repository green claim is made.
Android, real providers and the owner's actual play are untested boundaries, not mandatory manual test gates.

## Scope and next gate

Phase-sized scope override: at most 22 files / 1000 changed lines; no package/lock, user-data or generated-asset changes.
Rollback is this phase's standalone commit revert. No schema migration, release, push, merge or version bump.
Next: Phase 5, make UI a projection of Runtime events without taking execution ownership. Continue autonomous
unit/offline browser verification; durable policy reconstruction/reconciliation remains Phase 6.
