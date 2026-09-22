import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId, resolveSessionKnowledge } from '../../src/native/index.js';
import { installFixture, sessionFixture, knowledgeSnapshot, bindingFor, publishKnowledge } from './helpers/session-fixture.js';

describe('N3 resolved KnowledgeBindingSet', () => {
    let h;
    let f;
    beforeEach(async () => { h = await makeTempFsEngineHarness(); f = await installFixture(h); });
    afterEach(async () => { await h.cleanup(); });

    test('resolves only Package defaults plus selected EntryPoint/World, preserving binding policy without compiling', async () => {
        const fixture = sessionFixture();
        const defaults = bindingFor(fixture.knowledge);
        const entry = { ...bindingFor(fixture.knowledge), mode: 'override', visibility: ['narrator'], priority: 20 };
        const elsewhere = bindingFor(fixture.knowledge);
        fixture.manifest.knowledgeBindings.push(defaults, entry, elsewhere);
        fixture.manifest.entryPoints[0].knowledgeBindingIds = [entry.knowledgeBindingId];
        fixture.manifest.entryPoints.push({ entryPointId: createNativeId('entryPoint'), displayName: 'Other',
            actorIds: [], worldIds: [], knowledgeBindingIds: [elsewhere.knowledgeBindingId] });
        const installed = await installFixture(h, fixture);
        const view = await installed.core.create(h.handle, installed.start);
        expect(view.knowledge.bindings.map(item => item.knowledgeBindingId)).toEqual([
            fixture.binding.knowledgeBindingId, defaults.knowledgeBindingId, entry.knowledgeBindingId,
        ]);
        expect(view.knowledge.bindings.at(-1)).toMatchObject({ mode: 'override', visibility: ['narrator'], priority: 20 });
        expect(view.knowledge.snapshots).toEqual([]);
    });

    test('rejects missing policy, duplicate IDs, wrong ownership and unavailable exact revisions before Session creation', async () => {
        await expect(f.core.create(h.handle, { ...f.start, libraryBindingIds: [createNativeId('knowledgeBinding')] }))
            .rejects.toMatchObject({ code: 'native_session_binding_missing' });
        const snapshot = knowledgeSnapshot();
        const binding = bindingFor(snapshot, 'library');
        await publishKnowledge(h, f.knowledgeRepo, snapshot, binding);
        await expect(f.core.create(h.handle, { ...f.start,
            libraryBindingIds: [binding.knowledgeBindingId, binding.knowledgeBindingId] })).rejects.toThrow('Duplicate KnowledgeBinding');
        await expect(f.core.create(h.handle, { ...f.start, sessionBindings: [binding], sessionKnowledge: [snapshot] }))
            .rejects.toThrow('Session-local binding');
        // Exact revision lookup is independent of the mutable Library current pointer.
        const fakeRepo = { getBinding: () => binding, get: () => snapshot.knowledgeBase, getRevision: () => null };
        await expect(resolveSessionKnowledge({ handle: h.handle, manifest: f.manifest,
            entryPoint: f.manifest.entryPoints[0], knowledgeRepo: fakeRepo, libraryBindingIds: [binding.knowledgeBindingId] }))
            .rejects.toMatchObject({ code: 'native_session_knowledge_missing' });
        expect(await f.sessionRepo.list(h.handle)).toEqual([]);
    });

    test('Session-local Knowledge validates exact closure, including required dependency cycles', async () => {
        const snapshot = knowledgeSnapshot();
        const binding = bindingFor(snapshot, 'session');
        await expect(f.core.create(h.handle, { ...f.start, sessionBindings: [binding] }))
            .rejects.toMatchObject({ code: 'native_session_knowledge_missing' });
        const missing = structuredClone(snapshot);
        missing.entries = [];
        await expect(f.core.create(h.handle, { ...f.start, sessionBindings: [binding], sessionKnowledge: [missing] }))
            .rejects.toThrow('exactly match');
        const cyclic = structuredClone(snapshot);
        cyclic.entries[0].relations = { requiredEntryIds: [cyclic.entries[0].knowledgeEntryId] };
        await expect(f.core.create(h.handle, { ...f.start, sessionBindings: [binding], sessionKnowledge: [cyclic] }))
            .rejects.toMatchObject({ code: 'native_knowledge_dependency_cycle' });
        await expect(f.core.create(h.handle, { ...f.start, sessionKnowledge: [snapshot] })).rejects.toThrow('Unbound');
        expect(await f.sessionRepo.list(h.handle)).toEqual([]);
    });

    test('Package-contained Knowledge is never resolved against a same-ID Library revision', async () => {
        const hostile = structuredClone(f.knowledge);
        hostile.entries[0].content = 'Different Library data';
        await publishKnowledge(h, f.knowledgeRepo, hostile);
        const view = await f.core.create(h.handle, f.start);
        expect(view.manifest.knowledge[0].entries[0].content).toBe('Exact knowledge');
        expect(view.knowledge.bindings[0].source.kind).toBe('package');
        expect(view.knowledge.snapshots).toEqual([]);
    });
});
