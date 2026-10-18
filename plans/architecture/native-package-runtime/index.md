# Atria 原生 Package Runtime 能力体系 — Plan Index

- Task ID: `ARCH-NATIVE-PACKAGE-RUNTIME`
- Primary Workspace: `main`；`docs` 承载本任务的 Plan、Record 与实时交接。
- Status: Complete — S0–S6 / CP1–CP3 完成；
- 创建日期：2026-10-06。
- 产品起点：远端 `main`，`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；
- Record：[永久阶段记录](../../../records/architecture/native-package-runtime.md)。
- 最终产品 HEAD：`ed1fd90521a63363e29856601abbf5e908c99d10`；live HANDOFF 已随 CP3 完成删除，后续从永久 Record 查阅。

## 目标

将 Tavern Helper 与 Prompt Template 所体现的有价值需求，组织成 Atria 自己的原生能力体系。

交付范围覆盖 State、Script、Prompt、Knowledge、Generation、Lifecycle、Processing，以及 Studio / Runtime Diagnostics。优先扩展已有 Native Authority、Runtime 和资源体系；新增机制须对应明确缺口。

## 冻结核心原则

跨模块决策唯一权威见 [decisions.md](decisions.md)。本入口只保留导航摘要：

- Package 定义玩法；Atria Authority 强制平台合法性与固定 Package 规则。
- 调用者提出领域操作，脚本参与计算与编排；正式 State 写入属于相应 Authority。
- 状态有明确归属与生命周期，读取按消费用途授权。
- Prompt / Knowledge 是只读上下文计算；模型工作通过显式 Task / Generation 阶段完成。
- Task 产物保留生产依据，按契约消费；正式操作在应用基准上重新执行规则。
- Processing 的输出、上下文和呈现按用途区分，正式采用由对应 Authority 完成。
- 用户把控能力范围、职责边界和关键取舍；技术字段、事件、API 和执行策略由 Agent 在边界内推导。

## 模块路由与权威

| 模块 | 唯一职责 | 依赖 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 跨模块冻结边界、排除项与设计授权 | 已定方向 |
| [research.md](research.md) | 定向研究、锁定基线、现有能力与缺口、代码入口 | 锁定源码证据 |
| [authority-script.md](authority-script.md) | 领域契约、受限业务逻辑、State 归属、候选计算与正式提交 | decisions；Task 消费约束引用 context-generation |
| [context-generation.md](context-generation.md) | 上下文派生、Knowledge、Prompt、模型任务与产物消费 | decisions；authority-script 的读授权和提交边界 |
| [experience-processing.md](experience-processing.md) | Experience 编排、Lifecycle、Tool 操作路由、Processing 与原生交互 | decisions；前两模块的领域请求与产物 |
| [authoring-diagnostics.md](authoring-diagnostics.md) || 所有模块的声明与运行证据 |

## 能力模型

| 原生领域 | 应向 Package 提供的能力 |
| --- | --- |
| State Runtime | 归属、生命周期、获准视图、版本、领域提交与连续性 |
| Script Runtime | 按用途受限的计算和编排，固定资源绑定与受控宿主能力 |
| Prompt Runtime | 条件、派生、阶段产物、组合、PromptIR 和有效请求 |
| Knowledge Runtime | 查询、资格、发现、激活、依赖、内容计算、预算与选择依据 |
| Generation Runtime | 独立任务、结构化输出、Tool、取消、并发与明确结果去向 |
| Lifecycle | 受控触发、工作流、任务编排、恢复与因果关系 |
| Processing | 输出、上下文、呈现的有界转换与正式采用边界 |

## 阶段与按需阅读

执行流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

| 阶段 | 交付 / 退出条件 | 必读模块（均先读本 index） |
| --- | --- | --- |
| S0 定向研究与正式企划 | 研究和已确认原则入库，Plan Bundle、Record、HANDOFF 推送；产品源码未改 | decisions；research |
| S1 技术契约冻结 |本阶段只读源码、更新设计文档| decisions；authority-script；context-generation 的 Task 来源与消费部分 |
| S2 受限业务逻辑与 Authority || decisions；authority-script；authoring-diagnostics 的执行证据部分 |
| S3 上下文、知识与模型产物 | 扩展作者派生计算，整合 Native Knowledge 选择与预算主链，落实 Task 用途与跨版本消费；保持预览只读 | decisions；context-generation；authority-script 的读取边界；authoring-diagnostics |
| S4 Experience 与 Lifecycle 编排 | 通过受控原生能力提出操作、调度任务与 Tool；落实工作流、恢复和因果关系，复用现有调度与提交机制 | decisions；experience-processing 的编排部分；context-generation；authoring-diagnostics |
| S5 Processing 与作者工作流 | 统一输出/上下文/呈现处理和类型化交互，完成相关 Studio 声明、预览、错误与跨域诊断 | decisions；experience-processing；authoring-diagnostics；按变更读取 context-generation |
| S6 原生集成与完成 | 新 Native Package 场景贯通，完成针对性回归、记录、main 集成与短期分支清理；整体完成后删除 live HANDOFF | decisions；当前 Record；实际涉及模块 |

S1–S3 完成 CP1，S4–S5 完成 CP2，S6 完成 CP3。产品已合入并推送 main；任务分支和 live HANDOFF 已清理，当前任务结束。

## 设计状态

已冻结：目标、职责、Authority 边界、脚本用途、读权限原则、Task 消费原则及 Processing 分工。

S1 已冻结：Game Logic v3 可选 computation、复用固定模块编译与 QuickJS 受限计算、typed computed + 固定 Effect 模板、候选后 invariant、单 Session CAS 和 Task uses / production 引用。详见 authority-script / context-generation 的 S1 契约；S3 已完成 contextRuntime 派生、完整 Knowledge 选择和正式 Task 产物用途消费；详细 Schema / API 与采用边界见 context-generation 的 S3 契约。

## 实质变更记录

- 2026-10-06：根据定向研究和已定方向建立正式 Plan Bundle；技术细节转入阶段设计，结束逐项方向确认。
- 2026-10-06：S0 完成；CP1（S3 后）、CP2（S5 后）和 CP3（S6 最终完成）用于组织结果记录，不构成当前停工或审批点。

- 停在 CP1，S4 尚未开始。

- 2026-10-06：S4 固定 Lifecycle Bridge 与 durable cause、S5 三阶段 Processing / Studio 编辑与只读预览 / 运行诊断完成；产品与 docs 推送，停在 CP2，S6 尚未开始。

- 2026-10-06：S6 新 Native Trading 与原生历史处理场景在 Fs / SQLite 贯通，相关 8 suites / 58 用例通过；
