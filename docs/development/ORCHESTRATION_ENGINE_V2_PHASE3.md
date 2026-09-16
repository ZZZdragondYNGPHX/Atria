# Phase 3: Single / Spec compiler and production graph

Existing Spec entry now compiles the effective, sanitized preset into slot-identified graph nodes.
Serial dependencies and parallel stages use the parent Engine policy and Runtime ParallelExecutor;
workers use the existing native Single tool protocol. A review performs one native model request,
then returns an explicit approve/rerun decision to the parent. Replay targets, retry count, feedback
and latest outputs are checkpoint state rather than a live review coordinator. Cache first-chunk
barriers, tools, Notes, world info, skills, old output precedence and repeated-name slot identity remain.

The explicit `agentRuntimeV2:false` compatibility selector still uses the old Spec coordinator.
No legacy coordinator was deleted. Existing user presets and Single fields are read-only. Execution
configuration identity is versioned to invalidate old cached guidance after the Engine switch.

Executed: expanded Runtime/orchestrator regression **122 suites / 1388 tests passed**; subsequent
compiler/Runtime/Spec checks **15 suites / 144 tests passed**. Golden tests compare exact requests,
tool histories, result ordering, structured errors, output precedence and cancellation with the old
Single path. Updated route assertions require delegate branches, not false handoff ownership changes.
Review replay verifies repaired output and approved feedback reach final guidance.

Remaining gate: production browser/recovery checks and final whole-feature audit. Tool result content
continues to use Runtime's transient source-guarded receipts: losing unreconstructable tool feedback
fails closed. This commit does not claim general tool-feedback rehydration, automatic page-refresh
restart or migration of Loop/Agenda/Director. Web/Android share this frontend path; no device/model run.
