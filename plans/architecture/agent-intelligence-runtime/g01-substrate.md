# G01：执行路径证据与 M8 有限实施矩阵

> 2026-10-10 从 HM1 main `3ee1332ef` 进入 M8，source checkpoint `c62ecc937`。G01 当前基础 checkpoint 已实现；完整 M8 / HM2 未验收。阶段职责以 delivery §8 和 model-routing 为准，执行规则只引用 Governance。

## 已冻结的工程范围

- 复用原 ConnectionProfile、ModelProfile（Callable Target）、RuntimeRoute、VersionedJsonResourceHandler 和 StorageEngine。不新增 profile registry、发送器或 dependency authority。
- Model CapabilityDecision 可附 v1 binding：owner/account/endpoint/target/adapter/transport/options 的 canonical path fingerprint，observedAt/expiresAt、declared/verified。它不把模型字符串当 canonical upstream identity。
- Verified 发布仅接受服务端 adapter observation 的非 JSON marker；普通配置不可伪造。既有 exact 观测可原样保留，改 endpoint/account/model 时仍须消费路径核验。来源缺失、过期或改路径降 unknown；当前明确 unsupported 优先。配置与 runtime 预览不自行 probe。
- 原 Route 可选 executionPolicy v1：有限目标 allowlist（1–16）、verified requirements、continuity 与 reuse 许可。旧无该字段的 Route 原样精确读取，不迁移 Package、Prompt、Generation refs。政策决定和非秘密证据随原 EffectiveRequestSnapshot 固定。
- G01 checkpoint时 continuation consumer 仅 none，其余模式 unavailable；当前有界 active_execution 消费者见本文末节。task/adaptive仍不可用，不能凭字段可构造宣布能力。
- 价格、实际上游与网关内 retries 未知时明确 unknown；三层 cache 分开。不用用户声明或 adapter metadata 冒充 gateway measurements。

## 本地支持矩阵与继续顺序

| 对象 | 当前已验证 | 未验证 / 下一消费者 |
| --- | --- | --- |
| 原 registry | FS 精确读写、SQLite 真实 dump/restore | 本轮未跑 MySQL/Postgres；codec/key 未变化 |
| 基础执行 | 原 OpenAI-compatible/raw-text Core 52项保留 | G02 compiler binding、G03 failure/reuse、G05 charge |
| Path evidence | 新10项：失效、账号/路径、send前过期、不可伪造、SQL恢复 | G04 真实 adapter/probe observation |
| Continuation | G01基线none；当前有界active_execution见末节，task/adaptive发送前拒绝 | G04 按 delivery 原生协议顺序，不以兼容接口假充实现 |
| HM2 | 不开启深检索或缓存 | H3/H4 继续等待相应 G 消费者和 G06 实测 |

具体结果与失败修复保留在同一 Record。G02 沿原 Prompt Module target 保护 behavior/character/style/context，canonical 仅处理结构化 JSON、保留 history/tool/opaque 顺序；G03 沿原 artifact authority 校验；G04 沿原 Provider Port；G05 沿原 RunControl/send；G06 最终评价。不存在跨阶段停工或另加 API 审批。

## 当前剩余依赖与下一有限 G05 组

Runtime checkpoint 有限物理契约（依据 model-routing §7.2–7.4）：复用 StorageEngine Native resource 与 `withRuntimeWrite(handle)`，private kind `atri_runtime_checkpoint` 的 key 仅 owner handle + 随机 SHA-256 checkpointId；payload 含 schema、owner hash、完整 binding、public-prefix 校验、原生 opaque envelope、到期时间和 Native integrity。每 owner 至多128项、总16MiB、单项完整 JSON 至多2MiB，TTL10分钟；超过容量淘汰最旧，过期/完整性失败/真实同owner同scope binding变更终止旧引用。读与发送均重读既有存储；只读/存储失败显式 unavailable，不假报清理或恢复成功。发布须在 credential echo 与工具声明校验之后；取消/失败须 await private cleanup。原配置record的integrity/单调updatedAt作mutation anchor，保存/发送均核验，受影响connection/model/route修改或删除清除相关checkpoint，未关联配置不清除；同毫秒ABA也不能复活旧状态。

原 Task semantic fingerprint/authorityEpoch、Project base revision、public conversation 前缀，以及 exact path/account/target/tools/policy 继续是恢复准入；private resource 不写 Task conversation/domain/Memory/Package，不提供 public CRUD。既有 account backup/recovery 可搬运该 Runtime resource，但 owner/path/lineage 必须重新匹配；portable Session/Save/Package 导出默认无此kind。先以有限 Native Responses consumer验证，未实现适配器/生命周期和未verified真实路径继续拒绝发送；task/adaptive、fork/restore/compaction剩余项按依赖继续。

