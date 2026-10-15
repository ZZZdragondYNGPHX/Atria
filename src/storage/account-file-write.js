import fsp from 'node:fs/promises';
import { withAccountFileGrowth, accountDirectoryRoot } from './account-quota.js';
import { assertAccountPath } from './path-boundary.js';
import { getStorageEngine } from './index.js';
import { durableWriteAsync } from './durable-file.js';

/** Final binary/file publication; incoming temporary uploads are not resources. */
export async function writeAccountFile(handle, file, bytesValue, engine = getStorageEngine()) {
    const bytes = Buffer.from(bytesValue);
    const root = accountDirectoryRoot(engine, handle);
    if (root) assertAccountPath(root, file);
    return withAccountFileGrowth(handle, async () => {
        let previous = 0;
        try { previous = (await fsp.stat(file)).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        return bytes.length - previous;
    }, () => durableWriteAsync(file, bytes), engine);
}
