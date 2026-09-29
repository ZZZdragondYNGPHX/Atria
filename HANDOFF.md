# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 6 complete — Phase 7 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 6 Start HEAD: `cfe7ee99aa96bba7d351f95fea05a8bc4264f42a`
- Phase 6 Tested / Pushed HEAD: `99018afb750fc651c0d00f4d56a5bb946b8408e7`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Next: **Phase 7 — Studio / AI Authoring**

## Current implementation

Phases 1–5 established the canonical compiler/resource graph, renderer and visual
containment, local presentation, typed/scoped Bridge, Managed/Headless
Conversation, Session projections/revision guards, Prose, exact/remote media,
localization, input/environment, boundaries and Authority Epoch recovery.

Phase 6 adds `.aui` Controller refs and exact static JS/TS module artifacts.
Build transpiles/links package-local explicit JS/TS imports; install validates
syntax/closure/source maps independently. Runtime executes compiled modules only.
QuickJS 0.32.0 runs in a dedicated Worker with separate guest heap/global limits
and main-thread hard termination. Package code never runs in the Worker/browser
JS realm. There is no ambient browser/network/storage/DOM or Package WASM access.

Controllers receive readonly snapshots, component state, declared emits, the
existing Component `uses` Bridge handles, safe NodeRefs and scoped MediaHandles,
timer/frame/yield and UI clock/random. Typed targets, revisions, idempotency and
Operation Lifecycle remain authoritative. No alternate scheduler/DB/KV exists.

Canvas uses validated retained command batches and the existing Frame Scheduler.
Host contexts and decoded images never enter the VM. Media keeps existing
permissions/fallback; permission changes revoke handles and already-drawn buffers.
Map/relationship/animation, unmodified third-party pure JS `droll`, and exact
entry/vendor source-map diagnostics are verified.

VM failures rebuild at most twice from Host component state, without SessionCore
reload or Authority Epoch changes. Recovery never replays Actions/Operations/
emits; fresh user events and async continuations use revocable local intent tokens.
Optional failure/missing Controller resources keep declarative fallback. Ordinary
required errors use local/root boundaries; repeated budget/engine failure
escalates to the Host View surface.

Key paths:

- `public/shared/native-frontend-script.js`
- `src/native/frontend/script-compiler.js`, compiler/graph/AUI integration
- `public/scripts/native/frontend/{script,script-vm,script-worker,canvas,runtime}.js`
- `webpack.config.js`, `src/middleware/webpack-serve.js`
- `src/native/experience-validation.js`
- `src/native/authoring-examples/frontend-v3/README.md` (Phase 6 ABI/bounds)
- `tests/native/frontend-script.test.js`, Script cases in Bridge/v3 tests
- `tests/native/helpers/frontend-script-fixture.js`
- `tests/frontend/native-frontend-script.smoke.mjs`

## Validation and limits

Windows / **Node v24.16.0** / Edge headless; FS and SQLite included.

- Broad Jest `native` pattern: **116 suites / 1790 tests passed**.
- Adjacent game-runtime/shell/webpack/startup: **108 suites / 743 tests passed**.
- Later focused Script/compiler/Bridge/media: **4 suites / 90 tests passed**.
- Final complete Script suite after added budget assertions: **26 tests passed**.
- Final Edge Script: **12 scenarios**; adjacent **6 presentation + 6 Bridge +
  6 Conversation + 6 Phase 5 media** scenarios. Mobile Full screenshot inspected.
- Root lint, final changed-code/test lint, webpack and diff checks passed.
- Broad tests preceded final small refinements; do not claim full regression on
  final commit. Record includes ordering and the repaired WebM recording fixture.
  MySQL/PostgreSQL were excluded with existing switches.
- No remote CI, physical IME/keyboard, device/Android/Termux, other browser,
  production-user Session, external media server or real-provider E2E claim.

Policy: 16 Controllers; 8 MiB guest heap/256 KiB stack each; 40ms cooperative
deadline/1s hard watchdog (10s startup); aggregate 2s execution/10s; 64 modules/
512 KiB code; 128 KiB messages; 64 queue entries; 32 async/4 live Operations per
Controller. Canvas: 2048 commands, 2048px/dimension, 32 save levels, 16 surfaces/
8M pixels per Experience. Native VM ops may reach the hard watchdog; guest heap
bounds exclude engine/Worker overhead. Frames return `{time, animation}` for
visibility/reduced motion. No full TS type-checking, runtime npm or bare imports.

