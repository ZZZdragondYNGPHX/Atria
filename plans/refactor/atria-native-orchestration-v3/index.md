# Atria Native Orchestration V3 — 智能体编排补强企划

> **唯一入口**。Task ID：`refactor/atria-native-orchestration-v3`。Primary Workspace：`main`（未来实现）；实现使用同一任务分支 `refactor/atria-native-orchestration-v3`，企划/Record继续在长期 `docs` 工作空间。规则只引用 [Repository Governance](../../../README.md)，不在本 Plan 复制执行规则。

2026-10-17 已恢复同一任务，源码本地最新 `d9d89ed33`（未推送），含真实有限 RP Judge、所选节点多 Route 隔离评测、Review/Attempt 同事务撤销保留修复、原图修订重建、显式静态 Agent DAG 和 Planner 有界重规划回路、发布图修订及 Planner→Agent 图组合及Host限定的动态Draft增补；Context附属检索Effect、原Profile pin及实际POST目标/冻结请求；§17.108–17.119 与同一 Record 第105–116组记录准确边界和测试。用户提供的测试 API 已在仓库外重建，按主站优先/失败备用，当前无调用硬上限。已消费换机 HANDOFF 删除；后端仍在实施，P1–P4及最终Gate NOT_READY，不进入前端、main 或结束分支。

