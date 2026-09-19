# World Info Workspace UI Refactor

## Status

- Task: World Info / Lorebook frontend information-architecture and workspace refactor
- Baseline: `main@21f11b93f0e165485488236b74072a12c7df0c4e`
- Working branch: `refactor/world-info-workspace-ui`
- Design status: approved after multi-round discussion
- Implementation status: not started
- This document is the authoritative implementation plan for the task. Do not restart product design from scratch unless current code proves a specific item infeasible.

## 1. Background

Atria's World Info system has accumulated substantially more capability than the original UI hierarchy was designed to carry.

The current drawer combines, in one vertical surface:

- lorebook library management;
- active-global-lorebook selection;
- global activation/scanning settings;
- per-book entry search/sort/pagination;
- per-entry editing;
- bulk operations;
- activation tracing;
- Atria native state conditions;
- state-change events;
- selection/dependency strategy;
- advanced matching, routing, timing and recursion overrides.

The underlying feature set is useful, but the frontend still reflects incremental additions to a traditional SillyTavern drawer. The primary problem is therefore information architecture rather than a shortage of controls.

The redesign must make large and feature-rich lorebooks easier to browse, edit and diagnose without rewriting the stable World Info runtime.

## 2. Product goals

1. Turn the current World Info drawer into a responsive **World Info Workspace** while preserving `#WIDrawerIcon` as the normal entry point.
2. Separate library-level, book-entry-level and global-engine-level tasks into clear work areas.
3. Make large lorebooks comfortable to browse through a high-density entry list rather than a page of fully expanded editor cards.
4. Make a single entry's behavior understandable through a structured Inspector.
5. Make advanced Atria features discoverable without letting them dominate ordinary editing.
6. Improve mobile behavior deliberately rather than treating it as a compressed desktop layout.
7. Add deterministic diagnostics and activation testing by reusing existing World Info runtime/dry-run/trace capabilities.
8. Preserve current persistence, import/export and activation semantics.

## 3. Explicit non-goals

This task must not redesign or replace:

- `checkWorldInfo()` activation semantics;
- World Info persistence schema;
- World Info REST API formats;
- import/export formats;
- MVU or LoreState ownership of state;
- Atria state-condition/event data contracts;
- selection/dependency data structures;
- FloorState event baselines;
- Worldbook Performance Foundation P-02–P-05 runtime/storage work;
- the existing save/patch model except for thin UI adapters required by the new views.

Do not perform a broad rewrite of `public/scripts/world-info.js` merely because it is large.

## 4. Top-level information architecture

The workspace has three primary work areas:

1. **Library**
2. **Entries**
3. **Global Rules**

Activation Trace and test results are contextual tools, not top-level sections.

### 4.1 Library

The Library replaces the current layered combination of:

- hidden legacy multi-select;
- expandable World Info Manager;
- separate active chips;
- separate book picker/action strip.

The Library owns:

- lorebook search;
- lorebook tags;
- active/inactive status;
- pinning;
- creation/import;
- open/edit;
- bulk enable/disable/delete;
- rename/duplicate/export/delete through contextual actions.

The legacy `#world_info` control may remain as hidden compatibility/state plumbing if required by existing upstream code, but it must no longer define the product UI.

### 4.2 Entries

The Entries workspace is the primary authoring surface.

Desktop default:

- left: high-density entry list;
- right: single-entry Inspector.

Narrow desktop/tablet:

- narrower entry list;
- responsive Inspector forms;
- complex grids collapse appropriately.

Mobile:

- full-screen workspace;
- drill-down navigation: book -> entry list -> entry detail;
- never force the desktop split pane into a phone-width viewport.

A compatibility **Continuous Cards** view remains available for scanning several entries in sequence, but it is not the primary editing architecture.

### 4.3 Global Rules

Move current global activation controls into a dedicated area and group them conceptually:

**Scanning**
- Scan Depth
- Include Names
- global case/whole-word matching defaults where appropriate

**Budget**
- Context %
- Budget Cap
- overflow warning

**Recursion**
- Recursive Scan
- Min Activations
- Max Depth
- Max Recursion Steps

**Selection / Priority**
- insertion strategy
- group scoring

This area configures engine-wide behavior and should not visually sit above normal entry editing.

## 5. Workspace shell

Keep `#WIDrawerIcon` as the canonical launcher.

Opening it should present a wide workspace rather than the old narrow traditional drawer.

Recommended desktop geometry:

- width: responsive, approximately `clamp(960px, 78vw, 1500px)`;
- height: use the available viewport;
- stable edge-attached workspace rather than a large freely draggable floating editor.

Mobile:

- full-screen;
- explicit back navigation;
- top navigation remains reachable;
- destructive/contextual actions avoid cramped permanent toolbars.

