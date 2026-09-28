# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture / Gap Resolution
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Package pressure-test sample: `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference`
- Plan HEAD: `docs@044922cfa7c5b0ece08f807c1b2d9ee769a11b5c`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.15

## 已写入 Plan

- Native Frontend v3 全部前序架构讨论；
- Script Sandbox Runtime；
- 第一轮 Gap Review G-V3-1 ～ G-V3-10；
- Gap Resolution A：G-V3-1 ～ G-V3-5：
  - Managed + Headless Conversation；
  - GenerationProjection；
  - Prose AST；
  - Collection Read；
  - Visual Containment + Host System Layer；
  - typed dynamic CSS/media；
  - Declared/Host-issued MediaRef。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

本轮正式解决 G-V3-6 ～ G-V3-10。

### G-V3-6 Resolution — Package Localization Runtime

- 现有 Shell localization 只服务 Atria 产品 UI；Package v3 需要独立、typed、exact 的 Localization Resource Graph，不能让 Package 覆盖 Host/Shell key namespace。
- Authoring Source Graph 建议：
  ```text
  frontend/
  └ locales/
     ├ zh-CN.json
     ├ en.json
     └ ja.json
  ```
  `frontend.json` / source index 声明 defaultLocale、catalog refs、fallback policy。
- Build Compiler 将 catalog 编译成 exact Localization Catalog / Message AST；Release Runtime 不执行任意 message template code。
- Message key 使用 stable semantic ID，例如 `phone.messages.empty`，Native `.aui` first-class authoring 推荐静态 key，使 Studio/AI 可做 missing/unused-key analysis。
- Message format baseline 支持：
  - interpolation；
  - plural；
  - select；
  - number formatting；
  - date/time formatting（仅对明确的 epoch/date value；World logical clock 不自动当现实 Date）；
  - relative time；
  - list formatting；
  - display-name/locale helpers（若 Host 支持）。
- Runtime formatting优先建立在 Host/Intl 能力上，但 Package message source 先编译成 inert format AST，不 eval JS。
- Host `env.locale` / localization projection 至少包含：
  - locale；
  - base language；
  - direction `ltr/rtl`；
  - numbering system（可得时）；
  - calendar/timeZone（适用于现实 UI 格式化时）；
  - fallback chain。
- Locale change 是 read-only reactive environment event；Package UI 无需 reload Session Authority 即可重渲染。
- Localization 是 Presentation，不自动改变 World/Prompt/AI narrative language。若游戏希望 locale 影响模型输出，必须通过明确的 Model/Prompt context contract 显式注入。
- Package localization fallback：
  1. exact locale；
  2. language fallback；
  3. Package default locale；
  4. author source/default message（若 contract允许）。
- Studio/Build diagnostics：missing key、unused key、placeholder mismatch、plural/select case mismatch、invalid format。
- RTL/writing direction 与 CSS/DOM 环境联动；Host 设置 Experience root `lang/dir`，Package CSS 可使用 `:dir()` 等正常能力。

### G-V3-7 Resolution — IME / BeforeInput / Virtual Keyboard

- Native v3 Input 不能仅有 `input/change/keydown`；正式加入 composition-aware input contract。
- Baseline local event projection：
  - `beforeinput`（bounded inputType/data）；
  - `input`；
  - `compositionstart`；
  - `compositionupdate`；
  - `compositionend`；
  - key events with `isComposing`；
  - selection/caret change（仅限当前声明 input，不暴露任意 DOM selection）。
- Declarative controlled input 必须实现 **composition lock**：
  - IME composition 期间 DOM composing buffer 临时拥有显示权；
  - ordinary state reconciliation 不得覆盖 composing value/caret；
  - compositionend 后再把最终值同步到 declared UI/Draft state；
  - 显式 reset/dispose 可以终止该 instance 的 composition。
