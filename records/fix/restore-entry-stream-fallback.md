# Restore ZIP entry stream fallback

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## Task

Fix archive restore getting stuck indefinitely on one selected ZIP entry even after Android shared-storage staging had succeeded.

## Branch and PR

- Baseline: `main@c2f2cf9f2e9da8cc7d591dc4d862dcbe888a8baf`
- Task branch: `fix/restore-entry-stream-fallback`
- PR: #17
- Squash merge / resulting `main`: `ea757892a2b0e7caf1e8d81cdf0e636a91d35cf5`

## Field evidence

On Android, after PR #15 staging was active:

- the 150,463,418-byte ZIP staged successfully into Termux internal temporary storage;
- archive analysis completed in under one second;
- recovery-point creation completed in under one second;
- the first six worldbook JSON files restored successfully;
- restore then stopped at:
  `default-user/worlds/为美好的世界献上祝福 - 沙盒 - 1.3.0.json bytes=0/1111783`.

Because progress remained at zero bytes for that entry, the stall happened before any JSON/worldbook parsing. The worldbook schema/performance changes were therefore not involved.

## Implementation

- Added `src/backup-sync/restore-entry-extractor.js`.
- Primary yauzl extraction now has a 15-second per-entry idle watchdog.
- The watchdog covers both:
  - waiting for `openReadStream` to yield a stream;
  - an opened stream that stops producing bytes.
- A timed-out primary stream is actively destroyed before retry.
- The same ZIP entry is then retried through the independent `adm-zip` extractor.
- Fallback extraction is bounded to 128 MiB decoded size per entry to avoid unbounded mobile memory usage.
- If fallback succeeds, restore continues with the next entry.
- If fallback also fails, the existing restore failure/rollback path receives the error instead of hanging indefinitely.
- Logs explicitly identify primary-stream stall and fallback success/failure.

## Data/config impact

No backup format, worldbook format, storage schema, or user configuration migration was introduced. This change only adds fault tolerance to raw ZIP entry extraction.
