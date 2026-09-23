# P6 — Library & Studio Authoring validation

Date: 2026-09-23. Work branch: `refactor/atria-model-prompt-settings`.
P5 baseline: `0cb56b9a0d37789025fb8069d08f6f43ead2413d`.
P6 commit: `2351be51e8c8cbdadf0966104ec607018e93de6e`. Main remains `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.

## Delivered

Library exposes Prompt Programs, Prompt Modules and Generation Profiles through
an authenticated, exact read-through catalog. Origin, revision, Derived From,
provenance, Used By, new immutable revisions and Fork/Derive are available.
Package originals are read-only. Package/Project forks copy non-Library dependency
closures; Library dependencies remain pinned, never latest. Multiple revisions of
one copied module retain one new identity and module-ID tie ordering is preserved.

Build remains the primary authoring domain. Existing A7 Studio gains Prompt
Authoring and Runtime Design: Simple/Advanced JSON editors, ordered stage/module
tree, exact module pickers, conditions/parameters/provenance inspection, author
requirements/recommendations and committed-Project compile preview. New/edited
Project resources and runtime metadata are staged through A1 `project.save`
operations, inspect/review and human Apply, not direct Library or Project mutation.
Existing A8 AI/Review/Commit/Takeover authority is retained. Failed edits remain;
successful revision submission cannot double-submit. Runtime Design reloads saved
exact recommendations and preserves optional capability requirements.

Runtime route pickers now expose scoped Project/Package resources as well as
Library revisions. Preview-only exact Prompt/Generation overrides go through the
P4 host/P2 resolver/P3 compiler, pinned owner/revision and existing budgets, without
Secret resolution, send or persistence. Overrides are rejected on execution.

Package composition resolves the existing exact closure then flattens derived
Programs, freezes typed module configuration and removes parent/derive dependency
at runtime. Logical module IDs preserve replacement aliases and ordering. Ordinary
Program exact refs remain unchanged. Ancestor templates may defer required bindings
to children during structural freezing; request compilation remains strict.
A real build/install test compiles an installed derivative in a separate empty
Library after the author Library advances. No second store or compatibility fallback.

Resource Graph now projects installed Package contents from PackageInstaller and
honors scoped reference queries. This fixes same-ID/revision Package resources
incorrectly displaying Library Used By results. The graph remains read-only.

## Validation actually executed

- Final Native/atria-shell/game-runtime/orchestrator regression: **209 suites / 1830 tests passed**.
  FS/SQLite enabled; `ATRIA_DISABLE_MYSQL_TESTS=1`,
  `ATRIA_DISABLE_POSTGRES_TESTS=1`. Command in `tests`:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js --config
  jest.config.json --runInBand native atria-shell game-runtime orchestrator
  --testPathIgnorePatterns p6-baseline /node_modules/ /frontend/
  /skills-ui/playwright/ --modulePathIgnorePatterns p6-baseline`.
  The extra baseline exclusion only isolates the temporary P5 comparison worktree.
- Final targeted authoring/Graph/P1/P4 tests before the last focus-only UI fix:
  **6 suites / 41 tests passed**. Earlier P1/P3/freeze: **3 / 48**. Counts overlap.
- P0-P6, A0-A8, N9/N10 guards passed, including the new P6 guard and existing
  mutation self-tests. Frozen authority assertions were not weakened.
- Repository `npm run lint` passed. Touched-code/test ESLint has no errors;
  the P6 browser test has two viewport-conditional-navigation warnings.
- Changed JavaScript/MJS syntax and `git diff --check` passed.
- `npm run frontend:prebuild-cache` passed (cache hit, not a forced cold compile).
- Real isolated local-server Playwright/Edge: **final P6: 2 passed**; the **8 P4/P5 adjacent cases passed** in the combined run described below (not a ten-case all-green combined run). Desktop 1440x1000,
  mobile 390x844. P6 creates/edits Library resources, switches editor modes,
  manipulates stages/modules, checks Package read-only/Fork/Derived/Used By,
  injects save failure, proves Project resources are unchanged before human Apply,
  compiles, saves/reopens runtime recommendations, inspects closure and preflights.
  P4/P5 adjacent cases cover Play streaming/Stop, AI takeover, exact route editing,
  diagnostics and mobile editor navigation.

Screenshots were inspected, not merely captured. Initial passes exposed low-contrast
white native controls and compressed Studio navigation; corrected tokens/styles and
nonshrinking tree rows. Subsequent review fixed saved recommendation reset and
focused save errors so they cannot remain offscreen on mobile. Re-captured and
checked desktop/mobile editor, stage tree, Library, failed save, Runtime Design,
Review and compile-preview views. Screenshots/logs remain ignored local artifacts.
An enhanced browser check exposed the real Graph ownership bug; another needed
its Package-original locator narrowed after desktop Fork created same-named Library
resources. An intermediate combined run had 9 passes and one unrelated Horde
TLS/discovery non-JSON page error. Final P6 tests isolate only optional legacy
Horde model/worker/status discovery; Native endpoints remain real and page errors
are still asserted absent. SD connection-refused probes remain optional warnings.

### Broader storage comparison (not represented as a pass)

An additional Native/atria-shell/game-runtime/orchestrator/storage run returned
**309 passed / 3 failed / 7 skipped suites**, **2953 passed / 4 failed / 92 skipped
tests**. The failures are:

- `storage/migration/auto-rollback-engine.test.js` (SQLite rollback);
- `storage/migration/snapshot-engine-dump.test.js` (2 SQLite restore cases);
- `storage/engines/sqlite-close-handle.test.js` (Windows locked WAL unlink).

All three suites and the same four cases failed again on an isolated, unchanged
P5 `0cb56b9` worktree (8 other cases passed). They predate P6 and are not fixed by
unrelated storage edits in this phase. Two exploratory Jest commands with malformed
filter argument order were stopped and are not acceptance evidence.

## Boundaries / next phase

No main merge, P7/P8 work, Android/Docker, MySQL/PostgreSQL services, real device or
external model-credential validation. Secret provisioning/import remains outside
this phase; existing player Secret IDs are still required for actual sends.
Advanced conditions/parameters use the JSON editor, not a separate visual DSL.
Preview explicitly uses committed exact resources, not an unsaved draft. Library
closure Fork publishes immutable dependencies before the root; a failed partial
publication may leave unused revisions, never a successful root or edited original.
No implicit migration/dual-write. P7 owns Settings/legacy UI cleanup, owning search
routes and localization. Continue only with explicit user instruction.
