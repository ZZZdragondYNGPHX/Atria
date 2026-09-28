# Atria Native Frontend Runtime v3

## 任务信息

- Task ID：`refactor/native-frontend-runtime-v3`
- 类型：大型架构 / Native UI 重构
- 状态：**Discussion Draft v0.14**
- Primary Workspace（未来实现）：`main`
- 当前阶段：方案讨论，仅更新 `docs`，尚未创建实现分支
- 当前源码基线：`main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- 当前文档基线：`docs@6f80b6d3d3ae0da43227c5c955f5762f77be6065`
- 方案路径：`docs:plans/refactor/native-frontend-runtime-v3.md`

本方案由 Native UI v2 在重前端 Package 中暴露出的 CSS、字体、DOM 与交互自由度限制触发。当前阶段不实施代码；每一轮讨论开始前，先把上一轮已形成的新增结论增量/覆盖写入本企划，再继续下一轮讨论。

---

## 1. 背景与当前问题

当前 Native UI v2 的核心实现具有明显的 Host-owned Presentation 特征：

- UI 节点类型是固定白名单；
- props / bindings / events 是固定白名单；
- Runtime 由 Host 创建真实 DOM；
- Package 不能携带任意 CSS；
- Package 字体、复杂布局、伪元素、滤镜、动画等能力受 Host 样式体系约束；
- Native Component 主要通过 Host 提供的 slot 挂载；
- Package 不执行任意 JS，不获得 DOM / network / storage 等浏览器能力。

这一设计对“安全声明式 UI”有效，但对 Atria 的重前端游戏目标形成明显上限。

本重构不以“为 v2 多加若干 CSS 属性”为目标，而是重新定义 Package Presentation 权限与 Host Authority 的边界。

---

## 2. 核心设计原则

### 2.1 新的所有权原则

Native UI v3 / Native Frontend Runtime 的核心原则调整为：

> **Package owns presentation. Host owns capabilities and authority.**

Package 应拥有几乎完整的游戏前端表现能力，包括：

- DOM 结构；
- CSS；
- 字体；
- Theme；
- 布局；
- 动画；
- 响应式；
- 自定义组件；
- 客户端 UI 状态；
- 交互；
- 拖拽、手势和输入映射；
- Canvas / 数据可视化；
- 在受控沙箱中的前端计算。

Host 继续拥有：

- World / Session / Memory / Continuity / Realm / Shared 等 Authority；
- Model / Provider / Secret；
- Native Session / Command / Task / Activity / Composer；
- 裸网络能力；
- 文件系统；
- Atria Host DOM 与系统 UI；
- 浏览器全局环境；
- capability negotiation、权限与安全限制。

“可以任意改变按钮外观”不等于“可以执行任意权威写入”。

### 2.2 Experience Mode 与前端能力解耦

`Component / Hybrid / Full` 继续只表示 layout ownership，不是权限等级。

Frontend Runtime 能力与 Experience Mode 正交，例如：

- Component + Declarative
- Component + Scripted
- Hybrid + Declarative
- Full + Scripted

不得通过升级到 Full 模式来获得额外 Runtime 权限。

### 2.3 Typed Authority Only 继续成立

无论 Declarative Runtime 还是 Script Runtime：

- Package 可以读取经过授权的 projection；
- Package 不得裸写 World / Session / Memory / Continuity / Realm / Shared；
- 权威修改仍必须经过 Typed Command / Activity / Task / Session Application Command / 其它正式 Host Bridge；
- UI / Draft / Component Local State 不等于游戏事实。

---

## 3. Declarative DOM：从组件白名单转向安全 DOM

### 3.1 目标

v3 不再要求 Atria 为每一种普通 Web UI 元素重新设计专用组件。

Canonical UI IR 应允许广泛的安全语义 DOM，例如：

- `div / span / main / section / article / header / footer / nav / aside`
- `p / h1-h6`
- `ul / ol / li / dl / dt / dd`
- `table / thead / tbody / tfoot / tr / th / td`
- `details / summary`
- `figure / figcaption`
- `button / label / input / textarea / select / option`
- `progress / meter`
- `img / picture / source / svg`

输入仍应经过结构化 compiler / validator，不以 raw HTML 字符串或 `innerHTML` 为主要 Runtime Contract。

### 3.2 Attribute 模型

从“允许极少数 props”转向：

- 默认允许安全 HTML attributes；
- 支持 `aria-*`；
- 支持 `data-*`；
- 支持 class / id / role / tabindex 等；
- 对资源型属性进行 AssetRef / Package URL 解析；
- 对危险导航、脚本与浏览器能力显式禁止。

### 3.3 默认禁止的危险元素 / 能力

基础 v3 不直接开放：

- `script`
- `iframe`
- `object`
- `embed`
- remote stylesheet executable dependency
- `meta refresh`
- arbitrary external form action
- `javascript:` URL

外链、导航与未来网络能力必须经过 Host capability。

---

## 4. CSS、字体与 Presentation 隔离

### 4.1 CSS 方向

不再继续扩充一个“Safe Appearance 属性 DSL”来模拟 CSS。

目标是允许 Package 使用接近真实 Web CSS 的能力，包括：

- Flex / Grid
- CSS Variables
- Cascade / Layers
- Media Query
- Container Query
- Pseudo-element
- Pseudo-class
- Transition / Animation / Keyframes
- Filter / Backdrop Filter
- Mask
- Transform
- Typography
- Writing Mode
- Variable Font properties
- Package-local `url(...)`

复杂样式优先放置在 Package stylesheet；inline style 可以作为局部能力存在。

### 4.2 Experience Shadow Boundary

每个 Experience 应具有真正的 Package Presentation 隔离边界：

```text
Atria Host DOM
└─ Experience Surface
   └─ Experience ShadowRoot
      ├─ Package styles
      ├─ Package fonts
      ├─ Package DOM
      └─ Package Components
```

Package-global CSS 只在本 Experience 内全局，不允许影响：

- Atria Settings
- Atria Navigation
- Host Shell
- 其它 Package
- 其它 Experience

### 4.3 Native Component Boundary

Native Components（例如 Conversation / Composer）保持 Host-owned 内部实现，可使用独立 Shadow Boundary。

Package 通过稳定接口自定义：

- typed props；
- events；
- slots；
- CSS custom properties；
- `::part()`。

Package 不依赖 Native Component 私有 DOM 结构。

### 4.4 v3 默认视觉

Runtime Contract 不再强制 Package 使用 Atria 默认字体、padding、gap、badge、button 或 input 风格。

Atria Default Theme 应成为可选默认主题，而不是 Runtime Contract。

---

## 5. Client Interaction Runtime

### 5.1 状态域

至少区分：

- `view`：最短寿命的 view / instance presentation state；
- `component state`：组件实例局部状态；
- `ui`：Experience 生命周期内 UI state；
- `draft`：尚未提交到 Authority 的操作草稿；
- `prefs`：Player / Device 范围的持久偏好。

这些状态均不得冒充 World / Session Authority。

### 5.2 Event System

目标支持广泛的前端事件与标准化事件投影，包括：

- click / dblclick / contextmenu
- pointer down/up/move/enter/leave/cancel
- keyboard
- focus / blur
- input / change / submit
- scroll / wheel
- drag / drop
- animation / transition completion
- touch / gesture abstraction
- longpress / swipe / pinch
- resize / visibility

事件对象必须是安全 projection，不暴露真实 DOM 对象或 Host traversal 能力。

### 5.3 Interaction Program

v3 的客户端动作不能只停留在 `ui.set / ui.toggle`。

需要覆盖：

- condition / branch；
- set / toggle / increment / decrement；
- array / collection transforms；
- open / close；
- focus / scroll；
- timer；
- drag / drop；
- input action；
- typed Host intent。

复杂 UI 不应退化为巨大 JSON DSL。Authoring 层可拥有更适合人工与 AI 编辑的 Interaction Language，再编译为 Canonical Interaction IR。

### 5.4 Pure Computation

允许纯函数型数据操作，例如：

- map / filter / reduce / sort / group / find；
- math；
- string formatting；
- collection transforms；
- geometry / vector helpers。

避免通用、隐式、可形成副作用环的 watcher/effect 模型。优先事件驱动。

### 5.5 Timer

支持 Experience-scoped timer：

- after
- every
- cancel

Experience dispose 时自动销毁。

跨 Turn / 后台 / 世界时间逻辑继续使用现有 Temporal / Automation / Lifecycle，不由前端 timer 承担。

### 5.6 Input Mapping

游戏主控制优先通过语义 Input Actions：

- confirm
- cancel
- menu
- inventory
- move directions
- 自定义 action

Host 将 Keyboard / Gamepad / Touch 映射为语义输入，Package 不应被迫写死设备键位。

---

## 6. Package Component System

### 6.1 两类组件

明确区分：

**Package Component**
- Package-owned DOM / CSS / local state / props / slots / events / interaction。

**Native Component**
- Host-owned implementation / security boundary / capability binding。

### 6.2 数据流

默认采用：

> **Props down, Events up**

普通 Package Component 默认只获得：

- props
- local state
- event
- env

World / Session /其它 Host projection 应由上层显式注入，而不是所有组件默认获得整个 Runtime Context。

### 6.3 Typed Component Contract

Package Component 支持声明：

- typed props；
- typed emits；
- slots / scoped slots；
- defaults；
- required props；
- schemas；
- AssetRef 等特殊类型。

这样 Studio、Compiler、AI Authoring 和测试可以进行静态验证。

### 6.4 Component Local State

每个 Component Instance 拥有独立 local state。

同一页面上的多个 `CharacterCard` 不共享自己的展开状态、tab、hover 等局部 presentation state。

### 6.5 生命周期

可以提供有限的 declarative lifecycle：

- mount
- unmount
- activate
- deactivate
- propsChanged

生命周期只能触发 Client Interaction Runtime / Sandbox Controller 能力，不成为任意 Host 代码入口。

### 6.6 CSS Scope

Package 总体由 Experience ShadowRoot 隔离。

Package Component 默认使用 compiler-level scoped style；Theme / Design System 可以使用 Package-global style。

不要求每个 Package Component 单独创建 ShadowRoot，以避免 Theme、Font、layout、overlay 与 slot 组合复杂化。

### 6.7 Keyed Reconciliation / Repeat

动态集合使用稳定 key 保留 Component Instance：

- local state；
- focus；
- animation；
- DOM identity。

不需要复制完整 React Virtual DOM，但需要可靠的 keyed declarative reconciliation。

### 6.8 Virtualization

大型列表应支持 Host/Runtime-assisted virtualization，避免数百/数千记录全部常驻 DOM。

### 6.9 Portal / Overlay

Experience 内建立统一 Overlay Root，用于：

- Tooltip
- Context Menu
- Dropdown
- Modal
- Toast
- Drag Ghost
- Floating Panel

Portal 仍停留在 Experience Shadow Boundary 内。

### 6.10 Authoring 与 Runtime IR 分离

不要求作者长期直接手写巨大 JSON。

```text
Authoring Format / Studio / AI
        ↓ compile
