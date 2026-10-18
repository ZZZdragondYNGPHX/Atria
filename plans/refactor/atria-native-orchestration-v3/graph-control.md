# D3 — G2 有界动态图、协作与恢复（冻结的设计方向）

> 用户在第三轮选择 **G2**，2026-10-15 冻结。跨模块决策摘要在 [decisions.md](decisions.md) D3；运行权威与 Plan/Run/Effect/Receipt 归属见 [architecture.md](architecture.md) D2。本模块是 **V3 控制流语义唯一详细入口**。

## 1. 基本模型：不可变计划、Host Run 的动态图

- `PlanRevision`：作者发布并为本次执行固定的 Graph Blueprint、Agent/Tool 允许集、预算/输出契约、合法的动态变化范围与来源许可。不可被运行中的模型或 Planner 隐式覆写。
- `TaskGraph`：当前 Run 的实际工作单元及依赖、控制边、可用结果引用与实时状态；可以动态扩展，但只有 Native Host 是权威写入者。`TaskGraphRevision` 随每次合法拓扑/调度属性变更递增，与 PlanRevision、Session/Studio 原 Revision 严格区别。
- `NodeAttempt`：任务节点每次尝试的独立身份、输入证据版本、结果/Effect refs 与状态。成功/失败的旧 Attempt 不因重做而擦除，结果消费必须明确绑定某次尝试和时刻。
- 实际生产代码不维持旧四模式隐藏状态机，不使用旧 UI 的 capsule/事件触发作为 Run 真相；前端从新原生 Graph 与 RunProjection 出发。

## 3. Delegate 与 Handoff：不同控制语义

| 合约 | Delegate | Handoff |
| --- | --- | --- |
| 目的 | 父任务向子 Agent 委派可描述的工作，父仍持控制 | 指定阶段控制转给允许的 Agent |
| 身份 | 子 Run/NodeAttempt/Effect/Result 均有显式 parent refs | Host 维护可恢复的控制权转移记录、来源和返回目的地 |
| 数据共享 | 默认最小 `task+allowed refs`，可按合同增加 | 仅传移交目标必需且获准的 Context；不默认全会话复制 |
| 权限 | 子能力是父授权与子定义权限交集 | 移交不提升 capability，不绕 Host admission |
| 结束 | 子结果通过等待/Join 交父节点，父为最终 owner | 按合同返回父/后继或走指定 output owner；不自动继承世界提交权 |

Host Run authority 无论 Delegate/Handoff 都不移交。Handoff 必须是受限控制转移而非另一个独立 Agent 引擎。被取消/旧 epoch 的子 Agent 结果仅作为审计证据，不再推动父 Run。更细的可见性传递归 D4。

## 4. Fan-out / Join：确定性屏障

- `Fan-out`：Host 冻结参与的子任务身份、父预算身份、并发和失败策略；每个子任务具有独立可恢复状态/Receipt。队列准入重用既有 NativeTaskScheduler 资源 permits 和原 Compute 预算，不多算钱或绕开父额度。
- `Join`：由 Host 根据**已持久化的分支 receipt 集合**结算。该集合以冻结成员和稳定身份为准，避免只凭网络到达顺序或模型口头结论。
- 可选择的显式策略：
  - **all-success**：全部必需分支成功，否则不得输出 completed；
  - **all-settled**：等待所有已冻结分支达到终结状态，失败/取消亦保留；
  - **any-success**：出现合法成功 receipt 时即可按持久结算顺序关门；并发同时完成按稳定次序定案；
  - **count-quorum**：达到预先声明的有效成功数，未满足时不能虚报法定结果；
  - **deadline/best-effort**：只在输出合同允许 partial 时基于合法已完成结果结算，缺席与未确认项显式列出。
- Join 结算产生固定 `JoinReceipt`、参与分支/采纳结果 refs、部分失败和截止信息。晚到结果不得重写既有 JoinReceipt、Result 或已发布正文；必要时单独开启新尝试/重规划。
- `fail_fast` 是**停止后续派发并申请取消尚未完成工作**的调度策略，不是保证已发远程调用撤销或把已提交的正式操作回滚。

## 5. Planner / Judge / Review：提案、判定、改进分离

