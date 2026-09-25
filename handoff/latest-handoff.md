# Latest handoff — Native product UX repair completed

Updated: 2026-09-25 (Asia/Shanghai).

## Current task

Repository: `ZZZdragondYNGPHX/Atria`.
Working branch: `fix/native-product-ux-audit`.
Pushed HEAD: `652bb6386f61e9c5fb983157c8852b1680736eb2`.
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

Group 8 NUX-041/042 is implemented, independently committed and pushed.
Detailed implementation/validation: [Group 8](native-product-ux-group-8.md).
Exact Work Plugin inventory and Regex/Search Tools Global Plugin ownership are
complete. Retained Agents, Native Experience and shared helpers now have core
owners; obsolete extension installation, profiles, source and routes are retired.
354 related suites passed 3532 tests (72 optional DB skips). Six cross-domain Edge
cases, strengthened retired-route/capability checks and actual WebLLM catalog loading
passed. Full lint, frontend cache build and six residual scripts passed. See the
Group 8 record for the exploratory full-repository run's optional DB and unchanged
Windows-sensitive failures; that run was not all green. No real GPU inference claim.

## Group 9 / completion

NUX-043 `9e66b5c81` completes Native Global Search domain coverage, exact routing,
partial-source reporting and retry. NUX-044 `652bb6386` completes the audited product
localization, literal-name preservation and automated locale regression guard.

All Groups 1–9 and all 44 issues are complete; active backlog is empty.
Final evidence: [Group 9 and closure](native-product-ux-group-9.md).
355 related suites / 3541 tests passed, with 72 optional external-DB skips.
Native backup/restore/migration integrity passed four suites / 40 tests, two skips.
27 selected Edge scenarios have passing final evidence, including focused reruns
for corrected test assertions/sequencing. Full lint, frontend compilation, locale
guard and six Native authority guards passed. Existing E2E lint warnings are noted.

## Next

No active implementation remains from this backlog. The user-requested task branch
is retained and pushed; main was not merged or changed. Do not restart Group 1 or
use obsolete remote rules to replace the user's current workspace rules.
The unavailable external/platform checks and earlier exploratory whole-repository
failures are documented honestly in Group 8 and the final closure record.

## Local work

Pre-existing AGENTS.md/FORK_MAINTENANCE.md edits and Phase 6–8 test outputs remain
untouched and excluded from commits. Current task has local untracked
`tests/.native-ux-playwright.config.js` selecting installed Edge and
`tests/test-results-native-ux-g1*` and `tests/test-results-native-ux-g2*` / `tests/test-results-native-ux-g3*` / `tests/test-results-native-ux-g4*` / `tests/test-results-native-ux-g5*` / `tests/test-results-native-ux-g6*` / `tests/test-results-native-ux-g7*` / `tests/test-results-native-ux-g8*` outputs, plus
`tests/.e2e-scratch/native-ux-g6-build` / `native-ux-g7-build` / `native-ux-g8-build*` frontend caches. Bundled Chromium installation stalled;
Edge was used for actual browser validation. Cleanup of task-only output directories and temporary audit scripts was rejected
by automatic approval review (blocked by policy). They remain local and uncommitted;
no workaround deletion was attempted. Do not touch prior-task artifacts.

Frontend redesign Phases 1–8 remain integrated on main. Its design authority and
historical acceptance are under `planning/atria-product-frontend-redesign/`.

Final Group 9 logs/screenshots, the temporary Edge configuration and localization
audit scripts/data are also local-only. No generated artifacts or rule edits were
included in the final product commit.
