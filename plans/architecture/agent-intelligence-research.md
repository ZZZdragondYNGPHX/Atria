# Atria 智能体能力深化与 Frontier Agent RP 架构调研

> **Status:** Research / Non-binding  
> **Date:** 2026-10-06  
> **Research update:** Frontier Agent RP architecture pass II  
> **Code baseline:** `main@ed1fd90521a63363e29856601abbf5e908c99d10`  
> **Primary workspace:** `docs`  
> **Purpose:** 为后续逐项深化 Atria 智能体能力，并将 Atria 演进为可持续吸收未来 Agent / RP / World Model / Multimodal / Learning 技术的前沿运行平台，提供研究背景、现状基线、候选方向与架构兼容性依据。  
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

如果目标只是逐项增加高级 Agent 功能，原有的研究顺序仍然成立：

`Experience → Persistent Goal → Cognitive Graph / ToM → Counterfactual → Metacognition → Typed Blackboard`

但如果目标升级为“让 Atria 成为走在前沿、并能持续吸收未来 Agent RP 技术的平台”，则应该增加一个更高层的 **platform-first** 视角。

### 12.1 Feature research order

| 顺序 | 方向 | 当前判断 |
|---|---|---|
| **1** | Agent Experience / Evolution | 最基础。后续所有“更聪明”都需要 eval 和经验闭环证明有效 |
| **2** | Persistent Goal Contract | 与 Commitment / Task / Artifact / Lifecycle 高度契合，能把 run-level Agent 提升为持续 Agent |
| **3** | Social Cognitive World Model / BDI / ToM | Atria RP/NPC 最有差异化潜力，且已有 epistemic substrate |
| **4** | Counterfactual World Model | 建立行动前的未来预测；应复用 revision / simulation 边界 |
| **5** | Metacognitive Controller | 依赖前面的 eval 数据判断何时值得增加计算 |
| **6** | Typed Cognitive Blackboard | 长期价值很高；实际实现时若前几个方向需要 shared artifact，可被提前抽取 |

### 12.2 Platform-first frontier order

| 优先级 | 研究层 | 当前判断 |
|---|---|---|
| **P0** | Unified Cognitive Artifact + Unified Agent Trajectory + Cognitive/Authority boundary | 这是未来兼容底座。先让新技术有稳定的输入输出、证据、revision 与 authority 边界 |
| **P1** | Experience + Eval | 形成可重复的质量闭环，并开始积累未来 prompt/skill/RL/post-training 可消费的 trajectory |
| **P2** | Social Cognitive World Model | 建立 Belief / Goal / Emotion / Relationship / ToM / causal trajectory，形成 RP 核心差异 |
| **P3** | Persistent Goal + Fast/Slow Cognition | 让 Agent 跨回合持续存在，并按任务价值选择轻重认知路径 |
| **P4** | Counterfactual + World Model Provider | 先支持结构化/文本预测；未来可以适配专用语言或视觉 world model |
| **P5** | Expression / Multimodal | 把 cognition 与文字、语音、prosody、Avatar、动画分离 |
| **P6** | Interop + Training adapters | 通过协议与训练接口适配 MCP/A2A/AG-UI/A2UI、RL、latent communication 等后续生态 |

这里的 P0–P6 仍然只是**研究路线**，不是正式开发阶段。某个共用 substrate 如果成为前序方向的实际依赖，可以提前抽取；反之，不应为了“架构完整”而提前实现没有真实消费者的抽象层。

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


---

## 20. Frontier Agent RP：新的长期定位

第二轮前沿调研后，本文建议把 Atria 的长期目标从“高级文字 RP + 多 Agent 编排器”继续提升为：

> **一个面向角色、世界与长期关系的 Agent RP Runtime。模型可以换、记忆算法可以换、训练方法可以换、World Model 可以换，但角色的连续存在、世界权威、社会认知、经验演化与表达接口由 Atria 持续承载。**

这个定位意味着 Atria 不应该押注某个特定模型、某个 Prompt 技巧或某种 2026 年流行 Agent 框架，而应该把未来技术吸收到稳定的运行层与数据边界中。

前沿研究正在从“让模型更会模仿角色语气”转向：

