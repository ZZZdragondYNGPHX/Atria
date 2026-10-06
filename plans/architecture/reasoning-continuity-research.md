# Atria Reasoning Continuity / Persistent Reasoning 前沿调研报告

- **调研日期**：2026-10-06
- **适用项目**：Atria
- **主题**：跨调用推理状态保留、工具链推理连续性、Provider/Gateway 兼容、Revision/Branch 生命周期与 Runtime 抽象
- **建议并入企划**：Model / Provider Routing、Agent Runtime、Task / Revision、Context Runtime 相关章节
- **文档性质**：架构调研与企划输入，不是最终 API / Schema 定稿

---

## 0. 执行摘要

本轮调研的核心结论是：

> **Atria 应把 Reasoning Continuity（推理连续性）作为 Model Runtime / Execution Runtime 的一级能力，但不应把它建模为 Memory、Chat History、Prompt Preset，也不应把 Provider 私有 reasoning 状态升级为 Atria 的权威游戏状态。**

截至 2026-10-06，OpenAI、Anthropic、Google Gemini 已分别形成不同但高度趋同的机制：

- **OpenAI**：reasoning items、`encrypted_content`、`previous_response_id`、`reasoning.context`
- **Anthropic**：thinking / redacted_thinking blocks、`signature`、Preserved Thinking、prefix binding
- **Gemini**：thought blocks、thought signatures、`previous_interaction_id`

它们的共同点并不是“把可读思维链文本塞回下一轮”，而是：

1. 模型产生一份**不透明的内部推理状态**；
2. 应用或 Provider 保存并按协议原样回传；
3. 后续调用可以在兼容条件下继续先前推理，而不必只依靠可见聊天文本重建计划；
4. Tool / Agent 工作流尤其依赖这种连续性；
5. 状态具有明确的 Provider / Model / Prefix / Conversation / Tool-chain 兼容边界；
6. 旧推理并不是永远越多越好，目标变化时继续使用旧 reasoning 可能造成 anchoring。

因此，Atria 不应增加 `openaiReasoningId` 之类的厂商专用核心字段，而应在：

```text
Connection / Endpoint
→ Callable Target / Deployment
→ Routing Policy
→ Runtime Resolver
→ Effective Execution Snapshot
```

这条执行链中，引入跨 Provider 的 **Reasoning Continuity Capability + Continuation Handle + Continuation Policy**。

最关键的定义是：

> **Reasoning Continuity 是执行上下文状态，不是游戏状态。**

它可以被持久化以便恢复执行，但：

- 不应成为 World State / Session State / Event Journal 的权威来源；
- 不应由 Package / Experience / 角色卡直接读写；
- 不应默认跨 Branch / Revision / Provider / Model Family 复用；
- 不应依赖或展示原始 Chain-of-Thought；
- 应与可审计的 Plan / Summary / Task Artifact 明确区分。

---

# 1. 为什么这件事值得进入 Atria 企划

Atria 的 Native 架构正在把 LLM 从“所有逻辑的唯一执行者”逐渐收缩为特定职责：

- Intent / Planning
- Tool / Retrieval orchestration
- Command proposal
- 复杂非确定性判断
- Narrative generation

而确定性的游戏规则、Authority、正式状态写入、Revision 与 Commit 应由 Runtime 负责。

未来一次玩家交互更可能是：

```text
Player Input
  ↓
Context / Observation
  ↓
Planner / Agent
  ↓
Tool / Retrieval
  ↓
Reason
  ↓
State Query / Domain Command
  ↓
Reason
  ↓
Commit / Receipt
  ↓
Narrative Intent
  ↓
Narrator
```

如果工具调用之间只保留普通 messages，模型往往需要反复恢复：

- 当前目标是什么；
- 为什么刚才调用这个工具；
- 已排除哪些路线；
- 下一步原计划是什么；
- 新的工具结果应如何修改已有计划。

Reasoning Continuity 的价值，就是减少这类“重新理解自己刚才为什么这么做”的重复工作。

---

# 2. OpenAI：Reasoning 已经成为可延续的独立执行状态

## 2.1 Persisted reasoning 与普通 Conversation State 是两个概念

OpenAI 当前 Responses API 文档明确说明：

- Persisted reasoning 提供 reasoning continuity；
- 它**不暴露 raw reasoning**；
- reasoning items 对应用是 opaque；
- `reasoning.context` 控制哪些兼容 reasoning items 可用于下一次采样。

当前主要语义：

```text
auto
current_turn
all_turns
```

截至本报告日期，OpenAI 文档显示：

- GPT-5.6 family 支持 `all_turns`，并默认使用它；
- GPT-6.1 Sol 也支持；
- 早期模型通常以 `current_turn` 为默认；
- `all_turns` 只有在请求确实拥有先前 response items 时才有效。

状态传递路径包括：

1. `previous_response_id`
2. Conversation
3. 手工 replay 完整 response output

因此 Reasoning Continuity 并不等同于普通消息历史。

## 2.2 Stateless / ZDR 也可以保留 reasoning

OpenAI 对 `store: false` / Zero Data Retention 路径返回 `encrypted_content`。

应用不需要也不应解析这些 encrypted reasoning tokens，只需：

```text
保存原始 reasoning item
→ 下一轮原样回传
```

这证明一个重要架构事实：

> Provider-managed conversation cursor 与 client-held opaque reasoning state 是两种 transport，但属于同一个更高层能力。

Atria 应抽象能力本身，而不是把 `previous_response_id` 当成核心模型。

## 2.3 Model Family 是 Reasoning Continuity 的兼容边界

OpenAI 当前明确写明 persisted reasoning 只能在兼容 model family 内复用。

