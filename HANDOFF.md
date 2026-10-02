# HANDOFF

## Task

- Task ID: refactor/original-occult-western-fantasy-long-lived-world
- Primary Workspace: Package
- Current Package branch: refactor/original-occult-western-fantasy-long-lived-world
- Current Package HEAD: ccc7b6c6ad3d460898ec4c81e875218cc29fdc84
- Compatible verified Core: main@80376ec9f0e5cce9ef1c29422f39604bb7446cfd
- Long-lived package: still 79447c0b8aca028c6929ff8f9842f8835676191f; no final integration
- Current stage: **Phase 3 complete; Phase 4 — Renewable World Content is next and NOT started**
- Plan: plans/package/original-occult-western-fantasy-game-long-lived-world/index.md
- Next-stage modules: implementation-staging.md, content-renewal.md, world-simulation.md, history-memory.md, verification.md
- Record: records/package/original-occult-western-fantasy-game-long-lived-world.md
- Development package: 2.0.0-phase3; final target: 2.0.0

## Completed

Phases 1–2 remain intact: one Native calendar/protagonist/world, persistent Stances,
Hot/Warm/Cold/Archive, canonical ledger, attributed artifacts/hooks, marked memory,
indexed Chronicle retrieval and portable checkpoints with correct Retry expiration.

Phase 3 adds:

- Tier A/B human lifecycles and aggregate Tier C turnover;
- explicit birth vs introduction, maturation, retirement, disappearance, death;
- causal adult entry and relevance promotion, health/career state;
- romance/marriage/partnership, separation/reconciliation, widowhood and new bonds;
- gestation/birth/adoption and relevant multi-generation kinship;
- causal legacies, artifact inheritance and exact custody provenance;
- independent institution/office/holder identities and leadership succession;
- inactive profile compaction without deleting structural truth;
- chronological/apparent/public-identity ages;
- two explicit longevity route profiles, costly consent-based sponsorship/refusal;
- ordinary non-terminal bodily death and delayed reconstruction with lasting costs;
- slow family-documentary identity exposure;
- exact lifecycle facts, source checks, chronology/custody invariants and bounded work.

Core support was separately committed, pushed, CI-verified and fast-forwarded into
main. Its temporary support branch was deleted. Package stayed on its original
branch; main was never merged into Package. No reference project was read.

This is a stop boundary, not permission to execute Phase 4 inside the Phase 3 round.

## Validation / CI

- Actual Package lifetime fixture: **90 in-world years**, 28 focused committed
  transitions plus creation, two descendant generations, 9 relevant people,
  3 kinship/adoption edges, 4 office terms and 162 exact history facts.
- Nine real SaveSystem imports into fresh alternating Fs/SQLite stores around
  birth, death, succession, reconstruction, second-generation and late-history
  boundaries; all authoritative state/timeline preserved and play continued.
- One protagonist reconstruction; age 118, apparent age under 50, initial public
  identity age 90. Scar 1, Claim burden 6, exposure 7; inheritance was not undone.
- Final local Core batch: **8 suites / 343 tests passed**, including three seeds,
  JSON normalization, split-interval equivalence, failure atomicity, actual
  checkpoint/import/Retry and adjacent Authority/History/Lifecycle regressions.
- Retained opening, v2 Eastbank and explicit v1 bounded campaign regressions passed.
- Phase 1 calendar/foundation regression passed during implementation; details
  and later hardening coverage are recorded in the same Record.
- Six Package syntax checks, targeted Core lint and whitespace checks passed.
- Final ignored development container: **210,015 bytes**, built on 80376ec9f.
- Core Authority Transaction CI on exact 80376ec9f: **success**,
  https://github.com/ZZZdragondYNGPHX/Atria/actions/runs/37002045148,
  including configured Fs/SQLite/MySQL/PostgreSQL lifetime checkpoint/restore tests.
- Main-triggered Authority Transaction (37002812470), Native Frontend v3
  (37002812492) and Native Model Prompt Runtime (37002812654): **all success**
  on exact 80376ec9f. The last workflow includes 16 passed / 1 skipped remote E2E tests.
- No local MySQL/PostgreSQL services, real browser/device/Android, hosted-model or
  final long-life UI evidence is claimed.

The final Package lifetime process began before the Core commit, so its log prints
f116a98de while testing the then-dirty implementation later committed as 80376ec9f.
The final build explicitly reports 80376ec9f. Do not reinterpret this as testing
Phase 3 on an unmodified old Core.

This is Phase 3 evidence, not full Gate A, Gate B/C, a new 1k history soak or final
Century Retrieval. The Phase 2 1k/10-year result remains history-only evidence.

## Important contracts / limits

Read Package runtime/HUMAN-LIFETIMES.md and runtime/HISTORY-MEMORY.md before changing
lifecycle/history behavior.

- Lifetimes live in existing atri_lifecycle.lifetimes; history remains in
  atri_lifecycle.history. Do not add another authority, scheduler service or save format.
- Native resolves due relevant events, not every skipped day. Birth dates may be
  pre-opening; introduction never substitutes for birth. Chronology sequence is
  not a meaningful-turn counter.
- Optional opening.wait.lifetime operations resolve after any requested interval.
  Scalar UI excludes structured inputs; final family/Chronicle UI remains Phase 7.
- Actor sources bind through declared fields; retired/dead source roles cannot
  silently reenact living behavior. Institutions, offices and tenure are distinct.