- psychology-grounded cognition；
- social world model；
- causal character evolution；
- lifelong interaction；
- memory cognition；
- character knowledge boundary；
- self-improving agent harness；
- fast/slow cognition；
- multimodal embodiment；
- world models；
- latent collaboration；
- open agent protocols。

Atria 当前的 Authority / Revision / Memory / Task / Artifact / Simulation / Orchestration 基础，使它很适合承接这些方向。

---

## 21. Character 不应长期等价于 Persona Prompt

### 21.1 前沿变化

Psy-CoT 不再把角色扮演简单理解为表面模仿，而是把响应前认知拆成：

1. Interaction Perception；
2. Psychological Empathy；
3. Logical Construction。

PersonaForge 则进一步使用心理学约束和 selective dual-process cognition，并把角色表示拆为稳定 traits、说话风格和 dynamic state。其长对话实验显示，完整 cognitive workspace 能明显降低 personality drift；Selective Think-then-Speak 又表明不需要每轮都执行完整重思考。

研究启示是：

> **Character Profile 应逐渐成为可投影的结构化角色模型，而不是永远停留在一段自然语言提示词。**

### 21.2 对 Atria 的未来边界

长期概念上可以区分：

```text
Character
├─ Identity
├─ Stable Disposition
├─ Speaking / Expression Style
├─ Current Cognitive State
├─ Beliefs
├─ Desires
├─ Intentions
├─ Appraisals / Affect
├─ Relationships
├─ Episodic History
├─ Current Goals
└─ Models of Others
```

Prompt 只是这些状态的一种**运行时投影**。

这意味着核心 schema 不应绑定某一套心理学理论。Big Five、Defense Mechanisms、ABC、BDI、未来新的角色认知模型都应能以 schema/profile/adapter 方式接入，而不是被写成 Atria 的永久世界真理。

### 21.3 参考

- Psy-CoT / RAPO — *Improving General Role-Playing Agents via Psychology-Grounded Reasoning and Role-Aware Policy Optimization*  
  https://arxiv.org/abs/2606.27025
- PersonaForge — *Psychology-Grounded Dual-Process Architecture for Personality-Consistent Role-Playing Agents*  
  https://aclanthology.org/2026.findings-acl.386/

---

## 22. Social Cognitive World Model 应成为 RP 核心研究层

### 22.1 为什么只做 Memory / Persona 不够

Social World Models 使用受 POMDP 启发的结构化社会状态来描述：

- state；
- observation；
- action；
- hidden mental state；
- evolving social dynamics。

该工作证明，显式表示隐藏心理状态不仅能提高 Theory of Mind reasoning，还能用于预测后续社会状态，并改善多轮社会 Agent 决策。

这对 RP 的意义很强：

> RP 的主要“环境”不只是物理世界，而是**社会世界**。

### 22.2 Social Cognitive World Model

未来可以把现有 Cognitive Graph 研究提升为更广义的：

**Social Cognitive World Model**

它回答：

> 每个 Actor 当前如何理解世界、别人以及自己与别人的关系？

概念上允许：

```text
World Truth: X

Actor A:
  believes X
  wants Y
  intends Z
  predicts B will do Q
  believes B thinks A does not know X

Actor B:
  suspects not-X
  wants R
  believes A is lying
```

这里最关键的是：

- 同一事实允许多个 Actor 持有不同认知；
- 错误 belief 合法；
- uncertainty 合法；
- second-order ToM 合法但必须 bounded；
- 所有 cognition 都不能污染 World Truth。

### 22.3 参考

- *Social World Models*  
  https://arxiv.org/abs/2509.00559

---

## 23. Causal Character Trajectory：从“记得事件”升级成“经历导致改变”

### 23.1 DREAM 的启示

DREAM 使用 Event-Aware Memory Graph，把角色经历组织为具有时间顺序和因果关系的事件图，并基于这些经历形成：

- 稳定人格；
- 事件驱动的动态行为/人格状态。

其核心启示不是再增加一种 graph database，而是：

> **角色现在为什么这样想、这样行动，应当能追溯到过去事件如何改变了它。**

### 23.2 Atria 可研究的因果链

```text
Event
  ↓
Appraisal
  ↓
Belief Update
  ↓
Emotion / Relationship Update
  ↓
Goal / Intention Update
  ↓
Action
  ↓
New Event
```

