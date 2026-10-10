# Hybrid Cognitive Memory 2.0 — 冻结产品边界下的目标技术架构

> 状态：**Approved product direction / Engineering design for Codex integration**，不是“已经实现”。
> 日期：2026-10-10；Task ID：hybrid-cognitive-memory-2-0；Primary Workspace：docs。
> 唯一产品决策来源：[decisions.md](decisions.md) HCM-01–08；现状证据、算法比较与消融研究：[retrieval-design.md](retrieval-design.md)；实施映射：[integration.md](integration.md)。
> 原 Agent Runtime 的 World、Session、Cognition、Context、Runtime、费用与复用规则依旧以其正式 Plan 为权威。本文件明确 Memory 2.0 的消费者契约与连接方式，不发明平行的权威系统。

## 1. 问题边界、设计要求和不得改动的约束

### 1.1 成功定义

Hybrid Cognitive Memory 2.0 的成功不是向量检索分数提高，而是：在可接受的成本和延迟之下，为 **正确的消费者** 提供 **当时有权知道、来源仍成立、时间与 Branch 适用、对当前意图真正有用** 的记忆证据，并帮助 RP 自然使用。

必须同时满足四层正确性：
- **Evidence validity**：原始事实/事件/消息仍存在、未被撤销，来源与版本可证明；
- **Perspective validity**：NPC 的知识/误信/可见性不能被 Narrator 更宽的权限意外抬升；
- **Context usefulness**：重要旧承诺、因果关系、当前人物动机被选择且不重复挤占；
- **Enactment quality**：正文不偷用秘密、不夺玩家操作权、不机械复述摘要、角色声音稳定但有变化。

### 1.2 不能跨越的边界

1. 正式 World 状态、规则和 Event 的 owner 仍为既有 World / Session Authority。检索出来的“事实”不带修改世界权限。
2. Actor Identity 的作者定义、动态 Belief/Emotion/Relationship/Intention 仍归对应 Actor/Cognition 与原 State authority。Memory 不成为第二个心理状态 writer。
3. 当前 Context 的选择、权限、预算和 Provider Lowering 仍走已存在的 Native Context Compiler / Runtime Port。Memory 只贡献来源足够的候选 ContextItems，不另建完整 prompt compiler。
4. Runtime/TaskScheduler/RunControl/Host Provider 发出模型请求并计费；Memory 不自带绕开预算的第二个模型调用器。
5. Narrative 需要正文时继续 fresh generation。可复用已验证的查询/来源/意图/稳定前缀，不把旧正文作为普通语义缓存直接返回。
6. 任何提高性能的动作不能取消来源 currentness、Actor exposure、Branch reachability、正式 authority checks、证据异步消费前复验。
7. 若用户已删除来源、切换分支、替换 Variant、修改隐私权限，任何相似向量/旧缓存命中都不得覆盖该结果。

## 2. 接入现有三条生成路径，而非虚构一条万能流水线

| 当前路径 | 关键源代码/消费者 | Memory 2.0 接入原则 | 高风险回归 |
| --- | --- | --- | --- |
| Ordinary RP / legacy generation workspace | [memory/main.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/main.js)，generation world-info hooks | 清掉独立 LLM/RAG 召回分支，全部经统一 Hybrid；保留已经存在的 World Info/Context 生命周期语义，避免重复注入 | 重复世界书注入、原生与普通会话状态交叉、再生/编辑引用过期 |
| Native Game free-text / UI command | [Game LLM runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/runtime.js)，[memory-bridge](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/memory-bridge.js)，Narrative Contract | 官方 World 结算后读取已授权历史；Narrator/Orchestrator 共享合法证据，但 Actor 的决策不能拿 Narrator 全视角内容 | Memory 反过来污染 World、失效结果覆盖新回合、错信升级为事实 |
| Native Package Turn | [play-generation](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/play-generation.js)，[Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) | Memory grant/sourceMessageIds 与 Context final admission 保留，并且在统一检索**之前**确定请求的可见候选域 | 不可见 Episode 在向量元数据/LLM 提示/诊断日志中出现 |

不要认为所有路径都已经运行同样的召回流程：接入前应分别做真实调用图和针对性契约测试。重构统一的是**对外语义与安全边界**，不是强迫所有世界先运行相同数量的 Agent 或任务阶段。

## 3. 认知语义模型：一次来源，多种合法解释

### 3.1 数据语义与物理 owner

