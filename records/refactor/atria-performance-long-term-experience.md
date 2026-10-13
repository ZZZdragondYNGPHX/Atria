# Atria 性能与长期使用体验 — 累计 Record

- Task ID：`refactor/atria-performance-long-term-experience`
- Plan：[冻结总纲](../../plans/refactor/atria-performance-long-term-experience/index.md) / [E0–E7 路线](../../plans/refactor/atria-performance-long-term-experience/implementation-roadmap.md)
- Primary Workspace：产品 `main`；施工分支 `refactor/atria-performance-long-term-experience`（完成后已清理）
- 授权：2026-10-13 用户明确要求连续实施全部 8 阶段 / 30 任务，最终合并、验证和清理。
- 当前状态：**完成**。E0–E7 的 30 单元本地实施/相关验收完成；已快进集成并推送 `main@7e1045ab8`，本地/远端一致，临时分支/工作树已清理。平台物理 S2、Windows/Termux 与长时设备内存仍待证；本机完整 Runtime Load/Append 与全历史 ABI 成本保留，不能声称所有性能指标都改善。

## E0 — 主线准入与本地基线（E0.1–E0.4）

- Start / baseline HEAD：`73c7913b22daae98b6348fad0f3eee1cfce1f080`；End HEAD：`885916c45`，已推送。
- Git reflog 证实 `feat/agent-compute-runtime@f4815c727` 快进合入 main；祖先检查通过，最新本地/远端 main 一致。
- 环境：CachyOS，Linux `7.2.9-2-cachyos`，x64，i7-11800H，16,477,622,272 bytes RAM；Node `24.21.0`、V8 `13.6.233.17-node.53`、ABI `137`。better-sqlite3 本地加载及真实写入成功。声明 `engines >=20`、`@types/node ^18.19.84` 与实际版本区别记录；Windows / Termux 尚无本机证据。
- 新增离线生产仓库基准 `tests/performance/native-long-term-bench.mjs`：100/1k/5k 正文，原始世界状态，SavePoint 三次派生分支、精确 20 条范围读取、GC 保留断言，以及带可核对答案的 Memory 排名。夹具走实际 SessionCore/SessionRepo/FS/SQLite，不创建旧数据兼容器；后续新格式复用同夹具。
- 3 次暖缓存样本的 P95 ms（小样本诊断，不是产品 SLA）：

| Engine / 消息 | Load | Range 20 | Append | GC |
| --- | ---: | ---: | ---: | ---: |
| FS / 100 | 17.47 | 3.39 | 29.07 | 1.38 |
| FS / 1k | 120.16 | 8.61 | 218.97 | 0.58 |
| FS / 5k | 531.82 | 31.05 | 1084.05 | 0.63 |
| SQLite / 100 | 10.75 | 2.62 | 23.94 | 3.30 |
| SQLite / 1k | 86.84 | 9.47 | 179.16 | 0.89 |
| SQLite / 5k | 413.73 | 33.22 | 927.78 | 0.97 |

- 排名 P95：100 / 1k / 5k = 3.58 / 12.67 / 54.17 ms。fixture 批量创建亦计入 event-loop monitor，P95/max 9504.29 ms，不能冒称为真实交互 P95。
- 问题排序：全历史加载/校验和每提交全 Timeline 复制随规模增长；Range 仍读取全量选择数组；检索重复词袋/图准备。S2 正确性优先于这份耗时排序：SQLite NORMAL、FS 多文件回调事务、Blob 目录落盘、HEAD 后 RunControl、Chronicle 截断/铁人死亡清理必须先解决。
- 决策：默认引擎、跨设备阈值、压缩与 Worker/WASM 暂不冻结。相关定向回归须保持全文、世界、分支、来源权限和精确预算，测同一设备/夹具且保留样本条件；出现实际回归需诊断，不以自设百分比停止。E1 将覆盖 dependency/prepare/publish/ACK 切点及 receipt 不确定返回。
- 实际最小验证：上述基准完整运行、`node --check`、`git diff --check`。未执行全仓测试/CI。
- 待证：浏览器 T0–T4/输入/滚动/DOM、Windows、Termux、物理断电、真实 Provider 费用/RP 质量和小时级内存。进程故障测试不能冒充 S2 设备证明。
- 下一 checkpoint：E1 durable 合同、SQLite FULL、FS journal/原子发布/恢复、资产目录屏障与幂等提交。

## E1 — durable contract / 两引擎 / 回执（E1.1–E1.4）

