# Atria Sparse AI Invocation / Adaptive Compute Research

> **Status:** Research / Non-binding
> **Date:** 2026-10-06
> **Code baseline:** main@ed1fd90521a63363e29856601abbf5e908c99d10
> **Primary workspace:** docs
> **Companion research:**
> - plans/architecture/model-prompt-context-frontier-research.md
> - plans/architecture/model-provider-routing-frontier-research.md
> **Likely downstream Plan:** plans/architecture/agent-intelligence-runtime/index.md
> **Purpose:** 在 Atria 正式进入下一轮 Agent / Cognitive Runtime 架构重构前，研究如何避免 Memory、Cognition、ToM、Planner、Critic、World Model、Experience 等能力演化成“每轮正文固定叠加一次模型调用”的昂贵流水线，并形成适合独立 Agent-native RP 产品的稀疏调用、动态算力分配和成本可观测原则。
> **Not a Plan:** 本文不冻结最终阈值、模型、预算、Schema 或阶段。正式实现前应结合当时 main、模型价格、Provider 能力和真实 RP eval 重新定案。

---

## 1. 核心结论

Atria 如果把所有“智能层”都设计成每轮一次 LLM 调用，架构会迅速失去产品可行性。

错误方向类似：

User turn
→ Intent LLM
→ Emotion LLM
→ Memory query rewrite LLM
→ Memory rerank LLM
→ ToM LLM
→ Planner LLM
→ Writer LLM
→ Critic LLM
→ Memory extraction LLM
→ Experience reflection LLM

这种体系的主要问题不只是价格，还包括：

- 首 token 延迟成倍增加；
- 每一层都可能引入误差；
- 中间结果互相污染；
- trace 和 debug 复杂度暴涨；
- provider rate limit 更容易成为瓶颈；
- 模型升级后每一层都需要重新调优；
- Multi-agent 会进一步放大 token 和调用量；
- 用户一句低信息量消息也支付整条“智能税”。

更适合 Atria 的长期原则是：

> **Sparse-by-default：能力可以常驻，推理调用不能常驻。**

进一步可以概括成：

> **0-call first → 1-call normal → evidence-driven escalation。**

即：

1. 能用正式 State、Authority、索引、规则、缓存、图遍历、embedding、普通代码解决的，不调用生成模型；
2. 普通 RP turn 默认只支付一次主要正文生成；
3. 只有出现明确的复杂度、风险、不确定性、重大状态变化或用户主动请求时，才增加认知、批评、模拟或多 Agent 计算；
4. 后台维护任务批处理、延迟执行，并优先使用低成本或本地模型；
5. “开启更多功能”不能线性等价于“每轮多几次 LLM”。

---

## 2. 先区分“调用次数”和“真实成本”

Atria 未来不应只记录“这一轮调用了几次 AI”。

真实成本至少由以下因素共同决定：

- input tokens；
- cached input；
- output tokens；
- hidden / reasoning tokens；
- model tier；
- tool / server charges；
- retry / fallback；
- subagent calls；
- background calls；
- cache writes。

OpenAI 当前 Agent observability 文档也明确要求把 root agent、subagent、retry、tool 和 reasoning token 一起纳入成本分析。

因此未来可以同时追踪两套指标。

### 2.1 Invocation metrics

例如：

- paid model invocations / turn；
- local model invocations / turn；
- subagent turns；
- tool calls；
- retry / fallback count；
- background invocation count。

### 2.2 Economic metrics

例如：

- input / cached input / output / reasoning tokens；
- estimated provider cost；
- cost per accepted RP turn；
- cost per significant event；
- cost per successful memory write；
- cost per accepted cognitive update；
- cost per Project Agent task；
- cost per quality point / eval success。

一个“1 call”如果输入超大 context 并使用最高 reasoning，可能比多个小模型调用更贵。

因此：

> **低调用数是好目标，但最终应该优化的是 quality / latency / cost Pareto frontier。**

参考：

- OpenAI — Observability and usage
  https://developers.openai.com/api/docs/guides/agents-api/observability
- OpenAI — Cost optimization
  https://developers.openai.com/api/docs/guides/cost-optimization

---

## 3. Multi-agent 的真实成本已经有生产证据

Anthropic 在其实际 Research 系统中的分析非常值得 Atria 作为架构约束。

其公开报告中：

