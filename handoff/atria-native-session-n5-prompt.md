# N5 implementation takeover prompt

你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

**Atria Native Content & Session Architecture Refactor**

不要重新讨论产品设计，不要重做 N0–N4，不要创建新分支，也不要合并 main。

工作分支继续使用：

`refactor/atria-native-content-session-architecture`

N4 已正式完成并验证。

N4 validated HEAD：

`ec95a260f4a26a4c23091227f77865dba1ae2273`

最终验证：

- Workflow：**Native Content Session Dev Checks #87**
- Run：`35693455407`
- N0 Native Contracts：success
- N2 Package Project Composition：success
- N1 Storage + N3 Core + N4 Projection：success
- N4 real-host Chromium Native Session acceptance：success
- complete Node regression：**748 suites / 8705 tests passed**
- frontend build：success
- full root lint：success

现在正式进入：

**N5 — Native Runtime State & Revision Lifecycle**

开始前重新读取远端工作分支，以实际最新 HEAD 为准。如果其他会话已经继续推进，不要回退。

依次读取：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`
6. 当前工作分支上的 N3/N4 Native Session、projection/runtime、Game Runtime、Memory、Orchestrator、Search、Variables/Event 相关实现与测试

以 Master Plan 的 N5 章节为实施依据，不要重新设计 N5。

N5 核心目标：

- 将 Atria 自有的持久运行时状态迁入 coherent SessionState / SessionRevision；
- 覆盖 Game World + Event Journal、Memory canonical/durable state、Orchestrator、Search、Native 适用的 Variables/op-log、package-owned durable state；
- Native 生命周期以稳定的 `messageId`、`revisionId`、`branchId` 为锚点；
- 建立/统一 `TIMELINE_APPENDED`、`REVISION_COMMITTED`、`REVISION_RESTORED`、`BRANCH_ACTIVATED`、`SESSION_LOADED`、`DRAFT_ABORTED` 等 Native lifecycle；
- Native authority 不再把 floor、swipeId、`MESSAGE_EDITED`、`MESSAGE_DELETED`、`MESSAGE_SWIPED` 当作权威生命周期依据；
- Legacy/ST session 可以继续保留 FloorState 和旧结构事件兼容；
- 需要保留的旧 public API 名称可以做 compatibility wrapper，但 Native Session 激活时必须落到 Native revision/state semantics。

必须保持 N4 已验证约束：

- committed Timeline immutable；
- product/runtime Timeline 写入 append-only；
- Write Barrier fail-closed；
- Continue 是新 TimelineEntry；
- Retry Reply 是 post-user Revision Fork + 新 Assistant；
- Stop 只处理 Generation Draft；
- 不允许 JSONL/`/api/chats/*`、Character/World Info authority fallback；
- 不允许通过直接 `chat[]` 改写绕过 Native authority。

N5 Exit：

> append / fork / restore / reload 必须让 Timeline 与所有 authoritative Native state 保持 coherent，且不依赖 committed-message mutation 或 swipe-based rollback semantics。

本阶段不要进入：

- N6 Knowledge Runtime / KnowledgeCompiler；
- N7 Context Architecture / SessionContextCompiler；
- N8 Save System / `.atriasave`；
- N9 Product UI Cutover；
- N10 Hard Cutover / Legacy Retirement。

普通代码、测试和 CI 问题自行处理。只有以下情况主动停下告诉我：

1. GitHub CI 进入明显耗时验证；
2. 必须依赖 Android/Termux 真机日志；
3. 必须依赖真实 UI 截图；
4. 需要我本人完成权限、Secret 或授权操作。

不要自己一直等待长 CI。N5 完成后停下，更新 docs/handoff，记录 validated HEAD、CI、完成内容和剩余边界，并发我 N6 接手提示词。
