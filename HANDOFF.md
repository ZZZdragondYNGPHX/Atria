# HANDOFF — Native CI Baseline Failures

Updated: 2026-09-28  
Task ID: `fix/native-ci-baseline-failures`  
Primary Workspace: `main`  
Current main HEAD: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`  
Current stage: **Merged — final main integration CI pending**

## Paths

- Governance: `docs:README.md`
- Plan: none; this is a small fix
- Record: `docs:records/fix/native-ci-baseline-failures.md`
- Live Handoff: `docs:HANDOFF.md`

## Completed

- fixed the original stale Package Turn snapshot Unit failure;
- fixed the exact P2 Host → Native Game LLM Runtime bridge guard;
- synchronized P5/P6/N9/N10/P8 guards with already-current product ownership and hard-cutover architecture;
- synchronized the four legacy browser acceptance files with Prompt Presets / current Settings ownership while preserving the Narrative Skill “final prose only” contract;
- PR #97 final head `72ca0c9157b13b4fb2b251e79706992f766ab4e4` passed both required PR workflows;
- PR #97 merged successfully;
- current main is `191f9f951ccb23cd11d8951e539b8ff6eb8316db`;
- branch cleanup workflow `36420803105` succeeded and the completed fix branch is gone.

## Verified PR CI

- `Atria PR Checks` run `36419697817`: success
  - Migration Guard: success
  - Lint: success
  - Unit Tests: success
- `Native Model Prompt Runtime` run `36419697797`: success
  - static guards: success
  - integration Jest: success
  - targeted Playwright acceptance: success

## Remaining dependency

- main push `Native Model Prompt Runtime` run `36420802932`: **in progress**

This is the only remaining dependency. Do not poll it continuously.

## Next target

1. Check run `36420802932` once complete.
2. If it succeeds, verify `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db` remains current.
3. Finalize `records/fix/native-ci-baseline-failures.md` as complete.
4. Delete `docs:HANDOFF.md`.
5. Confirm the final branch set still contains only the seven long-lived branches.

If main CI exposes a genuine new failure, create a new `fix/*` branch from current main and repair only that failure.

## Read first next time

1. actual remote refs;
2. `main:AGENTS.md`;
3. `docs:HANDOFF.md`;
4. `docs:records/fix/native-ci-baseline-failures.md`;
5. run `36420802932` result.

## Do not repeat

- do not recreate the deleted `fix/native-ci-baseline-failures` branch unless a new main failure requires a new fix branch;
- do not revisit repository-standardization migration;
- do not read reference branches;
- do not broaden product scope.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` task `fix/native-ci-baseline-failures`.

PR #97 is already merged. Current `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`. Final PR CI was fully green: `Atria PR Checks` run `36419697817` success and `Native Model Prompt Runtime` run `36419697797` success. Cleanup run `36420803105` succeeded and deleted the completed fix branch.

The only remaining dependency is the post-merge main `Native Model Prompt Runtime` run `36420802932`, which was still in progress at the checkpoint. Check it once. If it succeeds, verify main, finalize `docs:records/fix/native-ci-baseline-failures.md`, delete `docs:HANDOFF.md`, and confirm the final seven-branch set. If it fails, treat that as a new main-integrated failure and create a fresh `fix/*` branch from current main rather than resurrecting the old branch.
