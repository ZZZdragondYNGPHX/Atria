# Hybrid Cognitive Memory 2.0 — Codex 正式企划整合与分阶段交付建议

> 状态：**产品决策已冻结，供 Codex 整合正式 Plan 的技术交接**；这里的工作切片不是已获实施许可的新增 S/G 阶段。
> 日期：2026-10-10；Task ID：hybrid-cognitive-memory-2-0；Primary Workspace：docs。
> 按顺序阅读：[入口](index.md) → [最终决定](decisions.md) → [目标架构](architecture.md) → 当前章节。具体算法证据、15 个评测案例及 7 组消融对照见 [检索调研](retrieval-design.md)。
> 原产品开发是否继续、旧 M1 能否退出，以 [正式 Agent Intelligence Runtime Plan](../agent-intelligence-runtime/index.md)、[M1 Acceptance](../agent-intelligence-runtime/m1-acceptance.md) 和当时实际 Git/Record 为准。本文件不直接修改旧 Plan。

## 0. Codex 需要完成的正式企划任务

不是立刻重构 Memory 源码，而是**将已确认的研究设计与已有正式 Agent Intelligence Runtime 企划的职责和依赖正确合并**：

1. 读取当前远端真实 Git refs，确认 main、docs 和用户的目标产品任务分支；保持现有 M1 验收与失败证据，勿因本研究的完成而宣称 M1 已完成。
2. 读取正式 Plan Bundle 的入口及必要模块：decisions、architecture、delivery、baseline、compute-policy、behavior-context、execution-reuse、S15–S21 / G01–G06 对应内容；只读与整合有关章节，不必重载所有研究。
3. 将 HCM-01–08 映射到当前已批准/候选模块。**确定一处详细权威**：Memory 唯一召回与 Retrieval 设计归独立 Memory 研究或新正式模块；Actor/Cognition S16–S21、World Simulation、Context/Compute/Reuse 不重写第二份详细规则。
4. 输出可执行的有限交付分组，每组说明前置、消费者、核心接口变化、禁止越界、来源回滚、失败退化、针对性测试、成本观测和验收出口。
5. 显式标注哪些工作在现有开发分支后执行、哪些依赖 M8 G05/G06、哪些由 M3 或现有 World Simulation 提供；避免将后续认知实现作为 M1 当前用户测试准入的暗中前置。
6. 文档整合后更新同一正式 Plan 的入口/决策/路由；不修改不相关的 Record/HANDOFF，也不把独立 docs 研究仓库直接 merge 到 main。
7. Codex 的正式修改应使用原治理规定的工作区和最小相关验证；已有 M1 测试通过与不利结果均不能重写或虚构。

### 应读取的实际入口

| 职责 | 文档 |
| --- | --- |
| 产品已确认决定 | [Hybrid decisions](decisions.md) HCM-01–08 |
| 具体 Memory 检索/上下文契约 | [Hybrid architecture](architecture.md) |
| 代码证据、候选算法、测试/消融 | [R6 research](retrieval-design.md) |
| 原正式架构/权限 | [Agent Runtime architecture](../agent-intelligence-runtime/architecture.md) |
| 原阶段与依赖 | [Agent Runtime delivery](../agent-intelligence-runtime/delivery.md) |
| 当前已冻结 M1 退出条件 | [M1 acceptance](../agent-intelligence-runtime/m1-acceptance.md) |
| 现有 Context / Compute / Reuse | [behavior-context](../agent-intelligence-runtime/behavior-context.md)、[compute-policy](../agent-intelligence-runtime/compute-policy.md)、[execution-reuse](../agent-intelligence-runtime/execution-reuse.md) |
| 用户记录与开发事实 | [现有同一 Record](../../records/refactor/agent-intelligence-runtime.md) |

## 1. 功能工作包建议：原职责优先，而非无限新增阶段

以下 H0–H5 是**交付切片**；是否合成一个新 refactor task / 归入 S/G 的精确位置，由 Codex 和当时实际已批准 Plan 决定。不能保留两个竞争的 Memory Authorities。

