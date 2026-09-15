# Copilot Instructions for ZZZdragondYNGPHX/Luker

This fork is maintained independently. Before proposing or editing code, read from `custom-release`:

- `AGENTS.md`
- `AI_HANDOFF.md`
- `FORK_MAINTENANCE.md`
- `NEW_BUG_PROMPT.md` for bug work
- `NEW_FEATURE_PROMPT.md` for feature work

Core rules:

- `custom-release` is the authoritative personal development and integration branch.
- New unrelated bugs start from the latest `custom-release` on a fresh `fix/<bug-name>` branch.
- New unrelated features start from the latest `custom-release` on a fresh `feat/<feature-name>` branch.
- Preserve existing private behavior already integrated into `custom-release` unless the task intentionally changes it.
- One independent bug/feature per branch.
- `release` is only an optional upstream-reference/mirror branch; do not use it as the normal development base.
- Do not require upstream synchronization or official Android Actions verification before ordinary private development.
- `funnycups/Luker` is reference material unless the task explicitly involves upstream comparison, porting, refresh, compatibility analysis, or contribution.
- Upstream PRs are optional and only prepared when explicitly requested.
- For bugs, diagnose root cause before patching.
- For features, inspect existing fork architecture and reuse existing infrastructure before introducing new state/services/UI/persistence paths.
- Prefer minimal compatible changes and preserve existing config/data formats unless migration is actually required.
- Report the `custom-release` baseline SHA, branch, changed files, checks actually run, resulting commit, integration status, and private-behavior dependencies after each task.
