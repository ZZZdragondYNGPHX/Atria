# Extensions / Skills / AI Authoring Foundation — integrated

Updated: 2026-09-27. Local and remote `main`: `93991c7ccea30ce7499935bbb91592ae137086dd`.

- The user subsequently authorized integration and obsolete-branch cleanup. `main` fast-forwarded from `4dab353ac639d42eae885c79e18245267abd6820`, retaining every feature commit. The local/remote feature branch and the already-merged remote `feat/component-form-composer-submit` were removed. The no-merge instructions in archived checkpoints below are superseded.
- Discovery, shared Skill invocation, browser SDK/runtime, unified Extensions UI and initial five Native P0–P9 authoring Skills are implemented. Existing users may import new Skills through the bundled browser; no real account was changed.
- Real bundled install exposed/fixed dropped `atria-paths` metadata. Recorded Studio AI tool loop reads Skill references, compiles v2, runs production Scenario and reaches Review without Commit/provider calls.
- Full JS unit run initially had 9 failures; all failed suites passed targeted correction/environment/isolated reruns. Final aggregate: 802 executed suites / 9127 passing tests, 7 suites / 92 skipped. This is not one clean final full run; Git system same-second write remains an intermittent broad-run-only failure with isolated pass and no claimed root-cause fix.
- 6 integrated Edge browser cases, 21 guards, full product lint plus final changed-code lint/whitespace passed. No Android/Docker/paid inference or real-user writes.
- Post-merge `main` verification passed 3 suites / 25 tests and the Experience contract foundation guard. Full evidence, exact accounting, fixes and limits: `feat/extensions-skills-authoring-completed.md`.

No next implementation phase is assumed. On continuation, fetch first, read current main operating rules, the approved plan, latest handoff and completion record. Do not redo confirmed requirements or discard branch updates. Do not describe the intermittent Git test as permanently fixed or imply all repository E2E/physical devices were validated.

---

## Archived predecessor — UI checkpoint

# Extensions / Skills / AI Authoring Foundation — UI complete

Updated: 2026-09-27. Current checkpoint: `cf6315abebdcb621b142e975d3ca0c3f61278a74` (pushed).

Continue on `feat/native-experience-modes-capability-deepening`; fetch first, retain all commits. Main remains `4dab353ac639d42eae885c79e18245267abd6820`. Do not merge main or delete the feature branch.

Foundation, shared Skill invocation and browser runtime are complete. Unified Extensions UI is now complete: one entry, Skills / Plugins tabs, external/local/built-in plugin categories, local script import/edit/scopes/status, and Skill folder/per-path preferences. Reuses existing storage/CAS and lifecycle authorities. Detailed evidence: `feat/extensions-ui-completed.md`.

## Next continuation prompt

Continue Atria Extensions / Skills / AI Authoring Foundation. Read current main `AGENTS.md` / `FORK_MAINTENANCE.md`, docs `feat/extensions-skills-authoring-foundation.md`, this handoff, latest handoff and P0–P9 completion/boundary records. Read `feat/extensions-ui-completed.md`, `feat/extensions-runtime-completed.md` and `feat/extensions-skills-invocation-completed.md` for the integrated contracts.

Next checkpoint: author the first Native authoring Skills focused on current Native Experience P0–P9, using the actual Atria discovery/catalog and production APIs. Requirements remain confirmed; do not restart requirements discussion. Preserve script Global / Prompt preset / whole-Package Work scopes and OR dedup, independent narrative/Studio/Agents off/on-demand/always paths, simple folders and the single Extensions entry. No Android, Docker, paid inference or real-user data changes. Do targeted content checks first; once content is done, the deferred integrated full validation is due. Record evidence and remaining limitations, commit/push this branch and docs, then hand off. Never merge or delete the work branch.

UI validation: 65 distinct targeted unit tests, desktop/narrow Edge flows, changed JS lint/whitespace and source-local locale checks. No full regression performed yet.

---

## Archived predecessor — runtime checkpoint

