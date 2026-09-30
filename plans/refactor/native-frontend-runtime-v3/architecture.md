# Atria Native Frontend Runtime v3 — Architecture

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

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