## Preserve decisions and next checkpoint

- Baseline v1.0 / Hard Cut frozen. No architecture/Gap Review redo or reference reads.
- Source→Compiler→derived-readonly IR; Preview/Production share semantics.
- Package owns presentation; Host owns capabilities and authority.
- No raw DB, generic durable KV, browser globals, raw DOM or parallel Session /
  Timeline / Task / Bridge authority. Streaming is not committed Timeline;
  raw HTML does not enter Prose.
- Preserve Component `uses`, formal targets, revision guards, idempotency and
  Operation Lifecycle intent. Media remains identity-only outside Host.
- VM/media/route/boundary generations are local revocation tokens, not Authority
  Epoch. Recovery must not silently replay writes.

Only start Phase 7 on a new user instruction. Follow the frozen Plan: native `.aui`
editor, format-preserving structured edits, Source Graph browser, View/Component/
style/state/bridge/localization editors, formal Preview, source diagnostics,
AI semantic patches, feature/permission visibility and accessibility/localization/
Health. Studio must edit source, not IR, and preserve comments/format where possible.

Fetch/inspect refs and worktrees; reuse task branch and existing docs worktree.
Never reset to main. Finish Phase 7, validate/push Tested HEAD, append this same
Record, refresh HANDOFF, generate Phase 8 prompt and stop. No intermediate main
merge, branch cleanup or Phase 8 implementation.

## Direct-copy Phase 7 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 7 — Studio / AI Authoring。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 8。

Phase 6 已完成并 push：
- Phase 6 Start HEAD: cfe7ee99aa96bba7d351f95fea05a8bc4264f42a
- Tested task HEAD: 99018afb750fc651c0d00f4d56a5bb946b8408e7
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
优先本地 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–5 compiler/renderer/containment/local presentation/typed Bridge、
Managed/Headless Conversation/Session/Prose、Media/localization/input/environment、
Boundaries 与 recovery 已完成。Phase 6 新增 QuickJS Supervisor Worker、
isolated VM、JS/TS static exact module graph、Controller ABI/uses scopes、
CPU/heap/message/async/Operation budgets、timer/frame/yield、crash recovery、
Canvas2D retained command buffer、安全 NodeRef/MediaHandle、source-mapped diagnostics。
入口说明见 src/native/authoring-examples/frontend-v3/README.md 的 Phase 6。
Worker/VM 重建保持 Host component state 和 Session Authority；禁止自动重放写入。

Phase 7 以 Plan 对应章节为唯一权威：
Native .aui editor；format-preserving structured edits；Source Graph browser；
View/Component/style/state/bridge/localization editors；Preview 复用正式 Compiler/Renderer；
Source Map diagnostics；AI semantic patch surface；permission/feature visibility；
Accessibility/Localization/Health diagnostics。
Studio 不直接改 derived IR；Preview 与 Production 不建第二套语义；
AI 按 semantic ID 修改 Component/Node/Binding；尽量保留 source comments/format；
invalid frontend 在 Build 前得到 source-level diagnostics。

复用现有 Studio/Authoring/Preview/Health、typed Bridge/SessionCore/Task/Frame/Media；
不新增平行 authority，不裸读 raw DB，不建立 generic durable KV。
保留 Operation Lifecycle intent、正式 target、revision guards、Epoch revocation；
streaming 不冒充 committed Timeline，raw HTML 不进入 Prose；
local route/media/boundary/VM generation 不作为 Authority Epoch。
Hard Cut 已批准，不做 v1/v2 兼容/迁移；不要提前实施 Phase 8+。
未经授权不读取 reference 分支。普通技术问题、测试失败和常规决策自行修复并推进。

Phase 6 实测：Native pattern 116 suites/1790 tests；相邻 108/743；
后续聚焦 4/90；最终 Script suite 26 tests；
Edge 12 Script + 6 Phase 5 + 6 Conversation + 6 Bridge + 6 presentation 场景；
lint/webpack/diff checks 通过，Node v24.16.0，FS/SQLite。
广泛回归早于最后少量修复，不声称最终 commit 重跑全量。
媒体/Bridge 使用 deterministic fixtures，未做 physical IME/soft keyboard、
真机、其他浏览器、external server/provider E2E 或 remote CI。
MySQL/PostgreSQL 用现有开关排除。

Phase 7 完成后：适当本地验证并 push tested HEAD；
更新同一 Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 8 接手提示词；停止，不开始 Phase 8。
```
