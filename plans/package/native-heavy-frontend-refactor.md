# Native Heavy Frontend Refactor — Plan

- Task ID: `package/native-heavy-frontend-refactor`
- Primary Workspace: `package`
- Status: implementation scope based on the requested frontend refactor
- Baseline: `package@0f40217ea`; product compatibility: `main@c697532c6`
- Date: 2026-09-28

## Goal and boundaries
Make the Sanctuary reference story-first and usable with the real Native UI v2, not an alternate HTML frontend. Change Package UI and display projections only. Preserve World logic, lifecycle, model Tasks, exact resource identities, stateVersion, Native slots and scenarios. No product-source change, provider call or release publication. The unreleased Package version stays `0.6.0-phase6`.

## Design
Inherit Atria tokens: canvas `#0e0f12`, surface `#16171b`, raised surface `#1d1e23`, accent `#5b68f0`, success `#3ccf86`, danger `#ff6b61`. These are reference defaults, not Package overrides. Typography inherits `--atri-font-sans`; prose keeps the Native novel reader profile. Respect light/dark/custom player themes.

A custom editorial heading/sidebar proposal was rejected because UI v2 does not support styling, semantic heading props or column ratios. Use an uninterrupted story stream instead of an equal-width dashboard rail. Do not inject styling to make the preview misleading.

    Sanctuary / section navigation (select on compact screens)
    Current scene + live clock
    Native conversation
    Native composer
    > Around you (secondary context)

Left-align content. Keep secondary scene/letter/story details collapsed. Expose selected navigation, action prerequisites, character counters, clear empty states and bounded lists. No new animation. Separate Phone channels before pagination using existing Information View authority. Reuse Schedule and Story Event projections on People instead of duplicating those identical views, keeping the total within the 16-view contract.

## Validation
Run Phase 1–6, add targeted refactor coverage, inspect real Native renderer + Atria CSS in Edge at desktop/compact/mobile widths and light/dark themes. Check keyboard, empty/loading/error/retry, pagination and mutation behavior. Label mocked slots in component preview; no claim of installed-session/provider playtesting.

## Execution
One implementation/validation cycle. Publish verified Package source and one Record. Preserve the unrelated live CI-fix HANDOFF.
