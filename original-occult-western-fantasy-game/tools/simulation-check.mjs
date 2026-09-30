import assert from 'node:assert/strict';
import http from 'node:http';

export async function simulationCheck({ load, svc, h, manifest, archive }) {
    const { NativeGenerationHost } = await load('src/native/adapters/generation-host.js');
    const { seedGenerationProfiles } = await load('tests/native/helpers/generation-fixture.js');
    const { createHttpGenerationProvider } = await load('src/native/adapters/http-generation-provider.js');
    const { makeTempFsEngine } = await load('tests/storage/harness/fs-harness.js');
    const { services } = await load('tests/native/helpers/session-fixture.js');
    const { projectInformation } = await load('public/shared/native-information-runtime.js');
    let base = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: manifest.entryPoints[0].entryPointId });
    let serial = 0, commits = 0, failProvider = true, target;
    const seen = [];
    const original = svc.core._sessions.commitSnapshot;
    const command = async (action, invocationId = 'p3-' + ++serial) => {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId });
        return base;
    };
    const value = (domain, id = 'foundation') => base.states.atri_lifecycle.domains[domain].records.find(record => record.id === id)?.value;
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const request = JSON.parse(Buffer.concat(chunks)); seen.push(request);
            const isAgenda = JSON.stringify(request.messages).includes('permittedActions');
            if (failProvider) { res.writeHead(503, { Connection: 'close' }); res.end('{}'); return; }
            res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
            res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(isAgenda ? { decision: 'file_report', reason: 'The permitted filing follows the known docket.', candidateName: 'Synthetic Delegate' } : 'P3 authorized time advance completed.') } }] }));
        } catch { res.writeHead(500, { Connection: 'close' }); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await command({ kind: 'experience.ready' });
        await command({ kind: 'app.command', domainId: 'conditions', recordId: 'fixture', commandId: 'record', args: { text: 'Synthetic clinic appointment condition.', severity: 2 } });
        svc.core._sessions.commitSnapshot = async function (...args) { commits++; return original.apply(this, args); };
        const timeline = structuredClone(base.timeline);
        const { createAuthorityPublicationBudget, prepareAuthorityPublications } = await load('src/native/authority-transaction.js');
        const { prepareLifecycle } = await load('src/native/lifecycle-authority.js');
        const installed = await svc.core._openPackage(h.handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        const budget = await createAuthorityPublicationBudget(base, installed);
        const source = structuredClone(base);
        const draft = await prepareLifecycle(base, installed, { kind: 'clock.advance', commandId: 'advance', ticks: 2880 }, budget);
        const projected = await prepareAuthorityPublications({ ...base, states: draft.states }, installed, budget);
        assert.deepEqual(base, source);
        assert.equal(projected.work.readGrants, 16);
        assert.equal(projected.work.appCommands, 16);
        assert.equal(projected.work.effects, 20);
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 2880 }, 'p3-two-days');
        assert.equal(commits, 1);
        assert.equal(seen.length, 0, 'Deterministic catch-up makes no model calls');
        assert.equal(base.states.atri_lifecycle.clocks.world, 2880);
        assert.equal(value('agendas').railPhase, 'construction');
        assert.equal(value('agendas').pressPhase, 'published');
        assert.equal(value('agendas').archivePhase, 'awaiting');
        assert.equal(value('institutional_records').processedDay, 2);
        assert.equal(value('world_matters').arrears, 20);
        assert.equal(value('world_matters').hearingStatus, 'missed');
        assert.equal(value('conditions', 'fixture').severity, 0);
        assert.equal(value('entities').permission, false);
        assert.equal(base.states.atri_lifecycle.outbox.filter(item => item.status === 'pending').length, 1);
        assert.equal(base.states.atri_lifecycle.outbox[0].input.tick, 2880);
        assert.deepEqual(base.timeline, timeline);
        assert.equal(value('entities', 'delegate'), undefined, 'Unaccepted candidate is not an Entity');
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'local-test-only' } });
        const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
        const before = structuredClone(base);
        await assert.rejects(host.executeLifecycle(h.handle, input()));
        assert.deepEqual(await svc.core.load(h.handle, base.session.sessionId), before);
        assert.equal(commits, 1);
        failProvider = false;
        base = (await host.executeLifecycle(h.handle, input())).snapshot;
        assert.equal(commits, 2, 'Task intent, validated filing, Entity and safe projections use one CAS');
        assert.equal(value('agendas').archivePhase, 'filed');
        assert.equal(value('institutional_records').filing, 'filed');
        assert.equal(value('entities', 'delegate').name, 'Synthetic Delegate');
        assert.deepEqual(base.timeline, timeline);
        const requests = seen.length;
        assert.deepEqual((await host.executeLifecycle(h.handle, input())).results, []);
        assert.equal(seen.length, requests);
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 2880 }, 'p3-two-days');
        assert.equal(commits, 2, 'Committed invocation replay does not advance time again');
        for (const view of manifest.runtime.experienceContract.informationRuntime.views) {
            const safe = JSON.stringify(projectInformation(base, view.id, { purpose: view.exposure[0] }));
            assert(!safe.includes('P3_PRIVATE_') && !safe.includes('P1_PRIVATE_CANON_SENTINEL'));
        }
        const requestsText = JSON.stringify(seen);
        assert(!requestsText.includes('P3_PRIVATE_') && !requestsText.includes('P1_PRIVATE_CANON_SENTINEL') && !requestsText.includes('privateNote'));
        const save = await svc.saveSystem.manualSave(h.handle, base.session.sessionId);
        const exported = await svc.saveSystem.exportSnapshot(h.handle, base.session.sessionId, save.saveId);
        target = await makeTempFsEngine(); const restoredServices = services(target);
        await restoredServices.packageInstaller.install(target.handle, archive, { grantedPermissions: ['generation'] });
        const restored = await restoredServices.saveSystem.importSave(target.handle, exported.archive);
        assert.equal(restored.states.atri_lifecycle.clocks.world, 2880);
        assert.deepEqual(restored.states.atri_lifecycle.domains, base.states.atri_lifecycle.domains);
        assert.deepEqual(restored.states.atri_task_results.records.map(record => record.payload), base.states.atri_task_results.records.map(record => record.payload));
        // The authored fixture ends at the third daily boundary: fail closed,
        // never advance into undefined days while silently freezing obligations.
        const prior = structuredClone(base);
        await assert.rejects(command({ kind: 'clock.advance', commandId: 'advance', ticks: 1440 }));
        assert.deepEqual(await svc.core.load(h.handle, base.session.sessionId), prior);
        // Conditional Cold branch and stale cancellation use actual declared
        // fixture setup commands, not hidden state edits or a mock scheduler.
        base = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: manifest.entryPoints[0].entryPointId });
        await command({ kind: 'experience.ready' });
        await command({ kind: 'app.command', domainId: 'agendas', recordId: 'foundation', commandId: 'fixture_block_rail', args: {} });
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 2880 });
        assert.equal(value('agendas').railPhase, 'blocked');
        assert.equal(value('agendas').pressPhase, 'published');
        await command({ kind: 'app.command', domainId: 'agendas', recordId: 'foundation', commandId: 'record_intent', args: { decision: 'defer', reason: 'New institutional information superseded the request.', candidateName: 'No delegate' } });
        const countBeforeStale = seen.length;
        base = (await host.executeLifecycle(h.handle, input())).snapshot;
        assert.equal(seen.length, countBeforeStale);
        assert(!base.states.atri_lifecycle.outbox.some(item => item.status === 'pending'));
        assert.equal(value('entities', 'delegate'), undefined);
        // Real fixed-transaction Turn: Narrator finalizes first; the Host then
        // dispatches the admitted background Task without a manual drain call.
        base = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: manifest.entryPoints[0].entryPointId });
        await command({ kind: 'experience.ready' });
        let scheduled, began;
        const started = new Promise(resolve => { began = resolve; });
        const originalExecute = host.executeLifecycle.bind(host);
        host.executeLifecycle = (...args) => { scheduled = originalExecute(...args); began(); return scheduled; };
        const binding = { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId };
        const foreground = await host.executeTurn(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'p3-auto-turn', slotBindings: { narrative: binding, structured: binding } }, undefined, undefined,
            { transaction: { transactionId: 'interaction.advance_time', input: { target: 'fixture', method: 'wait', objective: 'wait_here', minutes: 2880 } } });
        assert.equal(foreground.states.atri_lifecycle.clocks.world, 2880);
        assert.equal(foreground.timeline.at(-1).content, 'P3 authorized time advance completed.');
        let timeout;
        try { await Promise.race([started, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Background dispatch did not start')), 20000); })]); } finally { clearTimeout(timeout); }
        base = (await scheduled).snapshot;
        assert.equal(value('agendas').archivePhase, 'filed');
        assert.equal(value('entities', 'delegate').name, 'Synthetic Delegate');
        assert(!JSON.stringify(seen).includes('P3_PRIVATE_') && !JSON.stringify(seen).includes('P1_PRIVATE_CANON_SENTINEL'));
        return 'P3 actual FS two-day install/Ready simulation; Cold/Warm deterministic phases, rent/hearing/clinic, conditional Cold blocking/stale cancellation, actual foreground-to-background HTTP dispatch, one bounded HTTP Agenda failure/retry, atomic intent/filing/Entity/projection acceptance, no hidden-input leak, committed replay, real save-container export/import to fresh FS, undefined third-day fail-closed';
    } finally {
        svc.core._sessions.commitSnapshot = original;
        await target?.cleanup();
        await new Promise(resolve => server.close(resolve));
    }
}
