# Atria MCP 补强 — Memory / Goals / Evidence / Experience / Evolution（第四轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；**Primary Workspace**：`plugin`。
- **冻结日期与选择**：2026-10-14，第四轮方案 **B：分域权威 + 受控跨域工作流**；属于待实施的设计规范，不宣称任何新增接口已实现或验收。
- **源码核查基线**：`main@9241325a7290e613e0fdaaa1870409105c161c89`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`；如远端后续推进，开发前重新核对业务/输入/输出/错误语义。
- **权威与依赖**：[总入口](index.md) / [能力矩阵](capability-matrix.md) / [P0 可靠性](p0-reliability.md) / [Studio 与 Project Agent](studio-project-agent.md)。

## 1. 冻结总体原则与不可越界约束

1. **五域分别拥有自己的原生权威**：Memory Graph 的加载图谱、SourceLifecycle/Floor-State 与 Native Session scope；GoalRepository / GoalContinuation；EvidenceRepository / EvidenceSourceService；ExperienceRepository；EvolutionRepository + 各 Target Store。MCP 只做鉴权、受限语义控制、可验证编排与可见回执，不建第五套统一认知/记忆数据库，不直写 dataRoot/ChatState/StorageEngine。
2. **跨域工作流是受约束的关联，不是跨数据库事务**。可按用户已批准的 envelope 组织 Goal → Evidence/Experience → Diagnosis → Evolution Candidate/Review/Publish，但每一步仍由拥有方校验，拥有独立版本、持久化与回执；失败可部分完成，不能报告“全域原子提交”。
3. **来源有效性先于推理结论**。每条派生状态关联 owner、scope/subject、源对象身份/序号/内容 hash、Session branch/revision 或 Project base revision、PackageVersion 以及必要的当前时点。来源变化、读档、换分支、删除或过期后自动撤销“current”的推断；不能靠外部 AI 的文字恢复为有效来源。
4. **预算和授权不跨域继承**。MCP Policy Ceiling、用户批准 envelope 与 Native Goal compute budget、Evolution owner reservations、Runtime Provider quotas 是不同门槛；每次派生模型调用明确 action、模型路由、网络/费用、资源上限及触发后续效果。操作在任何层越界均拒绝。
5. **提交与发布由原生 Authority 作最后决定**。Memory 图谱 mutation 用 guarded session；Goal/Experience/Evidence/Evolution 用原生 Sequence/CAS/source proof；Evolution 发布必须在目标 Store 进行 exact-version write 并记录 Publication Intent/Receipt；MCP 不以自身日志代替结果。
6. **只读必须真的无持久化副作用**。现有 `AgentEvolutionService.inspect` 在非只读模式可能内部调用 `reconcile`，而 `reconcile` 能修改持久对象甚至继续已登记的发布 Intent。不得把它包装为无副作用 `atri_read`；应增加/复用纯观察 Authority，`reconcile` 单列为受控效果操作。
7. **用户身份不可伪造**。来自外部 AI 的参数不能制造 `origin=host`、`origin=authenticated_owner`、技术信号或模型评估付费证明；后者必须由实际产品执行者/可信交互/原生 Receipt 生成。

## 2. Memory Graph（已实现与补强方向）

**现状**：`public/scripts/agents/memory/api.js` 的 `openReadSession` 只提供已加载图谱的冻结读工厂；`openGuardedSession` 复用带 Source Session/Ticket 的独立草稿写并提交 `commitSessionMutation`。原生 `source-lifecycle.js` 按当前 Chat/Native Session scope 校验数据源；`persistence.js` 维护 Floor-State/Meta 的真实存储。现有 MCP `capability-bridge.js` 与 `memory-mutations.js` 基于独立 Playwright 页面调用它们，能 READ 图谱和提交受限节点/关系修改，但并不是通用无头 Host Memory API。

**候选 Action 族（语义方向，名称/Schema 以后冻结）**：

| 族 | 风险 | 强制条件 |
| --- | --- | --- |
| `memory.scope/status/schema/source.inspect` | READ | 当前加载范围、Branch、源校验、缺失时明确 unavailable；不得初始化写 Session |
| `memory.node.query/relation.query/graph.expand` | READ | 有界扫描与输出、来源过滤 |
| `memory.recall.preview/vector.search` | READ + network/cost effects（实际触发外部 Provider 时需费用策略） | 明确 Embedding/Rerank 消耗，不隐性变动访问计数或来源账本 |
| `memory.node.create/edit`、`memory.relation.upsert`、`memory.compact` | MUTATE | Exact scope/graph hash/source ticket、重新校验、成功后产生原生持久化凭证 |
| `memory.node.delete/relation.delete` | DESTRUCTIVE | 狭窄对象级一次审批，展示引用/压缩结果，不接受任意批量 method |

- **无头适配**：作为 P1 核验和建设目标，优先考虑可认证的 Native Memory Authority / 业务对象级端口；它必须复用已建立的 source-guarded write session、Native Session/Chat scope、分支约束和 Floor-State 持久化事务。**不能**通过 Node 直接读取/重写浏览器插件序列化状态或从 MCP 开放 raw ChatState。加载态不满足时返回 unavailable，不擅自加载其他用户 Chat。
- **压缩不是物理遗忘**：`compactNodes` 有图谱 rollup 语义，不等于可靠清除旧来源；物理删除需另走明确破坏性动作。旧 Memory recall projection、向量索引及缓存不可被冒充为唯一持久来源。
- **跨 Save / branch**：若源数据与当前 branch/revision/PackageVersion 不符，READ 只能表达历史/失效状态；任何重新写入应重新获取当前 Source Session 与可验证 guard。不得因为业务读取了另一 Session 的快照就自动“迁移记忆”。

## 3. Goals 与执行续接

**原生真值**：`AgentGoalRepository` 的 Goal 文档、固定 `subject/scope/intent/criteria/invariants/budget`，通过 Sequence/Integrity CAS 变更；`GoalContinuationService` 把用户 Project Goal 显式绑定 Project Agent Task（保存 Goal definition hash）后支持 wake/pump。RP `actor` 欲望并非可随意借用费用的 Agent 任务。

| 候选语义 | 风险 | 说明 |
| --- | --- | --- |
| `goal.list/get/context/associations/inspect` | READ（必须确认具体 handler 无额外持久副作用） | 读取当前 Target、Branch/Project Anchor、有效 Evidence、进度与 Blockers |
| `goal.create` | MUTATE | 明确 Subject、Scope、Criteria、Invariants 与非负预算，owner 由 Atria 认证 |
| `goal.evaluate` | MUTATE（并非纯查询） | 抓取并保存进度/EvidenceSet，要求 expectedSequence 与 source current |
| `goal.pause/resume/cancel` | MUTATE | 真实 Task 状态变更、取消后续 Wake；不可宣称旧已执行提交回滚 |
| `goal.bind.project_task` | MUTATE | 精确 Project Task/Intent/baseRevision/definitionHash 关联；不变相新建 Agent |
| `goal.wake/pump` | INTERACT/受控带费用工作（若改变持久目标/任务则按 MUTATE） | 可登记后台任务、调用 Studio 模型并使用 Goal compute；严格限频、次数/成本和权威 status |

- **尤其要点**：Goal wake/pump 不是“查看进度”；当前代码可能引发真实后台模型调用与持久 Task 修改。必须在授权前列出连锁效果。
- RP Goal 受 `branchId + packageVersionId`；Project Goal 受 `baseRevision`，且正式 Project Agent commit 可合法推动 ProjectRevision，状态评估须按原生例外逻辑处理。
- 只读取 Goal 并不能代表“完成”已被最新来源确认；`completed` 的证据应重新按原生 EvidenceSet 校验，并保留 stale/blocked 语义。

## 4. Evidence（独立来源账本）

**原生真值**：`AgentEvidenceRepository` 用 `evidenceIdentity(scope, rootRunId)` 稳定定位 `capturing/completed/failed/cancelled` 记录；来源 `EvidenceSet` 包含 source selector、anchor、contentHash 与 integrity。宿主正式输出、人工观察不是同一种证据。

| 候选 Action | 风险 | 约束 |
| --- | --- | --- |
| `evidence.inspect/verify` | READ | 精确 Evidence ID、来源与 OutputRef、是否 captured/stale/incomplete |
| `evidence.begin/append/finish` | MUTATE | 只有拥有可信运行来源、当前 Scope 与 CAS 才能更新；禁止外部 AI 冒充 host outcome、receiptHash 或 user-origin |
| `evidence.delete` | DESTRUCTIVE | 精确 source identity / integrity，展示会使哪些 Experience/Evolution 失效 |

- 宿主的 `origin=host`、技术状态和结果证明只能来自 Atria 原生运行及正式 Outcome/Commit Receipt；普通外部 AI 客户端不得任意设置以提高证据等级。客户端真实观察只能如实标记 `client_observation`，且受有限的验证边界。
- 删除来源可能触发 `Experience.purgeSource`，这是多个原生资源/阶段的级联修正，不假装全局事务。来源已删/不存在时下游应 fail closed，并保留“部分成功/需要重新核对”的信息。

## 5. Experience（反馈、诊断、失效）

**原生真值**：`AgentExperienceRepository` 的 `scopeId=hash(scope,subject)`、`sequence`、Feedback/Diagnosis/Collection、retentionDays、每条来源与到期时间；来源变更会调用 Evolution invalidation。

| Action 族 | 风险 | 边界 |
| --- | --- | --- |
| `experience.target/inspect/reflection/source.verify` | READ | Frozen/read-only projection；Reflection 只提供候选批次，不自动诊断/发布 |
| `experience.collect/outcome` | MUTATE | 正式完成记录与来源校验，host outcome 仅由原生宿主采集 |
| `experience.feedback.submit/correct/withdraw` | MUTATE | 显式用户反馈必须有可信用户来源；外部模型的解释不得冒充用户评价 |
| `experience.diagnosis.create/withdraw` | MUTATE | feedbackRef 的 ID/revision/integrity、诊断 batch hash 和 evidence 有效期 |
| `experience.retention.update` | MUTATE | 明示现有数据会缩短有效期、潜在自动失效与成本影响 |
| `experience.feedback.delete/diagnosis.delete/scope.delete/source.purge` | DESTRUCTIVE | 逐类区分物理删除、来源保留策略、失效传播，预检依赖引用 |
| `experience.export.learning` | 敏感 READ / 独立导出授权 | 来源、隐私、用途 `offline-analysis`、版本与封顶输出；不给跨 Scope 的任意数据下载 |

- **区分命名**：现有 `experience.purge` 主要重新核验/刷新，不能按名字当作“删除”。相反 `purgeSources` 与 `deleteScope` 可能物理删除 Project Agent Task、Evidence 或整个 Scope。
- 来源如果 stale/absent、反馈过期、被更正/撤回/删除，相关 Diagnosis 与 Evolution 必须重新核对；没有可靠证据不得推断已改进或提升。
- **连锁自动触发**：`native-generation.js` 的部分 Evidence/Experience 写入可能异步调用 `Evolution.wake`。MCP 在调用这些写入口前必须预检 Effective Auto Policy 和预算，再以批准 envelope/策略涵盖后续费用；无法保证不触发未授权副作用时必须拒绝或由产品提供专门的“无额外 wake”的权威入口，不能靠提示词说不会触发。

## 6. Evolution（候选、预算、发布、回滚）

**原生真值**：`EvolutionRepository` 拥有按 owner 和 scope/subject 隔离的 Budget Ledger、`reserved/unknown/reported` Attempt、Job/Publication/Retirement Journal；原始目标值仍在 SkillRepository、Workspace/Settings、PromptCandidate/RuntimeRoute 或 ProjectAgent Strategy Store，Evolution Journal 并不是第二套有效目标数据。

| Action 族 | 风险 | 边界 |
| --- | --- | --- |
| `evolution.status.raw/policy.get/catalog/target.inspect` | READ（**不得隐性 reconcile**） | 独立读原生 Ledger/Target，展示 mode、version、binding 与有效来源 |
| `evolution.budget.configure/mode.set/target.declare/policy.configure` | MUTATE | 精确 Scope/Subject/Target，当前本地费用限额、Route、预期序号；auto 单独批准 |
| `evolution.job.start/startLearning` | INTERACT + MUTATE（真实生成/预留费用） | 独立 JobID/OperationID、Budget reservation、费用上限和审计，不能免除后续发布审查 |
| `evolution.candidate.inspect/label` | READ / MUTATE | Human label 只能来自可信用户交互，不能由模型伪造 `authenticated_owner` |
| `evolution.publish` | MUTATE（有覆盖/删除语义时提高风险级别） | Job/Report/Policy/Target exact hashes、真实可见评估和独立可信批准，原生 publication intent/target CAS |
| `evolution.rollback` | MUTATE（依目标风险分级） | 仅当前绑定仍是已发布版本、旧版本有效时才能回退；冲突保持可观察 |
| `evolution.reconcile` | **有状态 MUTATE / 专门恢复动作** | 可补录 receipt、续完既有 intent 或 rollback；不得复用 `atri_read` |
| `evolution.export.learning` | 敏感 READ | 仅专门导出权限/明确用途，来源及 Owner 再校验 |

- 现有 Auto Policy 模式 `review/auto/paused/disabled`；**通过 MCP 默认保持不激活 auto**，只有显式用户授权准确的 Scope/Target/Route/预算及后续发布策略，才允许切换为 `auto`。原生既有 `auto` 不因 MCP 接入而隐性失效，但 MCP 对可能唤醒自动学习的操作，必须明确前置审批连锁影响。
- 当前部分 HTTP 参数允许 `review: true` 或客户提交“human preference”，但这**不是可信人的证明**。MCP 不允许仅凭该布尔值/字段获得权限；需要通过可信客户端 form/MRTR 与真实 owner 身份、精确 candidate/report 绑定，并由产品本体落实最后的 Target CAS。
- `start/reconcile/publish/rollback` 可以引发费用/持久变更；新 MCP Control Lane 应能及时观察 Job、请求停止及解释 unknown。由原生 BudgetLedger 拒绝超额，MCP 自己的费用 envelope 不能取而代之。
- Provider timeout/Host restart 后 `reserved/unknown` Charge 依原生账本保留占用；MCP 不得伪造 `reported=0` 或自动重发。
- Publication Intent 若中断，恢复只能基于 Product `reconcile` 的真实权限及 Target exact version；恢复历史已批准的具体提交与发起新发布是不同权限。结果为 `rollback_conflict` 或源失效时留给正式审阅，不覆盖用户已改变的新版本。

## 7. 跨域工作流（冻结）

在已授权且原生 Domain 能力存在时，允许以下 **受控编排模板**：

1. **Goal 监督**：READ Goal/Evidence → 固定 scope/current source → 必要时显式 Goal.evaluate / wake/pump（费用/状态披露）→ 读取 Task/Goal 进度；不得凭文字“目标完成”写完成状态。
2. **Experience 收集**：从受控已完成的 Project Task/Session Outcome → 可信 EvidenceSet → Experience.collect/反馈（按实际来源分级）→ Reflection/Diagnosis；没有记录/来源时停止升级结论。
3. **Evolution 改进**：读取有效 Experience/Diagnosis → Target catalog/declaration → Budget/Route exact review → start candidate → eval/label → 独立 Publish approval 或已明确授权的原生 Auto Policy → Target Store verified binding → 观察与必要安全 rollback。
4. **Memory 关联**：使用源标识与 Memory 事实/事件做可验证**关联/参考**；不自动把 Experience Diagnosis/Goal 或 Candidate 写成 Memory Fact，也不让 Memory Graph 节点内容直接替代已认证 Outcome。
5. **失败/中断**：每一步依产品 Authority 精确记录局部结果和下一步；MCP Journal 只存 action/ID/hash/状态/回执关联，不存第二份 Evidence、Experience、MemoryGraph、Goal 或 Candidate；退出/换端首先 READ/reconcile，再决定是否需要新审批。

**模板不是默认后台自动化，也不建立复合万能写入 Action。** 只有用户或 Plan 明确选择工作流时才串联操作；每步仍按域内 Ceiling、原生有效性和风险权限执行。

## 8. 失效传播、删除/GC 与持久安全（冻结）

- 来源被更正/移除、Session 恢复/换分支、Project Revision 变化、Feedback 更正/撤回、过期或目标 version 修改后，下游状态应标 `stale/invalidated/paused/conflict`，按原有依赖链重审；不能静默将旧派生结论迁移到新 Session/Scope。
- Feedback/Diagnosis 的 Retention、Evolution 的 candidate garbage/retired 与 Memory 的 rollup 属不同数据清理机制。不要设计一个无边界的跨域一键 GC；破坏性删除必须给出引用/历史与无法撤销的部分。
- 已发布 Target 真实版本变化使历史 publication 失效，原生 rollback 只能恢复明确可验证的上一版本；若原始版本缺失，保持冲突而不是创设新版本伪装恢复。
- Atria 不保证 Evidence/Experience/Evolution 级联清理为一个跨资源原子事务；MCP 收到部分成功必须保留 owner/step/result 和独立后续核对，不能清空全部历史或假定自动补偿。
- 需要产品新增 Authenticated Native Adapter 时，只增加 **被证实缺失**的有界读取/事务性写入 Authority（如无头 Memory、Evolution raw inspect/显式 reconcile、cascade-effects preflight），先要求 server-side owner/scope/revision/Secret/cost guard。不得把独立 `plugin` 工具复制到 `main:plugins` 中。

## 9. 第四轮验收计划（未执行）

- Memory：加载态/无头缺省、相同/不同 branch/sourceHash、rollback/Save、图谱 compact/delete、read factory 无写入副作用、Embedding 网络成本披露。
- Goals：用户/Actor/Project scope、ExpectedSequence 冲突、Wake 的真实 dispatch 与预算、完成目标的有效证据和失败恢复。
- Evidence：host-vs-client origin 不可伪造、Case Snapshot/Commit Receipt 校验、源删除后 Experience 失效。
- Experience：显式用户反馈不可伪造、Reflection 与 Assessment 区分、Retention、Feedback/Diagnosis 删除、自动 wake 的连锁披露。
- Evolution：RAW READ 与带效果 reconcile 区分、预算预留及 unknown 保留、Job restart、auto 授权、Human label、Publish CAS、Rollback/Invalidation Conflict。
- 跨域：多个 MCP 进程/Client、Scope switch、网络丢包、源修改和部分成功时各域能单独核对，不出现越权、免费重发、隐藏费用或隐性状态晋升。
- 运行测试、浏览器 UI、真客户端审批和付费 Provider 验证按变更实际需要实施并真实记录，不将静态审计说成测试通过。

**下一轮（第五轮）**：Model / Prompt / Runtime / Provider 的 Route-Connection-Model 及 versioned resource 权威、Provider 发现与 fallback、Preview/Execution/Compute、Secret/费用边界、MCP action 形态；不会在本模块提前冻结这些细则。