这条链可暂称：

**Causal Character Trajectory**

现有 Memory Event 可以继续保存“发生了什么”；Cognitive Layer 则保存“这些事件如何改变 Actor”。

两者不应该合并成同一个事实表。

### 23.3 为什么这比静态人格更适合长期 RP

它允许：

- 创伤产生长期警觉；
- 背叛降低信任但不必永久改变所有 personality trait；
- 一次承诺成为新目标；
- 长期互动逐渐改变 relationship；
- 角色经历真正影响后续 action selection。

这样“人物成长”不再是 LLM 每轮自由发挥，而是有来源、有历史、有可解释因果链。

### 23.4 参考

- DREAM — *LLM-based Dynamic Role-playing via Event-Aware Memory Graph*  
  https://arxiv.org/abs/2608.05170

---

## 24. Epistemic Firewall：知识边界应从 Prompt 提示升级为运行约束

### 24.1 CHARM 的关键结果

CHARM 把 Character Hallucination 区分成：

- **Boundary Awareness**：模型知不知道“角色不应该知道这个”；
- **Boundary Compliance**：模型在知道边界后，能不能真的不回答。

研究发现大量错误来自 Compliance failure：模型会先承认角色不该知道，但仍然调用自己的 parametric knowledge 给出事实答案。

这对 Atria 当前已有 `epistemic_scout` 是非常重要的提醒：

> **检测到“角色不知道”不等于已经保护了知识边界。**

### 24.2 Epistemic Firewall

长期值得研究从“scout advice”升级成执行级：

```text
Candidate Claim / Action
        ↓
Actor Knowledge Projection
        ↓
Knowledge Boundary Check
      /       \
   allowed    denied/uncertain
      │             │
      │      suppress / hedge /
      │      reframe / seek evidence
      ▼             ▼
Generation / Action
```

它不要求马上实现句子级 symbolic checker，但架构上应为：

- claim provenance；
- actor knowledge projection；
- parametric override detection；
- post-generation boundary audit；

留下位置。

### 24.3 Model Knowledge 与 Character Knowledge 必须分开

长期必须坚持：

```text
Model knows X
!=
Character knows X
```

这对历史角色、同人角色、跨宇宙角色和秘密剧情尤其重要。

### 24.4 参考

- CHARM — *Character Hallucination for Multicultural Role Play Benchmark*  
  https://arxiv.org/abs/2609.01352

---

## 25. Memory 应从 Store/Retrieval 继续走向 Memory Cognition

### 25.1 MREval 的四阶段记忆使用

Memory-Driven Role-Playing / MREval 将 Persona Memory 的正确使用拆为：

1. **Anchoring**：识别本轮与哪段角色记忆相关；
2. **Selecting**：选出真正需要的记忆；
3. **Bounding**：理解哪些知识不应该被使用；
4. **Enacting**：把记忆真正转化成角色行为。

这说明 Retrieval Accuracy 只是中间环节。

Atria Memory 长期应关注：

```text
Experience
  ↓
Encoding
  ↓
Consolidation
  ↓
Temporal / Causal Linking
  ↓
Retrieval
  ↓
Applicability Judgment
  ↓
Reconstruction
  ↓
Behavior
```

其中 **Applicability Judgment** 很重要：旧经验被检索到，不代表当前情况应该机械照搬。

### 25.2 历史更多不代表社会智能更强

LIFELONG-SOTOPIA 在长期多 episode 社交中发现：

- 随交互持续，模型的 goal achievement 与 believability 均下降；
- advanced memory 可以改善，但仍明显低于人类；
- 完整历史并没有自动解决长期社会智能。

这进一步说明：

> **Context ≠ Cognition；History ≠ Character Development。**

Atria 应追求把历史转化为更好的 state、causal trajectory、relationship 与 experience，而不是简单扩大 prompt。

### 25.3 参考

- MREval / Memory-Driven Role-Playing  
  https://aclanthology.org/2026.findings-acl.1175/
- LIFELONG-SOTOPIA  
  https://arxiv.org/abs/2506.12666

---

## 26. Emotion 与 Relationship 应成为独立持续状态

