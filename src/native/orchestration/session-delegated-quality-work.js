import { readSessionDelegatedFanoutCompletion } from './session-delegated-fanout-contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { runGenerationLocalWork } from './generation-local-work.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { parseSessionGraphReview, sessionReviewRerunRequirements, readSessionReviewableFanout } from './session-review-contracts.js';
import { sessionPlannerReaderOptions } from './session-planner-contracts.js';
import { graphReviewModelReceiptId, graphReviewControlRef, readReviewablePlannerCompletion } from './graph-review-completion.js';
import { graphJudgeModelReceiptId, graphJudgeControlRef } from './graph-judge-completion.js';
import { controlCommandId, controlRecordKey, readAttempt, readReviewAdmission, readAttemptInvalidation, graphReachable, runGuard } from './controller-common.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { writeAttemptSettlement } from './attempt-settlement.js';

const fail = code => { throw new ConflictError(code); };

/** Metered original work in this already held Session child reservation. */
function qualityWork({ state, service, send, limits, current }, rows) {
    return async (kind, input, operation) => {
        const runId = state.identity.childRunId, effectId = state.activeNode.effectId;
        const attempt = { attemptId: send.bank.nextLocalWorkAttemptId(), requestId: state.request.requestId, kind, estimatedItems: 1,
            estimatedInputBytes: Buffer.byteLength(JSON.stringify(input)), targetFingerprint: hash({ runId, effectId, kind, inputHash: hash(input) }) };
        let admitted;
        const result = await runGenerationLocalWork({ signal: state.boundary.signal, attempt, requireAdmission: true, assertCurrent: current,
            admit: row => send.bank.chargeLocalWork(limits, row), settle: ({ attempt, usage }) => send.bank.settleLocalWork(attempt.attemptId, usage),
            onAdmitted: row => { admitted = row; } }, operation);
        const saved = await service.budgetPort.observeAttempt(state.handle, { kind: 'local_work', authorityRef: state.root.budgetAuthorityRef,
            effectId, localWorkOrdinal: admitted.orchestration.ordinal, attemptId: admitted.attemptId, reservationId: runId });
        if (saved.status !== 'settled' || saved.usage?.outcome !== 'completed') fail('native_orchestration_control_work_unsettled');
        rows.push({ kind, attemptId: saved.attemptId, ordinal: saved.orchestration.ordinal, targetFingerprint: saved.targetFingerprint, rowHash: hash(saved) });
        return result;
    };
}

export async function completeSessionDelegatedReview(args) {
    const { state, service, port, result, current, engine } = args, { handle } = state, runId = state.identity.childRunId;
    const attemptId = state.activeNode.nodeAttemptId, effectId = state.activeNode.effectId, rows = [], work = qualityWork(args, rows);
    const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), responseText = result.generated.response.text;
    const parsed = await work('graph_control_parse', responseText, async () => {
        if (Buffer.byteLength(responseText) > assertResultPolicy(state.root.graph.outputContract).maxBytes) fail('native_orchestration_review_response_invalid');
        return immutable(parseSessionGraphReview(responseText));
    });
    const evidenceRefs = state.decision.inputRef.acceptedGraphResultRefs;
    const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, attemptId) }, reasonCode: parsed.reasonCode };
    const controller = new ReviewController({ runs: service.runs, authorizeReview: async ({ tx, root, reviewer, targets, decision, reasonCode, evidenceRefs: actual }) => {
        await current();
        if (reviewer.attemptId !== attemptId || !equal(actual, evidenceRefs) || decision !== parsed.decision || reasonCode !== parsed.reasonCode
            || !equal(targets.map(target => target.attemptId).sort(), [...parsed.targetAttemptIds].sort())
            || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_review_producer_denied');
        const evidence = [];
        for (const ref of actual) {
            const fact = await readGraphNodeResult(tx, handle, root, ref.resultId, { recipient: reviewer });
            if (!fact || !equal(fact.receipt.resultRef, ref)) fail('native_orchestration_review_evidence_denied');
            evidence.push(fact);
        }
        if (targets.some(target => !evidence.some(fact => fact.producer.attemptId === target.attemptId)
            || root.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent')) fail('native_orchestration_review_target_invalid');
        if (decision === 'rerun') for (const id of root.attemptRefs) {
            const attempt = (await readAttempt(tx, handle, root, id)).doc;
            if (attempt.attemptId === reviewer.attemptId || await readAttemptInvalidation(tx, handle, root, attempt)) continue;
            const node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
            if (!targets.some(target => graphReachable(root.graph, target.nodeId, attempt.nodeId))) continue;
            if (['fanout', 'join'].includes(node?.kind) ? !await readSessionReviewableFanout(tx, handle, root, attempt, targets)
                : node?.capabilities.includes('agent.delegate')
                || (node?.kind === 'planner' || node?.capabilities.includes('graph.patch'))
                    && !await readReviewablePlannerCompletion(tx, handle, root, attempt.attemptId, { ...sessionPlannerReaderOptions, reviewTargets: targets, readFanoutCompletion: readSessionDelegatedFanoutCompletion }))
                fail('native_orchestration_review_irreversible_dependency');
        }
    }, admitRerun: async ({ tx, root, reviewer, target, invalidatedAttemptIds }) => {
        await current();
        const required = await sessionReviewRerunRequirements(tx, handle, root, reviewer, invalidatedAttemptIds);
        const admission = await readReviewAdmission(tx, handle, root, reviewer), node = root.graph.nodes.find(node => node.nodeId === reviewer.nodeId);
        if (!admission || admission.round >= node.policy.maxRounds || root.progress.reviews + required.reviews > root.limits.maxReviews
            || root.progress.attempts + required.attempts > root.limits.maxAttempts) fail('native_orchestration_review_limit_exhausted');
        const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: runId }, { tx });
        if (!capacity || capacity.overrun || capacity.remaining.requests < required.requests) fail('native_orchestration_review_rerun_budget_unavailable');
        const logical = { ...target.inputRefs[0], reviewFeedbackRef: feedback }, inputRefs = [logical, ...target.inputRefs.slice(1)];
        return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: target.effectiveGrantDigest, budgetRef: root.budgetAuthorityRef };
    } });
    const withAuthority = service.sourcePort.consumptionBoundary(handle, state.root.sourceBinding, { engine });
    const decided = await work('graph_control_adopt', parsed, () => service.runs.withSourceControl(handle, runId, async () => controller.decide(handle,
        { ...runGuard(await service.runs.get(handle, runId)), reviewAttemptId: attemptId, decision: parsed.decision,
            targetAttemptIds: parsed.targetAttemptIds, reasonCode: parsed.reasonCode, evidenceRefs }), { withAuthority }));
    const review = decided.outcome.reviewReceipt, receiptId = graphReviewModelReceiptId(runId, attemptId);
    await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('graph.review.settle', attemptId), {
        ...runGuard(await service.runs.get(handle, runId)),
        operation: 'attempt.settle', detail: { attemptId, reviewReceiptId: review.receiptId } }, async ({ tx, root, now }) => {
        await current();
        const record = await readAttempt(tx, handle, root, attemptId);
        if (record.doc.status !== 'running' || record.doc.resultRefs.length || !equal(record.doc.effectRefs, [effectId])
            || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_review_producer_denied');
        const receipt = { schemaVersion: 1, receiptKind: 'graph_review_model', receiptId, runId, epoch: root.epoch, producerAttemptId: attemptId,
            sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: state.identity.grantDigest, modelEffectId: effectId, modelReceiptRef: proof.receiptRef,
            modelPayloadHash: proof.payloadHash, responseText, reviewReceiptRef: { runId, receiptId: review.receiptId }, reviewIntegrity: hash(review),
            localWork: rows, decisionSeq: root.eventSeq + 1, createdAt: now };
        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
        await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'graph_review_decided', now });
        root.progress.steps++;
        return { root, eventType: 'graph_review_completed', reasonCode: parsed.reasonCode, outcome: {} };
    }), { withAuthority });
    return { attemptId, review, feedback, controlRef: graphReviewControlRef(runId, attemptId) };
}

