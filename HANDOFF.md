# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 3 complete — Phase 4 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 3 Start HEAD: `91c45cc3b3a04346f2ac87baa73adb3215ebd6b1`
- Phase 3 Tested / Pushed HEAD: `0d6fb049940a7ad460e70ef0badc8fd2412fb439`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Completed: **Phase 3 — Host Bridge / Data Plane**
- Next: **Phase 4 — Conversation / Session / Prose**

## Current implementation

Phases 1–2 established the Source Index / `.aui` CST/AST / canonical IR / exact
compiled graph / shared Build+Preview compiler, then the shared Play+Preview
renderer, CSS/font pipeline, containment, local state/interactions, forms/routes,
overlays, Frame Scheduler, NodeRef, responsive environment and keyed lists.

Phase 3 turns the Bridge skeleton into the executable v1 data plane:

- Installed Experience Registry and scoped Component handles; declarative `uses`
  inference; target/schema/descriptor identity checks and closed safe mapping.
- Snapshot and bounded Collection Reads from exact Package Data and the existing
  Application projection, with opaque query/revision/order/Epoch-bound cursors.
- Typed Application Actions via SessionCore, scoped idempotency and strict CAS.
- Typed Task Operations via the existing Generation Host/Task scheduler, with
  Host-owned saved slot bindings, status/cancel/replay and schema-checked completed
  payloads. No raw provider stream, secret or authority snapshot is returned.
- Shared versioned Receipt/Error protocol, copied fixed Prefs/environment
  projections, same compiled semantics for declarative and future Script callers.
- Experience Epoch independent of local route revision. Branch publication,
  restore (including no-op restore), reload/disposal revoke handles and async
  work. Late responses, stale queries and superseded opens cannot repopulate it.
- Play uses authenticated installed-graph endpoints. Preview shares the compiled
  client/schema/query layer with immutable owner-checked projections and returns
  `bridge_preview_readonly` for writes. It never simulates a second authority.

Key paths:

- `src/native/frontend/{bridge,host-bridge,epoch,compiler,graph}.js`
- `public/shared/native-frontend-bridge.js`
- `public/scripts/native/frontend/{bridge,preview-bridge,runtime}.js`
- `src/endpoints/native-session.js`
- `src/native/session-core.js`
- `public/scripts/native/experience/{index,ui/live}.js`
- `src/native/authoring-examples/frontend-v3/README.md`
- `tests/native/frontend-bridge{,-client}.test.js`
- `tests/native/helpers/frontend-bridge-fixture.js`
- `tests/frontend/native-frontend-bridge.smoke.mjs`

## Validation

Local Windows / Node v24.16.0 / Edge headless only:

- All **99 Native suites** passed across resumed batches: 43 successful suites
  before interruption plus the remaining **56 suites / 499 tests**, with distinct
  path coverage checked. No invented aggregate for the interrupted Jest process.
- game-runtime: **50 suites / 492 tests passed**.
- Final focused: **11 suites / 307 tests passed**, including **27 new Bridge tests**.
- Edge: six Bridge scenarios and six existing presentation scenarios, each across
  Component/Hybrid/Full at 1440px and 390px. Typed real local SessionCore Action,
  subscription, pagination, recovery, read-only Preview and Phase 2 regressions.
  Mobile Full Bridge screenshot inspected; no page errors/runtime diagnostics.
- Full root lint, final changed-code/test lint, final webpack and diff checks pass.
- Fresh-clone SQLite binding was initially missing because install scripts are
  disabled by repository policy. Rebuilt only `better-sqlite3`, verified an
  in-memory query, then resumed FS/SQLite validation. `.npmrc` was not changed.
- MySQL/PostgreSQL excluded using the existing environment switches. No remote
  CI, physical device/Android/Termux, other browser, real-provider Operation E2E
  or production-user Session claim. See the Record for exact evidence and bounds.

## Decisions to preserve

Package owns presentation; Host owns capabilities and authority. Baseline v1.0
and Hard Cut are frozen. Do not reopen architecture, repeat Gap Review or add
v1/v2 compatibility/migration. Temporary old runtime code remains for Phase 9.

Current Bridge source adapters are `package-data@1` and `application@1` only.
Collections use unique ascending scalar order, declared equality filters and
literal substring search; no raw DB query. Action targets fix domain/command /
record identity; mapping is only public input paths or schema-checked constants.
Operation output is the selected Task variant's public schema. Lifecycle-intent
requirements stay enforced by the typed target; frontend bindings cannot bypass
an Application-command-sink Task's durable intent requirement.

Idempotency is scoped to Epoch + binding; no automatic stale-write rebase/retry.
Already accepted transactions are not rolled back by presentation disposal, but
late UI completion is discarded and new mounts reread committed projections.

