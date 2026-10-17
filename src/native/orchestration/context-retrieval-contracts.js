import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertRetrievalProfile, retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { retrievalPostTarget } from '../retrieval-send-contracts.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { controlRecordKey } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { sendAttemptId } from './budget-port.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Context retrieval completion'); };
export const contextRetrievalReceiptId = effectId => 'oreceipt_' + hash({ effectId, observationId: 'retrieval.completed:' + effectId }).slice(0, 32);
export const contextRetrievalCompletionBinding = intent => hash({ runId: intent.runId, effectId: intent.effectId, nodeAttemptId: intent.nodeAttemptId,
    epoch: intent.epoch, hostBootId: intent.hostBootId, hostGeneration: intent.hostGeneration, sourceBindingDigest: intent.sourceBindingDigest, decision: effectDecision(intent) });

export function contextRetrievalDecision({ sourceBindingDigest, parentGrantDigest, budgetEnvelopeDigest, effectId, modelEffectId, profile, descriptorDigest, corpusDigest, inputFingerprint }) {
    if (!['embed', 'rerank'].includes(profile.mode)) invalid();
    const target = retrievalPostTarget(profile);
    for (const value of [sourceBindingDigest, parentGrantDigest, budgetEnvelopeDigest, descriptorDigest, corpusDigest, inputFingerprint]) assertDigest(value, 'Context retrieval digest');
    const inputRef = { kind: 'context_retrieval', retrievalEffectId: effectId, contextForEffectId: modelEffectId,
        memoryDescriptorDigest: descriptorDigest, corpusDigest, providerInputFingerprint: inputFingerprint };
    const targetRef = { nativeRetrievalRef: retrievalRef(profile), profileIntegrity: hash(profile) };
    return { actionRef: { kind: 'context_retrieval', mode: profile.mode }, targetRef, inputRef, inputHash: hash(inputRef), capability: 'memory.retrieve',
        endpointBindingDigest: hash(target), grantDigest: hash({ parentGrantDigest, effectId, inputRef, targetRef }), risk: 'R1', requiresApproval: false,
        egressDigest: hash({ sourceBindingDigest, parentGrantDigest, inputRef, targetRef }), budgetEnvelopeDigest,
        dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
}

/** Protected historical facts only; never restores a Context, send or body grant. */
export async function readContextRetrievalCompletions(tx, handle, root, parent, producer) {
    if (producer.effectRefs[0] !== parent.effectId || new Set(producer.effectRefs).size !== producer.effectRefs.length) invalid();
    const refs = producer.effectRefs.slice(1);
    if (!refs.length) return [];
    if (root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null || root.graph.nodes.length !== 2 || root.graphRevision !== 0
        || parent.nodeAttemptId !== producer.attemptId || parent.capability !== 'generation.send') invalid();
    const plan = await readPlanRevision(tx, handle, root.planRef), node = plan.definition.nodes.find(node => node.nodeId === producer.nodeId);
    if (!equal(plan.definition, root.graph) || !node?.capabilities.includes('memory.retrieve')) invalid();
    const completed = [];
    const modelReceiptId = 'oreceipt_' + hash({ effectId: parent.effectId, observationId: 'model.completed:' + parent.effectId }).slice(0, 32);
    const modelReceipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', modelReceiptId)))?.doc;
    if (!modelReceipt || modelReceipt.outcome !== 'confirmed') invalid();
    const bank = root.budgetAuthorityRef;
    if (bank.authority !== 'run_control' || bank.domain !== 'rp_chat' || bank.controlId !== root.sourceBinding.sourceRequest.controlId) invalid();
    const control = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: bank.controlId }))?.doc;
    const ledger = control?.operations[bank.operationId]?.compute;
    if (!ledger) invalid();
    for (const effectId of refs) {
        const intent = (await readEffect(tx, handle, root, effectId)).doc, input = intent.inputRef;
        const ref = intent.targetRef.nativeRetrievalRef;
        const savedProfile = ref ? await checkedRecord(tx, { kind: K.retrievalProfile, handle, retrievalProfileId: ref.retrievalProfileId, revision: ref.revision }) : null;
        if (!savedProfile) invalid();
        const profile = assertRetrievalProfile(savedProfile.doc);
        const pins = plan.dependencyPins.filter(pin => pin.port === 'context' && node.dependencyPinIds.includes(pin.pinId));
        const owned = pins.filter(pin => equal(pin.resourceRef, retrievalRef(profile)));
        if (owned.length !== 1 || owned[0].integrity !== hash(profile) || !['embed', 'rerank'].includes(profile.mode)) invalid();
        const decision = contextRetrievalDecision({ sourceBindingDigest: parent.sourceBindingDigest, parentGrantDigest: parent.grantDigest,
            budgetEnvelopeDigest: parent.budgetEnvelopeDigest, effectId, modelEffectId: parent.effectId, profile,
            descriptorDigest: input.memoryDescriptorDigest, corpusDigest: input.corpusDigest, inputFingerprint: input.providerInputFingerprint });
        if (!equal(effectDecision(intent), decision) || intent.nodeAttemptId !== producer.attemptId || intent.epoch !== parent.epoch
            || intent.graphRevision !== parent.graphRevision || intent.hostBootId !== parent.hostBootId || intent.hostGeneration !== parent.hostGeneration
            || intent.sourceBindingDigest !== parent.sourceBindingDigest || intent.status !== 'confirmed' || !intent.dispatchToken || intent.approvalRef !== null) invalid();
        const receiptId = contextRetrievalReceiptId(effectId), receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
        const budgetAttemptRef = { authorityRef: root.budgetAuthorityRef, effectId, providerSendOrdinal: 0, attemptId: sendAttemptId(effectId, 0), reservationId: null };
        if (!receipt || receipt.schemaVersion !== 1 || receipt.receiptId !== receiptId || receipt.runId !== root.runId || receipt.effectId !== effectId
            || receipt.observationId !== 'retrieval.completed:' + effectId || receipt.observedEpoch !== parent.epoch || receipt.outcome !== 'confirmed'
            || receipt.reasonCode !== 'retrieval_response_validated' || receipt.remoteOperationRef !== null || receipt.domainReceiptRef !== null
            || intent.createdAt < parent.createdAt || receipt.observedAt < intent.createdAt || receipt.observedAt > modelReceipt.observedAt
            || !equal(intent.budgetAttemptRef, budgetAttemptRef) || receipt.budgetObservationRef?.status !== 'settled'
            || !equal(receipt.budgetObservationRef.budgetAttemptRef, budgetAttemptRef) || !equal(receipt.resultRefs, [])
            || !equal(receipt.sourceRefs, [root.sourceBinding.sourceRef]) || receipt.dispatchEvidence?.kind !== 'original_port_observation') invalid();
        const evidence = receipt.dispatchEvidence.reference;
        if (!evidence || evidence.protocol !== 'retrieval' || evidence.completionBindingDigest !== contextRetrievalCompletionBinding(intent)
            || !equal(evidence.expectedSend, { targetFingerprint: intent.endpointBindingDigest, inputFingerprint: input.providerInputFingerprint })) invalid();
        assertDigest(evidence.responseHash, 'retrieval response'); assertDigest(receipt.budgetObservationRef.usageHash, 'retrieval usage');
        const row = ledger.attempts.find(row => row.attemptId === budgetAttemptRef.attemptId);
        if (!row || row.status !== 'settled' || !equal(row.orchestration, { kind: 'provider_send', effectId, ordinal: 0 })
            || row.requestId !== 'retrieval:' + effectId || row.targetFingerprint !== intent.endpointBindingDigest
            || row.inputFingerprint !== input.providerInputFingerprint || (row.reservationId ?? null) !== null
            || hash(row.usage) !== receipt.budgetObservationRef.usageHash) invalid();
        completed.push({ effectId, receiptId, receipt, intent, budgetAttemptRef });
    }
    return completed;
}
