# Atria Extensions / Skills / AI Authoring Foundation

Status: implemented and integrated into local/remote `main` at `93991c7ccea30ce7499935bbb91592ae137086dd`. 2026-09-27.

## 0. Authorization and branch

The user confirmed this follow-up over several discussion rounds. Work continued on `feat/native-experience-modes-capability-deepening` from P9 `88c1a776f91e0bab6becc7039e7978d56058ef85`, preserving all prior commits. The original merge/deletion hold applied during implementation. The user subsequently authorized integration and obsolete-branch cleanup: `main` fast-forwarded from `4dab353ac639d42eae885c79e18245267abd6820` to `93991c7ccea30ce7499935bbb91592ae137086dd`, then the temporary branch was deleted locally and remotely. This is a separate plan, not retroactive expansion of P9.

## 1. Confirmed product requirements

1. Vibe-coding AI must discover current Atria interfaces, schemas, examples and capability/version limits, including the full Native Experience P0–P9 branch. Source read/write alone is insufficient.
2. External plugins retain URL installation and extensibility; authors target Atria APIs. Unmodified SillyTavern binary/source compatibility is not promised. Backend Node plugin execution is not added to browser installation.
3. Local scripts support `.js` import, new/edit and enable/disable. Applicable scopes are **Global / Prompt preset / Work**. Work means the entire Package, not an Actor. A script may target multiple matching contexts and runs only once per Host context. Context changes dispose mounts, listeners and timers owned through the SDK.
4. Skills support multiple invocation paths, each configured as on-demand or always-loaded. Initial paths: narrative generation, Studio authoring AI, Agents. Existing physical scope and invocation path are separate dimensions. Skills do not grant tools or execution privileges.
5. Skill organization uses single-level folders plus Unfiled. Create/rename/delete folders, move entries, collapse/filter/search. Folder edits never rename a Skill or change its invocation routing/scope. Deleting a folder keeps its Skills.
6. One top-level **Extensions** entry on the main shell. Top tabs: Skills / Plugins. Plugin categories: External plugins / Local scripts / Built-in tools. Remove duplicate management buttons from Library, utility menus and other panels. Existing internal navigation targets may redirect to the single authority without adding visible duplicate entries.
7. Initial bundled authoring Skills focus on this branch: Native Work planning; UI v2/layout/actions; Task/lifecycle/Activity/Scene; information/continuity/add-on/Shared/Realm; Studio Scenario/Health verification. Minimal but executable examples, exact API references, known limits and validation steps. Progressive references are actually readable by the authoring AI.

## 2. Architecture decisions

- Reuse existing authenticated routes, Native resource storage/CAS, SkillRepository, Skill API, generation/Agent runtime and shell navigation. No parallel Session/World or generation scheduler.
- Add one versioned AI-facing authoring reference catalog with capability metadata and bounded per-topic references/examples derived from maintained current contracts. Catalog entries are searchable and read-only. Project Agent tools expose discovery/read, Skill file listing and bounded reference reads. Existing proposals still pass Studio validation and Review/Commit.
- Skill folders and invocation preferences are user metadata, separate from immutable installed Package Skill originals. Resolution applies physical scope first, invocation preferences second, and keeps existing explicit Agent deny constraints. Always-loaded instructions enter the selected call context; on-demand items expose descriptions and scoped read tools. Unrelated paths never receive those instructions.
- Local scripts and external browser plugins are explicitly user-installed Host extensions. They are not executable Package UI or untrusted narrative output. Installation never executes Node code or package manager scripts. External repository files are validated/bounded, updates are explicit, and previous content is retained until replacement validates. Installed code is disabled until the user enables it.
- Browser extension SDK v1 provides context, lifecycle-owned UI/event/timer helpers and existing typed Native operations. Imported module activation receives SDK, returns optional cleanup. Host API grants do not bypass server ownership/revision/schema checks. Direct browser JavaScript is trusted page code, not advertised as a security sandbox; automatic cleanup guarantees cover SDK-managed resources and registered cleanup.
- Script scope targets use stable Native Work and Prompt Preset identities, not display names. UI uses pickers. Global membership is OR with selected presets/works; matching twice does not execute twice. Disable/edit/context exit disposes old activation before new activation. Async late activation cannot attach to a newer context.
- Keep P5 fact-before-Narrator, P6 explicit exposure, P7 immutable exact content/independent Player ledger and P8 single canonical Session/ACL/Realm Sagas. No raw authority write or implicit cross-ledger migration.

## 3. Implementation sequence

