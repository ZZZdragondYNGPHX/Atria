# Atria Prompt / Context / Generation Frontier Research

> **Status:** Research / Non-binding  
> **Date:** 2026-10-06  
> **Code baseline:** `main@ed1fd90521a63363e29856601abbf5e908c99d10`  
> **Primary workspace:** `docs`  
> **Purpose:** 为 Atria 完成当前架构重构之后，重新设计 Prompt、Context、Generation、Persona、Creative Control 与模型适配体系提供前沿调研依据。  
> **Product assumption:** Atria 是独立的 Agent-native RP 产品与前沿技术试验田。本文**不以 SillyTavern 兼容为目标，不要求保留 SillyTavern Prompt Preset 的结构、UI、语义或运行时契约**。任何旧结构只有在未来仍符合 Atria 自身架构时才值得保留。  
> **Not a Plan:** 本文不是实现指导书，不冻结最终名称、模块边界、Schema、迁移阶段或 API。后续当前架构重构完成后，应基于当时 `main` 再建立正式实现 Plan。

---

## 1. 核心结论

未来 Atria 不应继续把“提示词预设”视为一个装下模型参数、角色人格、世界事实、记忆、游戏规则、工具说明、输出格式和写作风格的巨大 JSON / Prompt 包。

更适合 Atria 的长期方向是：

> **从 Prompt Preset 转向 Behavior / Context / Generation 分层。**

其中：

- **World / State / Authority** 决定什么是真的、什么可以被修改；
- **Cognition / Persona State** 决定角色当前知道什么、相信什么、想做什么、情绪和关系如何变化；
- **Context Runtime** 决定这一轮模型真正需要看到哪些信息；
- **Agent Runtime** 决定谁思考、谁行动、谁调用工具；
- **Prompt Program / Behavior Program** 决定模型如何完成某类认知或创作任务；
- **Creative / Expression Profile** 决定作品如何表达；
- **Generation Profile** 决定采样、推理预算、输出预算、缓存等推理参数；
- **Tool / Output Contract** 通过真实 schema 约束模型，而不是用自然语言假装约束；
- **Model Adapter / Lowering** 将 Atria 的稳定语义降低为特定模型、特定 Provider、特定 snapshot 最适合的 wire request；
- **Eval / Optimization** 持续判断某套 Prompt / Context / Model 组合是否真的更好。

因此，未来“Prompt”仍然重要，但它从**系统真相和产品逻辑的承载物**降级为**模型行为控制栈中的一个可编译层**。

从产品语言上，长期甚至可以弱化“提示词预设”这个概念，改为用户真正理解的东西，例如：

- Creative Profile；
- Narration Profile；
- Character Expression；
- Agent Method；
- Generation Profile；
- Model Route。

这些只是候选产品概念，不是本文冻结的命名。

---

## 2. 为什么现在值得重新思考 Prompt Preset

Atria 已经不再只是一个聊天前端。

当前主线已经出现：

- Native Session / Revision / Authority；
- Native Model / Prompt Runtime；
- Memory Graph / Memory OS；
- Orchestrator / Agent Runtime；
- Project / Package / Authoring；
- Native Context selection；
- typed tool / output contract；
- exact revision resource；
- model / connection / runtime route；
- provenance 与 request snapshot。

与此同时，旧的 `public/scripts/PromptManager.js`、`preset-manager.js` 等路径仍然明显保留 SillyTavern 时代的产品思想：

> 用户维护一组 Prompt 条目与生成参数，然后把角色、世界书、聊天历史、扩展注入和其他动态信息尽可能拼到一次模型请求中。

这个模式在“单模型聊天前端”时代很合理。

但在 Agent-native Runtime 中，它会逐渐变成错误抽象，因为不同内容拥有完全不同的：

- authority；
- 生命周期；
- revision；
- provenance；
- scope；
- 修改者；
- token 预算；
- 缓存价值；
- 是否应被模型看到；
- 是否允许被模型改变。

如果仍然以“一个 preset”承载这些差异，未来每增加一种前沿能力，都会继续往同一个字符串上下文里堆逻辑。

---

## 3. Atria 当前其实已经拥有下一代 Prompt 架构的雏形

当前 `src/native/model-prompt-runtime/**` 非常值得保留其**思想**，即使未来架构重构后实现本身被改写。

目前已经有：

### 3.1 GenerationProfile

`core.generation-profile` 已经把：

- sampling；
- output；
- reasoning；
- stop；
- cache；
- streaming；
- toolChoice；
- providerExtensions

从 Prompt 文本中分离。

这是正确方向。

未来应继续避免：

> “请认真思考”“请只输出 JSON”“请尽量简洁”

这类本来可以由 provider-native control、structured output 或 generation parameter 精确表达的要求，被反复写进自然语言 Prompt。

### 3.2 PromptModule / PromptProgram

当前 Native Runtime 已支持：

- versioned Prompt Module；
- exact revision ref；
- semantic target；
- stage；
- typed parameter；
- condition；
- derive / replace / disable / configure；
- artifact producer / consumer；
- deterministic compilation。

这已经比传统“Prompt Preset = 排序后的字符串列表”更接近未来形态。

### 3.3 PromptIR

当前已有独立 Prompt IR，包括：

- directives；
- context slots；
- history；
- input；
- response directives；
- tools；
- output contract；
- provenance；
- compilation diagnostics。

这为未来建立真正的：

> **Semantic Behavior IR → Model-specific Lowering**

提供了非常好的入口。

### 3.4 RequestContextPlan

当前 context provider 已经负责构建经过选择的 Context Plan，而不是让 Prompt 自己去“发现世界事实”。

这个边界非常重要：

> **Prompt 不应该拥有 Context selection authority。**

Prompt 可以声明“需要什么类型的信息”，但真正提供哪条 Memory、哪条 World Fact、哪段 History，应由 Context / Retrieval / Authority 层决定。

