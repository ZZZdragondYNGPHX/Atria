# D7 — N2 分层叙事、Project Agent 与条件质量回路（已冻结）

> 2026-10-15 第七轮选择 **N2**。跨模块摘要在 [decisions.md](decisions.md) D7。本模块是 V3 的 RP/Project/Quality/作者体验**唯一详细设计入口**；原 World/Session、Actor/Cognition、Context/Memory、Studio/Project、Experience/Eval 等领域仍由其既有方案与 Native 实现拥有正式权威。继承 D1–D6、HCM-01–08、T2 Host 唯一执行者和旧 Orchestrator 零兼容硬切。本轮只修改 docs，没有产品实现与新测试。

## 1. 单一原生编排内核，两个不同的业务出口

| 产品消费者 | 原可信事实和输入 | V3 可以组织的工作 | 正式结果归属 |
| --- | --- | --- | --- |
| RP / Native Game | 玩家真实输入、World Observation、正式 Events/Command Results、Actor/Information、Hybrid Memory、Session/Branch/Revision；普通聊天使用其真实 message/variant/hash | 按需剧情意图、角色视角分析、来源核对、局部质量审查、一次 Narrator 正文 | 指定 Narrator/Final Prose owner；原 World/Session/Command 决定事实与正式动作 |
| Studio Project | 原 Project Agent Task、Workspace/ProjectRevision/Source、工具和审阅合同 | 原生任务分解、受限工具、候选 ChangeSet、Validation/Preflight/Preview、Review | 原 Studio Task/Review 与获准 Apply/Commit，返回原 DomainCommitReceipt |

两个出口复用 V3 的 Plan/Graph/Run/NodeAttempt/Effect/Result/Join 和 D2–D6 的可靠性，却不共享可写事务/质量类型。所有旧 Single/Spec/Loop/Agenda/Director 模式、模式编译桥、旧 Director takeover 与前端旧入口彻底退出，不通过改名工作流模板恢复。RP 与 Project 的业务分工**不是新的旧模式选择器**。

## 2. Identity / Cognition / Narrative Intent / Expression / Narrator 五责分开

1. **Actor Identity**：使用原作者/Package/Project 的稳定 actorId/性格/历史/身份锚和真正的作者资源。换模型、改变文风或重新规划 Run 不得回写稳定设定。权威参考 [Behavior/Context](../../architecture/agent-intelligence-runtime/behavior-context.md) 与 [M3 Cognition](../../architecture/agent-intelligence-runtime/m3-cognition-design.md)。
2. **Actor Cognition**：Belief、Exposure、Emotion、Desire/Intention、关系评价、Memory applicability/遗忘及有界 ToM 均归原 Information/Cognition/Memory/Session 的 Source/Actor/Branch/World Tick 合同。角色可能误解/遗忘；A 对 B 的二阶猜测仍是 A 的推测，不等于 B 的私密心智事实。遵守 [S19](../../architecture/agent-intelligence-runtime/s19-theory-of-mind.md) 的身份和来源限度。
3. **Narrative Intent**：剧情焦点、当前冲突、已获准事件的后果、伏笔、悬念、角色行为*建议*和情节质量要求，是 task-local、versioned、source-bound 的派生中间结果；不能新建第二 World/Goal/Actor writer、不能从 Planner 文字自动生成已发生 Event/玩家行为或已建立关系。
4. **Character Expression**：角色用词、声线、动作节奏、独特说话习惯，归原 Actor 表达资源/Prompt/Creative 策略。Expression 不代替 Cognition 或 identity，不因为角色台词而捏造其经历或改变身份。
5. **Narrator**：按当前合法 World、Command/Events、Info/Disclosure、Context、Narrative Intent、表达政策 fresh-generate 正文，是每次正文的**唯一最终生产者/输出 owner**；中间 Agent 的意图、评判、剧情计划都不是另一个并列 final reply。

这是**五种逻辑职责**，不是五个必须新注册的 Agent/服务、五份状态或五次模型调用。F2 默认普通 RP 最小计算路径不插入固定 Planner/Judge，复杂情形才调用多智能体。

## 3. 反全知、防串知与玩家自主权

### 3.1 只由原权威授予的知识和玩家披露

- HCM-02 保持 B 系统 Narrator/NPC 认知分离为默认，作品可按原作者许可选择 A 严格限知或 C 自定义合法视图。Narrator **可读**内容与可以向玩家 **Disclosure** 不同，NPC 不自动取得 Narrator 较宽的私密 Context。
- HCM-06/HCM-07/HCM-08：Actor/Source/Time/Branch 合法候选域先被原 Authority/Information 验证，随后唯一 Hybrid Memory 检索，最后由 Context Compiler 装配。记忆命中、他人传言、Agent 候选、Judge 共识不能升级为正式 World Truth 或 Actor 认知修改。
- 原有 [S16 Disclosure](../../architecture/agent-intelligence-runtime/s16-belief-disclosure.md) 的每项 context/displayGrant 和玩家公开 view 独立准入，对角色私有见闻、Memory/Exposure、台词暗示和推测同样有效。严格保密场景应在**源数据面**隔离或有界分阶段生成。
- 编排/模型能读某条事实不等于能通过 RP 正文、Tool 输出、MCP/A2A、UI Diagnostic 将它透露给未经授权的玩家/Actor/远端服务。D4 Audience-scoped ResultRefs 消费时重新审查来源。
- 数据级隔离/原业务写入禁止可得到确定性保证；自由生成文本可能间接串知、暗示或重述秘密，单靠 Prompt 或一个 Judge **无法绝对保证**。需要保留实际不利正文和独立反例质量评价，不将概率性审查写成硬防线。

