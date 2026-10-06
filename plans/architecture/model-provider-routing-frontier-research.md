# Atria Model / Provider / Routing Frontier Research

> **Status:** Research / Non-binding
> **Date:** 2026-10-06
> **Code baseline:** main@ed1fd90521a63363e29856601abbf5e908c99d10
> **Primary workspace:** docs
> **Companion research:**
> - plans/architecture/model-prompt-context-frontier-research.md
> - plans/architecture/sparse-ai-invocation-adaptive-compute-research.md
> **Likely downstream Plan:** plans/architecture/agent-intelligence-runtime/index.md
> **Purpose:** 在 Atria 下一轮 Agent / Cognitive Runtime 架构重构前，研究 Provider、Connection、Model、Deployment、Capability、Economics、Routing、Fallback 与 Execution Snapshot 应如何重新建模，使官方 API、云厂商 Deployment、聚合平台、自建网关、New API / Sub2API、OpenRouter、LiteLLM、本地模型和未来路由服务能够进入统一但不失真的运行时。
> **Product assumption:** Atria 是独立 Agent-native RP 产品与前沿技术试验田，不以 SillyTavern 的 API 配置层级或兼容语义为约束。
> **Not a Plan:** 本文不冻结最终对象名、Schema、API、迁移方式或 UI。正式实现前应以当时最新 main、Provider 能力、价格与实际网关行为重新定案。

---

## 1. 核心结论

Atria 当前的 ConnectionProfile → ModelProfile → RuntimeRoute 方向并没有错。

真正的问题是：

> 当前 RuntimeRoute 太接近“用户提前拼好的固定执行组合”，而未来 Atria 需要的是“持久 Routing Policy + 请求时求解 + Exact Execution Snapshot”。

推荐长期方向：

1. Connection / Endpoint 继续存在，表示真实可调用边界；
2. Model 不应只表示一个品牌模型名，而应区分“模型语义身份”和“实际可调用 Deployment / Virtual Target”；
3. Capability、价格、延迟、健康度、限流和数据策略不应被视为模型永久属性，而应是带 provenance、freshness 和作用域的 evidence；
4. Routing Policy 表达“这类任务需要什么”和“如何权衡质量 / 成本 / 延迟 / 隐私 / 连续性”；
5. Runtime Resolver 在请求时选择具体调用目标；
6. Failure Recovery 与 Quality / Compute Routing 必须分开；
7. 每次执行都冻结 Effective Execution Snapshot；
8. 对 New API、Sub2API、OpenRouter、LiteLLM 等网关，Atria 必须承认“网关内部还有一层甚至多层路由”，不能伪造自己并不知道的最终上游身份；
9. Atria 应记录“可观察的执行路径”，而不是把请求中的 model 字符串当成客观模型真相；
10. Sparse Compute 与 Model Routing 应共享一套预算、能力、成本和 provenance substrate。

简化后的长期结构：

Provider Adapter / Protocol
        ↓
Connection / Gateway Boundary
        ↓
Callable Target / Deployment Pool
        ↓
Capability + Economics + Health Evidence
        ↓
Task Requirements + Compute Policy
        ↓
Routing Policy
        ↓
Runtime Resolver
        ↓
Effective Execution Snapshot
        ↓
Provider / Gateway Call
        ↓
Observed Execution Evidence

---

## 2. 当前 Atria 的真实基线

当前 Native Model / Prompt Runtime 已经有三个重要对象。

### 2.1 ConnectionProfile

当前负责：

- endpoint；
- providerAdapter；
- transport；
- secretRef；
- networkPolicy；
- provider-specific options。

这回答：

> “Atria 通过什么协议、哪个地址、凭什么凭据发请求？”

这是一个真实且长期稳定的物理边界，应该保留其核心思想。

### 2.2 ModelProfile

当前负责：

- connectionProfileRef；
- remoteModelId；
- capabilities；
- context / output limits；
- tokenizer；
- messageFormat；
- providerHints。

它事实上已经不是纯粹的“模型定义”。

因为它绑定 Connection，所以更接近：

> “这个 Connection 上的某个可调用模型目标”。

长期更适合把它理解为 Model Deployment / Callable Target，而不是抽象 Model Identity。

### 2.3 RuntimeRoute

当前同时绑定：

- role；
- modelProfileRef；
- connectionProfileRef；
- generationProfileRef；
- promptProgramRef；
- fallbackRouteRefs；
- promptParameters；
- retry / timeout / fallback policy；
- capability requirements。

因此它同时承担：

- 模型选择；
-连接选择；
-Prompt / Behavior 选择；
-Generation 参数；
-角色 / Task 路由；
-失败恢复；
-部分运行策略。

在固定、可复现调用体系下这很直接，但进入 Adaptive Compute 后会产生组合爆炸。

例如很容易出现：

- narrator-fast；
- narrator-standard；
- narrator-deep；
- narrator-openai；
- narrator-openrouter；
- narrator-newapi；
- narrator-deep-fallback；
- memory-cheap；
- memory-deep；
- cognition-frontier；
- cognition-local。

Route 会从“运行时抽象”退化成大量手工排列组合。

---

## 3. 当前实现里最值得保留的原则

即使后续重写 API / Routing，以下思想应该尽量保留。

### 3.1 Exact execution evidence

当前 RouteResolver 最终产生明确的：

- connection；
- model；
- generation；
- prompt；
- capabilities；
- exact resource revisions。

GenerationService 又冻结 EffectiveRequestSnapshot。

这非常符合未来要求：

> 动态路由不意味着不可复现。

请求可以动态选择，但真正发出去之前必须冻结：

- 为什么选；
-选了谁；
-使用什么参数；
-看到什么 Context；
-Capability evidence 是什么；
-成本 / 路由依据是什么。

