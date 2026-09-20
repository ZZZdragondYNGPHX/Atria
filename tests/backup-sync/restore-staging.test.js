import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    shouldStageRestoreArchive,
    stageRestoreArchiveForRandomAccess,
} from '../../src/backup-sync/restore-staging.js';

describe('restore archive staging', () => {
    test('detects Android and shared-storage restore paths', () => {
        expect(shouldStageRestoreArchive('/tmp/backup.zip', { platform: 'android' })).toBe(true);
        expect(shouldStageRestoreArchive('/storage/emulated/0/Atria/data/_uploads/a.zip', { platform: 'linux' })).toBe(true);
        expect(shouldStageRestoreArchive('/sdcard/Atria/a.zip', { platform: 'linux' })).toBe(true);
        expect(shouldStageRestoreArchive('/tmp/backup.zip', { platform: 'linux' })).toBe(false);
    });

    test('stages bytes into an internal temporary copy and cleans it up', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-restore-staging-test-'));
        try {
            const source = path.join(root, 'source.zip');
            const tempRootParent = path.join(root, 'internal');
            const payload = Buffer.concat([
                Buffer.from('PK\u0003\u0004'),
                Buffer.alloc(256 * 1024, 7),
            ]);
            await fs.writeFile(source, payload);

            const progress = [];
            const staged = await stageRestoreArchiveForRandomAccess(
                source,
                event => progress.push({ ...event }),
                { force: true, tempRootParent },
            );

            expect(staged.staged).toBe(true);
            expect(staged.path).not.toBe(source);
            expect(await fs.readFile(staged.path)).toEqual(payload);
            expect(progress[0]).toMatchObject({ phase: 'stage', current: 0, total: payload.length });
            expect(progress.at(-1)).toMatchObject({ phase: 'stage', current: payload.length, total: payload.length });

            const stagedDir = path.dirname(staged.path);
            await staged.cleanup();
            await expect(fs.stat(stagedDir)).rejects.toThrow();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('does not duplicate ordinary desktop temp uploads', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-restore-no-stage-test-'));
        try {
            const source = path.join(root, 'source.zip');
            await fs.writeFile(source, 'zip');
            const staged = await stageRestoreArchiveForRandomAccess(
                source,
                null,
                { platform: 'linux', tempRootParent: path.join(root, 'unused') },
            );
            expect(staged.staged).toBe(false);
            expect(staged.path).toBe(source);
            await staged.cleanup();
            expect(await fs.readFile(source, 'utf8')).toBe('zip');
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
