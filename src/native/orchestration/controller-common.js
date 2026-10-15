import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';

export const controlCommandId = (operation, identity) => 'ocmd_' + hashNativeDocument({ operation, identity }).slice(0, 32);
export const runGuard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });
export const controlRecordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });

export function graphReachable(graph, from, to) {
    const seen = new Set(), pending = [from];
    while (pending.length) {
        const id = pending.pop();
        if (id === to) return true;
        if (seen.has(id)) continue;
        seen.add(id); pending.push(...graph.edges.filter(edge => edge.from.nodeId === id).map(edge => edge.to.nodeId));
    }
    return false;
}

export async function readAttempt(tx, handle, root, attemptId) {
    assertNativeId(attemptId, 'orchestrationAttempt');
    if (!root.attemptRefs.includes(attemptId)) throw new TypeError('Attempt does not belong to Run');
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId));
    if (!record) throw new TypeError('Missing Run attempt');
    const attempt = record.doc;
    assertObject(attempt, ['schemaVersion', 'runId', 'nodeId', 'attemptId', 'attemptNumber', 'epoch', 'graphRevision', 'inputState', 'reservationRef', 'inputRefs', 'inputDigest', 'sourceBindingDigest', 'effectiveGrantDigest', 'budgetRef', 'status', 'effectRefs', 'resultRefs', 'startedAt', 'endedAt', 'reasonCode'], 'NodeAttempt');
    if (attempt.schemaVersion !== 1 || attempt.runId !== root.runId || attempt.attemptId !== attemptId || !root.graph.nodes.some(node => node.nodeId === attempt.nodeId)) throw new TypeError('NodeAttempt identity mismatch');
    assertCounter(attempt.attemptNumber, 'attemptNumber', 1); assertCounter(attempt.epoch, 'attempt.epoch'); assertCounter(attempt.graphRevision, 'attempt.graphRevision');
    assertDigest(attempt.sourceBindingDigest, 'sourceBindingDigest');
    if (!['reserved', 'pending', 'running', 'waiting_effect', 'waiting_approval', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.status)
        || !Array.isArray(attempt.effectRefs) || !Array.isArray(attempt.resultRefs)) throw new TypeError('Invalid NodeAttempt state');
    if (attempt.reservationRef !== null) {
        assertObject(attempt.reservationRef, ['producerAttemptId'], 'reservationRef');
        assertNativeId(attempt.reservationRef.producerAttemptId, 'orchestrationAttempt');
        if (!root.attemptRefs.includes(attempt.reservationRef.producerAttemptId) || attempt.reservationRef.producerAttemptId === attemptId) throw new TypeError('Invalid reservation producer');
    }
    if (attempt.inputState === 'prepared') {
        assertDigest(attempt.inputDigest, 'inputDigest'); assertDigest(attempt.effectiveGrantDigest, 'effectiveGrantDigest');
        if (attempt.status === 'reserved' || !Array.isArray(attempt.inputRefs) || hashNativeDocument(attempt.inputRefs) !== attempt.inputDigest
            || !attempt.budgetRef || Object.prototype.toString.call(attempt.budgetRef) !== '[object Object]') throw new TypeError('Invalid prepared Attempt inputs');
    } else if (attempt.inputState === 'reserved') {
        if (!attempt.reservationRef || !['reserved', 'blocked', 'cancelled', 'stale'].includes(attempt.status) || attempt.inputRefs !== null || attempt.inputDigest !== null
            || attempt.effectiveGrantDigest !== null || attempt.budgetRef !== null || attempt.effectRefs.length || attempt.resultRefs.length || attempt.startedAt !== null) throw new TypeError('Reserved identity has no executable inputs/grant/budget');
    } else throw new TypeError('Invalid Attempt input state');
    return record;
}
