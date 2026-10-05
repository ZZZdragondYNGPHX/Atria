import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { EMPTY_PERSONA_FINGERPRINT as empty, PERSONA_NAMESPACE as NS } from '../../src/native/persona-contract.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { installFixture } from './helpers/session-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';

const content = name => ({ name, description: 'Player testimony', avatar: null, managementNotes: 'secret note' });
export async function personaFixture(h) {
    const f = await installFixture(h);
    const personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore });
    f.core.personas = personas;
    const a = await personas.create(h.handle, { content: content('Alice'), expectedFingerprint: empty });
    const b = await personas.create(h.handle, { content: content('Bob'), expectedFingerprint: empty });
    await personas.setDefault(h.handle, { selection: a.ref, expectedFingerprint: empty });
    return { ...f, personas, a, b };
}
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Persona Session %s', (_name, make) => {
    test('default/explicit none capture, immutable input, switch/send CAS, branch/retry/save identity', async () => {
        const h = await make();
        try {
            const { core, personas, start, a, b, saveSystem } = await personaFixture(h);
            let base = await core.create(h.handle, start), id = base.session.sessionId;
            const none = await core.create(h.handle, { ...start, personaSelection: null });
            expect(none.states[NS].solo).toBeNull(); expect(base.states[NS].solo.snapshot.name).toBe('Alice');
            const original = hashNativeDocument(base.states[NS]);
            await personas.revise(h.handle, { personaId: a.ref.personaId, content: content('Renamed'), expectedFingerprint: a.expectedFingerprint });
            expect(hashNativeDocument((await core.load(h.handle, id)).states[NS])).toBe(original);
            const sent = await core.applyTimelineCommands(h.handle, id, [{ type: 'append', draft: { role: 'user', content: 'Hello' } }], { expectedRevisionId: base.revision.revisionId });
            expect(sent.timeline.at(-1).metadata.atri_player_identity.name).toBe('Alice');
            expect(JSON.stringify(sent.states[NS])).not.toContain('secret note');
            const reply = await core.appendTimeline(h.handle, id, { role: 'assistant', content: 'Answer' }, { expectedRevisionId: sent.revision.revisionId });
            const selected = await core.selectPersona(h.handle, { sessionId: id, selection: b.ref, expectedRevisionId: reply.revision.revisionId });
            const retried = await core.retryReply(h.handle, id, { messageId: reply.timeline.at(-1).messageId, expectedRevisionId: selected.revision.revisionId });
            expect(retried.states[NS].solo.snapshot.name).toBe('Alice');
            expect(retried.timeline.at(-1)).toEqual(sent.timeline.at(-1));
            base = retried;
            const race = await Promise.allSettled([
                core.selectPersona(h.handle, { sessionId: id, selection: b.ref, expectedRevisionId: base.revision.revisionId }),
                core.applyTimelineCommands(h.handle, id, [{ type: 'append', draft: { role: 'user', content: 'Race' } }], { expectedRevisionId: base.revision.revisionId }),
            ]);
            expect(race.filter(item => item.status === 'fulfilled')).toHaveLength(1);
            const current = await core.load(h.handle, id);
            await expect(core.updateState(h.handle, id, { [NS]: { forged: true } }, { expectedRevisionId: current.revision.revisionId })).rejects.toThrow('Reserved');
            await expect(core.appendTimeline(h.handle, id, { role: 'user', content: 'Forged', metadata: { atri_player_identity: {} } })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            await expect(personas.delete(h.handle, { personaId: a.ref.personaId, expectedFingerprint: (await personas.get(h.handle, { personaId: a.ref.personaId })).expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_referenced' });
            const exported = await saveSystem.exportSession(h.handle, id);
            expect(exported.save.schemaVersion).toBe(3);
        } finally { await h.cleanup(); }
    });
    test('legacy reads never backfill and selection refuses active/cancelling tasks', async () => {
        const h = await make(); let release;
        try {
            const f = await installFixture(h), old = await f.core.create(h.handle, f.start), id = old.session.sessionId;
            const personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore }); f.core.personas = personas;
            const resource = await personas.create(h.handle, { content: content('A'), expectedFingerprint: empty });
            expect((await f.core.readPersona(h.handle, id)).legacyUnbound).toBe(true);
            expect((await f.core.load(h.handle, id, { revisionId: old.revision.revisionId })).states).not.toHaveProperty(NS);
            const op = nativeTaskScheduler.submit({ owner: h.handle, anchor: { sessionId: id }, executionClass: 'interactive', resources: [id], key: 'persona:' + id, fingerprint: 'one', fresh: async () => true,
                run: () => new Promise(resolve => { release = resolve; }), finalize: async value => value });
            await new Promise(resolve => setImmediate(resolve));
            await expect(f.core.selectPersona(h.handle, { sessionId: id, selection: resource.ref, expectedRevisionId: old.revision.revisionId })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            nativeTaskScheduler.cancel(h.handle, op.operationId);
            await expect(op.result).rejects.toMatchObject({ code: 'operation_cancelled' });
            await expect(f.core.selectPersona(h.handle, { sessionId: id, selection: resource.ref, expectedRevisionId: old.revision.revisionId })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            release({}); await new Promise(resolve => setImmediate(resolve));
            const selected = await f.core.selectPersona(h.handle, { sessionId: id, selection: resource.ref, expectedRevisionId: old.revision.revisionId });
            expect(selected.states[NS].solo.snapshot.name).toBe('A');
            expect((await f.core.load(h.handle, id, { revisionId: old.revision.revisionId })).states).not.toHaveProperty(NS);
        } finally { release?.({}); await h.cleanup(); }
    });
});

test('typed transaction retry and beginStory preserve exact accepted user identity', async () => {
    const { authorityTurnFixture } = await import('./helpers/authority-turn-fixture.js');
    const { runFixture } = await import('./helpers/run-fixture.js');
    const { jest } = await import('@jest/globals');
    const h = await makeTempFsEngineHarness();
    try {
        const f = await authorityTurnFixture(h, 'http://127.0.0.1:1/v1/chat/completions');
        const personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore }); f.core.personas = personas;
        const a = await personas.create(h.handle, { content: content('Typed A'), expectedFingerprint: empty });
        const b = await personas.create(h.handle, { content: content('Typed B'), expectedFingerprint: empty });
        const selected = await f.core.selectPersona(h.handle, { sessionId: f.base.session.sessionId, expectedRevisionId: f.base.revision.revisionId, selection: a.ref });
        f.host.execute = jest.fn(async () => ({ response: { text: 'Typed reply' }, snapshot: { controlled: true } }));
        const committed = await f.host.executeTurn(h.handle, { sessionId: selected.session.sessionId, revisionId: selected.revision.revisionId, invocationId: 'typed-persona', slotBindings: {} }, undefined, undefined, { transaction: f.selection });
        const original = committed.timeline.at(-2).metadata.atri_player_identity;
        expect(original.ref).toEqual(a.ref);
        const changed = await f.core.selectPersona(h.handle, { sessionId: selected.session.sessionId, expectedRevisionId: committed.revision.revisionId, selection: b.ref });
        const retry = await f.core.retryReply(h.handle, selected.session.sessionId, { messageId: committed.timeline.at(-1).messageId, expectedRevisionId: changed.revision.revisionId });
        expect(retry.timeline.at(-1).metadata.atri_player_identity).toEqual(original);
        expect(retry.states[NS].solo.ref).toEqual(a.ref);
        expect(retry.states.atri_lifecycle.clocks.world).toBe(selected.states.atri_lifecycle.clocks.world);
        const run = await runFixture(h, 'http://127.0.0.1:1/v1/chat/completions'); run.core.personas = personas;
        const start = await run.core.selectPersona(h.handle, { sessionId: run.base.session.sessionId, expectedRevisionId: run.base.revision.revisionId, selection: a.ref });
        const begun = await run.core.beginStory(h.handle, start.session.sessionId, { input: { mode: 'ironman', name: 'Ada' }, invocationId: 'begin-persona', expectedRevisionId: start.revision.revisionId });
        expect(begun.timeline[0].metadata.atri_player_identity.ref).toEqual(a.ref);
        const exported = await run.saveSystem.exportSession(h.handle, start.session.sessionId);
        expect(exported.save).toMatchObject({ schemaVersion: 3, scope: 'resume' });
        await expect(run.core.retryReply(h.handle, start.session.sessionId, { messageId: begun.timeline.at(-1).messageId, expectedRevisionId: begun.revision.revisionId })).rejects.toMatchObject({ code: 'native_run_rewind_denied' });
    } finally { await h.cleanup(); }
});
