# 当前任务交接

## Task

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Current game branch: refactor/original-occult-western-fantasy-open-roleplay
- Current game implementation / tested HEAD: 2aa07d7adfdfd51552d82545d3457dd003fe6675
- Base / stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Core auxiliary branch: refactor/open-roleplay-core
- Core tested / pushed HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e
- Core base / unchanged main HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Core integration: pending；按分阶段交付保留辅助分支，尚未合入 main。
- Current stage: Phase 3 complete; Phase 4 pending
- Plan entrypoint: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Record: records/package/original-occult-western-fantasy-open-roleplay.md（唯一，保留 Phase 0/1/2，新增 Phase 3）
- docs HEAD: 以实际远端 docs ref 为准，不嵌入本文件自身 hash。
- Phase 4 required modules: frontend.md、player-experience.md、runtime-contracts.md 的 Phase 2/3 已实施接口、implementation-staging.md；verification.md 的 UI 与对应风险部分。冻结决定只在方向敏感时按需读，不重开讨论。

## Completed

Phase 0 参考与企划、Phase 1 源码核对与设计、Phase 2 Core A/B/C 保留。Phase 3 已在原游戏分支完成默认 Open Lives 3.0.0 内容 profile：五题无模型/单 CAS 开始、生活和自然语言原语、Church/Academy 窄超凡路线、个人载体与缩窄条件、因果追查/拘捕/求助、八个稳定且不回收的动态身份、hot/warm/cold 和两个有界 simulation jobs。十九个事务、十七个公开玩家原语；有效轮数同次发布给 Core protected scalar，模型无 patch/Claim 权威。具体已实施接口以游戏 runtime/ROLEPLAY.md 为单源，Plan runtime-contracts Phase 3 说明消费边界及逐槽 job 聚合的预算调整。

Core required story-start@1 / generation-budget@1 / run-policy@1 / authority-transaction@1 已由新 profile 声明并实际消费。普通保存 schema 1，铁人 schema 2 / scope resume，外层容器 version 1。Core 无新增源码改动，main 未集成。旧源码 frontend、历史 releases 与参考 HTML/TXT 保留；默认 compiler 仅生成内存 neutral Native shell，真实新页面尚未实施。未创建 3.0.0 .atria。

## 最新工作约定（用户 2026-10-04 更新）

用户最新 AGENTS.md 指令替代此前提供的 AGENTS.md 指令：**每阶段及任务完成时，只在本地执行最小相关验证。** 推送后核对 refs 仅为发布确认，不属于项目验证；不启动、等待或依赖远端 CI/GitHub Actions。后续对话沿用本条最新约定。

保护无关 dirty：Core AGENTS.md；docs README.md、WEB-PERSISTENT-PROMPT.md、templates/HANDOFF.md、templates/RECORD.md。不将其纳入本任务提交。

## Validation

Phase 3 最终默认 profile 在 clean Package 2aa07d7ad / 精确 Core 5f9e8feb0 上通过九组隔离 FS、实际 Native Session/authority/Task/Save、回环合成 HTTP 闭环。实际 provider 请求 175 次；最大前台 prepared readGrants 11 / appCommands 7 / effects 8，静态所有分支加 publication 最大 23 commands / 23 effects。验证包含两个机构、个人 Claim 与死亡、自然语言单行动和失败同 receipt 重试、无效/恶意 Task 拒绝、八槽身份/三种交互/真实保存 import、窗口耗尽/stale/restore 不退款、原 Host 自动前台→后台派发、追查拘捕限制及求助、普通死亡恢复和铁人 current resume/终局清理。多数负向检查控制自动派发时机并驱动真实生命周期，另有未替换 queueSimulation 的自动路径实测。

content-check.mjs 和显式旧 fixture 局部回归通过；新增/修改 JS 通过 Node 语法与实际编译/运行，diff 空白检查通过。Node v24.21.0；原始 runtime/fixture/content 报告保存于 Record 旁的 p3-evidence。fixture 报告真实记录实施中父 HEAD + dirty=true，不冒充最终 clean HEAD。Phase 2 的 23 套件/390 项 FS/SQLite/独立进程恢复证据仍保留其原范围，本阶段未重跑 Core 套件。

未运行生产模型、真实新 Native 页面/浏览器、Android/屏幕阅读器、SQLite/MySQL/PostgreSQL、本阶段 century soak、旧存档迁移或新发布。局部 Native 内容容器验证不能当页面验收。详细命令/断言/未测限制见唯一 Record Phase 3。

