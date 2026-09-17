# AI Repository Operating Rules

This file is the authoritative entry point for AI assistants working on `ZZZdragondYNGPHX/Luker`.

## Repository identity

- Historical upstream/reference: `funnycups/Luker`
- Maintained fork: `ZZZdragondYNGPHX/Luker`
- Fork development baseline and daily integration branch: `custom-release`
- Optional upstream-reference/mirror branch: `release`
- Isolated bug fixes: `fix/*`
- Isolated features: `feat/*`

This fork is maintained independently. `custom-release` is the source of truth for normal development. New fixes and features are based on the current `custom-release`, not on upstream `release`.

## Mandatory startup protocol

Before changing code for any new task:

1. Read `AGENTS.md`, `AI_HANDOFF.md`, and `FORK_MAINTENANCE.md` from the fork's `custom-release` branch.
2. If the task is a bug fix, also read `NEW_BUG_PROMPT.md`.
3. If the task is a new feature, also read `NEW_FEATURE_PROMPT.md`.
4. Read `.github/copilot-instructions.md` when the environment uses it.
5. Fetch the current HEAD of `ZZZdragondYNGPHX/Luker:custom-release` and treat that commit as the normal work baseline.
6. Inspect relevant existing private fixes/features and recent history before creating a work branch so dependencies are not accidentally lost or duplicated.
7. Consult `funnycups/Luker:release` only when the task specifically requires upstream comparison, porting, compatibility analysis, or a deliberate upstream refresh.

Do not block ordinary private development on upstream HEAD, upstream Android Actions, or synchronization of the fork's `release` branch.

## Task routing

### Bug fix

- Create a fresh `fix/<short-bug-name>` branch from the latest `custom-release`.
- Follow `NEW_BUG_PROMPT.md` for investigation, testing, reporting, and reintegration rules.
- After the fix is understood and checked, merge it back into `custom-release` when the user wants it in the daily build.

### New feature

- Create a fresh `feat/<short-feature-name>` branch from the latest `custom-release`.
- Follow `NEW_FEATURE_PROMPT.md` for architecture analysis, implementation, testing, reporting, and reintegration rules.
- After the feature is understood and checked, merge it back into `custom-release` when the user wants it in the daily build.

## Non-negotiable branch rules

- `custom-release` is the authoritative personal development/integration branch.
- Start every unrelated `fix/*` or `feat/*` branch from the latest `custom-release` unless the user explicitly selects another base.
- Never start unrelated work from an old `fix/*` or `feat/*` branch.
- One independent bug or feature = one branch. Keep changes reviewable and traceable even though upstream PRs are no longer the default goal.
- Do not develop directly on `release`; it is only an optional upstream-reference/mirror branch.
- Never merge `custom-release` into `release` merely to keep `release` current.
- Private maintenance documents belong on `custom-release` and should travel with work branches created from it.
- Do not remove existing fork behavior merely because upstream differs. Upstream changes are inputs to evaluate, not automatically authoritative for this fork.

## Engineering rules

For bugs, reproduce or establish the failure path and identify root cause before editing. For features, inspect existing fork architecture and reuse the appropriate state/service/UI/persistence path before introducing new infrastructure.

For all code work:

1. Prefer the smallest compatible change that preserves the fork's current behavior unless the task intentionally changes it.
2. Avoid unrelated refactors.
3. Preserve existing data/config formats unless a migration is explicitly required.
4. Verify shared frontend/runtime changes for desktop Web and mobile browsers served by Termux. APK builds are not part of normal delivery; build an APK only when explicitly requested.
5. Pay attention to async initialization, lifecycle order, hydration, stale state, scope switching, persistence, and race conditions when relevant.
6. Do not change the app version merely to land a normal bug fix or feature.
7. Do not add generated artifacts, downloaded binaries, credentials, tokens, keystores, local paths, caches, APKs, or user data to commits.
8. Before committing, inspect the complete diff for unrelated changes.
9. Run targeted checks first, followed by syntax/lint/unit/e2e/build checks appropriate to the touched code.
10. Report only checks actually executed.

## Upstream relationship

`funnycups/Luker` remains a useful reference, but this fork no longer treats upstream synchronization or upstream PR submission as the default development workflow.

Check upstream when it is useful to:

- compare implementations;
- import a bug fix or feature;
- assess compatibility or conflicts;
- deliberately refresh `custom-release` with upstream changes;
- determine whether an upstream change makes a private patch obsolete.

When performing an upstream refresh, compare and preserve fork-specific behavior deliberately. Do not reset `custom-release` to upstream or discard private changes just to make histories match.

## Existing private work

See `AI_HANDOFF.md` and the live `custom-release` history for private fixes/features and historical context. The handoff document is a convenience snapshot and may be incomplete; Git history and current code are authoritative for what is actually integrated.

## Upstream PR policy

Upstream PRs are optional and must only be prepared when the user explicitly asks for one.

If an upstream PR is requested, first determine whether the change can be cleanly separated from fork-only dependencies. Do not rewrite the normal fork workflow around upstream constraints, and do not include fork-maintenance documents unless the upstream maintainer explicitly requests them.
