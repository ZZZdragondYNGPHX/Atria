# Termux main branch pinning

## Goal

Keep Atria's normal Termux installation, toolbox update, and CLI update path on the authoritative `main` branch while preserving Tag/Commit checkout for explicit debugging or rollback.

## Task

- Task branch: `fix/termux-main-branch`
- Baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- PR: #5
- Final validated head: `417815c36d5928663bcf5116e706f7230c4856e4`
- Squash merge / resulting `main`: `a32a2c4e815cb9e9590f303b36423f6e959d8076`

## Implementation

- Updated `scripts/termux/atria_toolbox.sh` to v0.3.2.
- The toolbox download/self-update source remains `main/scripts/termux/atria_toolbox.sh`.
- Normal version management now exposes one managed branch path: update/switch to `main`.
- Removed the stale `release` branch choice from the effective Termux version menu.
- Normal toolbox updates switch to and fast-forward `origin/main`.
- Tag and Commit checkout remain available for explicit debugging/rollback.
- Updated `scripts/termux/atria.sh` so `atria-termux update` fetches, switches to, and fast-forwards `main` before refreshing dependencies.

## Validation

PR Checks run #136 (workflow run `35327209537`) passed:

- Atria Migration Guard
- ESLint
- full Node unit suite
- Android JVM tests

PR diff inspection also caught and corrected an escaped shell-variable interpolation issue before merge.

## Impact

- No user-data migration.
- No config migration.
- Existing Tag/Commit detached checkouts can return to the supported daily branch through the normal main update path.
- The stable Termux launcher URL is under the repository's `main` branch.
