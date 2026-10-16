# Native Orchestration V3 — 换设备续接

用户于2026-10-16要求“完成本阶段后及时停下，我要换设备继续任务了”。已暂停在P3第三十三组实现、最小本地验证与源码推送完成处；整体任务未完成。新设备恢复后继续已授权剩余阶段，不恢复旧暂停指令。

## Task

- Task ID：`refactor/atria-native-orchestration-v3`；Primary Workspace：产品main；实现尚未集成main。
- 源码工作树：`tasks/atria-native-orchestration-v3/source`，分支`refactor/atria-native-orchestration-v3`。
- Source/Tested HEAD：`c7dce9660531e1fcd0d774c1fdaf0727f6ad63e3`，已推送origin；工作树干净。
- 文档工作树：`docs`，分支`docs`；上个证据HEAD为`c43571fbc4c193ffd19f21a57bf2974adf8f5fff`，本快照随第三十三组Record/接口独立提交。实际最终docs HEAD以Git为准。
- 当前：P3 IN_PROGRESS / Gate NOT_READY；P1/P2有局部实证，P4–P8未完成；没有main集成。
- Plan入口：[index](plans/refactor/atria-native-orchestration-v3/index.md)；先读[接口§17.43](plans/refactor/atria-native-orchestration-v3/interface-contracts.md#1743-原pending-outbox后台model-producer与窗口周期额度)、[实施阶段](plans/refactor/atria-native-orchestration-v3/implementation-plan.md)、[验收§9.1](plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md#91-p3后端子工作后的gate复核)。
- 永久证据：[同一Record第三十三组及末尾暂停记录](records/refactor/atria-native-orchestration-v3.md)。本快照替代第二十八组旧快照，不重复已过工作。

## Completed

- 第二十九/三十组：原Session/RP合法候选域→唯一Hybrid→原Context/实际工作费用，RP从原ChatRepo侧状态读取，不制造Session或Memory writer。
- 第三十一组：原Scheduler真实父子资源让出/重新准入、取消/迟到/子失败不重试父操作；尚无正式Delegate producer调用。
- 第三十二组：同事务Memory合法撤销先提交事实、再事务外拒已付费响应，原费用保留。
- 第三十三组：原pending outbox普通background Task有限JSON图→原Scheduler私有capture→原Run/Attempt/Effect/Context/ModelPort→原Task adoption；同Host/Engine/Source/operation/attempt/resources身份严格检查。
- Task Information view与唯一Hybrid的候选域隔离，复用原Task Context选择及Package Route合成纯helper；一次原context_build，真实outer/service请求及发送Context/config复验。HTTP期间scope/Binding变更或same-transaction Binding撤销拒响应，费用保留。
- 原turn compute与background invocation/window/period quota共用唯一RunControl CAS。新增原quota只读预检避免not_due/当前窗口或周期额度满时先创建稳定Run；到期/新周期后同pending可继续。Task adoption失败并Engine冷重开仍unknown，不重发。
- 原queued事件/证据捕获/Task writer保留；无新增HTTP/UI、费用银行或Memory/Secret/业务writer。

## Local validation

- 新后台FS/SQLite共16个不同case分次取得PASS，不是一次完整16绿：最后完整16轮14PASS/2FAIL（73.941s），两失败是test推进clock但未pump；补原pump后窗口/周期＋cold定向4PASS/12filterSKIP（48.331s）；最后共用queued路径整理后基础2PASS/14filterSKIP（11.573s）。原失败过程归Record。
- Context13＋Turn quota proof8＋resolver quota proof6：27/27 PASS（5.449s，0skip）。原G2 App/Workflow接纳定向4PASS/52filterSKIP（1.348s）。过滤项不计通过。
- 最终13文件定向ESLint与staged diff check通过。进程自然退出，暂停时无本任务残留server/Jest；无外部API/付费Provider或远端Actions。
- 本组SQL、新设备/Windows/Termux、真实外部费用/质量NOT_RUN。此前原task-runtime-p3四个FS/SQLite已知失败未修，不宣称全仓全绿。无需为换设备重跑已过完整套件。

## Pending and next target

1. P3：先读原DelegateController/execution-service、Scheduler.withResourceHandoff及原领域grant，补实际Plan授权adapter、耐久child reservation/移交/Result/Audience与取消恢复，再核P3 Gate。低层Scheduler原语已实现，不再重写一套scheduler。
2. 后台当前只支持真实普通pending、generationBudget、active scope、精确Route、agent→json output两节点、generation.send，retry/fallback=0、continuity=none/reuse=disabled。没有Binding保持原Native服务；有Binding但不支持明确拒绝。**同Session的有限Narrator text图与后台JSON图尚无通用联合Binding/profile**，其他Task/resultBinding和通用Graph调度未完成。补通用组合时不能悄悄忽略已绑定Plan。
3. 外部embedding/rerank仍缺原受信retrieval producer，明确scope_unavailable，不走Browser transport或静默fallback。无quota/缺V3保留事实的free-text来源也仍有限制。
4. P4：原Project多轮/Task Tool/正式Review/Commit、RP唯一正文slot/marker saga、Session/Project OutputClaim/Result与Evolution targets。原Task产物adoption或Model Effect confirmed不能冒充V3 Run completed；RP saga按接口§14，不假称FS聊天和Native journal单事务。
5. P5：可信Review Origin/原身份再认证、Projection/Control HTTP及统一U2；P6：旧五模式全入口零兼容硬切；P7：实际适用验收；P8：真Gate通过后才main集成。当前没有Run/Projection/Approval产品HTTP，不为前端猜路由。

## Key decisions and environment

- D1–D9/HCM冻结；单Native Host，不复制Memory/Secret/World/费用writer；旧Single/Spec/Loop/Agenda/Director无迁移/fallback/shim/模板化。原服务/数据保护继续保留。
- 每阶段及任务完成只做最小相关本地验证，已过且未受影响的检查不重跑；不恢复逐阶段审批、远端Actions或全仓测试。开发授权已存在。
- 本组环境CachyOS Linux、Node v24.21.0；本机依赖symlink复用主源码和其tests/node_modules，未改共享依赖。新设备重建自身依赖，不复制Linux symlink或旧Windows Junction。
- 在source/tests运行：`ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --runTestsByPath <相关路径>`；plain npx jest不可用。detectOpenHandles只在定位未退出时使用，不默认扩大已过检查。
- SQL只在新设备实际服务/凭据可用且改动需要时做必要项；无凭据写repo/输出。Windows/Termux真实证据缺失保持NOT_RUN/BLOCKED，不伪造，也不停止其余独立实现。
- 并行提示词预设/前端任务为“继续 E0 并审计 Atria 前端”，thread `01a13f16-23af-75e1-b8b3-e95b3b5d348d`，提示词后端`760327891`。V3尚未全交付，不发送最终后端整合通知；最终整合前重核两任务实际HEAD。保护其它活工作树和未提交内容，不把docs合进main。

## New-chat bootstrap prompt

读取docs/HANDOFF.md、docs/README.md治理、Plan index、接口§17.43、验收§9.1和同一Record第三十三组末尾，核实际Git后继续Atria原生编排V3。源码在tasks/atria-native-orchestration-v3/source，分支refactor/atria-native-orchestration-v3，已测已推c7dce9660531e1fcd0d774c1fdaf0727f6ad63e3。P3第三十三组原pending outbox有限后台Model/Task Context/原窗口周期额度已完成，16个不同本地case分次通过，原27＋4相关回归与定向lint通过；P3 Gate仍NOT_READY、未合main。下一项是正式Delegate/Handoff的原领域授权、原Scheduler资源交接与耐久child Result/Audience，再持续推进P4–P8可独立工作。保留有限Narrator text与后台JSON profile尚无通用联合Binding的缺口，不冒称全部后台/Graph完成。新设备使用实际环境依赖和真实Git，不重复旧快照工作或已过全套验证；本次暂停仅为换设备，恢复后不逐阶段索权。
