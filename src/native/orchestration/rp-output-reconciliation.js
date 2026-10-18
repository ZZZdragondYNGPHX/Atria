import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { RpRunControl } from '../rp-run-control.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { rpNarrationPayload } from '../rp-output-protocol.js';
import { readRpNarrationResult } from './rp-narration-result-contracts.js';
import { rpOutputDomainRef } from './rp-output-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readAttempt } from './controller-common.js';
import { observeReconciledEffect } from './effect-reconciliation.js';

const fail = () => { throw new ConflictError('native_rp_output_reconciliation_unavailable'); };

/** Durable original facts only. This never recreates an output capture or permit. */
async function facts({ runs, budgetPort, rpControl }, handle, tx, root, intent) {
    if (!(rpControl instanceof RpRunControl) || rpControl._engine !== runs.engine || budgetPort.rpControl !== rpControl
        || !(rpControl._chatRepo instanceof ChatRepo) || rpControl._chatRepo._engine !== runs.engine) fail();
    const fence = await runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
    if (root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
        || root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null || root.graph.outputContract.kind !== 'rp_narration'
        || !['dispatching', 'unknown', 'confirmed'].includes(intent.status) || !intent.dispatchToken
        || intent.capability !== 'chat.output' || intent.risk !== 'R2' || intent.requiresApproval || intent.approvalRef !== null) fail();
    const domain = rpOutputDomainRef(root), input = intent.inputRef;
    const published = await readRpNarrationResult(tx, handle, root), output = (await readAttempt(tx, handle, root, intent.nodeAttemptId)).doc;
    if (!published || intent.effectId !== 'oeffect_' + hash({ runId: root.runId, outputKey: domain.outputKey, operationId: domain.operationId }).slice(0, 32)
        || intent.epoch !== published.receipt.epoch || intent.nodeAttemptId !== output.attemptId || output.nodeId !== root.graph.outputContract.ownerNodeId
        || intent.graphRevision !== output.graphRevision
        || output.epoch !== intent.epoch || output.effectiveGrantDigest !== published.receipt.grantDigest || intent.grantDigest !== output.effectiveGrantDigest
        || !equal(output.inputRefs, [published.receipt.resultRef]) || output.inputDigest !== hash(output.inputRefs)
        || !equal(output.effectRefs, [intent.effectId]) || !equal(output.budgetRef, root.budgetAuthorityRef)
        || !equal(intent.actionRef, { kind: 'native_rp_output', controlId: domain.controlId })
        || !equal(intent.targetRef, { kind: 'rp_chat', controlId: domain.controlId, outputKey: domain.outputKey })
        || intent.endpointBindingDigest !== hash({ domain: 'rp_chat', controlId: domain.controlId })
        || intent.egressDigest !== hash({ domain: 'local_chat', controlId: domain.controlId, outputKey: domain.outputKey })
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.inputHash !== hash(input)
        || !equal(input, { kind: 'native_rp_narration', resultRef: published.receipt.resultRef,
            modelEffectId: published.receipt.modelEffectId, modelReceiptRef: published.receipt.modelReceiptRef,
            controlId: domain.controlId, outputKey: domain.outputKey, operationId: domain.operationId,
            payloadHash: hash(rpNarrationPayload({ controlId: domain.controlId, source: root.sourceBinding.sourceRequest.source, text: published.record.payload })),
            sourceDigest: root.sourceBinding.sourceRef.prefixDigest, inputAnchor: root.sourceBinding.sourceRequest.source.input })
        || !equal(intent.dispatchPolicy, { idempotency: 'domain_key', operationKey: domain.operationId, reconcile: 'domain_status' })) fail();
    const model = (await readEffect(tx, handle, root, published.receipt.modelEffectId)).doc;
    if (intent.budgetEnvelopeDigest !== model.budgetEnvelopeDigest) fail();
    const control = await RpRunControl.prototype.status.call(rpControl, handle, domain.controlId, { tx });
    const receipt = control.outputReceipts[domain.outputKey];
    if (!receipt || receipt.operationId !== domain.operationId || receipt.payloadHash !== input.payloadHash || receipt.sourceDigest !== input.sourceDigest
        || !equal(receipt.source, root.sourceBinding.sourceRequest.source) || !equal(receipt.inputAnchor, input.inputAnchor)
        || !equal(receipt.hostFence, { hostBootId: intent.hostBootId, generation: intent.hostGeneration })) fail();
    await budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
    const work = await budgetPort.observeAttempt(handle, intent.budgetAttemptRef);
    if (intent.budgetAttemptRef.kind !== 'local_work' || intent.budgetAttemptRef.localWorkOrdinal !== 0
        || intent.budgetAttemptRef.reservationId !== null || work.kind !== 'rp_output') fail();
    return { domain, receipt, work };
}

async function observationFor(execution, rpControl, handle, tx, root, intent) {
    const { domain, receipt, work } = await facts({ ...execution, rpControl }, handle, tx, root, intent);
    if (receipt.status !== 'committed') return null;
    const budgetObservationRef = work.status === 'settled'
        ? { ...intent.budgetAttemptRef, status: work.status, usageHash: hash(work.usage) } : null;
    return { observationId: 'rp.output.reconcile:' + hash({ effectId: intent.effectId, receipt: hash(receipt), budgetObservationRef }),
        observedEpoch: intent.epoch, outcome: 'confirmed',
        dispatchEvidence: { kind: 'original_domain_receipt', reference: { ...domain, receiptIntegrity: hash(receipt) } },
        remoteOperationRef: null, domainReceiptRef: domain, budgetObservationRef, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef],
        reasonCode: 'rp_output_reconciled' };
}

export async function verifyRpOutputReconciliation(execution, rpControl, { handle, tx, root, intent, observation }) {
    const expected = await observationFor(execution, rpControl, handle, tx, root, intent);
    if (!expected || !equal(expected, observation)) fail();
}

/** Rechecks one stable original output operation; never calls the Chat writer. */
export async function reconcileRpOutputEffect(execution, rpControl, handle, request) {
    fields(request, ['runId', 'effectId'], 'RP output Effect reconciliation');
    const { runs, effects } = execution;
    if (effects.runs !== runs || runs.engine.hasActiveTransaction(handle)) fail();
    const before = await runs.engine.withTransaction(handle, async tx => {
        const root = await runs.get(handle, request.runId), intent = (await readEffect(tx, handle, root, request.effectId)).doc;
        return facts({ ...execution, rpControl }, handle, tx, root, intent);
    });
    const { domain: _domain, ...ref } = before.domain;
    await RpRunControl.prototype.reconcileNativeOutput.call(rpControl, handle, ref);
    const current = await runs.engine.withTransaction(handle, async tx => {
        const root = await runs.get(handle, request.runId), intent = (await readEffect(tx, handle, root, request.effectId)).doc;
        return { root, observation: await observationFor(execution, rpControl, handle, tx, root, intent) };
    });
    return observeReconciledEffect(execution, handle, { ...current, effectId: request.effectId });
}
