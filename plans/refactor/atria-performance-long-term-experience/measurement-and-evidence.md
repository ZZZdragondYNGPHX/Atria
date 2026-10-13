# Atria 性能与长期体验 — P0 基线、证据和指标

## Responsibility

本模块负责 P0 的静态审计证据、验证假设、观测指标、负载样本及后续阶段依赖的测量产物。跨模块冻结原则及阶段路由以 [index.md](index.md) 为唯一权威。

## Scope

- 区分“源码确认的代码路径”“风险推断”“实测性能问题”；性能实测前不杜撰数字。
- 浏览器、Node 服务端、Linux、Android APK、Termux，以及 FS/SQLite 后端在冷/热启动、长会话、记忆检索、运行恢复等方面的成本。
- 以真实用户体验为目标，以可重复的性能画像与持久化不变量约束后续优化。
- 当前为企划调研，不修改正在开发的 `feat/agent-compute-runtime` 产品代码。

## 静态审计基线（2026-10-13）

- 仓库：`ZZZdragondYNGPHX/Atria`
- 源码基线：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；同期 `main@3ee1332ef113d4c57c65d9577222ba88d5171101`。
- 当时的分支比较：领先 104 commits，改动 233 files（仅审计时状态，持续开发后可能变化）。
- 远端只读文件树与重点实现审计；**未执行**本地/CI Benchmark、浏览器性能测试、APK/Termux 真机测量、长时间 soak test。
- 源码静态数量：`public/index.html` 约 796KB，`public/script.js` 约 906KB；原始源码体积不代表网络传输体积、运行内存或真实首屏耗时。

## 候选热点：直接代码证据与待证假设

