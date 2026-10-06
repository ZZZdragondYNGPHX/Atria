# Atria Execution Reuse / Cache Locality / Adaptive Invocation 前沿调研报告

- **调研日期**：2026-10-06
- **适用项目**：Atria
- **主题**：缓存命中率、Tool / Plan / Workflow 复用、Prompt Cache、Context Segment、KV Cache、Agent-aware Scheduling、Adaptive Invocation 与正文生成加速
- **关联研究**：`reasoning-continuity-research.md`
- **文档性质**：架构调研与企划输入，不是最终 API / Schema 定稿
- **核心目标**：在不牺牲正确性、Revision 隔离、RP 新鲜度与安全边界的前提下，减少重复 AI 调用、重复 Prompt Prefill、重复 Tool 执行、重复 Planning 和重复上下文处理

---

# 0. 执行摘要

本轮调研的核心结论是：

> **Atria 不应把“缓存”理解成一个简单的 `key -> value` 子系统，而应把“复用”提升为 Runtime 的一级能力。**

Atria 未来可以复用的东西至少包括：

```text
Exact Result
Semantic Result
Tool Value
Plan / Workflow
Task Artifact
Context Segment
Provider Prompt Prefix
Reasoning Continuation
Local KV State
Decode Work
```

这些对象的复用条件完全不同。

因此最适合 Atria 的长期抽象不是：

```text
CacheService
```

而更接近：

```text
Reuse Runtime
│
├── Exact Reuse
├── Semantic Reuse
├── Tool Value Reuse
├── Plan / Workflow Reuse
├── Artifact Reuse
├── Context Segment Reuse
├── Provider Prompt Cache Coordination
├── Reasoning Continuity
└── Local Inference Reuse / Acceleration
```

它们共同遵循的核心原则是：

> **Cache Hit 不是“找到了相似内容”，而是“找到了一个结果，并且 Runtime 能证明它在当前 Effective Execution Snapshot 下仍然有效”。**

这一点尤其适合 Atria 已经形成的：

- Revision
- Branch
- Authority
- Command
- Receipt
- Task
- Artifact
- Effective Execution Snapshot
- Provider / Routing
- Reasoning Continuity

体系。

---

# 1. 最值得 Atria 吸收的研究结论

本轮调研中，对 Atria 影响最大的不是某一篇论文，而是几个正在趋同的研究方向：

## 1.1 Prompt 不再应被视为一整段字符串

Prompt Cache、SGLang、RAGCache、CacheBlend、Cache-Craft、SparseX、ReCache、C²KV 都在不同层面证明：

> **上下文中大量内容具有稳定身份，可以作为模块、资源、Chunk、Segment、Prefix 或 KV Block 独立复用。**

因此 Atria 的 Context Runtime 长期应认识：

```text
ContextSegment
```

而不是只认识：

```text
string prompt
```

---

## 1.2 Tool 结果缓存必须感知状态

TVCACHE 明确展示了：

```text
tool + args
```

并不足以决定 Tool 结果是否仍然可复用。

Tool 输出还可能依赖：

- 之前的操作历史；
- 当前世界状态；
- 当前数据库状态；
- 当前时间；
- 当前权限；
- 当前 Revision。

Atria 比论文中的一般 Agent 系统有更好的基础，因为 Atria 自己掌握：

```text
Authority
Revision
Command
Receipt
State Dependency
```

因此可以构造更精细的 Tool Cache Validity。

---

## 1.3 Semantic Similarity 不是 Validity

Temporal Semantic Caching 的研究明确指出：

```text
语义相似
≠
结果仍然正确
```

一个请求即使 embedding 几乎一样：

```text
“师尊在哪里？”
“师尊现在在哪里？”
```

如果世界状态已经发生变化，旧结果也不能复用。

因此 Atria 的 Semantic Reuse 必须额外验证：

```text
Temporal Validity
Revision Validity
Dependency Validity
Authority Validity
Permission Validity
Model/Provider Validity（需要时）
```

---

## 1.4 Plan 本身是高价值复用对象

AgentReuse 表明，大量重复 Agent 开销来自：

```text
用户换一种表达
→ LLM 再做一次本质相同的规划
```

对 Atria 来说：

```text
“买三瓶恢复药”
“给我来三个小红瓶”
“购买 3 个低级治疗药水”
```

可能都可以映射到：

```text
PurchaseItem Plan Template
```

而只替换参数。

这比直接缓存最终回复更安全，也更适合 RP / 游戏 Runtime。

---

## 1.5 Cache Replacement 不应该只看 LRU

KVFlow 与 CacheScout 都说明：

> 在 Agent 工作流中，未来哪个 Agent / Stage 会再次执行，比“它上次什么时候执行”更能决定 Cache 是否值得保留。

Atria 本身已经知道：

- Task graph
- Stage
- Agent role
- Tool transition
- 下一步候选

所以未来甚至可以比通用系统更容易实现：

```text
workflow-aware cache retention
workflow-aware prefetch
```

---

## 1.6 Tool Progress 可以反向帮助模型 Serving

2026 年的 *Ask the Tool, Don't Guess* 提出：

> Tool 正在运行时，它自己最清楚完成进度；推理服务不应该猜 Tool 还要多久。

这意味着 Atria Tool Contract 中未来的：

```text
progress
remaining work
near completion
```

不只是 UI 信息，也可以成为：

```text
KV retention / offload / prefetch hint
```

这是值得预留的 Runtime 信号。

---

# 2. 研究地图

| 方向 | 代表工作 | 主要贡献 | Atria 价值 |
|---|---|---|---|
| Prompt 模块缓存 | Prompt Cache | 把重复 Prompt 片段定义为可缓存模块 | ★★★★★ |
| Prefix Tree | SGLang / RadixAttention | 自动复用共享 Prefix KV | ★★★★★ |
| RAG Knowledge Cache | RAGCache | 多级缓存检索知识中间状态 | ★★★★☆ |
| KV 传输压缩 | CacheGen | 压缩和流式加载 KV | ★★★☆☆ |
| 非 Prefix KV 复用 | CacheBlend | 融合独立 Chunk KV + 选择性重算 | ★★★★☆ |
| Chunk KV Cache | Cache-Craft | 任意位置 Chunk KV 复用 | ★★★★★ |
| Tool Schema KV | ReCache | 工具/Skill Schema 组合无关缓存 | ★★★★★ |
| Segment KV | SparseX | Cross-request / cross-turn / cross-agent Segment 复用 | ★★★★☆ |
| 可组合压缩 KV | C²KV | Position-agnostic + compressed KV | ★★★★☆ |
| Position-independent KV | SemPIC | 学习语义稳定的独立 Chunk KV | ★★★☆☆ |
| Workflow-aware Cache | KVFlow | 根据 Agent Graph 驱逐和预取 KV | ★★★★★ |
| Learned Cache Scheduling | CacheScout | 在线学习 Agent transition | ★★★★★ |
| Stateful Tool Cache | TVCACHE | 工具历史感知的结果缓存 | ★★★★★ |
| Temporal Semantic Cache | Merchant et al. | 时间/实体参数感知语义缓存 | ★★★★★ |
| Plan Reuse | AgentReuse | Intent + Semantic Plan 复用 | ★★★★★ |
| Tool Progress Scheduling | Ask the Tool | Tool 进度指导 KV 保留/预取 | ★★★★☆ |
| Dynamic Model Routing | RouteLLM | 强/弱模型动态路由 | ★★★★☆ |
| Adaptive Retrieval | Adaptive-RAG | 按问题复杂度选择无/单/多步检索 | ★★★★☆ |
| Decode Acceleration | EAGLE-3 | Speculative Decoding | ★★★★☆（Local） |
| Decode Acceleration | Medusa | 多 decoding heads | ★★★☆☆（Local） |
| Distributed KV | Mooncake | KV-centric 分布式 Serving | ★★★☆☆（规模化） |
| KV Security | HijackKV | 揭示 Position-independent KV 污染攻击 | ★★★★★（安全边界） |

---

# 3. Prompt Cache：Atria 今天就能利用的能力

这一层不要求 Atria 自托管模型。

OpenAI、Anthropic、Gemini 当前都已经提供不同形式的 Prompt / Context Cache。

---

# 4. OpenAI 当前 Prompt Cache 对 Atria 的直接意义

OpenAI 当前 Prompt Caching 文档已经从过去的“隐式缓存”进一步发展为：

- implicit caching；
- explicit breakpoints；
- cache TTL；
- cache prewarm；
- cache diagnostics；
- cached token telemetry。

截至 2026-10-06，GPT-5.6 及以后模型：

- 最低可缓存可见输入长度为 1,024 tokens；
- 支持显式 cache breakpoints；
- 支持 `prompt_cache_options.prewarm`；
- 可以最多创建多个明确缓存边界；
- 缓存查找以相同 rendered prefix 为核心；
- tool schema / ordering、output schema、reasoning settings 等变化可能改变缓存前缀。