### 3.2 Capability 有 provenance

当前 CapabilityDecision 已有：

- supported；
- unsupported；
- unknown；
- provenance。

这个设计方向非常好。

未来第三方网关环境下，Capability 更不能是简单布尔值。

### 3.3 Provider adapter 与 PromptIR 分离

当前 provider adapter 负责 wire lowering，PromptIR 保持语义层。

这与上一份 Prompt / Context 调研完全一致。

### 3.4 Secret 只进入 send boundary

这个安全边界应该继续保留。

### 3.5 Fallback 不静默改变 Tool / Output authority

当前 fallback 保持工具和输出契约一致，这也是未来动态 Routing 必须继续保护的 invariant。

---

## 4. 外部生态已经从“模型”转向“部署目标”

### 4.1 Azure OpenAI：调用目标是 Deployment

Azure OpenAI 的 API 调用使用 deployment name，而不是简单把“模型名”当成唯一目标。

一个 Deployment 还拥有自己的：

- region；
- deployment type；
- TPM / RPM；
- capacity；
- quota；
- data residency；
- standard / provisioned / batch；
- pricing / latency characteristics。

同一个基础模型可以存在多个 Deployment。

因此：

> Model Identity 和 Callable Deployment 是不同概念。

参考：

- Azure OpenAI endpoints / deployments
  https://learn.microsoft.com/en-us/azure/ai-studio/ai-services/concepts/endpoints
- Azure OpenAI quota
  https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota
- Deployment types
  https://learn.microsoft.com/azure/ai-services/openai/how-to/deployment-types

### 4.2 LiteLLM：同一 model_name 后面可以有多个 Deployment

LiteLLM Router 明确区分：

- model group / model_name；
-具体 deployment。

同一个逻辑模型组可以有：

-多个 Azure region；
-不同 Provider；
-BYOK；
-不同 API Base；
-不同 rate limit；
-不同权重。

路由可以按：

- weight；
- RPM / TPM；
- latency；
- cost；
- least busy；
- priority order。

健康状态和 cooldown 又是 per-deployment，而不是 per-model-group。

这直接支持 Atria 将：

> Semantic target / Model class

和：

> Physical deployment

分开。

参考：

- LiteLLM Router
  https://docs.litellm.ai/docs/routing
- LiteLLM Proxy request architecture
  https://docs.litellm.ai/docs/proxy/architecture

---

## 5. OpenRouter 证明“同一个模型”也需要 Provider 级路由

OpenRouter 的一个 model 可以由多个 Provider 提供。

其路由会考虑：

- price；
- latency；
- throughput；
- reliability；
-参数支持；
-隐私 / data collection policy；
-quantization；
-用户指定 provider order。

OpenRouter 默认甚至会在同一个模型内部做 Provider failover。

这说明有两种完全不同的变化：

### Same-model provider routing

目标模型语义不变，只换 Provider / Deployment。

例如：

Claude Sonnet
→ Anthropic direct
→ Vertex AI
→ another provider

### Cross-model fallback / routing

实际模型也变化。

例如：

primary model
→ fallback model

OpenRouter 自己也明确把这两层区分。

对 Atria 来说：

> failure failover 与 compute / quality model routing 必须是两个不同概念。

参考：

- OpenRouter routing
  https://openrouter.ai/blog/insights/model-routing/
- OpenRouter reliability / failover
  https://openrouter.ai/blog/insights/reliability-failover/
- OpenRouter provider performance routing
  https://openrouter.ai/blog/insights/evaluate-llm-provider-performance/

---

## 6. New API：请求模型名可能只是“虚拟入口”

New API 对 Atria 非常有代表性，因为它展示了第三方 / 自建网关会如何改变“模型调用”的含义。

其 Channel 支持：

- Provider 类型；
-Base URL；
-模型列表；
-优先级；
-同优先级权重；
-Model Mapping；
-Parameter Override；
-自动禁用；
-多 API Key 轮询。

因此用户请求：

model = X

实际上可能发生：

X
→ Channel selection
→ Model Mapping
→ X2
→ Parameter Override
→ upstream request

也就是说：

> 客户端请求中的 model ID 不一定是上游真正收到的 model ID。

甚至请求中的某些参数也可能被网关重写。

New API 还支持：

- Group 隔离；
- group-level billing ratio；
-跨 group failover；
-模型倍率 / 输出倍率；
-上游模型同步；
-网关再接另一个 New API；
-任务插件；
-不同模型 / 插件不同计费表达式。

这意味着 Atria 面对 New API 时不能假设：

- Atria 的 model ID = upstream model；
-Atria 的价格表 = 网关真实成本；
-一个 Connection = 一个 Provider；
-同一模型名永远语义一致；
-Provider-native 参数一定原样透传。

参考：

- New API Channel Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/channel
- New API Model Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/model
- New API Group Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/group
- New API Ratio Settings
  https://docs.newapi.pro/en/docs/guide/console/settings/rate-settings
- New API Changelog
  https://docs.newapi.pro/en/docs/guide/wiki/changelog

---

## 7. New API 还说明“模型字符串本身可能携带策略”

New API 2026 的更新已经支持 model modifier，例如：

- reasoning effort；
-thinking on/off/adaptive/budget；
-temperature；
-top-p。

并且这些 modifier：

- 可以跨 model mapping 保持；
-mapped model 上的 modifier 可以覆盖 requested model；
-会进入 canonical billing identity；
-可以影响实际 Provider 转换。

这进一步说明：

> remoteModelId 不应该同时承担 Model Identity、Routing Policy、Generation Profile 三种职责。

Atria 应把：

-模型身份；
-推理预算；
-采样；
-Provider adapter；
-网关 virtual alias

