import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readAttempt, assertAttemptConsumable } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { assertAudienceRunCapture, audienceContextPin } from './audience-source-contracts.js';
import { rpControlGraph } from './rp-control-graph.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP control graph facts'); };
export const rpPlannerReaderOptions = { verifyControlWork: assertRpControlWork };

export async function readRpControlInputs(tx, handle, root, bundle, { targetNodeId = null, live = false } = {}) {
    assertObject(bundle, ['evidenceRefs', 'controlRefs', 'bindings'], 'RP graph inputs');
    if (!Array.isArray(bundle.evidenceRefs) || !Array.isArray(bundle.controlRefs) || !Array.isArray(bundle.bindings)
        || new Set(bundle.evidenceRefs.map(hash)).size !== bundle.evidenceRefs.length
        || new Set(bundle.controlRefs.map(hash)).size !== bundle.controlRefs.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    const facts = [];
    for (const ref of bundle.evidenceRefs) {
        const fact = await readGraphNodeResult(tx, handle, root, ref.resultId);
        if (!fact || !equal(fact.receipt.resultRef, ref)) invalid(); facts.push(fact);
    }
    for (const ref of bundle.controlRefs) {
        const fact = await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, rpPlannerReaderOptions);
        if (!fact || !equal(fact.controlRef, ref)) invalid(); facts.push(fact);
    }
    if (facts.some(fact => !bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId))
        || bundle.bindings.some(binding => !facts.some(fact => fact.producer.attemptId === binding.producerAttemptId
            && root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === fact.producer.nodeId
                && (targetNodeId === null || edge.to.nodeId === targetNodeId))))) invalid();
    for (const fact of facts) {
        if (live) await assertAttemptConsumable(tx, handle, root, fact.producer);
        if (targetNodeId !== null && fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(targetNodeId)) invalid();
    }
    return facts;
}

/** Original persisted dependencies and transitions. Historical reads remain
 * available after Source deletion; they never restore a runtime read grant. */
export async function assertRpControlInput(tx, handle, root, fact, plan = null) {
    plan ??= await readPlanRevision(tx, handle, root.planRef);
    const producer = fact.producer, intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc, input = intent.inputRef;
    const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId), bundle = input.controlGraph;
    if (!bundle || input.kind !== 'native_rp_intent' || input.role !== 'narrator' || input.nodeId !== producer.nodeId
        || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.audience, audienceContextPin(node, plan.dependencyPins)?.resourceRef.audience ?? { kind: 'narrator' })
        || !equal(input.acceptedGraphResultRefs, bundle.evidenceRefs)
        || !equal(producer.inputRefs, [input, ...bundle.evidenceRefs, ...bundle.controlRefs]) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    const sources = await readRpControlInputs(tx, handle, root, bundle, { targetNodeId: node.nodeId });
    if (!bundle.bindings.length) {
        if (!root.graph.entryNodeIds.includes(node.nodeId) || sources.length) invalid();
    } else {
        const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: sources[0], additionalProducers: sources.slice(1), output: producer,
            producerBindings: bindings, receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
    return { input, sources };
}

export async function readRpControlGraphHistory(tx, handle, root, narrator) {
    const plan = await readPlanRevision(tx, handle, root.planRef), admission = rpControlGraph({ ...plan, definition: root.graph }, { force: true });
    if (narrator.producer.nodeId !== admission.narrator.nodeId) invalid();
    const graphResults = [], plannerCompletions = [], seen = new Set();
    for (const id of root.attemptRefs) {
        const producer = (await readAttempt(tx, handle, root, id)).doc;
        if (producer.attemptId === narrator.producer.attemptId || producer.nodeId === admission.output.nodeId) continue;
        const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
        const fact = node.kind === 'planner'
            ? await readGraphPlannerCompletion(tx, handle, root, id, rpPlannerReaderOptions)
            : await readGraphNodeResult(tx, handle, root, producer.resultRefs[0]?.resultId);
        if (!fact || seen.has(node.nodeId)) invalid(); seen.add(node.nodeId);
        await assertRpControlInput(tx, handle, root, fact, plan);
        if (node.kind === 'planner') {
            const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
            const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
            plannerCompletions.push({ ...fact, modelEffectId: fact.receipt.modelEffectId, retrievalCompletions });
        } else graphResults.push(fact);
    }
    await assertRpControlInput(tx, handle, root, narrator, plan);
    if (root.graphRevision !== plannerCompletions.length || !equal(root.resultRefs,
        [...graphResults.map(fact => fact.receipt.resultRef), narrator.receipt.resultRef])) invalid();
    return { graphResults, plannerCompletions };
}
