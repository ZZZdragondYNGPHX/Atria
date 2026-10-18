# Atria Workspace mobile launcher repair

## Task

Repair the Agent & Memory Workspace launcher on mobile/Android-sized hosts. The visible `Open Atria Workspace` button inside the Extensions drawer appeared inert even though the Workspace module itself could still be opened programmatically.

## Git

- Baseline: `main@2c8141a532338eba0756805b741bb258a113043d`
- Task branch: `fix/workspace-settings-entry`
- PR: #13
- Squash merge / resulting main: `9dc4cf842ca20d95caa07dfefb51efe856ce80f5`

## Root cause

The launcher click path was healthy. The Workspace mounted and removed its `hidden` attribute, but on a real mobile host its bounding box was `390 × 0`.

SillyTavern mobile CSS fixes `body` to the measured viewport height while the root `html` element keeps a `translateZ(0)` transform. A fixed-position descendant therefore resolves its inset geometry against transformed `html`; because the fixed body is out of normal flow, that containing block can be zero-height. The Workspace used `position: fixed; inset: 0`, so it could compute as visible while still having zero real height.

There was also a separate stacking issue: host settings drawers can occupy z-index 4000/4005 while the Workspace previously used 3200.

## Implementation

- Raised the Workspace overlay layer to z-index 4100 so it stays above host settings drawers while native `<dialog>` surfaces remain in the browser top layer.
- Added explicit mobile Workspace viewport geometry.
- Mobile height uses the host's JS-measured `--doc-height` as the final authority, with `100vh/100dvh` fallbacks for early paint.
- Kept the launcher direct: clicking the visible button still calls `openWorkspace('Orchestration')`; no drawer-closing workaround or alternate navigation path remains.

## Compatibility / data impact

None. No persisted settings, namespaces, memory data, profiles, chat data, or storage formats changed.
