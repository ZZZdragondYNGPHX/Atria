你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

Atria Native Content & Session Architecture Refactor

不要重新讨论产品设计，不要重做 N0–N5，不要创建新分支，也不要合并 main。

工作分支继续使用：

"refactor/atria-native-content-session-architecture"

N5 已正式完成并验证。

N5 validated HEAD：

"70f59bf2894c77defa46d75e48c79485a4bc5d74"

最终验证：

- Workflow：Native Content Session Dev Checks #107
- Run："35700429886"
- N0 Native Contracts：success
- N1 Storage + N3/N5 Core + N4 Projection：success
- N2 Package Project Composition：success
- N5 Runtime State & Revision Lifecycle：15 suites / 307 tests passed
- real-host Chromium Native Session acceptance：success
- complete Node regression：748 suites / 8734 tests passed
- frontend build：success
- full root lint：success

现在正式进入：

N6 — Native Knowledge Runtime Integration

开始前重新读取远端工作分支，以实际最新 HEAD 为准。如果其他会话已经继续推进，不要回退。

依次读取：

1. "main:AGENTS.md"
2. "main:FORK_MAINTENANCE.md"
3. "docs:handoff/latest-handoff.md"
4. "docs:handoff/atria-native-content-session-architecture.md"
5. "docs:refactor/atria-native-content-session-architecture.md"
6. 当前工作分支上的 Native Knowledge / SessionKnowledge / World Info / Memory / Game World / Event Journal / Orchestrator / SessionState / prompt-selection 相关实现与测试

以 Master Plan 的 N6 章节为实施依据，不要重新设计 N6。

N6 核心目标：

- 实现 KnowledgeBinding 的 Package / EntryPoint / Library policy / Session-local resolution；
- 保持 exact revision pinning；
- 实现 KnowledgeCompiler 与 target-aware KnowledgePlan；
- 建立 authority-vs-priority 规则；
- current Session State / Event Journal 优先于过时 Knowledge；
- Package / World canonical Knowledge 是 canonical content authority；
- Library/Session augment 不得静默覆盖 Package canon；
- explicit Knowledge override 只能覆盖普通 Knowledge，不能覆盖 deterministic Runtime mechanics/current state；
- Memory 作为 evidence/history，不能覆盖 current state；
- stable Knowledge identity 必须保留到最终 prompt assembly；
- 支持 required dependencies / related entries / exclusive groups；
- target visibility 必须产生 Narrator / Actor / Agent 的不同视图；
- 接入现有 World Info selection/prompt machinery，但不要重新实现所有 keyword/regex/vector/probability/recursion/sticky/cooldown/delay 语义；
- 提供 deterministic included/rejected diagnostics。

N6 Checkpoint K 至少验证：

1. Package canonical Knowledge 到达目标 Context；
2. current Session State 在条件确定冲突时压制 stale canonical content；
3. Library augment 不能静默覆盖 Package canon；
4. explicit override 可覆盖普通 Knowledge，但不能覆盖 Runtime mechanics/current state；
5. old Memory evidence 不能覆盖 current state；
6. 相同正文但不同 Knowledge ID/source 仍保持可区分；
7. visibility 对不同 target 产生不同视图；
8. Session 固定在 Library Knowledge rev N，Library 升到 N+1 后不会自动漂移，除非显式升级。

必须保持 N5 已验证约束：

- coherent SessionState / SessionRevision authority；
- committed Timeline immutable；
- append-only Native Timeline writes；
- exact Timeline-boundary Retry/Fork；
- Stop 不提交 Draft-local state；
- Native lifecycle 使用 messageId / revisionId / branchId；
- Game/Memory/Orchestrator/Search/Variables 不回退到 floor/swipe authority；
- 不允许 JSONL、"/api/chats/*"、Character/World Info authority fallback；
- 不允许直接 "chat[]" 改写绕过 Native authority。

本阶段不要进入：

- N7 Native Context Architecture；
- N8 Save System / ".atriasave"；
- N9 Product UI Cutover；
- N10 Hard Cutover / Legacy Retirement。

普通代码、测试和 CI 问题自行处理。只有以下情况主动停下告诉我：

1. GitHub CI 进入明显耗时验证；
2. 必须依赖 Android/Termux 真机日志；
3. 必须依赖真实 UI 截图；
4. 需要我本人完成权限、Secret 或授权操作。

不要自己一直等待长 CI。N6 完成后停下，更新 docs/handoff，记录 validated HEAD、CI、完成内容和剩余边界，并发我 N7 接手提示词。
