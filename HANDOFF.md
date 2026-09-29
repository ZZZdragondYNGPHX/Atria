# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 4 complete — Phase 5 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 4 Start HEAD: `0d6fb049940a7ad460e70ef0badc8fd2412fb439`
- Phase 4 Tested / Pushed HEAD: `d96bb5cfcf7690a382961058873c183e965d7298`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Next: **Phase 5 — Media / Localization / Input / Accessibility / Boundaries**

## Current implementation

Phases 1–3 established the shared compiler/compiled graph, Play/Preview renderer,
CSS/fonts, containment, local interactions/state/forms/routes/overlays, NodeRef,
Frame Scheduler, scoped Host Bridge, typed Application/Task adapters, bounded
collections/cursors, schema/mapping/idempotency/CAS and Experience Epoch.

Phase 4 adds the closed fixed target catalogue for `host.composer`,
`host.conversation` and `host.session`, preserving those same Bridge semantics.
Managed and Package-owned Headless presentation consume shared committed message
and typed Message Block projections. GenerationProjection is separate ephemeral
state; submit/regenerate/cancel use existing Host generation/Task paths.

SessionCore adapters provide message collections, exact inspect, branch/reply
alternatives, status/tail, SavePoint and guarded retry/fork/switch/save/restore.
SavePoint cursor fingerprints include the source, since saves do not publish a
Session revision. Collections subscribed through `read=` refresh their first
page on revision changes; explicit `read.page` navigates cursors.

`bind:prose` derives inert semantic DOM from canonical text with exact validated
AST mapping. HTML is literal text, safe links enter Host navigation policy, and
Message Blocks stay separate typed data. Their closed schemas are pinned by
compiled blocks targets and checked by SessionCore at commit/load. Full/Hybrid
needs no Host-owned message DOM.

Epoch recovery synchronizes the existing Managed Session runtime after server
branch changes before rebinding. Old generation Drafts are discarded, not
persisted on the new branch. A failed rebind leaves a usable Host Failure Surface
outside Package CSS. Restart is policy-denied unless Host supplies explicit
confirmation/restart handlers; Preview remains read-only.

Key Phase 4 paths:

- `public/shared/native-frontend-host.js`
- `public/shared/native-safe-prose.js`
- `src/native/frontend/{bridge,host-bridge,host-services}.js`
- `public/scripts/native/frontend/{bridge,conversation,external,runtime}.js`
- `public/scripts/native/{play-product,play-generation,session-runtime}.js`
- `src/native/session-core.js`
- `src/native/authoring-examples/frontend-v3/README.md`
- `tests/native/frontend-{conversation,prose}.test.js`
- `tests/native/helpers/frontend-conversation-fixture.js`
- `tests/frontend/native-frontend-conversation.smoke.mjs`

## Validation and limits

Actual current environment: Windows / **Node v24.18.0** / Edge headless.

- Broad Native: **101 suites / 1671 tests passed** before final refinements.
- game-runtime + atria-shell: **105 suites / 730 tests passed**.
- Final tested-tree focused: **8 suites / 157 tests passed**, covering final
  Session projection/Epoch and fixed-service/client/renderer/generation/Managed.
- Edge: **6 Conversation + 6 Bridge + 6 presentation scenarios passed**,
  Component/Hybrid/Full at 1440px and 390px. Conversation rerun on final tree,
  including pending-submit cancel and recovery-failure retry. Mobile Full
  screenshot inspected; no page errors/unexpected diagnostics.
- Root lint, final changed-code/test lint, webpack and diff checks passed.
- FS/SQLite included. MySQL/PostgreSQL excluded by existing environment switches.
- No remote CI, real-provider E2E, physical device/Android/Termux, production-user
  Session or other-browser claims. Browser generation is a deterministic adapter;
  actual committed operations use a local real SessionCore fixture.

Prose is bounded (65536 chars / 4096 nodes / bounded nesting), not arbitrary
Markdown/HTML. Managed Message Block cards are inert; packages own custom typed
Components and separately declared guarded actions. Missing fixed Preview data
fails with `bridge_projection_unavailable`, not a fake Session. Full details and
all historical phases remain in the same Record.

## Decisions to preserve

- Baseline v1.0 and Hard Cut frozen. No architecture reopening or Gap Review.
- Package owns presentation; Host owns authority, permissions and capabilities.
- No raw DB reads, alternate Timeline store/scheduler, unrestricted Host object,
  arbitrary service method dispatch or untyped target bypass.