- 普通 Agent 约使用聊天交互 4× 的 token；
- Multi-agent 系统约使用聊天交互 15× 的 token；
- Multi-agent 的价值主要来自在高价值复杂任务上投入更多并行计算；
- 它不适合所有 Agent 场景。

Anthropic 的结论是：Multi-agent 要有经济可行性，任务本身必须足够有价值。

OpenAI 当前 Multi-agent 文档也明确建议：

- 短任务放在主 Agent；
- 有强依赖的连续步骤放在单 Agent；
- 真正独立、可并行的工作才适合 subagent；
- subagent 会增加 token usage。

这对 RP 尤其重要。

普通一句：

> “师尊，我回来了。”

不应该因为系统拥有 Memory、ToM、Emotion、Director、Critic、World Model 就自动生成一个 Agent 团队。

参考：

- Anthropic — How we built our multi-agent research system
  https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI — Multi-agent
  https://developers.openai.com/api/docs/guides/agents-api/multi-agent
- OpenAI — Responses Multi-agent
  https://developers.openai.com/api/docs/guides/responses-multi-agent

---

## 4. 前沿方向正在从固定计算转向 Conditional Compute

Atria 想实现的“普通回合省、困难回合多想”并不是临时工程取巧，而是当前模型系统一个明确趋势。

### 4.1 Reasoning effort 已经是运行时控制量

OpenAI 当前 reasoning 模型允许不同 reasoning effort，并明确说明低 effort 更快、更省，高 effort 应保留给真正困难任务。

新一代模型还支持在对话中动态改变 reasoning effort，而不必重新设计整个 Prompt。

这说明：

> **计算预算本来就应该是 per-turn / per-task 动态变量，而不是 preset 常量。**

参考：

- OpenAI — Reasoning models
  https://developers.openai.com/api/docs/guides/reasoning

### 4.2 路由研究已经证明成本和能力可以动态选择

RouteLLM 使用 preference data 在强弱模型之间路由。

BEST-Route 同时选择：

- 用哪个模型；
- 采样多少次。

其论文报告在部分真实数据集上以不到 1% 性能下降换取最多约 60% 成本降低。

Route-To-Reason 进一步联合选择：

- model；
- reasoning strategy。

这些具体数字不能直接外推到 Atria RP，但方向很明确：

> **模型、推理策略和计算量都应该由任务难度与预算动态决定。**

参考：

- RouteLLM
  https://arxiv.org/abs/2406.18665
- BEST-Route
  https://arxiv.org/abs/2506.22716
- Route to Reason
  https://arxiv.org/abs/2505.19435

---

## 5. 不要机械采用“便宜模型先试，失败再升级”

传统 cascade：

small model
→ uncertain
→ medium model
→ uncertain
→ large model

看似合理，但每次升级都已经支付了前一层生成费用。

2026 的 Is Escalation Worth It? 对多模型 cascade 进行了决策理论分析，并得到一个对 Atria 很重要的结论：

> 一个轻量 pre-generation router 在多个 benchmark 上可以优于最佳 cascade，主要原因之一就是它能让明显困难的任务直接进入强模型，不必先支付廉价模型的一次完整生成。

因此 Atria 更适合：

lightweight router
→ cheap path 或 strong path

而不是强制：

cheap generation → medium generation → expensive generation

参考：

- Is Escalation Worth It? A Decision-Theoretic Characterization of LLM Cascades
  https://arxiv.org/abs/2605.06350
- Adaptive LLM Routing under Budget Constraints
  https://arxiv.org/abs/2508.21141

---

## 6. Router 自己也不能变成新的“每轮昂贵 Agent”

最糟糕的优化可能是：

> 为了决定要不要调用 AI，先调用一个大 AI。

因此 Atria 的 Computation Router / Metacognitive Controller 第一优先级应是：

### Level 0 — deterministic evidence

直接由 Runtime 已知事实判断：

- 本轮是否产生正式 State change；
- 是否存在高影响 Command；
- 是否出现 knowledge conflict；
- Memory retrieval confidence；
- 当前 Context budget；
- 未解决 commitment；
- tool / task failure；
- previous retry；
- relationship / lifecycle threshold；
- explicit user mode；
- current task class；
- current model route；
- recent cost budget。

### Level 1 — lightweight classifier

只有 deterministic evidence 不足时，使用：

- 小模型；
- 本地模型；
- 专用 classifier；
- embedding classifier。

判断：

- turn significance；
- ambiguity；
- intent class；
- complexity；
- escalation need。