The current pin behavior should be preserved conceptually as **Keep workspace open** on desktop. Pin is not required as a primary mobile concept.

## 6. Entries: high-density list

The entry list must optimize discovery rather than expose every editor control.

Each row should prioritize:

- enabled/disabled state;
- memo/title;
- primary keyword summary;
- compact metadata;
- limited semantic badges;
- token count where available.

Example information density:

- title;
- `Normal · 124t`;
- keyword summary;
- optional badges such as `Scene`, `State`, `Deps`.

Do not turn every entry row into a miniature form.

### 6.1 Search

Provide one ordinary search surface.

Default search targets:

- memo/title;
- primary keywords;
- optional/secondary keywords.

Advanced search options may include:

- content;
- UID;
- Automation ID;
- Inclusion Group;
- state path;
- dependency target.

Existing advanced keyword syntax should remain available behind an advanced-search control rather than dominate the basic search experience.

### 6.2 Filters

Primary quick filters:

- All
- Enabled
- Special
- Issues

“Special” should identify entries using nontrivial behavior such as state/event/dependency strategy without producing an excessive set of permanent chips.

### 6.3 Sorting

Prominent/common choices:

- Priority
- Custom
- Title
- Tokens

Existing lower-frequency sort modes remain accessible through “More sorting”, including Depth, Order, UID and Trigger%.

Do not add a persistent modified-at field in the first implementation unless a clean existing metadata source already supports it.

### 6.4 Scale

The design must remain usable for several hundred to roughly one thousand entries.

Prefer a windowed/virtualized list or another bounded-render strategy if practical.

Do not render a thousand complete Inspector/editor forms.

Reuse current pagination/caching/lazy-render foundations where they help rather than replacing them gratuitously.

## 7. Entry Inspector

Use vertical collapsible sections rather than top-level tabs.

Default expanded:

1. Basic
2. Activation

Default collapsed:

3. Lifecycle
4. State-driven
5. Entry Relationships
6. Advanced

Collapsed sections with active configuration should show a compact summary.

Examples:

- `State-driven · 2 conditions · persistent activation`
- `Relationships · 1 required · Scene`
- `Lifecycle · Sticky 3 · Cooldown 2`
- `Advanced · 3 overrides`

### 7.1 Inspector header

The top should summarize the selected entry:

- memo/title;
- enabled state;
- activation type/state;
- limited badges;
- UID;
- token count;
- primary keyword summary.

Contextual actions:

- Test Activation
- Activation Trace
- Duplicate / Move through secondary actions
- destructive actions such as Delete under an overflow menu

Avoid a dense strip of permanent icon-only controls.

### 7.2 Basic

Prioritize:

- Memo / title
- enabled state
- Constant / Normal / Vectorized state
- Content
- Position
- Depth when relevant
- Order
- Probability
- token count
- UID

**Content is the visual center of the Inspector.**

### 7.3 Activation

Group everything that answers “when can this entry match?”:

- Primary Keywords
- Optional / Secondary Keywords
- AND ANY / AND ALL / NOT ANY / NOT ALL
- Character / Tag Filter
- Generation Triggers
- Case Sensitive override
- Whole Words override
- Scan Depth override

Provide a human-readable compact rule summary where feasible. This is explanatory only and must not replace source controls.

### 7.4 Lifecycle

Group:

- Sticky
- Cooldown
- Delay
- Non-recursable
- Prevent further recursion
- Delay until recursion
- Recursion Level
- Ignore Budget

### 7.5 State-driven

Merge the product concept of current:

- Native State Conditions
- State Change Events

into one Inspector section with subviews:

- Conditions
- Change Events

Conditions represent “what the committed state currently is”.

Events represent “what committed state just changed from/to”.

Preserve current provider/path/operator/value and save semantics. Do not invent a parallel state engine.

### 7.6 Entry Relationships

Present current Atria selection/dependency features as one coherent area:

- Required Entries
- Related Entries
- Mutual Exclusion Group
- Budget Tier
- Compact Content

Replace raw hand-authored references such as:

`12`
`Other Book#4`

with a searchable entry picker where possible.

The UI picker should resolve and display human-friendly labels while persisting the existing underlying reference format.

### 7.7 Advanced

Low-frequency controls belong here, including where applicable:

- Outlet Name
- Automation ID
- Group Scoring override
- Inclusion Group
- Group Weight
- lower-level matching/routing overrides
- other existing low-frequency controls that do not belong in the prior conceptual groups

Future advanced fields should default to this area instead of expanding the Basic surface.

## 8. Display modes

The existing fine-grained “hide field” mechanism should no longer be the primary way users make the UI manageable.

Expose:

- **Compact**
- **Standard** (default)
- **Full**
- **Custom**

### Compact

Focus on:

