import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import AdmZip from 'adm-zip';

import {
    extractZipEntryWithAdmZip,
    isRestoreEntryIdleTimeoutError,
    streamZipEntryWithIdleTimeout,
} from '../../src/backup-sync/restore-entry-extractor.js';

describe('restore entry extraction fallback', () => {
    test('watchdog rejects an entry stream that never produces data', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-entry-stall-'));
        const targetPath = path.join(root, 'stalled.bin');
        const stalled = new Readable({ read() {} });
        const zipfile = {
            openReadStream(_entry, callback) {
                callback(null, stalled);
            },
        };

        try {
            await expect(streamZipEntryWithIdleTimeout({
                zipfile,
                entry: { fileName: 'worlds/stalled.json' },
                targetPath,
                timeoutMs: 25,
            })).rejects.toMatchObject({
                code: 'ATRIA_RESTORE_ENTRY_IDLE',
                entryName: 'worlds/stalled.json',
            });
        } finally {
            stalled.destroy();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('fallback extractor recovers a unicode JSON entry byte-for-byte', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-entry-fallback-'));
        const zipPath = path.join(root, 'backup.zip');
        const targetPath = path.join(root, 'restored.json');
        const entryName = 'default-user/worlds/为美好的世界献上祝福 - 沙盒 - 1.3.0.json';
        const payload = Buffer.from(JSON.stringify({
            name: '为美好的世界献上祝福 - 沙盒 - 1.3.0',
            entries: Array.from({ length: 5000 }, (_, index) => ({
                id: index,
                content: `世界书条目-${index}-测试内容`,
            })),
        }));

        try {
            const zip = new AdmZip();
            zip.addFile(entryName, payload);
            zip.writeZip(zipPath);

            let reportedBytes = 0;
            const result = await extractZipEntryWithAdmZip({
                zipPath,
                entryName,
                targetPath,
                expectedSize: payload.length,
                onBytes: bytes => { reportedBytes = bytes; },
            });

            expect(result.bytes).toBe(payload.length);
            expect(reportedBytes).toBe(payload.length);
            expect(fs.readFileSync(targetPath)).toEqual(payload);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('idle-timeout classifier does not swallow ordinary extraction errors', () => {
        expect(isRestoreEntryIdleTimeoutError({ code: 'ATRIA_RESTORE_ENTRY_IDLE' })).toBe(true);
        expect(isRestoreEntryIdleTimeoutError(new Error('crc mismatch'))).toBe(false);
    });
});
