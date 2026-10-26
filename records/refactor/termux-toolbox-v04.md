# Termux toolbox v0.4

- Task: `refactor/termux-toolbox-v04`
- Date: 2026-10-26
- Primary workspace: product source
- Start HEAD: `8b28bcafe197444328b9e03c44fad71419ac1466`
- Plan: [Termux toolbox v0.4](../../plans/refactor/termux-toolbox-v04.md)

## Stage 1 — inspection and scope

The existing distribution consists of a compressed v0.3 runtime, a launcher that injects later overrides, stale base64 releases, and a separate CLI/setup lifecycle. Node checks/documentation still say >=20 although current package.json requires >=22.2.0. Native computation uses isolated-vm in addition to SQLite. Backup operations currently archive live data and restore checks do not reject archive links; the new single-instance implementation will consolidate these boundaries.

The user confirmed removal of rarely used features such as secondary instances, and private data for new installs with existing configured paths preserved. Implementation is in progress; no device migration or Android validation has occurred.

## Stage 2 — consolidated implementation

Replaced the launcher/runtime override distribution with one readable menu/CLI implementation and thin existing entrypoints. Removed compressed/base64 artifacts and obsolete v0.3 notes. The new manager handles shallow main installation, clean fast-forward updates, dependency fingerprints, native SQLite/isolated-vm preparation, cached startup, ownership-aware process management, graceful-stop boundaries and command locking. New config uses private data; existing config is retained.

Added offline local-storage archives with staged restoration, pre-restore snapshots and rollback on publication failure. Diagnostics distinguish HTTP from storage/bootstrap readiness and login requirements. Updated the Termux guide and simplified the namespace guard for readable sources.

Local checks completed so far: shell syntax, JavaScript ESLint, Python parsing, namespace guard, config preservation/port validation, SQLite/config/plugin backup restoration, malformed archive rejection, injected publication failure rollback, and a real local Atria bootstrap probe with cached frontend. Shallow clone/fast-forward fixtures passed with dirty-worktree and failed-stop guards. A curl-pipe fixture used an MSYS path unsupported by Windows curl; adjust only the fixture URL and retry that case. Android native compilation and real device process behavior have not been run.

## Stage 3 — validation and delivery

- Implementation HEAD: `01faf5ca5e29a49768209872e28ddfded963190e`.
- Status: complete; implementation and relevant local validation passed, and main was fast-forwarded to the implementation HEAD. Main/docs are synchronized together for delivery under the normal local workflow.
- Corrected the fixture URL to Windows curl's `file:///D:/...` form. The downloaded-script pipe entrypoint now passes using isolated state without touching the user's home shortcut.
- Real local Atria startup with the existing frontend cache passed the new health → CSRF cookie → bootstrap probe and returned settings. Separate HTTP fixtures confirmed login-required, storage error, bootstrap error and missing-settings handling.
- Local native-check mode successfully exercised SQLite and isolated-vm. Parsed the actual node-gyp arguments to verify the later `--jobs=2` overrides `-j max`, uses local headers and forwards the Android gyp variable. This checks command wiring and Windows bindings, not Android compilation.
- Shell fixtures confirmed rejection of an unrelated Bash PID, handling of a newly spawned pre-exec child, and failure propagation from bootstrap. Real local Git fixtures confirmed shallow installation, clean fast-forward updates using the updated preparation entrypoint, dirty-file preservation, and refusal to merge after shutdown failure. Windows lacks the Termux flock/process environment; no Android process/lock or foreground Ctrl+C behavior is claimed as device-tested.
- Archive fixtures exercised SQLite/config/plugin restoration with current paths/port preserved, traversal/symlink/hardlink/duplicate/unknown-content rejection, invalid data-root structure, and rollback/cleanup after injected publication failure.
- Bash syntax, ESLint for runtime-tools.js, Python AST parsing, namespace guard and diff whitespace checks passed. Final self-update locking adjustment passed Bash syntax. Tests/fixtures remain local and are not committed.

The new installation default is private data outside the checkout. Existing paths are retained. No live user data was moved or deleted. No new phone startup time is claimed; the existing lazy imports and frontend/Node caches are reused. Actual Termux native compilation and Android performance remain device-specific verification limits.