最新后端实证：第九十四组 `1e1281224` 支持同一原 Session 内 Task/variant 专属 Binding 与 Narrator 的独立 Plan，范围见[接口 §17.98](interface-contracts.md#1798-原-session-内的-task-专属-plan-binding)和同一 Record。完整后端继续实施；此项不核销通用 Graph/Simulation/可信高风险消费者、恢复释放与最终 Gate。

第九十五组 `56cd1eee0` 接原 World Simulation pending appraisal 与 immutable Source/outbox历史闭包，见[接口 §17.99](interface-contracts.md#1799-原-world-simulation-appraisal-的来源闭包)。原job currentness、Actor采纳、费用未知、防重发/冷读取得有限FS/SQLite实证；其它Simulation profile、通用Graph、恢复/释放及可信高风险consumer继续实施，未宣称完整Gate通过。

第九十六组 `e434b42b2` 接原声明式固定命令/交互排期和精确 input-only Task Context，见[接口 §17.100](interface-contracts.md#17100-原声明式-task-命令交互与最小输入)与同一 Record。原 Simulation 静态命令可用，其原 interaction-job 拒绝保持；真实输入/采纳/费用/ACK闭包已有有限FS/SQLite证据，全部后端仍在继续。

第九十七组 `3a2f38361` 补同节点已发布 model pins 内的 routeRef 策略候选、原Project实际消费/Skill预算选择和隔离worker比较，见[接口 §17.101](interface-contracts.md#17101-同节点已声明-route-的原-plan-策略候选)。没有新Route/权限、异Model配置价格或自动晋升结论；RP/Session组合、完整Graph及恢复释放继续实施。

第九十八组 `767db55ac` 补原RP/Session Narrator/Resolver/后台Task的同节点备选Route，以及同一私有Plan selection驱动的Scheduler资源lanes，见[接口 §17.102](interface-contracts.md#17102-有限原消费者的-exact-node-route-选择)。有限消费者与RP worker已取FS/SQLite实证；完整后端仍继续，未推送或合main。

- 创建/调研日期：2026-10-15。
- 第一轮状态：**D1 已定案：方案 B（原生 Orchestration V3）**。
- 第二轮状态：**D2 已冻结：T2 Native Host 唯一运行权威、Plan/Run/Effect/Receipt 边界和旧编排零兼容硬切**。
- 当前开发基线：`main@695acf3bc`（2026-10-16 fetch核对，Storage Center UI已合入）；任务分支`7ab0abeec`完成此次main→任务同步。之前`main@73557f809`的原quota/recovery/transaction scope已在`0d799fc28`与V3 Owner/unknown语义组合，见[接口§17.8](interface-contracts.md#178-同步storage-center后的原权威组合)及同一Record。本次新增六个前端/浏览器测试文件，无后端合同重叠；UI功能不因合并自动计作V3验收。最初分支基线`5eb3bc765`的Settings/Themes适配仍归P4–P6；E0附件保留准确旧SHA，不冒充最新消费闭包。没有将V3集成回main。
- 第三轮状态：**D3 已冻结：G2 不可变 Plan + Host 受控动态图、Delegate/Handoff、Join、Planner/Judge/Review、局部重做、失败恢复与有界循环**。
- 第四轮状态：**D4 已冻结：C2 Audience-scoped Context；统一 Hybrid Recall，按 Actor/Source/Time/Branch 授权，跨 Agent 通过有来源 Result 引用分享，Disclosure 与长会话压缩独立校验**。
- 第五轮状态：**D5 已冻结：F2 Evidence-driven Adaptive Compute；按实际证据与任务质量选择性准入、原 Native Route/Compute 预算和三层缓存/执行复用**。
- 第六轮状态：**D6 已冻结：S2 Native Effect Authorization Gate；按实际动作/后果授权、分级审批、Secret/Egress 保护、Prompt Injection 隔离及持久 EffectIntent/Receipt 安全恢复**。
- 第七轮状态：**D7 已冻结：N2 分层叙事与条件质量回路，区分 Actor Cognition、Narrative Intent、Character Expression 与唯一 Narrator；反全知、玩家自主权、Project Review/Commit 和质量分层**。
- 第八轮状态：**D8 已冻结：U2 Graph Canvas + Inspector 双向编辑、原生 Plan Draft/Validate/Publish、运行 Timeline 默认/Graph 切换、Host RunProjection/Diagnostics、可信审批及 PC/移动等价编辑能力**。
- 第九轮状态：**D9=E1，E0_DESIGN_READY。用户已于2026-10-15明确授权正式开发；同一实现分支已从当时最新main建立，P1/P2/P3均有局部实证，完整Gate未通过。P1–P8产品证据逐组取得，未测项仍NOT_RUN/BLOCKED。**
- 文档性质：冻结设计与实施路由；开发已获授权。实际代码/测试/提交状态只归同一Record；最终验收通过后才集成main。
- 最新实现与前端分工（2026-10-16）：`refactor/atria-native-orchestration-v3@a7cb649d0`（含 `main@c57fada6e`）。第六十九组 `e82fde3a8` 补原生 Plan Prompt 的原存储候选/发布/回滚；第七十组补有限 RP / Project 原生隔离评测与原 Evolution 费用。用户已纠正提前交接：Codex 先完成全部后端，再推送并给 Claude Code 提示词，由 Claude 实施前端、组装及结束开发分支。当前仍在后端阶段，P1–P4/最终 Gate 仍 NOT_READY；已有接口或局部链路不构成后端完成。实际范围见 [backend-integration](backend-integration.md)，未集成 main。
- 当前续接状态（2026-10-16）：已 fetch 并安全快进源码 `a7cb649d0`、docs `81650b3b1`，保护本机无关未提交内容后恢复后端；换机 HANDOFF 已消费。第七十一组继续隔离 Review Origin 后端，见 [接口 §17.80](interface-contracts.md#1780-隔离-review-origin-后端与原用户再认证)。没有进入 Claude 前端阶段或集成 main，完整后端与最终 Gate 继续。
- 外部技术参照核对日期：2026-10-15；只对比模式和契约，不宣称框架直接兼容 Atria。

## 目标与现状

Atria 已具有 `public/scripts/lib/agent-runtime`（效果/状态机/Checkpoint/并行等）、`public/scripts/lib/orchestration-engine`（Graph/Controller/Judge/Synthesize）、`public/scripts/agents/orchestrator/engine-v2`（旧模式到新运行时的适配）和 `src/native`（原生 Session / RunControl / TaskScheduler / Resource / MCP / A2A 等）。问题不是从零发明 Agent，而是浏览器侧编排与 Native Authority 的职责交错、历史模式适配尚未退出、恢复/预算/写入/可组合性跨链路不一致。详情以 [代码基线](baseline.md) 为准。

**D1/D2 定案方向**：建设 Native Plan → Host Run/Graph → EffectIntent/Receipt → Result → Native Consumer。现有纯算法及 Native 基础可按需复用，**但彻底删除旧 Single/Spec/Loop/Agenda/Director 模式及旧编排执行代码，不转换为同名或等价 V3 模板，不保留旧配置和兼容层**。新 Graph/Agent 工作流及前端全部重新设计；D1 曾提出的旧模式模板化设想已由 D2 明确废止。

## 方案的业务边界

- 游戏世界的真实变更只交给已有 Native Session/World/Command/Authority；智能体的建议、推演、草稿不能直接成为正式事实。
- Session、Studio Project、普通 RP、Actor Cognition 与外部 Tool 有各自事实与权限域；编排必须用原权威的 source/branch/revision/receipts 复核，不自建第二套世界/记忆/模型收费权威。
- `Memory`、`Model Route`、`Skill`、`MCP/A2A`、`Experience/Eval` 作为受控 Port/Consumer 接入；权限不能仅靠 Prompt 声明。
- 普通 RP 保持稀疏计算目标：没有必要不强制启用多个模型 Agent；高价值任务允许在共享预算下按需升级。
- **跨平台已冻结**：Windows/CachyOS Linux/Android Termux 都由本地 Node Native Host 执行统一持久 Run/Effect 协议；Browser 只持有非权威编辑草稿、投影与用户命令，关闭网页不等于自动取消。Host 停机后需重启恢复，不声称系统级后台唤醒或跨设备同步。
- **旧编排硬切与新前端**：废弃旧 mode/adapter/generator/preset/settings/Browser Checkpoint/capsule/takeover 旧主合同及旧编排 UI，无迁移、双轨、fallback 或 shim。新 Graph Editor/Node Inspector/Run Timeline/Approval/Diagnostics 直连 V3 原生数据与 Host Projection；不复制旧 mode picker / Run Panel。不得误删别的 Native 业务仍需的共用服务。

## 文档模块图（同一份 Plan Bundle）

| 模块 | 唯一职责 | 阅读时机 |
| --- | --- | --- |
| [baseline.md](baseline.md) | `main` 相关源码入口、测试证据、风险与事实/推断区分 | 首轮/代码变更前核对 |
| [research.md](research.md) | 官方 Agent 框架/模式来源、适用性与不适用性 | 技术取舍变化时 |
| [architecture.md](architecture.md) | **D2 正式边界**：Host 运行权威、Plan/Run/Effect/Receipt、Native 复用、硬切与前端重构 | 所有后续轮次 |
| [graph-control.md](graph-control.md) | **D3 冻结**：动态图 Patch / GraphRevision、Delegate/Handoff、Join、Planner/Judge/Review、局部重做、失败恢复、循环控制 | 第三轮及后续图控制流 |
| [context-sharing.md](context-sharing.md) | **D4 冻结**：C2 按 Audience 编译、唯一 Hybrid Memory、Actor/Source/Time/Branch、Result/Disclosure、压缩/失效与验收 | 第四轮及后续 Context/Memory 接入 |
| [adaptive-compute.md](adaptive-compute.md) | **D5 冻结**：F2 稀疏/自适应调用、模型路由、并行父子额度/实际计费、三层缓存、Fallback/Continuation、质量成本评价 | 第五轮及后续 Compute/Model 接入 |
| [effect-authorization.md](effect-authorization.md) | **D6 冻结**：Tool/Skill/MCP/A2A 发现与能力授权、R0–R3 风险、可信审批、Secret/Egress、Prompt Injection、持久 Effect/未知恢复 | D6 与后续 Effect 安全接入 |
| [narrative-project-quality.md](narrative-project-quality.md) | **D7 冻结**：N2 原生 RP/Project 双出口、Actor/Intent/Narrator、反全知/玩家自主权、Judge/Review 与作者语义 | 第七轮及后续质量/创作消费者 |
| [graph-editor-experience.md](graph-editor-experience.md) | **D8 冻结**：U2 Graph+Inspector、强类型 Node/Edge、Plan Draft/Publish、Run Timeline/Projection、审批/Diagnostics、Serene Canvas/移动端与性能 | 前端 V3 Authoring 与 Run UX 设计权威 |
| [e0-audit.md](e0-audit.md) | **E0_DESIGN_READY**：§11是当前R01–R08设计/实施证据分账及核销；§1–10保留早期审计事实 | D9 E0 与实施方案讨论 |
| [e0-consumer-inventory.md](e0-consumer-inventory.md) / [e0-import-graph.md](e0-import-graph.md) | 最新 main 全仓逐文件/行号、151 文件清退 manifest、AST 直接/间接依赖及动态表达式证据附件；处置仍归 e0-audit | E0 / P6 引用闭包复核 |
| [interface-contracts.md](interface-contracts.md) | **物理合同 v1（设计冻结）**：6个编排metadata kinds及原Storage/RunControl域扩展；§12–16收束HostOwner/RP预算/Chat输出/ReviewOrigin/SQL未知；实证未通过 | E0 物理接口核查与实施 P1–P4 |
| [backend-integration.md](backend-integration.md) | 实际已挂载API、内部Host接口、前端并行任务整合边界与真实未交付项 | 跨任务整合/前端接入前 |
| [implementation-plan.md](implementation-plan.md) | **D9 E1 正式路线**：实施依赖、全域消费者硬切及工作包 | E0 审核、正式交接与实施期间 |
| [acceptance-matrix.md](acceptance-matrix.md) | 实施状态与既有结果 | 当前状态 |
| [decisions.md](decisions.md) | 仅跨模块的用户冻结决定、明确未定项 | 每轮先读、选择后更新 |

已存在的其他方案只是依赖，不复制详细契约：
- [Agent Intelligence Runtime](../../architecture/agent-intelligence-runtime/index.md)：Memory/Cognition、Experience/Eval/Evolution、Sparse Compute、Execution Reuse、Model Routing 的领域契约。
- [Game Runtime Architecture](../game-runtime-architecture/index.md)：World/Command 的唯一事实与写入边界。
- [独立 MCP 补强企划](../../plugin/atria-mcp-strengthening/index.md)（长期 `plugin` 工作空间）负责外部客户端到 Atria 的 Tool/Action Registry、Approval Lease、Operation Journal；V3 仅接原生受控 Port 和结果，不另建 MCP Server 或第二套产品权限。Native Visual/Media 同理引用自身现存领域 Authority。

## 轮次路线（建议，非提前冻结）

| 轮次 | 待讨论 | 预期产物 |
| --- | --- | --- |
| **1 已完成** | 代码基线、网络调研、A/B/C 方向 | D1 = B |
| **2 已完成** | 统一执行主权、职责边界、跨端原则及无兼容重构 | D2 = T2 + 硬切 |
| **3 已完成** | 动态图、Delegate/Handoff、并行 Join、Planner/Judge/Review、重试/失败/有界循环 | **D3 = G2 有界动态图** |
| **4 已完成** | Context/Hybrid Memory/Actor/Source 权限隔离与分级多 Agent 上下文共享 | **D4 = C2 Audience-scoped Context** |
| **5 已完成** | Sparse/Adaptive Invocation、Model Routing、并行预算、缓存与执行复用 | **D5 = F2 Evidence-driven Adaptive Compute** |
| **6 已完成** | Tool/Skill/MCP/A2A 能力授予、审批、危险副作用与跨协议恢复 | **D6 = S2 Native Effect Authorization Gate** |
| **7 已完成** | RP Narrator、Actor Cognition/防全知/玩家自主权、Project Agent、Judge/Review 与原生创作体验 | **D7 = N2 分层叙事与条件质量回路** |
| **8 已完成** | Graph+Inspector 双向编辑、原生 Plan 发布、Timeline/Diagnostics、可信审批与全端体验 | **D8 = U2** |
| **9 方案已冻结 / E0设计就绪** | R01–R07设计关闭，运行/故障/三端验收按P阶段取得 | **D9=E1；E0_DESIGN_READY，开发AUTHORIZED，P1 IN_PROGRESS** |

D1–D8 的各模块继续拥有原语义与已冻结决策；**D9 的静态代码发现见 [e0-audit.md](e0-audit.md)，Plan/Run/Effect/Receipt/Projection 关键接口方向见 [interface-contracts.md](interface-contracts.md)，E1 实施阶段/前置审核唯一来源见 [implementation-plan.md](implementation-plan.md)，实施状态见见 [acceptance-matrix.md](acceptance-matrix.md)**。其他 HCM、Agent Intelligence、Game Runtime、Serene Canvas、独立 MCP 的权威不复制。D9 设计冻结绝不等于 E0 引用闭包/用户实际开工授权。

## E1 正式开发审查入口（E0设计与授权分开）

当前生效状态：**E0_DESIGN=DESIGN_READY；DEVELOPMENT_AUTHORIZATION=AUTHORIZED；P1/P2/P3/P4=IN_PROGRESS；P5–P8=NOT_STARTED；P3阶段Gate及最终产品验收NOT_READY**。2026-10-16已按用户要求拉取同一远端任务分支，从`6865d0a08`恢复；第二十七组`5df345aee`补原RP管理写围栏（接口§17.37），第二十八组`2cf8c97d4`接原RP prefix Context/受信Model producer与原银行实际计费（接口§17.38）。同一Record保留此前三域原银行、真实GenerationHost稳定发送、Source/Effect/Context/Tool、父子Run、Binding、有限Session/Project producer与本次管理入口的实际子证据。先前暂停换机记录只保留为历史，不是当前停止要求。Hybrid/后台producer/Delegate资源交接及P4正式消费者仍待接；局部通过不等于完整领域授权/可信Review/三端通过。接口/并行前端入口见[backend-integration](backend-integration.md)，Gate见[acceptance §9.1](acceptance-matrix.md#91-p3后端子工作后的gate复核)，真实环境/剩余队列见同一Record最新组。不接真实付费或未授权外部mutation，未集成main。

2026-10-16第二十九组`0414b623e`完成原Session合法候选域/唯一Hybrid/原Context bank组合，见接口§17.39。RP Memory与外部retrieval仍待接；后台/Delegate及P4–P8队列和P3 NOT_READY不变。当前已从HANDOFF恢复持续开发，不更新旧中断快照。

第三十组`58ff31eeb`沿原ChatRepo/Engine状态完成RP Memory prefix候选域/唯一Hybrid/原context_build/send-consume复核，见接口§17.40。缺历史source ID明确原拒绝，无新ID或Session伪装。继续后台scope、Delegate/Handoff与P4–P8；P3仍NOT_READY。

第三十一组`4f96c7637`完成唯一原Scheduler父资源让出/child准入/父permit恢复及取消保护原语，见接口§17.41；仍未接正式Delegate producer/grant/Result，不能核销全P3。

第三十二组`cde07ac66`修复Memory新增consumer在最终bank await同事务合法撤销被回滚的问题，见接口§17.42；原Settings/sidecar事实提交后拒正文，真实费用保留。当前最新实现/验证归同一Record，继续后台scope/原bank producer、Delegate正式授权与P4–P8；P3 IN_PROGRESS / Gate NOT_READY未变。

第三十三组接入原pending outbox有限后台Model/Task Context/原bank与窗口、周期额度，见[接口§17.43](interface-contracts.md#1743-原pending-outbox后台model-producer与窗口周期额度)。原产物adoption与费用保留，不开放通用Graph/Run API或P4 OutputClaim/Result。用户要求本组完成后暂停换设备；最新已测/已推HEAD和下一工作以同一Record及HANDOFF为准，P3 Gate仍NOT_READY，未集成main。

2026-10-16已按当前指令fetch/fast-forward源码与docs并读HANDOFF恢复；历史暂停不再限制执行。第三十四组6bbc4c01f补原DelegateController耐久Handoff起始、单并发父逻辑槽让出和精确祖先收据验证，见[接口§17.44](interface-contracts.md#1744-耐久handoff起始与父逻辑槽让出)。继续有限Plan发布校验、真实领域producer与child Result/Audience/return闭包；没有将调度回调当正式完成。P3 IN_PROGRESS / Gate NOT_READY，未集成main。

第三十五组185cb7799补有限agent.delegate原Plan发布机制及单次闭包memo，见[接口§17.45](interface-contracts.md#1745-有限delegate发布机制与单次依赖闭包)。真实执行仍需原领域capture/grant、child输入编译和Result/Audience/return，不将发布成功当执行授权。继续已授权后端工作，P3 Gate NOT_READY。

第三十六组1afab4875/1543e859c补显式Result字节policy、严格record/envelope与最窄RP→父Attempt范围，见[接口§17.46](interface-contracts.md#1746-有界task-local-result物理合同)。用户启动Docker后本机相关SQL22项取得实际证据；完整矩阵和正式producer/Result写入与消费未通过，继续后端，未合main。

第三十七组补原Model实际wrapper的私有完成证明及原Run→Source元数据控制边界，见[接口§17.47](interface-contracts.md#1747-原model完成事实与同source元数据控制边界)。修复相同command锁逆序和末预算await期间同事务取消的过期证明；完成事实不替代Result/Audience授权。最新源码/实测范围归同一Record，继续实际RP child producer及正式Result/return，P3 Gate仍NOT_READY。

第三十八组2f22e9b63补三域原银行精确child费用闭包只读观察，见[接口§17.48](interface-contracts.md#1748-原银行精确child闭包观察)。原unknown/local/后代/释放ACK/真实overrun保持，兄弟工作不改变该子树摘要；观察不是完成授权。实际RP child/Context并行接线尚待下一组验证提交，P3 Gate仍NOT_READY。

第三十九组664749309接真实RP独立child capture/受限Context/Model/原bank，并修根银行与叶reservation的额度接线，见[接口§17.49](interface-contracts.md#1749-真实rp独立child-model与根银行叶额度边界)。内部明确pending_result无正文，不把物理permit返回当durable return；正式Result/Output/Audience/return继续实施，P3 Gate仍NOT_READY。

第四十组b4c06075a已接真实RP child Result publication，同原CAS写有界正文/发布收据/producer settlement，见[接口§17.50](interface-contracts.md#1750-真实rp-child-result发布与历史事实边界)。返回仅pending_output refs，原bank held、父waiting_child，output/return/正文消费仍IMPLEMENTATION_PENDING。第四十组当时按用户要求暂停，现已恢复；该历史事实及后续实际进度见同一Record；P3 Gate仍NOT_READY，未集成main。

第四十一组从最新远端第四十组b4c06075a恢复，接原Graph task-local output、独立原bank release/closed观察与严格OutputClaim/终结proof，见[接口§17.51](interface-contracts.md#1751-原graph-task-local-output与原银行闭包)。有明确费用闭包的child完成后返回pending_return；父仍waiting_child，durable return/父Result消费与continuation继续待接。当前恢复后持续实施，历史换设备暂停不作为限制；P3 Gate仍NOT_READY，未合main，真实提交与最小验证归同一Record第四十一组。

第四十二组接原Scheduler父permit实际重新取得后的耐久Handoff return（[接口§17.52](interface-contracts.md#1752-原父permit重新准入后的耐久handoff-return)），父原Attempt/input/grant保留，内部返回pending_continuation及returnReceiptRef。尚无父ResultPort/Context/实际Narrator continuation或正式Chat输出，下一步沿同真实parent callback接入，不能从metadata冷恢复scope。P3及最终Gate仍NOT_READY，未合main；实际源码归同一Record第四十二组。

第四十三组接原ResultPort精确父recipient、带来源建议Context与真实父Narrator continuation（接口§17.53）。父原Attempt/input/grant与根银行保留，内部成功返回父Model结果及delegation metadata；正式Chat输出/父Run终结尚待P4。用户明确要求持续至全阶段完成，继续所有已授权实现，不在分组检查点停工；最终Gate尚未通过，不合main。

第四十四组开始P4，接原RPControl输出WAL、单Chat正文+marker、一次性permit/只观察reconcile与原写路径marker保护（接口§17.54）。产品当前只prepare，真实Host Effect/Graph完成接线继续；P4=IN_PROGRESS，P3与最终Gate仍NOT_READY。

第四十五组接正式RP输出的原Host Effect/dispatch token与原bank rp_output计费（接口§17.55）；只有明确派发后才执行原单Chat提交，ACK未知只观察。domain committed与父Run completed继续分离，下一步Graph output owner/claim/严格完成证明；P4 IN_PROGRESS，最终Gate NOT_READY。

第四十六组补正式Narrator Result与原Graph output owner（接口§17.56）：producer完成→ResultRef→真实edge/traversal→output Attempt→正式Chat Effect，chat.output不再由agent持有。父Root仍待严格claim与原bank闭包，继续全部已授权阶段；Gate NOT_READY。

第四十七组完成有限RP正式output claim及父Root终结（接口§17.57），复用原bank精确Effect闭包；未知费用/receipt保持pending_output，历史证明不恢复scope。继续Session/Project/Evolution等完整消费者及P5–P8；P3/P4及最终Gate仍NOT_READY，未合main。

第四十八组为Native Session出口补原Scheduler finalization专用scope及原Turn一次交换（接口§17.58），运行态Model permit仍拒finalizing。只有底层原机制，Session Result/正式Effect/receipt/claim接线继续，P4/最终Gate未通过。

第四十九组补原Narrator输出quota与同原operation finalizer的身份绑定（接口§17.59），实际原银行证明输出凭据不能新发送或加扣计数，已发生费用保留。继续Context输出复读与Session完整出口；Gate未通过。

第五十组补原Native Session Context专用finalization复读（接口§17.60）：同原Narrator quota与实际finalizer绑定，继续拒运行态发送；原Memory/Binding/Source撤销保留合法事实和费用。产品Session完整出口仍待接入。第五十组当时按用户换对话要求暂停，现已恢复并继续既有授权；P1/P2/P3/P4 IN_PROGRESS，P5–P8 NOT_STARTED，最终Gate NOT_READY，未合main。

第五十一组0dcb97267已恢复后接入产品GenerationHost实际finalizer（接口§17.61）：原prepared对象一次私有绑定Narrator完成/Context，同原锁序复验Context/Model/银行后交唯一Session writer。合法末await撤权保留事实/费用；正式Session Result/Effect/DomainReceipt/OutputClaim继续实施。历史第五十组暂停不作为本次停止要求，P3/P4及最终Gate仍NOT_READY，未合main。

第五十二组bf7127f43补原Session Turn稳定commit与精确原领域收据（接口§17.62），原writer ACK未知只观察同操作，合法后续Source推进/冷读不恢复scope。Session正式Result/Graph output Effect/费用闭包/OutputClaim继续实施，P3/P4及最终Gate仍NOT_READY，未合main。

第五十三组f1261290f接显式有限Session正式Result/Graph output owner/原S2 Effect与原bank session_output（接口§17.63）。Result明确native_session来源与session_output audience，RP与Session消费者不混用；OutputClaim/Root终结继续实施。已恢复的HANDOFF暂停快照删除，历史事实保留同一Record，当前按用户要求持续至全阶段完成，不在分组提交后停工。

第五十四组fff849695接有限Session严格OutputClaim/原费用闭包/Root终结与冷读（接口§17.64），包括typed resolver和原selection复用。费用/Host receipt未知不签claim，合法post-commit撤权保留domain输出，原Effect稳定commit pin保护未知窗口。继续Project多轮/Task tools/Review、其余完整消费者及P5–P8；P3/P4及最终Gate仍NOT_READY，未合main。


第九十九组 00b893f1a 补控制节点 JSON/structured-output 与 graph.patch 的原 Host 发布机制证据，见[接口 §17.103](interface-contracts.md#17103-控制-model-与-graphpatch-的发布机制证据)。实际通用 Graph runtime 与完整后端仍在实施，发布成功不等于运行授权。


第一百组 739374b42 补原 Host Review 判定、局部重做/旧分支失效与元数据投影，见[接口 §17.104](interface-contracts.md#17104-review-耐久判定与局部重做控制)。真实控制 Model runtime 与完整后端继续实施。


第一百零一组 bcf5d65e8 接通原RP真实私有 Planner→受限GraphPatch→Narrator→唯一Chat输出及三Effect原费用闭包，见[接口 §17.105](interface-contracts.md#17105-原-rp-planner-的真实受控生产与费用闭包)。仍为显式有限profile，完整Graph/Judge/Review等后端继续，不推送或交前端/main。


第一百零二组 ea2359901 补同来源静态Graph直接后继的原Result audience/物理事实合同，见[接口 §17.106](interface-contracts.md#17106-同来源直接后继的-graph-result-合同)。真实Graph Result writer与消费仍在接线，完整后端继续。


第一百零三组 50d4061b5 接通原RP静态两Agent的受保护Result生产/消费、原Context与唯一Chat出口，见[接口 §17.107](interface-contracts.md#17107-原-rp-graph-result-的实际生产与消费)。撤权/取消/ACK/unknown与冷读有FS/SQLite实证，实际Review/Judge及完整后端继续。
