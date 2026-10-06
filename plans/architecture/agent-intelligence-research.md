# Atria 智能体能力深化调研

> **Status:** Research / Non-binding  
> **Date:** 2026-10-06  
> **Code baseline:** `main@ed1fd90521a63363e29856601abbf5e908c99d10`  
> **Primary workspace:** `docs`  
> **Purpose:** 为后续逐项深化 Atria 智能体能力提供研究背景、现状基线、候选方向与优先级依据。  
> **Not a Plan:** 本文不是实施指导书，不冻结模块划分、API、数据结构、文件路径、阶段验收项或具体技术方案。后续任一方向正式进入开发前，应结合当时 `main` 真实状态单独形成实现 Plan。

## 1. 调研问题

Atria 已经拥有编排与记忆两条较成熟的 Agent 能力线。下一步值得研究的问题不再是“如何再增加一种工作流”或“如何再做一种 RAG”，而是：

> **如何让 Atria 的 Agent 从“会调用工具、会协作、会记忆”继续演化为“拥有持续目标、认知状态、经验学习、未来预测与资源自我调节能力”的智能体系统？**

本文围绕这个问题回答四件事：

1. 当前 Atria 已经具备什么，哪些方向不应重复建设；
2. 近期 Agent 研究与工程实践正在往哪些方向收敛；
3. 哪些能力与 Atria 当前架构天然兼容，并能形成产品差异；
4. 后续值得按什么研究顺序逐项进入正式设计。

---

## 2. Atria 当前智能体能力基线

本节用于确定“已经有的能力”和“真正缺失的能力”。它不是完整代码目录说明。

### 2.1 Orchestration 已经超过普通多 Agent 工作流

当前主线同时存在四类不同的 Agent 运行形态：

- **Spec**：固定 DAG，Stage 串行、Node 可串行/并行，支持 review/rerun；
- **Agenda**：Planner 维护 todo、动态 dispatch worker、读取结果并 replan；
- **Loop**：单 Agent 连续多轮 tool loop，工具结果自然进入同一消息轨迹；
- **Director**：主 Agent 接管最终输出，并协调 scout、brainstormer、critic、curator 完成 draft → critique → revise → finalize。

相关代码与文档：

- `docs/features/orchestrator/spec.md`
- `docs/features/orchestrator/agenda.md`
- `docs/features/orchestrator/loop.md`
- `docs/features/orchestrator/director.md`
- `public/scripts/lib/orchestration-engine/**`
- `public/scripts/lib/agent-runtime/**`
- `public/scripts/agents/orchestrator/**`

这意味着后续**不应把“动态规划”“多 Agent 协作”“critic/reflection”“parallel sub-agent”“handoff”“工具循环”本身作为新的核心方向**。Atria 已经有这些能力，真正的问题是这些能力由什么更高阶状态驱动。

### 2.2 Agent Runtime 已具备作为通用执行内核的关键性质

当前 Runtime 已具备：

- JSON-safe durable state；
- capability allowlist；
- tool / model / memory port 隔离；
- handoff 与 context policy；
- parallel fanout / join；
- checkpoint 与 recovery；
- cancellation；
- context budget；
- bounded graph/cycle；
- policy controller；
- arbitration；
- runtime trace。

尤其值得注意的是：运行时已经能够判断旧 decision 所引用的 Memory reference 是否失效，并在恢复时要求重新规划，而不是盲目 replay。这说明 Atria 的 Agent Runtime 已经在向“基于精确状态与证据的执行”靠近。

### 2.3 Memory Graph 已经不是简单向量记忆

当前 Memory 已有：

- 自动结构化 extraction；
- semantic/event 分层；
- graph link；
- LLM Recall；
- vector recall；
- rerank；
- query rewrite；
- temporal graph；
- hierarchical compaction；
- source/provider provenance；
- rollback；
- orchestrator-driven curator；
- character/location/custom schema；
- persistent injection 与动态 recall；
- inspection / import / export。

因此后续的“智能体成长”不能继续混在 Memory 概念里。

一个重要研究边界是：

- **Memory**：世界、人物、对话中发生了什么；
- **Experience**：Agent 自己做过什么、为什么失败或成功；
- **Skill / Policy**：从多次 Experience 中验证后沉淀出的程序性知识。

这三个概念如果继续混在一起，会造成后续演进时来源、生命周期与修改权限不清。

### 2.4 Native 已经拥有认知层所需要的大量底座

主线 Native Runtime 中已经存在若干对后续智能体深化极有价值的结构。

