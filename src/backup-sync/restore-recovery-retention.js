import fs from 'node:fs';
import path from 'node:path';

import { SNAPSHOT_META_ENTRY } from '../storage/migration/backup.js';

export const RESTORE_RECOVERY_POINT_LIMIT = 5;

/**
 * Keep at most the newest recovery points for one account.
 * Unrelated/incomplete directories are ignored. Protected paths are never
 * removed, which lets recovery-apply keep its selected source point while
 * creating the automatic undo point.
 */
export async function pruneRestoreRecoveryPoints({
    backupRoot,
    handle,
    limit = RESTORE_RECOVERY_POINT_LIMIT,
    protectPaths = [],
}) {
    const maxPoints = Math.max(1, Number(limit) || RESTORE_RECOVERY_POINT_LIMIT);
    const protectedPaths = new Set(
        protectPaths
            .filter(Boolean)
            .map(item => path.resolve(String(item))),
    );

    let entries = [];
    try {
        entries = await fs.promises.readdir(backupRoot, { withFileTypes: true });
    } catch {
        return { kept: 0, removed: [] };
    }

    const points = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const recoveryPath = path.resolve(backupRoot, entry.name);
        const metaPath = path.join(recoveryPath, SNAPSHOT_META_ENTRY);
        try {
            const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
            if (meta?.handle !== handle) continue;
            const stat = await fs.promises.stat(recoveryPath);
            points.push({
                path: recoveryPath,
                createdAt: String(meta.createdAt || stat.mtime.toISOString()),
            });
        } catch {
            // Ignore non-recovery or incomplete directories.
        }
    }

    points.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const keep = new Set(points.slice(0, maxPoints).map(point => point.path));
    for (const protectedPath of protectedPaths) {
        keep.add(protectedPath);
    }

    // If a protected old point pushes us over the cap, evict the oldest
    // non-protected point so the retained set still converges to the limit.
    const keptCandidates = points.filter(point => keep.has(point.path));
    if (keptCandidates.length > maxPoints) {
        const removableKept = keptCandidates
            .filter(point => !protectedPaths.has(point.path))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        while (keep.size > maxPoints && removableKept.length > 0) {
            keep.delete(removableKept.shift().path);
        }
    }

    const removed = [];
    for (const point of points) {
        if (keep.has(point.path)) continue;
        await fs.promises.rm(point.path, { recursive: true, force: true });
        removed.push(point.path);
    }

    return {
        kept: points.length - removed.length,
        removed,
    };
}
