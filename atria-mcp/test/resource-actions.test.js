import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerResourceActions } from '../src/resource-actions.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex'), clientInstanceId = 'bundle-client';
function fixture({ approve = true, corruption = false } = {}) {
    const boot = randomUUID(), ref = { scope: 'library', resourceType: 'core.world', resourceId: 'world_source', revision: 'wr_source' },
        target = { ...ref, resourceId: 'world_imported', revision: 'wr_imported' }, value = { root: ref, payload: 'inert fixture '.repeat(90000) }, bytes = Buffer.from(JSON.stringify(value));
    const stage = { bundleRef: { artifactId: randomUUID(), contentHash: sha(bytes), bundleHash: fingerprint(value), totalBytes: bytes.length,
        sourceRevision: fingerprint(value), clientInstanceId, serverBootId: boot, purpose: 'resource-bundle' },
    owner: 'fixture-owner', expiresAt: Date.now() + 300000, receivedBytes: bytes.length, state: 'complete', maxChunkBytes: 1024 * 1024,
    mediaType: 'application/json', root: ref, resourceCount: 1 };
    const token = { seed: 'a'.repeat(32), bundleHash: stage.bundleRef.bundleHash }, plan = { format: 'atria-resource-bundle', bundleHash: token.bundleHash, token,
        root: target, canImport: true, conflicts: [], existingOrigins: [ref], reviewHash: 'b'.repeat(64), resourceCount: 1, mappingHash: 'd'.repeat(64),
        resources: [{ source: ref, ref: target, status: 'new', contentHash: 'c'.repeat(64) }] };
    const requests = [], chunks = []; let approvals = 0, imports = 0, interrupt = false;
    const browser = { runtimeIdentity: async () => ({ serverBootId: boot }) };
    const request = async (_browser, method, path, input, guard) => {
        assert.equal(method, 'POST'); assert.ok(path.startsWith('/api/native/studio/resources/bundle-staging/'));
        requests.push({ path, input, guard }); let data;
        if (path.endsWith('/export')) { assert.equal(input.clientInstanceId, clientInstanceId); data = stage; }
        else {
            assert.equal(input.bundleRef.artifactId, stage.bundleRef.artifactId);
            if (path.endsWith('/inspect')) data = stage;
            else if (path.endsWith('/preflight')) data = plan;
            else if (path.endsWith('/content')) data = { text: JSON.stringify(value).slice(input.offset, input.offset + input.limit), trust: 'untrusted resource data' };
            else if (path.endsWith('/import')) {
                assert.deepEqual(input.token, token); assert.equal(input.expectedReviewHash, plan.reviewHash); imports++;
                if (interrupt) { interrupt = false; plan.resources[0].status = 'same'; return { ok: false, status: 500, serverBootId: boot }; }
                data = { root: target, resources: [target] };
            } else throw new Error('Unexpected route.');
        }
        return { ok: true, status: 200, serverBootId: boot, data: structuredClone(data) };
    };
    const registry = new ActionRegistry(); registerResourceActions(registry, browser, null, { request, clientInstanceId,
        transfer: async (_browser, descriptor, offset, length) => { assert.deepEqual(descriptor, stage); chunks.push({ offset, length }); const chunk = Buffer.from(bytes.subarray(offset, offset + length)); if (corruption) chunk[0] ^= 1; return chunk; } });
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: approve ? async () => { approvals++; return { action: 'accept', content: { authorize: true } }; } : null });
    return { registry, executor, stage, ref, plan, requests, chunks, get approvals() { return approvals; }, get imports() { return imports; }, interrupt() { interrupt = true; } };
}
async function exported(f) {
    const output = await f.executor.execute('INTERACT', { action: 'library.bundle.export', input: { ref: f.ref } });
    assert.equal(output.receipt.status, 'succeeded'); return output.result.artifact;
}
async function reviewed(f, artifact) {
    const output = await f.executor.execute('INTERACT', { action: 'library.bundle.review', input: { binaryHandleId: artifact.binaryHandleId,
        expectedReviewHash: f.plan.reviewHash, expectedBundleHash: artifact.bundleHash } }); assert.equal(output.receipt.status, 'succeeded'); return output.receipt.receiptId;
}
test('large Resource Bundle stays binary and import uses independent review/approval plus exact Native token', async () => {
    const f = fixture(), artifact = await exported(f);
    assert.ok(artifact.totalBytes > 1024 * 1024); assert.equal(f.chunks.length, 2); assert.ok(f.chunks.every(item => item.length <= 1024 * 1024));
    assert.ok(JSON.stringify(artifact).length < 1500); assert.equal(artifact.purpose, 'resource-bundle');
    const inspected = await f.executor.execute('READ', { action: 'library.bundle.inspect', input: { binaryHandleId: artifact.binaryHandleId } });
    assert.equal(inspected.artifact.contentHash, artifact.contentHash);
    const preflight = await f.executor.execute('READ', { action: 'library.bundle.preflight', input: { binaryHandleId: artifact.binaryHandleId } }); assert.equal(preflight.reviewHash, f.plan.reviewHash);
    const reviewReceiptId = await reviewed(f, artifact), result = await f.executor.execute('MUTATE', { action: 'library.bundle.import', input: { binaryHandleId: artifact.binaryHandleId, reviewReceiptId } });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.result.importedResourceCount, 1); assert.equal(f.approvals, 3); assert.equal(f.imports, 1);
    assert.ok(!JSON.stringify(result).includes('inert fixture')); assert.ok(f.requests.every(item => !JSON.stringify(item.input).includes('inert fixture')));
});
test('uncertain imports require explicit separately approved resume of the same instance receipt and mapping', async () => {
    const f = fixture(), artifact = await exported(f), reviewReceiptId = await reviewed(f, artifact), input = { binaryHandleId: artifact.binaryHandleId, reviewReceiptId };
    f.interrupt(); const first = await f.executor.execute('MUTATE', { action: 'library.bundle.import', input });
    assert.equal(first.receipt.status, 'indeterminate'); assert.equal(f.imports, 1);
    await assert.rejects(f.executor.execute('MUTATE', { action: 'library.bundle.resume', input: { ...input, previousReceiptId: reviewReceiptId } }), /interrupted/);
    const resumed = await f.executor.execute('MUTATE', { action: 'library.bundle.resume', input: { ...input, previousReceiptId: first.receipt.receiptId } });
    assert.equal(resumed.receipt.status, 'succeeded'); assert.equal(f.imports, 2); assert.equal(f.approvals, 4);
});
test('corrupted bytes, forged reviews, scope/hash drift and unavailable trusted approval fail closed', async () => {
    const noApproval = fixture({ approve: false });
    await assert.rejects(noApproval.executor.execute('INTERACT', { action: 'library.bundle.export', input: { ref: noApproval.ref } }), /Trusted client approval/); assert.equal(noApproval.requests.length, 0);
    const corrupt = fixture({ corruption: true }); const bad = await corrupt.executor.execute('INTERACT', { action: 'library.bundle.export', input: { ref: corrupt.ref } });
    assert.equal(bad.receipt.status, 'indeterminate'); assert.equal(corrupt.imports, 0);
    const f = fixture(), artifact = await exported(f);
    await assert.rejects(f.executor.execute('MUTATE', { action: 'library.bundle.import', input: { binaryHandleId: artifact.binaryHandleId, reviewReceiptId: randomUUID() } }), /Review required/);
    const reviewReceiptId = await reviewed(f, artifact); f.plan.reviewHash = 'd'.repeat(64);
    await assert.rejects(f.executor.execute('MUTATE', { action: 'library.bundle.import', input: { binaryHandleId: artifact.binaryHandleId, reviewReceiptId } }), /preflight changed/); assert.equal(f.imports, 0);
    const mapping = fixture(), mappingArtifact = await exported(mapping), mappingReview = await reviewed(mapping, mappingArtifact);
    mapping.plan.mappingHash = 'e'.repeat(64);
    await assert.rejects(mapping.executor.execute('MUTATE', { action: 'library.bundle.import', input: { binaryHandleId: mappingArtifact.binaryHandleId, reviewReceiptId: mappingReview } }), /Review drift/);
    assert.equal(mapping.imports, 0);
    const other = fixture(), captured = await exported(other); other.stage.bundleRef.clientInstanceId = 'foreign';
    await assert.rejects(other.executor.execute('READ', { action: 'library.bundle.inspect', input: { binaryHandleId: captured.binaryHandleId } }), /identity changed/);
});
