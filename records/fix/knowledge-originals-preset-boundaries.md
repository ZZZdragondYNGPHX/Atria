# Knowledge originals and preset boundaries

Date: 2026-09-25.
Baseline main: `7a7b96d898b2c8bc317bd5d3f4642dc291da2ec6`.
Implementation: `17b443faa`. Task branch: `fix/knowledge-originals-preset-boundaries`.

## Confirmed product contract

- Installed Work World originals remain read-only. Changing World parameters or its Knowledge bindings requires an editable World copy.
- Knowledge, including installed Work originals, supports direct entry creation, editing, enable/disable and deletion. Saving updates the actual installed package content, not a personal override.
- Editing Knowledge keeps World parameters, binding identities/policies and existing progress intact. Subsequent generation in existing and new sessions sees edited Knowledge.
- World labels and empty states are localized; authored resource names are preserved.
- Inside a preset, program/module/generation editors and selectors show only that preset. Removed the global Copy existing module picker. Whole-preset import/export belongs to the preset list.

## Implementation and data behavior

 It builds and installs a real new archive with the edited Knowledge, retains source files/assets and exact World snapshots, retargets package-scoped references, and publishes the new current package version together with updated Work resource defaults. Older immutable package archives remain available for pinned history. No PackageState personal Knowledge override was introduced.

Explicit edits record Knowledge revision ancestry in package metadata. Current Session loads adopt only those explicit edits to bound package Knowledge, via package-kind snapshots in the existing revision-backed KnowledgeBindingSet. Ordinary author package upgrades remain pinned. Historical revision reads do not adopt current edits. Portable saves include the adopted Knowledge snapshots, and can be restored with the original package archive. Existing Library Knowledge pinning semantics are unchanged.

Package Knowledge browsing resolves the current installed original; the list hides obsolete package Knowledge versions. World original browsing remains exact and read-only. Saving from the UI reloads the active same-package session; active generation must stop before saving.

Preset internal module copying from a global catalog was removed.
