import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP Planner completion facts'); };

/** Complete immutable control facts, never another Model or Source grant. */
export async function readRpPlannerCompletion(tx, handle, root) {
    const node = root.graph.nodes.find(item => item.kind === 'planner');
    if (!node) return null;
    const producers = [];
    for (const id of root.attemptRefs) { const { doc } = await readAttempt(tx, handle, root, id); if (doc.nodeId === node.nodeId) producers.push(doc); }
    if (producers.length !== 1) invalid();
    const [producer] = producers, receiptId = 'oreceipt_' + hash({ kind: 'rp_planner', runId: root.runId, attemptId: producer.attemptId }).slice(0, 32);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) invalid();
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'modelEffectId',
        'modelReceiptRef', 'payloadHash', 'patchId', 'patchIntegrity', 'localWork', 'decisionSeq', 'createdAt'], 'RP Planner receipt');
    const patch = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'patch', receipt.patchId)))?.doc;
    const settlement = await readAttemptSettlement(tx, handle, root, producer), intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc;
    const model = await readModelCompletionReceipt(handle, tx, root, intent);
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_planner' || receipt.runId !== root.runId || receipt.receiptId !== receiptId
        || receipt.producerAttemptId !== producer.attemptId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch || producer.status !== 'completed'
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.decisionSeq > root.eventSeq
        || !patch || !patch.accepted || hash(patch) !== receipt.patchIntegrity || patch.producerAttemptId !== producer.attemptId
        || patch.newGraphRevision > root.graphRevision || patch.decisionSeq >= receipt.decisionSeq
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || settlement.reasonCode !== 'rp_planner_patch_accepted'
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId]) || producer.resultRefs.length
        || !equal(producer.effectRefs, [receipt.modelEffectId]) || intent.nodeAttemptId !== producer.attemptId || intent.grantDigest !== producer.effectiveGrantDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.payloadHash) invalid();
    await assertRpControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    return { receipt, producer, settlement, patch, modelEffectId: receipt.modelEffectId };
}