#### Information / Epistemic

`public/shared/native-information-runtime.js` 已经支持：

- World Truth 与 Actor Belief 分离；
- `known / believed / suspected / disputed`；
- `witnessed / direct_message / told_by / public_broadcast / surveillance / rumor / inference` 等信息渠道；
- Actor-scoped view；
- bounded graph；
- `open_loop`；
- context/display exposure；
- projection anchor 与 scope epoch。

Director 侧又已有 `epistemic_scout` 检查知识边界。

因此“角色认知系统”不是从零开始，而是已有一阶 epistemic substrate，后续可研究如何把它提升为长期 BDI / Theory of Mind。

#### Commitments / Narrative derived state

`public/scripts/native/context-derived.js` 已有：

- narrative spine；
- open/closed/superseded commitment；
- significant event gate；
- turn digest；
- runtime/orchestrator/utility/distiller 多 producer。

这为跨回合 Goal、prospective memory 与长期 open-loop 提供了天然连接点。

#### Task / Background / Maintenance

Native Task Contract 已明确区分：

- `turn_blocking`
- `interactive`
- `background`
- `maintenance`

Task Scheduler 已有 concurrency、per-resource、queue、retry、timeout、supersede 与 retention 约束。

这意味着未来“持续目标”或“后台认知维护”不应新造第二套 scheduler。

#### Task Artifact

`src/native/task-artifact-authority.js` 已经提供非常关键的语义：

- production revision；
- branch；
- task definition hash；
- dependency fingerprint；
- exact input；
- `same_revision / same_branch`；
- `once / reusable`；
- consumption evidence。

这很接近未来 Agent 之间共享 typed cognitive artifact 所需要的 provenance / reuse 语义。

#### Simulation

`src/native/simulation-authority.js` 已具备 deterministic bounded world simulation、clock advance、scheduled transaction 与 task admission。

因此未来 Counterfactual Agent 不应直接修改或取代 Simulation Authority，而应作为其上层的**认知模拟/假设分支**存在。

---

## 3. 当前真正的能力缺口

结合代码现状，Atria 当前更像是：

> **强执行内核 + 强编排 + 强记忆 + 初步 epistemic/world runtime**

而不是缺一个新的“Agent 模式”。

主要缺口集中在五个问题：

1. **Agent 会不会从自己的长期执行结果中学习？**
2. **Agent 有没有跨 run 持续存在、且有完成证据的目标？**
3. **角色是否拥有可持续演化的内部认知，而不是每轮临时推理一次？**
4. **Agent 能否在实际行动前比较多个可能未来？**
5. **Agent 能否判断一个问题值得投入多少模型、工具、时间和并行度？**

除此之外还有一个更底层的问题：

6. **Agent 之间能否共享有 provenance 的 typed cognition，而不是不断转述长文本？**

这六个问题构成本文的主要研究方向。

---

## 4. 外部研究与工程趋势

### 4.1 从 Trace 到 Eval，再从 Eval 反推 Agent 改进

OpenAI 的 Agent Improvement Loop 把完整运行轨迹、人工/模型反馈、可重复 eval 与 harness change 串成闭环。关键思想不是“让 Agent 随便自我修改”，而是：

`Trace → Feedback → Eval → Candidate Change → Re-evaluate`

这和 Atria 已有 runtime trace、review feedback、Skill、Prompt、Preset、Task Artifact 非常契合。

研究启示：

- 成长系统首先需要**可复现的评价闭环**；
- 先演化 prompt / skill / routing / policy，比直接做参数训练更适合作为产品第一步；
- 线上自我修改不应跳过 review / promotion / rollback；
- 失败案例本身应该成为长期资产，而不是只存在于日志。

参考：
- OpenAI, *Build an Agent Improvement Loop with Traces, Evals, and Codex*  
  https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop

### 4.2 Persistent Goal 正在成为 Agent 的独立状态

OpenAI 2026 年 Codex Goals 将 Goal 定义为持久目标/完成契约，而不是更大的 prompt。它强调：

- measurable outcome；
- verification surface；
- constraints；
- lifecycle；
- budget；
- evidence-based completion；
- event-driven continuation；
- blocked stop condition。

这说明“目标”正在从 prompt 文本中的一句话，演化为 Agent Runtime 的正式状态对象。

参考：
- OpenAI, *Using Goals in Codex*  
  https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex

### 4.3 自我改进不一定需要训练权重

GEPA 与 ACE 都指向一个很适合 Atria 的方向：从 trajectory / execution feedback 中提炼自然语言策略、规则和 playbook，并对 prompt/context 进行增量进化。

