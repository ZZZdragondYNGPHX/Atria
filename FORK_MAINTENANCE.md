# Fork Maintenance

This fork is maintained with a clean upstream-mirror workflow.

## Branch roles

- `release`: mirror of `funnycups/Luker:release`. Do not put personal patches here.
- `custom-release`: personal integration branch containing verified fixes intended for daily use/builds.
- `fix/*`: one bug per branch. New bug-fix branches should start from the latest `release`, not from `custom-release` or another `fix/*` branch unless the bug explicitly depends on a private patch.

## Current private fix

- `fix/orchestrator-character-global-presets`: keeps global orchestrator presets accessible inside character cards, defaults new presets inside a character to character scope, and supports copying a character preset to global scope.

`custom-release` was created from this verified fix branch, so it currently includes that patch.

## Workflow for every new bug

1. Check the latest `funnycups/Luker:release` commit and the latest official Android Actions build SHA.
2. Keep this fork's `release` synchronized to the upstream `release` commit before starting new work.
3. Create a fresh `fix/<short-bug-name>` branch from `release`.
4. Reproduce and identify the root cause before patching.
5. Make the smallest compatible change and test it.
6. Submit the isolated `fix/*` branch upstream when appropriate.
7. If the fix is verified for personal use, merge/apply it into `custom-release`.
8. When upstream later includes an equivalent fix, drop the redundant private patch during the next `custom-release` refresh.

## Rules

- Never develop directly on `release`.
- Do not mix unrelated bugs in one branch or PR.
- Do not start a new bug from an old `fix/*` branch by default.
- Treat upstream `release` and the SHA used by the official Android build as the authoritative baseline.
- Keep `custom-release` rebuildable from upstream plus a small, known set of private patches.
