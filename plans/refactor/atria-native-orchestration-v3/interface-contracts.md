# D9 E1 — Native V3 物理接口合同 v1（设计冻结，运行未）

> 2026-10-15 第九轮用户选择 **E1**。本模块拥有 D9 **Plan/Run/Effect/Receipt/Result/Projection 跨层接口的冻结语义与 E0 前置清单**。D1–D8 的业务细则继续引用 [architecture](architecture.md)、[graph-control](graph-control.md)、[context-sharing](context-sharing.md)、[adaptive-compute](adaptive-compute.md)、[effect-authorization](effect-authorization.md)、[narrative-project-quality](narrative-project-quality.md)、[graph-editor-experience](graph-editor-experience.md)；静态旧代码证据见 [e0-audit](e0-audit.md)，工程阶段见 [implementation-plan](implementation-plan.md)。**逻辑边界与 §6–11 的物理合同 v1 已冻结为工程设计，存储表、RPC 未实现，E0 未完成**。

## 1. T2 单 Host、原业务 Authority 与两类版本

- Native Node Host 是**唯一** Orchestration Run/TaskGraph/Effect admission、持久恢复与 checkpoint 的写入者。Browser/桌面/移动只编辑非权威草稿、显示授权投影、提交可信 Host commands；不得保留两套 authoritative Browser/Host runner。
- 作者发布的 `PlanRevision` **不可变**；Run 内 `TaskGraphRevision` 随经 Host 通过的 G2 `GraphPatch` 独立演进。Session/Branch/World/Actor/Studio Project/Model Target 仍各有自己的修订域与 scope proof，不能把它们伪装为同一个“最新全局版本”。
- Host RunLedger 拥有编排进度/节点尝试/待办 Effect 与指向原 Domain receipts 的关系，**不**拥有 World/Session/Studio/Memory/Experience/模型费用/外部 MCP Journal 的业务真相；原 Native Authority 的 CAS、审批与写入回执始终最终有效。
- 零兼容硬切：不读取/迁移旧 Orchestrator preset/settings/IndexedDB Checkpoint/mode/Generator 配置，不用旧 Single/Spec/Agenda/Loop/Director 模式转为新版模板，不保留 `engine-v2`、`legacy-workflow` 或旧 Browser AgentRuntime 的生产双路径；先审计真实共享消费者，再替换/删除相关编排实现。

## 2. PlanDefinition / Draft / PlanRevision

| 合同 | 强制语义 | E0 尚待确定 |
| --- | --- | --- |
| `PlanDefinition` | typed Node/Edge/Port/Agent/capability references、允许的动态图修改范围、Model/Tool/Context/Quality/Output/预算约束及原 source authority refs |作者资源存储归属|
| `PlanDraft` || Draft store/transaction scope、操作历史与离开保护的 Host/UI 最小同步 |
| `PlanRevision` || 发布原子事务、唯一命名/当前 pointer 与原 Studio/Library 生命周期 |

画布几何位置和本地排序不改变图执行语义。

## 3. RunIdentity / TaskGraph / NodeAttempt / Checkpoint

- Run 身份至少绑定稳定 `runId`、Owner/Scope、消费域（RP/Game/Studio）、`planRevision`、原 source/branch/revision anchors、parent/child lineage、Host generation/epoch、不可重置的已使用预算身份与 OutputOwner。各存储域的 revision 需保留原来源。
- `RunLedger` 提供 durable 状态推进、Checkpoint/append events、CAS/fencing；
- `NodeAttempt` 标记独立尝试身份、已冻结当前所需 SourceRefs/ResultRefs、effect refs、前置条件及终态/unknown；重试/局部重做生成新的 Attempt 与 Effect identity，旧花费/审计结果不能抹掉、重新计费或以相同 EffectIntent 再发危险写入。
- 并行 Join（all/settled/any/quorum/deadline）、Delegate/Handoff、Review、bounded loops 原有 D3 权威不重定义；Host 记录 stable participants、JoinReceipt 与决定顺序。迟到子分支/旧 epoch 回调不得覆盖结算/新分支正文。
- 终态与恢复出口需要能说明 completed、partial、failed、cancelled、stale、blocked、unknown、waiting_approval、reconciling 的真实不同语义；
- **不可把**现有 `NativeTaskScheduler` 的进程内 Map 或旧 Browser IndexedDB 当成已经具备 durable RunLedger；原 Scheduler 只提供准入/资源许可与队列协作。

## 4. EffectIntent、Approval 与原业务 Receipt

- 只保存最小脱敏控制元数据，不复制 Secret、原 Tool 全文或 opaque reasoning。
- `ApprovalRequest/Decision` 是独立可恢复状态：可审查谁、什么 target/参数/版本、预算/外发/风险、有限有效期/nonce 与原 user/author permission；
- `EffectReceipt` 记录 not_dispatched/dispatched/confirmed/failed/cancel_requested/stale/unknown/reconciled 的**可证实事实**、外部 operation/task refs、actual/unknown cost、source/provenance 与指向 DomainCommitReceipt 的引用。对已经可能发送而结果未知的外部写入，先查询原 Native/remote status；没有安全证据则等待审查，**绝不盲重发或假称 exactly-once**。
- `DomainCommitReceipt` 由原 World/Session/Studio/Project/Asset/Media 等 Native 权威产生。Orchestration EffectReceipt 是关联证据，不能因为 Tool/MCP/A2A/Agent/Judge 报成功就写正式 World/Project。取消不能自动回滚已提交业务副作用/退款。
- 原 Provider/RunControl/Project Task Compute 账本负责父子原子 reservation/charge/settle/unknown；V3 Ledger 只保存关联 ID/投影而不是第二收费账本，跨 FS/SQLite/外部服务不臆称无证据的单笔分布式事务。

## 5. ResultEnvelope / OutputContract / RunProjection

| 接口 || 消费限制 |
| --- | --- | --- |
| `ResultEnvelope` | producer/run/attempt、typed output/schema、SourceRef lineage、actor/time/branch/revision、currentness/quality/evidence/restriction、partial/unknown | 接收 Agent/Join/Judge/Editor 按 D4 audience 与当时来源重新授权；摘要/缓存/Review 不能洗白私有信息 |
| `OutputContract` | RP Narrator 最终正文、Studio Task Artifact/Review/Command Proposal 等明确 owner 和 target；| 每回合恰一个获准正文 owner，Studio 正式 Commit 仍走原审批，Output ≠ 原业务写入 |
| `RunProjection` | Host 授权 snapshot、稳定 run/scope/epoch/projection version、delta sequence、NodeAttempt/GraphPatch/Join/Effect/Approval/Usage 可见部分 | 客户端接收的是脱敏视图，**不能**从投影恢复或驱动业务 Run；不能泄露 Secret、NPC 私有 Cognition、Provider hidden reasoning |
| `Trace/Diagnostics` | 精确 error/reason/ref/status、原 callback/source/attempt lineage 和实际费用/unknown | Replay/Import 默认只读，不能通过点击恢复历史记录触发新发送/重新提交 |

- UI 的 Timeline 默认/Graph 切换与新 Graph+Inspector 编辑继续沿 D8 和 Serene Canvas；View state 不是 authoritative execution state。
- Node/Run status streaming 要具备快照 + 增量协议、重连/去重/旧 epoch fencing、身份/权限更新；Control RPC 要在审批/长任务等待时独立可用，不能被高成本 Worker 或 Canvas rendering 阻塞。

## 6. 物理落点与存储合同 v1

§12–16是本次R项收口的物理增补，HostOwner、普通RP、Chat输出、ReviewOrigin与SQL失败细节以对应增补为准；§6–11的对象/域边界不另立第二份authority。

