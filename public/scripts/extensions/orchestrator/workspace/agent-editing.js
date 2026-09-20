/** Remove an agent without changing the identities of surviving definitions. */
export function removeWorkspaceAgent(preset, agentId) {
    const next = structuredClone(preset), plan = next.planTemplate;
    const nodes = plan.nodes.filter(node => node.agentId === agentId);
    if (nodes.length !== 1 || nodes[0].kind !== 'agent') throw new Error('Edit shared or structural nodes in the advanced graph editor.');
    const node = nodes[0];
    if (plan.nodes.filter(item => item.kind === 'agent').length <= 1
        || (next.mode !== 'spec' && [plan.entryNodeId, plan.output.ownerNodeId].includes(node.nodeId))) {
        throw new Error('The entry agent and output owner must be retained.');
    }
    const incoming = plan.edges.filter(edge => edge.to === node.nodeId);
    const outgoing = plan.edges.filter(edge => edge.from === node.nodeId);
    if (next.mode === 'spec' && ([...incoming, ...outgoing].some(edge => edge.maxVisits || edge.condition && edge.condition !== 'always')
        || plan.nodes.some(item => item.inputs?.includes(node.nodeId)))) {
        throw new Error('Repair conditional edges and join inputs in the advanced graph editor before deleting this agent.');
    }
    plan.nodes = plan.nodes.filter(item => item !== node);
    plan.agents = plan.agents.filter(agent => agent.id !== agentId);
    plan.edges = plan.edges.filter(edge => edge.from !== node.nodeId && edge.to !== node.nodeId);
    for (const agent of plan.agents) agent.handoffs = (agent.handoffs || []).filter(id => id !== agentId);
    if (next.mode === 'spec') {
        for (const before of incoming) for (const after of outgoing) {
            if (!plan.edges.some(edge => edge.from === before.from && edge.to === after.to)) {
                plan.edges.push({ edgeId: `delete:${node.nodeId}:${before.edgeId}:${after.edgeId}`, from: before.from, to: after.to, condition: 'always' });
            }
        }
        if (plan.entryNodeId === node.nodeId) {
            if (outgoing.length !== 1) throw new Error('Choose a new entry node before deleting this agent.');
            plan.entryNodeId = outgoing[0].to;
        }
        if (plan.output.ownerNodeId === node.nodeId) {
            const replacement = incoming.map(edge => plan.nodes.find(item => item.nodeId === edge.from))
                .find(item => item?.kind === 'agent' && item.metadata?.nodeSpec?.type !== 'review');
            if (!replacement) throw new Error('Choose a new output owner before deleting this agent.');
            plan.output.ownerNodeId = replacement.nodeId;
        }
        const stages = [...new Set(plan.nodes.filter(item => Number.isInteger(item.metadata?.stageIndex)).map(item => item.metadata.stageIndex))].sort((a, b) => a - b);
        const counts = new Map();
        for (const item of plan.nodes) {
            if (!Number.isInteger(item.metadata?.stageIndex)) continue;
            const stage = stages.indexOf(item.metadata.stageIndex);
            item.metadata.stageIndex = stage;
            item.metadata.nodeIndex = counts.get(stage) || 0;
            counts.set(stage, item.metadata.nodeIndex + 1);
        }
        const finalStage = plan.nodes.find(item => item.nodeId === plan.output.ownerNodeId)?.metadata?.stageIndex;
        for (const item of plan.nodes) if (Number.isInteger(item.metadata?.stageIndex)) item.metadata.isFinalStage = item.metadata.stageIndex === finalStage;
    }
    if (next.mode === 'agenda') {
        plan.scheduler.workerAgentIds = plan.scheduler.workerAgentIds.filter(id => id !== agentId);
        delete plan.scheduler.workerNodeIds[agentId];
    }
    return next;
}