因此 Atria 不应该只是：

```text
“希望 Provider 自己命中缓存”
```

而应该主动拥有：

```text
Cache-aware Prompt Compiler
```

---

# 5. Anthropic：Tool Definitions 是 Cache Prefix 的一级组成

Anthropic 当前工具缓存文档明确采用：

```text
tools → system → messages
```

的缓存层级。

工具定义变化会导致整个后续 prefix 失效。

而 `defer_loading` 的设计尤其值得 Atria 借鉴：

> 动态发现的工具不进入初始 Tool Prefix，而是在需要时通过引用进入历史，从而避免 Tool Set 动态变化破坏 Prompt Cache。

这说明：

> **Tool Discovery 与 Tool Schema Injection 应是两个不同阶段。**

未来 Atria 可以把：

```text
Available Tool Registry
```

与：

```text
Loaded Tool Schema Set
```

分离。

Planner 只在需要时加载较少的 Tool Resource。

这同时提高：

- Token 效率；
- Prompt Cache 命中率；
- Tool Selection 精度。

---

# 6. Gemini：Common Prefix 仍然是最基础的 Cache Locality

Gemini 当前 Interactions API 对 2.5+ 模型自动启用 implicit context caching。

官方建议仍然是：

```text
large common contents first
dynamic contents later
```

Interactions API 目前只提供隐式缓存，而旧的 GenerateContent 路径仍支持显式 cache object。

这说明 Atria Provider Adapter 应表达：

```text
PromptCacheCapability
├── none
├── implicit
├── explicit_breakpoints
├── explicit_cache_object
├── prewarm
└── telemetry
```

不能假设不同 Provider 的 Cache Control 一样。

---

# 7. Cache-Aware Prompt Compiler

这是本报告对 Atria 最直接的架构建议之一。

未来 Prompt 不应由各模块任意 append string，而应先形成稳定结构：

```text
Context Segment Graph
      ↓
Canonical Ordering
      ↓
Provider-specific Compilation
      ↓
Provider Request
```

推荐逻辑顺序：

```text
① Provider-stable
   Tool protocol
   Tool definitions
   Structured-output protocol

② Atria-stable
   System contract
   Runtime contract
   Authority rules

③ Package-stable
   Character definition
   Static lore
   Package rules

④ Session-slow
   Long-term summary
   Stable memory
   Scene contract

⑤ Revision-sensitive
   Current world projection
   Current character state
   Active quest / task state

⑥ Retrieval-sensitive
   Retrieved lore
   Retrieved memory
   Tool outputs

⑦ Turn-sensitive
   Player input
   Immediate transient instructions
```

核心规则：

> **越稳定、越常复用的 Segment 越靠前；变化越频繁的内容越靠后。**

---

# 8. Deterministic Serialization 是 Cache Hit 的基础设施

语义相同不代表 token 相同。

例如 Tool Schema：

```json
{"name":"query","description":"...","parameters":{"type":"object"}}
```

和不同：

- JSON key 顺序；
- 空白；
- description 格式；
- tool ordering；
- optional field；
- generated timestamp；

都可能破坏 Provider Prefix Cache。

因此 Atria 应有：

```text
Canonical Serializer
```

至少用于：

- Tool Schema
- Structured Output Schema
- System Contracts
- Context Segment rendering

原则：

```text
same semantic object
→ same serialized bytes/tokens where provider permits
```

不要把无意义动态内容放入稳定前缀：

```text
current timestamp
random UUID
request ID
debug marker
volatile counters
```

这些应该放在动态 suffix 或 transport metadata。

---

# 9. Prompt Segment 不应只是文本

建议 Context Runtime 长期采用类似概念：

```text
ContextSegment
├── segmentId
├── semanticType
├── content
├── contentHash
├── canonicalVersion
├── scope
├── dependencies
├── volatility
├── sensitivity
├── cacheability
├── revisionBinding
└── providerHints
```

注意：

这不是建议现在就锁死这些字段，而是建议正式企划保留：

> **上下文具有稳定身份、版本、依赖和变化频率。**

这样同一个上层模型可以映射到：

```text
OpenAI Prefix Breakpoint
Anthropic Cache Control
Gemini Cached Context
Local KV Segment
RAG Chunk Cache
```

而无需让 Package 理解 Provider 缓存实现。

---

# 10. Prompt Cache 的第一原则：不要为了缓存污染语义

不能为了让 Stable Prefix 更长，就随意塞：

- 无关 Few-shot；
- 无用世界书；
- 重复规则；
- 填充文本。

OpenAI 当前甚至明确提醒存在 minimum-cacheable-length cost trap：

> 为了达到最低缓存长度而增加内容，必须评估额外输入成本是否值得。

Atria 应遵循：

```text
Semantic Utility
优先于
Cache Length
```

Cache-aware Prompt Compiler 可以重排稳定信息，但不能为了命中率引入不相关信息。

---

# 11. Tool Value Cache：TVCACHE 对 Atria 的启发

TVCACHE 研究 Agent 中反复 Tool 调用的问题。

论文核心发现：

> 相同 Tool + 参数，在不同环境状态下可能有不同结果。

因此它维护 Tool-call sequence tree，只在完整历史前缀匹配时复用结果。

ICML 2026 正式版本报告：

- Cache hit rate 最高约 67%；
- Median tool call execution time 最高降低 6.9×；
- 未降低 post-training reward。

Atria 不需要照搬“完整 Tool 历史匹配”。

因为 Atria 自己掌握更精确的状态依赖。

---

# 12. Atria 可以做得比 TVCACHE 更精细

例如：

```text
tool: get_character_hp
args: { characterId: "shizun" }
```

它真正依赖的可能只是：

```text
character/shizun/health
```

而不是整个 World State。

所以可以定义：

```text
ToolResult
├── value
├── dependencySet
├── stateRevision
├── authority
└── validity
```

如果中间发生：

```text
天气变化
NPC B 移动
商店库存变化
```

但：

```text
shizun.health
```

没变化，

那么这个 Tool Result 仍然可以命中。

这比：

```text
World Revision 一变化
→ 清空所有缓存
```

高效很多。

---

# 13. Dependency-Aware Cache Validation

这是建议写进 Atria 企划的核心概念。

Cache Entry 应声明：

```text
dependsOn
```

例如：

```text
GetInventory(player)
dependsOn:
  player.inventory
```

```text
GetShopPrice(item)
dependsOn:
  shop.priceTable
  player.reputation
  currentPromotion
```

```text
GetCharacterLocation(character)
dependsOn:
  character.location
```

于是 Cache Validation 可以是：

```text
dependency versions unchanged
→ reusable
```

而不是：

```text
whole revision unchanged
→ reusable
```

这可以显著提高 World Runtime 中的缓存命中率。

---

# 14. Purity 与 Side Effect 必须参与缓存

Tool 不能只按 Query / Command 分类。

至少要区分：

```text
Pure Read
Deterministic Read
Time-sensitive Read
External Read
Idempotent Mutation
Non-idempotent Mutation
Side-effectful Action
```

例如：

```text
get_inventory
```

可以缓存。

但：

```text
purchase_item
```

绝对不能因为输入一样就直接“命中旧 Tool Result”，否则可能跳过真正的状态变更。

因此 Reuse Contract 必须声明：

```text
purity
sideEffects
replaySafety
```

---

# 15. Temporal Semantic Cache：Semantic Hit 需要 Validity Gate

2026 年的 Temporal Semantic Caching 工作明确指出：

传统 Semantic Cache：

```text
embedding similarity > threshold
→ reuse
```

对于时间、设备、实体、传感器参数敏感的 Agent 查询会产生错误。

论文报告：

- Temporal cache 命中时 median speedup 30.6×；
- MCP workflow optimization 约 1.67×；
- median end-to-end latency 降低约 40%。

对 Atria 来说，核心不是这些数字，而是判断逻辑。

---

# 16. Atria 的 Semantic Reuse 应采用两阶段判定

建议：

```text
Stage A — Candidate Match
Exact / Intent / Embedding / Structural similarity

Stage B — Validity Proof
Revision
Time
Dependencies
Authority
Permissions
Scope
Provider / Model（需要时）
```

只有：

```text
Candidate Match == true
AND
Validity Proof == true
```

才是真正的：

```text
Reuse Hit
```

---

# 17. 语义相似不能越过世界状态

例如：

```text
Turn 10:
“师尊在哪里？”
→ 后山

Turn 18:
“师尊现在在哪？”
```

语义：

```text
≈ same
```

但如果：

```text
character.location version changed
```

则必须 miss。

因此：

```text
Embedding Similarity
```

只能负责：

