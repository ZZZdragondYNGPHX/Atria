# Sparse Compute：调用准入、预算与收益

> D2 / D4 / D5 正式架构约束；本模块唯一管理 Sparse / Adaptive Invocation 准入、预算与收益。策略阈值、档位名称与 SLO 保持待实测。M1 的有限预算已冻结，完整跨入口 substrate 在 G05 交付，S26 再深化自适应策略；D5 的 Memory 升级与收益未实施 / 未验证。
> 输入研究：[Sparse AI 报告](../sparse-ai-invocation-adaptive-compute-research.md)、[Execution Reuse 报告](../execution-reuse-cache-locality-adaptive-invocation-research.md)。复用证明见 [execution-reuse](execution-reuse.md)，实际目标解析见 [model-routing](model-routing.md)。

## 1. 默认路径与适用范围

`0-call first → 1 main generation for ordinary RP → evidence-driven escalation`

“0-call”指不新增生成模型调用，不代表 embedding、索引、CPU / GPU 或检索没有成本。已有状态、authority、图遍历、规则和确定性编译优先；正常 RP 以一次主要正文生成作为架构目标。
这不是已测 SLO，也不要求 Project 的多步工具任务只运行一次模型。用户明确选择的 Director、Package 必需 resolver 或高影响任务可有更多调用，但须标明依赖、预算和收益；必要 authority / knowledge / output guard 始终保留。
M1 的当前基线如实记录，不为了达成 one-call 指标改写既有 execution contract。

| 路径 | 触发 | 额外工作 |
| --- | --- | --- |
| 普通 RP | 现有证据足够、无必需重判断 | 编译与检索后正文；不固定 Planner / Critic / Reflection |
| Utility | 确定性证据不足，且轻量 classifier 已有验证 | 有界本地 / 低成本窄任务，再正文；classifier 开销计入 |
| Selective cognition | 重要事件、知识冲突、未解承诺或多角色依赖 | 一个共享事件 pass；按受控采纳分别消费派生结果 |
| Deep / Director | 显式模式、高影响行动或独立 specialist 需求 | 有界 critique、rollout、并行工作；硬预算及退出条件 |
| Background / Maintenance | 事件 / 阈值、完整 outcome / feedback 或用户请求 | Memory consolidation、Experience、eval / optimization 批处理 |

Fast / Standard / Deep / Director 只是候选产品档位，不是固定调用次数或已批准模型表。
明显难例允许生成前直接进入合适目标，不强制 cheap → medium → strong 完整生成 cascade。Router 默认纯规则，只有可测收益才增加 classifier；不每轮调用大模型决定要不要调用大模型。

### 1.1 Adaptive Invocation 决策阶梯

Adaptive Invocation 是现有 ComputePolicy / policy controller 对“是否执行、执行哪些必要工作、采用多少计算”的请求时选择；结果仍经原 Runtime / Tool / Generation authority 消费，目标选择继续由 RoutingPolicy 求解。
默认纯规则、先复用可证有效工作；不是每个 turn 额外运行一个 AI controller。建议顺序是按 task 的未满足需求选择：

1. 确定性 Runtime / 已有获准 state 能回答时直接使用。
2. 依 [execution-reuse](execution-reuse.md) 重验可用 Task Artifact、Tool Value，或实例化结构化 Plan / Workflow；局部命中只减少相应步骤。
3. 尚有信息缺口时优先获准廉价确定性 tool；retrieval 按需要选择不检索、单步或有限多步，不能因工具存在就默认每轮调用。
4. 仍有生成 / 推理需求时，按任务 quality floor 选择可证明足够的 small / fast 或 strong target 与 reasoning controls；明显复杂任务直接进入合适路径，避免生成 cascade 浪费。
5. 需要正文表达时 fresh-generate Narrator；前置复用不将旧 Final Prose 作为普通 Semantic Cache 返回。

该阶梯按 task 的未满足需求选择相应工作；Plan 命中不意味着工具 / 正式 effect 已执行，必要 guard / 当前证据继续满足。Continuation 的使用 / 重置决定引用 model-routing §7，不重新定义为 cache hit。
每个决定带 trigger、仍未满足的需求、复用 / 缺失证据、预算与退出原因，记录 no-call / partial-reuse / tool / retrieval / model / narration 等实际动作。具体名称、阈值及允许模型矩阵按 G05 / G06 冻结；缺必要证明就走获准重算或原阻断路径。

## 2. 共享认知与稀疏更新

