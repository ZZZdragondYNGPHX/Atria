import { describe, test, expect } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';

function fixture() {
    const f = authorityCandidateFixture();
    const schema = closed({ sequence: { type: 'integer', minimum: 0, maximum: 10000 }, calendar: closed({ year: { type: 'integer', minimum: 1, maximum: 1000 } }), era_id: { type: 'string', maxLength: 64 } });
    const initial = { sequence: 0, calendar: { year: 1 }, era_id: 'opening' };
    f.contract.lifecycleRuntime.domains.push({ id: 'chronology', scopeId: 'session', schemaVersion: 1, recordSchema: schema, initial,
        commands: [{ id: 'start', argsSchema: closed({}), event: 'chronology.start', assign: initial },
            { id: 'order', argsSchema: closed({}), event: 'chronology.order', assign: { sequence: { formula: 'world.sequence + 1' } } }],
        retention: { maxItems: 1, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
    f.contract.lifecycleRuntime.automations.push({ id: 'chronology.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1,
        action: { kind: 'app.command', domainId: 'chronology', commandId: 'start', recordId: 'main', args: {} } });
    f.contract.lifecycleRuntime.automations.push({ id: 'notes.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1, action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'Initial' } } });
    f.contract.lifecycleRuntime.history = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology', meaningfulDomains: ['notes'],
        sources: [{ id: 'note', domainId: 'notes', recordId: 'main', path: ['text'], public: true, refs: ['case:note'], label: 'Recorded note' }],
        hot: 4, warm: 4, cold: 4, maxDurable: 1024, maxBytes: 1048576, checkpointTurns: 16 };
    f.contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
    f.logic.transactions[0].effects = [
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: { formula: 'args.text' } } },
        { kind: 'app.command', domainId: 'chronology', commandId: 'order', recordId: 'main', args: {} },
        { kind: 'clock.advance', commandId: 'advance', ticks: 1 },
    ];
    f.sync();
    return { f, ...buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() }) };
}
const envelope = { schemaVersion: 1, narrative: 'The authorized note change is recorded.', outcomes: [], diagnostics: [] };
describe.each(CONTRACT_HARNESSES)('History checkpoint / SaveSystem - $name', ({ make }) => {
    test('CAS, portable checkpoint, archived replay refusal, restore and later Retry', async () => {
        const source = await make(), target = await make();
        try {
            const { f, archive } = fixture(), svc = services(source), next = services(target);
            await svc.packageInstaller.install(source.handle, archive);
            let s = await svc.core.create(source.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
            s = await svc.core.applyLifecycleCommand(source.handle, s.session.sessionId, { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: s.revision.revisionId });
            s = await svc.core.applyLifecycleCommand(source.handle, s.session.sessionId, { type: 'lifecycle', invocationId: 'seed', action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'Initial' } } }, { expectedRevisionId: s.revision.revisionId });
            const act = async (service, handle, state, n) => {
                state = await service.core.appendTimeline(handle, state.session.sessionId, { role: 'user', content: 'Change the recorded note.' });
                const p = await service.core.prepareAuthorityTurn(handle, state, { transactionId: 'note.update', input: { target: 'main', text: 'Note ' + n, amount: 1 } });
                return service.core.finalizeTurn(handle, state.session.sessionId, { invocationId: 'history-' + n, authorityProof: p.proof, envelope }, { expectedRevisionId: state.revision.revisionId });
            };
            for (let i = 1; i <= 16; i++) s = await act(svc, source.handle, s, i);
            expect(s.timeline).toHaveLength(1); expect(s.core.parentRevisionId).toBeNull();
            expect(s.states.atri_lifecycle.history.turns).toBe(16);
            expect(s.states.atri_task_results.records).toHaveLength(0);
            const save = await svc.saveSystem.manualSave(source.handle, s.session.sessionId);
            const exported = await svc.saveSystem.exportSnapshot(source.handle, s.session.sessionId, save.saveId);
            await next.packageInstaller.install(target.handle, archive);
            let restored = await next.saveSystem.importSave(target.handle, exported.archive);
            expect(restored.states).toEqual(s.states); expect(restored.timeline).toEqual(s.timeline);
            await expect(next.core.finalizeTurn(target.handle, restored.session.sessionId, { invocationId: 'history-1', envelope }, { expectedRevisionId: restored.revision.revisionId })).rejects.toThrow('Archived');
            restored = await act(next, target.handle, restored, 17);
            expect(restored.states.atri_lifecycle.history.turns).toBe(17);
            restored = await next.core.applyLifecycleCommand(target.handle, restored.session.sessionId,
                { type: 'lifecycle', invocationId: 'host-clock', action: { kind: 'clock.advance', commandId: 'advance', ticks: 1 } }, { expectedRevisionId: restored.revision.revisionId });
            expect(restored.states.atri_lifecycle.history.turns).toBe(17);
            expect(restored.states.atri_lifecycle.history.hot.at(-1).origin).toBe('host');
            const messageId = restored.timeline.at(-1).messageId;
            const retry = await next.core.retryReply(target.handle, restored.session.sessionId, { messageId, expectedRevisionId: restored.revision.revisionId });
            expect(retry.states.atri_lifecycle.history.turns).toBe(16);
            expect((await next.core.getHistory(target.handle, restored.session.sessionId, { kind: 'fact', limit: 1 })).items).toHaveLength(1);
        } finally { await source.cleanup(); await target.cleanup(); }
    }, 120000);
});