> 找候选。

不能负责：

> 证明正确。

---

# 18. AgentReuse：不要每次都重新规划

AgentReuse 的真实数据分析发现，大约 30% 请求具有相同或相近意图。

它使用：

- intent classification；
- semantic similarity；

判断是否复用已有 Plan。

实验报告：

- 93% effective plan reuse rate；
- F1 0.9718；
- request-similarity accuracy 0.9459；
- planning latency 相比无复用基线降低 93.12%。

这对 Atria 的意义非常大。

---

# 19. Atria 不应该缓存 Plan Text，而应缓存 Plan Template / Workflow

不要缓存：

```text
“首先查询商店，然后检查余额，然后……”
```

这种自然语言计划。

更适合：

```text
WorkflowTemplate: PurchaseItem
├── resolveItem
├── resolveQuantity
├── queryPrice
├── checkFunds
├── proposeCommand
├── executeAuthority
└── inspectReceipt
```

然后通过参数：

```text
item
quantity
buyer
shop
```

实例化。

这能避免：

- 旧实体残留；
- 旧 ID 污染；
- 旧价格污染；
- 文本计划不可验证。

---

# 20. Plan Reuse 的安全边界

Plan 本身可以复用，但执行前必须重新验证：

```text
Preconditions
Capabilities
Permissions
Required tools
Authority
State assumptions
```

例如：

```text
PurchaseItem
```

计划可以复用。

但不能复用：

```text
“玩家余额足够”
```

这种上一次执行的事实。

因此应该：

```text
Plan Structure
→ reusable

Plan Assumptions / Resolved Values
→ revision-bound
```

---

# 21. ReCache：Tool / Skill Schema 应成为稳定 Resource

ReCache 研究 Tool-augmented Agent 中一种很现实的问题：

> 相同的 Tool / Skill Schema 会在不同请求中反复出现，但顺序和组合不同，因此传统 Prefix Cache 难以复用。

它通过 Resource-wise Attention 与独立 Resource 表示，让 Tool / Skill Schema 的 KV 更接近组合无关。

论文报告：

- Resource-wise attention 的 invocation F1：82.3% vs dense 82.4%；
- TTFT speedup 3.655×；
- 完整方案 KV tensor memory 降低 92.43%。

这种底层算法需要模型 / Serving 支持，但它给 Atria 上层一个明确启发：

> **Tool 和 Skill 必须拥有稳定 Resource Identity。**

---

# 22. 建议的 Tool Resource Identity

概念上：

```text
ToolResource
├── resourceId
├── schemaVersion
├── canonicalSchema
├── capabilityTags
├── permissionContract
├── cacheIdentity
└── lifecycle
```

这样：

```text
tool order changed
```

不代表 Atria 自己认为这是一个全新的工具。

Provider Prefix Cache 可能仍受顺序影响，但：

- Plan Cache；
- Tool Discovery Cache；
- Local ReCache-like Runtime；
- Capability Probe；

都可以基于稳定 Resource ID。

---

# 23. RAGCache / CacheBlend / Cache-Craft：Retrieved Context 也应该有稳定身份

RAG 系统常出现：

```text
Question A
→ retrieve Chunk X, Y, Z

Question B
→ retrieve Chunk Y, X, W
```

传统 Prefix Cache 很难命中。

但 Chunk 本身是重复的。

RAGCache：

- 使用 knowledge tree；
- 在 GPU / host memory 多级缓存知识中间状态；
- TTFT 最高降低约 4×；
- throughput 最高约 2.1×。

CacheBlend：

- 允许把独立预计算的 Chunk KV 融合；
- 选择性重算一部分 token 恢复跨 Chunk 上下文；
- TTFT 2.2–3.3× improvement；
- throughput 2.8–5× improvement。

Cache-Craft：

- 为独立 RAG Chunk 维护 chunk-cache；
- 评估是否能复用；
- 对需要的部分选择性重算；
- 相比 Prefix Cache 减少 51% redundant computation；
- production workload 中 1.6× throughput；
- end-to-end latency 约降低 2×。

---

# 24. 这对 Atria Memory / Lore / World Knowledge 很重要

Atria 常见 Context Segment：

```text
Character Lore
World Book Entry
Long-term Memory
Location Description
Quest Context
Faction Rules
Historical Event
Retrieved Conversation Memory
```

它们天然拥有：

```text
stable identity
content version
```

因此建议：

```text
KnowledgeSegment
├── segmentId
├── version
├── contentHash
├── source
├── dependencies
└── scope
```

今天它可以帮助：

```text
Context Assembly
Prompt Prefix Stability
Retrieval Cache
Deduplication
```

未来 Local Runtime 可以映射到：

```text
Chunk KV Cache
Segment KV Cache
Position-independent Cache
```

---

# 25. SparseX：跨 Turn / Agent 的 Segment Reuse

SparseX 明确瞄准：

- non-prefix；
- cross-request；
- cross-turn；
- cross-agent；

这些真实 Serving 场景。

它说明未来 Local Atria Runtime 不必限制为：

```text
只有 Prompt 开头可以复用
```

而可以发展到：

```text
任意稳定 Context Segment
→ KV reuse candidate
```

因此 Atria 上层不应把 Cache Identity 与“Prompt 位置”绑定。

位置是 Provider / Serving Backend 的实现问题。

---

# 26. C²KV：Context Segment Graph 的未来形态

C²KV 尝试学习：

```text
position-agnostic
compressed
composable
```

的 KV 表示。

其论文报告长上下文场景最高约 17× inference speedup。

这种方案需要专门训练的 Extractor / Serving Runtime，因此不适合第一阶段直接实现。

但它强化了一个架构判断：

> **Atria 的上层 Context Segment Identity 应与最终 Prompt 位置解耦。**

今天：

```text
Segment → Text
```

未来可能：

```text
Segment → Cached KV Representation
```

无需改变 Package 或 Agent 的语义层。

---

# 27. SemPIC：Position-independent Cache 仍然是开放研究问题

SemPIC 进一步研究：

> 独立编译的 Document KV 缺少未来上下文，直接 Position-independent reuse 仍然有质量差距。

它通过训练 Writer 生成更稳定的 KV 表示，并让 Reader 保持不变。

这提醒 Atria：

> 不要把未来的“非 Prefix KV 复用”当成完全透明、无风险的优化。

Provider / Backend 必须声明：

```text
quality mode
recompute policy
compatibility
```

Atria Core 不能假设任意 Segment KV 拼接都保持语义等价。

---

# 28. HijackKV：非 Prefix Cache 引入新的安全边界

2026 USENIX Security 的 HijackKV 指出：

> Position-independent KV Cache 可能携带它生成时的恶意上下文，即使之后复用的文本本身看起来完全无害。

论文展示的攻击：

```text
Attacker-controlled Prefix
      ↓
Benign-looking reusable text
      ↓
Contaminated KV
      ↓
Victim later reuses same text
      ↓
Model behavior silently hijacked
```

这对 Atria 非常重要。

如果未来实现：

```text
cross-user
cross-package
cross-session
position-independent KV reuse
```

则必须有严格 Trust Boundary。

---

# 29. Atria KV Cache 安全原则

建议企划预留：

```text
Cache Trust Domain
```

默认隔离至少考虑：

- User
- Account
- Workspace
- Package
- Session
- Provider
- Model
- Safety policy
- Tool permission domain

推荐原则：

```text
cross-user KV reuse
→ default deny

cross-package KV reuse
→ default deny unless content is trusted immutable public resource

user-controlled segment
→ never promote to shared trusted KV without safe recomputation / verification
```

Cache 命中率不能高于隔离边界。

---

# 30. KVFlow：从 LRU 到 Workflow-aware Cache

KVFlow 的核心问题：

传统 Serving：

```text
LRU
→ 谁最久没用就丢谁
```

但 Agent Workflow 明明知道：

```text
Agent B 下一步马上还会执行
```

于是 LRU 很可能刚把 B 的 Prefix KV 丢掉。

KVFlow 使用 Agent Step Graph 计算：

```text
steps-to-execution
```

指导：

- eviction；
- CPU → GPU prefetch。

论文报告：

- 单 Workflow 大 Prompt 场景最高 1.83×；
- 多并发 Workflow 最高 2.19×；
- 相比 SGLang hierarchical radix cache。

---

# 31. Atria 已经天然拥有 Workflow Signal

Atria 不需要从 Token 猜下一步。

Task Runtime 可以知道：

```text
currentStage
possibleNextStages
activeAgent
candidateTools
dependency graph
```

因此未来可发出：

```text
ExecutionLocalityHint
```

例如：

```text
likelyNext:
  - state-resolver
  - narrator

unlikely:
  - research-agent
```

Local Serving Backend 可以：

```text
保留 state-resolver KV
预取 narrator KV
驱逐 research-agent KV
```

