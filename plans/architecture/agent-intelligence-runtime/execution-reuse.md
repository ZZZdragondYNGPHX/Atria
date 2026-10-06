# Execution Reuse：有效性证明与既有产物消费

> D4 纳入正式架构；本模块唯一管理复用语义、依赖失效与产物消费。物理 Schema、资源 key、容量 / TTL、候选匹配阈值和支持矩阵按 G 阶段细化，未实施。
> 来源：[Execution Reuse / Cache Locality / Adaptive Invocation 研究](../execution-reuse-cache-locality-adaptive-invocation-research.md)。Context 编译见 [behavior-context §3–4](behavior-context.md#3-context-选择展开与压缩)，调用准入见 [compute-policy §1](compute-policy.md#1-默认路径与适用范围)，Provider / Local 能力与局部性见 [model-routing §8](model-routing.md#8-cache-capability与cache-locality)。

## 1. 定义、职责与术语

**Execution Reuse 是现有 Runtime 的一级执行能力：在 Task、Tool、Model 或 Narrative 工作之前，依据对象身份、输入、依赖、源版本、权限、Authority、时间、Trust Domain 及必要的执行路径绑定，证明已有产物在当前执行快照下仍适用，然后跳过或缩减重复工作。** Cache 是保存、索引或承载这些对象的实现，存储命中本身不构成复用授权。

沿现有 Runtime / policy controller、Task Artifact authority、source adapter、Context compiler 与 StorageEngine 接入；不另建事实图、任务服务、模型执行器或持久配置 authority。当前 S02 / S03 的来源重验与 metadata 不等于已实现通用 Reuse Resolver。

| 研究术语 | 本企划采用的职责 |
| --- | --- |
| Reuse Runtime / Reuse Resolver | 既有请求准备与产物消费路径中的候选查找 / 有效性判定职责，不是第二个 Runtime |
| ReuseContract | 既有 typed artifact / result 消费契约的复用要求，按源域 adapter 校验 |
| Exact / Structural / Semantic | 候选匹配方式；与 Tool Value、Plan、Context 等对象类型分开 |
| ReuseDecision / Reuse Evidence | 原 task / run / request 下的决定及校验证据；发出前 Snapshot 与响应 Observation 分开 |
| Cache Trust Domain | authenticated owner 与获准 account / workspace / package / session / branch、路径及安全 / 工具权限的隔离边界 |
| Execution Continuation | 引用 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期)；Reasoning Continuity 保持独立定义、handle 与生命周期，不注册为普通 Cache Entry |

已完成且仍有效的工作走 artifact reuse；进行中执行的接续由原 continuation 契约处理。两者可参与同一准入决定，不能共用相似度判定、导出或淘汰规则。

## 2. Reuse Contract 与候选 / 证明分离

下表是契约语义要求，不是已冻结字段清单或 TypeScript Schema；源域没有的 revision / capability 不伪造。

| 要求 | 消费前需要回答的问题 |
| --- | --- |
| 类型、身份与输入 | 哪个精确对象 / producer / schema / 方法版本；输入指纹或结构化 intent / 参数是否适用 |
| Provenance 与依赖 | exact source refs、内容 / dependency fingerprints、原 production anchor、派生链是否仍可验证 |
| Scope 与源版本 | owner、Actor / Project / Package、Native branch / revision 或普通 chat message / variant 等源域 anchor 是否符合当前用途 |
| Authority 与权限 | 原结果是否可信、当前仍可读 / 展开 / 使用；工具和正式写入权限是否另行满足 |
| 时间与 freshness | 有效时间、外部数据版本、失效 / 手动 bypass 条件是否满足；TTL 未到不等于内容仍有效 |
| Purity 与 side effects | 读取是否确定、依赖是否完整；是否涉及 mutation、once grant、外部 effect 或 replay safety |
| 路径绑定与 Trust Domain | 需要时核对 Provider / target / model / adapter、工具 / 输出合约与编译版本；是否处于获准隔离域 |

判定分两步：

1. **找候选**：Exact 使用精确输入 / 身份；Structural 匹配 intent / workflow 结构并重新绑定参数；Semantic 可使用获准检索 / embedding 找近义候选。
2. **证明有效**：由原 authority / adapter 重验上表中适用条件；只有全部必要条件满足才能形成 valid hit。相同 hash、同一名字或高 embedding 相似度不能独自完成证明。

