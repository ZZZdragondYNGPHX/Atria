import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { rpPlannerProfile } from './rp-planner-profile.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { assertRpPlannerExpansionOperations } from './rp-planner-expansion-profile.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP Planner completion facts'); };

/** Complete immutable control facts, never another Model or Source grant. */
export async function readRpPlannerCompletion(tx, handle, root) {
    const node = root.graph.nodes.find(item => item.kind === 'planner');
    if (!node) return null;
    const producers = [];
    for (const id of root.attemptRefs) { const { doc } = await readAttempt(tx, handle, root, id); if (doc.nodeId === node.nodeId) producers.push(doc); }
    const plan = await readPlanRevision(tx, handle, root.planRef), profile = rpPlannerProfile(plan);
    if (!producers.length || !profile || producers.length > 1 && !profile.loop) invalid();
    await readTaskGraphRevision(tx, handle, root);
    const history = [];
    for (const [index, producer] of producers.entries()) {
        const entry = await readPlannerAttempt(tx, handle, root, producer), previous = history.at(-1);
        if (producer.attemptNumber !== index + 1 || producer.graphRevision !== (previous?.patch.newGraphRevision ?? 0)
            || entry.patch.previousGraphRevision !== producer.graphRevision) invalid();
        const input = entry.input;
        if (profile.expansion) {
            const snapshot = await readTaskGraphRevision(tx, handle, root, producer.graphRevision);
            assertRpPlannerExpansionOperations(snapshot.graph, input.graphTemplates, entry.patch.appliedOperations);
        }
        if (input.kind !== 'native_rp_intent' || input.nodeId !== node.nodeId || input.role !== 'narrator'
            || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
            || !equal(input.audience, { kind: 'narrator' }) || !equal(producer.inputRefs, [input])) invalid();
        if (previous) {
            if (!previous.patch.requests.replan || previous.patch.requests.finalize
                || !equal(input.controlReceiptRef, { runId: root.runId, receiptId: previous.receipt.receiptId })) invalid();
            const bindings = [{ edgeId: profile.loop.edgeId, producerAttemptId: previous.producer.attemptId }];
            const receiptId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: previous, output: producer, allowLoopBack: true,
                receipt: { decisionSeq: entry.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId } } });
        } else if (Object.hasOwn(input, 'controlReceiptRef')) invalid();
        history.push(entry);
    }
    const loops = history.length - 1;
    if (root.graphRevision !== history.length || root.progress.replans !== history.filter(item => item.patch.requests.replan).length
        || root.progress.loopIterations !== loops || (profile.loop ? root.progress.edgeVisitCounts[profile.loop.edgeId] ?? 0 : 0) !== loops) invalid();
    return { ...history.at(-1), history };
}

async function readPlannerAttempt(tx, handle, root, producer) {
    const receiptId = 'oreceipt_' + hash({ kind: 'rp_planner', runId: root.runId, attemptId: producer.attemptId }).slice(0, 32);
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
    return { receipt, producer, settlement, patch, input: intent.inputRef, modelEffectId: receipt.modelEffectId };
}
