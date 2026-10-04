# 西幻开放式文字扮演重构记录

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Status: Active; Phase 1 complete, Phase 2 pending
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

读取完整Governance与相关工作空间规则，确认远端main／package／docs基线，原工作树干净。根据用户明确建分支指令，从package创建上述任务分支；未修改main或稳定package。

用户HTML／TXT原样存入任务分支frontend/references/open-roleplay，并补来源／hash说明，提交为d7be6f1abff4d9d756f2dfa24c5492104e72aa75。该提交不改真实游戏前端、运行契约或旧发布。任务分支已推送并跟踪同名origin分支。

docs下建立8模块Plan Bundle，保存批准方向、体验、世界超凡、运行契约、视觉、分阶段路线和验证边界；建立本唯一Record及live HANDOFF。设计参考只在游戏资产分支，docs不承载产品HTML。

### 关键决定

产品方向详见Plan decisions，不在Record复制第二套详细规则。Primary Workspace是package；用户明确要求建工作分支，后续阶段沿用并最终集成package。Core支持只有Phase 1确认需要时建立main派生辅助分支，同一Task ID、同一Record。

当前阶段仅企划／参考归档。下一阶段做实际契约核对与实施设计，不直接开始代码。不复读所有历史Plan，不恢复旧固定调查／长生默认约束。

### 验证与证据

参考HTML SHA-256: fb3473625058536b82b797a3fd92bc4bb0875603f2b7a9d64e24e66b15681e33。
护栏TXT SHA-256: d3c198cecd4c83f27de027c81412580fadd1e10391ae1be7f5532418132f5119。
两份复制件与原件一致。新自有Markdown执行空白检查，Plan引用及阶段路由执行存在性检查；原始参考按字节一致验证，不为清除生成器空白改写用户文件。

已核对10份自有Markdown、13个相对链接、2份逐字节一致的参考资产、分支祖先关系以及Record／HANDOFF中的实施HEAD；git diff --cached --check通过。远端package任务分支已推送，docs发布状态以实际远端refs与HANDOFF为准。未运行产品／游戏测试、构建、CI、模型、浏览器、Android或真机验证；此前参考本地file预览被浏览器策略阻止，只有源码阅读。

### 已知限制

运行接口和schema缺口待Phase 1，不能将目标当作现有能力。HTML是预写回复与概念存档，不是运行证明。问答、背景素材、处罚、更新参数由执行者后续设计。普通／铁人以及新版本保存迁移还未实现。

### 下一checkpoint

Phase 1：核对自由文字意图、合法／非法超凡、动态内容、有限演化、死亡保存与Native前端真实契约，形成复用／缺口映射、最小可玩闭环与下一阶段验收。完成设计、验证事实、更新同一Record与HANDOFF、推送后停止。

## Phase 1 契约核对与实施设计

- Date: 2026-10-04
- Start docs HEAD: e391171458652f3c698fcf6ab744f11f99f743a5
- End docs: 本阶段docs提交，以当前远端docs ref及本节提交历史定位，不嵌入自身hash。
- Start / End / audited Package task HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75（未改资产）
- Stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Audited Core HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746（未改产品）
- Status: Complete; stop before Phase 2

### 已完成与关键发现

先核对远端refs并按HANDOFF → index → Phase 1模块 → 本Record Phase 0路由读取，遵守package/docs/main规则。当前设备原Projects目录无checkout；建立既有任务分支的跟踪工作树、独立docs工作树及只读detached main审计工作树，无已有dirty改动。任务分支仍由准确package基线派生，main/package/任务refs与Phase 0一致。没有新建游戏任务、重复Record或Core辅助分支。

源码核对覆盖默认Package编译链、单事务authority resolver、RNG/候选proof及叙述后CAS、App Command动态记录与静态simulation限制、Task收件箱同次确定性推广、world queue/cursor及history轮数、普通保存祖先闭包与Reply Retry回退、delete范围/FS commit-last、Native Host composer/overlay/focus。结果与具体定位都写入runtime-contracts，不能用无authority旧resolver的八命令能力冒充此游戏支持。

