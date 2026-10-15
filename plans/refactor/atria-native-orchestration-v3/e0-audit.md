# D9 E0 — Native Orchestration V3 工程审计（E0 BLOCKED）

> **当前结论（2026-10-15）**：最新只读基线 `main@60aca695726893e298b7d485f300c6efef3b79fd`。§1–7 为早期定向审计历史；本轮全仓证据及处置以 §8 起为准。静态取证范围已扩大，运行闭包、V3 持久化/安全和三端证据仍未通过，不得把审计文档完成改称 E0 PASS。

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

## 7. E1 设计提交后的开发交接审查增量（E0 仍未通过）

> 本节记录新一轮**真实源码证据**，不复述接口/阶段/验收详细规则；仍以 [interface-contracts](interface-contracts.md)、[implementation-plan](implementation-plan.md)、[acceptance-matrix](acceptance-matrix.md) 为唯一权威。核对产品源码基线为 `main@2686aa40a00c8bfccdc47c55d2b236b4878b022a`。无运行测试、无 main 变更、无实现分支。

| 审查项与实际文件 | 已发现的源码事实 | 开发前置结论 |
| --- | --- | --- |
| **FS Native Journal**：`src/storage/engines/fs-engine.js` + `fs-native-journal.js` | 当前 `FsEngine.withTransaction` 使用进程内按用户序列与 `FsNativeJournal`：针对**原生资源种类**写前准备`native-commit.journal`，commit 后按条目安装并在下次读取前执行 redo/recover。它不同于旧 `src/storage/README.md` 的粗略 FS 不具跨资源事务描述，也不等于跨进程/非原生资源全域原子性。 | E0 必须读取当前 Journal/Resource handlers 并跑崩溃注入：prepare、publish、部分 install、ACK、kill/restart、旧用户目录的恢复与多进程隔离。决定 V3 Run/Effect/Approval 如何使用受支持 Native keys 并证明 write-before-effect。**当前无法宣称通过**。 |
| **SQLite 配置与旧文档差异**：`src/storage/engines/sqlite-engine.js` | 当前代码明确使用 `journal_mode=WAL`、`synchronous=FULL`、`BEGIN IMMEDIATE/COMMIT/ROLLBACK` 与 per-handle tail；旧 `src/storage/README.md` 的 `synchronous=NORMAL` 已与最新源码冲突，**以实际代码为准**。 | E0 精确验证 SQLite CAS/Lock、掉电窗口与原 RunControl/Project/Effect 交叉事务；不能因为打开 WAL/FULL 就跳过负例/数据损坏验收。 |
| **四种存储模式与 Resource Key**：`src/native/contracts.js`、`src/storage/engines/native-resource-key.js`、各 FS/SQLite/MySQL/Pg Engine | Native Resource 种类和 Key fields 受 `NATIVE_RESOURCE_KINDS` / `RESOURCE_KEY_SPECS` 封闭校验；产品同时暴露 FS、SQLite、MySQL、Postgres Engine 与共用 Repo API。 | 选择新 Plan/Run/Effect/Approval 是新 `kind`、复用受管 `versionedJsonResource` 还是其它原生存储 contract，必须在 E0 固定、核对 migrations/dump/restore/delete/GC 与实际支持的四 Engine；如本轮只做本地三端，也须明确其它已支持模式的稳定退化/排除范围，不能默默破坏已有产品配置。 |
| **现有 RuntimeCheckpointStore 是另一用途**：`src/native/model-prompt-runtime/runtime-checkpoint-store.js` | 当前有原生持久的**Provider/Model Reasoning Continuity** 私有 Checkpoint，带受限 binding/TTL/容量、源身份检验；这与长期 Orchestration RunLedger 的节点/GraphPatch/EffectIntent/审批/Receipt/GC 生命周期**不等价**。 | 只能复用已证实的存储/密封/Source 校验技巧；**不得把该模型续接 Checkpoint 直接改名为 V3 RunLedger**，更不能暴露私有不透明 reasoning 给 UI Trace。 |
| **原预算/Charge identity**：`src/native/run-control.js` | `RunControl.charge`、`chargeCompute`、`chargeLocalWork`、`settleCompute` 以 Session/Revision/attempt 在原 Native Repository 执行有约束收支，正式 send 前先 charge、未知发送不退款；`project-task-repository.js` 属于独立 Project task。 | W02/W04 必须证明父 Run/子 Agent/并行 siblings 可对同一原预算获得原子**预留**、唯一真实 charge/unknown/reconcile；Session 和 Project 两类源的原权威不能被第二套 V3 费用账本替代。现有 API **不等于**全部跨父子 reservation 已实现。 |
| **NativeTaskScheduler 是活跃投影**：`src/native/task-scheduler.js` | 有进程内 queue/running/operations、per-resource 许可、请求超时/重试与 cancel；不带一个完整持久化的 V3 Graph/Effect Run 账本。 | W02/W03 用现有 permits，但 Host RunLedger 承担独立持久恢复；不得因为 scheduler 有 operationId 就认为 crash 后可安全补发 Tool。 |
| **Evolution 隐藏硬依赖**：`src/native/agent-intelligence/evolution-targets.js`、`evolution-service.js`、`src/storage/repositories/settings-repo.js` | `EvolutionTargets` 的 catalog/capture/prepare/check/write/discard/publicationCurrent/evaluationSettings 多处按旧 `workspace-prompt`/`workspace-strategy` 和 `boundedDirector`/Preset/Binds 访问；原 SettingsRepo 还以 `agentWorkspaceRevision` 做 CAS，Evolution Service 以这些正式结果处理 source/target/publication。 | W01/W07 **必须先替换整个旧目标生命周期和审批/Publication/rollback/用户来源的消费者**，不能只删除一处 import；沿原 Experience/Eval/Rubric/Target/Receipt 保留已证实的有效业务数据语义，但不迁移或兼容旧 Orchestrator 配置。严格检查 orphan 引用、dead module 与真实新 Target 的保留/发布资格。 |
| **旧 Native Game 与 Shell 活入口**：`public/scripts/capability-host.js`、`native/play-generation.js`、`native/experience/index.js`、`experience/llm/narrative.js`、`atria-shell/workspace-host.js` | 仍加载 Browser Orchestrator，按 Director/Spec/Agenda/Loop 决定 Game Guidance/Final Prose/RunPanel；旧 `message-takeover.js` 也存在共享消费者。 | W06/W08/P6 要有完整直接/动态 import、启动/设置、Chat 事件/多平台真实消费者与精确替代路径清单；删**旧编排用途**，不误删正式 Native Game/Message/Serene Canvas 共享能力。 |
| **旧测试资产不能一刀切**：`tests/orchestrator/*`、`tests/agent-runtime/*`、`tests/game-runtime/*`、`tests/frontend/*` | 部分是旧 modes/workspace/Browser Checkpoint；另有 World/Source/Recovery/Graph 断言仍有新内核适用价值。 | 清退旧模式专属测试并以新 V3 高风险反例替换；保留/升级仍属 World/Session/Memory/Project 的测试；真实 L1/L2/L3 运行结果在测试阶段再记录。 |

