# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 5 complete — Phase 6 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 5 Start HEAD: `d96bb5cfcf7690a382961058873c183e965d7298`
- Phase 5 Tested / Pushed HEAD: `cfe7ee99aa96bba7d351f95fea05a8bc4264f42a`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Next: **Phase 6 — Script Sandbox / Canvas**

## Current implementation

Phases 1–4 established the shared compiled resource graph/renderer, containment,
local presentation, scoped typed Bridge, Managed/Headless Conversation, Session
projections/revision guards, Safe Prose/typed Message Blocks and Epoch recovery.

Phase 5 extends those same paths with closed exact media/localization catalogs,
Host media resolver, declared/HostIssued identity refs, remote External Access
Permission and origin disclosure. Browser CORS fetch omits credentials/referrer,
rejects redirects and uses bounded streamed bytes, optional SHA-256 integrity,
cache release/eviction and local fallback. Remote access starts denied; required
access checks consent. Disable/recovery/disposal revokes remote work and URLs.
No remote bytes enter Package builds. Exact audio/video use native controls.

Inert localization supports interpolation/plural/select/Intl formats and locale
fallback/RTL. Locale is presentation only. Composition Lock retains composing
buffer/caret/node identity. Environment projects VisualViewport, occlusion,
keyboard estimate, safe areas, modality, contrast and Host scales. Advisory
accessibility/localization diagnostics reach Preview and Experience Health.

Local Component/media/subtree boundaries handle loading/error/retry and child
resource/style/lifecycle/read/render failure. Retry recreates local subscriptions,
not authority writes. Root/View failure keeps Host recovery. These are the Phase
6 controller failure seams, not an existing Script VM.

Key Phase 5 paths:

- `public/shared/native-frontend-{media,localization,host,presentation,contract}.js`
- `src/native/frontend/{compiler,graph,aui-parser,diagnostics}.js`
- `public/scripts/native/frontend/{media,runtime,platform,bridge,preview-bridge}.js`
- `src/native/{experience-validation,experience-health,contracts}.js`
- `src/native/authoring/studio-service.js` (Preview diagnostics only)
- `src/native/authoring-examples/frontend-v3/README.md`
- `tests/native/frontend-platform.test.js`
- `tests/native/helpers/frontend-platform-fixture.js`
- `tests/frontend/native-frontend-platform.smoke.mjs`

## Validation and limits

Windows / **Node v24.18.0** / Edge headless; FS and SQLite included.

- Broad Native: **102 suites / 1693 tests passed** before final small refinements.
- Adjacent game-runtime + atria-shell: **105 suites / 730 tests passed**.
- Final product-code focused: **7 suites / 123 tests passed**.
- After adding one installed Health assertion: complete Phase 5 suite **22 tests**
  passed, with no intervening product-code change.
- Final Edge: **6 Phase 5 + 6 Conversation + 6 Bridge + 6 presentation scenarios**,
  Component/Hybrid/Full at 1440px/390px; inspected mobile Full screenshot.
- Root lint, final changed JS/MJS/tests lint, final webpack and diff checks passed.
- MySQL/PostgreSQL excluded using existing environment switches.
- No remote CI, physical IME/soft keyboard/device/Android/Termux, other browser,
  production-user Session, external image-server or real-provider E2E claim.
  Media responses are deterministic fixtures; composition/viewport are synthetic.

Bounds: 2 MiB per exact/remote asset; existing 32 MiB graph budget; catalog up to
10000 metadata entries; remote cache 64 entries, eight concurrent requests and
15-second candidate deadline. Direct browser CORS, no privacy proxy; loading hints
advisory. Locale date/time UTC. Keyboard inset estimates viewport occlusion at
scale 1. Accessibility diagnostics are advisory. Full details in the Record.

## Decisions to preserve

- Baseline v1.0 / Hard Cut frozen. No Gap Review or compatibility/migration.
- Package owns presentation; Host owns capabilities, permissions and authority.
- No raw DB, alternative Session/Timeline/scheduler, arbitrary service dispatch,
  general durable KV, browser globals or raw DOM capability.