一次获准事件的 cognition pass 可产出 significance、belief proposal、emotion appraisal、relationship implication、intention、ToM / memory candidates 与有限公开 rationale。
各项带各自 source refs、actor、base revision 和 applicability；不同 source exposure / 私有权限不能为了共享 pass 合并。
采纳仍经过原 authority；部分失败逐项说明，不以生成了 JSON 宣称状态全部更新。
仅当权限、输入域、模型或独立评价需要不同 specialist 时拆分，并证明增益。

多数回合读取已有 cognition；规则可处理已冻结的 decay / transition。事件 gate 的详细数值在 M3 前定稿。
事件驱动默认、作品可选高度自主与角色遗忘沿 [architecture §6.1](architecture.md#61-事件驱动认知与角色遗忘)，不把 retrieval 成功当作认知触发。自主 NPC 的唯一时间准入见 [architecture §8.1](architecture.md#81-正式-world-tick与自主-npc)；复用现有 Simulation / outbox，不另建 timer 或每 NPC 固定 LLM pass。
Memory 写入与 Experience reflection 积累必要 evidence 后触发；普通低信息 turn 不默认执行 extraction。保留待处理 source anchors，让 consolidation 延迟不会丢证据或越过 actor 可见边界。
后台结果必须重验 source / revision / scope，不能覆盖新回合；失败显示 pending / stale，不伪装成已学会。

## 3. 一个预算 substrate，沿原 authority 准入

沿 Native RunControl、Host provider send boundary、TaskScheduler 与 RP / Project 捕获 adapter 扩展，禁止另建可绕过它们的模型执行器。
M1 Evolution owner 预算与前台运行预算是不同用途的额度，共用 reservation / charge 语义；是否设置账户总额由显式 policy 决定。不能把已批准成长预算直接用于前台、也不能自动扣用前台剩余额度。
一次收费事件有单一 identity，由指定 authority 记一次账；多层限制共享该记录做准入，不重复累计为多笔费用。

支持 owner / scope、session / task、turn / job 与 background 子额度。子项不能突破父项；并行申请必须先 reservation，不能各看同一剩余额度。
约束可包含 paid / local requests、input / output / reasoning token、工具 / media、金额、deadline、critic / rollout / subagent 上限和并发。
Continuation 与 prompt / context cache、Task Artifact reuse 是不同优化，沿 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期) 重验；保留状态不保证调用数、token 或费用下降。恢复、重置、probe、compaction / summary、fallback 与 adaptive controller 的新增发送仍经过同一 reservation / charge。
Reuse 查找 / 校验、embedding / intent classifier、retrieval、模板实例化、cache read / write / storage 与 prewarm / prefetch 的可观察开销全部纳入原预算和成本证据。未发出的模型调用不记 send charge，也不虚构零-cost Provider usage；重新执行和预热仍按真实 attempt 准入，预热不保证后续命中或回本。
reasoning / cache-read 常是 total usage 的子集；按 provider usage 语义归一化，不能将 output 与其 reasoning 子项再相加。只存有限 usage 元数据，不保存私有思维链。

`prepared → reserved → send-attempt charged → settled | unknown → reconcile`

请求前固定 estimated upper bound，发送前扣准入额度；失败、超时、取消、retry、fallback、judge、subagent 与后台工作都保留 attempt。
未发送可释放 reservation；已发送但 usage 不明，按上界占用并标 unknown，不能当零收费。崩溃恢复按 durable identity reconcile，不重新生成 allowance；save restore / fork 不倒退已发生消费。
StorageEngine 的 SQL / FS 差异沿 M1 commit-last 与单 Host writer 边界设计；不声称文件、binding、预算和审计跨域原子。

模型 token 上限不等于金额硬上限。没有可信价格 / gateway charge cap 时只能保障可执行的请求 / token 额度，金额标 estimated；要求金额硬上限的 policy 无法获得保守上界就不准入。
本地模型也计调用、延迟、内存 / 设备负载与可取得的功耗证据；没有能力或设备就使用允许的替代路径或报告 unavailable，不自动下载模型。

### 3.1 G05 首批发送准入矩阵

2026-10-11 source `9599dad35`，有限 checkpoint，尚非完整 G05/G06 验收。原 RuntimeRoute.executionPolicy 可选 computeBudget `{maxRequests,maxTokens}`：请求上限1–32，token上限为正安全整数，均明确来自用户配置。无字段的旧 Route 不增加默认额度/费用限制。这个首批额度的父作用域是原 Session RunControl operation 或原 Project Task；M1 Evolution owner 的不同用途额度保持原 authority，不挪用。本 checkpoint 未新增账户总额、金额硬上限或所有 CPU/media 子额度。

