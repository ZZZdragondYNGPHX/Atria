# Latest handoff — Native product UX repair in progress

Updated: 2026-09-25 (Asia/Shanghai).

## Current task

Repository: `ZZZdragondYNGPHX/Atria`.
Working branch: `fix/native-product-ux-audit`.
Pushed HEAD: `a1125deb9`.
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

Group 3 NUX-012 through NUX-015 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 3](native-product-ux-group-3.md).
Per-Agent and per-task Memory exact routes, Native immutable Retrieval resources,
provider/Secret ownership and Native preset-name removal are complete. Final
regression: 163 suites / 1925 cases, 10 Native suites / 166 cases, six adjacent
suites / 32 cases and seven real Edge scenarios passed. No live cloud/GPU inference.

Group 4 NUX-016 through NUX-018 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 4](native-product-ux-group-4.md).
Applicability, delivery and target selectors share typed Native contracts; state
activation and all/any predicates execute on Native snapshots. Unsupported event
triggers and retrieval hints now reject explicitly. Studio validates typed fields
before Review. Regression covered 86 suites / 668 passed / 66 skipped; two stale
Group 3 fixtures were fixed and their 27 cases passed. Real Edge 390px passed.

Group 5 NUX-019 through NUX-026 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 5](native-product-ux-group-5.md).
Immutable Library revision authoring, semantic Knowledge and World composition,
Binding management, history/fork, actionable references and reviewed Studio writes,
Session Knowledge promotion and direct Native Knowledge selection are complete.
Runtime lifecycle now uses `atri_knowledge_runtime` Session state; the old Knowledge
entry projection is gone, with only a final prompt text-channel boundary retained.
Regression: 96 Native/Shell suites, 707 passing cases / 68 optional DB skips, nine
World Info suites / 70 cases, two orchestration suites / nine cases and eight real
Edge scenarios passed. Two stale UI assertions were aligned and rerun successfully.

Group 6 NUX-027 through NUX-032 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 6](native-product-ux-group-6.md).
Native Skill scope management, semantic declarations, revision-protected project
deletion, complete reviewed asset lifecycle, file-aware Source editing and typed
Prompt conditions/parameters/derive controls are complete. Group regression passed
125 suites / 1210 cases (68 optional DB skips), all 11 real Edge Studio/authoring
scenarios, changed-file ESLint, diff checks and frontend cache compilation.

Group 7 NUX-033 through NUX-040 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 7](native-product-ux-group-7.md).
One exact Resource Bundle mechanism, immutable Package originals, version-specific
start, update consent, Save dependency recovery, Session naming, readable history
and actionable reference resolution are complete. Regression ran 133 suites with
1246 passing cases/72 skips and one stale Package navigation assertion; correcting
it passed all seven cases in three adjacent suites. Full lint, frontend compilation
and nine real Edge 390px scenarios passed. No live external database claim.

## Next

Continue Group 8 NUX-041, then NUX-042, followed by Group 9 NUX-043/044.
Follow the existing backlog without replanning. Work Plugins must retain exact
PackageVersion ownership and installation consent; Global Plugins are only Regex
and Search Tools. Agents remains the sole home of Orchestrator/Memory. Before
physical cleanup, move retained Agents, Studio UI editor, browser WebLLM retrieval
and shared tool runtime dependencies out of the extension tree. Preserve Native
state/configuration authorities and remove obsolete branches rather than retain
legacy authority for user-data migration.

## Local work

Pre-existing AGENTS.md/FORK_MAINTENANCE.md edits and Phase 6–8 test outputs remain
untouched and excluded from commits. Current task has local untracked
`tests/.native-ux-playwright.config.js` selecting installed Edge and
`tests/test-results-native-ux-g1*` and `tests/test-results-native-ux-g2*` / `tests/test-results-native-ux-g3*` / `tests/test-results-native-ux-g4*` / `tests/test-results-native-ux-g5*` / `tests/test-results-native-ux-g6*` / `tests/test-results-native-ux-g7*` outputs, plus
`tests/.e2e-scratch/native-ux-g6-build` / `native-ux-g7-build` frontend caches. Bundled Chromium installation stalled;
Edge was used for actual browser validation. Remove task-only temporary outputs
when no longer needed; do not touch prior-task artifacts.

Frontend redesign Phases 1–8 remain integrated on main. Its design authority and
historical acceptance are under `planning/atria-product-frontend-redesign/`.
