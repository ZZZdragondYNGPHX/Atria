# Collapsible prompt editors

Date: 2026-09-25. Baseline: `19b0aaf6b8be79cb77e0696d957a9e15ae0fabf6`.
Branch: `feat/prompt-editor-folds`.

Prompt Program and Module editors now default to closed native details sections.
Identity, module settings, stage/module tree, individual stages, conditions,
response directive, typed parameters, derive operations and provenance expand
independently. Summary rows show identity, stage/module/parameter/operation
counts or configuration status. Save and Back remain outside disclosures.

Expansion survives stage rerenders, Simple/Advanced switching and preset save
refreshes via editor-local Maps. It is not persisted to resources or user settings.
New stages expand and focus their ID. Guarded condition/parameter/derive reads
reveal the failed section and its ancestors before focusing a control. Stage
renaming updates disclosure identity. Existing module ordering and picker scroll
anchoring are retained; no stage ownership or module eligibility changes.

Validation: 15 unit tests across prompt authoring/semantics passed. Four Edge
scenarios at 1440px/390px passed default-collapse, new-stage expansion, local
validation reveal, preset save state, module insertion position, sorting and
module-category workflows. Program screenshots inspected at both widths.
Changed-file ESLint had no errors (two existing conditional-test warnings in
05-native-authoring-p6); localization and whitespace checks passed. Older
authoring browser scenarios were updated to open sections but not executed.
No Android/Docker builds or external model calls. Local integration only.