| 候选切片 | 可见成果 | 先决依赖/退出要求 | 原 Plan 接入点 |
| --- | --- | --- | --- |
| **H0: Baseline & Security** | 现有三种召回、普通 RP/Native Game/Package Turn 的真实调用图；有权限的证据测试与中文长篇样本；测原成本、延迟 | 来源/Actor/Branch/Timeline/Variant 的正确性边界有确定性反例和有效断言，不能用测试用例反推当前功能已经泄露 | M1 Evidence/Eval 仅读证据，不新建判分权威；测试可独立进行 |
| **H1: Single Recall & eligibility** | 对外唯一 Hybrid；移除旧两种模式 UI/配置/独立分支，Retention/Source/Actor 授权前置；可索引配置资源仍内部使用 | 不丢失有效 Atria 原生历史或可证明记忆；不迁移旧 ST；测试无重复召回/旧模式双读，取消/分支回滚正常 | Memory 正式模块 + Information/Native bridges；不扩大 M1 |
| **H2: Query & bounded ranking** | 中文指代/时间/承诺/关系查询；合法 lexical/typed graph/optional vector；RRF/覆盖选取 | 对现有简单查询不回退；重要承诺、旧事实/当前状态冲突、错信、无 Embedding 可用，且质量—成本有证据 | Context/Memory 消费，M3 中的 Actor 认知只读取不越权写 |
| **H3: Selective deep retrieval** | 只有困难样本才允许 typed multi-hop/PPR/MMR/Rerank/LLM query rewrite；完整 skip/stop trace | 真实多跳/因果有效链的召回改善，有界成本；普通对话不用固定额外 LLM；模拟错误/预算耗尽显式降级 | M8 Compute/Route/G05–G06 成熟接口；后续 M3 使用 |
| **H4: Delta index & source-valid cache** | 投影/向量增量索引，合格依赖的候选复用，稳定 Context segment 与 Provider cache 能力观测 | 删除/编辑/分支改变/权限撤回不复用错证据；实测 p50/p90、Embedding/Network bytes、valid/invalid hits；未知费用标 unknown | M8 G02/G03/G04/G06，复用现有 Execution Reuse |
| **H5: Cognitive consumers and RP quality** | Actor 可知/误信、遗忘、长期承诺、旁白 B/作品 A、C 与自主世界时间的集成评估 | Source validity、角色认知/World 分权、正文 Enacting、玩家自主权和长期写作自然度通过目标验收；后台任务回滚安全 | M2 Goal、M3 S15–S21、M4 世界时钟/模拟、M5 Expression |

建议安全/来源/接口优先，然后相关性，再考虑昂贵推理和缓存；H4 的 CPU 基准可在 H0 就做以决定优化顺序。任何失效绕过优化应拒绝，而不是计作“性能改善”。

### 分组依赖示意

~~~text
现有 M1 Evidence / Eval（不修改退出门槛）
    ├── Memory H0 baseline
    └── Existing Authority / Information / Context proofs
               ↓
          H1 unified recall + actor/source eligibility
               ↓
          H2 cheap query + fused coverage
               ↓
       H3 optional deep retrieval  ← M8 Compute/Route budget substrate
               ↓
       H4 source-valid delta/cache ← M8 Reuse/Context/Provider paths
               ↓
       H5 RP cognitive consumers  ← M2 Goal + M3 Actor Cognition + World Simulation
~~~

这只是建议的因果依赖，不表示 G/S 阶段的原顺序允许被擅自改动。某些 H1/H2 可以作为 M8 的早期消费者，具体由 Codex 检查现有代码与阶段约束后决定。

## 2. 旧模式的硬切换：删除什么、保留什么、如何验证

用户 HCM-07 选择硬切换，对**召回模式**不兼容；这与保留有效 Atria 原生故事/记忆来源不矛盾。

### 2.1 删除清单（精确符号在当时 HEAD 重新搜索）

- 对外模式选择：memory/main.js 中的 recallMethod=llm/rag 分支、相关 UI 选项、旧 LLM Recall 多轮调用入口和旧独立 RAG pipeline；
- 失效设置：为已删除模式专设的历史路由、独立召回 API/Prompt/预设选择和条件字段；具体符号是否还有其他消费者须经静态引用搜索后删除；
- 两条独立的启动/检查/查询改写执行链、无效迁移别名和兼容分支；
- 旧模式专属的测试/文档改为统一 Hybrid 的同一契约测试；不可为保留历史兼容而并行运行旧入口。

**注意：** 应保留 Native Retrieval 资源、Embedding profile、Rerank provider、向量索引接口以及按需 LLM 能力，因为这是统一 Hybrid 内部可选算法，不是旧“RAG 模式”。不能按文件名包含 rag 就批量删除。

### 2.2 明确保留与再构建

