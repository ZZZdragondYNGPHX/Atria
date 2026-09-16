# Phase 5: Agenda dynamic policy

Agenda's production coordinator now uses the compiled Plan and a parent Runtime policy. The old
typed todo_ops/dispatches/finalize authoring vocabulary is adapted without changing saved prompts.
Todos, dispatch descriptors, selected prior runs, round/run budgets, result IDs and finalization state
are serializable. Planner and text workers use native Runtime requests; parallel work uses the shared
ParallelExecutor. Tool-enabled workers reuse the native serial protocol and existing host preparation.
No planner tool port exposes reply operations. Worker tools are filtered by code capabilities.

Task mutation budget is separate from the old total-run limit; the old limit still counts worker
invocations. Unresolved tasks remain visible after finalization. A finalizer cannot turn unresolved
work into completed: such guidance is partial and cannot become a completed snapshot cache entry.
Conversation traces containing tool bodies are excluded from parent execution receipts.

Executed Runtime/orchestrator checks: **123 suites / 1392 tests passed**. Existing tool/Notes,
budget, selected-input and preset-preservation tests pass. Route assertions now prove parent-owned
delegate identities. Old coordinator remains available through the explicit protocol selector.
Browser/recovery fault validation remains in the final feature gate. Lost source-guarded transient
tool feedback still fails safely; Android, live models and manual RP are not claimed.
