# Atria 性能与长期体验优化 — 已冻结的 E0–E7 工程实施路线

- **Task ID**：`refactor/atria-performance-long-term-experience`
- **状态**：**Plan Frozen v1.0（第十六轮方案 C 已获用户批准）**；工程实施尚未开始，**方案批准不等于立即授权施工**。
- **冻结日期**：2026-10-13；**执行总量**：E0–E7 共 8 个工程阶段、30 个最小任务单元，具体真实工期与数值阈值不预先承诺。
- **企划总纲**：[index.md](index.md)（跨模块冻结决策的唯一权威）；本文件负责将 P0–P5 映射到可验证、可交接的实施单元，**不另起一套冲突的技术规范**。
- **审计日期**：2026-10-13。
- **当次源码参照**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`、`main@3ee1332ef113d4c57c65d9577222ba88d5171101`；本轮只读，未测真实 P50/P95，也未通过电源故障验证。
- **开始实施硬条件**：先结束当前 `feat/agent-compute-runtime` 并集成到稳定 `main`，核对最新 HEAD 后，且**用户明确授权进入实施**时，才从当时 `main` 创建独立临时 `refactor/atria-performance-long-term-experience`。此前只允许更新 `docs` 企划；不得因本方案已冻结就自行创建开发分支或修改产品代码。
- **后续修改规范**：只改受影响模块、只跑对应单元/关键边界验证、每个已完成小阶段/一组相关任务提交并推送；不默认长等 CI、全仓测试、Android 真机截图。确实需要设备断电/Android 日志/密钥/权限的验证应诚实标记“待设备证据”，不假称通过。阶段 Record 在正式开工时新建**一份**累计覆盖更新，避免每个阶段散落新交接文档。

## 总体结论：P0–P5 六域均有设计，但不是六个平行随便开发的分支

| 域 | 已批准且需落实的核心 | 当前尚不能称为已实现/已实测 | 施工位置 |
| --- | --- | --- | --- |
| **P0** 测量 | 长会话与数据安全高权重；定量证据而非源码推断；定向回归 | 无真实主平台性能基线、没有长时 Soak 或物理断电的 S2 证据；缺可比较的新旧数据集与权威指标 | E0，之后每个阶段做对应追加测量，E7 汇总 |
| **P1** Play/交互 | 长篇正文流畅、严格 Save/Load/Branch；移除单层 Swipe/Delete/Hide 及 Native 任意重试/重开捷径 | Native Play 尚未证明可变高度窗口化；隐藏旧 `#sheld` 仍服务生成 ABI，移除入口前要查消费者；读档/铁人终局新 UX 尚未实现 | E3（依赖 E1/E2 新存储和 S2 根契约） |
| **P2** 数据/存储 | 统一 S2 durable contract；增量不可变 Segment/Revision 共享，周期物化；自动存档/分支；原始历史默认无损 | FS 多文件提交与 SQLite WAL+FULL/外部 Blob 的断电原子证明尚缺；默认引擎未选、段/快照/存档/GC 阈值待测，旧 Chronicle History checkpoint 有损 | **E1/E2（最高正确性优先级）**，GC 由 E4 完成 |
| **P3** Memory/Agent | 来源证明驱动的增量索引、实时防全知授权、S2 Delta Overlay、Context Join、情境预算与 RP/Project 质量闸门 | cache identity 内部表示、索引水位/合并、Token 精确计数加速、模型实际缓存/费用收益未实测；M1 开发中不能直接重构 | E5（在 E1/E2 和 P5 生命周期契约稳定后） |
| **P4** 启动 | 独立 T0–T4，真实 PlayReady；关键路径裁剪；Android/Termux 资源预构建一致性 | Kotlin 预建 Bundle 清单 3 项 vs Node 5 项已证实代码不一致，但是否实际退回编译未复现；WebView `onPageFinished` 并非 PlayReady；冷热启真机 P95 未测 | E6（可将 Bundle Manifest 小修提前到 E0 后独立提交） |
| **P5** 资源稳定 | 热温冷缓存、Scope/Epoch 释放、前台优先统一调度；分批可恢复 GC；保留铁人只读档案 | 同步文件/DB 清理未证明全纳预算；Mark/Gc Roots/Quarantine/SQLite checkpoint 并发安全与小时级泄漏曲线未测 | E4（依赖 E2 的稳定共享根；生命周期基础可提前） |

