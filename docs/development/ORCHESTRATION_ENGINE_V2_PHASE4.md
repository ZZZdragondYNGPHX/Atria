# Phase 4: Loop iterative policy

Loop now uses a single parent AgentRuntime policy with a compiled Loop Plan. It does not create a
Planner or task graph. Policy state owns round/deadline/streak budgets, assistant turns, queued calls,
result identities and guidance output. Runtime continues to own model/tool admission, persistence,
cancellation and source guards. Existing Notes, skills, tool registry, world info and dispatch are reused.
Disabled/unknown tools produce structured feedback without executing; reply tools cannot be admitted.
Finalization and all three budget exhaustion reasons retain their distinct legacy output statuses.

The old generator remains behind explicit `agentRuntimeV2:false`; removal awaits final caller audit.
Tool message bodies remain transient and source guarded, not serialized Memory OS corpus. Explicit
resume validates Plan identity and preserves durable controller state; unavailable transient feedback
fails closed rather than replaying tool writes. Automatic refresh restart is not introduced.

Executed expanded regression: **219 suites / 2514 tests passed** across agent-runtime, orchestrator,
memory-graph, floor-state, generate-task and luker-dispatch. The prior Runtime Phase 8 baseline was
216 suites / 2492 tests. New tests account for the additional suites; no baseline failure was hidden.
Browser, actual Android and real-model validation are not claimed by this phase.
