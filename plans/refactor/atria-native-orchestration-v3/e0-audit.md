# D9 E0 — Native Orchestration V3 工程审计与设计就绪

> **当前状态（2026-10-15）**：E0_DESIGN_READY，R01–R07设计闭合；用户已明确授权正式开发，R08=AUTHORIZED，P1 IN_PROGRESS。当前基线/授权见§12，实际代码/分组验证见同一Record；§1–10及§11.1的先前未授权结论保留历史。最终产品尚未验收。

> **此前审计结论（2026-10-15，当前分类以§11为准）**：最新只读基线 `main@60aca695726893e298b7d485f300c6efef3b79fd`。§1–7 为早期定向审计历史；本轮全仓证据及处置以 §8 起为准。静态取证范围已扩大，运行闭包、V3 持久化/安全和三端证据仍未通过，不得把审计文档完成改称 E0 PASS。

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

## 9. 存储、预算、权限证据与未闭合项

下列是源码定位所得事实和工程结论，接口细节仅由 [interface-contracts §6–11](interface-contracts.md#6-物理落点与存储合同-v1) 持有。设计已经收束不等于实现/故障证据通过。

| 证据 ID | 最新 main 源码证据 | 本轮解决的缺口 / 尚缺实证 |
| --- | --- | --- |
| E01 Native kind/布局 | `contracts.js:1066+` 封闭 key；`native-resource-key.js` hash/key；`fs-engine-transaction.js:761+` 通用 Native handler；SQL migration `0002-native-resources.sql` | 选择专用 6 kinds、复用原 Engine，不建 V3 数据库；不用 Model/Prompt 白名单 store。新注册/备份/恢复/GC 尚未实现 |
| E02 FS 事务 | `fs-engine.js:24–47` 同 root tail、ALS/recover；journal 的 prepare/dependencies/publish/install/ack fault hooks | 精确冻结 root+records+event 同事务；Host 对外 ACK 必在 journal commit 返回后；不再误称 FS 天生无 Native 跨资源事务。V3 fault hooks/kill/restart NOT_RUN |
| E03 FS 排他与 Windows durability | `repositories/common.js` resourceWrites、FS tails 都是 process-local；`durable-file.js:9,46` Windows directory fsync no-op；搜索 startup/storage/native 只发现 migration lock，不是 Host 全寿命独占证明 | 将 single-writer lease/fencing 与 Windows 软件崩溃/真实掉电保证分开。不能拿 README single-process 假设当强制排他。第二 Host/旧进程仍发送时的安全证据 BLOCKED |
| E04 SQL CAS **纠正泛化推断** | SQLite Native handler `putIfMatch:971`、MySQL `:1064`、Postgres `:1025`：insert-if-absent/conditional UPDATE integrity；generic fallback 才 read/compare/write。SQLite BEGIN IMMEDIATE/WAL/FULL；MySQL/Pg engine withRetry transaction | 单行 Native CAS 已有可复用实现；新根 CAS+所有 records 一笔原 tx，SQL retry body 仅做纯存储，绝不把网络 send 放入自动重试。不能说现有 SQL Native CAS 都不原子。真实并发/断连 commit outcome NOT_RUN/BLOCKED |
| E05 Provider Checkpoint/原 Versioned Store | runtime-checkpoint-store 为私有 continuation；resources.js 只接受 Model/Prompt resource types；persistence.commit 已示范 exact ref/immutable/current pointer | 新 Plan/Run 不滥用两者；仅复用 primitives。PlanRevision/publish CAS、Provider continuation 与 V3 Run epoch 分离 |
| E06 Budget 语义 | `native-compute-budget.js:113` 的 reserve 是 required headroom；attempt ID 重复报 conflict；`RunControl` 原 Session bank；ProjectTaskRepository.assertProjectTask 中 compute；GenerationHost `:1333` 内部随机 attempt | 缺稳定 caller-correlated attempt、observe/ensure 幂等准入、reservation tree。冻结扩展原 authority 的 BudgetPort；V3 不扣第二次。不能把当前 reserve 当子预算已实现。普通 rp_chat 的持久预算权威接入仍 BLOCKED |
| E07 Budget 恢复/GC | RunControl.retireOperations 会把非活跃 compute 汇入 retired totals；Session maintenance 按 root generation/reachability 清理 | V3 references 必须 pin 未结算/unknown attempt 与域收据，不能只有 aggregate totals 却丢失 reconciliation 身份。原账本引用扩展、恢复不返还额度尚未实现 |
| E08 Source/Output 权威 | RpEvidenceSourceAdapter 从 Host chat repo/current Session 读取，拒绝 ambiguous message、Native message 伪装 chat；SessionCore/RunControl、ProjectTaskRepository 存原 revision/commitIntent/review | SourceBinding 采用 tagged original refs，非伪造统一 revision。OutputClaim 绑定 source turn/variant/slot，不能只 runId 去重。两个 Run 争同正文、原业务 commit 后回执丢失仍 NOT_RUN |
| E09 Model Secret/Egress | `credential-targets.js` 以 exact connection/target fingerprint 保存原 permit；credential-fetch 在 socket DNS 检查公网/loopback、redirect:error、原 TLS；native-generation services 注入原 secretPort/provider | 必须复用原 credential authority 与 transport，不能新增 V3 Secret 解析器。Tool/Protocol 的 payload audience/egress 仍另验；相同 endpoint 不等于私密 Context 允许外发 |
| E10 Approval/同源代码 | server-main boot ID header/CSRF；native-generation router 取 request.user handle；Host plugin import 在当前进程，Browser extension import(url) 执行同 origin code | 没有现成统一 V3 action approval。合同已绑定 nonce/operation/hash/boot/epoch/expiry，但不能把 CSRF/isTrusted 当恶意同源扩展隔离。可信 UI/重认证与 R3 原保护的实证 BLOCKED，无证据拒绝高风险 |
| E11 MCP/A2A | MCP state WeakMap/operations 是瞬态，SessionPublicWork 检查公开 display/source/原预算；A2A 有原外部 task refs 与状态查询 | durable intent 不等于远端幂等。保持受限 consumer，不能升级 arbitrary tool write。taskId 丢失/远程未知结果保留 unknown，真实协议/外部断线结果 BLOCKED |
| E12 原 Domain/并行任务 | NativeTaskScheduler 只管当前 operations/permits；ProjectAgentExecutor 到 human-review-before-formal-commit；World/Command、Actor/Information/Hybrid 为原 authority | 新 controller 使用原 permits，审批等待不占长锁；不复制 World/Context/Project/收费。正式 Review/Commit、HCM-01–08 当前性/Disclosure/World Tick 必须分层验收 |

### 9.1 阻塞核销与状态

| 原阻塞 | 已完成的工程审计/设计收束 | 剩余阻塞、解除证据与阶段 |
| --- | --- | --- |
| B1 物理接口/存储/预算 | v1 kinds/key/fields/hash/CAS/tx/RPC/errors、预算原 authority 扩展与 saga 已冻结 | 新 kinds/Host 排他/父子 bank/普通 RP budget authority 尚无实现与 L1/L2 故障证据；E0 execution evidence BLOCKED，P1–P3 负责实现验证 |
| B2 全域消费者 | tracked 全集+AST+API/scope/设置索引、C01–C18、全生命周期替代和清退数据边界齐备 | API 注册、Shell、Game、Evaluation、Skills 的实际 trace 尚未执行，外部安装代码不可枚举；运行闭包 BLOCKED，P4–P6 补证 |
| B3 原领域/真实客户端 | SourceBinding/DomainReceipt/OutputClaim/Project Review/Memory guard 与原文件责任明确 | 三类 Source consumer 的真实越权/正式提交/唯一正文、可信客户端审批未验证，L2/L3/L4 NOT_RUN/BLOCKED |
| B4 Effect/Unknown/安全 | prepared→budget→ready→dispatching→receipt 每窗 fail-closed，stable domain attempt、同源代码信任缺口已明确 | 实际 crash/远端查询/Secret/egress/approval 测试缺失；无幂等写默认拒绝，不能宣布安全已通过 |
| B5 三端 | 真 Node Host+真实浏览器、环境/动作/故障/证据表在 acceptance §7 | Windows 只有本地 shell/源码证据；CachyOS/Termux 设备与 V3 artifact 均无实测。L3 BLOCKED |
| B6 UI/性能/清理 | 同一 Draft、原 DOM/ESM 与独立列表 fallback；清理精确作用域、不迁移；保留 roots/GC 合同已定 | 图编辑库 PoC、键盘/IME/Back/触控/大图控制延迟基线未测，不捏造 SLO；P5/P7 NOT_RUN |

**E0 文档审计与开发许可的区分**：可在本轮完成的静态盘点、物理设计、失败出口和实施/验收路线已写入同一 Plan；不存在可以在未实现 V3 时冒称通过的 V3 crash/真实客户端证据。D9 建分支 Gate 不因本轮写完文档自动解除，E0 总状态保留 BLOCKED。当前 docs-only 授权下不能用实验代码或产品修改“补出”这些证据；不将它伪装成下一次用户必须选择的新产品方向。

## 10. 最终开发就绪审查与交接结论

**结论：NOT READY。E0 文档审计成果已收口并持续提交；E0 总 Gate 仍 BLOCKED，产品实施 NOT_STARTED/NOT_AUTHORIZED。** 本轮无实现分支、无 main 修改、无旧数据删除/迁移、无生产服务或外部写入。后续即使补齐 E0，也须用户新的明确开工授权；不能用本节交接结论自行启动开发。

### 10.1 冻结约束逐项复核

| 权威 | 本轮审查结果 |
| --- | --- |
| D1 原生 B / D2 单 Host、零兼容 | 新 PlanBinding/Plan/Run 元数据只在原 Native Engine；Browser 仅草稿/投影/显式命令；C01–C18 清旧执行器/配置/scope/入口，无模式迁移/模板化/shim |
| D3 G2 | Whole-patch CAS、独立 GraphRevision/Attempt、Delegate/Handoff/Join/Review、bounded counters 持久；已提交副作用不回滚、不重复派发 |
| D4 C2 / HCM-02/06 | 原 Source/Actor/Audience/Time/Branch 先授权→唯一 Hybrid→原 compiler；每次 send/consume 重新 guard，Result/projection 不洗白秘密；公开 stream seq 不暴露内部事件计数 |
| D5 F2 / HCM-08 | 原 bank 唯一收费；stable attempt/reservation tree/unknown、缓存三层分开；普通RP无固定Planner/Judge；缺预算/source不以低延迟猜测通过 |
| D6 S2 | intent-before-send、exact grant/approval/egress/Secret binding、未知远端不盲重试；原 Credential/MCP/A2A 复用；缺可信UI/沙箱时对应高风险拒绝 |
| D7 N2 / HCM-01/03/04/05/07 | 原 World/Memory/Cognition/Project/Experience 权威不复制；叙事职责不等于固定五Agent；正式World Tick/事件驱动/角色遗忘按原域；本任务不重建旧Recall或迁移旧记忆；原正式历史和收据不删除 |
| D8 U2 | Canvas+Inspector/List同Draft，Timeline默认/Graph可切换，移动完整编辑；延续原Shell/主题，无另一框架/Runtime；真实交互/性能尚未通过 |
| D9 E1 | P1→P8同任务、P6统一硬切、每阶段真实Gate；文档合同不等于运行证据，不以原Plan选择或本轮push充当开工许可 |

### 10.2 最终接口与实施顺序

接口唯一详细来源：[interface-contracts](interface-contracts.md) §6–11。最终为 **6 个 Native kinds**（PlanRoot、PlanBinding、immutable PlanRevision、RunRoot、typed Record、Command dedup），不是第一版草案的5个；§11 补足 source→plan 选择和 Evolution publication pointer。对象合同覆盖 Plan/RunLedger/NodeAttempt/GraphPatch/Join/EffectIntent/Receipt/Approval/Result/Output/Projection；带原 hash/CAS/epoch/稳定 operation/预算 attempt/ref、source tagged union 和失败错误码。HTTP namespace `/api/native/orchestration` 属新合同，当前 main 未实现；真实写入依原 Context/Model/Tool/Narrative/Project/Evaluation Ports，绝无第二业务 writer。

未来受权后顺序：W01/W02 的 Plan/Binding/Store/owner→W03 Graph 与 W05 Effect 状态机→W04 原预算/source/model 与 W05真实Ports→W06 RP/Game、W07 Project/Evolution/评测→W08 U2/Shell/可信审批→W09 全入口清退与证据→P7三端/安全/可靠性→P8集成。详见 [implementation-plan §6–8](implementation-plan.md#6-e0-收口后的依赖图与阶段增补)；不得先删旧目录再寻找其合法消费者。

### 10.3 剩余阻塞（不重复列为待选产品方向）

| 阻塞 | 当前实际状态与尚缺证据 | 不能声称 / 下一可用证据 |
| --- | --- | --- |
| R01 真实消费闭包 | tracked静态盘点/AST完成；boot/API/Shell/Game/Eval/Skills和外部动态代码运行 trace未执行 | 不能称全运行消费者已穷尽；需在真实新主链上跑 C01–C18/CL12 并核对旧client拒绝 |
| R02 持久性/Host排他 | 当前 primitive可复用；V3 kinds/lease/records/command tx并不存在 | 无V3 crash-safe、多进程或掉电PASS；需V01/V03/V09真实Engine和子进程窗口，Windows掉电保证独立 |
| R03 父子预算/普通RP | 原bank可定位，required headroom≠reservation tree；内部随机attempt尚未改接稳定identity | 不能称无超支/无双计/恢复不退款已证；需原RunControl/Project/普通RP领域预算和真实send identity证据 |
| R04 输出/Evolution/原生权威 | SourceBinding、OutputKey、PlanBinding、Target/Ports合同已定；实现未验证 | 不能称唯一正文、无旧Eval引用、原Review/Commit完整；需V06/V07与实际domain receipt/source竞争反例 |
| R05 可信批准/安全/外部未知 | exact binding与拒绝策略已定，原Credential可复用；V3审批和同源扩展隔离无实证 | 高风险有副作用路径保持blocked；需V05/CL04与获准外部L4，不能以CSRF或Tool只读标签替代 |
| R06 U2/性能/三端 | 交互语义/真实步骤和证据格式已定；图backend PoC、长Run指标及真实客户端未测 | Windows仅宿主信息；CachyOS/Termux未连接；V10/CL01–12/性能基线仍NOT_RUN/BLOCKED |
| R07 已支持其它Store | MySQL/Pg真实 Native conditional CAS可静态确认，new kinds与服务端测试未做 | 不能跳过后声称四Engine一致；需服务账号/真实tx/CAS/backup测试，缺能力在admission明确拒绝 |
| R08 开发许可 | 当前用户只授权docs审计并禁止实现 | NOT_AUTHORIZED；E0即使未来全部闭合也必须等待另行明确授权，不主动建分支 |

R02–R06 中针对“尚不存在的V3”的运行证据，无法在本次 docs-only 范围内制造；已把每个缺口落为唯一 authority 上的工程任务/安全退出/可执行验收，而非以文字补称PASS。外部连接/设备/可信人工动作只在它实际成为下一任务所需证据时取得，不在本次要求逐阶段审批或索要无关权限。

### 10.4 本轮实际完成边界

完成的是：最新 main 静态依赖取证与可复核附件、旧编排零兼容矩阵/数据边界、v1物理合同/原authority接入、E1依赖和三端验收方案、最终阻塞与开发就绪审查。产品实现、真实consumer trace、V3测试/故障注入、真实模型/Tool/审批/人工质量、Windows/CachyOS/Termux客户端均未执行。文档校验与Git同步事实由同一 [Record](../../../records/refactor/atria-native-orchestration-v3.md) 保存。

## 11. R01–R08 设计与实施证据分账

**本节是当前E0状态权威**；§1–10保留此前审计过程和当时结论，§10.3中“所有缺实证均为E0阻塞”的分类由本节取代，不再作为建分支门槛。2026-10-15用户明确授权在docs内消除循环依赖；Gate定义唯一引用 [implementation-plan §2](implementation-plan.md#2-e0-设计门槛开发授权与实施验收三者分离)。D1–D9/HCM产品语义、原生authority、零兼容硬切和最终质量要求保持不变。

### 11.1 分账方法与第一组时点记录

- **设计阻塞**：无法指出原authority/合法source或预算、无法给出可实施物理合同、关键竞态/未知结果没有确定出口、必须重新选择产品方向才能实现。必须在E0关闭，不能以“届时测试”代替设计。
- **实施后证据**：合同已确定，但代码/测试、真实Port/客户端/外部服务尚未产生。按具体P阶段的case保持NOT_RUN，真实环境缺失记BLOCKED；不反向阻断已经具备实现合同的E0。
- **开发授权**：R08是单独的人类授权条件，不是待修复技术缺陷。始终NOT_AUTHORIZED，直到用户另行明确授权；本次不创建实现分支。

| 原R项 | E0必须解决的设计问题 | 本轮设计状态/核销位置 | 实施后证据与最早Gate | 当前证据状态 |
| --- | --- | --- | --- | --- |
| R01 消费者闭包 | 静态盘点边界、计算动态导入/外部安装的拒绝政策、每类替代责任和清退顺序可复核 | **DESIGN_CLOSED**：§8 C01–C18、两个附件与§8.1数据边界；不能静态求值的加载器有范围/拒绝出口，不以“全运行穷尽”作为设计事实 | W06/W07 consumer trace P4；W08 Shell P5；W09零旧生产入口/旧客户端拒绝 P6；CL12 | NOT_RUN；外部安装内容未检查不伪称已兼容 |
| R02 Host/持久性 | 确定跨重启排他/fencing、恢复保证级别和跨Store失败策略，而非只有进程内Map | **DESIGN_OPEN**：需本轮补充具体Owner获取/失效/重启协议 | W02 P1 V01/V03/V09；真实掉电声明另需对应硬件证据 | NOT_RUN；没有V3实现不等于设计本身不可关闭 |
| R03 父子预算/普通RP | 明确rp_chat原authority扩展落点、稳定attempt到provider send的唯一计费与父子分配算法 | **DESIGN_OPEN**：需确定普通RP key/source/原RunControl扩展及费用恢复 | W04 P3 V04；真实usage L4 | NOT_RUN；服务缺失只阻相应用量验收 |
| R04 输出/Evolution | 原ChatRepo怎样原子认领同output slot/消息、跨FS-Native事务如何恢复；Evolution原发布journal的接线 | **DESIGN_OPEN**：§11接口方向已定，需补原ChatRepo的物理receipt/写入协议 | W06/W07 P4 V06/V07，P6 C02/C06/C07 | NOT_RUN |
| R05 可信批准/安全 | 批准来自哪个真实信任边界；同源代码如何隔离/何时拒绝；未知外部effect默认路径明确 | **DESIGN_OPEN**：需冻结可实施批准通道，不能用nonce/CSRF虚构隔离 | W05 P3负例、P5可信UI、V05/CL04，必要L4 P7 | NOT_RUN；无批准/沙箱路径仍拒绝执行 |
| R06 UI/性能/三端 | 一套Draft/Projection、完整Graph+Inspector与移动List语义、backend选择和实测阈值在哪阶段冻结 | **DESIGN_CLOSED**：D8/interface §9、implementation P5/W08及acceptance §7/§8.1已规定PoC/性能出口；具体布局/backend实验是P5工程工作 | P5真实U2功能与PoC；P7三端CL01–12/性能 | NOT_RUN；CachyOS/Termux实机证据BLOCKED，不作为E0前置 |
| R07 MySQL/Pg | 确定连接Owner、Native CAS/事务重试/commit结果未知、六kinds及原域扩展的四Engine一致合同 | **DESIGN_OPEN**：需补SQL Owner/commit unknown协议，不只写服务不可用 | W01/W02 P1合同；P3真实Port，P7四Engine完整验收 | NOT_RUN；服务账号/连接未取得的验收BLOCKED |
| R08 开发许可 | 明确谁可以授权、授权前允许范围 | **非技术项：NOT_AUTHORIZED**；仅用户新的明确正式开发授权可改变 | E0_DESIGN_READY之后，未来P1前独立检查 | 当前仍docs-only；不请求本轮开工 |

第一组结果：Gate循环依赖已从生效入口拆开；R02/R03/R04/R05/R07仍有具体设计问题，本轮继续在接口权威模块补齐。此时不宣称E0设计已通过，更不宣称任何产品case PASS。

### 11.2 设计项核销依据（当前R项权威）

| R项 | 已收束的实施策略 | 唯一详细合同 / 原源码证据 | E0设计结果 |
| --- | --- | --- | --- |
| R01 | tracked静态范围+计算加载器/外部代码明确拒绝边界；P4/P6真实trace负责，无旧API/shim | §8 C01–C18；interface §16；AST/consumer附件 | DESIGN_CLOSED；不谎称运行闭包PASS |
| R02 | 原Storage root identity+固定回环独占guard、原host fence、恢复先于admission；进程死释放OS资源，禁TTL抢占/端口fallback | interface §12；server-startup已有net listener、FS Journal/durable-file与Native CAS；Node官方原语文档 | DESIGN_CLOSED；目标OS竞态/崩溃证据在P1 |
| R03 | 原RunControl扩展rp_chat控制kind与原ChatRepo稳定controlId；单原bank reservation tree、provider sub-send稳定identity、同attempt幂等admit/settle | interface §13；现有run-control key只session、GenerationHost source只Session/Project、native-compute-budget required reserve | DESIGN_CLOSED；不靠永久屏蔽普通RP回避产品功能 |
| R04 | RPControl prepared→writing单permit，原ChatRepo单chat CAS中正文与marker同写，独立domain receipt补齐；unknown不重写；无嵌套跨authority事务 | interface §14/§11；ChatRepo.append gen_id去重、FS chat writer不受Native Journal原子覆盖 | DESIGN_CLOSED；唯一正文/ACK-loss与Evolution实测归P4/P6 |
| R05 | 同一Host独立Review Origin、原账户再认证、隔离nonce/CSP/COOP、主origin不可approve；无原域保护的R3不注册 | interface §15；原users密码校验、server认证与CredentialTargetAuthority；HTML origin标准 | DESIGN_CLOSED；真实隔离/认证/三端批准仍P5/P7必测 |
| R06 | 原ESM/DOM单Draft；SVG交互层为P5首选工程路径，性能不合格时在同View adapter试现有Cytoscape；Graph与移动完整编辑目标不变 | interface §16；D8、acceptance §7/§8.1 | DESIGN_CLOSED；backend/阈值实测不倒挂为E0 |
| R07 | 原MySQL/Pg专用session owner/advisory锁+所有原writer fence；tx仅known-rollback retry、commit-unknown按原command查询；四Engine范围一致 | interface §12.2/§12.3；当前SQL Native conditional CAS与外层withRetry；SQL官方session锁文档 | DESIGN_CLOSED；标准单primary四Engine真服务验收不取消 |
| R08 | 用户已另行明确授权同任务P1–P8连续开发，最终验收后才集成main | implementation §2；2026-10-15当前明确开发指令；§12 | AUTHORIZED（人类授权已满足，非产品验收） |

R02/R03/R04/R05/R07均有确定方案和失败出口，没有只靠标签转移缺口。§11.1中的DESIGN_OPEN是第一组时点记录，当前以本表和§11.3最终核销为准；产品与外部实证状态仍NOT_RUN/BLOCKED。

### 11.3 当前E0设计最终核销

基线仍为 `main@60aca695726893e298b7d485f300c6efef3b79fd`（本轮最终fetch核对），docs起点`0f9d345e8`；第一组`e694b9a5a`拆分Gate，第二组`9b553faea`补齐具体设计。本节记录最终设计审查结果，不回改§1–10与Record的历史事实。

| 设计核对 | 可复核依据 | 当前结论 |
| --- | --- | --- |
| DG01 消费者/清退范围 | 固定tracked/AST附件、151 manifest、C01–C18及数据边界；未解析外部动态代码的拒绝/测试责任明确 | DESIGN_READY；对应R01 |
| DG02 Store/Owner/CAS/恢复 | interface §6/§12：六个编排metadata kinds，原Storage HostFence，local root guard/SQL session Owner、commit unknown、原事务与明确安全保证级别 | DESIGN_READY；对应R02/R07 |
| DG03 父子预算/普通RP | interface §8/§13：原RunControl/Project/RP三域bank、原ChatRepo controlId、稳定send attempt、reservation/unknown、无第二收费writer | DESIGN_READY；对应R03 |
| DG04 正文/Project/Evolution | interface §11/§14：原ChatRepo单chat提交/marker/receipt核对、writing唯一permit；原Studio Review/Commit、原Evolution target/journal/fingerprint | DESIGN_READY；对应R04 |
| DG05 授权/可信批准/外部效果 | interface §9/§15：主origin不批准、同Host Review Origin、原身份再认证、nonce/参数/source/epoch绑定、原policy ceiling；无保护R3不注册、unknown不盲重放 | DESIGN_READY；对应R05 |
| DG06 U2/三端/原服务复用 | D8与interface §16、implementation W01–W09：单Draft与Projection、SVG首选的P5实验边界、三端/四Engine完整产品目标不缩减 | DESIGN_READY；对应R06 |
| DG07 证据与授权不循环 | implementation §2唯一Gate；acceptance §6–9记录P阶段责任；开发许可独立，未执行的产品case保留NOT_RUN/真实环境BLOCKED | DESIGN_READY；R08已由当前明确指令更新AUTHORIZED |

**当前状态：**

- `E0_DESIGN = DESIGN_READY`；R01–R07的**已知开发前设计阻塞为0**，有具体实施落点/协议/失败出口/负责阶段，非仅将未知问题改标“后测”。
- `DEVELOPMENT_AUTHORIZATION = AUTHORIZED`；2026-10-15当前用户明确授权正式开发；同一任务分支已建立，最终验收前不集成main。
- `IMPLEMENTATION = P1_IN_PROGRESS`；`PRODUCT_ACCEPTANCE = NOT_READY`。分组真实证据归同一Record，未测case仍NOT_RUN，真实外部缺口BLOCKED。

### 11.4 实施后证据留账与最终交接结论

| 尚需取得的证据 | 开放/验收门槛 | 当前真实状态 |
| --- | --- | --- |
| 新Host root/SQL Owner、HostFence、Plan/Run/command/CAS、软件crash/ACK-loss/GC/restore | W01/W02 P1，V01/V03/V09；相应backend未证前不能接真实Effect | P1局部已实测四Engine/Windows Host；整体Gate未通过，仍缺批量管理fencing/完整恢复/平台故障等；证据归Record |
| 原Session/Project/RP预算树、真实provider attempt/usage、unknown/overrun/source撤回 | W04/W05 P3，V04/V05；未证不开放相应收费/外发路径 | NOT_RUN；真实Provider/Tool证据未取得 |
| 普通RP/NativeGame/Project唯一output与原receipt、Evolution新target/worker/指纹/发布回滚 | W06/W07 P4、P6，V06/V07/CL08/CL12 | NOT_RUN，不声称已运行新消费者或已删除旧代码 |
| 可信Review Origin/原身份/nonce/隔离负例、桌面Graph与完整移动List/Shell | W05/W08 P5，V05/V08；未证不开放需批准的产品mutation | NOT_RUN；原再认证/可信origin的实际配置尚未验证 |
| 旧生产入口/Settings/scope/动态注册/旧客户端fencing、共享功能回归 | W09 P6，S7/CL12，C01–C18实际trace | NOT_RUN；静态全仓覆盖不等于运行trace通过 |
| Windows/CachyOS/Termux真实客户端、四Engine标准能力、性能、必要外部/人类质量 | P7各自L2/L3/L4与CL01–CL12；缺项不进P8交付 | NOT_RUN；CachyOS/Termux与SQL/外部服务未获真实证据的项BLOCKED |

最终交接结论：**设计具备进入“等待用户正式开发授权”的条件；产品没有完成或通过验收。** 下一次只有在用户明确授权后，才根据当时main delta局部复核并按P1→P8实现；不再要求先在docs-only阶段取得新V3实现/真实运行/三端证据。届时若测试暴露设计缺陷，在受影响阶段修设计/实现并复测，不把本次DESIGN_READY解释为安全证明或免检。

本轮实际只读补证/文档检查及Git提交推送归同一 [Record](../../../records/refactor/atria-native-orchestration-v3.md)。无新的产品分支、无main修改、无破坏性操作、无独立HANDOFF，也不在本轮请求正式开发授权。

## 12. 正式开发授权生效（2026-10-15）

当前用户明确授权正式开发，R08由NOT_AUTHORIZED更新为AUTHORIZED。§11的设计核销继续成立，先前未授权条款保留为历史时点。开发基线main@5eb3bc765，较审计基线增加Settings/Themes四提交；不改变原Native authority，Shell/Settings接线归P4–P6。已建同任务分支，P1 IN_PROGRESS；产品验收NOT_RUN/BLOCKED不因授权改成PASS，P7通过前不集成main。

后续main delta：`73557f809`新增Storage Center的quota/recovery/事务组合，已在任务分支`0d799fc28`同步并修复组合边界；工程落点/实证见interface §17.8及同一Record。单Native Host/原领域权威与零旧编排兼容决定未变，不重开已冻结方向；原E0附件仍明确旧扫描SHA，P6必须按实际新主链重核消费者闭包。P1/P2仍IN_PROGRESS，未取得的真实Domain/三端验收仍NOT_RUN/BLOCKED。
