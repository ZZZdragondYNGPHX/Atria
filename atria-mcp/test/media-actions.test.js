import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerMediaActions } from '../src/media-actions.js';
import { registerMediaBinaryActions } from '../src/media-binary.js';

const hash = 'a'.repeat(64), boot = randomUUID();
function fixture() {
    const calls = []; let approvals = 0, revision = 'revision-1', changed = false;
    const target = { imageTargetId: 'target', connectionProfileId: 'connection' }, connection = { connectionProfileId: 'connection', providerAdapter: 'provider.fixture', baseUrl: 'https://fixture.invalid', secretRef: 'secret-ref' };
    const prepared = { source: { sessionId: 'session', branchId: 'branch', revisionId: 'revision-1' }, revision: hash, expired: false,
        expectedHead: hash, targetFingerprint: hash, requestHash: hash, externalAssetIds: ['asset'], omittedPreferred: [], cost: { kind: 'unknown' }, connection };
    const browser = { runtimeIdentity: async () => ({ serverBootId: boot }) };
    const request = async (_browser, method, path, input) => {
        calls.push({ method, path, input }); let data = { saved: true };
        if (path.endsWith('/observe') && path.includes('/product/')) data = { session: { sessionId: 'session', headRevisionId: revision, packageVersionId: 'version' }, branchId: 'branch' };
        else if (path.endsWith('/visual/configuration')) data = { targets: [target], renderings: [], budget: { value: { moneyDay: 0 } } };
        else if (path.endsWith('/configuration')) data = { connections: [connection] };
        else if (path.endsWith('/prepared/observe')) data = prepared;
        else if (path.endsWith('/observation')) data = { revision: hash, operation: { status: 'running', anchor: prepared.source } };
        else if (path.endsWith('/illustration-image-observations')) data = [];
        else if (path.endsWith('/speech/observe')) data = { status: 'running', anchor: prepared.source };
        else if (path.endsWith('/official/illustration')) data = { revision: hash, value: { director: { mode: 'automatic', autoApproval: { targetFingerprint: hash } } } };
        else if (path.endsWith('/gc/preview')) data = { items: [{ assetId: 'asset', contentHash: hash, references: [] }], nextOffset: null };
        if (changed && path.endsWith('/observe') && path.includes('/product/')) revision = 'revision-2';
        return { ok: true, status: 200, serverBootId: boot, data };
    };
    const registry = registerMediaActions(new ActionRegistry(), browser, { request });
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; return { action: 'accept', content: { authorize: true } }; } });
    return { calls, registry, executor, target, connection, prepared, get approvals() { return approvals; }, set changed(value) { changed = value; } };
}
const pinned = { sessionId: 'session', branchId: 'branch', expectedRevisionId: 'revision-1' };

test('Image and Speech READ actions reach only explicit pure observation ports', async () => {
    const f = fixture();
    for (const [action, input, path] of [
        ['media.image.status', { operationId: 'job' }, '/illustration-images/job/observation'],
        ['media.image.list', { sessionId: 'session', branchId: 'branch' }, '/illustration-image-observations'],
        ['media.image.prepared', { prepareId: 'prepared' }, '/illustration-images/prepared/observe'],
        ['speech.status', { operationId: 'operation' }, '/speech/observe'],
        ['speech.describe', { sessionId: 'session', revisionId: 'revision-1' }, '/speech/describe-observation'],
    ]) {
        await f.executor.execute('READ', { action, input }); assert.ok(f.calls.at(-1).path.endsWith(path));
    }
    assert.equal(f.approvals, 0);
    for (const action of ['media.mask.read', 'media.gallery.query', 'media.gallery.history', 'media.director.scan', 'media.image.reconcile']) assert.equal(f.registry.get(action).detail.risk, 'MUTATE');
    assert.equal(f.registry.get('media.target.describe').detail.risk, 'INTERACT');
    assert.equal(f.registry.get('media.gc.sweep').detail.risk, 'DESTRUCTIVE');
});

