# World Info mobile controls follow-up

## Task

Follow-up to the World Info mobile product UI refactor after real-device review showed three usability regressions:

1. Global lorebook activation was technically available but visually ambiguous.
2. Book-level Export / Rename / Duplicate actions were no longer discoverable from Library.
3. Mobile entry search controls overlapped and legacy pagination still competed for vertical space.

## Branch and baseline

- Temporary branch: `fix/world-info-mobile-controls`
- Baseline: `main@71dc40588f02c96d16d7be64f1e0ccd0223982ba`
- PR: #26
- Final validated head: `121ec5fd196dee4a257c6deb0912cd3380cc94c0`
- Squash merge / resulting `main`: `75c77b23112fe3ce89d4f28c4ee26b2f20b73769`
- Validated task-head tree and merged-main tree: `a81d426e0f158913903dc266520fcd2f8670e214` (identical)

## Implementation

### Explicit global activation

Each lorebook card now exposes a labeled global action:

- `Enable globally` / `全局启用`
- `Disable globally` / `取消全局`

The card status badge likewise reports:

- `Globally enabled` / `已全局启用`
- `Not global` / `未全局启用`

This uses the existing global World Info selection path; no activation semantics changed.

### Restored book actions

The per-book overflow menu now includes:

- Entries
- Export
- Rename
- Duplicate
- Tags
- Pin / Unpin
- Delete

Export, rename and duplicate use the existing World Info load/save/rename/download behavior rather than introducing parallel persistence code.

### Mobile entry search layout

The mobile Entries toolbar now keeps only:

- search field;
- search help;
- one search-options button.

Search mode and Advanced syntax move into the compact search-options menu. The original controls remain authoritative and the mobile controls proxy their values/events.

Normal virtual-list mode explicitly hides legacy `#world_info_pagination`. Continuous Cards retains pagination.

## Regression coverage

World Info browser acceptance now checks:

- global toggle label/state;
- restored Export / Rename / Duplicate menu actions;
- mobile search-mode proxy behavior;
- original desktop filter controls hidden on mobile;
- ordinary-mode pagination hidden;
- search field / help / options controls do not overlap;
- Simplified Chinese labels.

The first Worldbook run failed only because the zh-CN test retained the previous persisted Entries view and tried to click a hidden Library menu. The test was corrected to explicitly enter Library before asserting Library controls.

## Validation

Final head `121ec5fd196dee4a257c6deb0912cd3380cc94c0` passed:

- Atria PR Checks #565
  - ESLint
  - complete Node unit suite
  - frontend libraries build
  - Atria Migration Guard
- Worldbook Performance Foundation #250
  - focused regressions
  - synthetic benchmark
  - real-host Chromium smoke
  - complete World Info browser acceptance

Android JVM/APK and Docker builds were not run because this follow-up changes browser JavaScript/CSS/localization/tests only.

## Data / migration impact

None.
