# Atria Namespace Migration

## Status

Implementation completed and fully validated on the task branch. PR #3 CI is green; integration into `main` is the remaining integration step.

## Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Task branch: `refactor/atria-namespace-migration`
- Baseline: `main@06fe61ac344f9240141489608b73b4072a3b6b99`
- Final validated task-branch head: `1aa9f0961a785db0b4512a1a9910981436bcc090`
- Formal plan: `refactor/atria-namespace-migration:docs/plans/atria-namespace-migration.md`

## Goal

Perform a hard-cutover namespace migration for Atria-owned functionality inherited from the former Luker product line, while preserving genuine SillyTavern upstream identifiers and formats.

Backward compatibility with Luker-owned runtime state, APIs, protocol fields, portable orchestrator formats, IndexedDB/localStorage/FloorState namespaces, tool names and Termux state was intentionally not retained.

## Implementation summary

The migration replaced Atria-owned predecessor naming across the active product, including:

- backend dispatch/generation paths and symbols:
  - `src/luker-dispatch` -> `src/atria-dispatch`
  - `luker-generation.js` -> `atria-generation.js`
  - `runLukerDispatch` -> `runAtriaDispatch`
  - `luker_generation` -> `atri_generation`
  - `x-luker-*` -> `x-atria-*`
  - `luker.*` configuration keys -> `atria.*`
- frontend/public surfaces:
  - `Luker` / `lukerContext` -> `Atria` / `atriaContext`
  - Atria-owned JS/CSS filenames, DOM IDs/classes and data attributes
- orchestration and agent-runtime namespaces:
  - `luker_orch_*` -> `atri_orch_*`
  - orchestrator profile/state/anchor and custom-tool identifiers
- memory/search/context/docs namespaces:
  - `luker_memory_*` -> `atri_memory_*`
  - `luker_mg_*` -> `atri_mg_*`
  - `luker_ctx_*` -> `atri_ctx_*`
  - `luker_docs_*` -> `atri_docs_*`
  - `luker_web_*` and search-agent identifiers -> `atri_*`
- persistent/runtime namespaces:
  - Atria-owned databases, state keys, runtime directories, cache/checkpoint names and exported format tags now use Atria/atri naming
- Termux:
  - launcher/toolbox/runtime/dist filenames use Atria naming
  - `LUKER_*` environment variables use `ATRIA_*`
  - repository/runtime URLs point to `ZZZdragondYNGPHX/Atria`
  - compressed runtime and base64 distribution assets were regenerated
- tests/docs:
  - `tests/luker-*` and dispatch/generation tests were renamed
  - product documentation such as `what-is-luker` was renamed/reworked as Atria documentation
  - stale SillyTavern 1.19 adaptation diagnostic artifacts were removed

No alias, dual-read, dual-write, fallback, compatibility global or legacy tool registration was added.

### Post-PR hard-cutover audit

After the initial PR was opened, a second semantic audit removed mechanically-renamed compatibility paths that still violated the formal hard-cutover plan:

- Search Tools no longer imports predecessor index/anchor sidecars into FloorState.
- Orchestrator no longer imports predecessor anchor/index state or maintains a schema-stamp migrator.
- Memory Graph now persists only under `atri_memory_graph`, `atri_memory_graph__meta`, and `atri_memory_graph__floor_log`; its v5/v8 predecessor migration pipeline was removed.
- Orchestrator portable/profile compatibility was reduced to the current schema: V1-V3 portable format constants, wrapped-director lifting, `tools.memory` / `tools.search` translation, `note.add/delete`, and `previous_snapshot` compatibility were removed.
- Connection Manager's former Luker one-shot proxy-to-base-url settings migration was removed rather than renamed to Atria.
- CEA helper tools now use the same canonical names internally and model-facing; the mechanically-renamed `atria_card_*` helper alias layer was removed.
- Iteration-studio local/session persistence was hard-cut to Atria-owned namespaces:
  - `atri_orchestrator_iter_studio_history`
  - `atri_iter_studio_global_sessions`
  - `atri_mg_schema_iter_history`
  - `atri_mg_schema_iter_global_sessions`
  - `atri_cea_editor_iter_sessions`
- Orchestrator / Memory Graph / CEA settings-to-sidecar session movers and CEA predecessor-session readers were removed. Predecessor session buckets are ignored rather than copied or deleted.
- Termux shell syntax checks were added to the permanent PR migration guard, including the compressed runtime script.

## Namespace guard

`scripts/check-atria-namespace.sh` is the permanent residual gate and is invoked by Atria PR checks.

The active-code scan permits only narrow historical/reference locations:

- `docs/**` for migration/history documentation;
- `AGENTS.md` and `FORK_MAINTENANCE.md` for the documented legacy reference-branch model;
- `.github/workflows/sync-reference-branches.yml` because the long-lived `luker` reference branch intentionally remains available for migration archaeology.

Termux compressed/runtime distribution content is scanned separately.

## Validation actually executed

Final validation was performed on task-branch head `1aa9f0961a785db0b4512a1a9910981436bcc090`.

PR #3 / Atria PR Checks run #63 completed successfully:

- Atria Migration Guard: passed
  - product identity checks
  - `scripts/check-atria-namespace.sh`
  - Termux / Android shell syntax checks
  - compressed Termux runtime shell syntax check
- frontend library build (`node docker/build-lib.js`): passed as the prerequisite step of the Node unit-test job
- ESLint: passed
- full Node unit suite: passed
  - includes dispatch/generation, orchestrator, Memory OS / memory graph, search/context/docs, CEA and persistence coverage
- Android JVM tests: passed
- Atria Hard Cutover Inventory run #52: passed

Earlier pre-PR validation also completed the Android debug APK build and `git diff --check`.

Intermediate CI failures during the second audit were caused by tests that still asserted predecessor migration/alias behavior. Those tests were rewritten to assert the hard-cutover contract instead; no compatibility behavior was restored to make CI pass.

## Data/config impact

This is intentionally destructive for predecessor-owned runtime namespaces. Existing Luker-specific runtime state may be ignored after migration, including old agent-runtime checkpoints, orchestration state/profiles, namespaced memory/plugin state, toolbox state, old config keys and old portable format identifiers.

Core SillyTavern-owned data and formats remain part of Atria and were not removed merely for branding.

## Integration

PR #3 is ready to merge after final task-branch validation. The resulting `main` merge SHA and branch-cleanup verification will be appended after integration.