## Pending

下一阶段只执行 Phase 4 真实 Native 前端：沿用原游戏任务分支和精确 tested Core，按 frontend/player-experience 与已归档 HTML/TXT 及冻结视觉护栏实现问答、故事阅读、输入/建议草稿、人物/世界抽屉和普通/铁人保存/终局显示。通过既有 begin/run/composer 服务消费已提交 summary/index；注意 package.mjs 当前会为新 profile 在内存覆盖 Main.aui 为 neutral shell，需要接入真实新前端编译路径，不能以旧 Inquiry 页面或 placeholder 充当完成。

使用实际公开派生输出，避免绑定私有 aggregate/proposal/schedule。先读游戏 runtime/ROLEPLAY.md 的真实字段与原语，按界面变化执行最小相关本地检查，更新同一 Record/HANDOFF、提交推送后停止。Core/main、game/package 最终集成与新版本构建发布在 Phase 5，不提前推进。

## Key decisions

D01–D14 的已确认方向仍以 decisions 为跨模块权威。自然语言一次裁定一个行动，模型没有 patch 权威，candidate 未提交；问答组合/生活原语/两机构及非法路径/8 个稳定动态槽/有效轮数及 hot/warm/cold 由 Package 实现。首版不要求 Second Death、固定核验职业、长生或千回合。

铁人用宿主 sessionId 标识 run，选择在 begin 时冻结，不能靠隐藏按钮实现。权威死亡 HEAD 先封锁，再墓碑、取消该局工作/epoch、清理该局保存；中断由 runStatus / HTTP /run 恢复，别的局与安装资产受保护。普通保留明确恢复；未知发送已扣额，生成失败不算死亡。清理后的旧请求读取终局，不重建该局。

## Read first

1. 真实远端 main/package/docs/两个任务 refs、工作树 dirty 与相应 AGENTS。
2. docs:HANDOFF.md → 本 Plan index。
3. index 指定的 Phase 4 模块，特别是 frontend 和 runtime-contracts 的 Phase 2/3 实际接口。
4. 唯一 Record Phase 3 的 tested HEAD / 命令 / 限制，及游戏 runtime/ROLEPLAY.md；Phase 0/1/2 历史按需读。
5. 直接相关 Package 默认 compiler、当前 frontend 和已归档原参考；治理敏感操作才读完整 docs:README.md。

## Do not repeat

不重开用户方向问卷，不重建游戏分支/第二 Record/另一份 live HANDOFF，不重新归档参考。不把 main merge 进 package/docs，不读取未授权 reference，不全量扫描 Plans/Skills，不把历史 turns 或 maxDeliberations 当有效轮数/实际发送预算。不要以旧长期 soak 替代新 profile 验证，不删真实个人数据、旧发布、历史文档；不从 Phase 3 自动推进 Phase 4/5。

## New-chat bootstrap prompt

继续 ZZZdragondYNGPHX/Atria 的 refactor/original-occult-western-fantasy-open-roleplay，只执行 Phase 4 真实 Native 前端。先核对远端 main/package/docs/原游戏任务与 refactor/open-roleplay-core refs 和工作树，读 docs:HANDOFF.md → plans/package/original-occult-western-fantasy-open-roleplay/index.md → Phase 4 指定模块 → 唯一 Record Phase 3 / 游戏 runtime/ROLEPLAY.md。游戏内容已完成于 2aa07d7adfdfd51552d82545d3457dd003fe6675；Core A/B/C 已完成于辅助分支 5f9e8feb0c7166b45e30c330104a7444beb7692e，main 仍 c8d2d0e0c11c283ade2fa3c730740a0dc480c746、未集成。使用精确 tested Core checkout，按 frontend/玩家体验/原参考与已实施公开接口实现新 Native 问答/阅读/输入/抽屉/保存/终局；替换默认 profile 的 neutral shell 编译接入。复用原任务分支、同一 Record/HANDOFF，不 merge main 到 package/docs，不重开方向讨论、不做 Phase 5 集成或提前发布。沿用用户更新约定：只在本地做 Phase 4 最小相关验证，不启动/等待远端 CI，推送后只确认 refs。记录真实 HEAD 与未测限制，更新同一交接、提交推送后停止。
