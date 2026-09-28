# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Baseline Gate
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Package pressure-test sample: `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference`
- Plan HEAD: `docs@b69e43752544b0338d404fb08c3e8bab0b80a00c`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.16

## 已写入 Plan

- Native Frontend v3 全部前序架构讨论；
- Script Sandbox Runtime；
- 第一轮 Gap Review；
- Gap Resolution A（G-V3-1 ～ G-V3-5）；
- Gap Resolution B（G-V3-6 ～ G-V3-10）。

## 本轮：Second Gap Review / Baseline Gate（尚未写入 Plan）

重新检查：

- Audio / Video / Speech；
- animation choreography；
- local routing/navigation；
- forms / validation；
- drag/drop；
- performance / virtualization / large data；
- mobile / IME / safe-area；
- offline / cache / Remote Media；
- accessibility / locale / RTL；
- Headless Conversation / Session Recovery；
- Component / Hybrid / Full；
- Studio / AI authoring；
- Runtime failure/recovery。

### Gate Result

**没有发现新的、会迫使 Package Presentation / Host Authority / Frontend Host Bridge / Sandbox 边界重构的 architecture blocker。**

现有架构可以进入 Implementation Baseline 收敛阶段。

但冻结前需要把以下 3 个 baseline clarification 正式写入 Plan。

### B-GATE-1 — Frame Scheduler

Script Sandbox 当前只有 timer/yield，不足以优雅支持：

- Canvas animation；
- procedural visualization；
- pointer-following overlays；
- frame-synchronized presentation calculation。

Native v3 baseline 增加 local **Frame Scheduler**：

- `scheduler.frame(callback)` / 等价 API；
- Host-driven frame timestamp；
- callback 自动绑定 Controller/Experience lifecycle；
- dispose/unmount 自动 cancel；
- reduced-motion / visibility / background policy 可由 Host throttle；
- 不保证 wall-clock exact cadence；
- 不用于 World/Game Authority timing。

Canvas command buffer 默认由 frame scheduler 批量 flush。

CSS animation 仍是普通 UI 动画首选；Frame Scheduler 是程序化 presentation 的安全 `requestAnimationFrame` 等价物，不暴露 raw browser rAF/global。

### B-GATE-2 — Layout Measurement / Local Observers

无真实 DOM object 的 Controller 仍需要安全布局信息，否则这些场景不完整：

- Canvas 自适应容器；
- drag geometry；
- virtualized list；
- custom tooltip/popover placement；
- responsive algorithmic layout；
- scroll-aware interaction。

Native v3 baseline 给 declared NodeRef 增加只读 local measurement/observer 能力，例如：

- `measure()` → bounded rect/content/client/scroll metrics；
- `observeResize()`；
- `observeVisibility()/intersection`（bounded）；
- scroll event payload包含安全 scroll metrics；
- pointer capture/release 作为 declared NodeRef local interaction helper。

返回值只能描述 Experience-owned node 在 Experience coordinate space 中的几何信息，不返回真实 DOM node、ownerDocument、Host element identity 或跨 Surface geometry。

Observer/measurement 受 lifecycle/budget/coalescing 管理，Component dispose 自动取消。

### B-GATE-3 — Remote Media Privacy Semantics Correction

Typed Media Catalog / declared origins 可以阻止：

- arbitrary URL construction；
- arbitrary destination；
- raw fetch/network API。

但**不能承诺完全阻止数据外传**：只要 Package 同时能读取某数据并获准访问远程 origin，它仍可能通过“选择哪个已声明远程资源/何时请求”向该 origin 泄露信息。

因此正式安全语义应改成：

> `remote-media` 是受 origin/MediaRef 约束的 External Access Permission，不是“无数据泄露风险”的纯展示能力。

要求：

- install/enable UI 显示 Remote Media origins 与隐私含义；
- Host strip credentials/referrer；
- Host 可使用 privacy proxy/cache 减少 IP/referrer 暴露；
- Host/用户可完全禁用 Remote Media；
- permission-denied/offline 使用 fallback；
- Allowed origin 仍可能观察请求选择/时序，这一点不能虚假保证不存在；
- Package 若不需要联网图片，应使用 Embedded AssetRef；
- static CSS 中所有可能产生资源请求的 URL sink 都必须由 Compiler 分类/解析，不能只检查 `background-image`。

