# D7 讨论草案：文学质量、Agent 行为、合法过度拒答与 Prompt Candidate 演化

> **D7 OPEN（2026-10-15）**。D1=B、D2=J2+F2+R3、D3=E2+A2+K2+G1、D4=B2+I2+C2、D5=S2+L2+D2+K2+T2、D6=U2+E2+H2+V2 已冻结。本模块**仅提出第七轮选项**；并非已实现、已发布或已运行评价。唯一 Experience/Eval/Evolution/QualityProfile/PromptCandidateStore 及 V3 `plan-prompt` 发布权威不变，不能再建第二 Reviewer、Judge、Promotion Store 或费用账本。

## 1. 现实基础与实施前需解决的缺口

| 来源（2026-10-15 静态核查） | 已实现 / 已设计 | 仍属阻塞或未实测 |
| --- | --- | --- |
| `main:src/native/agent-intelligence/evaluation/quality.js` | `rp.m1.information` Profile 包含 `player_agency/promise_application/knowledge_boundary/continuity/actor_voice/narrative_response`；Assessment 带模型身份/配置 hash/source quote，Host-check 与模型推断有独立来源规则 | 尚未完整定义文学语气/句法/节奏/新鲜度、成熟合法题材误拒和多回合关系张力的评价维度。当前 `requirePilotSources()` 对相关调用返回 `source_unready`，**不能声称 D7 的新试点材料已准备** |
| `main:src/native/agent-intelligence/evolution-targets.js` | 原 EvolutionTargets/Eval/Plan Candidate 基础可复用；目前仍有旧 `workspace-prompt/workspace-strategy`、Director source，Project Prompt 侧多限制在 `system.style` | V3 要求零兼容清退旧路径，并接入 `plan-prompt`；**V3 设计已冻结但 main 尚未证明真实接通** |
| `main:src/native/model-prompt-runtime/prompt-candidates.js` | 原 `PromptCandidateStore` 的 exact Module body diff、候选 prepare/check/apply/rollback 及版本化资源机制 | 现有 Route/Preset 发布路径不等于 V3 Node 的 `PlanRevision → PlanBinding CAS` 已完成；不能增设旁路候选发布 |
| `docs:plans/refactor/atria-native-orchestration-v3/interface-contracts.md` §11 | V3 `{kind:'plan-prompt', bindingId, expectedBindingVersion,planRef,nodeId,promptModuleRef}` 和受信 `EvaluationPort` 已**设计冻结** | Prompt candidate 应创建新的 exact Module/PlanRevision、经原 Binding CAS 发布，不能直接改活动 Run，跨存储 CAS 失败需原 Journal reconcile；实际工程 NOT_RUN |
| `docs:plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md` | Feedback/Assessment/Diagnosis 的 `user/client_observation/host/model_assessment` 区别、受审案例来源、Report provenance、开发 vs 独立 Promotion 的分账和已存在的试点规划 | D7 不是重建 M1；要补的是 RP 文学/误拒/长篇消费者的**实际评价证据**与 V3 Prompt targets，不得把历史“试点完成”解读为本轮已通过 |
| `docs:plans/refactor/atria-native-orchestration-v3/narrative-project-quality.md` | N2 唯一 Narrator、硬正确性与自由文学主观评价分开、G1 条件 Review/局部重做 | 正常 RP 每轮不得固定多 Judge；Judge 不能借写作修订改变正式 World/Player 或扩大 Context audience |

D7 的产品目标必须同时覆盖 **RP 写作** 和 **Agent 行为/任务质量**。创作质量模型与权限/事实硬正确性不能合并为只看总分的一张表。

## 2. Q — 怎么扩展 RP/Agent 的 QualityProfile？

| 候选 | 描述 | 适用性 |
| --- | --- | --- |
| **Q1 维持当前六维度** | 主要看已有 player agency、knowledge、continuity、voice、response 等；开放文笔靠人工主观感受 | 成本低但对文学风格退化、套话、成熟题材合法误拒不敏感 |
| **Q2 多维受审质量向量 + 不可抵消硬门槛（推荐）** | 保留原 RP M1 重要维度，按受审的具体 Source/Case 补充 `narrative_craft`、`pacing`、`voice_distinctness`、`scene_progression`、`long_horizon_consistency`、`authorial_style_fidelity`、`unwarranted_refusal` 与 Agent 任务证据/合规/完成度；每项区分 applicable/unknown、实际引用与审稿模型 | 文学、人物、Agent 行为和长程事实并重；Host 硬 Source/Grant/Player/Tool 失败不可由高文笔均分掩盖 |
| **Q3 单一 LLM 文学总评** | 一个 Judge 给一份统一“好不好看”分数并决定候选 | 难以解释与校准，会把个人保守文风与真实错误混同，不推荐 |