拆开记录。

否则一个字符串会重新变成“隐式配置黑洞”。

---

## 8. Sub2API：一次 Atria 调用后面可能是“账号池调度”

Sub2API 更进一步。

它的核心不是简单 Provider relay，而是：

-多上游账号；
-OAuth / API Key；
-API Key distribution；
-token-level billing；
-smart scheduling；
-sticky session；
-user / account concurrency；
-rate limiting；
-load balancing；
-request forwarding。

因此 Atria 连接到一个 Sub2API endpoint 时：

Atria
→ Sub2API
→ Account Group
→ sticky / load-aware scheduler
→ selected account
→ actual upstream

Atria 可能根本不知道最后是哪一个上游账号执行。

Sub2API 的配置和代码还展示了：

- session sticky；
- fallback waiting；
- per-account connection pool；
- concurrency-aware scheduling；
-不同平台的 routing；
-模型允许列表；
-reasoning effort ceiling / mapping。

这对长对话 RP 很重要：

> “Provider affinity / session affinity”可能影响连续性、缓存、上游会话资源甚至行为稳定性。

Atria 不能假设“同一个 Connection 每次都等价”。

参考：

- Sub2API
  https://github.com/hopol/sub2api
- Sub2API config / scheduling
  https://github.com/Wei-Shaw/sub2api/blob/main/deploy/config.example.yaml

---

## 9. 对 New API / Sub2API 的一个重要安全与真实性原则

Atria 不应该试图猜网关内部真相。

例如一个第三方网关返回：

model = gpt-x

Atria 不应自动推断：

- 一定是 OpenAI direct；
-一定是官方 snapshot；
-一定有官方上下文长度；
-一定有官方工具能力；
-一定按官方价格计费。

更正确的是：

> **Atria 只声明自己真正观察到或可信来源证明的事实。**

因此建议把调用目标透明度分级。

### T0 — Direct / strongly identified

例如官方 OpenAI、Anthropic、Gemini direct，或用户明确配置的本地 deployment。

Atria 能较可靠地知道：

- provider；
-model ID；
-capability；
-限制；
-价格来源。

### T1 — Cloud deployment

例如 Azure / Vertex / Bedrock。

Atria 知道：

- cloud deployment；
- declared underlying model；
-region / SKU / quota。

但实际服务基础设施仍由云平台路由。

### T2 — Transparent gateway

网关能提供：

- virtual model；
-selected provider / deployment；
-usage；
-pricing；
-capability metadata；
-route trace。

Atria 可以把这些作为 observed evidence。

### T3 — Opaque gateway

例如只暴露 OpenAI-compatible API 和模型字符串，但内部：

-映射；
-账号池；
-Provider；
-真实价格

不可见。

Atria 应显示：

> Gateway target / upstream unknown

而不是伪装成 direct model。

---

## 10. Model Discovery 不能成为 Capability Authority

Atria 当前 provider discovery 已能查询：

- OpenAI-compatible /models；
-Anthropic models；
-Gemini models。

其中 Gemini / Anthropic 某些字段可以带：

- limits；
-thinking；
-structured output capability。

但 OpenAI-compatible 网关的 /models 往往只返回：

- id；
-object；
-owned_by；

并不能证明真实 capability。

New API、LiteLLM、自建代理甚至可以自由暴露虚拟 model name。

所以未来：

> /models 是 Discovery evidence，不是 Capability truth。

Capability evidence 应有来源层级。

候选来源：

1. Atria adapter knowledge；
2. official provider metadata；
3. provider discovery；
4. gateway-declared metadata；
5. active capability probe；
6. user override；
7. observed successful execution；
8. observed rejection / downgrade。

并且必须带：

- observedAt；
-source；
-scope；
-confidence / authority class；
-expiry / freshness。

---

## 11. Capability 应属于“Deployment / Boundary”，而不是抽象模型永久属性

同一个基础模型在不同入口可能有不同能力。

例如：

- direct API 支持 Responses；
-某第三方 gateway 只支持 Chat Completions；
-一个渠道不透传 reasoning 参数；
-另一个渠道不支持 strict tools；
-某个代理把 structured output 转成 prompt；
-某个区域 deployment 暂时没有特定 feature。

因此不要问：

> “Claude X 支不支持 Tool？”

更准确的问题是：

> “通过这个 Connection / Deployment / protocol version，在当前证据下，Atria 能不能可靠使用 Tool？”

候选 capability key 可继续是：

- generation.tools；
-generation.structured-output；
-generation.reasoning；
-generation.cache；
-generation.streaming；
-generation.images；
-generation.audio；
-generation.tool-search；
-generation.mcp；
-generation.batch；
-generation.realtime。

但 decision 应绑定具体 execution boundary。

---

## 12. Model Identity 与 Model Target 应分开

长期可以研究两个概念。

### Model Identity

表达：

> “这是哪一类模型能力 / 语义身份？”

例如：

- canonical family；
-provider family；
-version / snapshot；
-modality；
-quality class。

它适合：

-评测；
-历史；
-用户理解；
-model-specific optimization。

### Callable Target / Deployment

表达：

> “从哪里实际调用它？”

可能是：

- OpenAI direct model；
-Azure deployment；
-Vertex endpoint；
-OpenRouter virtual model；
-New API model alias；
-Sub2API group / virtual target；
-LiteLLM model group；
-local vLLM endpoint；
-Ollama model；
-device-local utility model。

这两个对象不一定必须马上物理拆成两张表。

但架构必须明确：

> remoteModelId 不是天然 canonical identity。

---

## 13. Alias、Snapshot 与可复现性必须显式处理

当前 Provider 已经大量使用：

- latest alias；
-stable alias；
-preview；
-experimental；
-versioned snapshot。