### Level 2 — strong metacognitive reasoning

只对真正高价值且无法用前两层判断的情况，才允许强模型决定是否扩大计算。

原则：

> **Router 的平均成本必须远低于它节省的 compute。**

---

## 7. Small Language Model 更适合“高频窄任务”

2025 的 Small Language Models are the Future of Agentic AI 是 position paper，而不是“所有 Agent 都必须用 SLM”的定论，但它指出了一个非常适合 Atria 的事实：

Agent 系统中的很多 invocation 实际是：

- 重复；
- 专门；
- 输出空间小；
- 不需要通用聊天能力。

例如：

- classification；
- significance；
- intent detection；
- tagging；
- memory candidate extraction；
- basic reranking；
- state proposal assistance；
- route selection。

这些任务不值得默认调用主 RP 模型。

Atria 可以长期支持 heterogeneous model runtime：

deterministic code
→ local / SLM utility
→ mid-tier cognition
→ frontier writer / reasoner

但模型大小必须通过 Atria 自己的 eval 证明，不能只按参数量猜能力。

参考：

- Small Language Models are the Future of Agentic AI
  https://arxiv.org/abs/2506.02153

---

## 8. Retrieval 也应该是稀疏的

Atria 不应该让每轮正文固定支付：

query rewrite LLM
→ retrieve
→ rerank LLM
→ synthesize LLM
→ writer

Adaptive-RAG 和 Self-RAG 都指出：

> 无差别地每次 retrieval 并不是最优策略。

Adaptive-RAG 根据问题复杂度，在 no retrieval、single-step retrieval、iterative retrieval 之间切换。

2025 的 LLM-Independent Adaptive RAG 更进一步研究不用 LLM 做 retrieval gate，说明轻量外部特征也可能达到接近复杂 LLM routing 的效果。

对 Atria Memory / Knowledge 的启示是：

### Normal path

explicit refs
+ graph neighborhood
+ recency
+ deterministic scopes
+ vector retrieval
→ writer

### Ambiguous path

base retrieval
→ cheap rerank / query rewrite
→ writer

### Hard path

multi-hop / agentic retrieval
→ evidence synthesis
→ writer

只有后两层需要额外 generation。

参考：

- Adaptive-RAG
  https://arxiv.org/abs/2403.14403
- Self-RAG
  https://arxiv.org/abs/2310.11511
- CRAG
  https://arxiv.org/abs/2401.15884
- LLM-Independent Adaptive RAG
  https://arxiv.org/abs/2505.04253

---

## 9. Memory 不应该形成“每轮固定写入税”

Memory 的成本有两个方向：

1. read；
2. write / consolidate。

Mem0 的研究表明，结构化、持久 Memory 相比每轮携带完整历史，可以显著降低长期上下文成本；论文报告在其评测中相对 full-context 方法获得 91% 更低的 p95 latency，并节省超过 90% token cost。

这不代表 Atria 应把 Memory Agent 每轮都跑一次。

相反，Atria 更适合：

### Read path

默认使用已有索引和正式 Memory Graph。

### Write path

先积累原始 evidence，由事件或阈值触发 extraction / consolidation。

候选触发条件：

- significant event；
- 新角色 / 地点 / 关系；
- 正式 State transition；
- commitment open / close；
- 认知冲突；
- 上下文即将压缩；
- 若干 turn 累积；
- Session idle / checkpoint；
- 用户主动保存；
- 剧情章节边界。

普通：

> “嗯。”

不应该天然产生一次 Memory LLM call。

参考：

- Mem0
  https://arxiv.org/abs/2504.19413
- A-MEM
  https://arxiv.org/abs/2502.12110
- Agentic Memory / AgeMem
  https://arxiv.org/abs/2601.01885
- Generative Agents
  https://arxiv.org/abs/2304.03442

---

## 10. Experience / Reflection 更不应该逐回合运行

Experience / Evolution 的目的应该是从一段有完整 outcome 的轨迹里学习。

如果每轮都：

generate → reflect → improve prompt

会出现：

- 没有足够 evidence 就过早学习；
- 一次偶然回复被固化；
- Prompt / Skill 快速膨胀；
- 每轮额外付费；
- 难以判断到底是哪次修改改善或损害质量。

更合理的是：

multiple trajectories
→ meaningful feedback / outcome
→ batch reflection
→ candidate lesson / skill
→ offline eval
→ promotion

