# Atria 性能与长期使用体验 — 累计 Record

- Task ID：`refactor/atria-performance-long-term-experience`
- Plan：[冻结总纲](../../plans/refactor/atria-performance-long-term-experience/index.md) / [E0–E7 路线](../../plans/refactor/atria-performance-long-term-experience/implementation-roadmap.md)
- Primary Workspace：产品 `main`；施工分支 `refactor/atria-performance-long-term-experience`
- 授权：2026-10-13 用户明确要求连续实施全部 8 阶段 / 30 任务，最终合并、验证和清理。
- 当前状态：E0–E3 本地实施完成；E4 未完成草稿已保存为交接检查点 `0433bc10c`。用户明确要求换新对话续接，当前暂停；平台物理 S2 证明仍待证，E4–E7 尚未完成，未合并 main。

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
- 下一 checkpoint：按 [HANDOFF](../../HANDOFF.md) 从真实 Git 恢复 E4，先补 GC/租约/并发相关验证并修复上述缺口，再按冻结路线完成 E4→E5→E6→E7；仅全部相关验收完成后合并 main 并清理。