### 26.1 Long-lived companion 的评测趋势

LifeSide 将长期 companion 评测组织为 **Memory–Emotion–Environment loop**，并指出即使模型在传统 Memory benchmark 上表现很强，也仍可能无法在多 session 中持续理解用户、适应隐私边界并维持真实陪伴。

CompanionBench 又显示：

> **Role-play immersion 并不等价于 relationship competence。**

它把 emotional companion 拆成更细能力，例如 holding ambiguity、positive resonance、calibrated challenge 等；其结果显示很多 role-play agent 在关系能力上仍然很弱。

### 26.2 对 Atria 的研究含义

未来应明确区分：

```text
Character Personality
!=
Emotion
!=
Relationship
!=
Social Goal
```

Relationship 可以是独立的长期 state，而不是 Persona 文本或“好感度”单值。

研究维度例如：

```text
RelationshipState
├─ familiarity
├─ trust
├─ attachment
├─ respect
├─ fear
├─ resentment
├─ dependency
├─ obligation
├─ attraction
├─ perceived_reciprocity
└─ unresolved_tensions
```

这些只是可研究维度，不意味着未来必须使用固定数值表。

核心原则是：

- relationship 是 Actor-scoped cognition；
- relationship 变化应有事件/互动证据；
- relationship state 用于驱动 perception/appraisal/intention；
- 不应直接等价为面向玩家公开的“数值系统”。

### 26.3 参考

- LifeSide — *Benchmarking Agents as Lifelong Digital Companions*  
  https://arxiv.org/abs/2606.04660
- CompanionBench — *A Theory-Anchored, Real-World-Grounded Benchmark for AI Emotional Companionship*  
  https://arxiv.org/abs/2608.02046

---

## 27. Fast / Slow Cognition：未来不应假定“一次请求 = 一次完整认知”

PersonaForge 的 selective dual-process 结果提示：

- 完整认知工作区可以提高长期角色一致性；
- 但并不是每个 turn 都必须付出完整计算成本；
- 在关键 turn 才进入重认知路径可以保留大部分效果。

这与本文的 Metacognitive Controller 高度一致。

长期可以把 Agent cognition 区分为两类时间尺度。

### Fast cognition

用于：

- 环境感知；
- 微小情绪反应；
- 简单 social response；
- action selection；
- 高频 NPC 行为；
- local/on-device model。

### Slow cognition

用于：

- reflection；
- planning；
- relationship reappraisal；
- goal update；
- memory consolidation；
- counterfactual rollout；
- experience learning；
- high-impact decisions。

概念关系：

```text
                Slow Loop
        ┌────────────────────┐
        │ reflect / plan     │
        │ learn / consolidate│
        └─────────┬──────────┘
                  │
Fast Loop ◄───────┘
perceive → appraise → act
   ▲                 │
   └─────────────────┘
```

这也为未来的本地小模型 + 云端强模型、甚至 specialized cognition models 留下自然入口。

---

## 28. Expression / Embodiment：心理状态与最终输出媒介应解耦

VoxRole 指出，speech-based RP 的角色身份不仅存在于词句，还存在于：

- intonation；
- prosody；
- rhythm；
- speech persona；
- long-term vocal consistency。

因此长期不应把：

```text
LLM text → TTS
```

视为最终架构。

更适合的抽象是：

```text
Cognitive State
      ↓
Communicative Intent
      ↓
Expression Plan
├─ semantic content
├─ wording/style
├─ emotion
├─ intensity
├─ pacing
├─ pauses
├─ prosody
├─ gesture
├─ gaze
└─ facial expression
      ↓
Renderer / Provider
├─ Text
├─ TTS
├─ Avatar
├─ Animation
└─ Visual scene
```

Atria 今天即使只消费 text，也值得避免把所有角色表现都永久压缩为一个字符串，因为未来桌宠、语音 Agent、Live2D、3D NPC 都需要更丰富的 Expression representation。

参考：

- VoxRole — *A Comprehensive Benchmark for Evaluating Speech-Based Role-Playing Agents*  
  https://arxiv.org/abs/2509.03940

---

## 29. Training-ready Agent Harness：现在就为未来可训练留下 Trajectory

### 29.1 Agent Lightning 的启示

