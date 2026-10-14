import { IllustrationImageService } from '../../src/native/illustration-image-service.js';
import { SpeechService } from '../../src/native/speech-service.js';
import { createNativeId } from '../../src/native/identity.js';

test('Image observe/list never dispatch, recover, settle or mutate the durable ledger', async () => {
    const image = Object.create(IllustrationImageService.prototype), sessionId = createNativeId('session'), branchId = createNativeId('branch'), operationId = createNativeId('imageJob');
    const job = { jobId: operationId, intentId: 'intent', status: 'queued', source: { sessionId, branchId }, createdAt: 1,
        reservation: { amount: 1, currency: 'USD', released: false }, remote: null };
    let recoveries = 0;
    image.store = { read: async () => ({ value: job, revision: 'revision' }), list: async () => [job] };
    image.worker = { recover: async () => { recoveries++; } };
    image.host = { sessionCore: { runs: { assert: async () => {} } } };
    expect((await image.observe('owner', { operationId })).operation.status).toBe('queued');
    expect((await image.observeList('owner', { sessionId, branchId }))).toHaveLength(1);
    expect(recoveries).toBe(0);
    await image.reconcile('owner', { operationId }); expect(recoveries).toBe(1);
});

test('Speech observe does not prune audio or load a mutable source, and expires without synthesizing again', async () => {
    const speech = Object.create(SpeechService.prototype), operationId = 'operation';
    let captures = 0;
    speech.now = () => 1;
    speech.scheduler = { project: () => ({ operationId, status: 'completed' }) };
    speech.state = { records: new Map([[operationId, { owner: 'owner', scheduler: speech.scheduler, expiresAt: 10, input: { sessionId: 'session' },
        captured: { fingerprint: 'fingerprint', text: 'Public text', route: { runtimeRouteId: 'route' } }, artifact: { asset: { assetId: 'asset' } } }]]) };
    speech._prune = async () => { throw new Error('Observation must not prune'); };
    speech._capture = async (_handle, _input, options) => { expect(options.observe).toBe(true); captures++; return { fingerprint: 'fingerprint' }; };
    expect((await speech.observe('owner', { operationId })).artifact.asset.assetId).toBe('asset');
    expect(captures).toBe(1);
    await expect(speech.observe('foreign', { operationId })).rejects.toThrow('missing');
    speech.now = () => 10;
    await expect(speech.observe('owner', { operationId })).rejects.toThrow('missing');
    expect(captures).toBe(1); expect(speech.state.records.size).toBe(1);
    const capture = Object.create(SpeechService.prototype);
    capture.host = { sessionCore: { observe: async () => { throw new Error('pure source selected'); }, load: async () => { throw new Error('mutable source selected'); } } };
    await expect(capture._capture('owner', { sessionId: 'session' }, { observe: true })).rejects.toThrow('pure source selected');
});