- Precise lifecycle facts and secret disclosure survive compaction. Marked/referenced
  historical evidence cannot be silently removed.
- NPC longevity is intentional, costly and consent-based, never automatic inheritance.
  Ordinary protagonist death advances absence/return obligations and keeps the same
  identity. Return cannot erase inheritance, scars, Claim burden or exposure.
- Initial gestation/Tier C demographics are bounded authored abstractions, not
  full fertility or macro simulation. Estate/property/business law, complete Claim
  progression and identity rotation remain later scope.
- Limits: 256 relevant people, 512 due events/candidate, 1 MiB lifetime state,
  existing 4,096 durable history entries / 2 MiB history and 4,096 source-scan cap.
  Limits fail atomically; final-soak profiling remains future work.
- The Phase 2 portable checkpoint keeps the latest approved reply but expires its
  old pre-effect Retry anchor; subsequent new turns can Retry normally. Protected
  Task-result anchors can block checkpointing. Do not reintroduce post-effect Retry.
- Explicit SavePoints, branches and immutable local revisions remain retained.
  Phase 3's restore-container sizes include such ancestry and are not active-state
  growth measurements. Cross-Fs/SQLite/MySQL/PostgreSQL JSON order must stay stable.

Preserve releases/1.0.0.atria unchanged, SHA-256
e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09.
No v1 save migration, no new Package phase branch, no main-to-Package merge.

## Read first

1. Current Package workspace AGENTS.md, if present.
2. This HANDOFF.
3. Plan index.
4. implementation-staging.md.
5. content-renewal.md.
6. world-simulation.md.
7. history-memory.md and verification.md.
8. The same Record.
9. Package runtime/LONG-HORIZON.md, runtime/HISTORY-MEMORY.md and runtime/HUMAN-LIFETIMES.md.
10. Only directly relevant Phase 4 runtime/schema/tests.

Do not load all Plan modules, redo the v1 audit, reopen frozen design or start Phase 5.

## New-chat bootstrap prompt

~~~text
继续 ZZZdragondYNGPHX/Atria 的 Original Occult Western Fantasy Long-Lived World 重构。

Task / Package 实现分支：refactor/original-occult-western-fantasy-long-lived-world
已完成 Phase 1、2、3；当前 Package HEAD：ccc7b6c6ad3d460898ec4c81e875218cc29fdc84
配套 Core：main@80376ec9f0e5cce9ef1c29422f39604bb7446cfd 或包含该修改的后代。

Approved Implementation Plan v1.0 已冻结。本轮只执行 Phase 4 — Renewable World Content；不要进入 Phase 5，不要重新讨论产品方向。

先检查工作树与真实远端 refs，以实际 Git 状态为准。沿用同一 Package 任务分支，不新建阶段分支，不把 main merge 到 Package。

按 docs:HANDOFF.md 的 Read first 顺序读取：当前 Package AGENTS.md、HANDOFF、Plan index、implementation-staging、content-renewal、world-simulation、history-memory、verification、同一 Record，以及 Package runtime/LONG-HORIZON.md、runtime/HISTORY-MEMORY.md 和 runtime/HUMAN-LIFETIMES.md。之后只读取 Phase 4 直接相关代码与测试。

Phase 4 范围：curated grammar-driven Matter generation；基于当前世界状态组合内容；有界模型 deliberation 合约；Historical Hook 真实复用；语义距离/cooldown 防重复；短暂内容向 canonical history 提升；有因果依据的 NPC 创建；地点/企业/机构生命周期；组织创建、合并、拆分与解散；城区/城市演化基础；旧案重新浮现。

复用 Native Authority / Lifecycle / Clock / SaveSystem、Phase 1 身份/chronology、Phase 2 ledger/hooks/artifacts/index/checkpoints，以及 Phase 3 人物/亲缘/机构/office-tenure/长生与重建。不要另建平行 authority、调度服务或存档系统；不要将 introduction 当作 birth，不要让已死/退休人物无解释地重新履行旧角色，不要把 chronology.sequence 当作有效回合数。

Phase 3 已有 90 年确定性 Package 夹具、两代后裔、4 段职位任期、9 次真实 Fs/SQLite Save/Restore；Core 三种子及实际四适配器 CI 已通过。这不是 Gate B 或最终世纪世界验证。Phase 2 的 1k/10 年只覆盖历史核心，不等于完整 Gate A。

Phase 4 验证按冻结计划：第一版完整 5k-turn / 50-year Gate B candidate；后期仍持续出现有意义新内容；后来内容真实复用世界自己的历史、家族、文物、机构与 Hooks；语义/结构重复审计不能只比较名字或模板 ID。不得用纯叙述、无状态变化或 sequence 累加凑回合。

保留 Phase 2 检查点/Retry 边界；被引用或玩家标记的耐久历史不可静默删除；JSON/索引跨 Fs、SQLite、MySQL、PostgreSQL 规范化稳定；显式备份/分支累计大小不能冒充活跃存档增长。现有寿命/历史预算失败必须原子拒绝，不得丢事实绕过。

不要提前实现 Phase 5 企业经营/wealth/delegation/完整身份轮换、后续多区域/Era/macro 或最终 UI。保留 releases/1.0.0.atria 不变，最终目标 2.0.0；不添加 v1 save migration。普通实现、schema、测试和 CI 问题自行解决。

Phase 4 结束：完成并修复相关验证，commit/push 当前任务分支，更新同一 Record 与 live HANDOFF，生成 Phase 5 接手提示词，然后停止。
~~~
