# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Docs HEAD: `docs@4fd254748418fe3c6e49fd8d4918ff2643aa673f`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.5

## 已完成

- 核对 Native UI v2 当前实现限制。
- 冻结核心方向：Package owns presentation; Host owns capabilities and authority.
- 讨论并写入：
  - Declarative DOM
  - Full CSS / Fonts / Shadow boundary
  - Client Interaction Runtime
  - Package Component System
  - Optional Script Sandbox
  - Frontend Capability Manifest
- 尚未写任何产品代码，也未创建 `refactor/*` 实现分支。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一主题

Resource / CSS / Build Artifact Model：
- font/image/SVG/CSS URL 与 AssetRef；
- stylesheet graph / scope / theme / layers；
- Native Component `::part()`；
- build hashing / immutable dependency closure；
- 是否允许 React / Vue / Svelte 等现成 Web 前端构建产物进入 Atria。

## 不要重复

- 不要重新讨论 Native UI v2 当前是否限制 CSS/字体；已确认。
- 不要重新建立“Package Presentation / Host Authority”基本边界。
- 不要创建实现分支或代码，除非用户明确批准进入实施。
