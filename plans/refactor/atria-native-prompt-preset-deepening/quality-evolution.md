# D7 已冻结：文学质量、Agent 行为、合法过度拒答与 Prompt Candidate 演化

> **D7 正式冻结：Q2 + F2 + O2 + P2（2026-10-15）**。沿用 D1–D6；本模块是本企划文学质量、Feedback/Diagnosis、合法创作过度拒答、Prompt Candidate 演化与发布的唯一详细设计权威。**仅 docs 设计冻结，没有新增 QualityProfile/数据集/Model Judge/优化或 V3 `plan-prompt` 发布的真实通过证据。** 原 Experience/Eval/Evolution/PromptCandidateStore、V3 单 Native Host 和 Product Binding 权威不变。

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
| **Q2 多维受审质量向量 + 不可抵消硬门槛（已选）** | 保留原 RP M1 重要维度，按受审的具体 Source/Case 补充 `narrative_craft`、`pacing`、`voice_distinctness`、`scene_progression`、`long_horizon_consistency`、`authorial_style_fidelity`、`unwarranted_refusal` 与 Agent 任务证据/合规/完成度；每项区分 applicable/unknown、实际引用与审稿模型 | 文学、人物、Agent 行为和长程事实并重；Host 硬 Source/Grant/Player/Tool 失败不可由高文笔均分掩盖 |
| **Q3 单一 LLM 文学总评** | 一个 Judge 给一份统一“好不好看”分数并决定候选 | 难以解释与校准，会把个人保守文风与真实错误混同，不推荐 |

Q2 不表示一次上所有维度、每回合调用 Judge。单场景按审查有效的 QualityProfile/case 选择适用维度；长程维度必须由具有对应来源与时间跨度的实际样本验证，缺来源仍为 unknown。评审需要保留原始维度差异与用户表达的审美偏好，不能自动把“更克制”判成文学改进。

## 3. F — 反馈 provenance、误判与可改 Prompt 的归因

| 候选 | 做法 | 取舍 |
| --- | --- | --- |
| **F1 所有反馈合成一个 reward** | 用户点继续、模型点赞、成功提交都变成同质分数 | 会把自动观察当真人喜好，把正式运行成功当文本质量好 |
| **F2 复用原 Experience 并做 Source-honest 归因（已选）** | 用户显式喜好/纠正、客户端 accept/regenerate/edit、正式 Host 技术检查、Model Judge 怀疑、unknown 分别入原合法来源；对 `prompt/context/state/runtime/evaluator/model/unknown` 有依据诊断，仅归因 Prompt 缺陷才进入局部 Candidate | 与现有 M1/Quality 原设计一致；保留误判、对照与来源版本，不能靠 Judge 自信分数冒充事实 |
| **F3 创作偏好单独建一套 Feedback DB** | 为 RP 新建 Preference/Evolution 写入者 | 双权威、撤回/权限/同步风险，无必要 |

同一个模型既产出正文又审读时，评价不自动具有“独立”身份；更换 Judge 模型的显示名称也不证明独立来源。必须校准好/坏/unknown 的对抗案例、顺序反转与内容边界，真实客户显式反馈与合成测试材料不能互相冒充。用户操作“Regenerate”可能因多种原因发生，不能单独代表负面文学评分。

**发布资格规则**沿原 Evolution：Prompt 相关的真实改进才可提出文本候选；Context 漏选、Source/Branch 失效、Provider 拒绝、Model 固有限制、Runtime bug 或 Evaluator 偏差，应进入对应诊断或工程处理，不能通过偷偷添加提示词“补救”事实与权限问题。

## 4. O — 合法成年人虚构 RP 的误拒和文风压抑如何评估？

| 候选 | 方式 | 风险/价值 |
| --- | --- | --- |
| **O1 仅测一般文学质量** | 评价结果是否流畅，不单独追查无端拒答 | 很可能忽视作者合法的成熟题材文字 RP 被莫名转成说教、道歉与省略 |
| **O2 Benign-Creative Over-Refusal 专项 + 正反控制（已选）** | 建有来源和适用性标注的合法虚构题材/浪漫/情绪冲突/人物欲望/多语言表达等测试集，分别记录 `provider_explicit_block`、`model_avoidance_suspected`、`under-responsive_prose`、`legitimate_quality_issue`、`unknown`；与真正禁止/不适用的负控制分开，逐案分析 Provider 能力和作者偏好 | 可衡量无端回避而非只鼓励“任何文本一律生成”；确保作者文学意图与实际 Provider 限制分离 |
| **O3 单指标越狱/拒答率最优化** | 不问请求是否合法，只追求降低模型拒答次数 | 容易失真并推动自动化攻击优化，不能作为 Atria 产品质量指标 |

