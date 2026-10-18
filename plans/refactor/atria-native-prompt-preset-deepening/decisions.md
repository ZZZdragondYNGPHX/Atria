# 跨模块冻结决定与待选项

说明：D1–D8 的功能与交互语义已由用户明确冻结；D8 不冻结视觉审美（由用户后续外部设计过程决定）。D9/E0 正在审计且未收口；设计文档不等于实现、验收或开发授权。

## D1 冻结，2026-10-15

1. **B：原生 Prompt/Behavior/Expression 深化**。既有 Native Prompt Module/Program/Compiler/Route/Context/Memory/Agent Evolution 继续使用，不另建第二预设内核。
2. **RP 文笔与 Agent 行为同等重要**：分别衡量文学表达、角色语言/角色行动和 Agent 任务结果，不能靠一个综合分掩盖差异。
3. **唯一 Native Host V3 权威**：Graph/Effect/Receipt、Memory/World/Session/Studio 状态与模型收费由原系统管理，Prompt 声明不提升领域权限。
4. **正式重构零旧兼容**：不为 ST 深度/后历史/绝对位置、旧 PromptManager 或旧 Orchestrator/Workspace 构造迁移、双轨、兼容层；不破坏新版原生资源正确性。
5. **高度作者自主权**：特别关注成年人合法虚构 RP、情色/浪漫等成熟题材的艺术与人物表达。Atria 自身不应将成人主题等同恶意输入或一律加入说教式拒答。用户可编写完整自定义指令、示例与作品创作偏好。
6. **先进破限研究必须进入企划**：研究角色框架、情境/长上下文、多轮、对抗优化、语言/格式变体及社区实践；重心是分析机制、有效控制与误拒，而不是将攻击载荷塞入生产默认模板。
7. **外部 Provider 限制**：区分真实 Provider API 可调设置、模型响应特性与不可改变的固定限制。绝不承诺 Prompt 能强行突破后者；严禁把不可信检索/Tool/世界书文本包装为系统权限。
8. **每轮文档先行**：第二轮开始先创建/更新同一 Plan Bundle 和 Record 并提交 `docs`，然后进入该轮讨论；正式开工前不动 `main`。

## D2 已冻结 — J2 + F2 + R3（2026-10-15）

1. **J2 编译型 Authorial Control**：正式作者指令与 Narrator Expression、Character Expression、Agent Task/Evidence/Constraints、Context/Memory/World Evidence 分层，经现有 Native Prompt Program/Module/Compiler/IR 编译；不新建独立预设引擎、DSL 执行权威、World/Memory/Tool 权限或重复持久层。真实 Schema 和 Compiler pass 留未来讨论。
2. **F2 结构化面板 + 完整自由文本**：普通作者可按文风、角色声音、节奏、成熟题材文学氛围设置；高级作者能完整编辑并精确版本化自己的原始创作指令、正反例和适用范围。两个编辑视图必须作用于**同一份原生资源**，切换/保存不得静默改写自定义内容或建立双权威。
3. **R3 诊断 + 优化候选 + 用户控制模型 Route**：区分 Host/Schema/Authority 拒绝、Provider 明确拒绝、模型疑似误拒、输出质量不足与未知；基于真实 Provider 能力展示可用路由、公开允许的设置和已有 Evidence/Eval/PromptCandidate 候选。内容拒绝不触发静默改换模型/供应商，不声称突破不可调限制；原有 Native 传输错误 fallback 合同保持原样。
4. **成年人合法虚构 RP 创作自由**：不得仅凭成熟题材、爱情、欲望或强文学表现，就由 Atria 自身统一插入说教、无端拒答或降级表达。保留作者明确的语言风格、情感强度与艺术控制，同时真实玩家控制权、World/Actor 知识、对外披露、适用法律和真实 Provider 限制依各自权威执行。
5. **先进破限/注入研究的用途**：机制层面研究 Role/Fiction Framing、Many-shot、Multi-turn、自动优化、语言/格式差异、Tool/Memory Injection；重点转化为合法创作指令、拒答归因、Provider 适配、来源可信度和文学评测。**不内置攻击载荷、不以安全规则绕过作为自动优化指标、不用伪造 system/developer role 或低信任来源越权。**
6. **V3 唯一 Host 及零旧兼容**：严格遵循已有 V3 Plan/Run/Effect/Receipt、C2 Audience/Disclosure、F2 Compute、N2 唯一 Narrator、原 Experience/Eval/Evolution 和精确资源引用；正式重构不做旧 ST Prompt Depth/Order/Attach、旧 Workspace/Director/mode 的迁移、fallback/shim/双读双写。

