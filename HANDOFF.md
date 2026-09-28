# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture / Gap Resolution
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Package pressure-test sample: `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference`
- Plan HEAD: `docs@fcc97a4b532e204407a99168dcccb642e85572c9`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.14

## 已写入 Plan

- Native Frontend v3 全部前序架构讨论；
- Script Sandbox Runtime；
- 第一轮 Gap Review G-V3-1 ～ G-V3-10。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

本轮正式解决 G-V3-1 ～ G-V3-5。

### G-V3-1 Resolution — Managed + Headless Conversation

- Conversation/Composer 采用双轨：
  1. **Managed**：Host 提供 `<atria-conversation>` / `<atria-composer>` 等 ready-to-use Native Component；
  2. **Headless**：Package 获取同一底层 Conversation/Composer/Session Projection + typed Host services，自行渲染全部 DOM/CSS。
- Managed Component 必须成为 Headless Service 的官方/reference client，而不是另一套聊天逻辑；这样两条路线在 authority、branch、generation、reply alternative、composer submit 语义上完全一致。
- 现有 `MessageProjection`、`ConversationThread`、Session projection、Reply Variant facade/branch graph 作为 Core 地基，不创建第二 Timeline/Conversation store。
- Headless Conversation fixed service 建议至少包括：
  - conversation/session summary snapshot；
  - committed message collection query；
  - active branch/revision/tail identity；
  - generation projection；
  - reply-alternative/branch metadata；
  - retry/regenerate/fork/switch/select 等 typed commands（具体命名跟现有 Native semantics 对齐）；
  - generation cancel/status；
  - history inspection metadata。
- Reply alternatives 保留当前 Native 语义：**同一 predecessor 下不同 committed assistant message / branch lineage**，不复活 legacy Swipe authority。
- Composer 仍保留独立 `host.composer`：
  - Package-owned textarea/input 可以绑定 draft；
  - `submit` 进入现有 Turn/Session authority；
  - Headless UI 不直接 append Timeline。
- Generation 必须区分：
  - committed Timeline Message；
  - ephemeral GenerationProjection。
- 建议 GenerationProjection 状态至少：
  - idle / preparing / streaming / finalizing / cancelling / failed；
  - generation/request identity；
  - provisional presentation text/prose；
  - started/updated metadata；
  - cancel availability。
- streaming/provisional 内容只属于 Presentation；final commit 后通过 committed conversation read 出现，不把 provisional token 当 Timeline authority。
- Component / Hybrid / Full 都可使用 Managed 或 Headless Conversation；Experience Mode 不决定 Conversation 权限。

### G-V3-2 Resolution — Safe Prose / RichText

- 在现有 `MessageProjection.flow = prose/block` 地基上正式增加 versioned **Prose AST / Prose Document**。
- Canonical message content 继续是 authoritative narrative text；Prose AST 是 inert presentation projection，不成为第二份 narrative truth。
- 推荐 AST 使用 canonical content 的 **span/range references** 或经过可验证的 exact textual mapping，而不是复制另一份可漂移 prose 文本。
- Prose 节点支持 baseline semantic structure：
  - paragraph；
  - line break；
  - emphasis / strong；
  - heading；
  - quote；
  - ordered/unordered list；
  - code/pre；
  - safe link；
  - inline semantic mark。
- 不支持 raw HTML node / script/style/embed/iframe。
- safe link 仍通过 Host External Navigation policy，不直接裸 `href/javascript:`。
- Native Declarative Runtime 提供 `prose/rich-text` primitive，把 Prose AST 展开成 **Experience-owned semantic DOM**，因此 Package CSS 可以完整控制排版，而不是把 prose 藏在 Host Shadow DOM。
- Managed Conversation 和 Headless Conversation 使用同一 Prose AST。
- Message Block 继续是独立 typed block；Prose AST 不吸收业务/Authority block。
- Host/model Markdown 如存在，必须先经 Host-owned bounded parser/compiler → Prose AST；Package 不执行 unsanitized Markdown→HTML。

### G-V3-3 Resolution — Collection Read

- Bridge Read 正式分两种：
  - `snapshot`；
  - `collection`。
- Collection Binding authoring contract 需要声明：
  - public query schema；
  - typed item schema；
  - hard max page size；
  - canonical/stable order；
  - allowed filters/search；
  - source projection/query adapter；
  - optional live/invalidation policy。
- 概念 API：
  - `data.page(bindingId, query)` / 等价命名；
  - 不使用 arbitrary DB query。
- 返回至少：
  - bindingId；
  - revision/snapshot identity；
  - query fingerprint；
  - items；
  - nextCursor / previousCursor（若 contract 支持）；
  - hasMore；
  - optional invalidation token。
- Cursor 是 Host opaque token，并绑定：
  - binding；
  - source revision/branch；
  - normalized query/order。
  不允许 Package 解码/伪造 cursor。
- revision/query 改变导致 cursor stale 时返回稳定 `stale_cursor` / 等价 reasonCode，UI 重新定位/刷新。
- 初版 live collection 不引入通用 mutable patch。优先：
  - invalidation event；
  - tail/anchor refresh；
  - coalesced refetch。
