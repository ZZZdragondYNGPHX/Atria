# Atria Product Frontend Redesign — Audit & Design Boundary

- Repository: `ZZZdragondYNGPHX/Atria`
- Work branch: `refactor/atria-product-frontend-redesign`
- Baseline: `main@c664eded79b86df37bd951f1e5236a4335ce784b`
- Date: 2026-09-23
- Task type: full product frontend redesign
- Visual north star: Apple-style — restrained, polished, coherent, premium, product-first
- Important: this document is an audit and boundary map, **not a visual design specification**.

## 1. Purpose

本任务的目标是全面重构 Atria 的产品前端设计，而不是给现有页面做局部换皮。

这份文档只负责告诉实施者：

1. 当前前端由哪些产品层和兼容层组成；
2. 哪些页面 / 组件 / CSS / 路由是本次必须检查的范围；
3. 当前实现存在哪些结构性设计债务；
4. 哪些行为、数据权威和运行时边界不能因为视觉重构被误伤；
5. 哪些现有测试只是旧表现结构的历史约束，不能反过来绑死新设计。

这份文档**故意不规定**新的页面布局、导航形态、组件形式、颜色、阴影、圆角、字号、动效、密度、卡片风格、信息架构细节或具体交互方案。

视觉设计与前端审美判断由实施者独立完成。

唯一明确的视觉基调是：**Apple-style**。这是气质方向，不是要求复刻 macOS / iOS，也不是一套现成组件规范。

## 2. Current product frontend topology

Atria 当前不是单一前端，而是多个世代叠加后的产品层。

### 2.1 Atria Shell / product chrome

核心文件：

- `public/scripts/atria-shell/index.js`
- `public/scripts/atria-shell/app-shell.js`
- `public/scripts/atria-shell/constants.js`
- `public/scripts/atria-shell/environment.js`
- `public/scripts/atria-shell/navigation-authority.js`
- `public/scripts/atria-shell/workspace-host.js`
- `public/scripts/atria-shell/library-runtime-workspaces.js`
- `public/scripts/atria-shell/utility-workspaces.js`
- `public/scripts/atria-shell/primitives.js`
- `public/scripts/atria-shell/patterns.js`
- `public/css/atria-tokens.css`
- `public/css/atria-shell.css`

当前主产品域：

- Play
- Library
- Build
- Agents
- Runtime

当前全局工具：

- Command
- Diagnostics
- Plugins
- Settings
- Account

这些 route / domain ID 属于行为契约，不代表它们必须继续使用当前视觉结构。

### 2.2 Play

核心文件：

- `public/scripts/atria-shell/native-play-host.js`
- `public/scripts/native/play-product.js`
- `public/css/atria-shell.css`
- `public/css/immersive.css`
- `public/scripts/extensions/game-runtime/ui/*`

当前 Play 已拥有 Atria Native product surface，但底层仍保留 SillyTavern conversation / generation DOM 作为内部 ABI。

因此视觉上可以大改，但不能因为清理旧 DOM 而破坏生成、会话或第三方兼容边界。

### 2.3 Library

核心文件：

- `public/scripts/atria-shell/library-runtime-workspaces.js`
- `public/scripts/native/library-workspaces.js`
- `public/scripts/native/prompt-authoring.js`
- `public/scripts/skills/*`
- `public/css/atria-shell.css`

Library 实际承载多类资源：

- Works / installed Packages
- game sessions
- Worlds
- Knowledge Bases
- Prompt Modules
- Prompt Programs
- Generation Profiles
- Skills
- 其他 Native resources

当前多个资源类型共享非常相似的卡片 / grid 表现，视觉层级和产品区分度不足，是必须重新审视的核心区域之一。

### 2.4 Build / Atria Studio

核心文件：

- `public/scripts/native/studio-workspace.js`
- `public/scripts/native/studio-ui-editor.js`
- `public/scripts/native/studio-agent.js`
- `public/scripts/native/studio-authoring.js`
- `public/scripts/native/studio-client.js`
- `public/css/atria-studio.css`
- `public/css/atria-shell.css`

这是当前前端中复杂度最高的产品区域之一。

当前 Studio 包含：

- Project / resource navigation
- Overview
- Experience
- Prompt Authoring
- Runtime Design
- Actors
- EntryPoints
- Worlds
- Knowledge
- Game Logic
- UI
- Assets
- Memory
- Agents
- Skills
- Plugins
- Package Metadata
- Simulation
- Preview
- Build
- Source
- Inspector
- Activity / Problems / Output / History / Changes
- Project Agent / AI
- desktop 与 mobile 独立工作流