export async function completeSessionDelegatedJudge(args) {
    const { state, service, port, result, current, engine } = args, { handle } = state, runId = state.identity.childRunId;
    const attemptId = state.activeNode.nodeAttemptId, effectId = state.activeNode.effectId, rows = [], work = qualityWork(args, rows);
    const proof = await port.inspectResultCompletion(handle, { result, runId, effectId }), responseText = result.generated.response.text;
    const candidateRefs = state.decision.inputRef.acceptedGraphResultRefs;
    const parsed = await work('graph_control_parse', responseText, async () => {
        if (Buffer.byteLength(responseText) > assertResultPolicy(state.root.graph.outputContract).maxBytes) fail('native_orchestration_judge_response_invalid');
        const value = JSON.parse(responseText); assertObject(value, ['selectedResultRef', 'reasonCode'], 'Session child Judge response');
        if (value.reasonCode !== 'candidate_selected' || !candidateRefs.some(ref => equal(ref, value.selectedResultRef))) fail('native_orchestration_judge_response_invalid');
        return immutable(value);
    });
    const withAuthority = service.sourcePort.consumptionBoundary(handle, state.root.sourceBinding, { engine });
    await work('graph_control_adopt', parsed, () => service.runs.withSourceControl(handle, runId, async () => {
        await current();
        if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
    }, { withAuthority }));
    const receiptId = graphJudgeModelReceiptId(runId, attemptId), selectedResultRef = parsed.selectedResultRef;
    await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('graph.judge.settle', attemptId), {
        ...runGuard(await service.runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId, selectedResultRef } }, async ({ tx, root, now }) => {
        await current();
        const record = await readAttempt(tx, handle, root, attemptId);
        if (record.doc.status !== 'running' || record.doc.resultRefs.length || !equal(record.doc.effectRefs, [effectId])
            || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
        const receipt = { schemaVersion: 1, receiptKind: 'graph_judge_model', receiptId, runId, epoch: root.epoch, producerAttemptId: attemptId,
            sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: state.identity.grantDigest, modelEffectId: effectId, modelReceiptRef: proof.receiptRef,
            modelPayloadHash: proof.payloadHash, responseText, candidateRefs, selectedResultRef, localWork: rows, decisionSeq: root.eventSeq + 1, createdAt: now };
        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
        await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'graph_judge_selected', now });
        root.progress.steps++;
        return { root, eventType: 'graph_judge_selected', reasonCode: 'candidate_selected', outcome: { judgeReceiptRef: { runId, receiptId } } };
    }), { withAuthority });
    return { attemptId, controlRef: graphJudgeControlRef(runId, attemptId), candidateRefs, selectedResultRef };
}
