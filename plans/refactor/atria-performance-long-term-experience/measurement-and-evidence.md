# Atria 性能与长期体验 — P0 基线、证据和指标

- 开始执行的顺序、夹具和 Gate 见 [implementation-roadmap.md](implementation-roadmap.md) 的 E0/E7。

## Responsibility

跨模块冻结原则及阶段路由以 [index.md](index.md) 为唯一权威。

## Scope

- 区分“源码确认的代码路径”“风险推断”“实测性能问题”；性能实测前不杜撰数字。
- 本轮优先 CachyOS、Windows、Android Termux 三端的本地 Node 服务 + 浏览器，以及 FS/SQLite 在各端冷/热启动、长会话、记忆检索、运行恢复等方面的成本；APK/远程部署仅存历史静态证据。
- 以真实用户体验为目标，以可重复的性能画像与持久化不变量约束后续优化。
- 当前为企划调研，不修改正在开发的 `feat/agent-compute-runtime` 产品代码。

## 静态审计基线（2026-10-13）

- 仓库：`ZZZdragondYNGPHX/Atria`
- 源码基线：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；同期 `main@3ee1332ef113d4c57c65d9577222ba88d5171101`。
- 当时的分支比较：领先 104 commits，改动 233 files（仅审计时状态，持续开发后可能变化）。
- 远端只读文件树与重点实现审计；
- 源码静态数量：`public/index.html` 约 796KB，`public/script.js` 约 906KB；原始源码体积不代表网络传输体积、运行内存或真实首屏耗时。

## E0 轻量预审补充（2026-10-13；尚非正式 E0）

本节为对同一源码快照的**进一步远端静态核查**，没有真实 P50/P95、Node CPU Profiler、Android/Termux 实机、进程/断电注入或跨版本兼容性结果。既有 E0/E1/E2 优先级仍为 S2 持久化安全和长会话正确性/流畅度；不应因「混合内核」研究推迟这些主链任务。

