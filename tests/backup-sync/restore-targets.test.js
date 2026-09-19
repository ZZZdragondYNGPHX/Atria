import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    resetGlobalExtensionsRestoreDirectory,
    resetRestoreDirectory,
} from '../../src/backup-sync/restore-targets.js';

describe('restore target clearing', () => {
    test('global extensions clear preserves tracked .gitkeep and removes extension payloads', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-restore-target-'));
        try {
            await fs.writeFile(path.join(root, '.gitkeep'), '');
            await fs.mkdir(path.join(root, 'example-extension'), { recursive: true });
            await fs.writeFile(path.join(root, 'example-extension', 'index.js'), 'payload');
            await fs.writeFile(path.join(root, 'loose.txt'), 'payload');

            await resetGlobalExtensionsRestoreDirectory(root);

            expect(await fs.readdir(root)).toEqual(['.gitkeep']);
            expect(await fs.readFile(path.join(root, '.gitkeep'), 'utf8')).toBe('');
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('global extensions clear recreates a missing .gitkeep sentinel', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-restore-target-missing-'));
        try {
            await fs.mkdir(path.join(root, 'old-extension'), { recursive: true });
            await resetGlobalExtensionsRestoreDirectory(root);
            expect(await fs.readdir(root)).toEqual(['.gitkeep']);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('ordinary restore directories are fully replaced', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-restore-target-plain-'));
        try {
            await fs.writeFile(path.join(root, '.gitkeep'), 'not-special-here');
            await fs.writeFile(path.join(root, 'old.txt'), 'payload');
            await resetRestoreDirectory(root);
            expect(await fs.readdir(root)).toEqual([]);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