**冻结范围**：上述是产品语义与架构取舍，不代表代码、Provider 能力、训练集、质量、API 或端侧验收已完成。唯一详细定义见 [creative-injection.md](creative-injection.md)。

## D3 已冻结 — E2 + A2 + K2 + G1（2026-10-15）

1. **E2 分层表达**：作者通用指令/作品风格 → 场景/体裁 overlay → Narrator Style / Actor Voice 按来源、作用域与有效精确版本确定性组合；完整自定义原文继续可编辑。Narrator 文笔、Character Expression 与 Actor Identity/Cognition、Agent Behavior 严格解耦。优先复用原 Native Prompt Program/Module 与 Actor 表达资源，不另建 Style 存储权威。
2. **A2 玩家自主权默认严格、有限明示委托**：未获玩家明确输入/正式授权，不得代玩家决定重大选择、同意、承诺、核心情绪或提交新 World/Session 行动。作品允许在**原 Host/Source/Grant 可证明**的权限内进行有限非关键过渡叙述；如该授权接口尚不存在，应将该能力记为待实现/阻塞，不能靠 Prompt 自述完成授予。授权须有范围、来源、撤销与有效期的原领域语义，不预先另定物理 schema。
3. **K2 来源先行 + 成文审读**：依原 V3 C2/HCM 的 Actor/Source/Branch/Time/Display 先筛选 Context，未经许可的信息不能进入对应 Agent/NPC 的输入；Narrator 文学视角与 NPC 可知范围、玩家可披露范围分离。文学成文的暗示泄漏/错误事实由原质量回路做有证据的概率性审读，不声称天然绝对防泄密。保留合法宽视角、第三人称与多视角创作。
4. **G1 稀疏按需**：默认普通 RP 是单 Narrator 生成，不强制固定 Writer+Critic 或每角色一模型。显著信息矛盾、重要剧情/隐私风险、作者要求精修或可证明的质量缺口，再经原 V3 Plan/Run/Compute 触发 Planner/Judge/局部重做；不能重复正式副作用、跳过预算或将 Model Judge 误判说成确定性证明。
5. **自由写作与权限严格区分**：成熟虚构 RP 的文学强度与作者表达控制不改变角色人格、正式心智来源或玩家真实权限，不单因成年情感题材在 Atria 自动插入道德说教；外部 Provider 的真实限制、既有法律/安全与原 Host/Domain Authority 保持有效。
6. **权威与零兼容**：Actor Identity/Cognition/Information/World、Memory/Context/Disclosure、V3 Graph/Effect/Receipt、原 Experience/Eval 的合同不因本 Plan 再定义或加第二 writer。正式硬切不迁移 ST/旧 Workspace/Orchestrator 模式及接口。

**本轮冻结产品语义，不代表 E2/A2/K2/G1 的新代码、Model 行为、授权接口、成文审读或跨端验证已完成。** 本域唯一详细合同见 [narrative-behavior.md](narrative-behavior.md)。

## D4 已冻结 — B2 + I2 + C2（2026-10-15）

