# Atria 性能与长期体验 — P3 记忆检索、上下文编译及 Agent 计算

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第十三—十五轮 P3 方案 C 均已获批；第十六轮正与 P0–P5 收束，运行时物理接口、数值配额与目标硬门槛仍待 P0/工程实现，未授权改动产品代码。
- **冻结依据**：[index.md](index.md) 为唯一跨模块决策记录；[runtime-storage.md](runtime-storage.md) 管 Native Session/S2/可达性；[stability-recovery.md](stability-recovery.md) 管缓存、生命周期和调度；
- **只读源码锚点**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`，2026-10-13。
- **范围**：只调研热路径和资源成本；不引入旧 dev / ST 数据适配层，不减少已冻结的 RP 认知/世界状态权威，不把「减少模型调用数」单独当成优化成功。

## 核心问题

在长篇 RP / 多分支 / 大世界状态 / 多 Agent 长期运行中，检索语料、图谱、证据、上下文编译、Token 计数、Embedding 与 Rerank、Agent 自迭代评估会重复触发。希望消除**相同权威来源上的重复计算**，但绝不能让未授权记忆、过期世界状态、错误时间版本或角色不知道的信息混入当前上下文。

## 源码核查（已确认的实现 ≠ 测得的故障）

| ID | 对应代码 | 实际事实 | 优化假设与边界 |
| --- | --- | --- | --- |
| M1 已有语料复用 | [`public/scripts/agents/memory/index-reuse.js` L1-L32](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/index-reuse.js#L1-L32) | 缓存按 `memoryEligibleSnapshotProof` / `memorySourceSnapshotProof` 及 domain、at 命中，默认 16 项/总 16MiB；不直接缓存最终查询答案、排序或正文，使用 WeakMap 重用向量指纹 | **已有能力应复用**，而非新造 Memory Cache。只是 Corpus 复用，不代表每回合 Lexical Index、Token Packing、向量查询全部不再重复 |
| M2 每次检索构建词袋/DF/邻接 | [`hybrid-retrieval.js` L115-L239](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L115-L239) | `rankMemory` 为合法候选动态 tokenize `documents.map`、生成词频袋与 DF，构建关系邻接并运行多跳，再做 Lexical/Vector/Graph/State 融合；已具 maxDepth、topK 约束 | 对大语料多次查询可能发生**重复准备成本**；候选是把受源/视角/时间版本保护的词袋、倒排与静态邻接作为 Corpus 派生索引，动态查询仍按最新权限筛选/打分 |
| M3 向量集合有增量同步，但每次可能扫描元信息 | [`hybrid-retrieval.js` L370-L470](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L370-L470) || 优化是减少不必要的整个集合对账、冗余 RPC/Embedding；|
| M4 证据打包重复完整 Token 计数 | [`packing.js` L73-L93](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/packing.js#L73-L93) 与 [`hybrid-retrieval.js` L270-L288](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L270-L288) | `composeMemoryCoverage` 每尝试一个候选组，都会对累积的 `corePacket + next` 再调用 countTokens；还要保持原子来源组完整、竞争说法及溯源片段 | 可按内容/Tokenizer/Context 来源版本 memo 计数、使用安全的预预算与最终**完整精确计数**。注意拼接前后 Tokenizer 非线性，**不能简单把独立 Token 数相加当成权威预算** |
| M5 检索有授权与时间源隔离 | [`eligibility.js` L27-L110](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/eligibility.js#L27-L110) |||
| M6 原生上下文分车道构建 | [`public/scripts/native/context-compiler.js` L935-L1123](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/context-compiler.js#L935-L1123) | Knowledge/State/Memory/Raw 等车道，先可见性过滤再 Context Processor，逐候选计 Token，按原子组/硬保留/最低保障/弹性额度装包；不容忍 hard reserve 无法容纳 |**不能缓存整个旧 ContextPlan 直接替代本回合预算、权限、World/Actor 当前状态与动态视角判定**|
| M7 PromptCompiler 已含 Segment 复用候选标记 | [`src/native/model-prompt-runtime/prompt-compiler.js` L190-L280](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/model-prompt-runtime/prompt-compiler.js#L190-L280) | `contentFingerprint`、`volatility='stable'/'request'/'compiled'`、`cacheability='candidate'` 明确存在；Native Context Provider 以来源身份和原始引用注入 | 有条件的 Provider prompt-prefix caching 可借用现有 Segment 分类，但 **candidate 标签不等于 Provider 已实际命中缓存**。优化必须记录真实 cache read/write、模型能力/TTL/成本并保持原输入语义和系统/证据权限界限 |
| M8 Native Agent Evolution 已有评价和预算闸门 | [`src/native/agent-intelligence/evaluation/quality.js` L1-L20](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evaluation/quality.js#L1-L20)、[`evolution-evaluator.js` L35-L93](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evolution-evaluator.js#L35-L93) | RP 已有 `player_agency, promise_application, knowledge_boundary, continuity, actor_voice, narrative_response` 维度；| 不能通过省略必须的评估、重用过期 Judge 结论或削掉预先冻结的必备质量维度换吞吐。可缓存**版本一致且确定性的准备工作**；若复用评估结果也必须保留真实运行/费用/来源独立证据 |
| M9 Agent 自迭代任务已加入统一 TaskScheduler | [`src/native/agent-intelligence/evolution-service.js` L157-L194](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/agent-intelligence/evolution-service.js#L157-L194) | 后台提交基于 `fingerprint` 去重、`executionClass='background'`、保留 budget，且状态变更可判 stale | 第十/十一轮已冻结前台优先调度和生命期；P3 只定义计算物理优化，不独立发明另一套 Agent 调度器 |
| M10 Source/State 序列化开销 | [`source-lifecycle.js` L151-L221](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/source-lifecycle.js#L151-L221) | 状态读、Reconcile 和多个 JSON.stringify/structuredClone；闭包含 pending/epochs/observed 等 Map |生命周期问题归 P5|

**特别注意**：仓库已有 `index-reuse.js`、预算化 Retrieval、Native Prompt Segment 以及 Agent Evolution 成本规则，不应把这些当作“尚未实现的创新”重复规划。上表是代码行为与可测假设，**没有 P95 实测或性能回归结论**。

## 不可削弱的语义正确性

1. **权威优先**：当前 World/Actor/命令结果由最新合法权威状态确定；历史事件和记忆的支撑仅是历史证据，不能替换当前状态。无证据/矛盾证据可返回 Unknown，而不是凭检索相似度补全故事事实。
2. **视角与时间**：按合法 `requester`（Narrator、NPC/Actor、Task）、Session/Branch/Revision、具体时间 `at`、信息投影 grant 来筛选。NPC 不因玩家或其它分支中的事实被缓存而获得全知。
3. **原子记忆**：对于具有证据组和相互矛盾说法的条目，取证/Token 装包不得把同组拆开造成错误结论；
4. **剧情承诺与玩家主体性**：优化后不能遗失先前明确剧情承诺、人格/文风与声线、角色知情范围、事件时间因果以及玩家自主权；这些属于真正的 RP 质量，不能只测检索文本相似度。
5. **质量闸门**：Agent 自迭代不能只看调用成本；RP 的已有六项核心质量维度均为当前源码明确的保障。新增文学表达、视角一致/叙事节奏等可作为后续**单独质量评估方案**，不可在性能迭代中自称已有全面覆盖。
6. **S2 与 RunControl**：当前及历史数据来自可靠 Revision/State/SavePoint；过期缓存不能写回已确认游戏状态，缓存淘汰与重建不得影响正式游戏历史。Stale Agent Work 不得越权发布。

## 第十三轮架构比较（**C 已获批准**）

| 方案 | 做法 | 表面优势 | 主要风险 |
| --- | --- | --- | --- |
| A — 激进结果缓存 / 减少调用 | 在近期对话复用最终 Recall/Prompt/Agent 输出，降低刷新与 LLM 预算 | 可能显著降时延和费用 | 极易引发跨角色视角、时间与 Branch 的旧事实泄漏，降低叙事适应性；评估重用易假性晋级 |

### 已批准 C 的三层计算复用职责（具体缓存算法仍待讨论）

**L1：稳定且可重建的派生索引（优先优化）**

- 基于原语料与权威证明，按局部变化维护倒排/词频/DF、图邻接、可用 Episode 支撑映射、Embedding 内容指纹/远端集合差量状态；复用已有 `memoryCorpusReuse` 及现有向量生命周期，不额外维护一个旧格式双读写的 MemoryOS。
- 任何来源、Policy、Embedding Profile/Tokenizer 版本修改，都不能沿用旧授权结果。
- 缓存可以跨 Turn 复用同一份**确定且合法的静态索引**，但明确禁止跨 Actor/Information grant 错用「已过滤后的授权视图」。共享物理索引不等于共享查询授权；
- 有界 LRU/byteBudget/生命周期由 P5 管理；旧 index 可以重算，不能作为持久唯一事实来源。

- 按当前玩家输入、正在发生的 scene、Actor 视角、时间、Knowledge/State/运行规则形成 QueryPlan。需要动态检索 rank/RRF/graph 源选择；向量/rerank 仅在 `invocation-policy` 准入且对质量有贡献的场景调用，能力不足须标记 unavailable/unknown 而非编造。
- 原子证据/互相矛盾说法/当前 World State 优先；给必要内容保留 hard reserve。
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
| K2 — 一次请求内的授权投影与检索组合 | **限定在同一 Request/Scope 内**的合法 CandidateSet、源证据组、局部 Token 计数、检索片段 | 换 Actor/Branch/时间/World 后继续当作合法查询结果 |
| K3 — Provider Prefix Cache | 经模型/Provider 支持、真实完整 Prompt 前缀一致并记录实际 usage 的稳定 Prompt 片段 | 存档、事实权威、其他用户权限证明、旧模型响应/自动自迭代评价 |

第十三轮只批准总体增量复用；K0–K3 是第十四轮的候选实施分层，**不是新建四套独立缓存服务**。优先扩展已有 `memoryCorpusReuse`、Prompt Segment、TaskScheduler 和 P5 缓存预算/作用域接口。

### B. Cache Key 方案与失效边界（已选 C）

- **候选 A「Revision 全键」**：每个 Cache Key 都包含整段 RevisionRoot。容易保守失效，但每新回合多数稳定静态特征也被重建，复用率较低。
- 看似复用率最高，但合法可见性、时态与 NPC 知情边界可能严重错误，**不推荐**。
- **候选 C「分层身份 + 权威证明 + 当前 Query 投影」**（第十四轮已选）：
  - 分支公共祖先的相同不可变内容可按合法安全分区复用，**不会跨用户无授权共享原文/索引**。
  - **K2 的请求身份**：Session、Branch、RevisionRoot、requester kind/actorId、Information grant/view fingerprint、目标游戏时间（含时态域）、当前 World/Actor State Head、查询与场景指纹、检索 Policy/Prompt 路由版本、Context Token budget/Tokenizer ID、Request Epoch。
  - **物理共享与授权结果分离**：底层可共享不可变段/索引，查询必须在读取原文/生成外部 Embedding/Rerank/Prompt 之前根据当前 Information 权限筛出合法 IDs；即使排序分数/日志，也不向当前请求泄漏拒绝的内容和存在性。
  - **不能缓存最后答案/晋级结果当作新证据**：排序还依赖当前意图、状态、Recency/Access 计数、时态、成本准入与模型能力。确切版本、权限或时间不明时直接 miss 或显式 unavailable，不猜。

### C. 已提交 Delta 与读到最新结果（第十四轮 C 已选）

| 触发 || 可保留的复用 |
| --- | --- | --- |
| 新 Turn/Revision S2 Commit | 新 Timeline/State/Memory 文档的 Delta、当前场景/时间及派生检索视图；CommitReceipt 之后同步推进可读取水位 | 未修改的不可变文档词袋、稳定工具/Prompt 模块 |
| Load SavePoint / Switch Branch | 旧分支 K2 授权结果、异步查询、NPC 意识视角与 World State 投影 ||
| 记忆纠正、来源撤销、Knowledge/World 修改 | 变动文档及关联 Fact/Relation/AtomicGroup 支撑、现行授权和现行状态 | 与变动无关且仍合法的索引节点 |
| 游戏时间前进、NPC 知情/曝光改变 | 时态有效性、视角/授权投影、置信度与动态 Recency/Ranking | 不含请求授权结论的纯词法特征 |
| 检索策略、Tokenizer/Embedding 模型变更 | 相应 Index/Token/Vector namespace、模型能力与预算推断 | 原始受保护 Source/Revision、无关模型的索引 |

**推荐一次核心读路径契约**（伪协议，非现存接口）：

1. 读取并 Pin 当前合法 S2 `RevisionRoot`，产生 `QueryEpoch + sourceGeneration`；在此根对应的 Authority/Information grant 下选择初始可见 Source 集。
2. 从 `IndexGeneration` 与该 Revision 所需的源变更范围比对：已覆盖则命中；落后一小批则合并已确认 Event Delta/Tombstone 形成 **Base Index + Delta Overlay**；
3. 仅在已授权文档集合中检索/排序/取内容；新旧索引读者以版本 pin 分离；GC 不抢走仍使用的共享段。
4. 若用户读档/切分支，旧结果只能丢弃或重新编译，不允许以旧结果覆盖新 ContextPlan/世界状态。

**注意**：BM25/词袋索引中的 `N/DF/avgDocumentLength` 等依赖语料总体统计量。即便只新增一个文档，也需保持统计正确，不能只改新增文档的 postings 而继续使用旧的全局 DF；受权限/时间限制的 Query 可见集合也可能改变统计基础。建议先保守正确、局部 Overlay + 必要统计重算，待 P0 后才引入进一步的统计缓存。

### D. 增量索引的运行方式

- 按 **S2 Commit 之后的已确认事件** 为派生层输入（不是尚未 durable 的流式文本）。事件至少能表达 UPSERT/RETRACT/SUPERSEDE/ACL_CHANGED/STATE_CHANGED/BRANCH_CHANGED 等语义；具体通知由未来 Native 仓库提交层或投影层产生，**不可宣称当前已有这些 API**。
- 有限步长处理：增量合并与索引封存任务复用第十轮预算式调度器，不与首玩、当前模型生成或 S2 耐久提交争抢；索引延迟不得延迟正式 Turn Commit ACK，却也不得让随后检索读取未覆盖的新来源。
- Index 本身可重建，授权与 S2 仍在权威层；`IndexGeneration + sourceWatermark` 等数据必须准确指示索引覆盖范围，不能把缓存文件最新时间当作来源权威证据。
- 只有需要新 Embedding 且获预算准入才发请求，原文/身份不得泄露给未经授权的 Provider。

### E. Token 安全计数原则（已确认最终完整精确计数）

1. 对 `TokenizerEngine/ModelVersion + 完整规范化内容 + 格式/角色边界` 完全相同的**确定性字符串** memo 精确计数；静态 Prompt Segment 与证据记录可被缓存，受到 P5 容量/生命周期约束。
2. 可采用粗略上限估算、延迟批量计数和候选组预筛选减少明显无效的重复计算；
3. BPE/Tokenizer 在串接位置可发生重新分词，因此 **Token(A+B) 不一定等于 Token(A)+Token(B)**。段计数之和只能用于经证明安全的界限估算；无界数值误差不可直接用于 `hard reserve` 或 `reservedOutputTokens`。
4. 若真 Tokenizer 不可用，只能按明确的保守预算/能力降级策略处理并标记诊断；对不能保证容量的任务需限制上下文或失败提示，不能静默跳过硬保留的 World 权威或原子证据。
5. 5.性能指标包含 Counting CPU/P95、重复调用数、跨模型误用率、最终 Token Overrun、硬保留失败与最终 Evidence Coverage。

### F. 模型、向量与 Agent 调用预算：三种比较（已选 C）

- **A — 按回合固定调用矩阵**：每回合无论证据质量都执行 Embedding/Rerank/Agent，成本可预测但长篇 RP 可能大幅浪费。
- 可能严重伤害剧情、NPC 记忆/承诺与 Agent 自迭代有效性，**不推荐**。
- **C — 质量与成本双约束的分层准入（第十四轮已选；预算数值未定）**：
  - 尽可能使用确定性本地计算。
  - **本地检索优先**：已有 `memoryInvocationDecision` 能在合法词法/图检索有充分依据时跳过可选 Vector；仅在缺口、关键冲突或特定任务证据不足且预算许可时尝试 Embedding/Rerank；诊断明确区分 `source_unavailable`、`budget_blocked`、`quality_gap`，不伪造使用过的工具。
  - **预算轴分离**：本回合 CPU/响应时延、Token/上下文硬限制、额外 Provider 调用与估算费用，及 Session/Project/Agent 长期累计费用分别保有可观察账目。任务准入需绑定调用身份、Source/Revision、模型路由、请求 Fingerprint、重试次数和已支付/待对账记录；失败或超时不自动等于零成本。
  - 当余额或明确授权的硬预算不足时暂停辅助自迭代/提示原因，而不是虚构通过或悄悄降品质。用户可配置费用/速度偏好，但须保持已冻结的安全与质量底线。
  - **Provider Prefix Cache**：按真实提供商的支持情况、完整前缀指纹、模型/工具配置与 TTL 决定是否有利，核查实际 `cache_read/cache_write/input/output` 使用量、费用与命中率；不得保证所有模型或代理层提供相同缓存收益，更不能将稳定前缀 Cache 当作来源授权缓存。

## 第十五轮：ContextPlan 与 Memory Recall 编排、并发、异常恢复及 RP 情境预算（**已选 C，具体参数待设计**）

### 1. 先承认现有调用链不只有一种

| 路径 | 已确认执行顺序（静态审计快照） | 为什么不能直接凭空全部并行 |
| --- | --- | --- |
| Native Package Turn | [`public/scripts/native/play-generation.js` L20-L50](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-generation.js#L20-L50)：普通输入可能先 `host.submitUser` 与 `runtime.persist`，再调用 `recallNativePackageTurnMemory`，将 `hostMemoryEvidence` 交给 `executeOperation('turn')`；[Memory Bridge L250-L325](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/experience/llm/memory-bridge.js#L250-L325) 先取得 Information Grant，再做 Recall/证据合法性过滤 | 上游用户输入可能已经 S2 提交，失败重试不能重复追加用户消息；证据依赖有效 Task/Actor Grant，不能在授权之前做任意检索或让旧 Reply 泄漏 |
| Game LLM 自由文本/命令 | [`public/scripts/native/experience/llm/runtime.js` L418-L500](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/experience/llm/runtime.js#L418-L500) 可能先解释玩家意图并执行命令；[L508-L555](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/experience/llm/runtime.js#L508-L555) 依次 `recallMemory -> narrativeCoordinator.produce -> finalizeMemory` | Recall 的查询可能依赖命令结果、新 World 状态与本回合事件；如果太早运行会检索到尚未发生动作之前的事实。后续入记忆与最终正文/事件顺序也须保持可追溯 |
| ContextPlan / Prompt 编译 | [`public/scripts/native/context-compiler.js` L935-L1123](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/context-compiler.js#L935-L1123) 已有 Memory deferred lane / Hard Reserve / 原子组；[`session-runtime.js` L1027-L1045](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/session-runtime.js#L1027-L1045) 可 `prepareContext` 并 `recordContextLane`；[Native GenerationService L51-L88](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/model-prompt-runtime/generation-service.js#L51-L88) 先构造 ContextPlan、PromptIR、准确 Token 才发送 | ContextPlan 的最新世界事实、权限、来源、模型上下文预算均须在派生 Memory 进入后最终确认；|
| 调度与失败退路 | [`src/native/task-scheduler.js` L9-L130](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/task-scheduler.js#L9-L130) 已区分 foreground/background/maintenance 及不可中断 finalize；[GenerationService L19-L151](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/model-prompt-runtime/generation-service.js#L19-L151) 已有 `disabled/confirm/automatic` Route fallback 及语义/工具能力约束 | 不能另起一套 Scheduler 或把「Memory 检索可选退化」当成「任意切换生成 Provider」；部分异步/流式超时即使 Abort，也不保证外部调用未产生费用 |

**额外核查**：[`memory-bridge.js` L48-L63](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/experience/llm/memory-bridge.js#L48-L63) 的外层 `assertTurnBranchCurrent` 只比较 Session/Branch；这里是契约审计点，不代表已复现污染。

### 2. 方案 A/B/C：真正值得并行的内容是什么？

- **A — 全部串行**：权威世界/人物状态→知识过滤→记忆完整 Lexical/Vector/Rerank→ContextPlan→模型调用→记忆提交。容易跟踪，但在不需要高级检索的回合也为非必要阶段付费，P95 和 TTFT 可能过长。
- **B — 乐观全并行**：一收到玩家输入就同时启动世界命令、NPC 记忆、上下文与 narrator，先到先用。TTFT 表面很快，但**命令尚未落地、Actor 尚未获得授权、完整证据尚未打包就生成文本**，存在防全知/世界状态失配及外部费用重试问题，不建议采用。
- **C — 固定 S2/Grant 的依赖 DAG + 合法准备工作的有界并发 + 生成前证据屏障 + 情境化预算**（**第十五轮已选**）：只将真正独立且在合法 Scope 内的纯读/可重建索引准备并行；ContextPlan/模型实际生成仍受权威快照、完整证据、准确 Token 和 Cost/Quality 的最终屏障约束。

### 3. 推荐的逻辑状态机（候选，不意味着实现了新 API）

**务必区分两条现有线路**：Package 路径可能先 S2 保存玩家输入再 Recall；Game Runtime 可能先执行世界命令再 Recall。此图是跨路径建议契约，不主张强行将它们改写为一套同样的物理调用顺序。任意已确认的用户输入/命令、事件和正文都必须有真实 Commit/Operation Identity；错误恢复只重试尚未完成的 Work，不重复生成旧已提交世界副作用。

### 4. 何时必须等待 Recall，何时能有限退化？

| 情况 | 候选行为 | 不变量 |
| --- | --- | --- |
| Context/Information Grant 不合法、Revision stale、来源撤销 | 立即取消/拒绝该 Request，必要时用户重新基于新 Head 发起 ||
| Optional Vector/Rerank 超时/预算拒绝，但 Lexical/Graph + 当前合法证据满足任务 | 明确记录 `vector_unavailable / rerank_unavailable`，按降级后的合法结果编排 ||
| Memory 模块未配置/无证据且此场景不要求记忆 | 可使用当前合法 World/近期输入和明确 Unknown 继续；给出适当状态诊断 | 不暗示已成功召回不可见或不存在的历史，情境需要必备记忆时不能静默继续 |
| 最终 Tokenizer 不可用/准确计数失败、硬保留溢出 | 不发送超预算 Prompt；| 不能省掉必需工具/World State/原子证据来凑 Token |
| 生成 Provider 超时/连接中断 || 不擅自改变模型/工具/权限，不重复执行已确认的剧情提交 |
| 已确认玩家输入，但 Recall/模型生成失败 | 保留该合法已提交输入，用明确 Run/Request/Commit 状态恢复缺失的后半流程 | 不能重新 append 同一玩家楼层，也不重新开放第七轮已删除的旧 `Retry Reply` 正式入口 |
| Narration 已发布，但派生 Memory 入账/向量索引失败 | 保留原始 S2 Event/Timeline；为派生任务生成可幂等续处理的状态/Outbox/诊断，下一次查询通过已确认 Delta 仍能取得最新合法事实 | 派生记忆延迟不准悄悄导致已确认剧情永久失忆；是否在 ACK 前要求哪些派生完成由权威范围决定 |

**失败处理优先级**：授权与当前性错误最高且不能降级；本回合需要的权威材料不能丢；纯派生 Vector/Rerank 超时可在合法基础检索覆盖时退化；最后才是模型 Provider 的显式降级策略。不要用单个 `catch { return emptyMemory }` 吞掉身份/授权/溯源错误。

### 5. 并发纪律与取消安全

- 单个回合使用**固定的 S2 Anchor + Run/RequestEpoch**，并发准备由当前 `NativeTaskScheduler` 及 P5 Owner/Scope 管理；并发数/CPU/Provider 额度由 P0 和设备预算决定，不能为了“每轮并行”增加临时 Worker 池。
- 世界命令、Actor 认知更新、正式故事提交、Model/Tool 外部副作用需按实际依赖串行或事务屏障执行。大计算任务应在合法切片点让出前台，但不能把**S2 发布区间**当作任意可取消区域。
- 每次异步边界后核查 Scope/Branch/Revision/Grant/Epoch，旧分支结果不能写入新 ContextPlan、Cache 或 S2 Root。
- JavaScript `Promise.all()` 是失败快速传播，**不是兄弟任务自动取消协议**；若启动相互独立的多个请求，需共享 AbortSignal，失败时主动 abort/等待安全清理，避免未使用结果继续占用计算或污染缓存。对于多项独立诊断可使用 `Promise.allSettled`，不能因它能够容纳失败就允许权威任务“任意跳过”。
- 与现有 `commitId` 查询/RunControl/Agent Ledger 对齐；原生代码中 `GenerationService` 已有 Provider Fallback，项目不再新建第二个“自动重试全回合”的平行引擎。

### 6. 情境化模型预算：提高 RP 质量，而不是一刀切

以下是**分配策略候选，不是固定数值**。最低不变量：每回合合法状态/视角/必要证据和响应 S2 永远有自己的不可绕过的执行/费用边界。

| 场景 | 额外计算优先级 | 理由 |
| --- | --- | --- |
| 普通日常 RP / 近期对话连续 | 低：准确当前 World、最近对话+可复用 Lexical/Graph；无缺口跳过向量和 Rerank | 保持低 TTFT 和良好文笔，不为每个寒暄调多个模型 |
| 远古剧情回调 / 重要承诺重现 | 中高：扩展合法历史 Recall、证据覆盖与原子来源组；基础遗漏时提高 Vector 重要性 | 数千回合后仍认得人物、承诺和事件，不靠旧世界摘要假造履约 |
| NPC 私密对话 / 防全知 / 来源冲突 |仅在合法竞争证据确实需要时启用 Rerank| 多花 Token/时间也不能把角色不知道的信息引入 Prompt；冲突应保持 Unknown |
| 重大剧情抉择 / 关键世界状态转换 || 防止关键道具、死亡、交易、承诺因普通低预算遗漏，**不允许由计算层擅自代替玩家行动** |
| 背景 NPC/Memory 日志与 Project/RP Agent 自迭代 | 独立后台预算与并发配额，低于互动剧情；||

预算需要**二维衡量**：`质量风险/证据必要度` 与 `延迟/Token/费用/长期累计预算`，并把未能查到来源、权限拒绝、预算不足、Provider 不可用区分诊断。不能预设具体“日常 1 次、大剧情 3 次”的硬常数；

### 7. 第十五轮 A/B/C 决议（已选择 C）

- **A：完整串行 + 所有增强检索按固定流水线必跑**。简单但不区分用户真正需要什么，长期 RP 的 P95 可能偏高。
- **B：激进并行 + 早发 Narrator + 任意阶段出错均降级空记忆**。容易产生快但不一致、全知 NPC 和失败后双重副作用，不能满足前轮冻结约束。
- **C：依赖 DAG + 可证明独立阶段有界并发 + Context Join/Authority 屏障 + 结构化失败回退 + 场景/质量预算分层**（**第十五轮已选，具体接口/数值待 P0 与实施设计**）。
- 若未发现影响架构正确性的重大缺口，转为正式可执行开发计划。**当前产品分支仍不得改动**。

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
- A/B 候选仅留作历史比较。第十五轮开始分析 ContextPlan 与 Memory Recall 的执行时机、并发与失败回退，不预先冻结实际阈值或新接口形状。
- **2026-10-13 / 第十五轮研究稿**：在已批准第十四轮权威缓存/Delta Overlay/准确 Token/模型预算 C 上，结合 Package Turn、Game LLM/Memory Bridge、Native Context compiler、GenerationService 的真实调用顺序提出第十五轮 DAG/Join Barrier/分类回退/情境预算 A/B/C 备选。第十五轮选项与默认阈值尚未批准；未修改产品实现。
- **2026-10-13 / 第十六轮开端**：用户认同第十五轮方案 C，批准依赖 DAG/有限并行/正式 Narrator 前 Context Join 权威屏障、分等级错误回退、不同 RP 情境下的额外检索/模型预算；不得绕过权限/时态/硬保留、重复提交玩家操作或取消必要的 Agent/RP 质量评价。进入 P0–P5 施工路线汇总，未实测也未修改产品代码。