| 语义 | 原始权威/持有者 | Memory 可以管理 | 必须禁止 |
| --- | --- | --- | --- |
| World Truth / authoritative Event | World、Session、Game Journal | 有效来源索引、过去与现在的检索引用 | Memory 自行承诺世界事件发生或修改库存/位置 |
| Episodic 事件经历 | Timeline、Event，带消息/Variant 与时间 | Episode 索引、摘要、历史来源关联 | 未获证据而将模型推演当已发生 |
| Semantic Fact / Knowledge | 原 World/Knowledge/来源记录 | 带时间的事实投影、显式争议 | 历史事实覆盖当前权威 state |
| Perspective / Belief | Actor/Information/Cognition | 可见接触事件和 Belief 的证据检索 | 将“甲怀疑乙”作为“乙已背叛” |
| Social / Commitment | Goal、Commitment、Relationship | 承诺来源、条件关联、重要历史提示 | 直接强迫 NPC/玩家完成承诺 |
| Affective | Actor Cognition / 事件来源 | 情绪变化发生时的经历与支持引用 | 把一次不悦自动改成稳定人格 |
| Character Expression | Actor Profile / Expression | 情境表达经历的 source-backed retrieval hints | 将过往台词当必须逐字复制的模板 |
| Narrative Spine | 原 Narrative/Context-derived 状态 | 场景/章节/长期剧情关联索引 | 源修订后继续引用旧摘要 |

系统默认轻度遗忘、作品可选深度遗忘；**检索降权、物理索引淘汰、摘要压缩、角色剧情性遗忘、正式来源删除**是不同事件和生命周期。不因记忆节点不可查就擅自宣称角色已失忆。

### 3.2 角色知识必须拆成三个事实

对角色甲听到乙说“掌门偷走密信”的案例，分别记录：

1. **Exposure**：甲确实听到乙说了某句话（交流事件及可见性证明）。
2. **Belief**：甲相信/怀疑/拒绝该说法（甲自己的认知状态，不是掌门偷窃事实）。
3. **Disclosure**：甲是否向丙说了什么（新传播事件，不是自动复制 Belief）。

转述链允许多级传播、来源不确定、故意误导；每级都要保留源关系。Narrator 可以经作品 B 策略访问较宽真相，但只有揭示策略获准后才展示；NPC 只接收自己的信息投影。作品 A/C 改变读者/旁白选择策略，不能升级 Actor 工具权限。

## 4. 统一请求与返回协议（语义提案，具体 Schema 由实现冻结）

### 4.1 RetrievalRequest 逻辑字段

~~~ts
type RetrievalRequest = {
  requester: { kind: "narrator" | "actor" | "task"; actorId?: string; taskId?: string };
  narrativePolicy: "split_narrator" | "strict_limited" | "authored";
  anchor: { sessionId: string; branchId: string; revisionId: string; packageVersionId?: string };
  // Ordinary RP 使用自己的精确 Chat / Message / Variant / source identity，
  // 不能伪造 SessionCore revision。
  context: { userIntent: string; sceneIds?: string[]; actorIds?: string[]; worldTick?: number;
             commitments?: string[]; committedEventRefs?: string[] };
  temporal: { mode: "current" | "historical"; at?: number };
  budget: { tokenCap: number; latencyCapMs?: number; allowedExtraModelCalls: number };
  retrievalPolicyRef: string;
};
~~~

这是 **概念模型**，不是要求立刻创建全局 Runtime 类型或持久资源。合法 requester 必须由原服务端和 Information Authority 计算/验证，不能相信由客户端或工具返回文本自报的 actorId/privilege。

### 4.2 Memory Evidence Packet

每个合法证据项应能追溯：
- 稳定 ID、种类、源 Reference / revision / active Variant、源 hash、有效时间；
- Query/Actor 适用原因、世界事实/角色认知/历史传闻的地位；
- Actor exposure proof 或只对 Narrator 的获准用途；
- 摘要/引用的衍生生产者版本、依赖/失效条件；
- 完整性状态：current / superseded / disputed / unknown / stale，不把缺字段解释成 truth；
- 已核算 Token 成本、所选 packet 的覆盖类别、必要的冲突并列来源。

不必将算法评分、私有推理过程或可泄露秘密的完整链路暴露给 Narrator。系统 Trace 保存了就不需要再复制到每次正文 prompt。

## 5. 推荐检索执行管线：约束先行、自适应升级