例如 Gemini 明确说明：

- stable 通常固定；
-latest 会被 hot-swap；
-preview 会退役；
-experimental 不稳定。

OpenAI 也有会更新 underlying snapshot 的 alias，以及可锁定行为的 snapshot。

因此 Atria 不应把：

model = something-latest

记录成足以重放的完整证据。

Execution Snapshot 至少应尽可能记录：

- requested target；
-resolved target；
-reported model；
-provider response metadata；
-observed version / fingerprint，如果 Provider 提供；
-adapter version；
-capability evidence version。

如果上游不暴露 snapshot：

> 应明确标记 unresolved / provider-managed，而不是伪造精确性。

参考：

- Gemini model version patterns
  https://ai.google.dev/gemini-api/docs/models
- OpenAI model snapshots / aliases
  https://developers.openai.com/api/docs/models/chat-latest
- OpenAI deprecations
  https://developers.openai.com/api/docs/deprecations

---

## 14. Pricing 不能继续只挂在“模型名”上

现实里价格可能取决于：

- provider；
-deployment type；
-region；
-model；
-input / output；
-cached input；
-reasoning；
-tool call；
-search；
-image / audio / video；
-context length tier；
-batch / flex / priority；
-third-party markup；
-user group；
-gateway ratio；
-plugin；
-subscription quota。

New API 的 ratio system 就是非常典型的例子：

同一个 model name 的用户成本可能受：

- Model Ratio；
-Completion Ratio；
-Group Ratio

共同影响。

OpenRouter 同一模型不同 Provider 也可能有不同价格。

Azure 又有：

- standard；
-priority；
-flex；
-provisioned；
-batch。

所以未来 Atria 的 economics 更适合是：

> **Execution Target 的动态 Cost Evidence**

而不是：

ModelProfile.price = fixed number

候选维度：

- input token price；
-cached input price；
-output / reasoning price；
-tool price；
-fixed request price；
-media unit price；
-currency；
-source；
-observedAt；
-price scope；
-user-visible price vs estimated upstream cost；
-confidence。

---

## 15. Atria 需要“估算成本”和“实际记账”分离

尤其面对 New API / Sub2API / OpenRouter。

### Estimated Cost

在调用前用于 Routing：

-官方价格；
-网关公开价格；
-用户手工配置；
-历史平均 cost；
-gateway ratio。

### Settled / Observed Cost

调用后：

- usage tokens；
-provider usage；
-gateway billing header / response；
-accounting endpoint；
-user余额变化；
-observed charge。

如果无法知道真实收费：

> 只能记录 estimated，不应标成 actual。

这样 Sparse Compute 才能真正用：

- predicted cost

做路由，再用：

- settled cost

校准预测。

---

## 16. Latency 与 Reliability 也应该是 Runtime Evidence

OpenRouter 已公开用：

- TTFT；
-throughput；
-uptime

影响路由。

LiteLLM 支持：

- latency-based；
-least-busy；
-rate-limit-aware；
-cooldown。

Atria 未来也可以维护自己的观测统计：

### Latency

- DNS/connect；
-time to first token；
-total latency；
-tokens / second。

### Reliability

- success rate；
-429；
-5xx；
-timeout；
-parser failure；
-tool schema failure；
-structured output failure；
-content policy behavior。

### Capacity

- observed RPM / TPM pressure；
-concurrency saturation；
-retry-after；
-local queue depth。

这些最好是滑动窗口 evidence，不是永久配置。

---

## 17. Privacy / Data Policy 也应参与 Routing

OpenRouter 已允许按 provider data collection policy 做筛选。

Atria 作为 RP 产品尤其可能处理：

-私密角色设定；
-个人长期记忆；
-成人或敏感 RP 数据；
-Project source；
-user files。

因此未来 Routing Policy 不应只有：

- cheapest；
-fastest；
-best。

还应该能表达：

- direct provider only；
-no data training；
-region / residency；
-local only；
-BYOK only；
-approved gateways；
-no third-party relay；
-no opaque gateway。

这些是 policy constraint，不应被 fallback 静默绕过。

---

## 18. Routing Policy 应表达“需求与偏好”，而不是固定对象引用

长期候选：

RoutingPolicy

输入：

- role / task class；
-quality target；
-compute budget；
-latency target；
-cost ceiling；
-required capabilities；
-privacy constraints；
-context requirement；
-output requirement；
-preferred model families；
-allowed connection / gateway classes；
-session affinity requirement。

策略：

- optimize quality；
-optimize cost；
-optimize latency；
-balanced；
-user-defined weighted objective；
-experimental router。

这比：

route → exact model

更适合 Sparse Compute。

---

## 19. Runtime Resolver 应进行“约束求解 + 排名”，不是字符串查表

候选流程：

### Step 1 — Candidate discovery

从可用资源中建立候选：

- connections；
-deployments；
-gateway virtual targets；
-local models。

### Step 2 — Hard filters

过滤：

- capability unsupported；
-context too small；
-privacy violation；
-budget impossible；
-provider disabled；
-health cooldown；
-user disallowed；
-task role incompatible。

### Step 3 — Score

按 policy 考虑：

- expected quality；
-cost；
-latency；
-reliability；
-affinity；
-cache value；
-current quota；
-observed success；
-user preference。

### Step 4 — Freeze

选中后冻结：

Effective Execution Snapshot。

### Step 5 — Execute

Provider adapter / gateway。

### Step 6 — Observe

将：

- actual usage；
-latency；
-errors；
-reported model；
-gateway metadata；
-cost

写入 telemetry。

### Step 7 — Recovery

按 FailurePolicy 处理，而不是重新执行 Quality Router 的任意选择。

---

## 20. Quality Routing 与 Failure Recovery 必须分离

