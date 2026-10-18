# D5 — F2 Adaptive Compute、Model Routing、父子预算与执行复用（已冻结）

> 2026-10-15 第五轮用户选择 **F2：Evidence-driven Adaptive Compute**。跨模块决策摘要为 [decisions.md](decisions.md) D5。D2 单 Native Host/Effect 权威见 [architecture.md](architecture.md)，D3 Graph/Delegate/Join 见 [graph-control.md](graph-control.md)，D4 Audience/Source/Result 隔离见 [context-sharing.md](context-sharing.md)。本模块只规定 V3 **如何衔接原生计算与路由领域**，不增建第二套计算费用、路由、Provider、KV Cache、Memory 或 Evaluation 权威；不保留旧 Orchestrator 模式与兼容代码。

## 1. 既有领域权威与 V3 的责任分界

| 正式权威 | V3 允许的协调动作 | 不得重复实现 |
| --- | --- | --- |
| [Compute Policy](../../architecture/agent-intelligence-runtime/compute-policy.md)、Native RunControl、原 Studio Project Task | 提供请求需求、父子 Run identity、资源限制、预算 reservation 的引用及 EffectReceipt；必要时等待/阻断 | 新的独立扣费账本、绕过原 Host provider send 的模型请求 |
| [Model Routing](../../architecture/agent-intelligence-runtime/model-routing.md)、Native RouteResolver / Provider Adapter | 针对合法任务给出冻结 requirements、可选择目标集合与失败策略，消费真实 Snapshot/Observation | 独立 Model Gateway、Secret resolver、私有 continuation 平台 |
| [Execution Reuse](../../architecture/agent-intelligence-runtime/execution-reuse.md)、Task Artifact / Source adapters | 取得先找候选后验有效的 ReuseDecision，减少当前节点的重复工作 ||
| [Behavior/Context](../../architecture/agent-intelligence-runtime/behavior-context.md)、D4 C2 | 每 Agent 编译获准 Context，固定 request fingerprint 与合法 source refs | 把不同 Actor/Narrator 的私有上下文合并成一个全局前缀 |
| NativeTaskScheduler | 请求原资源 permits、执行优先级及公平排队 | 把现有进程内队列当作 V3 的持久 Run Ledger |

现有主线 `main@2686aa40a00c8bfccdc47c55d2b236b4878b022a` 已包含部分 Host 预算、模型路由、fallback 与 Scheduler 基础。**本轮是设计冻结，不声称已实现端到端父子预约、所有媒体/本地工作预算或 Provider Cache 收益。**

## 2. F2：Evidence-driven Sparse / Adaptive Invocation

Host 的调用准入采用“先满足已知需求、证据不足才升级”，不是每轮运行固定多 Agent 的流水线，也不是每轮先问 Meta-Agent 要不要继续。

2. **有效已完成工作复用**：依原 ReuseContract 搜索 Task Artifact、确定性只读 Tool 值、可信 Source、Graph/Plan 结构等候选，源/权限/输入/依赖/时点得到 proof 才消费。局部 valid hit 仅缩减对应工作，不说明其它 Effect 已执行。
3. **廉价受控工具和唯一 Hybrid Memory**：实际缺必要证据时请求获准的只读工具/检索；Embedding、Rerank、PPR 或辅助 LLM 均属于按需升级，需原预算与 Authority 准入，不默认所有候选方法并行执行。
4. **符合任务质量的目标**：产生内容/做复杂推理/生成正式可消费结果时，NodeAttempt 向原 Model Routing 提交 output、tool、context、privacy、quality、deadline 与预算要求。明显复杂任务允许直接路由到高能力模型，禁止强制 cheap→failed→strong cascade。
5. **动态图选择性扩展**：仅确有证据缺口/高影响决策/明确授权才建议 D3 GraphPatch、Delegate/Fanout/Judge/Review；Planner 是结构化建议者，Host 做最终准入，并限制次数/深度/循环/资源。
6. **RP 新鲜度**：普通回合目标是在确定性/必要 Context 后用一次主要 Narrator 正文生成；不固定额外 Planner/Critic/Judge/角色心理 LLM。可重用先前合法事实与计划，最终 prose fresh-generate。复杂 Project 与高影响游戏任务可以是多步/并行。
7. **后台有界**：整理/压缩/Eval 不阻塞无依赖的交互任务；优先级与 resource permits 由 NativeTaskScheduler 协调，取消尚在上游执行的任务不伪造已停止或已退款。

每次 F2 决策记录 task unmet needs、trigger/source、被跳过工作和原因、ReuseProof、可观测预算/成本、质量约束与退出条件。`zero extra cognition LLM` 不是“所有任务最多一次模型”，也不等于 CPU、Embedding 或工具零开销；具体触发阈值/档位数值留待实测，不恢复旧 Single/Spec/Loop/Agenda/Director 产品模式。