Canonical Native UI IR
        ↓ validate
Native Frontend Runtime
```

Canonical IR 继续结构化，便于验证、迁移、Diff、测试与 Studio 操作。

---

## 7. Script Runtime

### 7.1 基本立场

v3 不把“Package 永远禁止 JavaScript”作为永久原则。

允许可选 **Package Script Sandbox**，但禁止获得宿主 JavaScript 权限。

Script Runtime 是与 Experience Mode 正交的 capability，而不是更高级模式。

### 7.2 Sandbox Global

Sandbox 默认不存在或禁止：

- `window`
- `document`
- `fetch`
- `XMLHttpRequest`
- `WebSocket`
- `localStorage`
- `indexedDB`
- `navigator`
- `location`
- `eval`
- dynamic `Function`

只暴露 Host 显式提供的最小安全 API。

### 7.3 Script 不直接控制真实 DOM

Script 使用 opaque handles，例如：

- NodeRef
- CanvasRef
- AssetRef
- typed Host handles

NodeRef 可以执行经过允许的 presentation 操作，例如：

- focus
- scroll
- class toggle
- CSS variable update

但不能通过 `ownerDocument`、`parentNode`、`innerHTML`、任意 selector 等方式穿透边界。

### 7.4 DOM 仍由 Declarative IR 创建

Script 不作为主要 UI construction API。

禁止把 Runtime 变成：

- `createElement`
- `appendChild`
- `innerHTML`

动态 UI 应通过 state → declarative reconciliation 完成。

Script 主要负责复杂计算、Canvas、复杂交互 controller 等 Declarative Runtime 不擅长的工作。

### 7.5 Canvas

可提供受控 Canvas2D capability。

图像、字体等资源仍来自 Package AssetRef，不允许脚本通过网络直接加载远程资源。

WebGL / WebGPU 暂不作为 v3 基线承诺，但架构不得堵死未来 capability extension。

### 7.6 Host Bridge

Script 的 Authority 访问必须继续使用 typed bridge，例如：

- command
- activity
- task
- composer
- session application command
- continuity / realm / shared 正式能力

Sandbox 不获得 SessionCore / repository / database 等真实对象引用。

### 7.7 Module System

支持：

- Package-local modules；
- Atria approved standard modules；
- 可 vendored 的 sandbox-compatible pure dependencies。

禁止：

- remote executable import；
- Node built-ins；
- 浏览器宿主依赖；
- 动态下载并执行代码。

### 7.8 资源预算

Script Runtime 必须由 Host 控制：

- CPU budget
- memory budget
- execution timeout
- cancellation
- message size
- module size

脚本故障不得阻塞整个 Atria Host。

### 7.9 Execution Isolation

实现技术暂不冻结。

正式方案需要比较独立 Worker、独立 JS VM、WASM/其它隔离方案。

无论具体技术为何，边界必须是：

```text
Sandbox Runtime
    ⇅ structured messages / typed requests
Host Bridge
    ⇅
Atria Native Runtime
```

而不是通过 `Object.freeze(window)` 之类的“共享 Realm 假沙箱”建立安全模型。

---

## 8. Frontend Manifest / Feature / Permission Model

### 8.1 Frontend Runtime Identity

v3 不再使用 `componentModelVersion: 3` 表达现代前端。核心 Runtime 身份由 `runtime.experience.frontend` 决定。

概念形态：

```yaml
runtime:
  experience:
    mode: hybrid
    frontend:
      kind: native
      version: 3
      entry: ui/main.frontend.json
```

其中：

- `mode`：只表达 layout ownership；
- `frontend.kind`：选择 Runtime family；
- `frontend.version`：选择该 Runtime contract 版本；
- `frontend.entry`：选择 Frontend entry resource。

`frontend.kind/version` 本身即构成 Core Runtime compatibility，不再重复声明 `native-frontend@3` feature。

未来 Runtime kind 只考虑：

- `native`；
- future `web-island`。

React / Vue / Svelte 等属于 authoring/build technology，不成为 Runtime kind。

### 8.2 Native Frontend v3 Baseline

`native@3` 应直接保证以下基础能力，不拆成大量可选 Feature：

- Declarative DOM；
- Full Package CSS；
- local font；
- Package Component；
- props / emits / slots；
- Interaction Runtime；
- responsive / environment；
- local / view / component / draft / prefs state；
- keyed reconciliation；
- Native Component / typed Host Bridge；
- Frontend AssetRef / ImageRef 基础；
- Canvas2D（当前倾向纳入 baseline，最终实现前可再核对平台成本）。

这样 `native@3` 本身就是完整前端平台，而不是一串碎片 feature 的集合。

### 8.3 Runtime Features

只有真正正交、改变 Runtime 或安全模型的子系统进入 versioned Feature，例如：

- `frontend-script@1`；
- `remote-media@1`；
- future `webgl@1`；
- future `webgpu@1`；
- future host-mediated `network-client@1`。

Feature 回答：

> Host 是否实现并能提供某一技术 API。

Feature 不等于用户授权。

### 8.4 Permissions

Permission 回答：

> Package 是否被允许触及外部网络、用户设备/数据或其它敏感 Host 能力。

典型 Permission：

- `remote-media`；
- `network`；
- `clipboard-read`；
- `clipboard-write`；
- `camera`；
- `microphone`。

`frontend-script` 在严格 Sandbox 内只属于 Runtime Feature，不因为“存在 JavaScript”本身变成用户敏感 Permission。

`canvas-2d` 也通常属于 Runtime baseline/Feature，而不是 Permission。

### 8.5 Feature / Permission 双层例子

`remote-media` 同时具有两个维度：

1. Host 必须支持 `remote-media@1` Feature；
2. Package 必须拥有与声明 origin constraints 匹配的 `remote-media` Permission。

Manifest 概念形态：

```yaml
runtime:
  experience:
    mode: hybrid
    frontend:
      kind: native
      version: 3
      entry: ui/main.frontend.json

    features:
      - id: frontend-script
        version: 1
        required: true

      - id: remote-media
        version: 1
        required: false

permissions:
  - permission: remote-media
    required: false
    reason: Load character illustrations
    constraints:
      origins:
        - https://cdn.example.com
```

### 8.6 Required / Optional Negotiation

Feature：

- required + unsupported/unavailable → Preflight fail；Experience 不启动；
- optional + unsupported/unavailable → Experience 可以启动，但 Host 必须投影明确状态，Package 必须提供显式 fallback/guard。

Permission：

- required + denied → activation fail，并展示稳定拒绝原因；
- optional + denied → Experience 继续运行，Host 投影 denied，Package 自己使用 fallback。

禁止 Host 对 optional feature 猜测“自动降级”。Host 负责报告事实，Package 负责体验分支。

### 8.7 Capability Projection

Frontend Runtime 应获得统一、只读的 capability / permission projection。状态至少区分：

- `available`；
- `unsupported`：Host 没有实现；
- `unavailable`：Host 实现但当前设备/环境无法提供；
- `denied`：技术可用但权限/策略拒绝。

状态应包含稳定 `reasonCode` 和可用 version/constraints，不把这些状态写进 World Authority。

### 8.8 Permission Constraints

Permission constraints 属于 Host-validated Manifest Contract。

例如 Remote Media：

```yaml
permissions:
  - permission: remote-media
    constraints:
      origins:
        - https://cdn.game.example
        - https://images.game.example
