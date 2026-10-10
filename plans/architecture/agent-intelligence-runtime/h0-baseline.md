# H0：只读准备、实际调用图与切换核对

> Updated: 2026-10-10。只读设计准备已完成；H0 全套基准与验收未完成，H1/H2 未开始。
> 产品实施依赖 M1 原验收及集成，见 [delivery §8.2](delivery.md#82-hybrid-memory有限交付组与依赖)。检索与切换规则只归 [hybrid-memory](hybrid-memory.md)，本文保存当前 HEAD 的工程清单和待测样本，不复制产品决定。

## 1. 固定源码与证据边界

- 稳定源码：`main@6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`。
- Memory 起点：开发分支交接 HEAD `25e1aef0f2ed6e209520a9883fb9527c0bff24cf`；本次 M1 续接只修改 `tests/agent-intelligence/`，没有修改下述 Memory / Information / Context / Simulation 源码。
- 三条路径、配置引用、持久命名空间和 targeted test 入口经静态读取。当前没有读取真实用户会话、下载第三方数据、执行 H0 模型/检索/CPU/时延基准或浏览器实验。
- 静态缺口不是已复现泄露；源码中的 guard 和既有测试文件也不是新 Hybrid 契约通过证据。H1 开始前按最新集成 main 重新核对本清单。

## 2. 三条实际调用图与 anchor

路径均相对于产品根目录；函数名称是当前源码定位入口。

| 生成路径 | 当前调用图 | 现有 anchor / guard | H1 必须补齐 |
| --- | --- | --- | --- |
| Ordinary RP | `public/scripts/agents/memory/main.js:injectMemoryPrompts` → disabled / `recallHybridMemory` / `runRagRecall` / `runLLMDrivenRecall` → persistent/runtime lorebook projection → 原 World Info / Workspace 消费 | `getChatKey` / `buildMemoryTargetFromContext`、source ticket、消息/variant/content、recall run token、取消与异步 currentness | 统一一个 Recall；在候选域固定 authenticated requester / Actor / 时间；每次请求只能注入一个合法 packet；保持普通 chat anchor，不造 Native revision |
| Native Game | `public/scripts/native/experience/llm/runtime.js:recallMemory` → `createMemoryRecallBridge` → `openSession().recallMemory` → `recallHybridMemory` → 原 Turn/Narrative 消费 | Turn Branch identity、Memory source `assertCurrent`，归一 packet 前后再验 | requester / audience / Actor exposure 前移并贯穿候选读取；Narrator 宽视图不能传给 NPC tool |
| Native Package Turn | `public/scripts/native/play-generation.js:runNativePlayGeneration` → `recallNativePackageTurnMemory`（位于 `experience/llm/memory-bridge.js`）→ Information memory grant → `recallMemory` → `hostMemoryEvidence` → 原 Context Compiler / turn operation | Package/Session/Branch/Revision；grant 无效不调用 Memory；返回 refs 与当前可见 Timeline IDs 求交；Compiler 再做 admission | 同一合法源域传至检索、graph、辅助模型和 cache；保留返回/消费复验，不把最后删 refs 视为正文安全证明 |

共享底层：`memory/api.js` → `hybrid-runtime.js` → `source-lifecycle.js:getMemoryRetrievalSnapshot` → `hybrid-retrieval.js:retrieveMemory`。当前 options 未表达完整 Actor/audience 候选域；Context lane cap、source currentness、optional profile 和 tokenizer/estimate 已存在。Project 仅沿 Task/Evidence/Context authority，不新增 NPC pipeline。

## 3. 删除、拆分和保留清单

| 对象 | H1 处理 | 已定位消费者 |
| --- | --- | --- |
| `recallMethod` 的 `llm` / `rag` 默认、历史归一化和模式 selector | 删除字段、别名及执行分叉；不是改默认值后留下旧路径 | `memory/main.js` defaults / normalization / workspace control / generation / extraction-after-sync / preview；`orchestrator/workspace/memory/page.js` 默认与 selector；`memory/ui-templates.js` / `i18n.js` |
| `runLLMDrivenRecall` / `chooseRecallRoute` / `chooseFocusNodes`，独立 `runRagRecall` | 删除旧独立召回调用和专属帮助/提示；共享纯算法按真实用途保留 | `main.js` 自动与手动 preview；`retriever.js`；旧 Recall 专属 UI 与 i18n |
| `recallApiPresetName` / `recallPresetName` / `recallMaxIterations` / `recallRouteSystemPrompt` / `recallFinalizeSystemPrompt` | 删除旧 Recall 配置及对应 UI/import-export/override 消费 | `main.js` defaults / normalize / advanced settings / selects；`native/agent-settings.js` preset字段过滤；H1 再核对角色 override 与导出边界 |
| `ragUseQueryRewrite` / `ragRewriteSystemPrompt` / `ragRewriteApiPresetName` / `ragRewriteLlmPresetName` | 删除旧 RAG rewrite 模式配置和专属 UI；后续有触发证据的辅助 query 按 H3 原 Route/Compute 契约实施 | `main.js:runQueryRewrite` 与自动/preview分叉，`ui-templates.js` rewrite block；精确 Route 的 `rewrite` 用途在 `native-routing.js`，按是否有合法独立消费者拆分 |
| `memoryOsEnabled` | 不再充当旧/新 Recall 选择器；拆分合法 extraction/source write 启停职责 | `memory-os.js:isMemoryOsEnabled`、`main.js` source lifecycle / controls / extraction / recall；`extract-transaction.js` fact-tool完成及顺序检查；workspace Memory page |
| `recallEnabled` / token、inject position/depth/role / source相关设置 | 保留有效功能启停和 Context 配置，核对角色 override、Native budget 与重复注入 | `main.js` / `character-overrides.js` / `hybrid-runtime.js`，最终 admission 仍由原 Context 决定 |
| `embeddingProfileId` / `rerankProfileId` / Native Retrieval / vector服务 | 保留 exact profile 和合法算法消费者；旧 `ragUseRerank` / quota 命名须按用途重归属，不按文件名批量删除 | `hybrid-runtime.js` 已消费 `ragUseRerank`；`vector-index.js` / `vector-index-core.js` / `native-routing.js`；`ragDefaultPerTypeK` 是旧独立桶配额，H2参数不能直接假设沿用 |
| extraction / compression / schema assistance / manual correction | 保留获准 source writer 与已有 Runtime Route，不因有 LLM 调用就删除 | `main.js` extraction/compression、`extract-transaction.js`、`source-lifecycle.js`、`manual-corrections.js` |

全仓引用核对与精确删除补丁仍在 H1 开始前完成。上述清单是已定位消费者，不宣称静态搜索已经证明所有动态入口穷尽。

## 4. 持久资源处理顺序

| 当前对象 | 处理边界 |
| --- | --- |
| `capabilitySettings.memory_graph`、角色局部设置、原用户 Preset/Route exact refs | 只清理已识别旧 Recall 字段；不销毁共享 Preset/Connection/Route，不把共享 extraction/schema资源当废弃Recall资源 |
| `memory/persistence.js` 的 `atri_memory_graph` / `atri_memory_graph__meta` / `atri_memory_graph__floor_log` | 包含 source-backed图状态、metadata与原增量日志，不能整体删除。`vectorIndexState` / `lastRecallTrace` / `lastRecallProjection` 是待分类派生字段；正式来源及手工更正按原生命周期保留 |
| `source-lifecycle.js` 的 `memory_graph__provenance` / `atri_memory_graph.provenance` | 保留原来源、Episode、facts/temporal graph 支持链和 currentness；旧 namespace 名称不是迁移权限或删除许可 |
| `vector-index-core.js:buildCollectionId` 的 `mg_` + sanitized chat ID、profile相关索引 | 只在确切 chat/profile/source域证明后重建；严禁全局 purge `mg_*` 或删除其它角色/会话索引。当前 prefix/hash不是 Actor授权proof |
| `hybrid-retrieval.js:retrieveMemory` 的 `memory_os_` + SHA-256(`[snapshot.key, profile]`) | 当前Hybrid另有独立collection identity，和旧`mg_`空间分别枚举。逐条document fingerprint / `listHashes`全量核对仍存在；不能只清理旧prefix就宣称切换/失效完整 |
| World/Session/Journal/Timeline/Actor/Goal与关键关系/承诺 | 保留原 authority；source-backed Memory 是其投影，不成为第二份事实权威 |

H1 操作顺序：枚举并固定原来源/设置清单 → 保留来源与撤回依据 → 固定新 indexer/profile 版本 → 合法索引重建并验证 → 一次切换所有入口 → 限定派生空间清理。缺 source/grant 或重建失败保留原数据并标 unavailable/pending；不能恢复旧 Recall 分叉。容量、资源版本和保存失败恢复设计仍待按届时 schema 冻结。

## 5. 固定中文样本规格与 B0 观测准备

使用下表自建合成来源，独立于 M1 development/promotion材料；不拿 M1 密封材料做 Memory benchmark。[h0-samples.json](h0-samples.json) 已物化八项逻辑样本、519条source（含500轮长篇检索压力样本）、Actor grants、时间/branch/variant、query、required/excluded source IDs与正文标签。它不是产品schema或已运行fixture，不证明长篇正文质量；H1接入原source adapter后才执行。冻结文件SHA-256：`ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`，193348 bytes。只有发现设计/标签错误并记录修订依据才更新，不能用运行结果回改标签。

| 样本 | Query/场景 | 合法证据与拒绝标签 | 研究对应 |
| --- | --- | --- | --- |
| H0-ZH-01 | 当前 Scene唯一Actor阿岚；20轮前承诺还书；问“她之前答应的那件事呢？” | 当前Actor的未完成承诺及来源；同名其它Actor承诺不得入选，不替玩家履约 | R6-T01/T05 |
| H0-ZH-02 | Narrator获准秘密事实，Actor仅收到相反传闻并相信；问“他为什么这样说？” | 分开 World fact / exposure / belief / disclosure；NPC不得读秘密节点/摘要/图边 | R6-T02/T04/T11 |
| H0-ZH-03 | 第10tick在甲城、第30tick移居乙城；问“那时/现在住哪里？” | historical和current不同有效时点；不能靠最近排名覆盖历史 | R6-T03 |
| H0-ZH-04 | 三事件动机链，Actor只获准两个节点 | 合法子图内有限路径；缺第三源明确unknown，不能越权补全 | R6-T06 |
| H0-ZH-05 | 同 query换Actor/Branch，修改选定variant，再删除source | 每次候选和cache按exact域拒绝旧项；late callback不可消费 | R6-T07/T08 |
| H0-ZH-06 | 两个独立冲突来源、一个atomic source chain超token预算 | 保留冲突地位与完整来源组；装不下明确不足，不裸截断、不能只选“胜者” | R6-T09 |
| H0-ZH-07 | 无Embedding、rerank故障、取消/保存失败 | 记录optional unavailable/skip/已发费用；合法lexical/graph与正式来源保持，硬授权失败拒绝 | R6-T10 |
| H0-ZH-08 | 500轮中文合成长篇，遥远承诺、近期闲聊、再次重生成 | 长程承诺source标签与正文应用分开；正文fresh generation，角色遗忘另属H5 | R6-T12/T13/T15 |

B0 使用当前 Hybrid 原参数、固定权限/模型/输入/预算；B1–B6和完整R6定义仅引用[检索研究 §8](../hybrid-cognitive-memory-2-0/retrieval-design.md#8-必须做的评测评价检索也评价叙事消费)。先记录 source/authority、候选/入选与覆盖、正文、成本四类结果；不使用检索分数替代正文质量。

CPU热点规格：合法Episode规模100/1000/10000，cold/warm各自记录 corpus projection/hash、`listHashes`/network、index bytes、Embedding attempts及p50/p90；精确数据/配置/环境/重复数在执行前固定。没有模型、usage或latency的观察标未测/unknown，不填零。本次无第三方样本接入或性能SLO冻结。

## 6. 针对性验证入口与剩余出口

当前只定位入口，未执行下列产品测试：

- source/时点/分支：`tests/memory-graph/{source-lifecycle,temporal-graph,hybrid-retrieval}.test.js`。
- 旧模式迁移断言：`tests/memory-graph/recall-rag-pipeline.test.js`；H1改为唯一Hybrid入口，保留仍适用的abort/profile/failure/source断言。
- 三路径消费者：`tests/native/{package-turn-memory-bridge-g3,context-compiler,information-runtime-p6}.test.js`；ordinary RP/Game按实际调用图补requester与入口覆盖。
- H5：原`tests/native/simulation-*.test.js`只作为后续入口，本次不执行新cognition/autonomous验收。

H0剩余：将冻结逻辑样本适配原source/Information/Context fixture，运行source/Actor/Branch/Timeline/Variant确定性反例及B0观测，完成原生数据清单与三路径实际消费证据。H0全套验收、H1/H2产品交付与质量/性能收益均未完成；本次只读准备不能满足HM1集成出口。


## 7. 新设备 H0 执行准备核对

2026-10-10 再次核对 main@6ab12ba43 与 M1 修复 ce8486888：§2–§4 涉及 Memory / Game / Package Context / Information / Simulation / source 测试范围的 Git 差异为空。冻结样本仍为193348 bytes、8 cases /519 sources及§5原SHA-256；未因 M1 结果改变样本或标签。

隔离要求来自实际源码：`source-lifecycle.js:getMemoryRetrievalSnapshot(...,{readOnly:true})` 约束来源持久写入和 access counts；`hybrid-retrieval.js:retrieveMemory` 仍会调用 `listHashes` / `deleteByHashes` / `insert` / `query`，且现有 collection identity 仅依赖 `[snapshot.key, profile]`。因此只传 readOnly 不能声称向量服务无副作用。H0 基准应使用自建合成数据、隔离临时 source / graph 存储、本地受控 retrieval service；无 Embedding 子项明确不提供 service/profile。不要连接用户原 collection 或把估计 tokenizer 结果写成真实 Provider token 数。真实模型/索引服务对照待固定 exact 配置和发送记账后另行运行，结果缺失标未测。

| 样本组 | 原 fixture / authority 适配入口 | 必须保存的独立观察 |
| --- | --- | --- |
| H0-ZH-01 /08 承诺与长篇 | `source-provenance.js:captureEpisodes` → 原 `atomic-facts.js` / `temporal-graph.js` → `source-lifecycle.js:retrievalSnapshot`；原 `hybrid-retrieval.test.js` 的 source-backed fixture 结构 | 全部原source IDs、query、snapshot identity、候选/入选/required coverage；500轮输入不代表500轮正文生成或角色记忆writer |
| H0-ZH-02 /04 /05 Actor与Branch | 原 `tests/native/helpers/information-fixture.js:informationSnapshot` → `informationContext` / 原 Package bridge → Context Compiler；原 `package-turn-memory-bridge-g3.test.js` 的 denied / hidden / stale / foreign 入口 | 原 authority 给出的 grant /可见variant/branch/revision，检索前合法域、返回packet与实际编译 admission 分别保存；不能由样本 audience 数组自授权限 |
| H0-ZH-03 /06 时间、冲突与 atomic组 | 原 temporal operations / support checker / `buildMemoryCorpus(snapshot,at)` / `composeMemory`，原 temporal/hybrid tests 的 historical/disputed/token预算入口 | historical与current期望分开；冲突双方source、完整atomic组及无法装入原因；logical validTicks不能直接冒充产品 temporal boundary |
| H0-ZH-05 /07 修改、撤回与故障 | 原 source lifecycle mutation ticket / snapshot.assertCurrent / abort；本地retrieval service注入失败；原 source-lifecycle tests 的编辑/删除/branch inheritance/save failure入口 | 每次mutation前后的source/anchor及late callback拒绝；optional失败和hard失败分开，持久source字节保持；取消和保存失败不记成零成本成功 |
| 三条实际消费 | ordinary `injectMemoryPrompts`、Game `createMemoryRecallBridge`、Package `recallNativePackageTurnMemory` 分别用本地fixture与原consumer | 各入口调用次数、packet hash、最终Context包含/拒绝证据；共享底层通过不能替代三条实际消费者证明 |

这是 adapter 与观测准备，尚未实现逻辑样本到产品fixture的转换。先保存未过滤的原合成source及明确的权限/时点标签，再按原authority生成fixture；B0直接执行当前算法，禁止为了“通过”在adapter里补入 H1 的前置过滤或 H2 的新query seed。没有适配能力的子项标 unsupported/pending，不能静默删除该子项、预过滤秘密后声称B0安全，也不能从检索来源存在推断NPC当前记得或正文已应用。

本次仅验证样本schema/ID/引用/hash、上述源码符号与测试路径存在、Memory范围Git一致性及文档diff；没有执行产品测试、B0、Actor/Branch/Timeline/Variant反例、检索/时延基准或模型。H0完整出口和H1/H2仍未完成。
