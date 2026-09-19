# Android archive restore stall

## Task

Fix the Android local-archive restore path that could enter extraction and remain at `1/N` indefinitely even though preflight and recovery-point creation had already completed.

## Branch and PR

- Baseline: `main@dbaf8f2f397220a4e9544e44df55a114ea408067`
- Task branch: `fix/android-archive-restore-stall`
- Final validated task head: `c6b143f7d9b55ada9be194a4587e053bc54867dd`
- Validated task tree: `5e73acc167d1de065f975b9b43cc3bbdbf93bbea`
- PR: #15
- Squash merge / resulting `main`: `43caed0c7d2d27a18b5de3f851bdfefcafb26dd2`
- Merged tree: `5e73acc167d1de065f975b9b43cc3bbdbf93bbea` (identical to the validated task-head tree)
- Temporary task branch was removed after merge

## Field evidence

Android device log on `main@dbaf8f2f3` showed:

- restore ZIP size: 150,463,418 bytes;
- archive analysis: 1,004 ms;
- recovery snapshot: 604 ms;
- 1,595 targetable entries;
- extraction advanced to `1/1595` and then made no further file-count progress for more than 90 seconds.

The upload path is under `/storage/emulated/0/Atria/data/_uploads`, i.e. Android emulated/shared storage. The same log later showed a recovery-point apply attempt rejected with `another holder is migrating`; that was secondary and confirmed the original restore was still alive and holding the migration lock.

Stable Diffusion localhost:7860 connection errors in the same session were unrelated.

## Root cause model

Preflight only needs the ZIP central directory and completed quickly. Actual extraction uses `yauzl.openReadStream`, which performs random-access reads against the uploaded ZIP.

On Android, the uploaded ZIP lives on emulated/FUSE shared storage. That is a materially different I/O path from Termux internal storage and can stall random-access ZIP entry reads even when central-directory scanning succeeds.

The previous UI also reported only completed-entry count, so a blocked or very large next entry looked identical to a dead restore.

## Implementation

- Added `src/backup-sync/restore-staging.js`.
- Android/shared-storage ZIPs are copied to an internal temporary directory before random-access extraction.
- Ordinary desktop/internal temporary uploads stay zero-copy.
- The staged copy reports byte progress and is removed in the route `finally` path.
- Local archive restore, LAN migration import, and the legacy Data ZIP import all use the same staging protection.
- Extraction now emits the current entry path, ordinal, bytes written, and total entry bytes.
- Backup Center renders staging and per-entry byte progress instead of showing only a frozen file count.
- Recovery-point buttons are disabled while an archive restore owns the migration lock, preventing misleading in-UI rollback attempts during an active restore.
- Existing recovery-point creation, migration locking, rollback guarantees, category selection, and post-restore verification remain unchanged.

## Validation

Final task head passed:

- Atria Migration Guard;
- ESLint;
- complete Node unit suite;
- Backup Center Chromium;
- Browser Storage Chromium;
- Server Storage Chromium.

Regression coverage includes:

- Android/shared-storage path detection;
- byte-preserving staged copy;
- staging progress events and cleanup;
- zero-copy behavior for ordinary non-Android temporary uploads;
- Backup Center consumption of staging and per-entry streamed progress.

Android JVM tests and Android/Docker builds were not run because they remain opt-in and this task changes no Android/Kotlin or container-delivery code.

## Data/config impact

No backup format, restore format, storage schema, or user configuration migration was introduced. The change only affects where a restore ZIP is read from during Android/shared-storage restores and how progress is surfaced.
