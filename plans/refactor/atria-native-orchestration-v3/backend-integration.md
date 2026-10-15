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

原`/api/native/generation/turn`与`/turn/start`已在有限Native Narrator profile消费真实Binding（接口§17.29–§17.30），沿原请求/排程/结果接口，不新增V3 Run启动协议。支持普通Narrator及原authorityRuntime显式typed transaction的真实candidate，均只执行精确Narrator Route的agent→output图；精确Binding不支持或过期即拒绝，不回退默认。resolver、Task/stages/interpreter和后台未接。安全native_orchestration_*错误保持脱敏，unavailable为503、冲突/过期为409，detached结果由原operation读取；不能将这一有限入口显示为任意Graph/Actor/Tool可运行。

**尚无产品 HTTP**：Run start/get/cancel/resume、GraphPatch、Effect dispatch、RunProjection/long-poll、Approval approve。不得为 UI 接入猜造这些路径。原 authoring 对generation.send仅支持原精确Narrator Route的有限机制证据（接口§17.26）；未接原 capability authority 的能力继续 unknown。可发布机制不是运行grant；publish 不能通过前端布尔值解除。设计原型可以使用明确的无副作用数据，但未接真实接口的产品功能必须显示其实际 unavailable 状态。

## 3. 当前内部 Host 组合

`src/native/orchestration/execution-service.js` 提供 `createOrchestrationExecutionService`，组合原 `SourcePort/BudgetPort/RunRepository/EffectController/DelegateController`。实际send的最终compiled/render绑定与原bank三字段复核见接口§17.25；它不授予运行权限。真实 GenerationHost 只接受 Host 内部可信 `execute` options 的 `orchestrationSend`；公共 input 同名字段拒绝。Browser 不持有 bank、dispatch token、授权或审批 proof，不承担 runner/恢复/发费 authority。

三域 Source 为 Native Session、Project Task、普通 RP 的原控制记录；bank、稳定 Effect+ordinal attempt、unknown observe/settle 均复用原服务。Delegate 先持久化子 Run 身份，再在原银行预约，观察并确认后才能执行；跨树逻辑计数及整树活动 Attempt 容量防止新子 Run 重置父上限。带 agent.delegate 的节点必须显式填写 allowedPlanPinIds（空集合禁止委派），指向本节点 port=plan 的精确原 PlanRevision pin；前端需按共享 validator 编辑，不得用请求参数绕过父允许集合，详见接口§17.20。Context 目前只有 Native Session 原 Audience compiler；Project/RP 缺原 adapter 时拒绝。Tool 只走原 Skill/MCP/A2A 与 CredentialTarget，MCP/Skill 的原实际完成证明可保存既有 EffectReceipt（接口§17.24），缺 proof/receipt 的结果保留 unknown；A2A 已可通过原持久回执确认精确 SendMessage 受理事实，不能宣称远端任务完成或消费正文。R3/需批准动作在可信通道接通前拒绝。

Effect 的 `authorize/verifySend/verifyObservation/verifyApproval`、Delegate 的 `authorizeDelegation`、Context 的 `authorizeContext` 是必需原领域接线，测试中的受控 callback 不是实际产品 grant。后续原消费者须证明精确 Plan/Node/Source/Scope/childPlanRef，再由这些内部入口使用；不能把它们暴露成 Browser 可填写的“允许”对象。

有限真实Narrator工厂已从原Plan/Binding/Source形成内部grant并交ModelPort，原Provider响应和原bank逐项核实后才将正文交回原Native finalize。原authority candidate/固定Narrator实际quota、同bank编译计费、原Turn active permit已接（接口§17.30）；四Engine Model/计费完整矩阵已有证据。Model/Skill正文消费新增原Run全部祖先锁及末Effect/Receipt复核，同ALS取消/unknown事实先保存再拒正文；成功503→200的两个原attempt分别保留unknown/settled，详见接口§17.31及同一Record第二十一组的实际矩阵。缺同实例Run/Effect权威的Skill在执行前拒绝。Effect响应confirmed不表示费用settled或V3 Run/World/Result已闭包；不能向UI推送未经最终复核的provisional模型正文。P4正式提交前OutputClaim/取消围栏继续由本任务实施。

## 4. 并入统一前端的范围

