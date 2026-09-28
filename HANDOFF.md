# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@5fe09a88b6389ed18be3eb712f86675cfefea5e2`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.8

## 已冻结/写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / Full CSS / Fonts / Shadow boundary.
- Client Interaction Runtime.
- Package Component System.
- Optional Script Sandbox.
- Frontend Capability Manifest.
- Frontend Asset Graph / Remote Media / typed ImageRef / Host Media Resolver.
- Framework Adapter / future Web Island 路线。
- **Hard cut legacy Native UI**：
  - 不做 v1/v2 migration assistant；
  - 不做 compatibility CSS；
  - 不长期并存旧 renderer；
  - 不保留 legacy manifest parsing；
  - 现有开发期 fixture / Package / test data 可直接重建、改写或删除；
  - 重构最终目标是 v3 成为唯一 Native Frontend runtime。

## 关键版本方向

- v3 不再伪装为单纯 `componentModelVersion: 3`，使用独立 `frontend` contract。
- `Component / Hybrid / Full` 继续只是 layout ownership。
- Runtime kind 倾向仅有 `native` 与未来 `web-island`。
- React / Vue / Svelte 属于 authoring/build technology，Framework Adapter 编译到 Native Frontend。
- 由于不需要兼容旧数据，是否提升 Experience / Runtime envelope schema 完全按新架构整洁度决定。
- implementation 完成时可删除旧 Native UI v1/v2 runtime/compiler/tests 与 legacy declaration。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮主题

Frontend Manifest / Capability Negotiation：
- `runtime.experience.frontend` 最终字段；
- envelope schema 是否同步 hard cut；
- capabilities 与 permissions 分层；
- required / optional / fallback；
- unsupported host 与 user-denied 的行为；
- Native Declarative / Script / future Web Island 共用 Host Bridge；
- 安装 UI 应展示哪些权限。

## 不要重复

- 不考虑 v1/v2 用户数据、作者生态、Package migration 或长期兼容。
- 不要重建旧数据迁移方案。
- 不要创建实现分支或代码，除非用户明确批准进入实施。
