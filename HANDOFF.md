# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@09f59e9bc0114a4c07c2b0e6f8f29940687a5930`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.12

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / CSS / fonts / components / interaction / optional script.
- Frontend Asset Graph / Remote Media / typed ImageRef.
- Hard cut v1/v2；v3 最终唯一正式 Native UI Runtime。
- Frontend Manifest / Runtime Features / Permissions / negotiation。
- Frontend Host Bridge + Bridge Binding Manifest。
- Native Frontend Source Graph / Canonical Runtime Graph：
  - Source 是 Studio/AI/human authoring authority；
  - IR derived-readonly；
  - `.aui` SFC-like native authoring；
  - compiled index/resource graph；
  - lazy View/Component loading；
  - source maps/provenance；
  - native source first-class；framework adapter compile to same IR。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Script Sandbox Runtime：

- **Worker 只作为 execution supervisor / thread isolation，不作为最终 security sandbox。**
  - Dedicated Worker 可从 Host 侧立即 terminate，适合处理 runaway loop / hung runtime；
  - 但 WorkerGlobalScope 本身仍有 fetch/XHR/WebSocket/IndexedDB 等 Web API，因此 Package code 不能直接运行在裸 Worker global。
- 推荐基线架构：
  ```text
  Main Frontend Runtime
      ⇅ structured messages
  Script Sandbox Supervisor Worker
      └ Embedded isolated JS VM
           ├ Package compiled modules
           ├ standard ECMAScript subset
           └ injected scoped capabilities only
  ```
- JS VM 具体供应商/实现暂不冻结。Implementation 阶段可比较 QuickJS-like embedded engine、WASM-hosted JS VM、平台原生 isolate 等；Plan 冻结的是安全/资源 contract，不把产品架构绑死到单个第三方库。
- 不以 plain Worker、same-realm `Object.freeze`、仅 Proxy、或同 Realm SES-like compartment 作为唯一安全边界。它们可以成为 defense-in-depth / developer tooling，但 baseline 必须具备独立 heap/global + Host 可强制中止的执行边界。
- **一个 active Experience 一个 Worker + 一个 VM** 为当前倾向：
  - 同一 Package 内多个 Controller 属于同一信任域，无需每组件单独 VM；
  - Component-level `uses` 仍通过 capability-handle injection 实现 least-authority；
  - 不同 Experience/Package 不共享 VM heap。
- JS/TS Authoring：
  - 作者可写 modern JS/TypeScript controller；
  - Build 阶段 transpile/bundle/link；
  - Runtime 只加载 compiled sandbox modules；
  - 不运行 TS/source/npm build script；
  - 生成 exact module graph + content hashes + source maps。
- Module graph：
  - 允许 package-local static imports；
  - 允许 vendored/bundled sandbox-compatible pure JS dependency；
  - runtime dynamic import 初版禁止；
  - remote import 永久不作为 baseline；
  - Node built-ins / DOM/browser module / native addon 不可用；
  - dependency 安装与 bundling 发生在作者 Build 环境，不发生在玩家安装时。
- Build static analysis 可以提前发现明显 `window/document/fetch/eval/dynamic import` 等不支持用法，但 Runtime VM 的能力边界才是最终 authority；不能把安全性建立在 lint/regex 上。
- Compiled Controller ABI 与 Authoring Syntax 分离：
  - author TS/JS 可以通过 helper/SFC sugar 编写；
  - compiler 统一成稳定 Controller ABI；
  - ABI 至少支持 module load、component instance create、hook/event invoke、instance dispose、module dispose。
- Controller instance：
  - 每个挂载 Component 可以有自己的 controller instance；
  - controller 获得 readonly props/event/env；
  - 获得 Component-local state handle；
  - 获得 `emit`；
  - 获得 safe NodeRef/CanvasRef（仅显式声明节点）；
  - 获得根据 `uses` 缩权后的 read/action/operation/fixed-service handles；
  - 不获得 global `host`、真实 DOM 或 Authority object。
- Controller JS heap 可以保存临时 cache/算法对象，但被定义为 **ephemeral non-authoritative**：
  - Sandbox Worker 重启时允许丢失；
  - 语义上必须能从 props + declared frontend state + Host projection 重建；
  - 游戏事实/必须持久的 UI preference 不得只存在 JS closure/heap。
