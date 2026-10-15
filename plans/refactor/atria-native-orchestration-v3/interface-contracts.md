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

§12–16是本次R项收口的物理增补，HostOwner、普通RP、Chat输出、ReviewOrigin与SQL失败细节以对应增补为准；§6–11的对象/域边界不另立第二份authority。

本节起为 2026-10-15 在 `main@60aca695726893e298b7d485f300c6efef3b79fd` 上审查后冻结的**可实施工程合同**；不更改 D1–D9，不表示表/模块/API 已存在。前五节保留 D9 语义方向，其中“尚待确定”的物理项由本节对应项收束；实证未完成仍见 [e0-audit §11](e0-audit.md#11-r01r08-设计与实施证据分账)。禁止用下面的新名称注册第二 World/Memory/Model/预算服务。

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
- CAS 409 不透明重跑旧 patch/approval；重读后让 controller 重新 guard。当前三个 SQL Native handler 均实现专用 `putIfMatch`：insert-if-absent 与 `UPDATE ... WHERE integrity = expected`，这是单行原子 CAS；通用 fallback 才是 read/compare/write。业务pool容量为1也不能因Owner占用而死锁；持有Owner的专用连接不用来执行长业务事务。V3 必须走 Native handler，并以同事务 root CAS 保护所有关联 records。单行 CAS 不自动提供整个 Host 生命周期/跨 store/网络事务排他。
- 单 Native Host 是产品权威，**不等于进程内 Map 能排斥第二进程**。同一 canonical data root 的可写 Host 必须有存活期独占 lease/fencing。复用现有服务启动/存储独占机制若能证明；否则在原 Storage 生命周期扩展，不能在 V3 私有层声称获得全站锁。自动 stale takeover 需证明旧进程退出/原发送失效，不能只凭墙钟 TTL。无法排斥时 `native_orchestration_writer_unavailable`，拒绝启动可写编排。实现策略已由§12固定；实证归P1，当前NOT_RUN。

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
| `PlanBinding` | `schemaVersion,bindingId,sourceSelector,planRef,version,changedBy,changedAt`；bindingId 为原 canonical hash(sourceSelector)，sourceSelector 是原 RP/Session/Project 的精确 stable subject（RP按§13原ChatRepo的controlId），Host 校验 owner/source 权限；planRef 精确钉 revision，缺 binding 不回退旧模式 |
| `PlanRevision` | `schemaVersion,planId,planRevisionId,definition,dependencyPins,definitionHash,authorRef,validationDigest,publishedAt`；definition 含 nodes/typed ports/edges/agent refs/capability ceilings/graphChangePolicy/limits/outputContract；immutable |
| `ValidationReport` | `schemaVersion,planId,draftVersion,definitionHash,dependencyDigest,status,issues,checkedAt`；status `valid/invalid/unknown`；issue 含 `code,severity,nodeId?,edgeId?,fieldPath?,sourceRef?,evidenceRef?`；missing/unknown required evidence 阻止 publish |
| `SourceBinding` | tagged union：Session 使用原 sessionId/branchId/revisionId/scopeEpoch；普通 RP 使用原ChatRepo分配的controlId与原Experience/SourceAdapter的chat/message/variant/hash anchor；Project 使用 projectId/taskId/baseRevision/sourceHash。完整嵌入原 `sourceRef`、`sourceAuthority` 与 bindingDigest；不是同名全局 revision，不为普通 RP 伪造 Session |
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

需要将稳定 attempt identity 从 V3 通过**受信内部调用**送到 GenerationHost 的真实每次 provider send/fallback；公共 Browser 不得自行提交/覆盖 budgetAttemptRef。每次实际 fallback/retry 都有独立 attempt，仍关联原 Effect/sub-send。无来源 budget authority 的普通 RP/自定义任务返回 `native_orchestration_budget_unavailable`，不能创建 V3 私有资金库或伪装 Project/Session。该域实现策略已由§13固定；实际接入归P3，当前NOT_RUN。

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
| `/approvals/get`, `/approvals/open-review`, `/approvals/reject` | 主origin仅脱敏待办/launch ref/拒绝，不返回decision nonce、不接收approve；原拟`/approvals/decide`不实现，具体Review Origin路由见§15 |

GraphPatch/Effect/DomainPort 不作为 Browser 任意调用 API 暴露；Host 内部 `proposeGraphPatch`、`dispatchEffect`、`claimOutput` 统一经过 controller。作者通过 save 新 Draft 修改未来 Plan，不能从 UI 修改 active Run graph。

Projection：`{schemaVersion,runId,projectionId,hostBootId,epoch,projectionVersion,visibilityDigest,seq,cursor,kind,payload}`。snapshot 自包含授权 Run 摘要/当前 graph refs；delta batch 带 `fromSeq,toSeq,baseProjectionVersion`，重复 seq 丢弃、缺口/旧 projectionId/epoch/visibilityDigest 变化则清旧视图后重新请求 snapshot，禁止拼接不同授权域。后端每次观察重新检查 owner/Source/Actor/disclosure；projectionVersion 是该 view 合同版本，seq 是该授权 projection stream 的连续序号，**不是内部持久 eventSeq**。cursor 为不暴露内部位置的 opaque token，Host 以有界非权威订阅 Map 关联内部 eventSeq；断线/重启或 cursor 失效只重取 snapshot，不由此恢复 Run。隐藏事件不递增该客户端可见 seq；对无权限用户不暴露内部计数、私密节点数量或错误详情。payload 禁 Secret、nonce、opaque reasoning、未获准 NPC/Result 原文；审批实际参数通过本人受控详情另取。

审批真实性边界（Review Origin接线唯一见§15；主origin不接收approve）：认证 owner 会话 + CSRF + allowlisted Origin + expected boot + 一次 challenge nonce + 精确 binding + 原领域批准是最低条件，不能只收 `confirm:true`。模型、Tool、插件Runtime SDK不获得Review Origin的`/review/decide` capability/nonce；请求展示和决策通道须独立受控，R3 要使用原领域能提供的更强身份/交互保护。**同 origin 已获任意 JS 执行权的恶意扩展无法仅凭 CSRF/isTrusted 被彻底隔离**：没有受信 UI/重认证隔离证明，相应 mutation/R3 保持 blocked，不能在本审计虚构平台原生批准通道已存在。完整 approval binding hash 覆盖 effect+action/target/input/source/endpoint/grant/egress/budget envelope/boot/epoch/expiry；消耗与 dispatch claim 原子化。

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

- `sourceSelector` 采用原 SourceAdapter 的稳定 subject（普通 RP 的精确 chat/character/group 身份、Native Session 的精确 session/entry subject、Studio 的 project/task subject），source currentness 的 branch/variant/revision 仍在 RunAdmission 再验。selector v1（RP稳定身份由§13补足）严格 union：`{domain:"rp_chat",controlId}`、`{domain:"native_session",sessionId,entryPointId}`、`{domain:"project",projectId,taskId}`，不适用字段显式 null，值由原 source authority 校验；不作隐式父级选择。selector 不能用显示名称替代真正 ID，bindingId 由 Host 原 hash 算法推导；用户自行选择新 PlanRevision，**不从旧 preset/settings 自动生成 binding**。
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

## 12. R02/R07 — Host Owner 与四Engine的确定实现策略

本节将§6.2的“需实现排他”收束为工程选择，归原 `src/storage` 生命周期与 `src/server-main.js` / `src/server-startup.js`，不是V3私有锁服务。**以下是设计，不是已运行结果**。原生持久化协议继续复用现有Engine/Journal/Native CAS。

### 12.1 本机data root的存活期Owner

- 本地FS/SQLite支持范围为同一OS网络命名空间内的本地可写data root；这里的root包括原Engine实际使用的`directoriesByHandle(handle).root`，不能只锁外层工作空间路径。Host在首次打开该handle前取得对应root guard，新增handle按同协议取得；不把共享网络文件系统、跨容器共享root、多设备同目录当成本机保证。若环境无法确认该范围，拒绝可写编排，不默默绕过排他。
- 原Storage启动在root建立一次性的 `native-host.identity`：`{schemaVersion:1,instanceId:<random UUID>,guardAlgorithm:1}`。首次通过exclusive-create写入并sync；其他进程只读取同一文件，部分写/格式损坏即启动失败，不生成备用identity。经realpath的别名、Windows大小写路径仍必须读取同一个root内identity；正常boot/配置端口变化不更换它。它是原Storage控制元数据，不含用户内容/Secret，不是RunLedger。
- `guardPort = 30000 + uint32be(SHA256(instanceId)[0..3]) % 20000`。同一Node Host在任何Native恢复/写入/发送前，以IPv4 `127.0.0.1` 绑定这个固定端口，`exclusive:true`，禁用port reuse/cluster共享；**端口冲突就writer_unavailable，禁止换端口试到成功**。监听器不提供HTTP/API或批准能力，只接受后立即关闭意外连接。端口hash碰撞会导致保守拒绝，不会变成两个Owner。
- 这是同一Native Host进程持有的OS资源，进程退出由OS释放，不靠可过期PID文件抢占。正常关闭顺序为停止admission→fence/取消尚未dispatch工作→保存可恢复状态→关闭原服务/连接→最后释放guard。guard异常关闭立即使Host writer permit失效；不能先释放guard再完成业务写入。原应用HTTP listener不是替代，因为两个进程可能配置不同HTTP端口。
- 首次切换产品真实root前，P6必须按e0-audit §8.1核实旧Host/Browser worker已停；不支持本guard/HostFence的旧版本不能由新协议自动约束，首次bootstrap不能凭端口空闲就声称旧writer已清退。P1–P5只在隔离测试root证明新机制，旧writer无法确认退出则P6禁止切换。
- 从备份恢复的identity可能与本机其他独立副本冲突，拒绝启动并显示原Storage诊断；不得在活动状态自动换identity绕过。不同root对同一SQL数据库还必须通过§12.2的数据库Owner排斥。单Host保证针对遵守原Storage协议的Atria进程，不把拥有OS写权限的任意恶意程序纳入可隔离范围。

原理依据：[Node v24.18.0 net.listen](https://nodejs.org/download/release/v24.18.0/docs/api/net.html#serverlistenoptions-callback) 定义独占句柄/端口复用行为；上述identity/hash/启动顺序是本方案的工程设计，不能由Node文档推断三端实现已通过。P1需在真实OS验证同时启动、路径别名、端口冲突、退出重开及guard关闭；若目标OS行为不同，该adapter fail-closed并修复，不能假称Owner成立。

### 12.2 SQL Owner 与持久fence

| Engine | 原Engine内确定的Owner机制 | 必须维护的边界 |
| --- | --- | --- |
| FS | root guard +现有root事务tail/Native Journal | guard获准后先recover journal再读/写；不把Map当跨进程锁 |
| SQLite | root guard +现有per-handle `BEGIN IMMEDIATE` / Native conditional CAS | 所有同root的SQLite文件沿原storage layout；不另开绕过Engine的连接执行V3写入 |
| MySQL | 原Engine创建独立于业务连接池、不可归还业务池的专用连接，`GET_LOCK('atria.native-host.' + SHA256(actualDatabase).slice(0,40),0)`；只接受返回1 | 锁名称按数据库实际名称产生，不按URL别名/连接配置名；连接异常后不自动取新连接继续原owner |
| Postgres | 原Engine创建独立于业务连接池、不可归还业务池的专用session连接，对固定`atria.native-host-owner.v1`字符串的SHA-256前两个有符号int32be值调用`pg_try_advisory_lock`；实际database内所有Atria表writer共用同一key | 必须是session lock，不能用事务结束即释放的lock；禁止transaction-pooling代理丢失session身份后仍声称持锁 |

MySQL会话级命名锁可跨commit保留且会话结束释放；Postgres也提供会话级advisory lock。依据 [MySQL 8.4 locking functions](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html) 和 [Postgres 17 advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)。这些锁是协作机制，不替代持久CAS或原领域权限。MySQL多primary/NDB、未知代理拓扑或无法证明session固定的部署先明确拒绝可写编排；原四Engine标准单primary/直连模式必须在P7取得真实验收，不能以永久拒绝代替完成该适用范围。

原Storage新增领域控制kind **`atri_host_fence`**，key `{handle}`，doc `{schemaVersion:1,generation,hostBootId,ownerInstanceId}`，由Engine Owner取得后CAS增加generation。每个handle先完成fence发布再允许它的Native写入；所有相关原Engine写事务都核对当前fence，SQL在同事务内持fence行共享锁，新的Owner更新fence需等旧写事务结束。不能只在V3 Repo做检查却让原RunControl/Chat/Studio writer绕开。跨进程旧boot的写入失败；callbacks只能交当前Host按correlation追加观察。

`atri_host_fence`归原Storage控制域，**不计入§6的六个Orchestration metadata kinds**，与下节原RunControl域扩展一起纳入原Native key/handler/backup/GC注册。FS使用原Native Journal，SQL沿现有native_resources；不引入独立Owner数据库。

Owner连接丢失/guard失效：先关dispatch/admission、失效permit，已有dispatching按可能发出处理，恢复必须重新获得Owner、发布新fence/Run epoch并reconcile。不能声称epoch会撤销已经发往第三方的请求；新Host绝不因“旧Owner没返回”重复派发同一未知effect。

### 12.3 SQL重试与commit未知

当前MySQL/Pg `withTransaction` 外围会重试transient error。V3及上述原领域扩展必须在原Engine提供 `withTransaction(...,{retryMode:'known_rollback_only'})` 选项（默认旧调用行为不在本任务无关改写）：

1. tx closure只做本地确定性存储，禁止Provider/Tool网络、等待审批、生成新的随机业务identity；commandId/attemptId/operationRef在进入closure前固定。
2. 开始前、或能够证明事务已rollback的deadlock/serialization失败可按原策略重试；root/command CAS仍须重新guard。
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
| ordinary RP | `{authority:'run_control',domain:'rp_chat',controlId,operationId}` | 原RunControl新增**`atri_rp_run_control`**，key `{handle,controlId}`；所有预算方法使用同一共用validator/算法，无影子账本 |

RPControl doc：`{schemaVersion:1,controlId,sourceIdentity,locator,sequence,generation,operations,retiredCompute,outputReceipts,restoreState}`。`controlId`为原Native identity扩展的`rpctl_<32 UUID hex>`。原ChatRepo在用户首次新V3绑定/开始操作时，CAS写入当前chat header的`chat_metadata.nativeControlId`，原RunControl初始化对应受管Native record；只有二者匹配才准入，部分初始化可按同controlId补齐但不发送。**这是对当前原生来源身份的新增管理，不读取/转换旧Orchestrator设置、preset、checkpoint或运行数据。** 既有合法聊天历史/sourceId保持不变。

sourceIdentity固定原source主体与Host分配controlId，locator只是当前位置。原ChatRepo rename保留controlId并更新locator；clone/fork按原业务创建独立身份并暂停活动Run，不能复制活动approval/预算余额。导入带重复/未注册controlId或来源无法唯一证明的资料先拒绝并按原导入review处理，不能把外来header当authority。对source预算的已花金额/attempt和retired totals继续由原RunControl保留，rename/variant/Run restart/图重做不清零。恢复导入不自动增加额度或启用发送；原ledger回退不可证明时保持restoreState=review_required。

每个RP operation冻结原input message/sourceId、variant、sourceContent hash、用途/输出slot；Host从当前ChatRepo/SourceAdapter取得，客户端不能指定任意旧来源。相同input operation派生的父子Run引用同根bank；RunId、childId和GraphRevision变化不新建根授权。真正新用户输入/明确的新任务可以由原RunControl依现行route policy建立新operation，其真实消费仍计入原owner/领域的持久累计，不能把它描述成旧费用退款。

GenerationHost增加受信内部 `sourceBinding` 的rp_chat分支，复用原RouteResolver/GenerationService/SecretPort/Context链；公共Browser不能自己提交已授权context或budgetAttemptRef。缺合法source、缺原route compute policy或RPControl尚未就绪时拒绝，不能回旧Browser runner、伪造Session或不计费发送。现有只支持Session/Project的HTTP接口不接受被伪装的RP输入；新controller内部adapter完成严格分派。

### 13.2 reservation tree与真实attempt的唯一结算

- 每一原bank只保留一个compute总账；根授权R的容量分解为`remaining(R) + delegatedCapacity(R) + committedOrUnknownSpend(R)`，其中delegatedCapacity只计子树尚未花费的已分配容量，committedOrUnknownSpend含整棵子树的实际/未知占用，每个attempt只出现一次；子delegation只是根内部转拨。对任一reservation，`自身已用/未知占用 + 未花子额度 + 自身可用`不能超过其授权ceiling；跨ancestor只核对/投影，不再扣一笔charge。
- `reserveChild`在原bank CAS内从父remaining转拨给child；child再次委派从自己的remaining转拨。leaf发送将remaining原子转为稳定attempt的上界占用。未花额度可返父，已dispatch/unknown占用不可释放；settle后可信actual低于上界的差额才回原reservation，超出上界记实际费用/overrun并阻止新admission，不能截断usage伪造守限。
- attemptId由Host在准备该具体provider sub-send前固定为 `SHA256({effectId,providerSendOrdinal})`，原validator接受该稳定hash；fallback/retry ordinal在Host/原Model attempt记录中CAS递增后才能准备下一send。相同attemptId+input fingerprint幂等返回原charge，不同输入冲突；观测/结算按同identity，不在GenerationHost里重新randomUUID生成第二charge。
- 原GenerationHost在真实send边界负责**唯一一次**`admitAttempt`；controller步骤§8.2-2可以提前调用同方法或observe，真实send只验证/沿用同ref。两次相同幂等调用不是两笔费用；未dispatch时不能因单次network fail重新产生ordinal，除非原effect retry policy允许并且旧结果已reconcile。
- 所有原bank变更受§12 Owner/fence/原Engine CAS保护；预算变更ACK未知先observe，同parent sibling不能分别读余额后各自放行。对未知gateway内部重试/价格无可信上界的费用标unknown/estimated，保留能证明的占用，不声称货币硬封顶。

此处新增的是原RunControl域一种存储key和source adapter，不是第七个Orchestration metadata kind；W04/P3必须把Session/Project/RP三种bank分别跑V04，未跑保持NOT_RUN。

## 14. R04 — 普通RP正式Output与跨FS边界

当前 `ChatRepo.append` 按`extra.gen_id`去重但不保证相同ID对应相同payload，FS `chat`不在Native Journal的原生kind集合中。**不能**在同一FsEngine tx里混写chat+V3/RunControl记录后宣称跨资源原子。确定采用原ChatRepo的单chat提交 + 原RunControl receipt reconcile，不新增聊天writer。

### 14.1 原ChatRepo方法合同

`commitNativeOutput(handle,{controlId,operationId,outputKey,inputAnchor,expectedIntegrity,expectedSourceDigest,payload,payloadHash,hostFence})` / `observeNativeOutput(handle,{controlId,operationId,outputKey})` 是原Repo受信方法，只有Host consumer可调用，Browser仍走显示/用户输入操作。outputKey按exact input turn/message+variant+slot产生，同一key跨Run争用归同一个原domain输出事务，不靠V3 RunRoot自己判断唯一正文。

1. 先在原RPControl CAS保存 `{outputKey,operationId,inputAnchor,payloadHash,status:'prepared'}`；operationId由原authority按outputKey固定，同key不同payload冲突；同identity重复请求只查询原结果。正式源版本/variant/玩家输入不得由Output改写。
2. 在独立的原RPControl Native事务里CAS `prepared→writing`，返回仅本次成功转移者持有的执行permit。此时不持有chat事务/写锁；已经writing的调用只能observe，不获得第二个permit。崩溃恢复不从marker缺失推断未写。
3. 获得该permit后进入原ChatRepo对应chat队列/Engine事务，先查现有domain marker；同operation/key/payloadHash返回原receipt，不同内容冲突。再校验header.nativeControlId、原input/source digest/variant、expectedIntegrity和HostFence。不在chat事务里调用另一个RPControl事务，不嵌套不同authority的原队列。
4. 在**同一个chat资源的原CAS提交**中保存正文/目标assistant variant与marker：`extra.gen_id='native-output:'+outputKey`，`extra.atri_output={schemaVersion:1,operationId,outputKey,payloadHash,sourceDigest,controlId}`。append/替换variant各按原用户操作的target，不创建第二正文；使用原完整chat原子写路径或已经证明等价的原incremental journal，正文和marker不能分两次写。原FS writer按durable-file barrier补齐其软件崩溃保证；不能因原writeFileAtomic函数存在就声称此新协议通过。
5. chat事务返回后，marker的真实数据成为原ChatRepo DomainReceipt，在独立Native事务把原RPControl的receipt ref/最终integrity置为committed；Host随后写EffectReceipt。正常ChatRepo读编辑保留Native控制字段，客户端payload不能伪造/清除marker；delete/rename/variant操作经原source guard保留必要receipt/tombstone或使未知输出不可自动恢复。

### 14.2 明确恢复窗口

| 持久事实 | 原authority处理 |
| --- | --- |
| prepared、确认尚未转writing | 重验source/授权后可以继续同输出事务 |
| writing，chat中存在完整匹配marker/正文hash | 读取原输出补齐RPControl/EffectReceipt，不能再append |
| writing，marker缺失/不完整/用户已编辑删除来源，或chat损坏 | unknown/conflict等待原用户review；不自动重发/补写，即使可能这次实际尚未写入 |
| committed receipt存在，当前chat后来被合法改动 | 返回历史receipt与currentness分开；不以历史receipt覆盖现在内容 |
| SQL chat+RPControl | 可以在原Engine同tx完成时采用原子路径；否则同样用上述saga，不降低FS共同语义 |

因此本轮关闭的是“如何实现唯一正文及未知恢复”的设计缺口，V06/CL08仍须P4验证两Run同slot、ACK丢失、writing前后崩溃、原用户编辑/variant/delete与Browser双提交拒绝。Evolution PlanBinding、candidate、publication/rollback沿§11原journal/CAS合同；其运行trace、旧report失格与新fingerprint在W07/P4–P6验证，不倒挂到E0。

## 15. R05 — 可信审批的隔离交互合同

§9的普通Browser `/approvals/decide` 不再作为允许批准的主origin接口；主origin只可创建/获取**脱敏待办或launch ref**、拒绝/取消，不可返回可批准nonce或接收approve。本节是现有S2 Host Gate的跨origin可信输入adapter，仍是**同一个Node Native Host、同一ApprovalRequest/Decision记录和原用户authority**，不是第二批准服务/权限库。

### 15.1 受控Review Origin

- 同Host启动一个仅回环绑定的review HTTP(S) listener，使用与主app不同的origin（包括端口），资产只有产品内置review页面/脚本/经过白名单的设计tokens。监听端口由Host实际绑定后生成launch URL；它没有Run/Tool/模型/通用文件API，不能成为另一个运行Host。线上经代理访问时必须有单独可信origin及固定Host/Origin校验；未配置该路径则对应approve unavailable，不能反向代理到主app同origin冒称隔离。
- 主app拿到的launch ref只能定位待审请求；Review Origin仅提供`POST /review/reauthenticate`、`/review/details`、`/review/decide`及内置静态页面，认证成功后才发一次性decision nonce到自己的页面；这三个路由不挂在主app origin。它使用独立命名的HttpOnly短期session、CSRF/nonce和精确Origin检查，不信任主app登录cookie已证明“本人做了这次批准”。**cookie不按端口隔离**，必须显式忽略主app cookie，不能把不同端口本身当cookie隔离。
- Review Origin复用原 `src/users.js` /原用户认证校验，首版通过已有本地密码重新认证，检查原accountVersion/owner和当时领域权限；不新增用户表/保存密码副本，输入密码不进入V3 Context/Record。没有可验证再认证能力的密码空白/OAuth-only账户只能拒绝/取消和使用原窄预授权能力，需要批准的动作明确unavailable，设置本地凭据或实现原OAuth支持的独立review-origin再认证后才可开放，不能伪造已批准。
- 页面固定 `COOP:same-origin`、`CSP frame-ancestors 'none'; default-src 'none'; connect-src 'self'; base-uri 'none'; form-action 'self'`，脚本仅内置hash/nonce；不开CORS，不嵌入frame，不载入Browser Runtime Extension、用户脚本、任意CSS/第三方资源。安全详情所有来源文本按纯文本编码，不能由Tool描述注入控件。沿原tokens的安全值呈现视觉，不把主app高级CSS带进批准origin。
- 主页面打开review用noopener，Review本身也通过COOP断开跨origin opener；不接受postMessage或URL参数提供的decision/“用户已点”。UI展示Host提供的实际target/input diff/source/endpoint/egress/预算，decision提交由本origin重新核对身份/nonce/bindingHash、当前epoch/source/grant，消费与dispatch claim仍按原durable CAS。

原理来源：[HTML Standard 的 origin / browsing context隔离](https://html.spec.whatwg.org/multipage/browsers.html#same-origin)；这里的review协议、复用账户与特定批准binding是本方案设计，必须P5/L2和三端L3验证，不能以浏览器标准替代实现证据。固定HTTP localhost只适用于同设备浏览器；LAN/远程路径必须沿原可信传输配置安全origin，缺失就不可批准，不泄露nonce/凭据到不可信网络。

### 15.2 保证范围与默认拒绝

同源主app里的模型/低信任脚本/Runtime Extension无法通过主app的普通HTTP调用读取review origin的nonce或签发approve；cross-origin表单/fetch、frame/opener、错误origin/跨用户都要有负例。SOP/COOP不隔离已获浏览器全站权限的恶意浏览器扩展、OS级键盘记录或同进程任意Host代码；这些不因新增review页面成为安全沙箱。

R0及已有精确policy ceiling覆盖的R1/领域窄操作可按D6自动准入；必须批准的R2/R3只有实际review通道+原域授权齐备才执行。任意shell/Host JS、未经保护插件执行和无原域安全机制的R3默认不注册为V3能力，真人点approve也不能绕过原policy ceiling。已有远端MCP/A2A允许的受限动作保持原范围；未知非幂等结果按§8.2查询/人工review，不用另一个EffectId重复同操作。该拒绝属于冻结的产品安全边界，不用它把D9要求支持的正式Studio Review/安全Native action永久留空。

P3先以受控测试批准输入验证绑定/重放拒绝和原Port Gate；P5实现真实Review Origin后才开放需要批准的产品动作；P7三端/远端/恶意输入实测。当前仍NOT_RUN，设备或认证前提缺失只阻对应运行功能/验收，不反向构成E0设计死循环。

## 16. R01/R06 — 动态消费边界与UI工程出口

R01设计闭包限定在已锁定main的tracked源码/资产/路由/设置/API；C01–C18、两个附件覆盖静态可定位消费者。计算加载器/外部安装内容不伪称已全解析：新Host不注册旧API/模式/scope，不提供旧静态资源执行入口；依赖旧API的外部代码明确unsupported。W09/P6必须用实际boot/路由/设置/评测/Skill trace验证“无旧生产路径”，未过则不能硬切交付，不要求在旧main上先测不存在的新主链。

R06技术基线冻结为现有ESM/DOM与单Draft reducer；手机List/Inspector覆盖完整编辑，桌面必须实现D8的可交互Graph。P5先验证原生SVG渲染/命中层+现有Pointer/Keyboard事件接线的局部实现，布局与绘制作为可替换**视图模块**；若目标规模实测不满足，再在同一Draft/View adapter后选择现有Cytoscape候选，不能引入第二Draft/SPA或用只读预览替代Graph编辑。哪个backend通过、具体节点规模/帧时延/内存阈值归P5实测后记录，不是待选产品方向，也不需要E0先完成PoC才能获准写PoC。

三端L3与四Engine最终适用能力仍属P7硬验收，不删除失败项或把模拟viewport当Termux。未测性能/浏览器安全/协议/硬件只声明真实保证级别；当前所有这些V3实证NOT_RUN/BLOCKED，设计闭合不把其改为PASS。

## 17. P1 authoring schema实施细化（2026-10-15）

实现`a4d7b42e1`新增纯共享`native-orchestration-contracts.js`及Host PlanRepository。Definition使用封闭nodes/typed ports/edges/entryNodeIds/capabilityCeiling/graphChangePolicy/limits/outputContract；每edge显式maxVisits，每node kind独立policy白名单，所有node须从入口可达且有唯一Output路径。精确dependency pin包含pinId/原Domain port/resourceRef/integrity；原Domain adapter必须验证resourceRef的领域union/权限/当前性，单凭pin schema不授予权限。几何viewState与语义hash分离；validationDigest不含checkedAt，以免纯重验时间变化造成假冲突，仍绑定draftVersion/definitionHash/dependencyDigest/issues。

Plan create/save/publish、PlanBinding和command outcome沿原Engine同事务CAS；发布重新取得当前原权威验证，unknown/变化拒绝。Repository构造强制要求authorize/validateDependencies/assertWriter，没有默认允许；本组测试显式fake原authority，仅证明仓库合同，未接生产HTTP或外部Effect。六个编排kinds与原HostFence/RPControl已自动进入四Engine通用Native handlers；SQL Owner、全站writer fencing和GC引用仍须后续P1接线。

### 17.1 Draft与RunLedger的P1工程约束

Draft持久保存允许结构完整但图语义尚未完成（如未连边、无Output owner）的作者草稿；Validate返回绑定版本的invalid issue，Publish始终重验完整Graph和依赖，不把save当Publish准入。未知schema字段/可执行policy仍拒绝。RunRoot补充显式`cancelRequested:boolean`（与Effect knowledge state分开）；事件从seq0的admitted开始，与Root和command outcome同事务。原Host启动先取得data-root guard再初始化用户存储/迁移，之后各handle在原Engine恢复前取得root Owner并发布fence。

P1 RunRepository start仅接受受信原authority admission回传SourceBinding和budgetAuthorityRef；V3只持引用，无余额/收费。beginAttempt写pending身份/输入digest/原grant与budget refs，不是dispatch。restart/recovery递增epoch并进入blocked/reconciling，保留原费用引用/progress/deadline，须P2/P3原source/receipt复核后才能执行。当前没有挂接runs/start的产品HTTP路径，不能把测试admission double当真实Domain Ports完成。

### 17.2 恢复generation与原批量事务

RunRoot新增`hostGeneration`，精确保存原Storage HostFence.generation，与单Run的epoch分开；同Host内恢复也必须使旧generation失效。原cross-mode restore完成后经原Storage lifecycle停止该handle准入/drain并退休cached fence；下一Native事务发布更高generation，旧Run只能经recover进入blocked/reconciling。原SQL delete/restore共享同一fence行锁；restore的清空+流式导入为一事务，采用`retryMode:never`，不重放已消费流。已ACK的rollback可保留当前Owner；COMMIT未知仍不可猜测。目标HostFence不删除、不从来源dump覆盖。

原Storage root adapter在Windows用DriveInfo拒绝UNC/映射网络盘，Linux/Android采用明确本地FS类型集合；未知/shared/网络或无法证明namespace独占的root不开放。当前真实OS证据只有Windows，Linux/Android filesystem分支未实测，仍须P7真实验证。枚举依据：[Microsoft DriveType](https://learn.microsoft.com/en-us/dotnet/api/system.io.drivetype)、[Linux原始magic.h](https://raw.githubusercontent.com/torvalds/linux/master/include/uapi/linux/magic.h)，不是设备通过证明。

### 17.3 G2控制事务与Patch实现细化

RunRoot.nodeControl保存每node的`disposition:eligible/blocked/cancelled,priority,reasonCode`，不复制NodeAttempt执行状态；progress新增edgeVisitCounts，每edge累计与总edgeVisits相等且不能恢复清零。内部RunRepository.control只给受信Host controller使用，禁止挂任意HTTP/SDK dispatcher；同事务CAS更新Root/typed record/event/command，身份、原authority、Plan capability/output/limits不可改。

内部稳定command identity由operation+原控制对象ID推导，逻辑payload去重不把临时CAS读取版本当新动作；返回replayed信息只作为本次事务是否新提交的回执，不能从旧command回执再次取得发送许可。GraphPatch整批校验、冻结已准备Attempt的输入、保护唯一Output路径/能力上限，保留cancelled Attempt。Rejected proposal也受原step/deadline限制；相同producer/input/evidence的无进展提案不能换PatchId重置工作。