当前有限消费者：Native Responses + 原Studio Project Task的task policy，须对应`generation.continuation.task`的exact verified path，真实未verified路径仍拒绝；本地measurement不写任何真实账户证据。Host据当前Task保存的完整public conversation自动重建private引用；caller历史编辑、authorityEpoch或配置变更不恢复旧opaque；fresh/reset与transferred数由实际lowering观察，不写复用/费用收益。FS/SQLite可冷进程读取、原account snapshot/recovery，实际Studio重新进入使用原public字段。其他品牌/task consumer、Session Task与adaptive生命周期、安全fork/compaction及G05 CPU/index/background预算仍未完成；H5前置和真实G06质量失败不变。

source `0a3f98d10` / `d62cb73c4` 已实现上述有限契约；进一步同毫秒delete/recreate反例真实FAIL后，原connection/model/route record以`doc:null`保留删除版本metadata，profile get/list仍返回不存在，重建同ID延续单调updatedAt。无额外版本kind/影子存储；原account snapshot/recovery保持该metadata，受引用删除/只读拒绝规则不变。有限实现不等于完整task/adaptive或真实路径验收。

source `2a282ed73`补原charge之前的私有lease/存储当前性核验，Secret期间已确认失效的请求HTTP0且不创建send attempt；发送前仍再次核验。下一有限adaptive组只沿同一Responses/原Studio Task与verified task+adaptive路径，按实际checkpoint兼容性冻结continue/start/reset理由、public handle lineage和损失；task policy不借自动fresh逃避缺失连续性，adaptive只允许从原Task保存的public observations做一次有界reset。禁止任意改写历史、fallback到未验证路径、新classifier或默认learned router；投影reset后无法兼容的cold history可再次明确reset，不假称已恢复。其他品牌/Session Task/fork/compaction及CPU/index/background预算仍按依赖继续。

source `dcf69fe29` 已闭合上述有限adaptive consumer：同时要求exact verified `generation.continuation.task`与`generation.continuation.adaptive`；发送前Snapshot固定requested policy/effective scope/start-continue-reset/reason/sourceCheckpointIds/loss，响应追加同一实际决定。task policy遇保存的历史无完整唯一checkpoint或不匹配时拒绝，不能自动fresh；adaptive由原Task合法public observation projection作每run最多1次无模型发送的重新编译，失效/伪造历史不借reset越权。count/render只选择；真正reset清理在原额度准入后、HTTP前重验实施。preview/Context token拒绝/原Task charge拒绝不清合法checkpoint，原budget已准入或有发送尝试后的取消/失败仍清理、保留usage/unknown。原Node/Studio/预算临时fixture只证明本有限组，不提升真实路径verified或真实质量。

model-routing §7.4 的 Runtime checkpoint 持久化、task/adaptive consumer、安全fork/restore/compaction，以及compute-policy §3–4的Embedding/CPU/后台成本准入仍是工程项；此前process_only/unavailable只描述已实施checkpoint，不是永久产品范围排除。真正gateway验证、语义Embedding/rerank与货币账单另属外部证据；H5仍须M2/M3/G06前置。不能把这些三类边界互换。

先沿原Native Retrieval/RunControl/Project Task补一个有限Embedding发送消费者：insert/query/query-multi允许原computeContext，合法Native Memory传递其已有Information Session anchor；首批按原OpenAI-compatible Embedding family的每个实际HTTP批次charge/settle，与正文/rerank共用原额度，旧无显式Route预算不自动加额度。具备computeContext但暂未实现预算映射的其它provider在推理/发送前明确unavailable，保留原非该请求的资源与固定路径，不伪装全部Embedding/local CPU已完成。无新profile/registry/发送器/预算authority，真实外部发送0。

定向完成条件：同原Session/Task的Embedding与正文共享额度，批次逐send/并发不超支，stale source/Task与budget拒绝在provider HTTP前，失败/取消/无usage保留占用，合法usage在坏vector响应前保存；客户端的Memory实际forwarding及旧无预算路径兼容。本地FS/SQLite和loopback仅证明本组工程行为，未verified路径保持unknown，不启用task/adaptive或把实际模型质量改判通过。之后继续Runtime checkpoint存储/recovery设计及尚未完成的预算消费者，不以该组结束为整体退出。

## 已交付有限 G05：原 Native insert 的本地索引工作

完成条件先冻结（2026-10-11）：只接现有 Native `/insert`、同原 Information Session anchor / Project Task computeContext；不新增模型入口、后台 worker 或下载。原 `computeBudget` 可选 `localWork {maxJobs,maxItems,maxInputBytes}`，分别为累计工作数1–32、累计输入项1–10000、累计序列化输入字节1–16MiB。原 Run operation / Task 的同一个 compute ledger 保存本地工作 identity、冻结输入上界、charged/settled/unknown 与实际观察；model attempts/token/usage 独立，不用1 token模拟CPU，不建立第二owner账本。既有 limits 只能收紧，Route移除/放宽、冷 engine/recovery 不恢复余额；旧未配置且未持有本地限额保持兼容。

