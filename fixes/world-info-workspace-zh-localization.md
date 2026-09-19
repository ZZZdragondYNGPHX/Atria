# World Info Workspace Chinese Localization

## Task

Complete the localization coverage for the World Info Workspace introduced by PR #23.

- Baseline: `main@5645020e68c95d37c1ee44a375b22328173948b8`
- Task branch: `fix/world-info-workspace-zh-localization`
- PR: #24
- Final validated task head: `fe91c5692e6fe03d2f6a953ca3d41b8e4264812e`
- Squash merge / resulting `main`: `59bc6862487331d12378e4fdd1da403a248e12a5`
- Final task tree is identical to the merged `main` tree.

## Root cause

The underlying World Info editor already had extensive Simplified Chinese and Traditional Chinese locale coverage, but the new Workspace-owned shell and dynamic view-model text added by PR #23 were largely written as direct English strings.

As a result, switching Atria to Chinese translated the legacy World Info controls while leaving the new Workspace navigation, Inspector structure, Issues diagnostics, relationship picker, bulk UI, Global Rules grouping and Test Activation surface partially in English.

## Implementation

### Workspace-owned i18n

`public/scripts/world-info/workspace.js` now routes Workspace-owned user-facing text through the existing `t` i18n helper.

Coverage includes:

- Library / Entries / Global Rules navigation;
- Compact / Standard / Full / Custom display modes;
- entry filters and entry counts;
- Inspector section headings and summaries;
- lifecycle/state/relationship/advanced summaries;
- semantic badges and budget-tier labels;
- relationship picker search/add/remove UI;
- contextual bulk Inspector;
- book / entry overflow menus;
- Global Rules grouping descriptions;
- Test Activation progress/fallback/error text;
- mobile Back / Close-related labels.

### Deterministic Issues diagnostics

The diagnostics core remains DOM-independent for Node/Jest use.

Rather than importing browser `i18n.js` directly, `diagnostics.js` uses the optional runtime `globalThis.__i18n.t` bridge when available and falls back to the original English template in pure Node contexts.

This preserves the existing deterministic/pure diagnostic test boundary while allowing browser-rendered Issues messages to localize.

### Locale coverage

Both locale files were extended:

- `public/locales/zh-cn.json`
- `public/locales/zh-tw.json`

The final automatic key audit covered 124 Workspace / Issues / Test Activation keys:

- Simplified Chinese missing keys: 0
- Traditional Chinese missing keys: 0

Existing established translations remain authoritative where the same key already existed, e.g. the Chinese `Basic` label resolves to the repository's existing “基本信息” translation.

### Compatibility fixes found during validation

Localization work preserved the English fallback contract:

- singular entry count remains `1 entry`;
- plural count remains `N entries`;
- Chinese uses the localized count form for both cases.

No raw `critical` / `scene` / `optional` budget-tier enum is shown in the Workspace badges; the visible label is localized while persistence remains unchanged.

## Browser regression

World Info E2E #34 now includes a real Simplified Chinese browser scenario that verifies:

- top-level Workspace navigation;
- display mode label;
- all six Inspector section headings;
- quick filters;
- Issues diagnostic messages;
- Required / Related picker placeholders;
- Global Rules group headings.

The regression runs through the actual `zh-cn` locale setting rather than asserting locale JSON in isolation.

## Compatibility / data impact

- No World Info persistence schema change.
- No REST/API change.
- No import/export change.
- No activation semantic change.
- No State Conditions / State Events protocol change.
- No relationship/selection persistence change.
- No storage migration.
- Diagnostics remain deterministic and non-mutating.
- Android JVM/APK and Docker builds were not run because they remain opt-in and this task changes browser JavaScript/locales/tests only.

## Validation

Final task head: `fe91c5692e6fe03d2f6a953ca3d41b8e4264812e`.

### Atria PR Checks #547

Passed:

- ESLint
- frontend libraries build
- complete Node unit suite
- Atria Migration Guard

### Worldbook Performance Foundation #232

Passed:

- focused World Info regression tests
- synthetic performance baseline
- real-host Chromium smoke
- complete World Info browser acceptance
- existing desktop/mobile Workspace checks
- new Simplified Chinese Workspace localization regression

No mandatory follow-up remains for this localization fix.
