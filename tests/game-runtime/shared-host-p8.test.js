/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';
globalThis.TextEncoder ??= TextEncoder;
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { createNativeSharedClient, mountNativeSharedExperience } from '../../public/scripts/native/shared-client.js';
import { taskId } from '../../public/shared/native-task-contract.js';

const snapshot = (revisionId = 'r1') => ({ kind: 'shared-session', sessionId: 'session', packageContentHash: 'exact', seatId: 'seat1',
    revisionId, accessRevisionId: 'a1', cursor: revisionId, projection: { pov: { items: [{ data: { text: 'Visible' } }] } }, realm: {}, turn: { id: 'turn' } });
const response = value => ({ ok: true, json: async () => value });
test('default Shared invocation remains a valid Task identifier when UUID begins with a digit', async () => {
    const prior = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => '12345678-1234-1234-1234-123456789abc' });
    const fetchImpl = jest.fn(async () => response(snapshot()));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl });
    try {
        await client.refresh(); await client.command({ kind: 'turn.submit', turnId: 'turn', ruleId: 'save', args: {} });
        const { invocationId } = JSON.parse(fetchImpl.mock.calls.at(-1)[1].body).action;
        expect(taskId(invocationId)).toBe('shared-12345678-1234-1234-1234-123456789abc');
    } finally {
        client.dispose();
        if (prior) Object.defineProperty(crypto, 'randomUUID', prior); else delete crypto.randomUUID;
    }
});


test('uncertain sends retry exact invocation and anchors; known conflict allows resync', async () => {
    const fetchImpl = jest.fn(async () => response(snapshot()));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl, invocationId: () => 'invoke' });
    await client.refresh(); const action = { kind: 'turn.submit', turnId: 'turn', ruleId: 'save', args: {} };
    fetchImpl.mockRejectedValueOnce(new Error('connection lost'));
    await expect(client.command(action)).rejects.toThrow(/lost/);
    await expect(client.command({ kind: 'turn.cancel' })).rejects.toThrow(/retry_pending/);
    await client.command(action); expect(fetchImpl.mock.calls[1][1].body).toBe(fetchImpl.mock.calls[2][1].body);
    fetchImpl.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'conflict' }) });
    await expect(client.command(action)).rejects.toThrow(/conflict/); await client.refresh(); client.dispose();
});
test('cursor no-change preserves projection; permission denial clears mounted private data', async () => {
    const onProjection = jest.fn(); const fetchImpl = jest.fn(async () => response(snapshot()));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl, onProjection });
    await client.refresh(); fetchImpl.mockResolvedValueOnce(response({ ...snapshot(), projection: null }));
    await client.refresh(); expect(client.getProjection().pov.items).toHaveLength(1);
    fetchImpl.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'denied' }) });
    await expect(client.refresh()).rejects.toThrow(/denied/); expect(client.getProjection()).toEqual({}); expect(onProjection).toHaveBeenLastCalledWith(null); client.dispose();
});
test('late out-of-order and disposed responses cannot replace the projection', async () => {
    let finish;
    const fetchImpl = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(response(snapshot('r2')));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl, invocationId: () => 'invoke' });
    const first = client.refresh(); await client.refresh(); finish(response(snapshot('r1')));
    await expect(first).rejects.toThrow(/stale/); expect(client.getSnapshot().revisionId).toBe('r2');
    fetchImpl.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const pending = client.refresh(); client.dispose(); finish(response(snapshot('r3')));
    await expect(pending).rejects.toThrow(/disposed/);
});






test('Shared participation loads exact native@3 metadata without owner Bridge, Package DOM or private Session state', async () => {
    const experience = { mode: 'component', frontend: { kind: 'native', version: 3, entry: 'runtime/frontend/index.json' } };
    const descriptor = { format: 'atria-native-runtime-descriptor', entryPointId: 'entry', packageContentHash: 'exact', experience };
    const fetchImpl = jest.fn(async url => response(url.endsWith('/runtime/resolve') ? { descriptor, runtime: { experience } } : snapshot()));
    const onProjection = jest.fn();
    const mounted = await mountNativeSharedExperience({ owner: 'host', sessionId: 'session', fetchImpl, onProjection });
    expect(mounted.packageState.runtime.experience).toEqual(experience);
    expect(mounted.client.getProjection()).toEqual(snapshot().projection);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/native/session/shared/snapshot', '/api/native/session/runtime/resolve']);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).sharedOwner).toBe('host');
    mounted.dispose(); expect(onProjection).toHaveBeenLastCalledWith(null);
    expect(() => mounted.client.getProjection()).toThrow(/disposed/);
});


test('A4b seat picker captures access/scope/CAS anchors, denies observers and blocks pending retry', async () => {
    const view = { ...snapshot(), role: 'participant', accessEpoch: 4, scopes: { session: { epoch: 8, status: 'active' } } };
    const fetchImpl = jest.fn(async () => response(view));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl, invocationId: () => 'invoke-persona' });
    await client.refresh();
    await expect(client.selectPersona(null, 'old')).rejects.toThrow(/not_ready/);
    await client.selectPersona(null, 'r1');
    expect(JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)).toEqual({ owner: 'host', sessionId: 'session', seatId: 'seat1', expectedRevisionId: 'r1',
        expectedAccessRevisionId: 'a1', accessEpoch: 4, scopeEpoch: 8, selection: null });
    fetchImpl.mockResolvedValueOnce(response({ ...view, role: 'observer' })); await client.refresh();
    await expect(client.selectPersona(null, 'r1')).rejects.toThrow(/not_ready/);
    fetchImpl.mockResolvedValueOnce(response(view)); await client.refresh();
    fetchImpl.mockRejectedValueOnce(new Error('uncertain')); await expect(client.command({ kind: 'turn.submit' })).rejects.toThrow(/uncertain/);
    await expect(client.selectPersona(null, 'r1')).rejects.toThrow(/not_ready/); client.dispose();
});