文档以 GPT-5.6 family 为例：

```text
gpt-5.6-sol
gpt-5.6-terra
gpt-5.6-luna
```

可共享兼容 reasoning，但 GPT-5.6 与 GPT-5.5 family 之间不能直接延续。

切换到不兼容 family 后，API 会从上下文中排除不兼容 reasoning。

因此 Atria 不能用：

```text
same provider = reusable
```

判断 reasoning 是否可复用。

最小兼容键至少要包含：

```text
provider
model-family compatibility
protocol / transport
execution path
```

## 2.4 OpenAI 已公开量化收益

OpenAI GPT-5 prompting guide 给出了非常直接的 Agent 证据：

> Tau-Bench Retail 从 **73.9% 提升到 78.2%**，变化仅来自切换到 Responses API，并使用 `previous_response_id` 将先前 reasoning items 带入后续请求。

这说明 Reasoning Continuity 不只是“方便保存状态”，它可以直接改善多步骤工具任务的成功率。

对 Atria 最相关的场景正是：

- 多工具 Agent；
- 状态查询；
- 规则查询；
- 长 Task；
- 连续工具调用；
- 多阶段决策。

---

# 3. OpenAI 同样明确指出：旧 reasoning 会造成锚定

OpenAI deployment guidance 建议：

- 当任务目标、假设、优先级仍稳定时，可使用 `all_turns`；
- 当早期 reasoning 已经不再相关时，应倾向 `current_turn`；
- 否则旧 reasoning 可能把模型锚定在过时的方法上。

这直接否定了一种简单设计：

```text
Character / Chat
└── reasoningHistory[]
    └── 永久全部回传
```

Atria 更适合的是：

```text
Reasoning Continuity
└── scoped + invalidatable + branch-aware
```

---

# 4. Anthropic：Thinking 已从“展示思考”演变成正式协议状态

## 4.1 Thinking block 带有加密 signature

Anthropic 当前 Thinking 文档指出：

- thinking block 与普通 text block 分离；
- 每个 thinking block 有 `signature`；
- signature 是完整 reasoning 的加密表示；
- 多轮和 tool-use 工作流中，应把它原样回传；
- 可见 thinking 只是 summary，而不是 raw chain-of-thought；
- 即使 `display: omitted`，signature 仍然存在并承担连续性作用。

这与 OpenAI 的 opaque / encrypted reasoning 在架构上非常相似。

## 4.2 工具调用中的规则非常严格

Anthropic 的 Tool + Multi-turn 文档要求：

```text
Claude thinking + tool_use
→ 应用执行 tool
→ 回传完整 assistant content
→ 回传 tool_result
```

并明确规定：

- thinking block 必须完整、不修改；
- assistant message 要按收到时的结构回传；
- 过滤 `redacted_thinking` 也会破坏协议；
- 某些错误重建方式会直接触发 400。

所以：

> **Provider-native execution item 不能在 Atria 内部过早压平成普通 role/content 字符串。**

否则会把协议必需的 execution state 丢掉。

## 4.3 最新 Preserved Thinking 引入 Prefix Binding

Anthropic 目前的 Preserved Thinking 比传统多轮历史机制更严格。

对于受支持的新模型，thinking signature 会验证：

1. **生成它的模型 / 可读取它的兼容模型**
2. **它之前的完整前缀**

这个 prefix 包括：

- top-level `system`
- `tools`
- 此 thinking block 之前的 messages

如果前缀发生变化：

```text
old thinking block
+ modified system/tools/history
→ invalid
```

API 可以：
- 400；
- 或按配置 drop invalid block。

Anthropic 还建议采用 append-only 集成方式。

这对 Atria 极其关键，因为传统聊天系统常做：

- Prompt 重组；
- System 合并；
- World Book 动态插入；
- Tool schema 重排；
- Messages 压平；
- 历史删减。

这些操作都不能再默认认为与 reasoning continuity 无关。

---

# 5. Anthropic 的模型切换进一步证明“Model Reasoning ≠ Path Reasoning”

Anthropic 的文档显示：

- 不同模型对旧 thinking blocks 的可读性并不对称；
- 某些模型可以读取较早模型的 block；
- 反向切换却会丢失；
- 不可读 block 会被丢弃；
- 某些 thinking block 甚至具有 account binding。

所以 Reasoning Continuity 的兼容关系可能不是简单的：

```text
A ↔ B
```

而可能是：

```text
A → B = yes
B → A = no
```

因此 Atria 更适合让 Provider Adapter 提供类似：

```text
canContinue(fromSnapshot, toSnapshot)
```

而不是在核心代码里硬编码“同一家模型即可”。

---

# 6. Gemini：Thought Signature 与 OpenAI / Anthropic 高度同构

Google Gemini 当前官方文档把 Thought Signature 定义为：

> 模型内部 reasoning state 的加密表示，用于维持多轮 reasoning continuity。

## 6.1 Stateful 模式

Interactions API 的推荐模式：

```text
store: true
previous_interaction_id
```

服务器负责：
- Conversation state
- Thought blocks
- Signatures

应用不必自行管理 signature。

## 6.2 Stateless 模式

当应用自行管理完整 history 时：

- 必须回传所有 thought blocks；
- 不应删除或修改；
- signature 用于继续 reasoning。

这再次说明：

```text
Provider server cursor
```

和：

```text
client-held opaque reasoning state
```

可以归入同一 Atria 抽象。

## 6.3 Gemini Tool Context 进一步扩大了“Opaque Execution State”的范围

Gemini 3+ 的工具流里，signature 不只与 thought step 有关，也可出现在：

- tool call
- tool result / function response

这些 encrypted context 用于跨 interaction 维护工具执行上下文。

