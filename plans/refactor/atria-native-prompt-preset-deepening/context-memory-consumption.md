# D6 已冻结：Context / Memory / Cognition 的 Audience 与长会话策略

> **D6 已冻结：U2 + E2 + H2 + V2（2026-10-15）**。D1–D5 决定继续有效。本模块定义受众 Context 消费、认识地位、长会话分层及失效；V3 C2 和 HCM-01–08 的源授权、算法及事实/权限仍由原权威持有，不建立第二 Context/Memory/Cognition/World writer。实现分工与已有能力见 [功能依赖](e0-audit.md)，下列旧源码描述仅为设计背景。

## 1. 原源码背景与职责

下表为早期设计背景；后续 Typed lowering 等已有能力与本轮尚需接线的部分按[功能依赖](e0-audit.md)理解，不把旧输入风险重列为当前审计／测试任务。

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
| **U2 每消费者受信 Source-bound 投影（已选）** | Host 用 `SourceBinding + Audience/actorId + taskPurpose + branch/revision/worldTick + grantDigest` 从原 ContextPort 请求视图；Narrator、特定 NPC 分析、Judge/Tool 依其原真实权利获取 packet；只跨 Agent 传明确可读的 SourceRef/ResultRef，消费者再验 | 最符合 V3 C2、HCM-02 旁白/NPC 分离及 K2 反全知；普通单 Narrator 热路径仍一次 Context |
| **U3 为各 NPC 建独立 Prompt Memory Store** | 角色模型持续保存自己的 Context 作为另一套正式资料 | 重复事实与权限 writer，Source 失效复杂，违反已冻结边界 |

**强制边界**：HCM-02 B 系统默认，作品 A 严格限知/C 明示受权自定义；Narrator **可以读取**、NPC **已经获知**和玩家 **允许被披露**是不同条件。上表候选不允许弱化原 Source/Display Grant、改变 Parent/Child 交集或因模型声称身份而发放权限。

## 3. E — Evidence / Epistemic status：保留事实、信念与不确定性

| 备选 | 历史证据表达 | 取舍 |
| --- | --- | --- |
| **E1 一段统一故事摘要** | 把 World 事实、过去对话、角色信念、传闻融合成单一文字背景 | 易混淆历史、当前状态、角色误解和作者想象 |
| **E2 受权的类型化认识状态（已选）** | 为 PromptIR 保留原 Domain/Memory/Information 提供的 `sourceRefs`、Actor/Time/Branch/currentness 和 World/CommittedEvent/Observation/Belief/Hearsay/Promise/Hypothesis/Disputed/Unknown 等**语义区别**；引用而非重新定义 Memory schema | 既能写误解与悬念，又能避免把 Recall 得分当事实；可保持文风自由 |
| **E3 LLM 自动合成单一现行真相** | 遇到冲突自动生成一个“最新且可信”的统一叙事事实 | 模型共识和摘要不能推翻已提交 World/Actor 状态，禁止作为权威 |

示例：历史台词“我会还钱”只证明当时说过；是否形成正式债务、是否履约、是否记得和是否愿意偿还分别读取原领域状态。已正式提交且按领域规则持续有效的债务，不需要每轮新证据才能继续成立，只有清偿／免除等合法效果才改变它。来源不可读、未召回或当事人遗忘时，消费者只能说明自己不知道，不能据此消除世界债务。ToM 对他人内心的推测也不能变为他人实际 Belief。

## 4. H — 长会话的预算分层、Source 保全和文学连续性

| 备选 | 策略 | 取舍 |
| --- | --- | --- |
| **H1 最近消息 + 不带源的滚动总结** | 只看几条最近对话和一份全局摘要 | 容易失去早期承诺、人物声线、因果与分支出处 |
| **H2 基于原 lanes 的 Source-preserving Context（已选）** | 先保留必需当前 World/Command/State、Actor Identity、有效承诺/未决事件、合法事实与玩家最新输入；在 T2 Context+Provider 双预算内选择近期完整 TurnGroups、Narrative Spine、合法 HCM 证据、Scene/Expression 与 Agent task；压缩保留 source/coverage/omissions/uncertainty/producer 版本，required/atomicGroup 不裸截断 | 不重复现有 Context Compiler；能同时守住剧情、权限、角色语言与长会话效率，但实际收益需真实测量 |
| **H3 只要窗口够大就全部塞入** | 全部历史、世界书和记忆一次发送，少做选择 | 不等于更好检索与更好文笔，成本和来源串知风险上升 |

