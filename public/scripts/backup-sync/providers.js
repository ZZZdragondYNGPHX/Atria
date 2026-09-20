import { openLanSyncPanel } from '../lan-sync.js';

export const BACKUP_SYNC_PROVIDER_KIND = Object.freeze({
    ARCHIVE: 'archive',
    SYNC: 'sync',
});

export class BackupSyncProviderRegistry {
    #providers = new Map();

    register(provider) {
        const id = String(provider?.id || '').trim();
        if (!id) throw new TypeError('Backup/sync provider id is required.');
        if (this.#providers.has(id)) throw new TypeError(`Backup/sync provider already registered: ${id}`);
        this.#providers.set(id, provider);
        return this;
    }

    get(id) {
        return this.#providers.get(String(id || '')) || null;
    }

    list() {
        return [...this.#providers.values()];
    }
}

export class LocalFileArchiveProvider {
    id = 'local-file';
    label = 'Local File';
    kind = BACKUP_SYNC_PROVIDER_KIND.ARCHIVE;
    available = true;
    capabilities = Object.freeze({
        openArtifact: true,
        exportArtifact: true,
        list: false,
        delete: false,
        backgroundSync: false,
    });

    async openArtifact(file) {
        if (!(file instanceof File)) throw new TypeError('Local File provider requires a File.');
        if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
            throw new TypeError('Atria backup artifact must be a ZIP archive.');
        }
        return {
            providerId: this.id,
            id: `${file.name}:${file.size}:${file.lastModified}`,
            name: file.name,
            size: file.size,
            modifiedMs: file.lastModified,
            file,
        };
    }
}

export class LanSyncProviderAdapter {
    id = 'lan-sync';
    label = 'LAN Sync';
    kind = BACKUP_SYNC_PROVIDER_KIND.SYNC;
    available = true;
    capabilities = Object.freeze({
        bidirectionalSync: true,
        incrementalSync: true,
        conflictResolution: true,
        undo: true,
    });

    async open() {
        return openLanSyncPanel();
    }
}

class FutureCloudProvider {
    constructor(id, label) {
        this.id = id;
        this.label = label;
        this.kind = BACKUP_SYNC_PROVIDER_KIND.ARCHIVE;
        this.available = false;
        this.future = true;
        this.capabilities = Object.freeze({
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        });
    }
}

export function createBackupSyncProviderRegistry() {
    return new BackupSyncProviderRegistry()
        .register(new LocalFileArchiveProvider())
        .register(new LanSyncProviderAdapter())
        .register(new FutureCloudProvider('google-drive', 'Google Drive'))
        .register(new FutureCloudProvider('onedrive', 'Microsoft OneDrive'))
        .register(new FutureCloudProvider('github', 'GitHub'));
}
