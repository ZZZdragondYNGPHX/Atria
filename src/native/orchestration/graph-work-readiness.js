/** Read-only dependency ordering. Completion labels are Host observations,
 * never Result, Source, budget or execution grants. Consumers must revalidate
 * every returned edge through the original controllers before dispatch. */
export function inspectGraphReadiness(graph, nodeControl, completionByNodeId, { excludeNodeIds = [] } = {}) {
    const excluded = new Set(excludeNodeIds), ready = [], waiting = [], blocked = [];
    for (const node of graph.nodes) {
        if (excluded.has(node.nodeId) || completionByNodeId[node.nodeId]) continue;
        const control = nodeControl[node.nodeId];
        if (control?.disposition !== 'eligible') {
            blocked.push({ nodeId: node.nodeId, reason: control?.disposition ?? 'unavailable' }); continue;
        }
        const incoming = graph.edges.filter(edge => edge.to.nodeId === node.nodeId && !edge.loopBack);
        const edges = [], missing = [], unavailable = [];
        for (const edge of incoming) {
            const source = completionByNodeId[edge.from.nodeId], port = node.inputs.find(port => port.name === edge.to.port);
            const disposition = nodeControl[edge.from.nodeId]?.disposition;
            if (!source && disposition === 'cancelled' && !port.required) continue;
            if (!source) {
                if (['cancelled', 'blocked'].includes(disposition)) unavailable.push(edge.edgeId);
                else missing.push(edge.edgeId);
                continue;
            }
            const matched = edge.condition === 'always' || edge.condition === 'success' && source === 'completed'
                || edge.condition === 'failure' && ['failed', 'cancelled', 'stale'].includes(source);
            if (matched) edges.push(edge);
            else if (port.required) unavailable.push(edge.edgeId);
        }
        for (const port of node.inputs.filter(port => port.required)) {
            if (!incoming.some(edge => edge.to.port === port.name)) unavailable.push(port.name);
        }
        if (unavailable.length) blocked.push({ nodeId: node.nodeId, reason: 'dependency_unavailable', dependencies: unavailable });
        else if (missing.length || !incoming.length && !graph.entryNodeIds.includes(node.nodeId)) waiting.push({ nodeId: node.nodeId, dependencies: missing });
        else ready.push({ node, edges: edges.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId)) });
    }
    ready.sort((a, b) => (nodeControl[b.node.nodeId].priority ?? 0) - (nodeControl[a.node.nodeId].priority ?? 0) || a.node.nodeId.localeCompare(b.node.nodeId));
    return { ready, waiting, blocked };
}
