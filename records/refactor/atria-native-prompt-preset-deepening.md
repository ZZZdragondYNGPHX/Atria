# Atria Native Prompt Preset Deepening — 唯一 Record

## 2026-10-16 — 后端正式开工

用户授权正式开始，确认包含 D2–D8 全部后端，前端实现交 Claude Code。读取实际 Git、同一 Plan/E0/Record 和外部设计三文件；不冻结 §8.4 提案。起点 main=695acf3bc，docs=5101c3b3e，V3=618a04ae1；V3 仍在并发开发，原 Authoring bindings/生产 Model/Context/Source 未接通。既有各工作树 CLAUDE.md 删除、docs 外部设计草稿/截图及 agent-experience-evolution 未跟踪目录保持。当前接口工程决定见同 Bundle backend-implementation；验收仍 NOT_RUN，不把授权写为 E0 PASS。

- Task ID：`refactor/atria-native-prompt-preset-deepening`。
- Primary Workspace：`main`（产品）；当前实现分支 `refactor/atria-native-prompt-preset-deepening`，文档仍归 `docs`。2026-10-16 已授权正式后端实施，整体 E0 未收口，尚未集成 main。
- Docs Plan：[index](../../plans/refactor/atria-native-prompt-preset-deepening/index.md)。
- 当前阶段：D1–D8 功能/交互语义保持；2026-10-16 已实施可独立后端并提交 `760327891`。整体 D9/E0 仍 NOT_CLOSED；外部三份设计参考已收，前端由用户交 Claude Code，未由本任务实现或冻结审美。
- 起点：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`；`docs@6254dd1e73a44564824ca5b0a8c6d24ee0ace030`；V3 branch `c04f36925189d4064a63bdd6b9ca345ff2bcf805`。以上仅核对时刻，不替代后续实际检查。

## 2026-10-15 — D1 方向冻结与 D2 文档先行

**用户授权与决定**
- 选择方案 B，RP 文笔与 Agent 行为并重；继续融入 V3 单 Native Host，正式重构无 ST/旧 API 兼容。
- 加入强创作者“破限”需求：成年人虚构 RP 表达和高强度可编辑提示词；研究公开 2024–2026 Jailbreak/Prompt Injection 高级机制，不复制不稳定攻击 payload。
- 先创建并提交同一 Plan Bundle + Record，然后进入第二轮深入讨论；当前**没有授权**改动产品分支/main。

**真实工作**
- 远端静态阅读 `src/native/model-prompt-runtime`、`public/scripts/native`、`src/native/agent-intelligence`、旧 PromptManager/注入及 V3 企划/实现状态；不是全量依赖闭包。
- 查阅 ACL 2026 技术分类、Anthropic Many-shot、2026 Roleplay 机理研究、ICML OR-Bench 误拒、GEPA/ACE、SillyTavern Prompt Manager/STscript、Gemini 公开安全设置等来源。
- 在 `docs` 增加 Plan 的 index、decisions、baseline、research、creative-injection 与这份唯一 Record；不建立 HANDOFF、不创建产品工作分支。
- 设计候选 J1/J2/J3、作者编辑自由度 F1/F2/F3、Provider 拒绝归因 R1/R2/R3 均为 **OPEN**，不伪称已冻结。

**证据等级与限制**
- 实际：仓库文件与外部资料经远端静态读取；GitHub 文档树提交/可读取状态将在写入后核对。
- 未执行：本地 checkout/静态脚本、Node tests/build/CI、LLM/付费 API 调用、Provider 内容测试、PC/Windows/Termux 和 Browser/UI。
- 未来 E0 需重核 V3 HEAD、Prompt Render 角色/信任边界与实际领域消费者；研究来源中提到的攻击效果不得记为 Atria 产品性能。
- 下一步：D2 以 `creative-injection.md` 讨论作者可控的高级注入语义、成熟虚构文本表达、模型路由/误拒分类；获用户明确选择后下一轮按先更新提交文档再讨论的约定执行。

## 2026-10-15 — D2 正式冻结 J2 + F2 + R3；D3 文档草案开始（仅 docs）

**用户冻结决定**
- 选择 J2 编译型 Authorial Control、F2 可视化控制与完整自由编辑并存、R3 拒答归因+合法优化候选+用户手动选择已支持模型路由。
- 重视 RP 文笔与 Agent 行为，并保障成年人合法虚构题材的作者文学表达，不让 Atria 自己仅凭题材造成泛化误拒或道德说教；不虚构 Provider 安全可调能力。
- 正式重构零旧 ST/Workspace/Orchestrator 数据和接口兼容；遵守 V3 单 Native Host、原 Memory/World/Context/Model/Run/Experience/Eval 权威，禁止重复引擎。

**本轮工作与真实证据**
- 文档轮次起点：`docs@073d03f0f16d2826cf7cb8e5ff2015c168229a70`；静态基线：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`；V3 开发分支 `c04f36925189d4064a63bdd6b9ca345ff2bcf805`。
- 远端读取同一 Plan 的 index/decisions/creative-injection/research、本 Record 与 docs Governance，以及现有 V3 N2/C2、PromptCompiler、Prompt targets、Agent Quality 和上轮 §17 expression 研究；无全仓扫描声明。
- 更新本 Plan index/decisions/creative-injection，新增唯一 D3 模块 narrative-behavior.md 并追加本 Record。D2 已冻结；**D3 E/A/K/G 选项均只是候选**。
- 此记录与文档随同一笔 Git docs 树提交；具体新 SHA 由该文件的 Git 历史及实时 ref 验证，不在提交前伪造。

**未执行与下一步**
- 仅文档变更；没有 Node、集成测试、CI、真实 Provider API/拒答测评、Windows/Linux/Termux 实机、浏览器/UI 验证，没有产品代码变更。
- D3 讨论 E1/E2/E3（Expression）、A1/A2/A3（玩家控制）、K1/K2/K3（反全知）、G1/G2/G3（稀疏 Agent）。推荐 E2+A2+K2+G1 尚未冻结；用户明确选择后先更新提交同一 Plan 和 Record，再进入 D4。

## 2026-10-15 — D3 设计冻结 E2 + A2 + K2 + G1；D4 讨论入口（docs-only）

**用户已冻结**：E2 作者/场景/Narrator/角色表达分层，A2 玩家严格默认 + 仅真实获准的有限非关键叙述委托，K2 原 HCM/C2 Source/Audience/Disclosure 先行 + 独立文学成文审读，G1 普通 RP 单 Narrator 优先、按真实证据/预算启用其他 Agent。并维持 D1=B、D2=J2+F2+R3、成熟合法虚构 RP 创作自由、V3 单 Native Host、无 ST/Workspace/Orchestrator 旧数据或 API 兼容。

