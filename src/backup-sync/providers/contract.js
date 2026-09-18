export const BACKUP_SYNC_PROVIDER_KINDS = Object.freeze({
    ARCHIVE: 'archive',
    SYNC: 'sync',
});

export const BACKUP_SYNC_PROVIDER_STATES = Object.freeze({
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
});

function clone(value) {
    return value == null ? value : structuredClone(value);
}

export class BackupSyncProviderContract {
    constructor({
        id,
        label,
        kind,
        available = false,
        future = false,
        capabilities = {},
        configSchema = null,
        state = null,
    }) {
        this.id = String(id || '').trim();
        this.label = String(label || this.id).trim();
        this.kind = String(kind || '').trim();
        if (!this.id) throw new TypeError('Provider id is required.');
        if (!Object.values(BACKUP_SYNC_PROVIDER_KINDS).includes(this.kind)) {
            throw new TypeError(`Unknown provider kind: ${this.kind}`);
        }
        this.available = Boolean(available);
        this.future = Boolean(future);
        this.capabilities = Object.freeze({ ...capabilities });
        this.configSchema = configSchema ? Object.freeze(clone(configSchema)) : null;
        this.state = state || (this.available
            ? BACKUP_SYNC_PROVIDER_STATES.DISCONNECTED
            : BACKUP_SYNC_PROVIDER_STATES.UNAVAILABLE);
    }

    describe() {
        return {
            id: this.id,
            label: this.label,
            kind: this.kind,
            available: this.available,
            future: this.future,
            capabilities: { ...this.capabilities },
            configSchema: clone(this.configSchema),
            state: this.state,
        };
    }
}

export function assertProviderCapability(provider, capability) {
    if (!provider?.capabilities?.[capability]) {
        const id = provider?.id || 'unknown';
        throw new Error(`Provider ${id} does not support capability: ${capability}`);
    }
}
