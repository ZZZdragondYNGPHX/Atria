# S06 — 双入口隔离执行与比较

- Task ID: `agent-intelligence-runtime`；沿用同一产品分支。
- Status: **Complete — 隔离 evaluator、真实六槽基线 / 六对独立比较、typed model observation 与有限累计预算已交付；候选晋升未通过**。
- Basis: [S01](s01-baseline.md) 的 12 cases / split、[M1](m1-evolution.md) 的原 authority / 局部 scope / 独立晋升约束；[S05](s05-feedback.md) 的来源失效不能授予 evaluation 或 publication。

## 有限消费者与执行契约

`tests/agent-intelligence/comparison.mjs` 是本阶段本地 evaluator consumer，复用 S01 adapters、原 Director Engine / AgentRuntime / message takeover 和 Studio Agent / ProjectAgentService / StudioService。不新增产品配置 authority、HTTP 写入入口、存储 kind、后台循环或候选发布。

首次冻结仍使用原 CASE_SET_REVISION / Case v1，六个 development 与六个 promotion 输入不同。调用者必须显式选择 split，按验证问题选择 paired repetitions；每个 case / repetition 保留 baseline、candidate 两个槽位。scripted 奇数 baseline 先运行，偶数 candidate 先运行；真实模型先跑完并独立保存全部 baseline，再运行 candidate；不复用任一 arm 的可变 chat、task、Project 或临时目录。case、fixture、input、rubric 变化必须新 revision；不凭旧报告合格状态接受新输入。

执行 envelope 固定 case / fixture / input / rubric、settingsHash、tested HEAD、实际 evaluator / 相关 Runtime 源码字节 hash、transport、工具域与随机性、唯一 evaluation invocation / trial identity。HEAD 不代替 dirty 字节身份。当前 scripted transport 与 unavailable model 不声称 provider exact pin；live 模式固定显式配置、immutable Prompt / generation resources、原 route resolver 和模型引用，核对实际请求 / snapshot / settings hash；价格与真实上游均 unavailable。每个 arm 保存实际请求 hash、来源与结果 hash、原 run / request / task / effect refs、确定性 checks / Review / final text / usage / 缺失，消费者复核 coverage、来源、arm、计数与摘要。

本阶段 synthetic candidate 只允许一个已存在的测试输入字段：RP Director mainAgent systemPrompt、Project fixture Skill 的 SKILL.md 内容、或原 maxRounds / maxModelRounds。文本最多 16 KiB；轮数 1–6；不允许增加权限、改变工具、route / Secret 或 production binding。Project 文本沿原 Skill scope / always 解析进入原 buildNativeProjectAgentSystemPrompt；RP 沿原 Director profile 编译；消费者核对实际 request 中已消费的文本与 hash。这是隔离输入，不提前交付 S07–S09 的不可变版本 / 发布。

## 原 authority、副本和工具域

RP ordinary chat 在每个 arm 新建玩家 / NPC 数据与独立 run / request / variant、per-run tools；玩家消息前后 hash 不变，取消的旧 handle / completion 不能写新 variant。可见承诺是 fixture 提供的历史，不能称生产 Memory resolver 验证。

Project 每个 arm 创建全新 runner-owned FS/Git store，源 IDs 从固定 fixture hash 确定，保证两侧 source 输入相同，Git revision / task identity 仍各自记录。真正的 Workspace、validation、Preview 与 Review 由原 services 生成；simulation 使用显式 dry-run port。模型无 Commit / publication 入口；明确 fixture reviewer 只向私有副本 commit，正式 receipt 和重复 Commit 仍经过 S04 原路径。临时邻近的无关 Project 树 hash 保持。bridge 只接收指定方法 / 路径 / Project / task；外部网络、foreign Project、production publication、DELETE 和未知工具均拒绝，不 fallback 到旧 fetch。

Native Session 的副本能力使用原 NativeSaveSystem exportSession、原安装 Package 的 exact archive、importSave 与 SessionCore。相同 save revision 分别导入两个独立临时 StorageEngine；候选 append / stale revision 被原 Session authority 处理。来源与 baseline 副本前后保持；这证明副本隔离，**尚非 Native 模型执行或任意生产 Session 克隆 API**。普通 chat 与 Native Session 不互相伪造身份。

本地 runner 使用原 NativeTaskScheduler maintenance / auxiliary_task / retry=false、受限资源与固定 key；新建的是隔离 fixture，不是另一套 scheduler。全局互斥与 finally 恢复 Atria / fetch / presentation evidence；清理前核对 realpath / marker，只删除 runner 创建的目录。该 runner 是可信本地 evaluator 的隔离依赖注入，**不是针对任意 Node 代码的 OS sandbox**；不加载任意 candidate 脚本或生产用户目录。

## 报告、judge 与预算

Comparison v1 最多 4 MiB，最多 18 pairs / 36 trial 槽；未知字段 / schema、缺失 / 重复 pair、跨 arm identity、source / envelope / request / outcome 漂移、伪造 usage / summary / empiricalReady 均拒绝。CLI output 必须新文件，在执行前 exclusive open，已有文件不覆盖；生成报告不提交 Git。JSON / IO 失败明确报错。

Blind projection 只向显式 evaluator 返回 left / right synthetic output 和 exact pair binding，不暴露 arm 标签；每 pair 最多三位独立 judge 的显式 human observations。意见分歧必须 awaiting_review；无 judgment 为 not_run，意见不填充原 S01 未运行的行为维度、不产生 publication 权限。输入 observations 只做关系校验，不提供远程身份认证。extraction 不能从 consumer 展开 promotion output；能直接读本地 fixture 文件的可信代码不在这个防泄露边界内。

