import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function shouldStageRestoreArchive(uploadPath, { platform = process.platform } = {}) {
    const normalized = path.resolve(String(uploadPath || '')).replaceAll('\\', '/');
    return platform === 'android'
        || normalized.startsWith('/storage/emulated/')
        || normalized.startsWith('/sdcard/');
}

export async function stageRestoreArchiveForRandomAccess(
    uploadPath,
    onProgress = null,
    {
        force = false,
        platform = process.platform,
        tempRootParent = os.tmpdir(),
    } = {},
) {
    if (!force && !shouldStageRestoreArchive(uploadPath, { platform })) {
        return { path: uploadPath, cleanup: async () => {}, staged: false };
    }

    const stat = await fsPromises.stat(uploadPath);
    const total = Number(stat.size || 0);
    await fsPromises.mkdir(tempRootParent, { recursive: true });
    const tempRoot = await fsPromises.mkdtemp(path.join(tempRootParent, 'atria-restore-'));
    const stagedPath = path.join(tempRoot, 'archive.zip');
    let copied = 0;
    let lastReportAt = 0;

    const report = (forceReport = false) => {
        const now = Date.now();
        if (!forceReport && now - lastReportAt < 250) return;
        lastReportAt = now;
        try {
            onProgress?.({ phase: 'stage', current: copied, total });
        } catch {
            // Progress observers are advisory and must never break restore.
        }
    };

    console.info(`[user-backup] Stage archive start: source=${uploadPath} size=${total}B tempRoot=${tempRoot}`);
    report(true);

    try {
        const meter = new Transform({
            transform(chunk, _encoding, callback) {
                copied += chunk.length;
                report(false);
                callback(null, chunk);
            },
        });

        await pipeline(
            fs.createReadStream(uploadPath),
            meter,
            fs.createWriteStream(stagedPath, { mode: 0o600 }),
        );

        report(true);
        console.info(`[user-backup] Stage archive done: copied=${copied}B path=${stagedPath}`);
        return {
            path: stagedPath,
            staged: true,
            cleanup: async () => {
                await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
            },
        };
    } catch (error) {
        await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
        throw new Error(`Failed to stage restore archive into internal temp storage: ${error?.message || error}`);
    }
}
