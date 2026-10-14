import { randomInt } from 'node:crypto';
import { assertImageTarget, assertImageRendering } from './visual-contracts.js';
import { renderNovelaiIllustration, novelaiConnectionCapabilities } from '../../public/shared/novelai-illustration.js';
import { createNovelaiImageProvider } from './adapters/novelai-image-provider.js';
import { visualFingerprint, assertCapabilityManifest, negotiateImageConstraints, visualError } from '../../public/shared/native-visual-contract.js';

export function imageTargetFingerprint(target, connection) {
    return visualFingerprint({ ...target, capabilities: null, connection: { id: connection.connectionProfileId,
        adapter: connection.providerAdapter, endpoint: connection.endpoint, options: connection.options, networkPolicy: connection.networkPolicy } });
}
export class ImageAdapterRegistry {
    constructor() { this.adapters = new Map(); }
    register(names, adapter) {
        if (!adapter || !['compile', 'generate', 'describe'].every(key => typeof adapter[key] === 'function')) visualError('adapter_invalid');
        for (const name of names) { if (this.adapters.has(name)) visualError('adapter_conflict'); this.adapters.set(name, adapter); }
        return this;
    }
    get(name) { const adapter = this.adapters.get(name); if (!adapter) visualError('adapter_unsupported'); return adapter; }
    async prepare({ ir, target: input, rendering, connection, approval = null }) {
        const target = assertImageTarget(input);
        if (rendering) assertImageRendering(rendering);
        if (connection.connectionProfileId !== target.connectionProfileId) visualError('target_conflict');
        const adapter = this.get(connection.providerAdapter), fingerprint = imageTargetFingerprint(target, connection);
        const manifest = assertCapabilityManifest(target.capabilities ?? await adapter.describe({ target, connection, fingerprint }));
        if (manifest.targetFingerprint !== fingerprint) visualError('capability_stale');
        const constraints = negotiateImageConstraints(ir, manifest, { omittedPreferred: approval?.omittedPreferred ?? [] });
        const effectiveIr = { ...ir, constraints: ir.constraints.filter(c => !constraints.omitted.some(o => o.capability === c.capability)) };
        const compiled = await adapter.compile({ ir: effectiveIr, target, rendering, connection, seed: randomInt(4294967296) });
        return { adapter, target, manifest, constraints, compiled, fingerprint };
    }
}
export function resolveImageSelection({ task = {}, annotation = {}, work = {}, global = {} }) {
    const levels = [['task', task], ['annotation', annotation], ['work', work], ['global', global]], result = {};
    for (const field of ['imageTargetId', 'imageRenderingId']) {
        const match = levels.find(([, value]) => value[field]);
        result[field] = match?.[1][field] ?? null; result[field + 'Origin'] = match?.[0] ?? null;
    }
    return result;
}
export function protocolManifest(fingerprint, features, { combinations = [], cost = { kind: 'unknown', currency: '', upperBound: null }, level = 'L1' } = {}) {
    return { schemaVersion: 2, targetFingerprint: fingerprint, checkedAt: Date.now(), expiresAt: Date.now() + 3600000,
        level, features: Object.fromEntries(Object.entries(features).map(([name, state]) => [name, { state, evidence: 'adapter protocol declaration; live Target not verified' }])), combinations, cost };
}
export function createImageRegistry({ fetchImpl = fetch } = {}) {
    const registry = new ImageAdapterRegistry(), provider = createNovelaiImageProvider({ fetchImpl });
    registry.register(['provider.novelai-image', 'provider.novelai-image-compatible'], {
        describe: ({ connection, target, fingerprint }) => {
            const capabilities = novelaiConnectionCapabilities(connection);
            if (!capabilities.models.some(m => m.id === target.model)) visualError('model_unsupported');
            return protocolManifest(fingerprint, { txt2img: 'supported', img2img: 'unknown', inpaint: 'unknown', upscale: 'unsupported', identity: 'unknown', vibe: 'unknown' });
        },
        compile: ({ ir, target, connection, seed }) => {
            if (!['txt2img', 'regenerate'].includes(ir.operation)) visualError('operation_unsupported');
            const draft = { characters: [], scene: ir.scene, prompt: ir.prompt, preset: { style: ir.style, quality: '', negativePrompt: ir.negativePrompt,
                parameters: { ...target.nativeParameters, model: target.model } } };
            return { endpoint: connection.endpoint, ...renderNovelaiIllustration(draft, novelaiConnectionCapabilities(connection), seed) };
        },
        generate: (request, options) => provider.generate(request, options),
    });
    return registry;
}
