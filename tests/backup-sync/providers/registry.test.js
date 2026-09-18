import {
    BackupSyncProviderRegistry,
    createBuiltinBackupSyncProviderRegistry,
    PROVIDER_KINDS,
} from '../../../src/backup-sync/providers/registry.js';

describe('backup/sync provider registry', () => {
    test('ships functional local-file and LAN providers plus unavailable cloud slots', () => {
        const registry = createBuiltinBackupSyncProviderRegistry();
        expect(registry.get('local-file')).toMatchObject({ kind: 'archive', available: true });
        expect(registry.get('lan-sync')).toMatchObject({
            kind: 'sync',
            available: true,
            capabilities: {
                bidirectionalSync: true,
                incrementalSync: true,
                conflictResolution: true,
            },
        });
        for (const id of ['google-drive', 'onedrive', 'github']) {
            expect(registry.get(id)).toMatchObject({ available: false, future: true });
        }
    });

    test('registry rejects duplicate ids and returns defensive copies', () => {
        const registry = new BackupSyncProviderRegistry();
        registry.register({
            id: 'x',
            label: 'X',
            kind: PROVIDER_KINDS.ARCHIVE,
            available: true,
            capabilities: { download: true },
        });
        expect(() => registry.register({ id: 'x', kind: PROVIDER_KINDS.ARCHIVE })).toThrow(/already registered/);
        const copy = registry.get('x');
        copy.capabilities.download = false;
        expect(registry.get('x').capabilities.download).toBe(true);
    });
});
