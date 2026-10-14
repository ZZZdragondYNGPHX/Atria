import { createNovelaiVisualAdapter } from './adapters/novelai-visual-adapter.js';
import { createComfyImageAdapter } from './adapters/comfyui-image-adapter.js';
import { createOpenaiImageAdapter } from './adapters/openai-image-adapter.js';
import { createGeminiImageAdapter } from './adapters/gemini-image-adapter.js';
import { createWebuiImageAdapter } from './adapters/webui-image-adapter.js';
import { createRunninghubImageAdapter } from './adapters/runninghub-image-adapter.js';
import { randomInt } from 'node:crypto';
import { credentialFetch } from './model-prompt-runtime/credential-fetch.js';
import { assertImageTarget, assertImageRendering } from './visual-contracts.js';
import { visualFingerprint, assertCapabilityManifest, negotiateImageConstraints, visualError } from '../../public/shared/native-visual-contract.js';

export function imageSemanticPrompt(ir) {
    return ir.authoring === 'raw' ? ir.prompt : [ir.style, ir.scene, ...ir.participants.map(p => [p.identity, p.state].filter(Boolean).join(', '))].filter(Boolean).join(', ');
}
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
    async prepare({ ir, target: input, rendering, connection, approval = null, secret = null }) {
        const target = assertImageTarget(input);
        if (rendering) assertImageRendering(rendering);
        if (connection.connectionProfileId !== target.connectionProfileId) visualError('target_conflict');
        if (connection.transport !== 'transport.http' || Object.keys(connection.networkPolicy ?? {}).length) visualError('network_policy_unsupported');
        const adapter = this.get(connection.providerAdapter), fingerprint = imageTargetFingerprint(target, connection);
        const manifest = assertCapabilityManifest(await adapter.describe({ target, connection, fingerprint, secret }));
        if (manifest.targetFingerprint !== fingerprint) visualError('capability_stale');
        const constraints = negotiateImageConstraints(ir, manifest, { omittedPreferred: approval?.omittedPreferred ?? [] });
        const effectiveIr = { ...ir, references: ir.references.filter(ref => !constraints.omitted.some(c => c.capability === ref.purpose)), constraints: ir.constraints.filter(c => !constraints.omitted.some(o => o.capability === c.capability)) };
        const compiled = await adapter.compile({ ir: effectiveIr, target, rendering, connection, seed: randomInt(4294967296) });
        compiled.inputAssetRefs = effectiveIr.references.map(ref => ({ assetId: ref.assetId, contentHash: ref.contentHash, purpose: ref.purpose }));
        return { adapter, target, manifest, constraints, compiled, fingerprint, effectiveReferences: effectiveIr.references };
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
export function createImageRegistry({ fetchImpl = credentialFetch } = {}) {
    const registry = new ImageAdapterRegistry();
    registry.register(['provider.novelai-image', 'provider.novelai-image-compatible'], createNovelaiVisualAdapter({ fetchImpl }));
    registry.register(['provider.comfyui-image'], createComfyImageAdapter({ fetchImpl }));
    registry.register(['provider.openai-images'], createOpenaiImageAdapter({ fetchImpl }));
    registry.register(['provider.gemini-image'], createGeminiImageAdapter({ fetchImpl }));
    registry.register(['provider.sd-webui-image', 'provider.forge-image'], createWebuiImageAdapter({ fetchImpl }));
    registry.register(['provider.runninghub-image'], createRunninghubImageAdapter({ fetchImpl }));
    return registry;
}
