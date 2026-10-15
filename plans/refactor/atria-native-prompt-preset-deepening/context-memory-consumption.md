# D6 讨论草案：Context / Memory / Cognition 的 Audience 与长会话策略

> **D6 OPEN，2026-10-15。** D1=B、D2=J2+F2+R3、D3=E2+A2+K2+G1、D4=B2+I2+C2、D5=S2+L2+D2+K2+T2 **均已冻结**。本模块只讨论如何让原 Native Prompt/Agent 消费现有合法 Context；不建立新 Memory/Context/World/Actor Writer，不重新决定已冻结的 [V3 C2](../atria-native-orchestration-v3/context-sharing.md) 和 [HCM-01–08](../../architecture/hybrid-cognitive-memory-2-0/decisions.md)。以下 U/E/H/V 四组是**待用户选择的产品方案，不是已实现代码**。

## 1. 源码基线与职责（静态证据，NOT_RUN）

| 已存在的入口 | 可核实事实 | 本企划的消费边界 |
| --- | --- | --- |
| `main:public/scripts/native/context-compiler.js` | 已有 `runtime_system/current_state_event/commitments/recent_raw/narrative_spine/memory/knowledge/target_agent/player_persona` 等 lanes、minima/caps、hard reserve、required/atomic group、coverage 与 rejected diagnostics | D6 只选择 Prompt/Agent 消费偏好；不得再实现第二 Context selector |
| `main:src/native/model-prompt-runtime/context-providers.js` | 消费 SessionContextCompiler 已选结果，recent_raw/memory/narrative_spine 走 history/user 数据形式，其余部分会成为 Context Fact/Directive | 新 D5 SemanticBlocks/Provider lowering 必须保留信任来源；现有 `context.fact` 经 `contextSlots` 进入 `system` 的边界仍需真实审计 |
| HCM-01–08 和 [Hybrid Memory](../../architecture/agent-intelligence-runtime/hybrid-memory.md) | 唯一 Constraint-first Adaptive Hybrid，先 Actor/Source/Time/Branch 授权后召回；Word/Memory/Belief/Forget/World Tick 分属既有权威 | Prompt 不重新搜索全部私有知识，也不把召回结果写成 World Truth |
| [V3 D4 C2](../atria-native-orchestration-v3/context-sharing.md) | Agent/Actor 独立 Audience、Source/Display grant、跨 Delegate/Join 由接收方重新授权；Narrator 宽视图并不等于 NPC 可读或玩家可显示 | D6 不重议是否要遵守这些硬合同，只比较合法 Context 如何供不同写作/任务消费者使用 |
| [Behavior/Context](../../architecture/agent-intelligence-runtime/behavior-context.md) | 事实/Identity/Cognition/Context/Behavior/Expression 明确分层；压缩是带来源的派生，不是新事实权威 | D3 E2 声音与文笔、D5 IR/缓存/预算只消费受权结果 |

未来任何 D6 程序仍由 **唯一 Native Host V3**、原 Information/Memory/ContextPort/Session/Core/Eval 来实现；不得为普通 RP 每轮固定调用多个认知 Agent，也不允许用 Browser 预编译 Prompt/旧 ST 注入作为正式执行器。

## 2. U — Audience/Actor 粒度：如何给 Prompt 消费者提供合法视图

| 备选 | 消费策略 | 取舍 |
| --- | --- | --- |
| **U1 宽视图附带文本隔离标签** | 把 Narrator 获准的宽材料作为一份 Prompt 交给多个下游，并写“NPC 不要用不属于你的知识” | 跨 Agent 不再有接收方真实隔离；即使有软标签也不能代替原 V3 授权，不推荐 |
| **U2 每消费者受信 Source-bound 投影（推荐）** | Host 用 `SourceBinding + Audience/actorId + taskPurpose + branch/revision/worldTick + grantDigest` 从原 ContextPort 请求视图；Narrator、特定 NPC 分析、Judge/Tool 依其原真实权利获取 packet；只跨 Agent 传明确可读的 SourceRef/ResultRef，消费者再验 | 最符合 V3 C2、HCM-02 旁白/NPC 分离及 K2 反全知；普通单 Narrator 热路径仍一次 Context |
| **U3 为各 NPC 建独立 Prompt Memory Store** | 角色模型持续保存自己的 Context 作为另一套正式资料 | 重复事实与权限 writer，Source 失效复杂，违反已冻结边界 |

**强制边界**：HCM-02 B 系统默认，作品 A 严格限知/C 明示受权自定义；Narrator **可以读取**、NPC **已经获知**和玩家 **允许被披露**是不同条件。上表候选不允许弱化原 Source/Display Grant、改变 Parent/Child 交集或因模型声称身份而发放权限。

## 3. E — Evidence / Epistemic status：保留事实、信念与不确定性

| 备选 | 历史证据表达 | 取舍 |
| --- | --- | --- |
| **E1 一段统一故事摘要** | 把 World 事实、过去对话、角色信念、传闻融合成单一文字背景 | 易混淆历史、当前状态、角色误解和作者想象 |
| **E2 受权的类型化认识状态（推荐）** | 为 PromptIR 保留原 Domain/Memory/Information 提供的 `sourceRefs`、Actor/Time/Branch/currentness 和 World/CommittedEvent/Observation/Belief/Hearsay/Promise/Hypothesis/Disputed/Unknown 等**语义区别**；引用而非重新定义 Memory schema | 既能写误解与悬念，又能避免把 Recall 得分当事实；可保持文风自由 |
| **E3 LLM 自动合成单一现行真相** | 遇到冲突自动生成一个“最新且可信”的统一叙事事实 | 模型共识和摘要不能推翻已提交 World/Actor 状态，禁止作为权威 |