因此 Experience / Eval 很适合：

- background；
- maintenance；
- batch；
- flex / discounted inference；
- idle-time local model。

而不是正文 blocking path。

OpenAI Batch API 当前对异步批处理提供 50% 的价格折扣，也说明“非实时 AI 任务”和“用户等待中的模型调用”应被区分。

参考：

- OpenAI — Batch API
  https://developers.openai.com/api/docs/guides/batch
- Reflexion
  https://arxiv.org/abs/2303.11366

---

## 11. Tool 也需要 Sparse Disclosure

“模型没有调用某个工具”并不意味着该工具没有成本。

如果几十、几百个 tool schema 每轮都进入 context：

- input token 增加；
- selection noise 增加；
- cache topology 更复杂；
- tool confusion 增加。

Atria 更适合：

Agent role / task
→ capability filter
→ tool family search
→ only relevant contracts
→ model

而不是：

Atria 所有工具
→ 每轮全部塞给模型。

参考：

- Anthropic — Introducing advanced tool use
  https://www.anthropic.com/engineering/advanced-tool-use
- Anthropic — Code execution with MCP
  https://www.anthropic.com/engineering/code-execution-with-mcp
- OpenAI — Deployment checklist
  https://developers.openai.com/api/docs/guides/deployment-checklist

---

## 12. Prompt Cache 是成本架构的一部分，但不是解决所有问题

OpenAI 当前 Prompt Caching 对可复用 prefix 的 cached input 提供显著价格折扣，并能降低 prefix processing latency。

这意味着 Atria 未来的 Behavior / Context Compiler 应有意识地区分：

### Stable prefix

例如：

- stable behavior instructions；
- stable Creative Profile；
- frequently-used tool definitions；
- fixed package rules；
- stable character identity core。

### Dynamic suffix

例如：

- current input；
- current selected memory；
- current cognitive state；
- transient task；
- current tool result。

但不能为了 cache hit 把无关内容固定塞进 context。

应优化：

> **有效成本 = token amount × cache economics × quality。**

而不是单独追求 cache hit ratio。

参考：

- OpenAI — Prompt caching
  https://developers.openai.com/api/docs/guides/prompt-caching

---

## 13. 推荐的 Atria 默认推理路径

这是研究建议，不是冻结实现。

### Fast / Normal Path

目标：绝大多数 RP 回合。

User input
→ Native Runtime / State / Authority：0 generation
→ deterministic event / significance checks：0 generation
→ graph / vector / context selection：0 generation
→ Behavior Compiler：0 generation
→ Main Writer：1 generation
→ typed output / Runtime commit：0 generation

理想结果：

> **一次正文生成约等于一次主要 generation。**

### Selective Cognition Path

当出现：

- ambiguous intent；
- knowledge conflict；
- major relationship event；
- irreversible action；
- high-significance reveal；
- difficult multi-actor scene；
- planning need；

可以增加：

1 cognition pass
→ 1 writer

### Deep / Director Path

只用于：

- 用户主动开启；
- 重大章节；
- 高风险决策；
- 复杂多 Agent 任务；
- 需要独立证据搜集 / critique / simulation。

可能允许：

- 2–6+ generation equivalents；
- parallel subagents；
- stronger reasoning；
- counterfactual rollout。

但这是显式高计算路径，不能偷偷变成普通 RP 的固定税。

---

## 14. 共享一次 Cognition Pass，而不是“一能力一 Agent”

即使需要认知模型，也应该尽量合并高度相关的派生判断。

错误：

- Emotion Agent；
- Relationship Agent；
- Significance Agent；
- ToM Agent；
- Memory Agent；
- Intent Agent。

更合理：

一个 Cognition Pass 产生：

- significance；
- proposed belief delta；
- emotion appraisal；
- relationship implication；
- memory candidates；
- intention；
- uncertainty。

然后不同 Authority 决定哪些建议能够进入正式状态。

这不是为了让一个 Agent 变成新的巨型 Prompt，而是为了：

- 共享同一事件 evidence；
- 避免重复读取上下文；
- 降低调用次数；
- 统一 provenance；
- 让一次 cognitive snapshot 可供多个消费者复用。

只有当某一认知问题真正需要不同模型、不同权限、独立上下文或独立评价时，才拆成 specialist。

---

## 15. Computation Budget 应成为 Runtime 一等概念

Atria 当前已有 Route、Task、Budget、Scheduler、Agent Runtime 等底座。

