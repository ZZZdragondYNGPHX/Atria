import { assertBudgetAttemptRef, sendAttemptId } from './budget-port.js';
import { taskLocalReceiptId } from './task-local-output-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readAttempt, controlRecordKey } from './controller-common.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readDelegationCompletion } from './delegation-completion-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { rpDelegatedControlProfile } from './rp-delegated-control-profile.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readRpDelegatedControl } from './rp-delegated-quality-contracts.js';
import { readGraphFanoutCompletion, readGraphFanoutInput } from './graph-fanout-completion.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original RP child Fanout facts'); };

async function childIdentity(tx, handle, root) {
    const parent = root.parentRef && (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.parentRef.parentRunId }))?.doc;
    if (!parent || root.sourceBinding.sourceAuthority !== 'rp_chat') invalid();
    const actual = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.runId }))?.doc;
    const facts = actual && await readDelegationCompletion(tx, handle, parent, actual);
    const plan = await readPlanRevision(tx, handle, root.planRef), profile = rpDelegatedControlProfile(plan);
    if (!facts || !profile || !equal(actual.sourceBinding, root.sourceBinding) || !equal(actual.planRef, root.planRef)) invalid();
    const lineage = { ...facts, parent, child: actual, plan, profile };
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
    const facts = [];
    for (const ref of input.acceptedGraphResultRefs) {
        const fact = await readGraphNodeResult(tx, handle, root, ref.resultId);
        if (!fact || !equal(ref, fact.receipt.resultRef)) invalid(); facts.push(fact);
    }
    for (const ref of input.acceptedControlRefs ?? []) {
        const fact = await readRpDelegatedControl(tx, handle, root, ref);
        if (!fact || !equal(ref, fact.controlRef) || fact.review?.decision === 'rerun') invalid(); facts.push(fact);
    }
    return facts;
}

