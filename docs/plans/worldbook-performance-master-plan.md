# Atria 世界书重构与长期性能优化总文档

> 状态：调研与设计草案，尚未进入实现。整理日期：2026-09-18。
>
> 授权范围：文档创建与合并；不包含业务代码修改、数据迁移、扩展安装、部署或整体重写。
>
> 代码基线：`main@12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3`。

本文件按内容块整理后合并，最终只有这一份维护文档。性能与世界书是两个内容块，不是两份长期维护的文档；`P-*`／`W-*` 是未来实施建议的范围编号，不代表已获批或已执行。

## 实施启动记录 · 2026-09-18

用户已在后续请求中明确授权创建分支、存放文档并开始实装。上方“仅文档授权”保留为原调研阶段的历史边界，不代表当前授权。

- 实施基线：`main@65321bb522febd369901127cd2b4b2c9883d4658`；已复核相对调研基线新增的备份／存储中心改动。
- 首批任务分支：`feat/worldbook-performance-foundation`。
- 首批写集：聊天写快照的容量／生命周期、世界书输出片段来源与 Orchestrator 过滤、相应确定性测试和合成基准。
- 原则：不改存储格式、不删用户数据、不改扫描／概率／时效／预算语义、不新增默认模型调用；Android 与 Docker 不运行。
- 验证：先回归已知重复正文和正则改写问题，再检查缓存切换、排队写入和异常释放；运行相关测试及 lint。浏览器长期堆、真实扩展和最终提供商请求单独标记，不以 Node 测试代替。
- 分片状态：P-01 已完成有界聊天快照生命周期切口；W-01 已完成条目身份／来源到最终请求边界的轻量归因；W-02 已完成纯评估／显式提交分离并通过真实 Chromium、完整 Unit、Lint、Workspace 与迁移守卫。W-03 已启动，仅进入受限原生状态条件第一切口；W-04／W-05、P-02 至 P-05 仍未开始。
- 回滚：首批作为独立代码提交，可整体 revert；无数据迁移。
- 工程路由：`tavern-card-builder` → `consult-tavernweave-library`，快照 `2026-08-18`；已读取 ST-A0 与 ST-A3 相关章节。精确字段以当前 Atria 源码为准；设计／动效候选未采用。

## 实施进度记录 · 2026-09-18

- **P-01 已完成：** 聊天 wire snapshot 改为有界工作集；活跃／排队写入期间保留，结算后淘汰；异常释放和 clone 隔离已有回归。
- **W-01 已完成：** 世界书 occurrence identity / provenance 贯穿渲染、Orchestrator 过滤与最终请求诊断；相同正文、正则改写和不同接收方不会再靠正文反查来源。
- **W-02 已完成：** 世界书扫描为纯评估；timed state、force-activation 消费和 `WORLD_INFO_ACTIVATED` 只在显式 `commitWorldInfoEvaluation()` 提交；稳定 evaluation ID、防 stale chat scope、重复提交幂等均已覆盖。
- **W-02 出口证据：** `Worldbook Performance Foundation`（focused Jest、synthetic benchmark、真实 Chromium host smoke）通过；`Workspace UI` 通过；`Atria PR Checks` 的 Lint、Migration Guard、完整 Unit Tests 全部通过。
- **W-03a 已完成：** 受限原生状态条件已接入世界书扫描、activation trace、角色卡往返与结构化作者 UI；MVU/LoreState 继续作为只读事实源，缺 provider／缺字段／busy/error／malformed 均 fail closed 为 `unknown`。完整 Unit、Lint、Migration Guard、Workspace UI 与真实 Chromium host smoke 全绿。
- **W-03b 当前边界：** 开始状态变化事件。事件只比较“上一次已提交 provider 基线”和“本次只读 provider 快照”；评估不推进基线，只有最终 `commitWorldInfoEvaluation()` 才推进。首次没有基线、旧值未知或当前值未知都返回 `unknown`，不伪造变化。
- Android 与 Docker 仍按用户约束不默认构建。

## 目录

