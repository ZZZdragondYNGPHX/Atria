# AI Handoff Context

This document stores fork-specific context that should survive across chats and different AI tools. It is a snapshot and navigation aid; live `custom-release` code and Git history remain authoritative.

## Read order for a new AI session

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. `NEW_BUG_PROMPT.md` for bug work, or `NEW_FEATURE_PROMPT.md` for feature work
5. `.github/copilot-instructions.md` when applicable
6. Files directly relevant to the task
7. Relevant `custom-release` history and existing private implementations

Only inspect `funnycups/Luker` when the task actually benefits from upstream comparison, porting, compatibility analysis, or a deliberate upstream refresh.

## Current repository model

- Historical upstream/reference repository: `funnycups/Luker`
- Maintained personal fork: `ZZZdragondYNGPHX/Luker`
- Primary development/integration branch: `custom-release`
- Optional upstream-reference/mirror branch: `release`
- Per-bug branches: `fix/*`
- Per-feature branches: `feat/*`

The maintenance model is now independent-fork first. `custom-release` is the normal source of truth and the base for new work.

## Current maintenance mode

The owner intends to maintain this fork primarily for personal use rather than organize every change around upstream contribution.

Therefore:

- new `fix/*` branches start from the latest `custom-release`;
- new `feat/*` branches start from the latest `custom-release`;
- existing private behavior is part of the baseline and must not be silently dropped;
- upstream synchronization is optional and deliberate;
- upstream PRs are optional and only prepared when explicitly requested;
- the fork's current behavior takes precedence over upstream parity during normal development.

## Historical private-work context

Older handoff versions tracked individual private patches as if each were primarily an upstream candidate. That model is obsolete.

The repository may contain multiple fixes/features already merged into `custom-release`. Do not assume this document has a complete inventory. Before changing a related area, inspect:

- current code;
- recent commits affecting the same subsystem;
- relevant `fix/*` or `feat/*` branches when they still exist;
- tests added by previous fixes/features.

One known historical example is the orchestrator character/global preset work, which separated user-visible preset scope from character override existence. Treat it as integrated fork behavior if it is present in current `custom-release`; verify the live implementation rather than relying on an old commit list here.

## How to handle a new bug

When the user reports a new bug, follow `NEW_BUG_PROMPT.md`.

In short:

1. Fetch the latest `ZZZdragondYNGPHX/Luker:custom-release` HEAD.
2. Inspect the current failure path and nearby private behavior.
3. Create a fresh `fix/<bug-name>` from that `custom-release` HEAD.
4. Identify the root cause before editing.
5. Implement and test the smallest compatible fix.
6. Preserve unrelated private behavior.
7. Merge the verified fix back into `custom-release` when the user wants it integrated.
8. Update this handoff only when the fix creates durable context future sessions should know.

If upstream comparison is useful, perform it as supporting analysis rather than as the mandatory source baseline.

## How to handle a new feature

When the user requests new functionality, follow `NEW_FEATURE_PROMPT.md`.

In short:

1. Fetch the latest `ZZZdragondYNGPHX/Luker:custom-release` HEAD.
2. Inspect the fork's current architecture and integrated private behavior.
3. Create a fresh `feat/<feature-name>` from that `custom-release` HEAD.
4. Identify the correct module/state/service/UI/persistence path before coding.
5. Reuse existing infrastructure and keep the implementation coherent with the fork.
6. Test the feature and report persistence/Web/Android implications when relevant.
7. Merge the verified feature back into `custom-release` when the user wants it integrated.
8. Update this handoff only when the feature introduces durable architecture, migration, or maintenance context.

## Deliberate upstream refreshes

Upstream is still useful as a source of improvements and bug fixes, but refreshing from it is a separate maintenance task.

For an upstream refresh:

1. Inspect current `custom-release` and current upstream state.
2. Review the incoming upstream changes before integrating them.
3. Identify overlap/conflicts with private patches.
4. Preserve fork-specific behavior unless the user intentionally chooses the upstream behavior instead.
5. Integrate selectively or merge/rebase with full conflict review as appropriate.
6. Run relevant regression checks after integration.
7. Record any private patches that became obsolete, replaced, or conflict-prone.

Do not reset `custom-release` to upstream merely to make histories match.

## What to tell the user after each task

Always report:

- `custom-release` baseline SHA used;
- work branch name;
- root cause for bugs, or architecture/design summary for features;
- changed files;
- persistent data/config changes or migration status when relevant;
- Web/Android differences when relevant;
- tests/checks actually run;
- resulting commit SHA;
- whether the work has been merged into `custom-release`;
- any dependency on older private behavior;
- any compatibility concern discovered with upstream, if upstream was actually inspected.

Only report upstream SHA, official Android Actions SHA, or upstream PR status when those were relevant to the task and actually checked.

## Maintenance warning

Do not treat old SHA/version snapshots in chats or documents as current. For normal work, verify `custom-release` live. For an upstream-related task, also verify the relevant upstream state live.


## Execution mode redesign — feature branch, not yet integrated

Implemented on `feat/execution-mode-design`, based on custom-release `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`. See `EXECUTION_MODE_DESIGN.md` section 12 for implementation boundaries and checks; do not assume this feature is already integrated into custom-release.

The four primary modes remain existing runtimes: Loop research, Spec fixed workflow, Agenda dynamic delegation, Director reply authoring. Output responsibility is a UI projection, not another persistent mode setting. Legacy Single stays readable/editable and supports explicit copies into fresh Spec preset IDs. Quick templates use the existing preset library and character save path; activation is optional. Preserve independent global editing while a character override remains effective.

Snapshots optionally carry `executionIdentity`, a SHA-256 digest of effective profile/preset and selected runtime settings. Historical snapshots remain readable but do not qualify for reuse without identity. In environments without Web Crypto, reuse is disabled. Extend the configuration fingerprint when introducing relevant runtime dependencies. Budget-exhausted Loop/Agenda results may supply partial guidance but are not completed cache entries. Agenda exposes budget reason and unresolved task IDs.

No version bump, dependency change or automatic user-data migration. Shared frontend checks do not substitute for Android device or live-model validation.
