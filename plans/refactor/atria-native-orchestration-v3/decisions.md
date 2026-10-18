# 已冻结决定与待讨论事项

规则：此处**只保存跨模块用户选择的决策**。未经讨论的架构草案、源码推断与候选 API 均不得自动提升为冻结决定；所有产品实施另经后续正式收口。创建：2026-10-15。

> **当前工程状态补记**：D1–D9/HCM不变；E0_DESIGN_READY。2026-10-15用户已另行明确授权正式开发，R08=AUTHORIZED；实现基线main@5eb3bc765，同一任务分支P1 IN_PROGRESS。

## 当前实施分工（2026-10-17）

此安排替代此前由 Claude Code 组装后结束分支的执行分工，D1–D9 的架构与权限边界保持。

## D1 — 已冻结：选择方案 B（2026-10-15）

- **目标：Atria Native Orchestration V3**。不是围绕旧 SillyTavern 模式打补丁，也不是直接引入外部 Agent 框架替代主 Runtime。
- **策略：保留并重用 Atria 现有可靠基础**：纯状态机、Checkpoint/CAS/效果身份、并行、Graph/Result/Capability 和现有 Native 权威接口，经过后续核实后逐步清退旧工作流 adapter。
- **收敛方向**：统一原生执行内核。D1 曾提及“旧模式变为模板”，该部分已被 D2 直接否决：不保留旧模式、模板及兼容路径。
- **边界：无新增 World/Memory/Session/Project/模型调用收费权威**。Agent 的提案与正式事实严格分离；相应原有计划中的领域契约继续有效。
- **流程：讨论期间先更新并提交 `docs` 的同一份 Bundle，再进入后续轮次；本轮不修改 `main` 产品代码**。

## D2 — 已冻结：T2 Native Host + 旧编排零兼容硬切（2026-10-15）

1. **唯一控制者**：Node Native Host 持有 authoritative Run admission、Graph scheduling、checkpoint、Effect admission/receipt、cancel/resume/output 准入。Browser/桌面/手机 UI 只编辑非权威 Plan 草稿、发送显式命令和展示 Host 投影，不能再运行第二套有写权限的 Agent Runtime/IndexedDB Ledger。
2. **Plan**：作者 Definition 与不可变 PlanRevision/ExecutionSnapshot 固定 Graph、Agent/Tool/Route refs、capabilities、budgets、OutputContract；运行中动态 TaskGraphPatch 属于 Run，不修改已发布 Plan。
3. **Run**：Host-owned Run ID/owner/scope/原 source anchor、PlanRevision、epoch/generation、NodeAttempt、parent/child、GraphRevision、pending effects/approvals、result refs、status 与 durable ledger。并发写受 CAS/epoch/fencing 限制，迟到响应不能覆盖新状态。
4. 执行交给原 Native Port。
5. **Receipt**：EffectReceipt 只记录 effect 的真实/未知结果、外部 operation ID、来源/provenance、cost 与原 DomainCommitReceipt 引用；**不是 World/Studio/Memory 的正式业务提交本身**。未知已发送写入不可盲重试，不承诺外部系统 exactly-once。
6. **Result/Output**：ResultEnvelope 带 producer/attempt/source/currentness；OutputContract 限定最终输出 owner 与消费者。
7. **原生共用权威仍归原所有者**：NativeTaskScheduler 管活跃资源 permits，当前进程内 Map **不是** V3 持久 Run Ledger；SessionCore/RunControl 管 Session/预算/费用、Studio/Project Task 管正式工作、Model Runtime 管路由/Secret/发送、Memory/Actor 管可见性、MCP/A2A/Skill 管授权/外部协议、Experience 管评价。V3 不复制第二套账本或事务。
8. **删除旧编排模式和实现**：Single/Spec/Loop/Agenda/Director 五种产品模式、其运行驱动、mode adapters、legacy Generator/Workflow、旧配置/Presets、旧浏览器 checkpoint、capsule/takeover 作为编排主合同、旧 Workspace/Run Panel 和对应模式逻辑全部列入清退。**不迁移，不兼容，不双读双写，不留 fallback/shim，不把旧模式一一重命名成 V3 模板。** 仅限旧编排专属代码；共用 Native 逻辑先确认真实消费者再复用/抽离。
9. **新 UI**：重新设计 Graph Editor / Node-Agent-Edge Inspector / Capabilities / Route / Output / Run Graph / Timeline / Approval / Diagnostics；不保留旧模式选择器或旧交互入口，PC/移动使用相同 Host Contract。
10. **跨端/恢复**：Windows、CachyOS Linux、Android Termux 共用 Node Host 语义；页面离开不代表取消，Host 进程停止后重开方可 reconcile/恢复，source/branch/revision 与权限失效时停止过期发布；

