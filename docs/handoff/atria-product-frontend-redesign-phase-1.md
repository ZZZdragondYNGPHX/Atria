# Frontend redesign — Phase 1 complete

- Date: 2026-09-24
- Task branch: `refactor/atria-product-frontend-redesign`
- Baseline: `main@c664eded79b86df37bd951f1e5236a4335ce784b`
- Inherited branch HEAD: `2bddc01e848c02315d20f1407b7936953b4627ec`
- Scope: design foundations and responsive product frame only.
- Checkpoint: stop after Phase 1; Phase 2 requires the user's continuation.
- Design: `docs/plans/atria-product-frontend-redesign-design.md`.

## Takeover and delivery

Claude left the design specification, tokens, appearance resolver, SVG icons,
shared component builders/styles and rewritten Shell in the uncommitted working
tree. First screenshots and shell unit checks existed, followed by unfinished
visual fixes; no implementation commit or phase handoff existed.

This checkpoint completes the sidebar/rail, toolbar, compact tab bar and utility
menu, default-closed inspector, shared Dock/Sheet, searchable keyboard-operated
command surface, state panels and theme lifecycle. Existing routing, Native
generation ABI and persistence authorities remain in place. Shared components
have their own stylesheet; domain CSS extraction belongs to later domain phases.

Takeover fixes remove the legacy root transform/perspective while the new frame
is active. Together with root overflow containment, this prevents a hidden legacy
drawer and focus restoration from shifting the entire 320px page. Recovery
unmount removes the appearance attribute and restores the legacy root rules.

Presentation tests now assert a default-closed inspector, the current Shell title,
the `build` domain and the visible Native landing rather than a visible legacy
composer. Native ABI uniqueness, nonzero geometry, remount identity and game host
ownership assertions are retained. Keyboard shrinking focuses the actual search
field. New tests cover live theme changes/disposal and 320px focus alignment.

## Validation actually executed

- Shell Jest: **24 suites, 96 tests passed** (`--roots atria-shell --runInBand`).
- `check-p8-model-prompt-integration.mjs`: **passed**, including P0-P7,
  A0-A9 and N9/N10 guards.
- Root `npm run lint`: **passed**; targeted lint of all four changed test files:
  **passed**.
- Cold frontend webpack build with a fresh isolated data root: **passed**.
- Real Edge through Playwright, `01-foundation.e2e.js` and
  `04-navigation.e2e.js`: **13 passed**. Includes desktop/compact navigation,
  history/reload, Dock/Sheet, Escape order, simulated visual-viewport keyboard,
  immersive/Full/Hybrid hosts, remount identity and the legacy Library forwarder.
- Isolated local server: real page captures of Play, Library, Runtime and Settings
  at 1440, 1024 and 390px; interactive inspection at 1440, 900, 390 and 320px.
  Search/Enter/Escape, inspector open/close, compact utility menu and light theme
  switching passed. Final document/Shell widths match each viewport with zero
  horizontal offset. Screenshots were inspected after the narrow-width fix,
  with finite animations completed for transient-surface captures.
- `git diff --check`: **passed**.

Initial browser attempts exposed stale visible-product expectations in tests;
these were corrected to the current Native landing. The first broad run was
interrupted while collecting failure traces; the final complete 13-test run used
Edge with video/trace disabled and failure screenshots enabled. Local screenshot
and scratch artifacts remain ignored, outside the committed deliverable.

## Remaining scope

Phases 2-8 are not delivered: entry/login/onboarding, Play/Game content redesign,
Library, Runtime, full Studio, Agents/utilities, and final cross-product acceptance.
Domain pages still contain old layouts and mixed-language content. This is a
Phase 1 frame checkpoint, not a completed full-product redesign.

No Android/Docker builds, physical-device/IME validation, live generation calls,
full repository unit suite or final cross-product E2E acceptance were run.
No data migration, new preference store or main integration is included.
