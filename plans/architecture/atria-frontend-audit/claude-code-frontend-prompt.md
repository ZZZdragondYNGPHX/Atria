# 交给 Claude Code 的前端实施提示词

> 这是用户请求的实施交接输入，不是新 Record、功能权威或最终审美 Plan。后端真实状态只归 [同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md) 和 [E0 §8](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md#8-2026-10-16-后端实施增量与真实剩余-gate)。下面整段可直接转交。

> **V3 中间范围同步（2026-10-16，更新至第二十四组）**：已纳入 V3 D8/W08；V3 source 当前 `6a5e46a21`、对应 docs `8b63b9827`，P3 Gate 仍 NOT_READY。原任务继续完成其后端，尚未给出最终完成交接；本文件不替代那次实际 SHA/API/Gate 更新，也不表示两后端已合并、全量前端已具备运行条件。

---

请接手 Atria **全产品前端实现**。我已授权正式开始；Codex 负责 Prompt/Behavior 后端，本任务由你负责前端。常规非破坏性工程操作自主推进，不逐阶段索要确认；保护并发分支与未提交内容。不要伪造未接通能力，也不要替我把未定提案写成已批准的最终产品合同。

## 先核对真实状态

1. 先看 Git status、fetch 后的 main/docs/V3 与任务语义分支 HEAD，保护所有无关改动。完整治理为 `docs:README.md`，先读适用 AGENTS。不要重置/清理其他人的工作树或未提交资料。
2. 后端实现分支为 `refactor/atria-native-prompt-preset-deepening`，基于 main@695acf3bc。**它不是 V3 分支，也尚未集成 main**。具体已提交 SHA/实测事实见唯一 `docs:records/refactor/atria-native-prompt-preset-deepening.md`。建立你自己的前端语义分支前先核对依赖；不要将整个活跃 V3 或 docs 分支 merge 到源码。
3. 先读 `docs:plans/refactor/atria-native-prompt-preset-deepening/index.md` → `preset-studio-experience.md`、`backend-implementation.md`、`e0-audit.md` §8。V3 的 Graph/Plan/Run/Approval 合同读原 V3 index 路由，不复制另一套运行时。
4. V3 追加必读：[后端整合入口](../../refactor/atria-native-orchestration-v3/backend-integration.md)、[D8 领域交互](../../refactor/atria-native-orchestration-v3/graph-editor-experience.md)、[实施状态](../../refactor/atria-native-orchestration-v3/acceptance-matrix.md) §9.1、[接口合同](../../refactor/atria-native-orchestration-v3/interface-contracts.md) §17.15–17.34 及原 V3 Record 第五至二十四组。最终前端交接前再次读取原任务的新 SHA/接口变化，不能把本次中间同步当全部后端完成。

## 设计输入与完整范围

三份外部参考位于 `docs:plans/architecture/atria-frontend-audit/design-proposal/`：

- `atria-visual-direction.html`：代表性视觉/交互样例，包括产品演示、手机、18 状态协议、设计系统。
- `atria-function-presentation.md`：189 个功能组各映射一次，完整页面树、功能表现、流程、跨端与未定提案。
- `atria-frontend-guidelines.md`：整体表现指导；当前 native ES modules/DOM/CSS，不预选新框架。

功能范围权威仍是源码审计与正式产品合同；HTML 没画的功能不能删。先读前端审计 `index.md`，按路由读四份分域清单、`interaction-flows.md`、`component-and-architecture-findings.md`、`cross-platform.md` 和 `evidence/function-matrix.tsv`。189 是业务功能/控件组数量，不能只做 189 个按钮或只做 Prompt 页。

覆盖 Library、Play、Studio 全 20 资源视图与 Project Agent、Agents/Memory/Goals/Experience/Eval、World/Knowledge、Prompt、Runtime/Model/Connection、Settings/Account、Skills/Plugins/Search/Regex、Visual Director/Media/Speech、共享会话、存读档/备份同步、Storage 与 Diagnostics。沿真实 route→mount/dynamic import→handler→client→service 检查，不依文件名猜能力。

三参考文件仍包含未冻结的 §8.4 提案。不要把新的通知/声音、独立 Secret 管理页等提案伪装成已有后端。**P-03 的“旧编排折叠过渡区”与用户零旧兼容要求冲突，不能采纳**。其它常规表现参考样例；实质新增能力、权限或数据语义保持原合同，另列差异，不偷加权威或冻结新的审美企划。

## 并入同一产品前端的 V3 D8 / W08 范围

189 个功能组是原源码盘点基线，**不是新 V3 功能的数量上限**。下列原正式合同作为同一 Agents/Library/Studio/Play/Shell 产品的补充范围；不另造 V3 主题、工作台 Shell 或重复视觉体系。V3 的领域交互语义保留，历史 Serene Canvas 美术用语不替代用户这次提供的三份参考或新增另一份审美权威。

| 工作面 | 必须覆盖的功能/交互 | 数据与当前依赖 |
| --- | --- | --- |
| Plan Library | 原生 Plan 列表/详情/版本，创建、单 Draft 保存、Validate、Publish、Draft/Published Diff、CAS/Host 重启/未知提交恢复 | 原 Plan Authoring HTTP 已挂载；精确 envelope/字段归 backend-integration，Publish 仍服从真实 capability/dependency validation，不能用 UI Boolean 放行 |
| Plan 选择 / Binding | Session、Project/Task、普通 RP 的已发布 exact Plan 选择、当前选择与版本冲突反馈，撤权/来源删除后刷新 | `bindings/get` 与 `bindings/save` 已挂载；只保存原选择 metadata，不授予 Actor/Model/Tool/Delegate 权限、不自动启动 Run |
| Graph + Inspector | Node/Edge/输入输出 Ports/Agent/Route/Source/Output/预算/审批字段、强类型连线与 Problems、增删复制、同一 Draft Undo/Redo、dirty/leave、版本冲突 | Canvas/List/Inspector 修改同一 PlanDraft；几何/缩放不改变执行顺序，作者图不能直接改活动 TaskGraph |
| 手机完整创作 | Node/Edge List + 精确 Sheet、列表/表单替代拖拽、全部 Validate/Publish/冲突恢复；Graph 可定位但不是唯一操作入口 | Windows/CachyOS/Termux 用同合同；软键盘、IME、Back、焦点/读屏等价，不能手机只读 |
| Run Timeline / Graph | 默认 Timeline、同 selection 的 Graph 切换，Attempt/GraphPatch/Join/Effect/Approval/Result，排队、等待、取消请求、partial、stale、reconciling、unknown | 只读原 Host RunProjection；Run/Projection 产品 API 当前未交付，不能由 Browser 拼持久运行或伪造 completed |
| Inspector / Diagnostics | Source/Audience/Actor、原引用/版本/Scope、Route、真实/估算/未知费用、失败根因、可见 Receipt、失效 Result 与合法下一动作 | Context 读权不等于展示权；不泄露私密 Cognition/Secret/Tool 内容/opaque reasoning；不将未知费用画成零或把 Run completed 当正式业务提交 |
| 可信 Review / Recovery | 待办入口、精确动作/参数与 Diff、外发目标/数据/费用/不可逆后果、状态/取消可达、回执后更新 | 主 app 仅呈现脱敏待办/launch ref；决定须独立可信 Review Origin、原身份再认证与一次精确授权。缺通道时真实 unavailable，不提供同源假批准 |
| Shell 与业务连接 | Search/deep link/history/Back、回到原 Draft/selection，连接 Studio Review/Commit、Runtime 修复和 Play 唯一正文入口 | 同一 Shell；页面关闭/切后台不等于取消 Host，Unknown/断线重取原快照、去重旧 epoch/delta，不自动重发 Effect |

**当前 API 边界**：已有 `POST /api/native/orchestration/plans/{list,get,revisions,validate,create,save,publish}` 及 `POST /api/native/orchestration/bindings/{get,save}`。read/mutation envelope、HostBootId/同值 header、commandId/CAS/unknown 的精确处理只引用原后端整合入口。当前没有 Run start/get/cancel/resume、GraphPatch/Effect dispatch、RunProjection/long-poll 或 Approval approve 产品 HTTP。不得猜路径、创建 browser dispatcher/grant/approval proof，或把演示连线写为实际运行。

Binding get 的 body 为 `{sourceSelector}`，save 为 `{sourceSelector,planRef,expectedVersion}`；get 用 read envelope，save 用 mutation envelope。首次 `expectedVersion:null`，后续使用原返回 version；只接受实际不可变已发布 PlanRevision，不能保存 Draft 引用。`sourceSelector` 的 `native_session/project/rp_chat` 精确结构、nullable `entryPointId/taskId` 语义只复用共享合同；空值不是通配执行许可。来源撤销后旧 command 重放也拒绝，保留选择草稿并刷新真实来源/CAS 状态；不能以改 commandId 绕过。保存成功只显示“Plan 选择已保存”，不显示“运行已启动”或“权限已授予”。详见原接口 §17.23。

**原 Turn 的有限生产接线（§17.29–17.30、§17.33）**：既有 `/api/native/generation/turn` 与 `/turn/start` 已消费真实 Binding；保持原请求合同，不新增 Browser authority/proof/role 字段。当前普通固定 Narrator、原 authorityRuntime 显式 typed transaction 的真实 candidate 仍限原精确 Route、agent→result 两节点；含原 generationBudget 的 free-text authority 另支持下述固定三节点链。Task/stages/interpreter、后台及其他 Graph 尚未接。精确 entryPoint Binding 优先，只有确实不存在才取同 Session 默认；过期/无效/不支持的精确 Binding 直接拒绝，UI 不能静默改用默认 Plan/Route。无 Binding 继续原 Native 服务，不创建 V3 Run，这不是旧编排兼容。ModelPort 在原 Host/私有 Provider lease、原 bank 与最终 send/receipt/consume 复核后返回正文；不提供 provisional 模型正文流，界面不能把等待期间空正文当失败或假造流式文本。`generation_response_validated` 只确认响应，不代表 Run/OutputClaim/Result/业务提交完成，缺 usage 仍费用 unknown。安全 `native_orchestration_*` 码按实际 409/503 呈现，不能展示原异常正文或自动重发。

第二十三组仅增加原 **intent_resolver→Narrator→output** 精确三节点链（两个 always/nonloop/maxVisits=1 边、两个原 model pin）；resolver 输出与 Narrator 必需输入为 JSON、Narrator 输出 text，resolver Route 还需原 `generation.tools` 机制证据。原 selector 只选择已暴露 transaction 的 schema 合法 input，不能在 UI 解释为任意 MCP/A2A Tool/World 写权限。两角色共用同一 Turn bank/原配额，Route 上限逐维收紧不相加；resolver 已发生费用不因后续 Narrator 被拒而退款。展示响应已确认、选择已完成、业务已提交、Run completed 为不同状态。`original_selection_reused` 仅引用原持久 selection，符合原 V3 保留事实的新 Run 可零额外 resolver 编译/HTTP/收费；不是模型缓存收据或通用免费承诺。无 generationBudget 的 free-text 来源为 scope_unavailable，缺原 V3 保留事实为 retention_unavailable，仍属原后端待适配，UI 保留真实原因而不伪造选择/许可。

第二十组已在合法 authority Package 接通固定 Narrator 的真实 quota/compute 同 CAS、同 bank 实际 Context 编译计费一次和原 Scheduler active operation/attempt/resources/signal 身份。candidate/receipt 仅为受权 Context，Source/bank/quota 仍锚定 committed base；界面不得把候选视图当已提交 World，正式状态仍由原 Native finalize 写入。已发生失败/取消工作保留实际费用，不退款或丢迟到结算。第二十一组已对 Model/Skill 复用原 Run 全祖先锁及末 Effect/Receipt 检查；控制写导致失效时 `native_orchestration_consumption_stale` 拒正文，同时保留真实取消/unknown、响应回执及费用事实，不能将正文未返回显示成已退款/远端回滚。真实 503→200 的两个原 attempt 可分别为 unknown/settled，成功响应不把之前 unknown 清零。缺同实例原 Run/Effect 权威的 Skill 在执行前拒绝；不由 UI 添加绕过入口。

**第二十二组已关闭的 Session/Binding 缺口与剩余范围**：第二十一组真实复现的末 await Source/Binding 正文漏口已用原 Run→Runtime→Session→Engine 锁序及最终领域复核修复；Model 最后 bank 后重核来源/绑定/Context/grant，Skill 最终授权后复核来源，真实控制写和费用保留。锁只覆盖消费决定，不跨 Provider HTTP，也不替代正式 finalize 的 HEAD CAS。失效拒正文时保留用户输入和原操作状态，刷新实际 Source/Binding/结果，不能自动重发、缓存旧正文或假报已退款。该围栏只覆盖原 Native Session；Project/RP 缺正文 adapter 仍 unavailable，不能外推为全域安全。P4 正式提交前 OutputClaim/取消/Result、后台 outbox、无 quota/缺保留事实的 free-text 来源等后端继续归原 V3，不转交 Browser 补计数、绕 schema 或假造取消成功。Run/Projection/Approval 产品 API 仍 unavailable；精确范围见原 §17.27–17.33。

**第二十四组 Project 前置边界（§17.34）**：原 Project Task 已有 Run祖先→Runtime→Task→同实例 Studio→fresh EngineTx 的消费围栏与预算事务纯读，真实 committing 复用原领域拒绝；它不是新 Model/Actor grant，也不说明 Project 完整 V3 正文已接。边界只适用于原 Host DI 共享的实际 Studio 实例，不能宣称任意同 Engine writer 都被围住。原 Project Executor→ModelPort、计费后 Context/工具组装与 active generation attempt/request/conversation 身份仍由原 V3 后端接线；前端保持原 Project 功能及 Review/Commit，不新增伪 V3 运行按钮或第二 writer。RP 仍缺原 ChatRepo 共同消费围栏，不因 Project 修复自动可用。

第十一、十二组新增合同对前端的要求（详细校验仍归原接口 §17.20–17.22）：

- **委派允许集合**：有 `agent.delegate` capability 的可执行 Node policy 必须显式编辑 `allowedPlanPinIds`；`[]` 表示禁止委派，缺字段直接 invalid，不兼容为 allow-any。选项仅来自本 Node 的 `dependencyPinIds` 且 `port:'plan'`；每个 pin 的 `resourceRef` 为 exact `{planId,planRevisionId,definitionHash}`，`integrity` 是完整原 PlanRevision hash，不能只填 definitionHash。使用原共享 validator/reader，Browser 不自造 hash/授权或以 callback allowed 扩大允许集合。
- **A2A 受理与完成分开**：内部 `ToolPort.observe(handle,operationRef,{runId,effectId})` 核对原持久 Effect、bank 和 acceptedReceipt 后，只能确认 `a2a_send_accepted`。显示“发送已受理”，不能显示“远端任务完成/正文可用”；其 `resultRefs=[]`、`domainReceiptRef=null`。历史受理事实在 Source 前进后仍可读，不恢复重发、取消或写 World/Memory 的权利；无持久证明仍 unknown。MCP/Skill 后续完成证明的有限范围见下面第十四组增量，不再统称全部 unknown。此内部能力没有新增产品 HTTP。
- **成本与恢复**：原 model/local 行保留精确 Effect/ordinal 来源；Source 前进后 unknown 与迟到实际费用仍归原身份。local work 同样使用稳定 ordinal，提交 ACK 未知只能 observe 同一身份；UI 不以新 command/attempt 自动重做、不把 unknown 当零、不自动退款或清历史。没有新 ledger/价格表或 Browser 可填写的费用 provenance；精确字段和释放限制只归原合同。

第十四至十六组增量的界面状态要求（原接口 §17.24–17.26）：

| 证据/状态 | 界面必须表达的范围 |
| --- | --- |
| `mcp_response_validated` / `skill_read_completed` / `skill_files_completed` | 原真实 completion proof 可经 Host 保存同一既有 EffectReceipt；仅确认精确协议响应或本地 read/files 完成。全部 `resultRefs=[]`、`domainReceiptRef=null`，不因此允许正文/Memory/World 消费；无 proof、未结算或未存 receipt 仍 unknown，不重发 |
| `mcp_remote_reported_error` | `isError:true` 为 failed，显示远端报告的错误；不能显示已回滚/无副作用。历史 receipt 冷读不能产生新权限；当前 intent 矛盾 unknown、Skill source/grant 撤销时拒正文，不能用缓存历史成功覆盖当前限制 |
| 最后实际发送的诊断 | 使用 Host 返回的最后成功 send snapshot；retry/fallback 后不能继续展示首次 render 为实际请求。逻辑 Effect inputHash 与实际 bank inputFingerprint 含义不同；最终 requestId/targetFingerprint/inputFingerprint 严格绑定由原 Host/银行验证，Browser 不自行拼 hash、回执或完整 body writer |
| 有限 `generation.send` 可发布机制 | 第十六组为原 agent 的 exact player narrator Route pin；第二十三组 §17.33 扩展到实际声明 role.intent_resolver 且有 generation.tools 证据的原 Route。原显式 computeBudget、无 fallback 等机制条件仍必需；其他角色/capability 按真实 unknown/invalid 表现。路径/资源变化后旧 validationDigest 不得继续发布。可发布、已发布、已选择、运行获准必须分开，不以 Publish 成功暗示 Source/Actor/Task/Tool/Delegate 已授权 |

原 V3 继续负责缺失领域 adapter、角色/后台 quota、完整 Scheduler/Handoff/Result/Disclosure、P4 正文/Project/Evolution、Tool 其余真实消费者闭包、可信 Review/restore/release 及 P6 硬切。前端负责统一呈现与真实接口接入，不能以永久禁用占位替代最终 P5/P7 的完整产品验收。

V3 任务报告对历史 `4a62ba5cc` 与 Prompt `760327891` 的 merge-tree 预演存在 `generation-host.js`、`execution-utils.js` 内容冲突，`contracts.js` / `prompt-candidates.js` 双方也有修改。该预演不是当前 `6a5e46a21` 的完整冲突清单。**尚未实际合并或解决**；整合须按实际 HEAD 重核，并同时保留 `orchestrationSend` 原银行/稳定 model 与 local 身份/ACK 未知只观察/最终实际请求绑定/Source/Context/Effect 与本任务 `programSelection`/Typed lowering/currentness/Draft/Browser projection/明确拒答语义，防止重复准入/计费。不得将冲突留给一边覆盖另一边的方式“修绿”。

## 必须保留的架构和原生功能

- 正式重构零 ST、旧 Workspace、旧 Single/Spec/Loop/Agenda/Agent Director 兼容：无旧 mode picker、迁移、双轨、shim、别名转换或失败回退旧 sender。V3 未接通时显示真实 BLOCKED，不能启用旧模式充数。
- 旧容器中的有效 Memory/Goals/Experience/Eval/Skills 要移到原生入口；Visual Director 是有效媒体功能，不能和旧 Agent Director 一起误删。World/Knowledge、原 Session/Project/Runtime/Storage 同样保留。
- Library 管 Prompt/Generation 资源及生命周期；Studio/Play 共享编辑组件但不创建第二 Preset Store。Library 预设不能全部搬进 Studio。
- 模型、凭证、费用、预算、世界写入、Source/Actor 权限、Review/Commit、PlanBinding CAS 都归原 Host/领域服务，Browser 仅编辑草稿、发受权命令并展示投影。
- 外部可信 JS 插件和 Work UI 沙箱是不同信任边界。Work text/component/hybrid/full 表现与宿主恢复通道（Exit/Stop/Save/Persona/Diagnostics/Reload）均保留。

## 已有后端可直接对接

以源码 `src/native/model-prompt-runtime/README.md` 的真实契约为准；不要复制后端编译器到浏览器。

| 能力 | 前端要做的事 |
| --- | --- |
| 原 Program/Module/Generation/Route、Library/Project/Package exact refs、CAS/Review | 共用资源详情与同一草稿；原件只读、Fork/Derive/保存/发布范围清楚；保持资源引用与生命周期 |
| Module `textMode: literal/template` | 完整原文编辑；literal 能保留任意花括号、CRLF/Unicode，template 仍有类型校验。结构化/原文面板不能悄悄改 body、换模式或删除未知字段 |
| Module `expression` | 展示 global/scene/narrator/actor 范围与 actorId；它是表达范围，不是角色知识、同意或权限。原文与有效 scope header 的差别可解释 |
| `POST /api/native/generation/preview/draft` | 提交 `{request,drafts:[{ref,expectedFingerprint,resource}],baselineDrafts?:[]}`；从原 `/resources` fingerprint 或空 drafts 的 baseline.baseFingerprint 取规范化基线。现有 exact Library/当前 Project 资源可只读预览；Package 先 Fork，不支持的新身份不得冒充成功 |
| Draft 三层 Diff | 显示 baseline/candidate 的 authored/effective/wire、原 source/route/compiler identity 与 JSON Pointer 差异；标明 unpublished/sent:false。Preview 不等于保存、发布、执行或计费；晚响应不能覆盖较新草稿 |
| 私密 Inspector | `native_generation_preview_disclosure_denied` 表示缺完整 player-display 证明；不能用客户端读取/裁剪私密原文绕过。Execute/异步 result 可能 `projection:"restricted"`，有正常 response/routing 与 snapshotSummary、没有 snapshot；生成成功仍成功，显示“诊断受限”，不能显示空的完整 wire或报生成失败 |
| `GET /api/native/generation/quality-profiles` | 按原 exact revision、dimensions、criticalDimensions、sourceRequirements、readiness 渲染。新 rp.narrative / project.agent / rp.creative_refusal 仍 `BLOCKED/source_unready`，不能画成已评测可发布 |
| `generation_provider_content_blocked` | 明确 Provider 协议拒绝，显示真实原因等级/已发生用量；不给自动跨 Provider 重发。普通自然语言拒答只能是怀疑/unknown，不冒充确定事实 |
| 受信 Node Program | Browser 不传 programSelection、Draft authority 或伪造 Grant。精确 Node binding 走原 V3 Plan/Host；没接通的 Node/Run/发布状态如实阻塞 |

Draft 冲突要保留用户文本并刷新 exact base/source；只处理实际异步请求中的取消、卸载和晚响应，加载/失败/空状态准确反馈，不为每种状态另建恢复机制。不要把缓存 fingerprint 当权限、Provider cache hit 或零费用证据。

## 当前不能假装完成的部分

E0 整体 NOT_CLOSED。V3 活跃分支已逐步取得原 Budget/Source/Audience Context 内部端口，但 production Plan/Node/Effect/Output/Projection/Evaluation 的完整组合及 `plan-prompt` 候选→独立评价→Review→PlanRevision→Binding CAS/journal/rollback 尚未全部交付。原质量源 `source_unready` 是真实材料缺口。

先核最新 HEAD 可能出现的新证据，然后按原端口接线；不从“类存在/测试注入/HTML 可点击”得出 ready。新前端可以实现编辑、可用的原生功能和准确 blocked/unknown 状态，但不得在 Browser 造运行/审批/候选发布器。旧清退需跟 V3 真实替代入口同切；不能为了删旧目录误删有效业务。

## 交互与三端功能

- 以功能矩阵逐项记录保留/整合/重组/确认废弃、真实消费者、状态/权限；不另建重复状态权威。所有菜单、Sheet、面板、弹窗、输入、快捷键、工具栏和恢复链都需可达。
- Windows、CachyOS Linux、Android Termux 功能等价。手机有完整编辑、Raw/Structured、三层 Preview/Diff、Review/Apply/Commit 与审批，不是只读版本；Graph 需列表/表单等价路径。
- IME 不误发，Stop 在软键盘上方可达；Back/Escape 一次只处理一层并归还焦点；触控、无障碍、键盘、reduced-motion、长文本、窗口化列表与滚动锚点依真实源码和参考。
- 分开 Editor Undo、恢复资源修订、Trash Restore、Save/Fork、停止生成和停止清理任务；停止不撤销已提交对象、不退还已发生费用。费用/数据共享/凭证/写入审批按真实原 authority，不能合成万能“允许”。

完成可用前端、同一任务 Record、提交/推送后停止，汇报真实完成/阻塞与未测项。不要发布最终视觉冻结结论，也不要因阶段通过就留下无说明的半成品。