1. **B2 — V3 Agent Node 精确绑定 Program 与受信 Route**：Behavior Program 是原生 `core.prompt-program` 的语义用途，而不是新物理执行引擎；Node 的受信依赖应精确钉 `PromptProgramRef` 和有效 `RuntimeRouteRef`、相关模块/依赖闭包与角色/任务用途。V3 的 `PlanRevision/dependencyPins`、原 Library/Project/Package 资源 Authority 和 V3 Effect/Run 唯一 Host 保持有效，不另建 PresetBinding/模型路由。
2. **关键真实缺口不可被当作已实现**：V3 分支当前的 `node.policy.agentPinId`、`dependencyPinIds` 与 `dependencyPins` 仅建立 Agent/资源 pin 验证机制，**未证明可直接为 Node 选择并在真实 Provider 发送端强制执行独立 Program**；`main:RouteResolver` 当前从 `RuntimeRoute.promptProgramRef` 读取 Program，`/execute` 无普通客户端可信 Program override。实施前需与 V3 的 Node validator、PlanRepository、ModelPort、原 RouteResolver/GenerationService 协同确定最小的 Host-only 物理接线与策略，禁止向 Browser/外部请求开放任意越权覆盖。
3. **I2 — 原生精确继承 + E2 文学表达叠加**：复用 `PromptProgram.parentRef`、`derive(add/disable/replace/configure)`、exact immutable Module revisions、stage/conditions/typed parameters；在合法 Scope/Audience 下确定性选择作者/场景/Narrator/Character/Agent 表达组合。继承结构、冲突来源、模块决策与完整自由文本原文均须可追踪；不得隐式追随 Library latest，不因“文笔优先级”篡改 World/Memory/Actor/玩家权限。
4. **C2 — Host NodeAttempt 精确快照 + 唯一原生 Compiler**：V3 Host 在每次合法模型请求前确认已钉 Plan/Node/Program/Route、SourceBinding/Audience/Grant、Output/Tool 合同及预算，使用现有 `ContextPort/RouteResolver/PromptCompiler/GenerationService` 编译并取得 PromptIR/请求版本/输出证据。静态定义精确引用与动态 Context 当前性不同；不能把发布时 Context 永久视为有效。Browser 无权成为 Compiler/Run/Effect writer。
5. **Fallback 不可静默切换行为**：当前 `GenerationService` 会比较候选 Route 的 `promptProgramRef` 与首个 Route，相异即 `generation_semantic_authority_changed`；B2 所需的 Node/Route 解耦不得绕过该保护。内部实施必须明确有效 Program 身份在 fallback、Provider 能力协商、token 重计数、输出 schema、审核及恢复后的稳定性；不支持时 fail-closed 或原有的可信手动选择路径。
6. **Plan-Prompt 演化合同不变**：原 V3 §11 `plan-prompt` target、`PromptCandidateStore` → 新 `PromptModule` exact ref → 新 immutable `PlanRevision` → 原 `PlanBinding` CAS/回滚/复核，不能让演化直接覆盖活动 Run/Prompt Program 或改变 Model/Tool/World 权限。
7. **不增加无谓模型调用**：I2 的组合与 C2 编译是确定性处理，不把 G1 单 Narrator 常规回合变为固定多 Agent。真实模型/工具费用与预算仍交原 Native Compute/RunControl；Session、Studio、普通 RP 的域隔离与 D2/D3 创作自由/自主权/反全知继续有效。
8. **正式重构零旧兼容**：不使用 ST Prompt depth/order/attach、旧 Orchestrator Workspace/Director/mode、Browser 预编译器、旧数据迁移、shim 或双写；必须保持原 Native 新资源的 exact refs、版本/验收与安全。

以上只是**架构和必需的实施前验收门槛**；V3 真实生产消费、Host-only Program 选择、Route/fallback 改造、跨端产品验收均未执行/未核实通过。详细单一合同见 [agent-behavior-binding.md](agent-behavior-binding.md)。

## D5 已冻结 — S2 + L2 + D2 + K2 + T2（2026-10-15）

