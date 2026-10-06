import { describe, test, expect, jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { computationFixture } from './helpers/package-computation-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { prepareAuthorityTurn } from '../../src/native/authority-turn.js';

describe.each(CONTRACT_HARNESSES)('Package computation publication - $name', ({ make }) => {
    test('one CAS settles all domains, rejects stale publication and recognizes retry', async () => {
        const h = await make();
        try {
            const f = computationFixture();
            f.contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
            f.sync();
            const svc = services(h);
            const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
            await svc.packageInstaller.install(h.handle, archive);
            let base = await svc.core.create(h.handle, { ...f.base.session });
            const command = async (invocationId, action) => { base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
                { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId }); };
            await command('ready', { kind: 'experience.ready' });
            await command('seed-notes', { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'public' } });
            for (const [domainId, value] of [['wallet',20], ['shop',5], ['bag',0]])
                await command('seed-' + domainId, { kind: 'app.command', domainId, commandId: 'set', recordId: 'main', args: { value } });
            base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Buy two' });
            const opened = await svc.packageInstaller.open(h.handle, base.session.packageId, base.session.packageVersionId);
            const installed = { ...opened, entryPoint: opened.manifest.entryPoints[0] };
            const { proof } = await prepareAuthorityTurn(svc.core, h.handle, base, installed, { transactionId: 'trade.buy', input: { quantity: 2 } });
            const commit = jest.spyOn(svc.core._sessions, 'commitSnapshot');
            const options = { expectedRevisionId: base.revision.revisionId };
            const request = { envelope: { schemaVersion: 1, narrative: 'Purchased two items.', outcomes: [], diagnostics: [] }, invocationId: 'buy-1', authorityProof: proof };
            const next = await svc.core.finalizeTurn(h.handle, base.session.sessionId, request, options);
            expect(commit).toHaveBeenCalledTimes(1);
            expect(next.states.atri_action_receipts.receipts[0].execution).toHaveLength(4);
            expect(['wallet','shop','bag'].map(id => next.states.atri_lifecycle.domains[id].records[0].value.value)).toEqual([14,3,2]);
            expect((await svc.core.finalizeTurn(h.handle, base.session.sessionId, request, options)).revision).toEqual(next.revision);
            expect(commit).toHaveBeenCalledTimes(1);
            await expect(svc.core.finalizeTurn(h.handle, base.session.sessionId, { ...request, invocationId: 'buy-stale' }, options)).rejects.toThrow('conflict');
            expect((await svc.core.load(h.handle, base.session.sessionId)).states).toEqual(next.states);
        } finally { await h.cleanup(); }
    });
});