---

# 32. CacheScout：没有静态 Workflow Graph 也可以学习

CacheScout 在线学习：

```text
Agent A → Agent B
Agent B → Agent C
...
```

并根据 transition：

- 决定 eviction；
- 提前 prefetch。

论文报告：

- KV cache hit rate +10–18 percentage points；
- mean TTFT -18–45%；
- per-turn latency -29–38%；
- peak throughput +57%。

对 Atria 来说，CacheScout 更像：

> **在显式 Task Graph 不完整时的 fallback 学习层。**

理想情况：

```text
Explicit Workflow Hint
+
Observed Transition Statistics
```

组合使用。

---

# 33. Ask the Tool, Don't Guess：Tool Progress 是 Serving Signal

Agent 调 Tool 时：

```text
LLM
→ Tool
→ 等待
→ LLM
```

等待期间 KV Cache 是否继续占 GPU，是重要调度决策。

*Ask the Tool, Don't Guess* 发现：

Tool 自己报告的 progress 比调用前预测 Tool Duration 更可靠。

将 Tool Progress 接入 Serving 后：

- p90 post-tool TTFT 相比 LRU 降低约 20.7%（HBM）；
- HBM + DRAM 情况约 20.8%。

因此 Atria Tool Runtime 应考虑标准化：

```text
ToolProgress
├── fraction?
├── phase?
├── nearCompletion?
├── estimatedRemaining?
└── canPause?
```

即使第一阶段只用于 UI，未来也可以给 Local Serving Scheduler。

---

# 34. SGLang：Runtime-aware LLM Program Execution

SGLang / RadixAttention 提供了一个重要系统层参照：

> 多轮 Chat、Agent Control、RAG、Few-shot 等应用本质上可以共享大量 Prefix Tree。

RadixAttention 利用 radix tree：

```text
shared prefix
→ shared KV
```

SGLang 在多类任务上报告最高约 6.4× throughput。

Atria 如果未来自带 Local Model Runtime，不应从零设计 KV Manager。

更现实的方向是：

```text
Atria Local Inference Adapter
→ vLLM / SGLang / compatible backend
```

Atria 提供：

- Segment Identity；
- Workflow Hint；
- Cache Policy；
- Provider Capability；

底层 Serving 引擎负责实际 KV。

---

# 35. CacheGen / Mooncake：KV Cache 本身也会变成数据层

如果 Context 很长，问题不只是“能不能复用”，还包括：

```text
KV 太大
→ GPU 放不下
→ 网络传输慢
→ CPU / SSD 调度成本高
```

CacheGen：

- KV 压缩 3.5–4.3×；
- context loading delay 3.2–3.7× 改善。

Mooncake：

- 把 KV Cache 视为核心存储资源；
- 分离 Prefill 与 Decode；
- 使用 GPU / CPU / DRAM / SSD 等分层资源；
- 是 Kimi 大规模生产 Serving 的代表。

这属于 Atria 未来“自托管 / 服务端 Runtime”阶段，而不是桌面应用第一阶段。

但上层接口应该避免阻止这种演进。

---

# 36. Provider API 与 Local Runtime 必须分层

这是企划中必须写清楚的边界。

## Provider API 模式

Atria 能控制：

```text
Prompt Layout
Deterministic Serialization
Explicit Cache Breakpoints
Prewarm
Cache Key / TTL（Provider 支持时）
Tool Set Stability
Conversation Append-only
Semantic / Tool / Plan Cache
```

但 Atria 不能直接操作 Provider GPU 内：

```text
KV Block
KV eviction
KV prefetch
Speculative decoding
PagedAttention
```

---

## Local / Self-hosted 模式

Atria 可以进一步控制：

```text
KV Cache
Segment Reuse
Prefix Tree
Eviction
Prefetch
CPU/GPU Tiering
KV Compression
Speculative Decoding
```

因此 Capability 模型要区分：

```text
Application Reuse Capability
Provider Cache Capability
Inference Backend Capability
```

---

# 37. 不要为了统一接口假装所有缓存都一样

错误抽象：

```text
cache.get(key)
```

不能完整表达：

```text
OpenAI Prompt Prefix Cache
TVCACHE Tool Value
Plan Template
Reasoning Continuation
Local KV Segment
```

它们的：

- Identity
- Validity
- Side Effects
- Trust
- Lifetime
- Scope

完全不同。

更合理的是统一：

```text
Reuse Contract
```

而不是统一底层存储。

---

# 38. 建议的 ReuseContract

以下是概念模型，不是最终 Schema：

```text
ReuseContract
├── artifactType
├── identity
├── inputFingerprint
├── semanticIntent?
├── scope
├── dependencies
├── authority
├── revisionBinding
├── temporalValidity
├── purity
├── sideEffects
├── permissionScope
├── providerBinding?
├── modelBinding?
├── trustDomain
├── freshness
├── invalidationPolicy
└── provenance
```

Runtime 用它回答：

> 这份东西在当前执行环境下为什么可以复用？

---

# 39. Reuse 应有 Evidence

不能只有：

```text
cacheHit = true
```

建议 Execution Snapshot 记录：

```text
ReuseDecision
├── requested
├── candidateFound
├── reused
├── reuseType
├── sourceArtifact
├── validityChecks
├── invalidationReason
├── savedCalls
├── savedTokens
├── savedToolExecutions
└── latencySavedEstimate?
```

这能让 Atria 真正评估：

> 哪一层优化最值钱？

---

# 40. 建议的 Reuse 类型

Atria 可以先用语义分类，不必一次全部实现：

```text
EXACT
SEMANTIC
TOOL_VALUE
PLAN
WORKFLOW
TASK_ARTIFACT
CONTEXT_SEGMENT
PROVIDER_PREFIX
REASONING_CONTINUATION
LOCAL_KV
DECODE
```

---

# 41. Reasoning Continuity 与 Reuse Runtime 的关系

已有 Reasoning Continuity 研究应保留独立语义。

它可以被看作 Reuse Runtime 的一个特殊分支：

```text
Reuse Runtime
└── Execution Continuation
    └── Reasoning Continuity
```

但不要把它当：

```text
普通 Cache Entry
```

因为 reasoning state 可能绑定：

- Provider；
- Model family；
- Prompt Prefix；
- Account；
- Tool schema；
- History shape。

所以：

```text
Reasoning Continuation
→ Resume

Task Artifact
→ Reuse
```

仍需要明确区分。

---

# 42. 正文最终输出不适合普通 Semantic Cache

对 RP 来说，最危险的优化之一是：

```text
用户输入相似
→ 直接返回旧正文
```

例如：

```text
“抱住师尊”
```

和：

```text
“从背后轻轻抱住师尊”
```

如果直接缓存 Final Prose，会导致：

- 重复；
- 当前状态不一致；
- 情绪发展陈旧；
- 玩家细节被抹掉；
- 文体缺乏新鲜感；
- RP 逐渐像模板机。

因此建议：

```text
Final Narrative Response
→ default non-reusable
```

---

# 43. 正文应该复用“生成前的东西”

正文链中适合复用的是：

```text
World Facts            ✅
Retrieved Lore         ✅
Character Facts        ✅
Stable Style Contract  ✅
Narrative Constraints  ✅
Plan / Narrative Intent✅
Context Segments       ✅
Prompt Prefix          ✅
Reasoning Continuity   ✅ 短期
Final Prose            ❌ 默认
```

也就是说：

> **缓存应该尽量停在创造性采样之前。**

这和前一份 Reasoning Continuity 报告中：

> Planner 连续、Narrator 保持短 horizon / fresh sample

完全一致。

---

# 44. Narrative Intent 可以成为高价值中间 Artifact

例如：

```text
NarrativeIntent
├── sceneGoal
├── actorIntent
├── emotionalBeat
├── worldFacts
├── forbiddenContradictions
├── consequences
└── unresolvedHooks
```

如果用户只是：

```text
重新生成正文
```

但：

- 当前 Revision 没变；
- Scene Goal 没变；
- Narrative Constraints 没变；

可以复用 Narrative Intent，然后重新采样 Narrator。

这样可以：

```text
不重新做完整 Planner
+
仍得到新的正文
```

对 RP 特别适合。

---

# 45. RouteLLM：最便宜的缓存是“不调用贵模型”

RouteLLM 研究：

```text
同一个请求
→ 强模型？
→ 弱模型？
```

通过 Router 根据请求选择更适合的模型。

论文在部分实验中实现：

- 成本降低超过 2×；
- 同时尽量保持质量。

对 Atria 来说，这应该与 Cache / Reuse 一起考虑。

例如：

```text
Reuse Hit
→ 不调用

Reuse Miss + Simple
→ cheap / fast model

Reuse Miss + Complex
→ strong reasoning model
```