1. **S2 类型化语义 IR**：原 Native PromptCompiler 内区分正式 Authorial Instruction、V3 Agent Task、World/Memory/Tool Evidence、用户输入与 Host-only Policy；记录 SourceRef、Actor/Audience/Trust、Scope/Time/Branch、Stage/Target、精确版本与必需性。借鉴有序内容树、语义位置与带源贡献的设计原则，但仅在**现有 Program/Stage/Module 编排及编译产物**中承载：创作树是原生引用的投影，Contribution 首先是编译期的来源视图，Anchor 只表示候选语义定位概念；均不得先创建第二排序权威、持久资源表或 Compiler。独立贡献与正文宏的含义必须区分，宏展开不能提升来源权限。已确认单一显式排序方向：Program 的 Stage 列表决定阶段顺序，可信语义 target 决定跨边界的合法位置；同 target 内 Module 与受控 Anchor 采用一份作者明确顺序，不能同时再让 `priority` 或另一棵 UI 树决定最终位置。动态 Contribution 是受权 ContextPlan 的请求级投影，不能靠位置获得 Role/Grant。现有实现仍按 `target → priority → Module ID` 排序；所选方向并非已实现。继承合并、Anchor/Contribution 的物理字段及具体激活、失效、重建规则留后续确认。
2. **L2 Provider-aware lowering**：现有 ProviderPort 根据 Model/Connection/Route 的真实 Capability 与来源证明，把相同受权语义降为各 Provider 可支持的 role/system、tools、output schema、prefill、reasoning/cache 等 wire。缺少必需能力时明确拒绝/由用户决定，不能偷偷把低信任文本升级成 system/developer 指令或暗改作者自由文本。Provider 内容拒绝不触发静默跨供应商重发。
3. **D2 分级诊断**：hard-invalid（Source/Actor/Display/Tool/Output/Program/Context/Token 权限及一致性）、needs-author-choice（影响行为的模型能力/配置选择）、soft-style-warning（E2 创作文风冲突）。记录精确来源/有效修订；文学偏好不等同确定性规则或安全违规，Judge/Eval 仍按 G1 有证据时运行，避免成年虚构题材的泛化说教与误拒。
4. **K2 稳定/动态与权限域分区**：精确作者/Program/Tool schema 固定部分与 Scene/Memory/Actor/Branch/Turn 动态证据分别布局，只有相同有效 Owner/Model/Route/Program/Source/Audience/Grant/Scope/TTL 才能合法复用。现有 prefixFingerprint 等是诊断，不是访问授权或 Provider 命中证明；真实缓存收益从实际 Provider Usage 观察，禁止跨 NPC 私有知识复用。
5. **T2 双阶段预算**：原 Context Compiler/Hybrid Memory/Information 先按 required/atomic groups/lane minima/caps、Source 证明与输出 reserve 选合法证据；每个 Provider 最终 wire（含工具、输出合同等）再执行本 Adapter 的计数与 Capability/Context Budget 准入，必要 fallback 重新编译计数并保持有效 Node Program 与 Output/Tools。成本与真实费用沿原 RunControl/Compute/TaskScheduler，不借预测缓存或压缩进行超配；字节保守上界不是所有模型的精确 tokenizer。
6. **可信 Role 边界未修复**：当前 `context-providers.js` 可将非 history 数据投成 `context.fact`，经 `prompt-compiler.js` Slots 后，`prompt-renderers.js` 把 `contextSlots` 放入 `role:'system'`。须后续对 Context/World/Tool 来源到 Provider wire 的权限隔离做实测；这里只定位需要验证的静态边界，既不声称存在可利用漏洞，也不声称已修复。
7. **B2 Node/Route Fallback 未接通**：V3 `agentPinId/dependencyPins` 不能冒充独立 Program 已发送；原 `RouteResolver` 从 `route.promptProgramRef` 取 Program；`GenerationService` fallback 对不同 Route Program 报 `generation_semantic_authority_changed`。受信 Host-only Program 绑定、重编译与 fallback 权威仍要实施/验证，D5 SemanticIR 不自动解决。
8. **不重复基础设施/零兼容**：V3 T2 单 Native Host、D1–D4、原 Context/Model/Experience/Eval/RunControl/Memory/World/Actor 权威保持；正式重构不为旧 ST Prompt/Workspace/Orchestrator 数据、旧 API、mode、fallback 建迁移/适配/双轨。以上仅冻结设计及未来验收，不表示任何实现、模型性能或跨端已通过。

详细设计唯一归 [semantic-ir-lowering.md](semantic-ir-lowering.md)。

## D6 已冻结 — U2 + E2 + H2 + V2（2026-10-15）

