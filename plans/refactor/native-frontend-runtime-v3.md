# Atria Native Frontend Runtime v3

## 任务信息

- Task ID：`refactor/native-frontend-runtime-v3`
- 类型：大型架构 / Native Frontend 重构
- 状态：**Implementation Baseline v1.0 — Phase 1 Ready**
- Primary Workspace：`main`
- 实现分支：`refactor/native-frontend-runtime-v3@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Source Baseline：`main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan：`docs:plans/refactor/native-frontend-runtime-v3.md`
- Implementation Record：`docs:records/refactor/native-frontend-runtime-v3.md`（Phase 0 已建立）
- 兼容策略：**Hard Cut / Clean Break**

本 Baseline 由 Native UI v2 在真实 Heavy Frontend Package 中暴露出的 CSS、字体、DOM、交互、Conversation presentation 与复杂应用能力上限触发。经过两轮 Gap Review 后，当前方案已通过架构 Gate；后续实现不得重新退回“Host-owned fixed UI + 少量 Package appearance props”的路线。

---

## 1. 产品目标

Atria Native Frontend v3 的目标不是给 Native UI v2 增加更多白名单属性，而是把 Atria 的 Package 前端升级为一个真正的 **Native Frontend Runtime**：

> **Package owns presentation. Host owns capabilities and authority.**

Package 应能够几乎完全控制自己的游戏/应用前端，包括 DOM、CSS、字体、布局、组件、动画、响应式、Headless Conversation、Phone/IM、经营面板、Inventory、Visual Novel、Remote Portrait、Canvas 与受控前端计算。

Host 继续拥有 World / Session / Memory / Continuity / Realm / Shared、Model / Provider / Secret、Session/Timeline/Branch、裸网络、文件系统、Host DOM、浏览器全局环境、权限、调度、恢复与最终安全边界。

“几乎完全前端权限”指 Presentation/Interaction 自由，不指 Browser/Host/Authority 裸权限。

---

## 2. 架构不变量

### 2.1 Experience Mode 只表示布局所有权

`Component / Hybrid / Full` 继续只决定 Package 拥有多少 layout surface，不决定能力等级。

同一套 Native Frontend Capability Layer 可服务 Component、Hybrid、Full。

`Text` 保持 Host-managed text experience；需要高度自定义聊天表现时使用 Component/Hybrid/Full + Managed/Headless Conversation，而不是提升某种“功能等级”。

### 2.2 Typed Authority Only

Frontend 可以读取经过声明的 projection，但不得裸写：

- World；
- Session；
- Memory；
- Continuity；
- Realm；
- Shared；
- Timeline。

所有权威修改继续经过现有 typed Command / Application Command / Activity / Task / Session / Conversation / Continuity / Realm / Shared contract。

Frontend State、Draft、Prefs、Controller Heap 都不是 Game Authority。

### 2.3 Declarative UI 是结构权威

DOM / Component tree 由 Canonical Frontend IR 创建。

Script Sandbox 是复杂计算与高级 presentation controller，不重新获得：

- `createElement`；
- `innerHTML`；
- arbitrary selector traversal；
- raw DOM construction authority。

### 2.4 Host Bridge 是唯一跨边界协议

Native Declarative、Sandbox Script 与 future Web Island 共享同一个 versioned Frontend Host Bridge semantics。

不同 Runtime 只能改变 transport/isolation，不得获得不同 Authority API。

### 2.5 Source 与 Runtime Artifact 分离

Human / Studio / AI 编辑 Authoring Source。

Runtime 只执行 derived-readonly Canonical Runtime Graph。

Preview 与 Production 共用同一 Compiler + Renderer。

---

## 3. Hard Cut / Clean Break

本项目当前没有需要保护的第三方作者生态、真实用户数据或历史 Native UI Package，因此 v3 不承担 v1/v2 兼容债务。

最终状态必须：

