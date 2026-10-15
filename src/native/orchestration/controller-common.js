import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';

export const controlCommandId = (operation, identity) => 'ocmd_' + hashNativeDocument({ operation, identity }).slice(0, 32);
export const runGuard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });
export const controlRecordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });

export async function readAttempt(tx, handle, root, attemptId) {
    assertNativeId(attemptId, 'orchestrationAttempt');
    if (!root.attemptRefs.includes(attemptId)) throw new TypeError('Attempt does not belong to Run');
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId));
    if (!record) throw new TypeError('Missing Run attempt');
    const attempt = record.doc;
    assertObject(attempt, ['schemaVersion', 'runId', 'nodeId', 'attemptId', 'attemptNumber', 'epoch', 'graphRevision', 'inputRefs', 'inputDigest', 'sourceBindingDigest', 'effectiveGrantDigest', 'budgetRef', 'status', 'effectRefs', 'resultRefs', 'startedAt', 'endedAt', 'reasonCode'], 'NodeAttempt');
    if (attempt.schemaVersion !== 1 || attempt.runId !== root.runId || attempt.attemptId !== attemptId || !root.graph.nodes.some(node => node.nodeId === attempt.nodeId)) throw new TypeError('NodeAttempt identity mismatch');
    assertCounter(attempt.attemptNumber, 'attemptNumber', 1); assertCounter(attempt.epoch, 'attempt.epoch'); assertCounter(attempt.graphRevision, 'attempt.graphRevision');
    for (const field of ['inputDigest', 'sourceBindingDigest', 'effectiveGrantDigest']) assertDigest(attempt[field], field);
    if (!['pending', 'running', 'waiting_effect', 'waiting_approval', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.status)
        || !Array.isArray(attempt.inputRefs) || !Array.isArray(attempt.effectRefs) || !Array.isArray(attempt.resultRefs)) throw new TypeError('Invalid NodeAttempt state');
    return record;
}
