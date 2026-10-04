# 当前任务交接

## Task

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Current branch: refactor/original-occult-western-fantasy-open-roleplay
- Current implementation HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75
- Base Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Core baseline main: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Current stage: Phase 0 complete; Phase 1 pending
- Plan entrypoint: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Record: records/package/original-occult-western-fantasy-open-roleplay.md
- docs HEAD: 使用当前远端docs ref；本文件不嵌入自身提交hash。
- Phase 1 required modules: decisions.md、player-experience.md、world-supernatural.md、runtime-contracts.md、implementation-staging.md；verification.md只读Phase 1部分。

## Completed

用户方向讨论已收敛；建package派生任务分支，归档原始HTML与视觉护栏，建立8模块Plan、唯一Record与本HANDOFF。主任务分支已推送。当前docs提交包含本企划与交接，实际远端状态需按Git核对。

参考位于任务分支original-occult-western-fantasy-game/frontend/references/open-roleplay/；不依赖旧设备本地文件。HTML为案例，TXT为视觉护栏，README含hash；尚未接入运行前端。

## Pending

Phase 1契约核对和具体实施设计；Core辅助分支只在确认缺口后建立。所有运行、内容、前端重构、模式验证与新发布均未开始。不删除任何已有保存、旧发布或历史文档。

## Key decisions

开放文字扮演，不锁职业；问答组合背景、开局不额外调用AI；主流机构超凡与高风险非法野路子；多机构竞争；因果主导＋规则随机；有限世界演化按重要度／轮次控制调用；固定底座动态内容；成长靠理解／运用／锚点／代价；长生可选；无唯一主线、支持短篇闭环；真实死亡，普通可读档，铁人确认死亡删该局档。详细冻结权威只读Plan decisions。

用户指定暖白／炭灰／黄铜、衬线叙事与输入、单列流、边缘抽屉、建议只填草稿；原三入口和卷宗隐喻不是约束。

## Validation / CI

已做Git基线核对、10份Markdown／13个相对链接检查、2份原始参考逐字节／hash比对、任务分支祖先及交接HEAD核对；自有Markdown空白检查通过。提交与推送后核对实际refs。无游戏／产品测试、构建、CI或真实UI验证。本地file预览此前被浏览器策略阻止，不规避策略。原始参考空白保留，不按运行源码质量声称通过。

## Next target

仅执行Phase 1：核对现有authority、意图resolver、模型叙述、动态事实、轮次预算、保存／终局及Native前端契约。明确哪些由Package改、哪些需要最小Core支持及哪些暂缓，补充Plan真实设计映射。此阶段不实现产品；完成记录／推送后停止。

## Read first

1. 实际Git／远端ref与工作树状态；对应package AGENTS。
2. docs:HANDOFF.md。
3. docs:plans/package/original-occult-western-fantasy-open-roleplay/index.md。
4. 只读上述Phase 1模块与本Record Phase 0。
5. 按runtime-contracts定位直接相关代码；需要治理敏感动作时读取docs:README.md。

## Do not repeat

不要重新开展已确认方向问卷；用户已委托具体问题与参数。不把默认角色恢复为核验者，不要求走Second Death或保留所有调查页面；不把长生／千回合当必经验证。不得合并main到package／docs，不读未授权reference分支，不全量扫Plans/Skills。不新建第二个Record或另一个live HANDOFF。

## New-chat bootstrap prompt

继续ZZZdragondYNGPHX/Atria的refactor/original-occult-western-fantasy-open-roleplay任务，只执行Phase 1契约核对与实施设计。先核对实际Git状态并获取远端main、package、docs及任务分支；主任务分支从package派生，当前实施HEAD为d7be6f1abff4d9d756f2dfa24c5492104e72aa75，不要从main重新建游戏任务。读package规则、docs:HANDOFF.md → docs:plans/package/original-occult-western-fantasy-open-roleplay/index.md → 该index指定Phase 1模块 → docs:records/package/original-occult-western-fantasy-open-roleplay.md的Phase 0。用户方向已确认，具体问答和参数由你设计，不重新逐题讨论。视觉案例和护栏已在任务分支frontend/references/open-roleplay，尚未改真实产品。分析自由意图、超凡路径、动态世界／预算和普通／铁人终局的实际契约，给出复用／缺口映射与后续完成标准。只在确认Core缺口后计划main派生辅助分支，共用同一Record；阶段1不实现代码、不发布、不删真实数据。完成Plan实质补充、更新同一Record与唯一HANDOFF、验证文档并推送后停止。
