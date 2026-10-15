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
| `NodeAttempt` | `schemaVersion,runId,nodeId,attemptId,attemptNumber,epoch,graphRevision,inputState,reservationRef,inputRefs,inputDigest,sourceBindingDigest,effectiveGrantDigest,budgetRef,status,effectRefs,resultRefs,startedAt,endedAt,reasonCode`；prepared/reserved封闭union见§17.10；替换 attempt 不覆盖旧记录 |
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

E0审计时：`RunControl.charge/chargeCompute/settleCompute` 持原 Session bank；Project 由原 `ProjectAgentService` / ProjectTaskRepository 持有 compute；`native-compute-budget.js` 的 `reserve` 仅是mandatory allowance headroom。当前三个原bank已接BudgetPort；GenerationHost的可信`execute(...,{orchestrationSend:{bank}})`用Effect/ordinal稳定身份发送及结算，普通RP上下文来自原ChatRepo，公共input不能注入bank。现存Session generationBudget lane与此入口组合明确拒绝，不能绕过角色/后台限制。工程实证边界归§17.15及同一Record，V3不得再造另一套charge。

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

### 17.4 Effect/Approval核心的P2实现细化

EffectIntent补充hostBootId/hostGeneration、capability、requiresApproval、budgetEnvelopeDigest；它们来自必填原authority Port，模型proposal不能自报risk/grant/egress/approval。prepared先耐久，再由原bank在事务外准入，ready只验证原budgetAttemptRef。claim同Root CAS消费批准并写dispatching/token；仅新成功事务回执返回本次token，旧command重放的顶层及outcome token均置null，COMMIT未知不生成第二发送许可。

ApprovalRequest/Decision也钉住hostGeneration。nonce原值仅属于可信Review Port；kernel只持hash，决策必须原身份Port复核并保存最小principal/authenticationContext refs；主origin没有approve路由。取消/Host或restore恢复在同Root事务使未消费批准invalidated。真实Review Origin/再认证实现与隔离验收仍归P5，P2受控Port测试不等于其通过。

Receipt按稳定observationId追加，不覆盖unknown或矛盾历史。原Port验证真实原收据/状态/预算观察；模型或Browser成功Boolean不构成证明。矛盾已知观察进入unknown/reconciling；缺原budget观察保持待核对；取消后的真实迟到事实可关联追加，但不能改已发布Output/Result或生成退款。终态Run换Host只更新控制fence/审计，不重新启动。新Effect发送的实际前置复核及原预算/收费接线仍须P3完成。

### 17.5 Attempt结算与确定性Join的P2实现细化

`NodeAttemptReceipt`沿原`atri_orchestration_record/receipt`保存，封闭字段为`schemaVersion,receiptKind:'node_attempt',receiptId,runId,nodeAttemptId,epoch,graphRevision,sourceBindingDigest,inputState,inputDigest,outcome,resultRefs,effectReceiptRefs,decisionSeq,reasonCode,createdAt`。receiptId由Run+Attempt稳定推导；Attempt终态、不可变收据、Root/event/command同事务，不能靠可变status伪造分支成功。普通settle拒绝Join/Output节点；已准备或未知Effect未结清时不能终结Attempt。原Source/Result/费用收据验证Port为必填，不在V3影子实现。

新增`ojoin_*`身份，沿原`record/join`分别保存`barrier:<joinId>`和`joinId`：前者是不可变`JoinBarrier`，后者是不可变`JoinReceipt`，不是新metadata kind或独立存储。Barrier字段为`schemaVersion,joinId,runId,fanoutAttemptId,nodeAttemptId,epoch,graphRevision,memberAttemptIds,memberEdges,fanoutFrameRef,sourceBindingDigest,parentBudgetRef,policy,quorum,deadlineAt,frozenSeq,createdAt`；稳定joinId绑定Join Attempt。`memberEdges:[{nodeAttemptId,edgeIds}]`冻结每个最终成员到Join的直接输入边；多步分支冻结最终成员的reserved身份，不跳过中间任务。`fanoutFrameRef:null|{receiptId,integrity}`绑定§17.12真实分组；有Frame时成员须精确覆盖该Frame中直接输入此Join的最终成员，不能用宽松Port截断屏障，settle重验Frame引用。独立核心测试尚可由必填原membership Port提供分组证据，生产原Scheduler仍须实际Frame/完整scope准入，不得借null免检。原Fanout分组/parent reservation Port验证完整成员；冻结事务只接受同epoch/source的pending或reserved分支，已启动成员与冻结竞态必有一方拒绝，不能补录进旧屏障。原Scheduler permits/真实父子预算仍归P3。

JoinReceipt在§7字段上增加`epoch,barrierDigest,memberReceiptRefs,edgeAdmissionRefs,decisionSeq`；cutoffSeq是本次决策前已持久Root.eventSeq，decisionSeq=cutoffSeq+1。有效成功按成员不可变收据的decisionSeq/AttemptId稳定排序；any-success取首个，count-quorum取前quorum个。partial不计成功配额；all-success有失败不能complete，all-settled等待全部或显式deadline；不满足部分输出合同则failed。deadline只采纳不晚于冻结deadlineAt持久化的合法Result，截止后但结算前入库也排除。结果需原audience/source Port重新验证，缺证据拒绝/排除；收据列明未结算、失败、未采纳与迟到成员。

重放、并发settle和已提交回执丢失只返回同一结算，晚到分支不能重开旧Join；取消/恢复epoch也不能消费旧屏障。未完成分支仍保留实际身份/收据，不借Join失败声称远端取消或退款。P2当前使用受控原Port证据，不代表ResultEnvelope/Context/Scheduler或Domain Consumer已完成。

### 17.6 原Storage维护入口与Engine交接

`NativeHostOwner`按参与的原Engine保留生命周期；每个Engine先停止准入/drain/关闭，再释放自己的参与引用。每个local root guard在最后一个使用它的Engine关闭后释放，启动显式持有的dataRoot guard与专用SQL Owner sessions保留到最后参与Engine关闭；预期退休临时root不会误判为Owner丢失。原`nativeHostLifecycle.attachStorageEngine`在同一Host内附接迁移destination/replacement，不创建第二Host。相同SQL连接配置的专用Owner session按不含明文配置的hash key合并；该缓存只避免同Host重入，并不证明未知proxy/multi-primary拓扑安全，也不把不同配置别名自动合并。

原HTTP存储迁移以`withMaintenance`暂停source外部准入，排空已有事务后才copy；维护许可限本次async scope，不传播成后续通用权限。失败恢复source准入；全员copy成功先退休source，再附接新live Engine并关闭old/destination，read-only覆盖整个copy/swap。更高原Storage generation使旧fence失效；已有Run恢复仍需明确epoch/source/receipt复核，不因存储切换自动执行。

原`storage-migrate`、`audit-storage-names`和密码恢复CLI在`initUserStorage`前取得同一dataRoot Owner；前两者原Engine也接生命周期。名称审计不重写业务资源名，但原Engine bootstrap/recovery可能写控制元数据，故要求离线互斥。内部Evaluation/Studio scenario/transient-source的独占临时根仍是原Host受控scratch，不把这些raw Engine扩展成外部Run/发送权威。其P4消费者适配和完整raw调用闭包仍需按阶段复核。

### 17.7 本地卷探测的相邻平台边界

