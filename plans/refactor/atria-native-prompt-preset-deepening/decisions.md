# 跨模块冻结决定与待选项

说明：只有用户明确作出的选择写“冻结”。本文件不是 D2 方案自动批准，也不代表产品实现已授权。

## D1 冻结，2026-10-15

1. **B：原生 Prompt/Behavior/Expression 深化**。既有 Native Prompt Module/Program/Compiler/Route/Context/Memory/Agent Evolution 继续使用，不另建第二预设内核。
2. **RP 文笔与 Agent 行为同等重要**：分别衡量文学表达、角色语言/角色行动和 Agent 任务结果，不能靠一个综合分掩盖差异。
3. **唯一 Native Host V3 权威**：Graph/Effect/Receipt、Memory/World/Session/Studio 状态与模型收费由原系统管理，Prompt 声明不提升领域权限。
4. **正式重构零旧兼容**：不为 ST 深度/后历史/绝对位置、旧 PromptManager 或旧 Orchestrator/Workspace 构造迁移、双轨、兼容层；不破坏新版原生资源正确性。
5. **高度作者自主权**：特别关注成年人合法虚构 RP、情色/浪漫等成熟题材的艺术与人物表达。Atria 自身不应将成人主题等同恶意输入或一律加入说教式拒答。用户可编写完整自定义指令、示例与作品创作偏好。
6. **先进破限研究必须进入企划**：研究角色框架、情境/长上下文、多轮、对抗优化、语言/格式变体及社区实践；重心是分析机制、有效控制与误拒，而不是将攻击载荷塞入生产默认模板。
7. **外部 Provider 限制**：区分真实 Provider API 可调设置、模型响应特性与不可改变的固定限制。绝不承诺 Prompt 能强行突破后者；严禁把不可信检索/Tool/世界书文本包装为系统权限。
8. **每轮文档先行**：第二轮开始先创建/更新同一 Plan Bundle 和 Record 并提交 `docs`，然后进入该轮讨论；正式开工前不动 `main`。

## D2 仍未选择（见 [creative-injection.md](creative-injection.md)）

- J1：增强 Native Slots；J2：**作者指令语义编译（推荐候选）**；J3：另建复杂 DSL。
- 自由表达 UI：一个完全可编辑作者模板 vs 语义控制面板 + 无限制作者文本 vs 重度自动调优。
- 当前已实现 `system.*`、`agent.*`、`context.*` 等 target 如何映射 provider roles、作者可控优先级与受信来源？
- 是否将误拒诊断、创作质量与模型实际拒答归因统一接入原 Eval/Experience 证据链？（方向建议，具体语义待选择）

下轮如果选定 D2，则先更新本文与 [creative-injection.md](creative-injection.md) 和 Record、提交，再进入 D3 讨论。