- Start HEAD：`885916c45`；End HEAD：`a21143dfa`，已推送。
- FS Native 事务改为用户根作用域串行隔离、内存 staging、checksummed prepared journal → 文件/目录同步 → 原子发布 redo journal → 全部依赖安装 → ACK。重启在读者进入前完成已发布 journal；未发布事务回滚。单服务器进程限制明确保留。不是给旧回调包装改名；Session/RunControl/SavePoint 等 Native 资源均参与原子协议，旧非 Native 资源不冒称 ACID。
- SQLite 强制 WAL + FULL 并回读配置；Native 列表按字段在 SQL 中过滤。Blob 文件及新建父目录先 durable，再发布引擎引用。同步原语失败抛错，不静默降级。损坏 Native envelope / Blob / journal 校验失败关闭。
- Session root、Revision、必要 RunControl 和 commit receipt 在同一引擎事务内完成；唯一 commitId/fingerprint、expectedRevision CAS；新增回执查询 HTTP API，append 可依提交 ID 处理 ACK 丢失，不重复 Turn。冲突 ID 拒绝。
- 本地验证：SessionCore FS/SQLite 22 用例通过；durable-commit、旧 commit-last 改为新 staging rollback、storage-foundation 三套共 12 用例通过。独立子进程在 prepare/dependencies/publish/install/ack 五个切点退出后，旧或新完整状态恢复、原世界一致、回执重试一次；这只证明 **S1/协议恢复**。针对全部修改 JS 的 ESLint 与 diff check 通过；坏 envelope 额外本地断言通过。首次额外断言误用非 atri_* namespace 被契约拒绝，纠正夹具后通过。
- 默认引擎未改：缺跨平台物理证据时不凭跑分做默认替换，也不认证任意引擎/后备 S2。CachyOS 文件/目录屏障实际执行成功；Windows、Termux VFS/硬件断电待证。官方 SQLite/Node 文档仅支持协议设计依据，不替代 Atria 设备测试。
- 下一 checkpoint：E2 分段共享 Timeline/State、无损 Chronicle 历史、SavePoint/Branch/终局引用根。

## E2 — 无损共享历史 / 增量世界 / SavePoint（E2.1–E2.4）

- Start HEAD：`a21143dfa`；End HEAD：`565b77a48`，已推送。
- Timeline 当前格式硬切为 v2：有界活动尾段、不可变段/原文 Variant、8 路局部 COW 有序索引；Revision 根共享祖先。范围读取按区间定位，不解析完整选择数组；支持存档闭包导出/导入索引节点。没有旧数组兼容读取/双写/迁移。
- 初始物理策略 64 selections / 16 KiB 尾段、fanout 8 经 100/1k/5k 和 10k 索引样本验证；属于本机候选参数，不是三端已验证上限。未加未经证明净收益的压缩算法。World State v2 保存完整初始物化 + 可校验递归 Delta，增量占比/累计重放字节达到完整状态成本或深度达 32 时重新物化；原始增量通过历史 Revision 仍可达。
- Chronicle 仅压缩派生模型/任务工作状态，保留完整原文及 parentRevision ancestry。铁人死亡发布终局根，取消未完成操作并保留 Session/SavePoint 原文为只读；续玩/读档/活跃存档导入仍由权威 RunControl 拒绝。
- SavePoint 三触发：手动、低频自动（初始 5 分钟、保留 12，可配置，不作为冻结产品限额）、Package 结构化 Transaction `savePointBefore` 在动作正式执行前保存已提交根。只过期自动锚点，不删手动存档或原始历史。读档从同根也派生独立路线，保存来源 saveId/唯一路线序号；展示改名/归档元数据不改不可变 Branch 身份。
- 引用根输出 `ReachabilitySnapshot`：session/save generation、有效历史/分支/终局、世界 Delta、Timeline index、正文 Variant、资产依赖，供 E4 复用。
- 实际定向验证：SessionCore + SaveSystem 35 用例；新增 FS/SQLite 长历史/Delta/自动保留/重大选择/终局 6 用例；调整有损旧期望后的 HistorySession 2 用例；ESLint/diff check。5k Range 20 读取少于 60 次资源访问；独立 10k 索引完整与尾部 Range 一致（depth 3，tail 16）。原先 HistorySession 期待只留一条/无 parent，被新冻结语义淘汰；保留 replay refusal、全原文和 SavePoint 恢复验证。
- 同机同夹具 3 次暖样本 P95：FS 5k Range **31.05→2.83 ms**，SQLite **33.22→3.07 ms**；100/1k/5k 的 Range 约 2.4–3.1 ms。5k Load FS 531.82→546.31、SQLite 413.73→440.13；Append FS 1084.05→1118.46、SQLite 927.78→981.75 ms。新增强持久性与校验后完整 Runtime 路径尚未加速，明确保留这一成本，不掩盖回归；E3 消费端范围化/E4 I/O/E5 计算继续处理。
- 待证：跨设备参数、物理断电与真机后台回收。下一 checkpoint：E3 正文窗口、Range 消费、旧楼层入口闭口与存读档路线 UX。

