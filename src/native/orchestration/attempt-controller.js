import { ConflictError } from '../../storage/errors.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { assertNativeId } from '../identity.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, graphReachable, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readEffect } from './effect-contracts.js';
import { assertResultRefs, writeAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';

export class AttemptController {
    constructor({ runs, authorizeAttempt, verifySettlement, authorizeReservation }) {
        if (!runs || typeof authorizeAttempt !== 'function') throw new TypeError('AttemptController requires original admission checks');
        Object.assign(this, { runs, authorizeAttempt, verifySettlement, authorizeReservation });
    }

    async reserve(handle, input) {
        if (typeof this.authorizeReservation !== 'function') throw new TypeError('Attempt reservation requires original fanout/scope authority');
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'producerAttemptId', 'nodeId'], 'reserveAttempt');
        const { producerAttemptId, nodeId, ...guard } = cloneNativeDocument(input);
        assertNativeId(producerAttemptId, 'orchestrationAttempt'); assertNativeId(nodeId, 'orchestrationNode');
        const identity = hashNativeDocument({ kind: 'fanout_reservation', runId: guard.runId, producerAttemptId, nodeId });
        const attemptId = 'oattempt_' + identity.slice(0, 32), receiptId = 'oreceipt_' + identity.slice(0, 32);
        return this.runs.control(handle, controlCommandId('attempt.reserve', identity), { ...guard, operation: 'attempt.reserve', detail: { producerAttemptId, nodeId } }, async ({ tx, root, now }) => {
            const { doc: producer } = await readAttempt(tx, handle, root, producerAttemptId);
            const sourceNode = root.graph.nodes.find(node => node.nodeId === producer.nodeId), target = root.graph.nodes.find(node => node.nodeId === nodeId);
            if (root.cancelRequested || root.status !== 'running' || sourceNode.kind !== 'fanout' || producer.status !== 'running' || producer.epoch !== root.epoch
                || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || producer.effectRefs.length || !target || nodeId === producer.nodeId || root.nodeControl[nodeId].disposition !== 'eligible'
                || !graphReachable(root.graph, producer.nodeId, nodeId)) throw new ConflictError('native_orchestration_reservation_not_admitted');
            if (now >= root.progress.deadlineAt || root.progress.steps >= root.limits.maxSteps || root.progress.attempts >= root.limits.maxAttempts) throw new ConflictError('native_orchestration_limit_exhausted');
            let number = 1;
            for (const ref of root.attemptRefs) {
                const { doc } = await readAttempt(tx, handle, root, ref);
                if (doc.nodeId !== nodeId) continue;
                if (!SETTLED_ATTEMPT_STATUSES.includes(doc.status)) throw new ConflictError('native_orchestration_attempt_already_active');
                number++;
            }
            await this.authorizeReservation({ handle, tx, root, producer, target, attemptId });
            const attempt = { schemaVersion: 1, runId: root.runId, nodeId, attemptId, attemptNumber: number, epoch: root.epoch, graphRevision: root.graphRevision,
                inputState: 'reserved', reservationRef: { producerAttemptId }, inputRefs: null, inputDigest: null, sourceBindingDigest: root.sourceBinding.bindingDigest,
                effectiveGrantDigest: null, budgetRef: null, status: 'reserved', effectRefs: [], resultRefs: [], startedAt: null, endedAt: null, reasonCode: null };
            const receipt = { schemaVersion: 1, receiptKind: 'attempt_reservation', receiptId, runId: root.runId, producerAttemptId, nodeAttemptId: attemptId,
                epoch: root.epoch, graphRevision: root.graphRevision, decisionSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), attempt);
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
            root.attemptRefs.push(attemptId); root.progress.attempts++; root.progress.steps++;
            return { root, eventType: 'attempt_identity_reserved', reasonCode: null, outcome: { attemptId, reservationReceipt: receipt } };
        });
    }

    async activate(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'attemptId'], 'activate');
        const { attemptId, ...guard } = input;
        return this.runs.control(handle, controlCommandId('attempt.activate', attemptId), { ...guard, operation: 'attempt.activate', detail: { attemptId } }, async ({ tx, root, now }) => {
            const record = await readAttempt(tx, handle, root, attemptId), attempt = record.doc;
            if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.nodeControl[attempt.nodeId].disposition !== 'eligible'
                || attempt.status !== 'pending' || attempt.epoch !== root.epoch || now >= root.progress.deadlineAt) throw new ConflictError('native_orchestration_attempt_not_admitted');
            let activeCount = 0;
            for (const id of root.attemptRefs) {
                const { doc } = await readAttempt(tx, handle, root, id);
                if (['running', 'waiting_effect', 'waiting_approval'].includes(doc.status)) activeCount++;
            }
            if (activeCount >= root.limits.maxConcurrency || root.progress.steps >= root.limits.maxSteps) throw new ConflictError('native_orchestration_limit_exhausted');
            await this.authorizeAttempt({ handle, tx, root, attempt });
            await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId), { ...attempt, status: 'running', startedAt: now }, { expectedIntegrity: record.integrity });
            root.status = 'running'; root.progress.steps++;
            return { root, eventType: 'attempt_activated', reasonCode: null, outcome: { attemptId, status: 'running' } };
        });
    }

    async settle(handle, input) {
        if (typeof this.verifySettlement !== 'function') throw new TypeError('Attempt settlement requires original source/result authority');
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'attemptId', 'outcome', 'resultRefs', 'effectReceiptRefs', 'reasonCode'], 'settle');
        const { attemptId, outcome, resultRefs, effectReceiptRefs, reasonCode, ...guard } = cloneNativeDocument(input);
        assertResultRefs(resultRefs);
        if (!Array.isArray(effectReceiptRefs) || !SETTLED_ATTEMPT_STATUSES.includes(outcome)) throw new TypeError('Invalid settlement');
        return this.runs.control(handle, controlCommandId('attempt.settle', attemptId), { ...guard, operation: 'attempt.settle', detail: { attemptId, outcome, resultRefs, effectReceiptRefs, reasonCode } }, async ({ tx, root, now }) => {
            const record = await readAttempt(tx, handle, root, attemptId), attempt = record.doc;
            const node = root.graph.nodes.find(item => item.nodeId === attempt.nodeId);
            if (root.cancelRequested || root.status !== 'running' || ['join', 'output'].includes(node.kind) || attempt.epoch !== root.epoch
                || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest || attempt.status !== 'running') throw new ConflictError('native_orchestration_attempt_not_settleable');
            if (root.progress.steps >= root.limits.maxSteps) throw new ConflictError('native_orchestration_limit_exhausted');
            const receipts = [];
            for (const receiptId of effectReceiptRefs) {
                assertNativeId(receiptId, 'orchestrationReceipt');
                const stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
                if (!stored || stored.doc.receiptId !== receiptId || stored.doc.runId !== root.runId || !attempt.effectRefs.includes(stored.doc.effectId)) throw new TypeError('EffectReceipt does not belong to Attempt');
                receipts.push(stored.doc);
            }
            for (const effectId of attempt.effectRefs) {
                const { doc: effect } = await readEffect(tx, handle, root, effectId);
                if (root.pendingEffectRefs.includes(effectId) || !['confirmed', 'failed', 'not_dispatched'].includes(effect.status)
                    || !receipts.some(receipt => receipt.effectId === effectId && receipt.outcome === effect.status && (effect.budgetAttemptRef === null || receipt.budgetObservationRef !== null))) throw new ConflictError('native_orchestration_effect_unsettled');
            }
            await this.verifySettlement({ handle, tx, root, attempt, outcome, resultRefs, receipts, reasonCode });
            const receipt = await writeAttemptSettlement({ tx, handle, root, record, outcome, resultRefs, effectReceiptRefs, reasonCode, now });
            root.progress.steps++;
            return { root, eventType: 'attempt_settled', reasonCode, outcome: { attemptReceipt: receipt } };
        });
    }
}
