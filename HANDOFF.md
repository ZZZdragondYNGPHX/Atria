# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@0cd2aec2ae00566c5dfe94237de582d70aba805c`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.10

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / CSS / fonts / components / interaction / optional script.
- Frontend Asset Graph / Remote Media / typed ImageRef.
- Hard cut v1/v2；v3 最终唯一正式 Native UI Runtime。
- Frontend Manifest / Runtime Features / Permissions / negotiation。
- Frontend Host Bridge：
  - shared semantics across Declarative / Sandbox / future Web Island；
  - declared Binding Registry；
  - data/action/operation/composer/media/presentation；
  - no raw Host objects；
  - typed receipts/errors/idempotency；
  - no generic durable KV baseline。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Bridge Binding Manifest：

- 建议独立 `bridge.version: 1`，让 Host protocol 可独立于 `native@3` 前端文档演进。
- Authoring Source 的 Bridge Registry 以三类自定义 binding 为主：
  - `reads`
  - `actions`
  - `operations`
- 不建议再做任意第四类 `services` binding table；`composer / media / presentation / external` 是固定 Host Service namespaces，其可用性由 Runtime baseline、Feature 与 Permission negotiation 决定。需要固定目标的 external link 等可编译为 action binding。
- Authoring Manifest 不应重复抄写已有底层 contract schema。Build compiler 解析 target 后生成 **Compiled Bridge Descriptor**：
  - normalized input/output schema；
  - schema/contract digest；
  - delivery/operation capabilities；
  - idempotency/receipt policy；
  - 前端只看到 public binding contract，不需要看到真实 World/Application command internals。
- 建议 authoring shape：
  ```yaml
  bridge:
    version: 1
    reads:
      - id: player-ui
        source:
          kind: information-view
          id: player-display

    actions:
      - id: buy-item
        inputSchema: ...
        target:
          kind: world-command
          commandId: shop.buy
        args: ...safe template...

    operations:
      - id: generate-profile
        inputSchema: ...
        target:
          kind: task
          taskId: profile
          variantId: default
        input: ...safe template...
  ```
- Read binding 原则：target 必须是已有 typed/bounded projection contract，而不是 raw authority。首要 adapter 可引用 existing Information View；continuity/shared/realm/temporal 等应通过其已有 projection contract 适配，避免 `getEverything()`。
- Read delivery baseline：
  - `snapshot()` 必须有；
  - `subscribe()` 可选/声明；
  - update 携带 bindingId + revision/cursor + typed payload；
  - 初版可优先 full replace/coalesced snapshot，避免为了性能提前引入复杂 mutable patch authority；将来可在 Bridge version/feature 中增加 read-only delta。
- Action binding：
  - public input schema 可以与底层 args 不同；
  - binding 可使用现有 safe value-template/expression 把 `input` 映射成 target args；
  - Build 时验证映射输出严格满足目标 typed schema；
  - 因此 Binding 真正成为稳定 Frontend API façade，而不仅是 command alias。
- Action result 默认以统一 Bridge Receipt 为主，不把整个新 Authority state 塞进 action return；权威数据变化通过 read subscription 传播，避免双数据通道。
- Operation binding：
  - target 可映射 Task / Activity / future resumable Host operations；
  - Build compiler materialize input/final result schema；
  - Runtime handle 统一 queued/running/progress/partial/completed/failed/cancelled；
  - cancel 是否支持由 compiled capability 明确；
  - scheduler/backpressure/retry 继续 Host-owned。
- Binding ID 应是稳定 semantic ID；同语义升级尽量保持 ID，便于 Component/Studio/AI contract 稳定。
- **Experience-level Binding Registry 是真正的 Host 安全边界。**
- Component-level `uses:` 定位为 least-authority dependency contract：
  - Declarative component：compiler 默认可以从 data/action/operation refs 自动推导 `uses`，作者无需手填；可显式声明以形成可复用组件接口。
  - Script controller：必须显式声明 `uses`；Runtime 只向该 controller 注入声明过的 binding/service handles，不提供全局 `host` 万能对象。
  - Child/component `uses` 必须是 Experience Registry 的子集，永远不能扩大 Package 权限。
  - 这主要防 accidental coupling、提升 component reuse / static analysis；Package 作者仍可在 Manifest 扩大自身 registry，因此它不是替代用户 Permission 的独立信任边界。
- 普通 Package Component 默认继续遵循 Props down / Events up；无 `uses` 的组件天然是 pure presentation component。
- Fixed Host services 对 Script component 也纳入 `uses.services` narrowing，例如 composer/media/presentation/external；Declarative IR 可由 compiler 自动推导。
- External navigation 倾向进入 v3 baseline Host service：
  - 只允许 declared HTTPS targets / Atria routes；
  - user gesture；
  - scheme/origin validation；
  - Host 可 confirm；
  - 不暴露 `window.open`。
- Clipboard / file picker / import-export / camera / microphone 暂不作为 v3 Core baseline，保留 permissioned Host Service extension seam。Clipboard write 可后续作为较低风险扩展，read 单独权限。
- future Web Island handshake seam 建议现在只冻结安全形态，不展开完整实现：
  - 独立 Browser Realm；
  - structured-clone messages only；
  - Host-issued frontendInstanceId + nonce/token；
  - first handshake negotiate bridgeVersion/features；
  - validate source/origin/instance/nonce；
  - per-request requestId；
  - unmount/reload 立即 revoke；
  - Bridge 仍只暴露同一 compiled bindings/services。
- Binding Registry / Compiled Descriptor 应在 UI 代码执行前完整 validate，Web Island 也不得在运行时自行注册新的 Authority binding。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把 Binding Manifest 结论写入 Plan，再讨论：

- Canonical Native Frontend Document / Authoring Format：
  - root/views/components/styles/state/bridge refs 的文件布局；
  - 是否单文件还是多资源 graph；
  - Component source syntax 与 Canonical IR；
  - CSS/interaction/script controller 如何引用；
  - Studio 与 AI 应操作 Source 还是 IR；
- 或者先讨论 Script Sandbox 的具体执行模型（Worker/VM/WASM）与 JS/TS authoring pipeline。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重复 Remote Media 与基础 Host Bridge。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
