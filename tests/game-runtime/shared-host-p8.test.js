/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';
globalThis.TextEncoder ??= TextEncoder;
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { createNativeSharedClient, mountNativeSharedExperience } from '../../public/scripts/native/shared-client.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { mountUiDocument } from '../../public/scripts/native/experience/ui/v2-runtime.js';
import { createSurfaceHost } from '../../public/scripts/native/experience/ui/surfaces.js';

const snapshot = (revisionId = 'r1') => ({ kind: 'shared-session', sessionId: 'session', packageContentHash: 'exact', seatId: 'seat1',
    revisionId, accessRevisionId: 'a1', cursor: revisionId, projection: { pov: { items: [{ data: { text: 'Visible' } }] } }, realm: {}, turn: { id: 'turn' } });
const response = value => ({ ok: true, json: async () => value });
const definition = () => ({ schemaVersion: 2, stateVersion: 1, localState: {}, preferences: {},
    actions: { submit: { steps: [{ op: 'shared.submit', args: { turnId: { expr: 'shared.turn.id' }, ruleId: 'save', args: { text: 'Ready' } } }] } },
    views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'count', type: 'text', bindings: { text: { expr: 'length(projection.pov.items)' } } } }] });

test('existing v2 renderer consumes remote granted projections and invokes typed Shared actions', async () => {
    const root = document.createElement('section'); document.body.append(root);
    const fetchImpl = jest.fn(async () => response(snapshot()));
    const client = createNativeSharedClient({ owner: 'host', sessionId: 'session', fetchImpl, headers: () => ({ 'X-CSRF-Token': 'host-only' }), invocationId: () => 'invoke' });
    await client.refresh();
    const mounted = mountUiDocument(compileUiDocument(definition(), { mode: 'component' }), { document, window, sharedClient: client,
        surfaceHost: createSurfaceHost({ resolveSurface: () => root }) });
    expect(root.textContent).toBe('1'); await mounted.execute('submit');
    expect(JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)).toMatchObject({ owner: 'host', sessionId: 'session', action: { kind: 'turn.submit', turnId: 'turn', expectedRevisionId: 'r1', expectedAccessRevisionId: 'a1' } });
    client.dispose(); mounted.dispose(); root.remove(); expect(() => client.getSnapshot()).toThrow(/disposed/);
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
test('Shared and Realm actions retain the existing single authority write ceiling', () => {
    const raw = definition(); raw.actions.submit.steps.push({ op: 'realm.command', args: {} });
    expect(() => compileUiDocument(raw, { mode: 'component' })).toThrow();
});

test('Shared mount resolves the exact Package through existing loader and renderer without a private World clone', async () => {
    const root = document.createElement('section'); document.body.append(root);
    const fetchImpl = jest.fn(async path => {
        if (path.endsWith('/snapshot')) return response(snapshot());
        if (path.endsWith('/resolve')) return response({ descriptor: { format: 'atria-native-runtime-descriptor', schemaVersion: 1,
            entryPointId: 'entry', packageContentHash: 'exact', experience: { mode: 'component' } }, runtime: { experience: { mode: 'component', componentModelVersion: 2, component: 'ui/main.json' } } });
        return response(definition());
    });
    const mounted = await mountNativeSharedExperience({ owner: 'host', sessionId: 'session', fetchImpl, document, window,
        surfaceHost: createSurfaceHost({ resolveSurface: () => root }), worldSession: { getState: () => ({ private: 'never forwarded' }) } });
    expect(root.textContent).toBe('1');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).sharedOwner).toBe('host');
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).path).toBe('ui/main.json');
    mounted.dispose(); expect(root.textContent).toBe(''); root.remove();
});
