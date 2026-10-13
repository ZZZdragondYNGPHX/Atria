# Atria 性能与长期使用体验优化 — Plan Index

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **Primary Workspace**: `main`（未来产品实施）；本次企划归档于长期 `docs` 工作空间
- **状态**: **Plan Frozen v1.0（架构及实施路线均已批准；尚未开始施工）**
- **起草日期**: 2026-10-13
- **当前阶段**: **第 16 轮已完成并正式冻结**；P0–P5 全部设计领域与 E0–E7 / 30 最小实施任务已归档，后续仅在功能分支合入 main、重新测量并取得实施授权后开展工程
- **实施起点**: 等当前 `feat/agent-compute-runtime` 功能开发结束并集成后，重新核实 `main` HEAD 和基线；**在用户明确授权施工后**才创建独立临时 `refactor/atria-performance-long-term-experience`，先执行 E0。当前不得修改产品分支
- **首次静态审计快照**: `feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`，同期 `main@3ee1332ef113d4c57c65d9577222ba88d5171101`；此为代码证据，不是性能测量

## E0 轻量静态预审补充（2026-10-13；非正式 E0 验收）

- 本次仅复核 `main@3ee1332e` 与 `feat/agent-compute-runtime@f4815c72` 的部分远端源码、构建声明和既有 P0 研究；未运行真实性能基准、设备/断电测试，也没有实施产品代码。审计事实与候选实验统一见 [P0 测量与证据](measurement-and-evidence.md#e0-轻量预审补充2026-10-13尚非正式-e0)。
- **新增待验证方向，不重开既有冻结方案**：优先评估 Node.js 24 LTS 统一运行时基线（含 Android 内嵌版本/原生依赖/类型定义）；先对真实 CPU 热点试验 JS Worker，再仅对可复现且净收益明确的热点比较 Rust/WASM。保留 QuickJS 限额隔离执行；不引入第二套 Session/World/Revision、存档权威或游戏业务内核。
- 仍沿用 **E0–E7 共 8 阶段、30 单元**：E0 收集版本/CPU/跨平台基线，E5 纳入计算卸载对照，E6 纳入运行时/宿主升级兼容矩阵，E7 按证据收口。升级版本、采用 Worker/Rust/WASM 均**尚未批准为必做实现**，不预设性能增幅或新增阶段。实施前置条件、S2 和长会话优先级不变。

## 目标

使 Atria 在日常打开、切换与交互时轻快，同时在长篇 RP、不断增加的世界状态、记忆、历史分支、资源与存档中维持响应速度、数据完整性和恢复能力。优化范围包括浏览器/桌面、Termux、Android APK、服务端 Node.js、Native Runtime、FS/可选数据库以及智能体检索与计算链路。

## 已冻结的跨阶段核心决策

1. **方向 C：双目标优化**，同时追求即时交互体验和长期运行/大规模数据稳定性。
2. **优先级加权**：长会话流畅度、持久化安全的权重高于一般启动时间和纯跑分；不等于放弃启动与日常交互。
3. **S2 — 核心游戏数据断电持久性（第 3 轮已批准）**：正式游戏状态与已确认提交的 Timeline、Revision、Branch/Variant、SavePoint、关键资产依赖和必要元数据，要求以包含突然断电/操作系统崩溃场景的持久性作为设计与验收目标。先明确跨资源原子提交和何时向 UI 确认成功；FS/SQLite 等实际能力和设备保障必须分别验证，不把目标误写成已实现或百分之百硬件保障。可重建缓存/检索索引不必采用同级落盘强度；S3 设备损坏恢复另外立项讨论。
4. **存储方案 C — 统一 S2 Durable Commit Contract（第 3 轮已批准）**：先定义跨存储引擎一致的准备、持久提交、确认、恢复、幂等及回收安全契约；FS 与 SQLite 分别实现并提供真实 S2 故障验证，其他可选引擎以对应能力验证决定是否宣称支持。优先以 SQLite 真实事务作为参考验证路径，但**不预先决定默认引擎或放弃 FS**；这些结论由 P0 测量和实际平台能力决定。开发期存储格式允许直接硬切换，无须兼容旧数据或提供迁移。不能把统一接口误认为已获得 S2 保证。
5. **开发期硬切换／无旧数据兼容（第 4 轮用户补充冻结）**：Atria 仍处于未向用户发布的 dev 阶段，本迭代不考虑旧版本数据、旧 SillyTavern 数据或旧存储格式兼容；允许按新架构直接破坏性升级，不引入 schema alias、兼容读取、双读双写、版本适配层或历史迁移脚本，不为了延续开发数据增加未来技术债。旧 dev 数据可明确声明不受支持；不等于允许在**同一当前受支持格式**的已确认 S2 提交上静默丢数据。若格式变更，清楚说明旧 dev 数据失效即可，不承诺自动迁移。
6. **第四轮长期存储整体方案已批准**：对当前支持的新数据格式，每次正式 Turn Commit 均独立达到 S2 可恢复提交（不是每次新建 SavePoint）；使用增量提交与历史段/Revision 共享，避免反复物理复制整个 Timeline。默认定期创建可配置的轻量自动 SavePoint；手动 SavePoint/置顶保留点不自动覆盖或清除。长期有效的原始剧情、原始游戏历史、结构化世界状态历史与有效分支/变体默认**无损保留**，热区/冷归档只改变编码与读取方式；模型上下文可做有损摘要，但不得取代可回溯的原始记录。后台 GC 仅清理经引用可达性、安全宽限、提交边界确认可以回收的缓存、孤立中间数据与过期自动保存锚点；不可通过过期自动锚点间接清除仍属于有效历史的数据。用户可显式删除历史/分支，且须明确告知后果。自动存档间隔、保留数量及物理索引结构仍待第 5 轮具体设计。
7. **第五轮物理架构 C 已批准**：下一代 Native Session 采用**不可变分段事件日志 + 跨 Revision/Branch 的共享索引与根引用 + 周期性物化的结构化世界状态**。事件/正文/有效 Variant 与世界状态原始变化无损保留；分叉后的 Branch 复用祖先段和索引节点，不按回合重写整个 Timeline；物化快照只负责限界重放和快速读写，不得替代可还原的原始权威历史。该物理架构 C 与第三轮统一 S2 Durable Commit Contract C 为两个独立层次，均已冻结；段尺寸、压缩算法、快照触发阈值、索引具体实现及故障恢复协议仍待第六轮与实测定案。
8. **第六轮持久化细节组合已批准**：采用有界且每回合达 S2 的活动尾段 + 自适应不可变封存；按 Revision/Branch 共享的有序分段索引与局部 COW；按回放成本/增量规模决定周期性物化状态；每次提交以唯一 commitId、expectedHead CAS、耐久依赖与 RevisionRoot/receipt 原子发布实现 S2，客户端在不确定返回时查询而非重复执行。后台维护不得阻塞交互关键路径，GC 遵守引用可达性与安全宽限。段字节上限、压缩算法、默认触发阈值和索引节点参数由 P0 实测决定，未冻结任意常数。
9. **第七轮正式游玩交互方案 A 已批准**：从正式 Play 及对外玩家操作中移除 SillyTavern 旧楼层 Swipe/Delete/Hide，以及绕过 SavePoint 的原生 Retry Reply、Restart From Here、Re-enter Turn、任意 Fork from Revision 快捷入口；用明确创建的 SavePoint / Load SavePoint / Switch Branch 管理剧情回溯与路线分化。Load SavePoint 从相应持久化 Revision 派生独立 Branch，保留既有分支及其完整世界状态，不通过删除已提交的楼层来伪造回退。继续提供只读历史查看、主动存档、现有路线切换、未提交失败/取消生成的安全恢复与项目/Session/存档等独立资源管理；媒体左右翻页、Native 权威 Variant 结构不属于旧回复 Swipe，不应误删。正式 Play 不得通过公开 API、快捷键、Slash Command 或事后任意创建历史 SavePoint 等途径绕开这一边界；Studio/调试所需权限另行明确讨论，默认不提供例外。不兼容旧 dev 数据、不保留旧楼层突变兼容 API；底层清理须保护仍在使用的 Native 隐藏生成 ABI。
10. **第九轮路线管理及运行模式已批准**：SavePoint 读档派生的 Branch 自动生成可辨认的来源名称与唯一路线编号、允许用户重命名展示标签但不改不可变 Branch ID/来源 Revision；历史路线默认保留、可折叠归档和按需检索，主动删除整个路线须引用完整性检查。普通 RP/标准游戏通过 SavePoint 读档创建新 Branch，且可切换现有分支。铁人模式禁止历史读档和旧 Branch 切换，允许在技术故障后**只续接最新合法已提交 HEAD**；铁人死亡后变为不可继续的**只读终局档案**，保留有效原始剧情/结构化历史作为只读回顾，严禁通过该档案恢复进行中的游戏或规避终局规则。自动 SavePoint 与玩家可选择的回档点按模式分权；项目/Session/整条路线的用户主动删除仍属资源管理，与旧楼层 Delete 不同。详细数据模型、默认标签、权限粒度与 GC 机制按后续讨论/验证确定，绝不视为已实施。
11. **第十轮资源治理方案 C 已批准**：冷热三层缓存（当前交互热层、近期可重建温层、磁盘无损权威冷层）均须建立清晰作用域和基于字节/对象规模的有界驻留；复用或整合现有 NativeTaskScheduler，保障用户输入、正文滚动、生成、读档与必须完成的 S2 提交优先于可暂停的预取、无损压缩、检索索引维护与 GC。GC 实施版本化根、Mark→Quarantine→Revalidate→分批 Sweep，可中断并从重启恢复，确保新旧 Branch、SavePoint、铁人只读终局档案和在途提交的依赖不被错误回收。压力/设备预算由 P0 实测，不引入第二套平行调度器，不保证缓存永久常驻、不靠删除正式游戏历史降内存。
12. **第十一轮内存生命周期治理方案 C 已批准**：各热/温缓存、UI/组件、Worker 和异步任务须有可检查的 Owner/Scope、Revision/Branch/Generation Epoch 与幂等 dispose/abort/release 边界；Session/Branch/View 退出时及时取消或拒绝过期结果，按缓存字节/对象配额及设备压力自适应驱逐，而非依赖全量刷新或强制 GC。通过反复相同场景、稳态 Live Heap/Retaining Paths、Detached DOM、Worker/Timer/FD 与 Node RSS/external 的分项证据区分正常增长、缓存预热、allocator 保留和真实泄漏；后台回收沿用第十轮 C，严禁危及 S2 提交和无损历史。具体预算、Soak 时长、可接受趋势阈值须通过 P0 量化，尚未冻结。
13. **第十二轮分层启动方案 C 已批准**：以 T0 进程/导航起点、T1 ServerReachable、T2 ShellInteractive、T3 **真实 PlayReady（可恢复当前受支持格式的已确认 S2 状态、校验权限/必需资产并能正式操作与发送）**、T4 非必需功能就绪为独立里程碑；仅将首玩所需、包括必要安全校验的依赖纳入启动关键路径，Studio/可选工具/非活跃资源经消费者核实后按需加载。保留并行初始化、既有启动遥测和 Termux 缓存，严格统一 Android 构建/Kotlin 展开/Node 端的预构建 Bundle 清单与完整性；区分首次安装/升级资产展开、热冷进程、WebView 及远程端点。不能把 onPageFinished、loaderHidden、APP_READY 或 /api/ping 当成 PlayReady；不提前冻结性能数字、原生 R8/Profile 与具体分包算法，需多平台实测与安全回归。
14. **第十三轮 P3 计算架构方案 C 已批准**：复用既有来源证明与有界 Memory Corpus Cache，按已验证 Source/Policy/Revision/时间/Embedding 模型版本维护可重建的增量词法索引、图关系邻接、向量文档指纹及稳定 Prompt Segment；每次请求仍必须重新核验视角授权、来源及时间适用性、当前世界状态与原子证据组，动态完成 QueryPlan、排序、ContextPlan/分车道预算与最终精确 Token 计数。Vector/Rerank/Agent 模型调用受已批准的计算预算和实际质量/必要性条件控制，已有 RP/Project 质量闸门、来源追溯、S2 与防全知边界不得降低；旧的检索结果或晋级报告不能冒充新一轮权威证据。缓存键格式、增量一致性协议、失效路径、Token 优化算法与预算定量规则留待第十四轮及 P0 实测。
15. **第十四轮 P3 缓存与调用细则 C 已批准**：对已有 Corpus/Context/Prompt 设施使用分层且受权威证明约束的缓存身份；静态派生特征可按来源/版本安全复用，最新 Query/Actor/Branch/Revision/Time/World/Information Grant 必须即时验权。只有正式 S2 Commit 之后的 Event/State/Memory 更改可以驱动版本化增量检索索引，支持旧稳定 Index + 已确认 Delta Overlay 的 Read-Your-Writes 和 IndexGeneration/SourceWatermark 审核；撤销、纠错、分支切换须失效相关支撑与授权，来源/索引水位不可信时不得假称覆盖最新事实。静态片段 Token 可复用，但完整序列化后的最终 Prompt/ContextPlan 必须遵守对应模型的准确预算与硬保留；可选 Vector/Rerank/Provider Prompt Cache/Agent 计算遵循质量收益、真实调用费用和累计预算双门槛，RP/Project 独立评价不降级。具体缓存键字段、事件格式、合并策略、数值配额仍待 P0 及第十五轮设计，不能把候选 API 当作已经实现。
16. **第十五轮 P3 执行时序方案 C 已批准**：不同 Native 生成路径保留本身正确的先后依赖，统一以已确认 S2 Revision/Branch/State Heads、有效 Information Grant、Request Epoch 和已获批准的 ComputeBudget 锚定当前请求；仅可将不依赖尚未执行动作、源授权或模型输出的纯读/确定性准备工作有限并行。在正式 Narrator/Provider 调用前必须汇合可证明的合法 Memory 来源、当前 World/Actor 权威、必要证据组与准确 Token/工具/路由预算，并重验当前性。授权撤销/旧 Revision/硬保留失败必须 Fail Closed；可选 Vector/Rerank 失败仅在基础合法证据充分时有诊断地降级；已 S2 提交的玩家输入/命令不得因 Recall/模型失败而重复提交，已确认正文不会因派生记忆任务失败丢失或被重复生成，未完成派生任务需可靠标记并按来源可幂等补算。模型/Agent 增量调用按 RP 情境及质量风险双维约束，必需的防全知、世界状态与独立评估不可省略。复用既有 NativeTaskScheduler 与 GenerationService Fallback，不建立第二套并行处理器；并发上限、超时、预算配额和切分边界依 P0 验收定量。
17. **第十六轮工程路线方案 C 已批准并冻结（Plan Frozen v1.0）**：正式采用 [implementation-roadmap.md](implementation-roadmap.md) 规定的 E0–E7 **8 个工程阶段、30 个最小任务单元**，以实际集成后的 main/E0 可重复基线为入口，优先确保 S2/无损历史，后推进 Native Play、预算化 GC、P3 检索/Agent 和 P4 启动优化，最后跨域归档。E0→E1→E2 为正确性主链，E3/E4 可在稳定数据契约后推进，E5 依赖 Source/Index/Scope，E6 独立低耦合小项允许 E0 后提前。每组任务完成即相关验证、提交推送并更新单一累计 Record；不强制完整全仓测试、长等 CI 或伪造真机/断电结果。dev 硬切无旧数据兼容，已确认当前游戏提交、RP/信息权限与只读终局档案仍受既有约束。**批准企划不等于授权立即创建开发分支或实施代码**；压缩、引擎、缓存、模型费用和性能目标的定量参数仍须 P0/目标环境证据。
18. **正确性不得换速度**：不得破坏 Native Session/Revision、Branch/Variant、世界状态权威、存档可恢复性、记忆来源与权限边界；不得通过静默丢数据、缩短历史或关闭校验伪造性能收益。
19. **实测决定实施顺序**：`P0` 先建立基线，再排序具体热点；静态代码风险不等于已证实的实际故障。
20. **独立后续迭代**：当前功能分支完成之前仅调研和讨论，不夹带产品代码改动。
21. **轻量且真实的验证**：只验证实际改动涉及的模块及关键不变量；需要真机才能确定的结论明确标为待证，不假称已测试。

## 第八轮已冻结：混合自动存档 C

低频周期自动 SavePoint、Game Runtime 结构化重要抉择发生前创建 SavePoint、玩家手动存档三者组合；重要抉择的锚点必须指向抉择执行前已 S2 提交的 Revision。纯文字 Narrative 主要采用周期与手动存档，不由模型凭空猜测重要选择。每回合 S2 提交与 SavePoint 不同；具体间隔、保留量与游戏模式权限仍未确定。

## 模块地图

| 模块 | 权威内容 | 依赖与状态 |
| --- | --- | --- |
| [`measurement-and-evidence.md`](measurement-and-evidence.md) | P0 性能/安全基线、测试工作负载与源码证据 | **第十六轮实施路线 E0 的前置模块；真实基线尚未执行** |
| [`client-interaction.md`](client-interaction.md) | P1 长会话/Native Play 交互、旧 Swipe/Delete/Hide 退役、Save/Load/Branch 替代方案 | **第七—九轮产品方案已冻结，E3 阶段实施候选**，依赖 E1/E2 与 P0 |
| [`runtime-storage.md`](runtime-storage.md) | P2 会话/Revision、S2 FS/SQLite、原生资产、分段无损历史和存档 | **第三—六轮方案冻结，E1/E2 工程阶段候选**，依赖 P0 |
| [`agent-compute.md`](agent-compute.md) | P3 记忆检索、上下文编译、质量门槛与 Agent 计算缓存 | **第十三—十五轮 C 均已冻结，按 E5 实施**，依赖 P0/P2/P5 |
| [`startup-resources.md`](startup-resources.md) | P4 浏览器/Node/Android/Termux 冷热启动、资源关键路径、预构建一致性、后台恢复 | **第十二轮分层启动 C 已冻结；实际性能增益与参数仍待 P0**，依赖 P0/P5 |
| [`stability-recovery.md`](stability-recovery.md) | P5 冷热缓存、后台 GC、任务预算/生命周期、长期稳定与恢复 | **第十—十一轮 C 已冻结，E4 工程阶段候选**，依赖 P0/P1/P2 |

| [`implementation-roadmap.md`](implementation-roadmap.md) | **第十六轮 P0–P5 总审、8 阶段 30 单元、工程 Gate、Codex 接手模板** | **方案 C 已批准：Plan Frozen v1.0；等待施工前置条件及独立实施授权** |

上述 P0–P5 六份专题均已建立并完成方向讨论；详细物理实现、默认参数与每个平台的合格证据不因方案冻结而自动视为完成。`runtime-storage.md` 中第三轮 S2 契约 C、第四轮长期无损保留、第五轮物理布局 C、**第六轮提交/段/索引/物化组合**均已批准；段大小等参数仍待 P0 测量。第七轮已通过 `client-interaction.md` 核查楼层旧操作并获用户确认严格方案 A：正式 Play 退役 Swipe/Delete/Hide 与 Native Retry/Restart/Re-enter/任意 Fork 快捷入口，Save/Load/Branch 成为剧情回溯的统一入口；保留只读历史及已提交数据不可变、未提交失败恢复和独立资源管理。第八轮混合自动 SavePoint C 已确认；第九轮已批准：分支自动命名可重命名、路线可归档、普通玩法通过 SavePoint 分叉，铁人仅可续接最新状态并在终局保留只读原始历史。第十轮前台优先三层缓存与预算化安全 GC 方案 C 已获批准并在 `stability-recovery.md` 冻结；第十一轮进一步批准 Scope/Owner/Epoch 幂等释放、自适应驱逐与稳态反复验证 C，仍不冻结无实测的内存阈值；第十二轮已批准 P4 分层启动 C，区分真实 PlayReady 与 Shell/Server 各阶段、加强预构建 Bundle 完整性并分平台测量；第十三轮 P3 增量派生计算 C 已获批准，第十四轮也批准分层权威 Cache Key、已确认 S2 Delta 索引与 Read-Your-Writes、最终完整精确 Token 校验和质量/成本双预算 C。第十五轮批准 P3 执行时序 C：依赖 DAG、生成前的来源/权限/证据/Token Context Join 屏障、有限并行及分类回退和情境化费用/质量预算；第十六轮已总检 P0–P5，正式批准依赖关卡式 E0–E7、30 单元，现处设计冻结/待施工授权状态，未进入产品实施。跨模块不重复写一套规则。

## 阶段与读取路由

| 阶段 | 目标 | 需读取的模块 |
| --- | --- | --- |
| **P0 — 基线与性能画像** | 分离首屏、交互、长会话、存储、检索、Android 与稳定性成本 | `index.md` → `measurement-and-evidence.md` |
| **P1 — Native Play 与界面交互** | 长聊天消息渲染、流式更新、滚动、焦点/阅读位置 | `index.md` → `client-interaction.md` → P0/P2 结果 |
| **P2 — 会话与存储** | 会话读取、Revision/Variant、文件系统/数据库、增量索引与安全提交 | `index.md` → `runtime-storage.md` → P0 结果 |
| **P3 — 记忆与智能体计算** | 避免重复计算，保持检索精度、认知边界和来源 | `index.md` → `agent-compute.md` → P0/P2/P5 结果 |
| **P4 — 启动与资源交付** | 浏览器/Node/Android/Termux 的冷启动、热启动与依赖加载 | `index.md` → `startup-resources.md` → P0/P5 结果 |
| **P5 — 长期稳定与恢复** | 长时间运行、回收与崩溃恢复、容量变化、退化检测 | `index.md` → `stability-recovery.md` → P0/P1/P2 结果 |

P0–P5 是六个技术领域；第十六轮已经**正式批准并冻结** [实施路线 v1.0](implementation-roadmap.md)：E0–E7 **8 个工程执行阶段、30 个最小任务单元**，正确性 Gate + 低耦合小项可提前。实际实施仍须功能分支先合入 `main`、用户明确授权，再由 E0 重新采集基线。**当前未开工、不创建实施 Record 或 HANDOFF**；冻结的是产品目标、架构方向和阶段边界，不是未经测量的数字。

## 验收框架

- **流畅度**：冷/热启动、首次可交互、输入/切换/滚动与流式刷新；报告 P50/P95、长任务、帧卡顿。
- **长期规模**：消息与分支增长时的响应曲线，不能仅测空白会话；同时测较大世界书、记忆图谱和存档集合。
- **安全性**：快照/Revision/Variant/存档/资产与来源一致；中断、恢复、重试、垃圾回收不造成静默数据损失或重复提交。
- **资源稳定**：浏览器内存、Node RSS/Heap、文件描述符、磁盘/文件数、CPU/磁盘阻塞、后台/前台切换。
- **AI 质量**：优化检索/编排时必须保留真实性、权限、认知和评估输出；不能单独以模型调用减少作为成功判据。
- 具体延迟预算、可接受规模与回归阈值由 E0/P0 基线及阶段 Gate 的真实证据决定，**设计冻结不等于冻结未经测量的绝对数值**。

## 设计冻结后留待 E0 与目标环境实测的事项

1. 长期使用负载的目标档次（例如 1k / 5k / 20k 消息；只是样本候选，不是当前硬门槛）。
2. **阶段方案已冻结**：S2/无损增量历史、Save/Load/Branch 主流程与铁人终局只读、P5 资源/生命周期 C、P4 PlayReady C、P3 第十三—十五轮 C，以及第十六轮 **E0–E7 八阶段 30 单元、依赖 Gate、Codex 定向验证/交接**。没有待重新投票的方案；**仍未获准修改产品代码**。模型预算、缓存/GC、存档/压缩和性能数字仍待 P0。
3. 质量与性能权重如何转化为基准指标；桌面、Android APK、Termux 是否使用统一底线与分平台预算。
4. 初始基线采集是先聚焦 Native Play + FS，还是同步覆盖其他后端；依据现实用户路径分层。
5. 允许 dev 期存储格式直接硬切换，**不做旧数据兼容/迁移**；仍需确定新格式 S2 提交与恢复协议，并区分旧 dev 数据不兼容和当前格式下的异常丢失。

## 研究与来源

- 仓库代码证据、观察与外部参考集中在 [`measurement-and-evidence.md`](measurement-and-evidence.md)；代码链接锁定首次审计提交，以免滚动 HEAD 造成结论漂移。
- 开始实施时必须针对**实际集成后的 `main`** 重新测量，不能直接把 2026-10-13 的源码快照当作最终基线。
- 通用执行与记录规则见 [Repository Governance](../../../README.md)，本 Plan 不复制治理执行流程。

## 重要设计变化

- **2026-10-13 / 第 2 轮**：确定方向 C，同时提高“长会话流畅度”和“持久化安全”优先级；建立大型 Plan Bundle，P0 指标、负载与安全边界进入后续讨论。
- **2026-10-13 / 第 3 轮**：用户批准核心游戏数据 S2 断电持久性目标；承诺范围限于明确确认完成的提交，并以跨存储引擎和设备的实际故障验证为交付必要证据。创建 `runtime-storage.md` 收录 FS/SQLite/Blob/RunControl 审计及未决 A/B/C 方案、自动存档与增量提交设计。

- **2026-10-13 / 第 4 轮开端**：用户正式选择第三轮方案 C（统一 S2 Durable Commit Contract）。这是跨阶段冻结决定，FS/SQLite 独立合规、默认引擎择优；第四轮转向自动存档、增量提交、历史压缩、GC 的备选方案，尚未冻结具体策略。
- **2026-10-13 / 第 4 轮补充**：明确项目仍为未发布 dev 版本：后续大改默认硬切换，不兼容、不迁移旧 dev 数据/旧格式，不为历史兼容增加未来代码负担；S2 承诺仅针对新版本当前受支持的正式核心数据，不能由此降低同版本已确认提交的安全性。
- **2026-10-13 / 第 5 轮开端**：用户正式批准第四轮整体方案：开发期格式硬切换、当前正式回合 S2 增量提交、定期可配置轻量自动 SavePoint、原始对话/世界状态/有效分支的默认无损保留、模型上下文独立摘要、仅清理可安全回收对象的后台 GC。下一轮讨论物理结构和阈值，不将其当作已批准。
- **2026-10-13 / 第 6 轮开端**：用户明确认同第五轮物理架构 C，正式冻结「不可变分段事件日志 + 共享 Timeline/Revision 索引/根引用 + 周期结构化世界状态物化」；分段大小、冷热压缩算法、触发策略、索引树细节与 S2 恢复序列均仍待本轮讨论及 P0 性能验证。
- **2026-10-13 / 第 7 轮开端**：用户认可第六轮完整技术组合。另提出产品新需求：审查 SillyTavern 旧楼层 Swipe/Delete/Hide 的存量代码与实际入口，倾向去除这些单楼层操作，以 Native Save/Load 与 Branch 为主要剧情路线管理方式；先审计实际存在与能力边界，再讨论替代方案，未在本轮直接修改代码。
- **2026-10-13 / 第 7 轮审计**：发现旧 SillyTavern 消息模板与操作实现尚存，但当前 Native Play 使用隐藏生成 ABI 和独立显示层，旧 Swipe/Delete 被提交保护阻拦；Native 自身仍提供 Restart/Re-enter/Retry/Fork 等绕过 SavePoint 的回溯入口。新增 [`client-interaction.md`](client-interaction.md) 并将「全面转为存读档与分支控制」的严格程度列为第七轮待选方案；尚未改动产品代码。
- **2026-10-13 / 第 8 轮开端**：用户认同第七轮严格方案 A：正式 Play 清退旧 SillyTavern Swipe/Delete/Hide，连同 Native Retry Reply、Restart From Here、Re-enter Turn 和任意 Fork from Revision 的玩家快捷入口；剧情路线仅通过保存/加载和切换 Branch 管理。仅保留只读历史、未提交生成安全恢复和独立资源管理，不把媒体 swipe 或权威 Variant 数据结构误删。第八轮讨论存档策略与绕过入口，尚未实施。
- **2026-10-13 / 第九轮开端**：用户批准第八轮自动存档方案 C（固定低频周期 + 结构化关键选择前 + 手动）；保留 S2 抉择前一致性，具体触发常数与铁人等玩法权限尚待定案。
- **2026-10-13 / 第十轮开端**：用户确认第九轮推荐组合：分支自动命名并允许重命名；路线默认保留可归档；普通游戏从 SavePoint 读档派生新 Branch；铁人不允许回档，仅能续接最新合法已确认进度，死亡后转为不可继续的只读终局档案并默认保留完整原始历史。具体实现与资源预算未冻结、产品代码未修改；第十轮讨论缓存、后台 GC 与前台响应保护。
- **2026-10-13 / 第十轮研究**：新建 [`stability-recovery.md`](stability-recovery.md)；针对全消息渲染、旧 FS 同步 GC/Native Revision 遍历、MemoryOS SourceScope、Checkpoint、已有 TaskScheduler 与 Android 内存信号提出 P5 三层缓存、维护任务优先级、两阶段并发安全 GC 的 A/B/C 选项。此阶段是静态审计+文档，不是实测性能或已批准方案。
- **2026-10-13 / 第十一轮开端**：用户认可第十轮方案 C，冻结三层有界缓存、复用 TaskScheduler 的前台优先预算调度、GC 的 Mark/Quarantine/Revalidate/Sweep 与可暂停恢复边界。具体水位、批量数和 Soak 验收门槛仍未冻结；下一轮讨论长期内存泄漏诊断及自动回收，不改产品分支。
- **2026-10-13 / 第十二轮开端**：用户正式确认第十一轮方案 C：内存所有权/作用域与生命周期幂等释放、过期异步结果隔离、按设备压力自适应驱逐，以及重复往返/Retaining Paths/内存分项数据确认真正泄漏。避免通过 RSS 单一数字、频繁刷新或强制 GC 冒充修复；预算与 Soak 门槛留待实测。转入 P4 冷热启动、资源加载和多平台差异专项讨论，尚未实施产品代码。
- **2026-10-13 / 第十二轮 P4 专项建档**：新增 [`startup-resources.md`](startup-resources.md)，确认前端/Node 启动已有并行、延后与埋点优化；发现 Android Kotlin 只校验 3 个预构建 Bundle，但 Node Webpack 要求 5 个，属于已证实的代码契约差异，实际 APK 回退风险尚需重现；`onPageFinished` 隐藏遮罩不等于 Native Play 可以发送。第十二轮建议测量驱动、分层 Ready 的方案 C，尚未获批。
- **2026-10-13 / 第十三轮开端**：用户确认第十二轮 P4 方案 C：以真正可继续游戏的 PlayReady 为目标，分层测量 Server/Shell/Play，保留强一致 S2/权限校验，按需激活非关键模块，统一 Android Kotlin/构建/Node 的 Bundle 清单，并针对 Android/Termux 独立优化冷热启动。第十三轮转向 P3 记忆/上下文/Agent 计算性能与 RP 质量；尚未修改产品代码。
- **2026-10-13 / 第十三轮 P3 专项建档**：创建 [`agent-compute.md`](agent-compute.md)，确认已有 SourceProof 校验与有界语料缓存、混合 RRF 检索及向量差量、Token 分组证据、ContextPlan 权威、Prompt Segment 标记、RP/Project Evaluation 六维质量闸门。可测的重复成本集中在 Lexical 词袋/图邻接重建、Token 计数与向量对账；推荐“源证明驱动的增量索引 + 每轮重验授权/时间/世界状态 + 保质量门槛”方案 C，尚未获用户批准。
- **2026-10-13 / 第十四轮开端**：用户明确认同第十三轮 P3 方案 C；冻结有权威证明的确定性派生计算增量复用、每回合最新合法来源/视角/时间/世界状态过滤、Token 车道与原子证据、质量及 Agent 预算不降级。第十四轮讨论缓存键、失效协议、索引增量重建、Token 计数与 Provider 调用费用约束；尚未修改产品代码。
- **2026-10-13 / 第十五轮开端**：用户正式认同第十四轮 P3 方案 C，冻结分层 Source/Policy/Revision/Actor/Time 身份、只按 S2 已确认事件推进的 IndexGeneration 与 Delta Overlay、立即可读新提交的 Read-Your-Writes、最终精确 Token 安全校验，以及受已证明质量与真实费用约束的可选模型/Agent 调用；具体阈值/API/调度尚未定案。第十五轮讨论召回与上下文编排、并发/失败回退和情境预算。
- **2026-10-13 / 第十六轮开端**：用户正式批准第十五轮 P3 方案 C：只并行互不依赖且已授权的准备工作，固定本回合 S2 Anchor/Request Epoch，生成前汇合 Memory/World/权限/原子证据/精确 Token 与模型 Route 预算；授权/当前性错误不可软降级，可选向量/Rerank 在合法基线充分时分类退化，已持久提交的玩家输入/故事不允许重复生成或丢失，后台记忆派生故障可幂等补偿。不同 RP 场景通过真实质量与成本联合预算控制。第十六轮总审 P0–P5、规划施工波次及交接；仍未实施产品代码。
- **2026-10-13 / 第十六轮整体收束研究稿**：总审 P0–P5，新增 [`implementation-roadmap.md`](implementation-roadmap.md)：八个工程阶段 E0–E7、共 30 个可独立验证的最小单元，原则上先集成现有功能分支→P0→S2/增量历史→Native Play/P5→P3→P4→联动验证；P4 预构建 Bundle 小修允许 E0 后提前。固化每阶段仅验证改动模块与关键安全边界、推送后更新同一 Record，P0 未知参数不造数；**工程路线 C 只是本轮建议，尚未获批准，未动产品代码**。
- **2026-10-13 / 第十六轮正式封板（Plan Frozen v1.0）**：用户明确认同 E0–E7 八阶段、30 最小任务单元及依赖 Gate 的最终实施方案 C；统一冻结之前 1–15 轮全部已批准产品/架构原则与第十六轮执行路线，讨论收束。未来 Codex 按 [implementation-roadmap.md](implementation-roadmap.md) 接手；必须先完成并合并当前功能分支、以新 main/E0 建基线且获得实施授权；不添加旧 dev/SillyTavern 数据迁移，不伪造 S2/Android/性能结果。当前仅 docs 修改，未动产品分支，也未创建实施 Record。
- **2026-10-13 / E0 轻量预审补充（非新一轮冻结）**：将运行时版本统一、Worker 优先与 Rust/WASM 条件性对照作为 E0/E5/E6 的可验证候选；仅补研究证据和 Gate，不改变 S2/Play/P3 原有冻结目标、E0–E7 数量或实施授权边界。
