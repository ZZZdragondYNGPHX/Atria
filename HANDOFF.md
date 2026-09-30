# Live HANDOFF — Authority Transaction

- Task ID: feat/authority-transaction
- Primary Workspace: main
- Branch: feat/authority-transaction
- Stage: **C1 complete; stopped at stage boundary; ready for C2, which has not started**
- Current HEAD / local tested HEAD: 6b0402d6ce1579457f46e47968bd6a862283f176 (pushed)
- Tested tree: 3f843cfd2e312e7dbe7f24392db29c1c164e0281
- Actual remote main: c936b0aa4c42cf5711f40ae4a00f5fc3432813dc (unchanged; re-fetch on resume)
- Docs pre-stage / last fetched baseline: 523cb7190f23622e0b850823972a555cdfcd8197; use actual latest docs, not a historical SHA
- Plan entrypoint: plans/feat/authority-transaction.md
- Product routing entrypoint: plans/package/original-occult-western-fantasy-game/index.md
- Required stage design module: plans/package/original-occult-western-fantasy-game/technical-design.md, Rounds 9.5–9.8
- Record: records/feat/authority-transaction.md

## Completed C1

- Independent authority-transaction@1 capability vocabulary; strict optional authorityRuntime/presence consistency; action@2 unchanged.
- Bounded player/display observation View references and per-Package policy ceilings.
- Declarative Game Logic schemaVersion 3 Transaction/derived-publication declarations; preserves unversioned/v1/v2 commands, reducers, rules, interpretations and v2 mutation shorthand.
- Closed input/schema/intent/read/validator/Resolution/effect/clock/workflow/publication/receipt declarations, exact static authority references and private-read disclosure restrictions.
- No generic patches, namespace grants, executable JS/eval, dynamic domain/command names or ambient World/data/RNG formula roots.
- Bounded shared read/effect budgets include the whole derived hook. One record per explicit read grant; one acyclic derived layer with single ownership of each output domain. See Record for exact limits and rationale.
- Existing strict JSON helper reused by Lifecycle and Authority; no parallel persistence authority.
- Build/install and pinned browser/server logic loaders validate and retain v3 metadata.
- Added branch-targeted C1 contract/adjacent CI.

## Validation / CI

- Local: 19 suites / 839 tests passed. FS/SQLite runtime coverage; MySQL/PostgreSQL explicitly excluded using existing harness flags because local services were unavailable.
- Earlier database-enabled attempt had 200 connection-refused failures; not counted as passing. Details retained in Record.
- All 14 touched/new JS files passed ESLint; diff checks and CI YAML parsing passed.
- Remote CI run 36678740285 on exact HEAD above: **SUCCESS, 16 suites / 1030 tests passed**, FS/SQLite/MySQL/PostgreSQL plus lint. https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/36678740285
- No full suite, real browser UI, provider, Android or device claim.

## Important staging safety

C1 registers capability version [1] but deliberately leaves Host supported versions []: required Packages may be stored/inspected but cannot activate; optional metadata does not execute Transactions. Do not pretend C1 implements the capability's execution semantics. Keep this fail-closed until the later engine/Turn integration gates justify enabling support.

Expressions are parsed and statically typed, not evaluated here. C2 must validate all computed values against exact target schemas and UTF-8 ceilings, enforce limits on expanded World rules/Lifecycle/workflow/clock-triggered work, and avoid any partial publication. Receipt templates expose only explicit input/public Resolution fields, not private records; derived outputs are authored declassification, not new Truth.

## Not done / next objective

Only next stage is C2 — Private candidate authority engine:

1. Bounded player-safe intent observation and granted private reads.
2. Validation, deterministic/bounded Resolution and stable anchored transaction/RNG identity.
3. Prepare World Events, multiple typed Lifecycle App Commands and canonical clock effects in one private candidate using existing authorities.
4. Prepare the bounded derived-publication hook and safe Turn-local receipt.
5. Direct tests for complete private candidate composition, fail-closed validation and zero partial publication/private-read disclosure.

Do not implement C3 Narrator/Turn finalization or Frontend invocation yet. C4 integration/merge remains later. Package implementation is blocked; no temporary Package workaround. main has not been merged or changed; task branch retained.

## Before resuming / do not repeat

Fetch all remotes and inspect real main/docs/task refs and dirty state. Read main:AGENTS.md, docs:README.md, this HANDOFF, the Core Plan, product Plan index, relevant technical-design rounds and the same Record. Use existing task branch, not the old audit SHA as a reset target. Do not repeat C1 or broaden to unrelated Package/world content, reference branches or the separate MCP task. Exact representative declaration is main:tests/native/helpers/authority-fixture.js on the task branch.

The previous live HANDOFF belonged to plugin/atria-mcp-capability-expansion. That task remains acceptance-open and unchanged; restore its context from records/plugin/atria-mcp-capability-expansion.md and the former HANDOFF at docs@523cb7190f23622e0b850823972a555cdfcd8197 if explicitly resuming it. There is still only this one live HANDOFF.

## C2 copyable resume prompt

继续 ZZZdragondYNGPHX/Atria 的 Core 前置任务 feat/authority-transaction，Primary Workspace main，任务分支 feat/authority-transaction。只执行 C2 — Private candidate authority engine，不开始 C3，不开发 package/original-occult-western-fantasy-game，不做 Package workaround。

开始前 fetch 全部远端并核对真实 main/docs/任务分支及 dirty state；读取 main:AGENTS.md、docs:README.md、唯一 docs:HANDOFF.md、docs:plans/feat/authority-transaction.md、docs:plans/package/original-occult-western-fantasy-game/index.md、technical-design.md 的 Round 9.5–9.8，以及同一 docs:records/feat/authority-transaction.md。以真实 Git 为准，不重置到历史审计 SHA，不重做 C1。

C1 已提交并推送：6b0402d6ce1579457f46e47968bd6a862283f176；本地 tested HEAD 相同，19 suites / 839 tests 通过；同一 HEAD 的四引擎 CI 16 suites / 1030 tests 及 lint 通过。C1 只提供严格契约和声明编译，authority-transaction@1 暂未标记 Host 执行支持。

C2 复用既有 World reducers、prepareLifecycle()、clock validation、deterministic RNG 与 Session authority，实现 player-safe observation、private read-grant resolution、validators、稳定 anchored transaction/RNG identity、World + 多个 Lifecycle domain + clock 的私有 candidate preparation、bounded derived-publication hook 和 safe receipt projection。对 computed values、实际展开 effects/read work、UTF-8 receipt/observation 大小执行原有或更严格硬上限。任何失败必须零部分发布，private reads 不得进入 resolver/Narrator receipt。不得创建平行 authority、放宽 Native 安全边界或提前接入 Narrator/Frontend。

C2 通过 direct candidate tests 和适当相邻回归后 commit/push 同一任务分支，追加更新同一 Record，刷新唯一 HANDOFF（当前 HEAD、tested HEAD、验证、完成/未完成及 C3 目标），给出 C3 可复制接手提示词，然后停止。
