# World Info Mobile Product UI Refactor

## Task

Refine the World Info Workspace from the live Atria `main` after real mobile-device review. The task keeps the mature World Info runtime stable while replacing the inherited settings/drawer presentation with a clearer product information architecture.

## Branch and baseline

- Temporary branch: `refactor/world-info-mobile-product-ui`
- Baseline: `main@59bc6862487331d12378e4fdd1da403a248e12a5`
- PR: #25
- Squash merge / resulting `main`: `71dc40588f02c96d16d7be64f1e0ccd0223982ba`

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

## Data / migration impact

None.

This is a UI information-architecture and responsive-layout refactor around the existing World Info engine.