所以 Atria 的抽象最好不要叫：

```text
ThoughtText
```

而应更接近：

```text
ProviderExecutionState
ReasoningContinuation
ExecutionContinuation
```

Reasoning 是核心用途，但未来 Provider 很可能把更多工具上下文也放进这类 opaque state。

---

# 7. 三大 Provider 的共同抽象

| 概念 | OpenAI | Anthropic | Gemini |
|---|---|---|---|
| 内部推理状态 | reasoning item | thinking / redacted_thinking | thought |
| opaque / encrypted | `encrypted_content` | `signature` / encrypted data | thought signature |
| Provider-side continuation | `previous_response_id` / Conversation | provider/model-specific history behavior | `previous_interaction_id` |
| Client-side continuation | replay output items | resend full blocks | resend thought blocks |
| Tool continuity | 强烈相关 | 协议级要求 | 协议级要求 |
| Cross-turn reuse | `all_turns` | preserved thinking | Interactions/history |
| 兼容边界 | model family | model + prefix + account 等 | backend/model/signature rules |
| Raw CoT 暴露 | 否 | 否；可见内容为 summary | 不应视为 raw CoT |

可以把共同能力概括为：

```text
Reasoning Continuity
=
Provider-managed or Client-held opaque execution state
+ compatibility constraints
+ continuation scope
+ lifecycle policy
```

而不是：

```text
Reasoning Continuity = <think> 文本
```

---

# 8. 对 Atria Model / Provider Routing 架构的直接影响

Atria 当前规划中的执行链：

```text
Connection / Endpoint
→ Callable Target / Deployment
→ Routing Policy
→ Runtime Resolver
→ Effective Execution Snapshot
```

应该在 **Runtime Resolver + Effective Execution Snapshot** 层处理 Reasoning Continuity。

原因是：

同一个“模型名”可能经过：

```text
Official API
OpenRouter
New API
SubAPI / Sub2API
自建 Gateway
多级 Gateway
协议转换层
```

最终是否能继续 reasoning，取决于**实际 execution path**。

因此不能只定义：

```ts
model.supportsReasoning = true
```

而应区分：

```text
Model Reasoning Capability
≠
Execution Path Continuity Capability
```

更完整的判断应该接近：

```text
Exact Execution Path
├── model supports reasoning
├── selected API protocol supports native state
├── endpoint preserves opaque state
├── gateway conversion preserves required fields
├── source/target model compatibility holds
├── prefix/history/tools constraints still hold
└── current continuation handle is still valid
```

---

# 9. Gateway / 聚合 API 调研

## 9.1 OpenRouter

OpenRouter 当前文档支持 reasoning，并定义 `reasoning_details`。

其文档还提供了 Preserving Reasoning 章节，允许把 reasoning context 带到后续 turn。

这说明 Gateway 并非天然无法提供 Reasoning Continuity。

但 Atria 仍不能把：

```text
OpenRouter endpoint
```

简单等价为：

```text
所有上游模型 continuation 语义一致
```

应结合：
- 实际 Provider；
- 模型；
- OpenRouter 返回格式；
- routing / fallback；
- continuation evidence；

判断。

## 9.2 New API

New API 当前项目同时支持：

- OpenAI Chat
- OpenAI Responses
- Anthropic Messages
- Gemini
- 多 Provider routing
- retry / mapping
- protocol conversion

但其 README 已明确警告：

> 可用功能取决于 channel、upstream model 和 conversion path；协议特有 tools / fields 不保证完全映射。

其代码也存在明确的跨协议 converter：

```text
OpenAI Chat → Claude
OpenAI Chat → Gemini
OpenAI Chat → Responses
Responses → Chat
Responses → Gemini
Claude → OpenAI Chat
Gemini → OpenAI Chat
...
```

这对 Atria 的结论非常明确：

> **“Gateway 支持 Responses / Claude / Gemini”不等于每条 conversion path 都保留原始 Reasoning Continuity。**

因此能力判断必须落到：

```text
Exact Execution Snapshot
```

而不是只看：
- Gateway 产品名；
- Model ID；
- 是否存在 `/v1/responses`。

## 9.3 SubAPI / Sub2API 等其他 Gateway

对于没有足够公开证据证明 opaque reasoning 能跨所有 routing / translation path 无损传递的 Gateway，Atria 第一版应采用：

```text
continuity = unknown
```

而不是乐观推断：

```text
OpenAI-compatible = supported
```

之后通过：
- endpoint metadata；
- adapter declaration；
- feature probe；
- 实际运行 evidence；

把状态提升为 verified。

---

# 10. 建议的 Atria Capability 模型

以下是**概念结构**，不建议直接照抄为最终 TypeScript Schema。

```text
ReasoningContinuityCapability
├── support
│   ├── none
│   ├── active_execution
│   └── cross_turn
│
├── transport
│   ├── provider_cursor
│   ├── opaque_items
│   ├── signed_blocks
│   └── provider_native_history
│
├── compatibility
│   ├── same_exact_model
│   ├── same_model_family
│   ├── directional_model_set
│   ├── provider_defined
│   └── unknown
│
├── binding
│   ├── prompt_prefix_sensitive
│   ├── tool_schema_sensitive
│   ├── history_shape_sensitive
│   ├── account_sensitive
│   └── execution_path_sensitive
│
└── lifecycle
    ├── explicit_reset
    ├── automatic_filter
    ├── provider_compaction
    ├── branch_fork
    └── application_discard
```

核心目标不是提前锁死字段，而是保证 Runtime 能回答：

> **当前这份 continuation state 还能不能继续？为什么？**

---

# 11. 建议的 Reasoning Continuation Handle

实际状态建议被 Runtime 视为 opaque handle。

