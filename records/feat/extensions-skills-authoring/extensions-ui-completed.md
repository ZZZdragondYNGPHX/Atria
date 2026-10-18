# Unified Extensions UI checkpoint

Completed: 2026-09-27.

- Feature branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `cf6315abebdcb621b142e975d3ca0c3f61278a74` (pushed), following `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` with all earlier commits retained.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion.

## Implemented

The shell now presents one Extensions entry with Skills / Plugins. Library no longer presents a second Skills section or separate manager command. Existing Skill search/deep links resolve to the same Extensions surface and retain the exact scoped identity. The historical `utility.plugins` route is an internal alias, not another visible manager.

Plugins has External plugins / Local scripts / Built-in tools. Editors preserve draft contents on conflict. Global / Prompt preset / Work checkboxes store stable IDs; missing selected IDs are retained, and Work targets deduplicate by whole Package identity. Runtime status is read from `Atria.extensions`; successful existing client mutations drive lifecycle refresh. Built-in tools reuse retained Regex/Search settings and persistence. Exact Work declarations remain accessible through the owning Work, not duplicated into a global plugin inventory.

Skills reuse the existing manager/editor/import controllers. Organization adds single-level folders plus Unfiled, create/rename/delete-folder, move by selection, collapse, folder filter and search. Deleting a folder clears folder assignments without removing Skills or path settings. Each scoped Skill identity exposes narrative / Studio / Agents independently as off / on-demand / always; metadata defaults are shown through the shared resolver. Settings use ExtensionsStore revision/CAS and leave drafts intact on conflict. Folder organization does not alter physical ownership, generation scope, inheritance or deny rules. Preferences remain keyed by the existing scoped Skill identity contract.

Chinese locales added via the existing Shell localization authority. Layout uses existing tokens and form components. Browser review corrected the code editor height and active-tab contrast, then reduced narrow-screen management controls using disclosures. No new persistence or generation authority.

## Remaining / next checkpoint

Initial Native authoring Skills have NOT been written. Use the approved plan and P0–P9 completion records to author the first set, grounded in the discovery/catalog endpoints and current production APIs. Do not promise unsupported schemas or generation/write authority. Fix discovered regressions without discarding branch commits. Main merge and branch deletion remain forbidden.