示例：角色以前承诺某事，只能证明当时说过；现在是否履约、是否记得、是否仍愿意分别依赖当前 World/Actor/Goal 的正式依据。没有新证据时是**未知**，不是“一定还欠着”。ToM 对他人内心的推测也不能变为他人实际 Belief。剧情允许暗示和误会，但不允许将暗示误写成已发生正式事件。

## 4. H — 长会话的预算分层、Source 保全和文学连续性

| 备选 | 策略 | 取舍 |
| --- | --- | --- |
| **H1 最近消息 + 不带源的滚动总结** | 只看几条最近对话和一份全局摘要 | 容易失去早期承诺、人物声线、因果与分支出处 |
| **H2 基于原 lanes 的 Source-preserving Context（推荐）** | 先保留必需当前 World/Command/State、Actor Identity、有效承诺/未决事件、合法事实与玩家最新输入；在 T2 Context+Provider 双预算内选择近期完整 TurnGroups、Narrative Spine、合法 HCM 证据、Scene/Expression 与 Agent task；压缩保留 source/coverage/omissions/uncertainty/producer 版本，required/atomicGroup 不裸截断 | 不重复现有 Context Compiler；能同时守住剧情、权限、角色语言与长会话效率，但实际收益需真实测量 |
| **H3 只要窗口够大就全部塞入** | 全部历史、世界书和记忆一次发送，少做选择 | 不等于更好检索与更好文笔，成本和来源串知风险上升 |

H2 不另建 Summary/Memory 权威：`narrative_spine` 和压缩产物仍是带版本、来源/覆盖范围/遗漏清单的**派生视图**，不得覆盖 Timeline/World Truth 或擅自删除历史；遗忘是 Actor Cognition 的真实事件，不等于 Memory GC/Context 裁剪。若必需 atomic source group 在安全预算内装不下，明确 `insufficient/blocked/needs_review`，而不是切掉事件前提却让模型自圆其说。普通 RP 目标仍是 G1 稀疏运行，调用与 Token 预算沿原 Host/RunControl。

## 5. V — 版本、时间、权限变化和失效重验

| 备选 | 何时对 Summary/Context/Cache/Result 失效 | 取舍 |
| --- | --- | --- |
| **V1 仅凭 TTL/字符串内容相同** | 期限未到、文本相同便复用旧结果 | 无法证明 Branch/source/grant 未变 |
| **V2 按 Source 依赖图有界失效并在消费时重验（推荐）** | Source/Variant/Branch/Revision/WorldTick/ActorExposure/DisplayGrant/ScopeEpoch/Route/PromptRevision 变化时，按原 Authority 的真实依赖 invalidate 相应 Summary/Hybrid 候选、ContextPlan、跨 Agent Result、Provider continuation 与受限缓存；在候选前、编译/发送前、Join/披露/消费前分别重验，证明不足则保守 miss 或 blocked | 复用 V3 C2/HCM-08/原 ExecutionReuse；不为性能绕过 Source/权限 |
| **V3 每次改动都全局销毁派生数据** | 不区分依赖，所有 Actor/Branch/cache 每次重建 | 可以是不能证明依赖时的局部保守回退，不应默认全站清空 |

**与 D5 K2 划界**：D5 管 Provider Prompt Cache 的合法布局/真实 Usage；本节仅规定 Context/Memory/Actor/Branch Source 变动后，哪些消费者手中的**有效来源证明**失效。相同哈希不是权限，Provider opaque reasoning/continuation 不是公共长期记忆，也不能跨角色传递。Host 重启或恢复、Source revoke、不同历史 Variant 不能借旧结果重新变成合法事实。

## 6. 按真实场景评估未来实现（全部 NOT_RUN）

- **角色知识差异**：A 知密信、B 未知；Narrator 有宽视图但玩家 display grant 禁止提前揭露，NPC/Tool/Join/Review 的合法投影应不同；自由文本的暗示泄漏只有实际审稿证明等级，不能声称百分百硬保护。
- **时间与承诺**：旧承诺有历史来源，当前兑现/记忆仍未知或有新的正式状态；World Tick 与墙钟分离；Source/Belief/Hypothesis 不互相升级。
- **剧情长会话**：同一作品的未决因果、独特角色声音、伏笔和成熟合法虚构主题的文学强度需要保真，避免把长 RP 全部压成枯燥摘要；只看压缩大小不等于质量通过。
- **分支与权限撤回**：改写 active variant、Save/Fork/Retry、删除 Source、撤销 Actor grant、离线重启再 resume，旧 Packet/Context/Provider state 不能越过新的 Source/Scope。
- **成本与时延**：原 Context lane 选择 + T2 Provider 最终预算必须一起验；无必要不触发额外 LLM、Embedding/Rerank/GC 的真实资源费用与 usage/unknown 应记录。
- **隐私诊断**：浏览器的 Inspector 不可通过缓存键/拒绝列表展示本用户未获准的 NPC 私密认知/原 Tool 数据，错误和 Result/Receipt 投影沿 V3 Host 限制。

## 7. D6 待用户选择

**建议 U2 + E2 + H2 + V2**，但全部 **OPEN**。即使另选方案，不能推翻既有 V3 C2、HCM-01–08、D3 A2/K2、D5 S2/K2/T2 的事实与权限硬要求。本轮选项只决定合法消费与长剧情表达策略，不重复 HCM 的检索算法、Memory OS、Context Compiler、World Tick、Actor Cognition 或 V3 Runner。

用户选择 D6 后仍需**先更新并提交 docs 分支同一 Plan Bundle 与唯一 Record**，再进入 D7 Experience/Eval、文学质量、合法过度拒答与 Prompt Candidate 演化。本轮不创建实现分支，不修改 main，正式重构零 ST 旧数据/API 兼容。
