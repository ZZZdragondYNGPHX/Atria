# HANDOFF — Native CI Baseline Failures

Updated: 2026-09-28  
Task ID: `fix/native-ci-baseline-failures`  
Primary Workspace: `fix/native-ci-baseline-failures`  
Current branch HEAD: `b5a7f9354a89d5e89944994f5a21a2155e0f072b`  
Current stage: **Implementation complete — CI pending**

## Paths

- Governance: `docs:README.md`
- Plan: none; this is a small fix
- Record: `docs:records/fix/native-ci-baseline-failures.md`
- Live Handoff: `docs:HANDOFF.md`

## Completed

- started from `main@c697532c6a4d54530de023cd65e4c1721efe97b2`;
- created `fix/native-ci-baseline-failures`;
- fixed the stale Package Turn test snapshot for the Memory bridge;
- narrowed the P2 architecture guard to permit only the exact audited `generation-host` → Native Game LLM Runtime bridge;
- added guard self-tests to prevent the exception leaking to other modules or legacy browser facades;
- opened PR #97.

## CI

- `Atria PR Checks` run `36414275752`
  - Migration Guard: success
  - Lint: in progress
  - Unit Tests: in progress
- `Native Model Prompt Runtime` run `36414275833`
  - integration: in progress

Do not claim the running jobs have passed.

## Next target

1. Check the two CI runs once complete.
2. Fix any genuine new failures on the same branch.
3. On success, merge PR #97.
4. Verify the resulting `main`.
5. Finalize `records/fix/native-ci-baseline-failures.md`.
6. Delete this HANDOFF and the completed task branch.

## Read first next time

1. actual remote refs;
2. `main:AGENTS.md`;
3. `docs:HANDOFF.md`;
4. `docs:records/fix/native-ci-baseline-failures.md`;
5. only the two touched files and any failing log implicated by CI.

## Do not repeat

- do not reopen repository-standardization migration;
- do not read reference branches;
- do not expand Native functionality;
- do not replace the exact Host bridge exception with a broad `public/scripts` allowlist.

## New-chat bootstrap prompt

Continue `ZZZdragondYNGPHX/Atria` task `fix/native-ci-baseline-failures`.

The implementation is already on `fix/native-ci-baseline-failures@b5a7f9354a89d5e89944994f5a21a2155e0f072b` and PR #97 is open. Check CI runs `36414275752` and `36414275833`. Migration Guard already passed; Lint, Unit Tests, and Native Model Prompt Runtime integration were still running at the last checkpoint. If CI passes, merge PR #97, verify main, finalize `docs:records/fix/native-ci-baseline-failures.md`, delete `docs:HANDOFF.md`, and ensure the task branch is gone. If CI exposes a new failure, fix only that failure on the same branch and rerun. Do not revisit repository standardization or read reference branches.