已核对Native直接App Command可无模型写单domain；它没有多domain角色＋预写开篇＋宿主mode的一体提交，因此确认最小Core缺口A确定性无模型开始、B持久选择续接与真实发送限额、C宿主模式/终局、head续玩、墓碑及清理；现有candidate+Narrator不是已提交事实，WeakMap选择pin不是跨进程恢复，maxDeliberations不是跨失败预算，隐藏按钮不是铁人防回退。动态内容优先复用已存在的Task→私有收件箱→静态模拟事务→原子发布，第一批采用8个稳定不回收身份槽，不增加任意动态规则引擎。

实质补充六个Plan模块：index阶段映射；runtime-contracts真实事实/所有权/缺口及开始、原语、风险、动态提案、轮次/预算、普通/铁人和兼容设计；player-experience五题组合与两个非调查起点；world-supernatural两机构传承及非法实践/追查因果；implementation-staging下一阶段文件与现有检查路由/完成门槛；verification的Phase 1源码与文档证据要求。decisions冻结方向和frontend模块未改，参考文件未重复保存。

### 验证与证据边界

实际执行远端Git ref核对、package→任务分支祖先检查、独立工作树状态检查、直接相关源码/现有测试入口阅读；以Python核对本任务10份Markdown、17个相对链接、36个新增引用的代码/测试路径、11项源码事实，确认diff仅8份本任务文档、Phase 0正文保持一致，自有Markdown git diff --check通过。远端复核与初次基线一致，任务分支无现有PR。最终检查与推送精确状态随本阶段提交核对，未产生产品/Package修改。

环境没有Node，Core及tests依赖目录未安装；本阶段不为源码设计安装全运行环境。未执行Jest、游戏/Package工具、构建、CI、模型发送、浏览器、Android或真实UI验证。既有测试只定位与阅读，不称通过；frontend-model/browser-check是harness导出函数，package validate默认旧长期链，后续必须按新profile适配。无新.atria、无真实保存删除、无旧状态迁移证明。

### 已知限制与下一checkpoint

全部新增契约为后续设计，Core A/B/C尚未实现，能力gate/容器版本与静态展开预算需在Phase 2/3实际编译、风险验证。首批动态引入总量有界，满额保留既有身份并延期；任意模型自创可执行Claim、无限世界、旧保存无损迁移及OS/跨宿主防作弊暂缓。

下一步仅Phase 2：重新核对实际main，建立main派生 `refactor/open-roleplay-core` 辅助分支，按runtime-contracts与staging完成A/B/C、相关局部兼容/状态风险验证，共用本Record；阶段结束更新唯一HANDOFF、推送并停止。游戏分支继续沿用，不提前进入Phase 3/4，不合并main到package/docs。


## Phase 2 Core 最小支持

- Date: 2026-10-04
- Start docs HEAD: ff87b7f4ecd39123aca30060594623b78723b4e2
- Core auxiliary branch: refactor/open-roleplay-core（从核对后的 main 派生）
- Core base / unchanged main HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- End / tested Core HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e
- Start / End Package task HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75（未改资产）
- Stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Status: Complete on auxiliary Core branch; stop before Phase 3; main integration pending

### 实施与接口

按 HANDOFF → index → Phase 2 指定模块及本 Record Phase 1 路由续接；远端 main/package/docs/游戏任务 refs 未前移，各既有工作树起始干净。沿用游戏分支和本唯一 Record，建立已规划的 main 派生辅助 Core 分支，不 merge main 到 package/docs，不读未授权 reference。