- title
- enabled state
- type
- keywords
- content
- position
- order

### Standard

Use the approved Inspector structure with advanced sections collapsed.

### Full

Make all sections readily visible/expanded for power authors.

### Custom

Expose the existing fine-grained `power_user.world_info_editor_display` controls.

Preserve existing user settings/data where practical. The old capability is demoted, not erased.

## 9. Continuous Cards compatibility view

Keep a Continuous Cards view for users who prefer sequential browsing.

It should be lighter than the current fully expandable card architecture.

A card should emphasize:

- title;
- enable state;
- keyword summary;
- content/preview;
- position/order;
- a few semantic badges;
- “Detailed Edit” -> Inspector.

Complex State Conditions / State Events / Dependencies should not all be expanded inline by default.

Continuous Cards may retain appropriate multi-entry expand/collapse and custom-sort behavior.

## 10. Contextual bulk operations

Remove permanent visual noise from bulk toolbars.

Normal state:

- search
- sort
- new entry
- enter bulk mode / selection

After one or more entries are selected, show a contextual bulk toolbar:

- selected count
- Enable
- Disable
- Move/Copy
- Bulk Edit
- Delete
- Clear/Exit

Desktop: sticky contextual toolbar.

Mobile: bottom contextual action bar where appropriate.

### 10.1 Multi-select Inspector

When several entries are selected, the right-hand Inspector may become a bulk Inspector for supported fields.

Use “keep unchanged” as the safe default for each field.

Do not silently normalize unrelated fields across selected entries.

## 11. Deterministic Issue Checker

Add an advisory **Issues** filter/view.

Initial checks should be deterministic and conservative, such as:

- empty Content;
- normal keyword-driven entry without Primary Keywords;
- required-entry reference does not resolve;
- dependency self-reference;
- incomplete native state condition;
- incomplete state-change event;
- duplicate Automation ID;
- clearly invalid relationship target;
- Compact Content configured without relevant selection/dependency configuration.

Diagnostics must:

- never auto-delete;
- never auto-disable;
- never rewrite user content automatically;
- identify the affected entry and explain the issue.

Avoid speculative “AI quality” judgments in this checker.

## 12. Test Activation

Add **Test Activation** to the Inspector as a first-class authoring tool.

Do not write another activation evaluator.

Reuse existing World Info dry-run / trace / state-evaluation / selection diagnostics.

Present the current-chat result in a human-readable report, for example:

- keyword matched / missed;
- character/tag filter passed / failed;
- generation trigger passed / failed;
- state condition passed / failed;
- dependency availability;
- budget result;
- final would-activate / would-not-activate outcome.

Where existing runtime detail is unavailable, show an honest unknown state rather than inventing a result.

Activation Trace remains available for deeper historical/runtime inspection.

## 13. Visual language

Use a workbench aesthetic rather than a larger settings form.

Principles:

- high information density;
- restrained borders;
- spacing and hierarchy over nested boxes;
- large Content editor;
- clear section headings;
- text labels for important actions;
- icon-only controls only when universally obvious;
- destructive actions visually separated;
- semantic color only for state/warning/error rather than decorative rainbow badges.

### 13.1 Badge limits

Default entry rows should show only high-value badges.

Possible badge families:

- activation type: Constant / Normal / Vector
- Budget Tier when configured
- State
- Event
- Deps
- Disabled

Do not expose every timing/filter/recursion property as a separate badge.

## 14. Responsive behavior

### Wide desktop

- wide workspace;
- entry list approximately 320–380 px;
- remaining width for Inspector.

### Narrow desktop / tablet

- entry list approximately 280 px where feasible;
- Inspector fields collapse from multi-column grids into fewer columns.

### Mobile

Navigation path:

- Workspace -> Library / Entries / Global
- Entries -> entry list
- entry list -> entry detail
- explicit Back action

No forced two-column split.

Bulk actions should be reachable without occupying the entire permanent top bar.

## 15. UI actions to demote or relocate

Retire the current visual hierarchy where the user must navigate through:

`Active World(s) for all chats -> Click to expand -> World Info Manager`

Low-frequency book actions move to contextual/overflow menus:

- Rename
- Duplicate
- Export
- Delete

Low-frequency editor tools move to a Tools menu where appropriate:

- Fill empty Memo/Titles
- Apply current sorting as Order
- Refresh
- display-mode/custom visibility settings

Open All / Close All belong primarily to Continuous Cards mode.

## 16. Compatibility and DOM strategy

Prefer preserving stable existing IDs and established business functions where doing so reduces regression risk.

Examples include existing capabilities around:

- `world_editor_select`
- `world_info_search`
- save/patch paths
- pagination/caches
- state condition/event editing
- selection strategy persistence
- activation trace

The new workspace may wrap or adapt these surfaces.

