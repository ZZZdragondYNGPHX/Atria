import { ConflictError } from '../../src/storage/errors.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { EffectController } from '../../src/native/orchestration/effect-controller.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const grantDigest = hash({ controlled: 'original-model-grant' });

// Controlled domain/budget Ports test the Host state machine only. This is not
// permission to send, a private Profile consumer, or actual Provider billing.
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Context retrieval Effect fencing', (_name, make) => {
    let h, runs, effects, runId, attemptId, mainId, hook, budgetHook, capability, revoked;
    const current = () => runs.get(h.handle, runId);
    const read = async (type, ref) => (await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, type, ref))))?.doc;
    const proposal = parent => {
        const inputRef = parent ? { contextForEffectId: parent, corpusDigest: hash('eligible corpus') } : { requestId: 'original-main' };
        return { actionRef: { kind: parent ? 'memory_retrieval' : 'model' }, targetRef: { profile: parent ? 'exact-retrieval' : 'exact-model' }, inputRef, inputHash: hash(inputRef) };
    };
    const prepareChild = async (parent = mainId, method = 'prepareContextRetrieval') => {
        const effectId = id('Effect');
        await effects[method](h.handle, { ...runGuard(await current()), effectId, nodeAttemptId: attemptId, proposal: proposal(parent) });
        return effectId;
    };
    const ready = async effectId => effects.ready(h.handle, { ...runGuard(await current()), effectId, budgetAttemptRef: { effectId, original: 'controlled-admission' } });
    const claim = async effectId => effects.claim(h.handle, { ...runGuard(await current()), effectId });
    const observe = async (effectId, outcome = 'confirmed', suffix = outcome) => effects.observe(h.handle, { ...runGuard(await current()), effectId,
        observation: { observationId: 'retrieval:' + suffix + ':' + effectId, observedEpoch: (await read('effect', effectId)).epoch, outcome,
            dispatchEvidence: { kind: outcome === 'unknown' ? 'unknown_dispatch' : 'original_port_observation', reference: { controlled: true } },
            remoteOperationRef: null, domainReceiptRef: null, budgetObservationRef: { original: 'controlled-observation' }, resultRefs: [], sourceRefs: [], reasonCode: null } });
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        hook = null; budgetHook = null; capability = null; revoked = false;
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const plan = planFixture(), output = plan.definition.nodes[0];
        const node = { nodeId: id('Node'), kind: 'agent', label: 'Controlled Context consumer', inputs: [],
            outputs: [{ name: 'body', type: 'text', required: false }], policy: { agentPinId: 'route' }, dependencyPinIds: ['route'],
            capabilities: ['generation.send', 'memory.retrieve'] };
        plan.definition.nodes = [node, { ...output, inputs: [{ name: 'body', type: 'text', required: true }] }];
        plan.definition.entryNodeIds = [node.nodeId];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId: node.nodeId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.capabilityCeiling = [...node.capabilities]; plan.definition.limits.maxSteps = 100;
        plan.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: hash('route') }];
        const draft = await plans.create(h.handle, id('Command'), plan);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const binding = { sourceAuthority: 'controlled', sourceRef: { original: true } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter,
            admit: async () => ({ sourceBinding: { ...binding, bindingDigest: hash(binding) }, budgetAuthorityRef: { original: 'controlled' } }) });
        const root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test' } }); runId = root.runId;
        ({ attemptId } = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: node.nodeId,
            inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef }));
        await new AttemptController({ runs, authorizeAttempt: authorize }).activate(h.handle, { ...runGuard(await current()), attemptId });
        effects = new EffectController({ runs, authorizeEffect: async args => {
            await hook?.(args);
            if (revoked) throw new ConflictError('controlled_revoked');
            const value = args.proposal ?? args.intent;
            return { ...Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, value[field]])),
                capability: capability ?? (value.inputRef.contextForEffectId ? 'memory.retrieve' : 'generation.send'), grantDigest,
                endpointBindingDigest: hash(value.targetRef), egressDigest: hash('controlled-egress'), budgetEnvelopeDigest: hash('controlled-ceiling'),
                risk: 'R1', requiresApproval: false, dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        }, verifyBudgetAttempt: async args => { await budgetHook?.(args); }, verifyObservation: async () => {}, verifyApproval: async () => { throw new Error('No approval authority'); } });
        mainId = id('Effect');
        await effects.prepare(h.handle, { ...runGuard(await current()), effectId: mainId, nodeAttemptId: attemptId, proposal: proposal() });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    test('distinct sequential retrieval Effects keep the original Model prepared and the Attempt waiting', async () => {
        for (let ordinal = 0; ordinal < 3; ordinal++) {
            const child = await prepareChild(); await ready(child);
            expect(await claim(child)).toMatchObject({ claimed: true });
            await observe(child);
            expect(await read('attempt', attemptId)).toMatchObject({ status: 'waiting_effect' });
            expect((await current()).pendingEffectRefs).toEqual([mainId]);
            expect(await read('effect', mainId)).toMatchObject({ status: 'prepared', budgetAttemptRef: null, dispatchToken: null });
        }
        await ready(mainId); expect(await claim(mainId)).toMatchObject({ claimed: true }); await observe(mainId);
        expect(await read('attempt', attemptId)).toMatchObject({ status: 'running' });
        expect((await current()).pendingEffectRefs).toEqual([]);
    });
    test.each(['second-child', 'plain-prepare', 'model-ready'])('%s cannot bypass unresolved Context work', async problem => {
        await prepareChild(); const before = await current();
        await expect(problem === 'model-ready' ? ready(mainId) : prepareChild(mainId, problem === 'plain-prepare' ? 'prepare' : 'prepareContextRetrieval')).rejects.toThrow();
        expect(await current()).toEqual(before);
    });
    test.each(['claimed-parent', 'foreign-attempt', 'non-model-parent', 'different-grant', 'different-revision', 'wrong-capability'])('%s cannot authorize a retrieval child', async problem => {
        if (problem === 'claimed-parent') { await ready(mainId); await claim(mainId); }
        else if (problem === 'wrong-capability') capability = 'generation.send';
        else await h.engine.withTransaction(h.handle, async tx => {
            const record = await readEffect(tx, h.handle, await current(), mainId), doc = { ...record.doc };
            if (problem === 'foreign-attempt') { doc.nodeAttemptId = id('Attempt'); }
            if (problem === 'non-model-parent') doc.capability = 'memory.retrieve';
            if (problem === 'different-grant') doc.grantDigest = hash('foreign-grant');
            if (problem === 'different-revision') doc.graphRevision++;
            await putMutable(tx, controlRecordKey(h.handle, runId, 'effect', mainId), doc, { expectedIntegrity: record.integrity });
        });
        const before = await current(); await expect(prepareChild()).rejects.toThrow(); expect(await current()).toEqual(before);
    });
    test('unknown retrieval stays reconciling and blocks the main Model without another child', async () => {
        const child = await prepareChild(); await ready(child); await claim(child); await observe(child, 'unknown');
        expect(await read('attempt', attemptId)).toMatchObject({ status: 'blocked' });
        expect(await current()).toMatchObject({ status: 'reconciling', pendingEffectRefs: [mainId, child] });
        await expect(ready(mainId)).rejects.toThrow(); await expect(prepareChild()).rejects.toThrow();
    });
    test('a lost committed retrieval claim ACK cannot issue another dispatch token', async () => {
        const child = await prepareChild(); await ready(child);
        const transaction = h.engine.withTransaction.bind(h.engine); let drop = true;
        h.engine.withTransaction = async (...args) => {
            const result = await transaction(...args);
            if (drop && result?.outcome?.effectId === child && result.outcome.status === 'dispatching') {
                drop = false; throw Object.assign(new Error('Controlled committed ACK loss'), { code: 'storage_commit_unknown' });
            }
            return result;
        };
        try { await expect(claim(child)).rejects.toMatchObject({ code: 'storage_commit_unknown' }); }
        finally { h.engine.withTransaction = transaction; }
        expect(drop).toBe(false);
        expect(await claim(child)).toMatchObject({ replayed: true, claimed: false, dispatchToken: null, outcome: { dispatchToken: null } });
        expect(await read('effect', child)).toMatchObject({ status: 'dispatching' });
        await expect(prepareChild()).rejects.toThrow(); await expect(ready(mainId)).rejects.toThrow();
    });
    test.each(['prepare', 'prepare_final', 'ready', 'ready_final', 'claim', 'claim_final', 'budget-ready', 'budget-claim'])('same-transaction cancellation at %s survives refusal', async phase => {
        const child = ['prepare', 'prepare_final'].includes(phase) ? null : await prepareChild();
        if (['claim', 'claim_final', 'budget-claim'].includes(phase)) await ready(child);
        const cancel = async () => {
            hook = null; budgetHook = null;
            await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'controlled_cancel' });
        };
        if (phase.startsWith('budget-')) budgetHook = cancel;
        else hook = async args => { if (args.phase === phase) await cancel(); };
        await expect(child === null ? prepareChild() : ['ready', 'ready_final', 'budget-ready'].includes(phase) ? ready(child) : claim(child)).rejects.toThrow();
        expect(await current()).toMatchObject({ cancelRequested: true });
        const childState = child ? await read('effect', child) : null;
        expect(childState?.status ?? null).toBe(child ? phase.includes('claim') ? 'ready' : 'prepared' : null);
        expect(childState?.dispatchToken ?? null).toBeNull();
    });
    test.each(['prepare_final', 'ready_final', 'claim_final'])('final %s rechecks the original grant', async phase => {
        const child = phase === 'prepare_final' ? null : await prepareChild();
        if (phase === 'claim_final') await ready(child);
        hook = async args => { if (args.phase === phase) revoked = true; };
        const before = await current();
        await expect(child === null ? prepareChild() : phase === 'ready_final' ? ready(child) : claim(child)).rejects.toMatchObject({ code: 'controlled_revoked' });
        expect(await current()).toEqual(before);
    });
    test.each(['prepare_final', 'ready_final', 'claim_final'])('a Port error after same-transaction cancellation at %s keeps the cancellation', async phase => {
        const child = phase === 'prepare_final' ? null : await prepareChild();
        if (phase === 'claim_final') await ready(child);
        hook = async args => {
            if (args.phase !== phase) return;
            hook = null;
            await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'controlled_cancel' });
            throw new TypeError('Controlled Port failure after cancellation');
        };
        await expect(child === null ? prepareChild() : phase === 'ready_final' ? ready(child) : claim(child)).rejects.toThrow('Controlled Port failure after cancellation');
        expect(await current()).toMatchObject({ cancelRequested: true });
    });
});
