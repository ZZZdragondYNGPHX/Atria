import { readProjectDelegatedFanoutCompletion } from './project-delegated-fanout-contracts.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttempt, readAttemptInvalidation } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readGraphReviewCompletion, readReviewablePlannerCompletion } from './graph-review-completion.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { assertNativeId } from '../identity.js';
import { readProjectDelegation } from './project-delegation-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Project child quality facts'); };

async function inputIdentity(tx, handle, root, producer) {
    const parent = root.parentRef ? (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.parentRef.parentRunId }))?.doc : null;
    if (!parent || root.sourceBinding.sourceAuthority !== 'project') invalid();
    const lineage = await readProjectDelegation(tx, handle, parent, root.runId), input = producer.inputRefs[0];
    if (!lineage || input.kind !== 'native_project_delegated_intent' || input.role !== 'studio' || !equal(input.audience, { kind: 'task', id: root.runId })
        || input.parentRunId !== parent.runId || input.parentAttemptId !== root.parentRef.nodeAttemptId
        || input.parentEpoch !== root.parentRef.parentEpoch || input.childRunId !== root.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== root.parentRef.inputDigest || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.planRef, root.planRef) || input.nodeId !== producer.nodeId
        || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !equal(producer.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])) invalid();
    return input;
}

async function controlInputs(tx, handle, root, producer, input) {
    const facts = [], settlement = await readAttemptSettlement(tx, handle, root, producer);
    for (const ref of input.acceptedControlRefs ?? []) {
        const attempt = (await readAttempt(tx, handle, root, ref.attemptId)).doc;
        if (ref.runId !== root.runId || attempt.attemptId === producer.attemptId
            || (await readAttemptSettlement(tx, handle, root, attempt)).decisionSeq >= settlement.decisionSeq) invalid();
        const fact = await readProjectDelegatedControl(tx, handle, root, ref);
        if (!fact || !equal(fact.controlRef, ref) || fact.review?.decision === 'rerun') invalid();
        facts.push(fact);
    }
    return facts;
}

export async function readProjectDelegatedReviewCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Project child Review read');
    const fact = await readGraphReviewCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertProjectControlWork, reasonCodes: PROJECT_QUALITY_REASONS, ...options });
    if (!fact) return null;
    const input = await inputIdentity(tx, handle, root, fact.producer), snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
    const controls = await controlInputs(tx, handle, root, fact.producer, input), sources = [...fact.evidence, ...controls];
    const bindings = input.graphBindings;
    if (!Array.isArray(bindings) || !bindings.length || new Set(bindings.map(item => item.edgeId)).size !== bindings.length
        || fact.targets.some(target => snapshot.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent')
        || bindings.some(binding => !sources.some(source => source.producer.attemptId === binding.producerAttemptId
            && snapshot.graph.edges.some(edge => !edge.loopBack && edge.edgeId === binding.edgeId
                && edge.from.nodeId === source.producer.nodeId && edge.to.nodeId === fact.producer.nodeId)))) invalid();
    const identity = hash({ runId: root.runId, bindings, reservedAttemptId: null });
    await assertOutputTransition(tx, handle, root, { published: sources[0], additionalProducers: sources.slice(1), output: fact.producer,
        producerBindings: bindings, receipt: { decisionSeq: fact.receipt.decisionSeq,
            traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
    if (fact.review.decision === 'rerun') for (const replacement of fact.review.replacements) {
        const target = fact.targets.find(item => item.attemptId === replacement.targetAttemptId), next = (await readAttempt(tx, handle, root, replacement.attemptId)).doc;
        const input = { ...target.inputRefs[0], reviewFeedbackRef: { reviewReceiptRef: fact.receipt.reviewReceiptRef, reasonCode: fact.review.reasonCode } };
        if (!equal(next.inputRefs, [input, ...target.inputRefs.slice(1)]) || next.effectiveGrantDigest !== target.effectiveGrantDigest) invalid();
    }
    for (const id of fact.review.invalidatedAttemptIds) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc, node = snapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId);
        if (['fanout', 'join'].includes(node?.kind) || node?.capabilities.includes('agent.delegate')
            || (node?.kind === 'planner' || node?.capabilities.includes('graph.patch'))
                && !await readReviewablePlannerCompletion(tx, handle, root, attempt.attemptId, { verifyControlWork: assertProjectControlWork })) invalid();
    }
    return fact;
}

export async function readProjectDelegatedJudgeCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Project child Judge read');
    const fact = await readGraphJudgeCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertProjectControlWork, readControlInputs: controlInputs, ...options });
    if (!fact) return null;
    await inputIdentity(tx, handle, root, fact.producer);
    return fact;
}