- 正式 Timeline、World State、Session Revision、Event Journal、Actor 与 Goal 的原权威数据不因 Recall 重构而清空；
- 有仍有效来源证明的原生记忆事实、Episode、关系、手工更正/获准纠错、原本生效的关键承诺/开放线索在合法 scope 内保留；
- 旧 Embedding/向量、图邻接、词项缓存、查询计划等**派生可重建对象**按新版本重建，必须验证 source delete/rollback 清除；
- 无法证明来源的旧衍生项不直接提升为 World Truth、Actor known 或新索引的可靠事实；用户可见的影响通过诊断/审阅显示，不静默造新事实；
- 不新增对 SillyTavern 旧卡或旧 FloorState 的迁移兼容（保持 Atria 已确认的原生硬切换策略）。

### 2.3 切换前后最小验收

- Legacy Recall UI 与独立分支已从所有实际运行入口消失，但合法向量召回仍可被统一 API 按需启用；
- 已启用旧模式的原生会话重新打开后，读取同样的有效事实/来源，且不会调用旧 LLM/RAG 专用路径；
- 单一请求没有同时注入旧 LLM Recall + RAG + Hybrid 三份结果；
- 删除旧消息、切换 Variant、Branch fork、保存/读取、网络中断、无 Embedding 均按新策略正确工作；
- 删除/更换旧索引不会删除 World/Timeline；若需要清理数据库持久项，仅清理已识别的派生资源命名空间，附 source/retention 验证；
- 不为求“测试全绿”修改原 M1 的不利质量观察、RAG/LLM 测试中仍适用的安全断言。

## 3. 测试、度量和工程证据

### 3.1 必须保留独立的断言层

| 类别 | 最少验收项 | 自动化证据类型 |
| --- | --- | --- |
| Authority | Memory 不改 World/Journal；认知提案未授权不发布 | 确定性源码/集成断言 |
| Privacy/Exposure | 同文本 Actor A/B 不可交叉、传言不能变事实、Narrator 与 Actor 单独投影 | 源/权限断言 + 正文场景审查 |
| Temporal/Provenance | 旧时点与当前时点、source 修改/删除、Branch 及 Variant/Revision 失效 | source-lifecycle + Context/Native tests |
| Retrieval usefulness | 明确名称、中文隐含指代、老承诺、跨 Episode 因果、冲突双方、无证据时未知 | 有标签的 Replay、Recall@K/证据引用正确率 |
| RP Enactment | 玩家自主权、NPC 知识边界、自然文风与新鲜度、角色可发展性 | 独立 RP 场景/盲评和来源判断分开 |
| Cost/Latency | 增量索引真实延迟、额外模型/Embedding/Rerank 请求、token、cached/uncached、费用未知 | Host/Provider 观测、cold/warm、p50/p90 |
| Operational | Abort、late callback、Network failure、budget exhausted、resume/load/rollback | focused integration tests |