unknown、缺失依赖、过期来源或不可重验结果保留拒绝 / unavailable 原因，改走获准重新执行；必要证据无法取得时沿原阻断 / 审阅路径。不得把一次 Evaluation 的 current 缓存成长期许可。
校验与消费之间保持源域的 snapshot / CAS / scope epoch 语义；异步间发生版本变化必须重验，不能先证明旧版本再消费新版本。

## 3. Dependency-aware invalidation 与生命周期

共用现有 Task Artifact provenance / dependency / revision applicability 和 source adapter，不建立第二套 dependency authority。依赖 State X 的 A 及依赖 A 的 B 随 X 变化失效；仅依赖 Y 的 C 不受无关更新影响。
**优先依赖级 targeted invalidation，而非每次 revision 变化全局 clear。** 只有源 authority 能提供完整且可核验的依赖版本 / 指纹时，才允许跨无关 revision 变化继续使用；否则保守绑定精确源 revision / anchor，变化即拒绝相关对象。不能为了提高命中率放宽现有 Artifact grant。

| 事件 | 处理 |
| --- | --- |
| 依赖更新、工具 / 合约 / producer 版本变化 | 重验直接依赖并传播到派生产物；无关对象保留其原约束 |
| Branch fork | 获准不可变祖先仍需证明适用；fork 后状态相关产物 branch-local，兄弟 branch 不交叉消费 |
| Restore / rollback | 只消费当前 anchor 可达且仍有效的对象；未来 revision 的派生状态不能带回，历史权限 / 外部时间仍重验 |
| Edit earlier message / 更换 variant | 按 exact message / variant / hash 失效相关 summary、retrieval、plan、intent 与后继；普通 chat 不虚构 Native revision |
| Regenerate | 获准 facts / retrieval / plan / Narrative Intent 经重验可保留；正文重新采样，continuation 决定仍交 model-routing §7 |
| 删除 source / owner / scope、权限撤回 | 即使缓存还在也拒绝消费，并沿原 retention / delete 路径清理或失效下游 |
| TTL、容量淘汰、storage failure、manual bypass | 明确 miss / unavailable；不改变正式 state、receipt 或已发生预算消费 |

生命周期由对象决定：只读结果依赖源版本 / 时间，模板依赖 Package / Runtime / 工具版本，Narrative Intent 依赖当前 turn / scene / revision，静态知识依赖资源版本，Provider cache 服从其路径能力和 TTL。它们不共享一个全局寿命。
Retention / 删除沿对应原存储与资源生命周期；先证明安全消费，再选择索引、内存或持久缓存实现。持久资源进入实际阶段前补齐容量、迁移、read-only、backup / restore 与撤回，不在本轮新增存储 kind。

## 4. Tool Value、Task Artifact 与 Discovery

| 对象 / effect 类别 | 允许的复用与限制 |
| --- | --- |
| Pure / deterministic read | 依赖完整、authority / 权限 / branch / 输入仍满足时可复用；tool + args 不足以判定 |
| Time-sensitive / external read | 额外核验时间窗口、来源版本与可取得的外部 evidence；不透明外部状态不能假设未变 |
| Idempotent mutation | 仅原 authority 按同一 operation / effect identity 和正式 receipt 判断重复交付；新操作不能拿旧结果跳过写入 |
| Non-idempotent mutation / side-effect action | 不使用普通结果 cache；按原授权执行或拒绝，失败恢复核对已发生 effect |
| Task Artifact | 复用原 read / applicability / dependency / grant consumer；once / operation grant 不升级为 reusable context，content hash 不授予 mutation |
| Tool Discovery 候选集 | 可复用获准 intent / capability 到 Tool Resource 的匹配；调用前重验 registry / schema / enabled / Package / 权限，候选集不成为 allowlist |

Tool / Skill / output schema 使用原精确 Resource Identity 与 canonical version；按需加载完整 schema 由 Context / adapter 编译决定。工具顺序变化不改变上层资源身份，但可改变 Provider prefix，因此底层命中仍按实际路径判断。

## 5. Plan / Workflow 与 RP 新鲜度

