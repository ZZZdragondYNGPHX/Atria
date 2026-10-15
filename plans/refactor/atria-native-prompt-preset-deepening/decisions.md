# 跨模块冻结决定与待选项

说明：仅保存已由用户明确选择的跨模块决定。D1–D3 已冻结；D4 仍为待讨论候选，不构成产品开发授权。

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

## D4 待选（见 [agent-behavior-binding.md](agent-behavior-binding.md)）

- **B1/B2/B3**：Agent Node 的 Program 绑定是仅随 Route、Plan 内 exact ProgramPin 独立可选，还是内联文本。重点审查 V3 当前 `agentPinId/dependencyPinIds` 与 Native Route 所持 `promptProgramRef` 的真实接口差距。
- **I1/I2/I3**：模块复制、原生 `parentRef/derive` 精确继承 + E2 语义 overlay、或完全自动动态继承。
- **C1/C2/C3**：Route 直接编译、Host NodeAttempt 冻结有效 Prompt 编译证据、或客户端预编译。
- 本轮不预先冻结 D4 选项；D4 选择后必须先更新提交同一 Plan 与 Record 再讨论 D5，不能先行开发产品分支。
