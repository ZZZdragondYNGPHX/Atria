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
- Current task HEAD: `170f6ad501c6aa100b868e156579f52e96c41931`
- PR: #76
- Toolbox version bumped to v0.3.6.
- The previous fragmented four-action uninstall menu is overridden by two product-level actions: keep-data uninstall and complete uninstall.
- Keep-data uninstall stops the active instance, removes only its program checkout, and preserves the instance shared `data`, `backups`, `exports`, and the toolbox.
- Complete uninstall validates all destructive targets first, requires `DELETE ATRIA` plus the existing randomized confirmation, stops both instances, disables toolbox autostart, removes both program checkouts and shared trees, removes the Atria CLI entry/state and toolbox state, and deletes only the canonical default Webpack cache.
- A custom `ATRIA_TERMUX_WEBPACK_CACHE_ROOT` is intentionally retained to avoid deleting a user-managed location.
- Termux itself and shared runtime packages such as Node.js, git, and curl are not removed.
- Added `tests/termux/toolbox-uninstall.test.js`, including reconstruction of the generated toolbox runtime followed by `bash -n`.

## Validation status

- PR Checks #733 passed on the original task head. During CI, main advanced through PR #77/#78; the task branch was merged with `main@1dffedf610e03a51512ec59f12a09cd7b9a23f43` without dropping those Termux fixes.
- PR Checks #743 is queued for the synchronized task head.
- PR #76 is mergeable after synchronization. Final merge/integration verification is pending PR Checks #743.
