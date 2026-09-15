# Reusable New-Feature Handoff Prompt

Use this document when adding a new feature to the personal Luker fork. A short chat prompt may simply instruct the AI to read `AGENTS.md`, `AI_HANDOFF.md`, and `FORK_MAINTENANCE.md`; those documents route feature work here.

---

I maintain a personal fork of Luker and want you to take over a new feature from the live repository state rather than relying on prior chat memory.

Repositories:

- Upstream: `funnycups/Luker`
- My fork: `ZZZdragondYNGPHX/Luker`
- Upstream/fork mirror branch: `release`
- Personal integration branch: `custom-release`

Before designing or editing code, read from my fork's `custom-release` branch:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_FEATURE_PROMPT.md`
5. `.github/copilot-instructions.md` when relevant

Treat those files as the persistent handoff contract for this fork. Do not assume any SHA, version, branch state, or old-chat statement is still current.

## Baseline verification

For every new feature:

1. Fetch the live HEAD of `funnycups/Luker:release`.
2. Check the latest relevant successful official `Build Android APK` GitHub Actions run and record its `head_sha`.
3. Compare the Action SHA with upstream `release` HEAD and explain any mismatch before choosing a baseline.
4. Confirm `ZZZdragondYNGPHX/Luker:release` matches the authoritative upstream baseline.
5. Keep `release` as a clean upstream mirror. Never add private features, fixes, or AI-maintenance documents directly to it.

## Branch policy

For an unrelated new feature, create a fresh branch from the latest synchronized `release`:

`feat/<short-feature-name>`

Do not start new feature work from an old `fix/*`, old `feat/*`, or `custom-release` by default.

Only use `custom-release` or another private branch as the base when the new feature explicitly depends on existing private behavior. If so, state that dependency before implementation and explain whether the result can still be separated for upstream.

One independent feature = one branch = one upstream PR.

## Architecture analysis before coding

Before implementation, inspect the current project and determine:

- which existing module owns the feature;
- whether a similar implementation already exists and can be reused;
- which state/store/service/event/hook/API/UI/persistence layers are involved;
- whether configuration is global, character-scoped, chat-scoped, or another scope;
- whether import/export or migration behavior is affected;
- whether Web and Android share the same code path;
- whether Android shell, WebView, native bridge, storage permissions, keyboard/viewport, or filesystem behavior matters;
- whether the feature depends on a private patch already present in `custom-release`;
- whether the feature is broadly upstream-compatible or intentionally private-only.

Prefer existing architecture over introducing parallel infrastructure. Keep one source of truth for state and business behavior where practical.

Give a short architecture/design conclusion before making edits.

## Implementation rules

- Make the smallest coherent implementation that fits the existing architecture.
- Avoid unrelated refactors.
- Reuse existing services, stores, helpers, UI components, persistence mechanisms, and i18n conventions where possible.
- Preserve existing data/config formats unless a new field or migration is genuinely required.
- If adding persistent data, define safe defaults and maintain backward compatibility where practical.
- Do not duplicate business logic only to simplify UI code.
- Follow existing Luker UI/interaction conventions.
- Use the existing localization system for user-facing text when applicable.
- Do not change the app version just to land a normal feature.
- Never commit credentials, tokens, keystores, local paths, user data, APKs, downloaded binaries, caches, or generated build output.

For async/stateful features, explicitly consider initialization order, hydration, stale state, race conditions, teardown, reload, character/chat switching, and scope switching.

## Testing and review

Before committing:

1. Inspect the complete diff and remove unrelated/debug changes.
2. Add or update the most relevant tests when practical.
3. Run targeted tests first.
4. Run syntax, lint, unit, regression/e2e, build, or Android checks appropriate to the touched code.
5. Report exactly which checks were actually run and which were not. Never call an unexecuted check "passed."

If write access is available, commit the feature to the isolated `feat/*` branch. Never modify `release` directly.

## Upstream PR policy

If the feature is generally useful and does not depend on private fork behavior, keep the implementation clean enough for an upstream PR.

An upstream PR must not include fork-only maintenance files unless the maintainer explicitly asks for them:

- `AGENTS.md`
- `AI_HANDOFF.md`
- `FORK_MAINTENANCE.md`
- `NEW_BUG_PROMPT.md`
- `NEW_FEATURE_PROMPT.md`
- `.github/copilot-instructions.md`

If the feature is intentionally private-only, say so clearly instead of forcing an upstream-shaped design.

## custom-release integration

Do not automatically integrate a newly implemented feature into `custom-release` merely because the code compiles.

First complete the isolated `feat/*` implementation and relevant checks. After the user verifies the feature in real use, integrate it into `custom-release` as a traceable private change and update `AI_HANDOFF.md` with:

- feature purpose;
- architecture/design summary;
- feature branch;
- commit SHA;
- changed areas;
- persistent data/config additions or migrations;
- private-patch dependencies;
- Web/Android caveats;
- upstream PR status;
- `custom-release` integration status;
- long-term maintenance notes.

If upstream later implements equivalent functionality, compare the implementations and prefer removing the redundant private implementation when upstream fully covers the need.

## Required final report

At the end of every feature task, report:

- upstream `release` SHA used;
- latest checked official Android build SHA;
- whether those SHAs match;
- feature branch name;
- architecture owner/module;
- existing infrastructure reused;
- design summary;
- changed files;
- new persistent fields/configuration and migration status, if any;
- Web/Android differences;
- tests/checks actually run and results;
- resulting commit SHA;
- upstream suitability;
- PR created/prepared status;
- `custom-release` integration status;
- new long-term maintenance burden or dependency, if any.

New feature:

[Describe the feature goal]

Expected interaction:

[Describe how the user should operate it]

Expected result:

[Describe the desired behavior]

Constraints:

[Compatibility, Android/Web, persistence, scope, UI, etc.]

References / screenshots / files:

[Attach or link anything useful]

---
