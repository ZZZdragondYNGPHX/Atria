# D9 E1 — Native Orchestration V3 实施工作包与依赖（已冻结路线）

## 1. E1 与零兼容的准确含义

- **内核先行**：优先 Native Host Plan/Run/Effect/Receipt/Snapshot 的逻辑与持久合同，随后图调度、Domain Adapters、RP/Studio/Evolution consumers、U2 UI。
- **一条产品主执行链**：所有开发阶段在**同一个**未来受控产品任务/工作树中推进，旧编排相关模块可以在内部构建过程中暂存用于查消费者，但不能对已完成产品交付生成面向用户的旧、新双执行路径；P6 一次正式 hard cut 后必须无旧模式/桥/UI/数据兼容入口，无 fallback/双读/迁移。
- **无旧数据兼容**：旧 `Single/Spec/Agenda/Loop/Director` mode、配置、Preset、Workspace JSON、Browser IndexedDB Checkpoint、旧 Capsule/Generator 主合同、旧前端交互、旧事件用途和模式化测试均应清退；不将模式转为 V3 示例模板。清理旧配置存储的具体删除点要经过原 Settings/Session 用户数据作用域检查，不删除不属于编排子系统的真实数据。
- **领域权威不能重写**：World、Session/RunControl、Studio/Project Task、Memory/Actor/Hybrid、Model/Provider/Compute、Skills/MCP/A2A、Evaluation/Experience/Evolution 和独立 MCP Plugin 仍保留自己的正式提交/来源/收费/安全边界；V3 是编排调度与结果/Effect 元数据消费者，不是第二 Session writer 或多套计费体系。
- **前端复用 Serene Canvas**：Timeline 默认/Graph 切换、U2 Graph + Inspector 桌面编辑、移动 Node/Edge List + Sheet 语义等价，沿现有 DOM/ESM/Tokens/Primitives/Patterns。Graph 渲染库经局部 PoC 再决定，不能强制整站 React/新主题迁移。
- **不承诺原地不停机迁移旧运行**：老 Run/旧模式不兼容，无数据双轨。具体停机、旧持久状态可删除的范围和未结束旧任务如何明确宣告 unsupported/terminated，要在 E0 的数据和副作用审计中明确；不能借“硬切”丢弃仍可能处于 unknown 的外部操作/正式业务收据。

## 2. 执行分工与两次交接

执行顺序：**Codex 完成后端 → Claude Code 完成前端与组装 → 交回 Codex 做 P6 硬切、清退与最终验证**。

| 执行阶段 | 负责人 | 完成范围与交接条件 |
| --- | --- | --- |
| 后端实现与首次交接 | Codex | 完成 P1–P4 的后端职责和相关验证，提供准确源码、接口、约束与验证结果，再交 Claude Code；实际后端缺口不能转嫁给前端。 |
| 前端与组装 | Claude Code | 完成 P5 前端并组装真实前后端接口，交回可运行改动与验证记录；后端权威缺口交 Codex 修复，不在 Browser 补造。此阶段不负责 P6 硬切、旧执行链清退或结束分支。 |
| 硬切、清退与最终验证 | Codex | Claude Code 完成前端与组装并回交后，执行 P6 原子硬切，清退旧执行链、入口、配置、专用资产及测试，保护仍有业务用途的共享服务、真实数据、未知效果与费用历史；完成组装后整体回归和最终验收核对。 |

后端首次交接与最终产品验收是两个节点：后端职责仍有缺口时不能提前交接；尚未实施的 P5、依赖前端组装的 P6 和最终整体验证，也不倒挂为首次后端交接必须完成的工作。Claude Code 完成组装不等于最终 Gate 通过；最终验证按实际证据核销，不另加独立审查前置流程。

两次交接均沿同一任务分支与同一 Plan/Record，保留本机修改；当前继续后端，不提前前端、P6、合 main 或结束分支。后续 main 集成、推送和分支清理仍按届时用户指令与 Governance 执行。