## D3 — 已冻结：G2 有界动态图与控制流（2026-10-15）

1. **Graph 两层**：冻结的作者 `PlanRevision` 是不可变能力/结构/资源/输出约束；Host Run 保存可版本化 `TaskGraph`。`GraphPatch` 只修改本 Run 的可变任务图，不能变更已冻结 Plan、原 Native 来源事实或扩大 capability。
2. **受控动态 Patch**：Planner/Agent 只能提出**结构化候选**（新增合法任务/依赖、合法优先级调整、取消尚未执行任务、标记阻塞或请求结束等）。具体字段待实施冻结。
3. **Delegate/Handoff 分离**：Delegate 建立有来源、有子 Run/Attempt 的受限工作，父保留控制/结果所有权；Handoff 则在指定范围内转移当前工作阶段控制，必须声明入口/返回条件与输出权威。两者都不转移 Host Run authority；
4. **并行与 Join**：Fan-out 子任务身份和预算从父 Run 衍生，结果/取消/超时独立持久。`Join` 属于确定性 Host 屏障，而不是必须调用模型；支持 all-success、all-settled、any-success、count-quorum、deadline/best-effort 的**显式策略语义**，缺失、失败与 partial 不得冒充 complete。一次 Join 的成员/阈值与结算结果固定为 receipt；晚到结果不能改写已结算的 Join 或已发布正文。
5. **Planner/Judge/Review**：Planner 返回结构化 GraphPatch 请求；Judge 在合法证据/Result 引用范围作裁判而不是事实认证；Review 返回批准或指向具体受影响节点的重做请求。每次重做产生新的 NodeAttempt/EffectId，旧 receipt 保留，不重播无关有效步骤，已提交 World/Studio 操作不可因 Review 自动回滚。
6. **失败/恢复**：Run/GraphPatch/Effect/Join 在可恢复的耐久状态边界推进。可重试须证明未发出、幂等或由原 authority reconcile；已发送但结果未知不得盲重放，应记录 unknown/waiting_review/blocked 等可诊断出口。
7. **有界循环**：允许受控迭代/回环，但需显式 loop/edge visit 与任务/节点尝试/GraphPatch/replan/review/handoff/depth/并发/模型与本地计算/时间等上界，费用与授权复用原 Native Compute/RunControl。Host 防止无进展的相同提案无限循环；耗尽时区分 partial/blocked/budget_exhausted，不能假装达成最终目标。具体数值不在 D3 擅自固定。
8. **成本与 UX 方向**：普通 RP 在必要证据充分时保持确定性最小路径，不因 G2 自动插入 Planner、多个 Agent 和 Judge；复杂任务才按来源缺口与预算升级。全新 Graph Editor/Run Inspector 对 GraphRevision、Attempt、Join/Effect/Review、失败与权限只读投影，**不复活旧模式或旧前端**。
9. **权威不变**：继续遵守 D2 Host 单写入者，World/Session/Studio/Model/Memory/Skill/MCP/A2A 的已有领域 authority、权限、收费与正式事务不转移给编排。

## D4 — 已冻结：C2 Audience-scoped Context 与受控共享（2026-10-15）

