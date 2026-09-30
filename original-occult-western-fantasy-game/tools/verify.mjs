import assert from 'node:assert/strict';

export async function verify({ load, native, manifest, sourceFiles, assetPayloads, archive, mode }) {
    const { makeTempFsEngine } = await load('tests/storage/harness/fs-harness.js');
    const { services } = await load('tests/native/helpers/session-fixture.js');
    const { projectInformation, queryInformationGraph } = await load('public/shared/native-information-runtime.js');
    const { buildAuthorityObservation } = await load('src/native/authority-transaction.js');
    const { validateExperienceResources } = await load('src/native/experience-validation.js');
    const h = await makeTempFsEngine();
    const checks = [];
    try {
        const svc = services(h);
        await assert.rejects(svc.packageInstaller.install(h.handle, archive), /permission grant/);
        await svc.packageInstaller.install(h.handle, archive, { grantedPermissions: ['generation'] });
        checks.push('actual FS Package install');
        const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
        const runtime = native.resolveNativeRuntimePackage(opened, manifest.entryPoints[0].entryPointId);
        assert(runtime.descriptor.experienceContract.capabilities.some(c => c.id === 'authority-transaction' && c.version === 1 && c.required));
        checks.push('reopen / required authority-transaction@1 runtime resolution');
        let session = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: manifest.entryPoints[0].entryPointId });
        assert.equal(session.states.atri_lifecycle.ready, false);
        session = await svc.core.appendTimeline(h.handle, session.session.sessionId, { role: 'user', content: 'Foundation diagnostic.' });
        await assert.rejects(svc.core.prepareAuthorityTurn(h.handle, session, { transactionId: 'foundation.check', input: {} }), { code: 'AUTHORITY_PREPARATION_FAILED' });
        checks.push('pre-Ready transaction rejected');
        session = await svc.core.applyLifecycleCommand(h.handle, session.session.sessionId, { type: 'lifecycle', invocationId: 'p1-ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: session.revision.revisionId });
        assert.equal(session.states.atri_lifecycle.ready, true);
        assert.equal(session.states.atri_lifecycle.domains.entities.records.length, 1);
        const repeated = await svc.core.applyLifecycleCommand(h.handle, session.session.sessionId, { type: 'lifecycle', invocationId: 'p1-ready-again', action: { kind: 'experience.ready' } }, { expectedRevisionId: session.revision.revisionId });
        assert.deepEqual(repeated.states.atri_lifecycle.domains, session.states.atri_lifecycle.domains);
        session = repeated;
        checks.push('Ready / bootstrap initialization / derived publication / repeat-Ready idempotence');
        const info = manifest.runtime.experienceContract.informationRuntime;
        const projections = Object.fromEntries(info.views.map(v => [v.id, projectInformation(session, v.id, { purpose: v.exposure[0] })]));
        assert(!JSON.stringify(projections).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert(JSON.stringify(projections['narrator.context']).includes('Package Foundation'));
        assert(!JSON.stringify(buildAuthorityObservation(session)).includes('P1_PRIVATE_CANON_SENTINEL'));
        for (const graph of info.graphs) queryInformationGraph(session, graph.id, 'foundation', { purpose: info.views.find(v => v.id === graph.viewId).exposure[0] });
        checks.push('all five Views / two Graphs resolve; hidden seed excluded from observation and context');
        const prepared = await svc.core.prepareAuthorityTurn(h.handle, session, { transactionId: 'foundation.check', input: {} });
        assert(prepared.prepared.receipt);
        assert(!JSON.stringify(prepared.prepared.receipt).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert.deepEqual((await svc.core.load(h.handle, session.session.sessionId)).states, session.states);
        checks.push('diagnostic private candidate / safe receipt / zero preparation publication');
        const bad = structuredClone(manifest);
        bad.runtime.experienceContract.authorityRuntime.policy.maxReadGrants = 17;
        assert.throws(() => native.buildAtriaPackageContainer({ manifest: bad, sourceFiles, assetPayloads }));
        const files = new Map(sourceFiles);
        const logic = JSON.parse(files.get('runtime/logic.json'));
        logic.derivedPublications[0].effects[0].domainId = 'missing';
        files.set('runtime/logic.json', Buffer.from(JSON.stringify(logic)));
        assert.throws(() => validateExperienceResources(manifest, files, assetPayloads));
        const missing = structuredClone(manifest);
        missing.resources = missing.resources.filter(r => r.resourceType !== 'core.generation-profile');
        assert.throws(() => native.buildAtriaPackageContainer({ manifest: missing, sourceFiles, assetPayloads }), /missing exact Package resource/);
        const { assertTaskValue } = await load('public/shared/native-task-contract.js');
        const agenda = manifest.runtime.experienceContract.taskRuntime.tasks.find(t => t.id === 'agenda.deliberation');
        assertTaskValue({ institutionId: 'foundation', agendaId: 'foundation', blockers: [], knownRecords: [], tick: 0, permittedActions: ['defer'] }, agenda.inputSchema);
        assert.throws(() => assertTaskValue({ decision: 'execute', reason: 'Not authorized' }, agenda.variants[0].outputSchema));
        checks.push('over-limit policy / broken static target / missing Task resource / undeclared Agenda decision rejected');
        const { turnSmoke } = await import('./turn-smoke.mjs');
        checks.push(await turnSmoke({ load, h, svc, session }));
        return { mode, checks, dataResources: manifest.runtime.experienceContract.dataResources.length, tasks: manifest.runtime.experienceContract.taskRuntime.tasks.length,
            ...(mode === 'preview' ? { player: projections['player.overview'], narrator: projections['narrator.context'] } : {}),
            limits: ['FS integration only', 'No hosted model or UI execution', 'No full gameplay, save-container restore or cross-process selection claim'] };
    } finally { await h.cleanup(); }
}
