import { readSessionDelegatedFanoutCompletion } from './session-delegated-fanout-contracts.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttempt, readAttemptInvalidation } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readGraphReviewCompletion, readReviewablePlannerCompletion, readReviewableDelegationCompletion } from './graph-review-completion.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readSessionPlannerCompletion, assertSessionControlWork } from './session-planner-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { readSessionDelegation, sessionDelegationResultSources } from './session-delegation-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Session child quality facts'); };

async function inputIdentity(tx, handle, root, producer) {
    const parent = root.parentRef ? (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.parentRef.parentRunId }))?.doc : null;
    if (!parent || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, root.runId), input = producer.inputRefs[0];
    const source = sessionDelegationResultSources(root, producer, await readPlanRevision(tx, handle, root.planRef))[0];
    if (!lineage || input.kind !== 'native_session_delegated_intent' || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !equal(producer.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])
        || input.delegationScope.parentPinId !== lineage.parentPin.pinId || input.delegationScope.childPinId !== source.pinId
        || !equal(input.delegationScope.sourceRef, lineage.parentInput.delegationScope.sourceRef)
        || input.delegationScope.integrity !== lineage.parentInput.delegationScope.integrity) invalid();
    return input;
}

async function controlInputs(tx, handle, root, producer, input) {
    const facts = [], settlement = await readAttemptSettlement(tx, handle, root, producer);
    for (const ref of input.acceptedControlRefs ?? []) {
        const attempt = (await readAttempt(tx, handle, root, ref.attemptId)).doc;
        if (ref.runId !== root.runId || attempt.attemptId === producer.attemptId
            || (await readAttemptSettlement(tx, handle, root, attempt)).decisionSeq >= settlement.decisionSeq) invalid();
        const fact = await readSessionDelegatedControl(tx, handle, root, ref);
        if (!fact || !equal(fact.controlRef, ref) || fact.review?.decision === 'rerun') invalid();
        facts.push(fact);
    }
    return facts;
}

export async function readSessionDelegatedReviewCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Session child Review read');
    const fact = await readGraphReviewCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertSessionControlWork, reasonCodes: RP_REVIEW_REASON_CODES, readFanoutCompletion: readSessionDelegatedFanoutCompletion, ...options });
    if (!fact) return null;
    const input = await inputIdentity(tx, handle, root, fact.producer), snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
    for (const target of fact.targets) if (target.inputRefs[0]?.kind === 'native_session_delegation') {
        const delegated = fact.review.decision === 'rerun' ? fact.rerunDelegations.find(item => item.producer.attemptId === target.attemptId)
            : await readReviewableDelegationCompletion(tx, handle, root, target.attemptId);
        if (!delegated) invalid();
    }
    const controls = await controlInputs(tx, handle, root, fact.producer, input), joinedRefs = controls.flatMap(item => item.joinReceipt?.acceptedResultRefs ?? []);
    const sources = [...fact.evidence.filter(item => !joinedRefs.some(ref => equal(ref, item.receipt.resultRef))), ...controls];
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
        if (['fanout', 'join'].includes(node?.kind) ? !fact.rerunFanouts.some(group => group.fanout.attemptId === attempt.attemptId || group.producer.attemptId === attempt.attemptId)
            : attempt.inputRefs[0]?.kind === 'native_session_delegation' ? !fact.rerunDelegations.some(item => item.producer.attemptId === attempt.attemptId)
                : (node?.kind === 'planner' || node?.capabilities.includes('graph.patch'))
                && !await readReviewablePlannerCompletion(tx, handle, root, attempt.attemptId, { verifyControlWork: assertSessionControlWork, reviewTargets: fact.targets, readFanoutCompletion: readSessionDelegatedFanoutCompletion })) invalid();
    }
    return fact;
}

export async function readSessionDelegatedJudgeCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Session child Judge read');
    const fact = await readGraphJudgeCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertSessionControlWork, readControlInputs: controlInputs, ...options });
    if (!fact) return null;
    await inputIdentity(tx, handle, root, fact.producer);
    return fact;
}

/** Typed facts only; callers separately check live Source, Actor and currentness. */
export function readSessionDelegatedControl(tx, handle, root, ref, options = {}) {
    if (ref?.runId !== root.runId) invalid();
    if (ref.kind === 'graph_join_control') return readSessionDelegatedFanoutCompletion(tx, handle, root, ref.attemptId, options);
    if (ref.kind === 'graph_planner_control') return readSessionPlannerCompletion(tx, handle, root, ref.attemptId, options);
    if (ref.kind === 'graph_review_control') return readSessionDelegatedReviewCompletion(tx, handle, root, ref.attemptId, options);
    if (ref.kind === 'graph_judge_control') return readSessionDelegatedJudgeCompletion(tx, handle, root, ref.attemptId, options);
    invalid();
}

/** ReviewController replacements inherit exact earlier causal inputs. They do
 * not invent a second Transition or spend their old incoming edges again. */
export async function readSessionDelegatedReviewReplacement(tx, handle, root, producer, input) {
    const ref = input.reviewFeedbackRef?.reviewReceiptRef;
    const stored = ref?.runId === root.runId ? await checkedRecord(tx, { kind: K.orchestrationRecord, handle, runId: root.runId,
        recordType: 'receipt', recordId: ref.receiptId }) : null;
    if (!stored || stored.doc.receiptKind !== 'graph_review') invalid();
    const fact = await readSessionDelegatedReviewCompletion(tx, handle, root, stored.doc.reviewAttemptId);
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
