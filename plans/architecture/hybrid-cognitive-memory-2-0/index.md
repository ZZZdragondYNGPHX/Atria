# Atria Hybrid Cognitive Memory 2.0 — 研究与逐轮讨论入口

> **状态：Discussion / Research，尚未冻结正式实现方案。**
> **创建：2026-10-10。** 本文与 [decisions.md](decisions.md) 由用户要求在每轮讨论前先更新远端，以防止历史决策遗失。
> **Task ID：** `hybrid-cognitive-memory-2-0`；**Primary Workspace：** `docs`；**产品目标：** Atria Agent Intelligence Runtime 的后续阶段，待讨论定案后由 Codex 评估并整合，不立即更改 M1 既有边界。
> **实现基线：** `ZZZdragondYNGPHX/Atria` 的 `main` 与 `feat/agent-intelligence-runtime`，按实际集成时 HEAD 重新核对。参考 [当前正式 AI Runtime Plan](../agent-intelligence-runtime/index.md)。

## 0. 本文如何使用

- **已确认决策以 [decisions.md](decisions.md) 为准。** 每轮先更新相关文档并提交远端，再向用户回复；不能把“推荐”写成“已确认”。
- 本入口只保留总体目标、阅读路由、轮次摘要、技术边界和未决议题，避免与 [既有 Runtime architecture](../agent-intelligence-runtime/architecture.md)、[Sparse Compute](../agent-intelligence-runtime/compute-policy.md)、[Context](../agent-intelligence-runtime/behavior-context.md)、[Reuse](../agent-intelligence-runtime/execution-reuse.md) 重复定义权威。
- 当前文档只是调研与讨论记录，**不是对已有 M1 实现范围、测试门槛、产品运行策略和迁移的实施授权**；整合进开发计划需按当前实况和显式阶段评审。
- 第六轮的算法研究与候选取舍单独见 [retrieval-design.md](retrieval-design.md)（创建后有效）；外部论文效果不视为 Atria 实测。

## 1. 长期目标及功能删除边界

将 Atria 的 `LLM Recall` / `RAG Recall` 两套对外独立模式和配置切换**硬切换到唯一 Hybrid Cognitive Memory 2.0 召回入口**，再推进长篇 RP 所需的事实、事件、人物认知、承诺、社会关系、叙事记忆与上下文使用。

**删除旧召回模式 != 禁用 LLM、向量检索或重排算法。** Embedding / lexical / graph / rerank / 按需 LLM 辅助都可以成为统一 Hybrid 内部可选执行手段，受预算与权限约束；是否移除旧模式的存量设置和旧数据迁移尚待正式细化。原始正式事件与世界状态不能因召回算法重构被删除。

优先解决：
1. 历史事实在当前分支和时间是否仍有效；
2. 事件对当前角色是否可见，以及角色亲历、听闻、相信或误解的区别；
3. 未完成承诺、因果关联、剧情伏笔能否按需回忆，且不替玩家选择行为；
4. 记忆检索是否自然地影响正文，但不造成 NPC 全知、旁白串味、人格机械化；
5. 正常 RP 尽量只发送一次正文模型请求；其他昂贵操作按事件、证据与额度触发。

## 2. 前五轮审议结果（完整冻结值见 decisions.md）

| 轮次 | 主议题 | 用户最终决定 | 说明 |
| --- | --- | --- | --- |
| R1 | 方向与范围 | **B：完整规划 Hybrid Cognitive Memory 2.0，分阶段实现** | 先讨论后定案，文档再交由 Codex 整合 |
| R2 | 旁白 / NPC 信息边界 | **B 作为系统默认；A 严格限知与 C 作者自定义作为作品可选** | NPC 单独遵守其可知信息；旁白按作品叙事权限，知晓不等于提前公开 |
| R3 | 认知更新机制 | **D：B 事件驱动混合认知为默认，C 高度自主模拟为作品可选** | 用户先发“B”后发“D”，以最新 D 为准 |
| R4 | 自主 NPC 模拟时钟 | **A：世界游戏时间驱动** | 由正式时间推进、事件触发；不采用在线 wall-clock 或离线持续推进作为默认 |
| R5 | 角色遗忘 | **D：B 轻度自然遗忘为系统默认，C 深度认知遗忘为作品可选** | 系统检索衰减/压缩与角色真正遗忘必须区分 |

以上为用户明确选择，非“讨论建议”。R6 尚未批准任何具体算法、融合权重或缓存策略。

## 3. 核心概念与权威边界