---

# 46. Adaptive-RAG：最便宜的检索也是“不检索”

Adaptive-RAG 根据问题复杂度选择：

```text
No Retrieval
Single-step Retrieval
Multi-step Retrieval
```

这给 Atria 一个重要原则：

> Tool / Retrieval Runtime 不应该因为“有能力调用”就每轮调用。

最终流程应该是：

```text
Can Reuse?
  ↓ no
Need Tool?
  ↓ yes/no
Need Retrieval?
  ↓ yes/no
Need LLM?
  ↓ yes
Which Model?
```

这比单纯优化 Cache 更有效。

---

# 47. 建议的 Sparse AI Invocation Decision Ladder

结合已有 sparse-ai-invocation 调研，Atria 可以形成：

```text
1. Deterministic Runtime can answer?
   → use Runtime

2. Valid reusable Artifact exists?
   → reuse

3. Valid Tool Value exists?
   → reuse

4. Reusable Plan / Workflow exists?
   → instantiate

5. Cheap deterministic Tool can answer?
   → call Tool

6. Retrieval really needed?
   → retrieve adaptively

7. Small/Fast model sufficient?
   → route

8. Strong reasoning required?
   → invoke

9. Narration required?
   → fresh narrative generation
```

这是一套比“所有东西都丢给 LLM”更适合 Atria 的执行策略。

---

# 48. Local Narrator 的 Decode Acceleration

正文生成与 Planning 不同。

Narrator 的成本经常主要在：

```text
autoregressive decode
```

而不是只有 Prefill。

如果未来 Atria 支持 Local Model：

## EAGLE-3

- speculative decoding；
- 论文报告最高约 6.5× speedup；
- SGLang 中 batch 64 throughput 约 +1.38×。

## Medusa

- 给目标模型增加多个 decoding heads；
- 并行预测后续 Token；
- ICML 正式结果中 Medusa-1 超过 2.2×；
- Medusa-2 约 2.3–2.8×。

因此正文性能优化：

```text
Cloud API
→ Provider handles decode

Local Runtime
→ DecodingAccelerationCapability
```

Atria 上层不应该绑定到：

```text
EAGLE
Medusa
```

具体算法。

---

# 49. 建议增加 DecodingAccelerationCapability

概念：

```text
DecodingAccelerationCapability
├── none
├── speculative
├── multi_head
├── provider_native
└── backend_defined
```

Package / Narrator 不关心具体算法。

Runtime 只需要知道：

```text
是否可用
质量是否 lossless / approximate
与采样参数是否兼容
```

---

# 50. Cache Locality 也应该进入 Routing

如果两个 Endpoint：

```text
Endpoint A
→ 更便宜，但无已有 cache

Endpoint B
→ 略贵，但已有 30k token prefix cache
```

简单 price routing 可能选错。

长期 Routing Cost 应考虑：

```text
raw token price
+
cache read/write cost
+
expected cache hit
+
reasoning continuity loss
+
tool locality
+
network latency
```

这意味着：

> **Provider Routing 与 Cache Routing 最终不能完全独立。**

---

# 51. Effective Execution Snapshot 应记录 Cache / Reuse

建议扩展语义：

```text
EffectiveExecutionSnapshot
├── model / endpoint / route
├── prompt layout version
├── context segment identities
├── provider cache mode
├── cache breakpoints
├── prewarm state
├── provider cached tokens
├── reuse decisions
├── plan reuse
├── tool-value reuse
├── artifact reuse
├── reasoning continuation
├── local KV hit/miss（若可见）
└── cache loss / invalidation reasons
```

---

# 52. Cache Hit Reason 与 Miss Reason 都应该可观测

建议常见命中原因：

```text
exact_identity
semantic_validated
dependencies_unchanged
same_revision_scope
provider_prefix_hit
reasoning_continued
```

常见 miss：

```text
not_found
expired
dependency_changed
revision_changed
permission_changed
authority_changed
provider_changed
model_changed
prefix_changed
tool_schema_changed
trust_domain_mismatch
semantic_match_but_invalid
manual_bypass
```

只有这样才能真正调优命中率。

---

# 53. Cache Hit Rate 不是唯一 KPI

纯追求：

```text
hit rate ↑
```

可能产生错误结果。

Atria 应同时看：

```text
Reuse Precision
```

即：

> 复用的结果有多少是真的仍然有效？

推荐指标：

```text
hit rate
valid hit rate
false reuse rate
saved LLM calls
saved tool calls
cached input tokens
TTFT
end-to-end latency
cost
quality regression
state correctness
branch contamination
```

---

# 54. Reuse Precision 应优先于 Hit Rate

对于游戏 Runtime：

```text
错误复用一次
```

可能意味着：

- 金币错误；
- 库存错误；
- NPC 位置错误；
- Quest 状态错误；
- Branch 污染。

所以：

```text
Reuse Precision
>
Raw Hit Rate
```

---

# 55. Cache Prewarm

OpenAI 已经提供官方 `prewarm` 能力。

Atria 可以在明确可预测场景使用：

```text
打开角色 / Package
→ prewarm stable prompt

切换场景
→ prewarm scene-static context

Task 即将进入 Narrator
→ Local backend prefetch narrator prefix
```

但要注意：

- Prewarm 本身可能收费；
- 只有高概率马上复用时才值得；
- 不应对所有可能场景盲目 prewarm。

因此可以建：

```text
Prewarm Policy
```

而不是无条件使用。

---

# 56. Cache-aware Tool Discovery

Tool Definitions 经常很大。

建议未来流程：

```text
Tool Registry
     ↓
Capability Index
     ↓
Planner sees compact descriptors
     ↓
Select candidate tools
     ↓
Load full schemas only when needed
```

这能同时提高：

- Prompt Cache 稳定性；
- Token 效率；
- Tool Selection；
- Tool Schema Reuse。

Anthropic 的 `defer_loading` 已经证明这一思路具有现实 API 价值。

---

# 57. Tool Discovery Cache

Tool Discovery 本身也是可复用对象。

例如：

```text
intent:
inventory query
```

反复需要：

```text
state.inventory.read
```

可以缓存：

```text
Intent / Capability
→ Candidate Tool Resources
```

但仍应验证：

- 当前工具是否启用；
- 权限是否变化；
- Package 是否变化；
- Runtime capability 是否变化。

---

# 58. Workflow Cache

比 Plan Cache 更进一步：

如果某类任务总是：

```text
Resolve Intent
→ Query State
→ Validate Rule
→ Execute Command
→ Narrate Receipt
```

则可以把这一结构做成 Runtime Workflow。

LLM 不需要每次发明控制流。

它只负责：

```text
参数化
选择分支
处理真正不确定部分
```

这和 Atria Native Runtime 的方向高度一致。

---

# 59. Exact Reuse / Semantic Reuse / Structural Reuse 必须分开

建议明确三层：

## Exact

```text
inputFingerprint identical
```

最可靠。

## Structural

```text
same intent / same workflow
different arguments
```

适合 Plan / Workflow。

## Semantic

```text
natural-language meaning similar
```

最灵活，但风险最高。

越靠后，Validity Gate 应越严格。

---

# 60. Cache 生命周期

建议：

```text
Request
Turn
Task
Scene
Session
Branch
Package
Workspace
Account
Global
```

不是所有东西都应该长寿。

例如：

```text
Tool query result
→ Revision / dependency scope

Plan template
→ Package / Runtime version scope

Narrative intent
→ Turn / Revision scope

Static lore segment
→ Package version scope

Provider KV
→ Provider-defined TTL

Reasoning continuation
→ Task / execution lineage
```

---

# 61. Branch 隔离

Branch 是缓存最容易污染的地方之一。

原则：

```text
shared ancestor artifact
→ may be reused

post-fork state-dependent artifact
→ branch-local
```

如果缓存依赖：

```text
World State after fork
```

则 Branch A 不能给 Branch B。

---

# 62. Regenerate

重新生成正文：

```text
World / Revision same
Narrative Intent same
```

时：

可复用：

```text
retrieval
facts
plan
narrative intent
stable prefix
```

但默认：

```text
final prose → regenerate fresh
reasoning → reset / short fork depending policy
```

这能同时降低成本和保持正文新鲜。

---

# 63. Edit Earlier Message

如果用户编辑旧消息：

所有依赖该历史的对象都需要失效传播：

```text
Conversation-derived Summary
Narrative Intent
Plan
Reasoning Continuation
Context Cache
Tool Result（若依赖相关状态）
```

但不必清空所有无关 Cache。

Dependency Graph 应负责：

```text
targeted invalidation
```

---

# 64. Cache Invalidation 应成为 Graph 问题

推荐理解：

```text
Artifact A
dependsOn State X

Artifact B
dependsOn Artifact A

Artifact C
dependsOn State Y
```

