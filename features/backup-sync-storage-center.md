# Backup, Sync & Storage Center Refactor

## Status

Implementation and branch validation are complete. PR #7 is ready for integration into `main`. Final merge metadata is appended after the merge is verified.

## Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Task branch: `feat/backup-sync-storage-center`
- Baseline: `main@12038702ebc6ce9d9b2f2bbf60f6a0996b7c6ef3`
- Formal plan: `docs/plans/backup-sync-storage-center.md`
- Pull request: #7 — `feat: refactor backup sync and storage management`

## Product result

The account maintenance surface was reduced to three primary actions:

1. Settings Snapshots
2. Backup & Sync
3. Storage Management

The original Settings Snapshots flow remains the canonical settings-content snapshot/restore UI.

The former Admin Panel product surface was removed. Foundational admin/account authorization, multi-account infrastructure, logging/update capabilities, storage engines, and operator storage-migration backend capabilities remain available where they have independent callers.

## Backup & Sync Center

The former Backup & Restore popup was replaced by a four-section Backup & Sync Center:

1. Automatic Backups
2. Archive & Restore
3. Device Sync
4. Cloud Sync

### Split automatic backup policies

Generated backups under the user backup directory are managed as two independent classes:

- `chat_*.jsonl`
- `settings_*.json`

Each class has independent:

- enabled/disabled retention;
- per-entity version count;
- total backup count;
- total byte budget;
- cleanup results and usage reporting.

Chat backup history adds grouped version browsing, preview, download, import/restore, deletion, refresh, and filtering.

Settings snapshot content remains owned by the upstream Settings Snapshots UI; Backup & Sync owns retention/usage policy only.

## Archive & restore safety pipeline

ZIP/local-file restore is no longer treated as a direct "upload ZIP and write" operation.

The restore pipeline is:

```
Provider / Artifact
  -> Preflight
  -> Restore Plan
  -> Recovery Point
  -> Staging / Apply
  -> Verification
  -> Commit or Rollback
```

Preflight is mandatory. Invalid or incompatible archives stop before mutation.

Three user-facing restore modes are represented explicitly:

- merge;
- replace selected categories;
- full restore.

Every restore creates a recovery point before mutation. Failed restores attempt automatic rollback. Successful recovery points remain available in the UI for later manual rollback, and applying a historical recovery point first creates a new undo recovery point.

### Database-backed archives

Database engine dumps are no longer replayed directly into the live engine for selected-category restores.

A database-backed archive is staged into a transient source engine, then moved through MigrationRunner according to the selected logical categories. This applies even when the source and destination engine kinds match.

Replacement modes clear only selected destination categories before staged migration. Merge preserves unmatched destination records.

MySQL/PostgreSQL source archives require a scratch connection for staging. SQLite staging uses its transient local form.

## Provider architecture

A reusable provider contract and registry were introduced.

Provider metadata covers:

- provider id / label;
- archive vs sync kind;
- lifecycle state;
- availability/future state;
- capabilities;
- configuration schema/auth placeholder.

Current adapters/providers:

- Local File — functional archive provider;
- LAN Sync — functional sync adapter over the existing incremental LAN engine;
- Google Drive — registered future provider;
- Microsoft OneDrive — registered future provider;
- GitHub — registered future provider.

Future cloud providers are not fake clickable OAuth flows. Their configuration/auth contracts are present while `available=false`.

A provider-independent Backup/Sync Job Manager defines:

- queued/running/succeeded/failed/cancelled states;
- progress phase/current/total/message;
- normalized error envelopes;
- result payloads;
- provider/operation metadata;
- bounded job history.

## Storage Management

The separate Server Storage Inspector and Browser Storage actions were merged into one Storage Management surface with:

- Server Data
- Browser Data

The shared inspector renders actions from resource capability metadata rather than assuming every row is mutable.

### Server Data

A dedicated safe storage-management service provides path-whitelisted resources under the current user's root.

Supported text-like resources can expose:

- view;
- validated edit;
- delete;
- recovery.

Server editing adds:

- JSON validation;
- JSONL per-line validation;
- edit-size bounds;
- optimistic modified-time conflict detection;
- temporary-file write;
- validation before atomic rename;
- pre-mutation recovery points.