Agent Lightning 的关键思想是把 Agent 执行与 Agent 训练解耦：

- 保留现有 agent workflow；
- 把真实执行步骤转成可用于 RL / optimization 的数据；
- 允许模型 fine-tuning、prompt tuning、model selection 等优化方式独立演进。

这与 Atria 很契合，因为 Atria 已有 Runtime、Task、Artifact、Trace 与 Authority Receipt。

### 29.2 Unified Agent Trajectory

未来 Atria 的完整 run 最好能够标准化导出：

```text
Trajectory
├─ observation
├─ context refs
├─ cognitive artifact refs
├─ model/provider/revision
├─ decision
├─ tool/action
├─ effect/result
├─ authority receipt
├─ feedback
├─ eval/reward signals
├─ cost/latency
└─ final outcome
```

这不表示今天就训练模型。

它的价值是让未来：

- GEPA；
- ACE；
- prompt evolution；
- Skill evolution；
- DPO / GRPO / RAPO；
- Agent Lightning；
- 自定义 RL；
- 专用 RP post-training；

都可以消费同一种 Experience 数据，而不用重写 Runtime。

### 29.3 参考

- Microsoft Research — Agent Lightning  
  https://www.microsoft.com/en-us/research/project/agent-lightning/microsoft-research-blog/

---

## 30. Agent 通信不要写死为 Text：为 Typed 与 Latent Communication 留接口

### 30.1 前沿变化

LatentMAS 在 ICML 2026 研究多 Agent 直接通过连续 latent working memory 协作，而不是完全依赖文本转述。

StateBridge 又进一步研究跨模型 hidden-state alignment，说明“Agent 间通信 = text”并不是长期安全假设。

这类技术目前仍然过早，不建议 Atria 现在实现。

但 Atria 可以避免写死：

```text
agentOutput: string
```

### 30.2 Representation-neutral Agent Message

研究层可考虑：

```text
AgentMessage / ArtifactRef
├─ contentType
├─ representation
├─ payload or opaque ref
├─ schema
├─ provenance
├─ producer/model identity
└─ validity
```

今天可以是：

- `text/plain`
- `application/json`
- `application/atria-artifact`

未来才可能出现：

- embedding/latent representation；
- KV/cache-like opaque state；
- provider-owned model-state reference。

关键是**Orchestrator 核心不应依赖所有 Agent 结果必然可解释成 text**。

### 30.3 参考

- LatentMAS — *Latent Collaboration in Multi-Agent Systems*  
  https://proceedings.mlr.press/v306/zou26k.html
- StateBridge — *Training-free Hidden-state Alignment for Latent Communication in LLM Multi-Agent Systems*  
  https://arxiv.org/abs/2608.13317

---

## 31. World Model 应成为 Provider，而不是新的 Authority

Qwen-AgentWorld 明确把 world model 定义为：

> 根据 observation + action 预测环境 dynamics。

其用途不仅是 Agent planning，还包括作为 decoupled simulator 生成训练环境。

游戏方向则已经出现 Genie 3、Microsoft WHAM/Muse 这类可交互 visual world model。

这意味着 Atria 长期不应绑定某一种“未来模拟算法”，而应该允许一个可替换的 World Model Provider。

概念接口可研究为：

```text
WorldModelProvider
├─ predict()
├─ rollout()
├─ compare()
├─ branch()
├─ render()
└─ evaluate()
```

但必须保持硬边界：

> **World Model Prediction 永远不是 World Authority。**

World Model 只能生成：

```text
HypotheticalArtifact
├─ baseRevision
├─ provider/modelRevision
├─ assumptions
├─ predictedDelta
├─ uncertainty/confidence
└─ supporting refs
```

真正世界变化仍然只能由现有 Authority 路径提交。

参考：

- Qwen-AgentWorld  
  https://arxiv.org/abs/2606.24597
- Google DeepMind — Genie 3  
  https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/
- Microsoft Research — WHAM / Muse  
  https://www.microsoft.com/en-us/research/project/wham/

---

## 32. 外部生态应优先使用协议 Adapter，而不是 Atria 私有远程协议

2026 年 Agent 协议边界已经逐渐清晰：

