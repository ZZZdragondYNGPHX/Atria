# D4 — C2 Audience-scoped Context、Hybrid Memory 与多智能体信息共享（已冻结）

> 2026-10-15 第四轮选择 **C2**。跨模块结论见 [decisions.md](decisions.md) D4；Native Host 和 Plan/Effect/Receipt 归属见 [architecture.md](architecture.md) D2；Graph、Delegate/Handoff、Join 见 [graph-control.md](graph-control.md) D3。本模块是 **V3 多智能体信息访问与传播的唯一详细设计入口**，不是新 Memory/Context 服务实现，也不是对原 HCM-01–08 的重新议决。本轮无产品代码修改或已运行测试。

## 1. 复用原产品信息权威，而非新增一套 Memory/Context

- 唯一 Hybrid Memory 召回及强约束候选域：原 [Hybrid Memory 正式契约](../../architecture/agent-intelligence-runtime/hybrid-memory.md)；产品方向沿 [HCM-01–08](../../architecture/hybrid-cognitive-memory-2-0/decisions.md)，尤其 HCM-02（旁白与 NPC 分离）、HCM-04（世界时间）、HCM-06（Constraint-first）、HCM-07（旧召回硬切）、HCM-08（稀疏调用与正确性）。
- 原 [Behavior/Context 编译](../../architecture/agent-intelligence-runtime/behavior-context.md) 管固定 Context lanes、角色与叙事表达分层、SourceRef、required/atomicGroup、Token 计数、compression、provider lowering；本 V3 只定义**每个 Agent 调用如何选择受权 audience、怎样请求这些现有能力、结果怎样安全跨 Agent 传播**。
- 原 Information/Actor/Cognition/Authored narrative 的 grant、availability、displayView、branch/local source 权威继续有效，详见 [M3 可见性与接管](../../architecture/agent-intelligence-runtime/m3-cognition-design.md)、[S16 Disclosure](../../architecture/agent-intelligence-runtime/s16-belief-disclosure.md)。正式 World/Session/Project 对状态写入和事实拥有最终权威。
- Host 使用现有 Native Context compiler/Information projection/Memory port 的可扩展消费者接口，不注册 V3 私有 Memory OS、事实图、Source authority、第二套 Context compiler、检索模式、独立费用账本或自主 NPC 世界时间。旧 Orchestrator 的 mode、配置、capsule、Generator 和 UI 仍然**零兼容硬切**。

## 2. 每个 Agent 自己的获准 Context：C2

一次 NodeAttempt 执行前先由 Native Host 从**可信登录 owner + PlanRevision + Run/source anchor + 节点目的/角色 + 原 Information/Source 授权**取得有效请求域，而不是信任 Agent Prompt、用户输入或模型回传的“我是 Narrator/NPC”声明。

逻辑流程：

1. **Identity/admission**：绑定 owner、task、当前 NodeAttempt、目标受众（narrator、指定 actorId、task/project 等）、父 Run 可委托集合、目的、所需 source kinds；实际权利取源 authority、Plan capability、父 delegation、作品/用户许可的**交集**。
2. **Source/domain guard 先于检索**：根据原 scope/Actor exposure/历史时点/正式 World Tick/Branch/Revision/variant/availability/grant 构造合法候选子域；不可将全局原始 Memory/Source 搜出后仅在模型输出时再过滤。
3. **唯一 Hybrid retrieval**：词项/类型图/可选向量或有证据的 rerank/LLM 升级只读此合法候选域；返回可验证 SourceRefs/provenance/currentness/争议与 incomplete 标记，不提升事实权威。
4. **原 Context compiler**：依据 Agent 的 target、当前 Task/output contract、必需 World/Command/Identity 约束、合法 Memory/Knowledge/History/Tool Results，进行 lane、atomic source-group、真实 token budget 和优先级选择；仅选择被该 Agent 授权的完整 ContextItems。
5. **Late guard & send**：异步检索、Context 编译、Model send 与 Tool/Result 消费边界均在源发生变化时重验 scope/branch/epoch/capability/source hash；无法验证则拒绝、撤销该引用或按合同暂停，不使用旧宽 Context。
6. **Result/disclosure**：模型输出进入低权威 ResultEnvelope，消费者执行新的传播与显示检查；在 Join、Handoff、Review 或最终 Narration 也不能沿用 producer 的更宽 audience 作为 consumer 的读许可。