- Submit/shortcut 默认不得在 `isComposing` 时触发；现有 Composer 的 Ctrl/Cmd+Enter + `!event.isComposing` 行为作为地基推广到 v3 Input Runtime。
- 支持 safe input attrs：
  - `inputmode`；
  - `enterkeyhint`；
  - `autocomplete`（受 policy）；
  - `spellcheck`；
  - type/selection constraints。
- Environment 扩展 layout viewport / visual viewport：
  - layout width/height；
  - visual viewport width/height/offset；
  - keyboard/occlusion bottom inset（best-effort，支持 unknown）；
  - safe-area insets。
- Runtime 同步 CSS vars，例如 `--atria-visual-viewport-height`、`--atria-keyboard-inset-bottom`，便于 Phone/Composer 不被软键盘遮挡。
- 不把 platform-specific VirtualKeyboard object 暴露给 Package；Host 归一化为 Environment Projection。
- Textarea autosize、focus restore、scroll-into-view 可作为 Native local input utilities，不经过 Authority/Host Bridge。

### G-V3-8 Resolution — Accessibility / Preference Environment

- 扩展 `env.accessibility` / `env.appearance` read-only reactive projection：
  - reducedMotion；
  - colorScheme；
  - forcedColors；
  - contrast preference；
  - Host text/ui scale；
  - pointer/touch/hover modality；
  - keyboard/focus modality。
- 可用浏览器 media query 的能力同时允许 Package 用正常 CSS media query；Environment Projection 主要服务 Declarative conditions / Script Controller / Studio preview。
- Atria 不用强制所有 Package 长得一样，但 Compiler/Studio/Health 提供 accessibility diagnostics：
  - missing label/name；
  - invalid heading/landmark structure；
  - invalid/contradictory ARIA；
  - keyboard-inaccessible interactive node；
  - hidden focusable node；
  - too-small touch target（warning/profile-aware）；
  - missing focus style / reduced-motion fallback（warning）。
- Overlay/Modal Runtime 提供标准 FocusScope：
  - focus trap；
  - initial focus；
  - restore focus；
  - inert/background isolation；
  - Escape behavior 与 Host System Layer 协调。
- 提供 Experience-local declarative live region / `a11y.announce` local runtime helper，用于 loading/error/status，不需要 Host Authority。
- Host accessibility preference 不写入 World；Package 可以读取但不能关闭 Host System/Escape Layer 的可访问性。
- Managed Native Components 保证基础 accessibility；Headless 模式由 Package负责 DOM语义，但仍接受同一 Studio/Health diagnostics。

### G-V3-9 Resolution — Fixed Host Session / Conversation Services

- 在 G-V3-1 Headless Conversation 基础上正式区分两个 fixed Host services：
  - `host.conversation`
  - `host.session`
  （最终命名可实现前微调）
- `host.conversation` 负责 Conversation/Timeline UI 控制：
  - summary/status；
  - generation status/cancel；
  - committed message collection；
  - reply alternatives；
  - retry/regenerate current tail（沿用现有 Native retry/fork semantics）；
  - fork from exact anchor；
  - switch branch；
  - inspect history/revision；
  - capability projection（canWrite/canRetry/canFork/etc.）。
- `host.session` 负责 Session lifecycle / recovery：
  - session status；
  - create/list SavePoint；
  - restore SavePoint；
  - reload/recover current session；
  - exit Experience；
  - restart current entry/session（Host policy允许时）；
  - open diagnostics；
  - future export/import 仍可独立扩展，不作为 Core v3 首版强制。
- Composer 继续保持独立 `host.composer`，避免 conversation service 同时承担输入 draft ownership。
- 所有 branch/save/restore/retry 等调用都携带 exact/current revision guard；stale operation 返回 typed conflict/stale receipt。
- destructive/navigation-like controls（restore/restart/exit）由 Host policy 决定是否需要 confirmation；Package 不能绕过。
- Session/Conversation fixed services 也通过 Component `uses.services` narrowing 注入给 Script；Declarative Compiler 自动推导。
- Full Host System/Escape Layer 使用相同底层 Session/Conversation services，但它是 Host privileged client，不依赖 Package `uses` 或 Package UI 是否正常。
- Session restore/switch branch 等会使 Collection cursor、Read snapshot、Controller instance context 失效；Runtime 必须广播 **Experience Epoch / Session Revision Change**，自动：
  - revoke stale handles/cursors；
  - cancel stale async reads/controller requests；
  - remount/rebind affected Views/Controllers；
  - 保留只属于 Host/prefs 且仍适用的状态。