**审计重要界限**：S2 只对当前受支持格式下已确认的游戏提交提供目标与证据要求；**不做旧 dev/SillyTavern 数据兼容、迁移、双读写或旧 API shim**。S3 磁盘损坏、设备丢失、云端备份不属于本次已经批准的 S2 契约，不把 S3 偷渡为阻塞里程碑；若要正式支持另立专项。

## 已冻结实施结构：8 个工程阶段、30 个最小任务单元（第十六轮方案 C）

**命名关系**：P0–P5 是六个“技术领域”，不是严格先后顺序；E0–E7 是给 Codex 的**工程执行阶段**。每阶段对应正式方案文档和相同一份 Record，不重复编一套治理流程。下面工作量只给工程复杂性等级，不虚构工期、代码行数或未来真实性能收益。

### E0 — 主线准入、再审计与 P0 最小基线（4 单元，复杂度中）

- **E0.1 合并门槛**：等待功能分支合入 `main`；记录真实 HEAD、运行环境、Node/Android 版本、FS/SQLite 当前能力；附带盘点 Node/V8、`engines`/`@types/node`、Android Node.js Mobile 实际二进制、Electron、WebView Provider 与 QuickJS 版本/原生模块 ABI。只读重核已失效的行号与依赖，不将 2026-10-13 的静态快照当最终产品。
- **E0.2 基准夹具**：在新格式下生成可重现的 100/1k/5k 对话与深分支、SavePoint/World/Knowledge/大 Memory/资产集；可选 20k 只作极限探索。不保留旧数据兼容器。
- **E0.3 独立指标**：启动 T0–T4、长聊天输入/流式/滚动 P50/P95、Node 事件循环、RangeRead/Commit/GC、内存稳态、召回质量、RPC/Token/费用、S1/S2 恢复区分；额外标出真实 CPU 热点及同步 I/O/全量 DOM/索引重算来源，记录客户端、Node、Android/Termux 的宿主差异。沿用现有遥测和测试夹具而非新建平行系统。
- **E0.4 决策基线**：生成问题清单、真实耗时排序、验收相对回归边界和 S2 故障注入试验计划；记录 Node 24 LTS 统一基线/Worker/Rust-WASM 作为**有条件技术候选**，仅指定 E5/E6 对照测试，不新增工程阶段或第二套状态权威。**没有 P0 证据时不冻结引擎选择、压缩块大小、缓存阈值或混合计算方案**。

**Gate E0**：新 `main` 源码与可复现 baseline/质量夹具可用；无实测项明确列为后续待证，而非伪造通过。

### E1 — 统一 S2 Durable Commit Contract 与引擎落盘（4 单元，复杂度极高）

- **E1.1 提交合同**：规范 `prepare → durable dependencies → publish root/commit receipt (CAS) → ACK`；`commitId/requestId` 幂等及断电后的确定恢复，确认时需要保护的 Blob、State、RevisionRoot 和 RunControl 状态集合。
- **E1.2 SQLite 参考引擎**：事务和持久性配置、覆盖 WAL+FULL 的实际 VFS 平台证明；索引式按键/范围查询；外部内容寻址 Blob 必须先 fsync 文件/目录再提交 DB Root，不能把 SQL COMMIT 等同全域 S2。
- **E1.3 FS 独立引擎**：多文件 prepare/manifest/journal/durable 发布与目录耐久屏障，不得继续用只有回调包装的 `withTransaction` 声称多资源 ACID；与 SQLite 满足同样可恢复的可见根契约。
- **E1.4 故障定位与默认引擎**：插入多个 `fsync/commit/publish/ACK` 崩溃切点，检验旧 root 或新 root 可还原且不会重复 Turn；FS/SQLite 分别出具证据，按 P0/Android/Termux 情况选择默认，不达 S2 的引擎不得静默标注合规或作无提示后备。

**Gate E1**：同一 Turn/State/Blob Root 在声明支持的平台达到可重复 S2 证明；外部硬件断电仍需真机/设备证据时必须列明，不能以单进程 kill 冒充。

### E2 — 无损长历史、共享 Revision 与 SavePoint 物理体系（4 单元，复杂度极高）

