# Atria Serene Canvas — Plan Index

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: `refactor/atria-serene-canvas`
- Primary Workspace: `main`（产品任务；方案与视觉输入归 `docs`）
- 外部服务及真实设备限制见 Record。
- Current iteration: v0.8 Dock 已接受，快照见 [accepted-dock-v0.8.html](references/accepted-dock-v0.8.html)；交互规则与本轮边界见 [dock.md](dock.md)。v0.6 的完整代表交互持续作为依据；v0.7 补充欠覆盖页面，尚未获得新视觉基线接受。原型内存状态不作为产品服务实现。
- Latest discussion HTML: [discussion-preview-v0.8.html](references/discussion-preview-v0.8.html) 为 Dock 交互试玩，继承 [v0.7](references/discussion-preview-v0.7.html) 的补充页面；完整前版见 [v0.6](references/discussion-preview-v0.6.html)。
- Implementation authorization: 2026-10-15 收到明确“开始重构”；重大新能力或视觉改向仍须讨论。
- Source audit baseline: `main@cc5e90eac`，实施分支 `refactor/atria-serene-canvas`。
- Implementation record: [records/refactor/atria-serene-canvas.md](../../../records/refactor/atria-serene-canvas.md)。

## Goal

将 Atria 前端统一到 Serene Canvas 的纸墨、杂志排版与悬浮工作纸张体系，完整呈现现有产品能力，并逐项推动旧兼容基础设施原生化。视觉效果、交互反馈与完整工作流共同构成结果。

## Frozen core principles

跨模块已确定边界只归 [decisions.md](decisions.md)。视觉实施依据与版本规则只归 [visual.md](visual.md)，当前可浏览基线为 [accepted-preview-v0.1.html](references/accepted-preview-v0.1.html)。

本 Bundle 是新一轮重构方案；已完成的旧 [前端重构方案](../atria-product-frontend-redesign/index.md) 保留历史状态。实际源码继续决定功能与数据权威。

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| [decisions.md](decisions.md) | 已确定的跨模块范围与产品取舍 | — |
| [dock.md](dock.md) | 边缘吸附、隐藏与唤出的已接受规则及产品边界 | `decisions.md`, `visual.md` |
| [visual.md](visual.md) | 视觉基线、HTML 迭代与实施对照方法 | `decisions.md` |
| [coverage.md](coverage.md) | 当前能力、初稿覆盖和待补界面矩阵 | `decisions.md`, `visual.md` |
| [migration.md](migration.md) | 原生设施替代路径与兼容语义 | `decisions.md`, `coverage.md` |
| [references/README.md](references/README.md) | 输入文件出处、版本与用途 | `visual.md` |

## Stage routing

### D2 — 完整企划与 HTML 继续迭代（欠覆盖页面）

必读：`index.md` → `decisions.md` → `visual.md` → `coverage.md`。

讨论 Dock 时增加 `dock.md`。讨论底座替代时增加 `migration.md`；参考文件按 `references/README.md` 路由，不把所有资料每次重新加载。

### I1 — 视觉基础、Shell 与原生设施

实际实施顺序由依赖和当时源码核查结果确定。

### I2 — 登录、引导、Play 与 Library

生成与作品宿主变更再读 `migration.md` 对应项。

### I3 — Studio、Agents 与 Runtime

状态/持久化或基础设施变更再读 `migration.md`。

## Cross-module dependencies

功能矩阵决定需要补充哪些原型视图；原型决定这些视图的视觉表达；迁移方案决定哪些调用关系可以替代。

## Material routing/design changes

- 2026-10-14：首轮 v0.1 初稿获得满意反馈，进入第二轮，建立本 Bundle 并保存完全一致的视觉快照。
- 2026-10-14：确定 Runtime 缺项引导 + 完整编辑、Agents 时间线默认 + Graph 切换；详细决定只见 `decisions.md`。
- 2026-10-14：确定 Play 默认回到上次阅读，并保存 Play/Library v0.4 讨论稿；详细决定只见 `decisions.md`。
- 2026-10-14：保存 Library Prompt/Persona 与 Settings v0.5 讨论稿；
- 2026-10-15：先更新本轮范围，再保存 Studio 非 Prompt 编辑与冲突恢复 v0.6 讨论稿；仍处于 D2，未开始产品重构。

- 2026-10-15：按当前交互选择新增 v0.8 Dock HTML；仅设计讨论，不启动产品修改，详见 `dock.md`。

- 2026-10-15：明确接受 v0.8 并授权实装；