| 范围 | 可核实的源码事实 | 待证结论/实施建议 |
| --- | --- | --- |
| 服务器运行时 | [`main:package.json`](https://github.com/ZZZdragondYNGPHX/Atria/blob/3ee1332ef113d4c57c65d9577222ba88d5171101/package.json) 声明 `engines.node >=20`，`@types/node ^18.19.84`，使用 Express 4、Webpack 5 和 `better-sqlite3`。 ||
| Android 内嵌 Node | [`fetch-nodejs-mobile.mjs`](https://github.com/ZZZdragondYNGPHX/Atria/blob/3ee1332ef113d4c57c65d9577222ba88d5171101/android-app/scripts/fetch-nodejs-mobile.mjs) 默认要求 Node major >=24，但允许配置覆盖；APK 仍由 Node.js Mobile + Android WebView 组成。 | 编译规则不等于实际 APK 二进制版本。记录 `libnode.so`/V8、ABI、WebView Provider 的**实际运行版本**，再判定升级和兼容矩阵。 |
| 桌面与隔离脚本 | [`src/electron/package.json`](https://github.com/ZZZdragondYNGPHX/Atria/blob/3ee1332ef113d4c57c65d9577222ba88d5171101/src/electron/package.json) 声明 `electron ^41.1.1`；[`package-computation.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/3ee1332ef113d4c57c65d9577222ba88d5171101/src/native/package-computation.js) 使用 QuickJS、独立 Context、堆/栈/时间限额。 | 桌面发行实际 Electron 版本及 QuickJS 兼容需分别查；**保留既有脚本隔离边界**，不因换计算语言而给予 Package 任意宿主权限。 |
| 前端长会话与 Snapshot | [`play-product.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-product.js) 的节点全集协调和 [`session-snapshot.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-snapshot.js) 的全量历史依赖仍存在，已有 Range API 不能说明消费者完成窗口化。 | 首选 Range/增量数据结构/正文虚拟窗口与生命周期，单纯 Node 升级或 Rust/WASM **不会自动消除 DOM/全量访问成本**。 |
| FS/SQLite S2 | [`fs-engine.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/3ee1332ef113d4c57c65d9577222ba88d5171101/src/storage/engines/fs-engine.js) 的 `withTransaction` 是回调包装，不能据此推断跨文件原子性；[`sqlite-engine.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine.js) 使用 WAL + synchronous=NORMAL。 | E1 S2 commit/root/依赖屏障优先；|
| 记忆 CPU 候选 | [`hybrid-retrieval.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js) 的 `rankMemory` 仍会按查询建立词袋/DF 和关系邻接；[`index-reuse.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/index-reuse.js) 已有有界来源语料复用，不是完整排名索引复用。 ||
| Android Bundle || 是已证实清单契约差异，但**未复现实机 fallback/启动时延**；|

**E0 候选比较及 Gate（不新增阶段，不预先冻结引擎选型）**

1. **版本基线**：Node 24 LTS 优先作为 CachyOS、Windows、Termux 三端的受支持基线候选；记录三端实际 Node/V8、`@types/node`、`better-sqlite3` 编译和原生加载的成败；APK 内嵌 Node/WebView、Electron 与远程部署不属于本轮 Gate，不把 package 声明当成实装版本。
2. **计算卸载顺序**：同设备同语料同输出，先比较原始 JS 热点 vs 增量索引后的 JS，再测 Worker Threads / Web Worker（限适用宿主）；只有**增量优化后依然显著 CPU 密集**，才加 Rust/WASM 试验。测量 CPU P50/P95、事件循环/主线程阻塞、峰值内存、Worker 启停与跨线程复制、WASM 初始化及打包体积、冷/热启动与设备差异。
3. **正确性硬约束**：权限/Information Grant/SourceProof/Revision/Branch/Epoch、已确认 S2 提交与故障恢复、精确 Token 收口、RP/Project 质量基线不得弱化；
4. **决策**：如果 Worker/Rust/WASM 没有可复现的整体净收益（含序列化/启动/集成维护成本），保持 Node/V8 + QuickJS 现有执行划分。实验失败不是要求重构底层；不得声称已经测得加速百分比、S2 合格或 APK 真机通过。

## 候选热点：直接代码证据与待证假设

| ID | 代码证据 | 风险假设 | 首要测量 |
| --- | --- | --- | --- |
| H1 — Native Play 长聊天 |初建节点还对 Timeline `find`| 大量历史消息导致 DOM 规模、重复查找与渲染工作量增加；可能影响输入/流式显示 | 100/1k/5k/候选20k 消息：初次打开、增量新消息、P95 输入/切换耗时、主线程长任务、DOM 数、Heap |
| H2 — Native Session 全量快照 ||| Snapshot 各阶段计时、资源读取次数、Session 长度与成本关系 |
| H3 — 已有 Range API / 全量调用边界 | [`src/native/repositories/session-repo.js` L308-L348](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L308-L348) 已有范围读取；| 消费者可能只需窗口但仍触发全量负载；| 全量调用方清单、范围读取适用边界、部分读取正确性 |
| H4 — 默认 FS 同步扫描 | [`src/storage/engines/fs-engine-transaction.js` L759-L863](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/fs-engine-transaction.js#L759-L863) 使用 `readdirSync`、`readFileSync`、`JSON.parse` 扫描 Native 资源 | Native 资源积累后可能阻塞 Node 事件循环、抬高尾延迟 | FS vs SQLite，按 kind 文件规模、事件循环延迟、CPU、扫描频率 |
| H5 — 混合记忆检索 | [`public/scripts/agents/memory/hybrid-retrieval.js` L115-L269](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/hybrid-retrieval.js#L115-L269) 查询中遍历语料、构造词袋/图邻接和候选排序 | 语料增长时重复计算/临时对象分配扩大 | 召回 P95、Peak Heap、建立/增量更新索引成本、召回准确率与来源追溯 |
| H6 — 初始资源与启动 | [`public/index.html`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/index.html) 静态 UI 与样式较多；[`public/init.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/init.js) 并发导入模块图 | 首屏关键路径可能含可推迟工作；但已有延迟加载，不能一刀切 | 启动阶段 Profile、Resource Timing、首屏可交互与 APP_READY |
| H7 — Android 启动及恢复 | [`AtriaRuntimeManager.kt`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/AtriaRuntimeManager.kt) 预构建 Bundle 依赖和运行时管理 | 预构建缺失可能运行时编译；后台进程回收影响会话恢复 | APK 与 Termux 分开：冷/热启、前后台切换、中断后正确恢复 |

### 已具备的可复用基础

- [启动里程碑与诊断](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/client-startup-telemetry.test.js)；
- [有界 Chat Snapshot Cache](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/atri-chat-snapshot-cache.js)；
- [Native Frontend 帧调度与组件虚拟列表](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/frontend/runtime.js)（不代表 Native Play 聊天已经虚拟化）；
- [FS 聊天范围读取与补丁恢复日志](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/fs-chat-range.js)；
- [世界书/记忆基准](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/performance/worldbook-performance-bench.mjs) 与 [移动视口烟雾测试](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/frontend/memory-os-performance.smoke.mjs)（后者并非 Android 真机）；
- [FS/SQLite/MySQL/PostgreSQL 存储说明](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/README.md)，审计版本默认 FS；

## 持久化安全三层边界（S2 目标已冻结；S3 另行讨论）

1. **S1 — 应用进程崩溃**：向用户报告“已完成/已保存”的提交，其 Revision、关联状态及必要资源在单进程突然退出与重新启动后保持一致；未完成的提交不得表现为部分成功或重复执行。
2. **S2 — 操作系统崩溃/突然断电**：要尽量保住所有已确认的提交，需要更强的存储落盘策略，并在各引擎和平台分别证明；不以 S1 的测试通过充当 S2 证据。
3. 是否纳入这一轮增强仍待讨论。

**已确认的引擎事实**：[`src/storage/engines/sqlite-engine.js` L31-L35](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine.js#L31-L35) 当前使用 SQLite `journal_mode=WAL` + `synchronous=NORMAL`。依据 [SQLite 官方 PRAGMA 文档](https://www.sqlite.org/pragma.html)，此配置可保持一致性并抵御应用进程崩溃，但操作系统崩溃或断电后，最近已提交事务仍有可能回滚；WAL + `synchronous=FULL` 会增加每次提交的落盘同步，提高断电持久性并带来性能成本。

不要因为存在 write-file-atomic 就直接认定无断电丢失风险。

**现行决定**：正式核心数据以 S2 为目标，缓存和可重建索引不必同级；实际承诺须以各引擎/设备的故障注入证据为前提，S3 单独考虑备份/设备损坏恢复。dev 期旧版本数据兼容与迁移不纳入目标。

## 观测口径

1. **交互**：用户操作到响应的 P50/P95、长任务、帧卡顿、动态高度正文滚动锚定、文本选择与光标稳定性。
2. **启动**：进程→服务就绪、网页→首次可交互、APP_READY 的阶段耗时，区分下载、解析、执行、布局与存储加载。
4. **数据安全**：已确认提交的 Revision/SavePoint 及所有引用资产必须可还原；中断/恢复/重试/清理不静默丢数据、不重复提交、不破坏分支和世界状态权威。
6. **长期稳定**：Node event loop delay、RSS/Heap、客户端 Heap、GC、文件句柄、磁盘文件数/大小，关注增长曲线和 dispose 后回落。

## 外部调研参考（不是 Atria 实测证据）

- [web.dev — INP](https://web.dev/articles/inp)：用户交互延迟。
- [web.dev — Virtualize long lists](https://web.dev/articles/virtualize-long-lists-react-window)：列表窗口化；Atria 动态高度内容不应直接照搬固定行高。
- [Node.js — Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)：同步 IO 对并发响应的影响。
- [SQLite FTS5](https://sqlite.org/fts5.html)：全文索引功能与维护成本。
- [Android — Process lifecycle](https://developer.android.com/guide/components/activities/process-lifecycle)：后台进程被系统回收的现实边界。

## 初期讨论议题（历史记录；当前落实以总纲与 E0 为准）

下列早期问题当前由 E0 夹具及后续 Gates 实测具体取舍：

- 长篇 RP 的 **正式目标负载** 与 **极限压测** 是否分开？如 5k 条作为目标、20k 作为极限而非承诺。
- 认定保存成功后发生进程崩溃，是否应以“最后已确认提交不丢失、不重复”为硬性安全要求？哪些未确认中的动作应明确允许重试？
- 平台间如何区分同样的数据正确性底线与不同设备的性能预算？

## Material design changes

- 2026-10-13：新增 P0 模块；建立源码证据、假设、规模样本与可恢复性讨论入口。

## 第 4 轮边界补充

- 用户确认 Atria 尚未对外发布：dev 版允许直接弃用旧数据格式，不以历史兼容和迁移成本约束架构评估；性能比较可使用新架构基线与新数据集。
- 这不削弱新版本 **S2** 目标：在同一受支持数据格式/版本下，被系统明确确认提交的核心资料必须按契约完成持久化与恢复。
- **2026-10-13 / 第十六轮总审**：明示 P0 尚未形成实际性能基线，历史第二轮的 S2 待决文字归入已解决的方案史；本模块不将未来 E0 的测试数值与设备能力预先写成事实，原始证据由 E0/E7 阶段记录产生。
- **2026-10-13 / 三端范围调整**：E0/E7 限定 CachyOS、Windows、Android Termux 三种本地 Node + 浏览器主平台；