后续可以研究统一的 Computation Budget / Inference Policy。

概念上可以控制：

- maximum paid generations；
- maximum utility generations；
- reasoning effort；
- model tier；
- retrieval depth；
- rerank；
- critic count；
- rollout count；
- subagent count；
- tool budget；
- background budget；
- latency deadline。

例如产品层可以映射成：

| 档位 | 目标 | 典型路径 |
| --- | --- | --- |
| Fast | 最低延迟 / 成本 | 1 writer；必要检索 |
| Standard | 默认 RP | 1 writer；少量稀疏 escalation |
| Deep | 重大剧情 / 决策 | cognition + writer，必要 critic |
| Director | 高质量关键场景 | bounded multi-agent / critique |
| Experimental | 研究模式 | 根据实验协议动态预算 |

关键不是固定这些名称，而是：

> **预算是显式资源，不是 Agent 想调用几次就调用几次。**

---

## 16. 建议的默认预算目标

以下只是架构目标，不是已批准 SLO。

### 普通 RP 长期目标

以 100 个普通用户 turn 为例，理想设计可以是：

- 100 × main writer；
- 8–15 × batch / event memory work；
- 3–10 × cognition escalation；
- 1–5 × critic / recovery / special reasoning。

即让平均付费 generation 尽量接近：

> **约 1.x generation / user turn。**

而不是功能每加一层就走向：

> 5–10 generation / user turn。

确切目标必须在真实模型、真实角色 / Native Package 和 eval 上重新测量。

### 重大剧情

可以允许明显更高计算量，因为这些回合的边际价值更高。

这符合一个更广义的原则：

> **Compute should track expected value, not feature count.**

---

## 17. 不确定性不应是唯一 escalation 信号

单纯让模型说“我有多自信”可能不可靠。

更稳妥的 Atria escalation evidence 应组合：

### Structural evidence

- action irreversibility；
- state mutation scope；
- affected entities；
- number of unresolved dependencies；
- tool / authority class。

### Retrieval evidence

- similarity margin；
- graph coverage；
- conflicting facts；
- missing required evidence；
- provenance freshness。

### Runtime evidence

- retry；
- failure；
- stale artifact；
- unresolved commitment；
- branch / revision mismatch；
- budget pressure。

### Narrative evidence

- significant event；
- relationship threshold crossing；
- new secret / revelation；
- death / betrayal / commitment；
- chapter transition。

### User evidence

- explicit Deep / Director；
- repeated regenerate；
- edit correction；
- user preference；
- quality mode。

### Model evidence

- output validator failure；
- tool-call failure；
- low-confidence structured classification；
- disagreement between cheap checks。

这样可以避免把整个预算系统又交给一个会波动的 LLM 自评。

---

## 18. Background / Maintenance 需要和 Turn-blocking 严格分离

Atria 当前 Native Task 已经区分：

- turn_blocking；
- interactive；
- background；
- maintenance。

这个边界非常适合复用。

### Turn-blocking

只有不完成就无法正确回复用户的工作：

- selected cognition；
- required retrieval；
- mandatory authority check；
- current writer。

### Background

不影响本轮回复：

- memory consolidation；
- optional relation enrichment；
- experience extraction；
- embedding refresh；
- history compaction；
- candidate skill generation。

### Maintenance

更适合：

- dedupe；
- graph repair；
- old memory compression；
- eval batch；
- model routing statistics；
- Prompt optimization candidates。

目标：

> 用户不应该为可以晚一点完成的智能工作等待额外 2–5 个模型 round trip。

---

## 19. “免费本地智能层”值得作为产品能力研究

Atria 作为桌面 / 本地可运行产品，可以比纯 SaaS Agent 多一个自由度：

> **本地 utility model。**

未来可研究让本地轻量模型承担：

- turn classification；
- significance；
- entity extraction；
- event candidate extraction；
- memory pre-filter；
- intent；
- basic rerank；
- route proposal；
- cheap validation。

Cloud frontier model 只负责：

- high-quality RP generation；
- difficult cognition；
- difficult planning；
- exceptional simulation。

但本地模型不是“默认一定更好”。

必须同时考虑：

- 启动成本；
- 显存 / RAM；
- 移动端能力；
- 功耗；
- 模型下载体积；
- 跨设备一致性；
- 低端设备 fallback；
- 实际 accuracy。

所以架构应支持 utility model provider，而不是假定一定存在本地模型。

