# Android / Termux startup: lazy bulk-edit overlay

## Task

- Goal: remove the character bulk-edit overlay implementation from the initial frontend static module graph.
- Task branch: `perf/lazy-bulk-edit-overlay`
- Final baseline: `main@f690c015b1c6c0c33ab152ceec2561715f52cd72`
- Validated task head: `4e37270891ad89c5814be6e6effffee67612bb41`
- PR: #59
- Squash merge / resulting main: `5db0d3fd005d6bf05e6f0d89212a4d82b12d6e6f`

## Implementation

- Removed the static `BulkEditOverlay` import and eager singleton construction from `public/script.js`.
- Preserved the exported `characterGroupOverlay` live binding for existing internal consumers.
- The singleton is now constructed when the already post-visible `bulk-edit.js` module initializes.
- Removed the overlay module's back-reference to its own singleton through `script.js`, breaking that startup cycle.
- Kept tag/context-menu behavior on the overlay instance itself.
- Added `tests/frontend-lazy-bulk-edit-overlay.test.js` to pin the lazy boundary.

## Compatibility

- Bulk-edit state, select-all, delete, tag and context-menu behavior are unchanged.
- The change does not alter character/group data, storage or APIs.
- The module remains initialized during the existing post-visible startup batch; only its class implementation leaves the initial static graph.

## Validation

Final rebased task head passed:

- Atria PR Checks #647.
- Worldbook Performance Foundation #308, including isolated real-host Chromium startup smoke and World Info acceptance.

Android JVM/APK and Docker validation were intentionally not run because this task changes browser JavaScript startup loading only.

## Performance interpretation

This removes the roughly 33 KB `BulkEditOverlay.js` implementation from the initial static application graph and breaks a `script.js` / overlay startup cycle. No real-device startup-time improvement is claimed until a later full startup log is collected.
