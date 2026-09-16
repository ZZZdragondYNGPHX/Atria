# Agent Runtime v2 — Phase 8: Legacy Removal

Date: 2026-09-17. Phase base: `15b4e82ea6a6d64fa8a9d4cc2f5aefd7e5106c47`.
Fetched integration base: `custom-release@cfb95953071d6459c911e3e6a3bed0144e86ba72`.
Feature branch: `feat/agent-runtime-v2`. Owner explicitly authorized merge and push of both branches.

## Removal and compatibility

The CURRENT_MAP Phase 8 table records the caller audit. main.js no longer carries the deleted legacy trace
module's seven placeholder helpers. Removed their no-op calls, unused reuse-trace stage normalization/data,
and the always-null simulation fallback. Kept simulation's actual run.runtimeTrace, cancellation signals,
result events, snapshot reuse/injection and run-panel behavior. The preview uses the same String conversion
as before; no new truncation is introduced. Three unused custom-tool imports are removed, while their active
implementations and Iter Studio callers are retained. main.js lint diagnostics drop from five to zero.

The remaining mode generators are live compatibility policies admitted through Runtime, not uncalled old
execution loops. Worker/host context assembly still feeds the shared compiler and preserves user presets.
Director dynamic dispatch/await and the historical result popup edit action are also live. No additional
uncalled execution loop/context builder was established, so those paths are deliberately retained.
Memory OS remains the sole long-term memory; src/luker-dispatch and all preset/storage formats are unchanged.

## Verification

- Whole-repository removed-symbol searches, production public/src searches, retained route searches and
  Phase 1–7 Git history inspected. Removed trace identifiers have no production references; one test comment
  still mentions the old event helper, with no active call.
- Expanded offline regression: **216 suites / 2492 tests passed**. Includes preset migration/persistence,
  factory presets, custom tools, simulation entry/export, cache invalidation, all modes, Runtime recovery,
  parallel branches, Memory OS, floor state, shared generation and luker-dispatch provider tests.
- Four Edge headless smokes passed with zero page errors: core, mobile panel/projection, recovery and parallel.
  Real IndexedDB/page destruction verifies receipt recovery, cancellation, child retention and one tool write.
- ESLint comparison against phase base: main.js **5 -> 0** diagnostics; no new diagnostics.
- git diff --check passed. No dependency changes, generated artifacts or user-data edits.
- Evidence logs/backups remain ignored in .git/phase8-*; existing tests adequately cover these deletions,
  so no implementation-mirroring tests were added.

## Integration and remaining boundaries

This phase is committed independently before integration. custom-release can fast-forward from its fetched
base, preserving every earlier phase commit. Push both branches and verify remote SHAs after the commit;
actual live Git refs are the authority for final push state. No tag, release or Android artifact is requested.
The five-file code/document scope is an explicitly bounded staged-refactor completion of Phase 8.

No real-model session, Android device or human play acceptance was performed. The four smokes are offline
browser evidence, not full live-host play. Full repository tests were not rerun; the 18 unrelated baseline
failures documented in Phase 3 must not be described as fixed. Lost legacy generator continuations still
fail closed; no automatic whole-legacy-mode refresh continuation, durable UI journal or cross-device runner
is claimed. Native Runtime recovery and fixed-batch parallel composition retain the Phase 6/7 contracts.
Phases 0–8 are complete within these recorded compatibility boundaries; real play can be checked later.
