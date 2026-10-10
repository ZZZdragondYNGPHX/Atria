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
