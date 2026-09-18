# Latest Handoff

## Current state

Atria is an independent SillyTavern-based modified product. The product bootstrap, Atria hard-cutover namespace migration, Agent & Memory Workspace redesign, Termux main-branch pinning, agent-native Web Access / API fallback integration, and the Worldbook Performance Foundation are complete and merged into `main`.

Current authoritative `main`:

- `03d97d655370b31c2a27dd1235f917deadd6246e`

This commit is the squash merge of PR #9. The World Info foundation now includes bounded chat snapshot ownership, occurrence-level provenance, explicit evaluation commits, native read-only state conditions, committed transition events, provider-owned scene persistence, incremental candidate indexing, explicit dependency bundles, atomic budget selection, and typed compatibility routing.

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
- W-04/W-05 squash merge / current `main`: `03d97d655370b31c2a27dd1235f917deadd6246e`
- Record: `features/worldbook-performance-foundation.md`
- P-01 bounded chat snapshots and W-01 through W-05 World Info work are complete.
- Native World Info state integration remains read-only: MVU/LoreState remain the state owners.
- `stateActivation` remains opt-in and defaults off; matched state conditions can sustain scene content without repeated keyword mentions.
- W-04 adds conservative incremental candidate indexing. Unsupported/dynamic entries remain on the compatibility scan path, and index failure degrades to the complete candidate set.
- Explicit required dependencies are resolved as bounded atomic bundles with cycle/missing/ineligibility/mutual-exclusion guards.
- Budget selection supports full/compact bundle variants and never partially injects a required bundle.
- W-05 uses runtime capability classification (`atria_v1`, `indexed_legacy`, `compatibility`) instead of rewriting old user data.
- Character-book round-trip preserves W-04 Atria extension fields and unknown World Info fields.
- No new default online/per-entry model call was added; the existing vectorized semantic path remains opt-in.
- Final W-04/W-05 validation passed Worldbook Performance Foundation #105 and Atria PR Checks #352, including ESLint, complete Node unit tests, Migration Guard, focused selection tests, 1k/10k benchmark, real-host Chromium smoke, real mock-model request acceptance, and import/export round-trip acceptance.
- Android JVM tests and Android/Docker image builds were intentionally not run because they remain opt-in.
- The temporary `feat/worldbook-performance-foundation` branch was removed by the merged-task cleanup workflow.
- Remaining master-plan work is P-02 through P-05 and should start from the live `main`.

## Long-lived references

- Former Luker source/reference: `luker`
- SillyTavern upstream reference: `vanilla`

These are reference branches, not ordinary development bases.