实际 native index 写入按原 owner/profile/collection 路径在单Host内串行，等待中取消不准入；队列有界。工作准入先于Embedding/索引写入，拒绝HTTP0、原index不变；Embedding仍逐实际send沿同一父发送限额另记usage。既存index文件与新发布均≤16MiB，输入≤10000项/16MiB，不能以该工作量边界声称CPU毫秒硬上限。原Vectra操作在临时副本完成，发布前重验原Session/Task及取消，原index commit-last原子替换；upsert/取消/失败不发布副本，临时文件清理后才释放串行permit。Native delete/purge采用同路径串行避免同Host丢更新，非本组的成本准入仍未验收。

成本观察只保留实际 wall time 与 `process.cpuUsage` 的进程范围user/system微秒、完成/失败/取消状态和输入量；并发进程CPU不可冒称单job独占CPU，provider usage不由这些数值推导。进程中断的charged项继续按输入上界占额度，不能重建allowance；完成或失败也不退已准入工作量。FS/SQLite原authority、实际router→Vectra→loopback、并发、额度拒绝/移除、取消或stale提交、恢复与旧发送消费者作最小对应检查。索引文件和账本没有跨域原子性，publish后settle失败仍保守占用，不回滚已发生成本。

source `304d0d199` 已push；16新distinct/15受影响旧checks通过（细项与原失败见Record）。最终实现补充：同路径排队最多128工作，完整输入和既存/发布index各16MiB，单vector≤65536数值/一job总vector值≤1048576；超界在Vectra upsert前拒绝，已报告Embedding usage保留。最后mkdir在最终核验前完成；原Run锁可重入，Task锁与原Studio Project queue涵盖最终核验及同步write-file-atomic替换，消除已复现的mkdir期间取消/Task变化发布竞态。该≤16MiB同步窗口会阻塞server事件循环，保留实际wall/CPU观察，不声称任意cancel跨OS rename原子或CPU硬时长cap。

范围保留：query/缓存校验/其他本地模型/后台成本、其他品牌/Session Task、fork/compaction与真实G06质量/H5前置继续，外部发送0，不集成main。

## 已交付有限 G05：原 Native query/query-multi 的本地索引工作

完成条件先冻结（2026-10-11）：沿上述同一原compute ledger/localWork限额，增加`index_query`工作种类，不新增quota或改Token计费。一个query/multi-query是1 job；输入项计实际请求的collection数，输入字节计冻结的collection/query/topK/threshold等请求数据，不能冒称候选vector扫描数或CPU时长。显式本地限额与Embedding同父但独立计量，放宽/移除仍继承；旧未配置/未持有本地限额兼容。

实际Native query最多16个互异collection、query≤8192 UTF-8 bytes、topK1–100；一次job读取的index合计≤16MiB、候选≤10000、vector值≤1048576、单vector≤65536，拒绝不重建/清空原index。沿原Vectra LocalIndex读取/排序，不另建检索算法/缓存。多个物理index permit按规范路径排序获取，与insert/delete/purge共享同一单Host有界permit，读取/Embedding/排序/原scope最终核验/成本settle后释放；read-only旧读取不得被纯物理permit误判为write。原index不存在只返回空候选，不创建文件；全部不存在时无需Embedding发送，但本地准入与成本事实保留，不伪造provider usage0。

发送前与返回结果前分别重验当前原Session/Task。取消/过期scope不能返回已算出的旧结果，已经实际发送的Embedding仍保留直接usage/unknown，未发送拒绝不charge model。成本仅沿同一process CPU/wall观察，FS/SQLite并发+混合insert/query父工作额度、原Task中途变化/取消、readonly旧路径、空index、异常/超界index保持及移除限额/recovery作最小定向检查。全组合/所有其他read消费者/后台/安全fork/compaction及G06质量仍未验收，外部发送0。

source `1ccc6194a` 已push，13新distinct/4受影响旧checks通过（日志见Record）。Windows大小写alias曾实际返回200/重复扫描，before FAIL；physical permit key与multi路径身份统一Windows case folding、按该身份排序，after PASS。返回前在CPU成本settle之后再原scope重验；若此时取消/Task变化，实际计算completed与已报告usage仍保持，但拒绝返回结果，不能把completed成本字段解释成consumer接受成功。读取permit不要求readonly写权限，旧unscoped readonly读取通过；有预算/原scope的写账仍遵守原authority。未开启query-by-vector/list等所有其它read的预算，也未证明CPU时长硬cap、任意跨进程writer或网络投递的跨域原子性。

## 已交付有限 G05：原 Native query-by-vector 本地读取

完成条件先冻结（2026-10-11）：只接原 `/query-by-vector`，沿既有 `queryNativeIndexes`、同路径 physical permit、原 Session operation / Project Task computeContext 与同一 `index_query` localWork。供给向量只作为本次查询输入，不发送 Embedding、不新增模型/后台入口或预算 authority。输入向量1–65536个有限数值、topK1–100；冻结序列化输入字节计入原 maxInputBytes，输入项数为1个collection。既有 index 总字节16MiB/候选10000/向量值1048576等边界不变，异常文件不自动覆盖或重新下载。

