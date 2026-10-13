# Atria 性能与长期体验 — P2 Native Runtime、存储和持久化

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第 6 轮讨论稿。S2、统一持久化契约 C、长期无损保留策略、物理架构 C 均已冻结于 [index.md](index.md)；具体索引算法、分段/物化策略、故障恢复与参数仍待讨论。
- **源码审计锚点**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；任何实施需先对实际集成后 `main` 复核。
- **当前范围**：设计/讨论；没有改动产品分支、存储格式、默认引擎或迁移用户数据。

## Responsibility

本模块负责 P2 的 Native Session/Revision/Timeline/SavePoint 提交语义、FS/SQLite 与可选数据库的持久化路径、不可变资产、长期数据规模、事务恢复和安全前提。性能负载与 P0 的通用测量口径详见 [measurement-and-evidence.md](measurement-and-evidence.md)。

## 已批准的设计约束（引用总纲）

- **S2 是核心游戏数据正式安全目标**：用户可见的“已保存/已完成”必须具备断电或 OS 崩溃后可以恢复到该已确认提交的设计与实测证据；任何低层设备/OS 同步原语失效或硬件损坏属于无法绝对保证的例外。
- 保护 Timeline、Revision、Branch/Variant、World State、SavePoint、关键资产依赖和与其对应的关键控制/权限记录，不允许出现“仅半回合/仅一半状态”被确认为保存成功。
- 可重建缓存、二级索引与临时计算可以弱持久化，但必须验证其失效不会破坏核心状态。
- 不能关闭来源、Revision/CAS、一致性校验或直接删除历史来换取性能；未确认的草稿、模型流式内容必须与已确认的核心提交明确区分。
- **存储架构选择已冻结为方案 C**：统一 Durable Commit Contract；FS 和 SQLite 各自实现并经安全与性能测量验证（SQLite 作为参考路径，不作为已确定新默认）。MySQL/PostgreSQL 等可选引擎须各自证明能力才标记支持 S2。
- **开发期不承诺旧数据兼容**：架构允许硬切换格式/引擎，不做旧版本迁移、旧 schema alias、兼容读取和双读双写，删除无法继续成立的旧兼容接口而不积累技术债。正式 S2 仅保护**当前版本当前支持格式**的已确认核心提交；不代表承诺跨 dev 版本数据可读取。
- **第四轮整体方案已批准**：每次正式 Turn Commit 是 S2 安全的增量提交；轻量自动 SavePoint 默认定期生成且可配置，手动存档受保护；当前游戏的原始正文、世界状态历史、有效分支/变体完整无损保留；有损语义压缩仅可作用于模型上下文/派生摘要；后台 GC 仅处理不可达且可安全回收数据。详见 [index.md](index.md) 的唯一跨模块冻结决定。
- **第五轮物理架构 C 已批准**：采用不可变分段事件日志、Revision/Branch 共享根与索引、周期物化状态；不再将纯事件日志 A 或纯持久树 B 作为主方案。该决定定义结构类别，**不预先确定具体索引树、段尺寸和触发公式**。
- 是否更换默认存储引擎、Segment 的活动/封存方式、自动存档具体阈值、如何压缩和 GC，仍 **待讨论**；新格式不受旧数据迁移限制。

## 现有真实源码事实（非完成 S2 的证据）

### C1. FS 的“事务”与提交标记

