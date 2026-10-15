# D9 E1 — Native V3 物理接口合同 v1（设计冻结，运行未验证）

> 2026-10-15 第九轮用户选择 **E1**。本模块拥有 D9 **Plan/Run/Effect/Receipt/Result/Projection 跨层接口的冻结语义与 E0 前置清单**。D1–D8 的业务细则继续引用 [architecture](architecture.md)、[graph-control](graph-control.md)、[context-sharing](context-sharing.md)、[adaptive-compute](adaptive-compute.md)、[effect-authorization](effect-authorization.md)、[narrative-project-quality](narrative-project-quality.md)、[graph-editor-experience](graph-editor-experience.md)；静态旧代码证据见 [e0-audit](e0-audit.md)，工程阶段见 [implementation-plan](implementation-plan.md)。**逻辑边界与 §6–11 的物理合同 v1 已冻结为工程设计，存储表、RPC 未实现，E0 未完成**。

## 1. T2 单 Host、原业务 Authority 与两类版本

- Native Node Host 是**唯一** Orchestration Run/TaskGraph/Effect admission、持久恢复与 checkpoint 的写入者。Browser/桌面/移动只编辑非权威草稿、显示授权投影、提交可信 Host commands；不得保留两套 authoritative Browser/Host runner。
- 作者发布的 `PlanRevision` **不可变**；Run 内 `TaskGraphRevision` 随经 Host 通过的 G2 `GraphPatch` 独立演进。Session/Branch/World/Actor/Studio Project/Model Target 仍各有自己的修订域与 scope proof，不能把它们伪装为同一个“最新全局版本”。
- Host RunLedger 拥有编排进度/节点尝试/待办 Effect 与指向原 Domain receipts 的关系，**不**拥有 World/Session/Studio/Memory/Experience/模型费用/外部 MCP Journal 的业务真相；原 Native Authority 的 CAS、审批与写入回执始终最终有效。
- 零兼容硬切：不读取/迁移旧 Orchestrator preset/settings/IndexedDB Checkpoint/mode/Generator 配置，不用旧 Single/Spec/Agenda/Loop/Director 模式转为新版模板，不保留 `engine-v2`、`legacy-workflow` 或旧 Browser AgentRuntime 的生产双路径；先审计真实共享消费者，再替换/删除相关编排实现。

## 2. PlanDefinition / Draft / PlanRevision

| 合同 | 强制语义 | E0 尚待确定 |
| --- | --- | --- |
| `PlanDefinition` | typed Node/Edge/Port/Agent/capability references、允许的动态图修改范围、Model/Tool/Context/Quality/Output/预算约束及原 source authority refs | 物理 schema/严格 validator/plan id 与导入导出格式；作者资源存储归属 |
| `PlanDraft` | owner/namespace、base revision、草稿 version/hash、变更/CAS/合法授权与并发冲突，不影响正在执行的 Run | Draft store/transaction scope、操作历史与离开保护的 Host/UI 最小同步 |
| `PlanRevision` | 经过 Host Validation、相应 source/grant 检查的 immutable plan identity、source/author/revision/content hash 与审批快照，供 RunAdmission 固定 | 发布原子事务、唯一命名/当前 pointer 与原 Studio/Library 生命周期 |
| `ValidationReport` | 将 blocking/unknown/warning 绑定确切 node/edge/field、rule/code/source/version；纯 Validate 不发 Provider、Tool、Secret 或产生无关写入 | 可运行校验与合法 preview 的边界、外部 capability evidence 时效 |

**强制区分**：Validated Draft ≠ Published Revision ≠ Approved Run ≠ Effect dispatched ≠ World/Project Commit。画布几何位置和本地排序不改变图执行语义。

## 3. RunIdentity / TaskGraph / NodeAttempt / Checkpoint

- Run 身份至少绑定稳定 `runId`、Owner/Scope、消费域（RP/Game/Studio）、`planRevision`、原 source/branch/revision anchors、parent/child lineage、Host generation/epoch、不可重置的已使用预算身份与 OutputOwner。各存储域的 revision 需保留原来源。
- `RunLedger` 提供 durable 状态推进、Checkpoint/append events、CAS/fencing；运行中 GraphPatch 必须基于确切 `taskGraphRevision` 进行 Host whole-patch validation，不允许 Planner 直接改持久图，执行中的 Effect 不会因编辑节点被“删除”。
- `NodeAttempt` 标记独立尝试身份、已冻结当前所需 SourceRefs/ResultRefs、effect refs、前置条件及终态/unknown；重试/局部重做生成新的 Attempt 与 Effect identity，旧花费/审计结果不能抹掉、重新计费或以相同 EffectIntent 再发危险写入。
- 并行 Join（all/settled/any/quorum/deadline）、Delegate/Handoff、Review、bounded loops 原有 D3 权威不重定义；Host 记录 stable participants、JoinReceipt 与决定顺序。迟到子分支/旧 epoch 回调不得覆盖结算/新分支正文。
- 终态与恢复出口需要能说明 completed、partial、failed、cancelled、stale、blocked、unknown、waiting_approval、reconciling 的真实不同语义；物理状态枚举、GC/Retention 和事务/事件一致性**必须在 E0 验证后才能锁定**。
- **不可把**现有 `NativeTaskScheduler` 的进程内 Map 或旧 Browser IndexedDB 当成已经具备 durable RunLedger；原 Scheduler 只提供准入/资源许可与队列协作。