Host 沿原发送边界，从冻结 Snapshot 的 prepared input count + reserved output 固定估计上界，Secret/编译/preview/不准入阶段不创建 send attempt；明确拒绝上界时 attempts 为空。原 RunControl lock/Project Task CAS 在发出前将准入及 charge 合为一次 durable mutation，内部 attempt ID 唯一。既有 Package generationBudget 同一次 mutation 增加原计数与 compute evidence，不双计收费事件。retry、fallback和当前工具续接仍各占真实发送；相同 operation/Task 的新 request ID 不重建父额度，已保存额度只能收紧，Route 回退不恢复余额。

原 operation/Task 的可选 compute ledger 仅保留请求/目标指纹、上界、charged/settled/unknown、有限直接数值 usage。合法 totalTokens 可 settle；仅 input/output 或缺 usage 时保留部分计数并按上界占用，reasoning/cache 子集不重复相加。合法数值已取得后，正文/schema/Secret/stream 完整性失败也保留计数，不保存被拒正文或opaque状态。取消/崩溃且无法确定总计保持占用，不自动退款。reopen及原 background Save restore 保留原 identity/余额；这些实际断言不扩大为所有 Session fork/跨账户预算保证。

2026-10-11 source `ad21a1379` 将有限规则 Invocation 接入唯一 Hybrid consumer：普通查询只用基础检索，因果证据缺失时不靠 rerank 造事实；仅多个不同合法 Episode 来源的因果候选允许请求排序。相同来源的 fact/relation/episode 不算多份独立证据。skip/trigger/completed/unavailable/stop 进入原 recall trace；未配置或没有原 Run/Task authority 时跳过。必需 source/Information/Actor/时间/Branch currentness 在可选拒绝后仍核验。该纯规则不是新的生成 classifier，也不说明每个难例必须 rerank。

原 Native `/rerank` 必须提供当前 Session anchor 或原 Project Task；省略上下文、缺显式 Route computeBudget 或锚点不符在收费前拒绝。原 profile exact revision/Secret 仍唯一解析，沿原 Run operation/Task CAS 与正文共享发送额度。每个真实 provider fetch 前 charge；usage 存在时保留直接数值，即使排序响应无效；失败/取消/无 total 保持 unknown 上界，不自动退还。64 documents/256KiB 数据、原120s timeout 为首批有界输入/退出条件；request upper 使用送出 JSON UTF-8 bytes 估计，不能宣称 rerank search-unit/金额或隐藏网关开销被精确封顶。没有退款证据就保持占用。原 embedding/profile 配置仍独立保留；本 checkpoint 未声称所有 embedding/local inference/CPU 都已硬准入。

纯规则首批与共享发送成本语义已接入；retrieval/validation CPU、增量索引和后台消费者继续推进。货币价格、canonical upstream、隐藏网关 retries 未知仍 unknown，估计 token admission 不证明金额硬上限或真实加速。

2026-10-11 source `90c0dd72d`：原 Route editor 提供可选共享发送次数/Token 上界，不自动替旧 Route 设额度，保留其它 executionPolicy；关闭仅删除 Route 配置，同一原 operation/Task 的 durable limits 仍有效。Host routing.compute 的 limits 来自实际 charge receipt，而非放宽后的 Route 配置；attempts 只含 current_request，金额 unavailable，不冒充父余额。Studio 显示原 Task.compute；诊断保留 selected target、执行/恢复决定、Provider usage 与 unknown 身份。有限 UI/账本反例见 Record，不计作全部 G06 收益验收。

## 4. Scheduler 与故障边界

继续使用 `turn_blocking / interactive / background / maintenance`；共享 owner resource permits 与公平调度。
只有当前回复正确性依赖的工作才进入 blocking path；批量 reflection / consolidation / eval 不加入正文等待链。
Host durable intent 保存 job，TaskScheduler 执行；取消且 worker 尚未结束时继续占用 permit，防止表面取消后超并发。首批不新增应用关闭期间系统级唤醒。

升级、重试、模型降级与工具执行权限分别检查。预算不足先删 optional work；必需证据 / guard 不能完成时停止、等待或进入已有审阅路径，不能用低成本成功状态掩盖失败。
昂贵计划前检查 deadline 与剩余额度；每个新增调用带 trigger、预期收益、选择层级与退出原因。
Gateway 内部重试未知时，外层只能限制自己可控 attempts，并记录 unknown amplification；不得宣称限制了不可观测上游总调用，详细处理见 model-routing。

