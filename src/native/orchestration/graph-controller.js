import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertObject, assertCounter, assertDigest, assertPlanDefinition } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { graphPatchHash, readTaskGraphRevision } from './graph-revision-contracts.js';

const issue = (code, detail = {}) => Object.assign(new TypeError(code), { code, ...detail });
const PATCH_PRODUCER_KINDS = Object.freeze(['planner', 'agent', 'review']);

/** Pure built-in mechanism evidence. Source/producer authorization remains live. */
export function validateGraphPatchCapability({ definition }) {
    const nodes = definition.nodes.filter(node => node.capabilities.includes('graph.patch'));
    const valid = nodes.length > 0 && definition.graphChangePolicy.allowedOperations.length > 0 && nodes.every(node => PATCH_PRODUCER_KINDS.includes(node.kind));
    return { evidence: [{ capability: 'graph.patch', status: valid ? 'available' : 'invalid', authority: 'native_graph_controller',
        graphPolicyDigest: hashNativeDocument(definition.graphChangePolicy), runtimePrincipal: 'original_native_graph_producer_required' }],
    issues: valid ? [] : [{ code: 'native_orchestration_graph_patch_policy_required', severity: 'blocking', fieldPath: 'capabilityCeiling.graph.patch' }] };
}

function assertProposal(patch) {
    assertObject(patch, ['schemaVersion', 'patchId', 'runId', 'producerAttemptId', 'expectedEpoch', 'expectedGraphRevision', 'operations', 'reasonRefs', 'payloadHash'], 'GraphPatch');
    if (patch.schemaVersion !== 1) throw new TypeError('Unsupported GraphPatch schema');
    assertNativeId(patch.patchId, 'orchestrationPatch'); assertNativeId(patch.runId, 'orchestrationRun'); assertNativeId(patch.producerAttemptId, 'orchestrationAttempt');
    assertCounter(patch.expectedEpoch, 'expectedEpoch'); assertCounter(patch.expectedGraphRevision, 'expectedGraphRevision');
    assertDigest(patch.payloadHash, 'payloadHash');
    if (graphPatchHash(patch) !== patch.payloadHash || !Array.isArray(patch.operations) || !patch.operations.length || !Array.isArray(patch.reasonRefs)) throw new TypeError('Invalid GraphPatch payload');
    for (const ref of patch.reasonRefs) {
        if (ref?.kind === 'result') { assertObject(ref, ['kind', 'resultId'], 'reasonRef'); assertNativeId(ref.resultId, 'orchestrationResult'); } else if (ref?.kind === 'source') { assertObject(ref, ['kind', 'bindingDigest'], 'reasonRef'); assertDigest(ref.bindingDigest, 'bindingDigest'); } else throw new TypeError('Unsupported GraphPatch reason reference');
    }
}

/** G2 proposals are data. Only this Host-controlled whole-patch transaction writes topology. */
export class GraphController {
    constructor({ runs, authorizePatch }) {
        if (!runs || typeof authorizePatch !== 'function') throw new TypeError('GraphController requires original source/grant checks');
        Object.assign(this, { runs, authorizePatch });
    }