~~~text
1. Resolve requester / authority snapshot / branch / world time
2. Obtain only eligible source-backed records from owned projections
3. Build deterministic query intent / actor & scene seeds / temporal horizon
4. Run cheap lanes (lexical, typed graph; optional vector when configured)
5. Fuse candidate rankings (RRF baseline), check provenance and actor view
6. If insufficient coverage AND budget/capability permits:
     typed multi-hop/path -> optional PPR -> optional rerank/LLM rewrite
7. Select diverse yet source-complete evidence under Context token budget
8. Revalidate source/actor/branch before compilation and downstream consumption
9. Return structured evidence; Narrator/Orchestrator keep original authorities
~~~

### 5.1 Hard eligibility before similarity ranking

符合以下条件才有候选资格：

- 来源仍有效；没有被编辑、删除、Branch 撤回或相关 ScopeEpoch 失效；
- requester's Actor/Task/Narrator 可见，且该来源投影能够出具 exposure/grant；
- 时间适用：问“十年前”允许使用历史旧事实，问“现在”以当前 World Authority 覆盖；
- 请求用途与 source semantic kind 被原 Context/Information 声明允许。

**硬约束永远不能用检索分数或置信度绕过。** 图扩展仅在授权子图上运行；对错误信念应保留 epistemic 标签；摘要若引用隐藏源，不得靠只删元数据就公开其秘密正文。

### 5.2 Query understanding：优先当前剧情种子

现有 [hybrid-retrieval](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/hybrid-retrieval.js) 的中文实体定位主要靠字/双字、名称和别名。改进候选应包括近期参与 Actor、场景位置、明确的历史事件、未完成承诺条件、指代消歧及查询中的“以前/现在”等时间约束。

例：“她还记得闭关前答应我的事吗？”：
- 首先匹配当前 Scene 的“她”可能是谁，检索具体历史承诺及来源；
- 然后按 Actor exposure / 可用 Belief 或轻度遗忘策略判断此 NPC 是否仍保有记忆；
- 正文中可以自然提及/隐瞒/不确定，但不能因系统成功找到该承诺就宣布 NPC 绝对记得。

无充分来源的实体别名改写不能成为新事实。对于少见隐喻/极端长依赖，已启用预算才调用辅助 LLM 重写，输出仍只是 query proposal。

### 5.3 Candidate lanes

| Lane | 原型 | 强项 | 前提 / 成本 |
| --- | --- | --- | --- |
| Lexical | BM25-like + 中文短语/别名/结构化 token | 专名、原话、明确承诺、无 Embedding 场景 | 本地索引更新和中文歧义 |
| Typed temporal graph | 现有 BFS/邻接 + 有类型的边、有效时间 | 关系、传言传播、因果证据、状态变化 | 必须仅遍历授权/时间适用关系，不将可达性视为因果证明 |
| Vector | 当前 Native Retrieval/Embedding Profile | 隐含语义、口语同义词、长 Episode | 依赖可用 profile、网络/API/存储开销及索引新鲜度 |
| Historical/narrative | Narrative Spine / Rollup / Commitment refs | 长章节、旧约定、关键转折 | 原有压缩版本和源校验，不得与当前 authoritative lane 竞争硬预算 |

图谱种子弱时，PPR 也救不了无意义查询。不要把大范围 PageRank 作为每轮默认；应对真实多跳失败执行 typed path/PPR 的有限消融，并核验完整合法证据链。

### 5.4 Rank：事实权威与相关度是两回事

建议保留现有 RRF 思想作为最小基线：

~~~text
rrfScore(record) = sum_over_lane(weight[lane] / (k + rank[lane, record]))
~~~

然后分开处理：
- **合法性/事实权威**：硬过滤或明确冲突记录；不能靠浮点分数决定“哪条 World 真相是真的”；
- **软相关度**：与当前演员/场景/意图关联、因果邻近、未履行承诺、重要性、时间距离、检索历史；
- **覆盖和成本**：最终选择应避免相似 Episode 重复占据 memory lane，同时保留冲突双方和来源上下文。

置信度分为来源支持、角色信念、检索相关度三个不同量，不能统一当作校准概率。具体 boost/weight、RRF k、MMR lambda 留在实验中以固定验证集调整，不做经验拍脑袋常数。

### 5.5 Coverage-aware packing

现有 [composeMemory](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/hybrid-retrieval.js) 按排序逐条装入；其弱点是可能被重复较长的 Episode 挤掉短而关键的承诺（**待实验，不声称已在线发生**）。

