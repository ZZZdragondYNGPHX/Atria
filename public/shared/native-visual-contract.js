import { contentSha256 } from './content-sha256.js';

// One non-secret contract shared by the Native host and browser. Provider wire
// compilation is deliberately outside this authority.
export const VISUAL_SCHEMA_VERSION = 2;
export const IMAGE_OPERATIONS = Object.freeze(['txt2img', 'regenerate', 'img2img', 'inpaint', 'outpaint', 'upscale']);
export const IMAGE_CAPABILITY_STATES = Object.freeze(['supported', 'unsupported', 'unknown']);
export function visualError(code) { throw Object.assign(new Error('native_visual_' + code), { code: 'native_visual_' + code }); }
export function visualObject(value, keys) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') visualError('invalid');
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!keys.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) visualError('invalid');
    }
    return value;
}
export function visualId(value, prefix) {
    if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[a-f0-9]{32}$').test(value)) visualError('identity_invalid');
    return value;
}
export function visualHash(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) visualError('hash_invalid');
    return value;
}
export function visualText(value, max = 65536) {
    if (typeof value !== 'string' || value.length > max) visualError('invalid');
    return value;
}
export function visualInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) visualError('invalid');
    return value;
}
export function nonSecretVisualJson(value, maxBytes = 512 * 1024) {
    let nodes = 0;
    const seen = new Set();
    const visit = (item, depth) => {
        if (++nodes > 16000 || depth > 24 || seen.has(item)) visualError('evidence_invalid');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'string') return visualText(item, maxBytes);
        seen.add(item);
        let out;
        if (Array.isArray(item)) out = item.map(child => visit(child, depth + 1));
        else {
            visualObject(item, Object.keys(item ?? {})); out = {};
            for (const [key, child] of Object.entries(item)) {
                if (/^(?:__proto__|prototype|constructor)$|(?:secret|password|authorization|credentials|api.?key|access.?token|refresh.?token|bearer)/i.test(key)) visualError('secret_forbidden');
                out[key] = visit(child, depth + 1);
            }
        }
        seen.delete(item); return out;
    };
    const out = visit(value, 0);
    if (new TextEncoder().encode(JSON.stringify(out)).length > maxBytes) visualError('evidence_limit');
    return out;
}
export function visualFingerprint(value) {
    const stable = item => item === null || typeof item !== 'object' ? JSON.stringify(item)
        : Array.isArray(item) ? '[' + item.map(stable).join(',') + ']'
            : '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + stable(item[key])).join(',') + '}';
    return contentSha256(stable(nonSecretVisualJson(value)));
}
export function assertVisualSourceRef(value) {
    if (value?.kind === 'authoring') {
        visualObject(value, ['kind', 'authoringId', 'title']);
        visualId(value.authoringId, 'vintent'); visualText(value.title, 256);
        return structuredClone(value);
    }
    visualObject(value, ['kind', 'sessionId', 'branchId', 'revisionId', 'annotationId', 'sceneId', 'shotId', 'anchor', 'timeKind']);
    if (value.kind !== 'session' || !['present', 'flashback', 'dream'].includes(value.timeKind)) visualError('source_invalid');
    visualId(value.sessionId, 'ses'); visualId(value.branchId, 'br'); visualId(value.revisionId, 'rev');
    if (value.annotationId !== undefined) visualId(value.annotationId, 'ann');
    if (value.sceneId !== undefined) visualId(value.sceneId, 'scene');
    if (value.shotId !== undefined) visualId(value.shotId, 'shot');
    if (!value.annotationId && !(value.sceneId && value.shotId)) visualError('source_invalid');
    const a = value.anchor;
    visualObject(a, ['messageId', 'variantId', 'revisionId', 'contentHash', 'start', 'end', 'quote']);
    visualId(a.messageId, 'msg'); visualId(a.variantId, 'var'); visualHash(a.contentHash);
    if (a.revisionId !== value.revisionId) visualError('source_invalid');
    visualInteger(a.start); visualInteger(a.end, a.start + 1); visualText(a.quote);
    if (a.quote.length !== a.end - a.start || !a.quote.trim()) visualError('source_invalid');
    return structuredClone(value);
}
export function assertImagePromptIR(value) {
    visualObject(value, ['schemaVersion', 'source', 'operation', 'authoring', 'prompt', 'negativePrompt', 'scene', 'participants', 'style', 'references', 'constraints']);
    if (value.schemaVersion !== VISUAL_SCHEMA_VERSION || !IMAGE_OPERATIONS.includes(value.operation) || !['raw', 'structured'].includes(value.authoring)) visualError('ir_invalid');
    assertVisualSourceRef(value.source); visualText(value.prompt); visualText(value.negativePrompt); visualText(value.scene); visualText(value.style);
    if (!value.prompt.trim() || !Array.isArray(value.participants) || value.participants.length > 64 || !Array.isArray(value.references) || value.references.length > 32
        || !Array.isArray(value.constraints) || value.constraints.length > 64) visualError('ir_invalid');
    for (const p of value.participants) {
        visualObject(p, ['actorId', 'participantId', 'provisionalId', 'identity', 'state', 'evidence']);
        if ([p.actorId, p.participantId, p.provisionalId].filter(Boolean).length !== 1) visualError('identity_invalid');
        if (p.actorId) visualId(p.actorId, 'actor');
        else if (p.participantId) { if (!/^participant\.[a-f0-9]{32}$/.test(p.participantId)) visualError('identity_invalid'); } else if (!visualText(p.provisionalId, 128).startsWith(value.source.sessionId + ':')) visualError('identity_invalid');
        visualText(p.identity); visualText(p.state); nonSecretVisualJson(p.evidence);
    }
    for (const ref of value.references) {
        visualObject(ref, ['assetId', 'contentHash', 'purpose', 'source', 'externalConnectionIds']);
        visualId(ref.assetId, 'asset'); visualHash(ref.contentHash); assertVisualSourceRef(ref.source);
        if (!['identity', 'outfit', 'style', 'structure', 'vibe', 'base', 'mask'].includes(ref.purpose) || !Array.isArray(ref.externalConnectionIds)) visualError('reference_invalid');
        ref.externalConnectionIds.forEach(id => visualId(id, 'conn'));
    }
    const names = new Set();
    for (const c of value.constraints) {
        visualObject(c, ['capability', 'tier']); visualText(c.capability, 128);
        if (!c.capability || names.has(c.capability) || !['required', 'preferred', 'optional'].includes(c.tier)) visualError('constraint_invalid');
        names.add(c.capability);
    }
    return nonSecretVisualJson(value);
}
export function assertCapabilityManifest(value) {
    visualObject(value, ['schemaVersion', 'targetFingerprint', 'checkedAt', 'expiresAt', 'level', 'features', 'combinations', 'cost']);
    if (value.schemaVersion !== VISUAL_SCHEMA_VERSION || !['L1', 'L2', 'L3'].includes(value.level)) visualError('capability_invalid');
    visualHash(value.targetFingerprint); visualInteger(value.checkedAt); visualInteger(value.expiresAt, value.checkedAt);
    visualObject(value.features, Object.keys(value.features ?? {}));
    for (const feature of Object.values(value.features)) {
        visualObject(feature, ['state', 'evidence']);
        if (!IMAGE_CAPABILITY_STATES.includes(feature.state)) visualError('capability_invalid'); visualText(feature.evidence, 2048);
    }
    if (!Array.isArray(value.combinations) || value.combinations.length > 64) visualError('capability_invalid');
    for (const c of value.combinations) {
        visualObject(c, ['features', 'state', 'evidence']);
        if (!Array.isArray(c.features) || c.features.length < 2 || !IMAGE_CAPABILITY_STATES.includes(c.state)) visualError('capability_invalid');
        c.features.forEach(f => visualText(f, 128)); visualText(c.evidence, 2048);
    }
    visualObject(value.cost, ['kind', 'currency', 'upperBound']);
    if (!['free', 'estimated', 'unknown'].includes(value.cost.kind) || (value.cost.upperBound !== null && (!Number.isFinite(value.cost.upperBound) || value.cost.upperBound < 0))) visualError('cost_invalid');
    visualText(value.cost.currency, 8);
    return nonSecretVisualJson(value);
}
export function negotiateImageConstraints(irValue, manifestValue, { omittedPreferred = [], now = Date.now() } = {}) {
    const ir = assertImagePromptIR(irValue), manifest = assertCapabilityManifest(manifestValue);
    if (manifest.expiresAt < now) visualError('capability_expired');
    const constraints = [{ capability: ir.operation === 'regenerate' ? 'txt2img' : ir.operation, tier: 'required' }, ...ir.constraints];
    const effective = [], omitted = [];
    const omit = (c, state) => {
        if (c.tier === 'required' || (c.tier === 'preferred' && !omittedPreferred.includes(c.capability))) visualError('capability_' + state);
        omitted.push({ ...c, reason: state });
    };
    for (const c of constraints) {
        const state = manifest.features[c.capability]?.state ?? 'unknown';
        if (state === 'supported') effective.push(c); else omit(c, state);
    }
    for (const combination of manifest.combinations) {
        if (!combination.features.every(f => effective.some(c => c.capability === f)) || combination.state === 'supported') continue;
        const disposable = effective.find(c => combination.features.includes(c.capability) && (c.tier === 'optional' || c.tier === 'preferred' && omittedPreferred.includes(c.capability)));
        if (!disposable) visualError('combination_' + combination.state);
        effective.splice(effective.indexOf(disposable), 1); omit(disposable, 'combination_' + combination.state);
    }
    return { original: constraints, effective, omitted };
}
export function assertCompilationEvidence(value) {
    visualObject(value, ['schemaVersion', 'requestId', 'source', 'connection', 'target', 'ir', 'capabilities', 'constraints', 'request', 'requestHash', 'irHash', 'transforms']);
    if (value.schemaVersion !== VISUAL_SCHEMA_VERSION) visualError('schema_cutover_required');
    visualId(value.requestId, 'imgv'); assertVisualSourceRef(value.source);
    visualObject(value.connection, ['connectionProfileId', 'displayName', 'providerAdapter', 'fingerprint']);
    visualId(value.connection.connectionProfileId, 'conn'); visualHash(value.connection.fingerprint); visualText(value.connection.displayName, 256); visualText(value.connection.providerAdapter, 128);
    nonSecretVisualJson(value.target); assertImagePromptIR(value.ir); assertCapabilityManifest(value.capabilities); nonSecretVisualJson(value.constraints); nonSecretVisualJson(value.transforms);
    if (visualFingerprint(value.ir.source) !== visualFingerprint(value.source) || visualFingerprint(value.request) !== value.requestHash || visualFingerprint(value.ir) !== value.irHash) visualError('evidence_mismatch');
    return nonSecretVisualJson(value);
}
