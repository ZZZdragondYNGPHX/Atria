# AI Repository Operating Rules

This file is the authoritative entry point for AI assistants working on `ZZZdragondYNGPHX/Luker`.

## Repository identity

- Upstream: `funnycups/Luker`
- Maintained fork: `ZZZdragondYNGPHX/Luker`
- Upstream baseline branch: `release`
- Fork mirror branch: `release`
- Fork personal integration branch: `custom-release`
- Isolated fixes: `fix/*`

## Mandatory startup protocol

Before changing code for any new task:

1. Read `AGENTS.md`, `AI_HANDOFF.md`, and `FORK_MAINTENANCE.md` from the fork's `custom-release` branch.
2. Fetch the current HEAD of `funnycups/Luker:release`.
3. Check the latest successful official Android `Build Android APK` workflow run and record its `head_sha`.
4. Compare that SHA with upstream `release` HEAD. Do not assume that an Actions artifact or a visible version number proves which source revision is newest.
5. Compare `ZZZdragondYNGPHX/Luker:release` with upstream `release`.
6. If the fork mirror is behind, synchronize the fork `release` to upstream before creating a new fix branch. The mirror branch must remain free of private patches.
7. Create one fresh `fix/<short-bug-name>` branch from the synchronized fork `release` unless the bug explicitly depends on an existing private patch.

## Non-negotiable branch rules

- `release` is an upstream mirror. Never develop directly on it.
- Never merge `custom-release` into `release`.
- Never start an unrelated bug from an old `fix/*` branch.
- One bug or feature = one branch = one upstream PR.
- `custom-release` is for verified personal fixes intended for daily use/builds.
- A private fix should be integrated into `custom-release` only after it is understood and verified.
- If upstream later contains an equivalent fix, remove the redundant private patch when refreshing `custom-release`.

## Engineering rules

For bug fixing:

1. Reproduce or establish the failure path before editing.
2. Identify the root cause. Do not patch only the visible symptom if lifecycle, persistence, async initialization, scope selection, or stale state is the real cause.
3. Prefer the smallest compatible change. Avoid unrelated refactors.
4. Preserve existing data formats and configuration compatibility unless a migration is explicitly required.
5. Consider Web and Android behavior when shared frontend/runtime code is touched.
6. Do not change the app version merely to land a normal bug fix.
7. Do not add generated artifacts, downloaded binaries, credentials, tokens, keystores, local paths, or user data to commits.
8. Before committing, inspect the diff for unrelated changes.
9. Run the most relevant available checks: targeted tests first, then syntax/lint/build checks appropriate to the touched files.
10. In the handoff, state the root cause, changed files, tests performed, remaining risks, and exact branch/commit.

## Upstream and Android-build verification

The upstream project often distributes Android builds through GitHub Actions. Therefore, every claim that a source tree is "latest" must be verified against both:

- `funnycups/Luker:release` HEAD; and
- the `head_sha` of the latest relevant successful official Android build.

If they differ, explain why before selecting a baseline. Never silently base a fix on an arbitrary PR branch or a third-party fork just because it has a newer timestamp.

## Existing private work

See `AI_HANDOFF.md` for the current list of private fixes, their branches, and their integration state. Do not infer current patch status from branch names alone; verify commits/diffs.

## PR discipline

Upstream PRs should contain only the isolated fix. Do not include fork-maintenance documents such as `AGENTS.md`, `AI_HANDOFF.md`, `FORK_MAINTENANCE.md`, or `.github/copilot-instructions.md` unless the upstream maintainer explicitly asks for them.

When preparing an upstream PR, use the isolated `fix/*` branch created from official `release`, not `custom-release`.