建议评估以下替代：
- 先确保由原 Context Authority 保留的硬性 World/Commitment/Actor context 不被“焦点历史”挤掉；
- 对剩余 focus memory 用 type-aware coverage、去重、有限 MMR 或具有来源证明的 Rollup 做预算选择；
- 原始来源无法在预算下完整携带时，返回有明确 provenance 的摘要或引用，不任意截断不可再解释的事实；
- 当某类证据缺失时明示空缺/未知原因而非静默合成。

Memory 不应因为承诺很重要就强迫角色主动兑现；“应考虑的未履行承诺”不等于“必须触发脚本”。

## 6. Cognitive Update 与 Retrieval 分开触发

沿已确认事件驱动方式：
- T0：明确接触信息/规则导致的确定性更新，不必发额外 LLM；
- T1：重大冲突信念、关系/意图转折、重要承诺等触发有界认知提案，原 Authority 再决定是否采纳；
- T2：仅作品显式启用自主模拟，使用官方 **World Tick** 和既有 Simulation Job / Task outbox，不按现实时间自行推进。

Memory 查询本身不能当作剧情变化的证据。“检索器回忆了师尊的誓言”不能自动写回“师尊刚刚想起誓言”。如剧情要发生正式回忆/遗忘事件，须受对应 Actor/Session 状态修改契约管理。

对遗忘：
- 轻度自然遗忘默认只影响非关键细节的角色认知清晰度或使用意愿，保护重要身份、未履行承诺、关键关系及关键事件；
- 深度认知遗忘作为作品可选规则，允许合理的模糊、再认识或错误重构，但必须有事件/来源与撤回；
- 缩减检索索引、压缩、缓存淘汰均不应自动引发角色性失忆。

## 7. Context：同一证据，不同消费者

使用现有 [Native Context Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js) 的 current_state_event、commitments、recent_raw、narrative_spine、memory、knowledge、target_agent、runtime_system 等 lane。

**消费顺序**：
1. 原 Authority 生成必需 World/Command/Event + Context contract；
2. Audience-specific Information 投影提供可见角色认知；
3. Memory 生成 source-backed focus evidence；
4. Context Compiler 按 required/atomicGroup/target/visibility/token 和指定模型实际 tokenizer 选择与布置；
5. Narrator/Orchestrator 使用自己的获准上下文生成正文/指导，不提升历史为权威状态。

**旁白 B 模式的限制**：旁白能看到较宽事实并不意味着 NPC tool/worker 自动可读取；严格 A 模式则要求旁白自身也只接收被允许的投影。一次共享模型调用包含宽事实时，无法单靠提示词确定性证明对白不泄露；高要求作品须提供更严格的数据分域、分阶段生成或事后结构/行为测试，不能宣称“完全防全知”。

**表达边界**：记忆提供人物经历/心态依据；Expression Profile 决定语言、节奏与细节。过去的文本只作为证据，不当作必须复制的文风；Narrator 正文新鲜生成，避免“清冷=机器人”的机械化固定反应。

## 8. Cache/Index：先验证有效性，再计算收益

| 层 | 候选复用 | 必要条件 | 失效或降级 |
| --- | --- | --- | --- |
| Source / Index | source-valid 的 corpus 投影、图邻接、中文词表、向量 fingerprint | Source ref/Variant/epoch、Chat/Package、索引器/Embedding 版本 | source edit/delete/branch 改动触发 dependency delta；不能证明依赖完整则全量重建 |
| Retrieval | query-seed/候选 rank 与 ID 集 | audience/Actor、scope、Query signature、时间、授权投影、retriever version、有效的 dependency proof | 不得因相同 query 文本/相同向量自动允许跨 Actor 或跨 Branch |
| Context segments | Immutable Actor/Rule/Knowledge 元数据与可用稳定前缀 | 原 Resource exact revision、编译版本、工具 schema/权限、source validity | 动态 Scene/Memories 后置，但不得为 cache 命中藏匿必要事实 |
| Provider prompt cache | 真实 Provider 支持的系统/工具/消息前缀 | 确切 Provider/Model/Gateway/协议、TTL/usage 观测 | NewAPI/SubAPI 这类代理能力未确证则 unknown；不虚报 cached_tokens |
| Workflow/Intent | 已核验的上下文/计划/叙事意图 | 原 Execution Reuse Contract 的依赖和权限重验 | 不缓存普通 RP 的最终正文；正式 effect 不因命中省略 |