---

## 4. 外部趋势一：Prompt Engineering 正在演变为 Context Engineering

Anthropic 在 2025 年明确把 Context Engineering 描述为 Prompt Engineering 的自然延伸。

核心变化是：

旧问题：

> “System Prompt 应该怎么写？”

新问题：

> “在这一轮 inference 中，哪些信息值得占用有限 context，并以什么结构出现？”

Agent 场景中的 context 不只是 Prompt，还包括：

- system/developer instructions；
- tools；
- MCP resources；
- memory；
- retrieved evidence；
- history；
- tool results；
- agent scratch artifacts；
- current task；
- runtime state。

这对 Atria 的意义非常直接：

### 不应再有一个“Prompt Preset”决定整个模型上下文

未来应由多个 owner 协作：

```text
Runtime State
    │
Memory / Retrieval
    │
Agent Task / Cognitive State
    │
Prompt / Creative Program
    │
Tools / Output Contract
    │
Context Budget + Selection
    │
Model Adapter
    ▼
Effective Request
```

Prompt 只是其中一层。

参考：

- Anthropic — Effective context engineering for AI agents  
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

## 5. 外部趋势二：长 Context 不等于“都塞进去更好”

这对 RP 尤其关键。

### 5.1 Lost in the Middle

TACL 2024 的经典研究发现，模型对长上下文不同位置的信息利用并不稳定，重要信息处于中段时效果明显下降。

参考：

- Liu et al. — Lost in the Middle  
  https://aclanthology.org/2024.tacl-1.9/

### 5.2 2025 年的新证据更激进

EMNLP 2025 的研究发现：

> 即使 relevant information 被完美检索出来，仅仅因为输入本身更长，性能仍然可能显著下降。

其报告在多个任务和模型上观察到 13.9%–85% 的性能下降。

这说明：

> **Context Window 是容量上限，不是质量目标。**

对于 Atria，长期策略不应该是：

> “模型有 1M context，那就把角色卡、全部世界书、全部记忆、全部状态、全部工具、全部 Agent 输出都放进去。”

而应该是：

> **高质量选择 + 分层 + progressive disclosure + provenance + 必要时二次展开。**

参考：

- Du et al. — Context Length Alone Hurts LLM Performance Despite Perfect Retrieval  
  https://aclanthology.org/2025.findings-emnlp.1264/

---

## 6. 外部趋势三：更强模型正在降低“巨型防呆 Prompt”的价值

OpenAI 2026 年针对 GPT-6 Astra 的开发建议非常值得 Atria 注意：

- 旧模型时代积累的大量 instructions 可能已经不再必要；
- 过多 skill / instructions 会造成 context 膨胀、冲突和错误触发；
- progressive disclosure 比默认加载所有指导更好；
- 过去帮助弱模型的过度具体步骤，可能反而限制新模型；
- 同一份 instruction 对不同模型的效果可能完全不同。

这意味着 Atria 不能把某个时代调出来的“神级预设”当成永久架构。

未来必须假设：

> **模型能力、instruction-following、tool calling、reasoning control 每几个月都会变化。**

所以 Atria 应保持：

1. 稳定的语义层；
2. 可替换的模型调优层；
3. 自动 eval；
4. exact model snapshot / capability evidence；
5. 模型升级后可重新优化。

参考：

- OpenAI — Rethinking skills and prompts for GPT-6 Astra  
  https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra

---

## 7. 外部趋势四：Prompt 正在从字符串变成“程序”

DSPy 的核心口号是：

> **Program, don’t prompt.**

它要求开发者描述：

- inputs；
- outputs；
- signatures；
- modules；
- metrics；

再由 optimizer 为模型寻找更合适的 instructions / examples。

这代表一个重要趋势：

> Prompt 的高级抽象不应是“用户手写字符串”，而应是“可编译、可组合、可评估的行为程序”。

Atria 当前 PromptModule / PromptProgram / PromptIR 已经非常接近这个方向。

长期可研究的目标不是复制 DSPy，而是吸收其原则：

- Prompt component 化；
- typed inputs；
- typed outputs；
- 显式任务契约；
- Prompt 不与某个 Provider wire format绑定；
- 可自动优化；
- 可按 model snapshot 重新编译/选择。

参考：

- DSPy  
  https://dspy.ai/
- DSPy Optimizers  
  https://dspy.ai/learn/optimization/optimizers/

---

## 8. 外部趋势五：Prompt / Context 已经可以进入自动优化闭环

### 8.1 GEPA

GEPA 通过：

`trajectory → reflection → candidate prompt update → eval → selection`

自动进化文本 Prompt。

其重要意义不是“自动写 Prompt”，而是：

> Prompt 可以成为一种**由真实运行证据驱动优化的可版本化程序资产**。

GEPA 报告在多个任务中以显著更少 rollout 获得相对传统优化方法更好的结果。

参考：

- GEPA paper  
  https://arxiv.org/abs/2507.19457

### 8.2 ACE

ACE（Agentic Context Engineering）更进一步：

它把 context 当作持续演化的 playbook，而不是每次都压成越来越短的 summary。

核心问题是避免：

- brevity bias；
- context collapse；
- 多次压缩后经验细节逐渐消失。

这对 Atria 的 Experience / Skill / Prompt Evolution 特别重要。

参考：

- ACE  
  https://arxiv.org/abs/2510.04618

### 8.3 OpenAI Agent Improvement Loop

OpenAI 2026 的 Agent Improvement Loop 把：

`Trace → Human/Model Feedback → Eval → Harness Change → Re-evaluate`

串成正式工程流程。

其中 harness 明确不仅包括 Prompt，还包括：

- tools；
- routing；
- output requirements；
- validation。

这再次说明未来优化对象不是“提示词字符串”，而是**整个 behavior harness**。

参考：

