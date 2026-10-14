# Atria Serene Canvas — Plan Index

- Task ID: `refactor/atria-serene-canvas`
- Primary Workspace: `main`（产品任务；方案与视觉输入归 `docs`）
- Status: Draft — v0.1 视觉基线已接受，完整功能企划仍在讨论。
- Current stage: 第二轮讨论，先建立方案，再继续完善功能呈现与原生化设计。
- Current iteration: v0.4 讨论稿已完成，等待反馈；展开 Play 会话首页/只读历史/存档，以及 Library 资源详情与精确修订。v0.3/v0.4 尚未单独获得视觉接受。
- Latest discussion HTML: [discussion-preview-v0.4.html](references/discussion-preview-v0.4.html)。
- Implementation authorization: 尚未收到“开始重构”。
- Source audit baseline: `main@9241325a7290e613e0fdaaa1870409105c161c89`。

## Goal

将 Atria 前端统一到 Serene Canvas 的纸墨、杂志排版与悬浮工作纸张体系，完整呈现现有产品能力，并逐项推动旧兼容基础设施原生化。视觉效果、交互反馈与完整工作流共同构成结果。

## Frozen core principles

跨模块已确定边界只归 [decisions.md](decisions.md)。视觉实施依据与版本规则只归 [visual.md](visual.md)，当前可浏览基线为 [accepted-preview-v0.1.html](references/accepted-preview-v0.1.html)。

本 Bundle 是新一轮重构方案；已完成的旧 [前端重构方案](../atria-product-frontend-redesign/index.md) 保留历史状态。实际源码继续决定功能与数据权威。

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| [decisions.md](decisions.md) | 已确定的跨模块范围与产品取舍 | — |
| [visual.md](visual.md) | 视觉基线、HTML 迭代与实施对照方法 | `decisions.md` |
| [coverage.md](coverage.md) | 当前能力、初稿覆盖和待补界面矩阵 | `decisions.md`, `visual.md` |
| [migration.md](migration.md) | 原生设施替代路径与兼容语义 | `decisions.md`, `coverage.md` |
| [validation.md](validation.md) | 交互、行为、视觉与性能验收目标 | `visual.md`, `coverage.md`, `migration.md` |
| [references/README.md](references/README.md) | 输入文件出处、版本与用途 | `visual.md` |

## Stage routing

### D2 — 完整企划与 HTML 继续迭代（当前）

必读：`index.md` → `decisions.md` → `visual.md` → `coverage.md`。

讨论底座替代时增加 `migration.md`；定义验收或验证原型时增加 `validation.md`。参考文件按 `references/README.md` 路由，不把所有资料每次重新加载。

### I1 — 视觉基础、Shell 与原生设施

必读：`index.md`、`decisions.md`、`visual.md`、`migration.md`、`validation.md`，以及 `coverage.md` 中涉及的 Shell/设置/生成部分。实际实施顺序由依赖和当时源码核查结果确定。

### I2 — 登录、引导、Play 与 Library

必读：`index.md`、`visual.md`、`coverage.md` 的对应域、`validation.md`；生成与作品宿主变更再读 `migration.md` 对应项。

### I3 — Studio、Agents 与 Runtime

必读：`index.md`、`visual.md`、`coverage.md` 的对应域、`validation.md`；状态/持久化或基础设施变更再读 `migration.md`。

### I4 — 全局工具、扩展、作品界面与综合验收

必读：`index.md`、`visual.md`、`coverage.md` 的剩余项、`migration.md` 的兼容边界、`validation.md`。

阶段用于依赖与验收组织。通用执行、记录及交付规则归 [Governance](../../../README.md)，本 Plan 不增加阶段审批或交接规则。

## Cross-module dependencies

功能矩阵决定需要补充哪些原型视图；原型决定这些视图的视觉表达；迁移方案决定哪些调用关系可以替代。视觉接受不等于功能完成或技术迁移已通过验证。

## Validation strategy

任务验收目标见 [validation.md](validation.md)，通用验证方式与 API 测试限制见 [Governance §12 / §13.1](../../../README.md#12-execution-adapters)。

## Material routing/design changes

- 2026-10-14：首轮 v0.1 初稿获得满意反馈，进入第二轮，建立本 Bundle 并保存完全一致的视觉快照。
- 2026-10-14：确定 Runtime 缺项引导 + 完整编辑、Agents 时间线默认 + Graph 切换；详细决定只见 `decisions.md`。
- 2026-10-14：确定 Play 默认回到上次阅读，并保存 Play/Library v0.4 讨论稿；详细决定只见 `decisions.md`。
