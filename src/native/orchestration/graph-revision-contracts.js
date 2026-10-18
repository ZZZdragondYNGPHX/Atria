import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { cloneNativeDocument, hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter, assertPlanDefinition } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, readAttempt } from './controller-common.js';

export const graphPatchHash = patch => hash(Object.fromEntries(Object.entries(patch).filter(([field]) => field !== 'payloadHash')));
const invalid = () => { throw Object.assign(new Error('Durable graph history requires integrity review'), { code: 'native_orchestration_graph_history_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);
const replayContents = new WeakMap();
const replayCopies = snapshots => new Map([...snapshots].map(([revision, snapshot]) => [revision, cloneNativeDocument(snapshot)]));

/** Replay original accepted patch facts, never issue a producer or Result grant.
 * Later edges appear only in their own revision, not an earlier publication. */
export async function readTaskGraphRevision(tx, handle, root, graphRevision = root.graphRevision) {
    return (await readTaskGraphRevisions(tx, handle, root, [graphRevision])).get(graphRevision);
}

/** Reconstruct several requested revisions in one complete original replay.
 * All Plan, patch, producer, command and final Root checks still execute; the
 * returned snapshots are independent data and cannot authorize a consumer. */
export async function readTaskGraphRevisions(tx, handle, root, graphRevisions) {
    const requested = new Set(graphRevisions);
    for (const revision of requested) {
        assertCounter(revision, 'graphRevision');
        if (revision > root.graphRevision) invalid();
    }
    const plan = await readPlanRevision(tx, handle, root.planRef);
    const rows = await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'patch' });
    rows.sort((a, b) => a.doc.decisionSeq - b.doc.decisionSeq);
    const facts = [];
    for (const row of rows) {
        const receipt = row.doc;
        if (row.integrity !== hash(receipt) || row.key.recordId !== receipt.patchId) invalid();
        const producer = (await readAttempt(tx, handle, root, receipt.producerAttemptId)).doc;
        const commandId = controlCommandId('graph.patch', receipt.patchId);
        const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
        facts.push({ receipt, producer, command, commandId });
    }
    // Only identical pure replay/schema work is reused in this transaction.
    // Every invocation still reads and checks the original Plan, all patch
    // envelopes, producers and commands above. Rehashed edits or any Root
    // change require the entire original replay again; no permission is saved.
    const contentKey = hash({ handle, root: hash(root), plan: hash(plan), revisions: [...requested].sort((a, b) => a - b),
        facts: facts.map(({ receipt, producer, command }) => [hash(receipt), hash(producer), command ? hash(command) : null]) });
    const memo = replayContents.get(tx);
    if (memo?.entries.has(contentKey)) return replayCopies(memo.entries.get(contentKey).snapshots);
    const graph = cloneNativeDocument(plan.definition);
    const nodeControl = Object.fromEntries(graph.nodes.map(node => [node.nodeId, { disposition: 'eligible', priority: 0, reasonCode: null }]));
    let revision = 0, decisionSeq = 0;
    const selected = new Map();
    if (requested.has(0)) selected.set(0, { graph: cloneNativeDocument(graph), nodeControl: cloneNativeDocument(nodeControl), graphRevision: 0 });
    for (const { receipt, producer, command, commandId } of facts) {
        assertObject(receipt, ['schemaVersion', 'patchId', 'runId', 'payloadHash', 'semanticHash', 'producerAttemptId', 'previousGraphRevision', 'producerInputDigest',
            'sourceBindingDigest', 'reasonRefs', 'appliedOperations', 'accepted', 'newGraphRevision', 'issues', 'decisionSeq', 'requests'], 'Graph patch receipt');
        assertCounter(receipt.decisionSeq, 'decisionSeq', 1);
        if (receipt.schemaVersion !== 1 || receipt.runId !== root.runId || typeof receipt.accepted !== 'boolean'
            || receipt.decisionSeq <= decisionSeq || receipt.decisionSeq > root.eventSeq || receipt.previousGraphRevision !== revision
            || receipt.newGraphRevision !== revision + Number(receipt.accepted) || receipt.producerInputDigest !== producer.inputDigest
            || receipt.sourceBindingDigest !== producer.sourceBindingDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || !Array.isArray(receipt.appliedOperations) || !Array.isArray(receipt.reasonRefs) || !Array.isArray(receipt.issues)
            || !command || command.schemaVersion !== 1 || command.operation !== 'runs.control.graph.patch' || command.commandId !== commandId || command.target !== root.runId
            || !equal(command.outcome?.patchReceipt, receipt) || command.outcome.runId !== root.runId || command.outcome.versions?.graphRevision !== receipt.newGraphRevision
            || command.outcome.versions?.epoch !== producer.epoch || producer.epoch > root.epoch) invalid();
        decisionSeq = receipt.decisionSeq;
        if (!receipt.accepted) {
            if (receipt.appliedOperations.length || !receipt.issues.length || !equal(receipt.requests, { finalize: false, replan: false })) invalid();
            continue;
        }
        const patch = { schemaVersion: 1, patchId: receipt.patchId, runId: root.runId, producerAttemptId: producer.attemptId,
            expectedEpoch: producer.epoch, expectedGraphRevision: revision, operations: receipt.appliedOperations, reasonRefs: receipt.reasonRefs, payloadHash: receipt.payloadHash };
        if (!patch.operations.length || receipt.issues.length || graphPatchHash(patch) !== receipt.payloadHash
            || receipt.semanticHash !== hash({ producerAttemptId: producer.attemptId, inputDigest: producer.inputDigest, sourceBindingDigest: producer.sourceBindingDigest,
                operations: patch.operations, reasonRefs: patch.reasonRefs })
            || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'graph.patch', detail: patch } })) invalid();
        const requests = { finalize: false, replan: false };
        for (const operation of patch.operations) {
            if (!plan.definition.graphChangePolicy.allowedOperations.includes(operation.op)) invalid();
            if (operation.op === 'addNode') {
                assertObject(operation, ['op', 'node'], 'addNode');
                if (graph.nodes.some(node => node.nodeId === operation.node.nodeId) || !graph.graphChangePolicy.allowedNodeKinds.includes(operation.node.kind)) invalid();
                graph.nodes.push(cloneNativeDocument(operation.node));
                nodeControl[operation.node.nodeId] = { disposition: 'eligible', priority: 0, reasonCode: null };
            } else if (operation.op === 'addEdge') {
                assertObject(operation, ['op', 'edge'], 'addEdge');
                if (graph.edges.some(edge => edge.edgeId === operation.edge.edgeId)) invalid();
                graph.edges.push(cloneNativeDocument(operation.edge));
            } else if (['setPendingPriority', 'cancelPending', 'markBlocked'].includes(operation.op)) {
                assertObject(operation, operation.op === 'setPendingPriority' ? ['op', 'nodeId', 'priority'] : ['op', 'nodeId'], operation.op);
                const control = nodeControl[operation.nodeId];
                if (!control || operation.nodeId === graph.outputContract.ownerNodeId && operation.op !== 'setPendingPriority') invalid();
                if (operation.op === 'setPendingPriority') { assertCounter(operation.priority, 'priority'); control.priority = operation.priority; } else { control.disposition = operation.op === 'cancelPending' ? 'cancelled' : 'blocked'; control.reasonCode = 'graph_' + operation.op; }
            } else if (operation.op === 'requestFinalize') {
                assertObject(operation, ['op'], operation.op); requests.finalize = true;
            } else if (operation.op === 'requestReplan') {
                assertObject(operation, ['op'], operation.op); requests.replan = true;
            } else invalid();
        }
        if (!equal(receipt.requests, requests)) invalid();
        assertPlanDefinition(graph, plan.dependencyPins);
        revision++;
        if (requested.has(revision)) selected.set(revision, { graph: cloneNativeDocument(graph), nodeControl: cloneNativeDocument(nodeControl), graphRevision: revision });
    }
    if (revision !== root.graphRevision || root.progress.patches !== revision || !equal(graph, root.graph) || !equal(nodeControl, root.nodeControl) || selected.size !== requested.size) invalid();
    const bytes = Buffer.byteLength(JSON.stringify([...selected]));
    if (bytes <= 4 * 1024 * 1024) {
        const current = memo ?? { entries: new Map(), bytes: 0 };
        while (current.entries.size && (current.entries.size >= 4 || current.bytes + bytes > 4 * 1024 * 1024)) {
            const oldest = current.entries.keys().next().value;
            current.bytes -= current.entries.get(oldest).bytes; current.entries.delete(oldest);
        }
        current.entries.set(contentKey, { snapshots: selected, bytes }); current.bytes += bytes;
        replayContents.set(tx, current);
        return replayCopies(selected);
    }
    return selected;
}