优先复用**结构化 Workflow Template**，沿当前 Runtime task graph / policy controller 或显式 Task Artifact 消费；自然语言旧计划只能作为待校验候选，不能直接执行。匹配 intent 后重新绑定实体、数量、目标、工具和当前输入，记录模板 / producer 版本与 provenance。
执行前重新检查 preconditions、当前 capabilities / tools / permissions、Authority、状态假设与用户 goal；每个正式 effect 仍由原 authority 执行。结构可跨运行复用，旧余额、库存、价格、实体 ID 或“已完成”判断不能随结构被继承。

RP 默认不通过普通 Semantic Cache 返回 Final Prose。优先复用获准 facts、retrieval、稳定 style / constraints、plan、Context prefix；需要叙述时仍 fresh-generate Narrator。
Narrative Intent 是可选的显式中间 artifact 职责，复用已有 Task / Expression intent，不建立第二个角色状态或必需 Planner 调用。它携带当前 scene / actor intent、情绪 beat、支持 facts、禁冲突约束、后果与未解 hooks 的适用关系；是否注册具体类型按实际 consumer 冻结。
重生成只有在 goal / state / constraints / 来源仍适用时才可保留该 intent；玩家动作细节、知识 / 情绪变化或旧解释自我强化信号要求失效 / 重算。Planner 与 Narrator 的连续性策略引用 model-routing §7，不能因复用意图而强迫正文继承旧 opaque lineage。

## 6. Trust Domain、Local 表示与存储边界

默认隔离用户 / account / workspace、Package / Session / branch、Provider / model / adapter 与安全 / 工具权限域。公共不可变资源可按明确共享契约使用；私有、用户控制或 context-derived 表示不能仅凭相同文本 / hash 晋升到共享可信缓存。
研究所述 HijackKV 风险说明非 prefix KV 可能携带其生成上下文的污染；因此默认禁止不受控的 cross-user / cross-package position-independent KV reuse。未来共享必须重新证明来源、可信生成上下文与安全重算 / 验证规则，文本无害不能证明已有 KV 无污染。

Application result reuse、Provider Prompt Cache、Inference Backend KV / decode capability 各自验证，由 [model-routing §8](model-routing.md#8-cache-capability与cache-locality) 管理路径能力。上层提供稳定 Segment / Resource 身份及获准 workflow / progress hints，成熟 backend 负责 GPU KV / eviction / prefetch / compression / speculative decode；不要求当前自建 serving engine。
Cache storage loss 可导致重算，不能取消 authority、降低 quality floor、恢复已撤回权限或生成新的预算额度。关闭复用后仍走原执行 / 迁移与撤回路径，正式结果保持原归属。

## 7. ReuseDecision、评价与阶段路由

决定沿原 task / run / request / attempt 记录对象类型、匹配方式、来源、必要检查与 evidence、reused / partial / miss / unavailable 和原因。典型拒绝包括 not_found、expired、dependency / anchor / permission / authority / tool_schema / path 变化、trust_domain_mismatch、semantic_match_but_invalid、manual_bypass；最终命名在 consumer 阶段冻结。
未发送的纯复用保留 task decision，不伪造 provider send、usage 或新 receipt。局部复用后仍执行的请求将决定固定在原 Snapshot；响应追加 Observation。路径 / cache 的具体观测语义见 model-routing §8.3，开销与收益归因见 compute-policy §5。

验收优先 **Reuse Precision / false reuse**，再看 candidate / valid-hit / miss 分母、少执行的 model / tool / plan 工作与实际成本、cached / cache-write tokens、TTFT / E2E cold / warm / hit / miss 分布及 p50 / p90 / p99。节省 calls / tokens / 延迟的反事实值须来自确定可跳过的工作或固定输入对照；估算标 estimated，缺失 / 不可知不写零。近零错误复用是设计目标，数值门槛未冻结。

必要案例：同输入同依赖可用、无关状态更新仍可用、相关依赖 / 时间 / 实体 / 权限 / Authority 变化拒绝；模板可匹配但失效工具 / precondition 阻止执行；side effect 不被 cache 跳过；fork / restore / edit / source 删除不污染消费；RP 复用前置产物 + fresh narrator 与完整重算比较状态正确性、重复 / 多样性、角色一致性和质量—成本。
复用 M1 Eval，不新增 judge authority；本轮无模型收益结论。实施 A–F 顺序及 G 阶段映射唯一见 [delivery §8.1](delivery.md#81-execution-reuse实施顺序与既有阶段映射)。M1 与下一 S04 不依赖本模块的未实施能力。
