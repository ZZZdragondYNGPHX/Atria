# Memory OS Phase 1 — 实际架构与接手记录

本记录落实 [既有方案](MEMORY_OS_REFACTOR_PLAN.md) 第 2、34、40 节，不替代方案。
范围：Audit & Adapter；未实现 Phase 2 的 Episode / revision / 依赖失效。

## 分支基线（2026-09-16）

- 已 fetch `origin/custom-release` 和 `origin/feat/memory-os`。
- 远端 `custom-release`：`112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`。
- 本地 `custom-release`：`38a8a2dc055dbda1406e71d43838c07de7e6c559`，包含执行模式重构的本地集成。
- 接手时 `feat/memory-os`：`eb9fcaac368892024f9ead84861b8aee6014ff8f`，只有方案书增量。
- 功能分支缺少本地集成的 `56bb5d9eb`、`d91e44889`、`38a8a2dc0`。采用普通 merge 保留两侧历史，无冲突；未重建功能分支、未更新远端、未合回 `custom-release`。
- 已从本地 `custom-release` 阅读四份维护文档和 `.github/copilot-instructions.md`。本地配置无 Git 身份，本次提交使用命令级 `Codex <codex@openai.com>`，未修改用户 Git 配置。

## 实际所有者及主调用链

主要所有者是 `public/scripts/extensions/memory-graph/`，入口 `index.js → main.js`。
当前系统已经有图谱，不能按“只有 Top-K 文本”从零替换。

```text
聊天结构变更 → core settle* → FloorState 提交日志重放
                            → memory-graph 缓存/投影刷新

GENERATION_ENDED → captureLatestAssistantAfterGeneration / scheduleExtraction
 → runScheduledExtractionPass → runExtractionForStore
 → extractNodesWithLLM（oneshot/crawl）→ applyExtractionOpsImpl
 → 节点/边 + 压缩 rollup → 楼层日志提交 → 可选向量同步

WI before scan → drain mutation / persistent projection
WI after scan  → safeInjectMemoryPrompts → injectMemoryPrompts
 → alwaysInject +（LLM graph recall 或 RAG recall）
 → __MEMORY_GRAPH__ 托管世界书 persistent/runtime 条目 → 重扫/正文上下文

RAG → retriever.runRagRecall → vector-index.findSimilarNodes
 → EmbeddingService → /api/vector/* → vectra.LocalIndex
```

`main.js` 的 `_handleWiBeforeScan` / `_handleWiAfterScan` 是记忆扩展的生成入口；不要再增加一个独立正文注入器。`runLLMDrivenRecall` 和 `runRagRecall` 是现存两种召回分支。RAG 已支持 query rewrite、按类型分桶配额、rerank、近期排除、alwaysInject 去重和诊断记录。

另有 `public/scripts/extensions/vectors/index.js`：原始聊天/附件/世界书向量化，`synchronizeChat`、生成拦截和 `setExtensionPrompt`。它是独立遗留扩展，不等于 memory-graph 的节点索引。本阶段适配的是后者，前者保持原样；后续需要合并召回候选时必须明确去重和预算所有者。

## 消息、标识与生命周期

