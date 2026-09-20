import { redactText, redactValue } from './redact.js';

export const PROVENANCE_TYPES = Object.freeze([
    'extension',
    'server-plugin',
    'external-service',
]);

function sanitizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return redactText(parsed.toString()).slice(0, 1000);
    } catch {
        return redactText(raw).slice(0, 1000);
    }
}

export function normalizeProvenanceRecord(input = {}) {
    const rawType = String(input.type || '').trim();
    const type = PROVENANCE_TYPES.includes(rawType) ? rawType : 'extension';
    const name = redactText(String(input.name || input.directory || 'unknown')).slice(0, 200);
    return {
        type,
        name,
        displayName: redactText(String(input.displayName || input.packageName || name)).slice(0, 240),
        version: redactText(String(input.version || '')).slice(0, 120),
        commit: redactText(String(input.commit || input.currentCommitHash || '')).slice(0, 200),
        origin: sanitizeOrigin(input.origin || input.remoteUrl),
        loadingOrder: Number.isFinite(Number(input.loadingOrder ?? input.loading_order))
            ? Number(input.loadingOrder ?? input.loading_order)
            : null,
        enabled: typeof input.enabled === 'boolean' ? input.enabled : null,
        dependencies: Array.isArray(input.dependencies)
            ? input.dependencies.slice(0, 100).map(value => redactText(String(value)).slice(0, 200))
            : [],
        operationId: redactText(String(input.operationId || input.operation_id || '')).slice(0, 200),
        metadata: redactValue(input.metadata ?? {}, { maxDepth: 4, maxArrayLength: 30, maxObjectKeys: 40, maxStringLength: 1000 }),
        updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : Date.now(),
    };
}

export class RuntimeProvenanceRegistry {
    #records = new Map();

    register(input = {}) {
        const record = normalizeProvenanceRecord(input);
        this.#records.set(`${record.type}:${record.name}`, record);
        return structuredClone(record);
    }

    registerMany(records = []) {
        return records.map(record => this.register(record));
    }

    list({ type = null } = {}) {
        return [...this.#records.values()]
            .filter(record => type === null || record.type === type)
            .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
            .map(record => structuredClone(record));
    }

    get(type, name) {
        const record = this.#records.get(`${type}:${name}`);
        return record ? structuredClone(record) : null;
    }

    clear() {
        this.#records.clear();
    }
}

export const runtimeProvenanceRegistry = new RuntimeProvenanceRegistry();
