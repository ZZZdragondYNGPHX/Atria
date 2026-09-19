# Restore UI visibility and recovery-point retention

## Task

Improve Backup Center restore controls and bound restore recovery-point growth.

Two operator-facing changes were requested:

1. keep the **中断并回退** control visible at all times instead of hiding it outside an active restore;
2. cap restore recovery history at **5 points per account** and enforce the cap on disk, not only in the rendered list.

## Branch and PR

- Baseline: `main@aebd6ada8760fea3b07b65ba0f05b5b278b3f471`
- Task branch: `fix/restore-ui-and-recovery-retention`
- Final validated task head: `cdcca4ed1906c60a9063a786e9a02c04d2e758ab`
- PR: #20
- Squash merge / resulting `main`: `892476eb6a694bc5fa89124e0a3de65a86a8c12e`
- Validated task-head tree and merged-main tree: `f59238cb6ddb1514ad2a481111908e64ed25137c`

## UI change

The archive restore action row now always contains both controls:

- **开始安全恢复**
- **中断并回退**

The interrupt control behavior is:

- idle / preflight / completed / failed: visible but disabled;
- active restore: enabled;
- cancelling / rollback: visible, disabled, and labelled `正在中断并回退…`.

This makes the safety action discoverable before a long restore begins while preserving the existing rule that it can only be activated during an active restore.

## Recovery-point retention

Previous behavior:

- `listRestoreRecoveryPoints()` rendered at most 50 points;
- old recovery-point directories remained on disk without a true count cap.

New behavior:

- `RESTORE_RECOVERY_POINT_LIMIT = 5`;
- retention is per account;
- the oldest points are deleted from disk when the sixth/newer point is created;
- opening/refreshing the recovery list also prunes any pre-existing backlog down to five;
- same-mode restore and cross-mode restore both apply the retention policy;
- recovery points belonging to other accounts are not counted or deleted;
- a recovery point currently being applied is protected from pruning;
- when recovery-point apply creates its automatic undo point, both the selected source point and new undo point are protected while retention converges back to five.

The UI now tells the operator that each account keeps at most five restore points.

## Validation

Final task head passed:

- Atria Migration Guard;
- ESLint;
- complete Node unit suite;
- Backup & Storage UI:
  - Backup Center Chromium;
  - Browser Storage Chromium;
  - Server Storage Chromium.

Regression coverage verifies:

- more than five points for one account are pruned to five;
- the oldest points are physically removed;
- another account's recovery points are untouched;
- a protected old recovery point is retained while the total still converges to five;
- the interrupt control is visible and disabled while idle;
- after manual cancellation/rollback it remains visible and returns to disabled state.

Android JVM tests and Android/Docker builds were not run because this task changes Node/frontend restore behavior only and those checks remain opt-in.

## Data/config impact

No backup archive format, worldbook format, storage schema, or user configuration migration was introduced.

Existing restore-point directories above the five-point cap are automatically pruned the next time recovery history is listed/refreshed or a new restore point is created.