当：

```text
State X changes
```

失效：

```text
A
B
```

但：

```text
C remains valid
```

这比：

```text
Revision++ → clearAll()
```

高效得多。

---

# 65. Reuse Runtime 与 Artifact Graph 可以共用依赖模型

Atria 已经需要：

```text
Task Artifact Provenance
Revision Applicability
```

因此 Reuse Runtime 不应该另起一套完全独立的 Dependency System。

更合理：

```text
Artifact Graph
+
Reuse Contract
```

共享：

- provenance；
- dependencies；
- revision；
- scope；
- invalidation。

---

# 66. Cache Storage 与 Reuse Semantics 分离

Reuse Runtime 定义：

```text
能不能复用？
```

Storage Backend 定义：

```text
东西放在哪？
```

例如：

```text
memory
SQLite
IndexedDB
filesystem
Redis
remote cache
GPU KV
CPU KV
SSD KV
provider-managed
```

这两层不要耦合。

---

# 67. Suggested Architecture

概念架构：

```text
                   ┌─────────────────────┐
                   │  Execution Request  │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │    Reuse Resolver   │
                   └──────────┬──────────┘
                              │
       ┌──────────────────────┼─────────────────────┐
       │                      │                     │
       ▼                      ▼                     ▼
Exact / Semantic       Plan / Workflow       Artifact / Tool
Reuse                  Reuse                 Value Reuse
       │                      │                     │
       └──────────────────────┼─────────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │ Invocation Planner  │
                   └──────────┬──────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        Deterministic      Tools            LLM Route
          Runtime                               │
                                                ▼
                                      Cache-aware Prompt
                                           Compiler
                                                │
                                                ▼
                                       Provider / Local
                                          Adapter
```

---

# 68. Context Segment Graph

建议结构概念：

```text
ContextGraph
├── SystemContract
├── ToolResources
├── PackageRules
├── CharacterStatic
├── WorldStatic
├── SessionSummary
├── StateProjection
├── RetrievedMemory[]
├── RetrievedLore[]
├── ToolResults[]
└── CurrentTurn
```

每个 Segment 有：

```text
Identity
Version
Dependencies
Volatility
Scope
```

Provider Compiler 再决定排列。

---

# 69. Prompt Cache 与 Context Correctness 可能冲突

为了 Prefix Stable，可能有人想：

```text
“不要更新 System Prompt”
```

但如果世界状态真的变了，就必须更新动态 Segment。

正确方式不是：

```text
为了 cache 保留错误信息
```

而是：

```text
stable segment unchanged
dynamic segment放后面并更新
```

因此 Prompt Compiler 价值就在这里：

> 把稳定与动态信息结构化分层。

---

# 70. 多 Provider 的 Cache Capability Negotiation

建议 Model / Provider Runtime 表达：

```text
PromptCacheCapability
├── implicit
├── explicitBreakpoints
├── explicitCacheObjects
├── prewarm
├── ttlControl
├── accountingKey
├── usageTelemetry
└── invalidationRules
```

Local Runtime：

```text
InferenceCacheCapability
├── prefixKV
├── segmentKV
├── nonPrefixKV
├── hierarchicalKV
├── cachePrefetch
├── cacheOffload
└── cacheCompression
```

不要把这两者塞进同一个 boolean。

---

# 71. Gateway 的 Cache 透明性问题

如果：

```text
Atria
→ New API
→ OpenRouter
→ Provider
```

则 Cache 行为可能依赖真实 upstream。

Atria 可能只知道：

```text
cached_tokens = ?
```

却不知道：

- 哪一层命中；
- TTL；
- 上游是否换了模型；
- failover 是否导致 cache loss。

因此：

```text
Cache Evidence
```

应支持：

```text
provider_reported
gateway_reported
locally_verified
estimated
unknown
```

---

# 72. Cache-aware Routing

Routing 可以逐渐考虑：

```text
expected latency
expected quality
price
cache locality
reasoning continuity
provider health
```

例如：

```text
Route A:
input = cheap
but 0 cache

Route B:
input slightly expensive
but 80% prefix cached
```

实际成本可能 B 更低。

因此 Routing Cost Model 最终应使用：

```text
Effective Cost
```

而不只是标价。

---

# 73. Cost Model 示例

概念：

```text
expectedCost =
  uncachedInputTokens * uncachedRate
+ cachedInputTokens * cachedRate
+ cacheWriteTokens * writeRate
+ outputTokens * outputRate
+ toolCost
+ expectedRetryCost
+ expectedContinuityLossCost
```

不必现在实现精确预测。

但企划应该避免把：

```text
price per 1M input tokens
```

当成唯一成本。

---

# 74. Cache Observability 面板

未来 Atria 可展示：

```text
Prompt Cache Hit
Tool Cache Hit
Plan Reuse
Artifact Reuse
Reasoning Continuity
Saved Calls
Saved Tokens
Saved Latency
```

开发者诊断尤其需要：

```text
Why Miss?
```

因为“缓存开启”但实际命中率为零是非常常见的问题。

OpenAI 2026 已经提供 Prompt Cache Dashboard / Diagnostics，这也说明可观测性正在成为 Provider 正式能力。

---

# 75. 建议的核心指标

## Reuse

- candidate rate
- valid hit rate
- invalid candidate rate
- false reuse rate

## Prompt

- cached input tokens
- cache write tokens
- shared-prefix length
- breakpoint utilization

## Tool

- tool calls avoided
- tool latency avoided
- stale-result rejection count

## Plan

- plan generation avoided
- template reuse rate
- validation-failure rate

## Agent

- total LLM calls
- reasoning calls
- retrieval calls
- model routing distribution

## RP

- prose repetition
- character consistency
- fresh-generation score
- stale-state contamination

---

# 76. 不能只测平均延迟

Cache 系统最容易隐藏：

```text
p95 / p99 miss penalty
```

所以 Eval 至少要有：

```text
TTFT p50/p90/p99
E2E latency p50/p90/p99
cache-hit latency
cache-miss latency
cold-start latency
warm latency
```

---

# 77. Eval：Provider Prompt Cache

测试矩阵：

```text
Stable system + changing user
Stable toolset
Reordered toolset
Changed schema whitespace
Changed tool description
Changed reasoning effort
History append
History rewrite
Compaction
Explicit breakpoint
Prewarm
```

测：

```text
cached tokens
cost
TTFT
hit probability
```

---

# 78. Eval：Tool Value Cache

构造：

```text
same args / same deps
same args / unrelated state changed
same args / dependency changed
same args / authority changed
same args / permission changed
same args / branch changed
```

正确目标：

```text
只在真正有效时 hit
```

---

# 79. Eval：Semantic Cache

测试近义表达：

```text
same intent same state
same intent different entity
same intent different time
same intent different revision
same wording but state changed
```

重点不是：

```text
命中多少
```

而是：

```text
错误命中必须接近 0
```

---

# 80. Eval：Plan Reuse

测试：

```text
same intent different wording
same workflow different args
same wording different permission
same intent but tool unavailable
same intent but changed Authority
```

Plan Template 可以命中，但执行前 validation 必须挡住失效条件。

---

# 81. Eval：RP 正文

A/B：

```text
A:
full recompute

B:
reuse facts + plan + narrative intent
fresh narrator
```

测：

- 正文质量；
- prose repetition；
- character consistency；
- stale state；
- token；
- latency；
- LLM call count。

这是最值得 Atria 专门做的 Eval。

---

# 82. 第一阶段哪些东西今天就能做

不需要 Local Model：

```text
✅ Canonical Context Segments
✅ Deterministic Serialization
✅ Cache-aware Prompt Compiler
✅ Provider cache capability abstraction
✅ OpenAI explicit breakpoints / prewarm
✅ Anthropic cache-control integration
✅ Gemini cache awareness
✅ Tool Discovery Cache
✅ Dependency-aware Tool Value Cache
✅ Exact Artifact Reuse
✅ Plan / Workflow Template Reuse
✅ Temporal Validity Gate
✅ Cache telemetry
✅ ReuseDecision logging
```

---

# 83. 第二阶段：需要 Agent Runtime 成熟

```text
✅ Adaptive Reuse Resolver
✅ Intent-based Plan Reuse
✅ Narrative Intent Reuse
✅ Targeted invalidation graph
✅ Cache-aware model routing
✅ Workflow hints
✅ Tool progress hints
✅ Adaptive retrieval
```

---

# 84. 第三阶段：需要 Local / Self-hosted Inference

```text
⬜ Prefix KV
⬜ RadixAttention integration
⬜ Hierarchical KV
⬜ Segment KV
⬜ Non-prefix KV
⬜ KV prefetch
⬜ KV offload
⬜ KV compression
⬜ EAGLE / Medusa
⬜ workflow-aware eviction
```