### Quality / Compute Routing

回答：

> 正常情况下，这一轮值得用什么？

例如：

- cheap utility；
-standard narrator；
-frontier narrator；
-deep cognition。

它由：

-任务价值；
-复杂度；
-预算；
-用户模式

决定。

### Failure Recovery

回答：

> 已选目标失败后，允许怎么恢复？

例如：

same deployment retry
→ same model, another deployment
→ equivalent model target
→ cross-model fallback
→ user confirmation
→ fail

失败恢复必须保护：

- tools；
-output contract；
-privacy；
-data residency；
-cost ceiling；
-quality floor；
-session affinity；
-context size。

---

## 21. 第三方 Gateway 需要专门的 Failure Scope

如果 Atria 调的是 New API / Sub2API / OpenRouter：

失败可能来自：

1. Atria → gateway 网络；
2. gateway authentication；
3. gateway quota / billing；
4. gateway scheduler；
5. selected channel / account；
6. upstream Provider；
7. upstream model；
8. protocol conversion；
9. output conversion。

Atria 未必能看到所有层。

因此错误证据应包含：

- observed layer；
-gateway-returned error；
-retryability；
-known / unknown origin；
-gateway route metadata，如果有。

不要把一个 New API 429 自动解释成：

> OpenAI 429。

它也可能是：

-网关用户限流；
-渠道限流；
-账号池满；
-上游 429；
-内部 quota。

---

## 22. Gateway Nested Routing 的正式抽象

建议未来至少在语义上允许：

Execution Path

Atria Runtime
→ Connection Boundary
→ Virtual Target
→ Gateway Route
→ Provider / Account / Deployment
→ Model

但每一段可以标记：

- known；
-declared；
-observed；
-opaque。

例如 New API：

Atria
→ my-newapi.example
→ virtual model: gpt-x
→ channel: unknown
→ mapped model: unknown
→ provider: unknown

例如 OpenRouter 若返回足够 metadata：

Atria
→ OpenRouter
→ anthropic/claude-X
→ selected provider: Y
→ model response identity

不要要求所有 Gateway 都暴露同样信息。

---

## 23. Session Affinity 是 RP 特别值得建模的维度

LiteLLM 已支持 session pinning。

Sub2API 也使用 sticky session 将稳定会话绑定上游账号，并在容量 / fallback 条件下改变调度。

长 RP 会话可能受益于稳定 affinity：

- Provider cache；
-session resources；
-upstream conversation state；
-consistent latency；
-某些 subscription/session quota。

因此 Routing Policy 可以研究：

- none；
-prefer；
-require；
-sticky-until-failure；
-sticky-by-session；
-sticky-by-agent-task。

但 affinity 不能覆盖：

- capability failure；
-privacy；
-hard budget；
-unhealthy deployment。

---

## 24. Local Model 不应该是假 Provider 特例

未来 Atria 很可能接：

- Ollama；
-vLLM；
-llama.cpp；
-MLX；
-WebGPU / WebLLM；
-Android local runtime；
-桌宠 utility model。

这些与远端模型一样也有：

- endpoint / process boundary；
-model deployment；
-capabilities；
-limits；
-latency；
-load；
-memory / VRAM；
-queue；
-health。

因此更好的抽象是：

> Callable Deployment

而不是：

> Cloud API Model

Connection 可以有：

- HTTP；
-local process；
-in-process；
-device runtime。

Provider Adapter 负责协议差异。

---

## 25. Model Router 本身也可以是一个上游

Azure 已经提供 Model Router，可在 quality / cost / balanced 模式下动态选模型。

OpenRouter 是 provider + model router。

LiteLLM 可以成为自建 Router。

New API / Sub2API 也可以在内部再次选择 channel / account / provider。

所以 Atria 必须允许：

> 一个 Callable Target 本身就是 Router。

此时 Atria 有两个选择：

### Delegated routing

把部分决策交给上游 router。

优点：

-利用其全局 provider health；
-少维护 Provider 细节；
-快速接入大量模型。

缺点：

-可解释性降低；
-真实 upstream 不一定可见；
-cost / data policy 更难精确；
-A/B reproducibility 下降。

### Atria-owned routing

Atria 自己选择 direct deployment。

优点：

-完整 provenance；
-明确 cost / policy；
-更适合实验与 eval。

缺点：

-需要维护更多 provider adapter / metadata。

未来应该两者都支持，而不是二选一。

---

## 26. 推荐的长期对象模型

以下只是研究候选。

### ProviderAdapter

负责：

-协议；
-wire lowering；
-auth mechanism；
-stream parser；
-error normalization；
-provider-native controls。

它不是用户“站点”。

### Connection

负责：

- endpoint；
-secret / credential ref；
-network policy；
-gateway type；
-transport；
-user-owned config。

### CallableTarget / Deployment

负责：

- connection；
-requested remote target ID；
-target kind：
  - concrete deployment
  - provider model
  - virtual model
  - model group
  - gateway router
  - local runtime
- optional declared model identity。

### CapabilityEvidence

负责：

- capability；
-state；
-source；
-observedAt；
-scope；
-freshness；
-optional confidence / authority class。

### EconomicsEvidence

负责：

- price / quota / billing dimensions；
-source；
-observedAt；
-estimated / actual。

### HealthEvidence

负责：

- latency；
-success；
-errors；
-capacity；
-cooldown。

### RoutingPolicy

负责：

- hard constraints；
-preferences；
-budget；
-quality floor；
-privacy；
-affinity；
-allowed target classes。

### FailurePolicy

负责：

- same-target retry；
-same-model deployment failover；
-equivalent target；
-cross-model fallback；
-confirmation；
-stop。

### EffectiveExecutionSnapshot