/** Typed stage inputs only; no new Source, capability or reservation is issued. */
export async function readRpDelegatedFanoutInput(tx, handle, root, producer, input, publicationSeq) {
    const lineage = await childIdentity(tx, handle, root), frame = await readFanoutFrame(tx, handle, root, input.fanoutAttemptId);
    if (!frame || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, root, producer.graphRevision), node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(node?.nodeId)), fanout = (await readAttempt(tx, handle, root, frame.fanoutAttemptId)).doc;
    const pin = lineage.plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId);
    if (!branch || node.kind !== 'agent' || input.kind !== 'native_rp_delegated_intent' || input.role !== 'narrator' || !equal(input.audience, { kind: 'task', id: root.runId })
        || input.nodeId !== producer.nodeId || input.parentRunId !== root.parentRef.parentRunId || input.parentAttemptId !== root.parentRef.nodeAttemptId
        || input.childRunId !== root.runId || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(input.planRef, root.planRef)
        || !pin || pin.port !== 'model' || !node.dependencyPinIds.includes(pin.pinId) || !equal(input.routeRef, pin.resourceRef)
        || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest || !equal(producer.budgetRef, root.budgetAuthorityRef)
        || !equal(producer.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...input.acceptedControlRefs ?? []])
        || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    if (!input.controlGraph || !equal(input.controlGraph.evidenceRefs, input.acceptedGraphResultRefs)
        || !equal(input.controlGraph.controlRefs, input.acceptedControlRefs)) invalid();
    const facts = await refs(tx, handle, root, input), inherited = facts.filter(fact => fanout.inputRefs.some(ref => equal(ref, fact.controlRef ?? fact.receipt.resultRef)));
    if ([...fanout.inputRefs[0].acceptedGraphResultRefs, ...fanout.inputRefs[0].acceptedControlRefs].some(ref => !producer.inputRefs.some(actual => equal(actual, ref)))) invalid();
    for (const fact of inherited) await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, producer,
        fact.controlRef ?? fact.receipt.resultRef, fact, { historical: true });
    if (facts.some(fact => fact.receipt.decisionSeq >= publicationSeq || fact.record && !fact.record.envelope.audienceConstraint.nodeIds.includes(node.nodeId))) invalid();
    const direct = facts.filter(fact => !inherited.includes(fact)), bindings = input.controlGraph.bindings;
    if (producer.attemptId === branch.entryAttemptId) {
        if (bindings.length || direct.length) invalid();
    } else {
        const incoming = snapshot.graph.edges.filter(edge => edge.to.nodeId === node.nodeId && branch.scopeNodeIds.includes(edge.from.nodeId));
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

async function memberInput(tx, handle, root, attempt, { frame, branch, reservation, settlement }) {
    if (attempt.inputState === 'reserved') {
        if (!reservation || attempt.status !== 'cancelled' || attempt.inputRefs !== null || attempt.effectiveGrantDigest !== null || attempt.budgetRef !== null
            || attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(attempt.nodeId)) invalid();
        return;
    }
    await readRpDelegatedFanoutInput(tx, handle, root, attempt, attempt.inputRefs[0], settlement.decisionSeq);
}

async function controlInput(tx, handle, root, attempt, { settlement, frame }) {
    await childIdentity(tx, handle, root);
    const input = attempt.inputRefs[0], node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
    if (input.kind !== 'native_rp_delegated_control' || input.nodeId !== attempt.nodeId || !equal(input.planRef, root.planRef)
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(attempt.budgetRef, root.budgetAuthorityRef)
        || attempt.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !equal(attempt.inputRefs, [input, ...root.parentRef.inputRefs, ...input.acceptedGraphResultRefs, ...input.acceptedControlRefs])
        || attempt.inputDigest !== hash(attempt.inputRefs)
        || node.kind === 'fanout' && settlement.reasonCode !== 'rp_fanout_join_' + settlement.outcome
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

async function memberCost(tx, handle, root, attempt, { settlement, results }) {
    if (!attempt.effectRefs.length) {
        if (attempt.status !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid(); return;
    }
    if (attempt.effectRefs.length !== 1 || root.budgetAuthorityRef.domain !== 'rp_chat') invalid();
    const effect = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
    const completed = await readModelCompletionReceipt(handle, tx, root, effect);
    const terminal = completed ? null : await readModelTerminalFact(handle, tx, root, effect), fact = completed ?? terminal;
    if (!equal(root.sourceBinding.budgetAuthorityRef, root.budgetAuthorityRef)) invalid();
    const control = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: root.budgetAuthorityRef.controlId }))?.doc;
    const bank = control?.operations[root.budgetAuthorityRef.operationId]?.compute;
    const fees = bank?.attempts.filter(row => row.orchestration?.effectId === effect.effectId), local = bank?.localWork?.filter(row => row.orchestration?.effectId === effect.effectId) ?? [];
    if (!fact || !fees || fees.length !== 1 || fees[0].orchestration.kind !== 'provider_send' || fees[0].orchestration.ordinal !== 0
        || fees[0].reservationId !== root.runId || !['settled', 'charged', 'unknown'].includes(fees[0].status)
        || local.some(row => row.reservationId !== root.runId || row.status !== 'settled')
        || effect.capability !== 'generation.send' || effect.risk !== 'R1' || effect.requiresApproval
        || effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch
        || !equal(effect.inputRef, attempt.inputRefs[0]) || effect.inputHash !== hash(attempt.inputRefs[0])
        || effect.grantDigest !== root.parentRef.effectiveGrantDigest || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(settlement.effectReceiptRefs, [fact.receiptRef.receiptId])
        || (results.length ? !completed || settlement.outcome !== 'completed'
            : terminal?.kind !== (settlement.outcome === 'failed' ? 'rejected' : 'late_response'))) invalid();
    const sends = fact.observation.dispatchEvidence.reference.attempts;
    if (!sends?.length || sends.length !== 1) invalid();
    for (const [ordinal, send] of sends.entries()) {
        const ref = assertBudgetAttemptRef(send.budgetAttemptRef), row = bank.attempts.find(row => row.attemptId === ref.attemptId);
        if (!row || ref.kind !== undefined || !equal(ref.authorityRef, root.budgetAuthorityRef) || ref.effectId !== effect.effectId || ref.providerSendOrdinal !== ordinal
            || ref.attemptId !== sendAttemptId(effect.effectId, ordinal) || !equal(row.orchestration, { kind: 'provider_send', effectId: effect.effectId, ordinal })
            || ref.reservationId !== root.runId || row.reservationId !== root.runId || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint
            || row.inputFingerprint !== send.inputFingerprint || !['charged', 'unknown', 'settled'].includes(row.status)
            || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
}

export function readRpDelegatedFanoutCompletion(tx, handle, root, joinAttemptId, { recipient = null } = {}) {
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId, {
        verifyMemberInput: memberInput, verifyControlInput: controlInput, verifyMemberCost: memberCost, recipient,
    });
}
