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

## 最终状态

整体任务仍Active。Phase 0及Phase 1完成；产品、游戏内容、真实前端和新发布均未实现。保持原任务分支与唯一live HANDOFF，等待明确继续Phase 2。