- **E2.1 分段 Timeline**：有界活动尾段、每回合独立 S2 barrier、不可变封存段、原文/Variant 内容寻址与有序 Range 索引；撤除每回合全量复制整个 Timeline 的热路径。
- **E2.2 共享 Revision/World State**：Branch fork 共用祖先 Segments/局部 COW 索引；State Delta + 回放成本触发的可验证物化快照；旧 Chronicle 有损 checkpoint 不得作为已确认原始历史的替代品。
- **E2.3 SavePoint / Branch 语义**：周期低频 + 结构化重大选择**之前** + 手动轻量 SavePoint；来源存档派生不同 Branch，自动编号/可更名展示元数据、保护手动保留点；读档不销毁原路线。正式 Play 后续只能从已经存在且有权使用的 SavePoint 产生玩家可选分叉。
- **E2.4 锚点、权限与可达根**：将活跃分支、原历史、保留 SavePoint、派生资产、铁人只读终局档案和在途导出/提交定义为持久引用根；铁人终局不可续玩但历史仍可只读。形成供 E4 GC 复用的 `ReachabilitySnapshot/Generation` 契约。

**Gate E2**：千/万消息样本增量追加与历史分页可还原，两个分支共享祖先且互不污染；重大选择之前的存档读档能恢复原世界状态；铁人死亡不能复活也不误删原文；物理段阈值由 P0 选优。

### E3 — Native Play 长正文与旧楼层操作退役（4 单元，复杂度高）

- **E3.1 范围读取接入**：让 Native Play 实际消费者调用 Revision 精确 Range/游标 APIs；完整权威验证与有限范围读取兼容，避免初次打开就全量构建每条消息的 DOM/图片。
- **E3.2 动态高度正文窗口化**：可变段落/图片/组件高度、虚拟区间、阅读滚动锚、回到最新、选中文本、流式草稿与 Accessibility。保证正读旧历史时新消息不会强行拖动视口，卸载节点正确释放媒体。
- **E3.3 旧楼层突变闭口**：删除旧 Swipe/Delete/Hide 和 Native Retry/Restart/Re-enter/任意 Revision Fork 的正式玩家 UI/API/Slash Command/快捷键旁路；先追踪 `#sheld` 隐藏生成 ABI 的实际消费者，必要时迁移到原生等价接口后再去除相关旧代码。媒体 Swipe、只读 History、正常资源删除与未提交 Draft 错误恢复应保留。
- **E3.4 存读档/分支体验**：唯一易识别的 Branch 名称、重命名、来源存档、归档/搜索/分页、铁人终局只读展示；Crash Resume 与玩家主动 Load/Fork 的规则绝不能混淆。

**Gate E3**：长会话 DOM/响应随可见窗口有界；从 SavePoint 读档生成独立 Branch；任何旧入口不能改写已确认的楼层/世界状态；允许只读回顾及非破坏性资源管理。

### E4 — 统一资源预算、后台 GC 与生命周期（4 单元，复杂度高）

- **E4.1 Scope/Epoch Owner**：Session/Branch/View/MemoryOS/Native UI/Worker/Timer/Listener/BlobURL 的显式幂等释放，防止过期异步回填；使用现有 NativeTaskScheduler、Chat Snapshot/Presentation Runtime 基础。
- **E4.2 热温冷缓存预算**：当前正文窗口/近期 Revision/持久 Segment 分层，字节与对象数上限，活动任务租约与高优先级 Turn/交互优先；不要新建第二套调度器，不能强行中断 S2 原子发布。
- **E4.3 安全 GC 与物理压缩**：从 E2 引用根做 `Mark→Quarantine→Revalidate→分批 Sweep`，保存 GC Progress，支持重启/读者租约/并发 SavePoint；FS 异步批量 IO、SQLite WAL checkpoint 与逻辑删除独立调度，避免同步事件循环扫描冻结前台。
- **E4.4 内存与停机压力**：反复打开/关闭、切分支、后台索引/GC、Node/浏览器/Android WebView 的内存回落与 S2 安全联合测试；区分 JS Heap/External/RSS 及真正有 Retaining Path 的泄漏，不强制生产 `global.gc()` 伪造改善。

**Gate E4**：后台整理可暂停并能继续，用户输入/保存不被不合理抢占，可达历史无误删；重复生命周期稳态资源可解释，设备低内存下保留正式 S2 数据。

### E5 — P3 记忆/上下文/Agent 计算增量化（4 单元，复杂度高）

