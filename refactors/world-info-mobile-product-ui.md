# World Info Mobile Product UI Refactor

## Task

Refine the World Info Workspace from the live Atria `main` after real mobile-device review. The task keeps the mature World Info runtime stable while replacing the inherited settings/drawer presentation with a clearer product information architecture.

## Branch and baseline

- Temporary branch: `refactor/world-info-mobile-product-ui`
- Baseline: `main@59bc6862487331d12378e4fdd1da403a248e12a5`
- PR: #25
- Final validated head: `d672ef4e70ada778ba87818804e071501266eab6`
- Squash merge / resulting `main`: `71dc40588f02c96d16d7be64f1e0ccd0223982ba`
- Validated task-head tree and merged-main tree: `3e2482f496ad6a5f94681addf667bbea4dec88f2` (identical)

## Product decisions

### Library is a catalogue, not an activation settings panel

- Library presents lorebooks as the primary objects.
- A whole lorebook card opens that book's Entries workspace.
- Global active/inactive state remains available as a secondary card state/action.
- The duplicated Active Lorebooks strip is hidden inside the Workspace.
- Default library ordering is pinned-first then title; activation state no longer controls catalogue order.
- Bulk book actions are contextual and appear only after selection.
- Search by lorebook/tag remains first-class.
- Cross-book entry/content search and advanced syntax remain available on mobile behind a compact search-options menu.

### Entries prioritizes the actual entry list/editor

- Desktop retains the bounded virtual list + single Inspector architecture.
- Mobile keeps a compact command row, search row and quick-filter row while browsing entries.
- Selecting an entry enters detail mode:
  - entry-list chrome disappears;
  - bottom navigation disappears;
  - the Inspector becomes the page;
  - the content editor receives substantially more vertical space.
- Core entry state/header controls remain accessible in a compact horizontal control strip.
- Continuous Cards remains a compatibility mode and keeps its pagination.

### Mobile is an application shell

- The inherited SillyTavern World Info drawer title row is removed from the open mobile Workspace.
- The Workspace owns a compact page header with current context title and close action.
- Library / Entries / Global Rules are a fixed bottom primary navigation.
- Page-specific secondary actions live in compact menus instead of permanent stacked toolbars.
- The mobile nav is reparented/anchored to the Workspace so transformed/fixed host layout cannot resolve it against the wrong containing block.

## Compatibility boundaries

No World Info persistence, API, import/export, activation, selection/dependency, state-condition/event, FloorState or storage schema changed.

Stable native controls and business functions remain the implementation plumbing; the refactor changes the product presentation and navigation hierarchy around them.

## Files

Primary implementation surfaces:

- `public/scripts/world-info/workspace.js`
- `public/scripts/world-info.js`
- `public/css/world-info.css`
- `public/locales/zh-cn.json`
- `public/locales/zh-tw.json`
- `tests/e2e/worldinfo/34-workspace-ui.e2e.js`

## Regression coverage

The real-browser World Info workspace regression now covers:

- Library book-card navigation into Entries;
- removal of the duplicated active-book strip;
- mobile library advanced-search access through the compact options menu;
- full-screen mobile geometry;
- mobile entry-list usable height;
- bottom-nav geometry;
- entry-detail drill-down;
- removal of list/filter/nav chrome in detail mode;
- large content-editor geometry;
- back navigation;
- close behavior;
- existing desktop virtualization, Inspector, Issues, relationships, activation test and Continuous Cards behavior.

## Validation

Final head `d672ef4e70ada778ba87818804e071501266eab6` passed:

- Atria PR Checks #563
  - ESLint;
  - complete Node unit suite;
  - Atria Migration Guard;
  - frontend library build as part of the unit job.
- Worldbook Performance Foundation #248
  - focused World Info/storage/performance regressions;
  - frontend libraries build;
  - synthetic benchmark;
  - isolated real-host Chromium smoke;
  - complete World Info browser acceptance including the updated mobile workspace regression.

Earlier Worldbook runs exposed a real mobile navigation containing-block defect; the regression caught the navigation rendering near the top instead of the viewport bottom. The implementation was corrected by reparenting/anchoring the mobile nav to the Workspace and the final workflow passed.

Android JVM/APK and Docker builds were intentionally not run because repository policy makes them opt-in and this task changes browser JavaScript/CSS/localization/tests only.

## Data / migration impact

None.

This is a UI information-architecture and responsive-layout refactor around the existing World Info engine.
