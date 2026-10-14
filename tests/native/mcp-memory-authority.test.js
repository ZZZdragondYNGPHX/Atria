import { jest } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { NativeMemoryAuthority } from '../../src/native/memory-authority.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { registerVisualWake } from '../../src/native/visual-events.js';
import { NATIVE_PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('Native headless Memory — %s', (_name, make) => {
    let h, f, authority, settingsRepo, base, messageId, source, wake;
    beforeEach(async () => {
        h = await make(); f = await installFixture(h); base = await f.core.create(h.handle, f.start);
        base = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Roland holds the sword at the harbor.' });
        messageId = base.timeline.at(-1).messageId;
        settingsRepo = new SettingsRepo({ engine: h.engine });
        await settingsRepo.save(h.handle, { atri_capabilities: { memory_graph: { enabled: true, sourceWritesEnabled: true } } });
        authority = new NativeMemoryAuthority({ core: f.core, settingsRepo });
        source = (await authority.sources(h.handle, { sessionId: base.session.sessionId, messageIds: [messageId] })).sources[0];
        wake = jest.fn(async () => {}); registerVisualWake(h.engine, wake);
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });
    const input = async (commitId = 'memory-commit') => {
        const observed = await authority.observe(h.handle, { sessionId: base.session.sessionId });
        return { sessionId: base.session.sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId,
            expectedLedgerFingerprint: observed.ledgerFingerprint, expectedSettingsFingerprint: observed.settingsFingerprint, commitId, messageIds: [messageId],
            facts: [{ action: 'create', type: 'explicit', text: 'Roland holds the sword.', evidence: [{ episodeId: source.episodeId, excerpt: 'Roland holds the sword' }] }],
            graph: [{ action: 'entity', ref: 'roland', name: 'Roland', type: 'Character', evidence: [{ episodeId: source.episodeId, excerpt: 'Roland' }] },
                { action: 'entity', ref: 'sword', name: 'Sword', type: 'Item', evidence: [{ episodeId: source.episodeId, excerpt: 'sword' }] },
                { action: 'relation', sourceId: 'roland', targetId: 'sword', predicate: 'holds', factIndex: 0, evidence: [{ episodeId: source.episodeId, excerpt: 'holds the sword' }] }] };
    };
    test('source-bound facts/entities/relations commit through one Native Session revision without background models', async () => {
        const body = await input(), result = await authority.apply(h.handle, body);
        expect(result.commitReceipt.status).toBe('committed'); expect(result.identity.revisionId).not.toBe(base.revision.revisionId);
        const loaded = await f.core.observe(h.handle, body.sessionId);
        expect(loaded.timeline).toEqual(base.timeline); expect(loaded.states[NATIVE_PROVENANCE_NAMESPACE].scopeId).toBe('native:' + body.sessionId);
        const read = await authority.observe(h.handle, { sessionId: body.sessionId });
        expect(read.facts.values).toHaveLength(1); expect(read.entities.values).toHaveLength(2); expect(read.relations.values).toHaveLength(1);
        expect(read.facts.values[0]).toMatchObject({ type: 'explicit', status: 'active' }); expect(wake).not.toHaveBeenCalled();
        const replay = await authority.apply(h.handle, body);
        expect(replay.reconciled).toBe(true); expect(replay.identity.revisionId).toBe(result.identity.revisionId);
        expect((await authority.observe(h.handle, { sessionId: body.sessionId })).facts.values).toHaveLength(1);
    });
    test('pure observation and source preview never persist provenance or repair counters', async () => {
        const before = await f.sessionRepo.get(h.handle, base.session.sessionId), transaction = h.engine.withTransaction.bind(h.engine), writes = [];
        jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => transaction(handle, tx => operation(new Proxy(tx, { get(target, key) {
            if (['putResource', 'deleteResource', 'putBlob', 'deleteBlob'].includes(key)) return () => { writes.push(key); throw new Error('Read attempted persistence'); };
            const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        } }))));
        expect((await authority.observe(h.handle, { sessionId: before.sessionId })).readOnly).toBe(true);
        expect((await authority.sources(h.handle, { sessionId: before.sessionId, messageIds: [messageId] })).sources[0].episodeId).toBe(source.episodeId);
        expect(writes).toEqual([]); expect(await f.sessionRepo.get(h.handle, before.sessionId)).toEqual(before);
    });
    test('forged evidence and authoritative origins fail without publishing staged source capture', async () => {
        const body = await input(); body.facts[0].evidence[0].excerpt = 'This quotation is absent';
        await expect(authority.apply(h.handle, body)).rejects.toThrow(/quote/);
        expect((await f.core.observe(h.handle, body.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
        body.facts[0].type = 'authoritative'; await expect(authority.apply(h.handle, body)).rejects.toThrow(/Untrusted/);
        expect((await f.core.observe(h.handle, body.sessionId)).states[NATIVE_PROVENANCE_NAMESPACE]).toBeUndefined();
    });
    test('source consent and exact Session/ledger/branch guards are required and stale writes conflict', async () => {
        const body = await input(); await settingsRepo.save(h.handle, { atri_capabilities: { memory_graph: { enabled: true, sourceWritesEnabled: false } } });
        await expect(authority.apply(h.handle, body)).rejects.toMatchObject({ code: 'native_memory_source_conflict' });
        const disabled = await input('disabled'); await expect(authority.apply(h.handle, disabled)).rejects.toThrow(/opt-in/);
        await settingsRepo.save(h.handle, { atri_capabilities: { memory_graph: { enabled: true, sourceWritesEnabled: true } } });
        const stale = await input('stale'); await f.core.appendTimeline(h.handle, body.sessionId, { role: 'user', content: 'Concurrent input' });
        await expect(authority.apply(h.handle, stale)).rejects.toMatchObject({ code: 'native_memory_source_conflict' });
    });
    test('two writers at one reviewed HEAD cannot both publish or silently replace each other', async () => {
        const first = await input('concurrent-one'), second = { ...first, commitId: 'concurrent-two' };
        const results = await Promise.allSettled([authority.apply(h.handle, first), authority.apply(h.handle, second)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')[0].reason.code).toBe('native_memory_source_conflict');
        expect((await authority.observe(h.handle, { sessionId: first.sessionId })).facts.values).toHaveLength(1);
    });
    test('headless Graph CRUD, links and rollup reuse original Floor-State and guarded source semantics', async () => {
        const sessionId = base.session.sessionId;
        let serial = 0;
        const graphWrite = async (kind, operation) => {
            const observed = await authority.observeGraph(h.handle, { sessionId });
            return authority.applyGraph(h.handle, { sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId,
                expectedGraphFingerprint: observed.graphFingerprint, expectedSettingsFingerprint: observed.settingsFingerprint,
                commitId: 'graph-' + ++serial, messageIds: [messageId], operation }, kind);
        };
        expect((await authority.observeGraph(h.handle, { sessionId })).initialized).toBe(false);
        const first = await graphWrite('node.create', { type: 'event', title: 'First', fields: { summary: 'Roland holds the sword' } });
        const firstId = first.result.id;
        const secondId = (await graphWrite('node.create', { type: 'event', title: 'Second', fields: { summary: 'At the harbor' } })).result.id;
        expect(firstId).toBe('n_1'); expect(secondId).toBe('n_2');
        expect((await graphWrite('relation.upsert', { source: { id: firstId }, links: [{ target: { id: secondId }, relation: 'allied_with', direction: 'outgoing' }] })).result.applied).toBe(1);
        let graph = await authority.observeGraph(h.handle, { sessionId });
        expect(graph.nodes.total).toBe(2); expect(graph.edges.values.filter(edge => edge.type === 'allied_with')).toHaveLength(1);
        await graphWrite('node.edit', { id: firstId, title: 'Reviewed title', setFields: { summary: 'Updated source-bound summary' }, clearFields: [] });
        expect((await authority.observeGraph(h.handle, { sessionId })).nodes.values.find(node => node.id === firstId).title).toBe('Reviewed title');
        expect((await graphWrite('relation.delete', { source: { id: firstId }, target: { id: secondId }, relation: 'allied_with' })).result.removed).toBe(1);
        const rollup = await graphWrite('compact', { type: 'event', childIds: [firstId, secondId], summary: 'Roland and the sword at the harbor', fields: {} });
        graph = await authority.observeGraph(h.handle, { sessionId });
        expect(graph.nodes.values.find(node => node.id === rollup.result.rollupNodeId)).toMatchObject({ semanticRollup: true, semanticDepth: 1 });
        expect(graph.edges.values.filter(edge => edge.type === 'semantic_contains')).toHaveLength(2);
        const stored = await f.core.observe(h.handle, sessionId);
        expect(stored.states.atri_memory_graph.nodes[firstId].memoryOsEvidence.scopeId).toBe('native:' + sessionId);
        expect(stored.states.atri_memory_graph__meta).toBeDefined(); expect(stored.timeline).toEqual(base.timeline);
        await graphWrite('node.delete', { id: rollup.result.rollupNodeId });
        expect((await authority.observeGraph(h.handle, { sessionId })).nodes.total).toBe(0);
        expect(wake).not.toHaveBeenCalled();
    });
    test('Graph commits reconcile by receipt and restored branches reject old guards while preserving prior revisions', async () => {
        const sessionId = base.session.sessionId;
        const prepareGraph = async (commitId, operation) => {
            const graph = await authority.observeGraph(h.handle, { sessionId });
            return { sessionId, expectedRevisionId: graph.identity.revisionId, expectedBranchId: graph.identity.branchId,
                expectedGraphFingerprint: graph.graphFingerprint, expectedSettingsFingerprint: graph.settingsFingerprint, commitId, messageIds: [messageId], operation };
        };
        const create = await prepareGraph('graph-receipt', { type: 'event', title: 'Source', fields: { summary: 'Original graph' } });
        const made = await authority.applyGraph(h.handle, create, 'node.create');
        const replay = await authority.applyGraph(h.handle, create, 'node.create');
        expect(replay.reconciled).toBe(true); expect(replay.identity.revisionId).toBe(made.identity.revisionId);
        expect((await authority.observeGraph(h.handle, { sessionId })).nodes.total).toBe(1);
        const save = await f.core.createSavePoint(h.handle, sessionId, { expectedRevisionId: made.identity.revisionId });
        const changed = await authority.applyGraph(h.handle, await prepareGraph('graph-edit', { id: made.result.id, title: 'Later Graph', setFields: {} }), 'node.edit');
        const stale = await prepareGraph('graph-stale', { id: made.result.id, title: 'Old branch overwrite', setFields: {} });
        const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId, { expectedRevisionId: changed.identity.revisionId });
        await expect(authority.applyGraph(h.handle, stale, 'node.edit')).rejects.toMatchObject({ code: 'native_memory_graph_conflict' });
        expect(restored.revision.branchId).not.toBe(changed.identity.branchId);
        expect((await authority.observeGraph(h.handle, { sessionId })).nodes.values[0].title).not.toBe('Later Graph');
        expect((await f.core.observe(h.handle, sessionId, { revisionId: changed.identity.revisionId })).states.atri_memory_graph.nodes[made.result.id].title).toBe('Later Graph');
    });
});
