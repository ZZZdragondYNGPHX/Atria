# D9 / E0 收口审计：真实消费者、合同缺口与开发前 Gate

> **E0_IN_PROGRESS / NOT_CLOSED（2026-10-15）**。D1–D8 的产品与交互合同已冻结，**视觉审美/最终前端视觉方案没有冻结**。本文件是该 Prompt Preset 深化 Plan 的唯一 E0 审计台账与下一步工作包索引；不是 V3 自己的 E0（V3 设计与部分实现有自己的 Plan/Record）。本次证据仅是 GitHub HEAD、default-branch 定向代码搜索、指定文件读取与设计交叉核对。无本地全仓 checkout、AST/反向依赖图、运行测试、CI、Provider API、E2E 或三端实机；**不能称完成全量消费者审计**。

## 1. 远端静态锚点、审计方法与局限

- main 初次静态阅读：5eb3bc7652cd9837ca8c555cf74976fab078932c；提交前已变为 73557f8098d2353f23777a35e25042e94742bec9（Storage Center 合并，新增/修改 Source/Resource/Recovery/GC/backup/Settings 等多种消费者，需要刷新闭包）。
- docs 起点：e4719ad9b3b165f2f68ec2ac3743fb0e8d2ca210；提交前 HEAD 变为 26667607066dd7ca27415f03fc63b01bc31ffdf2，4 笔其它存储/V3 记录提交，没有与本企划路径冲突，本轮基于新 HEAD 原子提交。
- 独立 V3 实现分支初次阅读：c04f36925189d4064a63bdd6b9ca345ff2bcf805；提交前更新到 cff1d24530967e8eba8668530ac17ae0b66ec334，新增 join-controller/attempt-settlement 与若干 Run/Attempt 消费者。原静态 Matrix 没有覆盖这些新增真实消费者。
- GitHub default-branch code search 针对 promptProgramRef、workspace-prompt、getPresetBinding、PromptCandidateStore、contextSlots、requirePilotSources、mountPromptPresets、orchestrationMode、mountPromptEditor；**部分结果数触及 topn=30，只是有界样本而非全匹配证明**。搜索只覆盖仓库默认分支，对独立 V3 分支采用已知精确源码路径直接读取。
- 已交叉阅读 V3 单 Native Host、C2 Context、N2 Narrative Quality、Graph Editor 与接口/Implementation 合同。文档中 V3 标准不自动意味着 main 已接上这些端口。之后任何 E0 结论需要以开发前实时 HEAD 重新核对。

## 2. 已定位消费者及待闭包范围（STATIC_ONLY）

