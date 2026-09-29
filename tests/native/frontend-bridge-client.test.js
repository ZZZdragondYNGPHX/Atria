import { evaluate } from '../../public/shared/native-frontend-presentation.js';
import { jest } from '@jest/globals';
import { bridgeFixture } from './helpers/frontend-bridge-fixture.js';
import { compileBridge } from '../../src/native/frontend/bridge.js';
import { createFrontendBridge } from '../../public/scripts/native/frontend/bridge.js';
import { previewBridgeTransport } from '../../public/scripts/native/frontend/preview-bridge.js';
import { bridgeReceipt, bridgeDescriptorDigest } from '../../public/shared/native-frontend-bridge.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const descriptor = () => { const f = bridgeFixture(); return compileBridge({ version: 1, bindings: f.bindings }, f.contract); };
function transportFor(bridge, request) {
    return { open: async () => bridgeReceipt({ epoch: 'epoch-1', revision: 'revision-1', data: { descriptorDigest: await bridgeDescriptorDigest(bridge) } }), close: jest.fn(async () => {}), request: async body => request(body, data => bridgeReceipt({ epoch: body.epoch, revision: body.revision, bindingId: body.bindingId, schemaDigest: bridge.bindings.find(item => item.id === body.bindingId)?.schemaDigest, ...data })) };
}