- **World / Session Authority**：唯一正式世界状态、事件结果、规则结算及其原有 revision / branch / receipts。
- **Memory / Evidence**：处理时间化、可追溯、可撤销的过去证据与召回索引；不另立 World Truth，也不持有 NPC 的正式心理状态。
- **Actor Cognition**：Actor + Session + Branch 下的 `known / believed / suspected / disputed`、情绪、关系与意图。错误信念允许存在，但不能变成世界事实。
- **Information / Context**：依 Actor、任务、来源、可见性、时间和分支决定模型能够读取什么。不能把秘密交给模型后仅凭“不要泄露”提示词声称完成隔离。
- **Goal / Commitment**：玩家目标与 NPC 愿望权限分离；未完成承诺是带生命周期的叙事线索，不等于强制剧情。
- **Orchestration / Narration**：编排输出只作指导，旁白按默认 B 与作品策略处理叙事，正式状态不由正文私自改写。新鲜正文默认 fresh-generate。
- **Temporal Simulation / Scheduling**：沿现有 canonical World Tick、Simulation Job、Authority Transaction、Task outbox、Session CAS；不可因真实时间流逝而隐式推进游戏时间。

## 4. 讨论中的七类记忆语义（不是七种物理数据库）

1. **Episodic**：事件和亲历经过，引用正式 Timeline / Event。
2. **Semantic**：身份、地点、事实和关系，以 World / Knowledge / Memory 来源验证。
3. **Perspective**：谁接触、知道、相信或误解，正式心理状态归 Actor Cognition。
4. **Social / Commitment**：承诺、未解决矛盾、关系变化和持续目标。
5. **Affective**：情绪相关经历（记忆证据）与当前情绪（认知状态）分开。
6. **Personality / Expression**：稳定 Actor Identity / Expression 与情境行为记忆分开。
7. **Narrative**：Scene / Chapter / Arc / Campaign 的持续叙事骨架。

一件事件只需一个可信来源；不同角色从该来源形成各自的认知与传播链，不能把“甲说 X”直接升级成“X 为真”。

## 5. R4/R5 的建议（尚未逐项冻结）

- **T0**：来源可见、动作或显式声明能够确定时，规则更新，无额外认知模型请求。
- **T1**：重大新信息、长期承诺、矛盾信念、关系突变时，触发必要的有界认知提案，再由原有 authority 检查与采纳。
- **T2**：仅作品启用自主 NPC 模拟时，基于正式 World Tick 与有界 Job 处理活跃/关联 NPC；休眠 NPC 不因存在而自动消耗模型请求。
- 游戏时间长跳跃通过稀疏到期事件与有界聚合，不模拟每分钟；缺预算或达上限不得编造未发生的事实。
- 区分 **检索排名衰减、层级压缩、角色剧情性遗忘、来源删除/撤回**。系统压缩不等于 NPC 忘记；来源删除应使依赖派生索引失效。
- 候选记忆需保留来源、时间、branch、actor exposure、producer/schema 版本、可撤销依赖。重要承诺/关系与身份历史不应仅按时间被丢弃。
- 高度自主模式下 NPC 行动先是 Intent；只有原 Authority 裁决、提交结果以后才构成 Event，再触发记忆/认知消费。

## 6. 与原 Agent Intelligence Runtime 的阶段关系（仅讨论）

- **独立 Memory 2.0 基础升级包**：删除平行召回、统一内部算法、来源/索引/查询/检索预算。
- **M1**：复用 Evidence / Eval / Evolution 而不修改既有冻结验收与保留的失败证据。
- **M8 G01–G06**：复用 Context/Compute/Reuse 的合法基础；尚未全部实施。
- **M2 S11–S14**：持续 Goal、承诺与主体边界。
- **M3 S15–S21**：Actor/Belief、Knowledge exposure、Emotion/Relationship、ToM、因果轨迹和存读档。
- **M4 S22–S26**：Simulation、受限预测、Fast/Slow 和预算优化。
- **M5 S27 起**：文字表达与叙事语义；人格风格不能污染旁白或其他 Actor。

不新增平行数据库权威、平行 model executor、平行调度/计费器。正式阶段划分和依赖由 Codex 以后与已批准 Plan 对齐，不在本轮静默改写旧阶段。

## 7. 当前正在讨论的第六轮

**主题：统一检索算法、记忆评分、多跳检索、上下文编译与缓存。**

待冻结问题：多算法融合、知识/承诺优先级与时间、复杂查询触发多跳与 LLM、Actor 可见性先过滤、检索是否跨 Revision 复用、Context 按稳定段/动态段组织及缓存失效策略。第六轮研究结论记录在 [retrieval-design.md](retrieval-design.md)，其中所有未被用户选定的方案均保持 **Proposal**。

## 8. 阅读与持续更新规则

- 后续每轮优先更新 `decisions.md`（有新用户决定时）和当前主题模块，再视跨模块重要变化更新本 `index.md`；**远端写入完成后才回复该轮内容**。
- 接下来的读者先读此入口与 `decisions.md`，再读当前轮模块；不重新读全量 M1/历史/参考分支。
- 若未来需要独立阶段模块，沿本 Bundle 扩展；不要把研究推论直接当生产验证结论。
