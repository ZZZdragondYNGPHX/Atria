# Native workspace loading and prompt module refresh

Date: 2026-09-25. Baseline: main `e42bd5043939af90583b473c22b68c4b57ca0aaf`.
Task branch: `fix/native-workspace-loading`. Implementation: `32f9b539c95f130340725e88e6c840bda3edc3c9`.

## Changes

- Runtime lists render from configuration without waiting for the complete exact-resource inventory. Route editors fetch that inventory when opened; Runtime setup performs its checks when expanded.
- Versioned JSON inventory groups revisions from one scan instead of rescanning all revision documents for each root.
- Build list requests metadata summaries. Opening, editing and deletion retain synchronized exact Git revision checks; default Studio list behavior remains unchanged for other consumers.
- Session inventories scan save counts once and share package validation per exact package version within each request. Each subsequent request validates package bytes again, and every session still checks its pinned hash and entry point.
- Prompt preset mutations repaint from the committed server snapshot concurrently with dependent configuration observers. Moving a module immediately updates category filtering. Per-edit full global search rebuilds were removed; search still refreshes when opened.

## Verification

Targeted Jest coverage includes bounded revision scans, per-request package validation, summary/default Studio behavior, authenticated HTTP query handling, Runtime list loading, and existing authoring/generation contracts. Browser regression includes an intentionally unresolved configuration observer while moving a module at 1440px and 390px.

No persistent caches, schema migrations, Android/Docker builds or external inference. Reduced redundant operations are verified; production latency on the user's full data set has not been benchmarked.

Passed: 41 Jest tests across eight relevant suites; five Edge scenarios (module navigation/move with stalled observer at 1440/390px, Runtime setup and fallback editing, Build failure/retry/create at 320px); changed-file ESLint, native localization and whitespace checks. Runtime and Build screenshots inspected. Build's obsolete raw-error assertion was updated to the existing sanitized error UI and its scenario rerun successfully.
