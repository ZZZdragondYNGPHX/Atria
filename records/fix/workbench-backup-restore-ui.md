# Workspace maintenance cleanup and archive restore responsiveness

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

Fix two user-visible regressions reported from Android:

1. the Atria Memory Workspace hid duplicated maintenance actions but left their detached `?` help buttons visible;
2. a large local ZIP restore appeared to do nothing after confirmation even though the backend had already entered the restore path.

## Branch and PR

- Baseline: `main@9dc4cf842ca20d95caa07dfefb51efe856ce80f5`
- Task branch: `fix/workbench-backup-restore-ui`
- PR: #14
- Squash merge / resulting `main`: `dbaf8f2f397220a4e9544e44df55a114ea408067`

## Field evidence

The Android report showed:

- Atria running from external storage under `/storage/emulated/0/Atria/data`;
- a 150,463,418-byte archive;
- successful preflight with 1,595 restorable entries;
- backend log reaching `[user-backup] Restore start` but no visible UI progress for over a minute.

The Stable Diffusion `localhost:7860` connection errors in the same log are unrelated to backup restore.

The device was also still on `main@ff804b53a...`, behind the current repository main.

## Root causes

### Orphan Memory help controls

The Workspace adapter hid individual legacy maintenance buttons inside the mounted Memory Graph settings panel. Each maintenance row owns a separate `.atria-field-help` button, so hiding only the action button left standalone question-mark controls in the layout.

### Archive restore appeared hung

The backend already exposed NDJSON progress events, but the Backup & Sync client requested a normal JSON response and therefore displayed nothing until the entire restore completed.

The mandatory pre-restore recovery snapshot also used synchronous recursive filesystem copies. On Android shared storage this can block the Node event loop for a long time when the user tree contains many files.

## Implementation

- Hide the whole obsolete Memory maintenance row when its action is superseded by the native Workspace action; the paired help control disappears with the row.
- Give the restore button native `disabled` state in addition to visual state.
- Add a preflight generation token so stale async preflight responses cannot re-enable the wrong restore state.
- Request `application/x-ndjson` for archive restore and consume the existing backend progress stream.
- Preserve JSON fallback for older/non-streaming backend responses.
- Disable conflicting archive/mode/category controls while a restore is active.
- Change migration snapshot/rollback directory copies from synchronous `cpSync` to awaited `fs.promises.cp`, keeping the event loop responsive while preserving completion ordering.
- Add backend phase logging for analysis, recovery-point creation, extraction progress, and completion/failure timing.

## Data/config impact

No data format migration was introduced. Recovery-point and archive formats remain unchanged. The change affects restore execution responsiveness, progress reporting, and same-mode restore locking only.
