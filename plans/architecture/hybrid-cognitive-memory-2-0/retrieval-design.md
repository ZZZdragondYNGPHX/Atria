# R6 — Hybrid Cognitive Memory 2.0：统一检索引擎技术调研

> **文档性质：研究证据与方案比较（非正式实施 Plan）**  
> **日期：2026-10-10**；**状态：Proposal / Pending user decision**；**任务：** `hybrid-cognitive-memory-2-0`；[入口](index.md) · [已确认决策](decisions.md)。  
> **范围：** 统一 Recall 算法、候选评分、时间/认知边界、多跳推理、Context 编译、Cache 和验证方法。  
> **源码基线：** Atria `main@6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`；此前审查 `feat/agent-intelligence-runtime@25e1aef...` 的核心记忆文件与 main Git Blob 一致。本研究没有运行 Atria 的真实模型、数据库性能或浏览器实验。进入实施前必须重新核对 HEAD。

## 0. 摘要：问题不是缺少一个更强 RAG

**结论 C1（源码已证实）：** 现有 Memory OS 已有 BM25-like 词项匹配、向量 ID、图遍历、RRF 融合、时间/来源过滤、可选 rerank。直接搬入 LightRAG 或 HippoRAG 不能自动解决 RP 的 NPC 串知、承诺漏召回、错误历史和正文机械复述。

**结论 C2（代码结构风险；待实验）：** 最大短板不在单个检索器，而在 **谁有权读取 → 查什么 → 如何选证据 → 生成器怎样使用** 四个接口尚未统一为角色认知检索契约。现有 `recallHybridMemory(context, query, options)` 只收到通用 Context 与字符串 query，缺明确的 audience/Actor/perspective 约束参数；已有 Native Information Runtime 在其他路径提供权限投影。需要证明这两条链路的**端到端交集**，不能仅凭最终文本过滤作安全保证。这是静态检查指出的契约缺口，不是已经发现线上泄漏。

**推荐供讨论的 B 路线：Constraint-first Adaptive Hybrid：**
`精确 Anchor + 授权候选域 → 查询意图与事件线索 → 默认廉价混合候选 → 有需要时有界图扩展/PPR或重排/LLM → 覆盖约束和预算选择 → typed MemoryPacket → Context Compiler`。

不推荐“每轮大模型生成检索计划”“全图 PPR”“把所有记忆喂给 Director”作为默认路径。**本段推荐未获用户批准。**

## 1. Atria 当前路径：具体代码、能够确认的行为与缺口

| 事实编号 | 源码路径 / 函数 | 已证实的行为 | 对下一架构意味着什么 |
| --- | --- | --- | --- |
| F01 | [memory/main.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/main.js) `defaultSettings` / `injectMemoryPrompts` | 新配置 `memoryOsEnabled=false`、`recallMethod='llm'`；`isMemoryOsEnabled` 成立时走 `recallHybridMemory`，否则按旧 LLM/RAG 逻辑分支 | 要删除的其实是**旧选择与调用路径**，而不只是 UI 下拉框 |
| F02 | [memory/api.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/api.js) `openSession` | `recallMemory` 已委托 `recallHybridMemory`，Session 写入与来源生命周期独立 | 统一入口可沿现有 API 完成，无须另造对外检索 API 家族 |
| F03 | [hybrid-retrieval.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/hybrid-retrieval.js) `analyzeMemoryQuery` | 历史/位置/原因/所有权主要通过简单关键词；实体定位主要匹配名称和别名；中文拆为单字和相邻双字 | 无名称的“那个承诺”、隐含指代与跨角色转述是天然压力案例，尚未量化失败率 |
| F04 | 同上，`rankMemory` | 词项评分类似 BM25；按 lexical/vector/graph/state/evidence 多路 RRF；2 层邻接遍历，按深度衰减；考虑 confidence/importance/recency/access 和部分 intent boost | 现有基本架构可保留并重排职责；RRF 排位不是事实为真的概率 |
| F05 | 同上，`buildMemoryCorpus` | 检查 Episode 及 Fact 的支持来源、有效时间、覆盖权威 provider state、过时与争议信息 | 不能把“引入新算法”当作绕过已有 source guard 的理由 |
| F06 | 同上，`retrieveMemory` | 向量可选；每次请求重新投影语料并遍历指纹，以 hash 集合核对远端增删；未变化 Embedding 不必重算；rerank 失败可回退 | **CPU/IO/网络同步风险**需要 N 扩张基准证明；优化目标应是 delta 更新而不是直接删安全检查 |
| F07 | 同上，`composeMemory` | 按排名逐条把含 source metadata 的完整记录加入，Token 超预算则跳过；`maxResults=20` 默认值 | 可能出现“重复事件充满上下文、关键承诺被挤出”；这是待复现实验，非既成故障 |
| F08 | [hybrid-runtime.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/agents/memory/hybrid-runtime.js) `recallHybridMemory` | 按当前 Memory lane 上限与 Memory OS Token budget 裁剪；校验 source currentness；Embedding/Rerank 取 Native Retrieval profile | **单一入口**合理；但显式 Actor / Narrator requester、权限过滤未在此函数签名中呈现 |
| F09 | [native-information-runtime.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-information-runtime.js) `projectInformation` / `informationContext` | 已有 Actor view、participants、belief `known/believed/suspected/disputed`、来源 channel 和 context exposure | 不能新造一套 Belief 权威；检索需要从现有获准投影构造候选域 |
| F10 | [native/context-compiler.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/context-compiler.js) `CONTEXT_LANES` / `normalizeContextItem` | 已有 `current_state_event`、`commitments`、`recent_raw`、`narrative_spine`、`memory` 等 lane，支持 target、visibility、required、atomicGroup、SourceRef | 无需以字符串粘连第二套上下文编译器；输出应对接现有 ContextItem 和预算 |
| F11 | [native memory-bridge.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/memory-bridge.js) `recallNativePackageTurnMemory` | Package Turn 进行 Information memory grant 和原始 Timeline sourceMessageIds 的显式证据收缩 | 这条安全边界要保留；升级为通用 Audience 过滤时别破坏当前 Package grant |
| F12 | [native narrative.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/experience/llm/narrative.js) `buildNarrativeContract` | World Observation / Committed Events / Command results 仍在 Memory 与 orchestration 之上 | 检索相关性不授予 World mutation 权限，也不能把错信当作世界事实 |

