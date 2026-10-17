import { assertObject, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { BudgetPort, assertBudgetAttemptRef, sendAttemptId } from './budget-port.js';
import { effectDecision } from './effect-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey } from './controller-common.js';

export const modelCompletionBindingDigest = intent => hash({ runId: intent.runId, effectId: intent.effectId, epoch: intent.epoch,
    hostBootId: intent.hostBootId, hostGeneration: intent.hostGeneration,
    sourceBindingDigest: intent.sourceBindingDigest, decision: effectDecision(intent) });
export const modelTerminalObservationId = (effectId, kind) => 'model.' + (kind === 'rejected' ? 'rejected:' : 'unconsumed:') + effectId;
const invalid = () => { throw new TypeError('Invalid original Model terminal receipt'); };

/** Historical facts only: a late response deliberately has no Result grant. */
async function readTerminalFact(handle, tx, root, intent, budgetPort = null) {
    if (root.ownerRef.handle !== handle || intent.capability !== 'generation.send' || !['failed', 'confirmed'].includes(intent.status)) return null;
    const kind = intent.status === 'failed' ? 'rejected' : 'late_response';
    const observationId = modelTerminalObservationId(intent.effectId, kind);
    const receiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId }).slice(0, 32);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    const reference = receipt.dispatchEvidence?.reference;
    if (receipt.schemaVersion !== 1 || receipt.receiptId !== receiptId || receipt.runId !== root.runId || receipt.effectId !== intent.effectId
        || receipt.observationId !== observationId || receipt.observedEpoch !== intent.epoch || receipt.outcome !== intent.status
        || receipt.reasonCode !== (kind === 'rejected' ? 'generation_provider_rejected' : 'generation_response_not_consumed')
        || receipt.dispatchEvidence.kind !== 'original_port_observation' || reference?.protocol !== 'generation_terminal'
        || reference.kind !== kind || reference.completionBindingDigest !== modelCompletionBindingDigest(intent)
        || receipt.remoteOperationRef !== null || receipt.domainReceiptRef !== null || hash(receipt.resultRefs) !== hash([])
        || hash(receipt.sourceRefs) !== hash([root.sourceBinding.sourceRef]) || !Array.isArray(reference.attempts) || !reference.attempts.length) invalid();
    assertObject(reference, ['protocol', 'kind', 'completionBindingDigest', 'responseHash', 'finalRequestHash', 'attempts'], 'Model terminal fact');
    assertDigest(reference.finalRequestHash, 'finalRequestHash');
    if (kind === 'rejected' ? reference.responseHash !== null : !/^[a-f0-9]{64}$/.test(reference.responseHash)) invalid();
    let closed = true;
    for (const [ordinal, send] of reference.attempts.entries()) {
        assertObject(send, ['budgetAttemptRef', 'requestId', 'targetFingerprint', 'inputFingerprint', 'compiledBindingFingerprint', 'requestSnapshotHash', 'outcome', 'httpStatus', 'status', 'usageHash'], 'Model terminal send');
        const ref = send.budgetAttemptRef; assertBudgetAttemptRef(ref);
        if (ref.kind !== undefined || ref.effectId !== intent.effectId || ref.providerSendOrdinal !== ordinal || ref.attemptId !== sendAttemptId(intent.effectId, ordinal)
            || hash(ref.authorityRef) !== hash(root.budgetAuthorityRef) || ordinal === 0 && hash(ref) !== hash(intent.budgetAttemptRef)
            || !['charged', 'unknown', 'settled'].includes(send.status)) invalid();
        for (const field of ['targetFingerprint', 'inputFingerprint', 'compiledBindingFingerprint', 'requestSnapshotHash', 'usageHash']) assertDigest(send[field], field);
        const response = kind === 'late_response' && ordinal === reference.attempts.length - 1;
        if (response ? send.outcome !== 'response_validated' || send.httpStatus !== null
            : send.outcome !== 'http_rejected' || !Number.isInteger(send.httpStatus) || send.httpStatus < 400 || send.httpStatus > 599) invalid();
        if (budgetPort) {
            const verified = await BudgetPort.prototype.verifyBudgetAttempt.call(budgetPort, { handle, tx, root, intent, budgetAttemptRef: ref,
                expectedSend: Object.fromEntries(['requestId', 'targetFingerprint', 'inputFingerprint'].map(field => [field, send[field]])) });
            const row = await BudgetPort.prototype.observeAttempt.call(budgetPort, handle, ref);
            if (row.status !== verified.status) invalid();
            if (send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)
                || send.status === 'unknown' && row.status === 'charged') invalid();
            closed &&= row.status === 'settled';
        }
    }
    if (reference.finalRequestHash !== reference.attempts.at(-1).requestSnapshotHash
        || hash(receipt.budgetObservationRef) !== hash({ authorityRef: root.budgetAuthorityRef,
            attempts: reference.attempts.map(({ budgetAttemptRef, status, usageHash }) => ({ budgetAttemptRef, status, usageHash })) })) invalid();
    const { schemaVersion: _schema, runId: _run, effectId: _effect, receiptId: _receipt, observedAt: _time, ...observation } = receipt;
    return { outcome: receipt.outcome, kind, ...(budgetPort ? { closed } : {}), receiptRef: { runId: root.runId, receiptId }, observation };
}

/** Metadata read only. Fee closure and recipient permission are separate. */
export function readModelTerminalFact(handle, tx, root, intent) { return readTerminalFact(handle, tx, root, intent); }

export function readModelTerminalReceipt(handle, tx, root, intent, budgetPort) {
    if (!(budgetPort instanceof BudgetPort)) throw new TypeError('Original Model bank required');
    return readTerminalFact(handle, tx, root, intent, budgetPort);
}

export async function readModelFailureReceipt(...args) {
    const receipt = await readModelTerminalReceipt(...args);
    return receipt?.kind === 'rejected' ? receipt : null;
}
