# D9 E1 — Native Orchestration V3 实施工作包、依赖与交接门槛（已冻结路线）

> 2026-10-15 第九轮选择 **E1：内核先行、同一产品任务分支分阶段验证、最终统一零兼容硬切**。本模块独占正式实施阶段/工作包/每阶段退出门槛/创建开发分支的前置条件。接口方向见 [interface-contracts.md](interface-contracts.md)，旧消费者/阻塞静态证据见 [e0-audit.md](e0-audit.md)，验证矩阵唯一来源为 [acceptance-matrix.md](acceptance-matrix.md)。**本轮是 docs 阶段规划定案；E0 实证审计未完成，不得建立 refactor/feat 实现分支或修改 main**。所有 Stage Gate 是未来真实工程完成条件，不宣称 PASS。

## 1. E1 与零兼容的准确含义

- **内核先行**：优先 Native Host Plan/Run/Effect/Receipt/Snapshot 的逻辑与持久合同，随后图调度、Domain Adapters、RP/Studio/Evolution consumers、U2 UI；每项以真实集成/错误恢复/权限测试为出口，而不是只加接口空壳。
- **一条产品主执行链**：所有开发阶段在**同一个**未来受控产品任务/工作树中推进，旧编排相关模块可以在内部构建过程中暂存用于查消费者，但不能对已完成产品交付生成面向用户的旧、新双执行路径；P6 一次正式 hard cut 后必须无旧模式/桥/UI/数据兼容入口，无 fallback/双读/迁移。
- **无旧数据兼容**：旧 `Single/Spec/Agenda/Loop/Director` mode、配置、Preset、Workspace JSON、Browser IndexedDB Checkpoint、旧 Capsule/Generator 主合同、旧前端交互、旧事件用途和模式化测试均应清退；不将模式转为 V3 示例模板。清理旧配置存储的具体删除点要经过原 Settings/Session 用户数据作用域检查，不删除不属于编排子系统的真实数据。
- **领域权威不能重写**：World、Session/RunControl、Studio/Project Task、Memory/Actor/Hybrid、Model/Provider/Compute、Skills/MCP/A2A、Evaluation/Experience/Evolution 和独立 MCP Plugin 仍保留自己的正式提交/来源/收费/安全边界；V3 是编排调度与结果/Effect 元数据消费者，不是第二 Session writer 或多套计费体系。
- **前端复用 Serene Canvas**：Timeline 默认/Graph 切换、U2 Graph + Inspector 桌面编辑、移动 Node/Edge List + Sheet 语义等价，沿现有 DOM/ESM/Tokens/Primitives/Patterns。Graph 渲染库经局部 PoC 再决定，不能强制整站 React/新主题迁移。
- **不承诺原地不停机迁移旧运行**：老 Run/旧模式不兼容，无数据双轨。具体停机、旧持久状态可删除的范围和未结束旧任务如何明确宣告 unsupported/terminated，要在 E0 的数据和副作用审计中明确；不能借“硬切”丢弃仍可能处于 unknown 的外部操作/正式业务收据。

## 2. 先决 E0 — 全域审计收口而非仅静态发现

**E0 Exit Required Before Branch Creation：**

1. **冻结源头**：锁定当时真实 main HEAD、应用依赖和 Node/FS/SQLite/Browser/Termux 环境；同步当前 docs Plan/Record，差异若改变既有 D1–D9 权威则先处理冲突，不自行猜测同名分支等价。
2. **完整消费图**：以 import/dynamic import/boot loader、workspace navigation、HTTP routes/host ports、settings/bootstrap/read/write、code search 与关键运行时 trace/测试反例，列出旧 `agents/orchestrator`、`engine-v2`、`agent-runtime`、`orchestration-engine`、`agent-workspace`、旧 Generator/Takeover/Graph UI 的**每个活消费者**，标明删/保留/抽离/新合同替换/依赖项目/受影响测试。仅 GitHub 搜索命中不是所有动态消费者的证明。
3. **特殊跨域阻塞**：彻底审计 `src/native/agent-intelligence/evolution-targets.js` 的旧 Director/Workspace Preset/PromptStrategy 目标消费者；`src/storage/repositories/settings-repo.js` 的旧 `agentWorkspace` CAS；`public/scripts/native/play-generation.js` 与 Game LLM、`capability-host.js`、`atria-shell/workspace-host.js`、Search/UI 路由、`message-takeover.js` 的共享用途。任何未查清的共享 consumer 不得作为“可直接删除”。
4. **真实源接口**：审查 Host StorageEngine/SQLite/FS transaction、scope/owner/SourceRevision/CAS、RunControl 模型收费预约/attempt、TaskScheduler permits、Project Task/Review/Commit、MCP/A2A/Skill/独立 plugin 安全、Memory/Actor/HCM 与 UI Session/Context 状态；对 [interface-contracts.md](interface-contracts.md) 每个接口族列出最小物理实现位置、RPC/错误码/恢复与 ref 身份，未决记录为阻塞，不造虚假完成。
5. **运行安全/数据权威**：分类断电、重启、Source revoke、Branch switch、媒体/付费/外部 write unknown、Legacy Run 结束边界；确定旧编排私有数据的确切删除范围及保留正式业务 DomainReceipts 的规则。
6. **证据与开发许可**：静态闭包清单、针对性验证结果、已冻结物理契约/接口所有者、失败模式、阶段依赖、可在可用机器执行的真实平台验收计划、风险处置均进同一 Record。**未证明的 E0 项目保持 BLOCKED，不能把“讨论第九轮结束”直接等同 E0 完成。** 完成 E0 后还须有用户明确允许开始产品代码实施；本次选择 E1 只冻结路线，不授予现在建分支权限。

