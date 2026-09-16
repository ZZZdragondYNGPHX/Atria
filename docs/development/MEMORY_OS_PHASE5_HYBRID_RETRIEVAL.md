# Memory OS Phase 5 — Hybrid Retrieval

完成于 2026-09-16，继续既有 `feat/memory-os`，执行原方案 Phase 5。

## 基线

- 本地 `custom-release`：`38a8a2dc055dbda1406e71d43838c07de7e6c559`。
- 本次 fetch 后 `origin/custom-release`：`112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`。
- 阶段开始 feature HEAD：`d22d401485dc057ea9b81d1e616efb015b83d687`。
- 无新增基线提交，feature 已包含本地 custom-release；本阶段不需要同步。未创建分支、推送、合并或准备上游 PR。
- 用户允许不兼容旧数据；不添加旧数据迁移前置条件。

## 真实架构与实现

1. `hybrid-retrieval.js` 读取既有 provenance ledger 的 Fact、Temporal Graph、Episode 投影，没有引入第二套数据库。所有 lane 共用来源校验后的候选集合。关系已被取代时，其未同步 supersede 的原 Fact 也只能作为历史断言；争议关系的独占支持 Fact 不进入断言候选。原文 Episode 明确标注为过去的来源文本，不能当作当前状态。
2. Query Analyzer 使用中英文实体名称/别名与位置、归属、原因、历史词识别。明确数值时间通过 API `options.at` 传入，遵循已有左闭右开有效区间。未知时间不伪造命中。不使用 LLM 猜测日期、代词或故事时间。
3. Keyword lane 是内存 BM25，支持英文词及中文单字/双字；Graph lane 从匹配实体向外最多 2 跳、20 个实体、30 条关系；Episode lane 补入命中 Fact/关系的原文来源。未匹配的普通查询不全图兜底。
4. Vector lane 复用 `context.embeddingService` 和已有 embedding profile。按聊天和 embedding 配置隔离 collection；SHA-256 内容指纹生成 48 位数字 hash，并验证完整 metadata 指纹。增量 list/delete/insert/query，清理过期索引，每批最多 64 条。召回结果必须仍存在于本次有效语料中，外部返回的旧 ID/伪造指纹不能绕过投影。
5. RRF 融合关键字、向量和局部关系结果，集中定义权重及限制；置信度、重要性、最近性、访问次数参与排序，位置/归属意图提升相应关系。可选现有 rerank profile；向量/重排服务失败会记录诊断并保留其他 lane。AbortError 和来源变化不作为普通失败降级。
6. Composer 以当前事实、当前关系、历史断言、原文来源分区，JSON 引用记录文本，保留来源 ID、事实类别、置信度和有效期。整条记录准入，最多 20 条；不截断半条事实。`memoryOsTokenBudget` 默认 2400、范围 0–32000，CORE 与 FOCUS 合计计数。生产优先实际 tokenizer；无 tokenizer 时使用 UTF-8 字节估计并在 trace 标识。调用 API 时若外部传入的 core 已超预算，返回 `coreOverBudget`，不再追加记录。
7. `source-lifecycle.js` 提供带 scope/chat/source/epoch/ledger 版本检查的检索快照。向量、重排、tokenizer、世界书异步路径后检查有效性；被选中的 Fact（包括关系支持 Fact）通过同一事务累计访问数，未入预算不累计。计数不修改事实的来源置信度或更新时间。
8. `hybrid-runtime.js` 接入实际配置和 tokenizer；公开 `api.recallMemory(context, query, options)` / `session.recallMemory(query, options)`，返回 `text/selected/tokenCount/budget/plan/diagnostics/tokenCounting/assertCurrent`。异步消费者在使用之前调用 `assertCurrent()`；结果中的对象是快照，不是可写 ledger。
9. `main.js` 在 Memory OS 开启且 recall 开启时自动走新路径，关闭旧 recall snapshot 复用。仍使用原共享世界书 CORE_PACKET / FOCUS_PACKET；常驻节点按完整节点预算准入。写入串行化，复制世界书后修改，在保存期间来源失效时撤回当前条目；检索前撤下旧 FOCUS 并清理其元数据。保持既有常驻记忆、其他世界书条目和 feature flag 关闭时的旧召回路径。

## 验证

- 相关完整回归：`cd tests; node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`，154 suites / 1885 tests 全部通过。首次运行发现旧 injection-window 测试依赖函数签名文本格式，调整默认参数写法后整组通过。
- 最后定向回归（新增重排成功与访问计数断言后）：hybrid-retrieval、source-lifecycle、injection-window、wi-scan-listeners、recall-rag-pipeline，5 suites / 86 tests 通过。
- 新检索测试包含：当前位置排除旧关系及原 Fact、历史/边界时序、中文别名、多词名称、空/无关查询、来源编辑与伪造向量、局部图深度、CORE+FOCUS 预算、向量故障及延迟结果、增量 hash/聊天及模型隔离、重排成功/失败、tokenizer 取消、真实生命周期快照和访问累计。
- `node tests/frontend/memory-os-source.smoke.mjs http://127.0.0.1:18742 msedge`：隔离 data root 的真实 Luker 服务、系统 Edge 153.0.4234.32，16 项通过。新增实际 tokenizer 预算、公开检索 API、真实 after-world-info-scan handler 写入 FOCUS/请求重扫、UI 来源编辑后召回排除。测试角色及数据仅留在临时目录。
- 新增/修改的独立模块、单测、浏览器脚本 ESLint 通过；`main.js` 仍为 202 个既有错误，没有声称全仓 lint 通过。
- 修改 JS/MJS 语法检查、`git diff --check` 通过。开发服务器已用于真实浏览器测试，前端库编译成功。

## 边界与下一阶段

- 真实远程 embedding/reranker/LLM 无配置，本阶段使用服务契约 mock 验证这些路径，浏览器验证不依赖外部模型。未运行 Android 真机；不要求用户补测才继续。
- 自然语言时间识别目前区分“当前/历史”；准确时间点使用 `at`。跨消息代词解析、自动日期换算与效果调权留待后续实际用例。
- BM25 和来源快照当前按聊天全量计算/复制，首次向量同步会处理全部有效语料。尚未宣称大图性能、跨窗口并发写入或远程召回质量验收；索引性能优化属于 Phase 9。
- `at` 必须与既有关系 `timeOrder` 或数值有效期使用同一时间坐标；不将楼层编号自动解释为故事时间。
- 下一阶段按原方案进入 Phase 6：先定位真实 Orchestrator 长期记忆与私有 scratch 入口，接入统一 retrieval API。仓库尚未找到 LoreState provider，不能假造其 API 或新建同名替代体系。