- Package 永远不拿 SessionCore/native runtime object。

### G-V3-10 Resolution — Loading / Error Boundary

- Native v3 增加 first-class declarative **Boundary** contract，不依赖 React/Suspense 语义。
- 至少三层：
  1. Component Boundary；
  2. View Boundary；
  3. mandatory Experience Root Boundary。
- Boundary 可以提供：
  - loading slot/component；
  - error slot/component；
  - content/default slot；
  - explicit retry action；
  - optional timeout/escalation policy（受 Host hard caps）。
- Boundary 覆盖的 failure：
  - lazy Component/View resource load；
  - compiled style/controller resource load；
  - Controller init/invocation failure（按 required/optional semantics）；
  - Collection/Read dependency failure；
  - required Media/resource failure；
  - local render/validation error。
- 普通 Bridge Action rejection/validation failure默认返回 Receipt 给调用 UI处理，不自动把整个 subtree 变 Error Boundary；Authority/Session fatal failure则直接上升 Host Recovery。
- Error projection 是 inert/safe：
  - category；
  - stable reasonCode；
  - retryable；
  - source semantic id；
  - diagnosticRef；
  - optional user-facing message。
  Production Package 不拿 Host raw stack/internal object。
- Source Map/Provenance 将 Boundary diagnostic 映射回 `.aui/.css/.ts` source。
- Retry 创建新的 request/epoch；stale previous completion 必须丢弃。
- Boundary 不自动重试 Authority write，除非底层 Receipt/idempotency contract明确安全；默认只自动/显式 retry read/resource/controller load。
- Remote Image 优先使用自身 Media fallback；只有 required media 且无 fallback 才升级 Boundary。
- Script Controller optional failure 可以降级为 declarative component；required controller failure进入最近 Boundary。
- 如果 Root Boundary 本身无法编译/加载，或 Frontend Index/Bridge preflight失败，使用 **Host-owned Experience Failure Surface**，位于 Package visual boundary 外，并保留 Exit/Diagnostics/Recovery。
- Lazy loading 状态应是 stable async resource state（idle/loading/ready/error）并支持 cancellation，不采用“throw Promise”一类框架私有语义。

## 本轮总体结论

G-V3-6 ～ G-V3-10 也都可以在现有主架构内解决，不需要推翻 Native Frontend v3 的核心边界。

补完后，Core v3 的 presentation/runtime 基线已覆盖：

- localization / RTL；
- CJK IME / soft keyboard；
- accessibility environment + diagnostics；
- headless/managed Conversation + Session controls；
- resilient async loading/error recovery。

## 下一轮

先将 G-V3-6 ～ G-V3-10 resolution 写入 Plan，然后进行 **第二轮短 Gap Review / Baseline Gate**：

- 重新用 Heavy Frontend Reference Package / Visual Novel / RPG / Phone / Full / Hybrid / Component 场景过一遍；
- 检查 audio/video、animation choreography、routing、drag/drop、form、performance、mobile、offline、accessibility、remote media、headless conversation 是否仍有架构级遗漏；
- 若没有新的 architecture blocker：
  - 将 Discussion Draft 整理/压缩为 Implementation Baseline v1.0；
  - 明确 Non-goals / Future seams；
  - 拆实施 Phase；
  - 此时才创建 `refactor/native-frontend-runtime-v3` 实现分支并开始代码工作（需用户明确批准）。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重新讨论前序已解决的 Script Sandbox、Source Graph、Bridge/Binding、Remote Media 基础。
- 当前仍不创建实现分支或产品代码。
