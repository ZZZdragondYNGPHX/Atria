# 运行契约与状态权威

## Phase 1 定案与证据基线

2026-10-04完成源码契约核对；以下是后续实施设计，不是已实现能力。核对基线：任务分支 `d7be6f1abff4d9d756f2dfa24c5492104e72aa75`、package `48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e`、main `c8d2d0e0c11c283ade2fa3c730740a0dc480c746`。精确实施历史见唯一 Record。

路径标记 `Package:` 相对游戏根 `original-occult-western-fantasy-game/`，`Core:` 相对 main 根。下面的函数、字段和限制均从对应代码读取；设计中的新增契约名称尚未存在。继续复用 SessionCore、Lifecycle、authority transaction、Information、Simulation、Task 和 Native frontend，不另建游戏执行器、数据库或调度权威。

## 实际契约与所有权映射

| 领域 | 当前事实与直接代码证据 | 实施归属与结论 |
| --- | --- | --- |
| 构建入口 | Package: `tools/package.mjs` 默认依次运行 compileOpening/Network/Convergence/LongHorizon/History/Lifetimes/Renewal/Enterprise/Regional，再 compileInquiry；原 manifest/runtime JSON主要是 fixture输入，不能只改JSON就认为默认产品已变 | Package：新角色扮演编译入口接管默认路径；旧路径保留显式回归入口 |
| 问答 | Package: `tools/opening-compile.mjs:compileOpening` 六事务第六步授予Civil Verifier及Second Death家族委托；Core: `SessionCore.create` 仅接受既有创建参数，初始Timeline来自固定entryPoint | 已有Native app.command可以无模型写单domain，但没有多domain角色＋预写开篇＋宿主mode的统一受校验确认；Package编写组合素材，Core A补这一最小提交点，避免排列组合成大量entryPoints |
| 自由文字 | Core: `src/native/authority-turn.js:resolverRequest` 只允许一个已声明事务、严格inputSchema；`adapters/generation-host.js:prepareTurn` 有authorityRuntime时走此路径 | Package新增通用生活原语；不改为任意JSON效果。无需Core多动作引擎 |
| 旧resolver | `public/scripts/native/experience/llm/intent-resolver.js` 是另一条无authority事务路径，最多8命令及game_no_change；不是当前游戏执行路线 | 不套用八命令假设；Package声明一个受限表达/无法裁定事务供真实resolver选择 |
| 结果与随机 | Core: `authority-transaction.js:executeTransaction` 校验读授权、validator、Resolution、effects；随机identity绑定Session/branch/revision/playerMessage/transaction/ordinal，输入hash单独保存；`SessionCore.finalizeTurn` 用私有proof发布 | 复用。Package编写确定性及风险表；Core B补跨进程选择/调用续接，不开放模型状态patch |
| 叙述与提交 | `generation-host.js:prepareTurn` 先算私有candidate，再让Narrator读candidate和receipt；`SessionCore.finalizeTurn` 将状态、玩家输入（typed时）、叙述、回执一次发布；叙述空白/含outcomes拒绝 | “先裁定”目前是先准备，不是先持久提交；普通轮次保留该原子路径。Core A仅增加预写开篇的确定性路径 |
| 动态记录 | `experience/logic/bound-expressions.js:recordSelector/reads` 支持受类型约束的recordId表达式；`lifecycle-authority.js:prepareLifecycle` 可创建闭合schema记录；Package当前开局只用静态目标 | 基本容器已支持；Package控制身份、可达性、来源、版本和上限。不能把存在recordId表达式说成任意事实发布已安全 |
| 动态提案 | `SessionCore.recordTaskResult` 的simulation Task先写声明App Command，再在同次candidate上prepareWorldSimulation(admit:false)，最后发布；simulation读/写及Task resultBinding必须是同scope静态目标 | Package用私有收件箱＋静态槽位推广事务。复用校验和原子发布，不增加通用动态dispatch |
| 世界更新 | `simulation-authority.js:prepareWorldSimulation` 先确定性赶时，再挑hot/warm、排除cold；只允许1 deliberation且有pending simulation就不再准入；队列/cursor保存于Lifecycle | Package用有效轮数和重要度门控静态批次；Core B补实际发送次数持久限额，现有每次准入上限并不等于跨重试AI预算 |
| 历史轮数 | `history-authority.js:prepareHistory` 的transactions与meaningful turns不同；记忆标记等操作也可能计turn，Host发布用countTurn:false | 不直接当游玩计数；Package唯一play_progress记录只由推进事务更新 |
| 保存与回退 | `SessionCore.createSavePoint/restoreSavePoint/forkBranch/switchBranch/retryReply`；restore创建新branch，Retry回到用户边界；`NativeSaveSystem._collectClosure` 导出会追溯parent/branches/save roots | 普通复用；铁人需要Core C服务端限制全路径及专用head续玩闭包 |
| 删除 | `SessionRepo.delete` 清该session的SavePoint/Revision/State/Variant/Entry/Branch，受continuity/realm prepared transfer阻挡；FS为commit-last非rollback | Core C先持久tombstone，再可重试清理。仅调用delete而无墓碑会允许旧导入复活 |
| Native前端 | `frontend/bridge.js` 固定typed事务/Host目标；`public/shared/native-frontend-host.js` 已有composer/messages/generation/saves/restore；`frontend/runtime.js` 已有overlay dialog、inert、Tab限制、返回焦点 | Package重构AUI/CSS/controller；Core A/C只补开始与模式/终局状态能力。没有证据要求先改整个Native平台 |

