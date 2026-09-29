# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Stage: **Phase 9 — final regression / CI / integration in progress**
- Baseline: **Implementation Baseline v1.0 unchanged**
- Branch: `refactor/native-frontend-runtime-v3`
- Pushed implementation HEAD: `a066fdd1303ec722160a8f975bc77ae04a345897`
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
have passed in current broader E2E. Source Graph option-loading race repaired in
two E2E files after a066fdd; not yet committed. Final full tests and CI pending.
Full validation history including failures/interrupted runs is in the Record.

## Next

1. Check actual refs/status and running processes before starting more tests.
2. Finish local full Jest (`atria-phase9-full-final` temp log/JSON) and shell E2E
   (`atria-phase9-e2e3` log); complete corrected Studio E2E, commit/push fixes.
3. Check PR #98 required runs: Atria PR Checks (full unit/MySQL/PostgreSQL), Native
   Frontend v3 (associated/Core and Heavy+Studio Chromium), Model Prompt Runtime.
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
from pushed a066fdd and any documented local E2E fixes; do not redo cleanup or
reset to main. Complete final local tests and PR #98 CI, fix ordinary failures,
then record, merge/verify main and clean task branch/live HANDOFF. Preserve all
frozen authority boundaries and evidence limits. No reference or Package work.
