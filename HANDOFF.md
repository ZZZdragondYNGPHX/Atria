# Native Orchestration V3 — 换设备续接

用户于2026-10-16明确要求“完成本组后停下并推送，我打算换设备进行了”。本次暂停于**P3第四十组**源码、验证、提交推送完成处；整体任务未完成。此快照替代第三十三组旧快照。新设备收到恢复指令后沿同一任务分支继续，不把历史暂停当持续禁止开发，也不逐阶段重新索权。

## 当前Git与入口

- Source：`tasks/atria-native-orchestration-v3/source`，分支`refactor/atria-native-orchestration-v3`。
- 已测并推送origin：`b4c06075ad98b31e3a3f8f02a2c30c124c837e0b`（第四十组）。没有集成main。
- Docs：`docs`分支；此前HEAD `543892245`，本快照随第四十组同一Plan/Record独立提交推送。最终docs HEAD以实际Git为准，不将docs合进main。
- 当前：P1/P2/P3 IN_PROGRESS，**P3 Gate NOT_READY**；P4–P8未完成。第四十组是Result子能力收口，不是后端全部完成。
- 续接次序：实际`git status`/branch/remote → 本HANDOFF → [docs治理](README.md) → [Plan index](plans/refactor/atria-native-orchestration-v3/index.md) → [接口§17.50](plans/refactor/atria-native-orchestration-v3/interface-contracts.md#1750-真实rp-child-result发布与历史事实边界)及下一工作涉及的§7/§14/§17.44–49 → [阶段/工作包](plans/refactor/atria-native-orchestration-v3/implementation-plan.md) → [验收§9.1](plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md#91-p3后端子工作后的gate复核) → [同一Record第四十组末尾](records/refactor/atria-native-orchestration-v3.md)。不要全扫描历史或重做已过工作。
- source仅保留原无关`CLAUDE.md`删除。docs还存在原无关`CLAUDE.md`删除、前端design-proposal HTML修改、`.playwright-mcp/`、`design-proposal/_build/`及`plans/feat/agent-experience-evolution/`未跟踪内容；均未提交，保护不清理、不覆盖。换设备先核实际状态，不能将“干净”扩大到用户其它修改。

## 本次恢复后已完成

- 第三十四组：原DelegateController耐久Handoff/父waiting_child/单并发逻辑槽，原Scheduler资源移交组合。
- 第三十五组：有限agent.delegate发布闭包、逐父边limits/capabilities/exact pins、单次completed memo，不缓存授权。
- 第三十六组：显式Result字节policy与严格record/envelope，原四Engine精选存储与相关Delegate证据。
- 第三十七组：原Model wrapper私有完成证明、原Run祖先→Source控制边界，修同command锁逆序与末await Root取消过期证明。
- 第三十八组：原BudgetPort精确child子树闭包观察；released但overrun/unknown/后代未闭合不能closed。
- 第三十九组：真实RP独立child capture/受限user-only Context/原Model/原银行，修叶Route永久收紧根bank的问题；叶cap仍沿原reservation。
- **第四十组**：真实callback内原wrapper→ResultController，复用原Delegate decision和Model completion receipt规则；同Engine/Run CAS写有界text Result、publication receipt、producer settlement和原计数。合法末await父取消/Binding/Chat正文编辑删除/整chat删除/header迁移先提交再拒Result，费用保留；写后故障整体回滚，ACK未知只观察完整metadata。内部状态变为`pending_output`，只返回refs，没有正文消费grant、output、Run completed或durable parent return。

## 当前实证与环境

- 第四十组最终新suite FS/SQLite **30/30 PASS**（57.139s）。随后仅测试before-hook错误诊断增强，相关最小6PASS/24filterSKIP（10.829s）；不要误称增强后再完整跑30。
- 原Model精选12PASS/36filterSKIP（60.142s，docID guard前）；docID guard后原Delegate/producer/Context精选10PASS/97filterSKIP（12.720s）。精确先后/失败及增量范围在Record。
- Docker原容器`atria-storage-center-mysql`、`atria-storage-center-pg`已实际运行（127.0.0.1:53306 / 55432）。第四十组MySQL/Pg各精选8PASS，共16个不同case；两轮各52filterSKIP，非完整SQL矩阵。凭据仅从实际Docker Env进入当前进程内存，禁止打印、落repo或保存带密码URL；新设备重新核自己的实际服务/凭据，不默认可用。
- 七类语义mutants真实Killed，finally逐字/SHA恢复，恢复后6项通过；最终9文件targeted ESLint本工作树原插件0输出，staged diff check通过。源码已提交推送，没有未验证变异残留。
- 当前Windows Node v24.18.0，`source/node_modules`、`source/tests/node_modules`复用原本机依赖Junction。跨设备按实际依赖重建，不复制Windows Junction/Linux symlink或机器缓存。
- 在`source/tests`运行：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --runTestsByPath <相关路径>`；plain npx jest不工作。正常FS/SQLite设置`ATRIA_DISABLE_MYSQL_TESTS=1`与`ATRIA_DISABLE_POSTGRES_TESTS=1`；SQL需删除这两个key（字符串0仍truthy）。第四十组SQL显式`ATRIA_TEST_RESULT_PUBLICATION_SQL=1`，测试60秒不改产品timeout/预算。原harness名称是`MysqlEngine`和`PgEngine`。
- 定向lint须载本工作树原插件：`new ESLint({plugins:{atria:require('./eslint-rules/index.cjs')}})`，避免依赖Junction解析到main插件造成allowlist误报。不禁规则。
- normal/SQL串行安排明确；**任何普通或SQL测试仍运行时禁止改源码做mutant**。mutant独占、保留真实语义失败、finally逐字/SHA恢复，然后最小复验。不要重跑未受影响全仓或远端Actions。
- 本组只用localhost合成Provider，真实外部请求/费用/开放文本质量、Windows/CachyOS Host+Browser全流程和Android Termux实机验收仍NOT_RUN。原`task-runtime-p3`四个FS/SQLite既有失败未在本次修复，不声称全仓绿。guard-port Windows EACCES先复跑确认；真正服务不可用记BLOCKED/NOT_RUN。

## 下一工作：第四十一组起

1. **原Graph task-local output及原child预算闭包**。必须在当前真实child callback退出、capture失效前接实际调用点；不能从`pending_output`或cold observations恢复已丢opaque grant/正文proof，也不能重发Model。沿原TransitionController.advance真实agent→output边、原AttemptController.activate（银行仍held）→事务外原BudgetPort.releaseUnused→observeChildClosure确实closed→最终OutputClaim/closure receipt/output settlement/Root completed CAS。未知费用可保留Result和pending/running，不能硬释放或伪造completed。
2. 发送/Context原`inspectNativeRpDelegation`继续必须held，不得为output放宽成released。新增专用`inspectNativeRpDelegationOutput(capture,{host,handle,rpControl,tx})`，复用完整原scope/source/Plan/祖先/Audience核对但固定要求原closed。父NativeNarrator authority新增薄`authorizeTaskLocalOutput({handle,tx,capture,phase:'prepare'|'publish',identity,publication})`转原private RP authority；prepare检查held，publish检查closed，精确activeChildCapture与parentMap，返回原inputRefs/resultRef/inputDigest/childGrant/budgetRef，禁止默认allow或调用方自定义grant。
3. 仅metadata参考设计（**下一组实施/验证前不算已冻结实现**）：root.outputClaims严格own-run唯一`{runId,claimId}`；claimId `oclaim_+H({kind:'task_local_output_claim',runId,outputKey})前32位`作为现有output record token；outputKey绑定task-local run/source/output node/slot/完整parent consumer，排除变化的Attempt/result ID，绝非RP assistant正式slot。OutputClaim沿§7，operationRef.kind=task_local_output，domainReceiptRef=null。`child_budget_closed` receipt只记原authority/reservation/parent/ceiling/typed refs/snapshotDigest，无复制金额；`task_local_output` receipt关联claim integrity、Result publication、原traversal/edge/producer+output Attempt receipts与budget closure。Run控制新增output.publish、首次terminal提交必须验完整proof；历史reader只核旧proof相互一致且不领先root，不重新授消费grant。
4. 原Engine ALS会合并嵌套事务。prepare元数据、release原银行、publish最终CAS不得包在同一个ambient Engine事务；使用原Run ancestry/Source边界但物理退出Engine各阶段。所有live grant的末await应在任何metadata写之前，明确撤权deny先提交合法原写，写后错误必须rollback。原银行ACK未知只观察同reservation，不能重复发送或从冷scope造grant。恢复后的新epoch不得继承旧正文消费权限。
5. 然后补**durable parent return**：验证child真实terminal+budgetclosed、精确Result/Audience与原source/grant，再写单次耐久return，父Scheduler真实重新准入。父初始Attempt.inputRefs/inputDigest/effectiveGrantDigest不被Result覆盖；父private phase应delegating→waiting_child→resumed，原物理permit回来不等于resumed。
6. 再接**ResultPort/父Context/实际Narrator continuation**：可信实际parent callback签rpReturnCapture；`readForParent`不得仅收裸ResultRef或调用方grant。每send/consume重读原Result/receipts/current source/epoch/Audience/grant，Result作为有provenance的user data加入Context，真实bytes计费，不混system/tool/Memory。复用原父rpCapture/requestId/Route/native_rp_intent，不另造Model principal；新Effect输入绑定acceptedResultRef/returnReceiptRef/parentInputDigest，保持根bank envelope。

第四十一组曾由子代理只预备三个**新文件**的草稿，只有静态lint，所有normal/SQL/mutants均NOT_RUN。用户要求暂停后已确认仅其本人未跟踪文件并移出source至原设备TEMP，未集成未提交，**新设备不能依赖该本机备份存在**；按以上合同、原代码和Plan实施即可，不把草稿当已完成证据。

## 后续队列与限制

- P3 retrieval embedding/rerank仍缺原受信producer，保持scope_unavailable，禁Browser transport/静默fallback。同Session有限Narrator text与后台JSON profile仍无通用联合Binding，不能忽略已绑定Plan；其它Task/领域完整消费者继续待接。
- P4 RP正式Chat输出仍未实现§14 saga：原ChatRepo唯一writer，原RpRunControl.outputReceipts需prepared→writing→观察marker/写body→committed；未知writing只观察、不自动重写。正式RP outputKey来自controlId/原input source/message/floor/variant/content/purpose/slot，**排除runId/attemptId**，与task-local outputKey不同。保护原ChatRepo所有save/append/patch路径的Native marker，不能只保护新endpoint；FS Chat与Native journal不是一个原子事务。初版仅有明确授权的narration/assistant append，不擅自改旧assistant variant。原Session finalize/commit receipt和Project Review/Commit/Git receipt复用，不另写业务权威。
- P4还缺Project多轮/Task Tool/ReviewCommit、Session/Project OutputClaim/Result及NativeGame/Evolution正式消费者；P5可信Review Origin/原身份再认证/Projection/Control HTTP；P6旧Single/Spec/Loop/Agenda/Director全入口零兼容硬切；P7真实费用/质量/三端验收；P8仅真正最终Gate通过再main集成。目前无Run/Projection/Approval产品HTTP，不给前端猜路由。
- Model消费阶段其它合法RP撤权码是否也需精确deny，应另以真实末await用例检查，**当前NOT_RUN待核**；本组已证修复的是Result publication preflight，不把该修复扩大声称所有消费阶段均安全。
- D1–D9、HCM-01–08、单Native Host继续冻结；重用原RunControl/ProjectAgentService/RpRunControl/BudgetPort/Memory/Secret/Chat/World，禁止第二ledger/价格表/writer、旧模式兼容层、旧数据迁移和静默fallback。R3没有可信Approval必须拒绝。
- 每组实现→真实FS/SQLite→关键语义mutants→相关原suite→targeted lint/diff→source提交推送→同一Plan/中文Record docs提交推送，不逐阶段询问；当前按用户本次明确暂停要求停止，等待其恢复。
- 并行前端/提示词任务上次已核标题“继续 E0 并审计 Atria 前端”，thread `01a13f16-23af-75e1-b8b3-e95b3b5d348d`，提示词分支`refactor/atria-native-prompt-preset-deepening`。V3后端尚未整体交付，本组没有发最终通知。后端全部完成后用户已授权将接口/证据/前端余项发该任务，再由对方整合交ClaudeCode；发送前重核实际thread标题/HEAD和两branch冲突，不沿旧760327891或旧冲突预览假定当前状态，不提前merge main。

## New-chat bootstrap prompt

拉取远端Atria同一任务分支与docs（先git status保护用户修改，安全fast-forward，不reset/clean），读docs/HANDOFF.md、docs/README.md治理、Plan index、接口§17.50/下一工作相关§7/§14/§17.44–49、验收§9.1及Record第四十组末尾。source分支refactor/atria-native-orchestration-v3已测已推b4c06075ad98b31e3a3f8f02a2c30c124c837e0b。P3第四十组真实child Result发布已收口，最终FS/SQLite30PASS、SQL精选MySQL/Pg各8PASS、七类守卫mutants与恢复检查通过；精确版本/过滤/失败见Record。当前pending_output仅refs，bank held、child running、父waiting_child，无output/return/正文消费grant，P3 Gate NOT_READY。继续第四十一组原Graph task-local output+原bank闭包，接耐久parent return/受限ResultPort与父Context，再推进P4–P8已授权后端；尽量只改后端，不造第二权威/兼容层，不合main。旧task-local-output草稿未提交且只在原机TEMP，按Plan重新实施验证，不当完成。新设备核真实依赖和Docker，无实证标NOT_RUN/BLOCKED；本次暂停只为换设备，恢复后不重新逐阶段索权。全部后端完成后再按授权将接口与前端余项交并行任务，由其整合后给用户ClaudeCode提示词。