---

## 20. Eval 必须评价“多花的这一 call 是否值得”

传统 eval 只问：

> 输出好不好？

Adaptive Compute 还要问：

> **额外计算带来的增益值不值成本？**

每个 escalation policy 至少应该比较：

质量收益：

- final RP quality；
- continuity gain；
- state correctness gain；
- persona fidelity；
- user preference gain。

成本：

- extra input tokens；
- extra output / reasoning tokens；
- extra latency；
- extra tool cost；
- extra failure surface。

建议未来报告 Pareto curve：

- quality vs cost；
- quality vs latency；
- continuity vs cost；
- persona fidelity vs cost。

并计算类似：

- cost per accepted turn；
- cost per avoided regenerate；
- cost per corrected continuity failure；
- marginal quality gain / extra 1K tokens。

这样才能回答：

> Director 多跑两个 critic 到底是真提升，还是“看起来很聪明”。

OpenAI 当前 deployment checklist 也明确建议在改变模型、Prompt 或能力时，比较 task success、latency、input/output/reasoning/cache-write token 与 cost per successful task。

---

## 21. 预算策略本身也应该可学习，但不能先做自适应黑箱

前期更适合：

explicit policy
+ observable evidence
+ hard budget
+ trace

积累真实 trajectory 后再研究：

- learned router；
- contextual bandit；
- online threshold optimization；
- user-specific budget preference；
- experience-driven routing。

Atria 首先需要：

> **可靠 telemetry 和 replayable eval。**

没有 evidence 就直接上 learned metacognitive policy，会让成本和质量都难以解释。

---

## 22. 对 Prompt / Context 报告的补充约束

上一份 Prompt / Context 调研提出：

- Behavior Program；
- Context Runtime；
- Cognitive State；
- Model Adapter；
- Eval / Optimization。

本报告增加一个强约束：

> **这些层是语义层，不等于独立模型调用层。**

例如：

### Context Runtime

可以是纯代码 + index。

### Behavior Compiler

默认应 deterministic。

### Cognitive State

大部分回合直接读取已有状态，不重新推理。

### Creative Profile

是配置，不调用模型。

### Tool Contract

是 schema，不调用模型。

### Model Adapter

是 lowering，不调用模型。

### Eval

多数不在同步正文路径。

因此：

> **架构层数 ≠ LLM 调用层数。**

这是后续正式企划必须显式保护的原则。

---

## 23. 对 Agent Intelligence Runtime 企划的潜在影响

本文不直接修改该 Plan，但后续 Codex 合并本研究时，建议重点检查当前企划是否存在：

- 每个 Cognition capability 独立 Agent；
- 每轮固定 Experience；
- 每轮固定 Memory extraction；
- 每轮固定 ToM 更新；
- 每轮固定 Planner；
- 固定 critic；
- 固定 multi-agent；
- 固定 expensive rerank；
- 没有 per-turn compute budget；
- 没有 background / maintenance 分流；
- 没有 model tier / local utility path；
- 只记录调用数、不记录 token / reasoning / cost；
- 没有 escalation ablation eval。

特别是当前 Agent Intelligence Runtime 已规划的：

- Experience / Eval / Evolution；
- Persistent Goal；
- Social Cognition；
- Counterfactual；
- Computation Allocation；

应该被重新审视成：

> **多个认知能力共享 sparse compute substrate，而不是多个常驻模型服务。**

---

## 24. 推荐长期总架构

User Turn
→ Native Runtime Evidence
→ Zero-call Fast Router

然后按 evidence 分流：

### Normal Path

0 extra generation
→ Context / Behavior Compile
→ Main Writer
→ Validator / Authority

### Utility Path

local / SLM utility
→ Context / Behavior Compile
→ Main Writer
→ Validator / Authority

### Deep Path

strong cognition / optional specialist work
→ Context / Behavior Compile
→ Main Writer
→ optional critic / simulation
→ Validator / Authority

所有路径的非阻塞 evidence 再进入：

memory / experience queue
→ batch / background / maintenance

Multi-agent、Counterfactual、Critic、World Model 应作为 Deep Path 的 bounded consumers，而不是主链默认节点。

---

## 25. 推荐的设计原则

### Principle A — Zero-call-first

任何新 capability 在申请 LLM 之前先回答：

> 为什么普通代码、现有 State、索引、embedding、规则不能完成？

### Principle B — One main generation is the normal case