1. **U2 每消费者独立受权 Context**：V3 NodeAttempt 由原 Host/Source Authority 计算 `sourceBinding/audience/actorId/taskPurpose/branch/revision/worldTick/grantDigest`，向已有 ContextPort 请求恰好获准的 Narrator、Actor、Judge、Tool 视图；Delegate/Join 接收方独立复验 SourceRef/ResultRef。HCM-02 B 旁白/NPC 分离默认和可选受权 A/C 叙事策略不变；Narrator 可读、NPC 已知、玩家可显示是三项不同权限，不能用 Prompt 声称授权。
2. **E2 类型化认识地位**：消费原 World/Session/Information/Cognition/Memory 的 World Truth、Committed Event、Observation、Belief、Hearsay、Promise、Hypothesis、Disputed、Unknown 等**逻辑证据属性**，带来源、Actor/Time/Branch/currentness；不额外建立一个事实本体、存储或 Memory Writer。历史承诺不自动证明当前履行/记得/仍愿意，角色 ToM 不变成别人的私有心智事实，检索分数不提升事实权威。
3. **H2 源完整的长会话分层**：在现有 SessionContextCompiler lanes、required/atomicGroup、coverage、T2 Context/Provider 预算基础上，优先保留当下正式 World/事件/角色 Identity/承诺及新输入，再依合法需求选择 Recent Raw 完整 TurnGroups、Narrative Spine、Memory/Knowledge 与 Scene/Voice 表达参考；压缩保留 `sourceRefs/hash/覆盖范围/遗漏/unknown/producerRevision`，不得替代原 Timeline/Memory/World 或假装角色真实遗忘。证据组放不下应明确 insufficient/blocked/review，不能裸截断前提。
4. **V2 Source-aware 定向失效 + 使用时复验**：Source/Actor Exposure/Grant/Display/Branch/Variant/Revision/WorldTick/ScopeEpoch/Route/PromptRevision 的相关变更，按照原 Authority 的依赖关系让相应 Context、Hybrid 候选、派生摘要、ResultRef、受限缓存和 Provider continuation 失效；检索前、编译/发送前及 Join/披露/消费前复验。可证明依赖完整时 targeted invalidation；缺证明时保守 miss/blocked，不能仅凭 TTL 或相同文本复用。
5. **强制保留原架构与文学目标**：V3 C2、HCM-01–08、HCM-02 Narrator/NPC 拆分、HCM-04 World Tick、HCM-05 角色遗忘、G1 普通 RP 零额外认知 LLM 目标、D3 角色表达/玩家自主权和 D5 S2/K2/T2 都不变。正常合法成人虚构文学不应因压缩丢失角色声音/伏笔/情绪而沦为故事梗概，但质量需按真实对照评价，不允许通过对低信任内容提权来追求美文。
6. **仍是设计而非产品实现**：未新建 Memory/Context/Source/Actor/Cognition/缓存授权或收费服务；现有 `context.fact`→`contextSlots`→`system` 的信任边界、Node/Route Prompt Program 与 `generation_semantic_authority_changed`、多 Agent 来源复验/缓存失效，以及长会话质量收益都保留为未实现或 NOT_RUN。正式重构不考虑旧 ST/Workspace/Orchestrator 数据、API/mode 兼容。

详细且唯一的 D6 合同见 [context-memory-consumption.md](context-memory-consumption.md)。原 Memory 检索策略、Actor 状态、World 事实、Permission/Display Authority 与 V3 C2 的详细物理定义不在本 Plan 复制或重开。

## D7 已冻结 — Q2 + F2 + O2 + P2（2026-10-15）