详细 15 个用例 R6-T01–T15 见 [retrieval-design §8](retrieval-design.md#8-必须做的评测评价检索也评价叙事消费)。实际目录/命令以当前产品 HEAD 为准，**只运行修改相关的验证**，不把全仓构建/Android 真机/全量 CI 当默认前置。

### 3.2 可直接用于 Codex 定位的既有测试入口

Atria 当前 main 已存在部分相关测试（文件和 testName 需在实施时复核）：
- [hybrid-retrieval.test.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/tests/memory-graph/hybrid-retrieval.test.js)：来源、时间、中文别名、Vector fallback、Token、rerank；
- [source-lifecycle.test.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/tests/memory-graph/source-lifecycle.test.js)：来源生命周期；
- [temporal-graph.test.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/tests/memory-graph/temporal-graph.test.js)：时间关系；
- [information-runtime-p6.test.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/tests/native/information-runtime-p6.test.js)：Actor exposure / 错信；
- [recall-rag-pipeline.test.js](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/tests/memory-graph/recall-rag-pipeline.test.js)：旧 RAG 路径的历史行为断言；切换后只保留仍适用的安全/语义测试。
- M1 的合成 Agent 测试并没有证明生产 Memory resolver 的效果，不可写“已有实测通过”。

### 3.3 禁止用没有真实证据的数字冻结目标

可设 **绝对不容许破坏的契约**：未授权 Source 不得进入 Context；旧 Source/Branch 不得当成新事实；Narrator 不得用记忆独自修改 World；关键承诺不能因数据被删或压缩丢失来源。

但“召回率提高 X%”“延迟低于 Y ms”“每百回合省 Z 美元”“所有 NPC 绝对不泄露秘密”等，**必须在固定输入和真实 Provider/模型实验后才可以定量承诺**。正确性硬约束与自然语言生成的概率性质量需要不同评价手段。

## 4. 知识/隐私边界与安全性

- **前置可见性**：来源/Actor/Temporal/Branch 过滤要发生在 embedding 结果读取、graph neighbor 扩展、LLM query rewrite prompt 建造与候选缓存返回之前；
- **最小权限**：Actor A 的私有信念不在 Actor B 的 Context 或任何跨 Actor 复用缓存中出现，Narrator 宽可见性不向 NPC tool 放权；
- **Prompt injection**：来自历史剧情、Lorebook、外部工具或 Memory Episode 的原文都是低信任**数据**，不能通过“模拟系统提示词”修改 Runtime 指令与能力 allowlist；
- **复用证明**：Hash/词面相似度、历史检索过、在 TTL 内都不是当前权限许可；
- **读写并发**：async 引擎处理期间 World/Branch/Actor/Message/Source 改动必须阻止旧提案与旧结果覆盖；
- **模型费用**：任何加深检索及认知推理通过原预算和 charge，后台不得借独立模型客户端规避额度；
- **自主模拟**：只有 World Tick 发生合法推进时调度 NPC；NPC 计划是待裁决意图，不能自动写为正式事件；原 Simulation step/deliberation 限制和任务 outbox 是基线，不以新 Memory 需求自动提额。

## 5. 正式整合时需要形成的具体产物

建议 Codex 只修改完成企划整合所需的原正式模块，避免新建第二份笨重的总研究复制品：

1. **原 Agent Runtime index**：增加 Hybrid Memory 2.0 架构子模块的阅读路由、依赖/实施候选阶段说明；更新状态为“架构已定，待实施/实测”，不能把当前 M1 写为通过。
2. **原 decisions**：新增 HCM-01–08 的**简短精确交叉引用**或规范化相同决定，注明其来源及正式阶段采纳范围，勿全文复制本研究。
3. **原 architecture**：补 Memory/Actor/Information/Context/Runtime 的信息流和约束；涉及所属权威时只连链接，不改 World 或 Actor 的正统定义。
4. **原 delivery**：把 H0–H5 分派到适当的有限交付组（可为一组新 Memory refactor，也可映射既有 S/G）；每个组有真实消费、前置、验证、退出和数据处理约束，保留原 S01–S34/G01–G06 稳定身份。
5. **原 baseline/research**：将有效的源码事实/学术研究作为具体证据挂载；不要把未执行真实模型实验标记为已验收。
6. **状态与记录**：本阶段是**文档企划整合**，只记录相应文档提交与已执行的链接/结构验证；产品实施和真实模型测试发生后再更新既有 Record。不因新研究主动改已有 M1 历史或 HANDOFF。

### 交付后的 Codex 检查清单

- [ ] 八项产品决定均在正式 Plan 中找到对应消费者和禁止越界条款
- [ ] 对外只保留唯一 Hybrid，内部 Embedding/Rerank/可选 LLM 仍可被合法调用
- [ ] 没有新 World/Actor/Goal 第二数据权威与双预算/双调度器
- [ ] 普通 RP、Native Game、Package Turn 各有明确的 Context/权限接入点
- [ ] old-mode hard cut-over 的数据保留/索引重建/停止语义明确
- [ ] 优先来源与 Actor 权限后检索，再图/向量/rerank，再上下文预算
- [ ] 额外 model calls、index/cache 与智能 NPC world tick 均有已批准预算/原 authority
- [ ] 每个正式交付组有局部测试与具体失败回退/退出门槛
- [ ] 已知未知项/性能收益仍标未测，原 M1 的 pending 和历史负面案例不被覆盖
- [ ] 仅对本次修改的 docs 模块进行最小链接/一致性核查，远端提交可追踪

## 6. 下一步工作边界

用户已确认产品方向，无须再逐条询问 BFS 深度、RRF 参数或缓存 TTL。Codex 获准**合并正式企划**之后，仍需根据当前分支实时状态与原 Plan 逐阶段推进真正的代码实现；在新的产品权限、数据销毁、费用承诺或高风险自主行为超出 HCM-01–08 时才需要额外产品批准。
