# Reusable New-Feature Handoff Prompt

Use this document when adding a new feature to the personal Luker fork. A short chat prompt may simply instruct the AI to read `AGENTS.md`, `AI_HANDOFF.md`, `FORK_MAINTENANCE.md`, and this file from `custom-release`.

---

I maintain a personal Luker fork independently and want you to take over a new feature from the live repository state rather than relying on prior chat memory.

Repository:

- My fork: `ZZZdragondYNGPHX/Luker`
- Primary development/integration branch: `custom-release`
- Optional upstream/reference repository: `funnycups/Luker`
- Optional upstream-reference/mirror branch in my fork: `release`

Before designing or editing code, read from my fork's `custom-release` branch:

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_FEATURE_PROMPT.md`
5. `.github/copilot-instructions.md` when relevant

Treat those files as the persistent handoff contract for this fork. Do not assume any SHA, version, branch state, or old-chat statement is still current.

## Baseline verification

For every new feature:

1. Fetch the live HEAD of `ZZZdragondYNGPHX/Luker:custom-release`.
2. Use that commit as the normal development baseline.
3. Inspect relevant current code, recent commits, existing tests, and private behavior already integrated in the same subsystem.
4. Do not require the fork's `release` branch to match upstream before starting work.
5. Do not require upstream Android Actions verification for ordinary private feature development.

## Branch policy

For an unrelated new feature, create a fresh branch from the latest `custom-release`:

`feat/<short-feature-name>`

Do not start new feature work from an old `fix/*` or `feat/*` branch unless the user explicitly asks to continue that branch.

One independent feature = one branch. Keep it isolated and reviewable even though an upstream PR is not the default destination.

## Architecture analysis before coding

Before implementation, inspect the current fork and determine:

- which existing module owns the feature;
- whether a similar implementation already exists and can be reused;
- which state/store/service/event/hook/API/UI/persistence layers are involved;
- whether configuration is global, character-scoped, chat-scoped, or another scope;
- whether import/export or migration behavior is affected;
- whether desktop Web and mobile browsers served by Termux share the same code path;
- whether Termux startup/storage, mobile keyboard/viewport, or filesystem behavior matters (native Android shell/WebView checks only for an explicitly requested APK task);
- whether the feature depends on private behavior already present in `custom-release`;
- whether the requested design should intentionally differ from upstream.

Prefer existing fork architecture over introducing parallel infrastructure. Keep one source of truth for state and business behavior where practical.

Give a short architecture/design conclusion before making edits.

## Implementation rules

- Make the smallest coherent implementation that fits the existing fork architecture.
- Preserve unrelated behavior already present in `custom-release`.
- Avoid unrelated refactors.
- Reuse existing services, stores, helpers, UI components, persistence mechanisms, and i18n conventions where possible.
- Preserve existing data/config formats unless a new field or migration is genuinely required.
- If adding persistent data, define safe defaults and maintain backward compatibility where practical.
- Do not duplicate business logic only to simplify UI code.
- Follow existing Luker UI/interaction conventions unless the task intentionally redesigns them.
- Use the existing localization system for user-facing text when applicable.
- Do not change the app version just to land a normal feature.
- Never commit credentials, tokens, keystores, local paths, user data, APKs, downloaded binaries, caches, or generated build output.

For async/stateful features, explicitly consider initialization order, hydration, stale state, race conditions, teardown, reload, character/chat switching, and scope switching.

## Testing and review

Before committing:

1. Inspect the complete diff and remove unrelated/debug changes.
2. Add or update the most relevant tests when practical.
3. Run targeted tests first.
4. Run syntax, lint, unit, regression/e2e and desktop/mobile browser checks appropriate to the touched code. Do not build APKs unless explicitly requested.
5. Report exactly which checks were actually run and which were not. Never call an unexecuted check "passed."

If write access is available, commit the feature to the isolated `feat/*` branch.

After the feature is understood and sufficiently checked, merge it into `custom-release` when I ask for integration or when the task explicitly includes integration.

## Upstream policy

Upstream is optional reference material, not the default development target.

Inspect `funnycups/Luker` when it is useful for:

- comparing an existing implementation;
- importing an upstream feature or API change;
- checking compatibility/conflicts;
- deliberately refreshing the fork;
- preparing an upstream contribution that I explicitly requested.

Do not redesign the feature around upstream contribution constraints unless I ask for that.

## Upstream PR policy

Do not prepare or submit an upstream PR by default.

Only do so when I explicitly request it. If requested, determine whether the feature can be separated cleanly from private fork dependencies and keep fork-only maintenance documents out of the upstream PR unless the maintainer explicitly asks for them.

## custom-release integration

`custom-release` is the destination for successful private development, not a secondary copy of upstream.

When integrating a finished `feat/*` branch:

- preserve traceable history;
- resolve conflicts in favor of the intended fork behavior;
- run relevant checks after integration when practical;
- update `AI_HANDOFF.md` only when the feature introduces durable architecture, migration, dependency, or maintenance context.

Do not wait for upstream acceptance before integrating a feature intended for this fork.

## Required final report

At the end of every feature task, report:

- `custom-release` baseline SHA used;
- feature branch name;
- architecture owner/module;
- existing infrastructure reused;
- design summary;
- changed files;
- new persistent fields/configuration and migration status, if any;
- desktop Web/mobile Termux differences;
- tests/checks actually run and results;
- resulting commit SHA;
- whether the feature has been merged into `custom-release`;
- dependency on existing private fork behavior, if any;
- new long-term maintenance burden, if any;
- upstream comparison or PR status only if upstream work was actually requested or performed.

New feature:

[Describe the feature goal]

Expected interaction:

[Describe how the user should operate it]

Expected result:

[Describe the desired behavior]

Constraints:

[Compatibility, desktop Web/mobile Termux, persistence, scope, UI, etc.]

References / screenshots / files:

[Attach or link anything useful]

---
