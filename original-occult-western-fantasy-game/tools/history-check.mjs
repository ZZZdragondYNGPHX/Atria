import assert from 'node:assert/strict';

export async function historyChecks(h) {
    const { queryHistory, historyMetrics } = await h.load('public/shared/native-history-runtime.js');
    const { validateHistory } = await h.load('src/native/history-authority.js');
    const { makeTempSqliteEngineHarness } = await h.load('tests/storage/harness/contract-harness.js');
    const { projectInformation } = await h.load('public/shared/native-information-runtime.js');
    await h.fresh(); await h.create();
    let s = h.session(), svc = h.svc, handle = h.fsHandle, owned = null, serial = 0;
    const checkpoints = [], restores = [], work = [], counts = { committed: 0, clockMutations: 0 };
    const hist = () => s.states.atri_lifecycle.history;
    const envelope = { schemaVersion: 1, narrative: 'The declared world change is recorded.', outcomes: [], diagnostics: [] };
    const act = async (input, outcome = 'automatic') => {
        const before = s, beforeTurns = hist().turns;
        s = await svc.core.appendTimeline(handle, s.session.sessionId, { role: 'user', content: 'History integration action.' });
        const prepared = await svc.core.prepareAuthorityTurn(handle, s, { transactionId: 'opening.wait', input });
        assert.equal(prepared.prepared.receipt.result.outcome, outcome); work.push(prepared.prepared.work);
        const request = { invocationId: 'history-check-' + ++serial, authorityProof: prepared.proof, envelope };
        const options = { expectedRevisionId: s.revision.revisionId };
        s = await svc.core.finalizeTurn(handle, s.session.sessionId, request, options);
        validateHistory(s);
        if (outcome === 'automatic') counts.committed++;
        if (s.states.atri_lifecycle.clocks.world !== before.states.atri_lifecycle.clocks.world) {
            counts.clockMutations++; assert.equal(hist().turns, beforeTurns + 1);
        }
        return { request, options, before };
    };
    const op = (operation, input) => act({ minutes: 0, history: { operation, [operation.replaceAll('.', '_')]: input } });
    const query = q => queryHistory(s, q);
    const exported = async () => {
        const save = await svc.saveSystem.manualSave(handle, s.session.sessionId);
        return svc.saveSystem.exportSnapshot(handle, s.session.sessionId, save.saveId);
    };
    const restore = async (label, make) => {
        const source = s, container = await exported(), target = await make(), next = h.services(target);
        await next.packageInstaller.install(target.handle, h.archive, { grantedPermissions: ['generation'] });
        const restored = await next.saveSystem.importSave(target.handle, container.archive);
        assert.deepEqual(restored.states, source.states, label + ' complete authoritative equivalence');
        assert.deepEqual(restored.timeline, source.timeline);
        assert.equal(restored.session.sessionId, source.session.sessionId);
        if (owned) await owned.cleanup();
        owned = target; svc = next; handle = target.handle; s = restored; restores.push(label);
        return container.archive.length;
    };
    try {
        const identity = query({ kind: 'fact', facet: 'actor', value: h.manifest.actors[0].actorId }).items.find(f => f.key === 'protagonist.identity');
        assert(identity);
        const privateId = Object.values(hist().facts).find(f => !f.public).id;
        assert.equal(query({ id: privateId }).items.length, 0);
        const beforeFailed = structuredClone(s);
        await assert.rejects(svc.core.prepareAuthorityTurn(handle, s, { transactionId: 'opening.wait', input: { minutes: 1, history: { operation: 'invent' } } }));
        assert.deepEqual(await svc.core.load(handle, s.session.sessionId), beforeFailed);
        await op('artifact.create', { kind: 'letter', title: 'First Eastbank letter', content: 'I record my initial public identity; this is an attributed document, not proof of external allegations.', sourceId: identity.id, parentId: '' });
        const letter = query({ kind: 'artifact' }).items[0];
        await op('artifact.create', { kind: 'contract', title: 'Verifier deposit memorandum', content: 'An authored memorandum concerning the first letter.', sourceId: identity.id, parentId: letter.id });
        const copy = query({ kind: 'artifact' }).items[1];
        assert.equal(copy.parentId, letter.id);
        await op('hook.create', { title: 'Trace the letter if it disappears', sourceId: letter.id });
        const hook = query({ kind: 'hook' }).items[0];
        const memoryTarget = hist().hot[0].id;
        await op('memory.mark', { id: memoryTarget, marked: true, journaled: true });
        const precise = structuredClone(hist().facts[identity.id]);
        await restore('SqliteEngine start', makeTempSqliteEngineHarness);
        const beginTurns = hist().turns, beginTick = s.states.atri_lifecycle.clocks.world;
        let seed = 731;
        for (let turn = 1; turn <= 1000; turn++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const replay = await act({ minutes: 5760 + seed % 1440 }); // actual rent/clock/obligation mutations, not journal padding
            if (turn === 1) {
                const again = await svc.core.finalizeTurn(handle, s.session.sessionId, replay.request, replay.options);
                assert.deepEqual(again, s, 'recent exact retry is idempotent');
            }
            if ([250, 500, 750, 1000].includes(turn)) {
                const before = structuredClone(hist()); await op('compact', {});
                assert.equal(hist().turns, before.turns, 'compaction is not a meaningful turn');
                const bytes = await restore('SqliteEngine checkpoint ' + turn, makeTempSqliteEngineHarness);
                const metrics = historyMetrics(s); checkpoints.push({ turn, exportBytes: bytes, ...metrics });
                console.error('HISTORY CHECKPOINT', JSON.stringify(checkpoints.at(-1)));
                assert.equal(query({ id: letter.id }).items[0].content, letter.content);
            }
        }
        assert.equal(hist().turns - beginTurns, 1000);
        assert(s.states.atri_lifecycle.clocks.world - beginTick >= 10 * 365 * 1440);
        assert(checkpoints.at(-1).stateBytes < checkpoints[0].stateBytes * 1.6, 'whole active snapshot does not retain linear turn tombstones');
        assert.equal(s.states.atri_lifecycle.taskTombstones.filter(t => t.kind === 'turn').length, 0);
        assert(checkpoints.at(-1).historyBytes < checkpoints[0].historyBytes * 1.6, 'history is not proportional to a 4x turn increase');
        assert(checkpoints.at(-1).projectionBytes < checkpoints[0].projectionBytes * 1.2);
        assert(checkpoints.at(-1).exportBytes < checkpoints[0].exportBytes * 1.6, 'portable checkpoint save is not proportional to 4x turns');
        assert(checkpoints.every(c => c.tiers.hot <= 8 && c.tiers.warm <= 24 && c.tiers.cold <= 32 && c.tiers.archive <= 16));
        assert(checkpoints.every(c => c.timelineItems < 128));
        const oldCursor = query({ kind: 'fact', limit: 1 }).next;
        await op('artifact.change', { id: letter.id, status: 'lost' });
        await restore('FsEngine before hook activation', h.makeTempFsEngine);
        await op('hook.change', { id: hook.id, status: 'active' });
        await restore('SqliteEngine after hook activation', makeTempSqliteEngineHarness);
        await act({ minutes: 100 * 365 * 1440 });
        await op('artifact.change', { id: letter.id, status: 'held' });
        const recovered = query({ id: letter.id }).items[0];
        assert.equal(recovered.content, letter.content); assert.equal(recovered.creatorId, letter.creatorId);
        assert.equal(recovered.tick, letter.tick); assert.equal(recovered.status, 'held');
        assert.deepEqual(recovered.provenance.map(p => p.status), ['held', 'lost', 'held']);
        assert.equal(query({ id: hook.id }).items[0].status, 'active');
        assert.equal(query({ id: memoryTarget, memory: true }).items[0].memory.clarity, 'clear');
        assert.deepEqual(hist().facts[identity.id], precise, 'subjective recall cannot rewrite canonical truth');
        for (const facet of ['year', 'actor', 'family', 'location', 'institution', 'case', 'claim', 'era', 'artifact']) {
            const key = Object.keys(hist().index).find(k => k.startsWith(facet + ':'));
            if (key) assert(query({ facet, value: key.slice(facet.length + 1) }).scanned <= 128);
        }
        if (oldCursor) assert.throws(() => query({ kind: 'fact', limit: 1, cursor: oldCursor }));
        for (const input of [ { minutes: 0, history: { operation: 'artifact.change', artifact_change: { id: 'missing', status: 'held' } } },
            { minutes: 0, history: { operation: 'artifact.create', artifact_create: { kind: 'letter', title: 'Leak', content: 'Hidden evidence', sourceId: privateId, parentId: '' } } } ]) {
            s = await svc.core.appendTimeline(handle, s.session.sessionId, { role: 'user', content: 'Invalid history candidate.' });
            const before = structuredClone(s); await assert.rejects(svc.core.prepareAuthorityTurn(handle, s, { transactionId: 'opening.wait', input }));
            assert.deepEqual(await svc.core.load(handle, s.session.sessionId), before);
        }
        const beforeNoop = hist().turns; await act({ minutes: 0 }, 'impossible'); assert.equal(hist().turns, beforeNoop);
        for (const view of s.manifest.runtime.experienceContract.informationRuntime.views.filter(v => v.exposure.includes('context'))) h.safe(projectInformation(s, view.id, { purpose: 'context' }));
        await restore('FsEngine century analogue', h.makeTempFsEngine);
        await act({ minutes: 1440 });
        return { phase: 'Phase 2 history-only development gate', counts, continuousAuthoritativeTurns: 1000, minimumInWorldYears: 10,
            centuryRetrievalAnalogue: true, checkpoints, restores, final: historyMetrics(s),
            limits: ['No NPC/family lifecycle or renewable-content Gate A coverage', 'No final Century/Gate B/C claim', 'Immutable repository revisions and explicitly retained branches/save points are not garbage-collected'],
            maxWork: Object.fromEntries(['readGrants', 'appCommands', 'effects', 'historySources', 'historyRecordScans', 'historyLogicalBytes'].map(k => [k, Math.max(...work.map(w => w[k]))])) };
    } finally { if (owned) await owned.cleanup(); }
}
