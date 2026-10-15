# D9 E0 — Native Orchestration V3 旧消费者与审计阻塞的静态证据（E0 未通过）

> 2026-10-15 基于 `main@2686aa40a00c8bfccdc47c55d2b236b4878b022a` 的**远端定向静态审计**。**D9 已选 E1 并冻结路线，但本模块的 E0 全量依赖闭包、物理存储/权限/崩溃与三端真实验证仍 BLOCKED**。本文件只持有代码证据/未闭合项目，不再承担实施分期或验收合同：接口详见 [interface-contracts](interface-contracts.md)，阶段详见 [implementation-plan](implementation-plan.md)，验证详见 [acceptance-matrix](acceptance-matrix.md)。无产品代码修改或测试。

## 1. 必须保护的执行权威与明确缺口

| 当前源码证据 | 现有职责与已经看到的边界 | V3 候选实施任务 / E0 阻塞 |
| --- | --- | --- |
| `src/native/run-control.js`、`session-core.js`、`task-scheduler.js` | Native Session/Compute/正式事务与当前 Host 资源许可；Scheduler 队列主要是 process-local | 需要独立**Host-owned** Orchestration Run/NodeAttempt/GraphRevision Ledger；不能把 Scheduler Map 声称为已持久化 |
| `src/native/model-prompt-runtime/{route-resolver,generation-service}.js` | 原 Model Route/Provider send/Fallback 及 usage/charge 链 | V3 按 D5 接真实 route/receipt、原预算 reservation/unknown，不另建模型网关/账本 |
| `public/scripts/lib/agent-runtime/{runtime,state,contracts,parallel,durable-checkpoint-store}.js` | 已有纯状态机/效果与并行/检查点算法，但 `indexeddb-checkpoints.js` 位于 Browser 权威；`runtime.js` 对 legacyPolicy resume fail-closed | 区分能提炼为 Node/Host 纯函数的算法与 Browser 独占的执行入口；**新 Host Ledger 替代浏览器权威**，禁止双份 authoritative checkpoint |
| `public/scripts/lib/orchestration-engine/{graph,policy-controller,scheduler,...}.js` | 图验证/结果/能力与部分动态规划；`policy-controller.js` 仍按 `plan.source.mode === agenda` 等旧假设分支 | 重新做不含旧模式的强类型 Plan/GraphPatch/Join/Judge/Review 控制合同；不可原样搬运 mode 依赖 |
| `src/native/mcp-service.js`、`a2a-service.js`、`session-public-work.js`、`skill-invocation.js` | 内置受限远端 MCP 数据消费、A2A 有限远端 task identity、原 Skill 读与 Session Public Work | 对接 D6 Capability/EffectIntent/Approval/Receipt；逐端确认 external unknown/reconcile；不得混同独立 plugin MCP Server |
| `src/native/project-agent-executor.js`、`project-agent.js`、Studio Authority | Project Task/Workspace/候选工具/正式 Review；当前自动执行明确停在 human-review-before-formal-commit | V3 Project 只能产出受审候选，正式 Apply/Commit 仍由原 Native Studio/Task/用户批准管理 |
| `public/scripts/native/context-compiler.js`、Hybrid Memory/Information/Actor | 已存在有来源 Context Items、Audience/Disclosure 与唯一 Hybrid Recall 语义 | D4 按 Agent 单独编译 Context/ResultRef 复核；不新建 Memory 或事实/认知 writer |

以上是**定向证据**。P0 后仍需在真实代码 HEAD 上核对各域的物理 CAS/FS/SQLite、RPC/事件路由、独立权限/存储生命周期和所有生产消费者；没有完整 source-to-sink graph 就不能标记 E0 通过。

## 2. 旧代码彻底清退：已观察的跨域依赖

