# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Status: **Phase 2 complete — Phase 3 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 2 Start HEAD: `3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8`
- Phase 2 Tested / Pushed HEAD: `91c45cc3b3a04346f2ac87baa73adb3215ebd6b1`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Completed: **Phase 2 — Presentation Runtime / Containment**
- Next: **Phase 3 — Host Bridge / Data Plane**

## Current implementation

Phase 1 established Source Index, `.aui` CST/AST, canonical Component/View IR,
exact hash-addressed graph, Bridge Descriptor skeleton, provenance and the shared
Build/Preview compiler plus container/install/runtime validation.

Phase 2 adds the actual semantic renderer for Component/Hybrid/Full; CSS AST and
local-font pipeline; per-component ShadowRoots inside Host-owned visual
containment; typed props/emits/slots and local state; lazy View mounts, routes,
forms, overlays/FocusScope; frame scheduler, bounded NodeRefs and responsive
environment; keyed reconciliation and fixed-height virtualization.

Play and Studio Preview use the same renderer. Production v3 enters before the
legacy selector/command path. Preview sends only the owner-checked immutable
compiled graph. Runtime never executes author `.aui`, TS, source or npm scripts.

Full Host controls retain Exit/Stop/Save/Diagnostics and add Reload Presentation.
Overlay Escape is coordinated before Full exit. Late local route/overlay loads
are discarded, and disposed Preview mounts cannot reattach.

Entry modules:

- `public/shared/native-frontend-presentation.js`
- `public/scripts/native/frontend/resources.js`
- `public/scripts/native/frontend/platform.js`
- `public/scripts/native/frontend/runtime.js`
- `public/scripts/native/experience/ui/live.js`
- `src/native/frontend/{aui-parser,compiler,graph,styles,bridge}.js`
- `public/scripts/native/studio-preview-ui.js`
- `src/native/authoring/studio-service.js`
- `src/native/authoring-examples/frontend-v3/README.md`
- `tests/native/frontend-presentation.test.js`
- `tests/native/helpers/frontend-presentation-fixture.js`
- `tests/frontend/native-frontend-v3.smoke.mjs`

## Validation

- Native regression: **97 suites / 1633 tests passed**, FS/SQLite included;
  MySQL/PostgreSQL excluded using existing environment switches.
- Adjacent game-runtime: **50 suites / 492 tests passed**.
- Final focused regression: **8 suites / 271 tests passed** after final refinements.
- Real Edge browser: **6 scenarios**, Component/Hybrid/Full at 1440px/390px.
  Covers local state, components, forms, fonts, overlay focus/Escape, routes,
  NodeRef resize/pointer capture, keyed identity, 1000-row virtualization,
  hostile fixed/z-index containment, Full controls/recovery, Preview and disposal.
- Full root lint, final changed-file/test lint, webpack and diff check passed.
- No remote CI, physical-device/Android/Termux, external DB or non-Edge evidence.
  Browser tests use compiled fixtures; production dispatcher and HTTP integration
  also have local automated coverage.

## Decisions to preserve

Package owns presentation; Host owns capabilities and authority. Do not reopen
architecture or repeat Gap Review. Hard Cut remains approved. Old installed
v1/v2 code is temporarily retained for Phase 9, with no v3 lowering/migration.

CSS resources resolve to exact graph assets. Fonts use Host-owned prefixed
FontFace registrations. Dynamic sinks are declared and typed. No raw browser
DOM/callback/global access is exposed to Packages. Package browser top-layer
APIs are absent; local overlays remain in the authorized surface.

Component state is per instance; View state is retained in route history;
UI/Draft state is Experience-local; Prefs reuse existing Host account settings.
Lifecycle cannot route recursively. Lists require stable scalar keys; large
lists use fixed-height virtual windows. NodeRefs identify unique non-repeated
nodes within one component instance and return bounded geometry, not DOM.

Budgets: 512 component instances, 20000 rendered nodes, 64 route entries,
8 overlays, 10000 declared array items; lists over 512 items require virtualization.