- [`src/storage/engines/fs-engine.js` L18-L27](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/fs-engine.js#L18-L27)：`withTransaction` 构建 `FsTransaction` 并执行回调，不提供多文件统一回滚。
- [`src/storage/README.md` L118-L120](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/README.md#L118-L120) 明确 FS 不支持跨资源事务与跨进程并发写入线性化。
- [`src/native/repositories/session-repo.js` L515-L604](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L515-L604)：先写不可变依赖，再写 Revision 与可变 Session HEAD 作为发布标记；**但 HEAD 后仍有 RunControl 的写入及 ironman SavePoint 删除**。需要审视崩溃窗口、写入依赖序列、可恢复性及是否能明确单一 durable commit point。
- [`src/storage/engines/fs-engine-transaction.js` L759-L863](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/fs-engine-transaction.js#L759-L863)：原生资源以 `write-file-atomic` 替换单文件；`get/list` 使用同步磁盘 IO，`list` 扫描整个 Native kind 目录、解析文件后再匹配过滤条件。这不是跨资源原子事务。
- `write-file-atomic` 默认会同步临时文件本身，但其 API 所承诺的“atomic replace”本身不足以证明目录项、多个文件及整个事务在所有平台上的断电可恢复性。目录 fsync、异常写失败行为等要补独立证据。

### C2. SQLite 提供真实事务，但当前配置不满足 S2 目标

- [`src/storage/engines/sqlite-engine.js` L26-L35](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine.js#L26-L35)：`journal_mode=WAL`、`synchronous=NORMAL`。
- [同文件 L153-L178](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine.js#L153-L178)：`BEGIN IMMEDIATE` → 回调 → `COMMIT`，出错时 `ROLLBACK`；这是多行 SQL 数据提交一致性的现有基础。
- [SQLite 官方 synchronous 说明](https://www.sqlite.org/pragma.html#pragma_synchronous)：WAL + NORMAL 在 OS 崩溃/断电下可能丢失最近的已提交事务；WAL + FULL 为每次 COMMIT 增加 WAL 同步，改善已确认事务的断电持久性（仍依赖 VFS/操作系统与存储设备兑现同步）。
- [`src/storage/engines/sqlite-engine-transaction.js` L905-L1008](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/storage/engines/sqlite-engine-transaction.js#L905-L1008)：Native 列表先按 `handle,kind` 读取全部记录，再在 JS 中解析、按目标过滤，因此仅“切 SQLite”不能消除所有长会话扫描瓶颈。
- [SQLite WAL 文档](https://www.sqlite.org/wal.html)：WAL 文件及 checkpoint 的保留和增长须监控；不能只复制主 `.sqlite` 文件并忽略活跃 WAL。

### C3. 核心资产可能跨越数据库与外部文件

- [`src/native/repositories/asset-store.js` L75-L147](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/asset-store.js#L75-L147)：内容寻址 `nativeBlobs` 实体字节先写文件，再写引擎中的 AssetRef；这是“先依赖后发布”的基础，但并非单一 SQLite SQL 事务。即使 SQLite 全部调成 FULL，仍需确保文件持久可见、目录项和 Ref/Session 发布顺序符合 S2。
- [`src/native/repositories/session-repo.js` L528-L554](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L528-L554)：提交前会验证 Persona 资产引用与相关快照，仍需测试磁盘崩溃窗口。
- [`src/native/repositories/save-point-repo.js` L44-L71](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/save-point-repo.js#L44-L71)：SavePoint 独立创建，针对 ironman 有旧存档删除逻辑；自动/手动存档与每回合提交是两个语义，不得混用确认状态。
- [`src/native/save-system.js` L95-L105](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/save-system.js#L95-L105)：`autoSave`、`quickSave`、`manualSave` API 已存在；**尚未证明默认每回合自动触发**。

### C4. 长期成本热点

- [`src/native/session-snapshot.js` L22-L135](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-snapshot.js#L22-L135)：完整会话快照逐项取回并验证 Timeline/Variant/多个 State。
- [`src/native/repositories/session-repo.js` L308-L348](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/session-repo.js#L308-L348)：已有 `readTimelineRange`。实施时应剖析生产调用，区分仅渲染窗口、全文编译及需要完整权威校验的操作。
- [`src/native/repositories/asset-store.js` L196-L285](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/repositories/asset-store.js#L196-L285)：资产引用检查涉及多个资源类别；清理必须以有效引用、未完成提交及备份恢复策略为边界。

### C5. 现有 Chronicle Checkpoint 是有损的，而非完整历史归档

- [`src/native/history-authority.js` L30-L40](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/history-authority.js#L30-L40)：Chronicle 将 hot→warm→cold→archive 并合并为摘要，属于**叙事/语义压缩**，不保留完整原始文本。
- [同文件 `checkpointHistory` L197-L231](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/history-authority.js#L197-L231) 明确重写 Task/receipt 记录、清空部分 runtime events，并将**新 HEAD Timeline 压到最近一条 assistant（或空）**；同时新 Core 的 parentRevisionId 被截断为 null。因此该机制**不能作为无损对话存储归档**。旧原文在其他保留的 Revision/SavePoint/Branch 中可能仍可找到，但不能默认保证持续可达。
- [`src/native/session-core.js` L509-L531](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-core.js#L509-L531)：普通新 Revision 构造 `[TIMELINE_NAMESPACE]: timeline.map(timelineSelection)`，即每次复制完整 Timeline 选择数组，再按内容哈希写入状态。若连续 N 次提交都未截断/分段，每次独立记录一个长度递增的数组，则**累计选择记录数量理论上可接近 O(N²)**；是否实际成为瓶颈须做磁盘/CPU 基准测试。
- **开发期硬切换的工程机会**：完全可重新定义新的 Timeline/Revision 物理 schema，不必为现有截断型 Chronicle 或旧物理数组提供迁移兼容；但新格式下应把“玩家可回看的原文/变体”与“可丢弃/压缩的模型上下文或任务中间记录”明确拆开。

### C6. SQLite 的 WAL/空间回收属于独立维护问题

- [SQLite WAL 官方说明](https://www.sqlite.org/wal.html)：长读事务可能阻止 checkpoint 推进；达到阈值触发自动 checkpoint 的一次 COMMIT 也可能比普通提交慢；不能单靠 VACUUM 解决增长和尾延迟。
- [SQLite PRAGMA 文档](https://www.sqlite.org/pragma.html#pragma_auto_vacuum)：`auto_vacuum=INCREMENTAL` 配合 `incremental_vacuum` 可逐步收缩数据库空闲页，但必须在数据库初建时设置或重建数据库后启用；开发期硬切换降低了 schema 兼容负担，**不等于应盲目默认开启**。
- 清理流程须区分：逻辑对象可达性、DB 行删除、WAL checkpoint、数据库文件空间回收、FS Blob 回收；四者不能被当成一次简单“删除旧存档”。

## S2 提交协议的设计候选（待讨论）

**用户可见语义候选**：

1. `UNCOMMITTED`：草稿或流式生成，可即时展示，但必须可辨别为未保存。
2. `PREPARED`：已经建立不可变 Timeline/State/Blob/Revision 候选并校验依赖；即便崩溃，也不能被误认为已正式生效。
3. `DURABLE_COMMITTED`：所有核心依赖以及最终统一的可见提交标记已越过相关引擎/设备所需的耐久屏障；**此后** UI 才可确认为“已保存”。
4. `RECOVERING`：重启后恢复到最近一个可信的 durable commit；对于不确定是否完成的提交，用唯一请求/提交 ID 查询状态并保证重复调用不产生第二个正式回合。恢复期间保护已经确认的历史，不删除尚可能被恢复引用的依赖。

**待解风险**：
- FS 多文件无统一 ACID 事务，文件本身 fsync 不等于其父目录 rename 已同步；需确认跨资源原子发布与顺序落盘方案。
- SQLite 真实事务 + FULL 仍不足以覆盖外部 `nativeBlobs` 文件，也无法消除 I/O 硬件失约风险。
- `commitSnapshot` 的 Session HEAD 后更新 RunControl/ironman 清理路径需要审计：哪些是必需状态、哪些是可重建尾处理、怎样避免崩溃后不一致。
- GC 和历史裁剪必须避开持久提交仍引用的数据与正在准备的候选资源；中断再启动可重试且不能误删有效存档。
- 批量/group commit 可考虑提高吞吐，但任何用户可见“已保存”都必须等待自身对应的 durable barrier；不允许异步缓冲结束前就宣称 S2 达成。

## 存储引擎历史对比（**第三轮已选择 C**）

| 方案 | 主要思想 | 优点 | 风险 / 成本 |
| --- | --- | --- | --- |
| **A — FS 强化** | 保持 FS 默认，建立可靠的多文件提交协议、目录屏障及恢复记录；SQLite 等仍需升级 S2 | 保留 FS 单文件可检视与便携性，避免依赖新存储驱动 | 多文件 S2 工程复杂；目录/平台差异以及长期扫描问题都需解决 |
| **B — SQLite 优先** | 核心元数据/事务改由 SQLite WAL+FULL 优先，文件系统仅负责内容寻址 Blob；FS 改成受限可选/迁移源 | 已有真正跨行事务，核心逻辑可能更简单 | 无旧数据兼容迁移负担；但 Android Node.js Mobile 的 better-sqlite3 ABI/打包必须验证；Blob 仍跨边界，DB 查询索引仍需改 |
| **C — 统一 Durable Commit Contract** | 先冻结 S2 写入/确认/恢复契约；FS 与 SQLite 分别实现该契约；上线默认模式由 P0 性能、安全验证和平台能力决定 | 不先拍脑袋换引擎；兼顾多环境和可恢复性 | 初期工程面更广，必须防止只有统一 API 却没有真实落盘保证 |

**已冻结的方案 C**：先按统一 Durable Commit Contract 定义可验证的 S2 契约，再用 SQLite 的真实事务与 WAL+FULL 候选配置建立参考验证路径，FS 建立独立可靠的 publication/recovery 实现；**不得在 FS 尚未达到 S2 时将其称为已达标或默默降级**。不提前指定新装默认引擎；dev 阶段可以直接废弃旧格式且**不提供迁移工具/适配层**，新版本从全新存储协议开始。不以 SQLite 代替对外部 Blob 落盘的证明。A/B 仅保留为被比较但未选的历史方案。

## 自动存档与增量提交（讨论候选）

- **每回合提交 ≠ 每回合创建一个独立 SavePoint 文件/记录**。前者是每次完成游戏动作时的可恢复权威提交；后者是用户显式或按策略保留的历史恢复锚点。
- 提交过程中使用不可变依赖、内容地址、Revision HEAD 与受控写屏障；减少全量读/写时必须维持相同逻辑语义，不随意丢弃被引用的旧历史。
- **自动存档**候选：在已经 durable committed 的 Revision 上定期建立 SavePoint，支持用户可配置数量/容量/时间上限；未达容量阈值前不应为了性能裁剪有独立引用的历史。
- **后台 GC**：不在输入/渲染关键路径同步扫描全仓，按可达性与版本化回收；先记引用、再候选、确认后安全清理。GC 的性能和数据安全独立计量。
- **数据分层**：当前受支持格式的 Core Snapshot/Revision/Timeline/SavePoint 和关联必要状态属于强一致持久层；Cache/索引/临时任务中间计算属于有界可重建层；无法分类的当前核心记录默认不得无审计地丢弃。旧 dev 格式不纳入兼容保障。

## 第 4 轮整体策略（**用户已选择表中 C 原则，数值与实现未冻结**）

### 概念与不变量

- **Turn Commit**：每次正式完成的玩家或系统权威动作，发布一个可验证的 `DURABLE_COMMITTED` Revision；这属于 S2 正式提交，**与是否创建 SavePoint 无关**。
- **SavePoint**：显式或按策略保留的历史恢复锚点，引用一个已经确认持久的 Revision；存档元数据本身与修改保留根的操作也须满足 S2。它不等于一份包含全部游戏资源的物理快照。
- **History Checkpoint / Compaction**：把访问、查询或计算的代价降到可接受范围，可使用分段/快照加增量日志/压缩索引；**默认不对玩家可观察的历史做有损裁剪**。若要删除因保留策略过期的历史，必须先确认其不可达、没有受保护引用且按用户明确授权的生命周期生效。
- **GC**：只回收受支持的根集合无法到达的对象。根包含 Session 当前 HEAD、所有被保留的 Branch/Revision/SavePoint、Package/World/Knowledge/AssetRefs、运行控制与延迟中任务租约，以及备份/导出仍需要的依赖；缓存失效不代表引用不存在。

### 核心决策候选（待用户确认）

| 议题 | A（未选） | B（未选） | C（已批准的原则；细节待定） |
| --- | --- | --- | --- |
| 自动 SavePoint | 每回合都新建 | 只允许用户手动 | 已完成的 Turn Commit 始终安全，SavePoint 默认轻量定期创建且可配置；手动置顶永不自动覆盖 |
| 增量存储 | 每回合完整物理 Snapshot | 纯事件日志一直追加 | 不可变 Revision/段共享 + 增量写入 + 周期性可校验物化快照；Checkpoint 本身也是安全提交 |
| 历史压缩 | 直接截断旧消息 | 永不清理或重写任何派生内容 | 无损冷热分层（热区与归档完整保留）；有损叙事摘要**仅作用于模型上下文**, 原始游戏历史仍存在 |
| 过期与 GC | 以时间/容量直接清理文件 | 全部保留直到用户手动删除 | 引用可达性 + 受保护的手动锚点 + 两阶段标记/回收 + 安全宽限期 + 恢复演练 |

**讨论先后顺序建议**：先冻结“每个正式 Turn Commit 都是可恢复点”，再定 SavePoint 自动化与保留规则；之后决定无损存储的增量/分段结构以及 GC 的保护根/墓碑和恢复策略。这样不把可恢复性与磁盘优化混为一谈。

**重要边界**：历史 Checkpoint 可能已经含有领域级压缩或裁剪逻辑；实施前必须逐路径识别是否真的可逆、是否保留源消息以及在存档/分支/Prompt/记忆/对照审计时如何调用归档数据。**不能宣称当前已有 Checkpoint 全是无损的**。

### 仍需测量的长期增长指标

- 每个正式 Turn Commit 的实物字节增长、哈希/CPU、FS 文件数及目录扫描成本、SQLite native_resources/WAL 增长。
- 1k/5k/20k 消息，多 Branch/Variant/SavePoint，资源与记忆索引交叉增长时的提交 P50/P95、存档创建/恢复时间、浏览/检索耗时。
- 长运行/重启/断电/GC 前后：当前 HEAD 与每个受保护 SavePoint 的哈希闭包一致性，孤儿对象数量，GC 删除总量与安全回滚能力。
- 确认用户历史“完整保留”的定义：正文、结构化状态、历史变体、出处、附件和需要的媒体资产分别归类，不得只保留一段摘要却说已保存原文。

## 第六轮技术讨论草案：分段、物化、索引与恢复（**未决**）

**本段只提出候选设计，不新增冻结决策**。任何阈值都不得在没有 P0 实测数据时当作必达验收数字。下列逻辑对象的职责受总纲第五轮 C 约束；选择更精简的具体实现不影响冻结原则。

### 1. Segment 的封存与持久性

- 候选 A「每次回合单独封存」：最容易建立独立不可变对象和 S2 barrier，但会有许多小段、小文件、更多 metadata 和压缩损失。
- 候选 B「连续写一个活动段，达到固定轮次再封存」：顺序吞吐可更好，但每次正式回合都需要独立可验证的 durable boundary、记录长度/校验与断电后尾部修复；不能等封段才承认每回合保存。
- **候选 C「有界可恢复活动尾段 + 自适应不可变封存段」**：活动尾部顺序 append 完整记录和校验，**每个 Turn Commit 都必须先 durable**；按累积字节/访问频率/记录数等启发条件封存到不可变压缩段并发布新索引根。单个段的合理大小、压缩算法和缓存驻留预算依设备性能测量决定。活动尾部不会因暂未封存就降低 S2。
- 无论选择 B/C，段物理偏移/记录校验与 commit-id 不得单独当作权威提交证明；必须通过被持久发布的 RevisionRoot/commit receipt 引用，恢复时只信任有效已确认根。封存/归档的改写属于新的无损物理映射，旧映射在安全屏障前不能回收。

### 2. Revision/Branch 索引与范围查询

- 不采用「每回合复制整个 Timeline 数组」；使用持久化共享索引的逻辑根，分支在 fork 处共享旧区间/块，新的事件只写增量片段；单条 Variant 的更新只改局部映射/根。
- **建议先做有序分段区间索引 + Copy-on-Write 小型节点**（例如有界扇出的树/B+tree 风格）：`RevisionRoot -> TimelineIndexRoot -> SegmentRange`；`MessageID/VariantID -> stable immutable record`。分支前缀共享已封存段，分支尾部使用独立 root；新物理段不必等于语义回合段。
- 需明确 `readTimelineRange(revisionId,start,limit)`、`getByMessageId`、`getVariant`、`loadBranchHead` 的预期 IO/复杂度及对游标/分支快照的一致性；控制一次请求的可解析数据量，不把整个 Session 放进浏览器 DOM。
- 二级全文/搜索索引是可重建层；但 **RevisionRoot 到权威历史片段的引用索引属于 S2 核心层**，不能在 GC 中作为随时可丢的缓存。

### 3. 物化状态快照的触发

- 候选 A「固定 N 回合」：简单但无法适配低频大 State 或高频微变更。
- 候选 B「累计 Delta 字节上限」：控制回放 I/O，但不保证大计算量的回放耗时。
- **候选 C「回放预算驱动 + 字节/回合安全上限」**：累计 Delta 数量/字节和实测重建耗时达到阈值时，后台物化一个完整、已校验的 State Snapshot。对特别大的世界可考虑按 namespace 分层，不改变跨领域统一权威提交边界。
- 快照是正式根所引用的可验证权威数据的**加速表示**；只有源 Delta 与快照结构一致且新 root 安全发布后才允许替换读取锚点。旧 Delta/快照在仍被历史 Revision 或 SavePoint 引用时不得删除。只读恢复不得重启 LLM、插件、副作用操作。

### 4. S2 提交 / 恢复状态机

建议以单个 `commitId` + `expectedHead` + `RevisionRoot` + `commitReceipt` 形成幂等契约：

```text
UNCOMMITTED
  -> PREPARE（写事件/State Delta/Blob/索引节点）
  -> DURABLE_DEPENDENCIES（依赖及目录项/数据库 durability barrier）
  -> PUBLISH_ROOT（以 CAS + durable 原子提交发布根和提交回执）
  -> ACK（仅此时向 UI 返回已保存）
```

- 若崩溃发生在 ACK 前：新根可能已 durable 或尚未发布；客户端以 `commitId` 查询回执，避免「返回丢失→重复追加」；只读恢复不得再次调用 LLM/插件。
- 若崩溃发生在 PUBLISH_ROOT 过程中：恢复必须选择旧完整 root 或新完整 root，绝不暴露一半世界状态、一半事件的混合结果。
- SQLite 事务内部的根/回执须同一事务完成并采用可验证的同步配置；外部 Blob/FS Segment 必须**先 durable 再**提交 DB 根。FS 则需要独立的多文件 prepare/发布协议和文件/目录耐久屏障；不应简单把 `rename` 当作整个多资源原子提交。
- GC 和归档是并发读写者，需有 root generation / 读者租约或快照保护；在可达性核验、宽限期及新根 durable 后才能回收旧段。

### 5. SavePoint 与手动保留的具体触发（仍未决）

- 基本原则冻结：每回合都有 S2 Revision Commit，自动 SavePoint 定期轻量创建；手动保留锚点不受自动数量配额回收影响。
- 候选触发为「累计正式提交次数 / 距上次自动锚点的游戏或墙钟时间 / 世界状态变化规模 / 高风险叙事事件」中的组合；快照物化与 SavePoint **不是同一事情**，无需强行使用相同间隔。
- 自动锚点可在新 Durable Revision 发布后异步调度，但在 SavePoint 自身确认前不得向 UI 宣称该锚点已保存。定时失败可以重试；后续回合本身不因此回滚。
- 自动保留数量/容量基于实测与配置；手动保护优先于配额，GC 不通过删除旧自动锚点来删除依然有效的原始历史。

### 6. 第六轮需要拍板的架构优先级

- 推荐「自适应活动尾段+不可变封存」、「分段有序共享索引+局部 COW」、「回放预算触发物化」、「commitId 幂等 S2 durable root 发布」为第六轮整体方案；但不冻结字节数/轮次/算法参数。
- 注意**控制复杂度**：保留一个权威 Commit API，一个索引根契约，一个恢复解析器和一套 GC 可达性契约。不要并行维护新旧格式双写或跨版本适配；不要把抽象层和多种可选策略做成未经实际需求支撑的配置矩阵。

## 建议的最小故障注入测试（待定量）

- 在依赖写入、Blob 写入、Revision/RunControl、HEAD 标记、COMMIT 返回、SavePoint 替换、GC 等关键点注入异常/kill 进程，重启读取并核对是否处于完整“旧版本”或完整“新版本”。
- 分开执行进程 `kill -9` 等 S1 实验与具备合规条件的 OS/VM/虚拟磁盘电源中断/S2 实验；**仅 kill 进程不能证明 S2**。
- 同一提交 ID 重试只产生一次正式 Timeline/世界状态变更；“请求结果丢失”时可查询结果而不必重复生成回合。
- Blob 及其 AssetRef、Package 版本、World/知识快照、RunControl 与 SavePoint 的重启可达性/完整性；GC 不能删除可恢复状态需要的内容。
- 用 100/1k/5k 消息、深分支/多 Variant 与资产规模增长场景比较 FS/SQLite 的完成确认 P50/P95、事件循环阻塞、磁盘空间/文件数、恢复耗时。
- S2 验证限定受支持的实际平台/文件系统和明确的测试方法；硬件损坏、违反 flush 保证的设备、被覆盖的备份属于 S3 或外部故障域，不宣称绝对零风险。

### 第 5 轮外部设计比较（用于约束候选，非架构定案）

- [Martin Fowler — What do you mean by Event-Driven?](https://martinfowler.com/articles/201701-event-driven.html)：事件日志与可读的物化工作视图应分离，历史回放不应要求每个调用方扫描完整事件源；快照可避免每次从头重放。
- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)：历史状态重放有价值，但与外部系统互动的副作用需隔离。Atria 的模型调用、插件操作、网络请求**不得因只读重建/历史浏览而重新执行**；应重放已持久化的权威结果或声明的纯计算。
- [Git — pack-format](https://git-scm.com/docs/pack-format.html)：不可变内容对象可在物理存储层采用引用与增量表示以减少重复；不意味着 Atria 应实现 Git 协议或依赖 Git 作为实时数据库。
- [RocksDB Tuning Guide](https://github.com/facebook/rocksdb/wiki/RocksDB-Tuning-Guide)：同时测量写入放大、读取放大与空间放大；更频繁 compaction 或更大压缩段可能牺牲互动时延，不宜单看压缩率选择设计。这里只借鉴性能指标，不默认引入 RocksDB。
- [SQLite — WAL](https://www.sqlite.org/wal.html)：长时间读事务和 checkpoint 相互制约；后台维护与前台延迟目标需分别监测，不能假设批量清理就即时缩小磁盘文件。

## 外部依据

1. [SQLite: PRAGMA synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous) — WAL+NORMAL 与 FULL 的持久性差别。
2. [SQLite: Write-Ahead Logging](https://www.sqlite.org/wal.html) — WAL sidecar/Checkpoint、长读事务与空间增长。
3. [SQLite: Atomic Commit](https://www.sqlite.org/atomiccommit.html) — 依赖 VFS/硬件同步原语，崩溃注入思路。
4. [Node.js: Don't Block Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) — 同步 I/O 在 Node 共享线程上的响应影响。
5. [write-file-atomic README](https://github.com/npm/write-file-atomic) — 文件级临时写、rename 与默认 fsync（不能推导多文件事务与目录项同步）。
6. [PostgreSQL: WAL and synchronous_commit](https://www.postgresql.org/docs/current/runtime-config-wal.html) 以及 [MySQL InnoDB durability](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html) — 可选数据库有各自的同步策略；S2 是部署条件，不只是 API 契约。

## 第五轮结构决策回顾（**已选 C，以下细节移至第六轮**）

1. **已批准**：混合分段事件日志 + 不可变段共享 + 周期状态物化（物理方案 C）；不采用纯线性日志 A 或纯持久树 B 作为主架构。
2. 有效分支如何复用历史片段、单条消息的新 Variant 如何不复制整条 Timeline；怎样保持分支切换和任意范围读取的时间复杂度稳定。
3. 世界状态变动使用增量变更+定期物化快照，如何将完整权威历史与派生检索/提示词缓存分离。
4. 自动 SavePoint 的触发模式、手动置顶/删除策略、物理文件分段大小与压缩块大小：允许初始建议值，但正式阈值根据 P0 实测确定。
5. 后台 GC 如何在并发写入与读历史时标记保护根、等待安全宽限期并最终清理；失败后可继续恢复。

### 第五轮物理布局比较（历史候选；**C 已获批准**）

| 架构 | 数据形式 | 优点 | 需要解决的技术问题 |
| --- | --- | --- | --- |
| A — 纯 Append-only Event Log | 每次添加 Turn/State 事件，查询通过日志回放与周期快照 | 写入简单、顺序 IO 友好 | 长历史分支查询、任意位置随机读取、无损变体遍历与日志恢复效率 |
| B — 纯持久化 Copy-on-Write Tree | 每次变更只生成修改路径上的不可变树节点；Revision 保存根引用 | O(log N) 范围定位和高效分叉，复用强 | 对象数量、FS 小文件风暴、Blob GC 与冷归档的碎片及写入放大 |
| **C — 分段不可变日志 + 共享索引/根引用 + 周期物化状态（已选）** | 顺序不可变段保存原始事件和内容；可重用的分段索引根支持分支/Variant，间隔物化完整结构化状态，供热读/恢复使用 | 增量写入、无损保留、分叉共享、减少全量快照与碎片；符合本轮目标 | 需要定义稳定 id、分段 sealing、索引更新、安全确认、分支/资产可达性与错误恢复 |

**与第三轮「存储方案 C」区分**：此处的物理架构 C 已在第五轮批准，两者均已冻结，但分别是持久提交契约和物理布局；不把任何候选参数当作已确认。

### 第五轮已批准架构的逻辑角色（字段与实现仍待定）

- `TimelineEvent`：不可变事件 ID、Session/Branch/Message/Variant IDs、序号/父锚、类型、引用的内容块 ID、提交 ID；不把模型上下文摘要替代原文。事件对象与内容块可分别去重。
- `ContentChunk / Segment`：封存后不可变、校验完整性、压缩后仍可还原全部原始正文/结构化负载。基于修改局部和块级共享，避免单回合复制 O(N) 历史。
- `BranchRoot / RevisionRoot`：记录当前合法分支版本所指向的序列索引/状态根；分叉引用旧的段和固定 fork 锚，新增部分另写；切换/派生新 Variant 创建新不可变根，而非复制全部原文。
- `StateDelta / MaterializedState`：世界状态变化和事件权威日志单独保留；物化状态用于限界回放长度，重新构造任意历史点时先读最近可验证的状态物化，再应用对应后续增量，且回放只读正确分支/修订。
- `SavePoint`：已 S2 提交的 RevisionRoot 轻量引用；“定期”与“手动”仅影响恢复锚点策略，不决定原始 Timeline 可否被 GC 删除。
- `DerivedContext`：对模型输入而做的摘要、向量索引、热视图、全文倒排索引均可重建，禁止作为唯一的原始游戏记录。
- `GC Roots / Mark / Sweep`：包括 HEAD、所有有效分支、可回退历史、手动/自动保护的存档锚、任务租约、资产关联、正在导出的根；GC 中断可幂等重试，不可回收根对象，不借删过期自动 SavePoint 删除仍有效的正文。
- **S2 屏障**：即使使用分段/写合并，新的 RevisionRoot 只有在引用的 Segment/Blob/状态/索引根耐久后才可被发布并向界面确认。FS 和 SQLite 分别实现相同逻辑不变量；不能通过异步写缓冲后提前确认提高跑分。

### 第六轮具体实施与性能待测问题

- 是否把活动尾段和封存段分成两类：活动尾部小批写入 / 满额密封后无损压缩。较小段利于随机读但增加元数据，较大段利于压缩但重写放大；阈值取决于长会话基准。
- 结构化状态物化的依据：按 N 次权威提交、累计 Delta 大小、回放 P95 上限的组合，还是以固定间隔为主；避免单纯轮次决定所有游戏的存储成本。
- 多分支读历史与多 Revision 同时打开时，如何避免无界内存驻留；分页与窗口化应与前端 P1 的实际消费者配套。


## Material design changes

- **2026-10-13 / 第 3 轮**：用户批准“核心游戏数据 S2”后建立此设计模块；上述 A/B/C、自动存档、具体 S2 协议为讨论候选，不属于已冻结决策。
- **2026-10-13 / 第 4 轮开始**：第三轮方案 C 已批准，统一 S2 Durable Commit Contract 是正式设计原则；更新 A/B/C 表的决策状态，并添加自动 SavePoint、增量共享、无损历史分层、受保护 GC 候选，**未把这些候选写成已批准**。
- **2026-10-13 / 第 4 轮补充**：用户明确开发期无外部已发布用户，不考虑旧数据兼容和跨 dev 版本迁移；取消旧格式迁移负担和由此衍生的 alias/双读双写等债务。新格式中的 S2 故障与数据安全承诺维持不变。
- **2026-10-13 / 第 4 轮补充审计**：确认当前 Chronicle 压缩有损（不保留完整原始 Timeline），且 Revision 的 Timeline 物化数组潜在累计二次增长。依开发期硬切换约束，第四轮优先讨论新物理存储结构，而非修补旧语义兼容。
- **2026-10-13 / 第 5 轮开端**：用户确认第四轮推荐的整体方案：新格式不兼容旧 dev 数据；当前历史无损分层保留、S2 每回合增量提交、定期可配置自动 SavePoint、手动存档保护、仅回收安全不可达对象。P2 模块新增 A/B/C 物理布局选项和分段/状态物化/分支根的候选职责（**尚待第五轮定案**）。
- **2026-10-13 / 第六轮开端**：用户批准第五轮物理布局 C；在不触动已冻结的 S2、无损保留、开发期硬切与定期 SavePoint 原则下，新增分段/物化/索引/原子发布与故障恢复的候选细则，参数尚待用户讨论及 P0 实测。
