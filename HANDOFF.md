# 当前任务交接

## Task

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Current branch: refactor/original-occult-western-fantasy-open-roleplay
- Current implementation HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75（Phase 1未改资产）
- Base / current stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Audited Core main: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Core auxiliary branch: 尚未建立；Phase 2核对main后建立refactor/open-roleplay-core
- Current stage: Phase 1 complete; Phase 2 pending
- Plan entrypoint: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Record: records/package/original-occult-western-fantasy-open-roleplay.md（唯一）
- docs HEAD: 以当前远端docs ref为准；不嵌入本文件自身hash。
- Phase 2 required modules: runtime-contracts.md、implementation-staging.md；verification.md的Core与状态风险部分。decisions只在冻结方向敏感时读取，不重开讨论。

## Completed

Phase 0参考与企划保留；Phase 1已按源码核对实际Package默认编译链、authority单事务意图选择、RNG/proof/叙述与CAS、动态App记录及simulation静态限制、Task提案同次推广、轮次/队列/预算、保存/终局和Native前端。六个Plan模块已补实质设计，唯一Record保留Phase 0并新增Phase 1。

设计确认三个Core缺口：A受校验的零模型开始；B持久选择续接与真实发送限额；C不可回退模式、head续玩闭包、死亡墓碑/隔离清理。Package负责五题组合、生活原语、两机构/非法路径、8槽稳定动态引入、有效轮数与hot/warm/cold更新策略及真实前端。详细规则只以Plan各归属模块为权威。

## Pending

仅下一阶段Phase 2 Core最小支持：独立main派生辅助分支实现A/B/C及适当局部验证。主游戏资产、真实前端、模式运行验证和新发布未开始。阶段1不建辅助分支、不删档、不做产品实现；本阶段更新/推送后已停止。

## Key decisions

D01–D14冻结方向仍以decisions为唯一跨模块权威。自然语言一次处理一个可裁定行动，草稿建议不自动发送；普通/风险因果由事务裁定，模型无patch权威；动态提案走私有收件箱及静态推广；当前candidate不是已提交事实。首版不要求Second Death、固定核验职业、长生或千回合。

铁人必须封住service/repository/HTTP/bridge/branch/保存导入导出的回退，不只是隐藏按钮。真实死亡提交后，当前terminal HEAD先封锁续玩，再持久墓碑、清理该局产品管理保存；中断可恢复且不影响其它局。普通保留既有读档；失败/断线不等于死亡。

## Validation / CI

Phase 1实际做远端refs、package祖先关系、干净工作树、源码定位/事实、10份Markdown、17个相对链接、36个代码/测试路径、11项源码事实及git diff --check，Phase 0正文保持一致，diff仅8份本任务文档。精确push状态以实际Git为准。未执行Node/Jest/Package、构建、CI、模型、浏览器、Android或真实UI验证；本设备无Node且无Core/tests依赖。工具及环境路由见staging，不能把入口存在声称测过。

## Next target

只执行Phase 2 A/B/C。复用现有Session/Task/Simulation/Storage与Native Host，不做万能动作引擎或第二调度器。必须验证开始0发送/幂等、跨进程pin/RNG/发送quota、非法/stale发布、普通恢复、铁人全路径限制与死亡清理中断、无关局保护；未测不得集成main。阶段结束记录精确Core tested/集成HEAD，更新同Record及本HANDOFF、推送后停止。

## Read first

1. 实际远端main/package/docs/任务refs及本地dirty；按工作空间读取AGENTS。
2. docs:HANDOFF.md → 本Plan index。
3. index指定Phase 2 runtime-contracts、implementation-staging，以及verification的Core与状态风险部分。
4. 唯一Record Phase 1；Phase 0仅参考资产/旧基线需要时读取。
5. 按A/B/C定位直接相关Core代码/测试；治理敏感动作才读docs:README.md。

## Do not repeat

不重开已确认产品方向问卷；不重建游戏分支、第二Record或另一个live HANDOFF；不重新归档参考。不把main合并package/docs，不读未授权reference分支，不全量扫Plans/Skills。不把旧resolver八命令当authority路径，不把candidate当已提交，不把历史turns当有效游玩轮数，不把maxDeliberations当真实发送限额。不要自动进入Phase 3/4或跑全部旧soak；不删真实个人数据、旧发布或历史文档。

## New-chat bootstrap prompt

继续ZZZdragondYNGPHX/Atria的refactor/original-occult-western-fantasy-open-roleplay任务，只执行Phase 2 Core最小支持。先核对远端main/package/docs/任务refs和工作树，读docs:HANDOFF.md → plans/package/original-occult-western-fantasy-open-roleplay/index.md → Phase 2 runtime-contracts/implementation-staging及verification Core部分 → 唯一records/package/original-occult-western-fantasy-open-roleplay.md的Phase 1。主任务分支仍d7be6f1abff4d9d756f2dfa24c5492104e72aa75，从package派生，禁止重建或merge main进package/docs。Phase 1已确定Core A零模型确定性开始、B持久选择续接/真实发送预算、C宿主铁人模式/终局/head续玩/墓碑清理；从当前核对main建refactor/open-roleplay-core辅助分支，同Task ID/唯一Record。沿用既有authority/Session/Task/Simulation/Storage/Native服务，先准备必要运行环境，按局部风险验证后记录真实HEAD，不声称未测能力。用户方向冻结，不重开讨论；不要提前写Phase 3游戏或Phase 4前端。Phase 2完成更新同Record与本唯一HANDOFF、提交推送后停止。
