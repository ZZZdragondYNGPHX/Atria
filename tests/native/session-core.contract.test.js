import { CONTRACT_HARNESSES, makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId, isNativeId, NATIVE_RESOURCE_KINDS } from '../../src/native/index.js';
import { sessionFixture, installFixture, services, knowledgeSnapshot, bindingFor, publishKnowledge } from './helpers/session-fixture.js';

describe.each(CONTRACT_HARNESSES)('N3 Native Session Core - $name', ({ make }) => {
    let h;
    let f;
    beforeEach(async () => { h = await make(); f = await installFixture(h); });
    afterEach(async () => { await h.cleanup(); });

    test('Checkpoint A: exact Package -> EntryPoint -> Timeline -> Branch -> Revision -> reload', async () => {
        const { core, start } = f;
        let view = await core.create(h.handle, start);
        const sessionId = view.session.sessionId;
        const rootBranchId = view.revision.branchId;
        const initialRevisionId = view.revision.revisionId;
        const openingId = view.timeline[0].messageId;
        expect(view.states.atri_world_state.worlds[f.worldId]).toEqual({
            worldRevisionId: f.worldRevisionId, state: { hp: 8, location: 'harbor' },
        });
        expect(view.knowledge.bindings[0].source.knowledgeRevisionId).toBe(f.knowledge.revision.knowledgeRevisionId);
        view = await core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Explore' });
        const rootMessageId = view.timeline[1].messageId;
        view = await core.forkBranch(h.handle, sessionId, { displayName: 'Alternate' });
        const childBranchId = view.revision.branchId;
        expect(view.timeline.map(entry => entry.messageId)).toEqual([openingId, rootMessageId]);
        expect(view.graph.find(node => node.branchId === childBranchId).branch.parentBranchId).toBe(rootBranchId);
        view = await core.appendTimeline(h.handle, sessionId, { role: 'assistant', content: 'Child route' });
        view = await core.addVariant(h.handle, sessionId, view.timeline[2].messageId, { content: 'Child alternate' });
        view = await core.updateState(h.handle, sessionId, { atri_test: { hp: 4 } });
        const revisionId = view.revision.revisionId;
        const reloaded = await services(h).core.load(h.handle, sessionId);
        expect(reloaded.revision).toEqual(view.revision);
        expect(reloaded.timeline).toEqual(view.timeline);
        expect(reloaded.states.atri_test).toEqual({ hp: 4 });
        expect(reloaded.worlds[0].revision.worldRevisionId).toBe(f.worldRevisionId);
        expect(reloaded.session.packageVersionId).toBe(start.packageVersionId);
        expect(reloaded.knowledge).toEqual(view.knowledge);
        for (const entry of reloaded.timeline) {
            expect(isNativeId(entry.messageId, 'message')).toBe(true);
            expect(isNativeId(entry.branchId, 'branch')).toBe(true);
            expect(entry.variantIds.every(id => isNativeId(id, 'variant'))).toBe(true);
        }
        expect(isNativeId(revisionId, 'revision')).toBe(true);
        const initial = await core.load(h.handle, sessionId, { revisionId: initialRevisionId });
        expect(initial.timeline.map(entry => entry.content)).toEqual(['Opening']);
        const root = await core.switchBranch(h.handle, sessionId, rootBranchId);
        expect(root.timeline.map(entry => entry.content)).toEqual(['Opening', 'Explore']);
        expect(root.states.atri_test).toBeUndefined();
        const child = await core.switchBranch(h.handle, sessionId, childBranchId);
        expect(child.timeline.at(-1).content).toBe('Child alternate');
        expect(child.states.atri_test).toEqual({ hp: 4 });
        // No fork copies of ancestor message records; only three native births.
        const records = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_timeline_entry', handle: h.handle, sessionId }));
        expect(records).toHaveLength(3);
        expect(await f.sessionRepo.gcRevisions(h.handle, sessionId)).toEqual([]);
        await expect(f.sessionRepo.deleteRevision(h.handle, sessionId, initialRevisionId)).rejects.toMatchObject({ code: 'native_session_revision_referenced' });
    });

    test('Variant selection is revision-local; forking an old revision keeps exact selections and state', async () => {
        let view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        const root = view.revision.branchId;
        const messageId = view.timeline[0].messageId;
        const original = view.timeline[0].activeVariantId;
        view = await f.core.updateState(h.handle, sessionId, { atri_progress: { turn: 1 } });
        const oldRevisionId = view.revision.revisionId;
        view = await f.core.addVariant(h.handle, sessionId, messageId, { content: 'Different opening' });
        const alternate = view.timeline[0].activeVariantId;
        await f.core.selectVariant(h.handle, sessionId, messageId, original);
        expect((await f.core.load(h.handle, sessionId)).timeline[0].content).toBe('Opening');
        await f.core.selectVariant(h.handle, sessionId, messageId, alternate);
        const child = await f.core.forkBranch(h.handle, sessionId, { revisionId: oldRevisionId });
        expect(child.timeline[0].variantIds).toEqual([original]);
        expect(child.states.atri_progress).toEqual({ turn: 1 });
        await expect(f.core.selectVariant(h.handle, sessionId, messageId, alternate)).rejects.toThrow('native timeline variant');
        const resumed = await f.core.switchBranch(h.handle, sessionId, root);
        expect(resumed.timeline[0].activeVariantId).toBe(alternate);
        expect((await f.core.load(h.handle, sessionId, { revisionId: oldRevisionId })).timeline[0].activeVariantId).toBe(original);
    });

    test('SavePoints restore coherent state and exact Knowledge after explicit Library upgrade', async () => {
        const snapshot = knowledgeSnapshot('Library rev 1');
        const binding = bindingFor(snapshot, 'library');
        const local = knowledgeSnapshot('Session note');
        const localBinding = bindingFor(local, 'session');
        await publishKnowledge(h, f.knowledgeRepo, snapshot, binding);
        let view = await f.core.create(h.handle, { ...f.start,
            libraryBindingIds: [binding.knowledgeBindingId], sessionBindings: [localBinding], sessionKnowledge: [local] });
        const sessionId = view.session.sessionId;
        const previousKnowledgeHead = view.revision.knowledgeHead;
        const save = await f.core.createSavePoint(h.handle, sessionId, { kind: 'quick' });
        const next = structuredClone(snapshot);
        next.revision.knowledgeRevisionId = createNativeId('knowledgeRevision');
        next.knowledgeBase.currentRevisionId = next.revision.knowledgeRevisionId;
        next.entries[0].content = 'Library rev 2';
        const nextBinding = { ...binding, source: { ...binding.source, knowledgeRevisionId: next.revision.knowledgeRevisionId } };
        await publishKnowledge(h, f.knowledgeRepo, next, nextBinding);
        expect((await services(h).core.load(h.handle, sessionId)).knowledge).toEqual(view.knowledge);
        view = await f.core.updateKnowledge(h.handle, sessionId, {
            libraryBindingIds: [binding.knowledgeBindingId], sessionBindings: [localBinding], sessionKnowledge: [local],
        });
        expect(view.revision.knowledgeHead).not.toBe(previousKnowledgeHead);
        expect(view.knowledge.snapshots.find(item => item.kind === 'library').snapshot.entries[0].content).toBe('Library rev 2');
        await f.core.updateState(h.handle, sessionId, { atri_progress: { turn: 20 } });
        const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId);
        expect(restored.knowledge.snapshots.find(item => item.kind === 'library').snapshot.entries[0].content).toBe('Library rev 1');
        expect(restored.knowledge.snapshots.find(item => item.kind === 'session').snapshot.entries[0].content).toBe('Session note');
        expect(restored.states.atri_progress).toBeUndefined();
        expect(restored.revision.revisionId).not.toBe(save.revisionId);
        expect(await f.savePointRepo.get(h.handle, sessionId, save.saveId)).toEqual(save);
        // Session-owned resolved snapshots do not require Library availability.
        await f.knowledgeRepo.deleteBinding(h.handle, binding.knowledgeBindingId);
        await f.knowledgeRepo.delete(h.handle, snapshot.knowledgeBase.knowledgeBaseId);
        expect((await services(h).core.load(h.handle, sessionId)).knowledge).toEqual(restored.knowledge);
    });

    test('installing a newer PackageVersion never upgrades an existing Session and GC retains its version', async () => {
        const first = await f.core.create(h.handle, f.start);
        const next = sessionFixture();
        next.manifest.packageId = f.start.packageId;
        next.manifest.version = '2.0.0';
        await installFixture(h, next);
        const view = await services(h).core.load(h.handle, first.session.sessionId);
        expect(view.session.packageVersionId).toBe(f.start.packageVersionId);
        expect(view.session.packageContentHash).toBe(first.session.packageContentHash);
        expect(view.worlds).toEqual(first.worlds);
        expect(view.knowledge).toEqual(first.knowledge);
        expect(await f.packageRepo.gcVersions(h.handle, f.start.packageId)).toEqual([]);
    });

    test('concurrent commands from independent repos cannot silently overwrite one HEAD', async () => {
        const view = await f.core.create(h.handle, f.start);
        const options = { expectedRevisionId: view.revision.revisionId };
        const outcomes = await Promise.allSettled([
            f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'user', content: 'A' }, options),
            services(h).core.appendTimeline(h.handle, view.session.sessionId, { role: 'user', content: 'B' }, options),
        ]);
        expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(outcomes.find(item => item.status === 'rejected').reason.code).toBe('native_session_head_conflict');
        expect((await f.core.load(h.handle, view.session.sessionId)).timeline).toHaveLength(2);
    });

    test('empty starts and nested opaque branches are valid without authored World/Knowledge', async () => {
        const fixture = sessionFixture();
        fixture.manifest.worlds = [];
        fixture.manifest.knowledge = [];
        fixture.manifest.knowledgeBindings = [];
        fixture.manifest.entryPoints = [{ entryPointId: fixture.entryPointId, displayName: 'Empty', actorIds: [] }];
        const empty = await installFixture(h, fixture);
        let view = await empty.core.create(h.handle, empty.start);
        expect(view.revision.timelineHead).toBeNull();
        view = await empty.core.forkBranch(h.handle, view.session.sessionId);
        view = await empty.core.forkBranch(h.handle, view.session.sessionId);
        expect(view.graph).toHaveLength(3);
        expect((await services(h).core.load(h.handle, view.session.sessionId)).timeline).toEqual([]);
    });
    test('Native resource round-trip into a fresh FS engine preserves the entire committed Session', async () => {
        let view = await f.core.create(h.handle, f.start);
        view = await f.core.forkBranch(h.handle, view.session.sessionId);
        view = await f.core.addVariant(h.handle, view.session.sessionId, view.timeline[0].messageId, { content: 'Round-trip' });
        const save = await f.core.createSavePoint(h.handle, view.session.sessionId);
        const target = await makeTempFsEngineHarness();
        try {
            const other = services(target);
            const blob = await f.assetStore.readBlob(h.handle, view.session.packageContentHash);
            await other.assetStore.putBlob(target.handle, blob);
            for (const kind of Object.values(NATIVE_RESOURCE_KINDS)) {
                const records = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind, handle: h.handle }));
                await target.engine.withTransaction(target.handle, async tx => {
                    for (const record of records) await tx.putResource({ ...record.key, handle: target.handle }, record);
                });
            }
            const freshEngine = new target.engine.constructor({ directoriesByHandle: () => target.dirs });
            const reopened = await services(target, freshEngine).core.load(target.handle, view.session.sessionId);
            expect(reopened).toEqual(view);
            expect(await other.savePointRepo.get(target.handle, view.session.sessionId, save.saveId)).toEqual(save);
        } finally { await target.cleanup(); }
    });

    test('N5 runtime commit keeps Timeline and durable state coherent across fork, restore and reload', async () => {
        let view = await f.core.create(h.handle, f.start);
        const sessionId = view.session.sessionId;
        const initialRevisionId = view.revision.revisionId;

        view = await f.core.applyRuntimeCommit(h.handle, sessionId, {
            commands: [{ type: 'append', draft: { role: 'user', content: 'N5 user turn' } }],
            statePatch: {
                atri_memory_graph: { nodes: { harbor: { fact: 'open' } } },
                atri_orchestrator_anchors: { active: { capsuleText: 'Plan A' } },
                atri_search_tools_anchors: { result: { query: 'harbor' } },
                atri_variables: { schemaVersion: 1, values: { route: 'A' } },
                'atri_package.runtime': { questFlags: { harborGate: true } },
            },
        }, { expectedRevisionId: initialRevisionId });

        const coherentRevisionId = view.revision.revisionId;
        const userMessageId = view.timeline.at(-1).messageId;
        expect(view.revision.timelineHead.messageId).toBe(userMessageId);
        expect(view.states.atri_variables.values.route).toBe('A');
        expect(view.states.atri_memory_graph.nodes.harbor.fact).toBe('open');
        expect(view.states['atri_package.runtime'].questFlags.harborGate).toBe(true);
        expect(Object.keys(view.revision.stateHeads)).toEqual(expect.arrayContaining([
            'atri_memory_graph',
            'atri_orchestrator_anchors',
            'atri_search_tools_anchors',
            'atri_variables',
            'atri_package.runtime',
        ]));

        const save = await f.core.createSavePoint(h.handle, sessionId, {
            revisionId: coherentRevisionId,
            kind: 'quick',
        });

        view = await f.core.applyRuntimeCommit(h.handle, sessionId, {
            commands: [{ type: 'append', draft: {
                role: 'assistant',
                actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
                content: 'N5 assistant turn',
            } }],
            statePatch: {
                atri_variables: { schemaVersion: 1, values: { route: 'B' } },
                atri_memory_graph: { nodes: { harbor: { fact: 'closed' } } },
            },
        }, { expectedRevisionId: coherentRevisionId });
        expect(view.states.atri_variables.values.route).toBe('B');

        const forked = await f.core.forkBranch(h.handle, sessionId, {
            revisionId: coherentRevisionId,
            expectedRevisionId: view.revision.revisionId,
        });
        expect(forked.timeline.at(-1).messageId).toBe(userMessageId);
        expect(forked.states.atri_variables.values.route).toBe('A');
        expect(forked.states.atri_memory_graph.nodes.harbor.fact).toBe('open');

        const child = await f.core.applyRuntimeCommit(h.handle, sessionId, {
            statePatch: { atri_variables: { schemaVersion: 1, values: { route: 'child' } } },
            deleteNamespaces: ['atri_search_tools_anchors'],
        }, { expectedRevisionId: forked.revision.revisionId });
        expect(child.states.atri_variables.values.route).toBe('child');
        expect(child.states.atri_search_tools_anchors).toBeUndefined();

        const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId, {
            expectedRevisionId: child.revision.revisionId,
        });
        expect(restored.revision.revisionId).not.toBe(coherentRevisionId);
        expect(restored.timeline.at(-1).messageId).toBe(userMessageId);
        expect(restored.states.atri_variables.values.route).toBe('A');
        expect(restored.states.atri_search_tools_anchors.result.query).toBe('harbor');
        expect(restored.states['atri_package.runtime'].questFlags.harborGate).toBe(true);

        const reloaded = await services(h).core.load(h.handle, sessionId);
        expect(reloaded.revision).toEqual(restored.revision);
        expect(reloaded.timeline).toEqual(restored.timeline);
        expect(reloaded.states).toEqual(restored.states);
    });


});