1. **Q2 多维受审质量向量 + 硬门槛不可抵消**：复用原 `Experience/Eval/QualityProfile`，保留 `player_agency/promise_application/knowledge_boundary/continuity/actor_voice/narrative_response`，在**受审的具体来源和适用案例**上拓展文学文笔/节奏/声音差异/场景推进/长篇连续/作者风格遵循/合法无端拒答与 Agent 任务证据、完成度。单场景只评价适用维度；unknown/N.A. 与相关来源版本明确标注。玩家代写、越权披露、World/Tool/Output/正式提交硬错误不得被文笔均分或审稿者偏好抵消。
2. **F2 反馈 provenance 与根因分离**：沿原 Experience 区分 authenticated 用户显式偏好、客户端接受/重生/编辑观察、Host 有据 checker/Receipt、模型审稿假设和 unknown；诊断 `prompt/context/state/runtime/evaluator/model/unknown` 真实支持程度。只有有来源并定位为可修改 Prompt 的缺陷才进入局部候选；Source 失效、Context 漏选、模型能力/Provider 明确拒答、Runtime 或 Evaluator 问题按原归属处理。模型自评不得自称 `verified_failure`，不能将生成完成或点击继续冒充用户审美满意。
3. **O2 合法成年虚构 RP 过度拒答专项**：为受支持的合法创作场景建立正/反控制、语言/文体/场景/模型适用性标注；分开 Provider 明确拒绝、模型疑似无端回避、答了却无端淡化、一般文学质量欠佳和原因未知。Atria 自身不因成熟浪漫/欲望/强情绪题材就插入泛化说教，不以攻击成功率或“任何拒答都算失败”训练；不能伪称外部 Provider 固定限制可由提示词解除或自动跨 Provider 规避。
4. **P2 条件反思 + 多目标评价 + Review/Publish**：复用原 `EvolutionTargets`、`PromptCandidateStore`、Evaluator/Experience 和 V3 §11 `plan-prompt` 的 exact `{bindingId,expectedBindingVersion,planRef,nodeId,promptModuleRef}`。只在已声明的局部 PromptModule 上根据合法、可信 Development 证据生成可审查候选，可借鉴 GEPA 类反思/受审 Pareto 探索，但**不新增优化执行器、Candidate/PlanStore/Judge/预算权威**；独立 Promotion 证据通过后，用户/可信 Review 发布新 exact Module → immutable PlanRevision → PlanBinding CAS，并按原 Publication Journal reconcile/rollback。活动 Run 不变，CAS 冲突不覆盖他人变更，Prompt 不得改变 Tool/Grant/World/Output 权限。
5. **真实评价证据资格**：Development 和独立 Promotion 依现有 split/provenance/Group/Source/Revision 防泄漏；被改名/复用的同源场景不能冒充独立样本；模型 Judge/用户偏好/Host 确定性校验各有证据等级，保留不利维度、未知、费用、失败、未达标与回滚事实。G1 常规 RP 不固定每轮启用 Judge/反思/重写，只有获准审稿或有证据缺口及合法预算时运行。
6. **本轮明确阻塞（STATIC/NOT_RUN）**：`main:quality.js` 的 `requirePilotSources()` 仍返回 `source_unready`，没有新文学/误拒受审来源或校准完成的证据；`main:EvolutionTargets` 仍有旧 Workspace/Director consumers，尚未证明 V3 `plan-prompt` 的 target/catalog/prepare/apply/Publication 与真实 Node 消费已接通；当前 `PromptCandidateStore` 面向原 Preset/Route，不等于新 V3 发表链通过。旧模式应在**正式实施**零兼容清退，不能把设计文档表述成已经删除。
7. **其它未验收项和原权威**：D4 Node 独立 Program 与 Route `promptProgramRef` / `generation_semantic_authority_changed` fallback，D5 `context.fact → contextSlots → system` 来源信任边界，D6 U2/E2/H2/V2 的长会话质量/Actor/Branch/Source-aware 失效均仍需真实测试。V3 单 Native Host、HCM-01–08、原 World/Memory/Context/Experience/Eval/Compute/Output/Reviewer 权威不变；正式重构无旧 ST/Workspace/API/mode 迁移或兼容。

**冻结的是产品语义与未来验收要求，不是实施通过、模型表现已提升或 UI 已完成。** 领域细则归唯一 [D7 模块](quality-evolution.md)。

## D8 已冻结 — W2 + R2 + P2 + I2 + M2（2026-10-15）

