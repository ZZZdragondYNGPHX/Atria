import { fixedHostTarget } from '../../../shared/native-frontend-host.js';
import { bridgeFailure, bridgeReceipt, bridgeValue, mapBridgeInput, publicBridgeError, bridgeDescriptorDigest, assertBridgeReceipt } from '../../../shared/native-frontend-bridge.js';

export function frontendHttpTransport({ sessionId, fetchImpl = globalThis.fetch, headers = {} }) {
    const post = async (path, body, signal) => {
        const response = await fetchImpl('/api/native/session/frontend/' + path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
        if (!response.ok) throw bridgeFailure('bridge_transport_failed');
        return response.json();
    };
    return { open: (previous, signal) => post('open', { sessionId, previous }, signal), request: (body, signal) => post('request', body, signal), close: epoch => post('close', { epoch }) };
}

// No raw services, DOM or target selectors escape these scoped handles. Every
// caller (declarative now; Script later) receives exactly this compiled API.
export async function createFrontendBridge({ descriptor, transport, onEpoch = () => {}, onRevision = () => {}, fixed = {}, hostServices = null }) {
    let epoch = null, revision = null, disposed = false, revoked = false, generation = 0, refreshPromise = null;
    const localReceipts = new Map();
    const aborts = new Set(), scopes = new Set(), descriptorDigest = await bridgeDescriptorDigest(descriptor);
    const failure = (code, bindingId = null) => bridgeReceipt({ bindingId, epoch, revision, status: 'failed', error: code });
    function invalidate() {
        if (disposed || revoked) return;
        revoked = true; generation++; localReceipts.clear(); aborts.forEach(controller => controller.abort()); aborts.clear();
        scopes.forEach(scope => scope.clear()); scopes.clear(); onEpoch();
    }
    async function exchange(method, body) {
        if (!transport) return failure('bridge_preview_readonly');
        const controller = new AbortController(); aborts.add(controller);
        try { return assertBridgeReceipt(await transport[method](body, controller.signal)); } catch (error) { throw bridgeFailure(typeof error?.code === 'string' && error.code.startsWith('bridge_') ? error.code : 'bridge_transport_failed'); } finally { aborts.delete(controller); }
    }
    async function open() {
        const captured = generation;
        const result = await exchange('open', epoch);
        if (disposed || captured !== generation) { if (result.epoch) void transport?.close?.(result.epoch)?.catch(() => {}); throw bridgeFailure('bridge_epoch_stale'); }
        if (!result.ok) { if (transport) throw bridgeFailure(result.error.code); revoked = false; return; }
        if (result.data?.descriptorDigest !== descriptorDigest || !result.epoch || !result.revision) { if (result.epoch) void transport?.close?.(result.epoch)?.catch(() => {}); throw bridgeFailure('bridge_schema_invalid'); }
        epoch = result.epoch; revision = result.revision; revoked = false;
    }
    await open();
    async function refresh() {
        if (disposed || revoked || !transport) return;
        if (refreshPromise) return refreshPromise;
        const captured = generation;
        refreshPromise = (async () => {
            let result;
            try { result = await exchange('request', { epoch, method: 'status' }); } catch (error) { if (disposed || captured !== generation) return; throw error; }
            if (disposed || captured !== generation) return;
            if (!result.ok || result.epoch !== epoch) { if (result.error?.code === 'bridge_epoch_stale' || result.epoch !== epoch) invalidate(); return; }
            if (revision !== result.revision) {
                revision = result.revision;
                await Promise.all([...scopes].map(scope => scope.refresh()));
                if (disposed || captured !== generation) return;
                await onRevision(revision);
            }
            if (!disposed && captured === generation) await Promise.all([...scopes].map(scope => scope.poll()));
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }
    function scope(componentId, uses) {
        if (disposed || revoked) throw bridgeFailure('bridge_epoch_stale');
        const allowed = new Set(uses), listeners = new Set(), queries = new Map(), operations = new Set();
        let dead = false;
        const token = generation;
        for (const id of allowed) if (!descriptor.bindings.some(binding => binding.id === id)) throw bridgeFailure('bridge_binding_denied');
        const current = () => !dead && !disposed && !revoked && token === generation;
        async function call(method, id, input = {}, options = {}) {
            if (!current()) return failure('bridge_epoch_stale', id);
            const binding = descriptor.bindings.find(item => item.id === id);
            const kind = method.split('.')[0];
            if (!allowed.has(id) || !binding || binding.kind !== kind) return failure('bridge_binding_denied', id);
            const capturedRevision = revision;
            try {
                if (!['operation.get', 'operation.cancel'].includes(method)) input = bridgeValue(input, binding.inputSchema);
                const queryVersion = JSON.stringify(Object.entries(input ?? {}).sort());
                if (kind === 'read') queries.set(id, queryVersion);
                const localTarget = binding.target?.service && fixedHostTarget(binding.target, binding.outputSchema?.properties?.data);
                let result;
                if (localTarget?.local && hostServices && (!hostServices.supports || hostServices.supports(binding.target))) {
                    if ((kind === 'read' && method !== 'read.snapshot') || (kind === 'action' && method !== 'action.invoke')) return failure('bridge_method_denied', id);
                    const status = await exchange('request', { epoch, method: 'host.authorize', componentId, bindingId: id, input, revision: capturedRevision });
                    if (!current() || status.epoch !== epoch || status.error?.code === 'bridge_epoch_stale') { invalidate(); return failure('bridge_epoch_stale', id); }
                    if (!status.ok) return status;
                    if (status.schemaDigest !== binding.schemaDigest || status.bindingId !== id) return failure('bridge_schema_invalid', id);
                    if (status.revision !== capturedRevision || (options.revision && options.revision !== capturedRevision)) return failure('bridge_revision_stale', id);
                    const idempotencyKey = options.idempotencyKey ?? globalThis.crypto.randomUUID();
                    if (kind === 'action' && (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(idempotencyKey))) return failure('bridge_idempotency_required', id);
                    const key = epoch + ':' + id + ':' + idempotencyKey;
                    const fingerprint = JSON.stringify({ input, revision: capturedRevision });
                    const previous = kind === 'action' ? localReceipts.get(key) : null;
                    if (previous && previous.fingerprint !== fingerprint) return failure('bridge_idempotency_conflict', id);
                    if (!previous && kind === 'action' && localReceipts.size >= 256) return failure('bridge_backpressure', id);
                    const pending = previous?.pending ?? hostServices.invoke(binding.target, mapBridgeInput(binding, input), capturedRevision);
                    if (kind === 'action' && !previous) localReceipts.set(key, { fingerprint, pending });
                    const data = await pending;
                    result = bridgeReceipt({ bindingId: id, epoch, revision: capturedRevision, schemaDigest: binding.schemaDigest, data: bridgeValue(data, binding.outputSchema) });
                } else result = await exchange('request', { epoch, componentId, bindingId: id, method, input,
                    revision: options.revision ?? revision, ...(options.cursor ? { cursor: options.cursor } : {}),
                    ...(options.operationId ? { operationId: options.operationId } : {}),
                    ...(['action.invoke', 'operation.start'].includes(method) ? { idempotencyKey: options.idempotencyKey ?? globalThis.crypto.randomUUID() } : {}) });
                if (!current()) return failure('bridge_epoch_stale', id);
                if (result.epoch && result.epoch !== epoch) { invalidate(); return failure('bridge_epoch_stale', id); }
                if (kind === 'read' && (revision !== capturedRevision || queryVersion !== queries.get(id))) return failure('bridge_query_stale', id);
                if (!result.ok) { if (result.error?.code === 'bridge_epoch_stale') invalidate(); return result; }
                if (result.bindingId !== id || result.schemaDigest !== binding.schemaDigest) return failure('bridge_schema_invalid', id);
                if (kind === 'read') {
                    if (result.revision !== capturedRevision) return failure('bridge_revision_stale', id);
                    result.data = bridgeValue(result.data, binding.collection ? { type: 'array', items: binding.outputSchema, maxItems: binding.collection.pageSize } : binding.outputSchema);
                } else if (method === 'action.invoke') {
                    result.data = bridgeValue(result.data, binding.outputSchema);
                    if (binding.target?.service && ['restore', 'switch', 'fork', 'retry', 'reload', 'recover'].includes(binding.target.method)) { invalidate(); return structuredClone(result); }
                    await refresh();
                } else if (method === 'operation.get' && result.status === 'completed') result.data = bridgeValue(result.data, binding.outputSchema);
                return current() ? structuredClone(result) : failure('bridge_epoch_stale', id);
            } catch (error) { return failure(current() ? publicBridgeError(error) : 'bridge_epoch_stale', id); }
        }
        const local = { clear: () => { queries.clear(); operations.clear(); listeners.clear(); }, poll: async () => { for (const update of operations) await update(); for (const listener of listeners) if (listener.ephemeral) await listener(); }, refresh: async () => { for (const listener of listeners) await listener(); } };
        scopes.add(local);
        return Object.freeze({
            snapshot: (id, input = {}) => call('read.snapshot', id, input),
            page: (id, input = {}, options = {}) => call('read.page', id, input, options),
            invoke: (id, input, options) => call('action.invoke', id, input, options),
            start: (id, input, options) => call('operation.start', id, input, options),
            operation: (id, operationId) => call('operation.get', id, {}, { operationId }),
            cancel: (id, operationId) => call('operation.cancel', id, {}, { operationId }),
            subscribe(id, input, listener) {
                if (listeners.size >= 64) throw bridgeFailure('bridge_budget_exceeded');
                const update = async () => { const binding = descriptor.bindings.find(binding => binding.id === id); const result = await call(binding?.collection ? 'read.page' : 'read.snapshot', id, input); if (current() && listeners.has(update)) listener(result); };
                const target = descriptor.bindings.find(binding => binding.id === id)?.target;
                update.ephemeral = Boolean(target?.service && (fixedHostTarget(target, descriptor.bindings.find(binding => binding.id === id)?.outputSchema?.properties?.data).local || target.method === 'saves'));
                listeners.add(update); void update(); return () => listeners.delete(update);
            },
            watchOperation(id, operationId, listener) {
                if (operations.size >= 64) throw bridgeFailure('bridge_budget_exceeded');
                const update = async () => {
                    const result = await call('operation.get', id, {}, { operationId });
                    if (current() && operations.has(update)) listener(result);
                    if (!result.ok || ['completed', 'failed', 'cancelled'].includes(result.status)) operations.delete(update);
                };
                operations.add(update); void update(); return () => operations.delete(update);
            },
            fixed: Object.freeze({ prefs: () => { if (!current()) throw bridgeFailure('bridge_epoch_stale'); return structuredClone(fixed.prefs?.() ?? {}); }, environment: () => { if (!current()) throw bridgeFailure('bridge_epoch_stale'); return structuredClone(fixed.environment?.() ?? {}); } }),
            dispose() { dead = true; listeners.clear(); queries.clear(); operations.clear(); scopes.delete(local); },
        });
    }
    return Object.freeze({ scope, refresh, get epoch() { return epoch; }, get revision() { return revision; },
        async reload() { revoked = true; generation++; localReceipts.clear(); aborts.forEach(controller => controller.abort()); scopes.forEach(scope => scope.clear()); scopes.clear(); await open(); },
        dispose() { disposed = true; generation++; localReceipts.clear(); aborts.forEach(controller => controller.abort()); scopes.clear(); if (epoch) void transport?.close?.(epoch)?.catch(() => {}); },
    });
}
