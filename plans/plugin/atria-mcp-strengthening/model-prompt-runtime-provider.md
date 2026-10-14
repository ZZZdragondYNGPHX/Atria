# Atria MCP 补强 — Model / Prompt / Runtime / Provider Bridge（第五轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；**Primary Workspace**：`plugin`，文档归 `docs`。
- **冻结决定**：2026-10-14，第五轮选择 **方案 B：完整原生 Runtime Bridge**。本文件是目标方案，不表示 Action 已实现或联调通过。
- **核对基线**：`main@9241325a7290e613e0fdaaa1870409105c161c89`，`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。后续实现前重新比对真实 HEAD 和原生 API schema。
- **关联**：[总入口](index.md)、[能力矩阵](capability-matrix.md)、[P0 调度/授权与恢复](p0-reliability.md)、[Studio/Agent](studio-project-agent.md)、[认知/学习域](memory-goals-experience-evolution.md)。

## 1. 总体定位与冻结的不变量

1. **完整原生 Bridge，而非第二个模型 Gateway**：所有 Connection、Model、RuntimeRoute、Prompt / Generation resource、实际模型调用、Route resolution、预算、Secret resolution、Provider transport、Fallback、正式 Session/Project 提交由 Atria Native Runtime/Storage/GenerationHost 负责。MCP 仅注册固定、受审查的语义 Action，并承担精确授权、审批、受控 orchestration、观察、回执和安全恢复。
2. **18 个顶层 MCP 工具保持不变**；语义扩张进既有 Registry 的完整 Action ID，按 READ / INTERACT / MUTATE / DESTRUCTIVE 和 externalEffects 分类。不可让通用 `atri_api` 执行任意写入、不暴露模型自带任意 method/path/JS/shell/SDK gateway。
3. **当前已知事实**：`main:src/endpoints/native-generation.js` 注册了 `provider.openai-compatible`、`provider.raw-text`、`provider.openai-responses`、`provider.anthropic`、`provider.gemini` 五类文本执行 adapter。原生 `connections/probe` 仅对特定 format + HTTP + 无不兼容 options/networkPolicy 提供模型发现；实际“支持执行”不代表自动发现支持。现有 `plugin:atria-mcp/src/read-authority.js` 已有 connection/model/route list、generation resources/presets/retrieval、`connection.probe`；`mutations.js` 有 connection/model/route update 与 Runtime prompt parameter update，但仍没有完整的版本化编辑、无副作用纯 Preview、显式执行/费用与恢复语义链。
4. **精确权限与对象引用**：RuntimeRoute 关联 player-owned Connection、Model 和精确 `core.prompt-program`、`core.generation-profile` Revision；ResourceRef 必须包含 owner scope + type/id/revision，不能按同名资源、“latest”、旧默认 ST 预设或猜测当前角色来隐式选择。Project/Package 资源与 Library 分属不同写入权威，不得直改已安装 Package。
5. **身份独立**：`requestId`（Native request）、`MCP operationId`、Native Task `operationId`、Session Revision/Project Task Attempt、有效请求 Snapshot、Provider send attempt、SecretRef、费用 Receipt 各自不同；不能用 HTTP acknowledgement 代替模型完成/使用量/持久结果提交。

## 2. 六类原生对象与 Authority 边界

| 原生对象 | Authority | 修改方式与强制证据 |
| --- | --- | --- |
| `ConnectionProfile` | `NativeModelPromptPersistence`；Secret 仅 `SecretPort` 可解析 | player-owned、`If-Match` fingerprint、Endpoint/Transport/Adapter/networkPolicy/secretRef 完整 diff 审查 |
| `ModelProfile` | `NativeModelPromptPersistence` | 指向稳定 `connectionProfileRef`、model ID/limits/capabilities 需来源验证、`expectedFingerprint` / 测量证据 |
| `RuntimeRoute` | player 配置由 `NativeModelPromptPersistence`、Session scoped Route 由 Session authority | 精确 role/ref、Fallback graph、executionPolicy、Prompt parameters、route 版本/CAS；无跨 scope 非法引用 |
| `GenerationProfile` | `VersionedJsonResourceHandler` / 受控 PresetStore | immutable exact Library revision；提交新版本不能隐式重绑已有 Route/Package |
| `PromptModule / PromptProgram` | `VersionedJsonResourceHandler` + Compiler、Preset/CandidateStore | 结构化 Module/Program/Derive/Stage 和变量契约；版本化候选检查 + 经批准精确引用切换 |
| `PromptPreset / PromptCandidate` | `PromptPresetStore` / `PromptCandidateStore` | owner/preset revision、candidate source + route fingerprint、inspect/prepare/check/apply、rollback 时检验可用历史引用 |

- Runtime配置中的 `secretRef` 只能暴露精确不透明 ID/必要标签；**永不向 MCP/模型返回明文**，不得接受任意 `api_key` 明文注入、导出或创建 Secret 的旁路写入。
- `GET /configuration` 与 `GET /resources` 是现有只读发现入口，但大资源响应可能超出 MCP 容量；按照 P0 的可分页、有界、按 exact ref 获取的 authority adapter 提供查询。不能任意转发未经验证的大 JSON/Prompt secrets。
- **已存在的旧 README 与现代码可能不一致**：早期文档的 Provider/Transport 描述、`PUT /configuration/profiles` 例子需要以最新 Router 验证；当前 `PUT /configuration/:kind` 只列明 connections/models/routes，GenerationProfile 以版本化 ResourceAuthority 处理。MCP 不能静态照抄历史文档当执行合同。

## 3. 建议补齐的语义 Action 家族

本表 **冻结业务能力及风险方向**，不提前冻结准确的 Zod 名称、Schema 和参数默认值；实施需对照每条正式 HTTP/Service contract 和产品状态。

| Action 家族（示意） | 基本风险 | 预期效果与守卫 |
| --- | --- | --- |
| `runtime.connection.list/get/dependencies` | READ | 透明查看非秘密字段/当前使用者、保留最小权限 |
| `runtime.model.list/get/capabilities` | READ | Model ID/limits、三态能力与证据/有效期，明确 unknown |
| `runtime.route.list/get/resolve/diff` | READ（调用真实 Provider 才升级风险） | 精确 role/scoped RouteRef、resource closure/fingerprint 与 fallback graph；不自动选择歧义 primary |
| `runtime.prompt.module/program.get/inspect`、`runtime.generation-profile.get` | READ | exact revision，typed variable/module dependencies 与 ResourceGraph 引用 |
| `runtime.preset.list/get`、`runtime.prompt.candidate.inspect/check` | READ（确认无写副作用） | 完整来源、route CAS、上下文/引用诊断 |
| `runtime.connection.probe` | INTERACT | 显式网络请求会携带指定 SecretRef 的鉴权凭据；只允许审过的具体 origin/endpoint，输出脱敏、有界结果 |
| `runtime.connection.update` | MUTATE（端点/秘密绑定采用增强审批） | `If-Match` CAS、完整 before/after、Adapter/Transport/网络目标重审、失效旧能力证据 |
| `runtime.model.update`、`runtime.route.update`、`runtime.parameters.update` | MUTATE | 精确配置 CAS、route 依赖/Prompt Program/fallback/预算验证；不能暗中换目标 |
| `runtime.resource.create-revision`、`runtime.prompt.candidate.prepare` | MUTATE | immutable Library Revision / Versioned candidate；不影响现有 pinned Route |
| `runtime.prompt.candidate.apply/rollback`、`runtime.preset.save` | MUTATE（影响高时加强审批） | 单独 Review exact diff、Preset/Route/Program/Generation pin，正式目标 CAS |
| `runtime.prompt.preview`、`runtime.context.preview` | 目标 READ，前提是**确证无状态副作用**；当前正式端未证明前按 INTERACT/禁用纯 READ | 无 Provider 发送、无 Secret 解密、无 Evolution reconcile/持久写入、分层返回 compiled/usage estimate/provenance |
| `runtime.generation.start` | INTERACT（确有持久提交时按 MUTATE） | 显式付费执行，准确的 Session/Project context、Route/role、input/output budget、side effects，返回可追踪 task |
| `runtime.generation.status/receipt/usage` | READ | 观察 Native scheduler / durable authority；消耗和 money unknown 不造数 |
| `runtime.generation.stop` | INTERACT | 尝试取消并返回确认程度，无法保证 Provider 计费撤销或 Session 回滚 |
| `runtime.generation.reconcile` | READ 仅在无持久副作用时；否则专用受控效果 Action | 核对 provider/Native Task/Session/Project 完成、未知 send 不自动重发 |
| `runtime.resource/profile.delete` | DESTRUCTIVE | preflight reference/used-by、独立审批，无法确认的依赖不得删除 |

**实现策略**：扩展现有 Registry/Read/Mutation adapters，避免一次性复制 Router 所有 endpoints；配置更新复用产品原有 owner + `If-Match` + fingerprint；Policy Ceiling 必须以动作粒度精确授权，而非 `runtime.*` 通配继承新增动作。

## 4. Connection / SecretRef / 网络目的地增强审查（冻结）

**核心威胁**：即使 MCP 不读取 Secret 明文，模型也能尝试将原 Connection 的 `endpoint` 改为攻击者控制地址并保留 `secretRef`，使后续 Provider call/probe 将凭据发给新地址。简单的 `noSecrets` 文本过滤与纯配置指纹不足以阻止此类间接泄露。

- 审批内容必须显示经过结构化标准化后的 `old/new providerAdapter, transport, endpoint origin/path, networkPolicy, secretRef ID（不含值）, model route dependencies`，并清楚区分 endpoint 变更、SecretRef 变更和组合变更。
- **高风险变更需要确切目标和凭据使用授权**：变更 Provider Endpoint/Adapter/Transport，尤其同时持有或改动 SecretRef 时，只有可信用户审批同意 `secretRef → canonical remote target` 映射才允许调用；模型自己提交 `confirm=true` 不生效。
- 强制复核 DNS/域名重绑定、回环/内网/metadata 地址、HTTP downgrade、自定义代理/redirect/hostname、跨域跳转及 path/query 对不同 Provider 的影响；在真正发送处依 Host networking policy 再核验。对于明文 HTTP，只有产品明确定义的本地安全范围或经显式用户批准的专用策略才能采用，不能因 URL 校验通过即授权传密钥。
- 探测 `connection.probe` 虽为 GET 模型列表，但使用 Secret 发请求、可能形成网络费用/泄露；是 INTERACT 而不是无风险 READ。Probe 的返回信息有界、去敏感，观察结果声明 Provider、Endpoint、Timestamp/能力 provenance，而不盲目标 verified。
- `ModelProfile.capabilities` 的 `supported/unsupported/unknown`、`binding.pathFingerprint`、`observedAt/expiresAt` 不是模型可任意填写的真值。新的 VERIFIED 路径必须由原生测量/证明端口铸造，跨 Endpoint/Secret/Transport/Model 变更后按原生规则退化到 unknown；不能因配置写入继承原旧能力。
- 出错、日志、截图、有效请求 snapshot、Receipt 与 MCP Journal 永不回传 secret、provider token 或完整授权头；未经许可不输出潜在敏感提示词/私人上下文。

## 5. Prompt/Generation 版本化编辑、Review、发布和回滚（冻结）

- 路径：`inspect exact refs & closure → prepare candidate/new immutable revision → static validate → pure compile preview → diff/used-by/risk review → independent approved apply → exact Route/Resource revision verification`。
- **优先复用 Product PromptPresetStore / PromptCandidateStore / VersionedJsonResourceHandler**。支持 Library 的模块/程序/GenerationProfile 新 Revision，Studio/Project 则必须经先前第三轮的 Workspace/ChangeSet 审查；已安装 Package 是不可被外部 MCP 就地修改的不可变来源。
- PromptProgram Stage/Module ID、prior-stage Artifacts、Derive parent/exclusiveTargets、typed parameters/locals/host/response directive 为正式 Compiler 约束。MCP 不支持临时自定义 JS/ST 宏解释器来绕开编译语义。
- 版本化提交仅创造新的 Resource/Revision；对已存在 Route 仍需**另一次显式引用更新**才能生效。高影响修改应列出 used-by Route/Project/Package 影响及断引用风险。
- Runtime Prompt Control 改变当前 Route 的 override 参数，属于另一种可撤销配置变化，不创建新的 PromptProgram 版本；必须使用原生 GET/PUT + loaded Route compare + 参数规则校验，不能混写 preset 的 authoring Program。
- Review/Apply 的批准 binding 包含 owner、resource type/id/revision、candidate/base/diff hash、route/model/connection 的 exact identity、预期指纹、验证与编译证据。源资源变化导致 409/stale 时重新检查，不静默合并。
- 删除旧版本只有在 Product used-by/reference guard 通过并经独立 DESTRUCTIVE 批准后执行，不能把“Apply 新版本”自动翻译为删除祖先 Revision。

## 6. Preview 零副作用边界（冻结）

**目标契约**：`runtime.prompt.preview/context.preview` 只做精确 Route/Resources/Context resolution、PromptCompiler 编译、Token estimation、Capability/RequiredRequirement 预检和诊断输出。**不得** Resolve Secret、Provider SEND、生成资金预留、修改 Session/Project/Goal/Evolution/Prompt Store、创建/续期运行 Task、写入 persistable continuation/Checkpoint、触发模型网络探测或间接学习。

- 已知风险：目前 `NativeGenerationHost.execute` 在 Preview 分支前调用 `prepareEvolutionProject`，其后可能间接 `Evolution.reconcile`；因此**当前 `/api/native/generation/preview` 还未被证明满足纯 READ 的全部条件**。实现期必须审计全调用链，优先拆出安全不写的专用 authority；无法实现则标 INTERACT/不可提供 READ。不得通过“Preview”名字做权限降级。
- Preview 不调用 Provider SEND，但可能进行 Tokenizer/Context 计算；这些本地开销受产品本身 local work/budget policy 控制。需要网络 embedding/rerank 或持久缓存写入的预处理则属于不同带 effects 的工作，不偷偷混入纯预览。
- 输出只包含必要的 `compile decisions, included/disabled stage, final effective parameters, bounded prompt/context diagnostic, token count, snapshot/hash/refs`，源信息/Secret/私人消息仍按权限脱敏。Preview 编译结果**不代表**真实 Provider 接收、消费、计费或 Session/Project 正式提交成功。
- 对比不同候选 Preview 时必须强制 pin 相同 Session Revision/Project Revision、角色、Host Parameter defaults、有效资源和路径，否则标记无法比较，不把不同时点的快照当因果改进。

## 7. 显式付费执行、Provider Fallback 与预算隔离（冻结）

### 7.1 执行授权

- 只有用户明确要求调用 Atria 的模型时，才发起独立 `runtime.generation.start`。当前外部 AI 使用 Codex/Claude Code 的自有推理**不自动**转成 Atria Provider 请求。
- 执行前声明 `source = {sessionId,revisionId} 或 {projectId,revision,taskId?}`、`role`、精确 `routeRef`（不可按名称猜选）、模型/连接/Endpoint/SecretRef 已经获准使用的绑定、有效 Prompt/Generation Profile、`fallbackMode`、工具/Output contract、Token/调用/可能费用预算及外部 Effects。
- 协议下的模型执行与 Scene/Session 正式写入分别计入各自生命周期：`/execute` 的结果不等于 Timeline 已 commit；`/turn`、`/task` 等经 Native RunControl/Revision 正式路径提交；Project Task 必须带精确 Attempt/Task authority。
- 若模型路由或预期成本缺失、Provider 能力 unknown/unsupported、输出合同无法满足或需要同意网络凭据发送，则 fail closed / 请求明确选择；不凭猜测降级到其他模型。

### 7.2 Fallback 边界

- 继续复用 Native `disabled/automatic/confirm`，以及原始 Route 的 `maxRetries, maxFallbackAttempts, timeoutMs`。只有 Native GenerationHost 能做实际 Provider retry、route fallback，MCP 不新增影子 retry/fallback engine。
- 每条 Fallback Route 必须满足相同 role、权限、路径能力要求、工具/structured output 契约、原始 Prompt semantic authority 和网络策略不降低的要求。新的 Connection/Model/Prompt/Tokenizer/Effective Request 每次 Native 内重编译与计数。
- `confirm` 的 `generation_fallback_confirmation_required` 不能被 MCP 自动改写为 `automatic`；可信批准应绑定明确替代 Route 及新预估费用/Secret 去向。
- **结果未知不是 transient failure**：Provider 网络中断/HTTP response lost，若原请求可能已到达上游，不自动在 MCP 侧重发至本 Route 或另一 Provider。Host 当前有限 retry 也须在 P0 验收中验证副作用/费用与状态，不因外部重试再次收费。

### 7.3 预算、成本与 Evidence

- 同时遵守 MCP envelope、Native Route executionPolicy.computeBudget、Session/Project/Goal 对应 Task budget、Evolution owner budget 和真实 Provider 请求上限；**不统一改写各 domain ledger**。
- 使用 Route/Prompt 编译后的请求 token、预留输出 token 和 Native admission status 做执行前容量检查；Adapter 能力、Tokenization 和实际费用应分开报告。
- `snapshot.diagnostics.executionPlan.economics.currencyCost` 可能是 `null` 且 state `unknown`，不能把一个估计汇率/单位价格冒充 Provider 实际货币消费。返回 `tokensEstimated/tokensObserved/usageStatus/costEstimate?/currencyCostStatus` 等区分类型，具体 schema 实施核实。
- 已经 `reserved` 但 usage 未知的 Provider send，原生预算占用不能因为 MCP 重启/用户 cancel 就清零。开发 API 测试的每日 2000 次 / 20 RPM 限制归治理文档，本方案不发明另一套工程测试许可。

## 8. Operation、Stop、异常恢复与回执语义（冻结）

- 复用第二轮 Control Lane 和軽量 MCP Journal：`MCPInvocationId ↔ Native OperationId ↔ RequestId ↔ Product Task/Session Revision ↔ ProviderAttempt ↔ usage/receipt`，仅存最小 ID、无秘密 hash/状态/时间，不把完整 Prompt/模型返回文本保存为 MCP 独立持久内容。
- 状态至少分 `admitted/queued/running/provider_sent/response_observed/usage_settling/product_committed/completed/failed/cancel_requested/unknown`；不同操作未必经历全部状态，不虚构模型上游状态。Native Scheduler 的临时 operation 不自动被 MCP Journal 恢复为继续运行。
- Stop 通过正式 Native Scheduler/Provider abort 尝试停止执行，已 send 的费用和结果可能仍然存在；标示是否确认停止和已发生的持久结果，不把 `cancel_requested` 当 `rolled_back`。
- Native Execution Continuity `none/active_execution/task/adaptive` 与普通 Job 恢复不是同一件事；`RuntimeCheckpointStore` 的私人 Provider state 仅在产品原有权限/有效性范围内恢复，不向 MCP 暴露或复制其完整私有状态、lease/credentials。
- HTTP SSE 断开/进程退出/超时后用权威 `NativeScheduler.status`、正式 Session/Project Task state、Checkpoint/Receipt 和 Response evidence **只读核对**。无法确认 Provider 是否已计费/完成则保留 `unknown`；新执行需重新授权并有新 Request/Operation identity，禁止自动重发。
- 回执应清楚区分 `Provider execution accepted`、`Provider response parsed`、`Native usage settled`、`Session/Project commit confirmed`，缺一层不宣称后一层；外部客户端断联时也不得删除来源证据和预算记录。
- 生成与 Prompt/Model 配置改变后，上一次能力证据与 Preview Snapshot 不可以继续授权当前执行；用户需重新获得当前 Route/Resource/path proof。

## 9. 必须纳入的真实 P1 验收案例（未执行）

1. **Connection/Secret 泄露路径**：改变 Endpoint 保留 SecretRef、回环/内网/metadata、HTTP 降级、DNS 变化、Redirect/Proxy、Probe 与后续 SEND 前的 TOCTOU；无授权不许发送，任何输出不含 Secret。
2. **Profile/Route 并发**：对 Connection/Model/Route 和 Prompt Control 的 stale If-Match 拒绝；Route fallback 环检测、role 不匹配、已有引用阻止删除与历史修订不可暗升。
3. **Provider 对照**：五种已注册文本 Adapter 与实际 Probe 覆盖差异；supported/unsupported/unknown、路径证据失效、工具/结构化输出/思考/缓存的真实能力证据。
4. **Prompt 版本**：Module/Program/GenerationProfile immutable revision、Preset/Candidate prepare/check/apply、项目/包不可原地覆盖、used-by、独立 Review/Apply 绑定与回滚冲突。
5. **真正无副作用 Preview**：包含存在 Evolution state 的 Project/Session，证明没有任何持久写入、Secret 解密、Provider 请求、预算保留或 checkpoint；Context/Compilation 与 Execute 的身份一致，不以标记 `preview:true` 代替证明。
6. **付费执行与 Fallback**：Exact role/route/context、合理预算、流式与普通响应、工具合同、confirm fallback 拒绝/准许、多段 Provider 故障、Secret sanitization、实际 Token usage 与未知钱数区分。
7. **取消/断线/重启**：调度排队/正在执行/Provider 已接收后取消、SSE 断连、重复 RequestId、跨 MCP 进程、native host 重启及未知 provider send，不双发、不清零已预约费用、不假造 Session/Project 提交。
8. **客户端审查**：Codex/Claude Code 的真实可信批准，仅在当前客户端支持已协商的 approve protocol 时允许写入或调用带凭据/费用 Provider；SDK fixture 不代替实际人类 UI 验证。

## 10. 实施路线与未冻结参数

- **推荐依赖顺序**：源 authority 发现/依赖关系 → Connection/Model/Route 权限安全与测量 → Prompt/Generation immutable editing → pure Preview 端口 → Paid Execute/Cancel/Status/Receipt → Fallback/Provider matrix 与异常联测。
- 产品端若缺少无副作用 Preview、按 exact ref 的大资源分页/获取、网络目标 bound Secret usage 或恢复观察等必要 Authority，应先定位实际缺口后在适当 `main` 临时产品任务分支补充小的专用服务；**不**因为 MCP 扩展而重建一套 Native Model/Prompt/Provider Gateway。
- 尚待实施证据才能确定：Action 真实 Zod schema、Route change 风险展示格式/允许的网络策略、Probe 对更多 Provider 的拓展范围、离线 token count 真实支持、asset 分块机制、cost 估算来源和 Operation Journal 物理格式/保留期。以上不改变本轮已冻结的权限和持久化安全性质。
- **第六轮议题**：Session/Save/Timeline/Branch、长会话 Context、Generation Task 调度/恢复、取消/重新生成/自动存档、跨保存点的一致性；相关细节不在此域模块重写，以便权威归属清晰。

**证据声明**：以上全部是源码审计支持的设计目标；本轮只有 `docs` 文字/链接和 Git 提交验证，没有执行 Node/Browser/真实 Provider/设备测试。