- Typed Bridge scopes, schema/revision/idempotency and Task Lifecycle intent stay.
- Streaming remains ephemeral; committed messages come from Session projections.
- Authority Epoch remains separate from route/media/boundary request revisions.
- Media is identity-only outside Host; scripts must receive safe MediaHandles.
- Local Boundary retries never silently replay authority writes.
- No reference branch authorization. No Phase 6+ implementation started.

## Next phase and stop procedure

Only start Phase 6 on a new user instruction. Follow the Plan's Phase 6 and Script
Sandbox/Canvas sections: Worker supervisor + isolated VM, exact static module
graph, bounded scoped Controller ABI, budgets/hard termination, recovery and
Canvas2D buffers. Reuse existing Bridge, Frame Scheduler, NodeRefs, media and
Boundary seams. Script must not obtain window/document/fetch/storage or DOM
construction. VM restart must preserve Authority.

Fetch/inspect refs and working trees; reuse task branch and existing docs worktree.
Never reset to main. Finish Phase 6 implementation/validation, push Tested HEAD,
append the same Record and update this live HANDOFF, generate Phase 7 prompt, then
stop. No intermediate main merge or task branch cleanup.

## Direct-copy Phase 6 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 6 — Script Sandbox / Canvas。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 7。

Phase 5 已完成并 push：
- Phase 5 Start HEAD: d96bb5cfcf7690a382961058873c183e965d7298
- Tested task HEAD: cfe7ee99aa96bba7d351f95fea05a8bc4264f42a
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
优先本地 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–4 compiler/renderer/containment/local presentation/typed Bridge、
Managed/Headless Conversation/Session/Prose 和 recovery 已完成。
Phase 5 已有 exact Media Catalog / Image/Audio/Video、Remote/HostIssued refs、
Host resolver/cache/fallback/privacy/permission、Package localization/RTL、
IME Composition Lock、VisualViewport/keyboard/safe-area/accessibility 环境、
编译诊断/Preview/Health、local Component/media/read boundaries 与 Host Root recovery。
入口说明见 src/native/authoring-examples/frontend-v3/README.md 的 Phase 5。

Phase 6 以 Plan 对应章节为唯一权威：
Supervisor Worker；isolated JS VM adapter；JS/TS compile/bundle；
static exact module graph；Controller ABI；scoped capability injection；
CPU/memory/message/outstanding-work budgets；scheduler/timer/frame/yield；
crash/restart recovery；Canvas2D retained/batched Drawing Command Buffer；
source-mapped diagnostics。
Script 不得访问 window/document/fetch/storage 或 DOM construction；
只能使用 Component uses scopes 和安全 NodeRef/MediaHandle；
runaway 能被 Host terminate；VM/Worker 重建不破坏 Session Authority；
Canvas 代表性地图/关系图/动画可运行；pure JS vendor 算法可本地 bundle。
VM 实现按冻结 Plan 的 isolation/budget 条件选型，不重开架构。

复用 typed Bridge/SessionCore/Task scheduler/Frame Scheduler/Media/Boundaries；
不新增平行 authority，不裸读 raw DB，不建立 generic durable KV。
保留 Operation Lifecycle intent、正式 target、revision guards、Epoch revocation；
streaming 不冒充 committed Timeline，raw HTML 不进入 Prose；
local route/media/boundary revision 不作为 Authority Epoch。
Hard Cut 已批准，不做 v1/v2 兼容/迁移；不要提前实施 Phase 7+。
未经授权不读取 reference 分支。普通技术问题、测试失败和常规决策自行修复并推进。

Phase 5 实测：Native 102 suites/1693 tests；game-runtime + atria-shell 105/730；
最终聚焦 7/123；随后新增 Health 断言的 Phase 5 完整 suite 22 tests；
Edge 6 Phase 5 + 6 Conversation + 6 Bridge + 6 presentation 场景；
lint/webpack/diff checks 通过，Node v24.18.0，FS/SQLite。
广泛回归早于最后少量修复，不声称最终 commit 重跑全量。
远程媒体使用 deterministic fixtures；IME/keyboard 使用 synthetic events；
未做 physical IME/soft keyboard、真机、其他浏览器、external server/provider E2E 或 remote CI。
MySQL/PostgreSQL 用现有开关排除。

Phase 6 完成后：适当本地验证并 push tested HEAD；
更新同一 Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 7 接手提示词；停止，不开始 Phase 7。
```