`studio-workspace.js` 当前超过一千行，UI 结构、行为和产品状态耦合较深。不要把本次工作缩减成只改 `atria-studio.css`。

### 2.5 Agents

核心文件：

- `public/scripts/atria-shell/workspace-host.js`
- `public/scripts/extensions/orchestrator/workspace/panel.js`
- `public/scripts/extensions/orchestrator/workspace/panel.css`
- 其下游 orchestration / memory / run / diagnostics UI

Atria Shell 当前把旧的 orchestrator workspace 作为 embedded product surface 接入。

因此 Agents 看起来属于 Shell，内部却仍有自己的局部视觉系统和历史布局逻辑。

### 2.6 Runtime

核心文件：

- `public/scripts/native/runtime-workspace.js`
- `public/scripts/native/runtime-client.js`
- `public/scripts/atria-shell/library-runtime-workspaces.js`
- `public/css/atria-shell.css`

Runtime 当前包含：

- Routes
- Models
- Connections
- Profiles
- Diagnostics

这一块目前存在明显的独立样式岛：`.atri-runtime*` 规则直接堆在 `atria-shell.css` 末部，并有自己的 mobile fullscreen editor 处理。

### 2.7 Plugins / Settings / Account / Diagnostics

核心文件：

- `public/scripts/atria-shell/utility-workspaces.js`
- `public/scripts/logging/workspace.js`
- `public/scripts/user.js`
- 旧设置 / 扩展 / account controller 对应 DOM 与 CSS

这些页面目前大量采用“把现有 legacy controller / DOM 移入新的 Atria 容器”的方式。

这保证了行为权威没有重复实现，但也导致 Native chrome 与 legacy controls 同屏，视觉语言不连续。

### 2.8 Entry / Welcome / Login / Onboarding / Loading

核心文件：

- `public/index.html`
- `public/scripts/templates/welcomePanel.html`
- `public/css/welcome.css`
- `public/login.html`
- `public/css/accounts.css`
- `public/css/loader.css`
- `public/style.css` 中 onboarding 相关规则

这些入口仍明显继承旧 SillyTavern 页面结构与视觉体系，必须纳入“完整产品设计”范围，而不能只重构登录后的 Shell。

## 3. Structural design debt found in the audit

以下是当前代码客观存在的前端结构问题。它们是“需要解决的问题”，不是“应该采用的设计方案”。

### 3.1 Multiple visual systems coexist

当前至少同时存在：

- `--atri-*` semantic tokens；
- `atria-studio.css` 内部独立的 `--ls-*` tokens；
- 大量直接使用 `SmartTheme*` 变量的旧 CSS；
- Runtime 区域自己的硬编码样式；
- Agents / extensions 各自的局部样式；
- legacy `style.css` / `mobile-styles.css` / popup styles。

这使不同页面即使功能已经 Native 化，视觉上仍不像同一个产品。

### 3.2 `atria-shell.css` 已承担过多责任

当前文件约 2000+ 行，同时承载：

- App Shell
- Navigation
- Global chrome
- Command
- Context dock / sheet
- responsive shell
- legacy Play host integration
- Native Game surfaces
- Agents landing
- Library
- Runtime
- Plugins / Settings / Account
- Native Play
- 多组 mobile overrides

它已经不只是 Shell stylesheet，而是事实上的全产品样式堆栈。

### 3.3 New UI and compatibility UI are interleaved

Atria 仍需要部分 SillyTavern DOM / controller 作为内部兼容层。

例：

- Native Play 内部 generation ABI
- legacy settings controls
- legacy account UI
- third-party plugin UI
- extension-owned popups
- compatibility anchors

因此“删掉看起来旧的节点”不是安全的前端重构方式。

必须先确认谁拥有行为，再决定表现层是否可以替换。

### 3.4 DOM shape and product behavior are coupled

大量 UI 由 imperative JavaScript 创建 DOM，并通过 class / data attribute 同时承担：

- styling hook
- route state
- E2E selector
- behavior selector
- compatibility marker

这意味着视觉重构时不能把所有现有 selector 都机械视为不可变契约，也不能无判断地全部删除。

### 3.5 Responsive rules are fragmented

当前可见的 breakpoint / compact 逻辑并不统一，例如：