## 4. EffectIntent、Approval 与原业务 Receipt

- `EffectIntent`（发出前耐久）至少需要关联 run/node/attempt/effect identity、准确 action/tool/target/endpoint binding/normalized input fingerprint、source/actor/scope guards、Capability Grant、预算 reservation ref、风险和可信审批 binding、reconcile/idempotency policy；只保存最小脱敏控制元数据，不复制 Secret、原 Tool 全文或 opaque reasoning。
- `ApprovalRequest/Decision` 是独立可恢复状态：可审查谁、什么 target/参数/版本、预算/外发/风险、有限有效期/nonce 与原 user/author permission；模型文本或未验证客户端 Boolean 绝非批准。发出前在真实 Host/原业务 CAS 下重新校验源/参数/权限/Endpoint/epoch、过期 fail-closed。
- `EffectReceipt` 记录 not_dispatched/dispatched/confirmed/failed/cancel_requested/stale/unknown/reconciled 的**可证实事实**、外部 operation/task refs、actual/unknown cost、source/provenance 与指向 DomainCommitReceipt 的引用。对已经可能发送而结果未知的外部写入，先查询原 Native/remote status；没有安全证据则等待审查，**绝不盲重发或假称 exactly-once**。
- `DomainCommitReceipt` 由原 World/Session/Studio/Project/Asset/Media 等 Native 权威产生。Orchestration EffectReceipt 是关联证据，不能因为 Tool/MCP/A2A/Agent/Judge 报成功就写正式 World/Project。取消不能自动回滚已提交业务副作用/退款。
- 原 Provider/RunControl/Project Task Compute 账本负责父子原子 reservation/charge/settle/unknown；V3 Ledger 只保存关联 ID/投影而不是第二收费账本，跨 FS/SQLite/外部服务不臆称无证据的单笔分布式事务。

## 5. ResultEnvelope / OutputContract / RunProjection

| 接口 | 必须可以验证 | 消费限制 |
| --- | --- | --- |
| `ResultEnvelope` | producer/run/attempt、typed output/schema、SourceRef lineage、actor/time/branch/revision、currentness/quality/evidence/restriction、partial/unknown | 接收 Agent/Join/Judge/Editor 按 D4 audience 与当时来源重新授权；摘要/缓存/Review 不能洗白私有信息 |
| `OutputContract` | RP Narrator 最终正文、Studio Task Artifact/Review/Command Proposal 等明确 owner 和 target；真实 World/Project/Source/permission 验证 | 每回合恰一个获准正文 owner，Studio 正式 Commit 仍走原审批，Output ≠ 原业务写入 |
| `RunProjection` | Host 授权 snapshot、稳定 run/scope/epoch/projection version、delta sequence、NodeAttempt/GraphPatch/Join/Effect/Approval/Usage 可见部分 | 客户端接收的是脱敏视图，**不能**从投影恢复或驱动业务 Run；不能泄露 Secret、NPC 私有 Cognition、Provider hidden reasoning |
| `Trace/Diagnostics` | 精确 error/reason/ref/status、原 callback/source/attempt lineage 和实际费用/unknown | Replay/Import 默认只读，不能通过点击恢复历史记录触发新发送/重新提交 |

- UI 的 Timeline 默认/Graph 切换与新 Graph+Inspector 编辑继续沿 D8 和 Serene Canvas；View state 不是 authoritative execution state。
- Node/Run status streaming 要具备快照 + 增量协议、重连/去重/旧 epoch fencing、身份/权限更新；Control RPC 要在审批/长任务等待时独立可用，不能被高成本 Worker 或 Canvas rendering 阻塞。

## 6. 物理落点与存储合同 v1

