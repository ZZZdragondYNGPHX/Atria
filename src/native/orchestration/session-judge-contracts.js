import { equalNativeDocuments as equal } from '../repositories/common.js';
import { readAttempt } from './controller-common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readGraphJudgeCompletion } from './graph-judge-completion.js';
import { readSessionPlannerCompletion, assertSessionControlWork } from './session-planner-contracts.js';
import { readSessionReviewCompletion } from './session-review-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Session Judge inputs'); };

async function readControls(tx, handle, root, producer, input) {
    const facts = [];
    const settled = await readAttemptSettlement(tx, handle, root, producer);
    for (const binding of input.controlGraph?.bindings ?? []) {
        const attempt = (await readAttempt(tx, handle, root, binding.producerAttemptId)).doc;
        const node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
        if (attempt.attemptId === producer.attemptId || (await readAttemptSettlement(tx, handle, root, attempt)).decisionSeq >= settled.decisionSeq) invalid();
        let fact;
        if (node?.kind === 'planner') fact = await readSessionPlannerCompletion(tx, handle, root, attempt.attemptId);
        else if (node?.kind === 'judge') fact = await readSessionJudgeCompletion(tx, handle, root, attempt.attemptId);
        else if (node?.kind === 'review') fact = await readSessionReviewCompletion(tx, handle, root, attempt.attemptId);
        else continue;
        if (!fact || !root.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === attempt.nodeId && edge.to.nodeId === producer.nodeId)
            || fact.controlRef && !(input.acceptedControlRefs ?? []).some(ref => equal(ref, fact.controlRef))) invalid();
        facts.push(fact);
    }
    return facts;
}

export async function readSessionJudgeCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Session Judge read');
    const fact = await readGraphJudgeCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertSessionControlWork, readControlInputs: readControls, ...options });
    if (!fact) return null;
    const input = fact.producer.inputRefs[0];
    if (input.controlGraph) assertObject(input.controlGraph, ['bindings'], 'Session Judge control graph');
    if (root.sourceBinding.sourceAuthority !== 'native_session'
        || !equal(fact.producer.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])) invalid();
    return fact;
}

/** A quality selection can remove optional advisory inputs only. Every selected
 * body still needs its original direct Result audience and current Source. */
export function assertSessionJudgeSelections(root, node, refs, facts) {
    for (const fact of facts) for (const candidate of fact.candidates) {
        const edges = root.graph.edges.filter(edge => !edge.loopBack && edge.from.nodeId === candidate.producer.nodeId && edge.to.nodeId === node.nodeId);
        if (!edges.length) continue;
        const selected = equal(candidate.receipt.resultRef, fact.selectedResultRef);
        if (refs.some(ref => equal(ref, candidate.receipt.resultRef)) !== selected
            || !selected && edges.some(edge => node.inputs.find(port => port.name === edge.to.port)?.required)) invalid();
    }
}

export const sessionJudgeOutputContract = Object.freeze({ name: 'atria_session_graph_judge', schema: { type: 'object', properties: {
    selectedResultRef: { type: 'object', properties: { runId: { type: 'string' }, resultId: { type: 'string' } },
        required: ['runId', 'resultId'], additionalProperties: false },
    reasonCode: { type: 'string', enum: ['candidate_selected'] },
}, required: ['selectedResultRef', 'reasonCode'], additionalProperties: false } });