当前 Hybrid 每次向量召回都需要投影 corpus、计算指纹、与远端 hash 集合核对，已有不重复 embedding 设计，**但没有跳过所有 O(N) 索引检查**。先基准化 100/1000/10000 篇合法 Episode 的 CPU、index bytes、network、Embedding 调用与 p50/p90 延迟，再引入 index delta，测修订/删除后的 false-hit。

错误的跨权限缓存命中属于正确性失败，而不仅是性能波动；即便 cache 未来被清理，World/Actor 正式状态也不能变化。

## 9. 失败回退：哪类允许降级，哪类必须停止

| 故障 | 推荐行为 |
| --- | --- |
| Embedding 未配置或可选向量服务不可用 | 降至合法 lexical+graph lane，记录 vector_unconfigured/unavailable；不绕过来源和权限 |
| Rerank 超时/失败 | 保留受保护候选和合法的融合排名，记录失败；不伪装 rerank 成功 |
| LLM 查询重写失败 | 使用受证据约束的原查询；对必要隐含关系查不到要标记未知 |
| 权限无授权 / Actor 身份无效 / 当前 source 被撤回 | **Fail closed**，不返回其他 Actor 的候选或旧缓存 |
| Branch/Revision 在 async retrieval 期间改变 | 拒绝旧结果；通过原现行请求路径按预算重算，绝不能晚到覆盖 |
| 关键 Source/Current World 不可获取 | 标注不可用；若后续正式操作必须依赖它则阻断/审阅，不能凭摘要补事实 |
| 后台维护失败 / 超额 | 保留 source 和已提交认知，记录 pending/unavailable，禁止假定已整理 |
| Narrative 生成文本疑似利用未知秘密 | 独立测试/审阅/有界修正；不能宣称静态检索检查保证所有自由文本绝无串知 |

## 10. 工程交付与证伪方式

1. **安全与语义先行**：精确来源、时间、Actor 对应投影及角色错信；Source change、Batch 写入、Branch/Variant 删除、读写 Race。没有此层不得发布 Adaptive/Cache。
2. **统一召回入口硬切换**：完成旧 UI/设置/旧路径移除，但保留有效用户原生数据和 Context 消费者；检索变更时不出现“双跑”或重复注入。
3. **相关性**：中文隐含指代、历史承诺、跨 3 个 Event 的合法因果、历史旧事实、传闻；评估基础 lexical/BFS/RRF 与可选 PPR/MMR/Rerank/LLM。
4. **正文使用质量**：严格角色可知、旁白 A/B/C、玩家自主权、承诺实际引用、角色语气自然、没有旧摘要粘贴。
5. **成本**：普通场景与复杂场景分别测试额外 LLM calls、embedding/rerank、CPU/网络、p50/p90、用户可见延迟与真实费用；缺 usage 标 unknown。
6. **复用有效性**：同 query 不同 Actor、同文本不同分支、历史修订、旧 Promise/Commitment 关闭、元数据权限撤回、索引重建与缓存淘汰。
7. **模型和比较**：复用既有 M1 Evidence/Eval 记录，与 frozen baseline 做成对比较；旧 M1 不利结果不得删除/覆盖；无真实模型结果不能宣称已提高效果。

详尽场景 R6-T01–T15、B0–B6 消融矩阵和外部论文参照只保留在 [retrieval-design.md](retrieval-design.md) §8；分阶段依赖和原计划集成策略只保留在 [integration.md](integration.md)。

## 11. 已冻结与仍由工程负责的分界

**冻结**：HCM-01–08，包括唯一 Hybrid、A/B/C 旁白策略、Actor belief 对 World Truth 的隔离、事件驱动混合认知、作品可选的自主 NPC、World Tick、轻度默认遗忘/深度可选、强约束优先检索、旧模式硬切、保留有效原生记忆、必要 correctness checks 同步执行。

**不冻结的工程变量**：物理 Schema/存储、分词器、RRF k 与 lane weights、PPR/Beam/MMR/LLM 触发器阈值、Token budget、超时、Embedding provider、cache key 的最终编码、UI 组件、G/S 阶段精确归属。要求 Codex 以实际 HEAD、原合同和针对性实验选择并记录，不在尚无生产事实时捏造性能 SLO。

本研究只提供后续正式集成依据。当前 M1 正式验收是否完成、可否在同一开发分支继续，必须读取当时 [正式 Plan](../agent-intelligence-runtime/index.md) 与其 Record，不能由本研究提前改变。