Protected resources such as `secrets.json`, SQLite database files, WAL/SHM files, and engine dump/meta artifacts expose only safe metadata through the generic manager.

High-level identity resources whose deletion requires domain cascades are not blindly deleted by the generic mutator.

Recent server mutation recovery points can be listed and restored from Storage Management.

### Browser Data

Browser storage management now drills into:

- localStorage;
- sessionStorage;
- IndexedDB databases;
- IndexedDB object stores;
- IndexedDB records;
- Cache Storage caches;
- cached requests/responses;
- Storage Quota.

localStorage/sessionStorage support create, read, edit and delete.

IndexedDB records expose key/value inspection. Plain JSON-compatible values can be edited/deleted; structured-clone values that cannot be faithfully represented as JSON remain view-only.

Cache Storage exposes request/response inspection, bounded response-body preview, single request deletion, and whole-cache deletion. Response editing is intentionally not implemented.

Quota remains read-only.

## Admin Panel removal

Removed product/UI assets include:

- Admin Panel entry point;
- Admin Panel template/controller;
- admin-only storage-backend frontend helper;
- admin aggregate/per-user Storage Inspector UI and E2E;
- obsolete Backup Manager template;
- obsolete backup-retention injection UI;
- Admin Panel-only backend routes discovered by dead-code audit;
- retired admin Storage Inspector documentation/screenshots.

Preserved backend foundations include:

- admin identity and authorization middleware;
- multi-account infrastructure;
- account CRUD endpoints still used independently;
- announcements/log/update infrastructure with independent callers;
- storage engine implementations;
- storage migration backend/CLI capability.

## Validation

The task adds permanent Chromium coverage in:

- `.github/workflows/backup-storage-ui.yml`

The workflow is split into parallel jobs:

- Backup Center Chromium
- Browser Storage Chromium
- Server Storage Chromium

It uses PR-level concurrency with stale-run cancellation.

Default repository validation for this task is:

- Atria Migration Guard
- ESLint
- full Node unit suite
- Backup/Storage Chromium suites

Android JVM tests and Docker builds remain opt-in and were intentionally not part of the default validation for this task.

## Final validation

Validated task head:

- `feat/backup-sync-storage-center@7f8063e5f8ed0c6bcb639a6ae819653163ded662`

Required CI passed:

- Atria PR Checks run `35345241830`
  - Atria Migration Guard: passed
  - ESLint: passed
  - full Node unit suite: passed
- Backup and Storage UI run `35345241821`
  - Backup Center Chromium: passed
  - Server Storage Chromium: passed
  - Browser Storage Chromium: passed

Android JVM tests and Docker builds were intentionally not run because repository/task policy makes them opt-in.

### Final E2E stabilization

The final Chromium validation exposed and fixed four integration issues that were not visible in the Node suite:

1. `public/scripts/user.js` had dropped the still-required `getConfigValidationMessage` export while `public/script.js` continued to import it. That prevented the main browser module graph from instantiating and left `#preloader` mounted indefinitely.
2. Fresh E2E data roots could show the first-run Atria onboarding dialog after the preloader disappeared, blocking account UI controls.
3. Storage CRUD tests could target a popup that was still in its closing animation. The CRUD suite now targets active popup content explicitly instead of generic hidden template inputs.
4. IndexedDB record writes now await the full read/write transaction commit, not only the individual `put()` request success.

The dedicated UI workflow now stops each lane after the first failing test (`--max-failures=1`) and `awaitMainUI()` fails fast with browser console/page-error diagnostics, preventing repeated multi-minute opaque timeouts.

## Integration

PR #7 was squash-merged into `main`.

- validated task head: `7f8063e5f8ed0c6bcb639a6ae819653163ded662`
- merge commit / current main: `65321bb522febd369901127cd2b4b2c9883d4658`
- validated head tree: `95f5586b87c029e3c0a67df6b6ecb8ea9139f951`
- merged main tree: `95f5586b87c029e3c0a67df6b6ecb8ea9139f951`
- tree equality: confirmed
- PR #7 state: merged
- cleanup workflow run: `35345750721` — passed
- temporary branch `feat/backup-sync-storage-center`: deleted

The merged `main` working tree is therefore byte-for-byte the same Git tree that passed the final PR Checks and all three Backup/Storage Chromium lanes.