- OpenAI — Build an Agent Improvement Loop with Traces, Evals, and Codex  
  https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop

---

## 9. 外部趋势六：硬约束正在从 Prompt 下沉到 Schema / Runtime

越来越多 Provider 提供：

- function calling；
- strict tool schema；
- structured outputs；
- JSON Schema；
- explicit reasoning controls；
- tool choice；
- token / output controls。

OpenAI 当前甚至明确建议：

> 如果输出应该符合 Schema，不要主要依赖 Prompt 描述格式；使用 Structured Outputs。

同样，工具调用应通过 function/tool schema，而不是：

> “当你想搜索时，请输出 `<search>...</search>`。”

对 Atria 来说这是非常重要的边界：

### 应从 Prompt 删除的内容

- JSON 输出格式模拟；
- tool call 文本协议（Provider 支持原生工具时）；
- game command 文本协议；
- state mutation 格式；
- result envelope 格式；
- deterministic validation 规则；
- permission；
- capability；
- irreversible action guard。

这些应该由：

- Tool Contract；
- Output Contract；
- Authority；
- Validator；
- Runtime Policy

承担。

参考：

- OpenAI Structured Outputs  
  https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Function Calling  
  https://developers.openai.com/api/docs/guides/function-calling
- Gemini Function Calling  
  https://ai.google.dev/gemini-api/docs/function-calling

---

## 10. 外部趋势七：工具也不应该全部塞进 Context

Anthropic 2025 年的 advanced tool use 工作强调：

如果 Agent 可访问数百或数千个工具，把全部 tool definitions 直接塞进每一轮 context 会产生巨大的 token 消耗和选择噪声。

其方案包括：

- tool search；
- deferred tool loading；
- programmatic tool calling；
- tool-use examples。

这与 Atria 未来的 Agent Runtime 高度相关。

Prompt Program 不应该承担：

> “这里是系统所有工具的超长说明书。”

更合理的是：

```text
Agent role
  ↓
Capability / Task requirement
  ↓
Tool discovery / selection
  ↓
Only relevant tool contracts
  ↓
Model
```

参考：

- Anthropic — Introducing advanced tool use  
  https://www.anthropic.com/engineering/advanced-tool-use

---

## 11. 外部趋势八：Prompt Cache 也开始影响 Context 架构

OpenAI 当前 Prompt Caching 明确强调：

- stable prefix；
- dynamic suffix；
- tool definitions 的稳定性；
- context history 的追加；
- cache breakpoint；
- model / tools / structured output / reasoning setting 都可能影响 cache。

这意味着未来 Atria 的 Context Compiler 除了考虑：

- 质量；
- token budget；
- provenance；

还可以考虑：

- cache topology；
- stable / dynamic partition；
- reusable prefix；
- role-specific warm context。

但缓存只能是优化层，不能反过来破坏语义正确性。

参考：

- OpenAI Prompt Caching  
  https://developers.openai.com/api/docs/guides/prompt-caching

---

## 12. RP 前沿趋势一：静态 Persona Prompt 正在暴露根本限制

传统 RP 通常把角色描述成：

```text
你是 X。
你性格清冷、聪明、克制……
你过去经历……
你和用户关系……
```

然后希望这些文字在几十、几百回合后仍然稳定决定角色行为。

研究越来越明确地表明，这种静态 Persona 模型不够。

### 12.1 Dynamic Persona Coherence

ACL 2026 的 Dynamic Persona Coherence 直接指出：

> 把 persona 当作一个静态、单体属性，会把“身份一致”与“情绪僵化”混为一谈。

它将 persona 分为：

- 长期稳定 identity；
- 中期积累心理状态；
- 短期 affect。

并通过 critic / case repository / drift correction 做闭环修正。

这和 Atria 非常契合：

> **Character Identity 不应与当前 Emotion / Stress / Relationship / Intention 写在同一段固定 Prompt 中。**

参考：

- Beyond Static Persona Consistency: Dynamic Persona Coherence in LLM Role-Playing  
  https://aclanthology.org/2026.acl-long.1336/

### 12.2 PersonaForge

ACL 2026 PersonaForge 也表明：

- 更结构化的心理维度可以降低长对话 persona drift；
- 高维人格约束本身会产生“production interference”；
- 需要独立 cognitive workspace 调解人格、场景与表达。

这支持 Atria 把：

> “角色是谁”

与

> “角色此刻怎样理解/反应”

分开。

参考：

- PersonaForge  
  https://aclanthology.org/2026.findings-acl.386/

---

## 13. RP 前沿趋势二：角色一致性越来越依赖 Memory + Retrieval + Enactment

2026 的 Memory-Driven Role-Playing 研究将 persona knowledge 使用拆成四类能力：

- Anchoring；
- Recalling；
- Bounding；
- Enacting。

其结果说明：

> 角色表现不只是“Prompt 里有没有 persona”，而是模型能否在合适时机正确取回，并真正作用到行为和表达。

这对 Atria 是一个非常重要的提醒：

### 角色设定不应永久全文注入

未来更值得研究的是：

```text
Stable Identity Model
        +
Current Scene
        +
Retrieved Persona Evidence
        +
Current Cognitive / Emotional State
        ↓
Expression / Action
```

而不是：

```text
每轮塞完整角色卡 + 完整设定 + 完整关系历史
```

参考：

- Memory-Driven Role-Playing  
  https://arxiv.org/abs/2603.19313

---

## 14. RP 前沿趋势三：Emotion / Psychology 正在成为独立运行状态

MECoT 等研究开始把：

- personality；
- emotional transition；
- historical context；
- rational regulation

拆成独立机制。

无论具体方法是否值得采用，它说明一个长期方向：

> 情绪不是一条“你现在很生气”的 Prompt，而可以是一个有时间连续性、有触发原因、有衰减、有 personality modulation 的状态。

Atria 将来如果发展 Cognitive Runtime：

