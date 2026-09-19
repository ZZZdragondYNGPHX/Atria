import fs from 'node:fs';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';

/**
 * Clear a restore target directory while preserving repository-owned root
 * sentinels. This is used for directories that are both runtime data targets
 * and part of the checked-out source tree (notably third-party extensions).
 */
export async function resetRestoreDirectory(directoryPath, { preserveRootFiles = [] } = {}) {
    const target = path.resolve(directoryPath);
    const preserved = new Set(preserveRootFiles.map(name => path.basename(String(name || ''))).filter(Boolean));

    if (preserved.size === 0) {
        await fsPromises.rm(target, { recursive: true, force: true });
        await fsPromises.mkdir(target, { recursive: true });
        return;
    }

    await fsPromises.mkdir(target, { recursive: true });
    const entries = await fsPromises.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
        if (preserved.has(entry.name)) continue;
        await fsPromises.rm(path.join(target, entry.name), { recursive: true, force: true });
    }

    for (const name of preserved) {
        const sentinelPath = path.join(target, name);
        if (!fs.existsSync(sentinelPath)) {
            await fsPromises.writeFile(sentinelPath, '');
        }
    }
}

export async function resetGlobalExtensionsRestoreDirectory(directoryPath) {
    await resetRestoreDirectory(directoryPath, { preserveRootFiles: ['.gitkeep'] });
}