Task graph / 当前 stage / possible next stages 与 Tool progress 可经原 scheduler 向支持的 backend 提供获准 locality / near-completion hints，指导 retention / offload / prefetch；它们是建议，不是已完成 receipt 或新的执行授权。缺 progress 保留 unknown；backend 不支持时忽略 hint 并保持原语义。Workflow-aware eviction、transition learning 与 speculative decode 留在 model-routing §8 的后续能力。
Prewarm / prefetch 仅在已有显式 policy、发送许可、有限预算和近期复用依据下准入，沿 background / maintenance 路径支持取消与 stale-source 重验；不放大正文等待链或占用必要工作额度。本轮未启用这些策略。

### 4.1 Hybrid Memory同步核验与后台工作

HCM-08 将普通回合零额外认知 LLM 作为目标，内部检索仍按 [hybrid-memory §3.2](hybrid-memory.md#32-constraint-first-adaptive-hybrid) 选择必要 lanes。当前正文依赖的 source currentness、Actor 知识边界、Branch / Variant 与正式 World 状态必须同步核验；预算和低时延不允许跳过它们。缺必要证明返回 unknown / unavailable 或阻断相关操作，不用辅助模型猜测补事实。

非关键 reflection、整理、压缩与索引维护沿 background / maintenance 有界执行；若本轮必须等 source / index 修复才能取得正确证据，就显式进入原 blocking 准入，不能在陈旧证据上先返回正文。后台保留 exact pending source anchors，重验后提交，不自行认定 Actor 已学会或已忘记。

H3 的 typed path / PPR 有节点 / 边 / CPU / deadline 上限；rerank / query rewrite 还必须有覆盖缺口、可用 exact profile / target、G05 reservation / charge 与停止原因，G06 验实际收益。可选能力失败或额度耗尽退回合法基础检索，硬条件失败保持拒绝。Embedding、rerank、LLM、index / cache / proof 的费用与资源开销沿 §3 / §5 记录；不复用 M1 Evolution 额度作为新的前台或 NPC 自主预算。

## 5. 评价与观测

共用 M1 Evidence / Eval，记录 root / child / attempt、foreground / background、paid / local、input / cached input / output / reasoning、cache-write、tool / media cost、TTFT、总延迟、retry / fallback 与 charge 来源。
UI 只显示正文模型不能代表总消费；owner 可查看与本次 turn / task 相关的维护份额，分配算法有来源，不伪装为精确归因。

同一场景做 paired ablation：当前路径、允许的一次正文基线、utility + writer、shared cognition + writer、加 critic / rollout 与 Director。case split / 配置与模型观测固定；不支持的路径明确 unavailable。
G06 追加协议合法的 none / active_execution / task / adaptive 对照，按 model-routing §7 验工具收益与 RP 新鲜度、锚定风险及 loss；不新增平行 Eval 或用 opaque payload 作评分输入。
另做完整重算、有效产物 / prefix 复用与规则 Adaptive Invocation 的 paired ablation，控制 task / 输入、有限预算、模型 / compiler / policy 版本和 cold / warm 状态。使用 execution-reuse §7 的正确性 / false reuse 分母及 model-routing §8.3 的观测来源；分别归因少执行的工作、Provider cached tokens、实际 usage / charge 与 estimated savings，不能用 hit rate 替代质量。
按 ordinary / hard / high-impact / long-session 分层比较，避免普通短回合省钱掩盖难例回归；盲评避免偏好更长输出。
质量看行为、continuity、知识边界、authority outcome、偏好；成本看每 accepted turn / successful Project task 和边际计算收益。弱 regenerate / edit 信号不自行成为 accepted / rejected 标签。
报告质量—成本 / 延迟 Pareto 与失败分母、缺失 usage、controller 自身开销；相同硬底线下选最小必要计算。

## 6. 阶段归属与退出

- S01：保持 12 cases / v1，测现有 path 与缺失状态，不预先实现 sparse controller。
- S03–S05：可靠捕获与非阻塞批处理，保留现有 budget identity。
- S06 / S09：可用配置的隔离 ablation 与有界 optional-work 候选，M1 不自动晋升 routing / connection policy。
- G05 / G06：双入口统一准入、send 记账、恢复、事件 / 批处理策略，实际消费 §1.1 阶梯和有预算的复用 / retrieval 决定；退出需并发、取消、预算耗尽、restore 与难例底线、失效复用拒绝和 RP 新鲜度对照。
- S18 / S19 / S24：共享 pass、有界 ToM / rollout 是 substrate 消费者。
- S25 / S26：以已有规则基线深化异步 fast / slow 与适应性分配，learnt router 需独立收益和撤回验证。

报告中的平均约 1.x 调用、候选频率、节省百分比均不作为冻结 SLO。实际数值在真实模型与有限预算可用时定稿；本轮未发起模型调用。
