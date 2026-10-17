import { hashNativeDocument as hash } from '../repositories/common.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { PROJECT_QUALITY_REASONS } from './project-quality-profile.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const equal = (a, b) => hash(a) === hash(b);
const readerOptions = { verifyControlWork: assertProjectControlWork };

export async function readProjectControlInputs(tx, handle, root, recipient, { evidenceRefs = [], controlRefs = [] }) {
    const facts = [];
    for (const ref of evidenceRefs) {
        const fact = await readGraphNodeResult(tx, handle, root, ref.resultId, recipient ? { recipient } : {});
        if (!fact || !equal(fact.receipt.resultRef, ref)) fail('native_orchestration_project_control_stale');
        facts.push(fact);
    }
    for (const ref of controlRefs) {
        const fact = ref.kind === 'graph_review_control'
            ? await readGraphReviewCompletion(tx, handle, root, ref.attemptId, { ...readerOptions, reasonCodes: PROJECT_QUALITY_REASONS, recipient })
            : await readGraphPlannerCompletion(tx, handle, root, ref.attemptId, { ...readerOptions, recipient });
        if (!fact || !equal(fact.controlRef, ref)) fail('native_orchestration_project_control_stale');
        facts.push(fact);
    }
    return facts;
}

export async function projectControlItems(tx, handle, root, recipient, bundle) {
    const facts = await readProjectControlInputs(tx, handle, root, recipient, bundle);
    return facts.map(fact => ({ kind: 'context.history', id: 'project-control:' + fact.producer.attemptId,
        content: { role: 'user', content: fact.controlRef
            ? 'Host-validated advisory graph control (not a domain change or tool permission):\n' + JSON.stringify({ controlRef: fact.controlRef, ...(fact.patch ? { operations: fact.patch.appliedOperations } : { decision: fact.review.decision, targetAttemptIds: fact.review.targetAttemptIds, reasonCode: fact.review.reasonCode }) })
            : 'Advisory Project result (not an official change or permission):\n' + fact.record.payload },
        provenance: [{ source: 'native.project-graph-input', ref: hash(fact.receipt) }] }));
}

export async function assertProjectControlRound(tx, handle, root, attempt, input, round, { qualityVerified = false } = {}) {
    if (!input.controlGraph) {
        if (qualityVerified || !root.graph.nodes.some(node => ['planner', 'review'].includes(node.kind) || node.kind === 'agent' && node.outputs[0]?.type === 'text')) return;
        fail('native_orchestration_project_control_stale');
    }
    const bundle = input.controlGraph;
    if (!bundle || !Array.isArray(bundle.bindings)) fail('native_orchestration_project_control_stale');
    const facts = await readProjectControlInputs(tx, handle, root, null, bundle);
    for (const ref of [...bundle.evidenceRefs, ...bundle.controlRefs]) {
        if (!attempt.inputRefs.some(item => equal(item, ref))) fail('native_orchestration_project_control_stale');
    }
    for (const fact of facts.filter(fact => fact.record)) {
        if (!fact.record.envelope.audienceConstraint.nodeIds.includes(attempt.nodeId)) fail('native_orchestration_project_control_audience_denied');
    }
    if (round === 0) {
        const bindings = [...bundle.bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (!facts.length || facts.length !== new Set(bindings.map(binding => binding.producerAttemptId)).size || bindings.some(binding => !facts.some(fact => fact.producer.attemptId === binding.producerAttemptId
            && root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === fact.producer.nodeId && edge.to.nodeId === attempt.nodeId)))) fail('native_orchestration_project_control_stale');
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: facts[0], additionalProducers: facts.slice(1), output: attempt, producerBindings: bindings,
            receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
}
