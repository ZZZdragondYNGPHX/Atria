# AI Handoff Context

## Agent Runtime v2 — active work on feat/agent-runtime-v2

Work baseline is `cb68da1f4` (plan commit), parent `cfb959530` (Memory OS integration into custom-release).
Phase 0 is committed as `137610247`; CURRENT_MAP and ADR record actual browser/backend boundaries.
Phase 1 is committed as `1d745e184`: headless kernel under `public/scripts/lib/agent-runtime/`, injected ports,
serial effects, typed handoffs, cancellation/stale guards and in-memory CAS receipts. This is not durable crash recovery.
See `docs/development/AGENT_RUNTIME_V2_PHASE1.md` for tests and boundaries.
Phase 2 now covers full Single serial tool rounds, including inherited Layer-2/custom tools; see
`docs/development/AGENT_RUNTIME_V2_PHASE2.md` for golden/race tests and scope. Ordered batches live in Runtime state;
provider IDs, final-output priority, notes refresh and structured tool errors retain legacy semantics.
Tool result content is transient run-local data, not checkpoint memory. Durable rehydration is not enabled.
Phase 3 is complete at the execution boundary: all production mode model/tool operations now use AgentRuntime,
either native Single or a legacy policy generator adapter. Final host-assembled context admission shares the
compiler and existing preset/host budgets; Memory OS source guards survive into subsequent requests.
See `docs/development/AGENT_RUNTIME_V2_PHASE3.md`: 212 suites / 2429 phase tests and offline Edge smoke passed.
Full offline inventory has 7080 passes and 18 failures; all 18 reproduce on pre-change af5ee205b, documented there.
Legacy policy receipts contain transient references; lost continuations reject resume. Durable reconstruction
is still Phase 6. Phase 4 is now complete: runtime-admitted typed routes cover Spec/Single entry, review replay,
Agenda planning/dispatch/finalization and Director configured/inline children. Stage/node slots preserve repeated
Spec names; selected inputs and preset snapshots prevent unintended context/config mutation. Stable handoff IDs
come from effect IDs, and trace metadata links child attempts to the parent orchestration.
See `docs/development/AGENT_RUNTIME_V2_PHASE4.md`: 213 suites / 2447 expanded regressions passed, followed by
117 suites / 1327 after final identity plumbing; Edge smoke passed. Next is Phase 5 event-driven UI projection.
Legacy mode coordinators remain compatibility policies, and existing parallel behavior remains for Phase 7.
The explicit request payload `agentRuntimeV2: false` selects Single's legacy protocol adapter without changing presets; both paths now use Runtime scheduling.
The owner prefers autonomous offline/browser verification and will check real play later; missing Android/real-model checks
are coverage gaps, not mandatory manual approval gates. No merge into custom-release or remote push has been performed.

This document stores fork-specific context that should survive across chats and different AI tools. It is a snapshot and navigation aid; live `custom-release` code and Git history remain authoritative.

