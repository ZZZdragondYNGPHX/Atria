# P7 — Product Surface Cleanup validation

Date: 2026-09-23. Branch: `refactor/atria-model-prompt-settings`.
Baseline: P6 `2351be51e8c8cbdadf0966104ec607018e93de6e`.
Validated/pushed commit: `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`.
Main unchanged: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.

## Delivered and authority decisions

- Settings no longer reparents the entire User Settings drawer, even under
  Advanced. A fixed preference-only allowlist reuses the original theme/color/font,
  language, interaction and reduced-motion/blur controls with their existing event
  handlers and persistence. Original nodes are restored on unmount. No new settings
  store. Advanced contains appearance preferences only, never sampling/Prompt/
  Connection/auto-generation controls. Storage/privacy and diagnostics link to
  their owning utilities; Model/Connection/Route links go to Runtime and Prompt
  assets to Library/Build. Unfiltered controls remain only in explicit legacy host
  recovery, not the Native product Settings view.
- Removed the `package.presets` field and obsolete Presets section from the Studio
  product editor. Package Metadata still edits processors/localization/permissions
  through A1 Review/Apply. Existing source data is not silently deleted/migrated;
  generic source editing does not promote old fields to runtime authority.
- Product Search indexes exact Prompt Program/Module/Generation resources from
  Library, Projects and Packages. Commands carry owner + resource ID + revision,
  not display-name identities. Duplicate names and scopes remain distinct. Search
  routes to the owning Library detail, focuses the exact row, and reports missing
  revisions rather than substituting latest. Same-section deep links now update
  their controller correctly. Opening Command refreshes the transient index;
  Library commits/Forks also refresh it. No cross-domain editor injection.
- Obsolete Preset commands now route to owning Library assets. Old navigation-only
  Runtime section aliases remain redirects to canonical sections, not persisted
  model/preset identities or fallback resolvers. Primary Build is unchanged.
- Legacy preset-manager reads in orchestrator/memory/search UI are concentrated in
  the explicit `native/generation-compat.js` non-Native boundary, which returns no
  legacy manager/names in a Native Session or mounted Native Shell, even before a Session loads. Native preset/connection selectors
  instead show a disabled Runtime-route hint; Native AI routing hints no longer
  enumerate legacy names and card preset embedding is bypassed. Non-Native chats
  retain explicit compatibility behavior. P4 execution/Secret/fallback and A8
  Review/Commit/Takeover authority are not replaced.
- P5/P6 native builders now use the existing Shell localization path. Added
  Simplified Chinese keys for Prompt/Generation, Runtime, Settings, Package Metadata
  and dynamic stage labels, retaining English fallbacks. Resource names, IDs,
  input values and JSON/provenance are data and remain untranslated. Other locale
  catalogs retain English fallback; this is not an all-language translation claim.
- Added P7 residual/whitelist/owning-route guard and CI coverage. Tightened P4's old
  four-file preset-reader exception to the single explicit compatibility boundary.
  A6's Settings seam now requires the preference-only allowlist; no invariant was
  weakened. P0-P6 and A1/A2/A7/A8 semantics are retained.

## Checks actually executed

- Relevant Native/atria-shell/game-runtime/orchestrator FS/SQLite regression:
  **210 suites / 1837 tests passed**. Command in `tests`:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js --config
  jest.config.json --runInBand native atria-shell game-runtime orchestrator
  --testPathIgnorePatterns p6-baseline /node_modules/ /frontend/
  /skills-ui/playwright/ --modulePathIgnorePatterns p6-baseline`.
  Environment: `ATRIA_DISABLE_MYSQL_TESTS=1`, `ATRIA_DISABLE_POSTGRES_TESTS=1`.
  The ignored P6 baseline worktree is excluded from discovery.
- Final Shell/P7 compatibility focused run after Command-open refresh: **24 suites / 95 tests passed** (before the final no-Session Shell boundary check; that check is included in the final broad run).
  Counts overlap the broad run. Prior initial run was 210 / 1833 before added tests.
- P0-P7, A0-A8, N9/N10 guards passed, including P2/P3 mutation self-tests.
- Repository lint, changed-file JavaScript/MJS syntax and diff checks passed.
- Frontend prebuild-cache passed; existing cache hit, not a forced cold build.
- Real isolated local-server Playwright/Edge browser acceptance: **P4-P7 combined: 12 passed**; after the final Native-Shell UI boundary change, **P4/P7 follow-up: 6 passed** (overlapping).
  Desktop 1440x1000 and mobile 390x844. P7 exercises preference controls/round-trip
  mounting, owner navigation, actual Command search click, exact row/focus and
  real locale-select reload to Chinese before creating a Prompt. P4-P6 cases
  recheck Play/Stop, A8 takeover, Runtime controls/preview and reviewed authoring.

Screenshots were inspected, not only captured. Fixed raw internal preference
labels found on desktop; added comfortable mobile label targets; reviewed Chinese
Prompt/Settings and localized stage labels. Browser interaction exposed and fixed
same-section exact-resource navigation. The first test attempt used an incorrect
Command API and was corrected to the real UI button; it is not acceptance evidence.
Optional Horde discovery is isolated in P6/P7 tests; Native endpoints are real.
SD connection-refused startup probes are warnings, not accepted product failures.
Final screenshot review and browser results: desktop/mobile Settings, expanded appearance, exact selected resource and Chinese Prompt editor screenshots inspected after recapture; no unresolved layout/overflow defect observed.

## Boundaries / P8 handoff

No P8 hard-cut/final integration, PR/main merge, Android/Docker, MySQL/PostgreSQL,
real mobile device or external model-credential tests. Full storage extension was
not rerun in P7: P6 recorded four Windows SQLite failures reproduced on unchanged
P5. Do not claim those have passed or were fixed. No automatic data migration,
dual-write, new Prompt/settings store or credential provisioning. Legacy recovery,
third-party compatibility and non-Native generation remain explicit host islands.
No claim that all upstream SillyTavern code has been removed.

P8 owns final residual/adapter audit, exact graph/no-dual-write/no-hidden-fallback
verification, API docs, real-host acceptance, final applicable guards/build/tests,
and branch/PR/merge readiness. Continue only on explicit user instruction.