## E3 — Range / 正文窗口 / Play 边界（E3.1–E3.4）

- Start HEAD：`565b77a48`；End HEAD：`6e26bca41`，已推送。
- Native Play 消费带 Revision/Branch 身份的 Range API，64 条正文窗口、动态测量/稀疏有界高度表、旧请求 abort/epoch、顶部/底部占位、回到最新、选区/焦点保护、草稿独立展示、卸载插画/语音/观察器。Range 直接返回权威出生 Variant 的投影；不把投影挪入存储 Entry。当前 HEAD 查询不再扫描全历史可达链。
- 追踪隐藏 ABI：`openNativeSession` 的 generation `chat` 和 `printMessages` 仍服务生成，因此保留 ABI 和完整上下文数据，隐藏 DOM 单独限制 64；不以清除生成依赖降低质量。当前活动 Runtime 全文快照成本仍存在，不能声称全部内存已与历史规模无关。
- 删除正式 HTTP Fork/Retry 分发、固定 Host targets、Runtime/Core 任意 Fork/Retry 方法、全局 Restart/Re-enter/Retry、历史面板旁路；旧 Hide/Unhide 在 Native 前拒绝。媒体翻页与资源删除保留。新手动 SavePoint 必须是当前已提交 HEAD；既有 SavePoint 能派生独立路线。
- 现有历史视图继续搜索/分页，增加来源 SavePoint、Branch 展示改名/归档筛选、自动存档配置；终局界面禁止编辑/发送并解释只读。终局读取不自动套用当前外部 Continuity/Realm 去改历史状态。
- 实际本地验证：PlayProduct/PlayControls/SessionHistory 20 用例；SessionCore 22 用例；HTTP 11 + Window Epoch 1；插图 19 用例。旧测试里的任意 Fork/Retry/历史 Save 构造改为明确 SavePoint；没有为产品保留兼容 shim。发现插图直接使用旧数组，修复后再通过。
- 浏览器：`native-play-window.smoke.mjs` 使用真实 FS/SessionRepo Range + Chromium `141.0.7390.37`，1440/390px × 100/1k/5k 六组均 64 DOM 正文节点、实际 Range 请求、历史滚动/流式节点保留、dispose；无 pageerror。记录的 settled mount 约 91–96 ms **包含固定 80ms 观察等待**，不能当成真实启动 T3/P95。移动视口不是 Termux 真机。
- 最小 ESLint/语法/diff check 通过。下一 checkpoint：E4 Scope 释放、字节预算、可恢复隔离 GC 和前台优先维护。

## E4 — 用户要求交接时的未完成检查点

- Start HEAD：`6e26bca41`；草稿 / Tested HEAD：`0433bc10c`，产品分支检查点提交；**不是 E4 完成提交，不满足合并门槛**。用户撤回误发的 main.c 问题，明确要求在恰当位置停止并提供新对话提示词；因此保存草稿和恢复快照，未开始 E5–E7。
- 草稿内容：异步 durable 文件屏障和 Native FS 会话分目录读取；事务 ALS 生命周期封闭；Scheduler 释放结束任务的执行闭包、维护不压过前台；Memory Source Scope/Corpus 释放；Chat Snapshot/正文窗口字节预算；Session GC 引用根代际、隔离候选、读者租约、批次与持久 cursor；Save 导出租约；Turn 后复用既有 Scheduler 发起维护；SQLite PASSIVE checkpoint；Blob 发布租约及持久隔离清理。
- 交接前最小本地验证：全部 18 个修改 / 新增 JS 的 ESLint、`git diff --check` 通过。Jest 6 套 **58 passed / 4 failed**，6.79 秒：`source-lifecycle`、`chat-snapshot-cache`、`durable-commit`、`lifecycle-scheduler-p4` 通过；`storage-foundation.contract` 和 `storage-references.contract` 各在 FS / SQLite 下失败一项。
- 四项失败均为原夹具期待 `gcBlobs()` 第一次调用立即删除 Blob，但草稿第一步只隔离，返回 `[]`。续接应保留保护引用的断言，并新增隔离期、推进测试时钟、重启恢复、重新引用及租约竞争验证；不能简单恢复立即删除或仅改期望绕过安全验证。
- 待完成 / 优先风险：`SessionRepo.gcRevisions` 旧立即删除路径仍在；`atri_gc_progress` 需审计保留命名空间保护；Blob GC 的批参数、候选扫描预算、并发维护与前台调度尚未收束；Session Mark 跨读让出后需验证 generation 和并发 SavePoint；目前 Turn 自动维护失败被静默捕获；窗口 trim 弹出尾项可能误排除最新正文，压力 API 未接实际 View/后台事件，fallback/clear 的预算与释放待验证；租约、批次/重启专项测试、重复生命周期内存证据尚未补齐。关闭 WAL autocheckpoint 后的实际维护覆盖也待证。
- 新模块 `src/native/session-maintenance.js` 尚无专项测试，不能用已有 durable/Scheduler 用例替代其安全证明。测试未执行全仓、CI、Provider 或真机。当前停止依据仅为用户明确交接请求，普通失败由下一对话继续解决。
- 下一 checkpoint：按当时活跃 HANDOFF 从真实 Git 恢复 E4（完成后删除 live 交接文件），先补 GC/租约/并发相关验证并修复上述缺口，再按冻结路线完成 E4→E5→E6→E7；仅全部相关验收完成后合并 main 并清理。


