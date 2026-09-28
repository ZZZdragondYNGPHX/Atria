# Prompt module categories, action menus and return position

Date: 2026-09-25. Baseline main: `5fce29a6b64af519e7d89ee888acedee6de40ba7`.
Task branch: `fix/prompt-module-category-navigation`.
Implementation: `31f91f783e5183eab7d7ad5b4a7d950b957eb5d0`.

## Agreed interaction

User explicitly confirmed the design before implementation: hierarchical category
selector filters modules, parent selection includes all descendant categories,
the top vertical-ellipsis menu creates categories/modules, category and module
actions have separate ellipsis menus, and returning from an editor restores the
list position and selection.

## Implementation

The existing preset authoring owner now renders All modules / Uncategorized /
depth-indented category options. The former always-visible category editing form
and nested action-heavy list are replaced with the selector and compact module
rows. Rows retain full category paths and clickable module names.

Category menu: rename, move parent, delete. Move excludes self and descendants.
Module menu: view/edit parameters, move category, delete. Top menu: create category
and new module. New modules inherit a selected concrete category. Forms reuse
Popup; deletion keeps the existing affected-program/module confirmation and
cascade logic. Empty names are rejected. No storage schema or ownership changes.

Menus have named triggers, menu roles, expanded state, arrow/Home/End navigation,
Escape/focus restoration and outside dismissal. Placement is viewport-bounded;
listeners close on render, navigation and disposal. Existing icons/tokens are used.
Scroll offsets are captured on the real ancestor scroll containers before editing
and restored after Back/save together with filter and module focus. No global
view-state store or parallel resource authority was added.

## Validation actually run

- 13 Jest tests: native/prompt-presets (5), atria-shell/prompt-authoring-p6 (8).
- Edge: existing resource migration plus desktop/mobile nested category lifecycle,
  rename, module move, export/import and cascade deletion: 3 scenarios passed.
- Edge: desktop/mobile 36-module filtering/menu/return scenarios: 2 passed. Covers
  all/uncategorized/empty/parent/grandchild filters, Back and save scroll position
  within 3px, focus, keyboard menu actions, parent-cycle prevention, category move,
  empty-name rejection, creation in selection and delete cancel/confirm.
- Final desktop scenario rerun after correcting root-parent default selection: passed.
- Desktop/mobile screenshots inspected; menu and list have no horizontal overflow.
- Changed JavaScript ESLint, native zh-CN/zh-TW localization coverage and whitespace
  checks passed.

No paid inference, Android, Docker, full repository suite or remote push.
Previous task: `chore/remove-retired-agent-presets.md`.
