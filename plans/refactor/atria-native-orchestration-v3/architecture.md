# 第二轮：统一编排内核与执行模型（讨论草案，尚未冻结）

> 本模块记录候选和取舍，不因第一轮选择 B 就自动批准下面任何具体物理布局。冻结选择只在 [decisions.md](decisions.md) 登记。

## 1. 候选逻辑分层

`Authoring Plan (immutable revision) → Validation / Compilation → Run Admission → Graph Scheduler → Effect Ports / Receipts → Output Consumer`

- **Definition**：纯数据的 Agent/Tool capability、Plan graph、条件、final output contract、source refs、预算策略和版本固定。作者可改下一次 Plan，不偷改运行中的快照。
- **Run Coordinator**：Run identity、状态迁移、fanout/join、等待/恢复/取消，决定何时必须 checkpoint；不直接掌握 Secret、World 写入或 provider 私有对象。
- **Effect Host**：依据原权限和 revision/epoch 执行 model/tool/retrieval/Memory/Skill/MCP/A2A/Command；每次发送/副作用有独立稳定 identity 与 outcome。
- **Authority/Receipts**：正式业务写入继续在 Native Session/Studio/Project 等原 authority 内，返回版本化 receipt；编排只能消费获准结果。
- **Projection/UI**：运行图、事件、错误、当前等待的人类动作、费用与输出 owner 的受控投影；不因浏览器断联改变业务已提交状态。
- **Evaluation/Experience**：读取获得授权的 trace/result，接原有 Agent Intelligence，不是新建另一份运行日志真相。

该图是概念职责，不是新增七个微服务，也不授权现在把代码全移动到 `src/native`。

## 2. 第二轮核心取舍：Run 的单一持久权威放在哪里

| 候选 | 布局 | 好处 | 不可忽略的代价 |
| --- | --- | --- | --- |
| **T1 浏览器主导** | 现有 `AgentRuntime/IndexedDB` 继续持有主 Run，Native 提供受限效果 Port | 改动相对少，可保留现有 UI 事件 | 浏览器关闭/切页和长期任务恢复更复杂；Native Host 与 Browser 两种 lifecycle 必须严密 reconcile |
| **T2 Native Host 主导（推荐讨论）** | 共享纯编排语义；Node/Native Host 持有 Run admission、durable receipts、调度与恢复，浏览器专注 Plan authoring 和 projection | 与原 Session/Project/Task/预算/Secret authority 对齐，利于 Linux/Windows/Termux 统一执行 | 必须处理现有前端 LLM/DOM/编辑器 Hook 的移植适配、串流、隔离以及现有测试替换；不可仅搬运代码 |
| **T3 混合多执行者** | Browser 与 Host 可分别驱动完整 Run，靠租约选主 | 某些交互优化自由度高 | 易有两个状态机、两个发送来源及竞态；高复杂度，不建议作为默认设计 |

**初步推荐 T2，但尚待第二轮用户选择**。T2 不等于抛弃现有纯 JS `AgentRuntime`。可以把已有纯模型逻辑沉到可在 Node/Browser 复用的核心库，实际 **唯一有效执行 authority 在 Native Host**；Browser 保留只读 Run Projection 与明确请求动作。数据模型无须复制两个版本。

## 3. 第二轮建议冻结的对象（名称仅候选）

- **PlanDefinition/PlanRevision**：用户编辑模板与冻结执行快照隔离；固定 nodes、edges、agent/tool route refs、capabilities、budget policy、output contract。
- **RunIdentity**：owner + task/session/branch/revision 适用锚、plan revision、runId、generation/epoch；任何跨域锚点的有效性由该域原 source adapter 证明。
- **NodeAttempt**：nodeId / attempt / parentRunId / 当前状态 / 输入结果 refs；不能单纯以 nodeId 标记多个并发 attempt。
- **EffectIntent**：稳定 effectId、effect kind、能力、scope/source guard、预算 reservation、idempotency key、参数摘要；副作用执行前必须 durable admission。
- **EffectReceipt**：已执行 / 未执行 / unknown / stale、可安全继续的证据、返回值引用、source/provenance、收费与审批引用；未确认提交不能盲重播。
- **ResultEnvelope**：typed value/reference、status、node/attempt、source provenance、是否可进入 Judge/Finalizer。
- **RunCheckpoint / RunProjection**：前者恢复正确性的内部状态；后者可见诊断，绝不把完整私有记忆/Secret/原始 reasoning 当 UI 默认输出。
- **OutputCommit**：final producer/owner、consumer（guidance、reply、Studio review、task artifact）、当前 source pin；**建议/草稿不直接产生 World Command commit**。

以上每种是否需要新持久记录、现有结构能否直接复用以及具体字段，全部待第二轮/后续阶段审查。不能把候选名当成已经通过的 Schema。

## 4. 控制权需要明确分清

- **Delegate（子任务）**：父 Run 拥有最终结果与输出，子 Agent 返回 Result。
- **Handoff（转移）**：指定期间由子 Agent 承接控制，需显式输入可见性、可返回条件和输出 owner。
- **Fork/Join（并行）**：子任务持有自己的 checkpoint/receipt、共享父预算 reservation；Join 不把部分成功假冒整体成功。
- **Wait/Approve（等待）**：保存可重新展示的审批请求；恢复后依原 owner/permission 重新核验。
- **Retry/Replan**：只对确证可重试的 effect 重新派发；图修订与 Plan immutable snapshot/上限分离。

第二轮最先讨论主 Run Authority；其余语义先列为要求，不在这轮提前冻结。

## 5. 与既有架构不得冲突

- Native Authority/Compute/Memory/Agent Intelligence 的独占语义引用 [原计划](../../architecture/agent-intelligence-runtime/index.md) 与 [Game Runtime](../game-runtime-architecture/index.md)，本方案只管理 Orchestration 自己的 Plan/Run/Result 组织。
- 原 `src/native/task-scheduler.js` 是当前 host runtime 的瞬态调度投影；**不能把它写成已经持久的 V3 总协调器**。如果 T2 被批准，应先审计并设计其与原 `RunControl`/Project Task/持久 Host Intent 的恢复路径。
- Browser 原 `IndexedDB` Checkpoint 和 Native Session/Task 不应长期成为互相独立的两个 authoritative Run 账本。
- 精确 source pin、World mutation、预算收费、Provider fallback、Memory scope/Actor 可见性属于原业务权威。
- 不因「自动编排」而每轮 RP 固定多次模型调用；普通路径使用现有确定性证据，复杂情形按需启用 Agent。
- 不能让旧 `capsule`/`GENERATION_TAKEOVER` 反过来决定 V3 主契约；迁移期适配如何拆除仍待实施计划确认。

## 6. 第二轮需要回答的问题

1. 选择 **T1/T2/T3** 哪个主权威/执行拓扑？是否允许少量非权威 Browser 本地预览/编辑？
2. 统一执行是否只建立一个 Host-owned Run Ledger，所有 Spec/Agenda/Loop/Director 都解释为该 Run 的策略？哪些是纯变换而不需模型？
3. 同一进程的纯 JS 调度内核是否保留为独立可测试模块，而 Host 负责持久存储、权限和外部 Effect？
4. 何时持久化 checkpoint/receipt，哪些 resume/unknown 状态只能请求人工处理？
5. 普通 RP、原生 Game Turn、Studio Project Agent 哪些领域通过 Adapter 消费、哪些从默认模式开始原生启用？

这些需要先讨论并登记决定，然后进入第三轮图语义与动态派发。