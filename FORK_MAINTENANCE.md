# Fork Maintenance

This fork is maintained as an independent personal fork. The normal development baseline is `custom-release`.

## AI / automation entry point

Any AI assistant, coding agent, or automation working on this fork should first read from `custom-release`:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. this file
4. `NEW_BUG_PROMPT.md` for bug fixes, or `NEW_FEATURE_PROMPT.md` for new features
5. `.github/copilot-instructions.md` when applicable

A new session that only receives the repository URL should explicitly fetch these files from `custom-release` before editing code.

## Branch roles

- `custom-release`: authoritative personal development and integration branch. It contains the current fork behavior, verified fixes/features, and fork-only AI maintenance documentation.
- `fix/*`: one bug per branch. New bug-fix branches start from the latest `custom-release` unless the user explicitly chooses another base.
- `feat/*`: one feature per branch. New feature branches start from the latest `custom-release` unless the user explicitly chooses another base.
- `release`: optional upstream-reference/mirror branch. It may track `funnycups/Luker:release`, but ordinary private development does not depend on it being synchronized.

## Core development model

The fork is no longer maintained around upstream-first contribution flow.

For normal work:

1. Read the maintenance documents from `custom-release`.
2. Verify the current `custom-release` HEAD and inspect relevant recent changes.
3. Create a fresh `fix/*` or `feat/*` branch from that HEAD.
4. Implement and test the isolated change.
5. Merge the verified work back into `custom-release` when the user wants it in the daily build.
6. Update `AI_HANDOFF.md` when the change creates long-term architectural, behavioral, migration, or maintenance context that future sessions should know.

Upstream comparison is optional and task-driven, not a prerequisite for every bug or feature.

## Workflow for every new bug

1. Use the latest `ZZZdragondYNGPHX/Luker:custom-release` as the normal baseline.
2. Inspect whether the bug is caused by existing fork behavior, a previous private patch, or inherited upstream code.
3. Create a fresh `fix/<short-bug-name>` from `custom-release`.
4. Reproduce or establish the failure path and identify root cause before patching.
5. Make the smallest compatible change and test it.
6. Keep the fix isolated and traceable.
7. Merge it back into `custom-release` after it is sufficiently understood and checked for the user's use case.
8. Update long-term handoff notes when needed.

Only inspect or compare upstream when doing so helps diagnose the bug, find an existing upstream fix, assess compatibility, or prepare a deliberate upstream port/PR.

Full bug instructions live in `NEW_BUG_PROMPT.md`.

## Workflow for every new feature

1. Use the latest `ZZZdragondYNGPHX/Luker:custom-release` as the normal baseline.
2. Inspect the fork's current architecture and any private behavior the feature should integrate with.
3. Create a fresh `feat/<short-feature-name>` from `custom-release`.
4. Identify the correct module, state, service, UI, API, and persistence paths before coding.
5. Reuse existing infrastructure and prefer a minimal coherent implementation over duplicate subsystems.
6. Test the feature, including Web/Android and persistence/migration implications when relevant.
7. Keep the feature isolated and traceable.
8. Merge it back into `custom-release` after it is sufficiently understood and checked for the user's use case.
9. Update long-term handoff notes when needed.

Only inspect or compare upstream when it provides useful implementation context or when the user explicitly wants compatibility, porting, syncing, or an upstream contribution.

Full feature instructions live in `NEW_FEATURE_PROMPT.md`.

## Upstream refreshes

`funnycups/Luker` remains a reference source, not the day-to-day development base.

When deliberately refreshing this fork from upstream:

- inspect the incoming upstream range first;
- identify conflicts with private changes;
- preserve fork-specific behavior unless the user chooses to replace it;
- avoid resetting or recreating `custom-release` from upstream;
- treat removal of a private patch as a conscious migration decision, not automatic cleanup;
- test the integrated result before treating the refresh as complete.

The `release` branch may be updated as a convenience mirror, but keeping it synchronized is not a blocker for normal `fix/*` or `feat/*` work.

## Rules

- `custom-release` is the source of truth for normal personal development.
- Every unrelated `fix/*` or `feat/*` starts from the latest `custom-release` by default.
- Do not mix unrelated bugs/features in one branch.
- Do not start unrelated work from an old `fix/*` or `feat/*` branch.
- Do not develop directly on `release`.
- Never merge `custom-release` into `release` merely to preserve a mirror relationship.
- Do not discard private behavior just because upstream differs.
- Upstream PRs are optional and should only be prepared when the user explicitly asks.
- Report the exact branch, baseline commit, changed files, checks actually run, and resulting commit for each task.