## Read order for a new AI session

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_BUG_PROMPT.md` for bug work, or `NEW_FEATURE_PROMPT.md` for feature work
5. `.github/copilot-instructions.md` when applicable
6. Files directly relevant to the task
7. Relevant `custom-release` history and existing private implementations

Only inspect `funnycups/Luker` when the task actually benefits from upstream comparison, porting, compatibility analysis, or a deliberate upstream refresh.

## Current repository model

- Historical upstream/reference repository: `funnycups/Luker`
- Maintained personal fork: `ZZZdragondYNGPHX/Luker`
- Primary development/integration branch: `custom-release`
- Optional upstream-reference/mirror branch: `release`
- Per-bug branches: `fix/*`
- Per-feature branches: `feat/*`

The maintenance model is now independent-fork first. `custom-release` is the normal source of truth and the base for new work.

## Current maintenance mode

The owner intends to maintain this fork primarily for personal use rather than organize every change around upstream contribution.

Therefore:

- new `fix/*` branches start from the latest `custom-release`;
- new `feat/*` branches start from the latest `custom-release`;
- existing private behavior is part of the baseline and must not be silently dropped;
- upstream synchronization is optional and deliberate;
- upstream PRs are optional and only prepared when explicitly requested;
- the fork's current behavior takes precedence over upstream parity during normal development.

## Historical private-work context

Older handoff versions tracked individual private patches as if each were primarily an upstream candidate. That model is obsolete.

The repository may contain multiple fixes/features already merged into `custom-release`. Do not assume this document has a complete inventory. Before changing a related area, inspect:

- current code;
- recent commits affecting the same subsystem;
- relevant `fix/*` or `feat/*` branches when they still exist;
- tests added by previous fixes/features.

One known historical example is the orchestrator character/global preset work, which separated user-visible preset scope from character override existence. Treat it as integrated fork behavior if it is present in current `custom-release`; verify the live implementation rather than relying on an old commit list here.

## How to handle a new bug

When the user reports a new bug, follow `NEW_BUG_PROMPT.md`.

In short:

1. Fetch the latest `ZZZdragondYNGPHX/Luker:custom-release` HEAD.
2. Inspect the current failure path and nearby private behavior.
3. Create a fresh `fix/<bug-name>` from that `custom-release` HEAD.
4. Identify the root cause before editing.
5. Implement and test the smallest compatible fix.
6. Preserve unrelated private behavior.
7. Merge the verified fix back into `custom-release` when the user wants it integrated.
8. Update this handoff only when the fix creates durable context future sessions should know.

If upstream comparison is useful, perform it as supporting analysis rather than as the mandatory source baseline.

## How to handle a new feature

When the user requests new functionality, follow `NEW_FEATURE_PROMPT.md`.

In short:

1. Fetch the latest `ZZZdragondYNGPHX/Luker:custom-release` HEAD.
2. Inspect the fork's current architecture and integrated private behavior.
3. Create a fresh `feat/<feature-name>` from that `custom-release` HEAD.
4. Identify the correct module/state/service/UI/persistence path before coding.
5. Reuse existing infrastructure and keep the implementation coherent with the fork.
6. Test the feature and report persistence/Web/Android implications when relevant.
7. Merge the verified feature back into `custom-release` when the user wants it integrated.
8. Update this handoff only when the feature introduces durable architecture, migration, or maintenance context.

## Deliberate upstream refreshes

Upstream is still useful as a source of improvements and bug fixes, but refreshing from it is a separate maintenance task.

For an upstream refresh:

1. Inspect current `custom-release` and current upstream state.
2. Review the incoming upstream changes before integrating them.
3. Identify overlap/conflicts with private patches.
4. Preserve fork-specific behavior unless the user intentionally chooses the upstream behavior instead.
5. Integrate selectively or merge/rebase with full conflict review as appropriate.
6. Run relevant regression checks after integration.
7. Record any private patches that became obsolete, replaced, or conflict-prone.

Do not reset `custom-release` to upstream merely to make histories match.

## What to tell the user after each task

Always report:

- `custom-release` baseline SHA used;
- work branch name;
- root cause for bugs, or architecture/design summary for features;
- changed files;
- persistent data/config changes or migration status when relevant;
- Web/Android differences when relevant;
- tests/checks actually run;
- resulting commit SHA;
- whether the work has been merged into `custom-release`;
- any dependency on older private behavior;
- any compatibility concern discovered with upstream, if upstream was actually inspected.

Only report upstream SHA, official Android Actions SHA, or upstream PR status when those were relevant to the task and actually checked.

## Maintenance warning

Do not treat old SHA/version snapshots in chats or documents as current. For normal work, verify `custom-release` live. For an upstream-related task, also verify the relevant upstream state live.


## Execution mode redesign — integrated into custom-release

Implemented on `feat/execution-mode-design`, based on custom-release `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`. Integrated into custom-release on 2026-09-16 at the owner's request, preserving the feature branch commits. See `EXECUTION_MODE_DESIGN.md` section 12 for implementation boundaries and checks.

The four primary modes remain existing runtimes: Loop research, Spec fixed workflow, Agenda dynamic delegation, Director reply authoring. Output responsibility is a UI projection, not another persistent mode setting. Legacy Single stays readable/editable and supports explicit copies into fresh Spec preset IDs. Quick templates use the existing preset library and character save path; activation is optional. Preserve independent global editing while a character override remains effective.

Snapshots optionally carry `executionIdentity`, a SHA-256 digest of effective profile/preset and selected runtime settings. Historical snapshots remain readable but do not qualify for reuse without identity. In environments without Web Crypto, reuse is disabled. Extend the configuration fingerprint when introducing relevant runtime dependencies. Budget-exhausted Loop/Agenda results may supply partial guidance but are not completed cache entries. Agenda exposes budget reason and unresolved task IDs.

No version bump, dependency change or automatic user-data migration. Shared frontend checks do not substitute for Android device or live-model validation.

## Memory OS — feature branch only

`feat/memory-os` continues the existing `docs/development/MEMORY_OS_REFACTOR_PLAN.md`; Phase 1 architecture and validation are recorded in `docs/development/MEMORY_OS_PHASE1_AUDIT.md`. The feature branch includes the local execution-mode integration above. Memory OS is not merged into `custom-release`.

The default-off user setting `extension_settings.memory_graph.memoryOsEnabled` gates Memory OS work; Phase 1 added a transparent vector adapter. Existing memory-graph / FloorState / vector backend remain the owners. LoreState was not located in tracked code; verify the actual provider before Phase 6 integration.

Phase 2 implementation is recorded in `docs/development/MEMORY_OS_PHASE2_PROVENANCE.md`: opt-in source IDs on messages, chat-state `memory_graph__provenance` ledger, per-version node evidence, source checks and stale projection filtering. No automatic historical migration/rebuild. Keep the ledger with the chat; a graph import without its ledger cannot prove new evidence valid. FloorState accepts an optional synchronous `validate` guard on patch/update/reset inside the state updater. Existing calls and monotone floor anchors are unchanged. The user explicitly authorized continued phase-by-phase development with unavailable device/model checks recorded as coverage gaps, not manual acceptance prerequisites.

Phase 2 Web smoke now passes against an isolated real Luker server in system Edge: public API creation, UI source editing, stale exclusion, rejected late writes, reload persistence, new revisions and flag-off behavior. Reproduce with `tests/frontend/memory-os-source.smoke.mjs` against a disposable instance only. Real LLM extraction, remaining lifecycle scenarios and Android are still unverified; see the Phase 2 record for the exact boundary.

Phase 3 Atomic Facts is implemented in the same provenance ledger and extraction request path. See `docs/development/MEMORY_OS_PHASE3_ATOMIC_FACTS.md`: explicit/inferred/summary confidence separation, verbatim Episode evidence, dedup/reinforce/merge/supersede with preserved history, and public session fact access. The browser smoke includes fact persistence and invalidation. Unified Fact retrieval/injection remains Phase 5. No automatic historic migration or merge back to custom-release.

Phase 4 Temporal Graph is implemented; see `docs/development/MEMORY_OS_PHASE4_TEMPORAL_GRAPH.md`. Entities/aliases, pending resolution, reversible merge mapping, semantic relations, temporal policies and conflict/history projection share the provenance ledger. Fact + graph batches persist atomically; extraction now requires both operations and graphOperations arrays. Proceed to Phase 5 Hybrid Retrieval. The user explicitly permits breaking old-data compatibility for this experimental fork; do not add migration/compatibility prerequisites. Preserve private features and keep unavailable runtime checks as documented gaps.

Phase 5 Hybrid Retrieval is implemented; see `docs/development/MEMORY_OS_PHASE5_HYBRID_RETRIEVAL.md`. Source-valid Fact/graph/Episode candidates share BM25, bounded graph expansion, optional content-addressed vectors and rerank, fusion, actual-tokenizer budget and the existing CORE/FOCUS worldbook path. Public `recallMemory` returns a guarded snapshot; consumers must call `assertCurrent()` before using a result after further async work. `memoryOsTokenBudget` defaults to 2400 including persistent nodes. Retrieval does not reuse old focus snapshots. Explicit temporal API queries use `at`; natural-language dates are not automatically resolved. Proceed to Phase 6 LoreState / Orchestrator integration, using the real providers and keeping agent scratch separate from shared long-term memory. No old-data compatibility prerequisite and no merge back to custom-release.


Memory OS direction correction (2026-09-16, before Phase 6): the user requires equal support for plain text cards, MagicalAstrogy/MagVarUpdate (MVU), and ZZZdragondYNGPHX/LoreState. The original plan section 17 and Phase 6 now govern this work: generic memory core, optional read-only state providers, provider-owned current state, source/revision-aware historical evidence, and no installation requirement for text cards. Do not implement a LoreState-only core or treat EJS/iframe globals as a host extension API. LoreState's current maintained line is the Tavern Helper script under prototype/, not the discontinued native extension. Fixed source references and a three-mode/coexistence acceptance matrix are in the plan. This commit changes direction documents only; provider adapters are still pending Phase 6. User still permits incompatible old-data changes and automated progress without manual acceptance prerequisites.

Phase 6 is implemented; see `docs/development/MEMORY_OS_PHASE6_STATE_PROVIDERS.md`. Optional MVU message-table reads and verified synchronous LoreState prepare-event reads feed immutable provider evidence in the same provenance ledger. Provider changes invalidate retrieval guards even without message edits. Current fields and explicitly remembered history use shared retrieval; mapped fields have explicit ownership/conflict handling. No external state writes or automatic runtime installation. `memory_recall` is a read-only Layer-2 tool for all orchestration modes; new default Director memory_scout configurations prefer it, saved user presets are not overwritten. Source contracts, bounded projection, known-prompt budget/dedup limits, 155-suite regression and 22 browser checks are documented. Proceed to Phase 7 graph UI / inspector / pending review, including provider status and mappings; keep external state read-only. Complete external model pipelines and Android remain unverified, not user acceptance prerequisites.

Phase 7 is implemented; see `docs/development/MEMORY_OS_PHASE7_GRAPH_UI.md`. The existing graph settings entry opens the Memory OS inspector when enabled and retains the legacy graph. Global/local semantic graph, filters/history, source inspectors, pending review and manual correction forms use the same scope ledger and guarded transactions. User corrections have distinct manualId provenance, never fabricated Episodes; rejected records remain auditable but do not enter current recall. External provider status/mappings remain read-only. Proceed to Phase 8 historical build, progress/cancel/dedup/rollback, preserving user corrections when rebuilding. No legacy-data compatibility prerequisite, no merge back to custom-release, and no manual device/model acceptance prerequisite.

Phase 8 is implemented; see `docs/development/MEMORY_OS_PHASE8_HISTORY_BUILD.md`. Manual range-based historical build reuses the production extraction dispatcher, stages batches against a draft ledger, and publishes only after all batches succeed. Episode revision IDs deduplicate repeated builds. Rebuild preserves user-touched records and dependencies; historical extraction cannot perform identity corrections or overwrite user Facts. The same ledger holds one historyBuild rollback checkpoint; undo survives reload and refuses newer edits, including competing client writes checked inside the persistence updater. Cancellation retains source IDs/Episodes but does not publish partial derived memory. Providers and legacy FloorState remain unchanged. Proceed to Phase 9 performance, retrieval/extraction quality and debugging; retain documented model/Android coverage gaps without manual acceptance prerequisites.

Phase 9 implementation is recorded in `docs/development/MEMORY_OS_PHASE9_OPTIMIZATION.md`. Synchronous projections share short-lived source validation indexes; never reuse them across await or mutation. Graph inspection, diagnostics and historical batch validation/staging use terminable module Workers with scope/source guards retained by the caller. Worker payloads omit external variable tables and rollback backups; compact graph output is hydrated from the guarded inspector snapshot for evidence details. Worker-less fallback is limited to 1000 combined facts/entities/relations. Retrieval fingerprints yield every 64 records; trace metrics and a read-only local diagnostic popup expose ranking/provenance. Existing retrieval weights remain after deterministic quality replay. Native Android lacks Java/adb and real model accuracy remains unmeasured. The original nine-phase implementation sequence is complete, with those acceptance gaps retained; continue whole-feature validation or targeted improvements on feat/memory-os, without automatic integration or upstream PR.
