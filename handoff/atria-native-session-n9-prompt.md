你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

Atria Native Content & Session Architecture Refactor

不要重新讨论产品设计，不要重做 N0–N8，不要创建新分支，也不要合并 main。

工作分支继续使用：

`refactor/atria-native-content-session-architecture`

N8 已正式完成并验证。

N8 validated HEAD：

`f6f629800f8dae2da5c9870f6c0d6965920ea960`

最终验证：

- Workflow：Native Content Session Dev Checks #136
- Run：`35715208736`
- N0 Native Contracts：success
- N1 Storage + N3/N5 Core + N4 Projection：success
- N2 Package Project Composition：success
- N4 real-host Chromium Native Session acceptance：4 passed
- N5 Runtime State & Revision Lifecycle：success
- N6 Native Knowledge Runtime Integration：success
- N7 Native Context Architecture / Checkpoint C：success
- N8 Save System / Checkpoint B：5 suites / 53 tests passed
- complete Node regression：753 suites / 8791 tests passed
- frontend build：success
- full root lint：success

Checkpoint B 已满足：

Native Session 可以运行 → 退出/重启 → save → load → export `.atriasave` → clean-store re-import，并保持 World / Knowledge / Memory / Orchestrator / Narrative / Commitment / Branch 一致性。

现在正式进入：

N9 — Product UI Cutover

开始前先重新 fetch 工作分支，以实际最新 HEAD 为准；如果其他会话已经继续推进，保留所有已有提交，不要回退到 validated HEAD。

依次重新读取：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`

N9 按 Master Plan 直接实施，不重新设计。

核心目标：

把产品层的 Library / Studio / Play 管理界面正式切到 Native authorities。

Library 目标结构：

```text
Library
├─ 作品
├─ 世界与知识
│  ├─ 世界
│  └─ 知识库
└─ 技能
```

N9 至少实现：

- Works Library
- World Library
- KnowledgeBase Library
- World detail / revision history
- KnowledgeBase detail / Entries / Bindings / references / revision history
- work detail
- EntryPoint start flow
- Continue
- My Games
- Save / Load
- Timeline
- Studio Projects
- Project World / Knowledge dependency management
- install/update preflight
- Package / Session delete semantics
- missing Package dependency UI
- imported embedded Knowledge 的显式 “Save to my Library” UI seam
- ContextPlan / Context diagnostics 的可查看入口

Native Play 操作改为：

- Retry Reply
- Re-enter Turn
- Restart From Here
- Save
- Quick Save
- Load
- Timeline

Native 产品界面应隐藏/退休：

- Swipe arrows / counter / picker
- Swipe deletion
- committed floor Edit
- committed floor Delete
- traditional in-place Regenerate

明确边界：

- 保留 R7 Shell 和现有 route authority。
- 现有 `#WorldInfo` controller 可作为过渡/editor adapter，但不能继续作为 Native Library authority。
- 不破坏 N0–N8 的 Package / Session / immutable Timeline / Revision / Knowledge pinning / bounded Context / Save authority。
- Save/Load UI 必须调用 N8 Native Save System，不重新造第二套存档。
- Library/Studio/Play 不得回退到 Character / JSONL / World Info 文件作为 Native authority。
- 不进入 N10 Hard Cutover / Legacy Retirement。
- 不机械删除仍被 runtime compatibility adapter 使用的 SillyTavern 成熟生成/World Info ABI。
- 不合并 main。

验证至少覆盖：

- Native Works / World / Knowledge Library 路由与 CRUD/read-only revision surfaces
- EntryPoint start / Continue / My Games
- Save / Quick Save / Load / historical derived-Branch behavior
- Timeline / Retry Reply / Re-enter Turn / Restart From Here
- Studio Project 与 World/Knowledge dependency selection
- Package install/update preflight 和 missing-dependency UX
- explicit Save-to-my-Library promotion
- Native UI 不再暴露 Swipe / committed Edit/Delete / in-place Regenerate
- R7 Shell 路由与桌面/移动端关键布局回归
- Native authority residual/fallback checks
- relevant Node regression
- frontend build
- full root lint
- 适用的 real-host Chromium acceptance

普通代码、测试、CI 问题自行诊断修复并继续推进。

只有以下情况停下等我：

1. CI 进入明显长时间验证；
2. 必须依赖 Android / Termux 真机日志；
3. 必须依赖真实 UI 截图；
4. 需要权限、Secrets 或外部账号授权。

N9 完成并验证后停止，不要直接进入 N10。

届时更新 docs / handoff，记录：

- N9 validated HEAD
- CI workflow / run
- 完成内容与边界
- Product UI Cutover 验证
- 下一阶段 N10 目标

最后发我一段新的 N10 接手提示词。
