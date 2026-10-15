# D9 E1 — V3 原生接口冻结方向及 E0 物理阻塞

> 2026-10-15 第九轮用户选择 **E1**。本模块拥有 D9 **Plan/Run/Effect/Receipt/Result/Projection 跨层接口的冻结语义与 E0 前置清单**。D1–D8 的业务细则继续引用 [architecture](architecture.md)、[graph-control](graph-control.md)、[context-sharing](context-sharing.md)、[adaptive-compute](adaptive-compute.md)、[effect-authorization](effect-authorization.md)、[narrative-project-quality](narrative-project-quality.md)、[graph-editor-experience](graph-editor-experience.md)；静态旧代码证据见 [e0-audit](e0-audit.md)，工程阶段见 [implementation-plan](implementation-plan.md)。**逻辑边界冻结，不等于接口字段、存储表、RPC 已实现或 E0 完成**。

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

## 6. Host API / Port 与 E0 审计前置

**需要冻结接口族和权限语义，而非提前发明 HTTP URL 或固定 JSON 字段**：

- Authoring：Draft open/edit/save/validate/publish/list/inspect/version/diff；Host CAS/权限/SourceVersion 的错误回执。
- Run：start/observe/status/projection/graphRevision/cancel/requestResume/reconcile/getDiagnostics；其中 `cancel` 是请求，resume 是新的权限+source+Effect审查，不代表自动重发未知请求。
- Effect：request/grant/approvalRequest/approve/reject/status/reconcile；所有可收费/外发动作在原 port send boundary 受控。
- Result：typed result refs/readWithAudienceCheck/claimOutput/review；原 World/Session/Studio 等正式 consumer 只返回本身 DomainReceipt。
- Frontend：Snapshot/Delta/Sequence、脱敏 Source/Proof/Cost/Approval、Graph+Inspector 同一 Draft、移动端 List/Sheet；不得新增 Browser 资金/Tool/Run Authority。

**E0 尚存的硬阻塞**：

1. Native Host FS/SQLite/StorageEngine/Lock/CAS 的实际可实现边界与启动/关闭/恢复/GC/事务日志，需在真实 main HEAD 上读透相应调用链，决定原写入权威上哪一层原子化；不凭设计声称 crash-safe。
2. 原 Model Provider/Compute 与 Graph 多子任务预算、EffectIdentity/idempotency 的真正对应、Gateway hidden retry/unknown、成本快照与重放断点需要代码/测试证明。
3. Browser Orchestrator、Native Game、Evolution Targets、Settings Repo、Studio/Skill/Tool/MCP/A2A/Serene Canvas/RP/Project 的 import/API/设置和真实用户消费图需要全面确认；破坏性删除旧目录前必须锁定共享消费者与替代接口。
4. 安全/外发/Secret/Prompt Injection/Trusted Approval 的受控 Host endpoint 和跨 Windows/Linux/Termux 的实际客户端能否实现，需明确失败退出与真实权限；不能自动降级成客户端 `confirm:true`。
5. 物理数据库/文件路径、字段、RPC endpoint、version/pin/hash 算法、error enum、额度/性能阈值、运行 GC/scope 截止和保留政策**仍开放**，只能经完整 E0 证据冻结为实现合同。

下一步 **先完成 E0 接口/消费者/存储/回执闭合，再依据 [implementation-plan](implementation-plan.md) 获得正式开发门槛**。不能以此接口方向已冻结为理由创建开发分支或修改 main。
