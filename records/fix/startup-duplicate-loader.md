# Remove duplicate startup loader

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
