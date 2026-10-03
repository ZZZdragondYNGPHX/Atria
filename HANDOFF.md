# HANDOFF

## Active task and user authorization

- Task: refactor/original-occult-western-fantasy-long-lived-world; Primary: Package.
- Phase 7 implementation complete candidate; full browser acceptance still running.
- 2026-10-04 user: after Phase 7 is complete and pushed, continue directly through
  Phase 8 and release. Do not stop at the former Phase 7 boundary.
- Later user request: reduce turn counts to avoid hours per verification. Plan
  v1.3 now uses 250/500/1,000 real content-turn checkpoints with at least 200 years,
  retaining all coverage/invariants and seed/restore/UI evidence. Never claim 10k.

## Actual Git state

- Package branch: refactor/original-occult-western-fantasy-long-lived-world.
- Pushed Package HEAD: 6045e9982a6920f04ac2f82a4d7e075d71ca2357; local Phase 7
  frontend/compiler/validation/docs changes are not committed yet. Preserve root
  untracked dist, node_modules, tests.
- Core main: f0046b05ebddc7f318e9ce18a30176b5434af23d (integrated/pushed player
  Chronicle/long-life Host boundaries); feat/player-chronicle-bridge deleted.
- New Core fix/history-advisory-checkpoint: fbe6c6dc779ae100c9f2c0ca6ce7b939b09dd6a3,
  pushed. Retire unreferenced display-only advice with existing exact tombstones;
  executable/scheduled/active/pinned/referenced Tasks remain protected.
- Authority CI 37140970503 is pending on that exact Core fix. Local History/Save
  Fs/SQLite + Lifecycle/Task tests passed; no local MySQL/PostgreSQL services.
- Package remains development 2.0.0-phase7; no 2.0.0 release yet.
- Never merge main into Package/docs. No reference authorization.

## Context routing and next action

1. Check actual Git status/refs; read this HANDOFF.
2. Plan index -> implementation-staging and verification; player-facing-experience
   for unfinished Phase 7 checks. User amendment supersedes old stop/10k prompts.
3. Same Record: records/package/original-occult-western-fantasy-game-long-lived-world.md.
4. Finish actual full frontend-only browser test, currently checking identity,
   reconstruction, unknown-write retry and checkpoint Reply Retry. Fix routine
   failures, inspect final screenshots. Focused --phase7-ui-only is diagnostic.
5. Commit/push Phase 7, integrate tested Core support and verify main; update the
   same Record and HANDOFF. Then execute amended Phase 8 integration/stress,
   repair invariants, retain releases/2.0.0.atria, final Package integration,
   exact retained-archive validation, task branch cleanup and delete HANDOFF.

## Preserved evidence and current diagnostics

Core f0046 main CI Authority 37138325950, Frontend 37138325973 and Model Prompt
37138325959 passed (four hosted adapters; frontend suite/browser evidence).
Default Package runtime regression, historical v1 fixture, v1 network/convergence
checks and frontend model passed locally. Full P7 browser has not yet passed:
latest run adds coherent refresh boundary and tests actual refusal reasons.
Pre-fix failure: identity submission used stale revision after partial refresh.
The controller now keeps writes disabled through the complete read and checks
final revision before release; known refusals preserve drafts, no auto resubmit.

Do not rerun unchanged Phase 6 stress: its focused 100-content-turn/50-year run
passed in 427252 ms. Phase 6 is not Gate B/C. No Android/physical touch/hosted model
or old-version save migration claim. Preserve budgets, facts, marks, old saves,
authority and invocation reconciliation. Historical releases/1.0.0.atria SHA256:
e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.