1. Authoring API catalog and AI reference/file tools; unit coverage proving discovery and bounded reads.
2. Persisted Skill organization/routing; common resolver and Native narrative/Studio/Agents integration.
3. External plugin/local script storage, authenticated management and executable browser SDK lifecycle.
4. Unified Extensions UI, scope pickers and removal/redirect of redundant entrances; reuse existing styles and localization.
5. Ship the initial Native authoring Skill bundle with references/examples; verify links and compiler-accepted fixtures.
6. Targeted tests, relevant guards, broad regression proportional to the change, real browser desktop/narrow-screen flows; fix failures.
7. Commit/push the existing work branch, publish completion/evidence/handoff on docs, **stop without merging or deleting the branch**.

## 4. Acceptance

- A mocked Studio AI can list/read a newly supported capability and Skill reference, propose valid v2 Source, and reach Review through actual existing validation; no paid provider needed.
- Folder operations preserve Skill identity/content and bindings after reload; missing/deleted Skill metadata does not crash inventory. Skill path isolation and always/on-demand behavior are covered across narrative, Studio and Agents, including existing deny rules.
- Authenticated plugin/script CRUD has conflict detection and user isolation. Rejected install/update leaves prior version intact. Local script module actually activates; scope changes, disable, edit and late async results dispose correctly. External plugin relative resources can load through the authenticated installed-file route.
- Only one visible main-shell management entrance remains; both top tabs and three Plugin categories work. Script scope selections refer to real presets/works. Skill create/import/edit uses existing file operations. Loading/error/empty/disabled/keyboard/mobile states are covered.
- First Skills can be installed from the bundled catalog and read with their reference files through actual AI tools. Examples compile; documentation does not claim unimplemented APIs.
- No Android, Docker, paid inference or unrequested live-user mutations. Preserve all P0–P9 regressions and report actual checks only.

## 5. Foundation checkpoint — 2026-09-27

Completed/pushed at `fda5907ed7e80db7c47c2baa168fdfb554ca1c7d`: current API discovery and Skill reference-file tools, shared preference/scope contracts and initial authenticated Extensions backend. 5 suites / 48 tests, changed JS lint, whitespace and 3 guards passed. Runtime/UI/Skill bundle and full acceptance remain. User requested stopping for a new conversation. See `handoff/extensions-skills-authoring-foundation.md`; next checkpoint is Skill invocation integration only. No merge/deletion.


## 6. Skill invocation checkpoint — 2026-09-27

Completed/pushed at `db0369deaf2b296f2e5361b88460fd047536f505`: common scope/path resolution; Native narrative bounded read-tool loop and budgeted always instructions; Studio and Agents integration retaining explicit denies. 65 distinct targeted tests, changed-file ESLint and whitespace passed. No full regression; final broad validation is deferred until plugin runtime, UI and bundled Skills are complete. See `feat/extensions-skills-invocation-completed.md` for exact validation and practical bounds, and the current handoff for the next plugin-runtime checkpoint. Main/work-branch merge/deletion hold remains.


## 7. Browser runtime checkpoint — 2026-09-27

Completed/pushed at `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11`: executable browser extensions/local scripts, SDK v1 lifecycle/async disposal, typed Native adapters, context/config/CRUD event wiring, stable preset-owner reuse and update validation. 59 distinct targeted unit tests plus one isolated real Edge module/relative-resource flow passed; changed-file lint and whitespace passed. See `feat/extensions-runtime-completed.md` and current handoff for bounds. Next checkpoint is unified Extensions UI; initial authoring Skills and final broad verification remain later. Main/work-branch hold persists.


## 8. Unified Extensions UI checkpoint (2026-09-27)

Completed at `cf6315abebdcb621b142e975d3ca0c3f61278a74` on the retained feature branch. One shell Extensions surface now provides Skills folders and per-path loading, external URL plugin management, local script import/create/edit, stable Global / Prompt preset / whole-Package Work scope pickers, runtime status, and retained built-in settings. All mutation paths reuse existing clients and revision authorities. Details and actual checks: `feat/extensions-ui-completed.md`.

65 targeted unit tests and desktop/narrow Edge flows passed; broad integrated verification remains deferred until initial Native authoring Skills are complete. Next checkpoint is that Skill content. Main stays unchanged; no merge or branch deletion.


## 9. First authoring Skills and integrated verification (2026-09-27)

Completed at `93991c7ccea30ce7499935bbb91592ae137086dd`. Five bundled Native P0–P9 authoring Skills, progressive references and compiler/Scenario-tested examples shipped. Real install now preserves validated invocation metadata. Integration fixes retain diagnostics and align historical tests with current authorities.

Full unit run plus focused corrections/reruns covered 802 executed suites / 9127 passing tests (7 suites / 92 skipped); this is aggregate evidence, not one clean final broad run. An intermittent system Git same-second test failed broad and passed isolated without production fix. Six integrated browser cases, 21 guards and product/changed-code lint passed. Exact initial results, limitations and all fixes: `feat/extensions-skills-authoring-completed.md`. The approved sequence is implemented and integrated. Post-merge `main` verification passed 3 suites / 25 tests and the Experience contract foundation guard. No next feature is inferred.
