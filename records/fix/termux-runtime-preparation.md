# Termux native dependency and startup preparation

- Date: 2026-10-26
- Task: `fix/termux-runtime-preparation`
- Primary workspace: product source
- Start: `85b7995a5f120e470b52361ceb1fec9ce05b9f08`
- Implementation: `4fd0ca2de7c53834370ab8072e46c74e880d5f7b` (integrated into `main`, pushed)

## Evidence and result

The user's Android/Termux Node 26.3.1 installation could serve HTML, but `/api/bootstrap` repeatedly failed because `better-sqlite3` had no native binding. The filesystem storage mode also uses SQLite for Native records. The toolbox installed npm dependencies with lifecycle scripts disabled and omitted the existing native repair helper.

The supplied startup timing separated 14,130 ms of module loading from 23,527 ms of frontend preparation (`manifest_unavailable`, compilation required). Actual listening time was 38,318 ms; the toolbox's 33-second estimate counted polling sleeps without HTTP probe overhead. This single trace does not establish recurring cache invalidation across unchanged restarts.

Toolbox v0.3.12 centralizes dependency preparation in the existing installer: npm success → existing SQLite repair helper → frontend prebuild. Installation, repair, rebuild and code changes reuse that path. The redundant post-code-change prebuild wrapper was removed. Existing installations validate/repair SQLite before launch, and a failed repair prevents launch. Missing compiler tools are installed only when the helper actually needs to rebuild the binding. No data migration, deletion or dependency addition was introduced.

Termux toolbox foreground/background and CLI starts enable Node's built-in compile cache inside the ignored `node_modules/.cache/atria-node` directory, respecting an explicit `NODE_COMPILE_CACHE`. Startup elapsed time and timeout use Bash elapsed seconds. The HTTP readiness probe still indicates transport readiness, not full application bootstrap health.

## Validation and limits

- Bash syntax checks passed for launcher, CLI, native repair helper and assembled runtime; compressed payload checksum was exercised by the real launcher assembly path.
- Local shell fixture verified dependency/repair/prebuild ordering, failure propagation, existing-install repair without npm/prebuild, and elapsed-time accounting including probe time.
- Actual local SQLite in-memory query passed. Actual frontend prebuild produced a manifest; the next invocation reused the cache. Node compile cache files were persisted.
- A real local server with isolated temporary filesystem data returned HTTP 200 with settings from `/api/bootstrap`, using the prebuilt frontend cache. Frontend-cache phase was 9 ms in this Windows smoke test; this is not an Android performance claim.
- Initial smoke harness launch failed because application arguments were passed as Node flags; adding the argument separator corrected the harness, then the bootstrap check passed using the already validated cache.
- `git diff --check` passed. Fixtures and logs remain local. Android native compilation and recovery on the user's phone require execution on that device; no mobile speed improvement or completed device repair is claimed.
