const PROVIDER_KINDS = Object.freeze({
    ARCHIVE: 'archive',
    SYNC: 'sync',
});

const BUILTIN_PROVIDERS = Object.freeze([
    Object.freeze({
        id: 'local-file',
        label: 'Local File',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: true,
        capabilities: Object.freeze({
            list: false,
            upload: false,
            download: true,
            delete: false,
            backgroundSync: false,
            bidirectionalSync: false,
            incrementalSync: false,
            conflictResolution: false,
        }),
    }),
    Object.freeze({
        id: 'lan-sync',
        label: 'LAN Sync',
        kind: PROVIDER_KINDS.SYNC,
        available: true,
        capabilities: Object.freeze({
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: false,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        }),
    }),
    Object.freeze({
        id: 'google-drive',
        label: 'Google Drive',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: Object.freeze({
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        }),
    }),
    Object.freeze({
        id: 'onedrive',
        label: 'Microsoft OneDrive',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: Object.freeze({
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        }),
    }),
    Object.freeze({
        id: 'github',
        label: 'GitHub',
        kind: PROVIDER_KINDS.ARCHIVE,
        available: false,
        future: true,
        capabilities: Object.freeze({
            list: true,
            upload: true,
            download: true,
            delete: true,
            backgroundSync: true,
            bidirectionalSync: true,
            incrementalSync: true,
            conflictResolution: true,
        }),
    }),
]);

function cloneDescriptor(provider) {
    return {
        ...provider,
        capabilities: { ...provider.capabilities },
    };
}

export class BackupSyncProviderRegistry {
    #providers = new Map();

    register(provider) {
        if (!provider || typeof provider !== 'object') {
            throw new TypeError('Provider descriptor must be an object.');
        }
        const id = String(provider.id || '').trim();
        const kind = String(provider.kind || '').trim();
        if (!id) throw new TypeError('Provider id is required.');
        if (!Object.values(PROVIDER_KINDS).includes(kind)) {
            throw new TypeError(`Unknown provider kind: ${kind}`);
        }
        if (this.#providers.has(id)) {
            throw new TypeError(`Provider already registered: ${id}`);
        }
        this.#providers.set(id, cloneDescriptor({ ...provider, id, kind }));
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