- **E5.1 增量检索**：继承已有 SourceProof 有界 Corpus 缓存，优化 Lexical/DF/图邻接/向量水位，依 S2 Commit 更新 Delta Overlay；撤销/纠错传播，**新回合 Read-Your-Writes**。不能用全局内容哈希绕过 NPC/分支授权。
- **E5.2 ContextPlan/Token**：静态 Prompt/原子来源片段准确计数复用，最终完整 Prompt 重新校验 Token、HardReserve、World State、Actor Information Grant；保留原生 Runtime 权限与未知事实表述。
- **E5.3 DAG 编排和失败恢复**：对已有 Package Turn 和 Game LLM 两条调用链分别补合法依赖调度；独立准备工作有限并行，正式 Narrator 前 Context Join 屏障；错误按权限失效、必需证据不足、可选 Vector 超时、Provider/费用失败分开回退，重复提交问题以 E1 receipt 查询解决。
- **E5.4 Agent 预算及质量验收**：按场景必要性而非固定每轮次数调用 Embedding/Rerank/Provider，核对真实 Token/费用回执及长期预算；RP 已有六维和 Project 六维质量不退化，晋级必需的独立审查、人工/费用账目不被缓存冒充。对真正 CPU 密集的确定性派生计算，先比较增量化 JS 与 Worker 的端到端净收益；仍有明确瓶颈才对比 Rust/WASM（含序列化、启动、内存、包体积、跨平台和维护成本）；不迁移 SourceProof/授权/S2 或 Session 权威。

**Gate E5**：合法来源即时可见、NPC 不全知、跨 Branch/Time 不泄漏，RP 质量与现有来源验证相容；同数据同模型成本和 P95 有依据的改善，不能靠跳过质量测试获取。

### E6 — P4 启动与资源交付（3 单元，复杂度中）

- **E6.1 Android Manifest 合约**：修复 Kotlin 要求 3 个 Bundle 与 Node 要求 5 个的源清单不一致，确保打包→展开→预构建 Resolver 只在资源真实完整时命中；这是可以在 E0 后独立完成的高置信小项。
- **E6.2 浏览器/Node 关键路径**：沿用 `init.js` 模块并行、已有 `startup-timing` 和 Lazy Router，测量明确必要依赖，ShellInteractive/PlayReady/OptionalReady 分开，Studio/非活跃功能按消费者证明后延后。
- **E6.3 APK/Termux 路径**：首装/升级资产展开与日常热启分别测，WebView `onPageFinished` 不当作真实 PlayReady；Termux Node Server Ready 与浏览器真实 PlayReady 分开，安卓本地/远程端点独立。列出 Node 24 LTS 候选基线、Android Node.js Mobile 实装版本/ABI、Electron/WebView/QuickJS 与原生依赖的兼容矩阵，以对应平台启动、打包/加载、安全和回归证据决定是否统一版本；不因新版 Node 可用而直接视为 Android 通过。必要时做真机目标性能验证，不假定 Chromium 移动视口等于 APK。

**Gate E6**：预构建资源清单一致，无隐性实时编译伪命中；客户端可用性按实际 PlayReady 测量，不能降低 S2/权限检查换更短开屏动画。

### E7 — 横切回归、质量比较与合并移交（3 单元，复杂度中高）

- **E7.1 S2/可达性联动**：基于 E1–E4 的新格式做断电、部分写入、进程中断、S2 Receipt 不确定返回、合法分支/铁人终局/GC 交错等**专项**恢复验证；设备测试能力不足时写明待证，不冒充保证。
- **E7.2 用户价值回归**：长会话消息与分支增多时 P50/P95、DOM/Memory 稳态、检索证据质量、Provider 成本、PlayReady/Android/Termux 目标分开出对照；挑关键跨域用例验证，不强制每组完整 CI。
- **E7.3 整理合并**：对照全部冻结决策逐项确认，删除已解决问题/临时日志，更新同一份 Record/HANDOFF；在主线门槛满足的条件下合并 `main`，删除已完成临时 `refactor/*` 分支；`docs` 长期方案保留。

**Gate E7**：性能与质量有可追溯前后对照；S2 在宣称支持的平台有对应证据；未证实平台单独列待办而不是强行阻塞所有其它合法验收。

## 先后依赖与可灵活提前的小项

```text
功能分支合并 main
       |
   E0 统一基线
       |
   E1 S2 durable 根与引擎
       |
   E2 Timeline/Revision/SavePoint 数据结构
       |
   +-------------------+
   |                   |
 E3 Native Play      E4 P5 生命周期、GC
   |                   |
   +---------+---------+
             |
         E5 P3 记忆和 Agent

E6 P4 启动（E0 后可独立小组推进；最终需与 E2/E3 的 PlayReady 契约集成）
             |
         E7 横切集成与归档
```

