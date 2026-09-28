# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture / Gap Review
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Package pressure-test sample: `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference`
- Plan HEAD: `docs@6a704ecd18436c82cd8973e317c0ccbefac84b53`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.13

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / CSS / fonts / components / interaction.
- Frontend Asset Graph / Remote Media / typed ImageRef.
- Hard cut v1/v2；v3 最终唯一正式 Native UI Runtime。
- Frontend Manifest / Runtime Features / Permissions / negotiation。
- Frontend Host Bridge + Bridge Binding Manifest。
- Source Graph / `.aui` / Canonical Runtime Graph / Source Map。
- Script Sandbox：
  - Supervisor Worker + isolated JS VM；
  - JS/TS build pipeline；
  - scoped handles；
  - ephemeral heap / crash recovery；
  - resource budgets；
  - Canvas2D command buffer；
  - WASM future seam。

## 本轮 Gap Review / Pressure Test（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

真实样本与场景：

- `native-heavy-frontend-reference` 当前包含 Story / Church / Schedule / Phone / People，SMS/Social/Mail、教会经营、Temporal、Application Command、AI Turn 等，且现有 D2 已明确记录 UI v2 styling/semantics 限制。
- 以 Visual Novel、RPG、Phone/IM、Church、关系图/地图、AI Task、Remote Portrait、移动端、Component/Hybrid/Full、Studio/AI、Crash/Offline/Denied 等场景逐项压力测试。

### 已覆盖良好，无新增架构缺口

- 自定义视觉/布局/字体/动画：Full CSS + DOM + Component System。
- RPG inventory/equipment/character sheet：Component + keyed list + drag/drop + typed actions；大型集合需下面新增 Collection Read。
- Church/经营：Bridge reads/actions + Application/World authority 足够。
- 关系图/地图/Canvas：Script Sandbox + Canvas command buffer 足够；WebGL/WASM 可后续。
- AI Task：Operation binding + progress/partial/cancel 足够。
- Remote portraits/CG：typed ImageRef + Remote Media Resolver + cache/fallback 足够。
- Component/Hybrid/Full 布局 ownership：总体模型成立。
- Crash/Script restart：Host-side state + ephemeral VM 模型成立。
- Permission denied/offline：capability projection + fallback 模型成立。

### Gaps found — 需要下一轮正式解决

#### G-V3-1 — Headless Conversation / Composer / Session Presentation

当前方案仍偏向“Host Native Component + ::part()”，这不足以满足“几乎完全前端修改权限”。

重前端作者必须能够二选一：

1. mount Host-managed `<atria-conversation>/<atria-composer>`；
2. 使用 **headless Host conversation/session service + projection** 完全自行渲染聊天/消息/Composer UI。

需要新增/冻结的 Host surface：

- canonical conversation/thread/message projection；
- streaming/provisional/final generation state；
- reply variant / branch presentation；
- retry / regenerate / select variant 等正式 Host actions；
- generation cancel/status；
- Composer draft/submit 可由 Package-owned textarea/input 驱动；
- Message Projection / structured blocks / canonical prose 的安全呈现数据。

Package 自绘 Conversation 仍不能自行写 Timeline；所有提交、retry、branch、variant 都走 typed Host service。

#### G-V3-2 — Safe Rich Text / Prose Rendering

AI narrative 若只给 raw string，Package 要自己把 Markdown/structured prose 变 DOM，会逼 Script 回到 DOM parser/rendering。

需要 Native v3 baseline 提供：

- safe Prose/RichText AST，或
- Host-owned prose compiler + declarative `rich-text/prose` presentation primitive。

禁止把 raw model HTML / unsanitized Markdown HTML 直接注入 DOM。

这也应支持 canonical prose、Message Blocks 与 Package custom CSS。

#### G-V3-3 — Collection Read / Query / Pagination

现有 `host.data.snapshot(bindingId)` 对长期 Phone/IM、邮件、社交、inventory、日志等大集合不够。

Read Binding 需要至少两种形态：

- scalar/snapshot read；
- bounded collection/query read。

Collection Read 概念能力：

- declared query schema；
- page size hard bound；
- stable sort/order；
- cursor/keyset pagination；
- optional filter/search fields；
- result schema + nextCursor；
- optional subscription/invalidation token。

例如：

`host.data.query("sms-thread", { threadId, cursor, limit })`

Host 仍决定 query contract，不开放 arbitrary database query。

Virtualization 解决 DOM 数量，Collection Read 解决数据量；两者缺一不可。

#### G-V3-4 — Surface Visual Containment / Top Layer

Shadow DOM 只隔离 selector/style inheritance，不能单独保证 Package 视觉不会覆盖 Host UI。

需要正式 **Surface Visual Containment Contract**：

- Component/Hybrid surface 必须有 Host-owned paint/layout/stacking containment；
- Experience CSS 的 `position: fixed`、z-index 等不能逃出授权 surface；
- raw browser top-layer（modal `dialog.showModal`、popover 等）不能成为越过 Host 的旁路；
- Modal/Drawer/Tooltip/ContextMenu 使用 Experience Overlay Root / declared surface；
- Full 可以拥有 app stage，但 Atria 必须保留不可被 Package CSS/DOM 覆盖的 Host System/Escape Layer（exit/save/stop generation/diagnostics/recovery）。