GEPA 强调从少量 trajectory 反思问题、提出 prompt update、验证候选；ACE 则把 context 视为可持续积累、整理和演化的 playbook，避免每次压缩都损失细节。

这与 Atria 已有 Skill 系统天然兼容。

参考：
- GEPA: https://arxiv.org/abs/2507.19457
- ACE: https://arxiv.org/abs/2510.04618

### 4.4 Theory of Mind 从“角色不知道什么”走向动态 BDI 假设

ToM-Agent 将 Belief / Desire / Intention 与 confidence 分离，并根据“预测对方如何回应”和“真实回应”的差异更新心智模型；同时研究一阶与二阶 ToM。

Hypothetical Minds 则维护关于其他 Agent 策略的自然语言 hypothesis，并根据预测命中情况不断强化或修正。

两者共同指向：

> 心智模型的价值不只在于记录“知道/不知道”，而在于形成可预测、可修正、有不确定度的内部模型。

参考：
- ToM-Agent: https://arxiv.org/abs/2501.15355
- Hypothetical Minds: https://arxiv.org/abs/2407.07086

### 4.5 World Model 从“计划”走向“动作条件下的未来预测”

Qwen-AgentWorld 将 world model 定义为根据 observation + action 预测环境动态，并将其作为通用 Agent 的独立认知机制。

对 Atria 的直接启发不是去复制一个大模型，而是把“未来预测”从 prompt 中隐式思考，提升成**可观察、可比较、可丢弃的认知产物**。

参考：
- Qwen-AgentWorld: https://arxiv.org/abs/2606.24597

### 4.6 Agent Eval 必须评价 trajectory，而不仅是最终回复

Anthropic 的 Agent eval 工程总结强调：Agent 的困难来自多步工具调用、状态修改、动态适应，因此仅评价最终文本无法覆盖行为质量。

这对 Atria 尤其重要，因为同一个最终回复可能来自：

- 多余 10 次工具调用；
- 错误 recall 后侥幸修正；
- 不必要的高价模型 escalation；
- 违反 capability 后被 fallback 拦住；
- 正确且最小成本的路径。

这些 run 在最终文本上可能相似，但系统质量完全不同。

参考：
- Anthropic, *Demystifying evals for AI agents*  
  https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic, *How we built our multi-agent research system*  
  https://www.anthropic.com/engineering/multi-agent-research-system

---

## 5. 候选方向一：Agent Experience / Evolution

### 5.1 核心问题

> Agent 能不能不仅记住世界发生了什么，还记住“自己怎样做事更有效”？

这是本文优先级最高的研究方向。

当前 Atria 已经记录大量 run-time evidence，但这些 evidence 主要用于：

- 调试；
- 展示；
- recovery；
- review；
- 当前 run 内 rerun。

它们还没有被提升为长期“Agent Experience”。

### 5.2 Experience 与 Memory 的边界

建议后续研究中保持以下概念分离：

| 概念 | 主要回答 | 典型内容 |
|---|---|---|
| Memory | 世界发生过什么 | 人物、事件、地点、关系 |
| Experience | Agent 怎样做过、结果怎样 | trajectory、tool path、失败模式、用户反馈 |
| Skill / Policy | 多次 Experience 证明什么做法更好 | 方法规则、critic discipline、routing strategy |

这个分离是后续所有自我改进能力的基础。

### 5.3 一个可能的研究闭环

概念上可以研究：

`Run → Outcome → Feedback → Diagnosis → Eval → Candidate Skill/Policy → Replay → Promotion`

这里最重要的不是自动修改，而是**Promotion Gate**。

候选变更可以是：

- Skill Revision；
- Prompt Revision；
- Planner policy；
- routing；
- tool preference；
- context policy；
- critic method；
- budget heuristic。

任何候选都应该先被历史案例和固定 eval 验证，再进入正式运行环境。

### 5.4 可能的 Experience 信号

Atria 已经或较容易观测到：

- user regenerate / swipe；
- user manual edit；
- explicit review feedback；
- critic reject / rerun；
- tool failure；
- stale reference；
- recovery；
- token/call count；
- model route；
- final accept；
- repeated contradiction；
- memory duplicate / correction；
- note pollution；
- task result accepted/rejected；
- project change set accepted/rejected。

其中很多信号本身并不等价于“质量”，需要组合而不是简单打分。

### 5.5 研究价值

如果成功，它会使 Atria 第一次拥有真正的**程序性成长**：

