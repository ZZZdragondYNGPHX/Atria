import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, services, sessionFixture } from './helpers/session-fixture.js';
import { runFixture } from './helpers/run-fixture.js';
import { TIMELINE_INDEX_NAMESPACE } from '../../public/shared/native-timeline-index.js';

describe.each(CONTRACT_HARNESSES)('Lossless shared storage — $name', ({ make }) => {
    test('5k range visits bounded index paths; SavePoint branches share ancestors and original text', async () => {
        const h = await make();
        try {
            const f = await installFixture(h), first = await f.core.create(h.handle, f.start);
            const added = Array.from({ length: 4999 }, (_, i) => f.core._newEntry(first, { role: 'user', content: 'Original ' + i }, i + 1));
            let view = await f.core._publish(h.handle, first, { timeline: [...first.timeline, ...added.map(item => item.entry)],
                entries: added.map(item => item.entry), variants: added.map(item => item.variant) });
            let reads = 0;
            const engine = { withTransaction: (handle, run) => h.engine.withTransaction(handle, tx => run(new Proxy(tx, { get(target, name) {
                if (name === 'getResource') return key => { reads++; return target.getResource(key); };
                const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
            } }))) };
            const ranged = services(h, engine);
            const page = await ranged.sessionRepo.readTimelineRange(h.handle, view.session.sessionId, { fromSequence: 3051, limit: 20 });
            expect(page.entries.map(item => item.content)).toEqual(view.timeline.slice(3051, 3071).map(item => item.content));
            expect(reads).toBeLessThan(60);
            const root = view.timelineRoot;
            const save = await f.core.createSavePoint(h.handle, view.session.sessionId, { displayName: 'Harbor choice' });
            const fork = await f.core.restoreSavePoint(h.handle, view.session.sessionId, save.saveId);
            expect(fork.revision.branchId).not.toBe(view.revision.branchId);
            expect(fork.timelineRoot).toEqual(root);
            expect(fork.graph.at(-1).branch).toMatchObject({ sourceSaveId: save.saveId, routeNumber: 2 });
            view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'assistant', content: 'Independent continuation' });
            expect((await f.core.load(h.handle, view.session.sessionId, { revisionId: save.revisionId })).timeline).toHaveLength(5000);
            const roots = await f.sessionRepo.reachabilitySnapshot(h.handle, view.session.sessionId);
            expect(roots.keys.some(key => key.namespace === TIMELINE_INDEX_NAMESPACE)).toBe(true);
            expect(roots.revisionIds).toContain(save.revisionId);
            expect(await f.sessionRepo.gcRevisions(h.handle, view.session.sessionId)).toEqual([]);
        } finally { await h.cleanup(); }
    }, 30000);

    test('World Delta replay and materialization preserve all historical states; automatic expiry protects manual anchors', async () => {
        const h = await make();
        try {
            const fixture = sessionFixture();
            fixture.manifest.worlds[0].revision.baseline.lore = Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['field' + i, 'Raw world history '.repeat(20)]));
            const f = await installFixture(h, fixture); let view = await f.core.create(h.handle, f.start);
            const initial = view, manual = await f.core.createSavePoint(h.handle, view.session.sessionId);
            for (let hp = 7; hp > -33; hp--) {
                const states = structuredClone(view.states); states.atri_world_state.worlds[f.worldId].state.hp = hp;
                view = await f.core._publish(h.handle, view, { states });
            }
            const encoded = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_session_state', handle: h.handle, sessionId: view.session.sessionId, namespace: 'atri_world_state' }));
            expect(encoded.some(item => item.doc.kind === 'delta')).toBe(true);
            expect(encoded.filter(item => item.doc.kind === 'snapshot').length).toBeGreaterThan(1);
            expect((await f.core.load(h.handle, view.session.sessionId, { revisionId: initial.revision.revisionId })).states.atri_world_state).toEqual(initial.states.atri_world_state);
            await f.sessionRepo.setExperienceMetadata(h.handle, view.session.sessionId, { expectedRevisionId: view.revision.revisionId, autoSavePolicy: { enabled: true, intervalMs: 1000, retain: 1 } });
            view = await f.core.load(h.handle, view.session.sessionId);
            await f.savePointRepo.maybeAutomatic(h.handle, view, { now: 100000 });
            await f.savePointRepo.maybeAutomatic(h.handle, view, { now: 102000 });
            const saves = await f.savePointRepo.list(h.handle, view.session.sessionId);
            expect(saves.filter(item => item.kind === 'auto')).toHaveLength(1);
            expect(saves.some(item => item.saveId === manual.saveId)).toBe(true);
            expect((await f.sessionRepo.reachabilitySnapshot(h.handle, view.session.sessionId)).revisionIds).toHaveLength(41);
        } finally { await h.cleanup(); }
    }, 30000);

    test('declared choices save pre-action state; ironman death retains a read-only terminal archive', async () => {
        const h = await make();
        try {
            const f = await runFixture(h, 'http://127.0.0.1:1', fixture => { fixture.logic.transactions[0].savePointBefore = true; });
            let base = await f.begin();
            base = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Make the choice' });
            const prepared = await f.core.prepareAuthorityTurn(h.handle, base, f.selection);
            const save = (await f.savePointRepo.list(h.handle, base.session.sessionId)).find(item => item.displayName === 'Before choice');
            expect(save.revisionId).toBe(base.revision.revisionId);
            await f.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'choice', authorityProof: prepared.proof,
                envelope: { schemaVersion: 1, narrative: 'A choice follows.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId });
            const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId);
            expect(restored.states.atri_lifecycle.domains).toEqual(base.states.atri_lifecycle.domains);
            const iron = await runFixture(h, 'http://127.0.0.1:1'); base = await iron.begin('ironman');
            base = await iron.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Final choice' });
            const oldSave = await iron.core.createSavePoint(h.handle, base.session.sessionId);
            iron.selection.input.amount = 8;
            const fatal = await iron.core.prepareAuthorityTurn(h.handle, base, iron.selection);
            const dead = await iron.core.finalizeTurn(h.handle, base.session.sessionId, { invocationId: 'death', authorityProof: fatal.proof,
                envelope: { schemaVersion: 1, narrative: 'The final chapter.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: base.revision.revisionId });
            expect((await services(h).core.load(h.handle, base.session.sessionId)).timeline).toEqual(dead.timeline);
            expect(await iron.core.runStatus(h.handle, base.session.sessionId)).toMatchObject({ status: 'terminal', cleanup: 'archived' });
            expect(await iron.savePointRepo.get(h.handle, base.session.sessionId, oldSave.saveId)).not.toBeNull();
            await expect(iron.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Revive' })).rejects.toThrow('terminal');
            await expect(iron.core.restoreSavePoint(h.handle, base.session.sessionId, oldSave.saveId)).rejects.toThrow('terminal');
            const roots = await iron.sessionRepo.reachabilitySnapshot(h.handle, base.session.sessionId);
            expect(roots.terminal).toBe(true); expect(roots.revisionIds).toContain(base.revision.revisionId);
        } finally { await h.cleanup(); }
    });
});