1. [共同目标、范围与证据边界](#overview)
2. [内容块 A：长期运行／长聊天性能](#performance)
3. [内容块 B：世界书机制重构](#worldbook)
4. [统一分片与执行顺序](#roadmap)
5. [验收、迁移与当前验证状态](#verification)
6. [附录：隔离基准复现](#reproduce)
7. [来源与工程路由](#references)

<a id="overview"></a>
## 1. 共同目标、范围与证据边界

### 1.1 两个目标，一套约束

- **性能目标：** 聊天历史可以增长，但日常交互、内存占用和单条写入不能总是处理完整历史。
- **世界书目标：** 保留世界书作为作者入口，底层明确区分资料、状态、条件、接收方和动作。
- **共同原则：** 复用现有服务、状态和持久化；不以删聊天、降低可靠保存、放宽安全边界或增加默认付费调用换取表面收益。
- **推进方式：** 先建立可重放基线，再一次只改一个边界。本文是建议，不是直接批量实施的授权。

### 1.2 固定快照与资料

- Atria 源码：`12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3`；所有 Atria 链接固定到此提交。
- 文档整理基线：`docs@c66b85b7a7ee2ed6dfc9097ec579440f0570eb4d`；交接入口为 [latest-handoff](../handoff/latest-handoff.md)。
- 上游比较：仓库 `vanilla@e07c9e2af` 参考快照，其包版本为 SillyTavern 1.19.0；不代表用户实际安装版本。
- [SillyTavern 官方世界书文档][external-st]：固定到 `70e5e4d3c239253fca4692fe82e3936cb9c4b1b1`。
- [RisuAI 触发结构对照][external-risu]：固定到 `d31fea55384ef5e1bd78ffc813e40d8d144edce7`。仅作机制比较，未引入代码或依赖，未做跨产品性能评测。
- 不包含未合并功能分支。主线更新后必须重新核对调用路径；不能用文档叙述代替已集成代码。

### 1.3 已检查范围与覆盖缺口

已检查主聊天加载、分页和追加、文件／SQLite 存储、聊天快照、提示词诊断、格式化与流式刷新，以及世界书定义、扫描、预算、时效、注入、向量入口、Orchestrator 过滤、状态与上下文接入边界。

这不是全仓审计。尚未完成用户真实卡库、真实第三方扩展、浏览器长时间 CPU／堆快照、所有持久化分支、全部存储引擎磁盘测试及提供商端到端检查。Android 与 Docker 不在本次验证范围。

### 1.4 证据等级

| 标记 | 含义 |
| --- | --- |
| 源码确认 | 在固定提交中读到的结构或调用路径 |
| 离线复现／测量 | 对生产辅助函数和合成数据的隔离观察，不是完整宿主验收 |
| 设计建议 | 本文提出的目标，不代表已经实现或获准施工 |
| 待真机验证 | 需要实际 Atria、卡片、扩展和最终请求证据 |

“存在随规模增长的工作”与“这是用户机器的首要瓶颈”分开表述。P1/P2 表示处理优先级，不自动认定为线上事故。历史隔离采样沿用此前调研记录；本次文档合并没有重跑耗时采样。

<a id="performance"></a>
## 2. 内容块 A：长期运行／长聊天性能

### A.1 已有优化：不要重复建设

Atria 已经有以下基础，实施时应保留并扩展：

- 默认只显示最近 100 条聊天，流式刷新默认 30 FPS。[设置][p-settings]
- 批量 DOM 添加和流式限帧；但它们不等于端到端分页或增量格式化。[显示路径][p-display] · [流式调度][p-stream-loop]
- 客户端 tokenizer 与 Worker、批量计数；token 缓存在切换聊天时会淘汰其他聊天的子缓存。[token 生命周期][p-token-cache]
- 增量网络接口、序列化聊天写队列和并发完整性校验；不能为了速度移除这些保护。[写队列与快照][p-snapshots]
- 存储仓库／引擎抽象，以及文件、SQLite、MySQL、PostgreSQL 模式。[存储架构][p-storage-readme]
- Memory 检查器已有 Worker 和绘制限制；不能把“增加 Worker”泛化成所有路径都尚未做的事。[检查器][p-memory-worker]

主要矛盾是：某一层已经增量化，后续层仍可能处理完整历史。

### A.2 性能热点与重构方向

#### P-F01 · P1 · 读取与追加仍存在整聊成本

**源码确认：**

- 打开聊天调用完整读取接口，然后把返回消息装入 `chat` 数组。[前端加载][p-load]
- 分页接口先通过仓库取得完整聊天，再对消息数组切片。[分页接口][p-delta]
- 已检查的主聊天 `/append` 路径读取历史、拼接新消息，再调用整聊保存；同时会在调用备份节流函数之前生成整聊备份字符串。[追加路径][p-append]
- 文件引擎同步读取并解析整份 JSONL，保存时序列化所有消息并同步原子写回。[文件引擎][p-fs]
- SQLite 聊天记录当前仍把 `{header, body}` 存为一个 JSON 文档；切换到 SQLite 本身不能消除上述数据粒度。[SQLite 引擎][p-sqlite]

**影响：** 只发送一条新消息，不代表后端只读写一条。历史总字节数增长，会放大读取、解析、序列化及写入工作。当前证据不代表所有生成持久化分支都走同一条路径。

**方向：** 消息级存储、范围读取、稳定消息 ID，以及原生 append／局部 patch。保留导入导出兼容，不以关闭可靠落盘或并发校验换取速度。

#### P-F02 · P1 · 跨聊天完整快照缺少正常切换淘汰

**源码确认：** 消息快照按聊天键存入 Map，内容是整份消息数组的 JSON 克隆。正常 `clearChat` 路径清理显示和当前数组，但没有相应容量淘汰。已检查的失效调用主要用于写入恢复等路径。[快照][p-snapshots] · [切换清理][p-clear]

**影响：** 反复打开不同长聊天，会保留多份历史快照；这是明确的引用保留与容量治理问题。尚未通过浏览器堆快照量化其占比，也不把所有内存增长都称为泄漏。

**方向：** 字节预算、可淘汰缓存与写入／生成任务的临时保留机制。不能在未完成写入或冲突恢复期间无条件清空所需快照。

#### P-F03 · P1 · 提示词诊断记录随轮次增长，整组加载与保存

**源码确认：** 每轮生成会记录原始提示词、世界书等多种提示片段；记录集合按聊天整体从 IndexedDB 读取、整体写入。[采集内容][p-prompt-capture] · [诊断持久化][p-prompt-store]

**影响：** 诊断记录可能反复包含上下文，规模不等同于聊天正文。若每轮保留的上下文体积约为 C，N 轮诊断可接近 N×C；这不是“所有聊天都严格二次增长”的结论。

**方向：** 按消息／运行单独存储，摘要索引常驻，旧记录按需加载。保留策略需显式配置；默认不得把删除聊天正文当作缓存优化。

#### P-F04 · P1 · 流式刷新仍重复处理全文和历史索引

**源码确认：** 每次格式化消息都会遍历当前聊天数组以计算非系统消息深度；流式刷新会对累计回复重新格式化并更新消息 DOM。[深度计算][p-depth] · [刷新路径][p-stream-render]

**影响：** 历史长度、当前回复长度、正则／格式化成本叠加。默认显示 100 条并不意味着底层只持有或遍历 100 条。

**方向：** 可增量维护的消息深度索引、已完成消息渲染缓存、受限的流式变化区更新与历史 DOM 回收。跨段正则、Markdown、HTML 清洗和 iframe 生命周期必须保留正确性。

#### P-F05 · P2 · 世界书与提示词仍有重复准备和前缀计数

**源码确认：** 世界书条目准备包括序列化哈希和深克隆；预算检查对不断增长的内容前缀计数。[准备][p-world-sort] · [计数][p-world-budget]

**影响：** 冷缓存、大量候选、动态宏或多轮扫描时会放大成本。已有 token 缓存可能缓解部分重复；不能据此给出固定倍数的整机提速承诺。

**方向：** 复用不可变片段、批处理、精准失效和减少重复评估。不同片段的 token 数不能无条件简单相加；分词边界及宏副作用须验证。

世界书新条件、时效与身份模型由本文世界书内容块的 W-* 分片负责，不能在性能任务中另建第二套引擎。

#### P-F06 · P2 · 记忆召回与状态重放需要按实际启用情况优化

**源码确认：** 记忆召回会构建语料再排序；变量操作日志在编辑、swipe、删除、切换聊天等结构事件上重放历史。[召回][p-memory-retrieval] · [变量重放][p-var-rebuild]

**方向：** 语料与投影按版本增量维护；合适的纯计算移出主线程；状态重放研究检查点和受影响区间。不要把结构事件重放说成每个流式 token 都会执行，也不要给未启用 Memory OS 的用户算入其成本。

### A.3 已执行的隔离测量

以下保留前两轮调研中的**最终串行采样记录**。本次文档整理没有重跑这些耗时采样，也没有把它们升级为浏览器回归基线。

#### A.3.1 整聊克隆与消息深度计算

条件：本机 Windows、Node `v24.16.0`；合成正文约 1 KB／条；提取当前源码中的 `cloneAsJsonWire` 与消息深度计算片段；预热后 7 次采样取中位数；没有同时启动另一组代理基准。

| 消息数 | JSON 体积（MiB） | 单次整聊 JSON 克隆中位数（ms） | 深度计算 100 次合计中位数（ms） |
| ---: | ---: | ---: | ---: |
| 250 | 0.29 | 1.47 | 2.18 |
| 2,500 | 2.87 | 12.62 | 17.45 |
| 10,000 | 11.48 | 45.74 | 65.81 |

最后一列是 **100 次合计**，不是一次刷新耗时。测试没有包含 DOM、diff、Worker 传输、磁盘、扩展或模型调用。CPU 型号与锁频状态未记录，不能用于跨机器比较；它证明的是这些纯操作随数据量增加的成本。

#### A.3.2 Memory OS 合成数据

使用仓库现有 `largeMemory` fixture 和生产纯函数，预热后 5 次采样取中位数。

| 关系数 | 构建语料中位数（ms） | 排序中位数（ms） |
| ---: | ---: | ---: |
| 500 | 29.0 | 11.7 |
| 1,500 | 89.8 | 30.5 |
| 3,000 | 181.0 | 68.0 |

语料构建内部已经包含投影工作，不能再把独立投影基准加进去当成同一次调用耗时。这里没有网络、embedding、重排服务或完整模型生成。

仓库另有现成的 [Memory 基准][p-memory-bench]；本次记录采用其 fixture 并增加预热／中位数采样，复现示例见[附录](#reproduce)。

#### A.3.3 这些测量没有证明什么

- 没有定位用户真实环境中的全部卡顿来源。
- 没有证明磁盘、网络或 LLM 首 token 延迟由 Atria 前端造成。
- 没有证明换框架、换运行时或切数据库能获得某个固定倍数提速。
- 没有浏览器 p95、长期堆快照或真实扩展组合的实测结果。

### A.4 目标架构与约束

#### A.4.1 有界的前台工作集

区分持久历史、模型本轮所需上下文、可见消息窗口、当前写入工作集与诊断索引。历史可以增长，视口与普通写入所需的数据不能总是等于全部历史。

不能直接把全局 `chat` 数组截短后宣称完成分页。楼层下标、swipe、变量系统和第三方插件可能依赖其完整性，需要稳定消息 ID、下标映射和显式兼容入口。

#### A.4.2 真正的增量存储

- 仓库／引擎层提供范围读取、原生追加与局部修改，而不是仅在 HTTP 层命名为增量。
- SQLite 可评估消息级行；文件模式可评估可恢复的追加日志、索引和受控整理。它们是待设计方案，不是已确定迁移格式。
- MySQL／PostgreSQL 等已有模式不能被静默丢弃；逐模式定义功能与性能验收。
- 备份序列化和受控全量整理不应无条件进入每次单条追加的热路径，但可靠落盘与恢复能力必须保留。
- 导入、导出、全量搜索等明确的批处理操作可以随历史增长，不能把这些成本隐藏到每次输入或刷新中。

#### A.4.3 缓存与诊断数据

- 为快照和派生缓存建立统一的容量、拥有者、失效与清理约定，优先按字节衡量。
- 活跃写入、生成、冲突恢复所需项暂时保留；成功结算后再允许淘汰。
- 淘汰派生缓存不等于删除持久聊天、MVU 状态或用户诊断历史。
- 诊断正文按需读取；索引与摘要保持轻量。压缩也要测量，不能把同步压缩变成新的主线程负担。

#### A.4.4 渲染与任务调度

- 深度索引在追加、删除、隐藏／系统标记变化等事件上维护，而不是每次格式化全量扫描。
- 已完成消息缓存按文本与格式化规则版本失效。
- 流式优化先保证完整输出、跨段正则和 HTML 清洗一致，再扩大增量范围。
- 不直接搬走依赖 DOM 的清洗或排版代码；Worker 只承接适合隔离的纯计算。
- 回收不可见 DOM 时，必须处理锚点、动态高度、搜索跳转、iframe 与扩展清理。
- 慢监听器、后台任务队列和取消行为要纳入测量，但未取证前不认定它们已存在泄漏。

<a id="worldbook"></a>
## 3. 内容块 B：世界书机制重构

### B.1 当前机制中应该保留的能力

当前世界书并不只有关键词匹配。条目已经支持关键词／正则、次级关键词逻辑、常驻、向量标记、概率、分组竞争、递归控制、持续／冷却／延迟、角色过滤、注入位置和脚本联动。[条目定义][w-entry]

Atria 还提供扫描前后钩子、激活来源列表、激活追踪和 Agent 使用世界书的路径。因此，本次方向不是删除这些能力后重新发明一遍。

需要特别区分：

1. **生成类型不是剧情事件。** 当前 `Triggers` 的值是 `normal`、`continue`、`impersonate`、`swipe`、`regenerate`、`quiet`。[类型定义][w-triggers]
2. **常驻不是保证最终发送。** 常驻条目仍处于其他过滤、概率、预算及后续注入处理的流程中。[扫描与预算][w-scan]
3. **向量不是状态判断。** 官方定义中，向量只替代关键词检查，其他限制仍应成立。[官方规则][external-st]
4. **状态条件并非完全无法实现。** 宏、脚本和扩展可以间接表达部分条件；缺少的是统一、可校验、可追踪的原生规则契约。
5. **已经有追踪。** 应完善现有追踪的拒绝原因和最终发送归因，而不是再建一个平行诊断系统。[现有追踪][w-trace]

### B.2 需要重构的机制边界

#### W-F01 · P2 · 提及、事实与适用条件混在一起

“我们听说王城戒严，但仍在边境酒馆”会提到王城，却不意味着玩家已进入王城，也不必然意味着传闻已被确认。

关键词适合发现相关资料，不应单独承担当前场景、任务阶段、人物认知和事件是否发生的判断。推荐让原生状态条件与文字召回分开；没有状态来源时返回“未知”，而不是猜测。

证据：当前条目定义及生成类型过滤。[条目][w-entry] · [过滤顺序][w-filter-order]

#### W-F02 · P2 · 评估、预览和副作用没有完整分离

**源码确认：** 扫描收尾会处理 timed effects；非 dry-run 的激活结果会发出激活事件，Quick Reply 可据此自动执行。名为 `simulateWorldInfoActivation` 的入口默认 `dryRun=false`，不能仅凭名称认定无副作用。[扫描收尾][w-effects] · [事件][w-activated] · [模拟入口][w-simulate] · [Quick Reply][w-qr]

**离线复现：** 对相同条目和有效 sticky 快照，`WorldInfoTimedEffects.checkTimedEffects()` 的正式检查判定 sticky 有效，而 dry-run 检查没有该有效状态。该用例只证明类级语义差异，没有证明所有预览界面都会产生错误结果。[时效检查][w-timed]

**用例参数：** 合成条目 `world=test`、`uid=1`、`hash=123`、`sticky=6`；输入消息数为 3；既有 sticky 记录 `start=1`、`end=7`、`protected=false`。两次检查使用彼此隔离的相同元数据副本，没有修改宿主数据。

**建议：** 只读评估基于不可变快照生成选择计划；状态变化由另一个提交步骤处理。只读预览仍应读取和判断现有时效，而不是通过跳过相关判断来避免写入。

#### W-F03 · P2 · 过早转成字符串，导致来源身份丢失

**源码确认：** 一处 Orchestrator 后置过滤用正文字符串反查条目；相同正文只保留第一个来源，反查失败则保留该字符串。[过滤辅助函数][w-profile-filter]

**离线复现：** 使用两个正文相同、来源分别为 `public` 与 `private` 的合成条目，过滤 `private`：

| 用例 | 期望保留数 | 当前辅助函数实际保留数 |
| --- | ---: | ---: |
| `public` 条目在前 | 1 | 2 |
| `private` 条目在前 | 1 | 0 |
| `private` 原文在注入前被改写，查找表仍是原文 | 0 | 1 |

第三个用例模拟正文变换后的载荷形状；没有启动真实正则扩展。当前注入路径确实在输出字符串前应用世界书正则。[正文变换][w-render]

**建议：** 条目 ID、来源版本、可见范围和注入片段身份保留到最终请求完成；不能再用正文充当主键。相同文字是否去重，应由明确的去重规则决定，而非身份碰撞。

#### W-F04 · P2 · 文本递归与重复准备既难维护，也有规模成本

当前扫描加载后仍进行条目装饰器处理、序列化哈希和深克隆；预算检查对不断增长的文本前缀计数。向量路径还包含生成时的索引同步。[条目准备][w-sorted] · [预算检查][w-budget] · [向量路径][w-vectors]

这些是重构信号，不是已测得的整机性能瓶颈占比。性能测量和通用缓存治理由本文性能内容块负责；本文件负责世界书语义与接口边界。

### B.3 目标模型：信息所有权

| 信息 | 所有者 | 世界书系统如何使用 |
| --- | --- | --- |
| 固定设定、人物背景、地点、创作规则 | 版本化的世界书／卡片源内容 | 读取和选择，不因一次生成自动改写原设定 |
| 当前地点、任务进度、人物存活、关系值 | 当前存档的状态 provider | 读取已提交快照，不复制成另一套可写状态 |
| 过去事件、关系形成过程 | Memory OS 等历史记忆层 | 作为有来源的历史补充，不自动覆盖固定设定 |
| 选择计划、计时与动作回执 | 世界书运行时自己的小范围状态 | 只记录本系统职责，不接管其他状态的写入权 |

可复用基础：

- 既有 `WorldInfoRepo` 承接世界书持久化，避免绕开仓库层新建私有存储。[仓库层][w-repo]
- 既有状态 provider 提供可选、只读的状态接入；没有 MVU 的卡仍应正常使用世界书。[状态接入][w-providers]
- FloorState 的楼层／swipe／分支结算机制可作为运行时状态接入基础，但具体提交契约仍需验证。[FloorState][w-floor]
- Agent Runtime 已有上下文编译边界，可以复用接口与预算经验，不能假定现有逐层截断策略已经满足世界书依赖原子性。[编译器][w-compiler]

作者仍然主要写自然语言。第一版不要求把所有设定改造成实体图谱或数据库表。

### B.4 触发模型与作者体验

以下是概念设计，不是可导入 JSON，也不是新增 API 的既定签名。

| 能力 | 例子 | 语义 |
| --- | --- | --- |
| 文字／别名召回 | 王都、帝都、艾伦城 | 找到相关候选资料 |
| 状态条件 | 地点是王城，且戒严已生效 | 判断候选是否适用，也可直接选择场景资料 |
| 状态变化事件 | 地点从酒馆变为钟楼 | 表达一次状态转换 |
| 场景持续 | 仍然位于钟楼 | 不依赖重复提及名称维持场景内容 |
| 显式调用 | 查看物品、请求指定知识 | 提供精确入口，仍遵守可见范围和预算 |
| 可选语义召回 | 问题未使用设定原词 | 补充相关性，不决定事实和授权 |

“当前是夜晚”是条件；“刚刚入夜”是事件。概率、一次性触发、冷却和持续时间必须说明依附的事件、时间单位和存档范围。

#### 作者界面的五个问题

1. 何时考虑这条内容？
2. 必须满足哪些前提？
3. 持续到什么时候？
4. 提供给谁？
5. 提供什么；是否只是资料，还是另有受控动作？

高级 AND／OR、依赖及预算设置按需展开，不用更多底层开关替代原来的复杂开关。

#### 场景示例：钟楼夜间仪式

```text
资料：钟楼夜间仪式
适用：地点=钟楼；时间=夜晚；已获得仪式线索
进入：提供仪式场景说明
维持：直到离开钟楼，或仪式结束
依赖：钟楼基础设定为必需；旧教团背景为可选
可见：玩家视角不提供尚未揭示的幕后身份
动作：如需改变状态，交给受控执行层，不由匹配器直接写变量
```

预期体验：在酒馆讨论钟楼只提供相关背景；进入钟楼后场景资料持续适用；离开后退出；预览、重试和额外 Agent 调用不重复执行“进入”动作。

状态必须来自明确所有者。模型描述或语义分类可以产生待验证建议，不能未经确认就成为已发生的事实。缺少 provider 时，相关条件显示“未知／来源不可用”；对未知值取反也不能自动变成成立。

### B.5 选择与上下文组装流水线

```text
绑定范围与可见范围
        ↓
不可变的状态、对话、内容版本快照
        ↓
关键词 / 状态索引 / 显式调用 / 可选语义候选
        ↓
条件判断 → 依赖与互斥 → 预算选择
        ↓
保留身份与来源的中间记录
        ↓
按目标模型组装请求 → 实际发送回执

需要写状态的动作：走独立、受控、可去重的提交步骤
```

#### 中间记录至少保留哪些概念

稳定条目身份、来源版本、内容变体、接收方、候选依据、条件判断、依赖关系、预算成本、注入位置、最终发送／淘汰原因。具体字段、schema 和模块路径在实施前另行定稿。

#### 依赖不再等同于文字提及

- **必需依赖：** 选中一个规则时，必须同时提供其前置说明。
- **相关资料：** 提高候选相关性，不意味着必须注入。
- **互斥版本：** 如同一地点在毁灭前后的两份描述，不能同时生效。

新规则需要循环检测、展开上限和明确的预算处理。旧文本递归保留在兼容路径，不自动改成新的依赖语义。

#### 预算与可见性

- 必需规则、当前场景资料、可选背景分开配置；可支持作者维护简版／详版。
- 必需依赖按组合选择，不任意截掉一半；必需内容无法容纳时明确警告或停止。
- 世界书、记忆和预设最终共同受实际模型上下文预算约束。
- 公共、叙事者、指定角色／模型、揭示条件可作为第一版的明确可见性规则。
- 同一模型若已收到完整秘密，不能仅靠一句“不要泄露”保证角色绝不会说出；需要严格隔离时必须生成不同上下文视图。
- 导入的知识文本不因被检索命中就自动升级为系统指令或获得工具执行权限。

### B.6 生命周期与副作用契约

1. 同一快照、内容版本与固定随机结果，应得到可重放的选择计划。
2. 评估不写 MVU、聊天元数据或计时状态，也不执行 Quick Reply、模板副作用或外部工具。
3. 真正改变状态的动作按声明的输入／输出提交点执行；不是所有动作都机械绑定到“模型回复完成”。
4. 重试、重复投递和额外预览不能重复提交同一动作。
5. 计时单位区分消息、对话轮次、场景生命周期和游戏时间；不能拿某个 Agent 临时上下文的数组长度替代主存档时间。
6. swipe、删除和分支必须能撤销或重放本系统状态；不能借此改写其他 provider 的数据。
7. 旧宏／EJS／脚本不能同时在旧引擎与新引擎各执行一次。影子对比应使用一次捕获的输入、结果和随机信息，交给纯评估路径回放。
8. 基础条件采用受限、可验证的表达式；第一版不引入任意 JavaScript 执行能力。

### B.7 性能与观测原则

- 规则按引用的状态字段建立依赖索引；只重新检查受变化影响的部分。
- 预处理静态关键词、别名和正则；动态宏及无法索引的规则走显式兼容路径，不能承诺所有规则都达到常数成本。
- 索引随内容版本更新，避免每次生成都扫描整本内容并同步全部向量。
- 缓存必须有容量上限；键覆盖内容／状态版本、角色可见范围以及必要的模型／分词配置。
- 语义服务是可选能力；基础触发不要求联网，不新增逐条 LLM 判定的默认热路径。
- 追踪覆盖候选、拒绝、预算与实际发送；详细“为何没激活”可以针对单条规则按需重放，不要求每轮保存所有规则的完整轨迹。
- 所有后台任务可取消；旧状态版本的结果不得回写新分支或新场景。

<a id="roadmap"></a>
## 4. 统一分片与执行顺序

以下 P-*／W-* 是实施范围编号。所有代码分片尚未启动；P-00 仅有部分 Node 隔离数据，W-00 仅有源码与辅助函数反例，均不等于完成真实宿主基线。每片进入实施前要单独确认写集、基线、补丁预算、验证与回滚。

### 4.1 性能分片

| 分片 | 目标 | 范围与依赖 | 出口条件 |
| --- | --- | --- | --- |
| P-00 性能基线 | 分离加载、输入、流式、发送准备、保存、内存的成本 | 不改业务算法；先确定真实宿主与数据 fixture | 设备、配置、冷热状态、重复次数与原始记录可重放 |
| P-01 快照生命周期 | 治理跨聊天完整快照保留 | P-00；仅快照所有权、容量与清理 | 反复切换后达到稳定工作集；写入和恢复不丢数据 |
| P-02 诊断按需存取 | 提示词记录逐条存储与按需读取 | P-00；诊断存储与查看入口，不改聊天正文格式 | 长聊天不需整组加载诊断；旧记录可访问／迁移可回退 |
| P-03 渲染热路径 | 先深度索引，再完成消息缓存和流式变化区 | P-00；每次只推进一个渲染边界 | 输出与清洗一致；交互、长回复和长历史基准改善 |
| P-04 消息级读写 | 建立真正的范围读取、追加、局部修改 | P-00；必须进一步按仓库契约、引擎、前端兼容拆小 | 单条操作不常态读写整聊；并发、分支、备份和恢复通过 |
| P-05 世界书与记忆 | 只优化已测得的生成前热路径 | P-00；世界书语义对接 W-*，Memory 单独设写集 | 检索／状态正确性不退化；延迟、缓存和取消行为达标 |

### 4.2 世界书分片

| 分片 | 目标与边界 | 依赖 | 出口条件 |
| --- | --- | --- | --- |
| W-00 行为基线 | 固化扫描、时效、过滤、预算、最终请求和副作用用例；不改语义 | 无 | 可重放用例与失败基线齐备，实机环境与版本已记录 |
| W-01 身份与来源 | 打通带条目身份的选择结果和最终发送归因；暂不增加新触发类型 | W-00 | 重复正文、正则改写、不同接收方均不丢失归因 |
| W-02 纯评估与提交 | 分离预览、时效计算、状态提交和脚本动作 | W-01 | 相同输入预览等价，预览零写入，动作重试不重复 |
| W-03 原生条件与事件 | 只加入状态条件、状态变化、场景持续与基础作者界面 | W-02 | 未知状态处理明确，场景进退与分支语义验证通过 |
| W-04 索引与选择策略 | 按实测需要加入增量索引、显式依赖、预算变体、可选语义召回 | W-03；对接 P-00 | 规模测试、依赖原子性和退化路径达标 |
| W-05 迁移与默认切换 | 分类型迁移，保留未知字段和不支持项说明 | 前序验收通过 | 旧卡对照、导入导出、失败回退和实际模型请求验收通过 |

### 4.3 推荐顺序与职责

1. 先补 P-00 的真实浏览器性能基线和 W-00 的行为回放基线。
2. 以 P-01 的一个快照生命周期问题作为低风险性能切口；世界书在 W-00 后选择 W-01 的一个身份／来源边界。两条线不能混成一次大补丁。
3. 世界书纯评估与提交边界完成后，再增加状态条件和场景事件；不能先堆新触发器再补时序正确性。
4. 消息级存储 P-04 必须进一步按仓库契约、引擎与前端兼容拆小。它不是顺手切换数据库配置。
5. 世界书扩展功能的 MVP 候选为 W-00—W-03；不是批量实施授权。暂不纳入通用脚本语言、外部图数据库、逐条模型判定或全自动设定本体化。

性能内容块负责通用工作集、聊天／诊断数据、渲染与存储粒度；世界书内容块负责条目身份、触发、时效、可见性、预算和提交语义。共享测量方法，不创建重复 token 缓存、状态事实源或执行器。P-05 若必须改变世界书语义，应先停止性能补丁，交给 W-* 的契约与回放验证。

<a id="verification"></a>
## 5. 验收、迁移与当前验证状态

### 5.1 性能验收

#### 5.1.1 测试场景

| 维度 | 建议 fixture | 观测指标 |
| --- | --- | --- |
| 历史规模 | 200／2,000／10,000 条；固定每条体积 | 打开聊天、首批可见、解析与堆占用 |
| 单条操作 | 末尾追加、编辑旧消息、swipe、删除 | p50／p95、读写字节、序列化次数、冲突与恢复 |
| 长期切换 | 20 个聊天重复切换 3 轮，等待任务结算 | 强制 GC 后保留堆、快照字节、DOM、监听器及 Worker 数 |
| 长回复 | 固定输入速率下的 1k／10k／50k 字符输出 | 帧间隔、长任务、输入延迟、滚动与最终文本一致性 |
| 重型卡片 | 大变量、正则、swipe、多媒体／iframe 分组开关 | 分项开销及扩展组合差异 |
| 生成前准备 | 世界书／记忆／预设分别开关 | 扫描、token、召回、组装时间，不混入上游模型耗时 |
| 故障恢复 | 中止、断网、重复请求、旧完整性标记 | 不重复消息／动作、不丢已确认写入、不覆盖新版本 |

数值目标应在 P-00 后按参考设备冻结。不能把本文 Node 函数耗时直接当成浏览器 SLA，也不能在测完后随意改门槛以宣称通过。

#### 5.1.2 优先建立的结构性验收

1. 单条追加的常态处理量接近本次变化量，不随整个历史线性复制；受控整理单独计量。
2. 只看最近消息时，不常态加载全部历史诊断正文。
3. 重复切换同一组聊天、结算并回收后，缓存与保留堆不再逐轮无界增长；暂时保留项有明确任务归属。
4. 最新消息的刷新不为计算深度而每次遍历全部历史。
5. 相同输入的最终文本、Markdown、正则、清洗与变量状态保持正确。
6. 优化不以减少可靠保存、禁用冲突检测、缩减必需设定或删除用户历史为代价。

### 5.2 世界书验收

| 场景 | 应验证的行为 | 当前状态 |
| --- | --- | --- |
| 同一状态重复预览 | 选择结果一致；不改变量、计时和动作账本 | 待实现与真机验证 |
| 有效 sticky／cooldown | 预览与正式评估读取同一状态语义 | 类级差异已复现；修复未实施 |
| 相同正文／正文改写 | 身份、过滤及来源不受字符串碰撞影响 | 辅助函数反例已复现；修复未实施 |
| 无状态 provider | 基础世界书可用，条件明确显示未知 | 待实现 |
| 剧情条件与传闻 | 提及地点不等同于进入地点；模型推测不直接提交为事实 | 待设计用例与实机验证 |
| 依赖与预算冲突 | 必需组合原子选择，超预算显式反馈 | 待实现 |
| 重试／swipe／删除／分支 | 不重复动作，不跨分支污染 | 待实机验证 |
| 多 Agent／多模型 | 接收方隔离，最终请求能追溯来源 | 待实机验证 |
| 旧宏／EJS／QR | 兼容对照不重复执行，未知能力不伪装成支持 | 待安装版本与真机证据 |
| 100／1,000／10,000 条目 | 冷热扫描、候选数、token 工作量、主线程阻塞、内存有记录 | 待基准 |

验收以实际请求内容和提交记录为准，不只看“激活列表”。不要求读取模型私有推理来证明规则生效。

### 5.3 共同迁移红线与停止条件

- 旧卡默认保留原行为，按能力分类迁移；保留未知字段和不支持项说明，不自动改写全部世界书。
- 新条件、场景生命周期或可见性无法无损导回旧 ST 时，导出必须列出损失，不能悄悄转成常驻内容。
- 不能直接截短全局聊天数组来冒充分页；楼层、swipe、变量和第三方消费者需要身份映射及兼容验收。
- 固定设定、当前状态、历史记忆分别保留所有权，不能双写同一业务事实；新运行时命名遵循 Atria 规则，不引入前代产品回退。
- 不自动删除用户历史、变量或诊断数据，不关闭必要备份／落盘确认，不放宽 HTML 清洗，不移除并发保护。
- 不默认安装扩展、增加云服务或付费模型调用；宏、EJS、QR 和动作不能在影子对比中被执行两遍。
- 缓存淘汰必须保护未完成写入、生成和冲突恢复所需数据；异步旧结果不能写入新聊天或新分支。
- 秘密可见性、概率重放、游戏时间来源、旧脚本副作用及提供商角色变换仍需明确契约与真机证据。
- 若改动扩大到存储迁移、楼层基础身份、扩展权限或整体重写，应停止当前分片，单独确认方案；整体重写属于 `Rewrite Requires Approval`。
- 出现数据安全回归、结果差异无法解释或性能无收益时，缩小范围或回滚，不能继续堆补丁掩盖问题。

暂不优先：React／Vue 全量替换、Node 运行时迁移、全仓拆分、重复增加已有 Worker、仅切换 SQLite 配置以及默认逐条 LLM 触发判断。

### 5.4 已完成与未完成

**已有研究证据：** 当前源码热点和相关 vanilla 路径复核；官方文档与固定版本 RisuAI 结构对照；两类世界书合成反例；现有 Memory 基准与当前源函数的最终串行采样。数值来自此前任务工具输出，没有另存浏览器 trace 或原始 CSV。

**本次文档工作：** 按内容块整理并合并为一个总文档，统一入口、范围、分片和验收，保留来源与测量局限。性能复现附录已通过语法与跳过采样循环的初始化检查；合并后的内容覆盖、目录锚点、分片编号和源码引用已校验。没有重跑耗时采样，文档检查不是功能验收。

**尚未执行：** 完整 Jest／端到端套件、真实浏览器长期 CPU／堆分析、用户实际卡片和扩展组合、全部存储引擎磁盘压测、提供商端到端请求检查、任何业务功能实现或生产数据迁移。此前调研未安装项目依赖；Android 与 Docker 检查未运行，也不默认补跑。

**NEXT：P-00 与 W-00 的基线补齐。** 在显式实施授权后，确认真实宿主、扩展版本、参考设备和脱敏 fixture；然后只选择一个最小边界进入改动。不要把“规划已写好”当成重构已获批或实现已完成。

<a id="reproduce"></a>
## 6. 附录：隔离基准复现


在上述 **main 代码检出** 中，以 Node 标准输入运行下列 JavaScript，例如使用 `node --expose-gc --input-type=module`。不要在只有规划文件的 docs 分支目录运行。脚本先验证提交，仅读取源码和合成 fixture；它不是浏览器测试，也不写聊天数据。

```javascript
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { largeMemory } from './tests/memory-graph/fixtures/large-memory.js';
import { buildMemoryCorpus, rankMemory } from './public/scripts/extensions/memory-graph/hybrid-retrieval.js';

const baseline = '12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3';
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== baseline) {
    throw new Error('Baseline changed: revalidate helpers before comparing results');
}
const source = fs.readFileSync('public/script.js', 'utf8');
const start = source.indexOf('export function cloneAsJsonWire(value) {');
const end = source.indexOf('\nfunction normalizeJsonObject(', start);
if (start < 0 || end < start) throw new Error('Clone helper boundary not found');
const cloneCode = source.slice(start, end).replace(/^export /, '');
const lines = source.split('\n');
const depthStart = lines.findIndex(line => line.includes('const usableMessages = chat.map('));
if (depthStart < 0) throw new Error('Depth helper boundary not found');
const depthCode = lines.slice(depthStart, depthStart + 3).join('\n');
if (!depthCode.includes('const depth =')) throw new Error('Depth helper shape changed');
const { cloneWire, depth } = new Function(`${cloneCode}\nreturn {
    cloneWire: cloneAsJsonWire,
    depth: function(chat, messageId) { ${depthCode}\nreturn depth; }
};`)();
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const chats = [];
for (const n of [250, 2500, 10000]) {
    const chat = Array.from({ length: n }, (_, i) => ({
        name: i % 2 ? 'User' : 'Assistant', is_user: !!(i % 2), is_system: i % 31 === 0,
        mes: `message ${i}: ` + 'sample conversation text '.repeat(43),
        extra: { token_count: 250, variables: { turn: i } },
    }));
    cloneWire(chat);
    for (let i = 0; i < 100; i++) depth(chat, n - 1);
    const clones = [], depths = [];
    for (let r = 0; r < 7; r++) {
        global.gc?.();
        let t = performance.now();
        const copy = cloneWire(chat);
        clones.push(performance.now() - t);
        if (copy.length !== n) throw new Error('Clone result mismatch');
        t = performance.now();
        let sum = 0;
        for (let j = 0; j < 100; j++) sum += depth(chat, n - 1);
        depths.push(performance.now() - t);
        if (!Number.isFinite(sum)) throw new Error('Invalid depth result');
    }
    chats.push({ messages: n, jsonMiB: Buffer.byteLength(JSON.stringify(chat)) / 1048576,
        cloneMedianMs: median(clones), depth100CallsMedianMs: median(depths) });
}
const memory = [];
for (const n of [500, 1500, 3000]) {
    const snapshot = largeMemory(n), corpusTimes = [], rankTimes = [];
    for (let r = 0; r < 6; r++) {
        global.gc?.();
        const t = performance.now();
        const corpus = buildMemoryCorpus(snapshot);
        const built = performance.now();
        const ranking = rankMemory('Where is Person 42?', corpus);
        const ranked = performance.now();
        if (ranking.candidates[0]?.id !== 'relation:r42') throw new Error('Ranking mismatch');
        if (r) { corpusTimes.push(built - t); rankTimes.push(ranked - built); }
    }
    memory.push({ relations: n, corpusMedianMs: median(corpusTimes), rankingMedianMs: median(rankTimes) });
}
console.log(JSON.stringify({ node: process.version, chats, memory }, null, 2));
```

复测应串行运行，不与构建、其他基准或浏览器重负载同时启动。新结果须记录新环境和日期，不直接覆盖本文件历史数据。

<a id="references"></a>
## 7. 来源与工程路由

正文中的源码引用固定到研究快照；相同源码可能分别支撑性能与世界书判断。外部材料只作机制对照，不代表已采用代码、安装依赖或证明性能优劣。

工程主入口为 `tavern-card-builder`，质量边界采用 `code-quality-workflow`。已运行 `consult-tavernweave-library` 的 `tavern-card-builder` 写作路由；库快照 `2026-08-18`，实际查阅 A0、A3 与 A4 的相关段落。

A0 本次三格：目标是分块创建后合并为一份总文档；红线是不改业务代码和用户数据；验收是内容覆盖、证据与建议分离、分片及链接完整、仅保留一个最终文档。设计候选仍是建议，精确 API 以目标源码和真机为准。

[w-entry]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L8061-L8108
[w-triggers]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/constants.js#L36-L43
[w-scan]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L8898-L9450
[w-filter-order]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9060-L9208
[w-trace]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9598-L9644
[w-effects]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9722-L9745
[w-activated]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L1795-L1827
[w-simulate]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L7210-L7251
[w-qr]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/quick-reply/src/AutoExecuteHandler.js#L82-L103
[w-timed]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L1503-L1607
[w-profile-filter]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/orchestrator/lorebook-filter.js#L79-L143
[w-render]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9660-L9675
[w-sorted]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L8779-L8828
[w-budget]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9373-L9450
[w-vectors]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/vectors/index.js#L1252-L1328
[w-repo]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/storage/repositories/world-info-repo.js#L1-L58
[w-providers]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/memory-graph/state-providers.js#L34-L82
[w-floor]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/floor-state.js#L1-L64
[w-compiler]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/lib/agent-runtime/context-compiler.js#L1-L79
[external-st]: https://github.com/SillyTavern/SillyTavern-Docs/blob/70e5e4d3c239253fca4692fe82e3936cb9c4b1b1/Usage/worldinfo.md
[external-risu]: https://github.com/kwaroran/RisuAI/blob/d31fea55384ef5e1bd78ffc813e40d8d144edce7/src/ts/process/triggers.ts#L20-L75
[p-settings]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/power-user.js#L168-L173
[p-display]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L3359-L3408
[p-stream-loop]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L6713-L6753
[p-token-cache]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/tokenizers.js#L1603-L1622
[p-snapshots]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L12205-L12262
[p-storage-readme]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/storage/README.md
[p-memory-worker]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/memory-graph/inspector-compute.js#L28-L58
[p-load]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L14654-L14701
[p-delta]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/endpoints/chats.js#L2796-L2837
[p-append]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/endpoints/chats.js#L2327-L2418
[p-fs]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/storage/engines/fs-engine-transaction.js#L120-L174
[p-sqlite]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/src/storage/engines/sqlite-engine-transaction.js#L91-L132
[p-clear]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L3472-L3492
[p-prompt-capture]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L8682-L8726
[p-prompt-store]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/itemized-prompts.js#L22-L65
[p-depth]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L3900-L3918
[p-stream-render]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/script.js#L6481-L6509
[p-world-sort]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L8779-L8828
[p-world-budget]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/world-info.js#L9373-L9450
[p-memory-retrieval]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/extensions/memory-graph/hybrid-retrieval.js#L191-L240
[p-var-rebuild]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/public/scripts/variable-op-log/index.js#L125-L153
[p-memory-bench]: https://github.com/ZZZdragondYNGPHX/Atria/blob/12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3/tests/memory-graph/benchmark.mjs