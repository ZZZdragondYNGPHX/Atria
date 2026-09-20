# Termux Uninstall Modes Handoff

## Current branch and HEAD

- Branch: `feat/termux-uninstall-modes`
- HEAD: `6b3e2e343f04cebe887478fec87df287d72717df`
- Baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`
- PR: #76

## Completed

- Added v0.3.6 toolbox uninstall override.
- Added keep-user-data uninstall for the active instance.
- Added complete Atria uninstall covering main + second instance, shared data/backups/exports, toolbox/autostart, Atria CLI state/entrypoint and canonical default frontend cache.
- Added owned-path deletion guards.
- Added two-stage destructive confirmation.
- Custom Webpack cache overrides are preserved.
- Added focused Node tests that reconstruct the generated runtime and syntax-check it with Bash.

## Not completed

- PR #76 has not been merged.
- Post-merge `main` verification and temporary branch cleanup remain.

## Key decisions

- Keep-data mode never removes the current shared Atria directory.
- Complete uninstall means all Atria instances and Atria-owned user data, not Termux itself or general packages.
- Custom cache paths are not automatically deleted because their ownership cannot be proven safely.
- The compressed v0.3.0 runtime remains unchanged; the existing launcher injection/override architecture carries the v0.3.6 behavior.

## Validation

- Atria PR Checks run #733 is currently queued.
- Do not poll continuously. Continue when CI completion is reported.

## Next step

1. Inspect PR Checks #733 result.
2. Fix any failure directly if present.
3. When green, finalize the docs record, merge PR #76 into `main`, verify merged `main`, and delete `feat/termux-uninstall-modes`.