对同一 Host，纯 Context 编译/验证函数可共用，**编译输入的 audience 与原权限域不得共用**。UI/浏览器只观察脱敏 Context 选择摘要，不成为权限裁判。严格敏感任务允许比 C2 默认更紧的无共享设置，但不引入另一个执行器或旧模式。

## 3. Source/Truth、Actor cognition、Context access、Disclosure/Action 四个面

| 面 | 由谁决定 | V3 的约束 |
| --- | --- | --- |
| World Truth / 正式事件 | SessionCore / World/Command / 有效 DomainReceipt | 结果仅引用并服从当前事实，不让 LLM 推断/版本过期 Memory 覆盖 |
| Exposure / Belief / ToM / 角色遗忘 | Information / Actor / Cognition 与已授权事件 | 角色见过、记得、相信和猜测分别表述；A 对 B 的推测不是 B 的心智 |
| Context access / Task purpose | 原 authority + 可用 audience view + 节点 scope / Plan capabilities | 给某 Agent 检查矛盾的材料，不代表其可自由向其他 Agent 或玩家转述 |
| Player disclosure / Tool action | 原独立 display grant、OutputContract、Skill/Tool/业务权限 | Narrator 可知不等于可以揭示；知道不等于能提交 Command/更新 Memory |

保持 HCM-02：默认 **B 系统**下 Narrator 与 NPC Cognition 分开，作品明确可选 A 严格限知与 C 作者授权自定义；C **不能**替代原 Information display grant 或业务安全权限。原 [S16](../../architecture/agent-intelligence-runtime/s16-belief-disclosure.md) 的每条 context 记录独立 displayGrant/null 与字段级 disclosure 语义继续有效。

**安全保证级别**：严格源级隔离可以确定性阻止未获准原始信息进入该 Agent 请求；但一个看过更宽信息的 LLM 生成自由文本仍可能通过对白、暗示或摘要泄漏。Prompt、Judge 或单次审稿不能证明绝对不泄漏；高保密需求应优先采用实际数据面隔离、分阶段生成/独立验证，并保留失败样本、费用和保证等级。

## 4. 多 Agent 共享的单元是授权引用，不是完整历史

- Delegate/Handoff 不直接复制父 Agent 的 system/developer messages、整段上下文、private scratch、tool trace、Provider opaque reasoning、narrator-wide view 或长期模型会话句柄。默认共享 **任务 brief + 明确获准的 SourceRef/ResultRef + 必要输出合同**。
- 每个跨边界消费由 **接收方 audience** 重新授权，并检查 producer 身份、attempt、source refs、version/hash、可读字段与允许的用途。父 Agent 拥有最终输出权不表示其可以读取任何子 Agent 私密内容；Join 返回的也可能是引用/有限摘要而不是原文。
- 结构化 ResultEnvelope 需要表达内容与证据分离、producer/attempt、source refs/atomic group、依据类别（official World fact / witnessed / hearsay / belief / hypothesis / derived / unverified）、时间/branch/版本、可能披露范围、currentness 结果，以及 partial/unknown；这里冻结的是**语义要求**，非新的物理 Schema 或存储 kind。
- 子 Agent 产出的文字摘要、分类、评分、检索结果或 Tool Output 一律属于对应来源/派生权威层；转换成自然语言、压缩、Judge 聚合、任务重规划或写入缓存**不解除原信息限制**，也不得将“模型说可信”转换成证据来源。
- 共享的只读公共来源可以在合法的相同 trust domain 中复用一次底层读取/索引候选；**最终每 Agent 仍由原 compiler 独立做 Context admission**。来源无权传给接收方时拒绝展开，按 OutputContract 返回 limited/blocked/unknown，而不是把敏感全文放进错误信息或诊断。
- Planner/Router 只看调度决策必需的安全投影（任务状态、缺口类型、允许的 capabilities、结果状态及可展示引用），**不默认拥有每位 NPC 的私密心理或所有 Agent 的完整工作文本**；Judge/Review 同样必须匹配各自合法评审 audience。