test('Mask typed commands pin source and native CAS and reject arbitrary paths or scripts', async () => {
    const f = fixture(), input = { ...pinned, draftId: 'draft', expectedRevision: hash, commands: [{ kind: 'fill', value: 255 }], cursor: 1 };
    const saved = await f.executor.execute('MUTATE', { action: 'media.mask.save', input });
    assert.equal(saved.receipt.status, 'succeeded'); assert.equal(f.approvals, 1);
    const dispatch = f.calls.find(item => item.path.endsWith('/mask/save'));
    assert.equal(dispatch.input.expectedRevision, hash); assert.equal(dispatch.input.expectedRevisionId, undefined);
    for (const change of [{ expectedRevision: undefined }, { script: 'steal()' }, { path: '../../private' }, { commands: [{ kind: 'script', value: 0 }] }, { commands: [{ kind: 'stroke', value: 0, radius: 1, points: Array(2049).fill({ x: 0, y: 0 }) }] }]) {
        await assert.rejects(f.executor.execute('MUTATE', { action: 'media.mask.save', input: { ...input, ...change } }));
    }
    await assert.rejects(f.executor.execute('MUTATE', { action: 'media.mask.save', input: { ...input, branchId: 'foreign' } }), /branch conflict/);
    assert.equal(f.approvals, 1);
});

test('Image send requires native preparation, exact assets, cost envelope and independent trusted approval', async () => {
    const f = fixture(), input = { prepareId: 'prepared', expectedRevisionId: 'revision-1', expectedPreparationRevision: hash,
        approval: { targetFingerprint: hash, requestHash: hash, maxCost: 1, currency: 'USD', allowUnknownCost: true, externalAssetIds: ['asset'], omittedPreferred: [] } };
    await assert.rejects(f.executor.execute('MUTATE', { action: 'media.image.start', input: { ...input, approval: { ...input.approval, externalAssetIds: [] } } }), /approval conflict/);
    assert.equal(f.approvals, 0);
    const sent = await f.executor.execute('MUTATE', { action: 'media.image.start', input });
    assert.equal(sent.receipt.status, 'succeeded'); assert.equal(f.approvals, 1);
    const dispatch = f.calls.find(item => item.path.endsWith('/illustration-images'));
    assert.deepEqual(dispatch.input, { prepareId: 'prepared', approval: input.approval });
    const denied = new RiskExecutor(f.registry, new PolicyCeiling(f.registry, f.registry.ids()));
    await assert.rejects(denied.execute('MUTATE', { action: 'media.image.start', input }), /approval unavailable/);
});

test('Target/Secret origin evidence and source drift are checked before any provider-capable action', async () => {
    const f = fixture(), input = { imageTargetId: 'target', expectedTargetFingerprint: fingerprint(f.target), expectedConnectionFingerprint: fingerprint(f.connection) };
    await assert.rejects(f.executor.execute('INTERACT', { action: 'media.target.describe', input: { ...input, expectedConnectionFingerprint: hash } }), /fingerprint conflict/);
    assert.equal(f.approvals, 0);
    await f.executor.execute('INTERACT', { action: 'media.target.describe', input });
    assert.equal(f.approvals, 1);
    f.changed = true;
    await assert.rejects(f.executor.execute('MUTATE', { action: 'media.mask.create', input: { ...pinned, imageVersionId: 'image' } }), /conflict/);
    assert.ok(!f.calls.some(item => item.path.endsWith('/mask/create')));
});

test('Director automatic scan, GC references and destructive one-shot boundaries remain explicit', async () => {
    const f = fixture();
    await assert.rejects(f.executor.execute('MUTATE', { action: 'media.director.scan', input: pinned }), /automatic/);
    assert.equal(f.approvals, 0);
    const scan = await f.executor.execute('MUTATE', { action: 'media.director.scan', input: { ...pinned, allowAutomatic: true } });
    assert.equal(scan.receipt.status, 'succeeded');
    const sweep = await f.executor.execute('DESTRUCTIVE', { action: 'media.gc.sweep', input: { assetId: 'asset', expectedContentHash: hash } });
    assert.equal(sweep.receipt.status, 'succeeded'); assert.equal(sweep.lease.remaining, 0);
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'media.gc.sweep', input: { assetId: 'asset', expectedContentHash: 'b'.repeat(64) } }), /referenced/);
});

