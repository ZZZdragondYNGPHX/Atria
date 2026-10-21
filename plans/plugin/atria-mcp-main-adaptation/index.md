# Atria MCP 当前主线适配 — Plan Index

- **Task ID**：`plugin/atria-mcp-main-adaptation`
- **Primary Workspace**：`plugin`，工具实现归 `atria-mcp/`；必要产品接口归产品源码任务工作空间；方案与结果归 `docs`。
- **状态**：已完成。三轮设计与推荐验收基线已落实，产品接缝已集成 main，工具 0.4.0 已交付；实际结果与边界见 [Record](../../../records/plugin/atria-mcp-main-adaptation.md)。
- **创建日期**：2026-10-20。
- **源码基线**：`main@c83f18bba110bacd528d13b1cd2bbda42b65236e`；`plugin@764d9c24f361beaf14fb2b59882497f403143749`（MCP 0.3.0）。后续讨论遇到主线变动时复核相关契约并刷新基线。

## 目标

完整适配当前 `main`：修复失效契约与错误结果语义，覆盖当前原生能力的完整工作流，复用仍有效的 MCP 实现和产品权威。逐项区分已有覆盖、确定失配、新增能力缺口与需要运行确认的边界。

本任务独立于历史 [Capability Expansion](../atria-mcp-capability-expansion/index.md) 和 [Strengthening](../atria-mcp-strengthening/index.md)；历史方案与记录提供背景，不继承其审批、兼容或实施状态。

## 已确认边界

详见唯一跨模块决策权威 [decisions.md](decisions.md)。第一轮确认完整适配、仅支持当前主线、允许必要的产品侧小改动；第二轮确认服务端 V3 接入、两类提交边界、分层审批和原生批准后自动续接 A 方案；第三轮确认剩余全领域范围、必要产品小接口及推荐验收基线。

## 模块与权威

| 模块 | 负责内容 | 状态 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 已确认的跨模块范围、版本、授权与验收边界 | 三轮设计已确认 |
| [capability-matrix.md](capability-matrix.md) | 各域覆盖现状、适配目标与讨论路由 | 实现及本机验收完成 |
| [orchestration-approval.md](orchestration-approval.md) | V3 Plan / Binding / Run / Effect、原生 Review 与 MCP 授权、恢复语义 | 已交付，原生 Review 双 Backend 通过 |
| [domains-acceptance.md](domains-acceptance.md) | 其他领域适配范围、完整工作流与验收要求 | 已交付，证据范围见 Record |

详细规则各归一个权威模块；index 只维护路由与依赖。后续领域设计达到需要独立阅读的规模时新增模块并更新本表。

## 讨论与实施路由

| 轮次或阶段 | 内容 | 必读 |
| --- | --- | --- |
| 第一轮，已完成 | 代码调查、范围、兼容和产品侧改动边界 | 本 index、decisions、capability-matrix |
| 第二轮，已完成 | 服务端 V3、提交边界、分层审批、批准后自动续接 A 方案 | 本 index、orchestration-approval |
| 第三轮，已完成 | 剩余领域范围、必要产品小接口、完整工作流及推荐验收基线 | 本 index、domains-acceptance、capability-matrix |
| 设计收口，已完成 | 将第三轮确认写入方案，保持设计与实施状态分离 | 本 index、decisions |
| 正式实施，已完成 | 精确合同、工具与必要产品接口实现、针对验证、隔离产品联调和交付 | 本 index、已批准的相关模块及 Record |

约定的三轮设计讨论与正式实施均已完成。执行规则统一引用 [Governance](../../../README.md)。

## 依赖关系与实施顺序

其他领域引用已确认的 V3 Host fence、原生审批与结果恢复规则；各域继续使用自身 source / revision / scope / lifecycle 权威。必要的产品侧接缝和验收详见 [领域模块](domains-acceptance.md)。

正式开工后的顺序：

1. 当前基线合同、退役动作、能力声明与基础验证入口；V3 身份 / Journal / 调度 / A 续接。
2. Runtime / API Preset / Prompt 与当前 Plan target，保证后续生成和学习使用正确配置。
3. World / Session / Memory / 认知学习，覆盖视角、时态历史、存档和原始业务 Receipt。
4. Storage Center / Media / Binary、Package / Resource / Skills / Extensions 与必要产品接口。
5. 受影响浏览器与客户端、完整隔离产品联调、必要产品 main 集成及对应工具交付。

上述阶段已完成，不新增阶段性用户批准；未来超出已确认能力边界的实质变化另行讨论。

## 当前证据范围

当前验证结论与失败修复统一记录于 [Record](../../../records/plugin/atria-mcp-main-adaptation.md)。路由和 action 数量仅是目录信息，不代表语义覆盖率；本地确定性 Provider、自动化临时账户和模拟窄屏不冒称付费服务、真人审批或真实移动设备证据。

执行规则、测试资产归属及文档生命周期统一引用 [Governance](../../../README.md)，本方案不另立规则。