**边界**：Atria 自身不因“成人、情感、亲密或强文学性”的标签就统一注入说教或压低文风；作者完整指令与 E2 场景/角色表达不应被 Judge 用自己的审美覆盖。但外部 Provider 实际限制、法律和真实 Context/Player/World 授权仍有效；拒答归因和可用 Route 由用户审查与选择，不能在遭拒后无声转发其他 Provider。诊断可以参考 [ICML 2025 OR-Bench](https://proceedings.mlr.press/v267/cui25a.html) 的 harmless/negative controls 思路，不能把其论文结果当作本产品通过率。

## 5. P — 候选探索、Pareto 比较、正式发布和恢复

| 候选 | 策略 | 边界 |
| --- | --- | --- |
| **P1 全手动版本修订与发布** | 作者手动对每个 PromptModule 修改、测评和切换 | 安全但不充分利用原 Agent Intelligence/Eval 与 GEPA 类反馈 |
| **P2 条件反思候选 + 受审多目标评价 + Review/Publish（已选）** | 根据有根因与来源的开发反馈，沿原 Evolution 提议一个或少量具体 `plan-prompt` 文本局部候选；按修订绑定的长篇/文笔/角色/Agent/安全/误拒/成本向量做开发对照、独立 promotion 审查，可参考 GEPA 反思及 Pareto 维度选择；作者/合法审批后创建新 exact Module→PlanRevision→PlanBinding CAS。旧 Run 固定，冲突时 reconcile，不静默覆盖 | 在同一原候选仓库与评价服务内演化；不允许候选扩大 Tool/Grant/模型权限、把受限来源视作 system、或覆盖未批准目标 |
| **P3 每回合自动改写并即时切换 Prompt** | 根据每条正文和 Judge 直接在线更新运行规则 | 破坏确定性/Exact refs 和 G1 稀疏计算，容易审美漂移与双运行权威，不建议 |

[Pareto/反思参考：DSPy GEPA](https://dspy.ai/3.3.0/api/optimizers/GEPA/overview/)；GEPA 是一种优化方法参考，**不意味着安装 DSPy 或引入第二 PromptCandidate/Evaluator**。Pareto 只是候选排序/探索建议，不得取代原 QualityProfile 的不可抵消硬条件与 Promotion 资格。变更只限事先声明的模块文本/允许字段；Plan `plan-strategy` 单独走 V3 已冻结受限策略目标，不能混入未经审查的 Prompt 自动调优。

**评测污染防护**：Development 来源可用于根因诊断和候选构造；独立 Promotion 案例及其真实答案不得作为生成新 Prompt、挑选最有利策略或补强作者指令的输入。相似场景/同来源派生组/相同人物改名均不算独立；来源或模型/evaluator/route 版本变化需要重核资格。所有失败、无改进、未知费用、不利 delta 保留。即使候选表现更文学化，源/玩家/Disclosure/Tool 权限一项真实硬失败也不得发布。

**预设生态与既有发布权威**：官方基础预设、作者可分享预设、私人/作品精确派生只表达来源与复用层次，不引入新的 Preset/Module Store 或赋予 Role/Tool/Source/Grant。基础预设应使普通游戏作者可直接选择，模型/Route/Capability 的必要配置仍须满足。**作者可编辑发行包**保持原生 Program、Module、Generation、Regex、继承与分类的完整可校验依赖闭包及非特权来源/版本描述，禁止打包 Secret、私有 Context/Memory、外部付费授权或不获准的图片资产；需要自包含而非依赖导入者另有同名资源。“完整闭包”必须经原 Native 校验而不是仅检查文件扩展名。**游戏 `.atria` Package** 继续按已有 Build 冻结受权的 effective Prompt 和可运行依赖；发行包不等于可执行游戏快照，不能把 Package 展平结果充当作者继承树。视觉 Rendering/Target/模板的共享只复用视觉资源与能力合同，不混入文本预设或会话 ImageJob。私人 Fork/Derive 持有自己的 exact revisions，不影响原作者。

**发布动作四分**：① 保存原 Library/Project 正式修订；② 导出可移交的资源及受允许的依赖说明；③ 在相应 Library/Project/V3 Authority 下经所需 Review/Publish 生成可供消费的明确版本或 Binding；④ 游戏、Route、Agent/Play 根据权限显式选择采用/升级。**跨用户离线导入**须验证原生类型、资源身份和完整依赖，生成导入者所有的本地资源 identity/exact revision 映射并保留可展示的原始版本线索；不允许靠名称覆盖原有 Library 对象，也不从 manifest 的来源声明提升授权。内容哈希或自述作者仅能支持一致性与归因线索，不能证明发布者身份；签名、密钥信任与精确 manifest Schema 尚未冻结。**手动升级**可以由用户再次导入新版发行包开始，但必须确认可信的本地映射/来源关联并显示 baseline/candidate 的 exact 差异、本地派生冲突、依赖/能力变化及影响消费者；映射有歧义或冲突时保留并列版本并要求人工选择，不做 latest 自动追随、猜测三方合并或静默替换。不得将“导出”宣称为云端市场发布，不把“发布新版本”视为所有消费者自动切换；旧 Run、已钉 Package/Plan/Route/Session 保留其精确身份，采用变更须沿原 Authority 完成 CAS/Receipt 与回滚。跨客户端在线分发、远程同步与自动更新不是本轮批准的能力。

**质量证据身份**：作者自行试写与 Development 案例只证明适用场景中的观察，不授予 Promotion 资格；独立、来源受审且与候选隔离的评价才可支持相应质量标签，且只对实际受审的模型、Route、Case/版本及维度有效。未取得受审来源时保留 `unknown/source_unready`，不能因“官方预设”或高分数宣传已认证，也不应把未经认证等同于禁止作者导出个人作品。不得为了展示好看分数而自动循环 Judge。

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

## 7. D7 正式冻结：四个领域与发布收口

### 7.1 Q2：质量分解与不可抵消硬错误

- **文学质量**：文笔、句式与意象、节奏、伏笔兑现、场景推进、长篇连贯、重复/套话、作者偏好和体裁写作适配；**角色质量**：Actor 身份/认知一致、语气差异、关系情绪的来源和长期稳定；**Agent 行为**：任务证据、任务完成/输出契约、正确的工具/Context 使用和实际成本。评价是有来源的多维报告，不通过一个“好文笔总分”来覆盖所有维度。
- 保留现有 `rp.m1.information` 的 player_agency、promise_application、knowledge_boundary、continuity、actor_voice、narrative_response 等正式维度；新增受审 QualityProfile 维度只在其有效 Case/Source/Time Span 覆盖后参与评价，缺来源保持 unknown/source_unready，不能凭研究论文和作者意愿推断已校准。
- **硬错误与软文学分数分离**：World/Actor/DisplayGrant、未授权玩家行动/同意、Source currentness、Tool/OutputContract、真实 Provider/审批权限的违规不可通过文字漂亮或其它 Agent 共识抵消。Model-based literary review 是来源有限的观察，不冒充 Host 的确定性验证。

### 7.2 F2：原 Experience 来源归属与可优化 Prompt 条件

- 用户 authenticated explicit preference、客户端 accept/regenerate/edit、Host 技术事实/Receipt、Model Judge 受权 Assessment、unknown 独立归档；每项保留有效 provenance/source/profile/版本/费用。不同类型不能混用：重试不证明用户不喜欢文风，系统成功不证明内容优良，模型审稿不能自行做出已确认严重失败。
- 诊断先分 `prompt/context/state/runtime/evaluator/model/unknown`，并保留 `unverified/reproduced/rule_verified` 的证据级别；可修改 Prompt 的具体局部缺陷才进入 Candidate。检索少了关键承诺、分支事实过期、Provider 固定拒答、模型能力不足、Judge 偏差，不能靠无限叠加 Prompt 假装修好了。
- Development feedback、可信 Host checker 与独立 Promotion 样本不可互相冒充；不新建 RP Feedback DB/Reward Store 或第二 Prompt Authority。

### 7.3 O2：合法成年人虚构 RP 误拒独立评价

- 对合法且受当前模型 Provider 支持的成熟虚构/情绪冲突/浪漫与角色关系等文学要求，分别测 Provider 明确拒绝、模型疑似过度回避、虽然回答但将作者文学诉求无端淡化、普通文笔质量不足和未知状态。对照样本按场景/年龄设定/权限/语言/Provider 可用性确认实际适用。
- 借鉴 OR-Bench 的 benign 与 negative controls 思路；**不得**以“越狱成功率”“降低所有拒答率”作为 Prompt 自动优化目标，也不生成用来绕过外部 Provider 固定限制的攻击候选。
- Atria 不对正常成熟题材额外自动插入道德说教或把所有高强度文学创作判作劣质；模型 Provider 本身的政策/可调能力、适用法律与 Source/Player/World 权限继续由原系统执行，R3 模型 Route 选择需用户许可。

### 7.4 P2：原 Candidate/Evolution 与 V3 `plan-prompt` 的唯一发布链

```text
Authorized Development Feedback/Diagnosis (with Source/provenance)
  → original EvolutionTargets / allowed plan-prompt target
  → original PromptCandidateStore (exact PromptModule body revision)
  → original Eval worker / QualityProfile / independent Promotion
  → Review approved by original authority
  → V3 PlanRepository publishes immutable PlanRevision
  → PlanBinding exact CAS (via original publication journal/reconcile)
  → next authorized Run, old active PlanRevision unchanged
```

- GEPA 类反思文本、Pareto 比较只作为原 Evolution 中可配置的**候选探索策略**。自动候选仅改获准原生 Prompt Module / 事先声明的文本目标，不自动提升 Tool/Model/Source Grant、Budget、OutputOwner、正式 World/Actor 事实；策略类修改独立走 V3 已冻结受限 `plan-strategy` target。
- 发布前必须持有已校验的 exact `bindingId/version/planRef/nodeId/moduleRef`，共享 Store CAS、原 Evaluation/Report/Promotion 权威；候选 Module 和 PlanRevision 已经写入但 Binding CAS 失败时必须原 Journal reconcile，不能假称跨存储原子或自动覆盖并发编辑；Rollback 受原 published-current/精确 CAS 限制，不重复已发生的 Effect/费用。
- 用获准开发样本改进文风，**不能**查看独立 promotion 案例内容/答案后再为其写 Prompt；同源换名字不算独立；Judge 的身份与独立性需要真实校准与 provenance。所有负 delta、unknown、model limits、调用费用和失败证据必须保存可审查记录。
- G1 保持：正常 RP 单 Narrator 优先，未经明确任务/必要缺口和原 Native Compute 预算不得每回合自动反思、循环 Judge、自动发布或跨 Provider 内容重发。
- **发布与消费不得混淆**：原 `PromptCandidateStore` 的 Preset/Route 局部候选应用与 V3 `plan-prompt` 的 PlanRevision/PlanBinding CAS 是已有不同领域的受信发布路径；分享一个可移交 Preset 并不自动调用其中任一路径。游戏作者可选择官方/共享基础预设并按需 Fork/Derive，升级到新 exact revision 要先审查有效模块/来源/Provider 能力和影响消费者，成功写入与下一次实际生效按正式回执分别显示。当前原 `PromptPresetStore` 会在导入时生成本地身份，并非已实现有发布者身份认证、自动版本匹配或智能升级；这些设计只能沿原 Native Revision/Resource 机制补齐。

## 8. 真实工程阻塞与下一轮入口（NOT_RUN）

| 阻塞或证据 | 静态已知事实 | 真实实施出口 |
| --- | --- | --- |
| 新文学 Profile/来源 | `quality.js` 当前 Profile 有 M1 六维，`requirePilotSources()` 返回 `source_unready` | 受审新 Profile、真实合法来源/对照、Judge 控制和评测分组可验证之前，不能标记 Promotion-ready |
| V3 Target 替换 | `main:EvolutionTargets` 仍有旧 Workspace/Director targets，Project Prompt 偏 `system.style`；V3 §11 只冻结新 `plan-prompt`/Binding 合同 | E0 核查真实 consumers，正式实现后清退旧路径并打通 Node → Candidate → PlanRevision → Binding CAS，不能当作完成 |
| Node/Route/Role | D4 Node 独立 Program/原 Route Program 与 `generation_semantic_authority_changed` fallback 未打通，D5 `context.fact → contextSlots → system` 的来源角色信任边界仍待审查 | 实际 Provider wire、Context/Source currentness、模型错误与失败例，不能只有设计 |
| 长篇/角色信息 | D6 U2/E2/H2/V2 来源视图/认识状态/摘要与失效未实测 | 多角色、Branch/Variant/WorldTick/撤销许可/长会话与自由正文泄漏的真实验收 |
| 模型质量/成年虚构合法误拒 | 正反控制、质量向量与 Provider 分流效果未运行 | 基于真实可用模型和病例 scope 分开测试文学意图/合法误拒/质量，不得把论文数据宣传成产品得分 |
| UI/端侧 | D8 Native Preset Studio/Play 的交互选择尚未进行 | 遵守 D2 F2 完整自由作者指令、D4 Host Binding 和 V3/原 Authoring 权威，跨端真实测试，不再发明新 UI Host |

以上均为**设计冻结与未来验证条件，未取得 Node/CI/Provider API/UI/Windows/CachyOS Linux/Termux 实际通过证据**。D8 [Native Preset Studio/Play 体验讨论](preset-studio-experience.md) 仍为 **OPEN**；继续下一轮先更新同一 Plan/Record、提交 docs，然后开展 D9/E0 审计。正式重构零旧 ST/Workspace/API/mode 兼容，不修改 main、不新建实现分支。
