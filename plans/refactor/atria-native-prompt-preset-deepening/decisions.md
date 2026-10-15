# 跨模块冻结决定与待选项

说明：仅记录用户已明确选择的产品设计。D1–D6 已冻结，D7 尚未决议；文档提交不构成产品实现许可。

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

1. **S2 类型化语义 IR**：原 Native PromptCompiler 内区分正式 Authorial Instruction、V3 Agent Task、World/Memory/Tool Evidence、用户输入与 Host-only Policy；记录 SourceRef、Actor/Audience/Trust、Scope/Time/Branch、Stage/Target、精确版本与必需性。不建立第二 Compiler、持久 IR 或独立 Prompt OS。现行 PromptIR v1 尚未具备完整强类型字段；物理 Schema/迁移与消费者留后续 E0 审核。
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

## D7 待选（见 [quality-evolution.md](quality-evolution.md)）

- **Q1/Q2/Q3**：文学、人物一致性、长会话剧情、任务完成与不可抵消的硬约束如何形成受审 RP QualityProfile/独立报告，不以文笔均分掩盖玩家代写/信息串知。
- **F1/F2/F3**：用户显式偏好、实际观察、Host 检查、模型 Judge 与未知来源如何归因，什么缺陷才允许定位为 Prompt 而非 Context/Model/Runtime。
- **O1/O2/O3**：合法成年人虚构 RP 的过度拒答怎样独立衡量，区别 Provider 显式阻断与模型主动回避，避免优化成攻击成功率或一律“通过”。
- **P1/P2/P3**：原 EvolutionTargets/PromptCandidateStore 仅对获准的精确目标进行候选变更、评审与 PlanBinding CAS 发布，什么情况下使用反思/Pareto 选择，何时需人工 Review。
- 四组方案全部 **OPEN**。后续决策必须保持 V3 `plan-prompt` target 与原 Experience/Eval/质量和发布权威，不重复建 Judge、候选 Store、Plan/Runtime；D7 选择后仍按约定先提交同一 Plan/Record，再讨论 D8。
