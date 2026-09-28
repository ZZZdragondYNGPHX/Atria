# Termux Toolbox Uninstall Modes

## Task

Add two explicit uninstall flows to the Atria Termux toolbox:

1. **Uninstall Atria and keep user data** — remove the active Atria program checkout while preserving its shared user data.
2. **Completely uninstall Atria** — remove all Atria program instances, Atria-owned shared user data and Atria toolbox/runtime state.

## Final implementation

- Original baseline: `main@c407f9e97530f587362c2150f7a0c2601598f75e`.
- Synchronized baseline before merge: `main@1dffedf610e03a51512ec59f12a09cd7b9a23f43`.
- Final validated task HEAD: `170f6ad501c6aa100b868e156579f52e96c41931`.
- PR: #76.
- Squash merge / authoritative main: `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Final toolbox version: v0.3.9.

### Keep-user-data uninstall

- Stops the active Atria instance.
- Deletes only its program checkout (`$HOME/Atria` or `$HOME/Atria-2`).
- Preserves that instance's shared `data`, `backups`, `exports`, and the toolbox.
- Allows a later reinstall to reuse the preserved shared data.

### Complete uninstall

- Validates every destructive path before deleting anything.
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

## Validation

Final PR Checks #743 passed on synchronized HEAD `170f6ad501c6aa100b868e156579f52e96c41931`:

- Atria Migration Guard: passed.
- ESLint: passed.
- Complete Node unit suite: passed.
- Focused `tests/termux/toolbox-uninstall.test.js` reconstructs the generated toolbox runtime and validates it with `bash -n`.
- Existing Termux toolbox update guards remained part of the Node suite.

Android JVM/APK and Docker builds were not run because this task changes only the Termux shell/toolbox surface and those validations are opt-in.

## Completion

- PR #76 merged successfully.
- Merged `main` was verified to contain both uninstall modes, v0.3.9, PR #77 repository-origin protection, and PR #78 `/dev/tty` handling.
- Temporary branch `feat/termux-uninstall-modes` was removed automatically after merge.