## 3. 任务感知 Model Routing、Fallback 与路径证据

- 缺必要证明不从模型名、网关兼容标签或缓存相似度猜测。
- **优选在合格集合内发生**：RouteResolver / RoutingPolicy 在满足硬条件的目标里权衡 quality/cost/latency/health/affinity 与 cache locality；Cache 命中估计不能覆盖 Source/currentness 与 OutputContract、不能因 sticky 目标降低保密或要求。
- 没有合格目标应报告 unavailable/blocked/review，而不是静默绕过质量底线。
- **请求时快照**：发出前记录 selected target、route/connection/adapter、source/Plan/context、实际 capabilities 证据、budget reservation、retry 级别与预期费用；响应后补真实 reported provider/upstream（若有）、usage、failed attempts、cache status、latency。Snapshot 与 Observation 不能相互伪造。
- **网关边界**：OpenRouter/New API/Sub2API/LiteLLM/opaque gateway 可以隐藏上游池、真实 canonical model、重试和价格；外部看不见时标 `unknown`，不声称全链路 exactly-once、真实金额上限或始终同一模型。
- **Provider fallback 的副作用**：部分 stream、工具调用或正式业务写入已发生时，重试必须先看 D2 EffectIntent/Receipt 与原 domain reconcile，不能为“模型失败”重做可能已提交的写效果。

## 4. 并行父子预算：单收费身份、原子预约与保守恢复

V3 不拥有独立的“余额真相”；其 Run/NodeAttempt/Effect 显示的预算是原 Native RunControl / Project Task 费用权威的授权与占用投影。

| 时点 | V3 行为 | 原 Native 领域动作 |
| --- | --- | --- |
| GraphPatch / Fanout 提议 | 计算需要的资源种类、质量要求、子任务与 deadline | 查询合法作用域现有 allowance，不生成虚假 provider usage |
| 准备并行派发 | 向同一父 scope 申请所有待发分支足够的保守 reservation，尊重运行中的占用及 scheduler permits | 原预算 authority 用 CAS/锁等序列化机制 **竞争地保证兄弟不重复花相同余额** |
| 真实模型/工具发送前 || 仅原 sender 按真实 send-attempt ID 记一次 charge；多层账本约束共享其 identity，不重复 charge |
| 完成/失败/取消 | 追加 EffectReceipt、结果、实际 usage/unknown | 原 authority 结算；只有明确未发出的保留款可释放，已发但未知不默认退款 |
| Host 崩溃或恢复 | 先从 Host Run Ledger 与原预算状态恢复同一身份 | 通过 durable identity/reconcile 保留已发生费用、未知用量与旧父占用，不能重新生成额度 |
| Retry/Fallback/Review/Replan | 新 NodeAttempt/EffectId，保留旧已发发送与预算记录 | 新发送再次由原父 scope 准入；旧已发尝试不因新图版本删除 |

