# World Info mobile lorebook action sheet hardening

## Task

Real-device follow-up after the first mobile lorebook action-menu repair still failed on Android: tapping the per-book three-dot trigger could change state, but the menu could remain clipped or render outside the usable mobile viewport.

## Branch and baseline

- Temporary branch: `fix/world-info-book-menu-portal`
- Baseline: `main@f7dd82ee4089e9e59f6effdd61509b14b39daa2d`
- PR: #28
- Final validated head: `9f1abf3004e51428ea0be3c9f5a161a9037b6f66`
- Squash merge / resulting `main`: `653b1b59f771e0c494e73af64f799790c6c3a856`
- Validated task-head tree and merged-main tree: `adad34a4b45a1b5eb3a1463c054cbc0c9dc6f4b1` (identical)

## Root causes

The issue was not a single click-handler failure. Real-device testing exposed several stacked presentation problems:

1. The original native `details/summary` disclosure was unreliable inside an interactive lorebook card on Android.
2. Replacing it with a JS button fixed the trigger state, but the menu still lived inside the Library/card scroll hierarchy and could be clipped.
3. A top-layer dialog solved stacking, but placing it outside World Info caused drawer outside-click behavior.
4. Moving the dialog back under `#WorldInfo` preserved event ownership, but the action menu retained the legacy high-specificity absolute positioning rule from the card menu.
5. The legacy selector `#WorldInfo .world_info_manager_item_menu` therefore overrode the weaker top-layer `position: static` rule and pushed the sheet below the mobile viewport.
6. The remaining mobile Library / Entries search disclosure controls still used native `details`, so they were normalized to explicit JS-driven buttons as well.

## Final implementation

### Lorebook actions

The mobile per-lorebook action menu now uses:

- an explicit normal button trigger;
- `aria-expanded` synchronized with real menu state;
- a modal `<dialog>` top layer;
- dialog DOM ownership under `#WorldInfo` so SillyTavern still treats interaction as inside the drawer;
- isolated pointer/click events;
- an explicit close button;
- full-viewport dialog geometry with the sheet bottom-aligned above mobile navigation;
- a higher-specificity selector that resets the legacy card-menu `position/top/right/bottom/left` values.

The existing actions remain:

- Entries
- Export
- Rename
- Duplicate
- Tags
- Pin / Unpin
- Delete

### Mobile search disclosure controls

The Library and Entries search option controls now use explicit Atria buttons and menus instead of native `details`.

Mobile-specific search controls are visible by default and hidden only on desktop widths. Existing search state remains authoritative; the mobile controls still proxy the same native World Info inputs/events.

## Compatibility boundaries

No World Info persistence, activation, API, import/export format, selection, state-condition/event or storage semantics changed.

This is a presentation / interaction reliability hardening only.

## Regression coverage

The real-browser World Info workspace acceptance now verifies:

- the actual lorebook three-dot trigger opens;
- `aria-expanded` changes to `true`;
- the modal action sheet is visible;
- the action sheet remains within the mobile viewport;
- Export / Rename / Duplicate are visible;
- the sheet closes without closing World Info;
- Library remains active after closing the sheet;
- the underlying Manager drawer content remains visible;
- mobile Library and Entries search menus remain interactable;
- desktop World Info behavior remains unchanged.

## Validation

Final head `9f1abf3004e51428ea0be3c9f5a161a9037b6f66` passed:

- Atria PR Checks #587
  - ESLint
  - complete Node unit suite
  - frontend libraries build
  - Atria Migration Guard
- Worldbook Performance Foundation #272
  - focused regressions
  - synthetic benchmark
  - real-host Chromium smoke
  - complete World Info runtime/workspace acceptance

Android JVM/APK and Docker builds were intentionally not run because this task changes browser JavaScript/CSS/tests only.

## Data / migration impact

None.
