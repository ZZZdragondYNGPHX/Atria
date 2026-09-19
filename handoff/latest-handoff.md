# Latest Handoff

## Current state

Atria is an independent SillyTavern-based modified product. The product bootstrap, Atria hard-cutover namespace migration, Agent & Memory Workspace redesign, Termux main-branch pinning, agent-native Web Access / API fallback integration, the Worldbook Performance Foundation, and its P-02–P-05 no-storage-migration performance continuation are complete and merged into `main`.

Current authoritative `main`:

- `ff804b53adb514919cc3bfb6ac82334df5fe7cf2`

This commit is the squash merge of PR #10. In addition to the completed World Info foundation, Atria now has on-demand prompt diagnostics, bounded message-depth computation, engine-level chat range/info/append capabilities, native SQL whole-message patching, lazy throttled backup materialization, and indexed Memory OS retrieval hot paths. The merged tree exactly matches the final validated PR #10 task tree.

## Branch roles

- `main`: authoritative Atria development and integration branch.
- `docs`: permanent development documentation and latest handoff.
- `vanilla`: SillyTavern upstream reference only; refresh/use when an upstream comparison or synchronization task requires it.
- `luker`: legacy Luker reference only; refresh/use for migration archaeology or legacy comparison.
- `feat/*`, `fix/*`, `refactor/*`, `chore/*`: temporary branches created from current `main`.

## Development rules

1. Start ordinary work from the live `main` HEAD.
2. Do not use `luker` or `vanilla` as the default development base.
3. New Atria-owned runtime/protocol namespaces should use concise Atria naming such as `atri_*` where practical.
4. Preserve real SillyTavern upstream structures when they are still part of the product/upstream contract.
5. Do not reintroduce predecessor Luker compatibility into Atria-owned runtime state unless a future task explicitly requires it.
6. Product UI should follow the standalone-first policy: host glue stays at adapters, while Workspace views consume stable Atria data/actions.
7. Android builds/tests and Docker image builds are opt-in validation. Run them only when the user explicitly requests them.
8. At task completion, write the implementation record to `docs`, merge into `main`, verify integration, then remove the temporary task branch.

## Current architecture

Atria currently owns and maintains:

- Agent Runtime;
- multi-agent Orchestration Engine;
- four-section Atria Workspace;
- Memory OS / memory graph;
- Workspace Preset Library and scope bindings;
- storage/FloorState extensions;
- generation lifecycle modifications;
- Android integration;
- Termux support;
- SillyTavern upstream integration layer;
- agent-native Web Access backed by Search Tools;
- orchestration runtime API fallback through the Workspace Default API profile.

### Workspace product structure

The current Agent & Memory Workspace has four primary sections:

1. Orchestration
2. Run
3. Memory
4. Diagnostics

The old migration-era Presets / Live Run / Graph / Agents split is no longer the supported information architecture.

The permanent Workspace UI guard and Chromium workflow should be treated as architectural tests, not disposable migration CI.

## Recent completed integrations

### Atria namespace migration

- PR #3
- Final validated head: `1aa9f0961a785db0b4512a1a9910981436bcc090`
- Resulting `main`: `ed2957eba42fdbd9099eacd15eedf7f94b790fab`
- Record: `features/atria-namespace-migration.md`

### Agent & Memory Workspace redesign

- PR #4
- Baseline: `main@ed2957eba42fdbd9099eacd15eedf7f94b790fab`
- Final validated head: `5f4cd9947e7858b88fed1c2a1ab5f7b36cb1094c`
- Squash merge / current `main`: `b84d411431e72be39099cba1a0a42cde9052c778`
- Final task tree and merged main tree: `cf3fc3a4794e1df0dc62dba5de212cb7f1f09d81`
- Record: `features/atria-workspace-redesign.md`
- Temporary branch `feat/atria-workspace-redesign` has been removed after merge.

Final validation for PR #4 passed:

- ESLint
- full Node unit suite
- Android JVM tests
- Atria Migration Guard
- Workspace IA guard
- Run projection Chromium smoke
- full Workspace UI Chromium smoke
- Run call-count Chromium smoke
- real-host Preset binding persistence E2E


### Termux main-branch pinning

- PR #5
- Baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- Final validated head: `417815c36d5928663bcf5116e706f7230c4856e4`
- Squash merge / current `main`: `a32a2c4e815cb9e9590f303b36423f6e959d8076`
- Record: `fixes/termux-main-branch.md`
- Normal Termux install/update is pinned to `main`; Tag/Commit checkout remains available for explicit debugging or rollback.
- PR Checks run #136 passed Atria Migration Guard, ESLint, full Node unit tests, and Android JVM tests.


### Agent-native Web Access and API fallback