H2 不另建 Summary/Memory 权威：`narrative_spine` 和压缩产物仍是带版本、来源/覆盖范围/遗漏清单的**派生视图**，不得覆盖 Timeline/World Truth 或擅自删除历史；遗忘是 Actor Cognition 的真实事件，不等于 Memory GC/Context 裁剪。若必需 atomic source group 在安全预算内装不下，明确 `insufficient/blocked/needs_review`，而不是切掉事件前提却让模型自圆其说。普通 RP 目标仍是 G1 稀疏运行，调用与 Token 预算沿原 Host/RunControl。

## 6. 各类场景要实现的消费行为

- **角色知识差异**：A 知密信、B 未知；Narrator 有宽视图但玩家 display grant 禁止提前揭露，NPC/Tool/Join/Review 的合法投影应不同；自由文本的暗示泄漏只有实际审稿证明等级，不能声称百分百硬保护。
- **时间与承诺**：旧承诺有历史来源，当前兑现/记忆仍未知或有新的正式状态；World Tick 与墙钟分离；Source/Belief/Hypothesis 不互相升级。
- **剧情长会话**：同一作品的未决因果、独特角色声音、伏笔和成熟合法虚构主题的文学强度需要保真，避免把长 RP 全部压成枯燥摘要；只看压缩大小不等于质量通过。
- **分支与权限撤回**：改写 active variant、Save/Fork/Retry、删除 Source、撤销 Actor grant、离线重启再 resume，旧 Packet/Context/Provider state 不能越过新的 Source/Scope。
- **成本与时延**：原 Context lane 选择 + T2 Provider 最终预算必须一起验；无必要不触发额外 LLM、Embedding/Rerank/GC 的真实资源费用与 usage/unknown 应记录。
- **隐私诊断**：浏览器的 Inspector 不可通过缓存键/拒绝列表展示本用户未获准的 NPC 私密认知/原 Tool 数据，错误和 Result/Receipt 投影沿 V3 Host 限制。

## 7. D6 正式冻结的消费行为与技术保证级别

### U2：依受众隔离的 Prompt 消费，而非受众隔离的新存储

- Host 根据真实 Owner、SourceBinding、Actor/Audience、purpose、Branch/Revision/WorldTick、有效 Grant，向原 ContextPort 请求每个 NodeAttempt 的合法 ContextPlan。 每个请求的 Context Contribution 只是从已选合法证据产生的有来源编译投影，不作为持久模块或世界/记忆副本；作者的语义 Anchor 表达消费需求，不能授权新的读取范围。 Anchor 的声明仅指定合法消费位置、可接受类别与是否必需；Context Authority 仍先鉴别来源/受众/权限。对同 Anchor 多条已获准 Contribution，Host/Compiler 必须有稳定可重现的顺序、重复来源判别及选择/拒绝理由，不得由 Prompt 文本或 Browser 自封排序优先级。
- HCM-02 的 B Narrator/NPC 分离默认保持；作品 A 严格限知/C 自定义必须经过原 author/source authority，不能由一句 Agent Prompt“我现在是 Narrator”扩大权限。Narrator **可以读**、NPC **实际知道**、玩家 **可被展示**不是同一回事。
- 普通 G1 路径不默认创建每位角色的独立 Model Actor；一次合规 Narrator Context 编译足够时不得强制多次收费请求。

### E2：认识状态保真，不让 Prompt 产生正式事实

- 在原 Source/Information/Memory 给出的受权 evidence 中区分 World Truth、Committed Event、Observation、Belief、Hearsay、Promise、Hypothesis、Disputed、Unknown 等**逻辑标签**，随 SourceRef、Actor、适用时间、Branch、Revision 和 currentness 进入 D5 SemanticBlocks。
- “十回合前说过一句许诺”与正式持续义务分开；当前履行状态从原 Domain 读取，个人记忆与愿望从 Actor/Cognition 读取。正式债务不会因未召回旧话而失效。角色 ToM 猜测不升级为他人的 Belief；文学误解与暗示不增加世界事件或玩家选择。
- 这些标签只是 Context 消费语义，不能另造 Memory Schema、Query Writer、World Truth 或新的 Cognition updater。

### H2：长会话保持完整来源链和人物文风

- 按原 Context lanes/required/atomicGroup/minima/caps 与 D5 T2 双阶段预算先保留合法的当前 World/Command、角色 Identity/有效认知、未决承诺及当前输入，再按任务取最近完整 TurnGroups、Narrative Spine、Hybrid Memory/Knowledge、Scene/Character Expression 和必要 Agent task。
- 新 Source 删除/修订可使其失效。既有 Timeline、Memory OS、正式世界状态与角色遗忘不受 Prompt 压缩回写。
- 必需证据或完整互相矛盾的原子组装不下，返回真实 insufficient/blocked/needs-review，而非截掉关键前提后让模型编造。评价长期剧情须同时看承诺、因果、语体、角色声线和合法成熟题材的文学细节，不把“摘要更短”当作更好。
