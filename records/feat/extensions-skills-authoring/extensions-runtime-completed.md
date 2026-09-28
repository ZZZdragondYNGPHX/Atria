# Browser extension runtime and SDK checkpoint

Updated: 2026-09-27. Approved plan step 3 complete; unified management UI and first authoring Skills remain pending.

- Branch: `feat/native-experience-modes-capability-deepening`.
- Baseline: `db0369deaf2b296f2e5361b88460fd047536f505`.
- Result: `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` (pushed).
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion, all prior commits preserved.

## Delivered

1. `extension-runtime.js` imports enabled Local/External ES modules through the existing authenticated revision-bound file route and invokes `activate(sdk)`. Global / Prompt preset / Work matching is OR; multiple matches activate once. Identity/version changes, edit/disable/delete and refresh retire old activations. Late imports never activate; late activation cleanup still runs; known asynchronous cleanup completes before the next instance of the same ID starts. Failures are isolated and inspectable.
2. `extension-sdk.js` v1 owns DOM mounts/styles, event subscriptions, DOM listeners, timers and cleanup registration. Its abort signal and current-context guard reject obsolete calls and suppress obsolete callbacks. SDK native methods delegate to existing typed lifecycle/Activity/Scene/Continuity/Realm and projection APIs. No raw state-write method, new Session/World store or generation entrypoint was introduced. Already-admitted Native operations are not rolled back by SDK disposal; late results are rejected.
3. `extensions-host.js` subscribes to existing Session lifecycle, Runtime configuration and extension management notifications; there is no polling scheduler. It forwards only identity metadata to extension event listeners. Preset identity comes from the primary narrator route's existing PromptPresetStore ownership lookup via `/prompt-scope` (same authority as `/regex-scopes`). Work identity is entire Package ID; context also anchors Session/branch/exact version/entry point/history/readiness. Per-call route overrides are not Host preset scopes.
4. Startup loads the Host after APP_READY without blocking the boot barrier. Existing shell legacy-recovery mode skips it. `Atria.extensions` exposes client, refresh, status and subscriptions. Page hide suspends resources; page show refreshes. This is a runtime/service interface, not the future management screen.
5. Existing lifecycle readiness is exposed as a read-only getter and capability method. Same-context SESSION_LOADED also occurs when a typed operation publishes; it does not remount a plugin or invalidate its own SDK. Nested EXPERIENCE_READY/SESSION_LOADED ordering is covered. Snapshot identity changes invalidate the SDK before a later lifecycle listener runs.
6. Store/import hardening retains the previous version on validation/CAS failure, forces successful URL installs/updates disabled, validates source URLs, rejects local source URLs/kind changes/NUL text/excessive path depth, bounds the manifest and enforces UTF-8. No Node/package-manager code runs during install.
7. The authoring reference catalog now includes a shipped SDK v1 guide/example and SDK implementation reference. See product source `src/native/authoring-examples/browser-extension.md` for exact method names, cleanup contract, scope meaning and practical limits.

## Lightweight validation actually run

With MySQL/PostgreSQL tests disabled:

- `npm --prefix tests run test:unit -- --runInBand extension-runtime extensions-foundation lifecycle-client-p4 prompt-presets --silent --verbose=false` — 5 suites / 58 tests passed. The name pattern also selected the small director-default-prompt-presets suite.
- After adding nested Ready/load/own-command coverage and catalog references: `... --runInBand extension-runtime extensions-foundation --silent --verbose=false` — 2 suites / 18 tests passed, overlapping the earlier run except one new test. **59 distinct unit tests across five suites**.
- `PW_NATIVE_CHANNEL=msedge npm --prefix tests run test:e2e -- e2e/native-session/19-extension-runtime.e2e.js --workers=1` — **1/1 passed**. A disposable local Express/FS fixture uses the actual authenticated Extensions router and production browser module importer. It proves real local-script activation, relative JS import, relative JSON fetch, revision-bound CSS, scope reactivation, listener/mount cleanup and disabled-file rejection. It does not boot the full product UI or exercise a real remote Git clone.
- Changed-file ESLint (17 JS files) passed without warnings/errors after test spacing cleanup. `git diff --check` passed.

An initial jsdom failure came from its missing structuredClone global; the test environment now supplies Node's serialization equivalent. Production uses the browser API. All affected tests then passed.

No full repository regression, global guard sweep, Android, Docker, paid model call or real-user data change. Browser storage is disposable and removed after the test. No binaries/generated artifacts committed. Final broad verification remains deferred until UI and initial Skill contents are complete.

## Boundaries and next checkpoint

User-enabled extensions are trusted browser page code, not a sandbox. Automatic cleanup covers SDK-owned resources and registered cleanup, not arbitrary global side effects or module top-level code. Uncooperative activation/cleanup can remain pending; lifecycle publication and boot do not wait for activation. An in-flight typed authority operation may already have committed before context disposal.

External packages currently support UTF-8 text JS/MJS/CSS/JSON/SVG and other text assets only: 128 files, 4 MiB total, 12 directory levels, no symlinks or binary assets. Module evaluation follows the browser cache; activate runs per Host instance. Same-tab client mutations notify immediately; changes made elsewhere need refresh/reload. No server plugin or dependency installer was added.

Next checkpoint is unified Extensions UI only: one top-level Extensions entrance, Skills/Plugins tabs, External/Local/Built-in categories, stable scope pickers, local .js import/new/edit/enable flows, Skill single-level folders and off/on-demand/always path controls. Reuse the new client/status API and existing Skill editors/store/CAS. Remove duplicate visible entrances while retaining redirect aliases and owning-Work plugin declarations. Validate only touched UI/runtime files plus targeted browser flows. First P0–P9 authoring Skills and final broad verification follow afterward. Main/work-branch hold persists.