## E4 — 续接完成：资源预算、安全维护与生命周期（E4.1–E4.4）

- Start HEAD：`0433bc10c`（E4 草稿）；End/Tested HEAD：`fb8aa9273`；前序草稿和失败事实保留。
- Session GC 统一 `gcRevisions` 与维护权威；`retainRevisionIds` 保护完整依赖闭包。进度移入独立 `atri_maintenance`，旧 `atri_gc_progress` 保留为禁止游戏写入的命名空间。Mark 分散读的结果仅在事务内 root/save generation 一致时发布；Sweep 与写根共享隔离，并重新检查读者租约、对象 integrity/更新时间。读锁 ALS scope 增加 open 生命周期，避免已结束上下文借用重入权限。
- FS/SQLite 候选扫描按持久 kind/cursor、记录数与估算字节限额分片；隔离、宽限、重启后扫描/删除游标可恢复。Blob 扫描按 hash 目录/cursor，进度与并发维护串行；同 hash 发布/Package install 租约和重新引用检查保护发布，打开 delivery 的读者租约保护到 close。单个不可分割记录允许超过候选字节预算；可达根遍历仍需全闭包，但逐读释放引擎事务。
- 复用 NativeTaskScheduler：前台/abort 在安全边界暂停；短维护 slice 后由可取消、unref、有界续扫 timer 继续，不创建第二套执行调度器。Turn 后维护失败只输出非敏感诊断，不将已确认 Turn 变成重复提交。Session 删除取消待续扫 timer。Blob 与 PASSIVE checkpoint 纳入维护。SQLite PASSIVE 操作排入同连接事务 tail；保留 1000 页 automatic checkpoint 安全网，避免停用 autocheckpoint 后未进入 Turn 的其它写入使 WAL 无界增长；没有自动 VACUUM。
- FS journal 的文件/目录屏障及恢复转为异步 I/O，完整依赖安装仍先于读者/ACK。Session envelope 分目录 dev 硬切说明写入产品 `src/storage/README.md`，没有旧平铺兼容读取。
- 正文预算同时覆盖同步 fallback 和异步 Range；裁剪保留连续阅读/最新锚点，单个超大正文或选区/焦点保护可暂时超过预算，不损失全文。后台 visibility/显式压力事件接入正文与 Chat Snapshot；clear/dispose 清除预算、scope、frame、DOM/listener。Memory Source/Corpus 在加载/关闭/切分支时释放；Scheduler 终态只保留有限投影，解除执行闭包。
- 最小本地验证：新增维护 14 项（FS/SQLite 各 7）全部通过，含真实 engine close/reopen、有限批次 cursor、根变化/并发 SavePoint、retain 闭包、读者/导出与 delivery 租约、重新引用/同 hash 发布竞争、并发维护、前台/abort 与 PASSIVE；原 Storage 三套 12 项通过，四项旧立即 Blob 删除失败已改为隔离宽限协议。Window 2 + PlayProduct 16 + durable-commit 7 共 25 项通过；Memory Source 生命周期 35、Chat Snapshot 7、Scheduler 7 通过（已通过且未受后续修改影响者未重复运行）。Journal 五进程切点仍为 S1，非物理 S2。
- 新窗口测试首次暴露整条边界 reading anchor 偏移，修正二分比较后通过；delivery 首次测试未遍历 Package hash 目录，修正为实际隔离游标遍历后通过。针对修改产品 JS/新增维护测试的 ESLint、diff check 通过；既有 source-lifecycle 测试第 59–61 行含原有 conditional-expect lint，未无关修改。
- 生命周期证据：20 次相同 Play mount/pressure/dispose，document listeners 与产品节点均回到零；30 次 Memory scope 往返 cache/observed/pending/queues 均为零、旧 snapshot 撤销。Jest 进程未强制 GC 的 10/20/30 轮 heapUsed 205890840/208917992/211947560 bytes，external 均 86886428、RSS 均 521441280；这是短时分项采样和显式对象释放证据，不能声称小时级 Heap 稳态或完成浏览器 Retaining Path/真实 Termux 低内存证明。
- 候选值仍为本机实现参数（4/16 MiB、32 sweep、128 scan、60s grace）；设备物理 S2、Windows/Termux、小时级内存/Android 后台回收仍如实待证。下一 checkpoint：E5 来源证明驱动增量准备、精确 Token 与两条 Turn 链的 Context Join。