**真实工作**：
- 核对远端起点 `docs@6384cff476975ccb73ef9ef1ea17d539f0eae9be`、`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、`refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`；没有在本轮移动产品分支。
- 阅读同一 Plan index/decisions/narrative、V3 §11 Model/Context Port 与 Node/Plan 来源、`public/shared/native-orchestration-contracts.js` 当前严格 Node policy/`dependencyPins`、Native `RouteResolver`、`PromptCompiler` 的 exact Program/derive 入口，辨认 Node 与 Route 所选 Prompt Program 的实际差距。
- 仅更新同一 Plan 的 `index.md`/`decisions.md`/`narrative-behavior.md`，新增 D4 专项 `agent-behavior-binding.md`；在本唯一 Record 追加此轮。先提交 docs，再进入 D4；不创建实现分支、无代码变更。

**待验证和未完成**：
- D3 为设计冻结而非功能完成；A2 真实玩家有限委托授权接口、K2 成文泄漏审读、G1 稀疏 Agent 与 E2 Expression overlay 实现均未做实际验证。
- D4 B/I/C 全部为 OPEN；当前 V3 `node.policy.agentPinId` + `dependencyPinIds` 未证明可作为独立 Program 选择，Native `route.promptProgramRef` 的实际执行边界仍需未来 E0/实现解决。
- 未执行 Node/CI/Provider API/浏览器/PC/Windows/CachyOS/Termux 真机测试，未产生真实质量/Token/误拒测量。上述静态核对不等于执行验收。
- 下一步：第四轮讨论 Node exact Prompt/Route 绑定（B）、Native derive+E2 Overlay（I）、Host NodeAttempt 真实编译/回放（C）。推荐 B2+I2+C2，仅建议未冻结；待用户选择后再次先更新同一 Plan/Record 并提交 docs，再进入 D5。

## 2026-10-15 — D4 设计冻结 B2 + I2 + C2；D5 讨论先建文档（仅 docs）

**用户已授权的本轮内容**
- 冻结 B2：V3 Node 独立 exact Behavior/Prompt Program 与受信 Runtime Route 绑定；I2：使用原 PromptProgram.parentRef/derive 精确继承和 E2 表达 Overlay；C2：Native Host NodeAttempt 冻结可信 Program/Route/Source/Context 编译证据，并只调用原 PromptCompiler/GenerationService。继续 D1–D3、成年人合法虚构 RP 作者自由、K2/A2/G1、V3 T2 单 Host、零 ST/旧 Workspace/Orchestrator 接口/数据兼容。
- 用户特别要求不把当前 V3 Node 的 `agentPinId/dependencyPins` 等价为已接通的独立 Program，也不绕过 Native Route 的 `promptProgramRef`；原 V3 `plan-prompt` Evolution target/PromptCandidateStore/New PlanRevision/PlanBinding CAS 合同不得重复定义或破坏。
- 本轮只在 docs 更新并提交同一 Plan/Record，再进入第五轮讨论，不创建实现分支，不修改 main。

**核查与实际工作**
- 写入前远端核对 `docs@5a85c83dac2fe30caf02d3c5cdd1f3fafc50446a`、`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、V3 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。
- 按需复读本 Plan index/decisions/D4、本 Record、docs Governance §1–15、V3 contracts §11、`public/shared/native-orchestration-contracts.js`、RouteResolver/PromptCompiler/GenerationService/PromptIR/PromptRenderers/provider adapters/ContextCompiler 相关静态代码；没有全量文件或最新 V3 功能实测。
- 特别核实 `GenerationService` fallback 会比较 `route.promptProgramRef`，不一致报 `generation_semantic_authority_changed`；当前 Node policy `agentPinId` 和 `dependencyPins` 没有可证明的独立 Program→Provider 运行接线。保留为 D4 真实工程阻塞而非宣称完成。
- 同一 Plan 更新 `index.md`、`decisions.md`、`agent-behavior-binding.md`，新增第五轮 `semantic-ir-lowering.md` 作为 OPEN 草案，并在**本唯一 Record** 追加 D4 决定与相关静态核查。
- 参考 2026-10-15 公开官方 Prompt Caching/Tool-Caching/Gemini Context Cache/Reasoning 文档设计下一轮候选；文献不等于当前 Adapter 所支持的真实能力。

**验证与未完成**
- 仅远端 Git 树提交/文件可读取核对；本轮未做 Node/构建/CI/真实模型 API/Provider 内容/浏览器/Windows/CachyOS Linux/Android Termux 实测；没有产品代码提交，也没有授权 V3 Schema/ModelPort 改造。
- D5 五组 S/L/D/K/T 候选全为 **OPEN**；推荐 S2+L2+D2+K2+T2 尚未冻结，不自动采纳。D4 具体 Host-only Program Selection、Context role 漂移、fallback、Evidence 与 E0 消费者闭包属于未来真实实施与验收。
- 下一步：进入 D5 讨论原 Native PromptIR 语义化、Capability-aware Provider Lowering、分级可解释冲突、缓存与真实 Token/Compute 预算；获用户选择后先提交同一 Plan/Record 再讨论 D6。

## 2026-10-15 — D5 冻结 S2 + L2 + D2 + K2 + T2，D6 讨论准备（仅 docs）

**用户冻结与边界**
- D5 选择原 Compiler 内 Type SemanticBlocks（S2）、Provider Capability-aware Lowering（L2）、硬错误/需作者选择/软文学警告三级诊断（D2）、Source/Audience/Version/Model 隔离的 Stable/Dynamic Cache（K2）、原 Context 候选选择与 Provider 最终 wire 计数/Compute 实际准入（T2）。
- 维持 D1–D4、成年合法虚构 RP 的作者指令自由、V3 单 Native Host、原 World/Memory/Cognition/Context/Model/Experience/Eval/RunControl/TaskScheduler 权威；正式重构不兼容 ST 旧数据、旧 API、旧 Orchestrator Workspace/mode，不建双读、第二 Compiler/Context 或预算账本。
- 用户明确要求保留 `contextSlots` Role 来源隔离与 V3 Node Program/Route Fallback 的真实工程阻塞，不得把静态设计文档写成已实现或已测试。