# Extensions / Skills / AI Authoring — browser runtime complete

Updated: 2026-09-27. **Runtime/SDK checkpoint complete; stop before unified UI and initial authoring Skills.**

- Work branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11` (pushed). All foundation/invocation/P0–P9 commits retained.
- Main stays `4dab353ac639d42eae885c79e18245267abd6820`. Merge and branch deletion remain forbidden.
- Plan: `feat/extensions-skills-authoring-foundation.md`.
- Current record: `feat/extensions-runtime-completed.md`; prior invocation record: `feat/extensions-skills-invocation-completed.md`.

Enabled local/external ES modules now activate through SDK v1 with OR scope matching, owned mounts/events/timers, disposal and late-async guards, typed Native adapters, lifecycle/config/CRUD notifications and inspectable status. Primary narrator Prompt preset ownership is reused; Work is the entire Package. SDK documentation is available through the authoring catalog. External installs/updates remain disabled until explicitly enabled; failed updates retain old content.

59 distinct targeted unit tests across five suites and one real Edge module-loading fixture passed; changed-file lint/whitespace passed. No full regression or global guards. Broad verification remains deferred until UI and first Skills are done. No Android/Docker/paid model/real-user-data operations.

## Next checkpoint: unified Extensions UI

- One visible top-level Extensions entrance. Skills / Plugins tabs; Plugins contains External plugins / Local scripts / Built-in tools.
- Reuse existing Skill inventory/import/editor/file APIs, add single-level folders plus Unfiled and per-path off/on-demand/always settings through existing ExtensionsStore CAS.
- Reuse `nativeExtensionsClient`, `Atria.extensions.refresh/getStatus/subscribe`, authenticated storage and revision-bound runtime. Add .js import/new/edit/enable, URL install/update and useful runtime error states.
- Stable scope pickers use actual Prompt preset/Work IDs. Work means Package, not Actor. No duplicate visible manager entrances; retain redirects and owning-Work declaration access.
- Follow existing design language and localization; inspect desktop/narrow-screen rendered flows. Only targeted stage validation; no full-repo run yet.
- First Native P0–P9 authoring Skills are still pending after UI. Do not claim full product acceptance now.

Read `feat/extensions-runtime-completed.md` and the shipped `browser-extension.md` before consuming the SDK. Important limits: trusted page code, text-only imported assets, cleanup guarantees only for SDK/registered resources, per-call model route overrides do not change Host preset scope, and typed operations already admitted by Native authority are not rolled back on disposal.

## Copyable continuation prompt

继续 Atria Extensions / Skills / AI Authoring Foundation。沿用 feat/native-experience-modes-capability-deepening，当前 HEAD c138e6eaf6c53f21e57068d2d3ff0cf0375b4e11。先 fetch 并保留全部更新提交，禁止回退覆盖。读 main 的 AGENTS.md/FORK_MAINTENANCE.md，docs 的正式计划、两个交接、feat/extensions-runtime-completed.md 和既有 P5–P9 边界。基础、统一 Skill 调用和浏览器插件/本地脚本运行器已完成；本次只完成统一 Extensions UI：唯一顶级入口，Skills/Plugins，外部/本地/内置分类，实际 ID 的全局/提示词预设/作品（整个 Package）范围选择，本地脚本导入/新建/编辑/启停，Skill 单层文件夹和路径设置，清理重复入口。复用现有设计/编辑器/API/CAS/生命周期权威，覆盖必要状态并做桌面和窄屏浏览器检查。只做涉及文件的轻量验证，首批 Skills 完成后再统一全量验证。完成后提交推送、更新 docs 并停下。禁止合并 main、删除工作分支，禁止 Android/Docker/付费模型或真实用户数据修改。

---

## Archived invocation checkpoint (historical; next-step instructions superseded)

# Extensions / Skills / AI Authoring — Skill invocation complete

Updated: 2026-09-27. **Invocation checkpoint complete; stop before plugin runtime/UI/Skill bundle.**

- Branch: `feat/native-experience-modes-capability-deepening`.
- HEAD: `db0369deaf2b296f2e5361b88460fd047536f505` (pushed); foundation `fda5907ed` and P0–P9 preserved.
- Main: `4dab353ac639d42eae885c79e18245267abd6820`, unchanged. Merge and branch deletion remain forbidden.
- Approved plan: `feat/extensions-skills-authoring-foundation.md`.
- Current completion, architecture, tests and explicit bounds: `feat/extensions-skills-invocation-completed.md`.

Common physical-scope/path resolution is connected to Native narrative, Studio and Agents. Off/on-demand/always routing, exact Package scopes, Agent visible/deny rules and bounded supporting reads are active. Always content participates in existing prompt budgets. Narrative read-only tool rounds run through existing GenerationService and scheduler, preserve P6 exposure and Task identity, and publish only final prose. No plugin execution or unified UI was added.

65 distinct targeted tests passed across eight involved suites, including two selected FS/SQLite P6 cases; changed-file ESLint and whitespace passed. No full validation or guard sweep. User requires lightweight stage checks and one final broad verification only after UI, plugin runner and Skill contents are done.

## Remaining work

1. Executable external browser plugin/local script SDK lifecycle. Reuse foundation authenticated records/files. Targets remain Global / Prompt preset / Work (entire Package), stable identities, OR match and once-only activation. Dispose SDK-owned resources on context exit/edit/disable and late activation.
2. Unified top-level Extensions UI with Skills / Plugins and External / Local / Built-in plugin categories. Reuse existing managers/editors, add simple folders and per-path settings, remove duplicate entrances. Preserve Work plugin declarations in their owning Work.
3. First installable Native Experience P0–P9 authoring Skills, readable supporting files and compiler-valid examples.
4. Final broad verification and real browser flows only after the above are complete. No Android/Docker/paid inference/user data mutation.

Narrative tools currently require a capable provider, reject a mixed caller-owned tool authority, cap six rounds/eight calls, and buffer output until a final response. See the completion record for character/token limits and evidence details. Requirements remain confirmed; do not reopen discussion.

## Copyable next prompt

继续 Atria Extensions / Skills / AI Authoring Foundation，沿用 feat/native-experience-modes-capability-deepening，当前 HEAD db0369deaf2b296f2e5361b88460fd047536f505。先 fetch 并保留所有更新，不回退覆盖。读取 main 的 AGENTS.md/FORK_MAINTENANCE.md、docs 的正式计划、两个交接及 feat/extensions-skills-invocation-completed.md、P9/P5–P9 边界。统一 Skill 解析及正文/Studio/Agents 接入已完成。本次只完成可执行外部插件/本地脚本运行器与 SDK 生命周期，复用现有存储/认证/作用域与 typed Native 操作；全局/提示词预设/作品（整个 Package）多命中只执行一次，退出/编辑/禁用和异步过期均清理。针对修改文件做轻量验证，UI 与 Skill 内容完成后才统一全量验证。完成后提交推送、更新 docs 并停下。禁止合并 main、删除工作分支、运行 Android/Docker/付费模型或修改真实用户数据。

---

## Archived foundation checkpoint (historical; its next-step instructions are superseded)

# Extensions / Skills / AI Authoring — foundation handoff

Updated: 2026-09-27. **Foundation checkpoint complete and pushed. Stop at user-requested handoff.**

## Identity and authorization

- Branch: `feat/native-experience-modes-capability-deepening`.
- Current HEAD: `fda5907ed7e80db7c47c2baa168fdfb554ca1c7d`.
- P9 predecessor: `88c1a776f91e0bab6becc7039e7978d56058ef85`.
- Main remains `4dab353ac639d42eae885c79e18245267abd6820`.
- Formal approved plan: `feat/extensions-skills-authoring-foundation.md`.
- User explicitly forbids merging/deleting the branch. Preserve all P0–P9 and follow-up commits.
- User requested stopping after a coherent portion and receiving a prompt for a fresh chat. Do not automatically run the remaining phases from this checkpoint.

## Confirmed decisions — do not reopen

- External plugins retain URL-install/extensibility but target Atria APIs; no requirement for unmodified ST plugin compatibility.
- Local scripts support `.js` import, create/edit and enabled state. **Global / Prompt preset / Work** scopes; Work means the entire Package, not Actor. This latest decision supersedes the earlier global-only discussion. Multiple matching scopes execute once; context exit/replacement/disable must dispose SDK-owned resources.
- Skills support multiple invocation paths (narrative, Studio, Agents), each off/on-demand/always. Folder organization is single-level plus Unfiled; moving/deleting folders must not alter Skill identity/content/scope/routes.
- One top-level main-shell entry named Extensions. Top tabs Skills / Plugins. Plugins categories External plugins / Local scripts / Built-in tools. Remove other visible duplicate management buttons. Existing exact Work plugin declarations must still be reachable in owning Work context without adding another global manager.
- Initial bundled authoring Skills specifically cover current Native Experience P0–P9, not only traditional chat cards: planning, UI v2, Task/lifecycle/Activity/Scene, information/Continuity/Add-on/Shared/Realm, Scenario/Health validation. Progressive reference files must be readable through actual AI tools.

## Implemented at this checkpoint

1. `src/native/authoring-reference.js`: curated current compiler reference catalog, exact capability support metadata, search and paginated reads with SHA-256. IDs map only to whitelisted shipped files. Includes minimal UI v2 and Scenario JSON examples under `src/native/authoring-examples`; no dependency on tests being shipped to production.
2. `src/native/project-agent.js`: `atri_agent_api_catalog` / `atri_agent_api_read` exposed through existing owned Project Task tool execution. Existing proposal/Review/Commit flow remains.
3. `public/scripts/native/studio-agent.js`: prompt explains interface discovery; `atri_agent_skill_files` lists support files; `atri_agent_read_skill` accepts path plus line offset/limit instead of only SKILL.md. Offset is **one-based lines**, unlike API reference reads which use **zero-based character offsets**. Server generation allowlist admits the new read-only file-list tool.
4. `public/shared/extension-contract.js`: closed Skill folder/routing preferences, stable scope+name keys, default metadata `atria-paths`, script scope target validation and OR matching. Functions are foundations; runtime/UI integration has NOT happened.
5. `src/native/extensions-store.js`: authenticated user metadata and script/plugin records use existing Native generic resource engine and per-user write lock/CAS. Resource kind remains `atri_versioned_json_resource`, types `atri.extensions.settings` and `atri.extensions.plugin`; no new World/Session/DB authority. Settings default to empty folders/preferences. Plugin records have name/kind/enabled/targets/entrypoint/files/sourceUrl and content revision. List excludes file payloads. Delete uses tombstone.
6. `src/native/extension-install.js`: initial HTTPS Git repository importer using existing built-in Git client, avoiding Node/package-manager execution. Root `atria.extension.json` fields: `schemaVersion:1,apiVersion:1,name,entrypoint`. Installs disabled. Validates relative files and entrypoint, caps 128 files/4 MiB/depth12, rejects symlinks and binary assets; temporary directory always removed. Text JS/CSS/JSON/SVG supported at this stage. This is an initial browser-extension ingestion contract, separate from Native Package `atria.plugin.json` declarations.
7. `src/endpoints/native-extensions.js`, registered at `/api/native/extensions`: settings GET/PUT, catalog list/read, plugin list/get/save/delete, install/update-from-source and revision-bound authenticated installed-file GET. Disabled or mismatched-revision modules are not delivered. Updates install a disabled candidate; previous stored version is unchanged until validation/CAS succeeds.

## Actual validation

Command with `ATRIA_DISABLE_MYSQL_TESTS=1`, `ATRIA_DISABLE_POSTGRES_TESTS=1`:

`npm --prefix tests run test:unit -- --runInBand extensions-foundation project-agent studio-agent-a8 model-prompt-runtime-p4 --silent --verbose=false`

**5 suites / 48 tests passed**: new `extensions-foundation` 7 tests plus existing Project Agent, Agent HTTP, Studio AI and Native Generation P4 coverage. New tests read every catalog reference, compile examples, verify pagination/path rejection, FS+SQLite configuration conflict behavior and plugin CRUD, authenticated/revision-bound delivery, owner isolation, inert mocked repository install and temporary-root cleanup. Actual external Git download was not exercised.

Changed JS ESLint and `git diff --check` passed. Guards passed: Experience contract foundation, A0 authoring hard-cutover, A7 Studio UX. No broad regression or browser run for this backend checkpoint; previous P9 evidence belongs to P9 and must not be relabeled as validation of these new features. No Android/Docker/paid model/live plugin installation.

## Remaining work and integration seams

- Common Skill invocation resolver must be connected to Native narrative generation, Studio and Agents. Current mode helper alone does not enforce routing. Studio still has its prior scope-resolution flow; Agents still have visible/deny rules. Preserve explicit denies and exact Package scope. Folder/path preferences should remain user metadata, not mutations to immutable Package Skill files.
- Native narrative on-demand Skill reads need an actual bounded read-tool loop inside the existing generation authority (not prompt injection alone or a second scheduler). `NativeGenerationHost.execute` builds ContextPlan and uses `GenerationService`; preserve P6 explicit context exposure and P5 prose-only result. Always-loaded content must be budgeted and visible in evidence. No provider calls in tests.
- No script/browser plugin runtime or SDK yet. Implement lifecycle/async disposal and typed operation adapters before advertising executable plugins. Existing module-file endpoints alone do not activate installed code. Decide stable context change detection using Session lifecycle and Prompt Preset route identity; do not poll a new scheduler.
- No Extensions top-level UI, Skill folders UI or per-path settings UI yet. Existing Library Skills / utility Plugins entrances remain. Existing manager CRUD/import/editor should be reused; old aliases can redirect, visible duplicates must go.
- No new bundled authoring Skills yet. Apply skill-creator guidance, put product skills in `default/skills/global`, with metadata limiting default invocation to Studio. Read the current bundled importer and test actual discoverability/reference reads.
- Initial catalog exposes source contracts; richer topic guides and examples still belong to the remaining Skill/catalog work. Do not claim full end-to-end vibe coding acceptance yet.
- Before exposing the installer, finish validation including rejected update retains prior version, bounded delivery, source URL/schema checks, archive/asset formats, runtime error display and account isolation. Binary assets are currently unsupported; either document this product limit or deliberately implement bounded binary storage before final completion. Do not install test plugins into user data.

## Suggested next checkpoint

Complete **Skill invocation resolution and integration** only (plan step 2): shared resolution plus narrative/Studio/Agents wiring and targeted tests. Stop after a coherent verified commit, push, update this handoff and provide the next prompt. Do not swallow the UI, script runtime and bundled Skills into the same context unless the user explicitly changes the checkpoint scope.

## Copyable continuation prompt

Continue Atria Extensions / Skills / AI Authoring Foundation on the existing `feat/native-experience-modes-capability-deepening`, foundation HEAD `fda5907ed7e80db7c47c2baa168fdfb554ca1c7d`. Fetch first and preserve newer commits. Read main AGENTS.md and FORK_MAINTENANCE.md, docs `feat/extensions-skills-authoring-foundation.md`, `handoff/extensions-skills-authoring-foundation.md`, latest handoff and the P9 completion/regression boundaries. Confirmed decisions are frozen; do not restart requirements discussion. This turn only completes the next coherent checkpoint: Skill invocation resolution and narrative/Studio/Agents integration, using current storage, scopes, generation authority and deny rules. Add targeted meaningful tests, fix routine failures, commit/push, update docs and stop with a takeover prompt. Do not merge main or delete the branch. Do not run Android/Docker/paid inference or implement the later unified UI/plugin runtime/Skill bundle in this checkpoint.