1. **C2 为 V3 默认**：每个 Agent/NodeAttempt 的 Context 按 authenticated owner、实际任务、effective capability、原 Authority 决定的 audience（narrator/actor/task 等）及合法 source anchor **独立授权和编译**；不共享一份所有 Agent 可见的全局 Context，不在 Browser 建立另一编译权威。特别敏感的任务可收紧到严格隔离，但不得成为旧模式或第二 Runtime。
2. **唯一检索/编译链**：V3 通过现有 Native Host/Information/Context 适配和唯一 Hybrid Cognitive Memory 2.0 检索入口取得来源证据；遵守 HCM-01–08，**先划定可读 Source/Actor/Time/Branch 合法域，后 lexical/graph/vector 等检索，再由原 Context Compiler 做最终 target/visibility/freshness/token admission**；不新造 Memory/Graph/Source 或独立 Context Compiler 家族。
3. **权限不传播升级**：父 Run 的可见信息不是子 Agent 的自动许可；实际权限由原 owner、source grant、Information view、Plan capability/parent grant 的合法交集给出，**不是模型、提示词、Agent 自报 audience 或来源摘要自行授予**。
4. **信息语义四分**：World/Session 的正式 Truth，Actor 自身 Exposure/Belief/ToM，当前 Agent 的 Context Access，以及 player Display/Disclosure/Tool Action 都是不同权限面。Memory 命中、他者信念、NPC 猜测、摘要或 Judge 共识不能升级成 World Truth、Actor 正式记忆/愿望或业务操作权。
5. 公共证据可在同一有效授权域复用底层读取，但每位 Agent 的最终 Context 分别编译。Result 的来源依赖、producer/attempt、可信度与目标 audience/披露限制随派生摘要和 Join 结果传播；不可通过模型总结、文本改写、工具回传或缓存实现“洗白”私有资料。接收方无权限或缺完整 provenance 时拒绝、删去该项或按任务合同阻断，不泄漏其内容。
6. **Narrator 与 NPC 严格分域**：延续 HCM-02：默认 B（旁白/NPC 分离），作品可以在**原作者权限内**选择 A 限知或 C 自定义。旁白可读不等于允许向玩家揭示；严格保密需求应采用源级隔离/分阶段生成并测试，**不把提示词约束或模型自由文本审查说成绝对防泄漏**。
7. 不伪造统一 Revision。世界时间来自正式 World Tick/事件，不能用墙钟或对话时长代替。
8. **长会话与压缩**：保留原 Context lanes、required/atomic evidence groups、真实 token 计数和 source coverage；分级按需展开、允许有界压缩，但派生摘要不能覆盖源历史，需携带源链/版本/缺失说明，保护旧承诺、冲突证据和 Actor 秘密。必要事实装不下/来源不完整时显式 insufficient/blocked/review，不默默截断为错误事实。长上下文/Provider reasoning continuation 与普通 cache/Memory 不同，沿原 Model Routing 的有效性规则。
9. **复用与观测**：跨 Agent 的来源读取/只读索引可在**同一权限域及完整依赖有效性证明**下复用；缓存、工具输出、RunProjection、Trace、诊断与 Experience 均遵守信息作用域、脱敏和撤回规则，不保存 Secret/不透明思维链到公共轨迹。
10. **计算与既有权威**：Context/Hybrid 的可选 embedding/rerank/LLM/compaction 必须通过原 Native Compute/Task/Model send 许可，不因 C2 添加每 Agent 固定调用。HCM-03/04/05/08 的事件驱动认知、正式 World Tick、角色遗忘与稀疏调用保持不变；D4 不覆盖原 Memory/Behavior-Context/Information 详细契约。
11. **实现边界**：D4 是设计冻结，不是新 API/物理 Schema 或已经通过的功能；仍遵守 D1 原生 B、D2 T2 单 Native Host/零兼容硬切、D3 G2 动态图。

## D5 — 已冻结：F2 Evidence-driven Adaptive Compute（2026-10-15）