- 对 conversation/IM 可提供 declared live-tail optimization，但它仍是 Collection Read contract 的特化能力，不是第二套 message transport。
- Virtualization + Collection Read 配套：
  - virtualization 控制 DOM；
  - collection pagination 控制 Host→Frontend 数据规模。

### G-V3-4 Resolution — Surface Visual Containment

- ShadowRoot 继续负责 selector/style namespace；另增加 Host-owned **Visual Containment Layer**，两者共同构成 Experience boundary。
- Contract 要求 Component/Hybrid authorized surface 建立：
  - containing block；
  - paint containment；
  - independent stacking context；
  - clipping/overflow policy；
  - Host-defined surface bounds。
- Package `position: fixed/absolute`、z-index、filter/transform 等只能在授权 Visual Surface 内生效。
- Native Frontend 禁止直接使用 browser top-layer escalation：
  - modal `dialog.showModal`；
  - raw popover/top-layer API；
  - Package-driven fullscreen。
- Modal/Drawer/Tooltip/ContextMenu/Floating UI 使用 Experience Overlay Root / declared Host surface；Overlay Root 仍属于 Experience visual boundary。
- Full mode：
  - Package 拥有 Full Stage；
  - **Host System/Escape Layer 永远位于 Package boundary 外**；
  - Package CSS/DOM/Script 不得访问或覆盖。
- Host System Layer 至少保留：
  - Exit；
  - Stop Generation；
  - Save/Savepoint；
  - Diagnostics；
  - Recovery。
- 当前 `full-host.js` 的 recovery controls 可作为实现地基，但 v3 要把该边界提升成正式 Runtime Contract，而不是 DOM/CSS 偶然实现。
- Escape key/recovery gesture 属于 Host capture path；Package 不能永久吞掉最后的 recovery path。

### G-V3-5 Resolution — Typed Dynamic Media / Style Values

- 静态 CSS 仍保持近完整 CSS，Build 可解析静态 Package/Remote image URLs。
- Runtime 动态值不允许 arbitrary string/token stream 直接进入危险 CSS/resource sinks。
- 定义 typed dynamic style categories，例如：
  - number；
  - integer；
  - length；
  - percentage；
  - angle；
  - color；
  - opacity；
  - transform parameters；
  - enum/token from closed set；
  - ImageRef/MediaRef。
- CSS custom property 若允许 Runtime binding，也必须在 Source/Compiler 中声明 value type；未声明/raw token custom property 不接受来自 Authority/Script 的动态任意字符串。
- 动态 image/media sink 只接受 typed `ImageRef/MediaRef`，不接受 plain URL string。
- 为防允许域名上的数据外传，Runtime 不允许 Script/Projection 任意构造 `RemoteImageRef {url}`。
- Remote media identity 建议分成：
  1. **DeclaredRemoteMediaRef**：URL 在 Package Data/Frontend Media Catalog 中由 Build 预声明并验证；
  2. **HostIssuedMediaRef**：由受控 Host Operation（例如未来图像生成/用户选择）签发 opaque media identity。
- Frontend/Script 运行时主要传递 opaque/stable `mediaId` / typed ref，而不是拼接 URL。
- 大量角色立绘链接可进入 lightweight Remote Media Catalog：
  - mediaId；
  - URL/source candidates；
  - optional integrity；
  - dimensions/MIME/hints；
  - fallback；
  不需要把图片字节打进 `.atria`。
- Package Data 中静态 URL 同样在 Build 时进入 Remote Media Catalog。
- World/Application dynamic state 若需要选择立绘，存/投影的是 `mediaId/ImageRef`，不是可执行 URL 字符串。
- Live mutable remote images 仍允许，但 locator 必须来自预声明 catalog 或 Host-issued ref；“mutable”表示远端内容可变，不表示前端可动态构造 URL。
- Media Resolver 再次执行 origin/permission/cache/integrity policy。
- 这样 `remote-media` 继续解决大图体积问题，同时不会成为隐蔽的 arbitrary network/exfiltration API。

## 本轮总体结论

G-V3-1 ～ G-V3-5 均可在现有架构内解决，不需要推翻 Package Presentation / Host Authority 主原则。

本轮最重要的强化是：

1. **Managed UI 与 Headless Service 共用同一 Host contract**；
2. **Prose 是 typed inert presentation AST，而不是 raw HTML**；
3. **Read Plane 同时支持 bounded snapshot 与 bounded collection**；
4. **ShadowRoot + Visual Containment + Host System Layer 才构成完整视觉边界**；
5. **完整静态 CSS 与严格 typed dynamic sinks 分离**。

## 下一轮

先将本轮 G-V3-1 ～ G-V3-5 resolution 写入 Plan，然后解决剩余：

- G-V3-6 Localization；
- G-V3-7 IME / Virtual Keyboard；
- G-V3-8 Accessibility / preference environment；
- G-V3-9 Host Session / Conversation Control；
- G-V3-10 Loading / Error Boundary。

之后做第二次短 Gap Review；若没有新的 architecture blocker，再准备 Implementation Baseline / Phase 拆分。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重新讨论 Script Sandbox、Source Graph、基本 Remote Media 或 Bridge Registry。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
