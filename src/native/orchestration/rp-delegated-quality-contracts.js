import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { rpControlReplanScope } from './rp-control-graph.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, readAttemptInvalidation, readGraphReviewReceipt, assertAttemptConsumable, assertAttemptCurrent } from './controller-common.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { readGraphReviewCompletion, graphReviewControlRef } from './graph-review-completion.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { isRpDelegatedControlGraph } from './rp-delegation-control-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP delegated quality facts'); };

/** Cold typed facts only. The private delegation capture remains the only
 * live Task/Source grant, and every original child charge stays in its bank. */
export async function readRpDelegatedControl(tx, handle, root, ref) {
    if (root.sourceBinding.sourceAuthority !== 'rp_chat' || !root.parentRef || ref?.runId !== root.runId) invalid();
    let fact; const completedControls = [];
    if (ref.kind === 'graph_planner_control') fact = await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, { verifyControlWork: assertRpControlWork });
    else if (ref.kind === 'graph_review_control') fact = await readGraphReviewCompletion(tx, handle, root, ref.attemptId,
        { verifyControlWork: assertRpControlWork, reasonCodes: RP_REVIEW_REASON_CODES });
    else if (ref.kind === 'graph_judge_control') fact = await readGraphJudgeCompletion(tx, handle, root, ref.attemptId,
        { verifyControlWork: assertRpControlWork, readControlInputs: async (_tx, _handle, _root, _producer, input) => {
            const controls = [];
            for (const control of input.controlGraph.controlRefs) {
                const previous = (await readAttempt(_tx, _handle, _root, control.attemptId)).doc;
                const current = await readAttemptSettlement(_tx, _handle, _root, _producer);
                if ((await readAttemptSettlement(_tx, _handle, _root, previous)).decisionSeq >= current.decisionSeq) invalid();
                const checked = await readRpDelegatedControl(_tx, _handle, _root, control);
                controls.push(checked); completedControls.push(checked);
            }
            return controls;
        } });
    else invalid();
    if (!fact || !equal(fact.controlRef, ref)) invalid();
    const intent = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc;
    // These same invocation's immutable facts were fully read above by the
    // shared completion reader, including their Model/settlement/bank proof.
    // Reuse them only for this control's domain input verification. The maps
    // are private, never returned, and every public read starts from storage.
    const ownedFacts = { results: new Map((fact.evidence ?? fact.candidates ?? []).map(source => [hash(source.receipt.resultRef), source])),
        controls: new Map(completedControls.map(source => [hash(source.controlRef), source])) };
    await readControlInputFacts(tx, handle, root, fact.producer, intent, fact.receipt.decisionSeq, ownedFacts);
    return fact;
}

/** Each input still names an original typed producer and an actual edge.
 * No model selection declassifies either candidate or changes the Task grant. */
export function readRpDelegatedInputSources(tx, handle, root, bundle, targetNodeId, options = {}) {
    return readInputSources(tx, handle, root, bundle, targetNodeId, options, null);
}