这是安全 + 可恢复性边界，不只是 CSS 风格问题。

#### G-V3-5 — Dynamic Resource Binding 必须 Typed

静态 CSS remote image URL 可在 Build 时收集；但动态 style/string → URL 会形成网络/隐私旁路。

需要冻结：

- runtime dynamic media binding 只能接受 typed `ImageRef/MediaRef`；
- 禁止任意 string → CSS `url(...)` / MediaRef cast；
- Script 不能根据任意 projection 数据拼 remote URL；
- dynamic RemoteImageRef 必须来自 Host/Package declared typed resource contract并再次经过 permission/origin policy；
- CSS custom property dynamic binding需要 typed value categories，默认不能承载 arbitrary URL/token stream。

这样 Remote Media 不会成为数据外传通道。

#### G-V3-6 — Localization / Locale / Text Formatting

当前 v3 只谈了 CSS/字体，没有正式 Package localization runtime。

Native v3 baseline 需要：

- Host locale / language / direction / timezone/preferences projection；
- Package localization resource graph；
- stable message key；
- interpolation；
- plural/select；
- number/date/time/list formatting；
- RTL / writing-direction；
- locale fallback；
- Studio missing-key/unused-key diagnostics。

作者不应把所有本地化字符串硬编码进 Component。

#### G-V3-7 — IME / BeforeInput / Virtual Keyboard

中文/日文/韩文输入和移动端输入需要正式前端输入 contract，不可只靠 generic `input/change`。

需要：

- `beforeinput`；
- compositionstart/update/end；
- selection/caret-safe controlled input semantics；
- 不在 IME composition 中错误提交/覆盖 value；
- VisualViewport / virtual-keyboard occlusion projection；
- safe-area + keyboard inset；
- textarea autosize/focus restoration。

这属于 Native v3 baseline，而不是浏览器偶然行为。

#### G-V3-8 — Accessibility / User Preference Environment

Declarative DOM 已允许 ARIA，但 Runtime baseline 还需明确环境与工具支持：

- reduced motion；
- contrast / forced-colors / color-scheme；
- text scale / zoom；
- pointer/touch modality；
- keyboard focus visibility；
- semantic heading/label/aria validation；
- touch target diagnostics；
- live-region / announcement pattern；
- focus trap/restore for Experience modal overlay。

Package 可以完全自定义视觉，但不能因为自由度提高就失去 Atria 的可访问性诊断。

#### G-V3-9 — Host Session / Conversation Control Services

Full/Hybrid 重前端除了普通 game actions，还会需要正式 Host-level controls：

- save / savepoint；
- exit Experience；
- retry/regenerate；
- branch/fork；
- select reply variant；
- stop generation；
- diagnostics / recovery；
- restart/new session（按 Host policy）。

这些不能通过 generic World Action 伪装。

建议新增固定 `host.session` / `host.conversation` service（名称待定），底层复用既有 Session/Timeline/Reply Variant/Host Action contract。

#### G-V3-10 — Component/View Error & Loading Boundary

Lazy View、Remote Media、Script Controller、Read query 都会异步失败。

Native v3 需要 declarative loading/error boundary：

- View/Component loading fallback；
- async component/resource failure fallback；
- retry hook；
- error isolation；
- failed child 不必导致整个 Experience blank；
- error diagnostic 仍带 source provenance。

这不是 React 式框架依赖，而是重前端 Runtime 的基本韧性能力。

### 非 blocker / future seam

当前压力测试未要求 Core v3 首版必须支持：

- arbitrary WebGL/WebGPU；
- pointer lock；
- raw network client；
- arbitrary filesystem；
- camera/microphone；
- WASM；
- Service Worker；
- browser history/deep-link routing；
- true DOM-owning React/Vue SPA（future Web Island）。

### Gap Review 结论

当前架构主方向成立，但**还不能直接冻结 Implementation Baseline**。

至少先正式解决 G-V3-1 ～ G-V3-10，其中最高优先级是：

1. Headless Conversation/Session services；
2. Collection Read；
3. Surface Visual Containment；
4. Typed dynamic resource binding；
5. Localization + IME；
6. Host session controls / error boundaries。

解决后再进行第二次较短 Gap Review；若无新架构级缺口，再冻结 Implementation Baseline 和 Phase 拆分。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把本轮 Gap Review 写入 Plan，然后集中解决 G-V3-1 ～ G-V3-4：

- Headless Conversation / Composer / Session；
- Safe Prose / RichText；
- Collection Read / query / cursor；
- Surface Visual Containment / Host System Layer；
- Dynamic Media typing。

再下一轮解决 Localization / IME / Accessibility / Error Boundary / Host Session Controls。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重复 Script Sandbox、Remote Media、Bridge/Binding/Source Graph 已冻结基础。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
