# Model / Deployment / Routing：请求时解析与可观察执行

> D2 / D3 / D4 正式架构方向；G01–G06 是有限交付设计，具体对象名、Schema、provider 版本和迁移在对应阶段冻结。
> 输入研究：[Model / Provider / Routing 报告](../model-provider-routing-frontier-research.md)、[Reasoning Continuity 报告](../reasoning-continuity-research.md)、[Execution Reuse 报告](../execution-reuse-cache-locality-adaptive-invocation-research.md)；行为、预算和产物复用分别由 [behavior-context](behavior-context.md)、[compute-policy](compute-policy.md)、[execution-reuse](execution-reuse.md) 管理。

## 1. 对象职责

| 概念 | 所属职责 | 必须保护的边界 |
| --- | --- | --- |
| Provider Adapter | 协议、auth、stream / error 归一化、原生 lowering 与 continuation 原样承载 | 不把所有 Provider 压成 OpenAI-compatible；Secret 只进入 send frame；不先压平原生 execution items |
| Connection / Gateway Boundary | endpoint、transport、credential ref、网络 / 用户信任配置 | 一个 Connection 可能连 Router；不宣称同一连接总是同一上游 |
| Callable Target / Deployment | 实际可请求的 model、deployment、virtual alias、group、router 或 local runtime | remoteModelId 是边界内标识，不等于 canonical model identity |
| Model Identity | declared / reported family、snapshot 与证据 | 可未知；模型字符串不证明官方身份或精确 snapshot |
| Capability / Economics / Health Evidence | target + boundary + protocol + 时间上的能力、价格、限额、延迟、错误 | 带来源 / freshness / scope；不是 RoutingPolicy 的永久实时字段 |
| RoutingPolicy | task 需求、hard constraints、quality floor、偏好、allowed targets / privacy / affinity | Policy 持久，具体选择请求时产生；固定模型可用 singleton allowlist |
| FailurePolicy | retry、同目标 / deployment failover、已验证等价模型、跨模型 fallback 或停止 | 与正常质量 / compute routing 分开；恢复不能降低硬约束 |
| Effective Execution Plan / Snapshot | 选中 target、精确行为 / 参数 / context、决策依据与 attempt anchor | 扩展现有 request snapshot；不另建矛盾的 effective config authority |
| ExecutionObservation | reported model、usage、charge、TTFT、error scope、gateway 返回路径 | 追加响应事实，不修改发出前 snapshot，不把 observation 当可信 host 权限 |

不要求每个概念一张表。ConnectionProfile / ModelProfile 的数据可沿版本化契约演进；当前 ModelProfile 已近似 Callable Target。
RuntimeRoute 先以“固定候选 + 既有 exact behavior / generation”适配新 policy；完整新路径不再要求持久化所有排列组合。旧 Route 精确读取继续可用。

## 2. Evidence 与不确定性

