# Backup, Sync & Storage Center Refactor

## Goal

Refactor the account-side maintenance surfaces around backup, restore, sync, and storage management while removing the obsolete Admin Panel product surface.

The task is intentionally broader than a UI merge. It establishes reusable backup/sync provider contracts, a safer restore pipeline, split chat/settings backup retention, and capability-driven storage CRUD.

## Product decisions

### Account actions

Keep the upstream Settings Snapshots action intact.

Replace the three Atria account actions with:

1. **Backup & Sync**
2. **Storage Management**

Final account actions:
- Settings Snapshots
- Backup & Sync
- Storage Management

### Remove Admin Panel

Delete the Admin Panel UI and code that exists only to support it.

Preserve foundational authorization/account infrastructure such as:
- admin role state;
- `isAdmin()`;
- admin middleware;
- multi-account support;
- storage engines;
- CLI storage migration;
- backend APIs still used outside the removed panel.

Admin-only endpoints with no remaining callers are removed after dead-code audit.

### Backup & Sync Center

Four sections:

1. Automatic Backups
2. Archive & Restore
3. Device Sync
4. Cloud Sync

#### Automatic Backups

Manage `backups/chat_*.jsonl` and `backups/settings_*.json` as separate classes.

Chat backups:
- group by character/group chat;
- list versions;
- preview JSONL;
- download;
- restore a selected version;
- delete individual versions;
- bulk cleanup;
- independent retention policy.

Settings backups:
- independent retention policy;
- usage/cleanup management;
- Settings Snapshots remains the single canonical content-view/restore UI.

#### Archive & Restore

ZIP/local file becomes one Archive Provider, not the restore protocol itself.

Restore flow:

```
Provider / Artifact
  -> Preflight
  -> Restore Plan
  -> Recovery Point
  -> Stage / Apply
  -> Verify
  -> Commit or Rollback
```

Preflight is mandatory. Probe/preflight errors stop restore; they do not fall through to blind restore.

Restore modes:
- merge;
- replace selected categories;
- full restore.

Every restore mode creates an appropriate recovery point and has rollback support.

#### Provider framework

Implement real contracts/registry now.

Archive provider capabilities include:
- list;
- upload;
- download/open artifact;
- delete;
- background sync where supported.

Sync provider capabilities include:
- bidirectional sync;
- incremental sync;
- conflict reporting/resolution;
- sync state.

Initial providers/adapters:
- Local File: functional Archive Provider.
- LAN Sync: functional Sync Provider adapter over the existing LAN sync engine.
- Google Drive: registered future provider, unavailable.
- Microsoft OneDrive: registered future provider, unavailable.
- GitHub: registered future provider, unavailable.

No fake OAuth/connection flow is added for unavailable cloud providers.

### Storage Management

Merge server Storage Inspector and Browser Storage into one account action with two tabs:
- Server Data
- Browser Data

Use a capability-driven resource model:
- view;
- edit;
- delete;
- download;
- restore.

#### Server data

Prefer domain repositories/endpoints for logical Atria data instead of raw filesystem mutation.

Editable text/JSON/JSONL resources:
- preview/read;
- validated edit;
- recovery point before mutation;
- atomic write;
- verify after write.

Binary/image/archive/vector resources:
- metadata/preview where applicable;
- download;
- delete where safe;
- no generic text edit.

Protected resources:
- `secrets.json`: metadata only in generic storage manager; no plaintext generic editor/delete.
- storage database files/WAL/SHM: metadata only; logical records are managed through repositories.

Delete levels:
- simple resource: one confirmation;
- associated/domain resource: impact summary + confirmation;
- category/bulk destructive actions: stronger second confirmation.

#### Browser data

localStorage / sessionStorage:
- list/search;
- view;
- create/edit;
- delete.

IndexedDB:
- database -> object store -> records;
- inspect key/value;
- edit/delete safe structured-clone-compatible records;
- special values (Blob, ArrayBuffer, Map, Set, typed arrays, etc.) are view-only unless safely represented.

Cache Storage:
- cache -> request/response inspection;
- search;
- delete request;
- delete cache;
- no response editor in v1.

Quota:
- read-only.

## Architecture

Prefer new Atria-owned modules under concise namespaces and dedicated folders instead of extending `public/scripts/user.js` further.

Suggested split:

```
src/backup-sync/
  providers/
  restore/
  archive/
  jobs/

public/scripts/backup-sync/
public/scripts/storage-management/
```

Existing mature LAN sync internals remain intact and are adapted rather than rewritten.

## Validation

Run targeted tests during each phase, then default repository validation appropriate to this task:
- ESLint;
- full Node unit suite;
- backup/restore/storage/sync targeted tests;
- relevant frontend/browser smoke/E2E where practical;
- frontend build / syntax checks used by repository CI;
- PR Checks.

Per repository policy, Android JVM tests and Docker builds are opt-in and are not part of this task unless explicitly requested.

## Delivery

1. Implement on `feat/backup-sync-storage-center`.
2. Validate.
3. Record implementation on permanent `docs` branch.
4. Create/update PR into `main`.
5. Wait for required CI to pass.
6. Merge.
7. Verify merged `main`.
8. Delete temporary branch.
