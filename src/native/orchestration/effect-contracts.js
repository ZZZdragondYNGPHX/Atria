import { assertObject, assertDigest, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument } from '../repositories/common.js';

import { controlRecordKey } from './controller-common.js';

export const EFFECT_DECISION_FIELDS = Object.freeze(['actionRef', 'targetRef', 'inputRef', 'inputHash', 'capability', 'endpointBindingDigest', 'grantDigest', 'risk', 'egressDigest', 'budgetEnvelopeDigest', 'dispatchPolicy', 'requiresApproval']);

export function assertEffectDecision(value) {
    assertObject(value, EFFECT_DECISION_FIELDS, 'EffectAuthorization');
    for (const field of ['actionRef', 'targetRef', 'inputRef']) if (!value[field] || Object.prototype.toString.call(value[field]) !== '[object Object]') throw new TypeError('Effect ' + field + ' must be an original reference');
    for (const field of ['inputHash', 'endpointBindingDigest', 'grantDigest', 'egressDigest', 'budgetEnvelopeDigest']) assertDigest(value[field], field);
    assertToken(value.capability, 'capability');
    if (!['R0', 'R1', 'R2', 'R3'].includes(value.risk) || typeof value.requiresApproval !== 'boolean' || (value.risk === 'R3' && !value.requiresApproval)) throw new TypeError('Invalid Effect risk/approval policy');
    assertObject(value.dispatchPolicy, ['idempotency', 'operationKey', 'reconcile'], 'dispatchPolicy');
    if (!['none', 'domain_key', 'remote_key'].includes(value.dispatchPolicy.idempotency) || !['domain_status', 'remote_status', 'manual'].includes(value.dispatchPolicy.reconcile)) throw new TypeError('Invalid Effect dispatch policy');
    const operationKey = value.dispatchPolicy.operationKey;
    if (value.dispatchPolicy.idempotency !== 'none' && (typeof operationKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(operationKey))) throw new TypeError('Idempotency requires an original operation key');
    if (value.dispatchPolicy.idempotency === 'none' && operationKey !== null) throw new TypeError('No invented idempotency key for an unsupported Port');
    return value;
}

export function effectDecision(intent) {
    return Object.fromEntries(EFFECT_DECISION_FIELDS.map(field => [field, intent[field]]));
}

export async function readEffect(tx, handle, root, effectId) {
    const record = await tx.getResource(controlRecordKey(handle, root.runId, 'effect', effectId));
    if (!record) throw new TypeError('Missing EffectIntent');
    return record;
}

export function approvalBinding(intent, approvalId, actorRequirement, expiresAt) {
    return { schemaVersion: 1, approvalId, effectId: intent.effectId, runId: intent.runId, nodeAttemptId: intent.nodeAttemptId,
        actionRef: intent.actionRef, targetRef: intent.targetRef, inputHash: intent.inputHash, endpointBindingDigest: intent.endpointBindingDigest,
        sourceBindingDigest: intent.sourceBindingDigest, grantDigest: intent.grantDigest, egressDigest: intent.egressDigest,
        budgetAttemptRef: intent.budgetAttemptRef, budgetEnvelopeDigest: intent.budgetEnvelopeDigest, dispatchPolicy: intent.dispatchPolicy,
        risk: intent.risk, hostBootId: intent.hostBootId, hostGeneration: intent.hostGeneration, epoch: intent.epoch,
        graphRevision: intent.graphRevision, actorRequirement, expiresAt };
}

export async function readApproval(tx, handle, root, approvalId) {
    const record = await tx.getResource(controlRecordKey(handle, root.runId, 'approval', approvalId));
    if (!record) throw new TypeError('Missing ApprovalRequest');
    return record;
}

export function currentApprovalBinding(intent, approval) {
    return hashNativeDocument(approvalBinding(intent, approval.approvalId, approval.actorRequirement, approval.expiresAt));
}
