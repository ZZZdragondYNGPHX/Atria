# Native Orchestration V3 — 新对话续接

用户2026-10-16最新要求：“到合适的时机停下，我要新建对话了”。本次暂停于**第五十组**最小相关本地验证、源码提交推送及同Plan/Record更新处，不启动第五十一组。整体任务未完成。收到新对话恢复指令后沿同一分支继续，既有开发授权持续有效，不逐阶段重新询问。

## Git与读取入口

- Source：`tasks/atria-native-orchestration-v3/source`，分支`refactor/atria-native-orchestration-v3`，第五十组已测已推送origin：`41cb8760f`；恢复时重新核实际Git。
- Docs：独立`docs`工作树和`docs`分支。本HANDOFF与第四十九/五十组同Plan/Record一并提交，最终SHA以实际Git HEAD为准；不要把docs合进main。
- Main：`/home/henry/Projects/Atria`，本次未集成V3；恢复时核实际状态，不按旧SHA覆盖。
- P1/P2/P3/P4 IN_PROGRESS，P5–P8 NOT_STARTED，**P3/P4及最终Gate NOT_READY**。有限RP闭环不等于全部后端完成。
- 恢复顺序：实际`git status`/branch/remote，安全fetch/fast-forward本任务与docs → 本HANDOFF → [治理](README.md) → [Plan index](plans/refactor/atria-native-orchestration-v3/index.md) → [接口§17.57–60](plans/refactor/atria-native-orchestration-v3/interface-contracts.md)及下一项涉及的原§7/§14 → [阶段工作包](plans/refactor/atria-native-orchestration-v3/implementation-plan.md) → [验收](plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md) → [同一Record第四十七至五十组](records/refactor/atria-native-orchestration-v3.md)。按需读原代码，不重扫全部历史。
- 本Linux工作树本轮无此前Windows无关修改；其它工作树/分支状态须重新核验并保护，不reset/clean或覆盖用户内容。

## 当前实际完成边界

- 第四十一至四十三组：原child Result后接真实Graph task-local output/原银行闭包、durable parent return、可信ResultPort与父Context、实际第二次Narrator HTTP。Result仅作为有provenance的受限user建议数据，不成为system、Memory或事实。父原input/grant不被子结果覆盖。
- 第四十四至四十六组：原RpRunControl prepared→writing→committed WAL、原ChatRepo一次opaque正文+marker permit及FS durableWrite；原Host output Effect/原rp_output费用；正式Narrator Result与真实Graph output owner，chat.output归output节点。
- **第四十七组 `c7243168b`**：有限RP正式Chat输出→原Effect/费用闭包→严格OutputClaim/output receipt/output Attempt settlement→父Root completed。原Run冷读核完整proof与原Plan不可变graph合同；已提交domain但费用/receipt未知仍pending_output，不重发/重写。历史完整证明经合法编辑/删除仍可审计，不恢复live scope。
- **第四十八组 `d589db5f0`**：原Scheduler真实finalizer第三参数opaque scope，同原Turn permit一次交换。回调结束即失效；finalizing不授Model发送权。
- **第四十九组 `322bcae32`**：只读Narrator output quota verifier精确绑定原permit对象及同operation finalizer；同元数据的其它operation不能借用。输出凭据不能准入Model/local，原费用观察与晚到结算保留。
- **第五十组 `41cb8760f`**：原Narrator Context私有绑定quota；同实际finalizer对原Context一次交换output permit，专用revalidateNativeOutput复读Binding/Source/Information/Memory。普通revalidate仍只允许send/consume。**产品GenerationHost.finalize尚未调用新入口**；真实finalizer测试钩子验证了机制，不能称Session正式consumer已完成。

显式有限RP profile：agent generation.send、可选一次agent.delegate、output chat.output；OutputContract rp_narration/assistant/text有界maxBytes，无通用动态图/retry/fallback/continuity。child为generation-only的agent→output result，Audience仅精确parent，closed叶bank。无委派实际一次HTTP、有委派两次；无绑定profile旧领域行为保留待P6硬切，unsupported绑定拒绝。

Session目前仍为原Narrator/Resolver有限Model→原finalize；新正式Result/Effect/DomainReceipt/OutputClaim待接。Project只有原interactive单轮generation，toolCalls明确拒绝；多轮、原owned Source advance、Task tools、Review/Commit待补。后台有限JSON沿原Task adoption，正式输出待补。embedding/rerank无可信原producer，保持scope_unavailable。

## 下一组：Session正式消费者产品接线