- Native Frontend v3 成为非 Text Experience 唯一正式 Native UI Runtime；
- 删除 `componentModelVersion` 作为现代 Runtime selector；
- 删除旧 `component / selectors / surface` legacy runtime declaration；
- 删除 Native UI v1/v2 renderer/compiler 及只服务旧 schema 的 compatibility path；
- Studio、Preview、Health、Package validation 迁移到 v3；
- 开发期 fixture / sample / test data 可直接改写或删除。

不实施：

- v1/v2 → v3 Migration Assistant；
- compatibility CSS；
- legacy manifest parser；
- 双 renderer 长期并存；
- deprecation 周期；
- legacy PackageVersion 自动迁移。

实现期间旧代码可以临时保留作对照，但 Phase 9 完成时正式执行路径必须不再依赖它。

---

## 4. Runtime Manifest 与版本

Authoring Project 与 Installed Package 使用不同入口概念。

Authoring 概念：

```yaml
runtime:
  experience:
    mode: hybrid
    frontend:
      kind: native
      version: 3
      source: frontend/frontend.json
```

Installed Runtime 概念：

```yaml
runtime:
  experience:
    mode: hybrid
    frontend:
      kind: native
      version: 3
      entry: runtime/frontend/index.json

    features:
      - id: frontend-script
        version: 1
        required: false

      - id: remote-media
        version: 1
        required: false
```

Frontend identity：

- `frontend.kind = native`
- `frontend.version = 3`

Future Runtime kind：

- `web-island@1`（不属于 Core v3 实施范围）

React / Vue / Svelte 是 Authoring Technology，不成为 Runtime kind。

### 4.1 Native v3 Core Baseline

`native@3` 默认包含：

- semantic Declarative DOM；
- Package CSS；
- local fonts；
- Package Components；
- typed props/emits/slots；
- Component/View/UI/Draft/Prefs state；
- Interaction Runtime；
- responsive/environment projection；
- keyed reconciliation；
- virtualization；
- Overlay Runtime；
- Canvas2D presentation surface；
- typed Host Bridge；
- MediaRef/ImageRef 基础；
- Localization；
- IME-aware input；
- Accessibility environment/diagnostics；
- Loading/Error Boundary；
- Headless/Managed Conversation support。

### 4.2 Versioned Runtime Features

只为真正正交、改变 Runtime 或安全面的能力单独版本化，例如：

- `frontend-script@1`；
- `remote-media@1`；
- future `webgl@1`；
- future `webgpu@1`；
- future `frontend-wasm@1`；
- future `network-client@1`；
- future `frontend-cache@1`。

### 4.3 Permissions

Feature 表示 Host 是否实现技术能力。

Permission 表示 Package 是否被允许访问外部/敏感能力。

典型 Permission：

- remote-media；
- network；
- clipboard-read；
- clipboard-write；
- camera；
- microphone。

`frontend-script` 在严格 Sandbox 中是 Feature，不因“有 JavaScript”本身成为敏感 Permission。

Required/Optional negotiation：

- required Feature unsupported/unavailable → Preflight fail；
- optional Feature unsupported/unavailable → Frontend 启动但状态明确投影，Package 自行 fallback；
- required Permission denied → activation fail；
- optional Permission denied → Frontend 启动并使用 fallback。

状态 vocabulary：

- available；
- unsupported；
- unavailable；
- denied。

必须携带 stable `reasonCode`。

---

## 5. Authoring Source Graph

Native v3 使用：

```text
Authoring Source Graph
    ↓ compile
Canonical Runtime Graph
    ↓ validate
Native Frontend Runtime
```

推荐工程结构：

```text
frontend/
├─ frontend.json
├─ views/
│  ├─ Main.aui
│  ├─ Inventory.aui
│  └─ Phone.aui
├─ components/
│  ├─ CharacterCard.aui
│  ├─ StatBar.aui
│  └─ ChurchPanel.aui
├─ styles/
│  ├─ theme.css
│  └─ global.css
├─ state/
│  └─ state.json
├─ bridge/
│  └─ bindings.json
├─ locales/
│  ├─ zh-CN.json
│  ├─ en.json
│  └─ ja.json
└─ controllers/
   └─ relationship-graph.ts
```

