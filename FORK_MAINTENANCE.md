# Fork Maintenance

This fork is maintained with a clean upstream-mirror workflow.

## AI / automation entry point

Any AI assistant, coding agent, or automation working on this fork should first read from `custom-release`:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. this file
4. `NEW_BUG_PROMPT.md` for bug fixes, or `NEW_FEATURE_PROMPT.md` for new features
5. `.github/copilot-instructions.md` when applicable

These files intentionally live on `custom-release`, not on the clean `release` mirror. A new session that only receives the repository URL should explicitly fetch them from `custom-release` before editing code.

## Branch roles

- `release`: mirror of `funnycups/Luker:release`. Do not put personal patches or fork-only AI docs here.
- `custom-release`: personal integration branch containing verified fixes/features intended for daily use/builds, plus fork-only AI maintenance documentation.
- `fix/*`: one bug per branch. New bug-fix branches start from the latest synchronized `release` unless the bug explicitly depends on a private patch.
- `feat/*`: one feature per branch. New feature branches start from the latest synchronized `release` unless the feature explicitly depends on private behavior.

## Current private fix

- `fix/orchestrator-character-global-presets`: keeps global orchestrator presets accessible inside character cards, defaults new presets inside a character to character scope, and supports copying a character preset to global scope.

`custom-release` includes that verified private fix. See `AI_HANDOFF.md` for the current known commit and historical root-cause context.

## Workflow for every new bug

1. Check the latest `funnycups/Luker:release` commit and the latest relevant successful official Android Actions build SHA.
2. If those SHAs differ, understand why before choosing the baseline.
3. Keep this fork's `release` synchronized to the authoritative upstream `release` commit before starting new work.
4. Create a fresh `fix/<short-bug-name>` branch from `release`.
5. Reproduce or establish the failure path and identify root cause before patching.
6. Make the smallest compatible change and test it.
7. Submit the isolated `fix/*` branch upstream when appropriate.
8. After verification, integrate it into `custom-release` as a traceable change and update `AI_HANDOFF.md`.
9. When upstream later includes an equivalent fix, drop the redundant private patch during the next `custom-release` refresh.

Full bug instructions live in `NEW_BUG_PROMPT.md`.

## Workflow for every new feature

1. Check the latest `funnycups/Luker:release` commit and the latest relevant successful official Android Actions build SHA.
2. If those SHAs differ, understand why before choosing the baseline.
3. Keep this fork's `release` synchronized before starting feature work.
4. Create a fresh `feat/<short-feature-name>` branch from `release`.
5. Inspect the existing architecture before coding and identify the correct module, state, service, UI, API, and persistence paths.
6. Reuse existing infrastructure and prefer a minimal coherent implementation over unrelated refactors or duplicate subsystems.
7. Test the feature, including Web/Android and persistence/migration implications when relevant.
8. Submit the isolated `feat/*` branch upstream when the feature is generally useful and upstream-compatible.
9. After user verification, integrate it into `custom-release` as a traceable change and update `AI_HANDOFF.md`.
10. If upstream later implements equivalent functionality, prefer removing the redundant private implementation when upstream fully covers the need.

Full feature instructions live in `NEW_FEATURE_PROMPT.md`.

## Rules

- Never develop directly on `release`.
- Never merge `custom-release` into `release`.
- Do not mix unrelated bugs/features in one branch or PR.
- Do not start unrelated work from an old `fix/*` or `feat/*` branch by default.
- Treat upstream `release` and the SHA used by the official Android build as authoritative signals that must both be checked.
- Keep `custom-release` rebuildable from upstream plus a small, known set of private changes.
- Keep fork-only maintenance docs out of upstream PRs unless the upstream maintainer explicitly requests them.
