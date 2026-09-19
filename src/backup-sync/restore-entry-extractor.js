import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import AdmZip from 'adm-zip';

export const RESTORE_ENTRY_IDLE_TIMEOUT_MS = 15_000;
export const RESTORE_ENTRY_DEGRADED_IDLE_TIMEOUT_MS = 1_000;
export const RESTORE_ENTRY_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;

export class RestoreEntryAdaptivePolicy {
    #degraded = false;

    constructor({
        normalTimeoutMs = RESTORE_ENTRY_IDLE_TIMEOUT_MS,
        degradedTimeoutMs = RESTORE_ENTRY_DEGRADED_IDLE_TIMEOUT_MS,
    } = {}) {
        this.normalTimeoutMs = normalTimeoutMs;
        this.degradedTimeoutMs = degradedTimeoutMs;
    }

    get degraded() {
        return this.#degraded;
    }

    get timeoutMs() {
        return this.#degraded ? this.degradedTimeoutMs : this.normalTimeoutMs;
    }

    noteStall() {
        this.#degraded = true;
    }
}


export class RestoreEntryIdleTimeoutError extends Error {
    constructor(entryName, timeoutMs) {
        super(`Restore entry stream produced no data for ${timeoutMs} ms: ${entryName}`);
        this.name = 'RestoreEntryIdleTimeoutError';
        this.code = 'ATRIA_RESTORE_ENTRY_IDLE';
        this.entryName = entryName;
        this.timeoutMs = timeoutMs;
    }
}

export function isRestoreEntryIdleTimeoutError(error) {
    return error?.code === 'ATRIA_RESTORE_ENTRY_IDLE';
}

export async function streamZipEntryWithIdleTimeout({
    zipfile,
    entry,
    targetPath,
    onChunk = null,
    timeoutMs = RESTORE_ENTRY_IDLE_TIMEOUT_MS,
}) {
    if (!zipfile || typeof zipfile.openReadStream !== 'function') {
        throw new Error('streamZipEntryWithIdleTimeout: zipfile is required');
    }
    if (!entry) {
        throw new Error('streamZipEntryWithIdleTimeout: entry is required');
    }
    if (!targetPath) {
        throw new Error('streamZipEntryWithIdleTimeout: targetPath is required');
    }

    return await new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        let readStream = null;
        let writeStream = null;
        let bytes = 0;

        const clearTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        const finish = (error = null) => {
            if (settled) return;
            settled = true;
            clearTimer();
            if (error) {
                try { readStream?.destroy?.(); } catch { /* best effort */ }
                try { writeStream?.destroy?.(); } catch { /* best effort */ }
                reject(error);
            } else {
                resolve({ bytes });
            }
        };

        const armTimer = () => {
            clearTimer();
            timer = setTimeout(() => {
                const error = new RestoreEntryIdleTimeoutError(entry.fileName, timeoutMs);
                try { readStream?.destroy?.(error); } catch { /* best effort */ }
                try { writeStream?.destroy?.(error); } catch { /* best effort */ }
                finish(error);
            }, timeoutMs);
            timer.unref?.();
        };

        armTimer();
        zipfile.openReadStream(entry, (streamError, stream) => {
            if (settled) {
                try { stream?.destroy?.(); } catch { /* best effort */ }
                return;
            }
            if (streamError) {
                finish(streamError);
                return;
            }

            readStream = stream;
            writeStream = fs.createWriteStream(targetPath, { mode: 0o644 });
            const meter = new Transform({
                transform(chunk, _encoding, callback) {
                    bytes += chunk.length;
                    try { onChunk?.(chunk.length, bytes); } catch { /* observer */ }
                    armTimer();
                    callback(null, chunk);
                },
            });

            armTimer();
            pipeline(readStream, meter, writeStream)
                .then(() => finish())
                .catch(error => finish(error));
        });
    });
}

export async function extractZipEntryWithAdmZip({
    zipPath,
    entryName,
    targetPath,
    expectedSize = 0,
    onBytes = null,
    maxBufferedBytes = RESTORE_ENTRY_FALLBACK_MAX_BYTES,
}) {
    const declaredSize = Number(expectedSize || 0);
    if (declaredSize > maxBufferedBytes) {
        const error = new Error(
            `Fallback extractor refused ${entryName}: ${declaredSize} bytes exceeds ${maxBufferedBytes} byte safety limit`,
        );
        error.code = 'ATRIA_RESTORE_ENTRY_FALLBACK_TOO_LARGE';
        throw error;
    }

    const zip = new AdmZip(zipPath);
    const zipEntry = zip.getEntry(entryName);
    if (!zipEntry) {
        const error = new Error(`Fallback extractor could not find ZIP entry: ${entryName}`);
        error.code = 'ATRIA_RESTORE_ENTRY_FALLBACK_MISSING';
        throw error;
    }

    const data = zip.readFile(zipEntry);
    if (!Buffer.isBuffer(data)) {
        const error = new Error(`Fallback extractor returned no data for ZIP entry: ${entryName}`);
        error.code = 'ATRIA_RESTORE_ENTRY_FALLBACK_EMPTY';
        throw error;
    }
    if (data.length > maxBufferedBytes) {
        const error = new Error(
            `Fallback extractor refused ${entryName}: decoded size ${data.length} exceeds ${maxBufferedBytes} byte safety limit`,
        );
        error.code = 'ATRIA_RESTORE_ENTRY_FALLBACK_TOO_LARGE';
        throw error;
    }
    if (declaredSize > 0 && data.length !== declaredSize) {
        const error = new Error(
            `Fallback extractor size mismatch for ${entryName}: expected ${declaredSize}, got ${data.length}`,
        );
        error.code = 'ATRIA_RESTORE_ENTRY_FALLBACK_SIZE_MISMATCH';
        throw error;
    }

    await fsPromises.writeFile(targetPath, data, { mode: 0o644 });
    try { onBytes?.(data.length); } catch { /* observer */ }
    return { bytes: data.length };
}