## 开局正式提交：Core A

新增 opt-in 的确定性开始契约（拟名 `storyStart`），绑定当前安装的PackageVersion、闭合选择schema、固定bootstrap事务、预写开篇模板。问答与组合规则归 [player-experience.md](player-experience.md)。编辑、返回及摘要均为草稿；按确认才提交，不能逐题调用generation。

Core已有`frontend/host-bridge.js:write`的App Command → applyLifecycleCommand无模型路径，可用于一般声明应用状态；不能把此能力漏记为“所有Native写操作都调用AI”。它不提供本任务的多domain角色校验、开篇模板与宿主不可回退mode一起提交，Core A在该能力之上补一个受保护的开始动作，而非新建第二套执行器。

新Session可以处于未开始态；开始前禁止生成、世界演化及可续玩保存。拟新增固定Host开始动作及HTTP入口，输入只有声明的选择ID、姓名/个人修饰、普通或铁人、expectedRevisionId、invocationId。服务器从同一份编写素材派生背景、资源、关系和开篇，不信任客户端送来的总结、成功结果或initialStateOverlay。

复用prepareAuthorityTransaction/proof及发布CAS；开始在一个提交中建立角色、所在地点、初始关系/义务、未获力量的超凡接触、mode/run归属和预写assistant开篇。模板只能读取已确认公共字段。相同invocation＋相同输入返回同一开始回执；同key不同输入拒绝；失败不留下半角色；重复确认不另造锚点。Ready资源/模型binding预检可保留，预检不得发送模型请求。历史游戏无storyStart时沿用原流程。

实现顺序：先Core开始服务与限制，再Package消费声明；Phase 4接真实问答界面。Phase 1不建立辅助分支、不写这个接口。

## 自由输入、原语与最小纵向闭环

Package默认声明 `roleplay.express`、`talk`、`work`、`travel`、`rest`、`learn`、`practice`、`invoke`、`wait`、`close_episode` 等少量事务族；最终名称由编译时定，功能和边界由本设计定。参数均为闭合schema：目标稳定ID、方法enum、玩家表达、有限时长/目标；不接收 outcome、费用delta、能力规则、他人同意或隐藏真相作为玩家/模型可写字段。

公开观察只给当前可达目标、已知条件、关系、已掌握能力与合理方法。私有读授权可用 `args.targetId` 选择记录，但validator必须确认目标已公开、位置可达、角色可行动、资源与许可满足。空槽、旧身份、远方未知ID不能通过猜测调用；未知schema/越界先拒绝，正常能力不足用有意义的impossible/denied回执，不作为服务器崩溃。

`express` 接受个人言语/尝试与受限分类（expression/clarify/unsupported），只记玩家表达或需要澄清的尝试，不能默认推进关系、获得物品或替他人作决定。纯表达、不支持输入及澄清不增有效轮数。实际互动必须落到talk等声明原语；“我成为院长”“他同意了”不能发布任命或同意。非目录措辞可通过这些原语进入交流、谋生、旅行及实践，不恢复调查白名单。未来新方向扩展声明，不伪称已经支持任何行为。

同一输入只处理第一个可裁定行动，到重要反馈点停下；余下意图以公共回执说明尚未执行，保留输入供玩家继续，不自动排队重发。最多一个Resolution/一次轮数增加；没有批量工具循环或一次替玩家完成长生。建议仅经composer.set填草稿，submit由玩家决定。

