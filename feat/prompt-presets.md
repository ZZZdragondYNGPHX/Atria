# Isolated Native Prompt presets

Date: 2026-09-25. Repository: ZZZdragondYNGPHX/Atria.
Task branch: `feat/prompt-presets`.
Baseline: `23bfdc608b5e5ee2b6b863f116d118d529b0bab9` (fetched before editing).
Implementation: `416474080`.
Integrated main: `7a7b96d898b2c8bc317bd5d3f4642dc291da2ec6`.
Status: complete; main pushed. The integrated tree exactly matches the verified task branch. Task branch removed locally; it was never pushed remotely.

## Accepted product contract

The user explicitly approved this discussion before implementation:

- Each preset owns one Prompt program suite, its modules, and one Generation Profile. Categories belong to that preset. Different presets cannot share mutable authoring ownership.
- Library exposes Prompt Presets instead of the separate Prompt Programs / Prompt Modules / Generation Profiles sections. A preset opens those three areas; program and generation areas show their parameter editors directly.
- Module categories support nesting, creation, renaming and recursive deletion. Modules can move between categories or remain uncategorized.
- Deleting a category lists modules and affected programs in the confirmation, removes descendant categories and modules from the preset, and removes corresponding stage/derive references from the program suite in the same save.
- Import preserves authored category hierarchy and assigned membership. If every module is unclassified, create a top-level category named after the main program. If only some modules are unclassified, leave those modules unclassified.
- Export includes the program suite, all modules, one generation configuration and taxonomy. Repeated imports receive independent identities.

### 2026-09-25 Native Regex scope extension

The accepted preset contract now also owns `regexScripts` on its existing Library
main-program root. Preset import installs Program, Modules, Generation Profile
and Regex together; export carries all of them. The interior adds a fourth
Preset Regex section using the shared Regex editor. Account enabled-rule groups
remain separate from Prompt Presets. Current Regex follows the preset selected
on the primary narrator Runtime Route without changing pinned Prompt revisions.
Deleting a preset clears its rules and ownership, archives roots, and preserves
immutable Prompt history. Global rules are never mutated by these actions.

Authoritative ownership, Game persistence, ordering, duplicate-ID and lifecycle
rules: [Native Regex scopes](native-regex-scopes.md). This extension supersedes
the earlier three-interior-areas description and adds `regexScripts` to the
`atria.prompt-preset` interchange schema (schemaVersion remains 1; omission is
an empty array for previously exported files).

## Implementation

`PromptPresetStore` uses existing Native versioned JSON Library roots and immutable revision records. The main program root stores the preset membership manifest and taxonomy; owned roots carry `presetOwner`. There is no new database, localStorage authority, generation engine or legacy preset-manager dependency.

Publication reuses `withRuntimeWrite` and the storage engine transaction. It validates the complete closure before writing, rejects stale expected revisions and cross-preset ownership, creates exact immutable definitions, rewrites internal references, then updates roots. Imported resource identities are always new; module ID ordering preserves compiler tie-break order. Parent programs are allowed only as part of the main inheritance chain. Category cycles, excessive depth, dangling refs and multiple generation profiles are rejected.

Removed modules leave active preset membership and their Library roots become archived. Historical definitions remain available for pinned Runtime/Project/Session consumers. Their exact historical programs are not rewritten. Current preset program references are removed together with module membership, so the editable program remains valid. Generic resource commit/archive/delete cannot bypass preset ownership.

The authenticated `/api/native/generation/presets` API lists, creates/imports, reads/exports and updates presets. Runtime route editing offers an atomic preset picker for the program + generation pair, and route saves reject pairs owned by different presets. Existing non-preset exact routes remain compatible and are not silently retargeted.

The Library page reuses Native Prompt editors and existing design tokens. Existing resources can be explicitly copied into an independent preset, with a chosen program and generation profile; standalone modules can also be copied into a preset without sharing identity. Existing exact resource/search links retain the historical inspector and offer an Open preset action for owned resources. Old section triggers redirect to Prompt Presets. Simplified/Traditional Chinese copy is included.

## Import/export and migration

The interchange is Native JSON `{ format: "atria.prompt-preset", schemaVersion: 1, programId, entries, categories, moduleCategories }`. It contains definitions, not Connections, Models or Secrets. This task does not add an arbitrary SillyTavern legacy preset converter.

Existing standalone Library/Project/Package resources are preserved. Use the preset page's existing-resource migration picker to make an independent copy, then choose that preset in Runtime to switch a route. The migration does not guess which standalone generation profile belongs to a program and does not change existing exact bindings automatically.

## Verification actually run

- New real-FsEngine preset + authenticated HTTP tests: 3 passed. Independent import/edit, all-unclassified fallback, empty category preservation, mixed classified/unclassified import, export/import, exact historical readability, cross-owner rejection, same-preset route pairing, stale writes, authentication, category cycles and malformed closure validation.
- Existing Prompt resource persistence: 6 passed; Prompt editor: 8 passed.
- Native generation HTTP/transport and configuration suite: 29 passed (local fixture transport; no paid inference).
- Library adapter: 3 passed; Runtime workspace: 12 passed; WorkspaceHost: 11 passed. Old expected navigation labels were updated to the accepted new entry point.
- Real Edge browser, 1440px and 390px: 2 scenarios passed. Create preset, nested category CRUD, module authoring/movement, program attachment, complete export/import, affected-program deletion confirmation, isolation, historical inspector → owning preset navigation, and paired Runtime selection. Rendered desktop/mobile screenshots inspected; theme inheritance and control styling corrected.
- Separate real-browser migration scenario: 1 passed. Existing program/module + explicit generation selection copied into a preset; unreferenced standalone module copied with a new identity and retained content.
- Changed JavaScript ESLint, zh-CN/zh-TW localization guard and `git diff --check` passed.
- `npm run frontend:prebuild-cache` succeeded using the existing bundle cache. Native source/CSS behavior was exercised by the real-host browser tests; no fresh full webpack rebuild was claimed.

No unrelated full suite, GitHub CI waiting, Android, Docker or live provider testing was performed. No remaining task blocker.

## 2026-09-25 confirmed follow-up

The completed follow-up `docs:fix/knowledge-originals-preset-boundaries.md` supersedes the earlier standalone-module copying UI described above: preset interiors no longer expose any global resource picker. Whole-preset import/export remains on the preset list, with Export on each row. Existing-resource migration remains an explicit action on that list. A new browser check verifies all three internal editors contain no other-preset data and make no global resource catalog request.