A 增加 required `story-start@1` / `storyStart` 声明、确定性非 resolver bootstrap Transaction 的闭合校验，以及 `SessionCore.beginStory`、HTTP `/begin`、固定 `host.session.begin`。Ready 后复用现有 authority preparation / App Commands / World Events / projection / 单次 Session CAS，提交多 domain 角色、预写 opening、Action receipt 与模式，零 provider 调用；重复 invocation/fingerprint 幂等，模式及确认输入不可再改。

B 增加 required `generation-budget@1` / `generationBudget` 和现有 Native Resource storage 的 `atri_run_control`。按 owner/session/original anchor 固定确认输入与 Transaction，跨进程重算同 proof/抽样。真实 provider send 边界使用持久 CAS 预扣每 lane/foreground 总额/后台窗口与 period 总额，unknown、retry、fallback 和 scheduler retry 均计费。计费读 Package 的有界有效轮数 scalar 与宿主 high-water，普通 restore 不退已消费后台窗口。pending 背景尝试跨其它 HEAD 写保留；旧 foreground anchor 随正式 HEAD 推进退出活动续接集，旧 HEAD 不能再发布。裸 generation、伪造后台 Task invocation、stale anchor 不能开新额度，preview/preflight 不发模型。

C 增加 required `run-policy@1` / `runPolicy`、受保护的 `atri_run`、宿主模式/sequence、固定 `host.session.run` 与 HTTP `/run`。Core/repository/HTTP/Native bridge 拒绝铁人 restore/fork/switch/已提交 Reply Retry/历史 load-save/变体与无私有 proof 的 HEAD 发布；每次发布移除旧 HEAD SavePoint。普通死亡可明确恢复，模型文字及直接 App Command 没有死亡/清理权威。

铁人 `.atriasave` schema 2 / resume 只携当前 HEAD/单 root Branch/必要 state 与 Timeline/依赖，加合法续接 ledger；无 parent/fork/SavePoint/不可达 recovery data。外层容器仍 version 1，普通/旧保存仍 schema 1。fresh store 导入保留未完成选择与 spent sends；本宿主同 run 只确认相等 HEAD/sequence，拒绝旧/普通容器回退。死亡 outcome 经 authority proof 提交 HEAD 后持久墓碑、取消该局未 finalizing 工作/epoch，再清理该局保存数据；中断由当前终局 HEAD 或独立墓碑恢复，不复活，不清理别的局或安装资产。Native death action 能返回成功的已提交 receipt。

准确声明与调用形状已写入 Plan runtime-contracts 的 Phase 2 节。初版 runPolicy 不组合 player continuity/shared realm；保持首版跨局转移暂缓边界。共 23 个变更 JavaScript 文件，复用 Session/Task/Simulation/Storage 和 fixed Host；没有另建调度器、万能规则引擎、游戏资产、产品前端或第二 Record。

### 实际验证

环境使用 Node v22.23.3；官方运行包 SHA-256 校验通过，Core 与 tests 通过 npm ci 安装锁定依赖，better-sqlite3 原生依赖已构建。下载工具、node_modules、日志与全部隔离临时数据均不入库。

在 tested Core 上执行以下最终命令（Node 已在 PATH）：

```bash
ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 \
  npm --prefix tests run test:unit:serial -- --runTestsByPath \
  native/run-contract-p2.test.js native/generation-budget-p2.test.js \
  native/run-policy-p2.test.js native/contracts.test.js \
  native/authority-contract-c1.test.js native/authority-candidate-c2.test.js \
  native/authority-turn-c3.test.js native/authority-frontend-c3.test.js \
  native/authority-integration-c4.test.js native/simulation-contract.test.js \
  native/simulation-task.test.js native/simulation-session.test.js \
  native/session-core.contract.test.js native/session-durability.test.js \
  native/session-history-p2.test.js native/save-system.test.js \
  native/frontend-bridge.test.js native/frontend-conversation.test.js \
  native/frontend-transaction-catalogue.test.js native/session-runtime-http.test.js \
  native/model-prompt-runtime-persistence.test.js \
  native/storage-foundation.contract.test.js native/storage-gc.contract.test.js
```