| 项目 | 代码证据与结论 |
| --- | --- |
| 消息结构 | `public/script.js` 使用 `chat[]`；`mes/name/is_user/is_system/send_date/extra` 以及 `swipes/swipe_id/swipe_info`。事件 `messageId` 是数组索引；`getChatMessageMutationMeta` 明确返回 index、playableSeq、assistantSeq。未发现正文消息通用不可变 ID 或 sourceRevision。generationId 和 integrity 是写入/并发标识，不能充当消息 ID。 |
| Chat 标识 | `getCurrentChatId()` 来自角色 `chat` 文件名或 group 的 `chat_id`。memory-graph `getChatKey` 为 `char:<avatar_url>:<file_name>` / `group:<target.id>`；target 由现有 chat-state resolver 解析。角色/聊天重命名、分支和导入会改变绑定，不是跨导入永久 UUID。 |
| Swipe | `animateSwipe` 的结构完成路径先 `settleMessageSwiped()` 再 `MESSAGE_SWIPED`。FloorState 按当前 floor/swipeId 重放；memory-graph 再排队刷新。保留 `chat[0]` alternate greeting 的特殊跳过规则。 |
| 删除 swipe | `public/script.js` 调用 `settleMessageSwipeDeleted({messageId, swipeId, newSwipeId})`，FloorState 删除相应日志并调整更高 swipe 索引。不能将 swipe 索引当永久 revision。 |
| Regenerate | `Generate` 的 regenerate 路径截断旧 assistant，先 settle 删除再发 `MESSAGE_DELETED`，随后写新回复；不能只监听普通 `MESSAGE_RECEIVED`。 |
| Edit | 编辑保存路径更新消息后发 `MESSAGE_EDITED`、`MESSAGE_UPDATED`；memory-graph 当前结构监听未接入这两者，FloorState 没有通用文本 revision 比较。旧楼编辑是 Phase 2 的明确缺口。 |
| Delete / rollback | 删除路径（包括尾部截断、regenerate）先 settle，再带删除序号 metadata 发事件。memory-graph `scheduleMutationInvalidation → applyMutationInvalidationImpl → refreshMemoryStoreCacheFromFloorState`；WI before scan 等待 pending mutation。FloorState 当前主要按楼层截断/重放，不是任意来源 DAG 失效。 |
| 切换及异步 | 提取已有 chatKey、AbortController、single-flight、scope committedSeq/latestSeq；提交锚定 floor/swipe，切换时刷新缓存。新逻辑需复用这些 guard，并额外验证来源 revision，不能只在 await 后读当前 UI scope。 |

上述是静态调用链审计和现有单测覆盖，不代表已完成方案的 swipe/edit/delete 真机验收。尤其多消息提取、用户消息编辑、楼层移动/分支、旧 ID 重用必须在 Phase 2 做来源夹具。

## 现有存储与图能力

- `persistence.js` 使用 `createFloorState({namespace: 'memory_graph'})`；权威提交日志是 `memory_graph__floor_log`，元数据侧文件是 `memory_graph__meta`。`memory_graph` 数据命名空间属于物化/旧版迁移路径，不应新增第二份独立真相。
- 当前 schemaVersion 为 2，兼容导入 store version 为 8；`migrations/` 识别旧 raw、opLog 和 floor-state 形态。`createEmptyStore` 的运行时数据是 `nodes/edges/nodeSeq/seqCounter/appliedSeqTo/loggedSeqTo/sourceMessageCount` 等。
- `nextNodeId` 产生 store 内 `n_<counter>`，与名称分离，但回滚/重建后不能假定跨历史全局唯一。节点已有 `fields`、`parentId/childrenIds`、`seqTo`、`floorRange`、`semanticDepth`、`semanticRollup`、`archived`；字段需经过规范化、日志、rollback snapshot、导入导出各层才能保留。
- `graph-ops.js` 已有真实带类型的 from/to 边、去重、对称关系、拓扑修复；部分写入带 seqTo。现有边不是 cosine 线，但也没有方案要求的完整 evidence、confidence、validFrom/Until、pending/superseded 生命周期。
- 已有 schema 驱动实体字段、alias 名称搜索、节点 edit/delete、边 edit/delete、层级/平面压缩和 Cytoscape 图谱/表格 UI。`read-api.js` 的 keywordSearch 为当前节点文本搜索，不是已验证的 BM25/FTS 数据库索引。
- `vector-index-core.js` 定义文本/hash/collection 和 desired-vs-remote 同步计划；`vector-index.js` 是现有 I/O 所有者。collection 用 `mg_` + 清洗后的 chat key；清洗可能合并不同特殊字符，Phase 2 scope 迁移前需测试碰撞，不在本阶段改旧 collection 名。
- 索引跳过 archived/空内容/rollup；hash 随 source/model/文本/seqTo 变化。服务端 listHashes 是真相，`vectorIndexState.nodeToHash/hashToNodeId` 只是侧文件镜像。保留配置变更 purge、分批同步、失败记录和同步后的元数据持久化。
- `EmbeddingService` 复用 connection-manager 的 embedding/rerank profiles，后端 `src/endpoints/vectors.js` 使用用户目录下 `vectors/<source>/<collection>/<model>` 的 Vectra 文件索引。
- 聊天/状态走 `src/endpoints/chats.js → ChatRepo → storage engine`。`src/storage/index.js` 已支持 fs、sqlite、mysql、postgres；不应让 Memory OS 单独硬依赖 SQLite 或引入服务型图数据库。Phase 2 优先扩展现有 chat-state/FloorState JSON 契约，再评估索引需求。