## 3. 正式实现工作包（E1 阶段顺序）

| Stage | 主工作包与需复用的权威 | 前置依赖 |
| --- | --- | --- |
| **P1 — Host Foundations** | Native PlanDefinition/Draft/Publish/CAS、RunLedger/Checkpoint/TaskGraphRevision/RunIdentity/NodeAttempt、Storage/GC/可授权 Host RPC；保持纯 JS 逻辑与 Node Server 分离 | 当前开发授权 |
| **P2 — Graph & Effect Core** | G2 GraphPatch/Delegate/Handoff/Fanout/Join/Planner/Judge/Review、S2 EffectIntent/Approval/EffectReceipt/unknown/reconcile、D3 重试/循环、Host Scheduler permits | P1 Host identity/ledger |
| **P3 — Native Ports & Budgets** | D4 唯一 Hybrid/Context/Actor、D5 Model Routing/Compute 原预算/Provider fallback/Reuse、Tool/Skill/MCP/A2A Secret/Egress 权限、原业务 DomainReceipt refs | P1/P2 |
| **P4 — Product Consumers** | Native Game/Ordinary RP Narrator/Player autonomy、Session World/Command/Timeline、Studio Project Agent Task/Review/Apply、Experience/Evolution targets 与原 M1 Eval | P2/P3 |
| **P5 — U2 Frontend（Claude Code）** | Serene Canvas Agents Plan Library/Graph+Inspector/typed Ports/Draft/Publish，Run Timeline 默认/Graph 切换、Host Projection/Diagnostics/Approval/Source/Cost 与移动端 List/Sheet | P1–P4 新权威 API 与可信 UI contract |
| **P6 — Atomic Legacy Hard Cut（回交 Codex）** | 同任务分支一次性切换全部 RP/Native Game/Studio/Agent/Search/Shell/Evolution 的原生入口，删除旧五模式/编排代码/Browser checkpoint/旧 preset UI/旧 mode 事件注入/专用测试 | Claude Code 完成 P5 前端与组装并回交；P1–P5 替代已准备与真实消费者闭包 |
| **P7 — Final Verification（回交 Codex）** | 按既有验收取得组装后真实客户端、平台、Engine、必要外部服务/性能/质量证据，核销最终 Gate；不新增独立审查前置流程 | P5 组装及 P6 替代/清退；相应后端证据可提前取得 |
| **P8 — Integration & Close** | Codex 完成整体最终验证后，按届时用户指令执行 main 集成/推送、同一 Record 和已完成分支清理 | P1–P6、最终验证与 Governance |

## 4. 接口与清退专项工作包映射

| Workstream | 需要补全的真实依赖 | 阻断的阶段 |
| --- | --- | --- |
| **W01 Authoring/Data** | 旧 `agentWorkspace`/SettingsRepo CAS、PlanDefinition/Revision、版本和源资源、旧数据 no migration/旧私有缓存清理 | P1、P6 |
| **W02 Host Ledger/Recovery** | Native Scheduler/RunControl/FS/SQLite、原 charge attempt、effect operation identity、unknown/crash-reconcile、独立 MCP Journal 边界 | P1–P3 |
| **W03 Graph/Core** | 旧 `agent-runtime/orchestration-engine` 纯函数可提炼范围、G2 Node/Join/GraphPatch、所有 mode 依赖清除 | P2、P6 |
| **W04 Source/Context/Compute** | Actor/Memory/Hybrid/Information/World、Provider/Route/Budget/Local Work、source revocation/ref validity | P3 |
| **W05 Tools/Security** | Skill/MCP/A2A Tool discovery/grants、Secret/Endpoint/Approval、Plugin host/native domain ports、外部未知任务 | P2–P3 |
| **W06 RP/Game Consumer** | `capability-host.js`、`native/play-generation.js`、`experience/llm/*`、旧 Director 旁白和 Message Takeover 用途，原 World/Turn/Output | P4、P6 |
| **W07 Studio/Evolution Consumer** | `project-agent-executor.js`、`project-agent.js`、Studio Review/Commit、`evolution-targets.js` 与 Prompt/Strategy Preset target 重构 | P4、P6 |
| **W08 U2 UI & Shell** | `atria-shell/workspace-host.js`、Shell Search、Graph viewer、旧 Workspace Panel、Serene Canvas/手机输入与审批 | P5 |
| **W09 Hard Cut & Evidence** | 旧模式/适配/JS/CSS/测试/配置导入一一核对，关键信息迁移仅正式业务权威引用、真实数据不被误删 | P6–P8 |

