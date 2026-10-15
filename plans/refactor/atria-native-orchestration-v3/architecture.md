# 第二轮 D2：Native Orchestration V3 内核与执行边界（已冻结）

> 详细跨模块决定见 [decisions.md](decisions.md)。本文件管理 D2 Host/Plan/Effect/Receipt 结构；**D3 的动态图执行控制细则见 [graph-control.md](graph-control.md)**，不在此复制。物理 Schema/代码位置仍未定，未做产品验证。

## 1. Native Host 是唯一 Run Authority

`PlanRevision → Host Run Admission → Durable Run Ledger → Graph Controller → Durable EffectIntent → 原 Native Port → EffectReceipt → ResultEnvelope → 原 Domain Consumer`

- Native Node Host 负责准入、调度、CAS/epoch/fencing、持久 checkpoint、并行子任务、取消、恢复、最终输出准入。可以提炼旧 `agent-runtime` 和 `orchestration-engine` 中不依赖旧模式的纯 JS 算法，但**不允许旧编排执行器继续作为 V3 产品路径**。
- Browser 只保存非权威草稿/画布布局，向 Host 提交保存 Plan、运行、取消、审批等显式请求，观察脱敏 RunProjection 和模型流，不持有一套可以驱动 Effect 的 IndexedDB 状态机。
- Host 断电/重启读取持久 Run/Effect 身份并重新审查 scope、Source Revision、预算、权限以及外部结果；无法安全 reconcile 的 effect 进入 unknown/waiting_review，不能无根据重复执行。
- Node 运行与 Host 权威只是一套逻辑，不为了实现这些概念再引入微服务架构。

## 2. Plan / Run / Effect / Receipt

| 数据概念 | 保证的职责 | 明确排除 |
| --- | --- | --- |
| PlanDefinition / PlanRevision | 原生 Node/Edge/Agent/Tool/ModelRoute/Capability/Budget/OutputContract 的版本化定义，执行时冻结 | 当前响应、Secret、实际成本、运行态 Graph |
| Run / NodeAttempt | Host-owned scope/owner/PlanRevision/原 source anchor、动态 TaskGraphRevision、parent-child、epoch、pending effects/approvals、Checkpoint/Results/terminal status | 改写 Session World / Project 真相 |
| EffectIntent | 具有稳定 EffectId、origin node/attempt、类型、预算 reservation、权限/source guard、参数/依赖摘要及幂等/reconcile 意图的持久准入记录 | 已发生却无法证明的成功 |
| EffectReceipt | 绑定结果 completed/failed/cancelled/stale/unknown、外部 op ID、Source/usage、原 Domain Receipt 引用 | 跨协议 exactly-once 保证、正式领域事务 |

`ResultEnvelope` 是可消费结果及可信 producer/provenance/currentness，不等同 Receipt；`OutputContract` 要求 final owner、consumer（如 Narration、Guidance、Studio Review、Task Artifact）在提交前重验 Run/Source/权限；`RunProjection` 只是受限显示快照，不是恢复 checkpoint，也不携带 Secret、私有 Actor 信息或 provider 的 opaque reasoning。

Planner 的 GraphPatch 仅修改 Run 内任务图版本，不回写原 PlanRevision；D3 已冻结其结构化提案/Host 整补丁校验/CAS 与有界生命周期，详细规则见 [graph-control.md](graph-control.md)。不同 Session/Studio/普通 RP 修订域保持各自真实 anchor，不能合成一个无来源的“全局版本”。

## 3. Native 权威复用，不复制业务真相

- `NativeTaskScheduler` 提供现有并发/优先级/资源许可，其活动队列不是耐久的 V3 Run Ledger；新账本需按 Host StorageEngine/原有 CAS 设计，不创建第二模型费用账本。
- `SessionCore`、`RunControl`、正式 World/Command 负责游戏状态和事件、Session revision/收费；`Studio` 和 `Project Agent Task` 负责 ChangeSet/Review/Apply。编排只能持原 DomainCommitReceipt 的引用，不凭 Agent、Judge 的文字完成正式写入。
- `Model/Prompt Runtime` 唯一持有 Route/Secret/Provider Send/Usage/Fallback；`Memory/Actor/Cognition` 负责可见性和历史源；`Skills/MCP/A2A` 保留自己授权、操作身份、外部来源/未知结果；`Experience` 保留评价记录与演化发布。
- 共享计算、缓存和模型路由引用 [Agent Intelligence Runtime](../../architecture/agent-intelligence-runtime/index.md)；游戏事务与旁白边界引用 [Game Runtime](../game-runtime-architecture/index.md)。本方案只管编排执行进度与有界结果消费，不创建世界写入口。

## 4. 硬切、全新产品前端、跨平台

- 删除旧 Single/Spec/Agenda/Loop/Director 的 mode enum/分派、legacy Generator/Workflow、engine-v2 mode bridges、旧 capsule/takeover 作为编排主合同、旧预设/配置/历史浏览器 Checkpoint、旧编辑器/Run Panel 的编排专属代码与样式。**无旧模式兼容，无旧预设迁移，无双轨/fallback/shim，也无模式一对一映射的 V3 模板**。V3 仅提供原生自由组合的图能力。
- 旧算法可以作为提炼参考，前提是不引入 SillyTavern 假设或保留历史业务状态机。清退作用于编排专属代码，实施前审查真实共享消费者，不删除仍在正常使用的 Native Game/Memory/Skills/MCP 等公共服务。
- 新前端不复刻历史 UI：Graph Authoring、Node/Edge/Agent/Capability/Output 编辑器及 Run Graph/Trace/Approval/Diagnostics 视图重新设计。UI/UX 具体流程随后冻结。
- Windows、CachyOS Linux 和 Android Termux 使用同一 Node Native Host 协议及本地数据权威，界面样式可响应式不同。网页断开不等于取消；Host 进程重启后可核验恢复，不假定系统常驻、关闭设备期间自动执行或跨设备 Run 同步。实际测试与三端验收仍待工程阶段。

## 5. D3 控制流冻结引用

第三轮 G2 有界动态图、Delegate/Handoff、Join、Planner/Judge/Review、局部重做、恢复及循环控制由 [graph-control.md](graph-control.md) 唯一维护。第四轮围绕 Context/Hybrid Memory/Actor/Source 权限与跨 Agent 信息共享讨论，不改变此处的 D2 单 Host/零兼容权威。
