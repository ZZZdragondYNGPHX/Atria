# World Info mobile lorebook menu reliability

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

Real-device follow-up after the World Info mobile controls fix. Android field testing showed the per-lorebook three-dot action menu did not reliably expand even though desktop Chromium accepted the native `<details><summary>` interaction.

## Branch and baseline

- Temporary branch: `fix/world-info-book-menu`
- Baseline: `main@75c77b23112fe3ce89d4f28c4ee26b2f20b73769`
- PR: #27
- Squash merge / resulting `main`: `f7dd82ee4089e9e59f6effdd61509b14b39daa2d`

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

## Data / migration impact

None.