## E5 — 来源证明增量准备、精确计数与 Context Join（E5.1–E5.4）

- Start HEAD：`fb8aa9273`；End/Tested HEAD：`5d53b4204`，已推送。
- 继承现有 Corpus 16MiB/16-entry 缓存，预算包含词袋、倒排和图邻接；移除额外 10000 document 限制，以真实估算字节限制为准。新合法 Corpus 建立后，仅在同 Owner/Session/Branch/requester/view/at 分区复用同 ID/文本的确定性词袋；完整命中仍依确切 Source/Eligibility 私有证明。每次排名仍重选当前状态/时态/覆写候选，DF 仅计算当前合法 ID 集，图边仅取当前关系，不缓存排名或答案。
- 已确认来源通过现有 ledger/S2 Native Timeline 投影进入 Base+Delta 合法候选；新增 source 回合复用 20 个稳定 document、准备 1 个新 document，当即召回新承诺；来源修改/撤回下一次查询排除旧证据。向量保留 profile/content fingerprint 和查询结果二次核验；没有可靠远端 generation 通知时仍做 listHashes 对账，不凭本地缓存猜测远端水位。没有重新嵌入未变化文档，原有实际工作/成本准入保持。
- Context 计数标量在确定 Tokenizer function 与 owner/session/branch scope 下有界复用（每 scope 64KiB/256 fragments，每 counter 16 scopes）；纯数字复用发生在合法来源筛选之后。原 Knowledge 与候选计数共用本次 wrapper；后端实际接入 Route 配置的 tokenizer（此前 adapter 传入 tokenizerFor 却未调用）。OpenAI-compatible provider 复用同 encoding tokenizer 实例。完整 Provider wire Prompt 仍在 GenerationService 独立重新计数和预算检查，不把片段相加当作精确最终值；缺 exact Tokenizer 的 provider 保留原有保守计数说明。
- 两条链路：Package Turn 的最多 4 个 transient turn_context stages 只有显式输入、共享同一 pin、不能消费其它 stage 输出，因此在既有 Turn Scheduler owner 内最多 2 并发；失败 abort/等待 sibling 结束，输出与 provenance 保持声明顺序，所有 stage Join 后才 Narrator。Authority commands/正式发布仍有顺序与 CAS 屏障。Game LLM 保持 Command commit → refreshed World/Journal → Recall → Narration，新增本回合 World/Branch/Revision currentness 与 Recall guard，在 Join/可选 orchestration 后重验。
- Play Package Recall 与 Context compiler 的晚到结果拒绝回填旧 Runtime；same Branch/new Revision 在 Memory openSession 后即中止；Information/Memory exposure 拒绝沿 scope error 传播，不能降级空 Memory。Vector/Rerank 的可选服务失败仍可诊断地保留合法基础召回；Provider 超时/成本未知状态沿用现有持久 ledger、fallback/receipt，不重发已确认输入。
- 最小本地验证：第一组 6 套 70 项通过（Corpus/Hybrid/Context/Package bridge/Game bridge/Game Runtime）；新增增量、权限、same-Branch stale、精确非线性计数与真实 Package preparation Join 的覆盖，第二组 7 套首次 78通过/1失败，失败是测试直接写冻结 manifest；clone manifest 后 preparation 4 项通过。Generation local-work 40、wire/context binding 4、orchestrator narrative 8、更新的 bridge/reuse 23 项通过；evaluation-revision 5、recovery-budget 4 项通过。产品修改 JS/新测试 ESLint、diff check 通过。
- 同机离线夹具 3 暖样本，完整 rank 对象逐项相等，Person42 的第一结果均 relation:r42；这些为小样本诊断而非 SLA：

| 事实规模 / documents | Raw rank P95 ms | Prepared rank P95 ms | 首次准备 ms | Worker+序列化 P95 ms | 估算缓存 bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 / 300 | 3.15 | 1.28 | 1.44 | 48.11 | 282951 |
| 1k / 3k | 13.91 | 9.62 | 13.29 | 48.81 | 2869551 |
| 5k / 15k | 62.95 | 41.39 | 57.50 | 251.58 | 14537551 |

- Worker 首个样本包含启动，其余仍包含完整传输与准备；本机已准备 JS 的端到端净收益更好，未引入 Worker 常驻池或 Rust/WASM，没有明确净收益证据时不增加维护与跨端成本。首次 Corpus 构建/状态证明、远端对账和最终排名仍有成本，不声称整个 Recall 已变成 O(delta)。
- 没有外部模型调用；六维 RP/Project 评价与人工晋级/独立证据/费用规则未削弱，但本阶段只证明离线证据等价、预算与拒绝行为，真实同模型 RP 文学质量、Provider cache-hit/Token/费用改善仍待证，不把 scalar/cache 标签冒充模型节约。下一 checkpoint：E6 Bundle 指纹与真实 PlayReady。