目录只是默认组织方式，不是 Runtime semantic requirement。

### 5.1 `.aui` Native SFC

Implementation Baseline 采用 Atria-owned SFC-like source，扩展名 `.aui`。

一个 Component Source 可以 colocate：

- template / Declarative DOM；
- props；
- emits；
- slots；
- local state；
- computed；
- declarative interaction；
- `uses`；
- scoped style；
- optional Controller ref。

JSON 保留给 index、schema、state、bridge 等严格 contract；不再要求作者长期手写巨大 UI JSON tree。

### 5.2 View

View 不是第二套 DOM language。

View = Surface/Mount metadata + Root Package Component。

### 5.3 Source Map / Semantic Identity

Compiler 必须生成 Source Map / Provenance：

- Component → source file/span；
- Node → source span；
- Interaction → source span；
- CSS diagnostic → source；
- Controller → TS/JS source。

Native Source 具有 stable semantic IDs；Studio/AI 优先按 Component/Node/Binding/Interaction identity 修改，而不是靠行号。

Studio 使用 format-preserving CST + semantic AST 路线，尽量保留注释/格式。

---

## 6. Canonical Runtime Graph

Build output 不生成一个巨型 UI JSON，而是 exact resource graph：

```text
Compiled Frontend Index
├─ View IR refs
├─ Component IR refs
├─ Compiled Bridge Descriptor
├─ Style resources
├─ Localization catalogs
├─ Sandbox modules
└─ Frontend media/assets
```

Runtime resource identity 使用 stable logical id + exact content identity/hash。

Source path 只属于 provenance，不成为 Runtime authority identity。

Activation：

1. 加载/验证 Frontend Index；
2. Preflight Runtime Features / Permissions / Bridge；
3. 加载 Primary View；
4. 按需加载 View/Component/Controller/Style/Media。

View/Component 自然成为 lazy loading boundary。

正式 `.atria` 默认以 compiled runtime artifacts 为运行权威；Source bundle / Source Map 可作为 debug/remix optional artifact，但 Runtime 永远不执行 Authoring Source。

---

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

## 11. Fixed Host Services

Baseline fixed services：

- `host.composer`
- `host.conversation`
- `host.session`
- `host.media`
- `host.presentation`
- `host.external`

### 11.1 Composer

支持：

- get/set/append/clear Draft；
- focus；
- submit。

Submit 进入正式 Turn/Session authority，不直接 append Timeline。

### 11.2 Managed + Headless Conversation

作者可以选择：

- Managed Native Conversation/Composer；
- Headless Conversation Service + Package-owned DOM/CSS。

Managed Component 必须基于同一 Headless Host contract。

Headless 提供：

- committed message collection；
- active branch/revision/tail；
- GenerationProjection；
- reply alternatives；
- history metadata；
- retry/regenerate/fork/switch/inspect；
- generation cancel/status。

Reply alternative 保持 Native 语义：同一 predecessor 后的不同 committed assistant messages / branch lineage，不复活 legacy Swipe。

### 11.3 GenerationProjection

Streaming/provisional generation 是 ephemeral Presentation，不是 Timeline Authority。

状态至少：

- idle；
- preparing；
- streaming；
- finalizing；
- cancelling；
- failed。

Final commit 后消息通过 committed Conversation Collection 出现。

### 11.4 Session

`host.session` 支持：

- status；
- create/list/restore SavePoint；
- reload/recover；
- exit Experience；
- restart current entry/session（Host policy允许时）；
- diagnostics。

所有 branch/save/restore/retry 有 exact/current revision guard。

Destructive/navigation-like action 的 confirmation 由 Host policy 决定。

### 11.5 Experience Epoch

Restore、branch switch、reload 等引发 Experience Epoch 变化。

