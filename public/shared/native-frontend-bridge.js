import { fields } from './native-frontend-contract.js';
// Data-only protocol shared by all frontend transports (including future Script).
import { validateSchemaValue } from '../scripts/native/experience/world/schema.js';
export const bridgeFailure = code => Object.assign(new Error(code), { code });
export function bridgeValue(value, schema) {
    if (!validateSchemaValue(value, schema).ok) throw bridgeFailure('bridge_schema_invalid');
    const json = JSON.stringify(value);
    if (json.length > 2 * 1024 * 1024) throw bridgeFailure('bridge_budget_exceeded');
    return JSON.parse(json);
}
export function mapBridgeInput(binding, input) {
    const value = bridgeValue(input, binding.inputSchema);
    if (binding.mapping === 'identity') return value;
    return Object.fromEntries(Object.entries(binding.mapping.fields).map(([key, source]) => [key,
        Object.hasOwn(source, 'constant') ? structuredClone(source.constant) : source.input.split('.').reduce((v, k) => v?.[k], value)]).filter(([, item]) => item !== undefined));
}
export function bridgeReceipt({ bindingId = null, epoch = null, revision = null, schemaDigest = null, data = null, cursor = null, status = 'completed', operationId = null, error = null } = {}) {
    return { version: 1, ok: error === null, bindingId, epoch, revision, schemaDigest, status, data, cursor, operationId,
        error: error === null ? null : { code: error, retryable: ['bridge_revision_stale', 'bridge_transport_failed', 'bridge_backpressure'].includes(error) } };
}
export function publicBridgeError(error) {
    if (error.code?.startsWith('bridge_')) return error.code;
    if (/conflict|stale/.test(error.code ?? '')) return 'bridge_revision_stale';
    if (/cancel/.test(error.code ?? '')) return 'bridge_cancelled';
    return error instanceof TypeError ? 'bridge_target_invalid' : 'bridge_target_failed';
}

export function projectBridgeCollection(binding, values, input) {
    if (!Array.isArray(values) || values.length > 10000) throw bridgeFailure('bridge_schema_invalid');
    const { orderBy, search = [] } = binding.collection, keys = new Set();
    return values.map(item => bridgeValue(item, binding.outputSchema)).filter(item => {
        const key = JSON.stringify(item[orderBy]);
        if (item[orderBy] === undefined || keys.has(key)) throw bridgeFailure('bridge_order_invalid'); keys.add(key);
        return Object.entries(input).every(([field, value]) => field === 'search'
            ? search.some(key => item[key]?.toLowerCase().includes(value.toLowerCase())) : item[field] === value);
    }).sort((a, b) => a[orderBy] < b[orderBy] ? -1 : a[orderBy] > b[orderBy] ? 1 : 0);
}

export const canonicalBridgeJson = value => {
    if (Array.isArray(value)) return '[' + value.map(canonicalBridgeJson).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalBridgeJson(value[key])).join(',') + '}';
    return JSON.stringify(value);
};
export async function bridgeDescriptorDigest(descriptor) {
    const bytes = new TextEncoder().encode(canonicalBridgeJson(descriptor));
    return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function assertBridgeReceipt(value) {
    try {
        const keys = ['version', 'ok', 'bindingId', 'epoch', 'revision', 'schemaDigest', 'status', 'data', 'cursor', 'operationId', 'error'];
        fields(value, keys);
        if (keys.some(key => !Object.hasOwn(value, key)) || value.version !== 1 || typeof value.ok !== 'boolean'
            || !['queued', 'running', 'progress', 'partial', 'completed', 'failed', 'cancelled'].includes(value.status)) throw new TypeError();
        for (const key of ['bindingId', 'epoch', 'revision', 'schemaDigest', 'cursor', 'operationId']) if (value[key] !== null && (typeof value[key] !== 'string' || value[key].length > 256)) throw new TypeError();
        if (value.ok) { if (value.error !== null || value.status === 'failed') throw new TypeError(); } else { fields(value.error, ['code', 'retryable']); if (!/^bridge_[a-z_]{1,80}$/.test(value.error.code) || typeof value.error.retryable !== 'boolean') throw new TypeError(); }
        const json = JSON.stringify(value);
        if (json.length > 2 * 1024 * 1024 + 4096) throw new TypeError();
        return JSON.parse(json);
    } catch { throw bridgeFailure('bridge_receipt_invalid'); }
}
