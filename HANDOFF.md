# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Status: **Phase 1 complete — Phase 2 ready, not started**
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3`
- Start HEAD / Main Baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Tested / Pushed HEAD: `3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Frozen Plan Commit: `7c34318ef86febb6a101d93015ab97a7f1af9fe2`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Architecture: **Implementation Baseline v1.0 unchanged**
- Completed Stage: **Phase 1 — Contract Reset / Compiler Skeleton**
- Next Stage: **Phase 2 — Presentation Runtime / Containment**

## Completed

Phase 1 product implementation is committed and pushed. No merge to main, no task-branch deletion, no Phase 2 implementation.

- Strict native@3 source/installed Experience schemas; legacy Project Source authoring shape rejected.
- Frontend Source Index, minimal .aui parser with preserved raw CST and semantic IDs.
- Canonical Component/View IR and exact hash-addressed resource graph.
- Compiled Bridge Descriptor v1 skeleton linked to existing Package Data/Lifecycle/Task contracts.
- Source/provenance digests and component/node/interaction/style spans; source-aware diagnostics.
- Shared formal Project Build compiler for Build, Studio Preview and Agent Review.
- Validation at container build/inspection/install/runtime resolution; no install-time compilation.
- Runtime HTTP access limited to exact compiled graph and existing declared game resources; author/remix source remains inaccessible.
- Minimal v3 source example and curated authoring catalog references.

Entry modules:
- `public/shared/native-frontend-contract.js`
- `src/native/frontend/compiler.js`
- `src/native/frontend/aui-parser.js`
- `src/native/frontend/graph.js`
- `src/native/frontend/bridge.js`
- `src/native/frontend/styles.js`
- `src/native/experience-validation.js`
- `src/native/runtime-descriptor.js`
- `src/native/authoring-examples/frontend-v3/`
- `tests/native/frontend-v3.test.js`

## Validation

- Native regression: **96 suites / 1602 tests passed**, FS/SQLite included; MySQL/PostgreSQL excluded with existing repository environment switches.
- Final focused regression after last refinements: **8 suites / 62 tests passed**.
- Full root ESLint and final changed-file/test ESLint: passed.
- Frontend library webpack build via `node docker/build-lib.js`: passed.
- `git diff --check`: passed.
- No remote CI, Android/Termux, external DB or browser-rendering evidence claimed.
- Initial environment/test-fixture failures and their fixes are recorded in the permanent Record.

## Decisions and limits to preserve

Package owns presentation; Host owns capabilities and authority. Do not reopen the architecture or repeat Gap Review.

Source Index component/view IDs and explicit .aui `node-id` values are semantic identity. Compiled resources use logical ID + exact hash; source paths are provenance, not authority identity. Index paths currently use `runtime/frontend/<package-or-entrypoint>/index.json`.

The parser is deliberately minimal: template, optional JSON contract/uses, optional style; static safe semantic elements, component refs, read/action links and exact asset links. Unsupported syntax fails closed. This is the Phase 1 compiler skeleton, not a complete DOM/CSS runtime.

Bridge mapping is identity-only and compile-time. Action/Operation output is a closed empty payload placeholder with receipt-policy metadata. Actual Bridge services/receipts/mapping/epochs/Collection Read belong to Phase 3. Required unimplemented Frontend Features fail closed; optional ones carry unsupported/reasonCode.

The existing container source storage namespace is retained physically, but native@3 Runtime only consumes validated compiled graph resources. Author TS/source/npm scripts are never executed by the added build/install/runtime paths.

Old installed v1/v2 code is temporarily retained for Phase 9 removal, not a new compatibility promise. No v3-to-v2 lowering exists. Full Studio controls/editor and bundled authoring skill migration remain scheduled later. Existing legacy Studio UI controls cannot author v3; source APIs, examples and Build/Preview already support it.

There is no v3 visual renderer yet. Phase 1 Preview exposes compiled artifacts; implementing actual rendering is the next phase.