Runtime 自动：

- revoke stale cursors/handles；
- cancel stale async requests；
- discard late completion；
- rebind projection；
- remount/recreate affected Controller/View。

---

## 12. Safe Prose / Message Presentation

Canonical narrative text 继续只有一份。

Prose AST 是 inert Presentation Projection，不是第二份 Narrative Truth。

Prose nodes baseline：

- paragraph；
- line break；
- emphasis/strong；
- heading；
- quote；
- ordered/unordered list；
- code/pre；
- safe link；
- semantic inline mark。

AST 通过 canonical content span/range 或 exact textual mapping 验证。

禁止 raw HTML/script/style/iframe/embed。

Native Declarative Runtime 将 Prose AST 展开成 Experience-owned semantic DOM，因此 Package CSS 完整控制视觉。

Safe links走 Host External Navigation。

Message Blocks 保持独立 typed block，不吸收进 Prose AST。

---

## 13. Media / Assets

Frontend Asset Graph 复用现有 exact AssetRef / Asset Pack / content hash 基础。

覆盖：

- styles；
- fonts；
- images；
- SVG；
- cursor/mask/texture；
- controller modules；
- audio/video；
- presentation resources。

### 13.1 Local Media

Embedded Exact AssetRef 可离线、可重复验证。

支持 image/audio/video/speech presentation；播放、autoplay、visibility、user gesture 服从 Host/平台策略。

### 13.2 Remote Media

Remote image 是正式能力，用于避免大量角色立绘/CG使 `.atria` 体积爆炸。

Remote media identity：

- DeclaredRemoteMediaRef；
- HostIssuedMediaRef。

大量立绘进入 lightweight Remote Media Catalog：

- mediaId；
- URL/source candidates；
- optional integrity；
- dimensions/MIME；
- loading/cache hints；
- fallback。

World/Application 投影保存 `mediaId/ImageRef`，不保存运行时可执行 URL。

Frontend/Script 不得任意构造 RemoteImageRef URL。

### 13.3 Remote Media Permission / Threat Model

`remote-media` 是 **External Access Permission**。

Declared origins/MediaRefs 可以阻止 arbitrary URL / arbitrary destination / raw fetch，但不能保证完全无数据外传；获准 origin 仍可能观察请求选择与时序。

因此：

- 安装/启用 UI 明示远程媒体 origins 与隐私含义；
- Host strip credentials/referrer；
- Host 可使用 privacy proxy/cache；
- 用户可禁用 Remote Media；
- denied/offline 使用 fallback；
- 所有静态 CSS network-producing URL sink 都由 Compiler 解析/分类。

Remote audio/video 不是 Core v3 必须项；future 可扩展 MIME policy。

---

## 14. Script Sandbox

Package Script 是可选 `frontend-script@1`。

Baseline architecture：

```text
Main Frontend Runtime
    ⇅ structured messages
Script Sandbox Supervisor Worker
    └ Isolated JS VM
```

Worker 负责 thread/failure/hard terminate；VM 负责 heap/global/capability isolation。

具体 VM 实现不在 Baseline 锁死。

### 14.1 JS/TS Pipeline

Authoring 支持 modern JS/TypeScript。

Build：

```text
JS/TS
→ transpile/bundle/link
→ compatibility validation
→ compiled sandbox modules
→ exact module graph/hash
```

Runtime 不执行 TS/source/npm build。

允许 package-local static import与 vendored pure JS dependency。

禁止：

- remote import；
- runtime dynamic import baseline；
- Node built-ins/native addon；
- DOM/browser runtime dependency；
- eval/dynamic Function；
- ambient fetch/WebSocket/storage。

### 14.2 Controller Context

每个 Component 可有独立 Controller instance。

只获得：

- readonly props/event/env；
- component state；
- emit；
- declared NodeRef/CanvasRef；
- scoped Reads/Actions/Operations；
- scoped fixed services；
- scheduler/frame；
- UI clock / non-authoritative random。