- 同一个 Director profile 使用越久越懂该卡容易犯什么错；
- 某个 card / project 能沉淀自己的经验；
- global skill 能从多个项目中提炼通用规则；
- 用户修改能够逐渐变成可验证的行为偏好，而不是一次性 correction；
- Agent 能解释“为什么我现在选择这套流程”。

### 5.6 主要风险

- 从少量负反馈过拟合；
- 错把用户一次性选择当成长期偏好；
- prompt/skill 不断膨胀；
- 新经验与旧经验互相冲突；
- self-modification 缺少 rollback；
- eval 只看最终文本而忽略 trajectory；
- 经验来源跨角色/跨项目污染。

因此 Experience Layer 首先是**证据与评价系统**，而不是“自动改 prompt”按钮。

---

## 6. 候选方向二：Persistent Goal Contract

### 6.1 核心问题

> Agent 能不能拥有跨多个 run 持续存在、且只有在证据满足时才完成的目标？

Agenda 已有 todo / goal / replan，但它们主要属于单次 orchestration。

真正的 Goal 应更接近长期 completion contract。

### 6.2 Goal 与普通 Task 的区别

Task 更像：

> “现在执行一次动作并产生结果。”

Goal 更像：

> “这个状态必须最终变成 true；在此之前持续保留进度、证据与阻塞原因。”

概念字段可能包括：

- objective；
- success criteria；
- invariants；
- evidence；
- progress；
- blockers；
- budget；
- continuation policy；
- wake trigger；
- lifecycle status。

这些只是研究维度，不是本文冻结的数据 schema。

### 6.3 Atria 的天然底座

Goal 可以复用已有概念，而非重新建设：

- Commitment：未来尚未完成的承诺；
- Open Loop：尚未关闭的信息/剧情循环；
- Background/Maintenance Task：非当前 turn 工作；
- Task Artifact：完成证据；
- Lifecycle/clock：事件与时间触发；
- branch/revision：目标证据所属状态；
- Agent Runtime：继续执行与 stop；
- user takeover / review：控制权边界。

### 6.4 Prospective Memory

Goal 最有价值的副产品之一是“未来记忆”：

Memory 主要保存：

> 我过去发生过什么。

Prospective Memory 保存：

> 将来某个条件成立时，我必须重新关注什么。

例如：

- NPC 承诺三天后回来；
- 一个长期 Project 仍缺验证证据；
- 某个世界事件到期；
- 某个关系条件变化后需要重新评估计划。

这比简单 cron 更接近 Agent cognition，因为 trigger 与 goal/commitment/evidence 关联。

### 6.5 主要风险

- vague goal 导致永不完成；
- 长期目标越积越多；
- background autonomy 侵占用户控制；
- evidence 标准不明确；
- goal 之间冲突；
- goal 跨 branch 后语义失效；
- 被旧 revision 的 artifact 错误宣告完成。

Atria 现有 provenance 与 revision 模型能降低其中一部分风险。

---

## 7. 候选方向三：Cognitive Graph / BDI / Theory of Mind

### 7.1 核心问题

> 能不能让角色拥有真正持续演化的内部认知，而不是每轮都从上下文重新“猜一次人物心理”？

这是对 Atria RP / NPC 差异化价值最高的方向之一。

### 7.2 从 Epistemic State 到 Cognitive State

现有 Information Runtime 已有 Truth / Belief 与 knowledge boundary。

下一层可以研究：

- Belief；
- Desire；
- Intention；
- Expectation；
- Emotional appraisal；
- uncertainty / confidence；
- inferred cause；
- prediction；
- model-of-other。

关键不是字段数量，而是这些状态拥有：

- 来源；
- 适用 Actor；
- confidence；
- 更新事件；
- 可撤销性；
- 与 world truth 的明确边界。

### 7.3 一阶与二阶 Theory of Mind

一阶：

> A 认为 B 想做什么。

二阶：

> A 认为 B 认为 A 想做什么。

在 RP、社会模拟、谈判、欺骗和关系塑造中，二阶模型会带来巨大差异：

- 假装不知道；
- 试探；
- 欺骗；
- 误会；
- 猜忌；
- 双方互相预测；
- 秘密与泄露；
- “我知道你知道，但我不知道你是否知道我知道”。

这比单纯增加记忆节点更接近真实社会智能。

### 7.4 Prediction Error 作为更新信号

ToM-Agent 最值得借鉴的不是具体 prompt，而是：

> 让 Agent 先对对方行为做预测，再用真实行为修正内部假设。