**本轮静态核查与文档工作**
- 写入前核对 `docs@fe14771d300e3efc541ce4fc4d79f478a5ee498e`、`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、V3 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。完整读取 `docs:README.md` Governance，重读本 Plan index/decisions/D5 与同一 Record、V3 C2 Context/HCM-01–08/Hybrid Memory/Behavior Context，以及相关 Native Context Compiler/Provider 静态代码；未重扫全仓。
- 同一 Plan 更新 `index.md`、`decisions.md`、`semantic-ir-lowering.md`，新增 D6 `context-memory-consumption.md`，本唯一 Record 只追加当前事件和状态。远端提交 SHA 以随后 Git HEAD 核对为准，不在文档预先伪造。
- 源码事实：`context.fact` 可能经 `contextSlots` 渲染为 `system`，属于必须审查的 Source/Role 信任边界，尚非漏洞复现或修复证据；V3 Node `agentPinId/dependencyPins` 未证明独立 Program 已接通 Model；原 `GenerationService` 不同 Route Program Fallback 抛 `generation_semantic_authority_changed`，不允许隐形绕过。

**验证、阻塞及下一阶段**
- 仅 docs Git 对象/commit 和远端文件读回验证；本轮未执行 Node、构建、CI、Provider API、真实内容/缓存/预算测试、Windows/CachyOS Linux/Android Termux 真机或浏览器/UI。D5 的实际 SemanticIR/Lowering/诊断/缓存/双阶段预算仍未交付。
- D6 `U/E/H/V` 四组候选 OPEN，推荐 `U2 + E2 + H2 + V2` 只是讨论提议，不得提前写为冻结；HCM-01–08、V3 C2/N2 等权威不重新决议。
- 后续 D6 用户选择后，仍先更新并提交同一 Plan Bundle 与本 Record，再进入 D7 Experience/Eval、文学质量、合法误拒与 Prompt Candidate 演化讨论。未授权创建产品实现分支或改 main。

## 2026-10-15 — D6 U2 + E2 + H2 + V2 正式冻结；D7 文档先行（docs-only）

**用户已冻结及适用边界**
- D6 **U2**：每个受信 NodeAttempt/Actor/Narrator/Judge/Tool 依原 Source/Audience/Grant/Branch/Time 取得自己的合法 ContextPlan，跨 Delegate/Join 的 SourceRef/ResultRef 消费前重新授权。延续 V3 C2/HCM-02 的旁白与 NPC 认知分离，显示与可读权限分开。
- D6 **E2**：Source-backed World/Observation/Belief/Hearsay/Promise/Hypothesis/Disputed/Unknown 等逻辑认识状态保真；“检索到/角色误以为/历史许诺”不能变成已提交 World Truth、当前 NPC 意愿或玩家授权。
- D6 **H2**：原 Context lanes/required/atomicGroup 与 D5 T2 预算之内采用 Source-preserving 历史/角色/情节/承诺/Memory/Spine 分层；摘要带来源/覆盖/遗漏/版本，不写新 Memory/World 或把压缩等同 Actor 遗忘，避免长 RP 只剩贫乏提要。
- D6 **V2**：按 Source/Actor/DisplayGrant/Branch/Variant/Time/ScopeEpoch/Plan/Route/Prompt 的实际依赖定向失效，在候选读取前、编译/发送前、Join/披露消费前复验；依赖不明保守拒绝，不把 hash/TTL/Provider continuation 当成授权。
- 保留 D1–D5 全部冻结方向，V3 单 Native Host、原 Context/Memory/Cognition/World/Source/Display/Compute/Experience/Eval 权威；正式重构对旧 ST/Workspace/Orchestrator 数据、接口/mode **零兼容**。当前用户明确不授权创建实现分支或修改 main。

**本轮实际阅读/文档工作**
- 读取前核对远端 `docs@d313901de1221a9639cae009f6de73f432700d5e`、`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、V3 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。
- 按需读取原同一 Plan 的 index/decisions/context-memory-consumption、同一 Record、`docs:README.md` Governance、V3 §11 `plan-prompt` 与 Narrative Quality、Agent Intelligence `m1-feedback-evaluation.md`，以及 `main:src/native/agent-intelligence/{evolution-targets.js,evaluation/quality.js}`、`src/native/model-prompt-runtime/prompt-candidates.js`；仅定向静态核查，未全仓再审。
- 参考 [ICML 2025 OR-Bench](https://proceedings.mlr.press/v267/cui25a.html)、[AAAI DMT-RoleBench](https://ojs.aaai.org/index.php/AAAI/article/view/34768)、[DSPy GEPA](https://dspy.ai/3.3.0/api/optimizers/GEPA/overview/) 的评价/反思方法，不将公开论文成功率视为 Atria 运行效果。
- 更新**同一份 Plan Bundle** 的 `index.md`、`decisions.md`、`context-memory-consumption.md`，新增第七轮 **OPEN** 模块 `quality-evolution.md`，在本**唯一 Record** 追加历史；不创建 HANDOFF、不修改既有 V3/C2/HCM 专项方案或其 Record。
- 第七轮 Q/F/O/P 四组设计均为待用户选择，推荐 Q2+F2+O2+P2 不等于正式冻结。

**真实阻塞/证据等级**
- **既有接口仍未实现或未核实通过**：`context.fact` 经 `contextSlots` 渲染成 `system` 的来源信任风险未实测修复；V3 `agentPinId/dependencyPins` 与独立 Node Program/原 Route Program 的最终模型调用和 `generation_semantic_authority_changed` fallback 未打通。D6 U2/E2/H2/V2 仅定义新 Prompt 消费/压缩/失效的设计目标，没有产品质量/性能实证。
- **D7 真实消费者缺口**：现有 RP `rp.m1.information` 只覆盖 player_agency、promise_application、knowledge_boundary、continuity、actor_voice、narrative_response 等维度；还需受审文学/长期/过度拒答质量来源。当前 `requirePilotSources()` 仍直接返回 `source_unready`；`EvolutionTargets` 仍有旧 Workspace/Director targets；`PromptCandidateStore` 的现有 Route/Library 流程不等于 V3 `plan-prompt` target/PlanRevision/PlanBinding CAS 的产品链已运行。
- 本轮仅远端 Git 文档提交与提交后文件读回验证；**NOT_RUN**：Node/Jest/build、CI、外部模型/Provider API、合法误拒真实实验、浏览器自动化、Windows/CachyOS Linux/Android Termux 真机、V3 运行恢复及 Snapshot 评价。
- 下一 checkpoint：开始第七轮 Q（质量向量）、F（原 Experience provenance）、O（合法误拒）、P（Prompt 候选/Review/Publish）深入讨论。用户决策 D7 后先更新并提交同一 Plan/Record，再进入 D8；未完成 E0 前不得宣布实现已可开工或已通过验收。

## 2026-10-15 — D7 正式冻结 Q2 + F2 + O2 + P2；D8 讨论草案（docs-only）

**用户冻结的产品设计**
- **Q2**：原 RP/Agent 质量报告保留重要 Hard Constraints 与有来源的文学文笔/节奏/角色 voice/长篇连续/Agent 任务效果的多维 QualityProfile，硬 World/Source/Display/玩家授权/正式副作用错误不可被文学高分抵消；长篇评价必须有相应有效样本/跨度。
- **F2**：复用原 Experience/Feedback/Diagnosis，对用户 explicit preference、客户端 observation、Host checker/Receipt、Model Judge 仅推测、unknown 保留来源和证据级别；仅诊断为真正 Prompt/局部文本目标的问题进入 PromptCandidate，Context/State/Runtime/Model/Evaluator 缺陷另行归因，不做二次 Feedback DB。
- **O2**：合法成年虚构 RP 的无端说教、回避、淡化与明确 Provider content block 分别评价，维护 benign/negative controls，不把“任何拒答都算失败”或越狱成功率作为优化目标；Atria 不以成熟文学题材泛化降级用户创作指令，遵循实际 Provider 功能、权限与适用规则。
- **P2**：确有来源与获准的 Development Feedback/Diagnosis 才生成局部反思候选，按原 Eval/QualityProfile/独立 Promotion 保留多目标差异（可参考 GEPA/Pareto，但不新建 Optimizer）；`PromptCandidateStore` exact Module、原 V3 `plan-prompt` target、Review → immutable PlanRevision → PlanBinding CAS / publication journal reconcile 是唯一发布/撤回路径。旧活动 Run/World/权限不得被候选篡改。
- 保持 D1–D6、V3 单 Native Host、原 Context/Model/Experience/RunControl/Memory/World 与 Creator 自由文本、Player Agency、Source/Display/Compute 权威；正式重构无 ST/Workspace/Director/旧 API/mode 兼容或双轨。

**本轮真实远端核查 / 文件工作**
- 读取时核实 `docs@a1afa889780f67fc5fc930dd4ac8d17904f7bdfe`、`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、V3 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`；读取完整 `docs:README.md` 和本 Plan index/decisions/D7/Record 的相关模块。
- 复查已有 Library/Studio/Play 提示词 UI：`main:public/scripts/native/prompt-authoring.js`、`prompt-presets.js` 与 `src/native/model-prompt-runtime/README.md` 的 committed exact preview 和 Route-owned choices；比对 V3 的 Graph Editor、Run Timeline/Inspector、移动 List/Sheet 和单 Host Projection 设计，避免新建第二组 Graph/Run UI 或 Prompt 资源写入者。
- 按本轮决定，仅修改 `docs:plans/refactor/atria-native-prompt-preset-deepening/index.md`、`decisions.md`、`quality-evolution.md`；新增 D8 OPEN `preset-studio-experience.md`；将本段**追加至同一份 Record**，保留 D1–D6 历史。D8 W/R/P/I/M 五组全部待选，不提前冻结。

**实施/质量阻塞与真实验证状态**
- `main:quality.js` 的 `requirePilotSources()` 仍为 `source_unready`；实际新增文学/合法误拒受审来源/校准和长篇独立 Promotion **NOT_RUN**。旧 `EvolutionTargets` 的 Workspace/Director consumers 未实际清退，V3 `plan-prompt` 与 PromptCandidate/PlanRevision/PlanBinding CAS 真实生产链未核实跑通。
- D4 V3 Node 独立 Program/Route 实际接线与 `generation_semantic_authority_changed` fallback；D5 `context.fact → contextSlots → system` 来源/Provider Role；D6 Source/Audience/Branch/WorldTick/Grant 复验与长会话压缩质量仍为未实现或未测证据，不能因 D7 冻结而删除阻塞。
- D8 尚未实现结构化/原文无损双编辑器、未发布 Draft 真实有效 Preview、Provider wire/semantic diff、Quality Inspector 和三端等价。现有 `/preview` 的受权 committed refs 不是通用未发布/可执行 Draft 端口；无权限不得暴露私有 Source、Secret 或隐含思维内容。
- 本轮仅远端 Git 文档提交、更新后读取文档和 ref 的核验；**未运行** Node/test/build、CI、模型/Provider API、浏览器 E2E、Windows/CachyOS Linux/Android Termux 真机或真实调用/成本/质量测试；不做产品分支、更不触碰 main。
- 下一 checkpoint：第八轮 W（Library/Studio/Play 信息架构）、R（F2 raw+structured 编辑）、P（有效 IR/Provider Preview/Diff）、I（质量与错误证据 Inspector）、M（PC/移动全功能对等）。建议 W2+R2+P2+I2+M2 **OPEN**；用户选后继续「先更新并提交同一 Plan/Record，然后 D9/E0 审计」原则，未收口不创建实现分支。

## 2026-10-15 — D8 冻结 W2 + R2 + P2 + I2 + M2；D9/E0 静态首审与审美归属（docs-only）

**用户已冻结 D8 功能与交互语义**
- W2：Library/Studio/Play 现有三域原位协作，保留精确 Native Prompt/Route/Plan/资源归属；R2：同一 Draft 的结构化设置与完整自由作者原文可无损编辑，不能静默删除/改写；P2：Authored/Effective/Provider Wire 三视图、准确 Source/版本 Diff 与真正 Preview/Execute 区分；I2：有来源的质量/拒答/Host/Provider 故障 Inspector；M2：Windows/CachyOS Linux/Android Termux 可完成相同合法功能、移动触控和屏幕阅读支持。
- 用户明确表示**不信任本助手的前端审美**，D8 **只冻结功能、状态和交互边界**，任何具体配色、布局美术、字体或按钮造型不由本助手决定。历史 Serene Canvas/V3 UI 仅作为已存在的代码/设计依赖，不是本次视觉重构获得的新视觉授权。
- 用户**将来**计划在讨论完成后，让 Codex 全面检查前端源码，整理必需按钮/界面/控件及功能，并交给其他有前端审美的 AI 生成**不要求全功能、仅为引导审美的精致 HTML**、**逐功能应如何表现的说明文档**和**整体前端指导文档**。用户将这些结果再交回多轮讨论，单独确定最终 UI 视觉企划。当前无该 HTML/文档交付物，未委托本助手擅自画界面。

**本轮真实静态核查**
- 写入前确认远端 docs@e4719ad9b3b165f2f68ec2ac3743fb0e8d2ca210、main@5eb3bc7652cd9837ca8c555cf74976fab078932c、V3 refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805。
- 读取 docs Governance v1.5、同一 Plan index/decisions/D8/本 Record、V3 自身的 E0/Interface/Implementation/Graph Editor 设计、main Native ModelPrompt README、原 Prompt Authoring/Presets/Runtime/Library Shell/Generation Endpoint、Quality/Evolution 与原编译器/Context Renderer、V3 当前 Node Contracts/PlanRepository/RunRepository/Authoring API 等文件，均为定向远端源阅读。
- GitHub default-branch code search 以 promptProgramRef、workspace-prompt、getPresetBinding、PromptCandidateStore、contextSlots、requirePilotSources、mountPromptPresets、orchestrationMode、mountPromptEditor 等词定位主要 main 读写/调用链；多个查询最多只取 30 项，且搜索未覆盖独立 V3 分支及所有动态消费者。V3 controller.js 精确路径读取返回 NOT_FOUND，不因此声称运行控制器绝对不存在。
- D9 初步静态台账涵盖 Library/Studio/Play/Settings、Native Compiler/Provider、普通 RP/旧 Workspace/Director、Memory/Context、Experience/Eval/Evolution、Package/Export/GC、V3 新 Host/Source/Plan、UI/测试参考。**不是全量可执行导入/路由/动态绑定闭包**。
- 本轮仅在 docs 更新同一 index、decisions、preset-studio-experience，新增独立 D9 E0 模块 e0-audit.md，并更新这份唯一 Record；不创建额外 Record/HANDOFF、不修改既有 V3/HCM 方案或任何产品分支。

**保留阻塞、缺口与后续 Gate**
- D4：V3 agentPinId/dependencyPins 尚未证明独立 Node Prompt Program 经可信 Host 到最终 Provider；原 Route promptProgramRef 和 generation_semantic_authority_changed fallback 仍需接线/实测。
- D5：context.fact → contextSlots → system 的 Source/Role 信任边界仍为 STATIC RISK/NOT_RUN，不称已发现可利用漏洞或已修复。D6：U2/E2/H2/V2 的 Source/Actor/Branch/WorldTick/Grant/long-session invalidation、压缩质量与 Provider continuation 未证实。
- D7：原 Quality requirePilotSources 的 source_unready、旧 EvolutionTargets workspace-prompt/workspace-strategy/Director 未清、V3 plan-prompt/PlanRevision/PlanBinding CAS 端到端发布与独立 Promotion 真实数据仍未完成。D8：未发布 Draft Host-only Preview、三层真实有效 Diff、Provider Wire/Inspector 与三端操作未经测试。
- D9/E0 当前为 **IN_PROGRESS/NOT_CLOSED**：完整代码消费者闭包、动态导入/设置读写/业务接口/导入导出/GC 与跨合同物理方案尚未闭合，不能宣称 E0_DESIGN_READY。用户明确要求 E0 收口前不创建实现分支、不修改 main；即使将来设计 Gate 完成仍需用户单独明确授权。
- 当前完成的仅 GitHub 文档树原子提交和提交后文件/分支读取验证；本轮 **未执行** 本地 checkout、Node/Jest/build/CI、真实 Provider API、E2E/截图、Windows/CachyOS Linux/Android Termux、正式 Run/Source/费用/质量的真实验收。设计阶段不自创调用配额/硬性测试数量。
- 下一工作重心：D9 查漏真实调用图/消费者、Host/Provider/Context/Quality/Preview/发布接口归属及实施依赖、G1/G2 设计 E0 收口前置，视觉审美等待用户后续外部材料而不抢先设计。


**提交前并发分支核查补充（本轮 E0 仍 NOT_CLOSED）**：准备 Git 对象期间，docs 从 e4719ad9b3b165f2f68ec2ac3743fb0e8d2ca210 更新到 26667607066dd7ca27415f03fc63b01bc31ffdf2；compare 确认新 4 笔 Storage/V3 文档提交不涉及本任务五条路径。main 另由外部 Storage Center 合并推进至 73557f8098d2353f23777a35e25042e94742bec9，V3 另由 Join/Attempt 结算推进至 cff1d24530967e8eba8668530ac17ae0b66ec334，均**非本任务写入**。新 Storage/Source/GC/恢复与 V3 Join/Result 消费者需要追加 E0 全量引用与差分审查；本轮静态首审在旧版本读到的内容不得冒充新 HEAD 已完成动态审计。提交将基于实际新 docs HEAD，无强制覆盖。产品/Node/Provider/Windows/CachyOS Linux/Android Termux 验证仍未运行。

## 2026-10-15 — 第九轮 E0 本地续审与全产品前端研究（docs-only）

**范围、基线与并发保护**
- 用户授权本轮继续 E0 并全面盘点前端、提供外部设计 AI 输入，完成后提交/push docs；明确不开发新前端、不改 main、不创建本任务实现分支、不决定最终视觉。
- 实际起点：main `73557f8098d2353f23777a35e25042e94742bec9`，docs `0a758827eaed96713ab9efed25ef1a0fdf31674c`，V3 `99da3eadb34f66a34ad5b9c8a1d6c3e92732d63d`。main工作树干净。
- 过程中 docs 的 ab5461eb1/5e2117393/d2a3d21d9 等他人提交及其 Storage 预览保持；未纳入别人未跟踪的 agent-experience-evolution 企划。V3出现并发merge工作树后改用固定Git archive，只读核查，没有处理或覆盖其冲突。
- 最终源码证据：main `695acf3bcad1d42e331459189532a76056278bec`（其他任务合入Storage Center UI，非本任务修改）；V3 `31bef95723885c1547a9c3686200cbaf122799a8`（包含main@735 Storage权威及新transition/显式loop，未合main@695 UI）。已核新增drawer/二次确认/刷新状态、transition/schema/Run准入和测试差分，更新C09/C10/O09并按最新固定对象重建索引。docs并发ca43a0a84等提交保留，最终本任务提交号由Git历史追溯。

**实际研究和交付资料**
- 读取原同一Plan入口、decisions、E0、D8和相关D4–D7合同、同一Record、docs Governance、V3入口/物理接口；没有创建第二Record或新最终视觉Plan。
- 新增独立研究目录 [plans/architecture/atria-frontend-audit](../../plans/architecture/atria-frontend-audit/index.md)：四份分域功能清单、完整操作链/状态、组件和功能架构问题、跨端矩阵、外部设计AI委托、覆盖说明及固定源码索引。
- 正文覆盖189个业务功能/控件组，按保留/整合/重组/确认废弃分账；范围含Library/Play/Studio/Agents/Memory/World/Knowledge/Prompt/Model/Runtime/Settings/Skills/Plugins/Search/Regex/Media/Speech/Shared/Diagnostics/账户/存档/备份/Storage等。功能组不是单独可见按钮数量。
- 全tracked public JS/MJS/HTML/CSS（含init/lib facade/style.css与vendored库）、相关manifest、Android/Electron包装层做结构扫描：1,065文件、355,257行；883个JS/MJS的AST parse diagnostics=0。核心页面由真实route/mount/handler/client/service链人工复核；没有宣称逐行人工签完全部源码。
- 12份TSV研究附件：189行功能矩阵；2,390个JS控件工厂候选、1,221个HTML标签点、3,206事件注册候选、5,960 import/resource edges、1,164 service调用候选、1,945 CSS交互规则、main/V3 1,908 Router注册表达式与1,630 E0符号位置、1,065源码hash/范围、1,527个main测试树JS（含helpers/fixtures）目录及15个V3控制流测试目录；另有代表性测试消费者说明。候选包含旧代码/helper/事件总线/第三方库，不将数量当已验收功能。
- 使用web-design-guidelines的交互/无障碍检查方法；未制作美术方案、参考HTML或视觉token定稿。资料明确外部AI之后交付代表性HTML、全功能界面交互表现、整体设计指导；HTML遗漏不减正式功能。

**更新后的源码事实和真实阻塞**
- E0唯一台账改为本地续审结果；G1从“远端有界样本”推进为全域结构索引和核心链，但动态表达式/注册器/任意外部插件与Work UI、原SourcePort/替代删除消费者闭包仍PARTIAL/NOT_CLOSED。G2物理合同仍BLOCKED；没有伪称全量通过。
- 原RouteResolver仍使用Route.promptProgramRef，GenerationService fallback仍对Program变化报generation_semantic_authority_changed；V3 Agent/Dependency pin不证明独立Behavior Program到Provider。
- Context事实已细化：recent_raw/memory/narrative_spine已有user-history降权，不能沿用“全部Memory提为system”的泛化；其他context.fact/ContextSlot经system路径的typed trust/lowering仍需审查。已有compiledBinding/currentness/epoch/hooks不等于D6全Source/Actor/Grant/Branch/Time失效闭包通过。
- V3已有PlanRepository/Binding CAS内部能力、Attempt/Graph/Effect/Approval/Join/Settlement控制流；HTTP当前仍仅Plan Authoring，authoring-service对source bindings明确unavailable，生产Model/Context/Source/Output/Projection链尚未证明接通。
- quality.requirePilotSources仍固定source_unready；旧workspace-prompt/strategy/Agent Director target仍在；V3 plan-prompt候选→独立评价→Review→PlanRevision→PlanBinding CAS/journal/rollback闭环BLOCKED。
- Studio作品前端Draft Preview已有真实入口，不等于D8未发布Prompt Draft可信无发送编译接口已提供；D8全文无损双编辑/三层Diff/来源Inspector仍为目标能力。
- 修正旧盘点事实：当前Account已有可见Sign out与handler；Settings已为六类，新Storage Center已合main；Runtime readiness按adapter条件要求Secret。旧资料仅作线索，没有原样复制为当前结论。
- 正式重构零ST/旧Workspace/mode兼容保持；有效Memory/Goals/Experience/World/Skills/Search/Visual Director/Media等Atria原生功能不能随旧容器、目录或关键词误删。

**实际验证、限制与结束位置**
- 实际运行：Git状态/fetch/HEAD/diff/固定对象核查；文档本地相对链接/锚点、固定提交源码路径、Markdown表格列、功能ID与TSV结构；1,065份源码SHA-256复验；883个JS/MJS语法解析；git diff --check。首轮检查器把F流程编号误作功能ID，已修正并重检；文档换行警告已规范化。
- 这些是文档和证据完整性检查。**NOT_RUN**：产品测试/构建/CI、启动产品、Browser E2E、模型/Provider API、真实费用/质量/拒答评测、权限攻击/故障恢复、Windows产品端/CachyOS Linux/Android Termux/APK真机、读屏/性能。测试目录存在不算执行或通过。
- 外部第三方插件源码、用户作品动态UI、真实服务和跨端行为保留UNKNOWN/NOT_RUN；没有声称完整动态消费者闭包。E0-01..08及C1–C6继续在同一E0台账维护。
- 本轮交付止于研究/文档提交推送。G3本任务开发NOT_AUTHORIZED；G4仅完成设计输入，用户尚未提供外部三项成果并多轮确认；未冻结新视觉或正式开工。没有新建HANDOFF、实现分支或产品代码提交。

## 2026-10-16 — 可独立后端交付与 Claude Code 前端交接

### 实际提交、授权和并发保护

- 当前用户明确授权正式开始，确认包含 D2–D8 全部后端，指定 Claude Code 负责前端；离线前又授权非破坏性自主操作与子代理。该指令更新上轮 docs-only/不建分支限制；不把源于历史的 NOT_AUTHORIZED 恢复成当前许可门槛。
- Source 起点 `main@695acf3bcad1d42e331459189532a76056278bec`；创建同名 `refactor/atria-native-prompt-preset-deepening` 语义分支与独立源码工作树。实现提交 **`760327891149216dffdc1e3fa0c846496007a013`**（43 文件，2203 additions/148 deletions），已 push 同名远端分支。不是 main/V3 提交。
- docs 起点 `5101c3b3e`，期间其他 V3 任务提交 `411cda16d`、`820517000`、`b51d90eae`、`6e8e6d48f` 等保持。V3 从 `618a04ae1` 继续推进；本任务只读核对其已提交对象，未写入它的 Tool/Context/恢复/引用根工作树。最终观测 SHA 另由本节末尾记录。
- 全部无关 `CLAUDE.md` 删除、agent-experience-evolution 未跟踪企划、外部 HTML 的 `_build`/截图/Playwright 目录保持，不纳入本任务提交。本次只收录用户指定的三份设计交付文件和本任务研究/接口/交接文档。
- **未改前端实现、未改 main、未合入活跃 V3。** 整体 E0 未收口，保留活跃语义分支供原端口组合，未删除其他任务或自称完整任务终结。

### 完成的后端与真实消费者

| 范围 | 实际结果与落点 |
| --- | --- |
| D2 F2 / D3 E2 | 原 Module 可选 literal/template、表达 layer/actorId；Compiler 无损保留 raw（含任意花括号、CRLF/Unicode），原 Candidate/Package freeze 保留该语义；分层顺序与实际 Provider scope label 可解释，不改 Actor identity/World/Grant |
| D3 A2/K2/G1 | 唯一 Narrator 严格默认玩家自主权/表达与认知分离 policy；不增加模型调用。有限委托仍必须来自原真实授权，不能由 Prompt 自己申报；未声称模型行为已验证 |
| D4 B2/C2 | 原 Host.execute 的可信 options → scheduler → Resolver/Compiler/Provider 已闭合，并保存 Route 原声明 ref 与实际 selected ref。实际 ContextPlan 交授权回调检查；Browser JSON 禁 programSelection。不同 Route fallback 锁 Program/作者语义/参数/输出/工具/网络/原预算；合法 Context/Memory 重选不被误判成换作者合同 |
| D5 S2/L2/D2/K2/T2 | SemanticBlocks 与原 IR 投影一致校验，Host policy/author/evidence/dialogue/tool/input/prefill 分账；facts/Persona/Memory/检索证据不再通过 ContextSlot 升 system，caller system/developer task 文本无损降数据。原 Provider render/count/send 一致，不支持的 role 排序继续拒绝；compiledBinding 包含新语义，指纹不发权限或证明 cache hit |
| D6 Source-aware | 原 Context currentness port 在 compile/send/preview 消费点调用；Host 重读原 Session/Project/Task，Secret 后与每个实际 send/retry 前再验。普通无 runtime Session 与暂存 World 投影回归问题已修，原背景/可选计算/计费权威保持 |
| D8 Draft | 认证 `/preview/draft`、原 `/resources` 指纹、原 exact reader 上临时同身份草稿；现有 Library/当前 Project 三类资源、三层输出、同源 Diff/复验、无 send/Secret/write。原 Program/Route/发布没有被 Browser draft 替换 |
| D8 私密 Inspector | 确认原 Narrator context 可含 private data 而 displayGrant.item=null；旧 Preview、新 Draft、execute JSON/SSE 和 retained result 均补独立 Browser consumer。私密/无法证明完整展示权的 Preview 拒绝；成功执行回受限摘要而不泄露 IR，也不改成失败诱发重复计费。保守不支持的 Knowledge/Memory/derivation/processing/expression Preview 明确报披露拒绝 |
| D7 / R3 | 原 QualityProfile 增 rp.narrative/project.agent/rp.creative_refusal，硬维度不抵消，来源/怀疑/Host 验证分开；认证只读 `/quality-profiles` 暴露 true BLOCKED/source_unready。三原 Adapter 按官方明确字段识别协议拒绝，专用 code 保留 usage、禁止内容拒绝 fallback，不从普通“抱歉”推断 |
| 原 Eval/Experience | 移除固定九对/六胜/1024 输出上限的评测消费者，按实际选择、原 Route 能力及来源资格验收，不降低独立证据和质量硬约束。修复 invalidation callback 与 reconcile 同 scope 重复 cleanup/CAS，晚到通知在同 Promise 从原 Journal 重读并 drain，失败可再恢复；不另建持久状态 |

产品 API/错误/范围权威说明已随源码提交：[Native Prompt Backend](https://github.com/ZZZdragondYNGPHX/Atria/blob/760327891149216dffdc1e3fa0c846496007a013/src/native/model-prompt-runtime/README.md)。细节不在第二份文档重造 schema。

### 实际验证和修复经过

以下组别有重叠，**不相加冒充独立测试总数**。均为本地 Node/合成 HTTP/原服务与存储测试，不是付费模型质量或设备 UI 实测。

| 实际组别 | 结果 |
| --- | --- |
| Compiler/contract/P4/P6/原 Candidate/Preset 与新 Binding/Source/Draft/Semantic，10 suites | **211 PASS** |
| 综合新披露/拒答/Host selection/Source/Draft、Provider matrix、原 P4/local-work/background budget、Quality/Feedback，13 suites | 初次 **272 PASS / 2 FAIL**；两项是原 private Information fixture 还要求 Browser preview 成功，已按独立 display 权限改为拒绝并保留零 quota 断言 |
| 上述预算重检 + Host selection + Semantic + invalidation，4 suites | **49 PASS**（含那两项已修断言）；未把之前失败覆盖成初次通过 |
| 演化原服务与原 RP/Project/Skill Worker 消费者，2 suites | **47 PASS**；包括实际本地 Worker/原 Compiler/Provider/账本与发布/回滚，仍不是 V3 plan-prompt 或真实文学质量 |
| 最终 Host Program 真实 ContextPlan 回调 + Binding，2 suites | **24 PASS** |
| 原 Provider matrix + 新拒答，2 suites | **73 PASS**；四 Provider JSON/SSE、unknown/普通截断/自然语言、usage settle、automatic/confirm/disabled 不重发 |
| 原 Info/S16 与新 disclosure，3 suites | **73 PASS**（InfoSession 最终限 FS/SQLite）；新 execute/retained JSON/SSE/来源撤销例已在综合组通过 |
| 最终晚到 invalidation 竞争/失败重试 + 原 correcting-feedback FS/SQLite | **5 PASS**；此前真实 rollback_conflict 根因是后台 callback 与显式 reconcile 竞争，不再归咎源码指纹变化 |
| 其他针对性验证 | 新 Draft 14、Semantic 16、Binding 21、Source 12、Host selection 3、Feedback/quality/sealed 26 等分别通过（与上表重叠）；全部修改 production JS ESLint、相关新测试 ESLint、JS syntax、git diff --check 通过 |
| 研究/设计输入完整性 | 189 audit IDs 与全功能文档表行各一次，无 missing/extra/duplicate；HTML 内联脚本静态语法解析 1 份通过；三指定文件已核实际存在 |

失败诊断保留：初轮旧测试曾要求 World current state 为 system，已改为 evidence 角色断言；IR 被篡改未更新 SemanticBlocks 现在明确拒绝。Source guard 首轮把无 runtime 的 undefined 当 JSON hash、把 provisional World 当 committed state，分别修 null 正规化与原 source capture 后复测通过。原 Provider 单元 fixture route:{} 没有合法 role，补 fixture 而未放宽 production hash。原 Studio/评测 system envelope 混合来源文本触发 history_authority，改正确数据边界后原消费者通过。初次默认 SQL 矩阵有 Pg 认证失败及旧 fixture API 漂移；未修改数据库或凭证，最终本任务存储证据限定 FS/SQLite，不能称 SQL 全矩阵通过。

**NOT_RUN / 没有借用他人 PASS**：真实付费 Provider、文学/成熟合法虚构误拒/长期因果/风格收益、独立 promotion 材料校准、完整 V3 Node/Plan-prompt/Output/审批恢复、全产品浏览器、CachyOS/Android Termux/实机/读屏/性能/构建/CI。用户报告外部 HTML 在 headless Chrome 的检查不是本任务执行结果；本任务只做其静态脚本/功能映射检查。

### 前端交接、剩余 Gate 与结束位置

- 用户三文件收录在 [design-proposal](../../plans/architecture/atria-frontend-audit/design-proposal/atria-function-presentation.md)；可直接转交的 [Claude Code 提示词](../../plans/architecture/atria-frontend-audit/claude-code-frontend-prompt.md) 包含全产品范围、真实 API/状态、三端/测试要求和 Source/权限边界。没有修改它们的审美，也没有新建正式视觉 Plan 或第二 Record。
- 功能架构项：旧 Agents 容器清退与有效挂载迁移、共享资源/草稿/反馈、深链与统一 Back/层栈、Library/Studio/Play 职责、Source/权限真实状态和多种恢复语义。颜色/字体/材质/造型/具体动效与布局审美留三参考及用户/Claude 讨论，不由本后端任务定稿。
- **整体 E0 NOT_CLOSED**。仍缺 V3 真正 Node Program admission/受众/输出/投影、plan-prompt exact Candidate/PlanRevision/Binding CAS + 原 publication journal/reconcile/rollback 的生产消费者闭环，以及 reviewed development/独立 withheld promotion/长期质量来源。旧 Workspace/Director/评测消费者需随 V3 和前端同切清退；没有为赶工留兼容 shim，也没有把当前仍在运行的旧链写成已删。
- 原 V3 集成时保留它新增的 orchestrationSend/Budget/Context/Tool/Source 接线，并组合本提交的 programSelection/currentness/Typed Compiler/Browser projection；不要择一覆盖 GenerationHost，也不要把同一请求准入/计费两次。其实际 Run/Binding/receipt 仍由原 V3 控制。
- 本次停止于已提交的可独立后端和前端交接资料；未向 main 合入跨任务未闭合组合。保留当前分支，不以未完成的全任务名义删除它或其他活跃分支。当前不足是具体生产依赖/真实评价材料，不是另设模型数、样本数或审批。

最终远端/本地 readback：实现 HEAD 与 origin/refactor/atria-native-prompt-preset-deepening 同为 `760327891149216dffdc1e3fa0c846496007a013`，源码工作树干净；main 仍 `695acf3bcad1d42e331459189532a76056278bec`；docs 提交基底已含并发 `6e8e6d48feacc6c4e037b5c11649afbb4c2837b4`。V3 最后观测 `4e0ce4bad896b45e6fd384554c13effd05790308`，新增 Tool/A2A/维护保留已提交，authoring bindings 与 production 路由边界补核后原 plan-prompt/Node 组合 Gate 仍未完成；不把另一任务的 SQL/Tool 测试写成本任务 PASS。docs 最终提交号从 Git 历史追溯，不预写自身 hash。

设计三文件首次纳入 Git 后暴露 HTML CRLF 与文末空行检查问题；随后只统一文本换行/文末空行，`git diff --ignore-space-at-eol --ignore-blank-lines` 无内容差异，复验 `git diff --check`、8 文档/81 本地链接、189 ID 一一映射均通过。没有改视觉值、样例功能或脚本逻辑，也没有为此重跑或冒称浏览器验收。

## 2026-10-16 — V3 中间前端范围并入统一交接

- 收到原 V3 任务的范围同步（不是最终后端完成交接）；按原已授权的全产品前端/Claude 交接范围补充同一提示词，没有开始开发前端或替原 V3 完成未交付后端。
- 实际 Git：本 Prompt source 仍 `760327891`、干净；main 仍 `695acf3bc`；docs 当前包含并发 `8f7458358ea8724acfd694c4ca84f3bdc31ad2f4`；V3 source 当前 `4a62ba5cc`。无关 CLAUDE.md 删除和设计构建/截图/其它企划继续保持。
- 读取原 V3 Plan index → backend-integration、D8 graph-editor-experience、acceptance §9.1、interface §17.15–17.19 及同一 Record 第五至十组当前证据。统一前端新增 Plan Library、Graph/Inspector、移动 List/Sheet、Timeline/Graph、Source/Audience/Cost/Unknown/Diagnostics、可信 Review Origin 与 Shell/业务连接矩阵；不新建第二视觉、状态或审批权威。189 基线不是 V3 新功能上限。
- 原 Plan Authoring 七个 POST 子路径是当前实有 API；Run/Binding/Projection/Approval 等仍未挂载，实际领域授权、角色/后台 quota、P4、P6 和三端/质量等尚未完成，P3 Gate NOT_READY。中间内部 callback/已存在控制器不等于产品可运行；未借用另一任务测试作本任务 PASS。
- 原任务报告 merge-tree 对 V3 `4a62ba5cc` 与 Prompt `760327891` 的 generation-host/execution-utils 内容冲突；contracts/prompt-candidates 双方修改自动合并仍需语义复验。此处只记录其预演报告，**本轮没有实际 merge、解决冲突或执行组合测试**；两边预算/Source/Typed Prompt/Browser 隔离均须保留，P7 未过不合 main。
- 本次只同步范围/接口依赖；最终统一 Claude Code 交接仍需原 V3 后续实际完成通知、新 SHA/API/Gate 差异，不能把本次提示词更新宣称 V3 全部后端完工或可发布。

## 2026-10-16 — V3 第十一、十二组接口增量同步

- 实际读取 docs `b16075585`、V3 source `be95ab792`；核对原整合入口、接口 §17.20–17.22 和原 Record 第十一、十二组。此前 `4a62ba5cc`/`8f7458358` 保留为历史同步记录，统一提示词的当前引用更新为最新观察值；旧 merge-tree 报告不再表述为最新 HEAD 的完整冲突清单。
- 同一 Claude 提示词加入显式 `allowedPlanPinIds`、本 Node dependency 的 exact plan pin / 完整 revision integrity、空集合禁止与缺字段 invalid；不扩大委派授权、不兼容旧缺字段形态。A2A `a2a_send_accepted` 只表示原持久受理事实，不是远端完成、正文消费或重新发送/取消许可；原费用与 local ordinal 的未知只观察语义同样列入界面要求。
- 产品 HTTP 仍只有原 Plan Authoring 七个 POST，未凭内部 observe API 造产品端点。原任务的 FS/SQLite、指定 SQL 和四 Engine 子集证据仍归其 Record；本次仅文档核对，没有重跑或冒称本任务通过这些测试。P3 Gate 仍 NOT_READY，后续真实 scope/Session quota/持久 Port 与其余缺口仍由原 V3 继续实施。
- 未修改或合并任何源码分支、未改 main、未开始前端；保留 docs/V3 工作树已有无关改动。本轮文档验证和提交从实际 Git/检查输出追溯。

## 2026-10-16 — V3 第十三组 Binding 产品接口同步

- 实际 Git/docs 核对为 source `ce4a58de2`、docs `05c0b3570`；只读 HEAD 的原路由注册和同一 V3 Plan 整合入口、接口 §17.23、Record 第十三组。V3 活跃工作树另有 Tool/Effect/MCP/Skill 未提交子工作，保持原状，没有纳入本任务或当作已发布能力。
- 统一 Claude 提示词新增原三域 Plan 选择/Binding 功能行、真实 POST `/api/native/orchestration/bindings/get` 与 `/bindings/save`、read/mutation envelope、首次 null/后续 version CAS、来源撤销重放拒绝及只接受不可变已发布 Plan 的要求。明确只保存选择，不授 Actor/Model/Tool/Delegate 权、不自动启动 Run；Run/Projection/Approval API 仍未开放。
- E0 原静态基线保留，并明确链接 §8 后续增量；不再将历史 Binding unavailable 当当前事实，也不因 Binding 开放而宣称完整 plan-prompt 评价/Review/发布/rollback 链完成。P3 Gate 仍 NOT_READY，缺失后端仍归原 V3，整体 E0 NOT_CLOSED。
- 原 V3 的 FS/SQLite 61 项及新 Binding SQL NOT_RUN 归其唯一 Record；本次没有复跑或借记为本任务 PASS。仅更新同一交接材料与台账，不合源码、不改 main、不实施前端，相关文档检查从实际输出追溯。