本节起为 2026-10-15 在 `main@60aca695726893e298b7d485f300c6efef3b79fd` 上审查后冻结的**可实施工程合同**；不更改 D1–D9，不表示表/模块/API 已存在。前五节保留 D9 语义方向，其中“尚待确定”的物理项由本节对应项收束；实证未完成仍见 [e0-audit §9](e0-audit.md#9-存储预算权限证据与未闭合项)。禁止用下面的新名称注册第二 World/Memory/Model/预算服务。

### 6.1 代码归属与 key

新增编排元数据应置于 `src/native/orchestration/`（contracts、plan-repository、run-repository、controller、projection、domain-ports），纯共享 validator 可在 `public/shared/native-orchestration-contracts.js`；HTTP adapter 在 `src/endpoints/native-orchestration.js`，Browser client 放 `public/scripts/native/`。这些是**未来路径**，本轮不创建。复用现有 StorageEngine、`nativeRecord/putImmutable/putMutable/hashNativeDocument`、NativeTaskScheduler、原 Context/Model/RunControl/Project/Experience 服务；不扩展受 Model/Prompt 类型白名单限制的 VersionedJsonResourceHandler 来容纳 Run，不借用 Provider RuntimeCheckpoint。

在既有 `NATIVE_RESOURCE_KINDS` / `RESOURCE_KEY_SPECS` 注册下列专用 metadata kinds，key 只含经过原 validator 校验的 token/ID，不含路径、Secret 或客户端 handle。所有 key 第一个字段都是 Host 认证取得的 `handle`。

| kind（未来新增） | 其余有序 key fields | doc 与可变性 |
| --- | --- | --- |
| `atri_orchestration_plan` | `planId` | PlanRoot：Draft/authoring revision/current published pointer；CAS mutable |
| `atri_orchestration_binding` | `bindingId` | 精确 source subject 的新 PlanBinding；CAS mutable，禁止旧 preset 映射 |
| `atri_orchestration_plan_revision` | `planId, planRevisionId` | 完整 immutable PlanRevision；insert-if-absent，同 identity 不同 integrity 冲突 |
| `atri_orchestration_run` | `runId` | RunRoot：stateVersion/eventSeq、graph、active attempts/record refs、epoch/limits/progress；CAS mutable |
| `atri_orchestration_record` | `runId, recordType, recordId` | `attempt/patch/join/effect/receipt/approval/result/event/output`；各类型 validator 决定 immutable/mutable，禁止任意 JSON dump |
| `atri_orchestration_command` | `commandId` | owner 下命令去重：payloadHash、operation、target、outcome refs；同 ID 不同 payload 冲突 |

ID 在原 `identity.js` 扩展 UUID family：`oplan/oprev/orun/onode/oattempt/oedge/opatch/oeffect/oreceipt/oapproval/oresult/ocmd` 加 `_` 和 32 lowercase UUID hex。DraftVersion/stateVersion/graphRevision/eventSeq/epoch 为 nonnegative safe integer，递增不可倒退；recordType 为上述封闭 token。用户可导入作者节点 ID 时须先经 native ID validator，重复/不合法拒绝；不通过更名映射旧模式/旧数据。

实际物理布局沿既有 Native handler：FS 为 `resolveUserDirectory(dirs,'nativeResources')/<kind>/<nativeResourceFileId(key)>.json`（本组 key 无 sessionId 层）；file ID 按当前 `nativeResourceFileId` 的 kind + NUL + encoded ordered fields 做 SHA-256。SQL 沿 `native_resources(handle,kind,resource_key,doc,integrity,updated_at,created_at)`，不新建 V3 数据库。新增 kinds 必须同步四 Engine 注册、dump/restore/delete、reference/GC/统计覆盖；不得绕 FS Native Journal 用任意文件 write。

### 6.2 序列化、hash 与事务

- `schemaVersion:1`；严格白名单 fields，未知字段、非有限数、循环、非 JSON 值拒绝。用现有 `serializeNativeDocument/hashNativeDocument`（对象键排序、数组保序、UTF-8、SHA-256 lowercase hex），**不宣称 RFC JCS**。Browser 计算的 hash 仅供预检，Host 重算；hash 是一致性指纹，不是授权/签名。
- Plan `definitionHash` 只 hash `{schemaVersion,definition,dependencyPins}`；几何/缩放/选择放独立 `viewState`，不得改变语义 hash。PlanRevision doc integrity 按完整 doc 重算。`dependencyPins` 精确钉住原 Prompt/Route/Tool schema/Skill refs，动态 grant/currentness 运行时重验，不复制 Secret。
- Plan publish：同一 `engine.withTransaction(handle,tx)` 检查 DraftVersion + definitionHash + 当前权限/依赖，`putImmutable(revision)` + CAS PlanRoot pointer + command outcome；事务成功返回才 ACK。Validate 报告不是跨变更的许可证。
- Run mutation：`withNativeResourceWrites` 对资源 ID 排序锁，再同一 Engine tx 读 root，比较 expected integrity/stateVersion/epoch/graphRevision；更新 root、相关 records、event 与 command outcome **同一事务**。V3 不使用“先事件后状态”的双写。RunRoot/records 为恢复真相，event 为同事务审计与投影 cursor；snapshot 不得比 event cursor 更新。
- CAS 409 不透明重跑旧 patch/approval；重读后让 controller 重新 guard。当前三个 SQL Native handler 均实现专用 `putIfMatch`：insert-if-absent 与 `UPDATE ... WHERE integrity = expected`，这是单行原子 CAS；通用 fallback 才是 read/compare/write。V3 必须走 Native handler，并以同事务 root CAS 保护所有关联 records。单行 CAS 不自动提供整个 Host 生命周期/跨 store/网络事务排他。
- 单 Native Host 是产品权威，**不等于进程内 Map 能排斥第二进程**。同一 canonical data root 的可写 Host 必须有存活期独占 lease/fencing。复用现有服务启动/存储独占机制若能证明；否则在原 Storage 生命周期扩展，不能在 V3 私有层声称获得全站锁。自动 stale takeover 需证明旧进程退出/原发送失效，不能只凭墙钟 TTL。无法排斥时 `native_orchestration_writer_unavailable`，拒绝启动可写编排。当前排他实证 BLOCKED。

### 6.3 Store 支持与崩溃保证的实际边界

| Engine / 当前证据 | v1 必须实现 | 本次真实状态 |
| --- | --- | --- |
| FS：`fs-engine.js` root tail/AsyncLocalStorage；`fs-native-journal.js` prepare→publish→install→ACK，原生 kinds redo | 新 kinds 全走 journal；恢复完才读/ACK；digest/JSON 损坏 fail-closed；不能在 tx 内等网络/审批 | STATIC；V3 注入 NOT_RUN |
| SQLite：`sqlite-engine.js` WAL/FULL、per-handle tail、BEGIN IMMEDIATE | 注册新 kinds、root/record tx 一致、busy/conflict 明确错误；导出/restore 走原 engine closure | STATIC；V3 注入 NOT_RUN |
| MySQL / Postgres：原 Engine transaction 与 Native resources 通用 handlers | 同一合同；注册/dump/restore/删除/引用完整；任何未验证 adapter 不能启用发送再退回 Browser/FS | STATIC；连接/崩溃/并发 BLOCKED |
| Windows durable-file | 当前 `syncDirectory/Async` 在 win32 明确 no-op；文件内容先 sync 再 rename，目录元数据由 OS 管理 | 不能声称真实断电保证；Windows L2 kill 及 L3 断电语义独立标记 |

本地进程 kill/restart 能验证软件故障窗口，不能冒充硬件掉电/磁盘控制器保证。不给未测试 Store 默默切换另一 Engine；不支持能力需在 RunAdmission 前明确拒绝，并保留产品完成阻塞。

## 7. 可实施 JSON 对象合同

下表列字段为 required，`?` 代表 optional；可空字段显式 `null`，禁用跨对象猜默认。输入 payload 正文/中间产物通过**原有受权 Task/Artifact/Source**引用保存；必要的 task-local Result payload 可保存在最小的受 scope 保护 result record 中，带 schema/字节界限和有效依赖，不得塞 Secret 或 opaque reasoning。长度/图规模/保留期限由显式 `limits/retentionPolicyRef` 提供，没有有效配置就 validation error；不凭审计编造性能 SLO。

| 对象 | 字段（v1）与不变量 |
| --- | --- |
| `PlanRoot` | `schemaVersion,planId,ownerRef,draftVersion,basePlanRevisionId,definition,dependencyPins,definitionHash,currentPlanRevisionId,viewState,archived,createdAt,updatedAt`；ownerRef 为 Host 身份，Draft 不引用旧 preset |
| `PlanBinding` | `schemaVersion,bindingId,sourceSelector,planRef,version,changedBy,changedAt`；bindingId 为原 canonical hash(sourceSelector)，sourceSelector 是原 RP/Session/Project 的精确 stable subject，Host 校验 owner/source 权限；planRef 精确钉 revision，缺 binding 不回退旧模式 |
| `PlanRevision` | `schemaVersion,planId,planRevisionId,definition,dependencyPins,definitionHash,authorRef,validationDigest,publishedAt`；definition 含 nodes/typed ports/edges/agent refs/capability ceilings/graphChangePolicy/limits/outputContract；immutable |
| `ValidationReport` | `schemaVersion,planId,draftVersion,definitionHash,dependencyDigest,status,issues,checkedAt`；status `valid/invalid/unknown`；issue 含 `code,severity,nodeId?,edgeId?,fieldPath?,sourceRef?,evidenceRef?`；missing/unknown required evidence 阻止 publish |
| `SourceBinding` | tagged union：Session 使用原 sessionId/branchId/revisionId/scopeEpoch；普通 RP 使用原 Experience/SourceAdapter 的 chat/message/variant/hash anchor；Project 使用 projectId/taskId/baseRevision/sourceHash。完整嵌入原 `sourceRef`、`sourceAuthority` 与 bindingDigest；不是同名全局 revision，不为普通 RP 伪造 Session |
| `RunRoot` | `schemaVersion,runId,ownerRef,planRef,sourceBinding,parentRef,rootRunId,budgetAuthorityRef,hostBootId,epoch,stateVersion,graphRevision,eventSeq,status,graph,attemptRefs,pendingEffectRefs,pendingApprovalRefs,resultRefs,outputClaims,progress,limits,retentionPolicyRef,createdAt,updatedAt`；parentRef 含 parentRunId/nodeAttemptId/delegationId/返回合同或 null；不保存真实余额 |
| `NodeAttempt` | `schemaVersion,runId,nodeId,attemptId,attemptNumber,epoch,graphRevision,inputRefs,inputDigest,sourceBindingDigest,effectiveGrantDigest,budgetRef,status,effectRefs,resultRefs,startedAt,endedAt,reasonCode`；替换 attempt 不覆盖旧记录 |
| `GraphPatch` | `schemaVersion,patchId,runId,producerAttemptId,expectedEpoch,expectedGraphRevision,operations,reasonRefs,payloadHash`；operation tagged union `addNode/addEdge/setPendingPriority/cancelPending/markBlocked/requestFinalize/requestReplan`；Host 验证整补丁后保存 immutable PatchReceipt `{patchId,accepted,newGraphRevision,issues,decisionSeq}`；重复相同 patch 返回原结果 |
| `JoinReceipt` | `schemaVersion,joinId,runId,nodeAttemptId,graphRevision,memberAttemptIds,policy,quorum,deadlineAt,cutoffSeq,acceptedResultRefs,excluded,reasons,outcome`；membership 在 fanout 时冻结；成功不足不可 complete，迟到不能改收据 |
| `EffectIntent` | `schemaVersion,effectId,runId,nodeAttemptId,epoch,graphRevision,actionRef,targetRef,endpointBindingDigest,inputRef,inputHash,sourceBindingDigest,grantDigest,risk,egressDigest,budgetAttemptRef,approvalRef,dispatchPolicy,status,dispatchToken,createdAt`；`risk=R0/R1/R2/R3`；dispatchPolicy 含 `idempotency=none/domain_key/remote_key`、真实 operation key、`reconcile=domain_status/remote_status/manual`；拒绝虚构第三方幂等能力 |
| `EffectReceipt` | `schemaVersion,receiptId,effectId,runId,observedEpoch,observationId,outcome,dispatchEvidence,remoteOperationRef,domainReceiptRef,budgetObservationRef,resultRefs,sourceRefs,observedAt,reasonCode`；append-only，不能覆写旧 unknown；confirmed 必有可核验证据，成本只引用原账本 |
| `ApprovalRequest` | `schemaVersion,approvalId,effectId,runId,nodeAttemptId,bindingHash,actorRequirement,requestNonceHash,hostBootId,epoch,sourceBindingDigest,endpointBindingDigest,inputHash,budgetEnvelopeDigest,risk,expiresAt,status,decisionRef`；等待态可持久，nonce 原值只送可信交互通道 |
| `ApprovalDecision` | `schemaVersion,decisionId,approvalId,bindingHash,principalRef,authenticationContextRef,decision,decidedAt,expiresAt,hostBootId,epoch`；`approve/reject`；一次使用与 Effect ready→dispatching 同事务标 consumed；Boot 改变旧批准失效 |
| `ResultEnvelope` | `schemaVersion,resultId,runId,producerAttemptId,outputType,outputSchemaRef,payloadRef,sourceRefs,dependencyDigest,audienceConstraint,disclosureConstraint,qualityRefs,status,createdAt`；`complete/partial/unknown/unavailable`；接收方独立重新授权 |
| `OutputClaim` | `schemaVersion,claimId,runId,nodeAttemptId,outputKey,sourceBindingDigest,resultRef,consumerRef,operationRef,status,domainReceiptRef`；原 consumer 使用稳定 operationRef；outputKey 按原 hash 对 exact source input turn/message+variant+output slot 计算；同一个 source turn/variant/output slot 恰一合法 owner；仅 runId 去重不足以防两个 Run 双正文 |

Run status：`admitted/running/waiting_approval/reconciling/blocked/completed/partial/failed/cancelled/stale`。`unknown` 是 Effect/Result 的知识状态；Run 有 unknown effect 时通常 `reconciling/blocked`，不能标完成。Effect status：`prepared/ready/dispatching/confirmed/failed/not_dispatched/unknown`；cancelRequested 单独布尔/事件，不能代替真实结果。Approval：`pending/approved/rejected/expired/invalidated/consumed`。所有跨状态转移由 controller validator 管，Browser 不能写 status。

### 7.1 Graph/循环/父子物理约束

- GraphRevision 从 0 开始；patch 整体通过后加 1；不得新增/替换 active/settled effect 的输入。`graphChangePolicy` 与每个节点 kind/typed port 采用封闭 schema，拒绝动态可执行 JS/predicate；条件只用受控表达式或 deterministic handler。
- `progress` 持久记录 steps、attempts、patches、replans、reviews、delegates、handoffs、edgeVisits、loopIterations、depth、高水位 deadline；CAS 同时检查父/子 limit。相同规范化提案+相同合法输入 digest 无新证据时拒绝无进展循环。墙钟 deadline 不是 World Tick。
- Delegate 先在同一 tx 写 parent delegation record 与 child root，生成 child grant intersection、budget reservation ref，commit 后才排队。Handoff 另存 control token/entry/return/terminal 条件；Host owner 从不移交。Join receipt 在父 CAS 内以持久 decisionSeq 结算，不能被网络到达顺序或重启重开。
- Review 重做仅创建新 attempt 与依赖闭包失效记录，不能删除旧 DomainReceipt、消费历史预算或已结算 Join。正式 output 若已提交，只能原领域明确的新版本/纠错命令，不能自动覆盖。

## 8. 原预算/发送与恢复协议

### 8.1 唯一 authority 与必要扩展

当前事实：`RunControl.charge/chargeCompute/settleCompute` 持原 Session bank；Project 由原 `ProjectAgentService` / ProjectTaskRepository 持有 compute；`native-compute-budget.js` 的 `reserve` 是 mandatory allowance headroom，**不是**完整子 Run reservation tree。当前 GenerationHost send path 内 `randomUUID()` 产生 compute attempt，若 V3 再造一套 charge 将双计。

冻结扩展位置为**原** RunControl/Project Agent + 共用 native-compute-budget validator，V3 仅使用 `BudgetPort` typed interface：

| 方法（未来） | 输入/返回 |
| --- | --- |
| `reserveChild` | `{authorityRef,parentReservationId,childRunId,ceiling,expectedVersion,commandId}` → 原 ledger `{reservationId,version,ceiling,status}`；同父原子收紧，不发模型 |
| `admitAttempt` | `{authorityRef,reservationId,effectId,attemptId,inputFingerprint,upperBound,requiredHeadroom}` → 原稳定 `budgetAttemptRef`；相同 identity+input 返回同记录，不同 input 冲突 |
| `observeAttempt` | exact authorityRef/attemptId → charged/settled/unknown/not_dispatched 的真实记录；不得通过重复 charge 推测是否成功 |
| `settleAttempt` | `{attemptRef,observationId,usage,provenNotDispatched}`；可信实际 usage 或 unknown，上界占用不自动释放；结算幂等 |
| `releaseUnused` | 只释放证明未派发的余量；已派发 unknown 不退款；child 关闭不重置父 spent/highWater |

子额度不是第二收费；原 ledger 内 `reservations` 形成 parentId→childRunId 的 allocation tree，attempt 精确引用 leaf reservation，根范围汇总一次 actual charge。父可用额度扣除所有未结算占用；子不能借新 Run/GraphPatch/Branch restore 增加根额度。限额、currency/economics provenance、版本 validator 都在原 authority 扩展；缺可信金额价格/cap 仅 estimated，不承诺金额硬封顶。

需要将稳定 attempt identity 从 V3 通过**受信内部调用**送到 GenerationHost 的真实每次 provider send/fallback；公共 Browser 不得自行提交/覆盖 budgetAttemptRef。每次实际 fallback/retry 都有独立 attempt，仍关联原 Effect/sub-send。无来源 budget authority 的普通 RP/自定义任务返回 `native_orchestration_budget_unavailable`，不能创建 V3 私有资金库或伪装 Project/Session。该域完整接入目前 BLOCKED。

### 8.2 跨权威 saga 与崩溃窗口

不把 Engine tx 跨越 Provider 网络或另一个领域事务。顺序固定：

1. Host tx 创建 `prepared EffectIntent` 与稳定 attemptId/参数/审批 binding，durable ACK；此时禁止 Port send。
2. 原 BudgetPort 原子准入同 attempt，持久返回 budget ref。崩溃在两 store 之间：由 observeAttempt 查回原记录；没有查询证明就 blocked，不能重复扣费/发送。
3. Host tx 关联原 budget ref + 重新 guard → ready。审批若缺/过期仍等待，不长期占 scheduler permit 或写锁。
4. Host tx CAS `ready→dispatching`、consume 精确 approval、生成 dispatchToken 并 commit。**dispatching 表示可能发送，不能证明已发送或未发送**。
5. 原 Native Port 在真正发送前核验 dispatcher token/epoch/source/current grant/endpoint，沿 GenerationHost/原 Tool authority 发送。业务提交仍用原 idempotency/operation key；Host 不把 token 当跨第三方 fence。
6. 原 Domain/Provider 结算真实 charge/receipt，Host append immutable EffectReceipt + 更新 root/Result。若 Domain 已提交而 Host 未记录，恢复按原 operationRef 查询，不能重做正式 mutation。

| 崩溃位置 | 唯一安全恢复 |
| --- | --- |
| prepared 前/Host commit 失败 | 不发送；command outcome 未知先查 command，不凭前端超时新建同动作 |
| prepared 后/budget 调用中 | 用稳定 attempt 查询原 bank；无证据则 blocked |
| ready 且无 dispatch claim | current Host 重验后可 claim 同 Effect；不能因 Boot 改变沿用旧 Approval |
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
| `/plans/create`, `/plans/save` | definition/dependencyPins/viewState；save 带 planId/expectedDraftVersion/expectedDefinitionHash |
| `/plans/validate` | planId/draftVersion/definitionHash；纯校验，零 Tool/Secret/Provider send |
| `/plans/publish` | planId/expectedDraftVersion/definitionHash/validationDigest；Host 重验后 immutable publish |
| `/runs/start` | exact planRef/sourceBinding/outputContract/budgetAuthorityRef；不能由客户端指定 grant/epoch/spent |
| `/runs/observe` | runId/cursor/limit；返回 snapshot 或 deltaBatch；断联无自动 cancel |
| `/runs/cancel` | runId/expectedEpoch/expectedStateVersion/reason；持久 cancelRequested、fence 新 dispatch；不伪造远端撤销 |
| `/runs/resume`, `/runs/reconcile` | runId/expectedEpoch/expectedStateVersion；current authority 重审；unknown 不可通过 resume 强制重发 |
| `/runs/diagnostics`, `/results/read` | exact refs + current audience；仅授权投影、分页；trace replay/import 无执行权 |
| `/approvals/get`, `/approvals/decide` | decision 需 approvalId/bindingHash/requestNonce/decision/expectedEpoch；本人认证会话，旧/重复批准 fail-closed |

GraphPatch/Effect/DomainPort 不作为 Browser 任意调用 API 暴露；Host 内部 `proposeGraphPatch`、`dispatchEffect`、`claimOutput` 统一经过 controller。作者通过 save 新 Draft 修改未来 Plan，不能从 UI 修改 active Run graph。

Projection：`{schemaVersion,runId,projectionId,hostBootId,epoch,projectionVersion,visibilityDigest,seq,cursor,kind,payload}`。snapshot 自包含授权 Run 摘要/当前 graph refs；delta batch 带 `fromSeq,toSeq,baseProjectionVersion`，重复 seq 丢弃、缺口/旧 projectionId/epoch/visibilityDigest 变化则清旧视图后重新请求 snapshot，禁止拼接不同授权域。后端每次观察重新检查 owner/Source/Actor/disclosure；projectionVersion 是该 view 合同版本，seq 是该授权 projection stream 的连续序号，**不是内部持久 eventSeq**。cursor 为不暴露内部位置的 opaque token，Host 以有界非权威订阅 Map 关联内部 eventSeq；断线/重启或 cursor 失效只重取 snapshot，不由此恢复 Run。隐藏事件不递增该客户端可见 seq；对无权限用户不暴露内部计数、私密节点数量或错误详情。payload 禁 Secret、nonce、opaque reasoning、未获准 NPC/Result 原文；审批实际参数通过本人受控详情另取。

审批真实性边界：认证 owner 会话 + CSRF + allowlisted Origin + expected boot + 一次 challenge nonce + 精确 binding + 原领域批准是最低条件，不能只收 `confirm:true`。模型、Tool、插件 Runtime SDK 不获得 `/approvals/decide` capability/nonce；请求展示和决策通道须独立受控，R3 要使用原领域能提供的更强身份/交互保护。**同 origin 已获任意 JS 执行权的恶意扩展无法仅凭 CSRF/isTrusted 被彻底隔离**：没有受信 UI/重认证隔离证明，相应 mutation/R3 保持 blocked，不能在本审计虚构平台原生批准通道已存在。完整 approval binding hash 覆盖 effect+action/target/input/source/endpoint/grant/egress/budget envelope/boot/epoch/expiry；消耗与 dispatch claim 原子化。

错误码统一 `native_orchestration_*`：`invalid_schema/invalid_graph/validation_unknown/plan_conflict/run_conflict/graph_conflict/command_conflict/stale_source/stale_epoch/permission_denied/approval_required/approval_stale/approval_channel_untrusted/budget_unavailable/budget_exhausted/effect_unknown/reconcile_required/writer_unavailable/storage_unavailable/projection_resync_required/legacy_unsupported`。映射 400/401/403/404/409/422/503，错误不含私密值；原领域失败保留其 `domainCode` 和 safe refs，不转换成假成功。

## 10. 保留、GC、备份与恢复

- PlanRevision 被任何 Run/Evolution/publication/authoring ref 钉住时不可删；Run root、未消费审批、dispatching/unknown Effect、未结算 budget attempt、正式 Output/DomainReceipt ref 是保留根。未知不是过期后可随便删除的缓存。
- 不另设 V3 自动回收站/存储中心；按现有 Session maintenance 的 generation+reachability+CAS 方式向原 Storage/Reference/GC authority 注册 V3 refs。scope 失效可以停止执行/收紧可见性，不能删除正式业务真相或造退款。terminal 且已 reconcile 的控制元数据按显式 retentionPolicyRef 收缩，缺配置默认不自动 GC。
- 账号 backup/restore 包含受管新 kinds，恢复后增加 Host epoch、所有旧批准失效，Run 进入 blocked/reconciling；导入历史 Run/Projection/Trace 不能自动发送或以 restored budget 退款。保留原 RunControl/Project high-water 与正式收据，检测账本回退无法证明时拒绝恢复执行。
- Session `.atriasave` 不是 V3 Run 的迁移格式；Save/fork/restore 必须让原 SourceBinding 失效，V3 不随其复制活动 Run/approval/预算额度。删除来源对象前原 authority 能看到 V3 references 或明确退休阻塞；不借 V3 GC 越过原完整闭包/回收站政策。
- 首版不提供活动 Run 跨设备续跑或跨 Engine 的无停机迁移；原账户备份/迁移服务仍按其业务合同运行。元数据格式、失败状态与核对路线已冻结；真实恢复、GC、四 Engine 一致性仍 NOT_RUN/BLOCKED。

## 11. Product Binding、Evolution 与原 Domain Ports 的最终衔接

最终自审补足一个实际缺口：旧 API 不只有“运行 preset”，还有 `get/setPresetBinding` 与 Evolution publication；如果新合同只定义 Plan/Run、却没有原生 Plan 选择与发布指针，Settings/消费者仍可能回读旧配置。因此本 v1 使用第六个 `atri_orchestration_binding` kind（§6），由同一 Native PlanRepository 管理，不另建 preset/settings 系统。

### 11.1 新 Plan 选择与 Evolution 目标

- `sourceSelector` 采用原 SourceAdapter 的稳定 subject（普通 RP 的精确 chat/character/group 身份、Native Session 的精确 session/entry subject、Studio 的 project/task subject），source currentness 的 branch/variant/revision 仍在 RunAdmission 再验。selector v1 严格 union：`{domain:"rp_chat",charDir,name,isGroup,groupId}`、`{domain:"native_session",sessionId,entryPointId}`、`{domain:"project",projectId,taskId}`，不适用字段显式 null，值由原 source authority 校验；不作隐式父级选择。selector 不能用显示名称替代真正 ID，bindingId 由 Host 原 hash 算法推导；用户自行选择新 PlanRevision，**不从旧 preset/settings 自动生成 binding**。
- Run/start 必须提交 exact planRef；有产品绑定的自动入口从受权 PlanBinding 取该 ref，并钉 `bindingId/version`。缺/过期/无权/无原预算 authority 返回 blocked；不能 fallback 旧 mode 或创建假 Session。原用户本轮手动明确选择的 Plan 可不持久设为默认，但同样需原 source grant。
- Evolution 新目标物理 union：`{kind:'plan-prompt',bindingId,expectedBindingVersion,planRef,nodeId,promptModuleRef}` 与 `{kind:'plan-strategy',bindingId,expectedBindingVersion,planRef,nodeId,fieldPath}`。前者只指原 Native exact PromptModule；后者首版允许原 graph 合同内的 `reviewPolicy`、`limits`（自动候选只能收紧）、已获准的 exact `routeRef`。不开放任意 JSON path、capability/output owner/source grant/Secret 修改；增大额度或改变风险授权须新的原 authority 许可。
- 原 `EvolutionTargets` 继续拥有 target catalog/authorize/capture/prepare/check/current/write/discard/evaluationSettings，新增两分支，删除旧 workspace 两分支；原 Skill/Project targets 仍在各原 service。Target pin 包括 binding version、exact PlanRevision/hash、node/field/module、source/grant/route fingerprints；原 evaluator/报告/promotion/price/usage 权威不另建。
- Prompt candidate 由原 PromptCandidateStore/版本化资源 authority 产出新的 exact module ref；PlanRepository 发布**新的** immutable PlanRevision，最后 CAS 对应 PlanBinding。跨 store 使用原 Evolution publication journal 的阶段/operation refs 做 reconcile；新 module/Plan 已创建但 binding CAS 失败时记录冲突/保留候选，不覆盖用户并发变更，不假称跨 store 原子。
- 原 Evolution rollback 只能在 publicationCurrent/精确 CAS 仍成立时将 binding 指回获准旧 **V3 PlanRevision**（或发布合规的新修订），不修改正在运行的 Plan，不回滚已消费预算/DomainCommit。这里的旧 V3 revision 是新原生版本历史，绝非旧 Orchestrator 数据兼容。旧 workspace target 的历史 publication/报告只读，不能自动映射新 target 或重新赋予发布资格。
- Evaluation RP adapter 接受 frozen `planRef/sourceBinding/budgetAuthorityRef`、通过同一 Host Controller/Port 执行；worker 只持受限任务/证据，不载入旧 Director/Skill Resolver，不拿 Secret/生产 writer。`evolutionEvaluatorRevision()` 指纹列表替换为新 Controller/Contracts/Ports/Plan target 及仍有效原服务内容，原报告对新 evaluator 不合资格，不能靠保留旧文件维持旧指纹。

### 11.2 原业务 Port，禁止第二 writer

这些是 Orchestration 内部受信 adapter 方法，**不是 Browser 新增万能 mutation endpoint**。

| Port / 真实源码 authority | v1 内部调用合同与结果 |
| --- | --- |
| `ContextPort` → 原 Native Context/Information/Hybrid | `compile({ownerRef,sourceBinding,audience,taskPurpose,grantDigest,inputRefs,tokenBudget})` → 原 Context plan/evidence refs/currentness proof；`revalidate` 在 send/consume 前调用；不另造 compiler/Memory |
| `ModelPort` → GenerationHost/RouteResolver/GenerationService | `generate({effectId,attemptId,sourceBinding,routeRef,contextRef,outputSchemaRef,budgetAttemptRef,dispatchToken})` → 原 response/routing/actual attempt/usage refs；预算 identity 仅由可信 controller 注入，每次实际 sub-send 关联原收费 |
| `ToolPort` → 原 SessionPublicWork/Skill/MCP/A2A/Native action authority | `execute({effectId,dispatchToken,actionRef,targetRef,inputRef,sourceBinding,grantDigest,approvalRef,budgetAttemptRef})`；`observe({operationRef})` / `requestCancel` 走原领域；returns confirmed/not_dispatched/unknown+原 operation/receipt refs，不以 Tool 文本决定正式事实 |
| `NarrativeOutputPort` → Native SessionCore/RunControl 或原 ChatRepo | `claimAndCommit({outputKey,sourceBinding,resultRef,operationRef,expectedSourceDigest})`；Session 复用原 commitId/expectedRevisionId；普通 RP 的消息/variant/内容 hash CAS 和相同 operationRef 查询/去重扩展在**原 ChatRepo writer**。Browser 只呈现已获准输出，不能在 Host 之外再发独立 assistant commit；没有原 consumer 幂等/查询证据则 blocked |
| `ProjectOutputPort` → ProjectAgentService/ProjectTaskRepository/StudioService | `submitForReview({projectId,taskId,baseRevision,resultRef,changeSetRef,operationRef})` → 原 review/task receipt；正式 `commit` 仍由原 Author/Review 用户命令与 Studio CAS 执行；Run completed 不等同 Project 已修改 |
| `EvaluationPort` → 原 Experience/Eval/Evolution | `evaluate({case/profile/source refs,planRef,targetPin,budgetAuthorityRef})` → 原带身份/费用/provenance 的 report ref；publication/rollback 原 service 控制，不通过 Result 直接写 Plan/World |

原源对象更新后，新的 SourceBinding 由原 authority 回执给下一节点，不能由模型、Browser 或 RunLedger 自增虚构世界 revision。若 Narrative/Project consumer 的正式 commit 成功但 EffectReceipt 丢失，只查原 receipt；找不到确证时停 unknown。C02 的旧 `host.commitAssistant` 产品路径在 P6 删除或改为纯显示，不允许与 Host OutputPort 双提交。
