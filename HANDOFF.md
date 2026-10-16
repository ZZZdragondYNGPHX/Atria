# Native Orchestration V3 — 新对话续接

用户于2026-10-16要求在合适时机暂停、另开对话。已停在P3第二十八组提交和本地验证完成处；本快照不代表任务完成。新对话恢复后继续已授权全阶段工作，不恢复旧暂停指令。

## Task

- Task ID：`refactor/atria-native-orchestration-v3`。
- Primary Workspace：产品main；实现留在同一任务工作树，尚未集成main。
- Source：`/home/henry/Projects/Atria-worktrees/tasks/atria-native-orchestration-v3/source`，分支`refactor/atria-native-orchestration-v3`。
- Source/Tested HEAD：`2cf8c97d44fbe2f98584e0981186378dbcbd679d`，已推送origin；工作树干净。
- Docs：`/home/henry/Projects/Atria-worktrees/docs`，分支`docs`；前一证据提交`aac6e54c6`已推送，本交接快照随后独立提交。实际最新HEAD以Git为准。
- 当前阶段：P1/P2/P3有局部证据，P3 IN_PROGRESS / Gate NOT_READY；P4–P8未完成。没有main集成。
- Plan：[index](plans/refactor/atria-native-orchestration-v3/index.md)，当前读[接口§17.38](plans/refactor/atria-native-orchestration-v3/interface-contracts.md#1738-原rp受信model-producer与prefix-context)、[Context/Hybrid](plans/refactor/atria-native-orchestration-v3/context-sharing.md)、[Compute](plans/refactor/atria-native-orchestration-v3/adaptive-compute.md)、[实施阶段](plans/refactor/atria-native-orchestration-v3/implementation-plan.md)、[验收分账§9.1](plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md#91-p3后端子工作后的gate复核)。
- 永久Record：[同一Record第二十八组及末尾暂停记录](records/refactor/atria-native-orchestration-v3.md)。

## Completed

- 第二十七组`5df345aee`：原RP聊天、同步、恢复、迁移、账户/存储管理写入口共用原Runtime→chat-domain围栏；保留V3历史的restore原拒绝，原账户reset/deletion及fixture Owner清理已修。
- 第二十八组`2cf8c97d4`：内部`NativeGenerationHost.startRp`→真实Scheduler callback私有capture→原Run/Attempt/Effect→原RP银行→原ContextPort/ModelPort/Provider。严格原最后用户输入、prefix、精确Binding/Route/config/请求身份；编辑/新增输入/Binding变更拒响应而保留实际费用；稳定命令不能二次发送。
- 仅Model producer，尚无正式聊天正文提交、OutputClaim/Result、Run完成闭包。没有新增RP公共HTTP路由；未提交HTTP草稿已移除，不应据此编写前端调用。
- 尚未开始下一组Memory源码修改；已读原Memory/Hybrid入口，下面记录发现即可，不必重新广泛扫描。

## Local validation

- 最终RP新producer：FS/SQLite **12/12 PASS，17.078s，0skip**，localhost合成HTTP provider，detectOpenHandles自然退出。
- 原Project Context完整：FS/SQLite **12/12 PASS，78.529s，0skip**，自然退出；执行较长并非死锁。后补定位Source publication两case也PASS（8.926s，10filter skip），与完整12重叠不累计。
- 第二十八组9文件定向ESLint、diff check通过。此前组合run被终止没有结果，不能算通过；初轮fixture Route normalization失败及修复见Record。
- 没有实际付费Provider、真实质量、Windows/Termux或本组SQL验证。旧task-runtime-p3四个已知FS/SQLite失败仍未修，不能宣称全仓全绿。
- 所有测试进程已退出；无本任务运行中的server/Jest。只做最小相关本地验证，不重复已过全套检查。

## Next target

1. 原Memory/eligibility/唯一Hybrid读链与原bank真实工作费用。入口：`src/native/memory-authority.js`（原Session facade已有只读_context/_read）、`public/scripts/agents/memory/eligibility.js`（原Information前置合法候选域）、`hybrid-retrieval.js`（唯一retrieveMemory）、`source-lifecycle.js`（readonly snapshot）、`hybrid-runtime.js`（现有组合）。`ContextPort.compile`当前Session分支仍有readMemoryEvidence/contextOptions.memoryEvidence，生产组合未接真实Hybrid；`native-turn-orchestration.js`约334行创建ContextPort。现有context_build原银行已覆盖实际编译工作，不得再建费用银行或冒充Browser CPU为Host成本。设置用原SettingsRepo。先候选域约束、后检索，异步及实际消费复验Source/Actor/时间/Branch/原设置；不能只过滤返回引用。
2. RP Memory须用原ChatRepo state读取（`getState/getStates`与Engine.getChatState），不能伪装Session。普通原RP source需合法`memory_os_source_id`；当前缺ID明确拒绝，P4再沿原writer/source生命周期补真实用户入口。
3. 原pending outbox后台role/window/period scope→Delegate/Handoff实际Scheduler资源移交、授权与child Result/Audience→P3 Gate核对。
4. P4：原Project多轮/Task Tool/正式Review/Commit、RP唯一正文slot/marker saga、Session/Project OutputClaim/Result、Evolution targets。RP saga精确设计见接口§14，不把FS聊天与Native journal假称单事务。
5. P5可信Review Origin/再认证、Projection/Control HTTP及U2；P6所有旧编排入口硬切；P7实际适用验收；P8只有真Gate通过才集成main。

## Key decisions and constraints

- D1–D9/HCM冻结；单Native Host，不复制Memory/Secret/世界/费用writer；旧Single/Spec/Loop/Agenda/Director零兼容硬切，无迁移/fallback/shim，不将旧模式变成模板。
- 用户明确只有当前Linux环境。Windows与Android Termux实机证据确实缺失，保留BLOCKED/NOT_RUN，不用Linux fixture代替，也不因此中断可独立完成的实现。
- 每阶段和任务完成时只做最小相关本地验证；无远端Actions/全仓验证条件，无逐阶段继续审批。
- 本环境Node v24.21.0。依赖symlink复用`/home/henry/Projects/Atria/node_modules`与其tests依赖，不改共享依赖。测试在source/tests运行：`ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --runTestsByPath <相关路径>`。SQL仅有对应真实环境时另做必要项，不泄露凭据。
- 用户指定并行任务“继续 E0 并审计 Atria 前端”统一提示词预设/前端：thread `01a13f16-23af-75e1-b8b3-e95b3b5d348d`，原提示词后端`760327891`。V3后端尚未全交付，不声称已完成或发最终整合提示。旧冲突预演只作历史，实际整合前重核最新HEAD。
- 不清理其它活跃工作树、不合docs入main。无未提交产品代码。恢复先核真实Git，保护用户/其它任务内容。

## New-chat bootstrap prompt

继续 Atria 原生编排 V3，先读取 `/home/henry/Projects/Atria-worktrees/docs/HANDOFF.md`、同分支 README.md 治理、Plan index/interface §17.38、同一Record末尾，再核实际Git。源码在 `/home/henry/Projects/Atria-worktrees/tasks/atria-native-orchestration-v3/source`，分支 `refactor/atria-native-orchestration-v3`，已测已推 `2cf8c97d4`。当前P3第二十八组完成原RP受信Model/prefix Context/原银行组合，正式输出与P3全Gate未完成；没有Memory新源码或悬挂测试。下一项是原Memory/eligibility/唯一Hybrid与实际原银行工作计费，然后后台scope、Delegate/Handoff，持续推进P4–P8所有可独立工作。仅当前Linux可用，Windows/Termux真验收保留缺证，不能伪通过或提前合main。每阶段只做最小相关本地验证，不在普通checkpoint停工；本次暂停仅为用户换新对话。不要重做第二十七/二十八组或重复已过完整验证，保留同一Record。