Q2 不表示一次上所有维度、每回合调用 Judge。单场景按审查有效的 QualityProfile/case 选择适用维度；长程维度必须由具有对应来源与时间跨度的实际样本验证，缺来源仍为 unknown。评审需要保留原始维度差异与用户表达的审美偏好，不能自动把“更克制”判成文学改进。

## 3. F — 反馈 provenance、误判与可改 Prompt 的归因

| 候选 | 做法 | 取舍 |
| --- | --- | --- |
| **F1 所有反馈合成一个 reward** | 用户点继续、模型点赞、成功提交都变成同质分数 | 会把自动观察当真人喜好，把正式运行成功当文本质量好 |
| **F2 复用原 Experience 并做 Source-honest 归因（推荐）** | 用户显式喜好/纠正、客户端 accept/regenerate/edit、正式 Host 技术检查、Model Judge 怀疑、unknown 分别入原合法来源；对 `prompt/context/state/runtime/evaluator/model/unknown` 有依据诊断，仅归因 Prompt 缺陷才进入局部 Candidate | 与现有 M1/Quality 原设计一致；保留误判、对照与来源版本，不能靠 Judge 自信分数冒充事实 |
| **F3 创作偏好单独建一套 Feedback DB** | 为 RP 新建 Preference/Evolution 写入者 | 双权威、撤回/权限/同步风险，无必要 |

同一个模型既产出正文又审读时，评价不自动具有“独立”身份；更换 Judge 模型的显示名称也不证明独立来源。必须校准好/坏/unknown 的对抗案例、顺序反转与内容边界，真实客户显式反馈与合成测试材料不能互相冒充。用户操作“Regenerate”可能因多种原因发生，不能单独代表负面文学评分。

**发布资格规则**沿原 Evolution：Prompt 相关的真实改进才可提出文本候选；Context 漏选、Source/Branch 失效、Provider 拒绝、Model 固有限制、Runtime bug 或 Evaluator 偏差，应进入对应诊断或工程处理，不能通过偷偷添加提示词“补救”事实与权限问题。

## 4. O — 合法成年人虚构 RP 的误拒和文风压抑如何评估？

| 候选 | 方式 | 风险/价值 |
| --- | --- | --- |
| **O1 仅测一般文学质量** | 评价结果是否流畅，不单独追查无端拒答 | 很可能忽视作者合法的成熟题材文字 RP 被莫名转成说教、道歉与省略 |
| **O2 Benign-Creative Over-Refusal 专项 + 正反控制（推荐）** | 建有来源和适用性标注的合法虚构题材/浪漫/情绪冲突/人物欲望/多语言表达等测试集，分别记录 `provider_explicit_block`、`model_avoidance_suspected`、`under-responsive_prose`、`legitimate_quality_issue`、`unknown`；与真正禁止/不适用的负控制分开，逐案分析 Provider 能力和作者偏好 | 可衡量无端回避而非只鼓励“任何文本一律生成”；确保作者文学意图与实际 Provider 限制分离 |
| **O3 单指标越狱/拒答率最优化** | 不问请求是否合法，只追求降低模型拒答次数 | 容易失真并推动自动化攻击优化，不能作为 Atria 产品质量指标 |