Atria 不应该为了这些远期功能提前实现自己的 CUDA / Attention Runtime。

第一目标应是：

> **让 Local Provider Adapter 能把 Atria 的结构化复用信号传给成熟 Serving Backend。**

---

# 85. 建议的实施 Roadmap

## Phase A — Reuse Semantics

定义：

- Reuse Contract
- Identity
- Scope
- Dependency
- Validity
- Provenance
- Invalidation
- Reuse Decision

这一阶段不需要真正复杂缓存。

---

## Phase B — Cache-Aware Context

实现：

- Context Segment identity
- Canonical serialization
- Stable ordering
- Prompt Compiler
- Provider Cache Capability
- Cache telemetry

优先：

- OpenAI
- Anthropic
- Gemini

---

## Phase C — Tool / Artifact Reuse

实现：

- dependency-aware cache
- purity / side-effect contract
- temporal validity
- targeted invalidation
- branch isolation

---

## Phase D — Plan / Workflow Reuse

实现：

- intent identity
- workflow templates
- parameter binding
- precondition validation
- plan provenance

---

## Phase E — Adaptive Invocation

结合：

- Reuse
- Retrieval
- Tool
- Model Router
- Reasoning Effort
- Narrative role

目标：

```text
only spend intelligence when needed
```

---

## Phase F — Local Inference Optimization

Provider / Backend Integration：

- vLLM
- SGLang
- compatible KV engines

能力：

- Prefix KV
- Segment KV
- Workflow prefetch
- Speculative decoding

---

# 86. 推荐的正式架构原则

建议企划加入：

### ER-1：Reuse is a proof, not a similarity score

任何复用必须有有效性依据。

### ER-2：Reuse semantics and storage are separate

是否能复用与缓存放在哪里分离。

### ER-3：Dependencies drive invalidation

优先依赖级失效，不采用全局 `clearAll()`。

### ER-4：Stable context has stable identity

Prompt 中长期稳定内容应具有稳定 Segment / Resource Identity。

### ER-5：Canonical serialization matters

相同语义应尽量产生稳定 Provider 输入。

### ER-6：Plan structure may outlive resolved values

Plan Template 可以长期复用，动态事实必须重新验证。

### ER-7：Side effects are never skipped by naive cache hits

Mutation / external actions 必须明确 replay semantics。

### ER-8：Narrative output stays fresh

默认不缓存最终 RP 正文。

### ER-9：Cache locality participates in routing

Provider/Model Routing 应逐渐感知 Cache Locality。

### ER-10：Trust boundaries outrank hit rate

禁止为了 KV 命中率突破用户 / Package / Session 安全隔离。

### ER-11：Reasoning Continuity is a special continuation state

不得降级成普通 semantic cache。

### ER-12：Local inference optimization stays behind capability interfaces

上层不绑定具体 KV / speculative decoding 实现。

---

# 87. 建议的非目标

第一阶段不要：

1. 自己实现 GPU KV Cache Engine；
2. 自己实现 vLLM / SGLang 替代品；
3. 为了缓存命中率永久固定错误 Context；
4. 对 Final RP Prose 做普通 Semantic Cache；
5. 用 embedding 相似直接决定 Tool Result 复用；
6. 对 Side-effect Tool 使用 naive result cache；
7. 每次 Revision 都清空所有缓存；
8. 跨 Branch 静默共享 state-dependent artifact；
9. 把 Provider Cached Tokens 与 Atria Artifact Cache 混成一个概念；
10. 假定 Gateway 一定透明保留 Cache；
11. 为追求 Prefix Cache 改变正确的 Prompt 语义；
12. 在无安全隔离下实现 cross-user position-independent KV。

---

# 88. 本报告建议的统一定义

建议企划采用：

> **Execution Reuse 是 Atria Runtime 在执行某个 Task、Tool、Model 或 Narrative 工作之前，根据对象身份、输入、依赖、Revision、Authority、时间、权限、Provider/Model 绑定及 Trust Domain 判断既有执行产物是否仍适用于当前 Effective Execution Snapshot，并在能够证明有效时跳过或缩减重复工作的能力。**

以及：

> **Cache 是 Reuse 的一种存储实现，而不是 Reuse 的语义本身。**

再进一步：

> **Atria 的优化目标不是最大化 Cache Hit Rate，而是在近零错误复用的前提下最大化 Valid Reuse，并把无法安全复用的创造性与状态敏感步骤保持新鲜执行。**

---

# 89. 对 Atria 当前大重构的优先级判断

优先级：**高。**

Reasoning Continuity 解决：

```text
模型不要重复恢复仍在进行的思路
```

Reuse Runtime 进一步解决：

```text
Runtime 不要重复做已经完成且仍然有效的工作
```

Sparse Invocation 解决：

```text
不值得调用 AI 的地方不要调用
```

三者合在一起：

```text
                Atria Runtime
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
 Deterministic     Reuse       Adaptive
   Runtime         Runtime     Invocation
        │            │            │
        └────────────┼────────────┘
                     ▼
               LLM / Tools
                     │
             only when needed
```

这很可能成为 Atria 性能架构的一根核心支柱。

---

# 90. 与现有 Atria 研究文档的关系

本报告不替代：

```text
reasoning-continuity-research.md
```

而是建议形成：

```text
Reasoning Continuity
→ 如何继续尚未完成的推理

Execution Reuse
→ 如何避免重复已完成且仍有效的工作

Sparse AI Invocation
→ 如何避免不必要的 AI 工作

Model / Provider Routing
→ 必须执行时选择什么执行路径

Context Runtime
→ 给模型哪些信息以及如何组织
```

这些应该在企划中相互引用，而不是重复定义。

---

# 91. Codex 并入企划建议

不要整篇复制。

建议主企划吸收：

1. Execution Reuse 正式定义；
2. Reuse Contract；
3. Dependency-aware validity；
4. Context Segment identity；
5. Cache-aware Prompt Compiler；
6. Provider Prompt Cache capability；
7. Tool Value Cache；
8. Plan / Workflow Reuse；
9. Adaptive Invocation ladder；
10. Routing + Cache Locality；
11. Narrator Final Prose 默认不缓存；
12. Trust Domain / HijackKV 安全约束；
13. Effective Execution Snapshot observability；
14. Roadmap Phase A–F。

本报告本身保留为 Research Evidence。

---

# 92. Codex 可直接使用的合并任务说明

```text
请读取 docs 分支中的 Execution Reuse / Cache Locality / Adaptive Invocation 调研报告，并把已确认的架构结论整合进当前 Atria 企划。

要求：

1. 不要整篇复制 Research 文档；Research 保留为证据，主企划只吸收正式架构结论。
2. 将 Execution Reuse 定义为 Runtime 一级能力，与 Storage Cache 实现分离。
3. 引入“Reuse 必须证明当前仍有效”的原则；Embedding similarity 只能找候选，不能单独决定复用。
4. 把 Reuse Contract 与 Atria 已有 Revision / Branch / Authority / Task Artifact / Provenance / Effective Execution Snapshot 体系对齐，不创建平行状态系统。
5. 设计 dependency-aware targeted invalidation，避免 Revision 变化就全局 clear cache。
6. Context Runtime 应保留稳定 Context Segment identity / version / volatility / dependency 概念，并支持 deterministic canonical serialization。
7. Model Runtime 加入 Provider Prompt Cache capability；OpenAI / Anthropic / Gemini 的具体字段只进入 Provider Adapter，不泄漏到上层核心模型。
8. Tool Value Cache 必须感知 purity、side effects、state dependencies、time、permission、Authority 与 Branch。
9. Plan / Workflow Reuse 应优先缓存结构化 Workflow Template，不缓存未经验证的动态事实。
10. Final RP prose 默认不得作为 Semantic Cache 返回；优先复用 facts、retrieval、plan、Narrative Intent、prompt prefix，再 fresh-generate Narrator。
11. Reasoning Continuity 继续沿用现有独立定义，把它作为 Execution Continuation，而不是普通 Cache Entry。
12. 将 cache locality 纳入未来 Routing Cost Model，但第一阶段不要过度实现预测模型。
13. Local KV / Segment KV / EAGLE / Medusa / KVFlow / CacheScout 属于未来 Self-hosted Inference capability，不要求当前自行实现 GPU serving。
14. 加入 HijackKV 风险与 Trust Domain 约束：默认禁止不受控的 cross-user / cross-package position-independent KV reuse。
15. 加入 Cache / Reuse observability：valid hit、miss reason、saved calls/tokens/tool executions、false reuse、TTFT/E2E 等指标。
16. 将实施顺序写入 roadmap：
    A. Reuse semantics
    B. Cache-aware context
    C. Tool/artifact reuse
    D. Plan/workflow reuse
    E. Adaptive invocation
    F. Local inference optimization
17. 如果现有企划已有相近术语，以现有正式术语为准，消除重复概念。
18. 不要把本报告中的概念字段示例误写成已冻结 TypeScript Schema。
19. 本轮只更新企划、Research 索引及必要 Record/HANDOFF，不实施产品代码。
```

