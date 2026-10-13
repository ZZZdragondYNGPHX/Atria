# Atria 性能与长期体验 — P3 记忆检索、上下文编译及 Agent 计算

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第十五轮讨论稿；第十三轮证明驱动增量计算 C、**第十四轮分层权威 Cache Key/S2 Delta Overlay/准确 Token/质量+成本双门槛 C 均已获批**。运行时编排、并发与失败回退仍待第十五轮定案；未授权修改产品代码。
- **冻结依据**：[index.md](index.md) 为唯一跨模块决策记录；[runtime-storage.md](runtime-storage.md) 管 Native Session/S2/可达性；[stability-recovery.md](stability-recovery.md) 管缓存、生命周期和调度；[measurement-and-evidence.md](measurement-and-evidence.md) 管 P0 基线与验证。
- **只读源码锚点**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`，2026-10-13。特别注意本分支**正是 Agent Compute / M1 等能力开发所在分支**：不能在现阶段直接按静态快照改写这些功能，必须待功能分支集成 `main` 后复核真实实现，再独立立项/创建 refactor 分支。
- **范围**：只调研热路径和资源成本；不引入旧 dev / ST 数据适配层，不减少已冻结的 RP 认知/世界状态权威，不把「减少模型调用数」单独当成优化成功。

## 核心问题

在长篇 RP / 多分支 / 大世界状态 / 多 Agent 长期运行中，检索语料、图谱、证据、上下文编译、Token 计数、Embedding 与 Rerank、Agent 自迭代评估会重复触发。希望消除**相同权威来源上的重复计算**，但绝不能让未授权记忆、过期世界状态、错误时间版本或角色不知道的信息混入当前上下文。

## 源码核查（已确认的实现 ≠ 测得的故障）

| ID | 对应代码 | 实际事实 | 优化假设与边界 |
| --- | --- | --- | --- |
| M1 已有语料复用 | [`public/scripts/agents/memory/index-reuse.js` L1-L32](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/index-reuse.js#L1-L32) | 缓存按 `memoryEligibleSnapshotProof` / `memorySourceSnapshotProof` 及 domain、at 命中，默认 16 项/总 16MiB；不直接缓存最终查询答案、排序或正文，使用 WeakMap 重用向量指纹 | **已有能力应复用**，而非新造 Memory Cache。只是 Corpus 复用，不代表每回合 Lexical Index、Token Packing、向量查询全部不再重复 |
| M2 每次检索构建词袋/DF/邻接 | [`hybrid-retrieval.js` L115-L239](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L115-L239) | `rankMemory` 为合法候选动态 tokenize `documents.map`、生成词频袋与 DF，构建关系邻接并运行多跳，再做 Lexical/Vector/Graph/State 融合；已具 maxDepth、topK 约束 | 对大语料多次查询可能发生**重复准备成本**；候选是把受源/视角/时间版本保护的词袋、倒排与静态邻接作为 Corpus 派生索引，动态查询仍按最新权限筛选/打分 |
| M3 向量集合有增量同步，但每次可能扫描元信息 | [`hybrid-retrieval.js` L370-L470](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L370-L470) | 需要 Vector lane 时计算/重用文档指纹、`listHashes`、必要时 `deleteByHashes`/`insert` 并查询；按 64 项分块处理，受 Source Guard 和计算准入控制 | 优化是减少不必要的整个集合对账、冗余 RPC/Embedding；但不能在未验证来源/权限变化时复用向量结果，也不能绕开原有 AgentCompute 的成本准入 |
| M4 证据打包重复完整 Token 计数 | [`packing.js` L73-L93](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/packing.js#L73-L93) 与 [`hybrid-retrieval.js` L270-L288](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L270-L288) | `composeMemoryCoverage` 每尝试一个候选组，都会对累积的 `corePacket + next` 再调用 countTokens；还要保持原子来源组完整、竞争说法及溯源片段 | 可按内容/Tokenizer/Context 来源版本 memo 计数、使用安全的预预算与最终**完整精确计数**。注意拼接前后 Tokenizer 非线性，**不能简单把独立 Token 数相加当成权威预算** |
| M5 检索有授权与时间源隔离 | [`eligibility.js` L27-L110](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/eligibility.js#L27-L110) | Native `informationContext` 确定有效来源，过滤不可见 Episode/Fact/Entity/Relation，检查 exact anchor/currentness，结构化 atomic group 必须完整 | 这是**不能省掉的正确性关键路径**：任何缓存命中后都必须重新验证最新的角色视角、Branch/Revision、目标时间、来源授权与数据快照 |
| M6 原生上下文分车道构建 | [`public/scripts/native/context-compiler.js` L935-L1123](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/context-compiler.js#L935-L1123) | Knowledge/State/Memory/Raw 等车道，先可见性过滤再 Context Processor，逐候选计 Token，按原子组/硬保留/最低保障/弹性额度装包；不容忍 hard reserve 无法容纳 | 候选缓存固定来源 Token Counts、已验证的静态 Prompt Segment、纯派生知识索引；**不能缓存整个旧 ContextPlan 直接替代本回合预算、权限、World/Actor 当前状态与动态视角判定** |
| M7 PromptCompiler 已含 Segment 复用候选标记 | [`src/native/model-prompt-runtime/prompt-compiler.js` L190-L280](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/model-prompt-runtime/prompt-compiler.js#L190-L280) | `contentFingerprint`、`volatility='stable'/'request'/'compiled'`、`cacheability='candidate'` 明确存在；Native Context Provider 以来源身份和原始引用注入 | 有条件的 Provider prompt-prefix caching 可借用现有 Segment 分类，但 **candidate 标签不等于 Provider 已实际命中缓存**。优化必须记录真实 cache read/write、模型能力/TTL/成本并保持原输入语义和系统/证据权限界限 |
| M8 Native Agent Evolution 已有评价和预算闸门 | [`src/native/agent-intelligence/evaluation/quality.js` L1-L20](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evaluation/quality.js#L1-L20)、[`evolution-evaluator.js` L35-L93](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evolution-evaluator.js#L35-L93) | RP 已有 `player_agency, promise_application, knowledge_boundary, continuity, actor_voice, narrative_response` 维度；晋级检查配对用例、人工/评审结果、预算费用及来源独立性 | 不能通过省略必须的评估、重用过期 Judge 结论或削掉预先冻结的必备质量维度换吞吐。可缓存**版本一致且确定性的准备工作**；若复用评估结果也必须保留真实运行/费用/来源独立证据 |
| M9 Agent 自迭代任务已加入统一 TaskScheduler | [`src/native/agent-intelligence/evolution-service.js` L157-L194](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evolution-service.js#L157-L194) | 后台提交基于 `fingerprint` 去重、`executionClass='background'`、保留 budget，且状态变更可判 stale | 第十/十一轮已冻结前台优先调度和生命期；P3 只定义计算物理优化，不独立发明另一套 Agent 调度器 |
| M10 Source/State 序列化开销 | [`source-lifecycle.js` L151-L221](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/source-lifecycle.js#L151-L221) | 状态读、Reconcile 和多个 JSON.stringify/structuredClone；闭包含 pending/epochs/observed 等 Map | 可测量重复序列化和 Scope 引用保留成本，但不能牺牲源 ID、手动纠正、支撑片段和可验证快照；生命周期问题归 P5 |

**特别注意**：仓库已有 `index-reuse.js`、预算化 Retrieval、Native Prompt Segment 以及 Agent Evolution 成本规则，不应把这些当作“尚未实现的创新”重复规划。上表是代码行为与可测假设，**没有 P95 实测或性能回归结论**。

## 不可削弱的语义正确性

1. **权威优先**：当前 World/Actor/命令结果由最新合法权威状态确定；历史事件和记忆的支撑仅是历史证据，不能替换当前状态。无证据/矛盾证据可返回 Unknown，而不是凭检索相似度补全故事事实。
2. **视角与时间**：按合法 `requester`（Narrator、NPC/Actor、Task）、Session/Branch/Revision、具体时间 `at`、信息投影 grant 来筛选。NPC 不因玩家或其它分支中的事实被缓存而获得全知。
3. **原子记忆**：对于具有证据组和相互矛盾说法的条目，取证/Token 装包不得把同组拆开造成错误结论；源消息和内容 hash 完整可核对。
4. **剧情承诺与玩家主体性**：优化后不能遗失先前明确剧情承诺、人格/文风与声线、角色知情范围、事件时间因果以及玩家自主权；这些属于真正的 RP 质量，不能只测检索文本相似度。
5. **质量闸门**：Agent 自迭代不能只看调用成本；RP 的已有六项核心质量维度均为当前源码明确的保障。新增文学表达、视角一致/叙事节奏等可作为后续**单独质量评估方案**，不可在性能迭代中自称已有全面覆盖。
6. **S2 与 RunControl**：当前及历史数据来自可靠 Revision/State/SavePoint；过期缓存不能写回已确认游戏状态，缓存淘汰与重建不得影响正式游戏历史。Stale Agent Work 不得越权发布。

## 第十三轮架构比较（**C 已获批准**）

| 方案 | 做法 | 表面优势 | 主要风险 |
| --- | --- | --- | --- |
| A — 激进结果缓存 / 减少调用 | 在近期对话复用最终 Recall/Prompt/Agent 输出，降低刷新与 LLM 预算 | 可能显著降时延和费用 | 极易引发跨角色视角、时间与 Branch 的旧事实泄漏，降低叙事适应性；评估重用易假性晋级 |
| B — 每回合全量重算 + 多模型校验 | 为每个回合重建索引、强制所有 Vector/Rerank/Judge 耗时路径，以“完整”为目标 | 容易理解每轮独立性 | 成本和等待随 Session 增长、使长篇 RP 体验恶化；实际上全量并不能自动提高质量 |
| **C — 权威证明驱动的增量派生计算 + 分车道动态组装 + 质量门槛（第十三轮已选）** | 静态 Corpus/词法倒排/图邻接/文档指纹增量缓存，**按请求实时做权限/时间过滤、当前状态/检索意图排序与准确 Token 装包**；仅在必要时按已准入的预算调用 Vector/Rerank/Agent；原有评估质量闸门与 S2 均不变 | 有望显著减少可避免的 CPU/Token/向量 RPC，同时保留当轮语义 | Cache-Key/失效证明必须设计清楚，需要 P0 的同场景质量和时延双目标证据 |

### 已批准 C 的三层计算复用职责（具体缓存算法仍待讨论）

**L1：稳定且可重建的派生索引（优先优化）**

- 基于原语料与权威证明，按局部变化维护倒排/词频/DF、图邻接、可用 Episode 支撑映射、Embedding 内容指纹/远端集合差量状态；复用已有 `memoryCorpusReuse` 及现有向量生命周期，不额外维护一个旧格式双读写的 MemoryOS。
- 索引键必须绑定有效 `sourceIdentity` / `sourceHash`、版本、Project/Session/Branch/Revision 所要求的合法作用域、目标时间/权限或安全地构建不暴露机密的分区；任何来源、Policy、Embedding Profile/Tokenizer 版本修改，都不能沿用旧授权结果。
- 缓存可以跨 Turn 复用同一份**确定且合法的静态索引**，但明确禁止跨 Actor/Information grant 错用「已过滤后的授权视图」。共享物理索引不等于共享查询授权；非法证明/当前性失效时 fail closed。
- 有界 LRU/byteBudget/生命周期由 P5 管理；旧 index 可以重算，不能作为持久唯一事实来源。

**L2：请求驱动的检索、证据与 ContextPlan（每回合重验）**

- 按当前玩家输入、正在发生的 scene、Actor 视角、时间、Knowledge/State/运行规则形成 QueryPlan。需要动态检索 rank/RRF/graph 源选择；向量/rerank 仅在 `invocation-policy` 准入且对质量有贡献的场景调用，能力不足须标记 unavailable/unknown 而非编造。
- 原子证据/互相矛盾说法/当前 World State 优先；给必要内容保留 hard reserve。优化 Token Counting 的缓存时按确切 Tokenizer 模型和 ContentFingerprint 锁定，并且在最终装包边界进行精确计数/溢出检查，不能用字节估计偷偷放宽预算。
- `ContextPlan` 必须引用当前 Revision/Branch/Information projection 与可追溯证据；正在生成时切分支或更新世界状态，应拒绝旧结果并重新编译。不直接缓存整个先前生成的 Prompt 成最终当前事实。
- 动态 Persona、对话最近窗口、未完成的 action/status 与模型/工具的 Authority 不可被过期静态快照覆盖。打包顺序应根据任务和模型测试，而不是一味把所有历史全文塞给模型。

**L3：Provider / Agent 的有条件复用**

- 优先利用 `PromptCompiler` 既有 stable/compiled/request Segments，保持 provider 支持的稳定前缀；Provider 侧 Prompt Cache 如有能力，必须按实际 provider/model/request 身份、TTL/usage cache-hit 证据和隐私要求选用。不承诺所有提供商都可缓存、也不把 prompt cache 当作存档。
- 对 Agent 自迭代，`evaluation case` 及静态配置准备可按 evaluatorRevision/targetPin/qualityRevision/caseSet/权限/具体 source 证明 memo，但每次晋级不可省略当轮必要的真实比较、独立评判、费用核销与人工审批。不得缓存最终晋级结论当作下一次新证据。
- Agent 外部任务复用 `NativeTaskScheduler` 的 `turn_blocking/interactive/background/maintenance`，长耗时的非阻塞计算让位于剧情回复和 S2 Commit。局部多跳可以 Worker/限时分批，是否值得引入取决于平台开销实测。


## 第十三轮正式结论与第十四轮边界

**第十三轮已正式选择 C**：只复用有确切权威证明的稳定准备工作，查询时继续做最新的视角/权限/时间/World State 审查与动态 ContextPlan；向量、Rerank、Agent 调用须经既有成本与质量预算审查，不能把旧排序、旧检索答案或旧晋级结论直接当作新回合的权威内容。

**第十四轮待讨论**：具体 Source/Policy/Time/Branch 缓存键、增量更新事件和一致性水位、Exact Token 计数提速、Provider 侧缓存与模型/Agent 预算策略，均不事先设定无依据的数值上限。

## 第十四轮缓存键、失效、增量索引与预算设计（**原则方案 C 已批准，字段与参数待定**）

### A. 缓存职责边界（第十四轮 C 原则已确认）

| 层次 | 允许复用的数据 | 不能直接复用的结果 |
| --- | --- | --- |
| K0 — 不可变原始内容的确定性派生 | 同权限域内的文本规范化、Tokenizer 输入片段、文档内容指纹、词袋、可复算的局部特征 | 上一条消息的可见性判定、当前世界事实 |
| K1 — 版本化 Corpus/Index | 同一来源版本的倒排索引、文档频率、图邻接、向量索引已对账水位、已校验的静态资源片段 | 尚未对新 Revision 重核的完整候选排序、NPC 私有记忆曝光 |
| K2 — 一次请求内的授权投影与检索组合 | **限定在同一 Request/Scope 内**的合法 CandidateSet、源证据组、局部 Token 计数、检索片段 | 换 Actor/Branch/时间/World 后继续当作合法查询结果 |
| K3 — Provider Prefix Cache | 经模型/Provider 支持、真实完整 Prompt 前缀一致并记录实际 usage 的稳定 Prompt 片段 | 存档、事实权威、其他用户权限证明、旧模型响应/自动自迭代评价 |

第十三轮只批准总体增量复用；K0–K3 是第十四轮的候选实施分层，**不是新建四套独立缓存服务**。优先扩展已有 `memoryCorpusReuse`、Prompt Segment、TaskScheduler 和 P5 缓存预算/作用域接口。

### B. Cache Key 方案与失效边界（已选 C）

- **候选 A「Revision 全键」**：每个 Cache Key 都包含整段 RevisionRoot。容易保守失效，但每新回合多数稳定静态特征也被重建，复用率较低。
- **候选 B「只有内容哈希」**：跨 Branch、Actor、权限乃至用户共享所有结果。看似复用率最高，但合法可见性、时态与 NPC 知情边界可能严重错误，**不推荐**。
- **候选 C「分层身份 + 权威证明 + 当前 Query 投影」**（第十四轮已选）：
  - **K0/K1 的安全存储分区**：owner/tenant、Project 作用域、不可变 Source ID/ContentHash、Corpus/Index Schema 版本、Tokenizer/Embedding Profile 与配置版本，以及 S2 来源/投影证明。分支公共祖先的相同不可变内容可按合法安全分区复用，**不会跨用户无授权共享原文/索引**。
  - **K2 的请求身份**：Session、Branch、RevisionRoot、requester kind/actorId、Information grant/view fingerprint、目标游戏时间（含时态域）、当前 World/Actor State Head、查询与场景指纹、检索 Policy/Prompt 路由版本、Context Token budget/Tokenizer ID、Request Epoch。不能靠仅 `BranchId` 或仅 `ContentHash` 代替最新权限证明。
  - **物理共享与授权结果分离**：底层可共享不可变段/索引，查询必须在读取原文/生成外部 Embedding/Rerank/Prompt 之前根据当前 Information 权限筛出合法 IDs；即使排序分数/日志，也不向当前请求泄漏拒绝的内容和存在性。每次命中仍执行可验证的 `assertCurrent`/grant 校验，不因缓存命中跳过鉴权。
  - **不能缓存最后答案/晋级结果当作新证据**：排序还依赖当前意图、状态、Recency/Access 计数、时态、成本准入与模型能力。确切版本、权限或时间不明时直接 miss 或显式 unavailable，不猜。

### C. 已提交 Delta 与读到最新结果（第十四轮 C 已选）

| 触发 | 必须失效/重验的范围 | 可保留的复用 |
| --- | --- | --- |
| 新 Turn/Revision S2 Commit | 新 Timeline/State/Memory 文档的 Delta、当前场景/时间及派生检索视图；CommitReceipt 之后同步推进可读取水位 | 未修改的不可变文档词袋、稳定工具/Prompt 模块 |
| Load SavePoint / Switch Branch | 旧分支 K2 授权结果、异步查询、NPC 意识视角与 World State 投影 | 相同授权域内已验证的公共祖先 K0/K1 |
| 记忆纠正、来源撤销、Knowledge/World 修改 | 变动文档及关联 Fact/Relation/AtomicGroup 支撑、现行授权和现行状态 | 与变动无关且仍合法的索引节点 |
| 游戏时间前进、NPC 知情/曝光改变 | 时态有效性、视角/授权投影、置信度与动态 Recency/Ranking | 不含请求授权结论的纯词法特征 |
| 检索策略、Tokenizer/Embedding 模型变更 | 相应 Index/Token/Vector namespace、模型能力与预算推断 | 原始受保护 Source/Revision、无关模型的索引 |

**推荐一次核心读路径契约**（伪协议，非现存接口）：

1. 读取并 Pin 当前合法 S2 `RevisionRoot`，产生 `QueryEpoch + sourceGeneration`；在此根对应的 Authority/Information grant 下选择初始可见 Source 集。
2. 从 `IndexGeneration` 与该 Revision 所需的源变更范围比对：已覆盖则命中；落后一小批则合并已确认 Event Delta/Tombstone 形成 **Base Index + Delta Overlay**；落后太多/不可验证则切到受保护的完整合法来源查询或显式能力不可用，**不能对玩家谎称已覆盖最新事件**。
3. 仅在已授权文档集合中检索/排序/取内容；必要时在后台建立新不可变 IndexGeneration，**发布前重验来源权威版本**。新旧索引读者以版本 pin 分离；GC 不抢走仍使用的共享段。
4. 在每次等待/外部模型请求前后核对 `RevisionRoot、grant、Epoch`；若用户读档/切分支，旧结果只能丢弃或重新编译，不允许以旧结果覆盖新 ContextPlan/世界状态。

**注意**：BM25/词袋索引中的 `N/DF/avgDocumentLength` 等依赖语料总体统计量。即便只新增一个文档，也需保持统计正确，不能只改新增文档的 postings 而继续使用旧的全局 DF；受权限/时间限制的 Query 可见集合也可能改变统计基础。建议先保守正确、局部 Overlay + 必要统计重算，待 P0 后才引入进一步的统计缓存。

### D. 增量索引的运行方式

- 按 **S2 Commit 之后的已确认事件** 为派生层输入（不是尚未 durable 的流式文本）。事件至少能表达 UPSERT/RETRACT/SUPERSEDE/ACL_CHANGED/STATE_CHANGED/BRANCH_CHANGED 等语义；具体通知由未来 Native 仓库提交层或投影层产生，**不可宣称当前已有这些 API**。
- 以稳定文档 ID、内容哈希与来源 proof 记录生效/撤销；一条纠正可能影响其证据支持的 Fact、Relation、AtomicGroup、Timeline/World 断言链，不能只改变一个向量项。
- 有限步长处理：增量合并与索引封存任务复用第十轮预算式调度器，不与首玩、当前模型生成或 S2 耐久提交争抢；索引延迟不得延迟正式 Turn Commit ACK，却也不得让随后检索读取未覆盖的新来源。
- Index 本身可重建，授权与 S2 仍在权威层；`IndexGeneration + sourceWatermark` 等数据必须准确指示索引覆盖范围，不能把缓存文件最新时间当作来源权威证据。
- Provider Embedding/向量集合差量同步先比对已验证的内容指纹和模型配置；只有需要新 Embedding 且获预算准入才发请求，原文/身份不得泄露给未经授权的 Provider。远端集合对账可以按已验证 generation 限流，更新一致性要有可测试的异常/重启策略。

### E. Token 安全计数原则（已确认最终完整精确计数）

1. 对 `TokenizerEngine/ModelVersion + 完整规范化内容 + 格式/角色边界` 完全相同的**确定性字符串** memo 精确计数；静态 Prompt Segment 与证据记录可被缓存，受到 P5 容量/生命周期约束。
2. 可采用粗略上限估算、延迟批量计数和候选组预筛选减少明显无效的重复计算；但**最终序列化的完整 Prompt/ContextPlan** 必须由对应模型可靠 Tokenizer/Provider 计数重新验证，不允许依赖 UTF-8 字节数冒充精准 Token 数。
3. BPE/Tokenizer 在串接位置可发生重新分词，因此 **Token(A+B) 不一定等于 Token(A)+Token(B)**。段计数之和只能用于经证明安全的界限估算；无界数值误差不可直接用于 `hard reserve` 或 `reservedOutputTokens`。
4. 若真 Tokenizer 不可用，只能按明确的保守预算/能力降级策略处理并标记诊断；对不能保证容量的任务需限制上下文或失败提示，不能静默跳过硬保留的 World 权威或原子证据。
5. ContextPlan 权威校验与安全 Hash/Provenance 仍要保留；性能指标包含 Counting CPU/P95、重复调用数、跨模型误用率、最终 Token Overrun、硬保留失败与最终 Evidence Coverage。

### F. 模型、向量与 Agent 调用预算：三种比较（已选 C）

- **A — 按回合固定调用矩阵**：每回合无论证据质量都执行 Embedding/Rerank/Agent，成本可预测但长篇 RP 可能大幅浪费。
- **B — 极限节约**：近似从不做可选向量与质量复核，把“模型调用更少”视作成功。可能严重伤害剧情、NPC 记忆/承诺与 Agent 自迭代有效性，**不推荐**。
- **C — 质量与成本双约束的分层准入（第十四轮已选；预算数值未定）**：
  - **必须执行的权威检查**：当前 Revision/世界状态、NPC 合法知情与权限、原子证据、Prompt/Token 边界，不得通过成本配置豁免；尽可能使用确定性本地计算。
  - **本地检索优先**：已有 `memoryInvocationDecision` 能在合法词法/图检索有充分依据时跳过可选 Vector；仅在缺口、关键冲突或特定任务证据不足且预算许可时尝试 Embedding/Rerank；诊断明确区分 `source_unavailable`、`budget_blocked`、`quality_gap`，不伪造使用过的工具。
  - **预算轴分离**：本回合 CPU/响应时延、Token/上下文硬限制、额外 Provider 调用与估算费用，及 Session/Project/Agent 长期累计费用分别保有可观察账目。任务准入需绑定调用身份、Source/Revision、模型路由、请求 Fingerprint、重试次数和已支付/待对账记录；失败或超时不自动等于零成本。
  - **原生质量闸门**：RP/Project Evolution 必要的配对试验、独立评估、人工审批/费用核验不能省略；当余额或明确授权的硬预算不足时暂停辅助自迭代/提示原因，而不是虚构通过或悄悄降品质。用户可配置费用/速度偏好，但须保持已冻结的安全与质量底线。
  - **Provider Prefix Cache**：按真实提供商的支持情况、完整前缀指纹、模型/工具配置与 TTL 决定是否有利，核查实际 `cache_read/cache_write/input/output` 使用量、费用与命中率；不得保证所有模型或代理层提供相同缓存收益，更不能将稳定前缀 Cache 当作来源授权缓存。

### G. 第十四轮正式结论与仍需验证的问题

- **方案 A：粗粒度全 Revision Key + 全量重建 + 固定 Provider 矩阵**。正确性较好解释，但几乎无法复用长期游戏中稳定的知识/工具与同源索引。
- **方案 B：内容哈希全局缓存 + 乐观异步索引 + 极简 Provider 调用**。吞吐可能高，但跨授权域/分支泄漏、最新状态缺失与 RP 质量退化风险不可接受。
- **方案 C：分层来源证明 Key + 已确认 Commit 驱动的版本化增量索引/Delta Overlay + Exact Token 最终校验 + 质量预算双门槛**（**第十四轮已正式冻结原则组合，具体参数/协议仍待实施设计**）。
- **已经选择 C**。第十五轮讨论 ContextPlan 与 Memory Recall 的调度时机、读写并发/失效边界、Token/调用预算的情境化配置档位与失败回退 UX；所有成本、阈值、召回 P95/质量回归门槛仍依 P0 实测选定。
- 最小验证必须包含 **同时**：新 Turn 后立即回忆该条事实（read-your-writes）；Branch/SavePoint 切换后的授权隔离；已撤销/过期/竞争证据不被缓存重新放出；分词边界/模型 Tokenizer 改变；向量同步部分失败/重启；Provider 超时与失败计费；质量评估的独立来源/费用账目。
- 上述候选仅针对新 dev 支持格式。严禁为了旧 SillyTavern swipe_id、旧 Schema、旧 MemoryOS 数据格式做额外迁移/兼容双读写；当前隐藏 Native ABI 真正仍需使用的依赖必须审计清楚才可移除。

## P0 验收矩阵建议（真实目标与采样点待定）

| 负载/场景 | 延迟和资源指标 | 不可退化的语义指标 |
| --- | --- | --- |
| 同 Session 100 / 1k / 5k 条会话，500 / 3k / 10k 记忆事实，若干分支 | Recall/Compile P50/P95、Lexical 建索引/增量耗时、Heap、对象数、RPC、Token/Provider 调用成本 | 有证据的 Recall@k、时间正确性、NPC 视角隔离、来源可核验 |
| 相同语料重复若干次新输入，单条新事件改变 World State | Index hit/miss、被重算条目数、Vector list/insert/query 调用数、Prompt Segment 缓存命中数 | 新状态必须即时生效；旧事实不得压倒 World，不能引用别的分支 |
| 有相互矛盾证据、人物承诺、历史多跳、关键时间点 | 召回时间、打包截断原因、必须保留的原子证据组、Context 总 Token | 覆盖率、证据冲突显式保留、承诺落实、玩家主体性与叙事连续性 |
| 多 Actor 多 Perspective + Branch 切换 + 新存档读档 | 授权缓存隔离代价、取消 stale 操作响应、缓存字节预算 | 无「防全知」破坏、跨 Branch 记忆污染、私有状态泄漏 |
| RP / Project Agent 自迭代评价 | 总端到端时延、辅助准备 CPU、Provider 试验预算、Judge 成本 | RP 六维最低合格，Project 六维保留；独立评估、可归因、人工/费用证据完整 |
| 无 Tokenizer / Vector 可用 / Provider 超时 | 退化路径时间、失败来源、Diagnostics、真实调用费用 | 明确 unavailable/unknown、有限退化、无伪造检索命中或能力可用声明 |

- 给出旧版（功能分支并入 main 后）和新实现**同数据、同请求、同模型配置、同授权快照**的 P50/P95、成本、命中率及质量结果。样本规模是讨论候选，不是此时承诺支持 N 条消息或一个固定召回率。
- 继续使用已有检索详细 metrics（例如 `corpusMs/vectorMs/rankingMs/rerankMs/packingMs/proofMs` 与 `work` 字节/RPC）；避免另造不对齐的计量接口。
- 最小定向测试优先复用 [`tests/memory-graph/hybrid-retrieval.test.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/memory-graph/hybrid-retrieval.test.js)、[`tests/native/context-compiler.test.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/native/context-compiler.test.js)、[`tests/native/long-memory-turn-consumer-g06.test.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/native/long-memory-turn-consumer-g06.test.js) 与 M1/质量评估相关测试；严格遵守“修改哪块测哪块，不等待完整全仓 CI”，不能跳过关联的权威/安全不变量。

