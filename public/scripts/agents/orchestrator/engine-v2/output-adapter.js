import { assertCapability } from '../../../lib/orchestration-engine/capabilities.js';
import { planIdentity } from '../../../lib/orchestration-engine/contracts.js';

/** Recheck at the host write boundary; a valid tool schema alone never authorizes publication. */
export function assertOutputAuthorized({ plan, state, generation, currentPlan = plan, assertFresh = () => {} }) {
    if (!state || state.status !== 'completed' || state.generation !== generation) throw new Error('Output run is not current and completed');
    if (state.policyState?.planFingerprint !== planIdentity(currentPlan) || planIdentity(plan) !== planIdentity(currentPlan)) throw new Error('Output plan changed');
    const output = state.output;
    if (output?.kind !== plan.output.kind || output.ownerNodeId !== plan.output.ownerNodeId) throw new Error('Output owner mismatch');
    const owner = plan.nodes.find(node => node.nodeId === output.ownerNodeId);
    assertCapability(plan, owner, plan.output.submitCapability);
    if (output.status !== 'completed' && !(plan.output.allowPartial && ['partial', 'budget_exhausted'].includes(output.status))) throw new Error('Output status cannot be submitted');
    if (plan.output.kind === 'reply' && output.status !== 'completed') throw new Error('Incomplete reply cannot be submitted');
    assertFresh();
    return output;
}

export function guidanceOutput(options) {
    const output = assertOutputAuthorized(options);
    if (output.kind !== 'guidance') throw new Error('Reply output cannot become a capsule');
    return { status: output.status, stageOutputs: [{ id: 'engine-output', mode: 'serial', nodes: [{ node: output.ownerNodeId, output: output.value }] }],
        previousNodeOutputs: new Map([[output.ownerNodeId, output.value]]), engineOutput: output };
}
