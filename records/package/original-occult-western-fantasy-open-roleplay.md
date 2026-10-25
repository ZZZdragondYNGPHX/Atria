# 西幻开放式文字扮演重构记录

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Status: Complete; Phase 0–5 finished; Core/main and game/package integrated; 3.0.0 retained
- Plan: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Implementation branch: refactor/original-occult-western-fantasy-open-roleplay

## 总览

用户否定旧游戏固定调查职业与卷宗核心，要求开放式文字扮演并重构前端。多轮讨论确定的方向已进入Plan；本次明确授权创建分支、企划并推送，供换设备继续。

本任务不是已完成长期世界扩展的续跑，也不是只套用HTML的新皮肤。旧发布与历史文档保留，未来按当前Plan重构。

## Phase 0 企划与跨设备交接

- Date: 2026-10-04
- Start Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- End / reference-tested Package HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75
- Core baseline: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Start docs HEAD: bf53ef028e0af55bf530cfed89abc0fd5dedb75d
- Status: Complete; stop before Phase 1

### 已完成

读取完整Governance与相关工作空间规则，确认远端main／package／docs基线，原工作树干净。从package创建上述任务分支；未修改main或稳定package。

该提交不改真实游戏前端、运行契约或旧发布。任务分支已推送并跟踪同名origin分支。

建立本唯一Record及live HANDOFF。设计参考只在游戏资产分支，docs不承载产品HTML。

### 关键决定

产品方向详见Plan decisions，不在Record复制第二套详细规则。Primary Workspace是package；使用工作分支，后续阶段沿用并最终集成package。Core支持只有Phase 1确认需要时建立main派生辅助分支，同一Task ID、同一Record。

当前阶段仅企划／参考归档。不复读所有历史Plan，不恢复旧固定调查／长生默认约束。

### 已知限制

运行接口和schema缺口待Phase 1，不能将目标当作现有能力。HTML是预写回复与概念存档，不是运行证明。问答、背景素材、处罚、更新参数由执行者后续设计。普通／铁人以及新版本保存迁移还未实现。

## Phase 2 Core 最小支持

- Date: 2026-10-04
- Start docs HEAD: ff87b7f4ecd39123aca30060594623b78723b4e2
- Core base / unchanged main HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- End / tested Core HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e
- Start / End Package task HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75（未改资产）
- Stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Status: Complete on auxiliary Core branch; stop before Phase 3; main integration pending

### 实施与接口

按 HANDOFF → index → Phase 2 指定模块及本 Record Phase 1 路由续接；远端 main/package/docs/游戏任务 refs 未前移，各既有工作树起始干净。沿用游戏分支和本唯一 Record，建立已规划的 main 派生辅助 Core 分支，不 merge main 到 package/docs，不读未授权 reference。

Ready 后复用现有 authority preparation / App Commands / World Events / projection / 单次 Session CAS，提交多 domain 角色、预写 opening、Action receipt 与模式，零 provider 调用；重复 invocation/fingerprint 幂等，模式及确认输入不可再改。

B 增加 required `generation-budget@1` / `generationBudget` 和现有 Native Resource storage 的 `atri_run_control`。按 owner/session/original anchor 固定确认输入与 Transaction，跨进程重算同 proof/抽样。真实 provider send 边界使用持久 CAS 预扣每 lane/foreground 总额/后台窗口与 period 总额，unknown、retry、fallback 和 scheduler retry 均计费。计费读 Package 的有界有效轮数 scalar 与宿主 high-water，普通 restore 不退已消费后台窗口。pending 背景尝试跨其它 HEAD 写保留；旧 foreground anchor 随正式 HEAD 推进退出活动续接集，旧 HEAD 不能再发布。裸 generation、伪造后台 Task invocation、stale anchor 不能开新额度，preview/preflight 不发模型。

C 增加 required `run-policy@1` / `runPolicy`、受保护的 `atri_run`、宿主模式/sequence、固定 `host.session.run` 与 HTTP `/run`。Core/repository/HTTP/Native bridge 拒绝铁人 restore/fork/switch/已提交 Reply Retry/历史 load-save/变体与无私有 proof 的 HEAD 发布；每次发布移除旧 HEAD SavePoint。普通死亡可明确恢复，模型文字及直接 App Command 没有死亡/清理权威。

