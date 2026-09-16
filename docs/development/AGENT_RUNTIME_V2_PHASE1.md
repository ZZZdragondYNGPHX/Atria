# Phase 1 — headless kernel

Parent: Phase 0 commit `137610247`, original work baseline `cb68da1f4` / integration baseline `cfb959530`.

Implemented in `public/scripts/lib/agent-runtime/` with no production imports.
Static registry, pure state transitions, isolated event subscribers, serial effect driver, structured handoffs,
stable run/step/effect/tool/handoff IDs, step budget, cancellation and late-result guards are executable.
Injected FakeModel/FakeTool/FakeMemory exercise the same kernel used by future host adapters.
The minimal ContextCompiler centralizes layer order, source labels, duplicate removal and injected token budget.
No provider, Memory OS schema, saved preset, app version or dependency declaration changed.

Checkpoint receipts distinguish effect completion from consumption. A shared in-memory store rejects old versions.
Resume re-reads memory and validates freshness; checkpoint content contains memory references, not recalled text.
An uncertain tool write fails with a reconciliation-required error rather than replaying a possibly committed side effect.
This is deliberately not a claim of durable process-crash recovery. Persistent store/reconciliation remains Phase 6.
Cancellation settles even if a port ignores AbortSignal; a late success/failure cannot release another step.

Verification (2026-09-16):

- Focused kernel/race tests: 22 passed.
- Kernel + existing orchestrator / memory-graph / floor-state selection: 160 suites, 1972 tests passed.
- Repository ESLint on all kernel files passed; `git diff --check` passed.
- No production UI changes, no browser/device/model validation claimed.
- Dependencies were installed locally to run checks; generated dependencies and test logs are not committed.

Known boundaries: serial decisions only; no real model/tool/memory adapters yet; no parallel primitive;
no durable checkpoint; no automatic retry of uncertain writes. Actual tokenizer is injected by a future host adapter.
Step limits prevent unbounded continue/handoff loops; protocol retry policy remains in existing transport until Phase 3.

Next phase: introduce a bounded Legacy Adapter for the simplest Single/Spec path with observable-output fixtures.
Do not wrap the entire legacy mode loop in an opaque model effect or overwrite the user's presets.
The owner authorizes autonomous offline/browser checks and phase-by-phase continuation; unavailable Android/real-model
checks are coverage gaps for later play testing, not a manual approval prerequisite.