本节起为 2026-10-15 在 `main@60aca695726893e298b7d485f300c6efef3b79fd` 上审查后冻结的**可实施工程合同**；不更改 D1–D9，不表示表/模块/API 已存在。前五节保留 D9 语义方向，其中“尚待确定”的物理项由本节对应项收束；实证未完成仍见 [e0-audit §11](e0-audit.md#11-r01r08-设计与实施证据分账)。禁止用下面的新名称注册第二 World/Memory/Model/预算服务。

### 6.1 代码归属与 key

HTTP adapter 在 `src/endpoints/native-orchestration.js`，Browser client 放 `public/scripts/native/`。这些是**未来路径**，本轮不创建。不扩展受 Model/Prompt 类型白名单限制的 VersionedJsonResourceHandler 来容纳 Run，不借用 Provider RuntimeCheckpoint。

所有 key 第一个字段都是 Host 认证取得的 `handle`。

| kind（未来新增） | 其余有序 key fields | doc 与可变性 |
| --- | --- | --- |
| `atri_orchestration_plan` | `planId` | PlanRoot：Draft/authoring revision/current published pointer；CAS mutable |
| `atri_orchestration_binding` | `bindingId` | 精确 source subject 的新 PlanBinding；CAS mutable，禁止旧 preset 映射 |
| `atri_orchestration_plan_revision` | `planId, planRevisionId` | 完整 immutable PlanRevision；|
| `atri_orchestration_run` | `runId` | RunRoot：stateVersion/eventSeq、graph、active attempts/record refs、epoch/limits/progress；CAS mutable |
| `atri_orchestration_record` | `runId, recordType, recordId` | `attempt/patch/join/effect/receipt/approval/result/event/output`；|
| `atri_orchestration_command` | `commandId` |同 ID 不同 payload 冲突|

ID 在原 `identity.js` 扩展 UUID family：`oplan/oprev/orun/onode/oattempt/oedge/opatch/oeffect/oreceipt/oapproval/oresult/ocmd` 加 `_` 和 32 lowercase UUID hex。DraftVersion/stateVersion/graphRevision/eventSeq/epoch 为 nonnegative safe integer，递增不可倒退；recordType 为上述封闭 token。不通过更名映射旧模式/旧数据。

实际物理布局沿既有 Native handler：FS 为 `resolveUserDirectory(dirs,'nativeResources')/<kind>/<nativeResourceFileId(key)>.json`（本组 key 无 sessionId 层）；新增 kinds 必须同步四 Engine 注册、dump/restore/delete、reference/GC/统计覆盖；不得绕 FS Native Journal 用任意文件 write。

### 6.3 Store 支持与崩溃保证的实际边界

| Engine / 当前证据 | v1 必须实现 | 本次真实状态 |
| --- | --- | --- |
| FS：`fs-engine.js` root tail/AsyncLocalStorage；`fs-native-journal.js` prepare→publish→install→ACK，原生 kinds redo | 新 kinds 全走 journal；恢复完才读/ACK；不能在 tx 内等网络/审批| STATIC；V3 注入 NOT_RUN |
| SQLite：`sqlite-engine.js` WAL/FULL、per-handle tail、BEGIN IMMEDIATE | 注册新 kinds、root/record tx 一致、busy/conflict 明确错误；导出/restore 走原 engine closure | STATIC；V3 注入 NOT_RUN |
| MySQL / Postgres：原 Engine transaction 与 Native resources 通用 handlers | 同一合同；注册/dump/restore/删除/引用完整；| STATIC；连接/崩溃/并发 BLOCKED |
| Windows durable-file | 当前 `syncDirectory/Async` 在 win32 明确 no-op；文件内容先 sync 再 rename，目录元数据由 OS 管理 | 不能声称真实断电保证；Windows L2 kill 及 L3 断电语义独立标记 |

不给未测试 Store 默默切换另一 Engine；不支持能力需在 RunAdmission 前明确拒绝，并保留产品完成阻塞。

## 7. 可实施 JSON 对象合同

下表列字段为 required，`?` 代表 optional；可空字段显式 `null`，禁用跨对象猜默认。输入 payload 正文/中间产物通过**原有受权 Task/Artifact/Source**引用保存；必要的 task-local Result payload 可保存在最小的受 scope 保护 result record 中，带 schema/字节界限和有效依赖，不得塞 Secret 或 opaque reasoning。不凭审计编造性能 SLO。

| 对象 | 字段（v1）与不变量 |
| --- | --- |
| `PlanRoot` |ownerRef 为 Host 身份，Draft 不引用旧 preset|
| `PlanBinding` | `schemaVersion,bindingId,sourceSelector,planRef,version,changedBy,changedAt`；planRef 精确钉 revision，缺 binding 不回退旧模式|
| `PlanRevision` |definition 含 nodes/typed ports/edges/agent refs/capability ceilings/graphChangePolicy/limits/outputContract；immutable|
| `SourceBinding` | tagged union：Session 使用原 sessionId/branchId/revisionId/scopeEpoch；完整嵌入原 `sourceRef`、`sourceAuthority` 与 bindingDigest；不是同名全局 revision，不为普通 RP 伪造 Session|
| `RunRoot` | `schemaVersion,runId,ownerRef,planRef,sourceBinding,parentRef,rootRunId,budgetAuthorityRef,hostBootId,epoch,stateVersion,graphRevision,eventSeq,status,graph,attemptRefs,pendingEffectRefs,pendingApprovalRefs,resultRefs,outputClaims,progress,limits,retentionPolicyRef,createdAt,updatedAt`；parentRef 含 parentRunId/nodeAttemptId/delegationId/返回合同或 null；不保存真实余额 |
| `NodeAttempt` | `schemaVersion,runId,nodeId,attemptId,attemptNumber,epoch,graphRevision,inputState,reservationRef,inputRefs,inputDigest,sourceBindingDigest,effectiveGrantDigest,budgetRef,status,effectRefs,resultRefs,startedAt,endedAt,reasonCode`；prepared/reserved封闭union见§17.10；替换 attempt 不覆盖旧记录 |
| `GraphPatch` |operation tagged union `addNode/addEdge/setPendingPriority/cancelPending/markBlocked/requestFinalize/requestReplan`；重复相同 patch 返回原结果|
| `JoinReceipt` | `schemaVersion,joinId,runId,nodeAttemptId,graphRevision,memberAttemptIds,policy,quorum,deadlineAt,cutoffSeq,acceptedResultRefs,excluded,reasons,outcome`；membership 在 fanout 时冻结；成功不足不可 complete，迟到不能改收据 |
| `EffectIntent` |`risk=R0/R1/R2/R3`；dispatchPolicy 含 `idempotency=none/domain_key/remote_key`、真实 operation key、`reconcile=domain_status/remote_status/manual`；拒绝虚构第三方幂等能力|
| `EffectReceipt` | `schemaVersion,receiptId,effectId,runId,observedEpoch,observationId,outcome,dispatchEvidence,remoteOperationRef,domainReceiptRef,budgetObservationRef,resultRefs,sourceRefs,observedAt,reasonCode`；append-only，不能覆写旧 unknown；|
| `ApprovalRequest` |等待态可持久，nonce 原值只送可信交互通道|
| `ApprovalDecision` |`approve/reject`；一次使用与 Effect ready→dispatching 同事务标 consumed；Boot 改变旧批准失效|
| `ResultEnvelope` | `schemaVersion,resultId,runId,producerAttemptId,outputType,outputSchemaRef,payloadRef,sourceRefs,dependencyDigest,audienceConstraint,disclosureConstraint,qualityRefs,status,createdAt`；`complete/partial/unknown/unavailable`；接收方独立重新授权 |
| `OutputClaim` | `schemaVersion,claimId,runId,nodeAttemptId,outputKey,sourceBindingDigest,resultRef,consumerRef,operationRef,status,domainReceiptRef`；原 consumer 使用稳定 operationRef；同一个 source turn/variant/output slot 恰一合法 owner；仅 runId 去重不足以防两个 Run 双正文|

Run status：`admitted/running/waiting_approval/reconciling/blocked/completed/partial/failed/cancelled/stale`。`unknown` 是 Effect/Result 的知识状态；Run 有 unknown effect 时通常 `reconciling/blocked`，不能标完成。Effect status：`prepared/ready/dispatching/confirmed/failed/not_dispatched/unknown`；cancelRequested 单独布尔/事件，不能代替真实结果。

### 7.1 Graph/循环/父子物理约束

- GraphRevision 从 0 开始；patch 整体通过后加 1；不得新增/替换 active/settled effect 的输入。`graphChangePolicy` 与每个节点 kind/typed port 采用封闭 schema，拒绝动态可执行 JS/predicate；条件只用受控表达式或 deterministic handler。
- `progress` 持久记录 steps、attempts、patches、replans、reviews、delegates、handoffs、edgeVisits、loopIterations、depth、高水位 deadline；相同规范化提案+相同合法输入 digest 无新证据时拒绝无进展循环。墙钟 deadline 不是 World Tick。
- Delegate 先在同一 tx 写 parent delegation record 与 child root，生成 child grant intersection、budget reservation ref，commit 后才排队。Handoff 另存 control token/entry/return/terminal 条件；Host owner 从不移交。Join receipt 在父 CAS 内以持久 decisionSeq 结算，不能被网络到达顺序或重启重开。
- Review 重做仅创建新 attempt 与依赖闭包失效记录，不能删除旧 DomainReceipt、消费历史预算或已结算 Join。正式 output 若已提交，只能原领域明确的新版本/纠错命令，不能自动覆盖。

## 8. 原预算/发送与恢复协议

### 8.1 唯一 authority 与必要扩展

E0审计时：`RunControl.charge/chargeCompute/settleCompute` 持原 Session bank；Project 由原 `ProjectAgentService` / ProjectTaskRepository 持有 compute；`native-compute-budget.js` 的 `reserve` 仅是mandatory allowance headroom。当前三个原bank已接BudgetPort；GenerationHost的可信`execute(...,{orchestrationSend:{bank}})`用Effect/ordinal稳定身份发送及结算，普通RP上下文来自原ChatRepo，公共input不能注入bank。现存Session generationBudget lane与此入口组合明确拒绝，不能绕过角色/后台限制。工程实证边界归§17.15及同一Record，V3不得再造另一套charge。

| 方法（未来） | 输入/返回 |
| --- | --- |
| `reserveChild` | `{authorityRef,parentReservationId,childRunId,ceiling,expectedVersion,commandId}` → 原 ledger `{reservationId,version,ceiling,status}`；同父原子收紧，不发模型 |
| `admitAttempt` | `{authorityRef,reservationId,effectId,attemptId,inputFingerprint,upperBound,requiredHeadroom}` → 原稳定 `budgetAttemptRef`；相同 identity+input 返回同记录，不同 input 冲突 |
| `observeAttempt` | exact authorityRef/attemptId → charged/settled/unknown/not_dispatched 的真实记录；不得通过重复 charge 推测是否成功 |
| `settleAttempt` | `{attemptRef,observationId,usage,provenNotDispatched}`；可信实际 usage 或 unknown，上界占用不自动释放；结算幂等 |
| `releaseUnused` | 只释放证明未派发的余量；已派发 unknown 不退款；child 关闭不重置父 spent/highWater |

子额度不是第二收费；原 ledger 内 `reservations` 形成 parentId→childRunId 的 allocation tree，attempt 精确引用 leaf reservation，根范围汇总一次 actual charge。父可用额度扣除所有未结算占用；子不能借新 Run/GraphPatch/Branch restore 增加根额度。缺可信金额价格/cap 仅 estimated，不承诺金额硬封顶。

需要将稳定 attempt identity 从 V3 通过**受信内部调用**送到 GenerationHost 的真实每次 provider send/fallback；公共 Browser 不得自行提交/覆盖 budgetAttemptRef。每次实际 fallback/retry 都有独立 attempt，仍关联原 Effect/sub-send。无来源 budget authority 的普通 RP/自定义任务返回 `native_orchestration_budget_unavailable`，不能创建 V3 私有资金库或伪装 Project/Session。该域实现策略已由§13固定；实际接入归P3，当前NOT_RUN。

### 8.2 跨权威 saga 与崩溃窗口

不把 Engine tx 跨越 Provider 网络或另一个领域事务。顺序固定：

1. Host tx 创建 `prepared EffectIntent` 与稳定 attemptId/参数/审批 binding，durable ACK；此时禁止 Port send。
2. 原 BudgetPort 原子准入同 attempt，持久返回 budget ref。崩溃在两 store 之间：由 observeAttempt 查回原记录；没有查询证明就 blocked，不能重复扣费/发送。
3. 3.审批若缺/过期仍等待，不长期占 scheduler permit 或写锁。
4. Host tx CAS `ready→dispatching`、consume 精确 approval、生成 dispatchToken 并 commit。**dispatching 表示可能发送，不能证明已发送或未发送**。
5. 业务提交仍用原 idempotency/operation key；Host 不把 token 当跨第三方 fence。
6. 原 Domain/Provider 结算真实 charge/receipt，Host append immutable EffectReceipt + 更新 root/Result。若 Domain 已提交而 Host 未记录，恢复按原 operationRef 查询，不能重做正式 mutation。

| 崩溃位置 | 唯一安全恢复 |
| --- | --- |
| prepared 前/Host commit 失败 | 不发送；command outcome 未知先查 command，不凭前端超时新建同动作 |
| prepared 后/budget 调用中 | 用稳定 attempt 查询原 bank；无证据则 blocked |
| ready 且无 dispatch claim |不能因 Boot 改变沿用旧 Approval|
| dispatching 后/网络前或后 | 统一视为可能发出，query/reconcile；无幂等/status 则 unknown/manual，不能从“没 receipt”推断未发送 |
| receipt/Domain commit 后/ACK 前 | 返回原 command/effect/domain receipt，不再执行 |
| 取消/旧 epoch/迟到 | 不派发新效果；迟到数据交当前 Host 只追加 correlated observation，不允许旧 worker 直接更新 root/Output；真实已发生费用和业务事实仍保留 |

外部 R3/任意 Host code 若无原受控 sandbox/authority，拒绝而非“先允许再测”。当前内置 MCP 保持既有受限能力；A2A 有 taskId 时 get/status/reconcile，无 taskId 不重发 SendMessage。独立 MCP Plugin lease/journal 只作原 action receipt ref，不把它注册成 V3 内核。

## 9. RPC / Projection /可信审批

新 HTTP namespace 为 `/api/native/orchestration`，复用现有 Express/auth/CSRF/boot/read-only/error adapter；现有 `native-generation`、Session、Studio API 仍是对应领域权威。以下路径是本轮合同，**当前 main 不存在这些 endpoint**。全部读操作也用 POST 以匹配原 Native router 惯例，`Cache-Control:no-store`。owner/handle 从 `request.user.profile.handle` 取得，不接受 body 授权主体。

请求 envelope：`{schemaVersion:1,commandId?,expectedHostBootId?,body}`；mutation 必有 commandId + boot header + 本对象 expected versions；返回 `{schemaVersion:1,hostBootId,commandId?,outcome,refs,versions}`。同 commandId 同规范化 payload 返回原 outcome/ref，相同 ID 不同 payload 409。GET/SSE 非必需；v1 采用有界 cursor long-poll，断联只终止观察请求，**不取消 durable Run**。

| POST suffix | 关键 body / 权限 |
| --- | --- |
| `/plans/list`, `/plans/get`, `/plans/revisions` | owner/source scope；分页 cursor，不返回未经授权内容 |
| `/bindings/get`, `/bindings/save` | exact sourceSelector/planRef；save 带 expectedVersion（首次 null），原 source authority 授权后 CAS，不接受旧 preset/bindingSubject 别名 |
| `/plans/create`, `/plans/save` | definition/dependencyPins/viewState；|
| `/runs/start` | exact planRef/sourceBinding/outputContract/budgetAuthorityRef；不能由客户端指定 grant/epoch/spent |
| `/runs/observe` | runId/cursor/limit；返回 snapshot 或 deltaBatch；断联无自动 cancel |
| `/runs/cancel` | runId/expectedEpoch/expectedStateVersion/reason；持久 cancelRequested、fence 新 dispatch；不伪造远端撤销 |
| `/runs/resume`, `/runs/reconcile` | runId/expectedEpoch/expectedStateVersion；current authority 重审；unknown 不可通过 resume 强制重发 |
| `/runs/diagnostics`, `/results/read` | exact refs + current audience；仅授权投影、分页；trace replay/import 无执行权 |
| `/approvals/get`, `/approvals/open-review`, `/approvals/reject` | 主origin仅脱敏待办/launch ref/拒绝，不返回decision nonce、不接收approve；原拟`/approvals/decide`不实现，具体Review Origin路由见§15 |

GraphPatch/Effect/DomainPort 不作为 Browser 任意调用 API 暴露；Host 内部 `proposeGraphPatch`、`dispatchEffect`、`claimOutput` 统一经过 controller。作者通过 save 新 Draft 修改未来 Plan，不能从 UI 修改 active Run graph。

Projection：`{schemaVersion,runId,projectionId,hostBootId,epoch,projectionVersion,visibilityDigest,seq,cursor,kind,payload}`。snapshot 自包含授权 Run 摘要/当前 graph refs；delta batch 带 `fromSeq,toSeq,baseProjectionVersion`，重复 seq 丢弃、缺口/旧 projectionId/epoch/visibilityDigest 变化则清旧视图后重新请求 snapshot，禁止拼接不同授权域。projectionVersion 是该 view 合同版本，seq 是该授权 projection stream 的连续序号，**不是内部持久 eventSeq**。cursor 为不暴露内部位置的 opaque token，Host 以有界非权威订阅 Map 关联内部 eventSeq；断线/重启或 cursor 失效只重取 snapshot，不由此恢复 Run。隐藏事件不递增该客户端可见 seq；对无权限用户不暴露内部计数、私密节点数量或错误详情。payload 禁 Secret、nonce、opaque reasoning、未获准 NPC/Result 原文；审批实际参数通过本人受控详情另取。

审批真实性边界（Review Origin接线唯一见§15；主origin不接收approve）：认证 owner 会话 + CSRF + allowlisted Origin + expected boot + 一次 challenge nonce + 精确 binding + 原领域批准是最低条件，不能只收 `confirm:true`。模型、Tool、插件Runtime SDK不获得Review Origin的`/review/decide` capability/nonce；请求展示和决策通道须独立受控，R3 要使用原领域能提供的更强身份/交互保护。**同 origin 已获任意 JS 执行权的恶意扩展无法仅凭 CSRF/isTrusted 被彻底隔离**：没有受信 UI/重认证隔离证明，相应 mutation/R3 保持 blocked，不能在本审计虚构平台原生批准通道已存在。消耗与 dispatch claim 原子化。

映射 400/401/403/404/409/422/503，错误不含私密值；原领域失败保留其 `domainCode` 和 safe refs，不转换成假成功。

## 10. 保留、GC、备份与恢复

- PlanRevision 被任何 Run/Evolution/publication/authoring ref 钉住时不可删；Run root、未消费审批、dispatching/unknown Effect、未结算 budget attempt、正式 Output/DomainReceipt ref 是保留根。未知不是过期后可随便删除的缓存。
- 不另设 V3 自动回收站/存储中心；按现有 Session maintenance 的 generation+reachability+CAS 方式向原 Storage/Reference/GC authority 注册 V3 refs。scope 失效可以停止执行/收紧可见性，不能删除正式业务真相或造退款。terminal 且已 reconcile 的控制元数据按显式 retentionPolicyRef 收缩，缺配置默认不自动 GC。
- 账号 backup/restore 包含受管新 kinds，恢复后增加 Host epoch、所有旧批准失效，Run 进入 blocked/reconciling；导入历史 Run/Projection/Trace 不能自动发送或以 restored budget 退款。保留原 RunControl/Project high-water 与正式收据，检测账本回退无法证明时拒绝恢复执行。
- Session `.atriasave` 不是 V3 Run 的迁移格式；Save/fork/restore 必须让原 SourceBinding 失效，V3 不随其复制活动 Run/approval/预算额度。删除来源对象前原 authority 能看到 V3 references 或明确退休阻塞；不借 V3 GC 越过原完整闭包/回收站政策。
- 首版不提供活动 Run 跨设备续跑或跨 Engine 的无停机迁移；原账户备份/迁移服务仍按其业务合同运行。真实恢复、GC、四 Engine 一致性仍 NOT_RUN/BLOCKED。

## 11. Product Binding、Evolution 与原 Domain Ports 的最终衔接

最终自审补足一个实际缺口：旧 API 不只有“运行 preset”，还有 `get/setPresetBinding` 与 Evolution publication；如果新合同只定义 Plan/Run、却没有原生 Plan 选择与发布指针，Settings/消费者仍可能回读旧配置。因此本 v1 使用第六个 `atri_orchestration_binding` kind（§6），由同一 Native PlanRepository 管理，不另建 preset/settings 系统。

### 11.1 新 Plan 选择与 Evolution 目标

- `sourceSelector` 采用原 SourceAdapter 的稳定 subject（普通 RP 的精确 chat/character/group 身份、Native Session 的精确 session/entry subject、Studio 的 project/task subject），source currentness 的 branch/variant/revision 仍在 RunAdmission 再验。不作隐式父级选择。用户自行选择新 PlanRevision，**不从旧 preset/settings 自动生成 binding**。
- Run/start 必须提交 exact planRef；有产品绑定的自动入口从受权 PlanBinding 取该 ref，并钉 `bindingId/version`。缺/过期/无权/无原预算 authority 返回 blocked；不能 fallback 旧 mode 或创建假 Session。原用户本轮手动明确选择的 Plan 可不持久设为默认，但同样需原 source grant。
- Evolution 新目标物理 union：`{kind:'plan-prompt',bindingId,expectedBindingVersion,planRef,nodeId,promptModuleRef}` 与 `{kind:'plan-strategy',bindingId,expectedBindingVersion,planRef,nodeId,fieldPath}`。前者只指原 Native exact PromptModule；后者首版允许原 graph 合同内的 `reviewPolicy`、`limits`（自动候选只能收紧）、已获准的 exact `routeRef`。不开放任意 JSON path、capability/output owner/source grant/Secret 修改；增大额度或改变风险授权须新的原 authority 许可。
- 原 Skill/Project targets 仍在各原 service。原 evaluator/报告/promotion/price/usage 权威不另建。
- Prompt candidate 由原 PromptCandidateStore/版本化资源 authority 产出新的 exact module ref；PlanRepository 发布**新的** immutable PlanRevision，最后 CAS 对应 PlanBinding。跨 store 使用原 Evolution publication journal 的阶段/operation refs 做 reconcile；新 module/Plan 已创建但 binding CAS 失败时记录冲突/保留候选，不覆盖用户并发变更，不假称跨 store 原子。
- 原 Evolution rollback 只能在 publicationCurrent/精确 CAS 仍成立时将 binding 指回获准旧 **V3 PlanRevision**（或发布合规的新修订），不修改正在运行的 Plan，不回滚已消费预算/DomainCommit。这里的旧 V3 revision 是新原生版本历史，绝非旧 Orchestrator 数据兼容。旧 workspace target 的历史 publication/报告只读，不能自动映射新 target 或重新赋予发布资格。
- Evaluation RP adapter 接受 frozen `planRef/sourceBinding/budgetAuthorityRef`、通过同一 Host Controller/Port 执行；worker 只持受限任务/证据，不载入旧 Director/Skill Resolver，不拿 Secret/生产 writer。`evolutionEvaluatorRevision()` 指纹列表替换为新 Controller/Contracts/Ports/Plan target 及仍有效原服务内容，原报告对新 evaluator 不合资格，不能靠保留旧文件维持旧指纹。

### 11.2 原业务 Port，禁止第二 writer

这些是 Orchestration 内部受信 adapter 方法，**不是 Browser 新增万能 mutation endpoint**。

| Port / 真实源码 authority | v1 内部调用合同与结果 |
| --- | --- |
| `ContextPort` → 原 Native Context/Information/Hybrid | `compile({ownerRef,sourceBinding,audience,taskPurpose,grantDigest,inputRefs,tokenBudget})` → 原 Context plan/evidence refs/currentness proof；不另造 compiler/Memory|
| `ModelPort` → GenerationHost/RouteResolver/GenerationService | `generate({effectId,attemptId,sourceBinding,routeRef,contextRef,outputSchemaRef,budgetAttemptRef,dispatchToken})` → 原 response/routing/actual attempt/usage refs；预算 identity 仅由可信 controller 注入，每次实际 sub-send 关联原收费 |
| `ToolPort` → 原 SessionPublicWork/Skill/MCP/A2A/Native action authority | `execute({effectId,dispatchToken,actionRef,targetRef,inputRef,sourceBinding,grantDigest,approvalRef,budgetAttemptRef})`；`observe({operationRef})` / `requestCancel` 走原领域；returns confirmed/not_dispatched/unknown+原 operation/receipt refs，不以 Tool 文本决定正式事实 |
| `NarrativeOutputPort` → Native SessionCore/RunControl 或原 ChatRepo | `claimAndCommit({outputKey,sourceBinding,resultRef,operationRef,expectedSourceDigest})`；Session 复用原 commitId/expectedRevisionId；Browser 只呈现已获准输出，不能在 Host 之外再发独立 assistant commit；没有原 consumer 幂等/查询证据则 blocked|
| `ProjectOutputPort` → ProjectAgentService/ProjectTaskRepository/StudioService | `submitForReview({projectId,taskId,baseRevision,resultRef,changeSetRef,operationRef})` → 原 review/task receipt；正式 `commit` 仍由原 Author/Review 用户命令与 Studio CAS 执行；Run completed 不等同 Project 已修改 |
| `EvaluationPort` → 原 Experience/Eval/Evolution | `evaluate({case/profile/source refs,planRef,targetPin,budgetAuthorityRef})` → 原带身份/费用/provenance 的 report ref；publication/rollback 原 service 控制，不通过 Result 直接写 Plan/World |

原源对象更新后，新的 SourceBinding 由原 authority 回执给下一节点，不能由模型、Browser 或 RunLedger 自增虚构世界 revision。若 Narrative/Project consumer 的正式 commit 成功但 EffectReceipt 丢失，只查原 receipt；找不到确证时停 unknown。C02 的旧 `host.commitAssistant` 产品路径在 P6 删除或改为纯显示，不允许与 Host OutputPort 双提交。

## 12. R02/R07 — Host Owner 与四Engine的确定实现策略

本节将§6.2的“需实现排他”收束为工程选择，归原 `src/storage` 生命周期与 `src/server-main.js` / `src/server-startup.js`，不是V3私有锁服务。**以下是设计，不是已运行结果**。原生持久化协议继续复用现有Engine/Journal/Native CAS。

### 12.1 本机data root的存活期Owner

- 本地FS/SQLite支持范围为同一OS网络命名空间内的本地可写data root；这里的root包括原Engine实际使用的`directoriesByHandle(handle).root`，不能只锁外层工作空间路径。不把共享网络文件系统、跨容器共享root、多设备同目录当成本机保证。若环境无法确认该范围，拒绝可写编排，不默默绕过排他。
- 原Storage启动在root建立一次性的 `native-host.identity`：`{schemaVersion:1,instanceId:<random UUID>,guardAlgorithm:1}`。首次通过exclusive-create写入并sync；其他进程只读取同一文件，部分写/格式损坏即启动失败，不生成备用identity。经realpath的别名、Windows大小写路径仍必须读取同一个root内identity；正常boot/配置端口变化不更换它。它是原Storage控制元数据，不含用户内容/Secret，不是RunLedger。
- 同一Node Host在任何Native恢复/写入/发送前，以IPv4 `127.0.0.1` 绑定这个固定端口，`exclusive:true`，禁用port reuse/cluster共享；**端口冲突就writer_unavailable，禁止换端口试到成功**。监听器不提供HTTP/API或批准能力，只接受后立即关闭意外连接。
- 这是同一Native Host进程持有的OS资源，进程退出由OS释放，不靠可过期PID文件抢占。原应用HTTP listener不是替代，因为两个进程可能配置不同HTTP端口。
- 首次切换产品真实root前，P6必须按e0-audit §8.1核实旧Host/Browser worker已停；P1–P5只在隔离测试root证明新机制，旧writer无法确认退出则P6禁止切换。
- 从备份恢复的identity可能与本机其他独立副本冲突，拒绝启动并显示原Storage诊断；不得在活动状态自动换identity绕过。不同root对同一SQL数据库还必须通过§12.2的数据库Owner排斥。单Host保证针对遵守原Storage协议的Atria进程，不把拥有OS写权限的任意恶意程序纳入可隔离范围。

原理依据：[Node v24.18.0 net.listen](https://nodejs.org/download/release/v24.18.0/docs/api/net.html#serverlistenoptions-callback) 定义独占句柄/端口复用行为；

### 12.2 SQL Owner 与持久fence

| Engine | 原Engine内确定的Owner机制 | 必须维护的边界 |
| --- | --- | --- |
| FS ||不把Map当跨进程锁|
| SQLite || 所有同root的SQLite文件沿原storage layout；不另开绕过Engine的连接执行V3写入 |
| MySQL |只接受返回1| 锁名称按数据库实际名称产生，不按URL别名/连接配置名；连接异常后不自动取新连接继续原owner |
| Postgres |实际database内所有Atria表writer共用同一key| 必须是session lock，不能用事务结束即释放的lock；禁止transaction-pooling代理丢失session身份后仍声称持锁 |

MySQL会话级命名锁可跨commit保留且会话结束释放；Postgres也提供会话级advisory lock。依据 [MySQL 8.4 locking functions](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html) 和 [Postgres 17 advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)。这些锁是协作机制，不替代持久CAS或原领域权限。MySQL多primary/NDB、未知代理拓扑或无法证明session固定的部署先明确拒绝可写编排；

原Storage新增领域控制kind **`atri_host_fence`**，key `{handle}`，doc `{schemaVersion:1,generation,hostBootId,ownerInstanceId}`，由Engine Owner取得后CAS增加generation。每个handle先完成fence发布再允许它的Native写入；跨进程旧boot的写入失败；callbacks只能交当前Host按correlation追加观察。

`atri_host_fence`归原Storage控制域，**不计入§6的六个Orchestration metadata kinds**，与下节原RunControl域扩展一起纳入原Native key/handler/backup/GC注册。FS使用原Native Journal，SQL沿现有native_resources；不引入独立Owner数据库。

不能声称epoch会撤销已经发往第三方的请求；新Host绝不因“旧Owner没返回”重复派发同一未知effect。

### 12.3 SQL重试与commit未知

当前MySQL/Pg `withTransaction` 外围会重试transient error。V3及上述原领域扩展必须在原Engine提供 `withTransaction(...,{retryMode:'known_rollback_only'})` 选项（默认旧调用行为不在本任务无关改写）：

1. tx closure只做本地确定性存储，禁止Provider/Tool网络、等待审批、生成新的随机业务identity；commandId/attemptId/operationRef在进入closure前固定。
2. 开始前、或能够证明事务已rollback的deadlock/serialization失败可按原策略重试；
3. `COMMIT`已发出但ACK丢失不是已rollback。返回 `storage_commit_unknown`，不重跑closure；新连接先查同command/attempt/原domain operation receipt，匹配即返回原结果，不同payload冲突，数据库仍不可观测则保持reconciling。
4. “暂时没查到”只有在原Engine确认旧事务已经结束、读取主库当前状态、原operation存在性/唯一键均可证明时才能视为未提交；不能从read replica或网络超时推断未发生。无法证明则unknown，不自动重新收费/发送。
5. MySQL/Pg新kinds、HostFence、RPControl、CAS、持久command outcome、dump/restore/delete/ref roots同合同注册。凭据/连接只影响P1/P3/P7真实证据，设计不依赖本轮启动数据库。

FS/SQLite的提交ACK-loss同样查询原identity；物理掉电/硬盘或Windows目录元数据行为未实测则不声称硬件保证。合同承诺可测试的软件崩溃恢复、检测到损坏时拒绝、未知外部结果不盲重放；不把无条件“所有断电永不丢失”变成不可实现的E0前置。必要硬件声明在对应P7证据不足时不作出。

## 13. R03 — 普通RP接入原RunControl与父子预算

### 13.1 唯一预算authority的来源分派

现有 `run-control.js` 的key固定sessionId；GenerationHost当前在Session/Project间取source，没有普通rp_chat持久bank。**仅写“没有bank就拒绝”不足以完成普通RP产品设计**。本轮确定扩展原RunControl本体（同模块/共用native-compute-budget、原GenerationHost），不在`orchestration/`内造收费服务。

| source domain | budgetAuthorityRef | 原本体的存储/权限 |
| --- | --- | --- |
| Native Session | `{authority:'run_control',domain:'session',sessionId,operationId}` | 原`atri_run_control`与Session原revision/turn/高水位 |
| Studio Task | `{authority:'project_task',projectId,taskId,operationId}` | 原ProjectTaskRepository/ProjectAgentService的compute |
| ordinary RP | `{authority:'run_control',domain:'rp_chat',controlId,operationId}` | 原RunControl新增**`atri_rp_run_control`**，key `{handle,controlId}`；|

RPControl doc：`{schemaVersion:1,controlId,sourceIdentity,locator,sequence,generation,operations,retiredCompute,outputReceipts,restoreState}`。`controlId`为原Native identity扩展的`rpctl_<32 UUID hex>`。原ChatRepo在用户首次新V3绑定/开始操作时，CAS写入当前chat header的`chat_metadata.nativeControlId`，原RunControl初始化对应受管Native record；只有二者匹配才准入，部分初始化可按同controlId补齐但不发送。**这是对当前原生来源身份的新增管理，不读取/转换旧Orchestrator设置、preset、checkpoint或运行数据。** 既有合法聊天历史/sourceId保持不变。

sourceIdentity固定原source主体与Host分配controlId，locator只是当前位置。原ChatRepo rename保留controlId并更新locator；clone/fork按原业务创建独立身份并暂停活动Run，不能复制活动approval/预算余额。导入带重复/未注册controlId或来源无法唯一证明的资料先拒绝并按原导入review处理，不能把外来header当authority。对source预算的已花金额/attempt和retired totals继续由原RunControl保留，rename/variant/Run restart/图重做不清零。恢复导入不自动增加额度或启用发送；原ledger回退不可证明时保持restoreState=review_required。

Host从当前ChatRepo/SourceAdapter取得，客户端不能指定任意旧来源。相同input operation派生的父子Run引用同根bank；RunId、childId和GraphRevision变化不新建根授权。真正新用户输入/明确的新任务可以由原RunControl依现行route policy建立新operation，其真实消费仍计入原owner/领域的持久累计，不能把它描述成旧费用退款。

GenerationHost增加受信内部 `sourceBinding` 的rp_chat分支，复用原RouteResolver/GenerationService/SecretPort/Context链；公共Browser不能自己提交已授权context或budgetAttemptRef。缺合法source、缺原route compute policy或RPControl尚未就绪时拒绝，不能回旧Browser runner、伪造Session或不计费发送。现有只支持Session/Project的HTTP接口不接受被伪装的RP输入；新controller内部adapter完成严格分派。

### 13.2 reservation tree与真实attempt的唯一结算

- 每一原bank只保留一个compute总账；根授权R的容量分解为`remaining(R) + delegatedCapacity(R) + committedOrUnknownSpend(R)`，其中delegatedCapacity只计子树尚未花费的已分配容量，committedOrUnknownSpend含整棵子树的实际/未知占用，每个attempt只出现一次；子delegation只是根内部转拨。对任一reservation，`自身已用/未知占用 + 未花子额度 + 自身可用`不能超过其授权ceiling；
- `reserveChild`在原bank CAS内从父remaining转拨给child；child再次委派从自己的remaining转拨。leaf发送将remaining原子转为稳定attempt的上界占用。未花额度可返父，已dispatch/unknown占用不可释放；settle后可信actual低于上界的差额才回原reservation，超出上界记实际费用/overrun并阻止新admission，不能截断usage伪造守限。
- fallback/retry ordinal在Host/原Model attempt记录中CAS递增后才能准备下一send。相同attemptId+input fingerprint幂等返回原charge，不同输入冲突；观测/结算按同identity，不在GenerationHost里重新randomUUID生成第二charge。
- 原GenerationHost在真实send边界负责**唯一一次**`admitAttempt`；两次相同幂等调用不是两笔费用；未dispatch时不能因单次network fail重新产生ordinal，除非原effect retry policy允许并且旧结果已reconcile。
- 所有原bank变更受§12 Owner/fence/原Engine CAS保护；预算变更ACK未知先observe，同parent sibling不能分别读余额后各自放行。对未知gateway内部重试/价格无可信上界的费用标unknown/estimated，保留能证明的占用，不声称货币硬封顶。

此处新增的是原RunControl域一种存储key和source adapter，不是第七个Orchestration metadata kind；W04/P3必须把Session/Project/RP三种bank分别跑V04，未跑保持NOT_RUN。

## 14. R04 — 普通RP正式Output与跨FS边界

当前 `ChatRepo.append` 按`extra.gen_id`去重但不保证相同ID对应相同payload，FS `chat`不在Native Journal的原生kind集合中。**不能**在同一FsEngine tx里混写chat+V3/RunControl记录后宣称跨资源原子。确定采用原ChatRepo的单chat提交 + 原RunControl receipt reconcile，不新增聊天writer。

### 14.1 原ChatRepo方法合同

outputKey按exact input turn/message+variant+slot产生，同一key跨Run争用归同一个原domain输出事务，不靠V3 RunRoot自己判断唯一正文。

1. operationId由原authority按outputKey固定，同key不同payload冲突；同identity重复请求只查询原结果。正式源版本/variant/玩家输入不得由Output改写。
2. 在独立的原RPControl Native事务里CAS `prepared→writing`，返回仅本次成功转移者持有的执行permit。此时不持有chat事务/写锁；已经writing的调用只能observe，不获得第二个permit。崩溃恢复不从marker缺失推断未写。
3. 获得该permit后进入原ChatRepo对应chat队列/Engine事务，先查现有domain marker；不在chat事务里调用另一个RPControl事务，不嵌套不同authority的原队列。
4. append/替换variant各按原用户操作的target，不创建第二正文；使用原完整chat原子写路径或已经证明等价的原incremental journal，正文和marker不能分两次写。原FS writer按durable-file barrier补齐其软件崩溃保证；不能因原writeFileAtomic函数存在就声称此新协议通过。
5. Host随后写EffectReceipt。正常ChatRepo读编辑保留Native控制字段，客户端payload不能伪造/清除marker；

### 14.2 明确恢复窗口

| 持久事实 | 原authority处理 |
| --- | --- |
| writing，marker缺失/不完整/用户已编辑删除来源，或chat损坏 | unknown/conflict等待原用户review；不自动重发/补写，即使可能这次实际尚未写入 |
| committed receipt存在，当前chat后来被合法改动 | 返回历史receipt与currentness分开；不以历史receipt覆盖现在内容 |
| SQL chat+RPControl | 可以在原Engine同tx完成时采用原子路径；否则同样用上述saga，不降低FS共同语义 |

Evolution PlanBinding、candidate、publication/rollback沿§11原journal/CAS合同；

## 15. R05 — 可信审批的隔离交互合同

§9的普通Browser `/approvals/decide` 不再作为允许批准的主origin接口；主origin只可创建/获取**脱敏待办或launch ref**、拒绝/取消，不可返回可批准nonce或接收approve。本节是现有S2 Host Gate的跨origin可信输入adapter，仍是**同一个Node Native Host、同一ApprovalRequest/Decision记录和原用户authority**，不是第二批准服务/权限库。

### 15.1 受控Review Origin

- 同Host启动一个仅回环绑定的review HTTP(S) listener，使用与主app不同的origin（包括端口），资产只有产品内置review页面/脚本/经过白名单的设计tokens。监听端口由Host实际绑定后生成launch URL；它没有Run/Tool/模型/通用文件API，不能成为另一个运行Host。未配置该路径则对应approve unavailable，不能反向代理到主app同origin冒称隔离。
- 主app拿到的launch ref只能定位待审请求；Review Origin仅提供`POST /review/reauthenticate`、`/review/details`、`/review/decide`及内置静态页面，认证成功后才发一次性decision nonce到自己的页面；这三个路由不挂在主app origin。**cookie不按端口隔离**，必须显式忽略主app cookie，不能把不同端口本身当cookie隔离。
- 不新增用户表/保存密码副本，输入密码不进入V3 Context/Record。
- 不开CORS，不嵌入frame，不载入Browser Runtime Extension、用户脚本、任意CSS/第三方资源。安全详情所有来源文本按纯文本编码，不能由Tool描述注入控件。沿原tokens的安全值呈现视觉，不把主app高级CSS带进批准origin。
- 主页面打开review用noopener，Review本身也通过COOP断开跨origin opener；不接受postMessage或URL参数提供的decision/“用户已点”。

原理来源：[HTML Standard 的 origin / browsing context隔离](https://html.spec.whatwg.org/multipage/browsers.html#same-origin)；固定HTTP localhost只适用于同设备浏览器；LAN/远程路径必须沿原可信传输配置安全origin，缺失就不可批准，不泄露nonce/凭据到不可信网络。

### 15.2 保证范围与默认拒绝

同源主app里的模型/低信任脚本/Runtime Extension无法通过主app的普通HTTP调用读取review origin的nonce或签发approve；cross-origin表单/fetch、frame/opener、错误origin/跨用户都要有负例。SOP/COOP不隔离已获浏览器全站权限的恶意浏览器扩展、OS级键盘记录或同进程任意Host代码；这些不因新增review页面成为安全沙箱。

R0及已有精确policy ceiling覆盖的R1/领域窄操作可按D6自动准入；必须批准的R2/R3只有实际review通道+原域授权齐备才执行。任意shell/Host JS、未经保护插件执行和无原域安全机制的R3默认不注册为V3能力，真人点approve也不能绕过原policy ceiling。已有远端MCP/A2A允许的受限动作保持原范围；未知非幂等结果按§8.2查询/人工review，不用另一个EffectId重复同操作。

P5实现真实Review Origin后才开放需要批准的产品动作；P7三端/远端/恶意输入实测。

## 16. R01/R06 — 动态消费边界与UI工程出口

R01设计闭包限定在已锁定main的tracked源码/资产/路由/设置/API；C01–C18、两个附件覆盖静态可定位消费者。计算加载器/外部安装内容不伪称已全解析：新Host不注册旧API/模式/scope，不提供旧静态资源执行入口；依赖旧API的外部代码明确unsupported。

R06技术基线冻结为现有ESM/DOM与单Draft reducer；手机List/Inspector覆盖完整编辑，桌面必须实现D8的可交互Graph。若目标规模实测不满足，再在同一Draft/View adapter后选择现有Cytoscape候选，不能引入第二Draft/SPA或用只读预览替代Graph编辑。哪个backend通过、具体节点规模/帧时延/内存阈值归P5实测后记录，不是待选产品方向，也不需要E0先完成PoC才能获准写PoC。

未测性能/浏览器安全/协议/硬件只声明真实保证级别；当前所有这些V3实证NOT_RUN/BLOCKED，设计闭合不把其改为PASS。

## 17. P1 authoring schema实施细化（2026-10-15）

实现`a4d7b42e1`新增纯共享`native-orchestration-contracts.js`及Host PlanRepository。Definition使用封闭nodes/typed ports/edges/entryNodeIds/capabilityCeiling/graphChangePolicy/limits/outputContract；每edge显式maxVisits，每node kind独立policy白名单，所有node须从入口可达且有唯一Output路径。

Plan create/save/publish、PlanBinding和command outcome沿原Engine同事务CAS；本组测试显式fake原authority，仅证明仓库合同，未接生产HTTP或外部Effect。六个编排kinds与原HostFence/RPControl已自动进入四Engine通用Native handlers；SQL Owner、全站writer fencing和GC引用仍须后续P1接线。

### 17.1 Draft与RunLedger的P1工程约束

Draft持久保存允许结构完整但图语义尚未完成（如未连边、无Output owner）的作者草稿；未知schema字段/可执行policy仍拒绝。RunRoot补充显式`cancelRequested:boolean`（与Effect knowledge state分开）；事件从seq0的admitted开始，与Root和command outcome同事务。

P1 RunRepository start仅接受受信原authority admission回传SourceBinding和budgetAuthorityRef；V3只持引用，无余额/收费。beginAttempt写pending身份/输入digest/原grant与budget refs，不是dispatch。

### 17.2 恢复generation与原批量事务

RunRoot新增`hostGeneration`，精确保存原Storage HostFence.generation，与单Run的epoch分开；同Host内恢复也必须使旧generation失效。原cross-mode restore完成后经原Storage lifecycle停止该handle准入/drain并退休cached fence；下一Native事务发布更高generation，旧Run只能经recover进入blocked/reconciling。原SQL delete/restore共享同一fence行锁；restore的清空+流式导入为一事务，采用`retryMode:never`，不重放已消费流。已ACK的rollback可保留当前Owner；COMMIT未知仍不可猜测。目标HostFence不删除、不从来源dump覆盖。

原Storage root adapter在Windows用DriveInfo拒绝UNC/映射网络盘，Linux/Android采用明确本地FS类型集合；未知/shared/网络或无法证明namespace独占的root不开放。枚举依据：[Microsoft DriveType](https://learn.microsoft.com/en-us/dotnet/api/system.io.drivetype)、[Linux原始magic.h](https://raw.githubusercontent.com/torvalds/linux/master/include/uapi/linux/magic.h)，不是设备通过证明。

### 17.3 G2控制事务与Patch实现细化

RunRoot.nodeControl保存每node的`disposition:eligible/blocked/cancelled,priority,reasonCode`，不复制NodeAttempt执行状态；progress新增edgeVisitCounts，每edge累计与总edgeVisits相等且不能恢复清零。内部RunRepository.control只给受信Host controller使用，禁止挂任意HTTP/SDK dispatcher；同事务CAS更新Root/typed record/event/command，身份、原authority、Plan capability/output/limits不可改。

内部稳定command identity由operation+原控制对象ID推导，逻辑payload去重不把临时CAS读取版本当新动作；返回replayed信息只作为本次事务是否新提交的回执，不能从旧command回执再次取得发送许可。Rejected proposal也受原step/deadline限制；相同producer/input/evidence的无进展提案不能换PatchId重置工作。

### 17.4 Effect/Approval核心的P2实现细化

EffectIntent补充hostBootId/hostGeneration、capability、requiresApproval、budgetEnvelopeDigest；它们来自必填原authority Port，模型proposal不能自报risk/grant/egress/approval。claim同Root CAS消费批准并写dispatching/token；仅新成功事务回执返回本次token，旧command重放的顶层及outcome token均置null，COMMIT未知不生成第二发送许可。

ApprovalRequest/Decision也钉住hostGeneration。nonce原值仅属于可信Review Port；主origin没有approve路由。

Receipt按稳定observationId追加，不覆盖unknown或矛盾历史。模型或Browser成功Boolean不构成证明。矛盾已知观察进入unknown/reconciling；取消后的真实迟到事实可关联追加，但不能改已发布Output/Result或生成退款。终态Run换Host只更新控制fence/审计，不重新启动。

### 17.5 Attempt结算与确定性Join的P2实现细化

`NodeAttemptReceipt`沿原`atri_orchestration_record/receipt`保存，封闭字段为`schemaVersion,receiptKind:'node_attempt',receiptId,runId,nodeAttemptId,epoch,graphRevision,sourceBindingDigest,inputState,inputDigest,outcome,resultRefs,effectReceiptRefs,decisionSeq,reasonCode,createdAt`。receiptId由Run+Attempt稳定推导；Attempt终态、不可变收据、Root/event/command同事务，不能靠可变status伪造分支成功。普通settle拒绝Join/Output节点；已准备或未知Effect未结清时不能终结Attempt。

新增`ojoin_*`身份，沿原`record/join`分别保存`barrier:<joinId>`和`joinId`：前者是不可变`JoinBarrier`，后者是不可变`JoinReceipt`，不是新metadata kind或独立存储。Barrier字段为`schemaVersion,joinId,runId,fanoutAttemptId,nodeAttemptId,epoch,graphRevision,memberAttemptIds,memberEdges,fanoutFrameRef,sourceBindingDigest,parentBudgetRef,policy,quorum,deadlineAt,frozenSeq,createdAt`；稳定joinId绑定Join Attempt。`memberEdges:[{nodeAttemptId,edgeIds}]`冻结每个最终成员到Join的直接输入边；多步分支冻结最终成员的reserved身份，不跳过中间任务。独立核心测试尚可由必填原membership Port提供分组证据，生产原Scheduler仍须实际Frame/完整scope准入，不得借null免检。冻结事务只接受同epoch/source的pending或reserved分支，已启动成员与冻结竞态必有一方拒绝，不能补录进旧屏障。原Scheduler permits/真实父子预算仍归P3。

JoinReceipt在§7字段上增加`epoch,barrierDigest,memberReceiptRefs,edgeAdmissionRefs,decisionSeq`；cutoffSeq是本次决策前已持久Root.eventSeq，decisionSeq=cutoffSeq+1。有效成功按成员不可变收据的decisionSeq/AttemptId稳定排序；any-success取首个，count-quorum取前quorum个。partial不计成功配额；all-success有失败不能complete，all-settled等待全部或显式deadline；不满足部分输出合同则failed。deadline只采纳不晚于冻结deadlineAt持久化的合法Result，截止后但结算前入库也排除。收据列明未结算、失败、未采纳与迟到成员。

重放、并发settle和已提交回执丢失只返回同一结算，晚到分支不能重开旧Join；取消/恢复epoch也不能消费旧屏障。未完成分支仍保留实际身份/收据，不借Join失败声称远端取消或退款。P2当前使用受控原Port证据，不代表ResultEnvelope/Context/Scheduler或Domain Consumer已完成。

### 17.6 原Storage维护入口与Engine交接

`NativeHostOwner`按参与的原Engine保留生命周期；每个Engine先停止准入/drain/关闭，再释放自己的参与引用。预期退休临时root不会误判为Owner丢失。原`nativeHostLifecycle.attachStorageEngine`在同一Host内附接迁移destination/replacement，不创建第二Host。该缓存只避免同Host重入，并不证明未知proxy/multi-primary拓扑安全，也不把不同配置别名自动合并。

原HTTP存储迁移以`withMaintenance`暂停source外部准入，排空已有事务后才copy；维护许可限本次async scope，不传播成后续通用权限。失败恢复source准入；全员copy成功先退休source，再附接新live Engine并关闭old/destination，read-only覆盖整个copy/swap。更高原Storage generation使旧fence失效；

原`storage-migrate`、`audit-storage-names`和密码恢复CLI在`initUserStorage`前取得同一dataRoot Owner；前两者原Engine也接生命周期。名称审计不重写业务资源名，但原Engine bootstrap/recovery可能写控制元数据，故要求离线互斥。内部Evaluation/Studio scenario/transient-source的独占临时根仍是原Host受控scratch，不把这些raw Engine扩展成外部Run/发送权威。

### 17.7 本地卷探测的相邻平台边界

Darwin分支使用内置`osascript`执行固定Foundation代码，canonical path只作为argv，不拼入脚本或shell；读取`NSURLVolumeIsLocalKey`，未知/远程/失败都writer-unavailable。依据[Apple本地卷属性](https://developer.apple.com/documentation/foundation/urlresourcekey/volumeislocalkey)与[原NSURL resourceValuesForKeys:error:](https://developer.apple.com/documentation/foundation/nsurl/resourcevalues%28forkeys%3A%29?language=objc)，不是实机通过证据。目录创建/realpath/OS探测错误统一同一unavailable出口；

所有适配都要求运行期间挂载/文件系统与OS network namespace保持受支持的本地独占条件；只查本地FS类型或volume属性无法证明任意共享块设备/跨namespace安全。当前真实测试环境为Windows 11 Pro `10.0.26200`、Node `v24.18.0`；Darwin探测代码、CachyOS与Android/Termux均尚无真实客户端/本地卷实测，保持NOT_RUN/BLOCKED，不以Foundation规范或Windows测试替代。

### 17.8 同步Storage Center后的原权威组合

`main@73557f809`已有原Storage Center：`account-quota`、recovery roots/lifecycle、account file writer、SQL account locks与TransactionScope。V3复用这些实现，不建立第二份quota/回收站/事务组合服务；Model/Prompt原可重入write authority仍只在提取的runtime-write模块一份定义。原account bytes quota与D5 Compute费用银行职责不同。

调用顺序为Host Owner/StorageFence→原quota/recovery business transaction→原Engine commit；有界基础fence在业务quota之外初始化，使零quota仍可观察/回收，业务Plan/Run/command增长照常服从原quota，同事务拒绝不留碎片。原quota的SQL account lock和FS/SQLite account file publication也纳入同一Host admission/drain；不能在Owner之前建SQL schema或发布文件。quota wrapper传递原retryMode，COMMIT未知不因account unlock失败变成可重试网络错误；损坏连接不归还pool。原account lease有open范围，脱离旧async scope的任务重新取得准入。

同类SQL备份复用数据库Owner，但私有scratch handle不是原用户账户：converter用同Host附接的原Engine实现和严格scratch目录，不扩大getUserDirectories/原账户quota语义。结束后清自身scratch rows/fence、关闭私有Engine并释放临时root，live Owner继续持有；SQL dump不输出HostFence，restore不覆盖目标fence。真实用户原领域收据/数据仍沿原备份恢复协议，不能借此恢复旧Orchestrator执行权。

同步后的局部实证归同一Record；新增原服务不使未知SQL topology/跨namespace或P3–P8自动通过，也不以现有Storage回收闭包替代V3原Source/Result/unknown引用根的后续审计。

当前SQL未知拓扑拒绝实现见§17.13；

### 17.9 有界依赖转移与显式回边

未发布v1工程schema的每条edge补充required `loopBack:boolean`；删除所有显式回边后必须为DAG，且每个回边须闭合一条正向路径并有非零maxLoopIterations。不能仅填上限就隐式允许未标记环；

成员排序后的Run+bindings+reservedAttemptId稳定推导command/新Attempt/receipt身份。每个producer必须有同epoch/source的不可变NodeAttemptReceipt，edge须指向同一合法target，required input connections齐备且success/failure条件匹配；partial不当success。Join由自身屏障控制器结算，已发布Output不成为普通转移producer。

inputDigest绑定实际引用。新pending Attempt、`receiptKind:'graph_transition'`不可变收据、Root/event/command同CAS；收据钉producer receipt refs、各edge累计、loopIterations及decisionSeq。step/attempt/edge/deadline与显式回边计数先限额再准入。maxLoopIterations的物理累计含每次marked back-edge crossing，从环中间入口开始也计数；恢复不清零。

generic beginAttempt仅创建该node第一次准备身份；已有历史必须走受控transition/后续Review或recovery controller，不能换commandId绕开重做/循环计数。普通prepare不等于合法activation；Fanout/Join统一边计数、父子Run/预算和原Scheduler准入仍须对应P2/P3子工作，不以本控制器替代。没有生产HTTP dispatcher或真实发送。

### 17.10 多步分支的身份预留不等于输入准入

Fanout冻结多步分支时，最终成员的实际上游Result可能尚不存在。为避免伪造input/grant/budget，NodeAttempt增加封闭`inputState:'reserved'|'prepared'`与`reservationRef:null|{producerAttemptId}`。reserved必须绑定当前原Fanout/scope许可，inputRefs/inputDigest/effectiveGrantDigest/budgetRef均显式null，effects/results空、未started；仅允许reserved/blocked/cancelled/stale，不能activate、claim或产出成功Result。不是默认允许的占位输入。

内部`AttemptController.reserve`以Run+producer Attempt+node稳定身份，在Root/record/command同CAS预留一槽，计入attempt/step高水位；Join Barrier可冻结这些身份；后续prepare不能换成员ID。槽位已计不再重复加attempts。相同请求重放不能擦除已准备输入，改变绑定也不能覆盖prepared成员。

只有尚未prepared的reserved输入可按合法GraphPatch补依赖，prepared/终结快照保持冻结。取消未准备成员追加inputState=reserved、inputDigest=null的取消收据，禁止伪造结果、费用或退款；Join按未完成/取消事实结算。NodeAttemptReceipt保留inputState；source/epoch不匹配拒绝准备。完整Host调度、隐式入口组及原scheduler/budget tree仍在P2/P3继续，不以预留身份冒充这些能力完成。Transition/Join共享边计数见§17.11，显式Fanout及嵌套控制见§17.12。

### 17.12 显式Fanout Frame、成员继承与逻辑并发

Fanout/Join是确定性控制节点，capabilities必须空；它们的被动running不占执行资源并发槽，step/deadline/edge计数仍照常累计。因此单槽父Run与嵌套分组不会被等待中的Fanout自身堵死；实际执行许可仍需原NativeTaskScheduler，不在V3另造队列。

`FanoutController.freeze`在Run同CAS接收`fanoutAttemptId,branches:[{entryAttemptId,memberAttemptIds,scopeNodeIds}]`，排序后的内容绑定稳定command；所有即时出边须由实际entry覆盖。Entry为真实prepared且未启动的Attempt，最终成员可prepared或reserved；scope必须为已存在非Output节点，member在同scope内从entry可达。范围未知、已启动成员、截断即时分支、过期source/epoch或超限均拒绝整组。原始入口输入编译、隐式根分组、动态scope准入与真实Host scheduler仍需P2/P3接线，不把generic beginAttempt当生产依赖准入。

`FanoutFrame`沿原record/receipt不可变保存，封闭字段为`schemaVersion,receiptKind:'fanout_frame',receiptId,runId,fanoutAttemptId,epoch,graphRevision,sourceBindingDigest,parentBudgetRef,branches,maxConcurrency,failurePolicy,edgeAdmissionRefs,decisionSeq,createdAt`；ID由Run+Fanout Attempt稳定推导。出边准入、Frame/成员关系、Root/event/command同事务，edge tickets沿§17.11复用，ACK丢失/重放不双计。并发为min(Node policy,Run ceiling)。

成员关系也是原record/receipt中的不可变`fanout_membership`，字段为`schemaVersion,receiptKind,receiptId,runId,frameId,nodeAttemptId,epoch,sourceBindingDigest,decisionSeq,createdAt`；ID由Run+Frame+具体Attempt推导。初始entry/最终成员在freeze绑定，后续Transition从producer继承仍包含target的冻结scope，嵌套freeze也继承外层组；按真实Attempt票据计数，避免同名节点的后续尝试误占旧组。成员关系不含货币余额、Scheduler lease或Context正文。

effect prepare/claim重查fail_fast，已ready兄弟Effect也不能在失败后领取发送claim。不声称远端已取消/费用已退。已发Effect的迟到真实收据继续append，unknown仍需原Port reconcile。continue保留失败但不阻断其它分支。

### 17.14 SQL导入的原Host与私有命名空间退休

原`materializeTransientSource`的SQL路径必须得到原`hostLifecycle`；缺失时在ZIP解包/schema访问前拒绝，不能退回raw Engine。原CrossModeRestore和Persona backup preview传递当前Engine的生命周期；相同SQL类型和独立scratch DB都创建原Engine实现的私有converter，附接同一Host Owner之后才ping/schema/restore。只允许本次随机`_xrestore_<hex>`handle，dirs严格指向其私有root，不调用真实账户目录fallback或quota。原URL声明按§17.13传递，不从导入内容授权。

独立scratch配置补充`mysqlNativeHostTopology`/`postgresNativeHostTopology`；原HTTP parser接`scratchMysqlNativeHostTopology`/`scratchPostgresNativeHostTopology`，或只对完全相同的原config URL复用已核实声明；CLI同规则。不同endpoint未重新核实则unknown。原认证/CSRF/账户/restore权限继续生效，部署声明不替代这些权限或可信Effect批准。

原生命周期附接选项增加`privateHandle`，仅接受隔离restore身份，所有准入handle须精确匹配；普通账户Engine无权退休HostFence。最后原Engine close才释放root参与引用。

FS.deleteUser保留文件树，SQLite.deleteUser关闭DB，均不是对象已删除的证据；残留Native资源必须阻止上述退休。该内部退休只服务已声明私有namespace，不改变真实账户fence永久保留规则。SQL cleanup确认成功并close后才删本次私有root；Owner/提交/close未知保留本地现场，不把失败cleanup当业务退款或远端撤销。原scratch GC仍有自己的既有文件保留窗口，SQL orphan不会在启动时被擅自全库清除，需原诊断/运营处理；不另建回收站或清理服务。

本节现有证据为Windows FS/SQLite原生命周期/备份/恢复与无DB的SQL拒绝反例；实际SQL导入/正常清理/故障窗口仍BLOCKED/NOT_RUN。不能以本接线宣称全部raw Engine消费者、V3未知Effect保留根或P1/P7已通过。

### 17.15 原Native Compute子额度树与Session持久接口

全部实现放在原`native-compute-budget.js` / `run-control.js`，不在Orchestration复制银行、价格或存储服务。原compute ledger增加可选`reservations:[{reservationId,parentReservationId,consumerId,limits,status:'held'|'released'}]`；现有其它Native业务不需迁移，旧Orchestrator数据不进入该合同。v1结构上限为32个reservation，沿现有compute记录的有界存储尺度；不得把它说成Provider价费或用户设备能力硬上限。父引用必须指向本记录先前reservation，无环/无孤儿；身份与consumer/limits绑定，重放不重新持有已released额度。

`reserveComputeChild`在原bank CAS里转拨剩余容量；`releaseComputeChild`只在直接子额度均released、子树全部model/local实际attempt已settled时释放未用容量。charged/unknown均拒绝释放，费用行和实际用量不删除。limits包含requests/tokens及可选local jobs/items/inputBytes；纯local子额度可为0 model requests/0 tokens，不伪造模型调用。每个真实attempt只在原attempts/localWork数组一行，以可选reservationId归属叶或父自身；

任一scope满足`已用/未知上界 + 尚未花费子额度 + 自身可用 = ceiling`（发生overrun时明确超出并阻止新准入）；未知tokens沿原estimated上界占用，可信total实际低于上界才释放差额，实际高于上界完整保存/传播overrun，不截断观测。自己的工作不能抢已held的子额度。拒绝操作使用候选副本，不向持久holder留下半个reservation/attempt；这只是原bank事务的纯reducer，不是另一个真相副本。

Model attempt增加可选`inputFingerprint`；同身份同输入返回`replayed:true`和原charged/unknown/settled事实，不再收费；不同输入冲突。此回执不是发送permit，不证明Host已按§13.2从EffectId/ordinal派生ID；后者仍须真实GenerationHost接线。既有strict charge保留冲突语义，所有新旧原bank charge都保护已held子额度；有reservationId而缺local budget明确unavailable，不能借原其它Native无预算路径变成V3免计工作。

原chargeLocalWork转交reservationId。新准入严格绑定当前branch/revision，换Source不能以重放名义再准入；审计observe与迟到settle仍可按原operation身份保留费用真相。未关闭reservation使原operation留存，不能被换HEAD的压缩抹去；关闭后原retiredCompute只累计一次实际费用/本地工作，未复制银行或费率。

当前三个原bank、BudgetPort与GenerationHost稳定send已有FS/SQLite隔离实证，详见同一Record W04/P3第二至第五组。没有新增Browser/插件预算dispatcher，也未向真实Provider收费。合成HTTP/隔离存储不能替代实际账单或完整P3 Gate。

### 17.16 P3原Source、Effect与Audience的接线边界

SourceBinding冻结`sourceAuthority/sourceRef/sourceRequest/budgetAuthorityRef/bindingDigest`，RP额外绑定实际发送的完整聊天prefix digest。它是内部Host组合，尚未开放HTTP万能dispatcher。

GenerationHost在真实sub-send前完成原budget admission，再通过可信`beforeSend`提交同Effect的ready/claim，只有fresh claim持token；预算ACK未知时只`observeAttempt`同identity并抛reconcile_required，查到charged也不返回第二份发送permit。模型与local work分别使用providerSendOrdinal/localWorkOrdinal typed ref，在同原bank结算；子Run不能使用null或兄弟reservation。

`ContextPort.compile(handle,{ownerRef,sourceBinding,audience,taskPurpose,grantDigest,inputRefs,tokenBudget})`复用原Session Context/Information/Actor编译，`provider(handle,{context,source})`直接提供实际RequestContextPlan；当前仅Session有原受控Audience compiler；Project/RP不可借默认宽上下文替代，缺原adapter明确拒绝。受控grant callback测试不证明Plan/父子Run领域授权已完成；Hybrid实际检索、跨Agent Result及语义泄漏质量仍需各原authority实证。

### 17.17 P3原Tool协议与恢复授权

`ToolPort.execute(handle,{runId,effectId,dispatchToken})`由Host读取持久action/target/input，不能接受Browser提供的新动作或批准。权限/原route预算只能取交集。`observe`只查原operation；`requestCancel`仅原本地scheduler，远端取消是另一Effect。

原`RunControl.externalTask`的可选typed `orchestrationBinding={schemaVersion,runId,effectId,sourceBindingDigest,grantDigest}`不可移除或换绑。重启后原A2A独立reconnect/cancel不得靠旧Session policy续用此授权，当前明确拒绝并要求新Effect。它不是新的task registry或预算kind。原MCP/Skill现有完成证明与持久Effect观察闭包见§17.24，缺原proof/receipt仍unknown；A2A受理事实的精确持久闭包见§17.21，不能把受理升格成远端任务完成，任何未知都不能自动重发。R3/需要批准的动作在可信Review与原动作authority接通前保持unavailable；Project/RP没有原消费者时保持拒绝。

### 17.18 P3原恢复/GC对费用与来源的保护

原Session删除与maintenance GC读取同Host的Run/Record保留引用，纳入generation/quarantine proof；没有正式释放authority时终态与历史unknown也保留。不以保留根提升孤立revision的读取权限。SQL fallback现按稳定key cursor遍历余页；这不构成大数据集IO/性能实证。

原Session/RP账户恢复先保留本地原bank，再暂停为review_required；旧备份不退回当前实际/unknown成本和held allocation，新generate/write等待原可信review，status/真实迟到settle仍可用。原Native merge与replace一样可能覆盖同key：存在V3 Run/Record保留历史时三种mode全部在破坏目标数据前返回`native_orchestration_retention_review_required`（HTTP409）。该拒绝不是自动合并闭包、批准恢复或review解除实现；恢复/保留释放的完整产品支持仍需后续原authority工作，不能把安全拒绝记作完整V09通过。
### 17.19 P3子Run、原银行确认与整树逻辑界限

内部`DelegateController.delegate`只接受已运行且有agent.delegate能力的父Attempt、精确已发布childPlanRef、冻结inputs/grant/returnContract/budgetCeiling。子Plan能力不得超过父Plan及具体父节点，冻结limits不提高父限制；原authorizeDelegation须同时返回allowed、父/子有效grant、sourceBinding及budgetCeiling的精确digest，且实际adapter还必须证明父Plan允许该childPlanRef。没有原authority adapter不准入；测试受控callback不是产品授权实证。

childRunId稳定派生parentRunId+parentAttemptId+delegationId；父委派收据、不可变parentRef和未funded子Root在同Host事务落盘。parentRef冻结父epoch、绝对depth、inputRefs/inputDigest、grant、returnContract、原bank分配上限budgetCeiling及logicalCeiling。随后在Host事务外调用原BudgetPort.reserveChild，reservationId=childRunId、父reservationId=父Run本身或root null；预算ACK未知只观察同identity，不能重分配、生成第二子身份或重发。

未确认预算不得begin/activate/dispatch；子模型发送不得使用null/兄弟reservation。父任务在Effect fresh claim之后取消也必须阻止真实HTTP。

RunRoot新增required `treeProgress`，保存本Run及后代累计steps/attempts/patches/replans/reviews/delegates/handoffs/edgeVisits/loopIterations及绝对depth/deadline高水位；`progress`仍为本Run本地图计数，尤其edgeVisitCounts只属于本图。child parentRef.logicalCeiling冻结创建时的祖先剩余上限并不超过child Plan；兄弟仍共享祖先总量，不因各自拥有相同快照而多出容量。这些是D3有界控制流的逻辑成本，没有货币余额、价格或Secret/Memory内容，不是第二compute bank。

所有命令先取不可变祖先链，再沿原withNativeResourceWrites统一排序锁定全部祖先；child/ancestor/command/event的成功或回滚是同一事务。重试/重放不重复增加，GraphPatch、edge admission等原控制路径也通过该入口，不为委派另写一套相同计数器。

SourcePort在Host事务内不得等待原Session RunLock或Project/Studio writer queue，以免领域writer等待Engine而死锁。Session用原assertRunAccess(tx)纯读；Project用原ProjectAgent.observeComputeSource和Studio.observeRevision读取既有Git HEAD，不repair/init/history写入。

这些内部接口尚未对应Run/Binding/Projection产品HTTP；批准通道、正式领域grant与P4 consumer仍按原阶段继续。
### 17.20 D3委派允许集合的精确Plan pin

没有新Plan存储或授权服务。

携带`agent.delegate` capability的可执行node，其policy必须显式含`allowedPlanPinIds:[]`；每项须是该node.dependencyPinIds中port=plan的精确pin，无重复。空集合禁止委派，缺字段的旧形态直接invalid，不以缺省allow-any兼容。Planner不能凭请求childPlanRef或callback allowed扩大该集合，原scope/能力交集继续必需。

这不使capability ceiling变成grant，尚未接原authority的capability继续unknown。exact pin的发布依赖是已存在的不可变revision；字段属于D3既有委派边界的物理收口，Context/audience等独立缺口没有借此假称完成。
### 17.21 A2A原持久受理事实与Effect观察

类型为a2a_send_accepted。binding精确关联run/effect/epoch/source/grant/input/endpoint/budgetEnvelope/typed budgetAttemptRef，并保存原request/response fingerprints、task或message响应种类及实际local attempt IDs。acceptedReceipt写入后不可移除/换绑。它仍是原服务的记录，没有新metadata kind或第二writer。

`A2aService.acceptedObservation(handle,{operationId,sessionId,anchor},{tx})`是历史事实纯读，不发网络、不要求fresh send claim。没有runs/effect/proof则unknown，不相信caller提供的accepted布尔值。

reasonCode=a2a_send_accepted，resultRefs=[]、domainReceiptRef=null。task响应为WORKING也可证明已受理，绝不表示远端Task完成、正文可消费、World/Memory写入、再次发送或远端取消/回滚获准。source移走/权限过期后可以保留历史事实，旧独立reconnect/cancel继续拒绝。invalid/lost/cancel或未持久receipt仍unknown；本地ACK丢失仅经原持久查询有证据后解除。MCP/Skill现有完成证明范围见§17.24，不能据此授权消费正文或确认正式业务提交。

带V3 ownership的原externalTask不再按TTL删除，所属原operation不因Source推进而被压缩；原非V3 TTL继续。产品HTTP和完整领域grant装配仍未由此开放。

### 17.22 原预算的精确来源明细保留与稳定local work

原model/local费用行增加可选`orchestration:{kind:'provider_send'|'local_work',effectId,ordinal}`；唯一原shared helper由该元组生成既有稳定attemptId，不更改冻结ID命名空间。BudgetPort内部生成标记，不接受caller在attempt上填写自报来源；

GenerationHost的真实local work由原sendBank.nextLocalWorkAttemptId生成Effect+local ordinal，原charge与settle使用同一个ID；provider send保持独立ordinal。local准入COMMIT ACK未知与模型一样只observe同identity再报reconcile_required，不能重复执行local operation或派发Provider；重启bank从ordinal0重放明确拒绝。

Session/RP原operation在存在这些来源明细时保留，原retireComputeLedger拒绝提前聚合它们；即使root没有child reservation、费用状态已unknown或settled，Source前进后也不丢attemptId，允许迟到实际结算。没有新账本/价格表。原非V3 unknown汇总规则不变；正式释放明细的authority尚未交付，不自动清历史或退款。

### 17.23 原三域Plan Binding产品接口

实际POST路由为 /api/native/orchestration/bindings/get 与 /bindings/save；read/mutation envelope及HostBoot沿用原Plan authoring，精确字段见[后端整合入口](backend-integration.md#2-实际已挂载的-http)。不保存Draft引用。

生产authoring factory复用原SessionCore.observe、Studio.observeRevision、ProjectAgent.observeComputeSource、RpRunControl.status及同tx的原Chat header读。Session精确sessionId和非null entryPointId；RP必须是注册controlId且实际locator header仍声明同ID。原get服务按认证handle读取，不相信Browser owner；

Binding仅是用户的Plan选择metadata，不授予Actor/Model/Tool/Delegate运行能力，也不自动启动Run。nullable entryPointId/taskId沿原selector合同，不成为通配执行许可。Run/Projection/Approval产品路由尚未开放。本组FS/SQLite真实原服务/CSRF/CAS/读写fence测试与三项守卫变异见同一Record第十三组；该当组新矩阵SQL未运行，后续实际四Engine证据见§17.28。

### 17.24 原MCP/Skill完成证明与唯一EffectReceipt

ToolPort的内部effects必须指向同一ExecutionService.effects；64槽短命private Map只关联本次proof，不是持久journal或新authority。

后者绑定冻结Run/Effect/epoch/boot/source/grant/egress/input/budget decision和typed admission。原BudgetPort重读每条稳定local ordinal/provenance/reservation及settled/completed状态；只有这些实际原证据通过，现EffectController.observe才写同一既有immutable EffectReceipt/RunLedger。

原HTTP client拒绝非boolean isError。list/pin/catalog不因本组升级为可确认副作用；R2/R3和可信Review门槛不变。

save前退出/无proof/未结算明细保持unknown且不重发；save后ACK未知只查相同确定receipt，不重复写或Tool调用。cold observe只读已有receipt且必须匹配当前confirmed/failed intent；较旧confirmed与当前矛盾unknown不能升格。撤权或矛盾均拒正文，历史事实与当前可消费权限分开。未取得真实部署/完整产品scope证据不算P3/P4 Gate通过。

### 17.25 最终实际请求与逻辑Effect输入分离

原bank每条attempt.inputFingerprint绑定实际最终请求，两者不假设相等。不增加request record、不把完整prompt或snapshot复制到RunLedger。正文与Secret继续归原服务，D6最小metadata边界保持。

Host只在原GenerationService.beforeSend私有closure捕获已含compiledBinding的最终snapshot；返回snapshot对应最后成功实际send，不能沿用首次render诊断。

真实GenerationSend路径始终提供此参数；

### 17.26 可发布机制证据与运行grant分离

原RouteResolver按固定role.narrator读取原Model/Connection/Prompt/Generation/资源闭包、能力及路径证据。其他node角色、缺机制、未使用的cap ceiling或未接能力仍unknown，invalid/stale依赖不能发布。不为此读取Secret、render、发送网络、收费或创建Run。

生产router用原getNativeGenerationHost提供的原persistence/library/providers构造原RouteResolver，只读复用原服务，无新模型实现或价格表。

这一证据仅表明可解释、精确且有原预算策略的原Narrator机制，不提供Session/Actor/Task/Source/Tool/Delegate权限。真实固定Native Turn producer、每次send/consume Scope、原bank及Effect授权仍必需；当前它们未完成的部分继续IMPLEMENTATION_PENDING，不把可publish误显示为“运行已获准”。后续增加域或fallback须以其原producer/pin/grant实证扩展，不能将此有限reader改成所有capability默认supported。

### 17.27 原RunControl稳定准入与原角色/后台配额同CAS

原RunControl.charge的role/turn/background/window/period计数提取为唯一chargeGenerationQuota helper；原charge继续调用它。内部admitCompute(handle,snapshot,anchor,limits,attempt,options={},quota=null)的quota封闭为{request:{role,background,anchor},policy}，复用原assertGenerationBudget，并与原Package policy精确相等。foreground只接受原branch/revision anchor与narrator/intent_resolver；background保持原invocationId counter operation，compute仍在同root turn bank。没有第二账本或两次先扣后准入。

quota或compute拒绝都在唯一原control发布之前回滚。后台原window/period及highWater不变；真实pending outbox对原counter保留规则不变。quotaOperation是实际原计数归属引用，不是grant。

原provider compute行新增可选generationQuotaRef={operationId,role,background,policyDigest,anchorDigest}，仅RunControl从上述内部quota生成，拒attempt自带此字段。同stable identity不能换role、后台anchor、policy或移除/新增quota后重放，返回quotaOperation来自已持久原行。明细是原bank原计数的关联metadata，不保存余额/价格或第二套quota事实。

该底层本身不提供producer，也不向HTTP开放quota。固定Narrator的Host私有身份与实际quota接线见§17.29–§17.30；其他角色/后台未接路径仍拒绝。精确底层反例、冷重开及原quota回归见同一Record第十七组，当组新矩阵SQL未运行，后续实际四Engine证据见§17.28。

### 17.28 原usage结算的跨JSON存储幂等

原shared settleComputeAttempt/settleLocalWork对已settled usage按封闭合同字段逐项比较，不用JSON字符串字段顺序判定费用是否相同。model核inputTokens/outputTokens/totalTokens，local核wallMs/cpuUserMicros/cpuSystemMicros/cpuScope/outcome；

该修正由真实Pg JSONB重排行键导致同usage第二次settle冲突发现，并由FS/SQLite本地usage入参换字段顺序复现。原quota/冷重开/ACK未知/拒绝回滚及settle矩阵现已在真实FS/SQLite/MySQL/Pg共45case通过；

### 17.29 真实Native Narrator生产组合与ModelPort

本节记录第十九组初始有限范围；authority candidate、实际编译计费和Scheduler active permit的当前扩展归§17.30。

原NativeGenerationHost生产工厂安装NativeNarratorOrchestrationAuthority；原turn/turn-start入口在排程、Stage或World工作前读取实际Binding。优先精确entryPointId，只有确实不存在才用同Session的null默认选择；过期、无效、不支持的精确Binding直接拒绝，不能降级。没有Binding继续原Native服务路径，不创建V3 Run；这不是旧Orchestrator兼容模式。显式routeRef只接受原player/runtimeRouteId封闭结构，绑定Route必须精确等于原selectNativeRuntimeRoute实际选择。该组仅支持无authorityRuntime/logic/stage/Task/interpreter/output processor的原固定Narrator、agent→output两节点、唯一generation.send精确pin及result输出；其他profile明确unavailable，不隐式扩权。

JSON副本、任意role、异Host、错selection不能充当身份。BudgetPort对带原generationBudget的Session发送要求此proof，再调用原RunControl同CAS准入；HTTP不接受proof或quota。实际Package要求generationBudget与authorityRuntime组合，该组无policy实际Turn证据不能当角色配额通过；这一producer依赖已由§17.30的原candidate适配收口。

工厂从原Plan/Binding/Source与原Narrator机制形成精确内部grant，创建原Run/Attempt/Effect，复用原ContextPort。ModelPort只接受工厂WeakMap的一次性scope，自行调用原Host prototype.execute与原Provider私有wire lease，核每条实际provider ordinal、最终compiled/send fingerprint及原bank记录。原实例execute替换、伪响应、伪lease或JSON scope不授权完成。不转发provisional模型正文流。

missing usage保留原费用unknown；响应confirmed不伪造settled或真实账单。cold observe只读精确已有receipt/current confirmed，缺保存、ACK未知、矛盾intent或旧receipt不授权重发/正文消费。此处只确认模型事实，V3 Run/OutputClaim/Result与正式业务闭包尚待P4；原Native finalize存在不等于V3 Run completed。

原Native HTTP对安全native_orchestration_*码保持脱敏与实际409/503，detached Scheduler仅保存安全码，不泄露原异常正文。未新增Run/Projection/Approval路由。内部retain_native_turn_until_explicit_release仅表示内建不自动GC策略，尚无可信release接口。该组未计量的实际compile与未绑定的active operation/attempt已由§17.30扩展；其他已授权实施待办不标外部BLOCKED或P3 PASS。该组精确四Engine/FS/SQLite及变异证据归同一Record第十九组。

### 17.30 原authority candidate、实际编译计费与活跃Turn身份

有限Native Turn profile增加原authorityRuntime的显式typed transaction。SourceBinding、原bank与quota始终锚定committed base，candidate不是已提交World。logical input/grant仅增加原authority identity及candidate/receipt摘要。工厂拒伪proof、错Core、替换candidate/receipt、缺原localWork限额；无typed transaction的resolver、Task/stages/interpreter及后台仍unavailable，不用caller role扩大支持。

原Native的safeItems、authority receipt附加及Knowledge narrowing抽为共享纯helper；tokenizer、persona consumer、effectiveOutputReserve、Package derivation/processing继续用同一原Native option builder。没有第二World/Memory/Secret或Package执行服务，正式状态仍只由原Native finalizer写入。

ExecutionService.generationSend先创建唯一原sendBank；compileNativeContextMetered经原ContextPort.compilationDescriptor取得真实snapshot/candidate/receipt/Package source输入字节，再以同一bank的稳定local ordinal准入实际compiler并结算wall/process CPU。短命descriptor不入账本。原Host复用同一计费生命周期，准入前先核current/cancel，已准入工作仍在finally记录实际失败/取消费用，不退款或丢迟到结算。

bindContext({port,compiled,compileProof})只在prepared Effect内单次绑定，重读原Source/Run/grant/fence/child并核私有证明；context为只读getter。compileProof精确绑定同bank/原BudgetPort/owner/Run/epoch/boot/Source/Effect/grant、原编译对象及真实settled/completed typed local行。sendBank的短命WeakMap品牌只证明原adapter出处，不是余额或许可。Host只有该proof有效才复用已计费Context，避免再收context_build；实际正例在maxJobs=5下恰有5个原local jobs及1个context_build。观察原计费事实不要求新发送权。

opaque Turn permit再绑定Host/selection/invocation，quota proof与ModelPort复用它；终态未abort、旧attempt、伪boundary、资源缺失或替换signal均不授权新发送/消费。没有新scheduler或持久permit表；事实observe/late settle不加active门槛。

固定Narrator实际quota与原compute同CAS已在合法authority Package、真实HTTP及原finalize中取得FS/SQLite和指定MySQL/Pg实证；第二次真实retry准入可被原narrator cap拒绝，candidate保持未提交。四Engine Model/计费矩阵及SQL测试timeout诊断详见同一Record第二十组；测试60s不改变产品timeout或性能SLO。成功503→200多attempt确认、独立Run.cancel/contradictory Effect与最终consume的后续线性化实证归§17.31及第二十一组；不可用同一SQL snapshot二读宣称已解决。P4正式Native提交前的V3 OutputClaim/取消/Result闭包仍待接，模型响应confirmed不当Run completed。P3 Gate仍NOT_READY。

### 17.31 原Run树消费线性化与正文拒绝

`RunRepository.withConsumption(handle,runId,consume)`是原Host顶层Model/Skill消费者的内部接缝，不是HTTP能力或新grant。它从原Run读取不可变祖先链，复用与原Run命令相同的`withNativeResourceWrites`锁住本Run及全部祖先，取得锁之后才开始消费Engine事务。当前Model/Skill调用点在Engine事务之外；原Engine在已有ALS事务中会重入，因此本合同不将任意外层事务调用宣传为新snapshot。不得在旧SQL snapshot中仅二读后声称取得最新并发状态。

内部`consume({tx,root,fence,deny})`继续核精确当前Effect及既有完成Receipt、Source/grant、实际bank、固定Turn permit/signal；最后重新核Effect/Receipt。外部原取消/Effect命令与正文消费由同一原树锁决定顺序，不另建mutex/ledger或Scheduler；事实observe/late settle在消费锁外，取消不退款或抹去真实响应。

同ALS重入的合法控制写可在消费await期间改变权限；此时`deny()`私有sentinel或最终Run变更形成拒绝envelope，Engine先正常提交这些事实，再在事务外抛`native_orchestration_consumption_stale`，正文不返回。不能在该边界直接抛错回滚已经成功的取消/unknown事实，也不能捕获任意存储错误后假称已提交。缺少真实同实例RunRepository/EffectController的Skill在执行、读取输入和收费前拒绝；不保留unknown且返回Skill正文的旁路。MCP/A2A操作metadata不冒充正文或远端完成。

本节第二十一组只线性化Port对原Run/Effect控制写的正文消费，不宣称原Source/Binding同样原子。该组真实FS原Core.appendTimeline和saveBinding末await探针另复现来源/Binding改变后仍可返回正文；第二十二组修复及范围见§17.32，不将旧反例抹成一直通过。原Native finalize前的OutputClaim/Result/取消围栏仍由P4闭包实施，模型响应confirmed不表示Run completed。真实独立任务顺序、同ALS写入/冷读/原费用保留、503→200成功retry与守卫变异的精确结果归同一Record第二十一组；合成HTTP和本地隔离数据库不替代实际账单、三端客户端或文本质量证据。

### 17.32 原Session/Binding域消费围栏

§17.31已实证的原Source/Binding末await缺口由原领域锁组合修复。内部`SourcePort.consumptionBoundary(handle,binding,{engine})`只构造边界，不读取Session payload、发送、收费或写入；Model/Skill必须注入同一执行服务的原SourcePort，不接受no-op锁替代品。当前只接Native Session正文消费；Project/RP缺原正文消费adapter时明确unavailable，不能借Session锁或caller callback声明获得其他领域权力。

`RunRepository.withConsumption(...,{withAuthority})`在原Run全部祖先锁内调用该原领域边界，再开始消费Engine事务，固定顺序为Run→Runtime→Session→Engine。`withAuthority`本身不是grant，内部primitive的默认值也不提供领域保证；真实正文Port强制传原SourcePort边界。域锁只覆盖最终消费，不持有到Provider HTTP等待期间；原事实observe/费用结算仍由原服务执行。原Factory在Host事务内直接通过原`assertRunAccess(tx,...)`纯读权限，避免反向等待Session写队列，不重写原RunControl权限规则。

明确的Native stale/权限拒绝转private deny，使同ALS合法Session发布/Binding CAS先提交而正文被拒；

此围栏限定Port消费决定；决定之后原领域仍可发布，正式Native finalize的HEAD CAS继续有效，P4 OutputClaim/Result/取消闭包尚不能由此替代。Source/Binding、原锁顺序、HTTP期间锁可用、冷读/费用保留、错误分类和守卫变异的实际范围归同一Record第二十二组；不将原角色/其他领域/可信Review/三端或真实费用未测项目称为通过。

### 17.33 原intent_resolver与Narrator的固定生产链

§17.26的发布机制增加原RuntimeRoute实际声明的`role.intent_resolver`，复用同一RouteResolver并强制`generation.tools`证据；caller、Plan标签或role字段不能自授身份。固定Host仍先选择精确Binding及原默认/显式Route，不支持的精确选择直接拒绝。普通/typed authority继续只接受原Narrator→output图；本组free-text authority只接受resolver→Narrator→output的精确三节点、两条always/nonloop/maxVisits=1边、两个实际model pin和generation.send能力。resolver输出与Narrator必需输入为JSON，Narrator输出为text。不是通用Graph runner；Task/stage/interpreter/background仍待接。

resolver requestId固定`invocationId + ':intent'`，Narrator保持原invocationId。JSON/旧permit/错source/外Core不授权。ModelPort只接受同一内部工厂的一次性scope，继续原prototype execute、Provider私有lease及§17.31–§17.32的最终消费围栏，没有公共allowTools开关。

`ContextPort({resolverCapture})`只允许该opaque身份使用内部`authority_intent` audience，不能拓宽Narrator/Actor权限。descriptor从原Package取得真实manifest/entryPoint/sourceFiles/assets字节，目前保守覆盖完整Package，不用摘要冒充输入大小；大Package可被原localWork输入上限拒绝。实际bank准入compile之后才调用原authorityCatalog、原buildAuthorityObservation和原resolverRequest，复用原声明的intentObservation/viewIds与限制；不另造Context/World/Memory服务。实际payload、tools与selector只在私有compiled context内，RunLedger仅存最小逻辑引用和摘要。send/consume核原source、完整Package字节身份及grant，不重新投影。原空RequestContextPlan字面量抽为唯一`emptyNativeContextPlan`纯helper，预算保持原Host outputTokens语义。

前者固定session/revision/id/role/tools；后者严格核原role/id/实际Route、必需capabilities、tools、空outputContract、原host view prompt、disabled fallback及空overrides。额外messages/prompt/工具或调用者自述均不能穿透。这不是MCP/A2A Tool执行或World写许可。

不同Route上限继续由原bank逐维收紧，不按角色相加、不另建额度或价格表；后续上限不足保留已发生resolver事实和费用，Narrator拒绝。每个实际role编译各计一次原context_build，provider实际发送分别消耗原角色quota与稳定Effect/ordinal明细。随后原TransitionController读取immutable settlement，创建Narrator Attempt并实际计edge visit。完成响应、完成选择、正式业务提交和Run completed分别留证，不能互相冒充。

原Host持久selection仍唯一归原RunControl。新invocation复用它时，仅全新、无任何旧Attempt/Effect的admitted Run且原操作已有V3 compute保留provenance，才允许原AttemptController创建零Effect的selection reuse Attempt。inputRef只存owner/source、operation/fingerprint/selectionDigest、Plan/node/pin/config引用；activate/settle均核active Narrator permit、原source和精确selection事实。reasonCode为`original_selection_reused`，无ModelReceipt、无Result、无resolver编译/HTTP/角色收费，后续仍经原Transition计边。它不能覆盖本Run的charged/unknown resolver。缺原V3保留事实明确retention_unavailable；合法但无generationBudget的free-text Authority Package在preflight明确scope_unavailable，这两种原来源的完整适配仍IMPLEMENTATION_PENDING，不伪造原control行或保留服务。

本组实际测试、失败修复、SQL和守卫变异范围归同一Record第二十三组；合成Provider和本地隔离存储不替代真实外部费用/文本质量或三端客户端证据。P3 Gate仍NOT_READY；Project/RP正文、后台producer、可信Review及P4正式OutputClaim/Result/取消闭包未因该固定链自动交付。

### 17.34 原Project Task消费边界与事务内预算读取

`SourcePort.consumptionBoundary`增加原Project Task边界。构造只校同原ProjectAgentService、其实际StudioService、ProjectTaskRepository、BudgetPort及Engine、完整source/bank operation身份与binding digest，不读取正文、发送、收费或授grant。执行复用原Runtime→Task→Studio队列：原ProjectAgentService提取`withTaskLock`，其既有四个同key入口复用唯一原resource lock；SourcePort调用原prototype方法及原StudioService.withProjectWrite，不能用同名no-op替换。组合RunRepository时顺序为Run祖先→Runtime→Task→Studio→fresh EngineTx，不取相反的Studio→Task顺序。

本边界限定原Host实际DI共享的同一Studio实例。Studio队列是实例内Promise tail，不能据此宣称所有同Engine、另建Studio对象的写入都已围住；后续真实Project producer必须核`host.studio === agent._studio`及同原repo/银行。RPControl锁也不能替代原ChatRepo正文/rename/delete等写入口的共同领域围栏，RP仍明确unavailable。本组没有新锁表、银行或Project writer。

持有Studio队列后不能再调用会排队的observeContext/getProject/getRevision/getTask。`BudgetPort.assertCurrent(handle,authorityRef,{tx})`的Project分支复用原`observeComputeSource`纯读取，与原SourcePort已有tx读取保持一致；无tx仍走原observeContext队列。此参数只选择原pure reader，不是grant或独立的原子性证明；fresh事务和领域排他性来自上述真实调用顺序。原费用准入/晚到结算及其sequence变化不会被误判成权限变化，operation仍绑定原Project revision和executionFingerprint，不复制余额或计数。

Project Source capture改用原ProjectAgentService._ensureDraftMutable的实际领域拒绝，覆盖真实`committing`而不复制第二状态机；测试使用原prepareReview/commit进入持久committing，不能用伪status JSON充当正式业务提交证据。

本组围栏/读数测试只使用明示受控的Host回调读取真实原Task source，不冒称Project Model/Actor runtime principal或完整Project正文已交付。原ProjectExecutor→ModelPort、付费后的Project Context/工具组装、active generation attempt/request/conversation身份仍待后续生产接线；executionFingerprint刻意不含conversation/compute，不能独自证明正文完全当前。P4正式Review/Commit与OutputClaim/Result闭包不由该边界代替，精确实际测试、失败和变异范围归同一Record第二十四组。

### 17.35 原Project Executor单轮Model/Context生产组合

原`NativeProjectAgentExecutor`为交互执行建立私有preflight与active operation登记。只有其原start回调中的实际derived Host、derived ProjectAgent、完整原Scheduler boundary和同一原Studio/TaskRepository/Engine可以捕获opaque operation；手工拼装descriptor、另建同原型Host、JSON复制或终态boundary均不能替代。operation持续钉住初始原Task executionFingerprint，避免初始Skill工作等待期间的原用户setPlan被后续getContext悄悄接纳成新source。没有模型或Browser可填的producer callback。

同一原`NativeNarratorOrchestrationAuthority`内部组合有限Project authority，复用同一execution service和ModelPort，生产DI注入原ProjectAgent及Repository。内部接口是`preflightProjectBinding`、`projectSelectionDescriptor`、`prepareProjectRound`与`executeProjectRound`；selection和round token不序列化为HTTP授权。精确Task Binding优先于Project默认Binding，实际operation必须持有同一个私有selection。首个profile仅支持`maxModelRounds=1`、一个studio agent→一个json output、唯一generation.send、精确player Route pin、无动态图/loop/partial、retry/fallback=0、continuity=none/reuse=disabled。无Binding仍是原Native服务，不引入旧Orchestrator模式；有Binding但不支持就拒绝。Goal/通用export缺原operation凭据时在付费前拒绝，不能悄悄忽略Binding。

原Host的Project prompt binding合成抽为唯一`projectRuntimeRoute`纯函数，再以原RouteResolver解析实际有效Prompt/Generation/resources/config/path及generation.tools。没有第二Route/Secret/price writer。Run命令用原project/task/request身份，不含短暂Scheduler operationId。原耐久Run命令仍作最后防重。原Task bank继续唯一持有费用，V3只存最小逻辑输入、节点与原引用。该证据仅覆盖已有原generation请求记录的重放；不把同Host重建Scheduler/Executor测试冒充进程/Engine崩溃恢复或尚未记录请求的全部初始化窗口。

原runner的system/Skill descriptor/messages组装抽为共享纯`project-agent-prompt.js`，内部`prepareModelRound`在原begin成功后的try内调用。`StudioService.observeProject`与`ProjectAgentService.observeModelContext`提供原源码/文件/Registry/Task/tools的纯读取，不运行恢复、初始化history或另写资源图。Context descriptor覆盖实际编译输入字节；原bank准入后才调用共享builder，从原stored conversation及原Skill工作私有records形成真实HTTP context。Task compute/sequence/attempt observation不进入prompt输入投影；私有编译结果冻结，runner得到单独可变transcript，不能反改已计费Context。

内部audience为精确`project_task/taskId`。外层Host请求严格固定project/task/revision/attempt/request/role/Route/tools，GenerationService请求另外严格核原host view、requirements、空outputContract、disabled fallback和空overrides；实际round的source/role/messages/tools须与私有编译结果一致。已发生收费/confirmed事实保留，原业务服务决定Task结果。

本profile只授model generation。模型返回任何toolCalls时，在交回原runner执行工具之前明确`native_orchestration_project_tool_scope_unavailable`；不能凭generation.send取得Task proposal/Skill/正式Project写入权限。实际Model Effect可以confirmed且费用已settled，同时Task提案/正文仍被拒绝。P4仍需原Task Tool grant、多轮source advance、正式Review/Commit、OutputClaim/Result与取消提交闭包。本组不是通用Graph runner、Project完整自动consumer或Run completed，也未增加Run/Projection/Approval HTTP。精确测试、失败、SQL范围和变异留同一Record第二十五组；真实外部费用/文本质量/三端客户端不由本地合成HTTP替代。

### 17.36 原RP canonical写围栏与事务纯读

原ChatRepo增加`withWriteLock(handle,operation)`，唯一委托`withChatWrite`，复用原`withRuntimeWrite`和原`withNativeResourceWrite(handle,'rp-chat-domain',...)`。顺序为Runtime→owner范围chat-domain→原RPControl resource key（需要时）→Engine；没有新锁表、银行或业务writer。该owner边界覆盖重命名、角色目录整批移动/删除与群聊枚举/cascade全过程，不依赖可变locator或将group文档ID误当chatId。原ChatRepo全部12类mutation和GroupRepo save/delete共用它；读、原CAS/去重/sidecar/计数/返回语义仍归原服务。

`RpRunControl`保留同Engine的原ChatRepo引用；`_locked`最外进入同一聊天边界，再取原control锁。`status/context/observeCompute`增加可选末参数`{tx}`：有tx直接原纯读取，无tx仍走原Engine事务，不排队获取写锁。原prefix仍由原`sourceContent/sourceMessageId`计算，覆盖原文字、sender、角色、variant；原bank费用/sequence变化不使source误失效。迟到结算按既有control/operation身份，不要求当前chat仍存在。SourcePort与BudgetPort在当前事务使用这些原prototype reader，instance同名no-op不能替代来源或费用事实。

`SourcePort.consumptionBoundary`增加RP分支，构造纯校原RpRunControl/ChatRepo/BudgetPort及同Engine、source/control/operation/prefix/digest，实际执行才调用原ChatRepo prototype写边界。与原RunRepository组合为Run ancestry→Runtime→chat-domain→fresh EngineTx；不持锁跨Provider等待。这是来源消费围栏，不是模型/Actor/工具授权。当前测试的实际consumer是明示受控只读callback，未提供P4单正文slot/marker提交器或RP model scope。

普通generation job自动保存使用原已认证`job.handle`，不能从没有handle的requestMeta落入FS直写；角色rename/delete的原Repo操作及随后原文件清理尾部持有同一边界，避免尾部删除后来新建聊天。不重写这些业务操作或迁移任何旧编排数据。

第二十六组时尚未封闭的管理入口已在[§17.37](#1737-原rp同步恢复与管理写入围栏)接入同一边界。此处仍不授权RP Context/model、Actor或P4正式输出；它们保留各自原领域准入与后续实施队列。

### 17.37 原RP同步、恢复与管理写入围栏

复用§17.36唯一`withChatWrite`，不新建锁表、银行或业务writer。`reconcileShadowToLive`独立入口在修剪/替换live tree前进入Runtime→owner chat-domain；有原认证handle的调用直接传同一handle，独立内部调用从原directories.root解析。`dematerializeWorkdirIntoUserData`在任何SQL事务之前进入同一边界。新内部组合`publishShadowToUserData`跨文件发布与SQL写回持有同一边界；pull首次配对/fast-forward/merge、undo及responder ref publication均使用它。Peer HTTP fetch/push保持在边界之外，不持Runtime锁等待另一个Host。

原cross-mode restore从live snapshot前到raw clear、MigrationRunner、文件提取、成功或失败回滚结束保持同一边界；同FS restore、原recovery apply和`restoreFromSnapshot`同样先drain消费再执行实际替换。没有EngineTx中反取Runtime；原read-only、migration lock和原Host maintenance继续按原职责工作，不能代替响应消费边界。

原账户restore的失败回滚会替换全root，即使用户仅选择chats也可能覆盖V3元数据。因此复用已有`native_orchestration_retention_review_required`：cross-mode、同FS、recovery apply及直接snapshot replay在原Run或Record历史仍存在时，提前拒绝snapshot/clear/publication；recovery HTTP也返回409及原错误码。无法取得原Engine且root有Native目录时不推断“没有历史”。这保留现有安全拒绝语义，尚不是可信restore review或完整source闭包恢复。

原reset-settings的raw delete与seed同scope；管理员删除从原账户身份撤销、Engine.deleteUser到可选purge同scope。原账户reset-step2在同scope复用原Host maintenance，先原Engine.deleteUser关闭SQLite/清SQL行，再清目录并重置原内容；保留原`native-host.identity`，避免旧打开连接和身份文件丢失使Host失效。

本组实际本地证据为CachyOS/Node24上的FS/SQLite并发与真实HTTP、原FS/SQLite同步及迁移回归。新管理入口SQL/Windows/Termux/真实Provider与质量仍NOT_RUN，完整P3 Gate未通过；RP模型或正文consumer仍不可由这些写围栏推定可用。精确提交、测试、失败和fixture清理修复归同一Record第二十七组。

### 17.38 原RP受信Model producer与prefix Context

内部`NativeGenerationHost.startRp(handle,{controlId,floor,requestId,routeRef})`仅接受原聊天最后一个用户输入；不接受正文/messages、grant、费用或Context自述。原Scheduler实际callback签发模块私有WeakMap capture，绑定同Host/Engine/RpRunControl、实际boundary、资源、anchor、interactive/model_task与retry=false。JSON复制、调用方伪boundary不能获得ModelPort权限。原聊天必须已有合法sourceMessageId；缺失时明确拒绝，没有自造Session或绕过原source生命周期。

原SourcePort、Run/Attempt/Effect与原RP银行组合；ContextPort从原聊天读取prefix，在原localWork准入后编译，历史system消息作为用户历史资料，不提升为system指令。原费用按真实provider ordinal结算，编辑/新增输入/Binding变化拒绝响应但不退回已发生费用。稳定命令重放在新Context与发送之前拒绝，不再收费。

这是P3内部producer；没有新增Browser HTTP dispatcher，不开放调用方raw prompt。生成结果尚未成为正式聊天正文，也未使Run completed。P4仍须原ChatRepo单输出slot/marker saga、OutputClaim/Result与取消闭包，P5再接统一envelope及投影API。

### 17.39 原Session Hybrid与实际Context工作组合

原NativeMemoryAuthority增加内部只读Context消费者，复用原SettingsRepo、Session projection、source-lifecycle readonly snapshot、Information eligibility与唯一retrieveMemory。实际Package声明允许原reader已有的sourceMessageIds/atomicGroup/atomicSourceMessageIds字段；精确全文暴露、原Actor/availability/Branch/Revision与atomic group仍由原Information规则决定，摘要或仅有ID引用不授原始正文访问权。Host显式使用自己选择的snapshot，不读取Browser全局Session；该依赖不是可序列化的recall options权限。

原ContextPort的descriptor包含真实Memory设置与snapshot bytes，原context_build准入后才限定候选子图、检索和编译；整个工作仍只由原发送bank计一次本地工作，不新建Memory费用银行。NativeMemory不持久化provenance/access，也不将临时Episode projection变成正式Memory写入。编译后撤销设置时扣住响应而保留实际费用，初始空/disabled recall也须保持设置当前。Session消费边界沿原Runtime→settings资源锁→Session锁→Engine，匹配原Memory写入口settings→Session顺序。

当前只接原本地lexical/graph/packing工作。设置含精确embedding/rerank路线但缺原受信retrieval producer时明确scope_unavailable，不调用Browser transport、不静默忽略配置。RP原ChatRepo Memory状态、外部retrieval、跨Agent Result/Disclosure及P4业务闭包仍待接；本组不是完整P3 Gate。实际Linux FS/SQLite、合成HTTP、失败/复测范围归同一Record第二十九组。

### 17.40 原RP ChatRepo状态与唯一Hybrid

原RpRunControl.memoryContext只读原control的locator、完整prefix与原ChatRepo.getStateBatch；显式tx直接使用原Engine.getChatState，不排队或另开事务。三个原Memory命名空间由原常量指定，不创建Session/Memory sidecar或仿造Session identity。原prefix中每条消息须有唯一合法memory_os_source_id，缺ID/重复/Native Session消息明确native_rp_source_unavailable，不分配新ID。

原NativeMemoryAuthority只读RP facade在真实Memory设置与sidecar bytes进入Context descriptor后，先按原prefix限定eligibility，再由唯一retrieveMemory检索；不在Context中capture/persist普通RP新Episode、不写access/provenance。未来/失效来源的事实在候选域前撤销，不能只过滤返回refs。原context_build仍包含全部实际本地工作，原Provider attempt仍归RP银行。HTTP期间独立修改Memory/撤销设置拒绝正文，但保留真实Provider费用。RP消费沿Runtime→settings→原chat-domain→Engine，状态writer继续共用原chat围栏。

该内部producer仅提供Model/Context证据；没有新HTTP、聊天正文、OutputClaim/Result或Run completed。普通RP source用户入口仍须P4沿原writer补生命周期；外部embedding/rerank、后台与Delegate/Handoff授权/Result/Audience仍待实施。实际Linux FS/SQLite合成HTTP、纯tx与失败范围归同一Record第三十组。

### 17.41 原Scheduler父子资源让出与恢复

原NativeTaskScheduler.withResourceHandoff只接实际active boundary，捕获原owner/source/class/resources immutable身份；子操作继承同owner/anchor/class，只可使用原资源子集，不能自述foreign owner、提升优先级或重复同child key。父操作让出实际running容量但保留原operation/attempt/deadline和owner工作；waiting_child期间原permit和stream不可用。子操作经唯一原Scheduler准入；结束后父操作通过同一资源/全局并发队列重新取得原permit，不再次执行parent.run或重置attempt。

取消传播给原child signal；忽略abort的worker仍占原资源直到真实结束，已finalizing的child仍可完成原提交，不宣称撤回收据。父等待重新取资源时取消只移除自己的continuation。子失败明确operation_child_failed保留cause，不触发原generation_provider_failed自动父重试；已发生/未知效果不因此重发。

这是原调度器的资源原语，不是新的scheduler、Memory/费用bank、Domain grant、耐久HandoffReceipt或child Result writer。目前没有V3正式producer调用；生产Delegate仍必须先核原Plan/领域授权、原银行child reservation、Run epoch以及Result/Audience。测试只证真实原Scheduler的容量/生命周期/opaque identity，不冒称上述授权或P3全Gate完成。实际Linux本地证据见同一Record第三十一组。

### 17.42 Memory同事务撤销与原消费拒绝

ModelPort的原明确consume deny集合增加唯一native_orchestration_memory_source_stale。最终bank await之后同ALS合法SettingsRepo/ChatRepo Memory写入必须先提交事实，再由RunRepository.withConsumption在事务外拒正文；不能将新的Memory currentness拒绝作为事务内任意异常抛出而回滚合法撤销。

该修正只核同事务Memory消费闭包，不代表正式OutputClaim/Result/Run completed或可信Review。FS/SQLite真实Settings/sidecar复读、已发生Provider费用与失败修复证据归同一Record第三十二组。

### 17.43 原pending outbox后台Model producer与窗口/周期额度

原NativeGenerationHost.executeLifecycle→executeTask仅在真实普通background outbox、原generationBudget、active scope/epoch与精确input成立时接内部NativeBackgroundOrchestrationAuthority。只有原Scheduler实际callback可签发私有capture；固定同Host/Core/Engine、owner/source/resources/key/fingerprint、attempt=0与retry=false。原queued事件、Task证据捕获及原finalize/adoption继续共用既有路径，没有Browser可序列化的producer授权或新HTTP。

当前有限profile是原Session精确Binding（缺失才查entrypoint默认）、已发布agent→json output两节点、唯一generation.send与精确player Route pin；retry/fallback=0、continuity=none/reuse=disabled，Package Task的Prompt/Generation仍通过原RouteResolver解析。没有Binding保持原Native服务；有Binding但不支持明确拒绝。该profile尚不能与同Session的有限Narrator text图共用一个通用Binding，其他Task/resultBinding及通用Graph调度仍待后续实现，不冒称全部后台任务已可运行。

ContextPort以真实task/id及原Information Task view限定projection和唯一Hybrid候选域，原Task context选择抽成共用纯helper。原Task payload只作为明确的context.input；不继承Narrator宽视图、其他Actor私有资料或后台玩家persona。实际Context descriptor→原context_build→编译证明只收费一次；

原RunControl.checkGenerationQuota只对原control副本执行同一chargeGenerationQuota，不持久化、不预占、不充当发送授权。未到期/当前窗口或周期已满时在创建稳定Run前返回pending，后续原counter/clock/pump更新后同一pending可继续。稳定V3命令和原background费用记录防重放；生成后原adoption失败并冷重开时明确outcome_unknown，不再次HTTP。

原Task仍是产物正式接纳者；本组Model Effect confirmed不等于Run completed，没有P4 OutputClaim/Result、通用Delegate grant或可信Review。Linux FS/SQLite、本地合成HTTP、失败/修复与分次通过范围归同一Record第三十三组；

### 17.44 耐久Handoff起始与父逻辑槽让出

同一DelegateController新增内部handoff(handle,input)，输入沿既有delegate精确合同；handoff仅接当前running、无任何既有Effect/Result refs的父Attempt；同一原Run CAS原子写稳定child Root、delegation receipt、immutable HandoffReceipt并将父Attempt改为waiting_child，累计原delegates/handoffs/steps及祖先treeProgress。没有第二Scheduler或预算银行。

HandoffReceipt钉父/子Run、父Attempt/epoch、Host boot/generation、source、父子grant、inputs、child Plan、预算上限与returnContract摘要、entryNodeIds、返回父node、terminalPolicy、controlToken和decisionSeq。controlToken是内部身份关联，不是HTTP授权或批准。waiting_child不占逻辑执行槽；handoff准入计算实际后代活动Attempt及未启动child，扣除本次让出的父槽，保留所有祖先并发/深度/累计额度；单并发及嵌套不靠提高limits打通。首版父Effect refs必须为空，阻止迟到旧观察将等待父复活。

仍按耐久身份→事务外原BudgetPort.reserveChild→confirmBudget只读原银行→原Scheduler.withResourceHandoff运行的顺序。预算ACK未知只观察同reservation；取消/旧epoch不取得新执行许可，已发生费用不抹除。Scheduler恢复物理permit不改变耐久waiting_child，也不产生Result或控制权返回。当前没有returnHandoff、Result/Audience consumer或正式领域producer，相关路径继续unavailable；Windows FS/SQLite与变异/回归范围归同一Record第三十四组；SQL/外部费用/质量未据此通过，P3 Gate仍NOT_READY。

### 17.45 有限Delegate发布机制与单次依赖闭包

其它未支持capability继续unknown。空allowed列表只表示没有可委派目标，不是运行权限；仅声明ceiling却无对应node仍unknown。

Map不跨调用/owner/tx，不缓存runtime grant。原maxDepth仍为实际运行深度，不被擅自解释为文档引用深度上限。

该发布证据不签发领域capture、delegation grant、child Context或Result/Audience，不代表已接实际producer。FS/SQLite真实发布/拒绝、独立child Route漂移、DAG与变异范围归同一Record第三十五组；P3 Gate仍NOT_READY。

### 17.46 有界task-local Result物理合同

实际保存Result正文前必须从不可变Plan的outputContract.resultPolicy读取显式{outputType:'text'|'json',maxBytes:正安全整数}，只允许kind=result。没有policy的既有V3有限profile仍不能生产Result正文，assertResultPolicy明确result_policy_unavailable；不按tokens、local-work inputBytes或默认常数猜正文额度。partial还须原allowPartial=true。

沿已注册orchestrationRecord/result存严格{schemaVersion,runId,resultId,envelope,payload}，不加metadata kind或业务writer。outputSchemaRef={kind:'native_builtin',schema:'text'|'json'}。text按UTF-8、json按原canonical serializer实际字节核maxBytes；payload和整个metadata严格plain JSON，拒undefined/nonfinite/cycle/sparse/accessor/hidden/class/custom prototype，不执行getter。unknown/unavailable只许null正文；qualityRefs首版为空，不虚构质量证据。

首版来源只接精确两ref：run_source{runId,epoch,sourceBindingDigest,sourceAuthority:'rp_chat',sourceRef:{controlId,prefixDigest}}与effect_receipt{runId,effectId,receiptId,observedEpoch}；二者同producer Run/epoch。audienceConstraint={kind:'parent_attempt',parentRunId,parentAttemptId,parentEpoch,sourceBindingDigest,grantDigest,taskPurpose}，disclosureConstraint={kind:'same_source_parent_only'}，限定同source精确父Attempt、不转发。

### 17.47 原Model完成事实与同source元数据控制边界

ModelPort.generate仅在原withConsumption真正成功返回后，以实际返回wrapper为私有WeakMap key登记完成事实；被最终消费围栏拒绝的callback候选值不登记。只接真实text且无toolCalls的响应，原工具响应交付不变但没有text Result proof。inspectResultCompletion(handle,{result,runId,effectId})要求同Port/owner及原对象，核response/snapshot/provider rows/receipt摘要、当前Run/Attempt/EffectReceipt、Host fence、Source及原BudgetPort每send provenance；末次await后再次核Root stamp/fence和对象。冷Port、JSON/浅复制、历史observe、替换正文/receipt不能取得证明。没有正文副本、新ledger、余额或收费；原unknown事实不变，不冒称已结清。

这是完成事实，不是Result写权限、父Audience、child祖先授权或业务提交。实际writer必须持原wrapper在领域scope仍有效时调用，并另核当前完整lineage、Plan/outputPolicy、收件人及原银行闭包；不能先spread返回再用副本恢复证明。独立合法Source/取消撤销后拒消费，费用保留。消费方须在原事务内把这个明确拒绝封装为deny、先提交合法控制事实再事务外拒绝，不能用宽catch或声称裸throw保留同事务写。

RunRepository.withSourceControl(handle,runId,operation,{withAuthority})要求两callback，复用完整原Run祖先锁→调用方原Source领域边界；不打开事务、生成grant或新锁。此helper只覆盖目标Run祖先链，不授予任意新sibling资源嵌套调度权。

原Run命令锁统一先Run资源/祖先再command ID，修复外层已持Run、独立相同command先占command再等Run的真实逆序。无lineage的Run.start仍以原command去重，原Runtime/Session/Engine顺序与PlanRepository不另改。FS/SQLite、精选SQL、真实竞态失败修复和语义变异范围归同一Record第三十七组。当前尚无Result发布、正式child producer/return或新HTTP；P3 Gate仍NOT_READY。

### 17.48 原银行精确child闭包观察

原native-compute-budget新增纯inspectComputeChildClosure(holder,reservationId)，复用同一assertComputeLedger/inSubtree/inspectComputeReservation，返回原reservation、descendantReservations、modelAttempts、localWork的防御副本及原overrun。没有新费用计算或释放逻辑；原releaseComputeChild仍是唯一释放reducer，已发送unknown/charged、未结清local或仍held后代均按原规则拒绝。

BudgetPort.observeChildClosure(handle,{authorityRef,reservationId,expectedParentReservationId,expectedCeiling},{tx})只读同一原银行，mandatory tx必须是该bank Engine当前实际事务对象，转发Proxy/foreign/过期对象不等同原snapshot。严格核原reservationId=consumerId=Native child Run ID、parent/ceiling及子树内全部model/local typed provenance；缺记录/marker或错绑拒绝，无兼容默认。

返回封闭事实{authorityRef,reservationId,parentReservationId,status,closed,overrun,reservationRefs,budgetAttemptRefs,snapshotDigest}。status沿原held/released；closed只在本子树released、全部原行settled、全部后代released且本子树无overrun时为true。local已真实结算failed/cancelled也可费用闭合，不证明业务成功；原释放允许记录真实超限后释放，因此released与closed不得混用。摘要绑定精确authority/selector/子树原facts，不含兄弟或根外工作；不将余额/usage复制为另一本金额账。

这是历史原银行观察，不要求active Scheduler或当前Source，也不自动release、reserve、消费正文或赋予Run终结权。实际关闭仍先由领域/Graph阻止新准入，再事务外调用原releaseUnused；ACK未知/冷恢复只观察同authority/reservation，原银行确为released才可确认metadata闭包。成功Result/output/return还须当前完整lineage、取消/source/grant/Audience及原业务authority；本组没有新增持久closure receipt或正式Result writer。FS/SQLite、三域精选SQL与守卫变异归同一Record第三十八组；P3 Gate仍NOT_READY。

### 17.49 真实RP独立child Model与根银行/叶额度边界

原startRp新增一个有限profile：父agent→text output，能力精确generation.send+agent.delegate、一个model pin及唯一allowed child Plan pin；handoff前父无Effect/Result。child精确generation-only agent→text output、显式text resultPolicy、无partial/动态图/循环/工具/retry/fallback/continuity/reuse，单send Route显式maxRequests=1及localWork。父Scheduler提交前保留父子executionResources并集+原RP资源，child只能使用原withResourceHandoff允许的子集。

沿同一原sourceRequest/purpose/outputSlot/budgetAuthority，实际父callback创建Run/Attempt→durable handoff→事务外原reserveChild→confirmBudget→原单槽resource handoff。仅真正child.run(boundary)签发独立rpDelegationCapture；不要求waiting父的Scheduler active。同步inspector核私有WeakMap、同Host/Engine/control/原scheduler active child/owner/key/resources/attempt=0/retry=false；异步inspector同原Engine事务核Host fence、immutable child graph、完整祖先、waiting父/空Effect、精确Handoff/delegation同CAS时间与ready收据、held原reservation、Binding/父子Route和完整RP prefix。只交出最后原user文本及其精确Source输入refs；控制metadata不是额外正文授权。

child Context Audience固定{kind:'task',id:childRunId}，taskPurpose=original_rp_delegated_text，独立原compiled WeakMap；禁MemoryAuthority/readMemoryEvidence/persona/contextOptions/外传compilationInputs，不注入父历史或Memory，descriptor不复制Root或余额。真实GenerationService请求严格固定tools=[]、fallback禁用、overrides=[]和原Route角色/ID。Model使用独立native_rp_delegated_intent/nativeRpDelegationCapture，经原scope issuer/GenerationHost/Effect/银行执行，不冒充原RP Narrator或后台Task身份。合法同tx父取消先提交后拒正文，原parent_stale加入明确consume deny集合，未宽吞其它错误。

父原private authority须await完整handoff Promise再finally释放；当前child实际Model wrapper在此有效callback内核完成证明，随后丢弃；只返回内部{status:'pending_result',parentRunId,parentAttemptId,childRunId,effectId,receiptRef}，不保留pending→正文映射。Scheduler完成不改变耐久waiting_child；父/子尚非completed，无Result/OutputClaim/聊天写或新HTTP。

实际链发现叶Route limits会经原bindComputeBudget把整operation永久min为叶额度。修原受信sendBank：reservation非null时必须显式捕获原根operation limits，model/local均固定使用此root envelope，不能让Host叶Route参数覆盖；叶五维额度仍由唯一原reservation/递归capacity执行。root无reservation保留原Route收紧，原已收紧ledger不回升/不迁移。当前直接child从根父Route传limits；将来嵌套必须继承整个operation根limits，不得改用中间父的叶Route。真实两Engine反例、费用/撤销/ACK、SQL精选和语义变异归同一Record第三十九组。正式Result发布、output终结、Audience消费及returnHandoff仍待接，P3 Gate保持NOT_READY。

### 17.50 真实RP child Result发布与历史事实边界

原实际child callback在ModelPort.generate成功、原wrapper和opaque capture仍有效时调用内部ResultController({host,modelPort}).publishModelResult(handle,{capture,result,effectId})。构造时核同一原NativeGenerationHost/Narrator authority/Engine/Run/Effect/Budget/Source；不接受payload、Audience、回调响应或冷重建proof。原Delegate判据抽成纯assertDelegationDecision，由原Controller和Result共同复用。原Model历史receipt规则抽成readModelCompletionReceipt并补稳定doc.receiptId一致性，不制造第二Model权威。

Result ID固定为oresult_+H({runId,effectId})前32位。原result.publish CAS同事务写严格§17.46受保护text record、immutable ResultPublicationReceipt、原producer Attempt completed settlement、Root.resultRefs与原steps/event/command/祖先计数。正文必须满足原显式字节policy，来源精确run_source+原Model EffectReceipt；Audience固定同source父Attempt/epoch/grant、taskPurpose=original_rp_delegation，禁止转发。正文完成不代表费用已知：真实Provider省略usage时原unknown及held reservation保留，仍可保存有界正文，不能据此终结Run。

receiptId沿oreceipt_+H({kind:'result_publication',runId,resultId})前32位。历史reader允许旧证据epoch，不将当前Source/active capture作为历史事实的前提；证据不能领先当前Root epoch/event/graph。原父取消后事实可审计，不恢复写入或消费权限。

仅preflight阶段明确的原Source/parent撤权及本有限RP的native_generation_revision_conflict、native_rp_source_missing、native_rp_control_relocated等已证撤权被封装deny，先提交同事务合法取消/Binding/Chat编辑删除与header迁移，再于事务外拒绝Result。开始写Result后没有catch-and-commit，任意错误使原Engine整组回滚。storage_commit_unknown退出原boundary后仅observe同稳定ref；saved可返回已完整持久的metadata，no-save仍unknown并抛错，不重发/重执行/cold恢复正文proof。

实际RP内部返回改为{status:'pending_output',parentRunId,parentAttemptId,childRunId,effectId,receiptRef,resultRef,publicationReceiptRef}，不含正文。child Root仍running、无OutputClaim、原bank仍held；父仍waiting_child，无聊天/World写、正式输出、durable return或新HTTP。下一步须沿原Transition/Attempt完成output、事务外原银行释放并严格观察closed后才能写task-local输出闭包，再接父Audience/return/ResultPort。具体FS/SQLite、精选SQL及变异证据归同一Record第四十组，P3 Gate仍NOT_READY。

### 17.51 原Graph task-local output与原银行闭包

原真实RP child callback在capture仍有效时，沿ResultController返回的publication refs调用TaskLocalOutputController.complete。只接受同Host原opaque child capture及publication，不接受正文、Audience、调用方grant或冷恢复scope。原NativeNarrator authority的authorizeTaskLocalOutput薄转原private RP authority，核activeChildCapture/parentMap、父子Plan/Binding/Route/Source/完整lineage、原publication/Audience与childGrant，返回精确Result inputRefs/inputDigest、原grant/budgetRef。prepare保持原held reservation；

原TransitionController.advance消费真实producer settlement，沿唯一agent→output边写原traversal/edge receipt与output Attempt；原AttemptController.activate在bank held时执行。物理退出该Engine事务后，事务外调用唯一原BudgetPort.releaseUnused，再以真实tx观察精确子reservation。原Graph output无generation capability，producer已completed，不从此处发起新Model。费用unknown/charged、release ACK未确认或实际overrun保持pending_output；released但overrun明确不能完成，保留实际费用和已知Result。release ACK未知只观察，不再次release或发送。

prepare、原bank release、最终publish各自物理事务分离，外层只保留原Run祖先→Source控制边界。四Engine提供纯hasActiveTransaction供入口拒绝ambient ALS事务；不能用嵌套withTransaction假称三段独立提交。最终output.publish在同原Run CAS写OutputClaim、child_budget_closed/task_local_output两收据、output Attempt completed settlement、Root.completed及原steps/event/command/祖先计数；Root.outputClaims只允许本run唯一{runId,claimId}，首次完成及历史Root读都须完整相互一致的proof。通用control不能凭status或孤立claim引用伪造成功。

排除变化的child Attempt/Result ID。claimId为oclaim_+H({kind:'task_local_output_claim',runId,outputKey})前32位，沿现有output record token保存。Claim沿§7并增加schemaVersion=1，operationRef={kind:'task_local_output',runId,outputKey}、status=committed、domainReceiptRef=null；它不是RP正式assistant slot。

child_budget_closed receipt闭集为{schemaVersion,receiptKind,receiptId,runId,epoch,authorityRef,reservationId,parentReservationId,budgetCeilingDigest,reservationRefs,budgetAttemptRefs,snapshotDigest,decisionSeq,createdAt}，只保存原bank selector/typed refs/精确摘要，不复制金额或建立第二费用账。两个receipt ID分别为oreceipt_+H({kind:'child_budget_closed'|'task_local_output',runId})前32位。原publication、producer/output settlement、traversal/edge、源/权限与closure必须完整关联，receipt不得领先Root。

末await明确原撤权仅在写前preflight封装deny，先提交合法父取消/Binding/Chat编辑删除/header迁移，再事务外拒绝output。最终CAS ACK未知只观察同稳定claim/完整proof；冷开只读历史metadata，不能恢复capture/正文消费grant或重发。

真实child完成后内部startRp返回pending_return及既有parent/child/effect/Result refs，增加outputClaimRef/outputReceiptRef；费用未闭合仍pending_output及null output refs。父Attempt仍waiting_child，没有durable parent return、ResultPort、父Context/Model continuation、正式Chat正文或新HTTP。FS/SQLite与定向守卫证据归同一Record第四十一组；本组SQL、外部账单/开放文本质量、三端完整客户端未运行，P3 Gate仍NOT_READY。

### 17.52 原父permit重新准入后的耐久Handoff return

原RP父callback必须await唯一Scheduler.withResourceHandoff完成并真实重新取得原permit，再签内部opaque rpReturnCapture。私有parentMap阶段为delegating→waiting_child→resumed；物理permit回来时仍waiting_child，只有原HandoffReturnController.returnChild持久成功或ACK未知观察到完整事实后才改resumed。scope冻结原Host/Engine/owner、父callback capture/source/request/operation、精确父子PlanRef/Run/epoch、原父inputRefs/inputDigest/grants以及child output/Result refs；JSON/foreign Host/裸refs不能签发，child后台capture不复活。返回控制元数据不提供正文消费或新send许可。

当前profile固定根父与一个直接child，不把单并发测试当通用嵌套return授权。

原Run祖先(以child lineage取得父子锁)→Source→fresh Engine，preflight末await明确撤权先提交合法事实再事务外拒绝。run.returnHandoff同原父CAS写唯一HandoffReturnReceipt、父Attempt waiting_child→running和原steps/event/command/祖先计数；inputRefs/inputDigest/effectiveGrantDigest/budgetRef/startedAt保持原值，不把child Result覆写为父输入。原Run.control自身核完整return proof，单有running状态或缺收据不能通过。写后错误整事务rollback，先前已completed child和原费用不回滚；重复调用不重计步骤或重发Model。

receiptId为oreceipt_+H({kind:'handoff_return',childRunId})前32位，存原父receipt kind；没有第二正文或费用writer。历史reader核严格物理identity、父原输入/Plan/子Plan、Handoff token、完整output/closure/Result和父Audience，不要求当前Source活跃，也不授active parent capability。ACK未知只观察同一稳定receipt，saved/no-save区分；冷开只读历史，不恢复scope/正文proof或发送。

内部startRp在成功return后返回pending_continuation及原refs并新增returnReceiptRef；父Root仍running，原Attempt running，未增加第二Model/send、Result展开、父Context/Memory、正式RP聊天正文、Root completed或新HTTP。费用未闭合仍pending_output，不签return scope。下一步必须在本真实父callback、private phase=resumed且capture失效前接受限ResultPort→原父Context→原Narrator continuation，不能从pending_continuation或冷metadata重新造grant；具体分次FS/SQLite、ACK/cold、撤权/写后失败及最小相关回归归同一Record第四十二组；SQL/真实外部费用/质量/三端全流程未测，P3 Gate仍NOT_READY。

## 17.53 原父Result消费与真实Narrator continuation

第四十三组在同一parent callback/phase=resumed、opaque return capture仍有效时调用ResultPort.readForParent；只收capture，拒caller ResultRef/body/Audience/grant。核原Host/owner/Run→Source边界、父子Plan/epoch、原父input/grant、HandoffReturn/Result publication/Audience/closed bank。历史receipt不能重建当前读取或发送权。

原父rpCapture/request/Route与native_rp_intent保留，新Effect绑定acceptedResultRef/returnReceiptRef/parentInputDigest；复用原父Attempt/input/grant，不另开父Run或预算。真实父Model请求发生在Scheduler permit归还及durable return之后。

成功返回原父Model wrapper/runId/effectId，delegation字段只含child已return的metadata。尚无正式Chat写或父Root.completed；P4唯一slot/marker saga继续实施。

## 17.54 原RPControl输出WAL与单Chat marker协议

第四十四组扩展原RpRunControl.outputReceipts，strict prepared/writing/committed收据绑定exact input/variant/purpose/assistant slot，outputKey排除Run/Attempt，operationId由原authority固定。rp_narration显式text/maxBytes policy；只有真实原Narrator Model wrapper和活parent callback签发的opaque output capture可prepare/begin。原Run lineage→Source→Chat→Engine排序保留，ambient事务拒绝。

独立Native prepared→writing CAS只有明确成功返回者获得一次性进程内permit；ACK未知不补permit。FS完整Chat原writer改用既有durableWrite文件fsync→rename→目录barrier，不宣称硬件断电或跨Native/Chat原子。

独立reconcile只观察完整marker和真实payload/source；writing无marker为unknown，不重写。committed保留历史DomainReceipt/currentness分离，用户合法编辑或删除不撤销历史费用/receipt。原save/append/patch/whole-message patch保护marker，保留合法内容编辑；原saveRaw仍仅受信migration用途，无Browser调用。

本组产品startRp对显式rp_narration仅prepare WAL；物理begin/Chat/reconcile经真实scope在专项测试调用。Host输出Effect/原local费用/Graph traversal/OutputClaim与父Root终结尚未接通，下一组继续，不能把prepared展示为正式成功。

## 17.55 原RP正式提交的Host Effect与唯一原local费用

第四十五组接内部RpOutputController，显式chat.output发布机制只认原RpControl/ChatRepo与rp_narration/assistant/text policy，不赋予运行grant。Host输出Effect加入后复读原Model收据/原input与grants、原Root/fence、当前Plan/Binding/source和原bank，不把新waiting_effect当Model未完成，也不从历史metadata造scope。

独立原Effect.prepare→原bank rp_output local admission→Effect.ready/claim→原RP writing CAS→原单Chat writer→原RP reconcile→原local实际usage settlement→原Effect.observe。普通原Narrator请求精确授权这一次assistant append（R2、原domain policy无需额外审批）；不扩至Project/World/其他slot。实际写前必须持有同活scope注册的真实dispatch token及原bank admission，fake/clone/cold/ACK未知不补permit。

Chat ACK未知只reconcile；domain收据ACK未知与Host Effect receipt ACK未知只观察各自稳定事实，不重复Chat。合法Run取消或source改动在最终原bank await提交后拒正文。当前成功output.status=committed只表示原domain提交，Effect receipt可能仍pending；原父Root保持running，无OutputClaim。Graph output traversal/唯一owner Attempt/严格终结继续下一组，不能将该中间状态发布为Run completed。

## 17.56 正式Narrator Result与原Graph output owner接线

第四十六组把chat.output能力移到唯一output owner，agent只保留generation.send及可选delegate。原真实Model completion在同原Run CAS写有界Narrator Result、rp_narration_result publication、producer completed settlement与Root.resultRefs；Audience精确同Run/epoch/Source/control/outputKey/output node/grant，disclosure=same_source_rp_output_only，不能当parent Attempt Result或跨域grant。

原Transition.advance沿真实agent→output边消费该ResultRef，写traversal/edge admission、原计数并创建output Attempt，原AttemptController激活后才prepare/claim正式Chat Effect。新Effect属于output Attempt；producer只保留原Model Effect和结果引用。正文scope依旧仅来自活Narrator wrapper，Result历史事实不能恢复执行权。Result/settlement写后故障全组rollback；后续traversal故障保留先前已提交Result和真实费用，不写Chat。

当前domain提交/Host Effect确认已贯通，但output Attempt尚未终结、Root.outputClaims为空，父Root仍running。严格RP OutputClaim/原bank闭包与Root.completed下一组继续；Result/Graph局部通过不核销完整P4或最终Gate。

## 17.57 RP原bank闭包、严格OutputClaim与父Run终结

第四十七组在独立Chat/原RPControl/原Host Effect提交与费用结算后，由同活opaque Narrator scope调用RpOutputCompletionController。先核当前原Root/epoch/fence/Binding/Plan、原Result/Audience、唯一output Attempt与已确认Effect、原domain receipt/完整marker/实际payload/current input，要求当前Chat恰原input+一次assistant回复；新输入、改文、删Chat、迁移、Binding撤销或取消不回滚其合法事实，也不倒写Chat。

原shared bank增加只读inspectComputeEffectClosure，BudgetPort.observeEffectClosure仅复读该Run精确Model/output Effects的原rows/typed refs/settled与原overrun判据，原余额/额度/reducer不变，无第二价格/余额。child闭包仍沿既有HandoffReturn/task-local receipts。unknown/charged/overrun不签terminal claim；原authority在同scope结束前记录晚到费用后可据真实闭包完成，不二次send。

最终独立Native output.publish CAS同组写RP OutputClaim、原cost closure receipt、output receipt、output Attempt completed settlement与Root.completed/原计数。正式outputKey仍跨Run稳定，claim ref按own-run固定；claim绑定原Result/consumer/operation/DomainReceipt。原Run自身在首次success提交与冷读时按OutputContract分派严格RP/task-local proof reader；RP proof关联完整Result/Model/child return/Graph traversal+edge/producer+output settlement/原Chat receipt/Host Effect/typed costs，不因存在孤立completed字样或claimId就通过。Root冷读另核不可变graph contract等于原published Plan。

内部startRp对该显式有限profile返回output.status=committed且output.runStatus=completed、outputClaimRef/outputReceiptRef；domain已提交而费用或Host receipt仍未知时runStatus=pending_output，无terminal claim。ACK未知只观察，写后故障回滚整个Native终结组而保留既有Chat/费用；历史完整proof在合法编辑/delete/cold后仍可审计，不恢复正文或执行scope。此为有限RP子链实证，不核销其余Session/Project/Evolution/通用Graph/UI/四Engine/三端或完整P3/P4 Gate。

## 17.58 原Scheduler finalization与运行态发送许可分离

第四十八组为后续Native Session消费者补原Scheduler实际finalizer scope。该callback finally退出即删除，仅同Scheduler/operation/实际execution boundary/attempt/owner/source/resources在真实running membership且status=finalizing时有效。原assertActiveBoundary仍只认running/streaming，finalizing永远不能继续Model发送。

原Native Turn permit可在同一真实finalizer内一次换取原NativeTurnFinalizationPermit，绑定原Host/selection/source/invocation/request/resources，拒JSON/clone/foreign/过期/运行态/重试边界；不产生银行准入或正文grant。资源与不可打断CAS语义归原Scheduler，不新建调度器/持久authority，旧finalizer忽略额外参数即可保持行为。

下一步沿原GenerationHost.prepareTurn→Scheduler.finalize与原SessionCore.finalizeTurn接活Narrator完成scope和原领域收据，不把finalization凭据当Model grant。

## 17.59 原Narrator输出阶段的精确quota身份

第四十九组新增只读assertNativeTurnOutputQuota，将原Narrator quota proof与同原始Turn permit的一次finalization scope关联；相同owner/source/request元数据的后续新operation不能借旧quota；resolver/后台、clone、额外allow字段或已结束scope拒绝。

原已准入费用的观察和晚到结算保持可用。本组尚未将该helper接入Context输出复读或Session正式输出writer/claim，下一步继续；不能把phase witness当Source/Disclosure/Commit授权。

## 17.61 原Native Session产品finalizer的活输出接线

第五十一组将原ModelPort实际返回wrapper及其原Narrator Context私有关联到原prepareTurn产出的prepared对象。只在原对象上绑定一次；clone、foreign Host/owner、改写envelope/provenance或替换原authority/knowledge proof不能消费，finalizer成功/失败均不再取得第二次提交scope。原executeNarrator仍清理强引用runs/modelScopes，完成事实只经WeakMap保留，不从JSON/metadata冷恢复。

合法同事务Memory/Binding撤销、Run取消先提交后拒正文；普通运行态Model permit在finalizing继续拒绝。后续需精确识别本操作自己的领域Source推进。

## 17.62 原Session Turn稳定commit与精确领域收据

第五十二组由原SessionCore.finalizeTurn基于原session/branch/expectedRevision/invocation派生稳定commitId；正文、Task记录与commitReceipt仍由原SessionRepo.commitSnapshot同事务保存，不建立第二writer/journal。

领域tag明确native_session，不走RP收据或放宽通用Source。

产品finalizer仅在该收据与原返回Revision一致时接纳本操作自己的Source推进。原writer抛storage_commit_unknown后只读同commit；有完整收据才读取当前原Session结果，无收据保持unknown并抛原错误，不调用第二次writer/HTTP。历史冷读与合法后续输入独立，不恢复live scope。本组尚无Session正式Result/Graph output Effect/OutputClaim，领域已提交不表示V3 Run completed。

## 17.63 Session正式Result、Graph output owner与原Effect/银行

第五十三组为显式有限rp_narration/assistant/text policy接原Session正式消费者；output节点独占chat.output，agent仍只持generation.send。Plan发布机制证据按可用原SessionCore或RpRunControl分别标记，实际运行必须走精确领域producer，不从发布证据生成grant。现有有限result profile仍处于P6前构建中，不作为完整Session出口。

与RP/parent audience封闭隔离。真实TransitionController经过原edge创建output Attempt，原S2 Effect prepare/ready/claim及唯一原bank session_output local work先于SessionCore writer。末预算await后复读Context、Run与prepared正文/proofs；合法同事务Memory撤销提交后拒写。只有原领域commit receipt与原local结算才确认output Effect。此组尚无最终OutputClaim/Run终结。

## 17.65 Project结构化Model完成证明

其它principal的工具响应不能成为text Result。最多32个调用与原Task attempt上限一致。该证明只证明原Provider响应，不授工具执行权；原Project consumer仍拒工具，需后续原Task Effect/收据与同操作Source推进接入。

## 17.66 原Project只读工具Effect与原Task收据

第五十六组为有限单轮Project profile接显式project.read能力和逐工具原descriptor pin。运行必须持实际Scheduler generation capture、原Model wrapper与其精确调用id/name/args、同Root/Attempt/Source及声明的pin。generation.send单独不能执行工具；未接的Skill/提案/Review仍拒绝。

每次调用先准备独立S2 Effect、原Task bank project_tool费用，再ready/claim；只读收据不允许executionFingerprint推进。

原实际返回body在私有permit保留，Task ACK未知只读原已保存精确receipt；无receipt拒绝且不重复writer。Host Effect ACK未知同样只观察精确原Host receipt，无收据保留pending。普通Context/Source/Model不放宽。末消费用withConsumption提交合法同事务撤权后拒正文，原调用和费用保留。ambient Engine事务、clone/foreign/过期permit/凭证JSON/重复调用和同fingerprint无关调用均拒绝。

不能把原writer包进Studio queue，否则原getProject会等待同一queue。该能力不完成Project OutputClaim、多轮Graph、提案/Review/正式Commit或P4全域Gate。

## 17.67 Project原工具耐久收据关联读取

原Task receipt与费用已完成但Host ACK缺失时只返回原事实及hostReceiptRef=null；要求Host确认则拒绝。无body、permit、Source推进或新工具权限。

原活scope清理后可用重建的原服务读取历史；后来Project推进不抹去原调用事实，亦不能据旧事实重开执行。缺receipt或费用不补造。后续提案Source推进必须另接原真实修改收据与同Run归属，本reader自身不授该能力。

## 17.68 原Task计划写入与活操作owned Source推进

第五十八组有限Project profile加入显式project.propose与精确atri_agent_set_plan原schema pin；目前只接原Task计划，不授正式Project/Workspace修改、Review或Commit。实际单个Model响应可先执行已准入只读调用，随后至多一次末尾计划写入；未授pin、改args、写后再调用或多个写入均拒绝，不暗中拆Run/重发Model。

原executeTool同原Task CAS保存计划和nativeReceipt。初始Source与原Root.sourceBinding/budgetAuthorityRef保持冻结。独立原Task编辑无法借用该推进，普通Source/Model/预算准入仍拒旧Source；尚未开放下一轮准入。

它不授新Model。原Task ACK未知saved/missing只观察原领域事实、不重复writer；末费用后独立用户编辑保留，但拒本次结果正文。Root仍未completed，多轮、其余提案/Review与正式出口继续实施。

## 17.69 同Root原Project Source与原银行连续性

第五十九组新增精确原Root的owned Source只读证明：从冻结初始指纹，按原Task sequence串接本Root全部原工具receipt，每项要求原Model/Effect/pin/费用及Host确认，并核当前原Task指纹和实际Project revision恰为链尾。缺Host确认、缺费用、独立用户编辑/Project推进或另一Root均不能借用。不带Root继续拒旧Source。

原BudgetPort在实际Task Source变化后，仅对具有上述精确原Run/银行引用且仍running、未取消的原receipt链继续使用同一原Task.compute，不换operationId、不建新账、不清已收费用。它只证明同一银行的连续性；同初始Source的另一Root仍过不了自己的Source证明，过期原Model scope仍拒。多轮Graph与下一轮capture尚未交付。

## 17.71 原Project轮次完成与实际对话证明

第六十一组原Studio runner与Native consumer共用纯对话拼装helper；原Model响应和私有保留的实际原工具返回值生成唯一预期public transcript。原Native finalizer要求同实际generation/Model wrapper/receipt及精确transcript，再只调用一次原Task.finishGeneration；改文、复制/过期scope不能保存为真实完成。

历史reader核原Task generation/append-only conversation prefix、Model payload/snapshot/原费用、全部Tool receipts及同原Host command，返回事实不授下一轮；当前仍明确round=0。

原Task完成ACK或Host CAS ACK未知均只观察；缺精确收据不重复writer/Model，原runner的failed收尾亦不能第二次改写同已消费原finish。原Task可已completed而Host receipt缺失，仍无V3 Root claim。没有同Root多轮或正式Project提交宣称；Graph循环与各出口继续实现。

## 17.72 原Project同Root有界Graph轮次

第六十二组支持显式agent→output及至多一条agent self-loop，原Plan maxVisits/maxLoopIterations与实际preflight maxModelRounds共同约束1–12轮。原Scheduler operation及外层requestId只创建一个Root；每轮消费原Task/Model/tool/project_round事实、原Attempt settlement与同Task银行closed后，才通过原TransitionController、EdgeAdmission和计数准入下一轮。初始Source/budget ref冻结，下一轮逻辑input显式绑定当时自己的Source指纹；previousSystem只能取同操作实际上轮值。

私有继续许可由真实上轮工具数、实际耐久settlement和原费用闭合产生，序列化收据不授执行。历史reader逐轮核原Graph traversal/edge/command及前轮receipt，独立编辑/Binding改变/取消/改system拒下轮且保留费用。未知费用保留原Task已完成但producer未settled，不发下一次Model。共享tool transcript只省略Task形返回中既有conversation/attempts/timeline及compute，实际费用仍完整绑定原receipt/ledger。Root最终出口尚待实现。

## 17.73 原Project提案与Workspace Review

第六十三组为原project.save/resource attach/update/fork/source write/move/delete/frontend.patch、reuse_plan/reset_operations与prepare_review逐工具开放同project.propose的精确原descriptor pin；仍只能消费原Model实际call，单次响应只允许一个末尾Task修改。它们全部调用原Task提案/原Workspace评估，不能正式Commit。prepare_review产生的review/blocked/conflict只在同操作私有已接受精确receipt指纹上允许完成本轮元数据与结果消费；

SourcePort带同Root的currentness可核原Model/工具/Host收据链后观察自有Review终态，历史read不生成新permit。原Workspace内部评估中间持久化与最终Task receipt分开，ACK未知只接受真实最终receipt；缺失时不重复evaluateWorkspace，原恢复/repair继续归原Task。正式项目修改仍需原用户Review/Commit，V3不新增Commit工具。

## 17.74 Project Review Result、Graph输出与完整原银行闭包

`d703706dc` 为显式 project_review/json policy 接真实原 generation completion、prepare_review receipt、Task 对话/指纹和全部轮次的原银行事实。原 Task/Project reader 可在同 Engine transaction 内读耐久事实，历史读取不需要或恢复活 scope。发布有界 json Result 后经真实 TransitionController、EdgeAdmission、output Attempt activate，再同 CAS 保存 OutputClaim、费用摘要、output settlement 与 Root.completed。claim 的 domainReceiptRef 指向原 round/Task Review 链，不表示正式 Project Commit。

合法同事务 Binding 替换/取消先提交再拒成功。历史 proof 交叉核 Plan/Result/producer/round/工具/Host command/traversal/费用。command 物理保存前只允许同原事务的 terminal proof 跳过它自己尚未保存的 command；后续 get/历史事实读取必须有精确 command。发布、终结 ACK 未知只观察原事实，不重复 Task/Workspace writer 或 HTTP；写后失败回滚整组 Native metadata，已存在的原 human Review/费用保留。

## 17.75 公开Authoring指纹与安全Run Projection

同一原 authoring namespace 新增 `/plans/revision`、`/dependencies/inspect`；

`RunObservationService` 通过原 owner/Source inspector 与原 RunRepository 实现 `/runs/list/observe/details/diagnostics/cancel`。payload 只有公开元数据和原银行费用汇总；Result、模型/Context 内容、Secret、nonce、input/grant/dispatch capability 不投影。封闭 Timeline 类型映射 opaque eventId，内部 eventSeq 不作为可见 stream seq。Cursor 在 Host bounded Map 中，5分钟过期；observe 单次推进、固定 limit，分页与状态版本/epoch/visibility绑定，断线/重启/过期/并发重放/权限变化要求重新 snapshot，断连不取消 Run。详细 wire body 与 delta/window 语义唯一见 [当前接口快照](backend-integration.md#run-观察与取消)。

不开放通用 start/resume/reconcile/approve。Projection 只显示其真实 controls，可信 Review 仍 unavailable。

## 17.76 普通RP显式预检、原来源身份与HTTP启动

`e1eaeeb22` 在原 Native generation namespace 增加 `/rp/source`、`/rp/preflight`、`/rp/start`。source 只调用原 RpRunControl.bind；预检实际末条 user 输入、精确 PlanBinding、有限 rp_narration/assistant 图、原 Route/配置/预算，不发送 Provider。不从请求接受 grant 或 caller context。

同一已知 requestId/原 input/预检操作只返回原 operationId，即使正文已推进；变化拒绝。新 Host/冷 Run 的未知结果沿耐久 Run/receipt 拒重发，不从 Scheduler 状态制造执行许可。RP Scheduler 不保留可公开下载的完整模型 wrapper，只给原 operation status 一份安全 refs/output observation；正式正文重读 Chat，耐久运行由 §17.75 观察。Wire 字段及指纹响应头见 [当前接口快照](backend-integration.md#普通-rp-与-project)。

## 17.77 有限原生Plan strategy候选与原Evolution

首版只接 plan-strategy 的九类 limits 字段收紧；不接受能力、输出、Source、Secret、任意 path 或额度增加。候选不改作者 Draft/current revision、不改既有 Run，原 Evolution journal 的 beforeCommit gate 先接受，再进行精确原 Binding CAS；未知 ACK 可由原 candidate/Binding/command 调和。

rollback 只认当前自己的 desired Binding 或精确已保存 rollback command，不能覆盖用户重选；回滚后的候选不再次激活，discard 不删除已发布不可变历史。scope 必须同原 Project/Task 或普通 character RP chat subject。新原生 Binding 的 catalog/capture/evaluation/publication 不回退历史 workspace/Director 或旧 targets；未绑定旧域的构建期能力仍待 P6 一次清退。

原生 plan-prompt、其它 strategy/来源、Native Evaluation worker 仍未接；新 nativePlan settings 在 evaluator worker 执行前明确 unavailable，auto configure 拒绝，旧 report 无新资格。evaluator revision 纳入原 Plan/authoring/contracts 实现指纹。这里只是有限手动 Review 候选/发布合同，不核销完整 W07 或后端 Gate。

## 17.78 原生 Plan Prompt 候选与原存储发布

第六十九组将原 Plan evolution core 扩展为 `plan-strategy | plan-prompt`：Prompt target 精确到绑定版本、PlanRevision、Agent 节点与 Library 模块，当前消费原选定 Prompt Preset 中的 `system.style` 模块。声明复用原 PromptCandidateStore，候选由原版本资源 authority 生成 exact module/program；

新 immutable PlanRevision 的可选 `evolutionSource:{target,promptCandidateRef,resourceRefs}` 保留原候选与 exact refs，供原资源删除/GC 作为保留根；策略修订继续继承它。原 Prompt candidate discard 不能删除仍由历史 Plan 引用的资源。

当前这些原存储共享同一 Engine；原 Evolution journal 的 intent/finalizing gate 先提交，再在同一原 Engine 事务内精确 CAS 原 Route 和 PlanBinding，最后由原 journal 写 receipt。没有宣称独立存储引擎之间原子提交。中途写入失败回滚这一实际共享事务；ACK 未知重新读取两项权威。发布会修改所选原 Route 的 Prompt 指针；复用该 Route 的其它固定旧 pin 会过期并拒绝准入，不能静默转用新 Prompt。并发 Route 或 Binding 变化均拒绝，回滚只接受自己的精确 Route/Binding；已运行的 Plan 和费用不回退。

原生 Eval worker、其它 Prompt 模块/策略/来源仍继续实施；当前两类原生 target 都明确禁止自动配置，不能借旧报告晋升。并非完整 W07 或后端完成。

## 17.79 有限原生 RP/Project 隔离评测

`a7cb649d0` 的 `evaluationSettings` 输出 `nativePlan:{planRef,revision,sourceSelector}`、`runtimeRouteId`、version，Prompt 候选额外指原 exact desired program。原 Evolution review 配置/实际比较强制使用选定 Route；普通 RP 使用原 narrator 角色，不能改用旧 orchestrator evaluator。worker 对 Native settings 只加载 `evaluation/native-adapters.js`，不调用旧 Director/MessageTakeover；历史 evaluator 仍留给尚未 hard cut 的旧非 Native 路径，Native binding 不 fallback。

它运行同一 Native Host/Run/Effect/Context/预算/Output controllers，不复制生产授权活 scope，不接生产 writer/Secret，不由 Browser 回调拼成功凭证。Project 的原 idFactory 在私有域创建 exact Task identity，以消费原 Plan 工具 pin，不改写冻结图或伪造 Task receipt。原生试验配额属于这些原服务；真实 Provider 发送仍仅由父 Host 经原 Evolution ledger 先 reserve、再 Secret/send、最后 settle，report 的费用只采用父账本，未报告费用仍 unknown。

这个控制挑战不发送父 Provider、不虚计真实费用。Project 为有限 `project_review` 图，精确原工具、同 Root 有界多轮及原 Review 出口；原 conflict/repair 试验分支依实际原 Task/source 准备；不支持的图或 M1 Project pilot 仍明确拒绝，未测项不核销。

评测指纹增加实际 Native adapters、Controller/Context/Source/预算和 RP/Project 正式输出依赖，旧实现报告不能延用。Native 自动配置/晋升仍未开放，缺独立资料、完整场景、真实质量/价格等证据不能用合成正例或手工批准冒充 eligible。此组不是完整 W07 或后端完成。

## 17.80 隔离 Review Origin 后端与原用户再认证

第七十一组实现同 Host 内按需启动的 `127.0.0.1` 独立端口 listener。没有 approve 路由或 nonce。隔离 origin 的 `GET /review?launchRef=...` 当前只返回页面所需 JSON bootstrap；实际页面仍属后续前端工作。

Review listener 不使用主 app middleware/cookie。独立随机命名 HttpOnly/SameSite cookie、五分钟会话和 CSRF。只有三个 POST：`/review/reauthenticate` 收 `{password}`；`/review/details` 收 `{}`；CSRF 通过 `X-Atria-Review-CSRF` 传入。CSP/COOP/frame/referrer 响应策略沿 §15；详情为 JSON 纯文本数据，后续页面必须安全编码。空密码/OAuth-only、禁用、账户版本或权限变化均拒绝。失败登录限流独立于模型 API 测试限额。

原 ExecutionService 提供 `approvals`，仍写同一 ApprovalController/EffectController/RunRepository。原领域必须提供真实 `describeReview` 与既有 Effect authority；缺失就不能请求审批。批准不是 dispatch；原 Effect claim 中再验原账户，和 Approval 一次消耗同事务。

只读 Review 的等待态允许 `waiting_approval`，没有放宽 Model/Result 正文消费的 `running` 要求。Controller 的 pre-write denial 只提交原 authority 在 await 中发生的合法取消/撤权事实，不生成成功命令或审批记录；写后错误仍回滚。未知决定 ACK 返回 `storage_commit_unknown`，只读原 Approval 观察，不再提交另一决定或派发。重启没有旧私有 challenge/session，旧 nonce 不能恢复身份或授权。

本组是审批后端和账户接线，不是任意 R2/R3 能力注册、原领域正式批准消费或浏览器隔离实证。现有只读 ToolPort 的风险 ceiling 未扩大；没有安全原领域动作的 R3 继续拒绝。远程代理的独立可信 Review Origin、真实页面与三端流程尚未交付，非本机 launch unavailable。其余消费者、Eval 与完整 restore/release/GC 继续后端队列。

## 17.81 原生 Project M1 开发来源执行

第七十二组的 `evaluation/native-adapters.js` 支持固定 `project.m1.related` 开发资料。已有 Task 在原人类 revision 后发生真实 commit 冲突，另建 exact 新 Task，不 rebase 旧任务。新 Task 先通过原 prepareReview 留下真实 missing-binding 诊断，再由原 Native Project Executor/Plan/Ports/Graph/银行执行 read/reset/proposal/review，并完成原 Root。没有用 V3 metadata 替代领域结果。

`fixture-source.js` 纳入原 evaluator 指纹，原报告随 fixture authority 实现变化失效。主 Host 仍是唯一真实发送/Secret/费用 authority；私有 fixture、生产 Source/Binding 和收费状态边界保持。

## 17.82 存储 generation 与 Run 观察恢复边界

`61b68d009` 将原 HostFence 的 `generation` 纳入 Run 观察判断及 Host 私有 cursor 状态。相同 boot 内 restore 后，旧 Run 仍须 recovery；不能仅因 bootId 相同就显示可取消。projection/list/details 的旧 generation cursor 返回 resync_required，重新读取 snapshot，不拼接恢复前后的分页或 stream。generation 不成为 Browser 可指定的执行授权；观察仍不 rebind Run、不恢复 scope、不写预算或派发 Effect。

## 17.83 显式 Run Host 元数据恢复入口

`e022f8d58` 新增受原登录/CSRF/boot mutation envelope 保护的 `POST /runs/recover`，body 为 `{runId,expectedEpoch,expectedStateVersion,expectedGraphRevision}`。沿原 source inspection、RunRepository.recover 和原 Engine CAS；新 boot/存储 generation 只重绑 root、增加 epoch、失效未消费批准，非 terminal Run 留在 blocked 或有 pending Effect 时 reconciling。原来源/Plan、Attempt、Effect/dispatch 历史、预算引用和逻辑计数不重建、不清零。

响应只有 `{runId,status,cancelRequested,resumed:false,versions}`，没有正文、dispatch token 或新执行许可。客户端重取 snapshot，旧 epoch cursor 失效。相同 commandId 精确重放观察已有 outcome，unknown ACK 不换新 command 自动重发。Projection `controls.recover` 反映当前 HostFence 与 Run 是否不同；`resume/reconcile/approve` 仍需各自原领域能力，不能将此入口当成未知外部结果已核销或运行已经继续。

## 17.88 原后台 Task 采纳与正式 V3 输出闭包

源码 69cb70b27 将已有有限原 pending-outbox 后台 producer 接到正式 Result/Graph/OutputClaim。仍限原 active scope、非 simulation/appraisal/resultBinding 的单 Agent → Output JSON 图；现在要求显式 JSON resultPolicy。任务定义、原输入/intent、配置、Route pin 和实际 Scheduler operation identity 在发送前冻结，沿原 generationBudget/窗口/周期、Context 和原银行，retry:false 不变。

原 NativeTaskScheduler 提供真正 finalization boundary。原采纳和 Result publication、真实 Transition/Attempt、OutputClaim、Root.completed 使用同一个原 Engine 事务。

Result 新增精确 session_task audience，绑定 Run/output node/epoch、原 session/branch/revision、invocation/task/variant、source/grant 和唯一用途。

已知 Task 采纳可保留 bounded Result，但原费用未关闭时不创建 OutputClaim 或完成 Root。原采纳的历史 receipt 总是保留 exact adopted revision，之后 await 中发生撤权/取消仍提交该事实和撤权，拒绝完成与正文返回；不恢复 source/scope。其它失败回滚同事务的原采纳和 V3 输出元数据，先前真实模型费用保持。未知事务 ACK 只读原 Task/Result/Output 事实；不能证明保存时继续 storage_commit_unknown，不重复 finalize/Task writer/Model。产品观察增加两个安全事件，无正文；新实现/共用规范化函数纳入 evaluator 指纹。

## 17.89 原 Review 节点 maxRounds 策略候选

源码 0342ffd76 将既有 plan-strategy 的封闭 fieldPath 扩为 reviewPolicy.maxRounds，物理值仍只有 exact Review node 的原 policy.maxRounds，不添加第二套 Review 配置。原 catalog 仅列大于一的节点；declaration/candidate 钉同一 nodeId/Binding/PlanRevision，候选只能减少且不低于一。其它 Node 类型、任意路径、增大或禁用 Review 均拒绝。

捕获、candidate metadata、expected revision closure 共用同一受限字段 reader/applier；限额、兄弟 Review、capabilities、Output owner、来源与 Route pin 不变。保存未知 ACK 沿原 exact command 观察/重放，不调用模型。此项只交付实际既有配置的策略候选，不代表 Review/Judge/Planner 运行 producer 或质量/晋升已通过；已获准 routeRef 的完整候选接入仍需原 authority。

## 17.90 Project Model 请求的精确工具目录

源码 8d33bfb3d 修复原 Context round 向模型展示完整 Project/Skill 工具、执行却只允许 Plan pins 的不一致。缺失/重复/外来 descriptor 拒绝。

共享原 Prompt/round builder 接收显式 tools 时不再自动追加 Skill 工具，并省略不可用的具名操作指引；原始无 scope Native 服务的完整目录保持原行为。模型仍编造目录外工具时，原 GenerationService 已在响应规范化阶段拒绝，后面的原 Tool/Effect 围栏继续存在。新共享 Prompt 实现纳入 evaluator 指纹。

## 17.91 显式开发探测的原 Route 输出上限

源码 57accfd1b 的原 source_probe 可由 Host 内部 sourceProbeConfiguration 从原 Route/Resolver 取得明确的有界非流式输出配置；上限必须在原 Model output/context 范围内。配置不可变，身份仅在该 Evaluator 私有 WeakSet，只有固定开发 probe 的活动 job 对象可用，且只准 baseline。复制配置、外来/结束 job、candidate/judge/extraction 和非 source_probe 比较均不能取得该能力；实际 rendered cap 须与本次预留输出一致，并继续同一原 Evolution ledger/Provider/Secret 边界。

正常 configuration/compare/send 的1024上限、独立资料与价格/晋升 Gate 不变；开发 report 仍非 eligibility 证据。native-live 开发脚本不再把私有明确 output cap 截到1024，实际额度仍归共享 M1 quota/lock 和原 Source/Run/Model bank。没有 Browser 配置开关或自动扩额。

## 17.92 Project 原批次合同的模型指引

源码 a90f48f6e 的原 project-tool-contracts 定义唯一 PROJECT_TOOL_BATCH_POLICY：每个响应至多一个 proposal，且只能在所有 read 之后。Context currentness digest 与实际模型 Prompt 读取同一 policy，并只列当前 pins 中的 proposal 名称。模型须等上一个提案的原工具返回后再生成下一提案，不能同响应批量 reset/plan/write。原批次拒绝语义与 Tool/Task/Effect 权限没有扩展。

## 17.93 原 Project 已结算轮次的持久阻塞

仍未 Review、未 Commit、未授 resume，不重发或重建预算；普通内部 result profile 保持原行为。

判定只来自当前 Scheduler operation 内不可复制的原轮次 completion。原对象 payload、Task generation attempt、conversation/fingerprint、原 Source/Binding/Host、原银行都在最终 await 后复读；合法取消/来源撤权先提交再拒本次元数据。Root 的原 limits/费用/进度不回退。ACK未知只观察同一 exact receipt，不重跑 Model/工具/Workspace。Projection 只增加 project_generation_stopped 安全事件，不输出正文或自由 reason。

## 17.94 Run 限额与原银行容量观察

Run snapshot 新增 execution，包含 immutable Plan limits、原 progress 与 treeProgress 的封闭数值字段（不返回内部 edgeVisitCounts）；capacity 沿 BudgetPort 的同一原 Engine 事务读取原三域银行 inspectComputeReservation。顶层明确 original_bank、子 Run 明确 child_reservation，allocationStatus 区分 bank/held/released。ceiling/used/delegated/remaining/overrun 直接来自原 reducer，不另算费用或重置预约。未知 Model 仍扣原 estimatedTokens，释放仅反映原 released 事实；原 costs 继续只归本 Run 的 exact Effect 闭包。

只有仍未终结的 Run 才列 deadline、steps/attempts 或 requests/tokens/local jobs/items/inputBytes 无剩余容量诊断；这些是只读解释，不自动失败/取消/退款/准入或 resume。时间过 deadline 可以更新投影 delta，但不改耐久 Root/状态/历史。没有开始的银行显示 not_started，缺 authority 显示 unavailable，既有 Source/owner/历史可见性/分页与 no-store 不变。

## 17.95 原 Project 异常退出元数据

显式 project_review 的原 prepare/execute/finish 捕获实际异常时，只有当前私有 operation 的 state 可将同 Root 记为阻塞：pending Effect 或未关闭费用保留 reconciling，否则 blocked。唯一 project_failure receipt/command/event 记录封闭 reason 与原 exact Effect 费用观察；不清空/结算 Effect/Attempt、预算或审批，不发布 Result/Output，不给 resume，不重试模型/工具。原错误仍返回。

已取消/终结/已阻塞的 Root 不覆盖；原 Host/epoch/不可变 Source/Plan 与 CAS 仍由 RunRepository 围栏约束。只沿 Root 锁→Engine 的原控制事务，最后 await 期间合法取消先提交，本次失败元数据拒绝。storage_commit_unknown 保留其原恢复边界，不以另一失败命令代替未知结果；失败元数据自己的 ACK未知仅观察同 exact receipt，仍不发送。Projection 只增加封闭 project_execution_failed 事件，无异常正文/stack/Provider内容。

## 17.96 原 Task Plan 提案引用与工具异常

原 ProjectAgentService.setPlan 在写入前拒绝删除仍被原 proposal.stepId 引用的步骤，返回 project_agent_plan_proposals_conflict；保留原 Task/Plan/proposal/sequence。保留旧引用的步骤可修改；只有原显式 resetOperations 清空提案后才可去掉该引用。

实际 Prompt 在已存在 Task Plan 时指引复用当前语义步骤，避免续跑无谓重建 Plan；移除引用前只在原工具目录允许时说明 reset_operations。Native Project executeTool 的实际异常也进入 §17.95 的相同保守失败元数据，封闭 reason 可区分 Plan/proposal 冲突；

## 17.97 原 pending appraisal 的受限 Task 消费者

在已有有限 background JSON Plan 下，支持原非 simulation、executionClass=background 的 cognition.appraise Task。不新增心理/World writer，不将建议作为 World Truth，不开放通用 Actor/Graph。原 appraisal_gate 在 Run 准入前沿既有原域 background bank执行；Run的 exact Effect costs 只归准入后的工作，不伪装为整个 Source 的累计费用。

原 Native Host finalizer 的 appraisal_parse/adopt 使用私有 lane identity、真正 Scheduler finalization boundary 和一次性顺序；复制 lane、非 finalizer、重复/乱序阶段不能取得回调。实际 CPU/wall observation 在领域事务结束后沿同一原银行结算；即使领域/Result事务回滚、ACK no_save，本次真实工作费用也保留。已准入而未执行的阶段记实际零执行/failed，不返还 job额度；单个 settlement ACK未知不阻止另一实际工作结算，仅观察同 exact usage，未知继续保留。

原 SessionCore.recordTaskResult/prepareAppraisalDelivery/原 cognition commands 是唯一采纳权威。Actor状态、原 Task record、delivery marker和有界引用 Result 共用原 Engine事务；费用关闭后再通过同一原 Output controller 的稳定命令补闭 Graph/OutputClaim。unknown Model/local费用可保留已采纳 Actor状态与引用Result，不完成Root、不重发。取消/撤权保留已发生事实；历史 reader 严核原 appraisalEvidence/profile/config/Task/事件，以及 exact parse/adopt费用行、target指纹、稳定ID与合法 usage。Result只有原 Task引用，原 Information展示规则继续隔离 Actor私域、玩家投影和其它Actor。

## 17.98 原 Session 内的 Task 专属 Plan Binding

native_session SourceSelector 可显式增加 taskRef:{taskId,variantId}，只允许原 manifest 中存在的 Task/variant；未知、null 或多字段拒绝。sessionId 始终指向同一个已拥有 Session，entryPointId 只能为 null 或该 Session 原入口。未携带 taskRef 的原 selector 和 bindingId 保持原值。保存、读取、CAS、发布与 Source 授权沿原 PlanRepository，不建立第二 registry 或运行权限。

后台选择顺序为 Task+entryPoint、Task+Session default、generic+entryPoint、generic+Session default；所有候选都限定当前 Session。Narrator 只使用无 taskRef 的原两级 Binding。Task Root 的 sourceRequest 带相同 taskRef，与原 Context capture 一致；sourceRef、原银行、Task/Actor 当前性、Model/egress 和真实 finalizer 权限不变。Run 元数据可按 exact Task/variant 筛选；generic Session 列表包含该 Session 的所有 Root，投影不增加模型正文或 Actor 私域。

## 17.99 原 World Simulation appraisal 的来源闭包

有限 background JSON 消费者现接受原 Simulation 产生的 cognition.appraise pending Task。原 clock.advance 和作者 simulationRuntime 是唯一排队来源；直接调用原 Task 执行入口不能跳过该判定。非 appraisal 的 Simulation profile 仍未开放。

采纳沿原 SessionCore.recordTaskResult、原 appraisal authority 和零时间 Simulation reaction，不推进时钟、不新排另一模型任务。费用/两阶段 Result 与 OutputClaim 继续 §17.97。历史 Task reader 同时读取 Root 的原不可变 Source revision，核原 pending outbox 的完整 digest/active scope/epoch，并与已采纳 revision 的 completed intent对齐；不能只拿终态记录自证曾排队。原 Simulation/Authority/Appraisal/SessionCore 源码纳入 evaluator 指纹，旧报告不能借这些权威变更保持可晋升。

## 17.100 原声明式 Task 命令、交互与最小输入

同一有限 background JSON 消费者支持原 declared_app_command 的 app.command 与 interaction.schedule。模型不能改 domain/command/interaction 或直接写 World。原 Simulation 只允许其合同已支持的静态 app.command 或 appraisal，仍拒绝 interaction job、非 FIFO、非最小输入和非静态目标。

所有声明式结果沿 §17.97 的真正 finalizer 私有身份及两阶段闭包；非 appraisal 的阶段名为 task_result_parse/adopt，注册到原 localWork kind 并使用原稳定 attempt/Effect/target 与实际费用，未新增银行或扩大上限。原 Domain 回滚仍保留真实解析/采纳 CPU；ACK未知只读同事实，不再写命令或发模型。历史 reader 严核 result sink/binding、原 receipt 的决定/目标/Source与 committed revision，以及对应两行原费用。schedule 的 Root 完成只证明原排期已采纳，实际交付仍由原 clock.advance 后的显式 pump 决定，不能当作已交付或用墙钟补交。

精确 context:['input'] 的真实 Task capture 使用空 Context selection 加原 typed Task input；不会读取 Information view、Session history/Knowledge/Memory，也不以缺 view 回落为宽上下文。描述、编译、发送与消费继续核同 Source/Task/variant/input/grant digest、原银行和 Scope；此路径不授 Actor/World 读取权，也不创建通用 Graph runtime。

## 17.101 同节点已声明 Route 的原 Plan 策略候选

plan-strategy 增加 routeRef。候选仅为精确 {scope:'player',runtimeRouteId}，且必须来自该原节点 dependencyPinIds 中已发布的 model pins；至少两个不同的原 Route 才列目标，同值、外来节点/未声明/新造 Route 或额外授权字段拒绝。原 declaration、Binding CAS、不可变候选 revision、发布 gate、ACK重放及回滚继续复用；

catalog/capture 的 allowedValues 和实际提案 Prompt共用原节点 pins，结构化提案 parser 不接受任意 JSON object编辑。候选评测配置读取真正选中的候选 Route；独立质量/价格与已有 Native auto拒绝保持。

Project 的有限消费者允许同节点预声明多个 Model pins，但每次只按 policy.agentPinId 和原 operation 显式 runtimeRouteId 执行，原 tool pins/Source/Model/预算/egress不扩大。原 Project Skill 本地工作也固定使用该私有 operation 的已选 Route，拒绝 caller 替换，不再用“全局唯一 studio Route”猜预算。当前实际产品和隔离 worker证据覆盖 Project；RP/Session消费者的备选 Route组合仍继续接入。

## 17.102 有限原消费者的 exact node Route 选择

原 RP、Session Narrator/Resolver 和后台 Task现接受同一节点拥有的多个已发布 player Model pins。active Route始终为原 policy.agentPinId，caller显式 Route若不同仍拒。仅在 Plan 全局存在、没有归属该执行节点的 pin 不可借用。有限图的节点/边/输出与 capability边界不变；RP委派仍只有原一个 exact child Plan pin，不因 Model备选而增加 child权限。

Session 的 Narrator与Resolver分别按自己的 active pin选择原角色 Route，不再用全局唯一角色推断。JSON复制、外来Owner/Host/Source/input拒绝，返回原有界 route配置不授 dispatch。typed transaction也在 capture时冻结。随后原资源 permits、Model/Secret、费用、Context、finalizer和 OutputClaim继续逐项围栏；未选备选不发送、不多花次数。

现有实际证据包括RP策略发布/原单Chat输出/回滚历史、Narrator冷读、Resolver+Narrator各选其Route的原World提交、后台单Task/银行闭包，以及RP隔离worker的原Plan/Effect/Chat与父Evolution账本。它们仍是有限原消费者，不是通用Graph/Planner/Judge/Review runtime；

### 17.103 控制 Model 与 GraphPatch 的发布机制证据

控制节点必须恰有一个 JSON 输出，且 Provider 必须声明 generation.structured-output。mechanism evidence 记录 nodeKind 与 original_native_graph_producer_required，不生成 Scheduler producer、Source grant、Context 或运行许可。

实际 whole-patch 提交继续要求原 Source callback、running Attempt、epoch/graph CAS、能力交集、原预算与输出保护。发布成功不表示通用 Graph runtime 已接通。

### 17.104 Review 耐久判定与局部重做控制

内部 ReviewController.decide 接受 exact running review Attempt、approve/rerun、非空 settled targetAttemptIds、reasonCode 与 Result evidenceRefs。没有 HTTP 或宽松默认 callback。Review 名额在原 AttemptController.activate 的同事务 review_admission 收据中消耗；已准入后的无效 JSON、失败与取消同样占用名额。decide 只记录一次稳定判定，不重复计 reviews；全 Run/tree 的 maxReviews、steps、attempts、deadline 和节点 maxRounds 累计生效。真实 RP Model 接线见 §17.108。

approve 只记模型评价，不批准任何 Effect。rerun 计算目标及下游已存在尝试的保守影响闭包，活动依赖先拒绝；除明确未派发或已终结 R1 generation.send 外的 Effect 均拒绝局部重算。原 Attempt/Result/收据/银行保持不变；旧 Result 不得当重做输入。重复因果 target、撤权或重新准入失败整体回滚。

历史 reader 仍可读旧收据；Review 没有持久判定不能越过控制节点，rerun 判定不能直接推进 Output。Run 元数据 Attempt 投影新增 superseded:boolean 与 reviewDecision:approve|rerun|null，不包含评价正文或证据正文。evaluator 指纹覆盖 Review/common/Graph/settlement/Join/Fanout/edge-cost 实际实现。此组只有原 Host 控制与明确 authority doubles 的存储证明；真实 Planner/Judge/Review Model runtime 仍继续实施，不能据此宣称完整后端完成。

### 17.105 原 RP Planner 的真实受控生产与费用闭包

原 startRp/preflightRp 识别显式 Planner(JSON)→Narrator(text)→唯一 rp_narration Output 的三节点图。Planner 具有 generation.send+graph.patch 与已声明 player Model pins，原角色仍为 narrator、同原 RP Source/Audience；没有 Actor/Tool/跨Source授权。只准原策略的 setPendingPriority、markBlocked、requestFinalize、requestReplan，无增节点；replan 请求当前保存后阻塞，尚无实际自动循环。Planner/Narrator 原 Route 无 fallback/retry/continuity/reuse，共用一致原预算；全部所选资源在同一真实 Scheduler operation 内持有，整图受 Plan deadline 限制。

Planner 请求、结构化输出 schema 与控制任务由活 Scheduler callback 私有 capture 铸造，ContextPort 使用原 RP prefix/Memory 与 typed input，绝不接受调用方 JSON scope。原 Source reasonRef、Patch/Attempt/epoch/revision 身份由 Host生成。graph_control_parse/adopt 的实际 CPU/wall 复用同原银行持久准入/结算，不在领域事务里回滚费用；

采纳后保存原 Model收据→GraphPatch→Planner收据→settlement→有费用的逻辑边转移，再运行 Narrator。正文仍由原唯一 RP consumer 写入；最终 closure 包含 Planner/Narrator/Output 三项 Effect。冷读不产生权限。普通旧二节点/Delegate路径保持。旧历史无此可选字段保持既有读规则，新 Planner必须有该证据。

非法/不进展/未声明修改、晚到撤权、费用unknown与ACK未知保留真实事实/费用及blocked或reconciling，绝不自动重发。有限Planner链路不是通用Graph/多节点Result分享/Judge/Review runtime；这些及其它完整后端仍继续实施。

### 17.106 同来源直接后继的 Graph Result 合同

原 ResultEnvelope/物理 Result record 新增 graph_nodes audience：exact runId、canonical unique nodeIds、epoch、sourceBindingDigest、producer grantDigest 与固定 original_rp_graph_result purpose；disclosure 为 same_source_graph_successors_only。纯 graphNodeResult/历史 readGraphNodeResult 复用原 Result/Model/Attempt/Receipt，不产生 reader、Model、Domain或审批授权。

当前限制为无 graphChangePolicy 操作、graphRevision=0 的静态原 RP Root，生产/接收节点均为 agent/planner/judge/review，接收者只取直接非回环后继，不能是正式Output。跨Session/Project/child或动态修改暂不支持，避免在后续新增边时追溯扩大既有Result audience。节点输出text/json，字节上限继承原 Plan 显式 resultPolicy；JSON保留原generation响应{text,toolCalls:[]}，控制JSON另需实际收费解析，不把Model文字当官方事实。

消费一致性进一步要求真实已存 recipient（running，或由原私有 Model producer 绑定 generation.send Effect 的 waiting_effect）、exact input ResultRef、当前epoch，及未被Review失效的producer。本组只有纯合同与明确受控存储证据，真实生产者/消费者接线继续。

### 17.107 原 RP Graph Result 的实际生产与消费

原 RP增加显式静态 draft Agent(text)→Narrator(text)→唯一 rp_narration Output profile；两个 Agent各使用自身已声明 player Model pins、原narrator角色与同一原RP Source/Audience/银行。不增加HTTP、Actor/跨Source权限或新runner。

原 ResultController.publishGraphModelResult 只接受原 ModelPort 实际完成对象及当前私有 producer capture，以原Model/Effect→保护Result→publication→settlement→Root refs同事务持久化。复制完成对象、JSON capture与外来ResultRef不能发布或读取。最后一次异步读取后再验grant与Root。Context使用原RP prefix/Memory并附带明确低信任Result，不当官方事实/权限/指令；详细record合同仍归 §17.106。

Reader绑定 exact topology transfer、原Model payload/Source/epoch、Result audience与物理费用；后续编辑/删除Source及冷启动不丢历史。ACK saved只观察原耐久记录后继续，no_save保留实际Model费用但无Result/后续send；usage unknown可以保留合法领域提交，不能claim completed。

发布/消费中的合法同事务Binding撤销或Root取消以denied preflight保留独立写入；不通过抛异常把撤销回滚。waiting_effect不是新grant，必须绑定当前私有消费者的原Model Effect。当前只接通静态同RP直接后继，真实Judge/Review/局部重做循环及其它完整Graph/Source仍继续实施。

### 17.108 原 RP Model Review 与有界局部重做

原 Host 支持显式静态 Draft→Review、Draft+Review→Narrator→Output 四节点图。Draft 在发布前即声明 Review 和 Narrator 为直接后继；Review 不扩大旧 Result Audience。每次真实 Review 经原 Route/Context/ModelPort 与原银行完成，JSON 只接受 decision、固定 reasonCode；approve 配 quality_ready，rerun 配固定反馈码。评价不是高风险 Effect 的批准。原 ReviewController 绑定实际 Draft Result/Traversal、Model completion、Review admission 与 settlement；parse/adopt 本地工作仍在原银行计费。

rerun 生成新 Draft Attempt/Effect/grant，使旧因果工作失效而保留历史正文与费用。新 Draft 只接有界反馈码和引用，不接旧草稿正文。剩余 review、attempt、edge、request 额度不足、重复重做或正文无进展时保守阻塞，不重置计数。Narrator 只接受当前 Draft 与已批准的精确 Review；Output closure 覆盖所有历史 Draft/Review 及最终 Narrator/Chat Effect，unknown usage 不签 completed claim。Review admission/decision/settlement 的提交 ACK 未知目前保守阻塞，读取既有事实不能重发付费工作或恢复私有 scope。

实际测试范围、设备及局部失败归同一 Record；此静态 profile 不代表通用动态图、跨 Source 或后端完成。

### 17.109 原 RP Judge 精确候选选择与隔离评测配置

原 Host 新增显式静态五节点 profile：两个独立 entry Draft→Judge，以及候选/选择→唯一 Narrator→Output。两个 Draft 顺序使用同一真实 Scheduler operation 和原资源/银行，各有独立 Attempt/Effect/Result；不是新增 fanout 权威或并发结论。两份 Result 发布前即声明 Judge 与 Narrator 直接后继，每个接收节点/typed port 独立。Judge 的 JSON 仅 selectedCandidate=0|1 和固定 candidate_selected；候选 ResultRefs 由 Host 填充，不能由 Model 发明外国结果、source、grant、任意反馈或批准字段。

Judge 通过原 Route/Context/ModelPort 获取两份受权低信任正文；parse/adopt 在原银行计费，精确 Model payload/Result/Traversal/settlement 组成耐久选择收据。Narrator 的 inputRefs/Context 只展开所选候选，未选正文不复制；原 Graph 同时消费所选 Draft settlement 与 Judge settlement。完整输出费用包含两个 Draft、Judge、Narrator 与 Chat 五个 Effect。冷读不恢复私有 Scheduler scope。Judge settlement ACK saved 只观察既有精确事实后前进，no_save/unknown 不重发。未知用量保留领域事实而不签 completed claim，同事务合法撤权/取消先保留再拒采纳。

原 EvolutionSettings 对有限多 Agent RP 图取唯一直接 Output 前的 Narrator 作为执行入口 Route，而不是目标节点 Route。Evaluator 冻结所选节点全部精确 Model Route 配置闭包，worker 只在私有 Engine 装载这些配置；每次 RPC 带实际 Route ID，父 Host 仅允许冻结集合内发送、解析 Secret 并使用原 Evolution ledger 计费。当前单一确认价格只接受相同 Model/Connection/Generation 的多 Route；不同价格配置明确 unavailable，不将其冒充价格证据。

此处只记录有限原 RP profile 与工程评测路径。

### 17.110 Review 与 Attempt 准入的同事务撤销边界

来源授权仍用原 authority 复读。合法同事务 Root cancel/Binding 撤销先经原 RunRepository ControlDenial 保留，再拒绝当前准入/判定/结算；不能让异常回滚撤销自身。未准入的 Review 不消耗轮数；已准入且后来失败的 Review 仍按 §17.104 保留已发生名额和费用。

这个边界使用原 Native Engine/命令事务，没有建立新的事务、取消或审批 authority。

### 17.111 原 TaskGraphRevision 的历史重建

readTaskGraphRevision 从原不可变 Plan、按 decisionSeq 排列的已保存 Patch 和原 runs.control.graph.patch 命令重建指定图修订。拒绝记录不改变图。当前Root.graph/nodeControl及累计patch数必须与原事实闭合。指定旧revision只返回当时图与nodeControl，后加节点/边或priority不追溯进入旧图。

原图提案最后Source/Model授权与Root stamp变化通过同一ControlDenial保留合法撤销再拒绝，不在失效授权下落拓扑。这个历史读取没有Source/Audience/producer/派发权限；Graph Result目前的静态限制仍保持，未来动态publication须明确冻结其原发布修订后才能开放。

### 17.112 原 RP 显式多 Draft 静态链

原 rpResultChainProfile 从单 Draft 扩展为原 Plan 已声明的有限线性 Agent 链，最后 Agent 为唯一 Narrator，之后只有唯一 rp_narration Output。各 Agent 为 generation.send/text、单直接后继、非回环且 maxVisits=1；入口无 Graph Result 输入，其余节点恰有一个 required text 输入。分叉、未经过节点、未归属 Model pins 和动态图策略不属于此 profile。

每个中间 Agent 通过原 Transition/Attempt、Context/ModelPort 与 ResultController 生产自己的原 Result；Context 只展开直接前驱的受权低信任正文，不复制更早节点正文或把 Result 当指令/权限。每步有独立原 Model Effect/费用，最后 Narrator 仍经原 Chat/OutputClaim 唯一出口。

中途 Source/Binding 撤销或取消停止后续发送，已发生费用和早期 Result 保留；unknown usage 允许合法领域输出但不签 completed claim。冷读不恢复 grant/执行 scope，Source 删除不删除原历史证明。本项没有增加通用 DAG、动态图、其它 Source/Actor 或公开 Result 正文权限，后端其余工作继续。

### 17.113 原 RP 静态 Agent 依赖图与转移撤销

第109组线性 profile 直接统一为 rpAgentGraphProfile，旧模块/函数移除，生产者仍为同一原 RP Host；没有添加第二 runner。支持 Plan 明确声明的静态无环 Agent 图、多个独立入口和 distinct required text ports 的多输入后继。唯一直接 Output 前 Agent 为正式 Narrator，所有节点各执行一次；只允许 generation.send/text、always/nonloop/maxVisits=1、原已声明 Model pins、无动态图策略。重复同 producer 对同 recipient 的多条输入、optional input、conditional/loop 或其它节点 kind 当前不属于此生产组合。

Host 依据原图拓扑确定顺序，每个节点只引用和展开直接前驱已保存的原 Result。分支共享不扩大 audience；兄弟节点和祖先正文不隐式复制。多输入不固定为两份，其数量受原已发布节点/端口/边、Plan limits、Result/Audience 与原 Context token budget 约束；每一份仍经活 ResultPort 私有捕获授权。所有节点共用原 Scheduler operation、完整资源与费用闭包，当前不声明并发 fanout/Join barrier。原隔离 Native evaluator 可执行相同图，全部发送和费用仍归原父 Evolution ledger。

合法 Binding 撤销/Root cancel 经原 RunRepository ControlDenial 保留，拒绝当前转移而不残留 successor Attempt/edge receipt。原 RP transition 的预算末 await 后再验私有 Source/配置。没有改变取消、预算或审批 authority，已发生费用不回滚/重发。通用动态图、混合控制节点、其它 Source/Actor 与完整后端继续实施。

### 17.114 原 RP 显式有界 Planner 重规划回路

原三节点 Planner→Narrator→Output profile 可显式声明一个 Planner self-loop：optional json feedback 输入、always/loopBack、精确原 json 输出和显式 maxVisits/maxLoopIterations。原 graphChangePolicy 继续只准 §17.105 的控制操作，不增加节点/边、Actor、Tool、Source 或审批权限。没有该回边的 requestReplan 仍保存原事实后保守阻塞，不隐式重试。模型调用失败也不触发此回路。

每次受权 requestReplan 经原 GraphController 落 Patch 后，Planner 完成独立 settlement；原 Transition/edge admission 生成新 Attempt，再沿原私有 Scheduler/Context/ModelPort/银行执行下一次 Planner。新请求只接前次精确原收据引用、当前图修订和原 nodeControl 元数据，不复制任意模型反馈正文。重复 canonical operations（含仅改 JSON 空白）视为无进展；Graph 原 replan/loop/edge/step/deadline/attempt 计数与原银行继续限制执行。下一轮前要求原 bank 保留下一次 Planner+最终 Narrator 的 request 余量，并保留原 Plan 的新 Planner/Narrator/Output Attempt 余量。

图修订、replan/loop/edge 计数必须与历史一致。最终 Narrator 只消费已停止重规划的精确末轮原收据；Output closure 包含全部 Planner Model、Narrator 与唯一 Chat Effect。冷读不恢复 scope，未知费用不签 completed claim，ACK unknown 不重发付费工作。

已应用 Patch 和费用仍保留，后续零发送。原隔离 Native evaluator 可执行此回路，所有真实发送和计费仍归原父 Evolution ledger；混合控制图、动态图增边/节点、其它 Source/Actor 与完整后端继续实施。

### 17.115 原 Graph Result 发布修订与 Planner→Agent 图组合

原 Graph Result 新发布收据保存 graphRevision；后加边/节点不回填旧 Result 的直接后继集合；落后当前修订的 producer 不据此发布新 audience。纯 snapshot/JSON 数据不能替代实际私有 Model completion 或 Source/recipient 授权。

原 Planner profile 可在唯一正式 Narrator 前接同一静态 Agent DAG：Planner 的 json 控制端口只接所声明入口 Agent 的 required json 端口，后续 Agent text 结果仍经原 ResultPort 给精确直接后继。Planner 只执行已有控制操作；已有有限 self-loop 可组合，但不据此开放 addNode/addEdge 或其它Source/Actor。每个入口必须有原 Planner settlement→Transition/edge admission，所有后继必须有原 Graph Result→Transition，历史 reader 分别核完整链路。

就绪 Agent 按原 nodeControl pending priority 排序，同优先级保留原图顺序，依赖不能越过；reader 从原 Patch 事实和同一排序规则重建生产顺序。必需 Draft 或 Narrator 已 blocked/cancelled 时不启动已知不能闭合的后继 Model。正式正文仍只经原 Narrator/Chat，费用闭包包含全部 Planner、Draft、Narrator 和唯一 Output Effect。unknown usage 可保留合法输出而无 completed claim；中途撤权/取消和未知 ACK 不回滚费用、不重发。此有限组合、发布修订和冷读不代表通用动态图执行、全控制组合或完整后端通过。

### 17.116 原 RP Host 限定的动态图 Draft 增补

原 Planner profile 支持显式 addNode/addEdge、allowedNodeKinds=[agent] 与原 Narrator 已声明的 optional text advisory ports。它是同来源顶层 RP 的有限增补合同：Host 只为尚未接线的声明端口生成唯一 Node/Edge ID 和完整 Draft 模板，受原 maxNodes 与后续实际预算约束。模板只复用当前已选 Narrator 的精确 Model pin/Route，Node 只准 generation.send、原 Planner required json 控制输入和指向原 Narrator 的 text 输出；不能选择其它 Route、能力、Source、Output owner、Actor 或 Tool。未选模板不运行模型，未增补时保留原 Planner→Narrator 路径。

私有 Planner capture 把实际 Host 模板纳入原 Model inputRefs/grant/Context，Model JSON 的 addNode/addEdge 必须与该次模板逐字段一致；不扩大或另设额度。已付出的 Model/parse/adopt 费用保留，失败不回滚或退款。有限回路每轮只为仍空闲端口分配新模板，旧/外来模板不能借metadata继续执行。

Planner 停止重规划后，Host 由原 TaskGraphRevision/Patch/命令重建实际图，在当前同一私有 Scheduler operation 中形成后继描述；原已冻结 Narrator Model配置和资源复用，不建立第二runner/银行。每个新Draft仍经原 ModelPort/ResultController，唯一 Narrator 同时核原 Planner 控制边和所有直接Graph Result边。原发布修订 audience、source/grant、pending priority、Context与Output/费用闭包保持；新增图metadata自身不授新执行scope。

Source删除或冷启动不恢复权限。saved/no_save ACK未知均不派发未确认的Draft或重发Planner，晚到撤权/取消保留原图/费用而拒后继。原隔离 Native evaluator 可执行该有限真实增补并由父Evolution账本唯一发送计费。任意拓扑/控制组合、跨Source/Actor、高风险consumer及完整恢复释放仍按同一任务继续，本项不是完整后端或独立质量/价格通过。

### 17.117 原 Retrieval Profile 的不可变客户端标识

原 player-owned Retrieval Profile 允许可选 headers，仅接受一个大小写规范为 User-Agent 的可打印ASCII值；长度/CRLF/重复字段及Authorization、Host、Cookie、Content-Type等保留字段拒绝。本地transformers/webllm不接受HTTP headers。请求body仍不能传配置或覆盖headers。Secret只按原存储SecretRef解析，当前活跃旧key不被读取或覆盖。

原各远程Embedding协议和全部Rerank协议从同一受信Profile读取该标识，provider固定字段、认证及原Compute/Source边界保持。内部只携原compute/signal的既有调用无额外headers，不因此失去原取消/结算语义。Native Retrieval/Memory authority和实际协议源码补入原evaluator revision，旧报告不能复用不同检索行为。没有增加API调用硬上限。

本机实际提供API已通过不可变Profile、原Secret解析、原Session compute与原协议执行取得有限工程证据，精确次数/失败归同一Record。V3 Context的外部Hybrid检索仍须接原Source/Audience/Egress、独立实际Effect与完整费用闭包，现有 scope_unavailable 拒绝未移除；配置/HTTP成功不构成该授权或质量Gate通过。

### 17.118 Context 附属检索 Effect 与原 Profile pin

原 EffectController 增加 Host 内部 prepareContextRetrieval，限定同一 Attempt 已 prepared、尚未准入/claim 的 generation.send 为 parent。inputRef.contextForEffectId 固定原 Model Effect；parent 必须同 owner/Run/Attempt、当前 epoch/boot/图修订/Source 和原 Attempt grant。新的 Effect 仍经原 authority，能力必须为 Plan/node 明示的 memory.retrieve、R1/无需审批；普通 prepare 不能借相同字段启用这条路径。每次检索使用不同 Effect identity，前一附属 Effect 未终结或费用观察未闭合时不允许准备下一项。

检索观察完成后，同 Attempt 若还有原 Model pending 则维持 waiting_effect；unknown 保持 reconciling/blocked，不生成主 Model 派发许可。原预算事实、claim ACK未知只观察/不重发、审批与三域银行不另建替代机制。

原 Authoring 的 context pin 可引用原 player-owned exact Retrieval Profile。首批 Embedding 仅为已有可计费的 OpenAI-compatible sources；Rerank 复用原三协议。本地 transformers/webllm 等未接该消费机制的 source 保持 unknown。原 Profile 新 revision 不能替换旧 pin。相关 authority 已纳入 evaluator revision。

本组只补实际消费者所需的状态机与原配置机制；V3 Memory 的 scope_unavailable 继续保留。

### 17.119 原检索实际 POST 目标与冻结请求

原 OpenAI-compatible Embedding 与三种 Rerank 协议在实际 fetch 之前，将真实规范化 URL/POST 交给原 compute.beforeSend；正文先序列化固定，准入与派发使用同一份内容，准入 callback 不能修改随后发送的正文。原 Session/Project 检索银行的 provider attempt 增加 inputFingerprint；元数据不含 Secret 或正文，不另建收费账本。

不同目标在银行准入与 HTTP 之前拒绝；redirect:error、取消信号与原 reported/unknown usage 结算保持。未来 V3 producer 必须取得真实协议提供的 transport。

native_retrieval_send_target_mismatch 属于原检索 scope refusal，在 Hybrid vector/rerank 中直接传播，不能当作可选 Provider 故障退回 lexical。目标合同源码纳入 evaluator 指纹。完整私有消费者与费用/Result/Output闭包继续实施。

### 17.120 原单 Narrator RP 的实际 Context Rerank

原同来源顶层两节点 RP profile 可显式声明 memory.retrieve 和一个 context Rerank Profile pin。它继续由原 Scheduler opaque capture、选定 Model Route/原银行和 ContextPort 编译器启动；不从 Browser/投影/JSON恢复执行。新 ContextRetrievalPort 只在原 metered compile 的同一 original send bank 上签发实例私有的一次性 Context scope，绑定 owner、Root/Model Effect/Attempt、Source/grant、原 Memory descriptor 和原预算。复制 token、其它实例、重复 recall、外来 pin 均不能派发。

原 NativeMemoryAuthority 先完成合法来源、时间/分支和 Narrator eligibility，再沿原 Hybrid retrieval 做选择性 rerank。只有原策略判定存在竞争的因果来源时才调用；单一来源保持 skip，不准备额外 Effect。实际 query/documents 必须属于该次私有合法 corpus，原请求正文不进入 RunLedger。每次实际 rerank 经原 exact Profile/Secret、原三协议与最终 POST 身份，使用独立 memory.retrieve Effect 和原银行 provider ordinal；原主 Model Effect 在 Context 完成前保持 prepared，不借其目标向检索端点收费。

原 protocol 返回、原费用已 settled 和私有实际响应证明同时成立，才能确认检索并消费 Context。usage未知、ACK未知、撤权/取消或未完成调用阻止后续 Model/Chat；已发生费用保留，未知事实不自动重发。原必要 corpus/rank/pack CPU 工作仍包在同一实际 context_build，不建立第二检索服务/银行。原 Route 的 rerank optionalWork.requiredCompute 继续适用：在准备附属 Effect 之前只读原容量，保留的必要额度不足或未知时零检索派发并沿原 lexical/Narrator；生产者结束会释放私有 scope/回调的内存持有并使旧proof失效，不改变耐久 Effect/费用/unknown事实或伪造预算释放。

唯一 Chat/OutputClaim 的原费用闭包纳入检索、Model和输出工作。Source删除/冷启动仅能历史读取。Model消费及原 RP output prepare/physical writer 共用拒绝码，保留同事务取消/Memory撤回，而不是回滚合法撤权。

不是整条真实 Chat API/质量/价格通过。孤立 evaluator 尚无原检索父Host收费RPC，显式拒绝 memory.retrieve profile，避免把未执行的能力核销为质量证据。新消费者/合同纳入 evaluator revision。

边界仍为顶层单 Narrator RP、rerank-only；Embedding/向量索引、Session/Project/Actor、Delegate/控制图组合及 evaluator 原检索RPC继续同任务实施，相关 scope_unavailable 保持。P1–P4及最终Gate未通过，不作为前端交接或分支结束。

### 17.121 原 Native Embedding 执行与物理索引共用

原 retrieval-execution 增加内部 executeNativeEmbedding，HTTP adapter 的受支持 Embedding insert/query 与全部 Native list/delete 复用该入口。实际数据继续由原 insertNativeIndex/queryNativeIndexes、原物理 permit/staging/同步发布、原 Profile/Secret/Compute/取消信号处理；没有第二索引、存储或HTTP roundtrip。这个函数自身不授运行grant，后续V3生产者仍须提供原私有Source/Effect/银行作用域。

原协议每批10条的分批抽为共用函数，每批仍独立原银行准入，后续批次拒绝时旧索引不发布半成品；这不是API总调用上限。原 Request carrier 的Profile/compute/signal/secret必须与实际工作一致，不允许混用其它bank；内部配置不从HTTP body扩权，API返回格式保持。

原HTTP插入后，Host能读取/查询/删除同一精确索引，HTTP再读能见到删除；原Session银行共同记录两次Provider与各本地工作，FS/SQLite有实证。共享索引与分批源码纳入evaluator revision，未因抽取改变旧缓存身份。此组尚未授予V3 Embedding scope，相关Memory拒绝继续保留；完整受信生产者与费用闭包仍在后端同任务实施，不作前端交接或最终Gate通过。

### 17.122 原 RP Context 的实际 Embedding 与索引计量

在§17.120的顶层两节点、同来源单 Narrator RP私有作用域内，原Memory可使用显式owned exact context Embedding pin，以及可选独立Rerank pin。合法原Hybrid corpus、时间/atomic-group过滤和原query scene seeds先确定允许输入；这些原算法直接共用，未从模型或Browser接收新的query/profile/collection/endpoint许可。原NativeMemoryAuthority仅为真实ContextRetrievalPort的一次性scope解除相应拒绝，其它Source/Delegate/控制图/evaluator范围保持拒绝。

原executeNativeEmbedding和原物理索引继续执行list/delete/insert/query；仅能操作同次原Hybrid当前及已识别retired派生namespace，不能写原Memory/World。每个实际Embedding wire batch各有独立memory.retrieve Effect、原Profile/Secret、实际POST/input身份、原银行provider ordinal0和实际响应/费用证明；原每批10条保持，不新增API总调用上限。原Model主Effect在检索完成前保持prepared，不借它的Model endpoint/grant向Embedding收费。内部batch闭包不来自JSON/HTTP，不建立第二协议、索引、银行或收费代理。

index_list/index_delete/index_insert/index_query本地工作在同一原Model bank记录稳定local ordinal、items/bytes、实际CPU/wall结果；原context_build仍包住实际Compiler/Hybrid。原物理permit/staging/同步发布与Run ancestry、原RP Source locks组合，发布callback只做受限同步索引替换，不包含Provider I/O。原Engine ambient transaction内禁止建立或发送检索Provider动作。私有recall proof逐项重读原local费用和附属Effect收据。原已知本地索引失败可保留原lexical政策，但准入/结算ACK未知、已准备未完成的Provider动作或usage未知不能转成Model/Chat许可，发生的原费用保留，不重发。

生产者结束释放私有内存持有，持久费用和unknown事实保留。原Source Memory没有写入副作用。

准确费用、测试与源码HEAD归同一Record。此项不是完整真实Chat/质量/价格结论；静态/控制/动态图、其它Source/Actor、evaluator检索RPC和完整恢复/释放继续，P1–P4/最终Gate仍NOT_READY。

### 17.123 原隔离 RP 检索与父 Host 费用通道

原fixed evaluator worker可为§17.122支持的单Narrator RP读取冻结的owned exact Retrieval Profiles和原Memory settings；这些配置不含生产Memory或Secret。无memory.retrieve时仍复制存在的原Memory配置，不能通过在隔离环境关掉全局检索伪造target_consumed。私有fixture Memory只由公开/封存fixture的合法visible history，经原Chat/Provenance/原MemoryAuthority构建，不读生产Source；不是独立质量资料或生产记忆正确性的替代证明。

worker继续使用原Native Host、ContextPort、私有ContextRetrievalPort、原Effect/原RP bank和物理索引；仅原server composition可提供检索transport，JSON/HTTP无此配置。原job+scope+child Effect稳定身份防止RPC换arm/trial后重发；不会把重复admission当新send许可。

usage缺失或只报告部分计数仍未知，保留原上界；准入/结算ACK未知、原配置撤回/取消或失败时不返回可消费响应，不重发。实际发生费用在原Evolution账本保留；worker再经原协议和原本地bank/Effect观察、Result/唯一Chat闭包，不能用父端成功绕过本地当前性。原固定loader禁止worker直接node-fetch，global fetch原拒绝保持；实际网络与Secret只在父Host。

所有实际检索Provider费用归原baseline/candidate arm/trial，与原Model和独立pair Judge一起进入report/原owner ledger；没有新增第二评测收费权威。现有确认的Model price不定价Embedding/Rerank，检索cost维持null，因此不能通过价格/晋升Gate。原稀疏Rerank策略保持：fixture无竞争因果来源时不为了证明端点而强制发送；独立父端Rerank协议/费用测试与worker真实Embedding证据分开记。

Delegate、含检索的控制/通用图、其它Source/Actor及完整恢复/释放继续按原拒绝边界处理；P1–P4/最终Gate仍NOT_READY，不交前端/main、不结束分支。

### 17.124 同来源静态 RP Agent DAG 的检索闭包

显式静态Agent DAG现允许每个generation.send节点持有自己的memory.retrieve及owned exact context Profiles。仍为原RP Narrator audience、同一Source和Root、原顺序Host执行；不借此开放Actor、Delegate、Planner/Review/Judge或动态Patch中的检索。只接受原不可变Plan的静态图，原graphRevision0及逐节点Model/Context/Attempt/Source授权保持，模型和Browser不能选择新Profile/endpoint/query或生成运行scope。

每个实际Model Context继续在自己的原send bank上创建一次性scope；每个实际Embedding batch/Rerank有独立原Effect/准入/响应/费用证明。Draft Graph Result的settlement和历史reader纳入该Draft全部检索子收据，最终Narrator/Chat闭包汇总全部Draft及Narrator的Model/检索费用，不把前驱Result当费用或权限的新来源。各节点继续只展开精确直接前驱Result。

原ContextPort在实例私有的真实编译记录中保留原Memory descriptor digest，原Host在第一次实际编译后为本次图执行固定该摘要；摘要只为拒绝旧源，不能签新grant；即使某次Rerank按原政策零调用，Memory撤回也会阻止后继；前驱scope结束后仅释放私有检索持有，旧Result或冷历史不能恢复scope或越过后来撤回。合法同事务Memory修改沿原deny结果保留，已发生费用与Result历史保留。

同一Context对当前及retired派生namespace的索引清单，经原executeNativeEmbedding/queryNativeIndexes在原物理permits下一次读取，原index_list记录实际输入索引数量、请求字节估计并结算可观察CPU/wall；仅在同一次私有recall中保存清单快照。原HTTP单清单格式和允许字段保持，没有新增HTTP bulk字段、第二索引或第二bank。跨节点继续使用原向量cache identity，合法源不变时只补缺失向量；Context/查询仍逐节点重新授权。

原fixed evaluator也可执行该静态检索图；有限单Draft→Narrator两臂各5次Provider，加独立pair Judge共11笔原父ledger费用，仍有检索price=null，不能据此晋升。更大的图必须遵守原用户Route及case/原bank余量，不把未执行或预算拒绝的路径核销。本组没有新增真实API，仍非完整后端或P1–P4/最终Gate通过，不交前端/main、不结束分支。

### 17.125 原银行的声明式本地作业额度

原computeBudget.localWork.maxJobs与原父子allocation现在接受Owner声明的正安全整数，原数据格式和默认额度保持。原32条独立schema上界移除；运行仍由原Source/Plan/Effect/Scheduler/Context权限和原jobs/items/inputBytes准入共同约束。每项本地工作至少消耗一个item，历史行的物理边界沿用原maxItems的10000，而不是另设32行；各协议/存储对象的独立边界保持。

原bind/tighten reducer继续只收紧已有operation，不因后来更大的Route/调用参数提高原余额。超过当前额度的历史、unknown及实际结算继续可读取/保留；收紧后呈overrun而不是删除旧费用。父子reservation沿同一原bank竞争、单次charge和晚到settlement，只有明确可释放的未用部分归还；没有新账本、预算复制或新scope。

FS/SQLite原Session/Project/RP银行各40条本地费用经Source撤回和冷重启保留。有限五Agent RP检索链在预先声明48 jobs及相应Plan步骤后完成37个实际原本地工作、5次合成Model/6次合成Embedding及12个Effect闭包；相同图声明32 jobs时停止并保留原费，不通过重请求重置。原前端后续须按共享schema适配该字段；本组为后端合同，P1–P4/最终Gate继续，不作前端交接或main/分支结束。

### 17.126 原静态 RP Judge 的检索与判定费用闭包

原显式双候选→Judge→Narrator静态RP图允许各Model节点持有自己的memory.retrieve及owned exact context Profiles。仍为同Source、原Narrator audience、graphRevision0及原Plan声明的候选/消费者，不开放新Actor/Delegate或动态控制scope。Judge只选择原已授权候选，检索不能增加候选正文传播范围、Effect审批或正式事实权威。原稀疏Rerank政策保持。

原ContextRetrievalPort继续逐实际Embedding batch/Rerank创建独立原Effect、原bank准入和实际响应证明。最终Narrator及唯一Chat原费用闭包汇总两候选、Judge及Narrator的所有Model/检索费用。旧无检索Judge合同仍适用，无第二银行、索引或执行入口。

真实编译产生的私有Memory descriptor摘要贯穿同次Judge图；Judge的异步判定与结算结束后才释放私有检索证明。原Source/Memory撤回、取消、usage未知及ACK未知保留事实和费用；不以冷历史或重新请求恢复scope/发送。准确FS/SQLite实测与源码HEAD归同一Record；Review、Planner/动态图、其它Source与完整恢复/释放继续，尚非完整后端或最终Gate通过。

### 17.127 原 RP Review 检索与局部重做

原显式Draft→Review→Narrator静态RP图逐Model节点可持有自己的memory.retrieve及owned exact context Profiles，继续使用同Source、原Narrator audience、graphRevision0与原Host Model/Context/Effect/bank。Review的approve/rerun仍是有界质量决策，不是Effect审批、正式事实或新受众许可。原稀疏Rerank、独立检索Effect与实际费用证明保持。

异步控制采用/结算结束后再释放私有scope。最终Narrator/唯一Chat汇总包括已失效Draft和此前Review的全部Model/检索费用。局部重做只失效旧Result消费，不删除旧费用/收据，也不沿旧scope给新Draft/Review授权；

原派生索引仍共用，不写Memory/World；Provider调用不能撤销或退款，原费用与历史保留。未知用量、Memory撤回及旧Result失效保持拒后继、不重发；新Draft只收到原固定原因标签与引用，不转发旧正文。

Planner/受控动态图、其它Source/Actor与完整恢复/释放继续，尚非完整后端或最终Gate通过，不交前端/main或结束分支。

### 17.128 原 RP Planner 修订与检索费用历史

原同来源RP Planner、有限replan回路及Planner后静态Agent图可逐Model节点使用owned exact context检索Profiles。检索不能扩大Patch操作、预算、Actor/正文受众或Effect审批。带动态addNode/addEdge模板的检索仍须其独立pin接线，暂沿原拒绝边界。

不是从新Root修订签旧Model的权限。prepared Model在任何实际检索发送前必须与当前Root修订一致。子检索Effect仍绑定同一原Attempt/Model修订。

异步Planner采用/结算完成后才释放私有检索scope；usage未知、Memory撤回、原Patch已采用但最终证明失效均保留已发生事实及费用，不签后继许可、不重发；

其它动态模板/Source/Actor、高风险消费者与完整恢复/释放继续，尚非完整后端或最终Gate通过，不交前端/main或结束分支。

### 17.129 原 Host 动态 Draft 模板的 owned 检索 pins

原RP Planner addNode/addEdge模板可携带原Narrator所明确持有的context检索pins。模板继续只用原所选Narrator Model pin；检索能力与pin集合由Host从不可变Plan的原Narrator声明导出并规范化，不从Model JSON接受新Profile、endpoint、Secret、query或正文受众。模型选择已有模板或不选；删改检索pin/能力、替换Model或只提交部分边继续拒绝，不产生新动态运行许可。

原Context检索创建与历史reader可按父Model所属的原GraphRevision读取该次已采用拓扑；普通静态/控制图的原修订围栏保持。

实际选用的Draft逐次使用同一原Hybrid、原物理索引及独立检索Effect/费用/响应证明，Draft Result和最终Narrator/Chat纳入完整费用；不选用时没有该Draft的Context/Provider工作。未知usage保留已采用图/原费用，拒后继且不重发；冷历史不恢复已释放的私有检索证明。

原隔离worker可沿同一范围执行，检索Secret与真实发送仍只在原父Host/原Evolution账本；Model价格不替检索定价，也不把合成工程fixture当独立质量。准确测试与源码HEAD归同一Record。其它Source/Actor、通用图、高风险消费者与完整恢复/释放继续，尚非完整后端或最终Gate通过，不交前端/main或结束分支。

### 17.130 原 Model 完成后的检索事实封存

原RP Narrator进入唯一Chat输出前，可在真实Model完成证明成立后封存该次Context检索事实。随后释放实际Provider scope与回调持有。

原Memory recall的实例私有opaque proof只保留最小费用身份/摘要，后续读取原受保护历史收据与原银行；不保存新的Provider响应或正文快照，不返回新Model/Provider/Context grant。JSON副本不能恢复proof，原Model或检索Effect不能借封存重新派发。

main Model usage未知仍按原政策保留合法领域输出与unknown费用，不伪造完整费用闭包/终结claim；检索Provider或实际index作业未知仍在更早原边界拒后继。封存只改变完成证明生命周期，没有第二费用权威或新恢复入口。Session/其它Source的检索与其原quota/领域完成接线继续，不把封存基础当完整Session消费者或后端完成。

### 17.131 原 Session Narrator 检索与生成配额分工

原有限 Session Narrator 可声明 owned exact Context 检索 Profile pins 和 memory.retrieve，由真实 Turn producer、原 Information/Memory 合法候选域和同一原 Context compiler 驱动 Embedding/可选 Rerank。Resolver 不得持有该检索能力；其它 Actor、后台 Task、Project 与 Delegate 不因本接口取得检索授权。原私有 scope、Profile/Secret/实际 POST 与冻结请求、原物理索引及本地计量均沿已有 ContextRetrievalPort，不开放新 Browser/通用 Run 执行口。

每个检索发送使用原 Session compute bank，但不重复扣除 Model 的 generation quota。原实际 Narrator send-bank 的实例私有 quota proof 仅证明该检索的真实 producer；只允许 prepared Narrator 的 prepared 子检索 ordinal 0；JSON bank/proof、Model effect 代替 child、错 Root/target/input、取消和 Source 推进不能借此发送。

Model 完成后封存该次检索费用证明并释放发送 scope；Narrator Result、Attempt settlement、原唯一领域输出与终结 claim 历史纳入全部子检索收据、Provider 与 index 本地费用；合法自己的 Session revision 推进不会恢复 scope 或重发。检索 usage 未知/Memory 撤回在原更早边界拒 Model 或输出，已付费用保留；主 Model usage 未知仍可保留原合法领域输出但无完整 claim，暖重试与冷读不得重发。

原编译输入的 optional metadata/实现 callback 按原 context_build 的 JSON 数据表示比较，合法 Session projected chat 的省略字段亦按同一表示计算 corpus 摘要；其它 Source/Actor、通用图、高风险消费者和完整恢复/释放仍继续，P1–P4/最终 Gate 未通过。

### 17.132 原 Project generation writer 的完成许可

原Project完成Model与工具返回的transcript后，由真实producer签发实例私有的一次性completion permit，交给原ProjectAgentService.finishGeneration；JSON副本、其它Agent实例、改transcript或重复消费均拒绝。permit只证明该次真实Model完成、原Source/config/Skill与Task身份，不提供新Model/Tool/Project提交权限，也不进入HTTP/Browser输入。

原Task锁取得后、Studio异步读取结束且mutable Task/cache载入前，消费该permit并重读真实Model完成证明、原生产者Source/Route和实际Skill inventory。原Task载入/恢复之后，实际同步修改对话前再核Task对象、Source executionFingerprint、baseRevision、conversation、原generation attempt/request/calls；原Repository CAS继续保存。恢复/异步间隙中的合法人类Task修改必须保留，旧cache不能在拒绝catch中覆盖新的Task。真实已发生Model费用不退款或重发。

此接口堵住最后Model授权或原writer异步读取期间撤回后先写旧回复的问题，不宣称Task与外部Skill文件系统跨域原子事务。Project原Context仍只消费合法Task/Project/registry/tools和原Skill；没有Session/RP Memory corpus、descriptor或query时不能借其授权接检索。其它消费者/通用图/恢复释放继续，后端与最终Gate仍未完成。

### 17.133 原 Project 银行的历史引用保留

原引用适配器可按Project及可选精确Task读取受保护V3 Run/Record引用；终态或已取消Run、unknown费用都不自动解除保留。原Task持有其原compute银行，不能只按Task的review/blocked状态判断可删。

另一个未引用的兄弟Task不因共享Project而一并禁止删除。

没有Run引用的Project/Task仍通过原回收站及原ID恢复，完整账户删除沿原engine.deleteUser而非单Task接口。此项修复保留旁路，不声明完整Run历史释放或跨域GC已经实现；后端、完整恢复释放与最终Gate继续，不交前端/main或结束分支。

### 17.134 原后台 Task 与 Actor appraisal 的检索消费者

原pending-outbox后台Task可在原有限两节点JSON Plan上声明自己owned Context Profiles及memory.retrieve，由真实Task capture、Information task view、原MemoryAuthority/Hybrid与ContextRetrievalPort执行。Actor-bound appraisal只读取该Task view实际授给原Actor的来源，仍沿原事件gate、sourceItem citations、parse/adopt jobs与原Actor writer；Memory历史支持不提升为该binding未授权的正式事件。input-only Task不读取Memory descriptor或发送检索，额外owned检索声明在producer shape前置拒绝。没有新通用Actor、Project或Delegate读取权限。

后台检索沿原Session compute银行，真实background quota证明额外绑定私有capture的准确SourceRequest（Task/variant/branch/revision），不是只匹配role/requestId。Narrator proof不能回应Task SourceRequest，错误Task/variant/无Task身份拒绝；工厂调用方的JSON元数据不能覆盖受保护Root。Embedding/Rerank不消耗Model的background次数，真实Model仍按原invocation/window/period准入。

Model实际完成后封存只读检索费用事实、释放发送scope；Result/Attempt settlement与最终costs包含全部检索收据、index本地作业和Model/parse/adopt费用。

原自动Native recall query取既有eligibleMemorySnapshot的最后合法chat材料与原Information projection，不直接采用原完整Timeline末条。未获Task/Actor授权的私心或Truth既不进入insert候选，也不得经query/model输入泄漏；规范化前后均须维持该数据面边界。原Source/eligibility、atomic support和正式写入权限不放宽。

检索usage未知/撤回保留已发生费用，拒后继Model或Actor采纳；封存后撤回仍拒采纳，采纳后的合法撤回保留自己的Task记录与费用而拒terminal claim。主Model usage未知可保留合法Task/Actor采纳及bounded Result但不造完整costs/终结claim。暖重试和冷重启按原replay/unknown围栏不重发。可选Rerank仍只在原合法竞争因果候选决策需要时发送，非因果配置不隐式收费。准确FS/SQLite范围归同一Record；通用图、其它Source/Delegate、高风险、完整恢复释放及最终Gate继续，不交前端/main或结束分支。

### 17.135 原管理员迁移的目的端历史保护

目标已经保留V3 Run/Record时，在来源快照和copy/rollback前拒绝，保留原retention错误代码；迁移类别选择不是释放历史或覆盖费用银行的授权。

空目标仍可导入原paid Run和Task compute，依原恢复规则保持Task blocked而不重发；目的HostFence不能被来源身份覆盖。本项保护既有历史，不增加恢复执行许可、counter合并或Run release状态。准确FS/SQLite与原迁移回归归同一Record；完整恢复释放、其它消费者和最终Gate继续。

### 17.136 原运行费用投影的 Provider 分项

原RunObservationService费用仍只读取原银行与受保护Effect，新增costs.providerWork，固定generation、embedding、rerank、other四项；每项只有attempts、knownTotalTokens、unknownAttempts、reservedUpperTokens。分类取实际Effect capability及context_retrieval mode，不采用请求标签或模型文本。原modelAttempts字段继续保留原银行所有Provider attempts的汇总语义，其余总计/本地费用/closed状态保持，与四项之和相符；没有新账本、价格推算或发送许可。

投影不增加Profile/Secret/输入指纹、召回正文、Result正文或Source grant。新的observer重读相同持久事实得到同费用，不恢复scope、重发或改变费用。正式Project Commit等后端继续，不作前端交接或最终Gate完成。

### 17.137 当前有限 Delegate 的 brief 与检索边界实证

D4允许由原领域授予明确SourceRef/ResultRef权限；当前真实RP Delegate producer只冻结最后用户brief，未取得子Task的Information/Memory eligibility。父Narrator的检索pins、原Memory或SourceRef均不能代替这项授权。此次不新增Delegate检索能力或改变生产权限。

实际子Model银行亦不能构造检索scope或给Context追加父Memory item/SourceRef。子请求只有brief，父continuation独立消费自己合法Memory，原typed Result/Output/return与费用保持。只开全局外部Profile而缺owned pin时，已付子任务可完成并归还，父Context仍按原scope unavailable拒绝，不偷发检索或恢复发送；准确FS/SQLite证据归同一Record。正式Source授权与通用Delegate检索仍未实现，不能把有限生产者拒绝泛化成整个D4禁止。

### 17.138 原 Project 改名的可信批准与正式提交

新增有限的原用户 Project Commit consumer：只接受原Task已passed Review、low impact且单个project.save仅改变Project displayName/updatedAt的Workspace；原有资源不变可用，同时新增/修改资源、package、文件、权限或其它未分类变更拒绝。Model工具清单不含commit；该消费者不续用已completed的Review Root，不提供泛Project写权限。

原Authoring通过effect节点owned project pin读取native_project_commit精确描述符及指纹；固定effect→output/json图只持project.commit。普通草稿Source仍拒review，正式Source进入committing/completed后也不重新发权。

原NativeStudio Router新增相对路径`/projects/:projectId/agent/tasks/:taskId/commit/prepare`、`/commit/dispatch`、`/commit/observe`，均为POST/no-store。Host对应prepareProjectCommit/dispatchProjectCommit/observeProjectCommit，原server按Engine与原Agent保持同一私有审批实例；缺部署拒unavailable。原ReviewOrigin再认证及精确R2一次批准是唯一批准来源，不接受JSON Boolean或复制permit。

批准等待不持运行/Task/Studio锁。原Task银行分别记录准备与实际commit两项localWork，无Provider发送；业务事实只来自原Studio Git ChangeSet和原Task收据；新的无queue只读receipt observer复用原Git解析，不执行Task恢复或发布cache。费用、Effect、producer settlement、真实Transition/Edge与output Attempt、bounded json Result/OutputClaim闭合后才令Root completed。Result只含原变化集/版本引用，不能扩大为Project Review或通用Context grant。

结果字节不足在写入和收费前拒绝。完成后释放私有scope；暖重试及cold非ready dispatch只观察，cold ready/部分prepare只回恢复所需元数据，不恢复writer。相同prepare command重复/并发/已保存ACK沿原command返回原Run/费用/批准；异body冲突。缺失Effect receipt可已有合法domain提交但保持committed_pending_output，不重复writer或伪造claim。

准确FS/SQLite、真实回环隔离审批、原system Git及错误/修复范围归同一Record。该有限消费者不是全部后端完成；

## 18. 工程收敛后的端口合同

本节集中描述源码 `16ce2d1fe`、`18baf306f` 已提交的生产增补，覆盖 §17 中相应的较早限制；不以发布成功推导任意图、角色或所有业务组合均可运行。

### 显式引用与数据边界

System 消息、其它 Native 消息、未来消息、单方声明或已编辑/撤回来源不成为授权。它是低信任的用户材料，不是指令、World Truth 或子 Agent 的 Memory grant。默认 brief-only 保留；父 private Context/Memory 不复制。

### Model 失败策略与费用

原 RP、Session Narrator/Resolver 和 Project 多轮消费者通过同一原能力 helper 冻结 primary/fallback 候选。每个候选须有对应节点 owned Route pin、原 Prompt/网络政策和能力证据，发送前再核 Source、Route、Secret target、原银行和剩余预算。每次真实发送有稳定 ordinal；新尝试不能抹掉旧失败或 unknown。Project 工具允许集、原 Task 轮次及正式 writer 不因 fallback 改变。

明确的 HTTP Provider 失败可按已声明策略重新准入；Provider 报出有效 numeric usage 时保留原观察，缺失则 unknown。V3 transport/timeout 提交不明不能盲重发。Reuse、continuity 取原 capability/path 证明，未建立的能力保持原拒绝或合法 miss/reset/unknown；不声称价格已知、真实 cache 命中或 continuation 必然保留。整体 RP 调度期限取已声明 Plan deadline，每个 Provider 请求仍取该候选原 Route timeout。

### Tool 的正式生产链

`NativeToolOrchestrationAuthority` 由同 Engine/Host boot 的原 Native Host 持有，不接受客户端提供 grant、dispatcher、Secret 或任意 action JSON。原 Session display/Route 或选中的 versioned Skill 是真实 Source/动作描述符权威；固定受限 Plan/owned pin → 私有 producer 授权 → 原 S2 Effect → 原 MCP/Skill/A2A → 原 receipt/银行 → typed advisory Result。MCP 内容绑定原 canonical artifact fingerprint；A2A accepted 只证明已受理，保持 `remoteCompleted:false` 与 unknown，不伪造完成 Result/OutputClaim。

同 namespace `/api/native/orchestration` 下的 POST/no-store：`/tools/prepare` mutation envelope body `{planRef}`；`/tools/dispatch` mutation envelope body `{runId,effectId}`；`/tools/observe`、`/tools/consume` read envelope body `{runId,effectId}`。prepare 的 commandId 来自 envelope；其它字段封闭，原 auth/current boot Gate 保留。observe 不执行。consume 仅消费原已完成结果，重新核当前 owner、Source、Plan/pin、Secret target、原银行和 fence，以新 recipient grant 读取 advisory data；cold 不恢复发送权或重发 Tool/Model。

### 有限恢复与保留

原 Project Commit `ready` 且从未产生 dispatch claim/token、未有 Result 时，当前 Host 可沿原 Source/账户/Review/Task 银行重新准入同 Effect/Attempt。额度、计数、deadline、已费不重置。

原 Studio 路由 POST `/projects/:projectId/agent/tasks/:taskId/commit/resume` body 仅 `{runId,effectId}`，path IDs 必须匹配。Run Projection `controls.resume` 只有实际部署该有限回调且当前事实允许时为 true；没有泛用 Run/Effect dispatcher。`dispatching`/unknown 只查询或 reconcile；已有 Result 用新接收权限消费，不能再执行。此项不宣称所有 RP 父流程可在任意中断点自动续跑。

接口 §10 的默认保留继续生效：没有显式可执行收缩 policy 时，terminal/unknown、原银行与领域收据保持引用保护；恢复/迁移不能覆盖仍被引用的费用事实。未新增无消费者的 release 标志，也没有将拒删误称完整 GC。未来显式归档/收缩由原 Storage 领域承担，不能倒挂为无终点的 P3 扩展。

### 原 Evolution 自动评测

原 auto job 已把冻结 Native Plan/Project Prompt 配置交回原隔离 evaluator，再消费原资格、质量、价格、发布与回滚 Gate。没有新增 evaluator 服务或独立质量来源 authority。当前固定来源仍为 historical_synthetic/not_established，owner labels 不建立独立来源；缺质量或价格证据时禁止自动 eligible promotion。有限 RP narration/Project Review worker 之外的组合不从此接口推导为支持。准确自动作业、原用户审阅发布与反馈回滚证据归同一 Record。

### 原 Project 叙事数据的正式提交

源码 `2325f2a35` 将 §17.138 的 rename-only 限制扩到同一 Project 已有 Actor profile 的 description/personality/scenario，以及已有 assistant initialTimeline 项的 content；ID、role、timeline 元数据、所有其它 Source 字节须保持。已有资源未变可用；没有增加风险服务或凭 highImpact=false 授任意 project.save。

原隔离 Review 显示精确 target/field/before/after 及原 Project/Task/baseRevision/Workspace/Review/ChangeSet 绑定，大小使用原可信 Review 字段限制。描述符 changeKind/changeDigest 和 owned pin 冻结这些原数据。实际 Package/Session 消费及各Engine证据见同一Record；没有把其它 Project 结构区推导为支持。

### 同一 Scheduler 的真实 Fanout / Join

源码 `83f4d6a03` 的明确 RP profile 为一个 entry Fanout → 至少两个独立 owned Model Agent → all-success Join → 唯一 Narrator → output。每个分支独立私有 capture、Attempt、Effect 与 Result，共用原 Root 银行；支线间不读取彼此结果。原 FanoutFrame 冻结成员/并发/父预算，原 JoinReceipt 及 settlement 是 Narrator 的唯一控制前置；不能以普通串行 Agent 多输入冒充 Join。

原 NativeTaskScheduler 的 resource fanout 和单 child handoff 复用同一队列/permits；passive 父让出资源槽，分组并发取原 Plan/Run 上限，忽略取消的真实 worker settle 前仍持 permit。同 Root activate/prepare、ready/claim 和 observation 沿原 SourceControl 短临界区；HTTP 不持锁，CAS 不削弱。首版等待实际全组结算，才接 Narrator 与单 Chat；只按实际策略核销，不据此宣称其它冻结 Join 策略完成。

unknown usage 保留原费用，可有合法 Join/Narrator/Chat 但无终结 claim。撤权/取消拒后继及正式输出，已费不退款。冷 reader 核原 Frame/barrier/Join、分支 Model/Result、控制 command、边计数与 typed traversal，不产生新授权。原 Evolution IPC worker仍串行，费用前拒Fanout/Join，不从发布成功推导 worker 支持；两个新profile/reader计入原evaluator源码指纹。其它策略在同一原控制机制接线，准确版本与最终核销只见同一Record。

### 明确 Model 拒绝与未消费响应的事实

源码 `269fe16a3` 在原 HTTP adapter 的实际拒绝点保存仅含数字状态/规范 usage 的进程内事件；Host 将真实 send 的最终原 error 绑定实际 receiver、Engine/boot/handle、compiled sends 和原 fee refs。不能凭 error.code、ProviderFailure 类名、任意 error.usage 或重新拼 JSON 取得证明。原 Project 合法 scoped receiver 仍可用，不依赖只能由直接 class instance 持有的私有字段。其中缺 usage 仍保留 unknown，费用 `closed:false`，不会伪退款或抹掉上界。混合拒绝→transport/timeout、解析失败或未知提交不冒充全部明确失败。

没有正文、正常 Model completion 或 Result 品牌。

`readModelTerminalFact` 只读受保护历史元数据，不给费用 closed 或接收权限；`readModelTerminalReceipt` 必须提供原 BudgetPort 并核每笔实际银行，closed 只表示费用事实；`readModelFailureReceipt` 只收明确拒绝。Receipt ACK未知按原Effect/observation身份查询保存事实，无原receipt则保持未知，不重发。准确四Engine和相邻Provider/Project证据归同一Record。

### 原 Project 历史费用观察

源码 `74c112e84` 的原 ProjectAgent.observeCompute 只读取原 TaskRepository、严格 Task schema 和原银行行并 clone 返回，不通过 _observe 重排 Studio writer/cache。同一三轮Model Task→Review→批准→Commit→Package/Session四Engine证据见Record，原预算和所有已费不重置。

### Session Model 失败的正式消费者

原 NativeNarratorOrchestrationAuthority 在 Resolver/Narrator 的私有scope释放前，消费同一ModelPort实际terminal receipt。只有原明确HTTP拒绝证明可结算原Attempt.failed；必须核原run/attempt/effect/decision、Source与银行、全部实际Model和owned Context检索费用收据。失败不生成正常Model completion、Result、OutputClaim或Session/World提交。Resolver已完成而Narrator失败时，原Resolver事实与费用保留，选定动作不因此执行。

原注册的graph.execution.fail写原Run耐久失败事实：所有实际Effect终结且费用closed才Root.failed；明确失败但费用unknown保留Attempt.failed/Root.reconciling；提交unknown保持Effect.dispatching、Attempt.blocked及pendingEffectRefs。取消不被覆写，人类Source编辑保留，不因失败取得新grant或重发。Context检索历史reader仅以严格Model terminal fact补足失败场景的原时间边界；正常Result消费者仍要求正常Model completion，不把失败提升为正文许可。

### 同一 Join 的 early-close、partial 与费用闭包

原JoinController与冷reader共用同一个纯策略计算，基于冻结成员及持久settlement顺序结算all-success/all-settled/any-success/count-quorum/deadline。fail_fast仅停止后续派发并取消实际尚未发送的成员，不撤销已发HTTP或退款；原AttemptController.cancelPending必须证明同一Frame、当前epoch/Source/银行、pending/reserved且无startedAt/Effect/Result，以及原fail_fast失败收据或原Join excluded决定。复用已注册attempt.settle，不授GraphPatch或任意取消能力。

原Scheduler的被动Join决定不占Model slot，也不铸造Model boundary；结算后Narrator重新取得实际permit。早关门时只使用不可变Join接受的Results，第三queued成员可不发送；已运行且未采纳的worker保留其permit、原Effect、真实Result和全部费用，不能修改旧Join或Narrator输入。正式Chat writer前原父任务让出slot并等该组实际worker终结，不留下Root completed后的秘密后台任务。deadline即使全部worker早完成仍等原冻结cutoff。

partial仅授精确owned RP Fanout/Join正式输出profile，实际Join outcome逐层进入Narrator Attempt/Result envelope/Root身份；ordinary RP、Session或任意图不会因allowPartial=true获权。已知费用闭合可正式partial；任何未采纳/late Model费用unknown或提交unknown均保留原pending_output、占用与pending Effect，没有终结OutputClaim。

### 各 Engine 的原 Context 检索目录

ContextRetrievalPort的index路径与Secret读取只向原NativeHostLifecycle.directoriesForHandle请求目录，不依赖FS/SQLite Engine私有字段。该只读accessor要求原Host active、handle已有原fence，并保留paused/blocked/privateHandle/closed拒绝，返回原配置冻结浅副本；不新建Fence、准入、权限或目录服务。
