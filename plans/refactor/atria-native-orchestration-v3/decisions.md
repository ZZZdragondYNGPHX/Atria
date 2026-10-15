# 已冻结决定与待讨论事项

规则：此处**只保存跨模块用户选择的决策**。未经讨论的架构草案、源码推断与候选 API 均不得自动提升为冻结决定；所有产品实施另经后续正式收口。创建：2026-10-15。

## D1 — 已冻结：选择方案 B（2026-10-15）

- **目标：Atria Native Orchestration V3**。不是围绕旧 SillyTavern 模式打补丁，也不是直接引入外部 Agent 框架替代主 Runtime。
- **策略：保留并重用 Atria 现有可靠基础**：纯状态机、Checkpoint/CAS/效果身份、并行、Graph/Result/Capability 和现有 Native 权威接口，经过后续核实后逐步清退旧工作流 adapter。
- **收敛方向**：统一原生执行内核。D1 曾提及“旧模式变为模板”，该部分已被 D2 直接否决：不保留旧模式、模板及兼容路径。
- **边界：无新增 World/Memory/Session/Project/模型调用收费权威**。Agent 的提案与正式事实严格分离；相应原有计划中的领域契约继续有效。
- **流程：讨论期间先更新并提交 `docs` 的同一份 Bundle，再进入后续轮次；本轮不修改 `main` 产品代码**。
- **当前状态**：D1=B、D2=T2+零兼容硬切、D3=G2 有界动态图、D4=C2 Audience-scoped Context 均已冻结；D5 计算调度、物理 Schema、实施与验收尚未冻结。

## D2 — 已冻结：T2 Native Host + 旧编排零兼容硬切（2026-10-15）

1. **唯一控制者**：Node Native Host 持有 authoritative Run admission、Graph scheduling、checkpoint、Effect admission/receipt、cancel/resume/output 准入。Browser/桌面/手机 UI 只编辑非权威 Plan 草稿、发送显式命令和展示 Host 投影，不能再运行第二套有写权限的 Agent Runtime/IndexedDB Ledger。
2. **Plan**：作者 Definition 与不可变 PlanRevision/ExecutionSnapshot 固定 Graph、Agent/Tool/Route refs、capabilities、budgets、OutputContract；运行中动态 TaskGraphPatch 属于 Run，不修改已发布 Plan。
3. **Run**：Host-owned Run ID/owner/scope/原 source anchor、PlanRevision、epoch/generation、NodeAttempt、parent/child、GraphRevision、pending effects/approvals、result refs、status 与 durable ledger。并发写受 CAS/epoch/fencing 限制，迟到响应不能覆盖新状态。
4. **Effect**：模型、工具、Skill、MCP/A2A、委派、审批或正式业务命令的动作，在执行前持久注册稳定 EffectIntent，包括权限/source guard、输入摘要、预算 reservation、reconcile 策略；执行交给原 Native Port。
5. **Receipt**：EffectReceipt 只记录 effect 的真实/未知结果、外部 operation ID、来源/provenance、cost 与原 DomainCommitReceipt 引用；**不是 World/Studio/Memory 的正式业务提交本身**。未知已发送写入不可盲重试，不承诺外部系统 exactly-once。
6. **Result/Output**：ResultEnvelope 带 producer/attempt/source/currentness；OutputContract 限定最终输出 owner 与消费者。Judge/Planner/Agent 的建议不直接升级为世界事实，Narrative、Studio、Game Command 均须经原领域 authority 验证与提交。
7. **原生共用权威仍归原所有者**：NativeTaskScheduler 管活跃资源 permits，当前进程内 Map **不是** V3 持久 Run Ledger；SessionCore/RunControl 管 Session/预算/费用、Studio/Project Task 管正式工作、Model Runtime 管路由/Secret/发送、Memory/Actor 管可见性、MCP/A2A/Skill 管授权/外部协议、Experience 管评价。V3 不复制第二套账本或事务。
8. **删除旧编排模式和实现**：Single/Spec/Loop/Agenda/Director 五种产品模式、其运行驱动、mode adapters、legacy Generator/Workflow、旧配置/Presets、旧浏览器 checkpoint、capsule/takeover 作为编排主合同、旧 Workspace/Run Panel 和对应模式逻辑全部列入清退。**不迁移，不兼容，不双读双写，不留 fallback/shim，不把旧模式一一重命名成 V3 模板。** 仅限旧编排专属代码；共用 Native 逻辑先确认真实消费者再复用/抽离。
9. **新 UI**：重新设计 Graph Editor / Node-Agent-Edge Inspector / Capabilities / Route / Output / Run Graph / Timeline / Approval / Diagnostics；不保留旧模式选择器或旧交互入口，PC/移动使用相同 Host Contract。
10. **跨端/恢复**：Windows、CachyOS Linux、Android Termux 共用 Node Host 语义；页面离开不代表取消，Host 进程停止后重开方可 reconcile/恢复，source/branch/revision 与权限失效时停止过期发布；不假设系统唤醒、后台守护、跨设备同步或已做端侧验证。
11. **当前授权**：只是 docs 方案冻结，不授权现在删除产品代码，也不等于物理 Schema、D3 控制流、测试/客户端验收已定案。