Darwin分支使用内置`osascript`执行固定Foundation代码，canonical path只作为argv，不拼入脚本或shell；读取`NSURLVolumeIsLocalKey`，未知/远程/失败都writer-unavailable。依据[Apple本地卷属性](https://developer.apple.com/documentation/foundation/urlresourcekey/volumeislocalkey)与[原NSURL resourceValuesForKeys:error:](https://developer.apple.com/documentation/foundation/nsurl/resourcevalues%28forkeys%3A%29?language=objc)，不是实机通过证据。目录创建/realpath/OS探测错误统一同一unavailable出口；已持root继续核对固定identity，Windows卷类型缓存只属于本Owner，不能跨Host重开沿用旧探测。

所有适配都要求运行期间挂载/文件系统与OS network namespace保持受支持的本地独占条件；只查本地FS类型或volume属性无法证明任意共享块设备/跨namespace安全。当前真实测试环境为Windows 11 Pro `10.0.26200`、Node `v24.18.0`；Darwin探测代码、CachyOS与Android/Termux均尚无真实客户端/本地卷实测，保持NOT_RUN/BLOCKED，不以Foundation规范或Windows测试替代。

### 17.8 同步Storage Center后的原权威组合

`main@73557f809`已有原Storage Center：`account-quota`、recovery roots/lifecycle、account file writer、SQL account locks与TransactionScope。V3复用这些实现，不建立第二份quota/回收站/事务组合服务；Model/Prompt原可重入write authority仍只在提取的runtime-write模块一份定义。原account bytes quota与D5 Compute费用银行职责不同。

调用顺序为Host Owner/StorageFence→原quota/recovery business transaction→原Engine commit；有界基础fence在业务quota之外初始化，使零quota仍可观察/回收，业务Plan/Run/command增长照常服从原quota，同事务拒绝不留碎片。原quota的SQL account lock和FS/SQLite account file publication也纳入同一Host admission/drain；不能在Owner之前建SQL schema或发布文件。quota wrapper传递原retryMode，COMMIT未知不因account unlock失败变成可重试网络错误；损坏连接不归还pool。原account lease有open范围，脱离旧async scope的任务重新取得准入。

同类SQL备份复用数据库Owner，但私有scratch handle不是原用户账户：converter用同Host附接的原Engine实现和严格scratch目录，不扩大getUserDirectories/原账户quota语义。结束后清自身scratch rows/fence、关闭私有Engine并释放临时root，live Owner继续持有；SQL dump不输出HostFence，restore不覆盖目标fence。真实用户原领域收据/数据仍沿原备份恢复协议，不能借此恢复旧Orchestrator执行权。

同步后的局部实证归同一Record；新增原服务不使未知SQL topology/跨namespace或P3–P8自动通过，也不以现有Storage回收闭包替代V3原Source/Result/unknown引用根的后续审计。

当前SQL未知拓扑拒绝实现见§17.13；该适配器证据不代替标准直连SQL的真实正向验收。

### 17.9 有界依赖转移与显式回边

未发布v1工程schema的每条edge补充required `loopBack:boolean`；删除所有显式回边后必须为DAG，且每个回边须闭合一条正向路径并有非零maxLoopIterations。不能仅填上限就隐式允许未标记环；Definition hash包含此语义字段，不为旧编排或中间实验数据提供转换/默认兼容。deadline Join若Plan不允许partial则在完整Validate/Publish阶段拒绝。

内部`TransitionController.advance`输入为Run CAS guards、`bindings:[{edgeId,producerAttemptId}]`与显式`reservedAttemptId:null|AttemptId`（§17.10），不接受调用方自造transitionId。成员排序后的Run+bindings+reservedAttemptId稳定推导command/新Attempt/receipt身份。每个producer必须有同epoch/source的不可变NodeAttemptReceipt，edge须指向同一合法target，required input connections齐备且success/failure条件匹配；partial不当success。Join由自身屏障控制器结算，已发布Output不成为普通转移producer。

必填原Port以`{handle,tx,root,target,attemptId,producers}`只读复核typed Result/Source/currentness/grant及原reservation，返回`{inputRefs,inputDigest,effectiveGrantDigest,budgetRef}`；inputDigest绑定实际引用。新pending Attempt、`receiptKind:'graph_transition'`不可变收据、Root/event/command同CAS；收据钉producer receipt refs、各edge累计、loopIterations及decisionSeq。step/attempt/edge/deadline与显式回边计数先限额再准入。maxLoopIterations的物理累计含每次marked back-edge crossing，从环中间入口开始也计数；恢复不清零。

generic beginAttempt仅创建该node第一次准备身份；已有历史必须走受控transition/后续Review或recovery controller，不能换commandId绕开重做/循环计数。普通prepare不等于合法activation；Fanout/Join统一边计数、父子Run/预算和原Scheduler准入仍须对应P2/P3子工作，不以本控制器替代。没有生产HTTP dispatcher或真实发送。

### 17.10 多步分支的身份预留不等于输入准入

Fanout冻结多步分支时，最终成员的实际上游Result可能尚不存在。为避免伪造input/grant/budget，NodeAttempt增加封闭`inputState:'reserved'|'prepared'`与`reservationRef:null|{producerAttemptId}`。reserved必须绑定当前原Fanout/scope许可，inputRefs/inputDigest/effectiveGrantDigest/budgetRef均显式null，effects/results空、未started；仅允许reserved/blocked/cancelled/stale，不能activate、claim或产出成功Result。prepared必须是真实引用数组及其canonical hash、有效grant digest和原budget reference；不是默认允许的占位输入。

内部`AttemptController.reserve`以Run+producer Attempt+node稳定身份，在Root/record/command同CAS预留一槽，计入attempt/step高水位；原fanout scope Port必填，只校验许可，不代表原资金reservation。Join Barrier可冻结这些身份；后续prepare不能换成员ID。真实依赖receipt已存在后，Transition带reservedAttemptId、复核原Source/Result/Grant/预算和creator epoch，原子填入准备快照并计edge/loop/step；槽位已计不再重复加attempts。相同请求重放不能擦除已准备输入，改变绑定也不能覆盖prepared成员。

只有尚未prepared的reserved输入可按合法GraphPatch补依赖，prepared/终结快照保持冻结。取消未准备成员追加inputState=reserved、inputDigest=null的取消收据，禁止伪造结果、费用或退款；Join按未完成/取消事实结算。NodeAttemptReceipt保留inputState；source/epoch不匹配拒绝准备。完整Host调度、隐式入口组及原scheduler/budget tree仍在P2/P3继续，不以预留身份冒充这些能力完成。Transition/Join共享边计数见§17.11，显式Fanout及嵌套控制见§17.12。

### 17.11 共享边准入与可复核的GraphPatch历史

内部`admitGraphEdges`在Run同CAS接收`transfers:[{edgeId,producerAttemptId,nodeAttemptId}]`；核对同Run/epoch/source的实际Attempt及edge端点，不准调用方伪造新的计费身份。`receiptKind:'edge_admission'`沿原record/receipt不可变保存，字段为`schemaVersion,receiptKind,receiptId,runId,epoch,graphRevision,edgeId,producerAttemptId,nodeAttemptId,sourceBindingDigest,edgeVisit,loopIteration,decisionSeq,createdAt`。身份由Run+transfer稳定推导，已存在时校验完整性/累计高水位并复用，不重复计数；全部新边先检查单边/全局edge/显式回边上限，后与Root/command/决策原子写入。不是Compute银行或发送许可。

Transition收据增加`edgeAdmissionRefs`。Join关闭屏障时统一准入所有冻结memberEdges，包含截止时未完成/取消的显式缺席；这是屏障依赖的控制成本，不声称实际调用已经发出，不把缺席结果当success。已有对应准入可复用；余额不足不落半份Join收据/Attempt终态/edge tickets。显式Fanout出边也沿§17.12接此入口；完整Host/原Scheduler调度仍须后续完成，不据此宣布整个G2完成。

GraphPatchReceipt增加`previousGraphRevision,producerInputDigest,sourceBindingDigest,reasonRefs,appliedOperations`。接受时保存经过完整校验的操作，供后续图修订复核；拒绝时appliedOperations显式空数组，只保留安全摘要，不存未知payload。读取既有patch历史先核对原record integrity、schema/Run/accepted/操作数组；损坏即`native_orchestration_graph_history_unavailable`，不能猜测no-progress或静默继续。单batch对同pending Attempt的状态操作合并为最终一次写入，不产生内部CAS自冲突。

### 17.12 显式Fanout Frame、成员继承与逻辑并发

Fanout Node policy封闭为`{maxConcurrency,failurePolicy:'continue'|'fail_fast'}`，随不可变Plan hash冻结，不为旧配置补默认值。Fanout/Join是确定性控制节点，capabilities必须空；它们的被动running不占执行资源并发槽，step/deadline/edge计数仍照常累计。因此单槽父Run与嵌套分组不会被等待中的Fanout自身堵死；实际执行许可仍需原NativeTaskScheduler，不在V3另造队列。

`FanoutController.freeze`在Run同CAS接收`fanoutAttemptId,branches:[{entryAttemptId,memberAttemptIds,scopeNodeIds}]`，排序后的内容绑定稳定command；所有即时出边须由实际entry覆盖。Entry为真实prepared且未启动的Attempt，最终成员可prepared或reserved；scope必须为已存在非Output节点，member在同scope内从entry可达。原Group Port必填，只读复核Source/Audience/输入授权、完整分组和原parent reservation，不得在CAS回调预留费用或发调用。范围未知、已启动成员、截断即时分支、过期source/epoch或超限均拒绝整组。原始入口输入编译、隐式根分组、动态scope准入与真实Host scheduler仍需P2/P3接线，不把generic beginAttempt当生产依赖准入。

`FanoutFrame`沿原record/receipt不可变保存，封闭字段为`schemaVersion,receiptKind:'fanout_frame',receiptId,runId,fanoutAttemptId,epoch,graphRevision,sourceBindingDigest,parentBudgetRef,branches,maxConcurrency,failurePolicy,edgeAdmissionRefs,decisionSeq,createdAt`；ID由Run+Fanout Attempt稳定推导。出边准入、Frame/成员关系、Root/event/command同事务，edge tickets沿§17.11复用，ACK丢失/重放不双计。并发为min(Node policy,Run ceiling)。

成员关系也是原record/receipt中的不可变`fanout_membership`，字段为`schemaVersion,receiptKind,receiptId,runId,frameId,nodeAttemptId,epoch,sourceBindingDigest,decisionSeq,createdAt`；ID由Run+Frame+具体Attempt推导。初始entry/最终成员在freeze绑定，后续Transition从producer继承仍包含target的冻结scope，嵌套freeze也继承外层组；按真实Attempt票据计数，避免同名节点的后续尝试误占旧组。成员关系不含货币余额、Scheduler lease或Context正文。

activate在同Run CAS核对所属组的执行中成员数；effect prepare/claim重查fail_fast，已ready兄弟Effect也不能在失败后领取发送claim。fail_fast以持久且完整性有效的非completed成员结算收据为证据，阻止后续准入；不声称远端已取消/费用已退。已发Effect的迟到真实收据继续append，unknown仍需原Port reconcile。continue保留失败但不阻断其它分支。原资源许可/收费/实际pre-send校验和停止派发、取消请求的Host调度器接线归P3，当前受控Port测试不等于这些实证。

### 17.13 SQL部署边界的明确拒绝与会话核对

原SQL Engine增加不可变构造配置`nativeHostTopology`，默认`unknown`。原config路径为`storage.mysql.nativeHostTopology` / `storage.postgres.nativeHostTopology`；只有运营者核实的`direct_single_primary`可进入Owner适配器：直连同一个可写primary、固定session、Host存活期间不经路由/自动failover，不含transaction/session pooling代理、多primary/NDB或未验证HA集群。声明是部署前提，不是程序发现拓扑的证明；不能因为URL是localhost、ping或advisory lock成功而自动填写。当前原适配器保守拒绝已配置Group Replication的部署，不能把未验集群声称为标准直连通过。

原Engine在打开专用Owner连接前验证声明；同Host按URL hash复用数据库Owner时也必须先检查每个参与Engine的声明，缓存不能给未知配置放行。MySQL在取锁前检查原server只读/NDB/Group Replication变量，使用实际database/server UUID/connection id，取锁后重查session；Pg检查实际database/backend pid、`pg_is_in_recovery()`和`transaction_read_only`，取锁后重查。未知字段、备库/只读、unsupported部署或会话漂移全部拒绝；既有专用session存活期锁、业务fence、COMMIT unknown仍按§12，未创建第二DB服务。

技术依据：[MySQL 8.4 Group Replication变量](https://dev.mysql.com/doc/refman/8.4/en/group-replication-system-variables.html)说明single-primary/multi-primary开关；[PostgreSQL 17管理函数](https://www.postgresql.org/docs/17/functions-admin.html)及[session advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)支持角色/会话检查。查询及声明仅能拒绝已知不支持情况，无法证明任意隐藏代理或错误运营声明安全，不能冒充真实部署审计。

原Storage初始化、迁移配置解析/保存、名称审计和CLI沿同一字段传递；更换URL不继承旧声明，配置持久化也将其退回unknown，必须对新endpoint重新核实。原同数据库scratch Engine仅复制live Engine的已知声明；不从备份数据导入声明。独立SQL scratch/跨Engine导入接线与私有清理细化见§17.14，未因此宣布P1完成。标准MySQL/Pg真实启动/Owner loss/并发/备份及全部新版控制器必须在服务恢复后复测；目前新增真实SQL证据BLOCKED/NOT_RUN。

### 17.14 SQL导入的原Host与私有命名空间退休

原`materializeTransientSource`的SQL路径必须得到原`hostLifecycle`；缺失时在ZIP解包/schema访问前拒绝，不能退回raw Engine。原CrossModeRestore和Persona backup preview传递当前Engine的生命周期；相同SQL类型和独立scratch DB都创建原Engine实现的私有converter，附接同一Host Owner之后才ping/schema/restore。只允许本次随机`_xrestore_<hex>`handle，dirs严格指向其私有root，不调用真实账户目录fallback或quota。原URL声明按§17.13传递，不从导入内容授权。

独立scratch配置补充`mysqlNativeHostTopology`/`postgresNativeHostTopology`；原HTTP parser接`scratchMysqlNativeHostTopology`/`scratchPostgresNativeHostTopology`，或只对完全相同的原config URL复用已核实声明；CLI同规则。不同endpoint未重新核实则unknown。原认证/CSRF/账户/restore权限继续生效，部署声明不替代这些权限或可信Effect批准。

原生命周期附接选项增加`privateHandle`，仅接受隔离restore身份，所有准入handle须精确匹配；普通账户Engine无权退休HostFence。私有converter清理先沿原Engine.deleteUser，再调用`retirePrivateHandle()`：暂停外部准入/drain，重验未被后续事务作废的删除证据，确认Native metadata除自身fence外为空，在原基础事务内检查/锁定当前fence并删除，Owner检查后提交，立即永久退休该Engine准入；最后原Engine close才释放root参与引用。删除fence的事务采用never-retry，结果未知保守失效Owner，不能释放guard后继续写。

FS.deleteUser保留文件树，SQLite.deleteUser关闭DB，均不是对象已删除的证据；残留Native资源必须阻止上述退休。该内部退休只服务已声明私有namespace，不改变真实账户fence永久保留规则。SQL cleanup确认成功并close后才删本次私有root；Owner/提交/close未知保留本地现场，不把失败cleanup当业务退款或远端撤销。原scratch GC仍有自己的既有文件保留窗口，SQL orphan不会在启动时被擅自全库清除，需原诊断/运营处理；不另建回收站或清理服务。

本节现有证据为Windows FS/SQLite原生命周期/备份/恢复与无DB的SQL拒绝反例；实际SQL导入/正常清理/故障窗口仍BLOCKED/NOT_RUN。不能以本接线宣称全部raw Engine消费者、V3未知Effect保留根或P1/P7已通过。

### 17.15 原Native Compute子额度树与Session持久接口

全部实现放在原`native-compute-budget.js` / `run-control.js`，不在Orchestration复制银行、价格或存储服务。原compute ledger增加可选`reservations:[{reservationId,parentReservationId,consumerId,limits,status:'held'|'released'}]`；现有其它Native业务不需迁移，旧Orchestrator数据不进入该合同。v1结构上限为32个reservation，沿现有compute记录的有界存储尺度；不得把它说成Provider价费或用户设备能力硬上限。父引用必须指向本记录先前reservation，无环/无孤儿；身份与consumer/limits绑定，重放不重新持有已released额度。

`reserveComputeChild`在原bank CAS里转拨剩余容量；`releaseComputeChild`只在直接子额度均released、子树全部model/local实际attempt已settled时释放未用容量。charged/unknown均拒绝释放，费用行和实际用量不删除。limits包含requests/tokens及可选local jobs/items/inputBytes；纯local子额度可为0 model requests/0 tokens，不伪造模型调用。每个真实attempt只在原attempts/localWork数组一行，以可选reservationId归属叶或父自身；祖先按子树聚合核对，不再追加charge。

任一scope满足`已用/未知上界 + 尚未花费子额度 + 自身可用 = ceiling`（发生overrun时明确超出并阻止新准入）；未知tokens沿原estimated上界占用，可信total实际低于上界才释放差额，实际高于上界完整保存/传播overrun，不截断观测。Root与所有祖先都核对收紧后的原ceiling；自己的工作不能抢已held的子额度。原required narration reserve仍在同一可用量内核对。拒绝操作使用候选副本，不向持久holder留下半个reservation/attempt；这只是原bank事务的纯reducer，不是另一个真相副本。

Model attempt增加可选`inputFingerprint`；新`admitComputeAttempt`要求该hash，并钉attemptId/requestId/targetFingerprint/estimatedTokens/reservationId。同身份同输入返回`replayed:true`和原charged/unknown/settled事实，不再收费；不同输入冲突。此回执不是发送permit，不证明Host已按§13.2从EffectId/ordinal派生ID；后者仍须真实GenerationHost接线。既有strict charge保留冲突语义，所有新旧原bank charge都保护已held子额度；有reservationId而缺local budget明确unavailable，不能借原其它Native无预算路径变成V3免计工作。

原Session RunControl增加内部`reserveComputeChild/admitCompute/releaseComputeChild/observeCompute`，沿原Session锁、Engine/Owner/fence、RunControl record和validator；原chargeLocalWork转交reservationId。新准入严格绑定当前branch/revision，换Source不能以重放名义再准入；审计observe与迟到settle仍可按原operation身份保留费用真相。未关闭reservation使原operation留存，不能被换HEAD的压缩抹去；关闭后原retiredCompute只累计一次实际费用/本地工作，未复制银行或费率。

当前三个原bank、BudgetPort与GenerationHost稳定send已有FS/SQLite隔离实证，详见同一Record W04/P3第二至第五组。原Session角色/后台配额组合、V3父子Run/Source/Audience授权、Effect生产saga、原save/导入的活动额度失效与关联保留根仍须后续验证。没有新增Browser/插件预算dispatcher，也未向真实Provider收费。§13的权限/恢复/三域验收要求继续生效；合成HTTP/隔离存储不能替代实际账单或完整P3 Gate。

### 17.16 P3原Source、Effect与Audience的接线边界

`SourcePort.capture/revalidate`只观察原Session/Project/RP。SourceBinding冻结`sourceAuthority/sourceRef/sourceRequest/budgetAuthorityRef/bindingDigest`，RP额外绑定实际发送的完整聊天prefix digest。`createOrchestrationExecutionService`把原authorityFor接Run admission，Effect的budget verifier固定读原bank；领域authorize/verifySend/verifyObservation/verifyApproval均为mandatory可信adapter，不能提供默认批准。它是内部Host组合，尚未开放HTTP万能dispatcher。

GenerationHost在真实sub-send前完成原budget admission，再通过可信`beforeSend`提交同Effect的ready/claim，只有fresh claim持token；每次retry/fallback重验来源、Host/epoch、当前grant、实际send binding和新的原attempt。预算ACK未知时只`observeAttempt`同identity并抛reconcile_required，查到charged也不返回第二份发送permit。模型与local work分别使用providerSendOrdinal/localWorkOrdinal typed ref，在同原bank结算；子Run不能使用null或兄弟reservation。

`ContextPort.compile(handle,{ownerRef,sourceBinding,audience,taskPurpose,grantDigest,inputRefs,tokenBudget})`复用原Session Context/Information/Actor编译，`provider(handle,{context,source})`直接提供实际RequestContextPlan；`revalidate(...,{phase:'send'|'consume'})`核对原scope回执、精确source及projection。GenerationHost可信`orchestrationSend.context={port,compiled}`使用该plan作为真正输入并在发送/消费前复核。当前仅Session有原受控Audience compiler；Project/RP不可借默认宽上下文替代，缺原adapter明确拒绝。受控grant callback测试不证明Plan/父子Run领域授权已完成；Hybrid实际检索、跨Agent Result及语义泄漏质量仍需各原authority实证。

### 17.17 P3原Tool协议与恢复授权

`ToolPort.execute(handle,{runId,effectId,dispatchToken})`由Host读取持久action/target/input，不能接受Browser提供的新动作或批准。原Skill/McpService/A2aService/SessionPublicWork接内部可信work adapter，逐真实请求重验dispatch、原scope/grant、egress、CredentialTarget并在原子额度内记localWork。权限/原route预算只能取交集。`observe`只查原operation；`requestCancel`仅原本地scheduler，远端取消是另一Effect。

原`RunControl.externalTask`的可选typed `orchestrationBinding={schemaVersion,runId,effectId,sourceBindingDigest,grantDigest}`不可移除或换绑。重启后原A2A独立reconnect/cancel不得靠旧Session policy续用此授权，当前明确拒绝并要求新Effect。它不是新的task registry或预算kind。原MCP/Skill现有完成证明与持久Effect观察闭包见§17.24，缺原proof/receipt仍unknown；A2A受理事实的精确持久闭包见§17.21，不能把受理升格成远端任务完成，任何未知都不能自动重发。R3/需要批准的动作在可信Review与原动作authority接通前保持unavailable；Project/RP没有原消费者时保持拒绝。

### 17.18 P3原恢复/GC对费用与来源的保护

原Session删除与maintenance GC读取同Host的Run/Record保留引用，纳入generation/quarantine proof；没有正式释放authority时终态与历史unknown也保留。不以保留根提升孤立revision的读取权限。SQL fallback现按稳定key cursor遍历余页；这不构成大数据集IO/性能实证。

原Session/RP账户恢复先保留本地原bank，再暂停为review_required；旧备份不退回当前实际/unknown成本和held allocation，新generate/write等待原可信review，status/真实迟到settle仍可用。原Native merge与replace一样可能覆盖同key：存在V3 Run/Record保留历史时三种mode全部在破坏目标数据前返回`native_orchestration_retention_review_required`（HTTP409）。该拒绝不是自动合并闭包、批准恢复或review解除实现；恢复/保留释放的完整产品支持仍需后续原authority工作，不能把安全拒绝记作完整V09通过。
### 17.19 P3子Run、原银行确认与整树逻辑界限

内部`DelegateController.delegate`只接受已运行且有agent.delegate能力的父Attempt、精确已发布childPlanRef、冻结inputs/grant/returnContract/budgetCeiling。子Plan能力不得超过父Plan及具体父节点，冻结limits不提高父限制；原authorizeDelegation须同时返回allowed、父/子有效grant、sourceBinding及budgetCeiling的精确digest，且实际adapter还必须证明父Plan允许该childPlanRef。没有原authority adapter不准入；测试受控callback不是产品授权实证。

childRunId稳定派生parentRunId+parentAttemptId+delegationId；父委派收据、不可变parentRef和未funded子Root在同Host事务落盘。parentRef冻结父epoch、绝对depth、inputRefs/inputDigest、grant、returnContract、原bank分配上限budgetCeiling及logicalCeiling。随后在Host事务外调用原BudgetPort.reserveChild，reservationId=childRunId、父reservationId=父Run本身或root null；再次在Host事务内只读原bank的verifyReservation确认精确owner/authority/parent/limits，写child_budget_ready收据。预算ACK未知只观察同identity，不能重分配、生成第二子身份或重发。

未确认预算不得begin/activate/dispatch；子模型发送不得使用null/兄弟reservation。发送前检查整条祖先链的epoch、Host、取消、父Attempt状态、source及原授权；父任务在Effect fresh claim之后取消也必须阻止真实HTTP。活动Attempt容量读取原持久Attempt并核对各祖先整棵子树，不新增第二Scheduler。当前委派身份准入还包含保守活child容量检查，不能将其等同完整原Scheduler lease/permits已验收。

RunRoot新增required `treeProgress`，保存本Run及后代累计steps/attempts/patches/replans/reviews/delegates/handoffs/edgeVisits/loopIterations及绝对depth/deadline高水位；`progress`仍为本Run本地图计数，尤其edgeVisitCounts只属于本图。child parentRef.logicalCeiling冻结创建时的祖先剩余上限并不超过child Plan；兄弟仍共享祖先总量，不因各自拥有相同快照而多出容量。这些是D3有界控制流的逻辑成本，没有货币余额、价格或Secret/Memory内容，不是第二compute bank。

唯一累加入口为RunRepository.#commit：各控制器只增加本地progress，中心计算非负delta，在同一Engine事务内更新本Run和所有祖先treeProgress，逐层检查frozen Plan/child logicalCeiling/deadline。所有命令先取不可变祖先链，再沿原withNativeResourceWrites统一排序锁定全部祖先；child/ancestor/command/event的成功或回滚是同一事务。重试/重放不重复增加，GraphPatch、edge admission等原控制路径也通过该入口，不为委派另写一套相同计数器。

SourcePort在Host事务内不得等待原Session RunLock或Project/Studio writer queue，以免领域writer等待Engine而死锁。Session用原assertRunAccess(tx)纯读；Project用原ProjectAgent.observeComputeSource和Studio.observeRevision读取既有Git HEAD，不repair/init/history写入。实际发送在事务外仍通过原排队source authority完整复核，并比较真实Studio revision与Task base，不能只相信未变的Task fingerprint。Host事务内纯读不是绕过最终原来源检查的缓存。

这些内部接口尚未对应Run/Binding/Projection产品HTTP；批准通道、正式领域grant与P4 consumer仍按原阶段继续。当前精确证据和未完成项分别见同一Record第十组与[验收§9.1](acceptance-matrix.md#91-p3后端子工作后的gate复核)，前端只按[backend-integration](backend-integration.md)列明的实际API接入。
### 17.20 D3委派允许集合的精确Plan pin

依赖pin新增`port:'plan'`，`resourceRef`只接受原`{planId,planRevisionId,definitionHash}`；integrity为完整原immutable PlanRevision文档hash，不是只有definitionHash。原PlanRepository导出唯一严格reader `readPlanRevision(tx,handle,planRef)`，原publication/Delegate共同复用，核对资源integrity、owner author、revision身份、definition+pins hash及原schema；没有新Plan存储或授权服务。

携带`agent.delegate` capability的可执行node，其policy必须显式含`allowedPlanPinIds:[]`；每项须是该node.dependencyPinIds中port=plan的精确pin，无重复。空集合禁止委派，缺字段的旧形态直接invalid，不以缺省allow-any兼容。Delegate在原scope callback之前精确命中冻结父Plan允许集合、重新读取同owner的原revision并核对完整pin integrity；confirmBudget同样复核。Planner不能凭请求childPlanRef或callback allowed扩大该集合，原scope/能力交集继续必需。

原authoring dependency validation能够纯读上述Plan pin；这不使capability ceiling变成grant，尚未接原authority的capability继续unknown。exact pin的发布依赖是已存在的不可变revision；测试按leaf→grandchild→child→parent发布有限链，不制造definitionHash自指环或空集合通配。字段属于D3既有委派边界的物理收口，Context/audience等独立缺口没有借此假称完成。
### 17.21 A2A原持久受理事实与Effect观察

原RunControl.externalTasks的可选acceptedReceipt由原A2aService.finalize在真实SendMessage响应通过原协议validator、原source/fresh及实际local work完成后，与原externalTask记录同一次CAS保存；类型为a2a_send_accepted。binding精确关联run/effect/epoch/source/grant/input/endpoint/budgetEnvelope/typed budgetAttemptRef，并保存原request/response fingerprints、task或message响应种类及实际local attempt IDs。只有hash与原refs，不把第三方正文或Secret复制进账本；acceptedReceipt写入后不可移除/换绑。它仍是原服务的记录，没有新metadata kind或第二writer。

`A2aService.acceptedObservation(handle,{operationId,sessionId,anchor},{tx})`是历史事实纯读，不发网络、不要求fresh send claim。`ToolPort`以原runs实例构造后，`observe(handle,operationRef,{runId,effectId})`从真实持久Run/Effect核对上述binding、source/authority、每条原local row的稳定provenance、settled/completed与reservation，再返回可交原EffectController.observe的DTO。`verifyObservation(args)`在同一原Host事务重读原receipt/Effect并精确比较DTO；没有runs/effect/proof则unknown，不相信caller提供的accepted布尔值。

confirmation仅意味着精确a2a.send已得到并验证原SendMessage回执；reasonCode=a2a_send_accepted，resultRefs=[]、domainReceiptRef=null。task响应为WORKING也可证明已受理，绝不表示远端Task完成、正文可消费、World/Memory写入、再次发送或远端取消/回滚获准。source移走/权限过期后可以保留历史事实，旧独立reconnect/cancel继续拒绝。invalid/lost/cancel或未持久receipt仍unknown；本地ACK丢失仅经原持久查询有证据后解除。MCP/Skill现有完成证明范围见§17.24，不能据此授权消费正文或确认正式业务提交。

带V3 ownership的原externalTask不再按TTL删除，所属原operation不因Source推进而被压缩；原非V3 TTL继续。正式释放authority尚未实现，原32 row/128 operation容量照旧fail-closed，不以过期产生新的发送许可。产品HTTP和完整领域grant装配仍未由此开放。

### 17.22 原预算的精确来源明细保留与稳定local work

原model/local费用行增加可选`orchestration:{kind:'provider_send'|'local_work',effectId,ordinal}`；唯一原shared helper由该元组生成既有稳定attemptId，不更改冻结ID命名空间。BudgetPort内部生成标记，不接受caller在attempt上填写自报来源；原validator将标记、行类型和ID绑定，admit重放不能移除/换绑标记。typed observe/verify要求原行精确匹配，普通行即便碰巧同stable ID也不能充当V3证明。

GenerationHost的真实local work由原sendBank.nextLocalWorkAttemptId生成Effect+local ordinal，原charge与settle使用同一个ID；provider send保持独立ordinal。local准入COMMIT ACK未知与模型一样只observe同identity再报reconcile_required，不能重复执行local operation或派发Provider；重启bank从ordinal0重放明确拒绝。

Session/RP原operation在存在这些来源明细时保留，原retireComputeLedger拒绝提前聚合它们；即使root没有child reservation、费用状态已unknown或settled，Source前进后也不丢attemptId，允许迟到实际结算。没有新账本/价格表。原非V3 unknown汇总规则不变；RP达到128 operation时跳过这些保留项并只退休其他原closed work，仍无可回收项则原容量门槛拒绝。正式释放明细的authority尚未交付，不自动清历史或退款。

### 17.23 原三域Plan Binding产品接口

实际POST路由为 /api/native/orchestration/bindings/get 与 /bindings/save；read/mutation envelope及HostBoot沿用原Plan authoring，精确字段见[后端整合入口](backend-integration.md#2-实际已挂载的-http)。原PlanRepository保持command幂等、Binding version CAS、owner/Host writer、只读模式与精确已发布PlanRevision验证；不保存Draft引用。Source检查先于历史command重放，撤销来源不能借旧命令恢复选择。

生产authoring factory复用原SessionCore.observe、Studio.observeRevision、ProjectAgent.observeComputeSource、RpRunControl.status及同tx的原Chat header读。Session精确sessionId和非null entryPointId；Project按nullable taskId区分Project/Task选择，核对真实原project/task关联；RP必须是注册controlId且实际locator header仍声明同ID。原get服务按认证handle读取，不相信Browser owner；缺原服务fail-closed，不自动创建/绑定/repair来源。

Binding仅是用户的Plan选择metadata，不授予Actor/Model/Tool/Delegate运行能力，也不自动启动Run。nullable entryPointId/taskId沿原selector合同，不成为通配执行许可。原Source/currentness、Audience、grant、预算和Effect最后发送复核仍独立必需；Run/Projection/Approval产品路由尚未开放。本组FS/SQLite真实原服务/CSRF/CAS/读写fence测试与三项守卫变异见同一Record第十三组；该当组新矩阵SQL未运行，后续实际四Engine证据见§17.28。

### 17.24 原MCP/Skill完成证明与唯一EffectReceipt

原McpService及executeProjectSkillWork在真实validated response或Skill read/files、原local工作结算与freshness完成后，生成只在await completion callback生命周期有效的私有WeakMap对象proof；JSON副本、普通对象、过期proof或历史receipt不能验证。ToolPort的内部effects必须指向同一ExecutionService.effects；64槽短命private Map只关联本次proof，不是持久journal或新authority。

原proof验证真实protocol/operation/input/endpoint及completionBindingDigest；后者绑定冻结Run/Effect/epoch/boot/source/grant/egress/input/budget decision和typed admission。原BudgetPort重读每条稳定local ordinal/provenance/reservation及settled/completed状态；只有这些实际原证据通过，现EffectController.observe才写同一既有immutable EffectReceipt/RunLedger。confirmed允许经必需verifyObservation核实的original_port_observation非null引用，不为本地Skill伪造remoteOperationRef或DomainReceipt。

确认仅为mcp_response_validated、skill_read_completed或skill_files_completed；MCP isError=true是已验证远端错误，outcome=failed/reason=mcp_remote_reported_error，不是业务回滚。原HTTP client拒绝非boolean isError。全部resultRefs=[]、domainReceiptRef=null，receipt仅hash/原refs/方法，不复制协议正文/Secret，不授予后续正文、Memory或World消费权。list/pin/catalog不因本组升级为可确认副作用；R2/R3和可信Review门槛不变。

save前退出/无proof/未结算明细保持unknown且不重发；save后ACK未知只查相同确定receipt，不重复写或Tool调用。cold observe只读已有receipt且必须匹配当前confirmed/failed intent；较旧confirmed与当前矛盾unknown不能升格。Skill真实正文返回前在同一原Engine事务重读confirmed与同receipt，重验grant/source/child/epoch/cancel/Skill并以原bank currentness收尾；撤权或矛盾均拒正文，历史事实与当前可消费权限分开。未取得真实部署/完整产品scope证据不算P3/P4 Gate通过。

### 17.25 最终实际请求与逻辑Effect输入分离

EffectIntent.inputRef/inputHash保存最小logical action引用/摘要；原bank每条attempt.inputFingerprint绑定实际最终请求，两者不假设相等。新增原compiled-binding.js的compiledSendIdentity统一核对request/route/path、compiledBinding自hash，并返回requestId/targetFingerprint/去createdAt最终snapshot+routeId的hash；不增加request record、不把完整prompt或snapshot复制到RunLedger。正文与Secret继续归原服务，D6最小metadata边界保持。

Host只在原GenerationService.beforeSend私有closure捕获已含compiledBinding的最终snapshot；实际bank.admit发生在原Secret回声检查后的provider.send wrapper。第一render与原compiledRequestBinding重算相等才准入，retry重新render并再次检查Secret与本次实际binding，fallback使用当前route捕获值；原Native Provider的私有wire lease/真实send校验继续负责实际body真实性。返回snapshot对应最后成功实际send，不能沿用首次render诊断。

ExecutionService.generationSend.beforeSend必须取得真实receipt/budgetAttemptRef、最终snapshot和compiledBinding，复用唯一identity helper，传给必需原effectAuthority.verifySend；原BudgetPort.verifyBudgetAttempt新增内部可选expectedSend，核对原row的requestId/targetFingerprint/inputFingerprint精确相等，local_work不能冒充provider send。真实GenerationSend路径始终提供此参数；Effect ready/claim的纯身份验证继续不收费。摘要只提供绑定证据，既非Model/Actor grant，也不替代来源/权限/实际producer/原银行的最后复核。

### 17.26 可发布机制证据与运行grant分离

authoring仅为generation.send增加有限原机制验证：实际agent节点的agentPinId必须是本节点声明的port=model、player RuntimeRoute exact pin；原RouteResolver按固定role.narrator读取原Model/Connection/Prompt/Generation/资源闭包、能力及路径证据。实际route文档hash必须等于pin.integrity，要求原显式computeBudget且无fallbackRouteRefs；其他node角色、缺机制、未使用的cap ceiling或未接能力仍unknown，invalid/stale依赖不能发布。不为此读取Secret、render、发送网络、收费或创建Run。

验证摘要纳入原path/resource/capability fingerprints，原Connection路径变化会使旧validationDigest不可发布；所有纯校验仍由publish再次执行。生产router用原getNativeGenerationHost提供的原persistence/library/providers构造原RouteResolver，只读复用原服务，无新模型实现或价格表。

这一证据仅表明可解释、精确且有原预算策略的原Narrator机制，不提供Session/Actor/Task/Source/Tool/Delegate权限。真实固定Native Turn producer、每次send/consume Scope、原bank及Effect授权仍必需；当前它们未完成的部分继续IMPLEMENTATION_PENDING，不把可publish误显示为“运行已获准”。后续增加域或fallback须以其原producer/pin/grant实证扩展，不能将此有限reader改成所有capability默认supported。

### 17.27 原RunControl稳定准入与原角色/后台配额同CAS

原RunControl.charge的role/turn/background/window/period计数提取为唯一chargeGenerationQuota helper；原charge继续调用它。内部admitCompute(handle,snapshot,anchor,limits,attempt,options={},quota=null)的quota封闭为{request:{role,background,anchor},policy}，复用原assertGenerationBudget，并与原Package policy精确相等。foreground只接受原branch/revision anchor与narrator/intent_resolver；background保持原invocationId counter operation，compute仍在同root turn bank。没有第二账本或两次先扣后准入。

在同一次原update/CAS内先验证原stable compute admission，再仅fresh时消耗原quota；quota或compute拒绝都在唯一原control发布之前回滚。后台原window/period及highWater不变；真实pending outbox对原counter保留规则不变。quotaOperation是实际原计数归属引用，不是grant。

原provider compute行新增可选generationQuotaRef={operationId,role,background,policyDigest,anchorDigest}，仅RunControl从上述内部quota生成，拒attempt自带此字段。原shared validator/charge clone/replay比较使用同一封闭结构；同stable identity不能换role、后台anchor、policy或移除/新增quota后重放，返回quotaOperation来自已持久原行。明细是原bank原计数的关联metadata，不保存余额/价格或第二套quota事实。

该底层本身不提供producer，也不向HTTP开放quota。固定Narrator的Host私有身份与实际quota接线见§17.29–§17.30；其他角色/后台未接路径仍拒绝。精确底层反例、冷重开及原quota回归见同一Record第十七组，当组新矩阵SQL未运行，后续实际四Engine证据见§17.28。

### 17.28 原usage结算的跨JSON存储幂等

原shared settleComputeAttempt/settleLocalWork对已settled usage按封闭合同字段逐项比较，不用JSON字符串字段顺序判定费用是否相同。model核inputTokens/outputTokens/totalTokens，local核wallMs/cpuUserMicros/cpuSystemMicros/cpuScope/outcome；原ledger/usage schema继续严格校验，不接受金额变化、取消退款或以missing counter推算零费用。

该修正由真实Pg JSONB重排行键导致同usage第二次settle冲突发现，并由FS/SQLite本地usage入参换字段顺序复现。原quota/冷重开/ACK未知/拒绝回滚及settle矩阵现已在真实FS/SQLite/MySQL/Pg共45case通过；对应原26case回归与guard变异范围归同一Record第十八组。这是本地隔离数据库的软件行为证据，不是外部真实账单或四OS客户端验收。

### 17.29 真实Native Narrator生产组合与ModelPort

本节记录第十九组初始有限范围；authority candidate、实际编译计费和Scheduler active permit的当前扩展归§17.30。

原NativeGenerationHost生产工厂安装NativeNarratorOrchestrationAuthority；原turn/turn-start入口在排程、Stage或World工作前读取实际Binding。优先精确entryPointId，只有确实不存在才用同Session的null默认选择；过期、无效、不支持的精确Binding直接拒绝，不能降级。没有Binding继续原Native服务路径，不创建V3 Run；这不是旧Orchestrator兼容模式。显式routeRef只接受原player/runtimeRouteId封闭结构，绑定Route必须精确等于原selectNativeRuntimeRoute实际选择。该组仅支持无authorityRuntime/logic/stage/Task/interpreter/output processor的原固定Narrator、agent→output两节点、唯一generation.send精确pin及result输出；其他profile明确unavailable，不隐式扩权。

Host原固定Narrator点创建短命opaque quota proof，绑定实际Host/SessionCore、owner/source、invocation/requestHash、selection、固定role及原policy。JSON副本、任意role、异Host、错selection不能充当身份。BudgetPort对带原generationBudget的Session发送要求此proof，再调用原RunControl同CAS准入；HTTP不接受proof或quota。实际Package要求generationBudget与authorityRuntime组合，该组无policy实际Turn证据不能当角色配额通过；这一producer依赖已由§17.30的原candidate适配收口。

工厂从原Plan/Binding/Source与原Narrator机制形成精确内部grant，创建原Run/Attempt/Effect，复用原ContextPort。最小logical input只含source/package/Plan/node/Binding/invocation/route/Audience/grant引用及hash，不复制prompt/Secret。ModelPort只接受工厂WeakMap的一次性scope，自行调用原Host prototype.execute与原Provider私有wire lease，核每条实际provider ordinal、最终compiled/send fingerprint及原bank记录。原实例execute替换、伪响应、伪lease或JSON scope不授权完成。所有正文只在最终source/grant/epoch/fence/child/cancel/confirmed receipt及bank复核后交回原Native prepare/finalize；不转发provisional模型正文流。

唯一既有EffectReceipt以generation_response_validated确认真实响应，保存response/request/compiled摘要及原预算refs，resultRefs=[]、remoteOperationRef/domainReceiptRef=null，不保存正文。missing usage保留原费用unknown；响应confirmed不伪造settled或真实账单。cold observe只读精确已有receipt/current confirmed，缺保存、ACK未知、矛盾intent或旧receipt不授权重发/正文消费。此处只确认模型事实，V3 Run/OutputClaim/Result与正式业务闭包尚待P4；原Native finalize存在不等于V3 Run completed。

原Native HTTP对安全native_orchestration_*码保持脱敏与实际409/503，detached Scheduler仅保存安全码，不泄露原异常正文。未新增Run/Projection/Approval路由。内部retain_native_turn_until_explicit_release仅表示内建不自动GC策略，尚无可信release接口。该组未计量的实际compile与未绑定的active operation/attempt已由§17.30扩展；其他已授权实施待办不标外部BLOCKED或P3 PASS。该组精确四Engine/FS/SQLite及变异证据归同一Record第十九组。

### 17.30 原authority candidate、实际编译计费与活跃Turn身份

有限Native Turn profile增加原authorityRuntime的显式typed transaction。Host从原authorityTurnProof验证真实prepared.candidate/receipt/selection，克隆lanePlan时继承同一私有producer；SourceBinding、原bank与quota始终锚定committed base，candidate不是已提交World。logical input/grant仅增加原authority identity及candidate/receipt摘要。工厂拒伪proof、错Core、替换candidate/receipt、缺原localWork限额；无typed transaction的resolver、Task/stages/interpreter及后台仍unavailable，不用caller role扩大支持。

ContextPort通过原proof读取候选视图，每个compile/send/consume阶段重核原committed head、原proof与Audience。原Native的safeItems、authority receipt附加及Knowledge narrowing抽为共享纯helper；tokenizer、persona consumer、effectiveOutputReserve、Package derivation/processing继续用同一原Native option builder。没有第二World/Memory/Secret或Package执行服务，正式状态仍只由原Native finalizer写入。

ExecutionService.generationSend先创建唯一原sendBank；compileNativeContextMetered经原ContextPort.compilationDescriptor取得真实snapshot/candidate/receipt/Package source输入字节，再以同一bank的稳定local ordinal准入实际compiler并结算wall/process CPU。caller metadata/hash不能冒充输入大小；短命descriptor不入账本。原Host复用同一计费生命周期，准入前先核current/cancel，已准入工作仍在finally记录实际失败/取消费用，不退款或丢迟到结算。

bindContext({port,compiled,compileProof})只在prepared Effect内单次绑定，重读原Source/Run/grant/fence/child并核私有证明；context为只读getter。compileProof精确绑定同bank/原BudgetPort/owner/Run/epoch/boot/Source/Effect/grant、原编译对象及真实settled/completed typed local行。sendBank的短命WeakMap品牌只证明原adapter出处，不是余额或许可。Host只有该proof有效才复用已计费Context，避免再收context_build；实际正例在maxJobs=5下恰有5个原local jobs及1个context_build。观察原计费事实不要求新发送权。

原Scheduler在真实run callback登记boundary→operation/attempt，每次assertActiveBoundary检查原operations/running集合、running/streaming状态、原controller.signal、owner/anchor/key/fingerprint及完整资源。opaque Turn permit再绑定Host/selection/invocation，quota proof与ModelPort复用它；终态未abort、旧attempt、伪boundary、资源缺失或替换signal均不授权新发送/消费。没有新scheduler或持久permit表；事实observe/late settle不加active门槛。

固定Narrator实际quota与原compute同CAS已在合法authority Package、真实HTTP及原finalize中取得FS/SQLite和指定MySQL/Pg实证；第二次真实retry准入可被原narrator cap拒绝，candidate保持未提交。四Engine Model/计费矩阵及SQL测试timeout诊断详见同一Record第二十组；测试60s不改变产品timeout或性能SLO。成功503→200多attempt确认、独立Run.cancel/contradictory Effect与最终consume的后续线性化实证归§17.31及第二十一组；不可用同一SQL snapshot二读宣称已解决。P4正式Native提交前的V3 OutputClaim/取消/Result闭包仍待接，模型响应confirmed不当Run completed。P3 Gate仍NOT_READY。

### 17.31 原Run树消费线性化与正文拒绝

`RunRepository.withConsumption(handle,runId,consume)`是原Host顶层Model/Skill消费者的内部接缝，不是HTTP能力或新grant。它从原Run读取不可变祖先链，复用与原Run命令相同的`withNativeResourceWrites`锁住本Run及全部祖先，取得锁之后才开始消费Engine事务。当前Model/Skill调用点在Engine事务之外；原Engine在已有ALS事务中会重入，因此本合同不将任意外层事务调用宣传为新snapshot。不得在旧SQL snapshot中仅二读后声称取得最新并发状态。

消费起点复核原Writer、完整Run、取消/状态与祖先epoch/Attempt/已确认原预算。内部`consume({tx,root,fence,deny})`继续核精确当前Effect及既有完成Receipt、Source/grant、实际bank、固定Turn permit/signal；最后重新核Effect/Receipt。随后RunRepository复核本Run及全部祖先integrity、Writer代际。外部原取消/Effect命令与正文消费由同一原树锁决定顺序，不另建mutex/ledger或Scheduler；事实observe/late settle在消费锁外，取消不退款或抹去真实响应。

同ALS重入的合法控制写可在消费await期间改变权限；此时`deny()`私有sentinel或最终Run变更形成拒绝envelope，Engine先正常提交这些事实，再在事务外抛`native_orchestration_consumption_stale`，正文不返回。不能在该边界直接抛错回滚已经成功的取消/unknown事实，也不能捕获任意存储错误后假称已提交。缺少真实同实例RunRepository/EffectController的Skill在执行、读取输入和收费前拒绝；不保留unknown且返回Skill正文的旁路。MCP/A2A操作metadata不冒充正文或远端完成。

本节第二十一组只线性化Port对原Run/Effect控制写的正文消费，不宣称原Source/Binding同样原子。该组真实FS原Core.appendTimeline和saveBinding末await探针另复现来源/Binding改变后仍可返回正文；第二十二组修复及范围见§17.32，不将旧反例抹成一直通过。原Native finalize前的OutputClaim/Result/取消围栏仍由P4闭包实施，模型响应confirmed不表示Run completed。真实独立任务顺序、同ALS写入/冷读/原费用保留、503→200成功retry与守卫变异的精确结果归同一Record第二十一组；合成HTTP和本地隔离数据库不替代实际账单、三端客户端或文本质量证据。

### 17.32 原Session/Binding域消费围栏

§17.31已实证的原Source/Binding末await缺口由原领域锁组合修复。内部`SourcePort.consumptionBoundary(handle,binding,{engine})`只构造边界，不读取Session payload、发送、收费或写入；校验同原SessionRepo/Engine/Core/BudgetPort、精确Session来源与binding digest后，执行时调用原`withRuntimeWrite`和原`SessionRepo.prototype.withRunLock`。Model/Skill必须注入同一执行服务的原SourcePort，不接受no-op锁替代品。当前只接Native Session正文消费；Project/RP缺原正文消费adapter时明确unavailable，不能借Session锁或caller callback声明获得其他领域权力。

`RunRepository.withConsumption(...,{withAuthority})`在原Run全部祖先锁内调用该原领域边界，再开始消费Engine事务，固定顺序为Run→Runtime→Session→Engine。`withAuthority`本身不是grant，内部primitive的默认值也不提供领域保证；真实正文Port强制传原SourcePort边界。域锁只覆盖最终消费，不持有到Provider HTTP等待期间；原事实observe/费用结算仍由原服务执行。原Factory在Host事务内直接通过原`assertRunAccess(tx,...)`纯读权限，避免反向等待Session写队列，不重写原RunControl权限规则。

Model在最后bank await后再次复核原Source/Binding/Context/grant，Skill先完成最终原grant/Skill回调，再以原SourcePort复核来源，之后核末Effect/Receipt。明确的Native stale/权限拒绝转private deny，使同ALS合法Session发布/Binding CAS先提交而正文被拒；存储ACK未知、完整性/资源身份错误和任意TypeError保持原错误，不以宽catch伪称成功或确定未提交。原Source先检查而后又await授权回调仍有缺口，已以真实原Session写反例修正顺序，不将独立域锁通过代替该反例实证。

此围栏限定Port消费决定；决定之后原领域仍可发布，正式Native finalize的HEAD CAS继续有效，P4 OutputClaim/Result/取消闭包尚不能由此替代。Source/Binding、原锁顺序、HTTP期间锁可用、冷读/费用保留、错误分类和守卫变异的实际范围归同一Record第二十二组；不将原角色/其他领域/可信Review/三端或真实费用未测项目称为通过。
