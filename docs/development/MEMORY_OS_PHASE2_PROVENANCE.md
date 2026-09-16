# Memory OS Phase 2 — Provenance / Episode

沿用 [原方案](MEMORY_OS_REFACTOR_PLAN.md) Phase 2；本记录说明实际实现，不新增设计路线。

## 基线与范围

- 工作分支仍是 `feat/memory-os`，起点 `27aed18a1931437b76d1170a95ca9e01c318e080`。
- 本轮 fetch 后远端 `custom-release` 仍为 `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`；本地为 `38a8a2dc055dbda1406e71d43838c07de7e6c559`。功能分支已包含本地全部提交，无需再次同步。
- Phase 1 的 `memoryOsEnabled` 仍默认 false。未改应用版本、依赖、数据库 schema 或原有图谱/编排功能；未合回 `custom-release`。
- 本阶段实现来源身份、revision、Episode、依赖记录与失效排除。历史自动重建不属于本次实现；旧楼内容变化后允许标 stale，不能将排除失效内容报告成已经自动重建。

## 数据与所有者

| 数据 | 实际存放与契约 |
| --- | --- |
| 消息身份 | 正文消息顶层可选 `memory_os_source_id`。使用 UUID，与消息文本、数组索引和 swipe 序号分离；只为抽取/写入涉及的消息分配，调用已有 `context.saveChat()` 保存。不能放在会随 swipe 替换的 `extra` 内。 |
| 来源账本 | chat-state namespace `memory_graph__provenance`，version 1，保存 `scopeId/sources/episodes/dependencies`。复用当前 state API 和 storage engine，不使用新数据库。 |
| Source | 按稳定消息 ID 保存 `revision/content/floor/status`。content 是原文、角色名、user/system 标记及当前 swipe 索引的精确序列化快照，不使用 32 位向量 hash 判断修订。 |
| Episode | ID 为 `message UUID:revision`，含 scopeId/chatId、messageIds、原文 content、role、createdAt、sourceRevision、sourceContent、sourceFloor 和 status。正文变化/移动/swipe 后旧 Episode 为 stale，来源移除后为 deleted；旧原文保留。 |
| 派生节点版本 | 节点可选 `memoryOsEvidence: {id, scopeId, episodeIds}`；id 是该派生版本的 UUID，不复用现有 `n_<counter>` 当历史版本标识。字段经过 runtime normalization、rollback clone 和 graph payload 保留。 |
| 依赖 | `message → episode → node-version → relation / rollup`。通用 descendants 遍历带 visited 集合；边记录去重。未来 Fact/Relation 实体应扩展此链，不另造来源存储。 |

`source-provenance.js` 负责纯数据算法；`source-lifecycle.js` 负责显式 target 的读写、按 chat key 排队、来源票据、同步变更观察、提交 guard、活动投影及分支继承。来源账本独立于 FloorState 日志，防止源楼层被删除后连证据历史也一起消失。

Phase 2 的来源精度是“抽取批次及其图上下文”，不是 Phase 3 的原子事实证据判定。为避免隐性依赖漏标，改变的节点保守继承当前非 archived 图节点的已知来源；关联边端点和压缩节点也参与。这会扩大失效范围及账本大小，后续应结合精确 read-set 收窄，尚未做大规模性能验收。

## 执行与失效链

1. 抽取开始保留原始聊天快照；每批只 capture 实际输入的 source_index，对分配 ID 的异步保存前后复核快照。
2. capture 持久化 Episode 后返回来源票据。LLM 返回时再次验证 chat key、chat 数组身份、变更 epoch 和 Episode 内容；不匹配则丢弃结果。
3. 图变更绑定来源，再经现有 diff/replace 写入。`FloorState.patch/update/reset` 增加可选同步 `options.validate`，在 state updater 内执行（包括重试），覆盖异步 diff 完成后才发生的切换/编辑。未传 guard 的调用行为不变，楼层单调锚点规则不变。
4. Agent session 在开启时取得来源票据；有票据的写入使用隔离副本，校验/提交失败时不把无来源节点放进共享读取缓存。
5. `MESSAGE_EDITED`、`MESSAGE_SWIPED`、`MESSAGE_SWIPE_DELETED`、相关 `MESSAGE_RECEIVED` 路径同步观察来源变化，异步刷新仍走原有 mutation 队列。快速 A→B→A 也会使旧票据失效；重复通知相同内容不会推进新 revision。
6. 删除/regenerate/rollback 后，对已追踪来源重核当前聊天。只检查已有来源，不在加载时扫描、抽取全部历史。聊天移动/中间删除与重复导入 ID 采取保守失效，不能按新楼层位置把旧证据重新认领。
7. `ensureMemoryStoreLoaded`、读取 API 和 vector 查询返回后的过滤都会验证来源。失效节点在活动投影中 archived，相关边排除；清理 recall snapshot/projection，防止复用旧注入内容。
8. 向量结果即使在来源变更后才返回，也会被过滤。已有索引同步根据当前有效节点与服务端 hash 差异删除旧 hash；不是每次编辑都立即发 embedding 请求。离线时优先保证旧向量不可用于有效召回，待下一次同步物理清理。

