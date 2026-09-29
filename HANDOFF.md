# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Stage: **Phase 9 — final regression / CI / integration in progress**
- Baseline: **Implementation Baseline v1.0 unchanged**
- Branch: `refactor/native-frontend-runtime-v3`
- Pushed implementation HEAD: `06b8f4e5ab0d7f03eb4d42cd6b4a44df0467d1eb`
- Phase 9 Start: `7ac92cca563942017ab06da47800e6d0d2a5b722`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- PR: **#98**
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`

## Done

v1/v2 compiler/renderer, manifest selectors, Studio migration/Preview fallback,
Message template and pinned-UI Opening paths removed. Reused bounded validators
moved to shared data-only modules; pinned Message Blocks use v3 Bridge schemas.
Host Scene and Shared controls do not gain Package/owner authority. Runtime Skills
and plugins preserved; bundled authoring now uses v3 Source. Adjacent fixtures,
guards and workflows updated. System Git timestamp-cache Source commit bug fixed.

Focused tests/20 guards/lint/webpack passed. Heavy Edge 6 + Studio Edge 2 passed,
providerCalls=0; screenshots inspected. Shell desktop/mobile and Health/Shared
have passed in current broader E2E. Source Graph option-loading race, safe error copy and separate Generation
Projection E2E assertions are fixed and pushed. Async refresh rejection is isolated
from committed lifecycle events, with no-replay tests. Working tree is clean.
Full validation history including failures/interrupted runs is in the Record.

## Next

1. Check actual refs/status and running processes before starting more tests.
2. Local full batch completed: 801 suites pass, 2 Bash-environment failures; those
   2 suites/22 tests pass under Git Bash. Final affected 3 suites/20 tests pass.
   All 10 rewritten Shell E2E cases passed across focused retries; generation
   P4 Edge 4 also passed. Do not rerun successful checks without a new reason.
3. Await/fix PR #98 exact 06b8f4e5 runs: PR Checks 36567427028 (full/storage),
   Native v3 36567426990 / 36567420904, Model Prompt 36567426994. Previous
   a066fdd PR full CI passed 810/10175; Native v3 passed 246/2807 + browser.
   Model Prompt failed only a now-fixed obsolete streaming selector.
4. Update same Record with exact heads/results. After all gates, integrate main,
   verify merged main, remove task branch and live HANDOFF. No Package upgrade.

## Preserve

No architecture/Gap Review redo, reference read/update or main reset. Source only,
IR derived-readonly, one production compiler/renderer. Typed targets/revisions,
Lifecycle intent, Epoch revocation, Host component state and Session authority.
Streaming is not committed Timeline; HTML is not Prose. No raw DB/durable KV,
no automatic write replay, no local route/media/boundary/VM authority epoch.
Shared participant Host controls stay scoped; no owner Bridge substitution.

## Resume prompt

Continue local Atria task refactor/native-frontend-runtime-v3 Phase 9. Read actual
Git state, AGENTS.md, docs:README.md, this HANDOFF, Plan and same Record. Continue
from pushed 06b8f4e5; do not redo cleanup or
reset to main. Complete final local tests and PR #98 CI, fix ordinary failures,
then record, merge/verify main and clean task branch/live HANDOFF. Preserve all
frozen authority boundaries and evidence limits. No reference or Package work.