- **MCP**：Agent ↔ Tool / Data；
- **A2A**：Agent ↔ Agent；
- **AG-UI**：Agent Backend ↔ Frontend event stream；
- **A2UI**：Agent → declarative native UI；
- **MCP Apps**：Tool / MCP server → interactive UI resource。

这些协议仍在快速演化，因此 Atria 不应把核心对象直接写成某个外部协议的数据结构。

更稳健的关系是：

```text
Atria Core Contracts
        │
        ├─ MCP Adapter
        ├─ A2A Adapter
        ├─ AG-UI Adapter
        ├─ A2UI Adapter
        └─ future protocol adapters
```

这样内部可以继续保持更严格的 Authority / Revision / Artifact 语义，而外部生态通过 adapter 接入。

参考：

- Google Developers — *Developer's Guide to AI Agent Protocols*  
  https://developers.googleblog.com/en/developers-guide-to-ai-agent-protocols/
- Google Developers — *Introducing A2UI*  
  https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/

---

## 33. RP Eval 应成为 Experience / Evolution 的核心基础设施

当前 RP benchmark 已经不再只有“像不像角色”一个分数。

### Memory-driven role fidelity

MREval：

- Anchoring；
- Selecting；
- Bounding；
- Enacting。

### Character knowledge safety

CHARM：

- Boundary Awareness；
- Boundary Compliance。

### General role-playing quality

RPEval：

- emotional understanding；
- decision-making；
- moral alignment；
- in-character consistency。

### Lifelong companion

LifeSide：

- memory；
- user understanding；
- privacy；
- emotion；
- lifelong interaction。

CompanionBench：

- relational/emotional capabilities；
- holding ambiguity；
- calibrated challenge；
- deeper disclosure 等长期关系指标。

### Speech RP

VoxRole：

- speech persona；
- prosody；
- long-term vocal consistency。

### Judge reliability

PersonaEval 的结果又提醒：LLM judge 自己可能连角色身份判断都不够可靠，其实验中最佳 LLM role identification 约 69%，而人类约 90.8%。

因此 Atria Eval 长期不应该等价为：

```text
single LLM judge -> score
```

更适合：

```text
Deterministic invariants
      +
Epistemic / Authority checks
      +
State transition checks
      +
Contrastive character eval
      +
Multiple independent judges
      +
Behavioral signals
      +
Human feedback
      +
Trajectory cost / efficiency
```

这会成为 Experience / Evolution 的真正地基。

参考：

- RPEval  
  https://arxiv.org/abs/2505.13157
- PersonaEval  
  https://arxiv.org/abs/2508.10014

---

## 34. 推荐的六个长期 Plane

为了让未来技术有稳定归属，Atria 可以长期用“Plane”而不是“Feature 列表”理解架构。

### 34.1 Authority Plane

回答：

> **世界实际上是什么？**

包括：

- World；
- Truth；
- Lifecycle；
- Task Result；
- Revision；
- Continuity；
- deterministic Simulation；
- committed Action Receipt。

核心原则：

> 模型可以提出变化，但不能直接创造正式世界真相。

### 34.2 Cognitive Plane

回答：

> **每个 Actor 如何理解世界？**

包括：

- Belief；
- Desire；
- Intention；
- Emotion；
- Appraisal；
- Relationship；
- Expectation；
- Hypothesis；
- Theory of Mind；
- Goal。

这里允许错误、矛盾、不确定、误会，但必须 Actor scoped，并与 Authority Truth 分离。

### 34.3 Deliberation Plane

回答：

> **现在应该怎么办？**

包括：

- planning；
- reflection；
- Spec / Agenda / Loop / Director；
- counterfactual；
- world-model rollout；
- fast/slow cognition；
- arbitration；
- metacognitive budget allocation。

### 34.4 Experience / Learning Plane

回答：

> **以前怎样做过？结果怎样？以后应该怎样改变？**

包括：

- trajectory；
- feedback；
- eval；
- reward；
- lesson；
- Skill；
- policy；
- scaffold revision；
- training dataset；
- promotion / rollback。

### 34.5 Expression / Embodiment Plane

回答：

> **内部认知最终如何表现？**

包括：