概念上：

```text
ReasoningContinuation
├── continuationId
├── provider
├── endpoint / execution-path identity
├── protocol
├── resolved target
├── model compatibility key
├── provider-native state
├── originating task / turn / revision / branch
├── parent continuation
├── prompt/tool binding evidence
├── policy
├── createdAt
├── validity
└── invalidation / drop reason
```

规则：

- Atria Core 不解析 opaque reasoning；
- Provider Adapter 负责 protocol mapping；
- Runtime 决定 continue / fork / reset / discard；
- Execution Snapshot 记录最终实际发生了什么。

---

# 12. Reasoning Continuity 应属于哪里

## 12.1 应属于 Model / Execution Runtime

因为它绑定：

- Model
- Provider
- Protocol
- Endpoint
- Tool schema
- Prompt prefix
- Agent Task
- Execution attempt
- Routing / fallback

因此 owner 应是：

```text
Model Runtime / Execution Runtime
```

## 12.2 不属于 Memory

Memory 表达：

> 世界、角色、玩家过去发生过什么。

Reasoning Continuity 表达：

> 模型当前如何继续完成这个任务。

两者不能混用。

## 12.3 不属于 Prompt

不要用：

```xml
<previous_thought>
模型上次是这么想的……
</previous_thought>
```

模拟 Provider 原生 reasoning continuity。

这样会：

- 消耗 visible context；
- 污染任务语义；
- 可能把内部 reasoning 变成可见 prompt；
- 无法获得 Provider 对原生状态的专门支持；
- 增加 prompt injection / self-anchoring 风险。

## 12.4 不属于 Authoritative World State

删除 continuation 不应改变：

- HP
- Inventory
- Quest
- Event
- World State
- Session domain state

它属于 derived / runtime execution state。

---

# 13. 与 Atria Revision / Branch 的关系

这是 Atria 必须单独处理的边界。

## 13.1 Retry / Regenerate

同一条历史重新生成时，旧 reasoning 可能已经包含：

- 被放弃的剧情路线；
- 被放弃的工具选择；
- 被放弃的人物解释。

默认建议：

```text
Regenerate
→ reset or fork reasoning lineage
```

而不是：

```text
Regenerate
→ blindly continue previous reasoning
```

## 13.2 Edit Earlier Message

用户修改了 reasoning checkpoint 之前的历史后：

- Anthropic 的 prefix-bound state 技术上可能直接 invalid；
- OpenAI state 即使仍可读取，也可能语义过时；
- Gemini stateless signature history 也依赖原样结构。

因此建议平台统一规则：

```text
history before checkpoint changed
→ invalidate continuation after checkpoint
```

## 13.3 Restore Older Revision

恢复旧 Revision 时，可以：

- 恢复该 Revision 对应的 continuation checkpoint；
- 或重新推理。

但不能继续“未来 Revision”已经产生的 reasoning。

## 13.4 Branch

Branch 可以共享祖先 checkpoint：

```text
checkpoint
├── Branch A continuation
└── Branch B continuation
```

一旦分叉：
- lineage 独立；
- A 后续 reasoning 不能污染 B；
- routing / model switch 也分别记录。

---

# 14. 与 Task Artifact 跨 Revision 复用的边界

Atria 已经在讨论：

> Task Artifact 可在明确契约下跨 Revision 复用。

这里要把两类东西彻底分开。

## 14.1 可作为普通 Artifact 复用

例如：

- 检索结果；
- 世界状态 projection；
- 已验证计算结果；
- Narrative Intent；
- Task Summary；
- 显式 Plan；
- 结构化候选结论。

它们可以具备：

```text
inputs hash
provenance
revision applicability
validity contract
```

## 14.2 Opaque Reasoning State 不应默认作为普通 Artifact Cache

因为它可能绑定：

- Provider；
- Model family；
- Directional compatibility；
- Prompt prefix；
- Tools；
- Account；
- History shape；
- Provider 私有实现。

因此应区分：

```text
Reasoning state
→ resume execution

Explicit reasoning-derived artifact
→ reusable task artifact
```

这两个生命周期不应共用同一缓存规则。

---

# 15. Atria RP 场景的推荐使用方式

Reasoning Continuity 对不同 Runtime Role 的价值不一样。

## 15.1 Planner / Agent

推荐：**高连续性**

适合：

- 多工具；
- 多阶段任务；
- 长 horizon 目标；
- 连续状态查询；
- 复杂计划修改。

建议支持：
- active-execution
- task
- adaptive

## 15.2 Tool Orchestrator / State Resolver

推荐：**当前 execution 内高连续性**

例如：

```text
玩家意图
→ 判断 Command
→ 查状态
→ 查规则
→ 执行 Domain Logic
→ 根据 Receipt 完成解析
```

这是最典型的“不要每个 tool result 后重新构建计划”的场景。

## 15.3 Retrieval / Memory Search

推荐：**低到中**

常规检索更适合 deterministic search / ranking / cache。

只有复杂 research agent 才需要长 reasoning continuity。

## 15.4 Narrator / 正文生成

推荐：**低到中，短 horizon**

这是 Atria 与普通 Agent 产品最关键的差异之一。

RP 正文需要：

- 表达新鲜度；
- 文体多样性；
- 对最新剧情重新取样；
- 避免早期人物解释持续自我强化。

如果 Narrator 长期 all-turn reasoning，可能发生：

```text
早期解释
→ 后续 reasoning 持续引用
→ 单一标签越来越强
→ 人设收窄
→ 表达机械化
```

例如：

```text
清冷
→ 克制
→ 少说话
→ 高度精炼
→ 专业化 / 机械化措辞
→ 后续 reasoning 再次把这种表现当作“角色证据”
```

