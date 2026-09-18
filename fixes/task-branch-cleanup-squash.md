# Squash-Merged Task Branch Cleanup

## Status

Completed and validated.

## Problem

The first Atria cleanup workflow only used Git ancestry to find completed temporary branches. That works for normal merge commits and some rebase histories, but a squash merge creates a new commit on `main`; the original task branch tip is not an ancestor of `main`.

As a result, PR #1 was merged successfully while `feat/atria-bootstrap` remained on the remote.

## Fix

Branch: `fix/task-branch-cleanup-squash`

The cleanup workflow now:

1. checks whether a temporary branch tip is already an ancestor of `main`;
2. if not, queries closed pull requests targeting `main`;
3. treats the branch as completed only when a merged PR used the **exact current branch tip SHA**;
4. deletes the branch only after one of those checks succeeds.

The exact-SHA requirement prevents an active branch from being deleted merely because an older PR with the same branch name was merged in the past.

## Validation

PR #2 validation:

- Atria Migration Guard — passed.
- ESLint — passed.
- Node unit tests — passed.
- Android JVM unit tests — passed.

The fix is intended to support normal merge, rebase-compatible ancestry, and squash-merge workflows.
