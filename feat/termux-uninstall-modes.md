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