Script heap是 ephemeral non-authoritative state。

VM 可 kill/restart并从 Host/frontend state恢复。

### 14.3 Budgets / Recovery

Host policy必须支持：

- VM heap；
- invocation CPU/instruction/wall time；
- Experience script budget；
- module bytes；
- message payload/queue；
- outstanding async；
- operation concurrency；
- hard terminate。

Crash：

- ordinary exception → scoped diagnostic；
- runaway/engine failure → terminate Worker、rebuild VM/controllers；
- repeated required-script failure → Experience failure；
- optional script 可 declarative fallback。

### 14.4 Canvas2D

Core v3 使用 batched/retained Drawing Command Buffer。

不把真实 `CanvasRenderingContext2D` 注入 VM，不做每 draw call 一次 RPC。

Image 只能来自安全 MediaHandle。

WASM 不属于 `frontend-script@1`；future `frontend-wasm@1`。

---

## 15. Environment / Localization / Input / Accessibility

### 15.1 Environment

Reactive Environment 至少包括：

- device/orientation；
- layout viewport；
- visual viewport；
- safe-area；
- soft keyboard/occlusion；
- touch/pointer/hover/keyboard modality；
- reduced motion；
- color scheme；
- forced colors；
- contrast preference；
- Host text/UI scale。

同时投影 CSS variables供 Package 使用。

### 15.2 Localization

Package Localization Resource Graph 支持：

- stable message keys；
- interpolation；
- plural/select；
- number/date/time/relative/list formatting；
- locale fallback；
- RTL；
- missing/unused key diagnostics。

Locale是 Presentation，不自动改变模型生成语言。

### 15.3 IME / Input

Baseline events：

- beforeinput；
- input；
- compositionstart/update/end；
- key + isComposing；
- bounded caret/selection state。

Controlled input实现 Composition Lock，composition 期间普通 reconciliation 不覆盖 composing buffer/caret。

支持 `inputmode/enterkeyhint/autocomplete/spellcheck` 等安全输入属性。

### 15.4 Accessibility

Compiler/Studio/Health诊断：

- accessible name/label；
- heading/landmark；
- ARIA；
- keyboard access；
- hidden focus；
- touch target；
- focus style；
- reduced-motion fallback。

Overlay/Modal Runtime提供 FocusScope：

- initial focus；
- trap；
- restore；
- background inert；
- Escape coordination。

提供 Experience-local live region / announce helper。

---

## 16. Async Loading / Error Boundary

Native v3 提供：

- Component Boundary；
- View Boundary；
- mandatory Root Boundary；
- Host-owned Failure Surface。

Boundary可声明：

- loading；
- error；
- content；
- retry；
- optional timeout/escalation。

覆盖：

- lazy View/Component；
- style/controller resource；
- Controller init/invocation；
- Collection Read；
- required Media；
- local render/validation failure。

正常业务 rejection仍是 Bridge Receipt，不自动进入 Error Boundary。

Fatal Session/Authority/contract/preflight failure进入 Host-owned Failure Surface。

Error Projection只暴露 safe category/reasonCode/retryable/sourceId/diagnosticRef/message。

Retry创建新 request epoch，旧 completion丢弃。

不自动 retry Authority write，除非底层 idempotency contract明确安全。

---

## 17. Performance / Reliability Baseline

必须实现：

- small Frontend Index；
- exact lazy resource graph；
- keyed reconciliation；
- renderer batching/coalescing；
- virtualization；
- bounded snapshot/collection reads；
- media cache；
- script budgets；
- async cancellation；
- stale epoch revocation；
- source-mapped diagnostics。

Offline：

- Embedded assets + compiled Runtime可完整启动；
- Remote Media使用 cache/fallback degradation；
- Core不依赖 Service Worker。

---

## 18. Framework / Runtime 扩展边界

### 18.1 Native Authoring

`.aui` 是 Studio/AI first-class path，可完整 structured edit / preview / diagnostics。