`judge.js` / live consumer 的 judge phase 对具备两侧 artifact 的 pair 以同一显式连接各发一次 blind request；缺一侧不发请求并保留 unavailable。新 observation rule 单独 hash，不把原 S01 ungraded rubric 改写为已评分。输入含版本化 task / 可见 facts / 双侧 output 与 formal outcome，过滤 arm 标签 / 私有事实；JSON 必须包含 preference、confidence、每个原 dimension 两侧 0–4 scores 与有限公开 rationale。未知字段 / malformed rating 保留无效结果，修复协议或测试消费者后按需复测，不捏造评分。
JudgeReport v1 绑定完整 Comparison hash、rule / evaluator revision、pair / input / response / grade hash、actual attempt / grader charge 与共享 ledger；保留所有 pair、失败 / blocked / invalid_response。该模型与被测模型相同，单次评分仅 model observation，human preference / 独立多 judge 分歧未观测；summary 明确 promotion ineligible。不凭比较缺失或一个评分降低保护线 / 自动设定晋升门槛。

Scripted 的原六次 request / 两次 repair 是产品行为契约；早期 1–216 send ledger 是历史测试配置，不限制当前必要的测试诊断、修复复测或 transport retry。API 测试统一按 Governance §13.1，失败/partial 保留实际槽位，不伪造完成。脚本只报告实际 generation / tool 计数，0 external calls 不等于 0 tokens / 低费用；usage、tokenDelta、costDelta、latencyBenefit unavailable。

未接 bridge 的 Model readiness 保留全部 pair 槽并标 unavailable，不替换成 scripted；已接 bridge 的测试不以旧有限 pilot/token 数值缺失返回 budget_blocked。

`tests/agent-intelligence/live.mjs` 是明确配置的本地 live consumer：私有连接文件含 apiKey、endpoint、model、tokenizer / context guard、按任务配置的 output 和 timeout。按用户纠正，endpoint 可为 `/v1` / `/v1/` base，由 evaluator 创建原 Native connection 时拼接一次 `/chat/completions`；既有完整 endpoint 不再拼接。base 配置有新的 identity，早先完整 endpoint 的报告不改写。只接用户明确提供的测试连接，不发现其它 Secret / route。RP 沿原 GenerationService / PromptCompiler / RouteResolver / HTTP provider，Project 沿原 NativeGenerationHost 与真实 isolated Studio task；RP 多轮只传 public role / content / tool pairing，过滤 Director presentation metadata 与 private reasoning。测试沿现有显式模型连接执行；必要 transport retry 按实际问题处理并计数，产品路由权限沿原契约。

工程 API 测试见 [Governance §13.1](../../../README.md#131-api-测试执行规则)；本模块只管理试验设计与产品行为契约。

请求保留 snapshot / configuration / request / attempt hash、有限公开 tool name、HTTP status / transport 分类与 response-header 等待时长；这些不包含 Secret / header / 原始 response body。该时长不是流式 TTFT 或总端到端时长。tokenizer 是明确本地估计，并非该 gateway 模型 tokenizer 的事实证明；upstream、price、opaque gateway retry 仍 unavailable，不能据此宣称费用或严格同上游质量收益。

原 Director 路径可以观测 scripted 调用图；single body、shared cognition、critic 没有本阶段同输入 / 同工具 / 精确配置可用 adapter，分别 unavailable，不能删必要 guard 来凑 ablation。真实同预算质量 / 成本 / 延迟对照由实际证据补齐；G 阶段不成为 S06 新依赖。

## 完成与接手条件

本地最小检查覆盖 comparison / 原 baseline 与新增故障面：5 relevant suites / 101 distinct tests passed；最终 base URL 接线只定向 live-bridge / judge 15 passed，ESLint / diff 与文档结构通过；未执行全量测试、build、浏览器或远程 CI。

真实 Gemini development 六槽均 execution / authority passed，原 S01 report empiricalReady=true；独立 promotion baseline / candidate 六对共12 trials全部 execution / authority passed，保留先 baseline 后 candidate 的冻结与来源证据。六次 blind grader 得到五个 typed observations 与一个 invalid_response，当时格式失败保留原结果；必要修复复测按当前规则继续，不伪造分数。取消 usage 保留预留上界；全部失败 / 修补前运行 / grader / 补充连接探针计入同一 durable ledger。

本阶段验收的是原入口隔离执行、可追溯独立比较及 evaluator 对实际结果 / 缺失 / 预算的保守消费。历史有限请求 / token guard 与 deterministic authority 检查当时已验证；现行测试限制以 Governance §13.1 为准；晋升门槛保持拒绝：comparison empiricalReady=false / publicationStatus=ineligible，原 S01 behavior slots not_run，人工偏好与多 judge 分歧未观测、价格不可知、一个评分需审阅。一次 candidate 偏好不证明稳定质量提升，不能自动批准候选。后续 M1 晋升 / S10 仍须真实行为与回归证据和费用门槛；不把这些缺失写成已通过。Native Session copy 仅隔离验证，production Session generation 未重放；不可用 ablations 均显式 unavailable。

S06 evaluator 与真实执行 checkpoint 完成，下一 checkpoint S07；S06 实际结果见同一 [Record](../../../records/refactor/agent-intelligence-runtime.md)。本阶段没有 candidate publication 或新自动权限。
