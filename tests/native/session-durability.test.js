import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/index.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { installFixture, services } from './helpers/session-fixture.js';

function failingEngine(engine, kind, namespace) {
    return { withTransaction(handle, fn) {
        return engine.withTransaction(handle, tx => fn(new Proxy(tx, {
            get(target, prop) {
                if (prop === 'putResourceIfMatch') return (key, expected, record) => {
                    if (key.kind === kind && (!namespace || key.namespace === namespace)) throw new Error('injected publication failure');
                    return target.putResourceIfMatch(key, expected, record);
                };
                const value = target[prop];
                return typeof value === 'function' ? value.bind(target) : value;
            },
        })));
    } };
}

describe('N3 FS commit-last and integrity', () => {
    let h;
    let f;
    beforeEach(async () => { h = await makeTempFsEngineHarness(); f = await installFixture(h); });
    afterEach(async () => { await h.cleanup(); });

    test.each(['atri_session_branch', 'atri_timeline_variant', 'atri_timeline_entry', 'atri_session_state', 'atri_session_revision', 'atri_session'])(
        'failed initial publication at %s never exposes a half-created Session', async kind => {
            const core = services(h, failingEngine(h.engine, kind)).core;
            await expect(core.create(h.handle, f.start)).rejects.toThrow('injected publication failure');
            expect(await f.sessionRepo.list(h.handle)).toEqual([]);
            if (kind === 'atri_session') {
                const revisions = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_session_revision', handle: h.handle }));
                const orphan = revisions[0].doc;
                await expect(f.savePointRepo.create(h.handle, { saveId: createNativeId('savePoint'),
                    sessionId: orphan.sessionId, branchId: orphan.branchId, revisionId: orphan.revisionId,
                    kind: 'manual', createdAt: 1 })).rejects.toThrow('committed native session revision');
            }
        },
    );

    test('failed Session HEAD publication cannot be loaded/saved as committed history and is GC-safe', async () => {
        const original = await f.core.create(h.handle, f.start);
        const sessionId = original.session.sessionId;
        const broken = services(h, failingEngine(h.engine, 'atri_session'));
        await expect(broken.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Uncommitted' }))
            .rejects.toThrow('injected publication failure');
        const revisions = await f.sessionRepo.listRevisions(h.handle, sessionId);
        const orphan = revisions.find(revision => revision.revisionId !== original.revision.revisionId);
        expect(orphan).toBeDefined();
        const reloaded = await services(h).core.load(h.handle, sessionId);
        expect(reloaded.revision).toEqual(original.revision);
        expect(reloaded.timeline).toEqual(original.timeline);
        await expect(f.core.load(h.handle, sessionId, { revisionId: orphan.revisionId })).rejects.toThrow('committed native session revision');
        await expect(f.savePointRepo.create(h.handle, { saveId: createNativeId('savePoint'), sessionId,
            branchId: orphan.branchId, revisionId: orphan.revisionId, kind: 'manual', createdAt: 1 }))
            .rejects.toThrow('committed native session revision');
        expect(await f.sessionRepo.gcRevisions(h.handle, sessionId)).toEqual([orphan.revisionId]);
        const resumed = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Committed' });
        expect(resumed.timeline.map(item => item.content)).toEqual(['Opening', 'Committed']);
    });

    test('failed state write does not publish a revision or change any authoritative state', async () => {
        const original = await f.core.create(h.handle, f.start);
        const sessionId = original.session.sessionId;
        const broken = services(h, failingEngine(h.engine, 'atri_session_state', 'atri_progress'));
        await expect(broken.core.updateState(h.handle, sessionId, { atri_progress: { hp: 0 } })).rejects.toThrow('injected publication failure');
        expect(await f.sessionRepo.listRevisions(h.handle, sessionId)).toHaveLength(1);
        expect((await f.core.load(h.handle, sessionId)).states).toEqual(original.states);
    });

    test.each(['atri_timeline', 'atri_knowledge', 'atri_world_state'])(
        'missing %s snapshot fails closed instead of rebuilding from runtime or latest Library', async namespace => {
            const view = await f.core.create(h.handle, f.start);
            const head = namespace === 'atri_knowledge' ? view.revision.knowledgeHead : view.revision.stateHeads[namespace];
            await h.engine.withTransaction(h.handle, tx => tx.deleteResource({ kind: 'atri_session_state',
                handle: h.handle, sessionId: view.session.sessionId, namespace, head }));
            await expect(f.core.load(h.handle, view.session.sessionId)).rejects.toThrow('native session dependency');
        },
    );

    test('resource integrity and cross-message Variant identity are checked on reload', async () => {
        const view = await f.core.create(h.handle, f.start);
        const entry = view.timeline[0];
        const key = { kind: 'atri_timeline_variant', handle: h.handle, sessionId: view.session.sessionId,
            messageId: entry.messageId, variantId: entry.activeVariantId };
        await h.engine.withTransaction(h.handle, async tx => {
            const record = await tx.getResource(key);
            record.doc.content = 'Corrupt';
            await tx.putResource(key, record);
        });
        await expect(f.core.load(h.handle, view.session.sessionId)).rejects.toThrow('integrity mismatch');
        await h.engine.withTransaction(h.handle, async tx => {
            const record = await tx.getResource(key);
            record.doc.messageId = createNativeId('message');
            record.integrity = hashNativeDocument(record.doc);
            await tx.putResource(key, record);
        });
        await expect(f.core.load(h.handle, view.session.sessionId)).rejects.toThrow('Variant identity mismatch');
    });

    test('published message/branch records and Session HEAD cannot bypass snapshot publication', async () => {
        const view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        await expect(f.sessionRepo.saveTimelineEntry(h.handle, { ...view.timeline[0], content: 'Rewrite' }))
            .rejects.toMatchObject({ code: 'native_immutable_conflict' });
        await expect(f.sessionRepo.saveBranch(h.handle, { ...view.graph[0].branch, displayName: 'Rewrite' }))
            .rejects.toMatchObject({ code: 'native_immutable_conflict' });
        await expect(f.sessionRepo.save(h.handle, { ...view.session, headRevisionId: createNativeId('revision') }))
            .rejects.toMatchObject({ code: 'native_session_requires_snapshot' });
        await expect(f.sessionRepo.commitRevision(h.handle, { ...view.revision, revisionId: createNativeId('revision') }))
            .rejects.toMatchObject({ code: 'native_session_requires_snapshot' });
        await expect(f.sessionRepo.deleteBranch(h.handle, sessionId, view.revision.branchId))
            .rejects.toMatchObject({ code: 'native_session_branch_referenced' });
        expect((await f.core.load(h.handle, sessionId)).revision).toEqual(view.revision);
    });

    test('rejects stale HEAD, foreign IDs and reserved state without publishing changes', async () => {
        const view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        await expect(f.core.create(h.handle, { ...f.start, packageVersionId: createNativeId('packageVersion') })).rejects.toThrow('native package version');
        await expect(f.core.create(h.handle, { ...f.start, entryPointId: createNativeId('entryPoint') })).rejects.toThrow('native entry point');
        await expect(f.core.load(h.handle, 'chat.jsonl')).rejects.toThrow('opaque');
        await expect(f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'x' }, { expectedRevisionId: createNativeId('revision') }))
            .rejects.toMatchObject({ code: 'native_session_head_conflict' });
        await expect(f.core.appendTimeline(h.handle, sessionId, { role: 'assistant', actorId: createNativeId('actor') })).rejects.toThrow('exact PackageVersion');
        await expect(f.core.appendTimeline(h.handle, sessionId, { role: 'user', characterId: 'old' })).rejects.toThrow('legacy identity');
        await expect(f.core.updateState(h.handle, sessionId, { atri_knowledge: {} })).rejects.toThrow('Reserved');
        await expect(f.core.updateState(h.handle, sessionId, { plugin: {} })).rejects.toThrow('atri_*');
        const changedWorld = structuredClone(view.states.atri_world_state);
        changedWorld.worlds[f.worldId].worldRevisionId = createNativeId('worldRevision');
        await expect(f.core.updateState(h.handle, sessionId, { atri_world_state: changedWorld })).rejects.toThrow('World dependency mismatch');
        await expect(f.core.switchBranch(h.handle, sessionId, createNativeId('branch'))).rejects.toThrow('native branch');
        await expect(f.core.forkBranch(h.handle, sessionId, { revisionId: createNativeId('revision') })).rejects.toThrow('committed native session revision');
        expect((await f.core.load(h.handle, sessionId)).revision).toEqual(view.revision);
    });
    test.each(['auto', 'quick', 'manual'])('%s SavePoint is an immutable Native Revision pointer', async kind => {
        const view = await f.core.create(h.handle, f.start);
        const save = await f.core.createSavePoint(h.handle, view.session.sessionId, { kind });
        expect(save.revisionId).toBe(view.revision.revisionId);
        expect(save.kind).toBe(kind);
        await expect(f.savePointRepo.create(h.handle, { ...save, displayName: 'Mutated' }))
            .rejects.toMatchObject({ code: 'native_immutable_conflict' });
    });

});