Reasoning Continuity 与 Provider / Inference cache capability 复用下列 Capability Evidence 与精确路径契约，详细生命周期与能力分别见 [§7](#7-reasoning-continuity执行状态与生命周期)、[§8](#8-cache-capability与cache-locality)。

Capability 的 supported / unsupported / unknown 保留，补精确 connection / target / adapter / protocol 指纹、observedAt、失效规则与证据用途。
adapter 支持构造某个字段，只证明 client 实现能力；不能据此认为任意兼容 gateway 透传、执行或校验该字段。
Discovery、官方 metadata、gateway 声明、主动 probe、成功 / 拒绝观测与 user override 分层记录。冲突保留各来源，按明确规则拒绝或转审阅，不以一次成功覆盖近期明确拒绝。
未知能力默认不满足 hard requirement；已支持的显式 override 继续可用并标来源，不把它升级为测量事实。Probe 使用无私密 fixture、显式启用、有限预算与 cooldown。

价格按实际 target / 用户计费边界建证据：币种、单位、输入 / 缓存 / 输出及工具 / media、tier、region / group、source 和有效时间。
区分 official reference、gateway quote、estimated user cost 与 observed / settled charge；token usage 不自动证明收费已结算，quota 点数不未经换算当货币。
没有价格不按零成本排序；金额约束需要保守上界或拒绝。Health 用 bounded sliding observations，区分 network、auth、quota、429 / 5xx、timeout、parser / contract failure；不将网关错误猜成上游错误。

## 3. 解析与 Context 的有界协作

1. 从 task / role、output / tool contract、必需证据与用户模式得到需求；ComputePolicy 给出可用额度与计算动作，RoutingPolicy 给出允许资源。
2. 从获准 Connection / Target 形成有限候选；过滤权限、隐私 / 地区、必需能力、最小 context、禁用 / health 与预算不可能项。
3. 按 task-specific quality evidence、预计用户成本、延迟、affinity 与 §8.2 的 Cache Locality 对可行项排名；score 不是全局“模型智力值”。初期固定规则，不默认 learned router，unknown cache 不推断为命中或零成本。
4. 在选中 target 的限制与 tokenizer 下构造 / 校验 Context Plan、精确 Behavior overlay 和 Generation controls；复核 exposure 与工具 / 输出契约。
5. 编译后精确 token admission；若必要内容装不下，有限次数重选候选并重新编译，记录排除原因。不得无限在 Context / Router 间循环、删必要证据或静默换文风。
6. 按 §7 重验 continuation 的路径、任务 lineage 与编译后 prefix / tools / history 绑定；按 execution-reuse 重验依赖最终 target / 编译产物的复用条件，由 §8 的 adapter 映射获准 cache controls。固定决定与 evidence，再固定 snapshot、reserve、send，响应追加 observation。一次 task 可有多个 attempt snapshots，但 accepted semantic task / authority 始终固定。

动态策略本身有 exact policy revision；实时 evidence 集合也固定指纹 / 时间以便审计。请求接受后修改 policy 或配置不会热改该请求；后续新 attempt 按已接受 FailurePolicy 重验 source 和约束。
重建编译与决策可在记录条件下测试；无法控制上游 alias / 随机响应时明确 replay fidelity，不承诺逐字确定性。

## 4. 故障恢复与嵌套 Router

恢复层级：same target retry → 允许的同模型 deployment failover → 经该任务类验证的 equivalent target → policy 明确允许的 cross-model fallback → 停止 / 现有审阅。
每层仍检查 tools、output ownership、context capacity、privacy / residency、quality floor、deadline 与剩余预算；没有可行目标就返回明确失败，不调用 disallowed target。
工具 / 输出契约变化不属于恢复；必须回到任务设计或审阅。部分 stream / tool effect 已发生时用原 effect identity 与 receipt 判定重试安全，不能盲重放生产副作用。

Native scheduler retry、Host role retry、Generation fallback 与 gateway 内部 retry 共用可观察 attempt root。每次 Atria send 均计账，不以 final response 数代替发送数。
Gateway 自己持有重试时尽量禁止重叠 retry；可取得其 limits / metadata 时校验全链路上界。不可取得时标 `upstream_attempts_unknown`，限制外层、保留最大费用 reservation，无法满足严格全链路上限则该 target 不可选。
取消仅保证本地停止等待 / 接纳结果；未获上游 cancel receipt 不宣称远端停止计费。Provider-managed state / affinity 变更按 §7 重验；恢复尝试单独记录 continuation 保留、重置或丢失，不能把旧 reasoning / conversation handle 跨未知目标重放。

## 5. Gateway 与 Local 是正式场景

| 场景 | 必须记录的事实 | 集成验证 |
| --- | --- | --- |
| Direct / cloud deployment | 请求 target、声明模型 / region、可取得 snapshot / limit 来源 | 实际 adapter 的工具、输出、reasoning / cache、失败与 usage |
| OpenRouter | virtual model、provider prefs、返回的 provider / model / usage | 参数要求、privacy 筛选、failover；不假设默认透传全部参数 |
| New API | virtual alias、可取得 channel / mapping、parameter override、价格 / group 来源 | 映射 / 参数重写、缺失 usage、网关限流；unknown upstream 正确显示 |
| Sub2API | gateway boundary、账号池 / sticky 声明、可见调度 / billing | affinity、并发 / retry 与未知账号；不收集上游账号 credentials |
| LiteLLM | model group、可见 deployment、cooldown / nested retry | pool selection、健康变化与重试准入 |
| Generic opaque gateway | requested target、reported model、unknown upstream / version | 不凭名称推断能力、官方价格或等价模型 |
| Local utility | 实际 endpoint / process、模型版本与可见设备限制 | 与远程同等 admission、失败 / 不可用、延迟与质量证据 |

路径每段标 declared / observed / verified / unknown，并保留 producer；响应自报模型仍只是 boundary-reported。
透明度描述可观测性，用户信任与数据发送许可另设 policy；不能因为 metadata 更全就自动信任。
Affinity 支持 prefer / require 等显式策略；prefer 可在合规条件下让位，require 不满足则停止；不能以 sticky 为由越过能力、健康或预算。
Delegated router 可作一个 target；Atria 只在证明委托方满足 hard constraints 时选择，否则不能发送受该约束的数据。

G04 的 gateway 语义用本地可控 HTTP fixtures 确定性验证；正式接入至少完成可用真实 gateway 的有限 integration，再按矩阵注明其余未测项。不得把 fixtures 写成全部品牌服务已经兼容。
本轮不创建连接、获取凭据、发起 probe 或购买 / 下载模型。

## 6. 演进、评价与权限

G01–G06 是 M1 之后的有限基础交付组；先有固定 policy 与实际消费者，再连接 S26 的 adaptive compute。S09 仅演化已有 allowed orchestration 参数，不自动修改 connection、routing privacy / trust 或全局默认。
Routing / overlay / model selection 优化产物进入现有隔离评价与 promotion，但新增目标 allowlist 和自动发布权限必须另行明确；M1 已批准三类候选不能扩张成自改 Provider 权限。
模型质量按 RP writer、cognition、Memory extraction、judge 与 Project task 分别评价；opaque / alias 漂移报告样本时段和 upstream 可知程度，不能复用旧 snapshot 的晋升结论。

G06 必须在双入口看到 why selected、可见 target / upstream、attempts、estimated / observed usage 与不足 / stale / policy denied / cancelled 状态；高级入口展示 compiled request 的获准内容，默认不展示 Secret 或私有 cognition。
路由更新与旧 Route / Package 迁移有 dry-run、前后 exact binding、冲突检测和撤回；save / export / restore、删除用户 / target、read-only 兼容在对应资源阶段验证。
Shadow / mirroring、bandit 与 learned router 留作后续实验：明确数据发送许可、额外预算、隔离工具与不 publication；本轮不授权生产流量复制。

## 7. Reasoning Continuity：执行状态与生命周期

### 7.1 定义与术语归并

Reasoning Continuity 是现有 Model / Execution Runtime 的可选一级执行能力：在兼容调用、工具循环或同一 Task 的阶段间，延续 Provider 原生的不透明执行状态。Provider Adapter 承载协议，Runtime 管理使用范围与生命周期；不新增 Plane、模型执行器或配置 authority。

| 研究中的表达 | 本企划采用的职责 / 术语 |
| --- | --- |
| Reasoning Continuity Capability | 现有 Capability Evidence 的一个维度；supported / unsupported / unknown 与来源 / freshness 保持 |
| Continuation Handle / ReasoningContinuation | Runtime 管理的不透明 continuation handle；不另建普通 Task Artifact 类型 |
| ProviderNativeExecutionEnvelope | Provider Adapter 保留的原生 execution envelope，与 canonical chat message 分离 |
| Continuation Policy | 已接受 task / role 执行要求，经 RoutingPolicy / FailurePolicy 与 ComputePolicy 约束；不另建路由 authority |
| Exact Execution Snapshot / continuity evidence level | 现有 Effective Execution Plan / Snapshot 与 ExecutionObservation；证据仍用 declared / observed / verified / unknown |

能力判断区分模型是否能推理、当前 execution path 是否保留状态，以及这一个 handle 此刻是否有效。Provider cursor 与 client-held opaque items / signed blocks 是同一能力的不同 transport；普通 conversation cursor 不自动证明含可延续推理。范围至少区分当前 execution 与跨 turn 的同一 task，未知跨 turn 能力不能借用当前工具循环的成功观测。

### 7.2 Adapter 与 Runtime 分工

Provider Adapter 负责原生状态捕获、有限序列化 / 恢复、request mapping、response extraction 与方向性兼容判断，保留协议要求的 items / blocks、顺序、tool call / result identity 和签名。Core 不解析、改写或把 opaque payload 变成文本。Streaming 先完整重组和校验，缺 block / signature、取消或不完整响应不能发布为有效 checkpoint。

原生 execution envelope 至少保留到工具循环、continuation capture 与可见消息提取完成；canonical chat message 仅承载既有可见消息语义。摘要 / 可见 thinking 属于获准 presentation，不能替代 continuation，也不能作为恢复 hidden reasoning 的依据。

Runtime 沿原 run / child / request / attempt 与 lifecycle authority 绑定 owner、task、turn、branch、revision / message variant 和 parent checkpoint。Handle 管理来源路径 / target / protocol、兼容证据、prefix / tools / history 指纹、policy revision、有效状态与失效原因；这些是契约要求，物理 schema、资源 key、TTL、校验 / 迁移和失败处理在 G01 定稿。

Capability Evidence 必须绑定实际 Connection / Target / adapter / protocol 与可观察 gateway mapping / account affinity。Adapter 可构造字段、模型名称、同 Provider 或 OpenAI-compatible 接口都不能证明可续接。兼容关系允许有方向性；模型 family、account、prefix 等约束由所选 adapter 的固定版本与路径证据验证，不在 Core 写死通用规则。优先原生协议，gateway 经精确路径的有限 probe / integration 后才标 verified；不可见内部切换保留 unknown。

### 7.3 使用范围与生命周期

执行 policy 的语义范围为 `none / active_execution / task / adaptive`：分别为不延续、当前工具循环、同一 task 跨 turn，以及在既有许可范围内按证据选生命周期动作。`none` 停用的是可选跨调用状态保留；若 Provider 协议要求当前工具循环回传原生 blocks，仍须按协议完成，不能删字段伪造无状态请求。Policy 要求连续性而当前路径无法证明时，阻断该路径；允许重新推理时才可 reset，且记录损失。

| 动作 | 条件与结果 |
| --- | --- |
| continue | 目标仍适用、lineage 连续、路径与 handle 有效，编译后的 prefix / tools / history 绑定满足；重验后接续 |
| fork | 从获准且兼容的祖先 checkpoint 创建独立 lineage；Provider 不支持安全复制时各自 reset |
| reset | 目标 / 策略转向、重新采样或 stale-plan signal 时重新推理；保留获准普通 Context 与正式 task / domain state |
| discard | 技术失效、删除、TTL / 容量淘汰或 privacy clear 时清除 handle / payload；保留获准最小失效原因 |

同一 attempt 的 transport retry 也要重验 checkpoint 和已发生 effect；regenerate / 新 message variant 默认 reset 或安全 fork，不能续接被放弃候选的后续 reasoning。修改 checkpoint 前的历史会失效其后 descendants；编译、overlay、system / tools 或压缩改变绑定时重验，不能为 append-only 协议跳过 source freshness / exposure。

Restore 只可选择该 revision / variant 可达且仍兼容的 checkpoint，否则重新推理；未来 revision 的状态不得带回。Branch 可在权限与 adapter 支持下共享不可变祖先，各自后续 lineage 隔离；兄弟 branch 的 handle 不可交叉使用。普通 RP 用自身 message / variant anchor，不能虚构 Native revision。Goal 的 durable wake / task 恢复是调度契约，continuation handle 本身不授予唤醒、完成或写入权限。

模型、Provider、account、protocol、gateway mapping / affinity 或 deployment fallback 变化，都作为新 attempt 重新判断。不能跨不兼容路径 replay；允许 fallback 时使用获准显式 task state / plan / receipts 重新推理，不重放已执行生产 effect。

### 7.4 快照、存储与边界

发送前的 Effective Execution Plan / Snapshot 固定 requested policy、实际拟采用范围、来源 checkpoint / lineage、路径与 binding 证据、兼容决定，以及 continue / fork / reset / discard 原因。响应 ExecutionObservation 追加实际捕获 / 保留 / 重置 / 丢失 / 不兼容 / unknown 结果及 fallback loss，沿 attempt identity 关联；不得事后改写发出前 snapshot，也不能用 API 成功推断旧状态已被使用。

共享 Experience evidence 只保存获准的 handle 标识、决定、损失原因与 usage 完整性；opaque payload 留在受权限和容量控制的 Runtime checkpoint，经既有 StorageEngine / recovery 路径持久化。Checkpoint 与可导出学习轨迹分开，不复制进 World / Session domain state、Memory、角色卡、World Book、Package 或 Experience 候选；Package / 脚本不能任意读写。

删除 continuation 不改变正式世界、Studio revision、Goal evidence 或 receipts。Session / Character / Package / Save 的可移植导出默认排除 opaque 状态；未来若需恢复进行中任务，另定义获准 Runtime checkpoint 导出，恢复时重新认证并验证路径 / account / binding，不能把 cursor 当 credential。关闭功能、删除 owner / source / connection、撤回授权与 storage failure 都有清除 / 失效或显式 unavailable 路径，不能因此假报任务恢复成功。

Raw CoT 不成为核心逻辑、评价或产品展示的依赖；`<think>` 文本不模拟原生连续性。需要长期或跨路径复用的成果只使用显式 Plan / Summary / Task Artifact / Receipt，并按其原 provenance、dependency、applicability 与消费授权校验；模型总结不自动成为 World Truth。Provider-native compaction / clearing 仅在能力被验证时使用；否则生成获准有界摘要、按原契约验收后 reset。Prompt cache、Context cache、Task Artifact reuse 与 continuation 分别解决前缀处理、上下文派生、已完成工作复用和进行中推理接续，不共用失效规则。

### 7.5 角色策略与验收

Planner / Project Agent 的多步任务优先评价 task continuity；工具编排 / State Resolver 优先 active_execution。Narrator 默认 fresh 或短 horizon，使用显式 narrative / actor state；不以永久 all-turn opaque reasoning 固化角色标签。独立 Critic / Validator 不继承被评方案的 opaque lineage，消费获准证据与显式候选；常规检索 / 确定性 runtime 不为连续性固定增加调用。具体默认启用、支持矩阵与 adaptive 信号在 M8 设计 / 真实评价后冻结。

G01–G06 的实施映射见 [delivery §8](delivery.md#8-m8--生成与计算基础新增有限交付组)。先契约，再 OpenAI Responses reference、Anthropic native、Gemini native、gateway probes，最后有证据的 adaptive policy / eval；这是 adapter 验证顺序，不是另建 A–F 六个正式阶段，也不保证未测模型版本的支持。

复用 M1 Eval / ComputePolicy，在相同有限预算、task / 输入与可观察配置下比较不延续、active_execution、task 与 adaptive；协议必需回传保持，无法形成合法对照的组合标 unavailable。验收覆盖工具正确性 / 冗余查询、goal shift、stale-plan contamination、branch independence、regenerate、fallback loss、stream 完整性和 restore / edit 失效；RP 加角色一致性、重复 / 多样性、文体机械化与叙事新鲜度。分别报告成功率、可见 / reasoning / cache usage、调用数、延迟与缺失分母，不把研究 benchmark 或协议 round-trip 当 Atria 行为收益。Probe 仍需显式启用、无私密 fixture、有限预算与 cooldown；本轮企划整合不发起请求。

## 8. Cache Capability与Cache Locality

### 8.1 三层能力与 Adapter 边界

| 层 | 能力与职责 | 不能推断的事实 |
| --- | --- | --- |
| Application Reuse | 原 Runtime / artifact / tool / Context consumer 证明有效并缩减工作；规则见 [execution-reuse](execution-reuse.md) | 存储命中、相似度或 metadata current 不自动授予复用 / 写入 |
| Provider Prompt Cache | 原 Provider Adapter 映射隐式 prefix、显式 breakpoint / cache object、key / TTL / invalidation、prewarm 与 usage telemetry 的实际支持 | 能发字段不等于该 exact gateway path 支持，稳定 prefix 不等于实际命中 |
| Inference Backend | Local / self-hosted adapter 声明 Prefix / Segment / non-prefix / hierarchical KV、retention / prefetch / offload / compression 与 decode acceleration | Cloud API 不暴露 GPU KV 控制；文本相同不证明非 prefix KV 等价或安全 |

不合成一个 cacheSupported boolean。每个维度沿原 supported / unsupported / unknown 与 exact connection / target / adapter / protocol、account / affinity、freshness 和用途 evidence 管理；带来源、可观察 cache scope、兼容 / invalidation 限制。当前支持矩阵、最小长度、TTL、计费、具体字段与模型版本在 G04 进入前核对，不从研究示例冻结为通用 Schema。
OpenAI、Anthropic、Gemini 的原生协议分别由各 adapter 编译；上层只表达获准 Segment / prefix layout 与 cache 意图，不依赖厂商字段。Gateway 可能重写参数、tool order、upstream、affinity 或 usage，必须以精确路径的 evidence / 有限 integration 判断，OpenAI-compatible 不证明透传。

Provider API 路径可协调 layout / controls / telemetry，底层 KV 仍归 Provider；Local 路径对接成熟 backend，不自行实现 CUDA / Attention / GPU cache engine。Speculative / multi-head decode 等能力额外声明 sampling / model 兼容、lossless / approximate 证据与 quality mode / recompute policy，未验证不透明拼接 Segment KV。
vLLM / SGLang 与 EAGLE / Medusa、KVFlow / CacheScout 等是后续 backend / 算法候选，按有限真实 PoC 定稿；算法名不进入 Package / Narrator 的必需契约。获准 workflow / tool progress hints 由 compute-policy §4 提供，Trust Domain 沿 execution-reuse §6，默认不放开跨用户 / Package KV。

### 8.2 Cache Locality 与有效成本

**Cache Locality 表示在当前获准执行路径与隔离域中，可用 prefix / resource / backend 状态的邻近性及有来源的可复用预期。** 它是现有 RoutingPolicy 可行候选的成本 / 延迟因素，不能证明应用结果有效或降低 hard constraints。
先满足 authority / 权限、隐私 / 地区、output / tools、quality floor、必要 Context、continuation 硬要求和预算，再考虑 locality。不能为了 sticky cache 选不支持任务的 target、把私有内容发送给新边界，或牺牲 Narrator 新鲜度。

有效成本分别考虑未缓存 input、cache read / write / storage、output / reasoning 及 tools / media、prewarm、可控 retry、network / tool locality、延迟与 continuation loss。Usage 子项依 provider 语义计数，不能重复相加；loss 未校准时仅作明确 policy penalty / 拒绝原因，不伪装成货币费用。
第一版使用已有可信价格 / 直接观测和有限规则，不实现精确 hit 概率预测或 learned cache router。Expected cache hit / cost 标 estimated 与来源 / 有效期；unknown 不按免费或 guaranteed hit 排序，硬金额准入仍要满足 compute-policy 的保守上界。
Fallback / model / boundary / affinity / prefix 变化重验 cache 能力与路径绑定、记录 cache loss / miss 或 unknown；Reasoning loss 单独沿 §7 记录，不能合并成一个 hit 标志。路由 locality 决定不代替消费前 validity proof。

### 8.3 Snapshot、Observation 与可检查的结果

发送前 Snapshot 固定 Context Segment / Resource refs、compiler / canonical / layout 版本与指纹、requested / selected cache mode 与 controls、prewarm 请求 / 已有 evidence、获准 ReuseDecision、Routing locality 依据 / 估算和拒绝原因。不保存 credentials、私有正文或 KV payload 到公共 evidence；原 request identity 保持。
响应 Observation 才追加 provider / gateway 报告的 cached / cache-write tokens、实际可见 cache mode / hit / loss、prewarm / backend 结果与 usage / charge / TTFT；先前 prewarm 观测可作为新请求的 evidence，但不能把未来 hit 事后写成发出前事实。

Provider-reported、gateway-reported、locally-verified 是来源 / 核对方式，复用原 declared / observed / verified / unknown evidence 层级；estimated savings 与 unknown 单独标记。只记录可见层的报告；gateway 返回 cached_tokens 不证明哪个 upstream 命中、TTL 或重试全貌。未报告 cache usage 保留 missing / unknown，不写零，不用 API success 或低延迟猜命中。
未发送的纯应用复用只有 task decision 与原产物 provenance，不能伪造 request attempt / token usage。Saved model / tool / plan calls、tokens / 延迟按 execution-reuse §7 与 ComputePolicy 的对照 / 估算归因，分别报告实际支付与反事实节省。

G06 的已有请求检查 / 运行投影呈现有效复用、对象 / source、why miss、selected cache mode / target、可见 usage / unknown 和必要的版本 / 隔离诊断；普通用户只看到帮助理解结果与消费的摘要，不暴露 KV、opaque reasoning 或敏感 Context。指标 / paired eval 沿 [execution-reuse §7](execution-reuse.md#7-reusedecision评价与阶段路由) 与 compute-policy §5，不另建 Eval / cache authority。

D5 的 Hybrid 内部 Embedding、rerank / 辅助 LLM 与 prefix reuse 继续消费原 exact resource / target / adapter evidence，不形成对外 LLM/RAG 召回模式或独立发送器。H3 的模型准入与 H4 的实际 cache 观察沿 [delivery §8.2](delivery.md#82-hybrid-memory有限交付组与依赖) 接入 G05 / G06；未配置能力及 gateway 缺失 usage 分别标 unavailable / unknown，不推断免费或已命中。Memory 检索与硬切换详细规则只归 [hybrid-memory](hybrid-memory.md)，§7 continuation 生命周期保持独立。