## 外部参考（仅用于候选论证，不表示要照搬依赖）

1. [Microsoft Azure AI Search: Hybrid search + RRF](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking) — Lexical/Vector 各自得分空间不同，融合排序应有稳定的归一/融合语义，不仅优化召回率还要保持排序与动态权限过滤。
2. [Lost in the Middle（Liu 等，TACL 2024）](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/Lost-in-the-Middle-How-Language-Models-Use-Long) — 超长上下文不保证信息等比例被有效使用；应测量关键来源信息的位置与召回利用率，不凭“塞得更多”宣称质量提高。
3. [Claude Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) 与 [Google Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching) — Provider 前缀/显式缓存能力依服务、Token 长度、命中、TTL 与计费；不能把 Atria 的 `cacheability:'candidate'` 当成 Provider 已实际缓存的证据。
4. [NVIDIA RAG Evaluation](https://docs.nvidia.com/rag/latest/evaluate.html) — Recall、Context Relevancy、Groundedness/Answer Accuracy 可用作通用质量指标，RP 仍必须加 Player Agency、承诺、视角、文风、状态连续性等领域评价，不能仅靠 RAG 指标判断文学表现。
5. [Apache Lucene — Near Realtime Search](https://cwiki.apache.org/confluence/spaces/LUCENEJAVA/pages/120735094/NearRealtimeSearch) 与 [IndexWriter API](https://lucene.apache.org/core/10_3_1/core/org/apache/lucene/index/IndexWriter.html) — 增量索引、已提交/可见代际及读者生命周期的工程类比；**并不决定让 Atria 引入 Lucene**，尤其不允许把尚未 S2 确认的内存更新冒充游戏权威提交。
6. [Claude 官方 Prompt Caching（中文）](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching) — 区分 cache read / cache creation / uncached input Token 和不同 TTL 成本；Provider 价格和支持范围变化，实际预算以当前 Route/Usage 回执为准。

## Material design changes

- **2026-10-13 / 第十三轮审计**：在第十二轮分层启动 C 冻结之后建立 P3 专项，确认当前已有 SourceProof+16MiB bounded Corpus reuse、RRF 混合检索、分组证据与预算准入、Native ContextPlan 车道权威、Prompt segment fingerprints、RP/Project 质量评估及 Agent 后台 Scheduler。提出 A/B/C 方案，推荐 C 但**尚未冻结**；未修改产品代码、未跑性能基准或现实 LLM 调用。
- **2026-10-13 / 第十四轮开端**：用户批准第十三轮方案 C，正式冻结来源/权限证明驱动的增量派生索引、每轮合法性和动态 ContextPlan、原子证据/精确 Token 预算与 RP/Project 质量门槛；第十四轮继续缓存键/失效、读到最新提交、Token 和调用预算细节讨论，产品代码未改。
- **2026-10-13 / 第十四轮研究稿**：在已冻结 P3 C 上补充分层 Cache Key、sourceGeneration/IndexGeneration 水位、Base+Delta Overlay、纠错撤销传播、Tokenizer 精确收口和 Provider/Agent 费用/质量双约束 A/B/C 选项；这些属于待用户讨论的新细节，不将候选算法或数字冒充已批准。
- **2026-10-13 / 第十五轮开端**：用户批准第十四轮 C，正式冻结分层安全 Cache Key/来源与授权隔离、已确认 S2 Delta Overlay/索引代际校验/Read-Your-Writes、最终完整 Token 精确容量校验，以及 Agent/Provider 质量和费用双门槛；A/B 候选仅留作历史比较。第十五轮开始分析 ContextPlan 与 Memory Recall 的执行时机、并发与失败回退，不预先冻结实际阈值或新接口形状。