- Shell: 719 / 1179
- Runtime editor: 700
- Native Play: 600 / 719
- Immersive: 800
- Studio: 独立 mobile view / media rules
- legacy mobile styles: 另有大量历史规则

此外还存在：

- Android WebView
- virtual keyboard
- safe area
- dynamic viewport
- touch
- no-hover
- full-screen editor
- compact bottom navigation

移动端不能被当成桌面页面简单压缩。

### 3.6 Product entry points still feel like different generations

Welcome、Login、Onboarding、Shell、Studio、Agents、旧 popup / extension surface 并不共享一致的产品身份。

用户从启动到登录、进入主产品、打开 Build、再打开插件或高级设置时，会明显穿越不同年代的 UI。

### 3.7 Several major surfaces are visually generic

当前大量页面使用相同的 card / border / grid / button 语言来承载完全不同的任务。

特别需要重新审视：

- Play conversation
- Library asset browsing
- Work detail / session management
- Build project list
- Studio editing workspace
- Runtime configuration
- Agent workspace
- Settings / Account
- loading / empty / failure / review / diagnostics states

本文件不规定它们应该变成什么，只要求不能在最终结果中继续表现为“同一套普通卡片换标题”。

## 4. Behavior and architecture boundaries that must survive the redesign

下面属于当前产品行为 / 数据边界，视觉重构不得意外破坏。

### 4.1 Navigation authority

必须保留现有 route ownership 与 deep-link 语义：

- Play
- Library
- Build
- Agents
- Runtime
- utility routes

视觉导航结构可以重做，但不能建立第二套路由权威。

### 4.2 WorkspaceHost ownership

`workspace-host.js` 当前负责把 routed workspace 挂入 Shell。

重构时不能让各页面绕开 WorkspaceHost 建立彼此独立的顶层导航 / 生命周期系统。

### 4.3 Native Play generation boundary

Atria Native Play 是产品 UI。

隐藏的 SillyTavern conversation / generation subtree 仍是内部 ABI。

必须继续满足：

- Native Session 为会话状态权威；
- 现有 generation boundary 可用；
- 不建立第二套 chat persistence；
- legacy ABI 不能重新变成用户可见主界面。

### 4.4 Native Game host ownership

Hybrid / Full Native game experiences 可拥有 Stage / transient / recovery 对应 surface。

Host recovery 仍必须独立于 package-owned content。

### 4.5 Studio authoring authority

Studio 的核心契约不能被 UI 重构弱化：

- A1 Native Studio API boundary
- inspect / review / execute
- human authority
- exact revision
- ChangeSet
- conflict boundary
- Resource Graph
- Library Attach / Fork / Update
- validation
- preview
- simulation
- preflight / build
- Project Agent
- plugin-defined resources

不要为了做“更干净的编辑器”把这些能力隐藏成不可发现或删除。

### 4.6 Runtime authority

Runtime 必须继续使用 Native model / connection / route / generation / prompt authority。

不得重新接回：

- old preset manager
- legacy connection manager
- localStorage / indexedDB secondary state
- duplicated configuration store

### 4.7 Settings / Plugins / Account authority

视觉上可以完全重新组织，但不能为了设计方便复制 controller 或另造持久化。

现有原则仍有效：

- Settings 主层只暴露允许的 product preferences；
- model / prompt / generation 配置归 Runtime / Library；
- Native plugins 与 third-party compatibility 必须继续可区分；
- Account / backup / recovery 的权限与现有 controller 保持一致。

### 4.8 Accessibility / keyboard / mobile behavior

现有以下能力属于行为，不是旧视觉：

- keyboard navigation
- focus handling
- dialog semantics
- Escape / back behavior
- compact navigation
- virtual keyboard adaptation
- safe-area adaptation
- reduced motion
- touch input
- Android WebView usable layout

## 5. Test / guard interpretation

当前仓库已有大量 guard。实施者必须先区分：

### A. Real behavior / architecture contract

例如：

- Native authority ownership
- no second persistence
- route ownership
- exact resource references
- Studio review / execute
- Native Play ABI isolation
- hard-cut legacy product authority
- game host ownership
- accessibility / keyboard behavior
- real E2E flows

这些不能为了新设计直接删掉。

### B. Historical presentation contract

部分测试 / regex guard 固定了当前：

- class name
- specific region order
- exact mobile view naming
- exact DOM marker
- CSS selector
- current fullscreen geometry
- old presentation structure