async function readInputSources(tx, handle, root, bundle, targetNodeId, { live = false, recipient = null, beforeSeq = null } = {}, ownedFacts) {
    assertObject(bundle, ['evidenceRefs', 'controlRefs', 'bindings'], 'RP child graph inputs');
    if (![bundle.evidenceRefs, bundle.controlRefs, bundle.bindings].every(Array.isArray)
        || new Set(bundle.evidenceRefs.map(hash)).size !== bundle.evidenceRefs.length
        || new Set(bundle.controlRefs.map(hash)).size !== bundle.controlRefs.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    const facts = [];
    for (const ref of bundle.evidenceRefs) {
        const fact = ownedFacts?.results.get(hash(ref)) ?? await readGraphNodeResult(tx, handle, root, ref.resultId);
        if (!fact || ref.runId !== root.runId || !equal(fact.receipt.resultRef, ref)
            || !fact.record.envelope.audienceConstraint.nodeIds.includes(targetNodeId)) invalid();
        facts.push(fact);
    }
    for (const ref of bundle.controlRefs) {
        const completed = ownedFacts?.controls.get(hash(ref));
        if (beforeSeq !== null) {
            const settlement = completed?.settlement ?? await readAttemptSettlement(tx, handle, root, (await readAttempt(tx, handle, root, ref.attemptId)).doc);
            if (settlement.decisionSeq >= beforeSeq) invalid();
        }
        const fact = completed ?? await readRpDelegatedControl(tx, handle, root, ref);
        if (!equal(fact.controlRef, ref)) invalid(); facts.push(fact);
    }
    if (facts.some(fact => !bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId))
        || bundle.bindings.some(binding => !root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.nodeId === targetNodeId
            && facts.some(fact => fact.producer.attemptId === binding.producerAttemptId && fact.producer.nodeId === edge.from.nodeId)))) invalid();
    for (const judge of facts.filter(fact => fact.controlRef?.kind === 'graph_judge_control')) for (const candidate of judge.candidates) {
        const direct = root.graph.edges.some(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === targetNodeId);
        if (direct && bundle.evidenceRefs.some(ref => equal(ref, candidate.receipt.resultRef)) !== equal(candidate.receipt.resultRef, judge.selectedResultRef)) invalid();
    }
    if (!live) return facts;
    if (recipient) {
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || recipient.nodeId !== targetNodeId || recipient.epoch !== root.epoch || root.status !== 'running' || root.cancelRequested
            || !['running', 'waiting_effect'].includes(recipient.status) || !equal(recipient.inputRefs[0]?.controlGraph, bundle)
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(recipient.inputRefs[0]?.audience, { kind: 'task', id: root.runId })) invalid();
        await assertAttemptCurrent(tx, handle, root, recipient);
    }
    const ownReview = recipient && root.graph.nodes.find(node => node.nodeId === targetNodeId)?.kind === 'review'
        ? await readGraphReviewReceipt(tx, handle, root, recipient) : null;
    for (const fact of facts) {
        const invalidation = await readAttemptInvalidation(tx, handle, root, fact.producer);
        if (!invalidation) { await assertAttemptConsumable(tx, handle, root, fact.producer); continue; }
        // Only this still-running Review's decide→settle saga may prove its
        // own old Result. A later stage, other Review, or old control cannot.
        if (!fact.record || ownReview?.decision !== 'rerun' || invalidation.reviewReceiptId !== ownReview.receiptId
            || invalidation.reviewIntegrity !== hash(ownReview) || !ownReview.invalidatedAttemptIds.includes(fact.producer.attemptId)
            || !equal(ownReview.evidenceRefs, bundle.evidenceRefs) || !ownReview.evidenceRefs.some(ref => equal(ref, fact.receipt.resultRef))) invalid();
    }
    return facts;
}

/** Prepared replacements are admitted by the original ReviewController. Their
 * exact prior inputs plus feedback do not invent another incoming Transition. */
export async function readRpDelegatedReviewReplacement(tx, handle, root, producer, input) {
    const ref = input.reviewFeedbackRef?.reviewReceiptRef;
    const stored = ref?.runId === root.runId ? await checkedRecord(tx, { kind: K.orchestrationRecord, handle, runId: root.runId,
        recordType: 'receipt', recordId: ref.receiptId }) : null;
    if (!stored || stored.doc.receiptKind !== 'graph_review') invalid();
    const modelRef = graphReviewControlRef(root.runId, stored.doc.reviewAttemptId);
    const fact = await readRpDelegatedControl(tx, handle, root, modelRef), replacement = fact.review.replacements.find(item => item.attemptId === producer.attemptId);
    const target = fact.targets.find(item => item.attemptId === replacement?.targetAttemptId);
    if (fact.review.decision !== 'rerun' || !target || !equal(ref, fact.receipt.reviewReceiptRef)
        || input.reviewFeedbackRef.reasonCode !== fact.review.reasonCode || producer.nodeId !== target.nodeId
        || producer.effectiveGrantDigest !== target.effectiveGrantDigest || producer.graphRevision !== fact.review.graphRevision
        || !equal(producer.inputRefs, [{ ...target.inputRefs[0], reviewFeedbackRef: input.reviewFeedbackRef }, ...target.inputRefs.slice(1)])) invalid();
    const invalidation = await readAttemptInvalidation(tx, handle, root, target);
    if (!invalidation || invalidation.reviewReceiptId !== fact.review.receiptId) invalid();
    return { fact, target };
}

/** Fresh public input proof; historical facts cannot be injected by a caller. */
export function readRpDelegatedInputFacts(tx, handle, child, producer, intent, publicationSeq = child.eventSeq + 1) {
    return readControlInputFacts(tx, handle, child, producer, intent, publicationSeq, null);
}