这正是 RP 中非常危险的 self-anchoring。

因此长期稳定信息应该写入：

- Character State
- Memory
- World State
- Narrative Summary
- Explicit Style Constraints

而不是依赖旧 hidden reasoning。

## 15.5 Critic / Validator

推荐：**默认独立 reasoning**

如果 Critic 继承 Planner 的全部 reasoning，容易继承同一批假设。

对于：

- contradiction check；
- rule validation；
- correctness verification；
- second opinion；

独立 reasoning 更有价值。

---

# 16. 建议的 Continuation Policy

Atria 不应只有：

```text
reasoning: true / false
```

建议抽象语义策略：

```text
none
active_executiontask
adaptive
```

## `none`

完全不延续。

适合：
- fresh narrator；
- independent critic；
- 不可信 gateway；
- 用户明确要求重新思考。

## `active_execution`

只在一个用户 turn / tool loop 内继续。

这是跨 Provider 最安全的第一层能力。

## `task`

允许同一 Task 跨多个 turn 延续。

适合：
- Research Agent；
- Planner；
- 长任务；
- 多阶段工作流。

## `adaptive`

Runtime 根据：

- objective continuity；
- Revision；
- Branch；
- Provider / Model compatibility；
- prefix / tool changes；
- stale-plan signal；
- routing failover；

自动选择 continue / fork / reset / discard。

长期来看，Atria 最值得实现的是 adaptive。

---

# 17. Continue / Fork / Reset / Discard 四种操作语义

不要只设计一个 boolean。

## Continue

条件大致为：

```text
same objective
+ lineage continuous
+ execution path compatible
+ provider state valid
+ history/prefix/tool constraints hold
```

## Fork

适合：

- 创建 Branch；
- 从同一 checkpoint 生成多个候选；
- 多 Agent 从共同背景开始独立分析。

Fork 后 lineage 独立。

## Reset

保留普通 conversation / world context，但重新推理。

适合：

- 用户改变目标；
- narrator regeneration；
- strategy pivot；
- stale reasoning。

## Discard

reasoning state 已技术失效或无价值。

例如：

- model family changed；
- provider changed；
- protocol path 不支持；
- prefix mismatch；
- history edited；
- account mismatch；
- TTL / storage policy；
- privacy clear。

---

# 18. Routing 与 Fallback 必须 reasoning-aware

## 18.1 Quality Routing 与 Continuity 不能完全独立

例如：

```text
Primary: OpenAI reasoning model
Fallback: Claude
```

Primary 已产生 OpenAI reasoning items 后失败，切到 Claude：

```text
OpenAI opaque reasoning
≠
Claude signed thinking
```

Fallback 可能成功，但 continuity 已断。

因此 Effective Execution Snapshot 应记录：

```text
continuityDisposition:
- preserved
- restarted
- dropped
- incompatible
- unknown
```

## 18.2 Failure Fallback 要记录 Reasoning Loss

不能只记录：

```text
attempt 1 failed
attempt 2 succeeded
```

还应该记录：

```text
attempt 2 succeeded
reasoning continuity: lost/restarted
```

对于复杂 Agent Task，这会显著影响：
- 成功率；
- token；
- latency；
- 行为一致性。

## 18.3 多级 Gateway

例如：

```text
Atria
→ New API
→ OpenRouter
→ Upstream Provider
```

Atria 可能无法知道全部内部路由。

因此 continuity 证据也应有等级，例如：

```text
verified_native
verified_gateway_preserved
declared_only
unknown
observed_broken
```

而不是一个静态 boolean。

---

# 19. Effective Execution Snapshot 应补充的语义

概念上建议至少记录：

```text
EffectiveExecutionSnapshot
├── selected model
├── selected endpoint / deployment
├── resolved provider path
├── API protocol
├── reasoning mode / effort
├── requested continuation policy
├── effective continuation mode
├── continuation state source
├── compatibility decision
├── binding / prefix decision
├── reset / drop reason
├── fallback continuity disposition
└── evidence level
```

这样诊断日志才能回答：

> 为什么这一轮模型突然像重新开始了？

而不是只看到：

```text
model = xxx
```

---

# 20. Provider Adapter 建议职责

Atria Core 不应该理解厂商 opaque payload。

Provider Adapter 至少负责：

```text
detectCapability()
captureContinuation()
serializeContinuation()
restoreContinuation()
validateCompatibility()
mapContinuationToRequest()
extractContinuationFromResponse()
describeLossReason()
```

Runtime 负责：

```text
choosePolicy()
decideContinueForkResetDiscard()
bindToTaskRevisionBranch()
recordExecutionSnapshot()
```

两层职责不要混在一起。

---

# 21. 不要过早把 Provider Response 压平

传统聊天系统常做：

```text
Provider Response
→ { role, content }
→ messages[]
```

在 Reasoning Continuity 世界里已经不够。

Provider response 中可能存在：

- reasoning item；
- encrypted content；
- thinking block；
- redacted thinking；
- thought signature；
- function call id；
- tool context signature；
- provider cursor；
- phase / execution metadata。

建议至少在 Runtime Execution 层保留：

```text
ProviderNativeExecutionEnvelope
```

直到：
- tool loop 完成；
- continuation capture 完成；
- canonical user-visible message 提取完成。

**Canonical Chat Message 与 Provider Execution Envelope 应拆开。**

---

# 22. 隐私、安全与产品边界

## 22.1 Opaque 不代表可以暴露

这些状态应该视为 Provider-private execution metadata：

- 不向 Package 暴露；
- 不写入角色卡；
- 不作为 World Book 文本；
- 不允许脚本任意编辑；
- 不插入普通 prompt。

