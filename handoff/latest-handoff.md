# Latest handoff — Native product UX repair in progress

Updated: 2026-09-25 (Asia/Shanghai).

## Current task

Repository: `ZZZdragondYNGPHX/Atria`.
Working branch: `fix/native-product-ux-audit`.
Pushed HEAD: `c863c0536`.
Main remains `ad15c1e0c3e15e625ba163e284a300c00811f10d`.

Use the existing workspace AGENTS.md and FORK_MAINTENANCE.md. Remote main copies
are obsolete; the user explicitly confirmed this. Atria is independent, and
SillyTavern/Luker are reference sources only. Preserve the user's uncommitted rule
changes. Current Atria UI/tokens/components outrank every frontend Skill.

Follow `fix/native-product-ux-audit:docs/fix/native-product-ux-gaps.md` in order.
Do not replan. For each issue implement/test/remove from active backlog and make
one atomic commit. After each group regress/push and continue without asking.
Stop only for required human/device evidence, Secrets/permissions, or a major
architecture conflict. Do not merge into main or delete this active branch.

## Completed

Group 1 is implemented, tested and pushed:

- NUX-001: `426017c8e`, canonical Native filesystem directories.
- NUX-002: `fa447c2e8`, Native-complete backup/restore/migration, selective SQL
  dump filtering, blob closure checks, Windows rollback, async-local read-only
  bypass and ProjectStore protection.

Detailed implementation/validation: [Group 1](native-product-ux-group-1.md).
23 offline suites passed (203 tests; four database cases skipped). One Edge E2E
passed with 320px screenshot inspection. Changed-file lint and diff check passed.
MySQL/Postgres services at the test ports are unavailable; no live DB claim.
No physical Android, Android build or Docker validation was performed.

Group 2 NUX-003 through NUX-011 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 2](native-product-ux-group-2.md).
22 suites / 214 tests and 24 real Edge browser scenarios passed. Provider adapters,
exact Secrets, model discovery, safe lifecycle/archive, canonical Library Generation
Profiles, fallback roles, Build context picker, setup readiness and Product errors
are complete. No live paid-provider calls or physical-device validation claimed.

## Next

Continue Group 3 with NUX-012, per-agent/per-stage Native Orchestrator routing.
NUX-012 and all later issues remain active. Follow the existing backlog without
replanning; retain capabilities under Native owners before deleting legacy code.

## Local work

Pre-existing AGENTS.md/FORK_MAINTENANCE.md edits and Phase 6–8 test outputs remain
untouched and excluded from commits. Current task has local untracked
`tests/.native-ux-playwright.config.js` selecting installed Edge and
`tests/test-results-native-ux-g1*` and `tests/test-results-native-ux-g2*` outputs. Bundled Chromium installation stalled;
Edge was used for actual browser validation. Remove task-only temporary outputs
when no longer needed; do not touch prior-task artifacts.

Frontend redesign Phases 1–8 remain integrated on main. Its design authority and
historical acceptance are under `planning/atria-product-frontend-redesign/`.
