# Squash-Merged Task Branch Cleanup

## Problem

The first Atria cleanup workflow only used Git ancestry to find completed temporary branches. That works for normal merge commits and some rebase histories, but a squash merge creates a new commit on `main`; the original task branch tip is not an ancestor of `main`.

As a result, PR #1 was merged successfully while `feat/atria-bootstrap` remained on the remote.

## Fix

Branch: `fix/task-branch-cleanup-squash`

The cleanup workflow now:

2. if not, queries closed pull requests targeting `main`;
3. treats the branch as completed only when a merged PR used the **exact current branch tip SHA**;

The exact-SHA requirement prevents an active branch from being deleted merely because an older PR with the same branch name was merged in the past.

## Integration result

- Pull request: `#2`
- Merge method: squash
- Resulting `main` commit: `06fe61ac344f9240141489608b73b4072a3b6b99`
- Post-merge cleanup workflow: passed
  - `feat/atria-bootstrap`
  - `fix/task-branch-cleanup-squash`
