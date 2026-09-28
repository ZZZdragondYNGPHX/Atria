# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@36938903ad4feb42c640304c32b74b60e20bbd8d`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.11

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / CSS / fonts / components / interaction / optional script.
- Frontend Asset Graph / Remote Media / typed ImageRef.
- Hard cut v1/v2；v3 最终唯一正式 Native UI Runtime。
- Frontend Manifest / Runtime Features / Permissions / negotiation。
- Frontend Host Bridge。
- Bridge Binding Manifest：
  - independent bridge version；
  - reads/actions/operations；
  - Compiled Bridge Descriptor；
  - typed projection/action/operation semantics；
  - Experience Registry；
  - component `uses:` narrowing；
  - external navigation baseline；
  - future Web Island handshake seam。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Native Frontend Source / Canonical IR：

- 明确采用 **Authoring Source Graph → Compile → Canonical Runtime Graph** 两层，不让 Runtime 直接消费作者语法。
- Authoring Source 是人类/Studio/AI 的唯一编辑权威；Canonical IR 是 derived-readonly build artifact。
- Studio/AI 不直接改 IR。Preview 流程必须是 Source → compile → exact preview IR → renderer，与 Production compiler 共用同一编译器。
- 当前 v2 Studio 直接围绕 UI JSON model 编辑的方式不应延续为 v3 的唯一 authoring model。
- Project Source 与 Installed Package Manifest 不应过载同一个 path 字段：
  - Authoring contract 使用 `frontend.source`（正式字段可再定）指向 Source Graph descriptor；
  - Build 后 Package Runtime 使用 `frontend.entry` 指向 Compiled Frontend Index；
  - 两者是不同 contract，不让 installed runtime 猜“这是 source 还是 IR”。
- 推荐 Authoring Source Graph 目录：
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
  目录只是推荐组织，不应成为 Runtime semantic requirement。
- `frontend.json` 是轻量 Source Graph index，声明：
  - frontend source schema/version；
  - views 与 surface/mount；
  - global/theme stylesheet refs；
  - global ui/draft/prefs state refs；
  - bridge registry ref；
  - optional source-level features；
  - root/component module refs。
- View 本质上应引用一个 root Package Component + surface/mount metadata，不另造第二套 View DOM language。
- Package Component 建议使用 Atria-owned SFC-like authoring syntax（暂称 `.aui`，名字未冻结）：
  - template/declarative DOM；
  - props；
  - emits；
  - slots；
  - local state/computed；
  - interaction handlers；
  - `uses`；
  - optional scoped style；
  - optional controller module ref。
- `.aui` 是 Authoring Syntax，不是 Runtime format；Compiler 输出 Canonical Component IR。
- 不建议继续让作者长期写巨大 JSON tree；JSON 保留给 index/schema/bridge/state 等结构化 contract。
- 样式允许两种 authoring：
  - 独立真实 `.css` 文件（推荐大型项目/共享 theme）；
  - Component source 内 scoped style block（适合小组件/单文件体验）。
  两者编译到相同 Style Graph。
- Interaction 也允许：
  - declarative handler colocated in Component；
  - 可复用 interaction module；
  - 复杂逻辑通过 optional Script Controller。
- Script Controller source 可以使用 JS/TS authoring（具体 Sandbox pipeline 下一轮单独冻结），但 Build 后只产生 sandbox-compatible compiled module；Runtime 不直接执行 author source。
- Global `ui/draft/prefs` state declaration集中在 Frontend Source Graph；Component local state colocated 在 Component source。
- Bridge Registry 保持 Experience-level 独立 resource，Component 通过 `uses` 引用；不要把 Authority target declaration散落在 UI 文件里。
- Canonical Runtime Graph 不做单一巨大 JSON。推荐小入口 + exact compiled resources：
  ```text
  Compiled Frontend Index
  ├─ View IR refs
  ├─ Component IR refs
  ├─ Compiled Bridge Descriptor
  ├─ Style assets
  ├─ Sandbox controller modules
  └─ frontend asset/media refs
  ```
  每个 ref 使用 exact content identity，便于 lazy load、cache、diagnostics 与 deterministic build。
- View/Component 拆分应形成自然 lazy-loading boundary；on-demand drawer/modal/phone 等不必随主视图一次全部加载。
- Runtime index 应足够小，activation 先校验 index/bridge/features，再按需要加载 View/Component graph。
- Build output 可以采用稳定 logical resource ID + content hash；不要依赖作者目录路径作为 Runtime authority identity。
- Source path 只属于 authoring/provenance；Runtime 用 exact compiled resource identity。
- Source Map / Provenance 需要正式存在：
  - compiled component/node/action/controller → source file/span；
  - Build/Studio diagnostics 可以反查；
  - Preview 错误必须指回作者文件，而不是只报 IR node。
  Release Runtime 可不依赖 source map 执行；是否随 `.atria` 携带完整 source map 可作为 build profile。
- Native Source 应有 stable semantic IDs，Studio structured edits 与 AI patch 尽量按 Component/Node/Binding identity 操作，不只靠行号。
- 推荐 Studio 采用 format-preserving parser/CST（若最终使用 `.aui`），避免视觉编辑后把人工格式/注释全部洗掉。
- Small UI 不需要第二套 Runtime：可以用一个 `frontend.json` + 一个 `Main.aui`；Component 内可 colocate style/interaction。不要为了“单文件”再创建新的 runtime contract。
- Large UI 自然拆成 views/components/styles/controllers；所有拆分最后仍编译进同一 Canonical Runtime Graph。
- Project/Studio source 与发布 `.atria` 建议清晰分离：
  - Project 保留完整 Authoring Source；
  - 发布 Package 以 Compiled Runtime Graph + exact assets 为权威；
  - source bundle / source map 可以可选携带，用于 debug/remix，但 Runtime 永远不执行它们。
- Framework Adapter：
  - framework source 由 adapter/compiler 管；
  - 输出同一 Canonical Runtime Graph；
  - Core Studio/AI 可以完整理解 compiled IR，但不承诺把视觉编辑 round-trip 回任意 React/Vue/Svelte 原源码；
  - Native `.aui` Source 是 Studio/AI first-class authoring path。
- Canonical IR schema 应稳定、严格、低歧义，面向 Runtime/validator，不追求人类手写舒适度；Authoring Source 负责可读性与编辑体验。
- 建议下一轮进一步讨论 Script Sandbox authoring/execution pipeline：TS/JS → compile/bundle → sandbox module，Worker/VM/WASM isolation，module imports，debug/source maps，CPU budget。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把 Source/IR 结论写入 Plan，再讨论：

- Script Sandbox 具体执行模型；
- JS/TS authoring 与 module graph；
- Worker vs embedded VM/WASM/SES 等隔离方案；
- Sandbox 如何调用 component local API + scoped Bridge handles；
- CPU/memory/time budgets；
- controller lifecycle；
- third-party pure JS dependencies；
- debugging/source maps；
- Canvas2D API 是否直接 proxy 还是 retained drawing command buffer。

## 不要重复

- 不考虑 v1/v2 migration/兼容。
- 不重复 Remote Media、基础 Host Bridge 或 Binding Registry。
- 不创建实现分支或产品代码，除非用户明确批准进入实施。