定向出口：混合 insert/query/query-by-vector 共用原父 localWork，上限拒绝前不读index、不产生model attempt；Route移除/冷engine/account recovery不恢复余额。实际CPU/wall沿原记录，取消/过期Task不返回旧结果；等待permit取消不准入。空index不创建文件且不伪造免费usage，旧无预算readonly与原响应形状保持；非法向量不转换为0掩盖输入问题。仅本地最小消费检查，真实外部发送0，其他read/缓存核验/本地模型/后台、Session Task/fork/compaction与G06/H5前置仍继续，不集成main。

source `1d1bf3f79` 已push，10新distinct/8受影响旧checks通过。原allowlist曾拒绝computeContext，before三项均400，记录为新合同未支持入口，不能说原scoped请求绕过预算。Native供给向量改沿同一bounded helper；legacy数值转换仅在非Native分支实施。非法向量拒绝、排队输入冻结/取消、实际Task变化、空/异常index保持、两engine/account recovery/Route移除、readonly及scoped browser-profile无inference均有实际检查。local provider推理仍不支持scoped预算，纯供给向量读取不触发它。费用/配额沿原记录，真实外部0，完整G05/G06仍未验收。

## 已交付有限 G05：原 Session 过期工作成本结算

完成条件先冻结（2026-10-11）：针对原RunControl在HEAD变化/后台intent撤回后裁剪operation的静态风险，先用实际Native Embedding/index消费者复现，再沿同一原control修复；不新建owner/费用日志或给旧anchor重新执行权限。已准入但仍charged的operation保持原identity至worker结算，当前generation/发布仍严格拒绝旧HEAD；死/终结状态允许已有receipt的成本结算，不开放新工作/domain写入。最多仍受原128未完成operation边界约束，取消且worker未结束继续占用原permit。

原scope已结束且所有cost项均settled/unknown后，原control可压缩到可选累计retiredCompute成本摘要，再删除旧selection/fingerprint/详细operation；保留model次数、直接总/输入/输出计数、unknown数量/上界、local job/输入边界/真实process CPU/wall及完成/失败/取消/unknown数量。不把历史摘要当新额度/authority或声称完整逐attempt历史，旧版本已裁剪费用不能追回。摘要随原account backup/recovery和已有resume control导出/导入保留，旧无字段兼容；新HEAD的新turn仍按原语义独立额度，不设128个历史turn的终身上限。

最小出口：actual Native HTTP期间Session append/fork/save restore变化后费用保留、拒绝旧index结果且不发布；冷RunControl/account恢复不补余额/丢摘要；实际后台outbox完成/撤回及run terminal期间晚到费用有定向反例。局部数值/portable校验与足够多正常HEAD推进验证有界压缩，非任意Session fork Continuity恢复或跨账户新预算。真实外部0，G06/H5和其它依赖继续。

source `f1a04c041`已push，16新distinct/21受影响旧checks通过。FS/SQLite实际Embedding等待期间HEAD变化曾丢model/local成本，两项before FAIL/after PASS；在途charged operation不被裁剪，结算后旧scope进入原retiredCompute。额外真实terminal cleanup清空operation与readonly结算写账反例已修复。actual背景完成/撤回后unknown保留原window/period charge及上界；实际历史restore/fork、account recovery、ironman resume原导出/导入与130次query scope推进通过。原128 operation及131072字节验证现在也在写账/发送前实施。

累计reported input/output仅计已报告值，未报告部分保持未知，不推导total；process CPU/wall逐job观察可重叠，不是独占job或全进程精确累计。旧scope的settled/unknown压缩后无逐receipt identity，额外late/repeated reconcile会拒绝，不能改摘要猜账/退款；原worker尚未完成的charged身份继续保留。旧版本已丢费用无法重建，旧没有摘要的resume仍兼容。此组不验任意旧account备份回滚单调性、跨账户预算、Session Task opaque恢复或后台本地准备全覆盖；剩余正式工程/外部证据依赖继续，M8/HM2/HM3未验收。

## 已交付有限 G05：Native Memory 的原索引枚举

完成条件先冻结（2026-10-11）：只接原Native `/list`及Hybrid `listHashes`现有调用，继续同一queryNativeIndexes物理读permit/扫描边界/原Session或Project Task成本authority。原localWork新增index_list类别，每次1 collection/冻结输入字节；不排序/嵌入/推理，不缓存列表，不新增后台或profile。Memory向现存及旧派生namespace的list转交已有computeContext；删除/purge及browser CPU仍是后续成本消费者，不借此宣称全部完成。

最小出口：真实Hybrid client→Native HTTP list/insert/query同父额度，超过本地额度在index IO/Embedding前拒绝并沿合法基础检索降级；同scope并发、Route移除/recovery不恢复额度。空index无创建/无model usage，坏/超界index保持，readonly旧无scope兼容，cancel/stale Task拒绝列表且保留实际成本。query已有不受影响消费作少量回归；外部0、main不变，真实G06及其它正式依赖继续。

