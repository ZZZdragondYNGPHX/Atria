# Diagnostics Workspace Chinese Localization

## Task

- Goal: fix the newly merged Logging / Diagnostics Workspace remaining in English under Chinese locales.
- Temporary branch: `fix/logging-workspace-zh-localization`
- Baseline: `main@b8cd63d0a0f7afd647cd455a7555bf283758fea4`
- Validated task head: `f08032f1c9ecd686e5fc1218f39ec82e4f700ad5`
- PR: #73
- Squash merge: `main@fad1dd44c11854861db0a5b2d92335792def8ecc`

## Implementation

- Added complete Simplified Chinese and Traditional Chinese locale coverage for the Diagnostics Workspace Guided / Startup / Expert UI.
- Localized the User Settings Diagnostics entry and its tooltip.
- Routed module-health labels through the existing i18n layer instead of rendering model labels directly.
- Routed Startup Analysis phase, timeline, scope and slow-item labels through i18n.
- Localized stable incident severity and ownership labels while keeping raw log messages, module identifiers, stages, evidence and machine-readable diagnostic context unchanged.
- Added `tests/logging/workspace-i18n.test.js` so zh-CN / zh-TW coverage regressions fail CI.

## Validation

Atria PR Checks #717 passed on the final task head:

- ESLint;
- Atria Migration Guard;
- complete Node unit suite, including the new Diagnostics Workspace localization regression.

The first CI pass correctly failed because `Unknown time` and `Unknown version` were missing from both Chinese locale files; those two omissions were added and the final run passed.

Android JVM/APK and Docker validation were not run because this task only changes browser JavaScript, locale dictionaries and Node/Jest regression coverage.