Do not preserve obsolete visual structure merely to keep markup unchanged, but avoid gratuitously renaming DOM contracts heavily relied on by tests/extensions unless there is a clear adapter/migration plan.

## 17. Code organization

New UI code may be modularized instead of continuing to grow one giant `world-info.js`.

A possible direction:

```
public/scripts/world-info/
    workspace.js
    library-view.js
    entry-list.js
    entry-inspector.js
    global-settings.js
    diagnostics.js
```

This structure is illustrative, not mandatory.

Rules:

- new UI/view-model logic may move into focused modules;
- stable activation/storage logic remains in existing core paths unless extraction is clearly low-risk;
- do not perform a broad mechanical split of all of `world-info.js` in one pass.

## 18. Implementation phases

### Phase WUI-01 — Workspace shell and navigation

- wide responsive World Info workspace;
- Library / Entries / Global Rules navigation;
- mobile full-screen shell and drill-down primitives;
- preserve existing launcher and pin semantics where appropriate.

### Phase WUI-02 — Library

- consolidate Manager and active-world behavior;
- search/tags/active/pin;
- contextual book actions;
- bulk management;
- remove obsolete layered presentation.

### Phase WUI-03 — Entry list

- high-density rows;
- search/filter/sort;
- semantic badges;
- selection;
- scale-safe rendering.

### Phase WUI-04 — Inspector

- Basic / Activation / Lifecycle / State-driven / Relationships / Advanced;
- default folding and summaries;
- contextual actions;
- display modes.

### Phase WUI-05 — Relationships and diagnostics

- searchable dependency picker;
- deterministic Issues checker;
- Test Activation based on existing dry-run/trace.

### Phase WUI-06 — Continuous Cards and responsive polish

- light compatibility view;
- desktop/tablet/mobile layout completion;
- contextual bulk UI;
- remove obsolete/duplicate toolbar presentation.

Implementation may combine adjacent phases when doing so reduces temporary duplication, but validation should remain phase-aware.

## 19. Testing and regression requirements

At minimum add/update coverage for:

### Existing World Info behavior

- book create/import/export/rename/delete;
- active lorebook selection;
- chat/persona/character lore binding;
- entry create/edit/delete/duplicate/move;
- sort/search/pagination;
- bulk edit;
- recursive/vectorized activation;
- state conditions/events;
- selection/dependency persistence.

### New UI

- launcher opens the new workspace;
- top-level Library / Entries / Global navigation;
- selecting a book opens its entry list;
- selecting an entry opens the Inspector;
- desktop split layout has nonzero usable geometry;
- mobile uses drill-down rather than crushed split layout;
- display modes;
- contextual bulk toolbar;
- multi-select safe defaults;
- Issues filter;
- dependency picker persistence;
- Test Activation result surface;
- Continuous Cards compatibility view.

### Scale

Add a browser/UI smoke with a synthetic large lorebook sufficient to catch:

- runaway DOM growth;
- unusable initial render;
- accidental rendering of every full Inspector/editor form.

Do not encode brittle millisecond SLAs unless measurement evidence justifies them.

### Standard validation

- ESLint
- relevant World Info unit tests
- relevant frontend/browser E2E
- complete Node unit suite
- frontend build
- Atria Migration Guard

Android JVM/APK and Docker builds remain opt-in unless implementation touches those surfaces.

## 20. Acceptance criteria

The task is complete when:

1. `#WIDrawerIcon` opens a responsive World Info Workspace.
2. Library, Entries and Global Rules are clearly separated.
3. Desktop Entries uses a high-density list + Inspector by default.
4. Mobile Entries uses drill-down navigation.
5. Inspector uses the six approved conceptual sections.
6. Content is visually prioritized.
7. state conditions/events are presented as one State-driven concept.
8. selection/dependency features are presented as Entry Relationships.
9. raw dependency references have a searchable picker while preserving existing persistence.
10. Compact / Standard / Full / Custom display modes exist.
11. bulk controls are contextual rather than permanent visual clutter.
12. a deterministic Issues view exists.
13. Test Activation reuses current runtime/dry-run logic.
14. Continuous Cards remains available as a lightweight compatibility view.
15. no World Info persistence/API/import/export/runtime semantic migration is introduced.
16. relevant existing E2E behavior remains green.
17. new desktop/mobile workspace regressions are covered.
18. final implementation is documented on `docs`, merged to `main`, verified, and the temporary branch is removed.

## 21. Implementation principle

This is a frontend information-architecture refactor around a mature runtime.

Prefer:

**stable core + thin adapters/view-models + deliberate new UI**

over:

**rewrite the World Info engine while redesigning the UI**.

When a UI requirement conflicts with existing behavior, first determine whether an adapter can expose the behavior cleanly before changing the underlying engine.