/** Typed facts only; callers separately check live Source, Actor and currentness. */
export function readProjectDelegatedControl(tx, handle, root, ref, options = {}) {
    if (ref?.runId !== root.runId) invalid();
    if (ref.kind === 'graph_join_control') return readProjectDelegatedFanoutCompletion(tx, handle, root, ref.attemptId, options);
    if (ref.kind === 'graph_planner_control') return readGraphPlannerCompletion(tx, handle, root, ref.attemptId, { verifyControlWork: assertProjectControlWork, ...options });
    if (ref.kind === 'graph_review_control') return readProjectDelegatedReviewCompletion(tx, handle, root, ref.attemptId, options);
    if (ref.kind === 'graph_judge_control') return readProjectDelegatedJudgeCompletion(tx, handle, root, ref.attemptId, options);
    invalid();
}

/** ReviewController replacements inherit exact earlier causal inputs. They do
 * not invent a second Transition or spend their old incoming edges again. */
export async function readProjectDelegatedReviewReplacement(tx, handle, root, producer, input) {
    const ref = input.reviewFeedbackRef?.reviewReceiptRef;
    const stored = ref?.runId === root.runId ? await checkedRecord(tx, { kind: K.orchestrationRecord, handle, runId: root.runId,
        recordType: 'receipt', recordId: ref.receiptId }) : null;
    if (!stored || stored.doc.receiptKind !== 'graph_review') invalid();
    const fact = await readProjectDelegatedReviewCompletion(tx, handle, root, stored.doc.reviewAttemptId);
    const replacement = fact?.review.replacements.find(item => item.attemptId === producer.attemptId);
    const target = fact?.targets.find(item => item.attemptId === replacement?.targetAttemptId);
    if (!fact || fact.review.decision !== 'rerun' || !target || !equal(ref, fact.receipt.reviewReceiptRef)
        || input.reviewFeedbackRef.reasonCode !== fact.review.reasonCode || producer.nodeId !== target.nodeId
        || producer.effectiveGrantDigest !== target.effectiveGrantDigest || producer.graphRevision !== fact.review.graphRevision
        || !equal(producer.inputRefs, [{ ...target.inputRefs[0], reviewFeedbackRef: input.reviewFeedbackRef }, ...target.inputRefs.slice(1)])) invalid();
    const invalidation = await readAttemptInvalidation(tx, handle, root, target);
    if (!invalidation || invalidation.reviewReceiptId !== fact.review.receiptId) invalid();
    return { fact, target };
}


/** Pure response/counter projections; neither grants replacement nor budget. */
export function parseProjectDelegatedReview(text) {
    const value = JSON.parse(text); assertObject(value, ['decision', 'reasonCode', 'targetAttemptIds'], 'Project child Review');
    if (!['approve', 'rerun'].includes(value.decision) || !PROJECT_QUALITY_REASONS.includes(value.reasonCode)
        || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready') || !Array.isArray(value.targetAttemptIds)
        || !value.targetAttemptIds.length || new Set(value.targetAttemptIds).size !== value.targetAttemptIds.length) invalid();
    for (const id of value.targetAttemptIds) assertNativeId(id, 'orchestrationAttempt');
    return value;
}

export async function projectDelegatedRerunRequirements(tx, handle, root, reviewer, invalidatedAttemptIds) {
    const invalidated = new Set(invalidatedAttemptIds), completed = new Set(), admitted = new Set();
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (invalidated.has(id) || id === reviewer.attemptId || await readAttemptInvalidation(tx, handle, root, attempt)) continue;
        if (['completed', 'failed', 'cancelled'].includes(attempt.status)) completed.add(attempt.nodeId);
        else if (['pending', 'reserved', 'running', 'waiting_effect', 'waiting_child'].includes(attempt.status)) admitted.add(attempt.nodeId);
    }
    const remaining = root.graph.nodes.filter(node => !completed.has(node.nodeId) && root.nodeControl[node.nodeId].disposition !== 'cancelled');
    return { requests: remaining.filter(node => ['agent', 'review', 'planner', 'judge'].includes(node.kind)).length,
        attempts: remaining.filter(node => !admitted.has(node.nodeId)).length, reviews: remaining.filter(node => node.kind === 'review').length };
}

/** Optional candidates remain the only inputs a Judge may omit. */
export function assertProjectDelegatedJudgeSelections(root, node, refs, facts) {
    for (const fact of facts) for (const candidate of fact.candidates) {
        const edges = root.graph.edges.filter(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === node.nodeId);
        if (!edges.length) continue;
        const selected = equal(candidate.receipt.resultRef, fact.selectedResultRef);
        if (refs.some(ref => equal(ref, candidate.receipt.resultRef)) !== selected
            || !selected && edges.some(edge => node.inputs.find(port => port.name === edge.to.port)?.required)) invalid();
    }
}
