# World Info Workspace UI Refactor

## Task

Refactor the traditional SillyTavern World Info drawer presentation into a responsive Atria World Info Workspace without changing World Info persistence, API, import/export, state ownership, activation semantics, or the completed Worldbook Performance Foundation runtime/storage work.

- Baseline: `main@21f11b93f0e165485488236b74072a12c7df0c4e`
- Task branch: `refactor/world-info-workspace-ui`
- PR: #23
- Final validated implementation head: `40be055246e4b423658f0952421a58bdcbea1891`
- Documentation-only task head after validation: `d9d2c4f12b3745ae396f7d34fb00180727b5faad`
- Squash merge / resulting `main`: `5645020e68c95d37c1ee44a375b22328173948b8`
- Final task tree is identical to the merged `main` tree.

## Implementation

### Workspace shell

`#WIDrawerIcon` remains the canonical launcher, but the World Info surface now presents a wide responsive workspace with three primary areas:

1. Library
2. Entries
3. Global Rules

Desktop uses a wide edge-attached workbench. Mobile uses a full-screen workspace with explicit drill-down navigation and an internal Close action that forwards to the existing World Info drawer toggle contract.

### Library

The existing World Info Manager remains the authoritative behavior source, but is presented as the Library work area.

The Library preserves:

- lorebook create/import;
- active/inactive global state;
- tags and pinning;
- open/edit;
- bulk management;
- rename/duplicate/export/delete through lower-noise contextual actions.

Existing manager state and book bindings are reused rather than migrated.

### Entries list

The default Entries experience is now:

- a high-density left-side entry list;
- one full entry Inspector on the right.

The list uses bounded virtual rendering rather than materializing one complete editor per entry. A synthetic 1000-entry browser smoke verifies that the default Workspace does not inflate into hundreds of full `.world_entry` editors.

Quick filters are:

- All
- Enabled
- Special
- Issues

Existing search, sort, save/patch, pagination and lazy-build foundations are reused.

### Entry Inspector

The single-entry Inspector uses the approved six sections:

1. Basic
2. Activation
3. Lifecycle
4. State-driven
5. Entry Relationships
6. Advanced

Basic and Activation open by default. Lower-frequency sections are collapsed with compact summaries.

Content is visually prioritized as the main authoring field.

Display modes:

- Compact
- Standard
- Full
- Custom

Custom keeps the existing fine-grained World Info display controls available instead of deleting the underlying capability.

Entry-level Move/Copy, Duplicate and Delete are available through a contextual overflow surface rather than a permanent icon strip.

### State-driven

Existing Native State Conditions and State Change Events are presented together under State-driven while retaining their original data contracts and save semantics.

No parallel state engine was introduced. MVU / LoreState ownership remains unchanged.

### Entry Relationships

Existing Required Entries, Related Entries, Mutual Exclusion Group, Budget Tier and Compact Content remain on their existing persistence model.

The Workspace adds a searchable relationship picker that displays human-friendly entry labels but writes the same underlying reference strings.

### Diagnostics

A deterministic authoring diagnostics module powers the Issues filter.

Initial checks cover:

- empty Content;
- normal keyword-driven entry without Primary Keywords;
- invalid same-book relationship target;
- dependency self-reference;
- incomplete state condition;
- incomplete state-change event;
- duplicate Automation ID;
- Compact Content without relationship configuration.

Cross-book references are not falsely reported unresolved when the referenced book is not loaded.

Diagnostics never mutate user data.

### Test Activation

Test Activation is an Inspector action backed by the existing World Info dry-run / trace path.

The implementation filters the dry-run to the selected entry and surfaces existing trace detail such as keyword source, secondary-key matching, inclusion group, probability and budget where the runtime already provides it.

No second activation evaluator was added.

Activation Trace remains a deeper contextual action.

### Bulk editing

The old permanently visible bulk surface is replaced by contextual selection behavior.

Normal state exposes ordinary authoring controls and a Select filtered action. After selection:

- the bulk toolbar becomes visible;
- the Inspector switches to a safe Bulk Inspector for multi-select;
- supported fields default to Keep unchanged;
- mobile presents the bulk state through the drill-down workspace.

Existing bulk mutation logic remains authoritative.

### Continuous Cards compatibility

Continuous Cards remains available as an explicit compatibility / sequential-browsing view.

It reuses the existing paginated card renderer and lazy editor path. The default Workspace no longer depends on rendering the full card set.

### Global Rules

The existing global World Info controls are regrouped into:

- Scanning
- Budget
- Recursion
- Selection / Priority

Control IDs and event bindings remain intact so existing runtime behavior is preserved.

## Code organization

New view-model / UI logic is isolated under:

- `public/scripts/world-info/workspace.js`
- `public/scripts/world-info/diagnostics.js`

`public/scripts/world-info.js` only gained thin integration adapters for:

- Workspace synchronization;
- single Inspector mounting;
- contextual selection synchronization;
- Test Activation;
- Activation Trace forwarding.

The World Info engine was not broadly split or rewritten.

## Compatibility / data impact

- No World Info persistence schema change.
- No REST/API format change.
- No import/export format change.
- No `checkWorldInfo()` semantic rewrite.
- No State Conditions / State Events protocol change.
- No Selection Strategy data migration.
- No FloorState event-baseline change.
- No MVU / LoreState ownership change.
- Existing stable DOM/business-function contracts such as `#WIDrawerIcon`, `#world_editor_select`, save/patch paths and pagination remain available through wrappers/adapters where required.
- Android JVM/APK and Docker builds were intentionally not run because they remain opt-in and this task changes browser JavaScript/CSS/tests only.

## Validation

Final validated implementation head: `40be055246e4b423658f0952421a58bdcbea1891`.

The documentation-only task head `d9d2c4f12b3745ae396f7d34fb00180727b5faad` was subsequently revalidated before merge.

### Atria PR Checks #535

Passed:

- ESLint
- frontend libraries build
- complete Node unit suite
- Atria Migration Guard

### Worldbook Performance Foundation #220

Passed:

- focused World Info / performance regression suites
- synthetic performance baseline
- real-host Chromium runtime smoke
- World Info browser acceptance specs #25 through #34
- desktop Workspace geometry/navigation
- mobile drill-down and close behavior
- Compact / Standard / Full / Custom modes
- contextual bulk behavior
- Issues filter
- relationship picker persistence
- Test Activation
- Continuous Cards
- 1000-entry bounded-DOM Workspace smoke

During validation, test adaptations were made where the new approved information architecture intentionally changes visibility or navigation, including Global Rules recursion controls, collapsed State-driven sections, virtualized entry rows, and explicit Continuous Cards compatibility mode.

## Known boundary

Continuous Cards intentionally remains the existing compatibility renderer rather than a second fully redesigned advanced-edit surface. The primary advanced-edit architecture is the single-entry Inspector.

The Workspace does not add speculative modified-at metadata or a parallel World Info engine.

## Follow-up

No mandatory follow-up is required for this refactor. Future World Info UI additions should prefer the Workspace modules and keep runtime/state/storage behavior behind stable adapters.
