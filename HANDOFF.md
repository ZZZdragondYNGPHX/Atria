# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Status: **Implementation Baseline v1.0 frozen — Phase 1 Ready**
- Primary Workspace: `main`
- Task Branch: `refactor/native-frontend-runtime-v3`
- Task Branch HEAD: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Main Baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Plan Commit: `7c34318ef86febb6a101d93015ab97a7f1af9fe2`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Record Initial Commit: `5cfee803b794ffa80f55789532754eb82bd664a4`
- Current Stage: **Phase 1 — Contract Reset / Compiler Skeleton**
- Product Code Changes: **none yet**
- Validation/CI: **not run yet; Phase 0 was documentation/branch preparation only**

## Preparation completed

The architecture discussion is finished.

Two Gap Reviews passed and the Plan is frozen as **Implementation Baseline v1.0**.

Before this handoff:

- current remote refs were rechecked;
- full `docs:README.md` Repository Governance was reread;
- latest `main:AGENTS.md` was reread;
- the task branch was created from exact current `main`;
- the permanent multi-stage Implementation Record was created;
- the Plan was updated from “awaiting implementation approval” to “Phase 1 Ready”;
- no Phase 1 product code was written.

## Frozen architecture summary

Core principle:

> **Package owns presentation. Host owns capabilities and authority.**

Native Frontend v3 includes:

- Authoring Source Graph → Compiler → Canonical Runtime Graph;
- Atria-owned `.aui` SFC-like authoring;
- Package-owned semantic DOM / CSS / fonts / components;
- Component / Hybrid / Full as layout ownership only;
- Shadow DOM + Visual Containment + Host System/Escape Layer;
- typed Frontend Host Bridge v1;
- Experience Binding Registry with Reads / Actions / Operations;
- fixed Host services: Composer / Conversation / Session / Media / Presentation / External;
- snapshot + bounded Collection Read;
- Managed + Headless Conversation;
- GenerationProjection;
- Safe Prose AST;
- typed dynamic style/media sinks;
- Remote Media Catalog + External Access Permission;
- Localization / RTL;
- IME / VisualViewport / soft-keyboard support;
- Accessibility environment / diagnostics / FocusScope;
- Component/View/Root Loading/Error Boundaries;
- Experience Epoch / stale handle revocation;
- Frame Scheduler;
- bounded NodeRef layout measurement / observers / pointer capture;
- optional Script Sandbox using Supervisor Worker + isolated JS VM;
- Canvas2D batched command buffer.

Hard Cut:

- no Native UI v1/v2 migration;
- no compatibility CSS;
- no long-lived dual Runtime;
- final state deletes legacy `componentModelVersion` path and old v1/v2 formal Runtime/compiler.

Do not reopen these architectural decisions unless real implementation/test evidence proves a blocker.

## Phase 1 authoritative scope

**Phase 1 — Contract Reset / Compiler Skeleton**

Implement only Phase 1 from the Plan.

Goals:

- define new Package / Experience / Frontend / Bridge schemas;
- hard-cut legacy authoring contract where Phase 1 requires it;
- establish minimal `.aui` parser / CST / semantic AST skeleton;
- implement Frontend Source Index;
- implement Canonical Frontend Index / Component IR / View IR;
- implement exact Frontend resource graph;
- implement Compiled Bridge Descriptor skeleton;
- implement Source Map / Provenance;
- wire Build / Package validation path;
- ensure Studio Preview and Production Build use the same compiler entrypoint where Phase 1 requires;
- installed Runtime artifacts must be compiled artifacts, not author source.

Phase 1 acceptance:

- a minimal `frontend.json + Main.aui` compiles through the formal compiler into an exact Runtime Graph;
- invalid source / binding / style / resource references fail closed;
- Preview and Build share the compiler;
- installed Runtime only consumes compiled artifacts;
- author TS/source/npm build scripts are not executed at install/runtime;
- targeted tests for changed contracts/compiler/build paths pass.

## Phase 1 boundaries

Do **not** begin Phase 2.

Specifically do not implement full:

- semantic DOM renderer;
- complete CSS/font runtime;
- visual containment;
- Headless Conversation;
- Collection Read runtime;
- Media Resolver;
- Localization runtime;
- IME runtime;
- Script VM;
- Canvas renderer;
- Studio visual editor.

Phase 1 may create interfaces/schemas needed by later phases, but must not silently implement later phases.

Do not read or update any `reference/*` branch unless the user explicitly authorizes that reference.

Do not merge `main` into `package`, `docs`, `plugin`, or `skills`.

## Start procedure for the new conversation

1. Fetch/recheck real remote refs first.
2. Read, in order:
   - `main:AGENTS.md`
   - `docs:README.md`
   - `docs:HANDOFF.md`
   - `docs:plans/refactor/native-frontend-runtime-v3.md`
   - `docs:records/refactor/native-frontend-runtime-v3.md`
