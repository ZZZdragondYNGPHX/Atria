# V3 后端接口与跨任务整合入口

> 2026-10-16。本文件属于同一 Plan Bundle，用于用户已授权的提示词预设/前端并行任务整合。详细合同仍归 [interface-contracts](interface-contracts.md)，阶段门槛仍归 [acceptance-matrix](acceptance-matrix.md)，精确源码提交/实测与失败只归[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。本文不将 P3 子工作冒称完整 V3 后端完成。

## 1. 分支和职责

V3 后端使用 `refactor/atria-native-orchestration-v3`，任务工作区 `tasks/atria-native-orchestration-v3/source`；本 Plan 和 Record 使用长期 `docs` 分支。没有集成 main。提示词预设/前端任务应按自己的 Governance 在可审查的整合分支组合两个后端改动，不覆盖任一任务的未提交内容；P7 未通过不得以“合并两个任务”替代 main 集成门槛。

用户最新安排是：V3 后端工作与真实剩余项发给现有任务“继续 E0 并审计 Atria 前端”，把本方案的前端范围并入其统一前端设计，最终由该任务输出交给 Claude Code 的一个提示词。V3 后端本轮未实现新 UI。D8 的领域交互语义由 [graph-editor-experience](graph-editor-experience.md) 持有；通用视觉/Shell/提示词编辑按并行任务的现有设计与组件统合，避免另建一套工作台或主题。

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

**尚无产品 HTTP**：Run start/get/cancel/resume、GraphPatch、Effect dispatch、RunProjection/long-poll、Approval approve。不得为 UI 接入猜造这些路径。原 authoring 对generation.send支持原精确Narrator/intent_resolver/studio Route的有限机制证据（接口§17.26、§17.33、§17.35）；未接原 capability authority 的能力继续 unknown。可发布机制不是运行grant；publish 不能通过前端布尔值解除。设计原型可以使用明确的无副作用数据，但未接真实接口的产品功能必须显示其实际 unavailable 状态。

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
