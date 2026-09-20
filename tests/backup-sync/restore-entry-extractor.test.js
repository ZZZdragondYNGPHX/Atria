import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

import AdmZip from 'adm-zip';
import archiver from 'archiver';
import yauzl from 'yauzl';

import { RestoreCancelledError } from '../../src/backup-sync/restore-cancel.js';
import {
    extractZipEntryWithAdmZip,
    isRestoreEntryIdleTimeoutError,
    RestoreEntryAdaptivePolicy,
    streamZipEntryWithIdleTimeout,
} from '../../src/backup-sync/restore-entry-extractor.js';

function buildArchiverZip(zipPath, entries) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
        archive.pipe(output);
        for (const [name, payload] of entries) {
            archive.append(payload, { name });
        }
        archive.finalize();
    });
}

async function extractWithYauzlPrimary(zipPath, outputRoot) {
    return await new Promise((resolve, reject) => {
        const restored = new Map();
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: true }, (openError, zipfile) => {
            if (openError) {
                reject(openError);
                return;
            }
            let settled = false;
            const finish = (error = null) => {
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve(restored);
            };

            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                (async () => {
                    if (entry.fileName.endsWith('/')) {
                        zipfile.readEntry();
                        return;
                    }
                    const targetPath = path.join(outputRoot, ...entry.fileName.split('/'));
                    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                    const result = await streamZipEntryWithIdleTimeout({
                        zipfile,
                        entry,
                        targetPath,
                        timeoutMs: 5_000,
                    });
                    restored.set(entry.fileName, result.bytes);
                    zipfile.readEntry();
                })().catch(finish);
            });
            zipfile.on('end', () => finish());
            zipfile.on('close', () => finish());
            zipfile.on('error', finish);
        });
    });
}

describe('restore entry extraction fallback', () => {
    test('archiver output round-trips through yauzl primary extraction for large unicode JSON and binary entries', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-yauzl-roundtrip-'));
        const zipPath = path.join(root, 'backup.zip');
        const outputRoot = path.join(root, 'restored');
        const worldbookName = 'default-user/worlds/为美好的世界献上祝福 - 沙盒 - 1.3.0.json';
        const binaryName = 'default-user/user/images/tsp-presets/tsp_preset_动漫_2.png';
        const worldbookPayload = Buffer.from(JSON.stringify({
            name: '为美好的世界献上祝福 - 沙盒 - 1.3.0',
            entries: Array.from({ length: 9000 }, (_, index) => ({
                uid: index,
                key: ['测试', `条目-${index}`],
                content: `这是用于 Atria 备份恢复回归的世界书内容 ${index}。`.repeat(3),
            })),
        }));
        const binaryPayload = crypto.randomBytes(2 * 1024 * 1024);

        try {
            expect(worldbookPayload.length).toBeGreaterThan(1024 * 1024);
            await buildArchiverZip(zipPath, [
                [worldbookName, worldbookPayload],
                [binaryName, binaryPayload],
            ]);

            const restored = await extractWithYauzlPrimary(zipPath, outputRoot);

            expect(restored.get(worldbookName)).toBe(worldbookPayload.length);
            expect(restored.get(binaryName)).toBe(binaryPayload.length);
            expect(fs.readFileSync(path.join(outputRoot, ...worldbookName.split('/')))).toEqual(worldbookPayload);
            expect(fs.readFileSync(path.join(outputRoot, ...binaryName.split('/')))).toEqual(binaryPayload);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('adaptive policy shortens later primary probes after the first stall', () => {
        const policy = new RestoreEntryAdaptivePolicy({
            normalTimeoutMs: 15_000,
            degradedTimeoutMs: 1_000,
        });
        expect(policy.degraded).toBe(false);
        expect(policy.timeoutMs).toBe(15_000);

        policy.noteStall();

        expect(policy.degraded).toBe(true);
        expect(policy.timeoutMs).toBe(1_000);
        policy.noteStall();
        expect(policy.timeoutMs).toBe(1_000);
    });

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

    test('manual cancel aborts a stalled entry before the idle watchdog', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-entry-cancel-'));
        const targetPath = path.join(root, 'stalled.bin');
        const stalled = new Readable({ read() {} });
        const zipfile = {
            openReadStream(_entry, callback) {
                callback(null, stalled);
            },
        };
        const controller = new AbortController();

        try {
            const pending = streamZipEntryWithIdleTimeout({
                zipfile,
                entry: { fileName: 'worlds/cancel-me.json' },
                targetPath,
                timeoutMs: 2_000,
                signal: controller.signal,
            });
            setTimeout(() => controller.abort(new RestoreCancelledError()), 20);

            await expect(pending).rejects.toMatchObject({
                code: 'ATRIA_RESTORE_CANCELLED',
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