## D3 — 已冻结：G2 有界动态图与控制流（2026-10-15）

1. **Graph 两层**：冻结的作者 `PlanRevision` 是不可变能力/结构/资源/输出约束；Host Run 保存可版本化 `TaskGraph`。`GraphPatch` 只修改本 Run 的可变任务图，不能变更已冻结 Plan、原 Native 来源事实或扩大 capability。
2. **受控动态 Patch**：Planner/Agent 只能提出**结构化候选**（新增合法任务/依赖、合法优先级调整、取消尚未执行任务、标记阻塞或请求结束等）。Host 对 GraphRevision 的 CAS、任务身份、依赖无环/显式 bounded cycle、可达终点、权限/作用域、额度和已在运行的 Effect 做**整补丁原子校验后提交或拒绝**，绝不允许模型直接写入图表；具体字段待实施冻结。
3. **Delegate/Handoff 分离**：Delegate 建立有来源、有子 Run/Attempt 的受限工作，父保留控制/结果所有权；Handoff 则在指定范围内转移当前工作阶段控制，必须声明入口/返回条件与输出权威。两者都不转移 Host Run authority；权限取交集而非扩权，子结果受 source/visibility 验证。
4. **并行与 Join**：Fan-out 子任务身份和预算从父 Run 衍生，结果/取消/超时独立持久。`Join` 属于确定性 Host 屏障，而不是必须调用模型；支持 all-success、all-settled、any-success、count-quorum、deadline/best-effort 的**显式策略语义**，缺失、失败与 partial 不得冒充 complete。一次 Join 的成员/阈值与结算结果固定为 receipt；晚到结果不能改写已结算的 Join 或已发布正文。
5. **Planner/Judge/Review**：Planner 返回结构化 GraphPatch 请求；Judge 在合法证据/Result 引用范围作裁判而不是事实认证；Review 返回批准或指向具体受影响节点的重做请求。Host 验证重做目标和依赖失效闭包；每次重做产生新的 NodeAttempt/EffectId，旧 receipt 保留，不重播无关有效步骤，已提交 World/Studio 操作不可因 Review 自动回滚。
6. **失败/恢复**：Run/GraphPatch/Effect/Join 在可恢复的耐久状态边界推进。可重试须证明未发出、幂等或由原 authority reconcile；已发送但结果未知不得盲重放，应记录 unknown/waiting_review/blocked 等可诊断出口。取消/版本失效/旧 epoch 与晚到结果均 fail-closed；重启重验 Session/Project/Actor/Source 和原预算，不能虚构跨外部系统 exactly-once。
7. **有界循环**：允许受控迭代/回环，但需显式 loop/edge visit 与任务/节点尝试/GraphPatch/replan/review/handoff/depth/并发/模型与本地计算/时间等上界，费用与授权复用原 Native Compute/RunControl。Host 防止无进展的相同提案无限循环；耗尽时区分 partial/blocked/budget_exhausted，不能假装达成最终目标。具体数值不在 D3 擅自固定。
8. **成本与 UX 方向**：普通 RP 在必要证据充分时保持确定性最小路径，不因 G2 自动插入 Planner、多个 Agent 和 Judge；复杂任务才按来源缺口与预算升级。全新 Graph Editor/Run Inspector 对 GraphRevision、Attempt、Join/Effect/Review、失败与权限只读投影，**不复活旧模式或旧前端**。
9. **权威不变**：继续遵守 D2 Host 单写入者，World/Session/Studio/Model/Memory/Skill/MCP/A2A 的已有领域 authority、权限、收费与正式事务不转移给编排。D3 只冻结语义边界与方向，物理表名/枚举/API 与端侧验收在实施阶段明确。