### 7.1 当前工程就绪判断

- **D9 设计和 E1 路线**：FROZEN（仅 Plan 选择）。
- **E0 全消费者引用闭包**：BLOCKED — 目录/Code Search 有真实命中，但尚未做全量 Source→Sink、动态导入和所有设置/API 的严格映射。
- **P1 物理 Store/RunLedger/Effect/Approval API**：BLOCKED — Native FS redo/SQLite FULL 有可复用基础，跨所有已支持 Store/多进程、收费和外部 unknown 未完成物理设计/故障证据。
- **W07 Evolution/旧 Preset/Settings 清退**：BLOCKED — 旧 Target 的多个生命周期方法需逐一替换并确认原出版/纠错/回滚业务继续有效。
- **L1/L2/L3/L4、三端及实际安全/质量**：NOT_RUN/BLOCKED — 尚无本轮测试实证、设备/受控授权/外部凭据与基线信息。
- **工作分支创建**：NOT_AUTHORIZED — 当前用户明确禁止收口前创建，故不得因为 E1 已定就开始实现。

**下一可执行工作仍是 E0 docs 审计补证**：按 [implementation-plan.md](implementation-plan.md) 的 W01/W02/W07 优先、再 W03–W09 核对原生接口和完整消费者；所有门槛成立且获得用户明确正式开工授权后，才可建立产品任务分支。`docs:HANDOFF.md` 不因本次普通开发就绪审查而创建。

## 8. 最新 main 全仓审计与零兼容处置矩阵

