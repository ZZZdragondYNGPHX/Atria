# Phase 9 — Caller audit and acceptance

Date: 2026-09-17. Branch: `feat/orchestration-engine-v2`. Baseline: `custom-release@5cc185d9b9518efa5c1b06144bcb82584a52c5fd`. No merge, push, release/version change, provider replacement or Memory OS migration.

## Default execution and retained callers

| Surface | Default Engine path | Retained compatibility caller |
| --- | --- | --- |
| Single / Spec | immutable compiler → static graph controller → Runtime fan-out/join → native worker/review | explicit `payload.agentRuntimeV2 === false`; exported node/stage helpers and their direct tests |
| Loop | one native Runtime policy with serial round/tool cursor | explicit `payload.agentRuntimeV2 === false` |
| Agenda | durable task/result state, typed legacy proposal adaptation, bounded Runtime delegates and finalizer | explicit `payload.agentRuntimeV2 === false`; exported planner/worker APIs without engine options |
| Director owner | native policy, tool capability checks, explicit reply owner and submit effect | explicit `eventData.agentRuntimeV2 === false` |
| Director workers | native child policies, shared Runtime ParallelExecutor, durable handle descriptions/results | explicit `settings.agentRuntimeV2 === false` |

Production symbol searches covered `runLegacyWorkflow`, `runRoutedLegacyWorkflow`, `runLegacyParallel`, all mode wrappers, and direct exported node callers. These remaining compatibility paths have actual callers; none satisfies the plan's no-active-callers deletion predicate. They are retained deliberately, not mislabeled dead code. Prompt/context assemblers and single admitted transport generators are shared host adapters, not a second default scheduler.

Single remains a compiler template, Handoff retains Runtime control-transfer semantics, and Engine delegation never synthesizes a handoff. The generic Engine kernel supports static/dynamic scheduling and all six arbitration policies. Advanced host arbitration goes through the existing request chain with no executable tools. Legacy settings are compiled read-only and cache identity is versioned. Memory OS remains the only shared long-term memory.

## Recovery and final hardening

- All four mode adapters expose explicit checkpoint identity/resume injection. The host must supply the matching scene/draft; there is no automatic replay into a new chat or draft.
- Four-mode serialized final-receipt recovery is tested without model or tool replay. Director unacknowledged submit fails closed. Spec/Agenda refuse pending child replay without durable child checkpoints.
- A recovery test exposed a Loop dependency on discarded panel slots. Slots are now reconstructed as disposable views; execution is still owned exclusively by Runtime policy state.
- Director failed/unknown dispatch handles are included in the durable dispatcher snapshot. Completed-handle restore does not call a model again.
- Terminal Director checkpoints never reactivate descendants. Unknown submit outcomes are checked before any delegate restoration.
- Runtime's existing ParallelExecutor now bounds concurrent dynamic groups in the same executor, including queued cancellation. No Engine promise pool was introduced.
- Late Judge decisions after cancellation cannot publish output. Judge choices and synthesis references must belong to the current input set.

## Executed verification

- Expanded Runtime/orchestrator/Memory OS/floor-state/generation/dispatch selection: **219 suites / 2525 tests passed**.
- After recovery hardening: **124 Runtime/orchestrator suites / 1409 tests passed**.
- Final recovery/kernel/Director tool selection, including the two added fail-closed child-storage cases: **3 suites / 77 tests passed**.
- After terminal-parent recovery hardening, recovery/kernel/Director selection: **23 suites / 261 tests passed**.
- Four existing Runtime Edge smokes passed: core/model/tools, mobile projection/stop/export, IndexedDB recovery/reconciliation, parallel child retention. Zero page errors.
- New Engine smoke passed on **Edge and Chromium**: real page destruction and IndexedDB resume; completed branch invoked once and interrupted model branch twice; result IDs/output validation; privacy-safe replay; 390px mobile and 1440px desktop overflow checks. Zero page errors.
- Changed production JavaScript ESLint passed; one redundant Boolean call in the touched Spec function was removed. `git diff --check` passed.
- Plugin import guard reports **12 violations**, reproduced unchanged on the baseline. No new forbidden import is introduced.
- Full repository run completed with 8 GB Node heap: **521 suites passed, 52 failed, 1 skipped; 7161 tests passed, 597 failed, 4 skipped (7762 total)**. This is not an all-green repository result. The initial default-heap attempt exhausted Node heap and was replaced by this completed run.

### Full-repository failure comparison

An isolated detached worktree at the exact `5cc185d9b` baseline was used for the failing suites. Three baseline selections reproduced **51 failing suites / 596 failing assertions**. Failures include absent MySQL/PostgreSQL services (`127.0.0.1:53306` / `55432`), existing storage checks, websocket/session/sync checks and character-preset module fixtures. The remaining failure was the unchanged `git-client.test.js` same-second system-Git edit assertion: all eight tests passed both on the baseline and in a separate feature-branch rerun. Its whole-run failure is recorded as intermittent, not silently treated as a pass.

Thus every full-run failing suite was compared with the baseline; no newly failing Engine suite was found. The baseline also reproduced the same 12 plugin-import violations. No unrelated storage/Git/test-harness changes were made to obtain a green report. Evidence logs are local `.git/engine-*`; the final commit contains source/tests/docs only.

## Coverage boundaries

No Android device/WebView, real provider/model, or manual RP session was used. Browser tests run production modules in an isolated offline harness, not a complete authenticated live-host play session. Exact provider token use and model output quality remain unmeasured. These are coverage gaps, not user approval requirements.

Source-guarded Memory OS tool bodies intentionally remain transient. A restart requiring lost tool feedback fails closed instead of persisting a second memory copy or replaying a write. Unknown side-effect outcomes require reconciliation, as in Runtime v2. Durable execution does not imply a durable full UI journal, cross-device runner, or automatic draft resurrection. No claim is made that unrelated full-repository failures are fixed.

All planned implementation phases are represented by independent commits. The feature remains on its feature branch for the owner's later integration decision.
