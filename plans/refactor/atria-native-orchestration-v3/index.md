# Atria Native Orchestration V3 — 智能体编排补强企划

> **唯一入口**。Task ID：`refactor/atria-native-orchestration-v3`。Primary Workspace：`main`（未来实现）；实现使用同一任务分支 `refactor/atria-native-orchestration-v3`，企划/Record继续在长期 `docs` 工作空间。规则只引用 [Repository Governance](../../../README.md)，不在本 Plan 复制执行规则。

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
| [implementation-plan.md](implementation-plan.md) | **D9 E1 正式路线**：E0 建分支前置、P1–P8 依赖/验收门槛、全域消费者硬切及工作包 | E0 审核、正式交接与实施期间 |
| [acceptance-matrix.md](acceptance-matrix.md) | **D9 冻结验收目标**：L0–L4、Graph/Effect/预算/安全/RP/Studio/UI 与三端真实客户端 Gate | 每阶段/最终收口与 Record 证据 |
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

D1–D8 的各模块继续拥有原语义与已冻结决策；**D9 的静态代码发现见 [e0-audit.md](e0-audit.md)，Plan/Run/Effect/Receipt/Projection 关键接口方向见 [interface-contracts.md](interface-contracts.md)，E1 实施阶段/前置审核唯一来源见 [implementation-plan.md](implementation-plan.md)，实际验收 Gate 唯一来源见 [acceptance-matrix.md](acceptance-matrix.md)**。其他 HCM、Agent Intelligence、Game Runtime、Serene Canvas、独立 MCP 的权威不复制。D9 设计冻结绝不等于 E0 引用闭包/用户实际开工授权。

## E1 正式开发审查入口（E0设计与授权分开）

必读本 `index.md` → [decisions.md](decisions.md) D9 → [e0-audit §11](e0-audit.md#11-r01r08-设计与实施证据分账) 当前设计核销 → [interface-contracts](interface-contracts.md) 物理合同 → [implementation-plan §2](implementation-plan.md#2-e0-设计门槛开发授权与实施验收三者分离) 独立Gate → [acceptance-matrix](acceptance-matrix.md) 实施后验证。开发前重核main delta及相关authority；真实consumer trace、故障/预算/审批和三端验证在各P阶段取得。未执行项目不写PASS；**当前已在任务分支开发，P7通过前不集成main**。

当前生效状态：**E0_DESIGN=DESIGN_READY；DEVELOPMENT_AUTHORIZATION=AUTHORIZED；P1/P2/P3=IN_PROGRESS；P4–P8=NOT_STARTED；P3阶段Gate及最终产品验收NOT_READY**。2026-10-16已按用户要求拉取同一远端任务分支，从`6865d0a08`恢复；第二十七组`5df345aee`补原RP管理写围栏（接口§17.37），第二十八组`2cf8c97d4`接原RP prefix Context/受信Model producer与原银行实际计费（接口§17.38）。同一Record保留此前三域原银行、真实GenerationHost稳定发送、Source/Effect/Context/Tool、父子Run、Binding、有限Session/Project producer与本次管理入口的实际子证据。先前暂停换机记录只保留为历史，不是当前停止要求。Hybrid/后台producer/Delegate资源交接及P4正式消费者仍待接；局部通过不等于完整领域授权/可信Review/三端通过。接口/并行前端入口见[backend-integration](backend-integration.md)，Gate见[acceptance §9.1](acceptance-matrix.md#91-p3后端子工作后的gate复核)，真实环境/剩余队列见同一Record最新组。不接真实付费或未授权外部mutation，未集成main。

2026-10-16第二十九组`0414b623e`完成原Session合法候选域/唯一Hybrid/原Context bank组合，见接口§17.39。RP Memory与外部retrieval仍待接；后台/Delegate及P4–P8队列和P3 NOT_READY不变。当前已从HANDOFF恢复持续开发，不更新旧中断快照。

第三十组`58ff31eeb`沿原ChatRepo/Engine状态完成RP Memory prefix候选域/唯一Hybrid/原context_build/send-consume复核，见接口§17.40。缺历史source ID明确原拒绝，无新ID或Session伪装。继续后台scope、Delegate/Handoff与P4–P8；P3仍NOT_READY。

第三十一组`4f96c7637`完成唯一原Scheduler父资源让出/child准入/父permit恢复及取消保护原语，见接口§17.41；仍未接正式Delegate producer/grant/Result，不能核销全P3。

第三十二组`cde07ac66`修复Memory新增consumer在最终bank await同事务合法撤销被回滚的问题，见接口§17.42；原Settings/sidecar事实提交后拒正文，真实费用保留。当前最新实现/验证归同一Record，继续后台scope/原bank producer、Delegate正式授权与P4–P8；P3 IN_PROGRESS / Gate NOT_READY未变。
