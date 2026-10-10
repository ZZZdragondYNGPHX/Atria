# Hybrid Cognitive Memory 2.0：唯一召回与证据消费

> D5 正式企划整合完成；**HM1（H0–H2）已交付；本文继续管理目标契约，H3–H5 未实施，收益只限实际 Record 证据**。
> Updated: 2026-10-10。产品决定唯一来源为 [HCM-01–08](../hybrid-cognitive-memory-2-0/decisions.md)，正式采纳路由见 [decisions §9](decisions.md#9-d5--hybrid-cognitive-memory-20-正式采纳)。
> 本模块唯一管理 Hybrid Memory 的检索、返回证据和旧召回硬切换；[baseline §10](baseline.md#10-d5hybrid-memory-整合时的实际基线) 管理源码事实，[delivery §8.2](delivery.md#82-hybrid-memory有限交付组与依赖) 管理交付依赖。研究中的技术架构与 H0–H5 建议是输入，不构成另一份正式实施权威。

## 1. 复用现有权威

唯一 Hybrid 是产品召回入口，内部允许 lexical、typed graph、可选 Embedding，以及预算内的多跳、rerank / LLM 辅助。它沿现有 Memory OS / Graph 和 `openSession().recallMemory` 演进，不另建 Memory 服务家族、事实图或模型调用器。

| 所属职责 | 保持的权威 | Memory 的连接 |
| --- | --- | --- |
| 正式事实、事件与当前状态 | World / Session / Journal；[architecture §1–2](architecture.md#1-保持责任清楚避免平行系统) | 索引与引用，不写世界结果，不以历史覆盖当前正式状态 |
| Actor identity、动态心理与知识视图 | Actor / Information / Cognition；[architecture §6–7](architecture.md#6-actor-cognition状态可以真实存在内容可以是错误解释) | 检索获准接触、信念与变化的来源；不成为第二个 cognition writer |
| Goal、Commitment 与执行完成 | 原 Goal / Context-derived；[architecture §5](architecture.md#5-persistent-goal用户执行契约与角色愿望) | 关联承诺条件、有效来源和历史；不自行宣布履约或目标完成 |
| 请求实际看到什么 | [behavior-context §3.2](behavior-context.md#32-hybrid-memory证据编译) 与原 Context Compiler | 输出候选 ContextItems，原编译器做最终 admission |
| 认知更新、后台与模型费用 | [compute-policy](compute-policy.md)、原 Runtime / TaskScheduler / RunControl | 提出检索需要；准入、发送、记账与取消仍由原路径完成 |
| 世界时间与自主 NPC | [architecture §8.1](architecture.md#81-正式-world-tick与自主-npc) 与既有 Simulation / Lifecycle | 只消费正式事件与已采纳认知，不把 recall 或预测当成已发生事件 |
| 缓存、依赖与有效性 | [execution-reuse §2–3](execution-reuse.md#2-reuse-contract-与候选--证明分离) | 使用原 proof / invalidation，不维护竞争的授权账本 |
| 评价与改进 | 原 Evidence / Eval；[research §7](research.md#7-d5hybrid-memory研究采纳与待验证项) | 检索、正文、成本分别评价；不修改 M1 原案例、报告或 promotion gate |

Episode、Semantic Fact、Perspective / Belief、Social / Commitment、Affective、Character Expression、Narrative Spine 是既有来源的语义用途，**不是本轮批准的七类新持久资源**。索引和摘要均是可失效的投影；物理 schema / backend 在所属工作包冻结。

## 2. 三条生成路径分别接入

| 路径与当前接入点 | 后续消费者与 anchor | 必须补齐的交集 |
| --- | --- | --- |
| Ordinary RP：`memory/main.js:injectMemoryPrompts` → 原 World Info / Workspace hooks | 原正文与获准 Actor / Narrator 投影；authenticated scope、chat / message / active variant / hash | 去掉旧召回分叉；在任何候选读取前固定 requester 与合法源域，防重复注入；不伪造 Native revision |
| Native Game：`experience/llm/runtime.js` → `createMemoryRecallBridge` → Memory API | 原 Turn Context、Narrative Contract / Orchestrator；Session / Branch / Revision 与正式 World outcome | 保留现有 turn currentness，增加请求用途与 Actor audience；旁白较宽视图不能传给 NPC 工具 |
| Native Package Turn：`play-generation.js` → `recallNativePackageTurnMemory` → 原 Context Compiler | Information memory grant、可见 Timeline sourceMessageIds、exact Package / Session / Branch / Revision | 将已有 grant / 来源收缩前移至检索候选域，同时保留返回与编译时复验；只在最后删引用不足以证明正文合法 |

HM1 已统一三条路径并分别验证实际调用与消费，原 anchor / Context authority 保留；具体结果见同一 Record，不以共享函数单测替代消费证据。
Project 只沿原 Task / Evidence / Context consumer 读取与任务有关的合法历史，不复制 NPC 心理或娱乐关系系统；共用 source / budget / Eval 语义不意味着已接入同一 RP pipeline。

## 3. 请求、检索与证据协议

### 3.1 逻辑契约

以下是实现必须表达的语义，**不是已实施的字段清单或全局类型**。优先扩展原 ContextItem、SourceRef 与 Memory API options。

| 面向 | 必须能核验的内容 |
| --- | --- |
| Requester / 用途 | narrator、actor 或 task；身份与权限由原 authenticated authority / Information 计算，不信任客户端自报 privilege；作品叙事策略由原创作资源选择 |
| Anchor / 时间 | 源域 exact identity、branch reachability、revision / variant / hash / scope epoch；current 或 historical 查询；场景、参与 Actor、正式 World Tick、承诺与已提交事件种子 |
| 预算 / 方法 | 原 Context token cap、deadline、可选计算许可与检索策略版本；具体触发阈值待实测，不默认固定额外模型请求 |
| 返回证据 | 稳定 ID / kind、exact refs / hash、有效时点、Actor exposure / grant、来源链与派生 producer 版本；World fact / belief / hearsay / historical 地位分开 |
| 完整性 / 消费 | current、superseded、disputed、unknown、stale / unavailable 及适用原因；冲突来源并列、token 成本、coverage 缺口与消费前复验依据 |
| 观察 | 原 run / request / attempt 下的实际 lanes、skip / stop / fallback、候选与入选数、来源拒绝和成本；不向正文复制私有推理、秘密候选或全部排名轨迹 |

### 3.2 Constraint-first Adaptive Hybrid

1. 固定 requester、源域 anchor、作品策略、时间与预算；从原 Authority / Information 取得获准的 source-backed 投影。
2. **先约束合法候选域**：source currentness、scope / Actor exposure、Branch 可达性、有效时间与允许 kind。过滤发生在词项 / 向量候选读取、图邻接扩展、辅助 LLM 输入和缓存返回之前；秘密摘要与诊断日志同受约束。
3. 优先从当前 Scene / Actor、已验证别名、正式事件、未完成承诺和时间词构造确定性 query seeds；无法消解的指代保持候选 / unknown，不造新事实。
4. 默认使用廉价 lexical 与有界 typed graph；配置有效才使用 vector。沿现有 RRF 思想融合异构排名，具体中文短语、分词、lane weights 与深度由固定数据消融确定。
5. 只有来源覆盖仍不足且原预算 / capability 准入成立时，升级有限 typed path / PPR、rerank 或 LLM rewrite。所有图探索限于合法子图；关联可达不证明因果，模型只提出 query，不写事实。
6. 在原 Context 剩余预算内去重并选覆盖充分的证据；评价 type-aware packing / 有限 MMR，不能删掉独立冲突来源或截断 atomic source chain 造成误导。
7. 在异步返回、Context 编译与实际消费时重验 source / requester / branch / anchor；输出结构化证据，正文继续 fresh generation。

事实权威、来源支持、Actor 相信程度和检索相关度分开。硬条件不能由浮点排名、confidence 或重要性越过。历史查询可以取得当时成立但已 superseded 的事实；当前查询服从现行 World state，争议不自动选胜者。

查询“她还记得闭关前答应我的事吗”时，系统查到承诺只证明有历史来源；角色现在是否记得、是否愿意履约由原 cognition / Goal 状态决定。近期加权不能机械抹掉关键旧承诺，重要性也不能使无关核心设定挤满所有回合。

## 4. 旧 LLM/RAG 召回的硬切换

HCM-07 的硬切换已在 H1 实施；下表保持范围权威，实际删除、保留与重建证据见同一 Record。H0 保存切换前真实基线，不回写成 H1/H2 算法。

### 4.1 删除与保留清单

| 处理 | 已定位范围与实施条件 |
| --- | --- |
| 删除对外模式和执行分叉 | `recallMethod=llm/rag`、旧 UI selector / i18n、`runLLMDrivenRecall`、独立 `runRagRecall`、手动 preview 与生成 / extraction 后模式专属 sync 分支；统一经 Hybrid，不保留别名或双读双写 |
| 删除旧配置和归一化 | 旧模式专属 recall API / prompt / preset / iterations、query rewrite 配置与历史模式归一化。`memoryOsEnabled` 不再充当旧/新召回选择器；若符号另有合法写入消费者，按引用拆分职责，不能保留旧召回开关 |
| 保留合法算法与原执行权威 | Native Retrieval、Embedding / rerank profile、向量服务、按需 LLM、extraction / schema assistance 及其合法路由消费者；共享字段按用途重新归属，不能按 `rag` 文件名批量删除 |
| 保留正式来源 | Atria 原生 World / Timeline / Session / Journal、故事历史、Actor / Goal 状态、有有效来源证明的记忆、Episode / 关系 / 手工更正 / 关键承诺；原 source / retention / 删除权限保持 |
| 重建派生资源 | 旧模式专属索引与设置清理；有效来源的词项、图邻接、向量与查询缓存按新版本重建，限定派生命名空间，验证 edit / delete / rollback 后旧项不可消费 |
| 不可证明来源的旧衍生内容 | 不自动提升为 World Truth、Actor known 或可信新索引；隔离 / unavailable 并提供获准诊断。没有源就不假造迁移证明 |
| 不迁移的外部历史 | 不新增 SillyTavern 旧数据 / 旧 FloorState 迁移兼容；这不取消仍有效的 Atria 原生来源保留义务 |

`recallEnabled` 等有效的功能启停与内部算法许可可沿原配置保留，但不能成为旧 Recall 模式兼容入口。精确删除字段、容量、资源版本和存储清理顺序属于 H0/H1 工程设计，不重开产品方向。

### 4.2 切换、失败与撤回

H1 以一次完整切换交付：所有实际自动 / 手动入口和受支持原生会话重新打开都只调用 Hybrid；单次请求不重复注入 LLM/RAG/Hybrid packet。清理只作用于已识别的旧设置 / 派生索引，不能删除 World / Timeline 来换取重建成功。

新版本不在失败时调用旧 LLM/RAG、映射模式别名或并行跑旧路径。可选 vector / rerank 失败可走 **Hybrid 内**合法 lexical / graph；缺必要 source / grant 则 unknown / fail closed。取消、late callback、保存失败或索引不完整保留原正式来源，显示 pending / unavailable。

发布撤回沿原版本 / binding / source 生命周期执行；回滚数据只消费当前 anchor 可达的正式来源，不携回未来派生证据或恢复已撤销授权。整体产品版本撤回与新入口内部恢复旧算法是不同动作，前者也须验证已清理设置和数据完整性，不能靠双读兼容完成验收。

## 5. 认知、叙事和世界时间连接

HCM-02 的旁白 B 默认 / A 严格限知 / C 作者自定义及 disclosure 规则唯一归 [behavior-context §2.1](behavior-context.md#21-作品叙事策略与角色可知)。HCM-03/05 的事件驱动混合认知、作品可选高度自主与遗忘唯一归 [architecture §6.1](architecture.md#61-事件驱动认知与角色遗忘)；HCM-04 的正式 World Tick 唯一归 [architecture §8.1](architecture.md#81-正式-world-tick与自主-npc)。

Memory 提供 Exposure / Belief / Disclosure 各自的历史来源，不把“检索到”“模型想到”或“摘要变短”作为认知改变事件。遗忘影响 Actor 的可知投影时，系统仍按原授权保存 / 检索正式历史；索引淘汰与角色失忆不共用 writer。

H2 可以使用当前 source-backed commitment projection，不等待新 Goal 或 BDI writer；H5 再消费 M2/M3 的正式契约。现有 Simulation 的合法 tick / step / deliberation / outbox 能复用，不依赖 S22–S24 的未来 World Model。大规模社会模拟仍在后续研究池，不成为所有 NPC 默认持续调用模型的理由。

## 6. 增量索引与有效缓存

Memory 只定义待复用投影，proof / invalidation 的完整规则沿 [execution-reuse](execution-reuse.md)，Context 稳定段沿 [behavior-context §3.1](behavior-context.md#31-稳定-context-segment-与-cache-aware-compiler)，Provider 能力与真实 usage 沿 [model-routing §8](model-routing.md#8-cache-capability与cache-locality)。

| Memory 对象 | 依赖与消费要求 |
| --- | --- |
| Corpus / lexical / graph / vector index | exact source / variant / epoch、授权源域、indexer 与 Embedding profile 版本；原 source ledger 的可验证 delta 才允许增量同步，依赖不完整退回合法全量重建 |
| Query seeds / 候选 IDs / rank / path | query intent、requester / audience、时点、Branch、授权投影与 retriever 版本；同 query / hash / TTL 不准许跨 Actor 或 Branch 复用 |
| Context / Narrative Intent | source-complete packet 与原编译 / intent binding 重验；动态 Scene / Memory 不为 prefix hit 留旧值，不缓存普通 RP Final Prose |

当前向量同步仍遍历 corpus 指纹并核对远端 hash 集。H4 先测合法 Episode 规模 100 / 1000 / 10000 的 projection / hashing CPU、network / index bytes、Embedding 次数与 cold / warm p50/p90，再决定 delta / candidate cache 的实际方案。数字是**基准规模，不是已测结果或性能 SLO**；依赖误命中先判正确性失败，不能用更快延迟抵消。

## 7. 失败与成本边界

| 失败 | 消费结果 |
| --- | --- |
| 可选 Embedding 未配置 / 网络不可用、rerank 超时、LLM rewrite 无效 | 保留合法基础 lanes 与原 query，分别记录 unavailable / skip / failure 和已发生费用；不伪装可选算法成功 |
| requester / grant 无效、source 已删除或权限撤回 | 拒绝相关候选、缓存与派生正文；不改查另一 Actor 或旧版本 |
| 异步期间 Branch / Revision / variant / scope 改变 | 拒绝晚到结果，经原请求路径在预算内重算；旧 packet 不能覆盖新回合 |
| 必要 World / source 不可得或 atomic evidence 无法入预算 | 明确 unknown / unavailable；阻断依赖它的操作或沿原审阅，不靠猜测补事实 |
| 后台整理 / 索引失败或预算耗尽 | 保留 source 和已提交 state，记录 pending；删 optional work，原来源 / 认知核验仍同步 |
| 正文疑似串知 / 偷写玩家行动 | 单独审查与有界修正，保留不利结果；检索过滤不被宣称为自由文本绝对保证 |

正文依赖的正确性检查、零额外认知 LLM 目标与后台准入唯一归 [compute-policy §4.1](compute-policy.md#41-hybrid-memory同步核验与后台工作)。Embedding、rerank、辅助 LLM、维护、查询 / proof CPU、网络与存储均有可观察成本；价格 / usage 缺失标 unknown，不写零。

## 8. 验证出口与未完成项

复用现有 Evidence / Eval，在同版本、输入、权限、预算和模型下区分 source / authority、retrieval usefulness、正文 Enacting 与成本。R6-T01–T15、B0–B6 消融设计唯一保留在 [检索研究 §8](../hybrid-cognitive-memory-2-0/retrieval-design.md#8-必须做的评测评价检索也评价叙事消费)；所属交付组的退出见 [delivery §8.2](delivery.md#82-hybrid-memory有限交付组与依赖)。

先验确定性反例验证 source / Actor / 时间 / Branch / Variant、race、delete / restore 和无权限失败；再评中文指代、老承诺、合法多跳 / 冲突与无证据拒答；独立长篇 RP 验证角色声音、玩家自主权、自然应用 / 新鲜正文。检索 Recall@K 提高、shared schema 或 fake provider 通过都不替代正文收益。

HM1 已交付唯一召回、source/Information 前置合法域、中文 query seeds/RRF 和完整 Context source groups；无派生 ledger 的合法 Native Timeline 可只读重建。普通回合没有固定附加召回 LLM。实际 B0–B3、安全反例、三路径消费、浏览器、主模型正文与费用见 [Record 最新 HM1 节](../../../records/refactor/agent-intelligence-runtime.md#hm1--h2-中文种子完整来源组与正文配对)。主模型九组六维总分不低于 B1，个例不足和长篇无依据当前回忆的输出保留并触发一次评测内有界修正；不把检索过滤称为自由文本绝对保证。选择性 PPR/LLM、delta/cache、完整 cognition/forgetting/narrative policy 尚未交付；真实 Embedding、独立人工偏好、500轮持续正文及性能/费用节省仍未验证。

M1 的 S01–S10 已有工程结果、主模型准入、独立验收缺口及不利观察继续以 [m1-acceptance](m1-acceptance.md) 和 [同一 Record](../../../records/refactor/agent-intelligence-runtime.md) 为准。本模块不变更它们，不把新 Memory 能力变为当前 M1 的隐藏前置。