- text；
- speech；
- prosody；
- gesture；
- gaze；
- facial expression；
- Avatar；
- animation；
- image / scene rendering。

### 34.6 Interop Plane

回答：

> **Atria 如何连接不断变化的外部 Agent 技术？**

包括：

- model providers；
- memory providers；
- world-model providers；
- MCP；
- A2A；
- AG-UI；
- A2UI；
- training backends；
- remote agents；
- latent/opaque representation adapters。

---

## 35. Cognitive Artifact Bus：横跨所有 Plane 的未来兼容核心

前一轮的 Typed Cognitive Blackboard 在本轮调研后可以进一步抽象为：

**Cognitive Artifact Bus**

它不是新的 Authority database，而是各 Plane 之间传递 derived cognition 的统一语义。

第一批候选 artifact 类型可能包括：

```text
EvidenceSet
BeliefUpdate
EmotionAppraisal
RelationshipUpdate
Goal
Hypothesis
Prediction
Plan
Critique
Simulation
MemoryEpisode
Experience
Evaluation
RewardSignal
ExpressionPlan
```

每个 Artifact 至少应该能够表达：

```text
type
schemaVersion
producer
baseRevision
scope
sourceRefs
dependencies
representation
confidence/uncertainty (when meaningful)
validity
content or opaqueRef
```

这里没有要求所有字段都进入同一个永久 schema。

真正需要保持的是几个语义：

- provenance；
- revision binding；
- scope；
- derived vs authority；
- representation neutrality；
- invalidation；
- lazy expansion；
- typed consumption。

如果这一层成立，那么未来的新技术只需要：

> **消费某类 Artifact → 产生另一类 Artifact**

就可以接入现有 Atria，而不需要改写整个运行时。

---

## 36. 为未来技术避免写死的十条约束

第二轮调研后，以下十点值得作为长期研究警戒线。

1. **不要把 Character 写死成自然语言字符串。**  
   Character 应逐渐成为可投影的数据模型，Prompt 是 projection。

2. **不要把 Agent 间通信写死成 text。**  
   今天是 text/JSON，未来可能是 typed artifact 或 opaque latent representation。

3. **不要把 cognition 写进 World Truth。**  
   Belief / Emotion / Hypothesis / Prediction 必须与 Authority 分离。

4. **不要把某套心理学理论写死进核心 schema。**  
   心理学模型应可插拔。

5. **不要把 TTS 当字符串 renderer。**  
   预留 Expression Plan。

6. **不要把 Memory 写死成 vector store。**  
   Vector search 只是 Memory read policy 之一。

7. **不要把 self-improvement 写死成 prompt optimizer。**  
   未来可能优化 Prompt、Skill、routing、tool policy、scaffold、model weights。

8. **不要把 World Model 当 Authority。**  
   Prediction 与 Reality 必须可区分。

9. **不要把模型厂商或单一 protocol 写死进 Agent Definition。**  
   使用 capability/provider/adapter 边界。

10. **不要把 Eval 绑定到单一 LLM Judge。**  
    结果、轨迹、状态、成本、行为和人工反馈都应可成为证据。

---

## 37. Frontier Agent RP 的长期判断

如果上述方向逐渐成立，Atria 的“角色”将不再只是一个被 prompt 临时扮演的文本身份，而更接近一个持续存在的 Agent：

- 有自己的记忆；
- 有自己相信的世界；
- 有别人不知道的秘密；
- 会误解；
- 会猜测；
- 会形成新的看法；
- 会因为经历改变；
- 有长期目标；
- 会预测其他角色；
- 能比较多个未来；
- 会从失败中学习；
- 能在简单事件上快速反应、在重大事件上深度思考；
- 能通过文字、语音、表情、动作等不同媒介表达同一内部状态；
- 即使底层模型、Memory 技术或 World Model 被替换，仍保持同一持续身份与世界关系。

因此 Atria 真正值得追求的终局不是：

> “比传统 RP 前端多几个 Agent 功能。”

而是：

> **成为角色连续性、社会认知、世界权威、Agent 学习与多模态表达的统一 Runtime。**

这也是为什么本文把未来工作的重心放在 stable contracts / Plane / Artifact / Trajectory / Authority boundary，而不是押注某一个当前最强模型或某一种 Agent 框架。