E0 允许在 docs 记录审计事实/更新最小物理合同和验收计划，不允许在此阶段修改 main、创建实现分支、执行有破坏性清理。

## 3. 正式实现工作包（E1 阶段顺序）

| Stage | 主工作包与需复用的权威 | 可验收出口（不通过不得标 PASS） | 前置依赖 |
| --- | --- | --- | --- |
| **P1 — Host Foundations** | Native PlanDefinition/Draft/Publish/CAS、RunLedger/Checkpoint/TaskGraphRevision/RunIdentity/NodeAttempt、Storage/GC/可授权 Host RPC；保持纯 JS 逻辑与 Node Server 分离 | 真实 Native FS/SQLite 启动、并发/崩溃/重开、不可变 Plan、CAS/fencing/新旧来源；无 Browser 可执行权威 | **E0 全部硬阻塞闭合 + 用户正式开工授权** |
| **P2 — Graph & Effect Core** | G2 GraphPatch/Delegate/Handoff/Fanout/Join/Planner/Judge/Review、S2 EffectIntent/Approval/EffectReceipt/unknown/reconcile、D3 重试/循环、Host Scheduler permits | 动态/并行/晚到/CAS 重放、写前 WAL 或等价保证、非幂等外部未知不重复发送、取消与费用真相分开 | P1 Host identity/ledger |
| **P3 — Native Ports & Budgets** | D4 唯一 Hybrid/Context/Actor、D5 Model Routing/Compute 原预算/Provider fallback/Reuse、Tool/Skill/MCP/A2A Secret/Egress 权限、原业务 DomainReceipt refs | Owner/Actor/Source 隔离、预算原子预约和重启、实际 Provider/Tool attempt 与 Unknown、没有影子收费或第二 Memory/Secret/Business writer | P1/P2 |
| **P4 — Product Consumers** | Native Game/Ordinary RP Narrator/Player autonomy、Session World/Command/Timeline、Studio Project Agent Task/Review/Apply、Experience/Evolution targets 与原 M1 Eval | 单次合法正文、无玩家代写/全知硬写越界；Studio 只审阅后获准正式提交；`evolution-targets.js` 等旧模式引用已替换且原记录可信 | P2/P3 |
| **P5 — U2 Frontend** | Serene Canvas Agents Plan Library/Graph+Inspector/typed Ports/Draft/Publish，Run Timeline 默认/Graph 切换、Host Projection/Diagnostics/Approval/Source/Cost 与移动端 List/Sheet | Canvas/List 双向、版本冲突/错误定位、无编排 Browser Runner、真实审批/Control 流，PC/Mobile 交互与权限隔离 | P1–P4 新权威 API 与可信 UI contract |
| **P6 — Atomic Legacy Hard Cut** | 同任务分支一次性切换全部 RP/Native Game/Studio/Agent/Search/Shell/Evolution 的原生入口，删除旧五模式/编排代码/Browser checkpoint/旧 preset UI/旧 mode 事件注入/专用测试 | 静态 import/路由/设置/持久数据/用户入口全面无旧编排活引用；旧数据不迁移/无 fallback/shim；共享 Native/Message Takeover 非旧用途仍正常 | P1–P5 替代已准备与真实消费者闭包 |
| **P7 — Integrated Acceptance** | [验收矩阵](acceptance-matrix.md) 中 Graph/权限/预算/质量/安全/崩溃与三端分层实测，CI/实体客户端证据和必要缺陷修复 | 各 Gate PASS 的测试名、Head、原始输出/账号权限、真实负例和误差记录；无法验证的高危矩阵项阻断产品完成 | P1–P6 |
| **P8 — Integration & Close** | 检查干净分支与产品相邻任务最新变化、真正 main 集成/推送、docs 同一 Record 更新 End/Tested HEAD、清理安全旧分支 | 无未合并活工作、回归/CI/真实平台证据、最终源头/状态明确；不得未经测试/确认称完成 | P7 与 Governance |

