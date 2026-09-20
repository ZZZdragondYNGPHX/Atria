# Termux Toolbox Repository URL Fix

## Goal

Ensure every Termux Toolbox install/update path targets the standalone Atria repository `ZZZdragondYNGPHX/Atria` and never clones or resets against the former Luker repository.

## Baseline

- `main`: `c407f9e97530f587362c2150f7a0c2601598f75e`
- Task branch: `fix/termux-toolbox-repository-url`

## Scope

- Audit the public launcher and compressed runtime used by `scripts/termux/atria_toolbox.sh`.
- Correct the canonical repository URL used by install, fetch, update, tag, and commit workflows if it still points to Luker.
- Add a regression guard that asserts the active toolbox source/runtime targets Atria.
- Preserve user data locations and all unrelated toolbox behavior.
- Do not run Android or Docker builds.

## Validation

- Bash syntax validation for toolbox scripts.
- Targeted Termux toolbox tests.
- Repository URL regression checks.
