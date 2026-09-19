import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    shouldStageRestoreArchive,
    stageRestoreArchiveForRandomAccess,
} from '../../../src/backup-sync/restore-staging.js';

describe('Android archive restore staging', () => {
    test('recognizes Android shared-storage paths and android platform', () => {
        expect(shouldStageRestoreArchive('/storage/emulated/0/Atria/data/_uploads/a.zip', 'linux')).toBe(true);
        expect(shouldStageRestoreArchive('/sdcard/Atria/data/_uploads/a.zip', 'linux')).toBe(true);
        expect(shouldStageRestoreArchive('/tmp/a.zip', 'android')).toBe(true);
        expect(shouldStageRestoreArchive('/tmp/a.zip', 'linux')).toBe(false);
    });

    test('Android staging copies bytes into internal temp storage, reports progress, and cleans up', async () => {
        const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-restore-stage-test-'));
        const source = path.join(fixtureRoot, 'source.zip');
        const tempRoot = path.join(fixtureRoot, 'internal-temp');
        const bytes = Buffer.concat([
            Buffer.from('PK\x03\x04'),
            Buffer.alloc(256 * 1024, 0x5a),
            Buffer.from('END'),
        ]);
        fs.writeFileSync(source, bytes);
        fs.mkdirSync(tempRoot, { recursive: true });

        const events = [];
        let staged;
        try {
            staged = await stageRestoreArchiveForRandomAccess(
                source,
                event => events.push({ ...event }),
                { platform: 'android', tempRoot },
            );

            expect(staged.staged).toBe(true);
            expect(staged.path).not.toBe(source);
            expect(path.dirname(staged.path)).not.toBe(path.dirname(source));
            expect(fs.readFileSync(staged.path)).toEqual(bytes);

            expect(events.length).toBeGreaterThanOrEqual(2);
            expect(events[0]).toMatchObject({ phase: 'stage', current: 0, total: bytes.length });
            expect(events.at(-1)).toMatchObject({ phase: 'stage', current: bytes.length, total: bytes.length });

            const stagedRoot = path.dirname(staged.path);
            expect(fs.existsSync(stagedRoot)).toBe(true);
            await staged.cleanup();
            expect(fs.existsSync(stagedRoot)).toBe(false);
            staged = null;
        } finally {
            if (staged) await staged.cleanup();
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    test('ordinary local paths stay zero-copy outside Android/shared storage', async () => {
        const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-restore-stage-nop-'));
        const source = path.join(fixtureRoot, 'source.zip');
        fs.writeFileSync(source, 'PK\x03\x04local');

        try {
            const staged = await stageRestoreArchiveForRandomAccess(source, null, {
                platform: 'linux',
                tempRoot: path.join(fixtureRoot, 'unused'),
            });
            expect(staged.staged).toBe(false);
            expect(staged.path).toBe(source);
            await staged.cleanup();
            expect(fs.existsSync(source)).toBe(true);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });
});
