# AI Handoff Context

This document stores fork-specific context that should survive across chats and across different AI tools. It is a snapshot, not a substitute for live GitHub verification.

## Read order for a new AI session

1. `AGENTS.md`
2. `AI_HANDOFF.md`
3. `FORK_MAINTENANCE.md`
4. The files directly relevant to the reported bug
5. Upstream `funnycups/Luker:release` and the latest official Android Actions build metadata

## Current repository model

- Upstream repository: `funnycups/Luker`
- User fork: `ZZZdragondYNGPHX/Luker`
- Fork default / mirror branch: `release`
- Personal integration branch: `custom-release`
- Per-bug branches: `fix/*`

The `release` branch is intentionally kept clean so it can track upstream without private changes. The `custom-release` branch is where verified personal patches and these AI-maintenance documents live.

## Current verified private fix

### Orchestrator character/global preset visibility

Branch:

`fix/orchestrator-character-global-presets`

Known fix commit:

`9ff33cc27e94a55c8d9663cfc770b5d66bb4be20`

Purpose:

- Keep global orchestrator presets visible/accessible while inside a character card.
- Default preset creation inside a character context to character scope.
- Allow a character-scoped preset to be copied/saved as a global preset without deleting the character copy.
- Prevent editor refresh/late character hydration from automatically forcing the displayed scope back to Character after the user explicitly selects Global.

Important historical root cause:

The orchestrator UI had coupled *character override existence* to *which scope the preset editor should display*. Character hydration could therefore cause the UI to render Global first and later switch to Character, making global presets appear to disappear. The fix separates user-visible scope choice from the mere existence of character overrides and exposes both libraries in character context.

Integration state:

- The isolated fix branch exists for upstream PR purposes.
- `custom-release` includes this private fix.
- Do not use this fix branch as the base for unrelated bugs.

## Last known official baseline snapshot

At the time this handoff was written:

- Upstream `funnycups/Luker:release` HEAD: `bb8ab49ed2c1dbad0fb8a12e362ef3fc0085b964`
- Fork `ZZZdragondYNGPHX/Luker:release` matched that SHA.
- The latest checked successful official Android `Build Android APK` run also used that SHA.
- `package.json` reported version `2.7.0`.

**This snapshot will become stale. Every new task must re-check live upstream and Actions state before choosing a baseline.**

## How to handle a new bug

When the user reports a new bug, do not immediately patch `custom-release`.

First:

1. Verify live upstream `release` and official Android build SHA.
2. Synchronize the fork mirror if required.
3. Create a fresh `fix/<bug-name>` from fork `release`.
4. Investigate the failure path and root cause.
5. Implement and test the minimal isolated fix.
6. Keep fork-only AI docs out of the upstream PR.
7. After the user confirms the fix works, integrate the fix into `custom-release` as a separate, traceable change.

If a new bug exists only because of a private patch already in `custom-release`, state that explicitly and create the new work from the relevant private integration state instead of pretending it is an upstream bug.

## What to tell the user after each fix

Always report:

- upstream baseline SHA used;
- fix branch name;
- root cause;
- changed files;
- tests/checks run;
- resulting commit SHA;
- whether the fix is upstream-compatible;
- whether it has been integrated into `custom-release`;
- whether any existing private patch became obsolete.

## Maintenance warning

Never treat this document's SHA/version snapshot as permanently current. Its purpose is to preserve architecture, branch policy, and historical private-fix context. Live repository state must still be queried at the start of every new task.
