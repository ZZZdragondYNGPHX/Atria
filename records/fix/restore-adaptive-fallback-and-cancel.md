# Adaptive restore fallback and manual interrupt rollback

## Task

Improve large Android archive restore in two ways:

1. avoid paying the full 15-second yauzl idle watchdog on every repeated stalled ZIP entry after the first stall has already proven that the primary extractor is unreliable for the current archive/runtime;
2. add an operator-controlled **中断并回退** action that stops an active restore safely and restores the pre-restore recovery point when data mutation has already begun.

## Branch and PR

- Baseline: `main@ea757892a2b0e7caf1e8d81cdf0e636a91d35cf5`
- Task branch: `fix/restore-adaptive-fallback`
- Final validated task head: `fd75188f261351db34255aba994757bb6e92e949`
- PR: #18
- Squash merge / resulting `main`: `c51d8b779a741f0cf87758b5f8565be581f17556`
- Validated task-head tree and merged-main tree: `e6407588da5c13a0ba31a425a4b6e1841e562df3`

## Field evidence

On Android with `main@ea757892a`, fallback extraction worked, but each affected entry first waited the full 15-second watchdog:

- the reported 1.1 MiB worldbook stalled for 15 seconds, then fallback succeeded immediately;
- subsequent PNG entries repeated the same 15-second wait followed by near-immediate fallback success.

The bottleneck was therefore the repeated diagnostic timeout, not decompression throughput.

The operator also requested a safe way to stop a long-running restore without killing Atria or leaving partially restored data.

## Implementation

### Adaptive ZIP-entry fallback

- Added `RestoreEntryAdaptivePolicy`.
- The first silent yauzl entry still gets the normal 15-second watchdog so one transient delay does not immediately downgrade the whole restore.
- After the first confirmed stall, later entries use a 1-second primary idle probe.
- Entries that produce data promptly stay on the streaming yauzl path.
- Entries that remain silent fall back quickly to the existing bounded `adm-zip` extractor.
- Adaptive state is per restore invocation and disappears when that restore finishes.

### Manual interrupt and rollback

- Added shared restore-cancellation primitives with structured code `ATRIA_RESTORE_CANCELLED`.
- The local restore endpoint now owns one `AbortController` per active account restore.
- Added `POST /api/users/restore-backup/cancel`.
- Duplicate restore starts for the same account are rejected while a restore is active.
- Cancellation propagates through:
  - Android/shared-storage staging;
  - yauzl entry streams, including streams stuck before their first byte;
  - same-mode filesystem restore;
  - cross-mode restore checkpoints and filesystem extraction.
- If cancellation occurs before any mutation, restore stops with `rolledBack: false`.
- If cancellation occurs after the pre-restore snapshot and writes have begun, the existing recovery point is applied and the terminal result carries `rolledBack: true`.
- Late cancellation before final success is also honored, so an accepted cancel request cannot silently turn into success after the operator asked to stop.

### Backup Center UX

- Added a visible **中断并回退** button while restore is active.
- The action asks for confirmation.
- While cancellation/rollback is running, Backup Center shows `正在中断并回退…` and keeps conflicting controls locked.
- Terminal UI distinguishes:
  - cancelled before mutation — no rollback needed;
  - cancelled after mutation — restored to the pre-restore state.
- Cancellation state remains attached when Backup Center is closed and reopened in the same page session.

### Full-scope recovery points

Administrator full restore can include process-global third-party extensions in addition to per-user data.

To make the rollback guarantee honest for that scope:

- recovery points can now include a snapshot-only global-extension payload;
- `restoreFromSnapshot` excludes that internal payload from the user root;
- rollback restores both the user data and the global third-party extension directory;
- recovery-point apply/undo retains the same global-extension coverage;
- the tracked `.gitkeep` protection from PR #16 remains intact.

## Validation

Final task head passed:

- Atria Migration Guard;
- ESLint;
- complete Node unit suite;
- Backup & Storage UI workflow:
  - Backup Center Chromium;
  - Browser Storage Chromium;
  - Server Storage Chromium.

Regression coverage includes:

- adaptive 15-second → 1-second primary-probe policy;
- manual cancellation identity and rolled-back terminal metadata;
- aborting a stalled entry before its watchdog fires;
- aborting Android archive staging;
- Backup Center manual interrupt-and-rollback UI;
- snapshot-only global-extension payload never leaking into user-root restoration.

Android JVM tests and Android/Docker builds were not run because this task changes Node/frontend restore logic only and those checks remain opt-in.

## Data/config impact

No archive format, worldbook format, storage schema, or user configuration migration was introduced.

Recovery-point internals gain a private `_atria_global_extensions` payload only when an administrator full restore actually includes global third-party extensions.