## 5. Join/共享结果在并发和恢复场景中的安全出口

- Fan-out 的每个 child Run/NodeAttempt 先独立获取 scope + Context，并维持自己的 Context/Result validity；不能因为在同一个父 Run、同一 Plan 或同一请求批次就推断具有同一读取权限。
- 确定性 Join 仅依 D3 冻结成员/阈值与持久收据结算。**Join eligible** 与 **consumer can read result** 是两个独立谓词；结果“成功”但接收方无权读的分支不能被暗中融合成公共摘要。
- JoinReceipt 固定采纳分支/Result refs 和 partial/denied/unavailable reason；若某结果仅某个 Audience 可读，可选择不展开、受限投影或失败出口。改变消费者 audience 必须重新对实际消费请求审查；Join 已结算/正文已发布的内容不能被迟到结果暗改。
- 等待中的子任务发生 Actor 权限撤销、Session branch switch、Source deletion 或 Run cancel，返回值不得填补新 Context；旧结果保留的审计证据只在自身获准域下可见，不能沿新分支 replay。
- 工具响应、MCP/A2A 远端文本、网页资料与共享 Agent 摘要作为**低信任数据**进入 Context，不得通过内容中的指令改变 Tool allowlist、输出 schema、系统优先级或 disclosure。

## 6. 长会话压缩、Source 失效与缓存隔离

- 长会话保留原 Context lanes 与 required/atomicGroup、官方 World/Command/Events、Actor 精确身份、未完成承诺、冲突来源和权限说明。先在合法候选域按需检索与展开，再按原 token budget 装配，不能通过省略必需证据冒充低延迟。
- 压缩是 source-derived artifact **不是新的 Memory/World/Cognition writer**。保留 source refs、内容 hash/producer/policy/version、覆盖范围和遗漏/不确定性；不同 audience 的摘要隔离，不把一个可读秘密的总结给另一角色。原始来源仍有独立生命周期，摘要更短不证明不会破坏历史关键约束。
- 相同 content hash、semantic similarity、cache-key 或 provider cache-hit **不能作为跨 Actor/Branch/owner/Scope/Time/Model-output-contract 的复用授权**。复用需要原 [Execution Reuse proof](../../architecture/agent-intelligence-runtime/execution-reuse.md) 的准确依赖有效性和现行 access check；底层稳定公共前缀可缓存，但绝不能复用旧的权限结论。
- 更换 active variant、修改前文、Save/fork/rollback、source supersede/delete、Scope epoch/Actor availability/grant/author disclosure 改变，必须传播使相关 index、retrieval candidate、Context summary、shared Result 与编译快照无效；来源证明完整时可仅 targeted invalidation，缺证明时按原 exact anchor 保守拒绝。
- Source/permission 有效性要分别在 retrieval candidate **之前**、Context 编译/模型发送 **之前**及异步返回/Result 的消费 **之前**重验。撤回来源不可以通过旧 provider state/continuation handle 间接再取到。Reasoning Continuity 的 handle/lifecycle 只沿原 [Model Routing `7](../../architecture/agent-intelligence-runtime/model-routing.md)，不作为普通共享 Context 或 Cache，跨 audience 默认不继承。
- 原模型/工具/Embedding/Rerank/compaction 的真实预算由已有 Native Compute/RunControl/TaskScheduler 管理；不因 C2 变成每个 NPC 每回合固定跑多个 LLM。世界时间与自主 NPC 触发依正式 World Tick，不依赖 wall-clock 等待。遗忘改变 Actor Cognition，而非偷偷删除历史 World Truth。