- **单收费身份**：模型/Embedding/Tool/本地工作有原领域的稳定 charge attempt；V3 effectId 只是关联，不能在内部生成第二笔消费。质量评价/Judge 的额外发送也付费；未发生 provider 发送的纯 ReuseDecision 没有 request charge。
- **并行不是超支借口**：父子预算/帐号/Session/Project/foreground/background 等只能收紧，不能因为同一余额被多个 Agent 同时读取就分别准入。无法证明原子许可时保守拒绝并行派发或串行调度。
- **外部未知**：已发但 usage 缺失/网关自身 retry 不可见时保留 `unknown` 和当前已知保守上界。Gateway 内部请求是否可硬封顶需要确实的网关支持；否则金额只能 estimated，不能把 token 限额称为货币硬上限。
- **跨域存储事实**：FS/SQL 原权限/费用/正式业务提交不自动跨域原子化，Host 使用 idempotent identities + durable intent + reconcile 串联，不能谎称“整个图一笔事务”。
- **本地/Termux**：本地 LLM、Memory 索引、Embedding、cache IO、compaction、CPU/GPU/能耗的可见性取决于宿主。登记真实可观测开销与设备拒绝理由；没独立 CPU 计数不冒充 CPU 硬限。开发 API 测试执行约束只引用 [Repository Governance §13.1](../../../README.md#131-api-测试执行规则)，以用户当前任务的实际配置为准；本 Plan 不设置或复制测试调用限额，它与产品 Route/Run 的预算分开。

## 5. 三层 Cache 分离 + 有效性证明

| 层 | 真正复用的对象 | 主要准入/禁区 |
| --- | --- | --- |
| **Application Reuse** || exact source/provenance/dependencies、caller/actor/branch/time/currentness、producer/tool schema/permissions/Trust Domain 的 **validity proof**；不能用语义相似命中跳过新业务 mutation |
| **Provider Prompt Cache** | Provider 实际支持的 prefix / canonical prompt / tool schema、显式 breakpoint 或隐式缓存 | Adapter 的确切 target+connection+gateway+model+protocol+affinity 能力、prefix binding、TTL、收费与真实 usage；相同字节只意味“可能命中” |
| **Local Inference Cache** | 本地/自托管 backend 的 KV/prefix/segment、decode 优化 | 本地推理后端的真实能力/安全域/性能，不由 V3 自建 CUDA/Attention/KV manager，也不把任意非 prefix KV 视为可安全复用 |

- Source 撤销/Branch fork 或 restore/Variant 编辑/Actor exposure 改变传播失效；无 proof 时 cache miss/blocked，不能复用撤销的数据。
- D4 C2 规定公共 immutable 数据可在合法 trust domain 中复用低层只读读取，但**每个 Agent 最终上下文独立编译**。
- 已完成的只读 work 可以缩减模型调用。`Idempotent mutation` 仅根据**原操作身份与真实领域 receipt** 决定重送后的状态；`non-idempotent mutation` 不能靠普通结果缓存冒充已执行或跳过。复用 Graph 结构不等于继承旧运行余额、旧 World 值或旧 Effect。
- RP 优先复用合法 facts、前置 Memory/Context/Task Intent、Model prompt prefix，不直接将上回合 Final Prose 作为一般 Semantic Cache 输出。稳定 Context 不为 cache-hit 保留 stale World 或撤销的私人来源。
- 默认不主动预热所有 target/Agent 或无条件写 Prompt Cache；预热/缓存写本身可能有上游成本、TTL、存储、延迟与安全风险。只有实测/合法 policy 才启用并标记实际命中与成本；“可发缓存字段”不等于真实部署支持。

## 6. Reasoning Continuity 与 Fallback、Checkpoint 不是一回事

- `RunCheckpoint` 记录 Host 图/Effect/Attempt 状态；`Application Reuse` 对已完成且可证明适用的显式产物重用；`Provider Prompt Cache` 优化模型服务的输入前缀；`Reasoning Continuity` 是由 Provider/Adapter 承载的可能不透明执行状态。
- 只沿原 [Model Routing `7](../../architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity执行状态与生命周期) 由原 Provider 能力证据与 request snapshot 决定 continuation 保留、重置或丢弃。换 Agent/Actor audience/Role、Source/Branch、Model/Gateway/affinity、Context/Tool/Output schema 不满足则不能盲续接，更不能把私有 opaque reasoning 当公共 Result 跨 Agent 传递。
- Provider managed alias/opaque gateway 状态不可见时保持 `loss/unknown`；合法 fallback 需要新 attempt / 预算准入，不用旧 continuation 证明新请求费用或质量。
- 旧正式 World/Studio action 已提交并有原 DomainCommitReceipt 时，不因 Fallback/Retry/Run Replay 自动重复写入；中断时先 reconcile 未知 Effect。

## 7. 观察与收益归因

模型发送前必须记录可执行的需求/触发、当前有效 evidence、ReuseDecision/proof、allowed target 及 Routing 选择依据、source/Plan/TaskGraph/audience、estimated cost/latency/预算 reservation、原能力版本；发送后附真实 EffectReceipt、reported/gateway usage/错误、charge unknown、TTL/cache-read/write、TTFT/E2E/queue wait/本地工作与实际费用。

质量底线先看：World/Actor/Source/Disclosure/玩家自主权、真实 Project/Session Outcome 和 Tool/Output Contract；然后比较实际 model/tool calls、Token/金额、TTFT/E2E p50/p90/尾延迟、并行失败/取消、cache valid hit/false reuse、Provider reported cache usage、恢复正确性。没有可审计对照的节省为 `estimated`，未获 usage 的成本为 `unknown`，不能假装 zero 或由低延迟推断 cache hit。

物理 Schema、具体额度、Target 列表、Node 质量阈值、缓存 TTL、请求价格/金额硬限、性能 SLO 均未在 D5 固定，不应擅自将示例数值或工程建议提升为用户审批门槛。

## 8. D6 讨论接口：资源许可不是工具操作授权

F2 能批准的是“**在当前合法预算内是否值得执行这项计算**”，不能因此授权模型任意调用 Tool/Skill/MCP/A2A、外发私密信息、写文件或提交业务命令。D6 应继续讨论能力白名单/发现、权限主体、审批请求、Secret/Prompt Injection 隔离与外部不可逆副作用的持久恢复；在用户选择前尚非冻结结果。