### 3.2 玩家自主权

- 用户操纵角色的尚未授权行动、选择、拒绝、同意、承诺、内心动机属于玩家控制；Agent 不得通过自动剧情推进替玩家做决定，也不能编造玩家发出的命令或推断许可。
- 允许叙述玩家已明确选择的行动、正式 Command 已计算的可观察后果；NPC 的合法主动行为仍取决于原作品/世界事件权限。不能把对玩家行动的文学描写当成独立状态提交。
- Native World/Command/权限层对未授权状态修改进行确定性阻断。自然语言中“替玩家说话”“擅自决定情绪”“强迫分支”等则属于质量评测/有界修正目标，不能宣称仅凭正则或 Prompt 达到普遍完整语义证明。
- 玩家偏好、作品规则、作者对非玩家 NPC 行为的配置并不授权无来源地改写玩家控制权；冲突时依当前可信 user input 和原正式 action/commit，而不是模型猜测或旧对话总结。

## 4. 有条件的多角色协作与剧情连续性

- 复杂多角色冲突、重大信息不对称、来源冲突、作者显式高质量目标、高影响游戏决策等可触发 G2 动态图 Planner/Delegate/Fanout/Join；正常对话可直接 Context → Narrator。
- 角色分析的每个 Agent 必须有自己的真实 audience/source/branch/context，不能拷贝父 Agent 的全部推理、Narrator-wide Context 或另一个角色的私密 ToM。父子授权是交集，Join 只汇总接收者能阅读的 Result/Source 引用。
- 并行分析不直接执行 Cognition writer；即使两个 Agent 对一个 NPC 的信念达成共识，也不能自动改变那个 NPC 的 Belief 或已经发生的 World event。HCM-03 事件驱动认知、HCM-04 正式 World Tick、HCM-05 轻度遗忘/作品可选深度遗忘的原生边界不变。
- Narrative Intent 引用原未解任务/承诺/伏笔及已提交后果，但不得通过“情节需要”隐藏确认过的事实矛盾，也不能把未来预测当已发生历史。
- 任一 NodeAttempt、Memory Source、Branch/Revision/ScopeEpoch 在并行执行与恢复中变化，结果仍需按 D3/D4/D5 currentness 规则重新证明，不能因为 Join 曾经成功而绕过下一回合的授权。

## 5. Project Agent：Task、候选修改、Review 与 Commit 不可混淆

当前主线 `src/native/project-agent-executor.js` 有显式 `human-review-before-formal-commit` 出口；V3 保持这条正式边界：

| 原生阶段 | Agent 可做 | 不能自动越过 |
| --- | --- | --- |
| Task / Intent / Plan | 读取合法 Project/Task/Workspace 状态、规划子任务与工具 | 擅自修改原 Project revision 或跨 Project/owner 扩权 |
| Tool / Workspace | 经 D6 许可提出编辑与结构化 Source/Resource ChangeSet | 通过通用 shell/文件写入绕过 Studio 工具及原 CAS |
| Validate / Preflight / Preview | 使用原 Studio/Build/真实 Browser 消费取得可复核证据 | 模型声称通过、截图可见就视为正式 Commit 或人工满意 |
| Review | 产出差异、失败/通过证据与需要批准的候选 | 模型 Judge/Review 获得正式 Apply 权限 |
| Apply / Commit | 由原领域授权用户及 Studio Domain Authority 对精确 ChangeSet/ProjectRevision/approval 执行 | 将“Run completed”偷换成真正 Project 已修改 |
| Conflict / Recovery | 以源版本与提交 receipt 调和，必要时重新准备候选和用户 Review | 断线时重放不确定写入、静默覆盖用户在此期间的修改 |

原 Studio Project、Task、ChangeSet、Build/Version、Review/CommitReceipt 是实际业务权威。N2 只通过原 V3 Graph 帮助生成可审阅提案，不能建第二套工程任务仓库或让 RP Narrator 拥有 Studio 写权。

## 6. Judge / Review：硬正确性与文学质量分离