- 这允许脚本层独立故障恢复：普通 JS exception 只失败当前 invocation；runaway/engine failure 时 Host terminate Worker，重建 VM/controller instances，继续使用未丢失的 Declarative DOM 与 Frontend State。
- 若重复 crash，可由 Experience Health 禁用 Script Runtime/报告 required-feature failure，而不让整个 Atria Host 崩溃。
- Async model：
  - Promise/async 可以存在；
  - Host Bridge request 是 async typed message；
  - 不给裸 `setTimeout/setInterval` 作为 ambient browser API，优先注入 Experience-scoped scheduler/timer handle；
  - controller dispose 时 timer/pending callback 自动 revoke/cancel；
  - 支持显式 cooperative `yield`，供复杂纯计算分片，避免长任务抢占 UI。
- Clock/random：
  - 游戏 Authority RNG/World time 永远走 Host contract；
  - Sandbox 只需要 non-authoritative UI clock/random；
  - 倾向由 Host/Sandbox Runtime 提供可测试的 monotonic clock + seeded/non-authoritative random service，而不是让 wall clock/random 影响 Authority。
- Resource budgets 不在 Plan 中先写死毫秒/MB 数值，但 contract 必须支持 Host policy：
  - max VM heap；
  - per-invocation CPU/instruction/wall-time budget；
  - per-Experience total script budget；
  - message payload / queue budget；
  - module / bundle bytes；
  - async outstanding request limit；
  - operation/concurrency limit；
  - hard terminate path。
  Package 可提供 workload hint，但 Host caps 优先。
- Bridge/message boundary 使用更严格的 JSON-like/structured-clone-safe typed payload；不跨边界传 Function、DOM node、prototype-rich object。可对 ArrayBuffer/TypedArray 等性能数据做明确 allowlist，而不是默认开放所有 transferable。
- Third-party pure JS：
  - 可以 vendoring/bundle；
  - 必须在无 DOM/network/Node built-in 的 sandbox contract 下工作；
  - 依赖真实 browser DOM 的图表/UI library 不自动兼容 Native Sandbox，应使用 Framework Adapter 改写、Atria graphics shim 或未来 Web Island。
- Canvas2D 当前倾向采用 **retained/batched Drawing Command Buffer**，不把真实 CanvasRenderingContext2D 注入 VM，也不做“每一个 draw call 一次 RPC”：
  - Controller 在 VM 内构造 typed drawing commands；
  - 一次 frame/flush 批量发送；
  - Host 验证预算、Asset/Media handles 后执行；
  - 可支持 paths/text/images/transforms/clips/gradients 等足够宽的 Canvas2D subset；
  - image 只能来自 safe MediaHandle；
  - future 可增加 OffscreenCanvas/graphics fast-path feature，但 baseline 不依赖真实 browser Canvas object。
- WebAssembly 不进入 `frontend-script@1` baseline：
  - 预留 future `frontend-wasm@1`；
  - 将来仍必须在同一 Worker supervisor / Host Bridge / budgets 下；
  - 避免 v3 首版同时维护 JS VM + arbitrary WASM 两种执行安全面。
- Debug：
  - compiled sandbox module 必须保留 controller/source map provenance；
  - Studio 能把 stack/error 指回 `.ts/.js/.aui`；
  - production diagnostics 不泄漏 Host internals；
  - Studio 可以做 controller hot reload：重建 sandbox module/instance，同时尽量保留 Host-side Frontend State。
- Script Runtime 与 Declarative Runtime 的关系继续是“增强而非替代”：
  - DOM/Component tree 仍由 Canonical IR；
  - Script 修改 state / emits / NodeRef presentation handles / Canvas command buffer；
  - 禁止 script createElement/innerHTML/任意 selector 重新成为主要 UI construction path。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把 Script Sandbox 结论写入 Plan，再做一轮完整 **Gap Review / Pressure Test**，重点用真实重前端场景反推缺口：

- 视觉小说 / AI 剧情；
- RPG inventory / equipment / character sheet；
- Phone/IM；
- Church/经营模拟；
- 大型地图/关系图/Canvas；
- AI Task/生成中状态；
- remote portraits；
- mobile/touch/gamepad；
- Full standalone game shell；
- Component chat enhancement；
- Hybrid chat game；
- Studio/AI authoring；
- crash/reload/offline/permission denied；
- 检查是否还有必须开放而当前方案遗漏的前端能力。

若 Gap Review 没有新的架构级缺口，再准备把 Discussion Draft 收敛成 Implementation Baseline，并拆实施阶段。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重复 Remote Media、基础 Host Bridge、Binding Registry、Source Graph。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
