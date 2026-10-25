# Android / Termux startup: post-visible Select2 loading

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

- Goal: remove Select2 classic-script parse/eval work from the pre-visible startup path without breaking desktop controls or mobile focus protections.
- Task branch: `perf/lazy-select2-libs`
- Final baseline: `main@5db0d3fd005d6bf05e6f0d89212a4d82b12d6e6f`
- PR: #58
- Squash merge / resulting main: `ffc2857b9fdf8225958c2bf8934b360ad4cff91b`

## Implementation

- Removed eager `select2.min.js` and `select2-search-placeholder.js` classic-script tags from `public/index.html`.
- Select2 and the Atria search-field patch now start loading only after the first loader is hidden and one browser yield has completed.
- The loader is memoized and retryable.
- Desktop-only Chat Completion model-picker Select2 setup was split from early `initOpenAI()` into idempotent `initOpenAIModelSelects()`.
- `initOpenAIModelSelects()` now runs after Select2 is ready and before preset-manager initialization.
- Mobile keeps the previous behavior of skipping desktop model-picker Select2 enhancement.

## Performance interpretation

Select2 plus the Atria patch are roughly 76 KB of classic JavaScript that no longer parse/evaluate before the first visible UI. This is an architectural critical-path reduction only; no real-device time saving is claimed until a new complete Termux startup log is collected.