## E6 — Bundle 合同与真实 PlayReady（E6.1–E6.3）

- Start HEAD：`5d53b4204`；End/Tested HEAD：`45961b4a2`，已推送。
- 五个 production Bundle 的入口清单统一在 webpack.config；输入指纹跟随 repository-local import/export/literal dynamic import/URL 依赖图、lockfile 和 Webpack/schema 版本，路径规范化为跨端一致分隔符。`frontend:prebuild-cache` 与服务器使用同一 `atria-bundles.json`，核对当前指纹、精确产物集合、大小/SHA-256；损坏/过期/缺失显式报告 reason，拒绝仅“文件存在”缓存。编译 error/Stats failure 不再 resolve frontend-ready；仅验证通过的目录可由 Bundle middleware 交付。旧缓存搬运须同样具备当前 manifest，不再凭 mtime 猜测来源。
- 保留 init.js 并行模块树、Server Lazy Router 和 Termux private cache；仅将 Stats 点击/调试注册与 Logprobs 面板观察器延后到 APP_READY 后，CFG 与安全/身份/Tokenizer/Capability 初始化仍在原必要边界。启动预构建输出报告实际 resolver source/path；Termux 的 HTTP 提示改为 Server reachable。APK/远程部署暂缓，未改其打包合同；显式外置 Bundle 必须同时带当前 manifest。
- PlayReady 独立于 HTTP/APP_READY：Host `play/prepare` 只读核对当前 Core/Run、Task/Route/Prompt/Model 与本地 Secret，不发送模型；View 同时要求最新实际 Range、完成 Experience Ready/pump、可写且可见 Composer。Late preflight、切 scope 与 Runtime 配置变更释放 controller/epoch；Terminal/History 只读不报可发送。Lifecycle public ready 仅在必要异步 command/pump 完成后为真，补齐此前中途 ready=true 缺口。
- 沿用现有 `__atriaStartupTiming` 和 startup store，分别记录 shellInteractive、appReady、optionalReady、playReady 与相应间隔；不把先移遮罩当成全部可玩。无需新增外部模型调用来判就绪，Provider 在线可用性仍不能由本地 preflight 保证。
- 最小本地验证：Bundle 7 项通过（manifest 丢失/部分/指纹变化/内容损坏/Termux resolver 等）；原 UI/Lifecycle/启动遥测 5 套 59 项通过；新 Host 准备+Lifecycle 中途 false+E5 optional guidance 后撤销 Join，共 3 套 44 项通过；startup store + 修改后的 Play listener 往返 20 项通过。ESLint/diff check、Termux shell syntax 通过。没有全仓 build/test；仅五个 Bundle 的必要生产预构建。
- 本机 Webpack 5.106.1 首次 targeted compile 11978 ms、close 1917 ms，包含导入/屏障准备到 compiled milestone 约 14.23s；第二次诊断生成相同 Bundle（11906/1864ms），后续问题排查沿用已验证缓存。正式成功浏览器跑的 warm manifest 验证 8.67ms，首次缓存进入 13.68ms。完整性 SHA 校验没有退化成只看 stat。
- CachyOS Node24.21.0 本地 `server.js`，隔离 FS/默认用户/明确 text Experience Package/已配置本地 Runtime/Secret，Chromium141；显式在 APP_READY 后打开 Session。以下为 E6 初始 marker 单样本：**E7 真实点击发现 onboarding 对话框遮挡，因此这里的 marker 不能称最终 PlayReady；以 E7 加入 modal/可见性保护后的结果为准**，保留原始测量事实：

| 条件 | ShellInteractive（导航 ms） | APP_READY ms | PlayReady ms | 显式 Session open→观察到 Ready ms | pageerror / 正文节点 |
| --- | ---: | ---: | ---: | ---: | --- |
| cold-browser | 1330.4 | 2209.4 | 2539.4 | 348.97 | 0 / 1 |
| warm-browser | 1251.1 | 1964.4 | 2291.6 | 347.58 | 0 / 1 |