source `77820a6d2`已push，10新/加强distinct、11受影响旧checks通过。原list allowlist未支持computeContext，两项before返回400，不是已证明绕过；新scoped枚举复用既有bounded read并以index_list记同一原费用lane。actual Memory current collection list→insert→query与限额1时Embedding前拒绝/合法降级两项通过；retired namespace转发仅静态修改，相关旧source guard检查通过，未宣称该分支已执行真实HTTP。FS/SQLite并发/恢复、空/坏/超界index保持、readonly与settle后cancel/Task拒绝均通过；query供应向量/文本/多集合既有消费者保持。删除/purge及其它CPU/后台/continuity和真实G06依赖仍未完成，外部0。

## 已交付有限 G05：Hybrid 派生索引按hash删除

完成条件先冻结（2026-10-11）：只接原Native `/delete`与Hybrid现有deleteByHashes，沿原index write permit/临时Vectra副本/Run operation或Project Task localWork，不新增owner或源数据writer。index_delete job计冻结hash输入项/字节；1–10000有限数值，空输入无工作。原单文件Native格式及16MiB等扫描边界保持，异常文件不自动覆盖。删除在副本执行，最终原scope+cancel/readonly重验后原子替换；失败/取消不部分发布，准入先于index IO，无Embedding/model usage。

定向出口：已有list/insert/delete共享原job限额，Route移除/冷恢复不补余额；actual Hybrid当前collection delta删除转交已有computeContext。排队/处理取消、Task/Session变化及写失败保留原index/已观察成本，源Timeline/Information/World保持。旧无预算路径兼容；retired namespace仅转发须区分静态与实际覆盖。purge、其它CPU/local inference/background/continuity与真实G06依赖仍继续，本组外部0/main不变。

source `2074ed7b9`已push，13新distinct/9受影响旧checks通过。原computeContext入口before400是未支持合同，不冒称预算绕过。原writer新增delete mode，hash冻结先于physical permit等待；只在临时副本deleteItem，原guard与同步原子replace沿既有insert方式，失败/取消保持原bytes且清理stage。actual Hybrid current-collection delta经过client→Native HTTP/同一job额度删除旧hash，再原Embedding/query重建；源chat/Timeline保持。retired namespace转发仅静态/既有source guard，未知sidecar/坏index拒绝保持。空hash不work，missing index实际stat可记录completed工作但不创建文件；scoped权限/readonly/Route移除与两engine recovery保持。纯Native拒绝无效hash在Number映射前，legacy转换保留；purge与其它依赖仍继续，外部0。

## 已交付有限 G05：原 Native 单文件派生索引清理

完成条件先冻结（2026-10-11，本机提交日期）：只接现有Native `/purge`，原authenticated vectors/atri-retrieval下exact collection/profile namespace；不扩大legacy purge-all、源Timeline/Information/World删除或真实用户资料清理授权。沿同一physical permit与原Run/Task localWork，index_purge计1 namespace及序列化输入字节，无模型send/新owner。静态路径必须恰为root下两级；实际目录/单文件均重验真实路径与非链接，未知sidecar、坏格式、超过原16MiB/10000项等边界拒绝且保留。

准入先于index IO，等待取消不charge，缺失index观察可记completed且不创建。单文件读取校验后，原scope/cancel/readonly最后检查与同步unlink index.json在同一原authority锁内完成；保留空目录避免递归删除与提交后cleanup半成功。提交前失败保持原bytes，提交后成本结算失败不得冒称文件仍在；不宣称跨进程锁/CPU硬期限。取消/Task/HEAD变化、readonly、quota与FS/SQLite recovery，及真实隔离HTTP路由+单文件实物检查是有限出口。只用可重建fixture，不执行真实资料清理；external0，其他M8/HM2依赖继续。

source `f07553645` / `4818ff76d`已push，18新distinct/9受影响旧checks通过；HTTP/client实物清理与原FS/SQLite额度恢复、取消/Task/HEAD变化均沿原owner。根目录junction反例此前实际200误删fixture单文件，修复为root/namespace/file非链接及root重验后503保留；所有测试仅隔离可重建fixture。同步unlink仅原index.json，保留空目录，不递归清理。已提交后settlement故障保留charged记录/明确文件已不存在，原receipt随后可settle完成；不冒称所有错误均保留原文件。Native typed quota/unavailable沿旧error handler返回，legacy purge-all保持。测试lint新增问题已修；base/current相同20项旧lint问题未改，无新增产品lint问题。Record保留各次失败及精准重验；其余成本/continuity/G06依赖继续。

## 已交付有限 G05：原 Native Host count/render 工作

完成条件先冻结（2026-10-11）：只包原Host provider.countTokens/renderRequest（含重试再次lowering与原私有checkpoint恢复校验），不声称Context编译/所有CPU或Session续接已交付。generation_count/generation_render各计1 job及原公开contextPlan+promptIr序列化输入字节，沿原computeBudget.localWork/Run operation或Studio Task；旧未设限路径及preview保持，Route移除后原保有额度不补。原background intent沿同一background lane/anchor，不新增period/window authority，不伪造模型attempt/token/价格。

