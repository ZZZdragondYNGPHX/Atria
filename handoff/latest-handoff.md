# Active implementation: Atria Game Runtime Architecture Refactor

The Master Refactor has completed **R0-R4** and **R5 is now underway**.

- Working branch: `refactor/game-runtime-architecture`
- Baseline/current main: `63da3141a3895d3386ed1bebc30876c9766315ba`
- Current working HEAD: `d7546b216acff61f796e4cf95fa47c1653f8eef5`
- Formal plan: `refactor/game-runtime-architecture.md`
- Detailed task handoff: `handoff/game-runtime-architecture.md`
- R0 Regex Separation: complete.
- R1 Game Package Foundation: complete.
- R2 World/Event Runtime planned vertical slice: complete.
- R3 Game Logic Runtime: complete.
- R4 Card UI Runtime: complete, including Component/Hybrid/Full, Surface APIs, Selectors, Native Components, responsive/mobile, Immersive and Full recovery.
- R5 foundation already landed: typed Command LLM tool catalog, command visibility metadata, World Observation, branch-anchored Turn Context and live World-session integration.
- New architecture clarification: Game UI uses **Persistent Game Surfaces**, not a special floor-0 message. Conversation floors remain Timeline/history data and optional Native Components.
- New R5 requirement: **Turn Controller / Turn Transaction** must keep Stop, Undo, Delete Assistant Result, Rewrite Narrative, Retry Turn and Switch Variant coherent with World/Event/Memory/Orchestrator state.
- Narrative Cards without `game.json` remain first-class and do not require Game Runtime authoring.
- The long-running refactor branch remains unmerged and must be retained until the complete Master Refactor finishes.

Continue R5 from the current branch; do not restart R0-R4 or the already-landed R5 foundation.

---

# Latest Handoff

## Current state

Atria is an independent SillyTavern-based modified product. All previously recorded product, storage, orchestration, memory, World Info, restore, mobile UI, namespace, and Android / Termux startup work remains integrated. The logging/diagnostics product layer has now been fully refactored: PR #71 adds canonical structured logging, Incident-first diagnostics, Startup Analysis, evidence-based ownership attribution, safe diagnostic export, and high-value failure instrumentation across orchestration, extensions/plugins, memory, worldbook, storage, sync/backup, and editor/studio.

Current authoritative `main`:

- `63da3141a3895d3386ed1bebc30876c9766315ba`

The current main includes all integrations recorded below, including the independent-history cutover, the latest Termux toolbox repairs, and PR #76 uninstall modes. Earlier diagnostics/localization integrations remain unchanged except where later entries explicitly supersede their main SHA.

### Git history independence cutover

A one-time repository-history cutover was completed on 2026-09-20.

- Pre-cutover `main`: `5c52ab839e14d478ce41d976d5afab027578ac03`.
- Final authoritative `main`: `c407f9e97530f587362c2150f7a0c2601598f75e`.
- Final tree: `d709cf1b600ff6f951f19b4be604b29417859703`, identical to the pre-cutover main tree.
- The active Atria `main` no longer has a common ancestor with the legacy `luker` reference branch.
- `luker` remains a reference branch at `91ae97aed557be9439317a67d0ec516f7512fe2e`; do not merge it into `main`.
- `vanilla` remains unchanged at `e07c9e2af1b52f6b0f3dedbd5cc47db78f715ccc`.
- The cutover replayed the 70 authoritative first-parent Atria mainline snapshots after the Luker baseline while dropping legacy and merged side-branch ancestry.
- Commit SHAs before the cutover are historical references only; future branches must start from the live post-cutover `main`.
- Product files, runtime behavior, persistence, configuration, and APIs were unchanged.
- Permanent record: `refactor/git-history-independence-cutover.md`.

### Termux Toolbox repository-origin repair

PR #77 is merged.

- Baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`.
- Validated task HEAD: `76e37c4a3a30a0cfa01599fde69e7180efab9eef`.
- Squash merge / current `main`: `d9cf7600d02d9334717e67992930507fe809b305`.
- Permanent record: `fix/termux-toolbox-repository-url.md`.
- Termux Toolbox install/fetch paths are pinned to `ZZZdragondYNGPHX/Atria`.
- Existing checkouts repair `origin` before toolbox or direct `atria-termux update` fetches.
- The shipped compressed toolbox runtime is regression-checked and already carries the canonical Atria repository URL.
- Clean pre-cutover checkouts with the known legacy ancestry are migrated safely: the old local HEAD is preserved on a `history-cutover-backup-*` branch before `main` is aligned to the independent `origin/main`.
- Ordinary unrelated Git divergence is still not force-reset.
- Initial PR Checks #740 exposed active-code predecessor-name literals; the compatibility code was rewritten without weakening the Atria Migration Guard.
- Final PR Checks #741 passed.
- Android and Docker builds were not run because this fix is limited to shell/Node update logic.

### Termux Toolbox piped-launch TTY fix

PR #78 is merged.

- Baseline: `main@d9cf7600d02d9334717e67992930507fe809b305`.
- Validated task HEAD: `ab233220af82517dfd4ab4268c8a5d7c5db00f97`.
- Squash merge / current `main`: `1dffedf610e03a51512ec59f12a09cd7b9a23f43`.
- Permanent record: `fix/termux-toolbox-tty-input.md`.
- Toolbox version is now v0.3.8.
- Root cause: `curl ... | bash` consumed stdin before the interactive runtime started, so menu `read` calls saw EOF and repeatedly produced empty / invalid selections.
- Fix: the launcher reconnects the runtime stdin to `/dev/tty`; no-TTY launches fail clearly instead of looping.
- PR #77 repository-origin repair and history-cutover handling remain unchanged.
- Final Atria PR Checks #742 passed.
- Android and Docker builds were not run because this fix is limited to shell/Node launcher behavior.

### Termux Toolbox uninstall modes

PR #76 is merged.

- Original baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`.
- Synchronized baseline after PR #77/#78: `main@1dffedf610e03a51512ec59f12a09cd7b9a23f43`.
- Final validated task HEAD: `170f6ad501c6aa100b868e156579f52e96c41931`.
- Squash merge / current `main`: `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Permanent record: `feat/termux-uninstall-modes.md`.
- Toolbox version is now v0.3.9.
- Uninstall management now exposes two product-level flows: remove the active program while preserving user data, or completely remove Atria.
- Keep-data uninstall preserves shared `data`, `backups`, `exports`, and the toolbox.
- Complete uninstall removes both instances, both shared Atria trees, toolbox/autostart, Atria CLI state/entrypoint and only the canonical default Webpack cache.
- Complete uninstall validates Atria-owned deletion targets and requires typed plus randomized confirmation.
- Custom Webpack cache overrides are intentionally preserved.
- Termux and general packages such as Node.js, git and curl are not removed.
- PR #77 repository-origin/history-cutover behavior and PR #78 `/dev/tty` piped-launch behavior remain intact.
- Final Atria PR Checks #743 passed: Atria Migration Guard, ESLint and the complete Node unit suite.
- Android JVM/APK and Docker builds were not run because this task is limited to the Termux shell/toolbox surface.
- Temporary branch `feat/termux-uninstall-modes` was removed after merge.

### Android / Termux startup optimization continuation

The current optimization sequence is complete through the following merged work:

- #30 warm-start frontend fast path;
- #31 stable content-addressed frontend bundle fingerprint;
- #32 Termux-private disposable Webpack cache;
- #33 parallel frontend bootstrap module loading;
- #34 critical frontend module preload;
- #35 process-local version metadata cache;
- #37 loopback frontend-bundle compression bypass;
- #38 version metadata folded into bootstrap;
- #39 extension-discovery startup burst cache;
- #41 WebSocket handshake overlapped with bootstrap;
- #42 loopback traffic bypasses dynamic compression;
- #43 Termux readiness probe uses HEAD;
- #44 first-load loader immediate hide;
- #45 startup milestone telemetry;
- #46 automatic Termux-private Webpack cache plus backend phase timing;
- #47 client startup timing returned to backend logs;
- #48 frontend startup no longer waits for full `window.load`;
- #49 post-visible startup module lazy loading;
- #50 on-demand advanced frontend tools;
- #51 chat and skill tool lazy loading;
- #52 account-management tool lazy loading;
- #53 Request Inspector lazy loading;
- #55 process-local Webpack fingerprint memoization;
- #56 variable-operation panel lazy loading;
- #57 Cropper libraries loaded only for crop UI;
- #54 audio player loaded only for audio attachments;
- #59 Bulk Edit Overlay removed from the initial static graph and its `script.js` cycle broken;
- #58 Select2 + Atria patch moved behind first visible paint, with desktop OpenAI Select2 controls deferred safely.
- #62 Stable Diffusion server router deferred until the first `/api/sd/*` request;
- #63 first-visible client timing plus Termux readiness/browser-open boundary telemetry;
- #64 Search server router deferred until the first `/api/search/*` request;
- #66 LAN Sync server router deferred at the same pre-login authentication boundary;
- #65 Horde server router deferred until the first `/api/horde/*` request.

Permanent records for the final continuation items:

- `performance/android-termux-startup-lazy-audio-player.md`
- `performance/android-termux-startup-lazy-bulk-edit-overlay.md`
- `performance/android-termux-startup-lazy-select2.md`
- `performance/android-termux-startup-static-router-deferral.md`

Important audit conclusions:

- Do not perform superficial lazy imports when another first-screen module still statically imports the same module. This ruled out, among others, `scrapers.js`, `announcements.js`, and `samplerSelect.js`.
- `toolcool-color-picker.js` was not delayed because Quick Reply can synchronously assign custom-element properties before registration; the regression risk is not justified without stronger evidence.
- `pagination.js` remains eager because personas, groups, text-generation model UI, and slash-command helpers use it on normal product paths.
- Stats, logprobs, CFG, migration/safe-mode, and other deeper runtime paths were not reordered merely to chase source-byte reductions.
- Experimental PR #60 (overlap frontend cache check with backend pre-setup) was intentionally closed unmerged after audit: a warm-cache hit now performs only a tiny set of output-stat checks after #55, while overlapping a cache-miss Webpack compile could increase CPU/IO contention.
- PR #61 (remove unused izoomify startup script) was intentionally closed unmerged: the current `vanilla` reference still exposes that global plugin, so the small byte saving did not justify breaking SillyTavern compatibility.
- The 2026-09-20 real-device baseline at `main@ffc2857b9...` reached `server-main.module-evaluated` at +3252ms and `server.listening` at +3868ms, while `pre-setup.total` was only 548ms and the warm frontend cache check was 3ms. This is why #62/#64/#65/#66 target optional static server routers.
- Tokenizers/core generation, Transformers-backed vectors/speech/caption/classify, and the extension Git stack remain measurement-gated because truly removing those dependency graphs would require broader core loading-boundary changes.
- The second 2026-09-20 real-device run on `main@95644b118...` measured `server-main.module-evaluated` at +3546ms and `server.listening` at +4097ms versus +3252ms / +3868ms before router deferral. A single run is not enough to claim regression, but there is no demonstrated win; the router-deferral direction is paused.
- That same run measured readiness HEAD -> browser `GET /` at 12.921s, which occurs before Atria page JavaScript starts. Browser navigation -> first visible Atria UI was about 2.08s; APP_READY was later mainly because the old mixed `batch2Ms` field reported 4463.8ms.
- Different extension `loading_order` groups must remain serial: existing comments document real ST-Prompt-Template / JS-Slash-Runner listener-order compatibility. If extension activation proves dominant, prefetch/modulepreload is preferred over changing execution order.
- Old PR #40 was closed as superseded by already-merged PR #41.

No Android APK/JVM or Docker build was run during this browser/Node startup continuation because those validations are opt-in unless explicitly requested.

### Measurement gate / next action

The third real-device measurement has now been consumed.

On `main@8fd9fb53af028c6453338ae845827df91898122c`:

- `server-main.module-evaluated`: +3828ms;
- `pre-setup.total`: 419ms;
- warm frontend-cache check: 3ms;
- `server.listening`: +4313ms;
- `visibleTotalMs`: 964.6ms;
- `batch2TasksMs`: 4013.2ms;
- `b2BootstrapExtensionsMs`: 3902ms;
- `extActivateMs`: 3831.3ms;
- `firstLoadTotalMs`: 6194.4ms.

This decisively selects the existing extension-activation decision branch: preserve `loading_order` execution semantics and overlap resource preparation instead of changing evaluation order.

PR #69 is merged as `main@9e96c82d01e6291ee469b2834061fd6778a5d235` and now:

- prewarms built-in system extension module graphs with `loading_order >= 100` using `modulepreload`;
- keeps actual extension evaluation in the original loading-order groups;
- excludes third-party extensions from the prewarm path;
- reports `extPrewarmMs`;
- reports `extSlow`, the eight slowest per-extension activation timings.

Permanent record:

- `performance/android-termux-startup-extension-prewarm.md`

Collect the next complete startup log from `main@9e96c82d01e6291ee469b2834061fd6778a5d235`. In addition to the existing backend / launcher / client fields, the most important new values are:

- `extPrewarmMs`;
- `extActivateMs`;
- `extSlow`;
- `b2BootstrapExtensionsMs`;
- `batch2TasksMs`;
- `firstLoadTotalMs`.

Decision rules for the next pass:

- if `extActivateMs` drops materially, keep the preload strategy and use `extSlow` to target only the remaining expensive extension;
- if `extActivateMs` stays high and one Atria extension dominates `extSlow`, move that extension's optional UI/runtime subgraphs behind an on-demand boundary;
- if several high-order Atria extensions remain similarly expensive, inspect their shared static import graph before considering any broader loader change;
- do not parallelize different loading-order groups merely for speed: existing listener-order compatibility remains authoritative;
- do not revive the previously rejected Toolcool Color Picker delay or izoomify removal without new evidence;
- continue treating Android/browser launch delay separately from Atria JS startup.

## Branch roles

- `main`: authoritative Atria development and integration branch.
- `docs`: permanent development documentation and latest handoff.
- `vanilla`: SillyTavern upstream reference only; refresh/use when an upstream comparison or synchronization task requires it.
- `luker`: legacy Luker reference only; refresh/use for migration archaeology or legacy comparison.
- `feat/*`, `fix/*`, `refactor/*`, `chore/*`: temporary branches created from current `main`.

## Development rules

1. Start ordinary work from the live `main` HEAD.
2. Do not use `luker` or `vanilla` as the default development base.
3. New Atria-owned runtime/protocol namespaces should use concise Atria naming such as `atri_*` where practical.
4. Preserve real SillyTavern upstream structures when they are still part of the product/upstream contract.
5. Do not reintroduce predecessor Luker compatibility into Atria-owned runtime state unless a future task explicitly requires it.
6. Product UI should follow the standalone-first policy: host glue stays at adapters, while Workspace views consume stable Atria data/actions.
7. Android builds/tests and Docker image builds are opt-in validation. Run them only when the user explicitly requests them.
8. At task completion, write the implementation record to `docs`, merge into `main`, verify integration, then remove the temporary task branch.

## Current architecture

Atria currently owns and maintains:

- Agent Runtime;
- multi-agent Orchestration Engine;
- four-section Atria Workspace;
- Memory OS / memory graph;
- Workspace Preset Library and scope bindings;
- storage/FloorState extensions;
- generation lifecycle modifications;
- Android integration;
- Termux support;
- SillyTavern upstream integration layer;
- agent-native Web Access backed by Search Tools;
- orchestration runtime API fallback through the Workspace Default API profile.

### Workspace product structure

The current Agent & Memory Workspace has four primary sections:

1. Orchestration
2. Run
3. Memory
4. Diagnostics

The old migration-era Presets / Live Run / Graph / Agents split is no longer the supported information architecture.

The permanent Workspace UI guard and Chromium workflow should be treated as architectural tests, not disposable migration CI.

## Recent completed integrations

### Diagnostics Workspace Chinese localization

- PR #73
- Baseline: `main@b8cd63d0a0f7afd647cd455a7555bf283758fea4`
- Final validated head: `f08032f1c9ecd686e5fc1218f39ec82e4f700ad5`
- Squash merge / current `main`: `fad1dd44c11854861db0a5b2d92335792def8ecc`
- Record: `fixes/logging-workspace-zh-localization.md`
- Guided / Startup / Expert diagnostics UI now has complete zh-CN and zh-TW locale coverage.
- Dynamic module-health, ownership, severity, Startup Analysis phase/scope/timeline labels now pass through i18n instead of bypassing locale dictionaries.
- Raw log text, diagnostic identifiers, evidence and machine-readable export content remain unmodified for diagnostic accuracy.
- `tests/logging/workspace-i18n.test.js` guards both Chinese locale dictionaries.
- Final validation passed Atria PR Checks #717: ESLint, Atria Migration Guard and the complete Node unit suite.
- Android JVM/APK and Docker builds were not run because this task changes browser localization only.

### Logging Observability Workspace Refactor

- PR #71
- Baseline: `main@148950dec7a8ab63229bd1f3c616f82438d165f4`
- Final validated head: `faf9da3a087d59e4560123f9a2db5c15361778b9`
- Squash merge / current `main`: `b8cd63d0a0f7afd647cd455a7555bf283758fea4`
- Record: `features/logging-observability-workspace.md`
- Backend logging now has one canonical bounded store; the legacy backend log-capture facade is removed.
- Frontend logging is split into structured modules; the old frontend manager remains only as a thin compatibility shim for upstream/third-party imports.
- Diagnostics Workspace is Incident-first with Guided / Startup / Expert modes, mobile drill-down, bounded raw-log rendering, one-click summary/full context, and “My problem just happened”.
- Startup Analysis retains up to 20 recent sessions and renders native-SVG scope timing, slow phases, extension breakdown, comparisons and waterfall views.
- Incident ownership is evidence-based across Atria, upstream, third-party extensions, server plugins, external/network/local environments, user configuration and unknown.
- High-value Incident triggers cover generation/dispatch, orchestrator, memory, worldbook, storage, sync/backup, extension/plugin, editor/studio and global frontend failures.
- Extension install/update failure stages distinguish DNS/TLS/connect/timeout/Git/HTTP/manifest/filesystem/conflict rather than collapsing to a generic network error.
- Debug Export uses canonical stores and only safe Request Inspector metadata; full prompts/messages/responses are excluded and secrets are centrally redacted.
- Final validation passed Atria PR Checks #713, Worldbook Performance Foundation #341 and Backup and Storage UI #89.
- The repeated mobile World Info E2E failure was traced to stale bulk-selection state forcing detail mode during Library → Entries transitions; the product-state bug is fixed rather than masked with longer waits.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in.


### Mobile lorebook top-layer action-sheet hardening

- PR #28
- Baseline: `main@f7dd82ee4089e9e59f6effdd61509b14b39daa2d`
- Final validated head: `9f1abf3004e51428ea0be3c9f5a161a9037b6f66`
- Squash merge / current `main`: `653b1b59f771e0c494e73af64f799790c6c3a856`
- Final validated / merged tree: `adad34a4b45a1b5eb3a1463c054cbc0c9dc6f4b1`, identical.
- Record: `fixes/world-info-mobile-book-menu-top-layer.md`
- The lorebook three-dot trigger is an explicit Atria button with synchronized `aria-expanded` state.
- Mobile book actions render in a modal top-layer `dialog` owned by `#WorldInfo`, preventing Library clipping while preserving drawer interaction ownership.
- The sheet has an explicit close action and isolated pointer/click events, and its full-viewport host bottom-aligns the action sheet above mobile navigation.
- A higher-specificity top-layer selector resets the legacy `#WorldInfo .world_info_manager_item_menu` absolute positioning that previously pushed the sheet below the viewport.
- Existing Entries / Export / Rename / Duplicate / Tags / Pin / Delete actions are unchanged.
- Mobile Library / Entries search option controls now use explicit JS-driven menus instead of native `details` disclosure controls.
- Final validation passed Atria PR Checks #587 and Worldbook Performance Foundation #272, including ESLint, complete Node unit tests, Atria Migration Guard, frontend libraries build, focused regressions, benchmark, real-host Chromium smoke and complete World Info browser acceptance.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/tests only.

### Mobile lorebook action-menu reliability fix

- PR #27
- Baseline: `main@75c77b23112fe3ce89d4f28c4ee26b2f20b73769`
- Final validated head: `dcdff643aa30ca161a267b09d06ce34c35315447`
- Squash merge / current `main`: `f7dd82ee4089e9e59f6effdd61509b14b39daa2d`
- Final validated / merged tree: `fb428d5ddf1088bee7bf01498c09a9050baf00c7`, identical.
- Record: `fixes/world-info-mobile-book-menu.md`
- Replaced the per-book nested native `details/summary` control with an explicit Atria button/menu state because the native disclosure did not reliably open on the Android host.
- `aria-expanded` now mirrors the real menu state; opening one book menu closes other book menus.
- Existing Entries / Export / Rename / Duplicate / Tags / Pin / Delete actions remain unchanged.
- Final validation passed Atria PR Checks #566 and Worldbook Performance Foundation #251, including ESLint, complete Node unit tests, Atria Migration Guard, frontend libraries build, focused regressions, benchmark, real-host Chromium smoke and complete World Info browser acceptance.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/tests only.

### World Info mobile controls follow-up

- PR #26
- Baseline: `main@71dc40588f02c96d16d7be64f1e0ccd0223982ba`
- Final validated head: `121ec5fd196dee4a257c6deb0912cd3380cc94c0`
- Squash merge / current `main`: `75c77b23112fe3ce89d4f28c4ee26b2f20b73769`
- Final validated / merged tree: `a81d426e0f158913903dc266520fcd2f8670e214`, identical.
- Record: `fixes/world-info-mobile-controls.md`
- Lorebook cards now expose labeled global enable/disable actions and explicit global-state badges.
- Per-book overflow menus restore Entries, Export, Rename, Duplicate, Tags, Pin/Unpin and Delete.
- Mobile entry search keeps search/help/options on one row; search mode and advanced syntax are proxied through a compact options menu.
- Normal virtual-list mode suppresses legacy pagination while Continuous Cards retains it.
- Final validation passed Atria PR Checks #565 and Worldbook Performance Foundation #250, including ESLint, complete Node unit tests, Atria Migration Guard, frontend libraries build, focused regressions, benchmark, real-host Chromium smoke and complete World Info browser acceptance.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/localization/tests only.

### World Info mobile product UI refactor

- PR #25
- Baseline: `main@59bc6862487331d12378e4fdd1da403a248e12a5`
- Final validated head: `d672ef4e70ada778ba87818804e071501266eab6`
- Squash merge / current `main`: `71dc40588f02c96d16d7be64f1e0ccd0223982ba`
- Final validated / merged tree: `3e2482f496ad6a5f94681addf667bbea4dec88f2`, identical.
- Record: `refactors/world-info-mobile-product-ui.md`
- Library is now book-first: lorebook cards are the primary objects, the whole card opens Entries, activation state is secondary, and activation no longer controls catalogue ordering.
- The duplicated Active Lorebooks strip is hidden in Workspace presentation; bulk book actions are contextual.
- Mobile World Info uses its own compact header and fixed bottom Library / Entries / Global Rules navigation instead of stacking inherited drawer controls.
- Mobile entry browsing retains compact command/search/filter controls; entry detail mode removes those surfaces and gives the Inspector/Content editor the viewport.
- Cross-book entry/content search and advanced syntax remain accessible through a compact Library search-options menu.
- Continuous Cards remains available as a compatibility mode with mobile pagination preserved.
- A real-browser regression caught and prevented a transformed/fixed containing-block bug that initially placed the bottom navigation near the top of the viewport.
- Final validation passed Atria PR Checks #563 and Worldbook Performance Foundation #248, including ESLint, complete Node unit tests, Atria Migration Guard, frontend libraries build, focused regressions, synthetic benchmark, real-host Chromium smoke and complete World Info browser acceptance.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/localization/tests only.

### World Info Workspace Chinese localization

- PR #24
- Baseline: `main@5645020e68c95d37c1ee44a375b22328173948b8`
- Final validated head: `fe91c5692e6fe03d2f6a953ca3d41b8e4264812e`
- Squash merge / current `main`: `59bc6862487331d12378e4fdd1da403a248e12a5`
- Final task tree and merged-main tree are identical.
- Record: `fixes/world-info-workspace-zh-localization.md`
- Workspace-owned navigation, six-section Inspector, summaries/badges, filters, bulk UI, Global Rules, relationship picker, Issues messages, menus and Test Activation now use the existing i18n system.
- Simplified Chinese and Traditional Chinese locale coverage was audited across 124 Workspace / Issues / Test Activation keys with zero missing keys in either locale.
- Deterministic diagnostics stay DOM-independent for Node/Jest by using `globalThis.__i18n.t` only when the browser runtime exposes it and retaining English fallback templates otherwise.
- English fallback behavior retains the existing singular/plural contract (`1 entry` / `N entries`); visible budget-tier enum labels are localized without changing persisted values.
- World Info #34 includes a real zh-CN browser regression for navigation, all six Inspector headings, filters, Issues messages, relationship-picker placeholders and Global Rules.
- Final validation passed Atria PR Checks #547 and Worldbook Performance Foundation #232, including ESLint, frontend libraries build, complete Node unit tests, Atria Migration Guard, focused regressions, benchmark, real-host Chromium smoke and complete World Info browser acceptance.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/locales/tests only.

### World Info Workspace UI refactor

- PR #23
- Baseline: `main@21f11b93f0e165485488236b74072a12c7df0c4e`
- Final validated implementation head: `40be055246e4b423658f0952421a58bdcbea1891`
- Documentation-only final task head: `d9d2c4f12b3745ae396f7d34fb00180727b5faad`
- Squash merge / current `main`: `5645020e68c95d37c1ee44a375b22328173948b8`
- Final task tree and merged-main tree are identical.
- Record: `refactors/world-info-workspace-ui.md`
- `#WIDrawerIcon` now opens a wide responsive World Info Workspace with Library, Entries and Global Rules work areas.
- Entries defaults to a bounded virtual list plus a single Inspector with Basic, Activation, Lifecycle, State-driven, Entry Relationships and Advanced sections.
- Mobile World Info is full-screen and uses explicit entry-list -> entry-detail drill-down rather than a squeezed desktop split.
- State Conditions and State Change Events remain on their existing protocols but are presented together under State-driven.
- Required/Related Entries use a searchable picker that preserves existing reference strings and canonical persistence.
- The Issues filter uses deterministic advisory checks only; it never rewrites or disables user data.
- Test Activation reuses the existing World Info dry-run / Activation Trace runtime rather than implementing a second evaluator.
- Contextual bulk editing defaults supported fields to Keep unchanged; Continuous Cards remains as the paginated compatibility view.
- A synthetic 1000-entry browser smoke verifies bounded DOM growth and no default mass rendering of full editors.
- Final validation passed Atria PR Checks #535 and Worldbook Performance Foundation #220, including complete Node unit tests, ESLint, Atria Migration Guard, focused World Info regressions, benchmark, real-host Chromium smoke and World Info Playwright specs #25–#34.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/tests only.

### Regex engine performance refactor

- PR #22
- Baseline: `main@9b9801ab941f8bb0c08a3cbf52974b045a96da82`
- Final validated head: `345e4f06f6169c7383ae840997775c5cc3dfb669`
- Squash merge / current `main`: `21f11b93f0e165485488236b74072a12c7df0c4e`
- Validated task tree and merged-main tree are identical.
- Record: `refactors/regex-engine-performance.md`
- Static persisted regexes now use bounded cached execution plans with placement and lane/edit/depth narrowing instead of rescanning the complete active rule list for every processed string.
- Plain runtime regex providers remain dynamically evaluated on every call; historical static-before-runtime and sequential replacement ordering are preserved.
- Compiled-regex LRU capacity grows from its 1000 base to cover the active unique-pattern set, capped at 8192 to avoid >1000-rule compile/evict thrashing.
- Duplicate and same-pattern conflict diagnostics are advisory only and use placement × lane bucketing; no rule is automatically deleted, disabled, merged or reordered.
- Regex Editor rows are built in detached fragments, yielding every 80 rows, and attached per source list once.
- Final validation passed Atria Migration Guard, ESLint, frontend libraries build and the complete Node unit suite.
- Android JVM/APK and Docker builds were not run because they remain opt-in and this task changes browser JavaScript/CSS/HTML only.


### Restore UI visibility and five-point recovery retention

- PR #20
- Baseline: `main@aebd6ada8760fea3b07b65ba0f05b5b278b3f471`
- Final validated head: `cdcca4ed1906c60a9063a786e9a02c04d2e758ab`
- Squash merge / current `main`: `892476eb6a694bc5fa89124e0a3de65a86a8c12e`
- Final task tree and merged-main tree: `f59238cb6ddb1514ad2a481111908e64ed25137c`
- Record: `fixes/restore-ui-and-recovery-retention.md`
- `中断并回退` is always visible: disabled while idle, enabled during an active restore, and disabled with a cancelling label during rollback.
- Restore recovery history is capped at five points per account on disk rather than merely truncating the displayed list.
- Existing backlogs are pruned when recovery history is opened/refreshed, and new same-mode/cross-mode recovery points also trigger pruning.
- The current recovery source and newly created undo point are protected while a recovery apply is in progress.
- Recovery points for other accounts are never counted or deleted by another account's retention pass.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.

### yauzl 3.4 primary restore validation

- PR #19
- Baseline: `main@c51d8b779a741f0cf87758b5f8565be581f17556`
- Final validated head: `b2880dfb84cc2441fa3d2c55dc637132f3aac819`
- Squash merge / current `main`: `aebd6ada8760fea3b07b65ba0f05b5b278b3f471`
- Final task tree and merged-main tree: `5105973901122b21eaf33bbca8987d1d31ce69dd`
- Record: `fixes/yauzl-3-4-restore-validation.md`
- `yauzl` is upgraded from the lockfile's 3.3.0 to 3.4.0; 3.3.1 upstream fixed interrupted/destroyed read-stream bugs relevant to the field symptom.
- The old yauzl-local `buffer-crc32` lock entry was removed because 3.4.0 no longer depends on it.
- A permanent regression builds an Atria-style ZIP with `archiver`, then extracts a >1 MiB Unicode worldbook JSON and a 2 MiB binary entry through the primary yauzl stream helper and verifies exact bytes.
- Existing Android staging, watchdog, adaptive fallback, bounded `adm-zip` fallback, manual cancel, and rollback protections remain in place.
- Final validation passed Atria Migration Guard, ESLint, and the complete Node unit suite. The Backup & Storage browser workflow was not path-triggered by this dependency/test-only PR.
- The decisive field check is whether the same Android archive still emits `Entry stream stalled` after updating to this main revision.

### Adaptive restore fallback and manual interrupt rollback

- PR #18
- Baseline: `main@ea757892a2b0e7caf1e8d81cdf0e636a91d35cf5`
- Final validated head: `fd75188f261351db34255aba994757bb6e92e949`
- Squash merge / current `main`: `c51d8b779a741f0cf87758b5f8565be581f17556`
- Final task tree and merged-main tree: `e6407588da5c13a0ba31a425a4b6e1841e562df3`
- Record: `fixes/restore-adaptive-fallback-and-cancel.md`
- The first silent yauzl entry keeps the 15-second diagnostic watchdog; after that first confirmed stall, later primary probes use 1 second before falling back.
- Backup Center exposes a confirmed `中断并回退` action while a restore is active.
- The server owns an AbortController per account restore and exposes `POST /api/users/restore-backup/cancel`.
- Cancellation aborts staging and active entry streams; once mutations have started, the pre-restore recovery point is applied before terminal cancellation is reported.
- Administrator full-restore recovery points include the global third-party extension scope so rollback matches the destructive restore scope.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.
- The temporary `fix/restore-adaptive-fallback` branch was removed after merge.

### Restore ZIP entry stream fallback

- PR #17
- Baseline: `main@c2f2cf9f2e9da8cc7d591dc4d862dcbe888a8baf`
- Final validated head: `bfb2d9623a8997963026c678cd3955141dfbacea`
- Squash merge / current `main`: `ea757892a2b0e7caf1e8d81cdf0e636a91d35cf5`
- Final task tree and merged-main tree: `6ba8e02085d137df95e74e7e77962cfbe5499d50`
- Record: `fixes/restore-entry-stream-fallback.md`
- A selected ZIP entry that produces no data for 15 seconds is actively aborted instead of hanging restore indefinitely.
- The stalled entry is retried through an independent `adm-zip` fallback, bounded to 128 MiB decoded size per entry.
- If fallback also fails, the existing restore failure/rollback path receives the error.
- The reported `为美好的世界献上祝福 - 沙盒 - 1.3.0.json` case was confirmed to stall before JSON parsing, so no worldbook format change was required.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.
- The temporary `fix/restore-entry-stream-fallback` branch was removed after merge.

### Restore lifecycle and repository sentinel preservation

- PR #16
- Baseline: `main@43caed0c7d2d27a18b5de3f851bdfefcafb26dd2`
- Final validated head: `e426ef0f09adeabd660baaa39eba4c955a842c76`
- Squash merge / current `main`: `c2f2cf9f2e9da8cc7d591dc4d862dcbe888a8baf`
- Final task tree and merged-main tree: `1d6d6745aaa9b1956c1c684c7d9d524877ddf9f2`
- Record: `fixes/restore-lifecycle-and-gitkeep.md`
- Destructive full restore preserves/recreates `public/scripts/extensions/third-party/.gitkeep` instead of dirtying the source checkout.
- Toolbox v0.3.3 and `atria-termux update` auto-heal only that exact unstaged sentinel deletion before applying the normal dirty-worktree guard.
- Active archive restore state survives Backup Center popup closure; reopening the panel shows the running task and keeps recovery controls locked.
- Reopened views receive completion/failure state from the original request.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.
- Android JVM tests and Android/Docker builds were not run because they remain opt-in and this task changes Node/frontend/Termux restore logic only.

### Restore lifecycle and Git sentinel preservation

- PR #16
- Baseline: `main@43caed0c7d2d27a18b5de3f851bdfefcafb26dd2`
- Final validated head: `e426ef0f09adeabd660baaa39eba4c955a842c76`
- Squash merge / current `main`: `c2f2cf9f2e9da8cc7d591dc4d862dcbe888a8baf`
- Final task tree and merged-main tree: `1d6d6745aaa9b1956c1c684c7d9d524877ddf9f2`
- Record: `fixes/restore-lifecycle-and-gitkeep.md`
- Destructive full restore preserves/recreates `public/scripts/extensions/third-party/.gitkeep` instead of dirtying the checkout.
- Both Termux update entry points self-heal only that exact unstaged sentinel deletion before applying the normal dirty-worktree guard.
- Archive restore state survives Backup Center popup closure; reopening Backup Center reattaches to the active task and shows the latest progress.
- Recovery controls remain disabled while restore owns the migration lock and unlock when the original task reaches a terminal state.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.
- The temporary `fix/restore-lifecycle-and-gitkeep` branch was removed after merge.

### Android shared-storage archive restore stall

- PR #15
- Baseline: `main@dbaf8f2f397220a4e9544e44df55a114ea408067`
- Final validated head: `c6b143f7d9b55ada9be194a4587e053bc54867dd`
- Squash merge / current `main`: `43caed0c7d2d27a18b5de3f851bdfefcafb26dd2`
- Final task tree and merged-main tree: `5e73acc167d1de065f975b9b43cc3bbdbf93bbea`
- Record: `fixes/android-archive-restore-stall.md`
- Android/shared-storage ZIPs are copied into the internal temporary filesystem before yauzl random-access extraction.
- Local archive restore, LAN migration import, and Data ZIP import share the staging protection.
- Backup Center reports staging and current-entry byte progress instead of only completed-file count.
- Recovery-point controls are disabled while restore holds the migration lock.
- Final validation passed Atria Migration Guard, ESLint, complete Node unit tests, Backup Center Chromium, Browser Storage Chromium, and Server Storage Chromium.
- Android JVM tests and Android/Docker builds were not run because they remain opt-in and this task changes Node/frontend restore logic only.

### Workspace maintenance and archive restore responsiveness

- PR #14
- Baseline: `main@9dc4cf842ca20d95caa07dfefb51efe856ce80f5`
- Final validated head: `2d0ffd0b6863befd2d851c7b664a345f7fa23642`
- Squash merge / current `main`: `dbaf8f2f397220a4e9544e44df55a114ea408067`
- Record: `fixes/workbench-backup-restore-ui.md`
- Obsolete Memory maintenance actions now hide their whole row, including field-help controls.
- Backup restore now requests and renders server NDJSON progress; large Android recovery snapshots use async directory copies instead of blocking `cpSync`.
- Same-mode filesystem restore now holds the migration lock/read-only gate while snapshotting and applying.
- Final validation passed Workspace UI, Backup & Storage UI, Atria Migration Guard, ESLint, and the complete Node unit suite.
- Android/Docker builds were not run because they remain opt-in and the task changed no Android/Kotlin or container-delivery code.

### Atria namespace migration

- PR #3
- Final validated head: `1aa9f0961a785db0b4512a1a9910981436bcc090`
- Resulting `main`: `ed2957eba42fdbd9099eacd15eedf7f94b790fab`
- Record: `features/atria-namespace-migration.md`

### Agent & Memory Workspace redesign

- PR #4
- Baseline: `main@ed2957eba42fdbd9099eacd15eedf7f94b790fab`
- Final validated head: `5f4cd9947e7858b88fed1c2a1ab5f7b36cb1094c`
- Squash merge / current `main`: `b84d411431e72be39099cba1a0a42cde9052c778`
- Final task tree and merged main tree: `cf3fc3a4794e1df0dc62dba5de212cb7f1f09d81`
- Record: `features/atria-workspace-redesign.md`
- Temporary branch `feat/atria-workspace-redesign` has been removed after merge.

Final validation for PR #4 passed:

- ESLint
- full Node unit suite
- Android JVM tests
- Atria Migration Guard
- Workspace IA guard
- Run projection Chromium smoke
- full Workspace UI Chromium smoke
- Run call-count Chromium smoke
- real-host Preset binding persistence E2E


### Termux main-branch pinning

- PR #5
- Baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- Final validated head: `417815c36d5928663bcf5116e706f7230c4856e4`
- Squash merge / current `main`: `a32a2c4e815cb9e9590f303b36423f6e959d8076`
- Record: `fixes/termux-main-branch.md`
- Normal Termux install/update is pinned to `main`; Tag/Commit checkout remains available for explicit debugging or rollback.
- PR Checks run #136 passed Atria Migration Guard, ESLint, full Node unit tests, and Android JVM tests.


### Agent-native Web Access and API fallback

- PR #6
- Original baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- Synchronized baseline before merge: `main@a32a2c4e815cb9e9590f303b36423f6e959d8076`
- Final validated head: `af157c8dd79c358c8e56921d5d0a81e82fc3da5d`
- Squash merge / current `main`: `12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3`
- Record: `features/agent-web-access-api-fallback.md`
- Search Tools remains independent and exposes on-demand Web Access to agents through `search_search` / `search_visit`.
- Main-model web tools remain available without orchestration.
- Pre-request automatic research remains available as an Advanced opt-in path.
- Web evidence is deduplicated per orchestration run without global prompt injection.
- Workspace Default API is a runtime fallback for eligible provider/transport failures after primary retries.
- Final default validation passed ESLint, full Node unit tests, Atria Migration Guard, Workspace IA/projection/UI/call-count Chromium smoke, and real-host Workspace binding E2E.
- Android JVM tests and Android/Docker builds are no longer default validation/build steps; manual workflows remain available.
- Temporary branch `feat/agent-web-access-api-fallback` has been removed after merge.


### Worldbook Performance Foundation

- Foundation PR: #8
- Foundation baseline: `main@65321bb522febd369901127cd2b4b2c9883d4658`
- Foundation final head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`
- Foundation merge: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 continuation PR: #9
- W-04/W-05 baseline: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 final validated head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`
- W-04/W-05 squash merge: `main@03d97d655370b31c2a27dd1235f917deadd6246e`
- P-02–P-05 continuation PR: #10
- P-02–P-05 baseline: `main@03d97d655370b31c2a27dd1235f917deadd6246e`
- P-02–P-05 final validated head: `f752e0e1f532d2796b5b476acc2c57149973ef5a`
- P-02–P-05 squash merge / current `main`: `ff804b53adb514919cc3bfb6ac82334df5fe7cf2`
- Final merged tree: `848d4d8d88717737baec6e1d58abb90379fdf6e9`, identical to the validated task-head tree.
- Record: `features/worldbook-performance-foundation.md`
- P-01 bounded chat snapshots and W-01 through W-05 World Info work are complete.
- P-02 prompt diagnostics now use a lightweight per-chat index and per-message records; heavy prompt bodies are loaded on demand, old arrays migrate lazily and remain rollback-accessible.
- P-03 removes the full-chat message-depth rebuild from the formatting hot path. Latest-message depth is constant-time and the recent visible suffix remains bounded. Completed-message HTML caching / partial Markdown streaming remains deliberately disabled until Atria has a precise formatter revision contract for dynamic Regex, macros, formatter hooks, Showdown settings and DOMPurify hooks.
- P-04 exposes engine-level `getChatRange`, `getChatInfo`, `appendChatMessages` and `patchChatMessages` capabilities with correctness fallbacks.
  - FS uses a disposable byte-offset JSONL index for warm range/info and native append.
  - SQLite/MySQL/PostgreSQL use their native JSON/JSONB operations for range/info/append and whole-message `test/replace/remove`.
  - PR #11 adds crash-safe native FS whole-message `test/replace/remove` using affected-suffix rewrite plus a transient fsynced recovery journal while retaining canonical JSONL.
  - Throttled backups materialize the complete chat only when the throttle actually executes.
- P-05 reuses Memory fact/support projections and builds relation/document/provider indexes once, avoiding repeated full-corpus scans while preserving retrieval semantics and stable RRF ordering.
- Native World Info state integration remains read-only: MVU/LoreState remain the state owners.
- `stateActivation` remains opt-in and defaults off; matched state conditions can sustain scene content without repeated keyword mentions.
- W-04 conservative indexing, dependency bundles, atomic budget selection and W-05 runtime compatibility classification remain unchanged.
- No new default online/per-entry model call was added; existing vectorized semantic recall remains opt-in.
- Final PR #10 validation passed Worldbook Performance Foundation #185 and Atria PR Checks #432.
  - #185: focused P-02/P-03/P-04/P-05 regressions, synthetic benchmark, real-host Chromium smoke, W-04/W-05 real-request and import/export E2E.
  - #432: ESLint, Atria Migration Guard and complete Node unit suite with MySQL 8.4 and PostgreSQL 16.
  - The validated code tree also passed Atria PR Checks #431 with 590 suites / 7,920 tests.
- Synthetic #183 reference measurements on Xeon 6973P / Node 24.20: 10k latest-message depth 1,000 calls median 0.013 ms; 3k-relation Memory fixture (9k corpus docs) corpus median 57.367 ms and ranking median 23.755 ms. These are CI synthetic measurements, not user-device SLA.
- Android JVM tests and Android/Docker image builds were intentionally not run because they remain opt-in.
- Cleanup workflow #10 succeeded and removed the temporary `feat/worldbook-performance-foundation` branch.
- P-03 deeper completed-message HTML caching / partial Markdown streaming is intentionally deferred after review: the safe depth-scan win is already merged, while the remaining path lacks evidence that formatting is the dominant current bottleneck and still needs one exact revision contract spanning runtime Regex providers, macros, MessageFormatter hooks, Showdown rebuilds, DOMPurify hooks/config and per-call sanitizer overrides. Re-open only after real browser/self-profile evidence justifies the invalidation complexity; implement the revision contract before enabling a cache or partial renderer.
- A separate physical-record/segmented-storage migration for near-O(1) arbitrary historical edits is likewise measurement-gated. Start any future performance continuation from the live `main`.


### P-04 FS local whole-message patch continuation

- PR #11
- Baseline: `main@ff804b53adb514919cc3bfb6ac82334df5fe7cf2`
- Final validated head: `0c8e18964acf8b1c85ee41feea4b8c1232994204`
- Squash merge / current `main`: `32227e997c136228477bb4571e828f3852fe8eb1`
- Final merged tree: `7e6dd92fc4cc6943ecded805667c8b3512c6725c`, identical to the task-head tree.
- Record: `features/worldbook-performance-foundation.md`
- FS now supports native whole-message `test/replace/remove` while retaining canonical JSONL.
- Variable-length edits rewrite only the affected suffix and are protected by a transient fsynced `.atria-patch-journal`.
- Pending/uncertain commits roll back; durable committed journals are cleanup-only.
- Startup and first-access recovery are both present.
- LAN Sync excludes recovery journals in both directions and will not delete an in-flight local journal.
- Unsupported shapes/header-growth cases preserve the established atomic full-resource fallback.
- P-04 tail-edit performance regression on a 5,000-message chat enforces read < 1%, write < 2%, and unchanged JSONL inode.
- Final validation passed Worldbook Performance Foundation #199 and Atria PR Checks #446; the validated implementation code tree also passed 591 suites / 7,930 tests on #445.
- Cleanup workflow #11 succeeded after merge and removed the temporary task branch.
- Remaining P-04 boundary: middle/front variable-length edits still scale with the affected suffix. Near-single-message arbitrary historical edits require a separate physical-record/segmented-storage migration task.
- Android JVM tests and Android/Docker image builds were intentionally not run because they remain opt-in.


### World Info author UI Chinese localization

- PR #12
- Baseline: `main@32227e997c136228477bb4571e828f3852fe8eb1`
- Final validated head: `e55659943b59b38b1dff42f0d5b7580f480838a5`
- Squash merge / current `main`: `2c8141a532338eba0756805b741bb258a113043d`
- Final merged tree: `c3ba1507b0ec557797b5e1d38e96991ed0f3d480`, identical to the task-head tree.
- Record: `features/worldbook-performance-foundation.md`
- Simplified/Traditional Chinese now cover Native State Conditions, State Change Events, Selection & Dependencies, dynamic state/event fields and selection/budget hints.
- Persisted World Info enums/extension fields are unchanged; this is localization-only.
- Final validation passed Worldbook Performance Foundation #200 and Atria PR Checks #447 with 591 suites / 7,930 tests.
- Cleanup workflow #12 succeeded and removed `fix/worldbook-zh-localization` after merge.
- Android JVM tests and Android/Docker builds were intentionally not run because they remain opt-in.


### Mobile Atria Workspace launcher repair

- PR #13
- Baseline: `main@2c8141a532338eba0756805b741bb258a113043d`
- Final validated head: `e8a1ccdedb8925ac1e301eccef7e119d1deef8b5`
- Squash merge / current `main`: `9dc4cf842ca20d95caa07dfefb51efe856ce80f5`
- Record: `fixes/atria-workspace-mobile-launcher.md`
- Root cause: on the real mobile host the Workspace mounted with `hidden=false` and visible computed styles but had a 0px bounding-box height because the host combines transformed `html` with fixed-position mobile `body`; `position: fixed; inset: 0` therefore resolved against a zero-height containing block.
- The Workspace now uses explicit mobile viewport geometry, with JS-measured `--doc-height` as the final height authority and viewport units as fallback.
- Workspace overlay z-index is 4100 so it remains above settings drawers at 4000/4005 while native `<dialog>` top-layer surfaces remain above it.
- The real launcher stays direct; no drawer-closing workaround is retained.
- Final validation passed Workspace UI #150, Atria PR Checks #453, and Worldbook Performance Foundation #204.
- The new real-host mobile regression opens Extensions, expands Agent & Memory, clicks the visible Workspace launcher, verifies non-zero geometry, and confirms hit-testing lands on the Workspace.
- No persisted settings, namespaces, memory data, chat data, or storage formats changed.
- Android JVM tests and Android/Docker builds were intentionally not run because they remain opt-in.


### Workspace settings launcher visibility fix

- PR #13
- Baseline: `main@2c8141a532338eba0756805b741bb258a113043d`
- Final validated head: `e8a1ccdedb8925ac1e301eccef7e119d1deef8b5`
- Squash merge / current `main`: `9dc4cf842ca20d95caa07dfefb51efe856ce80f5`
- Final validated / merged tree: `b5052b02d206a35d9d41f390a895c16d72223333`
- Record: `fixes/workspace-settings-entry.md`
- Root cause: on mobile, transformed `html` plus fixed `body` caused the fixed Workspace shell to resolve against a zero-height containing block; the launcher executed correctly but the Workspace bounding box height was 0px.
- The Workspace overlay now uses z-index 4100, above host settings drawers at 4000/4005.
- Mobile Workspace height prefers the JS-measured `--doc-height` with `100dvh` / `100vh` fallback.
- The launcher remains a direct `openWorkspace('Orchestration')` call; no drawer-closing workaround is retained.
- A real-host mobile E2E now opens Extensions, expands Agent & Memory, clicks the actual launcher, verifies non-zero geometry, and verifies top-surface hit testing.
- Final validation passed Workspace UI #150, Atria PR Checks #453 and Worldbook Performance Foundation #204.
- Cleanup workflow #13 succeeded and removed `fix/workspace-settings-entry`.
- No persisted data, Workspace preset schema, memory state, orchestration state or API contract changed.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser/mobile UI layout only.

## Long-lived references

- Former Luker source/reference: `luker`
- SillyTavern upstream reference: `vanilla`

These are reference branches, not ordinary development bases.
