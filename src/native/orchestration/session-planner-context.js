import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { equalNativeDocuments, hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';
import { sessionGraphResultReadable } from './session-agent-graph-profile.js';

/** A Planner inventory is a projection of the original verified Graph. Dynamic
 * free text retains the generating Planner's Source scope; a control edge or
 * an accepted patch never grants another Actor that text. */
export async function sessionPlannerContextView(tx, handle, root, recipient, { base, plan, snapshot }) {
    const graph = cloneNativeDocument(snapshot.graph);
    const patches = (await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'patch' }))
        .filter(row => row.doc.accepted && row.doc.newGraphRevision <= snapshot.graphRevision);
    for (const row of patches) {
        const saved = await readSessionPlannerCompletion(tx, handle, root, row.doc.producerAttemptId);
        if (!saved || row.integrity !== hash(row.doc) || !equalNativeDocuments(saved.patch, row.doc)) throw new TypeError('Invalid Session Planner inventory');
        const creator = root.graph.nodes.find(node => node.nodeId === saved.producer.nodeId);
        if (sessionGraphResultReadable(base, creator, recipient, plan.dependencyPins)) continue;
        for (const operation of saved.patch.appliedOperations) {
            if (operation.op === 'addNode') {
                const index = graph.nodes.findIndex(node => node.nodeId === operation.node.nodeId);
                if (index < 0) throw new TypeError('Invalid Session Planner inventory');
                graph.nodes[index] = { nodeId: operation.node.nodeId, kind: operation.node.kind, disclosure: 'reference-only' };
            } else if (operation.op === 'addEdge') {
                const index = graph.edges.findIndex(edge => edge.edgeId === operation.edge.edgeId);
                if (index < 0) throw new TypeError('Invalid Session Planner inventory');
                graph.edges[index] = { edgeId: operation.edge.edgeId, from: { nodeId: operation.edge.from.nodeId },
                    to: { nodeId: operation.edge.to.nodeId }, disclosure: 'reference-only' };
            }
        }
    }
    return { ...snapshot, graph, dependencyPins: plan.dependencyPins };
}
