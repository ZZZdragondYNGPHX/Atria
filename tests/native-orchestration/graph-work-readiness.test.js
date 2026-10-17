import { inspectGraphReadiness } from '../../src/native/orchestration/graph-work-readiness.js';

const fixture = () => {
    const nodes = ['root', 'left', 'right', 'final'].map(nodeId => ({ nodeId, inputs: nodeId === 'root' ? [] : [{ name: 'input', required: true }] }));
    nodes[3].inputs = [{ name: 'left', required: true }, { name: 'right', required: false }];
    const edge = (from, to, port, condition = 'success') => ({ edgeId: from + ':' + to, from: { nodeId: from }, to: { nodeId: to, port }, condition, loopBack: false });
    const graph = { nodes, entryNodeIds: ['root'], edges: [edge('root', 'left', 'input'), edge('root', 'right', 'input'), edge('left', 'final', 'left'), edge('right', 'final', 'right')] };
    const control = Object.fromEntries(nodes.map(node => [node.nodeId, { disposition: 'eligible', priority: 0 }]));
    return { graph, control };
};

test('published dependencies, connected optional work and stable priority determine readiness without modifying inputs', () => {
    const { graph, control } = fixture(), before = structuredClone({ graph, control });
    expect(inspectGraphReadiness(graph, control, {}).ready.map(item => item.node.nodeId)).toEqual(['root']);
    control.right.priority = 7;
    const result = inspectGraphReadiness(graph, control, { root: 'completed' });
    expect(result.ready.map(item => item.node.nodeId)).toEqual(['right', 'left']);
    expect(result.ready[0].edges.map(edge => edge.edgeId)).toEqual(['root:right']);
    expect(inspectGraphReadiness(graph, control, { root: 'completed', left: 'completed' }).ready.map(item => item.node.nodeId)).toEqual(['right']);
    expect(graph).toEqual(before.graph); expect(control.left).toEqual(before.control.left);
});

test('cancelled optional work may be absent; required cancellation and unmatched failure remain blocked', () => {
    const { graph, control } = fixture(); control.right.disposition = 'cancelled';
    expect(inspectGraphReadiness(graph, control, { root: 'completed', left: 'completed' }).ready.map(item => item.node.nodeId)).toEqual(['final']);
    control.left.disposition = 'cancelled';
    expect(inspectGraphReadiness(graph, control, { root: 'completed' }).blocked.find(item => item.nodeId === 'final').reason).toBe('dependency_unavailable');
    expect(inspectGraphReadiness(graph, control, { root: 'failed' }).blocked.filter(item => ['left', 'right'].includes(item.nodeId))).toHaveLength(2);
});
