# Model / Deployment / Routing：请求时解析与可观察执行

> D2 正式架构方向；G01–G06 是有限交付设计，具体对象名、Schema、provider 版本和迁移在对应阶段冻结。
> 输入研究：[Model / Provider / Routing 报告](../model-provider-routing-frontier-research.md)；行为和预算分别由 [behavior-context](behavior-context.md)、[compute-policy](compute-policy.md) 管理。

## 1. 对象职责

| 概念 | 所属职责 | 必须保护的边界 |
| --- | --- | --- |
| Provider Adapter | 协议、auth、stream / error 归一化、原生 lowering | 不把所有 Provider 压成 OpenAI-compatible；Secret 只进入 send frame |
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
3. 按 task-specific quality evidence、预计用户成本、延迟、affinity 与 cache 对可行项排名；score 不是全局“模型智力值”。初期固定规则，不默认 learned router。
4. 在选中 target 的限制与 tokenizer 下构造 / 校验 Context Plan、精确 Behavior overlay 和 Generation controls；复核 exposure 与工具 / 输出契约。
5. 编译后精确 token admission；若必要内容装不下，有限次数重选候选并重新编译，记录排除原因。不得无限在 Context / Router 间循环、删必要证据或静默换文风。
6. 固定 snapshot、reserve、send；响应追加 observation。一次 task 可有多个 attempt snapshots，但 accepted semantic task / authority 始终固定。

动态策略本身有 exact policy revision；实时 evidence 集合也固定指纹 / 时间以便审计。请求接受后修改 policy 或配置不会热改该请求；后续新 attempt 按已接受 FailurePolicy 重验 source 和约束。
重建编译与决策可在记录条件下测试；无法控制上游 alias / 随机响应时明确 replay fidelity，不承诺逐字确定性。

## 4. 故障恢复与嵌套 Router

恢复层级：same target retry → 允许的同模型 deployment failover → 经该任务类验证的 equivalent target → policy 明确允许的 cross-model fallback → 停止 / 现有审阅。
每层仍检查 tools、output ownership、context capacity、privacy / residency、quality floor、deadline 与剩余预算；没有可行目标就返回明确失败，不调用 disallowed target。
工具 / 输出契约变化不属于恢复；必须回到任务设计或审阅。部分 stream / tool effect 已发生时用原 effect identity 与 receipt 判定重试安全，不能盲重放生产副作用。

Native scheduler retry、Host role retry、Generation fallback 与 gateway 内部 retry 共用可观察 attempt root。每次 Atria send 均计账，不以 final response 数代替发送数。
Gateway 自己持有重试时尽量禁止重叠 retry；可取得其 limits / metadata 时校验全链路上界。不可取得时标 `upstream_attempts_unknown`，限制外层、保留最大费用 reservation，无法满足严格全链路上限则该 target 不可选。
取消仅保证本地停止等待 / 接纳结果；未获上游 cancel receipt 不宣称远端停止计费。Provider-managed state / affinity 变更另行验连续性，不能把旧 reasoning / conversation handle 跨未知目标重放。

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
