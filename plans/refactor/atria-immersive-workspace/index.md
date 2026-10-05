# Atria Immersive Workspace — Plan Index

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: **Draft — 2026-10-05；布局与范围偏好已确认，整体实施方案尚未批准。**
- Current stage: D0 文档整理完成，下一 checkpoint 为 D1 审阅与冻结。

## Goal

将 Atria 的游玩、资料库、创作、智能体和运行配置统一到用户确认的浮动工作空间中，突出阅读与当前任务，重组管理、审阅和恢复入口；完整保留现有编辑能力。将隐藏的用户设定管理重构为原生、账户拥有、会话独立选择的模块。

这是一项新的后续改造，不重写已完成的 [旧前端设计历史](../atria-product-frontend-redesign/index.md)。原有 tokens、外观、Environment、导航和控制器是复用基线；本 Bundle 批准后，其明确列出的新布局规则覆盖旧设计对应条目。未涉及的 Native Frontend v3 边界仍由 [v3 Plan](../native-frontend-runtime-v3/index.md) 与实际契约负责。

## Confirmed core principles

1. 游玩优先；保留五域语义、浮动层次与现有蓝紫色系。
2. 原生产品保留 English / 简体中文。平台正文采用衬线字体，控件采用无衬线；作品自有字体和布局受自身声明控制。
3. 首轮保留全量现有编辑器及高级 JSON / Source；后续按资源类型逐类重构。
4. 界面重组不改变作品、资源修订、会话、请求和项目提交的 authority；每个旧动作须有可追溯去向。
5. 用户设定是新增原生能力工作包，开放条件单列。讨论原型不是产品实现或集成验收。

详细确认清单只在 [decisions.md](decisions.md) 维护。

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| [decisions.md](decisions.md) | 已确认偏好、草案提议、范围差异 | — |
| [experience.md](experience.md) | 视觉、导航、工作区布局、呈现边界 | decisions |
| [baseline-inventory.md](baseline-inventory.md) | 现有 S00–S19 功能与字段基线快照 | main 基线 |
| [coverage.md](coverage.md) | S00–S20 接线、输出、阶段和验收归属 | baseline、experience |
| [states.md](states.md) | 加载、草稿、冲突、审阅、能力与异步生命周期 | coverage |
| [personas.md](personas.md) | S20 原生身份、Prompt 接入、迁移、恢复与开放门 | states、Native 契约 |
| [delivery.md](delivery.md) | 分阶段实施、完整编辑能力保留、依赖和阶段门 | coverage、personas |
| [validation.md](validation.md) | 验证矩阵、证据要求与执行入口 | coverage、states、personas |

## Stage routing

| Stage | 内容 | 必读（均先读本 index） |
| --- | --- | --- |
| D0 | 讨论证据整理与正式草案 | decisions、coverage、delivery |
| D1 | 审阅草案、契约核对、冻结实施范围 | decisions、personas、delivery、validation；coverage 按受影响行读取 |
| A1 | 外壳、共享状态、搜索、入口 | experience、states、coverage 的 S00/S01/S18/S19、validation |
| A2 | 游玩、资料库、安装与恢复 | experience、states、coverage 的 S02–S08/S17、validation |
| A3 | 创作、运行配置、智能体、扩展接线 | states、coverage 的 S09–S16、delivery 的完整编辑保留清单、validation |
| A4a | 用户设定原生持久化与会话 / 请求契约 | personas、states、validation |
| A4b | 用户设定管理、选择、迁移、备份与入口开放 | personas、coverage 的 S20 与关联行、validation |
| A5 | 首阶段集成与兼容验收 | delivery、validation，失败项再路由到其权威模块 |
| B1–B4 | 编辑器逐类重构（每类独立阶段） | delivery、对应 coverage 行与 baseline 小节、states、validation |
| F | 最终验收、集成与清理 | delivery、validation |

## Dependencies and current design state

A1 → A2 → A3；A4a 依赖稳定会话 / 请求 authority，A4b 依赖 A4a 与 A2 的资料库/游玩入口；A5 同时依赖 A1–A4b。B 阶段在 A5 验收后开始。共享席位、自有界面和存档兼容属于 A4 开放条件，不能留到入口开放后再处理。

目前 S00–S20 均有设计覆盖，均**未完成产品集成验收**。布局偏好已经确认，Native 用户设定的具体 schema/API、迁移 ledger、旧会话兼容实现仍须 D1 完成契约核对。不要把占位 HTML 的字段和服务样例复制到产品中作为现有编辑器的替代。

## Validation strategy

以 [validation.md](validation.md) 的真实 authority、状态和设备矩阵验收；执行实际修改对应的测试，再按新增风险拓宽。不计算原型“等价通过率”。仅文档检查通过不能推进产品开放门。

## Material routing / design changes

- 2026-10-05：新建 Draft Bundle，整理 v0.2–v0.8 确认；增加 S20 独立原生能力与迁移工作包；旧设计完成状态保持原样。
