# Atria Native Prompt Preset Deepening — 唯一 Record

- Task ID：`refactor/atria-native-prompt-preset-deepening`。
- Primary Workspace：`main`（未来实现，当前未授权修改）。
- Docs Plan：[index](../../plans/refactor/atria-native-prompt-preset-deepening/index.md)。
- 当前阶段：D1–D6 已冻结；D7 讨论草案已创建且 Q/F/O/P 四组尚未选择；同一份 Record 持续追加所有后续轮次。
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