1. **稀疏调用**：先确定性状态/Source/有效产物复用，再根据真正证据缺口选择获准 Tool/Hybrid 检索/Model/Planner/Delegate/Judge/Review；普通 RP 以必要 Context 后一次主要 Narrator 为目标，不固定附加模型 Agent，也不引入每轮自我判断是否调用的 Meta-Agent。复杂任务可直接选择质量足够的目标，不强制 cheap→fail→strong。
2. **工作建议与资源权威分离**：Planner 提出 D3 GraphPatch/更多工作但不授权预算。Host 按 D4 Audience/source、任务质量/OutputContract、时限、任务能力、有效复用与原预算进行确定性 admission；模型不能改变权限、提升额度、直接调用未授权工具或把 cache miss 当作事实缺失的许可证。
3. **模型选择与 Fallback**：复用原 Native Model Routing/RouteResolver/GenerationService 的 Target/Connection/Model 及真实 capability/economics/health evidence。先排除不满足 Source 隐私/数据驻留、工具/schema/context、quality floor、deadline/预算的路径，再考虑费用/延迟/缓存局部性。FailurePolicy 与正常 Routing 区分；虚拟 gateway/alias 无法证明 canonical upstream 或全链路内部 retries。
4. **父子并行预算**：唯一费用真相归原 RunControl/Project Task/Host send Compute 账本。兄弟分支执行前在同一父授权 scope 下经 CAS/锁原子 reservation，真实发送按稳定身份 charge/settle/unknown/reconcile；多层预算引用一次实际计费，不双计。Run、Branch/Save 恢复、GraphPatch、取消、Retry 不恢复已花额度；跨 FS/SQL/业务 authority 不宣称无证据的全域原子事务。
5. **未知成本保守**：已发送但 usage 缺失、网关内部重试不可见的效果保留 unknown 与可执行上界占用，不视为零或自动退款；所有新发送（Judge/Review/Embedding/Rerank/Fallback/预热）仍准入。Token/request 限制不等于金额硬封顶；没有可信价格/网关 cap 则费用标 estimated，本地 CPU/GPU/电量仅计可观察成本。开发 API 测试执行约束归 Repository Governance §13.1及用户当前任务配置，不在 Plan 复制测试调用限额。
6. **三层 Cache 分离**：Application Reuse（Task/Tool/Plan/Source 经原 validity proof）、Provider Prompt Cache（精确 Adapter/Target/Gateway/prefix/billing/usage）、Local Inference Cache（真实 local backend KV/prefix）。不合并为一个 cache hit；跨 Actor/Branch/Narrator-NPC 隔离满足 D4 才能复用安全公共证据。已提交 World/Studio/外部不可逆写入不通过普通结果 cache 跳过或重放。
7. **Proof 与正文新鲜度**：先找候选再由原 authority/SourceAdapter 验 source/owner/Actor/时间/Branch/variant/producer/依赖/permission/Tool schema/target/output；撤回、Restore、权限变化时失效。RP 可复用获准 Context/事实/结构化 Task Intent，最终 Narrator 仍 fresh-generate；旧 Orchestrator 模式或旧模板不因结构复用恢复。
8. **Reasoning Continuity**：Provider opaque reasoning state、RunCheckpoint、Application Result Reuse 和 Prompt Cache 有不同身份/生命周期。只由原 Model Routing `7 与真实 Adapter evidence 判断保留/reset/discard；不能跨 Agent/Role/Audience、Provider、Model、Branch 或不匹配 Context/Tool/Output blind reuse，不将 chain-of-thought 纳入公共 Memory/Trace。
9. **可观测评价**：发送前记录触发/跳过理由、quality floor、source proof/ReuseDecision、route、实际 reservation 与估算；响应后记录真实 EffectReceipt/usage、unknown、cache read/write/observed、TTFT/E2E/费用、队列尾延迟与正式业务结果。正确性/Actor/Disclosure/玩家自主权与 Project 产物优先，之后比较调用、Token、实际费用、延迟、错误复用；estimated savings 与实际 charge 不混淆。无实测不宣称 SLO/模型收益或精确成本封顶。
10. **权威范围**：F2 的 V3 连接细则以 [adaptive-compute.md](adaptive-compute.md) 为唯一详细模块，原 Native [Compute Policy](../../architecture/agent-intelligence-runtime/compute-policy.md)、[Model Routing](../../architecture/agent-intelligence-runtime/model-routing.md)、[Execution Reuse](../../architecture/agent-intelligence-runtime/execution-reuse.md) 为各自领域详细权威。遵守 D1–D4、HCM-01–08、Native Host 唯一执行、旧编排零兼容硬切；此轮仅更新 `docs`，不改 `main`。

## D6 — 已冻结：S2 Native Effect Authorization Gate（2026-10-15）

1. **Host 的受控动作准入**：采用 S2。Tool/Skill/MCP/A2A 动作需按 **Discovery → 原 Capability Grant 与 Policy Ceiling → 精确参数/后果/外发风险 → 可信审批（如需）→ Durable EffectIntent → 原 Native Port → EffectReceipt/原 DomainCommitReceipt** 进行，不新增第二写入/计费/Secret/MCP 权威。Tool 名字在 allowlist 里或任务已有预算，不代表该具体操作获授权。
2. **发现与授予分离**：Tool Descriptor/annotations、Skill 指令、MCP metadata、A2A Card 与模型文本均为有限可信度的信息，不能自授权限；Owner、Author/Project/Session、Plan/Run、父子 Agent grants、目标工具/endpoint、原领域政策取合法交集。GraphPatch/Delegate/Handoff 不自动扩大 tool/schema/egress 权限。
3. **操作风险分级**：逻辑类别 R0 纯本地有界无副作用读取、R1 外部读取/数据外发/收费、R2 修改/可发布业务行为、R3 删除/不可逆/Host 代码/插件执行等高影响效果。**以实际 Effect 与参数后果划分风险**；名叫 read/preview 的隐藏收费/写入不能列 R0。已知窄域许可内 R0 可自动；R1 要有独立外发/服务/费用许可；R2 经原业务授权与要求的 review/approval；R3 默认无授权，只在实际领域可控且得到可信精确批准、具备原生保护时执行。具体 UI/物理枚举后议。
4. 模型宣称、Client 伪布尔值、Browser host.authorize、失效 Lease 均不构成人工批准；等待审批为可持久/可取消状态，期间控制面仍可响应；
5. **Secret 与数据外发**：SecretRef 由原 Host SecretPort 在发送边界按 owner+origin+Connection+用途解析，不进入 Agent Context、日志/回执/投影。**拥有 Context 的读权限不等于可以把私人 Actor/Narrator 内容发给外部服务**，D4 的 audience+Disclosure 与本次 external egress grant 分别成立。
6. **Prompt Injection / Skill 边界**：网页、外部工具响应、MCP Tool 描述、A2A 卡、Skill、Package/Plugin 内容、项目源码与第三方文档属于低信任输入，不允许改系统指令、能力列表、Tool schema、原业务 scope 或批准记录。Skill 是方法资料，不是 Code/Host 执行许可；
7. **跨协议持久效果**：EffectIntent 必须在副作用前以稳定 ID 持久登记，EffectReceipt 记录 sent/not-sent/confirmed/failed/stale/unknown、来源/原业务回执/审批信息。独立 `plugin:atria-mcp` 的 ActionRegistry/PolicyCeiling/Lease/Journal 归其外部客户端工具；V3 Host RunLedger 归内部编排，原 Native Session/Project/RunControl 归业务真值。身份可关联，不能互相复制成为第二个事实数据库。
8. **恢复不盲重发**：已发外部 MCP/A2A/正式写入而结果未知时使用原 operationId/taskId/status/DomainReceipt 查询与 reconciliation；不能仅因网络错误换 EffectId 重发非幂等动作。取消不等于远端 rollback 或退款；无法证明安全时保持 unknown/waiting_review/blocked。
9. **内置与独立 MCP 明确区分**：`main:src/native/mcp-service.js` 是受限外部数据消费端，工具名白名单不能证明 Tool 只读且当前记录偏进程内；`main:src/native/a2a-service.js` 有部分原 RunControl 持久任务身份/查询恢复；独立 [MCP 补强企划](../../plugin/atria-mcp-strengthening/index.md) 位于长期 `plugin`，对外 Codex/Claude Code 等的 Registry、审批、Journal 是另一层，不取代 V3 或 Native authority，不因为同时叫 MCP 便统一升级权限。
10. 继承 D1–D5、HCM-01–08、T2 Native Host、旧 Single/Spec/Agenda/Loop/Director/旧 UI 零兼容硬切；

## D7 — 已冻结：N2 分层叙事与条件质量回路（2026-10-15）

1. **同一编排内核、两个原生出口**：普通 RP/Native Game 的 Task 以正式 World/Command/Actor Evidence 与唯一 Narrator Final Body 为输出；共享 D2 Host、D3 Graph 和 D4–D6 安全/计算能力，不共享业务写入权限，不恢复旧五模式/模式模板或旧 Director takeover。
2. **职责分离**：Actor Identity 归原作者/Package；Actor Cognition 的 Belief/Exposure/Emotion/Intention/ToM/Memory/遗忘归原 Information/Cognition/Memory/事件与 World Tick；Narrative Intent 是有 Source/任务/版本/失效证明的**非权威当前剧情候选**，不创建第二个 World/Goal/Actor writer；Character Expression 独立管理角色口吻与行为表达；Narrator 依据正式事实/独立 Disclosure 提供当前回合唯一正文，不把规划/评审/意图当另一个正文 producer。
3. **反全知/信息隔离**：沿 HCM-02 默认 B Narrator/NPC 分离（作品可经原许可选严格 A/合法 C）、HCM-06 约束优先、D4 C2 audience 分别编译与 SourceRef/ResultRef 重新授权。旁白可知不等于玩家可见，NPC 不自动继承 Narrator 广视图；A 对 B 的 ToM 推测不是 B 真实心理。源级隔离可以证明未授权原文不进入请求，但宽 Context 的自由文本仍可能暗示/重述秘密，Prompt/模型 Judge 不能保证绝对无泄漏。
4. **玩家自主权**：玩家选择、受控角色的未授权行动/承诺/内心、正式玩家动作由实际用户请求与原 Domain Command 权威约束；Agent 不得代替玩家选择、无依据地制造行为或擅自写入游戏结果。合法已选择操作及权威已结算后果可以叙述。确定性写入防线与自由文本中“替玩家行动/决定情绪”的受审质量维度分层处理，后者不伪装成绝对形式化保证。
5. **条件多角色协作**：复杂事实冲突、重要多角色认知、必要剧情规划等可由 D3 Delegate/Join 选择性调用分角色 Agent；每个节点用真实 Actor/Task Audience，Join 不将私密认知洗白。普通 RP 以 F2 证据驱动的一次主要 Narrator 调用为目标，不强制 Planner/Judge/常驻多 Agent；世界事件与认知更新继续服从正式时间、来源、权限和实际预算。
6. **唯一叙事事实出口**：已提交 World Observation/Command Results/Events 的原事实优先于 Memory、Intent/Planner/Judge；中间建议不能提交状态、伪造 Receipt 或绕过 OutputContract/Display。V3 替换旧 Director/Spec/Agenda/Loop 的事件/正文注入机制，不提供迁移/双轨；实施仍需核查共享依赖并保证一次回合 exactly one authorized final body。
7. **Project Task/Review/Commit 分权**：保持 `src/native/project-agent-executor.js` 既有 human-review-before-formal-commit 边界；
8. 角色连续性、文笔/节奏、剧情因果、声音、新鲜度、作者偏好则以真实 Evidence/QualityProfile/人类反馈或标明来源的 Model Judge 审查。复用原 M1 Experience/Evaluation 的受审维度、case provenance、独立评测/校准/报告/费用，不能以模型评分代替 Host proof、正式业务结果或真人偏好。
9. 若存在有依据质量缺口/作者显式深审或高影响任务，再按 D5 预算决定 Judge、Review。Judge 给可追溯候选意见，Review 指向具体受影响的 NodeAttempt/Artifact；Host 按 D3 依赖失效闭包重算最小安全子图、保留旧 Receipt/费用，绝不因为修文笔而重复正式 World/Studio/外部不可逆 Effect，迭代有上限。
10. **原生作者/玩家体验**：创作者面向原生 Graph/Agent/Actor/Intent/Expression/Narrator/Output/Source/Quality/Review 编辑，Preview 与实际收费/写入不同权限面；玩家默认自然 Narrative Card/游戏决策，不必理解 Graph/Join。高级诊断只展示获准脱敏 Host Projection。Graph Editor 具体布局、组件/触控、审批与桌面/移动界面留 D8 冻结，**不复刻旧模式入口/旧 Run Panel**。
11. **边界和实际完成状态**：D7 详细义务与未来反例由 [narrative-project-quality.md](narrative-project-quality.md) 唯一管理。所有 HCM-01–08、D1–D6、单 Host、旧编排零兼容仍生效；

## D8 — 已冻结：U2 原生 Graph + Inspector 双向编辑（2026-10-15）

1. **U2 Authoring**：Desktop Canvas 可直接选/建/改节点及连接，并与精确 Inspector、Node/Edge 列表/表单双向操作同一个 PlanDraft；Undo/Redo、Draft 保存、冲突与未保存离开保护同步。Mobile/Termux 的 Node/Edge List + Bottom Sheet 拥有**完整编辑能力**，Graph 不得是唯一入口或只读手机降级版。
2. 错误能定位具体 Node/Edge/字段；画出连接不意味着合法、更不自动获得执行权限。
3. Run 另经 Host/Effect/权限/费用准入，运行期 GraphPatch 只读呈现，不能拖节点改变执行。
4. 付费/外发/写入 Preview 须展示真实后果并经 D5 Compute 与 D6 Effect Gate。发布 Plan 不等于已启动 Run/提交 World/Project。
5. **Timeline 优先是已定事实**：复用 [Serene Canvas 决策](../atria-serene-canvas/decisions.md) 已冻结的 **Agents Run Timeline 默认、Graph 切换、手机 Timeline + Bottom Sheet**。Host RunProjection 是唯一状态来源，两视图共享一份 RunId/TaskGraphRevision/NodeAttempt/EffectReceipt/Join/批准/费用 snapshot 与安全 delta；刷新/重连处理重复/乱序/旧 epoch，不由浏览器拥有执行器。
6. **Run Inspector / Diagnostics**：查看合法 SourceRefs/ResultRefs、GraphPatch/Join、模型实际 Usage/unknown、Effect/Approval、路由/预算不足、stale/blocked/reconciling 的原因及可安全恢复动作。Start/Stop/Resume/Retry/Approval 只能作为需 Host 回执的显式命令；取消不等于已回滚或已退款，Trace import/replay 为只读诊断，默认不重发任何副作用。输出需遵守 D4 数据最小披露，不泄露 Secret/opaque reasoning/NPC 私有资料。
7. **可信审批交互**：从 Timeline/Inspector/待办直接展示实际操作人、Target/Scope/Revision、规范化参数/差异/外发范围、风险和成本，Desktop 用受控审阅纸/Sheet、手机用 Bottom Sheet/全屏；
8. **继承 Serene Canvas**：沿已接受浅色温纸/实白工作纸/深墨/轻动效/悬浮 Dock、Atria ES Modules/DOM/CSS 和 Tokens/Primitives/Patterns；不建第二 Shell/全局主题/浏览器 Runtime，也不为了编辑器整体迁移 React/Tailwind。现有 Cytoscape 仅为备选；实际 Canvas/布局/键盘/触控/性能/许可经局部 PoC 后定，不能凭旧 SVG Graph Preview 宣称可编辑能力完备。
9. **PC/移动功能等价与无障碍**：桌面左资源/中 Graph/右 Inspector 的创作分工；Serene Canvas 的视觉细节权威不在本 Plan 复制。
10. **大图/长 Run 性能**：图节点分层/局部布局/虚拟化/搜索聚焦、长 Timeline 增量和按需 Trace 读取；长 Stream、审批/取消控制和响应动画分层，不以本轮冻结未实测的毫秒/千节点性能数字。
11. 零旧 Single/Spec/Agenda/Loop/Director 模式、旧 adapter/配置/预设/Run Panel 兼容。

## D9 — 已冻结：E1 内核先行、最终统一硬切（2026-10-15）

1. **冻结 E1 路线，不冒充 E0 完成**：采用先 Host Plan/RunLedger/Effect/Receipt 基础合同、后 G2 图与 Native Domain Ports、再 RP/Studio/Evolution 消费端和 U2 UI、**最后一次切换产品主路径并彻底清退旧代码**的同一产品任务分阶段模式。内部阶段是研发组织，不允许生产旧、新双执行器、永久兼容层或旧模式变 V3 模板。
3. 精确 Schema/Store/RPC 仍需 E0 实证冻结。
4. **Run 接口方向**：Host RunIdentity/RunLedger/Checkpoint/TaskGraphRevision/NodeAttempt、parent-child、Source/Session/Project real anchors、version/CAS/epoch/fencing、G2 GraphPatch/Join、取消/恢复/过期结果的可信状态。Scheduler 进程队列与旧 Browser IndexedDB 不等于持久 Host Ledger，Browser/Graph Editor 不得持第二运行权威。
5. **Effect/Receipt/Approval 方向**：外部/付费动作写前持久 EffectIntent，原 Host Tool/Model/MCP/A2A/业务 Port 操作，精确 capability/approval/budget/secret/egress 绑定，EffectReceipt 引用真实外部 ID/原 DomainCommitReceipt 与 actual/unknown usage。可能已发但结果未知时先 reconcile，不能盲重发、假称取消已撤回/退款或跨第三方 exactly-once。
6. **Result/Projection 方向**：带 Producer/Attempt/Source/Audience/Currentness 的 typed ResultEnvelope 和 OutputContract，Narrator 最终正文与 Studio Task/Review/正式 Commit 严格区别；Host RunProjection 只向有权客户端提供 snapshot+epoch/sequence delta、Timeline/Graph/Node/审批/Diagnostics 的脱敏视图，不能恢复或驱动 Run。
7. **优先替换** `capability-host.js`、`native/play-generation.js`、`native/experience/llm/*`、`atria-shell/workspace-host.js`、`settings-repo.js` 与 `src/native/agent-intelligence/evolution-targets.js` 等已发现活引用。保留非编排通用的 World/Session/Studio/Memory/Message Takeover/Skills/MCP/Compute/Serene Canvas 原生消费者，不能全目录盲删。
8. **正式阶段与工作包**：E0 完整审计后才可在用户新开工授权下建同一任务分支；P1 Host Contracts/持久化 → P2 Graph/Effect/Approval → P3 Native Context/Model/Tool/Budget Ports → P4 RP/Native Game/Studio/Evolution Consumers → P5 U2 Graph/Timeline/Approval UI → P6 Atomic Legacy Hard Cut → P8 集成收尾。每阶段的出口/可局部穿插范围与 W01–W09 工作流权威见 [implementation-plan.md](implementation-plan.md)。
11. **范围与最终状态**：D1–D8、HCM-01–08、T2 单 Host、D4 Actor/Source 分域、F2 Sparse 预算与三层 Cache、S2 Tool 授权、N2 原生质量、U2 Serene Canvas 视觉/Timeline 默认均为既有权威，D9 不另建第二套规则/服务。E0 的实际完成需后续追加有证据的 Record/接口结果，不能由冻结决定代替。

它们各司其职，不相互复制完整详细约束。

## 当前就绪与实施待证

E0设计核销、R项状态与未取得证据仅由 [e0-audit §11](e0-audit.md#11-r01r08-设计与实施证据分账) 管理。当前无已知开发前设计阻塞；用户本轮已明确授权正式开发，P1进行中。P1–P8实际代码/可靠性/预算/信息安全/质量/可信UI/三端/四Engine证据均不得因E0设计通过而改写为PASS。

D3–D8的产品细则仍各归原模块，物理接口增补归interface-contracts；图backend、性能阈值、Provider/Tool实际能力与质量收益在对应实施阶段实测，不再作为E0前置或新的产品方向选择。

## 明确不等价

- 「静态单测有测试案例」不等于「实际已通过」。
- 「浏览器 IndexedDB Checkpoint」不等于「Native 持久 Session/Task Ledger」。
- 「模型调用完成」不等于「正式游戏事件已提交」。
- 「外部 Agent/MCP/A2A 返回成功」不等于「Atria 权威状态已更新」。
- D1–D9 目前冻结的均为**设计/交接 Gate**，未修改 main、未创建实现分支；