最小闭环：两个非调查起点 → 一次交流或谋生 → 选择两个机构中的一个接触/训练 → 见证或实践成立的Seed → 同意Anchor/Price → 窄Claim运用及维护后果 → 一段经历收束，可继续生活或结束；另外有一条能进入、能拒绝/反噬/被追查的非法探索路线。普通寿命、无家族、无组织角色可完成；无需Second Death或长生。

## 因果、风险与恢复：Core B及Package

普通言语/工作/休息按已知条件确定性处理。风险事务用既有bounded_fortune，先处理资格不足和无抵抗，再处理不确定情况；三段Fortune和Secure/Favorable/Contested/Risky/Desperate五处境沿用fixture可复用表。准备、同意、锚点有效性及对方抵抗是具体条件，不做统一经验/战力分。自动/不可能结果的效果与耗时不依赖抽样值。

注意当前bounded_fortune即便前置case自动/不可能也会在内部取draw；本设计不要求改RNG契约，公开fortune-not-used含义是结果不依赖抽样，不声称内部从未取数。Receipt只给结果、实际耗时、可知代价和尚未执行部分；不暴露roll、seed、私有公式/动机。规则负责伤害、Price、追查证据和真实死亡；Narrator只解释回执。

Core B新增持久operation continuation，复用现有invocation/任务持久化与Session写锁，按owner/session/branch/anchor＋输入fingerprint固定选定transaction及合法参数；不是第二套世界状态。当前选择缓存是engine WeakMap、最多128条，跨进程不保证。持久续接不能改选择重掷；同key不同输入拒绝；已提交重试返回旧回执，不再生成、增轮或发布。

候选准备和叙述未全部成功时，不提交游戏推进；流式文字为provisional。未提交且已发送请求的操作保留attempt身份、选定输入和恢复状态；发生未知发送/提交时先查已存回执。进程丢失proof可从同一anchor/选择重算候选，不接受外部proof/patch。不能自动从旧HEAD重播，也不能把断线当死亡。失败重试指原操作续接；普通模式的已提交Reply Retry是明确回退到新分支，铁人由Core C拒绝。

## 动态内容的有界发布设计（Package）

第一批扩展使用8个预声明通用槽位 `dynamic_01`…`dynamic_08`，每槽带固定不可复用身份、kind(person/place/affair)、parent地点/来源ID、sourceBatchId（关联宿主Task invocation回执）、introducedTurn、revision、status、public/known，以及种类所需的有界标量。空槽不可交互。实体稳定ID不是展示名；重要角色/场所/事务不因离场、刷新或改名换ID。槽位一经发布不回收给另一个身份；达到容量保留现有内容、延期引入或复用已经成立的对象，不悄悄删除重要事实。首版有意限制同时可引入总量，扩大容量/精确归档需后续风险证明。

世界创作Task只能返回一个候选（或defer）：kind、公共名/描述、已有parentID、关系/事务模板ID；不得返回法则、授职、现成Claim、隐藏因果、任意时钟或状态效果。Task结果写私有 `world_proposal.main`，其中待选槽位及锚定信息由已排队输入决定；不向Narrator/frontend绑定此domain。

每槽一个静态promotion事务/job；所有读写位于同一world scope，符合simulation静态限制。它核对空槽、提案类别/parent可用、请求身份、当前有效轮数及源revision、模板许可，再按已编写结构写新槽和公共引入事实；无合法提案则defer/reject并消费收件箱，不发布部分内容。自由文本只能作该模板容许的公开外观/台词，不能驱动资格或超凡结果。关键世界属性只由模板决定。

推广与Task完成沿用recordTaskResult的同次模拟反应及CAS；固定层不写，收件箱清理与新实体原子发布。确定性机会也可走同槽机制，无需AI。生成的关系/事件后续仍由talk/work等事务裁定。首版最多8推广job＋1创作job＋2确定性时限job，低于16 jobs；静态出版分支也要计入24 App Commands/32 effects，不按运行互斥偷减声明预算。

公开投影通过当前场景/已知对象的声明视图和页式读取提供；不能把整个私有槽库、收件箱、Canon或机构内部目的绑定到前端。保留旧发生事实与来源，候选修订号不匹配则stale并重建未来批次，不覆盖旧结果。

## 有效轮次、重要度与预算