铁人 `.atriasave` schema 2 / resume 只携当前 HEAD/单 root Branch/必要 state 与 Timeline/依赖，加合法续接 ledger；无 parent/fork/SavePoint/不可达 recovery data。外层容器仍 version 1，普通/旧保存仍 schema 1。fresh store 导入保留未完成选择与 spent sends；本宿主同 run 只确认相等 HEAD/sequence，拒绝旧/普通容器回退。死亡 outcome 经 authority proof 提交 HEAD 后持久墓碑、取消该局未 finalizing 工作/epoch，再清理该局保存数据；中断由当前终局 HEAD 或独立墓碑恢复，不复活，不清理别的局或安装资产。Native death action 能返回成功的已提交 receipt。

准确声明与调用形状已写入 Plan runtime-contracts 的 Phase 2 节。初版 runPolicy 不组合 player continuity/shared realm；保持首版跨局转移暂缓边界。共 23 个变更 JavaScript 文件，复用 Session/Task/Simulation/Storage 和 fixed Host；没有另建调度器、万能规则引擎、游戏资产、产品前端或第二 Record。

### 兼容边界与待集成

没有声明新能力的既有 fixture 覆盖原 authority、simulation、Session、history、save/import、Native bridge/HTTP 与存储/GC 行为。未测试旧个人存档的全量迁移，也未执行新游戏 compiler/profile、真实前端、生产模型、浏览器、Android、真机/屏幕阅读器、全仓构建、远端 CI 或新发布。

MySQL/PostgreSQL 本地服务未启动；最终明确禁用这两套 harness，不称通过。FS 仍按既有单服务进程写入边界，多进程同时写 FS 及 OS/跨宿主绝对防作弊不在保证中；跨进程重新打开与 resume 携带 ledger 已测。普通 schema 1 文件保持原 portable 格式；同宿主已消费额度在独立控制记录中保留，铁人 schema 2 额外携带当前续接预算。

辅助分支按分阶段交付保留，main 未动；当前主线没有这组新能力。游戏原任务分支、旧发布、方向和 Phase 0/1 记录保持原样。

### 下一 checkpoint 与停止点

本阶段更新同一 HANDOFF / Record、提交推送后停止，不进入 Phase 3/4。

## Phase 3 Package 体验与内容

- Date: 2026-10-04
- Start docs HEAD: 58e839fe506dca3f3e8d48a88e2b5ba1a2221a88
- Start Package task HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75
- End / tested Package task HEAD: 2aa07d7adfdfd51552d82545d3457dd003fe6675
- Tested Core HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e（无新增产品改动；main 集成 pending）
- Stable package / main: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e / c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Status: Complete; stop before Phase 4

### 已完成

旧 manifest/runtime fixture、旧 frontend 源码及设计参考、1.0.0/2.0.0 发布保留。Core 的用户 AGENTS.md dirty，以及 docs 的 README/WEB-PERSISTENT-PROMPT/templates 四份既有 dirty 保留，未纳入本阶段提交。

新增 `data/roleplay.foundation.json` 与 closed schema：五题普通成年处境、姓名/个人修饰边界、guest+solo 互斥、两日资源/工具、单一真实关系或无关系、六个普通公开地点与邻接路线、两机构见证载体/Anchor/Price、受限工程选项及三种动态模板。预写引子及选中背景/关系素材和实际资源同次提交。开始输入更改/模式冻结/幂等均走 Core 已实施入口。

`roleplay-compile.mjs` / `roleplay-world-compile.mjs` 接管默认内容 profile，保留显式历史编译路径。新版本 3.0.0 / `pkgv_d5f1d44b7a9f4edc7266bf4d547a3112`，同 packageId；19 个声明式事务，其中 17 个公开玩家原语。生活、自由表达、工作、交流、邻接旅行、休息、关注、经历收束/继续、两机构完整超凡路线和个人载体/缩窄管辖均使用 Core 权威。Seed/载体/Price/成长不来自模型 patch；真实后果包含收入/耗时、疲劳/伤、维护费/违约、能力失效、署名报告/核实/传唤/重复实践后的拘捕及监督补救、明确严重条件下的死亡。

