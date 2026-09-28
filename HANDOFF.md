# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Docs HEAD before this refresh: `docs@8bbdb7421e7695ee1eea03a8b0fffbd3223b3277`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.5

## 已写入 Plan

- Native UI v2 现有限制与重构背景。
- 核心原则：Package owns presentation; Host owns capabilities and authority.
- Declarative DOM。
- Full CSS / Fonts / Experience Shadow boundary。
- Client Interaction Runtime。
- Package Component System。
- Optional Script Sandbox。
- Frontend Capability Manifest。
- 兼容与迁移开放问题。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Resource / CSS / Build Artifact 方向：

- 复用现有 `AssetRef { assetId, contentHash }`、Asset Pack 与 exact dependency closure，不另建平行前端资源仓库。
- 将其扩展为 Frontend Asset Graph，覆盖 stylesheet/font/image/SVG/cursor/mask/script module 等前端资源。
- CSS `url(...)` 与本地 `@import` 由 compiler 解析为 exact assets；remote URL / remote `@import` 禁止。
- Runtime 使用 Host-controlled same-origin/blob/object URL 映射，CSS 不直接持有可变公网 URL。
- Package 支持 WOFF2/WOFF 以及经策略允许的 TTF/OTF；支持 variable font、`font-display`、writing mode 等。
- SVG 区分 inline declarative SVG 与 external inert/sanitized SVG asset；禁止借 SVG 获得 script/network/foreignObject 等越权能力。
- Package stylesheet 分为 Experience-global/theme 与 Component-scoped；Package 全局仍受 Experience ShadowRoot 隔离。
- Native Components 通过稳定 `::part()` / CSS variables / typed theme contract 提供可定制面，不暴露私有 DOM。
- Package Build 阶段应生成 immutable frontend closure / hashes；安装 `.atria` 时只 validate/install，不运行 npm/pnpm/yarn build scripts。
- npm 等生态依赖如果使用，应在作者构建阶段解析并 vendoring/bundle，最终 Package 内必须是完整、可离线验证的构建闭包。
- React/Vue/Svelte 不建议作为“任意 SPA bundle 直接注入 Experience DOM”的 v3 基线。
- 推荐三层兼容路径：
  1. Atria-native authoring（默认）；
  2. Framework authoring adapter / custom renderer，编译或运行到 Atria Canonical IR + Sandbox API；
  3. 未来独立 `web-island` capability，用强隔离 browser realm + CSP + typed message bridge 承载几乎原样的预构建 SPA。
- `web-island` 不应成为绕过 Native Runtime 的默认后门，也不等于获得 Host DOM / Authority / raw network。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把上述 Resource / CSS / Build Artifact 结论写入 Plan，再讨论：

- v3 与 v2 的兼容/迁移和 Package manifest/versioning；
- Atria-native、Framework Adapter、Web Island 三条前端路线是否同时进入正式架构；
- Web Island 的权限模型与 Native Component/Host Bridge 互操作边界；
- Studio / AI Authoring 如何覆盖三条路线。

## 不要重复

- 不要重新讨论 Native UI v2 当前是否限制 CSS/字体；已确认。
- 不要重新建立“Package Presentation / Host Authority”基本边界。
- 不要创建实现分支或代码，除非用户明确批准进入实施。
