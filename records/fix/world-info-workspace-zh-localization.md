# World Info Workspace Chinese Localization

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

Complete the localization coverage for the World Info Workspace introduced by PR #23.

- Baseline: `main@5645020e68c95d37c1ee44a375b22328173948b8`
- Task branch: `fix/world-info-workspace-zh-localization`
- PR: #24
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
