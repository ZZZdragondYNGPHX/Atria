# G01：执行路径证据与 M8 有限实施矩阵

> 2026-10-10 从 HM1 main `3ee1332ef` 进入 M8，source checkpoint `c62ecc937`。G01 当前基础 checkpoint 已实现；完整 M8 / HM2 未验收。阶段职责以 delivery §8 和 model-routing 为准，执行规则只引用 Governance。

## 已冻结的工程范围

- 复用原 ConnectionProfile、ModelProfile（Callable Target）、RuntimeRoute、VersionedJsonResourceHandler 和 StorageEngine。不新增 profile registry、发送器或 dependency authority。
- Model CapabilityDecision 可附 v1 binding：owner/account/endpoint/target/adapter/transport/options 的 canonical path fingerprint，observedAt/expiresAt、declared/verified。它不把模型字符串当 canonical upstream identity。
- Verified 发布仅接受服务端 adapter observation 的非 JSON marker；普通配置不可伪造。既有 exact 观测可原样保留，改 endpoint/account/model 时仍须消费路径核验。来源缺失、过期或改路径降 unknown；当前明确 unsupported 优先。配置与 runtime 预览不自行 probe。
- 原 Route 可选 executionPolicy v1：有限目标 allowlist（1–16）、verified requirements、continuity 与 reuse 许可。旧无该字段的 Route 原样精确读取，不迁移 Package、Prompt、Generation refs。政策决定和非秘密证据随原 EffectiveRequestSnapshot 固定。
- 当前 continuation consumer 仅 none；active_execution/task/adaptive 已严格识别但 unavailable，不能凭字段可构造宣布能力。原生 handle、lineage、完整 block/签名与 restore/delete 的实际消费者在 G04 补齐后才可启用。
- 价格、实际上游与网关内 retries 未知时明确 unknown；三层 cache 分开。不用用户声明或 adapter metadata 冒充 gateway measurements。

## 本地支持矩阵与继续顺序

| 对象 | 当前已验证 | 未验证 / 下一消费者 |
| --- | --- | --- |
| 原 registry | FS 精确读写、SQLite 真实 dump/restore | 本轮未跑 MySQL/Postgres；codec/key 未变化 |
| 基础执行 | 原 OpenAI-compatible/raw-text Core 52项保留 | G02 compiler binding、G03 failure/reuse、G05 charge |
| Path evidence | 新10项：失效、账号/路径、send前过期、不可伪造、SQL恢复 | G04 真实 adapter/probe observation |
| Continuation | none；其它模式发送前拒绝 | G04 按 delivery 原生协议顺序，不以兼容接口假充实现 |
| HM2 | 不开启深检索或缓存 | H3/H4 继续等待相应 G 消费者和 G06 实测 |

具体结果与失败修复保留在同一 Record。G02 沿原 Prompt Module target 保护 behavior/character/style/context，canonical 仅处理结构化 JSON、保留 history/tool/opaque 顺序；G03 沿原 artifact authority 校验；G04 沿原 Provider Port；G05 沿原 RunControl/send；G06 最终评价。不存在跨阶段停工或另加 API 审批。

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