默认 RP turn 应围绕一次高质量正文调用设计。

### Principle C — Event-driven cognition

重大事件触发认知，而不是时间步触发所有认知。

### Principle D — Batch delayed learning

Memory consolidation、Experience、Eval、Optimization 尽量离开同步路径。

### Principle E — Pre-route before generating

明显困难的任务直接升级，不机械支付 cascade 前置生成。

### Principle F — Share derived cognition

一次认知 pass 尽量产生多个有 provenance 的派生结果。

### Principle G — Multi-agent must earn its budget

只有独立并行、上下文隔离或 specialist contract 真正产生收益时使用。

### Principle H — Every escalation is observable

记录：

- why；
- evidence；
- chosen tier；
- token；
- cost；
- latency；
- outcome。

### Principle I — Budget is authority

Agent 不能绕过明确的 per-turn / per-task computation ceiling。

### Principle J — Optimize cost per successful experience

不是单纯追求最少 token，而是在用户可接受成本下最大化 RP 质量、连续性和可信性。

---

## 26. 值得避免的反模式

### Always-on cognition tax

每轮固定 cognition / planner / memory / critic。

### Agent-per-capability

每增加一个概念就增加一个 Agent。

### Cascade tax

每轮都先让小模型完整生成，再逐层升级。

### LLM router tax

用昂贵大模型决定是否调用昂贵大模型。

### Retrieval tax

每轮固定 query rewrite + rerank + synthesis。

### Memory write tax

每轮固定 extraction / graph rewrite。

### Reflection tax

每轮都反思并修改 Skill / Prompt。

### Multi-agent prestige

因为“更先进”就默认多 Agent。

### Hidden cost

UI 只显示正文模型，却不统计 subagent / background / retry。

### Unbounded experimental mode

实验功能没有 budget ceiling / stop condition。

---

## 27. 正式实施前应回答的问题

### Product budget

- 默认普通 RP 每 turn 的目标 generation-equivalent 是多少？
- 是否给用户显示 Fast / Standard / Deep / Director？
- 用户能否设置 session / turn budget？

### Routing

- 哪些 deterministic evidence 足以升级？
- 哪些情况需要 utility classifier？
- 哪些情况必须直接强模型而不走 cheap cascade？
- router 失败时偏向省钱还是偏向质量？

### Memory

- extraction 的事件 gate 是什么？
- 何时 batch？
- 多少 raw turns 必须在 consolidation 前保留？
- background 失败是否影响下一轮？

### Cognition

- 哪些 state 每轮只读？
- 哪些事件才允许重新推断？
- 多个 cognitive outputs 能否由一个 shared pass 产生？
- ToM 最大允许多大计算量？

### Multi-agent

- 哪些 RP 场景实际能从 parallelization 获益？
- Director 的边际质量提升是否足够覆盖显著 token 增量？
- 是否只对用户显式 Deep / Director 默认开放？

### Models

- 是否设 Utility Route？
- 是否支持本地 SLM？
- model router 用规则、classifier 还是 learned policy？
- model snapshot 变化如何重新校准 router？

### Eval

- 如何计算 cost per accepted turn？
- 如何测 regenerate / edit 降低是否值得额外 cognition？
- 如何防止 judge 偏好“更长、更复杂”而天然奖励昂贵路径？
- 怎样做同一场景的 1-call vs 2-call vs multi-agent ablation？

---

## 28. 一个适合未来 Codex 的实证流程

架构重构前不要凭感觉决定所有阈值。

### Step 1 — Baseline

建立：

- 1-call writer；
- 当前 Memory；
- 当前 Context；
- 当前质量数据。

### Step 2 — Collect difficulty signals

记录：

- failures；
- regenerate；
- user edits；
- memory conflicts；
- state conflicts；
- significant events；
- tool failures。

### Step 3 — Offline replay

对同一批真实 turn 比较：

- 1 call；
- utility + 1 call；
- cognition + writer；
- cognition + writer + critic；
- multi-agent / Director。

### Step 4 — Build Pareto frontier

比较：

- RP quality；
- persona fidelity；
- continuity；
- state correctness；
- latency；
- token；
- money。

### Step 5 — Only then freeze routing policy

选：

> **最小必要 compute。**

而不是选：

> “最高分但最贵的配置”。

---

## 29. 研究判断

Atria 的 Agent 能力越丰富，越需要把：

> **“拥有能力”**

和：