本轮先核对 clean `main`、fetch `origin/main`，两者同为 `60aca695726893e298b7d485f300c6efef3b79fd`；不 checkout、修改或执行产品模块。用 Git tracked 全集扫描 3,949 文件、3,556 选中文本；Acorn 解析 2,886 JS/MJS/CJS，0 解析失败，11,053 本地字面路径边，452 条根外直达旧四根的边（含测试），反向传递闭包 1,152 文件。数字是解析器的覆盖统计，不是 1,152 个生产消费者，也不是运行证明。

- [逐文件/行号/四根 151 文件 manifest](e0-consumer-inventory.md)：包含源码、API、设置、脚本、测试、产品开发文档和资产命中。
- [AST 直接边/间接消费者/计算动态加载点](e0-import-graph.md)：补足多行静态导入、export、dynamic import、require、Worker/URL。240 个非字面表达式中也包括普通网络 URL 和 Worker(new URL(...)) 包装，不全是未解析模块；实际模块边需按下表区分。
- 不能静态证明的第三方安装代码、计算属性 API、运行时插件注册不在已证明闭包内。P6 必须补真实 boot、导航、设置、评测和注册 trace；当前为 `BLOCKED`，绝不声称“穷尽运行消费者”。

| ID / 源→真实 sink | 证据与处置（未来实施，本轮未删除） | 工作包 / 替代验证 |
| --- | --- | --- |
| C01 Boot/API | `capability-host.js:18,30,84` → `orchestrator/index.js` → `main.js:147`。删除旧 capability 名及 retained settings；新 Host client 独立注册 V3，不保留旧名重导出。旧 API 包含 delegated run、memory recall、Game mode/guidance/director、checkpoint list/cancel、run observation、tool bridge、preset bindings、prompt/strategy candidates、skill export，全部终止旧协议。 | W01/W06；boot 只注册新 API，调用旧名失败，无静默 fallback |
| C02 Native Play | `public/script.js:7478` → generation-controller host options → `play-generation.js:75–91` → 旧 Game APIs。替换整个普通 Native generation 分流；保留用户输入提交、persist、quiet/impersonate、唯一 assistant commit 的原语义。Package Turn 优先分支和 free-text Game 分支不能被误删。 | W06；分别测普通 RP、Native Session、Package Turn、Game logic、continue/regenerate/abort |
| C03 Native Game LLM | `experience/index.js` 创建/重写 bridge → `llm/runtime.js` mode → `narrative.js` producer → `orchestrator-bridge.js`。删除桥与 Director/Guidance 分流；同步清理 `roles.js`、`turn-context.js` 的旧 guidance 字段和 `turn-controller.js` 旧阶段用途。保留 World/Journal 前后 hash/正式 Command/唯一 Narrator/已提交后果防线。 | W06；正常回合与 rewrite 都不能多发正文或修改世界 |
| C04 Shell/Search | `workspace-host.js:195` 动态载 Panel，旧 `orchestration:<presetId>` detail、commands；`product-search.js:27` 直接读 settings。用 V3 Plan list/detail 与 Host Projection 替换；更新 app-shell、navigation-authority、localization 和 CSS 中旧入口。Shell/Memory 页保留，不保留旧 preset ID 路由别名。 | W08；搜索、deep link、history/back、hub、移动导航真实观察 |
| C05 Settings/API | `public/script.js:15934` → `src/endpoints/settings.js:327` → SettingsRepo guard/patch/updateWorkspace。删除 `expectedWorkspaceRevision`、agentWorkspace CAS 和旧配置专属逻辑；通用 settings save/patch/read-only/conflict 继续存在。新 Plan 由独立原生资源存储，禁止塞回旧设置字段。 | W01；旧 payload 不能重新写入旧配置，其他设置不丢失 |
| C06 Evolution Target 生命周期 | `evolution-service.js` → EvolutionTargets 的 authorize/library/rpPreset/catalog/capture/prepare/check/publicationCurrent/write/discard/evaluationSettings。删 `workspace-prompt/workspace-strategy`、Director/boundedDirector 和 preset binding 目标；改为 exact Native Plan/Agent revision 的受控候选，原 Skill/Project Prompt/Project Strategy 目标保留原权限。旧目标未完成 job 不得自动映射新目标或继续 publish/rollback。 | W07；目录/捕获/候选/评估/发布/回滚/丢弃/冲突逐方法覆盖 |
| C07 **新发现：Evaluation 执行及指纹** | `evaluation/adapters.js:6,8` 直接导入 Director + run-state；`worker.js:20` 动态 import Skill Resolver；`evolution-evaluator.js:22,28` 把旧文件内容纳入 evaluator revision。必须替换 RP adapter、隔离 worker 前置加载、指纹输入及 `evaluationSettings.rpProfile`。保留原 evaluator/报告/provenance/付费发送/Promotion 权威，旧报告只作为历史证据，不因代码更新重新授予 publish。 | W07；新 evaluator fingerprint、旧 report ineligible、parent Host 唯一 send、无旧代码载入 |
| C08 **新发现：Memory 共用 helper** | AST 确认 `memory/schema-iteration/studio.js:73` 导入旧 `iter-studio/edit-tool-result-envelope.js`，并非仅注释。`memory/orchestrator-tools.js:2` 导入 host-ports。先将仍必要的纯 envelope helper 放入既有 iteration-library；旧 tool registration 删除，Memory/Hybrid/Information 正式服务保留。禁止把 Browser Memory write tool 原样赋给 Host Agent。 | W03/W04；Memory 编辑和 schema iteration 仍工作，Actor/Source guard 不退化 |
| C09 Prepared Context 共用 | `generate-task.js:1` → `agent-runtime/prepared-context.js`；旧运行器目录不能盲删。审查其 contracts 依赖后抽到现有 Context 共用层，更新消费者和 source-currentness 测试；不保留整个旧 Browser Runtime 作为 helper 容器。 | W03/W04；普通生成、exact token/context 合同与 prepared proof |
| C10 Search/Memory Tool 注册 | `extensions/search-tools/main.js` 和 `agents/memory/main.js` 调用各自 `register*OrchestrationTools()`，通过字符串 capability 获取旧 registry。删除旧注册调用与旧 adapters，Search/Memory 各自功能和 API 保留；新 Host Tool descriptor/Port 使用原 Native 搜索/Hybrid 能力。 | W04/W05；boot 不访问旧 registry，原搜索/Memory 正反例 |
| C11 **新发现：Skill scope/携带链** | `skills/{api,scope-picker,skill-manager-panel,skill-editor,embed-export-hook,embed-lifecycle,embed-import-dialog}.js`、`public/shared/skill-invocation.js`、`src/skills/{scope,repository}.js` 有 `orch-preset` 与 mode 目录/优先级/rename/import/export/cascade-delete。删除旧 scope 分支和旧事件 hook、旧 preset embed/export；不迁移为 Plan scope，不误删 global/project/package/character 合法 Skill。 | W01/W05；旧 scope 请求拒绝，其他 scope pin/read/version/rollback 完整 |
| C12 旧四根 | manifest 151 文件是逐路径清退全集；旧 runner/mode adapters/graph controller/UI/presets/trace/checkpoint/样式退出。纯算法复用必须重新归属 Native 内核或现有共用库并删旧依赖，禁止旧路径 forwarding/shim。 | W03/W09；AST 零旧根生产边，旧根路径不再提供执行模块 |
| C13 资产/国际化/检查脚本 | `default/skills/global/director-dispatch-protocol-zh`、旧 skill chips/优化用例、locale/Runtime UI 中 Director mode 标签、logging ownership、`check-native-product-localization.mjs`、`check-p4-native-generation.mjs`、`check-atria-workspace-ui.sh`、`check-plugin-imports.js` 中旧路径。删旧专属资产/字段，更新工具目标，避免检查脚本依赖已删文件。 | W08/W09；无旧产品入口/资源；locale/checker 仍覆盖新界面 |
| C14 原生 `role.orchestrator` 并不自动等于旧模式 | `src/native/contracts.js`、generation-host.executionPreflight、Runtime Route roles、context-derived producers、Project package `orchestration` JSON 元数据须按具体用途审查。原生模型路由角色可供新 Planner 使用，不能仅按单词删除；旧 mode/guidance 数据不得再执行。Package recommendations 元数据不能擅自升级为活执行入口。 | W04/W06/W07；精确 route/ref/来源/预算与 Package schema 负例 |
| C15 Message Takeover/Iteration 共用 | `public/script.js:9079` emit、events、message-takeover 与 tests/message-takeover 有原消息生命周期；旧 Director subscriber 删除。通用消息 handle/编辑/Iteration 与其他 native Studio 工具保留；产品开发文档三语旧 Orchestrator 示例更新，不能保留失效 API 教程。 | W03/W09；消息提交/取消/variant 所有权与共享 Iteration 回归 |
| C16 同名非目标 | `src/sync/orchestrator.js`、sync/migration/cross-mode-restore、tokenizer vocabulary 中 orchestration，以及一般注释不是旧 Agent 执行器。保留同步/跨存储恢复权威，禁止全仓替词或全名删除。 | W09；排除清单可复核，不把无关修改混入 |
| C17 测试真实消费面 | AST/semantic annex 已按文件列出 tests/orchestrator、agent-runtime、agent-intelligence、game-runtime、atria-shell、frontend、e2e/orchestrator、skills-ui、skills、memory/search registration、character-presets、sync primitives 等。模式/旧配置专项删除；保留并改接 Source/权限/Variant/预算/崩溃/World/Studio/Skill 的仍有效断言。 | W09；不以删测试取得通过，新断言和 consumer 同阶段就绪 |
| C18 计算动态加载与生态边界 | 已读 capability 固定 loader、Shell 固定 import；`evolution-evaluator` 的固定数组文件读需同步替换；`extension-runtime.js import(url)`、`host-plugin-loader.js import(specifier)`、`plugin-loader.js import(fileUrl)` 为通用已安装代码执行。V3 不提供旧 API，依赖旧 API 的外部代码应显式 unsupported，不能新建适配层。未读取用户安装内容，不承诺外部插件兼容或绝对安全。 | W05/W09；真实启动/插件能力拒绝 trace `BLOCKED`，无沙箱 Host code 默认不授予 V3 R3 |

