# Atria 性能与长期体验 — P5 缓存、后台维护与长时间稳定性

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第十轮讨论模块，**技术组合与阈值尚未批准**。
- **设计入口**：[index.md](index.md)；P1 玩家交互见 [client-interaction.md](client-interaction.md)，P2 S2/历史可达性和存储提交见 [runtime-storage.md](runtime-storage.md)，P0 测量口径见 [measurement-and-evidence.md](measurement-and-evidence.md)。
- **审计源码快照**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`。设计实施时先对实际已集成的 `main` 复核；本轮只有静态审计与文档，不代表已运行 Soak Test、性能基准或 Android 真机。
- **范围**：新版本无旧数据兼容，不能通过持久缓存旧格式和双写增加长期技术债。任何资源预算不得削弱已经冻结的 S2 提交、无损历史和铁人终局只读档案保护。

## Responsibility

针对 Atria 长期使用时的交互尾延迟、浏览器/Node/Android 内存驻留、缓存生命周期、后台 Compression/GC/SQLite WAL checkpoint/索引重建、进程低内存与崩溃恢复，建立**不抢占用户输入、剧情生成和 S2 提交**的统一资源管理策略。功能优化先经过 P0 可重复归因，不基于源码体积直接宣称故障。

## 第十轮核心源码证据（待实测）

| 风险/已有基础 | 直接代码证据 | 初步假设与防误判 |
| --- | --- | --- |
| Play 全消息协调 | [`public/scripts/native/play-product.js` L220-L298](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-product.js#L220-L298) 每次 render 遍历 `entries` 和全 DOM 消息节点；每 Entry 过滤 messageBlocks、检查/更新图片 | 会话增大时 DOM 和协同成本增长；尚未量化 FPS/P95。实现正文窗口化时必须适配动态高度、滚动锚、文字选择、图片高度与可访问性，不可直接复制固定行高列表 |
| Native Component 已有上限和销毁 | [`public/scripts/native/frontend/runtime.js` L209-L260](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/frontend/runtime.js#L209-L260) 与 [L509-L536](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/frontend/runtime.js#L509-L536) 有组件实例限额、销毁回调、节点数量上限、窗口化 keyed list | 可以复用其清理思想，但其固定 rowHeight 的虚拟表格不等同于 Native Play 的可变高度长篇正文 |
| 原生 TaskScheduler 已有优先级、背压 | [`src/native/task-scheduler.js` L9-L80](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/task-scheduler.js#L9-L80) 区分 turn_blocking/interactive/background/maintenance，concurrency/perResource/queueLimit/retention 均有限 | 必须复用或整合，不能另起一套平行调度器；已有优先级**不等于**所有 FS 扫描、DB checkpoint、Blob GC 已被纳入抢占/IO 预算，且任务运行中抢占须遵守中断安全 |
| 原生资产 GC 为同步遍历删除 | [`src/native/repositories/asset-store.js` L256-L287](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/asset-store.js#L256-L287) 读取 AssetRefs/PackageVersions，之后 `readdirSync/statSync/rmSync` 递归扫描磁盘目录 | 同步扫描/删除有事件循环阻塞与写入竞争风险，不能机械将 `async` 包装视为异步磁盘操作；缺乏已验证 P95 与真实故障数据 |
| Revision GC 进行可达遍历 | [`src/native/repositories/session-repo.js` L728-L756](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L728-L756)、[L868-L893](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L868-L893) 逐 Revision 与 Branch 依赖读取、遍历、标记，最后删除未到达修订 | 下一代共享段需将铁人只读终局 Root、自动/手动 SavePoint、在途提交、导出任务和读取者生命周期都列入保护根；标记时仅一瞬间可达不代表可并发安全删除 |
| Checkpoint 清理存在扫描/序列化 | [`src/native/model-prompt-runtime/runtime-checkpoint-store.js` L70-L99](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/model-prompt-runtime/runtime-checkpoint-store.js#L70-L99) 保存时先 list 所有 Checkpoint，排序并 `JSON.stringify` 计量以淘汰 | 已有 Count/TTL/Byte 上限，应优先测频率与扫描放大，未来可能引入增量账目/索引；不可废止 Checkpoint 合法引用并静默丢失未完成事务 |
| MemoryOS 账本缓存与重复计算 | [`public/scripts/agents/memory/source-lifecycle.js` L97-L122](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/source-lifecycle.js#L97-L122)、[L151-L221](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/agents/memory/source-lifecycle.js#L151-L221) 按 Scope 缓存与 pending/epochs，更新时多次 JSON 序列化与 Clone | 必须区分**权威持久来源**与**可重建缓存**，评估 Scope 生命周期、Map 清理、堆增长及重复计算；不许以清空来源和降低检索准确率来换性能 |
| Chat 快照已有有界缓存 | [`public/scripts/atri-chat-snapshot-cache.js` L1-L71](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/atri-chat-snapshot-cache.js#L1-L71) 保持活动目标和至多一份非活动快照 | 不要重复建设单独的全局聊天缓存；优先保证其它新缓存都有正确的可见性、生命周期与内存上限 |
| 现有移动端测试不等于真机 | [`tests/frontend/memory-os-performance.smoke.mjs` L1-L48](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/frontend/memory-os-performance.smoke.mjs#L1-L48) 明确使用 Chromium 移动视口、CPU 限速与真实 Worker，但不是 Android APK | 可以用于相应热路径回归，无法证明 Node.js Mobile/WebView/Android 的后台管理和系统回收行为 |

## 第十轮架构候选（**未批准**）

| 方案 | 内存/缓存与维护策略 | 优点 | 风险 |
| --- | --- | --- | --- |
| A — 简单固定上限 | 所有缓存设置固定条目上限和定时清理；定期同步 GC | 快速落地、简单 | 数据大小差异大、定时执行与用户操作撞车、同步大任务阻塞 |
| B — 完全手动维护 | 仅显式点击「清理/压缩」，运行中尽量不执行 GC | 降低前台意外卡顿 | 文件与 WAL 不断增长、长期运行退化和存储配额风险 |
| **C — 前台优先的预算化后台维护（推荐）** | 分层缓存、按资源压力自适应预算，维护按优先级/分批/可中断边界执行，重启可续；持久对象只靠 S2 根与引用判断 | 与 S2/无损历史/多平台/长会话目标相容，并可扩展到 Android 生命周期 | 需要统一测量口径、避免重复调度器和复杂度膨胀 |

### 1. 三层缓存，缓存失效不等于核心数据删除

**热层**（交互关键路径）：
- 正在阅读的消息窗口、编辑器/选区、活动分支的界面投影及必须即时使用的上下文。使用上限基于**实际字节预算和对象数**，非仅条目数。滚动超出窗口可以解除渲染资源，但原文仍通过 TimelineIndex 取回。
- 当前正在生成的 Draft、S2 提交尚未确认的依赖不属于随意可驱逐缓存；低内存只能暂停/拒绝新工作、显示状态，不能假称已保存。

**温层**（短期可快速复用）：
- 最近访问的 Revision/Branch 物化投影、已校验的消息片段、小范围检索/媒体缩略图、最近使用的知识索引页；可以使用权威 `RevisionRoot + generation` 确认缓存有效性。
- 内存压力上升先缩温层/释放图片与索引副本，再调整热层窗口。对象释放时必须清理定时器、观察器、监听器、Worker、Blob URL 与其他外部句柄。

**冷层**（持久权威 + 按需读取）：
- 不可变无损压缩历史段、世界 State/Revision/Branch/SavePoint/只读终局史、原始附件及可重建的低频索引。每个对象遵守内容引用/完整性；冷层**不是**内存常驻。对于冷读取的缓存，历史浏览、全文搜索与模型上下文编译必须受分页/并发/取消保护。
- Context/Memory 的派生摘要可按成本淘汰，不能删改权威历史和可溯源原始事实。

### 2. 前台优先、后台可让出的预算调度

- **D0 不可延后**：正在进行的 S2 提交、不可变根/目录耐久屏障与故障确认；它们有原子性和安全约束，不能为了 UI 帧率取消到危险的半提交状态；必要时前台显示提交中或限流。
- **D1 交互/即时生产**：文本输入、滚动、分页、Branch/SavePoint 切换、流式显示与主动请求所需的模型/检索/资源读取。
- **D2 弹性预取**：临近阅读窗口、少量可见资源及即将需要的索引，按用户活动动态限流、可以取消。
- **D3 后台维护**：段封存、冷区无损压缩、构建派生检索索引、可达性 GC、SQLite WAL checkpoint/回收；抢占 D1 时暂停下一批，严重资源压力时进入限速维护状态。
- **不新建与 NativeTaskScheduler 并行的另一套任务系统**：在既有分级与资源锁边界上加入维护资源预算/前台感知和中断安全。只能在安全边界取消维护，不能强行打断数据库事务、Segment 发布或一半 GC 文件删除。
- **配额测量**：为 CPU 时间片、Node 事件循环延迟、I/O 同步延迟、内存/磁盘水位、活跃任务数设置设备环境相关预算；百分位延迟和可交互体验优先于一次性 GC 吞吐。建议用 `monitorEventLoopDelay` 与 `eventLoopUtilization`，且区分线程级阻塞和纯 CPU 使用率。
- **Node 真正非阻塞**：现有 FS `readdirSync`/`rmSync` 与 better-sqlite3 同步查询不能靠 `async` 函数声明变成非阻塞；需评估批量异步 fs、受控 Worker / 独立 DB 连接及队列。多连接/Worker 必须保证 WAL/共享 Blob/RunControl 的提交与锁语义。
- **后台计划不能饿死**：若长期有连续生成，分配小的、可中断的安全工作片；当空间逼近上限无法推进，应显示明确维护/容量状态，而不是静默清掉已提交历史。

### 3. GC 安全调度与分段归档协议

1. 在稳定 **generation** 下获取保留根集合：有效 Session HEAD、所有现有 Branch/Revision/手动 SavePoint、仍需要的自动 SavePoint、只读铁人终局史、World/Package/Knowledge 依赖、当前读者/导出/在途提交的租约与资源引用。
2. **Mark**：遍历不可变 RevisionRoot、TimelineIndex/Segment、State/Blob 及跨分支共享对象；批量可中断，保留进度/根版本。读取者切换和新提交发生时旧标记不能自动视为最新真相。
3. **Quarantine/待清理**：候选对象先登记为待回收，设置受控宽限，不直接同步扫描后立即 `rmSync`。新 Segment 的物理映射必须先可校验、可 durable 后，旧段才可能转入隔离期。
4. **Revalidate & Sweep**：在发布屏障和引用校验下重新检查所有保护根与并发租约，按受限批次删除；失败后幂等继续，取消/重启不会把一半 GC 当作成功。
5. **空间回收分离**：逻辑删除、FS Blob 删除、SQLite WAL checkpoint、DB 文件回收是不同工作流。对活跃长读事务引起的 WAL 增长应观测与缓解，不能强制 checkpoint 导致交互尖峰或缩短 S2 保证。
6. **终局无损**：铁人死亡后只读原始历史是新的受保护根；`terminal` 状态阻止重新进入游戏，但不能被「死亡」本身作为无授权删除完整历史的理由。玩家主动整个 Session/终局档案永久删除是独立管理动作。

### 4. Android / Termux / 桌面

- Android APK WebView 与嵌入式 Node.js 处于不同生命周期与资源压力边界；检查 Activity/Service 的 `onTrimMemory`、前后台迁移、进程回收后是否只根据已确认 S2 HEAD 恢复。Android 的低内存信号**优先回收可重建缓存与大图片/Worker**，绝不能删除运行中的持久承诺。
- Android 标准的 `TRIM_MEMORY_UI_HIDDEN`/后台压力等级可用于降低 UI 资源驻留；不应强行 `global.gc()` 代替正确的引用释放。实际整机 WebView + Node 合计内存必须在 APK 真机验证。
- Termux 运行不同于 APK 的 Node.js Mobile，同样代码不意味着相同资源压力行为；与 Linux 桌面浏览器分开采样。Android 后台限制/前台服务规则由当前实际 SDK/平台验证，不以 UI 模拟器声明真机结论。
- 低电量/高温/后台时允许暂停**可选维护**，但不能撤销已向用户确认的 S2 持久化结果。磁盘接近耗尽时必须明确报告存储失败，不靠自动删旧剧情换空间。

### 5. P0/P5 测量场景（样本，不是冻结门槛）

| 场景 | 测量目标 |
| --- | --- |
| 100、1k、5k（可选 20k）条消息 | 输入/滚动/流式帧的 P50/P95、长任务次数、DOM/Detached Nodes、切换历史窗口后内存回落 |
| 数十/数百 Branch + SavePoint + 资产 | 切换与搜索尾延迟、温层命中率、堆/RSS、导出/读档性能 |
| 周期重复进入/退出 Session/Stage、开/关图文/媒体 | 前后 Heap Snapshot、未释放 Listener/Worker/Timer/Blob URL、资源清理 |
| 连续数小时会话 + 背景 Memory/Index/GC | 按时间的 JS Heap/RSS、事件循环 Delay/ELU、GPU/图片驻留、响应尾延迟是否持续恶化 |
| 同时自动存档、生成和 GC/封存 | 前台响应、S2 提交回执、GC 不误删可达段，崩溃后根闭包一致 |
| SQLite 长读 + WAL 增长/Checkpoint | WAL 文件大小、checkpoint 能否推进、提交 P95、读者活跃时的限制策略 |
| Android 前后台切换/低内存和重启 | 只读终局档案完整性、WebView/Node 生存与恢复、缓存让出和误报 S2 验证 |

性能预算/缓存上限/每批删除量/GC 宽限期/是否需独立 Worker 均**待 P0 实测**。最小相关验证不自动升级为全量测试、所有平台 E2E 或无穷 soak。

## 第十轮建议选择

- **A：固定缓存上限 + 周期 GC**，简单但易周期性卡顿。
- **B：长期只人工维护**，延迟最可控却存在无限增长风险。
- **C：按压力有界的三层缓存 + 前台优先的统一预算调度 + 分批/可恢复/二次核验 GC**（**推荐，尚待用户决定**）。

需要明确的是：方案 C 不是要求引入新的调度框架、数据库或 Mux，优先复用 TaskScheduler 与 Native 的生命周期协议。正确性属于 S2 和无损历史的既定要求，不能作为「可以降低性能阈值」的借口。

## 外部技术依据

1. [web.dev：INP / 主线程长任务](https://web.dev/codelabs/understanding-inp) — 用户交互耗时包括输入排队、事件执行及渲染，并可用分段任务降低长尾。
2. [Chrome DevTools：排查内存问题](https://developer.chrome.com/docs/devtools/memory-problems) — Detached DOM 被 JS 引用时可能无法 GC，Heap Snapshot 可追踪长期资源残留。
3. [Node.js perf_hooks](https://nodejs.org/api/perf_hooks.html) — `monitorEventLoopDelay`、`performance.eventLoopUtilization` 用于观测 Node 主线程阻塞。
4. [SQLite WAL](https://www.sqlite.org/wal.html) — WAL Checkpoint 与长读事务相互制约，Checkpoint/读取/提交之间有性能权衡。
5. [Android ComponentCallbacks2](https://developer.android.com/reference/android/content/ComponentCallbacks2) — `onTrimMemory` 用于降低后台/界面隐藏时可释放资源驻留；并非自动证明进程不被杀。

## Material design changes

- 2026-10-13 / 第十轮：新增 P5 模块，把内存/缓存与后台任务统一化候选建立在已批准的 S2、不可变历史、存读档驱动、铁人终局只读根之上；确认源码已有 scheduler、缓存与清理机制，不能重复发明平行子系统。具体三层资源调度策略与阈值仍待本轮定案。
