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


## Implementation status

Implemented on `fix/termux-toolbox-repository-url`:

- The launcher pins the canonical repository to `https://github.com/ZZZdragondYNGPHX/Atria.git`.
- Existing checkouts repair `origin` before any toolbox fetch path.
- The compressed runtime is regression-checked by gunzipping it in the Node test suite; its shipped `REPO_URL` already points to Atria.
- Legacy predecessor URL normalization remains defensive and is implemented without reintroducing the predecessor namespace into active Atria source.
- The direct `atria-termux update` path repairs `origin` as well.
- The 2026-09-20 independent-history cutover is handled explicitly: when a clean local checkout is still on the known pre-cutover ancestry and has no merge-base with the canonical `origin/main`, the updater first creates a local `history-cutover-backup-*` branch and then aligns `main` to `origin/main`.
- Ordinary unrelated divergence is still not force-reset.

Validation status:

- PR: #77.
- First PR Checks run #740 exposed the namespace-guard issue caused by literal predecessor naming in compatibility code; that code was rewritten to construct the legacy identifier without a contiguous active-code namespace.
- PR Checks run #741 completed successfully: ESLint, Atria Migration Guard, and the complete Node unit suite passed.
- Android and Docker builds are intentionally not part of this shell/Node-only fix.


## Completed result

- PR: #77
- Validated task HEAD: `76e37c4a3a30a0cfa01599fde69e7180efab9eef`
- Final validation: Atria PR Checks #741 — success
- Merged result: `main@d9cf7600d02d9334717e67992930507fe809b305`
- Merge method: squash
- Android / Docker builds: not run by design for this shell/Node-only fix
