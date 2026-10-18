import { taskLocalReceiptId } from './task-local-output-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttempt, controlRecordKey } from './controller-common.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readSessionDelegation } from './session-delegation-contracts.js';
import { readGraphNodeResults } from './graph-result-contracts.js';
import { readSessionDelegatedControl, readSessionDelegatedJudgeCompletion } from './session-delegated-quality-contracts.js';
import { readGraphFanoutCompletion, readGraphFanoutInput } from './graph-fanout-completion.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { readRunControl } from '../run-control.js';
import { assertSessionJudgeSelections } from './session-judge-contracts.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';
import { assertSessionFanoutPlannerOperations } from './session-fanout-planner-contracts.js';
import { sessionDelegationResultSources } from './session-delegation-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Session child Fanout facts'); };

async function childIdentity(tx, handle, root) {
    const parent = root.parentRef && (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.parentRef.parentRunId }))?.doc;
    if (!parent || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const lineage = await readSessionDelegation(tx, handle, parent, root.runId);
    if (!lineage) invalid();
    if (!equal(lineage.child, root)) {
        const actual = lineage.child, receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', taskLocalReceiptId(root.runId))))?.doc;
        if (!receipt || receipt.receiptKind !== 'task_local_output' || actual.status !== 'running' || actual.outputClaims.length || actual.cancelRequested
            || receipt.runId !== actual.runId || receipt.epoch !== actual.epoch || receipt.graphRevision !== actual.graphRevision || receipt.decisionSeq !== actual.eventSeq + 1) invalid();
        const pending = { ...actual, status: 'completed', outputClaims: [receipt.claimRef], progress: { ...actual.progress, steps: actual.progress.steps + 1 },
            treeProgress: { ...actual.treeProgress, steps: actual.treeProgress.steps + 1 }, stateVersion: actual.stateVersion + 1, eventSeq: actual.eventSeq + 1, updatedAt: receipt.createdAt };
        if (!equal(pending, root)) invalid();
    }
    return lineage;
}

async function refs(tx, handle, root, input) {
    const facts = [], results = await readGraphNodeResults(tx, handle, root, input.acceptedGraphResultRefs.map(ref => ref.resultId));
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = results.get(ref.resultId);
        if (!fact || !equal(ref, fact.receipt.resultRef)) invalid(); facts.push(fact);
    }
    for (const ref of input.acceptedControlRefs ?? []) {
        const fact = await readSessionDelegatedControl(tx, handle, root, ref);
        if (!fact || !equal(ref, fact.controlRef) || fact.review?.decision === 'rerun') invalid(); facts.push(fact);
    }
    return facts;
}