**边界**：Atria 自身不因“成人、情感、亲密或强文学性”的标签就统一注入说教或压低文风；作者完整指令与 E2 场景/角色表达不应被 Judge 用自己的审美覆盖。但外部 Provider 实际限制、法律和真实 Context/Player/World 授权仍有效；拒答归因和可用 Route 由用户审查与选择，不能在遭拒后无声转发其他 Provider。诊断可以参考 [ICML 2025 OR-Bench](https://proceedings.mlr.press/v267/cui25a.html) 的 harmless/negative controls 思路，不能把其论文结果当作本产品通过率。

## 5. P — 候选探索、Pareto 比较、正式发布和恢复

| 候选 | 策略 | 边界 |
| --- | --- | --- |
| **P1 全手动版本修订与发布** | 作者手动对每个 PromptModule 修改、测评和切换 | 安全但不充分利用原 Agent Intelligence/Eval 与 GEPA 类反馈 |
| **P2 条件反思候选 + 受审多目标评价 + Review/Publish（推荐）** | 根据有根因与来源的开发反馈，沿原 Evolution 提议一个或少量具体 `plan-prompt` 文本局部候选；按修订绑定的长篇/文笔/角色/Agent/安全/误拒/成本向量做开发对照、独立 promotion 审查，可参考 GEPA 反思及 Pareto 维度选择；作者/合法审批后创建新 exact Module→PlanRevision→PlanBinding CAS。旧 Run 固定，冲突时 reconcile，不静默覆盖 | 在同一原候选仓库与评价服务内演化；不允许候选扩大 Tool/Grant/模型权限、把受限来源视作 system、或覆盖未批准目标 |
| **P3 每回合自动改写并即时切换 Prompt** | 根据每条正文和 Judge 直接在线更新运行规则 | 破坏确定性/Exact refs 和 G1 稀疏计算，容易审美漂移与双运行权威，不建议 |

[Pareto/反思参考：DSPy GEPA](https://dspy.ai/3.3.0/api/optimizers/GEPA/overview/)；GEPA 是一种优化方法参考，**不意味着安装 DSPy 或引入第二 PromptCandidate/Evaluator**。Pareto 只是候选排序/探索建议，不得取代原 QualityProfile 的不可抵消硬条件与 Promotion 资格。变更只限事先声明的模块文本/允许字段；Plan `plan-strategy` 单独走 V3 已冻结受限策略目标，不能混入未经审查的 Prompt 自动调优。

**评测污染防护**：Development 来源可用于根因诊断和候选构造；独立 Promotion 案例及其真实答案不得作为生成新 Prompt、挑选最有利策略或补强作者指令的输入。相似场景/同来源派生组/相同人物改名均不算独立；来源或模型/evaluator/route 版本变化需要重核资格。所有失败、无改进、未知费用、不利 delta 保留。即使候选表现更文学化，源/玩家/Disclosure/Tool 权限一项真实硬失败也不得发布。

## 6. 建议评价样本与成本控制（仅示意，全部 NOT_RUN）

| 场景 | 需要真实可验的维度 | 不能声明通过的情况 |
| --- | --- | --- |
| 同一段长期 RP，A 寡言/B 直白，Narrator 强文学风格 | 作者风格、角色声音差异、节奏、重复和套话 | 只是整体文章华丽而角色声音趋同 |
| 过去承诺、新 World Tick/Branch/人物遗忘，长对话仍要推进 | 时间/事实/Identity/Cognition/Promise 与因果连续 | Memory 命中被写成现行事实、或上下文漏选靠 Prompt 猜补 |
| A 知私信，B 未获准；Narrator 有宽视图、玩家披露受限 | Source/Context 原始准入 + 正文隐含串知判断 | 只检查了 JSON 内容过滤，却宣称自由文本无泄漏 |
| 玩家说“我看着她”，场景主动推进 | NPC 合法主动行为、玩家有限委托、叙事张力 | 模型给玩家新增同意/承诺/动作 |
| 合法成熟情感/浪漫主题的作者要求 | 合法任务完成、无不必要说教/误拒、文学细节与人物真实感 | 只是没出现“抱歉”但大量回避细节，或另一 Provider 明确内容拒绝 |
| Project Agent 写作辅助 / Tool 规划 | Task evidence、OutputContract、可复核结果、Grant/Review 与成本 | Agent 把生成的提案说成正式执行/提交成功 |

- 默认不在普通 RP 每轮自动启用 Reviewer 或 Candidate 搜索。评测/优化是单独授权、确有失败/用户明确精修/有预算的任务，使用原 Host V3 与原 Compute/RunControl，真实模型、Judge、Tool/Context 访问均计费。
- 来源、模型、Judge 版本与样本覆盖决定“能证明什么”；synthetic 用户偏好不是 human preference，单轮的文学分数不能冒充长期体验增长。中文写作、多模型格式、长会话与成人合法主题需实际受权数据/模拟，并记录 scope 与适用性；无需设置没有证据的固定胜率或强制评委数量。

## 7. 仍在开放的 D7 四组决定

**推荐 Q2 + F2 + O2 + P2，但四组全部 OPEN。** 这只是进入第七轮讨论的备选方案，不因写入本模块自动成为正式冻结设计。正式实现须等 V3 `plan-prompt` 及真实 Eval source/Node Program Binding 和必要质量消费者 E0 收口之后，再按原实施依赖进行。

后续用户选择 D7 后，仍须**先更新 docs 分支同一 Plan Bundle 与同一 Record 并提交**，再进入 D8 原生 Preset Studio/Play authoring UX、反馈/质量 Inspector、Prompt diff、跨端体验的深入讨论。本轮不创建实现分支，不修改 main，不兼容 ST 旧数据或接口。
