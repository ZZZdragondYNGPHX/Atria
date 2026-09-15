# Copilot Instructions for ZZZdragondYNGPHX/Luker

This fork has special branch-maintenance rules. Before proposing or editing code, read the root `AGENTS.md`, `AI_HANDOFF.md`, and `FORK_MAINTENANCE.md` from `custom-release`.

Core rules:

- `release` mirrors `funnycups/Luker:release` and must remain free of private patches.
- New unrelated bugs start from an up-to-date `release` on a fresh `fix/<bug-name>` branch.
- One bug/feature per branch and per upstream PR.
- `custom-release` contains verified private fixes for personal use.
- Never merge `custom-release` into `release`.
- Verify both upstream `release` HEAD and the latest relevant successful official Android Actions build `head_sha` before claiming a baseline is current.
- Diagnose root cause before patching; prefer minimal compatible changes and preserve existing config/data formats.
- Keep these fork-maintenance documents out of upstream PRs.
- After a fix, report baseline SHA, branch, root cause, changed files, checks run, resulting commit, upstream suitability, and custom-release integration status.
