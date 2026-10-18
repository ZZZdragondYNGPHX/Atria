# Browser extension runtime and SDK checkpoint

Updated: 2026-09-27. Approved plan step 3 complete; unified management UI and first authoring Skills remain pending.

- Branch: `feat/native-experience-modes-capability-deepening`.
- Baseline: `db0369deaf2b296f2e5361b88460fd047536f505`.
- Result: `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` (pushed).
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`; no merge or branch deletion, all prior commits preserved.

## Delivered

1. `extension-runtime.js` imports enabled Local/External ES modules through the existing authenticated revision-bound file route and invokes `activate(sdk)`. Global / Prompt preset / Work matching is OR; multiple matches activate once. Identity/version changes, edit/disable/delete and refresh retire old activations. Late imports never activate; late activation cleanup still runs; known asynchronous cleanup completes before the next instance of the same ID starts. Failures are isolated and inspectable.
2. `extension-sdk.js` v1 owns DOM mounts/styles, event subscriptions, DOM listeners, timers and cleanup registration. SDK native methods delegate to existing typed lifecycle/Activity/Scene/Continuity/Realm and projection APIs. No raw state-write method, new Session/World store or generation entrypoint was introduced. Already-admitted Native operations are not rolled back by SDK disposal; late results are rejected.
3. `extensions-host.js` subscribes to existing Session lifecycle, Runtime configuration and extension management notifications; there is no polling scheduler. It forwards only identity metadata to extension event listeners. Preset identity comes from the primary narrator route's existing PromptPresetStore ownership lookup via `/prompt-scope` (same authority as `/regex-scopes`). Work identity is entire Package ID; context also anchors Session/branch/exact version/entry point/history/readiness. Per-call route overrides are not Host preset scopes.
4. Startup loads the Host after APP_READY without blocking the boot barrier. Existing shell legacy-recovery mode skips it. `Atria.extensions` exposes client, refresh, status and subscriptions. Page hide suspends resources; page show refreshes. This is a runtime/service interface, not the future management screen.
5. Existing lifecycle readiness is exposed as a read-only getter and capability method. Nested EXPERIENCE_READY/SESSION_LOADED ordering is covered.
6. No Node/package-manager code runs during install.
7. The authoring reference catalog now includes a shipped SDK v1 guide/example and SDK implementation reference. See product source `src/native/authoring-examples/browser-extension.md` for exact method names, cleanup contract, scope meaning and practical limits.

## Boundaries and next checkpoint

User-enabled extensions are trusted browser page code, not a sandbox. Automatic cleanup covers SDK-owned resources and registered cleanup, not arbitrary global side effects or module top-level code. Uncooperative activation/cleanup can remain pending; lifecycle publication and boot do not wait for activation. An in-flight typed authority operation may already have committed before context disposal.

External packages currently support UTF-8 text JS/MJS/CSS/JSON/SVG and other text assets only: 128 files, 4 MiB total, 12 directory levels, no symlinks or binary assets. Module evaluation follows the browser cache; activate runs per Host instance. Same-tab client mutations notify immediately; changes made elsewhere need refresh/reload. No server plugin or dependency installer was added.

Next checkpoint is unified Extensions UI only: one top-level Extensions entrance, Skills/Plugins tabs, External/Local/Built-in categories, stable scope pickers, local .js import/new/edit/enable flows, Skill single-level folders and off/on-demand/always path controls. Reuse the new client/status API and existing Skill editors/store/CAS. Remove duplicate visible entrances while retaining redirect aliases and owning-Work plugin declarations. Main/work-branch hold persists.