概念示例：

```yaml
hypothesis:
  actor: npc_a
  target: player
  belief: "如果直接追问，玩家会转移话题"
  confidence: 0.71
```

后续真实行为与预测不符：

`prediction error → confidence change → alternative hypothesis`

这能让人物关系成为真正动态模型，而不是静态 persona 描述。

### 7.5 与 Memory Graph 的关系

Cognitive Graph 不应简单复制 Memory Graph。

Memory Graph 更偏“外部事实与经历”。

Cognitive Graph 更偏：

> **某个 Actor 当前如何解释这些事实。**

同一件事允许：

- World Truth = X；
- Actor A believes X；
- Actor B suspects not-X；
- Actor C has no exposure；
- Actor A believes B knows X；
- Actor B believes A is lying。

这正是 Atria 现有 Information Authority 最值得继续深化的地方。

### 7.6 主要风险

- 把模型臆测写成角色真实心理；
- 心智状态膨胀；
- second-order 无限嵌套；
- confidence 被误当成客观概率；
- hidden state 泄露；
- 世界真相与角色 belief 混写；
- 每轮过度更新导致人物性格漂移。

因此未来若进入实现，必须继续坚持 Atria 当前 Truth / Belief authority separation，而不是把所有心理描述塞进 Memory。

---

## 8. 候选方向四：Counterfactual World Model

### 8.1 核心问题

> Agent 能不能在真正行动前，显式比较多个可能未来？

当前 critic/review 往往属于：

`决定 → 生成 → 发现问题 → 修正`

Counterfactual 更接近：

`提出多个行动 → 模拟未来 → 比较 → 再决定`

### 8.2 与现有 Simulation Authority 的边界

Native Simulation 是正式世界运行机制的一部分，具有确定性、预算和 authority 约束。

Counterfactual 则应该是：

- Derived；
- hypothetical；
- non-authoritative；
- disposable；
- 不自动写回 World；
- 明确基于某个 base revision；
- 最终只有选中的 action 才进入正式 Authority。

换句话说：

> **Simulation Authority 负责“世界真的如何推进”；Cognitive World Model 负责“Agent 想象如果这么做可能怎样”。**

### 8.3 可能的用途

- RP 剧情分支比较；
- NPC 高影响决策；
- 战术/谈判；
- Project Agent 方案比较；
- 高风险工具调用；
- 角色关系升级前的后果预测；
- 多 Agent 提案 arbitration。

### 8.4 第一版研究重点不应是训练 World Model

在产品验证阶段，可以先研究：

- 多个 cheap rollout；
- 一个 stronger evaluator；
- 只在高影响节点触发；
- 每个 scenario 产出 typed prediction artifact；
- 记录预测结果与真实后果，未来进入 Experience。

这样 Counterfactual 与 Experience 会形成闭环：

`预测 → 行动 → 真实结果 → prediction error → 改善未来预测`

### 8.5 主要风险

- 模拟成本过高；
- “想得更多”不等于“想得更准”；
- imagined future 被误写成真实事实；
- scenario 数量爆炸；
- evaluator 偏好导致保守化；
- RP 变成机械决策树；
- 低影响回合也过度 deliberation。

因此它更适合作为按风险/不确定度触发的高阶能力，而不是默认每 turn 全开。

---

## 9. 候选方向五：Metacognitive Controller

### 9.1 核心问题

> Agent 能不能判断“这件事值得花多少脑力”？

Atria 已有：

- 不同模型 route；
- 并行；
- budget；
- rerun；
- fallback；
- critic；
- dynamic dispatch。

但它们更多是“可用能力”，还不是一个统一的 computation allocation cognition。

### 9.2 可以研究的元认知维度

例如：

- uncertainty；
- novelty；
- irreversibility；
- epistemic conflict；
- memory ambiguity；
- expected value of additional thinking；
- cost；
- latency；
- previous failure similarity。

这些信号可以影响：

- 是否触发 optional scout；
- brainstorm 数量；
- critic 轮数；
- retrieval depth；
- model tier；
- tool budget；
- counterfactual branch 数；
- 是否升级到 Director；
- 是否请求用户确认。

### 9.3 不是简单“省 token”

真正目标是：

> **把计算量集中到错误代价高、信息不充分、历史上容易失败的地方。**

理想状态不是始终调用最强模型，而是：

- 简单问题快速完成；
- 高风险问题自动加深；
- 不确定度没有下降才升级；
- 无额外信息价值时停止继续思考。