### 18.2 Framework Adapter

React/Vue/Svelte 等可通过 Adapter/Compiler输出同一 Canonical Runtime Graph。

Core Studio可理解 compiled IR，但不承诺将任意视觉编辑 round-trip回原 framework source。

### 18.3 Future Web Island

Future `web-island@1` 使用独立 Browser Realm + strict CSP + typed message/RPC bridge。

Web Island不获得：

- Host DOM；
- raw Authority；
- Secret；
- default arbitrary network。

不属于 Core v3 Implementation Baseline。

---

## 19. Core Baseline 完成定义

Core v3 只有同时满足以下条件才算完成：

1. 非 Text Experience 使用 `native@3` Frontend Contract；
2. Authoring Source可编译为 exact Canonical Runtime Graph；
3. Package可自由控制自身 DOM/CSS/fonts/layout/component tree；
4. Component/Hybrid/Full visual containment 与 Host System Layer成立；
5. Typed Frontend Host Bridge与 Binding Registry成立；
6. snapshot + collection Read、Action、Operation成立；
7. Managed + Headless Conversation/Composer成立；
8. Prose AST、安全 Message Presentation成立；
9. Session/Conversation fixed services与 SavePoint/retry/fork/recovery成立；
10. Local/Remote MediaRef、Remote Media permission/cache/fallback成立；
11. Localization、IME、VisualViewport、Accessibility成立；
12. Loading/Error Boundary与 Host Failure Surface成立；
13. optional Script Sandbox、Canvas Command Buffer、Frame Scheduler成立；
14. Studio/Preview/AI authoring基于 Source→Compiler→Runtime链路；
15. 原有 Native UI v1/v2 正式执行路径删除；
16. Heavy Frontend representative acceptance、mobile/desktop regression、build/install、Health/Studio tests通过。

---

## 20. Non-goals — Core v3 不做

Core v3 不包含：

- v1/v2 migration/compatibility；
- arbitrary Host DOM；
- raw `window/document` for Package Script；
- raw `fetch/XMLHttpRequest/WebSocket`；
- localStorage/IndexedDB generic authority；
- arbitrary filesystem；
- raw database/repository；
- arbitrary executable HTML/remote JS；
- Browser Top Layer escape；
- install-time npm/pnpm/yarn/build scripts；
- generic durable frontend KV；
- Service Worker；
- arbitrary WebGL/WebGPU；
- WASM runtime；
- pointer lock；
- camera/microphone；
- clipboard/file import-export baseline；
- Browser History/deep-link routing；
- true DOM-owning arbitrary React/Vue/Svelte SPA runtime；
- Remote audio/video作为 Core remote-media 必须能力。

这些不是“忘记实现”，而是明确不阻塞 v3 Core。

---

## 21. Future Seams

正式预留但不在 Core v3 实现：

- `web-island@1`；
- Framework Adapter packages；
- `webgl@1` / `webgpu@1`；
- `frontend-wasm@1`；
- `network-client@1`；
- `frontend-cache@1`；
- OffscreenCanvas / graphics fast path；
- Remote audio/video；
- clipboard read/write；
- file picker/import/export；
- camera/microphone；
- browser history/deep-link routing；
- advanced read-only delta protocol。

---

## 22. Implementation Phases

正式开工后，所有 Phase 默认沿用同一任务分支：

`refactor/native-frontend-runtime-v3`

不为每个 Phase 重复开分支。

每个 Phase 完成后必须：

1. 更新 `docs:records/refactor/native-frontend-runtime-v3.md`；
2. 更新唯一 `docs:HANDOFF.md`；
3. 记录 task branch HEAD、main baseline、验证结果、未完成项；
4. 生成下一阶段可直接复制的新对话提示词；
5. 主动停止，不提前进入下一 Phase，等待用户继续。

### Phase 1 — Contract Reset / Compiler Skeleton

目标：