## 22.2 Reasoning Summary 与 Continuation State 是两个东西

Provider 可能返回：

```text
reasoning summary
```

它属于：

```text
Reasoning Presentation / Observability
```

而不是：

```text
Reasoning Continuation
```

Atria 可以展示：
- 简短“正在规划”；
- Provider summary；
- tool activity；

但不能依赖 summary 恢复 hidden reasoning。

## 22.3 Export / Share

Atria 导出：

- Session；
- Character；
- Package；
- Save；

时默认不应把 opaque reasoning 当作可移植游戏数据。

原因：

- 可能 account-bound；
- 可能 model-bound；
- 可能 prefix-bound；
- 可能 execution-path-bound；
- 可能失效；
- 另一设备 / Provider 不一定能使用。

如果未来支持“恢复进行中的 Agent Task”，应单独设计可选 Runtime checkpoint。

---

# 23. 建议的第一版实现阶段

## Phase A — 架构准备

先只实现抽象：

- Capability model
- Provider-native execution envelope
- Continuation handle
- Continuation policy
- Continuation lineage
- Effective Execution Snapshot
- continue / fork / reset / discard
- invalidation reasons

不要求所有 Provider 立即实现。

## Phase B — OpenAI Responses Reference Implementation

优先验证：

- `previous_response_id`
- stored responses
- `store: false`
- encrypted reasoning replay
- `current_turn`
- `all_turns`
- same-family model switch
- incompatible-family reset
- tool calling continuation

OpenAI 目前最适合做 Atria 的 reference implementation。

## Phase C — Anthropic Native

验证：

- thinking block round-trip
- redacted_thinking preservation
- tool loop
- adaptive thinking
- prefix binding
- model compatibility
- account binding
- prefix mismatch drop/error
- thinking block clearing

## Phase D — Gemini Native

验证：

- Interactions stateful
- `previous_interaction_id`
- stateless replay
- thought signatures
- tool-call signatures
- model switch
- signature preservation

## Phase E — Gateways

逐路径 probe：

- OpenRouter
- New API
- SubAPI / Sub2API
- custom OpenAI-compatible endpoint

不要以“兼容 OpenAI”作为充分条件。

---

# 24. 建议增加 Feature Probe / Capability Evidence

Provider 宣称支持与 Atria 实际链路可用是两件事。

建议增加非破坏性 capability probe。

```text
Probe 1
simple reasoning
→ 是否返回可延续 state?

Probe 2
reasoning + tool call
→ tool result 回传后是否继续成功?

Probe 3
next user turn
→ prior reasoning 是否仍可用?

Probe 4
same-family model switch
→ preserved / dropped / error?

Probe 5
history/prefix mutation
→ provider 行为是什么?

Probe 6
gateway retry / failover
→ continuation preserved?

Probe 7
streaming
→ opaque state 是否完整重组?
```

结果应记录为 evidence，而不是永久写死到 model registry。

---

# 25. 建议的 A/B/C/D Eval

正式默认开启前，建议至少做四组：

## A. Stateless

不保留 reasoning。

## B. Active-turn

只在同一次玩家请求 / tool loop 内保留。

## C. Cross-turn Task

同 Task 跨用户 turn 延续。

## D. Adaptive

根据目标 / Branch / Revision / Provider compatibility 自动 reset。

---

# 26. Eval 指标

## 26.1 Agent / Tool

- task success rate
- tool call correctness
- redundant tool calls
- repeated state queries
- reasoning token
- visible input/output token
- total API calls
- latency
- fallback recovery
- continuation loss rate

## 26.2 RP

- character consistency
- prose diversity
- phrase repetition
- stale-plan contamination
- branch independence
- goal-shift responsiveness
- narrative surprise / freshness
- mechanical-style drift
- role-label overfitting

## 26.3 Runtime Correctness

- restore 后 continuation 是否正确
- edit 后是否正确 invalidation
- branch fork 是否隔离
- regenerate 是否不会误续旧计划
- provider switch 是否记录 loss
- gateway fallback 是否可解释
- opaque payload 是否保持原样
- streaming 是否丢 block/signature

---

# 27. Atria 推荐默认策略

| Runtime Role | 建议默认 Continuity |
|---|---|
| Planner / Agent | `adaptive` / `task` |
| Tool Orchestration | `active_execution`，必要时 `task` |
| State Resolver | `active_execution` |
| Research Agent | `task` |
| Memory Retrieval | `none` / `active_execution` |
| Narrator | `none` / short-horizon / current-turn |
| Critic / Validator | `none`，独立推理 |
| Background Summarizer | `active_execution` |
| Deterministic Runtime | 不使用 reasoning |

这不是最终配置表，但适合作为企划默认方向。

---

# 28. 与 Prompt Cache / Context Cache 的关系

Reasoning Continuity 不能与 Prompt Cache 混为一谈。

四类优化分别解决不同问题：

```text
Prompt Cache
= 不重复处理稳定前缀

Context / Retrieval Cache
= 不重复计算相同上下文

Task Artifact Reuse
= 不重复执行已完成且仍有效的工作

Reasoning Continuity
= 不让模型重新构建仍在进行的思路
```

Atria 的“稀疏 AI 调用”最终可以同时利用四者：

```text
Deterministic Runtime
      ↓
Cached / Derived Context
      ↓
Reusable Task Artifacts
      ↓
Reasoning-aware Agent
      ↓
Narrator
```

这样不仅减少模型调用次数，也减少剩余调用中的重复推理。

---

# 29. 与 Context Compaction 的关系

长期 Agent 不可能无限保存所有 Provider reasoning。

因此未来应允许：

```text
Reasoning Continuity
→ provider-native compaction / clearing
→ explicit task summary / plan artifact
→ fresh reasoning continuation
```