每次实际count/render前原scope+额度准入，处理/settlement后重验当前scope/cancel；失败保留原工作成本、未lower/send不假记HTTP。原已准入worker仍由scheduler保有permit至结算。request routing只增加当前请求localWork观察，durable账本仍原authority。限额先于adapter运行；计费输入为公开编译结果，私有opaque仍原128/16MiB/2MiB/TTL限制，CPU process切片不是独立线程/硬时长。最小出口：FS/SQLite原Session+Studio Task实际Host/loopback count+render→send、额度/并发/Route撤回恢复、stale/cancel/adapter失败/readonly-preview，原Task native checkpoint与背景任务消费者的受影响检查。API external0；剩余Session任务历史/安全fork/compaction与其他成本继续。

source `efe9b9ca6`已push，30新distinct/34受影响旧checks通过，仅FS/SQLite/loopback。count/render（重试render另算）先原job额度后adapter；原Run/Task当次与继承额度原子判定，真正未设localWork不会写空control或Task，Route撤回不跳过已有额度。后台同原intent lane/anchor，模型period/window保持；preview仍不charge/不send。原routing.compute增加当前request localWork并将其计入configured，unknown价格仍不造数。处理或settlement后scope变化保留已观察failed/completed成本；render已取得private lease后失败沿原adapter await discard，发送前本地job拒绝不触发reset或丢弃有效旧checkpoint。原未设local预算路径/直接adapter同步接口保持。

输入计公开contextPlan+promptIr字节，不写ledger原文或opaque；CPU仅原process切片/本阶段工作观察，不包含全部Host加载/Context编译/费用或硬CPU期限。取消返回仍沿原scheduler语义；worker继续保有permit至结算，非所有模式都承诺Host等待worker。Record区分各次真实/fixture失败和最小复验；Session Task缺完整公开历史消费者、安全fork/compaction、其他CPU/cache/local inference与真实G06依赖继续，未永久排除。

## 已交付有限 G04：原 Session Narrator Skill 工具轮次的公开协议历史

完成条件先冻结（2026-10-11）：只接原Session Narrator→runNarrativeSkillLoop→GenerationService/Native Responses active execution的实际只读工具轮次，不创建ProjectTask或新Session task身份、store或历史writer。原loop当前会重新JSON.stringify解析后的tool args，可能破坏已有public providerState.calls的exact原arguments string；以原已normalize/工具声明核验的public call保留该字符串，fallback无raw的旧ports仍构造原公开call，源Skill读取继续用解析args及原scope/hash/pagination。

最小出口为FS/SQLite真实Session Host+loopback Native Responses，两轮含空白/键序的arguments与encrypted native items完整回传、只读Skill读取、原Run两model send与四local job、仅final prose对外及Timeline不写。取消/Source HEAD变化/额度拒绝在相关边界仍停止额外send，保留usage/unknown；旧compatible loop与原none/active native回传检查只验受影响项。实际仅本invocation工具loop，非跨调用Session task/restart/safe fork/compaction验收；后续完整公开历史消费者仍需继续，无自动reset或真实verified升级，external0。

source `f48e90323`已push，7新distinct/10受影响旧checks通过。完整fixture使用正式activeExecutionCapability常量后，对原loop的负控制在FS none/active两路径实际第一send后第二count失败（arguments重stringify）；保留raw arguments后FS/SQLite四路径完整两轮wire/原模型usage20+20/四local jobs/只读Skill与仅final prose通过。cancel-read/HEAD变化/job额度反例不进入第二HTTP，原first reported20与两job保留。前几次fixture settings/hash/pin与capability拼写失败均单独记Record，不冒充目标缺陷。此组仍只是原Session本invocation，不启用跨调用Session task/restore/fork/compaction或真实verified。

## 当前有限 G04：原 active execution 的 Session source 清理隔离

完成条件先冻结（2026-10-11）：复用原nativeEnvelopeBinding/process envelope/lease与Host原Session/Run source；仅修原非ProjectTask request scope的清理身份，不能只靠用户requestId区分不同Session/branch/revision/role。公开成本与domain资源不添opaque，ProjectTask scope保持原contract。只为原request scope附当前受验证contextPlan.source与原route.role，source/provenance/prefix/tool/history/account/path校验继续完整保留；不扩展checkpoint共享、fork继承、自动reset或verified发布。

最小出口：同owner/exact target/requestId的两真实Session各先取合法原生tool checkpoint；一个第二HTTP取消/cleanup并保留unknown成本，另一个仍沿自己原HEAD/公开历史续接，禁止清理跨source状态。source/role身份的adapter lowering局部断言、原Native none/active协议及Source/history/取消反例只验受影响项，fixture/loopback external0。Session Task公开历史消费者与fork/compaction等继续，拒绝不伪造重置或无损恢复。