D3 各操作的详细方向、不变量与需要测试的失败窗口只由 [graph-control.md](graph-control.md) 管理，不在其他模块复制。

## D4 — 已冻结：C2 Audience-scoped Context 与受控共享（2026-10-15）

1. **C2 为 V3 默认**：每个 Agent/NodeAttempt 的 Context 按 authenticated owner、实际任务、effective capability、原 Authority 决定的 audience（narrator/actor/task 等）及合法 source anchor **独立授权和编译**；不共享一份所有 Agent 可见的全局 Context，不在 Browser 建立另一编译权威。特别敏感的任务可收紧到严格隔离，但不得成为旧模式或第二 Runtime。
2. **唯一检索/编译链**：V3 通过现有 Native Host/Information/Context 适配和唯一 Hybrid Cognitive Memory 2.0 检索入口取得来源证据；遵守 HCM-01–08，**先划定可读 Source/Actor/Time/Branch 合法域，后 lexical/graph/vector 等检索，再由原 Context Compiler 做最终 target/visibility/freshness/token admission**；不新造 Memory/Graph/Source 或独立 Context Compiler 家族。
3. **权限不传播升级**：父 Run 的可见信息不是子 Agent 的自动许可；Delegate/Handoff、Planner/Join/Review、跨 Tool/Skill/MCP/A2A 的 Result 消费都必须以接收者重新做 authority 授权与 source currentness 检查。实际权限由原 owner、source grant、Information view、Plan capability/parent grant 的合法交集给出，**不是模型、提示词、Agent 自报 audience 或来源摘要自行授予**。
4. **信息语义四分**：World/Session 的正式 Truth，Actor 自身 Exposure/Belief/ToM，当前 Agent 的 Context Access，以及 player Display/Disclosure/Tool Action 都是不同权限面。Memory 命中、他者信念、NPC 猜测、摘要或 Judge 共识不能升级成 World Truth、Actor 正式记忆/愿望或业务操作权。
5. **共享结构化 Result/SourceRef**：父子/并行分支默认只传任务必要字段与可核验引用；公共证据可在同一有效授权域复用底层读取，但每位 Agent 的最终 Context 分别编译。Result 的来源依赖、producer/attempt、可信度与目标 audience/披露限制随派生摘要和 Join 结果传播；不可通过模型总结、文本改写、工具回传或缓存实现“洗白”私有资料。接收方无权限或缺完整 provenance 时拒绝、删去该项或按任务合同阻断，不泄漏其内容。
6. **Narrator 与 NPC 严格分域**：延续 HCM-02：默认 B（旁白/NPC 分离），作品可以在**原作者权限内**选择 A 限知或 C 自定义。旁白可读不等于允许向玩家揭示；展示依原独立 Disclosure/view/字段 grant 检查，NPC 不继承宽 Narrator Context 或私人 reasoning。严格保密需求应采用源级隔离/分阶段生成并测试，**不把提示词约束或模型自由文本审查说成绝对防泄漏**。
7. **历史时点/Branch/失效**：普通 RP 使用其真实 chat/message/variant/hash scope，Native Session 使用原 Session/Branch/Revision/scope epoch，Project 使用原 Task/Project source；不伪造统一 Revision。世界时间来自正式 World Tick/事件，不能用墙钟或对话时长代替。Source 撤回、Actor 权限变动、branch fork/restore、variant 编辑、scope epoch 改变、回合取消/过期或异步晚到必须重新校验，跨作用域缓存/Join/摘要不得继续消费旧授权。
8. **长会话与压缩**：保留原 Context lanes、required/atomic evidence groups、真实 token 计数和 source coverage；分级按需展开、允许有界压缩，但派生摘要不能覆盖源历史，需携带源链/版本/缺失说明，保护旧承诺、冲突证据和 Actor 秘密。必要事实装不下/来源不完整时显式 insufficient/blocked/review，不默默截断为错误事实。长上下文/Provider reasoning continuation 与普通 cache/Memory 不同，沿原 Model Routing 的有效性规则。
9. **复用与观测**：跨 Agent 的来源读取/只读索引可在**同一权限域及完整依赖有效性证明**下复用；相同 query/hash/cache key/语义相似不构成跨 Actor/Branch/Narrator-NPC 复用凭据。缓存、工具输出、RunProjection、Trace、诊断与 Experience 均遵守信息作用域、脱敏和撤回规则，不保存 Secret/不透明思维链到公共轨迹。
10. **计算与既有权威**：Context/Hybrid 的可选 embedding/rerank/LLM/compaction 必须通过原 Native Compute/Task/Model send 许可，不因 C2 添加每 Agent 固定调用。HCM-03/04/05/08 的事件驱动认知、正式 World Tick、角色遗忘与稀疏调用保持不变；D4 不覆盖原 Memory/Behavior-Context/Information 详细契约。
11. **实现边界**：D4 是设计冻结，不是新 API/物理 Schema 或已经通过的功能；仍遵守 D1 原生 B、D2 T2 单 Native Host/零兼容硬切、D3 G2 动态图。详细接口/失效窗口/验收建议由 [context-sharing.md](context-sharing.md) 唯一管理。

