import {
    BACKUP_SYNC_PROVIDER_KINDS as PROVIDER_KINDS,
    BackupSyncProviderContract,
} from './contract.js';

const BUILTIN_PROVIDERS = Object.freeze([
    new BackupSyncProviderContract({
        id: 'local-file',
        label: 'Local File',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: true,
        capabilities: {
            list: false,
            upload: false,
            download: true,
            openArtifact: true,
            exportArtifact: true,
            delete: false,
            backgroundSync: false,
            bidirectionalSync: false,
            incrementalSync: false,
            conflictResolution: false,
        },
    }),
    new BackupSyncProviderContract({
        id: 'lan-sync',
        label: 'LAN Sync',
        kind: PROVIDER_KINDS.SYNC,
        available: true,
        capabilities: {
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: false,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
            undo: true,
        },
    }),
    new BackupSyncProviderContract({
        id: 'google-drive',
        label: 'Google Drive',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: {
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        },
        configSchema: {
            version: 1,
            fields: [
                { key: 'folderId', type: 'string', required: false },
            ],
            auth: { type: 'oauth2', implemented: false },
        },
    }),
    new BackupSyncProviderContract({
        id: 'onedrive',
        label: 'Microsoft OneDrive',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: {
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        },
        configSchema: {
            version: 1,
            fields: [
                { key: 'folderId', type: 'string', required: false },
            ],
            auth: { type: 'oauth2', implemented: false },
        },
    }),
    new BackupSyncProviderContract({
        id: 'github',
        label: 'GitHub',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: {
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        },
        configSchema: {
            version: 1,
            fields: [
                { key: 'repository', type: 'string', required: true },
                { key: 'branch', type: 'string', required: false, default: 'main' },
                { key: 'path', type: 'string', required: false, default: 'atria-backups' },
            ],
            auth: { type: 'github', implemented: false },
        },
    }),
]);

function cloneDescriptor(provider) {
    return typeof provider?.describe === 'function'
        ? provider.describe()
        : structuredClone(provider);
}

export class BackupSyncProviderRegistry {
    #providers = new Map();

    register(provider) {
        if (!provider || typeof provider !== 'object') {
            throw new TypeError('Provider descriptor must be an object.');
        }
        const normalized = provider instanceof BackupSyncProviderContract
            ? provider
            : new BackupSyncProviderContract(provider);
        if (this.#providers.has(normalized.id)) {
            throw new TypeError(`Provider already registered: ${normalized.id}`);
        }
        this.#providers.set(normalized.id, normalized);
        return this;
    }

    get(id) {
        const provider = this.#providers.get(String(id || ''));
        return provider ? cloneDescriptor(provider) : null;
    }

    list({ kind } = {}) {
        return [...this.#providers.values()]
            .filter(provider => !kind || provider.kind === kind)
            .map(cloneDescriptor);
    }
}

export function createBuiltinBackupSyncProviderRegistry() {
    const registry = new BackupSyncProviderRegistry();
    for (const provider of BUILTIN_PROVIDERS) {
        registry.register(provider);
    }
    return registry;
}

export function listBuiltinBackupSyncProviders() {
    return createBuiltinBackupSyncProviderRegistry().list();
}

export { PROVIDER_KINDS };
