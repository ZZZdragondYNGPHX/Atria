# Native Heavy Frontend Refactor — Record

- Task ID: `package/native-heavy-frontend-refactor`
- Primary Workspace: `package`
- Date: 2026-09-28
- Plan: `plans/package/native-heavy-frontend-refactor.md`
- Status: implementation and validation complete; publication in progress
- Asset baseline HEAD: `0f40217ea451b91fdc8327e5a661c813d9d12142`
- Asset result HEAD: `58e8241bf0624c8f0c3d97292e116143f5866159`
- Validated staged asset tree: `f175b6a2e73c5002b5caed57d7c4229fa162cffb`
- Product validation HEAD: `c697532c6a4d54530de023cd65e4c1721efe97b2`

## Implementation

- Fetched the independent `package` workspace and worked only in `native-heavy-frontend-reference`.
- Kept Native Conversation/Composer adjacent in a full-width story stream, with secondary context and scene notes disclosed on demand.
- Added explicit current navigation labels, disabled active navigation controls and labeled compact section/channel selects. Wrapped conditionally hidden select fields to also hide their Native-generated labels.
- Reorganized Church metrics and summaries; added actionable facility/reputation prerequisite explanations.
- Formatted the Host game clock as zero-padded 24-hour time, including day boundaries in schedule records.
- Replaced mixed-channel Phone rendering with three display-only Information Views so other channels no longer consume collection pages or suppress empty-state guidance. Reused identical Schedule and Story Event projections in People to stay within the 16-view budget.
- Added bounded pagination, clear empty/truncation states, draft counts and secondary letter metadata/composition disclosures.
- Added `verify-frontend.mjs`, updated only changed presentation expectations in Phase 2/4 validators, and documented verification plus platform boundaries.

## Preserved authorities

An explicit comparison with the original source confirmed that UI actions, Local State, selectors, opening flow, conversation profile, message blocks and stateVersion are unchanged. Outside the UI, only display Information Views and project `updatedAt` changed. Exact identifiers, World logic, Task definitions, lifecycle, player routing, fixtures and scenarios are unchanged. No installed Package original was mutated and no release was published.

## Executed validation

All final checks passed:

1. Phase 1–6 validators against the isolated product HEAD using Node with `--preserve-symlinks --preserve-symlinks-main`.
2. New frontend validator: document/node budgets, Native slot ownership/order, responsive label wrappers, selected actions, isolated channels, 70-record/64-item projection boundary, unique record identities, pagination configuration, midnight formatting, prerequisite hints and typed-command boundaries.
3. ESLint on `verify-frontend.mjs`, `verify-phase2.mjs` and `verify-phase4.mjs` with the product config and Node/ES module parser options.
4. `git diff --cached --check`.
5. Baseline structural comparison of unchanged state, actions, Tasks and identities.
6. Real `compileUiDocument`/`mountUiDocument` and Atria CSS in the Codex in-app Chromium browser. Edge control was unavailable, so no Edge result is claimed.
   - Inspected desktop 1440px and light-theme 1280px, compact 390px, small phone 375px/320px, tablet 768px and landscape 844×390.
   - No horizontal document overflow in the explicitly measured 320, 375, 768, 844 and 1280px cases.
   - Verified desktop/current navigation, Church prerequisites, Schedule and People content, compact selects and letter disclosures.
   - Verified keyboard selection and Enter disclosure interaction; visible focus was inspected. This is not a screen-reader certification.
   - Verified correct empty Messages/Mail while Social is populated; real repeat pagination expanded 8 to 12 records.
   - Verified empty-form validation, Working feedback, a mocked failed submission, retained draft, successful retry and draft reset.
   - Visible phone buttons measured about 46.8px high at 375px.

The browser harness used recorded source data and explicitly labeled mocked Native host slots and command callbacks. Full installed-session UI, real model generation, device/Android, Docker, large-system-font testing and the full repository test suite were not run. Provider calls: 0. Phase 6 exercised actual Studio validation, preflight, preview, Review gating, Commit and Build inside its isolated test harness; it did not publish an artifact.

## Remaining boundary

UI v2 has no Package custom CSS/font/grid-ratio or heading/aria-current props. Native disclosure hit areas and form busy presentation are Host-owned. This task deliberately stays within that contract; see Package `PLATFORM_GAPS.md` D2. Do not substitute a specially styled HTML mockup for the real Native result.

## Publication

The user configured Git author identity locally. The seven validated asset files were committed as `58e8241bf0624c8f0c3d97292e116143f5866159` on `package`. The independent docs checkout was fast-forwarded to the current remote `docs` before this Plan and Record were committed. Push both branches without force.

Local cleanup note: the temporary browser tab was closed, the viewport override reset and the preview server stopped. The validation worktree, temporary harness and dependency/Package junctions are still present because the cleanup command was rejected by execution policy. Do not recursively delete junction targets; detach only the validation-worktree links and remove task-owned scratch files when permitted. None of these temporary files are staged for commit.