- Existing Task Lifecycle intent requirements remain enforced.
- Authority Epoch is not the Phase 2 local route revision. Restore/switch/reload
  revoke old scopes/cursors and discard late completion.
- Streaming never masquerades as committed Timeline. Alternative replies remain
  distinct committed messages/branch lineage, not legacy Swipes.
- Message Blocks remain separate from Prose and cannot manufacture authority.
- No v1/v2 compatibility/migration. Temporary old runtime remains for Phase 9.
- No reference branch authorization has been given.

## Next phase and stop procedure

Only start Phase 5 on the next user instruction. Read the Plan's Phase 5 section
and its corresponding baseline sections. Scope: Frontend Media Catalog; exact
image/audio/video; Remote ImageRef/HostIssuedMediaRef; resolver/cache/fallback/
privacy; Package localization/RTL; IME Composition Lock; VisualViewport/keyboard
inset; accessibility environment/diagnostics; Error/Loading Boundaries.

Acceptance includes remote portraits outside Package bytes, denied/offline
fallback, rejection of arbitrary runtime URL construction, stable CJK composition,
usable soft-keyboard input, locale/RTL changes without Session Authority reload,
and contained child resource/controller/read failures.

Fetch/inspect actual refs and working trees; reuse the task branch and existing
docs worktree. Never reset to main. Finish Phase 5 implementation/validation,
push tested HEAD, append this same Record and refresh live HANDOFF, generate the
Phase 6 prompt, then stop. No main merge/cleanup at intermediate checkpoints.

## Direct-copy Phase 5 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 5 — Media / Localization / Input / Accessibility / Boundaries。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 6。

Phase 4 已完成并 push：
- Phase 4 Start HEAD: 0d6fb049940a7ad460e70ef0badc8fd2412fb439
- Tested task HEAD: d96bb5cfcf7690a382961058873c183e965d7298
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
优先本地 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–3 compiler/renderer/containment/local presentation/typed Bridge 已完成。
Phase 4 已有统一 Managed/Headless projections 和 Composer contract、
committed message collection、独立 GenerationProjection、reply alternative/branch controls、
host.composer / host.conversation / host.session 的 closed typed targets、
Safe Prose AST / bind:prose、独立 typed Message Blocks、SavePoint guards、
Managed Epoch 同步、reload/recovery/diagnostics 和 Host Failure Surface。
入口说明见 src/native/authoring-examples/frontend-v3/README.md。

Phase 5 以 Plan 对应章节为唯一权威：
Frontend Media Catalog；Exact Image/Audio/Video；Remote ImageRef / HostIssuedMediaRef；
Media Resolver/cache/fallback/privacy；Package Localization / RTL；
IME Composition Lock；VisualViewport/keyboard inset；
Accessibility environment/diagnostics；Error/Loading Boundaries。
大量 Remote Portrait 不打入 Package bytes；denied/offline 有 fallback；
拒绝 arbitrary runtime URL construction；CJK composition 不被 rerender 破坏；
soft keyboard 下输入区可用；locale/RTL 切换不重载 Session Authority；
child resource/controller/read failure 不默认整页白屏。

复用现有 typed Bridge/SessionCore/Task scheduler，不新增平行 authority，不裸读 raw DB。
保留 Operation 的 Lifecycle intent 和正式 target 限制。
Managed/Headless 同一 Session 语义一致，streaming 不冒充 committed Timeline；
所有 retry/fork/switch/save/restore 保持 revision guard；raw HTML 不进入 Prose。
不要把 local route revision 当作 authority Epoch。
Hard Cut 已批准，不做 v1/v2 兼容/迁移；不要提前实施 Phase 6+。
未经授权不读取 reference 分支。普通技术问题、测试失败和常规决策自行修复并推进。

Phase 4 验证：Native 101 suites/1671 tests；game-runtime + atria-shell 105 suites/730 tests；
最终聚焦 8 suites/157 tests；Edge 6 Conversation + 6 Bridge + 6 presentation 场景；
lint/webpack/diff check 通过。当前实测 Node v24.18.0，FS/SQLite 已验证。
广泛回归在最后少量修复前完成，最终聚焦覆盖 Tested HEAD；不要声称重复跑过全量。
MySQL/PostgreSQL 用现有开关排除；没有 remote CI、真机、其他浏览器或真实 provider E2E 声称。

Phase 5 完成后：适当本地验证并 push tested HEAD；
更新同一 Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 6 接手提示词；停止，不开始 Phase 6。
```
