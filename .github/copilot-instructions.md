# Copilot Instructions for ZZZdragondYNGPHX/Luker

This fork has special branch-maintenance rules. Before proposing or editing code, read from `custom-release`:

- `AGENTS.md`
- `AI_HANDOFF.md`
- `FORK_MAINTENANCE.md`
- `NEW_BUG_PROMPT.md` for bug work
- `NEW_FEATURE_PROMPT.md` for feature work

Core rules:

- `release` mirrors `funnycups/Luker:release` and must remain free of private patches and fork-only AI documents.
- New unrelated bugs start from an up-to-date `release` on a fresh `fix/<bug-name>` branch.
- New unrelated features start from an up-to-date `release` on a fresh `feat/<feature-name>` branch.
- One independent bug/feature per branch and per upstream PR.
- `custom-release` contains verified private fixes/features for personal use plus fork-only maintenance documents.
- Never merge `custom-release` into `release`.
- Verify both upstream `release` HEAD and the latest relevant successful official Android Actions build `head_sha` before claiming a baseline is current.
- For bugs, diagnose root cause before patching.
- For features, inspect existing architecture and reuse existing infrastructure before introducing new state/services/UI/persistence paths.
- Prefer minimal compatible changes and preserve existing config/data formats unless migration is actually required.
- Keep fork-maintenance documents out of upstream PRs.
- Report the baseline SHA, branch, changed files, checks actually run, resulting commit, upstream suitability, and `custom-release` integration status after each task.