| 删除/替换候选 | 直接观察的引用/消费者 | E0 处置原则 |
| --- | --- | --- |
| `public/scripts/agents/orchestrator/main.js`、`index.js` 与约 87 项顶层旧模块/子目录 | `public/scripts/capability-host.js` 仍动态载入 `agents/orchestrator/index.js`、注册旧 `orchestrator` API；旧 `main.js` 注入聊天事件/配置/工作区与 Game API | 新 Native V3 API + Shell 绑定就绪后，一次性替换启动入口与事件监听；**不保留 shim/fallback**，删除旧 Orchestrator 特有代码和旧配置读取 |
| `agents/orchestrator/engine-v2/*`、`spec-runtime.js`、`agenda-runtime.js`、`loop-runtime.js`、`director-runtime.js`、`legacy-*` | mode-specific adapter、旧 Generator、legacy browser checkpoint、旧 fixed config/preset | 删除旧 Single/Spec/Agenda/Loop/Director 全套模式/执行桥；图/并行底层纯算法需按 D2/D3 重新审核后复用，不把旧 adapter 包装成新运行时 |
| `public/scripts/native/play-generation.js` | 通过 `orchestratorApi.getGameRuntimeMode` 判断 Director 或 Spec/Agenda/Loop 并选择运行路径 | 用原 Native Plan/Run/OutputConsumer 替换，不让包/普通 RP 保留旧 mode 协议 |
| `public/scripts/native/experience/index.js`、`experience/llm/{orchestrator-bridge,narrative,runtime}.js` | `createGameOrchestratorBridge`、`getOrchestrationMode` 和 Narrator/Director 分支是实际 Native Game 消费者 | 保留正式 World Observation/Command/唯一 Narrator Contract，移除旧 producer selection/guidance/takeover，把已有业务顺序接入 V3 Final Output |
| `public/scripts/agents/orchestrator/workspace/*`、`public/scripts/lib/agent-workspace/{presets,graph-view,...}.js` | 旧 mode/preset/host profile、旧 Panel、手写 bounded SVG preview | 全新 U2 Graph+Inspector 与 Runtime Timeline，旧 workspace/preset/UI 全删；通用 UI 组件先辨清独立消费者 |
| `public/scripts/atria-shell/workspace-host.js`、`product-search.js` | 主 Shell 仍动态 import 旧 `workspace/panel.js`；search 中含旧 workspace/preset 入口 | 保留 Serene Canvas Shell/导航/搜索与无障碍组件，替换为 Native V3 工作区路由；不可粗暴删除 Shell |
| `src/storage/repositories/settings-repo.js` | 当前在 `atri_capabilities.orchestrator.agentWorkspace` 上维护 CAS/`agentWorkspaceRevision` | 设计新的原生 PlanDefinition/PlanRevision 存储与业务 CAS；旧编排私有设置不迁移/双读，但不能误删同 SettingsRepo 的其它产品通用存储 |
| `src/native/agent-intelligence/evolution-targets.js` | **隐藏阻塞**：导入 `validatePresetLibrary`、`workspaceHostProfile`、workspace prompt/strategy versions，仍以 `Director` mode/preset 定位 Evolution 目标 | **必须在删除旧工作区前替换原 Experience/Evolution 的目标解析与权限约束**，转向合法新 Native Plan/Agent/质量目标；保留原 Experience/Eval/Promotion/Receipt 及真实 M1 消费语义，不能让旧模式死引用导致 Native 加载失败 |
| `public/scripts/message-takeover.js`、`public/scripts/events.js` 和相关通用事件 | `GENERATE_TAKEOVER_DISPATCH` 除旧 Director 外还是共享 Message Takeover 机制和测试/开发文档的对象 | 删除旧 Orchestrator 的 takeover 使用者，**不能在未核实其他消费者前删除共享事件/公共消息基础设施** |
| `tests/orchestrator/*`、`tests/agent-runtime/*`、`tests/game-runtime/llm-orchestrator-narrative.test.js`、`tests/frontend/agent-*.smoke.mjs` | 存在旧模式/旧 Run browser 路径与通用恢复/源隔离等混合测试 | 测试按真实新旧边界迁移：模式专项测试删除/替换 V3；仍有效的 Host/权限/恢复/World 防线保留并升级，**先补 V3 替代验证再彻底清旧测试** |

统计来自可检索的当前 main 目录与定向代码检索；`tests/orchestrator` 目录见 74 项、`tests/agent-runtime` 26 项（并非全部都需删除）；不能把列表/文件名当成确认完整的引用图。未来正式 E0 需按实际 imports、dynamic import、路由注册、设置读写和运行时客户端分别核实。

## 3. 待冻结的物理接口与唯一 Authority

