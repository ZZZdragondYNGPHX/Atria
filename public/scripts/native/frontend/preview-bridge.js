import { bridgeReceipt, bridgeValue, bridgeFailure, publicBridgeError, projectBridgeCollection, bridgeDescriptorDigest } from '../../../shared/native-frontend-bridge.js';
import { fixedHostTarget } from '../../../shared/native-frontend-host.js';

// Immutable, owner-checked Preview projections. No fake authority writer and no
// legacy fallback. The same compiled schemas, queries and receipt contract apply.
export function previewBridgeTransport({ descriptor, projections = {}, scopes }) {
    let epoch, closed = false; const cursors = new Map();
    return {
        async open() { epoch = globalThis.crypto.randomUUID(); closed = false; cursors.clear(); return bridgeReceipt({ epoch, revision: 'preview', data: { descriptorDigest: await bridgeDescriptorDigest(descriptor) } }); },
        async close() { closed = true; cursors.clear(); },
        async request(request) {
            const binding = descriptor.bindings.find(item => item.id === request.bindingId);
            const receipt = values => bridgeReceipt({ epoch, revision: 'preview', bindingId: binding?.id ?? null, schemaDigest: binding?.schemaDigest ?? null, ...values });
            try {
                if (closed || request.epoch !== epoch) throw bridgeFailure('bridge_epoch_stale');
                if (request.method === 'status') return receipt({});
                if (!binding || !scopes[request.componentId]?.includes(binding.id)) throw bridgeFailure('bridge_binding_denied');
                if (request.method === 'host.authorize' && ['host.media', 'host.presentation'].includes(binding.target.service)) {
                    if (!fixedHostTarget(binding.target).local) throw bridgeFailure('bridge_method_denied');
                    if (request.revision !== 'preview') throw bridgeFailure('bridge_revision_stale');
                    bridgeValue(request.input, binding.inputSchema); return receipt({});
                }
                if (binding.kind !== 'read') throw bridgeFailure('bridge_preview_readonly');
                if (request.revision !== 'preview') throw bridgeFailure('bridge_revision_stale');
                const input = bridgeValue(request.input, binding.inputSchema);
                if (!Object.hasOwn(projections, binding.id)) throw bridgeFailure('bridge_projection_unavailable');
                if (!binding.collection) {
                    if (request.method !== 'read.snapshot' || request.cursor) throw bridgeFailure('bridge_method_denied');
                    return receipt({ data: bridgeValue(projections[binding.id], binding.outputSchema) });
                }
                if (request.method !== 'read.page') throw bridgeFailure('bridge_method_denied');
                const query = JSON.stringify([binding.id, Object.entries(input).sort()]);
                const prior = request.cursor ? cursors.get(request.cursor) : { query, offset: 0 };
                if (!prior || prior.query !== query) throw bridgeFailure('bridge_cursor_stale');
                const rows = projectBridgeCollection(binding, projections[binding.id], input), end = prior.offset + binding.collection.pageSize;
                let cursor = null;
                if (end < rows.length) {
                    if (cursors.size >= 512) throw bridgeFailure('bridge_backpressure');
                    cursor = globalThis.crypto.randomUUID(); cursors.set(cursor, { query, offset: end });
                }
                return receipt({ data: rows.slice(prior.offset, end), cursor });
            } catch (error) { return receipt({ status: 'failed', error: publicBridgeError(error) }); }
        },
    };
}