- emotion；
- stress；
- trust；
- attachment；
- desire；
- intention；
- belief；

都更适合先作为**typed cognitive state**存在，再由 Prompt/Expression 层消费。

参考：

- MECoT: Markov Emotional Chain-of-Thought for Personality-Consistent Role-Playing  
  https://aclanthology.org/2025.findings-acl.435/

---

## 15. RP 前沿趋势四：角色评价不能只看“像不像”

当前 RP 研究已经有多个评价框架：

- CharacterEval；
- CharacterBox；
- PersonaGym；
- PersonaEval；
- dynamic persona consistency。

它们共同提示一个问题：

> RP 质量不是单一“文风像角色”分数。

未来 Atria 的 Eval 至少应能分开观察：

### Identity fidelity
长期稳定核心身份是否保持。

### Dynamic coherence
角色是否会随着真实经历合理改变，而不是机械重复性格标签。

### Knowledge boundary
角色是否知道不该知道的事情。

### Memory utilization
该想起的时候是否想起，不该想起的时候是否胡乱引用。

### Speech / expression fidelity
角色说话方式是否符合自身表达习惯。

### Narration quality
正文是否自然、有节奏、有场景感。

### Agency quality
角色行为是否来自自身目标/认知，而不是为了迎合用户强行改变。

### Social coherence
人物之间的关系变化是否有因果连续性。

### World consistency
最终输出是否服从正式 Runtime / World state。

### User preference
文风、节奏、显式程度等是否符合用户当前 Creative Profile。

这类 Eval 将比“哪个 Prompt 看起来写得更专业”重要得多。

参考：

- CharacterEval  
  https://arxiv.org/abs/2401.01275
- CharacterBox  
  https://aclanthology.org/2025.naacl-long.323/
- PersonaGym  
  https://aclanthology.org/2025.findings-emnlp.368/
- PersonaEval  
  https://arxiv.org/abs/2508.10014

---

## 16. 对 Atria 最重要的产品分层

下面是一种研究视角，不是冻结设计。

### Layer 1 — Authority / Truth

负责：

- 世界事实；
- HP / inventory；
- quest；
- location；
- relationship 的正式状态部分；
- lifecycle；
- rules；
- transaction；
- irreversible action。

**不属于 Prompt。**

### Layer 2 — Cognitive State

负责：

- belief；
- desire；
- intention；
- emotion；
- expectation；
- uncertainty；
- Theory of Mind；
- actor-local interpretation。

它们可以被模型推断，但持久化与 authority 必须有正式边界。

**不是长期静态 Prompt。**

### Layer 3 — Memory / Retrieval

负责：

- 过去发生了什么；
- 当前任务真正相关的经历；
- persona evidence；
- social evidence；
- relevant world knowledge。

**不应由 Prompt Preset 自己管理。**

### Layer 4 — Context Policy

负责：

- 这一轮选什么；
- budget；
- rank；
- compression；
- progressive disclosure；
- evidence expansion；
- history window；
- cache-aware ordering。

它回答：

> “模型现在看什么？”

### Layer 5 — Agent Task / Intent

负责：

- 本轮 Agent 的职责；
- success criteria；
- tool/capability scope；
- output ownership；
- required evidence。

它回答：

> “模型现在要完成什么？”

### Layer 6 — Behavior / Prompt Program

负责：

- 如何完成任务；
- 如何解释证据；
- 如何规划；
- 如何批评；
- 如何创作；
- 当前 role 的高阶方法；
- soft behavioral guidance。

它回答：

> “模型应该怎样做这件事？”

### Layer 7 — Creative / Expression Control

负责：

- narration POV；
- prose density；
- dialogue/action ratio；
- pace；
- genre；
- sentence rhythm；
- explicitness；
- humor / lyricism；
- character speech manner；
- narrator voice。

这是传统“写作预设”最值得保留的部分。

### Layer 8 — Tool / Output Contract

负责：

- function schema；
- structured output；
- result envelope；
- response type；
- validation。

**应尽量使用 Provider/Runtime 原生结构，不靠文本模拟。**

### Layer 9 — Model Adaptation / Lowering

负责把稳定语义变成：

- OpenAI；
- Claude；
- Gemini；
- Qwen；
- DeepSeek；
- 本地模型；
- 未来模型

各自更适合的：

- message role；
- instruction structure；
- tool schema；
- reasoning control；
- caching；
- prefill；
- special token / template；
- structured output；
- multimodal input。

### Layer 10 — Generation Profile

负责：

- temperature；
- top-p；
- output budget；
- reasoning effort；
- verbosity；
- cache；
- retry / fallback；
- streaming；
- provider hints。

### Layer 11 — Eval / Optimization

负责：

- trajectory；
- final quality；
- RP coherence；
- cost；
- latency；
- token usage；
- model comparison；
- prompt candidate comparison；
- automatic optimization；
- regression gates。

---

## 17. “角色人格”“角色表达”“正文文风”必须彻底解耦

这是 RP 产品里非常容易混淆、也非常值得 Atria 做出差异化的一点。

未来至少应该在概念上区分：

### Character Identity

回答：

> 这个人是谁？

例如：

-价值观；
-长期人格倾向；
-背景；
-身份；
-核心关系；
-稳定偏好。

### Character Cognitive State

回答：

> 这个人现在怎么想？

例如：

-当前 belief；
-当前 intention；
-当前 emotion；
-当前 stress；
-当前 trust；
-当前 suspicion。

### Character Expression

回答：

> 这个人说话和行动怎么表达？

例如：

-词汇；
-语气；
-停顿；
-礼貌程度；
-隐喻习惯；
-口头禅；
-动作表达倾向。

### Narration Style

回答：

> 故事正文怎么写？

例如：

-第一/第三人称；
-镜头距离；
-描写密度；
-节奏；
-文学性；
-动作/对白比例；
-感官描写；
-内心描写规则。

