import fsp from 'node:fs/promises';
import path from 'node:path';
import { withAccountFileGrowth, accountDirectoryRoot } from './account-quota.js';
import { assertAccountPath } from './path-boundary.js';
import { getStorageEngine } from './index.js';
import { durableWriteAsync } from './durable-file.js';
import { fileResourceBytes } from './resource-accounting.js';

/** Final binary/file publication; incoming temporary uploads are not resources. */
export async function writeAccountFile(handle, file, bytesValue, engine = getStorageEngine()) {
    const bytes = Buffer.from(bytesValue);
    const root = accountDirectoryRoot(engine, handle);
    if (root) assertAccountPath(root, file);
    const relative = root ? path.relative(root, file).split(path.sep).join('/') : '';
    return withAccountFileGrowth(handle, async () => {
        let previous = 0;
        try { previous = fileResourceBytes(relative, await fsp.readFile(file)).bytes; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        return fileResourceBytes(relative, bytes).bytes - previous;
    }, () => durableWriteAsync(file, bytes), engine);
}