> **“每一轮运行能力”**

彻底区分。

Memory、Cognition、ToM、Counterfactual、Experience、Director、Critic 可以全部存在，但绝大多数普通 RP turn 不需要全部执行。

一个真正前沿的 Atria 不应该让用户感知为：

> “为了智能，我每发一句话都在后台烧十次 API。”

而应该表现为：

> “普通时候快速自然；真正复杂或关键的时候，它会自动多想，并且我知道为什么多花了计算。”

最终目标不是：

> **最少 AI。**

也不是：

> **最多 Agent。**

而是：

> **最小必要智能计算（Minimum Necessary Intelligence Compute）。**

这可以成为 Atria Agent-native Runtime 很有辨识度的一条设计哲学。

---

## 30. 外部资料索引

### Multi-agent cost / orchestration

- Anthropic — How we built our multi-agent research system
  https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI — Multi-agent
  https://developers.openai.com/api/docs/guides/agents-api/multi-agent
- OpenAI — Responses Multi-agent
  https://developers.openai.com/api/docs/guides/responses-multi-agent

### Adaptive compute / routing

- OpenAI — Reasoning models
  https://developers.openai.com/api/docs/guides/reasoning
- RouteLLM
  https://arxiv.org/abs/2406.18665
- BEST-Route
  https://arxiv.org/abs/2506.22716
- Route to Reason
  https://arxiv.org/abs/2505.19435
- Adaptive LLM Routing under Budget Constraints
  https://arxiv.org/abs/2508.21141
- AutoMix
  https://arxiv.org/abs/2310.12963
- Is Escalation Worth It?
  https://arxiv.org/abs/2605.06350
- FrugalGPT
  https://arxiv.org/abs/2305.05176

### Retrieval / context

- Adaptive-RAG
  https://arxiv.org/abs/2403.14403
- Self-RAG
  https://arxiv.org/abs/2310.11511
- CRAG
  https://arxiv.org/abs/2401.15884
- LLM-Independent Adaptive RAG
  https://arxiv.org/abs/2505.04253
- Anthropic — Advanced tool use
  https://www.anthropic.com/engineering/advanced-tool-use
- Anthropic — Code execution with MCP
  https://www.anthropic.com/engineering/code-execution-with-mcp

### Memory

- Mem0
  https://arxiv.org/abs/2504.19413
- A-MEM
  https://arxiv.org/abs/2502.12110
- AgeMem
  https://arxiv.org/abs/2601.01885
- Generative Agents
  https://arxiv.org/abs/2304.03442

### Cost / infrastructure

- OpenAI — Cost optimization
  https://developers.openai.com/api/docs/guides/cost-optimization
- OpenAI — Prompt caching
  https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI — Batch API
  https://developers.openai.com/api/docs/guides/batch
- OpenAI — Observability and usage
  https://developers.openai.com/api/docs/guides/agents-api/observability
- OpenAI — Deployment checklist
  https://developers.openai.com/api/docs/guides/deployment-checklist
- Small Language Models are the Future of Agentic AI
  https://arxiv.org/abs/2506.02153

---

## 31. 后续 Codex 读取要求

当准备更新正式架构企划时，建议 Codex：

1. 先读当前 plans/architecture/agent-intelligence-runtime/index.md，并按其路由读取需要修改的模块；
2. 同时读取：
   - plans/architecture/model-prompt-context-frontier-research.md
   - plans/architecture/sparse-ai-invocation-adaptive-compute-research.md
3. 重新检查当时最新 main 的：
   - Native Task / Scheduler；
   - Generation / Runtime Route；
   - Context Runtime；
   - Memory；
   - Agent Runtime / Orchestrator；
   - usage / diagnostics；
4. 重新确认当时主流 Provider 的 reasoning、caching、batch、tool search、pricing；
5. 把两份研究吸收到正式 Plan 的边界、预算与阶段设计；
6. 不把本文的数字、阈值和档位名称直接当成冻结要求；
7. 必须显式检查：
   - 普通 RP 是否保持 1-call-first；
   - background 是否与 turn-blocking 分离；
   - 每个新增 AI 调用是否有触发证据；
   - Multi-agent 是否有明确 ROI；
   - 是否有 per-turn / per-task hard budget；
   - 是否有 1-call baseline 的 ablation；
8. 默认 Atria 是独立产品，不以 SillyTavern 的调用结构、Prompt 结构或插件习惯作为兼容约束。