这不是新的 Runtime architecture，而是修正 Permission/Threat Model 的表述。

## 其它复核结论

### Audio / Video / Speech

- 现有 `native-presentation-contract.js` 已有 image/audio/video/speech、volume/loop/motion/fit、Host audio/video/speech capability，可作为 v3 地基。
- Core v3 应允许 embedded typed MediaRef 的 audio/video playback，并提供 local MediaNodeRef/playback controls/events。
- autoplay / user-gesture / visibility policy 由 Host/浏览器约束，Package不能绕过。
- Remote audio/video 不作为 Core v3 必须项；可后续扩展现有 Remote Media policy到对应 MIME。
- 不构成 blocker。

### Animation Choreography

- Full CSS transitions/keyframes + typed dynamic styles + animation/transition events + local scheduler + Script Controller 已足够。
- 不需要 Core v3 再造大型 animation engine。
- 复杂 Canvas/programmatic animation由 Frame Scheduler补齐。
- Web Animations raw browser object 不进入 baseline。

### Local Routing

- Phone/Inventory/Full app 的页面导航可建立在 View + UI state + Overlay + lazy loading 上。
- 可提供 `view.push/replace/back` 作为 local runtime convenience，但不需要 browser History API。
- URL deep-link/browser history routing继续是 future/non-goal，不构成 blocker。

### Forms / Validation

- Semantic DOM form/input + typed UI/Draft state + Declarative Interaction 足够。
- Compiler可将已有 closed data schema复用于 form validation。
- dirty/touched/errors/busy属于 local frontend state。
- file input/upload不进入 baseline，未来走 Host file service。
- 不构成 blocker。

### Drag / Drop / Pointer

- 之前冻结的 typed drag payload/drop zone + pointer events/gesture abstraction足够。
- B-GATE-2 增加 pointer capture与layout measurement后满足复杂拖拽。
- 不使用 raw browser `DataTransfer` 作为 Authority/Host channel。

### Performance

已有架构包含：

- small Frontend Index；
- exact lazy resource graph；
- keyed reconciliation；
- View/Component lazy loading；
- virtualization；
- Collection Read；
- Script budgets；
- media cache；
- bounded projections。

实现 baseline 需再明确 renderer update batching/coalescing（frame/microtask级），但这是实现要求，不需要新 Authority contract。

### Mobile / Offline / Accessibility

- VisualViewport/IME/safe area、responsive env、Remote Media fallback/cache、Localization/RTL、Accessibility diagnostics/FocusScope 已覆盖。
- Offline 模式对 Embedded assets/compiled runtime完整；Remote Media按 cache/fallback degradation。
- 不需要 Service Worker作为 Core Runtime contract。

### Original Goal Check

原始目标“开放几乎完全的前端修改权限”在 Native v3 中可以成立，范围是：

- Package-owned DOM/CSS/fonts/layout/animation/component tree；
- Headless Conversation/Composer；
- local UI interaction/state；
- typed media；
- Canvas + sandbox compute；
- managed or fully custom presentation。

仍故意不开放：

- Host DOM；
- raw browser global/network/storage；
- raw Authority objects；
- arbitrary executable HTML/JS；
- browser top-layer escape；
- true DOM-owning arbitrary SPA runtime（future Web Island）。

这属于明确的 security/authority boundary，不再是 Presentation 能力不足。

## Baseline Gate Decision

**PASS WITH CLARIFICATIONS。**

在 B-GATE-1 ～ B-GATE-3 写入 Plan 后，没有剩余 architecture blocker 阻止冻结 Implementation Baseline v1.0。

下一轮应：

1. 先把 Second Gap Review + B-GATE-1～3 写入 Plan；
2. 将冗长 Discussion Draft 重整为 **Implementation Baseline v1.0**；
3. 明确 Core Baseline / Non-goals / Future seams；
4. 拆实现 Phase 与验收条件；
5. 更新 Handoff 为“Ready for implementation approval”；
6. 仍**不创建实现分支、不写代码**，直到用户明确批准正式开工。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不继续无边界增加浏览器能力。
- 下一轮目标是收敛 Baseline，不是再发散新 feature。
