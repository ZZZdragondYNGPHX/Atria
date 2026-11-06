import { bridgeDescriptorDigest, bridgeReceipt, bridgeValue } from '../../shared/native-frontend-bridge.js';

// Host-owned authority for a mounted preset card. This transport cannot invoke
// Session/World operations; the existing bridge still validates typed actions.
export async function createPresetPresentationBridge(bundle, isCurrent) {
    const decode = path => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(bundle.files[path]), char => char.charCodeAt(0))));
    const index = decode(bundle.entry), descriptor = decode(index.resources.find(ref => ref.kind === 'bridge').path);
    const components = new Map(index.resources.filter(ref => ref.kind === 'component').map(ref => {
        const component = decode(ref.path); return [component.id, new Set(component.uses)];
    }));
    if (descriptor.bindings.some(binding => binding.kind !== 'action' || binding.target.service !== 'host.composer' || !['set', 'focus'].includes(binding.target.method))) throw new TypeError('Preset bridge exceeds composer scope');
    const descriptorDigest = await bridgeDescriptorDigest(descriptor), epoch = 'preset-' + crypto.randomUUID();
    let closed = false;
    const receipt = input => bridgeReceipt({ epoch, revision: epoch, ...input });
    const denied = code => receipt({ status: 'failed', error: code });
    return {
        async open() { return closed || !isCurrent() ? denied('bridge_epoch_stale') : receipt({ data: { descriptorDigest } }); },
        async request(request) {
            if (closed || !isCurrent() || request.epoch !== epoch) return denied('bridge_epoch_stale');
            if (request.method === 'status') return receipt();
            if (request.method !== 'host.authorize') return denied('bridge_method_denied');
            const binding = descriptor.bindings.find(item => item.id === request.bindingId);
            if (!binding || !components.get(request.componentId)?.has(binding.id)) return denied('bridge_binding_denied');
            try { bridgeValue(request.input, binding.inputSchema); } catch { return denied('bridge_schema_invalid'); }
            return receipt({ bindingId: binding.id, schemaDigest: binding.schemaDigest });
        }, async close() { closed = true; },
    };
}
