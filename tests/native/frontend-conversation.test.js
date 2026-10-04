import { jest } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { conversationFixture } from './helpers/frontend-conversation-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { compileBridge } from '../../src/native/frontend/bridge.js';
import { createFrontendBridge } from '../../public/scripts/native/frontend/bridge.js';
import { projectConversation } from '../../public/shared/native-frontend-host.js';

describe('Phase 4 fixed Conversation / Session Host targets', () => {
    let h, svc, f, host, base, opened;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); svc = services(h); f = conversationFixture(); host = new FrontendBridgeService();
        await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: f.files }).archive);
        base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        opened = await host.open(svc, h.handle, base.session.sessionId);
    });
    afterEach(async () => { host.dispose(); await h.cleanup(); });
    const call = (id, input = {}, extra = {}) => {
        const binding = f.bindings.find(binding => binding.id === id);
        return host.request(svc, h.handle, { epoch: opened.epoch, revision: opened.revision, componentId: 'Main', bindingId: id,
            method: binding.kind === 'read' ? binding.collection ? 'read.page' : 'read.snapshot' : 'action.invoke', input, idempotencyKey: crypto.randomUUID(), ...extra });
    };
    const append = async (role, content, projection) => {
        base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role, content, ...(projection ? { projection } : {}) }, { expectedRevisionId: base.revision.revisionId });
        opened.revision = base.revision.revisionId;
    };
    const reopen = async () => { base = await svc.core.load(h.handle, base.session.sessionId); opened = await host.open(svc, h.handle, base.session.sessionId); };
    test('committed collection shares exact Managed projection, keeps opaque paging and excludes provider drafts', async () => {
        await append('user', 'hello'); await append('assistant', '**Reply**');
        const first = await call('messages'); expect(first.ok).toBe(true); expect(first.data).toEqual(projectConversation(base).slice(0, 2));
        expect(first.cursor).toBeTruthy(); expect((await call('messages', {}, { cursor: first.cursor })).data[0].content).toBe('**Reply**');
        const stale = first.cursor; await append('user', 'next');
        expect((await call('messages', {}, { cursor: stale })).error.code).toBe('bridge_cursor_stale');
        expect((await call('messages', {}, { componentId: 'Child' })).error.code).toBe('bridge_binding_denied');
    });
    test('SavePoint exact guard, same-key replay, lists and no-op restore revoke Epoch', async () => {
        const save = await call('save', { displayName: 'checkpoint' }, { idempotencyKey: 'save' });
        expect(save.ok).toBe(true); expect(save.data.revisionId).toBe(base.revision.revisionId);
        expect(await call('save', { displayName: 'checkpoint' }, { idempotencyKey: 'save' })).toEqual(save);
        expect((await call('saves')).data).toHaveLength(1);
        expect((await call('save', {}, { revision: 'stale' })).error.code).toBe('bridge_revision_stale');
        expect((await call('restore', { saveId: save.data.saveId })).ok).toBe(true);
        expect((await call('status')).error.code).toBe('bridge_epoch_stale');
    });
    test('recent committed messages are bounded, chronological, revision guarded and page backwards by sequence', async () => {
        for (let i = 0; i < 38; i++) await append('user', 'line ' + i);
        const projected = projectConversation(base);
        const latest = await call('recent');
        expect(latest.ok).toBe(true); expect(latest.data).toEqual(projected.slice(-32));
        const older = await call('recent', { beforeSequence: latest.data[0].sequence });
        expect(older.data).toEqual(projected.slice(0, -32));
        expect((await call('recent', { beforeSequence: 0 })).data).toEqual([]);
        for (const input of [{ beforeSequence: -1 }, { beforeSequence: 1.5 }, { private: true }]) expect((await call('recent', input)).ok).toBe(false);
        expect((await call('recent', {}, { componentId: 'Child' })).error.code).toBe('bridge_binding_denied');
        expect((await call('recent', {}, { revision: 'stale' })).error.code).toBe('bridge_revision_stale');
    });
    test('retry/fork/switch/restore never rebase stale revisions; alternatives use predecessor and branch lineage', async () => {
        await append('user', 'question'); await append('assistant', 'first');
        const old = base, save = await call('save');
        for (const [id, input] of [['retry', { messageId: base.timeline.at(-1).messageId }], ['fork', { revisionId: base.revision.revisionId }], ['switch', { branchId: base.revision.branchId }], ['restore', { saveId: save.data.saveId }]]) {
            expect((await call(id, input, { revision: 'stale' })).error.code).toBe('bridge_revision_stale');
        }
        expect((await call('retry', { messageId: base.timeline.at(-1).messageId })).ok).toBe(true); await reopen();
        expect(base.timeline.at(-1).role).toBe('user'); await append('assistant', 'second');
        const alternatives = await call('alternatives'); expect(alternatives.ok).toBe(true);
        expect(alternatives.data.map(row => row.content).sort()).toEqual(['first', 'second']);
        expect((await call('inspect', { revisionId: old.revision.revisionId })).data.at(-1).content).toBe('first');
        expect((await call('switch', { branchId: old.revision.branchId })).ok).toBe(true); await reopen();
        expect(base.timeline.at(-1).content).toBe('first');
        expect((await call('fork', { revisionId: base.revision.revisionId })).ok).toBe(true);
    });
    test('Message Blocks remain typed projections, canonical prose unchanged; unknown type/data fail commit', async () => {
        const projection = { schemaVersion: 1, flow: [{ kind: 'prose', text: 'Canonical' }, { kind: 'block', id: 'one', type: 'card', version: 1, data: { label: 'Offer' } }] };
        await append('assistant', 'Canonical', projection);
        const blocks = await call('blocks'); expect(blocks.ok).toBe(true); expect(blocks.data[0].data).toEqual({ label: 'Offer' });
        expect((await call('messages', {}, { cursor: null })).data.at(-1).content).toBe('Canonical');
        for (const bad of [{ ...projection.flow[1], type: 'unknown' }, { ...projection.flow[1], data: { label: 'x', html: '<script>' } }]) {
            await expect(append('assistant', 'Canonical', { schemaVersion: 1, flow: [projection.flow[0], bad] })).rejects.toThrow();
        }
    });
    test('fixed local handles require installed scope authorization, schema, CAS and reuse idempotency', async () => {
        const invoke = jest.fn(async () => ({}));
        const bridge = await createFrontendBridge({ descriptor: compileBridge({ version: 1, bindings: f.bindings }, f.contract),
            hostServices: { invoke }, transport: { open: previous => host.open(svc, h.handle, base.session.sessionId, previous), request: body => host.request(svc, h.handle, body) } });
        const main = bridge.scope('Main', ['set']), forged = bridge.scope('Child', ['set']);
        expect((await forged.invoke('set', { text: 'denied' })).error.code).toBe('bridge_binding_denied');
        const one = await main.invoke('set', { text: 'draft' }, { idempotencyKey: 'same' }); expect(one.ok).toBe(true);
        await main.invoke('set', { text: 'draft' }, { idempotencyKey: 'same' }); expect(invoke).toHaveBeenCalledTimes(1);
        expect((await main.invoke('set', { text: 'changed' }, { idempotencyKey: 'same' })).error.code).toBe('bridge_idempotency_conflict');
        await append('user', 'external change');
        expect((await main.invoke('set', { text: 'late' })).error.code).toBe('bridge_revision_stale');
        expect(invoke).toHaveBeenCalledTimes(1); bridge.dispose();
    });
    test('unknown fixed service, forged output and wrong target kind fail compilation', () => {
        for (const change of [b => b.target.method = 'rawDatabase', b => b.outputSchema = { type: 'string', maxLength: 10 }, b => b.kind = 'operation']) {
            const bindings = structuredClone(f.bindings); change(bindings[0]); expect(() => compileBridge({ version: 1, bindings }, f.contract)).toThrow();
        }
    });
});
