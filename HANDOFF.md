# HANDOFF

## Task

- Task ID: `refactor/original-occult-western-fantasy-long-lived-world`
- Primary Workspace: Package
- Current Package branch: `refactor/original-occult-western-fantasy-long-lived-world`
- Current Package HEAD: `2cba4357b3d096a9edb5b54d06103d0412ade2f9`
- Compatible verified Core: `main@4b9fd013880cfc242d330f4a2be143416be20d4f`
- Long-lived package branch: still `79447c0b8aca028c6929ff8f9842f8835676191f`; no final integration yet
- Current stage: **Phase 1 complete; Phase 2 — History / Memory / Compaction Core is next and NOT started**
- Plan: `plans/package/original-occult-western-fantasy-game-long-lived-world/index.md`
- Next-stage modules: `implementation-staging.md`, `history-memory.md`, `verification.md` in that Plan directory
- Record: `records/package/original-occult-western-fantasy-game-long-lived-world.md`
- Development package: `2.0.0-phase1`; final target: `2.0.0`

## Completed

- Phase 1 removed the default world's Day 30 authority ceiling and accepts multi-year minute advances.
- One Native clock drives Gregorian dates, weeks/seasons and a stable opening Era reference.
- A bounded interval job resolves chronology and retained opening obligations without replaying every skipped day.
- New continuity/provenance and Stance state persists through the existing Native SaveSystem.
- Stable actor/protagonist/public identity references use the immutable Native session/world namespace.
- Explicit `--v1-campaign` retains the historical Day 30 scenario; the original release archive is byte-for-byte unchanged.
- Minimal Core time-range/targetTick support was separately integrated into main. Its temporary support branch is deleted. Package stayed on the same task branch; no main-to-Package merge occurred.
- Package implementation and Core prerequisite are committed/pushed. This handoff is a stop boundary, not permission to execute Phase 2 within the Phase 1 chat.

## Validation / CI

- Long-horizon Native checks: Day 31, Gregorian ordinary/leap/century rollover, bounded long-span resolution, identity/provenance/Stance persistence, malformed/overflow refusal, complete save-container equivalence and continuation on FsEngine and SqliteEngine.
- Retained opening checks: passed, including local HTTP/typed Host bridge retry/idempotency and actual SaveSystem continuation.
- v2 Eastbank campaign: passed; 67 commits, Hearing/Retry/save/Day 31/late Pattern deadline coverage; max 16 reads / 22 commands / 24 effects.
- Explicit v1 campaign: passed; 57 commits and atomic Day 31 refusal.
- Core local tests: 4 suites / 65 tests, Fs/SQLite. Local MySQL/PostgreSQL unavailable; configured remote Authority CI covers those services.
- Core Authority Transaction and Native Frontend v3 CI: success. Native Model Prompt Runtime: **success**.
- Final development container built (206,058 bytes), left under ignored build output; not a release.
- Node syntax, targeted Core lint and Git whitespace checks passed.
- No Gate A/B/C or Century Retrieval claim. A long calendar jump is not lifecycle/history simulation.
- No local browser/device, Android or hosted-model evidence is claimed.

See the Record for exact commands, CI URLs, release hash and limits.

## Pending / boundaries

Only Phase 2 is the next implementation target. No Phase 2 implementation has been performed.

Implement the approved history/memory/compaction core, including the ledger, hooks, artifacts/provenance, truth/memory split, archival indexes, retrieval/projection, Chronicle backend and growth instrumentation. Follow the Phase 2 exit criteria without pulling future lifecycle/content/macro systems forward.

Current Phase 1 limitations are intentional:

- no history compaction or sublinear-growth claim;
- no high-impact interruption providers or actual long-term stance-driven lifecycle resolution;
- no NPC aging, families, artifact ledger, renewable generation, businesses, delegation, regions, macro/Era evolution or final Chronicle UI;
- finite old Case/Pattern slots remain regression content;
- chronology.sequence is an ordering primitive, not gate-qualified turn accounting;
- current actor IDs and reserved allocation cursor are foundations, not a complete historical entity graph.

## Read first

1. Current Package workspace AGENTS.md, if present.
2. This HANDOFF.
3. Plan index.
4. implementation-staging.md.
5. history-memory.md.
6. verification.md.
7. The same Record.
8. Package runtime/LONG-HORIZON.md and only directly relevant Phase 2 runtime/schema/tests.

Do not load all Plan modules by default. Do not redo the v1 audit or reopen frozen product design. Preserve releases/1.0.0.atria; no legacy v1 save migration; no new Package phase branch; no main-to-Package merge; no Phase 3 work during Phase 2.

## New-chat bootstrap prompt

~~~text
继续 ZZZdragondYNGPHX/Atria 的 Original Occult Western Fantasy Long-Lived World 重构。

Task / Package 实现分支：refactor/original-occult-western-fantasy-long-lived-world
已完成 Phase 1；当前 Package HEAD：2cba4357b3d096a9edb5b54d06103d0412ade2f9
配套 Core：main@4b9fd013880cfc242d330f4a2be143416be20d4f 或包含该修改的后代。

Approved Implementation Plan v1.0 已冻结。本轮只执行 Phase 2 — History / Memory / Compaction Core；不要开始 Phase 3，不要重新讨论产品方向。

先检查工作树与真实远端 refs，以远端实际状态为准。沿用同一 Package 任务分支，不新建阶段分支，不把 main merge 到 Package。

依次读取：
1. 当前 Package 工作区 AGENTS.md（若存在）；
2. docs:HANDOFF.md；
3. docs:plans/package/original-occult-western-fantasy-game-long-lived-world/index.md；
4. 同目录 implementation-staging.md；
5. 同目录 history-memory.md；
6. 同目录 verification.md；
7. docs:records/package/original-occult-western-fantasy-game-long-lived-world.md；
8. Package 的 original-occult-western-fantasy-game/runtime/LONG-HORIZON.md，然后只检查 Phase 2 直接相关代码与测试。

Phase 2 范围：Hot / Warm / Cold / Archive；Canonical Fact Ledger；Historical Hooks；durable Artifacts/provenance；World Truth 与 Protagonist Memory 分离；compaction transactions / archival indexes；selective retrieval/projection；Chronicle backend/query contract；growth instrumentation。不要实现最终 Chronicle UI、NPC/家族生命周期、renewable generation、企业/delegation、multi-region、Era/macro 系统。

复用既有 Core Authority / Lifecycle / Clock / SaveSystem 和 Phase 1 identity/chronology；不要另建平行 authority 或存档系统。Phase 1 的 sequence 是事务序号，不自动证明 meaningful authoritative turns；跨到 year 401 的日期测试也不是长期世界 Gate。

Phase 2 验证依冻结分阶段计划执行：1k authoritative turns / 10 in-world years development gate、重复 Save/Restore、早期 century-retrieval analogue，以及 active projection/raw retention 不随 turn count 简单线性增长的证据。若 Gate A 描述涉及尚未到期的后续系统，按 implementation-staging 的 Phase 2 边界明确报告覆盖范围，不偷跑 Phase 3/4，也不冒称最终 release Gate 完成。

保留 releases/1.0.0.atria 不变；目标最终版本 2.0.0；不要求兼容 v1 saves。普通实现、schema、测试问题自行解决。

Phase 2 结束：完成并修复相关验证，commit/push 当前任务分支，更新同一 Record 与 live HANDOFF，生成 Phase 3 接手提示词，然后停止。
~~~