## 已交付有限 G04：原 Native Anthropic/Gemini 的 Studio Task checkpoint

完成条件先冻结（2026-10-11）：复用原native-messages-provider、Private envelope/lease、同一个RuntimeCheckpointStore、原Studio Task public conversation与executionFingerprint/配置anchor；不另建store/协议/continuity authority。仅原Native Anthropic/Gemini + Project Task task/adaptive，仍须exact verified task能力，adaptive另须exact verified adaptive能力；只在本地synthetic fixture提供能力，不改变真实路径verified状态。未verified/非Task/missing或编辑历史仍发送前拒绝；同样冻结start/continue/reset原因/公开handle lineage/loss，仅允许原public observation projection的有限adaptive reset。

完整原生thinking/redacted blocks/signature与Gemini parts/thoughtSignature保留原数组/键序，仅存原private Runtime；count/render只读恢复，原charge前重验私有lease/存储，send再重验并单次消费，实际reset在额度准入后。合法final response也持久化；public Snapshot/Task/portable资源仍无opaque，restart仅原StorageEngine冷恢复，不因新Host/请求ID重建预算。共享通用store/Host的配置ABA、取消/结算清理和未准入budget拒绝边界保持；只重跑实际受影响的协议/消费者。

定向检查实际Host→loopback两brand的FS/SQLite存储/独立Node恢复、至少原Studio cold public-history消费、未verified与Secret期间删除前HTTP0/无新model attempt，以及tool/credential/private状态完整性。Anthropic仅reported input/output、无total时保持unknown上界，不造input+output总计或金额；Gemini reported total原样settle。零新增外部调用/真实质量改判，其他Session Task、安全fork/compaction、后台成本和G06/H5前置仍继续。

source `d0f0bfeed` 已push，30新distinct/20受影响旧checks通过（Record维护日志与计数）。两brand的FS/SQLite实际Host/独立Node恢复与Studio public-history/有限adaptive reset通过；只在fixture提供verified能力，真实路径不升级。旧none/active的direct adapter count/render仍同步兼容，durable新路径返回Promise，由原GenerationService await；旧native stream/private replay/Studio active检查通过，未因异步假设改写不相关旧fixture。

Private store内部doc codec升级v2：仅opaque content以`contentWire`有序JSON字符串持久化，解码回原数组供lowering；完整doc仍按原容量/TTL/integrity/authority校验，通用resource/engine serializer未改。两项本地归一化JSON codec模拟此前真实改写键序，before FAIL/after PASS；不是执行PG/MySQL或真实服务签名验收。v1 object-only checkpoint不能证明原始顺序，恢复时失效；task发送前拒绝，adaptive仅原保存public observation projection reset并记录opaque loss，不宣称无损迁移。普通public handle schema继续v1，无opaque portable/domain字段。其他Session Task/fork/compaction与后台成本、G06/H5前置仍继续，外部API0/main不变。

## G02 编译绑定 checkpoint

source `37273d4ca`：原 canonical JSON serializer 统一资源 hash、HTTP token count 与发送 bytes；保留数组顺序和 raw instruction。PromptCompiler 原 target / stage layout 不改优先级，已有 typed parameters 分别控制 behavior / identity / expression / narration。compilation 增加稳定资源/segment identity、exact ref、内容指纹、volatility 与仅候选 cacheability；不是 Provider cache grant。

Snapshot 的 compiledBinding 固定 source / provenance / native selection、target、资源、generation、tools/output/history/prefix/full content 与最终 lowering 指纹和 compiler/canonical/layout versions。动态 request ID/时间不进语义指纹；revision、权限投影和有效动态输入仍进绑定。四项新增实消费检查覆盖 Session + Project loopback HTTP，P3 compiler/context 44项及两项旧 injected-port 修复检查通过。签名/opaque envelope 当前 transport 仍拒绝，native continuation/compaction 留 G04；不声明全部 G02/G04 或 M8 验收。

## G03 首批复用 allowlist 与 checkpoint

source `c6979abda`，2026-10-11：只启用原 Task Artifact 的 reusable/context grant 与同 Project、同 exact intent/current base 的 plan structure。Context 原 consumer 重验 definition/result hash、Package/branch、scope epoch/dependency，原 authority 和执行 currentness 不撤回；operation/once effect 不走该只读复用。Project plan 从原 TaskRepository 读取，重置 step status，不复制 proposals/Workspace/receipt；后续工具、precondition、Review/commit 原 guard 仍执行。未启用近义 candidate、外部工具结果或 Final Prose cache，不新增 dependency registry。

显式 executionPolicy 的 fallback 保留同 exact PromptProgram、network policy、target allowlist、verified requirements 与 output authority，原 Snapshot 固定有限 failure plan。旧 Route 无 executionPolicy 继续原精确策略，不自动迁移。首批 proof/structure/guard 检查通过，收益、价格/health/locality与 continuation lifecycle 继续后续消费者验证，不把既有 artifact read 宣布为已省模型调用。