3. Verify `refactor/native-frontend-runtime-v3` real remote HEAD.
4. If `main` advanced after this checkpoint while the task branch still contains no task commits, fast-forward the task branch to the new `main` before implementation and record the new baseline.
5. Work only on `refactor/native-frontend-runtime-v3`.
6. Inspect only directly relevant contract/compiler/build/test code before editing; do not rescan every plan/record/reference.
7. Implement Phase 1 fully, including appropriate tests and push.
8. Ordinary failures, code decisions, merge conflicts and test failures should be handled autonomously.
9. Do not stop until Phase 1 has a concrete tested remote HEAD, unless an actual environment stop condition applies.

## Phase 1 completion checkpoint

At the end of Phase 1:

- update `docs:records/refactor/native-frontend-runtime-v3.md` with:
  - Start HEAD;
  - End/Tested HEAD;
  - exact implementation completed;
  - key decisions;
  - tests/CI actually run;
  - known limitations;
  - Phase 2 next target;
- update this `HANDOFF.md`;
- generate a direct-copy Phase 2 takeover prompt;
- stop and wait for the user;
- do not begin Phase 2 automatically.

## Direct-copy new conversation prompt

```text
你现在正式接手我的 GitHub 项目：

ZZZdragondYNGPHX/Atria

Task ID：

refactor/native-frontend-runtime-v3

当前架构讨论已经完成，Implementation Baseline v1.0 已冻结。

现在正式执行：

Phase 1 — Contract Reset / Compiler Skeleton

不要重新进行 Native Frontend v3 架构讨论，不要重新做 Gap Review，也不要开始 Phase 2。

当前准备状态：

- main baseline：
  191f9f951ccb23cd11d8951e539b8ff6eb8316db
- task branch：
  refactor/native-frontend-runtime-v3
- task branch 当前 HEAD：
  191f9f951ccb23cd11d8951e539b8ff6eb8316db
- Plan：
  docs:plans/refactor/native-frontend-runtime-v3.md
- Plan commit：
  7c34318ef86febb6a101d93015ab97a7f1af9fe2
- Record：
  docs:records/refactor/native-frontend-runtime-v3.md
- 当前尚未修改产品代码，尚未执行 Phase 1 测试/CI。

开始前必须：

1. 重新 fetch / 核对真实远端 refs；
2. 按顺序读取：
   - main:AGENTS.md
   - docs:README.md
   - docs:HANDOFF.md
   - docs:plans/refactor/native-frontend-runtime-v3.md
   - docs:records/refactor/native-frontend-runtime-v3.md
3. 核对 refactor/native-frontend-runtime-v3 的真实远端 HEAD；
4. 若 main 在本 checkpoint 后前进，而 task branch 仍没有任务提交，则先将 task branch fast-forward 到最新 main，并在 Record 中更新真实 baseline；
5. 后续只在 refactor/native-frontend-runtime-v3 上工作。

Phase 1 的权威目标与验收条件以 Plan 的 “Phase 1 — Contract Reset / Compiler Skeleton” 为准。

本阶段核心范围：

- 新 Package / Experience / Frontend / Bridge contract；
- Native Frontend Source Index；
- 最小 .aui parser / CST / semantic AST；
- Canonical Frontend Index / View IR / Component IR；
- exact Frontend resource graph；
- Compiled Bridge Descriptor skeleton；
- Source Map / Provenance；
- Build / Package validation wiring；
- Preview 与 Build 共享 compiler entrypoint；
- installed Runtime 只消费 compiled artifacts。

Hard Cut 已批准：

- 不考虑 Native UI v1/v2 用户数据/作者兼容；
- 不做 migration assistant；
- 不做 compatibility CSS；
- 最终会删除旧 componentModelVersion/v1/v2 Runtime；
- 但 Phase 1 只做本阶段需要的 contract/compiler reset，不提前跨到最终 Legacy Removal。

不要在 Phase 1 实现完整 Phase 2+ 能力，例如：

- 完整 semantic DOM renderer；
- 完整 CSS/font runtime；
- Visual Containment；
- Headless Conversation；
- Collection Read runtime；
- Remote Media Resolver；
- Localization/IME runtime；
- Script VM；
- Canvas renderer；
- Studio visual editor。

普通代码错误、测试失败、常规工程选择、merge conflict 请自行分析、修改、测试、提交、推送并继续，不要因为一般技术问题停下来问我。

只有在：
- Phase 1 已完成并验证；
- CI 进入明显耗时且下一步必须等待；
- 必须依赖 Android/Termux 真机日志；
- 必须依赖真实 UI 截图；
- 或需要我本人权限/Secret/账号操作
时主动暂停。

Phase 1 完成后必须：

- push tested HEAD；
- 更新 docs:records/refactor/native-frontend-runtime-v3.md；
- 更新 docs:HANDOFF.md；
- 记录 Start HEAD / Tested HEAD / 验证 / 未完成；
- 生成可直接复制到新对话的 Phase 2 接手提示词；
- 主动停止，不开始 Phase 2。
```
