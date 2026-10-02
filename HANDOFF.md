# HANDOFF

## Task

- Task ID: `refactor/original-occult-western-fantasy-long-lived-world`
- Primary Workspace: Package
- Current Package branch: `refactor/original-occult-western-fantasy-long-lived-world`
- Current Package HEAD: `58b29477c8ac5cb499dcee6f2b13159ff30c1e43`
- Compatible verified Core: `main@f116a98de7a09c32f1789a875244c7e4b9e14e20`
- Long-lived package branch: still `79447c0b8aca028c6929ff8f9842f8835676191f`; no final integration
- Current stage: **Phase 2 complete; Phase 3 — Human Lifetime / Family / Institution Lifecycle is next and NOT started**
- Plan: `plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`
- Next-stage modules: `implementation-staging.md`, `longevity-model.md`, `world-simulation.md`, `family-relationships.md`, `history-memory.md`, `verification.md`
- Record: `records/package/original-occult-western-fantasy-game-long-lived-world.md`
- Development package: `2.0.0-phase2`; final target: `2.0.0`

## Completed

Phase 1's open Native calendar, single protagonist/world identity, provenance and persistent Stances remain intact.

Phase 2 now supplies:

- bounded Hot/Warm/Cold history and logarithmically merged Archive intervals;
- exact Canonical Fact Ledger, current-source consistency checks, supersession and provenance;
- attributed durable artifacts/copy lineage/status history and source-backed Historical Hooks;
- subjective marked/journaled memory separate from authoritative world truth;
- persisted ID/facet/year-range indexes, bounded revision-anchored Chronicle queries and safe recent model context;
- atomic compaction/portable checkpoint publication through existing Native Authority/Lifecycle/SaveSystem;
- separate meaningful-turn accounting and history/source-scan/growth metrics.

The necessary Core support was independently committed/pushed, verified and fast-forwarded into main. Its temporary support branch has been removed. Package stayed on the same task branch; main was never merged into it.

This is a stop boundary, not permission to execute Phase 3 inside the Phase 2 work round.

## Validation / CI

- **1,000 meaningful authoritative player turns / at least 10 in-world years**: passed as a Phase 2 history-only development gate. Positive time advances mutate the actual Native clock and retained obligations; sequence increments, prose/no-ops and compaction are not counted.
- Eight real Fs/SQLite SaveSystem imports: passed, preserving all authoritative namespaces and timeline, followed by continued play.
- Early letter/contract/copy/hook/marked-memory retrieval after a later 100-year jump: passed as a **Century Retrieval analogue**, not the final integrated century-world test.
- 250 → 1000 loop turns: active state 135,981 → 137,563 bytes; history projection 955 → 965 bytes; portable checkpoint save 18,158 → 27,240 bytes. Raw history and turn tombstones do not grow linearly.
- Three-seed Core history fixtures plus actual checkpoint/import/Retry tests: passed. Core local regression evidence is in the Record; final targeted history/JSON-order tests passed 2 suites / 12 tests.
- Actual MySQL/PostgreSQL Authority CI initially caught JSON key-order assumptions. Fixed with Native canonical equality and stable posting order; corrected four-adapter CI on f116a98de is **success**.
- Retained opening, v2 Eastbank, explicit v1 campaign and Phase 1 foundation regressions: passed.
- Development container: 207,277 bytes in ignored build output; not a release.
- Authority Transaction, Native Frontend v3 and Native Model Prompt Runtime CI on final Core main@f116a98de: **success**. Earlier implementation runs and final main run links are recorded in the Record.
- No local real-browser/device/Android, hosted-model or final long-life UI evidence is claimed.

The 1k Package gate ran on Core 9194a5abf; the final f116a98de only adds the subsequently verified JSON/storage normalization repair. Do not claim a local 1k MySQL/PostgreSQL run.

## Important contracts / limits

Read Package runtime/HISTORY-MEMORY.md before altering history.

- History resides in the existing `atri_lifecycle.history` state. Do not create another authority, save format or persistence service.
- `opening.wait` accepts optional typed history operations. The old scalar UI deliberately does not expose an unfinished structured History/Stance editor.
- Checkpoints retain current authority, durable history and the last approved reply, but expire old transcript Retry when its pre-effect anchor is no longer portable. New post-checkpoint turns can Retry normally. Do not recreate post-effect Retry bugs.
- Retired exact turn records/tombstones enter a bounded fail-closed replay filter. False positives refuse work rather than double-apply; final-soak admission profiling remains future work.
- Protected non-turn/pinned Task results block checkpointing until their old-anchor dependencies are resolved.
- Explicit SavePoints, branch graphs and old immutable local repository revisions are not deleted. Growth claims do not cover arbitrarily accumulated backups/branches.
- Durable-entry/byte caps fail atomically instead of silently erasing canonical facts or player-marked evidence.
- Current canonical source bindings cover retained opening-era authorities. Phase 3 must add the necessary lifecycle facts/identities without treating introduction as birth or chronology.sequence as a turn counter.
- Artifacts are attributed records, not proof of the truth of all document claims. Current custody/status support is not completed property law, inheritance or authenticity simulation.
- There is no final Chronicle UI, NPC aging/family generation, renewable matter generation, business/delegation, multi-region or Era/macro simulation yet.
- Full Gate A lifecycle/renewable coverage, Gate B/C and final Century Retrieval remain future gates.