```

静态 RemoteImageRef 在 Build/validation 时验证 origin；动态 ImageRef 在 Runtime 再次验证实际 URL。

Permission grant 属于 Host-owned state，不得存进 Package UI State、World 或其它 Package-controlled Authority。

PackageVersion 更新若扩大 Permission footprint，必须重新授权；缩小 Permission footprint 不得扩大已有 grant。

### 8.9 安装 / 启用 UI

UI 应区分三类信息：

1. **Runtime profile**
   - Native Frontend v3；
   - future Web Island。

2. **Technical features**
   - Sandboxed frontend scripts；
   - future WebGPU 等。

3. **External / sensitive permissions**
   - Remote Media origins；
   - Network；
   - Clipboard；
   - Camera；
   - Microphone。

不要把 CSS、字体、普通 Component 等 baseline 能力伪装成危险权限。

### 8.10 Capability Vocabulary Cleanup

当前仓库同时存在 Package capabilities、Package permissions、Experience capabilities、Package Runtime capabilities、Host Plugin capabilities 等多套“capability”命名。

Hard cut 实施阶段应至少在 Frontend / Runtime contract 范围内清理语义：

- **Package Traits**：描述 Package 是什么/包含什么，如 narrative / game / memory / knowledge；
- **Runtime Features**：描述 Host 要实现什么版本化技术能力；
- **Permissions**：描述 Package 被允许访问什么敏感/外部资源。

不借本任务重构与 Frontend 无关的全部 Native persistence/storage contract。

### 8.11 Schema Versioning

由于采用 hard cut，Package / Runtime Descriptor / Experience envelope 可以在需要时同步提升 schema version。

是否提升由新字段模型是否因此更清晰决定，不为旧数据保留旧 shape 或旧 schema number。



---

## 9. Resource / CSS / Build Artifact Model

### 9.1 复用现有 exact Asset 基础

v3 不建立平行的“Frontend Assets 仓库”。

继续复用现有 Presentation / Package 资源地基：

- `AssetRef { assetId, contentHash }`；
- Package asset identity；
- Asset Pack；
- eager / lazy delivery；
- exact dependency closure；
- content hash / immutable PackageVersion。

在此基础上扩展 **Frontend Asset Graph**，覆盖：

- stylesheet；
- font；
- image；
- SVG；
- cursor；
- mask / texture；
- script module；
- Canvas / presentation resource。

### 9.2 Package-local CSS URL

作者仍应能够按正常 Web 项目习惯使用相对路径：

```css
@font-face {
    font-family: "GameTitle";
    src: url("../fonts/title.woff2") format("woff2");
}

.character-card {
    background-image: url("../images/card-bg.webp");
}
```

Build / Compiler 负责把本地 `url(...)`、本地 `@import` 等引用解析进 Frontend Asset Graph，并锁定 exact AssetRef。

Production Runtime 不依赖作者机器上的相对文件系统路径。Host 将 exact asset 映射成受控的 same-origin / object URL 等 Runtime locator。

### 9.3 Remote Image / Illustration Reference

**远程图片链接必须作为正式能力保留。**

原因是立绘、CG、背景、地图和其它大量高分辨率图片若全部内嵌到 `.atria`，会造成不必要的 Package 体积与长期本地占用。

因此 Frontend Resource 模型应区分：

1. **Embedded / Exact AssetRef**
   - 内容随 PackageVersion 固定；
   - 具有 `assetId + contentHash`；
   - 可离线、可重复、可完整验证。

2. **Remote Media Ref**
   - 主要用于图片等惰性 Presentation Media；
   - Package 保存 URL / metadata，而不是保存原始大文件；
   - 由 Host-owned Media Resolver 请求和展示；
   - 不因此向 Package Script 开放 `fetch` / WebSocket / arbitrary network。

Remote Media Ref 属于 Presentation，不得成为 Authority、代码或 schema 来源。

v3 应支持：

- Declarative DOM 的远程 `img / picture`；
- 角色立绘、头像、CG、背景等远程 image ref；
- CSS 中图片型远程 `url(...)` 经过 compiler/runtime rewrite 后进入 Host Media Resolver，而不是让 stylesheet 获得任意网络权限。

Remote `@import`、remote JS module、remote executable HTML 继续禁止。

远程字体暂不视为与远程图片等价的默认能力；默认仍优先 Package exact font assets。

Remote Media Ref 后续需要继续冻结：

- HTTPS / scheme policy；
- MIME 与文件大小限制；
- raster / animated image / SVG 策略；
- integrity / contentHash 可选或强制场景；
- cache / eviction / offline fallback；
- referer / credentials / privacy；
- Host proxy 与 SSRF 边界；
- broken-link fallback。

#### 9.3.1 Typed ImageRef

大量角色立绘、头像、CG、背景等不应退化为“一个任意 URL 字符串”。UI / Data / World projection 可使用 typed `ImageRef`，至少支持：

```text
ImageRef
├─ EmbeddedAssetRef
├─ PinnedRemoteImageRef
└─ LiveRemoteImageRef
```

其中：

- Embedded：图片内容包含于 Package exact closure；
- Pinned Remote：Package 不携带图片字节，但声明 URL + expected content hash / integrity，用于固定版本立绘；
- Live Remote：只声明远程 locator，可用于允许服务端内容变化的头像、动态图源或生成内容，仅属于 mutable Presentation。

Remote Image 永远不得成为 Authority、规则、schema 或 executable code 的事实来源。

#### 9.3.2 Responsive Sources

ImageRef 可以声明多分辨率 source，例如 thumbnail / medium / full 或 width/DPR 候选。Host 根据：

- 实际渲染尺寸；
- viewport / DPR；
- device / memory；
- network policy；

选择合适资源，避免角色列表为小尺寸缩略图下载 2K/4K 原图。

#### 9.3.3 Lazy Load / Prefetch / Cache

Remote Media 默认安装时不下载大图。加载策略由 Runtime + Host 控制：

- critical；
- visible；
- prefetch；
- lazy。

Package 可以给出 hint，但不能强制长期占用本地空间。

Host 应拥有可驱逐的 Remote Media Cache（例如 LRU / quota based）。缓存属于非权威可再生数据，可在存储压力、Package 删除、策略变化时驱逐。

玩家 / Host 决定缓存预算；Package 不得声明不可驱逐的巨量远程媒体缓存。

#### 9.3.4 Offline / Fallback

Remote Image 可声明轻量 fallback，例如 Embedded placeholder。离线或远端失败时优先：

1. 已缓存的有效 remote resource；
2. embedded fallback / placeholder；
3. Host 标准 missing-media UI。

因此 Package 可以保持很小，同时仍具备离线可理解性。

#### 9.3.5 `remote-media` Capability

远程 Presentation Media 与 arbitrary network 必须是两个不同权限：

- `remote-media`：允许 Host 为声明的媒体引用加载图片等 Presentation resource；
- `network`：未来如存在，才表示更广泛的 Host-mediated 网络能力。

声明 `remote-media` 不向 Sandbox Script 提供 `fetch`、WebSocket 或 raw socket。

Package / install UI 应能够展示声明的远程媒体来源域，便于用户理解隐私与联网行为。

#### 9.3.6 Host-owned Media Resolver

Remote Image 不应直接把裸 URL 无条件交给浏览器。推荐经 Host Media Resolver：

```text
RemoteImageRef
    ↓
Host Media Resolver
    ├ scheme / host policy
    ├ redirect bounds
    ├ MIME validation
    ├ byte / dimension budget
    ├ credentials stripping
    ├ referrer policy
    ├ optional integrity verification
    ├ cache / eviction
    └ decode / Runtime locator
        ↓