### Scene / Genre Style

回答：

> 这一段属于什么叙事语境？

例如：

-喜剧；
-悬疑；
-浪漫；
-战斗；
-日常；
-恐怖；
-法庭辩论。

这些不应再揉成一个：

> “角色卡 + system prompt + 写作要求”。

这样才能避免：

- 角色“冷淡”导致旁白也变成机器语言；
- 某个角色口癖污染所有 NPC；
- 角色人格要求压倒剧情节奏；
- narrator style 被角色 speech style 覆盖；
- 用户换文风时意外改变角色行为。

---

## 18. 未来不应该存在“一套万能 Prompt Preset”

不同模型之间已经出现越来越大的差异：

- reasoning model 与普通 generation model；
- 原生 tool calling 能力；
- structured output；
- system/developer role 权重；
- prompt caching；
- thinking / reasoning effort；
- context window 质量；
- tool search；
- multimodal；
- provider-specific extensions。

OpenAI 官方当前也明确表示：

> 不同模型类型、甚至同一系列的不同 snapshot，可能需要不同 Prompt。

因此更合理的长期模型是：

```text
Atria Semantic Behavior
        │
        ├── model-family tuning overlay
        ├── model-snapshot optimized overlay
        └── provider capability adapter
                 │
                 ▼
         Effective Request
```

即：

### Stable semantic layer

尽量长期稳定：

- intent；
- behavior target；
- creative dimensions；
- required evidence；
- output contract；
- context lanes。

### Model optimization layer

允许频繁变化：

- instruction wording；
- examples；
- few-shot；
- ordering；
- special hints；
- model-specific exclusions；
- reasoning policy；
- cache partition。

模型升级时，应重新跑 eval / optimizer，而不是要求用户手动重写整套 preset。

---

## 19. Prompt 编译器应该进一步演化为什么

Atria 当前已有 PromptCompiler。

长期可以研究让它变成更广义的：

> **Behavior / Context Compiler**

其输入不只是 Prompt Modules，而是：

```text
Role
Task
Creative Profile
Character Expression
Cognitive State references
Context Plan
Tools
Output Contract
Model capabilities
Provider capabilities
Generation Profile
Budget
Experiment flags
```

输出：

```text
Semantic Request Snapshot
        ↓
Model-specific Lowering
        ↓
Wire Request
```

编译过程可以有 deterministic pass：

- validation；
- scope checking；
- contradiction detection；
- redundancy elimination；
- stable/dynamic partition；
- cache layout；
- target ordering；
- model capability adaptation；
- tool disclosure；
- budget admission；
- provenance projection。

然后再有**可选的 LM-based optimization pass**：

- candidate instruction rewrite；
- few-shot selection；
- model-specific adaptation；
- GEPA-like evolution；
- compression optimization。

必须明确区分：

### Deterministic compilation
同一 input + compiler version → 同一 semantic artifact。

### Optimization
允许通过 eval/LM/search 产生新 candidate revision。

两者不要混在一起，否则无法稳定 replay/debug。

---

## 20. Prompt IR 应进一步向“语义 IR”发展，而不是模拟某个 Provider

Atria 当前 PromptIR 已经有很好的基础。

未来值得坚持：

### IR 表达“意义”，而不是“OpenAI messages”

例如 IR 中应该表达：

- foundation directive；
- narrator style；
- character expression；
- evidence；
- state facts；
- current input；
- tool contract；
- output contract；
- response prefill intent；

而不是过早固定：

- system/user/assistant；
- Anthropic XML；
- Gemini parts；
- ChatML token。

这些应该由 adapter 决定。

### 为什么

未来很可能出现：

- 新 message role；
- native memory handle；
- provider-side persistent context；
- server-side tools；
- vector prompt；
- learned prefix；
- latent state；
- native world model input；
- UI output channel。

如果 Atria 核心 IR 已经等价于“Chat Completions messages”，每次模型范式变化都会污染整个上层。

---

## 21. Atria 应为“非文本行为控制”预留接口

这是作为前沿技术试验田非常值得提前保留的能力。

### 21.1 Soft / Vector Prompt

Prompt Tuning / Prefix Tuning 通过连续向量控制模型，而不是文本。

2026 年甚至已有工作主张 Provider 应公开 vector prompt interface。

目前商业 API 普遍还没有稳定通用接口，但本地模型和未来 Provider 可能支持。

因此核心设计不要假设：

> behavior control 必须最终变成字符串。

可以抽象为：

```text
BehaviorControlArtifact
  ├─ text instructions
  ├─ few-shot examples
  ├─ native provider config
  ├─ soft/vector prefix
  ├─ adapter / LoRA ref
  └─ future learned control
```

参考：

- Survey on Prompt Tuning  
  https://arxiv.org/abs/2507.06085
- Position: Vector Prompt Interfaces Should Be Exposed  
  https://proceedings.mlr.press/v306/yang26eb.html

### 21.2 Fine-tuning / Adapter

如果一个行为已经：

- 稳定；
- 高频；
- 可以被可靠 eval；
- 不需要每轮动态改变；

它未来可能比文本 Prompt 更适合：

- LoRA；
- adapter；
- fine-tune；
- distillation。

因此 Atria 长期应允许：

> 同一 Semantic Behavior Profile 可以由 text prompt backend 或 trained adapter backend 实现。

而不是让产品层知道底下究竟用了多少文字。

---

## 22. Test-time Compute 也应该脱离 Prompt

当前模型越来越多支持显式 reasoning effort。

研究也持续显示：

- 增加 test-time compute 可以提升困难任务；
- 但边际收益快速下降；
- 不同任务值得投入的 compute 不同。

因此：

> “请仔细思考”“请一步一步想”“请反复检查三次”

不应该成为 Creative Preset 的长期组成部分。

未来应由：