负责：

- selected target；
-selected connection；
-resolved Prompt / Behavior；
-Generation controls；
-Context；
-capabilities；
-cost estimate；
-routing reasons；
-policy revision；
-provider adapter revision；
-observed gateway transparency。

### ExecutionObservation

负责：

- response-reported model；
-usage；
-latency；
-gateway metadata；
-provider metadata；
-actual / settled cost；
-errors；
-fallback path。

---

## 27. 对当前 RuntimeRoute 的建议

长期不建议让 RuntimeRoute 继续作为：

> exact model + exact connection + exact prompt + exact generation + role + fallback

的持久化组合。

更适合：

### 持久化

- RoutingPolicy；
-default Behavior / Creative refs；
-default Generation policy；
-budget policy；
-role requirements。

### 请求时生成

- EffectiveRoute / ExecutionPlan。

如果需要“强制固定模型”的高级模式，也可以通过 Policy 表达：

allowedTargets = [exact target]

而不是重新让所有用户都管理固定 Route。

---

## 28. Connection 和 Model 两层不需要全部推翻

当前结构里：

Connection
→ Model

这个关系仍然合理。

但建议语义调整为：

Connection
→ Callable Target / Deployment

因为第三方网关中：

remoteModelId

可能只是：

- alias；
-virtual model；
-group；
-router；
-mapped name。

然后可选地再关联：

Declared / Observed Model Identity。

这样既能支持 direct provider，也能诚实支持 opaque gateway。

---

## 29. Atria 不应该自己维护一份“永远正确的全球模型数据库”

模型、价格、上下文、功能和 Provider 每天都在变化。

更合理的是多源证据：

### Built-in adapter knowledge

只保存：

-协议 invariant；
-高置信 provider semantics；
-必要兼容逻辑。

### Provider discovery

实时读取：

- model list；
-limits；
-supported methods。

### Gateway discovery

读取：

- virtual models；
-price；
-provider metadata；
-capability metadata。

### Remote catalog

可选同步官方 catalog。

### Active probe

验证：

- tools；
-structured output；
-reasoning；
-streaming。

### User override

最后兜底，但必须标记为 override。

Atria 不应该为了“自动识别”而把陈旧静态表当 authority。

---

## 30. Capability Probe 值得成为正式能力

面对 OpenAI-compatible 第三方站点尤其重要。

可以研究安全、低成本 probe：

- list models；
-small text completion；
-stream；
-tool schema；
-structured output；
-reasoning control；
-usage reporting。

Probe 必须：

-用户主动或明确允许；
-有成本提示；
-不发送私密 RP 数据；
-使用固定无敏感测试输入；
-有 cooldown / cache；
-记录 observedAt；
-不会因为一次成功就永久标记。

这样可以减少：

> “New API 里写着这个模型，所以它一定支持所有 OpenAI 参数”

这种错误。

---

## 31. Atria 的 Routing UI 也应该改变心智模型

现在用户看到：

站点
→ 模型
→ 路由

未来普通用户更适合：

### Connections

“我的 AI 服务”

例如：

- OpenAI；
-Anthropic；
-My New API；
-My Sub2API；
-OpenRouter；
-Local GPU。

### Available Targets

Atria 自动发现 / 用户确认。

### Usage Policies

例如：

- Default RP；
-Deep RP；
-Utility；
-Memory Maintenance；
-Private Local Only。

用户真正设置：

> “普通 RP 优先性价比，重大剧情允许旗舰模型；Memory maintenance 尽量本地；私密 Package 不走第三方中转。”

而不是维护大量固定 Route。

高级用户仍可查看：

- exact targets；
-provider order；
-capability evidence；
-price；
-health；
-routing trace。

---

## 32. 对第三方站点的专门 UI / Diagnostics

对于 New API / Sub2API / 自建兼容站，建议明确展示：

- Gateway；
- requested model；
-resolved / reported model，如果可知；
-gateway transparency level；
-capability source；
-price source；
-route / channel metadata，如果返回；
-unknown upstream warning；
-observed usage；
-gateway errors；
-session affinity 状态。

尤其不要把：

My New API → gpt-x

渲染成：

OpenAI Direct → GPT-X

除非有足够证据。

---

## 33. Routing Telemetry 应成为 Sparse Compute 的底座

上一份 Sparse AI Invocation 报告要求：

-每个 escalation 可解释；
-cost / latency 可追踪；
-动态计算预算。

本报告补充：

每次模型选择最好记录：

### Decision

- task class；
-compute tier；
-candidates considered；
-hard-filter reasons；
-score dimensions；
-selected target；
-estimated cost；
-capability evidence；
-health evidence。

### Execution

- attempts；
-retry；
-failover；
-fallback；
-gateway route metadata；
-reported model；
-tokens；
-latency；
-cost。

这样才能离线回答：

> “如果这 100 个 Standard RP turn 都改走另一个 Gateway / 模型，质量和成本会怎样？”

---

## 34. Traffic Mirroring / Shadow Eval 很值得预留

LiteLLM 已支持 traffic mirroring，把生产请求复制给 silent model，结果不影响用户主路径。

Atria 作为前沿试验田特别适合研究类似能力。

例如用户明确允许后：

Primary
→ 正常正文

Shadow
→ 新 model / new Prompt / new router

Shadow 结果不展示，只进入 Eval。

这样可以：

-比较新模型；
-校准 router；
-验证第三方网关；
-测试 Prompt lowering；
-发现 provider regression。

必须有：

-隐私开关；
-额外成本预算；
-不写正式 State；
-不触发 Tool side effects；
-明确 experimental trace。

---

## 35. Routing 与 RP Quality 之间需要专门 Eval

模型 router 的 benchmark 不能只用通用 QA。

