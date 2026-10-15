import { randomUUID } from 'node:crypto';
import { ConflictError } from '../../storage/errors.js';
import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { assertEffectDecision, effectDecision, readEffect, readApproval, currentApprovalBinding } from './effect-contracts.js';
import { assertFanoutAdmission } from './fanout-controller.js';

const conflict = code => { throw new ConflictError(code); };
const TERMINAL_EFFECT = new Set(['confirmed', 'failed', 'not_dispatched']);

export class EffectController {
    constructor({ runs, authorizeEffect, verifyBudgetAttempt, verifyObservation, verifyApproval }) {
        for (const [name, value] of Object.entries({ authorizeEffect, verifyBudgetAttempt, verifyObservation, verifyApproval })) if (typeof value !== 'function') throw new TypeError('EffectController requires original authority Port: ' + name);
        Object.assign(this, { runs, authorizeEffect, verifyBudgetAttempt, verifyObservation, verifyApproval });
    }

    #step(root, now) {
        if (root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) conflict('native_orchestration_limit_exhausted');
        root.progress.steps++;
    }

    #current(root, intent) {
        if (root.cancelRequested || !['running', 'waiting_approval'].includes(root.status) || intent.epoch !== root.epoch
            || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest) conflict('native_orchestration_effect_stale');
    }

    async #revalidate(handle, tx, root, intent, phase) {
        const decision = cloneNativeDocument(await this.authorizeEffect({ handle, tx, root, intent, phase }));
        assertEffectDecision(decision);
        if (hashNativeDocument(decision) !== hashNativeDocument(effectDecision(intent))) conflict('native_orchestration_effect_authority_changed');
    }

    async prepare(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'effectId', 'nodeAttemptId', 'proposal'], 'prepareEffect');
        const { effectId, nodeAttemptId, proposal, ...guard } = input;
        assertNativeId(effectId, 'orchestrationEffect'); assertNativeId(nodeAttemptId, 'orchestrationAttempt');
        assertObject(proposal, ['actionRef', 'targetRef', 'inputRef', 'inputHash'], 'EffectProposal'); assertDigest(proposal.inputHash, 'inputHash');
        return this.runs.control(handle, controlCommandId('effect.prepare', effectId), { ...guard, operation: 'effect.prepare', detail: { effectId, nodeAttemptId, proposal } }, async ({ tx, root, now }) => {
            const attemptRecord = await readAttempt(tx, handle, root, nodeAttemptId), attempt = attemptRecord.doc;
            if (root.cancelRequested || !['running', 'waiting_approval'].includes(root.status) || attempt.status !== 'running' || attempt.epoch !== root.epoch
                || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest) conflict('native_orchestration_effect_not_admitted');
            await assertFanoutAdmission({ tx, handle, root, attempt, reserveSlot: false });
            const decision = cloneNativeDocument(await this.authorizeEffect({ handle, tx, root, attempt, proposal, phase: 'prepare' }));
            assertEffectDecision(decision);
            for (const field of ['actionRef', 'targetRef', 'inputRef', 'inputHash']) if (hashNativeDocument(decision[field]) !== hashNativeDocument(proposal[field])) throw new TypeError('Port changed the approved proposal');
            const node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
            if (!node.capabilities.includes(decision.capability) || !root.graph.capabilityCeiling.includes(decision.capability)) conflict('native_orchestration_effect_capability_denied');
            this.#step(root, now);
            const intent = { schemaVersion: 1, effectId, runId: root.runId, nodeAttemptId, epoch: root.epoch, graphRevision: root.graphRevision,
                hostBootId: root.hostBootId, hostGeneration: root.hostGeneration, ...decision, sourceBindingDigest: root.sourceBinding.bindingDigest,
                budgetAttemptRef: null, approvalRef: null, status: 'prepared', dispatchToken: null, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'effect', effectId), intent);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', nodeAttemptId), { ...attempt, status: 'waiting_effect', effectRefs: [...attempt.effectRefs, effectId] }, { expectedIntegrity: attemptRecord.integrity });
            root.pendingEffectRefs.push(effectId);
            return { root, eventType: 'effect_prepared', reasonCode: null, outcome: { effectId, status: 'prepared' } };
        });
    }

    async ready(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'effectId', 'budgetAttemptRef'], 'readyEffect');
        const { effectId, budgetAttemptRef, ...guard } = input;
        if (!budgetAttemptRef || Object.prototype.toString.call(budgetAttemptRef) !== '[object Object]') throw new TypeError('Original budget attempt reference is required');
        return this.runs.control(handle, controlCommandId('effect.ready', effectId), { ...guard, operation: 'effect.ready', detail: { effectId, budgetAttemptRef } }, async ({ tx, root, now }) => {
            const record = await readEffect(tx, handle, root, effectId), intent = record.doc;
            this.#current(root, intent);
            if (intent.status !== 'prepared') conflict('native_orchestration_effect_not_prepared');
            await this.#revalidate(handle, tx, root, intent, 'ready');
            await this.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef });
            this.#step(root, now);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', effectId), { ...intent, budgetAttemptRef, status: 'ready' }, { expectedIntegrity: record.integrity });
            if (intent.requiresApproval) root.status = 'waiting_approval';
            return { root, eventType: 'effect_ready', reasonCode: null, outcome: { effectId, status: 'ready' } };
        });
    }

    async claim(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'effectId'], 'claimEffect');
        const { effectId, ...guard } = input, dispatchToken = randomUUID();
        const ack = await this.runs.control(handle, controlCommandId('effect.claim', effectId), { ...guard, operation: 'effect.claim', detail: { effectId } }, async ({ tx, root, now }) => {
            const record = await readEffect(tx, handle, root, effectId), intent = record.doc;
            this.#current(root, intent);
            if (intent.status !== 'ready' || !intent.budgetAttemptRef) conflict('native_orchestration_effect_not_ready');
            const { doc: attempt } = await readAttempt(tx, handle, root, intent.nodeAttemptId);
            await assertFanoutAdmission({ tx, handle, root, attempt, reserveSlot: false });
            await this.#revalidate(handle, tx, root, intent, 'claim');
            await this.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
            if (intent.requiresApproval) {
                if (!intent.approvalRef) conflict('native_orchestration_approval_required');
                const approvalRecord = await readApproval(tx, handle, root, intent.approvalRef), approval = approvalRecord.doc;
                const decision = approval.decisionRef ? await checkedRecord(tx, controlRecordKey(handle, root.runId, 'approval', approval.decisionRef)) : null;
                if (approval.status !== 'approved' || approval.expiresAt <= now || approval.hostBootId !== root.hostBootId || approval.hostGeneration !== root.hostGeneration
                    || approval.epoch !== root.epoch || approval.bindingHash !== currentApprovalBinding(intent, approval) || decision?.doc.decision !== 'approve'
                    || decision.doc.bindingHash !== approval.bindingHash || decision.doc.expiresAt <= now) conflict('native_orchestration_approval_invalid');
                await this.verifyApproval({ handle, tx, root, intent, approval, decision: decision.doc });
                await putMutable(tx, controlRecordKey(handle, root.runId, 'approval', approval.approvalId), { ...approval, status: 'consumed' }, { expectedIntegrity: approvalRecord.integrity });
                root.pendingApprovalRefs = root.pendingApprovalRefs.filter(id => id !== approval.approvalId);
            }
            this.#step(root, now);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', effectId), { ...intent, status: 'dispatching', dispatchToken }, { expectedIntegrity: record.integrity });
            if (root.status === 'waiting_approval' && !root.pendingApprovalRefs.length) root.status = 'running';
            return { root, eventType: 'effect_dispatch_claimed', reasonCode: null, outcome: { effectId, status: 'dispatching', dispatchToken } };
        });
        // An old durable command outcome is never a second transmission permit.
        const token = ack.replayed ? null : ack.outcome.dispatchToken;
        return { ...ack, outcome: { ...ack.outcome, dispatchToken: token }, claimed: !ack.replayed, dispatchToken: token };
    }

    async observe(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'effectId', 'observation'], 'observeEffect');
        const { effectId, observation, ...guard } = input;
        assertObject(observation, ['observationId', 'observedEpoch', 'outcome', 'dispatchEvidence', 'remoteOperationRef', 'domainReceiptRef', 'budgetObservationRef', 'resultRefs', 'sourceRefs', 'reasonCode'], 'EffectObservation');
        if (typeof observation.observationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(observation.observationId)) throw new TypeError('Invalid observationId');
        if (!['confirmed', 'failed', 'not_dispatched', 'unknown'].includes(observation.outcome) || !Array.isArray(observation.resultRefs) || !Array.isArray(observation.sourceRefs)) throw new TypeError('Invalid Effect observation');
        assertObject(observation.dispatchEvidence, ['kind', 'reference'], 'dispatchEvidence');
        if (!['original_domain_receipt', 'original_port_observation', 'proven_not_dispatched', 'unknown_dispatch'].includes(observation.dispatchEvidence.kind)) throw new TypeError('Unsupported dispatch evidence kind');
        for (const field of ['remoteOperationRef', 'domainReceiptRef', 'budgetObservationRef']) if (observation[field] !== null
            && Object.prototype.toString.call(observation[field]) !== '[object Object]') throw new TypeError(field + ' must be an original receipt reference');
        if (observation.dispatchEvidence.reference !== null && Object.prototype.toString.call(observation.dispatchEvidence.reference) !== '[object Object]') throw new TypeError('dispatchEvidence.reference must be an original evidence reference');
        for (const ref of observation.resultRefs) {
            assertObject(ref, ['runId', 'resultId'], 'ResultRef');
            assertNativeId(ref.runId, 'orchestrationRun'); assertNativeId(ref.resultId, 'orchestrationResult');
        }
        if (observation.sourceRefs.some(ref => !ref || Object.prototype.toString.call(ref) !== '[object Object]')) throw new TypeError('SourceRefs must be original references');
        assertCounter(observation.observedEpoch, 'observedEpoch');
        const receiptId = 'oreceipt_' + hashNativeDocument({ effectId, observationId: observation.observationId }).slice(0, 32);
        return this.runs.control(handle, controlCommandId('effect.observe', { effectId, observationId: observation.observationId }), { ...guard, operation: 'effect.observe', detail: { effectId, observation } }, async ({ tx, root, now }) => {
            const record = await readEffect(tx, handle, root, effectId), intent = record.doc;
            if (observation.observedEpoch !== intent.epoch) conflict('native_orchestration_observation_epoch_mismatch');
            // This Port verifies original status/receipt/usage. A model or a
            // Browser Boolean cannot turn an unknown remote write into proof.
            await this.verifyObservation({ handle, tx, root, intent, observation });
            if (!observation.dispatchEvidence || (observation.outcome === 'confirmed' && !observation.domainReceiptRef && !observation.remoteOperationRef)
                || (observation.outcome === 'not_dispatched' && observation.dispatchEvidence.kind !== 'proven_not_dispatched')) throw new TypeError('Effect observation lacks dispatch/commit evidence');
            const contradictory = TERMINAL_EFFECT.has(intent.status) && TERMINAL_EFFECT.has(observation.outcome) && intent.status !== observation.outcome;
            const status = contradictory ? 'unknown' : TERMINAL_EFFECT.has(intent.status) && observation.outcome === 'unknown' ? intent.status : observation.outcome;
            const receipt = { schemaVersion: 1, receiptId, effectId, runId: root.runId, ...observation, observedAt: now };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', effectId), { ...intent, status }, { expectedIntegrity: record.integrity });
            const budgetPending = intent.budgetAttemptRef !== null && !observation.budgetObservationRef;
            if (status === 'unknown' || budgetPending) {
                if (!root.pendingEffectRefs.includes(effectId)) root.pendingEffectRefs.push(effectId);
                root.status = 'reconciling';
            } else {
                root.pendingEffectRefs = root.pendingEffectRefs.filter(id => id !== effectId);
                if (root.cancelRequested && !root.pendingEffectRefs.length) root.status = 'cancelled';
                else if (root.status === 'reconciling' && !root.pendingEffectRefs.length) root.status = 'blocked';
            }
            const attemptRecord = await readAttempt(tx, handle, root, intent.nodeAttemptId), attempt = attemptRecord.doc;
            if (attempt.epoch === root.epoch && !['completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.status)) {
                await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', intent.nodeAttemptId), { ...attempt, status: status === 'unknown' ? 'blocked' : root.cancelRequested ? 'cancelled' : 'running',
                    resultRefs: [...new Map([...attempt.resultRefs, ...observation.resultRefs].map(ref => [hashNativeDocument(ref), ref])).values()], reasonCode: contradictory ? 'conflicting_effect_observation' : observation.reasonCode }, { expectedIntegrity: attemptRecord.integrity });
            }
            return { root, eventType: 'effect_observed', reasonCode: contradictory ? 'conflicting_effect_observation' : observation.reasonCode, outcome: { effectId, receiptId, status } };
        });
    }
}