Package的 `play_progress.main.effectiveTurns` 是游玩计数唯一权威。talk/work/travel/rest/learn/practice/invoke/wait等真正消耗世界时间或改变处境的已提交尝试各增1，包括已经承担时间/代价的失败；不增：问答、资料、草稿、澄清、无效输入、生成失败、重试、后台Task和相同invocation重放。close_episode只有实际收束改变处境时才计1。不用历史transactions/turns或HTTP请求计数。

每个推进原语在规则中明确实际分钟数（起始值：交流5、短工作60、邻接旅行按路线、休息60、学习30、实践10；等待1–1440分钟），同次权威推进canonical world clock并准入模拟；纯表达零时间不触发新的创作。现有simulation只有一个驱动clock，故不发明第二轮次时钟或改clock.advance的归属；Task job门控读取有效轮数。

当前场景：本轮正常Narrator处理，已有事实即时可见，不额外调用。重要对象由明确关系、未结事务、近期后果或玩家关切提升为hot；hot间隔4有效轮、warm间隔8、cold间隔24且仅重逢/重新相关时提升到可准入级别。cold不是全世界定时AI扫描。确定性到期与资源规则始终按canonical clock执行，不受创作频率推迟。

每次批次最多合并3个相关对象、只允许1 pending世界创作、一次最多1提案，不逐NPC调用。world_schedule固定记录保存优先候选、lastUpdatedTurn、nextEligibleTurn、cursor和提案身份；选择为hot优先、再到期轮数、再稳定ID，长期到期warm防饥饿。静态job读取该有界批次输入；角色相互隐私不能因为合批而互泄。

预算初值：新开始0模型发送；普通自由文字最多1 resolver＋1 narrator的初次发送，每lane最多1显式续接发送，总计每逻辑轮不超过4次；typed事务跳过resolver。world创作每4有效轮窗口最多一个逻辑批次，初次＋一次续接共最多2实际发送；每20有效轮最多10次世界发送，无结转突发；始终只允许一个pending。失败、fallback、网络重试均占实际发送额度；不得按“成功次数”计。每次发送前Core B持久扣额，未知发送仍视为已消费；额度同时按run/anchor/lane归属，不允许客户端新建invocation或普通回退消除已花费记录。达到限额等待下一合格窗口或让玩家继续/取消；不换invocation重置。

Package声明门槛/数额，Core B只执行通用opt-in invocation quota与持久计费；不能仅靠route.maxRetries，generation-service还可能fallback。原有Task queue/cursor仍拥有调度，quota不调度世界。正文重试与批次重试在原操作中使用剩余额度；重入/刷新只能恢复待处理项。批次期间前台推进致simulationTaskCurrent失效时取消旧候选，已发送额度不返还；后续轮数门槛允许时新批次才准入。普通读档恢复旧世界，同时不能逆转运行记录中的已花费发送额度；铁人根本不回退。

## 普通、铁人与终局：Core C

拟新增opt-in `runPolicy` 能力及固定Host状态读口，Run identity使用宿主sessionId；普通/铁人由Core A确认时冻结在宿主管理根记录，不能用可回退App domain变更。Package提供death条件和公开结束文字，Core校验终局声明对应的受保护结果，AI文本及普通app.command不能发起删档。

| 操作 | 普通 | 铁人 |
| --- | --- | --- |
| 活着时继续/持久化 | 现有SavePoint与Session保存 | 只保最新已提交head的续玩点；不生成可读历史版本 |
| restore/fork/switch/已提交Reply Retry/切换variant | 既有能力 | 服务端拒绝；前端依据同一状态不展示回退入口 |
| 未提交generation重试 | 原操作续接，额度不重置 | 同样允许；不算复活或读档 |
| export/import | 精确Package依赖与原有closure | 专用head续玩闭包；本宿主记录校验同run当前head/状态，旧head拒绝；新宿主首次导入依赖合法闭包 |
| 已提交死亡 | 该角色终局，仍可读旧SavePoint建立新分支 | 已确认终局后该局不可恢复，清产品管理的该局保存 |

铁人正常续玩容器不遍历旧parent、旧branch、自动/quick/manual SavePoint；闭包仅包含当前head所需状态、展示Timeline和必要依赖，明确不含可恢复历史root。容器格式/NativeSaveSystem导入校验须在Core C中设计相应版本能力，不能截几个字段后当普通closure使用。导入到已存在同run时，仅当前head相等的幂等确认或合法最新续接可接受，不允许覆盖别的局。