源失效与派生状态主要通过“读取时验证 + 活动投影排除”实现；权威来源状态保存在 provenance sidecar，原始图日志保留历史。没有把整个 FloorState 改成新的 DAG 存储。

## 兼容与降级

- 旧节点没有 memoryOsEvidence，按原规则继续读取；没有自动伪造旧节点的来源。旧 corpus 的完整来源迁移仍属于 Phase 8。
- 已有来源证据的节点即使后来关闭开关，也不能因此重新变为有效。关闭只停止新来源采集；旧证据仍执行有效性校验。
- provenance 读写失败时，来源不明的派生节点退出活动视图；保留旧日志和 legacy 节点。抽取失败沿既有错误路径处理，不新增正文生成硬依赖。因临时校验失败被内存投影排除的节点，可在存储恢复后重新加载聊天重建视图。
- chat/group 仍复用现有 key/target。普通重命名依赖现有 chat-state sidecar 搬移；显式创建聊天分支时复制 provenance ledger，保留原始 evidence scope，进入分支后重核消息，分支内修订不写回源分支。
- 普通聊天 JSONL 会带消息上的 ID，但不会包含独立来源账本。单独导入带 evidence 的 graph 而缺失账本时采取失效排除，不能根据文件内自称的 evidence 自动确认事实。完整可移植导出/重绑定属于 Phase 8。
- Web 与 Android 共用这套 JS 和状态 API；没有新 native 库。未用桌面单测替代 Android WebView 或真机存储验收。

## 检查与交接

实际执行：

- 在 `tests` 运行 `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`：150 个套件、1843 项测试全部通过。
- 最终测试代码整理后重跑 `floor-state/instance.test.js`：77 项全部通过。
- 对全部 13 个新增/修改的 JavaScript 文件执行 `node --check`：通过；`git diff --check`：通过。
- ESLint 与阶段起点 `27aed18a1` 比较：已有修改文件无新增诊断；新增模块及测试无诊断。仓库原有 lint 错误仍存在，未报告为全仓 lint 通过。

测试覆盖来源幂等、revision、旧原文留存、多来源依赖、环、序列化、导入缺失证据、变更中的 await、快速 swipe 往返、并发 capture、分支、reload、FloorState 提交 guard，以及真实 vector-index 模块的迟到结果过滤和 hash 删除（HTTP 使用 mock）。

### 2026-09-16 Web 运行验证补充

在实现提交 `e0250e2d22a0e1a3e6aba0dd0d5df4635d0f8ad5` 上启动独立临时 dataRoot/config 的 Luker 2.7.0 实例，使用 Node 24.16.0、Playwright 和系统 Edge 153.0.4234.32（headless，1280×900）。未复制日常聊天或模型凭据，未修改日常配置。新增可重复脚本 `tests/frontend/memory-os-source.smoke.mjs`，显式传入隔离服务器 URL 和可选浏览器 channel；脚本会创建测试角色并修改该测试实例设置，不应针对日常实例运行。

实际执行 `node tests/frontend/memory-os-source.smoke.mjs http://127.0.0.1:18742 msedge`，最终九项检查通过：公开 Memory API 写入、来源 ID 与 Episode 持久化、真实 UI 编辑后失效、旧原文留存、迟到会话拒绝且不泄漏节点、刷新后重新选择聊天保持来源身份与失效、新会话捕获新 revision、关闭开关不复活旧证据、无 pageerror。扩展通过正常启动注册，未替换服务端 state API；创建记忆使用公开 API，不能算作真实 LLM 抽取验收。早期探测显示刷新回到欢迎页，需要重新选择目标角色才能检验聊天持久化；脚本已明确等待目标聊天。

控制台存在未配置 Stable Diffusion 服务导致的请求 500 / SD WebUI 错误，不属于本次来源链失败；“无 pageerror”不表示所有控制台与网络请求无错误。默认 Playwright Chromium 缺失，使用系统 Edge 验证；未下载浏览器或增加依赖。新脚本 `node --check` 与 `git diff --check` 通过。本轮仅增加 smoke 与记录，未重跑上文的 1843 项单元测试。

仍需验收：真实模型普通生成与抽取、swipe/regenerate、历史用户/assistant 楼层编辑与删楼、跨聊天切换中的请求、Agent 编排全链路、断网恢复、Android。当前环境未发现可用 adb 命令，独立实例未配置真实模型；本次未覆盖这些项目。完成这些 Phase 2 门槛后，再进入原方案 Phase 3 Atomic Facts；不要跳过来源验收直接做图 UI。

修改文件：`source-provenance.js`、`source-lifecycle.js`、`main.js`、`api.js`、`read-api.js`、`graph-ops.js`、`persistence.js`、`vector-index.js`（均在 memory-graph 扩展下），`public/scripts/floor-state.js`，三个 source 测试及 FloorState instance 测试，以及本记录、原方案进度链接和 `AI_HANDOFF.md`。