Atria 应评估：

- persona fidelity；
-narrative style；
-long-session continuity；
-tool correctness；
-memory enactment；
-state correctness；
-latency；
-cost；
-regenerate rate；
-user edits。

同一个模型可能：

-代码强；
-工具强；
-但 RP 文风差。

因此 quality score 应按 role / task class 分开。

例如：

- writer quality；
-cognition quality；
-memory extraction quality；
-tool planning quality；
-judge quality。

不能只有一个“模型智力分数”。

---

## 36. 推荐 Routing 优先级不是一个固定公式

不同任务应该有不同 objective。

### Main RP writer

可能更看重：

- RP quality；
-style stability；
-latency；
-context；
-cost。

### Cognition

更看重：

- reasoning；
-structured output；
-consistency；
-cost。

### Memory maintenance

更看重：

- extraction precision；
-cost；
-batch；
-local availability。

### Utility classifier

更看重：

- latency；
-cost；
-determinism。

### Project Agent

更看重：

- tool use；
-long horizon；
-code / planning；
-reliability。

所以 RoutingPolicy 最好按 role / task contract 选择不同 scorer，而不是一个全局排序。

---

## 37. 推荐的三类 fallback

### A. Infrastructure failover

同一语义目标，换 endpoint / region / key / account。

例：

- Azure region A → region B；
-LiteLLM deployment A → B；
-OpenRouter provider A → B。

通常可以自动。

### B. Equivalent-model failover

换成被验证为相近行为 / 能力的目标。

可能自动，也可能要求 policy 允许。

### C. Semantic model fallback

换到不同模型家族 / 明显不同质量。

例如：

- flagship → cheap model；
-Claude → GPT；
-writer-specific → general model。

这会改变行为，应更严格：

-明确 policy；
-quality floor；
-可能要求确认；
-必须进入 execution trace。

---

## 38. 第三方网关的内部 retry 不应和 Atria retry 相乘失控

LiteLLM 文档明确讨论了 router retry 与 provider SDK retry 的重复问题，并避免把重试平方放大。

Atria 连接到：

- OpenRouter；
-New API；
-Sub2API；
-LiteLLM

时，上游自己可能已经：

- retry；
-failover；
-switch account。

如果 Atria 再无条件做多次 retry：

> 一次正文可能被放大成大量真实上游调用。

因此 Connection / Gateway profile 应能描述：

- upstream owns retries；
-Atria retry budget；
-idempotency risk；
-retry-after handling；
-max total attempts。

最终预算应限制：

> total attempts across nested routers

而不是只数 Atria 外层 attempt。

---

## 39. Gateway 价格可能是“用户售价”，不是基础模型成本

New API Ratio、OpenRouter markup / provider price、Sub2API billing 都意味着：

Atria 用户真正付的钱可能与官方 Provider price 不同。

因此 UI 可以区分：

- Estimated user cost；
-Official reference cost；
-Gateway quoted cost；
-Observed settled charge。

不要拿 OpenAI 官网价格直接估算一个 New API 连接的费用。

---

## 40. Atria 应支持用户自定义“信任级别”

对于第三方站点：

-官方 direct；
-企业自建 gateway；
-自己部署 New API；
-陌生商业中转站；
-本地服务

信任程度不同。

RoutingPolicy 可以允许：

- trusted only；
-allow self-hosted gateways；
-allow third-party relays；
-no opaque gateway for private context；
-direct-only for secrets / sensitive tasks。

信任应该是用户配置 /组织策略，不由 Atria 武断判断站点“好坏”。

---

## 41. 推荐的演进路线

不是实施 Plan，只是研究顺序。

### R0 — 明确对象语义

先冻结概念：

- Connection；
-Callable Target；
-Model Identity；
-Capability / Economics / Health Evidence；
-RoutingPolicy；
-FailurePolicy；
-Execution Snapshot。

### R1 — 解除 RuntimeRoute 过度绑定

让 Routing Policy 不再必须固定：

- model；
-connection；
-prompt；
-generation

整套排列。

### R2 — Dynamic Resolver

实现：

- candidate；
-hard filter；
-score；
-freeze。

### R3 — Gateway-aware evidence

正式支持：

- OpenRouter；
-New API；
-Sub2API；
-LiteLLM；
-generic OpenAI-compatible gateway。

### R4 — Telemetry / Economics / Health

建立真实：

- latency；
-cost；
-error；
-capability observation。

### R5 — Adaptive Compute integration

让 Sparse Compute 的：

- Fast；
-Standard；
-Deep；
-Utility

映射到 RoutingPolicy。

### R6 — Learned / Experimental routing

有足够 eval 后再研究：

- learned router；
-bandit；
-shadow traffic；
-auto model promotion。

---

## 42. 不建议现在做的事

### 不要直接删除 Connection

它仍然是必要真实边界。

### 不要把所有 Provider 都压成 OpenAI-compatible

统一 API 很方便，但会丢失：

- native reasoning；
-cache；
-tool search；
-realtime；
-provider state；
-special media capabilities。

应统一语义 IR，不是统一最低公分母 wire format。

### 不要把 New API / Sub2API 当成普通 OpenAI Provider

它们是 Gateway / Router boundary。

### 不要把 model name 当 canonical identity

尤其是 alias、model mapping、virtual group。

### 不要让 RoutingPolicy 保存实时健康度

健康度是 observation，不是 config。

### 不要把官方价格硬编码成用户真实价格

第三方站点可能完全不同。

### 不要让 dynamic routing 破坏 replay

每次真正执行必须冻结 snapshot。

### 不要让 nested fallback 无限乘法

全链路需要 attempt budget。

---

## 43. 对当前三层结构的最终判断

当前：