UI
```

若未来使用 Server-side proxy/fetch，必须拒绝 localhost、loopback、private/link-local、cloud metadata 等目标并防止重定向绕过，避免 Remote Media 形成 SSRF。

#### 9.3.7 Remote Media 与 CSS

CSS 中的远程图片型 `url(...)` 可以保留作者体验，但 Build/Runtime 必须把它识别为 Remote Media Ref 并经过 Resolver。

这不扩展到：

- remote `@import`；
- remote JavaScript；
- remote executable HTML；
- 默认 remote font；
- 任意 CSS-triggered network endpoint。

最终资源原则调整为：

> **所有可执行资源与权威依赖必须进入 exact dependency closure；Presentation Media 可以是 Embedded Exact Asset，也可以是受 Host 管理的 Remote Media Ref。**

### 9.4 Font

目标支持至少：

- WOFF2；
- WOFF；
- 经策略允许的 TTF / OTF；
- variable font；
- `font-display`；
- `font-feature-settings`；
- `font-variation-settings`；
- writing mode / text orientation。

字体自由度由 CSS / Package asset contract 管，不再由 Host UI theme 白名单决定。

### 9.5 SVG

SVG 分成两类：

- **Inline Declarative SVG**：属于 Canonical DOM，由 compiler / validator 检查；
- **External SVG Asset**：按 inert/sanitized presentation asset 处理。

不得通过 SVG 获得 script、remote executable dependency、`foreignObject` 等越权执行面。

Remote SVG 是否进入 Remote Media Ref 默认支持集合，后续单独冻结，不与普通 raster image 自动等同。

### 9.6 Stylesheet Scope / Theme

样式层级概念上分为：

```text
Experience Theme
        ↓
Package Global
        ↓
Component Scoped
        ↓
Instance dynamic class/data/CSS vars
```

- Experience Theme：游戏 Design System 与主题 token；
- Package Global：reset、typography、utility；
- Component Scoped：默认组件样式；
- Instance Dynamic：通过 class / `data-*` / CSS custom properties 表达动态状态。

Package-global 仍只在 Experience ShadowRoot 内全局。

### 9.7 Native Component Styling Contract

Host-owned Native Component 应提供稳定样式 API：

- `::part()`；
- CSS custom properties；
- typed props / states；
- 必要 slot。

Package 不依赖 Native Component 私有 DOM selector。

### 9.8 Build Artifact / Supply-chain Boundary

Atria 安装 `.atria` 时不得运行未知的：

- `npm install`
- `pnpm install`
- `yarn`
- `npm run build`
- package lifecycle scripts

第三方生态依赖应在作者开发 / Build 阶段完成 resolution、bundle 或 vendoring。

```text
author source
→ npm/Vite/framework build（作者环境）
→ Atria pack
→ validate + hash + dependency closure
→ .atria
→ Player install: validate / store / run
```

安装过程不执行第三方构建脚本。

### 9.9 Framework / Web Frontend 路线

v3 不把“任意 SPA bundle 直接注入 Experience DOM”作为 Native Frontend Core 的默认模式。

长期建议保留三条路线：

1. **Atria Native Frontend**
   - Declarative DOM / CSS / Component / Interaction；
   - 可选 Script Sandbox；
   - Studio、AI Authoring、Health、Migration、static analysis 的一等路线。

2. **Framework Authoring Adapter**
   - React / Vue 等通过 Atria custom renderer / compiler adapter authoring；
   - 最终仍落到 Canonical UI IR / Sandbox API；
   - 依赖真实 Browser DOM 的第三方 UI 库不保证自动兼容。

3. **Web Island**
   - 面向已经存在的 React / Vue / Svelte / Vite 等预构建 Web App；
   - 使用独立、强隔离 Browser Realm；
   - 允许 Island 内部拥有自己的 `window/document/framework runtime`；
   - 通过严格 CSP 与 typed message/RPC bridge 接入 Atria；
   - 不获得 Atria Host DOM、Authority object、raw Secret 或默认任意网络权限。

Web Island 是高级兼容能力，不作为绕过 Native Frontend Contract 的默认后门。

---

## 10. 当前明确禁止 / 非目标

当前设计仍不允许：

- Package CSS 逃逸到 Atria Host DOM；
- Package 直接控制 Atria Settings / Navigation / Shell；
- 裸 World / Session / Memory / Realm / Continuity 写入；
- Package 直接拿数据库或 repository handle；
- Package 裸文件系统；
- Package Secret / Provider access；
- remote executable HTML / JS dependency；
- arbitrary browser global；
- arbitrary Host DOM traversal；
- 用前端 local storage 建立第二套 Game Authority；
- 因为使用 Script Runtime 而绕过 Typed Capability Bridge。

---

## 11. Hard Cut / Clean Break

本项目当前没有需要保护的真实用户、第三方作者生态或历史 Package 数据，因此本重构明确采用 **hard cut**，不为 Native UI v1/v2 建立向后兼容负担。

### 11.1 不做兼容层

明确不实施：

- v1/v2 → v3 Migration Assistant；
- `v2-compat.css`；
- legacy renderer 与 v3 renderer 长期并存；
- legacy PackageVersion 自动迁移；
- legacy manifest 字段兼容解析；
- v1/v2 deprecation 周期；
- 为旧 Studio 文档建立 round-trip 兼容；
- 为旧数据保留双写 / fallback 路径。

现有开发期 Package / fixture / test data 如需继续使用，可以随实现阶段直接重建、改写或删除。

### 11.2 v3 成为唯一 Native Frontend Contract

重构完成后的目标状态：

- 非 `text` Experience 统一使用新的 `frontend` contract；
- 删除 `componentModelVersion` 作为现代 Runtime selector；
- 删除旧 `component / selectors / surface` legacy runtime declaration；
- 删除 Native UI v1/v2 renderer、compiler 与只为旧 schema 服务的 compatibility path；
- Studio、Preview、Health、Package validation 直接以新 Frontend Runtime 为唯一 Native UI authoring/runtime 基线。

实现期间允许短暂保留旧代码作为开发对照，但最终完成条件是旧 Runtime 已从正式执行路径移除，而不是“新旧都能跑”。

### 11.3 Versioning 只服务未来演进

v3 的版本体系不再被旧数据约束。

仍然保留清晰的独立版本边界，因为它们对未来演进有价值：

- Experience / Runtime envelope version；
- Native Frontend contract version；
- individual capability version；
- Script / Remote Media / Canvas / Web Island 等独立 capability version。

是否提升现有 `ExperienceContract.schemaVersion`，由新的最终字段模型是否构成更清晰的 breaking contract 决定；不再因为“兼容旧 v1/v2”而避免升级。

### 11.4 Frontend Runtime 与 Experience Mode

`Component / Hybrid / Full` 继续只表示 layout ownership。

新的非 Text Experience 概念形态倾向为：

```yaml
runtime:
  experience:
    mode: hybrid
    frontend:
      kind: native
      version: 3
      entry: ui/main.frontend.json