- 定义新 Package/Experience/Frontend/Bridge schema；
- hard-cut legacy authoring contract；
- 建立 `.aui` parser/CST/semantic AST 最小骨架；
- Frontend Source Index；
- Canonical Frontend Index / Component IR / View IR；
- exact resource graph；
- Compiled Bridge Descriptor；
- Source Map/Provenance；
- Build/Package validation path。

验收：

- 最小 `frontend.json + Main.aui` 可通过正式 Compiler 生成 exact Runtime Graph；
- invalid source/binding/style/resource fail closed；
- Preview和Build共用Compiler；
- installed Runtime只消费compiled artifacts；
- 不执行author TS/source/npm scripts。

### Phase 2 — Presentation Runtime / Containment

目标：

- semantic DOM renderer；
- full CSS/font pipeline；
- ShadowRoot + Visual Containment；
- Component runtime / props/emits/slots；
- View mount/lazy load；
- Local/View/Component/Draft/Prefs state；
- Interaction baseline；
- Overlay/FocusScope；
- local routing/forms；
- Frame Scheduler；
- NodeRef measurement/observer/pointer capture；
- responsive Environment基础。

验收：

- Component/Hybrid/Full均可运行自定义DOM/CSS/fonts；
- Package fixed/z-index/top-layer无法越过授权surface；
- Full Host System Layer始终可用；
- mobile/desktop responsive场景通过；
- keyed list/virtualization基础可用。

### Phase 3 — Host Bridge / Data Plane

目标：

- Frontend Host Bridge v1；
- Experience Binding Registry；
- scoped Component `uses`；
- snapshot Read；
- Collection Read/cursor；
- Action；
- Operation；
- unified Receipt/Error；
- idempotency/revision guards；
- Experience Epoch/stale revocation；
- prefs/environment fixed projections。

验收：

- 未声明 Binding不可调用；
- cursor/query/revision stale fail closed；
- collection pagination不读取raw DB；
- Authority write只经过正式typed target；
- late async completion在Epoch变化后被丢弃；
- Declarative与future Script使用同一compiled binding semantics。

### Phase 4 — Conversation / Session / Prose

目标：

- Managed Conversation/Composer迁移到统一Headless contract；
- Headless committed message collection；
- GenerationProjection；
- Reply alternative / branch controls；
- `host.composer` / `host.conversation` / `host.session`；
- Safe Prose AST；
- Message Block integration；
- SavePoint/reload/recovery/diagnostics；
- Host Failure Surface。

验收：

- Managed与Headless UI对同一Session得到一致语义；
- streaming永远不冒充committed Timeline；
- retry/fork/switch/save/restore都有revision guard；
- raw HTML不能进入Prose renderer；
- Full/Hybrid自绘Conversation无需Host-owned message DOM。

### Phase 5 — Media / Localization / Input / Accessibility / Boundaries

目标：

- Frontend Media Catalog；
- Exact Image/Audio/Video；
- Remote ImageRef / HostIssuedMediaRef；
- Media Resolver/cache/fallback/privacy；
- Package Localization；
- RTL；
- IME Composition Lock；
- VisualViewport/keyboard inset；
- Accessibility environment/diagnostics；
- Error/Loading Boundaries。

验收：

- 大量Remote Portrait不打入Package bytes；
- denied/offline Remote Media有fallback；
- arbitrary runtime URL construction被拒绝；
- CJK composition不被rerender破坏；
- soft keyboard场景输入区可用；
- locale/RTL切换无需重载Session Authority；
- child resource/controller/read失败不会默认整页白屏。

### Phase 6 — Script Sandbox / Canvas

目标：

- Supervisor Worker；
- isolated JS VM adapter；
- JS/TS compile/bundle；
- static module graph；
- Controller ABI；
- scoped capability injection；
- CPU/memory/message budgets；
- scheduler/timer/frame/yield；
- crash/restart recovery；
- Canvas2D command buffer；
- source-mapped diagnostics。

验收：