私有收件箱/调度及世界逻辑组为有界 aggregate，安全 summary/index 为受保护派生输出。有效轮数与 canonical 分钟同次推进并原子发布给 Core 的 protected scalar。八个 never-recycled 槽保存稳定 ID、来源/修订/引入轮数与状态；推广、收件箱消费和公开引入一次 CAS；满额停止引入，既有 person/place/affair 能实际交流/拜访/完成工作并保留身份。

为满足真实模拟每次扫描的 read budget，将原设计的八个逐槽 job 聚合为一个含八静态写分支的 `world.reconcile`，同时处理确定性日费/维护/追查；另一个 job 是单 pending `world.create`。全部静态分支和 publication 最大 23 App Commands / 23 effects；不用互斥减去声明开销。hot/warm/cold 为 4/8/24 加重逢准入，最多三个已知关联对象合批；实际 send quota 由 P2 Core 控制，失败与 restore 不退额度。详细接口单源在游戏 `runtime/ROLEPLAY.md` 和 Plan runtime-contracts Phase 3。

### 边界与下一 checkpoint

SQLite/MySQL/PostgreSQL、生产模型的自由语言理解/叙事质量、浏览器/真实 Native 新页面、Android/屏幕阅读器及旧状态迁移本轮未测；P2 的 FS/SQLite/中断等 Core 证据仍按原范围保留。首版单当前 Claim/八个总动态身份/有限 scalar bounds 保持明确，任意新法术/无限实体、旧存档无损迁移和 OS/跨宿主绝对防作弊继续暂缓。

没有新 `.atria` 输出，不合并 main 或 package，不运行/等待远端 CI。阶段发布只推当前游戏任务与 docs refs，保护无关 dirty；Record/HANDOFF 继续唯一。

Core/main、game/package 最终集成及新发布留 P5。

## Phase 4 真实 Native 前端

- Date: 2026-10-04
- Start docs HEAD: 9cc1b33e8d066efa45ac0a18fccecd97ac44122d
- Start Package task HEAD: 2aa07d7adfdfd51552d82545d3457dd003fe6675
- End Package task HEAD: 25b39d57eb206b4c6b09d4642d0c458c8d9e5784
- Start Core HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e
- End Core HEAD: 1661af11245c856363bfc1084275c02b55a97452
- Stable package / unchanged main: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e / c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Status: Complete on original game/Core auxiliary branches; stop before Phase 5; integration pending

### 实施

没有读取 skills/reference 分支、重开方向问卷、分派子 Agent 或建立第二 Record/HANDOFF。Core 与 docs 使用已有独立工作树。

默认 package compiler 改为实际新 Native 图，替换 P3 内存 neutral shell。仅保留 questions/incompatibilities/places 在前端 authored catalogue，不携完整世界/超凡定义。两 Package domain 绑定仅为派生 roleplay_summary / roleplay_visible；不绑定私有 aggregate、proposal、调度、规则写口或裸 App Command。

单列叙事/选中背景、地点/时间、可增长多行输入、只填草稿的建议；右缘随身记事的自身/人物/物件/地点见闻/保存页。普通恢复为侧栏内明确选档确认；铁人提示当前续玩限制并禁用回退。经历收束与真正死亡分开；普通死亡可明确读回早期保存，铁人清理后的主区/资料只显示终局、不读取删除状态。

begin 未确认时保留同 input/invocation/epoch/revision/idempotency，不以新确认绕过；提交成功但响应损坏通过只读确认恢复。Host composer get/set/submit、generation/cancel/recover 控制真实输入；失败保留草稿并封锁未经确认的再发送。轮询只读，读失败封锁写口并继续恢复读取；抽屉开关保草稿，Native overlay 负责 focus/inert/Escape/返回。新回复不替换回读窗口，明确返回最新按钮读取最多 32 条近期已提交消息。

CSS 保留 #F7F5F0 / #FFFFFF / #2C2A28 / #C29B62 护栏，衬线叙事及输入、sans 控件、1.8 正文行高；黄铜小字改 #795B32，纸/白底对比分别 5.74/6.26。炭灰 13.12/14.30、辅助字 5.46/5.95、错误字 7.20/7.84；实测配对均超过 4.5。按钮至少 44px、输入起始 18px；输入随文档流、不固定覆盖故事；drawer 只做 transform/opacity 动画并尊重 reduced motion。

### 必要 Core 修复