- PR #6
- Original baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- Synchronized baseline before merge: `main@a32a2c4e815cb9e9590f303b36423f6e959d8076`
- Final validated head: `af157c8dd79c358c8e56921d5d0a81e82fc3da5d`
- Squash merge / current `main`: `12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3`
- Record: `features/agent-web-access-api-fallback.md`
- Search Tools remains independent and exposes on-demand Web Access to agents through `search_search` / `search_visit`.
- Main-model web tools remain available without orchestration.
- Pre-request automatic research remains available as an Advanced opt-in path.
- Web evidence is deduplicated per orchestration run without global prompt injection.
- Workspace Default API is a runtime fallback for eligible provider/transport failures after primary retries.
- Final default validation passed ESLint, full Node unit tests, Atria Migration Guard, Workspace IA/projection/UI/call-count Chromium smoke, and real-host Workspace binding E2E.
- Android JVM tests and Android/Docker builds are no longer default validation/build steps; manual workflows remain available.
- Temporary branch `feat/agent-web-access-api-fallback` has been removed after merge.


### Worldbook Performance Foundation

- Foundation PR: #8
- Foundation baseline: `main@65321bb522febd369901127cd2b4b2c9883d4658`
- Foundation final head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`
- Foundation merge: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 continuation PR: #9
- W-04/W-05 baseline: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 final validated head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`
- W-04/W-05 squash merge: `main@03d97d655370b31c2a27dd1235f917deadd6246e`
- P-02–P-05 continuation PR: #10
- P-02–P-05 baseline: `main@03d97d655370b31c2a27dd1235f917deadd6246e`
- P-02–P-05 final validated head: `f752e0e1f532d2796b5b476acc2c57149973ef5a`
- P-02–P-05 squash merge / current `main`: `ff804b53adb514919cc3bfb6ac82334df5fe7cf2`
- Final merged tree: `848d4d8d88717737baec6e1d58abb90379fdf6e9`, identical to the validated task-head tree.
- Record: `features/worldbook-performance-foundation.md`
- P-01 bounded chat snapshots and W-01 through W-05 World Info work are complete.
- P-02 prompt diagnostics now use a lightweight per-chat index and per-message records; heavy prompt bodies are loaded on demand, old arrays migrate lazily and remain rollback-accessible.
- P-03 removes the full-chat message-depth rebuild from the formatting hot path. Latest-message depth is constant-time and the recent visible suffix remains bounded. Completed-message HTML caching / partial Markdown streaming remains deliberately disabled until Atria has a precise formatter revision contract for dynamic Regex, macros, formatter hooks, Showdown settings and DOMPurify hooks.
- P-04 now exposes engine-level `getChatRange`, `getChatInfo`, `appendChatMessages` and `patchChatMessages` capabilities with correctness fallbacks.
  - FS uses a disposable byte-offset JSONL index for warm range/info and native append.
  - SQLite/MySQL/PostgreSQL use their native JSON/JSONB operations for range/info/append.
  - SQLite/MySQL/PostgreSQL also implement the high-frequency whole-message `test/replace/remove` patch subset.
  - FS variable-length replace/remove remains on the reliable atomic full-rewrite fallback; a truly local crash-safe implementation would cross the explicit storage-format migration approval boundary.
  - Throttled backups materialize the complete chat only when the throttle actually executes.
- P-05 reuses Memory fact/support projections and builds relation/document/provider indexes once, avoiding repeated full-corpus scans while preserving retrieval semantics and stable RRF ordering.
- Native World Info state integration remains read-only: MVU/LoreState remain the state owners.
- `stateActivation` remains opt-in and defaults off; matched state conditions can sustain scene content without repeated keyword mentions.
- W-04 conservative indexing, dependency bundles, atomic budget selection and W-05 runtime compatibility classification remain unchanged.
- No new default online/per-entry model call was added; existing vectorized semantic recall remains opt-in.
- Final PR #10 validation passed Worldbook Performance Foundation #185 and Atria PR Checks #432.
  - #185: focused P-02/P-03/P-04/P-05 regressions, synthetic benchmark, real-host Chromium smoke, W-04/W-05 real-request and import/export E2E.
  - #432: ESLint, Atria Migration Guard and complete Node unit suite with MySQL 8.4 and PostgreSQL 16.
  - The validated code tree also passed Atria PR Checks #431 with 590 suites / 7,920 tests.
- Synthetic #183 reference measurements on Xeon 6973P / Node 24.20: 10k latest-message depth 1,000 calls median 0.013 ms; 3k-relation Memory fixture (9k corpus docs) corpus median 57.367 ms and ranking median 23.755 ms. These are CI synthetic measurements, not user-device SLA.
- Android JVM tests and Android/Docker image builds were intentionally not run because they remain opt-in.
- Cleanup workflow #10 succeeded and removed the temporary `feat/worldbook-performance-foundation` branch.
- Remaining deeper performance work is limited to explicitly deferred architecture boundaries such as a precise formatter-cache/partial-stream revision contract or crash-safe FS local replace/remove storage representation. Start any such work from the live `main` and treat storage-format migration as a separately approved task.

## Long-lived references

- Former Luker source/reference: `luker`
- SillyTavern upstream reference: `vanilla`

These are reference branches, not ordinary development bases.