## 6. P3 收敛边界与结束条件

P3 核销原 Native Ports、授权传播、预算与恢复合同，不以完成所有 P4 业务图/角色/检索组合为前提。当前唯一能力状态表为 [acceptance-matrix](acceptance-matrix.md#p3--native-ports--budgets)，实施版本与验证只归同一 Record；不为每个小边界默认新增独立工作组。

剩余实现按端到端闭环组织，复用 W02/W04/W05：

1. **数据与计算**：显式 Source/Result 接收授权 → 原合法 Context → 原 Model/银行 → 合法 retry/fallback 与能力证明 → typed Result → 接收方重验。默认 brief-only 不扩大父私密权限；Reuse/continuity 由原能力承载，合法 miss/reset/unknown 不要求自建缓存或 KV manager。
2. **受限工具**：已发布 Plan/owned pin → 可信 producer grant → 原 S2 Effect → 原 Skill/MCP/A2A/Secret/Egress → 原 receipt/unknown。原 adapter 必须挂载生产链；不新增平行 Registry/权限服务，不开放缺原防线的 R3。
3. **有限恢复**：ready 且无 dispatch claim 经当前 Host 重新审核 Source/预算/新授权可继续同 Effect；dispatching/unknown 只查询/reconcile；已有 Result 经新 recipient 授权消费、不重执行。旧批准、额度、逻辑计数和已发生费用不得重置。

P3 结束须同时满足：单 Host/fence/epoch 权威；每项冻结必需能力的生产接线；独立 audience 与跨引用授权；原银行唯一计费与未知费用保留；上述有限恢复；Secret/Egress/批准及原领域提交边界；对应最终源码版本的必要验证。必需项不得仍为 IMPLEMENTATION_PENDING 或靠安全拒绝伪报支持。

明确停止条件：P3 必需项全部具备生产入口、原权威/银行、receipt/Result、版本化验证且无阻塞缺陷；其余事项有明确既有阶段/领域归属。没有实际消费者的全组合扩展不重开 P3；真实安全、一致性或冻结合同缺陷仍必须修复。完整 RP/World/Project/Evolution 消费者归 W06/W07/P4，原 Memory 算法、Actor cognition、World tick、Studio ChangeSet、Provider/cache 与 Eval 晋升语义留在原系统；不能以减少工作量为由取消冻结能力或保留旧编排兼容链。

必要测试保留 trust boundary、异步撤权、CAS、费用、unknown、恢复及 Engine 差异；共享不变量集中验证，各不同领域边界验证真实消费者。最终一次冻结字节矩阵，后续仅按改动/失败/风险选择复测，不以测试数或任务组数衡量进度。

## 7. W01–W09 物理交付与依赖清单

| 包 | 源码 authority / 依赖输入 | 具体产物 | 先后约束 |
| --- | --- | --- | --- |
| W01 Authoring/Data | Native contracts/identity/common + 原 Settings/Skills repo | 6个编排kinds中的Plan/Binding/revision及原Storage/RunControl域新key注册、Draft/publish API、严格 validator/hash；Settings old subtree、orch-preset 读写/restore 禁止重启旧协议；精确数据清单 | P1 authoring 先于 W08；硬切清理等 W06/W07/W08 替代齐备 |
| W02 Ledger/Recovery | Engine/原 journal、SQL Native CAS、RunControl、ProjectTask、Storage refs | RunRoot/record/command tx、§12 root guard/SQL session Owner与HostFence、host epoch、恢复扫描、GC pins、write-before-send saga；不是新 World/费用银行 | P1 基础；W04 预算身份规范须先对齐；P2 使用 fake Port，P3 才真实 send |
| W03 Graph/Core | W01 immutable Plan + W02 CAS/epoch + D3 | typed graph/whole patch、JoinReceipt、delegation/return、bounded counters、Review invalidation；抽离 prepared-context/envelope 共用 helper | P2；C08/C09 抽离先于任何旧目录删除 |
| W04 Source/Context/Compute | 原 Context/Hybrid/Information/Actor、GenerationHost/Model Route、RunControl/Project bank | SourceBinding/audience refs，原 authority reservation tree+stable attempt admit/observe/settle，fallback/unknown/parent high-water；§13原RunControl RPControl/controlId与稳定send identity，不再只以缺authority拒绝占位 | P3 真实接入；P4 output/currentness 前置；预算树不得由 W02 私有实现 |
| W05 Tool/Security | 原 Tool/Skill/MCP/A2A/CredentialTargetAuthority/SecretPort + W02 intent | action descriptor/version/hash/grant/egress，审批 challenge/一次消耗、真实Port reconcile、§15同Host独立Review Origin/原用户再认证、禁无保护R3；删旧 registry tools/scope hook | P2 合同→P3 Ports→P5 可信 UI；SDK 不能拿批准 capability |
| W06 RP/Game | W03–W05 + Session/World/Command/原ChatRepo/RPControl单输出consumer | capability boot/play-generation/experience runtime/narrative/rewrite 全部接新 contract；§14 writing单permit/单chat正文+marker/原DomainReceipt；旧 mode/guidance/takeover subscriber 下线 | P4 业务→W08 展示→P6 移除旧主链 |
| W07 Project/Evolution | 原 Studio/ProjectTask/Experience/Eval、W01 exact Plan refs、W03–W05 | Target authorize/catalog/capture/prepare/check/current/write/discard/evaluationSettings、Eval adapter/worker/fingerprint、promotion/rollback 原权限；旧 report 不自动 eligible | P4 业务；先替 evaluator/指纹/Settings CAS 消费，再删旧 presets/Director |
| W08 UI/Shell | W01 authoring + W02 projection + W05 trusted interaction + W06/W07 | Graph+Inspector/完整移动 List、Timeline 默认/Graph toggle、Source/Cost/Approval/Diagnostics、Search/deep-link/history/Back；旧 panel/CSS/labels 消除 | P5；原 Serene Canvas/Settings Theme 只引用不另建；真实功能等价后进 P6 |
| W09 Hard Cut/Evidence | C01–C18、两个审计附件、所有工作包替代接口 | 逐路径处置核对、AST/语义零旧执行引用、main delta复核 | P6 清退→P8集成 |

## 8. 同期领域方案边界与最终开发就绪复核

- [Storage Center](../atria-storage-center/index.md) 负责统计/完整对象闭包/回收站/原 ID 恢复。V3 注册 kinds/ref roots/active-run/unknown 效果保护，不能另造清理中心或用其“恢复”自动续跑、重发/返还费用。
- [Settings/Themes](../atria-settings-and-themes/index.md) 与 Serene Canvas 管通用设置保存、主题和 Shell 视觉；它的通用兼容不恢复 D2 已废止的 Orchestrator subtree/mode/scope。V3 只清旧编排字段，新 Authoring 不重复实现 Settings 服务；当前主题更新不要求 V3 强制固定浅色。
- 既有独立 MCP、Model/Memory、Game Runtime/Project、Experience/Eval 方案仍各持权威。未来 main 上同期改动先做精确 diff，不读取其它任务未提交草稿或把历史源基线当当前实现。