实际接入暴露两处宿主读口缺口，已在原 refactor/open-roleplay-core 提交并推送，main 未变：

1. 新增固定 host.conversation.recent read.snapshot，closed 可选 beforeSequence，返回原始顺序/内容的至多 32 条已提交消息，支持向前窗口，原 messages 接口不改。
2. 原铁人删除 Session 后 bridge.open 无法重开终局图。旧墓碑缺 origin 时仍有 /run，不声明 Native 图重开兼容。

这些是 P4 消费既有权威的必要最小读口补足，不追加新玩法/恢复通道。准确接口已同步 runtime-contracts Phase 4 和游戏 runtime/ROLEPLAY.md。

# target game

# auxiliary Core, Node22 directory prepended to PATH

./node_modules/.bin/eslint public/shared/native-frontend-host.js \
  src/native/run-control.js src/native/frontend/host-bridge.js \
  src/native/frontend/host-services.js
# tests directory

三套件 **56/56** 通过，12.808 s；[core-contract-budget.log](original-occult-western-fantasy-open-roleplay/p5-evidence/core-contract-budget.log)。覆盖 opt-in 声明/旧容器契约与实际后台队列重试、跨 HEAD/重开/普通恢复不退款、stale/preflight 零发送、单次提案及跨窗口 period cap，FS/SQLite 各自实测。P2/P4 其它已完成存储/清理契约证据继续按其原范围保留，没有再跑全 23 套件。

游戏从目标目录运行以下命令（本轮候选文件名与原始报告保持实际值）：

19 事务/17 玩家原语/2 jobs，静态最大 23 commands/23 effects、发送声明 2/2/4 与后台 2/4/20/10 不变。[v1.json](original-occult-western-fantasy-open-roleplay/p5-evidence/v1.json) / [v2.json](original-occult-western-fantasy-open-roleplay/p5-evidence/v2.json) 为旧发行安装/Ready/安全视图/损坏拒绝的最小兼容证据；不是重跑旧 campaign/century。

[runtime.json](original-occult-western-fantasy-open-roleplay/p5-evidence/runtime.json) 九组通过，实际回环合成 HTTP 请求 **180** 次；最大前台 prepared work 11 reads/7 commands/8 effects。包括两起点、零发送单 CAS 幂等开始、两机构完整路线和代价/成长/违约、自由文字多意图只裁定一次、失败不提交与同回执恢复、Task 收件箱/模板推广/八槽与三类交互/真实 Save import、预算失败与 stale/普通读档不退款、真实 Host 自动后台派发、个人 Claim/反噬/死亡/具名追查/拘捕与监督补救、普通死亡恢复和铁人 current resume/清理。随机风险由固定新 run identity 决定，本轮发送数与 P3 不同，不修改原报告。

两问答起点/丢响应恢复、草稿建议/焦点、真实自然语言工作和 Host 保存恢复、实际 Narrator HTTP 失败与保草稿、390/1440 及相关补充视口/横屏/200% Native 字号/44px/reduced motion、长阅读窗口稳定、经历收束、Claim 展示与普通死亡恢复、铁人保存限制和清理后终局均通过。十五张本轮成功截图与报告同目录，包含 [390 故事](original-occult-western-fantasy-open-roleplay/p5-evidence/story-390.png)、[抽屉](original-occult-western-fantasy-open-roleplay/p5-evidence/drawer-390.png)、[普通终局](original-occult-western-fantasy-open-roleplay/p5-evidence/ordinary-terminal.png)、[铁人终局](original-occult-western-fantasy-open-roleplay/p5-evidence/ironman-terminal.png)。只归档报告列出的成功截图，未混入旧构建目录遗留失败截图。

原始 runtime/UI 仍携其既有 P3/P4 harness 标签；本轮是对最终文件的 P5 执行，不改写标签/HEAD/dirty，也不为元数据重复未变化的全闭环。两报告在 clean 编译 HEAD / 相同 Core HEAD 启动；后续留存说明不改变已测 payload。

## 最终状态

Phase 0–5 全部完成。Open Lives 3.0.0 已作为新资产保留并推送到长期 package，所需 Core 已集成并推送 main；唯一永久 Record 和 Plan 完成状态已更新，live HANDOFF 与两个任务短期分支清理。Core/docs 原有无关 dirty 逐字节保持；其它任务/工作树不变。
