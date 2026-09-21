# Runtime API / Preset Surface Repair

## Status

Completed and merged.

- Task branch: `fix/runtime-api-preset-surface`
- Baseline: `main@5df59a5c7789219bf96c6574f100209a264db454`
- Final validated task HEAD: `ba77168ab62fc0e9f40cc090437bec2ea1ace943`
- PR: #81 — `fix: repair Runtime API and preset editing surfaces`
- Squash merge / resulting main: `5e0f46da9dcd4dce3811e854ad87d694fa2606d7`
- Validated task tree and merged-main tree: `15faba33c2e63f7d739368059ef53f112d4f08b8` — identical
- Post-merge cleanup: **Cleanup merged task branches #78**, run `35613926434`: success; `fix/runtime-api-preset-surface` removed

## Goal

Repair the post-R7 Runtime settings regressions reported from mobile:

1. incomplete Runtime/API localization;
2. API connection presets visible but not practically editable from Runtime;
3. Model / Prompt Presets consuming excessive vertical space;
4. model/prompt presets selectable but not directly editable;
5. duplicate Connections / Retrieval navigation opening the same controller.

## Implemented

### Single API Connections surface

Runtime now has one top-level **Connections** surface. The duplicate **Retrieval** Runtime tab and command were removed.

The existing Connection Manager remains authoritative and exposes its native mode tabs inside the single surface:

- Chat / conversation API;
- Embedding;
- Rerank.

Historical `retrieval` deep links and callers normalize to `connections`; no second connection controller was introduced.

### Full native API editing

R7F embedded only `#atria-connection-manager-root`, which exposed the profile shell while leaving the live chat API/model controls behind in `#rm_api_block`.

The repaired adapter reparents the complete native `#rm_api_block` into Runtime. This preserves the existing SillyTavern/Atria authorities for:

- provider/model selection;
- API URL/key controls;
- connection-profile CRUD/update;
- retry/rate-limit/advanced controls;
- embedding/rerank inline profile editors.

No parallel API state or persistence path was added.

### Compact editable preset surface

Runtime > Model / Prompt Presets is now a compact list instead of six large cards. Each row contains:

- preset family label;
- current preset selector;
- **Edit** action.

Edit opens a focused child editor by reparents the existing native authority:

- Chat Completion / Text Completion → existing AI Response Configuration (`#left-nav-panel`);
- Context / Instruct / System Prompt / Reasoning → existing Advanced Formatting (`#AdvancedFormatting`).

Returning restores the exact original DOM placement. Preset persistence, events, import/export and editing remain owned by the existing preset managers.

### Localization

Added/finished namespaced Runtime labels for the editor flow in Simplified and Traditional Chinese, including:

- API Connections;
- Edit;
- Back to preset list;
- Preset editor;
- editor-loading copy;
- current-preset accessibility labels;
- unified chat / embedding / rerank profile counts.

Several mixed simplified/traditional strings in the touched zh-TW Runtime block were corrected.

Preset **names** such as `Default`, `Alpaca`, `Neutral - Chat` and `Think XML` remain user/content identifiers and are not forcibly translated.

## Validation actually executed

PR **#81**, Atria PR Checks **#759**, run `35613234671`: **success**.

- Atria Migration Guard: success
- ESLint: success
- complete Unit Tests job: success
- frontend libraries built successfully as part of Unit Tests

Focused unit coverage was updated for:

- duplicate Retrieval removal / route normalization;
- embedding the complete native API authority;
- exact DOM restoration;
- Runtime preset localization keys.

The R7F browser smoke was updated to cover the repaired API/preset UX, including compact mobile rows and native editor drill-downs. A dedicated Playwright/R7 Shell browser workflow was not executed by PR #81, so it is not recorded as a passed check.

Android JVM/APK and Docker validation were not run because this task changes browser/frontend Runtime surfaces only.

## Data / compatibility impact

No stored API profile, preset, chat, memory, game-runtime, or SillyTavern upstream data format changed.

The only route compatibility behavior is:

- old Runtime `retrieval` route/call → normalized to Runtime `connections`.

Underlying Connection Manager and Preset Manager contracts remain authoritative.
