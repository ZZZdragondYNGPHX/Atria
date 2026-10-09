# Native product UX completed work

Task branch: `fix/native-product-ux-audit`.
Baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`.
Workspace `AGENTS.md` and `FORK_MAINTENANCE.md` take precedence over the obsolete remote copies.

## Group 1 — User Data Safety

### NUX-001

Commit: `426017c8e`.
Registered Native resources, Studio projects and asset blob directories centrally.
ProjectStore, AssetStore and FS resource reads/writes consume the shared contract.
Existing physical paths remain unchanged. The FS harness uses the real registry.
Focused validation: four suites / 13 tests; changed-file ESLint and diff check.

### NUX-002

Native backup is a single selectable closure: all Native resource kinds, Studio
source projects and Native asset/package blobs. Secrets remain a separate choice.
SQL downloadable dumps now filter selected tables; recovery snapshots remain full.
Assets-only backup/restore excludes and preserves the Native blob subtree.

MigrationRunner copies all registered Native kinds through the existing engine
transaction contract, retaining exact IDs, documents, integrity and timestamps.
Restore staging rebinds only the user storage key for FS and SQLite sources.
Native restores validate required blob hashes and lengths before replacing data.
Overwrite rejects archives without a declared Native closure. Recovery checks
engine compatibility before deleting anything and closes SQLite handles before
replacing files on Windows.

Backup uses the existing migration lock and read-only gate while archiving.
Migration write bypass is async-local, preventing unrelated concurrent requests
from bypassing the gate. ProjectStore writes honor the same gate.
The existing backup UI exposes the Native option with English, zh-CN and zh-TW
copy, existing checkbox styling and keyboard behavior.

Group regression executed:

- 23 offline suites: 203 passed, four database-service cases skipped. Includes
  migration, snapshots, rollback, selection, read-only concurrency, Native layout,
  project composition/build and HTTP backup/restore.
- Eight Native HTTP scenarios cover FS → FS, FS → SQLite, SQLite → FS,
  SQLite → SQLite, missing-blob rollback and assets-only isolation.
- All 22 registered Native storage kinds are included in the HTTP round trips.
- One real Edge browser scenario passed at 320px: utilities error/recovery,
  Native backup selection, keyboard toggle, recommended selection and overflow.
  Inspected its backup screenshot. Existing visual language retained.
- Changed-file ESLint and `git diff --check` passed. The CLI file's single engine
  injection line was syntax checked; its pre-existing unrelated lint errors were
  not rewritten.

Limits: local MySQL/Postgres test ports 53306/55432 are unavailable. Their live
integration is not claimed. No Docker/Android build or physical-device validation.
Playwright bundled Chromium installation stalled during extraction; browser
validation used installed Edge through an untracked local test configuration.
Pre-existing workspace rule edits and old test artifacts remain excluded.

Next: Group 2, NUX-003, following the active backlog order.