## D5 — 第五轮待讨论

本轮将比较统一编排中的 Sparse/Adaptive Invocation 准入梯度、Model Routing 与 fallback/continuation、父子并行 reservation/charge、公平性、cache locality 与已完成 Task/Tool/Plan 的 validity-proof Reuse，明确 ordinary RP 的低成本路径与复杂任务的质量/成本/延迟权衡。此处**不冻结 D5 算法、阈值、价格或 SLO**。

## 后续未定（不要提前冻结）

- D3 已冻结的动态 Graph/Join/Review 方向见 [graph-control.md](graph-control.md)；物理字段、模型质量/真实成本收益和工程验收仍未确定。
- D4 Context/Hybrid/Actor/Source 的已冻结设计仅以 [context-sharing.md](context-sharing.md) 为准；物理字段、落地代码和实测收益尚未冻结。
- Adaptive Invocation/缓存/模型路由与并发预算 reservation。
- MCP/A2A/Skill/Web/Code 的权限、外部副作用幂等性和审批。
- RP 叙事质量、作者意图/防全知、自动编排粒度与 Eval。
- UX、跨平台客户端、可视化 Editor、诊断与正式验收/实施序列。

## 明确不等价

- 「静态单测有测试案例」不等于「实际已通过」。
- 「浏览器 IndexedDB Checkpoint」不等于「Native 持久 Session/Task Ledger」。
- 「模型调用完成」不等于「正式游戏事件已提交」。
- 「外部 Agent/MCP/A2A 返回成功」不等于「Atria 权威状态已更新」。
- D1–D4 已确认的**设计**不授权本轮修改 `main`、保留旧编排、伪造 UI/真机或真实模型测试通过。