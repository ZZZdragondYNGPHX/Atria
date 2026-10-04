# 当前任务交接

## Task

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Current game branch: refactor/original-occult-western-fantasy-open-roleplay
- Current game implementation HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75（Phase 1/2 未改资产）
- Base / stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Core auxiliary branch: refactor/open-roleplay-core
- Core tested / pushed HEAD: 5f9e8feb0c7166b45e30c330104a7444beb7692e
- Core base / unchanged main HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Core integration: pending；按分阶段交付保留辅助分支，尚未合入 main。验收仅本地最小相关验证，远端仅发布。
- Current stage: Phase 2 complete; Phase 3 pending
- Plan entrypoint: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Record: records/package/original-occult-western-fantasy-open-roleplay.md（唯一，保留 Phase 0/1，新增 Phase 2）
- docs HEAD: 以实际远端 docs ref 为准，不嵌入本文件自身 hash。
- Phase 3 required modules: player-experience.md、world-supernatural.md、runtime-contracts.md 的已实施接口、implementation-staging.md；verification.md 的游戏与对应风险部分。冻结决定只在方向敏感时按需读，不重开讨论。

## Completed

Phase 0 参考与企划、Phase 1 源码核对与设计保留。Phase 2 在 main 派生辅助 Core 分支完成 A/B/C：零发送、多 domain/开篇/模式一次 CAS 的幂等 begin；跨进程固定选择/抽样与持久 send quota；宿主不可回退模式、当前 HEAD resume closure、权威死亡墓碑与中断可恢复隔离清理。没有修改游戏、真实产品前端、旧发布或个人存档。

实际能力为 required story-start@1 / generation-budget@1 / run-policy@1，并要求 required authority-transaction@1。调用入口/closed schema/预算/容器在 runtime-contracts 的 Phase 2 节为单一接口说明。普通保存仍 schema 1，铁人 schema 2 / scope resume，外层容器 version 1；初版 runPolicy 不与 continuity/shared realm 组合。

## 最新工作约定（用户 2026-10-04 更新）

用户最新 AGENTS.md 指令替代此前提供的 AGENTS.md 指令：**每阶段及任务完成时，只在本地执行最小相关验证。** 推送后核对 refs 仅为发布确认，不属于项目验证；不启动、等待或依赖远端 CI/GitHub Actions。后续对话沿用本条最新约定。

## Validation

最终 tested Core 上 23 个相关 Jest 套件、390 项全部通过；新增 70 项包含 FS/SQLite、独立 Node 子进程恢复、实际 adapter→回环合成 HTTP 发送计数、后台 retry/window/period/restore、Core/repo/HTTP/编译 Native bridge 铁人封锁、closure 与 spent-ledger portability、stale/伪造死亡、终局/保存/导出并发、Task 取消、无关局保护和各提交/清理中断点。全部 23 个变更 JS 文件 ESLint 无错误/警告，git diff 空白检查通过。准确命令与覆盖见唯一 Record Phase 2。

Node v22.23.3 与锁定 Core/tests 依赖已准备，运行包 SHA-256 校验、SQLite 原生依赖构建完成。复现需 Node 在 PATH，禁用尚未启动的 MySQL/PostgreSQL harness。未运行这两套 DB、远端 CI、生产模型、新游戏工具/profile、全仓构建、浏览器、Android 或真实 UI；不能把 Native bridge 单元集成当页面验收。

## Pending

只等待明确继续 Phase 3 游戏内容。沿用原游戏任务分支，以本 HANDOFF 精确 tested Core checkout 编译/验证新 profile；不要使用未集成旧 main 冒充新能力。Core 主线集成按后续阶段安排，不在本阶段自动推进；额外数据库验证只按实际风险在本地决定，不默认扩张阶段验收。真实前端在 Phase 4，新版本与最终集成在 Phase 5。

## Key decisions

D01–D14 的已确认方向仍以 decisions 为跨模块权威。自然语言一次裁定一个行动，模型没有 patch 权威，candidate 未提交；问答组合/生活原语/两机构及非法路径/8 个稳定动态槽/有效轮数及 hot/warm/cold 策略由 Package 实现。首版不要求 Second Death、固定核验职业、长生或千回合。

铁人用宿主 sessionId 标识 run，选择在 begin 时冻结，不能靠隐藏按钮实现。权威死亡 HEAD 先封锁，再墓碑、取消该局工作/epoch、清理该局保存；中断由 runStatus / HTTP /run 恢复，别的局与安装资产受保护。普通保留明确恢复；未知发送已扣额，生成失败不算死亡。清理后的旧请求读取终局，不重建该局。

## Read first

1. 真实远端 main/package/docs/两个任务 refs、工作树 dirty 与相应 AGENTS。
2. docs:HANDOFF.md → 本 Plan index。
3. index 指定的 Phase 3 模块，特别是 runtime-contracts 的 Phase 2 实际接口。
4. 唯一 Record Phase 2 的 tested HEAD / 命令 / 限制；Phase 0/1 仅按需读历史。
5. 直接相关 Package 默认 compiler、data/runtime 与局部检查；治理敏感操作才读完整 docs:README.md。

## Do not repeat

不重开用户方向问卷，不重建游戏分支/第二 Record/另一份 live HANDOFF，不重新归档参考。不把 main merge 进 package/docs，不读取未授权 reference，不全量扫描 Plans/Skills，不把历史 turns 或 maxDeliberations 当有效轮数/实际发送预算。不要以旧长期 soak 替代新 profile 验证，不删真实个人数据、旧发布、历史文档；不从 Phase 2 自动推进 Phase 3/4。

## New-chat bootstrap prompt

继续 ZZZdragondYNGPHX/Atria 的 refactor/original-occult-western-fantasy-open-roleplay，只执行 Phase 3 游戏内容。先核对远端 main/package/docs/原游戏任务与 refactor/open-roleplay-core refs 和工作树，读 docs:HANDOFF.md → plans/package/original-occult-western-fantasy-open-roleplay/index.md → Phase 3 指定模块 → 唯一 Record Phase 2。游戏分支仍 d7be6f1abff4d9d756f2dfa24c5492104e72aa75，从 package 派生；Core A/B/C 已完成于辅助分支 5f9e8feb0c7166b45e30c330104a7444beb7692e，main 仍 c8d2d0e0c11c283ade2fa3c730740a0dc480c746、未集成。使用精确 tested Core checkout，读取 runtime-contracts Phase 2 的 required 能力/开始/发送额度/模式/resume/终局接口，按冻结方向做新默认 compiler/profile、开局组合、生活原语、机构与非法路径及有界动态内容。复用原任务分支、同一 Record/HANDOFF，不 merge main 到 package/docs，不重开方向讨论、不做 Phase 4 前端或提前发布。沿用用户更新约定：只在本地做 Phase 3 最小相关验证，不启动/等待远端 CI，推送后只确认 refs。记录真实 HEAD 与未测限制，更新同一交接、提交推送后停止。