## G04 Responses 与完整性 checkpoint

source `09ef28452`：`provider.openai-responses` 沿原 Provider Port/Host 接入，`store:false`、完整原生 output items 的当前工具循环回传；不以 chat-compatible reasoning text 代替 envelope。原生 items 不被 canonical 重排；一般 tools/schema 保留 canonical rendering。私有 Runtime 进程内 checkpoint（最多128个、每项2MiB、TTL10分钟）与发出前私有 lease（最多128个、TTL60秒）隔离 opaque body，Snapshot/preview/共享消费者只持标识、绑定和hash。路径/account、request ID、source/branch/revision、prefix、tools/output、generation/policy与原history prefix逐次核验。发送前重验 lease和checkpoint，完成后discard；restart不恢复，portable Save/Package/Memory没有新增opaque资源。

此支持范围仅为 process-local active execution 的协议必需回传。executionPolicy 的 task/adaptive（以及要求 verified 的 active mode）尚未启用，跨turn、持久restore/安全fork、compaction仍 unavailable/未验收。`47575e344` 将 Anthropic/Gemini 原 adapter 接入同一私有 envelope/lease authority，原完整 blocks/parts 只在实际 wire 回传，公开 state 不再附 content；精确目标及 source/history/tool 变化发送前拒绝。Host retry 从原冻结 snapshot 重新 lowering、获得单次发送 lease；不复用已消费 lease。全部brand/Gateway仅本地synthetic协议矩阵通过，本checkpoint零真实API发送；真实gateway、unknown/cache telemetry与G05/G06继续。

协议核对来源：[OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)、[Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)、[Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures)。协议文档不证明已配置gateway支持。

## G04 配置 gateway 与 Studio 当前消费者

`acd2d563f` 后冻结同主模型 `gemini-3.8-flash` / 同原 account 的四有限路径：Responses `/v1/responses`、Anthropic `/v1/messages` 实际404，Gemini `/v1beta/models/...:generateContent` 与原 `/v1/chat/completions` 实际200并normalize。原native Gemini完整签名工具回传与只读Project工具两轮实际消费通过；报告alias、直接total usage只作直接观测，canonical upstream/hidden retries/cache hit/货币价格仍unknown。

`9369f3b0a` 修复真实Studio每轮不同requestId/Project attempt的问题：只有原Host核验的Task来源可用当前Task lineage，owner/account/endpoint/target、Project/base、Task语义fingerprint/authority epoch、history与prefix等继续精确绑定。Snapshot保留逐请求identity，原Task各generation attempt仍分别捕获。Session及非Task请求仍受原requestId绑定，不开启task/adaptive持久continuation。Task语义改变时Studio显式转换为公开工具observations重算，不重放旧签名；Host在发送边界重验当前Task语义，不信调用者旧prefix，改动再恢复同内容也由epoch拒绝。取消/失败discard当前private状态。

真实client→原HTTP router→Host→loopback provider消费和不同Task/changed/late/restore反例通过，公开输出无opaque。此消费者修复未重发已通过gateway协议请求；真实API pins仍各自Record所列producer，不能把旧实测source改为新HEAD。完整G04/G05/M8/HM2尚未验收。

## G06 有界 active_execution policy 消费

source `0cd35d851`；以上G01/G04的“verified active未启用”是对应历史checkpoint的事实。当前native Responses/Anthropic/Gemini Port声明其实际current tool-exchange consumer，原GenerationService同时要求同owner/account/target/path的有效verified `generation.continuation.active-execution`证据才接受active policy；adapter构造声明不成为gateway验证。兼容Port无该consumer时仍拒绝，task/adaptive仍unavailable。

| 当前模式/路径 | 有限实际消费者 | 明确边界 |
| --- | --- | --- |
| none + native | 保留协议必须的签名/opaque工具回传 | 不伪造“无状态”对照 |
| active_execution + native + exact verified evidence | 原工具loop/private envelope/单次lease；Studio不同request/attempt ID沿原Task scope | process_only、完成/失败/取消discard，无跨turn/persistent恢复收益声明 |
| active_execution仅声明或缺consumer/过期/换path | 发送前拒绝；编译及Secret期间再验 | 不能用override或active证据借用task/adaptive |
| task/adaptive | unavailable | 无消费者，不按已配置字段计算成功率 |

countTokens、render及capture使用同一accepted policy，候选Route的声明不改写；同路径fallback自身声明不同仍保持accepted binding，更换不兼容路径的旧opaque不回放。观察到同owner/execution的合法引用已失效即终止该checkpoint，active→none拒绝后恢复active不复活；伪造引用/其它owner不会删除原handle。原scope/权限/source守卫、使用量和协议完整性继续适用。17新本地有限checks及6受影响旧检查结果、失败fixture与实际producer见Record；新增外部API0。旧gateway成功只归原producer，不能据此标当前HEAD全网关verified或完整G06/HM2质量通过。
