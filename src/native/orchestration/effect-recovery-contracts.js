import { ConflictError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';

import { controlCommandId, controlRecordKey, readAttempt, assertAttemptCurrent } from './controller-common.js';
import { readEffect, effectDecision, readApproval } from './effect-contracts.js';

const denied = () => { throw new ConflictError('native_orchestration_effect_resume_denied'); };
export const effectResumeCommandId = (runId, effectId, epoch) => controlCommandId('effect.resume', { runId, effectId, epoch });
export const effectResumeReceiptId = (runId, effectId, epoch) => 'oreceipt_' + hash({ kind: 'ready_effect_resumed', runId, effectId, epoch }).slice(0, 32);

/** A single unclaimed intent, not a replay of an arbitrary suspended graph. */
export async function readReadyEffectRecovery(tx, handle, root, effectId) {
    const record = await readEffect(tx, handle, root, effectId), intent = record.doc;
    const attemptRecord = await readAttempt(tx, handle, root, intent.nodeAttemptId), attempt = attemptRecord.doc;
    if (root.parentRef !== null || root.cancelRequested || !['blocked', 'reconciling'].includes(root.status)
        || root.attemptRefs.length !== 1 || root.pendingEffectRefs.length !== 1 || root.pendingEffectRefs[0] !== effectId
        || root.pendingApprovalRefs.length || root.resultRefs.length || root.outputClaims.length
        || intent.status !== 'ready' || intent.dispatchToken !== null || !intent.budgetAttemptRef || intent.epoch >= root.epoch
        || intent.graphRevision !== root.graphRevision || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || attempt.status !== 'waiting_effect' || attempt.inputState !== 'prepared' || attempt.epoch !== intent.epoch
        || attempt.graphRevision !== root.graphRevision || attempt.sourceBindingDigest !== intent.sourceBindingDigest
        || attempt.effectiveGrantDigest !== intent.grantDigest || attempt.resultRefs.length || attempt.endedAt !== null
        || attempt.effectRefs.length !== 1 || attempt.effectRefs[0] !== effectId || !equalNativeDocuments(attempt.budgetRef, root.budgetAuthorityRef)) denied();
    await assertAttemptCurrent(tx, handle, root, attempt);
    const command = await tx.getResource({ kind: K.orchestrationCommand, handle, commandId: controlCommandId('effect.claim', effectId) });
    if (command) throw new ConflictError('native_orchestration_effect_already_claimed');
    if (intent.approvalRef !== null && (await readApproval(tx, handle, root, intent.approvalRef)).doc.status !== 'invalidated') denied();
    return { record, attemptRecord };
}

/** A resume receipt records fresh authorization; it never grants dispatch. */
export async function readReadyEffectResume(tx, handle, root, intent) {
    if (intent.epoch === 0) return null;
    const receiptId = effectResumeReceiptId(root.runId, intent.effectId, intent.epoch);
    const stored = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!stored) throw new TypeError('Recovered ready Effect lacks its authorization receipt');
    const receipt = stored.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'effectId', 'nodeAttemptId', 'previousEpoch', 'epoch',
        'previousHostBootId', 'previousHostGeneration', 'hostBootId', 'hostGeneration', 'previousIntentIntegrity', 'previousAttemptIntegrity',
        'sourceBindingDigest', 'decisionDigest', 'inputDigest', 'budgetAttemptRef', 'decisionSeq', 'createdAt'], 'Ready Effect resume receipt');
    for (const field of ['previousEpoch', 'epoch', 'previousHostGeneration', 'hostGeneration', 'decisionSeq', 'createdAt']) assertCounter(receipt[field], field);
    for (const field of ['previousIntentIntegrity', 'previousAttemptIntegrity', 'sourceBindingDigest', 'decisionDigest', 'inputDigest']) assertDigest(receipt[field], field);
    const attempt = (await readAttempt(tx, handle, root, intent.nodeAttemptId)).doc;
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'ready_effect_resumed' || receipt.receiptId !== receiptId
        || receipt.runId !== root.runId || receipt.effectId !== intent.effectId || receipt.nodeAttemptId !== intent.nodeAttemptId
        || receipt.previousEpoch >= receipt.epoch || receipt.epoch !== intent.epoch || receipt.epoch > root.epoch
        || receipt.hostBootId !== intent.hostBootId || receipt.hostGeneration !== intent.hostGeneration
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.decisionDigest !== hash(effectDecision(intent))
        || receipt.inputDigest !== attempt.inputDigest || !equalNativeDocuments(receipt.budgetAttemptRef, intent.budgetAttemptRef)
        || attempt.epoch !== intent.epoch || attempt.effectiveGrantDigest !== intent.grantDigest
        || receipt.decisionSeq < 1 || receipt.decisionSeq > root.eventSeq) throw new TypeError('Invalid ready Effect resume facts');
    const commandId = effectResumeCommandId(root.runId, intent.effectId, intent.epoch);
    const command = (await tx.getResource({ kind: K.orchestrationCommand, handle, commandId }))?.doc;
    const event = (await tx.getResource(controlRecordKey(handle, root.runId, 'event', 'event:' + receipt.decisionSeq)))?.doc;
    if (command?.operation !== 'runs.control.run.resume' || command.target !== root.runId || command.outcome.receiptId !== receiptId
        || command.payloadHash !== hash({ operation: 'runs.control.run.resume', body: { runId: root.runId, operation: 'run.resume', detail: { effectId: intent.effectId } } })
        || command.outcome.versions?.epoch !== intent.epoch
        || event?.type !== 'effect_resumed' || event.epoch !== intent.epoch || event.createdAt !== receipt.createdAt)
        throw new TypeError('Ready Effect resume lacks its original command and event');
    return receipt;
}
