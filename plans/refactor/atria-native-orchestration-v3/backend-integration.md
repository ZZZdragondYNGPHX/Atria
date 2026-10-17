# V3 后端接口与跨任务整合入口

> 当前接口入口（2026-10-17）。详细合同归 [interface-contracts](interface-contracts.md)，阶段核销归 [acceptance-matrix](acceptance-matrix.md)，精确提交、失败和验证只归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。旧接口快照和过期缺口已有 Record 保存，本文只保留当前接入合同。

## 当前收敛入口

当前能力状态、真实缺口和阶段核销只见 [acceptance-matrix](acceptance-matrix.md)，停止条件只见 [实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)，精确源码/失败/分次验证归同一 Record。下文保留当前具体协议，不再把每组历史追加为当前无限待办；实现以当前源码及本表为准。

| 当前后端接口增补 | 合同与限制 |
| --- | --- |
| `/api/native/orchestration/tools/prepare` | mutation envelope；body `{planRef}`，commandId来自envelope。只执行已发布owned Tool action pin；零调用预检，禁止raw URL/args/approved/grant。 |
| `/tools/dispatch`（同namespace） | mutation envelope；body `{runId,effectId}`，当前Host/原grant/Source/银行/S2 claim。MCP/Skill完成依原receipt；A2A accepted不是远端完成。 |
| `/tools/observe`、`/tools/consume` | read envelope；body `{runId,effectId}`。observe仅事实；consume只读已完成Tool advisory Result，重新核当前owner/Source/Plan/Secret target/原bank并发新recipient grant，cold不重发。 |
| `/api/native/studio/projects/:projectId/agent/tasks/:taskId/commit/resume` | body `{runId,effectId}`；原path IDs必须匹配。仅未claim ready Effect可经原Source/预算重新准入同Effect，旧批准失效、隔离Origin重新批准；未知效果保持观察。 |
| Run Projection `controls.resume` | 仅实际部署resume callback的上述有限Project场景显示true，其他场景仍false；不提供泛用`/runs/start`、`/runs/resume`或任意Effect dispatcher。 |
| Delegate Context pin | 原`native_rp_message`精确message/variant/contentHash；父/子独立owned pin交集，接收方重新授权。默认brief-only，父Memory与private Context不可继承。 |
| RP / Session / Project Model失败策略 | 仅预声明owned候选、原Route policy与原能力/Source/预算准入。每send稳定ordinal、原银行保留失败/unknown；opaque cache/价格/continuation如实unknown/miss/reset。三域正式消费者已接，精确支持范围见[接口§18](interface-contracts.md#18-工程收敛后的端口合同)，不从发布成功推导任意组合执行支持。 |

首次后端交接源码为`01ef2053b`，状态READY_FOR_P5；精确验证与限制归同一Record和acceptance-matrix。最终产品Gate仍未通过。

## Authoring 与公共 envelope

当前 `/api/native/orchestration` 的 Plan authoring 与原领域 Binding 路由已挂载，源码为 `src/endpoints/native-orchestration.js`。全部为 POST，沿原登录、CSRF、账户启用和 Native Host owner 检查；响应 `Cache-Control: private, no-store`。

| 子路径 | body 的精确字段 | envelope |
| --- | --- | --- |
| `/plans/list` | `cursor, limit` | read |
| `/plans/get` | `planId` | read |
| `/plans/revisions` | `planId, cursor, limit` | read |
| `/plans/validate` | `planId, expectedDraftVersion, expectedDefinitionHash` | read；只验证，不发送 |
| `/plans/create` | `definition, dependencyPins, viewState` | mutation |
| `/plans/save` | `planId, expectedDraftVersion, expectedDefinitionHash, definition, dependencyPins, viewState` | mutation |
| `/plans/publish` | `planId, expectedDraftVersion, expectedDefinitionHash, validationDigest` | mutation |
| `/bindings/get` | `sourceSelector` | read |
| `/bindings/save` | `sourceSelector, planRef, expectedVersion` | mutation；原 source 存在/关联/owner + CAS |

read envelope 为 `{schemaVersion:1, body}`；mutation 为 `{schemaVersion:1, commandId, expectedHostBootId, body}`，并须发送同值 `X-Atria-Host-Boot-Id`。HostBootId 来自实际 read 响应，不能在 Browser 自创。成功响应为 `{schemaVersion:1, hostBootId, commandId?, outcome}`；结构定义使用原共享 contracts 和 PlanRepository，不在前端复制不同 validator/hash。

HostBootId 变化返回 409 `native_orchestration_host_changed`；CAS/命令冲突和 `storage_commit_unknown` 返回 409。未知提交不能靠生成新 commandId 自动重发。writer/read-only/authority unavailable 返回 503；其他错误按实际路由映射。界面要保留可编辑草稿、显示实际冲突/未知，重新读取再决定后续操作，不能把未知显示为失败后“安全重试成功”。

Binding 只保存用户选择，精确 sourceSelector 使用原共享合同的 native_session/project/rp_chat 三种结构；nullable entryPointId/taskId 具有原合同语义，不以空值扩大执行权限。save 的 expectedVersion 首次为 null，后续是当前 version；planRef 必须是实际原不可变已发布 revision。Source 删除或撤权后相同命令重放也先拒绝，不能用历史选择授权执行。详细定义见接口§17.23。

### Authoring

补充只读接口：

| `/api/native/orchestration` POST 后缀 | read body / 返回 |
| --- | --- |
| `/plans/revision` | `{planRef}`；返回精确已发布修订，含 definition/dependencyPins |
| `/dependencies/inspect` | `{pinId,port,resourceRef}`；只返回原 authority 算出的 `{pinId,port,resourceRef,integrity}`，不返回资源正文，不授运行权 |

`/plans/validate` 的响应头 `X-Atria-Validation-Digest` 可直接用于 `/plans/publish` 的 validationDigest。Draft 保存返回的 definitionHash 用作下一次 CAS 的 expectedDefinitionHash；前端不需复制 Node 的 hash 实现。依赖 inspect 只表示精确数据指纹，机制可用性仍由完整 Validate/Publish 判断。

### Run 观察与取消

全部复用原登录/CSRF/owner、原 Source inspection 和 `private, no-store`。没有通用 Run 启动/任意 Effect/GraphPatch/approve dispatcher。

| POST 后缀 | body |
| --- | --- |
| `/runs/list` | `{sourceSelector,cursor,limit}`；cursor 首次 null，limit 1–100；按精确原来源列 Run |
| `/runs/observe` | `{runId,cursor,limit}`；首次 null 返回 snapshot，后续 deltaBatch；未变化可等约 1 秒后返回空 changes |
| `/runs/details` | `{runId,collection,cursor,limit}`；collection 为 nodes/edges/attempts/effects/approvals/events；有界完整分页 |
| `/runs/diagnostics` | `{runId}`；只返回状态推导的脱敏 code/controls |
| `/runs/cancel` | mutation envelope；body `{runId,expectedEpoch,expectedStateVersion,expectedGraphRevision,reasonCode}`；沿原 Run CAS，未知费用/外部效果不退款、不假称撤销 |
| `/runs/recover` | mutation envelope；body `{runId,expectedEpoch,expectedStateVersion,expectedGraphRevision}`；仅重绑 Host 控制元数据、失效旧批准，返回 `resumed:false`；后续执行和未知结果核对仍须原领域 authority，详见接口 §17.83 |
| `/runs/reconcile` | 同 recover body；核对唯一正式顶层 RP 或有限 Native Session 输出的原 marker/DomainReceipt/银行事实；沿同耐久请求重放，返回 `resumed:false`，详见接口 §17.85–§17.86 |

projection envelope 为 `{schemaVersion,runId,projectionId,hostBootId,epoch,projectionVersion,visibilityDigest,seq,cursor,kind,payload}`。snapshot payload 含 Source selector、planRef、CAS versions、Graph 元数据、Attempt/Effect/Approval 状态、events、原银行 costs、diagnostics、controls 和 hasMore。没有 Result/Context/模型正文、Secret、审批 nonce、dispatch token 或原输入。Timeline 只投影封闭事件类型与 opaque eventId，不返回内部 eventSeq/reasonCode。

每个 collection 在 snapshot 内最多 limit 项，hasMore 为真时由 `/runs/details` 获取其余；分页绑定同一 Run stateVersion/epoch/visibility。deltaBatch payload 是 `{fromSeq,toSeq,baseProjectionVersion,changes:[{seq,snapshot}]}`，snapshot 同样带 hasMore，空批次不增加 seq。前端原子替换该有限窗口，并对仍需显示的 collection 重读同版本完整分页，不能拼不同版本的页。

cursor 是 Host 内有界、约 5 分钟有效的 opaque token；观察 cursor 单次推进且固定 limit，重复/并发消费、改 limit、跨用户/Run/类型、重启或 epoch/visibility/storage generation 变化返回 409 `native_orchestration_projection_resync_required`。重新以 null 取 snapshot；旧 projection/页立即丢弃。关闭观察请求不取消 Run。approve 不通过普通 Origin；resume 仅顶部有限 Project Commit callback 实际可用时显示。recover 与受限 reconcile 按接口 §17.83–§17.87 的实际能力显示。仍 pending 的核对请求可从 `reconciliationRequest` 取回同 commandId。Approval 的 reviewAvailable 只在同 Host 有效挑战存在时显示 true，最终批准仍由隔离 listener 与原领域复核。

costs 来自原银行同事务事实：knownTotalTokens 与 unknownAttempts/reservedUpperTokens 分开，providerWork 按 generation/embedding/rerank/other 分项；localJobs/localUnknownJobs/localWallMs 独立，不虚构货币费用或“已退款”。`settled/pending/unavailable/not_started` 不等于正式领域输出成功；以实际 Run/领域收据为准。

snapshot 另含 execution（Plan limits/原本地与子树计数）与 capacity（明确原银行或 child 额度、held/released、原 used/delegated/remaining），详见[接口 §17.94](interface-contracts.md#1794-run-限额与原银行容量观察)。诊断 deadline/容量不改 Root、不授新执行或退款；costs 仍只统计该 Run exact Effects。

### 普通 RP 与 Project

普通 RP 在 `/api/native/generation` 新增：

| POST 后缀 | 请求/行为 |
| --- | --- |
| `/rp/source` | `{locator:{charDir,name,isGroup,groupId},expectedHostBootId}` + 同值 `X-Atria-Host-Boot-Id`；通过原 RpRunControl.bind 取得/重读原 controlId；不调用模型，不转换旧模式或补历史消息 ID |
| `/rp/preflight` | `{controlId,floor,requestId,routeRef}`；只读当前最后一条真实 user 输入与精确 Binding/有限 Plan/原 Route；返回 budget/childBudget/outputContract/Source 和配置指纹，头 `X-Atria-Preflight-Fingerprint` 为实际审核指纹 |
| `/rp/start` | `{input:<同预检输入>,expectedPreflightFingerprint,expectedHostBootId}` + boot header；202 返回 `{operationId,hostBootId}`；只允许有正式 rp_narration/assistant 输出的有限图 |

boot 可从原 authoring read envelope 取得。locator 对普通 chat 使用真实 charDir/name、isGroup:false、groupId:null；group 使用 charDir:null、真实 groupId、isGroup:true。字段不能用显示名称猜 ID。旧消息缺原合法 source ID 时明确拒绝，不在 UI 伪造。

预检不收费。启动后沿原 Scheduler、ModelPort、费用、Chat 单正文+marker、Graph/OutputClaim/Run 闭包；HTTP 断连不主动取消。相同 requestId 的已知同预检操作只返回原 operationId，配置不同拒绝；冷启动未知不重发。沿原 `/operations/:id` 观察安全 observation；RP 不通过 `/operations/:id/result` 保留或暴露模型 wrapper，正式正文重读原 Chat。Run 列表再按 rp_chat sourceSelector 查其耐久状态。

Project 继续沿原 Studio Task generation/preflight/start/status/cancel 和原 Review/Commit API。显式 project_review/json output policy 现可把实际 prepare_review 的最后一轮、所有原费用、真实 Graph output Attempt、Result/OutputClaim 关联成 Root.completed；Task 保持原 human Review，绝不自动提交 Project。中间 result profile、blocked/conflict 或费用未知不能显示为这一成功出口。

## Native Host 与正式消费者

`createOrchestrationExecutionService` 组合原 SourcePort/BudgetPort/RunRepository/Effect/Delegate；不授予调用方任意运行权。GenerationHost 只接受 Host 内可信 options 的 orchestrationSend；公共输入同名字段拒绝。Browser 不持 bank、dispatch token、授权或审批 proof，不承担 runner、恢复、发费或业务 writer。

三域 Source 为原 Native Session、Project Task、RP RunControl/Chat。Context 复用原 Audience compiler/Information/Hybrid；跨 Agent 分享的是独立准入的 Source/Result refs，默认 brief-only，不复制父 Context/Memory。Delegate 使用原 child reservation、Scheduler permits、typed Result、task-local output 与 durable return；子权力是父子允许集交集，已费和跨树逻辑计数不会重置。

原 Session 的 Narrator/Resolver、后台声明式 Task、Actor appraisal 和 World Simulation 使用各自原来源、quota、采纳/Command/World writer。RP 使用原 Chat 单正文+marker；Project 使用原 Task Workspace/Review/Studio receipt。Effect confirmed、模型生成、领域 committed 与 Root completed 必须分开显示；费用未知或 Host receipt 缺失不能伪造 OutputClaim，也不能为了补元数据重放原 writer。当前有限图及恢复支持只按实际物理合同，不从 authoring 有效推导任意业务图可执行。

RP Fanout/Join使用原Scheduler和原Root银行，支持边界只按接口§18及实际Record核销：early-close不采纳late结果，正式Chat前等待实际worker终结，所有实际费用纳入闭包。partial是明确原Join/Result/Run身份，unknown仍pending_output；界面不能用有正文推导Root completed。

Session Resolver/Narrator最终Model明确拒绝时，原Attempt失败，所有费用闭合后Root.failed；unknown费用/提交保持reconciling，取消与人类Source编辑保留。失败不生成Session/World输出或Result，冷观察不重发。

原用户 Project Commit 已有 prepare/dispatch/observe/resume。固定 effect→output Plan 的 owned project pin 必须精确绑定当前 Task/Review/Workspace；Model 工具无 commit 权限。除 metadata rename 外，当前支持同 Project 已有 Actor 的 description/personality/scenario 和已有 assistant opening 的 content，可信 Review 展示精确 before/after。任何其它 Source 差异、权限、代码、模型、资源、外部/文件操作仍拒绝；不据 Review.highImpact=false 推导任意 project.save 安全。实际 API、fresh R2 批准、两项原 local fee、Git CAS 和冷 receipt 规则见接口 §17.138、§18 及同一 Record。

原 Evolution Plan strategy/Prompt target、候选发布/回滚与 Native auto evaluator 已接；不是旧 Workspace/Director evaluator 回退。原独立质量来源、价格、反馈与资格 Gate 保持，缺证据不得自动晋升。完整支持矩阵见接口 §18；原 worker 不支持的图在费用前拒绝，不由 Browser 补跑或自造报告。

## 可信批准与前端组装

POST `/api/native/orchestration/approvals/launch` 复用 mutation envelope，body `{runId,approvalId}`，仅允许原回环客户端。它启动同 Host 的隔离 Review Origin；详情、再认证和一次精确决定只在该 Origin 完成，批准绑定实际 Effect/Source/账户/配置/期限。普通同源按钮、LLM、插件或 SDK 的 approved boolean 无资格；不要把 launch URL、nonce 或批准数据放入公共 Projection。详细协议见接口 §15、§17.80、§17.138。

P5 由 Claude Code 完成 Plan Library、Graph+Inspector、同语义 Node/Edge List 与移动 Sheet、Draft/Validate/Publish 冲突处理；Run Timeline/Graph、Source/Audience/成本/未知/诊断、可信 Approval、Cancel/Status；Shell Search/deep-link/history/Back 与移动键盘/IME/无障碍。沿 Serene Canvas 和现有组件，不另建主题或 Browser 编排权威。布局不改变同一 Draft/definitionHash 和同一 Host Projection；移动端保留相同语义。

两次交接与条件只归 [实施方案 §2](implementation-plan.md#2-执行分工与两次交接)：Codex 后端完成 → Claude Code 前端及组装 → 回交 Codex 做 P6 清退和最终验证。P5前端与组装已完成并回交（源码`94d677c6d`）：前端只消费本页列出的接口；Review Origin `GET /review` 现按 Accept 返回不含数据的静态审阅文档，JSON bootstrap 不变。组装发现的后端缺口（RP 预发送失败后 Run 不结算、authoring 解析 package 范围路由资源、`commit/prepare` 所需 reviewHash 无读取接口等）记录于同一 Record，由 Codex 修复。P6等回交Codex后执行；main集成/推送/结束分支仍待后续指令。准确Gate只见acceptance-matrix，不把后端就绪等同最终产品完成。

## 同期源码整合

源码沿同一 `refactor/atria-native-orchestration-v3` 工作树；Plan/Record 在独立 docs 分支。提示词预设等同期任务的既往 merge-tree 结果仅是其当时字节证据，实际组装须按届时 HEAD 和未提交状态重新核对，保护所有本机修改。重点保留原 Prompt 行为/可信 preview、稳定模型与 local 身份、预算 ACK unknown 只观察、Source/Audience 最后复验和安全错误码。

没有旧 Single/Spec/Loop/Agenda/Director 兼容、别名、迁移、模板化或双轨发布；P6 清退等前端组装回交后执行，保护仍有业务用途的 Memory/Secret/Studio 等共享服务、真实数据、未知外部效果与费用历史。后端首次交接和最终产品 Gate 不混同，平台、真实 Browser、独立质量/价格等未取证项继续按原阶段保留 NOT_RUN/BLOCKED。


## 2026-10-18 P6 checkpoint 补充

源码 `b7c12fdc6`：Studio `GET /projects/:projectId/agent/tasks/:taskId` 在原Task快照上增加Host计算的`reviewHash`（无review时null），`commit/prepare`仍要求同一当前`expectedSequence/expectedReviewHash`；Browser无hash算法复制。原 `/api/native/generation/operations/:id` 在真实RP worker建立Root后即可返回`runId`，不授予执行权。Run投影区分pending approval与不可用通道，并对终态隐藏recover控制。

原冻结能力核销以 [acceptance-matrix](acceptance-matrix.md) 为准；RP有限Profile不能证明角色独立Audience或Game/Project通用条件协作已完成。旧Browser模式/capability/设置/Skill scope无执行或迁移路径。原领域writer、可信审批、unknown费用和持久收据继续原权威。用户要求的安全checkpoint恢复见唯一HANDOFF；最终产品Gate仍NOT_READY。
