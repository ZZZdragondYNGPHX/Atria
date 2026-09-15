# AI Repository Operating Rules

This file is the authoritative entry point for AI assistants working on `ZZZdragondYNGPHX/Luker`.

## Repository identity

- Upstream: `funnycups/Luker`
- Maintained fork: `ZZZdragondYNGPHX/Luker`
- Upstream baseline branch: `release`
- Fork mirror branch: `release`
- Fork personal integration branch: `custom-release`
- Isolated bug fixes: `fix/*`
- Isolated features: `feat/*`

## Mandatory startup protocol

Before changing code for any new task:

1. Read `AGENTS.md`, `AI_HANDOFF.md`, and `FORK_MAINTENANCE.md` from the fork's `custom-release` branch.
2. If the task is a bug fix, also read `NEW_BUG_PROMPT.md`.
3. If the task is a new feature, also read `NEW_FEATURE_PROMPT.md`.
4. Read `.github/copilot-instructions.md` when the environment uses it.
5. Fetch the current HEAD of `funnycups/Luker:release`.
6. Check the latest relevant successful official Android `Build Android APK` workflow run and record its `head_sha`.
7. Compare that SHA with upstream `release` HEAD. Do not assume an Actions artifact, timestamp, or visible version number proves which source revision is newest.
8. Compare `ZZZdragondYNGPHX/Luker:release` with upstream `release`.
9. If the fork mirror is behind, synchronize the fork `release` before creating work branches. The mirror must remain free of private patches and fork-only AI documents.

## Task routing

### Bug fix

- Create a fresh `fix/<short-bug-name>` branch from the synchronized `release` unless the bug explicitly depends on an existing private patch.
- Follow `NEW_BUG_PROMPT.md` for investigation, testing, reporting, PR, and `custom-release` integration rules.

### New feature

- Create a fresh `feat/<short-feature-name>` branch from the synchronized `release` unless the feature explicitly depends on existing private behavior.
- Follow `NEW_FEATURE_PROMPT.md` for architecture analysis, implementation, testing, reporting, PR, and `custom-release` integration rules.

## Non-negotiable branch rules

- `release` is an upstream mirror. Never develop directly on it.
- Never merge `custom-release` into `release`.
- Never start unrelated work from an old `fix/*` or `feat/*` branch.
- One independent bug or feature = one branch = one upstream PR.
- `custom-release` is for verified personal fixes/features intended for daily use/builds plus fork-only maintenance documents.
- Private work should be integrated into `custom-release` only after it is understood, checked, and user-verified when practical.
- If upstream later contains an equivalent fix or feature, remove the redundant private implementation when refreshing `custom-release`.

## Engineering rules

For bugs, reproduce or establish the failure path and identify root cause before editing. For features, inspect existing architecture and reuse the appropriate state/service/UI/persistence path before introducing new infrastructure.

For all code work:

1. Prefer the smallest compatible change.
2. Avoid unrelated refactors.
3. Preserve existing data/config formats unless a migration is explicitly required.
4. Consider Web and Android behavior when shared frontend/runtime code is touched.
5. Pay attention to async initialization, lifecycle order, hydration, stale state, scope switching, persistence, and race conditions when relevant.
6. Do not change the app version merely to land a normal bug fix or feature.
7. Do not add generated artifacts, downloaded binaries, credentials, tokens, keystores, local paths, caches, APKs, or user data to commits.
8. Before committing, inspect the complete diff for unrelated changes.
9. Run targeted checks first, followed by syntax/lint/unit/e2e/build checks appropriate to the touched code.
10. Report only checks actually executed.

## Upstream and Android-build verification

The upstream project often distributes Android builds through GitHub Actions. Therefore, every claim that a source tree is "latest" must be verified against both:

- `funnycups/Luker:release` HEAD; and
- the `head_sha` of the latest relevant successful official Android build.

If they differ, explain why before selecting a baseline. Never silently base work on an arbitrary PR branch or a third-party fork just because it has a newer timestamp.

## Existing private work

See `AI_HANDOFF.md` for the current list of private fixes/features, their branches, integration state, and historical context. Do not infer current patch status from branch names alone; verify commits/diffs.

## PR discipline

Upstream PRs should contain only the isolated code change. Do not include fork-maintenance documents such as:

- `AGENTS.md`
- `AI_HANDOFF.md`
- `FORK_MAINTENANCE.md`
- `NEW_BUG_PROMPT.md`
- `NEW_FEATURE_PROMPT.md`
- `.github/copilot-instructions.md`

unless the upstream maintainer explicitly requests them.

When preparing an upstream PR, use the isolated `fix/*` or `feat/*` branch created from official `release`, not `custom-release`.
