# Termux toolbox v0.4

## Goal and confirmed scope

Replace the patched v0.3 distribution with a small, current single-instance manager. The user requested removal of rarely used functions such as secondary instances and deeper support for the remaining flows. New installations use Termux-private data; existing configured data paths remain unchanged. Shared storage is an optional backup/export destination.

## Design

- One readable toolbox script owns interactive and CLI lifecycle. Existing `atria.sh` and `setup.sh` become thin entrypoints. Remove compressed/base64 distributions, injected function overrides, secondary-instance management, tag/commit switching and shell-autostart configuration.
- Retain main-only shallow installation, incremental fast-forward updates, explicit dependency repair, background/foreground operation, wake lock, logs, diagnostics, offline backup/restore, and guarded uninstall.
- Use current `package.json` for Node requirements. Prepare the current native dependencies, including SQLite and isolated-vm, only in install/update/repair; ordinary startup verifies their usability without npm/network work. Reuse frontend and Node caches.
- Process ownership must match the selected checkout, including adoption of the previous main-instance PID records. Never signal an unrelated recycled PID. Serialize mutating commands. Graceful-stop failure blocks updates and data operations.
- Preserve existing config and dataRoot. Fresh data defaults to a dedicated private directory outside the checkout. New local backups include data/config/plugins; external database backup is explicitly unsupported here. Stop the server before backup/restore, validate archives before extraction, create a pre-restore snapshot, and retain/restore old targets if publication fails.
- Distinguish stopped, starting, HTTP/storage readiness, login-required and bootstrap failure. Diagnostics summarize startup phase timings without changing product authentication.
- Update the Termux guide and namespace guard to match the actual distribution and commands. Do not modify unrelated product architecture or existing user data.

## Execution and validation

1. Replace distribution and consolidate lifecycle/config/dependency preparation.
2. Implement offline data handling and focused diagnostics; update documentation.
3. Validate shell syntax, local isolated process/config/archive fixtures, real application probe behavior and the downloaded entrypoint. Android package compilation and device performance must remain explicitly distinguished from local checks.
4. Commit, record results, integrate into main and synchronize main/docs. No independent review workflow or handoff.
