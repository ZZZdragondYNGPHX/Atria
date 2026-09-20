import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SNAPSHOT_META_ENTRY } from '../../src/storage/migration/backup.js';
import {
    pruneRestoreRecoveryPoints,
    RESTORE_RECOVERY_POINT_LIMIT,
} from '../../src/backup-sync/restore-recovery-retention.js';

async function makePoint(root, handle, index) {
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    const dir = path.join(root, `point-${handle}-${index}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, SNAPSHOT_META_ENTRY), JSON.stringify({ handle, createdAt }));
    await fs.writeFile(path.join(dir, 'payload.txt'), String(index));
    return dir;
}

describe('restore recovery retention', () => {
    test('keeps at most five points per account and deletes the oldest from disk', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-recovery-retention-'));
        try {
            const userPoints = [];
            for (let i = 0; i < 8; i++) userPoints.push(await makePoint(root, 'alice', i));
            const otherPoints = [];
            for (let i = 0; i < 3; i++) otherPoints.push(await makePoint(root, 'bob', i));

            const result = await pruneRestoreRecoveryPoints({
                backupRoot: root,
                handle: 'alice',
            });

            expect(RESTORE_RECOVERY_POINT_LIMIT).toBe(5);
            expect(result.kept).toBe(5);
            expect(result.removed).toHaveLength(3);

            for (let i = 0; i < 3; i++) {
                await expect(fs.stat(userPoints[i])).rejects.toThrow();
            }
            for (let i = 3; i < 8; i++) {
                await expect(fs.stat(userPoints[i])).resolves.toBeTruthy();
            }
            for (const point of otherPoints) {
                await expect(fs.stat(point)).resolves.toBeTruthy();
            }
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('protects a selected old point while still converging to the five-point cap', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-recovery-retention-protect-'));
        try {
            const points = [];
            for (let i = 0; i < 7; i++) points.push(await makePoint(root, 'alice', i));

            const protectedOldPoint = points[0];
            const result = await pruneRestoreRecoveryPoints({
                backupRoot: root,
                handle: 'alice',
                protectPaths: [protectedOldPoint],
            });

            expect(result.kept).toBe(5);
            await expect(fs.stat(protectedOldPoint)).resolves.toBeTruthy();

            const survivors = [];
            for (const point of points) {
                try {
                    await fs.stat(point);
                    survivors.push(point);
                } catch {
                    // pruned
                }
            }
            expect(survivors).toHaveLength(5);
            expect(survivors).toContain(protectedOldPoint);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