**依赖允许安全细分/局部穿插**：如 P3 可先实现合法只读 Context Port 以支持 P2 测试，UI 合同可在 P1 用无副作用 Stub 测试，但不得把此类穿插解释为提前达到完整阶段 Gate。阶段结果与真实失败留同一 Record，常规工作可在**已授权实现后**按 Governance 持续推进。

## 4. 接口与清退专项工作包映射

| Workstream | 需要补全的真实依赖 | 阻断的阶段 |
| --- | --- | --- |
| **W01 Authoring/Data** | 旧 `agentWorkspace`/SettingsRepo CAS、PlanDefinition/Revision、版本和源资源、旧数据 no migration/旧私有缓存清理 | P1、P6 |
| **W02 Host Ledger/Recovery** | Native Scheduler/RunControl/FS/SQLite、原 charge attempt、effect operation identity、unknown/crash-reconcile、独立 MCP Journal 边界 | P1–P3、P7 |
| **W03 Graph/Core** | 旧 `agent-runtime/orchestration-engine` 纯函数可提炼范围、G2 Node/Join/GraphPatch、所有 mode 依赖清除 | P2、P6 |
| **W04 Source/Context/Compute** | Actor/Memory/Hybrid/Information/World、Provider/Route/Budget/Local Work、source revocation/ref validity | P3、P7 |
| **W05 Tools/Security** | Skill/MCP/A2A Tool discovery/grants、Secret/Endpoint/Approval、Plugin host/native domain ports、外部未知任务 | P2–P3、P7 |
| **W06 RP/Game Consumer** | `capability-host.js`、`native/play-generation.js`、`experience/llm/*`、旧 Director 旁白和 Message Takeover 用途，原 World/Turn/Output | P4、P6 |
| **W07 Studio/Evolution Consumer** | `project-agent-executor.js`、`project-agent.js`、Studio Review/Commit、`evolution-targets.js` 与 Prompt/Strategy Preset target 重构 | P4、P6 |
| **W08 U2 UI & Shell** | `atria-shell/workspace-host.js`、Shell Search、Graph viewer、旧 Workspace Panel、Serene Canvas/手机输入与审批 | P5–P7 |
| **W09 Hard Cut & Evidence** | 旧模式/适配/JS/CSS/测试/配置导入一一核对，关键信息迁移仅正式业务权威引用、真实数据不被误删；三端验收证据 | P6–P8 |

在当前 E0 仅部分静态确认了 W01/W03/W06/W07/W08 的若干路径；其余完整消费者、真实 E2E 和物理接口仍需补充，[e0-audit.md](e0-audit.md) 记录 evidence，不将设计目标当已完成代码改动。

## 5. 工作分支与正式交接门槛

**当前：禁止创建开发分支或触碰 main 产品代码。** 正式开发交接审查要同时满足：

- D1–D9 的已冻结架构与原 HCM/Agent Intelligence/Game Runtime/MCP/Serene Canvas 权威边界一致；未定物理接口在 E0 内给出真实证据/明确所属/测试路线。
- E0 有当前 main HEAD 的**可复核全消费者引用闭包**、旧代码删除/保留/抽离矩阵与跨域 W06/W07/Settings/Shell 引用审查，未查项目无条件记录 BLOCKED。
- RunLedger/EfffectIntent/Approval/Result/Projection 的 Host Store/RPC/原预算/Source/事务与 API 身份已可以在代码中实施而不创建第二业务 writer；关键 unknown/crash 的 fail-closed 路线有可执行测试。
- 原 Play/Native Game/RP 旁白、Studio/Project Review、Experience/Evolution target、Serene Canvas UI 与手机全功能没有失去业务消费者/权限/视觉权威；外部 MCP Plugin 不被合并到 V3 Host。
- 有真实 Windows、Linux、Termux 测试环境、可复核客户端 L2/L3 验证手段与不可测试项的保守处理。用户此前选择 E1 **不是实施授权**；当前要求明确在收口前不得建立分支，故待 E0 完整、正式交接审核与**用户新的明确开工要求**后才建立同一 `refactor/*` 任务分支。

最后依据 [acceptance-matrix](acceptance-matrix.md) 与 Governance 保持真实 git/测试/CI/端侧记录，阶段闭合后继续；不以“已分阶段”免去高风险操作的用户授权、原权限检查、质量/Eval 独立标记。