| 区域/实际入口 | 静态发现的代码或合同 | 需要下一步证明；不能当完整闭包 |
| --- | --- | --- |
| Library/Prompt Presets | main:public/scripts/native/prompt-presets.js、prompt-authoring.js、public/scripts/atria-shell/library-runtime-workspaces.js；新 Program/Module 和已有分类/原生 exact refs | 所有 create/edit/delete/archive/fork/used-by/export/import、Draft dirty/leave、原 Library/Package/Project 的反向引用与 Run/Play binding；无新旧双 UI |
| Play/Runtime/Settings | main:public/scripts/native/runtime-workspace.js、prompt-runtime-controls.js、runtime-readiness.js；main:src/endpoints/native-generation.js | Route-owned Prompt Choices/parameters、Session/Studio/Project/Package 角色与 source scope、诊断、权限与预览入口的所有动态调用；旧 Settings 字段/导航真实消费者 |
| Native Compiler/Model | main:src/native/model-prompt-runtime/{route-resolver,prompt-compiler,contracts,prompt-renderers,generation-service,compiled-binding,context-providers}.js、src/native/adapters/{http-generation-provider,native-messages-provider,responses-generation-provider}.js | 受信 Node Program 与 Route Program 选型、Fallback/Token/Provider role、Native Context source、实际 send/preview 同一 Compiler 与 capabilities、Source→Wire 的 trust 决议 |
| Ordinary RP 与旧 Orchestration | main:public/scripts/agents/orchestrator/main.js；public/scripts/native/experience/{index,llm/runtime,llm/narrative}.js 含 orchestrationMode/director 选择；public/scripts/atria-shell/workspace-host.js 有 workspace-prompt-previews 导航 | 全部旧 mode/preset/Workspace/Director/Canvas/Generator 的 API、dynamic imports、Settings/Session/Chat/Save/Play 读取链；正式实现必须硬切移除并保留真正独立的 RP/World 业务数据 |
| Experience/Eval/Evolution | main:src/native/agent-intelligence/{evolution-targets,evolution-service,evolution-evaluator,evolution-observer}.js、evaluation/quality.js、model-prompt-runtime/prompt-candidates.js | workspace-prompt/workspace-strategy/Director 与原 Evolution journal/promotion/rollback 的真实读写；V3 plan-prompt、新 Module → PlanRevision → Binding CAS、source_unready 的完整受审案例/评委证明 |
| Native Studio/Project/Package | main:public/scripts/native/prompt-authoring.js 的 Studio 工具；src/native/{package-composition,dependency-closure}.js、src/native/authoring/resource-graph.js | Studio A1 ChangeSet/Review/Apply、Package 原件只读、Project/Scope exact references、Save/Export/Import/Archive/Delete/GC、Plugin/Skill/Media 的合法依赖图，不能随旧模式清退删除仍在使用的原 Native 数据 |
| Context/Hybrid/Cognition | main:public/scripts/native/context-compiler.js、src/native/model-prompt-runtime/context-providers.js、src/native/information-authority.js；V3 C2 与 HCM-01–08 文档 | RP/Native Session/Package/Project 各受众 source refs、branch/variant/worldTick/grant/Disclosure、ContextSlot Role、长会话 source-complete packet 和缓存/currentness 实际消费；不能在 Prompt 层注册第二 Memory/Info Writer |
| V3 已见实现与计划边界 | V3:public/shared/native-orchestration-contracts.js（Node kind/agentPinId/dependencyPins）、src/native/orchestration/{plan-repository,run-repository}.js、src/endpoints/native-orchestration.js（已知 Authoring API）；V3 D9 interfaces/implementation-plan | 当前读到的 V3 Endpoint 是 Plan Authoring 相关接口；尚未读取证明完整 Runtime Controller/ModelPort/Effect/Run/Output 主链。尝试精确读取 src/native/orchestration/controller.js 返回 NOT_FOUND，**不能因此推断运行时控制器绝对不存在，只能证明该路径未提供**。必须再查目录与 import graph |
| UI Surface 与测试 | main:public/scripts/atria-shell/*、public/scripts/native/{prompt-presets,prompt-authoring,runtime-workspace}.js、tests/atria-shell/{prompt-preset-receipt,prompt-authoring-p6}.test.js、tests/native/*、tests/agent-intelligence/{evolution-consumers,evolution}.test.js、tests/game-runtime/{llm-orchestrator-narrative,r5-exit-matrix}.test.js；V3 D8 Graph/Inspector 合同 | 前端 Screen/Route/Button/Surface/State/Permission/Action 的真实反向引用、跨端完整操作与旧 mode 专属测试删除/新真实集成替代；不能仅看截图或搜索若干关键词当所有消费者已审计 |

**当前引用闭包判断：PARTIAL/NOT_VERIFIED。** 搜索命中只能证明“存在这些路径与片段”，不能证明动态 import、注册链、Source adapters、入口条件、测试或第三方 Extension 的全部消费者均已覆盖。下一步需在开发前获得可信 local checkout、import graph/route & settings grep、精确 Owner/Run/Source 路径及单测反例证据；不要求仅凭本次远端存储报告伪造 E0 收口。

## 3. 跨合同差距与责任归属（均未宣称 PASS）

| ID | 实际差距/当前证据 | 必需的唯一责任落点 / 拟解决顺序 | 当前状态 |
| --- | --- | --- | --- |
| E0-01 | V3 Node policy.agentPinId / dependencyPinIds 与 Native RuntimeRoute.promptProgramRef 未证实独立有效 Behavior Program 进入 Provider；main GenerationService fallback 绑定 Route Prompt 并拒绝语义改变 | 先与 V3 Node/Plan/ModelPort owner 定义受信 exact Program Selection，保持 fallback 的 Effective Program/Route/Output/Cost 恒等与 Host 发送前验真 | BLOCKED / STATIC |
| E0-02 | 原 context.fact 可经 contextSlots → system 渲染；现有 Provider lowering 按不同 role/system 要求处理，D5 S2/L2 只是设计 | 原 PromptCompiler/ContextPort/ProviderPort 定义 Authorial Instruction、Host-only Policy、低信任 Source Data 的 Typed SemanticBlocks 与可信 role lowering，审计从 Source 到 Wire 的所有 path | BLOCKED / STATIC RISK；无漏洞复现 |
| E0-03 | D6 U2/E2/H2/V2 的真实 Audience/Source/Branch/Time 消费、长会话 atomics、压缩遗漏、Join/Disclosure/revoke 未通过 | 原 Information/HCM/Context 与 V3 C2/Run identity，先确保来源/currentness，再评价文学保真和缓存收益 | NOT_RUN |
| E0-04 | Native /preview 已提交 exact ref，不是未发布 Draft 可正式执行 API；三视图 Authored/Effective/Provider Wire 的同源证据与 CAS/Source invalidation 未连通 | 原 Host 的可信 draft validate/preview 隔离端口（纯编译，不 Secret resolve/send/write）+ 单一 Compiler + 原 Provider adapter 的脱敏 Wire；不能 Browser 拼接/覆盖 execute | BLOCKED / STATIC |
| E0-05 | requirePilotSources() 返回 source_unready；Q2/F2/O2 的新增文学/Agent/合法误拒 Profile 与实际审稿 calibration、独立 promotion 缺少本轮证明 | 原 Experience/Eval/QualityProfile 来源目录与 Worker；先收集真实授权、source-sealed 的 development/promotion 资料与有界 controls，再做新 Quality/候选 | BLOCKED / STATIC |
| E0-06 | EvolutionTargets 仍引入 workspace-prompt/workspace-strategy/Director；现 PromptCandidateStore 面向旧 Preset/Route 路径，V3 plan-prompt 设计存在但未证实完成 | 原 EvolutionTargets/PromptCandidateStore + V3 PlanRepository/PlanBinding；按 V3 已冻结 target union 确认真实 Node/Module binding、Publication Journal/CAS/Rollback，正式零旧兼容清理 | BLOCKED / STATIC |
| E0-07 | W2/R2/P2/I2/M2 的资源/权限/状态/三端功能尚只是设计；用户明确拒绝助手自拟视觉审美 | 原 Library/Studio/Play/V3 Shell/Graph/Run UI；本任务只冻结功能和必要交互。前端视觉重构另外等待用户的 Code Audit → 外部 AI HTML+两份文档 → 多轮确认，不预设风格 | UI SEMANTICS FROZEN; VISUAL OPEN |
| E0-08 | JS/Provider/Run/Storage/GC/CI/Windows/CachyOS Linux/Android Termux 未运行本任务所需质量和权限验证 | 分阶段原 Native Host/Source/Eval/Client 的有针对性验收；设计 E0 与实现阶段测试 Gate 分开，后续不伪造 PASS | NOT_RUN |

硬约束：D1–D8、V3 T2 单 Host、HCM-01–08 和旧 ST/Workspace/Director/API/mode **零兼容**；Prompt 概念不是 World/Source/Role/Tool/Approval/费用授权。无双读双写、无第二缓存授权、无第二会话/Prompt/Agent Writer。

## 4. 建议的实现依赖顺序（E0 前只是规划，不创建实现分支）

1. **S0：真正闭合消费者与协议设计**：补足 main/V3 代码的目录/动态引用、Server Endpoint、Settings/Prompt/Package/Studio/Play、Run/Cognition/HCM、测试矩阵、撤销/失败与二进制/GC，完成设计 E0 引用图；同 V3 owner 审查依赖和缺失的内部 Port，绝不先用新层盖旧系统。
2. **S1：先对齐 V3 与 Native Model/Prompt**：受信 Node Program vs Route Program/Effective Prompt identity/Output/Provider fallback/CAS/RunAttempt，以及 Role/source boundary；当前 V3 P1 进行中，后续实施以真实 V3 HEAD 为准。
3. **S2：原 Compiler/Provider/Context 语义增强**：S2 SemanticBlocks、L2 lowering、D2 graded diagnostics、K2 Safe/Stable-Dynamic Cache、T2 Context/final Provider wire 预算；沿源级权限/模块 exact refs。
4. **S3：D6 原 Context 消费与长会话校验**：同一个 Hybrid/C2 的 Actor/Source/Branch/WorldTick/Context audience、History/Memory/Promise/Belief、invalidation/continuation 与 G1 正常单 Narrator 热路径。
5. **S4：D7 Experience/Eval/plan-prompt**：已获准来源/QualityProfile 与 Judge controls、合法创作误拒对照、原 EvolutionTargets → PromptCandidateStore → V3 PlanRevision/PlanBinding CAS/rollback，清退旧 Workspace/Director consumers；只改已获准 Module。
6. **S5：D8 功能 UI/Inspector 与 Draft Preview**：Library/Studio/Play 同一资源编辑、无损 Raw/Structured、Host-only Preview/Effective/Wire/Diff、Quality Source Inspector、跨端语义完整；**视觉样式的具体重构必须等用户之后单独批准外部设计材料**，不借功能落地强行决定审美。
7. **S6：最小相关产品/端侧可靠性验收**：逐修改点做有证据的 Node/Host/Provider/UI/负例/恢复/权限验证，最后按涉及的 Windows/CachyOS Linux/Android Termux 功能/真实存储要求检查；费用和 Provider 质量的未知如实保留，不自行规定“千样本才能过”的非用户硬门槛。

实施顺序会随 V3 实际进度与授权调整：没有 Host 的真 ModelPort、Source/currentness、Eval target 时，后面的“完整 UI”不能提前宣称有效。所有 Stage 此刻都是 PLAN，非 DONE。

## 5. 创建实现分支的前置 Gate（严格区分设计与工程验收）

| Gate | 满足标准 | 现在的事实 |
| --- | --- | --- |
| **G0 Docs / decisions** | D1–D8 功能合同在同一 Plan/Record 冻结；视觉未冻结和用户指定的外部设计流程单独记录 | D8 语义可冻结；设计文档不是产品测试 |
| **G1 全量消费者 E0** | 真实 main/V3 精确 HEAD 下完成静态+动态进口/调用方/配置/测试/读写/删除/归档/导出/运行端点闭包；列明原权威和每个替代删除点。未能取到 local code/import graph/动态证据，不可写 PASS | **BLOCKED/NOT_CLOSED** |
| **G2 跨合同 E0** | E0-01..08 所需 Host/Compiler/Context/Provider/Evolution/Preview/Runtime 接口物理落点、版本、失败出口和测试责任可达成一致；不存在第二权威或已冻结合同的自相矛盾。可以有“实现后才可实测”的事项，但不能把接口未知冒充设计已闭合 | **BLOCKED/NOT_CLOSED** |
| **G3 开发授权** | 用户另行明确同意正式产品重构，并允许创建当前任务的实现分支。D8 对话和视觉样例都不构成授权；尤其用户明确要求 E0 未收口前**禁止建分支/改 main** | **NOT_AUTHORIZED** |
| **G4 前端视觉方案** | 用户在讨论完成后自行要求 Codex 全前端代码盘点，取得外部审美 AI 的**非全功能 HTML 风格参考 + 功能交互说明 + 整体视觉指导**，提交并与用户多轮评审后单独批准 | **NOT_PRODUCED；不在本轮决定美学** |

**分支创建 Gate = G1/G2 完成设计闭包 + G3 明示授权 + 当时合法基线/工作树检查。** G4 主要是后续**视觉 UI 重构**的独立前置，不可被本助手私自当作已通过；仅实现已经冻结的非视觉后端合同与用户后续授权可独立排期。实际运行/端侧/模型实测需在实施阶段取得，不能因为它们现在尚未出现就把设计 E0 定义成逻辑上永远无法完成，也不能把 E0 文档完成冒充产品 PASS。

## 6. 本轮 E0 的真实结论和下一步

- **D8 W2+R2+P2+I2+M2：用户明确要求冻结的是功能/交互语义，视觉由用户另行裁定；本文没有新增审美设计。**
- **E0 静态初步台账已建立；全量消费者闭包尚未完成，G1/G2 BLOCKED，因此 E0_NOT_CLOSED。** 这不是拒绝研究，而是如实保持现有验证范围。尤其 V3 独立分支继续开发，后续动态 port/consumer 必须按最新版本审计。
- 尚需核查：旧 Workspace/Director 所有真实调用、Run/Model/Source 与 PromptProgram Node 生效，ContextSlot 低信任角色路径，Eval source_unready/独立测试来源，Draft preview，UI exact resources，导入导出/备份/GC/权限/Provider/恢复，以及真正跨端功能。此时不写 PASS。
- 下一轮讨论建议围绕 **E0 真正闭包的调用者清单、五项物理合同补口与独立视觉设计交接**，但不得以本助手的视觉偏好给出页面风格或任何美术成品。E0 设计收口并获得用户明确授权前，不创建实现分支、不修改 main，也不创建 HANDOFF（除非用户要求正式交接）。

## 7. 提交前并发变更与最新消费者差分（补充证据；不构成 E0 闭包）

- 对 main 旧基线与新 HEAD 的 Git diff 发现 Storage Center 已合并：public/scripts/browser-resource-center.js、storage-management.js、storage-inspector.js；src/storage/resource-center.js、recovery-service.js、native-lifecycle.js、resource-catalog.js，以及 src/endpoints/native-generation.js、src/native/model-prompt-runtime/persistence.js、src/native/agent-intelligence/experience-repository.js、src/native/authoring/resource-graph.js 与多个 API/备份/GC/Settings/测试调用已改变。**在 E0-06 和 UI/Library 的消费者闭包中需要重新检查这些新 Source/GC/Recovery/Quota 依赖。** 这不是本任务修改 main。
- 对 V3 c04f.. → cff1.. 的 Git diff 发现新的 src/native/orchestration/join-controller.js、attempt-settlement.js 及 attempt-controller、graph-controller、run-repository 与 Join tests 变更。**跨 Agent Result/Source currentness 和 Run 收据需要纳入 E0-01/03 的最新消费审计**。原先精确读取 controller.js 的 NOT_FOUND 不能代表更新后的全部运行控制器；应按真实新模块树检查。
- docs e471.. → 266676.. 仅涉及另一个 Storage Center 与 V3 计划/Record 的文件，没有覆盖本 Plan/唯一 Record。采用新 docs 基础树并进行 expected_sha 的乐观更新，避免强推/覆盖他人提交。
- 因消费者持续变化，**G1 全量引用闭包仍为 NOT_CLOSED**；此差分是补充，不是全量真实运行审查。未做产品编译、真实 Provider/CI 或三端验收。用户尚未授权创建本 Prompt 任务的实现分支或前端视觉方案。