- **Planner**：按当前合法任务状态/ResultRefs 提出 GraphPatch、后续依赖与结束请求；没有图直接写权，没有擅自增加模型预算或高风险工具的权利。
- **Judge**：依据受授权、来源当前有效的候选 ResultRefs 输出结构化选择/评分/分歧/依据；输出是评价/选择，不是 DomainCommitReceipt 或 World Truth。独立于确定性 Join。
- **Review**：在具体 Output/NodeAttempt 上提出 `approve` 或 `rerun(targets, reason, evidence)`。
- **局部重做**：只将有因果依赖的、尚可安全重算的节点与其下游失效；世界书/Memory/可信 Result 前置工作若仍在合法版本域内，可复用其结果而无需重跑。产生**新 NodeAttempt 与 EffectId**，旧 Attempt/Receipt/原费用永不覆盖、回退或删除。
- Review 次数与重规划次数计入有界预算；拒绝“重试直到模型说通过”，最终状态如实为 completed/partial/blocked/failed 等受控结果。
- Judge/Review 不能自行写 Native World、Studio 或 Memory。

## 6. 错误分类与耐久恢复

| 已知情况 | Host 行为 |
| --- | --- |
| Effect 未准入/明确未发出 | 按最新权限、source 与预算审核后安全派发 |
| 意图已 durable、外部提交状态不明 | 先通过原 Native Port 查询/reconcile；没有幂等或确证证据时保留 `unknown/waiting_review/blocked`，绝不盲重发 |
| Result/Receipt 已存而未消费 | 按原 EffectId 消费现有 Receipt，不能为“恢复”再执行 |
| Join 已结算、随后分支结果到达 | 不再开旧 Join；新事实只能触发另一个合法尝试/后续决策 |
| Session/Project/Actor/Source 被切换、权限失效 | 当前 run/attempt 标记 stale/暂停，阻止旧结果发布；按照原 authority 决定是否可以重新准入 |
| 用户取消 / 超时 / 进程崩溃 | 保存取消与 epoch，禁止新效果，已有发出/已提交副作用仍记录真实结果；|

- 自动 Retry 只用于已知无副作用、原服务提供明确幂等身份或已确认可以重试的操作；Replan 必须产生可审计的新 graph revision/attempt，而不是默默刷新 effectId 以重复危险调用。
- 运行恢复不等于持久化所有中间模型私有推理文本；RunCheckpoint、RunProjection、Experience 依各自既有信息保留权威区分，不泄露 Secret/Agent 私有信息。
- 在有不可判定外部写效果时保守停下，人工审批也是新的明确授权动作，不是绕过原 domain 写入防线。

## 7. 有界循环、成本与活性

- 对 **steps、节点尝试、新增任务数、图修订次数、Planner/Replan/Review 轮次、edge visits、Handoff/Delegate 深度、并发、总模型和本地工作用量、deadline** 设置来源明确的上限，继承原 Native Compute/RunControl 的子额度与资源许可。D3 不擅自规定数字、金额和 Provider 运行时硬限制。
- GraphPatch 与循环预算/访问累计持久化，不能通过重启、换 Agent 或新建子任务重置父 Run 的已消耗额度。拒绝依赖环、无出口图、无限相同提案或没有前进证据的调度震荡；耗尽时返回 `budget_exhausted/partial/blocked/failed` 的真实状态。
- 合法循环只是有界的重复工作能力，不能为了提高角色文笔默认反复多模型判稿。普通 RP 默认最短的确定性上下文→一次主要 Narrator 路径，出现实质证据缺口/复杂冲突/高影响任务才升级到 Planner/并行/Judge/Review。

## 8. 前端投影与 D4 接口

V3 原生 Graph Editor 配置允许的动态变化和 Review/Join/Output 合同；Run Inspector 只投影 `TaskGraphRevision、active NodeAttempt、各子 Run 的 status、Join/EffectReceipt refs、GraphPatch 拒绝原因、等待审批、实测用量及来源失效状态`。**不使用旧模式名称或旧 Run Panel 状态格式**。

D4 已选择 C2 并冻结 Audience-scoped Context 与通过受控 Result/SourceRef 传播；合法候选域、Narrator/Actor/Task 分离、Disclosure 和跨 Branch 失效详细规则见 [context-sharing.md](context-sharing.md)。本模块只持有 D3 控制流边界，跨 Agent **先授权、后编译、默认最小化** 不变。