```

正式字段名与 schemaVersion 在后续 Manifest 讨论中冻结。

### 11.5 Runtime kinds

Runtime 层只需要考虑：

- `native`：Atria Native Frontend；
- future `web-island`：独立 Browser Realm。

React / Vue / Svelte 等属于 authoring/build technology，不成为 Runtime kind。

Framework Adapter 最终编译到 Native Frontend Contract。

### 11.6 v3 Baseline

当前倾向：

1. **Atria Native Frontend v3**：Core baseline；
2. **Framework Adapter extension point**：进入架构与 authoring contract，但不要求所有框架 adapter 在 Core 首版完成；
3. **Web Island seam**：在架构中预留独立 capability/bridge，不作为 Core v3 首版完成条件。

Host Bridge 语义必须跨 Native Declarative、Sandbox Script 与未来 Web Island 保持一致，Web Island 不获得专属裸 Authority API。

### 11.7 Studio / AI / Health

- Native Frontend v3：完整结构化 authoring / preview / health / AI editing；
- Framework Adapter：编译到 Canonical IR 后获得对应 Runtime 分析能力；
- Web Island：未来只保证 package/permission/bridge/runtime diagnostics 与 preview，不要求 Host 理解其内部任意 framework component tree。



---

## 12. Frontend Host Bridge

### 12.1 定位

Native Frontend v3 不直接暴露 Atria 内部对象，而是暴露一个版本化、typed、declared、scoped 的 **Frontend Host Bridge**。

Bridge 是跨 Frontend Runtime / Sandbox / future Web Island 边界的 Host protocol，不承载 Package 内部本地 UI 能力。

Package 内部能力例如：

- Component / View / UI / Draft state；
- timer；
- NodeRef；
- focus / scroll；
- overlay；
- drag/drop；
- Canvas drawing；

属于 Frontend Runtime 本地层，不需要 Host RPC。

跨到 Atria Authority / Host service 的操作才进入 Bridge。

### 12.2 统一语义，不同 Transport

同一 Bridge 语义服务于：

- Native Declarative IR：进程内 adapter；
- Sandbox Script：structured message / proxy；
- future Web Island：postMessage / typed RPC。

三者的 method semantics、input/output schema、receipt、error 与 permission policy 必须一致。

不同 Runtime 只改变 transport / isolation，不改变 Authority API。

### 12.3 Declared Binding Registry

Frontend 不直接获得：

- `WorldSession`；
- `SessionCore`；
- repository / database；
- raw Host service object；
- arbitrary command selector。

Package 必须在 UI 激活前声明 Frontend 可访问的 Bridge Bindings。

Frontend 运行时只引用 stable binding ID，例如：

```text
host.action.invoke("buy-item", payload)
host.data.snapshot("player-ui")
host.operation.start("battle", input)
```

Binding 在 Build / Preflight 阶段解析到现有正式 typed contract，例如：

- World Command；
- Session Application Command；
- Continuity；
- Shared / Realm；
- Model Task；
- Activity；
- scoped Information / Projection。

未声明 Binding 不可调用。

### 12.4 Read Plane — `host.data`

Frontend 读取 Authority 只能通过 declared scoped projection，不直接 `getState()` 或 arbitrary query。

概念 API：

```text
host.data.snapshot(bindingId)
host.data.subscribe(bindingId)
```

Read Binding 必须受既有 Exposure / Perspective / Information contract 约束。

Projection 可以很宽，但必须显式声明并由 Host contract 授权。

Snapshot / update 应携带足够的版本信息，例如：

- binding id；
- revision / cursor；
- projection/schema version；
- typed value。

未来 Web Island 使用同一 bounded snapshot/update 语义。

### 12.5 Write Plane — `host.action`

短事务统一收敛为：

```text
host.action.invoke(bindingId, input)
```

Binding kind 可以映射：

- World Command；
- Application Command；
- Continuity Command / Transfer；
- Realm Command / Transfer；
- Shared Command / Turn operation；
- 其它已有 typed authority intent。

Bridge 不引入新的 mutation/reducer/authority 模型。

### 12.6 Long-running Plane — `host.operation`

Task / Activity / Background Operation 等长时能力统一抽象为：

```text
host.operation.start(bindingId, input)
```

返回 opaque operation handle / id，并支持：

- status；
- progress；
- stream / incremental result；
- result；
- cancel。

Scheduler、backpressure、timeout、retry、provider 与 Secret 继续 Host-owned。

### 12.7 Composer Service

Composer 保留专用 service：

- getDraft；
- setDraft；
- append；
- clear；
- focus；
- submit。

`submit` 仍进入正式 Turn / Session 流程，Frontend 不直接构造 Timeline authority。

### 12.8 Media Service

`host.media` 负责：

- resolve AssetRef / ImageRef；
- Remote Media Resolver；
- prefetch hint；
- status；
- release / lifecycle；
- 为 Canvas 等返回安全 MediaHandle。

Script / Web Island 不获得 raw arbitrary network response。

### 12.9 Host Presentation Service

只把真正 Host-owned 的 Presentation 放进 Bridge，例如：

- request / exit fullscreen；
- Scene；
- Speech；
- 其它明确由 Host 掌控的 presentation capability。

Package 内 modal、tab、tooltip、overlay、local routing、DOM focus/scroll 继续由 Frontend Runtime 自己完成。

### 12.10 Input Projection

Keyboard/Gamepad/Touch 的游戏主控制优先通过 semantic Input Action 事件投影给 Frontend。

Bridge 不暴露 raw Host device object。

低级键盘/pointer event 仍可由 Package UI Runtime 本地处理。

### 12.11 Preferences / Persistence

v3 baseline 不提供 generic durable KV / localStorage replacement。

持久化的非权威前端状态优先使用 declared typed `prefs`。

原因是 generic persistent KV 很容易被滥用成第二套：

- World；
- Quest；
- Economy；
- Character state。

未来如确有大型前端缓存需求，可单独设计 `frontend-cache@1`：

- evictable；
- quota-controlled；
- non-authoritative；
- 不进入 Prompt；
- 不作为 Save truth；
- Host 可随时驱逐。

### 12.12 External Host Services

External URL 不直接使用 `window.open`，而通过 Host-mediated service：

- scheme/origin policy；
- declared binding / permission；
- user gesture；
- 必要时 confirm。

Clipboard、File Picker、Import/Export、Camera、Microphone 等未来能力也沿用 permissioned Host Service，而不是裸 Browser API。

### 12.13 Unified Receipt

Bridge 对 Frontend 统一 Request / Receipt contract。

概念字段包括：

- requestId；
- bindingId；
- status；
- typed result；
- revision / conflict metadata；
- diagnostics；
- stable reasonCode。

状态至少覆盖：

- completed；
- cancelled；
- rejected；
- failed。

错误类别至少可机器区分：

- validation_failed；
- permission_denied；
- unsupported；
- unavailable；
- stale_revision；
- conflict；
- cancelled；
- timeout；
- rate_limited；
- host_failure。

不同底层 Native API 可以保留自己的内部 receipt，但 Frontend Bridge 对外保持统一。

### 12.14 Idempotency

Bridge request 应使用稳定 requestId / operationId。

Duplicate suppression、retry、uncertain commit、revision idempotency 等语义继续由 Host contract 决定，不允许 Declarative、Sandbox 与 Web Island 各自发明不同事务语义。

### 12.15 统一 Registry

Declarative Action IR、Sandbox Script 与 future Web Island RPC 必须访问同一个 Binding Registry。

最终结构：

```text
Frontend
├─ data.snapshot("player")
├─ action.invoke("buy-item")
├─ operation.start("battle")
├─ composer.submit()
└─ media.resolve(portrait)
        ↓
Frontend Host Bridge
        ↓
Declared Binding Registry
        ↓
Existing Native Runtime / Authority
```

Binding Declaration 必须位于 UI 激活前即可验证的 Manifest / Experience Contract 层，不允许藏在运行时脚本中。

核心原则：

> **能力可以很广，但入口必须 typed + declared + scoped。**


---

## 13. Bridge Binding Manifest

### 13.1 独立 Bridge Version

建议定义独立的 `bridge.version: 1`。

Frontend document version 与 Host Bridge protocol version 应独立演进：

- `frontend.kind/version`：描述 UI Runtime contract；
- `bridge.version`：描述 Frontend ↔ Host protocol contract。

这样未来 UI Authoring/DOM schema 调整不必机械升级 Bridge，反之亦然。

### 13.2 三类自定义 Binding

Authoring Source 中的 Experience Binding Registry 只保留三类自定义 Binding：

- `reads`；
- `actions`；
- `operations`。

不提供任意 `services` registry。

`composer / media / presentation / external` 属于 Host 固定 Service Namespace，其存在与版本由 Frontend baseline、Runtime Feature 与 Permission negotiation 决定。

需要固定目标的 external navigation 等可通过声明式 target/binding 约束，而不是让 Package 注册任意 Host service。

### 13.3 Authoring Binding 与 Compiled Descriptor 分离

Authoring Source 只声明语义 intent，不重复拷贝底层 Native Contract。

Build Compiler 解析 target 后生成 **Compiled Bridge Descriptor**，至少物化：

- binding id；
- normalized public input/output schema；
- target contract identity；
- contract/schema digest；
- delivery capabilities；
- receipt / idempotency policy；
- permission/feature requirements；
- compiled safe mapping。

Frontend Runtime 只依赖 Compiled Descriptor，不需要接触真实 World/Application/Task 内部对象。

概念 Authoring shape：

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
      args: ...

  operations:
    - id: generate-profile
      inputSchema: ...
      target:
        kind: task
        taskId: profile
        variantId: default
      input: ...
```

### 13.4 Read Binding

Read target 必须引用现有 typed / bounded projection contract，不能指向 raw Authority。

首要 adapter 可以复用：

- Information View；
- Application projection；
- Continuity projection；
- Shared / Realm projection；
- Temporal projection；
- 其它已有 Host-owned readonly projection。

禁止 generic `getEverything()` / arbitrary state path query 作为默认 Bridge contract。

Read baseline：

- `snapshot()` 必须支持；
- `subscribe()` 可由 compiled descriptor 声明；
- snapshot/update 携带 bindingId、revision/cursor、schema/version 与 typed payload。

初版优先允许 coalesced/full replacement snapshot，不为了性能过早引入复杂 patch mutation vocabulary。

未来 read-only delta 可以通过 Bridge version/Feature 独立演进。

### 13.5 Action Binding

Action Binding 的 public input schema 可以与底层 Command args 不同。

Binding 可以使用 safe expression / value-template 将 Frontend input 映射为 target args。

Build 阶段必须证明映射结果满足目标 typed schema。

因此 Binding 是稳定的 **Frontend API façade**，而不只是 Command alias。

Action return 默认只提供统一 Bridge Receipt，不返回整份新 Authority state。权威变化通过 Read subscription 传播，避免 action-return 与 projection 形成双数据源。

### 13.6 Operation Binding

Operation Binding 可映射：

- Model Task；
- Activity；
- future resumable/background Host operation。

Build Compiler 物化：

- input schema；
- final result schema；
- progress / partial-result capability；
- cancel capability；
- queue/execution metadata。

Runtime Handle 的统一状态包括：

- queued；
- running；
- progress / partial；
- completed；
- failed；
- cancelled。

Scheduler、backpressure、retry、timeout、provider、Secret 继续 Host-owned。

### 13.7 Stable Semantic Identity

Binding ID 是 Frontend public contract 的稳定 semantic identity。

只要公开语义未变，即使底层 Command/Task/Domain 重构，也应尽量保持 Binding ID。

这样 Component、Studio、AI Authoring 与 Web Island client contract 不被底层 authority implementation 名称绑死。

### 13.8 Experience Registry 是真正安全边界

