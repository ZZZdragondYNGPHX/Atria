你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

Atria Native Content & Session Architecture Refactor

不要重新讨论产品设计，不要重做 N0–N7，不要创建新分支，也不要合并 main。

工作分支继续使用：

`refactor/atria-native-content-session-architecture`

N7 已正式完成并验证。

N7 validated HEAD：

`8fa25d1175603da905a45b9de7b8de5a8d4b776f`

最终验证：

- Workflow：Native Content Session Dev Checks #121
- Run：`35711043211`
- N0 Native Contracts：success
- N1 Storage + N3/N5 Core + N4 Projection：success
- N2 Package Project Composition：success
- N4 real-host Chromium Native Session acceptance：4 passed
- N5 Runtime State & Revision Lifecycle：success
- N6 Native Knowledge Runtime Integration：success
- N7 Checkpoint C：6 suites / 53 tests passed
- complete Node regression：752 suites / 8777 tests passed
- frontend build：success
- full root lint：success

现在正式进入：

N8 — Save System & `.atriasave`

开始前先重新 fetch 工作分支，以实际最新 HEAD 为准；如果其他会话已经继续推进，保留所有已有提交，不要回退到 validated HEAD。

依次重新读取：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:handoff/atria-native-content-session-architecture.md`
5. `docs:refactor/atria-native-content-session-architecture.md`

N8 按 Master Plan 直接实施，不重新设计。

核心范围：

- Auto Save
- Quick Save
- Manual Save
- revision-backed SavePoint semantics
- snapshot closure export
- full-session export
- engine-independent logical state serialization
- import / restore
- Package dependency resolution
- resolved KnowledgeBindingSet persistence
- Session-local Knowledge export/import
- Session 依赖的 Library Knowledge revision snapshots
- durable Narrative Spine
- Active Commitments
- durable derived coverage / provenance
- imported Library snapshots 默认恢复为 Session-bound embedded Knowledge，不静默污染目标 Library
- 可选的显式 “save to my Library” promotion seam
- optional password-protected AEAD mode
- missing-dependency UX contract

明确边界：

- 不保存可重建的 embeddings / rerank indexes / token caches / ContextPlan caches / render caches。
- Auto Save 只指向稳定 authoritative SessionRevision，不等待异步 Narrative/Memory consolidation。
- 历史 Save load 必须非破坏性；继续游戏时创建/激活派生 Branch，不能覆盖到达当前 HEAD 的原路线。
- 保持 N7 的 immutable Timeline、Context boundedness、sourceRefs/provenance、Knowledge revision pinning 和 stale-safe derived publication。
- 不进入 N9 Product UI Cutover。
- 不进入 N10 Hard Cutover / Legacy Retirement。
- 不合并 main。

N8 最终必须满足 Checkpoint B：

Native Session 可以运行 → 退出 → 重启 → save → load → export `.atriasave` → re-import，并保持 World / Knowledge / Memory / Orchestrator / Narrative / Commitment / Branch 一致性。

测试至少覆盖：

- Auto / Quick / Manual SavePoint；
- historical save → derived branch；
- snapshot/full-session export；
- clean-store import；
- exact Package / Knowledge dependency closure；
- Session-local / embedded Knowledge；
- Narrative / Commitment / derived coverage round-trip；
- Memory / Orchestrator authoritative state round-trip；
- optional AEAD 正确密码、错误密码、篡改失败关闭；
- missing dependency fail-closed / structured diagnostics；
- FS / SQLite 及现有适用的存储回归；
- no JSONL / Character / World Info authority fallback；
- complete relevant Node regression、frontend build、full root lint。

普通代码/测试/CI 问题你自行处理并继续推进。

只有以下情况停下等我：

1. CI 进入明显的长时间验证；
2. 需要 Android / Termux 真机日志；
3. 需要真实 UI 截图；
4. 需要权限、Secrets 或外部授权。

N8 完成并验证后停止，不要直接进入 N9。

届时更新 docs / handoff，记录：

- N8 validated HEAD
- CI workflow / run
- 完成内容与边界
- Checkpoint B 验证
- 下一阶段 N9 目标

并发我一段新的 N9 接手提示词。
