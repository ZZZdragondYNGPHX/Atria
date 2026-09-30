# Atria Native Frontend Runtime v3 — Presentation & Security

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 7. Presentation Runtime

### 7.1 Declarative DOM

安全语义 DOM 采用 allow-safe / block-dangerous 策略，而不是 v2 固定组件白名单。

Baseline 覆盖常用结构、文本、列表、表格、form/input、image/picture、inline SVG 等。

默认禁止：

- script；
- iframe；
- object/embed；
- raw executable HTML；
- meta refresh；
- `javascript:`；
- arbitrary external form action；
- remote executable stylesheet/module。

### 7.2 CSS / Fonts

Package 使用接近真实 Web CSS：

- Flex/Grid；
- CSS variables/layers；
- media/container query；
- pseudo-class/element；
- transitions/keyframes；
- transforms；
- filters/backdrop/mask；
- typography/writing mode；
- variable fonts。

支持 WOFF2/WOFF，以及经策略允许的 TTF/OTF。

Atria Default Theme 是可选默认样式，不是 Runtime Contract。

### 7.3 Static CSS 与 Dynamic Style 分离

静态 CSS 接近完整开放。

Runtime dynamic sink 必须 typed：

- number/integer；
- length/percentage/angle；
- color/opacity；
- typed transform parameters；
- closed enum/token；
- ImageRef/MediaRef。

动态 CSS custom property 必须声明 value type。

任意 Authority/Script string 不得进入未声明 CSS token/resource sink。

### 7.4 Package Component

Props Down / Events Up 为默认模式。

Component local state 每实例独立。

Declarative lifecycle：

- mount；
- unmount；
- activate；
- deactivate；
- propsChanged。

大型集合使用 stable key + keyed reconciliation；Runtime 支持 virtualization。

### 7.5 Overlay / Local Routing

Experience 内有统一 Overlay Root：

- Modal；
- Drawer；
- Tooltip；
- Context Menu；
- Toast；
- Drag Ghost；
- Floating Panel。

Local routing 可基于 View + UI State + lazy loading，并可提供 `view.push/replace/back` convenience。

不依赖 Browser History API。

### 7.6 Forms

Semantic form/input + typed UI/Draft state + closed schema validation。

dirty/touched/errors/busy 都是 local frontend state。

File input/upload 不属于 Core v3；future Host File Service 处理。

---

## 8. Visual Security Boundary

完整 Experience visual boundary：

```text
Shadow DOM Isolation
+
Host-owned Visual Containment
+
Host System/Escape Layer
```

ShadowRoot 负责 selector/style namespace。

Component/Hybrid surface 必须具备：

- containing block；
- paint containment；
- independent stacking context；
- clipping/overflow policy；
- Host-defined bounds。

Package `position: fixed/absolute`、z-index、filter/transform 不得越过授权 Surface。

Package 不直接获得 Browser Top Layer：

- `dialog.showModal`；
- raw popover top layer；
- Package-controlled fullscreen。

Full Mode：

- Package 拥有 Full Stage；
- Host System/Escape Layer 永远在 Package boundary 外。

Host System Layer 至少保留：

- Exit；
- Stop Generation；
- Save/SavePoint；
- Diagnostics；
- Recovery。

Package 无法覆盖、禁用或永久吞掉最后的 Host recovery path。

---

## 9. State / Interaction / Environment

State scopes：

- Component；
- View；
- UI；
- Draft；
- Prefs。

Generic durable KV/localStorage replacement 不属于 Core v3。

未来若需要大型缓存，使用独立 `frontend-cache@1`，必须 evictable / quota-controlled / non-authoritative。

Interaction Runtime 覆盖：

- click/dblclick/contextmenu；
- pointer；
- keyboard；
- focus；
- input/change/submit；
- scroll/wheel；
- drag/drop；
- animation/transition events；
- gesture abstraction；
- longpress/swipe/pinch；
- typed Input Actions。

复杂逻辑优先 Declarative Interaction；只有算法/Canvas/复杂 controller 使用 Sandbox Script。

### 9.1 Frame Scheduler

Core v3 提供安全的 local Frame Scheduler：

- `scheduler.frame(...)` / 等价 API；
- Host-driven frame timestamp；
- Controller/Experience dispose 自动 cancel；
- background / visibility / reduced-motion 可由 Host throttle；
- 不保证 wall-clock exact cadence；
- 不用于 World/Game Authority timing。

Canvas command buffer默认在 frame boundary批量 flush。

### 9.2 Layout Measurement / Local Observers

Declared NodeRef 提供只读、bounded local geometry能力：

- `measure()`；
- `observeResize()`；
- `observeVisibility()/intersection`；
- scroll metrics；
- pointer capture/release。

结果只描述 Experience-owned node 在 Experience coordinate space 中的 geometry。

不得暴露真实 DOM、ownerDocument、Host element identity 或跨 Surface geometry。

Observer 生命周期与 Component 绑定并受 budget/coalescing 管理。

---

## 10. Frontend Host Bridge

定义独立 `bridge.version = 1`。

Bridge 是跨 Declarative/Sandbox/future Web Island 的唯一 Host protocol。

Frontend 不获得：

- WorldSession；
- SessionCore；
- repository；
- database；
- raw Host service object；
- arbitrary command selector。

### 10.1 Binding Registry

Experience-level Registry 是真正 Host 安全边界。

自定义 Binding 只有：

- Reads；
- Actions；
- Operations。

固定 Host services 不允许 Package 自定义注册。

Authoring Binding 经过 Build 编译为 **Compiled Bridge Descriptor**，物化：

- stable binding id；
- public input/output schema；
- target contract identity；
- contract/schema digest；
- safe mapping；
- feature/permission requirement；
- receipt/idempotency policy。

### 10.2 Reads

Read 分为：

- snapshot read；
- collection read。

Snapshot 支持 `snapshot/subscribe`，携带 revision/cursor/schema identity。

Collection Binding 声明：

- query schema；
- item schema；
- hard page size；
- stable ordering；
- allowed filter/search；
- source adapter；
- optional invalidation/live-tail policy。

Cursor 是 Host opaque token，绑定 binding/query/revision/order。

不开放 arbitrary DB query。

### 10.3 Actions

`host.action.invoke(bindingId, input)` 表示短 typed transaction。

Binding public input 可与底层 Command args 不同，通过 safe mapping 编译到目标 schema。

Action 返回统一 Bridge Receipt，不返回整份 Authority state；权威变化通过 Read projection 更新。

### 10.4 Operations

`host.operation.start(bindingId, input)` 承载 Task/Activity/long-running Host operation。

统一状态：

- queued；
- running；
- progress/partial；
- completed；
- failed；
- cancelled。

Scheduler/provider/secret/retry/backpressure 继续 Host-owned。

### 10.5 Component `uses`

Declarative Component 可由 Compiler 自动推导 `uses`。

Script Controller 必须显式声明 `uses`。

Child `uses` 只能是 Experience Registry 的子集。

Script 不获得 global万能 `host` object，而获得编译后的 scoped handles。

---
