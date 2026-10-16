import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, services as sessionServices } from '../native/helpers/session-fixture.js';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { createOrchestrationExecutionService } from '../../src/native/orchestration/execution-service.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { EffectController } from '../../src/native/orchestration/effect-controller.js';
import { ApprovalController } from '../../src/native/orchestration/approval-controller.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');

describe.each(harnesses)('$name original Run metadata HTTP', ({ make }) => {
    let h, core, base, service, app, runs, root, sourceSelector, start, now;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const directories = handle => handle === h.handle ? h.dirs : Object.fromEntries(Object.entries(h.dirs)
            .map(([key, value]) => [key, path.join(h.dataRoot, handle, path.relative(h.dirs.root, value))]));
        h.engine._directoriesByHandle = directories;
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: directories });
        const installed = await installFixture(h); core = installed.core; base = await core.create(h.handle, installed.start);
        now = Date.now();
        const authoring = createOrchestrationAuthoringService(h.engine, { sessionCore: core });
        service = { ...authoring, observations: new RunObservationService({ engine: h.engine, sessionCore: core, now: () => now, pollMs: 0 }) };
        const plan = await authoring.plans.create(h.handle, command(), planFixture());
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const validation = await authoring.plans.validate(h.handle, expected);
        const { planRef } = await authoring.plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(validation) });
        const deny = async () => { throw new Error('No Effect authority in metadata fixture'); };
        ({ runs } = createOrchestrationExecutionService({ engine: h.engine, sessionCore: core,
            effectAuthority: { authorize: deny, verifySend: deny, verifyObservation: deny, verifyApproval: deny } }));
        start = () => runs.start(h.handle, command(), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'original_observation_fixture' } });
        root = await start(); sourceSelector = { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null };
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.get('X-Test-Owner')) req.user = { profile: { handle: req.get('X-Test-Owner'), enabled: true } }; next(); });
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
    });
    afterEach(async () => { setReadOnly(false); await h?.engine.close(); await h?.cleanup(); });
    const read = (method, body, owner = h.handle) => request(app).post('/api/native/orchestration/runs/' + method).set('X-Test-Owner', owner).send({ schemaVersion: 1, body });
    const mutation = (body, { id = command(), boot = service.hostBootId, method = 'cancel' } = {}) => request(app).post('/api/native/orchestration/runs/' + method)
        .set('X-Test-Owner', h.handle).set('X-Atria-Host-Boot-Id', boot).send({ schemaVersion: 1, commandId: id, expectedHostBootId: boot, body });
    const observe = (cursor = null) => read('observe', { runId: root.runId, cursor, limit: 10 });

    test('authenticated no-store metadata reads never expose internal execution objects or write durable state', async () => {
        const before = await h.engine.withTransaction(h.handle, async tx => hash(await tx.listResources({ handle: h.handle, kind: K.orchestrationRun })));
        await request(app).post('/api/native/orchestration/runs/observe').send({ schemaVersion: 1, body: { runId: root.runId, cursor: null, limit: 10 } }).expect(401);
        const result = await observe().expect(200), snapshot = result.body.outcome;
        expect(result.headers['cache-control']).toContain('no-store');
        expect(snapshot).toMatchObject({ kind: 'snapshot', seq: 0, projectionVersion: 1, payload: { status: 'admitted', costs: { status: 'not_started' } } });
        const text = JSON.stringify(snapshot);
        for (const field of ['eventSeq', 'budgetAuthorityRef', 'dispatchToken', 'inputRefs', 'effectiveGrantDigest', 'sourceRequest', 'requestNonceHash']) expect(text).not.toContain('"' + field + '"');
        expect(snapshot.payload.controls).toEqual({ cancel: true, recover: false, resume: false, reconcile: false, approve: false });
        expect(snapshot.payload.events).toEqual([expect.objectContaining({ type: 'admitted', eventId: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
        expect(snapshot.payload.events[0]).not.toHaveProperty('eventSeq'); expect(snapshot.payload.events[0]).not.toHaveProperty('reasonCode');
        expect((await observe(snapshot.cursor).expect(200)).body.outcome).toMatchObject({ kind: 'deltaBatch', seq: 0, payload: { changes: [] } });
        expect(await h.engine.withTransaction(h.handle, async tx => hash(await tx.listResources({ handle: h.handle, kind: K.orchestrationRun })))).toBe(before);
    });

    test('cancel uses original Host CAS, exact replay and epoch fencing while observation cursors require resync', async () => {
        const snapshot = (await observe().expect(200)).body.outcome, id = command(), body = { ...runGuard(root), reasonCode: 'user_cancelled' };
        await mutation(body, { boot: 'foreign-boot' }).expect(409);
        const cancelled = await mutation(body, { id }).expect(200);
        expect(cancelled.body.outcome).toMatchObject({ status: 'cancelled', cancelRequested: true });
        expect((await mutation(body, { id }).expect(200)).body.outcome).toEqual(cancelled.body.outcome);
        await mutation({ ...body, reasonCode: 'different_payload' }, { id }).expect(409);
        expect((await observe(snapshot.cursor).expect(409)).body.error).toBe('native_orchestration_projection_resync_required');
        expect((await observe().expect(200)).body.outcome.payload).toMatchObject({ status: 'cancelled', cancelRequested: true, controls: { cancel: false } });
        expect((await runs.get(h.handle, root.runId)).budgetAuthorityRef).toEqual(root.budgetAuthorityRef);
    });

    test('a deadline crossing emits safe counter diagnostics without rewriting history or granting execution', async () => {
        const snapshot = (await observe().expect(200)).body.outcome;
        expect(snapshot.payload.execution).toMatchObject({ limits: root.limits, progress: { steps: 0, attempts: 0, deadlineAt: root.progress.deadlineAt },
            treeProgress: { steps: 0, attempts: 0 } });
        expect(snapshot.payload.capacity).toEqual({ status: 'not_started' });
        const before = hash(await runs.get(h.handle, root.runId));
        now = root.progress.deadlineAt;
        const delta = (await observe(snapshot.cursor).expect(200)).body.outcome;
        expect(delta.seq).toBe(snapshot.seq + 1);
        const current = delta.payload.changes.at(-1).snapshot;
        expect(current.status).toBe('admitted'); expect(current.controls.resume).toBe(false);
        expect(current.diagnostics).toContainEqual({ code: 'native_orchestration_deadline_reached', severity: 'blocking' });
        expect((await read('diagnostics', { runId: root.runId }).expect(200)).body.outcome.diagnostics)
            .toContainEqual({ code: 'native_orchestration_deadline_reached', severity: 'blocking' });
        expect(hash(await runs.get(h.handle, root.runId))).toBe(before);
        await mutation({ ...runGuard(root), reasonCode: 'cancel_expired_run' }).expect(200);
        expect((await observe().expect(200)).body.outcome.payload.diagnostics.map(item => item.code)).not.toContain('native_orchestration_deadline_reached');
    });

    test('same-Host storage generation changes disable stale controls and require recovery without changing history', async () => {
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const snapshot = (await observe().expect(200)).body.outcome;
        expect(snapshot.payload.controls.cancel).toBe(false);
        expect(snapshot.payload.controls.recover).toBe(true);
        expect(snapshot.payload.diagnostics).toContainEqual({ code: 'native_orchestration_host_recovery_required', severity: 'blocking' });
        expect(await runs.get(h.handle, root.runId)).toEqual(root);
        await mutation({ ...runGuard(root), reasonCode: 'stale_restore' }).expect(409);
    });

    test('explicit recovery uses original CAS and rebinds only metadata, preserving counters and the original bank', async () => {
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const id = command(), body = runGuard(root), before = await observe().expect(200);
        await mutation(body, { id, method: 'recover', boot: 'foreign-boot' }).expect(409);
        await mutation({ ...body, grant: { approved: true } }, { method: 'recover' }).expect(400);
        setReadOnly(true); await mutation(body, { method: 'recover' }).expect(503); setReadOnly(false);
        await request(app).post('/api/native/orchestration/runs/recover').set('X-Test-Owner', 'foreign')
            .set('X-Atria-Host-Boot-Id', service.hostBootId).send({ schemaVersion: 1, commandId: command(), expectedHostBootId: service.hostBootId, body }).expect(404);
        const result = (await mutation(body, { id, method: 'recover' }).expect(200)).body.outcome;
        expect(result).toMatchObject({ runId: root.runId, status: 'blocked', resumed: false, versions: { epoch: root.epoch + 1 } });
        expect((await mutation(body, { id, method: 'recover' }).expect(200)).body.outcome).toEqual(result);
        await mutation({ ...body, expectedStateVersion: body.expectedStateVersion + 1 }, { id, method: 'recover' }).expect(409);
        const recovered = await runs.get(h.handle, root.runId);
        expect(recovered.progress).toEqual(root.progress); expect(recovered.budgetAuthorityRef).toEqual(root.budgetAuthorityRef);
        expect(recovered.attemptRefs).toEqual(root.attemptRefs); expect(recovered.sourceBinding).toEqual(root.sourceBinding);
        await observe(before.body.outcome.cursor).expect(409);
        expect((await observe().expect(200)).body.outcome.payload.controls).toMatchObject({ cancel: true, recover: false, resume: false });
    });

    test('a reopened Engine uses the new boot and original source authority for recovery', async () => {
        const oldBoot = service.hostBootId, Engine = h.engine.constructor;
        await h.engine.close();
        h.engine = new Engine({ directoriesByHandle: () => h.dirs });
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        core = sessionServices(h).core;
        service = { ...createOrchestrationAuthoringService(h.engine, { sessionCore: core }),
            observations: new RunObservationService({ engine: h.engine, sessionCore: core, pollMs: 0 }) };
        expect(service.hostBootId).not.toBe(oldBoot);
        expect((await observe().expect(200)).body.outcome.payload.controls.recover).toBe(true);
        await mutation(runGuard(root), { method: 'recover', boot: oldBoot }).expect(409);
        const result = (await mutation(runGuard(root), { method: 'recover' }).expect(200)).body.outcome;
        expect(result).toMatchObject({ status: 'blocked', resumed: false, versions: { epoch: root.epoch + 1 } });
        expect((await observe().expect(200)).body.outcome.payload.controls.recover).toBe(false);
    });

    test('unknown recovery ACK is observed by the same command without another epoch or event', async () => {
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const original = h.engine.withTransaction.bind(h.engine), id = command(), body = runGuard(root);
        let unknown = true;
        h.engine.withTransaction = async (...args) => {
            const result = await original(...args);
            if (unknown && result?.runId === root.runId && result.epoch === root.epoch + 1 && result.status === 'blocked') {
                unknown = false; throw Object.assign(new Error('Withheld recovery ACK'), { code: 'storage_commit_unknown' });
            }
            return result;
        };
        try {
            expect((await mutation(body, { id, method: 'recover' }).expect(409)).body.error).toBe('storage_commit_unknown');
            const result = (await mutation(body, { id, method: 'recover' }).expect(200)).body.outcome;
            expect(result.versions).toEqual({ epoch: root.epoch + 1, stateVersion: root.stateVersion + 1, graphRevision: root.graphRevision });
            const events = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId: root.runId, recordType: 'event' }));
            expect(events.filter(row => row.doc.type === 'host_recovered')).toHaveLength(1);
        } finally { h.engine.withTransaction = original; }
    });

    test.each([false, true])('recovery preserves a controlled pending Effect and invalidates pending approvals (approval=%s)', async requiresApproval => {
        // This test uses explicit core Ports, not a real external dispatch or bank.
        const plans = new PlanRepository({ engine: h.engine, authorize: async () => {},
            assertWriter: (owner, tx) => h.engine.nativeHostLifecycle.assertWriter(owner, tx),
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const fixture = planFixture(), agentId = createNativeId('orchestrationNode'), output = fixture.definition.nodes[0];
        fixture.definition.nodes.unshift({ nodeId: agentId, kind: 'agent', label: 'Controlled recovery effect', inputs: [],
            outputs: [{ name: 'body', type: 'text.body', required: false }], dependencyPinIds: ['test.route'], capabilities: ['test.effect'], policy: { agentPinId: 'test.route' } });
        output.inputs = [{ name: 'body', type: 'text.body', required: true }];
        fixture.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: agentId, port: 'body' },
            to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 1, loopBack: false }];
        fixture.definition.entryNodeIds = [agentId]; fixture.definition.capabilityCeiling = ['test.effect']; fixture.definition.limits.maxSteps = 50;
        fixture.dependencyPins = [{ pinId: 'test.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: hash('controlled') }];
        const draft = await plans.create(h.handle, command(), fixture), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const validation = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(validation) });
        root = await runs.start(h.handle, command(), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'controlled_recovery_effect' } });
        const { attemptId } = await runs.beginAttempt(h.handle, command(), { ...runGuard(root), nodeId: agentId,
            inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash('controlled'), budgetRef: root.budgetAuthorityRef });
        await new AttemptController({ runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), attemptId });
        const effects = new EffectController({ runs, authorizeEffect: async ({ proposal, intent }) => proposal ? {
            ...proposal, capability: 'test.effect', endpointBindingDigest: hash('endpoint'), grantDigest: hash('controlled'),
            risk: requiresApproval ? 'R2' : 'R1', requiresApproval, egressDigest: hash('egress'), budgetEnvelopeDigest: hash('bank'),
            dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' },
        } : Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash', 'capability', 'endpointBindingDigest', 'grantDigest', 'risk',
            'requiresApproval', 'egressDigest', 'budgetEnvelopeDigest', 'dispatchPolicy'].map(key => [key, intent[key]])),
        verifyBudgetAttempt: async () => {}, verifyObservation: async () => {}, verifyApproval: async () => {} });
        const effectId = createNativeId('orchestrationEffect'), approvalId = createNativeId('orchestrationApproval');
        await effects.prepare(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), effectId, nodeAttemptId: attemptId,
            proposal: { actionRef: { actionId: 'test.effect' }, targetRef: { id: 'controlled' }, inputRef: { id: 'controlled' }, inputHash: hash('controlled') } });
        await effects.ready(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), effectId, budgetAttemptRef: { controlled: true } });
        if (requiresApproval) {
            await new ApprovalController({ runs, authorizeRequest: async () => ({ actorRequirement: { handle: h.handle }, requestNonceHash: hash('nonce') }),
                verifyDecision: async () => { throw new Error('No Review decision in this core fixture'); } }).request(h.handle, {
                ...runGuard(await runs.get(h.handle, root.runId)), effectId, approvalId, expiresAt: root.progress.deadlineAt });
        } else await effects.claim(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), effectId });
        const before = await runs.get(h.handle, root.runId);
        const readRecord = type => h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, root.runId, type, type === 'effect' ? effectId : approvalId)));
        const originalEffect = await readRecord('effect');
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const result = (await mutation(runGuard(before), { method: 'recover' }).expect(200)).body.outcome;
        expect(result).toMatchObject({ status: 'reconciling', resumed: false, versions: { epoch: before.epoch + 1 } });
        expect(JSON.stringify(result)).not.toContain('dispatchToken'); expect(await readRecord('effect')).toEqual(originalEffect);
        const after = await runs.get(h.handle, root.runId);
        expect(after.pendingEffectRefs).toEqual([effectId]); expect(after.budgetAuthorityRef).toEqual(before.budgetAuthorityRef);
        expect(after.progress).toEqual(before.progress); expect(after.pendingApprovalRefs).toEqual([]);
        const approvalStatus = requiresApproval ? (await readRecord('approval')).doc.status : null;
        expect(approvalStatus).toBe(requiresApproval ? 'invalidated' : null);
    });

    test('restore generation changes invalidate observation, list and details cursors', async () => {
        await start();
        const listed = (await read('list', { sourceSelector, cursor: null, limit: 1 }).expect(200)).body.outcome;
        await mutation({ ...runGuard(root), reasonCode: 'user_cancelled' }).expect(200);
        const snapshot = (await observe().expect(200)).body.outcome;
        const detail = (await read('details', { runId: root.runId, collection: 'events', cursor: null, limit: 1 }).expect(200)).body.outcome;
        expect(listed.cursor).not.toBeNull(); expect(detail.cursor).not.toBeNull();
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        await observe(snapshot.cursor).expect(409);
        await read('list', { sourceSelector, cursor: listed.cursor, limit: 1 }).expect(409);
        await read('details', { runId: root.runId, collection: 'events', cursor: detail.cursor, limit: 1 }).expect(409);
        expect((await observe().expect(200)).body.outcome.kind).toBe('snapshot');
    });

    test('cursor scope, expiry, service restart and owner isolation cannot read another stream', async () => {
        const snapshot = (await observe().expect(200)).body.outcome, other = await start();
        await read('observe', { runId: other.runId, cursor: snapshot.cursor, limit: 10 }).expect(409);
        await read('observe', { runId: root.runId, cursor: snapshot.cursor, limit: 10 }, 'foreign').expect(404);
        await read('observe', { runId: root.runId, cursor: null, limit: 10 }, 'foreign').expect(404);
        now += 300001; await observe(snapshot.cursor).expect(409);
        const fresh = (await observe().expect(200)).body.outcome;
        service.observations = new RunObservationService({ engine: h.engine, sessionCore: core, pollMs: 0 });
        await observe(fresh.cursor).expect(409);
        expect((await runs.get(h.handle, root.runId)).cancelRequested).toBe(false);
    });

    test('source-scoped pagination returns every Run once and rejects cross-scope list cursors', async () => {
        const created = [root, await start(), await start()], listed = [], ids = new Set(); let cursor = null;
        do {
            const page = (await read('list', { sourceSelector, cursor, limit: 1 }).expect(200)).body.outcome;
            listed.push(...page.items); cursor = page.cursor;
            if (cursor) ids.add(cursor);
        } while (cursor);
        expect(listed.map(item => item.runId).sort()).toEqual(created.map(item => item.runId).sort());
        await read('observe', { runId: root.runId, cursor: [...ids][0], limit: 10 }).expect(409);
        await read('list', { sourceSelector, cursor: null, limit: 101 }).expect(400);
        await read('list', { sourceSelector, cursor: null, limit: 1, handle: 'foreign' }).expect(400);
    });

    test('public metadata collections are bounded, version scoped and cannot request Result payloads or Effect inputs', async () => {
        const detail = (await read('details', { runId: root.runId, collection: 'nodes', cursor: null, limit: 1 }).expect(200)).body.outcome;
        expect(detail.items).toEqual([{ nodeId: root.graph.nodes[0].nodeId, kind: 'output', label: 'Result' }]); expect(detail.cursor).toBeNull();
        for (const collection of ['result', 'inputRef', 'receipt', 'approvalProof']) await read('details', { runId: root.runId, collection, cursor: null, limit: 10 }).expect(400);
        for (const method of ['start', 'resume']) await read(method, {}).expect(404);
        await mutation(runGuard(root), { method: 'reconcile' }).expect(503);
        expect((await read('diagnostics', { runId: root.runId }).expect(200)).body.outcome.diagnostics).toEqual([]);
    });

    test('source removal revokes an existing cursor; read-only storage still permits observation and refuses cancel', async () => {
        const snapshot = (await observe().expect(200)).body.outcome;
        setReadOnly(true); await observe(snapshot.cursor).expect(200);
        await mutation({ ...runGuard(root), reasonCode: 'user_cancelled' }).expect(503); setReadOnly(false);
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource({ kind: K.session, handle: h.handle, sessionId: base.session.sessionId }));
        await observe(snapshot.cursor).expect(404);
        await mutation(runGuard(root), { method: 'recover' }).expect(404);
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: K.orchestrationRun, handle: h.handle, runId: root.runId }));
        expect(stored.doc.cancelRequested).toBe(false);
    });
});
