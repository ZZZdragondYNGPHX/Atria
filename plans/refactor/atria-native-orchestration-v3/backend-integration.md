# V3 后端接口与跨任务整合入口

> 2026-10-16。本文件属于同一 Plan Bundle，用于用户已授权的提示词预设/前端并行任务整合。详细合同仍归 [interface-contracts](interface-contracts.md)，阶段门槛仍归 [acceptance-matrix](acceptance-matrix.md)，精确源码提交/实测与失败只归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。本文不将 P3 子工作冒称完整 V3 后端完成。

## 当前后端续作（第七十一至七十九组）

`1101bd454` 已有显式 Host 元数据 recover、存储 generation 投影围栏，以及唯一顶层 RP/有限 Native Session 输出的原收据核对命令；详细入口和不恢复执行的边界见[接口 §17.83–§17.86](interface-contracts.md#1783-显式-run-host-元数据恢复入口)。Project 等其余核对与受权 resume 继续后端。

`d4a6f00a6` 收紧隔离 Review 引导：只有仍有效的原 Approval 可获得会话；同一引导重开替换旧 cookie/CSRF；再认证 context ID 满足原审批 token 合同。真实 Provider 的有限 RP source_probe 三条开发案例已通过，Project 因模型调用未声明工具由原权限围栏拒绝；这不是独立质量或正式自动晋升证据，详见同一 Record 第七十三至七十四组。

`04197573b` 增加原生 Project M1 三条开发来源的真实 World/Knowledge/Task/冲突/修复/Review/Root 执行，见[接口 §17.81](interface-contracts.md#1781-原生-project-m1-开发来源执行)。通过原 source_probe 作工程观察，独立资料/质量、价格及自动晋升资格没有伪造或开放。

源码 `81a3a5fba` 本地提交，隔离 Review Origin 的 listener、原账户密码再认证、独立 cookie/CSRF/nonce、原 Approval 决定和 dispatch 再验已实现，见[接口 §17.80](interface-contracts.md#1780-隔离-review-origin-后端与原用户再认证)。主 origin 仅 `/approvals/launch`，隔离页面尚未实施，GET 当前只返回 bootstrap JSON；没有提前开发前端。原领域 `describeReview` 与安全能力缺失仍不可批准，现有只读 ToolPort ceiling 不扩大。完整领域消费者、Eval、恢复/释放和最终 Gate 继续后端，尚未交 Claude。

## 第六十九至七十组基础

源码 `a7cb649d0`，继续同一分支；失效的提前交接 HANDOFF 已删除，尚未进入前端交接。

- `e82fde3a8`：原 `EvolutionTargets` 已有受声明的 `plan-prompt`（所选 Preset 的 exact style module）与九项收紧 limits 的 `plan-strategy`。候选/发布/回滚均复用原 Prompt、Plan、Binding 和 Evolution journal；具体影响及同 Engine 事务边界见[接口 §17.78](interface-contracts.md#1778-原生-plan-prompt-候选与原存储发布)。
- `a7cb649d0`：`evaluationSettings` 钉 exact PlanRevision、原 Source selector 和实际选定 Route。固定隔离 worker 使用原 Native Host/Controller/Ports 重新创建私有试验 Source，运行有限普通 RP 的正式输出、取消晚到挑战，以及有限 Project 工具/Review Root；父 Host 仍是唯一真实收费发送和 Evolution ledger authority。见[接口 §17.79](interface-contracts.md#1779-有限原生-rpproject-隔离评测)。这修正此前“所有 nativePlan 一律 unavailable”，不代表所有图、来源或 M1 场景均已交付。
- Native target 的自动配置/晋升仍明确 unavailable，完整独立质量、可信 Review backend、其余 Actor/Task/Graph producer、通用恢复/受权结果读取及 release/GC 等继续实施。P1–P4/最终 Gate 未通过。Codex 完成后端后才向 Claude Code 提供前端与组装交接。

下方保留第六十四至六十八组的 HTTP 快照；这些 HTTP 本组没有新增或改为通用执行授权。其未交付清单中的 Prompt/评测状态以上述更新为准。

## 当前接口快照（第六十四至六十八组）

本节覆盖下文历史分组中的“尚无 Run API”“Project 单轮”“RP 无产品入口”等旧描述。源码 `08e523b6f` 已合入 `main@c57fada6e`，仍在 `refactor/atria-native-orchestration-v3`，没有反向集成 main。**前端已有可接入的真实接口；完整 P1–P4/最终 Gate 仍 NOT_READY**。未交付后端项仍归后端，不由 Claude Code 用 Browser 逻辑补齐。

用户当前分工：Codex 先完成全部后端；到真实前端阶段才推送并交 Claude Code 实施页面、组装前后端及结束开发分支。当前继续后端，尚未到交接点；接口存在不等于后端已完成。

### Authoring

下文 §2 的 Plan/Binding envelope 和路由保持。另有：

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

cursor 是 Host 内有界、约 5 分钟有效的 opaque token；观察 cursor 单次推进且固定 limit，重复/并发消费、改 limit、跨用户/Run/类型、重启或 epoch/visibility/storage generation 变化返回 409 `native_orchestration_projection_resync_required`。重新以 null 取 snapshot；旧 projection/页立即丢弃。关闭观察请求不取消 Run。resume/approve 仍 false；recover 与受限 RP reconcile 按接口 §17.83–§17.85 的实际能力显示。仍 pending 的核对请求可从 `reconciliationRequest` 取回同 commandId。Approval 的 reviewAvailable 只在同 Host 有效挑战存在时显示 true，最终批准仍由隔离 listener 与原领域复核。

costs 来自原银行同事务事实：knownTotalTokens 与 unknownAttempts/reservedUpperTokens 分开，localJobs/localUnknownJobs/localWallMs 独立，不虚构货币费用或“已退款”。`settled/pending/unavailable/not_started` 不等于正式领域输出成功；以实际 Run/领域收据为准。

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

### Evolution 与真实剩余项

原 Evolution API 的 catalog/declare/capture/prepare/check/write/rollback/discard 现接有限 `plan-strategy`：target 精确绑定 bindingId/version、PlanRevision、nodeId、`limits.<field>`。只收紧 maxSteps/maxAttempts/maxReplans/maxReviews/maxDelegates/maxHandoffs/maxEdgeVisits/maxLoopIterations/deadlineMs。候选由原 PlanRepository 发布新的不可变修订，保留作者 Draft，最后 CAS 原 Binding；回滚只接受自己的精确绑定/command，不能覆盖用户新选择或复活已消费候选。当前原生 Binding 不回退旧 workspace/Director evaluator 或原旧 target 自动晋升。

**仍未实现**：plan-prompt、其它 strategy 字段/来源、完整原生 Evaluation worker/自动晋升、其余 Actor/Task/Graph producer 组合、公开通用 resume/reconcile/Result read、可信 Review Origin 与再认证、完整 restore/release/GC、P6 清退和产品验收。原生 Plan 评测明确 unavailable，不能借旧报告、假资料、Browser runner 或 approved 布尔值打通。这些不是前端需要代写的后端工作；这些后端工作须由 Codex 完成后才进入前端交接。完整三端/真实外部收费与质量本轮未测。

## 1. 分支和职责

V3 后端使用 `refactor/atria-native-orchestration-v3`，任务工作区 `tasks/atria-native-orchestration-v3/source`；本 Plan 和 Record 使用长期 `docs` 分支。没有集成 main。提示词预设/前端任务应按自己的 Governance 在可审查的整合分支组合两个后端改动，不覆盖任一任务的未提交内容；P7 未通过不得以“合并两个任务”替代 main 集成门槛。

用户当前安排是：本分支先完成后端，之后提供交接提示词，由 Claude Code 开发前端并组装、结束开发分支。当前实际接口与未交付后端以顶部快照为准。D8 的领域交互由 [graph-editor-experience](graph-editor-experience.md) 持有；通用视觉/Shell/提示词编辑沿 Serene Canvas 与现有组件统合，不另建工作台或主题。

## 2. 实际已挂载的 HTTP

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

原`/api/native/generation/turn`与`/turn/start`已在有限Native profile消费真实Binding（接口§17.29–§17.30、§17.33），沿原请求/排程/结果接口，不新增V3 Run启动协议。普通Narrator及原authorityRuntime显式typed transaction继续精确Narrator→output图；含原generationBudget的free-text Authority增加精确resolver→Narrator→output三节点链，原角色quota/compute共用Turn bank。原selection复用只接受已有V3保留事实，缺失或无quota的free-text Package仍明确unavailable。精确Binding不支持或过期即拒绝，不回退默认；Task/stages/interpreter与其余后台profile未接，有限普通后台JSON图见§17.43。安全native_orchestration_*错误保持脱敏，unavailable为503、冲突/过期为409，detached结果由原operation读取；不能将这一有限入口显示为任意Graph/Actor/Tool可运行。

**尚无通用产品 HTTP**：Run start/resume/reconcile、GraphPatch、Effect dispatch、Result body read、Approval approve。Run list/observe/details/diagnostics/cancel 已实现，执行沿原领域入口，详见顶部快照。原 authoring 对generation.send支持原精确Narrator/intent_resolver/studio Route的有限机制证据；未接原 capability authority 的能力继续 unknown。可发布机制不是运行grant，publish 不能通过前端布尔值解除。未接真实接口的产品功能显示实际 unavailable，不猜造路径。

## 3. 当前内部 Host 组合

`src/native/orchestration/execution-service.js` 提供 `createOrchestrationExecutionService`，组合原 `SourcePort/BudgetPort/RunRepository/EffectController/DelegateController`。实际send的最终compiled/render绑定与原bank三字段复核见接口§17.25；它不授予运行权限。真实 GenerationHost 只接受 Host 内部可信 `execute` options 的 `orchestrationSend`；公共 input 同名字段拒绝。Browser 不持有 bank、dispatch token、授权或审批 proof，不承担 runner/恢复/发费 authority。

三域 Source 为 Native Session、Project Task、普通 RP 的原控制记录；bank、稳定 Effect+ordinal attempt、unknown observe/settle 均复用原服务。Delegate 先持久化子 Run 身份，再在原银行预约，观察并确认后才能执行；跨树逻辑计数及整树活动 Attempt 容量防止新子 Run 重置父上限。带 agent.delegate 的节点必须显式填写 allowedPlanPinIds（空集合禁止委派），指向本节点 port=plan 的精确原 PlanRevision pin；前端需按共享 validator 编辑，不得用请求参数绕过父允许集合，详见接口§17.20。Context 复用原 Native Session Audience compiler及有限Project单轮请求组装（§17.35）；RP缺原adapter时拒绝。Tool 只走原 Skill/MCP/A2A 与 CredentialTarget，MCP/Skill 的原实际完成证明可保存既有 EffectReceipt（接口§17.24），缺 proof/receipt 的结果保留 unknown；A2A 已可通过原持久回执确认精确 SendMessage 受理事实，不能宣称远端任务完成或消费正文。R3/需批准动作在可信通道接通前拒绝。

Effect 的 `authorize/verifySend/verifyObservation/verifyApproval`、Delegate 的 `authorizeDelegation`、Context 的 `authorizeContext` 是必需原领域接线，测试中的受控 callback 不是实际产品 grant。后续原消费者须证明精确 Plan/Node/Source/Scope/childPlanRef，再由这些内部入口使用；不能把它们暴露成 Browser 可填写的“允许”对象。

有限真实Narrator工厂已从原Plan/Binding/Source形成内部grant并交ModelPort，原Provider响应和原bank逐项核实后才将正文交回原Native finalize。原authority candidate/固定Narrator实际quota、同bank编译计费、原Turn active permit已接（接口§17.30）；四Engine Model/计费完整矩阵已有证据。Model/Skill正文消费新增原Run全部祖先锁及末Effect/Receipt复核，同ALS取消/unknown事实先保存再拒正文；成功503→200的两个原attempt分别保留unknown/settled，详见接口§17.31及同一Record第二十一组的实际矩阵。缺同实例Run/Effect权威的Skill在执行前拒绝。Effect响应confirmed不表示费用settled或V3 Run/World/Result已闭包；不能向UI推送未经最终复核的provisional模型正文。P4正式提交前OutputClaim/取消围栏继续由本任务实施。

第二十二组进一步以原Run→Runtime→Session→Engine锁序和末来源复核关闭已实测的Source/Binding正文漏口，且不持锁跨Provider HTTP（接口§17.32）。它仍只是Port消费决定，正式OutputClaim/Result与取消提交围栏属于P4；Project/RP正文adapter缺失时明确unavailable。

第二十三组复用同一ModelPort增加原intent_resolver固定producer与内部authority_intent Context；原catalog/Observation只在原bank准入后编译，两个既有request形态分别严格核工具和控制字段，私有tools不成为通用Tool grant。原Attempt settlement→Transition计边连接Narrator；selection reuse是原事实引用，无模型收据/费用。具体支持边界及本地实际证据归接口§17.33和同一Record，不提升Run终态或P3 Gate。

第二十四组补原Project Task→同实例Studio队列的消费边界及预算tx纯读（接口§17.34），复用原Repository与可提交状态权威，不新增业务writer。它是后续Project Model/Context生产组合的前置；当前尚不能将Project展示为可执行的完整V3 consumer，RP也不能借RPControl锁宣称ChatRepo已受保护。

第二十五组接原Project交互Executor/Scheduler的单轮Model/Context生产组合（接口§17.35），复用原Task bank、原提示词builder和ModelPort。仅精确studio agent→json output、maxModelRounds=1、无continuity/reuse/retry/fallback；Scope来自实际原operation和started generation，JSON/preflight复制无权运行。当前generation.send-only图遇模型工具调用明确拒绝，不执行Task提案/Skill。完整多轮、Task Tool、Review/Commit、正式OutputClaim/Result及API仍未完成。原runner的提示词组装抽为`public/shared/project-agent-prompt.js`并新增内部hook，是原Native后端共用runtime接线，无页面布局重做；并行前端任务整合这两个路径时应保留实际付费后构建与私有请求校验。

第二十六组完成原ChatRepo/GroupRepo、RPControl及已识别在线入口的共同聊天写围栏和事务纯读（接口§17.36），源码`6865d0a08`已推送。来源消费测试仍是明示受控只读callback；sync/restore管理旁路、RP Context/model scope及P4唯一输出仍待接，前端不得据此增加RP V3运行或正式提交入口。用户要求本组完成后暂停以换设备；详细恢复入口与剩余队列在同一Record最后“交接”段，后端未完成，不将本次暂停冒称最终前端交付。

第二十七组在同一分支以`5df345aee`关闭已审计RP管理入口的同步/恢复/存储管理/重置/删除/迁移写入空隙（接口§17.37）。`publishShadowToUserData`只在Host内组合原文件与SQL发布，不增加Browser runner或Run API。账户restore/recovery apply在仍保留V3历史时沿原错误码返回409，包括chat-only选择的全root回滚风险；界面不能据此自动清历史或重发。原RP Context/model scope已在第二十八组`2cf8c97d4`接入内部Host producer（接口§17.38），没有新增Browser API；正式正文输出和其余P3/P4队列仍未完成；当前已恢复开发，第二十六组暂停只留历史。

## 4. 并入统一前端的范围

前端任务纳入 W08/P5 的 Plan Library、Graph Canvas+Inspector、同语义 Node/Edge List 与移动 Sheet、Draft/Validate/Publish 冲突处理；Run 默认 Timeline/Graph 切换、Source/Audience/成本/未知/错误和受控诊断；可信 Approval 展示与 Cancel/Status 可达；Shell Search/deep-link/history/Back 和移动键盘/IME/无障碍。

同一 Draft/definitionHash 与同一 Host Projection 是数据来源，布局不改变运行语义；移动不能以不能拖拽为由删减语义。Review 必须用独立可信 Origin、原身份再认证和一次精确授权，普通同源按钮、LLM、插件或 SDK 的 approved boolean 都无资格。相关后端尚未挂载的部分应先列真实依赖，不能由前端自行实作编排或审批。

P6 只在新消费者闭包准备齐备后清退旧 Single/Spec/Loop/Agenda/Director、旧 preset/setting/runner/Browser checkpoint/UI。没有旧模式兼容、别名、迁移、模板化或双轨发布；不能误删其他 Native 业务仍使用的 Memory/Secret/Message Takeover/Studio 等共享服务。

## 5. 当前尚未交付的后端与证据

| 项目 | 当前事实和下一归属 |
| --- | --- |
| 领域 grant 与正式 runtime API | P3/P4 尚需完整 Plan/Source/Context/Effect/Delegate 权限及原消费者。原Session围栏见§17.32；原Project围栏/预算tx读见§17.34，有限单轮交互Model/Context见§17.35；Project多轮/Task Tool与RP adapter仍待接。内部工厂已存在不等于Run/Projection endpoint已存在。 |
| Session role/background quota | 固定Narrator及含原generationBudget的free-text authority resolver已接原quota/compute同CAS（§17.30、§17.33）；后台lifecycle outbox等producer、无quota/缺V3保留事实的free-text来源仍待接，不接受caller role，不增加第二计数器。 |
| Scheduler/Handoff/Result/Disclosure | 原固定Turn的active operation/attempt/资源/signal已绑定；Model/Skill与原Run树控制写的消费顺序见§17.31，P4正式提交围栏仍待接。完整Delegate/Task permits、Handoff、子结果消费、跨Agent分享仍待接。 |
| RP/Game、Project/Evolution | P4 原唯一正文 slot、World/Command/Project Review/Commit 与 Eval/target 仍需正式 consumer；Run completed 不代表业务已提交。 |
| Tool/可信 Review | MCP/Skill已保存精确协议/本地read完成事实，冷读不成为新授权，正文消费仍独立复核；A2A 的 a2a_send_accepted 仅证明受理。真正 Review Origin/再认证仍缺，需批准动作 unavailable；不得删 guard“打通”。 |
| Restore/GC | 当前保留原费用与引用，危险覆盖/merge 提前拒绝；完整可信 restore review、source 闭包恢复和历史释放尚未开放。 |
| P6–P8 | 旧生产执行路径尚未清退，完整集成验收和 main 合并未完成。 |
| 平台与外部 | 四存储后端的隔离测试和本地 HTTP 合成 Provider/Tool 证明其明确不变量；Windows 完整 Browser 流程、CachyOS/Termux 实机、真正批准/收费/开放文本质量仍 NOT_RUN，缺目标环境者 BLOCKED。 |

这些是后续已授权实施/验收任务，不倒挂为 E0 重新索取开发授权的循环依赖。完整 P3 与最终产品 Gate 仍 NOT_READY；跨任务整合者必须保留这些事实，不能将本文件当作“后端全部完成，可以直接发布”的声明。

## 6. 两个任务的源码整合核对

提示词后端已交付`760327891`，V3本轮后端最新提交及docs版本见同一Record第三十三组。只读`git merge-tree --write-tree --name-only 4a62ba5cc origin/refactor/atria-native-prompt-preset-deepening`曾报告generation-host.js与execution-utils.js内容冲突；model-prompt-runtime/contracts.js、prompt-candidates.js双方也有改动。该预演未移动任何branch/main，后续Head新增改动必须重新核对，不能把旧预演当最终冲突清单或已合并证据。

实际组合必须同时保留原Prompt behavior/可信preview与V3稳定模型+local身份、budget ACK未知只观察、Source/Audience最后复核和安全错误码。使用原领域服务，不在前端补bank/grant/runner/审批authority。复测相关Prompt与V3实际发送/拒绝/重放套件后，再按原Gate处理集成；用户要求两个后端组合不等于允许未通过P7的main合并。V3尚未完成的后端继续归本任务，不以交前端实现为由转移。

第二十九组`0414b623e`接原Session Information→唯一Hybrid→原Context编译与原bank工作（接口§17.39）；没有新增API。原Memory设置在send/consume前复核，撤销后拒响应并保留费用。精确embedding/rerank配置当前缺受信producer明确拒绝；RP Memory、后台与Delegate/Handoff、正式输出仍未交付，不据此编写新HTTP调用或宣称完整后端已完成。

第三十组`58ff31eeb`将原RP Memory sidecar与prefix接入内部startRp（接口§17.40），外部API列表不变。Memory设置或sidecar变动拒绝迟到响应，已发生费用保留；无合法历史source ID时明确原native_rp_source_unavailable。尚无正式聊天slot/marker/OutputClaim/Result，不能将内部generated结果直接append成正文。

第三十一组`9ba42699b`/`4f96c7637`提供原Scheduler资源handoff原语（接口§17.41），没有HTTP/正式producer/授权更新。只有原领域完成Delegate及child reservation后才可调用，不能用此低层方法替代原grant或child Result/Audience。

第三十二组`cde07ac66`补原Memory same-transaction消费拒绝（接口§17.42），没有新API。客户端不能将合法撤销写入后响应拒绝误作退款或自动重发授权；正文/正式Run闭包仍未开放。

第三十三组将原pending outbox普通后台Task接入有限JSON图的内部producer（接口§17.43），沿原executeLifecycle/executeTask、原Task adoption与queued事件；没有新增HTTP。原counter/window/period共享原bank，未到期/额度已满保持pending，到期后可继续，生成后adoption失败则unknown而不自动重发。同Session有限Narrator text图和后台JSON图尚不支持通用组合，正式Delegate/Result/OutputClaim仍待接。本组后按用户要求暂停换设备，不向前端任务发送最终后端交付通知；实际HEAD/验证归同一Record，下一设备按HANDOFF恢复。

第三十四组按当前用户指令恢复并实现内部耐久Handoff起始（接口§17.44），没有新增HTTP/UI或实际child Result。Scheduler完成只返回调度permit，不给前端child正式完成/父已恢复语义；正式领域producer/Result/Audience/return未开放。最新源码与验证归同一Record第三十四组，继续后端而不发送最终交付通知。

第三十五组原Plan validate/publish可验证有限agent.delegate精确允许闭包（接口§17.45），仍不表示任何绑定领域已支持运行该profile。无新HTTP；前端不得根据发布成功推断child可执行或生成自身grant。完整后端未交付。

第三十六组显式Result policy/物理record/envelope见接口§17.46，只有validators与受控存储fixture；没有Result产品路由或writer。不能从Model返回/冷Effect摘要自行组装正文Result；实际原completion proof及领域currentness/父Audience仍待接。SQL精选补证不改变这一边界。

第三十七组原Model实际wrapper可在有效scope内取得私有完成事实，原Run→Source支持合法元数据控制（接口§17.47）；复制或冷收据不恢复正文证明。无新增HTTP/前端API、正式Result writer或durable return，不能由客户端拼Result、把proof当批准或把Model confirmed当Run completed。正式领域producer/Audience与后续消费者仍在实施，尚未发送最终后端交付通知。

第三十八组增加内部原银行child闭包只读观察（接口§17.48），无新客户端路由。held/unknown或released但overrun都不能投影为成功完成；closed费用事实也不授予正文读取/输出或控制权返回。正式Result/Output/return仍待后端完成后统一交付。

第三十九组内部startRp可执行有限真实child Model/Context，返回pending_result及原父/子/effect/receipt refs（接口§17.49），没有正文Result或新HTTP。前端不能把Scheduler completed、pending refs或已结清费用当Run completed/父已返回；原父Attempt仍waiting_child。正式Result/输出/可信消费与控制权归还继续实施，最终后端交付尚未发出。

第四十组b4c06075a内部startRp返回改为pending_output及parent/child/effect/Model receipt/Result/publication receipt refs（接口§17.50），不含正文，不新增HTTP。正文虽已受保护耐久保存，child仍running、原reservation仍held、父仍waiting_child；前端不可据此显示Run已完成或直接读正文。task-local output闭包、可信父Result/Audience消费/return及P4正式聊天slot saga未交付。用户要求本组推送后暂停换设备，未向并行前端任务发送最终后端交付；续接队列见唯一HANDOFF。

第四十一组接通有限RP child task-local output（接口§17.51）。内部startRp对原bank.closed=true且Graph/output proofs完整的child返回pending_return，增加outputClaimRef/outputReceiptRef；unknown/overrun继续pending_output，保留费用与Result。child completed不表示父已恢复或正式RP正文已写：父仍waiting_child，durable return、可信ResultPort/父Context与continuation尚未交付。没有新增HTTP/UI或前端可拼的grant；本任务后端未完成，不发送最终整合通知。

第四十二组原父permit重新取得后写耐久Handoff return（接口§17.52），内部成功状态变为pending_continuation，增加returnReceiptRef；父Attempt恢复running但原input/grant不改，父Root未完成。正文仍未展开，原Narrator continuation/父Context与正式Chat输出未交付；无新HTTP/UI，不允许前端用ResultRef/returnReceipt自行组正文或生成执行grant，后端最终通知仍未发送。

第四十三组内部startRp已可在durable return后消费精确child Result并执行原父Narrator第二次Model请求（接口§17.53）；顶层wrapper/runId/effectId属于父，delegation保留child returned metadata。仍无正式Chat提交或新HTTP/通用Result API；客户端不得自行append正文。继续P4输出与后续阶段，完整后端未交付。

第四十四组新增内部原RP输出方法与显式rp_narration text policy（接口§17.54），没有新增HTTP。startRp仅prepared metadata，客户端不得直接提交Chat或显示父Run完成。物理writer单独经真实opaque scope验证，Host Effect/OutputClaim接线继续，后端未最终交付。

第四十五组显式rp_narration + chat.output profile会通过原Host Effect和原银行提交正式assistant回复，返回output metadata（接口§17.55）；无需客户端append。committed是domain状态，Effect receipt缺失或父Root仍running不可展示全Run成功；没有新增HTTP，Graph output/Root终结仍在实施。

第四十六组正式RP Result仅授权同Run唯一output owner，原Graph traversal/Attempt先于Chat Effect（接口§17.56）。没有新增Result正文API/通用consumer grant；domain committed仍不等于Root completed，终结claim继续实施。

第四十七组显式有限RP profile在完整原费用/Result/Graph/Domain/Effect proof闭合时返回output.runStatus=completed与outputClaimRef/outputReceiptRef（接口§17.57）；output.status=committed仅为domain状态，pending_output可能已有Chat，客户端不得重写/重发。无新增HTTP，完整后端尚未交付。

第四十八组只有内部Scheduler finalization scope（接口§17.58），无HTTP/Browser API或新增Model权限。Native Session正式Result/输出claim还未交付；原已有finalize行为保持，下一步在同实际finalizer消费原Narrator与原Domain receipt。

第四十九组只有内部Narrator output quota verifier（接口§17.59），没有HTTP/前端权限更新。输出phase witness不授Model/local准入，也不等于完整Source/Disclosure或Session output提交；新正式Session consumer仍待后端接入。

第五十组提供内部ContextPort原Narrator输出finalization复读（接口§17.60），产品GenerationHost.finalize尚未消费；没有新HTTP/Browser权限或正式Session Result/claim交付。用户明确要求换对话，当前暂停并刷新HANDOFF；续接先完成Session原活scope/Effect/领域收据链，不能因测试钩子通过宣称完整后端已交付。

第五十一组产品GenerationHost.finalize已消费原Narrator prepared/Context专用复验（接口§17.61）。无新HTTP/Browser API；Model后撤权会阻止正式Session assistant，费用保留。正式Result/Effect/DomainReceipt/OutputClaim仍在实施，不将现有Session返回当V3 Run completed或最终后端交付。

第五十二组原Session Turn提交具有精确稳定commit receipt，产品finalizer验证原Task/Variant/authority receipt及同操作Source推进，ACK未知只观察（接口§17.62）。没有新客户端API；native_session领域收据不能与RP混用，领域committed仍不等于V3 Run completed。正式Session Result/Graph Effect/OutputClaim继续在后端实施。

第五十三组显式有限Session rp_narration profile在原finalizer内经过有来源Result→真实Graph output owner→原S2 Effect/银行→唯一Session writer→原DomainReceipt确认（接口§17.63）。没有新增客户端API。该domain输出与RP分派严格区分；Run最终OutputClaim/费用闭包仍在实施，不提前发最终后端交付。

第五十四组有限Session正式出口可经精确原费用/Domain/Result/Graph proof写OutputClaim并令Root completed（接口§17.64），Run历史reader按领域分派严格验证；尚无新HTTP/Browser RunProjection API。domain提交与Run终结仍分开：未知费用或Host receipt可有assistant但无claim，客户端不得据此重发。完整消费者/API与后续阶段继续实施，尚未发最终后端交付。

第五十六组有限Project profile可执行显式project.read和原descriptor pin交集内的只读工具，经过实际Model completion→独立Effect/原bank→唯一原Task writer/耐久receipt→Context/Source消费复验（接口§17.66）。无新HTTP/Browser权限；原返回Task仍不代表V3 Root completed。提案、Review、多轮与Project OutputClaim继续在同任务实现，后端尚未最终交付。

第五十八组显式project.propose仅开放精确pin的原set_plan，实际Task计划与receipt同CAS保存，并在同活operation内接受自己的Source推进（接口§17.68）。原Root Source/预算引用冻结，通用旧Source准入仍拒，尚未交付同Root多轮/其它提案/Review/正式出口。没有新增客户端权限或最终后端交付通知。

第六十一组原Project轮次完成由实际Model与工具返回值确定精确public transcript，再经唯一原Task writer及原Run project_round收据关联（接口§17.71）。原Domain完成与Host收据仍可因ACK未知分离，无Host proof不展示V3完成或重发；尚无通用多轮或Project Root最终出口/API交付。