1. 查看`native-turn-orchestration.js`、`context-port.js`、`native-turn-quota.js`、`native-turn-permit.js`、原`generation-host.js`和`SessionCore.finalizeTurn`。executeNarrator目前finally删除私有runs/modelScopes且仅返回generated；需在原执行callback结束前保留可信原Narrator完成与Context事实，以原prepared对象WeakMap绑定，不由JSON/body/metadata造scope。
2. 原NativeGenerationHost.executeTurn的Scheduler.run已捕获原Turn permit，prepareTurn沿原Narrator/knowledge proof产出prepared。实际finalize当前只调用SessionCore.finalizeTurn且忽略第三参数；在同实际finalizer消费第五十组Context专用入口，仍复验原Binding/source/information/memory，不放宽旧Model phase。成功/失败均清理live scope，不冷开恢复。
3. 正式output沿原S2 Effect/银行费用闭包与唯一SessionCore.finalizeTurn writer。复用其原invocationId/fingerprint/requestHash、expectedRevisionId、原task记录及authorityReceipt。原_publish产生assistant并推进Source，须用精确原领域耐久收据识别本操作自己的推进；不能放宽通用Source检查或写第二Session/World权威。
4. Session Result/Audience/OutputClaim需严格带领域tag的来源与consumer。当前Result sources及RP完成reader只支持有限RP；不要将所有rp_narration误路由到RP，也不要用宽松generic allow替代原DomainReceipt核验。
5. 然后继续Project多轮/原Task Tool/ReviewCommit、其它完整领域消费者及P5–P8。Project sourceBinding/budgetAuthorityRef不可变，proposal工具会改原Task fingerprint，必须显式原owned-source推进与receipt语义，不改冻结Root来绕过检查。

本次停在第五十组，不实施以上第五十一组。恢复后继续原授权范围，无需重新逐阶段索权。

## 最小本地验证与环境

- 用户AGENTS：**每阶段及任务完成时，只在本地执行最小相关验证。** 不补跑无关全仓、远端Actions或PR gate。
- 第四十九组新output quota5+原resolver quota6+finalization7共18/18 PASS（3.257s）。
- 第五十组新suite首轮8PASS/2FAIL（46.211s），失败仅测试误用SettingsRepo.load；改原get后相关Memory两Engine2PASS/8filterSKIP（10.980s）。十个不同case均有通过证据，修正后未整套再跑十项。原ContextPort13/13 PASS（2.870s），四文件targeted ESLint0输出、staged diff check通过。负例保留合法Memory/Binding/Source事实、原Model20tokens settled且不写新assistant。
- 第四十七/四十八组较早证据与精确分轮见同一Record；不要将各增量通过数字拼成最终全量重跑结果。
- 本机Linux CachyOS，Node v24.21.0。source/node_modules及tests/node_modules复用main本机依赖symlink；换机器重新核依赖，不复制跨平台symlink/Junction。
- 从source/tests执行：`ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --runTestsByPath native-orchestration/<相关文件>.test.js`。plain npx jest不适用；按实际变更选择最小相关case。
- source中定向ESLint使用本工作树原插件：`new ESLint({plugins:{atria:require('./eslint-rules/index.cjs')}})`，避免node_modules symlink解析到main旧插件造成allowlist误报。勿禁规则。
- 本机Docker命令不可用，本轮SQL NOT_RUN；不沿用旧Windows Docker服务/凭据。真实外部Provider费用/开放文本质量与Windows/CachyOS Host+Browser、Android Termux实机验收仍NOT_RUN，不据localhost合成Provider声称通过。
- 原task-runtime-p3四个既有FS/SQLite失败未在本轮修复，不称全仓绿。测试运行中不编辑源码；真实服务不可用记NOT_RUN/BLOCKED，不伪造实证。

## 保留约束及完整后续

- D1–D9/HCM-01–08、单Native Host；复用原Scheduler/RunControl/ProjectAgentService/RpRunControl/BudgetPort/Memory/Secret/Chat/World。禁止第二ledger/价格表/writer、旧模式兼容层/迁移/静默fallback，R3缺可信Approval必须拒绝。
- 原Engine ALS会合并嵌套事务：领域原写、银行release、最终Native CAS须保持实际物理边界。合法末await撤权事实先提交再拒输出；写后错误完整回滚Native组，ACK未知只观察同操作，不重复外部效果或恢复冷scope。
- P5可信Review Origin/原身份再认证/Projection-Control HTTP和UI；P6旧Single/Spec/Loop/Agenda/Director全入口零兼容硬切；P7真实四Engine/三平台/费用质量验收；P8仅真实最终Gate通过后main集成。目前没有Run/Projection/Approval产品HTTP，不让前端猜接口。
- 后端尚未全部交付，不发最终前端通知。先前并行任务标题“继续 E0 并审计 Atria 前端”，thread `01a13f16-23af-75e1-b8b3-e95b3b5d348d`，提示词分支`refactor/atria-native-prompt-preset-deepening`。全部后端完成后用户已授权交接口/证据/前端余项，由其整合ClaudeCode提示词；到时重新核实际thread与两分支冲突，不依据旧HEAD推断，不提前合main。

## 新对话启动提示

拉取远端Atria同一任务分支与docs，先git status保护修改，安全fast-forward，不reset/clean；读取docs/HANDOFF.md及其治理/Plan/Record入口，继续原生编排V3。源码第五十组41cb8760f已收口，有限RP闭环已完成，Session同finalizer输出Context复读机制已测，但产品GenerationHost.finalize还未接新消费者。下一组继续原活Narrator/prepared scope→原Context复读→原Effect/费用闭包→唯一SessionCore.finalizeTurn收据→严格Result/OutputClaim，再推进Project/Evolution与P5–P8。每阶段只做本地最小相关验证，不造第二权威，不因历史暂停重复索权，不将有限子能力当最终Gate通过，不提前合main。