- 进程 start→HTTP 观察可达两次 3371.87 / 1913.67ms（50ms polling；已构建缓存、第二次文件暖缓存，非 OS 硬冷启）。观察到 PlayReady 的完整导航耗时 2563.40 / 2315.87ms；本地假 Provider 收到 **0** 推理请求。
- 初次浏览器检查失败：Storage-only Session fixture 没有 formal Experience runtime，runtime/resolve 正确返回400、没有冒报 PlayReady；改为正式 text Experience fixture 后真实流程通过。期间 config 初始化与默认用户 harness 映射两项夹具错误也已修正；未降低产品检查。
- Windows、真实 Termux Node/SQLite ABI/浏览器/后台恢复及自动 Session resume 首玩时间仍缺设备证据。默认 Node/引擎与缓存/GC 候选参数不凭本机单样本冻结；APK/Kotlin/远程部署未扩展。下一 checkpoint：E7 可达性/回执/终局/GC 横切、关键用户价值复测及主线集成。


## E7 — 横切验收、回归诊断与集成准备（E7.1–E7.3）

- Start HEAD：`45961b4a2`；End/Tested content：`7e1045ab8`（`8465e782f` 核心修复 + smoke scope/globals 定向静态修正）；产品提交已推送。验证在对应未提交内容上执行后固化到这些提交，不把命令输出的前序 HEAD 冒充提交后的重复运行。
- E7.1：新增 FS/SQLite 根/租约/SavePoint/Branch/ACK uncertainty 交错，旧 ACK 请求在 GC 后只产生一次正文，Session 全删同时释放维护进度。真实子进程在 GC publish/install 两切点退出，重启先完成 journal，正文/世界根、SavePoint、commit receipt 和 cursor 均完整，幂等重试一致。这是 S1/协议恢复，**不是物理 S2**。铁人 death 根经过完整维护轮次仍保留正文和旧 SavePoint，只读禁止复活。
- 测量发现 E4 Mark 为每个对象新建 SQLite Transaction/PreparedStatements，5k GC P95 6360.46ms、整轮 RSS 3446489088 bytes；修复为每连接复用语句 owner，close/restore/delete/closeHandle 显式 dispose，事务仍走同一 serial tail。FS snapshot 用同一固定事务下最多 4 并发读取，保持原顺序/身份/完整性，失败等待所有 sibling；SQLite/Mark 每 32 读让出 macrotask，队列事件可以暂停长 Mark，不用 async/microtask 假称非阻塞。
- 重复 Mark 的不可变可达身份证明采用 engine/owner/session + root/save generation + retain fingerprint 的短时预算缓存（最多 8 scopes/8MiB/60s），不保留原文；新根/SavePoint/retain 变化或重启必重建，Sweep 仍在事务内二次验证 generation/租约。隔离/删除 cursor 继续持久化。预期 stale/cancel 不再误报维护失败，真实异常仍诊断；没有第二套 GC 权威。
- SQLite 5k 修复中间样本 Load/Append/GC P95 424.96/844.14/800.53ms、整轮 RSS 665907200 bytes；最终增加有界 proof/macro-yield 后，三个暖样本结果如下。GC P95 含首次全闭包 Mark，P50 表示后续复用切片，不能与 E0 旧“无需处理”的立即 GC 0.63ms 混作同工作量：

| Engine / 5k | Load P50/P95 ms | Range20 P50/P95 ms | Append P50/P95 ms | GC slice P50/P95 ms | 轮末 Heap / external / RSS bytes |
| --- | --- | --- | --- | --- | --- |
| FS | 776.76 / 859.68 | 5.19 / 11.36 | 1613.23 / 1621.97 | 12.84 / 1942.58 | 310055616 / 23178121 / 542404608 |
| SQLite | 452.17 / 493.55 | 2.50 / 2.51 | 938.76 / 995.69 | 3.57 / 786.23 | 234282992 / 22093821 / 586543104 |

- 原 E0 5k Range P95 FS31.05/SQLite33.22ms，最终仍明显下降；FS 从 E4 回归 1013.51/1883.81ms 改善，但比 E2 完整 Load546.31/Append1118.46ms 仍慢，SQLite 完整路径也没有全面胜过早期基线。完整 Runtime/隐藏 generation ABI 历史驻留与全量校验仍是后续热点，没有缩短正文/上下文或改默认引擎隐藏成本。最终 bench event-loop P95/max 14.20/996.67ms 包含批量 fixture/完整提交/GC/分配，不冒称用户输入 INP；大批 CPU 工作尚不能说全部达成帧预算。
- E7.2：实际浏览器点击揭示并修复两点：open onboarding dialog 覆盖 Composer 时不允许 PlayReady（可见性/inert/modal 和释放 observer）；没有 authored Game logic 的正式 text Package 走原 Native narrator 提交，不误用未建立的 Game LLM，声明 Game logic 的 Package 仍走其权威链。旧 E6 marker 表已明确降级为初始候选事实。
- **最终可交互 startup**：同 Node24/Chromium141，隔离的已有用户设置 `firstRun=false`、正式 text Experience、实际 FS/Core/Route/Secret 和真实本地服务器；APP_READY 后显式 open，准备时 **0** 推理调用，warm-browser 后实际 Composer click 使用本地假 Provider **1** 请求，用户消息/assistant 正文各且仅 1 次持久保存；不是外部模型/API 质量试验：