- Script无法访问window/document/fetch/storage；
- Script只能访问Component `uses` handles；
- runaway loop可被Host terminate；
- Worker/VM重启不破坏Authority；
- Canvas支持代表性地图/关系图/动画；
- third-party pure JS算法依赖可bundle运行。

### Phase 7 — Studio / AI Authoring

目标：

- Native `.aui` editor；
- format-preserving structured edits；
- Source Graph browser；
- View/Component/style/state/bridge/localization editors；
- Studio Preview使用正式Compiler/Renderer；
- Source Map diagnostics；
- AI semantic patch surface；
- permission/feature visibility；
- Accessibility/Localization/Health diagnostics。

验收：

- Studio编辑不直接改IR；
- Preview与Production无第二套语义；
- AI可按semantic ID修改Component/Node/Binding；
- Source comments/format尽量稳定；
- invalid frontend在Build前得到source-level diagnostics。

### Phase 8 — Integration / Heavy Frontend Acceptance

目标：

使用与 `native-heavy-frontend-reference` 等价的重前端 acceptance fixture 验证：

- Story / Headless Conversation；
- Phone/SMS/Social/Mail；
- Church/经营；
- Schedule；
- People/Character；
- Remote Portrait；
- Collection pagination；
- AI Operation；
- Canvas关系图；
- Component/Hybrid/Full；
- mobile/touch/IME；
- offline/denied/recovery。

注意：`package` 是独立长期 workspace，本 Core task 不把 `main` merge 到 `package`。Core acceptance fixture应存在于 `main` 测试/fixture体系；Core稳定后如需升级正式 Package，另开 Package workspace任务。

验收：

- representative heavy frontend不再依赖v2 style/semantics workaround；
- providerCalls在deterministic tests中保持0；
- Desktop/Mobile关键E2E通过；
- Package build/install/preflight通过；
- Session/Authority/Memory/Lifecycle邻接回归通过。

### Phase 9 — Legacy Removal / Regression / Finalize

目标：

- 删除 Native UI v1/v2 正式Runtime/compiler路径；
- 删除 legacy manifest/componentModelVersion plumbing；
- 删除/改写旧Studio/Preview paths；
- 清理 dead CSS/fixtures/tests；
- 全量关联测试/CI；
- 最终 Docs Record；
- merge回 `main`；
- 删除 task branch。

验收：

- 非Text Native Experience只存在 v3 正式路径；
- repo搜索无意外 legacy Runtime selector；
- targeted + adjacent + repository-required CI通过；
- docs Record记录最终HEAD/CI/关键决策；
- HANDOFF在任务最终完成后删除；
- task branch确认merge后删除。

---

## 23. 实施纪律

正式实现开始前：

1. 重新核对真实远端 refs；
2. 读取最新 `main:AGENTS.md` 与 `docs:README.md`；
3. 从最新 `main` 创建 `refactor/native-frontend-runtime-v3`；
4. 创建 Implementation Record；
5. 以本 Baseline 为权威，不重新发散架构。

普通代码问题、测试失败、可自行解决的CI问题由执行者自行处理，不中断等待用户。

只在以下情况暂停：

- 一个 Phase 完成，需要正式 checkpoint；
- CI 进入明显耗时验证且下一步必须依赖结果；
- 必须依赖 Android/Termux 真机日志；
- 必须依赖真实 UI 截图；
- 需要用户本人权限/Secret/账号授权。

---

## 24. Baseline Gate

第二轮 Gap Review 结论：

**PASS WITH CLARIFICATIONS → Implementation Baseline v1.0。**

冻结前补入的三项 Clarification 已纳入 Core：

1. Frame Scheduler；
2. Layout Measurement / Local Observers；
3. Remote Media Privacy Threat Model correction。

没有剩余 architecture blocker 需要在开始实施前继续讨论。

本文件现在是正式 Implementation Baseline。除非实施阶段出现被真实代码/测试证明的 blocker，否则不得重新扩建范围或静默改变核心边界。