The Bridge descriptor is still a compile-time skeleton with identity mapping and
closed empty Action/Operation output placeholders. Runtime `read`/action links
remain unavailable and never fall back to old World/command dispatch.
Phase 2's local route revisions do not implement authority Experience Epoch.

## Next phase only

Phase 3 follows the Plan's own section: Frontend Host Bridge v1; Experience
Binding Registry; scoped Component `uses`; snapshot Read; Collection Read/cursor;
Action; Operation; unified Receipt/Error; idempotency/revision guards; Experience
Epoch/stale revocation; fixed prefs/environment projections.

Acceptance: undeclared Binding denied, stale cursor/query/revision fail closed,
collection pagination through formal services rather than raw DB, authority
writes only through typed targets, late completion discarded on Epoch change,
and shared compiled binding semantics for declarative and future Script callers.

Do not implement Phase 4+ Conversation/Session/Prose, Remote Media,
Localization/IME, Script VM, Canvas or Studio visual editor. No reference branch
may be read/updated without separate explicit authorization.

## Resume and stop procedure

Fetch real refs, inspect dirty changes and read AGENTS.md, docs:README.md, this
HANDOFF, the Plan and the same Record. Reuse the existing task branch; it already
has task commits, so do not reset it to main. Protect unrelated local changes.
Use direct local Git, files, search, tests and builds. Reuse the existing docs
worktree if available. Do not touch the unrelated invalid adjacent old checkout.

Only begin Phase 3 when the user asks to continue. Complete its local validation,
push the tested HEAD, update the same Record and HANDOFF, generate the Phase 4
prompt and stop at that boundary. No merge/main cleanup at this intermediate stage.

## Direct-copy Phase 3 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 3 — Host Bridge / Data Plane。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 4。

Phase 2 已完成并 push：
- Phase 2 Start HEAD: 3d3c7c6733fcf5f4a1f11d11f92aa3b168e624d8
- Tested task HEAD: 91c45cc3b3a04346f2ac87baa73adb3215ebd6b1
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支，保护无关 dirty changes；已有任务提交，不要重置到 main。
本地优先直接 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

已有 Source Index、.aui CST/AST、canonical IR、exact graph、Bridge skeleton、
provenance、Build/Preview 共用 compiler、installed graph/resource 验证。
Phase 2 已有共享 Play/Preview renderer、CSS/font pipeline、ShadowRoot 与 containment、
props/emits/slots、局部状态、forms/routes/overlays、Frame Scheduler、NodeRef、
responsive environment、keyed list/virtualization、Full Host controls/recovery。
说明见 src/native/authoring-examples/frontend-v3/README.md。

Phase 3 以 Plan 对应章节为唯一权威：
Frontend Host Bridge v1、Experience Binding Registry、scoped Component uses、
snapshot Read、Collection Read/cursor、Action、Operation、unified Receipt/Error、
idempotency/revision guards、Experience Epoch/stale revocation、prefs/environment fixed projections。
未声明 Binding 不可调用；stale cursor/query/revision fail closed；
Collection 不读 raw DB；Authority write 只经正式 typed target；
Epoch 变化丢弃 late completion；Declarative 与未来 Script 共用 compiled semantics。

Bridge 当前仍是 compile-time skeleton，read/action UI 不可用且无 legacy fallback。
不要把 Phase 2 local route revision 当成 authority Epoch。
Hard Cut 已批准，不做 v1/v2 兼容/迁移，不新增平行 authority。
不要提前实施 Phase 4+ Conversation/Session/Prose、Remote Media、Localization/IME、
Script VM、Canvas 或 Studio visual editor。不要未经授权读取 reference 分支。
普通技术问题、测试失败和常规实现决策自行修复并推进。

验证基线：Native 97 suites/1633 tests；game-runtime 50 suites/492 tests；
最终聚焦 8 suites/271 tests；Edge 六组桌面/移动场景；lint/webpack/diff check 通过。
MySQL/PostgreSQL 用现有开关排除；不声称 remote CI、真机或其他浏览器已验证。

Phase 3 完成后：完成适当本地测试/构建并 push tested HEAD；
更新同一 docs Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 4 接手提示词；停止，不开始 Phase 4。
```
