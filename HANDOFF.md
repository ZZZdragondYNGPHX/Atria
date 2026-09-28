# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@499d5014a1d125a0021afc38a2715a653644258d`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.9

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / Full CSS / Fonts / Shadow boundary.
- Client Interaction Runtime / Package Component System / Script Sandbox.
- Frontend Asset Graph / Remote Media / typed ImageRef / Host Media Resolver.
- Framework Adapter / future Web Island.
- Hard cut legacy Native UI；v3 最终唯一正式 Native UI Runtime。
- Frontend Manifest / Feature / Permission：
  - `runtime.experience.frontend { kind, version, entry }`；
  - native@3 baseline；
  - Runtime Feature 与 Permission 分离；
  - required/optional negotiation；
  - available/unsupported/unavailable/denied projection；
  - permission constraints 与 permission footprint；
  - install UI 分层；
  - Package Traits / Runtime Features / Permissions 语义清理。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Frontend Host Bridge：

- 建立独立、版本化的 `FrontendHostBridge@1`（正式命名可再定），作为 Declarative Runtime、Sandbox Script 与 future Web Island 共同的 Host 语义面。
- Bridge 是“跨 Experience sandbox/renderer 边界的 Host protocol”，不要把 Package 内 NodeRef、timer、component state、local focus/scroll 等本地 UI 操作混进 Host Bridge。
- Bridge transport 可不同：
  - Native Declarative：进程内 adapter；
  - Sandbox Script：structured message/proxy；
  - future Web Island：postMessage / typed RPC；
  但 method semantics、schemas、receipts/errors 必须相同。
- Frontend 不应获得 `WorldSession` / `SessionCore` / repository / DB / raw Host objects。
- 不建议让 Script/Web Island 通过字符串任意选择 `world.commandId`。采用 **declared bridge bindings**：
  - Manifest/ExperienceContract 预声明 frontend 可见 read/action/operation binding IDs；
  - binding 在 Build/Preflight 时解析到现有 World Command、Application Command、Continuity、Shared、Realm、Task、Activity 等正式 typed contract；
  - Frontend 运行时只引用 stable binding ID，例如 `host.action.invoke("buy-item", payload)`；
  - 未声明 binding 永远不可调用。
- Read plane 使用 declared scoped projection，而不是 `world.getState()` / arbitrary query：
  - `host.data.snapshot(bindingId)`
  - `host.data.subscribe(bindingId)`
  - 每个 binding 受现有 Exposure/Perspective/Information contract 约束；
  - 可声明宽 projection，但必须由 Host contract 显式授权；
  - snapshot 带 revision/cursor/version，Web Island 也复用相同 bounded update semantics。
- Write plane 收敛为 `host.action.invoke(bindingId, input)`：
  - binding kind 可映射 world command / application command / continuity / realm / shared 等；
  - Authority 语义继续由底层现有 contract 决定；
  - Bridge 不发明新的 mutation model。
- Long-running plane 建议 `host.operation.start(bindingId, input)`：
  - binding 映射 Model Task / Activity /其它正式长任务；
  - 返回 opaque operation handle/id；
  - 支持 status/progress/stream result/cancel；
  - scheduler/backpressure/timeout/retry 仍 Host-owned。
- Composer 保留专用 `host.composer` service：
  - getDraft / setDraft / append / clear / focus / submit；
  - submission 仍进入现有 Turn / Session 流程。
- Media 保留专用 `host.media` service：
  - resolve ImageRef/AssetRef；
  - prefetch hint / status / release；
  - Script Canvas 获取的是安全 media handle，不是 raw network response；
  - Remote Media 始终经过 Resolver/permission/cache。
- Presentation 保留 Host-only actions：
  - fullscreen / exitFullscreen；
  - scene/media/speech 等已有 Host Presentation 能力；
  - Package 内 view routing、DOM focus/scroll/overlay 默认属于 Frontend Runtime 本地能力，不通过 Host Bridge。
- Input 主要作为 Host environment/event projection；Package 使用 semantic input actions。不要让 Bridge 暴露原始 Host device object。
- Preferences 不提供 generic localStorage：
  - declared typed `prefs` 继续作为 baseline persistent non-authoritative state；
  - baseline 不新增任意 durable KV；
  - 若未来确需大缓存，可另设可驱逐、quota-controlled `frontend-cache@1`，明确不是 Authority。
- Internal navigation/view routing 属于 Package runtime；external URL 则必须 Host-mediated，使用 scheme/origin policy + user gesture/confirm，不能直接 `window.open`。
- Clipboard / file picker / import-export / camera / microphone 等以后通过 permissioned Host services 扩展，不作为裸 browser API。
- Bridge request/receipt 应统一：
  - stable requestId / operationId；
  - completed / cancelled / rejected / failed 等状态；
  - typed result；
  - stable error/reasonCode；
  - revision/conflict metadata；
  - idempotency/retry 由 Host contract 管理，不让不同 renderer 自行发明。
- Bridge call 失败类别至少要可区分 validation / denied / unsupported / unavailable / conflict/stale / cancelled / timeout / rate-limit / host-failure。
- Declarative action IR 与 Script API 应调用同一 binding registry；不能形成两套 action semantics。
- future Web Island 必须严格使用同一 RPC surface，不获得专属裸 Authority API 或额外 Host object。
- Bridge binding declaration 应位于可在加载 UI 前完成验证的 Manifest/Experience Contract 层，而不是藏在运行时脚本里。
- Frontend Host Bridge 的核心目标是“能力尽量广，但入口必须 typed + declared + scoped”，而不是人为减少前端能做的事。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把 Frontend Host Bridge 结论写入 Plan，再讨论：

- Bridge Binding Manifest 的具体数据模型：
  - reads / actions / operations / services；
  - schema 与 binding identity；
  - projection subscription/diff/cursor；
  - action receipt/idempotency；
  - task/activity streaming；
- Package Component 如何声明/继承 Bridge access；
- 是否允许全 Package 默认访问全部 declared bindings，或做 component-level capability narrowing；
- external navigation / clipboard / file import-export 是否纳入 v3 baseline；
- Web Island message protocol 的 origin/session/nonce/handshake 设计是否现在冻结 seam。

## 不要重复

- 不考虑 v1/v2 migration 或旧数据。
- 不重建 legacy compatibility。
- 不重复讨论远程立绘是否允许。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