**Experience-level Binding Registry 是 Host 安全边界。**

未进入 Registry 的 Authority / Task / projection 不可由该 Frontend 调用。

Component-level access 只能缩小 Registry，不得扩大它。

### 13.9 Component `uses:`

Component-level `uses:` 定位为 least-authority dependency contract，而不是第二套用户 Permission 系统。

Declarative Component：

- Compiler 默认根据 data/action/operation/service refs 自动推导 `uses`；
- 作者无需为普通 UI 手工维护；
- 可显式声明，以形成可复用 Component contract。

Script Controller：

- 必须显式声明 `uses`；
- Runtime 只注入声明过的 read/action/operation/service handles；
- 不提供全局万能 `host` object；
- Script Component 无法通过动态字符串访问其它 Binding。

Child `uses` 必须是 Experience Registry 的子集。

这主要用于：

- 防止 accidental coupling；
- least-authority；
- component reuse；
- AI/static analysis；
- 第三方 component review。

它不能替代 Host Permission，因为 Package 作者本身仍可修改 Experience Registry / Manifest。

### 13.10 Pure Presentation Component

普通 Package Component 默认继续遵循 Props Down / Events Up。

没有 `uses` 的 Component 是 pure presentation component，不直接获得 Host Bridge。

这应成为最推荐的可复用组件形态。

### 13.11 Fixed Services Narrowing

Script Component 对固定 Host services 也通过 `uses.services` 缩权，例如：

- composer；
- media；
- presentation；
- external。

Declarative IR 可以由 Compiler 自动推导所需 service usage。

### 13.12 External Navigation

External Navigation 倾向进入 Native v3 baseline Host Service，但仍为 Host-mediated：

- 仅允许 declared HTTPS target / Atria route；
- 需要 user gesture；
- scheme / origin validation；
- Host 可以要求 confirmation；
- 不暴露 `window.open`。

Clipboard、File Picker、Import/Export、Camera、Microphone 暂不作为 Core v3 baseline；保留 permissioned Host Service extension seam。

### 13.13 Future Web Island Handshake Seam

当前只冻结安全 seam，不要求 Core v3 实现完整 Web Island：

- 独立 Browser Realm；
- structured-clone message；
- Host-issued `frontendInstanceId`；
- Host-issued nonce/capability token；
- 首次 handshake 协商 Bridge version / features；
- Host 验证 source/origin/instance/token；
- 每次请求带 requestId；
- reload/unmount 后 token 立即 revoke；
- Island 只获得 Compiled Descriptor 中允许的 bindings/services。

Web Island 不得运行时注册新的 Authority Binding。

### 13.14 Pre-execution Validation

Binding Registry 与 Compiled Bridge Descriptor 必须在任何 Frontend Script / Web Island code 执行前完成完整 validation。

运行时代码只能消费已验证 contract，不能通过动态注册扩大权限。


---

## 14. Native Frontend Source / Canonical Runtime Graph

### 14.1 Authoring Source 与 Runtime IR 分离

Native Frontend v3 明确采用：

```text
Authoring Source Graph
    ↓ compile
Canonical Runtime Graph
    ↓ validate
Native Frontend Runtime
```

Authoring Source 是人类、Studio、AI 的唯一编辑权威。

Canonical IR / Runtime Graph 是 **derived-readonly build artifact**，面向 Runtime、validator、cache、hash 与安装验证，不追求人类直接手写体验。

Studio / AI 不直接修改 IR。

Preview 必须走：

```text
Source
→ Production Compiler
→ exact preview IR
→ Production Renderer
```

不得为 Studio 单独维护第二套 UI compiler/renderer 语义。

### 14.2 Project Source 与 Installed Runtime Contract 分离

Project Authoring Contract 与发布后 Package Runtime Contract 不复用同一个 path 字段。

概念上：

- Authoring Project 使用 `frontend.source` 指向 Source Graph descriptor；
- Build 后 Installed Package 使用 `frontend.entry` 指向 Compiled Frontend Index。

正式字段名后续可调整，但 Runtime 不应猜测一个文件是 author source 还是 compiled IR。

### 14.3 推荐 Source Graph 目录

Studio 默认生成结构可以类似：

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
└─ controllers/
   └─ relationship-graph.ts
```

目录结构是推荐组织，不是 Runtime semantic requirement。Compiler 依据 Source Graph refs 解析工程。

### 14.4 `frontend.json` 作为轻量 Source Index

`frontend.json` 不承载整个 UI tree，只声明 Source Graph 入口，例如：

- frontend source schema/version；
- Views 与 surface/mount；
- root component refs；
- global/theme stylesheet refs；
- global `ui/draft/prefs` state refs；
- Bridge Registry ref；
- optional source-level feature refs。

View 本质是：

> Surface / Mount metadata + Root Package Component。

不再创建独立于 Package Component 的第二套 View DOM language。

### 14.5 Atria-owned Component Authoring Syntax

建议提供 Atria-owned SFC-like authoring syntax，暂称 `.aui`，名称尚未冻结。

一个 Component Source 可以自然 colocate：

- template / Declarative DOM；
- typed props；
- emits；
- slots / scoped slots；
- component local state；
- computed values；
- declarative interaction handlers；
- `uses`；
- optional scoped CSS；
- optional Sandbox Controller ref。

`.aui` 只属于 Authoring Layer。Compiler 输出 Canonical Component IR。

不再要求作者长期手写巨大 JSON tree；JSON 更适合 index、schema、state、bridge 等严格结构化 contract。

### 14.6 Style Authoring

样式同时允许：

1. 独立真实 `.css` 文件；
2. Component Source 内 scoped style block。

大型项目的 Theme / Global / shared style 推荐独立 CSS；小组件可以单文件 colocate。

两者最终编译进入同一个 Style Graph。

### 14.7 Interaction / Controller Authoring

交互复杂度按层次递增：

```text
Static Component
→ Declarative Interaction
→ Shared Interaction Module
→ Sandbox Script Controller
```

简单交互 colocate 在 Component Source。

复杂算法、Canvas、图布局等可以绑定 optional JS/TS Controller。

Runtime 不直接执行 author source；Controller 必须 Build 为 sandbox-compatible compiled module。

### 14.8 State Authoring

Experience-global：

- `ui`；
- `draft`；
- `prefs`；

集中在 Frontend Source Graph 中声明。

Component local state 与 Component Source colocate。

这样保持此前定义的 state lifetime / authority separation。

### 14.9 Bridge Registry 独立

Experience-level Bridge Binding Registry 保持独立 source resource。

Component 只通过 `uses` 消费 Binding。

Authority target declaration 不散落进 Component template/controller source。

即：

```text
Bridge Registry = 定义 Host API
Component uses = 消费 Host API
```

### 14.10 Canonical Runtime Graph

Build output 不做单一巨大 JSON。

推荐结构：

```text
Compiled Frontend Index
├─ View IR refs
├─ Component IR refs
├─ Compiled Bridge Descriptor
├─ Style assets
├─ Sandbox controller modules
└─ Frontend asset/media refs
```

每个 Runtime resource 使用 stable logical identity + exact content identity/hash。

Source path 只用于 authoring/provenance，不作为 Runtime authority identity。

### 14.11 Lazy Loading / Code Splitting

View / Component / Controller 边界天然形成 lazy-loading boundary。

例如 on-demand drawer/modal/Phone/Church View 不必随 primary view 一次加载。

Runtime activation：

1. 加载/验证小型 Frontend Index；
2. preflight Bridge/features/permissions；
3. 加载 primary View；
4. 按需加载其它 exact Component/View/Controller resources。

不需要引入不可解释的自动 bundler chunk identity 作为 Runtime contract。

### 14.12 Source Map / Provenance

Compiler 必须建立正式的 Source Map / Provenance：

- compiled component → source file/span；
- node → source span；
- interaction/action → source span；
- controller compiled module → TS/JS source；
- style diagnostic → source CSS/style block。

Studio Preview / Build / Health diagnostics 必须优先指回作者 Source，而不是只报 IR node。

Release Runtime 不依赖 Source Map 执行。

完整 source/source map 是否随 `.atria` 发布可以由 build profile 决定。

### 14.13 Stable Semantic IDs

Native Source 应支持 stable semantic identities。

Studio 与 AI 的 structured edits 应优先按：

- Component ID；
- Node ID；
- Binding ID；
- Interaction ID；

定位，而不是只依赖行号。

如果 `.aui` 最终采用文本语法，Studio 推荐使用 format-preserving CST + semantic AST，尽量保留人工注释、排版与文件组织。

### 14.14 Small / Large Project 同一 Contract

不建立“Simple UI / Advanced UI”两套 Runtime。

小型 UI 可以只有：

```text
frontend.json
views/Main.aui
```

并把 style/interaction colocate。

大型 UI 自然拆成多 View / Component / Style / Controller。

最终全部编译为同一 Canonical Runtime Graph。

### 14.15 Project 与 Release

Project / Repository 保存完整 Authoring Source。

正式 `.atria` Runtime Authority 默认是：

- compiled Frontend Index；
- compiled Component/View IR；
- compiled styles；
- sandbox modules；
- exact embedded assets；
- Remote Media refs；
- Compiled Bridge Descriptor。

Author Source / comments / authoring layout 不属于 Runtime Authority。

Source bundle / Source Map 可以作为 optional debug/remix artifact 携带，但 Runtime 永远不执行 Source。

### 14.16 Framework Adapter

Framework Adapter 负责：

```text
React / Vue / Svelte authoring
→ Adapter / Compiler
→ Canonical Runtime Graph
```

Core Runtime 不关心作者使用何种 framework。

Core Studio / AI 能完整理解 compiled IR，但不承诺将任意视觉编辑无损 round-trip 回 React/Vue/Svelte 原源码。

Native `.aui` Source 是 Studio / AI first-class authoring path。


---

## 15. Script Sandbox Runtime

### 15.1 Worker 不是最终 Sandbox

Dedicated Worker 适合作为：

- execution supervisor；
- thread isolation；
- runaway / hung runtime 的 hard terminate boundary。

但 Worker 本身仍具有 Web APIs，因此 Package code 不直接运行在裸 Worker Global。

v3 推荐：

```text
Main Frontend Runtime
    ⇅ structured messages
