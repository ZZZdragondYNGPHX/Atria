# Live HANDOFF — Authority Transaction

- Task ID: feat/authority-transaction
- Primary Workspace: main
- Branch: feat/authority-transaction
- Stage: **C2 complete; stopped at stage boundary; ready for C3, which has not started**
- Current HEAD / local and remote tested HEAD: f0113115138249a437d39ccdd8d6e4a46951d31c (pushed)
- Exact tested tree: b28691562e118fe374f2a3e2a5a07f6ef3a6a0ec
- Latest fetched origin/main: 2a1cba78a428137ccded7647ce6dadd79a3ac60c. It advanced concurrently only in AGENTS.md; stage-start main was c936b0aa4c42cf5711f40ae4a00f5fc3432813dc. This task did not change main or reset/rebase its tested commit.
- Latest fetched docs before this handoff: ba2d4cdf4db3dce44cec0225bd94dd3edfbdbe60; docs was fast-forwarded, preserving concurrent Governance/Skill-routing changes.
- Plan entrypoint: plans/feat/authority-transaction.md
- Product routing entrypoint: plans/package/original-occult-western-fantasy-game/index.md
- Required stage design module: plans/package/original-occult-western-fantasy-game/technical-design.md, Rounds 9.5–9.8
- Record: records/feat/authority-transaction.md

## Completed C1/C2

- C1 independent capability/runtime contract and strict bounded Game Logic v3 declarations remain intact; unversioned/v1/v2 and old Packages are supported.
- C2 internal private preparation API: buildAuthorityObservation(base), prepareAuthorityTransaction(base, installed, request), prepareAuthorityPublications(base, installed), in src/native/authority-transaction.js.
- Closed request/anchor/pinned Package validation; explicit private reads; validators; deterministic/Fortune Resolution; stable identity; separate canonical inputHash.
- World reducers/rules, multiple Lifecycle domains, canonical clock, workflow and bounded due work compose inside a deeply immutable private candidate. No repository publication or provider execution.
- One whole bounded derived layer refreshes before safe receipt creation; ordinary Lifecycle/background candidates can call the standalone hook without a fake player Transaction. Runtime publication wiring remains C3.
- Exact computed schemas, strict finite JSON, aggregate expanded-effect/read/rule/step/UTF-8 limits, immutable player-only observation/receipt, sanitized errors. Detailed ceilings and choices are in the Record.
- Real Session tests prove successful and failed preparation never mutate persistent World/Lifecycle/clock/journal/Timeline state; same-anchor reload produces the same candidate.

## Validation / CI

- Final local matrix on the exact tree above: **28 suites / 947 tests passed**, including 3 C2 suites / 78 tests. FS/SQLite; unavailable local MySQL/PostgreSQL explicitly excluded via existing harness flags.
- All 10 touched/new JS files passed ESLint; workflow YAML and diff checks passed.
- Four-engine CI run 36681134406 on exact HEAD above: **SUCCESS — 28 suites / 1153 tests passed**, FS/SQLite/MySQL/PostgreSQL plus lint. https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36681134406
- Intermediate aggregate-byte fixture error is retained in the Record; fixed without weakening the budget.
- No full-suite, real UI/browser, provider, Android/device or save-container round-trip claim.

## Security / staging constraints

Host capability supported versions remain []: execution plus Turn publication semantics are not complete. Do not advertise support early. C2 APIs are not public endpoints. The complete result/candidate/work/inputHash is private Host data; only explicitly safe receipt/projections may enter Narrator input. Lifecycle-bearing Transactions require Ready; World-only declarations do not invent that requirement.

RNG identity excludes regenerated input and all provider timing/prose. inputHash is separate: C3 must pin the chosen Transaction/input and implement conflict/idempotency rules, not silently reroll or accept changed input at the same anchored identity. Candidate revision/Timeline stay at the original anchor; logical-time advancement, receipts and assistant Variant remain owned by the final Session CAS. Do not dispatch private candidate outbox entries.

## Not done / next objective

Only next stage is **C3 — Turn and Frontend integration**:

