# World Info mobile lorebook menu reliability

## Task

Real-device follow-up after the World Info mobile controls fix. Android field testing showed the per-lorebook three-dot action menu did not reliably expand even though desktop Chromium accepted the native `<details><summary>` interaction.

## Branch and baseline

- Temporary branch: `fix/world-info-book-menu`
- Baseline: `main@75c77b23112fe3ce89d4f28c4ee26b2f20b73769`
- PR: #27
- Final validated head: `dcdff643aa30ca161a267b09d06ce34c35315447`
- Squash merge / resulting `main`: `f7dd82ee4089e9e59f6effdd61509b14b39daa2d`
- Validated task-head tree and merged-main tree: `fb428d5ddf1088bee7bf01498c09a9050baf00c7` (identical)

## Root cause

The lorebook card was itself an interactive surface and contained a nested native `<details><summary>` menu. That interaction worked in desktop Chromium but was not reliable in the Android host/WebView touch path.

The failure was interaction-level rather than missing menu content: the actions existed, but the native disclosure control did not consistently transition to the open state on device.

## Fix

The per-book menu now uses an explicit Atria-controlled interaction:

- normal `button` trigger;
- JS-controlled open/close state;
- `aria-expanded` reflects the real state;
- the menu uses the existing mobile action-sheet styling;
- opening one book menu closes other book menus;
- existing Entries / Export / Rename / Duplicate / Tags / Pin / Delete actions are unchanged.

No World Info persistence, API, activation, import/export format, selection or storage semantics changed.

## Regression coverage

The real-browser World Info workspace regression now asserts that clicking the actual three-dot trigger:

1. changes `aria-expanded` to `true`;
2. makes the action menu visible;
3. exposes the existing book-level actions.

## Validation

Final head `dcdff643aa30ca161a267b09d06ce34c35315447` passed:

- Atria PR Checks #566
  - ESLint
  - complete Node unit suite
  - frontend libraries build
  - Atria Migration Guard
- Worldbook Performance Foundation #251
  - focused regressions
  - synthetic benchmark
  - real-host Chromium smoke
  - complete World Info browser acceptance

Android JVM/APK and Docker builds were not run because this task changes browser JavaScript/CSS/tests only.

## Data / migration impact

None.
