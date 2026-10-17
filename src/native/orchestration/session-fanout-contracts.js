import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { readGraphFanoutCompletion } from './graph-fanout-completion.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';

const same = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Session Fanout Join facts'); };

/** Original Session inputs/costs over the shared immutable Graph history reader.
 * No Source, recipient, Scheduler or bank permission is created here. */
export async function readSessionFanoutCompletion(tx, handle, root, joinAttemptId) {
    if (!root.graph.nodes.some(node => node.kind === 'fanout')) return null;
    if (root.parentRef !== null || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const plan = await readPlanRevision(tx, handle, root.planRef);
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId, {
        verifyMemberInput: async (_tx, _handle, _root, attempt, { frame, branch, results }) => {
            const node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId), input = attempt.inputRefs[0];
            const pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
            if (node.kind !== 'agent' || branch.scopeNodeIds.length !== 1 || branch.memberAttemptIds.length !== 1
                || branch.entryAttemptId !== attempt.attemptId || branch.memberAttemptIds[0] !== attempt.attemptId
                || attempt.inputRefs.length !== 1 || input.kind !== 'native_turn_intent' || input.nodeId !== node.nodeId || input.role !== 'narrator'
                || !same(input.planRef, root.planRef) || !['sessionId', 'branchId', 'revisionId'].every(field => input.sourceRef[field] === root.sourceBinding.sourceRef[field])
                || !same(input.routeRef, pin.resourceRef) || !same(input.acceptedGraphResultRefs, []) || input.fanoutAttemptId !== frame.fanoutAttemptId
                || attempt.inputDigest !== hash(attempt.inputRefs) || attempt.effectRefs.length > 1
                || (attempt.status === 'completed' ? results.length !== 1 : results.length !== 0)) invalid();
            assertAudienceRunCapture(root, node, plan.dependencyPins, input);
        },
        verifyMemberCost: async (_tx, _handle, _root, attempt, { settlement, results }) => {
            if (!attempt.effectRefs.length) {
                if (attempt.status !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid();
                return;
            }
            const intent = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
            const fact = await readModelCompletionReceipt(handle, tx, root, intent) ?? await readModelTerminalFact(handle, tx, root, intent);
            if (!fact || intent.capability !== 'generation.send' || intent.nodeAttemptId !== attempt.attemptId || intent.epoch !== attempt.epoch
                || !same(settlement.effectReceiptRefs, [fact.receiptRef.receiptId])
                || (attempt.status === 'completed' ? !results.length || settlement.reasonCode !== 'graph_result_published'
                    : attempt.status === 'failed' ? fact.kind !== 'rejected' || fact.outcome !== 'failed' : fact.kind !== 'late_response')) invalid();
        },
        verifyControlInput: async (_tx, _handle, _root, attempt, { frame, settlement }) => {
            const input = attempt.inputRefs[0], refs = input.acceptedControlRefs ?? [];
            assertObject(input, ['kind', 'nodeId', 'planRef', 'sourceRef', ...(refs.length ? ['acceptedControlRefs'] : [])], 'Session control input');
            if (input.kind !== 'native_session_graph_control' || input.nodeId !== attempt.nodeId || !same(input.planRef, root.planRef)
                || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(attempt.inputRefs, [input, ...refs])
                || attempt.effectiveGrantDigest !== hash({ handle, source: root.sourceBinding, inputRefs: attempt.inputRefs })
                || attempt.attemptId === frame.fanoutAttemptId && settlement.reasonCode !== 'session_fanout_join_' + settlement.outcome) invalid();
            for (const ref of refs) {
                const fact = await readSessionPlannerCompletion(tx, handle, root, ref.attemptId);
                if (!fact || !same(ref, fact.controlRef) || !root.graph.edges.some(edge => edge.from.nodeId === fact.producer.nodeId && edge.to.nodeId === attempt.nodeId)) invalid();
            }
        },
    });
}
