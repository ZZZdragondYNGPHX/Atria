import { readAttempt } from './controller-common.js';
import { readSessionReviewCompletion } from './session-review-contracts.js';
import { readSessionDelegatedFanoutCompletion } from './session-delegated-fanout-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as same } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readGraphFanoutCompletion, readGraphFanoutInput } from './graph-fanout-completion.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { readSessionJudgeCompletion, assertSessionJudgeSelections } from './session-judge-contracts.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';
import { assertSessionFanoutPlannerOperations } from './session-fanout-planner-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Session Fanout Join facts'); };

/** Original Session inputs/costs over the shared immutable Graph history reader.
 * No Source, recipient, Scheduler or bank permission is created here. */
export async function readSessionFanoutCompletion(tx, handle, root, joinAttemptId, options = {}) {
    if (!root.graph.nodes.some(node => node.kind === 'fanout')) return null;
    if (root.parentRef) return readSessionDelegatedFanoutCompletion(tx, handle, root, joinAttemptId, options);
    if (root.parentRef !== null || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId, {
        verifyMemberInput: async (_tx, _handle, _root, attempt, { frame, branch, results, reservation, settlement, graphSnapshot, plan }) => {
            if (attempt.inputState === 'reserved') {
                if (!reservation || attempt.status !== 'cancelled' || attempt.inputRefs !== null || attempt.effectiveGrantDigest !== null
                    || attempt.budgetRef !== null || attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId
                    || !branch.scopeNodeIds.includes(attempt.nodeId)) invalid();
                return;
            }
            const graph = graphSnapshot.graph, node = graph.nodes.find(node => node.nodeId === attempt.nodeId), input = attempt.inputRefs[0];
            const pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
            if (!['agent', 'planner', 'judge'].includes(node.kind) || !branch.scopeNodeIds.includes(node.nodeId) || !same(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])
                || input.kind !== 'native_turn_intent' || input.nodeId !== node.nodeId || input.role !== 'narrator'
                || !same(input.planRef, root.planRef) || !['sessionId', 'branchId', 'revisionId'].every(field => input.sourceRef[field] === root.sourceBinding.sourceRef[field])
                || !same(input.routeRef, pin.resourceRef) || input.routeIntegrity !== pin.integrity || input.fanoutAttemptId !== frame.fanoutAttemptId
                || !same(attempt.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])
                || attempt.inputDigest !== hash(attempt.inputRefs) || attempt.effectiveGrantDigest !== input.grantDigest || attempt.effectRefs.length > 1
                || (attempt.status === 'completed' ? results.length !== (['planner', 'judge'].includes(node.kind) ? 0 : 1) : results.length !== 0)) invalid();
            assertAudienceRunCapture(root, node, plan.dependencyPins, input);
            const original = (await readAttempt(tx, handle, root, frame.fanoutAttemptId)).doc.inputRefs[0];
            const inheritedRefs = Object.hasOwn(original, 'graphBindings') ? original.acceptedGraphResultRefs ?? [] : [];
            const inheritedControls = Object.hasOwn(original, 'graphBindings') ? original.acceptedControlRefs ?? [] : [];
            const inherited = [], sources = [];
            for (const ref of input.acceptedGraphResultRefs) {
                const saved = await readGraphNodeResult(tx, handle, root, ref.resultId);
                if (!saved || !same(ref, saved.receipt.resultRef) || !saved.record.envelope.audienceConstraint.nodeIds.includes(node.nodeId)) invalid();
                if (inheritedRefs.some(actual => same(actual, ref))) {
                    await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, attempt, ref, saved, { historical: true }); inherited.push(saved);
                } else { if (!branch.scopeNodeIds.includes(saved.producer.nodeId)) invalid(); sources.push(saved); }
            }
            for (const ref of input.acceptedControlRefs ?? []) {
                const saved = ref.kind === 'graph_judge_control' ? await readSessionJudgeCompletion(tx, handle, root, ref.attemptId)
                    : ref.kind === 'graph_review_control' ? await readSessionReviewCompletion(tx, handle, root, ref.attemptId)
                        : await readSessionPlannerCompletion(tx, handle, root, ref.attemptId);
                if (!saved || !same(ref, saved.controlRef) || saved.receipt.decisionSeq >= settlement.decisionSeq) invalid();
                if (inheritedControls.some(actual => same(actual, ref))) {
                    await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, attempt, ref, saved, { historical: true }); inherited.push(saved);
                } else { if (!branch.scopeNodeIds.includes(saved.producer.nodeId)) invalid(); sources.push(saved); }
            }
            if (!same(inherited.filter(fact => fact.record).map(fact => fact.receipt.resultRef), inheritedRefs)
                || !same(inherited.filter(fact => fact.controlRef).map(fact => fact.controlRef), inheritedControls)) invalid();
            if (attempt.attemptId === branch.entryAttemptId) {
                if (sources.length || Object.hasOwn(input, 'fanoutGraphBindings')) invalid();
                return;
            }
            assertSessionJudgeSelections({ ...root, graph }, node, input.acceptedGraphResultRefs, sources.filter(source => source.selectedResultRef));
            const incoming = graph.edges.filter(edge => edge.to.nodeId === node.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
            const bindings = incoming.flatMap(edge => {
                const source = sources.find(source => source.producer.nodeId === edge.from.nodeId);
                if (!source && !node.inputs.find(port => port.name === edge.to.port)?.required) return [];
                if (!source || !branch.scopeNodeIds.includes(edge.from.nodeId)) invalid();
                return [{ edgeId: edge.edgeId, producerAttemptId: source.producer.attemptId }];
            });
            const ordered = bindings.map(binding => sources.find(source => source.producer.attemptId === binding.producerAttemptId));
            if (!sources.length || !same(input.fanoutGraphBindings, bindings) || sources.length !== bindings.length
                || !same(input.acceptedGraphResultRefs, [...inheritedRefs, ...ordered.filter(source => source.record).map(source => source.receipt.resultRef)])
                || !same(input.acceptedControlRefs ?? [], [...inheritedControls, ...ordered.filter(source => source.controlRef).map(source => source.controlRef)])
                || attempt.reservationRef?.producerAttemptId !== frame.fanoutAttemptId) invalid();
            const identity = hash({ runId: root.runId, bindings, reservedAttemptId: attempt.attemptId });
            await assertOutputTransition(tx, handle, { ...root, graph }, { published: sources[0], additionalProducers: sources.slice(1), output: attempt,
                producerBindings: bindings, reservedAttemptId: attempt.attemptId, receipt: { decisionSeq: settlement.decisionSeq,
                    traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
        },
        verifyMemberCost: async (_tx, _handle, _root, attempt, { settlement, results, frame }) => {
            if (!attempt.effectRefs.length) {
                if (attempt.status !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid();
                return;
            }
            const intent = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
            const fact = await readModelCompletionReceipt(handle, tx, root, intent) ?? await readModelTerminalFact(handle, tx, root, intent);
            const planner = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'planner' && attempt.status === 'completed'
                ? await readSessionPlannerCompletion(tx, handle, root, attempt.attemptId) : null;
            if (planner) {
                if (results.length || !same(planner.producer, attempt) || !same(planner.settlement, settlement)
                    || !fact || !same(planner.receipt.modelReceiptRef, fact.receiptRef)) invalid();
                assertSessionFanoutPlannerOperations(frame, attempt, planner.patch.appliedOperations);
            }
            const judge = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'judge' && attempt.status === 'completed'
                ? await readSessionJudgeCompletion(tx, handle, root, attempt.attemptId) : null;
            if (judge && (results.length || !same(judge.producer, attempt) || !same(judge.settlement, settlement)
                || !fact || !same(judge.receipt.modelReceiptRef, fact.receiptRef))) invalid();
            if (!fact || intent.capability !== 'generation.send' || intent.nodeAttemptId !== attempt.attemptId || intent.epoch !== attempt.epoch
                || !same(settlement.effectReceiptRefs, [fact.receiptRef.receiptId])
                || (attempt.status === 'completed' ? planner || judge ? false : !results.length || settlement.reasonCode !== 'graph_result_published'
                    : attempt.status === 'failed' ? fact.kind !== 'rejected' || fact.outcome !== 'failed' : fact.kind !== 'late_response')) invalid();
        },
        verifyControlInput: async (_tx, _handle, _root, attempt, { frame, settlement }) => {
            const input = attempt.inputRefs[0], refs = input.acceptedControlRefs ?? [], resultRefs = input.acceptedGraphResultRefs ?? [];
            assertObject(input, ['kind', 'nodeId', 'planRef', 'sourceRef',
                ...Object.hasOwn(input, 'acceptedControlRefs') ? ['acceptedControlRefs'] : [],
                ...Object.hasOwn(input, 'acceptedGraphResultRefs') ? ['acceptedGraphResultRefs'] : [],
                ...Object.hasOwn(input, 'graphBindings') ? ['graphBindings'] : [],
                ...Object.hasOwn(input, 'fanoutAttemptId') ? ['fanoutAttemptId'] : []], 'Session control input');
            if (input.kind !== 'native_session_graph_control' || input.nodeId !== attempt.nodeId || !same(input.planRef, root.planRef)
                || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(attempt.inputRefs, [input, ...resultRefs, ...refs])
                || attempt.effectiveGrantDigest !== hash({ handle, source: root.sourceBinding, inputRefs: attempt.inputRefs })
                || attempt.attemptId === frame.fanoutAttemptId && settlement.reasonCode !== 'session_fanout_join_' + settlement.outcome
                || input.fanoutAttemptId && input.fanoutAttemptId !== frame.fanoutAttemptId) invalid();
            const facts = [];
            for (const ref of resultRefs) {
                const fact = await readGraphNodeResult(tx, handle, root, ref.resultId);
                if (!fact || !same(ref, fact.receipt.resultRef)) invalid(); facts.push(fact);
            }
            for (const ref of refs) {
                const fact = ref.kind === 'graph_review_control' ? await readSessionReviewCompletion(tx, handle, root, ref.attemptId)
                    : ref.kind === 'graph_judge_control' ? await readSessionJudgeCompletion(tx, handle, root, ref.attemptId)
                        : await readSessionPlannerCompletion(tx, handle, root, ref.attemptId);
                if (!fact || !same(ref, fact.controlRef) || !root.graph.edges.some(edge => edge.from.nodeId === fact.producer.nodeId && edge.to.nodeId === attempt.nodeId)) invalid();
                facts.push(fact);
            }
            if (Object.hasOwn(input, 'graphBindings')) {
                if (!Array.isArray(input.graphBindings) || !input.graphBindings.length || input.graphBindings.some(binding => !facts.some(fact => fact.producer.attemptId === binding.producerAttemptId))) invalid();
                const identity = hash({ runId: root.runId, bindings: input.graphBindings, reservedAttemptId: null });
                await assertOutputTransition(tx, handle, root, { published: facts[0], additionalProducers: facts.slice(1), output: attempt,
                    producerBindings: input.graphBindings, receipt: { decisionSeq: settlement.decisionSeq,
                        traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
            } else if (resultRefs.length) invalid();
        },
    });
}