- E0 → E1 → E2 是主要正确性关键路径；E3 与 E4 在 E2 的稳定数据/根协议之后可以按修改区域分组推进；E5 依赖 E2/E4 的索引水位、Scope 生命周期与 Run budget。
- E6.1 的 Android Bundle 清单一致性可在 E0 后作为低耦合小修提前提交；其它 E6 依赖 E3 的真实 PlayReady 消费者。
- 如果 E0 的实测证明 Play 长会话窗口化比存储改造更急，可先独立做不改变权威持久化的 E3.1/3.2 前置优化；**不得先上线绕过 E1/E2 约束的旧式任意楼层重试或不安全数据提交**。
- 优先级按**持久化正确性/真实长会话瓶颈/权威一致性**排，不按源码文件大小或某个模块有多少 TODO 决定。
- **人力/工作量性质**：E1、E2 是整体架构风险最高的核心重构；E3、E4、E5 需要大量关联接口和回归；E0、E6、E7 可以拆成相对独立的短任务。这里不凭空给开发天数。

## 跨阶段高风险与权威选择边界

| 风险 | 停止/验收条件 | 归属 |
| --- | --- | --- |
| FS/SQLite S2 不能证明 | 不能向用户虚报「已安全保存」；在支持宣称前必须有真正符合硬件/VFS/文件目录持久语义的相关测试，失败引擎不得静默启用 | E1/E7 |
| 先启动 Provider 再取授权证据 | 禁止正式生成；静态准备可并行，当前权限与 ContextPlan 需先汇合 | E5 |
| 未完成的 User Turn 部分已提交 | 依 Request/Commit receipt 恢复缺失步骤；禁止重复追加消息、重复执行命令或重跑已确认外部副作用 | E1/E3/E5 |
| 自动存档/GC 清掉玩家路线 | 先穷尽包括终局只读档案和导出/任务租约的保护根，版本化隔离与二次验证，不能用轮次/时间直接删原始剧情 | E2/E4 |
| 废弃 Swipe/Delete/Hide 连带破坏 Native 生成 ABI | 先穷尽真实调用方/宿主/插件/命令入口，原生替换后再断开旧路径；保留媒体滑动与资源管理 | E3 |
| 新分支使用旧 Memory/World 结果 | 校验 Source/Grant/Branch/Revision/Epoch/时间，失败任务不得发布，delta read-your-writes | E5 |
| 长正文内存随历史无限增长 | 动态高度窗口化、资源释放，保留全文分页，不能靠截断原文或关闭校验伪装增长变慢 | E3/E4 |
| Android 加载动画结束不代表可玩 | WebView 主帧、Shell Ready、PlayReady 分开测，不能把 onPageFinished 或 HTTP ping 当终点 | E6 |
| 强制全面验证导致阶段无法及时推送 | **只做修改部分 + 必须的跨域安全契约验证**；不能凭省略相关 S2/权限/数据不变量来节省验证，但无需无关联全量测试 | 全阶段 |

## 定量参数的决策归口（现在全部未冻结）

| 待定参数 | 取数场景与归属 |
| --- | --- |
| 默认 FS/SQLite 引擎、WAL 模式/检查点策略、同步屏障 | E0 实机/生产风格样本 → E1 S2 故障/性能与平台依赖 |
| Segment 封存大小、COW 索引扇出、物化快照触发、无损压缩算法 | E2 的 1k/5k/多 Branch I/O/回放/空间开销对照 |
| 自动 SavePoint 间隔/保留量、重大选择触发防抖 | E2/E3 的 RP/标准游戏/铁人决策与存读档 UX |
| DOM 窗口数/预渲染范围、图片缓存与阈值 | E3/E4 的动态高度正文、图片与移动端输入/滚动 P95 |
| GC 每批 IO、宽限代际/时间、内存热温预算、后台限流 | E4 的 Node event loop/前台延迟/空间水位与中断测试 |
| 检索索引合并窗口、Token 缓存、Vector/Rerank 情境触发、Agent 月/次预算 | E5 的 Recall/ContextPlan P95、Evidence Recall、认知边界和 Provider 实际费用 |
| PlayReady 的 P95 目标、首屏可延后列表、APK 打包取舍 | E6 的桌面/Termux/Android 真机冷/温/热对照 |