---

# 93. 核心论文与资料

## Prompt Cache: Modular Attention Reuse for Low-Latency Inference

- MLSys 2024
- 核心：Prompt Module / Attention State Reuse
- 报告：GPU TTFT 最高约 8×，CPU 最高约 60×
- https://arxiv.org/abs/2311.04934
- https://research.google/pubs/prompt-cache-modular-attention-reuse-for-low-latency-inference/

## SGLang: Efficient Execution of Structured Language Model Programs

- NeurIPS 2024
- 核心：RadixAttention / Prefix KV Tree
- 报告：多任务最高约 6.4× throughput
- https://arxiv.org/abs/2312.07104

## RAGCache: Efficient Knowledge Caching for Retrieval-Augmented Generation

- 核心：RAG Knowledge Tree / GPU + Host Cache
- 报告：TTFT 最高约 4× 改善，throughput 最高约 2.1×
- https://arxiv.org/abs/2404.12457

## CacheGen: KV Cache Compression and Streaming for Fast LLM Serving

- SIGCOMM 2024
- 核心：KV Compression / Streaming
- 报告：KV size 3.5–4.3× 缩减；loading delay 3.2–3.7× 改善
- https://arxiv.org/abs/2310.07240

## CacheBlend: Fast Large Language Model Serving for RAG with Cached Knowledge Fusion

- 核心：Non-prefix Chunk KV + Selective Recompute
- 报告：TTFT 2.2–3.3×；throughput 2.8–5×
- https://arxiv.org/abs/2405.16444

## Cache-Craft: Managing Chunk-Caches for Efficient Retrieval-Augmented Generation

- 核心：Chunk KV Reuse + Selective Recomputation
- 报告：相比 Prefix Cache redundant computation -51%；throughput 1.6×；E2E latency 约 2× 改善
- https://arxiv.org/abs/2502.15734

## KVFlow: Efficient Prefix Caching for Accelerating LLM-Based Multi-Agent Workflows

- NeurIPS 2025
- 核心：Agent Step Graph / Workflow-aware Eviction + Prefetch
- 报告：单工作流最高 1.83×；多工作流最高 2.19×
- https://arxiv.org/abs/2507.07400

## A Plan Reuse Mechanism for LLM-Driven Agent / AgentReuse

- 2025
- 核心：Intent + Semantic Plan Reuse
- 报告：93% effective plan reuse；F1 0.9718；planning latency -93.12%
- https://arxiv.org/abs/2512.21309

## TVCACHE: A Tool-Value Cache for Post-Training LLM Agents

- ICML 2026
- 核心：Stateful Tool Value Cache / Tool-history matching
- 正式版本报告：hit rate 最高约 67%；median tool call latency 最高 6.9× 改善
- https://arxiv.org/abs/2602.10986
- https://proceedings.mlr.press/v306/kumar26d.html

## Evaluating Temporal Semantic Caching and Workflow Optimization in Agentic Plan-Execute Pipelines

- 2026
- 核心：Temporal Semantic Cache / MCP Workflow Optimization
- 报告：cache-hit median 30.6×；workflow 1.67×；median E2E -40%
- https://arxiv.org/abs/2605.20630

## SparseX: Efficient Segment-Level KV Cache Sharing for Interleaved LLM Serving

- 2026
- 核心：cross-request / cross-turn / cross-agent Segment KV Reuse
- https://arxiv.org/abs/2606.01751

## C²KV: Compressed and Composable KV Cache Reuse for Efficient LLM Inference

- KDD 2026
- 核心：Compressed + Position-agnostic + Composable KV
- 报告：长上下文最高约 17× inference speedup
- https://arxiv.org/abs/2607.17715
- https://doi.org/10.1145/3770855.3817715

## SemPIC: Learning Semantic Position-Independent KV Caches

- 2026
- 核心：learned position-independent document KV
- https://arxiv.org/abs/2607.28069

## Learning Agent Execution for KV-Cache Management in Agentic Serving / CacheScout

- 2026
- 核心：在线学习 Agent transition，指导 eviction/prefetch
- 报告：hit rate +10–18 pp；mean TTFT -18–45%；per-turn latency -29–38%；peak throughput +57%
- https://arxiv.org/abs/2608.14624

## ReCache: Efficient KV Cache Reuse and Compression for Tool-Augmented LLM Agents

- 2026
- 核心：Tool / Skill Resource-wise KV Representation
- 报告：3.655× TTFT；KV tensor memory -92.43%
- https://arxiv.org/abs/2608.19662

## Ask the Tool, Don't Guess: Agent Tool Calls Hold Their Progress, and the Serving System Should Read It

- 2026-09
- 核心：Tool Progress → KV retention/offload/prefetch
- 报告：post-tool p90 TTFT 相比 LRU -20.7% / -20.8%
- https://arxiv.org/abs/2609.18849

## HijackKV: New Threat in Position-Independent KV Cache Reuse

- USENIX Security 2026
- 核心：Position-independent KV Reuse 的跨上下文污染攻击
- https://arxiv.org/abs/2607.19957
- https://www.usenix.org/conference/usenixsecurity26/presentation/zhang-yichi

## RouteLLM: Learning to Route LLMs with Preference Data

- 2024
- 核心：Strong / Weak Model Dynamic Routing
- 部分实验成本降低超过 2× 且维持质量目标
- https://arxiv.org/abs/2406.18665

## Adaptive-RAG

- 2024
- 核心：根据问题复杂度选择 No / Single-step / Multi-step Retrieval
- https://arxiv.org/abs/2403.14403

## EAGLE-3

- 2025
- 核心：Speculative Decoding
- 报告：最高约 6.5× speedup
- https://arxiv.org/abs/2503.01840

## Medusa

- ICML 2024
- 核心：Multiple Decoding Heads
- 正式论文报告：Medusa-1 >2.2×；Medusa-2 约 2.3–2.8×
- https://arxiv.org/abs/2401.10774
- https://proceedings.mlr.press/v235/cai24b.html

## Mooncake

- FAST 2025 / ACM TOS
- 核心：KVCache-centric disaggregated serving
- https://arxiv.org/abs/2407.00079
- https://github.com/kvcache-ai/Mooncake

---

# 94. 当前 Provider 官方资料

## OpenAI Prompt Caching

当前能力包括：

- automatic prompt caching
- GPT-5.6+ explicit breakpoints
- cache TTL
- prewarm
- diagnostics / telemetry

文档：
https://developers.openai.com/api/docs/guides/prompt-caching

## Anthropic Tool Use + Prompt Caching

关键：

- `tools → system → messages`
- Tool definitions 变化会破坏后续 prefix
- `defer_loading` 可避免动态 Tool Discovery 破坏稳定 Tool Prefix

文档：
https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching

## Gemini Context Caching

关键：

- Gemini 2.5+ implicit caching
- Interactions API 支持 implicit
- GenerateContent 路径仍可使用 explicit cache object
- common prefix 越稳定越容易命中

文档：
https://ai.google.dev/gemini-api/docs/caching

---

# 95. 最终架构判断

如果只把本轮研究压缩成四个结论：

## 一

> **Atria 的 Context 不应再只是一段 Prompt String，而应是一组有稳定 Identity、Version、Dependency 与 Volatility 的 Context Segments。**

## 二

> **Atria 的 Cache Hit 必须由 Validity Proof 决定，而不是只由 Hash 或 Embedding Similarity 决定。**

## 三

> **最终 RP 正文默认保持 Fresh Generation；应该复用的是正文之前的 Facts、Retrieval、Plan、Intent、Context、Prompt Prefix 和短期 Reasoning。**

## 四

> **Atria 最终需要的是 Reuse Runtime + Adaptive Invocation，而不是单独堆很多彼此无关的缓存。**

最终可以形成：

```text
State Runtime
     │
     ▼
Reuse Runtime
     │
     ▼
Adaptive Invocation
     │
     ├─ no call
     ├─ deterministic
     ├─ cached artifact
     ├─ tool
     ├─ cheap model
     ├─ reasoning model
     └─ fresh narrator
```

这套体系能够同时优化：

- 缓存命中率；
- Token 成本；
- Tool 调用；
- Planning；
- RAG；
- Provider Prompt Cache；
- Agent latency；
- 本地模型 Prefill；
- 本地正文 Decode；
- 多 Agent Workflow；

同时保留 Atria 最重要的：

- 状态正确性；
- Branch / Revision 隔离；
- 可审计性；
- RP 正文新鲜度；
- Provider 可替换性。