- Metacognitive Controller；
- Generation Profile；
- Runtime Budget；
- Model Adapter

决定：

- reasoning effort；
- critic 数量；
- rollout 数；
- parallel branch；
- retry；
- escalation。

参考：

- OpenAI Reasoning Models  
  https://developers.openai.com/api/docs/guides/reasoning
- Adaptive Test-Time Compute Allocation  
  https://arxiv.org/abs/2604.14853

---

## 23. Context Compression 应作为可评估组件，而不是“自动总结一下”

长时间 RP 必然要面对 context growth。

但未来不应该只有：

> 历史太长 → LLM 总结 → 替换历史。

2026 的长时 Agent 研究已经开始直接评价：

> 一次 compression 对之后 trajectory 的影响。

这意味着 Atria 的 compression 将来可以：

- 有 revision；
- 有 provenance；
- 有 compression policy；
- 有 downstream quality eval；
- 可针对不同 lane 使用不同策略；
- 出错时可定位是哪一次 compression 破坏了执行。

参考：

- Adapting Context Compression for Long-Horizon Agents with Counterfactual Continuations  
  https://arxiv.org/abs/2609.36526

---

## 24. Atria 作为“前沿试验田”最值得拥有的实验接口

未来架构不应只支持当前最佳方案，而应该能快速插入替代方案做 A/B / eval。

建议在设计时确保可以替换以下策略：

### Context Selector

实验：

- semantic retrieval；
- graph retrieval；
- LLM retrieval；
- rerank；
- learned selector；
- multi-stage retrieval；
- agent-curated context。

### Prompt / Behavior Compiler

实验：

- hand-written；
- template；
- DSPy-like；
- GEPA；
- ACE；
- model-generated；
- rule-based compiler；
- hybrid optimizer。

### Persona Engine

实验：

- static traits；
- Big Five；
- BDI；
- cognitive graph；
- dynamic persona coherence；
- learned latent persona；
- retrieval-based persona evidence。

### Emotion Engine

实验：

- rule/state machine；
- Markov；
- appraisal model；
- LLM derived；
- learned predictor。

### Model Adapter

实验：

- GPT；
- Claude；
- Gemini；
- DeepSeek；
- Qwen；
- local instruct；
- role-play fine-tune；
- multimodal models。

### Context Compression

实验：

- summary；
- hierarchical memory；
- semantic compaction；
- episodic extraction；
- counterfactual-evaluated compression。

### Inference Strategy

实验：

- direct；
- reasoning；
- self-consistency；
- critic；
- tree search；
- multi-agent；
- adaptive compute。

### Behavior Learning

实验：

- Prompt optimization；
- Skill evolution；
- few-shot selection；
- preference learning；
- LoRA；
- fine-tune；
- vector prompt。

这些实验最好共享统一的：

- input contract；
- output contract；
- trace；
- eval；
- provenance；
- cost metrics。

否则每个研究功能都会重新做一套 demo runtime。

---

## 25. 建议未来把用户可见配置变成“意图”，而不是底层 Prompt

普通 RP 用户真正想表达的通常不是：

> system prompt 第 3 段放什么。

而是：

- 我想要慢节奏；
- 更重对白；
- 少一点总结；
- 不替玩家行动；
- 第三人称；
- 更文学；
- 战斗更写实；
- NPC 更主动；
- 不希望所有角色都顺从；
- 允许角色长期改变；
- 更关注身体动作；
- 不要每轮强行推进主线。

这些应成为**semantic creative controls**。

例如概念上：

```yaml
narration:
  pov: third_person_limited
  pacing: slow
  prose_density: medium
  sensory_detail: high

agency:
  npc_initiative: high
  player_action_ownership: strict

dialogue:
  ratio: high
  subtext: high

continuity:
  persona_drift: bounded_dynamic
  memory_enactment: high
```

然后由 Behavior Compiler + model overlay 决定具体 Prompt 如何表达。

这样模型升级时：

- 用户设置不需要迁移；
- Prompt wording 可以重编译；
- optimizer 可以自动寻找更合适表达；
- 同一 Creative Profile 可以跨模型比较。

---

## 26. 高级用户仍然应该能够直接写 Prompt，但它应是“一个模块”

独立产品并不意味着禁止 Prompt hacking。

Atria 作为试验田反而应该保留高级自由度。

可以研究：

- Raw Instruction Module；
- Custom Behavior Module；
- Custom Model Overlay；
- custom stage；
- custom output directive。

但这些模块应该有明确 scope，而不是重新获得整个 Runtime authority。

高级用户可以控制：

> “模型怎么思考/表达”

但不应通过一段 Prompt 绕过：

- World Authority；
- tool permission；
- state transaction；
- output validation；
- secret boundary。

---

## 27. 关于传统“Prompt Preset”的最终判断

### 它不会消失

因为自然语言 instruction 仍然是：

- 最灵活；
- 最可解释；
- 最容易创作；
- 最适合快速试验

的行为控制方式之一。

### 但它不应该继续当产品核心抽象

传统 Prompt Preset 的长期问题是：

- 语义过载；
- model-specific；
- 难以 eval；
- 易产生冲突；
- 与 Context / Memory 混杂；
- 与状态规则混杂；
- 与采样参数混杂；
- 升级模型时脆弱；
- 很容易越写越长；
- 不利于自动优化。

因此更可能的长期状态是：

> **Prompt 仍然存在，但 Prompt Preset 作为“整个生成系统配置”的时代结束。**

---

## 28. 一个更适合 Atria 的未来概念图