### 9.4 与现有 mandatory guard 的关系

当前 Director 的 lorebook / epistemic / intent 等 mandatory guard 是为了保护高价值 invariant。

未来元认知控制器不应未经 eval 就跳过这些 guard。

第一阶段更适合调节：

- optional work；
- depth；
- branch count；
- model tier；
- rerun；
- additional critic。

当 Experience/Eval 能证明某些 invariant 在特定条件下可安全 fast-path 后，再研究动态跳过。

### 9.5 主要风险

- controller 本身成本大于节省；
- 错误低估任务难度；
- fast-path 破坏隐性 invariant；
- 预算 heuristic 被特定模型绑死；
- cost optimization 导致质量退化。

因此它依赖 Experience/Eval 提供真实数据，而不适合作为最先实现的方向。

---

## 10. 候选方向六：Typed Cognitive Blackboard

### 10.1 核心问题

> 多 Agent 之间能不能共享结构化认知产物，而不是用一大段自然语言不断转述？

当前很多 multi-agent 系统最终都会遇到“传话损失”：

- Scout 找到原始证据；
- Planner 收到 summary；
- Critic 再看 Planner 的 summary；
- Finalizer 又看 Critic 的 summary。

来源逐层丢失，事实与推断混在一起。

### 10.2 Atria 已有适合复用的 Artifact 语义

Task Artifact 已有：

- source revision；
- dependency fingerprint；
- reuse；
- cardinality；
- consumption evidence。

未来可以研究把部分 Agent 中间认知提升为 typed artifact：

- `EvidenceSet`
- `HypothesisSet`
- `Plan`
- `Critique`
- `PredictionSet`
- `Decision`
- `Draft`
- `EvalResult`

Agent 默认只看 lightweight reference，需要时再展开具体内容。

### 10.3 Shared Cognitive Workspace

概念目标：

```text
Memory Scout ── Evidence ─┐
Lore Scout ─── Evidence ──┼─> Planner ── Plan
Epistemic ─── Hypothesis ─┘                  │
                                            ├─> Critics
                                            ├─> Simulator
                                            └─> Decision
```

这里的重点不是 UI，而是：

- provenance；
- typed boundary；
- lazy expansion；
- revision validity；
- derived vs authority separation；
- cross-agent reuse。

### 10.4 主要价值

- 降低上下文复制；
- 减少多层摘要失真；
- 让 eval 能检查“哪条证据支持哪项判断”；
- 提升恢复/replay；
- 给 Counterfactual、Goal evidence、Experience 提供共享 substrate；
- 让不同 Agent 对同一 evidence set 做独立判断。

### 10.5 主要风险

- schema 过早固定；
- artifact 数量爆炸；
- 把自然语言推理强行结构化导致表达能力下降；
- read amplification；
- provenance 很完整但使用体验复杂。

因此它可能在实际实现中被提前作为共用基础设施，但研究上仍应先确认哪些 cognition 值得 typed 化。

---

## 11. 六个方向之间的关系

它们不是六个互相独立的 Feature。

更接近：

```text
                    Goal
        “我要最终达成什么？”
                      │
                      ▼
              Cognitive State
     “我知道/相信/猜测/想要什么？”
                      │
                      ▼
        Counterfactual / Planning
          “如果这样做会怎样？”
                      │
                      ▼
          Orchestration + Tasks
         “现在具体怎么执行？”
                      │
                      ▼
              Real Outcome
                      │
                      ▼
                 Experience
      “结果怎样？我该学到什么？”
                      │
                      ▼
             Skill / Policy Evolution
                      │
                      └──────────────► 下一次执行

Typed Cognitive Blackboard 横跨整条链路，
Metacognitive Controller 决定每一段值得投入多少计算资源。
```

因此长期来看，Atria 可以形成五种不同的“时间方向”：

- **Memory**：过去发生了什么；
- **Cognition**：现在如何理解世界；
- **Goal**：未来必须达到什么；
- **World Model**：不同未来可能怎样；
- **Experience**：过去的行动告诉我以后应怎样行动。

这比单纯增加更多 Agent role 更接近完整智能体架构。

---

## 12. 研究优先级（非实施阶段）

以下顺序只表示“当前最值得先研究/验证什么”，不是正式开发阶段划分。