Script Sandbox Supervisor Worker
    └ Embedded isolated JS VM
         ├ Package compiled modules
         ├ standard ECMAScript subset
         └ injected scoped capabilities only
```

Worker 负责故障/线程隔离，VM 负责真正的 global/heap/capability isolation。

### 15.2 VM 实现不在 Plan 阶段锁死

具体实现可以在 Implementation 阶段比较：

- QuickJS-like embedded engine；
- WASM-hosted JS VM；
- platform/native isolate；
- 其它满足 contract 的隔离执行器。

Plan 冻结的是：

- 独立 heap/global；
- capability-only injection；
- Host 可强制中止；
- resource budgets；
- typed message boundary。

不以 plain Worker、same-realm `Object.freeze`、Proxy-only 或同 Realm compartment 作为唯一安全边界。

### 15.3 Isolation Granularity

当前倾向：

> **一个 active Experience 一个 Supervisor Worker + 一个 VM。**

同一 Package 的多个 Controller 属于同一 Package trust domain，不为每个 Component 创建独立 VM/Worker。

不同 Experience / Package 不共享 VM heap。

Component-level least-authority 继续通过 `uses` 生成的 capability handles 实现。

### 15.4 JS / TS Authoring Pipeline

作者可使用 modern JavaScript / TypeScript Controller。

Build：

```text
JS/TS Source
→ transpile / bundle / link
→ sandbox compatibility validation
→ compiled Sandbox Module
→ exact module graph + content hash
→ .atria
```

Runtime 不执行：

- TypeScript source；
- npm lifecycle/build scripts；
- authoring source module graph。

玩家安装时不执行 dependency manager。

### 15.5 Module Graph

允许：

- Package-local static imports；
- vendored / bundled sandbox-compatible pure JS dependencies。

v3 初版禁止：

- runtime dynamic import；
- remote import；
- Node built-ins；
- native addon；
- DOM/browser-runtime dependencies；
- hidden runtime package resolution。

Static analysis 可以提前报告 `window/document/fetch/eval/dynamic import` 等明显不兼容行为，但安全边界不能依赖 lint/regex，最终权限仍由 VM capability model 保证。

### 15.6 Stable Controller ABI

Authoring Syntax 与 Runtime ABI 分离。

Compiler 应生成稳定 Controller ABI，至少覆盖：

- module load；
- component instance create；
- lifecycle hook invoke；
- event invoke；
- instance dispose；
- module dispose。

作者可以使用 TS helper / `.aui` sugar，但 Runtime 只理解 compiled ABI。

### 15.7 Controller Instance Context

每个挂载 Component 可以拥有独立 Controller instance。

Controller 只获得：

- readonly props；
- event；
- env；
- component-local state handle；
- `emit`；
- 显式声明的 NodeRef / CanvasRef；
- 根据 `uses` 缩权后的 reads/actions/operations；
- 根据 `uses.services` 缩权后的 fixed Host services；
- safe scheduler / UI clock / non-authoritative random。

不获得：

- global `host`；
- real DOM；
- `window/document`；
- raw Authority objects；
- filesystem/database/network ambient API。

### 15.8 Script Heap 是 Ephemeral

Controller/VM heap 可保存：

- memoization；
- layout cache；
- spatial index；
- temporary geometry/data structures。

但被定义为 **ephemeral non-authoritative state**。

Worker/VM 重启后可以丢失。

真正必须恢复的语义状态必须存在于：

- props / Host projection；
- declared Frontend state；
- prefs；
-正式 Authority。

因此 Script Runtime 可以被整体 kill/restart，而不破坏游戏事实。

### 15.9 Crash / Recovery

普通 Controller exception：

- 当前 invocation 失败；
- 产生 scoped Diagnostic；
- 不直接崩溃 Atria Host。

runaway loop / engine failure：

1. Host watchdog terminate Worker；
2. 重建 Worker/VM；
3. 重新创建 Controller instances；
4. 使用仍在 Host/Main Runtime 的 Frontend State / projection 恢复。

连续 crash 可以由 Experience Health 标记 Script Runtime unhealthy。

required script feature 无法恢复时 Experience 进入明确 failure；optional script 可以由 Package 使用 Declarative fallback。

### 15.10 Async / Scheduler

允许 Promise / async。

Host Bridge request 本质是 async typed message。

不向 Controller 提供裸 browser `setTimeout/setInterval` 作为 ambient authority；提供 Experience/instance-scoped scheduler：

- after；
- every；
- cancel；
- yield。

Component/Controller dispose 时相关 timer/callback 自动 revoke/cancel。

复杂纯计算可显式 cooperative `yield`，Host 仍保留 hard execution budget。

### 15.11 Clock / Random

Authority RNG / World time 永远使用 Host contract。

Sandbox 只需要非权威 UI clock/random。

倾向提供：

- testable monotonic UI clock；
- seeded/non-authoritative random helper。

不得让 Sandbox wall clock / random 直接决定游戏 Authority。

### 15.12 Resource Budgets

Plan 不提前写死具体毫秒/MB，但 Runtime Contract 必须支持 Host policy 约束：

- max VM heap；
- per-invocation CPU/instruction/wall-time；
- per-Experience script budget；
- module/bundle bytes；
- message payload；
- queue depth；
- outstanding async request；
- operation concurrency；
- hard terminate。

Package 可以提供 workload hint，但 Host caps 永远优先。

### 15.13 Message Boundary

Worker/VM/Host 边界默认使用更严格的 JSON-like typed payload。

不跨边界传：

- Function；
- DOM node；
- prototype-rich object；
- raw Host objects。

ArrayBuffer / TypedArray 等高性能数据需要显式 allowlist 与 budget，不因为浏览器 structured clone 支持就默认进入 Package ABI。

### 15.14 Third-party Pure JS

允许 author Build 阶段 vendoring/bundle pure JS dependency。

兼容要求：

- 不依赖 DOM；
- 不依赖 network；
- 不依赖 Node built-in/native addon；
- 能在 Sandbox ECMAScript contract 内运行。

依赖真实 Browser DOM 的 UI/Chart library 不自动兼容 Native Sandbox，应通过：

- Atria-native component/graphics adapter；
- Framework Adapter；
- future Web Island。

### 15.15 Canvas2D Command Buffer

Canvas2D baseline 当前倾向使用 **batched / retained Drawing Command Buffer**。

不把真实 `CanvasRenderingContext2D` 注入 VM，也不把每个 draw call 单独 RPC。

```text
Controller / VM
    ↓ build typed draw commands
Drawing Command Buffer
    ↓ one flush/frame
Host
    ↓ validate budgets/handles
