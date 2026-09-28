# Unified Extensions UI checkpoint

Completed: 2026-09-27.

- Feature branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `cf6315abebdcb621b142e975d3ca0c3f61278a74` (pushed), following `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` with all earlier commits retained.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`. No merge or branch deletion.

## Implemented

The shell now presents one Extensions entry with Skills / Plugins. Library no longer presents a second Skills section or separate manager command. Existing Skill search/deep links resolve to the same Extensions surface and retain the exact scoped identity. The historical `utility.plugins` route is an internal alias, not another visible manager.

Plugins has External plugins / Local scripts / Built-in tools. External URL installation and revision-checked update reuse the existing install endpoint; installs/updates remain disabled. Local scripts support new, `.js` import, edit, enable/disable, and revision-checked save/delete. Editors preserve draft contents on conflict. Global / Prompt preset / Work checkboxes store stable IDs; missing selected IDs are retained, and Work targets deduplicate by whole Package identity. Runtime status is read from `Atria.extensions`; successful existing client mutations drive lifecycle refresh. Built-in tools reuse retained Regex/Search settings and persistence. Exact Work declarations remain accessible through the owning Work, not duplicated into a global plugin inventory.

Skills reuse the existing manager/editor/import controllers. Organization adds single-level folders plus Unfiled, create/rename/delete-folder, move by selection, collapse, folder filter and search. Deleting a folder clears folder assignments without removing Skills or path settings. Each scoped Skill identity exposes narrative / Studio / Agents independently as off / on-demand / always; metadata defaults are shown through the shared resolver. Settings use ExtensionsStore revision/CAS and leave drafts intact on conflict. Folder organization does not alter physical ownership, generation scope, inheritance or deny rules. Preferences remain keyed by the existing scoped Skill identity contract.

Chinese locales added via the existing Shell localization authority. Layout uses existing tokens and form components. Browser review corrected the code editor height and active-tab contrast, then reduced narrow-screen management controls using disclosures. No new persistence or generation authority.

## Validation actually run

65 distinct unit tests across 7 focused suites (some rerun after directly related fixes):

- `native/extensions-workspace.test.js` — 7 new tests: stable/missing scope IDs, script CAS draft retention, stale/disposed responses, external install/update ID and revision, folder deletion preserving path rules, per-path defaults and exact scope, preference conflict draft retention.
- `atria-shell/workspace-host.test.js`, `atria-shell/app-shell.test.js`, `atria-shell/library-runtime-workspaces.test.js`, `atria-shell/utility-workspaces.test.js`, `skills-ui/skill-manager-panel.test.js`, `atria-shell/localization.test.js`.

`e2e/native-session/20-extensions-ui.e2e.js`: Edge full-app flows at 1440px and 320px, using a disposable server/data root with cleanup. Covered actual folder/path persistence, script create/save/activation/disposal, `.js` import draft (disabled), built-in access, and no horizontal viewport overflow. Inspected generated screenshots. Repeated the narrow case after the final disclosure/layout adjustment; the final module relocation received import/unit/lint checks. No external repository/network install exercised by this UI browser case (endpoint arguments are unit-tested; runtime/install backend evidence remains in the preceding checkpoint).

Changed JavaScript ESLint and `git diff --check` passed. Source-local localization checks on the two new UI modules passed for both Chinese locale catalogs. No full regression or full guard sweep, Android, Docker, paid model invocation or real-user data mutation.

## Remaining / next checkpoint

Initial Native authoring Skills have NOT been written. Use the approved plan and P0–P9 completion records to author the first set, grounded in the discovery/catalog endpoints and current production APIs. Do not promise unsupported schemas or generation/write authority. After Skill content is complete, perform the deferred integrated broad validation spanning foundation, shared invocation, plugin runtime, UI and content. Fix discovered regressions without discarding branch commits. Main merge and branch deletion remain forbidden.