## 作用域、Agent 与 LoreState

配置在 `extension_settings.memory_graph`；角色卡 `data.extensions.memory_graph` 有 `schemaOverride` 和 `advancedOverride`，经 `character-overrides.js` 合成生效配置。图数据当前 chat scoped；global/character 配置作用域不等于可共享世界事实作用域。跨 chat 世界继承尚需明确映射，禁止仅按角色显示名合并。

`api.js` 的 `openSession(context)` 复用同一个 runtime store，暴露 read/write；写入经 `commitSessionMutation`。`orchestrator-tools.js` 将 memory 工具注册到 Layer-2，所有执行模式复用。`external-api.js` 暴露注入节点集合用于去重。Agent 不需要各建一份世界图。

编排的 `onWorldInfoFinalized` 消费 `GENERATION_WORLD_INFO_FINALIZED`，在现有 payload/world-info/context 路径组织上下文并应用 preset lorebook filter。保留 global 编辑与 character 生效边界、四种模式、legacy Single 兼容、执行身份指纹缓存、预算耗尽结果不可复用等本地集成行为。Phase 6 引入新上下文依赖时必须审查 executionIdentity；不能假定本阶段已实现统一 Memory Context Composer。

**LoreState 未定位**：对受版本控制的 `public`、`src` 及全仓（排除本方案）搜索 `LoreState` / `lore.?state`，未发现可确认的 LoreState 模块或注入 API。`json-state-journal.js` 是通用 JSON diff 工具，不能据名称当作 LoreState。保留设计要求，但 Phase 6 前需取得实际外部扩展/安装版本及正文/Agent 状态注入契约；不虚构 API，也不复制当前状态真相。

## 导入、导出、备份与 Android

| 路径 | 实际边界 |
| --- | --- |
| Memory 专用 JSON | `main.js` 的导出/导入配合 `import-export.js`，可以导出 graph store，支持绑定目标 assistant floor；清除 recall/debug 临时状态。不是包含原始消息及完整依赖证据的 Memory OS 归档，也不打包服务端 embedding 数组。 |
| 普通聊天 JSONL / 文本导出 | `src/endpoints/chats.js /export` 只序列化 header/body（文本只导出可见文本），未读取 state namespaces；不能声称包含 `memory_graph__floor_log`。 |
| 自动聊天备份 | `backupChat` 写 JSONL；`/state/patch` 虽触发备份，内容仍是聊天 header/body。不能作为独立记忆状态恢复保证。 |
| 用户 ZIP 备份 | `src/users.js createBackupArchive` 按选择收录目录；数据库模式还带 engine dump。fs chats 目录包含状态侧文件，DB dump 承载 engine 数据。vectors 默认不选，需主动包含或恢复后重建；后续需做实际跨模式 roundtrip。 |
| Web / Android | `android-app/README.md`：Node.js Mobile 本地后端 + WebView，加载同一 public 前端。本阶段仅 shared JS，没有新 native 模块。桌面单测不证明 Android WebView、网络 embedding 或备份恢复可用。 |