特别要避免：

```text
永久 opaque reasoning
+ 永久消息
+ 永久 tool history
```

三者共同无限增长。

对于 Atria，更健康的长期结构是：

```text
短期：
opaque reasoning continuation

中期：
explicit task state / plan / receipt / artifact

长期：
authoritative world state + memory + summary
```

信息越长期，就越应该从 Provider-private reasoning 状态迁移到 Atria 自己可解释、可验证的状态。

---

# 30. RP 特有风险：Reasoning Self-Anchoring

普通 Agent 追求的是：

```text
计划连续
```

RP 同时还要求：

```text
表达新鲜
人物立体
情节可转向
```

所以 RP 不能照搬 Coding Agent 的“尽可能保留全部 reasoning”。

典型失败模式：

```text
第一次：
“师尊很清冷”

内部解释：
清冷 = 克制 + 少言

第二轮：
模型把上轮输出当证据
→ 更少言

第三轮：
reasoning 再次强化
→ 极端克制

第四轮：
→ 机械 / 专业术语 / 人机感
```

这不是 Memory 的问题，而是模型自己的假设形成 feedback loop。

因此：

> **Atria 应让 Planner 保持目标连续，但让 Narrator 定期获得“重新取样”的机会。**

可以考虑未来 Eval 一种策略：

```text
Planner:
task continuity

Narrative Planner:
short-horizon continuity

Narrator:
fresh sample + explicit narrative state
```

---

# 31. 推荐的架构原则

建议把以下原则直接写进企划：

### RC-1：Opaque by default

Provider reasoning state 对 Atria Core 是不透明数据。

### RC-2：Execution State, not Domain State

Reasoning continuation 不属于权威游戏状态。

### RC-3：Path-aware

连续性能力由实际执行路径决定，不只由模型决定。

### RC-4：Revision-aware

编辑、恢复、分支、重生成必须影响 reasoning lineage。

### RC-5：Loss is observable

Fallback / Model Switch 导致 reasoning 丢失时必须可观测。

### RC-6：No raw CoT dependency

Atria 核心逻辑不得依赖 raw chain-of-thought。

### RC-7：Explicit artifacts outlive opaque reasoning

需要长期复用的知识必须转化为显式 Artifact / State。

### RC-8：Narrative freshness over maximal continuity

Narrator 不追求无限 reasoning continuity。

### RC-9：Native-first, gateway-verified

优先使用 Provider 原生 continuation；Gateway 经 probe 后才提升能力等级。

### RC-10：Adaptive lifecycle

最终目标不是永久保存，而是正确地 continue / fork / reset / discard。

---

# 32. 非目标

Atria 第一阶段不应：

1. 保存或展示 raw CoT；
2. 把 `<think>` 文本当 reasoning continuity；
3. 把 reasoning history 当 Memory；
4. 把 opaque reasoning 写进 World State；
5. 默认跨 Model Family 复用；
6. 默认跨 Branch 共享；
7. 让 Routing fallback 静默丢失 reasoning；
8. 假设 OpenAI-compatible Gateway 一定支持 continuation；
9. 把所有 Provider response 立即压平为 role/content；
10. 为了“续思考”强迫 Narrator 永久继承历史 reasoning；
11. 把 Provider 的内部状态作为 Package 可编程 API；
12. 在没有 probe / evidence 的情况下声称某条 Gateway 路径支持完整 reasoning continuity。

---

# 33. 建议写入 Atria 企划的最终结论

建议企划采用以下正式定义：

> **Reasoning Continuity 是 Atria Model Runtime 的可选执行能力，用于在兼容的模型调用、工具循环或任务阶段之间保留 Provider 原生的不透明推理状态。它与 Memory、Conversation、Prompt 和 Authoritative State 分离，由 Provider Adapter 负责协议映射，由 Runtime 根据 Task、Revision、Branch、Routing 与兼容性规则决定继续、分叉、重置或丢弃。任何因路由、模型切换或协议转换造成的 continuity loss 都必须在 Effective Execution Snapshot 中显式记录。**

建议同时写入：

> **Atria 不依赖可见或原始 Chain-of-Thought。需要跨 Provider、跨 Revision 或长期保存的推理成果，应被转换为显式、可审计的 Task Artifact、Plan、Summary、Receipt 或 Domain State，而不是继续依赖 Provider 私有 reasoning state。**

以及 RP 专用约束：

> **Reasoning Continuity 默认优先服务于 Planner、Agent、Tool Orchestration 与 State Resolution；Narrator 应采用更短的 reasoning horizon，以避免旧解释自我强化、角色标签固化和文体机械化。**

---

# 34. 对当前 Atria 大重构的优先级判断

建议优先级：**高，但第一阶段重点是“把接口和生命周期留对”，不是立刻给每家 Provider 全部实现。**

原因：

1. OpenAI、Anthropic、Gemini 已经同时进入这一方向；
2. 三家的字段不同，但抽象高度一致；
3. 一旦 Atria 先把 Provider response 全部压平成传统 messages，后面重新引入 opaque execution state 会成为破坏性重构；
4. Routing / Fallback / Revision / Branch 都天然会影响 continuation；
5. Atria 正处于 Model / Provider Runtime 大重构窗口，此时预留成本最低。

推荐顺序：

```text
架构契约
→ Execution Envelope
→ Continuation Handle
→ Snapshot / Evidence
→ OpenAI Reference
→ Anthropic
→ Gemini
→ Gateway Probe
→ Adaptive Policy
```

---

# 35. 给 Codex 并入企划时的建议

这份报告建议**不要整篇原样塞进主企划正文**。

更合理的合并方式：

