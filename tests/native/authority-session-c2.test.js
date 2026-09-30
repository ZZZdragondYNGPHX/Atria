import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { prepareAuthorityTransaction, buildAuthorityObservation } from '../../src/native/authority-transaction.js';

const durable = snapshot => ({ revision: snapshot.revision, core: snapshot.core, states: snapshot.states, timeline: snapshot.timeline, variants: snapshot.variants });
describe.each(CONTRACT_HARNESSES)('C2 existing Session authority - $name', ({ make }) => {
    let h, svc, f, base, installed;
    beforeEach(async () => {
        h = await make(); svc = services(h); f = authorityCandidateFixture();
        // Host support stays disabled; only optional metadata permits an old
        // Session to activate. This test calls the internal preparation seam.
        f.contract.capabilities[0].required = false;
        const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, archive);
        base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
        for (const domainId of ['notes', 'other', 'public_notes']) base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'seed-' + domainId, action: { kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text: domainId === 'notes' ? 'PRIVATE SENTINEL' : 'public note' } } },
            { expectedRevisionId: base.revision.revisionId });
        base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update note.' });
        const opened = await svc.packageInstaller.open(h.handle, base.session.packageId, base.session.packageVersionId);
        installed = { ...opened, entryPoint: opened.manifest.entryPoints.find(item => item.entryPointId === base.session.entryPointId) };
    });
    afterEach(async () => { await h?.cleanup(); });
    const request = () => ({ ...f.request, anchor: buildAuthorityObservation(base).anchor, playerMessageId: base.timeline.at(-1).messageId });
    test('successful preparation returns a full candidate and never writes real Session repositories', async () => {
        const before = durable(base); const prepared = await prepareAuthorityTransaction(base, installed, request());
        expect(prepared.candidate.states.atri_world_state.worlds[base.states.atri_world_state.primaryWorldId].state.hp).toBe(6);
        expect(prepared.candidate.states.atri_lifecycle.domains.other.records[0].value.text).toBe('other changed');
        expect(prepared.candidate.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('visible new note');
        expect(prepared.candidate.states.atri_lifecycle.clocks.world).toBe(1);
        expect(durable(await svc.core.load(h.handle, base.session.sessionId))).toEqual(before);
        expect(durable(base)).toEqual(before);
        // Reopen from durable authority (the same revision) and prepare again.
        const reloaded = await svc.core.load(h.handle, base.session.sessionId);
        expect(await prepareAuthorityTransaction(reloaded, installed, request())).toEqual(prepared);
    });
    test('a late workflow failure leaves real World, domains, clock, journal and timeline unchanged', async () => {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'already-done', action: { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' } },
            { expectedRevisionId: base.revision.revisionId });
        const before = durable(base);
        await expect(prepareAuthorityTransaction(base, installed, request())).rejects.toThrow('Authority transaction preparation failed');
        expect(durable(await svc.core.load(h.handle, base.session.sessionId))).toEqual(before);
    });
    test('candidate preparation does not observe or overwrite a concurrently published revision', async () => {
        const input = request(); const prepared = await prepareAuthorityTransaction(base, installed, input);
        const next = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Concurrent new action' });
        expect(prepared.candidate.revision).toEqual(base.revision);
        await expect(prepareAuthorityTransaction(next, installed, input)).rejects.toThrow();
        expect(durable(await svc.core.load(h.handle, base.session.sessionId))).toEqual(durable(next));
    });
});