    async propose(handle, input) {
        assertObject(input, ['expectedStateVersion', 'patch'], 'propose');
        const patch = cloneNativeDocument(input.patch);
        assertProposal(patch); assertCounter(input.expectedStateVersion, 'expectedStateVersion');
        return this.runs.control(handle, controlCommandId('graph.patch', patch.patchId), {
            runId: patch.runId, expectedEpoch: patch.expectedEpoch, expectedStateVersion: input.expectedStateVersion, expectedGraphRevision: patch.expectedGraphRevision,
            operation: 'graph.patch', detail: patch,
        }, async ({ tx, root, plan, now, deny }) => {
            const stepCost = patch.operations.length;
            if (root.progress.steps + stepCost > root.limits.maxSteps || now >= root.progress.deadlineAt) throw issue('native_orchestration_limit_exhausted');
            const candidate = cloneNativeDocument(root), issues = [], updates = new Map(), requests = { finalize: false, replan: false }, stamp = hashNativeDocument(root);
            const producerRecord = await readAttempt(tx, handle, root, patch.producerAttemptId), producer = producerRecord.doc;
            await readTaskGraphRevision(tx, handle, root);
            const semanticHash = hashNativeDocument({ producerAttemptId: producer.attemptId, inputDigest: producer.inputDigest, sourceBindingDigest: producer.sourceBindingDigest, operations: patch.operations, reasonRefs: patch.reasonRefs });
            const prior = await tx.listResources({ kind: K.orchestrationRecord, handle, runId: root.runId, recordType: 'patch' });
            try {
                const node = root.graph.nodes.find(item => item.nodeId === producer.nodeId);
                if (root.cancelRequested || root.status !== 'running' || producer.status !== 'running' || producer.epoch !== root.epoch
                    || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || !PATCH_PRODUCER_KINDS.includes(node.kind)
                    || !node.capabilities.includes('graph.patch')) throw issue('native_orchestration_patch_denied');
                await this.authorizePatch({ handle, tx, root, producer, patch });
                if (hashNativeDocument(await this.runs.get(handle, root.runId)) !== stamp) return deny(issue('native_orchestration_patch_denied'));
                if (root.progress.patches >= root.limits.maxPatches) throw issue('native_orchestration_limit_exhausted');
                if (prior.some(record => record.doc.semanticHash === semanticHash)) throw issue('native_orchestration_patch_no_progress');
                for (const operation of patch.operations) {
                    if (!root.graph.graphChangePolicy.allowedOperations.includes(operation?.op)) throw issue('native_orchestration_patch_operation_denied');
                    if (operation.op === 'addNode') {
                        assertObject(operation, ['op', 'node'], 'addNode');
                        const added = operation.node;
                        assertNativeId(added?.nodeId, 'orchestrationNode');
                        if (candidate.graph.nodes.some(item => item.nodeId === added.nodeId)) throw issue('native_orchestration_patch_duplicate_node', { nodeId: added.nodeId });
                        if (!root.graph.graphChangePolicy.allowedNodeKinds.includes(added.kind)) throw issue('native_orchestration_patch_kind_denied', { nodeId: added.nodeId });
                        candidate.graph.nodes.push(added);
                        candidate.nodeControl[added.nodeId] = { disposition: 'eligible', priority: 0, reasonCode: null };
                    } else if (operation.op === 'addEdge') {
                        assertObject(operation, ['op', 'edge'], 'addEdge');
                        const edge = operation.edge;
                        if (candidate.graph.edges.some(item => item.edgeId === edge.edgeId)) throw issue('native_orchestration_patch_duplicate_edge', { edgeId: edge.edgeId });
                        for (const attemptId of root.attemptRefs) {
                            const { doc } = await readAttempt(tx, handle, root, attemptId);
                            if (doc.nodeId === edge.to?.nodeId && (doc.inputState !== 'reserved' || !['reserved', 'blocked'].includes(doc.status))) throw issue('native_orchestration_patch_frozen_input', { nodeId: doc.nodeId });
                        }
                        candidate.graph.edges.push(edge);
                    } else if (['setPendingPriority', 'cancelPending', 'markBlocked'].includes(operation.op)) {
                        assertObject(operation, operation.op === 'setPendingPriority' ? ['op', 'nodeId', 'priority'] : ['op', 'nodeId'], operation.op);
                        const target = candidate.nodeControl[operation.nodeId];
                        if (!target) throw issue('native_orchestration_patch_missing_node', { nodeId: operation.nodeId });
                        if (root.graph.outputContract.ownerNodeId === operation.nodeId && operation.op !== 'setPendingPriority') throw issue('native_orchestration_output_owner_protected');
                        for (const attemptId of root.attemptRefs) {
                            const record = await readAttempt(tx, handle, root, attemptId), attempt = record.doc;
                            if (attempt.nodeId !== operation.nodeId) continue;
                            if (!['pending', 'reserved'].includes(attempt.status) || attempt.effectRefs.length) throw issue('native_orchestration_patch_not_pending', { nodeId: operation.nodeId });
                            if (operation.op !== 'setPendingPriority') updates.set(attemptId, { record, doc: { ...attempt, status: operation.op === 'cancelPending' ? 'cancelled' : 'blocked', endedAt: operation.op === 'cancelPending' ? now : null, reasonCode: 'graph_' + operation.op } });
                        }
                        if (operation.op === 'setPendingPriority') { assertCounter(operation.priority, 'priority'); target.priority = operation.priority; } else { target.disposition = operation.op === 'cancelPending' ? 'cancelled' : 'blocked'; target.reasonCode = 'graph_' + operation.op; }
                    } else if (operation.op === 'requestFinalize') {
                        assertObject(operation, ['op'], 'requestFinalize'); requests.finalize = true;
                    } else if (operation.op === 'requestReplan') {
                        assertObject(operation, ['op'], 'requestReplan');
                        if (candidate.progress.replans >= root.limits.maxReplans) throw issue('native_orchestration_limit_exhausted');
                        candidate.progress.replans++; requests.replan = true;
                    }
                }
                assertPlanDefinition(candidate.graph, plan.dependencyPins);
                const reachable = new Set(), pending = [...candidate.graph.entryNodeIds];
                while (pending.length) {
                    const id = pending.pop();
                    if (reachable.has(id) || candidate.nodeControl[id].disposition === 'cancelled') continue;
                    reachable.add(id);
                    pending.push(...candidate.graph.edges.filter(edge => edge.from.nodeId === id).map(edge => edge.to.nodeId));
                }
                if (!reachable.has(candidate.graph.outputContract.ownerNodeId)) throw issue('native_orchestration_patch_removes_output_path');
                if (!requests.finalize && !requests.replan && hashNativeDocument({ graph: candidate.graph, control: candidate.nodeControl }) === hashNativeDocument({ graph: root.graph, control: root.nodeControl })) throw issue('native_orchestration_patch_no_progress');
                await this.authorizePatch({ handle, tx, root, producer, patch });
                if (hashNativeDocument(await this.runs.get(handle, root.runId)) !== stamp) return deny(issue('native_orchestration_patch_denied'));
            } catch (error) {
                if (!(error instanceof TypeError) && error.name !== 'ConflictError') throw error;
                if (hashNativeDocument(await this.runs.get(handle, root.runId)) !== stamp) return deny(error);
                issues.push({ code: error.code ?? 'native_orchestration_graph_invalid', ...(error.nodeId ? { nodeId: error.nodeId } : {}), ...(error.edgeId ? { edgeId: error.edgeId } : {}) });
            }
            const accepted = issues.length === 0;
            const next = accepted ? candidate : root;
            next.progress.steps += stepCost;
            if (accepted) {
                next.graphRevision++; next.progress.patches++;
                for (const update of updates.values()) {
                    if (update.doc.status === 'cancelled') await writeAttemptSettlement({ tx, handle, root, record: update.record, outcome: 'cancelled', resultRefs: [], effectReceiptRefs: [], reasonCode: update.doc.reasonCode, now });
                    else await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', update.doc.attemptId), update.doc, { expectedIntegrity: update.record.integrity });
                }
            }
            const receipt = { schemaVersion: 1, patchId: patch.patchId, runId: root.runId, payloadHash: patch.payloadHash, semanticHash, producerAttemptId: producer.attemptId,
                previousGraphRevision: root.graphRevision, producerInputDigest: producer.inputDigest, sourceBindingDigest: producer.sourceBindingDigest, reasonRefs: patch.reasonRefs,
                appliedOperations: accepted ? patch.operations : [],
                accepted, newGraphRevision: next.graphRevision, issues, decisionSeq: root.eventSeq + 1, requests: accepted ? requests : { finalize: false, replan: false } };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'patch', patch.patchId), receipt);
            return { root: next, eventType: accepted ? 'graph_patch_accepted' : 'graph_patch_rejected', reasonCode: accepted ? null : issues[0].code, outcome: { patchReceipt: receipt } };
        });
    }
}