/** Typed stage inputs only; no new Source, capability or reservation is issued. */
export async function readSessionDelegatedFanoutInput(tx, handle, root, producer, input, publicationSeq) {
    const lineage = await childIdentity(tx, handle, root), frame = await readFanoutFrame(tx, handle, root, input.fanoutAttemptId);
    if (!frame || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, root, producer.graphRevision), node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(node?.nodeId)), fanout = (await readAttempt(tx, handle, root, frame.fanoutAttemptId)).doc;
    const pin = lineage.plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId);
    if (!branch || !['agent', 'planner', 'judge'].includes(node.kind)
        || !equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []].sort()) || input.kind !== 'native_session_delegated_intent' || input.role !== 'narrator' || !equal(input.audience, lineage.parentInput.audience)
        || input.nodeId !== producer.nodeId || input.parentRunId !== root.parentRef.parentRunId || input.parentAttemptId !== root.parentRef.nodeAttemptId
        || input.parentEpoch !== root.parentRef.parentEpoch || input.childRunId !== root.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== root.parentRef.inputDigest || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(input.planRef, root.planRef)
        || !pin || pin.port !== 'model' || !node.dependencyPinIds.includes(pin.pinId) || !equal(input.routeRef, pin.resourceRef)
        || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, root.budgetAuthorityRef)
        || !equal(producer.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...input.acceptedControlRefs ?? []])
        || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    const actor = sessionDelegationResultSources(root, producer, lineage.plan)[0], scope = input.delegationScope;
    if (!scope || scope.parentPinId !== lineage.parentPin.pinId || scope.childPinId !== actor.pinId
        || !equal(scope.sourceRef, actor.sourceRef) || !equal(scope.sourceRef, lineage.parentInput.delegationScope.sourceRef)
        || scope.integrity !== lineage.parentInput.delegationScope.integrity) invalid();
    const facts = await refs(tx, handle, root, input), inherited = facts.filter(fact => fanout.inputRefs.some(ref => equal(ref, fact.controlRef ?? fact.receipt.resultRef)));
    if ([...fanout.inputRefs[0].acceptedGraphResultRefs, ...fanout.inputRefs[0].acceptedControlRefs].some(ref => !producer.inputRefs.some(actual => equal(actual, ref)))) invalid();
    for (const fact of inherited) await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, producer,
        fact.controlRef ?? fact.receipt.resultRef, fact, { historical: true });
    if (facts.some(fact => fact.receipt.decisionSeq >= publicationSeq || fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(node.nodeId))) invalid();
    const judges = facts.filter(fact => fact.selectedResultRef);
    assertSessionJudgeSelections({ ...root, graph: snapshot.graph }, node, input.acceptedGraphResultRefs, judges);
    const direct = facts.filter(fact => !inherited.includes(fact)), bindings = input.graphBindings;
    if (producer.attemptId === branch.entryAttemptId) {
        if (bindings.length || direct.length) invalid();
    } else {
        const incoming = snapshot.graph.edges.filter(edge => edge.to.nodeId === node.nodeId && branch.scopeNodeIds.includes(edge.from.nodeId))
            .filter(edge => !judges.some(judge => judge.candidates.some(candidate => candidate.producer.nodeId === edge.from.nodeId
                && !equal(candidate.receipt.resultRef, judge.selectedResultRef))));
        if (!producer.reservationRef || bindings.length !== incoming.length || direct.some(fact => !branch.scopeNodeIds.includes(fact.producer.nodeId))
            || bindings.some(binding => !incoming.some(edge => edge.edgeId === binding.edgeId
                && direct.some(fact => fact.producer.attemptId === binding.producerAttemptId && fact.producer.nodeId === edge.from.nodeId)))) invalid();
        const identity = hash({ runId: root.runId, bindings, reservedAttemptId: producer.attemptId });
        await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: producer,
            producerBindings: bindings, reservedAttemptId: producer.attemptId, receipt: { decisionSeq: publicationSeq,
                traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
    }
    return { lineage, input, sources: facts, bindings, loops: [], replacement: null };
}

async function memberInput(tx, handle, root, attempt, { frame, branch, reservation, settlement, results }) {
    if (attempt.inputState === 'reserved') {
        if (!reservation || attempt.status !== 'cancelled' || attempt.inputRefs !== null || attempt.effectiveGrantDigest !== null || attempt.budgetRef !== null
            || attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(attempt.nodeId)) invalid();
        return;
    }
    if (results.length) {
        // The shared reader just read this original Result with its complete
        // delegated input proof. Accept no external proof or other Root's facts.
        const [fact] = results, proof = fact.sessionDelegatedInput;
        if (results.length !== 1 || !proof || !equal(fact.producer, attempt) || !equal(fact.settlement, settlement)
            || proof.requestedRootDigest !== hash(root) || proof.producerDigest !== hash(attempt)
            || !fact.modelEffect || proof.effectDigest !== hash(fact.modelEffect) || !fact.modelCompletion
            || !equal(attempt.effectRefs, [fact.modelEffect.effectId]) || !equal(proof.input, attempt.inputRefs[0])) invalid();
        return;
    }
    await readSessionDelegatedFanoutInput(tx, handle, root, attempt, attempt.inputRefs[0], settlement.decisionSeq);
}