1. **W2 原生 Library/Studio/Play**：Library 管唯一版本化 Prompt Program/Module/Generation Resource 与引用/生命周期；Studio/Build/V3 Graph 管作品作者表达、Agent Node、Quality 与精确 Draft/Review/Publish；Play 只编辑本人受权 Runtime Choices/表达参数并呈现获准生效状态。三域共享原 Source/Route/Prompt/Plan 权威，不能出现第二 Preset/Run Store、Browser writer 或旧 Workspace 兼容。左侧 Program→Stage→Module/受控 Anchor 结构必须从同一 Authoring Draft 派生；排序交互只写原生 Authoring 顺序，不能在 UI 存一份“显示顺序”与真实编译顺序分叉。
2. **R2 结构化 + 完整自由原文同一 Draft**：D2 F2 永久有效；结构化字段、自由作者原文、正反例及其有效范围映射**同一**原生版本化资源。完整原文不可静默改写、删除、归一化；无法无损解析的文本原样保留，表现为可检查差异/冲突/来源/不可逆编辑提醒。Undo/Redo、dirty/leave、CAS、Draft/Review/Publish 需真实权限和可靠失败出口，不根据自然语言自称 role 改 Host 授权。
3. **P2 Authored/Effective/Provider Wire 预览和精确 Diff**：三视图分别展示原文字节/正式作者声明、可信 PromptCompiler + Source/Node/Route/Scene 得到的有效语义 IR 与 Module 来源、合法目标 Provider adapter 的 role/tool/output/Token 及脱敏最终 Wire。对同一组 exact Version/Source/Actor/Grant/Branch/Route/Provider/Compiler 证据进行 Diff；静态 Preview 与真实生成/收费/正式发布必须区分。**未发布 Draft Preview** 尚无经过验证的可信 Host 无发送编译入口，既有 production /preview 只允许正式受权 exact refs；不得以普通 Browser 预览覆盖 production /execute。
4. **I2 来源 Inspector**：复用 V3 Host Projection、原 Compiler/Provider/Context/Experience/Eval/Evolution 的错误和实际回执，分硬阻塞、待作者处理、文风警告、模型明确拒绝/疑似无端回避、文学/Agent 分维度质量、来源过期、真实 Token/费用/缓存未知，以及 Candidate/CAS 状态；按原受众显示脱敏证据与可跳转 exact refs，不能泄漏 Secret、NPC 私密心智、Provider opaque reasoning。普通创作只显示必要状态与正文，来源、激活原因、有效位置、Token/Trace 与 Diff 按需展开，不让调试信息淹没写作。Observer/Judge 判断不能冒充 World Truth。
5. **M2 Windows/CachyOS Linux/Android Termux 全功能**：Desktop/移动使用同一 Native Host/Source/CAS/Plan/Run/Effect/Result/Approval 合同并提供同等级完整编辑、Raw/Structured/Preview/Diff、资源导航、问题检查、Review/Publish。List/Sheet/Tab 只是手机与 Graph Canvas 功能等价的交互形态要求，不指定最终视觉布局/配色/字体/组件造型。实际键盘/触屏/Back/软键盘/无障碍/长文本性能以后续真实端侧证据验收。
6. **审美由用户及后续外部设计资料裁定**：本助手不得以自己主观审美作为 Atria 前端视觉结论；本轮只批准**功能信息架构、安全、状态、交互合同**，不批准颜色、风格、排版美术、按钮造型、HTML 最终稿。现存 V3/Serene Canvas 等视觉文件仅视作代码与历史设计依赖，需要后续与用户提供的新方案讨论协调，不自动等于新前端重构视觉批准。
7. **视觉设计材料与审批状态**：全前端功能审计及外部 HTML、逐功能表现文档、整体前端指导文档已于 2026-10-16 收到，作为原 [前端审计](../../architecture/atria-frontend-audit/index.md) 的讨论输入；189 项功能范围不因示例 HTML 缺失而缩减。用户仍须多轮审议后才批准最终视觉方案；设计参考不等于运行验收、产品代码或新架构授权。
8. **保留真实工程缺口**：D4 Node Program/Route、generation_semantic_authority_changed fallback；D5 context.fact/contextSlots/system 可信 Role 边界；D6 Source/Actor/Branch/WorldTick/Grant 失效和长会话证据；D7 requirePilotSources/source_unready、旧 workspace/Director 清退、V3 plan-prompt/PlanBinding CAS；D8 未发布 Draft Preview/有效 Prompt/Wire 可信预览与三端完整验证全部未实施或 NOT_RUN。V3 单 Native Host、HCM、Context/Model/RunControl/Experience/Eval/PromptCandidateStore 权威与正式重构零 ST/旧模式兼容保持。

本轮的唯一详细功能与 UX 合同见 [preset-studio-experience.md](preset-studio-experience.md)。视觉设计决策待用户批准新的视觉参考与多轮讨论；不得将“功能冻结”写成“审美冻结”。

## D9/E0 启动静态审计（NOT_CLOSED；见 [e0-audit.md](e0-audit.md)）

2026-10-15 本地续审已补全产品静态索引和核心挂载/handler/服务链，独立研究资料见 [全前端审计入口](../../architecture/atria-frontend-audit/index.md)。详细消费者、接口差距、并发HEAD与Gate仍只归E0；实际工作只归同一Record。本轮不重开D1–D8，不决定视觉，不创建实现分支或改main；外部AI之后的代表性HTML不承担全功能范围权威，完整功能仍以正式合同与源码审计为准。

- 检索/读取 main 与 V3 的真实消费者、动态 import/注册、Source/Prompt/Provider/Memory/Experience/Evolution/Studio/Play/Settings/普通 RP/测试入口；必须区分已定位与尚未闭合的引用。
- 对跨合同缺口、实现阶段依赖、真实阻塞/未知、Source/权限/质量/Provider 失败出口提供原代码落点和验收责任；完整消费者和设计依赖闭包完成前不得宣称 E0 通过。
- **E0 未收口前不创建实现分支，不修改 main**；即使设计 Gate 最终收口，也仍须用户另行明确授权正式开发。UI 视觉实施还必须等待用户自己的 Codex→外部视觉 AI→HTML/双文档→多轮确认过程。
