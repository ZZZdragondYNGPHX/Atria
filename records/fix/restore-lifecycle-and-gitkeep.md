# Restore lifecycle and Git sentinel preservation

## Task

Fix two Android restore regressions:

1. destructive full restore could delete the tracked `public/scripts/extensions/third-party/.gitkeep` repository sentinel and leave the checkout dirty if the restore was interrupted before that entry was written back;
2. an active archive restore became visually detached when the Backup & Sync popup was closed or the user switched to the log UI, so reopening Backup Center made the still-running restore appear stopped.

## Branch and PR

- Baseline: `main@43caed0c7d2d27a18b5de3f851bdfefcafb26dd2`
- Task branch: `fix/restore-lifecycle-and-gitkeep`
- Final validated task head: `e426ef0f09adeabd660baaa39eba4c955a842c76`
- PR: #16
- Squash merge / resulting `main`: `c2f2cf9f2e9da8cc7d591dc4d862dcbe888a8baf`
- Validated task-head tree and merged-main tree: `1d6d6745aaa9b1956c1c684c7d9d524877ddf9f2`

## Field evidence

After starting a full restore, the Termux version manager later reported:

`D public/scripts/extensions/third-party/.gitkeep`

The updater correctly refused to switch/update a dirty repository. The dirty state was produced by restore: administrator full restore includes process-global third-party extensions, and replacement mode previously removed the entire target directory before extracting archive contents. An interrupted or still-running restore could therefore remove the tracked sentinel.

The same report showed that closing Backup Center / switching to logs during restore made the reopened restore UI appear idle even though the original network request could still be running.

## Implementation

### Repository sentinel protection

- Added `src/backup-sync/restore-targets.js`.
- Destructive restore of the process-global third-party extension directory clears extension payloads while preserving the root `.gitkeep`.
- If the sentinel is already missing, the restore clear helper recreates it.
- Ordinary restore directories still receive full replacement semantics.

### Termux self-heal

- Bumped the Toolbox launcher to v0.3.3.
- Before the normal dirty-worktree guard, the toolbox detects exactly the unstaged deletion of `public/scripts/extensions/third-party/.gitkeep` and restores it from HEAD.
- The same exact self-heal was added to `scripts/termux/atria.sh update`.
- Other tracked or untracked changes remain protected by the existing refusal; intentional/staged changes are not auto-reverted.

### Restore task lifecycle

- Archive restore state now lives at module scope instead of only inside one Backup Center popup instance.
- Closing Backup Center does not cancel or forget the active restore session.
- Reopening Backup Center while restore is active:
  - automatically shows the archive panel;
  - displays the latest known restore progress;
  - keeps restore/recovery controls disabled while the original task owns the migration lock.
- When the original request completes or fails, all currently open Backup Center views receive the terminal state.
- Selecting a new archive after the prior task has finished clears the previous session state.

## Validation

Final task head passed:

- Atria Migration Guard;
- ESLint;
- complete Node unit suite;
- Backup & Storage UI:
  - Backup Center Chromium;
  - Browser Storage Chromium;
  - Server Storage Chromium.

Regression coverage verifies:

- `.gitkeep` survives destructive global-extension restore clear;
- a missing sentinel is recreated;
- normal restore directories are fully replaced;
- both Termux update entry points remain valid Bash and place the known-sentinel self-heal before their dirty-worktree refusal;
- an active restore survives Backup Center popup closure, is visible after reopening, keeps recovery controls disabled, and updates the reopened view when the original restore finishes.

Android JVM tests and Android/Docker builds were not run because this task changes Node/frontend/Termux restore logic only and those builds remain opt-in.

## Data/config impact

No backup schema, storage schema, or user configuration migration was introduced.