Canvas renderer
```

目标支持足够宽的 Canvas2D subset：

- path；
- stroke/fill；
- text；
- transform；
- clip；
- gradients；
- image；
- compositing 等适合游戏 UI 的常用能力。

Image 只来自安全 MediaHandle。

future 可以增加 OffscreenCanvas / graphics fast-path feature，但 Core baseline 不依赖真实 Browser Canvas object。

### 15.16 WebAssembly

WebAssembly 不进入 `frontend-script@1` baseline。

预留 future `frontend-wasm@1`。

未来 WASM 仍复用：

- same Worker supervisor；
- same Host Bridge；
- same permission/budget model。

避免 v3 Core 首版同时维护 arbitrary JS VM 与 arbitrary WASM 两种执行安全面。

### 15.17 Debug / Source Map

Compiled Sandbox Module 必须保留 Controller source provenance / source map。

Studio 能把 stack/error 映射回：

- `.ts`；
- `.js`；
- `.aui` controller binding。

Production diagnostics 不泄漏 Host internal stack/object。

Studio 可支持 Controller hot reload：重新加载 module/instances，同时尽量保留 Host-side Frontend State。

### 15.18 Script 是 Declarative Runtime 的增强

Script Runtime 不取代 Canonical UI：

- DOM / Component tree 仍由 Canonical IR；
- Script 修改 Frontend state；
- emit Component events；
- 使用 scoped NodeRef presentation handles；
- 生成 Canvas command buffer；
- 调用 scoped Host Bridge handles。

禁止 Script 重新通过 `createElement / innerHTML / arbitrary selector` 成为主要 UI construction path。


---

## 16. Gap Review / Pressure Test

本轮以真实 `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference` 以及 Visual Novel、RPG、Phone/IM、Church/经营、关系图/地图、AI Task、Remote Portrait、移动端、Component/Hybrid/Full、Studio/AI、Crash/Offline/Denied 等场景对 Native Frontend v3 进行压力测试。

### 16.1 已覆盖良好

当前架构已能自然覆盖：

- Full CSS / DOM / Font / Animation 自定义；
- RPG Inventory / Equipment / Character Sheet；
- Church /经营模拟的 World/Application typed authority；
- Map / Relationship Graph / Canvas；
- AI Task progress / partial / cancel；
- Remote Portrait / CG；
- Component / Hybrid / Full layout ownership；
- Script crash/restart；
- Permission denied / offline fallback。

这些场景未迫使架构退回 raw World patch、任意 Host DOM 或 unrestricted browser JS。

### 16.2 G-V3-1 — Headless Conversation / Composer / Session Presentation

仅通过 Host Native Component + `::part()` 不足以满足“几乎完全前端修改权限”。

重前端作者必须可以二选一：

1. 使用 managed `<atria-conversation>/<atria-composer>`；
2. 使用 headless Conversation / Composer / Session service + projection，自行渲染全部消息/输入 UI。

Headless surface 需要覆盖：

- canonical conversation/thread/message projection；
- streaming/provisional/final generation state；
- reply variant / branch presentation；
- retry / regenerate / select variant；
- generation status / cancel；
- Composer draft / submit；
- Message Projection / structured block / canonical prose presentation data。

Package 自绘 Conversation 仍不能直接写 Timeline；所有提交、retry、branch、variant 继续经过 Host typed contract。

### 16.3 G-V3-2 — Safe Rich Text / Prose Rendering

AI narrative / message content 不能依赖 raw HTML 或让 Script 自己执行 Markdown→DOM。

Native v3 baseline 需要提供安全 Prose/RichText layer：

- safe Prose/RichText AST，或等价 Host-owned prose compiler；
- Declarative prose/rich-text presentation primitive；
- canonical prose / Message Block 兼容；
- Package CSS 可自由 styling；
- 禁止 unsanitized model HTML 直接注入 DOM。

### 16.4 G-V3-3 — Collection Read / Query / Pagination

`host.data.snapshot(bindingId)` 对长期 SMS、Mail、Social、Inventory、日志等大型集合不足。

Read Binding 至少区分：

- scalar/snapshot read；
- bounded collection/query read。

Collection Read contract 需要：

- declared query schema；
- hard-bounded page size；
- stable sort/order；
- cursor/keyset pagination；
- optional declared filter/search fields；
- typed item/result schema；
- nextCursor；
- optional subscription/invalidation token。

概念 API：

```text
host.data.query("sms-thread", { threadId, cursor, limit })
```

Host 决定 query contract；不开放 arbitrary database query。

Virtualization 解决 DOM 规模，Collection Read 解决数据规模。

### 16.5 G-V3-4 — Surface Visual Containment / Top Layer

Shadow DOM 只隔离 selector/style inheritance，不能单独保证 Package 的 fixed/z-index/top-layer 视觉行为不会盖住 Host。

需要正式 **Surface Visual Containment Contract**：

- Component/Hybrid surface 由 Host 建立 paint/layout/stacking containment；
- Package `position: fixed` / z-index 不能逃出授权 surface；
- raw browser top-layer 不能成为绕过 Host 的旁路；
- Modal/Drawer/Tooltip/ContextMenu 使用 Experience Overlay Root / declared surface；
- Full 可以拥有 app stage，但 Atria 保留不可被 Package CSS/DOM 覆盖的 Host System/Escape Layer。

Host System Layer 至少用于：

- exit；
- save；
- stop generation；
- diagnostics；
- recovery。

### 16.6 G-V3-5 — Typed Dynamic Resource Binding

开放 Remote Media 后，动态任意 string → URL 会形成 network/privacy bypass。

因此：

- runtime dynamic media binding 只能接受 typed `ImageRef/MediaRef`；
- 禁止 arbitrary string → CSS `url(...)` / MediaRef cast；
- Script 不能用任意 projection 数据拼 remote URL 后交给 Media Resolver；
- Dynamic RemoteImageRef 必须来自 declared typed resource contract，并再次经过 permission/origin policy；
- dynamic CSS custom property binding 使用 typed value categories，默认不能承载 arbitrary URL/token stream。

Remote Media 必须保持“presentation resource capability”，不能退化为通用数据外传通道。

### 16.7 G-V3-6 — Localization / Locale / Text Formatting

Native v3 baseline 仍缺 Package localization runtime：

- Host locale / language / direction / timezone/preferences projection；
- Package localization resource graph；
- stable message key；
- interpolation；
- plural/select；
- number/date/time/list formatting；
- RTL / writing direction；
- locale fallback；
- Studio missing/unused key diagnostics。

### 16.8 G-V3-7 — IME / BeforeInput / Virtual Keyboard

中文/日文/韩文与移动端输入需要正式 Input Contract：

- `beforeinput`；
- compositionstart/update/end；
- selection/caret-safe controlled input；
- composition 期间不错误 submit/overwrite；
- VisualViewport / virtual-keyboard occlusion projection；
- safe-area + keyboard inset；
- textarea autosize/focus restoration。

### 16.9 G-V3-8 — Accessibility / User Preference Environment

Native v3 需要把以下环境与 authoring validation 纳入 baseline：

- reduced motion；
- contrast / forced-colors / color-scheme；
- text scale / zoom；
- pointer/touch modality；
- keyboard focus visibility；
- heading/label/ARIA validation；
- touch target diagnostics；
- live-region / announcement；
- modal overlay focus trap / restore。

### 16.10 G-V3-9 — Host Session / Conversation Control Services

Full/Hybrid 重前端需要正式 Host-level controls：

- save / savepoint；
- exit；
- retry / regenerate；
- branch / fork；
- select reply variant；
- stop generation；
- diagnostics / recovery；
- restart/new session（受 Host policy）。

这些不能伪装成 World Action，也不能暴露 SessionCore。

倾向增加固定 `host.session` / `host.conversation` service，底层复用现有 Session/Timeline/Reply Variant/Host Action contract。

### 16.11 G-V3-10 — Component/View Loading & Error Boundary

Lazy View、Remote Media、Script Controller、Collection Read 都可能异步失败。

Native v3 需要 declarative loading/error boundary：

- View/Component loading fallback；
- async resource failure fallback；
- retry hook；
- subtree error isolation；
- child failure 不必导致整个 Experience blank；
- Diagnostic 继续带 Source Map provenance。

### 16.12 非 Core v3 blocker

当前压力测试没有要求 Core v3 首版必须支持：

- arbitrary WebGL/WebGPU；
- pointer lock；
- raw network client；
- arbitrary filesystem；
- camera/microphone；
- WASM；
- Service Worker；
- browser history/deep-link routing；
- true DOM-owning React/Vue/Svelte SPA（future Web Island）。

### 16.13 Gap Review 结论

当前主架构成立，但还不能直接冻结 Implementation Baseline。

至少需要先解决 G-V3-1 ～ G-V3-10。

下一阶段优先解决：

1. Headless Conversation / Safe Prose；
2. Collection Read；
3. Surface Visual Containment；
4. Typed Dynamic Media；
5. Localization / IME / Accessibility；
6. Host Session Controls / Error Boundaries。

完成后再进行一次较短的第二轮 Gap Review，再决定是否进入 Implementation Baseline。

---

## 17. 当前待讨论主题

下一轮优先讨论：

### Resolve G-V3-1 ～ G-V3-5

- Managed vs Headless Conversation/Composer；
- Headless message/generation/reply-variant projection；
- Safe Prose/RichText AST；
- Collection Read/query/cursor contract；
- Surface Visual Containment / Host System Layer；
- Typed dynamic CSS/media values；
- Remote Media anti-exfiltration boundary。

---

## 18. 讨论流程约定

从本企划建立后，每一轮讨论遵循：

1. 先把上一轮讨论中已经形成的新结论增量或覆盖更新到本 Plan；
2. 若只是进一步解释而没有方案实质变化，不做机械重复；
3. 更新完成后，再继续本轮新的设计讨论；
4. 当前仍是讨论阶段，不创建实现分支、不写产品代码；
5. 等用户明确批准方案进入实施后，再依据最终 Plan 拆实施阶段与正式工作分支。