| ID | 代码证据 | 风险假设 | 首要测量 |
| --- | --- | --- | --- |
| H1 — Native Play 长聊天 | [`public/scripts/native/play-product.js` L260-L300](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-product.js#L260-L300) 对消息节点全集进行查询/协调，并在循环内过滤区块、检查附件；初建节点还对 Timeline `find` | 大量历史消息导致 DOM 规模、重复查找与渲染工作量增加；可能影响输入/流式显示 | 100/1k/5k/候选20k 消息：初次打开、增量新消息、P95 输入/切换耗时、主线程长任务、DOM 数、Heap |
| H2 — Native Session 全量快照 | [`src/native/session-snapshot.js` L22-L135](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-snapshot.js#L22-L135) 遍历 State、Timeline Entry、Variant 并检验 | 多分支/多变体/多轮次增长后，全量读取和校验可能成为热线 | Snapshot 各阶段计时、资源读取次数、Session 长度与成本关系 |
| H3 — 已有 Range API / 全量调用边界 | [`src/native/repositories/session-repo.js` L308-L348](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L308-L348) 已有范围读取；[SessionCore.load](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-core.js#L190-L241) 执行全量快照 + 领域校验 | 消费者可能只需窗口但仍触发全量负载；不能通过关闭验证换速度 | 全量调用方清单、范围读取适用边界、部分读取正确性 |
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
- [FS/SQLite/MySQL/PostgreSQL 存储说明](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/README.md)，审计版本默认 FS；dev 期允许直接替换并废弃旧数据格式，**不设跨版本迁移验收要求**，但仍应测量新格式的 S2 正确性。

## P0 负载族（候选，不是冻结验收门槛）

| 负载族 | 讨论候选规模 / 场景 | 观测 |
| --- | --- | --- |
| 即时体验 | 空项目、100 条消息；日常设置 | 冷/热启动、可交互时间、输入与切换 P50/P95 |
| 长会话 | 1k、5k，20k 仅作为可选极限档 | 首次打开、尾部生成、回滚历史、滚动跳跃、DOM 和 JS Heap |
| 历史复杂性 | 多 Branch/Variant/SavePoint、较深 Revision 链 | 读写、GC、恢复和完整性 |
| 知识与记忆 | 500/3k/10k 条等效可溯源事实、关系/世界书条目 | 检索/编译延迟、召回质量、CPU/内存 |
| 长时间运行 | 数小时连续生成、切换、关闭/打开、异常进程退出 | 内存回落、资源句柄、数据增长、恢复 |
| 环境 | Linux + Node + 浏览器；Android APK；Termux | 分环境性能预算；模拟器/移动视口不等于真机 |

数字仅是实验采样点，尚无“支持 N 条会话”的承诺。每次基准均需记录 CPU/内存、浏览器/WebView/Node 版本、存储引擎、缓存冷/热状态、资产规模与网络条件。

## 持久化安全的三层边界（第 2 轮待决）

不能把“重启后没丢”“断电后没丢”和“磁盘损坏后能恢复”混成一个验收数字：

1. **S1 — 应用进程崩溃**：向用户报告“已完成/已保存”的提交，其 Revision、关联状态及必要资源在单进程突然退出与重新启动后保持一致；未完成的提交不得表现为部分成功或重复执行。
2. **S2 — 操作系统崩溃/突然断电**：要尽量保住所有已确认的提交，需要更强的存储落盘策略，并在各引擎和平台分别证明；不以 S1 的测试通过充当 S2 证据。
3. **S3 — 磁盘损坏/整机丢失**：不是本地事务本身可保证，需要独立的备份版本、恢复策略与校验；是否纳入这一轮增强仍待讨论。

**已确认的引擎事实**：[`src/storage/engines/sqlite-engine.js` L31-L35](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine.js#L31-L35) 当前使用 SQLite `journal_mode=WAL` + `synchronous=NORMAL`。依据 [SQLite 官方 PRAGMA 文档](https://www.sqlite.org/pragma.html)，此配置可保持一致性并抵御应用进程崩溃，但操作系统崩溃或断电后，最近已提交事务仍有可能回滚；WAL + `synchronous=FULL` 会增加每次提交的落盘同步，提高断电持久性并带来性能成本。

**仍未验证的引擎事实**：FS 的原子写入是否在各平台、各资源/提交路径拥有足以覆盖 S2 的完整 fsync/目录持久化屏障；不要因为存在 write-file-atomic 就直接认定无断电丢失风险。

**现行决定**：正式核心数据以 S2 为目标，缓存和可重建索引不必同级；实际承诺须以各引擎/设备的故障注入证据为前提，S3 单独考虑备份/设备损坏恢复。dev 期旧版本数据兼容与迁移不纳入目标。

## 观测口径

1. **交互**：用户操作到响应的 P50/P95、长任务、帧卡顿、动态高度正文滚动锚定、文本选择与光标稳定性。
2. **启动**：进程→服务就绪、网页→首次可交互、APP_READY 的阶段耗时，区分下载、解析、执行、布局与存储加载。
3. **Native Runtime**：Session/Revision 读取、State/Timeline 校验、写入提交、跨存储操作的阶段成本与执行次数。
4. **数据安全**：已确认提交的 Revision/SavePoint 及所有引用资产必须可还原；中断/恢复/重试/清理不静默丢数据、不重复提交、不破坏分支和世界状态权威。
5. **AI 语义**：记忆来源、时间有效性、角色知情边界、检索覆盖率与成本共同衡量，不靠关闭正确性检查或无差别裁剪换性能。
6. **长期稳定**：Node event loop delay、RSS/Heap、客户端 Heap、GC、文件句柄、磁盘文件数/大小，关注增长曲线和 dispose 后回落。

## 验收设计与边界

- 生产实际路径（Native Play + Native Session）优先；单元 Fixture 是早期诊断，不足以证明完整 UX。
- 保留**当前受支持格式**的快照、事务/CAS、SourceRef、Checkpoint、存档和垃圾回收安全不变量；新开发版本可硬切换存储 schema，不要求兼容旧 dev 数据、历史迁移或双读双写。
- 同设备同数据前后对照，报告 P50/P95、样本量、冷/热条件及回归。
- 检查只覆盖实际修改部分与必要安全不变量，不以全项目构建/全平台矩阵作为每个小修改的默认门槛。
- 需 Android 真机验证时才给出真机结论；没有就写待验证。
- 具体绝对耗时、存储规模、最长会话和可容忍回归数值由后续讨论确定；目前不应伪造量化目标。

## 外部调研参考（不是 Atria 实测证据）

- [web.dev — INP](https://web.dev/articles/inp)：用户交互延迟。
- [web.dev — Virtualize long lists](https://web.dev/articles/virtualize-long-lists-react-window)：列表窗口化；Atria 动态高度内容不应直接照搬固定行高。
- [Node.js — Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)：同步 IO 对并发响应的影响。
- [SQLite FTS5](https://sqlite.org/fts5.html)：全文索引功能与维护成本。
- [Chrome DevTools — Memory problems](https://developer.chrome.com/docs/devtools/memory-problems)：分配和泄漏检查。
- [Android — Process lifecycle](https://developer.android.com/guide/components/activities/process-lifecycle)：后台进程被系统回收的现实边界。

## 第 2 轮讨论议题

由用户确认的方向 C 与高权重原则以 [index.md](index.md) 为准。本轮待讨论：

- 长篇 RP 的 **正式目标负载** 与 **极限压测** 是否分开？如 5k 条作为目标、20k 作为极限而非承诺。
- 认定保存成功后发生进程崩溃，是否应以“最后已确认提交不丢失、不重复”为硬性安全要求？哪些未确认中的动作应明确允许重试？
- 平台间如何区分同样的数据正确性底线与不同设备的性能预算？

## Material design changes

- 2026-10-13：新增 P0 模块；建立源码证据、假设、规模样本与可恢复性讨论入口。

## 第 4 轮边界补充

- 用户确认 Atria 尚未对外发布：dev 版允许直接弃用旧数据格式，不以历史兼容和迁移成本约束架构评估；性能比较可使用新架构基线与新数据集。
- 这不削弱新版本 **S2** 目标：在同一受支持数据格式/版本下，被系统明确确认提交的核心资料必须按契约完成持久化与恢复。
