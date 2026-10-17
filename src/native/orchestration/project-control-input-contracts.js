import { hashNativeDocument as hash } from '../repositories/common.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { readGraphFanoutInput } from './graph-fanout-completion.js';
import { readProjectFanoutCompletion } from './project-fanout-contracts.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { readAttempt } from './controller-common.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const equal = (a, b) => hash(a) === hash(b);
const readerOptions = { verifyControlWork: assertProjectControlWork };
export const projectJudgeReaderOptions = { verifyControlWork: assertProjectControlWork,
    readControlInputs: (tx, handle, root, _producer, input) => readProjectControlInputs(tx, handle, root, null,
        { controlRefs: input.controlGraph.controlRefs }, { checkSelections: false }) };


export async function readProjectControlInputs(tx, handle, root, recipient, { evidenceRefs = [], controlRefs = [] }, { targetNodeId = recipient?.nodeId ?? null, checkSelections = true } = {}) {
    const facts = [];
    for (const ref of evidenceRefs) {
        const fact = await readGraphNodeResult(tx, handle, root, ref.resultId, recipient ? { recipient } : {});
        if (!fact || !equal(fact.receipt.resultRef, ref)) fail('native_orchestration_project_control_stale');
        facts.push(fact);
    }
    for (const ref of controlRefs) {
        const source = (await readAttempt(tx, handle, root, ref.attemptId)).doc;
        const crossed = recipient && !root.graph.edges.some(edge => edge.from.nodeId === source.nodeId && edge.to.nodeId === recipient.nodeId);
        const fanoutId = recipient?.inputRefs[0]?.fanoutAttemptId;
        const directRecipient = fanoutId && crossed ? null : recipient;
        const fact = ref.kind === 'graph_join_control' ? await readProjectFanoutCompletion(tx, handle, root, ref.attemptId, { recipient: directRecipient })
            : ref.kind === 'graph_judge_control' ? await readGraphJudgeCompletion(tx, handle, root, ref.attemptId, { ...projectJudgeReaderOptions, recipient: directRecipient })
                : ref.kind === 'graph_review_control' ? await readGraphReviewCompletion(tx, handle, root, ref.attemptId, { ...readerOptions, reasonCodes: PROJECT_QUALITY_REASONS, recipient: directRecipient })
                    : await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, { ...readerOptions, recipient: directRecipient });
        if (!fact || !equal(fact.controlRef, ref)) fail('native_orchestration_project_control_stale');
        if (fanoutId && directRecipient === null) await readGraphFanoutInput(tx, handle, root, fanoutId, recipient, ref, fact);
        facts.push(fact);
    }
    if (checkSelections && targetNodeId !== null) for (const judge of facts.filter(fact => fact.controlRef?.kind === 'graph_judge_control')) {
        for (const candidate of judge.candidates) {
            const direct = root.graph.edges.some(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === targetNodeId);
            if (direct && evidenceRefs.some(ref => equal(ref, candidate.receipt.resultRef)) !== equal(candidate.receipt.resultRef, judge.selectedResultRef))
                fail('native_orchestration_project_judge_selection_stale');
        }
    }
    return facts;
}

export async function projectControlItems(tx, handle, root, recipient, bundle, { controlsOnly = false } = {}) {
    const facts = await readProjectControlInputs(tx, handle, root, recipient, bundle);
    return facts.filter(fact => !controlsOnly || fact.controlRef).map(fact => ({ kind: 'context.history', id: 'project-control:' + fact.producer.attemptId,
        content: { role: 'user', content: fact.controlRef
            ? 'Host-validated advisory graph control (not a domain change or tool permission):\n' + JSON.stringify({ controlRef: fact.controlRef, ...(fact.patch ? { operations: fact.patch.appliedOperations } : fact.review ? { decision: fact.review.decision, targetAttemptIds: fact.review.targetAttemptIds, reasonCode: fact.review.reasonCode }
                : fact.selectedResultRef ? { selectedResultRef: fact.selectedResultRef, reasonCode: 'candidate_selected' }
                    : { joinId: fact.joinReceipt.joinId, outcome: fact.joinReceipt.outcome, acceptedResultRefs: fact.joinReceipt.acceptedResultRefs }) })
            : 'Advisory Project result (not an official change or permission):\n' + fact.record.payload },
        provenance: [{ source: 'native.project-graph-input', ref: hash(fact.receipt) }] }));
}

export async function assertProjectControlRound(tx, handle, root, attempt, input, round, { qualityVerified = false } = {}) {
    if (!input.controlGraph) {
        if (qualityVerified || !root.graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind) || node.kind === 'agent' && node.outputs[0]?.type === 'text')) return;
        fail('native_orchestration_project_control_stale');
    }
    const bundle = input.controlGraph;
    if (!bundle || !Array.isArray(bundle.bindings)
        || (input.acceptedGraphResultRefs !== undefined || input.acceptedControlRefs !== undefined)
            && (!equal(input.acceptedGraphResultRefs, bundle.evidenceRefs) || !equal(input.acceptedControlRefs, bundle.controlRefs))) fail('native_orchestration_project_control_stale');
    const facts = await readProjectControlInputs(tx, handle, root, null, bundle, { targetNodeId: attempt.nodeId });
    for (const ref of [...bundle.evidenceRefs, ...bundle.controlRefs]) {
        if (!attempt.inputRefs.some(item => equal(item, ref))) fail('native_orchestration_project_control_stale');
    }
    for (const fact of facts.filter(fact => fact.record)) {
        if (!fact.record.envelope.audienceConstraint.nodeIds.includes(attempt.nodeId)) fail('native_orchestration_project_control_audience_denied');
    }
    if (round === 0) {
        const bindings = [...bundle.bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const direct = facts.filter(fact => bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
        const joined = direct.filter(fact => fact.joinReceipt);
        if (!direct.length || direct.length !== new Set(bindings.map(binding => binding.producerAttemptId)).size
            || facts.filter(fact => !direct.includes(fact)).some(fact => !fact.record || !joined.some(join => join.joinReceipt.acceptedResultRefs.some(ref => equal(ref, fact.receipt.resultRef))))
            || bindings.some(binding => !direct.some(fact => fact.producer.attemptId === binding.producerAttemptId
                && root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === fact.producer.nodeId && edge.to.nodeId === attempt.nodeId)))) fail('native_orchestration_project_control_stale');
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: attempt, producerBindings: bindings,
            receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
}
