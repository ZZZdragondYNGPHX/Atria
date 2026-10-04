import { describe, test, expect } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { publicBridgeError } from '../../public/shared/native-frontend-bridge.js';

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
    f.contract.taskRuntime = { ...lifecycleFixture().taskRuntime, turn: { policy: 'authority-first', stages: [] } };
    const task = f.contract.taskRuntime.tasks[0];
    task.resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
    const variant = task.variants[0];
    f.base.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId,
            revision: variant.prompt.revision, displayName: 'Advice', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId,
            revision: variant.generation.revision, displayName: 'Advice', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
    f.logic.transactions[0].effects = [
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: { formula: 'args.text' } } },
        { kind: 'app.command', domainId: 'chronology', commandId: 'order', recordId: 'main', args: {} },
        { kind: 'clock.advance', commandId: 'advance', ticks: 1 },
    ];
    const copy = structuredClone(f.logic.transactions[0]);
    Object.assign(copy, { id: 'history.copy', verb: 'copy', reads: [], validators: [], effects: [], inputSchema: closed({ parentId: { type: 'string', maxLength: 128 } }),
        history: [{ operation: 'artifact.create', input: { kind: 'letter', title: 'Copy', content: 'An attributed copy', sourceId: '', parentId: { formula: 'args.parentId' } } }] });
    f.logic.transactions.push(copy);
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
            const advice = { invocationId: 'history-advice', taskId: 'summarize', variantId: 'default', payload: { text: 'Advice only' }, fingerprint: 'advice-fingerprint' };
            s = await svc.core.recordTaskResult(source.handle, s.session.sessionId, advice, { expectedRevisionId: s.revision.revisionId });
            expect(s.states.atri_task_results.records[0].status).toBe('draft');
            const player = await svc.core.appendTimeline(source.handle, s.session.sessionId, { role: 'user', content: 'Try copying an unavailable carrier.' });
            const beforeRefusal = structuredClone(player);
            const preparation = await svc.core.prepareAuthorityTurn(source.handle, player, { transactionId: 'history.copy', input: { parentId: 'unavailable' } }).catch(error => error);
            expect(preparation).toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED', publicRefusal: 'artifact_copy' });
            expect(publicBridgeError(preparation)).toBe('bridge_authority_artifact_copy');
            expect(preparation.cause).toBeUndefined(); expect(preparation.message).not.toContain('unavailable');
            expect(await svc.core.load(source.handle, s.session.sessionId)).toEqual(beforeRefusal);
            s = player;
            const act = async (service, handle, state, n) => {
                state = await service.core.appendTimeline(handle, state.session.sessionId, { role: 'user', content: 'Change the recorded note.' });
                const p = await service.core.prepareAuthorityTurn(handle, state, { transactionId: 'note.update', input: { target: 'main', text: 'Note ' + n, amount: 1 } });
                return service.core.finalizeTurn(handle, state.session.sessionId, { invocationId: 'history-' + n, authorityProof: p.proof, envelope }, { expectedRevisionId: state.revision.revisionId });
            };
            for (let i = 1; i <= 16; i++) s = await act(svc, source.handle, s, i);
            expect(s.timeline).toHaveLength(1); expect(s.core.parentRevisionId).toBeNull();
            expect(s.states.atri_lifecycle.history.turns).toBe(16);
            expect(s.states.atri_task_results.records).toHaveLength(0);
            expect(s.states.atri_lifecycle.taskTombstones).toEqual([expect.objectContaining({ invocationId: advice.invocationId, fingerprint: advice.fingerprint })]);
            const save = await svc.saveSystem.manualSave(source.handle, s.session.sessionId);
            const exported = await svc.saveSystem.exportSnapshot(source.handle, s.session.sessionId, save.saveId);
            await next.packageInstaller.install(target.handle, archive);
            let restored = await next.saveSystem.importSave(target.handle, exported.archive);
            expect(restored.states).toEqual(s.states); expect(restored.timeline).toEqual(s.timeline);
            await expect(next.core.recordTaskResult(target.handle, restored.session.sessionId, advice, { expectedRevisionId: restored.revision.revisionId })).rejects.toThrow('compacted');
            const archived = await next.core.inspectReplyRetry(target.handle, restored.session.sessionId);
            expect(archived.eligible).toBe(false); expect(archived.reason).toContain('checkpoint');
            expect((await next.core.load(target.handle, restored.session.sessionId)).revision).toEqual(restored.revision);
            await expect(next.core.finalizeTurn(target.handle, restored.session.sessionId, { invocationId: 'history-1', envelope }, { expectedRevisionId: restored.revision.revisionId })).rejects.toThrow('Archived');
            restored = await act(next, target.handle, restored, 17);
            expect(restored.states.atri_lifecycle.history.turns).toBe(17);
            restored = await next.core.applyLifecycleCommand(target.handle, restored.session.sessionId,
                { type: 'lifecycle', invocationId: 'host-clock', action: { kind: 'clock.advance', commandId: 'advance', ticks: 1 } }, { expectedRevisionId: restored.revision.revisionId });
            expect(restored.states.atri_lifecycle.history.turns).toBe(17);
            expect(restored.states.atri_lifecycle.history.hot.at(-1).origin).toBe('host');
            const messageId = restored.timeline.at(-1).messageId;
            expect(await next.core.inspectReplyRetry(target.handle, restored.session.sessionId, { messageId })).toMatchObject({ messageId, eligible: true });
            const retry = await next.core.retryReply(target.handle, restored.session.sessionId, { messageId, expectedRevisionId: restored.revision.revisionId });
            expect(retry.states.atri_lifecycle.history.turns).toBe(16);
            expect((await next.core.getHistory(target.handle, restored.session.sessionId, { kind: 'fact', limit: 1 })).items).toHaveLength(1);
        } finally { await source.cleanup(); await target.cleanup(); }
    }, 120000);
});