**现有常量仅作为 baseline：** `tokenBudget=2400`、`maxDepth=2`、`maxEntities=20`、`maxRelations=30`、`topK=30`、`maxResults=20`、`rrf=60`；`lexical=1`、`vector=1`、`graph=1.5`，另有置信度、重要性、近期程度、访问次数加权。没有证据证明它们是 Atria 各种 RP 题材的最优参数。

## 2. 外部证据：要借用哪一部分，不要搬运整个框架

所有数据集数字若未专门说明，均属于作者描述；**我们没有独立复现其性能或费用**。

| 实现 / 一手来源 | 可核查的算法机制 | 借鉴价值 | 不直接照搬的原因 |
| --- | --- | --- | --- |
| [Graphiti](https://github.com/getzep/graphiti) | 时间化事实 valid windows、Episode provenance、增量图、BM25 + embedding + graph | 精确时间窗口、来源链、增量索引；动态事实的更正不等于历史删掉 | 其 Python + 图后端不应成为 Atria Web/Termux 的强依赖；已有 Source/World Authority |
| [HippoRAG 2](https://github.com/OSU-NLP-Group/HippoRAG) | 从查询种子进行关联扩散，借助 Personalized PageRank 提升多跳检索 | 补足以精确实体为种子的一两跳 BFS 对远距关系的遗漏 | 测试主要为文档 QA、多跳问答；RP 权限、时间和谎言传播不能由 PPR 自动保证 |
| [LightRAG](https://github.com/HKUDS/LightRAG) | local/global/hybrid/naive/mix 内部查询模式、双层实体与关系检索、增量更新 | 同一入口的**内部动态选择**、局部事实和全局主题信息分工 | 它的“mix”是一种查询配置，不等于需要对外保留多套 Recall；索引抽取 LLM 可能昂贵 |
| [Graphiti search recipes](https://github.com/getzep/graphiti/blob/main/graphiti_core/search/search_config_recipes.py) | 公开的 RRF、MMR、距离重排、Cross-Encoder 配置组合 | 用作消融对照、避免单一排序器固化 | 无法直接用其参数作为 Atria 承诺/认知风险的权威分数 |
| [MOOM](https://github.com/cows21/MOOM-Roleplay-Dialogue) | 剧情冲突 + 角色画像分支、压缩、遗忘；开源中文长篇 RP 数据集 ZH-4O，平均约 600 轮（作者披露） | 用实际中文长对话检验“故事主线和角色个性是否被记忆保留” | 遗忘/画像方法不自动满足 Atria SourceRef、NPC 权限和分支回滚 |
| [REVERIEMEM](https://arxiv.org/abs/2606.25632) | 亲历 Episode、visibility-tagged semantics、情境 personality 的视角限制 | 明确提示“先 Actor exposure 再检索”，降低 Roleplay factual overreach | 2026 年新论文，Book-based 场景与 Atria 动态世界不同；效果需复验 |
| [PersMem](https://arxiv.org/abs/2609.34372) | 人格参数参与情感评价、记忆保留、被动情感召回和主动目标召回 | 让记忆影响角色风格，而非靠单一系统提示词堆叠 | 发布很新；不能直接把人格偏好作为事实真伪裁判 |
| [LongMemEval](https://github.com/xiaowu0162/longmemeval) | Extraction、多会话推理、知识更新、时间推理与 Abstention 的 500 道测试 | 可构建记忆召回单测和“确实不知道就不胡编”的检验 | 普通聊天问答正确不等于 RPG 人物的行为可信 |
| [ACL 2026 MRBench](https://aclanthology.org/2026.findings-acl.1175/) | Anchoring / Selecting / Bounding / Enacting 四阶段中文与英文 RP 评估 | 把召回到正文自然使用拆开评分；检索高不意味着文笔好 | 需要 Atria 自己的场景、玩家自主权和权威状态测试 |
| [LongMemEval-V2](https://github.com/xiaowu0162/LongMemEval-V2) | 长期 Agent trajectory 的动态状态和经验检索 | M1 Project-Agent / 跨任务记忆消费者的辅助对照 | 不应让 Project 通用经验权威侵入 RP 的 NPC 私有认知 |

**证据强度：** Atria 源码行为 = 代码审计事实；上述论文/README = 可核实公开技术与作者实验；“在 Atria 应变好” = **未验证工程假设**。不引用外部性能百分比作为本系统预期收益。

## 3. 四条候选路线与推荐

| 路线 | 设计 | 预期成本 | 主要风险 | 建议 |
| --- | --- | --- | --- | --- |
| A：现有 Hybrid 加强 | 保留静态 BFS + RRF；补中文识别、索引增量、Context 类型 | 较低 | 长链因果和无显式实体的承诺问题可能仍弱 | 可以作为低成本 baseline |
| **B：Constraint-first Adaptive Hybrid** | Actor/Time/Branch 授权先行；lexical + optional vector + typed graph；按需 MMR/多跳/PPR/rerank/LLM | 正常低，复杂查询自适应 | 路由门槛和多路合并复杂，需要专门评测 | **推荐讨论** |
| C：Graph-first 全量检索 | 所有请求都进行宽图检索、PPR、重排/多跳 | 更高 | 图污染、隐私域混合、频繁无用检索、延迟尾部 | 不做默认 |
| D：LLM 每轮规划检索 | 每回合让 LLM 读上下文、写改写 query、判断结果后多轮召回 | 高且可变 | 额外调用，模型会臆造 Seed；难测成本和稳定性 | 只保留为复杂查询有预算备选 |

B 与已确认的“删除**独立**旧 Recall 模式”不冲突；用户也没有批准上述 B，不能代替问询。

## 4. 检索管线设计候选：权限是硬约束，相关性是软排序

### 4.1 Step 0 — 先固定请求身份与任务，而不是只传字符串

逻辑请求至少知道：
- audience = `narrator` / `actor(actorId)` / `task(taskId)`，及作品 A/B/C 叙事策略；
- authenticated scope / PackageVersion / Session / Branch / Revision（普通 RP 用有效消息/variant/source 指纹而非伪造 Native Revision）；
- 当前 scene、参与 Actor、World tick、已确认 Event/Command、当前 Goal/Commitment、最近对话；
- 询问的是“现在”、“过去某时”、“角色自己的认知”，还是“旁白可按故事规则知道的客观事实”；
- 允许的数据类型、token/time/call 预算、可用 Embedding/Rerank 资源及模型精确版本。

这只是候选 **RetrievalRequest 语义**，不批准具体数据库 Schema。

### 4.2 Step 1 — Eligibility 先过滤，不让分数买到越权

按**原 Authority/Information** 授权投影产生候选集合，在构建查询索引或展开图节点前就约束：

`Eligible(d, requester, anchor, at) = SourceCurrent ∧ ScopeAllowed ∧ ActorExposed ∧ BranchReachable ∧ TemporalApplicable ∧ KindAllowed`

- NPC 可见的是亲历、可信转述、错误 belief 等**标明认识地位**的记录；错误 belief 本身合法，但其内容不能被当成 World Truth。
- 旁白可在默认 B 取得较宽信息，但是否提前揭示属于单独 Narrative disclosure policy。**不能把旁白的宽信息悄悄传给 NPC 决策工具**。
- 查询历史时间时可读 `superseded` 的事实，但只能在旧时点作为历史；当前推理不能拿旧事实推翻已确认的权威状态。
- 不存在原授权/缺失 source proof 时不能填一个通用权限标签后放行；读不到合法证据时宁可返回空/未知。
- 在异步召回与编译消费边界再次检查 source/ref/branch/revision，以防回合推进期间结果过期。
- 若索引中含不可见资料，至少候选读取前过滤；最好避免跨权限向量索引带来 metadata/snippet/日志旁路泄露。Actor-specific data 不能因内容相同就进入跨 Actor 的公共缓存。

**限制：** 这是需要增补的端到端契约，不是当前系统已经全部满足的描述。

### 4.3 Step 2 — 低成本查询理解

不要默认 LLM query rewrite。先从确定性 Context 提取：
- 显式实体及其已验证别名；当前 Scene/Actor/Place；指代候选（“她”“当初”“那份约定”）；
- intent：当前状态、历史变迁、关系/所有权、承诺履行、因果、多跳、情境人格；
- temporal point / interval 和未知边界；
- sources preferred：世界事实、Actor belief、Episode、Narrative spine、Commitment 等。

例如“她还记得闭关前答应我的事吗？”需要至少两个**不同**的问题：
1. **证据：** 她是否接触并形成了该承诺，是否被修订/撤销；
2. **心理状态：** 当前角色是否保有记忆、是否有遗忘状态（不能因为系统检索找到了就声称 NPC 没忘）。

指代无法消解时，先用当前角色/Scene/承诺索引建立**候选 seed**，再测试有限图扩展；仍缺证据才触发可选的 LLM 重写/问答分解，并对其输出的实体进行 source 校验。模型只能提出 query 候选，不能造世界事件。

### 4.4 Step 3 — 多通道候选检索

正常查询内部至少允许三个可独立禁用的 lane：
- **Lexical（基础）**：中文需要对角色姓名、常见别名、标点、中文短语、口语指代进行改进。比较现有字/双字 token 与精确短语 + BM25/FTS5/可控词表，目标是在无 Embedding 下仍可使用。
- **Vector（配置可用才开启）**：embedding profile + source identity，检索长语义相似 Episode/Fact；需记录缺配置/失败/兼容版本，而非将其误计为 0 成本。
- **Typed Graph（关键）**：实体、事件、Goal、承诺、来源因果和人际传播的**有语义的关系边**；并非图上每条可达路径都等于真实因果。读图时始终在授权后的边上展开。

对同一事实的“来源 Episode / 当前 Fact / 角色解释”可在 Packet 合并来源以去重，但不得混成一种真相。

### 4.5 Step 4 — RRF 融合之后才决定是否升级

现有排名公式思想可保留：
`RRF(d)=Σ_l w_l/(k+rank_l(d))`。RRF 解决异构检索器分数尺度不一致的问题，**不是事实置信度概率**；现有 boost/深度惩罚和权重应消融验证。

建议拆成两层，而不是堆一个神秘总分：
1. **硬约束：** 来源可信、角色可见、时点有效、权威等级、分支适用、原始引用、预算下必要 guard，不接受低相关性作为越权豁免；
2. **软目标：** 查询匹配、因果邻近、未完成承诺、场景连续、当前角色关联、重要性、时间距离、冗余、多样性、token 成本。

需要防止两种方向相反的错误：
- 时间过久导致**重要旧承诺**被机械压低；
- 重要性过高导致**无关核心设定**每轮挤出与当前对话有关的信息。

`confidence` 必须有定义：来源事实支持强度、Actor 对传闻的相信程度、模型估计相关性，是三种不同的量，不能用同一个 0~1 直接相加且称之为概率。

### 4.6 Step 5 — 有条件的多跳检索，而非每回合全图扩展

建议对下面这些查询增加有限图探索的准入：跨场景事件因果、“谁从谁那里知道什么”、承诺条件达成、多角色间的信息链、多个角色 Goal 冲突、现有检索未覆盖关键 source。

候选算法消融：
- **BFS typed 1–2 hop**：现有基础；便宜、可解释，但跨三四个 Episode 链时召回不全。
- **Beam search / typed path search**：优先关系类型与证据链，成本易限定，但路径规则可能偏置。
- **Personalized PageRank (PPR)**：借 HippoRAG 2 的多跳关联分布，在**已经授权并时间过滤的子图**内计算；候选节点再回溯可信 Episode。PPR 不证明“这条关系是因果关系”。
- **LLM-assisted decomposition**：只有经验证的 deterministic/图方法无法满足的复杂查询，有剩余额度才使用；必须检验 query seeds、来源和时点，不把改写文本当事实。

不要把“默认只走 2 跳”直接硬编码成用户需求；应记录最多访问实体/边、CPU 时间、调用数和截断原因，结合真实长剧情测试决定上限。

### 4.7 Step 6 — 来源覆盖约束 + 多样化装箱，而不是贪心 TopK

目前 `composeMemory` 是按 rank 的贪心预算放入。候选替代：
- **必要的 Current World、当前 Actor exposure、关键 active Commitment/已解析冲突**分别由对应 Context lane 管理；不把其余 Memory 抢占作为是否存在的唯一条件。
- 对 focus memory 选择采用**覆盖目标**：相关事实、历史证据、关键关系/承诺、冲突两侧、叙事主线、必要事件细节；避免十条近似 Episode 重复。
- 可以用 MMR（Maximum Marginal Relevance）或有限子模覆盖做近似选取：`MMR(d)=λ·rel(q,d)−(1−λ)·max_similarity(d,已选)`。它是**多样性技术**，不能用于删掉具有独立证据意义的同类冲突记录。
- token 成本纳入目标；完整 atomicGroup/来源链不够放时应返回预算不足/引用级摘要/已验证 Rollup，不能凭截断文本捏造。
- 一条 Fact 若引用一个秘密 Episode，只可提供获准视角的摘要/证据，不能带未授权 Episode 正文泄露。

**需要实测：** coverage-aware packing 是否比简单 `TopK` 更能保留承诺、人物知识边界和剧情脉络；如果收益无效就维持简单算法。

## 5. Context Compiler：让召回真正进入正文，又不造成全知

沿现有 `CONTEXT_LANES`，建议把输出组织为**至少三种语义用途**（非新数据库）：
- `Core`：正式世界状态、硬约束、必要开放承诺、角色身份/可见性等由各原权威产生的必需 ContextItems；
- `Focus`：本轮检索的 source-backed 事件、事实、关系、认知来源，按 audience 和 token 分组；
- `Narrative/Expression`：小说旁白的叙述视角、风格与 NPC expression hints，不能将人格线索提升为真相或强制台词。

候选 MemoryPacket 每项应有：`id/kind/sourceRefs/provenance/actorExposure/validAt/branchApplicability/authority/status/retrievalReasons/tokenCost/uncertainty`；是否新增具体字段由进入产品实现时的 Context 现状决定。

**优先修补现有 ContextItem，而非生成额外一大段 Markdown。** 编译层处理 `required/atomicGroup/visibility/target`、实际 tokenizer 和策略预算；选取与调用证据可以留在 trace，不必把调试评分全部给 Narrator。

**Narrator 与 NPC 必须分别按权限编译。** 即使最后采用一次 Narrator 调用，能读取全量世界事实的旁白上下文也不能作为未过滤材料交给 NPC 的独立推理与工具路径。一次正文模型本身看到世界真相时，不得声称仅靠提示词就能确定性阻止所有自由文本泄漏；严格限知作品需要更强的源级隔离和可验证测试。

## 6. Cache 与增量索引：收益和有效性分开

| 层 | 缓存对象 | 准入 key / 失效 | 可否复用 |
| --- | --- | --- | --- |
| C0 Source/Index | Episode/Fact/Relation 的投影、词项表、图邻接、向量 hash | 真实 source revision/variant、scope、写入操作、索引器版本、embedding profile；按依赖增量失效 | **推荐先做**：只重建受影响索引，读取时继续重验来源 |
| C1 Retrieval candidates | 经过查询与身份适配的 source ID、lane rank/graph paths | query signature、Actor/audience、时间窗口、Branch/source-dependency、retriever 版本和权限 | 可以少算，但**不得仅凭相同 query 或 TTL**复用旧授权 |
| C2 Context segments | 已编译并规范序列化的稳定 identity / policy / permitted segments | Actor profile、知识/Memory ref、Context compiler、tool/resource 版本、source validity | 缓存前缀稳定且**不丢关键实时信息**；动态片段后置 |
| C3 Provider Prompt Cache | 实际 API 输入前缀缓存 | Provider/Model/Gateway、tools/schema/system/messages、原生 cache capability、TTL 与响应 usage | Provider 可能命中，不能保证；各 Provider、NewAPI/SubAPI 代理能力分别核对 |
| C4 Workflow/Intent reuse | 已验证的结构化决策模板/短生命周期叙事意图 | 现有 [execution-reuse](../agent-intelligence-runtime/execution-reuse.md) dependency + authority proof | 对可再用的前置工作部分复用；正常 RP **不直接复用旧 Final Prose** |

### 6.1 必须针对当前热点测量的索引问题

目前 `retrieveMemory` 每次在向量开启时遍历所有 corpus 文档计算 SHA 指纹、用 `service.listHashes` 核对整批远端项，再执行 `query`。未变化的文档不会重复插入/embedding，但 **O(N) 客户端指纹/remote-set 对照工作仍存在**。N=百、千、万级记忆应分别测：
- corpus 投影时间、fingerprinting CPU、hash 列表网络 bytes/RTT、缺失增量数、embedding 次数；
- cold start / warm state / 编辑旧消息 / 分支切换 / embedding revision change；
- 记忆删除后的索引收缩是否安全，旧 id 是否还能查到；
- C0/C1 缓存误命中与失效漏报（错误复用必须首先被否决）。

候选改法：来源账本变化时产生带版本的 index-delta manifest；每次 query 先检查已提交 source snapshot/hash 的当前性，仅同步受影响内容。**没有完整可核实依赖时退回全量同步**；不能为省时间绕过旧来源删除。

### 6.2 Prompt Cache：稳定前缀并不等于“把所有记忆前置”

- [OpenAI 官方说明](https://developers.openai.com/api/docs/guides/prompt-caching)：缓存基于可匹配的 prompt 前缀及具体模型的 breakpoint/length 条件；随模型代际变化，实际 `cached_tokens` 和费用需读取观测。
- [Anthropic 官方说明](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)：`tools → system → messages` 的前缀与 `cache_control`/TTL 有明确规则；更新上游工具或 system 可能使下游缓存失效。
- 不假设 NewAPI、SubAPI、OpenRouter 或其他代理完整传递缓存标记、计数和价格。Gateway identity 不透明时标记 unknown。
- 可稳定的应是**授权的工具契约、系统规则、immutable Actor Profile、版本固定且适用的世界基础资料**；频繁变化的 Scene/状态/MemoryFocus 放在稳定段之后。**任何源变化/权限撤回必须覆盖缓存收益**，必要时重编译失去命中也应接受。
- 质量控制和缓存可测不冲突：报告 `cached input tokens`、provider usage 和实际费用，比较同样正文质量的 cold/warm/prefix-hit、p50/p90 延迟；不能用 prefix hash 命中率伪造费用节省。

## 7. 预算与失败：不能把省钱变成错误事实

候选普通 RP 路线：
1. 先使用现有授权 state/Scene/相关 Context，零额外 LLM 请求；
2. 有信息缺口时使用本地 lexical+graph、已配置则加 vector（Embedding/网络开销计入）；
3. 仅对缺失的复杂关系/隐藏指代追加有限图路径或 rerank；
4. 仍失败且有证据表明 LLM 改写可能有效时，再走一个有预算的受控 LLM 辅助步骤；
5. 需要正文继续 fresh-generate Narrator；需要认知更新另按已选事件驱动规则进行，而不是强制一个预检模型调用。

硬约束失败（Actor 无权限、来源失效、必需 World Evidence 不可得）不应降级为“猜一个结果”；选做算法失败（vector unavailable、rerank unavailable）在**权限与来源仍成立时**可以回退 deterministic lane。检索层、认知更新、正式 World Authority 的失败各自记录，不得混成一个 `fallbackSucceeded`。

超额工作与未发出/已发出请求的费用、取消和后台恢复沿 [compute-policy](../agent-intelligence-runtime/compute-policy.md) 与 M1 现有账本。不新造与 Actor 权限隔离不一致的模型执行器。

## 8. 必须做的评测：评价检索，也评价叙事消费

### 8.1 数据构成与来源

- 使用 [LongMemEval](https://github.com/xiaowu0162/longmemeval) 的多会话/知识更新/时间/拒答样本检索子集；
- 用 [MRBench](https://aclanthology.org/2026.findings-acl.1175/) 中文/英文的 Anchoring、Selecting、Bounding、Enacting 做角色应用诊断；
- 参考 [MOOM ZH-4O](https://github.com/cows21/MOOM-Roleplay-Dialogue) 设计 300–600+ 轮中文 RP 长对话；真正将第三方数据接入前再检查内容权利/许可；
- 新增 Atria 独有的 Actor 独立秘密、谎言多次转述、NPC 错误信念、承诺满足/撤回、跨场景因果、World Tick 跳跃、回滚/variant/保存恢复、旁白 A/B/C 三种可见性。

### 8.2 至少覆盖的错误模式（下列场景均非已运行的测试）

| 测试 ID | 输入/历史 | 正确行为 | 失败定义 |
| --- | --- | --- | --- |
| R6-T01 | 玩家：“那时她答应我的事呢？”；原文无人物姓名但当前 Scene 有确切角色 | 找到同 Actor 未完成承诺及 source；不代玩家兑现 | 重要承诺未找、用错角色 |
| R6-T02 | 隐秘杀人事实 + 甲传播假传闻 + 乙相信 | 乙的记忆仅是传闻/信念；Narrator 依 B 策略决定揭露 | 把传闻判为权威事实、乙知道秘密 |
| R6-T03 | 旧时在甲城，现时在乙城；问“以前/现在” | 有效时间分别返回相应事实 | 历史覆盖现在、当前覆盖过去 |
| R6-T04 | NPC 报告“我怀疑乙欺骗”；世界真相不成立 | 保留 NPC 怀疑，不改变乙的 World Truth | 用心理假设直接更新事实 |
| R6-T05 | 10 条相似闲聊 + 一条遥远关键承诺 | 在足够预算和来源有效时保留承诺 | TopK/RRF+贪心遗漏关键约束 |
| R6-T06 | 跨 3 个事件来源关联动机；角色只可见其中 2 个 | 有界多跳找到合法链或明确未知 | 通过不可见第三个节点越权补全 |
| R6-T07 | 玩家修改第 20 轮，旧 Episode 与向量仍在旧索引 | 当前 Branch 不能读旧证据；重新计算有效索引 | stale vector/cache 复用 |
| R6-T08 | 同 query 不同 Actor、不同 Branch/Revision | 缓存彼此隔离且 source 校验有效 | 跨角色/分支复用旧结果 |
| R6-T09 | 超 Token 的长 Evidence；短 Rollup 与原始引用存在 | 显式裁剪与有来源聚合，不能静默删除必需 guard | 裸截断导致事实误导 |
| R6-T10 | 启用/禁用 Embedding 与 Rerank，网络异常 | 准确回退并记录费用/skipReason | 出错后悄悄抛弃全部 recall 或泄露 |
| R6-T11 | 作品 A 严格限知与 B 旁白分离 | NPC 约束一致，旁白权限不同且不强迫揭密 | 将 mode 解释为事实权限升级 |
| R6-T12 | 重生成同一状态但不同随机采样 | 复用有效历史/上下文证据，重新生成正文 | 直接粘贴旧正文、玩家行动被自动补写 |
| R6-T13 | 短会话 vs 500+ 回合中文剧情 | 在质量底线下记录延迟与资源使用 | 省 Token 却丢剧情连续性 |
| R6-T14 | 合法 Actor 被遮蔽并收到冲突证据 | 确定性信息接触成立，复杂 belief 转变有据 | 单靠 Memory recall 悄悄改变 Actor Cognition |
| R6-T15 | 角色遗忘一般细节，但保留承诺/关键关系 | 系统仍可查原始历史，NPC 可知受认知遗忘影响 | 将存储压缩当作 NPC 自动失忆 |

### 8.3 可量化指标与消融矩阵

**硬安全底线：** 越权候选入上下文的次数、失效 source 复用次数、Branch 污染、权威事实修改、错误 NPC exposure。对文本生成中的不知不觉串知另做独立自然语言评测，不声称完全机械可证明。

**检索：** Evidence Recall@K / Precision@K、MRR/nDCG（若有完整标签）、多跳路径有效率、时点命中、开放承诺命中、证据引用正确率、必要信息覆盖率、无法回答时的拒答准确率。

**正文：** MRBench 四阶段指标、玩家自主权、剧情承诺实际应用、NPC 认知边界、Actor 声音与表达多样性、剧情连续性、没有机械照抄摘要的自然程度。Judge / 人类盲评与确定性 source check 分开。

**性能与成本：** 每个 accepted turn 的前置额外 LLM attempts、Embedding 与 rerank 调用、token、usage（含 cached / uncached）、TTFT/E2E p50/p90、warm/cold、请求错误/超时、缓存 valid hit vs invalid rejected、index rebuild bytes/ms、storage bytes、后台维护摊销。

**消融基线：**
- B0：当前 Hybrid（不改算法，只固定配置和版本）；
- B1：B0 + actor/temporal/source-first filter；
- B2：B1 + query intent / context seed；
- B3：B2 + coverage-aware packing / optional MMR；
- B4：B3 + bounded typed multi-hop（BFS / PPR 对照）；
- B5：B4 + selective LLM rewrite/rerank；
- B6：B5 + incremental index/valid cache/稳定 Context segments。
每个消融在**同样输入、相同模型、相同权限和相同预算**下配对执行；避免一次新增多项后无法归因。性能瓶颈调查可以先于完整质量实验。

## 9. 可能的实施切片（方案未批准，不改既有 M1）

| 切片 | 目的 | 前置与退出依据 |
| --- | --- | --- |
| H0 基准、可见性测试 | 证明现有行为及失败面，而非假定新设计必优 | 冻结数据/查询标签与成本观测；先跑已有模块相关测试 |
| H1 唯一 Recall 路由与权限候选域 | 删除旧对外模式，保留合法内部检索能力；与 Native Information 对齐 | Actor/Branch/Source 安全案例通过；断言无旧 UI/API 分岔 |
| H2 Query/score/packing | 解决中文省略、重要旧承诺、冗余、多类型证据覆盖 | Recall/Bounding/Enacting 配对无退化，成本受限 |
| H3 按需多跳与额外工具 | 仅复杂请求升级，BFS/PPR/rewrite/rerank 消融 | 多跳有效来源提升，普通 RP 额外模型调用不增长 |
| H4 索引与 Cache | 增量指纹/索引，合法 Context 与 Provider prefix reuse | 精确失效证明、修订/回滚/删除测试与真实延迟收益 |
| H5 与 M3/M8 整合 | 已获准证据连接 Cognition/Goal/Expression，不修改 Writer 权威 | M1 质量证据与原阶段职责一致，失败/未知完整保留 |

旧数据删除或继承、旧设置 hard-cutover、存储后端、具体阈值都要另行冻结。**本研究 H0–H5 是分析切片，不是用户已批准新增的六个正式阶段。**

## 10. 研究决策点（等待用户选择）

**R6 总体方向：** A 最小增强；**B 强约束优先的自适应 Hybrid（研究推荐）**；C 统一 Graph-first 多跳；D 每轮 LLM 规划。

若选 B，下轮进一步定稿：
1. 是否由 Auth/Information 先生成可见子集再交给检索，或允许索引分区再硬过滤（需要实测隔离与成本）；
2. “承诺/认知/事件”是否保证独立最小覆盖和怎样计入 Context lane；
3. 哪种查询触发 PPR/LLM，多跳和查询改写是否可以无损回退；
4. Cache 采用保守 exact anchor 起步，何时具有足够 dependency proof 允许跨无关 Revision 重用；
5. 普通 RP 的质量门槛、成本、缓存与延迟 SLO 由真实实验校准，不预先指定百分比。

## 11. R6 收束：必须确认的产品决策与工程自主空间

> **2026-10-10 补充；本节是决策框架，不代表任何推荐已获用户批准。** 已确认 HCM-01–05 仍以 [decisions.md](decisions.md) 为准，不重开。

### 11.1 只剩三项需要产品级确认

| 议题 | 仍待定案 | 推荐与理由 |
| --- | --- | --- |
| **D6.1 统一检索架构** | 第 3 节路线 A 小改，或 **B Constraint-first Adaptive Hybrid**，或 C 强图谱、D 每回合 LLM 规划 | **B**：先使用现有 Authority/Information 建立合法可见候选域，默认廉价 lexical/graph，Embedding 可选；复杂问题才升级 PPR、rerank 或 LLM；避免持续额外调用与信息越权 |
| **D6.2 硬切换与原数据** | 废除旧 LLM/RAG 独立入口、配置后，如何处置当前有效记忆、历史与派生索引 | **保留有来源的原始故事、Timeline/World 正式数据及可验证的用户记忆；彻底删旧调用/配置分支；不做旧算法双读双写；向量/检索索引按新模型重建**。不把无来源旧衍生物悄悄晋升为可信事实 |
| **D6.3 质量与时延的取舍** | 当前回合有重大知识/承诺冲突时，是否允许一次必要的阻塞校验，或一律先出正文再异步完善 | **正常回合以零额外认知 LLM 为目标；对必须影响当下叙事正确性的来源、认知边界和权威结果同步校验；非关键整理、反思、压缩后台批处理**。证据不足则标未知或阻断依赖操作，不猜事实 |

以上决策是架构和玩家体验约束，而不是可通过固定一个 topK 阈值解决的工程细节。

### 11.2 不再占用对话轮次的工程细节

Codex 后续可以在上述边界内依据既有源码与针对性实验自行决定：

- 中文分词/别名、指代 Seed、BM25/短语索引组合；
- typed BFS、路径扩展、PPR、MMR、rerank 的阈值及开销；
- typed MemoryPacket 最终字段、ContextItem lane 和压缩细节；
- 增量同步、dependency-aware cache Key、失效条件、Provider prompt cache 顺序；
- 请求、token、延迟与后台批次的校准值；不挪用 M1 Evolution 已定义的预算；
- 评测中的 Precision/Recall、重要承诺覆盖率、Actor 越权、错误信念、玩家自主权、自然文风、长篇中文 RP 与冷/热成本；
- 与 M1/M2/M3/M8 的阶段映射和每阶段局部验证。

没有可重验依赖时缓存失效重算；相关状态变化不得为了提速绕过 Source/Authority guard。上一节的 H0–H5 仅是研究切片，不是新增正式阶段。

### 11.3 收束建议

只进行**一次集中定案 D6.1–D6.3**。若用户接受推荐，随后将研究结论整理为可落地的设计边界、阶段依赖和验收用例，供 Codex 正式合并企划；不反复追问细小算法参数。本轮用户仅询问“是否还有讨论点”，不等于同意新的三个推荐。