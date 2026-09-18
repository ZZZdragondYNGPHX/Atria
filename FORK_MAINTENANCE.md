# Atria Maintenance

## Product model

Atria is maintained as a SillyTavern-based modified product. The active product line lives in `ZZZdragondYNGPHX/Atria`; the old Luker repository is legacy reference material.

## Branch roles

- `main`: authoritative Atria integration branch.
- `docs`: permanent development documentation and latest handoff.
- `vanilla`: selected SillyTavern upstream snapshot; refresh only when needed.
- `luker`: selected legacy Luker snapshot; refresh only when needed.
- `feat/*`, `fix/*`, `refactor/*`, `chore/*`: temporary task branches created from current `main`.

## Normal development flow

1. Verify current `main`.
2. Read `AGENTS.md` and the latest handoff from `docs:handoff/latest-handoff.md`.
3. Create one temporary task branch from `main`.
4. Implement and validate the isolated task.
5. Write the completed implementation record to `docs`.
6. Merge into `main`.
7. Verify integration.
8. Delete the completed task branch.

## Reference branches

`vanilla` and `luker` are reference-only during normal work.

Use `vanilla` for SillyTavern upstream comparison, compatibility work, or deliberate upstream refreshes. Use `luker` for migration archaeology or legacy behavior comparison. Never blindly merge either reference branch into `main`.

The repository provides a manual reference-sync workflow. Refresh reference branches only when needed.

## Verification

Select checks based on the touched surface:

- JavaScript/frontend/backend: syntax, lint, targeted tests, unit/regression tests.
- Runtime/storage/memory/orchestration: relevant unit and integration coverage.
- Android: Android JVM tests for Kotlin/package changes; APK build when delivery/build behavior changes.
- CI/build changes: validate the actual workflow path when practical.

Do not describe unexecuted checks as passed.

## Documentation

The `docs` branch is the durable development knowledge base. At the end of a completed task, record:

- task goal and branch;
- baseline and resulting commit/PR;
- implementation summary;
- architecture or compatibility decisions;
- tests/checks actually run;
- known limitations or follow-up;
- migration/data/config impact.

Long-term handoff state belongs in `docs:handoff/latest-handoff.md`, not in stale task branches.
