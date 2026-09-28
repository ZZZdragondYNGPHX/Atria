# Android / Termux startup: post-visible Select2 loading

## Task

- Goal: remove Select2 classic-script parse/eval work from the pre-visible startup path without breaking desktop controls or mobile focus protections.
- Task branch: `perf/lazy-select2-libs`
- Final baseline: `main@5db0d3fd005d6bf05e6f0d89212a4d82b12d6e6f`
- Final validated head: `e80a764c78522f8ceb80a0bacc048ac373a0b347`
- PR: #58
- Squash merge / resulting main: `ffc2857b9fdf8225958c2bf8934b360ad4cff91b`

## Implementation

- Removed eager `select2.min.js` and `select2-search-placeholder.js` classic-script tags from `public/index.html`.
- Added a tiny eager `mobile-focus-guard.js` so Android/iOS keyboard-focus protections remain available before Select2 loads.
- Select2 and the Atria search-field patch now start loading only after the first loader is hidden and one browser yield has completed.
- The loader is memoized and retryable.
- Desktop-only Chat Completion model-picker Select2 setup was split from early `initOpenAI()` into idempotent `initOpenAIModelSelects()`.
- `initOpenAIModelSelects()` now runs after Select2 is ready and before preset-manager initialization.
- Mobile keeps the previous behavior of skipping desktop model-picker Select2 enhancement.
- Added `tests/frontend-lazy-select2.test.js` to pin the classic-script boundary, mobile focus guard, OpenAI ordering, and preset-manager ordering.

## Regression found during implementation

The first implementation delayed Select2 but left desktop `initOpenAI()` calling `.select2()` before the loader hid. Real-host Chromium therefore stopped before preloader removal. The browser startup smoke caught this even though the focused/static tests passed.

The final implementation moves only those desktop UI enhancements across the post-visible boundary; the rest of OpenAI initialization keeps its original startup timing.

## Validation

Final head passed:

- Atria PR Checks #655:
  - ESLint;
  - Atria Migration Guard;
  - complete Node unit suite;
  - frontend library build as part of unit validation.
- Worldbook Performance Foundation #315:
  - focused regressions;
  - synthetic baseline;
  - isolated real-host Chromium startup smoke;
  - complete World Info runtime/workspace acceptance.

Android JVM/APK and Docker validation were intentionally not run because this task changes browser JavaScript/classic-script startup loading only and those validations remain opt-in.

## Performance interpretation

Select2 plus the Atria patch are roughly 76 KB of classic JavaScript that no longer parse/evaluate before the first visible UI. This is an architectural critical-path reduction only; no real-device time saving is claimed until a new complete Termux startup log is collected.
