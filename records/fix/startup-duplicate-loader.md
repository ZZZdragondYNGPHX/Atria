# Remove duplicate startup loader

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `startup-duplicate-loader`
- Date: 2026-10-19 (America/Los_Angeles)
- Primary Workspace: `main` product source
- Start HEAD: `d6657d68`
- Implementation HEAD: `d7bea47b`
- Status: complete

## Result

Startup previously displayed the Folios startup cover and also called the deprecated `showLoader()`, opening a modal spinner with “Please wait…”. Startup now uses the existing cover alone and releases it at the existing shell-ready, onboarding and APP_READY boundaries.

Removed the unused legacy `showLoader`, `hideLoader` and `isLoaderVisible` implementation and the deprecated extension-context exports. The unified action loader remains available for actual operations through `loader`.

## Validation

- `node --check` passed for `public/script.js`, `public/scripts/loader.js` and `public/scripts/st-context.js`.
- Targeted ESLint passed for all three files; `git diff --check` passed.
- Local browser verification used the existing service on port 8000, with the three modified JavaScript files served directly from the source workspace through browser request overrides. Startup cover observed, no `dialog.atri-blocking-loader` observed throughout startup, cover removed, `#atria-app-shell` mounted and `[init] complete` reached.
- An initial browser wait used the incorrect `#atria-shell` selector and timed out. DOM inspection identified the correct `#atria-app-shell`; subsequent checks completed successfully.
- This verifies browser startup with local source substitutions, not an operating-system reboot or a packaged release.

## Delivery

Implementation committed and integrated into local `main`; stable `D:/Dev/Atria` checkout fast-forwarded to the same implementation HEAD. No test assets were committed. Unrelated documentation edits remain untouched.

## Follow-up: actual running clone and parallel task

The user still observed the popup after the initial delivery. Codex's built-in browser directly reproduced the overlay. The earlier request-override verification did not establish that the running service used the updated repository.

Tracing port 8000's Node process to its parent command identified `D:/Atria/Start.bat`. The actual service runs from the independent `D:/Atria` clone, still at `d6657d68`; it does not run from `D:/Dev/Atria`. Matching source bytes with a worktree alone was insufficient to identify the running directory.

- Fast-forwarded the clean `D:/Atria` main checkout to `d7bea47b`. Direct HTTP retrieval then confirmed the updated startup code and absence of the old startup call.
- Reloaded the actual service in Codex's built-in browser, without request overrides: Folios startup cover visible, no “Please wait…” modal, normal transition into `#atria-app-shell`, no captured page errors. Startup screenshot saved locally at `D:/Dev/Atria-worktrees/previews/startup-loader-fixed.png` (not committed).
- At the user's explicit request, cherry-picked only the two startup fix commits into `feat/dynamic-world`: `d27f0a5e` and `5fca2e3d`, preserving the task's existing `1f4f21a0` commit. All three changed files passed `node --check`, targeted ESLint and `git diff --check`; the worktree was clean afterward.
- Notified the existing chat “正式开始动态世界任务” (`01a15768-5215-7ae1-a707-7b7806bcfc13`) with the commits, scope, validation and actual runtime directory, as explicitly requested by the user.
