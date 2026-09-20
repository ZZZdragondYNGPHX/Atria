# Termux Toolbox Uninstall Modes

## Task

Add two explicit uninstall flows to the Atria Termux toolbox:

1. **Uninstall Atria and keep user data** — remove the installed application/runtime checkout and Atria-managed launcher/runtime state while preserving user-owned data.
2. **Completely uninstall Atria** — remove the application plus Atria user data and Atria-managed runtime state.

## Safety requirements

- Derive paths from the toolbox's existing canonical variables instead of reintroducing historical product paths.
- The keep-data flow must never remove the canonical Atria user-data directory.
- The complete-uninstall flow must require a stronger confirmation before deleting user data.
- Refuse unsafe deletion targets such as empty strings, `/`, `$HOME`, or the shared-storage root.
- Stop a running Atria process before removing application files when the existing toolbox architecture exposes a supported stop path.
- Uninstall remains scoped to Atria-owned files; Termux itself and unrelated packages/files are untouched.
- Operations should be idempotent where practical: already-missing paths are not fatal.

## Validation

- Shell syntax / static checks for touched Termux scripts.
- Focused Node tests for toolbox uninstall path/guard behavior.
- Existing Termux toolbox update-guard tests.
- Atria Migration Guard / ESLint / Node suite as required by the normal PR workflow.
- Android JVM/APK and Docker builds are not part of this task unless explicitly requested.

## Documentation impact

Record final path behavior, confirmation semantics, validation and merge result here when the task is complete.

## Implementation status

- Task branch: `feat/termux-uninstall-modes`
- Baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`
- Current task HEAD: `6b3e2e343f04cebe887478fec87df287d72717df`
- PR: #76
- Toolbox version bumped to v0.3.6.
- The previous fragmented four-action uninstall menu is overridden by two product-level actions: keep-data uninstall and complete uninstall.
- Keep-data uninstall stops the active instance, removes only its program checkout, and preserves the instance shared `data`, `backups`, `exports`, and the toolbox.
- Complete uninstall validates all destructive targets first, requires `DELETE ATRIA` plus the existing randomized confirmation, stops both instances, disables toolbox autostart, removes both program checkouts and shared trees, removes the Atria CLI entry/state and toolbox state, and deletes only the canonical default Webpack cache.
- A custom `ATRIA_TERMUX_WEBPACK_CACHE_ROOT` is intentionally retained to avoid deleting a user-managed location.
- Termux itself and shared runtime packages such as Node.js, git, and curl are not removed.
- Added `tests/termux/toolbox-uninstall.test.js`, including reconstruction of the generated toolbox runtime followed by `bash -n`.

## Validation status

- PR Checks #733 is queued for PR #76.
- Final merge/integration verification is pending CI completion.