```text
                     ┌─────────────────────┐
                     │   Experience / UX   │
                     │ user creative intent │
                     └──────────┬──────────┘
                                │
                ┌───────────────▼───────────────┐
                │ Semantic Creative / Behavior   │
                │ Profile                        │
                └───────────────┬───────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐    ┌─────────▼────────┐     ┌────────▼────────┐
│ Character      │    │ Context Runtime  │     │ Agent Task       │
│ Identity/Cog   │    │ Memory/Evidence  │     │ Goal/Capability  │
└───────┬────────┘    └─────────┬────────┘     └────────┬────────┘
        └───────────────────────┼────────────────────────┘
                                │
                      ┌─────────▼──────────┐
                      │ Semantic Request  │
                      │ / Behavior IR     │
                      └─────────┬──────────┘
                                │
                ┌───────────────▼───────────────┐
                │ Model-specific optimizer /     │
                │ lowering adapter               │
                └───────────────┬───────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
   Prompt text            Tool/schema              Native controls
                                                   reasoning/cache/
                                                   generation/etc.
                                │
                                ▼
                            Model Call
                                │
                                ▼
                         Trace / Eval / Experience
                                │
                         Optimization / Evolution
```

---

## 29. 对当前 Native Model / Prompt Runtime 的研究判断

当前实现中最值得后续架构保留的思想：

1. Prompt 与 Generation 分离；
2. Model 与 Connection 分离；
3. Runtime Route 显式；
4. exact revision；
5. immutable request snapshot；
6. Prompt Module / Program；
7. semantic targets；
8. typed parameters；
9. Prompt IR；
10. Context Plan；
11. provenance；
12. Provider Port；
13. capability evidence；
14. structured tools / output；
15. no silent legacy fallback。

未来架构重构后，即使整个模块代码被重写，这些原则多数仍然符合前沿方向。

但值得进一步突破的地方是：

- Prompt IR 扩张成更完整 Semantic Behavior / Context IR；
- Creative Profile 成为独立语义层；
- Character cognition 与 expression 解耦；
- Prompt optimizer / eval 成为正式一等能力；
- model-specific overlays 不污染 semantic profile；
- Context optimization 与 Prompt optimization 分离；
- learned/vector/fine-tuned control 可以作为替代 backend；
- Agent runtime 不再共享一个通用“聊天 preset”。

---

## 30. 不需要再保护的 SillyTavern 时代假设

用户已经明确：

> Atria 最终目标是摆脱 SillyTavern 的束缚，作为独立产品和前沿技术试验田。

因此后续正式设计不需要为了兼容而保留：

- ST Prompt Manager 的 UI；
- ST prompt identifier；
- ST prompt ordering；
- ST preset JSON shape；
- ST injection position；
- ST depth / order 语义；
- ST system/jailbreak/main prompt 历史概念；
- 一个 preset 同时控制 Prompt 和 Model 参数的历史习惯；
- card / preset / worldbook 必须保持原产品关系的假设；
- extension injection 必须继续成为 Native context 的基础机制。

如果未来仍保留其中某个概念，理由应当是：

> **它本身仍然是好的 Atria 设计。**

而不是：

> “SillyTavern 原来就是这么做的。”

---

## 31. 值得明确禁止重新出现的反模式

### 31.1 Prompt 作为数据库

不要把：

- HP；
- inventory；
- quest；
- relationship score；
- world truth

只保存在 Prompt 文本里。

### 31.2 Prompt 作为权限系统

不要依赖：

> “你绝对不能调用 X。”

权限应该由 runtime capability 执行。

### 31.3 Prompt 作为输出 parser

不要让模型手写脆弱标签协议替代 structured output。

### 31.4 Prompt 作为 tool registry

不要默认加载所有工具说明。

### 31.5 Prompt 作为 memory store

不要让长期经历只存在于越来越大的 system prompt。

### 31.6 Prompt 作为 persona state

不要把当前情绪和永久人格写在同一静态角色描述里。

### 31.7 Prompt 作为模型兼容补丁仓库

Provider/model workaround 应属于 model overlay / adapter，并有版本和 eval。

### 31.8 Prompt 越长越专业

长 Prompt 很容易制造：

- instruction dilution；
- contradiction；
- attention competition；
- cache churn；
- model upgrade debt。

---

## 32. 后续正式设计最值得优先回答的问题

当前架构重构完成后，Codex 在正式进入实现前应重新调研当时的模型和代码，并回答：

### Semantic layer

- Atria 最稳定的 Behavior IR 应表达哪些语义？
- Creative Profile 与 Agent Method 是否应使用同一 IR？
- 哪些字段必须是 typed，而哪些应该保持自由文本？

### Context layer

- Context Runtime 如何向 Behavior Program 提供 facts/evidence，而不让 Prompt 自己发现状态？
- 如何支持 progressive disclosure？
- 如何记录每个 context item 的 provenance 和 token cost？
- stable prefix / dynamic suffix 是否值得成为编译器优化？

### Persona / RP

- Identity / Cognitive State / Expression / Narration 的正式边界是什么？
- Character speech 与 Narrator prose 如何保证不会互相污染？
- 动态 persona 的哪些部分可持久化？
- 情绪/关系状态由谁拥有 authority？

### Model adaptation

- Semantic profile 如何针对不同 model snapshot 自动优化？
- 哪些能力使用 provider-native control，哪些仍需 Prompt？
- model overlay 是否可以由 eval 自动生成？
- 模型更新时如何跑 regression / promotion？

### Optimization

- 是否引入 GEPA / DSPy 风格的 offline optimizer？
- 用户 swipe/edit/regenerate 如何转成可靠 eval signal？
- RP quality 的自动评价如何避免 LLM judge 偏差？
- prompt candidate 如何 promote / rollback？

### Future control backend

- 是否为 local model 提供 LoRA / adapter / vector prompt 接口？
- text prompt 与 learned control 是否共享同一 semantic profile？
- 训练数据如何从 Runtime trajectory 派生但避免隐私和错误标签？

### Product UX

- 普通用户应该看到哪些 Creative controls？
- 高级用户如何进入 raw module / compiled request / trace？
- “Preset”这个词是否还值得作为一级产品概念存在？

