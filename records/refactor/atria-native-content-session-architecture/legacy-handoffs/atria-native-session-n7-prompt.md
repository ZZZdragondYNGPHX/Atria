你现在正式接手我的 GitHub 项目：

https://github.com/ZZZdragondYNGPHX/Atria

当前正在实施：

Atria Native Content & Session Architecture Refactor

不要重新讨论产品设计，不要重做 N0–N6，不要创建新分支，也不要合并 main。

工作分支继续使用：

"refactor/atria-native-content-session-architecture"

N6 已正式完成并验证。

N6 validated HEAD：

"b1043b2e0158cf4d5ade4d057570efe2a7af8ac1"

最终验证：

- Workflow：Native Content Session Dev Checks #118
- Run："35703649183"
- N0 Native Contracts：success
- N1 Storage + N3/N5 Core + N4 Projection：success
- N2 Package Project Composition：success
- N4 real-host Chromium Native Session acceptance：success
- N5 Runtime State & Revision Lifecycle：success
- N6 Knowledge Runtime / Checkpoint K：7 suites / 99 tests passed
- complete Node regression：749 suites / 8750 tests passed
- frontend build：success
- full root lint：success

现在正式进入：

N7 — Native Context Architecture

开始前重新读取远端工作分支，以实际最新 HEAD 为准。如果其他会话已经继续推进，不要回退。

依次读取：

1. "main:AGENTS.md"
2. "main:FORK_MAINTENANCE.md"
3. "docs:handoff/latest-handoff.md"
4. "docs:handoff/atria-native-content-session-architecture.md"
5. "docs:refactor/atria-native-content-session-architecture.md"
6. 当前工作分支上的 SessionCore / SessionRepo / Timeline / SessionRevision / KnowledgePlan / World State / Event Journal / Memory / Orchestrator / prompt assembly / token counting / context-window 相关实现与测试

以 Master Plan 的 N7 与 §21B 为实施依据，不要重新设计 N7。

N7 核心目标：

- 定义 ContextProvider / ContextItem contract；
- 实现 SessionContextCompiler；
- 实现结构化 ContextPlan；
- 建立唯一的模型总 token budget authority；
- 预算顺序为 model context limit → response reserve → safety/framing margin → Hard Reserve → Minimum Guarantees → Elastic Pool；
- existing subsystem budgets 只能成为 lane cap/input，不能各自独立保证导致总上下文溢出；
- Recent Raw Timeline 按完整 TurnGroup + token 预算选取，不能以固定楼层数为主规则；
- 实现 source-backed Narrative Spine：Scene → Chapter → Arc → Campaign；
- 实现 Active Commitments，保持稳定 identity、source provenance、open/closed/superseded 生命周期；
- 实现 deterministic Derivation Gate；
- 定义 TurnDigest / Turn Distiller compatibility contract；
- 默认普通回合不能强制额外 Memory + Commitment + Summary 多次 LLM 调用；
- 优先复用 Runtime / Orchestrator / Utility 已有结果；
- Memory 采用 cheap ingest，heavy consolidation 仅在冲突/阈值/scene-close/compaction 等条件触发；
- 所有 durable derived artifacts 必须记录 branch/revision/source coverage；
- derived coverage 落后时，必须保留未覆盖 Raw Timeline/Event，不允许因旧 summary 丢失历史；
- 支持通过 sourceRefs 精确回溯原始 Timeline；
- Economy / Balanced / Rich 只改变派生工作和预算策略，不改变 canonical Timeline/State/Event/Knowledge 语义；
- ContextPlan 必须记录 included/rejected reason、lane token usage、source refs、coverage/lag diagnostics；
- Narrator / Actor / Agent target isolation 必须继续成立；
- N6 KnowledgePlan 作为结构化 lane 接入，不允许退化成按正文反查 identity。

N7 必须保留 N0–N6 已验证约束：

- committed Timeline 永久 immutable；
- Context 是 derived projection，不能删除、改写或总结替代 canonical history；
- coherent SessionState / SessionRevision authority；
- exact Timeline-boundary Retry/Fork；
- Native lifecycle 使用 messageId / revisionId / branchId；
- current World State / Event Journal 高于 Knowledge；
- Knowledge authority 与 priority 分离；
- Memory 是 evidence/history，不得覆盖 current state；
- exact Knowledge revision pinning；
- stable Knowledge identity 到最终 prompt assembly；
- 不允许 JSONL、"/api/chats/*"、Character/World Info authority fallback；
- 不允许 floor/swipe 重新成为 Native authority。

N7 Checkpoint C 至少验证：

1. 固定模型预算下，synthetic 100 / 1,000 / 10,000+ turn Timeline 的最终 Context 仍有界；
2. 被排除的 raw history 仍可按稳定 ID/range 从 SessionRepo 精确读取；
3. recalled ancient facts 可沿 provenance/sourceRefs 回溯到原始 Timeline；
4. derived lag 时保留未覆盖 raw history/context，不丢历史；
5. ContextPlan 报告 included/rejected、原因、各 lane token、coverage；
6. Narrator / Actor / Agent visibility/isolation 成立；
7. Narrative Spine 是 source-backed + branch-scoped，不替代 canonical history；
8. Utility/derived-work 失败时 graceful degradation，不阻塞正常 Play。

本阶段不要进入：

- N8 Save System / ".atriasave"；
- N9 Product UI Cutover；
- N10 Hard Cutover / Legacy Retirement。

普通代码、测试和 CI 问题自行处理。只有以下情况主动停下告诉我：

1. GitHub CI 进入明显耗时验证；
2. 必须依赖 Android/Termux 真机日志；
3. 必须依赖真实 UI 截图；
4. 需要我本人完成权限、Secret 或授权操作。

不要自己一直等待长 CI。N7 完成后停下，更新 docs/handoff，记录 validated HEAD、CI、完成内容和剩余边界，并发我 N8 接手提示词。
