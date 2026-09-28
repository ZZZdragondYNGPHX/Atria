你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

Atria Native Content & Session Architecture Refactor

不要重新讨论产品设计，不要重做 N0–N9，不要创建新分支。

继续使用工作分支：

`refactor/atria-native-content-session-architecture`

N9 已正式完成并验证。

N9 validated HEAD：

`503fbb4da05c90a1e6d2022e17df0c6bac79b1ee`

最终验证：

- Workflow：Native Content Session Dev Checks #193
- Run：`35723060389`
- N0 Native Contracts：success
- N1 Storage + N3/N5 Core + N4 Projection：success
- N2 Package Project Composition：success
- N4 real-host Chromium Native Session acceptance：4 passed
- N5 Runtime State & Revision Lifecycle：success
- N6 Native Knowledge Runtime Integration：success
- N7 Native Context Architecture / Checkpoint C：success
- N8 Save System / Checkpoint B：success
- N9 Product UI unit/integration：6 suites / 22 tests passed
- N9 Native Product authority residual guard：success
- N9 source lint / guard syntax：success
- N9 real-host Chromium Product UI acceptance：1 passed
- full root lint：success
- complete Node regression：757 suites / 8802 tests passed
- frontend webpack build：success

现在正式进入：

N10 — Hard Cutover & Legacy Retirement

开始前重新 fetch 远端工作分支，以实际最新 HEAD 为准。如果其他会话已经继续推进，保留已有提交，不要回退到 validated HEAD。

依次重新读取：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`

第 5 个文件中的 **N10 — Hard Cutover & Legacy Retirement** 是冻结实施范围，不要重新设计 N0–N9。

N10 核心目标：

彻底清除 Active Native 产品流对历史格式、身份和旧 Authority 的残余依赖，使 Package / World / Knowledge / immutable Timeline / SessionRevision / bounded Context 成为端到端唯一 Native 产品 Authority。

必须处理：

- 移除 Native PNG / JSON / JSONL / CharX / BYAF 导出路径；
- 退休 Characters / Games 双重 Library Authority；
- 退休 CardApp 作为 Atria 产品身份；
- 退休 Native 以 `avatar_url` / `charDir` / `characterId` 作为身份；
- 从 Native 产品流退休 Manage Chat Files / Checkpoint Chat；
- 退休 `selected_world_info`、角色主/辅 lorebook、chat-lorebook、`charaFilename` 作为 Native 概念；
- 退休 world/book name 与 World Info numeric `uid` 作为 Native 身份；
- 退休 WorldInfoRepo / `worlds/<name>.json` 作为 Native Authority；
- 退休 Native committed Swipe / Variant-switch 语义；
- 退休 Native committed message Edit/Delete；
- 退休 Native floor/swipe structural-event Authority；
- 在 SessionRevision 已替代之处退休 FloorState Native Authority；
- 建立 residual guards，阻止旧 persistence/content/timeline Authority 再次回流。

边界：

- 不要把 N10 做成 SillyTavern generation/runtime 全量重写；
- 不要机械删除仍被 Adapter 使用的成熟 generation / World Info runtime ABI；
- 保留 R7 Shell 与现有 route authority；
- 不要建立第二套 Conversation、World、Memory、Save、Context 或 Storage Authority；
- 不要回退 N0–N9 的 immutable Timeline、Revision、Knowledge pinning、bounded Context、Save System 与 Product UI cutover；
- Active Native 产品路径不得重新 fallback 到 Character / JSONL / World Info 文件 Authority。

验证至少包括：

- Native authority residual scan/guard；
- 旧格式/旧身份/旧 Library authority 无法从 Active Native 产品流重新进入；
- committed Swipe/Edit/Delete/legacy Regenerate 不再成为 Native Authority；
- WorldInfoRepo / legacy book identity 不再成为 Native Authority；
- FloorState / structural-event residual 按冻结方案收口；
- N9 Works / World / Knowledge / Studio / Play / Save / Timeline 产品路径回归；
- N4 Write Barrier 与 real-host Native Session regression；
- R7 Shell desktop/mobile regression；
- relevant focused Node tests；
- full root lint；
- complete Node regression；
- frontend build；
- applicable real-host Chromium。

工作方式：

普通代码问题、测试失败、lint 失败、CI 普通失败请自行分析、修复、提交、推送并继续，不要停下来问我。

仅在以下情况停下：

- CI 已进入明显耗时的验证阶段；
- 下一步必须依赖 Android/Termux 真机日志；
- 下一步必须依赖真实 UI 截图；
- 需要我本人完成权限、Secret、账号授权等操作。

不要长时间轮询 CI。进入明显耗时验证阶段后，汇报当前 HEAD / Workflow / Run 并停止，等我告诉你“CI 已完成”后继续。

N10 完整 residual scan 与 phase validation 成功前，保持 `main` 不动。

N10 全部验证完成后，按照 Master Plan 的 final completion 顺序：

1. 更新永久 docs / handoff；
2. 创建或更新到 `main` 的最终 PR；
3. 验证要求的 CI；
4. 合并；
5. 验证 integrated `main`；
6. 确认成功后删除临时 refactor 分支。

不要提前删除长期工作分支，也不要在 N10 验证完成前合并 `main`。