async function controlInput(tx, handle, root, attempt, { settlement, frame }) {
    await childIdentity(tx, handle, root);
    const input = attempt.inputRefs[0], node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
    if (input.kind !== 'native_session_delegated_control' || input.nodeId !== attempt.nodeId || !equal(input.planRef, root.planRef)
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(attempt.budgetRef, root.budgetAuthorityRef)
        || attempt.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !equal(attempt.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...input.acceptedControlRefs])
        || attempt.inputDigest !== hash(attempt.inputRefs)
        || node.kind === 'fanout' && settlement.reasonCode !== 'session_fanout_join_' + settlement.outcome
        || node.kind === 'join' && settlement.reasonCode !== null && !['join_deadline', 'join_member_unsuccessful', 'join_quorum_unreachable'].includes(settlement.reasonCode)) invalid();
    const facts = await refs(tx, handle, root, input);
    if (node.kind === 'fanout') {
        if (!input.graphBindings.length) { if (!root.graph.entryNodeIds.includes(node.nodeId) || facts.length) invalid(); } else {
            const direct = facts.filter(fact => input.graphBindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
            const identity = hash({ runId: root.runId, bindings: input.graphBindings, reservedAttemptId: null });
            await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: attempt,
                producerBindings: input.graphBindings, receipt: { decisionSeq: settlement.decisionSeq,
                    traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
        }
    } else if (facts.length || input.graphBindings.length || input.fanoutAttemptId !== frame.fanoutAttemptId) invalid();
}

async function memberCost(tx, handle, root, attempt, { frame, settlement, results }) {
    if (!attempt.effectRefs.length) {
        if (attempt.status !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid(); return;
    }
    if (attempt.effectRefs.length !== 1) invalid();
    const effect = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
    const fact = await readModelCompletionReceipt(handle, tx, root, effect) ?? await readModelTerminalFact(handle, tx, root, effect);
    const planner = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'planner' && attempt.status === 'completed'
        ? await readSessionPlannerCompletion(tx, handle, root, attempt.attemptId) : null;
    if (planner) {
        if (results.length || !equal(planner.producer, attempt) || !equal(planner.settlement, settlement)
            || !fact || !equal(planner.receipt.modelReceiptRef, fact.receiptRef)) invalid();
        assertSessionFanoutPlannerOperations(frame, attempt, planner.patch.appliedOperations);
    }
    const judge = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'judge' && attempt.status === 'completed'
        ? await readSessionDelegatedJudgeCompletion(tx, handle, root, attempt.attemptId) : null;
    if (judge && (results.length || !equal(judge.producer, attempt) || !equal(judge.settlement, settlement)
        || !fact || !equal(judge.receipt.modelReceiptRef, fact.receiptRef))) invalid();
    const bank = (await readRunControl(tx, handle, root.budgetAuthorityRef.sessionId))?.operations[root.budgetAuthorityRef.operationId]?.compute;
    const fees = bank?.attempts.filter(row => row.orchestration?.effectId === effect.effectId), local = bank?.localWork?.filter(row => row.orchestration?.effectId === effect.effectId) ?? [];
    if (!fact || !fees || fees.length !== 1 || [...fees, ...local].some(row => row.reservationId !== root.runId || row.status !== 'settled')
        || effect.capability !== 'generation.send' || effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch
        || !equal(settlement.effectReceiptRefs, [fact.receiptRef.receiptId])
        || (attempt.status === 'completed' ? planner || judge ? false : !results.length || settlement.reasonCode !== 'graph_result_published'
            : attempt.status === 'failed' ? fact.kind !== 'rejected' || fact.outcome !== 'failed' : fact.kind !== 'late_response')) invalid();
}

export function readSessionDelegatedFanoutCompletion(tx, handle, root, joinAttemptId, { recipient = null } = {}) {
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId, {
        verifyMemberInput: memberInput, verifyControlInput: controlInput, verifyMemberCost: memberCost, recipient,
    });
}