1. Safe resolver catalog and free-text selection; fixed typed Frontend binding using the same declared Transaction.
2. Narrator context projected from the frozen candidate + safe receipt; no mechanical authority for Narrator.
3. Single existing Session CAS finalization of prepared authority, Action receipt and assistant Turn; every final/provider failure publishes nothing.
4. Stable identity/inputHash, stale revision/idempotency conflicts, provider retry and Branch Retry/Fortune tests.
5. Same derived-publication hook before affected ordinary Lifecycle/background publications; preserve aggregate limits.
6. Appropriate adjacent regressions, commit/push, append this same Record, replace this unique HANDOFF with C4 target/prompt, stop.

C4 integration/merge/cleanup is later. Package P1 remains blocked. No Package game content or workaround is authorized. Task branch is retained, not merged/deleted.

## Before resuming / do not repeat

Fetch and inspect actual refs/dirty state; HANDOFF → Core Plan → Record, plus latest main:AGENTS.md / docs:README.md and product Plan index → required technical-design rounds. Do not reset to historical audit/C1/C2 SHAs or redo completed stages. Do not scan reference branches or unrelated Package/Skill content. The updated main/Governance prefer installed local Skills if a later task requires them; no Skill was needed for this C2 engine stage.

The earlier HANDOFF belonged to plugin/atria-mcp-capability-expansion. Its permanent recovery entry remains records/plugin/atria-mcp-capability-expansion.md and the old HANDOFF at docs@523cb7190f23622e0b850823972a555cdfcd8197. It remains unchanged/acceptance-open; this task does not complete it. There is only this one live HANDOFF.

## C3 copyable resume prompt

接手 ZZZdragondYNGPHX/Atria 的 feat/authority-transaction，Primary Workspace main，继续同名任务分支。只执行 C3 — Turn and Frontend integration，不开始 C4，不开发 package/original-occult-western-fantasy-game，不做 Package workaround。

先 fetch 全部远端并核对真实 main/docs/任务分支及 dirty state；读取最新 main:AGENTS.md、docs:README.md、唯一 docs:HANDOFF.md、docs:plans/feat/authority-transaction.md、同一 Record；先读 Package Plan index.md，再读 technical-design.md Round 9.5–9.8。C2 HEAD / tested HEAD 为 f0113115138249a437d39ccdd8d6e4a46951d31c；本地 28 suites / 947 tests，同 HEAD 四引擎 CI 28 suites / 1153 tests 和 lint 均通过。以实际 Git 为准，不重置到旧 SHA，不重做 C1/C2。C2 结束时 main 已因无关 AGENTS.md 更新前进到 2a1cba78a428137ccded7647ce6dadd79a3ac60c；任务分支未合并 main。

复用 src/native/authority-transaction.js 的 buildAuthorityObservation、prepareAuthorityTransaction、prepareAuthorityPublications。实现安全 resolver catalog/free-text selection 与固定 Native Frontend typed invocation 走同一 Transaction authority；从冻结候选构建受限 Narrator context，并传入 safe receipt，不把原始 candidate/private reads 整体送入模型。Narrator 不得改变机械结果；仅在成功后通过既有 Session authority 单次 CAS 提交 authority + Action receipt + assistant Turn。任何 provider/fallback/finalization 失败必须零发布；候选 outbox 在 final commit 前不得运行。

完善稳定 anchored identity/inputHash 的 idempotency/conflict/stale-revision 检查和 retry/Fortune/Branch Retry 语义；输入重生成不得重置同一 anchored action 的 RNG。把同一 bounded derived-publication hook 接入受影响的普通 Lifecycle/background publication，不能另建 authority 或要求后台伪装成玩家 Transaction。保留 C2 展开工作量、计算值 schema/UTF-8 硬上限与 Ready Barrier。Host capability 支持仅在完整执行/Turn gate 就绪后再宣告。

完成 targeted tests 和适当相邻回归、commit/push 同一分支、追加同一 Record、刷新唯一 HANDOFF（HEAD/tested HEAD/验证/C4 目标），提供 C4 接手提示词，然后停止。不提前执行 C4 merge/cleanup。