Read subscriptions and Operation observers use bounded polling, not a new durable
authority/event store. Limits: 128 Experiences/service, 30-minute token lifetime,
256 write keys, 512 cursors, 64 Operations/Experience; 64 read subscriptions and
64 Operation observers/Component; collections at most 10000 source items and
256 items/page. Exhaustion and unknown protocol/schema identities fail closed.

Local route changes are not authority Epoch changes. Recovery resets local
Component/View/UI/Draft state and reloads declared Prefs from the existing Host
account adapter. Future Script must reuse the existing scoped compiled handle
layer, not obtain a global Host object or independent binding interpreter.

## Next phase only

Phase 4 follows the Plan's own section:

- Managed Conversation/Composer migration to one Headless contract;
- committed message Collection and GenerationProjection;
- reply alternative and branch controls;
- fixed `host.composer`, `host.conversation`, `host.session`;
- Safe Prose AST and Message Block integration;
- save/reload/recovery/diagnostics and Host Failure Surface.

Acceptance: Managed/Headless semantics agree for the same Session; streaming never
masquerades as committed Timeline; retry/fork/switch/save/restore have revision
guards; raw HTML cannot enter Prose; Full/Hybrid can present Conversation without
Host-owned message DOM.

No Phase 4 implementation has started. Do not jump into Phase 5+ Remote Media,
Localization/IME, Script VM/Canvas or Studio visual editor. No reference branch
may be read or updated without separate explicit authorization.

## Resume and stop procedure

Fetch real refs and inspect dirty changes. Read AGENTS.md, docs:README.md, this
HANDOFF, the Plan and the same Record. Reuse the existing task branch and docs
worktree; never reset task commits to main. Protect unrelated checkouts/changes.
Use local Git/files/search/tests/builds, not remote API simulations of Web flows.
The former empty-directory issue is resolved; this checkout now has the tested
Phase 3 task branch.

Only begin Phase 4 on the next user instruction. Complete its implementation and
local validation, push tested HEAD, append the same Record and refresh HANDOFF,
generate the Phase 5 prompt, then stop. No merge/main cleanup at this checkpoint.

## Direct-copy Phase 4 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 4 — Conversation / Session / Prose。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 5。

Phase 3 已完成并 push：
- Phase 3 Start HEAD: 91c45cc3b3a04346f2ac87baa73adb3215ebd6b1
- Tested task HEAD: 0d6fb049940a7ad460e70ef0badc8fd2412fb439
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
本地优先直接 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–2 compiler/renderer/containment/local presentation 基础已经完成。
Phase 3 已有可执行 Frontend Host Bridge v1、Experience Registry、scoped uses、
Snapshot/Collection Read、opaque cursor、typed Application Action/Task Operation、
统一 Receipt/Error、safe mapping、idempotency/CAS、Experience Epoch 和 stale revocation、
Prefs/environment fixed projections；Play/Preview 共用 compiled semantics。
入口说明见 src/native/authoring-examples/frontend-v3/README.md。

Phase 4 以 Plan 对应章节为唯一权威：
Managed Conversation/Composer 迁移到统一 Headless contract；committed message collection；
GenerationProjection；Reply alternative / branch controls；
host.composer / host.conversation / host.session；Safe Prose AST；Message Block integration；
SavePoint/reload/recovery/diagnostics；Host Failure Surface。
同一 Session 的 Managed/Headless 语义一致；streaming 不冒充 committed Timeline；
retry/fork/switch/save/restore 必须有 revision guard；raw HTML 不进入 Prose；
Full/Hybrid 自绘 Conversation 不依赖 Host-owned message DOM。

不要新增平行 authority 或绕开 typed target。复用现有 Bridge/SessionCore/Task scheduler。
当前 Bridge collection 只经 Package Data/Application adapter；不要裸读 raw DB。
现有 Operation 的 Lifecycle intent 要求继续保留；不能绕过正式 target 的限制。
不要把 Phase 2 local route revision 当成 authority Epoch。
Hard Cut 已批准，不做 v1/v2 兼容/迁移，不提前实施 Phase 5+。
不要未经授权读取 reference 分支。普通技术问题、测试失败和常规决策自行修复并推进。

验证基线：Native 99 suites 分批全部通过；game-runtime 50 suites/492 tests；
最终聚焦 11 suites/307 tests；Edge 6 个 Bridge + 6 个 presentation 场景；
lint/webpack/diff check 通过。Node v24.16.0；FS/SQLite 已验证。
MySQL/PostgreSQL 用现有开关排除；不声称 remote CI、真机、其他浏览器或真实 provider E2E。

Phase 4 完成后：适当本地测试/构建并 push tested HEAD；
更新同一 Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 5 接手提示词；停止，不开始 Phase 5。
```