| E0 合同 | 必须决定的语义 | 当前阻塞证据/待检查点 |
| --- | --- | --- |
| PlanDefinition/PlanRevision | Native schema/version、Draft CAS、typed Node/Port/Edge、正式 Published Snapshot、GraphPatch 的合法边界 | 不允许继续依赖旧 Preset mode / Workspace Host Profile |
| RunLedger/NodeAttempt/TaskGraphRevision | Host 持久、单写入 CAS/epoch/fencing、Parent/Child、RunCheckpoint、Restore/GC | 当前 Browser IndexedDB 与 NativeTaskScheduler 不是新的统一 Host Run |
| EffectIntent/Approval/EffectReceipt/Result | 写前持久、原业务 operation/charge refs、unknown reconcile、原领域事务确认、风险/批准绑定 | 当前 MCP read consumer 与 A2A task retry/reconnect 有不同可恢复能力；审批 UI 不可当业务权威 |
| Host RPC / Stream / Projection | Authenticated save/validate/publish/run/status/cancel/resume/approve，sequence/epoch/delta/snapshot、脱敏和权限 | 浏览器不能自行执行有副作用的 Agent Runtime 或保存新费用账本 |
| Compute/Model/Context/Memory | 原 Route/Provider/Task/RunControl 收费、Audience/source/currentness、Model fallback/Reuse | D4/D5 仅定义接入协议，不创造第二服务；父子预算要凭原 ledger 的一致性证明 |
| RP/Narrator 与 Studio Project Output | 玩家输入/World/Commit 先于 Narrator；Project Task/Review/Commit 原权威 | 旧 `orchestrationMode` 在多处 Client/LLM Consumer 真正分流，须完整切换；不可删 Project Agent 原人类 Review 门槛 |
| Serene Canvas UI / Domain Routing | U2 作者 Graph，运行 Timeline 默认、Graph toggle，移动列表+Sheet 功能等价 | 当前 Shell/搜索/旧编辑器/旧图渲染强引用需删除并替换；库/性能仍要局部 PoC |
| Evolution/Quality Target | Experience/Promotion 原来源与受审评分保持有效，新 V3 Plan/Agent 目标必须版本化、可权限核验 | `evolution-targets.js` 当前直接依赖旧 Director/Workspace Preset；是 E0 阻断项 |

**未定项**：Host Store 物理布局、API/Schema exact fields、退役消费者全部清单、数据目录清理范围、跨 Store 原子性策略、目标性能/失效恢复阈值。D1–D8 设计不能充当这些细节已验收/已实现的证据。

## 4. 首轮分期草案的来源与最终路线

早期 E0 静态调研提出过 P1–P8 候选，用于讨论而不是已经批准的实现阶段。**第九轮用户已正式选择 E1**，正式 E0 前置、P1–P8 阶段顺序、W01–W09 工作包与逐阶段出口现由 [implementation-plan.md](implementation-plan.md) **唯一**管理。本静态审计不能重新冻结另一份分期方案；其发现仍供后续 E0 消费者核对。

## 5. E0 静态证据等级与实际验证现状

本轮仅通过 GitHub 已查目录、关键源码与定向 code search 定位消费者；没有实际 Node/FS/SQLite/Browser/Windows/Linux/Termux 运行、故障注入、真实模型/Tool/Eval 与人工批准记录。故各验收矩阵项**在本轮均为 NOT_RUN/BLOCKED**，不能因为某旧测试文件存在就写 PASS。完整 L0–L4 定义、Graph/Effect/预算/Actor/质量/跨端矩阵及 P1–P8 Gate 统一见 [acceptance-matrix.md](acceptance-matrix.md)。E0 仍需根据当时最新产品 HEAD 补全引用闭包并核查真实 store/source/unknown 结果。

## 6. 当前 E0 阻塞清单（用户已选 E1，未解除阻塞）

- **B1（高优先）**：Native 持久 RunLedger/PlanAuthoring/Effect/Approval/Projection 的物理接口、CAS/恢复和原 Send 预算与 Subrun 限额交叉约束尚需精确源码/Schema/失败窗审查。
- **B2（高优先）**：旧 Orchestrator 除顶层目录外还有 Native Game Play、EvolutionTargets、SettingsRepo、AppShell 等**跨域活引用**；必须替换后再删除，不能用全目录 rm 构成“硬切完成”。
- **B3（高优先）**：Project Review/Commit、World/Actor/Memory、外部 MCP Server 与内置 Consumer、Serene Canvas 三端 UI 的写入/身份边界需真实消费者验证。
- **B4（高优先）**：未知外部副作用、用户可信审批、Provider/gateway usage 和跨 FS/SQLite 恢复没有 V3 验收证据；不准默认可重放/准确一次。
- **B5（待真实设备）**：Windows、CachyOS Linux、Termux 真实客户端权限/生命周期/键盘/触控/审批的矩阵与 CI 分层证据尚未收集。
- **B6（未定实现）**：Graph 渲染/编辑库、性能硬指标、具体 resource/Effect/Result physical schema、原旧预设不迁移时的精确数据清理规则。

第九轮已选择 **E1：Host 内核先行、单任务分阶段、最终统一硬切**；不允许恢复任何旧模式/数据/兼容层，也不能因为该选择就创建实现分支。E0 仍须补全上述 B1–B6 证据、跨域调用者/原生 Schema/权限/预算/崩溃与端侧检查，并在同一 Record 记录 Gate。具体开发分期与建分支条件统一由 [implementation-plan.md](implementation-plan.md) 冻结。