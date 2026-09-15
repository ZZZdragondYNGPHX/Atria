# Fork Maintenance

This fork is maintained with a clean upstream-mirror workflow.

## AI / automation entry point

Any AI assistant, coding agent, or automation working on this fork should first read:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. this file
4. `.github/copilot-instructions.md` when applicable

These files intentionally live on `custom-release`, not on the clean `release` mirror. A new session that only receives the repository URL should explicitly fetch them from `custom-release` before editing code.

## Branch roles

- `release`: mirror of `funnycups/Luker:release`. Do not put personal patches here.
- `custom-release`: personal integration branch containing verified fixes intended for daily use/builds, plus fork-only AI maintenance documentation.
- `fix/*`: one bug per branch. New bug-fix branches should start from the latest `release`, not from `custom-release` or another `fix/*` branch unless the bug explicitly depends on a private patch.

## Current private fix

- `fix/orchestrator-character-global-presets`: keeps global orchestrator presets accessible inside character cards, defaults new presets inside a character to character scope, and supports copying a character preset to global scope.

`custom-release` includes that verified private fix. See `AI_HANDOFF.md` for the current known commit and historical root-cause context.

## Workflow for every new bug

1. Check the latest `funnycups/Luker:release` commit and the latest relevant successful official Android Actions build SHA.
2. If those SHAs differ, understand why before choosing the baseline.
3. Keep this fork's `release` synchronized to the authoritative upstream `release` commit before starting new work.
4. Create a fresh `fix/<short-bug-name>` branch from `release`.
5. Reproduce and identify the root cause before patching.
6. Make the smallest compatible change and test it.
7. Submit the isolated `fix/*` branch upstream when appropriate.
8. If the fix is verified for personal use, integrate it into `custom-release` as a traceable change.
9. When upstream later includes an equivalent fix, drop the redundant private patch during the next `custom-release` refresh.

## Rules

- Never develop directly on `release`.
- Never merge `custom-release` into `release`.
- Do not mix unrelated bugs in one branch or PR.
- Do not start a new bug from an old `fix/*` branch by default.
- Treat upstream `release` and the SHA used by the official Android build as authoritative signals that must both be checked.
- Keep `custom-release` rebuildable from upstream plus a small, known set of private patches.
- Keep fork-only maintenance docs out of upstream PRs unless the upstream maintainer explicitly requests them.
