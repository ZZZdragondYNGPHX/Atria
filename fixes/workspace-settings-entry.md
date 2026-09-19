# Workspace settings launcher visibility fix

## Task

Fix the Atria Agent & Memory Workspace launcher on mobile/real host where clicking **Open Atria Workspace** from the Extensions drawer appeared to do nothing.

- Task branch: `fix/workspace-settings-entry`
- Baseline: `main@2c8141a532338eba0756805b741bb258a113043d`
- Final validated head: `e8a1ccdedb8925ac1e301eccef7e119d1deef8b5`
- Pull request: #13

## Root cause

The launcher click path was valid and `openWorkspace('Orchestration')` executed. The Workspace element removed its `hidden` attribute and computed as `display: grid`, `visibility: visible`, `opacity: 1`, but the real mobile host reported a bounding-box height of exactly `0px`.

The host mobile layout combines:

- `html` with `transform: translateZ(0)`;
- `body` fixed to the JS-measured `--doc-height`;
- the Workspace using `position: fixed; inset: 0`.

That makes transformed `html` the fixed-position containing block. Because the fixed `body` is removed from normal flow, the containing block can be zero-height even though the viewport and body are not.

A second layering issue existed: host settings drawers can occupy z-index 4000/4005 while the Workspace used 3200.

## Implementation

- Raised the product-level Workspace overlay to z-index 4100 so it remains above standard SillyTavern settings drawers.
- Kept the launcher as a direct `openWorkspace('Orchestration')` action; no drawer-closing workaround remains.
- On mobile, the Workspace now receives an explicit viewport height.
- Height prefers `var(--doc-height, 100dvh)`, matching the host's JS-measured viewport authority and retaining viewport-unit fallback for early paint.
- Added a real-host mobile regression that:
  1. opens the Extensions drawer;
  2. expands Agent & Memory;
  3. clicks the actual **Open Atria Workspace** button;
  4. verifies the Workspace is visible with non-zero width/height;
  5. verifies the Workspace is the top hit-tested interactive surface.

## Validation

Final head `e8a1ccdedb8925ac1e301eccef7e119d1deef8b5` passed:

- Workspace UI #150
  - Workspace information-architecture guard
  - Workspace projection smoke
  - Workspace UI smoke
  - Workspace call-count smoke
  - real-host Workspace persistence E2E
  - new real mobile launcher regression
- Atria PR Checks #453
  - Atria Migration Guard
  - ESLint
  - complete Node unit suite
- Worldbook Performance Foundation #204

Android JVM/APK and Docker builds were not run because this task changes browser/mobile CSS and Workspace UI only, and those builds remain opt-in by repository policy.

## Compatibility / data impact

No persisted data, Workspace preset schema, memory state, orchestration state, or API contract changed. This is a presentation/host-layout fix only.
