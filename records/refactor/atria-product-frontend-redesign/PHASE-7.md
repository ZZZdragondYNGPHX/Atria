# Frontend redesign — Phase 7 Agents and Utilities

- Date: 2026-09-24
- Branch: `refactor/atria-product-frontend-redesign`
- Main baseline: `402b53a98a823573591db4e9fd015f98e6effbdb`
- Starting HEAD: `a4d08510f3bcd00b5a2caba1459247f5201058e0`
- Implementation HEAD: `a30698dda124eb5544afe7c2e37d0d3f7fd56d6c`
- Status: implemented, validated, committed and pushed. Not merged into main.
- Phases 1–7 complete; Phase 8 outstanding. Stop pending user continuation.

## Delivered

Settings was rebuilt as grouped preference rows, with Theme and Font Scale directly
available. Advanced contains only color-level controls. Controls are moved and
restored with their original listeners and persistence; no generation configuration
is exposed. Related Runtime/Library destinations use WorkspaceHost.

Account now mounts the real profile controller as its primary surface. Identity,
account facts, snapshots, backup/sync and storage have native keyboard-accessible
actions. Loading, unavailable service and Retry are explicit. Destructive controls
remain in a separate disclosure. Backup/storage modal presentation uses product
tokens and compact grouping while keeping existing controllers and permissions.
Canceling profile dialogs no longer creates false diagnostic incidents.

Plugins has Native declaration rows, exact version evidence in Details and an
Advanced extension compatibility area. Extension switches have accessible names,
saving/reload feedback and failure rollback. Built-in product features are not
misclassified as third-party extensions. The Native list has loading, empty,
service-error and Refresh states. A real navigation race found during browser
validation is fixed: an old lazy Plugins mount cannot replace newly opened Settings.

Agents has a clearer hub and one embedded section navigation. Orchestration is
composed from a preset source-list, authoring canvas and optional Inspector; the
compact list starts collapsed. Shared Popup handles preset/agent names and deletion
confirmation. Validation focuses the error. The existing resolver, compile/import/
export/bind/save paths and human authority remain. Run, Memory (Knowledge, Sources,
Maintenance) and Agent Diagnostics use the same controller in the new frame.

Medium/compact Inspector makes covered main content inert, receives focus and
returns it on close. Shell owns embedded Escape/Back; arrow-key section changes
also update the owning route. The existing Environment supplies 719/720 and 1179/
1180 breakpoints, safe area and keyboard viewport. Stale Agents/Diagnostics imports
are rejected by the current WorkspaceHost activation token.

Diagnostics retains Guided, Startup and Expert with semantic mode buttons, module
health disclosure, incident rows, compact detail drill-down and bounded raw logs.
Loading/error feedback and explicit refresh remain in context. Incident/log refresh
preserves focus; export errors do not discard context. Chinese copy is supplied
through the existing localization authorities.

`atria-utilities.css` owns utility presentation; obsolete Shell utility rules were
removed. Embedded Agent presentation remains in the existing domain stylesheet.
No second router, runtime, configuration or persistence system was introduced.
Native Session/generation, exact resources, plugin permissions and all unaffected
Studio/Library/Runtime authorities remain intact.

## Contract and test decisions

The A6 guard's former Account card/Advanced DOM pin was presentation-only. It now
requires the primary Account surface to mount `authority.openUserProfile`; all
other authority guards remain. Utility unit tests assert the actual controller,
retry/disposal behavior, DOM restoration, switch rollback and stale mount isolation.
No behavior guard was deleted to preserve the redesign.

Root AGENTS.md and FORK_MAINTENANCE.md had user/external changes before this phase.
They were read, preserved and excluded from the commit. SillyTavern migration
remains retired. Phase 8 was not implemented.

## Executed validation

- Full Shell unit suite: 26 suites / 115 tests passed.
- Final targeted utility, Agent authority, Diagnostics and lazy account suites:
  9 suites / 44 tests passed (includes the 7 Shell utility cases above).
- Full frontend/backend lint and changed frontend/test lint passed.
- Aggregate `check-p8-model-prompt-integration.mjs` passed: P0–P7, A0–A9, N9/N10,
  exact reads, no dual-write and no hidden Native fallback. This is the existing
  architecture guard, not delivery Phase 8 acceptance.
- Three cold frontend builds passed, including `phase7-build-acceptance`.
- Final Microsoft Edge / Playwright acceptance: 5 tests passed. Compact/Chinese
  polish follow-up: 2 passed. Preset-create follow-up: 1 passed. Compatibility keyboard follow-up: 1 passed.
- `git diff --check` passed.

Real browser coverage: 1440 desktop, 900 medium, 320 compact; Settings persistence
across navigation; Theme/Font Scale visibility; account snapshots/reset cancellation;
backup/storage dialogs; Guided incident capture/detail/Escape, Startup, Expert and
empty filters; preset duplication and shared name popup; Inspector focus/close;
keyboard route updates; Memory Knowledge/Sources/Maintenance; Agent Run/Diagnostics
empty states; gated Account loading and real endpoint failure/retry for Account,
Diagnostics and Native Plugins. Advanced extensions and plugin-owned configuration
were opened at 320px. Existing drawer headers have 44px targets and keyboard activation, with their original handlers/attributes restored on disposal. Assertions check document and domain horizontal overflow.
Chinese/light mode is asserted before each capture, with 20px text, reduced motion,
simulated 24px safe area/420px keyboard viewport and the 720px medium transition.