前端任务纳入 W08/P5 的 Plan Library、Graph Canvas+Inspector、同语义 Node/Edge List 与移动 Sheet、Draft/Validate/Publish 冲突处理；Run 默认 Timeline/Graph 切换、Source/Audience/成本/未知/错误和受控诊断；可信 Approval 展示与 Cancel/Status 可达；Shell Search/deep-link/history/Back 和移动键盘/IME/无障碍。

同一 Draft/definitionHash 与同一 Host Projection 是数据来源，布局不改变运行语义；移动不能以不能拖拽为由删减语义。Review 必须用独立可信 Origin、原身份再认证和一次精确授权，普通同源按钮、LLM、插件或 SDK 的 approved boolean 都无资格。相关后端尚未挂载的部分应先列真实依赖，不能由前端自行实作编排或审批。

P6 只在新消费者闭包准备齐备后清退旧 Single/Spec/Loop/Agenda/Director、旧 preset/setting/runner/Browser checkpoint/UI。没有旧模式兼容、别名、迁移、模板化或双轨发布；不能误删其他 Native 业务仍使用的 Memory/Secret/Message Takeover/Studio 等共享服务。

## 5. 当前尚未交付的后端与证据

| 项目 | 当前事实和下一归属 |
| --- | --- |
| 领域 grant 与正式 runtime API | P3/P4 尚需将实际 Plan/Source/Context/Effect/Delegate 权限组合及原消费者装配，之后才开放受控 API。第二十一组另真实复现末await后的原Source/Binding变更仍可返回正文，下一窄组优先补原领域围栏；Run树锁不代替它。内部工厂已存在不等于产品 endpoint 已存在。 |
| Session role/background quota | 固定Narrator已用合法authority Package真实candidate接原quota/compute同CAS（§17.30）；resolver与后台lifecycle outbox等producer尚未接，不接受caller role，不增加第二计数器。 |
| Scheduler/Handoff/Result/Disclosure | 原固定Turn的active operation/attempt/资源/signal已绑定；Model/Skill与原Run树控制写的消费顺序见§17.31，P4正式提交围栏仍待接。完整Delegate/Task permits、Handoff、子结果消费、跨Agent分享仍待接。 |
| RP/Game、Project/Evolution | P4 原唯一正文 slot、World/Command/Project Review/Commit 与 Eval/target 仍需正式 consumer；Run completed 不代表业务已提交。 |
| Tool/可信 Review | MCP/Skill已保存精确协议/本地read完成事实，冷读不成为新授权，正文消费仍独立复核；A2A 的 a2a_send_accepted 仅证明受理。真正 Review Origin/再认证仍缺，需批准动作 unavailable；不得删 guard“打通”。 |
| Restore/GC | 当前保留原费用与引用，危险覆盖/merge 提前拒绝；完整可信 restore review、source 闭包恢复和历史释放尚未开放。 |
| P6–P8 | 旧生产执行路径尚未清退，完整集成验收和 main 合并未完成。 |
| 平台与外部 | 四存储后端的隔离测试和本地 HTTP 合成 Provider/Tool 证明其明确不变量；Windows 完整 Browser 流程、CachyOS/Termux 实机、真正批准/收费/开放文本质量仍 NOT_RUN，缺目标环境者 BLOCKED。 |

这些是后续已授权实施/验收任务，不倒挂为 E0 重新索取开发授权的循环依赖。完整 P3 与最终产品 Gate 仍 NOT_READY；跨任务整合者必须保留这些事实，不能将本文件当作“后端全部完成，可以直接发布”的声明。

## 6. 两个任务的源码整合核对

提示词后端已交付`760327891`，V3本轮后端最新提交及docs版本见同一Record第二十一组。只读`git merge-tree --write-tree --name-only 4a62ba5cc origin/refactor/atria-native-prompt-preset-deepening`曾报告generation-host.js与execution-utils.js内容冲突；model-prompt-runtime/contracts.js、prompt-candidates.js双方也有改动。该预演未移动任何branch/main，后续Head新增改动必须重新核对，不能把旧预演当最终冲突清单或已合并证据。

实际组合必须同时保留原Prompt behavior/可信preview与V3稳定模型+local身份、budget ACK未知只观察、Source/Audience最后复核和安全错误码。使用原领域服务，不在前端补bank/grant/runner/审批authority。复测相关Prompt与V3实际发送/拒绝/重放套件后，再按原Gate处理集成；用户要求两个后端组合不等于允许未通过P7的main合并。V3尚未完成的后端继续归本任务，不以交前端实现为由转移。