/** Exact stage inputs, original dependency receipts and original child grant. */
async function readControlInputFacts(tx, handle, child, producer, intent, publicationSeq, ownedFacts) {
    const input = intent.inputRef, bundle = input.controlGraph;
    if (!isRpDelegatedControlGraph(child) || input.kind !== 'native_rp_delegated_intent' || input.role !== 'narrator'
        || input.nodeId !== producer.nodeId || input.parentRunId !== child.parentRef.parentRunId || input.childRunId !== child.runId
        || input.parentAttemptId !== child.parentRef.nodeAttemptId || !equal(input.planRef, child.planRef)
        || !equal(input.sourceRef, child.sourceBinding.sourceRef) || !equal(input.audience, { kind: 'task', id: child.runId })
        || producer.effectiveGrantDigest !== child.parentRef.effectiveGrantDigest || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.nodeAttemptId !== producer.attemptId || intent.graphRevision !== producer.graphRevision || intent.epoch !== producer.epoch
        || !bundle || !Array.isArray(bundle.evidenceRefs) || !equal(input.acceptedGraphResultRefs ?? [], bundle.evidenceRefs) || !Array.isArray(bundle.controlRefs) || !Array.isArray(bundle.bindings)
        || !equal(input.acceptedControlRefs, bundle.controlRefs) || !equal(producer.inputRefs, [input, ...child.parentRef.inputRefs, ...bundle.evidenceRefs, ...bundle.controlRefs])
        || producer.inputDigest !== hash(producer.inputRefs) || intent.inputHash !== hash(input)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, child, producer.graphRevision);
    const plan = await readPlanRevision(tx, handle, child.planRef), node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const pin = plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId);
    if (pin?.port !== 'model' || !node.dependencyPinIds.includes(pin.pinId) || !equal(input.routeRef, pin.resourceRef)
        || intent.actionRef.kind !== 'native_model_send' || intent.actionRef.runtimeRouteId !== pin.resourceRef.runtimeRouteId) invalid();
    const sources = await readInputSources(tx, handle, child, bundle, producer.nodeId, { beforeSeq: publicationSeq }, ownedFacts);
    if (sources.some(fact => fact.receipt.decisionSeq >= publicationSeq)
        || new Set(sources.map(fact => fact.producer.attemptId)).size !== sources.length
        || new Set(bundle.bindings.map(binding => binding.edgeId)).size !== bundle.bindings.length) invalid();
    const incoming = snapshot.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === producer.nodeId);
    const loops = bundle.bindings.filter(binding => snapshot.graph.edges.find(edge => edge.edgeId === binding.edgeId)?.loopBack);
    if (incoming.some(edge => node.inputs.find(port => port.name === edge.to.port).required && !bundle.bindings.some(binding => binding.edgeId === edge.edgeId))
        || bundle.bindings.some(binding => !snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.to.nodeId === producer.nodeId
            && sources.some(source => source.producer.attemptId === binding.producerAttemptId && source.producer.nodeId === edge.from.nodeId)))
        || sources.some(source => !bundle.bindings.some(binding => binding.producerAttemptId === source.producer.attemptId))) invalid();
    for (const binding of loops) {
        const source = sources.find(source => source.producer.attemptId === binding.producerAttemptId);
        if (!source?.patch?.requests.replan || source.patch.requests.finalize || source.patch.newGraphRevision !== producer.graphRevision
            || rpControlReplanScope(snapshot.graph, source.producer.nodeId).target.nodeId !== producer.nodeId) invalid();
    }
    let replacement = null;
    if (input.reviewFeedbackRef) replacement = await readRpDelegatedReviewReplacement(tx, handle, child, producer, input);
    else if (!bundle.bindings.length) {
        if (!snapshot.graph.entryNodeIds.includes(producer.nodeId) || sources.length) invalid();
    } else {
        const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        const receiptId = 'oreceipt_' + hash({ runId: child.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, child, { published: sources[0], additionalProducers: sources.slice(1), output: producer,
            producerBindings: bindings, allowLoopBack: loops.length > 0,
            receipt: { decisionSeq: publicationSeq, traversalReceiptRef: { runId: child.runId, receiptId } } });
    }
    return { input, sources, bindings: replacement ? [] : bundle.bindings, loops, replacement };
}