| 顺序 | 方向 | 当前判断 |
|---|---|---|
| **1** | Agent Experience / Evolution | 最基础。后续所有“更聪明”都需要 eval 和经验闭环证明有效 |
| **2** | Persistent Goal Contract | 与 Commitment / Task / Artifact / Lifecycle 高度契合，能把 run-level Agent 提升为持续 Agent |
| **3** | Cognitive Graph / BDI / ToM | Atria RP/NPC 最有差异化潜力，且已有 epistemic substrate |
| **4** | Counterfactual World Model | 建立行动前的未来预测；应复用 revision / simulation 边界 |
| **5** | Metacognitive Controller | 依赖前面的 eval 数据判断何时值得增加计算 |
| **6** | Typed Cognitive Blackboard | 长期价值很高；实际实现时若前几个方向需要 shared artifact，可被提前抽取 |

这里特意把 Blackboard 保留为“可提前抽取”的横向基础，而不是强行规定一定最后实现。

---

## 13. 推荐长期架构视角

本文不冻结具体模块，但研究上可以用下面这张图判断未来设计是否在重复建设：

```text
┌──────────────────────────────────────────────┐
│                  Goal Layer                  │
│   persistent objective / criteria / budget   │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│               Cognitive Layer                │
│ Belief / Desire / Intention / ToM / Hypoth.  │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│           Deliberation / World Model         │
│      planning / counterfactual / compare     │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             Orchestration Runtime            │
│       Spec / Agenda / Loop / Director        │
└──────────────────────┬───────────────────────┘
                       │
              Tools / Native Tasks
                       │
┌──────────────────────▼───────────────────────┐
│             Native Authorities               │
│ World / Information / Lifecycle / Simulation │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│              Experience Layer                │
│ trace / feedback / eval / promotion / replay │
└──────────────────────┬───────────────────────┘
                       │
               Skill / Policy Evolution
```

Typed Cognitive Blackboard 可以作为上述各层之间的 derived artifact substrate。

Metacognitive Controller 则横跨 Orchestration、Deliberation 和 Model/Tool routing。

---

## 14. 跨方向的架构原则

这些不是具体实现方案，而是从当前 Atria 设计中已经表现出的长期约束。

### 14.1 Authority 不应交给模型臆测

模型可以：

- 推断；
- 提议；
- 预测；
- 生成 derived artifact。

但 World Truth、正式状态修改、不可逆操作仍应经过现有 Authority / Review / typed command 边界。

### 14.2 所有长期认知都应有 provenance

特别是：

- Goal evidence；
- Experience lesson；
- ToM belief；
- Counterfactual prediction；
- evolved Skill。

应该能够回答：

> 它来自哪个 revision、哪些 evidence、哪个 Agent/run、什么时候产生、现在是否仍有效？

### 14.3 Derived 与 Truth 必须分开

未来最危险的污染包括：

- “Agent 预测 NPC 会背叛”被当成 World Truth；
- “NPC 怀疑用户是间谍”被当成用户真实身份；
- “某次 critic 认为写法不好”被写成永久角色设定。

Atria 现有 Truth/Belief、Task Artifact、revision 模型正适合保护这个边界。

### 14.4 自我进化必须可回滚

任何 Experience-driven evolution 都应该能够：

- 查看来源；
- 比较 revision；
- offline eval；
- promote；
- rollback；
- 禁止自动越权修改核心 authority。

### 14.5 自主性必须 bounded

更主动不等于无限后台循环。

Goal、background task、counterfactual 和 self-improvement 都需要：

- budget；
- stop condition；
- scope；
- lifecycle；
- user takeover；
- explicit authority。

### 14.6 Eval 应同时看结果、轨迹和成本

至少区分：

- final quality；
- factual/continuity correctness；
- authority safety；
- tool path；
- unnecessary calls；
- latency；
- token/cost；
- recovery；
- user correction/regenerate。

---

## 15. 暂不建议作为独立大方向重复建设的内容

基于当前主线，下列主题更适合作为现有能力增强，而不是新建一条平行系统：

- 新的普通 DAG orchestrator；
- 新的普通 Planner loop；
- 单纯增加 critic Agent；
- 单纯增加 reflection round；
- 第二套 Memory/RAG；
- 第二套 background scheduler；
- 第二套 simulation authority；
- 第二套角色 truth store；
- 把 Skill 再包装成另一种 prompt library；
- 只做“多 Agent 数量更多”的模式。

如果未来某个新方向需要这些能力，应优先扩展现有 Runtime / Memory / Task / Information / Simulation 边界。

---

## 16. 后续正式设计前值得重新回答的问题

每个方向真正进入开发前，应重新以当时 `main` 为准回答自己的研究问题。

### Experience

