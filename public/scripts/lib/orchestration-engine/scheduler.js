/** Stable ordering: priority then author order. No model call for deterministic routing. */
export function selectReadyNodes(plan, state) {
    const done = new Set(state.completedNodeIds);
    const active = new Set(state.activeNodeIds || []);
    return plan.nodes.filter(node => {
        if (done.has(node.nodeId) || active.has(node.nodeId)) return false;
        if (node.nodeId === plan.entryNodeId) return true;
        const incoming = plan.edges.filter(edge => edge.to === node.nodeId);
        if (!incoming.length) return false;
        const matches = edge => {
            const result = state.results.filter(result => result.nodeId === edge.from).at(-1);
            return done.has(edge.from) && (!edge.condition || edge.condition === 'always'
                || edge.condition === result?.status || edge.condition === result?.structured?.decision);
        };
        if (node.kind === 'join') return node.inputs.every(id => done.has(id)) && incoming.every(matches);
        return node.inputPolicy?.join === 'any' ? incoming.some(matches) : incoming.every(matches);
    }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function routeEdges(plan, nodeId, result, visits = {}) {
    return plan.edges.filter(edge => edge.from === nodeId && (!edge.maxVisits || (visits[edge.edgeId] || 0) < edge.maxVisits)
        && (!edge.condition || edge.condition === 'always' || edge.condition === result.status || edge.condition === result.structured?.decision))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