test('Media binary captures stay outside JSON and Mask checkpoint consumes only its exact draft-purpose handle', async () => {
    const registry = new ActionRegistry(), bytesByKind = { image: Buffer.alloc(2 * 1024 * 1024 + 7, 0xa5), thumbnail: Buffer.from('thumbnail'), mask: Buffer.from([0, 255, 255, 0]), audio: Buffer.from('audio') };
    const stages = new Map(); let checkpointCount = 0, chunkCount = 0;
    const sessionIdentity = async () => ({ target: { sessionId: 'session', branchId: 'branch' }, serverBootId: boot, revisionId: 'revision-1' });
    const call = async (_method, path, input) => {
        if (path.endsWith('/speech/observe')) return { serverBootId: boot, data: { current: true, status: 'completed', anchor: { sessionId: 'session', branchId: 'branch', revisionId: 'revision-1' }, artifact: { asset: { contentHash: hash } } } };
        assert.ok(path.endsWith('/binary/describe'));
        const bytes = bytesByKind[input.kind], purpose = { image: 'media-image', thumbnail: 'media-thumbnail', mask: 'mask-raster', audio: 'speech-audio' }[input.kind];
        const scope = { sessionId: 'session', branchId: 'branch', ...(input.kind === 'mask' ? { draftId: input.draftId } : input.kind === 'audio' ? { operationId: input.operationId } : { imageVersionId: input.imageVersionId }) };
        const stage = { ref: { handleId: randomUUID(), clientInstanceId: input.clientInstanceId, serverBootId: boot, purpose,
            contentHash: createHash('sha256').update(bytes).digest('hex'), totalBytes: bytes.length, sourceRevision: input.kind === 'mask' ? input.expectedRevision : 'revision-1' },
        owner: 'owner', sourceScope: scope, mediaType: input.kind === 'mask' ? 'application/x-atria-mask-gray8' : input.kind === 'audio' ? 'audio/wav' : 'image/png',
        expiresAt: Date.now() + 100000, maxChunkBytes: 1048576 };
        stages.set(stage.ref.handleId, bytes); return { ok: true, serverBootId: boot, data: stage };
    };
    registerMediaBinaryActions(registry, {}, { call, sessionIdentity, fetchChunk: async (_browser, stage, offset, length) => { chunkCount++; return stages.get(stage.ref.handleId).subarray(offset, offset + length); },
        checkpoint: async (_browser, input, bytes, currentBoot) => { checkpointCount++; assert.equal(currentBoot, boot); assert.equal(input.draftId, 'draft'); assert.deepEqual(bytes, bytesByKind.mask); return { revision: 'b'.repeat(64) }; } });
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const image = await executor.execute('MUTATE', { action: 'media.image.capture', input: { ...pinned, imageVersionId: 'image' } });
    assert.equal(image.result.artifact.totalBytes, bytesByKind.image.length); assert.equal(chunkCount, 3);
    assert.ok(JSON.stringify(image).length < 12000); assert.doesNotMatch(JSON.stringify(image), /paWlpaWl|"data":\[/);
    await assert.rejects(executor.execute('MUTATE', { action: 'media.mask.checkpoint', input: { ...pinned, draftId: 'draft', expectedRevision: hash, binaryHandleId: image.result.artifact.binaryHandleId } }), /purpose or source/);
    const raster = await executor.execute('MUTATE', { action: 'media.mask.raster.capture', input: { ...pinned, draftId: 'draft', expectedRevision: hash } });
    const checkpointInput = { ...pinned, draftId: 'draft', expectedRevision: hash, binaryHandleId: raster.result.artifact.binaryHandleId };
    const saved = await executor.execute('MUTATE', { action: 'media.mask.checkpoint', input: checkpointInput });
    assert.equal(saved.receipt.status, 'succeeded'); assert.equal(checkpointCount, 1);
    await assert.rejects(executor.execute('MUTATE', { action: 'media.mask.checkpoint', input: { ...checkpointInput, draftId: 'foreign' } }), /purpose or source/);
    const audio = await executor.execute('MUTATE', { action: 'speech.audio.capture', input: { operationId: 'operation', expectedRevisionId: 'revision-1' } });
    assert.equal(audio.result.artifact.purpose, 'speech-audio');
    const inspected = await executor.execute('READ', { action: 'media.binary.inspect', input: { binaryHandleId: audio.result.artifact.binaryHandleId } });
    assert.equal(inspected.contentHash, audio.result.artifact.contentHash); assert.equal(checkpointCount, 1);
});