### 8.1 数据边界与停机切换

此处只冻结**未来清退设计**，本轮不删除数据。P6 不允许旧运行跨版本续跑：关闭旧入口和发送准入，停止并核实所有旧 Host/Browser worker，再启用新产品单路径。不能只升级后端而让旧标签页继续持有发送/提交许可；需在原 send/commit 边界以版本/boot/source fencing 拒绝旧协议。

| 数据位置 | 最小清退边界 | 必须保护/无法证明时 |
| --- | --- | --- |
| Settings `atri_capabilities.orchestrator`（含 agentWorkspaceRevision、presetLibraries 等） | 在原 Settings writer 中仅剔除旧子树；save/patch/import/restore 不能重新激活旧配置，无双读 | 不删 settings 文件和其他 capability；备份中旧内容可保留历史但导入后不得变为执行配置 |
| Browser `Atria_AgentRuntime_${encodeURIComponent(scope)}` | 不读取/迁移 checkpoint；仅当前已知 origin、已核对 scope 的旧专用 DB 可用用户明确的清退操作删除 | 无法枚举的浏览器 profile/离线设备保留不可执行残留，不能宣称已物理清空所有客户端 |
| FloorState namespace `atri_orchestrator_anchors` | 仅旧命名空间，无到新 Run 映射 | Chat/Message/Variant/其他 FloorState 均保留 |
| Skill `orch-preset/<mode>/<name>` | 旧 scope 不再解析、列出、导入或执行；仅按原 repo path containment 可清旧 scope | global/project/package/character 与正式 Skill version/history 不删；不自动复制到新 scope |
| Evolution old target candidate/job | 不继续旧目标 publication/rollback；保留原报告、收费和业务 receipt 的历史事实，标 unsupported target | 不批量删除 Experience/Eval/Promotion 仓库；有已发送未知效果先 reconcile，不能把无结果写成 cancelled |
| Native Session/World/Studio/Model/RunControl/MCP/A2A 证据 | **不迁移、不清除其正式数据**；新 Run 只引用原合法 source/receipt | 已发送 unknown 或非幂等操作无可信远端状态时保留 blocked，不能靠换 EffectId 重做 |

### 8.2 第一组结论

`L0 parser/scanner 执行：完成`；`零兼容处置设计：已落表`；`真实消费者运行闭包：BLOCKED`。发现 C07/C08/C09/C11 后，原“删除旧目录”方案的隐性缺口已有明确替代责任和验收位置；它们仍是未来代码工作，不冒称已经解决运行依赖。