最终结果 **23 套件 / 390 项全部通过**（64.188 s），包含新增 70 项与既有 320 项；FS/SQLite 的开始、模式、额度、保存与恢复均执行。子进程恢复使用独立 Node 进程和同一隔离存储，无原 WeakMap/proof。发送计数使用实际 adapter 与回环 HTTP 合成 provider，不是生产模型；包含失败、fallback、未知 send、queued Task 两次额度、不同窗口共用 period 上限、ordinary restore 后不退款、受控提案一次发布、stale/伪造请求不发布、Native compiled bridge 0-send begin/rollback refusal/death receipt、取消非合作 Task、当前 closure 与 spent-ledger fresh-store portability。

故障注入覆盖 bootstrap HEAD CAS 前、死亡 HEAD CAS 后墓碑写入前（FS commit-last）、墓碑后的部分 state 删除、root 删除后的 completion marker，以及清理失败再启动恢复。死亡/保存/导出并发与无关局不变已测；所有删档对象都是新建临时 harness 数据。

全部 23 个变更 JavaScript 文件按 Core/tests 各自 ESLint 配置通过，无错误/警告；git diff --check / cached --check 通过。文档相对链接/路由与 Phase 0/1 正文保留、唯一 Record/HANDOFF、实际 refs/祖先和推送状态在阶段交付时复核。

### 兼容边界与待集成

没有声明新能力的既有 fixture 覆盖原 authority、simulation、Session、history、save/import、Native bridge/HTTP 与存储/GC 行为。未测试旧个人存档的全量迁移，也未执行新游戏 compiler/profile、真实前端、生产模型、浏览器、Android、真机/屏幕阅读器、全仓构建、远端 CI 或新发布。

MySQL/PostgreSQL 本地服务未启动；最终明确禁用这两套 harness，不称通过。FS 仍按既有单服务进程写入边界，多进程同时写 FS 及 OS/跨宿主绝对防作弊不在保证中；跨进程重新打开与 resume 携带 ledger 已测。普通 schema 1 文件保持原 portable 格式；同宿主已消费额度在独立控制记录中保留，铁人 schema 2 额外携带当前续接预算。

辅助分支按分阶段交付保留，main 未动；当前主线没有这组新能力。Phase 3 使用上述精确 tested Core checkout 接入 Package，主线集成按后续阶段安排，项目验证仅本地最小相关；MySQL/PostgreSQL 等额外检查只随实际风险决定，不预设为阶段阻塞条件。游戏原任务分支、旧发布、方向和 Phase 0/1 记录保持原样。

### 用户最新工作约定

用户于本阶段交付时更新 AGENTS.md 指令并明确替代此前提供的 AGENTS.md 指令：**每阶段及任务完成时，只在本地执行最小相关验证。** 已同步唯一 HANDOFF 和当前 Plan 路由；不主动启动、等待或依赖远端 CI/GitHub Actions。推送后远端 refs 复核只属于发布确认。已执行本地阶段检查保持真实记录，无需为旧默认流程追加远端或无关验证。

### 下一 checkpoint 与停止点

下一步只执行 Phase 3 游戏内容：核对远端和工作树，按 index 的 Phase 3 路由读取玩家体验/世界超凡/runtime-contracts 已实施接口与 staging/verification 游戏部分；在原 package 任务分支建立新默认 compiler/profile、开始组合、生活原语、机构/非法路径与受控动态槽位，使用精确 tested Core 验证。本阶段更新同一 HANDOFF / Record、提交推送后停止，不进入 Phase 3/4。

## 最终状态

整体任务仍 Active。Phase 0/1/2 完成，Core A/B/C 已在辅助分支验证；main 集成、游戏内容、真实前端和新发布仍待后续阶段。原游戏任务分支与唯一 live HANDOFF 保留，下一阶段为 Phase 3，需用户明确继续。