Preserve `releases/1.0.0.atria` unchanged (SHA-256 `e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09`). No v1 save migration. No new Package phase branch. No main-to-Package merge.

## Read first

1. Current Package workspace AGENTS.md, if present.
2. This HANDOFF.
3. Plan index.
4. implementation-staging.md.
5. longevity-model.md.
6. world-simulation.md.
7. family-relationships.md.
8. history-memory.md and verification.md.
9. The same Record.
10. Package runtime/LONG-HORIZON.md and runtime/HISTORY-MEMORY.md, then only directly relevant Phase 3 runtime/schema/tests.

Do not load all Plan modules by default, redo the v1 audit, reopen frozen design or start Phase 4 during Phase 3.

## New-chat bootstrap prompt

~~~text
继续 ZZZdragondYNGPHX/Atria 的 Original Occult Western Fantasy Long-Lived World 重构。

Task / Package 实现分支：refactor/original-occult-western-fantasy-long-lived-world
已完成 Phase 1 和 Phase 2；当前 Package HEAD：58b29477c8ac5cb499dcee6f2b13159ff30c1e43
配套 Core：main@f116a98de7a09c32f1789a875244c7e4b9e14e20 或包含该修改的后代。

Approved Implementation Plan v1.0 已冻结。本轮只执行 Phase 3 — Human Lifetime / Family / Institution Lifecycle；不要进入 Phase 4，不要重新讨论产品方向。

先检查工作树与真实远端 refs，以实际 Git 状态为准。沿用同一 Package 任务分支，不新建阶段分支，不把 main merge 到 Package。

按 docs:HANDOFF.md 的 Read first 顺序读取：当前 Package AGENTS.md、HANDOFF、Plan index、implementation-staging、longevity-model、world-simulation、family-relationships、history-memory、verification、同一 Record，以及 Package runtime/LONG-HORIZON.md 和 runtime/HISTORY-MEMORY.md。之后只读取 Phase 3 直接相关代码与测试。

Phase 3 范围：Tier A/B/C 人物生命周期；出生、成长、衰老、退休、失踪与死亡；有因果依据的 actor 进入/晋升；恋爱、婚姻/伴侣、分离、丧偶与再结合；生育/收养及相关性限定的多代家族图；继承基础；office 与 office-holder 分离及机构继任；死亡/退休人物历史压缩；主角 chronological/apparent/public-identity age；长生路线基础；普通死亡非终局及带持久代价的重建/归来。

复用 Native Authority / Lifecycle / Clock / SaveSystem、Phase 1 的身份/chronology 和 Phase 2 的 ledger/hooks/artifacts/index/checkpoints。不要另建平行 authority 或存档系统；不要将人物 introduction 当作 birth。为实际生命周期变化补齐精确事实和时序不变量。

注意 Phase 2 的可移植检查点会保留最后已批准回复，但归档其旧 Retry 锚点；后续新 turn 仍可正常 Retry。被引用/标记的耐久历史不可静默删除；JSON/索引必须跨 Fs、SQLite、MySQL、PostgreSQL 规范化稳定。不要把任意累积的备份/分支大小当作活跃存档增长指标。

Phase 3 验证按冻结分阶段计划：多十年确定性夹具中的真实代际变化、家族时序不变量、机构领导继任，以及出生/死亡/继任/主角重建前后的 Save/Restore。Phase 2 的 1k/10 年只覆盖历史核心，不等于完整 Gate A，更不能替代 Phase 3 生命周期证据。不要提前实现 Phase 4 renewable content、后续企业/delegation、多区域、Era/macro 或最终 UI。

保留 releases/1.0.0.atria 不变，最终目标 2.0.0；不添加 v1 save migration。普通实现、schema、测试与 CI 问题自行解决。

Phase 3 结束：完成并修复相关验证，commit/push 当前任务分支，更新同一 Record 与 live HANDOFF，生成 Phase 4 接手提示词，然后停止。
~~~