## Next scope — Phase 2 only

Follow the Plan's Phase 2 section:
- semantic DOM renderer and complete CSS/font pipeline;
- ShadowRoot + Visual Containment and Host System/Escape Layer;
- Component props/emits/slots and View mount/lazy loading;
- local/View/Component/Draft/Prefs state;
- interaction baseline, overlays/FocusScope, local routing/forms;
- Frame Scheduler and bounded NodeRef measurement/observer/pointer capture;
- responsive Environment foundation.

Acceptance: Component/Hybrid/Full custom DOM/CSS/fonts; fixed/z-index/top-layer containment; Full Host System Layer; mobile/desktop responsive evidence; keyed list/virtualization foundation.

Do not silently start Phase 3+ (full Bridge runtime, Headless Conversation, Collection Read, Remote Media, Localization/IME, Script VM, Canvas) or Phase 7 visual editor. Do not read/update reference branches without explicit authorization.

## Resume procedure

1. Fetch real refs and inspect working tree. Protect unrelated changes.
2. Read AGENTS.md, docs:README.md, this HANDOFF, the Plan and same Record.
3. Use the existing task branch; current baseline has Phase 1 task commits, so do not blindly reset/fast-forward it to main.
4. Inspect directly relevant compiler/IR/runtime code and tests; do not re-review the architecture.
5. Implement and validate only Phase 2 when the user authorizes it.
6. End Phase 2 with tested/pushed HEAD, the same Record, live HANDOFF and Phase 3 prompt; stop.

The provided local directory was initially empty and was restored by cloning the specified repository. A new managed worktree was used for docs; the invalid adjacent old docs checkout was not altered.

## Direct-copy Phase 2 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 2 — Presentation Runtime / Containment。
Implementation Baseline v1.0 已冻结；不要重讨论架构、不要重做 Gap Review、不要开始 Phase 3。

Phase 1 已完成并 push：
- Start HEAD / main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- Tested task HEAD: 3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs/dirty changes；
依次读 AGENTS.md、docs:README.md、HANDOFF、Plan、Record。
沿用同一任务分支，保护无关变更。已有 Phase 1 提交，不要直接重置到 main。
本地优先 Git/文件系统/测试/构建，不绕远程 API 模拟网页流程。

Phase 1 已有 Source Index、.aui CST/AST、Component/View IR、exact graph、
Bridge Descriptor skeleton、Provenance、Build/Preview 共用 compiler、
installed graph validation 与 HTTP author-source 拒绝路径。
测试：Native 96 suites/1602 tests；最终聚焦 8 suites/62 tests；lint 与 webpack 通过。
外部 DB、Android/Termux、浏览器渲染、远程 CI 尚无本阶段验证。

Phase 2 以 Plan 对应章节为唯一权威：
semantic DOM renderer、完整 CSS/font pipeline、ShadowRoot + Visual Containment、
Host System/Escape Layer、props/emits/slots、View mount/lazy load、
Local/View/Component/Draft/Prefs state、Interaction baseline、
Overlay/FocusScope、routing/forms、Frame Scheduler、
NodeRef measurement/observer/pointer capture、responsive Environment。
完成 Component/Hybrid/Full、containment、mobile/desktop、keyed list/virtualization 验收。

Hard Cut 已批准；不做 v1/v2 迁移/兼容，不将 v3 IR 降级为旧 renderer。
不提前实施 Phase 3+ Bridge runtime、Headless Conversation、Collection Read、
Remote Media、Localization/IME、Script VM、Canvas 或 Studio visual editor。
普通实现问题、测试失败自行修复并继续。

Phase 2 完成后：
完成适当本地测试/构建与必要真实浏览器验证，push tested HEAD；
更新同一 docs Record 和 HANDOFF，记录 Start/Tested HEAD、验证、决策、剩余项；
生成 Phase 3 接手提示词；停止，不开始 Phase 3。
```
