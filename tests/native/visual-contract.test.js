import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { assertVisualSourceRef, assertImagePromptIR, visualFingerprint, nonSecretVisualJson, negotiateImageConstraints, assertCompilationEvidence } from '../../public/shared/native-visual-contract.js';

export function visualFixture() {
    const revisionId = createNativeId('revision');
    const source = { kind: 'session', sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId,
        annotationId: createNativeId('annotation'), timeKind: 'present', anchor: { messageId: createNativeId('message'), variantId: createNativeId('variant'), revisionId,
            contentHash: 'a'.repeat(64), start: 0, end: 4, quote: 'text' } };
    const ir = { schemaVersion: 2, source, operation: 'txt2img', authoring: 'raw', prompt: 'authored', negativePrompt: '', scene: '', style: '', participants: [], references: [], constraints: [] };
    const manifest = { schemaVersion: 2, targetFingerprint: 'b'.repeat(64), checkedAt: 1, expiresAt: Date.now() + 100000,
        level: 'L2', features: { txt2img: { state: 'supported', evidence: 'fixture' } }, combinations: [], cost: { kind: 'unknown', currency: '', upperBound: null } };
    return { source, ir, manifest };
}
test('Native identities and canonical hashes agree across host/browser, with no non-JSON/Secret evidence', () => {
    for (const kind of ['imageTarget', 'imageRendering', 'imageJob', 'imageAttempt', 'visualIntent', 'scene', 'shot', 'mediaOperation', 'maskArtifact', 'maskDraft', 'visualReference']) expect(createNativeId(kind)).toMatch(/_[a-f0-9]{32}$/);
    const { source, ir } = visualFixture();
    expect(assertImagePromptIR(ir)).toEqual(ir);
    expect(visualFingerprint(ir)).toBe(hashNativeDocument(ir));
    expect(() => assertVisualSourceRef({ ...source, revisionId: createNativeId('revision') })).toThrow('source_invalid');
    for (const value of [{ secretRef: {} }, { nested: { authorization: 'private' } }, { api_key: 'private' }, { x: new Date() }]) expect(() => nonSecretVisualJson(value)).toThrow();
    const cyclic = {}; cyclic.self = cyclic; expect(() => nonSecretVisualJson(cyclic)).toThrow();
    expect(() => nonSecretVisualJson(Object.defineProperty({}, 'x', { get() { throw Error('getter executed'); }, enumerable: true }))).toThrow('invalid');
});
test('required and unknown fail closed; preferred omissions and unsupported combinations require precise consent', () => {
    const { ir, manifest } = visualFixture();
    ir.constraints = [{ capability: 'mask', tier: 'required' }];
    expect(() => negotiateImageConstraints(ir, manifest)).toThrow('capability_unknown');
    ir.constraints[0].tier = 'preferred'; expect(() => negotiateImageConstraints(ir, manifest)).toThrow('capability_unknown');
    expect(negotiateImageConstraints(ir, manifest, { omittedPreferred: ['mask'] }).omitted).toEqual([{ capability: 'mask', tier: 'preferred', reason: 'unknown' }]);
    manifest.features.mask = { state: 'supported', evidence: 'fixture' };
    manifest.combinations = [{ features: ['txt2img', 'mask'], state: 'unsupported', evidence: 'fixture incompatibility' }];
    expect(() => negotiateImageConstraints(ir, manifest)).toThrow('combination_unsupported');
    expect(negotiateImageConstraints(ir, manifest, { omittedPreferred: ['mask'] }).omitted[0].reason).toBe('combination_unsupported');
    expect(() => negotiateImageConstraints(ir, { ...manifest, expiresAt: 1 })).toThrow('capability_expired');
});
test('neutral compilation evidence rejects altered wire/source and old schema without invoking an adapter', () => {
    const { source, ir, manifest } = visualFixture(), request = { model: 'fixture', input: ir.prompt };
    const evidence = { schemaVersion: 2, requestId: createNativeId('imageVersion'), source, ir, target: { model: 'fixture' },
        connection: { connectionProfileId: createNativeId('connectionProfile'), displayName: 'fixture', providerAdapter: 'provider.fixture', fingerprint: 'c'.repeat(64) },
        capabilities: manifest, constraints: negotiateImageConstraints(ir, manifest), request, requestHash: visualFingerprint(request), irHash: visualFingerprint(ir), transforms: [] };
    expect(assertCompilationEvidence(evidence)).toEqual(evidence);
    expect(() => assertCompilationEvidence({ ...evidence, schemaVersion: 1 })).toThrow('schema_cutover_required');
    expect(() => assertCompilationEvidence({ ...evidence, request: { ...request, input: 'changed' } })).toThrow('evidence_mismatch');
    expect(() => assertCompilationEvidence({ ...evidence, source: { ...source, branchId: createNativeId('branch') } })).toThrow('evidence_mismatch');
});