## 主企划正文加入

1. `Reasoning Continuity` 的正式定义；
2. 它与 Memory / Context / Task Artifact 的边界；
3. Model Runtime / Provider Adapter 的职责；
4. Effective Execution Snapshot 扩展；
5. Revision / Branch / Routing 的生命周期规则；
6. RP Narrator 的短 horizon 原则；
7. 分阶段实施方案。

## 调研报告保留

完整 Provider 证据、差异、Gateway 风险、Eval 方案继续保留在 research 文档中。

## 如果企划已有 Model / Provider Routing Frontier Research

优先把本报告作为其中一个一级章节或配套 research 文件，而不是重新创建一套互相冲突的术语。

---

# 36. Codex 可直接使用的合并任务说明

```text
请把《Atria Reasoning Continuity / Persistent Reasoning 前沿调研报告》的架构结论并入当前 Atria 企划。

要求：

1. 不要整篇复制调研报告，而是将“已确认架构结论”融入现有模型 / Provider Routing、Agent Runtime、Task / Revision、Context Runtime 相关章节。
2. 将 Reasoning Continuity 定义为 Model / Execution Runtime 一级能力，与 Memory、Conversation、Prompt、Task Artifact、Authoritative State 明确分离。
3. 保留以下核心语义：
   - opaque Provider state
   - path-aware capability
   - Provider Adapter mapping
   - continue / fork / reset / discard
   - Revision / Branch invalidation
   - routing/fallback continuity loss
   - Effective Execution Snapshot evidence
   - native-first / gateway-verified
   - no raw CoT dependency
   - Planner 高连续性、Narrator 短 horizon
4. 不要把任何示例 TypeScript / 概念结构误写成已经定稿的 Schema。
5. 如果企划已有相近术语，以既有正式术语为主，消除重复概念，不创建平行体系。
6. Gateway 能力不得根据“OpenAI-compatible”自动推断；应保留 exact execution path / capability evidence / probe 思路。
7. 把分阶段实施建议加入实现 roadmap：
   A. Runtime contracts
   B. OpenAI Responses reference
   C. Anthropic native
   D. Gemini native
   E. Gateway probes
   F. Adaptive policy / eval
8. 更新同一份正式 Record；如果这是多阶段任务当前阶段的一部分，同时刷新 HANDOFF。
9. 不要实施代码，本轮只更新企划与必要的研究/记录文档。
```

---

# 37. 主要资料来源

## OpenAI

- Reasoning models  
  https://developers.openai.com/api/docs/guides/reasoning
- Conversation state  
  https://developers.openai.com/api/docs/guides/conversation-state
- API deployment checklist  
  https://developers.openai.com/api/docs/guides/deployment-checklist
- GPT-5 prompting guide  
  https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide

关键已核实事实：

- reasoning items opaque，不暴露 raw reasoning；
- GPT-5.6 family 支持 `all_turns`，当前文档说明其为默认；
- `previous_response_id` / Conversation / manual replay 均可提供历史 reasoning items；
- stateless / ZDR 可使用 `encrypted_content`；
- persisted reasoning 有 model-family compatibility；
- Tau-Bench Retail 官方公开例子为 73.9% → 78.2%。

## Anthropic

- Thinking  
  https://platform.claude.com/docs/en/build-with-claude/thinking
- Thinking in tool and multi-turn workflows  
  https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows
- Preserved thinking  
  https://platform.claude.com/docs/en/build-with-claude/preserved-thinking

关键已核实事实：

- thinking block 带 encrypted `signature`；
- 可见 thinking 为 summary，不是 raw CoT；
- tool use 需要把相关 assistant blocks 原样回传；
- `redacted_thinking` 也属于协议状态；
- 新 preserved-thinking 规则可绑定 model + prefix；
- system / tools / earlier messages 改变可导致旧 block invalid；
- model compatibility 可能具有方向性；
- 某些 block 具有 account binding。

## Google Gemini

- Gemini Thinking  
  https://ai.google.dev/gemini-api/docs/thinking
- Tool combination / Interactions tool context  
  https://ai.google.dev/gemini-api/docs/tool-combination

关键已核实事实：

- thought signature 是 internal reasoning state 的 encrypted representation；
- 用于 multi-turn reasoning continuity；
- Interactions stateful 模式可由 `previous_interaction_id` 自动管理；
- stateless 模式必须原样回传 thought blocks；
- Gemini 3+ 工具步骤也存在 signature/context continuity。

## OpenRouter

- Reasoning tokens / preserving reasoning  
  https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

关键已核实事实：

- OpenRouter 暴露 `reasoning_details`；
- 官方文档提供 Preserving Reasoning 流程；
- 因其路由多个模型，上层仍应把实际 route/path 纳入能力证据。

## New API

- Project README  
  https://github.com/QuantumNous/new-api
- Advanced custom adapter / converters  
  https://github.com/QuantumNous/new-api/blob/main/relay/channel/advancedcustom/adaptor.go
- API docs source  
  https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/en/guide/feature-guide/user/api.mdx

关键已核实事实：

- 同时提供 OpenAI Chat / Responses、Anthropic Messages、Gemini 等接口；
- 支持 cross-protocol conversion；
- README 明确说明能力依赖 channel / upstream / conversion path；
- protocol-specific tools / fields 不保证完整映射。

---

# 38. 最终一句话

> **Atria 应保存的不是“AI 写出来的思维链文本”，而是由 Runtime 管理、由 Provider Adapter 原样承载、具有明确兼容与失效边界的执行连续性；真正需要长期存在的知识，则必须从这种私有推理状态中“毕业”为 Atria 自己可解释、可审计、可 Revision 的正式状态或 Artifact。**