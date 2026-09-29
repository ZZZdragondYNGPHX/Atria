/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';
globalThis.TextEncoder ??= TextEncoder;
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { createNativeLifecycleClient } from '../../public/scripts/native/lifecycle-client.js';

function fixture() {
    const contract = { lifecycleRuntime: { domains: [] }, continuityRuntime: { schemaVersion: 1 }, taskRuntime: { tasks: [] } };
    const snapshot = { session: { sessionId: 'session', packageId: 'package', packageVersionId: 'version', entryPointId: 'entry', packageContentHash: 'hash' },
        revision: { revisionId: 'r1', branchId: 'branch' }, manifest: { runtime: { experienceContract: contract } }, states: { atri_lifecycle: { outbox: [] } } };
    const runtime = { active: true, snapshot, acceptOperationSnapshot: jest.fn(async value => { runtime.snapshot = value; }) };
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => runtime.snapshot }));
    const client = createNativeLifecycleClient({ runtime, fetchImpl, emit: async () => {}, invocationId: () => 'test-invocation', headers: () => ({ 'X-CSRF-Token': 'test' }) });
    const load = client.beginLoad();
    const ready = async () => { await load.prepare({ status: 'ready', active: true, sessionId: 'session', descriptor: { ...snapshot.session, experienceContract: contract } }); await load.ready(); fetchImpl.mockClear(); };
    return { client, runtime, ready, fetchImpl };
}
test('mount Host retains exact Continuity request after uncertain failure and closes on history/disposal', async () => {
    const f = fixture();
    try {
        await f.ready(); const actual = f.fetchImpl.getMockImplementation(); f.fetchImpl.mockRejectedValueOnce(new Error('lost')).mockImplementation(actual);
        const action = { kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'sword', scopeEpoch: 0, expectedContinuityRevisionId: null };
        await expect(f.client.continuityCommand(action)).rejects.toThrow('lost');
        await expect(f.client.command({ kind: 'pump' })).rejects.toThrow(/retry_pending/);
        await f.client.continuityCommand(action);
        expect(f.fetchImpl.mock.calls[0][1].body).toBe(f.fetchImpl.mock.calls[1][1].body);
        expect(JSON.parse(f.fetchImpl.mock.calls[1][1].body).command.type).toBe('continuity');
        f.runtime.history = true; await expect(f.client.continuityCommand(action)).rejects.toThrow(/historical/);
        f.client.cancel(); await expect(f.client.getContinuityProjection('vault')).rejects.toThrow(/stale/);
    } finally { f.client.cancel(); }
});
test('late Continuity projection cannot cross a Session revision or disposed mount', async () => {
    const f = fixture();
    try {
        await f.ready(); let finish;
        f.fetchImpl.mockImplementationOnce(async () => ({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) }));
        const pending = f.client.getContinuityProjection('vault'); await Promise.resolve(); await Promise.resolve();
        f.runtime.snapshot = { ...f.runtime.snapshot, revision: { ...f.runtime.snapshot.revision, revisionId: 'r2' } };
        finish({ revisionId: 'c1', records: [] }); await expect(pending).rejects.toThrow(/stale/);
    } finally { f.client.cancel(); }
});
test('reopened Host mounts recovery controls without pumping an unfinished Saga', async () => {
    const f = fixture();
    try {
        f.runtime.snapshot.externalEffects = [{ intentId: 'pending', status: 'prepared' }];
        await f.ready(); expect(f.fetchImpl).not.toHaveBeenCalled();
        await f.client.pump(); expect(f.fetchImpl).not.toHaveBeenCalled();
        expect(f.client.getExternalEffects()).toEqual([{ intentId: 'pending', status: 'prepared' }]);
        await f.client.continuityCommand({ kind: 'transfer.resume', intentId: 'pending' });
        expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).command.action.kind).toBe('transfer.resume');
    } finally { f.client.cancel(); }
});