如果这些只是在证明上一轮前端“长这样”，而不是证明产品行为正确，那么本次视觉重构可以修改相应测试，而不是为了过旧测试保留旧设计。

需要重点阅读：

- `scripts/check-a6-native-product-frontend.mjs`
- `scripts/check-a7-studio-authoring-ux.mjs`
- `scripts/check-a9-hard-cutover-product-finalization.mjs`
- `scripts/check-p5-native-runtime-ui.mjs`
- `scripts/check-p7-product-cleanup.mjs`
- `scripts/check-n9-native-product-authority.mjs`
- `scripts/check-n10-native-hard-cutover.mjs`
- `tests/atria-shell/*`
- `tests/e2e/atria-shell/*`
- `tests/e2e/native-session/*`
- relevant Game Runtime / Studio / Workspace tests

不要通过机械保留旧 DOM 来“证明”新设计完成。

## 6. Mandatory redesign coverage

最终不能只交付 Shell 或 Studio。

至少要主动检查并有明确设计结果的表面包括：

- startup / loading
- login
- first-run onboarding
- welcome / recent activity
- global shell / primary navigation
- global utilities
- command surface
- context / inspector / transient surfaces
- Play
- Native game surfaces
- Library home/list/detail
- Works / Sessions
- Worlds
- Knowledge
- Prompt / Generation resources
- Skills
- Build project list
- full Studio workspace
- Studio review / changes
- Studio preview / simulation / build
- Studio AI / Project Agent
- Agents landing
- Agent orchestration
- Agent run / memory / diagnostics
- Runtime routes
- Runtime models
- Runtime connections
- Runtime profiles
- Runtime diagnostics
- Plugins
- Settings
- Account
- Diagnostics workspace
- empty / loading / error / unavailable / destructive confirmation states
- desktop / medium / compact/mobile
- keyboard-open mobile state
- Android WebView-sensitive layouts

如果某个区域因为兼容层暂时不能被完全替换，也必须在最终说明中明确指出原因，而不是无声跳过。

## 7. Things that should not constrain the new visual design

以下内容仅代表当前实现，不应被误读成新的视觉要求：

- 76px rail
- fixed 52px global bar
- current bottom navigation
- current three-column expanded shell
- current card system
- current rounded rectangle language
- current context dock shape
- current command palette shape
- current Runtime list layout
- current Studio panel geometry
- current color values
- current spacing scale
- current `--ls-*` tokens
- current exact breakpoints
- current “everything is a bordered card” presentation
- current Font Awesome icon choices

只要行为边界被正确保留，这些都可以被重新设计。

## 8. Definition of “not enough”

以下结果不算完成：

- 只改颜色 / 圆角 / 阴影；
- 只重写 `atria-shell.css`；
- 只重写 Studio；
- 只做 desktop；
- 只做 mobile；
- 把现有 DOM 全部保留然后套一层新皮；
- 为了省事继续让多个产品域共用同一种 generic card/list；
- 跳过 login / onboarding / welcome；
- 跳过 compatibility / extension surfaces；
- 因旧截图测试失败就回退新设计；
- 因为某块历史代码复杂就留着不碰且不说明。

## 9. Validation expectations

本任务完成后至少应有：

- targeted unit / guard tests for touched frontend contracts；
- route / workspace regression；
- Native Play regression；
- Library / Runtime regression；
- Studio authoring regression；
- real browser validation；
- desktop screenshots；
- compact/mobile screenshots；
- keyboard / focus sanity checks；
- no horizontal overflow on supported compact widths；
- loading / error / empty / review states verified；
- relevant existing full frontend lint / build checks。

视觉验收不能只靠 DOM 测试。

## 10. Designer autonomy

这份审计的目的不是告诉实施者“应该怎么画”。

实施者应自行建立完整的视觉判断和产品设计方案，必要时可以：

- 调整 DOM 结构；
- 调整 presentation component boundaries；
- 重构 CSS organization；
- 更新只绑定旧表现结构的测试；
- 改变页面布局与层级；
- 改变 responsive presentation；
- 重新设计 product chrome；
- 重新设计各 workspace 的视觉关系。

前提只有两个：

1. 不破坏上文列出的产品 / 数据 / runtime authority；
2. 最终结果必须覆盖完整 Atria 产品，而不是局部美容。

视觉基调仅保留一句：**Apple-style — restrained, polished, coherent, premium, product-first.**

除此之外，本文件不提供视觉解法。
