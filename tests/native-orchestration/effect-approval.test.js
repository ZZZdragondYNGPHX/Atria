import { randomBytes } from 'node:crypto';
import { ConflictError } from '../../src/storage/errors.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { EffectController } from '../../src/native/orchestration/effect-controller.js';
import { ApprovalController } from '../../src/native/orchestration/approval-controller.js';
import { approvalBinding } from '../../src/native/orchestration/effect-contracts.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);

// These are explicit P2 test Ports. They prove Host control semantics, never
// Provider billing, remote protocol behavior or a real trusted Review Origin.
describe.each(CONTRACT_HARNESSES)('$name S2 durable Effect/Approval core with controlled Ports', ({ make }) => {
    let h, runs, effects, approvals, runId, attemptId, endpoint, approvalRequired, revoked, accountVersion;
    const budgets = new Map(), observations = new Map(), challenges = new Map();
    beforeEach(async () => {
        budgets.clear(); observations.clear(); challenges.clear();
        endpoint = 'original-endpoint-v1'; approvalRequired = false; revoked = false; accountVersion = hashNativeDocument({ account: 1 });
        h = await make();
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const fixture = planFixture(), output = fixture.definition.nodes[0], agentId = id('Node');
        fixture.definition.nodes = [
            { nodeId: agentId, kind: 'agent', label: 'Controlled test agent', inputs: [], outputs: [{ name: 'body', type: 'text.body', required: false }], dependencyPinIds: ['test.route'], capabilities: ['test.effect'], policy: { agentPinId: 'test.route' } },
            { ...output, inputs: [{ name: 'body', type: 'text.body', required: true }] },
        ];
        fixture.definition.edges = [{ edgeId: id('Edge'), from: { nodeId: agentId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 10 }];
        fixture.definition.entryNodeIds = [agentId]; fixture.definition.capabilityCeiling = ['test.effect']; fixture.definition.limits.maxSteps = 50;
        fixture.dependencyPins = [{ pinId: 'test.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) }];
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-port', sourceRef: { sourceId: 'test-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { authority: 'controlled-test-original-bank' } }) });
        let root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } });
        runId = root.runId;
        ({ attemptId } = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: agentId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument({ grants: 'test.effect' }), budgetRef: root.budgetAuthorityRef }));
        root = await runs.get(h.handle, runId);
        await new AttemptController({ runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(root), attemptId });
        effects = new EffectController({ runs,
            authorizeEffect: async ({ proposal, intent }) => {
                if (revoked) throw new ConflictError('controlled_original_grant_revoked');
                const value = proposal ?? intent;
                return { actionRef: value.actionRef, targetRef: value.targetRef, inputRef: value.inputRef, inputHash: value.inputHash, capability: 'test.effect',
                    endpointBindingDigest: hashNativeDocument(endpoint), grantDigest: hashNativeDocument({ grants: 'test.effect' }), risk: approvalRequired ? 'R2' : 'R1',
                    egressDigest: hashNativeDocument({ target: 'test-target' }), budgetEnvelopeDigest: hashNativeDocument({ originalCeiling: 'test-bank-policy' }),
                    dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' }, requiresApproval: approvalRequired };
            },
            verifyBudgetAttempt: async ({ intent, budgetAttemptRef }) => {
                if (hashNativeDocument(budgets.get(intent.effectId) ?? null) !== hashNativeDocument(budgetAttemptRef)) throw new ConflictError('controlled_original_budget_not_admitted');
            },
            verifyObservation: async ({ intent, observation }) => {
                const evidence = observations.get(observation.observationId);
                if (!evidence || evidence.effectId !== intent.effectId || hashNativeDocument(evidence.observation) !== hashNativeDocument(observation)) throw new TypeError('Original test Port has no such receipt');
            },
            verifyApproval: async ({ decision }) => {
                if (decision.authenticationContextRef.accountVersion !== accountVersion) throw new ConflictError('controlled_original_account_changed');
            },
        });
        approvals = new ApprovalController({ runs,
            authorizeRequest: async ({ root, intent, approvalId, expiresAt }) => {
                const actorRequirement = { handle: h.handle }, bindingHash = hashNativeDocument(approvalBinding(intent, approvalId, actorRequirement, expiresAt));
                const current = challenges.get(approvalId);
                if (current && current.bindingHash !== bindingHash) throw new Error('Challenge ID collision');
                if (!current) challenges.set(approvalId, { nonce: randomBytes(32).toString('hex'), bindingHash });
                return { actorRequirement, requestNonceHash: hashNativeDocument(challenges.get(approvalId).nonce) };
            },
            verifyDecision: async ({ proof }) => {
                if (proof.contextRef?.contextId !== 'trusted-test-review-session') throw new ConflictError('controlled_original_reauthentication_missing');
                return { principalRef: { handle: h.handle }, authenticationContextRef: { authority: 'native_user_reauthentication', accountVersion, contextId: 'trusted-test-review-session' } };
            },
        });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    const current = () => runs.get(h.handle, runId);
    const read = async (type, recordId) => (await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, type, recordId))))?.doc;
    test('an Attempt with an unresolved Effect cannot fabricate terminal success for a Join', async () => {
        await prepare();
        const controller = new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async () => { throw new Error('must not reach the Result Port'); } });
        const before = await current();
        await expect(controller.settle(h.handle, { ...runGuard(before), attemptId, outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: null })).rejects.toMatchObject({ code: 'native_orchestration_attempt_not_settleable' });
        expect(await current()).toEqual(before);
    });
    async function prepare() {
        const effectId = id('Effect');
        await effects.prepare(h.handle, { ...runGuard(await current()), effectId, nodeAttemptId: attemptId, proposal: { actionRef: { actionId: 'test.effect', version: '1' }, targetRef: { authority: 'test-target' }, inputRef: { artifactId: 'test-input' }, inputHash: hashNativeDocument({ input: 'test-input' }) } });
        return effectId;
    }
    async function ready(effectId) {
        const budgetAttemptRef = { authority: 'controlled-test-original-bank', effectId, attemptId: 'sub-send-0' };
        budgets.set(effectId, budgetAttemptRef);
        return effects.ready(h.handle, { ...runGuard(await current()), effectId, budgetAttemptRef });
    }
    async function approve(effectId, decision = 'approve') {
        const approvalId = id('Approval');
        await approvals.request(h.handle, { ...runGuard(await current()), effectId, approvalId, expiresAt: Date.now() + 10000 });
        const proof = { nonce: challenges.get(approvalId).nonce, contextRef: { contextId: 'trusted-test-review-session' } };
        await approvals.decide(h.handle, { ...runGuard(await current()), approvalId, decision, proof });
        return { approvalId, proof };
    }
    async function observe(effectId, outcome, suffix) {
        const intent = await read('effect', effectId);
        const observation = { observationId: 'observation:' + suffix, observedEpoch: intent.epoch, outcome,
            dispatchEvidence: { kind: outcome === 'unknown' ? 'unknown_dispatch' : outcome === 'not_dispatched' ? 'proven_not_dispatched' : 'original_port_observation', reference: outcome === 'unknown' ? null : { evidenceId: 'original:' + suffix } },
            remoteOperationRef: outcome === 'confirmed' || outcome === 'failed' ? { operationId: 'original-operation' } : null, domainReceiptRef: null,
            budgetObservationRef: { authority: 'controlled-test-original-bank', observationId: suffix }, resultRefs: [], sourceRefs: [], reasonCode: outcome === 'unknown' ? 'transport_unknown' : null };
        observations.set(observation.observationId, { effectId, observation });
        return effects.observe(h.handle, { ...runGuard(await current()), effectId, observation });
    }

    test('prepared intent is durable before budget/dispatch; only one claim grants a test-Port transmission permit', async () => {
        const effectId = await prepare();
        expect(await read('effect', effectId)).toMatchObject({ status: 'prepared', budgetAttemptRef: null, dispatchToken: null });
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_effect_not_ready' });
        await ready(effectId);
        const input = { ...runGuard(await current()), effectId };
        const claims = await Promise.all([effects.claim(h.handle, input), effects.claim(h.handle, input)]);
        expect(claims.filter(claim => claim.claimed)).toHaveLength(1);
        expect(claims.find(claim => !claim.claimed)).toMatchObject({ dispatchToken: null, outcome: { dispatchToken: null } });
        const durable = await read('effect', effectId);
        expect(durable).toMatchObject({ status: 'dispatching', dispatchToken: claims.find(claim => claim.claimed).dispatchToken });
        let testPortSends = 0;
        for (const claim of claims) if (claim.claimed) { expect(durable.dispatchToken).toBe(claim.dispatchToken); testPortSends++; }
        expect(testPortSends).toBe(1);
    });

    test('approval requires original identity Port proof; approval consumption and dispatch claim are one durable transaction', async () => {
        approvalRequired = true;
        const effectId = await prepare(); await ready(effectId);
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_approval_required' });
        const approvalId = id('Approval');
        await approvals.request(h.handle, { ...runGuard(await current()), effectId, approvalId, expiresAt: Date.now() + 10000 });
        const nonce = challenges.get(approvalId).nonce;
        await expect(approvals.decide(h.handle, { ...runGuard(await current()), approvalId, decision: 'approve', proof: { nonce, contextRef: { contextId: 'model-confirm-true' } } })).rejects.toMatchObject({ code: 'controlled_original_reauthentication_missing' });
        const proof = { nonce, contextRef: { contextId: 'trusted-test-review-session' } };
        await approvals.decide(h.handle, { ...runGuard(await current()), approvalId, decision: 'approve', proof });
        const claim = await effects.claim(h.handle, { ...runGuard(await current()), effectId });
        expect(claim.claimed).toBe(true);
        expect(await read('approval', approvalId)).toMatchObject({ status: 'consumed' });
        const rows = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId }));
        expect(JSON.stringify(rows)).not.toContain(nonce);
        expect((await current()).pendingApprovalRefs).toEqual([]);
    });

    test('changed endpoint or original account invalidates approved dispatch without consuming the approval', async () => {
        approvalRequired = true;
        const effectId = await prepare(); await ready(effectId);
        const { approvalId } = await approve(effectId);
        endpoint = 'changed-endpoint';
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_effect_authority_changed' });
        endpoint = 'original-endpoint-v1'; accountVersion = hashNativeDocument({ account: 2 });
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'controlled_original_account_changed' });
        expect((await read('approval', approvalId)).status).toBe('approved');
        expect((await read('effect', effectId)).dispatchToken).toBeNull();
    });

    test('unknown is never re-sent; correlated later proof appends a receipt without erasing unknown history', async () => {
        const effectId = await prepare(); await ready(effectId);
        await effects.claim(h.handle, { ...runGuard(await current()), effectId });
        await observe(effectId, 'unknown', 'lost-response');
        expect((await current()).status).toBe('reconciling');
        expect((await effects.claim(h.handle, { ...runGuard(await current()), effectId })).claimed).toBe(false);
        await expect(prepare()).rejects.toMatchObject({ code: 'native_orchestration_effect_not_admitted' });
        await observe(effectId, 'confirmed', 'original-receipt');
        expect((await read('effect', effectId)).status).toBe('confirmed');
        expect((await current()).status).toBe('blocked');
        const receipts = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId, recordType: 'receipt' }));
        expect(receipts.map(record => record.doc.outcome).sort()).toEqual(['confirmed', 'unknown']);
    });

    test('contradictory original observations remain append-only and require reconciliation rather than overwriting evidence', async () => {
        const effectId = await prepare(); await ready(effectId);
        await effects.claim(h.handle, { ...runGuard(await current()), effectId });
        await observe(effectId, 'confirmed', 'first-original-status');
        await observe(effectId, 'failed', 'contradictory-original-status');
        expect((await read('effect', effectId)).status).toBe('unknown');
        expect((await current()).status).toBe('reconciling');
        const receipts = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId, recordType: 'receipt' }));
        expect(receipts.map(record => record.doc.outcome).sort()).toEqual(['confirmed', 'failed']);
        expect((await effects.claim(h.handle, { ...runGuard(await current()), effectId })).claimed).toBe(false);
    });

    test('cancel after claim retains actual late receipt and original budget reference without refund or output rewrite', async () => {
        const effectId = await prepare(); await ready(effectId);
        await effects.claim(h.handle, { ...runGuard(await current()), effectId });
        const before = await current();
        const cancelled = await runs.cancel(h.handle, id('Command'), { ...runGuard(before), reasonCode: 'user_cancelled' });
        expect(cancelled.status).toBe('reconciling');
        await observe(effectId, 'confirmed', 'late-confirmation');
        expect(await current()).toMatchObject({ status: 'cancelled', cancelRequested: true, budgetAuthorityRef: before.budgetAuthorityRef, outputClaims: before.outputClaims });
        await observe(effectId, 'confirmed', 'late-additional-observation');
        expect((await current()).status).toBe('cancelled');
    });

    test('rejected approval does not claim a refund or permit dispatch', async () => {
        approvalRequired = true;
        const effectId = await prepare(); await ready(effectId);
        const { approvalId } = await approve(effectId, 'reject');
        expect((await read('approval', approvalId)).status).toBe('rejected');
        expect((await current()).status).toBe('blocked');
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_effect_stale' });
        expect(budgets.has(effectId)).toBe(true);
    });

    test('a committed claim whose ACK is lost never grants a second permit on replay', async () => {
        approvalRequired = true;
        const effectId = await prepare(); await ready(effectId);
        const { approvalId } = await approve(effectId);
        const input = { ...runGuard(await current()), effectId };
        const transaction = h.engine.withTransaction.bind(h.engine);
        let drop = true;
        h.engine.withTransaction = async (...args) => {
            const outcome = await transaction(...args);
            if (drop) { drop = false; throw Object.assign(new Error('Locally withheld committed ACK'), { code: 'storage_commit_unknown' }); }
            return outcome;
        };
        await expect(effects.claim(h.handle, input)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
        expect((await read('effect', effectId)).status).toBe('dispatching');
        expect((await read('approval', approvalId)).status).toBe('consumed');
        expect(await effects.claim(h.handle, { ...runGuard(await current()), effectId })).toMatchObject({ replayed: true, claimed: false, dispatchToken: null, outcome: { dispatchToken: null } });
    });

    test('cancellation invalidates unconsumed approval and expiry never becomes a dispatch permit', async () => {
        approvalRequired = true;
        const effectId = await prepare(); await ready(effectId);
        const { approvalId } = await approve(effectId);
        const approval = await read('approval', approvalId);
        runs.now = () => approval.expiresAt + 1;
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_approval_invalid' });
        runs.now = Date.now;
        await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'cancel_waiting_approval' });
        expect((await read('approval', approvalId)).status).toBe('invalidated');
        expect((await current()).pendingApprovalRefs).toEqual([]);
    });

    test('unverified budget and fabricated receipt cannot become Native authority', async () => {
        const effectId = await prepare();
        await expect(effects.ready(h.handle, { ...runGuard(await current()), effectId, budgetAttemptRef: { modelSaysApproved: true } })).rejects.toMatchObject({ code: 'controlled_original_budget_not_admitted' });
        await ready(effectId); await effects.claim(h.handle, { ...runGuard(await current()), effectId });
        const observation = { observationId: 'forged-receipt', observedEpoch: (await read('effect', effectId)).epoch, outcome: 'confirmed', dispatchEvidence: { kind: 'original_port_observation', reference: { fake: true } }, remoteOperationRef: { fake: true }, domainReceiptRef: null, budgetObservationRef: null, resultRefs: [], sourceRefs: [], reasonCode: null };
        await expect(effects.observe(h.handle, { ...runGuard(await current()), effectId, observation })).rejects.toThrow('Original test Port has no such receipt');
        expect((await read('effect', effectId)).status).toBe('dispatching');
    });
});