---

## 33. 推荐的研究优先级

这仍然不是实施阶段。

### P0 — Stable semantic boundaries

先确保最终 Native 架构明确：

- Truth；
- State；
- Cognition；
- Context；
- Behavior；
- Expression；
- Generation；
- Tool / Output Contract；
- Model Adapter。

没有这个边界，任何新 Prompt UI 都只是在旧问题上再造一层。

### P1 — Semantic Creative / Behavior Profile

让用户表达“想要什么体验”，而不是直接管理 provider prompt。

### P2 — Model-specific lowering + eval

同一 semantic profile 能针对不同 model snapshot 产生不同 optimized request，并被统一评价。

### P3 — RP Persona / Cognitive / Expression separation

这是 Atria 最可能建立明显产品差异的层。

### P4 — Prompt / Context optimization loop

接入 GEPA / ACE / 自研 optimizer 思路，基于 trace/eval 演化。

### P5 — Learned control backends

为 local model / future API 研究：

- LoRA；
- soft prompt；
- vector prompt；
- distillation；
- fine-tune。

---

## 34. 最终研究判断

如果 Atria 的架构重构继续按当前 Native / Authority / State / Agent Runtime 方向推进，那么“Prompt Preset”未来仍然有价值，但它应该逐步从：

> **整个 RP 运行机制的中心**

变成：

> **Atria Behavior Compiler 的一种可编辑输入资产。**

Atria 真正应该拥有的核心不是“比 SillyTavern 更强的预设编辑器”。

而是：

> **一个可以把 World State、Cognition、Memory、Agent Task、Creative Intent、Tool Contract、Model Capability 和 Generation Policy 编译成最适合当前模型的有效推理上下文，并持续通过 Eval 自我改进的 Agent-native Behavior Runtime。**

如果这个方向成立，那么未来即便文本 Prompt 本身因为模型能力提升而越来越短，Atria 的价值也不会下降。

相反：

- 模型越强；
- 原生工具越强；
- structured output 越强；
- provider-side memory 越强；
- reasoning control 越强；
- learned/vector control 越成熟；

Atria 越可以把旧的 Prompt hack 删除掉，把更高阶的语义和 Runtime 能力直接映射到新模型能力上。

这才符合“独立产品 + 前沿技术试验田”的目标。

---

## 35. 外部资料索引

### Context / Prompt / Agent engineering

- Anthropic — Effective context engineering for AI agents  
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic — Writing effective tools for agents  
  https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic — Introducing advanced tool use  
  https://www.anthropic.com/engineering/advanced-tool-use
- Anthropic — Demystifying evals for AI agents  
  https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- OpenAI — Prompt engineering  
  https://developers.openai.com/api/docs/guides/prompt-engineering
- OpenAI — Rethinking skills and prompts for GPT-6 Astra  
  https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra
- OpenAI — Prompt caching  
  https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI — Reasoning models  
  https://developers.openai.com/api/docs/guides/reasoning
- OpenAI — Function calling  
  https://developers.openai.com/api/docs/guides/function-calling
- OpenAI — Structured Outputs  
  https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI — Agent Improvement Loop  
  https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop
- Gemini — Function calling  
  https://ai.google.dev/gemini-api/docs/function-calling

### Prompt / Context optimization

- DSPy  
  https://dspy.ai/
- GEPA  
  https://arxiv.org/abs/2507.19457
- ACE — Agentic Context Engineering  
  https://arxiv.org/abs/2510.04618
- Prompt Tuning survey  
  https://arxiv.org/abs/2507.06085
- Vector Prompt Interfaces  
  https://proceedings.mlr.press/v306/yang26eb.html
- Promptware Engineering  
  https://wssun.github.io/papers/2025-FSE-20230SEWorkshop-Promptware-Engineering.pdf

### Long context / compression

- Lost in the Middle  
  https://aclanthology.org/2024.tacl-1.9/
- Context Length Alone Hurts LLM Performance Despite Perfect Retrieval  
  https://aclanthology.org/2025.findings-emnlp.1264/
- Adapting Context Compression for Long-Horizon Agents with Counterfactual Continuations  
  https://arxiv.org/abs/2609.36526

### Role-play / Persona

- RoleLLM  
  https://arxiv.org/abs/2310.00746
- CharacterEval  
  https://arxiv.org/abs/2401.01275
- CharacterGPT  
  https://aclanthology.org/2025.naacl-industry.24/
- CharacterBox  
  https://aclanthology.org/2025.naacl-long.323/
- Persona-Aware Contrastive Learning  
  https://aclanthology.org/2025.findings-acl.1344/
- MECoT  
  https://aclanthology.org/2025.findings-acl.435/
- PersonaGym  
  https://aclanthology.org/2025.findings-emnlp.368/
- PersonaEval  
  https://arxiv.org/abs/2508.10014
- Memory-Driven Role-Playing  
  https://arxiv.org/abs/2603.19313
- Dynamic Persona Coherence  
  https://aclanthology.org/2026.acl-long.1336/
- PersonaForge  
  https://aclanthology.org/2026.findings-acl.386/

---

## 36. 给后续正式设计阶段的读取提示

当当前架构重构完成、准备正式推进本主题时：

1. 先读取当时最新的 Native Runtime / State / Authority / Model-Prompt / Agent Runtime 真实代码；
2. 再读取本文作为研究背景；
3. 重新检查当时 OpenAI / Anthropic / Gemini / 主流开源模型的最新能力；
4. 重新检查 2026 之后 Prompt optimization、long-horizon context、role-playing agent、learned control 的最新研究；
5. 不把本文中的候选命名或分层当成已经批准的最终设计；
6. 基于新的 `main` 创建正式 Plan；
7. 设计时默认 Atria 是独立产品，不为 SillyTavern preset / injection / extension 结构保留兼容层。
