import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readAttempt, assertAttemptConsumable, readAttemptInvalidation } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { assertAudienceRunCapture, audienceContextPin } from './audience-source-contracts.js';
import { rpControlGraph } from './rp-control-graph.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP control graph facts'); };
export const rpPlannerReaderOptions = { verifyControlWork: assertRpControlWork };
export const rpReviewReaderOptions = { verifyControlWork: assertRpControlWork, reasonCodes: RP_REVIEW_REASON_CODES };
export const rpJudgeReaderOptions = { verifyControlWork: assertRpControlWork,
    readControlInputs: (tx, handle, root, producer, input) => {
        // The shared Judge reader has already proved every candidate and will
        // check the exact combined Transition. Supply only its other controls.
        const bundle = input.controlGraph, ids = new Set(bundle.controlRefs.map(ref => ref.attemptId));
        return readRpControlInputs(tx, handle, root, { evidenceRefs: [], controlRefs: bundle.controlRefs,
            bindings: bundle.bindings.filter(binding => ids.has(binding.producerAttemptId)) }, { targetNodeId: producer.nodeId, checkSelections: false });
    } };

export async function readRpControlInputs(tx, handle, root, bundle, { targetNodeId = null, live = false, checkSelections = true } = {}) {
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
        const fact = ref.kind === 'graph_review_control'
            ? await readGraphReviewCompletion(tx, handle, root, ref.attemptId, rpReviewReaderOptions)
            : ref.kind === 'graph_judge_control' ? await readGraphJudgeCompletion(tx, handle, root, ref.attemptId, rpJudgeReaderOptions)
                : ref.kind === 'graph_planner_control' ? await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, rpPlannerReaderOptions) : null;
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
    if (checkSelections && targetNodeId !== null) for (const judge of facts.filter(fact => fact.controlRef?.kind === 'graph_judge_control')) {
        for (const candidate of judge.candidates) {
            const direct = root.graph.edges.some(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === targetNodeId);
            if (direct && bundle.evidenceRefs.some(ref => equal(ref, candidate.receipt.resultRef)) !== equal(candidate.receipt.resultRef, judge.selectedResultRef)) invalid();
        }
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
    if (input.reviewFeedbackRef) {
        let admission = null;
        for (const id of root.attemptRefs) {
            const attempt = (await readAttempt(tx, handle, root, id)).doc;
            if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId).kind !== 'review') continue;
            const review = await readGraphReviewCompletion(tx, handle, root, id, rpReviewReaderOptions);
            if (review && equal(input.reviewFeedbackRef, { reviewReceiptRef: review.receipt.reviewReceiptRef, reasonCode: review.review.reasonCode })
                && review.review.decision === 'rerun' && review.review.replacements.some(item => item.attemptId === producer.attemptId)) admission = review;
        }
        if (!admission || producer.nodeId !== admission.targets.find(target => admission.review.replacements.some(item => item.targetAttemptId === target.attemptId
            && item.attemptId === producer.attemptId))?.nodeId) invalid();
    } else if (!bundle.bindings.length) {
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
    const graphResults = [], plannerCompletions = [], reviewCompletions = [], judgeCompletions = [], seen = new Map();
    for (const id of root.attemptRefs) {
        const producer = (await readAttempt(tx, handle, root, id)).doc;
        if (producer.attemptId === narrator.producer.attemptId || producer.nodeId === admission.output.nodeId) continue;
        const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
        const fact = node.kind === 'planner'
            ? await readGraphPlannerCompletion(tx, handle, root, id, rpPlannerReaderOptions)
            : node.kind === 'review' ? await readGraphReviewCompletion(tx, handle, root, id, rpReviewReaderOptions)
                : node.kind === 'judge' ? await readGraphJudgeCompletion(tx, handle, root, id, rpJudgeReaderOptions)
                    : await readGraphNodeResult(tx, handle, root, producer.resultRefs[0]?.resultId);
        if (!fact) invalid();
        const previous = seen.get(node.nodeId);
        const invalidation = previous ? await readAttemptInvalidation(tx, handle, root, previous.producer) : null;
        if (previous && (node.kind === 'planner' || ['agent', 'judge'].includes(node.kind) && !invalidation
            || node.kind === 'review' && previous.review.decision !== 'rerun' && !invalidation)) invalid();
        seen.set(node.nodeId, fact);
        await assertRpControlInput(tx, handle, root, fact, plan);
        if (node.kind !== 'agent') {
            const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
            const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
            (node.kind === 'planner' ? plannerCompletions : node.kind === 'review' ? reviewCompletions : judgeCompletions)
                .push({ ...fact, modelEffectId: fact.receipt.modelEffectId, retrievalCompletions });
        } else graphResults.push(fact);
    }
    await assertRpControlInput(tx, handle, root, narrator, plan);
    // Review creates all replacement attempts before scheduling them. Their
    // creation order is not their Result publication order. Each receipt's
    // sequence is already bound to its original attempt settlement above.
    graphResults.sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq);
    const published = [...graphResults, narrator];
    if (published.some((fact, index) => index > 0 && published[index - 1].receipt.decisionSeq >= fact.receipt.decisionSeq)
        || root.graphRevision !== plannerCompletions.length || !equal(root.resultRefs, published.map(fact => fact.receipt.resultRef))) invalid();
    return { graphResults, plannerCompletions, reviewCompletions, judgeCompletions };
}
