# Termux Toolbox Uninstall Modes

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

Add two explicit uninstall flows to the Atria Termux toolbox:

1. **Uninstall Atria and keep user data** — remove the active Atria program checkout while preserving its shared user data.
2. **Completely uninstall Atria** — remove all Atria program instances, Atria-owned shared user data and Atria toolbox/runtime state.

## Final implementation

- Original baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`.
- Synchronized baseline before merge: `main@1dffedf610e03a51512ec59f12a09cd7b9a23f43`.
- PR: #76.
- Squash merge / authoritative main: `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Final toolbox version: v0.3.9.

### Keep-user-data uninstall

- Stops the active Atria instance.
- Deletes only its program checkout (`$HOME/Atria` or `$HOME/Atria-2`).
- Preserves that instance's shared `data`, `backups`, `exports`, and the toolbox.
- Allows a later reinstall to reuse the preserved shared data.

### Complete uninstall

- Requires literal `DELETE ATRIA` confirmation plus the existing randomized second confirmation.
- Stops both main and secondary Atria instances.
- Disables toolbox autostart.
- Removes both program checkouts.
- Removes both Atria shared-storage trees, including `data`, `backups`, and `exports`.
- Removes Atria toolbox state, toolbox launcher, direct CLI state and `atria-termux` entrypoint.
- Removes the canonical default Atria Webpack cache.
- Preserves a custom `ATRIA_TERMUX_WEBPACK_CACHE_ROOT`, because ownership of an arbitrary user-selected path cannot be proven safely.
- Does not remove Termux, Node.js, npm, git, curl, or unrelated files/packages.

## Safety decisions

- Deletion targets are constrained to known Atria-owned paths.
- Empty paths, `/`, `$HOME`, `$PREFIX`, and the shared-storage root are rejected.
- Keep-data mode never deletes the active instance shared Atria directory.
- The compressed v0.3.0 runtime remains unchanged; the existing launcher injection/override architecture supplies the current v0.3.9 behavior.
- PR #77 repository-origin/history-cutover repairs and PR #78 `/dev/tty` piped-launch repair were preserved when the task branch synchronized with the newer main.

## Completion

- PR #76 merged successfully.
- Temporary branch `feat/termux-uninstall-modes` was removed automatically after merge.