| 维度 | 原生 Host/Domain 可检查 | 仍需真实评测/用户偏好 |
| --- | --- | --- |
| World/Session 正确性 | 正式版本、World Observation、Command/Domain Receipt、工具/输出合同、禁止越权写 | 自由正文是否暗示了未发生、未授权的具体事实 |
| Actor/Knowledge/Disclosure | Info/Audience/Source/Display grant、ToM 归属、当前性 | 台词、暗示、旁白间接泄露或认知误表述 |
| 玩家自主权 | 正式 player action/input/source/commit 权限与拒绝 | 自由文字是否强制替玩家行动、情绪、承诺或剧情选择 |
| 角色剧情质量 | 身份/世界时间/已提交承诺与事件证据 | 人设、动机、关系变化、伏笔、节奏/新鲜度与长篇连贯 |
| 文学表达 | 基本结构/输出类型/必要引用 | 叙述视角、文笔、文风、角色声音差异、读者偏好 |
| Project 质量 | Project/Task/ChangeSet/CAS/Validation/Commit Receipt | 设计选择、代码可维护性、用户满意度、长期效用 |

- Judge 只对其合法 audience 的 Result 与受审 QualityProfile 评价、排序和指出局部缺陷，不能升级为 Host 正式状态判断/真人评价或原业务提交。Host checker 的确定性证明与 Model assessment 的概率判断必须分别归档。
- 复用原 [M1 Feedback/Evaluation](../../architecture/agent-intelligence-runtime/m1-feedback-evaluation.md) 及原 Experience/Eval/QualityProfile/Case provenance/Report/Promotion 权威。评价维度带适用条件、source/revision、评委身份、校准与 unknown；不能因为多个代理同意就宣称独立人类评价。
- Source/World/Disclosure/玩家代写、必要 Project Validation 等不可抵消的硬错误不能用优美文笔或综合平均分弥补。真实用户偏好与模型质量假设分开，独立评价集不能泄漏到自动改 Prompt 的训练/规划输入。
- Judge/Review 是按 F2 需求额外执行的选择性工作，原预算真实计费；不固定每回合多个 Critic，不以无限评分来追求“满分”。

## 7. 有界局部重做，保持正式副作用不可逆边界

1. 触发：确定性检查失败、用户合法纠正/明确审稿、高影响输出、或有来源的具体可改进维度；默认 RP 正常路径不额外加 Judge。
2. Review 绑定当前 NodeAttempt/Result、合法 case/criterion/SourceRefs 与受影响节点，输出 approve、revise-targets、blocked/unknown 等建议，Host 按 D3 验证目标及受影响依赖闭包。
3. 只重做需要修正的 Writer/局部下游；合法 World/Memory/已校验前置 Artifact/Plan 在依赖、权限与版本仍有效时复用。新的 Attempt/EffectId 和费用另外记录；旧 Receipt/失败/评测历史不可覆盖。
4. 已发生的正式 World/Studio/Tool 写入**绝不能为修正文笔直接重发或自动回滚**。若发现正式业务数据问题，必须走原领域专门的可审查纠错/新交易流程。模型新正文只能在当前可信事实下生成。
5. 达到明确 Budget、次数、时间/权限边界时退出为真实 completed/partial/blocked/awaiting_review，说明未解决的质量缺口，不能伪造成功或强行完成玩家决定。

## 8. 全新创作体验的功能方向（交互布局留 D8）

- 原生作者空间能够直接配置 Agent/Node/Edge 的任务目标、有效 Actor/Source audience、Narrative Intent、Character Expression、Narrator 的风格与 Final OutputOwner、独立 QualityProfile/Review 条件、可用 Model/Tool/预算，而非旧 Orchestrator 的五模式与配置/预设兼容面板。
- 作者可检查有权限的来源/分支、哪些角色可以获悉信息、Source/Disclosure 禁止原因、质量评价实际证据与 unknown；不能因为是作者 UI 就默认暴露所有玩家/NPC 私有认知，仍按原领域 authoring/inspector grants。
- Native Plan 的 Draft/Version/Publish 与 Host 正在执行的 PlanRevision 分开；作者重做/修改后由新的合法 revision 与用户操作产生，不凭 Browser 画布状态直接改变已有 Run。
- “Preview” 必须按真实副作用分类：静态图检查/允许的纯 Context preview 可以无收费，但真实模型、MCP/A2A、Studio mutation 或未明示的写入必须经过 D5/D6 许可并显示真实成本/风险，不能用预览按钮暗中启动外部操作。
- 普通 RP 玩家默认只需阅读叙事正文、参与游戏选择和必要的明确批准；复杂 Graph/Run/Join/Judge/Tool Trace 可以由作者/高级用户查看**脱敏的 Host Projection**，不能泄漏模型 opaque reasoning/Secret/私有 Actor 内容。
- PC、Linux/Windows、手机 Termux 保持同一 Native Host Graph/Effect/Output 契约；具体 Graph Editor 工作台、Run Inspector、Node 设置、审批交互、移动触控与视觉系统由第八轮 D8 讨论后冻结。

## 10. D8 下一轮开放议题

第八轮围绕全新 Graph Editor、Agent/Node/Edge 配置、Run Inspector/Timeline/Diagnostics、权限/审批/成本预览、可解释的 Host Projection、PC/移动触控/响应式设计、无障碍与长图性能讨论。具体布局、组件库、技术路线、操作方式与默认分层界面 **尚未冻结**，不得提前将本模块变成 UI 实现批准。