- 什么事件足以构成“反馈”？
- 用户 regenerate 是否能被安全解释为负反馈？
- lesson 的作用域是 run / preset / character / project / global 中哪一级？
- 如何避免 prompt/skill 无限增长？
- promotion 需要多少 eval evidence？

### Goal

- Goal 的 authority 属于谁？
- 是否 thread/session/project scoped？
- 什么时候允许自动 continuation？
- Goal 与 Commitment/Open Loop 如何区分？
- branch/fork 时如何继承？
- 什么 evidence 足以完成 Goal？

### Cognitive Graph

- 哪些心智状态值得持久化？
- confidence 如何解释而不伪装成概率真值？
- second-order ToM 最大深度？
- 角色 belief 由谁写、谁可修正？
- prediction error 是否会造成角色频繁改性格？

### Counterfactual

- 什么风险阈值值得触发？
- scenario 是否需要 typed artifact？
- 如何保证 hypothetical 内容绝不进入 Truth？
- 怎样评价预测质量？
- 如何控制 rollout 成本？

### Metacognition

- 哪些信号能可靠估计“继续思考的价值”？
- controller 使用规则、小模型还是当前主模型？
- 哪些 mandatory guard 永远不能 fast-path？
- 如何验证节省成本没有隐藏质量退化？

### Blackboard

- 第一批最值得 typed 化的 artifact 是什么？
- 哪些信息仍应保持自然语言？
- artifact expansion 如何控制 context？
- 是否直接扩展 Task Artifact，还是只复用其语义？

---

## 17. 可继续观察的次级方向

以下方向有价值，但当前优先级低于六个主方向：

### User Mental Model

不仅记录“用户偏好”，而是持续建模用户的目标、容忍度、写作取向、修改行为与当前意图。

这与 ToM-SWE 等工作方向一致，但 Atria 需要特别避免把一次性的用户行为错误固化为人格画像。

### Agent Identity / Long-lived Self Model

让特定 Agent 对自己的角色、能力边界、历史承诺和经验形成稳定 identity。

其价值可能在长期桌宠、NPC companion、Project Agent 中高于普通临时 worker。

### Society-scale Autonomous NPC

基于 Goal + BDI + Simulation 形成多个 NPC 自主生活、计划与互动。

这是很有产品想象力的终局方向，但如果缺少 Experience/Goal/Cognition 三层，容易退化成高成本随机事件生成器。

---

## 18. 当前结论

Atria 当前最值得做的，不是继续扩大 Orchestrator 的“执行形态”，而是为现有执行能力增加真正的认知闭环。

最重要的三个研究方向是：

1. **Experience / Evolution** —— 让 Agent 从真实运行历史中学习；
2. **Persistent Goal** —— 让 Agent 拥有跨 run 的可验证目标；
3. **Cognitive Graph / ToM** —— 让角色拥有长期演化且彼此不同的认知世界。

Counterfactual、Metacognition 和 Typed Blackboard 则分别补上：

- 行动前的未来预测；
- 对计算资源的自我调节；
- 多 Agent 之间可追溯的结构化认知交换。

如果这些能力最终都建立在 Atria 已有的 Authority、Revision、Task、Artifact、Information、Simulation 和 Orchestration Runtime 上，而不是各自再造一套平行状态机，Atria 才有机会从“高级 Agent 编排器”继续演化为真正统一的 Agent Runtime / Cognitive Runtime。

---

## 19. 外部资料索引

### Agent improvement / eval

- OpenAI — Build an Agent Improvement Loop with Traces, Evals, and Codex  
  https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop
- Anthropic — Demystifying evals for AI agents  
  https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

### Persistent goals

- OpenAI — Using Goals in Codex  
  https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex

### Context / prompt evolution

- GEPA — Reflective Prompt Evolution Can Outperform Reinforcement Learning  
  https://arxiv.org/abs/2507.19457
- ACE — Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models  
  https://arxiv.org/abs/2510.04618

### Theory of Mind

- ToM-Agent — Large Language Models as Theory of Mind Aware Generative Agents with Counterfactual Reflection  
  https://arxiv.org/abs/2501.15355
- Hypothetical Minds — Scaffolding Theory of Mind for Multi-Agent Tasks with Large Language Models  
  https://arxiv.org/abs/2407.07086

### World models

- Qwen-AgentWorld — Language World Models for General Agents  
  https://arxiv.org/abs/2606.24597

### Multi-agent engineering

- Anthropic — How we built our multi-agent research system  
  https://www.anthropic.com/engineering/multi-agent-research-system
