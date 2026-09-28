# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@f79e2c13a4b3dcb83da5cec8bf9412ecd2096d2e`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.7

## 已写入 Plan

- Native UI v2 限制与 Package Presentation / Host Authority 核心边界。
- Declarative DOM / Full CSS / Fonts / Experience Shadow boundary。
- Client Interaction Runtime。
- Package Component System。
- Optional Script Sandbox。
- Frontend Capability Manifest。
- Frontend Asset Graph / Build Artifact / Framework/Web Island 路线。
- Remote Media / typed ImageRef：
  - Embedded / Pinned Remote / Live Remote；
  - responsive sources；
  - lazy / prefetch；
  - Host-controlled LRU/quota cache；
  - offline fallback；
  - `remote-media` 与 arbitrary `network` 分权；
  - Host Media Resolver；
  - CSS remote image rewrite；
  - executable/authority dependency exact closure 与 remote Presentation Media 分离。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Compatibility / Versioning 方向：

- v3 不应伪装成 `componentModelVersion: 3`；当前设计已超出 Component Model，应建立独立 Frontend Runtime contract。
- `Component / Hybrid / Full` 继续只表示 layout ownership，与 Frontend Runtime version/kind 正交。
- 建议 manifest 概念形态：
  ```yaml
  runtime:
    experience:
      mode: hybrid
      frontend:
        kind: native
        version: 3
        entry: ui/main...
  ```
  旧 v1/v2 继续使用现有 `componentModelVersion/component/selectors/surface` 字段。
- 同一个 active EntryPoint 只能选择一个 frontend engine/version；同一 Package 可以为不同 EntryPoint 携带不同 generation 的 frontend resources。
- v1/v2 Package 必须原样继续运行，不允许 open/save 或安装时静默升级。
- v2 → v3 migration 必须是显式 ChangeSet / 新 PackageVersion；已安装 immutable PackageVersion 不原地改写。
- Migration 分级：
  1. 可机械迁移：node tree、local UI state、preferences、selectors、actions、views/surfaces、native slots 等；
  2. 需要审阅：appearance、复杂 interaction、Opening/state lifetime 等；
  3. 无安全等价映射时必须保留诊断并要求作者手工处理。
- 为保证视觉兼容，迁移器可以生成 `v2-compat.css`（或等价 compatibility style artifact）固化旧 Host UI 的视觉，而不是让迁移结果继续依赖未来 Host 默认样式。
- v3 的引入本身不要求立即提升 `ExperienceContract.schemaVersion`；应继续维持“envelope version 与 feature capability version 独立”，只有 envelope shape 真正破坏兼容时才升 schema。
- 建议新增 required capability：`native-frontend@3`；可选能力分别版本化，例如 `remote-media@1`、`frontend-script@1`、`canvas-2d@1`。未来 `web-island@1` 独立。
- Runtime 真正需要区分的 frontend kind 倾向只有：
  - `native`
  - 未来 `web-island`
  Framework Adapter 属于 authoring/build layer，最终编译成 `native@3`，不制造第三套 Runtime。
- 当前倾向的 v3 baseline：
  1. Atria Native Frontend v3：正式核心 baseline；
  2. Framework Adapter：正式 authoring extension point，但不阻塞 Core v3 Runtime 首版；
  3. Web Island：架构保留并定义 capability seam，但不作为 Core v3 首版完成条件，后续单独阶段实施。
- Host Bridge 语义必须跨 Native declarative、Sandbox Script、未来 Web Island 保持一致；不能出现 Web Island 专属裸 Authority API。
- Studio / AI / Health：
  - Native v3 为一等结构化支持；
  - Framework Adapter 编译后可落到 Canonical IR，因此可获得大部分分析能力；
  - Web Island 只能保证权限、manifest、bridge、运行预览与边界诊断，不承诺像 Native v3 一样进行完整结构化可视编辑。
- v2 暂不设硬删除时间；新建项目在 v3 稳定后可默认 v3，旧 v1/v2 runtime 继续兼容，正式 deprecation 需另行批准。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把本轮 Compatibility / Versioning 结论写入 Plan，再继续：

- Frontend Manifest 的最终字段模型；
- v2 → v3 Migration Assistant 的精确映射矩阵；
- v3 Runtime capability negotiation / fallback / unsupported-host UX；
- Script Sandbox 与 Native/Web Island Bridge 的统一 API surface；
- 是否需要把 Remote Media、Script、Canvas、Web Island 做成安装时用户可见权限等级。

## 不要重复

- 不要重新讨论 Native UI v2 当前 CSS/字体限制。
- 不要重新建立 Package Presentation / Host Authority 基本边界。
- 不要重复讨论远程立绘为什么必须支持；已冻结。
- 不要创建实现分支或代码，除非用户明确批准进入实施。