死亡是权威结果成功发布后的终局。Core C在同一Session提交锁/存储协议下记录不可回退terminal墓碑与已提交deathRevisionId，取消generation/Task并撤销frontend epoch，然后进入cleanup_pending；清理SessionRepo.delete列出的该局全部branch/revision/state/timeline/save和宿主管理续玩导出索引，最后只留不含恢复状态的终局/墓碑。使用现有storage commit-last语义：死亡发布的current HEAD包含terminal标记，所有入口先检查当前不可回退根；随后在同锁下持久墓碑，墓碑确认前禁止清理root。若死亡HEAD已提交而墓碑写入中断，恢复从terminal HEAD补墓碑并封锁一切回退；若死亡HEAD未提交，未确认的候选不能当死亡。墓碑先于清理可见，session root最后删除，清理可重入；FS不能假称有跨资源rollback。并发保存/导出/导入/任务最终化必须共享run锁和terminal检查，不能仅在HTTP层检查。

拦截范围包括SessionCore全部写入/分叉/重试、NativeSaveSystem auto/quick/manual/export/import、SessionRepo.importClosure及直接repository保存路径、Native bridge、HTTP及启动恢复入口。墓碑在游戏保存之外，由owner＋session/run key定位，不能被restore、import、常规session删除或history compact清除；不做全包死亡封锁。普通死亡不产生不可恢复铁人墓碑，因此合法旧SavePoint可恢复。terminal普通局同样不能直接发送继续行动。

旧共享continuity/realm的prepared transfer会挡delete；新开局首版不启用跨局继承/转移。遇清理阻挡保持墓碑与cleanup_pending，提供可重试诊断，不删共享根或其它局。独立用户导出文件、OS备份、其它宿主已有拷贝不追删，也不承诺跨宿主防作弊。只清有明确owner/run索引的产品管理文件，未索引普通下载不算自动清理范围。

开篇、候选death叙述或连接失败不确认死亡；普通轮次仍需有效叙述＋proof＋CAS。死亡叙述生成失败时原操作未提交，可用Core B同选择恢复；成功死亡后没有generation重试回退入口。墓碑可保留结束文字或摘要，不带可恢复状态。

## Native接入与兼容

主阅读流调用既有conversation.messages/generation；输入使用composer.get/set/submit；抽屉用Native overlay与公开投影；普通保存用现有session.saves/save/restore。Core A开始和Core C模式/终局读口使用固定Host catalogue、版本化schema和宿主授权，不从Package脚本访问任意文件/HTTP。

Phase 4沿用Native现成dialog/focus/inert能力，问答以有语义的button选项卡片代替select/checkbox/radio；建议填草稿，重大不可逆规则在真正提交前提示，普通交流无统一确认勾选。视觉权威仍为frontend模块与原TXT，本阶段不重写页面。

新声明以能力version和schema显式gate；旧游戏无opt-in声明时保留原行为。新重构Package拟为3.0.0及独立packageVersionId，不复用现行2.0.0 hash identity，保留packageId表达同一游戏；最终版本及ID在Phase 3编译时固化。不承诺旧v1/v2状态迁移，新版仅接受精确依赖的新局；旧发布/旧存档继续在其对应版本使用。

## Core缺口、暂缓与后续完成标准

只有三组确认的Core工作：A无模型确定性开始；B持久选择续接及实际发送限额；C不可回退模式/终局、head续玩及死亡清理。Phase 2从当时已核对main建立 `refactor/open-roleplay-core` 辅助分支，沿用同一Task ID/Record。若基线前移，逐点核对相关变化；不把main合并游戏/docs。

Package负责问答、原语、因果/风险、机构/野路子、8槽动态发布、有效轮数与批次策略、内容编译及全部前端。暂缓：任意模型发明可执行Claim/规则、任意职业专用引擎、无限实体、全城逐轮模拟、自动世代接管、全量经济、强制长生/千回合验收、旧保存无损迁移、OS级防回退。

Phase 2完成必须以隔离数据证明：开始0发送且原子/幂等；跨进程重试保同选择/抽样与quota；失败/fallback不超额；非法proposal及stale结果无发布；普通恢复可用；铁人全部回退路径拒绝；死亡/清理中断后墓碑有效；无关局不变。已有局部测试与具体Phase 3/4闭环检查路由见 [implementation-staging.md](implementation-staging.md)，Phase 1源码证据验收见 [verification.md](verification.md)。