Screenshots were opened and visually reviewed, not only produced by tests. Final
shots wait for dialog animations and profile loading. Earlier nominal light shots
that were reset by color-picker reconnection were not accepted as light evidence;
the final test sets the existing picker and asserts the resolved appearance.

## Review corrections

Frontend-design followed DESIGN. ui-ux-pro-max reviewed hierarchy, grouped forms,
responsive navigation and dense workflows. Post-implementation
[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
review checked labelled actions, focus, recovery feedback and narrow-screen overflow.
Resolved implementation locations include `utility-workspaces.js` (mount isolation,
profile recovery), `panel.js` (Inspector/focus/route ordering), `userProfile.html`
(native buttons), and `atria-utilities.css` (targets, contrast and overflow).
Emil design-engineering review:

| Before | After | Why |
| --- | --- | --- |
| Account facts were placeholder cards hiding real controls | Actual profile and recovery actions are primary | Reduce navigation and expose useful content |
| Embedded Agents repeated product chrome | One section strip and content-led authoring | Preserve space and hierarchy |
| Compact preset list pushed the editor out of view | Selected preset disclosure starts collapsed | Make narrow screens a deliberate composition |
| Medium Inspector covered focusable main controls | Main is inert; Inspector receives/restores focus | Keyboard position remains visible |
| Arrow navigation changed content without the route | Existing host navigation owns every section change | URL and visible workspace agree |
| Browser prompt/confirm for preset operations | Existing product Popup with scope checks | Consistent focus, mobile keyboard and cancellation |
| Plugin save errors only reached the console | Visible status and switch rollback | Make pending, failed and saved states distinguishable |
| Async Plugins completion replaced a newer destination | Mount before await and discard obsolete work | Rapid navigation remains reliable |
| Account cancel produced an error incident | Cancel exits without an error | Diagnostics reflects actual failures |
| Long diagnostic title clipped at 320px | Wrapping header and flexible action row | Preserve incident context on compact screens |
| Preset rows compressed their labels | Non-shrinking rows with bounded scrolling | Keep names readable at medium widths |
| Legacy extension headers retained gradient borders and small targets | Quiet separator rows with 44px targets and keyboard activation | Keep compatibility controls usable within the same product |
| Inherited checkbox/button styling leaked into utilities | Token-based switches, focus and action states | Consistent interaction feedback |

## Limits and next phase

Safe-area and virtual-keyboard checks are browser simulations, not real Android/
Termux/IME evidence. No Android/Docker build, live external model run, authenticated
multi-account matrix, complete third-party extension catalog, SQL matrix or full
repository test suite was run. Seed data has no declared Native plugin or installed
third-party extension; positive exact-package projection and switch persistence are
covered by unit fixtures, while browser covers empty/error/recovery and existing
compatibility settings. Run/Agent Diagnostics browser coverage uses empty states;
existing Agent authority tests cover immutable run snapshots and preset editing.
Backup/storage retain their existing controller copy, including some Chinese-first
text; their data/storage authority was not rewritten.

Earlier Phase 6 local cleanup was rejected by automatic approval review (`blocked
by policy`). Those existing artifacts are untouched. The Phase 7 cleanup of its own result
directories and cold-build caches was also rejected with `blocked by policy`; no
alternative deletion was attempted. Local Phase 7 test outputs, fixture data and
cold caches remain and are excluded from commits; only selected visual
evidence is stored on docs under `phase-7-images/`.

Next: Phase 8 — Final Acceptance, only after user continuation. Keep this branch,
fetch first and read latest handoff and DESIGN. Perform cross-product regression
and final acceptance; do not redo completed phases or restore migration support.

## Selected screenshots

- [settings-dark-1440](phase-7-images/settings-dark-1440.png)
- [agents-dark-1440](phase-7-images/agents-dark-1440.png)
- [account-dark-1440](phase-7-images/account-dark-1440.png)
- [diagnostics-dark-1440](phase-7-images/diagnostics-dark-1440.png)
- [orchestration-dark-900](phase-7-images/orchestration-dark-900.png)
- [inspector-dark-900](phase-7-images/inspector-dark-900.png)
- [memory-knowledge-900](phase-7-images/memory-knowledge-900.png)
- [incident-320](phase-7-images/incident-320.png)
- [startup-320](phase-7-images/startup-320.png)
- [preset-dialog-320](phase-7-images/preset-dialog-320.png)
- [account-loading-320](phase-7-images/account-loading-320.png)
- [account-error-320](phase-7-images/account-error-320.png)
- [backup-320](phase-7-images/backup-320.png)
- [storage-320](phase-7-images/storage-320.png)
- [settings-zh-light-large-320](phase-7-images/settings-zh-light-large-320.png)
- [account-zh-light-large-320](phase-7-images/account-zh-light-large-320.png)
- [agents-zh-keyboard-320](phase-7-images/agents-zh-keyboard-320.png)
- [agents-zh-medium-720](phase-7-images/agents-zh-medium-720.png)
- [plugins-compatibility-320](phase-7-images/plugins-compatibility-320.png)
- [inspector-320](phase-7-images/inspector-320.png)