| 条件 | Shell / APP_READY / PlayReady（导航 ms） | Session open→观察到 Ready ms | 导航→观察到 Ready ms | pageerror / nodes |
| --- | --- | ---: | ---: | --- |
| cold-browser | 1254.0 / 2097.1 / 2429.2 | 355.09 | 2456.94 | 0 / 1 |
| warm-browser | 1077.0 / 1769.4 / 2095.4 | 344.41 | 2116.48 | 0 / 1 |

- 同跑进程→HTTP 3416.13/1855.01ms；warm bundle integrity 10.80ms。单样本/50ms HTTP polling/已缓存产物，不报为硬冷启或 P95。E7 首次 click 被 onboarding 拦住，修复判据并采用已有用户夹具后通过；没有强制 click 穿透弹窗来伪造可用性。
- 真实 FS Range + Browser 长正文：1440/390×100/1k/5k 六组均 64 DOM、历史滚动/stream 节点保留/dispose 无 pageerror；新 modal observer 后只补受影响的 5k 两视口（仍各64），mount 105.6/99.4ms 含固定80ms等待，不当 PlayReady。smoke 增加可选 sizes/widths，初次缩范围发现 widths 未实际消费；静态修正为真实可选 scope，浏览器全局改为明确 window.product，最终 ESLint 通过。
- 最小相关本地验收：Core/maintenance/durable-commit 43 项；新增横切 + maintenance + long-term storage 24 项，之后添加长 Mark pause 再对两专项 20 项；generation/publication/storage 5 套 53 项；最终可点击判据 + narrator path 19 项；SQLite close/settings + 扩展 evaluator source pin 17 项通过。新 index/Token/DAG/Context 来源代码加入 evaluatorRevision，源码变化拒绝旧评价报告，RP/Project 六维、独立审查与真实费用规则不被准备缓存冒充。全部修改产品 JS/新测试 ESLint、diff check 通过；没有全仓 lint/test/build、CI 等待或新外部 Provider 调用。
- E7.3：冻结的 E0(4)+E1(4)+E2(4)+E3(4)+E4(4)+E5(4)+E6(3)+E7(3)=**8 阶段 / 30 单元**核对完毕，沿用同一分支/Record。性能候选数值仍未认证为三端最佳。全部可独立取得的本地验收完成；下述待证不伪装通过，也不增加整任务停工门槛。

## 保留的证据边界与后续候选

- Windows / 真正 Android Termux 的 Node/V8/SQLite ABI、FS/VFS 同步能力、浏览器冷/热启/更新和低内存后台恢复尚无设备证据；Chromium 390px 只证明 Web 窗口行为。APK 与远程部署仍按方案暂缓。
- 物理断电/OS 崩溃的 S2 设备证明未取得；进程故障只证明当前协议恢复。默认引擎未替换，不认证 optional 引擎或静默 S2 后备。
- 小规模反复 scope/DOM/listener/lease/object 释放已有证据；小时级 Heap/External/RSS、浏览器 Retaining Path/FD/GPU 与 Android 回收未测。没有生产强制 GC。
- Source-authorized 离线排名、来源/认知隔离、Context Join 与预算/回执可追溯；真实同模型 RP/Project 六维结果、provider cache usage/Token/价格收益尚无新增证据。无远端可信水位时 vector listHashes 仍对账。不能说完整 Recall O(delta)、整个活动历史内存有界或所有 Load/Append 提速。


## 最终集成与清理

- 本地 `main` 从 `73c7913b22daae98b6348fad0f3eee1cfce1f080` 快进到 `7e1045ab836c22cafbc92c5de056ad701f56e723`，与已验证产品提交内容完全相同，没有冲突或新产品变化；按 Governance §12 只核对 HEAD、diff、clean status 与同步，不重跑已通过检查。
- `main` 已推送；`main` / `origin/main` HEAD 相等，产品工作树 clean。开发分支的祖先/已合并检查通过后，删除本地及远端 `refactor/atria-performance-long-term-experience` 与对应工作树；只解除本任务两个指向稳定 main 的忽略依赖 symlink，稳定 main 依赖不删除。
- 本任务独有的隔离测试数据/本地假 Secret/Provider/服务器/浏览器均清理；临时 `/tmp/atria-performance-startup-cache` 与空 task 父目录删除。其它活跃 `feat/atria-project-skill-routing` 与长期 docs/package/plugin 工作空间保留。
- 本任务 live HANDOFF 删除；原交接的有价值事实已在本累计 Record 保留。Plan Index/Roadmap 路由更新为已实施，不改变冻结设计、阶段/30 单元或将设备待证伪写为通过。`docs` 保持独立，不合入 main。