任何具体数值都应记录**测量设备、数据集、引擎、是否冷启动、样本量和回归上下界**。不把实验样本档位 5k/20k 当作已经宣布支持的产品上限。

## Codex 最小接手提示词（**只有在获得施工授权且功能分支合入 main 后使用**）

> 仓库：`ZZZdragondYNGPHX/Atria`。请先读取 `docs` 分支中的
> `plans/refactor/atria-performance-long-term-experience/index.md`、
> `implementation-roadmap.md`，以及当前 E 阶段对应的 P0–P5 模块。
> **不要重开已经冻结的 A/B/C 选择。**
> 以当前合入后的 `main` HEAD 为准创建 `refactor/atria-performance-long-term-experience`；先做 E0 再按 Gate 和依赖推进。
> 不兼容旧 dev/SillyTavern 数据，不加迁移、双读/双写或 alias；当前格式已确认 Turn Commit 必须满足 S2，可见旧剧情/分支默认无损保留，Play 的路线回溯统一用 SavePoint/Load/Branch。
> 每次只完成当前相关最小任务或一组可独立推送的改动，验证修改到的模块及关键 S2/权限/数据关联边界，提交并推送后继续。**不要强制全仓测试/截图/等 CI**；真实断电、Android 真机、密钥/权限无法完成的部分如实记录，不假装通过。保留一个阶段累计 Record，每阶段实质进展后覆盖更新并登记 HEAD/测试/剩余阻塞，不重复造大量汇报文件。
> 如果集成源与历史企划静态审计冲突，先提供具体最新代码证据并据此最小修订方案，不使用旧兼容变通或偷偷降低可靠性。任务确实需要用户提供权限/设备/Secret 时再停止。

## 第十六轮批准记录：方案 C 正式冻结

- **A — 纯 P0→P5 编号串行（未选）**：易解释，但 Play 与存储依赖和稳定性 GC 依赖不匹配。
- **B — 六大模块全面同时开发（未选）**：短期并行最多，但 Revision/Cache/Native Host 接口并发冲突和回归风险偏大。
- **C — E0→E7 依赖关卡式施工 + 低耦合小项提前（已正式批准并冻结）**：总共 **8 个阶段、30 个最小单元**；从 S2/无损历史开始保障安全与长会话基础，之后 Play、P5、P3、P4，各小阶段完成即推送，E7 定向集成收束。

**冻结范围**：E0–E7 阶段职责、30 个最小任务单元、先 S2/无损历史后消费者重构的依赖 Gate、定向验证与逐组推送纪律、dev 硬切无兼容、S2/来源权限与 RP 质量不变量。**留待 E0/专项实测**：默认存储引擎、压缩块/快照/GC 阈值、各平台性能目标、必要的 Worker/缓存策略细节。遇到集成后代码与历史快照不一致，应在保留冻结产品目标的前提下更新有证据的工程细节，不擅自重开架构方向。

**执行状态**：企划讨论至此结束；等待功能分支完成并合入 `main`，以及明确实施授权。尚未创建实施 Record、开发分支或进行 E0，绝不能把这份路线的 Gate 当作已经验证通过。

## Material design changes

- **2026-10-13 / E0 轻量静态预审附记（非正式 E0，不新增冻结决定）**：将运行时版本/ABI 矩阵纳入 E0/E6，将 JS→Worker→条件性 Rust/WASM 的 CPU 热点对照纳入 E0/E5；优先度不高于 S2 和长会话正确性。延续 E0–E7 八阶段、30 单元及批准的实施 Gate，详见 [P0 E0 轻量预审](measurement-and-evidence.md#e0-轻量预审补充2026-10-13尚非正式-e0)。

- **2026-10-13 / 第十六轮总审起稿**：用户批准第十五轮 P3 编排/回退/预算 C 后建立本文件；汇总六个技术域，补充跨域遗漏风险、E0–E7 共 30 个最小任务、Gate、Codex 接手模板、数据硬切/S2/只验证改动/设备真实性纪律。
- **2026-10-13 / 第十六轮正式冻结**：用户明确认同最终阶段方案 C，冻结 E0–E7（8 阶段、30 最小单元）及关卡依赖；A/B 作为未选历史方案保留。企划状态进入 Plan Frozen v1.0 / Pending Implementation，**并不授权立即执行**；必须等待当前功能分支合并并取得实施授权。