## Phase 1 实现与边界

- 新增 `memory-os.js`：严格布尔开关 `memoryOsEnabled`，默认 false；设置保存在原有用户级 memory_graph 配置，无单独开关 UI。
- 关闭时直接使用旧 vector-index 函数；开启时经 `createMemoryVectorAdapter` 转发 `sync/search/removeByHashes/purge`。Phase 1 两侧功能相同，开关不是 graph/extraction 已实现的宣告。
- `main.js` 的首次召回同步、提取尾同步、手动重算、重置 purge，以及 `retriever.js` 和 `read-api.js` 的搜索走该边界。保留 rerank/profile 解析及所有已有后端/镜像逻辑。
- adapter 不捕获当前聊天，不修改参数或结果，不吞 AbortError，不自动 retry，不把 hash 当 source ID。`removeBySource` 留待 Phase 2 有真实 provenance 后实现。
- 无新依赖、版本变更、数据库迁移、历史扫描或自动开关；只增加兼容的可选配置字段。维护者可通过现有 settings 保存流程设置该字段为布尔 true 进行对照测试。

## 检查与后续入口

Phase 1 已完成并按以下范围检查；方案正文仍是后续阶段唯一设计依据。

- 最终回归：在 `tests/` 运行 `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`：**147 suites / 1817 tests 全通过**。该正则选择同时覆盖部分相关注册/同步测试，不是全仓测试。
- 先执行 adapter、RAG、read-api、vector core、vector persistence 五套定向测试，全部通过；随后为适应现有 Playwright lint 将 Jest 参数化测试合并，以上最终回归覆盖了修改后的测试。
- 对四个变更前端 JS 和两个测试文件执行 `node --check`：通过。`git diff --check`：通过；已检查全部阶段 diff，并确认 orchestrator 源码与本地 `custom-release` 无差异。
- 使用仓库 ESLint 配置检查：新增 `memory-os.js`、`retriever.js` 和两个测试文件通过。完整 `main.js` / `read-api.js` 分别仍有 **202 / 3** 项诊断；与 `custom-release` 的规则、消息、源码行多重集合比对，**新增 0 项**，未做无关清理。最初因开发插件缺失未能启动 lint，随后在临时目录安装对应 lint 工具完成检查，没有改 package/lock 文件。
- 未运行：浏览器 E2E、真实模型/embedding HTTP、Android 构建/设备、数据库跨模式备份恢复。Phase 1 单测通过不表示方案全部验收项已通过。
- 同步提交：`5c7f49529`。阶段实现提交可由 `git log feat/memory-os -- docs/development/MEMORY_OS_PHASE1_AUDIT.md` 定位，提交号另在交付报告给出，避免文档自引用 SHA。

阶段修改文件：`AI_HANDOFF.md`、本审计记录、方案书 Phase 1 的记录链接、`public/scripts/extensions/memory-graph/{memory-os,main,retriever,read-api}.js`、`tests/memory-graph/{memory-os-adapter,recall-rag-pipeline}.test.js`。同步带入的私人执行模式文件属于单独 merge 提交。

Phase 2 从 `persistence.js`、`floor-state.js/core.js`、`getChatMessageMutationMeta` 和 `applyMutationInvalidationImpl` 接续：建立来源身份/revision 与 Episode，再把依赖失效贯穿普通消息、swipe、edit、delete、分支、导入和 async commit。先证明同源幂等、跨 scope 不串写以及失效后不召回，再进入 Atomic Facts。不要提前重做现有图谱 UI。

资料路由：`tavern-card-builder` / library snapshot `2026-08-18`；已读 ST-A0 工程最小化与开工约束。目标、红线、验收由本次明确指令和现有方案给定。路由返回的角色卡创作指南不作为宿主代码 API 证据；没有采纳外部设计候选或新框架，宿主 API 均以本仓实际源码为依据。
