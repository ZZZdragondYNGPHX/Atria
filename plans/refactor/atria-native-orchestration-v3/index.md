# Atria Native Orchestration V3 — 智能体编排补强企划

> **唯一入口**。Task ID：`refactor/atria-native-orchestration-v3`。Primary Workspace：`main`（未来实现）；本轮仅更新长期 `docs` 工作空间。规则只引用 [Repository Governance](../../../README.md)，不在本 Plan 复制执行规则。

- 创建/调研日期：2026-10-15。
- 第一轮状态：**D1 已定案：方案 B（原生 Orchestration V3）**。
- 第二轮状态：**D2 已冻结：T2 Native Host 唯一运行权威、Plan/Run/Effect/Receipt 边界和旧编排零兼容硬切**。
- 代码审计基线：`main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`，基于远端相关源码与现有测试的静态审计；**没有运行代码、单测、CI、真机或 UI 测试**。
- 第三轮状态：**D3 已冻结：G2 不可变 Plan + Host 受控动态图、Delegate/Handoff、Join、Planner/Judge/Review、局部重做、失败恢复与有界循环**。
- 第四轮状态：**D4 已冻结：C2 Audience-scoped Context；统一 Hybrid Recall，按 Actor/Source/Time/Branch 授权，跨 Agent 通过有来源 Result 引用分享，Disclosure 与长会话压缩独立校验**。
- 第五轮状态：**D5 已冻结：F2 Evidence-driven Adaptive Compute；按实际证据与任务质量选择性准入、原 Native Route/Compute 预算和三层缓存/执行复用**。
- 第六轮状态：**D6 已冻结：S2 Native Effect Authorization Gate；按实际动作/后果授权、分级审批、Secret/Egress 保护、Prompt Injection 隔离及持久 EffectIntent/Receipt 安全恢复**。
- 第七轮状态：**D7 已冻结：N2 分层叙事与条件质量回路，区分 Actor Cognition、Narrative Intent、Character Expression 与唯一 Narrator；反全知、玩家自主权、Project Review/Commit 和质量分层**。
- 第八轮状态：**D8 已冻结：U2 Graph Canvas + Inspector 双向编辑、原生 Plan Draft/Validate/Publish、运行 Timeline 默认/Graph 切换、Host RunProjection/Diagnostics、可信审批及 PC/移动等价编辑能力**。
- 第九轮状态：**E0 初步定向静态审计已定位 Native Game、EvolutionTargets、SettingsRepo、Shell 等旧编排跨域消费者，详见 [e0-audit.md](e0-audit.md)；D9/E0 尚未完成全消费者/运行验证，实施计划未冻结**。
- 文档性质：设计与架构冻结阶段；本轮仅提交 `docs`，不建立实现分支、不修改 `main`，不宣称任何新实现已验证。
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
| [e0-audit.md](e0-audit.md) | **D9 E0 静态审计草案（非冻结）**：跨域依赖、旧代码清退风险、接口待定项、开发分期候选与三端验收矩阵 | D9 E0 与实施方案讨论 |
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
| **9 当前** | E0 接口/依赖审计、旧代码彻底清退、分阶段实现、故障/安全/质量/全端真实验收 | D9 待审计、未冻结 |

每轮先更新本 Bundle 中**对应模块**并提交 `docs`，再讨论后续轮次。D2 Host 权威见 [architecture.md](architecture.md)，D3 Graph 见 [graph-control.md](graph-control.md)，D4 Context/Memory 见 [context-sharing.md](context-sharing.md)，D5 Compute/Model 见 [adaptive-compute.md](adaptive-compute.md)，D6 Effect 授权见 [effect-authorization.md](effect-authorization.md)，D7 叙事/Project/质量见 [narrative-project-quality.md](narrative-project-quality.md)，**D8 UI 交互/Authoring/Run Inspector 的唯一详细模块见 [graph-editor-experience.md](graph-editor-experience.md)**。原 [Serene Canvas](../atria-serene-canvas/index.md) 继续拥有视觉设计系统和 Timeline 默认/Graph 切换的既有决定。D9 E0/实施分期尚待正式审计与选择。

## 第九轮 E0：审计与正式实施收口讨论入口

读取本 `index.md`、[decisions.md](decisions.md) D1–D8，锁定当时实际 `main`/`docs` HEAD；按当前问题选择 [architecture.md](architecture.md)、[graph-control.md](graph-control.md)、[context-sharing.md](context-sharing.md)、[adaptive-compute.md](adaptive-compute.md)、[effect-authorization.md](effect-authorization.md)、[narrative-project-quality.md](narrative-project-quality.md)、[graph-editor-experience.md](graph-editor-experience.md) 的相关段落。E0 要核查旧 Browser Orchestrator、mode adapters、Browser Checkpoint/旧 UI、Graph renderer、原 Native Session/RunControl/Studio/MCP 的实际引用与消费者，建立不兼容硬切的删除与保留清单、阶段依赖和真实验收矩阵。还须对照 [Serene Canvas](../atria-serene-canvas/index.md)、[独立 MCP 补强](../../plugin/atria-mcp-strengthening/index.md) 与原 HCM/Agent Intelligence 权威。**D9 目前只是讨论，未冻结或授权修改 main，不以静态扫描宣称完整代码审计结束**。

第九轮 E0 的已定位源码/消费者/风险和候选分期只见 [e0-audit.md](e0-audit.md)；当前属于静态初审，**非 D9 冻结、非 E0 完成、非开发许可**。此前 Serene Canvas 同一 docs 分支的其他作者并行提交必须继续保留，不得为了本 Plan 覆盖。
