# Atria Namespace Migration

## Status

Implementation completed and validated on the task branch; integration into `main` is pending PR CI/merge.

## Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Task branch: `refactor/atria-namespace-migration`
- Baseline: `main@06fe61ac344f9240141489608b73b4072a3b6b99`
- Validated implementation head before PR: `6e8a046baa491b31a9854d5bd40ff835cc630e53`
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

## Namespace guard

`scripts/check-atria-namespace.sh` is the permanent residual gate and is invoked by Atria PR checks.

The active-code scan permits only narrow historical/reference locations:

- `docs/**` for migration/history documentation;
- `AGENTS.md` and `FORK_MAINTENANCE.md` for the documented legacy reference-branch model;
- `.github/workflows/sync-reference-branches.yml` because the long-lived `luker` reference branch intentionally remains available for migration archaeology.

Termux compressed/runtime distribution content is scanned separately.

## Validation actually executed

The migration executor completed successfully at generated implementation commit `73626c3a47ed02e840f7e599798ed165c14a8b21`, followed by CI/guard cleanup through `6e8a046baa491b31a9854d5bd40ff835cc630e53`.

Passed:

- Termux Bash syntax checks
- Atria namespace residual guard
- frontend library build (`node docker/build-lib.js`)
- ESLint
- dispatch/generation targeted Jest tests
- orchestrator targeted Jest tests
- Memory OS / memory graph / search / context / docs targeted Jest tests
- full Node unit suite
- Android JVM tests
- Android debug APK build
- final residual scan
- `git diff --check`

An intermediate APK validation failure was caused by the migration-only workflow omitting the existing Node.js Mobile runtime-major environment values. The validation workflow was aligned with the repository Android build workflow and the APK build then passed.

An intermediate push failure was caused by the GitHub Actions token not having permission to create/update workflow files. Workflow edits were therefore separated from the generated migration payload and applied through the repository GitHub connection.

## Data/config impact

This is intentionally destructive for predecessor-owned runtime namespaces. Existing Luker-specific runtime state may be ignored after migration, including old agent-runtime checkpoints, orchestration state/profiles, namespaced memory/plugin state, toolbox state, old config keys and old portable format identifiers.

Core SillyTavern-owned data and formats remain part of Atria and were not removed merely for branding.

## Integration

PR and final `main` merge details will be appended after CI passes and integration completes.