describe('Frontend compiled Bridge client and Preview', () => {
    test('Preview uses public schemas/Collection semantics and never substitutes a fake authority writer', async () => {
        const d = descriptor(), transport = previewBridgeTransport({ descriptor: d, scopes: { Main: d.bindings.map(item => item.id), Child: [] },
            projections: { notes: [], page: ['c', 'a', 'b'].map(id => ({ id, value: { text: id } })) } });
        const bridge = await createFrontendBridge({ descriptor: d, transport }), scope = bridge.scope('Main', ['notes', 'page', 'save']);
        expect((await scope.snapshot('notes')).data).toEqual([]);
        const first = await scope.page('page'); expect(first.data.map(item => item.id)).toEqual(['a', 'b']);
        expect((await scope.page('page', {}, { cursor: first.cursor })).data[0].id).toBe('c');
        expect((await scope.page('page', { search: 'c' }, { cursor: first.cursor })).error.code).toBe('bridge_cursor_stale');
        expect((await scope.invoke('save', { label: 'write' })).error.code).toBe('bridge_preview_readonly');
        expect((await scope.snapshot('notes', { undeclared: true })).error.code).toBe('bridge_schema_invalid');
        bridge.dispose();
    });
    test('client revokes pending read and fixed handles on reload/dispose; late values are never delivered', async () => {
        const d = descriptor(), pending = deferred(); let cancelled;
        const transport = transportFor(d, async (_body, receipt) => receipt({ data: await pending.promise }));
        const original = transport.request; transport.request = (body, signal) => { cancelled = signal; return original(body); };
        const bridge = await createFrontendBridge({ descriptor: d, transport, fixed: { prefs: () => ({ compact: true }), environment: () => ({ device: 'mobile' }) } });
        const scope = bridge.scope('Main', ['notes']); expect(scope.fixed.environment()).toEqual({ device: 'mobile' });
        const read = scope.snapshot('notes'); await bridge.reload(); expect(cancelled.aborted).toBe(true); pending.resolve([]);
        expect((await read).error.code).toBe('bridge_epoch_stale'); expect(() => scope.fixed.prefs()).toThrow('bridge_epoch_stale');
        bridge.dispose(); expect(transport.close).toHaveBeenCalledWith('epoch-1');
    });
    test('out-of-order query completion fails closed without cancelling same-query readers', async () => {
        const d = descriptor(), first = deferred();
        const transport = transportFor(d, async (body, receipt) => { if (body.input.search === 'first') await first.promise; return receipt({ data: [] }); });
        const bridge = await createFrontendBridge({ descriptor: d, transport }), scope = bridge.scope('Main', ['page']);
        const old = scope.page('page', { search: 'first' });
        expect((await scope.page('page', { search: 'second' })).ok).toBe(true); first.resolve(); expect((await old).error.code).toBe('bridge_query_stale');
        expect((await Promise.all([scope.page('page'), scope.page('page')])).every(result => result.ok)).toBe(true); bridge.dispose();
    });
    test.each([null, { label: 7 }, { label: 'ok', target: 'arbitrary' }])('invalid public inputs always return unified errors: %j', async input => {
        const d = descriptor(), transport = transportFor(d, () => { throw new Error('Must not cross boundary'); });
        const bridge = await createFrontendBridge({ descriptor: d, transport }); expect((await bridge.scope('Main', ['save']).invoke('save', input)).error.code).toBe('bridge_schema_invalid'); bridge.dispose();
    });
    test('schema identity, output page budget and transport failure are fail closed', async () => {
        const d = descriptor(); let response = 'digest';
        const transport = transportFor(d, (body, receipt) => {
            if (response === 'transport') throw new Error('private Host error');
            if (response === 'digest') return receipt({ data: [], schemaDigest: 'forged' });
            return receipt({ data: Array.from({ length: 3 }, (_, i) => ({ id: String(i), value: { text: '' } })) });
        });
        const bridge = await createFrontendBridge({ descriptor: d, transport }), scope = bridge.scope('Main', ['page']);
        expect((await scope.page('page')).error.code).toBe('bridge_schema_invalid'); response = 'budget';
        expect((await scope.page('page')).error.code).toBe('bridge_schema_invalid'); response = 'transport';
        const failed = await scope.page('page'); expect(failed.error.code).toBe('bridge_transport_failed'); expect(JSON.stringify(failed)).not.toContain('private'); bridge.dispose();
    });
    test('malformed protocol versions and mismatched opening descriptors are rejected', async () => {
        const d = descriptor(), transport = transportFor(d, (_body, receipt) => ({ ...receipt({ data: [] }), version: 2 }));
        const bridge = await createFrontendBridge({ descriptor: d, transport });
        expect((await bridge.scope('Main', ['notes']).snapshot('notes')).error.code).toBe('bridge_receipt_invalid'); bridge.dispose();
        transport.open = async () => bridgeReceipt({ epoch: 'wrong', revision: 'r', data: { descriptorDigest: 'wrong' } });
        await expect(createFrontendBridge({ descriptor: d, transport })).rejects.toThrow('bridge_schema_invalid');
        expect(transport.close).toHaveBeenCalledWith('wrong');
    });
    test('concurrent reloads cannot resurrect a superseded epoch', async () => {
        const d = descriptor(), transport = transportFor(d, (_body, receipt) => receipt({ data: [] }));
        const bridge = await createFrontendBridge({ descriptor: d, transport }), late = deferred(), digest = await bridgeDescriptorDigest(d);
        transport.open = () => late.promise; const first = bridge.reload();
        transport.open = async () => bridgeReceipt({ epoch: 'new', revision: 'r', data: { descriptorDigest: digest } });
        await bridge.reload(); late.resolve(bridgeReceipt({ epoch: 'late', revision: 'r', data: { descriptorDigest: digest } }));
        await expect(first).rejects.toThrow('bridge_epoch_stale'); expect(bridge.epoch).toBe('new'); expect(transport.close).toHaveBeenCalledWith('late'); bridge.dispose();
    });
    test('namespaced binding projections use the longest declared binding identity without expression evaluation', () => {
        const context = { bridge: { notes: { data: 'short' }, 'notes.summary': { data: { text: 'typed' } } } };
        expect(evaluate({ get: 'bridge.notes.summary.data.text' }, context)).toBe('typed');
        expect(evaluate({ get: 'bridge.notes.data' }, context)).toBe('short');
    });

    test('unsubscribe and Epoch reset suppress late subscription and revision callbacks', async () => {
        const d = descriptor(), read = deferred(); let wait = false;
        const onRevision = jest.fn(), listener = jest.fn();
        const transport = transportFor(d, async (body, receipt) => {
            if (body.method === 'status') return bridgeReceipt({ epoch: body.epoch, revision: 'revision-2' });
            if (wait) await read.promise;
            return receipt({ data: [] });
        });
        const bridge = await createFrontendBridge({ descriptor: d, transport, onRevision });
        const scope = bridge.scope('Main', ['notes']); wait = true;
        const stop = scope.subscribe('notes', {}, listener); stop();
        const pending = bridge.refresh(); await bridge.reload(); read.resolve(); await pending;
        expect(listener).not.toHaveBeenCalled(); expect(onRevision).not.toHaveBeenCalled(); bridge.dispose();
    });

    test('presentation-only mounts recover without creating an authority transport', async () => {
        const bridge = await createFrontendBridge({ descriptor: descriptor() });
        const before = bridge.scope('Main', ['notes']);
        await bridge.reload();
        expect((await before.snapshot('notes')).error.code).toBe('bridge_epoch_stale');
        expect((await bridge.scope('Main', ['notes']).snapshot('notes')).error.code).toBe('bridge_preview_readonly'); bridge.dispose();
    });

});
