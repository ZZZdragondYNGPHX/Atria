# Native product UX — Group 9 and final closure

Branch: `fix/native-product-ux-audit`.
Baseline: Group 8 `42265308d4b08964c71ddfbcbbccf7730bda4a4a`.
Final HEAD: `652bb6386f61e9c5fb983157c8852b1680736eb2`.

Issue commits: NUX-043 `9e66b5c81`; NUX-044 `652bb6386`.

### NUX-043

Global Search now declares its supported domains and indexes Sessions, SavePoints,
exact Knowledge entries, scoped Skills and Agents orchestration presets alongside
existing Library/Build/Runtime resources (including Retrieval). Results navigate
through WorkspaceHost. SavePoints open their committed revision for inspection;
search does not restore progress. Knowledge entries use the indexed exact revision
in a read-only detail. Skills retain their complete scope and PackageVersion.

Refresh catches synchronous, authority-level and individual-owner failures,
keeps successful domains searchable and exposes partial availability, affected
sources/owners, error details and retry in the existing palette. Concurrent/stale
refreshes cannot replace newer results or disposed state. Coverage disclosure is
keyboard-accessible and preserves expansion while filtering.

 Focused search coverage includes all new entities, source failure/retry,
concurrent refresh and disposal.

### NUX-044

Completed the current Native/Shell/Agents/Skills/Regex/Search Tools localization
pass in zh-CN and zh-TW. Studio HTTP failures use the established Native product error
mapping. Existing catalogs remain the authority; no additional i18n system or
visual redesign was introduced.

User-authored resource, preset and Skill names, exact references, provider/model
IDs, paths and source literals stay unchanged. Search supports translated command
copy while preserving literal result titles. Detail routes and authoring pickers
preserve authored names even when they match a translated action such as Save.

 Scope and maintenance
contract: [Native product localization](../../../refactor/atria-native-authoring-platform-product-frontend/legacy-handoffs/native-product-localization.md).

 The final
localization suite rerun passed all four cases. Existing Knowledge E2E conditional-test
warnings remain; there are no lint errors.

 Missing blobs fail safely.

 Rendered normal and failure states
were inspected. All ten adjacent Runtime browser cases passed.