站点 / Connection
→ 模型 / ModelProfile
→ 路由 / RuntimeRoute

长期建议演化成：

Connection / Gateway Boundary
→ Callable Target / Deployment Pool
→ Routing Policy
→ Runtime Resolution
→ Exact Execution Snapshot

其中可选再关联：

Callable Target
→ Model Identity

而 Prompt / Behavior、Generation、Context、Compute Budget 则作为 Resolver 输入，不再全部固化进 Route。

这保留了当前系统最有价值的：

-明确连接；
-能力验证；
-exact snapshot；
-provider adapter；
-fallback safety；

同时解决未来：

-动态模型选择；
-第三方聚合站；
-多 Provider；
-local model；
-sparse compute；
-成本路由；
-实验路由；
-模型 alias；
-网关嵌套路由。

---

## 44. 对三份研究的统一关系

### Prompt / Context / Generation Frontier

回答：

> 模型应该看到什么、Behavior / Prompt 应如何表达。

### Sparse AI Invocation / Adaptive Compute

回答：

> 这一轮到底值得花多少 AI 计算。

### Model / Provider / Routing Frontier

回答：

> 这些计算具体由哪个实际资源执行，以及为什么。

统一链路：

Task / Runtime Evidence
        ↓
Context + Behavior Semantics
        ↓
Computation Budget
        ↓
Routing Policy
        ↓
Target / Deployment Resolution
        ↓
Effective Execution Snapshot
        ↓
Provider / Gateway
        ↓
Observation / Eval / Experience

---

## 45. 后续 Codex 合并进正式企划时必须检查

1. 当前 Agent Intelligence Runtime 是否把具体 Model / Route 写死在过多阶段；
2. Prompt / Generation 是否被错误当作 Routing 的同一对象；
3. Computation Allocation 是否真正能动态选择 Model tier；
4. New API / Sub2API / OpenRouter 这类 Gateway 是否有独立语义；
5. remote model ID 是否被误当 canonical model identity；
6. Capability 是否带 provenance / freshness；
7. Pricing 是否允许 gateway-specific / user-specific evidence；
8. Quality Routing 与 Failure Fallback 是否拆开；
9. nested gateway retry 是否有全链路 attempt budget；
10. Execution Snapshot 是否仍可 replay / audit；
11. opaque gateway 是否会被诚实标为 upstream unknown；
12. session affinity 是否可选且受 policy 约束；
13. local utility model 是否能作为正常 target 参与路由；
14. 每个 dynamic routing decision 是否进入 trace；
15. 是否能用真实 RP eval 衡量“路由省的钱是否值得”。

---

## 46. 外部资料索引

### Direct providers / model identity

- OpenAI Models
  https://developers.openai.com/api/docs/models
- OpenAI model snapshots / aliases
  https://developers.openai.com/api/docs/models/chat-latest
- OpenAI deprecations
  https://developers.openai.com/api/docs/deprecations
- Gemini Models
  https://ai.google.dev/gemini-api/docs/models
- Gemini Models API metadata
  https://ai.google.dev/api/models
- Gemini API versions
  https://ai.google.dev/gemini-api/docs/api-versions

### Cloud deployments

- Azure OpenAI endpoints / deployments
  https://learn.microsoft.com/en-us/azure/ai-studio/ai-services/concepts/endpoints
- Azure OpenAI quota
  https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota
- Azure deployment types
  https://learn.microsoft.com/azure/ai-services/openai/how-to/deployment-types
- Azure Model Router
  https://learn.microsoft.com/en-sg/azure/ai-foundry/openai/concepts/model-router

### Routing / aggregation

- OpenRouter provider routing
  https://openrouter.ai/blog/insights/model-routing/
- OpenRouter failover
  https://openrouter.ai/blog/insights/reliability-failover/
- OpenRouter provider performance
  https://openrouter.ai/blog/insights/evaluate-llm-provider-performance/
- LiteLLM Router
  https://docs.litellm.ai/docs/routing
- LiteLLM Proxy architecture
  https://docs.litellm.ai/docs/proxy/architecture

### New API

- New API repository
  https://github.com/unorouter/new-api
- New API Channel Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/channel
- New API Model Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/model
- New API Group Management
  https://docs.newapi.pro/en/docs/guide/feature-guide/admin/group
- New API Ratio Settings
  https://docs.newapi.pro/en/docs/guide/console/settings/rate-settings
- New API Changelog
  https://docs.newapi.pro/en/docs/guide/wiki/changelog

### Sub2API

- Sub2API repository
  https://github.com/hopol/sub2api
- Sub2API scheduling / deployment config
  https://github.com/Wei-Shaw/sub2api/blob/main/deploy/config.example.yaml

---

## 47. 后续 Codex 读取要求

当准备把本研究更新进正式架构企划时：

1. 先读 plans/architecture/agent-intelligence-runtime/index.md；
2. 按 index 只读需要修改的 Plan 模块；
3. 同时读取三份研究：
   - model-prompt-context-frontier-research.md
   - sparse-ai-invocation-adaptive-compute-research.md
   - model-provider-routing-frontier-research.md
4. 重新检查当时最新 main 的：
   - src/native/model-prompt-runtime/**
   - src/native/adapters/provider-discovery.js
   - Provider adapters
   - Native Task / Scheduler
   - Usage / Diagnostics / Request Inspector
5. 重新调研当时 Provider / Gateway 的真实协议、定价和路由；
6. 将本报告作为研究证据，不把候选对象名直接当最终 Schema；
7. 默认 Atria 是独立产品，不为了旧站点→模型→路由 UI 保留不必要兼容；
8. 必须把 New API、Sub2API 等第三方 / 自建网关作为正式一等场景，而不是“OpenAI-compatible 的边角兼容”。
