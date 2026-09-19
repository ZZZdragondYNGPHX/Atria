import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const USER_URL = new URL('../public/scripts/user.js', import.meta.url);

describe('lazy account management tools', () => {
    test('keeps backup sync and storage management out of static imports', () => {
        const source = readFileSync(USER_URL, 'utf8');
        for (const modulePath of [
            './backup-sync-center.js',
            './storage-management.js',
        ]) {
            expect(source).not.toContain(`from '${modulePath}'`);
            expect(source).toContain(`import('${modulePath}')`);
        }
    });

    test('memoizes dynamic module loads', () => {
        const source = readFileSync(USER_URL, 'utf8');
        expect(source).toContain('backupSyncCenterModulePromise ??=');
        expect(source).toContain('storageManagementModulePromise ??=');
    });

    test('loads each tool only from its profile button handler', () => {
        const source = readFileSync(USER_URL, 'utf8');
        const backupButton = source.indexOf("'.userBackupSyncButton'");
        const backupLoad = source.indexOf('await loadBackupSyncCenterModule()', backupButton);
        const storageButton = source.indexOf("'.userStorageManagementButton'");
        const storageLoad = source.indexOf('await loadStorageManagementModule()', storageButton);

        expect(backupButton).toBeGreaterThanOrEqual(0);
        expect(backupLoad).toBeGreaterThan(backupButton);
        expect(storageButton).toBeGreaterThanOrEqual(0);
        expect(storageLoad).toBeGreaterThan(storageButton);
    });
});
